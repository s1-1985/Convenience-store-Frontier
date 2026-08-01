import {
  createInitialClock,
  isLastSlotOfDay,
  isWithinHours,
  nextClock,
  slotsInTimeBlock,
  timeBlockForSlot,
  type SimClock,
} from "./clock.js";
import { computeCohortPotentialDemand, rollWeather, type Weather } from "./demand.js";
import {
  computeDeliveryCost,
  computeLaborCost,
  computeSalesFinance,
  computeUtilitiesCost,
  computeWasteCost,
} from "./finance.js";
import {
  absoluteSlot,
  availableQuantity,
  consumeFifo,
  createInitialInventory,
  expireBatches,
  forecastDailyProductDemand,
  planDailyOrders,
  type InventoryBatch,
} from "./inventory.js";
import {
  createStoreOperations,
  emptyOperationTaskRecord,
  OPERATION_TASKS,
  type OperationTaskId,
  type OperationTaskRecord,
} from "./operations.js";
import { allocateCategoryUnits, allocateProductUnits } from "./purchase.js";
import { RandomStreams } from "./rng.js";
import { computeStoreShares, evaluateStore, OTHER_OPTION_ID } from "./storeChoice.js";
import type {
  DeliveryPolicyId,
  OrderingPolicyId,
  ScenarioBundle,
  StoreDefinition,
  TimeBlockId,
} from "./types.js";
import type { DailyReport } from "../reporting/dailyReport.js";

const CATEGORY_AREA_CHANGE_THRESHOLD = 10;
const CATEGORY_AREA_RENOVATION_COST = 50000;
const MIN_STAFFING = 1;
const MAX_STAFFING = 4;

export type PolicyCommand =
  | { type: "set_opening_hours"; openingHour: number; closingHour: number }
  | { type: "set_category_area"; categoryArea: Record<string, number> }
  | { type: "set_staffing"; timeBlock: TimeBlockId; count: number }
  | { type: "set_ordering_policy"; policy: OrderingPolicyId }
  | { type: "set_delivery_policy"; policy: DeliveryPolicyId }
  | { type: "set_task_priorities"; priorities: OperationTaskId[] };

export interface SimulationSnapshot {
  day: number;
  slot: number;
  finished: boolean;
  cash: number;
  playerStore: {
    openingHour: number;
    closingHour: number;
    categoryArea: Record<string, number>;
    staffingByTimeBlock: Record<TimeBlockId, number>;
    orderingPolicy: OrderingPolicyId;
    deliveryPolicy: DeliveryPolicyId;
    taskPriorities: OperationTaskId[];
  };
  operations: {
    queueCustomers: number;
    backlogByTask: OperationTaskRecord;
  };
}

interface DayAccumulator {
  weather: Weather;
  laborCost: number;
  utilitiesCost: number;
  deliveryEventCount: number;
  visitsByStore: Record<string, number>;
  soldUnitsByProduct: Record<string, number>;
  stockoutUnitsByProduct: Record<string, number>;
  wasteUnitsByProduct: Record<string, number>;
  operationWorkloadByTask: OperationTaskRecord;
  operationProcessedByTask: OperationTaskRecord;
  abandonedCustomers: number;
  operationalShelfStockoutUnits: number;
  nightOperationWorkload: number;
}

export interface Simulation {
  getSnapshot(): SimulationSnapshot;
  getDailyReport(day: number): DailyReport | undefined;
  getAllDailyReports(): DailyReport[];
  applyPolicy(command: PolicyCommand): void;
  advanceSlot(): void;
  advanceDay(): void;
  runToEnd(): void;
  isFinished(): boolean;
}

function addAmount(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount;
}

function addOperationRecord(target: OperationTaskRecord, source: OperationTaskRecord): void {
  for (const task of OPERATION_TASKS) {
    target[task] += source[task];
  }
}

function totalInventory(inventoryByProduct: Record<string, InventoryBatch[]>): number {
  return Object.values(inventoryByProduct).reduce(
    (sum, batches) => sum + availableQuantity(batches),
    0,
  );
}

function emptyAccumulator(weather: Weather): DayAccumulator {
  return {
    weather,
    laborCost: 0,
    utilitiesCost: 0,
    deliveryEventCount: 0,
    visitsByStore: {},
    soldUnitsByProduct: {},
    stockoutUnitsByProduct: {},
    wasteUnitsByProduct: {},
    operationWorkloadByTask: emptyOperationTaskRecord(),
    operationProcessedByTask: emptyOperationTaskRecord(),
    abandonedCustomers: 0,
    operationalShelfStockoutUnits: 0,
    nightOperationWorkload: 0,
  };
}

export function createSimulation(scenario: ScenarioBundle, seed: number): Simulation {
  const randomStreams = new RandomStreams(seed);
  let clock: SimClock = createInitialClock();
  let finished = false;
  let cash = scenario.playerStore.initialCash;

  const playerStore: StoreDefinition = {
    ...scenario.playerStore,
    categoryArea: { ...scenario.playerStore.categoryArea },
    staffingByTimeBlock: { ...scenario.playerStore.staffingByTimeBlock },
  };
  const allStores = [playerStore, ...scenario.competitorStores];
  const slotsPerBlock: Record<TimeBlockId, number> = Object.fromEntries(
    scenario.timeBlocks.map((block) => [block.id, slotsInTimeBlock(block)]),
  ) as Record<TimeBlockId, number>;

  const productsById = new Map(scenario.products.map((product) => [product.id, product]));
  const categoryIdByProductId = new Map(scenario.products.map((product) => [product.id, product.categoryId]));

  const inventoryByProduct = createInitialInventory(scenario.products);
  const pendingDeliveries = new Map<
    number,
    { productId: string; quantity: number; arrivalAbsoluteSlot: number }[]
  >();
  const operations = createStoreOperations();

  const dailyReports: DailyReport[] = [];
  let weather: Weather = rollWeather(scenario.district, randomStreams.stream("weather"));
  let accumulator = emptyAccumulator(weather);

  function applyDueDeliveries(currentAbsoluteSlot: number): number {
    const deliveries = pendingDeliveries.get(currentAbsoluteSlot);
    if (!deliveries || deliveries.length === 0) {
      return 0;
    }
    let deliveredUnits = 0;
    for (const plan of deliveries) {
      const product = productsById.get(plan.productId);
      if (!product) {
        continue;
      }
      const batch: InventoryBatch = {
        productId: plan.productId,
        quantity: plan.quantity,
        arrivalSlot: currentAbsoluteSlot,
        expirySlot: currentAbsoluteSlot + product.shelfLifeSlots,
      };
      inventoryByProduct[plan.productId] = [...(inventoryByProduct[plan.productId] ?? []), batch];
      deliveredUnits += plan.quantity;
    }
    accumulator.deliveryEventCount += 1;
    pendingDeliveries.delete(currentAbsoluteSlot);
    return deliveredUnits;
  }

  function expireDueBatches(currentAbsoluteSlot: number): void {
    for (const product of scenario.products) {
      const { remaining, wastedQuantity } = expireBatches(
        inventoryByProduct[product.id] ?? [],
        currentAbsoluteSlot,
      );
      if (wastedQuantity > 0) {
        inventoryByProduct[product.id] = remaining;
        addAmount(accumulator.wasteUnitsByProduct, product.id, wastedQuantity);
      }
    }
  }

  function planNextDayOrders(): void {
    if (clock.day + 1 > scenario.scenario.totalDays) {
      return;
    }
    const forecast = forecastDailyProductDemand(
      allStores,
      playerStore.id,
      scenario.cohorts,
      scenario.categories,
      scenario.products,
      scenario.timeBlocks,
      scenario.district,
      scenario.economy,
    );
    const nextDayFirstSlotAbsolute = absoluteSlot(clock.day + 1, 0);
    const orderPlans = planDailyOrders(
      scenario.products,
      forecast,
      inventoryByProduct,
      playerStore.orderingPolicy,
      playerStore.deliveryPolicy,
      scenario.economy,
      nextDayFirstSlotAbsolute,
    );
    for (const plan of orderPlans) {
      const list = pendingDeliveries.get(plan.arrivalAbsoluteSlot) ?? [];
      list.push(plan);
      pendingDeliveries.set(plan.arrivalAbsoluteSlot, list);
    }
  }

  function processSlot(): void {
    if (finished) {
      throw new Error("Simulation already finished");
    }

    const currentAbsoluteSlot = absoluteSlot(clock.day, clock.slot);
    const deliveredUnits = applyDueDeliveries(currentAbsoluteSlot);
    expireDueBatches(currentAbsoluteSlot);

    const timeBlock = timeBlockForSlot(clock.slot, scenario.timeBlocks);
    const demandRng = randomStreams.stream("demand");
    const desiredProductUnitsThisSlot: Record<string, number> = {};
    let playerVisitsThisSlot = 0;

    for (const cohort of scenario.cohorts) {
      const potentialDemand = computeCohortPotentialDemand(
        cohort,
        timeBlock,
        slotsPerBlock[timeBlock],
        clock.day,
        scenario.district,
        weather,
        scenario.economy,
        demandRng,
      );
      if (potentialDemand <= 0) {
        continue;
      }

      const evaluations = allStores.map((store) =>
        evaluateStore(store, cohort, scenario.categories, clock.slot, scenario.economy),
      );
      const shares = computeStoreShares(evaluations, scenario.economy);

      for (const [storeId, share] of Object.entries(shares)) {
        addAmount(accumulator.visitsByStore, storeId, potentialDemand * share);
      }

      const playerVisits = potentialDemand * (shares[playerStore.id] ?? 0);
      if (playerVisits > 0) {
        playerVisitsThisSlot += playerVisits;
        const categoryUnits = allocateCategoryUnits(
          playerVisits,
          playerStore,
          cohort,
          scenario.categories,
          scenario.economy,
        );
        const desiredProductUnits = allocateProductUnits(categoryUnits, scenario.products);
        for (const [productId, desired] of Object.entries(desiredProductUnits)) {
          addAmount(desiredProductUnitsThisSlot, productId, desired);
        }
      }
    }

    const isOpen = isWithinHours(clock.slot, playerStore.openingHour, playerStore.closingHour);
    const staffCount = playerStore.staffingByTimeBlock[timeBlock];
    const desiredUnitsTotal = Object.values(desiredProductUnitsThisSlot).reduce(
      (sum, units) => sum + units,
      0,
    );
    const dayJustEnded = isLastSlotOfDay(clock);
    const operationResult = operations.processSlot({
      currentAbsoluteSlot,
      customerArrivals: playerVisitsThisSlot,
      desiredProductUnits: desiredUnitsTotal,
      deliveryUnits: deliveredUnits,
      staffCount,
      isOpen,
      isLastSlotOfDay: dayJustEnded,
      isNight: isOpen && timeBlock === "evening",
      backroomUnitsAvailable: totalInventory(inventoryByProduct),
    });

    addOperationRecord(accumulator.operationWorkloadByTask, operationResult.workloadAddedByTask);
    addOperationRecord(accumulator.operationProcessedByTask, operationResult.processedByTask);
    accumulator.abandonedCustomers += operationResult.abandonedCustomers;
    accumulator.operationalShelfStockoutUnits += operationResult.operationalShelfStockoutUnits;
    accumulator.nightOperationWorkload += operationResult.nightWorkloadAdded;

    for (const [productId, desired] of Object.entries(desiredProductUnitsThisSlot)) {
      if (desired <= 0) {
        continue;
      }
      const operationallyFulfilledDesired = desired * operationResult.salesFulfillmentRatio;
      const { remaining, soldQuantity } = consumeFifo(
        inventoryByProduct[productId] ?? [],
        operationallyFulfilledDesired,
      );
      inventoryByProduct[productId] = remaining;
      if (soldQuantity > 0) {
        addAmount(accumulator.soldUnitsByProduct, productId, soldQuantity);
      }
      const shortfall = operationallyFulfilledDesired - soldQuantity;
      if (shortfall > 0) {
        addAmount(accumulator.stockoutUnitsByProduct, productId, shortfall);
      }
    }

    if (isOpen) {
      accumulator.laborCost += computeLaborCost(staffCount, scenario.economy);
    }
    accumulator.utilitiesCost += computeUtilitiesCost(isOpen, scenario.economy);

    if (dayJustEnded) {
      const { revenue, cogs } = computeSalesFinance(accumulator.soldUnitsByProduct, scenario.products);
      const wasteCost = computeWasteCost(accumulator.wasteUnitsByProduct, scenario.products);
      const deliveryCost = computeDeliveryCost(accumulator.deliveryEventCount, scenario.economy);
      const profit =
        revenue - cogs - accumulator.laborCost - accumulator.utilitiesCost - wasteCost - deliveryCost;
      cash += profit;

      const salesUnitsByCategory: Record<string, number> = {};
      for (const [productId, units] of Object.entries(accumulator.soldUnitsByProduct)) {
        const categoryId = categoryIdByProductId.get(productId);
        if (categoryId) {
          addAmount(salesUnitsByCategory, categoryId, units);
        }
      }

      dailyReports.push({
        day: clock.day,
        weather: accumulator.weather,
        revenue,
        cogs,
        laborCost: accumulator.laborCost,
        utilitiesCost: accumulator.utilitiesCost,
        wasteCost,
        deliveryCost,
        profit,
        cashEnd: cash,
        visitsByStore: accumulator.visitsByStore,
        salesUnitsByCategory,
        salesUnitsByProduct: accumulator.soldUnitsByProduct,
        stockoutUnitsByProduct: accumulator.stockoutUnitsByProduct,
        wasteUnitsByProduct: accumulator.wasteUnitsByProduct,
        operationWorkloadByTask: accumulator.operationWorkloadByTask,
        operationProcessedByTask: accumulator.operationProcessedByTask,
        operationBacklogByTask: operations.getBacklog(),
        queueCustomersEnd: operations.getQueueCustomers(),
        abandonedCustomers: accumulator.abandonedCustomers,
        operationalShelfStockoutUnits: accumulator.operationalShelfStockoutUnits,
        backroomInventoryUnitsEnd: totalInventory(inventoryByProduct),
        nightOperationWorkload: accumulator.nightOperationWorkload,
      });

      planNextDayOrders();
    }

    clock = nextClock(clock);

    if (dayJustEnded) {
      if (clock.day > scenario.scenario.totalDays) {
        finished = true;
      } else {
        weather = rollWeather(scenario.district, randomStreams.stream("weather"));
        accumulator = emptyAccumulator(weather);
      }
    }
  }

  return {
    getSnapshot(): SimulationSnapshot {
      return {
        day: clock.day,
        slot: clock.slot,
        finished,
        cash,
        playerStore: {
          openingHour: playerStore.openingHour,
          closingHour: playerStore.closingHour,
          categoryArea: { ...playerStore.categoryArea },
          staffingByTimeBlock: { ...playerStore.staffingByTimeBlock },
          orderingPolicy: playerStore.orderingPolicy,
          deliveryPolicy: playerStore.deliveryPolicy,
          taskPriorities: operations.getPriorities(),
        },
        operations: {
          queueCustomers: operations.getQueueCustomers(),
          backlogByTask: operations.getBacklog(),
        },
      };
    },

    getDailyReport(day: number): DailyReport | undefined {
      return dailyReports.find((r) => r.day === day);
    },

    getAllDailyReports(): DailyReport[] {
      return [...dailyReports];
    },

    applyPolicy(command: PolicyCommand): void {
      switch (command.type) {
        case "set_opening_hours": {
          if (command.openingHour >= command.closingHour) {
            throw new Error("openingHour must be before closingHour");
          }
          if (command.openingHour < 6 || command.closingHour > 24) {
            throw new Error("Store hours must fall within [6,24]");
          }
          playerStore.openingHour = command.openingHour;
          playerStore.closingHour = command.closingHour;
          break;
        }
        case "set_category_area": {
          const newTotal = Object.values(command.categoryArea).reduce((a, b) => a + b, 0);
          if (newTotal !== scenario.economy.totalShelfAreaPoints) {
            throw new Error(
              `Category area must sum to ${scenario.economy.totalShelfAreaPoints}, got ${newTotal}`,
            );
          }
          let totalChange = 0;
          for (const [categoryId, area] of Object.entries(command.categoryArea)) {
            totalChange += Math.abs(area - (playerStore.categoryArea[categoryId] ?? 0));
          }
          if (totalChange > CATEGORY_AREA_CHANGE_THRESHOLD) {
            cash -= CATEGORY_AREA_RENOVATION_COST;
          }
          playerStore.categoryArea = { ...command.categoryArea };
          break;
        }
        case "set_staffing": {
          if (command.count < MIN_STAFFING || command.count > MAX_STAFFING) {
            throw new Error(`Staffing count must be within [${MIN_STAFFING},${MAX_STAFFING}]`);
          }
          playerStore.staffingByTimeBlock[command.timeBlock] = command.count;
          break;
        }
        case "set_ordering_policy": {
          playerStore.orderingPolicy = command.policy;
          break;
        }
        case "set_delivery_policy": {
          playerStore.deliveryPolicy = command.policy;
          break;
        }
        case "set_task_priorities": {
          operations.setPriorities(command.priorities);
          break;
        }
      }
    },

    advanceSlot(): void {
      processSlot();
    },

    advanceDay(): void {
      const startDay = clock.day;
      while (!finished && clock.day === startDay) {
        processSlot();
      }
    },

    runToEnd(): void {
      while (!finished) {
        processSlot();
      }
    },

    isFinished(): boolean {
      return finished;
    },
  };
}

export { OTHER_OPTION_ID };
export type { OperationTaskId } from "./operations.js";
