import { describe, expect, it } from "vitest";
import { createHabitSystem } from "../simulation/habits.js";
import type { CohortDefinition } from "../simulation/types.js";

const cohort: CohortDefinition = {
  id: "workers",
  displayName: "Workers",
  population: 1000,
  activityRateByTimeBlock: {
    morning: 0.25,
    midday: 0.25,
    afternoon: 0.2,
    evening: 0.25,
  },
  categoryPreference: { food: 1 },
  choiceWeights: {
    hours: 0.15,
    assortment: 0.2,
    price: 0.1,
    cleanliness: 0.1,
    reputation: 0.15,
    distance: 0.3,
  },
};

describe("HabitSystem", () => {
  it("forms a regional habit from repeated successful use and caps history at 14 days", () => {
    const habits = createHabitSystem([cohort]);

    for (let day = 1; day <= 20; day += 1) {
      habits.recordSlot("workers", "morning", {
        potentialDemand: 100,
        playerVisits: 45,
        playerSuccessfulVisits: 40,
        competitorSuccessfulVisits: 40,
        divertedToCompetitor: 0,
      });
      habits.closeDay(day);
    }

    const metric = habits.getSnapshot().byCohort.workers?.breakfast_purchase;
    expect(metric).toBeDefined();
    expect(metric?.state).toBe("regional_established");
    expect(metric?.regionalAdoption ?? 0).toBeGreaterThan(0.7);
    expect(metric?.recentPotentialDemand).toBe(1400);
    expect(habits.getDemandMultiplier("workers", "morning")).toBeGreaterThan(1);
  });

  it("benefits both the contributing store and competitors while diverting failed habitual visits", () => {
    const habits = createHabitSystem([cohort]);

    for (let day = 1; day <= 10; day += 1) {
      habits.recordSlot("workers", "midday", {
        potentialDemand: 100,
        playerVisits: 60,
        playerSuccessfulVisits: 45,
        competitorSuccessfulVisits: 30,
        divertedToCompetitor: 0,
      });
      habits.closeDay(day);
    }

    const playerBonus = habits.getStoreChoiceBonus(
      "workers",
      "midday",
      "player",
      "player",
      ["competitor"],
    );
    const competitorBonus = habits.getStoreChoiceBonus(
      "workers",
      "midday",
      "competitor",
      "player",
      ["competitor"],
    );

    expect(playerBonus).toBeGreaterThan(0);
    expect(competitorBonus).toBeGreaterThan(0);
    expect(habits.computeDiversionToCompetitor("workers", "midday", 20)).toBeGreaterThan(0);
  });
});
