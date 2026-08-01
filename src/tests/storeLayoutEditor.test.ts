import { describe, expect, it } from "vitest";
import {
  createDefaultStoreLayout,
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
} from "../game/storeOperationsEngine.js";
import {
  cloneStoreLayout,
  createStoredStoreLayout,
  editableStoreFixtureIds,
  evaluateStoreLayout,
  moveStoreFixture,
  parseStoredStoreLayout,
  prepareOperationsForStoreLayout,
  rotateStoreFixtureClockwise,
  storeFixtureBounds,
} from "../game/storeLayoutEditor.js";

describe("constrained store layout editor", () => {
  it("accepts the default layout and calculates customer, replenishment, and congestion metrics", () => {
    const evaluation = evaluateStoreLayout(createDefaultStoreLayout());

    expect(evaluation.isValid).toBe(true);
    expect(evaluation.issues).toHaveLength(0);
    expect(evaluation.metrics.averageCustomerSteps).toBeGreaterThan(0);
    expect(evaluation.metrics.averageReplenishmentSteps).toBeGreaterThan(0);
    expect(evaluation.metrics.congestionPeak).toBeGreaterThan(0);
    expect(evaluation.metrics.score).toBeGreaterThan(0);
    expect(evaluation.metrics.hotspots.length).toBeGreaterThan(0);
  });

  it("rejects fixtures that overlap or extend outside the editable store area", () => {
    const layout = createDefaultStoreLayout();
    const instant = layout.fixtures.find((fixture) => fixture.id === "instant");
    expect(instant).toBeDefined();
    const instantBounds = storeFixtureBounds(instant!);

    const overlapping = moveStoreFixture(layout, "snacks", { x: instantBounds.x, y: instantBounds.y });
    const overlapEvaluation = evaluateStoreLayout(overlapping);
    expect(overlapEvaluation.isValid).toBe(false);
    expect(overlapEvaluation.issues.some((issue) => issue.code === "fixture_overlap")).toBe(true);

    const outside = moveStoreFixture(layout, "drinks", { x: -2, y: 1 });
    const outsideEvaluation = evaluateStoreLayout(outside);
    expect(outsideEvaluation.isValid).toBe(false);
    expect(outsideEvaluation.issues.some((issue) => issue.code === "outside_store")).toBe(true);
  });

  it("moves and rotates an editable fixture while preserving its identity and service geometry", () => {
    const layout = createDefaultStoreLayout();
    const original = layout.fixtures.find((fixture) => fixture.id === "snacks");
    expect(original).toBeDefined();
    const originalBounds = storeFixtureBounds(original!);

    const moved = moveStoreFixture(layout, "snacks", { x: 2, y: 9 });
    const movedFixture = moved.fixtures.find((fixture) => fixture.id === "snacks");
    expect(movedFixture?.categoryId).toBe(original?.categoryId);
    expect(storeFixtureBounds(movedFixture!).x).toBe(2);
    expect(storeFixtureBounds(movedFixture!).y).toBe(9);
    expect(movedFixture?.customerServicePoints[0]?.x).toBe(
      (original?.customerServicePoints[0]?.x ?? 0) + (2 - originalBounds.x),
    );

    let rotated = cloneStoreLayout(layout);
    for (let count = 0; count < 4; count += 1) rotated = rotateStoreFixtureClockwise(rotated, "snacks");
    expect(rotated.fixtures.find((fixture) => fixture.id === "snacks")).toEqual(original);
  });

  it("finds valid placements that worsen customer and replenishment walking distances", () => {
    const layout = createDefaultStoreLayout();
    const baseline = evaluateStoreLayout(layout);
    let worseCustomer = false;
    let worseReplenishment = false;

    for (const fixtureId of editableStoreFixtureIds(layout)) {
      for (let y = 1; y < layout.height - 1; y += 1) {
        for (let x = 1; x < layout.width - 1; x += 1) {
          const candidate = moveStoreFixture(layout, fixtureId, { x, y });
          const evaluation = evaluateStoreLayout(candidate);
          if (!evaluation.isValid) continue;
          if (evaluation.metrics.averageCustomerSteps > baseline.metrics.averageCustomerSteps + 0.5) {
            worseCustomer = true;
          }
          if (evaluation.metrics.averageReplenishmentSteps > baseline.metrics.averageReplenishmentSteps + 0.5) {
            worseReplenishment = true;
          }
          if (worseCustomer && worseReplenishment) break;
        }
        if (worseCustomer && worseReplenishment) break;
      }
      if (worseCustomer && worseReplenishment) break;
    }

    expect(worseCustomer).toBe(true);
    expect(worseReplenishment).toBe(true);
  });

  it("serializes and parses only valid layouts with the supported store dimensions", () => {
    const layout = createDefaultStoreLayout();
    const stored = createStoredStoreLayout(layout);
    expect(parseStoredStoreLayout(stored)).toEqual(layout);

    const invalid = createStoredStoreLayout(layout);
    invalid.layout.width += 1;
    expect(parseStoredStoreLayout(invalid)).toBeUndefined();

    expect(parseStoredStoreLayout({ version: 2, layout })).toBeUndefined();
    expect(parseStoredStoreLayout(null)).toBeUndefined();
  });

  it("clears transient agents for a layout change while preserving inventory, assignments, and KPIs", () => {
    const engine = createStoreOperationsEngine(1414);
    engine.setStaffAssignments({ register: 1, replenishment: 1, cleaning: 0 });
    for (let elapsed = 0; elapsed < 45; elapsed += 0.25) {
      engine.advance(0.25, {
        isOpen: true,
        arrivalRatePerMinute: 14,
        categoryWeights: defaultCategoryWeightsForHour(12),
        requestedStaffCount: 2,
      });
    }
    const serialized = engine.serialize();
    expect(serialized.customers.length).toBeGreaterThan(0);

    const nextLayout = rotateStoreFixtureClockwise(createDefaultStoreLayout(), "drinks");
    const prepared = prepareOperationsForStoreLayout(serialized, nextLayout);

    expect(prepared.customers).toHaveLength(0);
    expect(prepared.queueCustomerIds).toHaveLength(0);
    expect(prepared.litter).toHaveLength(0);
    expect(prepared.checkoutProgressSeconds).toBe(0);
    expect(prepared.inventories).toEqual(serialized.inventories);
    expect(prepared.assignments).toEqual(serialized.assignments);
    expect(prepared.kpis).toEqual(serialized.kpis);
    expect(prepared.staff.every((member) => member.x === nextLayout.backroomTile.x)).toBe(true);
    expect(prepared.staff.every((member) => member.y === nextLayout.backroomTile.y)).toBe(true);
    expect(prepared.staff.every((member) => member.state === "idle" && member.path.length === 0)).toBe(true);
  });
});
