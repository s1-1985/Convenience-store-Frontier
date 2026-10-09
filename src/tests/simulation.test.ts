import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { createSimulation } from "../simulation/simulation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");

function loadTestScenario() {
  return loadScenario(SCENARIO_PATH);
}

describe("createSimulation", () => {
  it("produces identical 30-day results for the same seed and policy", () => {
    const scenario = loadTestScenario();

    const simA = createSimulation(scenario, 12345);
    simA.runToEnd();
    const reportsA = simA.getAllDailyReports();

    const simB = createSimulation(scenario, 12345);
    simB.runToEnd();
    const reportsB = simB.getAllDailyReports();

    expect(reportsA).toEqual(reportsB);
  });

  it("produces different results for different seeds", () => {
    const scenario = loadTestScenario();

    const simA = createSimulation(scenario, 1);
    simA.runToEnd();

    const simB = createSimulation(scenario, 2);
    simB.runToEnd();

    expect(simA.getAllDailyReports()).not.toEqual(simB.getAllDailyReports());
  });

  it("runs all 30 days to completion without stopping", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 999);

    sim.runToEnd();

    expect(sim.isFinished()).toBe(true);
    const reports = sim.getAllDailyReports();
    expect(reports).toHaveLength(scenario.scenario.totalDays);
    expect(reports.map((r) => r.day)).toEqual(
      Array.from({ length: scenario.scenario.totalDays }, (_, i) => i + 1),
    );
  });

  it("yields different demand, cost, and profit for 8-20 vs 7-23 opening hours", () => {
    const scenario = loadTestScenario();

    const shortHours = createSimulation(scenario, 555);
    shortHours.applyPolicy({ type: "set_opening_hours", openingHour: 8, closingHour: 20 });
    shortHours.runToEnd();
    const shortReports = shortHours.getAllDailyReports();

    const longHours = createSimulation(scenario, 555);
    longHours.applyPolicy({ type: "set_opening_hours", openingHour: 7, closingHour: 23 });
    longHours.runToEnd();
    const longReports = longHours.getAllDailyReports();

    const totalRevenue = (reports: typeof shortReports) => reports.reduce((sum, r) => sum + r.revenue, 0);
    const totalLaborCost = (reports: typeof shortReports) =>
      reports.reduce((sum, r) => sum + r.laborCost, 0);
    const totalProfit = (reports: typeof shortReports) => reports.reduce((sum, r) => sum + r.profit, 0);

    expect(totalRevenue(longReports)).not.toBeCloseTo(totalRevenue(shortReports), 5);
    expect(totalLaborCost(longReports)).toBeGreaterThan(totalLaborCost(shortReports));
    expect(totalProfit(longReports)).not.toBeCloseTo(totalProfit(shortReports), 5);
  });

  it("MONTH_LENGTH_DAYS(4日)ごとの日次レポートにのみ店舗評価の更新が記録される", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 777);
    sim.runToEnd();
    const reports = sim.getAllDailyReports();

    for (const report of reports) {
      if (report.day % 4 === 0) {
        expect(report.storeRatingUpdate).toBeDefined();
      } else {
        expect(report.storeRatingUpdate).toBeUndefined();
      }
    }
  });

  it("月末の店舗評価更新がplayerStore.reputationのスナップショットへ反映される", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 777);
    const initialReputation = sim.getSnapshot().playerStore.reputation;
    expect(initialReputation).toBe(scenario.playerStore.reputation);

    sim.advanceDay();
    sim.advanceDay();
    sim.advanceDay();
    expect(sim.getSnapshot().playerStore.reputation).toBe(initialReputation);

    sim.advanceDay();
    const afterFirstMonth = sim.getAllDailyReports().at(-1);
    expect(afterFirstMonth?.storeRatingUpdate).toBeDefined();
    expect(sim.getSnapshot().playerStore.reputation).toBe(
      afterFirstMonth!.storeRatingUpdate!.updatedRating,
    );
  });

  it("MONTH_LENGTH_DAYS(4日)ごとの月末にのみ財務の月次8倍補正ボーナスが記録される", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 777);
    sim.runToEnd();
    const reports = sim.getAllDailyReports();

    for (const report of reports) {
      if (report.day % 4 === 0) {
        expect(report.monthlyProfitCorrectionBonus).toBeDefined();
      } else {
        expect(report.monthlyProfitCorrectionBonus).toBeUndefined();
      }
    }
  });

  it("月次8倍補正ボーナスが、その月の4日分の利益合計の7倍としてcashへ反映される", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 777);
    sim.runToEnd();
    const reports = sim.getAllDailyReports();

    const firstMonth = reports.slice(0, 4);
    const monthProfit = firstMonth.reduce((sum, r) => sum + r.profit, 0);
    const expectedBonus = monthProfit * 7;

    expect(firstMonth[3]!.monthlyProfitCorrectionBonus).toBeCloseTo(expectedBonus, 5);

    const cashBeforeBonus =
      scenario.playerStore.initialCash + firstMonth.reduce((sum, r) => sum + r.profit, 0);
    expect(firstMonth[3]!.cashEnd).toBeCloseTo(cashBeforeBonus + expectedBonus, 5);
  });

  it("MONTH_LENGTH_DAYS(4日)ごとの月末にのみ街の成長の集計が記録され、snapshotにも反映される", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 777);

    expect(sim.getSnapshot().townGrowth).toEqual({
      averageLevel: 0,
      maxLevel: 0,
      influencedTileCount: 0,
    });

    sim.runToEnd();
    const reports = sim.getAllDailyReports();

    for (const report of reports) {
      if (report.day % 4 === 0) {
        expect(report.townGrowth).toBeDefined();
      } else {
        expect(report.townGrowth).toBeUndefined();
      }
    }

    const lastMonthEnd = reports.filter((r) => r.day % 4 === 0).at(-1)!;
    expect(sim.getSnapshot().townGrowth).toEqual(lastMonthEnd.townGrowth);
    expect(sim.getSnapshot().townGrowth.influencedTileCount).toBeGreaterThan(0);
  });

  it("店員の活力が長時間営業で尽きると、稼働人数とsnapshotのstaffRosterに現れる", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 42);

    const initialRoster = sim.getSnapshot().staffRoster;
    expect(initialRoster.averageEnergy).toBe(100);
    expect(initialRoster.restingCount).toBe(0);

    for (let day = 0; day < 10; day += 1) {
      sim.advanceDay();
    }

    const laterRoster = sim.getSnapshot().staffRoster;
    expect(laterRoster.averageEnergy).toBeLessThan(100);
  });

  it("applies a renovation fee when category area changes by more than 10 points", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 1);
    const before = sim.getSnapshot().cash;

    sim.applyPolicy({
      type: "set_category_area",
      categoryArea: {
        category_ready_to_eat: 25,
        category_beverages: 12,
        category_snacks: 10,
        category_processed_food: 11,
        category_daily_goods: 2,
        category_magazines: 10,
      },
    });

    expect(sim.getSnapshot().cash).toBe(before - 50000);
  });

  it("rejects staffing counts outside the [1,4] range", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 1);
    expect(() => sim.applyPolicy({ type: "set_staffing", timeBlock: "morning", count: 5 })).toThrow();
    expect(() => sim.applyPolicy({ type: "set_staffing", timeBlock: "morning", count: 0 })).toThrow();
  });

  it("exposes the player visit count for the most recently processed slot", () => {
    const scenario = loadTestScenario();
    const sim = createSimulation(scenario, 1977);

    expect(sim.getSnapshot().lastSlotPlayerVisits).toBe(0);

    // Advance into the morning rush, when the store is open and cohorts have
    // potential demand, so at least one slot should register a positive visit count.
    for (let i = 0; i < 20 && sim.getSnapshot().lastSlotPlayerVisits <= 0; i += 1) {
      sim.advanceSlot();
    }
    expect(sim.getSnapshot().lastSlotPlayerVisits).toBeGreaterThan(0);

    // Closed-store slots (well past closing) should show no player visits.
    while (sim.getSnapshot().day === 1) {
      sim.advanceSlot();
    }
    expect(sim.getSnapshot().lastSlotPlayerVisits).toBe(0);
  });
});
