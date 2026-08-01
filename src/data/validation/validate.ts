import type {
  CategoryDefinition,
  CohortDefinition,
  DistrictDefinition,
  EconomyBalance,
  ProductDefinition,
  StoreDefinition,
} from "../../simulation/types.js";

export class DataValidationError extends Error {}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new DataValidationError(message);
  }
}

export function validateCategories(categories: readonly CategoryDefinition[]): void {
  const seen = new Set<string>();
  for (const category of categories) {
    assert(!seen.has(category.id), `Duplicate category id: ${category.id}`);
    seen.add(category.id);
  }
}

export function validateProducts(
  products: readonly ProductDefinition[],
  categories: readonly CategoryDefinition[],
): void {
  const seen = new Set<string>();
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const product of products) {
    assert(!seen.has(product.id), `Duplicate product id: ${product.id}`);
    seen.add(product.id);
    assert(
      categoryIds.has(product.categoryId),
      `Product ${product.id} references unknown category ${product.categoryId}`,
    );
    assert(product.retailPrice >= 0, `Product ${product.id} has negative retail price`);
    assert(product.cost >= 0, `Product ${product.id} has negative cost`);
    assert(product.shelfLifeSlots >= 1, `Product ${product.id} shelfLifeSlots must be at least 1`);
    assert(product.packageUnits >= 1, `Product ${product.id} packageUnits must be at least 1`);
    assert(product.targetWeight > 0, `Product ${product.id} targetWeight must be positive`);
    assert(product.initialStock >= 0, `Product ${product.id} has negative initialStock`);
  }
}

export function validateDistrict(district: DistrictDefinition): void {
  assert(
    district.rainProbability >= 0 && district.rainProbability <= 1,
    `District ${district.id} rainProbability out of range [0,1]`,
  );
  assert(district.weekdayFactor > 0, `District ${district.id} weekdayFactor must be positive`);
  assert(district.weekendFactor > 0, `District ${district.id} weekendFactor must be positive`);
  assert(district.rainDemandMultiplier > 0, `District ${district.id} rainDemandMultiplier must be positive`);
}

export function validateStore(
  store: StoreDefinition,
  categories: readonly CategoryDefinition[],
  economy: EconomyBalance,
): void {
  assert(
    store.openingHour < store.closingHour,
    `Store ${store.id} openingHour must be before closingHour`,
  );
  assert(
    store.openingHour >= 6 && store.closingHour <= 24,
    `Store ${store.id} hours must fall within [6,24]`,
  );

  const categoryIds = new Set(categories.map((c) => c.id));
  let areaSum = 0;
  for (const [categoryId, area] of Object.entries(store.categoryArea)) {
    assert(categoryIds.has(categoryId), `Store ${store.id} references unknown category ${categoryId}`);
    areaSum += area;
  }
  assert(
    areaSum === economy.totalShelfAreaPoints,
    `Store ${store.id} category area sums to ${areaSum}, expected ${economy.totalShelfAreaPoints}`,
  );

  for (const count of Object.values(store.staffingByTimeBlock)) {
    assert(count >= 1 && count <= 4, `Store ${store.id} staffing count ${count} out of range [1,4]`);
  }
}

export function validateCohorts(
  cohorts: readonly CohortDefinition[],
  categories: readonly CategoryDefinition[],
): void {
  const seen = new Set<string>();
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const cohort of cohorts) {
    assert(!seen.has(cohort.id), `Duplicate cohort id: ${cohort.id}`);
    seen.add(cohort.id);
    assert(cohort.population >= 0, `Cohort ${cohort.id} has negative population`);
    for (const categoryId of Object.keys(cohort.categoryPreference)) {
      assert(
        categoryIds.has(categoryId),
        `Cohort ${cohort.id} references unknown category ${categoryId}`,
      );
    }
  }
}

export function validateStoreIds(stores: readonly StoreDefinition[]): void {
  const seen = new Set<string>();
  for (const store of stores) {
    assert(!seen.has(store.id), `Duplicate store id: ${store.id}`);
    seen.add(store.id);
  }
}
