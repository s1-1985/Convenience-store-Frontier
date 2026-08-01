export interface DailyReport {
  day: number;
  weather: "clear" | "rain";
  revenue: number;
  cogs: number;
  laborCost: number;
  utilitiesCost: number;
  wasteCost: number;
  deliveryCost: number;
  profit: number;
  cashEnd: number;
  visitsByStore: Record<string, number>;
  salesUnitsByCategory: Record<string, number>;
  salesUnitsByProduct: Record<string, number>;
  stockoutUnitsByProduct: Record<string, number>;
  wasteUnitsByProduct: Record<string, number>;
}
