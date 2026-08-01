import type { CategoryDefinition, EconomyBalance } from "./types.js";

export interface SlotFinanceResult {
  revenue: number;
  cogs: number;
  laborCost: number;
  utilitiesCost: number;
}

export function computeSalesFinance(
  categoryUnits: Record<string, number>,
  categories: readonly CategoryDefinition[],
): { revenue: number; cogs: number } {
  let revenue = 0;
  let cogs = 0;
  for (const category of categories) {
    const units = categoryUnits[category.id] ?? 0;
    revenue += units * category.avgRetailPrice;
    cogs += units * category.avgCost;
  }
  return { revenue, cogs };
}

export function computeLaborCost(staffCount: number, economy: EconomyBalance): number {
  return staffCount * economy.wagePerStaffPerSlot;
}

export function computeUtilitiesCost(isOpen: boolean, economy: EconomyBalance): number {
  return isOpen ? economy.utilitiesPerSlotOpen : 0;
}
