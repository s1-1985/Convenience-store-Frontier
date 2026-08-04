import type { StoreOperationsSnapshot } from "./storeOperationsEngine.js";

export type StoreObjectiveStatus = "active" | "completed" | "at_risk";

export interface StoreObjective {
  id: "sales" | "queue" | "stockout" | "cleanliness" | "regulars";
  label: string;
  progress: string;
  status: StoreObjectiveStatus;
  advice: string;
}

/**
 * Turns the live simulation into short, readable management goals.  These are
 * deliberately derived from observable store state rather than hidden scores.
 */
export function buildStoreObjectives(snapshot: StoreOperationsSnapshot): StoreObjective[] {
  const hasTraffic = snapshot.kpis.enteredCustomers >= 5;
  const salesTarget = 12;
  const salesComplete = snapshot.kpis.transactions >= salesTarget;
  const queueAtRisk = snapshot.queueCustomerIds.length >= 4 || snapshot.kpis.queueAbandonments > 0;
  const stockoutAtRisk = snapshot.kpis.stockoutEncounters >= 3;
  const dirty = snapshot.litter.length >= 3;

  return [
    {
      id: "sales",
      label: "会計を12件成立",
      progress: `${Math.min(snapshot.kpis.transactions, salesTarget)}/${salesTarget}件`,
      status: salesComplete ? "completed" : "active",
      advice: salesComplete ? "今日の販売目標を達成" : "品切れとレジ待ちを減らそう",
    },
    {
      id: "queue",
      label: "行列を3人以下に維持",
      progress: `現在${snapshot.queueCustomerIds.length}人／最大${snapshot.kpis.maximumQueueLength}人`,
      status: queueAtRisk ? "at_risk" : hasTraffic ? "completed" : "active",
      advice: queueAtRisk ? "人員メニューでレジ担当を増やそう" : "レジは順調",
    },
    {
      id: "stockout",
      label: "欠品遭遇を2件以下に",
      progress: `${snapshot.kpis.stockoutEncounters}件`,
      status: stockoutAtRisk ? "at_risk" : hasTraffic ? "completed" : "active",
      advice: stockoutAtRisk ? "補充担当か発注方針を見直そう" : "売場在庫は安定",
    },
    {
      id: "cleanliness",
      label: "店内のゴミを2個以下に",
      progress: `現在${snapshot.litter.length}個`,
      status: dirty ? "at_risk" : hasTraffic ? "completed" : "active",
      advice: dirty ? "清掃担当を配置しよう" : "清潔な売場を維持",
    },
    {
      id: "regulars",
      label: "常連客の会計を3件成立",
      progress: `${Math.min(snapshot.kpis.regularTransactions, 3)}/3件`,
      status: snapshot.kpis.regularTransactions >= 3 ? "completed" : "active",
      advice: "安定した在庫と素早い会計を続けよう",
    },
  ];
}

export function priorityStoreObjectives(snapshot: StoreOperationsSnapshot, limit = 3): StoreObjective[] {
  const priority: Record<StoreObjectiveStatus, number> = { at_risk: 0, active: 1, completed: 2 };
  return buildStoreObjectives(snapshot)
    .sort((left, right) => priority[left.status] - priority[right.status])
    .slice(0, Math.max(0, limit));
}
