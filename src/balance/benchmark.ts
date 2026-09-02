import { HABIT_IDS, type HabitId } from "../simulation/habits.js";
import type { OperationTaskId } from "../simulation/operations.js";
import {
  createCompetitiveSimulation,
  type CompetitiveDailyReport,
  type CompetitiveSimulation,
} from "../simulation/competitiveSimulation.js";
import type { PolicyCommand } from "../simulation/simulation.js";
import type { ScenarioBundle, TimeBlockId } from "../simulation/types.js";

export const BALANCE_STRATEGY_IDS = [
  "short_low_cost",
  "long_hours",
  "lunch_focus",
  "regional_generalist",
] as const;

export type BalanceStrategyId = (typeof BALANCE_STRATEGY_IDS)[number];

export const BALANCE_KPI_KEYS = [
  "totalProfit",
  "serviceReliability",
  "habitScore",
  "stabilityScore",
  "competitiveResilience",
] as const;

export type BalanceKpiKey = (typeof BALANCE_KPI_KEYS)[number];

export interface BalanceStrategyDefinition {
  id: BalanceStrategyId;
  label: string;
  description: string;
}

export interface StrategyRunKpis {
  strategyId: BalanceStrategyId;
  seed: number;
  totalRevenue: number;
  totalProfit: number;
  endingCash: number;
  totalPlayerVisits: number;
  totalCompetitorVisits: number;
  serviceReliability: number;
  wasteRate: number;
  averageBacklog: number;
  habitScore: number;
  playerHabitContribution: number;
  competitorActionCount: number;
  competitiveResilience: number;
  stabilityScore: number;
  negativeCashDays: number;
  profitableDays: number;
  practical: boolean;
}

export interface MetricDistribution {
  mean: number;
  median: number;
  standardDeviation: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

export interface BalanceStrategySummary {
  strategyId: BalanceStrategyId;
  label: string;
  seedCount: number;
  practicalSeedRate: number;
  metrics: Record<BalanceKpiKey, MetricDistribution>;
  endingCash: MetricDistribution;
  wasteRate: MetricDistribution;
  playerHabitContribution: MetricDistribution;
  competitorActionCount: MetricDistribution;
}

export interface NoActionDiagnostic {
  seed: number;
  morningOutflowDay: number | null;
  lunchStockoutDay: number | null;
  wasteDay: number | null;
  closedDemandDay: number | null;
  morningOutflowEvidenceDay: number | null;
  lunchStockoutEvidenceDay: number | null;
  wasteEvidenceDay: number | null;
  closedDemandEvidenceDay: number | null;
  ordered: boolean;
}

export interface NoActionDiagnosticSummary {
  seedCount: number;
  morningOutflowRate: number;
  lunchStockoutRate: number;
  wasteRate: number;
  closedDemandRate: number;
  orderedRate: number;
  qualifies: boolean;
}

export interface BalanceAssessment {
  usableStrategyIds: BalanceStrategyId[];
  practicalStrategyCount: number;
  winnerByMetric: Record<BalanceKpiKey, BalanceStrategyId>;
  singleStrategyDominatesAllMetrics: boolean;
  dominantStrategyId: BalanceStrategyId | null;
  noActionQualifies: boolean;
  passesMilestone: boolean;
}

export interface BalanceBenchmarkReport {
  generatedAt: string;
  scenarioId: string;
  seedStart: number;
  seedCount: number;
  strategyDefinitions: BalanceStrategyDefinition[];
  runs: StrategyRunKpis[];
  strategySummaries: BalanceStrategySummary[];
  noActionDiagnostics: NoActionDiagnostic[];
  noActionSummary: NoActionDiagnosticSummary;
  assessment: BalanceAssessment;
}

export interface BalanceBenchmarkOptions {
  seedStart?: number;
  seedCount?: number;
  strategyIds?: readonly BalanceStrategyId[];
}

const STRATEGIES: readonly BalanceStrategyDefinition[] = [
  {
    id: "short_low_cost",
    label: "短時間・低コスト型",
    description: "営業時間と人員を絞り、廃棄と固定費を抑えて現金を守る。",
  },
  {
    id: "long_hours",
    label: "長時間営業型",
    description: "6時から24時まで営業し、厚い人員と分納で広い時間帯需要を取る。",
  },
  {
    id: "lunch_focus",
    label: "昼食特化型",
    description: "即食食品の売場、昼人員、二回納品を優先して昼食市場を取る。",
  },
  {
    id: "regional_generalist",
    label: "地域総合型",
    description: "営業時間、品ぞろえ、清潔、作業配分を均衡させ地域習慣を育てる。",
  },
];

const STAFFING_BLOCKS: readonly TimeBlockId[] = ["morning", "midday", "afternoon", "evening"];
const DEFAULT_PRIORITIES: readonly OperationTaskId[] = [
  "register",
  "replenishment",
  "delivery_receiving",
  "cleaning",
  "admin",
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function quantile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp01(percentile) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? sorted[0] ?? 0;
  const upper = sorted[upperIndex] ?? sorted[sorted.length - 1] ?? lower;
  const fraction = position - lowerIndex;
  return lower + (upper - lower) * fraction;
}

function distribution(values: readonly number[]): MetricDistribution {
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return {
    mean: average,
    median: quantile(values, 0.5),
    standardDeviation: Math.sqrt(variance),
    p10: quantile(values, 0.1),
    p90: quantile(values, 0.9),
    min: values.length === 0 ? 0 : Math.min(...values),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

function totalRecord(record: Record<string, number>): number {
  return sum(Object.values(record));
}

function weightedCategoryArea(
  scenario: ScenarioBundle,
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const categoryIds = scenario.categories.map((category) => category.id);
  if (categoryIds.length === 0) return {};
  const totalWeight = sum(categoryIds.map((id) => Math.max(0, weights[id] ?? 1)));
  const targetTotal = scenario.economy.totalShelfAreaPoints;
  const result: Record<string, number> = {};
  let assigned = 0;

  categoryIds.forEach((categoryId, index) => {
    if (index === categoryIds.length - 1) {
      result[categoryId] = targetTotal - assigned;
      return;
    }
    const value = Number(
      ((targetTotal * Math.max(0, weights[categoryId] ?? 1)) / Math.max(1, totalWeight)).toFixed(3),
    );
    result[categoryId] = value;
    assigned += value;
  });
  return result;
}

function staffingCommands(counts: readonly [number, number, number, number]): PolicyCommand[] {
  return STAFFING_BLOCKS.map((timeBlock, index) => ({
    type: "set_staffing" as const,
    timeBlock,
    count: counts[index] ?? 1,
  }));
}

function initialCommands(strategyId: BalanceStrategyId, scenario: ScenarioBundle): PolicyCommand[] {
  switch (strategyId) {
    case "short_low_cost":
      return [
        { type: "set_opening_hours", openingHour: 8, closingHour: 20 },
        { type: "set_ordering_policy", policy: "sell_through" },
        { type: "set_delivery_policy", policy: "once_daily" },
        ...staffingCommands([1, 2, 1, 1]),
        {
          type: "set_task_priorities",
          priorities: ["register", "replenishment", "admin", "cleaning", "delivery_receiving"],
        },
      ];
    case "long_hours":
      return [
        { type: "set_opening_hours", openingHour: 6, closingHour: 24 },
        { type: "set_ordering_policy", policy: "stockout_prevention" },
        { type: "set_delivery_policy", policy: "all_categories_twice_daily" },
        ...staffingCommands([2, 3, 2, 3]),
        { type: "set_task_priorities", priorities: [...DEFAULT_PRIORITIES] },
      ];
    case "lunch_focus":
      return [
        { type: "set_opening_hours", openingHour: 7, closingHour: 21 },
        { type: "set_ordering_policy", policy: "stockout_prevention" },
        { type: "set_delivery_policy", policy: "ready_to_eat_twice_daily" },
        ...staffingCommands([1, 4, 2, 1]),
        {
          type: "set_category_area",
          categoryArea: weightedCategoryArea(scenario, {
            category_ready_to_eat: 3.2,
            category_beverages: 1.5,
            category_snacks: 0.8,
            category_processed_food: 0.75,
            category_daily_goods: 0.7,
            category_magazines: 0.55,
            category_frozen_food: 0.5,
          }),
        },
        {
          type: "set_task_priorities",
          priorities: ["register", "replenishment", "delivery_receiving", "admin", "cleaning"],
        },
      ];
    case "regional_generalist":
      return [
        { type: "set_opening_hours", openingHour: 7, closingHour: 23 },
        { type: "set_ordering_policy", policy: "standard" },
        { type: "set_delivery_policy", policy: "ready_to_eat_twice_daily" },
        ...staffingCommands([2, 3, 2, 2]),
        {
          type: "set_category_area",
          categoryArea: weightedCategoryArea(scenario, {
            category_ready_to_eat: 1.5,
            category_beverages: 1.2,
            category_snacks: 0.9,
            category_processed_food: 1.1,
            category_daily_goods: 1.1,
            category_magazines: 0.7,
            category_frozen_food: 1.0,
          }),
        },
        {
          type: "set_task_priorities",
          priorities: ["register", "replenishment", "cleaning", "delivery_receiving", "admin"],
        },
      ];
  }
}

function feedbackCommands(
  strategyId: BalanceStrategyId,
  previousReport: CompetitiveDailyReport,
): PolicyCommand[] {
  const totalStockout = totalRecord(previousReport.stockoutUnitsByProduct);
  const totalBacklog = totalRecord(previousReport.operationBacklogByTask);

  switch (strategyId) {
    case "short_low_cost":
      if (previousReport.abandonedCustomers >= 12) {
        return [{ type: "set_staffing", timeBlock: "midday", count: 3 }];
      }
      return [];
    case "long_hours":
      if (previousReport.nightOperationWorkload >= 120 || totalBacklog >= 35) {
        return [{ type: "set_staffing", timeBlock: "evening", count: 4 }];
      }
      return [];
    case "lunch_focus":
      if (totalStockout >= 20 && previousReport.day >= 5) {
        return [{ type: "set_delivery_policy", policy: "all_categories_twice_daily" }];
      }
      return [];
    case "regional_generalist":
      if (previousReport.queueCustomersEnd >= 5 || previousReport.abandonedCustomers >= 8) {
        return [
          {
            type: "set_task_priorities",
            priorities: ["register", "replenishment", "cleaning", "delivery_receiving", "admin"],
          },
        ];
      }
      if (previousReport.operationalShelfStockoutUnits >= 15) {
        return [
          {
            type: "set_task_priorities",
            priorities: ["replenishment", "register", "cleaning", "delivery_receiving", "admin"],
          },
        ];
      }
      if (totalBacklog <= 4) {
        return [
          {
            type: "set_task_priorities",
            priorities: ["cleaning", "register", "replenishment", "delivery_receiving", "admin"],
          },
        ];
      }
      return [];
  }
}

function applyCommands(simulation: CompetitiveSimulation, commands: readonly PolicyCommand[]): void {
  for (const command of commands) simulation.applyPolicy(command);
}

export function getBalanceStrategyDefinitions(): BalanceStrategyDefinition[] {
  return STRATEGIES.map((strategy) => ({ ...strategy }));
}

export function getStrategyCommands(
  strategyId: BalanceStrategyId,
  day: number,
  scenario: ScenarioBundle,
  previousReport?: CompetitiveDailyReport,
): PolicyCommand[] {
  if (day <= 1) return initialCommands(strategyId, scenario);
  return previousReport ? feedbackCommands(strategyId, previousReport) : [];
}

function summarizeRun(
  scenario: ScenarioBundle,
  strategyId: BalanceStrategyId,
  seed: number,
  reports: readonly CompetitiveDailyReport[],
): StrategyRunKpis {
  const playerStoreId = scenario.playerStore.id;
  const competitorStoreIds = scenario.competitorStores.map((store) => store.id);
  const totalRevenue = sum(reports.map((report) => report.revenue));
  const totalProfit = sum(reports.map((report) => report.profit));
  const endingCash = reports.at(-1)?.cashEnd ?? scenario.playerStore.initialCash;
  const totalPlayerVisits = sum(reports.map((report) => report.visitsByStore[playerStoreId] ?? 0));
  const totalCompetitorVisits = sum(
    reports.map((report) =>
      sum(competitorStoreIds.map((storeId) => report.visitsByStore[storeId] ?? 0)),
    ),
  );
  const serviceFailures = sum(
    reports.map(
      (report) =>
        report.abandonedCustomers +
        totalRecord(report.stockoutUnitsByProduct) +
        report.operationalShelfStockoutUnits,
    ),
  );
  const serviceReliability = clamp01(
    1 - serviceFailures / Math.max(1, totalPlayerVisits + serviceFailures),
  );
  const totalWasteCost = sum(reports.map((report) => report.wasteCost));
  const totalCogs = sum(reports.map((report) => report.cogs));
  const wasteRate = clamp01(totalWasteCost / Math.max(1, totalCogs + totalWasteCost));
  const averageBacklog = mean(
    reports.map((report) => totalRecord(report.operationBacklogByTask)),
  );
  const finalReport = reports.at(-1);
  const habitScore = finalReport
    ? mean(HABIT_IDS.map((habitId) => finalReport.habitRegionalAdoptionByHabit[habitId] ?? 0))
    : 0;
  const playerHabitContribution = finalReport
    ? mean(HABIT_IDS.map((habitId) => finalReport.habitPlayerContributionByHabit[habitId] ?? 0))
    : 0;
  const competitorActionCount = sum(
    reports.map((report) => report.competitorDecisions.length),
  );
  const lateReports = reports.slice(-7);
  const latePlayerVisits = sum(lateReports.map((report) => report.visitsByStore[playerStoreId] ?? 0));
  const lateCompetitorVisits = sum(
    lateReports.map((report) =>
      sum(competitorStoreIds.map((storeId) => report.visitsByStore[storeId] ?? 0)),
    ),
  );
  const competitiveResilience = clamp01(
    latePlayerVisits / Math.max(1, latePlayerVisits + lateCompetitorVisits),
  );
  const negativeCashDays = reports.filter((report) => report.cashEnd < 0).length;
  const profitableDays = reports.filter((report) => report.profit > 0).length;
  const cashSurvival = 1 - negativeCashDays / Math.max(1, reports.length);
  const backlogScore = 1 - clamp01(averageBacklog / 80);
  const wasteEfficiency = 1 - clamp01(wasteRate / 0.25);
  const stabilityScore = clamp01(
    serviceReliability * 0.45 + cashSurvival * 0.25 + backlogScore * 0.15 + wasteEfficiency * 0.15,
  );
  const practical =
    reports.length === scenario.scenario.totalDays &&
    endingCash > -scenario.playerStore.initialCash &&
    serviceReliability >= 0.4 &&
    stabilityScore >= 0.4;

  return {
    strategyId,
    seed,
    totalRevenue,
    totalProfit,
    endingCash,
    totalPlayerVisits,
    totalCompetitorVisits,
    serviceReliability,
    wasteRate,
    averageBacklog,
    habitScore,
    playerHabitContribution,
    competitorActionCount,
    competitiveResilience,
    stabilityScore,
    negativeCashDays,
    profitableDays,
    practical,
  };
}

export function runBalanceStrategy(
  scenario: ScenarioBundle,
  strategyId: BalanceStrategyId,
  seed: number,
): StrategyRunKpis {
  const simulation = createCompetitiveSimulation(scenario, seed);
  let day = 1;
  let previousReport: CompetitiveDailyReport | undefined;

  while (!simulation.isFinished()) {
    applyCommands(simulation, getStrategyCommands(strategyId, day, scenario, previousReport));
    simulation.advanceDay();
    previousReport = simulation.getDailyReport(day);
    day += 1;
  }

  return summarizeRun(scenario, strategyId, seed, simulation.getAllDailyReports());
}

function readyToEatProductIds(scenario: ScenarioBundle): Set<string> {
  return new Set(
    scenario.products
      .filter((product) => product.categoryId === "category_ready_to_eat")
      .map((product) => product.id),
  );
}

function habitGap(report: CompetitiveDailyReport, habitId: HabitId): number {
  return Math.max(
    0,
    (report.habitDailyPotentialDemandByHabit[habitId] ?? 0) -
      (report.habitDailyPlayerSuccessfulVisitsByHabit[habitId] ?? 0),
  );
}

function firstDay(
  reports: readonly CompetitiveDailyReport[],
  notBeforeDay: number,
  predicate: (report: CompetitiveDailyReport) => boolean,
): number | null {
  return reports.find((report) => report.day >= notBeforeDay && predicate(report))?.day ?? null;
}

export function diagnoseNoActionRun(
  scenario: ScenarioBundle,
  seed: number,
): NoActionDiagnostic {
  const simulation = createCompetitiveSimulation(scenario, seed);
  simulation.runToEnd();
  const reports = simulation.getAllDailyReports();
  const readyProductIds = readyToEatProductIds(scenario);

  const evidenceDayThrough = (
    checkpointDay: number,
    predicate: (report: CompetitiveDailyReport) => boolean,
  ): number | null =>
    reports.find((report) => report.day <= checkpointDay && predicate(report))?.day ?? null;

  const morningOutflowEvidenceDay = evidenceDayThrough(
    1,
    (report) => habitGap(report, "breakfast_purchase") >= 1,
  );
  const lunchStockoutEvidenceDay = evidenceDayThrough(
    2,
    (report) =>
      sum(
        Object.entries(report.stockoutUnitsByProduct)
          .filter(([productId]) => readyProductIds.has(productId))
          .map(([, units]) => units),
      ) + report.operationalShelfStockoutUnits >= 1,
  );
  const wasteEvidenceDay = evidenceDayThrough(3, (report) => report.wasteCost > 0);
  const closedDemandEvidenceDay = evidenceDayThrough(
    4,
    (report) => habitGap(report, "night_shopping") >= 1,
  );

  const morningOutflowDay = morningOutflowEvidenceDay === null ? null : 1;
  const lunchStockoutDay = lunchStockoutEvidenceDay === null ? null : 2;
  const wasteDay = wasteEvidenceDay === null ? null : 3;
  const closedDemandDay = closedDemandEvidenceDay === null ? null : 4;
  const ordered =
    morningOutflowDay !== null &&
    lunchStockoutDay !== null &&
    wasteDay !== null &&
    closedDemandDay !== null;

  return {
    seed,
    morningOutflowDay,
    lunchStockoutDay,
    wasteDay,
    closedDemandDay,
    morningOutflowEvidenceDay,
    lunchStockoutEvidenceDay,
    wasteEvidenceDay,
    closedDemandEvidenceDay,
    ordered,
  };
}
function summarizeNoAction(diagnostics: readonly NoActionDiagnostic[]): NoActionDiagnosticSummary {
  const count = Math.max(1, diagnostics.length);
  const rate = (predicate: (diagnostic: NoActionDiagnostic) => boolean): number =>
    diagnostics.filter(predicate).length / count;
  const summary = {
    seedCount: diagnostics.length,
    morningOutflowRate: rate((diagnostic) => diagnostic.morningOutflowDay !== null),
    lunchStockoutRate: rate((diagnostic) => diagnostic.lunchStockoutDay !== null),
    wasteRate: rate((diagnostic) => diagnostic.wasteDay !== null),
    closedDemandRate: rate((diagnostic) => diagnostic.closedDemandDay !== null),
    orderedRate: rate((diagnostic) => diagnostic.ordered),
    qualifies: false,
  };
  summary.qualifies =
    summary.morningOutflowRate >= 0.6 &&
    summary.lunchStockoutRate >= 0.6 &&
    summary.wasteRate >= 0.6 &&
    summary.closedDemandRate >= 0.6 &&
    summary.orderedRate >= 0.6;
  return summary;
}

function summarizeStrategy(
  strategyId: BalanceStrategyId,
  runs: readonly StrategyRunKpis[],
): BalanceStrategySummary {
  const strategy = STRATEGIES.find((candidate) => candidate.id === strategyId);
  const strategyRuns = runs.filter((run) => run.strategyId === strategyId);
  const metricValues = (key: BalanceKpiKey): number[] =>
    strategyRuns.map((run) => run[key]);
  return {
    strategyId,
    label: strategy?.label ?? strategyId,
    seedCount: strategyRuns.length,
    practicalSeedRate:
      strategyRuns.length === 0
        ? 0
        : strategyRuns.filter((run) => run.practical).length / strategyRuns.length,
    metrics: Object.fromEntries(
      BALANCE_KPI_KEYS.map((key) => [key, distribution(metricValues(key))]),
    ) as Record<BalanceKpiKey, MetricDistribution>,
    endingCash: distribution(strategyRuns.map((run) => run.endingCash)),
    wasteRate: distribution(strategyRuns.map((run) => run.wasteRate)),
    playerHabitContribution: distribution(
      strategyRuns.map((run) => run.playerHabitContribution),
    ),
    competitorActionCount: distribution(strategyRuns.map((run) => run.competitorActionCount)),
  };
}

export function assessBalance(
  summaries: readonly BalanceStrategySummary[],
  noActionSummary: NoActionDiagnosticSummary,
): BalanceAssessment {
  const usableStrategyIds = summaries
    .filter((summary) => summary.practicalSeedRate >= 0.6)
    .map((summary) => summary.strategyId);
  const winnerByMetric = Object.fromEntries(
    BALANCE_KPI_KEYS.map((key) => {
      const sorted = [...summaries].sort(
        (a, b) => b.metrics[key].mean - a.metrics[key].mean,
      );
      return [key, sorted[0]?.strategyId ?? BALANCE_STRATEGY_IDS[0]];
    }),
  ) as Record<BalanceKpiKey, BalanceStrategyId>;
  const winners = BALANCE_KPI_KEYS.map((key) => winnerByMetric[key]);
  const firstWinner = winners[0] ?? null;
  const singleStrategyDominatesAllMetrics =
    firstWinner !== null && winners.every((winner) => winner === firstWinner);
  const dominantStrategyId = singleStrategyDominatesAllMetrics ? firstWinner : null;

  return {
    usableStrategyIds,
    practicalStrategyCount: usableStrategyIds.length,
    winnerByMetric,
    singleStrategyDominatesAllMetrics,
    dominantStrategyId,
    noActionQualifies: noActionSummary.qualifies,
    passesMilestone:
      usableStrategyIds.length >= 3 &&
      !singleStrategyDominatesAllMetrics &&
      noActionSummary.qualifies,
  };
}

export function runBalanceBenchmark(
  scenario: ScenarioBundle,
  options: BalanceBenchmarkOptions = {},
): BalanceBenchmarkReport {
  const seedStart = options.seedStart ?? 1;
  const seedCount = options.seedCount ?? 100;
  if (!Number.isInteger(seedStart)) throw new Error("seedStart must be an integer");
  if (!Number.isInteger(seedCount) || seedCount <= 0) {
    throw new Error("seedCount must be a positive integer");
  }
  const strategyIds = options.strategyIds ?? BALANCE_STRATEGY_IDS;
  const invalidStrategy = strategyIds.find((id) => !BALANCE_STRATEGY_IDS.includes(id));
  if (invalidStrategy) throw new Error(`Unknown balance strategy: ${invalidStrategy}`);

  const runs: StrategyRunKpis[] = [];
  const noActionDiagnostics: NoActionDiagnostic[] = [];
  for (let offset = 0; offset < seedCount; offset += 1) {
    const seed = seedStart + offset;
    for (const strategyId of strategyIds) {
      runs.push(runBalanceStrategy(scenario, strategyId, seed));
    }
    noActionDiagnostics.push(diagnoseNoActionRun(scenario, seed));
  }

  const strategySummaries = strategyIds.map((strategyId) =>
    summarizeStrategy(strategyId, runs),
  );
  const noActionSummary = summarizeNoAction(noActionDiagnostics);
  const assessment = assessBalance(strategySummaries, noActionSummary);
  return {
    generatedAt: new Date(0).toISOString(),
    scenarioId: scenario.scenario.id,
    seedStart,
    seedCount,
    strategyDefinitions: STRATEGIES.filter((strategy) => strategyIds.includes(strategy.id)).map(
      (strategy) => ({ ...strategy }),
    ),
    runs,
    strategySummaries,
    noActionDiagnostics,
    noActionSummary,
    assessment,
  };
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function balanceBenchmarkToCsv(report: BalanceBenchmarkReport): string {
  const header = [
    "strategy_id",
    "seed",
    "total_revenue",
    "total_profit",
    "ending_cash",
    "service_reliability",
    "waste_rate",
    "habit_score",
    "player_habit_contribution",
    "competitive_resilience",
    "stability_score",
    "competitor_action_count",
    "negative_cash_days",
    "profitable_days",
    "practical",
  ];
  const rows = report.runs.map((run) => [
    run.strategyId,
    run.seed,
    run.totalRevenue,
    run.totalProfit,
    run.endingCash,
    run.serviceReliability,
    run.wasteRate,
    run.habitScore,
    run.playerHabitContribution,
    run.competitiveResilience,
    run.stabilityScore,
    run.competitorActionCount,
    run.negativeCashDays,
    run.profitableDays,
    run.practical,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function formatBalanceSummary(report: BalanceBenchmarkReport): string {
  const lines = [
    `Balance benchmark: ${report.scenarioId}`,
    `Seeds: ${report.seedStart}..${report.seedStart + report.seedCount - 1}`,
    "",
  ];
  for (const summary of report.strategySummaries) {
    lines.push(
      `${summary.label}: profit=${Math.round(summary.metrics.totalProfit.mean)}, reliability=${(
        summary.metrics.serviceReliability.mean * 100
      ).toFixed(1)}%, habit=${(summary.metrics.habitScore.mean * 100).toFixed(1)}%, stability=${(
        summary.metrics.stabilityScore.mean * 100
      ).toFixed(1)}%, practical=${(summary.practicalSeedRate * 100).toFixed(1)}%`,
    );
  }
  lines.push(
    "",
    `Usable strategies: ${report.assessment.practicalStrategyCount}/${report.strategySummaries.length}`,
    `Single-strategy domination: ${report.assessment.singleStrategyDominatesAllMetrics ? "YES" : "NO"}`,
    `No-action sequence qualification: ${report.noActionSummary.qualifies ? "PASS" : "FAIL"}`,
    `Milestone assessment: ${report.assessment.passesMilestone ? "PASS" : "NEEDS TUNING"}`,
  );
  return lines.join("\n");
}
