import {
  createInitialClock,
  isLastSlotOfDay,
  isWithinHours,
  nextClock,
  slotsInTimeBlock,
  timeBlockForSlot,
  type SimClock,
} from "./clock.js";
import { computeCohortPotentialDemand, rollWeather, weatherDemandMultiplier, type Weather } from "./demand.js";
import { computeLaborCost, computeSalesFinance, computeUtilitiesCost } from "./finance.js";
import { allocateCategoryUnits } from "./purchase.js";
import { RandomStreams } from "./rng.js";
import { computeStoreShares, evaluateStore, OTHER_OPTION_ID } from "./storeChoice.js";
import type { ScenarioBundle, StoreDefinition, TimeBlockId } from "./types.js";
import type { DailyReport } from "../reporting/dailyReport.js";

const CATEGORY_AREA_CHANGE_THRESHOLD = 10;
const CATEGORY_AREA_RENOVATION_COST = 50000;
const MIN_STAFFING = 1;
const MAX_STAFFING = 4;

export type PolicyCommand =
  | { type: "set_opening_hours"; openingHour: number; closingHour: number }
  | { type: "set_category_area"; categoryArea: Record<string, number> }
  | { type: "set_staffing"; timeBlock: TimeBlockId; count: number };

export interface SimulationSnapshot {
  day: number;
  slot: number;
  finished: boolean;
  cash: number;
  playerStore: {
    openingHour: number;
    closingHour: number;
    categoryArea: Record<string, number>;
    staffingByTimeBlock: Record<TimeBlockId, number>;
  };
}

interface DayAccumulator {
  weather: Weather;
  revenue: number;
  cogs: number;
  laborCost: number;
  utilitiesCost: number;
  visitsByStore: Record<string, number>;
  salesUnitsByCategory: Record<string, number>;
}

export interface Simulation {
  getSnapshot(): SimulationSnapshot;
  getDailyReport(day: number): DailyReport | undefined;
  getAllDailyReports(): DailyReport[];
  applyPolicy(command: PolicyCommand): void;
  advanceSlot(): void;
  advanceDay(): void;
  runToEnd(): void;
  isFinished(): boolean;
}

function emptyAccumulator(weather: Weather): DayAccumulator {
  return {
    weather,
    revenue: 0,
    cogs: 0,
    laborCost: 0,
    utilitiesCost: 0,
    visitsByStore: {},
    salesUnitsByCategory: {},
  };
}

export function createSimulation(scenario: ScenarioBundle, seed: number): Simulation {
  const randomStreams = new RandomStreams(seed);
  let clock: SimClock = createInitialClock();
  let finished = false;
  let cash = scenario.playerStore.initialCash;

  const playerStore: StoreDefinition = { ...scenario.playerStore };
  const allStores = [playerStore, ...scenario.competitorStores];
  const slotsPerBlock: Record<TimeBlockId, number> = Object.fromEntries(
    scenario.timeBlocks.map((block) => [block.id, slotsInTimeBlock(block)]),
  ) as Record<TimeBlockId, number>;

  const dailyReports: DailyReport[] = [];
  let weather: Weather = rollWeather(scenario.district, randomStreams.stream("weather"));
  let accumulator = emptyAccumulator(weather);

  function addVisit(storeId: string, amount: number): void {
    accumulator.visitsByStore[storeId] = (accumulator.visitsByStore[storeId] ?? 0) + amount;
  }

  function processSlot(): void {
    if (finished) {
      throw new Error("Simulation already finished");
    }
    const timeBlock = timeBlockForSlot(clock.slot, scenario.timeBlocks);
    const demandRng = randomStreams.stream("demand");

    for (const cohort of scenario.cohorts) {
      const potentialDemand = computeCohortPotentialDemand(
        cohort,
        timeBlock,
        slotsPerBlock[timeBlock],
        clock.day,
        scenario.district,
        weather,
        scenario.economy,
        demandRng,
      );
      if (potentialDemand <= 0) {
        continue;
      }

      const evaluations = allStores.map((store) =>
        evaluateStore(store, cohort, scenario.categories, clock.slot, scenario.economy),
      );
      const shares = computeStoreShares(evaluations, scenario.economy);

      for (const [storeId, share] of Object.entries(shares)) {
        addVisit(storeId, potentialDemand * share);
      }

      const playerVisits = potentialDemand * (shares[playerStore.id] ?? 0);
      if (playerVisits > 0) {
        const categoryUnits = allocateCategoryUnits(
          playerVisits,
          playerStore,
          cohort,
          scenario.categories,
          scenario.economy,
        );
        for (const [categoryId, units] of Object.entries(categoryUnits)) {
          accumulator.salesUnitsByCategory[categoryId] =
            (accumulator.salesUnitsByCategory[categoryId] ?? 0) + units;
        }
        const { revenue, cogs } = computeSalesFinance(categoryUnits, scenario.categories);
        accumulator.revenue += revenue;
        accumulator.cogs += cogs;
      }
    }

    const isOpen = isWithinHours(clock.slot, playerStore.openingHour, playerStore.closingHour);
    if (isOpen) {
      const staffCount = playerStore.staffingByTimeBlock[timeBlock];
      accumulator.laborCost += computeLaborCost(staffCount, scenario.economy);
    }
    accumulator.utilitiesCost += computeUtilitiesCost(isOpen, scenario.economy);

    const dayJustEnded = isLastSlotOfDay(clock);
    if (dayJustEnded) {
      const profit = accumulator.revenue - accumulator.cogs - accumulator.laborCost - accumulator.utilitiesCost;
      cash += profit;
      dailyReports.push({
        day: clock.day,
        weather: accumulator.weather,
        revenue: accumulator.revenue,
        cogs: accumulator.cogs,
        laborCost: accumulator.laborCost,
        utilitiesCost: accumulator.utilitiesCost,
        profit,
        cashEnd: cash,
        visitsByStore: accumulator.visitsByStore,
        salesUnitsByCategory: accumulator.salesUnitsByCategory,
      });
    }

    clock = nextClock(clock);

    if (dayJustEnded) {
      if (clock.day > scenario.scenario.totalDays) {
        finished = true;
      } else {
        weather = rollWeather(scenario.district, randomStreams.stream("weather"));
        accumulator = emptyAccumulator(weather);
      }
    }
  }

  return {
    getSnapshot(): SimulationSnapshot {
      return {
        day: clock.day,
        slot: clock.slot,
        finished,
        cash,
        playerStore: {
          openingHour: playerStore.openingHour,
          closingHour: playerStore.closingHour,
          categoryArea: { ...playerStore.categoryArea },
          staffingByTimeBlock: { ...playerStore.staffingByTimeBlock },
        },
      };
    },

    getDailyReport(day: number): DailyReport | undefined {
      return dailyReports.find((r) => r.day === day);
    },

    getAllDailyReports(): DailyReport[] {
      return [...dailyReports];
    },

    applyPolicy(command: PolicyCommand): void {
      switch (command.type) {
        case "set_opening_hours": {
          if (command.openingHour >= command.closingHour) {
            throw new Error("openingHour must be before closingHour");
          }
          if (command.openingHour < 6 || command.closingHour > 24) {
            throw new Error("Store hours must fall within [6,24]");
          }
          playerStore.openingHour = command.openingHour;
          playerStore.closingHour = command.closingHour;
          break;
        }
        case "set_category_area": {
          const newTotal = Object.values(command.categoryArea).reduce((a, b) => a + b, 0);
          if (newTotal !== scenario.economy.totalShelfAreaPoints) {
            throw new Error(
              `Category area must sum to ${scenario.economy.totalShelfAreaPoints}, got ${newTotal}`,
            );
          }
          let totalChange = 0;
          for (const [categoryId, area] of Object.entries(command.categoryArea)) {
            totalChange += Math.abs(area - (playerStore.categoryArea[categoryId] ?? 0));
          }
          if (totalChange > CATEGORY_AREA_CHANGE_THRESHOLD) {
            cash -= CATEGORY_AREA_RENOVATION_COST;
          }
          playerStore.categoryArea = { ...command.categoryArea };
          break;
        }
        case "set_staffing": {
          if (command.count < MIN_STAFFING || command.count > MAX_STAFFING) {
            throw new Error(`Staffing count must be within [${MIN_STAFFING},${MAX_STAFFING}]`);
          }
          playerStore.staffingByTimeBlock[command.timeBlock] = command.count;
          break;
        }
      }
    },

    advanceSlot(): void {
      processSlot();
    },

    advanceDay(): void {
      const startDay = clock.day;
      while (!finished && clock.day === startDay) {
        processSlot();
      }
    },

    runToEnd(): void {
      while (!finished) {
        processSlot();
      }
    },

    isFinished(): boolean {
      return finished;
    },
  };
}

export { OTHER_OPTION_ID };
