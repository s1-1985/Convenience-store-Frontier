import type { DeliveryPolicyId, OrderingPolicyId } from "../simulation/types.js";

export const CAMPAIGN_OBJECTIVE_IDS = [
  "morning_strategy",
  "lunch_supply",
  "queue_control",
  "waste_control",
  "night_strategy",
  "delivery_strategy",
  "regional_habit",
  "competitive_response",
] as const;

export type CampaignObjectiveId = (typeof CAMPAIGN_OBJECTIVE_IDS)[number];
export type CampaignObjectiveStatus = "locked" | "active" | "completed";
export type CampaignEventPriority = "normal" | "important" | "critical";
export type CampaignEventKind =
  | "briefing"
  | "problem"
  | "opportunity"
  | "report"
  | "crisis"
  | "milestone"
  | "final";

export interface CampaignPolicyObservation {
  openingHour: number;
  closingHour: number;
  orderingPolicy: OrderingPolicyId;
  deliveryPolicy: DeliveryPolicyId;
  morningStaff: number;
  middayStaff: number;
  eveningStaff: number;
  registerPriority: number;
  readyToEatArea: number;
}

export interface CampaignObservation {
  currentDay: number;
  completedDay: number;
  operatingCash: number;
  latestProfit: number;
  playerVisits: number;
  abandonedCustomers: number;
  stockoutUnits: number;
  shelfStockoutUnits: number;
  wasteCost: number;
  workBacklog: number;
  maxRegionalAdoption: number;
  maxPlayerContribution: number;
  competitorActionCount: number;
  policy: CampaignPolicyObservation;
}

export interface CampaignEvent {
  id: string;
  sequence: number;
  day: number;
  title: string;
  body: string;
  kind: CampaignEventKind;
  priority: CampaignEventPriority;
  objectiveId?: CampaignObjectiveId;
  actionId?: "accept_emergency_loan";
  acknowledged: boolean;
}

export interface CampaignObjective {
  id: CampaignObjectiveId;
  title: string;
  description: string;
  unlockDay: number;
  status: CampaignObjectiveStatus;
  completedDay?: number;
  solution?: string;
}

export interface CampaignLoan {
  acceptedDay: number;
  principal: number;
  repaymentAmount: number;
}

export interface CampaignScoreDimension {
  id: "profitability" | "service" | "regional" | "strategy" | "resilience";
  label: string;
  score: number;
  maxScore: number;
  summary: string;
}

export interface CampaignEvaluation {
  totalScore: number;
  grade: "S" | "A" | "B" | "C" | "D";
  title: string;
  dimensions: CampaignScoreDimension[];
  summary: string;
}

export interface CompanyHistoryEntry {
  day: number;
  title: string;
  description: string;
  tone: "positive" | "neutral" | "warning";
}

export interface CampaignDayRecord {
  day: number;
  operatingCash: number;
  effectiveCash: number;
  profit: number;
  playerVisits: number;
  abandonedCustomers: number;
  stockoutUnits: number;
  shelfStockoutUnits: number;
  wasteCost: number;
  workBacklog: number;
  maxRegionalAdoption: number;
  maxPlayerContribution: number;
}

export interface CampaignPolicyHistoryEntry {
  day: number;
  summary: string;
  fingerprint: string;
}

export interface CampaignSnapshot {
  currentDay: number;
  completedDay: number;
  progress: number;
  operatingCash: number;
  effectiveCash: number;
  debtOutstanding: number;
  loan: CampaignLoan | null;
  objectives: CampaignObjective[];
  events: CampaignEvent[];
  pendingEvents: CampaignEvent[];
  dayRecords: CampaignDayRecord[];
  policyHistory: CampaignPolicyHistoryEntry[];
  evaluation: CampaignEvaluation | null;
  companyHistory: CompanyHistoryEntry[];
}

export interface CampaignUpdate {
  newEvents: CampaignEvent[];
  newlyCompletedObjectives: CampaignObjective[];
  reset: boolean;
}

export interface CampaignController {
  observe(observation: CampaignObservation): CampaignUpdate;
  acknowledgeEvent(eventId: string): void;
  acceptEmergencyLoan(day?: number): CampaignLoan;
  getSnapshot(): CampaignSnapshot;
  reset(): void;
}

interface ObjectiveDefinition {
  id: CampaignObjectiveId;
  title: string;
  description: string;
  unlockDay: number;
}

interface ScheduledEventDefinition {
  id: string;
  day: number;
  title: string;
  kind: CampaignEventKind;
  priority: CampaignEventPriority;
  objectiveId?: CampaignObjectiveId;
  body(observation: CampaignObservation): string;
}

const LOAN_PRINCIPAL = 300_000;
const LOAN_REPAYMENT = 330_000;
const CRISIS_CASH_THRESHOLD = 150_000;

const OBJECTIVE_DEFINITIONS: readonly ObjectiveDefinition[] = [
  {
    id: "morning_strategy",
    title: "朝需要への方針を決める",
    description: "早朝営業で需要を取り込むか、短時間営業で利益を守るかを明確にする。",
    unlockDay: 1,
  },
  {
    id: "lunch_supply",
    title: "昼食需要を安定供給する",
    description: "発注、売場、納品のいずれかを使い、即食食品の欠品を抑える。",
    unlockDay: 2,
  },
  {
    id: "queue_control",
    title: "レジ混雑を制御する",
    description: "人員または作業優先順位を調整し、会計離脱を抑える。",
    unlockDay: 3,
  },
  {
    id: "waste_control",
    title: "欠品と廃棄を両立させる",
    description: "売り切り、分納、実績改善のいずれかで廃棄負担を抑える。",
    unlockDay: 4,
  },
  {
    id: "night_strategy",
    title: "夜間営業の立場を決める",
    description: "営業時間を延ばすか、短時間・低コスト型を徹底する。",
    unlockDay: 5,
  },
  {
    id: "delivery_strategy",
    title: "納品方式を確立する",
    description: "二回納品を導入するか、一回納品のまま安定運営を実現する。",
    unlockDay: 15,
  },
  {
    id: "regional_habit",
    title: "地域の生活習慣を育てる",
    description: "安定した購入成功を積み重ね、地域定着と自社寄与を高める。",
    unlockDay: 19,
  },
  {
    id: "competitive_response",
    title: "競合の模倣へ対応する",
    description: "競合の行動後に方針を変えるか、現在の優位性を維持する。",
    unlockDay: 20,
  },
];

function issueSummary(observation: CampaignObservation): string {
  const issues: string[] = [];
  if (observation.abandonedCustomers > 0) {
    issues.push(`会計離脱${Math.round(observation.abandonedCustomers)}人`);
  }
  if (observation.stockoutUnits > 0) {
    issues.push(`在庫不足${Math.round(observation.stockoutUnits)}個分`);
  }
  if (observation.shelfStockoutUnits > 0) {
    issues.push(`棚補充遅延${Math.round(observation.shelfStockoutUnits)}個分`);
  }
  if (observation.wasteCost > 0) {
    issues.push(`廃棄原価${Math.round(observation.wasteCost).toLocaleString("ja-JP")}円`);
  }
  return issues.length > 0 ? issues.join("、") : "大きな店舗問題は発生していない";
}

const SCHEDULED_EVENTS: readonly ScheduledEventDefinition[] = [
  {
    id: "campaign-opening",
    day: 0,
    title: "旭駅東口店、30日間の営業開始",
    kind: "briefing",
    priority: "important",
    body: () =>
      "営業時間、売場、発注、納品、人員、作業優先順位を使い、30日間で地域に必要とされる店を作る。正解は一つではない。",
  },
  {
    id: "day-1-morning-gap",
    day: 1,
    title: "開店前から朝の人流がある",
    kind: "problem",
    priority: "important",
    objectiveId: "morning_strategy",
    body: (observation) =>
      `初日の結果は${issueSummary(observation)}。早朝営業で取り込む方法だけでなく、短時間営業で利益を守る戦略も成立する。`,
  },
  {
    id: "day-2-lunch-shortage",
    day: 2,
    title: "昼休み需要が売場へ集中",
    kind: "problem",
    priority: "important",
    objectiveId: "lunch_supply",
    body: (observation) =>
      `即食食品を中心に昼の供給力を見直す。現在の在庫不足は${Math.round(observation.stockoutUnits)}個分、棚補充遅延は${Math.round(observation.shelfStockoutUnits)}個分。`,
  },
  {
    id: "day-3-waste-feedback",
    day: 3,
    title: "欠品対策の反動を確認",
    kind: "problem",
    priority: "important",
    objectiveId: "waste_control",
    body: (observation) =>
      `発注を増やすだけでは期限切れが増える。直近の廃棄原価は${Math.round(observation.wasteCost).toLocaleString("ja-JP")}円。分納や売場配分も選択肢になる。`,
  },
  {
    id: "day-4-after-hours-demand",
    day: 4,
    title: "閉店後にも買い物需要が残る",
    kind: "opportunity",
    priority: "important",
    objectiveId: "night_strategy",
    body: () =>
      "夜間需要を取るには営業時間と夜人員が必要になる。一方、延長しない代わりに昼と定番品へ集中する戦略もある。",
  },
  {
    id: "day-5-operation-load",
    day: 5,
    title: "営業時間の裏側で作業が積み上がる",
    kind: "problem",
    priority: "important",
    objectiveId: "queue_control",
    body: (observation) =>
      `作業積み残しは${Math.round(observation.workBacklog)}点、会計離脱は${Math.round(observation.abandonedCustomers)}人。営業時間だけでなく人員と優先順位を合わせる必要がある。`,
  },
  {
    id: "day-7-regional-report",
    day: 7,
    title: "第1週 地域行動レポート",
    kind: "report",
    priority: "normal",
    body: (observation) =>
      `最も進んだ生活習慣の地域定着度は${Math.round(observation.maxRegionalAdoption * 100)}％、自社寄与は${Math.round(observation.maxPlayerContribution * 100)}％。`,
  },
  {
    id: "day-10-absence",
    day: 10,
    title: "突発欠勤を想定した運営点検",
    kind: "problem",
    priority: "important",
    objectiveId: "queue_control",
    body: () =>
      "一人欠けても回る作業順かを確認する。レジだけを守れば棚と清掃が遅れ、補充だけを守れば会計が詰まる。",
  },
  {
    id: "day-12-overtime",
    day: 12,
    title: "近隣工場で残業が増える",
    kind: "opportunity",
    priority: "normal",
    objectiveId: "night_strategy",
    body: () =>
      "夜の即食食品と飲料需要が伸びる兆候がある。営業時間延長だけでなく、夕方在庫を厚くする方法でも対応できる。",
  },
  {
    id: "day-15-second-delivery",
    day: 15,
    title: "二回納品の提案が届く",
    kind: "opportunity",
    priority: "important",
    objectiveId: "delivery_strategy",
    body: (observation) =>
      `分納は鮮度と調整力を上げるが、物流費と受入作業も増える。現在の欠品合計は${Math.round(observation.stockoutUnits + observation.shelfStockoutUnits)}個分。`,
  },
  {
    id: "day-19-habit-signal",
    day: 19,
    title: "同じ時間に来る客が増え始める",
    kind: "milestone",
    priority: "important",
    objectiveId: "regional_habit",
    body: (observation) =>
      `地域定着度は最大${Math.round(observation.maxRegionalAdoption * 100)}％。市場を育てても、欠品や混雑が続けば常連は競合へ流れる。`,
  },
  {
    id: "day-20-competitor-response",
    day: 20,
    title: "競合が市場変化を学習する",
    kind: "milestone",
    priority: "important",
    objectiveId: "competitive_response",
    body: (observation) =>
      observation.competitorActionCount > 0
        ? `競合はこれまでに${observation.competitorActionCount}件の施策を実行した。自店の強みを深めるか、弱点を塞ぐかを決める。`
        : "競合はまだ決定的な行動を見せていない。先行して市場を固める余地がある。",
  },
  {
    id: "day-22-night-safety",
    day: 22,
    title: "夜間営業の清掃・安全負荷",
    kind: "problem",
    priority: "normal",
    objectiveId: "night_strategy",
    body: (observation) =>
      `夜間営業は売上だけでなく清掃と作業負荷も見る。現在の作業積み残しは${Math.round(observation.workBacklog)}点。`,
  },
  {
    id: "day-24-delivery-delay",
    day: 24,
    title: "納品遅延への備えを点検",
    kind: "crisis",
    priority: "important",
    objectiveId: "delivery_strategy",
    body: () =>
      "定刻納品を前提にしすぎると売場が崩れる。安全在庫、分納、売り切り判断のどこで吸収するかを確認する。",
  },
  {
    id: "day-27-final-strategy",
    day: 27,
    title: "残り3日 最終戦略を定める",
    kind: "milestone",
    priority: "important",
    body: (observation) =>
      `直近利益は${Math.round(observation.latestProfit).toLocaleString("ja-JP")}円。評価は利益だけでなく、安定運営、生活習慣、競争対応、資金繰りで決まる。`,
  },
  {
    id: "day-29-exception-demand",
    day: 29,
    title: "月末の例外需要",
    kind: "problem",
    priority: "important",
    body: () =>
      "予測を超える需要が発生しても、すべてを在庫で抱える必要はない。欠品、廃棄、作業負荷のどれを許容するかが最後の判断になる。",
  },
];

function cloneObjective(objective: CampaignObjective): CampaignObjective {
  return { ...objective };
}

function cloneEvent(event: CampaignEvent): CampaignEvent {
  return { ...event };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function policyFingerprint(policy: CampaignPolicyObservation): string {
  return [
    policy.openingHour,
    policy.closingHour,
    policy.orderingPolicy,
    policy.deliveryPolicy,
    policy.morningStaff,
    policy.middayStaff,
    policy.eveningStaff,
    policy.registerPriority,
    policy.readyToEatArea,
  ].join("|");
}

function policySummary(policy: CampaignPolicyObservation): string {
  const delivery =
    policy.deliveryPolicy === "once_daily"
      ? "一回納品"
      : policy.deliveryPolicy === "ready_to_eat_twice_daily"
        ? "即食二回納品"
        : "全カテゴリ二回納品";
  return `${policy.openingHour}〜${policy.closingHour}時、${policy.orderingPolicy}、${delivery}、昼${policy.middayStaff}人`;
}

function makeObjectiveState(): CampaignObjective[] {
  return OBJECTIVE_DEFINITIONS.map((definition) => ({
    ...definition,
    status: definition.unlockDay === 0 ? "active" : "locked",
  }));
}

function recentAverage(records: readonly CampaignDayRecord[], key: keyof CampaignDayRecord, count = 3): number {
  const values = records.slice(-count).map((record) => Number(record[key]));
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function totalFailure(record: CampaignDayRecord): number {
  return record.abandonedCustomers + record.stockoutUnits + record.shelfStockoutUnits;
}

function gradeFor(score: number): CampaignEvaluation["grade"] {
  if (score >= 90) return "S";
  if (score >= 78) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function evaluationTitle(grade: CampaignEvaluation["grade"]): string {
  switch (grade) {
    case "S": return "地域の生活を変えた先駆店";
    case "A": return "持続的な成長軌道";
    case "B": return "実用的な経営モデル";
    case "C": return "課題を残した30日";
    case "D": return "再建が必要な店舗";
  }
}

function buildEvaluation(
  records: readonly CampaignDayRecord[],
  objectives: readonly CampaignObjective[],
  loan: CampaignLoan | null,
): CampaignEvaluation {
  const latest = records.at(-1);
  const totalProfit = records.reduce((sum, record) => sum + record.profit, 0);
  const totalVisits = records.reduce((sum, record) => sum + record.playerVisits, 0);
  const totalFailures = records.reduce((sum, record) => sum + totalFailure(record), 0);
  const failureRate = totalFailures / Math.max(1, totalVisits + totalFailures);
  const maxAdoption = Math.max(0, ...records.map((record) => record.maxRegionalAdoption));
  const maxContribution = Math.max(0, ...records.map((record) => record.maxPlayerContribution));
  const completedObjectives = objectives.filter((objective) => objective.status === "completed").length;
  const netLiquidity = (latest?.effectiveCash ?? 0) - (loan?.repaymentAmount ?? 0);

  const profitabilityScore = roundScore(12.5 + (totalProfit / 500_000) * 12.5);
  const serviceScore = roundScore((1 - clamp(failureRate, 0, 0.25) / 0.25) * 20);
  const regionalScore = roundScore((maxAdoption * 0.6 + maxContribution * 0.4) * 20);
  const strategyScore = roundScore((completedObjectives / OBJECTIVE_DEFINITIONS.length) * 20);
  const resilienceBase = clamp((netLiquidity + 100_000) / 600_000, 0, 1) * 20;
  const resilienceScore = roundScore(resilienceBase - (loan ? 3 : 0));

  const dimensions: CampaignScoreDimension[] = [
    {
      id: "profitability",
      label: "収益性",
      score: Math.min(25, profitabilityScore),
      maxScore: 25,
      summary: `30日営業利益 ${Math.round(totalProfit).toLocaleString("ja-JP")}円`,
    },
    {
      id: "service",
      label: "安定運営",
      score: serviceScore,
      maxScore: 20,
      summary: `需要未達率 ${(failureRate * 100).toFixed(1)}％`,
    },
    {
      id: "regional",
      label: "地域習慣",
      score: regionalScore,
      maxScore: 20,
      summary: `最大地域定着 ${(maxAdoption * 100).toFixed(1)}％`,
    },
    {
      id: "strategy",
      label: "戦略遂行",
      score: strategyScore,
      maxScore: 20,
      summary: `目標達成 ${completedObjectives}/${OBJECTIVE_DEFINITIONS.length}`,
    },
    {
      id: "resilience",
      label: "資金・再建力",
      score: resilienceScore,
      maxScore: 20,
      summary: `返済考慮後資金 ${Math.round(netLiquidity).toLocaleString("ja-JP")}円`,
    },
  ];

  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const grade = gradeFor(totalScore);
  return {
    totalScore,
    grade,
    title: evaluationTitle(grade),
    dimensions,
    summary:
      grade === "S" || grade === "A"
        ? "利益と地域価値を両立し、競合が追随する業態を作った。"
        : grade === "B"
          ? "実用的な経営モデルは成立した。残る弱点を次の改善へつなげられる。"
          : "30日を完走した経験を基に、営業時間・在庫・作業配分を再設計する必要がある。",
  };
}

function buildCompanyHistory(
  records: readonly CampaignDayRecord[],
  objectives: readonly CampaignObjective[],
  policyHistory: readonly CampaignPolicyHistoryEntry[],
  loan: CampaignLoan | null,
  evaluation: CampaignEvaluation | null,
): CompanyHistoryEntry[] {
  const history: CompanyHistoryEntry[] = [
    {
      day: 1,
      title: "旭駅東口店 開業",
      description: policyHistory[0]?.summary ?? "初期方針で営業を開始した。",
      tone: "neutral",
    },
  ];

  for (const objective of objectives) {
    if (objective.status !== "completed" || objective.completedDay === undefined || !objective.solution) {
      continue;
    }
    history.push({
      day: objective.completedDay,
      title: objective.title,
      description: objective.solution,
      tone: "positive",
    });
  }

  if (loan) {
    history.push({
      day: loan.acceptedDay,
      title: "緊急融資で事業を継続",
      description: `${loan.principal.toLocaleString("ja-JP")}円を調達し、運営再建を選択した。`,
      tone: "warning",
    });
  }

  const worstDay = [...records].sort((a, b) => totalFailure(b) - totalFailure(a))[0];
  if (worstDay && totalFailure(worstDay) > 0) {
    history.push({
      day: worstDay.day,
      title: "最大の店舗混乱",
      description: `未達需要${Math.round(totalFailure(worstDay))}件相当を記録し、運営体制の見直しを迫られた。`,
      tone: "warning",
    });
  }

  if (evaluation) {
    history.push({
      day: 30,
      title: `30日評価 ${evaluation.grade}ランク`,
      description: `${evaluation.title}。${evaluation.summary}`,
      tone: evaluation.grade === "S" || evaluation.grade === "A" ? "positive" : "neutral",
    });
  }

  return history.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "ja"));
}

export function createCampaignController(): CampaignController {
  let objectives = makeObjectiveState();
  let events: CampaignEvent[] = [];
  let dayRecords: CampaignDayRecord[] = [];
  let policyHistory: CampaignPolicyHistoryEntry[] = [];
  let deliveredEventIds = new Set<string>();
  let eventSequence = 0;
  let loan: CampaignLoan | null = null;
  let evaluation: CampaignEvaluation | null = null;
  let companyHistory: CompanyHistoryEntry[] = [];
  let latestObservation: CampaignObservation | null = null;
  let lastCompletedDay = -1;
  let lastPolicyFingerprint = "";

  function effectiveCash(operatingCash: number): number {
    return operatingCash + (loan?.principal ?? 0);
  }

  function addEvent(
    event: Omit<CampaignEvent, "sequence" | "acknowledged">,
    newEvents: CampaignEvent[],
  ): void {
    if (deliveredEventIds.has(event.id)) {
      return;
    }
    deliveredEventIds.add(event.id);
    eventSequence += 1;
    const created: CampaignEvent = {
      ...event,
      sequence: eventSequence,
      acknowledged: false,
    };
    events.push(created);
    newEvents.push(created);
  }

  function unlockObjectives(completedDay: number): void {
    objectives = objectives.map((objective) =>
      objective.status === "locked" && completedDay >= objective.unlockDay
        ? { ...objective, status: "active" }
        : objective,
    );
  }

  function completeObjective(
    id: CampaignObjectiveId,
    day: number,
    solution: string,
    newlyCompleted: CampaignObjective[],
    newEvents: CampaignEvent[],
  ): void {
    const index = objectives.findIndex((objective) => objective.id === id);
    const objective = objectives[index];
    if (!objective || objective.status === "completed") {
      return;
    }
    const completed: CampaignObjective = {
      ...objective,
      status: "completed",
      completedDay: day,
      solution,
    };
    objectives[index] = completed;
    newlyCompleted.push(completed);
    addEvent(
      {
        id: `objective-complete-${id}`,
        day,
        title: `目標達成：${completed.title}`,
        body: solution,
        kind: "milestone",
        priority: "normal",
        objectiveId: id,
      },
      newEvents,
    );
  }

  function evaluateObjectives(
    observation: CampaignObservation,
    newlyCompleted: CampaignObjective[],
    newEvents: CampaignEvent[],
  ): void {
    const day = Math.max(1, observation.completedDay);
    const policy = observation.policy;
    const recentProfit = recentAverage(dayRecords, "profit");
    const recentAbandonment = recentAverage(dayRecords, "abandonedCustomers");
    const recentWaste = recentAverage(dayRecords, "wasteCost");
    const recentStockout = recentAverage(dayRecords, "stockoutUnits");
    const recentBacklog = recentAverage(dayRecords, "workBacklog");

    if (policy.openingHour <= 7) {
      completeObjective("morning_strategy", day, "開店を7時以前へ早め、朝需要を取り込む方針を選んだ。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 5 && policy.closingHour <= 20 && recentProfit > 0) {
      completeObjective("morning_strategy", day, "短時間営業を維持し、朝需要を追わず利益を守る低コスト戦略を成立させた。", newlyCompleted, newEvents);
    }

    if (policy.deliveryPolicy !== "once_daily") {
      completeObjective("lunch_supply", day, "分納を導入し、昼食商品の供給調整力を高めた。", newlyCompleted, newEvents);
    } else if (policy.orderingPolicy === "stockout_prevention") {
      completeObjective("lunch_supply", day, "欠品防止型の発注で昼食需要へ備えた。", newlyCompleted, newEvents);
    } else if (policy.readyToEatArea >= 20) {
      completeObjective("lunch_supply", day, "即食食品の売場を20ポイント以上へ広げ、昼食供給を強化した。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 6 && recentStockout <= 3) {
      completeObjective("lunch_supply", day, "標準的な発注と売場のまま、実績として昼の欠品を低水準へ抑えた。", newlyCompleted, newEvents);
    }

    if (policy.middayStaff >= 2 && policy.registerPriority <= 2) {
      completeObjective("queue_control", day, "昼人員とレジ優先順位を組み合わせ、会計能力を確保した。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 5 && recentAbandonment <= 1) {
      completeObjective("queue_control", day, "特定の設定に頼らず、実績として会計離脱をほぼ解消した。", newlyCompleted, newEvents);
    }

    if (policy.orderingPolicy === "sell_through") {
      completeObjective("waste_control", day, "売り切り重視の発注で廃棄リスクを抑えた。", newlyCompleted, newEvents);
    } else if (policy.deliveryPolicy !== "once_daily") {
      completeObjective("waste_control", day, "分納によって一回あたりの持越し在庫を減らした。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 7 && recentWaste <= 500) {
      completeObjective("waste_control", day, "標準運営のまま直近廃棄原価を低水準へ抑えた。", newlyCompleted, newEvents);
    }

    if (policy.closingHour >= 21) {
      completeObjective("night_strategy", day, "閉店時刻を21時以降へ延ばし、夜間需要を取り込む方針を選んだ。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 8 && policy.closingHour <= 20 && policy.eveningStaff === 1 && recentProfit > 0) {
      completeObjective("night_strategy", day, "夜間需要を追わず、夕方一人体制の短時間・低コスト型を成立させた。", newlyCompleted, newEvents);
    }

    if (observation.completedDay >= 15 && policy.deliveryPolicy !== "once_daily") {
      completeObjective("delivery_strategy", day, "二回納品を正式な運営方針として採用した。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 18 && policy.deliveryPolicy === "once_daily" && recentStockout <= 4 && recentBacklog <= 5) {
      completeObjective("delivery_strategy", day, "一回納品のまま欠品と受入作業を抑え、低コスト物流を成立させた。", newlyCompleted, newEvents);
    }

    if (observation.maxRegionalAdoption >= 0.35 && observation.maxPlayerContribution >= 0.4) {
      completeObjective("regional_habit", day, "地域定着35％以上、自社寄与40％以上を達成し、店が生活習慣の形成に貢献した。", newlyCompleted, newEvents);
    }

    const competitorWasSeen = observation.competitorActionCount > 0;
    const policyChangedAfterCompetition = policyHistory.some((entry) => entry.day >= 20);
    if (competitorWasSeen && policyChangedAfterCompetition) {
      completeObjective("competitive_response", day, "競合の行動後に自店方針を更新し、市場変化へ対応した。", newlyCompleted, newEvents);
    } else if (observation.completedDay >= 24 && competitorWasSeen && observation.latestProfit > 0 && observation.playerVisits >= 200) {
      completeObjective("competitive_response", day, "競合が動いた後も既存方針で収益と来店を維持し、変更しない対応を成立させた。", newlyCompleted, newEvents);
    }
  }

  function recordDay(observation: CampaignObservation): void {
    if (observation.completedDay <= 0 || dayRecords.some((record) => record.day === observation.completedDay)) {
      return;
    }
    dayRecords.push({
      day: observation.completedDay,
      operatingCash: observation.operatingCash,
      effectiveCash: effectiveCash(observation.operatingCash),
      profit: observation.latestProfit,
      playerVisits: observation.playerVisits,
      abandonedCustomers: observation.abandonedCustomers,
      stockoutUnits: observation.stockoutUnits,
      shelfStockoutUnits: observation.shelfStockoutUnits,
      wasteCost: observation.wasteCost,
      workBacklog: observation.workBacklog,
      maxRegionalAdoption: observation.maxRegionalAdoption,
      maxPlayerContribution: observation.maxPlayerContribution,
    });
    dayRecords.sort((a, b) => a.day - b.day);
  }

  function recordPolicy(observation: CampaignObservation): void {
    const fingerprint = policyFingerprint(observation.policy);
    if (fingerprint === lastPolicyFingerprint) {
      return;
    }
    lastPolicyFingerprint = fingerprint;
    policyHistory.push({
      day: Math.max(1, observation.currentDay),
      summary: policySummary(observation.policy),
      fingerprint,
    });
  }

  function emitScheduledEvents(observation: CampaignObservation, newEvents: CampaignEvent[]): void {
    for (const definition of SCHEDULED_EVENTS) {
      if (definition.day > observation.completedDay) {
        continue;
      }
      addEvent(
        {
          id: definition.id,
          day: definition.day,
          title: definition.title,
          body: definition.body(observation),
          kind: definition.kind,
          priority: definition.priority,
          objectiveId: definition.objectiveId,
        },
        newEvents,
      );
    }
  }

  function emitFinancialCrisis(observation: CampaignObservation, newEvents: CampaignEvent[]): void {
    if (loan || observation.completedDay < 3 || effectiveCash(observation.operatingCash) >= CRISIS_CASH_THRESHOLD) {
      return;
    }
    addEvent(
      {
        id: "financial-crisis-loan-offer",
        day: observation.completedDay,
        title: "運転資金が危険水準へ低下",
        body: `利用可能資金は約${Math.round(effectiveCash(observation.operatingCash)).toLocaleString("ja-JP")}円。30日間の運営を継続するため、緊急融資${LOAN_PRINCIPAL.toLocaleString("ja-JP")}円を利用できる。返済予定額は${LOAN_REPAYMENT.toLocaleString("ja-JP")}円。`,
        kind: "crisis",
        priority: "critical",
        actionId: "accept_emergency_loan",
      },
      newEvents,
    );
  }

  function finalizeIfNeeded(observation: CampaignObservation, newEvents: CampaignEvent[]): void {
    if (observation.completedDay < 30 || evaluation) {
      return;
    }
    evaluation = buildEvaluation(dayRecords, objectives, loan);
    companyHistory = buildCompanyHistory(dayRecords, objectives, policyHistory, loan, evaluation);
    addEvent(
      {
        id: "campaign-final-evaluation",
        day: 30,
        title: `30日評価：${evaluation.grade}ランク ${evaluation.title}`,
        body: `${evaluation.totalScore}点。${evaluation.summary}`,
        kind: "final",
        priority: "critical",
      },
      newEvents,
    );
  }

  function reset(): void {
    objectives = makeObjectiveState();
    events = [];
    dayRecords = [];
    policyHistory = [];
    deliveredEventIds = new Set<string>();
    eventSequence = 0;
    loan = null;
    evaluation = null;
    companyHistory = [];
    latestObservation = null;
    lastCompletedDay = -1;
    lastPolicyFingerprint = "";
  }

  return {
    observe(observation: CampaignObservation): CampaignUpdate {
      let didReset = false;
      if (lastCompletedDay >= 1 && observation.completedDay < lastCompletedDay) {
        reset();
        didReset = true;
      }
      latestObservation = observation;
      lastCompletedDay = observation.completedDay;
      recordPolicy(observation);
      recordDay(observation);
      unlockObjectives(observation.completedDay);

      const newEvents: CampaignEvent[] = [];
      const newlyCompletedObjectives: CampaignObjective[] = [];
      emitScheduledEvents(observation, newEvents);
      evaluateObjectives(observation, newlyCompletedObjectives, newEvents);
      emitFinancialCrisis(observation, newEvents);
      finalizeIfNeeded(observation, newEvents);

      return {
        newEvents: newEvents.map(cloneEvent),
        newlyCompletedObjectives: newlyCompletedObjectives.map(cloneObjective),
        reset: didReset,
      };
    },

    acknowledgeEvent(eventId: string): void {
      events = events.map((event) =>
        event.id === eventId ? { ...event, acknowledged: true } : event,
      );
    },

    acceptEmergencyLoan(day?: number): CampaignLoan {
      if (loan) {
        return { ...loan };
      }
      const acceptedDay = day ?? latestObservation?.currentDay ?? 1;
      loan = {
        acceptedDay,
        principal: LOAN_PRINCIPAL,
        repaymentAmount: LOAN_REPAYMENT,
      };
      const financialEvent = events.find((event) => event.id === "financial-crisis-loan-offer");
      if (financialEvent) {
        financialEvent.acknowledged = true;
      }
      eventSequence += 1;
      const acceptedEvent: CampaignEvent = {
        id: "emergency-loan-accepted",
        sequence: eventSequence,
        day: acceptedDay,
        title: "緊急融資を実行",
        body: `${LOAN_PRINCIPAL.toLocaleString("ja-JP")}円を運転資金へ加えた。営業利益とは別に管理され、最終評価では${LOAN_REPAYMENT.toLocaleString("ja-JP")}円の返済負担を考慮する。`,
        kind: "crisis",
        priority: "important",
        acknowledged: false,
      };
      events.push(acceptedEvent);
      deliveredEventIds.add(acceptedEvent.id);
      if (latestObservation) {
        dayRecords = dayRecords.map((record) => ({
          ...record,
          effectiveCash: record.operatingCash + (record.day >= acceptedDay ? LOAN_PRINCIPAL : 0),
        }));
      }
      return { ...loan };
    },

    getSnapshot(): CampaignSnapshot {
      const operatingCash = latestObservation?.operatingCash ?? 0;
      const completedDay = latestObservation?.completedDay ?? 0;
      return {
        currentDay: latestObservation?.currentDay ?? 1,
        completedDay,
        progress: clamp(completedDay / 30, 0, 1),
        operatingCash,
        effectiveCash: effectiveCash(operatingCash),
        debtOutstanding: loan?.repaymentAmount ?? 0,
        loan: loan ? { ...loan } : null,
        objectives: objectives.map(cloneObjective),
        events: events.map(cloneEvent),
        pendingEvents: events.filter((event) => !event.acknowledged).map(cloneEvent),
        dayRecords: dayRecords.map((record) => ({ ...record })),
        policyHistory: policyHistory.map((entry) => ({ ...entry })),
        evaluation: evaluation
          ? {
              ...evaluation,
              dimensions: evaluation.dimensions.map((dimension) => ({ ...dimension })),
            }
          : null,
        companyHistory: companyHistory.map((entry) => ({ ...entry })),
      };
    },

    reset,
  };
}
