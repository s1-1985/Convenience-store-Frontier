import { isWithinHours } from "./clock.js";
import type { CategoryDefinition, CohortDefinition, EconomyBalance, StoreDefinition } from "./types.js";

export const OTHER_OPTION_ID = "other";

export interface StoreEvaluation {
  storeId: string;
  score: number | null;
}

export function evaluateStore(
  store: StoreDefinition,
  cohort: CohortDefinition,
  categories: readonly CategoryDefinition[],
  slot: number,
  economy: EconomyBalance,
  habitScoreBonus = 0,
): StoreEvaluation {
  if (!isWithinHours(slot, store.openingHour, store.closingHour)) {
    return { storeId: store.id, score: null };
  }

  const hoursScore = (store.closingHour - store.openingHour) / (24 - 6);

  let assortmentWeightSum = 0;
  let assortmentScore = 0;
  for (const category of categories) {
    const preference = cohort.categoryPreference[category.id] ?? 0;
    const areaShare = (store.categoryArea[category.id] ?? 0) / economy.totalShelfAreaPoints;
    assortmentScore += areaShare * preference;
    assortmentWeightSum += preference;
  }
  if (assortmentWeightSum > 0) {
    assortmentScore /= assortmentWeightSum;
  }

  const priceScore = store.priceIndex / 100;
  const cleanlinessScore = store.cleanliness / 100;
  const reputationScore = store.reputation / 100;
  const distanceScore = store.distanceScore / 100;

  const weights = cohort.choiceWeights;
  const score =
    weights.hours * hoursScore +
    weights.assortment * assortmentScore +
    weights.price * priceScore +
    weights.cleanliness * cleanlinessScore +
    weights.reputation * reputationScore +
    weights.distance * distanceScore +
    habitScoreBonus;

  return { storeId: store.id, score };
}

export function computeStoreShares(
  evaluations: readonly StoreEvaluation[],
  economy: EconomyBalance,
): Record<string, number> {
  const entries: Array<{ id: string; logit: number }> = evaluations
    .filter((evaluation): evaluation is StoreEvaluation & { score: number } => evaluation.score !== null)
    .map((evaluation) => ({ id: evaluation.storeId, logit: evaluation.score * economy.choiceSharpness }));
  entries.push({ id: OTHER_OPTION_ID, logit: economy.otherOptionUtility * economy.choiceSharpness });

  const maxLogit = Math.max(...entries.map((e) => e.logit));
  const weights = entries.map((e) => ({ id: e.id, weight: Math.exp(e.logit - maxLogit) }));
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const shares: Record<string, number> = {};
  for (const w of weights) {
    shares[w.id] = w.weight / totalWeight;
  }
  return shares;
}
