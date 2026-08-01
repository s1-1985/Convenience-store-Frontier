import { describe, expect, it } from "vitest";
import type { CompetitiveDailyReport } from "../simulation/competitiveSimulation.js";
import { buildDashboardAlerts, formatClock, shouldAutoStop } from "../ui/presentation.js";

function report(overrides: Partial<CompetitiveDailyReport> = {}): CompetitiveDailyReport {
  return {
    day: 1,
    weather: "clear",
    revenue: 100_000,
    cogs: 50_000,
    laborCost: 10_000,
    utilitiesCost: 2_000,
    wasteCost: 1_000,
    deliveryCost: 500,
    profit: 36_500,
    cashEnd: 3_036_500,
    visitsByStore: { store_player: 100 },
    salesUnitsByCategory: {},
    salesUnitsByProduct: {},
    stockoutUnitsByProduct: {},
    wasteUnitsByProduct: {},
    operationWorkloadByTask: {
      register: 0,
      replenishment: 0,
      cleaning: 0,
      delivery_receiving: 0,
      admin: 0,
    },
    operationProcessedByTask: {
      register: 0,
      replenishment: 0,
      cleaning: 0,
      delivery_receiving: 0,
      admin: 0,
    },
    operationBacklogByTask: {
      register: 0,
      replenishment: 0,
      cleaning: 0,
      delivery_receiving: 0,
      admin: 0,
    },
    queueCustomersEnd: 0,
    abandonedCustomers: 0,
    operationalShelfStockoutUnits: 0,
    backroomInventoryUnitsEnd: 100,
    nightOperationWorkload: 0,
    habitStatesByCohort: {},
    habitRegionalAdoptionByHabit: {
      breakfast_purchase: 0,
      external_lunch: 0,
      night_shopping: 0,
      small_immediate_purchase: 0,
    },
    habitPlayerContributionByHabit: {
      breakfast_purchase: 0,
      external_lunch: 0,
      night_shopping: 0,
      small_immediate_purchase: 0,
    },
    habitDailyPotentialDemandByHabit: {
      breakfast_purchase: 0,
      external_lunch: 0,
      night_shopping: 0,
      small_immediate_purchase: 0,
    },
    habitDailyPlayerSuccessfulVisitsByHabit: {
      breakfast_purchase: 0,
      external_lunch: 0,
      night_shopping: 0,
      small_immediate_purchase: 0,
    },
    habitDailyCompetitorSuccessfulVisitsByHabit: {
      breakfast_purchase: 0,
      external_lunch: 0,
      night_shopping: 0,
      small_immediate_purchase: 0,
    },
    habitualDiversionsToCompetitor: 0,
    competitorObservation: {
      day: 1,
      habitRegionalAdoptionByHabit: {
        breakfast_purchase: 0,
        external_lunch: 0,
        night_shopping: 0,
        small_immediate_purchase: 0,
      },
      playerVisits: 100,
      competitorVisits: 100,
      playerOpeningHour: 8,
      playerClosingHour: 20,
      playerCategoryArea: {},
      visiblePlayerServiceFailureRate: 0,
    },
    competitorDecisions: [],
    ...overrides,
  };
}

describe("basic UI presentation", () => {
  it("converts a 15-minute slot into the displayed clock", () => {
    expect(formatClock(3, 6)).toEqual({ dayLabel: "3日目", timeLabel: "07:30" });
  });

  it("auto-stops when serious queue abandonment is detected", () => {
    const alerts = buildDashboardAlerts(report({ abandonedCustomers: 12 }));
    expect(alerts.some((alert) => alert.id === "queue-critical")).toBe(true);
    expect(shouldAutoStop(alerts)).toBe(true);
  });

  it("separates inventory stockouts from shelf replenishment delays", () => {
    const alerts = buildDashboardAlerts(
      report({
        stockoutUnitsByProduct: { bento: 12 },
        operationalShelfStockoutUnits: 8,
      }),
    );
    expect(alerts.some((alert) => alert.id === "inventory-warning")).toBe(true);
    expect(alerts.some((alert) => alert.id === "shelf-warning")).toBe(true);
  });

  it("shows a stable notice when no operational problem is present", () => {
    expect(buildDashboardAlerts(report())).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "stable" })]),
    );
  });
});
