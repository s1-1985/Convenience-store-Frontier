export type TimeBlockId = "morning" | "midday" | "afternoon" | "evening";

export interface TimeBlockDefinition {
  id: TimeBlockId;
  startHour: number;
  endHour: number;
}

export interface CategoryDefinition {
  id: string;
  displayName: string;
}

export interface ProductDefinition {
  id: string;
  categoryId: string;
  displayName: string;
  retailPrice: number;
  cost: number;
  shelfLifeSlots: number;
  packageUnits: number;
  targetWeight: number;
  initialStock: number;
}

export type OrderingPolicyId = "sell_through" | "standard" | "stockout_prevention";
export type DeliveryPolicyId = "once_daily" | "ready_to_eat_twice_daily" | "all_categories_twice_daily";

export interface ChoiceWeights {
  hours: number;
  assortment: number;
  price: number;
  cleanliness: number;
  reputation: number;
  distance: number;
}

export interface CohortDefinition {
  id: string;
  displayName: string;
  population: number;
  activityRateByTimeBlock: Record<TimeBlockId, number>;
  categoryPreference: Record<string, number>;
  choiceWeights: ChoiceWeights;
}

export interface DistrictDefinition {
  id: string;
  displayName: string;
  weekdayFactor: number;
  weekendFactor: number;
  rainProbability: number;
  rainDemandMultiplier: number;
}

export interface StoreDefinition {
  id: string;
  displayName: string;
  isPlayerControlled: boolean;
  openingHour: number;
  closingHour: number;
  categoryArea: Record<string, number>;
  staffingByTimeBlock: Record<TimeBlockId, number>;
  priceIndex: number;
  cleanliness: number;
  reputation: number;
  distanceScore: number;
  initialCash: number;
  orderingPolicy: OrderingPolicyId;
  deliveryPolicy: DeliveryPolicyId;
}

export interface EconomyBalance {
  wagePerStaffPerSlot: number;
  utilitiesPerSlotOpen: number;
  otherOptionUtility: number;
  choiceSharpness: number;
  totalShelfAreaPoints: number;
  demandNoiseRange: number;
  safetyStockRatio: number;
  deliveryCostPerEvent: number;
}

export interface ScenarioDefinition {
  dataVersion: string;
  id: string;
  displayName: string;
  totalDays: number;
}

export interface ScenarioBundle {
  scenario: ScenarioDefinition;
  district: DistrictDefinition;
  playerStore: StoreDefinition;
  competitorStores: StoreDefinition[];
  cohorts: CohortDefinition[];
  categories: CategoryDefinition[];
  products: ProductDefinition[];
  timeBlocks: TimeBlockDefinition[];
  economy: EconomyBalance;
}
