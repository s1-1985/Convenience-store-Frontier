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
} from "../simulation/types.js";
import {
  validateCategories,
  validateCohorts,
  validateDistrict,
  validateProducts,
  validateStore,
  validateStoreIds,
} from "../data/validation/validate.js";

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

interface RawStore {
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
}

interface RawCohort {
  id: string;
  display_name: string;
  population: number;
  activity_rate_by_time_block: CohortDefinition["activityRateByTimeBlock"];
  category_preference: Record<string, number>;
  choice_weights: ChoiceWeights;
}

interface RawCategory {
  id: string;
  display_name: string;
}

interface RawProduct {
  id: string;
  category_id: string;
  display_name: string;
  retail_price: number;
  cost: number;
  shelf_life_slots: number;
  package_units: number;
  target_weight: number;
  initial_stock: number;
}

interface RawDistrict {
  id: string;
  display_name: string;
  weekday_factor: number;
  weekend_factor: number;
  rain_probability: number;
  rain_demand_multiplier: number;
}

interface RawTimeBlock {
  id: string;
  start_hour: number;
  end_hour: number;
}

interface RawEconomy {
  wage_per_staff_per_slot: number;
  utilities_per_slot_open: number;
  other_option_utility: number;
  choice_sharpness: number;
  total_shelf_area_points: number;
  demand_noise_range: number;
  safety_stock_ratio: number;
  delivery_cost_per_event: number;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`データ取得に失敗した: ${response.status} ${url.pathname}`);
  }
  return (await response.json()) as T;
}

function mapCategory(raw: RawCategory): CategoryDefinition {
  return { id: raw.id, displayName: raw.display_name };
}

function mapProduct(raw: RawProduct): ProductDefinition {
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

function mapDistrict(raw: RawDistrict): DistrictDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    weekdayFactor: raw.weekday_factor,
    weekendFactor: raw.weekend_factor,
    rainProbability: raw.rain_probability,
    rainDemandMultiplier: raw.rain_demand_multiplier,
  };
}

function mapStore(raw: RawStore): StoreDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    isPlayerControlled: raw.is_player_controlled,
    openingHour: raw.opening_hour,
    closingHour: raw.closing_hour,
    categoryArea: { ...raw.category_area },
    staffingByTimeBlock: { ...raw.staffing_by_time_block },
    priceIndex: raw.price_index,
    cleanliness: raw.cleanliness,
    reputation: raw.reputation,
    distanceScore: raw.distance_score,
    initialCash: raw.initial_cash,
    orderingPolicy: raw.ordering_policy,
    deliveryPolicy: raw.delivery_policy,
  };
}

function mapCohort(raw: RawCohort): CohortDefinition {
  return {
    id: raw.id,
    displayName: raw.display_name,
    population: raw.population,
    activityRateByTimeBlock: { ...raw.activity_rate_by_time_block },
    categoryPreference: { ...raw.category_preference },
    choiceWeights: { ...raw.choice_weights },
  };
}

function mapTimeBlock(raw: RawTimeBlock): TimeBlockDefinition {
  return {
    id: raw.id as TimeBlockDefinition["id"],
    startHour: raw.start_hour,
    endHour: raw.end_hour,
  };
}

function mapEconomy(raw: RawEconomy): EconomyBalance {
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

export async function loadBrowserScenario(
  scenarioPath = "scenarios/vertical_slice_30d.json",
): Promise<ScenarioBundle> {
  const scenarioUrl = new URL(scenarioPath, window.location.href);
  const dataRoot = new URL("../", scenarioUrl);
  const scenarioFile = await fetchJson<ScenarioFile>(scenarioUrl);

  const [
    rawDistrict,
    rawPlayerStore,
    rawCompetitorStores,
    rawCohorts,
    rawCategories,
    rawProducts,
    rawTimeBlocks,
    rawEconomy,
  ] = await Promise.all([
    fetchJson<RawDistrict>(new URL(scenarioFile.district_path, dataRoot)),
    fetchJson<RawStore>(new URL(scenarioFile.player_store_path, dataRoot)),
    Promise.all(
      scenarioFile.competitor_store_paths.map((path) =>
        fetchJson<RawStore>(new URL(path, dataRoot)),
      ),
    ),
    fetchJson<RawCohort[]>(new URL(scenarioFile.cohorts_path, dataRoot)),
    fetchJson<RawCategory[]>(new URL(scenarioFile.categories_path, dataRoot)),
    fetchJson<RawProduct[]>(new URL(scenarioFile.products_path, dataRoot)),
    fetchJson<RawTimeBlock[]>(new URL(scenarioFile.time_blocks_path, dataRoot)),
    fetchJson<RawEconomy>(new URL(scenarioFile.economy_path, dataRoot)),
  ]);

  const scenario: ScenarioDefinition = {
    dataVersion: scenarioFile.data_version,
    id: scenarioFile.id,
    displayName: scenarioFile.display_name,
    totalDays: scenarioFile.total_days,
  };
  const district = mapDistrict(rawDistrict);
  const playerStore = mapStore(rawPlayerStore);
  const competitorStores = rawCompetitorStores.map(mapStore);
  const cohorts = rawCohorts.map(mapCohort);
  const categories = rawCategories.map(mapCategory);
  const products = rawProducts.map(mapProduct);
  const timeBlocks = rawTimeBlocks.map(mapTimeBlock);
  const economy = mapEconomy(rawEconomy);

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
