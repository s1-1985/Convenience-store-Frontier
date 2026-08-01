import {
  createDefaultStoreLayout,
  findStorePath,
  type SerializedStoreOperations,
  type StoreFixture,
  type StoreLayout,
  type TilePoint,
} from "./storeOperationsEngine.js";

export type StoreLayoutIssueCode =
  | "duplicate_fixture_id"
  | "outside_store"
  | "fixture_overlap"
  | "service_point_blocked"
  | "customer_unreachable"
  | "replenishment_unreachable"
  | "register_unreachable"
  | "queue_unreachable"
  | "exit_unreachable";

export interface StoreLayoutIssue {
  code: StoreLayoutIssueCode;
  message: string;
  fixtureId?: string;
  tile?: TilePoint;
}

export interface StoreLayoutHotspot extends TilePoint {
  count: number;
}

export interface StoreLayoutMetrics {
  averageCustomerSteps: number;
  maximumCustomerSteps: number;
  averageReplenishmentSteps: number;
  maximumReplenishmentSteps: number;
  congestionPeak: number;
  score: number;
  hotspots: StoreLayoutHotspot[];
}

export interface StoreLayoutEvaluation {
  isValid: boolean;
  issues: StoreLayoutIssue[];
  metrics: StoreLayoutMetrics;
}

export interface FixtureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoredStoreLayout {
  version: 1;
  layout: StoreLayout;
}

const EDITABLE_KINDS = new Set<StoreFixture["kind"]>(["shelf", "cold_case"]);

function point(x: number, y: number): TilePoint {
  return { x, y };
}

function pointKey(value: TilePoint): string {
  return `${value.x},${value.y}`;
}

function samePoint(left: TilePoint, right: TilePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clonePoint(value: TilePoint): TilePoint {
  return { x: value.x, y: value.y };
}

function cloneFixture(fixture: StoreFixture): StoreFixture {
  return {
    ...fixture,
    tiles: fixture.tiles.map(clonePoint),
    customerServicePoints: fixture.customerServicePoints.map(clonePoint),
    staffServicePoints: fixture.staffServicePoints.map(clonePoint),
  };
}

export function cloneStoreLayout(layout: StoreLayout): StoreLayout {
  return {
    ...layout,
    entranceTile: clonePoint(layout.entranceTile),
    exitTile: clonePoint(layout.exitTile),
    cashierTile: clonePoint(layout.cashierTile),
    backroomTile: clonePoint(layout.backroomTile),
    queueTiles: layout.queueTiles.map(clonePoint),
    fixtures: layout.fixtures.map(cloneFixture),
  };
}

export function isEditableStoreFixture(fixture: StoreFixture): boolean {
  return EDITABLE_KINDS.has(fixture.kind) && fixture.categoryId !== undefined;
}

export function editableStoreFixtureIds(layout: StoreLayout): string[] {
  return layout.fixtures.filter(isEditableStoreFixture).map((fixture) => fixture.id);
}

export function storeFixtureBounds(fixture: StoreFixture): FixtureBounds {
  const xs = fixture.tiles.map((tile) => tile.x);
  const ys = fixture.tiles.map((tile) => tile.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
  };
}

export function storeFixtureAtTile(layout: StoreLayout, tile: TilePoint): StoreFixture | undefined {
  return layout.fixtures.find(
    (fixture) => isEditableStoreFixture(fixture) && fixture.tiles.some((candidate) => samePoint(candidate, tile)),
  );
}

function translateFixture(fixture: StoreFixture, deltaX: number, deltaY: number): StoreFixture {
  const translate = (value: TilePoint): TilePoint => point(value.x + deltaX, value.y + deltaY);
  return {
    ...fixture,
    tiles: fixture.tiles.map(translate),
    customerServicePoints: fixture.customerServicePoints.map(translate),
    staffServicePoints: fixture.staffServicePoints.map(translate),
  };
}

export function moveStoreFixture(layout: StoreLayout, fixtureId: string, targetTopLeft: TilePoint): StoreLayout {
  const next = cloneStoreLayout(layout);
  const fixtureIndex = next.fixtures.findIndex((fixture) => fixture.id === fixtureId && isEditableStoreFixture(fixture));
  if (fixtureIndex < 0) return next;
  const fixture = next.fixtures[fixtureIndex];
  if (!fixture) return next;
  const bounds = storeFixtureBounds(fixture);
  next.fixtures[fixtureIndex] = translateFixture(fixture, targetTopLeft.x - bounds.x, targetTopLeft.y - bounds.y);
  return next;
}

function rotatePointClockwise(value: TilePoint, bounds: FixtureBounds): TilePoint {
  const relativeX = value.x - bounds.x;
  const relativeY = value.y - bounds.y;
  return point(bounds.x + bounds.height - 1 - relativeY, bounds.y + relativeX);
}

export function rotateStoreFixtureClockwise(layout: StoreLayout, fixtureId: string): StoreLayout {
  const next = cloneStoreLayout(layout);
  const fixtureIndex = next.fixtures.findIndex((fixture) => fixture.id === fixtureId && isEditableStoreFixture(fixture));
  if (fixtureIndex < 0) return next;
  const fixture = next.fixtures[fixtureIndex];
  if (!fixture) return next;
  const bounds = storeFixtureBounds(fixture);
  next.fixtures[fixtureIndex] = {
    ...fixture,
    tiles: fixture.tiles.map((tile) => rotatePointClockwise(tile, bounds)),
    customerServicePoints: fixture.customerServicePoints.map((tile) => rotatePointClockwise(tile, bounds)),
    staffServicePoints: fixture.staffServicePoints.map((tile) => rotatePointClockwise(tile, bounds)),
  };
  return next;
}

function insideStore(layout: StoreLayout, tile: TilePoint): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < layout.width && tile.y < layout.height;
}

function insideEditableArea(layout: StoreLayout, tile: TilePoint): boolean {
  return tile.x >= 1 && tile.y >= 1 && tile.x < layout.width - 1 && tile.y < layout.height - 1;
}

function allFixtureTileOwners(layout: StoreLayout): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const fixture of layout.fixtures) {
    for (const tile of fixture.tiles) {
      const key = pointKey(tile);
      const current = owners.get(key) ?? [];
      current.push(fixture.id);
      owners.set(key, current);
    }
  }
  return owners;
}

function routeUsageAdd(usage: Map<string, number>, route: readonly TilePoint[]): void {
  for (const tile of route) {
    const key = pointKey(tile);
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
}

function pathEndpoint(path: readonly TilePoint[], fallback: TilePoint): TilePoint {
  return path.at(-1) ?? fallback;
}

function emptyMetrics(): StoreLayoutMetrics {
  return {
    averageCustomerSteps: 0,
    maximumCustomerSteps: 0,
    averageReplenishmentSteps: 0,
    maximumReplenishmentSteps: 0,
    congestionPeak: 0,
    score: 0,
    hotspots: [],
  };
}

function calculateMetrics(layout: StoreLayout): StoreLayoutMetrics {
  const productFixtures = layout.fixtures.filter((fixture) => fixture.categoryId !== undefined);
  const customerDistances: number[] = [];
  const replenishmentDistances: number[] = [];
  const routeUsage = new Map<string, number>();
  const queueStart = layout.queueTiles[0] ?? layout.cashierTile;
  const queueToExit = findStorePath(layout, queueStart, [layout.exitTile]);

  for (const fixture of productFixtures) {
    const inbound = findStorePath(layout, layout.entranceTile, fixture.customerServicePoints);
    const customerServicePoint = pathEndpoint(inbound, fixture.customerServicePoints[0] ?? layout.entranceTile);
    const outbound = findStorePath(layout, customerServicePoint, [queueStart]);
    const customerSteps = inbound.length + outbound.length + queueToExit.length;
    customerDistances.push(customerSteps);
    routeUsageAdd(routeUsage, inbound);
    routeUsageAdd(routeUsage, outbound);
    routeUsageAdd(routeUsage, queueToExit);

    const replenishment = findStorePath(layout, layout.backroomTile, fixture.staffServicePoints);
    replenishmentDistances.push(replenishment.length);
    routeUsageAdd(routeUsage, replenishment);
  }

  const hotspots = [...routeUsage.entries()]
    .map(([key, count]) => {
      const [xText, yText] = key.split(",");
      return { x: Number(xText), y: Number(yText), count };
    })
    .sort((left, right) => right.count - left.count || left.y - right.y || left.x - right.x);
  const congestionPeak = hotspots[0]?.count ?? 0;
  const averageCustomerSteps = average(customerDistances);
  const averageReplenishmentSteps = average(replenishmentDistances);
  const maximumCustomerSteps = Math.max(0, ...customerDistances);
  const maximumReplenishmentSteps = Math.max(0, ...replenishmentDistances);
  const score = clamp(
    125 - averageCustomerSteps * 1.35 - averageReplenishmentSteps * 0.9 - Math.max(0, congestionPeak - 4) * 1.6,
    0,
    100,
  );

  return {
    averageCustomerSteps: round(averageCustomerSteps),
    maximumCustomerSteps,
    averageReplenishmentSteps: round(averageReplenishmentSteps),
    maximumReplenishmentSteps,
    congestionPeak,
    score: round(score),
    hotspots,
  };
}

export function evaluateStoreLayout(layout: StoreLayout): StoreLayoutEvaluation {
  const issues: StoreLayoutIssue[] = [];
  const ids = new Set<string>();
  const owners = allFixtureTileOwners(layout);

  for (const fixture of layout.fixtures) {
    if (ids.has(fixture.id)) {
      issues.push({ code: "duplicate_fixture_id", fixtureId: fixture.id, message: `設備ID「${fixture.id}」が重複しています。` });
    }
    ids.add(fixture.id);

    for (const tile of fixture.tiles) {
      const valid = isEditableStoreFixture(fixture) ? insideEditableArea(layout, tile) : insideStore(layout, tile);
      if (!valid) {
        issues.push({ code: "outside_store", fixtureId: fixture.id, tile: clonePoint(tile), message: "設備が店舗の外へはみ出しています。" });
        break;
      }
    }
  }

  for (const [key, fixtureIds] of owners.entries()) {
    if (fixtureIds.length <= 1) continue;
    const [xText, yText] = key.split(",");
    issues.push({
      code: "fixture_overlap",
      fixtureId: fixtureIds.join(","),
      tile: point(Number(xText), Number(yText)),
      message: "設備同士が重なっています。",
    });
  }

  const blocked = new Set(owners.keys());
  const productFixtures = layout.fixtures.filter((fixture) => fixture.categoryId !== undefined);
  const queueStart = layout.queueTiles[0] ?? layout.cashierTile;

  for (const fixture of productFixtures) {
    const customerPoints = fixture.customerServicePoints.filter(
      (tile) => insideEditableArea(layout, tile) && !blocked.has(pointKey(tile)),
    );
    const staffPoints = fixture.staffServicePoints.filter(
      (tile) => insideEditableArea(layout, tile) && !blocked.has(pointKey(tile)),
    );

    if (customerPoints.length === 0 || staffPoints.length === 0) {
      issues.push({
        code: "service_point_blocked",
        fixtureId: fixture.id,
        message: "商品を取る側か補充する側の立ち位置が塞がれています。",
      });
      continue;
    }

    const inbound = findStorePath(layout, layout.entranceTile, customerPoints);
    if (inbound.length === 0 && !customerPoints.some((tile) => samePoint(tile, layout.entranceTile))) {
      issues.push({ code: "customer_unreachable", fixtureId: fixture.id, message: "入口からこの売場へ客が到達できません。" });
    } else {
      const servicePoint = pathEndpoint(inbound, customerPoints[0] ?? layout.entranceTile);
      const checkoutPath = findStorePath(layout, servicePoint, [queueStart]);
      if (checkoutPath.length === 0 && !samePoint(servicePoint, queueStart)) {
        issues.push({ code: "queue_unreachable", fixtureId: fixture.id, message: "この売場からレジ列へ移動できません。" });
      }
    }

    const replenishmentPath = findStorePath(layout, layout.backroomTile, staffPoints);
    if (replenishmentPath.length === 0 && !staffPoints.some((tile) => samePoint(tile, layout.backroomTile))) {
      issues.push({ code: "replenishment_unreachable", fixtureId: fixture.id, message: "バックヤードからこの棚を補充できません。" });
    }
  }

  const cashierPath = findStorePath(layout, layout.backroomTile, [layout.cashierTile]);
  if (cashierPath.length === 0 && !samePoint(layout.backroomTile, layout.cashierTile)) {
    issues.push({ code: "register_unreachable", message: "店員がレジへ到達できません。" });
  }
  const exitPath = findStorePath(layout, queueStart, [layout.exitTile]);
  if (exitPath.length === 0 && !samePoint(queueStart, layout.exitTile)) {
    issues.push({ code: "exit_unreachable", message: "会計後に出口へ移動できません。" });
  }

  return {
    isValid: issues.length === 0,
    issues,
    metrics: issues.length === 0 ? calculateMetrics(layout) : emptyMetrics(),
  };
}

export function createStoredStoreLayout(layout: StoreLayout): StoredStoreLayout {
  return { version: 1, layout: cloneStoreLayout(layout) };
}

export function parseStoredStoreLayout(value: unknown): StoreLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<StoredStoreLayout>;
  if (candidate.version !== 1 || !candidate.layout || typeof candidate.layout !== "object") return undefined;
  const layout = cloneStoreLayout(candidate.layout);
  const defaultLayout = createDefaultStoreLayout();
  if (layout.width !== defaultLayout.width || layout.height !== defaultLayout.height) return undefined;
  if (layout.fixtures.length !== defaultLayout.fixtures.length) return undefined;
  const evaluation = evaluateStoreLayout(layout);
  return evaluation.isValid ? layout : undefined;
}

export function prepareOperationsForStoreLayout(
  serialized: SerializedStoreOperations,
  layout: StoreLayout,
): SerializedStoreOperations {
  const next = JSON.parse(JSON.stringify(serialized)) as SerializedStoreOperations;
  next.customers = [];
  next.queueCustomerIds = [];
  next.litter = [];
  next.checkoutProgressSeconds = 0;
  next.staff = next.staff.map((member) => ({
    ...member,
    x: layout.backroomTile.x,
    y: layout.backroomTile.y,
    state: "idle",
    path: [],
    targetCategory: undefined,
    carryUnits: 0,
    workRemainingSeconds: 0,
  }));
  return next;
}
