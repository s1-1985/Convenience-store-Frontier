import { describe, expect, it } from "vitest";
import {
  resolveAgentFacing,
  resolveFixtureArtIndex,
  resolveFixtureStockState,
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

  it("maps every fixture in the default store to artwork", () => {
    const layout = createDefaultStoreLayout();
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    for (const fixture of layout.fixtures) {
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
    // No StoreCategoryId targets these temperature-zone kinds yet (see
    // docs/store-fixture-zones.md), so resolveFixtureArtIndex must keep returning
    // undefined for them until a category and fixture-bases.png cells exist.
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    const frozenCase = { id: "frozen-test", kind: "frozen_case" as const, tiles: [], customerServicePoints: [], staffServicePoints: [] };
    const hotCase = { id: "hot-test", kind: "hot_case" as const, tiles: [], customerServicePoints: [], staffServicePoints: [] };
    expect(resolveFixtureArtIndex(frozenCase, snapshot)).toBeUndefined();
    expect(resolveFixtureArtIndex(hotCase, snapshot)).toBeUndefined();
  });

  it("selects direction from the next path tile", () => {
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 5, y: 4 }] })).toBe("right");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 3, y: 4 }] })).toBe("left");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 3 }] })).toBe("back");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 5 }] })).toBe("front");
  });
});
