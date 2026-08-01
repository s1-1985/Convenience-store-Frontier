import { SLOTS_PER_DAY, slotsInTimeBlock, timeBlockForSlot } from "./clock.js";
import { computeCohortPotentialDemand } from "./demand.js";
import { allocateCategoryUnits, allocateProductUnits } from "./purchase.js";
import type { RandomFn } from "./rng.js";
import { computeStoreShares, evaluateStore } from "./storeChoice.js";
import type {
  CategoryDefinition,
  CohortDefinition,
  DeliveryPolicyId,
  DistrictDefinition,
  EconomyBalance,
  OrderingPolicyId,
  ProductDefinition,
  StoreDefinition,
  TimeBlockDefinition,
  TimeBlockId,
} from "./types.js";

export interface InventoryBatch {
  productId: string;
  quantity: number;
  arrivalSlot: number;
  expirySlot: number;
}

export const ORDERING_POLICY_MULTIPLIERS: Record<OrderingPolicyId, number> = {
  sell_through: 0.85,
  standard: 1.0,
  stockout_prevention: 1.2,
};

export function absoluteSlot(day: number, slot: number): number {
  return (day - 1) * SLOTS_PER_DAY + slot;
}

export function createInitialInventory(
  products: readonly ProductDefinition[],
): Record<string, InventoryBatch[]> {
  const inventory: Record<string, InventoryBatch[]> = {};
  for (const product of products) {
    inventory[product.id] =
      product.initialStock > 0
        ? [
            {
              productId: product.id,
              quantity: product.initialStock,
              arrivalSlot: 0,
              expirySlot: product.shelfLifeSlots,
            },
          ]
        : [];
  }
  return inventory;
}

export function availableQuantity(batches: readonly InventoryBatch[]): number {
  return batches.reduce((sum, batch) => sum + batch.quantity, 0);
}

export function expireBatches(
  batches: readonly InventoryBatch[],
  currentAbsoluteSlot: number,
): { remaining: InventoryBatch[]; wastedQuantity: number } {
  let wastedQuantity = 0;
  const remaining: InventoryBatch[] = [];
  for (const batch of batches) {
    if (batch.expirySlot <= currentAbsoluteSlot) {
      wastedQuantity += batch.quantity;
    } else {
      remaining.push(batch);
    }
  }
  return { remaining, wastedQuantity };
}

export function consumeFifo(
  batches: readonly InventoryBatch[],
  desiredQuantity: number,
): { remaining: InventoryBatch[]; soldQuantity: number } {
  let remainingDesired = desiredQuantity;
  const remaining: InventoryBatch[] = [];
  for (const batch of batches) {
    if (remainingDesired <= 0) {
      remaining.push(batch);
      continue;
    }
    const takeQuantity = Math.min(batch.quantity, remainingDesired);
    remainingDesired -= takeQuantity;
    const leftoverQuantity = batch.quantity - takeQuantity;
    if (leftoverQuantity > 0) {
      remaining.push({ ...batch, quantity: leftoverQuantity });
    }
  }
  return { remaining, soldQuantity: desiredQuantity - remainingDesired };
}

export function roundUpToPackage(quantity: number, packageUnits: number): number {
  if (quantity <= 0) {
    return 0;
  }
  return Math.ceil(quantity / packageUnits) * packageUnits;
}

export interface ProductDemandForecast {
  fullDay: number;
  firstHalf: number;
  secondHalf: number;
}

// Uses the same demand/store-choice formulas as the realized simulation, but with
// weather fixed to "clear" and noise fixed to zero, so it diverges from the
// realized outcome — that gap is what drives stockouts and waste.
export function forecastDailyProductDemand(
  stores: readonly StoreDefinition[],
  playerStoreId: string,
  cohorts: readonly CohortDefinition[],
  categories: readonly CategoryDefinition[],
  products: readonly ProductDefinition[],
  timeBlocks: readonly TimeBlockDefinition[],
  district: DistrictDefinition,
  economy: EconomyBalance,
): Record<string, ProductDemandForecast> {
  const noNoiseRng: RandomFn = () => 0.5;
  const referenceDay = 1;
  const halfDaySlot = SLOTS_PER_DAY / 2;

  const slotsPerBlock: Record<TimeBlockId, number> = Object.fromEntries(
    timeBlocks.map((block) => [block.id, slotsInTimeBlock(block)]),
  ) as Record<TimeBlockId, number>;

  const result: Record<string, ProductDemandForecast> = {};
  for (const product of products) {
    result[product.id] = { fullDay: 0, firstHalf: 0, secondHalf: 0 };
  }

  const playerStore = stores.find((store) => store.id === playerStoreId);
  if (!playerStore) {
    return result;
  }

  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const timeBlock = timeBlockForSlot(slot, timeBlocks);
    for (const cohort of cohorts) {
      const potentialDemand = computeCohortPotentialDemand(
        cohort,
        timeBlock,
        slotsPerBlock[timeBlock],
        referenceDay,
        district,
        "clear",
        economy,
        noNoiseRng,
      );
      if (potentialDemand <= 0) {
        continue;
      }

      const evaluations = stores.map((store) => evaluateStore(store, cohort, categories, slot, economy));
      const shares = computeStoreShares(evaluations, economy);
      const playerVisits = potentialDemand * (shares[playerStoreId] ?? 0);
      if (playerVisits <= 0) {
        continue;
      }

      const categoryUnits = allocateCategoryUnits(playerVisits, playerStore, cohort, categories, economy);
      const productUnits = allocateProductUnits(categoryUnits, products);
      for (const [productId, units] of Object.entries(productUnits)) {
        const entry = result[productId];
        if (!entry) {
          continue;
        }
        entry.fullDay += units;
        if (slot < halfDaySlot) {
          entry.firstHalf += units;
        } else {
          entry.secondHalf += units;
        }
      }
    }
  }

  return result;
}

export interface OrderPlan {
  productId: string;
  quantity: number;
  arrivalAbsoluteSlot: number;
}

function isTwiceDailyCategory(deliveryPolicy: DeliveryPolicyId, categoryId: string): boolean {
  if (deliveryPolicy === "all_categories_twice_daily") {
    return true;
  }
  if (deliveryPolicy === "ready_to_eat_twice_daily") {
    return categoryId === "category_ready_to_eat";
  }
  return false;
}

export function planDailyOrders(
  products: readonly ProductDefinition[],
  forecast: Record<string, ProductDemandForecast>,
  inventoryByProduct: Record<string, InventoryBatch[]>,
  orderingPolicy: OrderingPolicyId,
  deliveryPolicy: DeliveryPolicyId,
  economy: EconomyBalance,
  nextDayFirstSlotAbsolute: number,
): OrderPlan[] {
  const multiplier = ORDERING_POLICY_MULTIPLIERS[orderingPolicy];
  const midDaySlotOffset = SLOTS_PER_DAY / 2;
  const plans: OrderPlan[] = [];

  for (const product of products) {
    const productForecast = forecast[product.id] ?? { fullDay: 0, firstHalf: 0, secondHalf: 0 };
    const currentAvailable = availableQuantity(inventoryByProduct[product.id] ?? []);

    if (isTwiceDailyCategory(deliveryPolicy, product.categoryId)) {
      const firstOrder =
        productForecast.firstHalf * multiplier +
        productForecast.firstHalf * economy.safetyStockRatio -
        currentAvailable;
      const roundedFirst = roundUpToPackage(firstOrder, product.packageUnits);
      if (roundedFirst > 0) {
        plans.push({
          productId: product.id,
          quantity: roundedFirst,
          arrivalAbsoluteSlot: nextDayFirstSlotAbsolute,
        });
      }

      const secondOrder =
        productForecast.secondHalf * multiplier + productForecast.secondHalf * economy.safetyStockRatio;
      const roundedSecond = roundUpToPackage(secondOrder, product.packageUnits);
      if (roundedSecond > 0) {
        plans.push({
          productId: product.id,
          quantity: roundedSecond,
          arrivalAbsoluteSlot: nextDayFirstSlotAbsolute + midDaySlotOffset,
        });
      }
    } else {
      const order =
        productForecast.fullDay * multiplier +
        productForecast.fullDay * economy.safetyStockRatio -
        currentAvailable;
      const rounded = roundUpToPackage(order, product.packageUnits);
      if (rounded > 0) {
        plans.push({
          productId: product.id,
          quantity: rounded,
          arrivalAbsoluteSlot: nextDayFirstSlotAbsolute,
        });
      }
    }
  }

  return plans;
}
