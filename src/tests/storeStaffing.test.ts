import { describe, expect, it } from "vitest";
import { assignmentsForPreset, recommendStaffing } from "../game/storeStaffing.js";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";

describe("store staffing shortcuts", () => {
  it("always assigns every available member", () => {
    for (const preset of ["balanced", "register", "replenishment", "cleaning"] as const) {
      const assignments = assignmentsForPreset(preset, 4);
      expect(Object.values(assignments).reduce((sum, count) => sum + count, 0)).toBe(4);
    }
  });

  it("recommends register coverage before less urgent work when a queue is visible", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    snapshot.staff = snapshot.staff.length > 0 ? snapshot.staff : [
      { id: "staff-1", x: 0, y: 0, task: "register", state: "idle", path: [], carryUnits: 0, workRemainingSeconds: 0, variant: 0 },
      { id: "staff-2", x: 0, y: 0, task: "cleaning", state: "idle", path: [], carryUnits: 0, workRemainingSeconds: 0, variant: 1 },
    ];
    snapshot.queueCustomerIds = ["a", "b", "c", "d"];
    snapshot.litter = [{ id: "litter", x: 1, y: 1 }, { id: "litter-2", x: 2, y: 2 }];

    const recommendation = recommendStaffing(snapshot);
    expect(recommendation.preset).toBe("register");
    expect(recommendation.assignments.register).toBeGreaterThan(recommendation.assignments.cleaning);
  });
});
