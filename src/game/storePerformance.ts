import type { StoreOperationsSnapshot } from "./storeOperationsEngine.js";

export interface StorePerformanceSummary {
  grade: "S" | "A" | "B" | "C" | "D";
  conversionRate: number;
  availabilityRate: number;
  serviceRate: number;
  cleanlinessRate: number;
  headline: string;
  nextAction: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function summarizeStorePerformance(snapshot: StoreOperationsSnapshot): StorePerformanceSummary {
  const entered = Math.max(1, snapshot.kpis.enteredCustomers);
  const conversionRate = clamp(snapshot.kpis.transactions / entered);
  const availabilityRate = clamp(1 - snapshot.kpis.stockoutEncounters / entered);
  const serviceRate = clamp(1 - snapshot.kpis.queueAbandonments / entered);
  const cleanlinessRate = clamp(1 - snapshot.litter.length / 8);
  const score = conversionRate * 0.35
    + availabilityRate * 0.28
    + serviceRate * 0.25
    + cleanlinessRate * 0.12;
  const grade = score >= 0.93 ? "S" : score >= 0.84 ? "A" : score >= 0.72 ? "B" : score >= 0.58 ? "C" : "D";

  if (snapshot.kpis.enteredCustomers === 0) {
    return {
      grade: "B",
      conversionRate: 0,
      availabilityRate: 1,
      serviceRate: 1,
      cleanlinessRate,
      headline: "開店前の準備中",
      nextAction: "棚在庫と店員の優先作業を確認しよう。",
    };
  }
  if (availabilityRate < 0.82) {
    return { grade, conversionRate, availabilityRate, serviceRate, cleanlinessRate, headline: "欠品で販売機会を逃しています", nextAction: "発注を欠品防止へ変更し、補充を優先しよう。" };
  }
  if (serviceRate < 0.9 || snapshot.queueCustomerIds.length >= 4) {
    return { grade, conversionRate, availabilityRate, serviceRate, cleanlinessRate, headline: "レジ待ちが営業のボトルネックです", nextAction: "店員のレジ優先度を上げよう。" };
  }
  if (cleanlinessRate < 0.75) {
    return { grade, conversionRate, availabilityRate, serviceRate, cleanlinessRate, headline: "売場の清潔度が低下しています", nextAction: "清掃優先の店員を一人置こう。" };
  }
  return { grade, conversionRate, availabilityRate, serviceRate, cleanlinessRate, headline: "安定した店舗運営です", nextAction: "重点商品を選び、次の売上機会を作ろう。" };
}
