export type OperationTaskId =
  | "register"
  | "replenishment"
  | "cleaning"
  | "delivery_receiving"
  | "admin";

export type OperationTaskRecord = Record<OperationTaskId, number>;

export const OPERATION_TASKS: readonly OperationTaskId[] = [
  "register",
  "replenishment",
  "cleaning",
  "delivery_receiving",
  "admin",
];

export const DEFAULT_OPERATION_PRIORITIES: readonly OperationTaskId[] = [
  "register",
  "replenishment",
  "delivery_receiving",
  "cleaning",
  "admin",
];

const WORK_CAPACITY_PER_STAFF_PER_SLOT = 12;
const REGISTER_CUSTOMERS_PER_WORK = 4;
const REPLENISHMENT_UNITS_PER_WORK = 20;
const DELIVERY_UNITS_PER_WORK = 100;
const CLEANING_WORK_PER_OPEN_SLOT = 0.25;
const ADMIN_WORK_AT_DAY_END = 1;
const MAX_QUEUE_WAIT_SLOTS = 2;

interface QueueBatch {
  enteredAbsoluteSlot: number;
  customers: number;
}

export interface OperationSlotInput {
  currentAbsoluteSlot: number;
  customerArrivals: number;
  desiredProductUnits: number;
  deliveryUnits: number;
  staffCount: number;
  isOpen: boolean;
  isLastSlotOfDay: boolean;
  isNight: boolean;
  backroomUnitsAvailable: number;
}

export interface OperationSlotResult {
  salesFulfillmentRatio: number;
  registerServiceRatio: number;
  replenishmentFulfillmentRatio: number;
  workloadAddedByTask: OperationTaskRecord;
  processedByTask: OperationTaskRecord;
  backlogByTask: OperationTaskRecord;
  queueCustomersEnd: number;
  abandonedCustomers: number;
  operationalShelfStockoutUnits: number;
  nightWorkloadAdded: number;
}

export interface StoreOperations {
  processSlot(input: OperationSlotInput): OperationSlotResult;
  setPriorities(priorities: readonly OperationTaskId[]): void;
  getPriorities(): OperationTaskId[];
  getBacklog(): OperationTaskRecord;
  getQueueCustomers(): number;
}

export function emptyOperationTaskRecord(): OperationTaskRecord {
  return {
    register: 0,
    replenishment: 0,
    cleaning: 0,
    delivery_receiving: 0,
    admin: 0,
  };
}

export function validateOperationPriorities(priorities: readonly OperationTaskId[]): void {
  if (priorities.length !== OPERATION_TASKS.length) {
    throw new Error(`Operation priorities must contain ${OPERATION_TASKS.length} tasks`);
  }
  const unique = new Set(priorities);
  if (unique.size !== OPERATION_TASKS.length || OPERATION_TASKS.some((task) => !unique.has(task))) {
    throw new Error("Operation priorities must contain every task exactly once");
  }
}

function sumRecord(record: OperationTaskRecord): number {
  return OPERATION_TASKS.reduce((sum, task) => sum + record[task], 0);
}

export function createStoreOperations(
  initialPriorities: readonly OperationTaskId[] = DEFAULT_OPERATION_PRIORITIES,
): StoreOperations {
  validateOperationPriorities(initialPriorities);
  let priorities = [...initialPriorities];
  const backlog = emptyOperationTaskRecord();
  let queue: QueueBatch[] = [];

  function queueCustomers(): number {
    return queue.reduce((sum, batch) => sum + batch.customers, 0);
  }

  function consumeQueue(customersToServe: number): number {
    let remaining = customersToServe;
    let served = 0;
    const nextQueue: QueueBatch[] = [];

    for (const batch of queue) {
      if (remaining <= 0) {
        nextQueue.push(batch);
        continue;
      }
      const servedFromBatch = Math.min(batch.customers, remaining);
      served += servedFromBatch;
      remaining -= servedFromBatch;
      const left = batch.customers - servedFromBatch;
      if (left > 0) {
        nextQueue.push({ ...batch, customers: left });
      }
    }

    queue = nextQueue;
    return served;
  }

  function abandonExpiredQueue(currentAbsoluteSlot: number): number {
    let abandoned = 0;
    const nextQueue: QueueBatch[] = [];
    for (const batch of queue) {
      if (currentAbsoluteSlot - batch.enteredAbsoluteSlot >= MAX_QUEUE_WAIT_SLOTS) {
        abandoned += batch.customers;
      } else {
        nextQueue.push(batch);
      }
    }
    queue = nextQueue;
    return abandoned;
  }

  function currentBacklog(): OperationTaskRecord {
    return {
      ...backlog,
      register: queueCustomers() / REGISTER_CUSTOMERS_PER_WORK,
    };
  }

  return {
    processSlot(input: OperationSlotInput): OperationSlotResult {
      const workloadAdded = emptyOperationTaskRecord();
      const processed = emptyOperationTaskRecord();
      const oldQueueCustomers = queueCustomers();
      const oldReplenishmentBacklog = backlog.replenishment;

      if (input.customerArrivals > 0) {
        queue.push({
          enteredAbsoluteSlot: input.currentAbsoluteSlot,
          customers: input.customerArrivals,
        });
      }

      workloadAdded.register = input.customerArrivals / REGISTER_CUSTOMERS_PER_WORK;
      workloadAdded.replenishment = input.desiredProductUnits / REPLENISHMENT_UNITS_PER_WORK;
      workloadAdded.cleaning = input.isOpen ? CLEANING_WORK_PER_OPEN_SLOT : 0;
      workloadAdded.delivery_receiving = input.deliveryUnits / DELIVERY_UNITS_PER_WORK;
      workloadAdded.admin = input.isLastSlotOfDay ? ADMIN_WORK_AT_DAY_END : 0;

      backlog.replenishment += workloadAdded.replenishment;
      backlog.cleaning += workloadAdded.cleaning;
      backlog.delivery_receiving += workloadAdded.delivery_receiving;
      backlog.admin += workloadAdded.admin;

      let remainingCapacity = input.isOpen
        ? Math.max(0, input.staffCount) * WORK_CAPACITY_PER_STAFF_PER_SLOT
        : 0;
      let servedCustomers = 0;

      for (const task of priorities) {
        if (remainingCapacity <= 0) {
          break;
        }

        if (task === "register") {
          const requiredWork = queueCustomers() / REGISTER_CUSTOMERS_PER_WORK;
          const processedWork = Math.min(requiredWork, remainingCapacity);
          processed.register += processedWork;
          remainingCapacity -= processedWork;
          servedCustomers += consumeQueue(processedWork * REGISTER_CUSTOMERS_PER_WORK);
          continue;
        }

        const processedWork = Math.min(backlog[task], remainingCapacity);
        backlog[task] -= processedWork;
        processed[task] += processedWork;
        remainingCapacity -= processedWork;
      }

      const servedOldCustomers = Math.min(oldQueueCustomers, servedCustomers);
      const servedCurrentCustomers = Math.max(0, servedCustomers - servedOldCustomers);
      const registerServiceRatio =
        input.customerArrivals > 0
          ? Math.min(1, servedCurrentCustomers / input.customerArrivals)
          : 1;

      const processedCurrentReplenishment = Math.max(
        0,
        processed.replenishment - oldReplenishmentBacklog,
      );
      const replenishmentFulfillmentRatio =
        workloadAdded.replenishment > 0
          ? Math.min(1, processedCurrentReplenishment / workloadAdded.replenishment)
          : 1;

      const abandonedCustomers = abandonExpiredQueue(input.currentAbsoluteSlot);
      const salesFulfillmentRatio = Math.min(
        registerServiceRatio,
        replenishmentFulfillmentRatio,
      );
      const operationalShelfStockoutUnits =
        input.backroomUnitsAvailable > 0
          ? input.desiredProductUnits * (1 - replenishmentFulfillmentRatio)
          : 0;

      return {
        salesFulfillmentRatio,
        registerServiceRatio,
        replenishmentFulfillmentRatio,
        workloadAddedByTask: workloadAdded,
        processedByTask: processed,
        backlogByTask: currentBacklog(),
        queueCustomersEnd: queueCustomers(),
        abandonedCustomers,
        operationalShelfStockoutUnits,
        nightWorkloadAdded: input.isNight ? sumRecord(workloadAdded) : 0,
      };
    },

    setPriorities(nextPriorities: readonly OperationTaskId[]): void {
      validateOperationPriorities(nextPriorities);
      priorities = [...nextPriorities];
    },

    getPriorities(): OperationTaskId[] {
      return [...priorities];
    },

    getBacklog(): OperationTaskRecord {
      return currentBacklog();
    },

    getQueueCustomers(): number {
      return queueCustomers();
    },
  };
}
