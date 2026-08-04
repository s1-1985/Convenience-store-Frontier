import type { StoreOperationsSnapshot } from "./storeOperationsEngine.js";

export type StoreIncidentSeverity = "warning" | "critical";

export interface StoreIncident {
  id: "queue" | "stockout" | "cleanliness" | "lost_sales";
  severity: StoreIncidentSeverity;
  title: string;
  detail: string;
}

export function detectStoreIncidents(snapshot: StoreOperationsSnapshot): StoreIncident[] {
  const incidents: StoreIncident[] = [];
  const queue = snapshot.queueCustomerIds.length;
  if (queue >= 4) {
    incidents.push({
      id: "queue",
      severity: queue >= 8 || snapshot.kpis.queueAbandonments >= 3 ? "critical" : "warning",
      title: "レジ行列",
      detail: `${queue}人待ち。レジ優先の店員を増やしてください。`,
    });
  }
  if (snapshot.kpis.stockoutEncounters >= 3) {
    incidents.push({
      id: "stockout",
      severity: snapshot.kpis.stockoutEncounters >= 7 ? "critical" : "warning",
      title: "欠品が増加",
      detail: `${snapshot.kpis.stockoutEncounters}件。補充と発注方針を確認してください。`,
    });
  }
  if (snapshot.litter.length >= 3) {
    incidents.push({
      id: "cleanliness",
      severity: snapshot.litter.length >= 6 ? "critical" : "warning",
      title: "店内が汚れています",
      detail: `ゴミ${snapshot.litter.length}個。清掃を優先してください。`,
    });
  }
  const lostSales = snapshot.kpis.noPurchaseExits + snapshot.kpis.queueAbandonments;
  if (lostSales >= 5) {
    incidents.push({
      id: "lost_sales",
      severity: lostSales >= 10 ? "critical" : "warning",
      title: "販売機会の損失",
      detail: `${lostSales}人が購入せず退店しました。`,
    });
  }
  return incidents.sort((left, right) => Number(right.severity === "critical") - Number(left.severity === "critical"));
}
