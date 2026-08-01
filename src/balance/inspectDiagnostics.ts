import { resolve } from "node:path";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { createCompetitiveSimulation } from "../simulation/competitiveSimulation.js";
import { runBalanceBenchmark } from "./benchmark.js";

const scenario = loadScenario(resolve("data/scenarios/vertical_slice_30d.json"));
const report = runBalanceBenchmark(scenario, {
  seedStart: 1,
  seedCount: 8,
  strategyIds: ["short_low_cost"],
});

for (const diagnostic of report.noActionDiagnostics) {
  console.log(
    `seed=${diagnostic.seed} morning=${diagnostic.morningOutflowDay ?? "-"} lunch=${diagnostic.lunchStockoutDay ?? "-"} waste=${diagnostic.wasteDay ?? "-"} closed=${diagnostic.closedDemandDay ?? "-"}`,
  );
}

const simulation = createCompetitiveSimulation(scenario, 1);
simulation.runToEnd();
const readyProductIds = new Set(
  scenario.products
    .filter((product) => product.categoryId === "category_ready_to_eat")
    .map((product) => product.id),
);
for (const day of simulation.getAllDailyReports().slice(0, 8)) {
  const readyStockout = Object.entries(day.stockoutUnitsByProduct)
    .filter(([productId]) => readyProductIds.has(productId))
    .reduce((total, [, units]) => total + units, 0);
  console.log(
    `day=${day.day} ready-stockout=${readyStockout.toFixed(1)} shelf-stockout=${day.operationalShelfStockoutUnits.toFixed(1)} waste=${day.wasteCost.toFixed(0)} breakfast-gap=${Math.max(0, day.habitDailyPotentialDemandByHabit.breakfast_purchase - day.habitDailyPlayerSuccessfulVisitsByHabit.breakfast_purchase).toFixed(1)} night-gap=${Math.max(0, day.habitDailyPotentialDemandByHabit.night_shopping - day.habitDailyPlayerSuccessfulVisitsByHabit.night_shopping).toFixed(1)}`,
  );
}
