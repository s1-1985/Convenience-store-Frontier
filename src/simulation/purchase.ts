import type { CategoryDefinition, CohortDefinition, EconomyBalance, ProductDefinition, StoreDefinition } from "./types.js";

export function allocateCategoryUnits(
  visits: number,
  store: StoreDefinition,
  cohort: CohortDefinition,
  categories: readonly CategoryDefinition[],
  economy: EconomyBalance,
): Record<string, number> {
  const weights = categories.map((category) => {
    const areaShare = (store.categoryArea[category.id] ?? 0) / economy.totalShelfAreaPoints;
    const preference = cohort.categoryPreference[category.id] ?? 0;
    return { id: category.id, weight: areaShare * preference };
  });
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const units: Record<string, number> = {};
  if (totalWeight <= 0) {
    return units;
  }
  for (const w of weights) {
    units[w.id] = visits * (w.weight / totalWeight);
  }
  return units;
}

export function allocateProductUnits(
  categoryUnits: Record<string, number>,
  products: readonly ProductDefinition[],
): Record<string, number> {
  const productsByCategory = new Map<string, ProductDefinition[]>();
  for (const product of products) {
    const list = productsByCategory.get(product.categoryId) ?? [];
    list.push(product);
    productsByCategory.set(product.categoryId, list);
  }

  const units: Record<string, number> = {};
  for (const [categoryId, categoryDesired] of Object.entries(categoryUnits)) {
    if (categoryDesired <= 0) {
      continue;
    }
    const categoryProducts = productsByCategory.get(categoryId) ?? [];
    const totalWeight = categoryProducts.reduce((sum, p) => sum + p.targetWeight, 0);
    if (totalWeight <= 0) {
      continue;
    }
    for (const product of categoryProducts) {
      units[product.id] = categoryDesired * (product.targetWeight / totalWeight);
    }
  }
  return units;
}
