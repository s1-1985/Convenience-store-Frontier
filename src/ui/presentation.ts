import type { CompetitiveDailyReport } from "../simulation/competitiveSimulation.js";
import type { OperationTaskRecord } from "../simulation/operations.js";

export type AlertSeverity = "info" | "warning" | "critical";

export interface DashboardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /**
   * Optional root-cause chain, one short step per link, drilling from this alert's own
   * symptom (title/detail) down toward an underlying operational cause — see
   * docs/game-design.md §10 "UI原則": "通知は問題を示すだけでなく、原因階層を持つ"
   * (例: 売上低下 → 昼の来店減少 → 弁当欠品増加 → 午後便遅延と補充不足). Built only from
   * fields already on DailyReport (no scenario/product lookup, no cross-day trend), so
   * chains stay at the operational-task/cost/inventory level rather than reaching the
   * category- or time-block-level detail the doc's own example shows — extending this
   * further needs the function to take additional context (see visual-numeric-engine-
   * integration.md "フェーズ2f" for what's still open).
   */
  causeChain?: string[];
}

export const HABIT_LABELS = {
  breakfast_purchase: "通勤途中の朝食購入",
  external_lunch: "店舗での昼食調達",
  night_shopping: "夜間の不足品購入",
  small_immediate_purchase: "少量を必要時に購入",
} as const;

export const OPERATION_LABELS = {
  register: "レジ",
  replenishment: "補充",
  cleaning: "清掃",
  delivery_receiving: "納品受入",
  admin: "発注・記録",
} as const;

export const COMPETITOR_ACTION_LABELS = {
  open_earlier: "開店時刻を早めた",
  close_later: "閉店時刻を延長した",
  ready_to_eat_focus: "即食食品売場を強化した",
  beverage_discount: "飲料価格を見直した",
  magazine_focus: "雑誌売場を強化した",
  daily_goods_focus: "日用品売場を強化した",
} as const;

export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}%`;
}

export function formatClock(day: number, slot: number): { dayLabel: string; timeLabel: string } {
  const totalMinutes = 6 * 60 + slot * 15;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return {
    dayLabel: `${day}日目`,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function sumOperationRecord(record: OperationTaskRecord): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

export function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

export function topEntries(
  record: Record<string, number>,
  limit = 5,
): Array<{ id: string; value: number }> {
  return Object.entries(record)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, value]) => ({ id, value }));
}

// Largest non-zero task in an OperationTaskRecord (register/replenishment/cleaning/
// delivery_receiving/admin), for pointing a cause chain at "which task specifically".
function largestOperationTask(
  record: OperationTaskRecord,
): { task: keyof OperationTaskRecord; label: string; value: number } | undefined {
  const top = (Object.entries(record) as Array<[keyof OperationTaskRecord, number]>)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return top ? { task: top[0], label: OPERATION_LABELS[top[0]], value: top[1] } : undefined;
}

// Which cost line is pressuring today's profit the hardest, for the 赤字/loss cause chain.
function dominantCostCause(report: CompetitiveDailyReport): string {
  const candidates: Array<[string, number]> = [
    ["人件費", report.laborCost],
    ["廃棄コスト", report.wasteCost],
    ["物流費", report.deliveryCost],
    ["光熱費", report.utilitiesCost],
  ];
  const top = candidates.sort((a, b) => b[1] - a[1])[0]!;
  if (top[1] <= 0) return "原価が売上に対して重い";
  return `${top[0]}が利益を圧迫している(${formatYen(top[1])})`;
}

export function buildDashboardAlerts(
  report: CompetitiveDailyReport | undefined,
): DashboardAlert[] {
  if (!report) {
    return [
      {
        id: "no-report",
        severity: "info",
        title: "営業開始前",
        detail: "時間を進めると、売上・在庫・行列・地域行動が日報へ記録される。",
      },
    ];
  }

  const alerts: DashboardAlert[] = [];
  const inventoryStockouts = sumRecord(report.stockoutUnitsByProduct);
  const operationBacklog = sumOperationRecord(report.operationBacklogByTask);

  if (report.profit < -50_000) {
    alerts.push({
      id: "large-loss",
      severity: "critical",
      title: "大幅な赤字",
      detail: `${report.day}日目の損益は${formatYen(report.profit)}。営業時間、人員、発注方針を同時に見直す必要がある。`,
      causeChain: [dominantCostCause(report)],
    });
  } else if (report.profit < 0) {
    alerts.push({
      id: "loss",
      severity: "warning",
      title: "赤字営業",
      detail: `${report.day}日目の損益は${formatYen(report.profit)}。費用増に売上が追いついていない。`,
      causeChain: [dominantCostCause(report)],
    });
  }

  if (report.abandonedCustomers >= 10 || report.queueCustomersEnd >= 15) {
    const registerBacklog = report.operationBacklogByTask.register;
    alerts.push({
      id: "queue-critical",
      severity: "critical",
      title: "レジ待ちで多数離脱",
      detail: `離脱${formatNumber(report.abandonedCustomers)}人、閉店時行列${formatNumber(report.queueCustomersEnd)}人。レジ優先または人員増が必要である。`,
      causeChain: [
        registerBacklog > 0
          ? `レジ業務の未処理が蓄積している(${formatNumber(registerBacklog, 0)}点)`
          : "未処理業務は少ないが、来店の集中に人員配置が追いついていない",
      ],
    });
  } else if (report.abandonedCustomers > 0 || report.queueCustomersEnd >= 5) {
    const registerBacklog = report.operationBacklogByTask.register;
    alerts.push({
      id: "queue-warning",
      severity: "warning",
      title: "レジ待ちが発生",
      detail: `離脱${formatNumber(report.abandonedCustomers)}人、閉店時行列${formatNumber(report.queueCustomersEnd)}人。混雑時間帯の配置を確認する。`,
      causeChain: [
        registerBacklog > 0
          ? `レジ業務の未処理が蓄積している(${formatNumber(registerBacklog, 0)}点)`
          : "一時的な来店集中による行列(未処理業務は無い)",
      ],
    });
  }

  if (report.operationalShelfStockoutUnits >= 20) {
    const replenishmentBacklog = report.operationBacklogByTask.replenishment;
    alerts.push({
      id: "shelf-critical",
      severity: "critical",
      title: "補充遅延で棚が空いている",
      detail: `バックヤード在庫があっても、補充作業の遅れで${formatNumber(report.operationalShelfStockoutUnits)}個分の販売機会を失った。`,
      causeChain: [
        replenishmentBacklog > 0
          ? `補充業務の未処理が蓄積している(${formatNumber(replenishmentBacklog, 0)}点)`
          : "バックヤード在庫はあるが、配置人員が補充作業に届いていない",
      ],
    });
  } else if (report.operationalShelfStockoutUnits > 0) {
    const replenishmentBacklog = report.operationBacklogByTask.replenishment;
    alerts.push({
      id: "shelf-warning",
      severity: "warning",
      title: "棚補充が追いついていない",
      detail: `補充遅延による棚欠品が${formatNumber(report.operationalShelfStockoutUnits)}個分発生した。`,
      causeChain: [
        replenishmentBacklog > 0
          ? `補充業務の未処理が蓄積している(${formatNumber(replenishmentBacklog, 0)}点)`
          : "バックヤード在庫はあるが、配置人員が補充作業に届いていない",
      ],
    });
  }

  if (inventoryStockouts >= 40) {
    alerts.push({
      id: "inventory-critical",
      severity: "critical",
      title: "在庫そのものが不足",
      detail: `商品在庫不足による欠品が${formatNumber(inventoryStockouts)}個分発生した。発注方針または納品方式を見直す。`,
      causeChain: [
        report.backroomInventoryUnitsEnd < inventoryStockouts
          ? `バックヤード在庫自体が不足している(残り${formatNumber(report.backroomInventoryUnitsEnd, 0)}点)`
          : `バックヤードには在庫があるが棚への補充が追いついていない(残り${formatNumber(report.backroomInventoryUnitsEnd, 0)}点)`,
      ],
    });
  } else if (inventoryStockouts > 0) {
    alerts.push({
      id: "inventory-warning",
      severity: "warning",
      title: "商品在庫が不足",
      detail: `商品在庫不足による欠品が${formatNumber(inventoryStockouts)}個分発生した。`,
      causeChain: [
        report.backroomInventoryUnitsEnd < inventoryStockouts
          ? `バックヤード在庫自体が不足している(残り${formatNumber(report.backroomInventoryUnitsEnd, 0)}点)`
          : `バックヤードには在庫があるが棚への補充が追いついていない(残り${formatNumber(report.backroomInventoryUnitsEnd, 0)}点)`,
      ],
    });
  }

  if (report.revenue > 0 && report.wasteCost / report.revenue >= 0.08) {
    alerts.push({
      id: "waste-warning",
      severity: "warning",
      title: "廃棄負担が大きい",
      detail: `廃棄原価が売上の${formatPercent(report.wasteCost / report.revenue, 1)}。欠品防止を優先しすぎている可能性がある。`,
      causeChain: [
        inventoryStockouts > 0
          ? `欠品も同時に発生している(欠品${formatNumber(inventoryStockouts, 0)}個。カテゴリ間の発注配分を見直す余地がある)`
          : "欠品はほぼ無く、発注量が需要を上回っている可能性が高い",
      ],
    });
  }

  if (operationBacklog >= 20) {
    const top = largestOperationTask(report.operationBacklogByTask);
    alerts.push({
      id: "backlog-warning",
      severity: "warning",
      title: "店舗作業が積み残されている",
      detail: `未処理作業は合計${formatNumber(operationBacklog)}作業点。優先順位の低い業務が翌日に持ち越されている。`,
      causeChain: top ? [`${top.label}の未処理が最も大きい(${formatNumber(top.value, 0)}点)`] : [],
    });
  }

  if (report.habitualDiversionsToCompetitor > 0) {
    alerts.push({
      id: "habit-diversion",
      severity: report.habitualDiversionsToCompetitor >= 5 ? "critical" : "warning",
      title: "常連客が競合へ流出",
      detail: `習慣化した需要のうち${formatNumber(report.habitualDiversionsToCompetitor)}人分が、自社の欠品・混雑を理由に競合へ移った。`,
      causeChain: [
        inventoryStockouts >= report.abandonedCustomers + report.queueCustomersEnd
          ? `欠品の影響が大きい(欠品${formatNumber(inventoryStockouts, 0)}個)`
          : `行列・混雑の影響が大きい(閉店時行列${formatNumber(report.queueCustomersEnd, 0)}人)`,
      ],
    });
  }

  for (const decision of report.competitorDecisions) {
    if (!decision.action) {
      continue;
    }
    alerts.push({
      id: `competitor-${report.day}-${decision.storeId}-${decision.action.actionId}`,
      severity: "info",
      title: `競合が${COMPETITOR_ACTION_LABELS[decision.action.actionId]}`,
      detail: decision.action.reason,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "stable",
      severity: "info",
      title: "大きな異常なし",
      detail: `${report.day}日目は、重大な行列・欠品・赤字を検出しなかった。次の需要変化に備えて推移を確認する。`,
    });
  }

  return alerts;
}

export function shouldAutoStop(alerts: readonly DashboardAlert[]): boolean {
  return alerts.some((alert) => alert.severity === "critical");
}
