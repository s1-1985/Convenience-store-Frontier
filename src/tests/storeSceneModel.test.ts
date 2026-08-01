import { describe, expect, it } from "vitest";
import {
  createStoreSceneState,
  summarizeStoreScene,
  type StoreSceneInput,
} from "../game/storeSceneModel.js";

function input(overrides: Partial<StoreSceneInput> = {}): StoreSceneInput {
  return {
    day: 12,
    slot: 14,
    isOpen: true,
    queueCustomers: 0,
    backlogByTask: {
      register: 0,
      replenishment: 0,
      cleaning: 0,
      delivery_receiving: 0,
      admin: 0,
    },
    staffingByTimeBlock: 2,
    stockoutUnits: 0,
    shelfStockoutUnits: 0,
    wasteUnits: 0,
    visitsToday: 40,
    revenueToday: 120000,
    profitToday: 45000,
    ...overrides,
  };
}

describe("createStoreSceneState", () => {
  it("creates a visible checkout queue when simulation queue grows", () => {
    const state = createStoreSceneState(input({ queueCustomers: 4.2 }));
    const summary = summarizeStoreScene(state);

    expect(state.visibleQueueLength).toBe(5);
    expect(summary.queueing).toBeGreaterThanOrEqual(5);
    expect(state.customers.some((customer) => customer.impatient)).toBe(true);
    expect(state.dominantProblem).toBe("queue");
  });

  it("turns shelves low or empty under inventory and replenishment failures", () => {
    const state = createStoreSceneState(
      input({ stockoutUnits: 70, shelfStockoutUnits: 35 }),
    );
    const summary = summarizeStoreScene(state);

    expect(summary.emptyShelves).toBeGreaterThan(0);
    expect(state.shelves.some((shelf) => shelf.warning !== "none")).toBe(true);
    expect(state.dominantProblem).toBe("stockout");
  });

  it("shows passersby rather than shoppers while closed", () => {
    const state = createStoreSceneState(input({ isOpen: false, visitsToday: 12 }));

    expect(state.customers).toHaveLength(0);
    expect(state.visibleQueueLength).toBe(0);
    expect(state.showClosedPassersby).toBe(true);
  });

  it("assigns staff toward the largest operational problems", () => {
    const state = createStoreSceneState(
      input({
        staffingByTimeBlock: 4,
        queueCustomers: 2,
        shelfStockoutUnits: 20,
        backlogByTask: {
          register: 3,
          replenishment: 18,
          cleaning: 1,
          delivery_receiving: 10,
          admin: 2,
        },
      }),
    );
    const summary = summarizeStoreScene(state);

    expect(state.staff).toHaveLength(4);
    expect(summary.staffByTask.replenishment).toBeGreaterThan(0);
    expect(summary.staffByTask.register).toBeGreaterThan(0);
  });

  it("is deterministic for the same store state", () => {
    const first = createStoreSceneState(input({ queueCustomers: 2.5, stockoutUnits: 8 }));
    const second = createStoreSceneState(input({ queueCustomers: 2.5, stockoutUnits: 8 }));

    expect(second).toEqual(first);
  });
});
