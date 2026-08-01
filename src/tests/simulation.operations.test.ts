import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { createSimulation, type Simulation } from "../simulation/simulation.js";
import type { DailyReport } from "../reporting/dailyReport.js";
import type { ScenarioBundle, TimeBlockId } from "../simulation/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");
const TIME_BLOCKS: readonly TimeBlockId[] = ["morning", "midday", "afternoon", "evening"];

function loadTestScenario(): ScenarioBundle {
  return loadScenario(SCENARIO_PATH);
}

function overloadedScenario(totalDays = 3): ScenarioBundle {
  const base = loadTestScenario();
  return {
    ...base,
    scenario: { ...base.scenario, totalDays },
    cohorts: base.cohorts.map((cohort) => ({
      ...cohort,
      population: cohort.population * 8,
    })),
  };
}

function setAllStaffing(simulation: Simulation, count: number): void {
  for (const timeBlock of TIME_BLOCKS) {
    simulation.applyPolicy({ type: "set_staffing", timeBlock, count });
  }
}

function sumReports(reports: readonly DailyReport[], selector: (report: DailyReport) => number): number {
  return reports.reduce((sum, report) => sum + selector(report), 0);
}

function totalOperationWorkload(report: DailyReport): number {
  return Object.values(report.operationWorkloadByTask).reduce((sum, value) => sum + value, 0);
}

describe("store operations (Issue #5 completion criteria)", () => {
  it("register priority reduces abandonment while allowing replenishment backlog to grow", () => {
    const scenario = overloadedScenario();

    const registerFirst = createSimulation(scenario, 303);
    setAllStaffing(registerFirst, 1);
    registerFirst.applyPolicy({
      type: "set_task_priorities",
      priorities: ["register", "delivery_receiving", "admin", "cleaning", "replenishment"],
    });
    registerFirst.runToEnd();

    const replenishmentFirst = createSimulation(scenario, 303);
    setAllStaffing(replenishmentFirst, 1);
    replenishmentFirst.applyPolicy({
      type: "set_task_priorities",
      priorities: ["replenishment", "cleaning", "delivery_receiving", "admin", "register"],
    });
    replenishmentFirst.runToEnd();

    const registerReports = registerFirst.getAllDailyReports();
    const replenishmentReports = replenishmentFirst.getAllDailyReports();
    const registerFinal = registerReports.at(-1);
    const replenishmentFinal = replenishmentReports.at(-1);

    expect(registerFinal).toBeDefined();
    expect(replenishmentFinal).toBeDefined();
    expect(sumReports(registerReports, (report) => report.abandonedCustomers)).toBeLessThan(
      sumReports(replenishmentReports, (report) => report.abandonedCustomers),
    );
    expect(registerFinal!.operationBacklogByTask.replenishment).toBeGreaterThan(
      replenishmentFinal!.operationBacklogByTask.replenishment,
    );
  });

  it("can report shelf stockouts while inventory remains in the backroom", () => {
    const simulation = createSimulation(overloadedScenario(1), 404);
    setAllStaffing(simulation, 1);
    simulation.applyPolicy({
      type: "set_task_priorities",
      priorities: ["register", "delivery_receiving", "admin", "cleaning", "replenishment"],
    });

    simulation.runToEnd();
    const report = simulation.getDailyReport(1);

    expect(report).toBeDefined();
    expect(report!.operationalShelfStockoutUnits).toBeGreaterThan(0);
    expect(report!.backroomInventoryUnitsEnd).toBeGreaterThan(0);
  });

  it("long opening hours create more total and night operation workload", () => {
    const base = loadTestScenario();
    const scenario: ScenarioBundle = {
      ...base,
      scenario: { ...base.scenario, totalDays: 3 },
    };

    const shortHours = createSimulation(scenario, 505);
    shortHours.applyPolicy({ type: "set_opening_hours", openingHour: 8, closingHour: 20 });
    shortHours.runToEnd();

    const longHours = createSimulation(scenario, 505);
    longHours.applyPolicy({ type: "set_opening_hours", openingHour: 7, closingHour: 23 });
    longHours.runToEnd();

    const shortReports = shortHours.getAllDailyReports();
    const longReports = longHours.getAllDailyReports();

    expect(sumReports(longReports, totalOperationWorkload)).toBeGreaterThan(
      sumReports(shortReports, totalOperationWorkload),
    );
    expect(sumReports(longReports, (report) => report.nightOperationWorkload)).toBeGreaterThan(
      sumReports(shortReports, (report) => report.nightOperationWorkload),
    );
  });

  it("rejects incomplete or duplicated task priority lists", () => {
    const simulation = createSimulation(loadTestScenario(), 1);

    expect(() =>
      simulation.applyPolicy({
        type: "set_task_priorities",
        priorities: ["register", "register", "cleaning", "delivery_receiving", "admin"],
      }),
    ).toThrow();
  });
});
