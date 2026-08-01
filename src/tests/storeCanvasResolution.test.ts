import { describe, expect, it } from "vitest";
import {
  calculateCanvasDisplaySize,
  resolveCanvasPixelRatio,
} from "../ui/storeCanvasResolution.js";

describe("store canvas resolution", () => {
  it("caps very dense displays while preserving at least one device pixel", () => {
    expect(resolveCanvasPixelRatio(0)).toBe(1);
    expect(resolveCanvasPixelRatio(2.625)).toBe(2.625);
    expect(resolveCanvasPixelRatio(5)).toBe(3);
  });

  it("fits the logical game surface inside a wider stage without distortion", () => {
    expect(calculateCanvasDisplaySize(2400, 900, 1080, 500)).toEqual({
      width: 1944,
      height: 900,
    });
  });

  it("fits the logical game surface inside a taller stage without distortion", () => {
    expect(calculateCanvasDisplaySize(1080, 800, 1080, 500)).toEqual({
      width: 1080,
      height: 500,
    });
  });
});
