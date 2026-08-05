import { describe, expect, it } from "vitest";
import { buildStoreObjectives, priorityStoreObjectives } from "../game/storeObjectives.js";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";

describe("live store objectives", () => {
  it("starts with readable goals without reporting success before customers arrive", () => {
    const objectives = buildStoreObjectives(createStoreOperationsEngine(1977).getSnapshot());

    expect(objectives.map((objective) => objective.id)).toEqual([
      "sales",
      "queue",
      "stockout",
      "price",
      "cleanliness",
      "regulars",
    ]);
    expect(objectives.every((objective) => objective.status === "active")).toBe(true);
  });

  it("puts visible operating problems before completed goals", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    snapshot.kpis.enteredCustomers = 20;
    snapshot.kpis.transactions = 12;
    snapshot.kpis.stockoutEncounters = 4;
    snapshot.kpis.queueAbandonments = 1;
    snapshot.queueCustomerIds = ["a", "b", "c", "d"];

    const objectives = priorityStoreObjectives(snapshot);
    expect(objectives.slice(0, 2).map((objective) => objective.id)).toEqual(["queue", "stockout"]);
    expect(objectives[0]?.advice).toContain("レジ担当");
    expect(objectives[1]?.advice).toContain("補充担当");
  });

  it("turns repeated price refusals into an actionable objective", () => {
    const snapshot = createStoreOperationsEngine(12).getSnapshot();
    snapshot.kpis.priceRefusals = 5;
    expect(buildStoreObjectives(snapshot)).toContainEqual(expect.objectContaining({
      id: "price",
      status: "at_risk",
    }));
  });
});
