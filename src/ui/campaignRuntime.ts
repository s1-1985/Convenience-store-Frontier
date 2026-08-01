import {
  createCampaignController,
  type CampaignEvent,
  type CampaignObservation,
  type CampaignSnapshot,
} from "../campaign/campaign.js";
import type { DeliveryPolicyId, OrderingPolicyId } from "../simulation/types.js";
import "./campaign.css";

const controller = createCampaignController();
let campaignPanel: HTMLElement | null = null;
let renderQueued = false;
let rendering = false;
let lastAttentionSequence = 0;

function optionalElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function numberFromText(text: string | null | undefined): number {
  if (!text || text.includes("—")) {
    return 0;
  }
  const normalized = text.replaceAll(",", "").replace(/[^\d.+-]/g, "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

function percentFromText(text: string | null | undefined): number {
  return numberFromText(text) / 100;
}

function integerInput(id: string, fallback: number): number {
  const input = optionalElement<HTMLInputElement | HTMLSelectElement>(id);
  if (!input) {
    return fallback;
  }
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function currentDay(): number {
  return Math.max(1, Math.round(numberFromText(optionalElement("day-label")?.textContent)));
}

function completedDay(): number {
  const select = optionalElement<HTMLSelectElement>("report-day-select");
  if (!select || select.disabled) {
    return 0;
  }
  const days = [...select.options]
    .map((option) => Number.parseInt(option.value, 10))
    .filter(Number.isFinite);
  return days.length > 0 ? Math.max(...days) : 0;
}

function latestCauseValue(index: number): number {
  const cards = document.querySelectorAll<HTMLElement>("#inventory-report .cause-card");
  return numberFromText(cards[index]?.querySelector("strong")?.textContent);
}

function habitMaximums(): { adoption: number; contribution: number } {
  let adoption = 0;
  let contribution = 0;
  for (const card of document.querySelectorAll<HTMLElement>("#regional-report .habit-card")) {
    for (const row of card.querySelectorAll<HTMLElement>(".habit-values span")) {
      const strong = row.querySelector("strong")?.textContent;
      if (row.textContent?.includes("地域定着")) {
        adoption = Math.max(adoption, percentFromText(strong));
      }
      if (row.textContent?.includes("自社寄与")) {
        contribution = Math.max(contribution, percentFromText(strong));
      }
    }
  }
  return { adoption, contribution };
}

function readPolicy(): CampaignObservation["policy"] {
  const prioritySelects = [...document.querySelectorAll<HTMLSelectElement>("select[id^='priority-']")];
  const registerIndex = prioritySelects.findIndex((select) => select.value === "register");
  return {
    openingHour: integerInput("opening-hour-select", 8),
    closingHour: integerInput("closing-hour-select", 20),
    orderingPolicy:
      (optionalElement<HTMLSelectElement>("ordering-policy-select")?.value as OrderingPolicyId | undefined) ??
      "standard",
    deliveryPolicy:
      (optionalElement<HTMLSelectElement>("delivery-policy-select")?.value as DeliveryPolicyId | undefined) ??
      "once_daily",
    morningStaff: integerInput("staff-morning", 1),
    middayStaff: integerInput("staff-midday", 1),
    eveningStaff: integerInput("staff-evening", 1),
    registerPriority: registerIndex >= 0 ? registerIndex + 1 : 5,
    readyToEatArea: integerInput("category-category_ready_to_eat", 0),
  };
}

function readObservation(): CampaignObservation {
  const habits = habitMaximums();
  return {
    currentDay: currentDay(),
    completedDay: completedDay(),
    operatingCash: numberFromText(optionalElement("cash-label")?.textContent),
    latestProfit: numberFromText(optionalElement("profit-kpi")?.textContent),
    playerVisits: numberFromText(optionalElement("visit-metric")?.textContent),
    abandonedCustomers: numberFromText(optionalElement("abandon-kpi")?.textContent),
    stockoutUnits: latestCauseValue(0),
    shelfStockoutUnits: latestCauseValue(1),
    wasteCost: numberFromText(optionalElement("waste-kpi")?.textContent),
    workBacklog: numberFromText(optionalElement("backlog-metric")?.textContent),
    maxRegionalAdoption: habits.adoption,
    maxPlayerContribution: habits.contribution,
    competitorActionCount: document.querySelectorAll("#competitor-report .timeline-list li").length,
    policy: readPolicy(),
  };
}

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function eventDayLabel(event: CampaignEvent): string {
  return event.day <= 0 ? "開業前" : `${event.day}日目`;
}

function ensurePanel(): HTMLElement | null {
  if (campaignPanel?.isConnected) {
    return campaignPanel;
  }
  const leftColumn = document.querySelector<HTMLElement>(".left-column");
  if (!leftColumn) {
    return null;
  }
  const panel = document.createElement("article");
  panel.id = "campaign-panel";
  panel.className = "panel campaign-panel";
  const alertPanel = leftColumn.querySelector(".alert-panel");
  leftColumn.insertBefore(panel, alertPanel);
  campaignPanel = panel;
  return panel;
}

function maybeStopForAttention(newEvents: readonly CampaignEvent[]): void {
  const attention = newEvents
    .filter((event) => event.priority !== "normal")
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (!attention || attention.sequence <= lastAttentionSequence) {
    return;
  }
  lastAttentionSequence = attention.sequence;
  const playButton = optionalElement<HTMLButtonElement>("play-button");
  if (playButton?.textContent?.includes("停止")) {
    playButton.click();
  }
}

function renderObjectives(snapshot: CampaignSnapshot): string {
  return snapshot.objectives
    .map((objective) => {
      const statusLabel =
        objective.status === "completed"
          ? "達成"
          : objective.status === "active"
            ? "進行中"
            : `${objective.unlockDay}日目解放`;
      return `
        <li class="campaign-objective ${objective.status}">
          <span class="objective-mark" aria-hidden="true">${objective.status === "completed" ? "✓" : objective.status === "active" ? "●" : "○"}</span>
          <div>
            <div class="objective-title-row"><strong>${escapeHtml(objective.title)}</strong><small>${statusLabel}</small></div>
            <p>${escapeHtml(objective.solution ?? objective.description)}</p>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderCurrentEvent(snapshot: CampaignSnapshot): string {
  const event = snapshot.pendingEvents[0];
  if (!event) {
    return `
      <div class="campaign-event empty">
        <span class="campaign-event-kicker">NEXT CHECKPOINT</span>
        <h3>新しい報告はない</h3>
        <p>営業を進めると、店舗状況と日付に応じて次の判断材料が届く。</p>
      </div>
    `;
  }
  const loanButton =
    event.actionId === "accept_emergency_loan"
      ? '<button type="button" class="campaign-loan-button" data-campaign-action="loan">緊急融資を利用する</button>'
      : "";
  return `
    <div class="campaign-event ${event.priority} ${event.kind}">
      <div class="campaign-event-meta">
        <span>${eventDayLabel(event)}</span>
        <span>${event.kind.toUpperCase()}</span>
      </div>
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.body)}</p>
      <div class="campaign-event-actions">
        ${loanButton}
        <button type="button" class="campaign-ack-button" data-campaign-action="ack" data-event-id="${escapeHtml(event.id)}">確認した</button>
      </div>
    </div>
  `;
}

function renderEvaluation(snapshot: CampaignSnapshot): string {
  const evaluation = snapshot.evaluation;
  if (!evaluation) {
    return "";
  }
  const dimensions = evaluation.dimensions
    .map(
      (dimension) => `
        <div class="campaign-score-row">
          <div><span>${escapeHtml(dimension.label)}</span><strong>${dimension.score}/${dimension.maxScore}</strong></div>
          <progress max="${dimension.maxScore}" value="${dimension.score}"></progress>
          <small>${escapeHtml(dimension.summary)}</small>
        </div>
      `,
    )
    .join("");
  const history = snapshot.companyHistory
    .map(
      (entry) => `
        <li class="${entry.tone}">
          <span>${entry.day}日目</span>
          <div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.description)}</p></div>
        </li>
      `,
    )
    .join("");
  return `
    <section class="campaign-final">
      <div class="campaign-grade"><span>${evaluation.grade}</span><div><small>FINAL RANK</small><strong>${escapeHtml(evaluation.title)}</strong><p>${evaluation.totalScore}点</p></div></div>
      <p class="campaign-final-summary">${escapeHtml(evaluation.summary)}</p>
      <div class="campaign-score-grid">${dimensions}</div>
      <h3>旭駅東口店 企業史</h3>
      <ol class="campaign-history">${history}</ol>
    </section>
  `;
}

function renderArchive(snapshot: CampaignSnapshot): string {
  const items = [...snapshot.events]
    .reverse()
    .slice(0, 8)
    .map(
      (event) => `
        <li class="${event.acknowledged ? "acknowledged" : "pending"}">
          <span>${eventDayLabel(event)}</span>
          <strong>${escapeHtml(event.title)}</strong>
        </li>
      `,
    )
    .join("");
  return items || '<li class="muted">履歴なし</li>';
}

function renderPanel(snapshot: CampaignSnapshot): void {
  const panel = ensurePanel();
  if (!panel) {
    return;
  }
  const completedCount = snapshot.objectives.filter((objective) => objective.status === "completed").length;
  panel.innerHTML = `
    <div class="campaign-heading">
      <div>
        <p class="eyebrow">30-DAY CAMPAIGN</p>
        <h2>開業30日計画</h2>
      </div>
      <span class="campaign-day-badge">${snapshot.completedDay}/30日</span>
    </div>
    <div class="campaign-progress" aria-label="30日進行度"><span style="width:${snapshot.progress * 100}%"></span></div>
    <div class="campaign-finance-grid">
      <div><span>営業現金</span><strong>${formatYen(snapshot.operatingCash)}</strong></div>
      <div><span>利用可能資金</span><strong>${formatYen(snapshot.effectiveCash)}</strong></div>
      <div><span>返済予定</span><strong>${snapshot.debtOutstanding > 0 ? formatYen(snapshot.debtOutstanding) : "なし"}</strong></div>
      <div><span>目標達成</span><strong>${completedCount}/${snapshot.objectives.length}</strong></div>
    </div>
    ${renderCurrentEvent(snapshot)}
    <details class="campaign-objectives-wrap" open>
      <summary>経営目標</summary>
      <ol class="campaign-objectives">${renderObjectives(snapshot)}</ol>
    </details>
    ${renderEvaluation(snapshot)}
    <details class="campaign-archive-wrap">
      <summary>最近の出来事</summary>
      <ol class="campaign-archive">${renderArchive(snapshot)}</ol>
    </details>
  `;

  panel.querySelector<HTMLButtonElement>("[data-campaign-action='ack']")?.addEventListener("click", (event) => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.eventId;
    if (id) {
      controller.acknowledgeEvent(id);
      renderPanel(controller.getSnapshot());
    }
  });
  panel.querySelector<HTMLButtonElement>("[data-campaign-action='loan']")?.addEventListener("click", () => {
    controller.acceptEmergencyLoan(currentDay());
    renderPanel(controller.getSnapshot());
  });
}

function observeAndRender(): void {
  const app = optionalElement<HTMLElement>("app");
  if (!app || app.hidden) {
    return;
  }
  const update = controller.observe(readObservation());
  maybeStopForAttention(update.newEvents);
  rendering = true;
  try {
    renderPanel(controller.getSnapshot());
  } finally {
    rendering = false;
  }
}

function queueRender(): void {
  if (renderQueued) {
    return;
  }
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    observeAndRender();
  });
}

function mutationInsideCampaign(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  return Boolean(target?.closest("#campaign-panel"));
}

function start(): void {
  const app = optionalElement<HTMLElement>("app");
  if (!app) {
    window.setTimeout(start, 100);
    return;
  }
  const observer = new MutationObserver((records) => {
    if (rendering || records.every(mutationInsideCampaign)) {
      return;
    }
    queueRender();
  });
  observer.observe(app, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "value", "class"],
  });
  document.addEventListener("change", queueRender);
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest("#campaign-panel")) {
      window.setTimeout(queueRender, 0);
    }
  });
  queueRender();
}

start();
