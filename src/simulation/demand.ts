import { isWeekend } from "./clock.js";
import type { RandomFn } from "./rng.js";
import type { CohortDefinition, DistrictDefinition, EconomyBalance, TimeBlockId } from "./types.js";

export type Weather = "clear" | "rain";

export function rollWeather(district: DistrictDefinition, weatherRng: RandomFn): Weather {
  return weatherRng() < district.rainProbability ? "rain" : "clear";
}

export function weatherDemandMultiplier(district: DistrictDefinition, weather: Weather): number {
  return weather === "rain" ? district.rainDemandMultiplier : 1;
}

export function dayTypeFactor(district: DistrictDefinition, day: number): number {
  return isWeekend(day) ? district.weekendFactor : district.weekdayFactor;
}

export function computeCohortPotentialDemand(
  cohort: CohortDefinition,
  timeBlockId: TimeBlockId,
  slotsInTimeBlock: number,
  day: number,
  district: DistrictDefinition,
  weather: Weather,
  economy: EconomyBalance,
  demandRng: RandomFn,
  habitMultiplier = 1,
): number {
  // activityRateByTimeBlock is the share of the cohort shopping across the whole
  // time block, so it must be spread evenly over the slots that make up that block.
  const blockRate = cohort.activityRateByTimeBlock[timeBlockId] ?? 0;
  const baseRate = slotsInTimeBlock > 0 ? blockRate / slotsInTimeBlock : 0;
  const noise = 1 + (demandRng() - 0.5) * economy.demandNoiseRange;
  const demand =
    cohort.population *
    baseRate *
    dayTypeFactor(district, day) *
    weatherDemandMultiplier(district, weather) *
    noise *
    habitMultiplier;
  return Math.max(0, demand);
}
