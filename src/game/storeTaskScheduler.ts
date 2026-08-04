import type { StoreStaffTask } from "./storeOperationsEngine.js";

export type StoreTaskDemand = Record<StoreStaffTask, number>;

const FALLBACK_ORDER: readonly StoreStaffTask[] = ["register", "replenishment", "cleaning"];

/**
 * Keeps preferred work where useful, then spreads idle people across the
 * remaining work instead of sending the whole shift to the same fallback.
 */
export function planStoreStaffTasks(
  priorities: readonly StoreStaffTask[],
  demand: StoreTaskDemand,
): StoreStaffTask[] {
  const remaining: StoreTaskDemand = {
    register: Math.max(0, Math.ceil(demand.register)),
    replenishment: Math.max(0, Math.ceil(demand.replenishment)),
    cleaning: Math.max(0, Math.ceil(demand.cleaning)),
  };
  const result: Array<StoreStaffTask | undefined> = priorities.map((priority) => {
    if (remaining[priority] <= 0) return undefined;
    remaining[priority] -= 1;
    return priority;
  });

  return result.map((assigned, index) => {
    if (assigned) return assigned;
    const fallback = [...FALLBACK_ORDER]
      .sort((left, right) => remaining[right] - remaining[left])
      .find((task) => remaining[task] > 0);
    if (fallback) {
      remaining[fallback] -= 1;
      return fallback;
    }
    return priorities[index] ?? "register";
  });
}
