import type { ScenarioBundle, TimeBlockId } from "../simulation/types.js";

export type CustomerStage =
  | "entering"
  | "browsing"
  | "searching"
  | "waiting"
  | "leaving"
  | "passing"
  | "checking_clock";

export type StaffActivity =
  | "register"
  | "replenishment"
  | "cleaning"
  | "delivery_receiving"
  | "admin";

export interface StoreVisualizationInput {
  day: number;
  slot: number;
  isOpen: boolean;
  queueCustomers: number;
  shelfStockoutUnits: number;
  backroomInventoryUnits: number;
  workBacklog: number;
  visitsToday: number;
  abandonedCustomers: number;
  wasteCost: number;
  regionalAdoption: Partial<Record<TimeBlockId, number>>;
  currentStaff: number;
  taskPriorities: StaffActivity[];
}

export interface RepresentativeCustomer {
  id: string;
  stage: CustomerStage;
  cohortId: string;
  cohortLabel: string;
  regular: boolean;
  dissatisfied: boolean;
  x: number;
  y: number;
  delayMs: number;
}

export interface RepresentativeStaff {
  id: string;
  activity: StaffActivity;
  x: number;
  y: number;
  delayMs: number;
}

export interface StoreVisualizationModel {
  isOpen: boolean;
  timeBlock: TimeBlockId;
  demandPerSlot: number;
  customers: RepresentativeCustomer[];
  staff: RepresentativeStaff[];
  emptyShelfCount: number;
  queueMarkerCount: number;
  showWaste: boolean;
  showClosedTraffic: boolean;
  statusText: string;
}

const STAGE_POSITIONS: Record<CustomerStage, ReadonlyArray<{ x: number; y: number }>> = {
  entering: [
    { x: 12, y: 78 },
    { x: 18, y: 72 },
  ],
  browsing: [
    { x: 34, y: 35 },
    { x: 48, y: 52 },
    { x: 58, y: 30 },
    { x: 42, y: 70 },
  ],
  searching: [
    { x: 39, y: 30 },
    { x: 53, y: 48 },
    { x: 61, y: 66 },
  ],
  waiting: [
    { x: 76, y: 67 },
    { x: 70, y: 72 },
    { x: 64, y: 77 },
    { x: 58, y: 82 },
    { x: 52, y: 87 },
    { x: 46, y: 90 },
  ],
  leaving: [
    { x: 22, y: 88 },
    { x: 16, y: 91 },
  ],
  passing: [
    { x: 12, y: 96 },
    { x: 28, y: 96 },
    { x: 46, y: 96 },
    { x: 64, y: 96 },
    { x: 82, y: 96 },
  ],
  checking_clock: [
    { x: 67, y: 62 },
    { x: 55, y: 72 },
  ],
};

const STAFF_POSITIONS: Record<StaffActivity, ReadonlyArray<{ x: number; y: number }>> = {
  register: [
    { x: 85, y: 61 },
    { x: 89, y: 68 },
  ],
  replenishment: [
    { x: 51, y: 42 },
    { x: 58, y: 65 },
  ],
  cleaning: [
    { x: 35, y: 78 },
    { x: 63, y: 81 },
  ],
  delivery_receiving: [
    { x: 82, y: 24 },
    { x: 75, y: 28 },
  ],
  admin: [
    { x: 91, y: 31 },
    { x: 87, y: 36 },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeBlockForSlot(slot: number): TimeBlockId {
  const hour = 6 + slot / 4;
  if (hour < 10) return "morning";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  return "evening";
}

function slotsForBlock(timeBlock: TimeBlockId): number {
  return timeBlock === "evening" ? 24 : 16;
}

function hashNumber(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function pickPosition(stage: CustomerStage, index: number, seed: number): { x: number; y: number } {
  const positions = STAGE_POSITIONS[stage];
  const base = positions[(index + seed) % positions.length] ?? positions[0] ?? { x: 50, y: 50 };
  const jitterX = ((seed >>> 4) % 5) - 2;
  const jitterY = ((seed >>> 8) % 5) - 2;
  return {
    x: clamp(base.x + jitterX, 5, 94),
    y: clamp(base.y + jitterY, 10, 96),
  };
}

function activityDemandPerSlot(scenario: ScenarioBundle, timeBlock: TimeBlockId): number {
  return scenario.cohorts.reduce((sum, cohort) => {
    const blockDemand = cohort.population * (cohort.activityRateByTimeBlock[timeBlock] ?? 0);
    return sum + blockDemand / slotsForBlock(timeBlock);
  }, 0);
}

function weightedCohorts(scenario: ScenarioBundle, timeBlock: TimeBlockId): Array<{
  id: string;
  label: string;
  weight: number;
}> {
  const weighted = scenario.cohorts
    .map((cohort) => ({
      id: cohort.id,
      label: cohort.displayName,
      weight: cohort.population * (cohort.activityRateByTimeBlock[timeBlock] ?? 0),
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  return weighted.length > 0 ? weighted : [{ id: "customer", label: "買い物客", weight: 1 }];
}

function cohortForIndex(
  cohorts: ReadonlyArray<{ id: string; label: string; weight: number }>,
  index: number,
  seed: number,
): { id: string; label: string } {
  const total = cohorts.reduce((sum, cohort) => sum + cohort.weight, 0);
  let cursor = total > 0 ? (seed % 1000) / 1000 * total : 0;
  cursor += index * Math.max(1, total / Math.max(1, cohorts.length));
  cursor %= Math.max(1, total);
  for (const cohort of cohorts) {
    if (cursor <= cohort.weight) {
      return cohort;
    }
    cursor -= cohort.weight;
  }
  return cohorts[0] ?? { id: "customer", label: "買い物客" };
}

function buildStages(input: StoreVisualizationInput, customerCount: number): CustomerStage[] {
  if (!input.isOpen) {
    return Array.from({ length: customerCount }, () => "passing" as const);
  }

  const stages: CustomerStage[] = [];
  const queueRepresentatives = clamp(Math.ceil(input.queueCustomers), 0, Math.min(6, customerCount));
  const searchingRepresentatives = clamp(
    Math.ceil(input.shelfStockoutUnits / 4),
    0,
    Math.min(3, customerCount - queueRepresentatives),
  );

  for (let index = 0; index < queueRepresentatives; index += 1) {
    stages.push(index === queueRepresentatives - 1 && input.queueCustomers >= 4 ? "checking_clock" : "waiting");
  }
  for (let index = 0; index < searchingRepresentatives; index += 1) {
    stages.push("searching");
  }

  const cycle: CustomerStage[] = ["entering", "browsing", "browsing", "leaving"];
  while (stages.length < customerCount) {
    stages.push(cycle[stages.length % cycle.length] ?? "browsing");
  }
  return stages;
}

function selectStaffActivities(input: StoreVisualizationInput): StaffActivity[] {
  const activities: StaffActivity[] = [];
  if (input.queueCustomers > 0) activities.push("register");
  if (input.shelfStockoutUnits > 0) activities.push("replenishment");
  if (input.wasteCost > 0 && input.workBacklog > 0) activities.push("cleaning");
  for (const task of input.taskPriorities) {
    if (!activities.includes(task)) activities.push(task);
  }
  return activities.slice(0, clamp(input.currentStaff, 1, 4));
}

export function buildStoreVisualization(
  scenario: ScenarioBundle,
  input: StoreVisualizationInput,
): StoreVisualizationModel {
  const timeBlock = timeBlockForSlot(input.slot);
  const adoption = clamp(input.regionalAdoption[timeBlock] ?? 0, 0, 1);
  const baseDemand = activityDemandPerSlot(scenario, timeBlock);
  const demandPerSlot = baseDemand * (1 + adoption * 0.3);
  const closedTraffic = !input.isOpen && demandPerSlot >= 0.25;

  const demandRepresentatives = clamp(Math.ceil(demandPerSlot * 1.5), 1, 8);
  const issueRepresentatives = input.isOpen
    ? clamp(Math.ceil(input.queueCustomers) + Math.ceil(input.shelfStockoutUnits / 5), 0, 7)
    : 0;
  const customerCount = input.isOpen
    ? clamp(Math.max(demandRepresentatives, issueRepresentatives), 1, 12)
    : closedTraffic
      ? clamp(Math.ceil(demandPerSlot), 1, 5)
      : 0;

  const stages = buildStages(input, customerCount);
  const cohorts = weightedCohorts(scenario, timeBlock);
  const customers = stages.map((stage, index) => {
    const seed = hashNumber(input.day, input.slot, index, stage);
    const cohort = cohortForIndex(cohorts, index, seed);
    const regularThreshold = Math.floor(adoption * 1000);
    const position = pickPosition(stage, index, seed);
    return {
      id: `customer-${input.day}-${input.slot}-${index}`,
      stage,
      cohortId: cohort.id,
      cohortLabel: cohort.label,
      regular: seed % 1000 < regularThreshold,
      dissatisfied:
        stage === "searching" ||
        stage === "checking_clock" ||
        (stage === "leaving" && input.abandonedCustomers > 0),
      x: position.x,
      y: position.y,
      delayMs: (seed % 8) * 90,
    } satisfies RepresentativeCustomer;
  });

  const staffActivities = selectStaffActivities(input);
  const staff = staffActivities.map((activity, index) => {
    const seed = hashNumber(input.day, input.slot, activity, index);
    const positions = STAFF_POSITIONS[activity];
    const position = positions[(index + seed) % positions.length] ?? positions[0] ?? { x: 80, y: 50 };
    return {
      id: `staff-${input.day}-${input.slot}-${index}`,
      activity,
      x: position.x,
      y: position.y,
      delayMs: (seed % 6) * 100,
    } satisfies RepresentativeStaff;
  });

  const emptyShelfCount = input.isOpen
    ? clamp(Math.ceil(input.shelfStockoutUnits / 3), 0, 4)
    : 0;
  const queueMarkerCount = input.isOpen
    ? clamp(Math.ceil(input.queueCustomers), 0, 6)
    : 0;

  let statusText = "店内は落ち着いている";
  if (!input.isOpen && closedTraffic) statusText = "閉店中も店の前を買い物客が通過している";
  else if (!input.isOpen) statusText = "閉店中";
  else if (queueMarkerCount >= 4) statusText = "レジ待ちが長く、時計を見る客がいる";
  else if (emptyShelfCount > 0) statusText = "空棚の前で商品を探す客がいる";
  else if (adoption >= 0.6) statusText = "常連客が日常的に来店している";

  return {
    isOpen: input.isOpen,
    timeBlock,
    demandPerSlot,
    customers,
    staff,
    emptyShelfCount,
    queueMarkerCount,
    showWaste: input.wasteCost > 0,
    showClosedTraffic: closedTraffic,
    statusText,
  };
}
