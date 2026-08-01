import {
  createFreePlaySimulation,
  parseFreePlaySave,
  type FreePlaySave,
  type FreePlaySimulation,
} from "../simulation/freePlaySimulation.js";
import type { PolicyCommand } from "../simulation/simulation.js";
import type { ScenarioBundle } from "../simulation/types.js";

const SAVE_STORAGE_KEY = "csf.freeplay.save.v1";
const SAVE_INTERVAL_MS = 1_000;

export interface BrowserFreePlaySession {
  simulation: FreePlaySimulation;
  restored: boolean;
  seed: number;
  flushSave(): void;
}

function readSave(): FreePlaySave | null {
  try {
    const stored = window.localStorage.getItem(SAVE_STORAGE_KEY);
    return stored ? parseFreePlaySave(stored) : null;
  } catch {
    return null;
  }
}

function writeSave(save: FreePlaySave): void {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable in private or embedded browser contexts.
  }
}

export function clearBrowserFreePlaySave(): void {
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function createBrowserFreePlaySession(
  scenario: ScenarioBundle,
  fallbackSeed: number,
): BrowserFreePlaySession {
  const stored = readSave();
  const compatibleSave = stored?.scenarioId === scenario.scenario.id ? stored : null;
  const seed = compatibleSave?.seed ?? fallbackSeed;
  const core = createFreePlaySimulation(scenario, seed, compatibleSave ?? undefined);
  let lastSavedAt = 0;

  const persist = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastSavedAt < SAVE_INTERVAL_MS) return;
    writeSave(core.exportSave());
    lastSavedAt = now;
  };

  const simulation: FreePlaySimulation = {
    getSnapshot: () => core.getSnapshot(),
    getDailyReport: (day) => core.getDailyReport(day),
    getAllDailyReports: () => core.getAllDailyReports(),

    applyPolicy(command: PolicyCommand): void {
      core.applyPolicy(command);
      persist(true);
    },

    advanceSlot(): void {
      core.advanceSlot();
      const snapshot = core.getSnapshot();
      persist(snapshot.slot === 0);
    },

    advanceDay(): void {
      core.advanceDay();
      persist(true);
    },

    runToEnd: () => core.runToEnd(),
    isFinished: () => false,
    exportSave: () => core.exportSave(),
  };

  persist(true);

  return {
    simulation,
    restored: compatibleSave !== null,
    seed,
    flushSave: () => persist(true),
  };
}
