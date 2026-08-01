import type { CategoryDefinition, CohortDefinition, EconomyBalance, StoreDefinition } from "./types.js";

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
