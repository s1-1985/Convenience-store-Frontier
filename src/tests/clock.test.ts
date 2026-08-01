import { describe, expect, it } from "vitest";
import {
  SLOTS_PER_DAY,
  createInitialClock,
  isLastSlotOfDay,
  isWeekend,
  isWithinHours,
  nextClock,
  slotHour,
} from "../simulation/clock.js";

describe("clock", () => {
  it("starts at day 1, slot 0", () => {
    expect(createInitialClock()).toEqual({ day: 1, slot: 0 });
  });

  it("maps slot 0 to 6:00 and the last slot to 23:45", () => {
    expect(slotHour(0)).toBe(6);
    expect(slotHour(SLOTS_PER_DAY - 1)).toBeCloseTo(23.75);
  });

  it("rolls over to the next day after the last slot", () => {
    let clock = { day: 1, slot: SLOTS_PER_DAY - 1 };
    expect(isLastSlotOfDay(clock)).toBe(true);
    clock = nextClock(clock);
    expect(clock).toEqual({ day: 2, slot: 0 });
  });

  it("advances slot by one within a day", () => {
    expect(nextClock({ day: 1, slot: 10 })).toEqual({ day: 1, slot: 11 });
  });

  it("determines whether a slot falls within opening hours", () => {
    // slot for 8:00 => (8-6)*4 = 8
    expect(isWithinHours(8, 8, 20)).toBe(true);
    // slot for 7:45 => (7.75-6)*4 = 7
    expect(isWithinHours(7, 8, 20)).toBe(false);
    // slot for 19:45, still open when closing at 20:00
    expect(isWithinHours(55, 8, 20)).toBe(true);
    // slot for 20:00, closed
    expect(isWithinHours(56, 8, 20)).toBe(false);
  });

  it("treats day 6 and 7 of each 7-day cycle as weekend", () => {
    expect(isWeekend(1)).toBe(false);
    expect(isWeekend(6)).toBe(true);
    expect(isWeekend(7)).toBe(true);
    expect(isWeekend(8)).toBe(false);
    expect(isWeekend(13)).toBe(true);
  });
});
