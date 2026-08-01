import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { createSimulation } from "../simulation/simulation.js";
import type { DailyReport } from "../reporting/dailyReport.js";
import type { ScenarioBundle } from "../simulation/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");

function loadTestScenario(): ScenarioBundle {
  return loadScenario(SCENARIO_PATH);
}

function sumByProduct(reports: DailyReport[], field: "stockoutUnitsByProduct" | "wasteUnitsByProduct", productId: string): number {
  return reports.reduce((sum, r) => sum + (r[field][productId] ?? 0), 0);
}

function sumDeliveryCost(reports: DailyReport[]): number {
  return reports.reduce((sum, r) => sum + r.deliveryCost, 0);
}

function sumProfit(reports: DailyReport[]): number {
  return reports.reduce((sum, r) => sum + r.profit, 0);
}

describe("ordering policy vs stockout/waste (Issue #3 completion criteria)", () => {
  it("stockout_prevention reduces bento stockouts but increases bento waste versus sell_through", () => {
    const scenario = loadTestScenario();
    const bentoId = "product_bento_makunouchi";

    const sellThrough = createSimulation(scenario, 2024);
    sellThrough.applyPolicy({ type: "set_ordering_policy", policy: "sell_through" });
    sellThrough.runToEnd();
    const sellThroughReports = sellThrough.getAllDailyReports();

    const stockoutPrevention = createSimulation(scenario, 2024);
    stockoutPrevention.applyPolicy({ type: "set_ordering_policy", policy: "stockout_prevention" });
    stockoutPrevention.runToEnd();
    const stockoutPreventionReports = stockoutPrevention.getAllDailyReports();

    const stockoutUnderSellThrough = sumByProduct(sellThroughReports, "stockoutUnitsByProduct", bentoId);
    const stockoutUnderPrevention = sumByProduct(stockoutPreventionReports, "stockoutUnitsByProduct", bentoId);
    const wasteUnderSellThrough = sumByProduct(sellThroughReports, "wasteUnitsByProduct", bentoId);
    const wasteUnderPrevention = sumByProduct(stockoutPreventionReports, "wasteUnitsByProduct", bentoId);

    expect(stockoutUnderPrevention).toBeLessThan(stockoutUnderSellThrough);
    expect(wasteUnderPrevention).toBeGreaterThan(wasteUnderSellThrough);
  });
});

describe("delivery policy vs cost (Issue #3 completion criteria)", () => {
  it("twice-daily delivery costs more than once-daily delivery", () => {
    const scenario = loadTestScenario();

    const onceDaily = createSimulation(scenario, 77);
    onceDaily.applyPolicy({ type: "set_delivery_policy", policy: "once_daily" });
    onceDaily.runToEnd();

    const twiceDaily = createSimulation(scenario, 77);
    twiceDaily.applyPolicy({ type: "set_delivery_policy", policy: "all_categories_twice_daily" });
    twiceDaily.runToEnd();

    expect(sumDeliveryCost(twiceDaily.getAllDailyReports())).toBeGreaterThan(
      sumDeliveryCost(onceDaily.getAllDailyReports()),
    );
  });

  it("twice-daily delivery is less profitable than once-daily under low sales volume", () => {
    const baseScenario = loadTestScenario();
    const lowVolumeScenario: ScenarioBundle = {
      ...baseScenario,
      cohorts: baseScenario.cohorts.map((cohort) => ({
        ...cohort,
        population: Math.round(cohort.population * 0.05),
      })),
    };

    const onceDaily = createSimulation(lowVolumeScenario, 555);
    onceDaily.applyPolicy({ type: "set_delivery_policy", policy: "once_daily" });
    onceDaily.runToEnd();

    const twiceDaily = createSimulation(lowVolumeScenario, 555);
    twiceDaily.applyPolicy({ type: "set_delivery_policy", policy: "all_categories_twice_daily" });
    twiceDaily.runToEnd();

    expect(sumProfit(onceDaily.getAllDailyReports())).toBeGreaterThan(
      sumProfit(twiceDaily.getAllDailyReports()),
    );
  });
});
