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

  it("does not mutate the caller's scenario definition while competitor policy changes", () => {
    const scenario = loadScenario(SCENARIO_PATH);
    const originalCompetitors = structuredClone(scenario.competitorStores);
    const simulation = createCompetitiveSimulation(scenario, 9090);

    simulation.runToEnd();

    expect(scenario.competitorStores).toEqual(originalCompetitors);
  });
});
