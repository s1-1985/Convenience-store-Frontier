import {
  categoryPriceRange,
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
  maxShelfTier,
  nextCapacityInvestment,
  restoreStoreOperationsEngine,
  type CustomerArchetypePool,
  type SerializedStoreOperations,
  type StoreCategoryId,
  type StoreCustomerAgent,
  type StoreEngineContext,
  type FixtureKind,
  type StoreFixture,
  type StoreLayout,
  type StoreOperationsEngine,
  type StoreOperationsSnapshot,
  type StoreOrderingPolicy,
  type StoreDeliveryPolicy,
  type StoreStaffAssignments,
  type StoreStaffAgent,
  type StoreStaffTask,
  type TilePoint,
} from "../game/storeOperationsEngine.js";
import { getGameSession, peekGameSession, type GameSessionState } from "./gameSession.js";
import type {
  CohortDefinition,
  DeliveryPolicyId,
  OrderingPolicyId,
  ScenarioBundle,
  TimeBlockId,
} from "../simulation/types.js";
import { priorityStoreObjectives, type StoreObjectiveStatus } from "../game/storeObjectives.js";
import {
  assignmentsForPreset,
  recommendStaffing,
  type StoreStaffPreset,
} from "../game/storeStaffing.js";
import { recommendSupplyPolicy } from "../game/storeSupplyAdvisor.js";
import {
  categoryAreaFromShelfCapacity,
  SIM_CATEGORY_TO_STORE_CATEGORY,
  taskPrioritiesFromStaffAssignments,
} from "../game/storeCanvasPolicySync.js";
import { computeRevenueTrend, summarizeStorePerformance } from "../game/storePerformance.js";
import { detectStoreIncidents } from "../game/storeIncidents.js";
import {
  createStoreLayoutEditorUi,
  loadSavedStoreLayout,
  saveStoreLayout,
  type StoreLayoutEditorUi,
} from "./storeLayoutEditorUi.js";
import { configureHiDpiCanvas } from "./storeCanvasResolution.js";
import {
  drawAgentArtwork,
  drawFixtureArtwork,
  drawUiIcon,
  loadStoreArtAssets,
  type StoreArtAssets,
} from "./storeArtAssets.js";
import "./storeGame.css";

const LOGICAL_WIDTH = 1080;
const LOGICAL_HEIGHT = 500;
const STORE_SAVE_KEY = "convenience-store-frontier.store-operations.v1";
let storeArtAssets: StoreArtAssets | undefined;
let lastAutoStoppedIncident = "";

// The single Simulation instance shared with main.ts's numeric dashboard (see
// src/ui/gameSession.ts). Populated once loaded; read fresh via peekGameSession()
// rather than cached locally, so a reset triggered from main.ts's UI is picked up
// immediately instead of leaving this module pointing at a stale session.
function gameSession(): GameSessionState | undefined {
  return peekGameSession();
}


function categoryWeightsForCohort(cohort: CohortDefinition): Record<StoreCategoryId, number> {
  const weights: Record<StoreCategoryId, number> = {
    drinks: 0,
    dessert: 0,
    ready_meal: 0,
    snacks: 0,
    instant: 0,
    daily_goods: 0,
    magazines: 0,
    frozen: 0,
    hot: 0,
  };
  for (const [simCategoryId, preference] of Object.entries(cohort.categoryPreference)) {
    const storeCategoryId = SIM_CATEGORY_TO_STORE_CATEGORY[simCategoryId];
    if (storeCategoryId) weights[storeCategoryId] += preference;
  }
  const snacksShare = weights.snacks;
  weights.snacks = snacksShare * 0.65;
  weights.dessert = snacksShare * 0.35;
  return weights;
}

/**
 * Aggregates, per StoreCategoryId, the share (0..1) of real demand lost to stockout on
 * the shared numeric Simulation's most recently completed day. Fed into
 * StoreOperationsEngine.beginDay() so the canvas's own next-day shelf delivery trends
 * toward "empty" for the same categories actually running short in the real economy
 * (see docs/visual-numeric-engine-integration.md, "在庫欠品表示の同期").
 *
 * "dessert" has no distinct sim-category counterpart — its demand is carved out of
 * "category_snacks" the same way categoryWeightsForCohort() above does — so it inherits
 * the "snacks" severity rather than reading as always fully stocked.
 *
 * Returns {} before the shared session has loaded or before any day has completed
 * (day 1), in which case beginDay() leaves delivery unaffected.
 */
function realStockoutSeverityByCategory(): Partial<Record<StoreCategoryId, number>> {
  const session = gameSession();
  if (!session) return {};
  const latest = session.session.simulation.getAllDailyReports().at(-1);
  if (!latest) return {};

  const simCategoryByProductId = new Map(
    session.scenario.products.map((product) => [product.id, product.categoryId]),
  );
  const stockoutBySimCategory: Record<string, number> = {};
  for (const [productId, units] of Object.entries(latest.stockoutUnitsByProduct)) {
    const simCategoryId = simCategoryByProductId.get(productId);
    if (!simCategoryId) continue;
    stockoutBySimCategory[simCategoryId] = (stockoutBySimCategory[simCategoryId] ?? 0) + units;
  }

  const severity: Partial<Record<StoreCategoryId, number>> = {};
  for (const [simCategoryId, stockoutUnits] of Object.entries(stockoutBySimCategory)) {
    const storeCategoryId = SIM_CATEGORY_TO_STORE_CATEGORY[simCategoryId];
    if (!storeCategoryId) continue;
    const soldUnits = latest.salesUnitsByCategory[simCategoryId] ?? 0;
    const desiredUnits = stockoutUnits + soldUnits;
    if (desiredUnits <= 0) continue;
    severity[storeCategoryId] = Math.min(1, Math.max(0, stockoutUnits / desiredUnits));
  }
  if (severity.snacks !== undefined) severity.dessert = severity.snacks;
  return severity;
}

function timeBlockForHour(scenario: ScenarioBundle, hour: number): TimeBlockId {
  const block = scenario.timeBlocks.find((candidate) => hour >= candidate.startHour && hour < candidate.endHour);
  return (block?.id ?? "evening") as TimeBlockId;
}

// Row indices from data/assets/store/customers-manifest.json, grouped by which of the
// six customer_cohorts.json cohorts each archetype most plausibly represents. Rows not
// listed here (student_university_male/female, middle_male/female, delinquent — rows
// 5, 10, 11, 13, 19) have no corresponding CohortDefinition yet: their shopping
// behavior and real appearance probability are not modeled. See docs/store-art-assets.md.
const COHORT_ARCHETYPE_ROWS: Record<string, number[]> = {
  cohort_commuter_worker: [0, 1, 14, 15, 16, 17],
  cohort_lunch_worker: [0, 1, 14, 15, 16, 17],
  cohort_high_school_student: [2, 12],
  cohort_family: [4, 6, 7, 8, 9],
  cohort_elderly: [3, 18],
  cohort_night_worker: [20, 21, 22, 23],
};
const ALL_CUSTOMER_ROWS = Array.from({ length: 32 }, (_, index) => index);
// Small flat slice of arrival weight reserved for archetypes with no modeled cohort
// above, so those already-produced art assets still appear in play rather than never
// being drawn. Not a claim about their real-world share of customers.
const UNMODELED_ARCHETYPE_WEIGHT_SHARE = 0.15;

function customerArchetypePools(
  scenario: ScenarioBundle,
  hour: number,
  focus?: StoreCategoryId,
): CustomerArchetypePool[] | undefined {
  const timeBlock = timeBlockForHour(scenario, hour);
  const pools: CustomerArchetypePool[] = scenario.cohorts
    .map((cohort) => {
      const categoryWeights = categoryWeightsForCohort(cohort);
      if (focus) categoryWeights[focus] *= 1.35;
      return {
        categoryWeights,
        archetypeRows: COHORT_ARCHETYPE_ROWS[cohort.id] ?? [],
        weight: cohort.population * (cohort.activityRateByTimeBlock[timeBlock] ?? 0),
      };
    })
    .filter((pool) => pool.weight > 0 && pool.archetypeRows.length > 0);
  if (pools.length === 0) return undefined;

  const modeledRows = new Set(pools.flatMap((pool) => pool.archetypeRows));
  const unmodeledRows = ALL_CUSTOMER_ROWS.filter((row) => !modeledRows.has(row));
  if (unmodeledRows.length > 0) {
    const modeledWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
    const flavorWeights = defaultCategoryWeightsForHour(hour);
    if (focus) flavorWeights[focus] *= 1.35;
    pools.push({
      categoryWeights: flavorWeights,
      archetypeRows: unmodeledRows,
      weight: (modeledWeight * UNMODELED_ARCHETYPE_WEIGHT_SHARE) / (1 - UNMODELED_ARCHETYPE_WEIGHT_SHARE),
    });
  }
  return pools;
}

interface StoreViewGeometry {
  gridX: number;
  gridY: number;
  tileWidth: number;
  tileHeight: number;
  footerY: number;
}

const PLAY_GEOMETRY: StoreViewGeometry = {
  gridX: 12,
  gridY: 43,
  tileWidth: 33,
  tileHeight: 23,
  footerY: 414,
};
const EDITOR_GEOMETRY: StoreViewGeometry = {
  gridX: 12,
  gridY: 38,
  tileWidth: 28,
  tileHeight: 23,
  footerY: 412,
};

const CATEGORY_LABELS: Record<StoreCategoryId, string> = {
  drinks: "飲料",
  dessert: "デザート",
  ready_meal: "弁当・惣菜",
  snacks: "お菓子",
  instant: "カップ麺",
  daily_goods: "日用品",
  magazines: "雑誌・書籍",
  frozen: "冷凍食品",
  hot: "ホットスナック",
};

const TASK_LABELS: Record<StoreStaffTask, string> = {
  register: "レジ",
  replenishment: "補充",
  cleaning: "清掃",
};

function optional<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function numberFrom(textValue: string | null | undefined): number {
  if (!textValue) return 0;
  const match = textValue.replaceAll(",", "").replaceAll("−", "-").match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

// Mirrors src/ui/presentation.ts's formatClock: a slot is 15 simulated minutes
// starting at 06:00.
function simulatedClock(): { day: number; hour: number; minute: number } | undefined {
  const session = gameSession();
  if (!session) return undefined;
  const snapshot = session.session.simulation.getSnapshot();
  const totalMinutes = 6 * 60 + snapshot.slot * 15;
  return { day: snapshot.day, hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

function currentDay(): number {
  const clock = simulatedClock();
  if (clock) return clock.day;
  return Math.max(1, Math.round(numberFrom(optional("day-label")?.textContent)));
}

function currentHour(): number {
  const clock = simulatedClock();
  if (clock) return clock.hour;
  const value = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(value.split(":")[0] ?? "6", 10);
}

function currentMinute(): number {
  const clock = simulatedClock();
  if (clock) return clock.minute;
  const value = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(value.split(":")[1] ?? "0", 10);
}

function currentStaffing(): number {
  const hour = currentHour();
  const block = hour < 10 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : "evening";
  return Math.max(1, Math.round(numberFrom(optional<HTMLInputElement>(`staff-${block}`)?.value) || 2));
}

function isStoreOpen(): boolean {
  const opening = numberFrom(optional<HTMLSelectElement>("opening-hour-select")?.value) || 8;
  const closing = numberFrom(optional<HTMLSelectElement>("closing-hour-select")?.value) || 20;
  const hour = currentHour() + currentMinute() / 60;
  return hour >= opening && hour < closing;
}

function isPlaying(): boolean {
  return optional<HTMLButtonElement>("play-button")?.textContent?.includes("停止") ?? false;
}

function visualTimeScale(): number {
  const speed = optional<HTMLSelectElement>("speed-select")?.value ?? "1";
  if (speed === "20") return 3.2;
  if (speed === "4") return 1.9;
  return 1;
}

// Slots are 15 real-simulated minutes (see src/simulation/clock.ts), and the visual
// engine's own arrival rate is expressed per its own in-game minute, so the real
// engine's per-slot visit count converts directly by dividing by 15.
const SLOT_MINUTES = 15;

function arrivalRatePerMinute(): number {
  const session = gameSession();
  if (session) {
    return session.session.simulation.getSnapshot().lastSlotPlayerVisits / SLOT_MINUTES;
  }
  const hour = currentHour();
  const base = hour < 10 ? 5.2 : hour < 14 ? 8.2 : hour < 18 ? 4.4 : 6.3;
  const aggregateQueue = numberFrom(optional("queue-metric")?.textContent);
  const aggregateVisits = numberFrom(optional("visit-metric")?.textContent);
  const pressure = Math.min(1.55, 0.85 + Math.sqrt(Math.max(0, aggregateVisits)) / 45 + aggregateQueue * 0.04);
  return base * pressure;
}

// arrivalRatePerMinute() is visits per *sim*-minute, but the real Simulation's clock
// (main.ts's setInterval, sped up by the speed selector) advances many sim-minutes per
// real second — nowhere near the "1 sim-minute per real-minute" pace that a plain
// real-elapsed-seconds delta would imply. Tracking actual sim-minutes elapsed between
// frames (from day/hour/minute) lets the spawn accumulator in
// StoreOperationsEngine.advance() use the correct time basis regardless of how fast the
// real clock is currently ticking. Only accumulated while isPlaying(): manual "+15分"/
// "翌日まで" stepping should not itself pop a crowd of customers into existence.
let lastSimAbsoluteMinutes: number | undefined;

function simMinutesElapsedThisFrame(): number {
  const current = (currentDay() - 1) * 1440 + currentHour() * 60 + currentMinute();
  if (lastSimAbsoluteMinutes === undefined || !isPlaying()) {
    lastSimAbsoluteMinutes = current;
    return 0;
  }
  const delta = Math.max(0, current - lastSimAbsoluteMinutes);
  lastSimAbsoluteMinutes = current;
  return delta;
}

function engineContext(focus?: StoreCategoryId): StoreEngineContext {
  const weights = defaultCategoryWeightsForHour(currentHour());
  if (focus) weights[focus] *= 1.35;
  const hour = currentHour();
  return {
    isOpen: isStoreOpen(),
    hour: hour + currentMinute() / 60,
    arrivalRatePerMinute: arrivalRatePerMinute(),
    simMinutesElapsed: simMinutesElapsedThisFrame(),
    categoryWeights: weights,
    requestedStaffCount: currentStaffing(),
    customerArchetypePools: gameSession()
      ? customerArchetypePools(gameSession()!.scenario, hour, focus)
      : undefined,
  };
}

function syncSupplyPolicy(engine: StoreOperationsEngine): void {
  const ordering = optional<HTMLSelectElement>("ordering-policy-select")?.value ?? "standard";
  const delivery = optional<HTMLSelectElement>("delivery-policy-select")?.value ?? "once_daily";
  engine.setSupplyPolicy(ordering as StoreOrderingPolicy, delivery as StoreDeliveryPolicy);
}

const POLICY_TIME_BLOCKS: readonly TimeBlockId[] = ["morning", "midday", "afternoon", "evening"];
let lastAppliedPolicySignature = "";

// Mirrors the same opening/closing hour, per-time-block staffing, and ordering/
// delivery policy form values that syncSupplyPolicy() already feeds into the visual
// engine every frame, but into the real numeric Simulation too (see
// src/ui/gameSession.ts) — so changes made from this screen reach the real economy
// without needing main.ts's separate "方針を反映" button. Also syncs task priorities
// (from the staff panel's per-task headcount) and category area (from shelf-tier
// investment) via the ADR-0005 conversions above.
function syncPolicyToRealEngine(engine: StoreOperationsEngine): void {
  const session = gameSession();
  if (!session) return;
  const opening = numberFrom(optional<HTMLSelectElement>("opening-hour-select")?.value) || 8;
  const closing = numberFrom(optional<HTMLSelectElement>("closing-hour-select")?.value) || 20;
  const ordering = optional<HTMLSelectElement>("ordering-policy-select")?.value ?? "standard";
  const delivery = optional<HTMLSelectElement>("delivery-policy-select")?.value ?? "once_daily";
  const staffing = Object.fromEntries(
    POLICY_TIME_BLOCKS.map((block) => [
      block,
      Math.max(1, Math.round(numberFrom(optional<HTMLInputElement>(`staff-${block}`)?.value) || 2)),
    ]),
  ) as Record<TimeBlockId, number>;
  const snapshot = engine.getSnapshot();
  const assignments = snapshot.assignments;
  const shelfCapacities = Object.fromEntries(
    Object.entries(snapshot.inventories).map(([categoryId, inventory]) => [categoryId, inventory.shelfCapacity]),
  );

  const signature = JSON.stringify({ opening, closing, ordering, delivery, staffing, assignments, shelfCapacities });
  if (signature === lastAppliedPolicySignature) return;
  lastAppliedPolicySignature = signature;

  const { simulation } = session.session;
  if (opening >= 6 && closing <= 24 && opening < closing) {
    simulation.applyPolicy({ type: "set_opening_hours", openingHour: opening, closingHour: closing });
  }
  simulation.applyPolicy({ type: "set_ordering_policy", policy: ordering as OrderingPolicyId });
  simulation.applyPolicy({ type: "set_delivery_policy", policy: delivery as DeliveryPolicyId });
  for (const block of POLICY_TIME_BLOCKS) {
    const count = staffing[block];
    if (count >= 1 && count <= 4) {
      simulation.applyPolicy({ type: "set_staffing", timeBlock: block, count });
    }
  }
  const currentPriorities = simulation.getSnapshot().playerStore.taskPriorities;
  simulation.applyPolicy({
    type: "set_task_priorities",
    priorities: taskPrioritiesFromStaffAssignments(assignments, currentPriorities),
  });
  simulation.applyPolicy({
    type: "set_category_area",
    categoryArea: categoryAreaFromShelfCapacity(
      snapshot.inventories,
      session.scenario.categories,
      session.scenario.economy.totalShelfAreaPoints,
    ),
  });
}

function tilePixel(tile: TilePoint, geometry: StoreViewGeometry): { x: number; y: number } {
  return {
    x: geometry.gridX + tile.x * geometry.tileWidth,
    y: geometry.gridY + tile.y * geometry.tileHeight,
  };
}

function agentPixel(agent: { x: number; y: number }, geometry: StoreViewGeometry): { x: number; y: number } {
  return {
    x: geometry.gridX + (agent.x + 0.5) * geometry.tileWidth,
    y: geometry.gridY + (agent.y + 0.7) * geometry.tileHeight,
  };
}

function rect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | CanvasGradient | CanvasPattern,
  stroke = "#263240",
  lineWidth = 1,
): void {
  context.fillStyle = fill;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  if (lineWidth > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.strokeRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }
}

function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 13,
  align: CanvasTextAlign = "left",
  color = "#fff4cf",
): void {
  context.save();
  context.font = `800 ${size}px system-ui, -apple-system, "Noto Sans JP", sans-serif`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = "rgba(7,18,31,.9)";
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 1;
  context.fillText(value, Math.round(x), Math.round(y));
  context.restore();
}

function fixtureBounds(
  fixture: StoreFixture,
  geometry: StoreViewGeometry,
): { x: number; y: number; width: number; height: number } {
  const xs = fixture.tiles.map((tile) => tile.x);
  const ys = fixture.tiles.map((tile) => tile.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const topLeft = tilePixel({ x: minimumX, y: minimumY }, geometry);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: (maximumX - minimumX + 1) * geometry.tileWidth,
    height: (maximumY - minimumY + 1) * geometry.tileHeight,
  };
}

function drawFloor(context: CanvasRenderingContext2D, layout: StoreLayout, geometry: StoreViewGeometry): void {
  const width = layout.width * geometry.tileWidth;
  const height = layout.height * geometry.tileHeight;
  rect(context, geometry.gridX - 3, geometry.gridY - 3, width + 6, height + 6, "#b99f74", "#e4ad3e", 3);
  const floorGradient = context.createLinearGradient(0, geometry.gridY, 0, geometry.gridY + height);
  floorGradient.addColorStop(0, "#efe3c9");
  floorGradient.addColorStop(1, "#d7c39f");
  context.fillStyle = floorGradient;
  context.fillRect(geometry.gridX, geometry.gridY, width, height);

  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      const pixel = tilePixel({ x, y }, geometry);
      const edge = x === 0 || y === 0 || x === layout.width - 1 || y === layout.height - 1;
      if (edge) {
        const edgeGradient = context.createLinearGradient(pixel.x, pixel.y, pixel.x, pixel.y + geometry.tileHeight);
        edgeGradient.addColorStop(0, "#81796e");
        edgeGradient.addColorStop(1, "#69645d");
        context.fillStyle = edgeGradient;
        context.fillRect(pixel.x, pixel.y, geometry.tileWidth, geometry.tileHeight);
        context.strokeStyle = "rgba(31,38,42,.52)";
      } else {
        context.fillStyle = (x + y) % 2 === 0 ? "rgba(255,250,230,.11)" : "rgba(117,85,48,.035)";
        context.fillRect(pixel.x, pixel.y, geometry.tileWidth, geometry.tileHeight);
        context.strokeStyle = "rgba(112,86,55,.14)";
      }
      context.lineWidth = 1;
      context.strokeRect(pixel.x, pixel.y, geometry.tileWidth, geometry.tileHeight);
    }
  }

  const wallY = geometry.gridY;
  const wallGradient = context.createLinearGradient(0, wallY, 0, wallY + 21);
  wallGradient.addColorStop(0, "rgba(255,255,255,.48)");
  wallGradient.addColorStop(1, "rgba(173,151,119,.18)");
  context.fillStyle = wallGradient;
  context.fillRect(geometry.gridX + geometry.tileWidth, wallY + 1, width - geometry.tileWidth * 2, 19);
}

function fixtureLabel(fixture: StoreFixture): string | undefined {
  if (fixture.categoryId) return CATEGORY_LABELS[fixture.categoryId];
  if (fixture.kind === "entrance") return "入口";
  if (fixture.kind === "backroom") return "バックヤード";
  if (fixture.kind === "register") return "レジ";
  return undefined;
}

function drawFallbackFixture(
  context: CanvasRenderingContext2D,
  fixture: StoreFixture,
  bounds: ReturnType<typeof fixtureBounds>,
): void {
  const fill = fixture.kind === "register"
    ? "#d8d7ca"
    : fixture.kind === "entrance"
      ? "#92c2cc"
      : fixture.kind === "backroom"
        ? "#92785a"
        : fixture.kind === "waste"
          ? "#4f8954"
          : fixture.kind === "cold_case"
            ? "#d8e6e8"
            : fixture.kind === "frozen_case"
              ? "#bfe3f2"
              : fixture.kind === "hot_case"
                ? "#e8a24a"
                : "#78634d";
  rect(context, bounds.x, bounds.y, bounds.width, bounds.height, fill, "#344650", 2);
}

function drawFixture(
  context: CanvasRenderingContext2D,
  fixture: StoreFixture,
  snapshot: StoreOperationsSnapshot,
  geometry: StoreViewGeometry,
): void {
  const bounds = fixtureBounds(fixture, geometry);
  const artwork = storeArtAssets
    ? drawFixtureArtwork(context, storeArtAssets, fixture, snapshot, bounds, geometry.gridY)
    : undefined;
  if (!artwork) drawFallbackFixture(context, fixture, bounds);

  const label = fixtureLabel(fixture);
  if (label) {
    const x = artwork?.labelX ?? bounds.x + bounds.width / 2;
    const y = artwork?.labelY ?? bounds.y + 11;
    text(context, label, x, y, label.length >= 7 ? 8 : 10, "center");
  }

  if (fixture.categoryId) {
    const inventory = snapshot.inventories[fixture.categoryId];
    const ratio = inventory.shelfCapacity > 0 ? inventory.shelfUnits / inventory.shelfCapacity : 0;
    if (ratio <= 0.35) {
      const warning = ratio <= 0.02 ? "品切れ" : "残り少";
      const warningX = artwork?.warningX ?? bounds.x + bounds.width - 3;
      const warningY = artwork?.warningY ?? bounds.y + bounds.height - 3;
      const warningWidth = 48;
      rect(
        context,
        warningX - warningWidth,
        warningY - 18,
        warningWidth,
        18,
        ratio <= 0.02 ? "#ad2e2e" : "#d28722",
        "#fff1aa",
        1,
      );
      text(context, warning, warningX - warningWidth / 2, warningY - 9, 9, "center");
    }
  }
}

function drawBubble(context: CanvasRenderingContext2D, value: string, x: number, y: number): void {
  const width = Math.max(23, value.length * 11 + 10);
  rect(context, x - width / 2, y - 17, width, 18, "rgba(8,36,64,.96)", "#e7b544", 1);
  text(context, value, x, y - 8, 9, "center");
}

function drawCustomer(
  context: CanvasRenderingContext2D,
  customer: StoreCustomerAgent,
  geometry: StoreViewGeometry,
): void {
  const pixel = agentPixel(customer, geometry);
  if (storeArtAssets) drawAgentArtwork(context, storeArtAssets, customer, "customer", pixel);
  else {
    rect(context, pixel.x - 9, pixel.y - 27, 18, 34, "#315b8b", "#24303b", 1);
    rect(context, pixel.x - 6, pixel.y - 39, 12, 12, "#dda273", "#3a2822", 1);
  }
  if (customer.basketUnits > 0) {
    rect(context, pixel.x - 24, pixel.y - 4, 12, 14, "#2f79ad", "#173a53", 1);
  }
  let bubble: string | undefined;
  if (customer.regular) bubble = "★";
  if (customer.state === "browsing" && customer.targetCategory) bubble = CATEGORY_LABELS[customer.targetCategory].slice(0, 2);
  if (customer.state === "queueing" && customer.patienceRemainingSeconds < 6) bubble = "!";
  if (customer.state === "leaving" && customer.reason === "stockout") bubble = "品切?";
  if (customer.state === "leaving" && customer.reason === "price") bubble = "高い…";
  if (bubble) drawBubble(context, bubble, pixel.x, pixel.y - 83);
}

function drawStaff(
  context: CanvasRenderingContext2D,
  member: StoreStaffAgent,
  geometry: StoreViewGeometry,
): void {
  const pixel = agentPixel(member, geometry);
  if (storeArtAssets) drawAgentArtwork(context, storeArtAssets, member, "staff", pixel, member.task);
  else {
    rect(context, pixel.x - 9, pixel.y - 28, 18, 35, "#277e4c", "#24303b", 1);
    rect(context, pixel.x - 6, pixel.y - 40, 12, 12, "#dda273", "#3a2822", 1);
  }
  if (member.carryUnits > 0) {
    rect(context, pixel.x + 17, pixel.y - 20, 24, 18, "#bb8950", "#63472d", 1);
  }
  const active = member.state === "replenishing" || member.state === "cleaning";
  if (active) drawBubble(context, member.state === "cleaning" ? "清掃中" : "補充中", pixel.x, pixel.y - 92);
}

function drawLitter(
  context: CanvasRenderingContext2D,
  item: { x: number; y: number },
  geometry: StoreViewGeometry,
): void {
  const pixel = agentPixel(item, geometry);
  context.fillStyle = "#f5f0df";
  context.strokeStyle = "#8b806d";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(pixel.x - 7, pixel.y - 3);
  context.lineTo(pixel.x + 3, pixel.y - 7);
  context.lineTo(pixel.x + 8, pixel.y + 2);
  context.lineTo(pixel.x - 4, pixel.y + 6);
  context.closePath();
  context.fill();
  context.stroke();
}

function fixtureDepth(fixture: StoreFixture): number {
  return Math.max(...fixture.tiles.map((tile) => tile.y)) + 0.45;
}

function drawStoreContents(
  context: CanvasRenderingContext2D,
  layout: StoreLayout,
  snapshot: StoreOperationsSnapshot,
  geometry: StoreViewGeometry,
): void {
  for (const litter of snapshot.litter) drawLitter(context, litter, geometry);

  const items: Array<{ depth: number; draw: () => void }> = [];
  for (const fixture of layout.fixtures) {
    items.push({
      depth: fixtureDepth(fixture),
      draw: () => drawFixture(context, fixture, snapshot, geometry),
    });
  }
  for (const customer of snapshot.customers) {
    items.push({ depth: customer.y + 0.72, draw: () => drawCustomer(context, customer, geometry) });
  }
  for (const member of snapshot.staff) {
    items.push({ depth: member.y + 0.73, draw: () => drawStaff(context, member, geometry) });
  }
  items.sort((left, right) => left.depth - right.depth);
  for (const item of items) item.draw();
}

function drawStatusCard(
  context: CanvasRenderingContext2D,
  x: number,
  width: number,
  label: string,
  value: string,
  iconIndex?: number,
  valueColor = "#fff4cf",
): void {
  const gradient = context.createLinearGradient(x, 3, x, 39);
  gradient.addColorStop(0, "#123d66");
  gradient.addColorStop(1, "#082440");
  rect(context, x, 3, width, 36, gradient, "#e4ad3e", 2);
  if (storeArtAssets && iconIndex !== undefined) drawUiIcon(context, storeArtAssets, iconIndex, x + 7, 8, 25);
  const textX = x + (iconIndex === undefined ? 9 : 38);
  text(context, label, textX, 12, 8, "left", "#b8d5e8");
  text(context, value, textX, 27, 13, "left", valueColor);
}

function drawHud(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot): void {
  rect(context, 0, 0, LOGICAL_WIDTH, 42, "#06192d", "#e4ad3e", 2);
  rect(context, 7, 4, 92, 34, "#f3ead0", "#e4ad3e", 2);
  text(context, "コンビニ", 53, 13, 8, "center", "#126154");
  text(context, "FRONTIER 24", 53, 27, 12, "center", "#d64b27");
  drawStatusCard(context, 105, 94, "営業日", `${currentDay()}日目`);
  drawStatusCard(context, 205, 113, "時刻", optional("time-label")?.textContent ?? "06:00", 0);
  drawStatusCard(context, 324, 136, "天気", optional("weather-label")?.textContent ?? "晴れ", 7);
  drawStatusCard(context, 466, 232, "所持金", `¥${snapshot.cash.toLocaleString("ja-JP")}`, 6);
  drawStatusCard(context, 704, 174, "店内売上", `¥${snapshot.kpis.revenue.toLocaleString("ja-JP")}`, 5);
  const status = isStoreOpen() ? (isPlaying() ? "営業中" : "一時停止") : "営業時間外";
  drawStatusCard(context, 884, 188, "営業状態", status, undefined, isStoreOpen() ? "#fff4cf" : "#ffb5a8");
}

function drawInventoryBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  categoryId: StoreCategoryId,
  snapshot: StoreOperationsSnapshot,
): void {
  const inventory = snapshot.inventories[categoryId];
  const ratio = inventory.shelfCapacity > 0 ? inventory.shelfUnits / inventory.shelfCapacity : 0;
  text(context, CATEGORY_LABELS[categoryId], x, y, 9);
  rect(context, x, y + 11, width, 9, "#31475a", "#172637", 1);
  const color = ratio < 0.2 ? "#c53e38" : ratio < 0.45 ? "#d5962f" : "#5cac67";
  rect(context, x + 1, y + 12, Math.max(0, (width - 2) * ratio), 7, color, color, 0);
  text(context, `${inventory.shelfUnits}/${inventory.shelfCapacity}`, x + width, y, 9, "right", "#dceaf0");
}

function drawFooter(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot, geometry: StoreViewGeometry): void {
  const y = geometry.footerY;
  rect(context, 0, y, LOGICAL_WIDTH, LOGICAL_HEIGHT - y, "#071e36", "#e4ad3e", 2);
  const categories = Object.keys(CATEGORY_LABELS) as StoreCategoryId[];
  categories.forEach((categoryId, index) => {
    drawInventoryBar(context, 14 + index * 118, y + 15, 105, categoryId, snapshot);
  });

  const objectiveX = 842;
  text(context, "本日の経営目標", objectiveX, y + 10, 9, "left", "#f3cf6c");
  const statusColor: Record<StoreObjectiveStatus, string> = {
    active: "#d5962f",
    completed: "#5cac67",
    at_risk: "#d84b3f",
  };
  priorityStoreObjectives(snapshot).forEach((objective, index) => {
    const rowY = y + 20 + index * 20;
    const color = statusColor[objective.status];
    rect(context, objectiveX, rowY, 224, 17, "#0d3154", color, 1);
    text(context, objective.status === "completed" ? "✓" : objective.status === "at_risk" ? "!" : "•", objectiveX + 8, rowY + 9, 10, "center", color);
    text(context, objective.label, objectiveX + 17, rowY + 9, 8, "left", "#dceaf0");
    text(context, objective.progress, objectiveX + 218, rowY + 9, 8, "right", color);
  });
}

function drawFrame(
  context: CanvasRenderingContext2D,
  layout: StoreLayout,
  snapshot: StoreOperationsSnapshot,
  editorOpen: boolean,
): void {
  const geometry = editorOpen ? EDITOR_GEOMETRY : PLAY_GEOMETRY;
  context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const background = context.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
  background.addColorStop(0, "#0b2b49");
  background.addColorStop(1, "#061523");
  context.fillStyle = background;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawHud(context, snapshot);
  drawFloor(context, layout, geometry);
  drawStoreContents(context, layout, snapshot, geometry);
  drawFooter(context, snapshot, geometry);
}

function buildShell(): HTMLElement {
  const shell = document.createElement("main");
  shell.id = "store-game-shell";
  shell.innerHTML = `
    <section class="store-game-stage" aria-label="コンビニ店内営業">
      <canvas id="store-game-canvas" width="1080" height="500"></canvas>
      <button type="button" class="store-game-menu" data-game-action="detail" aria-label="詳細設定">詳細</button>
      <div class="live-incident" data-live-incident hidden><strong></strong><span></span></div>
      <div class="orientation-message">端末を横向きにしてください</div>
    </section>
    <nav class="store-game-nav" aria-label="主要メニュー">
      <button type="button" data-game-action="time"><span class="store-nav-icon store-nav-icon--time" aria-hidden="true"></span><b>時間</b></button>
      <button type="button" data-game-action="store"><span class="store-nav-icon store-nav-icon--store" aria-hidden="true"></span><b>店舗</b></button>
      <button type="button" data-game-action="product"><span class="store-nav-icon store-nav-icon--product" aria-hidden="true"></span><b>商品</b></button>
      <button type="button" data-game-action="order"><span class="store-nav-icon store-nav-icon--order" aria-hidden="true"></span><b>発注</b></button>
      <button type="button" data-game-action="staff"><span class="store-nav-icon store-nav-icon--staff" aria-hidden="true"></span><b>人員</b></button>
      <button type="button" data-game-action="info"><span class="store-nav-icon store-nav-icon--info" aria-hidden="true"></span><b>情報</b></button>
    </nav>
    <section class="store-staff-panel" id="store-staff-panel" hidden>
      <header><strong>店員の作業優先順位</strong><button type="button" data-close-staff>閉じる</button></header>
      <p>優先作業がなければ、行列・補充・清掃のうち発生している仕事を自動で手伝います。</p>
      <div class="staff-recommendation">
        <strong data-staff-recommendation-label>おすすめ</strong>
        <span data-staff-recommendation-reason></span>
        <button type="button" data-apply-recommendation>おすすめ優先度を適用</button>
      </div>
      <div class="staff-presets" aria-label="店員作業優先度プリセット">
        <button type="button" data-staff-preset="balanced">バランス</button>
        <button type="button" data-staff-preset="register">レジ優先</button>
        <button type="button" data-staff-preset="replenishment">補充優先</button>
        <button type="button" data-staff-preset="cleaning">清掃優先</button>
      </div>
      <div class="staff-assignment-grid"></div>
    </section>
    <section class="store-supply-panel" id="store-supply-panel" hidden>
      <header><strong>発注・納品方針</strong><button type="button" data-close-supply>閉じる</button></header>
      <div class="supply-recommendation">
        <strong data-supply-recommendation-label>おすすめ</strong>
        <span data-supply-recommendation-reason></span>
        <button type="button" data-apply-supply-recommendation>おすすめを適用</button>
      </div>
      <h3>発注量</h3>
      <div class="supply-presets">
        <button type="button" data-ordering-preset="sell_through">売り切り重視<small>納品を抑える</small></button>
        <button type="button" data-ordering-preset="standard">標準<small>需要相当</small></button>
        <button type="button" data-ordering-preset="stockout_prevention">欠品防止<small>多めに確保</small></button>
      </div>
      <h3>納品回数</h3>
      <div class="supply-presets">
        <button type="button" data-delivery-preset="once_daily">一日一回</button>
        <button type="button" data-delivery-preset="ready_to_eat_twice_daily">弁当のみ二回</button>
        <button type="button" data-delivery-preset="all_categories_twice_daily">全商品二回</button>
      </div>
      <p class="supply-message" data-supply-message>変更は翌日の納品から店内在庫へ反映されます。</p>
    </section>
    <section class="store-product-panel" id="store-product-panel" hidden>
      <header><strong>重点商品カテゴリー</strong><button type="button" data-close-product>閉じる</button></header>
      <p>重点カテゴリーはお客の注目を集め、補充時にも少し優先されます。</p>
      <div class="product-focus-grid"></div>
      <button type="button" class="product-detail-button" data-open-product-detail>売場面積を詳しく設定</button>
      <h3>設備投資</h3>
      <p>資金を投じて棚を拡張すると、そのカテゴリーの陳列数と補充目標が増えます。</p>
      <p class="investment-message" data-investment-message></p>
      <div class="product-investment-grid"></div>
      <h3>陳列替え</h3>
      <p>什器を2つ選ぶと、陳列しているカテゴリーを入れ替えられます。常温什器同士・冷蔵ケース同士のみ入れ替え可能です。</p>
      <p class="investment-message" data-swap-message></p>
      <div class="fixture-swap-grid"></div>
    </section>
    <section class="store-info-panel" id="store-info-panel" hidden>
      <header><strong>店舗情報</strong><button type="button" data-close-info>閉じる</button></header>
      <div class="performance-summary">
        <strong class="performance-grade" data-performance-grade>B</strong>
        <div><b data-performance-headline>営業準備中</b><span data-performance-action></span></div>
      </div>
      <div class="operations-pulse">
        <span data-days-since-change></span>
        <span data-revenue-trend></span>
      </div>
      <div class="performance-grid"></div>
      <div class="daily-history" data-daily-history></div>
      <button type="button" class="info-detail-button" data-open-info-detail>日報・地域・競合レポートを見る</button>
    </section>
    <section class="store-time-panel" id="store-time-panel" hidden>
      <header><strong>時間操作</strong><button type="button" data-close-time>閉じる</button></header>
      <div class="time-now"><span>現在</span><strong data-time-now>1日目 06:00</strong></div>
      <div class="time-command-grid">
        <button type="button" data-time-command="play">▶ 再生／停止</button>
        <button type="button" data-time-command="slot">＋15分</button>
        <button type="button" data-time-command="day">翌日まで</button>
      </div>
      <h3>進行速度</h3>
      <div class="time-speed-grid">
        <button type="button" data-time-speed="1">1倍</button>
        <button type="button" data-time-speed="4">4倍</button>
        <button type="button" data-time-speed="20">20倍</button>
      </div>
      <label class="time-auto-stop"><input type="checkbox" data-time-auto-stop />重大問題を検出したら自動停止</label>
    </section>
    <section class="store-policy-panel" id="store-policy-panel" hidden>
      <header><strong>店舗運営</strong><button type="button" data-close-store-policy>閉じる</button></header>
      <div class="store-live-status"><span data-store-live-status>営業準備中</span><strong data-store-customer-count>店内 0人</strong></div>
      <h3>営業時間</h3>
      <div class="opening-hour-presets">
        <button type="button" data-opening-hours="8,20">8〜20時<small>低コスト</small></button>
        <button type="button" data-opening-hours="7,21">7〜21時<small>標準</small></button>
        <button type="button" data-opening-hours="7,23">7〜23時<small>長時間</small></button>
        <button type="button" data-opening-hours="6,24">6〜24時<small>最大営業</small></button>
      </div>
      <button type="button" class="layout-edit-button" data-open-layout-editor>売場レイアウトを編集</button>
      <p class="layout-edit-reason" data-layout-edit-reason></p>
    </section>
  `;
  document.body.prepend(shell);
  return shell;
}

function openDetail(target: "product" | "order" | "info" | "detail"): void {
  document.body.classList.add("store-detail-open");
  const map: Record<typeof target, string> = {
    product: "category-area-controls",
    order: "ordering-policy-select",
    info: "report-panel",
    detail: "app",
  };
  window.setTimeout(() => document.getElementById(map[target])?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function readSavedEngine(): SerializedStoreOperations | undefined {
  try {
    const raw = window.localStorage.getItem(STORE_SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SerializedStoreOperations;
    if (parsed.version !== 1) return undefined;
    if (parsed.day > currentDay() || currentDay() - parsed.day > 1) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function saveEngine(engine: StoreOperationsEngine): void {
  try {
    window.localStorage.setItem(STORE_SAVE_KEY, JSON.stringify(engine.serialize()));
  } catch {
    // Gameplay continues when storage is unavailable.
  }
}

function assignmentFromPanel(panel: HTMLElement): StoreStaffAssignments {
  const result: StoreStaffAssignments = { register: 0, replenishment: 0, cleaning: 0 };
  panel.querySelectorAll<HTMLButtonElement>("[data-staff-member][aria-pressed='true']").forEach((button) => {
    const task = button.dataset.staffTask as StoreStaffTask | undefined;
    if (task) result[task] += 1;
  });
  return result;
}

function renderStaffPanel(panel: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const grid = panel.querySelector<HTMLElement>(".staff-assignment-grid");
  if (!grid) return;
  const tasks: StoreStaffTask[] = [];
  for (const task of ["register", "replenishment", "cleaning"] as const) {
    for (let count = 0; count < snapshot.assignments[task]; count += 1) tasks.push(task);
  }
  grid.replaceChildren();
  snapshot.staff.forEach((member, index) => {
    const row = document.createElement("div");
    row.className = "staff-assignment-row";
      row.innerHTML = `<strong>店員${index + 1}<small>優先</small></strong>`;
    for (const task of ["register", "replenishment", "cleaning"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.staffMember = String(index);
      button.dataset.staffTask = task;
      button.textContent = TASK_LABELS[task];
      button.setAttribute("aria-pressed", String((tasks[index] ?? member.task) === task));
      row.append(button);
    }
    grid.append(row);
  });
  const recommendation = recommendStaffing(snapshot);
  const label = panel.querySelector<HTMLElement>("[data-staff-recommendation-label]");
  const reason = panel.querySelector<HTMLElement>("[data-staff-recommendation-reason]");
  const apply = panel.querySelector<HTMLButtonElement>("[data-apply-recommendation]");
  if (label) label.textContent = recommendation.label;
  if (reason) reason.textContent = recommendation.reason;
  if (apply) apply.dataset.staffPreset = recommendation.preset;
}

function renderSupplyPanel(panel: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const recommendation = recommendSupplyPolicy(snapshot);
  const label = panel.querySelector<HTMLElement>("[data-supply-recommendation-label]");
  const reason = panel.querySelector<HTMLElement>("[data-supply-recommendation-reason]");
  const apply = panel.querySelector<HTMLButtonElement>("[data-apply-supply-recommendation]");
  if (label) label.textContent = recommendation.label;
  if (reason) reason.textContent = recommendation.reason;
  if (apply) {
    apply.dataset.orderingPreset = recommendation.ordering;
    apply.dataset.deliveryPreset = recommendation.delivery;
  }
  const ordering = optional<HTMLSelectElement>("ordering-policy-select")?.value;
  const delivery = optional<HTMLSelectElement>("delivery-policy-select")?.value;
  panel.querySelectorAll<HTMLButtonElement>("[data-ordering-preset]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.orderingPreset === ordering));
  });
  panel.querySelectorAll<HTMLButtonElement>("[data-delivery-preset]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.deliveryPreset === delivery));
  });
}

let selectedSwapFixtureId: string | undefined;

function renderProductPanel(panel: HTMLElement, snapshot: StoreOperationsSnapshot, layout: StoreLayout): void {
  const grid = panel.querySelector<HTMLElement>(".product-focus-grid");
  if (!grid) return;
  grid.replaceChildren();
  for (const categoryId of Object.keys(CATEGORY_LABELS) as StoreCategoryId[]) {
    const inventory = snapshot.inventories[categoryId];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.productFocus = categoryId;
    button.setAttribute("aria-pressed", String(snapshot.merchandisingFocus === categoryId));
    const priceRange = categoryPriceRange(categoryId);
    button.innerHTML = `<strong>${CATEGORY_LABELS[categoryId]}</strong><span>棚 ${inventory.shelfUnits}/${inventory.shelfCapacity}</span><small>倉庫 ${inventory.backroomUnits}</small>`;
    grid.append(button);
    const priceControls = document.createElement("div");
    priceControls.className = "product-price-controls";
    priceControls.innerHTML = `
      <button type="button" data-price-category="${categoryId}" data-price-delta="-10" ${inventory.price <= priceRange.min ? "disabled" : ""}>−</button>
      <output>¥${inventory.price.toLocaleString("ja-JP")}</output>
      <button type="button" data-price-category="${categoryId}" data-price-delta="10" ${inventory.price >= priceRange.max ? "disabled" : ""}>＋</button>`;
    grid.append(priceControls);
  }
  renderInvestmentGrid(panel, snapshot);
  renderFixtureSwapGrid(panel, layout);
}

const FIXTURE_KIND_LABELS: Partial<Record<FixtureKind, string>> = {
  shelf: "常温什器",
  cold_case: "冷蔵ケース",
  frozen_case: "冷凍ケース",
  hot_case: "HOTケース",
};

function renderFixtureSwapGrid(panel: HTMLElement, layout: StoreLayout): void {
  const grid = panel.querySelector<HTMLElement>(".fixture-swap-grid");
  if (!grid) return;
  grid.replaceChildren();
  const swappable = layout.fixtures.filter((fixture) => fixture.categoryId !== undefined);
  for (const fixture of swappable) {
    const categoryId = fixture.categoryId;
    if (!categoryId) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.swapFixture = fixture.id;
    button.setAttribute("aria-pressed", String(selectedSwapFixtureId === fixture.id));
    button.innerHTML = `<strong>${CATEGORY_LABELS[categoryId]}</strong><small>${FIXTURE_KIND_LABELS[fixture.kind] ?? fixture.kind}</small>`;
    grid.append(button);
  }
}

function renderInvestmentGrid(panel: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const grid = panel.querySelector<HTMLElement>(".product-investment-grid");
  if (!grid) return;
  grid.replaceChildren();
  for (const categoryId of Object.keys(CATEGORY_LABELS) as StoreCategoryId[]) {
    const inventory = snapshot.inventories[categoryId];
    const tier = snapshot.categoryTiers[categoryId] ?? 0;
    const maxTier = maxShelfTier(categoryId);
    const investment = nextCapacityInvestment(categoryId, tier);
    const row = document.createElement("div");
    row.className = "product-investment-row";
    const tierLabel = `拡張 ${tier}/${maxTier}`;
    if (investment) {
      const affordable = snapshot.cash >= investment.cost;
      row.innerHTML = `
        <strong>${CATEGORY_LABELS[categoryId]}</strong>
        <span>棚容量 ${inventory.shelfCapacity}<small>(+${investment.capacityBonus})</small></span>
        <small>${tierLabel}</small>
        <button type="button" data-invest-category="${categoryId}" ${affordable ? "" : "disabled"}>¥${investment.cost.toLocaleString("ja-JP")}で拡張</button>`;
    } else {
      row.innerHTML = `
        <strong>${CATEGORY_LABELS[categoryId]}</strong>
        <span>棚容量 ${inventory.shelfCapacity}</span>
        <small>${tierLabel}</small>
        <button type="button" disabled>拡張済み</button>`;
    }
    grid.append(row);
  }
}

function renderInfoPanel(panel: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const summary = summarizeStorePerformance(snapshot);
  const grade = panel.querySelector<HTMLElement>("[data-performance-grade]");
  const headline = panel.querySelector<HTMLElement>("[data-performance-headline]");
  const action = panel.querySelector<HTMLElement>("[data-performance-action]");
  if (grade) grade.textContent = summary.grade;
  if (headline) headline.textContent = summary.headline;
  if (action) action.textContent = summary.nextAction;

  const daysSinceChange = panel.querySelector<HTMLElement>("[data-days-since-change]");
  if (daysSinceChange) {
    daysSinceChange.textContent = snapshot.daysSincePolicyChange <= 0
      ? "本日操作あり"
      : `未操作 ${snapshot.daysSincePolicyChange}日`;
    daysSinceChange.classList.toggle("operations-pulse--warn", snapshot.daysSincePolicyChange >= 5);
  }
  const revenueTrend = panel.querySelector<HTMLElement>("[data-revenue-trend]");
  if (revenueTrend) {
    const trend = computeRevenueTrend(snapshot.dailyHistory);
    const trendLabel: Record<typeof trend, string> = {
      improving: "業績 改善傾向 ↑",
      flat: "業績 横ばい →",
      declining: "業績 悪化傾向 ↓",
      insufficient_data: "業績 傾向データ不足",
    };
    revenueTrend.textContent = trendLabel[trend];
    revenueTrend.classList.toggle("operations-pulse--warn", trend === "declining");
  }

  const percent = (value: number): string => `${Math.round(value * 100)}%`;
  const grid = panel.querySelector<HTMLElement>(".performance-grid");
  if (grid) {
    grid.innerHTML = `
      <div><span>購入率</span><strong>${percent(summary.conversionRate)}</strong></div>
      <div><span>在庫充足</span><strong>${percent(summary.availabilityRate)}</strong></div>
      <div><span>レジ対応</span><strong>${percent(summary.serviceRate)}</strong></div>
      <div><span>清潔度</span><strong>${percent(summary.cleanlinessRate)}</strong></div>
      <div><span>店舗信頼</span><strong>${percent(snapshot.serviceTrust)}</strong></div>
      <div><span>常連会計</span><strong>${snapshot.kpis.regularTransactions}/${snapshot.kpis.regularVisits}</strong></div>
      <div><span>売上</span><strong>¥${snapshot.kpis.revenue.toLocaleString("ja-JP")}</strong></div>
      <div><span>価格不満</span><strong>${snapshot.kpis.priceRefusals}件</strong></div>
      <div><span>来店／会計</span><strong>${snapshot.kpis.enteredCustomers}／${snapshot.kpis.transactions}</strong></div>`;
  }
  const history = panel.querySelector<HTMLElement>("[data-daily-history]");
  if (history) {
    const recent = snapshot.dailyHistory.slice(-5).reverse();
    history.innerHTML = recent.length === 0
      ? "<p>一日の営業を終えると、ここに推移が表示されます。</p>"
      : `<h3>直近の営業</h3>${recent.map((result) => {
          const conversion = result.enteredCustomers > 0
            ? Math.round(result.transactions / result.enteredCustomers * 100)
            : 0;
          return `<div><b>${result.day}日目</b><span>売上 ¥${result.revenue.toLocaleString("ja-JP")}</span><span>購入率 ${conversion}%</span><small>信頼${Math.round(result.serviceTrust * 100)}%／常連${result.regularTransactions}件</small></div>`;
        }).join("")}`;
  }
}

function renderTimePanel(panel: HTMLElement): void {
  const now = panel.querySelector<HTMLElement>("[data-time-now]");
  if (now) now.textContent = `${currentDay()}日目 ${optional("time-label")?.textContent ?? "06:00"}`;
  const speed = optional<HTMLSelectElement>("speed-select")?.value ?? "1";
  panel.querySelectorAll<HTMLButtonElement>("[data-time-speed]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.timeSpeed === speed));
  });
  const autoStop = panel.querySelector<HTMLInputElement>("[data-time-auto-stop]");
  if (autoStop) autoStop.checked = optional<HTMLInputElement>("auto-stop-checkbox")?.checked ?? true;
}

function renderStorePolicyPanel(panel: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const status = panel.querySelector<HTMLElement>("[data-store-live-status]");
  const count = panel.querySelector<HTMLElement>("[data-store-customer-count]");
  const reason = panel.querySelector<HTMLElement>("[data-layout-edit-reason]");
  const edit = panel.querySelector<HTMLButtonElement>("[data-open-layout-editor]");
  if (status) status.textContent = isStoreOpen() ? (isPlaying() ? "営業中" : "一時停止中") : "営業時間外";
  if (count) count.textContent = `店内 ${snapshot.customers.length}人`;
  const canEdit = !isPlaying() && snapshot.customers.length === 0;
  if (edit) edit.disabled = !canEdit;
  if (reason) {
    reason.textContent = canEdit
      ? "店内に客がいないため編集できます。"
      : isPlaying()
        ? "時間を停止すると編集準備に入れます。"
        : `あと${snapshot.customers.length}人の退店後に編集できます。`;
  }
  const opening = optional<HTMLSelectElement>("opening-hour-select")?.value;
  const closing = optional<HTMLSelectElement>("closing-hour-select")?.value;
  panel.querySelectorAll<HTMLButtonElement>("[data-opening-hours]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.openingHours === `${opening},${closing}`));
  });
}

function renderLiveIncident(shell: HTMLElement, snapshot: StoreOperationsSnapshot): void {
  const banner = shell.querySelector<HTMLElement>("[data-live-incident]");
  if (!banner) return;
  const incident = detectStoreIncidents(snapshot)[0];
  if (!incident) {
    banner.hidden = true;
    lastAutoStoppedIncident = "";
    return;
  }
  banner.hidden = false;
  banner.dataset.severity = incident.severity;
  const title = banner.querySelector("strong");
  const detail = banner.querySelector("span");
  if (title) title.textContent = incident.title;
  if (detail) detail.textContent = incident.detail;
  const autoStop = optional<HTMLInputElement>("auto-stop-checkbox")?.checked ?? true;
  if (incident.severity === "critical" && autoStop && isPlaying() && lastAutoStoppedIncident !== incident.id) {
    lastAutoStoppedIncident = incident.id;
    optional<HTMLButtonElement>("play-button")?.click();
  }
}

function bindNavigation(
  shell: HTMLElement,
  layoutEditor: StoreLayoutEditorUi,
  getEngine: () => StoreOperationsEngine,
  replaceEngine: (engine: StoreOperationsEngine) => void,
): void {
  const staffPanel = shell.querySelector<HTMLElement>("#store-staff-panel");
  const supplyPanel = shell.querySelector<HTMLElement>("#store-supply-panel");
  const productPanel = shell.querySelector<HTMLElement>("#store-product-panel");
  const infoPanel = shell.querySelector<HTMLElement>("#store-info-panel");
  const timePanel = shell.querySelector<HTMLElement>("#store-time-panel");
  const storePolicyPanel = shell.querySelector<HTMLElement>("#store-policy-panel");
  shell.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const closeStaff = target?.closest<HTMLButtonElement>("[data-close-staff]");
    if (closeStaff && staffPanel) {
      staffPanel.hidden = true;
      return;
    }
    if (target?.closest("[data-close-supply]") && supplyPanel) {
      supplyPanel.hidden = true;
      return;
    }
    if (target?.closest("[data-close-product]") && productPanel) {
      productPanel.hidden = true;
      return;
    }
    if (target?.closest("[data-close-info]") && infoPanel) {
      infoPanel.hidden = true;
      return;
    }
    if (target?.closest("[data-close-time]") && timePanel) {
      timePanel.hidden = true;
      return;
    }
    if (target?.closest("[data-close-store-policy]") && storePolicyPanel) {
      storePolicyPanel.hidden = true;
      return;
    }
    if (target?.closest("[data-open-info-detail]")) {
      openDetail("info");
      return;
    }
    if (target?.closest("[data-open-product-detail]")) {
      openDetail("product");
      return;
    }
    const staffChoice = target?.closest<HTMLButtonElement>("[data-staff-member]");
    if (staffChoice && staffPanel) {
      const row = staffChoice.closest(".staff-assignment-row");
      row?.querySelectorAll<HTMLButtonElement>("[data-staff-member]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button === staffChoice));
      });
      getEngine().setStaffAssignments(assignmentFromPanel(staffPanel));
      renderStaffPanel(staffPanel, getEngine().getSnapshot());
      saveEngine(getEngine());
      return;
    }
    const presetButton = target?.closest<HTMLButtonElement>("[data-staff-preset]");
    if (presetButton && staffPanel) {
      const preset = presetButton.dataset.staffPreset as StoreStaffPreset | undefined;
      if (!preset) return;
      const snapshot = getEngine().getSnapshot();
      getEngine().setStaffAssignments(assignmentsForPreset(preset, snapshot.staff.length));
      renderStaffPanel(staffPanel, getEngine().getSnapshot());
      saveEngine(getEngine());
      return;
    }
    const supplyButton = target?.closest<HTMLButtonElement>(
      "[data-ordering-preset], [data-delivery-preset]",
    );
    if (supplyButton && supplyPanel) {
      const orderingSelect = optional<HTMLSelectElement>("ordering-policy-select");
      const deliverySelect = optional<HTMLSelectElement>("delivery-policy-select");
      if (supplyButton.dataset.orderingPreset && orderingSelect) {
        orderingSelect.value = supplyButton.dataset.orderingPreset;
      }
      if (supplyButton.dataset.deliveryPreset && deliverySelect) {
        deliverySelect.value = supplyButton.dataset.deliveryPreset;
      }
      optional<HTMLButtonElement>("apply-policy-button")?.click();
      syncSupplyPolicy(getEngine());
      renderSupplyPanel(supplyPanel, getEngine().getSnapshot());
      saveEngine(getEngine());
      return;
    }
    const focusButton = target?.closest<HTMLButtonElement>("[data-product-focus]");
    if (focusButton && productPanel) {
      const category = focusButton.dataset.productFocus as StoreCategoryId | undefined;
      if (!category) return;
      const snapshot = getEngine().getSnapshot();
      getEngine().setMerchandisingFocus(snapshot.merchandisingFocus === category ? undefined : category);
      renderProductPanel(productPanel, getEngine().getSnapshot(), getEngine().getLayout());
      saveEngine(getEngine());
      return;
    }
    const priceButton = target?.closest<HTMLButtonElement>("[data-price-category]");
    if (priceButton && productPanel) {
      const category = priceButton.dataset.priceCategory as StoreCategoryId | undefined;
      const delta = Number(priceButton.dataset.priceDelta);
      if (!category || !Number.isFinite(delta)) return;
      const inventory = getEngine().getSnapshot().inventories[category];
      getEngine().setCategoryPrice(category, inventory.price + delta);
      renderProductPanel(productPanel, getEngine().getSnapshot(), getEngine().getLayout());
      saveEngine(getEngine());
      return;
    }
    const investButton = target?.closest<HTMLButtonElement>("[data-invest-category]");
    if (investButton && productPanel) {
      const category = investButton.dataset.investCategory as StoreCategoryId | undefined;
      if (!category) return;
      const result = getEngine().investInCategoryCapacity(category);
      const message = productPanel.querySelector<HTMLElement>("[data-investment-message]");
      if (message) message.textContent = result.message;
      renderProductPanel(productPanel, getEngine().getSnapshot(), getEngine().getLayout());
      saveEngine(getEngine());
      return;
    }
    const swapButton = target?.closest<HTMLButtonElement>("[data-swap-fixture]");
    if (swapButton && productPanel) {
      const fixtureId = swapButton.dataset.swapFixture;
      if (!fixtureId) return;
      const message = productPanel.querySelector<HTMLElement>("[data-swap-message]");
      if (!selectedSwapFixtureId) {
        selectedSwapFixtureId = fixtureId;
        if (message) message.textContent = "入れ替え先の什器を選んでください";
      } else if (selectedSwapFixtureId === fixtureId) {
        selectedSwapFixtureId = undefined;
        if (message) message.textContent = "";
      } else {
        const result = getEngine().swapFixtureCategories(selectedSwapFixtureId, fixtureId);
        selectedSwapFixtureId = undefined;
        if (message) message.textContent = result.message;
        if (result.ok) {
          // The canvas render loop draws from a `layout` snapshot captured once at
          // startup; refresh it so swapped fixtures show their new artwork immediately
          // instead of only after the next replaceEngine (day rollover or reload).
          replaceEngine(getEngine());
          saveStoreLayout(getEngine().getLayout());
        }
        saveEngine(getEngine());
      }
      renderProductPanel(productPanel, getEngine().getSnapshot(), getEngine().getLayout());
      return;
    }
    const timeCommand = target?.closest<HTMLButtonElement>("[data-time-command]");
    if (timeCommand && timePanel) {
      const proxyId = {
        play: "play-button",
        slot: "slot-button",
        day: "day-button",
      }[timeCommand.dataset.timeCommand ?? ""];
      if (proxyId) optional<HTMLButtonElement>(proxyId)?.click();
      renderTimePanel(timePanel);
      return;
    }
    const speedButton = target?.closest<HTMLButtonElement>("[data-time-speed]");
    if (speedButton && timePanel) {
      const select = optional<HTMLSelectElement>("speed-select");
      if (select && speedButton.dataset.timeSpeed) {
        select.value = speedButton.dataset.timeSpeed;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      renderTimePanel(timePanel);
      return;
    }
    const autoStopInput = target?.closest<HTMLInputElement>("[data-time-auto-stop]");
    if (autoStopInput) {
      const source = optional<HTMLInputElement>("auto-stop-checkbox");
      if (source) {
        source.checked = autoStopInput.checked;
        source.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    const hoursButton = target?.closest<HTMLButtonElement>("[data-opening-hours]");
    if (hoursButton && storePolicyPanel) {
      const [opening, closing] = (hoursButton.dataset.openingHours ?? "").split(",");
      const openingSelect = optional<HTMLSelectElement>("opening-hour-select");
      const closingSelect = optional<HTMLSelectElement>("closing-hour-select");
      if (opening && closing && openingSelect && closingSelect) {
        openingSelect.value = opening;
        closingSelect.value = closing;
        optional<HTMLButtonElement>("apply-policy-button")?.click();
      }
      renderStorePolicyPanel(storePolicyPanel, getEngine().getSnapshot());
      return;
    }
    if (target?.closest("[data-open-layout-editor]") && storePolicyPanel) {
      storePolicyPanel.hidden = true;
      layoutEditor.open();
      return;
    }

    const button = target?.closest<HTMLButtonElement>("[data-game-action]");
    if (!button) return;
    const action = button.dataset.gameAction;
    if (action === "time") {
      if (timePanel) {
        renderTimePanel(timePanel);
        timePanel.hidden = !timePanel.hidden;
      }
      return;
    }
    if (action === "store") {
      if (storePolicyPanel) {
        renderStorePolicyPanel(storePolicyPanel, getEngine().getSnapshot());
        storePolicyPanel.hidden = !storePolicyPanel.hidden;
      }
      return;
    }
    if (action === "staff" && staffPanel) {
      renderStaffPanel(staffPanel, getEngine().getSnapshot());
      staffPanel.hidden = !staffPanel.hidden;
      return;
    }
    if (action === "order" && supplyPanel) {
      renderSupplyPanel(supplyPanel, getEngine().getSnapshot());
      supplyPanel.hidden = !supplyPanel.hidden;
      return;
    }
    if (action === "product" && productPanel) {
      renderProductPanel(productPanel, getEngine().getSnapshot(), getEngine().getLayout());
      productPanel.hidden = !productPanel.hidden;
      return;
    }
    if (action === "info" && infoPanel) {
      renderInfoPanel(infoPanel, getEngine().getSnapshot());
      infoPanel.hidden = !infoPanel.hidden;
      return;
    }
    if (action === "detail") {
      openDetail(action);
    }
  });

  const close = document.createElement("button");
  close.type = "button";
  close.id = "close-store-detail";
  close.textContent = "店内へ戻る";
  close.addEventListener("click", () => document.body.classList.remove("store-detail-open"));
  document.body.append(close);

  optional<HTMLButtonElement>("reset-button")?.addEventListener("click", () => {
    window.localStorage.removeItem(STORE_SAVE_KEY);
    const seed = Math.round(numberFrom(optional<HTMLInputElement>("seed-input")?.value) || 1977);
    replaceEngine(createStoreOperationsEngine(seed, loadSavedStoreLayout()));
  });
}

function start(): void {
  const app = optional<HTMLElement>("app");
  if (!app || app.hidden || !optional("day-label")) {
    window.setTimeout(start, 100);
    return;
  }

  document.body.classList.add("store-game-mode");
  const shell = buildShell();
  const canvas = optional<HTMLCanvasElement>("store-game-canvas");
  const contextCandidate = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !contextCandidate) return;
  const context: CanvasRenderingContext2D = contextCandidate;
  const resizeCanvas = (): void => {
    configureHiDpiCanvas(canvas, context, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  void loadStoreArtAssets().then((assets) => {
    storeArtAssets = assets;
  });
  void getGameSession();

  const seed = Math.round(numberFrom(optional<HTMLInputElement>("seed-input")?.value) || 1977);
  const saved = readSavedEngine();
  const savedLayout = loadSavedStoreLayout();
  let engine = saved
    ? restoreStoreOperationsEngine(saved, savedLayout)
    : createStoreOperationsEngine(seed, savedLayout);
  let layout = engine.getLayout();
  let lastTimestamp = performance.now();
  let lastSaveTimestamp = lastTimestamp;
  let knownDay = currentDay();
  // beginDay() only reconciles cash once the visual day actually changes, which does
  // not happen during day 1 of a fresh game/reset (knownDay already matches
  // currentDay() by then). Reconcile once, as soon as the real session loads, so the
  // engine doesn't sit on its own hard-coded starting cash for all of day 1.
  let hasReconciledInitialCash = false;

  const getEngine = (): StoreOperationsEngine => engine;
  const replaceEngine = (next: StoreOperationsEngine): void => {
    engine = next;
    layout = next.getLayout();
    knownDay = currentDay();
    // The new engine (a fresh createStoreOperationsEngine() on reset, or a
    // serialize()+restore() clone on a layout edit) needs its own cash
    // reconciliation pass — see the render loop below. Harmless to redo even when
    // the engine already carried the right cash forward (a layout edit): it just
    // reconfirms the same real figure.
    hasReconciledInitialCash = false;
  };
  const layoutEditor = createStoreLayoutEditorUi({
    shell,
    canvas,
    getEngine,
    replaceEngine,
    canEdit: () => !isPlaying() && engine.getSnapshot().customers.length === 0,
  });
  bindNavigation(shell, layoutEditor, getEngine, replaceEngine);

  engine.advance(0.01, engineContext(engine.getSnapshot().merchandisingFocus));

  const render = (timestamp: number): void => {
    const realDelta = Math.min(0.1, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    const day = currentDay();
    syncSupplyPolicy(engine);
    syncPolicyToRealEngine(engine);
    if (!hasReconciledInitialCash) {
      const session = gameSession();
      if (session) {
        engine.setCash(session.session.simulation.getSnapshot().cash);
        hasReconciledInitialCash = true;
      }
    }
    if (day !== knownDay) {
      engine.beginDay(
        day,
        gameSession()?.session.simulation.getSnapshot().cash,
        realStockoutSeverityByCategory(),
      );
      knownDay = day;
    }
    const focus = engine.getSnapshot().merchandisingFocus;
    if (isPlaying()) engine.advance(realDelta * visualTimeScale(), engineContext(focus));
    else engine.advance(0.001, engineContext(focus));

    const snapshot = engine.getSnapshot();
    drawFrame(context, layout, snapshot, layoutEditor.isOpen());
    renderLiveIncident(shell, snapshot);
    const timeButton = shell.querySelector<HTMLButtonElement>("[data-game-action='time']");
    if (timeButton) timeButton.setAttribute("aria-pressed", String(isPlaying()));

    if (timestamp - lastSaveTimestamp >= 2000) {
      saveEngine(engine);
      lastSaveTimestamp = timestamp;
    }
    window.requestAnimationFrame(render);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveEngine(engine);
  });
  window.addEventListener("beforeunload", () => saveEngine(engine));
  window.requestAnimationFrame(render);
}

start();
