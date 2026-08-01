import { describe, expect, it } from "vitest";
import {
  buildStoreVisualization,
  type StoreVisualizationInput,
} from "../ui/storeVisualization.js";
import type { ScenarioBundle } from "../simulation/types.js";

const scenario: ScenarioBundle = {
  scenario: {
    dataVersion: "test",
    id: "visualization-test",
    displayName: "可視化テスト",
    totalDays: 30,
  },
  district: {
    id: "district",
    displayName: "地区",
    weekdayFactor: 1,
    weekendFactor: 1,
    rainProbability: 0,
    rainDemandMultiplier: 1,
  },
  playerStore: {
    id: "player",
    displayName: "自店",
    isPlayerControlled: true,
    openingHour: 8,
    closingHour: 20,
    categoryArea: {
      category_ready_to_eat: 20,
      category_beverages: 10,
      category_snacks: 10,
      category_processed_food: 10,
      category_daily_goods: 10,
      category_magazines: 10,
    },
    staffingByTimeBlock: { morning: 2, midday: 2, afternoon: 1, evening: 1 },
    priceIndex: 100,
    cleanliness: 80,
    reputation: 50,
    distanceScore: 50,
    initialCash: 1000000,
    orderingPolicy: "standard",
    deliveryPolicy: "once_daily",
  },
  competitorStores: [],
  cohorts: [
    {
      id: "commuter",
      displayName: "通勤会社員",
      population: 400,
      activityRateByTimeBlock: { morning: 0.12, midday: 0.02, afternoon: 0.01, evening: 0.03 },
      categoryPreference: { category_ready_to_eat: 1 },
      choiceWeights: {
        hours: 1,
        assortment: 1,
        price: 1,
        cleanliness: 1,
        reputation: 1,
        distance: 1,
      },
    },
    {
      id: "lunch_worker",
      displayName: "昼休み会社員",
      population: 300,
      activityRateByTimeBlock: { morning: 0.01, midday: 0.18, afternoon: 0.01, evening: 0.01 },
      categoryPreference: { category_ready_to_eat: 1 },
      choiceWeights: {
        hours: 1,
        assortment: 1,
        price: 1,
        cleanliness: 1,
        reputation: 1,
        distance: 1,
      },
    },
  ],
  categories: [
    { id: "category_ready_to_eat", displayName: "即食食品" },
    { id: "category_beverages", displayName: "飲料" },
    { id: "category_snacks", displayName: "菓子" },
    { id: "category_processed_food", displayName: "加工食品" },
    { id: "category_daily_goods", displayName: "日用品" },
    { id: "category_magazines", displayName: "雑誌" },
  ],
  products: [],
  timeBlocks: [
    { id: "morning", startHour: 6, endHour: 10 },
    { id: "midday", startHour: 10, endHour: 14 },
    { id: "afternoon", startHour: 14, endHour: 18 },
    { id: "evening", startHour: 18, endHour: 24 },
  ],
  economy: {
    wagePerStaffPerSlot: 100,
    utilitiesPerSlotOpen: 10,
    otherOptionUtility: 0,
    choiceSharpness: 1,
    totalShelfAreaPoints: 70,
    demandNoiseRange: 0,
    safetyStockRatio: 0,
    deliveryCostPerEvent: 0,
  },
};

function input(overrides: Partial<StoreVisualizationInput> = {}): StoreVisualizationInput {
  return {
    day: 5,
    slot: 20,
    isOpen: true,
    queueCustomers: 0,
    shelfStockoutUnits: 0,
    backroomInventoryUnits: 100,
    workBacklog: 0,
    visitsToday: 60,
    abandonedCustomers: 0,
    wasteCost: 0,
    regionalAdoption: {},
    currentStaff: 2,
    taskPriorities: ["register", "replenishment", "cleaning", "delivery_receiving", "admin"],
    ...overrides,
  };
}

describe("buildStoreVisualization", () => {
  it("レジ行列があるとレジ待ち客とレジ担当を表示する", () => {
    const model = buildStoreVisualization(scenario, input({ queueCustomers: 5.4 }));

    expect(model.queueMarkerCount).toBe(6);
    expect(model.customers.some((customer) => customer.stage === "waiting")).toBe(true);
    expect(model.customers.some((customer) => customer.stage === "checking_clock")).toBe(true);
    expect(model.staff[0]?.activity).toBe("register");
    expect(model.statusText).toContain("レジ待ち");
  });

  it("棚補充遅延があると空棚と商品を探す客を表示する", () => {
    const model = buildStoreVisualization(
      scenario,
      input({ queueCustomers: 0, shelfStockoutUnits: 10, currentStaff: 2 }),
    );

    expect(model.emptyShelfCount).toBe(4);
    expect(model.customers.some((customer) => customer.stage === "searching")).toBe(true);
    expect(model.staff.some((staff) => staff.activity === "replenishment")).toBe(true);
    expect(model.statusText).toContain("空棚");
  });

  it("閉店中に需要があれば店外通過客だけを表示する", () => {
    const model = buildStoreVisualization(
      scenario,
      input({ slot: 4, isOpen: false, currentStaff: 1 }),
    );

    expect(model.showClosedTraffic).toBe(true);
    expect(model.customers.length).toBeGreaterThan(0);
    expect(model.customers.every((customer) => customer.stage === "passing")).toBe(true);
    expect(model.emptyShelfCount).toBe(0);
  });

  it("地域定着度が高い時間帯では常連表示が発生する", () => {
    const model = buildStoreVisualization(
      scenario,
      input({ regionalAdoption: { morning: 1 } }),
    );

    expect(model.customers.some((customer) => customer.regular)).toBe(true);
    expect(model.statusText).toContain("常連客");
  });

  it("同じ状態からは同じ代表顧客と店員を生成する", () => {
    const state = input({
      queueCustomers: 2.5,
      shelfStockoutUnits: 4,
      regionalAdoption: { morning: 0.7 },
      workBacklog: 8,
      wasteCost: 1200,
    });

    expect(buildStoreVisualization(scenario, state)).toEqual(buildStoreVisualization(scenario, state));
  });
});
