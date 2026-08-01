import { describe, expect, it } from "vitest";
import { createSimulation } from "../simulation/simulation.js";
import type { ScenarioBundle } from "../simulation/types.js";

function createHabitScenario(population = 600, initialStock = 3000): ScenarioBundle {
  return {
    scenario: {
      dataVersion: "test",
      id: "habit-test",
      displayName: "Habit Test",
      totalDays: 30,
    },
    district: {
      id: "district",
      displayName: "District",
      weekdayFactor: 1,
      weekendFactor: 1,
      rainProbability: 0,
      rainDemandMultiplier: 1,
    },
    playerStore: {
      id: "player",
      displayName: "Player",
      isPlayerControlled: true,
      openingHour: 6,
      closingHour: 24,
      categoryArea: { food: 10 },
      staffingByTimeBlock: { morning: 2, midday: 2, afternoon: 2, evening: 2 },
      priceIndex: 70,
      cleanliness: 80,
      reputation: 70,
      distanceScore: 80,
      initialCash: 1_000_000,
      orderingPolicy: "stockout_prevention",
      deliveryPolicy: "once_daily",
    },
    competitorStores: [
      {
        id: "competitor",
        displayName: "Competitor",
        isPlayerControlled: false,
        openingHour: 6,
        closingHour: 24,
        categoryArea: { food: 10 },
        staffingByTimeBlock: { morning: 2, midday: 2, afternoon: 2, evening: 2 },
        priceIndex: 65,
        cleanliness: 70,
        reputation: 65,
        distanceScore: 75,
        initialCash: 1_000_000,
        orderingPolicy: "standard",
        deliveryPolicy: "once_daily",
      },
    ],
    cohorts: [
      {
        id: "workers",
        displayName: "Workers",
        population,
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
      },
    ],
    categories: [{ id: "food", displayName: "Food" }],
    products: [
      {
        id: "meal",
        categoryId: "food",
        displayName: "Meal",
        retailPrice: 200,
        cost: 100,
        shelfLifeSlots: 10_000,
        packageUnits: 20,
        targetWeight: 1,
        initialStock,
      },
    ],
    timeBlocks: [
      { id: "morning", startHour: 6, endHour: 10 },
      { id: "midday", startHour: 10, endHour: 14 },
      { id: "afternoon", startHour: 14, endHour: 18 },
      { id: "evening", startHour: 18, endHour: 24 },
    ],
    economy: {
      wagePerStaffPerSlot: 100,
      utilitiesPerSlotOpen: 10,
      otherOptionUtility: 0.2,
      choiceSharpness: 5,
      totalShelfAreaPoints: 10,
      demandNoiseRange: 0,
      safetyStockRatio: 0.05,
      deliveryCostPerEvent: 100,
    },
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("Milestone 4 habit integration", () => {
  it("grows repeated demand and also expands competitor traffic", () => {
    const simulation = createSimulation(createHabitScenario(), 123);
    simulation.runToEnd();
    const reports = simulation.getAllDailyReports();

    const day1Adoption = reports[0]?.habitRegionalAdoptionByHabit.breakfast_purchase ?? 0;
    const day14Adoption = reports[13]?.habitRegionalAdoptionByHabit.breakfast_purchase ?? 0;
    const firstWeekCompetitor = average(
      reports.slice(0, 7).map((report) => report.visitsByStore.competitor ?? 0),
    );
    const lastWeekCompetitor = average(
      reports.slice(-7).map((report) => report.visitsByStore.competitor ?? 0),
    );

    expect(day14Adoption).toBeGreaterThan(day1Adoption);
    expect(lastWeekCompetitor).toBeGreaterThan(firstWeekCompetitor);
  });

  it("diverts habituated customers to the competitor when the player cannot serve them", () => {
    const scenario = createHabitScenario(6000, 100);
    scenario.playerStore.staffingByTimeBlock = {
      morning: 1,
      midday: 1,
      afternoon: 1,
      evening: 1,
    };
    const simulation = createSimulation(scenario, 123);
    simulation.applyPolicy({
      type: "set_task_priorities",
      priorities: ["cleaning", "admin", "delivery_receiving", "replenishment", "register"],
    });
    simulation.runToEnd();

    const diversions = simulation
      .getAllDailyReports()
      .reduce((sum, report) => sum + report.habitualDiversionsToCompetitor, 0);
    expect(diversions).toBeGreaterThan(0);
  });

  it("remains deterministic for the same seed and policies", () => {
    const first = createSimulation(createHabitScenario(), 987);
    first.runToEnd();
    const second = createSimulation(createHabitScenario(), 987);
    second.runToEnd();

    expect(first.getAllDailyReports()).toEqual(second.getAllDailyReports());
  });
});
