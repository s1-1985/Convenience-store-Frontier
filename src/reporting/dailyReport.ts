import type { OperationTaskRecord } from "../simulation/operations.js";
import type { HabitId, HabitMetricRecord } from "../simulation/habits.js";

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
  operationWorkloadByTask: OperationTaskRecord;
  operationProcessedByTask: OperationTaskRecord;
  operationBacklogByTask: OperationTaskRecord;
  queueCustomersEnd: number;
  abandonedCustomers: number;
  operationalShelfStockoutUnits: number;
  backroomInventoryUnitsEnd: number;
  nightOperationWorkload: number;
  habitStatesByCohort: Record<string, HabitMetricRecord>;
  habitRegionalAdoptionByHabit: Record<HabitId, number>;
  habitPlayerContributionByHabit: Record<HabitId, number>;
  habitDailyPotentialDemandByHabit: Record<HabitId, number>;
  habitDailyPlayerSuccessfulVisitsByHabit: Record<HabitId, number>;
  habitDailyCompetitorSuccessfulVisitsByHabit: Record<HabitId, number>;
  habitualDiversionsToCompetitor: number;
}
