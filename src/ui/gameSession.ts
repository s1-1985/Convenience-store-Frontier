import {
  createBrowserFreePlaySession,
  type BrowserFreePlaySession,
} from "./browserFreePlaySession.js";
import { loadBrowserScenario } from "./browserScenario.js";
import type { ScenarioBundle } from "../simulation/types.js";

// The default seed used when no #seed-input value is available yet (matches the
// game's 1970s setting and the seed already used elsewhere, e.g. createStoreOperationsEngine).
const DEFAULT_SEED = 1977;

export interface GameSessionState {
  scenario: ScenarioBundle;
  session: BrowserFreePlaySession;
}

let statePromise: Promise<GameSessionState> | undefined;
let state: GameSessionState | undefined;

async function createState(seed: number): Promise<GameSessionState> {
  const scenario = await loadBrowserScenario();
  const session = createBrowserFreePlaySession(scenario, seed);
  return { scenario, session };
}

/**
 * Lazily creates, on first call, the single `Simulation` instance shared by every
 * script on the page (main.ts's numeric dashboard and storeGameRuntime.ts's visual
 * store canvas alike) and caches it. Later calls return the same in-flight or
 * resolved promise, so only one session is ever created from this entry point.
 */
export function getGameSession(seed = DEFAULT_SEED): Promise<GameSessionState> {
  if (!statePromise) {
    statePromise = createState(seed).then((created) => {
      state = created;
      return created;
    });
  }
  return statePromise;
}

/**
 * Synchronously returns the current session if `getGameSession` has already
 * resolved, or undefined otherwise. Callers that run on every animation frame
 * (storeGameRuntime.ts) should use this instead of caching the resolved session
 * themselves, so a later `resetGameSession` call is picked up immediately.
 */
export function peekGameSession(): GameSessionState | undefined {
  return state;
}

/**
 * Replaces the shared session with a freshly seeded one, keeping the already-loaded
 * scenario. Used by "start over" flows. Throws if no session has loaded yet — callers
 * only offer a reset once the game is already running.
 */
export function resetGameSession(seed: number): GameSessionState {
  if (!state) {
    throw new Error("Cannot reset the game session before it has loaded");
  }
  const session = createBrowserFreePlaySession(state.scenario, seed);
  state = { scenario: state.scenario, session };
  statePromise = Promise.resolve(state);
  return state;
}
