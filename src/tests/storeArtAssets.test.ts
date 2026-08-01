import { describe, expect, it } from "vitest";
import {
  resolveAgentFacing,
  resolveFixtureArtIndex,
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

  it("selects direction from the next path tile", () => {
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 5, y: 4 }] })).toBe("right");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 3, y: 4 }] })).toBe("left");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 3 }] })).toBe("back");
    expect(resolveAgentFacing({ x: 4, y: 4, path: [{ x: 4, y: 5 }] })).toBe("front");
  });
});
