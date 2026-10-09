import type { EconomyBalance, TimeBlockId } from "./types.js";

// PS1版「ザ・コンビニ」ライバル経営AIの移植(design/ps1-reference/algorithms.md §8.1、
// design/DECISIONS/ADR-0008・ADR-0009参照)。§8.1(閉店判断)のみを対象とする。
//
// 原作の閉店判断そのもの(連続赤字月数>=6で閉店)は完全に数式が判明しているが、
// その入力である「競合店舗の月次損益」を本プロジェクトは持たない(競合店舗の
// 商品別売上・在庫・補充をシミュレートしていないため)。これはMDに解析結果が無い
// のではなく、本プロジェクトの既存アーキテクチャが競合店舗の内部を数値として
// 持っていないことによる。プレイヤー店舗の実績(1来店あたり売上・原価率)を
// 競合店舗にも適用する独自設計で近似する(明記する)。人件費・光熱費は既存の
// finance.tsと同じ式を、競合店舗自身のstaffingByTimeBlock/営業時間に対して使う。
//
// 保護条件(「初出店直後」「自社9店舗展開時の特殊条件」)は、本プロジェクトが
// 複数店舗展開(2号店)を試作中の禁止事項としているため、該当する状況が
// そもそも発生しない。そのため未実装(除外ではなく、前提条件が成立しないため)。

export const RIVAL_CLOSE_LOSS_MONTH_THRESHOLD = 6;

export interface CompetitorFinancialEstimate {
  revenue: number;
  profit: number;
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/**
 * 独自設計(原作は店舗ごとの実際の商品別売上・コストを使うが、本プロジェクトは
 * 競合店舗のそれを持たない)。プレイヤー店舗の当日の「1来店あたり売上」
 * (revenuePerVisit)と「原価率」(cogsRatio)を転用し、競合店舗の来店数へ適用する。
 * 人件費・光熱費は、競合店舗自身の人員・営業時間からfinance.tsと同じ式で計算する。
 */
export function estimateCompetitorDailyFinancials(
  competitorVisits: number,
  revenuePerVisit: number,
  cogsRatio: number,
  staffingByTimeBlock: Record<TimeBlockId, number>,
  openingHour: number,
  closingHour: number,
  economy: EconomyBalance,
): CompetitorFinancialEstimate {
  const revenue = competitorVisits * revenuePerVisit;
  const cogs = revenue * cogsRatio;
  const avgStaffing = average(Object.values(staffingByTimeBlock));
  const openSlotsPerDay = Math.max(0, (closingHour - openingHour) * 4);
  const laborCost = avgStaffing * economy.wagePerStaffPerSlot * openSlotsPerDay;
  const utilitiesCost = economy.utilitiesPerSlotOpen * openSlotsPerDay;
  return { revenue, profit: revenue - cogs - laborCost - utilitiesCost };
}

export interface RivalCloseState {
  consecutiveLossMonths: number;
  closed: boolean;
}

export function createInitialRivalCloseState(): RivalCloseState {
  return { consecutiveLossMonths: 0, closed: false };
}

/**
 * §8.1。直前月の利益が負なら連続赤字月数+1、黒字なら0にリセット。連続赤字月数が
 * RIVAL_CLOSE_LOSS_MONTH_THRESHOLD(6)に達したら閉店する。既に閉店済みなら変化しない。
 */
export function applyMonthlyCloseCheck(
  state: RivalCloseState,
  monthProfit: number,
): RivalCloseState {
  if (state.closed) {
    return state;
  }
  const consecutiveLossMonths = monthProfit < 0 ? state.consecutiveLossMonths + 1 : 0;
  return {
    consecutiveLossMonths,
    closed: consecutiveLossMonths >= RIVAL_CLOSE_LOSS_MONTH_THRESHOLD,
  };
}
