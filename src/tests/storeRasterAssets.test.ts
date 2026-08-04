import { describe, expect, it } from "vitest";
import { STORE_ART_ATLAS_SPEC } from "../ui/storeArtAssets.js";

describe("store art atlas geometry", () => {
  it("matches the source-controlled SVG atlas geometry used by the renderer", () => {
    expect(STORE_ART_ATLAS_SPEC).toEqual({
      fixtures: { width: 1536, height: 768, columns: 4, rows: 3 },
      staff: { width: 768, height: 768, columns: 4, rows: 3 },
      customers: { width: 640, height: 1760, columns: 4, rows: 8 },
      icons: { width: 1024, height: 128, columns: 8, rows: 1 },
    });
  });
});
