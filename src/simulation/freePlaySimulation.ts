import type { CompetitiveDailyReport, CompetitiveSimulation } from "./competitiveSimulation.js";
import { createCompetitiveSimulation } from "./competitiveSimulation.js";
import { absoluteSlot } from "./inventory.js";
import type { PolicyCommand } from "./simulation.js";
import type { ScenarioBundle } from "./types.js";

export interface FreePlayCommandEvent {
  absoluteSlot: number;
  command: PolicyCommand;
}

export interface FreePlaySave {
  schemaVersion: 1;
  scenarioId: string;
  seed: number;
  day: number;
  slot: number;
  commandEvents: FreePlayCommandEvent[];
  savedAt: string;
}

export interface FreePlaySimulation extends CompetitiveSimulation {
  exportSave(): FreePlaySave;
}

function cloneCommand(command: PolicyCommand): PolicyCommand {
  switch (command.type) {
    case "set_category_area":
      return { ...command, categoryArea: { ...command.categoryArea } };
    case "set_task_priorities":
      return { ...command, priorities: [...command.priorities] };
    default:
      return { ...command };
  }
}

export function isFreePlaySave(value: unknown): value is FreePlaySave {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FreePlaySave>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.scenarioId === "string" &&
    typeof candidate.seed === "number" &&
    Number.isInteger(candidate.day) &&
    Number.isInteger(candidate.slot) &&
    Array.isArray(candidate.commandEvents) &&
    typeof candidate.savedAt === "string"
  );
}

export function parseFreePlaySave(serialized: string): FreePlaySave | null {
  try {
    const value = JSON.parse(serialized) as unknown;
    return isFreePlaySave(value) ? value : null;
  } catch {
    return null;
  }
}

function validateSave(scenario: ScenarioBundle, seed: number, save: FreePlaySave): void {
  if (save.scenarioId !== scenario.scenario.id) {
    throw new Error("保存データの街データが現在のゲームと一致しない");
  }
  if (save.seed !== seed) {
    throw new Error("保存データのシードが現在のゲームと一致しない");
  }
  if (save.day < 1 || save.slot < 0 || save.slot >= 72) {
    throw new Error("保存データのゲーム時刻が不正である");
  }
  const target = absoluteSlot(save.day, save.slot);
  if (
    save.commandEvents.some(
      (event) =>
        !Number.isInteger(event.absoluteSlot) ||
        event.absoluteSlot < 0 ||
        event.absoluteSlot > target ||
        !event.command ||
        typeof event.command.type !== "string",
    )
  ) {
    throw new Error("保存データの方針変更履歴が不正である");
  }
}

export function createFreePlaySimulation(
  scenario: ScenarioBundle,
  seed: number,
  save?: FreePlaySave,
): FreePlaySimulation {
  if (save) validateSave(scenario, seed, save);

  const core = createCompetitiveSimulation(scenario, seed, { maxDays: null });
  const commandEvents: FreePlayCommandEvent[] = save
    ? save.commandEvents
        .map((event) => ({
          absoluteSlot: event.absoluteSlot,
          command: cloneCommand(event.command),
        }))
        .sort((left, right) => left.absoluteSlot - right.absoluteSlot)
    : [];

  if (save) {
    const targetAbsoluteSlot = absoluteSlot(save.day, save.slot);
    let eventIndex = 0;

    while (absoluteSlot(core.getSnapshot().day, core.getSnapshot().slot) < targetAbsoluteSlot) {
      const currentAbsoluteSlot = absoluteSlot(core.getSnapshot().day, core.getSnapshot().slot);
      while (commandEvents[eventIndex]?.absoluteSlot === currentAbsoluteSlot) {
        core.applyPolicy(cloneCommand(commandEvents[eventIndex]!.command));
        eventIndex += 1;
      }
      core.advanceSlot();
    }

    while (commandEvents[eventIndex]?.absoluteSlot === targetAbsoluteSlot) {
      core.applyPolicy(cloneCommand(commandEvents[eventIndex]!.command));
      eventIndex += 1;
    }
  }

  return {
    getSnapshot: () => core.getSnapshot(),
    getDailyReport: (day: number): CompetitiveDailyReport | undefined => core.getDailyReport(day),
    getAllDailyReports: () => core.getAllDailyReports(),

    applyPolicy(command: PolicyCommand): void {
      const snapshot = core.getSnapshot();
      core.applyPolicy(command);
      commandEvents.push({
        absoluteSlot: absoluteSlot(snapshot.day, snapshot.slot),
        command: cloneCommand(command),
      });
    },

    advanceSlot: () => core.advanceSlot(),
    advanceDay: () => core.advanceDay(),

    runToEnd(): void {
      throw new Error("フリープレイには終了日がないためrunToEndは使用できない");
    },

    isFinished: () => false,

    exportSave(): FreePlaySave {
      const snapshot = core.getSnapshot();
      return {
        schemaVersion: 1,
        scenarioId: scenario.scenario.id,
        seed,
        day: snapshot.day,
        slot: snapshot.slot,
        commandEvents: commandEvents.map((event) => ({
          absoluteSlot: event.absoluteSlot,
          command: cloneCommand(event.command),
        })),
        savedAt: new Date().toISOString(),
      };
    },
  };
}
