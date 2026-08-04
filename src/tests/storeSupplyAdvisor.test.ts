import { describe, expect, it } from "vitest";
import { createStoreOperationsEngine } from "../game/storeOperationsEngine.js";
import { recommendSupplyPolicy } from "../game/storeSupplyAdvisor.js";

describe("store supply advisor", () => {
  it("recommends shortage prevention when multiple shelves are running out", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    snapshot.inventories.ready_meal.shelfUnits = 1;
    snapshot.inventories.drinks.shelfUnits = 1;
    snapshot.kpis.stockoutEncounters = 4;

    const recommendation = recommendSupplyPolicy(snapshot);
    expect(recommendation.ordering).toBe("stockout_prevention");
    expect(recommendation.delivery).toBe("ready_to_eat_twice_daily");
  });

  it("recommends lean ordering when the backroom is overloaded", () => {
    const snapshot = createStoreOperationsEngine(1977).getSnapshot();
    for (const category of ["drinks", "snacks", "instant"] as const) {
      const inventory = snapshot.inventories[category];
      inventory.backroomUnits = inventory.shelfCapacity * 3;
    }

    expect(recommendSupplyPolicy(snapshot).ordering).toBe("sell_through");
  });
});
