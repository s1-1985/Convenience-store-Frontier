import type { TimeBlockDefinition, TimeBlockId } from "./types.js";

export const SLOTS_PER_DAY = 72;
export const START_HOUR = 6;
export const END_HOUR = 24;
export const MINUTES_PER_SLOT = 15;

export interface SimClock {
  day: number;
  slot: number;
}

export function createInitialClock(): SimClock {
  return { day: 1, slot: 0 };
}

export function isLastSlotOfDay(clock: SimClock): boolean {
  return clock.slot === SLOTS_PER_DAY - 1;
}

export function nextClock(clock: SimClock): SimClock {
  if (isLastSlotOfDay(clock)) {
    return { day: clock.day + 1, slot: 0 };
  }
  return { day: clock.day, slot: clock.slot + 1 };
}

export function slotHour(slot: number): number {
  return START_HOUR + slot / (60 / MINUTES_PER_SLOT);
}

export function isWithinHours(slot: number, openingHour: number, closingHour: number): boolean {
  const hour = slotHour(slot);
  return hour >= openingHour && hour < closingHour;
}

export function isWeekend(day: number): boolean {
  const dayOfWeek = (day - 1) % 7;
  return dayOfWeek === 5 || dayOfWeek === 6;
}

export function timeBlockForSlot(
  slot: number,
  timeBlocks: readonly TimeBlockDefinition[],
): TimeBlockId {
  const hour = slotHour(slot);
  const block = timeBlocks.find((b) => hour >= b.startHour && hour < b.endHour);
  if (!block) {
    throw new Error(`No time block covers hour ${hour} (slot ${slot})`);
  }
  return block.id;
}

export function slotsInTimeBlock(block: TimeBlockDefinition): number {
  return (block.endHour - block.startHour) * (60 / MINUTES_PER_SLOT);
}
