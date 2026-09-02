import { describe, expect, it } from "vitest";
import {
  resolveAgentFacing,
  resolveFixtureArtIndex,
  resolveFixtureStockState,
  resolveWalkFrame,
  STORE_ART_ATLAS_SPEC,
} from "../ui/storeArtAssets.js";
import { createDefaultStoreLayout, createStoreOperationsEngine } from "../game/storeOperationsEngine.js";

describe("store art asset mapping", () => {
  it("keeps every atlas on complete equal-sized cells", () => {
    for (const spec of Object.values(STORE_ART_ATLAS_SPEC)) {
      expect(spec.width % spec.columns).toBe(0);
      expect(spec.height % spec.rows).toBe(0);
    }
  });

  it("maps every fixture in the default store to artwork, except frozen/hot (no merchandise art yet, ADR-0003/ADR-0004)", () => {
    const layout = createDefaultStoreLayout();
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    for (const fixture of layout.fixtures) {
      if (fixture.categoryId === "frozen" || fixture.categoryId === "hot") {
        // ADR-0003/ADR-0004: frozen_case/hot_case have real fixture-bases.png cells,
        // but no merchandise.png overlay art exists for either category yet, so
        // resolveFixtureArtIndex intentionally falls back to undefined here (the
        // caller then draws the fallback rectangle) until ChatGPT supplies art.
        expect(resolveFixtureArtIndex(fixture, snapshot)).toBeUndefined();
        continue;
      }
      expect(resolveFixtureArtIndex(fixture, snapshot)).toBeDefined();
    }
  });

  it("uses the empty-shelf artwork after a shelf stockout", () => {
    const layout = createDefaultStoreLayout();
    const fixture = layout.fixtures.find((candidate) => candidate.id === "snacks");
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    expect(fixture).toBeDefined();
    snapshot.inventories.snacks.shelfUnits = 0;
    expect(resolveFixtureArtIndex(fixture!, snapshot)).toBe(11);
  });

  it("maps inventory ratios to composited merchandise states", () => {
    const fixture = createDefaultStoreLayout().fixtures.find((candidate) => candidate.id === "snacks")!;
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const inventory = snapshot.inventories.snacks;
    inventory.shelfUnits = inventory.shelfCapacity;
    expect(resolveFixtureStockState(fixture, snapshot)).toBe("full");
    inventory.shelfUnits = Math.floor(inventory.shelfCapacity / 2);
    expect(resolveFixtureStockState(fixture, snapshot)).toBe("normal");
    inventory.shelfUnits = 1;
    expect(resolveFixtureStockState(fixture, snapshot)).toBe("low");
    inventory.shelfUnits = 0;
    expect(resolveFixtureStockState(fixture, snapshot)).toBe("empty");
  });

  it("leaves frozen_case/hot_case fixtures without art undrawn (fallback rectangle applies)", () => {
    // These synthetic fixtures have no categoryId, so resolveFixtureArtIndex returns
    // undefined regardless of kind (both kinds now have a StoreCategoryId targeting
    // them in the default layout — "frozen"/ADR-0003, "hot"/ADR-0004 — but neither has
    // merchandise.png overlay art yet, covered by the previous test instead).
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const frozenCase = { id: "frozen-test", kind: "frozen_case" as const, tiles: [], customerServicePoints: [], staffServicePoints: [] };
    const hotCase = { id: "hot-test", kind: "hot_case" as const, tiles: [], customerServicePoints: [], staffServicePoints: [] };
    expect(resolveFixtureArtIndex(frozenCase, snapshot)).toBeUndefined();
    expect(resolveFixtureArtIndex(hotCase, snapshot)).toBeUndefined();
  });

  it("keeps every walk frame at 0 when only one frame per direction exists (today's atlases)", () => {
    for (const phase of [0, 0.1, 0.39, 0.4, 5, 1000]) {
      expect(resolveWalkFrame(phase, 1)).toBe(0);
    }
    expect(resolveWalkFrame(undefined, 1)).toBe(0);
  });

  it("cycles through the available frames as walkCyclePhase advances", () => {
    // WALK_FRAME_STEP_TILES is 0.4 tiles per frame advance (see storeArtAssets.ts).
    expect(resolveWalkFrame(0, 3)).toBe(0);
    expect(resolveWalkFrame(0.39, 3)).toBe(0);
    expect(resolveWalkFrame(0.4, 3)).toBe(1);
    expect(resolveWalkFrame(0.8, 3)).toBe(2);
    expect(resolveWalkFrame(1.3, 3)).toBe(0);
  });

  it("treats a missing walkCyclePhase (a save from before this field existed) as 0", () => {
    expect(resolveWalkFrame(undefined, 3)).toBe(0);
  });

  it("selects direction from the next path tile", () => {
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 5, y: 4 }] })).toBe("right");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 3, y: 4 }] })).toBe("left");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 3 }] })).toBe("back");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 5 }] })).toBe("front");
  });
});
