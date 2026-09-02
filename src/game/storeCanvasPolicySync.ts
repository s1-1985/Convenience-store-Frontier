import type { OperationTaskId } from "../simulation/operations.js";
import type { CategoryDefinition } from "../simulation/types.js";
import type { ShelfInventoryState, StoreCategoryId, StoreStaffAssignments, StoreStaffTask } from "./storeOperationsEngine.js";

// data/cohorts/customer_cohorts.json category ids -> StoreCategoryId. "dessert" has no
// scenario-side counterpart yet, so it is carved out of the snacks share instead of left
// at zero (see categoryWeightsForCohort() in src/ui/storeGameRuntime.ts) — and folded
// back into snacks's weight in the reverse direction (categoryAreaFromShelfCapacity()
// below). This mapping is an approximation between two independently-tuned category
// taxonomies; revisit if either taxonomy changes.
export const SIM_CATEGORY_TO_STORE_CATEGORY: Record<string, StoreCategoryId> = {
  category_ready_to_eat: "ready_meal",
  category_beverages: "drinks",
  category_snacks: "snacks",
  category_processed_food: "instant",
  category_daily_goods: "daily_goods",
  category_magazines: "magazines",
  category_frozen_food: "frozen",
  category_hot_snack: "hot",
};

// ADR-0005: converts the Canvas staff panel's per-task headcount (StoreStaffAssignments
// — register/replenishment/cleaning only, see renderStaffPanel()/assignmentFromPanel()
// in src/ui/storeGameRuntime.ts) into the real Simulation's ordered OperationTaskId
// priority list (all 5 tasks; earlier tasks claim scarce shared work capacity first, see
// src/simulation/operations.ts). The Canvas panel has no concept of delivery_receiving/
// admin, so this only ever reorders the three tasks it does control, sorted by
// descending assigned headcount (ties keep their existing relative order) —
// delivery_receiving/admin stay in their existing absolute slots in currentPriorities
// and are never moved by this conversion.
const MANAGED_STAFF_TASKS: readonly OperationTaskId[] = ["register", "replenishment", "cleaning"];

export function taskPrioritiesFromStaffAssignments(
  assignments: StoreStaffAssignments,
  currentPriorities: readonly OperationTaskId[],
): OperationTaskId[] {
  const managedSorted = [...MANAGED_STAFF_TASKS].sort((a, b) => {
    const diff = assignments[b as StoreStaffTask] - assignments[a as StoreStaffTask];
    if (diff !== 0) return diff;
    return currentPriorities.indexOf(a) - currentPriorities.indexOf(b);
  });
  const result = [...currentPriorities];
  let cursor = 0;
  for (let index = 0; index < result.length; index += 1) {
    if (MANAGED_STAFF_TASKS.includes(result[index]!)) {
      result[index] = managedSorted[cursor]!;
      cursor += 1;
    }
  }
  return result;
}

// ADR-0005: converts the Canvas layout's per-category shelfCapacity (StoreCategoryId,
// grown by shelf-tier investment) into the real Simulation's categoryArea point
// allocation (sim category ids, fixed budget economy.totalShelfAreaPoints), proportional
// to each sim category's mapped Canvas shelfCapacity. "dessert" has no sim category of
// its own, so its capacity folds into category_snacks's weight — the reverse of
// categoryWeightsForCohort()'s forward 65/35 snacks/dessert split. Uses the same
// remainder-to-last-category technique as src/balance/benchmark.ts's
// weightedCategoryArea() so the result always sums to exactly totalShelfAreaPoints,
// which set_category_area requires.
export function categoryAreaFromShelfCapacity(
  inventories: Record<StoreCategoryId, ShelfInventoryState>,
  categories: readonly CategoryDefinition[],
  totalShelfAreaPoints: number,
): Record<string, number> {
  const weightForSimCategory = (simCategoryId: string): number => {
    const storeCategoryId = SIM_CATEGORY_TO_STORE_CATEGORY[simCategoryId];
    if (!storeCategoryId) return 0;
    let weight = inventories[storeCategoryId].shelfCapacity;
    if (storeCategoryId === "snacks") weight += inventories.dessert.shelfCapacity;
    return Math.max(0, weight);
  };
  const totalWeight = categories.reduce((sum, category) => sum + weightForSimCategory(category.id), 0);
  const result: Record<string, number> = {};
  let assigned = 0;
  categories.forEach((category, index) => {
    if (index === categories.length - 1) {
      result[category.id] = totalShelfAreaPoints - assigned;
      return;
    }
    const value =
      totalWeight > 0
        ? Number(((totalShelfAreaPoints * weightForSimCategory(category.id)) / totalWeight).toFixed(3))
        : Number((totalShelfAreaPoints / categories.length).toFixed(3));
    result[category.id] = value;
    assigned += value;
  });
  return result;
}
