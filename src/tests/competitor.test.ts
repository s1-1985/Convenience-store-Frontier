import { describe, expect, it } from "vitest";
import {
  createCompetitorAI,
  type CompetitorPublicObservation,
} from "../simulation/competitor.js";
import { RandomStreams } from "../simulation/rng.js";
import type { StoreDefinition } from "../simulation/types.js";

function createStore(): StoreDefinition {
  return {
    id: "store_competitor_test",
    displayName: "競合テスト店",
    isPlayerControlled: false,
    openingHour: 8,
    closingHour: 20,
    categoryArea: {
      category_ready_to_eat: 10,
      category_beverages: 12,
      category_snacks: 12,
      category_processed_food: 12,
      category_daily_goods: 12,
      category_magazines: 12,
    },
    staffingByTimeBlock: {
      morning: 2,
      midday: 2,
      afternoon: 2,
      evening: 2,
    },
    priceIndex: 60,
    cleanliness: 65,
    reputation: 60,
    distanceScore: 70,
    initialCash: 3000000,
    orderingPolicy: "standard",
    deliveryPolicy: "once_daily",
  };
}

function observation(
  day: number,
  breakfastAdoption: number,
  lunchAdoption: number,
): CompetitorPublicObservation {
  return {
    day,
    habitRegionalAdoptionByHabit: {
      breakfast_purchase: breakfastAdoption,
      external_lunch: lunchAdoption,
      night_shopping: 0.05,
      small_immediate_purchase: 0.05,
    },
    playerVisits: 500,
    competitorVisits: 200,
    playerOpeningHour: 6,
    playerClosingHour: 20,
    playerCategoryArea: {
      category_ready_to_eat: 20,
      category_beverages: 10,
      category_snacks: 10,
      category_processed_food: 10,
      category_daily_goods: 10,
      category_magazines: 10,
    },
    visiblePlayerServiceFailureRate: 0.05,
  };
}

describe("CompetitorAI", () => {
  it("considers strategy only every three days and reacts to a growing morning market", () => {
    const store = createStore();
    const ai = createCompetitorAI([store], () => 0.1);

    expect(ai.observeDay(observation(1, 0.9, 0.1))).toEqual([]);
    expect(ai.observeDay(observation(2, 0.9, 0.1))).toEqual([]);
    const decisions = ai.observeDay(observation(3, 0.9, 0.1));

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.selectedAction).toBe("open_earlier");
    expect(store.openingHour).toBe(7);
  });

  it("strengthens ready-to-eat assortment after observing a strong lunch market", () => {
    const store = createStore();
    store.openingHour = 6;
    const before = store.categoryArea.category_ready_to_eat ?? 0;
    const ai = createCompetitorAI([store], () => 0.1);

    ai.observeDay(observation(1, 0.05, 0.95));
    ai.observeDay(observation(2, 0.05, 0.95));
    const decisions = ai.observeDay(observation(3, 0.05, 0.95));

    expect(decisions[0]?.selectedAction).toBe("ready_to_eat_focus");
    expect(store.categoryArea.category_ready_to_eat).toBeGreaterThan(before);
    expect(Object.values(store.categoryArea).reduce((sum, area) => sum + area, 0)).toBe(70);
  });

  it("can recognize a signal but postpone action instead of always responding correctly", () => {
    const store = createStore();
    const ai = createCompetitorAI([store], () => 0.99);

    ai.observeDay(observation(1, 0.9, 0.1));
    ai.observeDay(observation(2, 0.9, 0.1));
    const decisions = ai.observeDay(observation(3, 0.9, 0.1));

    expect(decisions[0]?.considered).toBe(true);
    expect(decisions[0]?.selectedAction).toBeNull();
    expect(store.openingHour).toBe(8);
  });

  it("reproduces the same perceptions and actions with the same seed", () => {
    const storeA = createStore();
    const storeB = createStore();
    const aiA = createCompetitorAI([storeA], new RandomStreams(2026).stream("competitor"));
    const aiB = createCompetitorAI([storeB], new RandomStreams(2026).stream("competitor"));

    for (let day = 1; day <= 12; day += 1) {
      const input = observation(day, Math.min(1, day / 10), Math.min(1, day / 12));
      expect(aiA.observeDay(input)).toEqual(aiB.observeDay(input));
    }

    expect(aiA.getSnapshot()).toEqual(aiB.getSnapshot());
  });
});
