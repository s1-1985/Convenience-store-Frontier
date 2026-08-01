import type { CohortDefinition, TimeBlockId } from "./types.js";

export const HABIT_IDS = [
  "breakfast_purchase",
  "external_lunch",
  "night_shopping",
  "small_immediate_purchase",
] as const;

export type HabitId = (typeof HABIT_IDS)[number];

export type HabitState =
  | "unexperienced"
  | "trial"
  | "repeat"
  | "habitual"
  | "regional_established";

export interface HabitObservation {
  potentialDemand: number;
  playerVisits: number;
  playerSuccessfulVisits: number;
  competitorSuccessfulVisits: number;
  divertedToCompetitor: number;
}

interface HabitHistoryEntry extends HabitObservation {
  day: number;
}

export interface HabitMetric {
  state: HabitState;
  regionalAdoption: number;
  playerContribution: number;
  recentActiveDays: number;
  recentPotentialDemand: number;
  recentSuccessfulVisits: number;
}

export type HabitMetricRecord = Record<HabitId, HabitMetric>;

export interface HabitSystemSnapshot {
  byCohort: Record<string, HabitMetricRecord>;
  regionalAdoptionByHabit: Record<HabitId, number>;
  playerContributionByHabit: Record<HabitId, number>;
}

export interface HabitDaySummary extends HabitSystemSnapshot {
  dailyPotentialDemandByHabit: Record<HabitId, number>;
  dailyPlayerSuccessfulVisitsByHabit: Record<HabitId, number>;
  dailyCompetitorSuccessfulVisitsByHabit: Record<HabitId, number>;
  dailyDiversionsToCompetitorByHabit: Record<HabitId, number>;
}

export interface HabitSystem {
  getDemandMultiplier(cohortId: string, timeBlock: TimeBlockId): number;
  getStoreChoiceBonus(
    cohortId: string,
    timeBlock: TimeBlockId,
    storeId: string,
    playerStoreId: string,
    competitorStoreIds: readonly string[],
  ): number;
  computeDiversionToCompetitor(
    cohortId: string,
    timeBlock: TimeBlockId,
    failedPlayerVisits: number,
  ): number;
  recordSlot(cohortId: string, timeBlock: TimeBlockId, observation: HabitObservation): void;
  closeDay(day: number): HabitDaySummary;
  getSnapshot(): HabitSystemSnapshot;
}

interface InternalHabitState {
  history: HabitHistoryEntry[];
  metric: HabitMetric;
}

type InternalHabitRecord = Record<HabitId, InternalHabitState>;
type ObservationRecord = Record<HabitId, HabitObservation>;

const HISTORY_DAYS = 14;
const DEMAND_BONUS_AT_FULL_ADOPTION = 0.3;
const CHOICE_BONUS_AT_FULL_ADOPTION = 0.16;
const MAX_DIVERSION_RATE = 0.8;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function emptyObservation(): HabitObservation {
  return {
    potentialDemand: 0,
    playerVisits: 0,
    playerSuccessfulVisits: 0,
    competitorSuccessfulVisits: 0,
    divertedToCompetitor: 0,
  };
}

function emptyMetric(): HabitMetric {
  return {
    state: "unexperienced",
    regionalAdoption: 0,
    playerContribution: 0,
    recentActiveDays: 0,
    recentPotentialDemand: 0,
    recentSuccessfulVisits: 0,
  };
}

function createHabitRecord<T>(factory: () => T): Record<HabitId, T> {
  return {
    breakfast_purchase: factory(),
    external_lunch: factory(),
    night_shopping: factory(),
    small_immediate_purchase: factory(),
  };
}

function cloneMetric(metric: HabitMetric): HabitMetric {
  return { ...metric };
}

function determineState(activeDays: number, regionalAdoption: number): HabitState {
  if (activeDays >= 10 && regionalAdoption >= 0.6) {
    return "regional_established";
  }
  if (activeDays >= 6 && regionalAdoption >= 0.4) {
    return "habitual";
  }
  if (activeDays >= 3 && regionalAdoption >= 0.18) {
    return "repeat";
  }
  if (activeDays >= 1) {
    return "trial";
  }
  return "unexperienced";
}

export function habitForTimeBlock(timeBlock: TimeBlockId): HabitId {
  switch (timeBlock) {
    case "morning":
      return "breakfast_purchase";
    case "midday":
      return "external_lunch";
    case "evening":
      return "night_shopping";
    case "afternoon":
      return "small_immediate_purchase";
  }
}

export function createHabitSystem(cohorts: readonly CohortDefinition[]): HabitSystem {
  const populationByCohort = new Map(cohorts.map((cohort) => [cohort.id, cohort.population]));
  const statesByCohort: Record<string, InternalHabitRecord> = {};
  const dailyByCohort: Record<string, ObservationRecord> = {};

  for (const cohort of cohorts) {
    statesByCohort[cohort.id] = createHabitRecord(() => ({
      history: [],
      metric: emptyMetric(),
    }));
    dailyByCohort[cohort.id] = createHabitRecord(emptyObservation);
  }

  function internalState(cohortId: string, habitId: HabitId): InternalHabitState | undefined {
    return statesByCohort[cohortId]?.[habitId];
  }

  function metricFor(cohortId: string, timeBlock: TimeBlockId): HabitMetric {
    return internalState(cohortId, habitForTimeBlock(timeBlock))?.metric ?? emptyMetric();
  }

  function aggregateSnapshot(): HabitSystemSnapshot {
    const byCohort: Record<string, HabitMetricRecord> = {};
    for (const cohort of cohorts) {
      const record = statesByCohort[cohort.id];
      if (!record) {
        continue;
      }
      byCohort[cohort.id] = {
        breakfast_purchase: cloneMetric(record.breakfast_purchase.metric),
        external_lunch: cloneMetric(record.external_lunch.metric),
        night_shopping: cloneMetric(record.night_shopping.metric),
        small_immediate_purchase: cloneMetric(record.small_immediate_purchase.metric),
      };
    }

    const regionalAdoptionByHabit = createHabitRecord(() => 0);
    const playerContributionByHabit = createHabitRecord(() => 0);

    for (const habitId of HABIT_IDS) {
      let populationTotal = 0;
      let adoptionWeighted = 0;
      let contributionWeighted = 0;
      for (const cohort of cohorts) {
        const population = populationByCohort.get(cohort.id) ?? 0;
        const metric = statesByCohort[cohort.id]?.[habitId].metric;
        if (!metric || population <= 0) {
          continue;
        }
        populationTotal += population;
        adoptionWeighted += metric.regionalAdoption * population;
        contributionWeighted += metric.playerContribution * population;
      }
      if (populationTotal > 0) {
        regionalAdoptionByHabit[habitId] = adoptionWeighted / populationTotal;
        playerContributionByHabit[habitId] = contributionWeighted / populationTotal;
      }
    }

    return {
      byCohort,
      regionalAdoptionByHabit,
      playerContributionByHabit,
    };
  }

  return {
    getDemandMultiplier(cohortId: string, timeBlock: TimeBlockId): number {
      const metric = metricFor(cohortId, timeBlock);
      return 1 + metric.regionalAdoption * DEMAND_BONUS_AT_FULL_ADOPTION;
    },

    getStoreChoiceBonus(
      cohortId: string,
      timeBlock: TimeBlockId,
      storeId: string,
      playerStoreId: string,
      competitorStoreIds: readonly string[],
    ): number {
      const metric = metricFor(cohortId, timeBlock);
      if (metric.regionalAdoption <= 0) {
        return 0;
      }

      if (storeId === playerStoreId) {
        const playerAffinity = 0.35 + metric.playerContribution * 0.65;
        return CHOICE_BONUS_AT_FULL_ADOPTION * metric.regionalAdoption * playerAffinity;
      }

      if (competitorStoreIds.includes(storeId)) {
        const competitorCount = Math.max(1, competitorStoreIds.length);
        const competitorContribution = (1 - metric.playerContribution) / competitorCount;
        const competitorAffinity = 0.35 + competitorContribution * 0.65;
        return CHOICE_BONUS_AT_FULL_ADOPTION * metric.regionalAdoption * competitorAffinity;
      }

      return 0;
    },

    computeDiversionToCompetitor(
      cohortId: string,
      timeBlock: TimeBlockId,
      failedPlayerVisits: number,
    ): number {
      if (failedPlayerVisits <= 0) {
        return 0;
      }
      const metric = metricFor(cohortId, timeBlock);
      const diversionRate = clamp01(metric.regionalAdoption * MAX_DIVERSION_RATE);
      return failedPlayerVisits * diversionRate;
    },

    recordSlot(cohortId: string, timeBlock: TimeBlockId, observation: HabitObservation): void {
      const habitId = habitForTimeBlock(timeBlock);
      const daily = dailyByCohort[cohortId]?.[habitId];
      if (!daily) {
        return;
      }
      daily.potentialDemand += Math.max(0, observation.potentialDemand);
      daily.playerVisits += Math.max(0, observation.playerVisits);
      daily.playerSuccessfulVisits += Math.max(0, observation.playerSuccessfulVisits);
      daily.competitorSuccessfulVisits += Math.max(0, observation.competitorSuccessfulVisits);
      daily.divertedToCompetitor += Math.max(0, observation.divertedToCompetitor);
    },

    closeDay(day: number): HabitDaySummary {
      const dailyPotentialDemandByHabit = createHabitRecord(() => 0);
      const dailyPlayerSuccessfulVisitsByHabit = createHabitRecord(() => 0);
      const dailyCompetitorSuccessfulVisitsByHabit = createHabitRecord(() => 0);
      const dailyDiversionsToCompetitorByHabit = createHabitRecord(() => 0);

      for (const cohort of cohorts) {
        const stateRecord = statesByCohort[cohort.id];
        const dailyRecord = dailyByCohort[cohort.id];
        if (!stateRecord || !dailyRecord) {
          continue;
        }

        for (const habitId of HABIT_IDS) {
          const observation = dailyRecord[habitId];
          const state = stateRecord[habitId];
          state.history.push({ day, ...observation });
          if (state.history.length > HISTORY_DAYS) {
            state.history.splice(0, state.history.length - HISTORY_DAYS);
          }

          const recentPotentialDemand = state.history.reduce(
            (sum, entry) => sum + entry.potentialDemand,
            0,
          );
          const recentPlayerSuccessfulVisits = state.history.reduce(
            (sum, entry) => sum + entry.playerSuccessfulVisits,
            0,
          );
          const recentCompetitorSuccessfulVisits = state.history.reduce(
            (sum, entry) => sum + entry.competitorSuccessfulVisits,
            0,
          );
          const recentSuccessfulVisits =
            recentPlayerSuccessfulVisits + recentCompetitorSuccessfulVisits;
          const activeDays = state.history.filter((entry) => {
            if (entry.potentialDemand <= 0) {
              return false;
            }
            const successful =
              entry.playerSuccessfulVisits + entry.competitorSuccessfulVisits;
            return successful / entry.potentialDemand >= 0.2;
          }).length;
          const successRate =
            recentPotentialDemand > 0
              ? clamp01(recentSuccessfulVisits / recentPotentialDemand)
              : 0;
          const repetitionFactor = Math.min(1, activeDays / 8);
          const regionalAdoption = clamp01(successRate * repetitionFactor);
          const playerContribution =
            recentSuccessfulVisits > 0
              ? clamp01(recentPlayerSuccessfulVisits / recentSuccessfulVisits)
              : 0;

          state.metric = {
            state: determineState(activeDays, regionalAdoption),
            regionalAdoption,
            playerContribution,
            recentActiveDays: activeDays,
            recentPotentialDemand,
            recentSuccessfulVisits,
          };

          dailyPotentialDemandByHabit[habitId] += observation.potentialDemand;
          dailyPlayerSuccessfulVisitsByHabit[habitId] += observation.playerSuccessfulVisits;
          dailyCompetitorSuccessfulVisitsByHabit[habitId] +=
            observation.competitorSuccessfulVisits;
          dailyDiversionsToCompetitorByHabit[habitId] += observation.divertedToCompetitor;
          dailyRecord[habitId] = emptyObservation();
        }
      }

      return {
        ...aggregateSnapshot(),
        dailyPotentialDemandByHabit,
        dailyPlayerSuccessfulVisitsByHabit,
        dailyCompetitorSuccessfulVisitsByHabit,
        dailyDiversionsToCompetitorByHabit,
      };
    },

    getSnapshot(): HabitSystemSnapshot {
      return aggregateSnapshot();
    },
  };
}
