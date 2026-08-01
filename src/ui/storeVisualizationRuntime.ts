import { loadBrowserScenario } from "./browserScenario.js";
import {
  buildStoreVisualization,
  type CustomerStage,
  type StaffActivity,
  type StoreVisualizationInput,
  type StoreVisualizationModel,
} from "./storeVisualization.js";
import "./storeVisualization.css";

const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  entering: "入店",
  browsing: "商品を選んでいる",
  searching: "商品を探している",
  waiting: "レジ待ち",
  leaving: "退店",
  passing: "閉店後に通過",
  checking_clock: "待ち時間を気にしている",
};

const STAFF_ACTIVITY_LABELS: Record<StaffActivity, string> = {
  register: "レジ対応",
  replenishment: "品出し・補充",
  cleaning: "清掃",
  delivery_receiving: "納品受入",
  admin: "発注・記録",
};

const HABIT_TO_BLOCK: Record<string, keyof StoreVisualizationInput["regionalAdoption"]> = {
  "朝食購入": "morning",
  "外部昼食調達": "midday",
  "少量即時購入": "afternoon",
  "夜間買い物": "evening",
};

const VALID_STAFF_ACTIVITIES = new Set<StaffActivity>([
  "register",
  "replenishment",
  "cleaning",
  "delivery_receiving",
  "admin",
]);

function elementText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? "";
}

function parseNumber(text: string): number {
  const normalized = text.replaceAll(",", "").replaceAll("−", "-");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function parseDay(): number {
  return Math.max(1, Math.round(parseNumber(elementText("day-label"))));
}

function parseSlot(): number {
  const text = elementText("time-label");
  const [hoursText, minutesText] = text.split(":");
  const hours = Number.parseInt(hoursText ?? "6", 10);
  const minutes = Number.parseInt(minutesText ?? "0", 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(71, (hours - 6) * 4 + Math.floor(minutes / 15)));
}

function blockForSlot(slot: number): "morning" | "midday" | "afternoon" | "evening" {
  const hour = 6 + slot / 4;
  if (hour < 10) return "morning";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  return "evening";
}

function readRegionalAdoption(): StoreVisualizationInput["regionalAdoption"] {
  const adoption: StoreVisualizationInput["regionalAdoption"] = {};
  for (const card of document.querySelectorAll<HTMLElement>("#regional-report .habit-card")) {
    const label = card.querySelector("h3")?.textContent?.trim() ?? "";
    const block = HABIT_TO_BLOCK[label];
    if (!block) continue;
    const regionalLine = [...card.querySelectorAll<HTMLElement>(".habit-values span")].find((line) =>
      line.textContent?.includes("地域定着"),
    );
    adoption[block] = Math.max(0, Math.min(1, parseNumber(regionalLine?.textContent ?? "") / 100));
  }
  return adoption;
}

function readPriorities(): StaffActivity[] {
  const priorities: StaffActivity[] = [];
  for (let index = 0; index < 5; index += 1) {
    const value = (document.getElementById(`priority-${index}`) as HTMLSelectElement | null)?.value;
    if (value && VALID_STAFF_ACTIVITIES.has(value as StaffActivity)) {
      priorities.push(value as StaffActivity);
    }
  }
  return priorities.length > 0
    ? priorities
    : ["register", "replenishment", "cleaning", "delivery_receiving", "admin"];
}

function readInput(): StoreVisualizationInput {
  const slot = parseSlot();
  const timeBlock = blockForSlot(slot);
  const staffInput = document.getElementById(`staff-${timeBlock}`) as HTMLInputElement | null;
  const badge = document.getElementById("store-open-badge");
  return {
    day: parseDay(),
    slot,
    isOpen: badge?.classList.contains("open") ?? false,
    queueCustomers: parseNumber(elementText("queue-metric")),
    shelfStockoutUnits: parseNumber(elementText("shelf-metric")),
    backroomInventoryUnits: parseNumber(elementText("inventory-metric")),
    workBacklog: parseNumber(elementText("backlog-metric")),
    visitsToday: parseNumber(elementText("visit-metric")),
    abandonedCustomers: parseNumber(elementText("abandon-kpi")),
    wasteCost: parseNumber(elementText("waste-kpi")),
    regionalAdoption: readRegionalAdoption(),
    currentStaff: Math.max(1, Math.min(4, Number.parseInt(staffInput?.value ?? "1", 10) || 1)),
    taskPriorities: readPriorities(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function customerMarkup(model: StoreVisualizationModel): string {
  return model.customers
    .map(
      (customer) => `
        <div
          class="floor-person customer customer-${customer.stage}${customer.regular ? " regular" : ""}${customer.dissatisfied ? " dissatisfied" : ""}"
          style="left:${customer.x}%;top:${customer.y}%;--agent-delay:${customer.delayMs}ms"
          title="${escapeHtml(customer.cohortLabel)}：${escapeHtml(CUSTOMER_STAGE_LABELS[customer.stage])}"
          aria-label="${escapeHtml(customer.cohortLabel)}、${escapeHtml(CUSTOMER_STAGE_LABELS[customer.stage])}${customer.regular ? "、常連" : ""}"
        >
          <span class="person-head"></span>
          <span class="person-body"></span>
          ${customer.regular ? '<span class="regular-mark" aria-hidden="true">★</span>' : ""}
          ${customer.stage === "checking_clock" ? '<span class="clock-mark" aria-hidden="true">◷</span>' : ""}
          ${customer.dissatisfied ? '<span class="thought-mark" aria-hidden="true">?</span>' : ""}
        </div>
      `,
    )
    .join("");
}

function staffMarkup(model: StoreVisualizationModel): string {
  return model.staff
    .map(
      (staff) => `
        <div
          class="floor-person staff staff-${staff.activity}"
          style="left:${staff.x}%;top:${staff.y}%;--agent-delay:${staff.delayMs}ms"
          title="店員：${escapeHtml(STAFF_ACTIVITY_LABELS[staff.activity])}"
          aria-label="店員、${escapeHtml(STAFF_ACTIVITY_LABELS[staff.activity])}"
        >
          <span class="person-head"></span>
          <span class="person-body"></span>
          <span class="staff-cap" aria-hidden="true"></span>
          <span class="task-mark" aria-hidden="true">${
            staff.activity === "register"
              ? "¥"
              : staff.activity === "replenishment"
                ? "□"
                : staff.activity === "cleaning"
                  ? "⌁"
                  : staff.activity === "delivery_receiving"
                    ? "↙"
                    : "✎"
          }</span>
        </div>
      `,
    )
    .join("");
}

function emptyShelfMarkup(count: number): string {
  return Array.from({ length: 4 }, (_, index) => `
    <span class="shelf-segment${index < count ? " empty" : ""}" aria-label="${index < count ? "空棚" : "商品あり"}">
      ${index < count ? '<i class="empty-sign">品切</i>' : '<i></i><i></i><i></i>'}
    </span>
  `).join("");
}

function queueMarkup(count: number): string {
  if (count <= 0) return "";
  return `<div class="queue-guide" style="--queue-length:${Math.min(100, 20 + count * 12)}%"><span>レジ列 ${count}人相当</span></div>`;
}

function sceneMarkup(model: StoreVisualizationModel): string {
  return `
    <div class="floor-scene ${model.isOpen ? "scene-open" : "scene-closed"}">
      <div class="floor-signboard">
        <span class="scene-light"></span>
        <strong>${model.isOpen ? "営業中" : "閉店中"}</strong>
        <small>${escapeHtml(model.statusText)}</small>
      </div>
      <div class="floor-road" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="floor-building">
        <div class="floor-backroom"><span>BACK ROOM</span></div>
        <div class="floor-shelves" aria-label="商品棚">${emptyShelfMarkup(model.emptyShelfCount)}</div>
        <div class="floor-register" aria-label="レジ"><span>REG</span><i></i></div>
        <div class="floor-entrance" aria-label="入口"><span></span><span></span></div>
        ${queueMarkup(model.queueMarkerCount)}
        ${model.showWaste ? '<div class="waste-scene" title="期限切れ廃棄が発生"><span>廃棄</span></div>' : ""}
        ${customerMarkup(model)}
        ${staffMarkup(model)}
      </div>
      <div class="scene-legend" aria-label="店内表示の凡例">
        <span><i class="legend-customer"></i>代表顧客</span>
        <span><i class="legend-regular">★</i>常連</span>
        <span><i class="legend-staff"></i>店員</span>
        <span><i class="legend-empty"></i>空棚</span>
      </div>
    </div>
  `;
}

async function initializeVisualization(): Promise<void> {
  const storeVisual = document.querySelector<HTMLElement>(".store-visual");
  if (!storeVisual) return;

  const sceneHost = document.createElement("section");
  sceneHost.id = "store-floor-scene";
  sceneHost.className = "store-floor-scene";
  sceneHost.setAttribute("aria-label", "店内の代表顧客と店員の可視化");
  sceneHost.setAttribute("aria-live", "polite");
  storeVisual.prepend(sceneHost);

  const scenario = await loadBrowserScenario();
  let scheduled = false;
  let lastSignature = "";

  const update = (): void => {
    scheduled = false;
    const model = buildStoreVisualization(scenario, readInput());
    const signature = JSON.stringify(model);
    if (signature === lastSignature) return;
    lastSignature = signature;
    sceneHost.innerHTML = sceneMarkup(model);
    sceneHost.dataset.state = model.statusText;
  };

  const scheduleUpdate = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => sceneHost.contains(mutation.target))) return;
    scheduleUpdate();
  });
  observer.observe(document.getElementById("app") ?? document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "value"],
  });

  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "#policy-panel input, #policy-panel select, .policy-panel input, .policy-panel select",
  )) {
    control.addEventListener("input", scheduleUpdate);
    control.addEventListener("change", scheduleUpdate);
  }

  update();
}

void initializeVisualization();
