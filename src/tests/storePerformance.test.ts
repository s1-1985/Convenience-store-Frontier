import { describe, expect, it } from "vitest";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";
import { summarizeStorePerformance } from "../game/storePerformance.js";

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
