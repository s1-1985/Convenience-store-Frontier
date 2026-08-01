export type TimeBlockId = "morning" | "midday" | "afternoon" | "evening";

export interface TimeBlockDefinition {
  id: TimeBlockId;
  startHour: number;
  endHour: number;
}

export interface CategoryDefinition {
  id: string;
  displayName: string;
  avgRetailPrice: number;
  avgCost: number;
}

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
}

export interface EconomyBalance {
  wagePerStaffPerSlot: number;
  utilitiesPerSlotOpen: number;
  otherOptionUtility: number;
  choiceSharpness: number;
  totalShelfAreaPoints: number;
  demandNoiseRange: number;
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
  timeBlocks: TimeBlockDefinition[];
  economy: EconomyBalance;
}
