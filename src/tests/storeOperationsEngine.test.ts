import { describe, expect, it } from "vitest";
import {
  categoryPriceRange,
  createDefaultStoreLayout,
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
  findStorePath,
  maxShelfTier,
  restoreStoreOperationsEngine,
  type SerializedStoreOperations,
  type StoreEngineContext,
  type StoreCategoryId,
  type StoreOperationsEngine,
} from "../game/storeOperationsEngine.js";

function context(overrides: Partial<StoreEngineContext> = {}): StoreEngineContext {
  return {
    isOpen: true,
    hour: 12,
    arrivalRatePerMinute: 10,
    categoryWeights: defaultCategoryWeightsForHour(12),
    requestedStaffCount: 3,
    ...overrides,
  };
}

function run(engine: StoreOperationsEngine, seconds: number, current = context()): void {
  const step = 0.25;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    engine.advance(step, current);
  }
}

describe("individual store operations engine", () => {
  it("finds a walking route around fixtures from entrance to a shelf", () => {
    const layout = createDefaultStoreLayout();
    const fixture = layout.fixtures.find((candidate) => candidate.categoryId === "ready_meal");
    expect(fixture).toBeDefined();

    const path = findStorePath(layout, layout.entranceTile, fixture?.customerServicePoints ?? []);
    const blocked = new Set(
      layout.fixtures
        .filter((candidate) => candidate.kind !== "entrance")
        .flatMap((candidate) => candidate.tiles.map((tile) => `${tile.x},${tile.y}`)),
    );

    expect(path.length).toBeGreaterThan(0);
    expect(path.some((tile) => blocked.has(`${tile.x},${tile.y}`))).toBe(false);
  });

  it("moves customers through shelves, checkout, and exit while recording purchases", () => {
    const engine = createStoreOperationsEngine(1977);
    engine.setStaffAssignments({ register: 3, replenishment: 0, cleaning: 0 });

    run(engine, 160, context({ requestedStaffCount: 3, arrivalRatePerMinute: 12 }));
    const after = engine.getSnapshot();

    expect(after.kpis.enteredCustomers).toBeGreaterThan(10);
    expect(after.kpis.transactions).toBeGreaterThan(0);
    expect(after.kpis.unitsSold).toBeGreaterThan(0);
    expect(after.kpis.revenue).toBeGreaterThan(0);
  });

  it("creates queue pressure before non-register priorities fall back to checkout", () => {
    const engine = createStoreOperationsEngine(2026);
    engine.setStaffAssignments({ register: 0, replenishment: 2, cleaning: 0 });

    run(engine, 180, context({ requestedStaffCount: 2, arrivalRatePerMinute: 18 }));
    const snapshot = engine.getSnapshot();

    expect(snapshot.kpis.maximumQueueLength).toBeGreaterThan(0);
    expect(snapshot.kpis.queueAbandonments).toBeGreaterThan(0);
    expect(snapshot.kpis.transactions).toBeGreaterThan(0);
    expect(snapshot.staff.every((member) => member.priorityTask === "replenishment")).toBe(true);
  });

  it("moves stock from the backroom to shelves when a replenisher is assigned", () => {
    const engine = createStoreOperationsEngine(44);
    engine.setStaffAssignments({ register: 1, replenishment: 1, cleaning: 0 });

    run(engine, 220, context({ requestedStaffCount: 2, arrivalRatePerMinute: 15 }));
    const snapshot = engine.getSnapshot();

    expect(snapshot.kpis.replenishedUnits).toBeGreaterThan(0);
    expect(Object.values(snapshot.inventories).some((inventory) => inventory.backroomUnits < 20)).toBe(true);
  });

  it("records stockout encounters and no-purchase exits when every shelf is empty", () => {
    const source = createStoreOperationsEngine(71).serialize();
    for (const inventory of Object.values(source.inventories)) {
      inventory.shelfUnits = 0;
      inventory.backroomUnits = 0;
    }
    source.assignments = { register: 1, replenishment: 0, cleaning: 0 };
    const engine = restoreStoreOperationsEngine(source);

    run(engine, 90, context({ requestedStaffCount: 1, arrivalRatePerMinute: 14 }));
    const snapshot = engine.getSnapshot();

    expect(snapshot.kpis.stockoutEncounters).toBeGreaterThan(0);
    expect(snapshot.kpis.noPurchaseExits).toBeGreaterThan(0);
  });

  it("changes checkout and replenishment behavior immediately after staff reassignment", () => {
    const engine = createStoreOperationsEngine(84);
    engine.setStaffAssignments({ register: 0, replenishment: 2, cleaning: 0 });
    run(engine, 70, context({ requestedStaffCount: 2, arrivalRatePerMinute: 16 }));
    const queueBefore = engine.getSnapshot().queueCustomerIds.length;

    engine.setStaffAssignments({ register: 2, replenishment: 0, cleaning: 0 });
    run(engine, 45, context({ requestedStaffCount: 2, arrivalRatePerMinute: 0 }));
    const after = engine.getSnapshot();

    expect(queueBefore).toBeGreaterThan(0);
    expect(after.kpis.transactions).toBeGreaterThan(0);
    expect(after.queueCustomerIds.length).toBeLessThan(queueBefore);
  });

  it("treats assignments as priorities and falls back to pending register work", () => {
    const engine = createStoreOperationsEngine(312);
    engine.setStaffAssignments({ register: 0, replenishment: 2, cleaning: 0 });
    run(engine, 100, context({ requestedStaffCount: 2, arrivalRatePerMinute: 16 }));
    const snapshot = engine.getSnapshot();

    expect(snapshot.staff.every((member) => member.priorityTask === "replenishment")).toBe(true);
    expect(snapshot.kpis.transactions).toBeGreaterThan(0);
  });

  it("restores the exact persistent store state and remains deterministic", () => {
    const first = createStoreOperationsEngine(555);
    run(first, 75);
    const restored = restoreStoreOperationsEngine(first.serialize());

    expect(restored.getSnapshot()).toEqual(first.getSnapshot());

    run(first, 40);
    run(restored, 40);
    expect(restored.getSnapshot()).toEqual(first.getSnapshot());
  });

  it("delivers visibly different stock from the selected ordering and delivery policies", () => {
    const leanSource = createStoreOperationsEngine(90).serialize();
    const safeSource = createStoreOperationsEngine(90).serialize();
    for (const inventory of Object.values(leanSource.inventories)) inventory.backroomUnits = 0;
    for (const inventory of Object.values(safeSource.inventories)) inventory.backroomUnits = 0;
    const lean = restoreStoreOperationsEngine(leanSource);
    const safe = restoreStoreOperationsEngine(safeSource);

    lean.setSupplyPolicy("sell_through", "once_daily");
    safe.setSupplyPolicy("stockout_prevention", "all_categories_twice_daily");
    lean.beginDay(2);
    safe.beginDay(2);
    safe.advance(0.1, context({ isOpen: false, hour: 13 }));

    const leanStock = Object.values(lean.getSnapshot().inventories).reduce(
      (sum, inventory) => sum + inventory.backroomUnits,
      0,
    );
    const safeStock = Object.values(safe.getSnapshot().inventories).reduce(
      (sum, inventory) => sum + inventory.backroomUnits,
      0,
    );
    expect(safeStock).toBeGreaterThan(leanStock);
  });

  it("schedules exactly one midday second delivery for twice-daily policies", () => {
    const source = createStoreOperationsEngine(91).serialize();
    for (const inventory of Object.values(source.inventories)) inventory.backroomUnits = 0;
    const engine = restoreStoreOperationsEngine(source);
    engine.setSupplyPolicy("standard", "ready_to_eat_twice_daily");
    engine.beginDay(2);
    const afterMorning = engine.getSnapshot();

    engine.advance(0.1, context({ isOpen: false, hour: 12.75 }));
    expect(engine.getSnapshot().inventories).toEqual(afterMorning.inventories);
    engine.advance(0.1, context({ isOpen: false, hour: 13 }));
    const afterSecond = engine.getSnapshot();
    expect(afterSecond.inventories.ready_meal.backroomUnits)
      .toBeGreaterThan(afterMorning.inventories.ready_meal.backroomUnits);
    expect(afterSecond.inventories.drinks.backroomUnits)
      .toBe(afterMorning.inventories.drinks.backroomUnits);

    engine.advance(0.1, context({ isOpen: false, hour: 16 }));
    expect(engine.getSnapshot().inventories).toEqual(afterSecond.inventories);
  });

  it("persists the selected merchandising focus", () => {
    const engine = createStoreOperationsEngine(1977);
    engine.setMerchandisingFocus("ready_meal");

    const restored = restoreStoreOperationsEngine(engine.serialize());
    expect(restored.getSnapshot().merchandisingFocus).toBe("ready_meal");
  });

  it("changes category prices in ten-yen steps and persists the bounded value", () => {
    const engine = createStoreOperationsEngine(1980);
    const range = categoryPriceRange("ready_meal");

    engine.setCategoryPrice("ready_meal", range.max + 999);
    expect(engine.getSnapshot().inventories.ready_meal.price).toBe(range.max);
    engine.setCategoryPrice("drinks", 163);
    expect(engine.getSnapshot().inventories.drinks.price).toBe(160);

    const restored = restoreStoreOperationsEngine(engine.serialize());
    expect(restored.getSnapshot().inventories.ready_meal.price).toBe(range.max);
    expect(restored.getSnapshot().inventories.drinks.price).toBe(160);
  });

  it("makes visibly overpriced products generate price refusals", () => {
    const engine = createStoreOperationsEngine(1981);
    for (const category of Object.keys(engine.getSnapshot().inventories) as StoreCategoryId[]) {
      engine.setCategoryPrice(category, categoryPriceRange(category).max);
    }

    run(engine, 240, context({ arrivalRatePerMinute: 18 }));
    expect(engine.getSnapshot().kpis.priceRefusals).toBeGreaterThan(0);
  });

  it("keeps a bounded daily operating history across save and restore", () => {
    const engine = createStoreOperationsEngine(204);
    run(engine, 70, context({ requestedStaffCount: 3, arrivalRatePerMinute: 14 }));
    engine.beginDay(2);

    const history = engine.getSnapshot().dailyHistory;
    expect(history).toHaveLength(1);
    expect(history[0]?.day).toBe(1);
    expect(history[0]?.enteredCustomers).toBeGreaterThan(0);
    expect(restoreStoreOperationsEngine(engine.serialize()).getSnapshot().dailyHistory).toEqual(history);
  });

  it("builds persistent service trust from reliable daily operations", () => {
    const source = createStoreOperationsEngine(108).serialize();
    source.kpis.enteredCustomers = 20;
    source.kpis.transactions = 19;
    source.kpis.stockoutEncounters = 0;
    source.kpis.queueAbandonments = 0;
    const engine = restoreStoreOperationsEngine(source);
    const before = engine.getSnapshot().serviceTrust;

    engine.beginDay(2);
    const after = engine.getSnapshot();
    expect(after.serviceTrust).toBeGreaterThan(before);
    expect(after.dailyHistory[0]?.serviceTrust).toBe(after.serviceTrust);
    expect(restoreStoreOperationsEngine(engine.serialize()).getSnapshot().serviceTrust).toBe(after.serviceTrust);
  });

  it("tracks regular visits and successful regular checkouts", () => {
    const source = createStoreOperationsEngine(809).serialize();
    source.serviceTrust = 1;
    const engine = restoreStoreOperationsEngine(source);
    engine.setStaffAssignments({ register: 3, replenishment: 0, cleaning: 0 });

    run(engine, 180, context({ requestedStaffCount: 3, arrivalRatePerMinute: 18 }));
    const snapshot = engine.getSnapshot();
    expect(snapshot.kpis.regularVisits).toBeGreaterThan(0);
    expect(snapshot.kpis.regularTransactions).toBeGreaterThan(0);
    expect(snapshot.kpis.regularTransactions).toBeLessThanOrEqual(snapshot.kpis.regularVisits);
  });

  it("accrues cash from the completed day's revenue at day rollover", () => {
    const engine = createStoreOperationsEngine(301);
    const initialCash = engine.getSnapshot().cash;
    engine.setStaffAssignments({ register: 3, replenishment: 0, cleaning: 0 });
    run(engine, 160, context({ requestedStaffCount: 3, arrivalRatePerMinute: 12 }));
    expect(engine.getSnapshot().kpis.revenue).toBeGreaterThan(0);

    engine.beginDay(2);

    expect(engine.getSnapshot().cash).not.toBe(initialCash);
  });

  it("still deducts a daily operating cost when the store has no sales", () => {
    const engine = createStoreOperationsEngine(302);
    const cash0 = engine.getSnapshot().cash;
    engine.beginDay(2);
    const cash1 = engine.getSnapshot().cash;
    engine.beginDay(3);
    const cash2 = engine.getSnapshot().cash;

    expect(cash1).toBeLessThan(cash0);
    expect(cash1 - cash2).toBeCloseTo(cash0 - cash1, 5);
  });

  it("invests in shelf capacity, deducting cash and raising the category's shelf capacity", () => {
    const engine = createStoreOperationsEngine(303);
    const before = engine.getSnapshot();
    const capacityBefore = before.inventories.drinks.shelfCapacity;
    const cashBefore = before.cash;

    const result = engine.investInCategoryCapacity("drinks");

    expect(result.ok).toBe(true);
    const after = engine.getSnapshot();
    expect(after.cash).toBeLessThan(cashBefore);
    expect(after.inventories.drinks.shelfCapacity).toBeGreaterThan(capacityBefore);
    expect(after.categoryTiers.drinks).toBe(1);
  });

  it("fails to invest when cash is insufficient and leaves state unchanged", () => {
    const source = createStoreOperationsEngine(304).serialize();
    source.cash = 0;
    const engine = restoreStoreOperationsEngine(source);
    const capacityBefore = engine.getSnapshot().inventories.drinks.shelfCapacity;

    const result = engine.investInCategoryCapacity("drinks");

    expect(result.ok).toBe(false);
    expect(engine.getSnapshot().cash).toBe(0);
    expect(engine.getSnapshot().categoryTiers.drinks).toBe(0);
    expect(engine.getSnapshot().inventories.drinks.shelfCapacity).toBe(capacityBefore);
  });

  it("fails to invest once a category reaches the maximum tier", () => {
    const source = createStoreOperationsEngine(305).serialize();
    source.cash = 10_000_000;
    const engine = restoreStoreOperationsEngine(source);

    let lastResult: { ok: boolean; message: string } | undefined;
    for (let attempt = 0; attempt < maxShelfTier() + 1; attempt += 1) {
      lastResult = engine.investInCategoryCapacity("drinks");
    }

    expect(engine.getSnapshot().categoryTiers.drinks).toBe(maxShelfTier());
    expect(lastResult?.ok).toBe(false);
  });

  it("round-trips cash and category tiers through serialize/restore", () => {
    const engine = createStoreOperationsEngine(306);
    engine.investInCategoryCapacity("snacks");
    const before = engine.getSnapshot();

    const restored = restoreStoreOperationsEngine(engine.serialize());
    const after = restored.getSnapshot();

    expect(after.cash).toBe(before.cash);
    expect(after.categoryTiers).toEqual(before.categoryTiers);
  });

  it("falls back to default cash and tiers when restoring a save from before this feature existed", () => {
    const source = createStoreOperationsEngine(307).serialize() as Partial<SerializedStoreOperations>;
    delete source.cash;
    delete source.categoryTiers;

    const engine = restoreStoreOperationsEngine(source as SerializedStoreOperations);
    const snapshot = engine.getSnapshot();

    expect(Number.isFinite(snapshot.cash)).toBe(true);
    expect(snapshot.cash).toBeGreaterThan(0);
    expect(Object.values(snapshot.categoryTiers).every((tier) => tier === 0)).toBe(true);
  });

  it("counts consecutive days without any policy action", () => {
    const engine = createStoreOperationsEngine(401);
    expect(engine.getSnapshot().daysSincePolicyChange).toBe(0);

    engine.beginDay(2);
    expect(engine.getSnapshot().daysSincePolicyChange).toBe(1);
    engine.beginDay(3);
    expect(engine.getSnapshot().daysSincePolicyChange).toBe(2);
  });

  it("resets the days-without-action counter after any policy setter is used", () => {
    const engine = createStoreOperationsEngine(402);
    engine.beginDay(2);
    engine.beginDay(3);
    expect(engine.getSnapshot().daysSincePolicyChange).toBe(2);

    engine.setCategoryPrice("drinks", 160);
    engine.beginDay(4);

    expect(engine.getSnapshot().daysSincePolicyChange).toBe(0);
  });

  it("round-trips days-without-action through serialize/restore", () => {
    const engine = createStoreOperationsEngine(403);
    engine.beginDay(2);
    engine.beginDay(3);

    const restored = restoreStoreOperationsEngine(engine.serialize());

    expect(restored.getSnapshot().daysSincePolicyChange).toBe(2);
  });

  it("swaps the displayed category between two fixtures of the same kind", () => {
    const engine = createStoreOperationsEngine(501);

    const result = engine.swapFixtureCategories("snacks", "instant");

    expect(result.ok).toBe(true);
    const layout = engine.getLayout();
    expect(layout.fixtures.find((f) => f.id === "snacks")?.categoryId).toBe("instant");
    expect(layout.fixtures.find((f) => f.id === "instant")?.categoryId).toBe("snacks");
  });

  it("rejects swapping fixtures of different kinds", () => {
    const engine = createStoreOperationsEngine(502);

    const result = engine.swapFixtureCategories("snacks", "drinks");

    expect(result.ok).toBe(false);
    const layout = engine.getLayout();
    expect(layout.fixtures.find((f) => f.id === "snacks")?.categoryId).toBe("snacks");
    expect(layout.fixtures.find((f) => f.id === "drinks")?.categoryId).toBe("drinks");
  });

  it("rejects swapping a fixture that has no category, such as the register", () => {
    const engine = createStoreOperationsEngine(503);

    const result = engine.swapFixtureCategories("snacks", "register");

    expect(result.ok).toBe(false);
  });

  it("rejects swapping unknown fixtures or a fixture with itself", () => {
    const engine = createStoreOperationsEngine(504);

    expect(engine.swapFixtureCategories("snacks", "snacks").ok).toBe(false);
    expect(engine.swapFixtureCategories("snacks", "does-not-exist").ok).toBe(false);
  });

  it("resets the days-without-action counter after a category swap", () => {
    const engine = createStoreOperationsEngine(505);
    engine.beginDay(2);
    engine.beginDay(3);
    expect(engine.getSnapshot().daysSincePolicyChange).toBe(2);

    engine.swapFixtureCategories("snacks", "instant");
    engine.beginDay(4);

    expect(engine.getSnapshot().daysSincePolicyChange).toBe(0);
  });
});
