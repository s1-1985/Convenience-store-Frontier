export type StoreCategoryId =
  | "drinks"
  | "dessert"
  | "ready_meal"
  | "snacks"
  | "instant"
  | "daily_goods"
  | "magazines";

export type StoreStaffTask = "register" | "replenishment" | "cleaning";
// frozen_case/hot_case are temperature-zone fixture kinds (see docs/store-fixture-zones.md).
// No StoreCategoryId targets them yet, so no fixture of these kinds exists in
// createDefaultStoreLayout or the layout editor's fixture catalog today; adding one
// awaits a game-design decision on the frozen/hot product categories themselves.
export type FixtureKind =
  | "shelf"
  | "cold_case"
  | "frozen_case"
  | "hot_case"
  | "register"
  | "backroom"
  | "entrance"
  | "waste";

export interface TilePoint {
  x: number;
  y: number;
}

export interface StoreFixture {
  id: string;
  kind: FixtureKind;
  categoryId?: StoreCategoryId;
  tiles: TilePoint[];
  customerServicePoints: TilePoint[];
  staffServicePoints: TilePoint[];
}

export interface StoreLayout {
  width: number;
  height: number;
  entranceTile: TilePoint;
  exitTile: TilePoint;
  cashierTile: TilePoint;
  backroomTile: TilePoint;
  queueTiles: TilePoint[];
  fixtures: StoreFixture[];
}

export interface ShelfInventoryState {
  categoryId: StoreCategoryId;
  shelfUnits: number;
  shelfCapacity: number;
  backroomUnits: number;
  price: number;
}

export type CustomerState =
  | "walking_to_shelf"
  | "browsing"
  | "walking_to_queue"
  | "queueing"
  | "paying"
  | "leaving"
  | "gone";

export interface StoreCustomerAgent {
  id: string;
  x: number;
  y: number;
  state: CustomerState;
  path: TilePoint[];
  wishList: StoreCategoryId[];
  attemptedCategories: StoreCategoryId[];
  targetCategory?: StoreCategoryId;
  basketUnits: number;
  basketValue: number;
  browseRemainingSeconds: number;
  patienceRemainingSeconds: number;
  regular: boolean;
  variant: number;
  reason?: "completed" | "stockout" | "price" | "queue_abandonment" | "unreachable";
}

export type StaffState =
  | "idle"
  | "walking_to_register"
  | "register_ready"
  | "walking_to_backroom"
  | "walking_to_shelf"
  | "replenishing"
  | "walking_to_litter"
  | "cleaning";

export interface StoreStaffAgent {
  id: string;
  x: number;
  y: number;
  task: StoreStaffTask;
  /** Preferred work. The active task falls back to other pending work. */
  priorityTask?: StoreStaffTask;
  state: StaffState;
  path: TilePoint[];
  targetCategory?: StoreCategoryId;
  carryUnits: number;
  workRemainingSeconds: number;
  variant: number;
}

export interface StoreLitter {
  id: string;
  x: number;
  y: number;
}

export interface StoreDayKpis {
  enteredCustomers: number;
  transactions: number;
  unitsSold: number;
  revenue: number;
  stockoutEncounters: number;
  priceRefusals: number;
  noPurchaseExits: number;
  queueAbandonments: number;
  maximumQueueLength: number;
  replenishedUnits: number;
  litterCleaned: number;
  regularVisits: number;
  regularTransactions: number;
}

export interface StoreDailyResult {
  day: number;
  enteredCustomers: number;
  transactions: number;
  revenue: number;
  stockoutEncounters: number;
  queueAbandonments: number;
  maximumQueueLength: number;
  serviceTrust: number;
  regularTransactions: number;
}

export interface StoreStaffAssignments {
  register: number;
  replenishment: number;
  cleaning: number;
}

/**
 * One arriving-customer archetype pool: its own shopping-category weights, the sprite
 * rows (see data/assets/store/customers-manifest.json) that represent it visually, and
 * its relative likelihood of being the pool an arriving customer is drawn from.
 */
export interface CustomerArchetypePool {
  categoryWeights: Record<StoreCategoryId, number>;
  archetypeRows: number[];
  weight: number;
}

export interface StoreEngineContext {
  isOpen: boolean;
  hour: number;
  arrivalRatePerMinute: number;
  categoryWeights: Record<StoreCategoryId, number>;
  requestedStaffCount: number;
  /**
   * Optional cohort-derived archetype pools for the current time block. When present,
   * each arriving customer is drawn from a weighted pool instead of the flat
   * `categoryWeights` and a uniform sprite row, so shopping behavior and appearance
   * probability follow the actual customer cohorts. Absent (e.g. before scenario data
   * has loaded) falls back to the flat behavior.
   */
  customerArchetypePools?: CustomerArchetypePool[];
  /**
   * Sim-minutes that elapsed since the previous advance() call, as tracked from the
   * real Simulation's day/hour/minute (see storeGameRuntime.ts's simMinutesElapsedThisFrame()).
   * arrivalRatePerMinute is expressed per sim-minute, but deltaSeconds is real
   * wall-clock time used for movement/checkout animation pacing — those two clocks run
   * at very different rates once the real Simulation's clock is sped up or fast-forwarded,
   * so spawning needs its own sim-time basis instead of reusing deltaSeconds. When absent
   * (e.g. existing tests that construct a context directly), spawning falls back to
   * treating deltaSeconds as if it were sim-seconds, matching the pre-existing behavior.
   */
  simMinutesElapsed?: number;
}

export interface StoreOperationsSnapshot {
  day: number;
  elapsedSeconds: number;
  customers: StoreCustomerAgent[];
  staff: StoreStaffAgent[];
  inventories: Record<StoreCategoryId, ShelfInventoryState>;
  queueCustomerIds: string[];
  litter: StoreLitter[];
  kpis: StoreDayKpis;
  assignments: StoreStaffAssignments;
  checkoutProgressSeconds: number;
  merchandisingFocus?: StoreCategoryId;
  dailyHistory: StoreDailyResult[];
  serviceTrust: number;
  cash: number;
  categoryTiers: Record<StoreCategoryId, number>;
  daysSincePolicyChange: number;
  unsyncedCapacityInvestment: number;
}

export interface SerializedStoreOperations extends StoreOperationsSnapshot {
  version: 1;
  rngState: number;
  nextCustomerNumber: number;
  nextLitterNumber: number;
  spawnAccumulator: number;
  orderingPolicy?: StoreOrderingPolicy;
  deliveryPolicy?: StoreDeliveryPolicy;
  secondDeliveryCompletedDay?: number;
}

export type StoreOrderingPolicy = "sell_through" | "standard" | "stockout_prevention";
export type StoreDeliveryPolicy =
  | "once_daily"
  | "ready_to_eat_twice_daily"
  | "all_categories_twice_daily";

export interface StoreOperationsEngine {
  advance(deltaSeconds: number, context: StoreEngineContext): void;
  /**
   * Starts a new day. When `realCash` is given (the authoritative cash from the
   * shared numeric Simulation, see src/ui/gameSession.ts), it replaces this engine's
   * own approximated day-end profit calculation so the displayed and
   * capacity-investment-gating cash stays reconciled with the real economy at every
   * day boundary. Omit it (e.g. in tests, or before the real session has loaded) to
   * keep the old self-contained approximation.
   *
   * `realStockoutSeverityByCategory`, when given, is the per-category real stockout
   * severity (0..1 share of real demand lost to stockout on the shared numeric
   * Simulation's most recently completed day, see storeGameRuntime.ts's
   * realStockoutSeverityByCategory()) that biases this engine's own next-day delivery
   * quantities downward for categories running short in the real economy. Omit it to
   * leave delivery unaffected, same as a severity of 0 everywhere.
   */
  beginDay(
    day: number,
    realCash?: number,
    realStockoutSeverityByCategory?: Partial<Record<StoreCategoryId, number>>,
  ): void;
  /**
   * Reconciles this engine's cash against the authoritative real Simulation's cash
   * immediately, without waiting for the next beginDay() transition. Needed because
   * beginDay only fires once the visual clock's day actually changes, which does not
   * happen during day 1 of a fresh game/reset — leaving this engine's own
   * hard-coded starting cash on screen (and gating capacity-investment affordability)
   * until day 2 otherwise. Like beginDay, nets out unsyncedCapacityInvestment.
   */
  setCash(realCash: number): void;
  setStaffAssignments(assignments: StoreStaffAssignments): void;
  setSupplyPolicy(ordering: StoreOrderingPolicy, delivery: StoreDeliveryPolicy): void;
  setMerchandisingFocus(category?: StoreCategoryId): void;
  setCategoryPrice(category: StoreCategoryId, price: number): void;
  investInCategoryCapacity(category: StoreCategoryId): { ok: boolean; message: string };
  swapFixtureCategories(fixtureIdA: string, fixtureIdB: string): { ok: boolean; message: string };
  getSnapshot(): StoreOperationsSnapshot;
  getLayout(): StoreLayout;
  serialize(): SerializedStoreOperations;
}

const CATEGORY_IDS: StoreCategoryId[] = [
  "drinks",
  "dessert",
  "ready_meal",
  "snacks",
  "instant",
  "daily_goods",
  "magazines",
];

const CATEGORY_DEFAULTS: Record<StoreCategoryId, Omit<ShelfInventoryState, "categoryId">> = {
  drinks: { shelfUnits: 20, shelfCapacity: 24, backroomUnits: 52, price: 150 },
  dessert: { shelfUnits: 12, shelfCapacity: 16, backroomUnits: 28, price: 240 },
  ready_meal: { shelfUnits: 16, shelfCapacity: 20, backroomUnits: 42, price: 520 },
  snacks: { shelfUnits: 24, shelfCapacity: 28, backroomUnits: 50, price: 170 },
  instant: { shelfUnits: 14, shelfCapacity: 18, backroomUnits: 38, price: 230 },
  daily_goods: { shelfUnits: 12, shelfCapacity: 16, backroomUnits: 30, price: 420 },
  magazines: { shelfUnits: 9, shelfCapacity: 12, backroomUnits: 18, price: 490 },
};

// Sprite row count in data/assets/store/customers-manifest.json. Used as the fallback
// range when no cohort-derived archetype pool is available for the current context.
const CUSTOMER_VISUAL_ROW_COUNT = 24;

// Maximum fraction by which a category's delivered backroom quantity is cut when the
// shared real Simulation reports that category as 100% stockout-severe (see
// deliverStock()). Kept well short of 1 so a real stockout never fully starves the
// canvas's own delivery — just biases it toward running out sooner, same direction the
// real economy is already trending.
const STOCKOUT_SEVERITY_DELIVERY_PENALTY = 0.55;

export function categoryPriceRange(category: StoreCategoryId): { min: number; max: number } {
  const basePrice = CATEGORY_DEFAULTS[category].price;
  return {
    min: Math.ceil(basePrice * 0.7 / 10) * 10,
    max: Math.floor(basePrice * 1.5 / 10) * 10,
  };
}

const INITIAL_CASH = 300_000;
// No per-unit cost tracking exists yet in this engine (only gross revenue),
// so day-end profit is approximated from revenue alone.
const ASSUMED_COST_RATIO = 0.6;
const DAILY_OPERATING_COST = 8_000;
const SHELF_TIER_CAPACITY_BONUS = 6;
const SHELF_TIER_COSTS = [40_000, 90_000, 160_000];
const MAX_SHELF_TIER = SHELF_TIER_COSTS.length;

export interface NextCapacityInvestment {
  cost: number;
  capacityBonus: number;
}

export function nextCapacityInvestment(tier: number): NextCapacityInvestment | undefined {
  if (tier >= MAX_SHELF_TIER) return undefined;
  return { cost: SHELF_TIER_COSTS[tier]!, capacityBonus: SHELF_TIER_CAPACITY_BONUS };
}

export function maxShelfTier(): number {
  return MAX_SHELF_TIER;
}

const CUSTOMER_MOVE_SPEED = 3.2;
const STAFF_MOVE_SPEED = 3.8;
const MAX_VISIBLE_CUSTOMERS = 28;
const REPLENISH_BATCH_UNITS = 8;
const BASE_CHECKOUT_SECONDS = 1.7;
const CHECKOUT_SECONDS_PER_ITEM = 0.55;

function point(x: number, y: number): TilePoint {
  return { x, y };
}

function rectangleTiles(x: number, y: number, width: number, height: number): TilePoint[] {
  const result: TilePoint[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      result.push(point(x + column, y + row));
    }
  }
  return result;
}

export function createDefaultStoreLayout(): StoreLayout {
  return {
    width: 32,
    height: 16,
    entranceTile: point(4, 14),
    exitTile: point(4, 14),
    cashierTile: point(28, 11),
    backroomTile: point(5, 2),
    queueTiles: [
      point(24, 10),
      point(23, 10),
      point(22, 10),
      point(21, 10),
      point(20, 10),
      point(19, 10),
      point(18, 10),
      point(17, 10),
    ],
    fixtures: [
      {
        id: "backroom",
        kind: "backroom",
        tiles: rectangleTiles(1, 1, 4, 3),
        customerServicePoints: [],
        staffServicePoints: [point(5, 2)],
      },
      {
        id: "drinks",
        kind: "cold_case",
        categoryId: "drinks",
        tiles: rectangleTiles(7, 1, 4, 2),
        customerServicePoints: [point(7, 3), point(8, 3), point(9, 3), point(10, 3)],
        staffServicePoints: [point(7, 3), point(10, 3)],
      },
      {
        id: "dessert",
        kind: "cold_case",
        categoryId: "dessert",
        tiles: rectangleTiles(12, 1, 4, 2),
        customerServicePoints: [point(12, 3), point(13, 3), point(14, 3), point(15, 3)],
        staffServicePoints: [point(12, 3), point(15, 3)],
      },
      {
        id: "ready-meal",
        kind: "cold_case",
        categoryId: "ready_meal",
        tiles: rectangleTiles(17, 1, 6, 2),
        customerServicePoints: [point(17, 3), point(18, 3), point(19, 3), point(20, 3), point(21, 3), point(22, 3)],
        staffServicePoints: [point(17, 3), point(22, 3)],
      },
      {
        id: "magazines",
        kind: "shelf",
        categoryId: "magazines",
        tiles: rectangleTiles(24, 1, 6, 2),
        customerServicePoints: [point(24, 3), point(25, 3), point(26, 3), point(27, 3), point(28, 3), point(29, 3)],
        staffServicePoints: [point(24, 3), point(29, 3)],
      },
      {
        id: "snacks",
        kind: "shelf",
        categoryId: "snacks",
        tiles: rectangleTiles(6, 6, 5, 2),
        customerServicePoints: [point(6, 5), point(8, 5), point(10, 5), point(6, 8), point(8, 8), point(10, 8)],
        staffServicePoints: [point(6, 5), point(10, 8)],
      },
      {
        id: "instant",
        kind: "shelf",
        categoryId: "instant",
        tiles: rectangleTiles(12, 6, 5, 2),
        customerServicePoints: [point(12, 5), point(14, 5), point(16, 5), point(12, 8), point(14, 8), point(16, 8)],
        staffServicePoints: [point(12, 5), point(16, 8)],
      },
      {
        id: "daily-goods",
        kind: "shelf",
        categoryId: "daily_goods",
        tiles: rectangleTiles(18, 6, 5, 2),
        customerServicePoints: [point(18, 5), point(20, 5), point(22, 5), point(18, 8), point(20, 8), point(22, 8)],
        staffServicePoints: [point(18, 5), point(22, 8)],
      },
      {
        id: "register",
        kind: "register",
        tiles: rectangleTiles(25, 7, 5, 4),
        customerServicePoints: [point(24, 10)],
        staffServicePoints: [point(28, 11)],
      },
      {
        id: "waste",
        kind: "waste",
        tiles: rectangleTiles(13, 13, 3, 2),
        customerServicePoints: [],
        staffServicePoints: [point(12, 14), point(16, 14)],
      },
      {
        id: "entrance",
        kind: "entrance",
        tiles: [point(3, 15), point(4, 15), point(5, 15)],
        customerServicePoints: [point(4, 14)],
        staffServicePoints: [point(4, 14)],
      },
    ],
  };
}

function tileKey(tile: TilePoint): string {
  return `${tile.x},${tile.y}`;
}

function sameTile(left: TilePoint, right: TilePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function blockedTiles(layout: StoreLayout): Set<string> {
  const result = new Set<string>();
  for (let x = 0; x < layout.width; x += 1) {
    result.add(tileKey(point(x, 0)));
    result.add(tileKey(point(x, layout.height - 1)));
  }
  for (let y = 0; y < layout.height; y += 1) {
    result.add(tileKey(point(0, y)));
    result.add(tileKey(point(layout.width - 1, y)));
  }
  for (const fixture of layout.fixtures) {
    if (fixture.kind === "entrance") continue;
    for (const tile of fixture.tiles) result.add(tileKey(tile));
  }
  result.delete(tileKey(layout.entranceTile));
  result.delete(tileKey(layout.exitTile));
  result.delete(tileKey(layout.cashierTile));
  result.delete(tileKey(layout.backroomTile));
  return result;
}

function neighbors(layout: StoreLayout, tile: TilePoint, blocked: ReadonlySet<string>): TilePoint[] {
  const candidates = [
    point(tile.x + 1, tile.y),
    point(tile.x - 1, tile.y),
    point(tile.x, tile.y + 1),
    point(tile.x, tile.y - 1),
  ];
  return candidates.filter(
    (candidate) =>
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x < layout.width &&
      candidate.y < layout.height &&
      !blocked.has(tileKey(candidate)),
  );
}

export function findStorePath(
  layout: StoreLayout,
  start: TilePoint,
  goals: readonly TilePoint[],
): TilePoint[] {
  const blocked = blockedTiles(layout);
  blocked.delete(tileKey(start));
  for (const goal of goals) blocked.delete(tileKey(goal));
  const goalKeys = new Set(goals.map(tileKey));
  const startKey = tileKey(start);
  if (goalKeys.has(startKey)) return [];

  const queue: TilePoint[] = [start];
  const previous = new Map<string, string | null>([[startKey, null]]);
  let foundKey: string | undefined;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const next of neighbors(layout, current, blocked)) {
      const key = tileKey(next);
      if (previous.has(key)) continue;
      previous.set(key, tileKey(current));
      if (goalKeys.has(key)) {
        foundKey = key;
        queue.length = 0;
        break;
      }
      queue.push(next);
    }
  }

  if (!foundKey) return [];
  const reversed: TilePoint[] = [];
  let cursor: string | null | undefined = foundKey;
  while (cursor && cursor !== startKey) {
    const [xText, yText] = cursor.split(",");
    reversed.push(point(Number(xText), Number(yText)));
    cursor = previous.get(cursor);
  }
  return reversed.reverse();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function emptyKpis(): StoreDayKpis {
  return {
    enteredCustomers: 0,
    transactions: 0,
    unitsSold: 0,
    revenue: 0,
    stockoutEncounters: 0,
    priceRefusals: 0,
    noPurchaseExits: 0,
    queueAbandonments: 0,
    maximumQueueLength: 0,
    replenishedUnits: 0,
    litterCleaned: 0,
    regularVisits: 0,
    regularTransactions: 0,
  };
}

function copyPoint(value: TilePoint): TilePoint {
  return { x: value.x, y: value.y };
}

function copyCustomer(customer: StoreCustomerAgent): StoreCustomerAgent {
  return {
    ...customer,
    path: customer.path.map(copyPoint),
    wishList: [...customer.wishList],
    attemptedCategories: [...customer.attemptedCategories],
  };
}

function copyStaff(staff: StoreStaffAgent): StoreStaffAgent {
  return { ...staff, path: staff.path.map(copyPoint) };
}

function copyInventory(
  inventories: Record<StoreCategoryId, ShelfInventoryState>,
): Record<StoreCategoryId, ShelfInventoryState> {
  return Object.fromEntries(
    CATEGORY_IDS.map((categoryId) => [categoryId, { ...inventories[categoryId] }]),
  ) as Record<StoreCategoryId, ShelfInventoryState>;
}

function fixtureForCategory(layout: StoreLayout, categoryId: StoreCategoryId): StoreFixture | undefined {
  return layout.fixtures.find((fixture) => fixture.categoryId === categoryId);
}

function nearestIntegerTile(agent: { x: number; y: number }): TilePoint {
  return point(Math.round(agent.x), Math.round(agent.y));
}

function moveAlongPath(
  agent: { x: number; y: number; path: TilePoint[] },
  deltaSeconds: number,
  speed: number,
): boolean {
  let remainingDistance = Math.max(0, deltaSeconds) * speed;
  while (remainingDistance > 0 && agent.path.length > 0) {
    const target = agent.path[0];
    if (!target) break;
    const dx = target.x - agent.x;
    const dy = target.y - agent.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= remainingDistance || distance < 0.0001) {
      agent.x = target.x;
      agent.y = target.y;
      agent.path.shift();
      remainingDistance -= distance;
      continue;
    }
    agent.x += (dx / distance) * remainingDistance;
    agent.y += (dy / distance) * remainingDistance;
    remainingDistance = 0;
  }
  return agent.path.length === 0;
}

function normalizeAssignments(assignments: StoreStaffAssignments, staffCount: number): StoreStaffAssignments {
  const total = Math.max(1, Math.round(staffCount));
  const values: StoreStaffAssignments = {
    register: Math.max(0, Math.round(assignments.register)),
    replenishment: Math.max(0, Math.round(assignments.replenishment)),
    cleaning: Math.max(0, Math.round(assignments.cleaning)),
  };
  let sum = values.register + values.replenishment + values.cleaning;
  if (sum === 0) {
    values.register = 1;
    sum = 1;
  }
  while (sum > total) {
    const task = (Object.keys(values) as StoreStaffTask[]).sort(
      (left, right) => values[right] - values[left],
    )[0];
    if (!task || values[task] <= 0) break;
    values[task] -= 1;
    sum -= 1;
  }
  while (sum < total) {
    if (values.register === 0) values.register += 1;
    else if (values.replenishment === 0) values.replenishment += 1;
    else values.cleaning += 1;
    sum += 1;
  }
  return values;
}

export function createStoreOperationsEngine(
  seed = 1977,
  layout: StoreLayout = createDefaultStoreLayout(),
  restored?: SerializedStoreOperations,
): StoreOperationsEngine {
  let rngState = (restored?.rngState ?? (seed >>> 0)) || 1;
  let nextCustomerNumber = restored?.nextCustomerNumber ?? 1;
  let nextLitterNumber = restored?.nextLitterNumber ?? 1;
  let spawnAccumulator = restored?.spawnAccumulator ?? 0;
  let day = restored?.day ?? 1;
  let elapsedSeconds = restored?.elapsedSeconds ?? 0;
  let customers = restored?.customers.map(copyCustomer) ?? [];
  let staff = restored?.staff.map(copyStaff) ?? [];
  let inventories = restored ? copyInventory(restored.inventories) : (Object.fromEntries(
    CATEGORY_IDS.map((categoryId) => [
      categoryId,
      { categoryId, ...CATEGORY_DEFAULTS[categoryId] },
    ]),
  ) as Record<StoreCategoryId, ShelfInventoryState>);
  let queueCustomerIds = [...(restored?.queueCustomerIds ?? [])];
  let litter = restored?.litter.map((item) => ({ ...item })) ?? [];
  let kpis = { ...emptyKpis(), ...(restored?.kpis ?? {}) };
  let assignments = { ...(restored?.assignments ?? { register: 1, replenishment: 1, cleaning: 0 }) };
  let checkoutProgressSeconds = restored?.checkoutProgressSeconds ?? 0;
  let lastRequestedStaffCount = Math.max(1, staff.length || 2);
  let orderingPolicy: StoreOrderingPolicy = restored?.orderingPolicy ?? "standard";
  let deliveryPolicy: StoreDeliveryPolicy = restored?.deliveryPolicy ?? "once_daily";
  let secondDeliveryCompletedDay = restored?.secondDeliveryCompletedDay ?? 0;
  let merchandisingFocus = restored?.merchandisingFocus;
  let dailyHistory = restored?.dailyHistory?.map((result) => ({
    ...result,
    serviceTrust: result.serviceTrust ?? restored.serviceTrust ?? 0.35,
    regularTransactions: result.regularTransactions ?? 0,
  })) ?? [];
  let serviceTrust = clamp(restored?.serviceTrust ?? 0.35, 0, 1);
  let cash = restored?.cash ?? INITIAL_CASH;
  let categoryTiers: Record<StoreCategoryId, number> = {
    ...(Object.fromEntries(CATEGORY_IDS.map((categoryId) => [categoryId, 0])) as Record<StoreCategoryId, number>),
    ...(restored?.categoryTiers ?? {}),
  };
  let daysSincePolicyChange = restored?.daysSincePolicyChange ?? 0;
  let changedSinceLastDay = false;
  // Per-category share (0..1) of real demand lost to stockout in the shared numeric
  // Simulation's most recently completed day, set via beginDay()'s
  // realStockoutSeverityByCategory argument. Not persisted across serialize()/restore()
  // — it is a derived signal recomputed from the live real Simulation on the next
  // beginDay() call, not authoritative state of its own.
  let stockoutSeverityByCategory: Partial<Record<StoreCategoryId, number>> = {};
  // Running total spent on shelf-capacity investments (investInCategoryCapacity),
  // which the shared real Simulation has no matching command for and therefore never
  // reflects. Every time this engine's cash is reconciled against that real cash (via
  // beginDay's realCash or setCash), this amount is subtracted so those purchases
  // stay paid for instead of being silently refunded by the reconciliation.
  let unsyncedCapacityInvestment = restored?.unsyncedCapacityInvestment ?? 0;

  function random(): number {
    let value = rngState | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    rngState = value >>> 0;
    return rngState / 4_294_967_295;
  }

  function weightedCategory(weights: Record<StoreCategoryId, number>, excluded: ReadonlySet<StoreCategoryId>): StoreCategoryId | undefined {
    const candidates = CATEGORY_IDS.filter((categoryId) => !excluded.has(categoryId));
    const total = candidates.reduce((sum, categoryId) => sum + Math.max(0, weights[categoryId]), 0);
    if (total <= 0) return candidates[0];
    let cursor = random() * total;
    for (const categoryId of candidates) {
      cursor -= Math.max(0, weights[categoryId]);
      if (cursor <= 0) return categoryId;
    }
    return candidates.at(-1);
  }

  function createWishList(weights: Record<StoreCategoryId, number>): StoreCategoryId[] {
    const count = random() < 0.58 ? 1 : random() < 0.82 ? 2 : 3;
    const result: StoreCategoryId[] = [];
    const excluded = new Set<StoreCategoryId>();
    const priceAdjustedWeights = Object.fromEntries(CATEGORY_IDS.map((categoryId) => {
      const basePrice = CATEGORY_DEFAULTS[categoryId].price;
      const relativePrice = inventories[categoryId].price / basePrice;
      return [categoryId, weights[categoryId] * Math.pow(relativePrice, -1.35)];
    })) as Record<StoreCategoryId, number>;
    for (let index = 0; index < count; index += 1) {
      const category = weightedCategory(priceAdjustedWeights, excluded);
      if (!category) break;
      result.push(category);
      excluded.add(category);
    }
    return result;
  }

  function pickArchetypePool(context: StoreEngineContext): CustomerArchetypePool | undefined {
    const pools = context.customerArchetypePools;
    if (!pools || pools.length === 0) return undefined;
    const total = pools.reduce((sum, pool) => sum + Math.max(0, pool.weight), 0);
    if (total <= 0) return undefined;
    let cursor = random() * total;
    for (const pool of pools) {
      cursor -= Math.max(0, pool.weight);
      if (cursor <= 0) return pool;
    }
    return pools.at(-1);
  }

  function routeCustomerToCategory(customer: StoreCustomerAgent, categoryId: StoreCategoryId): boolean {
    const fixture = fixtureForCategory(layout, categoryId);
    if (!fixture) return false;
    const path = findStorePath(layout, nearestIntegerTile(customer), fixture.customerServicePoints);
    if (path.length === 0 && !fixture.customerServicePoints.some((tile) => sameTile(tile, nearestIntegerTile(customer)))) {
      return false;
    }
    customer.state = "walking_to_shelf";
    customer.targetCategory = categoryId;
    customer.path = path;
    return true;
  }

  function routeCustomerToExit(customer: StoreCustomerAgent, reason: StoreCustomerAgent["reason"]): void {
    customer.state = "leaving";
    customer.reason = reason;
    customer.path = findStorePath(layout, nearestIntegerTile(customer), [layout.exitTile]);
    queueCustomerIds = queueCustomerIds.filter((id) => id !== customer.id);
  }

  function routeCustomerToQueue(customer: StoreCustomerAgent): void {
    customer.state = "walking_to_queue";
    customer.targetCategory = undefined;
    customer.path = findStorePath(layout, nearestIntegerTile(customer), [layout.queueTiles[0] ?? layout.entranceTile]);
  }

  function spawnCustomer(context: StoreEngineContext): void {
    if (customers.length >= MAX_VISIBLE_CUSTOMERS) return;
    const pool = pickArchetypePool(context);
    const variant =
      pool && pool.archetypeRows.length > 0
        ? pool.archetypeRows[Math.floor(random() * pool.archetypeRows.length)]!
        : Math.floor(random() * CUSTOMER_VISUAL_ROW_COUNT);
    const customer: StoreCustomerAgent = {
      id: `customer-${nextCustomerNumber}`,
      x: layout.entranceTile.x,
      y: layout.entranceTile.y,
      state: "walking_to_shelf",
      path: [],
      wishList: createWishList(pool?.categoryWeights ?? context.categoryWeights),
      attemptedCategories: [],
      basketUnits: 0,
      basketValue: 0,
      browseRemainingSeconds: 0,
      patienceRemainingSeconds: 13 + random() * 16 + serviceTrust * 6,
      regular: random() < 0.08 + serviceTrust * 0.45,
      variant,
    };
    nextCustomerNumber += 1;
    const firstCategory = customer.wishList.shift();
    if (!firstCategory || !routeCustomerToCategory(customer, firstCategory)) {
      routeCustomerToExit(customer, "unreachable");
    }
    customers.push(customer);
    kpis.enteredCustomers += 1;
    if (customer.regular) kpis.regularVisits += 1;
  }

  function queuePosition(customerId: string): TilePoint {
    const index = Math.max(0, queueCustomerIds.indexOf(customerId));
    return layout.queueTiles[Math.min(index, layout.queueTiles.length - 1)] ?? layout.queueTiles[0] ?? layout.entranceTile;
  }

  function updateQueuePaths(): void {
    for (const customerId of queueCustomerIds) {
      const customer = customers.find((candidate) => candidate.id === customerId);
      if (!customer || (customer.state !== "queueing" && customer.state !== "paying")) continue;
      const target = queuePosition(customerId);
      if (Math.hypot(customer.x - target.x, customer.y - target.y) > 0.15) {
        customer.path = findStorePath(layout, nearestIntegerTile(customer), [target]);
      }
    }
  }

  function handleShelfBrowse(customer: StoreCustomerAgent, context: StoreEngineContext): void {
    const categoryId = customer.targetCategory;
    if (!categoryId) {
      routeCustomerToQueue(customer);
      return;
    }
    if (!customer.attemptedCategories.includes(categoryId)) customer.attemptedCategories.push(categoryId);
    const inventory = inventories[categoryId];
    if (inventory.shelfUnits > 0) {
      const basePrice = CATEGORY_DEFAULTS[categoryId].price;
      const relativePrice = inventory.price / basePrice;
      const purchaseChance = clamp(
        1.08 - Math.max(0, relativePrice - 1) * 0.9 + (customer.regular ? 0.08 : 0),
        0.45,
        1,
      );
      if (random() > purchaseChance) {
        kpis.priceRefusals += 1;
        const nextCategory = customer.wishList.shift();
        if (nextCategory && routeCustomerToCategory(customer, nextCategory)) return;
        if (customer.basketUnits > 0) routeCustomerToQueue(customer);
        else {
          kpis.noPurchaseExits += 1;
          routeCustomerToExit(customer, "price");
        }
        return;
      }
      const desiredUnits = random() < 0.18 ? 2 : 1;
      const purchasedUnits = Math.min(desiredUnits, inventory.shelfUnits);
      inventory.shelfUnits -= purchasedUnits;
      customer.basketUnits += purchasedUnits;
      customer.basketValue += purchasedUnits * inventory.price;
      const nextCategory = customer.wishList.shift();
      if (nextCategory && routeCustomerToCategory(customer, nextCategory)) return;
      routeCustomerToQueue(customer);
      return;
    }

    kpis.stockoutEncounters += 1;
    const availableAlternatives = new Set(customer.attemptedCategories);
    const shouldSubstitute = random() < 0.62;
    const alternative = shouldSubstitute
      ? weightedCategory(context.categoryWeights, availableAlternatives)
      : undefined;
    if (alternative && inventories[alternative].shelfUnits > 0 && routeCustomerToCategory(customer, alternative)) {
      return;
    }
    if (customer.basketUnits > 0) routeCustomerToQueue(customer);
    else {
      kpis.noPurchaseExits += 1;
      routeCustomerToExit(customer, "stockout");
    }
  }

  function updateCustomers(deltaSeconds: number, context: StoreEngineContext): void {
    for (const customer of customers) {
      switch (customer.state) {
        case "walking_to_shelf": {
          if (moveAlongPath(customer, deltaSeconds, CUSTOMER_MOVE_SPEED)) {
            customer.state = "browsing";
            customer.browseRemainingSeconds = 1.1 + random() * 2.2;
          }
          break;
        }
        case "browsing": {
          customer.browseRemainingSeconds -= deltaSeconds;
          if (customer.browseRemainingSeconds <= 0) handleShelfBrowse(customer, context);
          break;
        }
        case "walking_to_queue": {
          if (moveAlongPath(customer, deltaSeconds, CUSTOMER_MOVE_SPEED)) {
            customer.state = "queueing";
            queueCustomerIds.push(customer.id);
            updateQueuePaths();
            kpis.maximumQueueLength = Math.max(kpis.maximumQueueLength, queueCustomerIds.length);
          }
          break;
        }
        case "queueing":
        case "paying": {
          moveAlongPath(customer, deltaSeconds, CUSTOMER_MOVE_SPEED);
          if (customer.state === "queueing") {
            customer.patienceRemainingSeconds -= deltaSeconds * (1 + queueCustomerIds.indexOf(customer.id) * 0.08);
            if (customer.patienceRemainingSeconds <= 0) {
              kpis.queueAbandonments += 1;
              routeCustomerToExit(customer, "queue_abandonment");
              updateQueuePaths();
            }
          }
          break;
        }
        case "leaving": {
          if (moveAlongPath(customer, deltaSeconds, CUSTOMER_MOVE_SPEED)) customer.state = "gone";
          break;
        }
        case "gone":
          break;
      }
    }
    customers = customers.filter((customer) => customer.state !== "gone");
  }

  function syncStaffCount(requestedCount: number): void {
    lastRequestedStaffCount = clamp(Math.round(requestedCount), 1, 6);
    assignments = normalizeAssignments(assignments, lastRequestedStaffCount);
    while (staff.length < lastRequestedStaffCount) {
      staff.push({
        id: `staff-${staff.length + 1}`,
        x: layout.backroomTile.x,
        y: layout.backroomTile.y,
        task: "register",
        priorityTask: "register",
        state: "idle",
        path: [],
        carryUnits: 0,
        workRemainingSeconds: 0,
        variant: staff.length % 4,
      });
    }
    if (staff.length > lastRequestedStaffCount) staff = staff.slice(0, lastRequestedStaffCount);

    const desiredTasks: StoreStaffTask[] = [];
    for (const task of ["register", "replenishment", "cleaning"] as const) {
      for (let count = 0; count < assignments[task]; count += 1) desiredTasks.push(task);
    }
    staff.forEach((member, index) => {
      const nextPriority = desiredTasks[index] ?? "register";
      if (member.priorityTask !== nextPriority) {
        member.priorityTask = nextPriority;
        member.task = nextPriority;
        member.state = "idle";
        member.path = [];
        member.targetCategory = undefined;
        member.carryUnits = 0;
        member.workRemainingSeconds = 0;
      }
    });
  }

  function routeStaff(member: StoreStaffAgent, goals: readonly TilePoint[], state: StaffState): boolean {
    const path = findStorePath(layout, nearestIntegerTile(member), goals);
    if (path.length === 0 && !goals.some((goal) => sameTile(goal, nearestIntegerTile(member)))) return false;
    member.path = path;
    member.state = state;
    return true;
  }

  function nextReplenishmentCategory(): StoreCategoryId | undefined {
    return CATEGORY_IDS
      .filter((categoryId) => inventories[categoryId].backroomUnits > 0)
      .sort((left, right) => {
        const leftRatio = inventories[left].shelfUnits / inventories[left].shelfCapacity
          - (left === merchandisingFocus ? 0.16 : 0);
        const rightRatio = inventories[right].shelfUnits / inventories[right].shelfCapacity
          - (right === merchandisingFocus ? 0.16 : 0);
        return leftRatio - rightRatio;
      })
      .find((categoryId) => inventories[categoryId].shelfUnits < inventories[categoryId].shelfCapacity * 0.72);
  }

  function updateRegisterStaff(member: StoreStaffAgent, deltaSeconds: number): void {
    if (member.state !== "walking_to_register" && member.state !== "register_ready") {
      routeStaff(member, [layout.cashierTile], "walking_to_register");
    }
    if (member.state === "walking_to_register" && moveAlongPath(member, deltaSeconds, STAFF_MOVE_SPEED)) {
      member.state = "register_ready";
    }
  }

  function updateReplenishmentStaff(member: StoreStaffAgent, deltaSeconds: number): void {
    if (member.state === "idle" || member.state === "register_ready") {
      const category = nextReplenishmentCategory();
      if (!category) {
        member.targetCategory = undefined;
        routeStaff(member, [layout.backroomTile], "walking_to_backroom");
        return;
      }
      member.targetCategory = category;
      routeStaff(member, [layout.backroomTile], "walking_to_backroom");
      return;
    }
    if (member.state === "walking_to_backroom") {
      if (!moveAlongPath(member, deltaSeconds, STAFF_MOVE_SPEED)) return;
      if (!member.targetCategory) {
        member.state = "idle";
        return;
      }
      const inventory = inventories[member.targetCategory];
      member.carryUnits = Math.min(REPLENISH_BATCH_UNITS, inventory.backroomUnits);
      inventory.backroomUnits -= member.carryUnits;
      const fixture = fixtureForCategory(layout, member.targetCategory);
      if (!fixture || member.carryUnits <= 0 || !routeStaff(member, fixture.staffServicePoints, "walking_to_shelf")) {
        inventory.backroomUnits += member.carryUnits;
        member.carryUnits = 0;
        member.state = "idle";
      }
      return;
    }
    if (member.state === "walking_to_shelf") {
      if (moveAlongPath(member, deltaSeconds, STAFF_MOVE_SPEED)) {
        member.state = "replenishing";
        member.workRemainingSeconds = 1.4;
      }
      return;
    }
    if (member.state === "replenishing") {
      member.workRemainingSeconds -= deltaSeconds;
      if (member.workRemainingSeconds > 0) return;
      const category = member.targetCategory;
      if (category) {
        const inventory = inventories[category];
        const accepted = Math.min(member.carryUnits, inventory.shelfCapacity - inventory.shelfUnits);
        inventory.shelfUnits += accepted;
        inventory.backroomUnits += member.carryUnits - accepted;
        kpis.replenishedUnits += accepted;
      }
      member.carryUnits = 0;
      member.targetCategory = undefined;
      member.state = "idle";
    }
  }

  function updateCleaningStaff(member: StoreStaffAgent, deltaSeconds: number): void {
    if (member.state === "idle" || member.state === "register_ready") {
      const target = litter[0];
      if (!target) {
        routeStaff(member, [point(4, 13)], "walking_to_litter");
        return;
      }
      routeStaff(member, [point(Math.round(target.x), Math.round(target.y))], "walking_to_litter");
      return;
    }
    if (member.state === "walking_to_litter") {
      if (!moveAlongPath(member, deltaSeconds, STAFF_MOVE_SPEED)) return;
      const target = litter.find((item) => Math.hypot(item.x - member.x, item.y - member.y) < 1.1);
      if (!target) {
        member.state = "idle";
        return;
      }
      member.state = "cleaning";
      member.workRemainingSeconds = 1.1;
      return;
    }
    if (member.state === "cleaning") {
      member.workRemainingSeconds -= deltaSeconds;
      if (member.workRemainingSeconds > 0) return;
      const index = litter.findIndex((item) => Math.hypot(item.x - member.x, item.y - member.y) < 1.1);
      if (index >= 0) {
        litter.splice(index, 1);
        kpis.litterCleaned += 1;
      }
      member.state = "idle";
    }
  }

  function processCheckout(deltaSeconds: number): void {
    const cashiers = staff.filter((member) => member.task === "register" && member.state === "register_ready").length;
    const firstId = queueCustomerIds[0];
    if (!firstId || cashiers <= 0) {
      checkoutProgressSeconds = 0;
      return;
    }
    const customer = customers.find((candidate) => candidate.id === firstId);
    if (!customer) {
      queueCustomerIds.shift();
      checkoutProgressSeconds = 0;
      return;
    }
    customer.state = "paying";
    const required = BASE_CHECKOUT_SECONDS + customer.basketUnits * CHECKOUT_SECONDS_PER_ITEM;
    checkoutProgressSeconds += deltaSeconds * cashiers;
    if (checkoutProgressSeconds < required) return;

    checkoutProgressSeconds = 0;
    queueCustomerIds.shift();
    kpis.transactions += 1;
    if (customer.regular) kpis.regularTransactions += 1;
    kpis.unitsSold += customer.basketUnits;
    kpis.revenue += customer.basketValue;
    if (random() < 0.14 && litter.length < 8) {
      litter.push({
        id: `litter-${nextLitterNumber}`,
        x: clamp(customer.x - 1 + random() * 2, 2, layout.width - 3),
        y: clamp(customer.y - 1 + random() * 2, 2, layout.height - 3),
      });
      nextLitterNumber += 1;
    }
    routeCustomerToExit(customer, "completed");
    updateQueuePaths();
  }

  function updateStaff(deltaSeconds: number): void {
    const lowShelfCount = CATEGORY_IDS.filter((categoryId) => {
      const inventory = inventories[categoryId];
      return inventory.backroomUnits > 0 && inventory.shelfUnits < inventory.shelfCapacity * 0.72;
    }).length;
    const plannedTasks = planStoreStaffTasks(
      staff.map((member) => member.priorityTask ?? member.task),
      {
        register: queueCustomerIds.length > 0 ? Math.max(1, queueCustomerIds.length / 3) : 0,
        replenishment: lowShelfCount / 2,
        cleaning: litter.length / 2,
      },
    );
    staff.forEach((member, index) => {
      const canChangeTask = member.state === "idle" || member.state === "register_ready";
      if (canChangeTask) {
        const nextTask = plannedTasks[index] ?? member.priorityTask ?? member.task;
        if (nextTask !== member.task) {
          member.task = nextTask;
          member.state = "idle";
          member.path = [];
          member.targetCategory = undefined;
          member.carryUnits = 0;
          member.workRemainingSeconds = 0;
        }
      }
      if (member.task === "register") updateRegisterStaff(member, deltaSeconds);
      else if (member.task === "replenishment") updateReplenishmentStaff(member, deltaSeconds);
      else updateCleaningStaff(member, deltaSeconds);
    });
  }

  function deliverStock(categories: readonly StoreCategoryId[], quantityMultiplier: number): void {
    const orderingMultiplier = orderingPolicy === "sell_through"
      ? 0.82
      : orderingPolicy === "stockout_prevention"
        ? 1.42
        : 1.08;
    for (const categoryId of categories) {
      const inventory = inventories[categoryId];
      // Categories the shared real Simulation reports as stockout-heavy get less
      // delivered here too, so this engine's own shelf model trends toward "empty" for
      // the same categories that are actually short in the real economy instead of
      // staying fully stocked regardless (docs/game-design.md §7: on-screen state and
      // internal numbers must agree). A severity of 0 (no signal yet, or the category
      // is fully stocked in reality) leaves delivery unchanged.
      const severity = clamp(stockoutSeverityByCategory[categoryId] ?? 0, 0, 1);
      const realityMultiplier = 1 - severity * STOCKOUT_SEVERITY_DELIVERY_PENALTY;
      const targetBackroom = Math.round(
        inventory.shelfCapacity * 2.1 * orderingMultiplier * realityMultiplier,
      );
      if (inventory.backroomUnits < targetBackroom) {
        inventory.backroomUnits += Math.round(
          inventory.shelfCapacity * orderingMultiplier * quantityMultiplier * realityMultiplier,
        );
      }
    }
  }

  function deliverMorningStock(): void {
    deliverStock(CATEGORY_IDS, 1);
  }

  function deliverSecondStock(): void {
    if (deliveryPolicy === "ready_to_eat_twice_daily") deliverStock(["ready_meal"], 0.72);
    if (deliveryPolicy === "all_categories_twice_daily") deliverStock(CATEGORY_IDS, 0.58);
  }

  // The shared real Simulation has no command for shelf-capacity purchases, so its
  // cash never reflects them; net out unsyncedCapacityInvestment so reconciling
  // against it doesn't silently refund those purchases (see investInCategoryCapacity).
  function reconcileWithRealCash(realCash: number): number {
    return Math.max(0, realCash - unsyncedCapacityInvestment);
  }

  return {
    advance(deltaSeconds: number, context: StoreEngineContext): void {
      const safeDelta = clamp(deltaSeconds, 0, 0.5);
      if (safeDelta <= 0) return;
      elapsedSeconds += safeDelta;
      syncStaffCount(context.requestedStaffCount);

      if (
        context.hour >= 13 &&
        deliveryPolicy !== "once_daily" &&
        secondDeliveryCompletedDay !== day
      ) {
        deliverSecondStock();
        secondDeliveryCompletedDay = day;
      }

      if (context.isOpen) {
        const spawnMinutes = context.simMinutesElapsed ?? safeDelta / 60;
        spawnAccumulator += Math.max(0, context.arrivalRatePerMinute) * spawnMinutes;
        while (spawnAccumulator >= 1) {
          spawnAccumulator -= 1;
          spawnCustomer(context);
        }
      }
      updateCustomers(safeDelta, context);
      updateStaff(safeDelta);
      processCheckout(safeDelta);
      kpis.maximumQueueLength = Math.max(kpis.maximumQueueLength, queueCustomerIds.length);
    },

    beginDay(
      nextDay: number,
      realCash?: number,
      realStockoutSeverityByCategory?: Partial<Record<StoreCategoryId, number>>,
    ): void {
      if (nextDay === day) return;
      if (realStockoutSeverityByCategory) {
        stockoutSeverityByCategory = realStockoutSeverityByCategory;
      }
      if (kpis.enteredCustomers > 0 || kpis.revenue > 0) {
        const entered = Math.max(1, kpis.enteredCustomers);
        const conversion = clamp(kpis.transactions / entered, 0, 1);
        const availability = clamp(1 - kpis.stockoutEncounters / entered, 0, 1);
        const queueService = clamp(1 - kpis.queueAbandonments / entered, 0, 1);
        const dayReliability = conversion * 0.4 + availability * 0.35 + queueService * 0.25;
        serviceTrust = clamp(serviceTrust + (dayReliability - serviceTrust) * 0.22, 0, 1);
        dailyHistory.push({
          day,
          enteredCustomers: kpis.enteredCustomers,
          transactions: kpis.transactions,
          revenue: kpis.revenue,
          stockoutEncounters: kpis.stockoutEncounters,
          queueAbandonments: kpis.queueAbandonments,
          maximumQueueLength: kpis.maximumQueueLength,
          serviceTrust,
          regularTransactions: kpis.regularTransactions,
        });
        dailyHistory = dailyHistory.slice(-14);
      }
      if (realCash === undefined) {
        const netIncome = kpis.revenue * (1 - ASSUMED_COST_RATIO) - DAILY_OPERATING_COST;
        cash = Math.max(0, cash + netIncome);
      } else {
        cash = reconcileWithRealCash(realCash);
      }
      daysSincePolicyChange = changedSinceLastDay ? 0 : daysSincePolicyChange + 1;
      changedSinceLastDay = false;
      day = nextDay;
      kpis = emptyKpis();
      spawnAccumulator = 0;
      checkoutProgressSeconds = 0;
      deliverMorningStock();
    },

    setCash(realCash: number): void {
      cash = reconcileWithRealCash(realCash);
    },

    setStaffAssignments(nextAssignments: StoreStaffAssignments): void {
      assignments = normalizeAssignments(nextAssignments, lastRequestedStaffCount);
      syncStaffCount(lastRequestedStaffCount);
      changedSinceLastDay = true;
    },

    setSupplyPolicy(nextOrdering: StoreOrderingPolicy, nextDelivery: StoreDeliveryPolicy): void {
      orderingPolicy = nextOrdering;
      deliveryPolicy = nextDelivery;
      changedSinceLastDay = true;
    },

    setMerchandisingFocus(category?: StoreCategoryId): void {
      merchandisingFocus = category;
      changedSinceLastDay = true;
    },

    setCategoryPrice(category: StoreCategoryId, nextPrice: number): void {
      const range = categoryPriceRange(category);
      inventories[category].price = clamp(Math.round(nextPrice / 10) * 10, range.min, range.max);
      changedSinceLastDay = true;
    },

    investInCategoryCapacity(category: StoreCategoryId): { ok: boolean; message: string } {
      const tier = categoryTiers[category];
      const investment = nextCapacityInvestment(tier);
      if (!investment) {
        return { ok: false, message: "これ以上拡張できません" };
      }
      if (cash < investment.cost) {
        return { ok: false, message: `資金が不足しています(必要 ¥${investment.cost.toLocaleString("ja-JP")})` };
      }
      cash -= investment.cost;
      unsyncedCapacityInvestment += investment.cost;
      categoryTiers[category] = tier + 1;
      inventories[category].shelfCapacity += investment.capacityBonus;
      changedSinceLastDay = true;
      return { ok: true, message: "売場を拡張しました" };
    },

    swapFixtureCategories(fixtureIdA: string, fixtureIdB: string): { ok: boolean; message: string } {
      if (fixtureIdA === fixtureIdB) {
        return { ok: false, message: "同じ什器は入れ替えられません" };
      }
      const fixtureA = layout.fixtures.find((fixture) => fixture.id === fixtureIdA);
      const fixtureB = layout.fixtures.find((fixture) => fixture.id === fixtureIdB);
      if (!fixtureA || !fixtureB) {
        return { ok: false, message: "什器が見つかりません" };
      }
      if (!fixtureA.categoryId || !fixtureB.categoryId) {
        return { ok: false, message: "この什器には陳列カテゴリがありません" };
      }
      if (fixtureA.kind !== fixtureB.kind) {
        return { ok: false, message: "常温什器と冷蔵ケースの間では入れ替えられません" };
      }
      const categoryA = fixtureA.categoryId;
      const categoryB = fixtureB.categoryId;
      fixtureA.categoryId = categoryB;
      fixtureB.categoryId = categoryA;
      changedSinceLastDay = true;

      // Agents already en route to one of the swapped fixtures hold a path computed
      // from the old category locations. Re-route them to the category's new fixture
      // so they don't arrive at a shelf that no longer displays what they're after.
      for (const customer of customers) {
        if (
          customer.state === "walking_to_shelf" &&
          (customer.targetCategory === categoryA || customer.targetCategory === categoryB)
        ) {
          routeCustomerToCategory(customer, customer.targetCategory);
        }
      }
      for (const member of staff) {
        if (
          member.state === "walking_to_shelf" &&
          member.task === "replenishment" &&
          (member.targetCategory === categoryA || member.targetCategory === categoryB)
        ) {
          const fixture = fixtureForCategory(layout, member.targetCategory);
          if (fixture) routeStaff(member, fixture.staffServicePoints, "walking_to_shelf");
        }
      }

      return { ok: true, message: "陳列カテゴリを入れ替えました" };
    },

    getSnapshot(): StoreOperationsSnapshot {
      return {
        day,
        elapsedSeconds,
        customers: customers.map(copyCustomer),
        staff: staff.map(copyStaff),
        inventories: copyInventory(inventories),
        queueCustomerIds: [...queueCustomerIds],
        litter: litter.map((item) => ({ ...item })),
        kpis: { ...kpis },
        assignments: { ...assignments },
        checkoutProgressSeconds,
        merchandisingFocus,
        dailyHistory: dailyHistory.map((result) => ({ ...result })),
        serviceTrust,
        cash,
        categoryTiers: { ...categoryTiers },
        daysSincePolicyChange,
        unsyncedCapacityInvestment,
      };
    },

    getLayout(): StoreLayout {
      return {
        ...layout,
        entranceTile: copyPoint(layout.entranceTile),
        exitTile: copyPoint(layout.exitTile),
        cashierTile: copyPoint(layout.cashierTile),
        backroomTile: copyPoint(layout.backroomTile),
        queueTiles: layout.queueTiles.map(copyPoint),
        fixtures: layout.fixtures.map((fixture) => ({
          ...fixture,
          tiles: fixture.tiles.map(copyPoint),
          customerServicePoints: fixture.customerServicePoints.map(copyPoint),
          staffServicePoints: fixture.staffServicePoints.map(copyPoint),
        })),
      };
    },

    serialize(): SerializedStoreOperations {
      return {
        version: 1,
        ...this.getSnapshot(),
        rngState,
        nextCustomerNumber,
        nextLitterNumber,
        spawnAccumulator,
        orderingPolicy,
        deliveryPolicy,
        merchandisingFocus,
        secondDeliveryCompletedDay,
      };
    },
  };
}

export function restoreStoreOperationsEngine(
  serialized: SerializedStoreOperations,
  layout: StoreLayout = createDefaultStoreLayout(),
): StoreOperationsEngine {
  if (serialized.version !== 1) throw new Error("Unsupported store operations save version");
  return createStoreOperationsEngine(serialized.rngState, layout, serialized);
}

export function defaultCategoryWeightsForHour(hour: number): Record<StoreCategoryId, number> {
  if (hour < 10) {
    return { drinks: 1.4, dessert: 0.4, ready_meal: 1.8, snacks: 0.5, instant: 0.4, daily_goods: 0.3, magazines: 0.5 };
  }
  if (hour < 14) {
    return { drinks: 1.3, dessert: 0.6, ready_meal: 2.2, snacks: 0.7, instant: 1.1, daily_goods: 0.3, magazines: 0.4 };
  }
  if (hour < 18) {
    return { drinks: 1.2, dessert: 1.2, ready_meal: 0.7, snacks: 1.7, instant: 0.7, daily_goods: 0.7, magazines: 1.0 };
  }
  return { drinks: 1.4, dessert: 0.7, ready_meal: 1.8, snacks: 1.0, instant: 1.1, daily_goods: 1.2, magazines: 0.6 };
}
import { planStoreStaffTasks } from "./storeTaskScheduler.js";
