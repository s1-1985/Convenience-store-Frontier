import {
  createStoreSceneState,
  type SceneCustomer,
  type SceneStaff,
  type StaffTask,
  type StoreSceneInput,
  type StoreSceneState,
  type StoreZoneId,
} from "../game/storeSceneModel.js";
import "./storeGame.css";

const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;
const STORE_TOP = 58;
const STORE_BOTTOM = 454;

interface Point {
  x: number;
  y: number;
}

interface ZoneRect extends Point {
  width: number;
  height: number;
}

const ZONES: Record<StoreZoneId, ZoneRect> = {
  backroom: { x: 22, y: 84, width: 118, height: 86 },
  drinks: { x: 172, y: 82, width: 146, height: 92 },
  dessert: { x: 332, y: 82, width: 108, height: 92 },
  ready_meal: { x: 454, y: 82, width: 180, height: 92 },
  magazines: { x: 650, y: 82, width: 140, height: 92 },
  snacks: { x: 184, y: 210, width: 150, height: 82 },
  instant: { x: 354, y: 210, width: 150, height: 82 },
  daily_goods: { x: 524, y: 210, width: 150, height: 82 },
  register: { x: 730, y: 224, width: 180, height: 112 },
  entrance: { x: 68, y: 350, width: 174, height: 92 },
  waste: { x: 336, y: 372, width: 94, height: 54 },
};

const TASK_LABEL: Record<StaffTask, string> = {
  register: "レジ",
  replenishment: "補充",
  cleaning: "清掃",
  delivery_receiving: "納品",
  admin: "発注",
};

function optional<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function numberFrom(text: string | null | undefined): number {
  if (!text) return 0;
  const match = text.replaceAll(",", "").replaceAll("−", "-").match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function currentHour(): number {
  const text = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(text.split(":")[0] ?? "6", 10);
}

function currentSlot(): number {
  const text = optional("time-label")?.textContent ?? "06:00";
  const [hourText = "6", minuteText = "0"] = text.split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  return Math.max(0, Math.round(((hour - 6) * 60 + minute) / 15));
}

function currentStaffing(): number {
  const hour = currentHour();
  const block = hour < 10 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : "evening";
  return numberFrom(optional<HTMLInputElement>(`staff-${block}`)?.value) || 1;
}

function backlog(task: StaffTask): number {
  const report = document.getElementById("inventory-report");
  if (!report) return 0;
  const rows = [...report.querySelectorAll<HTMLElement>(".work-bars > div")];
  const labels: Record<StaffTask, string> = {
    register: "レジ",
    replenishment: "補充",
    cleaning: "清掃",
    delivery_receiving: "納品受入",
    admin: "発注・記録",
  };
  const row = rows.find((item) => item.textContent?.includes(labels[task]));
  return numberFrom(row?.querySelector("strong")?.textContent);
}

function isStoreOpen(): boolean {
  const opening = numberFrom(optional<HTMLSelectElement>("opening-hour-select")?.value) || 8;
  const closing = numberFrom(optional<HTMLSelectElement>("closing-hour-select")?.value) || 20;
  const hour = currentHour();
  return hour >= opening && hour < closing;
}

function readSceneInput(): StoreSceneInput {
  const stockoutCard = [...document.querySelectorAll<HTMLElement>("#inventory-report .cause-card")].find(
    (card) => card.textContent?.includes("在庫不足"),
  );
  const shelfCard = [...document.querySelectorAll<HTMLElement>("#inventory-report .cause-card")].find(
    (card) => card.textContent?.includes("棚補充遅延"),
  );
  const wasteCard = [...document.querySelectorAll<HTMLElement>("#inventory-report .cause-card")].find(
    (card) => card.textContent?.includes("期限切れ廃棄"),
  );
  return {
    day: Math.max(1, Math.round(numberFrom(optional("day-label")?.textContent))),
    slot: currentSlot(),
    isOpen: isStoreOpen(),
    queueCustomers: numberFrom(optional("queue-metric")?.textContent),
    backlogByTask: {
      register: backlog("register"),
      replenishment: backlog("replenishment"),
      cleaning: backlog("cleaning"),
      delivery_receiving: backlog("delivery_receiving"),
      admin: backlog("admin"),
    },
    staffingByTimeBlock: currentStaffing(),
    stockoutUnits: numberFrom(stockoutCard?.querySelector("strong")?.textContent),
    shelfStockoutUnits: numberFrom(shelfCard?.querySelector("strong")?.textContent),
    wasteUnits: numberFrom(wasteCard?.querySelector("strong")?.textContent),
    visitsToday: numberFrom(optional("visits-kpi")?.textContent) || numberFrom(optional("abandon-kpi")?.textContent) * 4,
    revenueToday: numberFrom(optional("revenue-kpi")?.textContent),
    profitToday: numberFrom(optional("profit-kpi")?.textContent),
  };
}

function pixelText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 14,
  align: CanvasTextAlign = "left",
): void {
  context.save();
  context.font = `700 ${size}px monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = "#fff7d6";
  context.shadowColor = "#15223a";
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 2;
  context.fillText(text, Math.round(x), Math.round(y));
  context.restore();
}

function rect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke = "#1b2438",
  lineWidth = 2,
): void {
  context.fillStyle = fill;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.strokeRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawFloor(context: CanvasRenderingContext2D): void {
  rect(context, 8, STORE_TOP, 944, STORE_BOTTOM - STORE_TOP, "#d8c6a5", "#e8b84b", 3);
  context.strokeStyle = "rgba(91,72,49,.25)";
  context.lineWidth = 1;
  for (let x = 8; x <= 952; x += 24) {
    context.beginPath();
    context.moveTo(x, STORE_TOP);
    context.lineTo(x, STORE_BOTTOM);
    context.stroke();
  }
  for (let y = STORE_TOP; y <= STORE_BOTTOM; y += 24) {
    context.beginPath();
    context.moveTo(8, y);
    context.lineTo(952, y);
    context.stroke();
  }
}

function drawHud(context: CanvasRenderingContext2D, input: StoreSceneInput): void {
  rect(context, 0, 0, LOGICAL_WIDTH, 54, "#08233f", "#e4aa39", 3);
  pixelText(context, `${input.day}日目`, 26, 27, 20);
  pixelText(context, optional("time-label")?.textContent ?? "06:00", 190, 27, 20);
  pixelText(context, optional("weather-label")?.textContent ?? "晴れ", 344, 27, 18);
  pixelText(context, `所持金 ${optional("cash-label")?.textContent ?? "—"}`, 570, 27, 20);
}

function drawColdCase(context: CanvasRenderingContext2D, zone: ZoneRect, label: string, fill: number): void {
  rect(context, zone.x, zone.y, zone.width, zone.height, "#d9e5e7", "#293e53", 3);
  rect(context, zone.x + 4, zone.y + 4, zone.width - 8, 24, "#315e9b", "#172b46", 1);
  pixelText(context, label, zone.x + zone.width / 2, zone.y + 16, 12, "center");
  const columns = Math.max(2, Math.floor(zone.width / 30));
  const rows = 3;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const visible = index / (rows * columns) < fill;
      rect(
        context,
        zone.x + 10 + column * ((zone.width - 20) / columns),
        zone.y + 36 + row * 16,
        10,
        11,
        visible ? ["#f1c84b", "#62a9c9", "#df6b52", "#77a65b"][index % 4] ?? "#aaa" : "#80909b",
        "#34495e",
        1,
      );
    }
  }
}

function drawShelf(context: CanvasRenderingContext2D, zone: ZoneRect, label: string, fill: number): void {
  rect(context, zone.x, zone.y, zone.width, zone.height, "#75634f", "#2f2a28", 3);
  rect(context, zone.x + 4, zone.y + 4, zone.width - 8, 22, "#315e9b", "#172b46", 1);
  pixelText(context, label, zone.x + zone.width / 2, zone.y + 15, 12, "center");
  for (let row = 0; row < 3; row += 1) {
    rect(context, zone.x + 7, zone.y + 31 + row * 16, zone.width - 14, 4, "#2d2926", "#2d2926", 0);
    const count = Math.max(3, Math.floor((zone.width - 20) / 17));
    for (let column = 0; column < count; column += 1) {
      const normalized = (row * count + column) / (count * 3);
      if (normalized >= fill) continue;
      const colors = ["#e76845", "#e0bd3f", "#438db2", "#65a65d", "#b76aa5"];
      rect(context, zone.x + 10 + column * 17, zone.y + 35 + row * 16, 12, 12, colors[(row + column) % colors.length] ?? "#aaa", "#3b302b", 1);
    }
  }
}

function drawStoreFixtures(context: CanvasRenderingContext2D, scene: StoreSceneState): void {
  const fill = Object.fromEntries(scene.shelves.map((shelf) => [shelf.zoneId, shelf.fillRatio])) as Partial<Record<StoreZoneId, number>>;
  drawColdCase(context, ZONES.drinks, "飲料", fill.drinks ?? 1);
  drawColdCase(context, ZONES.dessert, "デザート", fill.dessert ?? 1);
  drawColdCase(context, ZONES.ready_meal, "弁当・惣菜", fill.ready_meal ?? 1);
  drawShelf(context, ZONES.magazines, "雑誌・書籍", fill.magazines ?? 1);
  drawShelf(context, ZONES.snacks, "お菓子", fill.snacks ?? 1);
  drawShelf(context, ZONES.instant, "カップ麺", fill.instant ?? 1);
  drawShelf(context, ZONES.daily_goods, "日用品", fill.daily_goods ?? 1);

  rect(context, ZONES.backroom.x, ZONES.backroom.y, ZONES.backroom.width, ZONES.backroom.height, "#8d765c", "#302a25", 3);
  pixelText(context, "バックヤード", ZONES.backroom.x + ZONES.backroom.width / 2, ZONES.backroom.y + 18, 12, "center");
  for (let index = 0; index < 5; index += 1) {
    rect(context, ZONES.backroom.x + 12 + (index % 2) * 43, ZONES.backroom.y + 34 + Math.floor(index / 2) * 16, 34, 13, "#b98c53", "#5d442e", 1);
  }

  rect(context, ZONES.register.x, ZONES.register.y, ZONES.register.width, ZONES.register.height, "#d4d6ce", "#263947", 3);
  rect(context, ZONES.register.x + 12, ZONES.register.y + 18, 62, 42, "#496b76", "#1c2c36", 2);
  rect(context, ZONES.register.x + 88, ZONES.register.y + 18, 70, 24, "#8da0a4", "#1c2c36", 2);
  pixelText(context, "レジ", ZONES.register.x + 122, ZONES.register.y + 82, 14, "center");

  rect(context, ZONES.entrance.x, ZONES.entrance.y, ZONES.entrance.width, ZONES.entrance.height, "#9fc5cc", "#304c58", 3);
  context.fillStyle = "rgba(226,247,250,.55)";
  context.fillRect(ZONES.entrance.x + 8, ZONES.entrance.y + 8, ZONES.entrance.width - 16, ZONES.entrance.height - 16);
  pixelText(context, "入口", ZONES.entrance.x + ZONES.entrance.width / 2, ZONES.entrance.y + ZONES.entrance.height - 12, 13, "center");

  rect(context, ZONES.waste.x, ZONES.waste.y, 24, 42, "#7b817e", "#303a38", 2);
  rect(context, ZONES.waste.x + 30, ZONES.waste.y, 24, 42, "#3a7395", "#303a38", 2);
  rect(context, ZONES.waste.x + 60, ZONES.waste.y, 24, 42, "#4f8854", "#303a38", 2);

  for (const shelf of scene.shelves) {
    if (shelf.warning === "none") continue;
    const zone = ZONES[shelf.zoneId];
    if (!zone) continue;
    rect(context, zone.x + zone.width - 44, zone.y + 2, 42, 20, shelf.warning === "empty" ? "#a92e2e" : "#d08b28", "#fff0b0", 1);
    pixelText(context, shelf.warning === "empty" ? "品切" : "残少", zone.x + zone.width - 23, zone.y + 12, 10, "center");
  }
}

function zonePoint(zoneId: StoreZoneId, progress: number): Point {
  const zone = ZONES[zoneId];
  const x = zone.x + 18 + ((progress * 97) % Math.max(24, zone.width - 36));
  const y = zone.y + 34 + ((progress * 61) % Math.max(20, zone.height - 44));
  return { x, y };
}

function customerPoint(customer: SceneCustomer, index: number, animation: number): Point {
  if (customer.stage === "queueing" || customer.stage === "paying") {
    return { x: 708 - index * 28, y: 315 + (index % 2) * 8 };
  }
  if (customer.stage === "entering") {
    return { x: 145 + animation * 62, y: 425 - animation * 38 };
  }
  if (customer.stage === "leaving") {
    return { x: 210 - animation * 70, y: 390 + animation * 45 };
  }
  return zonePoint(customer.targetZone, customer.progress + animation * 0.05);
}

function drawPerson(
  context: CanvasRenderingContext2D,
  point: Point,
  variant: number,
  uniform: boolean,
  label?: string,
  alert = false,
): void {
  const bob = Math.round(Math.sin(performance.now() / 180 + variant) * 1.5);
  const skin = ["#dba270", "#c78b5d", "#e3b383", "#b97b52"][variant % 4] ?? "#dba270";
  const shirt = uniform ? "#2e8a55" : ["#335d91", "#aa4d3a", "#6e4b8d", "#b88a2f", "#39745d"][variant % 5] ?? "#335d91";
  context.fillStyle = "rgba(28,25,22,.28)";
  context.fillRect(point.x - 8, point.y + 15, 18, 5);
  rect(context, point.x - 6, point.y - 15 + bob, 13, 13, skin, "#3b2b25", 1);
  rect(context, point.x - 8, point.y - 2 + bob, 17, 18, shirt, "#27313c", 1);
  rect(context, point.x - 7, point.y + 16 + bob, 6, 9, "#293c59", "#1e2530", 1);
  rect(context, point.x + 3, point.y + 16 + bob, 6, 9, "#293c59", "#1e2530", 1);
  if (label) {
    rect(context, point.x - 18, point.y - 36, 38, 15, "#08233f", "#e4aa39", 1);
    pixelText(context, label, point.x + 1, point.y - 28, 8, "center");
  }
  if (alert) {
    context.fillStyle = "#c52f2f";
    context.beginPath();
    context.arc(point.x + 12, point.y - 27, 9, 0, Math.PI * 2);
    context.fill();
    pixelText(context, "!", point.x + 12, point.y - 27, 10, "center");
  }
}

function drawAgents(context: CanvasRenderingContext2D, scene: StoreSceneState, now: number): void {
  const animation = (now / 1800) % 1;
  scene.customers.forEach((customer, index) => {
    drawPerson(
      context,
      customerPoint(customer, index, animation),
      customer.variant,
      false,
      customer.regular ? "★" : undefined,
      customer.impatient,
    );
  });
  scene.staff.forEach((staff: SceneStaff) => {
    const point = zonePoint(staff.targetZone, staff.progress + animation * 0.04);
    drawPerson(context, point, staff.variant, true, TASK_LABEL[staff.task]);
    if (staff.task === "replenishment" || staff.task === "delivery_receiving") {
      rect(context, point.x + 10, point.y + 3, 14, 12, "#b98c53", "#5d442e", 1);
    }
  });
}

function drawWarnings(context: CanvasRenderingContext2D, scene: StoreSceneState): void {
  if (scene.showWaste) {
    rect(context, 445, 384, 28, 20, "#8a6d45", "#3d3024", 2);
    pixelText(context, "廃棄", 459, 414, 10, "center");
  }
  if (scene.showClosedPassersby) {
    pixelText(context, "営業時間外：店の前を客が通過している", 480, 432, 14, "center");
  }
  if (scene.dominantProblem !== "none") {
    const labels = { queue: "レジ混雑", stockout: "欠品発生", backlog: "作業滞留", waste: "廃棄発生" } as const;
    rect(context, 760, 64, 176, 32, "#a52f2f", "#ffe2a0", 2);
    pixelText(context, `! ${labels[scene.dominantProblem]}`, 848, 80, 13, "center");
  }
}

function drawFooter(context: CanvasRenderingContext2D, input: StoreSceneInput): void {
  rect(context, 0, 458, LOGICAL_WIDTH, 82, "#08233f", "#e4aa39", 3);
  pixelText(context, `来店 ${Math.round(input.visitsToday)}人`, 620, 482, 15);
  pixelText(context, `売上 ¥${Math.round(input.revenueToday).toLocaleString("ja-JP")}`, 620, 507, 15);
  pixelText(context, `利益 ¥${Math.round(input.profitToday).toLocaleString("ja-JP")}`, 800, 482, 15);
  pixelText(context, `行列 ${Math.ceil(input.queueCustomers)}人`, 800, 507, 15);
}

function buildShell(): HTMLElement {
  const shell = document.createElement("main");
  shell.id = "store-game-shell";
  shell.innerHTML = `
    <section class="store-game-stage" aria-label="コンビニ店内">
      <canvas id="store-game-canvas" width="960" height="540"></canvas>
      <div class="orientation-message">端末を横向きにしてください</div>
    </section>
    <nav class="store-game-nav" aria-label="主要メニュー">
      <button type="button" data-game-action="time"><span>◷</span>時間</button>
      <button type="button" data-game-action="store"><span>▣</span>店舗</button>
      <button type="button" data-game-action="product"><span>箱</span>商品</button>
      <button type="button" data-game-action="order"><span>票</span>発注</button>
      <button type="button" data-game-action="staff"><span>人</span>人員</button>
      <button type="button" data-game-action="info"><span>▥</span>情報</button>
    </nav>
    <button type="button" class="store-game-menu" data-game-action="detail">詳細管理</button>
  `;
  document.body.prepend(shell);
  return shell;
}

function openDetail(target: "store" | "product" | "order" | "staff" | "info" | "detail"): void {
  document.body.classList.add("store-detail-open");
  const map: Record<typeof target, string> = {
    store: "store-status-panel",
    product: "category-area-controls",
    order: "ordering-policy-select",
    staff: "staffing-controls",
    info: "report-panel",
    detail: "app",
  };
  window.setTimeout(() => document.getElementById(map[target])?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function bindNavigation(shell: HTMLElement): void {
  shell.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-game-action]");
    if (!button) return;
    const action = button.dataset.gameAction;
    if (action === "time") {
      optional<HTMLButtonElement>("play-button")?.click();
      return;
    }
    if (action === "store" || action === "product" || action === "order" || action === "staff" || action === "info" || action === "detail") {
      openDetail(action);
    }
  });

  const close = document.createElement("button");
  close.type = "button";
  close.id = "close-store-detail";
  close.textContent = "店内へ戻る";
  close.addEventListener("click", () => document.body.classList.remove("store-detail-open"));
  document.body.append(close);
}

function start(): void {
  const app = optional<HTMLElement>("app");
  if (!app || app.hidden || !optional("day-label")) {
    window.setTimeout(start, 100);
    return;
  }

  document.body.classList.add("store-game-mode");
  const shell = buildShell();
  bindNavigation(shell);
  const canvas = optional<HTMLCanvasElement>("store-game-canvas");
  const context = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !context) return;
  context.imageSmoothingEnabled = false;

  let lastKey = "";
  let input = readSceneInput();
  let scene = createStoreSceneState(input);

  const refreshState = (): void => {
    const next = readSceneInput();
    const key = JSON.stringify(next);
    if (key !== lastKey) {
      input = next;
      scene = createStoreSceneState(next);
      lastKey = key;
    }
  };

  const render = (now: number): void => {
    refreshState();
    context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    drawHud(context, input);
    drawFloor(context);
    drawStoreFixtures(context, scene);
    drawAgents(context, scene, now);
    drawWarnings(context, scene);
    drawFooter(context, input);
    window.requestAnimationFrame(render);
  };

  const observer = new MutationObserver(refreshState);
  observer.observe(app, { subtree: true, childList: true, characterData: true, attributes: true });
  window.requestAnimationFrame(render);
}

start();
