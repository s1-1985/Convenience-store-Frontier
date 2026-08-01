import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import {
  BALANCE_KPI_KEYS,
  BALANCE_STRATEGY_IDS,
  assessBalance,
  balanceBenchmarkToCsv,
  getStrategyCommands,
  runBalanceBenchmark,
  type BalanceStrategySummary,
  type MetricDistribution,
  type NoActionDiagnosticSummary,
} from "../balance/benchmark.js";

const scenario = loadScenario(resolve("data/scenarios/vertical_slice_30d.json"));

function metric(mean: number): MetricDistribution {
  return {
    mean,
    median: mean,
    standardDeviation: 0,
    p10: mean,
    p90: mean,
    min: mean,
    max: mean,
  };
}

function syntheticSummary(
  strategyId: (typeof BALANCE_STRATEGY_IDS)[number],
  score: number,
): BalanceStrategySummary {
  return {
    strategyId,
    label: strategyId,
    seedCount: 10,
    practicalSeedRate: 1,
    metrics: Object.fromEntries(BALANCE_KPI_KEYS.map((key) => [key, metric(score)])) as BalanceStrategySummary["metrics"],
    endingCash: metric(score),
    wasteRate: metric(0.1),
    playerHabitContribution: metric(score),
    competitorActionCount: metric(1),
  };
}

const passingNoAction: NoActionDiagnosticSummary = {
  seedCount: 10,
  morningOutflowRate: 1,
  lunchStockoutRate: 1,
  wasteRate: 1,
  closedDemandRate: 1,
  orderedRate: 1,
  qualifies: true,
};

describe("balance benchmark", () => {
  it("同じシード範囲では同じ比較結果になる", () => {
    const first = runBalanceBenchmark(scenario, { seedStart: 1977, seedCount: 1 });
    const second = runBalanceBenchmark(scenario, { seedStart: 1977, seedCount: 1 });

    expect(first).toEqual(second);
    expect(first.runs).toHaveLength(BALANCE_STRATEGY_IDS.length);
    expect(first.strategySummaries).toHaveLength(BALANCE_STRATEGY_IDS.length);
  });

  it("4戦略の初期方針が同一ではない", () => {
    const fingerprints = BALANCE_STRATEGY_IDS.map((strategyId) =>
      JSON.stringify(getStrategyCommands(strategyId, 1, scenario)),
    );

    expect(new Set(fingerprints).size).toBe(BALANCE_STRATEGY_IDS.length);
  });

  it("全戦略のKPIが有限値でCSVへ出力できる", () => {
    const report = runBalanceBenchmark(scenario, { seedStart: 8, seedCount: 1 });

    for (const run of report.runs) {
      expect(Number.isFinite(run.totalProfit)).toBe(true);
      expect(Number.isFinite(run.serviceReliability)).toBe(true);
      expect(Number.isFinite(run.habitScore)).toBe(true);
      expect(Number.isFinite(run.stabilityScore)).toBe(true);
      expect(run.serviceReliability).toBeGreaterThanOrEqual(0);
      expect(run.serviceReliability).toBeLessThanOrEqual(1);
    }

    const csv = balanceBenchmarkToCsv(report);
    expect(csv).toContain("strategy_id,seed,total_revenue");
    expect(csv.trim().split("\n")).toHaveLength(BALANCE_STRATEGY_IDS.length + 1);
  });

  it("同じ戦略が全評価軸で首位なら独占と判定する", () => {
    const summaries = BALANCE_STRATEGY_IDS.map((strategyId, index) =>
      syntheticSummary(strategyId, BALANCE_STRATEGY_IDS.length - index),
    );
    const assessment = assessBalance(summaries, passingNoAction);

    expect(assessment.singleStrategyDominatesAllMetrics).toBe(true);
    expect(assessment.dominantStrategyId).toBe("short_low_cost");
    expect(assessment.passesMilestone).toBe(false);
  });

  it("評価軸の勝者が分散すれば戦略独占ではない", () => {
    const summaries = BALANCE_STRATEGY_IDS.map((strategyId) => syntheticSummary(strategyId, 1));
    summaries[0]!.metrics.totalProfit = metric(5);
    summaries[1]!.metrics.serviceReliability = metric(5);
    summaries[2]!.metrics.habitScore = metric(5);
    summaries[3]!.metrics.stabilityScore = metric(5);
    summaries[3]!.metrics.competitiveResilience = metric(5);
    const assessment = assessBalance(summaries, passingNoAction);

    expect(assessment.singleStrategyDominatesAllMetrics).toBe(false);
    expect(assessment.practicalStrategyCount).toBe(4);
    expect(assessment.passesMilestone).toBe(true);
  });
});
