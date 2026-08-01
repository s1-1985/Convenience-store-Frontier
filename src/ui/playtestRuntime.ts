import {
  PLAYTEST_ISSUE_IDS,
  assessPlaytestSession,
  createPlaytestSession,
  finishPlaytestSession,
  markPlaytestReportInteraction,
  pausePlaytestSession,
  recordPlaytestAutoStop,
  recordPlaytestCampaignCheckpoint,
  recordPlaytestControl,
  recordPlaytestFinalEvaluation,
  recordPlaytestPolicyDecision,
  recordPlaytestVisualDetection,
  refreshPlaytestElapsed,
  resumePlaytestSession,
  summarizePlaytestSessions,
  updatePlaytestProgress,
  type PlaytestControlId,
  type PlaytestFinishReason,
  type PlaytestIssueId,
  type PlaytestPolicySnapshot,
  type PlaytestSession,
} from "../playtest/session.js";
import "./playtest.css";

const ACTIVE_STORAGE_KEY = "csf.playtest.active.v1";
const HISTORY_STORAGE_KEY = "csf.playtest.history.v1";
const MAX_HISTORY = 20;

const ISSUE_LABELS: Record<PlaytestIssueId, string> = {
  queue: "行列",
  empty_shelf: "空棚",
  closed_demand: "閉店後客",
  work_backlog: "作業滞留",
  waste: "廃棄",
};

const CONTROL_BY_ID: Readonly<Record<string, PlaytestControlId>> = {
  "play-button": "play_toggle",
  "slot-button": "advance_slot",
  "day-button": "advance_day",
  "week-button": "advance_week",
  "end-button": "run_to_end",
};

let session: PlaytestSession | null = null;
let history: PlaytestSession[] = [];
let panel: HTMLElement | null = null;
let rendering = false;
let renderQueued = false;
let lastAutoStopReason = "";

function optionalElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function parseNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const normalized = text.replaceAll(",", "").replaceAll("−", "-");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function currentDay(): number {
  return Math.max(1, Math.round(parseNumber(optionalElement("day-label")?.textContent)));
}

function currentTimeLabel(): string {
  return optionalElement("time-label")?.textContent?.trim() || "06:00";
}

function currentMoment(): { day: number; timeLabel: string; nowEpochMs: number } {
  return { day: currentDay(), timeLabel: currentTimeLabel(), nowEpochMs: Date.now() };
}

function completedDay(): number {
  const select = optionalElement<HTMLSelectElement>("report-day-select");
  if (!select || select.disabled) return 0;
  const days = [...select.options]
    .map((option) => Number.parseInt(option.value, 10))
    .filter(Number.isFinite);
  return days.length > 0 ? Math.max(...days) : 0;
}

function currentSeed(): number {
  const value = Number.parseInt(optionalElement<HTMLInputElement>("seed-input")?.value ?? "1977", 10);
  return Number.isFinite(value) ? value : 1977;
}

function scenarioName(): string {
  return optionalElement("scenario-name")?.textContent?.trim() || "フリープレイ";
}

function readNumericInputs(selector: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const input of document.querySelectorAll<HTMLInputElement>(selector)) {
    const key = input.dataset.categoryId ?? input.id.replace(/^staff-/, "");
    const value = Number.parseInt(input.value, 10);
    if (key && Number.isFinite(value)) values[key] = value;
  }
  return values;
}

function readPolicySnapshot(): PlaytestPolicySnapshot {
  const priorities = [...document.querySelectorAll<HTMLSelectElement>("select[id^='priority-']")]
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
    .map((select) => select.value);
  return {
    openingHour: Number.parseInt(optionalElement<HTMLSelectElement>("opening-hour-select")?.value ?? "8", 10),
    closingHour: Number.parseInt(optionalElement<HTMLSelectElement>("closing-hour-select")?.value ?? "20", 10),
    orderingPolicy: optionalElement<HTMLSelectElement>("ordering-policy-select")?.value ?? "standard",
    deliveryPolicy: optionalElement<HTMLSelectElement>("delivery-policy-select")?.value ?? "once_daily",
    staffing: readNumericInputs("#staffing-controls input"),
    taskPriorities: priorities,
    categoryArea: readNumericInputs("#category-area-controls input"),
  };
}

function isPlaytestSession(value: unknown): value is PlaytestSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlaytestSession>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.seed === "number" &&
    Array.isArray(candidate.policyDecisions) &&
    Array.isArray(candidate.visualDetections)
  );
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable in private or embedded browser contexts.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function loadHistory(): PlaytestSession[] {
  const stored = readStorage<unknown>(HISTORY_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter(isPlaytestSession).slice(0, MAX_HISTORY) : [];
}

function persist(): void {
  if (!session) return;
  session = refreshPlaytestElapsed(session, Date.now());
  writeStorage(ACTIVE_STORAGE_KEY, session);
  writeStorage(HISTORY_STORAGE_KEY, history);
}

function archive(candidate: PlaytestSession): void {
  history = [candidate, ...history.filter((entry) => entry.sessionId !== candidate.sessionId)].slice(
    0,
    MAX_HISTORY,
  );
  writeStorage(HISTORY_STORAGE_KEY, history);
}

function finishCurrent(reason: PlaytestFinishReason): void {
  if (!session || session.finished) return;
  session = finishPlaytestSession(session, reason, Date.now());
  archive(session);
  writeStorage(ACTIVE_STORAGE_KEY, session);
}

function startNewSession(): void {
  const now = Date.now();
  session = createPlaytestSession({
    seed: currentSeed(),
    scenarioName: scenarioName(),
    initialPolicy: readPolicySnapshot(),
    nowEpochMs: now,
  });
  lastAutoStopReason = "";
  writeStorage(ACTIVE_STORAGE_KEY, session);
  queueRender();
}

function recoverInterruptedSession(): PlaytestSession | null {
  const stored = readStorage<unknown>(ACTIVE_STORAGE_KEY, null);
  if (!isPlaytestSession(stored)) {
    removeStorage(ACTIVE_STORAGE_KEY);
    return null;
  }
  if (stored.finished) {
    archive(stored);
    removeStorage(ACTIVE_STORAGE_KEY);
    return null;
  }
  const resumed = resumePlaytestSession(stored, Date.now());
  writeStorage(ACTIVE_STORAGE_KEY, resumed);
  return resumed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}秒`;
  const wholeMinutes = Math.floor(minutes);
  const seconds = Math.round((minutes - wholeMinutes) * 60);
  return `${wholeMinutes}分${seconds.toString().padStart(2, "0")}秒`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ensurePanel(): HTMLElement | null {
  if (panel?.isConnected) return panel;
  const leftColumn = document.querySelector<HTMLElement>(".left-column");
  if (!leftColumn) return null;
  const created = document.createElement("article");
  created.id = "playtest-panel";
  created.className = "panel playtest-panel";
  leftColumn.append(created);
  panel = created;
  return created;
}

function exportedSessions(): PlaytestSession[] {
  if (!session) return history;
  return [session, ...history.filter((entry) => entry.sessionId !== session?.sessionId)];
}

function aggregateSessions(): PlaytestSession[] {
  const finishedHistory = history.filter((entry) => entry.finished);
  const currentSession = session;
  if (!currentSession?.finished) return finishedHistory;
  return [
    currentSession,
    ...finishedHistory.filter((entry) => entry.sessionId !== currentSession.sessionId),
  ];
}

function renderPanel(): void {
  const host = ensurePanel();
  if (!host || !session) return;
  session = refreshPlaytestElapsed(session, Date.now());
  const assessment = assessPlaytestSession(session, Date.now());
  const aggregate = summarizePlaytestSessions(aggregateSessions());
  const detected = new Set(session.visualDetections.map((entry) => entry.issueId));
  const detectionButtons = PLAYTEST_ISSUE_IDS.map(
    (issueId) => `
      <button
        type="button"
        class="playtest-detection-button${detected.has(issueId) ? " detected" : ""}"
        data-playtest-issue="${issueId}"
        ${detected.has(issueId) ? "disabled" : ""}
      >${detected.has(issueId) ? "✓" : "+"} ${escapeHtml(ISSUE_LABELS[issueId])}</button>
    `,
  ).join("");
  const resultClass = assessment.passesSessionTargets ? "pass" : session.finished ? "fail" : "pending";

  host.innerHTML = `
    <div class="playtest-heading">
      <div><p class="eyebrow">LOCAL PLAYTEST LOG</p><h2>試作計測</h2></div>
      <span class="playtest-privacy">端末内のみ</span>
    </div>
    <div class="playtest-metrics">
      <div><span>実時間</span><strong>${formatDuration(assessment.durationMinutes)}</strong></div>
      <div><span>経過日</span><strong>${session.completedDay}日</strong></div>
      <div><span>重要判断</span><strong>${assessment.meaningfulDecisionCount}/6</strong></div>
      <div><span>数値前の気づき</span><strong>${formatPercent(assessment.visualDiscoveryRate)}</strong></div>
    </div>
    <section class="playtest-detection-section">
      <div class="playtest-section-title">
        <h3>店内表示だけで気づいた</h3><small>数値レポートを見る前に押す</small>
      </div>
      <div class="playtest-detection-grid">${detectionButtons}</div>
    </section>
    <div class="playtest-checks ${resultClass}">
      <div><span>${assessment.completedThirtyDays ? "✓" : "○"}</span>30日到達</div>
      <div><span>●</span>終了条件なし</div>
      <div><span>${assessment.minimumDecisionsMet ? "✓" : "○"}</span>重要判断6回</div>
      <div><span>${assessment.visualDiscoveryTargetMet ? "✓" : "○"}</span>3現象以上・60%</div>
    </div>
    <div class="playtest-history-summary">
      <span>完了セッション ${aggregate.sessionCount}件</span>
      <span>視覚発見合格 ${formatPercent(aggregate.visualTesterPassRate)}</span>
      <span>${aggregate.sampleReady ? "標本数到達" : "5件で標本到達"}</span>
    </div>
    <div class="playtest-actions">
      <button type="button" class="primary-button" data-playtest-action="export">JSON出力</button>
      <button type="button" class="ghost-button" data-playtest-action="clear">保存履歴を消去</button>
    </div>
    <p class="playtest-note">フリープレイの操作、方針変更、気づき、継続時間を記録する。ネットワーク送信は行わない。</p>
  `;
}

function queueRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    rendering = true;
    try {
      renderPanel();
    } finally {
      rendering = false;
    }
  });
}

function capturePolicyDecision(): void {
  if (!session || session.finished) return;
  const message = optionalElement("policy-message");
  if (!message?.classList.contains("success-message") || !message.textContent?.includes("反映")) return;
  session = recordPlaytestPolicyDecision(session, readPolicySnapshot(), currentMoment());
  persist();
  queueRender();
}

function recordReportInteraction(): void {
  if (!session || session.finished) return;
  session = markPlaytestReportInteraction(session, currentDay(), Date.now());
  persist();
  queueRender();
}

function recordControl(controlId: PlaytestControlId): void {
  if (!session || session.finished) return;
  session = recordPlaytestControl(session, controlId, Date.now());
  persist();
  queueRender();
}

function recordCurrentCampaignCheckpoint(): void {
  if (!session || session.finished) return;
  const eventCard = document.querySelector<HTMLElement>("#campaign-panel .campaign-event:not(.empty)");
  const title = eventCard?.querySelector("h3")?.textContent?.trim();
  if (!eventCard || !title) return;
  const button = eventCard.querySelector<HTMLButtonElement>("[data-event-id]");
  const id = button?.dataset.eventId || `campaign-${title}`;
  const dayText = eventCard.querySelector<HTMLElement>(".campaign-event-meta span")?.textContent ?? "";
  session = recordPlaytestCampaignCheckpoint(
    session,
    { id, title, day: Math.max(0, Math.round(parseNumber(dayText))) },
    Date.now(),
  );
}

function acknowledgeCampaignCheckpoint(button: HTMLButtonElement): void {
  if (!session || session.finished) return;
  const eventCard = button.closest<HTMLElement>(".campaign-event");
  const title = eventCard?.querySelector("h3")?.textContent?.trim();
  if (!eventCard || !title) return;
  const id = button.dataset.eventId || `campaign-${title}`;
  const dayText = eventCard.querySelector<HTMLElement>(".campaign-event-meta span")?.textContent ?? "";
  session = recordPlaytestCampaignCheckpoint(
    session,
    {
      id,
      title,
      day: Math.max(0, Math.round(parseNumber(dayText))),
      acknowledged: true,
    },
    Date.now(),
  );
  persist();
}

function captureFinalEvaluation(): void {
  if (!session) return;
  const final = document.querySelector<HTMLElement>("#campaign-panel .campaign-final");
  if (!final) return;
  const grade = final.querySelector<HTMLElement>(".campaign-grade > span")?.textContent?.trim() ?? "";
  const title = final.querySelector<HTMLElement>(".campaign-grade strong")?.textContent?.trim() ?? "";
  const score = Math.round(parseNumber(final.querySelector<HTMLElement>(".campaign-grade p")?.textContent));
  if (!grade && !title && score === 0) return;
  session = recordPlaytestFinalEvaluation(session, { grade, title, score }, Date.now());
}

function synchronizeDomState(): void {
  if (!session) return;
  session = updatePlaytestProgress(session, completedDay(), Date.now());
  recordCurrentCampaignCheckpoint();

  const stopReason = optionalElement("stop-reason")?.textContent?.trim() ?? "";
  if (stopReason.startsWith("自動停止") && stopReason !== lastAutoStopReason) {
    lastAutoStopReason = stopReason;
    session = recordPlaytestAutoStop(session, stopReason, currentMoment());
  }

  captureFinalEvaluation();
  persist();
  queueRender();
}

function exportJson(): void {
  persist();
  const sessions = exportedSessions();
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    currentSession: session,
    sessions,
    aggregate: summarizePlaytestSessions(aggregateSessions()),
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `convenience-store-frontier-playtest-${currentSeed()}-${Date.now()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearHistory(): void {
  if (!window.confirm("保存済みのプレイテスト履歴を消去しますか？現在の計測は残ります。")) return;
  history = [];
  writeStorage(HISTORY_STORAGE_KEY, history);
  queueRender();
}

function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;

  const issueButton = target.closest<HTMLButtonElement>("[data-playtest-issue]");
  if (issueButton && session && !session.finished) {
    const issueId = issueButton.dataset.playtestIssue as PlaytestIssueId | undefined;
    if (issueId && PLAYTEST_ISSUE_IDS.includes(issueId)) {
      session = recordPlaytestVisualDetection(session, issueId, currentMoment());
      persist();
      queueRender();
    }
    return;
  }

  const actionButton = target.closest<HTMLButtonElement>("[data-playtest-action]");
  if (actionButton?.dataset.playtestAction === "export") {
    exportJson();
    return;
  }
  if (actionButton?.dataset.playtestAction === "clear") {
    clearHistory();
    return;
  }

  if (target.closest(".report-panel")) recordReportInteraction();

  const button = target.closest<HTMLButtonElement>("button");
  if (!button) return;
  const controlId = CONTROL_BY_ID[button.id];
  if (controlId) recordControl(controlId);

  if (button.id === "apply-policy-button") window.setTimeout(capturePolicyDecision, 0);
  if (button.id === "reset-button") {
    if (session && !session.finished) {
      session = recordPlaytestControl(session, "reset", Date.now());
      finishCurrent("reset");
    }
    window.setTimeout(startNewSession, 0);
  }
  if (button.matches("#campaign-panel [data-campaign-action='ack']")) {
    acknowledgeCampaignCheckpoint(button);
  }
}

function mutationInsidePanel(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  return Boolean(target?.closest("#playtest-panel"));
}

function startObserver(app: HTMLElement): void {
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      synchronizeDomState();
    });
  };
  const observer = new MutationObserver((records) => {
    if (rendering || records.every(mutationInsidePanel)) return;
    schedule();
  });
  observer.observe(app, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "value", "class", "disabled"],
  });
  window.setInterval(() => {
    if (session && !session.finished) persist();
    queueRender();
  }, 1_000);
}

function start(): void {
  const app = optionalElement<HTMLElement>("app");
  const openingHour = optionalElement("opening-hour-select");
  if (!app || app.hidden || !openingHour) {
    window.setTimeout(start, 100);
    return;
  }

  history = loadHistory();
  session = recoverInterruptedSession();
  if (!session) startNewSession();
  document.addEventListener("click", handleClick);
  document.addEventListener("visibilitychange", () => {
    if (!session || session.finished) return;
    session = document.hidden
      ? pausePlaytestSession(session, Date.now())
      : resumePlaytestSession(session, Date.now());
    persist();
  });
  window.addEventListener("beforeunload", () => {
    if (!session || session.finished) return;
    session = pausePlaytestSession(session, Date.now());
    writeStorage(ACTIVE_STORAGE_KEY, session);
  });
  startObserver(app);
  synchronizeDomState();
}

start();
