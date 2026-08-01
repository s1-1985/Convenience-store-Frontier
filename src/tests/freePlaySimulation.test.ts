import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../data/loaders/loadScenario.js";
import {
  createFreePlaySimulation,
  parseFreePlaySave,
} from "../simulation/freePlaySimulation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, "../../data/scenarios/vertical_slice_30d.json");

describe("free-play simulation", () => {
  it("30日を超えて終了せずに継続できる", () => {
    const simulation = createFreePlaySimulation(loadScenario(SCENARIO_PATH), 1977);

    for (let day = 0; day < 45; day += 1) {
      simulation.advanceDay();
    }

    expect(simulation.isFinished()).toBe(false);
    expect(simulation.getAllDailyReports()).toHaveLength(45);
    expect(simulation.getSnapshot().day).toBe(46);
    expect(() => simulation.runToEnd()).toThrow(/終了日がない/);
  });

  it("方針変更履歴と時刻から同じ店舗状態を復元できる", () => {
    const scenario = loadScenario(SCENARIO_PATH);
    const original = createFreePlaySimulation(scenario, 5050);

    original.applyPolicy({ type: "set_opening_hours", openingHour: 7, closingHour: 22 });
    original.advanceDay();
    original.applyPolicy({ type: "set_ordering_policy", policy: "stockout_prevention" });
    original.advanceDay();
    original.applyPolicy({
      type: "set_staffing",
      timeBlock: "midday",
      count: 3,
    });
    for (let slot = 0; slot < 13; slot += 1) original.advanceSlot();

    const save = original.exportSave();
    const restored = createFreePlaySimulation(loadScenario(SCENARIO_PATH), save.seed, save);

    expect(restored.getSnapshot()).toEqual(original.getSnapshot());
    expect(restored.getAllDailyReports()).toEqual(original.getAllDailyReports());
    expect(restored.exportSave().commandEvents).toEqual(save.commandEvents);
  });

  it("保存データを安全に解析し、不正JSONを拒否する", () => {
    const simulation = createFreePlaySimulation(loadScenario(SCENARIO_PATH), 9090);
    simulation.advanceDay();
    const serialized = JSON.stringify(simulation.exportSave());

    expect(parseFreePlaySave(serialized)).toEqual(simulation.exportSave());
    expect(parseFreePlaySave("not-json")).toBeNull();
    expect(parseFreePlaySave('{"schemaVersion":99}')).toBeNull();
  });
});
