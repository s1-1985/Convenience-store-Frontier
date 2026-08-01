import { describe, expect, it } from "vitest";
import {
  createDefaultStoreLayout,
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
  findStorePath,
  restoreStoreOperationsEngine,
  type StoreEngineContext,
  type StoreOperationsEngine,
} from "../game/storeOperationsEngine.js";

function context(overrides: Partial<StoreEngineContext> = {}): StoreEngineContext {
  return {
    isOpen: true,
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

  it("creates a real queue and abandonment when no staff member is assigned to register", () => {
    const engine = createStoreOperationsEngine(2026);
    engine.setStaffAssignments({ register: 0, replenishment: 2, cleaning: 0 });

    run(engine, 180, context({ requestedStaffCount: 2, arrivalRatePerMinute: 18 }));
    const snapshot = engine.getSnapshot();

    expect(snapshot.kpis.maximumQueueLength).toBeGreaterThan(0);
    expect(snapshot.kpis.queueAbandonments).toBeGreaterThan(0);
    expect(snapshot.kpis.transactions).toBe(0);
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

  it("restores the exact persistent store state and remains deterministic", () => {
    const first = createStoreOperationsEngine(555);
    run(first, 75);
    const restored = restoreStoreOperationsEngine(first.serialize());

    expect(restored.getSnapshot()).toEqual(first.getSnapshot());

    run(first, 40);
    run(restored, 40);
    expect(restored.getSnapshot()).toEqual(first.getSnapshot());
  });
});
