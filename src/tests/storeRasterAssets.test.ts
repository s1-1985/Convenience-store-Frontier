import { describe, expect, it } from "vitest";
import { STORE_ART_ATLAS_SPEC } from "../ui/storeArtAssets.js";

describe("store art atlas geometry", () => {
  it("matches the source-controlled SVG atlas geometry used by the renderer", () => {
    expect(STORE_ART_ATLAS_SPEC).toEqual({
      fixtures: { width: 1536, height: 768, columns: 4, rows: 3 },
      fixtureBases: { width: 1536, height: 256, columns: 4, rows: 1 },
      merchandise: { width: 2688, height: 256, columns: 7, rows: 1 },
      staff: { width: 768, height: 768, columns: 4, rows: 3 },
      customers: { width: 1920, height: 7920, columns: 12, rows: 36 },
      icons: { width: 1024, height: 128, columns: 8, rows: 1 },
    });
  });
});
