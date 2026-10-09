import type { DailyReport } from "../reporting/dailyReport.js";
import {
  createCompetitorAI,
  type CompetitorAISnapshot,
  type CompetitorDecisionEvent,
  type CompetitorPublicObservation,
} from "./competitor.js";
import { RandomStreams } from "./rng.js";
import {
  applyMonthlyCloseCheck,
  createInitialRivalCloseState,
  estimateCompetitorDailyFinancials,
  type RivalCloseState,
} from "./rivalAi.js";
import {
  createSimulation as createCoreSimulation,
  type PolicyCommand,
  type Simulation,
  type SimulationOptions,
  type SimulationSnapshot,
} from "./simulation.js";
import { MONTH_LENGTH_DAYS } from "./storeRating.js";
import type { ScenarioBundle, StoreDefinition } from "./types.js";

export interface CompetitiveDailyReport extends DailyReport {
  competitorObservation: CompetitorPublicObservation;
  competitorDecisions: CompetitorDecisionEvent[];
}

export interface CompetitiveSimulationSnapshot extends SimulationSnapshot {
  competitorAI: CompetitorAISnapshot;
  /** design/ps1-reference/algorithms.md §8.1(閉店判断)の現在の状態。店舗IDごと。 */
  rivalCloseStateByStore: Record<string, RivalCloseState>;
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
  options: SimulationOptions = {},
): CompetitiveSimulation {
  const competitiveScenario = cloneScenario(scenario);
  const core = createCoreSimulation(competitiveScenario, seed, options);
  const competitorStoreIds = competitiveScenario.competitorStores.map((store) => store.id);
  const competitorAI = createCompetitorAI(
    competitiveScenario.competitorStores,
    new RandomStreams(seed).stream("competitor"),
  );
  const enhancedReports: CompetitiveDailyReport[] = [];
  let processedReportCount = 0;

  const competitorStoresById = new Map(
    competitiveScenario.competitorStores.map((store) => [store.id, store]),
  );
  const rivalMonthProfitAccumulator: Record<string, number> = Object.fromEntries(
    competitorStoreIds.map((id) => [id, 0]),
  );
  const rivalCloseStateByStore: Record<string, RivalCloseState> = Object.fromEntries(
    competitorStoreIds.map((id) => [id, createInitialRivalCloseState()]),
  );

  function applyRivalCloseTracking(report: DailyReport): void {
    for (const storeId of competitorStoreIds) {
      const store = competitorStoresById.get(storeId)!;
      const state = rivalCloseStateByStore[storeId]!;

      if (state.closed) {
        // design/ps1-reference/algorithms.md §8.1の閉店処理。本プロジェクトは店舗を
        // 配列から削除する仕組みを持たないため、営業時間を0にして客の選択対象から
        // 外す(evaluateStoreのisWithinHours判定が常にfalseになる)ことで表現する。
        // 既存の競合AI(competitor.ts)がclose_later等で閉店後もcloseHourを動かす
        // ことがあるため、閉店済みの店舗は毎日再度ピン止めする(ここをobserveDay()
        // より後に呼ぶ理由もこれ)。
        store.openingHour = store.closingHour;
        continue;
      }

      const competitorVisits = report.visitsByStore[storeId] ?? 0;
      const playerVisits = report.visitsByStore[competitiveScenario.playerStore.id] ?? 0;
      const revenuePerVisit = playerVisits > 0 ? report.revenue / playerVisits : 0;
      const cogsRatio = report.revenue > 0 ? report.cogs / report.revenue : 0;
      const { profit } = estimateCompetitorDailyFinancials(
        competitorVisits,
        revenuePerVisit,
        cogsRatio,
        store.staffingByTimeBlock,
        store.openingHour,
        store.closingHour,
        competitiveScenario.economy,
      );
      rivalMonthProfitAccumulator[storeId] = (rivalMonthProfitAccumulator[storeId] ?? 0) + profit;

      if (report.day % MONTH_LENGTH_DAYS === 0) {
        const nextState = applyMonthlyCloseCheck(state, rivalMonthProfitAccumulator[storeId]!);
        rivalCloseStateByStore[storeId] = nextState;
        rivalMonthProfitAccumulator[storeId] = 0;
        if (nextState.closed) {
          store.openingHour = store.closingHour;
        }
      }
    }
  }

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
      // competitorAI.observeDay()の後に呼ぶ: close_later等の既存アクションが閉店済み
      // 店舗の営業時間を動かした場合でも、ここで再度ピン止めして上書きする。
      applyRivalCloseTracking(report);
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
        rivalCloseStateByStore: { ...rivalCloseStateByStore },
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
      // core.runToEnd()を一括で呼ぶと、競合AIの行動(価格変更・営業時間変更・今回
      // 追加した閉店処理を含む)がsyncCompletedDays()で全日程終了後にまとめて適用
      // されてしまい、シミュレーション中の実際の客選択に一切反映されない(既存の
      // 潜在バグ、今回のライバル経営AI閉店テストで発覚)。日ごとにsync込みで進める。
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
