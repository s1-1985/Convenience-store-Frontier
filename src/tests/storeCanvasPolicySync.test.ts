import { describe, expect, it } from "vitest";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";
import {
  categoryAreaFromShelfCapacity,
  taskPrioritiesFromStaffAssignments,
} from "../game/storeCanvasPolicySync.js";
import { DEFAULT_OPERATION_PRIORITIES, validateOperationPriorities } from "../simulation/operations.js";
import type { CategoryDefinition } from "../simulation/types.js";

describe("taskPrioritiesFromStaffAssignments", () => {
  it("orders register/replenishment/cleaning by descending headcount, in their existing slots", () => {
    // DEFAULT_OPERATION_PRIORITIES is register, replenishment, delivery_receiving,
    // cleaning, admin — cleaning most-staffed should move ahead of the other two
    // managed tasks while delivery_receiving/admin stay at index 2 and 4.
    const result = taskPrioritiesFromStaffAssignments(
      { register: 1, replenishment: 1, cleaning: 3 },
      DEFAULT_OPERATION_PRIORITIES,
    );
    expect(result).toEqual(["cleaning", "register", "delivery_receiving", "replenishment", "admin"]);
  });

  it("keeps the existing relative order of tied tasks", () => {
    const result = taskPrioritiesFromStaffAssignments(
      { register: 2, replenishment: 2, cleaning: 0 },
      DEFAULT_OPERATION_PRIORITIES,
    );
    // register already precedes replenishment in DEFAULT_OPERATION_PRIORITIES, so a tie
    // must not swap them.
    expect(result).toEqual(["register", "replenishment", "delivery_receiving", "cleaning", "admin"]);
  });

  it("never moves delivery_receiving/admin out of their starting slots", () => {
    const priorities = ["admin", "register", "delivery_receiving", "cleaning", "replenishment"] as const;
    const result = taskPrioritiesFromStaffAssignments({ register: 0, replenishment: 5, cleaning: 1 }, priorities);
    expect(result[0]).toBe("admin");
    expect(result[2]).toBe("delivery_receiving");
  });

  it("always returns a valid permutation of all 5 tasks", () => {
    for (const assignments of [
      { register: 0, replenishment: 0, cleaning: 0 },
      { register: 4, replenishment: 0, cleaning: 0 },
      { register: 1, replenishment: 2, cleaning: 3 },
    ]) {
      expect(() => validateOperationPriorities(taskPrioritiesFromStaffAssignments(assignments, DEFAULT_OPERATION_PRIORITIES))).not.toThrow();
    }
  });
});

const CATEGORIES: CategoryDefinition[] = [
  { id: "category_ready_to_eat", displayName: "即食食品" },
  { id: "category_beverages", displayName: "飲料" },
  { id: "category_snacks", displayName: "菓子" },
  { id: "category_processed_food", displayName: "加工食品" },
  { id: "category_daily_goods", displayName: "日用品" },
  { id: "category_magazines", displayName: "雑誌・新聞" },
  { id: "category_frozen_food", displayName: "冷凍食品" },
  { id: "category_hot_snack", displayName: "ホットスナック" },
];

describe("categoryAreaFromShelfCapacity", () => {
  it("always sums to exactly totalShelfAreaPoints", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const result = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(70);
  });

  it("gives more area to a category whose Canvas shelfCapacity grows", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const before = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);

    snapshot.inventories.drinks.shelfCapacity *= 3;
    const after = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);

    expect(after.category_beverages).toBeGreaterThan(before.category_beverages!);
  });

  it("folds dessert's shelfCapacity into category_snacks's weight", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const before = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);

    snapshot.inventories.dessert.shelfCapacity *= 5;
    const after = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);

    expect(after.category_snacks).toBeGreaterThan(before.category_snacks!);
  });

  it("falls back to an even split without throwing when every shelfCapacity is zero", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    for (const inventory of Object.values(snapshot.inventories)) inventory.shelfCapacity = 0;

    const result = categoryAreaFromShelfCapacity(snapshot.inventories, CATEGORIES, 70);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(70);
    expect(result.category_ready_to_eat).toBeCloseTo(70 / CATEGORIES.length, 2);
  });
});
