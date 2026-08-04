import type {
  StoreDeliveryPolicy,
  StoreOperationsSnapshot,
  StoreOrderingPolicy,
} from "./storeOperationsEngine.js";

export interface StoreSupplyRecommendation {
  ordering: StoreOrderingPolicy;
  delivery: StoreDeliveryPolicy;
  label: string;
  reason: string;
}

export function recommendSupplyPolicy(snapshot: StoreOperationsSnapshot): StoreSupplyRecommendation {
  const inventories = Object.values(snapshot.inventories);
  const emptyOrLow = inventories.filter(
    (inventory) => inventory.shelfUnits / Math.max(1, inventory.shelfCapacity) < 0.25,
  ).length;
  const overstocked = inventories.filter(
    (inventory) => inventory.backroomUnits > inventory.shelfCapacity * 2.5,
  ).length;
  const readyMeal = snapshot.inventories.ready_meal;

  if (snapshot.kpis.stockoutEncounters >= 3 || emptyOrLow >= 2) {
    const lunchPressure = readyMeal.shelfUnits / Math.max(1, readyMeal.shelfCapacity) < 0.3;
    return {
      ordering: "stockout_prevention",
      delivery: lunchPressure ? "ready_to_eat_twice_daily" : "all_categories_twice_daily",
      label: "おすすめ：欠品防止",
      reason: `在庫の少ない棚が${emptyOrLow}か所、欠品遭遇${snapshot.kpis.stockoutEncounters}件です。`,
    };
  }
  if (overstocked >= 3) {
    return {
      ordering: "sell_through",
      delivery: "once_daily",
      label: "おすすめ：売り切り重視",
      reason: `バックヤード過多が${overstocked}カテゴリあります。次回納品を抑えます。`,
    };
  }
  return {
    ordering: "standard",
    delivery: "once_daily",
    label: "おすすめ：標準発注",
    reason: "棚とバックヤードの在庫は安定しています。",
  };
}
