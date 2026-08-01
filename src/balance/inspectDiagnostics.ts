import { resolve } from "node:path";
import { loadScenario } from "../data/loaders/loadScenario.js";
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
