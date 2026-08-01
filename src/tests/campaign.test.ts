import { describe, expect, it } from "vitest";
import {
  createCampaignController,
  type CampaignObservation,
  type CampaignPolicyObservation,
} from "../campaign/campaign.js";

const DEFAULT_POLICY: CampaignPolicyObservation = {
  openingHour: 8,
  closingHour: 20,
  orderingPolicy: "standard",
  deliveryPolicy: "once_daily",
  morningStaff: 1,
  middayStaff: 1,
  eveningStaff: 1,
  registerPriority: 3,
  readyToEatArea: 15,
};

function observation(
  completedDay: number,
  overrides: Partial<CampaignObservation> = {},
): CampaignObservation {
  return {
    currentDay: Math.min(30, completedDay + 1),
    completedDay,
    operatingCash: 500_000,
    latestProfit: 10_000,
    playerVisits: 300,
    abandonedCustomers: 0,
    stockoutUnits: 0,
    shelfStockoutUnits: 0,
    wasteCost: 100,
    workBacklog: 1,
    maxRegionalAdoption: completedDay / 30,
    maxPlayerContribution: 0.6,
    competitorActionCount: completedDay >= 20 ? 1 : 0,
    policy: { ...DEFAULT_POLICY },
    ...overrides,
  };
}

function runStrongCampaign() {
  const controller = createCampaignController();
  controller.observe(observation(0));
  for (let day = 1; day <= 30; day += 1) {
    const policy: CampaignPolicyObservation = {
      ...DEFAULT_POLICY,
      openingHour: day >= 1 ? 7 : 8,
      orderingPolicy: day >= 2 ? "stockout_prevention" : "standard",
      middayStaff: day >= 3 ? 2 : 1,
      registerPriority: day >= 3 ? 1 : 3,
      deliveryPolicy: day >= 4 ? "ready_to_eat_twice_daily" : "once_daily",
      closingHour: day >= 5 ? 21 : 20,
      readyToEatArea: day >= 21 ? 20 : 15,
    };
    controller.observe(observation(day, { policy }));
  }
  return controller.getSnapshot();
}

describe("30-day campaign", () => {
  it("delivers scheduled events once as days complete", () => {
    const controller = createCampaignController();

    const opening = controller.observe(observation(0));
    expect(opening.newEvents.some((event) => event.id === "campaign-opening")).toBe(true);

    const firstDay = controller.observe(observation(1));
    expect(firstDay.newEvents.some((event) => event.id === "day-1-morning-gap")).toBe(true);

    const duplicate = controller.observe(observation(1));
    expect(duplicate.newEvents).toHaveLength(0);
  });

  it("does not complete objectives before their unlock day", () => {
    const controller = createCampaignController();
    controller.observe(
      observation(1, {
        maxRegionalAdoption: 1,
        maxPlayerContribution: 1,
        competitorActionCount: 4,
        policy: {
          ...DEFAULT_POLICY,
          openingHour: 7,
          closingHour: 22,
          orderingPolicy: "stockout_prevention",
          deliveryPolicy: "all_categories_twice_daily",
          middayStaff: 4,
          registerPriority: 1,
          readyToEatArea: 25,
        },
      }),
    );

    const snapshot = controller.getSnapshot();
    expect(snapshot.objectives.find((item) => item.id === "morning_strategy")?.status).toBe(
      "completed",
    );
    expect(snapshot.objectives.find((item) => item.id === "delivery_strategy")?.status).toBe(
      "locked",
    );
    expect(snapshot.objectives.find((item) => item.id === "regional_habit")?.status).toBe(
      "locked",
    );
    expect(snapshot.objectives.find((item) => item.id === "competitive_response")?.status).toBe(
      "locked",
    );
  });

  it("recognizes different solutions for the same objective", () => {
    const earlyController = createCampaignController();
    earlyController.observe(
      observation(1, {
        policy: { ...DEFAULT_POLICY, openingHour: 7 },
      }),
    );
    const early = earlyController
      .getSnapshot()
      .objectives.find((objective) => objective.id === "morning_strategy");
    expect(early?.status).toBe("completed");
    expect(early?.solution).toContain("朝需要");

    const lowCostController = createCampaignController();
    lowCostController.observe(
      observation(5, {
        latestProfit: 15_000,
        policy: { ...DEFAULT_POLICY, openingHour: 8, closingHour: 20 },
      }),
    );
    const lowCost = lowCostController
      .getSnapshot()
      .objectives.find((objective) => objective.id === "morning_strategy");
    expect(lowCost?.status).toBe("completed");
    expect(lowCost?.solution).toContain("低コスト");
  });

  it("offers one emergency loan and separates operating cash from available funds", () => {
    const controller = createCampaignController();
    controller.observe(observation(3, { operatingCash: 100_000 }));

    expect(
      controller
        .getSnapshot()
        .pendingEvents.some((event) => event.actionId === "accept_emergency_loan"),
    ).toBe(true);

    controller.acceptEmergencyLoan(4);
    const snapshot = controller.getSnapshot();
    expect(snapshot.operatingCash).toBe(100_000);
    expect(snapshot.effectiveCash).toBe(400_000);
    expect(snapshot.debtOutstanding).toBe(330_000);

    controller.acceptEmergencyLoan(5);
    expect(controller.getSnapshot().loan?.acceptedDay).toBe(4);
  });

  it("produces a deterministic 100-point final evaluation and company history", () => {
    const first = runStrongCampaign();
    const second = runStrongCampaign();

    expect(first.evaluation).toEqual(second.evaluation);
    expect(first.companyHistory).toEqual(second.companyHistory);
    expect(first.evaluation).not.toBeNull();
    expect(first.evaluation?.dimensions.reduce((sum, item) => sum + item.maxScore, 0)).toBe(100);
    expect(first.evaluation?.totalScore).toBeLessThanOrEqual(100);
    expect(first.companyHistory.some((entry) => entry.day === 30)).toBe(true);
    expect(first.objectives.every((objective) => objective.status === "completed")).toBe(true);
  });

  it("contains at least six important decision checkpoints", () => {
    const snapshot = runStrongCampaign();
    const important = snapshot.events.filter(
      (event) => event.priority === "important" || event.priority === "critical",
    );
    expect(important.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.events.some((event) => event.id === "day-15-second-delivery")).toBe(true);
    expect(snapshot.events.some((event) => event.id === "day-29-exception-demand")).toBe(true);
    expect(snapshot.events.some((event) => event.id === "campaign-final-evaluation")).toBe(true);
  });

  it("resets campaign history when the game returns to day one", () => {
    const controller = createCampaignController();
    controller.observe(observation(5));
    const resetUpdate = controller.observe(observation(0));

    expect(resetUpdate.reset).toBe(true);
    expect(controller.getSnapshot().dayRecords).toHaveLength(0);
    expect(controller.getSnapshot().events.map((event) => event.id)).toEqual(["campaign-opening"]);
  });
});
