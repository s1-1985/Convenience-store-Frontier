import { describe, expect, it } from "vitest";
import {
  assessPlaytestSession,
  changedPolicyDimensions,
  createPlaytestSession,
  finishPlaytestSession,
  markPlaytestReportInteraction,
  recordPlaytestPolicyDecision,
  recordPlaytestVisualDetection,
  summarizePlaytestSessions,
  type PlaytestPolicySnapshot,
  type PlaytestSession,
} from "../playtest/session.js";

const initialPolicy: PlaytestPolicySnapshot = {
  openingHour: 8,
  closingHour: 20,
  orderingPolicy: "standard",
  deliveryPolicy: "once_daily",
  staffing: { morning: 2, midday: 2, afternoon: 2, evening: 1 },
  taskPriorities: ["register", "replenishment", "delivery_receiving", "cleaning", "admin"],
  categoryArea: {
    category_ready_to_eat: 15,
    category_beverages: 12,
    category_snacks: 10,
    category_processed_food: 11,
    category_daily_goods: 12,
    category_magazines: 10,
  },
};

function create(nowEpochMs = 1_000_000): PlaytestSession {
  return createPlaytestSession({
    seed: 1977,
    scenarioName: "test scenario",
    initialPolicy,
    nowEpochMs,
    sessionId: `session-${nowEpochMs}`,
  });
}

function policy(overrides: Partial<PlaytestPolicySnapshot>): PlaytestPolicySnapshot {
  return {
    ...initialPolicy,
    staffing: { ...initialPolicy.staffing },
    taskPriorities: [...initialPolicy.taskPriorities],
    categoryArea: { ...initialPolicy.categoryArea },
    ...overrides,
  };
}

describe("playtest session", () => {
  it("実際に変わった方針だけを重要判断として記録する", () => {
    const start = create();
    const unchanged = recordPlaytestPolicyDecision(start, policy({}), {
      day: 1,
      timeLabel: "08:00",
      nowEpochMs: 1_100_000,
    });
    const changed = recordPlaytestPolicyDecision(
      unchanged,
      policy({ openingHour: 7, closingHour: 23 }),
      { day: 1, timeLabel: "08:15", nowEpochMs: 1_200_000 },
    );

    expect(unchanged.policyDecisions).toHaveLength(0);
    expect(changed.policyDecisions).toHaveLength(1);
    expect(changed.policyDecisions[0]?.changedDimensions).toEqual(["opening_hours"]);
  });

  it("複数項目を一度に変えた場合も一回の判断として記録する", () => {
    const changed = recordPlaytestPolicyDecision(
      create(),
      policy({
        openingHour: 7,
        closingHour: 23,
        orderingPolicy: "stockout_prevention",
        staffing: { ...initialPolicy.staffing, midday: 4 },
      }),
      { day: 2, timeLabel: "10:00", nowEpochMs: 1_300_000 },
    );

    expect(changed.policyDecisions).toHaveLength(1);
    expect(changed.policyDecisions[0]?.changedDimensions).toEqual([
      "opening_hours",
      "ordering_policy",
      "staffing",
    ]);
  });

  it("同一問題の気づきを重複計上せず、レポート閲覧前後を区別する", () => {
    let session = create();
    session = recordPlaytestVisualDetection(session, "queue", {
      day: 1,
      timeLabel: "12:00",
      nowEpochMs: 1_100_000,
    });
    session = recordPlaytestVisualDetection(session, "queue", {
      day: 2,
      timeLabel: "12:00",
      nowEpochMs: 1_200_000,
    });
    session = markPlaytestReportInteraction(session, 2, 1_250_000);
    session = recordPlaytestVisualDetection(session, "empty_shelf", {
      day: 2,
      timeLabel: "12:15",
      nowEpochMs: 1_300_000,
    });

    expect(session.visualDetections).toHaveLength(2);
    expect(session.visualDetections[0]?.beforeReportInteraction).toBe(true);
    expect(session.visualDetections[1]?.beforeReportInteraction).toBe(false);
  });

  it("30日完走、45〜70分、判断6回、視覚発見率60％を判定する", () => {
    let session = create(0);
    const dimensions = [
      policy({ openingHour: 7, closingHour: 20 }),
      policy({ openingHour: 7, closingHour: 22 }),
      policy({ openingHour: 7, closingHour: 22, orderingPolicy: "sell_through" }),
      policy({ openingHour: 7, closingHour: 22, orderingPolicy: "stockout_prevention" }),
      policy({ openingHour: 7, closingHour: 22, deliveryPolicy: "ready_to_eat_twice_daily" }),
      policy({
        openingHour: 7,
        closingHour: 22,
        deliveryPolicy: "ready_to_eat_twice_daily",
        staffing: { ...initialPolicy.staffing, evening: 2 },
      }),
    ];
    dimensions.forEach((next, index) => {
      session = recordPlaytestPolicyDecision(session, next, {
        day: index + 1,
        timeLabel: "09:00",
        nowEpochMs: (index + 1) * 60_000,
      });
    });
    for (const [index, issueId] of ["queue", "empty_shelf", "closed_demand"] as const.entries()) {
      session = recordPlaytestVisualDetection(session, issueId, {
        day: index + 1,
        timeLabel: "12:00",
        nowEpochMs: (index + 10) * 60_000,
      });
    }
    session = finishPlaytestSession(session, "completed", 55 * 60_000);

    const assessment = assessPlaytestSession(session);
    expect(assessment.completedThirtyDays).toBe(true);
    expect(assessment.durationMinutes).toBe(55);
    expect(assessment.durationInTargetRange).toBe(true);
    expect(assessment.meaningfulDecisionCount).toBe(6);
    expect(assessment.visualDiscoveryRate).toBe(1);
    expect(assessment.passesSessionTargets).toBe(true);
  });

  it("5セッション以上かつ60％以上のテスターで視覚発見条件を満たすと集計根拠が揃う", () => {
    const sessions = Array.from({ length: 5 }, (_, index) => {
      let session = create(index * 10_000);
      const detections = index < 3 ? ["queue", "empty_shelf", "closed_demand"] : ["queue"];
      for (const issueId of detections as Array<"queue" | "empty_shelf" | "closed_demand">) {
        session = recordPlaytestVisualDetection(session, issueId, {
          day: 1,
          timeLabel: "10:00",
          nowEpochMs: index * 10_000 + 1_000,
        });
      }
      return finishPlaytestSession(session, "completed", index * 10_000 + 50 * 60_000);
    });

    const summary = summarizePlaytestSessions(sessions);
    expect(summary.sampleReady).toBe(true);
    expect(summary.visualTesterPassRate).toBe(0.6);
    expect(summary.visualTesterThresholdMet).toBe(true);
    expect(summary.acceptanceEvidenceReady).toBe(true);
  });

  it("方針差分はレコードのキー順に影響されない", () => {
    const left = policy({ staffing: { morning: 2, midday: 2, afternoon: 2, evening: 1 } });
    const right = policy({ staffing: { evening: 1, afternoon: 2, midday: 2, morning: 2 } });
    expect(changedPolicyDimensions(left, right)).toEqual([]);
  });
});
