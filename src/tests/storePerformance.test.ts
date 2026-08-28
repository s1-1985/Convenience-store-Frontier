import { describe, expect, it } from "vitest";
import { createStoreOperationsEngine, type StoreDailyResult } from "../game/storeOperationsEngine.js";
import { computeRevenueTrend, summarizeStorePerformance } from "../game/storePerformance.js";

function dayResult(day: number, revenue: number): StoreDailyResult {
  return {
    day,
    enteredCustomers: 10,
    transactions: 8,
    revenue,
    stockoutEncounters: 0,
    queueAbandonments: 0,
    maximumQueueLength: 0,
    serviceTrust: 0.5,
    regularTransactions: 0,
  };
}

describe("store performance summary", () => {
  it("reports preparation rather than failure before opening", () => {
    const summary = summarizeStorePerformance(createStoreOperationsEngine(1977).getSnapshot());
    expect(summary.headline).toContain("準備中");
    expect(summary.grade).toBe("B");
  });

  it("identifies stockouts before secondary problems", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    snapshot.kpis.enteredCustomers = 20;
    snapshot.kpis.transactions = 12;
    snapshot.kpis.stockoutEncounters = 5;
    snapshot.kpis.queueAbandonments = 3;

    const summary = summarizeStorePerformance(snapshot);
    expect(summary.headline).toContain("欠品");
    expect(summary.nextAction).toContain("発注");
  });
});

describe("computeRevenueTrend", () => {
  it("reports insufficient data with fewer than six days of history", () => {
    const history = [dayResult(1, 1000), dayResult(2, 1000), dayResult(3, 1000)];
    expect(computeRevenueTrend(history)).toBe("insufficient_data");
  });

  it("detects an improving trend when recent revenue is clearly higher", () => {
    const history = [
      dayResult(1, 1000),
      dayResult(2, 1000),
      dayResult(3, 1000),
      dayResult(4, 1500),
      dayResult(5, 1500),
      dayResult(6, 1500),
    ];
    expect(computeRevenueTrend(history)).toBe("improving");
  });

  it("detects a declining trend when recent revenue is clearly lower", () => {
    const history = [
      dayResult(1, 1500),
      dayResult(2, 1500),
      dayResult(3, 1500),
      dayResult(4, 1000),
      dayResult(5, 1000),
      dayResult(6, 1000),
    ];
    expect(computeRevenueTrend(history)).toBe("declining");
  });

  it("treats small fluctuations as flat", () => {
    const history = [
      dayResult(1, 1000),
      dayResult(2, 1020),
      dayResult(3, 990),
      dayResult(4, 1010),
      dayResult(5, 1005),
      dayResult(6, 995),
    ];
    expect(computeRevenueTrend(history)).toBe("flat");
  });
});
