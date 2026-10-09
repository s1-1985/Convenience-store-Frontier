import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import { createCompetitiveSimulation } from "../simulation/competitiveSimulation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");

describe("createCompetitiveSimulation", () => {
  it("runs 30 days and evaluates competitor strategy only on three-day boundaries", () => {
    const simulation = createCompetitiveSimulation(loadScenario(SCENARIO_PATH), 5050);

    simulation.runToEnd();

    const reports = simulation.getAllDailyReports();
    expect(reports).toHaveLength(30);
    for (const report of reports) {
      if (report.competitorDecisions.length > 0) {
        expect(report.day % 3).toBe(0);
      }
    }
    expect(simulation.getSnapshot().competitorAI.lastObservedDay).toBe(30);
  });

  it("produces identical competitor observations, decisions, and store state for the same seed", () => {
    const scenarioA = loadScenario(SCENARIO_PATH);
    const scenarioB = loadScenario(SCENARIO_PATH);
    const simulationA = createCompetitiveSimulation(scenarioA, 7777);
    const simulationB = createCompetitiveSimulation(scenarioB, 7777);

    simulationA.runToEnd();
    simulationB.runToEnd();

    expect(simulationA.getAllDailyReports()).toEqual(simulationB.getAllDailyReports());
    expect(simulationA.getSnapshot().competitorAI).toEqual(
      simulationB.getSnapshot().competitorAI,
    );
  });

  it("継続的に赤字の競合店は6ヶ月後(design/ps1-reference/algorithms.md §8.1)に閉店し、以後開店しない", () => {
    const scenario = loadScenario(SCENARIO_PATH);
    // 人件費を極端に増やして恒常的な赤字を作り、閉店判断を誘発する
    scenario.competitorStores[0]!.staffingByTimeBlock = {
      morning: 50,
      midday: 50,
      afternoon: 50,
      evening: 50,
    };
    const simulation = createCompetitiveSimulation(scenario, 123, { maxDays: 40 });
    simulation.runToEnd();

    const competitorId = scenario.competitorStores[0]!.id;
    const finalState = simulation.getSnapshot().rivalCloseStateByStore[competitorId]!;
    expect(finalState.closed).toBe(true);

    const reports = simulation.getAllDailyReports();
    const lastReport = reports.at(-1)!;
    // 閉店後は営業時間が0になりevaluateStoreで評価対象から外れるため、
    // visitsByStoreにそもそもエントリが現れなくなる
    expect(lastReport.visitsByStore[competitorId]).toBeUndefined();
  });

  it("does not mutate the caller's scenario definition while competitor policy changes", () => {
    const scenario = loadScenario(SCENARIO_PATH);
    const originalCompetitors = structuredClone(scenario.competitorStores);
    const simulation = createCompetitiveSimulation(scenario, 9090);

    simulation.runToEnd();

    expect(scenario.competitorStores).toEqual(originalCompetitors);
  });
});
