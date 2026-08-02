import { describe, expect, it } from "vitest";
import { STORE_ART_ATLAS_SPEC } from "../ui/storeArtAssets.js";

describe("Milestone 16 real raster store assets", () => {
  it("matches the optimized WebP atlas geometry used by the renderer", () => {
    expect(STORE_ART_ATLAS_SPEC).toEqual({
      fixtures: { width: 576, height: 288, columns: 4, rows: 3 },
      staff: { width: 288, height: 288, columns: 4, rows: 3 },
      customers: { width: 256, height: 528, columns: 4, rows: 6 },
      icons: { width: 384, height: 48, columns: 8, rows: 1 },
    });
  });
});
