import { describe, expect, it } from "vitest";
import { RandomStreams } from "../simulation/rng.js";

describe("RandomStreams", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new RandomStreams(42).stream("demand");
    const b = new RandomStreams(42).stream("demand");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new RandomStreams(1).stream("demand");
    const b = new RandomStreams(2).stream("demand");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("keeps streams independent of each other", () => {
    const streamsA = new RandomStreams(7);
    const demandOnly = Array.from({ length: 5 }, () => streamsA.stream("demand")());

    const streamsB = new RandomStreams(7);
    // Touch the weather stream first; demand sequence must be unaffected.
    streamsB.stream("weather")();
    streamsB.stream("weather")();
    const demandAfterWeatherTouched = Array.from({ length: 5 }, () => streamsB.stream("demand")());

    expect(demandAfterWeatherTouched).toEqual(demandOnly);
  });

  it("returns values within [0, 1)", () => {
    const gen = new RandomStreams(123).stream("weather");
    for (let i = 0; i < 1000; i++) {
      const value = gen();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
