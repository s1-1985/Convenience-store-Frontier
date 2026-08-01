import type { EconomyBalance, ProductDefinition } from "./types.js";

export function computeSalesFinance(
  soldUnitsByProduct: Record<string, number>,
  products: readonly ProductDefinition[],
): { revenue: number; cogs: number } {
  let revenue = 0;
  let cogs = 0;
  for (const product of products) {
    const units = soldUnitsByProduct[product.id] ?? 0;
    revenue += units * product.retailPrice;
    cogs += units * product.cost;
  }
  return { revenue, cogs };
}

export function computeWasteCost(
  wastedUnitsByProduct: Record<string, number>,
  products: readonly ProductDefinition[],
): number {
  let wasteCost = 0;
  for (const product of products) {
    const units = wastedUnitsByProduct[product.id] ?? 0;
    wasteCost += units * product.cost;
  }
  return wasteCost;
}

export function computeLaborCost(staffCount: number, economy: EconomyBalance): number {
  return staffCount * economy.wagePerStaffPerSlot;
}

export function computeUtilitiesCost(isOpen: boolean, economy: EconomyBalance): number {
  return isOpen ? economy.utilitiesPerSlotOpen : 0;
}

export function computeDeliveryCost(deliveryEventCount: number, economy: EconomyBalance): number {
  return deliveryEventCount * economy.deliveryCostPerEvent;
}
