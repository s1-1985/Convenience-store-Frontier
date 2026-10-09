import { describe, expect, it } from "vitest";
import { computeMonthlyProfitCorrectionBonus } from "../simulation/finance.js";

describe("computeMonthlyProfitCorrectionBonus", () => {
  it("月内補正前利益の7倍を返す(design/ps1-reference/algorithms.md §6.2)", () => {
    expect(computeMonthlyProfitCorrectionBonus(100_000)).toBe(700_000);
  });

  it("赤字月は補正ボーナスも負になる(原作の式をそのまま適用)", () => {
    expect(computeMonthlyProfitCorrectionBonus(-50_000)).toBe(-350_000);
  });

  it("利益0ならボーナスも0", () => {
    expect(computeMonthlyProfitCorrectionBonus(0)).toBe(0);
  });
});
