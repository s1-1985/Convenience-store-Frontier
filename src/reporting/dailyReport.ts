export interface DailyReport {
  day: number;
  weather: "clear" | "rain";
  revenue: number;
  cogs: number;
  laborCost: number;
  utilitiesCost: number;
  profit: number;
  cashEnd: number;
  visitsByStore: Record<string, number>;
  salesUnitsByCategory: Record<string, number>;
}
