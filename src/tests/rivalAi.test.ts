import { describe, expect, it } from "vitest";
import {
  applyMonthlyCloseCheck,
  createInitialRivalCloseState,
  estimateCompetitorDailyFinancials,
  RIVAL_CLOSE_LOSS_MONTH_THRESHOLD,
} from "../simulation/rivalAi.js";
import type { EconomyBalance } from "../simulation/types.js";

const economy: EconomyBalance = {
  wagePerStaffPerSlot: 250,
  utilitiesPerSlotOpen: 200,
  otherOptionUtility: 0.4,
  choiceSharpness: 6,
  totalShelfAreaPoints: 70,
  demandNoiseRange: 0.1,
  safetyStockRatio: 0.05,
  deliveryCostPerEvent: 8000,
};

describe("estimateCompetitorDailyFinancials", () => {
  it("来店数×1来店あたり売上から売上・利益を推定する", () => {
    const result = estimateCompetitorDailyFinancials(
      100,
      1000,
      0.6,
      { morning: 2, midday: 2, afternoon: 2, evening: 2 },
      8,
      20,
      economy,
    );
    // revenue = 100*1000 = 100,000; cogs = 60,000
    // openSlotsPerDay = (20-8)*4 = 48; labor = 2*250*48 = 24,000; utilities = 200*48 = 9,600
    // profit = 100,000 - 60,000 - 24,000 - 9,600 = 6,400
    expect(result.revenue).toBe(100_000);
    expect(result.profit).toBe(6_400);
  });

  it("来店数0なら売上・利益とも費用分だけ赤字になる", () => {
    const result = estimateCompetitorDailyFinancials(
      0,
      1000,
      0.6,
      { morning: 1, midday: 1, afternoon: 1, evening: 1 },
      8,
      20,
      economy,
    );
    expect(result.revenue).toBe(0);
    expect(result.profit).toBeLessThan(0);
  });
});

describe("applyMonthlyCloseCheck", () => {
  it("黒字の月は連続赤字月数を0にリセットする", () => {
    const state = applyMonthlyCloseCheck(
      { consecutiveLossMonths: 3, closed: false },
      1000,
    );
    expect(state.consecutiveLossMonths).toBe(0);
    expect(state.closed).toBe(false);
  });

  it("赤字の月が続くと連続赤字月数が増える", () => {
    let state = createInitialRivalCloseState();
    for (let i = 0; i < RIVAL_CLOSE_LOSS_MONTH_THRESHOLD - 1; i += 1) {
      state = applyMonthlyCloseCheck(state, -1000);
    }
    expect(state.consecutiveLossMonths).toBe(RIVAL_CLOSE_LOSS_MONTH_THRESHOLD - 1);
    expect(state.closed).toBe(false);
  });

  it(`連続赤字月数が${RIVAL_CLOSE_LOSS_MONTH_THRESHOLD}ヶ月に達すると閉店する`, () => {
    let state = createInitialRivalCloseState();
    for (let i = 0; i < RIVAL_CLOSE_LOSS_MONTH_THRESHOLD; i += 1) {
      state = applyMonthlyCloseCheck(state, -1000);
    }
    expect(state.consecutiveLossMonths).toBe(RIVAL_CLOSE_LOSS_MONTH_THRESHOLD);
    expect(state.closed).toBe(true);
  });

  it("閉店後は利益が出ても状態が変化しない", () => {
    const closedState = { consecutiveLossMonths: 6, closed: true };
    const next = applyMonthlyCloseCheck(closedState, 1_000_000);
    expect(next).toEqual(closedState);
  });
});
