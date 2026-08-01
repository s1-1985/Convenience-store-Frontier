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
});
