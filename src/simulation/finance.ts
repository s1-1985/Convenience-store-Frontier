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

// PS1版「ザ・コンビニ」の月次締め8倍補正(design/ps1-reference/algorithms.md §6.2)。
// 原作は日々の取引で資金を1倍反映した上で、月末にその月の補正前利益をさらに7倍
// 上乗せする(合計8倍)。本プロジェクトは取引単位ではなく日単位でcashへprofitを
// 反映しているため、「1倍分」は既存のcash += profitがこれに相当し、ここでは
// 月末に追加する7倍分のボーナスだけを返す(ADR-0008/0009: 原作の数値をそのまま
// 移植し、独自に再スケーリングしない)。
export function computeMonthlyProfitCorrectionBonus(monthProfitBeforeCorrection: number): number {
  return monthProfitBeforeCorrection * 7;
}
