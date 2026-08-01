import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  CategoryDefinition,
  ChoiceWeights,
  CohortDefinition,
  DeliveryPolicyId,
  DistrictDefinition,
  EconomyBalance,
  OrderingPolicyId,
  ProductDefinition,
  ScenarioBundle,
  ScenarioDefinition,
  StoreDefinition,
  TimeBlockDefinition,
} from "../../simulation/types.js";
import {
  validateCategories,
  validateCohorts,
  validateDistrict,
  validateProducts,
  validateStore,
  validateStoreIds,
} from "../validation/validate.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

interface ScenarioFile {
  data_version: string;
  id: string;
  display_name: string;
  total_days: number;
  district_path: string;
  player_store_path: string;
  competitor_store_paths: string[];
  cohorts_path: string;
  categories_path: string;
  products_path: string;
  time_blocks_path: string;
  economy_path: string;
}

function mapCategory(raw: { id: string; display_name: string }): CategoryDefinition {
  return { id: raw.id, displayName: raw.display_name };
}

function mapProduct(raw: {
  id: string;
  category_id: string;
  display_name: string;
  retail_price: number;
  cost: number;
  shelf_life_slots: number;
  package_units: number;
  target_weight: number;
  initial_stock: number;
}): ProductDefinition {
  return {
    id: raw.id,
    categoryId: raw.category_id,
    displayName: raw.display_name,
    retailPrice: raw.retail_price,
    cost: raw.cost,
    shelfLifeSlots: raw.shelf_life_slots,
    packageUnits: raw.package_units,
    targetWeight: raw.target_weight,
    initialStock: raw.initial_stock,
  };
}

function mapDistrict(raw: {
  id: string;
  display_name: string;
  weekday_factor: number;
  weekend_factor: number;
  rain_probability: number;
  rain_demand_multiplier: number;
}): DistrictDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    weekdayFactor: raw.weekday_factor,
    weekendFactor: raw.weekend_factor,
    rainProbability: raw.rain_probability,
    rainDemandMultiplier: raw.rain_demand_multiplier,
  };
}

function mapStore(raw: {
  id: string;
  display_name: string;
  is_player_controlled: boolean;
  opening_hour: number;
  closing_hour: number;
  category_area: Record<string, number>;
  staffing_by_time_block: StoreDefinition["staffingByTimeBlock"];
  price_index: number;
  cleanliness: number;
  reputation: number;
  distance_score: number;
  initial_cash: number;
  ordering_policy: OrderingPolicyId;
  delivery_policy: DeliveryPolicyId;
}): StoreDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    isPlayerControlled: raw.is_player_controlled,
    openingHour: raw.opening_hour,
    closingHour: raw.closing_hour,
    categoryArea: raw.category_area,
    staffingByTimeBlock: raw.staffing_by_time_block,
    priceIndex: raw.price_index,
    cleanliness: raw.cleanliness,
    reputation: raw.reputation,
    distanceScore: raw.distance_score,
    initialCash: raw.initial_cash,
    orderingPolicy: raw.ordering_policy,
    deliveryPolicy: raw.delivery_policy,
  };
}

function mapCohort(raw: {
  id: string;
  display_name: string;
  population: number;
  activity_rate_by_time_block: CohortDefinition["activityRateByTimeBlock"];
  category_preference: Record<string, number>;
  choice_weights: ChoiceWeights;
}): CohortDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    population: raw.population,
    activityRateByTimeBlock: raw.activity_rate_by_time_block,
    categoryPreference: raw.category_preference,
    choiceWeights: raw.choice_weights,
  };
}

function mapTimeBlock(raw: { id: string; start_hour: number; end_hour: number }): TimeBlockDefinition {
  return { id: raw.id as TimeBlockDefinition["id"], startHour: raw.start_hour, endHour: raw.end_hour };
}

function mapEconomy(raw: {
  wage_per_staff_per_slot: number;
  utilities_per_slot_open: number;
  other_option_utility: number;
  choice_sharpness: number;
  total_shelf_area_points: number;
  demand_noise_range: number;
  safety_stock_ratio: number;
  delivery_cost_per_event: number;
}): EconomyBalance {
  return {
    wagePerStaffPerSlot: raw.wage_per_staff_per_slot,
    utilitiesPerSlotOpen: raw.utilities_per_slot_open,
    otherOptionUtility: raw.other_option_utility,
    choiceSharpness: raw.choice_sharpness,
    totalShelfAreaPoints: raw.total_shelf_area_points,
    demandNoiseRange: raw.demand_noise_range,
    safetyStockRatio: raw.safety_stock_ratio,
    deliveryCostPerEvent: raw.delivery_cost_per_event,
  };
}

export function loadScenario(scenarioPath: string): ScenarioBundle {
  const scenarioFile = readJson<ScenarioFile>(scenarioPath);
  const dataRoot = dirname(dirname(resolve(scenarioPath)));

  const scenario: ScenarioDefinition = {
    dataVersion: scenarioFile.data_version,
    id: scenarioFile.id,
    displayName: scenarioFile.display_name,
    totalDays: scenarioFile.total_days,
  };

  const district = mapDistrict(readJson(resolve(dataRoot, scenarioFile.district_path)));
  const playerStore = mapStore(readJson(resolve(dataRoot, scenarioFile.player_store_path)));
  const competitorStores = scenarioFile.competitor_store_paths.map((path) =>
    mapStore(readJson(resolve(dataRoot, path))),
  );
  const cohorts = readJson<Parameters<typeof mapCohort>[0][]>(
    resolve(dataRoot, scenarioFile.cohorts_path),
  ).map(mapCohort);
  const categories = readJson<Parameters<typeof mapCategory>[0][]>(
    resolve(dataRoot, scenarioFile.categories_path),
  ).map(mapCategory);
  const products = readJson<Parameters<typeof mapProduct>[0][]>(
    resolve(dataRoot, scenarioFile.products_path),
  ).map(mapProduct);
  const timeBlocks = readJson<Parameters<typeof mapTimeBlock>[0][]>(
    resolve(dataRoot, scenarioFile.time_blocks_path),
  ).map(mapTimeBlock);
  const economy = mapEconomy(readJson(resolve(dataRoot, scenarioFile.economy_path)));

  validateCategories(categories);
  validateProducts(products, categories);
  validateDistrict(district);
  validateStoreIds([playerStore, ...competitorStores]);
  validateStore(playerStore, categories, economy);
  for (const store of competitorStores) {
    validateStore(store, categories, economy);
  }
  validateCohorts(cohorts, categories);

  return {
    scenario,
    district,
    playerStore,
    competitorStores,
    cohorts,
    categories,
    products,
    timeBlocks,
    economy,
  };
}
