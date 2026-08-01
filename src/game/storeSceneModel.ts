export type StoreZoneId =
  | "entrance"
  | "drinks"
  | "dessert"
  | "ready_meal"
  | "snacks"
  | "instant"
  | "daily_goods"
  | "magazines"
  | "register"
  | "backroom"
  | "waste";

export type CustomerStage = "entering" | "browsing" | "queueing" | "paying" | "leaving";
export type StaffTask = "register" | "replenishment" | "cleaning" | "delivery_receiving" | "admin";

export interface StoreSceneInput {
  day: number;
  slot: number;
  isOpen: boolean;
  queueCustomers: number;
  backlogByTask: Record<StaffTask, number>;
  staffingByTimeBlock: number;
  stockoutUnits: number;
  shelfStockoutUnits: number;
  wasteUnits: number;
  visitsToday: number;
  revenueToday: number;
  profitToday: number;
}

export interface SceneCustomer {
  id: string;
  stage: CustomerStage;
  targetZone: StoreZoneId;
  progress: number;
  variant: number;
  impatient: boolean;
  regular: boolean;
}

export interface SceneStaff {
  id: string;
  task: StaffTask;
  targetZone: StoreZoneId;
  progress: number;
  variant: number;
}

export interface SceneShelfState {
  zoneId: StoreZoneId;
  fillRatio: number;
  warning: "none" | "low" | "empty";
}

export interface StoreSceneState {
  customers: SceneCustomer[];
  staff: SceneStaff[];
  shelves: SceneShelfState[];
  visibleQueueLength: number;
  showWaste: boolean;
  showClosedPassersby: boolean;
  dominantProblem: "none" | "queue" | "stockout" | "backlog" | "waste";
}

const BROWSE_ZONES: StoreZoneId[] = [
  "drinks",
  "dessert",
  "ready_meal",
  "snacks",
  "instant",
  "daily_goods",
  "magazines",
];

const SHELF_ZONES: StoreZoneId[] = [
  "drinks",
  "dessert",
  "ready_meal",
  "snacks",
  "instant",
  "daily_goods",
  "magazines",
];

const TASK_ZONE: Record<StaffTask, StoreZoneId> = {
  register: "register",
  replenishment: "ready_meal",
  cleaning: "entrance",
  delivery_receiving: "backroom",
  admin: "backroom",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashNumber(seed: number): number {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4_294_967_295;
}

function totalBacklog(input: StoreSceneInput): number {
  return Object.values(input.backlogByTask).reduce((sum, value) => sum + value, 0);
}

function deriveCustomerCount(input: StoreSceneInput): number {
  if (!input.isOpen) return 0;
  const base = 3 + Math.round(Math.sqrt(Math.max(0, input.visitsToday)) * 0.45);
  const queueBoost = Math.min(5, Math.ceil(input.queueCustomers));
  return clamp(base + queueBoost, 2, 14);
}

function deriveStage(index: number, count: number, visibleQueueLength: number): CustomerStage {
  if (index >= count - visibleQueueLength) {
    if (index === count - 1 && visibleQueueLength > 0) return "paying";
    return "queueing";
  }
  const phase = index % 7;
  if (phase === 0) return "entering";
  if (phase === 6) return "leaving";
  return "browsing";
}

function deriveDominantProblem(input: StoreSceneInput): StoreSceneState["dominantProblem"] {
  const candidates: Array<[StoreSceneState["dominantProblem"], number]> = [
    ["queue", input.queueCustomers * 3],
    ["stockout", input.stockoutUnits + input.shelfStockoutUnits * 1.4],
    ["backlog", totalBacklog(input) * 0.45],
    ["waste", input.wasteUnits * 1.8],
  ];
  const best = candidates.sort((left, right) => right[1] - left[1])[0];
  return best && best[1] >= 1 ? best[0] : "none";
}

function deriveShelfFill(input: StoreSceneInput, index: number): number {
  const totalShortage = Math.max(0, input.stockoutUnits + input.shelfStockoutUnits);
  const shortagePressure = clamp(totalShortage / 80, 0, 0.92);
  const variation = hashNumber(input.day * 997 + input.slot * 37 + index * 101) * 0.28;
  const readyMealPenalty = index === 2 ? shortagePressure * 0.35 : 0;
  return clamp(0.96 - shortagePressure - readyMealPenalty - variation, 0.04, 1);
}

function warningForFill(fillRatio: number): SceneShelfState["warning"] {
  if (fillRatio <= 0.18) return "empty";
  if (fillRatio <= 0.42) return "low";
  return "none";
}

function rankTasks(input: StoreSceneInput): StaffTask[] {
  const scored = (Object.keys(input.backlogByTask) as StaffTask[]).map((task) => {
    let score = input.backlogByTask[task];
    if (task === "register") score += input.queueCustomers * 8;
    if (task === "replenishment") score += input.shelfStockoutUnits * 1.6 + input.stockoutUnits * 0.4;
    if (task === "cleaning" && input.wasteUnits > 0) score += input.wasteUnits;
    return { task, score };
  });
  return scored.sort((left, right) => right.score - left.score).map((item) => item.task);
}

export function createStoreSceneState(input: StoreSceneInput): StoreSceneState {
  const visibleQueueLength = input.isOpen ? clamp(Math.ceil(input.queueCustomers), 0, 6) : 0;
  const customerCount = deriveCustomerCount(input);
  const customers: SceneCustomer[] = [];

  for (let index = 0; index < customerCount; index += 1) {
    const stage = deriveStage(index, customerCount, visibleQueueLength);
    const random = hashNumber(input.day * 7919 + input.slot * 313 + index * 17);
    customers.push({
      id: `customer-${input.day}-${input.slot}-${index}`,
      stage,
      targetZone:
        stage === "queueing" || stage === "paying"
          ? "register"
          : stage === "entering" || stage === "leaving"
            ? "entrance"
            : BROWSE_ZONES[Math.floor(random * BROWSE_ZONES.length)] ?? "snacks",
      progress: hashNumber(input.slot * 1297 + index * 43),
      variant: Math.floor(random * 8),
      impatient: stage === "queueing" && index >= customerCount - Math.max(1, visibleQueueLength - 2),
      regular: hashNumber(input.day * 53 + index * 199) > 0.78,
    });
  }

  const taskRanking = rankTasks(input);
  const staffCount = clamp(Math.round(input.staffingByTimeBlock), 1, 4);
  const staff: SceneStaff[] = [];
  for (let index = 0; index < staffCount; index += 1) {
    const task = taskRanking[index % taskRanking.length] ?? "register";
    staff.push({
      id: `staff-${index}`,
      task,
      targetZone: TASK_ZONE[task],
      progress: hashNumber(input.day * 223 + input.slot * 19 + index * 61),
      variant: index % 4,
    });
  }

  const shelves = SHELF_ZONES.map((zoneId, index) => {
    const fillRatio = deriveShelfFill(input, index);
    return { zoneId, fillRatio, warning: warningForFill(fillRatio) };
  });

  return {
    customers,
    staff,
    shelves,
    visibleQueueLength,
    showWaste: input.wasteUnits > 0,
    showClosedPassersby: !input.isOpen && input.visitsToday > 0,
    dominantProblem: deriveDominantProblem(input),
  };
}

export function summarizeStoreScene(state: StoreSceneState): {
  browsing: number;
  queueing: number;
  staffByTask: Record<StaffTask, number>;
  emptyShelves: number;
} {
  const staffByTask: Record<StaffTask, number> = {
    register: 0,
    replenishment: 0,
    cleaning: 0,
    delivery_receiving: 0,
    admin: 0,
  };
  for (const member of state.staff) staffByTask[member.task] += 1;
  return {
    browsing: state.customers.filter((customer) => customer.stage === "browsing").length,
    queueing: state.customers.filter(
      (customer) => customer.stage === "queueing" || customer.stage === "paying",
    ).length,
    staffByTask,
    emptyShelves: state.shelves.filter((shelf) => shelf.warning === "empty").length,
  };
}
