import type { DailyReport } from "../reporting/dailyReport.js";
import {
  createCompetitorAI,
  type CompetitorAISnapshot,
  type CompetitorDecisionEvent,
  type CompetitorPublicObservation,
} from "./competitor.js";
import { RandomStreams } from "./rng.js";
import {
  createSimulation as createCoreSimulation,
  type PolicyCommand,
  type Simulation,
  type SimulationSnapshot,
} from "./simulation.js";
import type { ScenarioBundle, StoreDefinition } from "./types.js";

export interface CompetitiveDailyReport extends DailyReport {
  competitorObservation: CompetitorPublicObservation;
  competitorDecisions: CompetitorDecisionEvent[];
}

export interface CompetitiveSimulationSnapshot extends SimulationSnapshot {
  competitorAI: CompetitorAISnapshot;
}

export interface CompetitiveSimulation
  extends Omit<Simulation, "getSnapshot" | "getDailyReport" | "getAllDailyReports"> {
  getSnapshot(): CompetitiveSimulationSnapshot;
  getDailyReport(day: number): CompetitiveDailyReport | undefined;
  getAllDailyReports(): CompetitiveDailyReport[];
}

function cloneStore(store: StoreDefinition): StoreDefinition {
  return {
    ...store,
    categoryArea: { ...store.categoryArea },
    staffingByTimeBlock: { ...store.staffingByTimeBlock },
  };
}

function cloneScenario(scenario: ScenarioBundle): ScenarioBundle {
  return {
    ...scenario,
    playerStore: cloneStore(scenario.playerStore),
    competitorStores: scenario.competitorStores.map(cloneStore),
    cohorts: [...scenario.cohorts],
    categories: [...scenario.categories],
    products: [...scenario.products],
    timeBlocks: [...scenario.timeBlocks],
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createCompetitiveSimulation(
  scenario: ScenarioBundle,
  seed: number,
): CompetitiveSimulation {
  const competitiveScenario = cloneScenario(scenario);
  const core = createCoreSimulation(competitiveScenario, seed);
  const competitorStoreIds = competitiveScenario.competitorStores.map((store) => store.id);
  const competitorAI = createCompetitorAI(
    competitiveScenario.competitorStores,
    new RandomStreams(seed).stream("competitor"),
  );
  const enhancedReports: CompetitiveDailyReport[] = [];
  let processedReportCount = 0;

  function buildObservation(report: DailyReport): CompetitorPublicObservation {
    const snapshot = core.getSnapshot();
    const playerVisits = report.visitsByStore[competitiveScenario.playerStore.id] ?? 0;
    const competitorVisits = competitorStoreIds.reduce(
      (sum, storeId) => sum + (report.visitsByStore[storeId] ?? 0),
      0,
    );
    const visibleFailures = report.abandonedCustomers + report.operationalShelfStockoutUnits;

    return {
      day: report.day,
      habitRegionalAdoptionByHabit: { ...report.habitRegionalAdoptionByHabit },
      playerVisits,
      competitorVisits,
      playerOpeningHour: snapshot.playerStore.openingHour,
      playerClosingHour: snapshot.playerStore.closingHour,
      playerCategoryArea: { ...snapshot.playerStore.categoryArea },
      visiblePlayerServiceFailureRate: clamp01(
        visibleFailures / Math.max(1, playerVisits + visibleFailures),
      ),
    };
  }

  function syncCompletedDays(): void {
    const reports = core.getAllDailyReports();
    while (processedReportCount < reports.length) {
      const report = reports[processedReportCount];
      if (!report) {
        break;
      }
      const observation = buildObservation(report);
      const competitorDecisions = competitorAI.observeDay(observation);
      enhancedReports.push({
        ...report,
        competitorObservation: observation,
        competitorDecisions,
      });
      processedReportCount += 1;
    }
  }

  return {
    getSnapshot(): CompetitiveSimulationSnapshot {
      return {
        ...core.getSnapshot(),
        competitorAI: competitorAI.getSnapshot(),
      };
    },

    getDailyReport(day: number): CompetitiveDailyReport | undefined {
      syncCompletedDays();
      return enhancedReports.find((report) => report.day === day);
    },

    getAllDailyReports(): CompetitiveDailyReport[] {
      syncCompletedDays();
      return [...enhancedReports];
    },

    applyPolicy(command: PolicyCommand): void {
      core.applyPolicy(command);
    },

    advanceSlot(): void {
      core.advanceSlot();
      syncCompletedDays();
    },

    advanceDay(): void {
      core.advanceDay();
      syncCompletedDays();
    },

    runToEnd(): void {
      while (!core.isFinished()) {
        core.advanceDay();
        syncCompletedDays();
      }
    },

    isFinished(): boolean {
      return core.isFinished();
    },
  };
}
