import type { HabitId } from "./habits.js";
import type { RandomFn } from "./rng.js";
import type { StoreDefinition } from "./types.js";

export const COMPETITOR_ACTION_IDS = [
  "open_earlier",
  "close_later",
  "ready_to_eat_focus",
  "beverage_discount",
  "magazine_focus",
  "daily_goods_focus",
] as const;

export type CompetitorActionId = (typeof COMPETITOR_ACTION_IDS)[number];

export interface CompetitorPublicObservation {
  day: number;
  habitRegionalAdoptionByHabit: Record<HabitId, number>;
  playerVisits: number;
  competitorVisits: number;
  playerOpeningHour: number;
  playerClosingHour: number;
  playerCategoryArea: Record<string, number>;
  visiblePlayerServiceFailureRate: number;
}

export interface CompetitorPerceivedSignals {
  breakfastAdoption: number;
  lunchAdoption: number;
  nightAdoption: number;
  smallPurchaseAdoption: number;
  playerTrafficShare: number;
  visiblePlayerServiceFailureRate: number;
  playerOpeningHour: number;
  playerClosingHour: number;
  playerReadyToEatShare: number;
  playerMagazineShare: number;
  playerDailyGoodsShare: number;
}

export interface CompetitorStorePublicState {
  openingHour: number;
  closingHour: number;
  categoryArea: Record<string, number>;
  priceIndex: number;
}

export interface CompetitorActionEvent {
  day: number;
  storeId: string;
  actionId: CompetitorActionId;
  reason: string;
  perceivedSignals: CompetitorPerceivedSignals;
  before: CompetitorStorePublicState;
  after: CompetitorStorePublicState;
}

export interface CompetitorDecisionEvent {
  day: number;
  storeId: string;
  considered: boolean;
  selectedAction: CompetitorActionId | null;
  reason: string;
  perceivedSignals: CompetitorPerceivedSignals | null;
  action: CompetitorActionEvent | null;
}

export interface CompetitorAISnapshot {
  lastObservedDay: number;
  stores: Record<string, CompetitorStorePublicState>;
  actionHistory: CompetitorActionEvent[];
}

export interface CompetitorAI {
  observeDay(observation: CompetitorPublicObservation): CompetitorDecisionEvent[];
  getSnapshot(): CompetitorAISnapshot;
}

const DECISION_INTERVAL_DAYS = 3;
const ACTION_COOLDOWN_DAYS = 6;
const OBSERVATION_WINDOW_DAYS = 3;
const ACTION_THRESHOLD = 0.44;
const MIN_CATEGORY_AREA = 5;
const MAX_CATEGORY_AREA = 25;
const FOCUS_SHIFT_POINTS = 4;
const TOTAL_SHELF_AREA_POINTS = 70;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function cloneStoreState(store: StoreDefinition): CompetitorStorePublicState {
  return {
    openingHour: store.openingHour,
    closingHour: store.closingHour,
    categoryArea: { ...store.categoryArea },
    priceIndex: store.priceIndex,
  };
}

function noisy(value: number, rng: RandomFn, amplitude = 0.15): number {
  return Math.max(0, value * (1 - amplitude + rng() * amplitude * 2));
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function perceive(observations: readonly CompetitorPublicObservation[], rng: RandomFn): CompetitorPerceivedSignals {
  const latest = observations.at(-1);
  if (!latest) {
    throw new Error("Competitor AI requires at least one observation");
  }

  const breakfast = average(observations.map((o) => o.habitRegionalAdoptionByHabit.breakfast_purchase));
  const lunch = average(observations.map((o) => o.habitRegionalAdoptionByHabit.external_lunch));
  const night = average(observations.map((o) => o.habitRegionalAdoptionByHabit.night_shopping));
  const small = average(observations.map((o) => o.habitRegionalAdoptionByHabit.small_immediate_purchase));
  const playerVisits = average(observations.map((o) => o.playerVisits));
  const competitorVisits = average(observations.map((o) => o.competitorVisits));
  const trafficTotal = playerVisits + competitorVisits;
  const playerTrafficShare = trafficTotal > 0 ? playerVisits / trafficTotal : 0;
  const serviceFailure = average(observations.map((o) => o.visiblePlayerServiceFailureRate));

  return {
    breakfastAdoption: clamp01(noisy(breakfast, rng)),
    lunchAdoption: clamp01(noisy(lunch, rng)),
    nightAdoption: clamp01(noisy(night, rng)),
    smallPurchaseAdoption: clamp01(noisy(small, rng)),
    playerTrafficShare: clamp01(noisy(playerTrafficShare, rng, 0.12)),
    visiblePlayerServiceFailureRate: clamp01(noisy(serviceFailure, rng, 0.2)),
    playerOpeningHour: Math.max(6, Math.min(24, latest.playerOpeningHour + (rng() - 0.5))),
    playerClosingHour: Math.max(6, Math.min(24, latest.playerClosingHour + (rng() - 0.5))),
    playerReadyToEatShare: clamp01(
      noisy((latest.playerCategoryArea.category_ready_to_eat ?? 0) / TOTAL_SHELF_AREA_POINTS, rng, 0.1),
    ),
    playerMagazineShare: clamp01(
      noisy((latest.playerCategoryArea.category_magazines ?? 0) / TOTAL_SHELF_AREA_POINTS, rng, 0.1),
    ),
    playerDailyGoodsShare: clamp01(
      noisy((latest.playerCategoryArea.category_daily_goods ?? 0) / TOTAL_SHELF_AREA_POINTS, rng, 0.1),
    ),
  };
}

function shiftCategoryArea(store: StoreDefinition, targetCategoryId: string): boolean {
  const currentTarget = store.categoryArea[targetCategoryId] ?? 0;
  const room = Math.max(0, MAX_CATEGORY_AREA - currentTarget);
  if (room <= 0) {
    return false;
  }

  const donor = Object.entries(store.categoryArea)
    .filter(([categoryId, area]) => categoryId !== targetCategoryId && area > MIN_CATEGORY_AREA)
    .sort((a, b) => b[1] - a[1])[0];
  if (!donor) {
    return false;
  }

  const [donorCategoryId, donorArea] = donor;
  const shift = Math.min(FOCUS_SHIFT_POINTS, room, donorArea - MIN_CATEGORY_AREA);
  if (shift <= 0) {
    return false;
  }

  store.categoryArea = {
    ...store.categoryArea,
    [donorCategoryId]: donorArea - shift,
    [targetCategoryId]: currentTarget + shift,
  };
  return true;
}

function scoreActions(store: StoreDefinition, signals: CompetitorPerceivedSignals): Record<CompetitorActionId, number> {
  const playerStartsEarlier = Math.max(0, store.openingHour - signals.playerOpeningHour) / 6;
  const playerClosesLater = Math.max(0, signals.playerClosingHour - store.closingHour) / 6;

  return {
    open_earlier: signals.breakfastAdoption * 1.05 + playerStartsEarlier * 0.55,
    close_later: signals.nightAdoption * 1.05 + playerClosesLater * 0.55,
    ready_to_eat_focus:
      signals.lunchAdoption * 1.1 +
      signals.playerReadyToEatShare * 0.45 +
      signals.visiblePlayerServiceFailureRate * 0.08,
    beverage_discount:
      ((signals.breakfastAdoption + signals.nightAdoption + signals.smallPurchaseAdoption) / 3) * 0.75 +
      signals.playerTrafficShare * 0.25,
    magazine_focus:
      signals.smallPurchaseAdoption * 0.42 + signals.playerMagazineShare * 0.85,
    daily_goods_focus:
      signals.smallPurchaseAdoption * 0.48 + signals.playerDailyGoodsShare * 0.85,
  };
}

function isActionAvailable(
  store: StoreDefinition,
  actionId: CompetitorActionId,
  day: number,
  lastActionDay: ReadonlyMap<CompetitorActionId, number>,
): boolean {
  const previousDay = lastActionDay.get(actionId);
  if (previousDay !== undefined && day - previousDay < ACTION_COOLDOWN_DAYS) {
    return false;
  }

  switch (actionId) {
    case "open_earlier":
      return store.openingHour > 6;
    case "close_later":
      return store.closingHour < 24;
    case "ready_to_eat_focus":
      return (store.categoryArea.category_ready_to_eat ?? 0) < MAX_CATEGORY_AREA;
    case "beverage_discount":
      return store.priceIndex < 100;
    case "magazine_focus":
      return (store.categoryArea.category_magazines ?? 0) < MAX_CATEGORY_AREA;
    case "daily_goods_focus":
      return (store.categoryArea.category_daily_goods ?? 0) < MAX_CATEGORY_AREA;
  }
}

function applyAction(store: StoreDefinition, actionId: CompetitorActionId): boolean {
  switch (actionId) {
    case "open_earlier":
      store.openingHour = Math.max(6, store.openingHour - 1);
      return true;
    case "close_later":
      store.closingHour = Math.min(24, store.closingHour + 1);
      return true;
    case "ready_to_eat_focus":
      return shiftCategoryArea(store, "category_ready_to_eat");
    case "beverage_discount":
      store.priceIndex = Math.min(100, store.priceIndex + 5);
      return true;
    case "magazine_focus":
      return shiftCategoryArea(store, "category_magazines");
    case "daily_goods_focus":
      return shiftCategoryArea(store, "category_daily_goods");
  }
}

function reasonFor(actionId: CompetitorActionId): string {
  switch (actionId) {
    case "open_earlier":
      return "朝の地域需要と競合店頭の早朝化を観測した";
    case "close_later":
      return "夜間需要と競合店頭の営業時間延長を観測した";
    case "ready_to_eat_focus":
      return "昼食調達習慣と即食食品売場の拡大を観測した";
    case "beverage_discount":
      return "時間帯横断の飲料需要と価格競争を観測した";
    case "magazine_focus":
      return "少量即時購入と雑誌売場の動きを観測した";
    case "daily_goods_focus":
      return "少量即時購入と日用品売場の動きを観測した";
  }
}

export function createCompetitorAI(
  stores: readonly StoreDefinition[],
  rng: RandomFn,
): CompetitorAI {
  const observations: CompetitorPublicObservation[] = [];
  const actionHistory: CompetitorActionEvent[] = [];
  const lastActionDayByStore = new Map<string, Map<CompetitorActionId, number>>();
  let lastObservedDay = 0;

  for (const store of stores) {
    lastActionDayByStore.set(store.id, new Map());
  }

  return {
    observeDay(observation: CompetitorPublicObservation): CompetitorDecisionEvent[] {
      observations.push({
        ...observation,
        habitRegionalAdoptionByHabit: { ...observation.habitRegionalAdoptionByHabit },
        playerCategoryArea: { ...observation.playerCategoryArea },
      });
      while (observations.length > OBSERVATION_WINDOW_DAYS) {
        observations.shift();
      }
      lastObservedDay = observation.day;

      if (observation.day % DECISION_INTERVAL_DAYS !== 0 || observations.length < OBSERVATION_WINDOW_DAYS) {
        return [];
      }

      const decisions: CompetitorDecisionEvent[] = [];
      for (const store of stores) {
        const signals = perceive(observations, rng);
        const scores = scoreActions(store, signals);
        const cooldowns = lastActionDayByStore.get(store.id) ?? new Map<CompetitorActionId, number>();
        const candidates = COMPETITOR_ACTION_IDS
          .filter((actionId) => isActionAvailable(store, actionId, observation.day, cooldowns))
          .map((actionId) => ({ actionId, score: scores[actionId] * (0.9 + rng() * 0.2) }))
          .sort((a, b) => b.score - a.score);
        const top = candidates[0];

        if (!top || top.score < ACTION_THRESHOLD) {
          decisions.push({
            day: observation.day,
            storeId: store.id,
            considered: true,
            selectedAction: null,
            reason: "観測信号が行動基準に届かなかった",
            perceivedSignals: signals,
            action: null,
          });
          continue;
        }

        const responseProbability = Math.min(0.88, 0.62 + Math.max(0, top.score - ACTION_THRESHOLD) * 0.25);
        if (rng() > responseProbability) {
          decisions.push({
            day: observation.day,
            storeId: store.id,
            considered: true,
            selectedAction: null,
            reason: "有望な兆候は認識したが判断を見送った",
            perceivedSignals: signals,
            action: null,
          });
          continue;
        }

        const before = cloneStoreState(store);
        if (!applyAction(store, top.actionId)) {
          decisions.push({
            day: observation.day,
            storeId: store.id,
            considered: true,
            selectedAction: null,
            reason: "施策に必要な売場余地がなかった",
            perceivedSignals: signals,
            action: null,
          });
          continue;
        }

        cooldowns.set(top.actionId, observation.day);
        lastActionDayByStore.set(store.id, cooldowns);
        const action: CompetitorActionEvent = {
          day: observation.day,
          storeId: store.id,
          actionId: top.actionId,
          reason: reasonFor(top.actionId),
          perceivedSignals: signals,
          before,
          after: cloneStoreState(store),
        };
        actionHistory.push(action);
        decisions.push({
          day: observation.day,
          storeId: store.id,
          considered: true,
          selectedAction: top.actionId,
          reason: action.reason,
          perceivedSignals: signals,
          action,
        });
      }
      return decisions;
    },

    getSnapshot(): CompetitorAISnapshot {
      return {
        lastObservedDay,
        stores: Object.fromEntries(stores.map((store) => [store.id, cloneStoreState(store)])),
        actionHistory: actionHistory.map((action) => ({
          ...action,
          perceivedSignals: { ...action.perceivedSignals },
          before: { ...action.before, categoryArea: { ...action.before.categoryArea } },
          after: { ...action.after, categoryArea: { ...action.after.categoryArea } },
        })),
      };
    },
  };
}
