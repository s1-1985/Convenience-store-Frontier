import type { CompetitiveDailyReport } from "../simulation/competitiveSimulation.js";
import type { FreePlaySimulation } from "../simulation/freePlaySimulation.js";
import type { OperationTaskId } from "../simulation/operations.js";
import type {
  DeliveryPolicyId,
  OrderingPolicyId,
  ScenarioBundle,
  TimeBlockId,
} from "../simulation/types.js";
import { loadBrowserScenario } from "./browserScenario.js";
import {
  clearBrowserFreePlaySave,
  createBrowserFreePlaySession,
  type BrowserFreePlaySession,
} from "./browserFreePlaySession.js";
import {
  buildDashboardAlerts,
  COMPETITOR_ACTION_LABELS,
  formatClock,
  formatNumber,
  formatPercent,
  formatYen,
  HABIT_LABELS,
  OPERATION_LABELS,
  shouldAutoStop,
  sumOperationRecord,
  sumRecord,
  topEntries,
  type DashboardAlert,
} from "./presentation.js";

const TIME_BLOCKS: ReadonlyArray<{ id: TimeBlockId; label: string }> = [
  { id: "morning", label: "朝 6〜10時" },
  { id: "midday", label: "昼 10〜14時" },
  { id: "afternoon", label: "夕方 14〜18時" },
  { id: "evening", label: "夜 18〜24時" },
];

const OPERATION_TASKS: ReadonlyArray<{ id: OperationTaskId; label: string }> = [
  { id: "register", label: "レジ" },
  { id: "replenishment", label: "補充" },
  { id: "cleaning", label: "清掃" },
  { id: "delivery_receiving", label: "納品受入" },
  { id: "admin", label: "発注・記録" },
];

const HABIT_STATE_LABELS = {
  unexperienced: "未経験",
  trial: "試行",
  repeat: "再利用",
  habitual: "習慣化",
  regional_established: "地域定着",
} as const;

const SPEED_INTERVAL_MS: Record<string, number> = {
  "1": 800,
  "4": 200,
  "20": 45,
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Required element not found: #${id}`);
  }
  return found as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseInteger(input: HTMLInputElement | HTMLSelectElement): number {
  const value = Number.parseInt(input.value, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${input.name || input.id}の値が不正である`);
  }
  return value;
}

let scenario: ScenarioBundle;
let browserSession: BrowserFreePlaySession;
let simulation: FreePlaySimulation;
let selectedTab = "daily";
let selectedReportDay: number | undefined;
let timerId: number | undefined;
let previousReportCount = 0;
let lastStopReason = "";

const loadingScreen = element<HTMLDivElement>("loading-screen");
const loadingMessage = element<HTMLParagraphElement>("loading-message");
const app = element<HTMLDivElement>("app");
const playButton = element<HTMLButtonElement>("play-button");
const speedSelect = element<HTMLSelectElement>("speed-select");
const autoStopCheckbox = element<HTMLInputElement>("auto-stop-checkbox");
const seedInput = element<HTMLInputElement>("seed-input");
const policyMessage = element<HTMLParagraphElement>("policy-message");
const reportDaySelect = element<HTMLSelectElement>("report-day-select");

function currentSeed(): number {
  const value = Number.parseInt(seedInput.value, 10);
  return Number.isFinite(value) ? value : 1977;
}

function isPlaying(): boolean {
  return timerId !== undefined;
}

function stopPlayback(reason = ""): void {
  if (timerId !== undefined) {
    window.clearInterval(timerId);
    timerId = undefined;
  }
  playButton.textContent = "▶ 再生";
  playButton.classList.remove("danger-button");
  if (reason) {
    lastStopReason = reason;
  }
}

function playbackInterval(): number {
  return SPEED_INTERVAL_MS[speedSelect.value] ?? SPEED_INTERVAL_MS["1"] ?? 800;
}

function startPlayback(): void {
  if (simulation.isFinished()) {
    return;
  }
  stopPlayback();
  lastStopReason = "";
  playButton.textContent = "■ 停止";
  playButton.classList.add("danger-button");
  timerId = window.setInterval(() => {
    try {
      simulation.advanceSlot();
      afterAdvance(true);
    } catch (error) {
      stopPlayback(error instanceof Error ? error.message : "進行中にエラーが発生した");
      render();
    }
  }, playbackInterval());
}

function togglePlayback(): void {
  if (isPlaying()) {
    stopPlayback("手動で停止した");
    render();
  } else {
    startPlayback();
    render();
  }
}

function latestReport(): CompetitiveDailyReport | undefined {
  return simulation.getAllDailyReports().at(-1);
}

function selectedReport(): CompetitiveDailyReport | undefined {
  const reports = simulation.getAllDailyReports();
  if (selectedReportDay === undefined) {
    return reports.at(-1);
  }
  return reports.find((report) => report.day === selectedReportDay) ?? reports.at(-1);
}

function autoStopForLatestReport(): boolean {
  if (!autoStopCheckbox.checked) {
    return false;
  }
  const report = latestReport();
  if (!report) {
    return false;
  }
  const alerts = buildDashboardAlerts(report);
  if (!shouldAutoStop(alerts)) {
    return false;
  }
  const critical = alerts.find((alert) => alert.severity === "critical");
  stopPlayback(critical ? `自動停止：${critical.title}` : "重大問題を検出して自動停止した");
  return true;
}

function afterAdvance(checkAutoStop: boolean): void {
  const reports = simulation.getAllDailyReports();
  if (reports.length > previousReportCount) {
    selectedReportDay = reports.at(-1)?.day;
    previousReportCount = reports.length;
    if (checkAutoStop) {
      autoStopForLatestReport();
    }
  }
  render();
}

function advanceDays(days: number): void {
  stopPlayback();
  lastStopReason = "";
  for (let i = 0; i < days; i += 1) {
    simulation.advanceDay();
    previousReportCount = simulation.getAllDailyReports().length;
    selectedReportDay = latestReport()?.day;
    if (autoStopForLatestReport()) {
      break;
    }
  }
  render();
}

function runToEnd(): void {
  advanceDays(30);
}

function populateHourSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (let hour = 6; hour <= 24; hour += 1) {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = `${hour}:00`;
    select.append(option);
  }
}

function buildPolicyControls(): void {
  populateHourSelect(element<HTMLSelectElement>("opening-hour-select"));
  populateHourSelect(element<HTMLSelectElement>("closing-hour-select"));

  const staffingContainer = element<HTMLDivElement>("staffing-controls");
  staffingContainer.innerHTML = TIME_BLOCKS.map(
    ({ id, label }) => `
      <label>
        ${escapeHtml(label)}
        <input id="staff-${id}" name="staff-${id}" type="number" min="1" max="4" step="1" />
      </label>
    `,
  ).join("");

  const priorityContainer = element<HTMLDivElement>("priority-controls");
  const taskOptions = OPERATION_TASKS.map(
    (task) => `<option value="${task.id}">${escapeHtml(task.label)}</option>`,
  ).join("");
  priorityContainer.innerHTML = OPERATION_TASKS.map(
    (_, index) => `
      <label class="priority-row">
        <span>${index + 1}</span>
        <select id="priority-${index}" aria-label="優先順位${index + 1}">${taskOptions}</select>
      </label>
    `,
  ).join("");

  const categoryContainer = element<HTMLDivElement>("category-area-controls");
  categoryContainer.innerHTML = scenario.categories.map(
    (category) => `
      <label class="category-row">
        <span>${escapeHtml(category.displayName)}</span>
        <input
          id="category-${category.id}"
          data-category-id="${escapeHtml(category.id)}"
          type="number"
          min="5"
          max="25"
          step="1"
        />
      </label>
    `,
  ).join("");

  for (const input of categoryContainer.querySelectorAll<HTMLInputElement>("input")) {
    input.addEventListener("input", updateCategoryTotal);
  }
}

function updateCategoryTotal(): void {
  const total = scenario.categories.reduce((sum, category) => {
    const input = element<HTMLInputElement>(`category-${category.id}`);
    const value = Number.parseInt(input.value, 10);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const totalLabel = element<HTMLElement>("category-area-total");
  totalLabel.textContent = `合計 ${total}`;
  totalLabel.classList.toggle("invalid-total", total !== scenario.economy.totalShelfAreaPoints);
}

function syncPolicyForm(): void {
  const snapshot = simulation.getSnapshot();
  element<HTMLSelectElement>("opening-hour-select").value = String(snapshot.playerStore.openingHour);
  element<HTMLSelectElement>("closing-hour-select").value = String(snapshot.playerStore.closingHour);
  element<HTMLSelectElement>("ordering-policy-select").value = snapshot.playerStore.orderingPolicy;
  element<HTMLSelectElement>("delivery-policy-select").value = snapshot.playerStore.deliveryPolicy;

  for (const { id } of TIME_BLOCKS) {
    element<HTMLInputElement>(`staff-${id}`).value = String(snapshot.playerStore.staffingByTimeBlock[id]);
  }
  snapshot.playerStore.taskPriorities.forEach((task, index) => {
    element<HTMLSelectElement>(`priority-${index}`).value = task;
  });
  for (const category of scenario.categories) {
    element<HTMLInputElement>(`category-${category.id}`).value = String(
      snapshot.playerStore.categoryArea[category.id] ?? 0,
    );
  }
  updateCategoryTotal();
}

function applyPolicies(): void {
  try {
    const openingHour = parseInteger(element<HTMLSelectElement>("opening-hour-select"));
    const closingHour = parseInteger(element<HTMLSelectElement>("closing-hour-select"));
    if (openingHour >= closingHour) {
      throw new Error("開店時刻は閉店時刻より前に設定する必要がある");
    }

    const staffing = Object.fromEntries(
      TIME_BLOCKS.map(({ id }) => [id, parseInteger(element<HTMLInputElement>(`staff-${id}`))]),
    ) as Record<TimeBlockId, number>;
    if (Object.values(staffing).some((count) => count < 1 || count > 4)) {
      throw new Error("各時間帯の人員は1〜4人で設定する");
    }

    const priorities = OPERATION_TASKS.map((_, index) =>
      element<HTMLSelectElement>(`priority-${index}`).value,
    ) as OperationTaskId[];
    if (new Set(priorities).size !== OPERATION_TASKS.length) {
      throw new Error("作業優先順位には5種類の作業を重複なく設定する");
    }

    const categoryArea: Record<string, number> = {};
    for (const category of scenario.categories) {
      const value = parseInteger(element<HTMLInputElement>(`category-${category.id}`));
      if (value < 5 || value > 25) {
        throw new Error(`${category.displayName}の売場面積は5〜25で設定する`);
      }
      categoryArea[category.id] = value;
    }
    const areaTotal = sumRecord(categoryArea);
    if (areaTotal !== scenario.economy.totalShelfAreaPoints) {
      throw new Error(`売場面積の合計は${scenario.economy.totalShelfAreaPoints}にする`);
    }

    simulation.applyPolicy({ type: "set_opening_hours", openingHour, closingHour });
    simulation.applyPolicy({
      type: "set_ordering_policy",
      policy: element<HTMLSelectElement>("ordering-policy-select").value as OrderingPolicyId,
    });
    simulation.applyPolicy({
      type: "set_delivery_policy",
      policy: element<HTMLSelectElement>("delivery-policy-select").value as DeliveryPolicyId,
    });
    for (const { id } of TIME_BLOCKS) {
      simulation.applyPolicy({ type: "set_staffing", timeBlock: id, count: staffing[id] });
    }
    simulation.applyPolicy({ type: "set_task_priorities", priorities });
    simulation.applyPolicy({ type: "set_category_area", categoryArea });

    policyMessage.textContent = "経営方針を反映した。変更は次のスロットから効く。";
    policyMessage.className = "form-message success-message";
    render();
  } catch (error) {
    policyMessage.textContent = error instanceof Error ? error.message : "方針を反映できなかった";
    policyMessage.className = "form-message error-message";
  }
}

function resetSimulation(showMessage = true): void {
  stopPlayback();
  clearBrowserFreePlaySave();
  browserSession = createBrowserFreePlaySession(scenario, currentSeed());
  simulation = browserSession.simulation;
  seedInput.value = String(browserSession.seed);
  previousReportCount = 0;
  selectedReportDay = undefined;
  lastStopReason = "";
  if (showMessage) {
    policyMessage.textContent = `シード${currentSeed()}で最初から開始した。`;
    policyMessage.className = "form-message success-message";
  }
  syncPolicyForm();
  render();
}

function renderAlerts(alerts: readonly DashboardAlert[]): void {
  const container = element<HTMLDivElement>("alerts-container");
  container.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-card ${alert.severity}">
          <div class="alert-icon" aria-hidden="true">${
            alert.severity === "critical" ? "!" : alert.severity === "warning" ? "△" : "i"
          }</div>
          <div>
            <h3>${escapeHtml(alert.title)}</h3>
            <p>${escapeHtml(alert.detail)}</p>
          </div>
        </article>
      `,
    )
    .join("");
  element<HTMLElement>("alert-count").textContent = `${alerts.length}件`;

  const stopReason = element<HTMLParagraphElement>("stop-reason");
  stopReason.hidden = !lastStopReason;
  stopReason.textContent = lastStopReason;
}

function renderReportDaySelect(reports: readonly CompetitiveDailyReport[]): void {
  const previousValue = selectedReportDay;
  reportDaySelect.replaceChildren();
  if (reports.length === 0) {
    const option = document.createElement("option");
    option.textContent = "日報なし";
    option.value = "";
    reportDaySelect.append(option);
    reportDaySelect.disabled = true;
    return;
  }
  reportDaySelect.disabled = false;
  for (const report of [...reports].reverse()) {
    const option = document.createElement("option");
    option.value = String(report.day);
    option.textContent = `${report.day}日目`;
    reportDaySelect.append(option);
  }
  selectedReportDay = previousValue ?? reports.at(-1)?.day;
  reportDaySelect.value = String(selectedReportDay ?? reports.at(-1)?.day ?? "");
}

function productName(productId: string): string {
  return scenario.products.find((product) => product.id === productId)?.displayName ?? productId;
}

function categoryName(categoryId: string): string {
  return scenario.categories.find((category) => category.id === categoryId)?.displayName ?? categoryId;
}

function renderDailyReport(report: CompetitiveDailyReport | undefined): void {
  const container = element<HTMLDivElement>("daily-report");
  if (!report) {
    container.innerHTML = '<div class="empty-state">1日営業すると日次レポートが表示される。</div>';
    return;
  }
  const reports = simulation.getAllDailyReports();
  const recentRows = [...reports]
    .slice(-10)
    .reverse()
    .map((item) => {
      const stockout = sumRecord(item.stockoutUnitsByProduct) + item.operationalShelfStockoutUnits;
      const competitorAction = item.competitorDecisions.find((decision) => decision.action)?.action;
      return `
        <tr class="${item.day === report.day ? "selected-row" : ""}">
          <td>${item.day}日目</td>
          <td>${item.weather === "rain" ? "雨" : "晴"}</td>
          <td>${formatYen(item.revenue)}</td>
          <td class="${item.profit < 0 ? "negative-value" : "positive-value"}">${formatYen(item.profit)}</td>
          <td>${formatNumber(stockout)}</td>
          <td>${formatNumber(item.abandonedCustomers)}</td>
          <td>${competitorAction ? escapeHtml(COMPETITOR_ACTION_LABELS[competitorAction.actionId]) : "—"}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="report-summary-grid">
      <div><span>売上</span><strong>${formatYen(report.revenue)}</strong></div>
      <div><span>利益</span><strong class="${report.profit < 0 ? "negative-value" : "positive-value"}">${formatYen(report.profit)}</strong></div>
      <div><span>来店</span><strong>${formatNumber(report.visitsByStore[scenario.playerStore.id] ?? 0)}人</strong></div>
      <div><span>閉店時現金</span><strong>${formatYen(report.cashEnd)}</strong></div>
    </div>
    <div class="report-columns">
      <section>
        <h3>費用構成</h3>
        <dl class="detail-list">
          <div><dt>売上原価</dt><dd>${formatYen(report.cogs)}</dd></div>
          <div><dt>人件費</dt><dd>${formatYen(report.laborCost)}</dd></div>
          <div><dt>光熱費</dt><dd>${formatYen(report.utilitiesCost)}</dd></div>
          <div><dt>廃棄原価</dt><dd>${formatYen(report.wasteCost)}</dd></div>
          <div><dt>物流費</dt><dd>${formatYen(report.deliveryCost)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>店舗品質</h3>
        <dl class="detail-list">
          <div><dt>レジ離脱</dt><dd>${formatNumber(report.abandonedCustomers)}人</dd></div>
          <div><dt>棚補充遅延</dt><dd>${formatNumber(report.operationalShelfStockoutUnits)}個分</dd></div>
          <div><dt>在庫不足</dt><dd>${formatNumber(sumRecord(report.stockoutUnitsByProduct))}個分</dd></div>
          <div><dt>作業積み残し</dt><dd>${formatNumber(sumOperationRecord(report.operationBacklogByTask))}点</dd></div>
          <div><dt>常連の競合流出</dt><dd>${formatNumber(report.habitualDiversionsToCompetitor)}人</dd></div>
        </dl>
      </section>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>日</th><th>天候</th><th>売上</th><th>利益</th><th>欠品</th><th>離脱</th><th>競合行動</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>
  `;
}

function renderRankList(
  entries: Array<{ id: string; value: number }>,
  nameResolver: (id: string) => string,
  unit: string,
): string {
  if (entries.length === 0) {
    return '<p class="muted-text">該当なし</p>';
  }
  const max = entries[0]?.value ?? 1;
  return `<ol class="rank-list">${entries
    .map(
      (entry) => `
        <li>
          <div><span>${escapeHtml(nameResolver(entry.id))}</span><strong>${formatNumber(entry.value)}${unit}</strong></div>
          <span class="mini-bar"><i style="width:${Math.max(3, (entry.value / max) * 100)}%"></i></span>
        </li>
      `,
    )
    .join("")}</ol>`;
}

function renderInventoryReport(report: CompetitiveDailyReport | undefined): void {
  const container = element<HTMLDivElement>("inventory-report");
  if (!report) {
    container.innerHTML = '<div class="empty-state">在庫・欠品分析は日報作成後に表示される。</div>';
    return;
  }
  const stockoutTotal = sumRecord(report.stockoutUnitsByProduct);
  const wasteUnits = sumRecord(report.wasteUnitsByProduct);
  container.innerHTML = `
    <div class="cause-grid">
      <article class="cause-card ${stockoutTotal > 0 ? "has-issue" : ""}">
        <span>在庫不足</span>
        <strong>${formatNumber(stockoutTotal)}個分</strong>
        <p>バックヤードを含む商品在庫が足りず、販売できなかった需要。</p>
      </article>
      <article class="cause-card ${report.operationalShelfStockoutUnits > 0 ? "has-issue" : ""}">
        <span>棚補充遅延</span>
        <strong>${formatNumber(report.operationalShelfStockoutUnits)}個分</strong>
        <p>在庫は残っていたが、補充作業が間に合わず棚が空いた需要。</p>
      </article>
      <article class="cause-card ${report.abandonedCustomers > 0 ? "has-issue" : ""}">
        <span>レジ処理不足</span>
        <strong>${formatNumber(report.abandonedCustomers)}人</strong>
        <p>商品を選べても、待ち時間が長く会計前に離脱した顧客。</p>
      </article>
      <article class="cause-card ${wasteUnits > 0 ? "has-issue" : ""}">
        <span>期限切れ廃棄</span>
        <strong>${formatNumber(wasteUnits)}個</strong>
        <p>欠品防止との引き換えに期限切れとなった在庫。</p>
      </article>
    </div>
    <div class="report-columns three-columns">
      <section><h3>欠品が多い商品</h3>${renderRankList(topEntries(report.stockoutUnitsByProduct), productName, "個")}</section>
      <section><h3>廃棄が多い商品</h3>${renderRankList(topEntries(report.wasteUnitsByProduct), productName, "個")}</section>
      <section><h3>カテゴリ別販売</h3>${renderRankList(topEntries(report.salesUnitsByCategory), categoryName, "個")}</section>
    </div>
    <section class="work-backlog-section">
      <h3>作業別の積み残し</h3>
      <div class="work-bars">
        ${Object.entries(report.operationBacklogByTask)
          .map(
            ([task, value]) => `
              <div><span>${escapeHtml(OPERATION_LABELS[task as keyof typeof OPERATION_LABELS])}</span><progress max="30" value="${Math.min(30, value)}"></progress><strong>${formatNumber(value)}</strong></div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderRegionalReport(report: CompetitiveDailyReport | undefined): void {
  const container = element<HTMLDivElement>("regional-report");
  if (!report) {
    container.innerHTML = '<div class="empty-state">地域行動は日報作成後に表示される。</div>';
    return;
  }
  const habitCards = Object.entries(report.habitRegionalAdoptionByHabit)
    .map(([habitId, adoption]) => {
      const contribution = report.habitPlayerContributionByHabit[habitId as keyof typeof report.habitPlayerContributionByHabit] ?? 0;
      const demand = report.habitDailyPotentialDemandByHabit[habitId as keyof typeof report.habitDailyPotentialDemandByHabit] ?? 0;
      return `
        <article class="habit-card">
          <h3>${escapeHtml(HABIT_LABELS[habitId as keyof typeof HABIT_LABELS])}</h3>
          <div class="habit-meter"><span style="width:${adoption * 100}%"></span></div>
          <div class="habit-values">
            <span>地域定着 <strong>${formatPercent(adoption, 1)}</strong></span>
            <span>自社寄与 <strong>${formatPercent(contribution, 1)}</strong></span>
            <span>本日需要 <strong>${formatNumber(demand)}人</strong></span>
          </div>
        </article>
      `;
    })
    .join("");

  const cohortRows = scenario.cohorts
    .map((cohort) => {
      const metrics = report.habitStatesByCohort[cohort.id];
      return `
        <tr>
          <th>${escapeHtml(cohort.displayName)}</th>
          ${Object.keys(HABIT_LABELS)
            .map((habitId) => {
              const state = metrics?.[habitId as keyof typeof metrics]?.state;
              return `<td>${state ? HABIT_STATE_LABELS[state] : "—"}</td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="habit-grid">${habitCards}</div>
    <div class="table-wrap">
      <table class="cohort-table">
        <thead><tr><th>客層</th>${Object.values(HABIT_LABELS).map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>${cohortRows}</tbody>
      </table>
    </div>
    <p class="report-note">地域定着度は市場全体の需要を増やす。自社寄与度が高くても、欠品や混雑が続けば成長した市場は競合にも流れる。</p>
  `;
}

function renderCompetitorReport(report: CompetitiveDailyReport | undefined): void {
  const container = element<HTMLDivElement>("competitor-report");
  const snapshot = simulation.getSnapshot();
  const storeCards = scenario.competitorStores
    .map((store) => {
      const state = snapshot.competitorAI.stores[store.id];
      if (!state) {
        return "";
      }
      const focusedCategories = topEntries(state.categoryArea, 3)
        .map((entry) => categoryName(entry.id))
        .join("・");
      return `
        <article class="competitor-card">
          <p class="eyebrow">COMPETITOR</p>
          <h3>${escapeHtml(store.displayName)}</h3>
          <dl class="detail-list">
            <div><dt>営業時間</dt><dd>${state.openingHour}:00〜${state.closingHour}:00</dd></div>
            <div><dt>価格評価</dt><dd>${formatNumber(state.priceIndex, 0)}</dd></div>
            <div><dt>重点売場</dt><dd>${escapeHtml(focusedCategories || "—")}</dd></div>
          </dl>
        </article>
      `;
    })
    .join("");

  const decisionRows = (report?.competitorDecisions ?? [])
    .map(
      (decision) => `
        <tr>
          <td>${escapeHtml(decision.storeId)}</td>
          <td>${decision.considered ? "判断実施" : "観測のみ"}</td>
          <td>${decision.selectedAction ? escapeHtml(COMPETITOR_ACTION_LABELS[decision.selectedAction]) : "見送り"}</td>
          <td>${escapeHtml(decision.reason)}</td>
        </tr>
      `,
    )
    .join("");

  const history = [...snapshot.competitorAI.actionHistory]
    .reverse()
    .slice(0, 10)
    .map(
      (action) => `
        <li>
          <span>${action.day}日目</span>
          <strong>${escapeHtml(COMPETITOR_ACTION_LABELS[action.actionId])}</strong>
          <p>${escapeHtml(action.reason)}</p>
        </li>
      `,
    )
    .join("");

  container.innerHTML = `
    <div class="competitor-grid">${storeCards}</div>
    <div class="report-columns">
      <section>
        <h3>${report ? `${report.day}日目の競合判断` : "競合判断"}</h3>
        ${
          decisionRows
            ? `<div class="table-wrap"><table><thead><tr><th>店舗</th><th>状態</th><th>行動</th><th>理由</th></tr></thead><tbody>${decisionRows}</tbody></table></div>`
            : '<p class="muted-text">競合は3日ごとに判断する。まだ行動履歴はない。</p>'
        }
      </section>
      <section>
        <h3>最近の行動履歴</h3>
        ${history ? `<ol class="timeline-list">${history}</ol>` : '<p class="muted-text">行動履歴なし</p>'}
      </section>
    </div>
  `;
}

function renderReports(): void {
  const report = selectedReport();
  renderDailyReport(report);
  renderInventoryReport(report);
  renderRegionalReport(report);
  renderCompetitorReport(report);

  for (const section of document.querySelectorAll<HTMLElement>(".report-content")) {
    section.hidden = section.id !== `${selectedTab}-report`;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(".tab-button")) {
    button.classList.toggle("active", button.dataset.tab === selectedTab);
  }
}

function render(): void {
  const snapshot = simulation.getSnapshot();
  const reports = simulation.getAllDailyReports();
  const latest = reports.at(-1);
  const clock = formatClock(snapshot.day, snapshot.slot);
  const isOpen =
    6 + snapshot.slot / 4 >= snapshot.playerStore.openingHour &&
    6 + snapshot.slot / 4 < snapshot.playerStore.closingHour &&
    !snapshot.finished;

  element<HTMLElement>("day-label").textContent = clock.dayLabel;
  element<HTMLElement>("time-label").textContent = clock.timeLabel;
  element<HTMLElement>("cash-label").textContent = formatYen(snapshot.cash);
  element<HTMLElement>("status-label").textContent = snapshot.finished
    ? "30日営業完了"
    : isPlaying()
      ? "時間進行中"
      : "一時停止中";
  element<HTMLElement>("weather-label").textContent = latest
    ? `直近日報：${latest.weather === "rain" ? "雨" : "晴"}`
    : "天候未確定";

  const openBadge = element<HTMLElement>("store-open-badge");
  openBadge.textContent = snapshot.finished ? "営業終了" : isOpen ? "営業中" : "閉店中";
  openBadge.classList.toggle("open", isOpen);

  const playerVisits = latest?.visitsByStore[scenario.playerStore.id] ?? 0;
  element<HTMLElement>("visit-metric").textContent = latest ? formatNumber(playerVisits) : "—";
  element<HTMLElement>("shelf-metric").textContent = latest
    ? formatNumber(latest.operationalShelfStockoutUnits)
    : "—";
  element<HTMLElement>("queue-metric").textContent = formatNumber(snapshot.operations.queueCustomers);
  element<HTMLElement>("inventory-metric").textContent = latest
    ? formatNumber(latest.backroomInventoryUnitsEnd)
    : "—";
  element<HTMLElement>("backlog-metric").textContent = formatNumber(
    sumOperationRecord(snapshot.operations.backlogByTask),
  );
  element<HTMLElement>("revenue-kpi").textContent = latest ? formatYen(latest.revenue) : "—";
  element<HTMLElement>("profit-kpi").textContent = latest ? formatYen(latest.profit) : "—";
  element<HTMLElement>("profit-kpi").className = latest?.profit && latest.profit < 0 ? "negative-value" : "";
  element<HTMLElement>("abandon-kpi").textContent = latest
    ? `${formatNumber(latest.abandonedCustomers)}人`
    : "—";
  element<HTMLElement>("waste-kpi").textContent = latest ? formatYen(latest.wasteCost) : "—";

  renderAlerts(buildDashboardAlerts(latest));
  renderReportDaySelect(reports);
  renderReports();

  for (const id of ["play-button", "slot-button", "day-button", "week-button", "end-button"]) {
    element<HTMLButtonElement>(id).disabled = false;
  }
}

function bindEvents(): void {
  playButton.addEventListener("click", togglePlayback);
  element<HTMLButtonElement>("slot-button").addEventListener("click", () => {
    stopPlayback();
    lastStopReason = "";
    simulation.advanceSlot();
    afterAdvance(true);
  });
  element<HTMLButtonElement>("day-button").addEventListener("click", () => advanceDays(1));
  element<HTMLButtonElement>("week-button").addEventListener("click", () => advanceDays(7));
  element<HTMLButtonElement>("end-button").addEventListener("click", runToEnd);
  element<HTMLButtonElement>("reset-button").addEventListener("click", () => resetSimulation());
  element<HTMLButtonElement>("apply-policy-button").addEventListener("click", applyPolicies);
  speedSelect.addEventListener("change", () => {
    if (isPlaying()) {
      startPlayback();
    }
  });
  reportDaySelect.addEventListener("change", () => {
    const day = Number.parseInt(reportDaySelect.value, 10);
    selectedReportDay = Number.isFinite(day) ? day : undefined;
    renderReports();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>(".tab-button")) {
    button.addEventListener("click", () => {
      selectedTab = button.dataset.tab ?? "daily";
      renderReports();
    });
  }
}

async function initialize(): Promise<void> {
  try {
    scenario = await loadBrowserScenario();
    element<HTMLElement>("scenario-name").textContent = `フリープレイ / ${scenario.district.displayName}`;
    buildPolicyControls();
    browserSession = createBrowserFreePlaySession(scenario, currentSeed());
    simulation = browserSession.simulation;
    seedInput.value = String(browserSession.seed);
    bindEvents();
    syncPolicyForm();
    if (browserSession.restored) {
      policyMessage.textContent = `${simulation.getSnapshot().day}日目の自動保存から再開した。`;
      policyMessage.className = "form-message success-message";
    }
    render();
    loadingScreen.hidden = true;
    app.hidden = false;
    window.addEventListener("beforeunload", () => browserSession.flushSave());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) browserSession.flushSave();
    });
  } catch (error) {
    loadingMessage.textContent = error instanceof Error ? error.message : "初期化に失敗した";
    loadingScreen.classList.add("loading-error");
  }
}

void initialize();
