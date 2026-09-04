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

  it("points a queue alert's cause chain at the register backlog when one exists", () => {
    const alerts = buildDashboardAlerts(
      report({
        abandonedCustomers: 12,
        operationBacklogByTask: {
          register: 30,
          replenishment: 0,
          cleaning: 0,
          delivery_receiving: 0,
          admin: 0,
        },
      }),
    );
    const queueAlert = alerts.find((alert) => alert.id === "queue-critical");
    expect(queueAlert?.causeChain).toEqual(["レジ業務の未処理が蓄積している(30点)"]);
  });

  it("distinguishes an empty backroom from a replenishment lag in the inventory alert's cause chain", () => {
    const emptyBackroom = buildDashboardAlerts(
      report({ stockoutUnitsByProduct: { bento: 50 }, backroomInventoryUnitsEnd: 5 }),
    );
    expect(
      emptyBackroom.find((alert) => alert.id === "inventory-critical")?.causeChain,
    ).toEqual(["バックヤード在庫自体が不足している(残り5点)"]);

    const stockedBackroom = buildDashboardAlerts(
      report({ stockoutUnitsByProduct: { bento: 50 }, backroomInventoryUnitsEnd: 500 }),
    );
    expect(
      stockedBackroom.find((alert) => alert.id === "inventory-critical")?.causeChain,
    ).toEqual(["バックヤードには在庫があるが棚への補充が追いついていない(残り500点)"]);
  });

  it("names the single most-backlogged task in the aggregate backlog alert's cause chain", () => {
    const alerts = buildDashboardAlerts(
      report({
        operationBacklogByTask: {
          register: 3,
          replenishment: 25,
          cleaning: 0,
          delivery_receiving: 0,
          admin: 0,
        },
      }),
    );
    expect(alerts.find((alert) => alert.id === "backlog-warning")?.causeChain).toEqual([
      "補充の未処理が最も大きい(25点)",
    ]);
  });
});
