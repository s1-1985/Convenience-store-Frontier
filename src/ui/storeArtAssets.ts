import type {
  StoreCustomerAgent,
  StoreFixture,
  StoreOperationsSnapshot,
  StoreStaffAgent,
  StoreStaffTask,
  TilePoint,
} from "../game/storeOperationsEngine.js";

export interface StoreArtAssets {
  fixtures: HTMLImageElement;
  staff: HTMLImageElement;
  customers: HTMLImageElement;
  icons: HTMLImageElement;
}

export interface DrawBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FixtureArtworkPlacement {
  labelX: number;
  labelY: number;
  labelWidth: number;
  warningX: number;
  warningY: number;
}

export type AgentFacing = "front" | "left" | "right" | "back";

const FIXTURE_CELL_WIDTH = 384;
const FIXTURE_CELL_HEIGHT = 256;
const STAFF_CELL_WIDTH = 192;
const STAFF_CELL_HEIGHT = 256;
const CUSTOMER_CELL_WIDTH = 160;
const CUSTOMER_CELL_HEIGHT = 220;
const ICON_CELL_SIZE = 128;

const FIXTURE_INDEX: Record<string, number> = {
  entrance: 0,
  drinks: 1,
  dessert: 2,
  ready_meal: 3,
  magazines: 4,
  register: 5,
  snacks: 6,
  instant: 7,
  daily_goods: 8,
  waste: 9,
  backroom: 10,
  empty: 11,
};

const STAFF_ROW: Record<StoreStaffTask, number> = {
  register: 0,
  replenishment: 1,
  cleaning: 2,
};

const FACING_COLUMN: Record<AgentFacing, number> = {
  front: 0,
  left: 1,
  right: 2,
  back: 3,
};

// Rows 2 and 6 of the generated customer sheet contain incomplete generations.
// Keep the visually complete archetypes in rotation.
const CUSTOMER_ROWS = [0, 1, 3, 4, 5, 7] as const;

export const STORE_ART_ASSET_URLS = {
  fixtures: "/assets/store/fixtures.webp",
  staff: "/assets/store/staff.webp",
  customers: "/assets/store/customers.webp",
  icons: "/assets/store/icons.webp",
} as const;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Store art asset failed to load: ${url}`)), {
      once: true,
    });
    image.src = url;
  });
}

export async function loadStoreArtAssets(): Promise<StoreArtAssets | undefined> {
  try {
    const [fixtures, staff, customers, icons] = await Promise.all([
      loadImage(STORE_ART_ASSET_URLS.fixtures),
      loadImage(STORE_ART_ASSET_URLS.staff),
      loadImage(STORE_ART_ASSET_URLS.customers),
      loadImage(STORE_ART_ASSET_URLS.icons),
    ]);
    return { fixtures, staff, customers, icons };
  } catch (error) {
    console.warn(error);
    return undefined;
  }
}

function nextTile(agent: { path?: readonly TilePoint[] }): TilePoint | undefined {
  return agent.path?.[0];
}

export function resolveAgentFacing(agent: {
  x: number;
  y: number;
  path?: readonly TilePoint[];
  variant?: number;
}): AgentFacing {
  const next = nextTile(agent);
  if (next) {
    const dx = next.x - agent.x;
    const dy = next.y - agent.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.04) return dx < 0 ? "left" : "right";
    if (Math.abs(dy) > 0.04) return dy < 0 ? "back" : "front";
  }
  const fallback = Math.abs(agent.variant ?? 0) % 4;
  return (["front", "left", "right", "back"] as const)[fallback] ?? "front";
}

export function resolveFixtureArtIndex(
  fixture: StoreFixture,
  snapshot?: StoreOperationsSnapshot,
): number | undefined {
  if (fixture.kind === "entrance") return FIXTURE_INDEX.entrance;
  if (fixture.kind === "register") return FIXTURE_INDEX.register;
  if (fixture.kind === "waste") return FIXTURE_INDEX.waste;
  if (fixture.kind === "backroom") return FIXTURE_INDEX.backroom;
  if (!fixture.categoryId) return undefined;
  const inventory = snapshot?.inventories[fixture.categoryId];
  if (fixture.kind === "shelf" && inventory && inventory.shelfUnits <= 0) return FIXTURE_INDEX.empty;
  return FIXTURE_INDEX[fixture.categoryId];
}

function drawAtlasCell(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  index: number,
  columns: number,
  cellWidth: number,
  cellHeight: number,
  destination: DrawBounds,
): void {
  const sourceX = (index % columns) * cellWidth;
  const sourceY = Math.floor(index / columns) * cellHeight;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cellWidth,
    cellHeight,
    destination.x,
    destination.y,
    destination.width,
    destination.height,
  );
}

function fixtureVisualBounds(fixture: StoreFixture, bounds: DrawBounds): DrawBounds {
  const topRow = Math.min(...fixture.tiles.map((tile) => tile.y)) <= 1;
  const rotatable = fixture.kind === "shelf" || fixture.kind === "cold_case";
  const rotated = rotatable && bounds.height > bounds.width;
  const footprintWidth = rotated ? bounds.height : bounds.width;
  const footprintHeight = rotated ? bounds.width : bounds.height;

  let widthMultiplier = 1.12;
  if (fixture.kind === "entrance") widthMultiplier = 1.55;
  if (fixture.kind === "register") widthMultiplier = 1.17;
  if (fixture.kind === "waste") widthMultiplier = 1.58;
  if (fixture.kind === "backroom") widthMultiplier = 1.16;

  const visualWidth = footprintWidth * widthMultiplier;
  const aspectHeight = visualWidth * (FIXTURE_CELL_HEIGHT / FIXTURE_CELL_WIDTH);
  let visualHeight = aspectHeight;
  if (topRow && rotatable) visualHeight = Math.min(aspectHeight, footprintHeight * 1.66);
  if (!topRow && rotatable) visualHeight = Math.max(aspectHeight, footprintHeight * 2.22);
  if (fixture.kind === "register") visualHeight = Math.min(aspectHeight, footprintHeight * 1.46);
  if (fixture.kind === "backroom") visualHeight = Math.min(aspectHeight, footprintHeight * 1.4);

  return {
    x: bounds.x + (bounds.width - visualWidth) / 2,
    y: bounds.y + bounds.height - visualHeight + 4,
    width: visualWidth,
    height: visualHeight,
  };
}

function labelColor(fixture: StoreFixture): string {
  if (fixture.categoryId === "ready_meal") return "#bd5637";
  if (fixture.categoryId === "dessert") return "#4c8957";
  if (fixture.categoryId === "magazines") return "#76559c";
  if (fixture.categoryId === "instant") return "#4b7f49";
  if (fixture.categoryId === "daily_goods") return "#b94f3b";
  if (fixture.kind === "entrance") return "#2f765f";
  return "#315f95";
}

export function drawFixtureArtwork(
  context: CanvasRenderingContext2D,
  assets: StoreArtAssets,
  fixture: StoreFixture,
  snapshot: StoreOperationsSnapshot,
  bounds: DrawBounds,
): FixtureArtworkPlacement | undefined {
  const index = resolveFixtureArtIndex(fixture, snapshot);
  if (index === undefined) return undefined;

  const rotatable = fixture.kind === "shelf" || fixture.kind === "cold_case";
  const rotated = rotatable && bounds.height > bounds.width;
  const destination = fixtureVisualBounds(fixture, bounds);
  const inventory = fixture.categoryId ? snapshot.inventories[fixture.categoryId] : undefined;
  const stockRatio = inventory && inventory.shelfCapacity > 0
    ? Math.max(0, Math.min(1, inventory.shelfUnits / inventory.shelfCapacity))
    : 1;

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.globalAlpha = 0.9 + stockRatio * 0.1;

  if (rotated) {
    context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    context.rotate(Math.PI / 2);
    const rotatedDestination: DrawBounds = {
      x: -destination.width / 2,
      y: bounds.width / 2 - destination.height + 4,
      width: destination.width,
      height: destination.height,
    };
    drawAtlasCell(
      context,
      assets.fixtures,
      index,
      4,
      FIXTURE_CELL_WIDTH,
      FIXTURE_CELL_HEIGHT,
      rotatedDestination,
    );
  } else {
    drawAtlasCell(
      context,
      assets.fixtures,
      index,
      4,
      FIXTURE_CELL_WIDTH,
      FIXTURE_CELL_HEIGHT,
      destination,
    );
  }
  context.restore();

  const shouldCoverGeneratedLabel = fixture.categoryId !== undefined;
  if (shouldCoverGeneratedLabel) {
    const barWidth = destination.width * 0.84;
    const barHeight = Math.max(17, Math.min(24, destination.height * 0.2));
    const barX = bounds.x + bounds.width / 2 - barWidth / 2;
    const barY = Math.max(42, destination.y + 3);
    context.save();
    context.fillStyle = labelColor(fixture);
    context.strokeStyle = "rgba(255, 239, 180, .9)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.roundRect(barX, barY, barWidth, barHeight, 4);
    context.fill();
    context.stroke();
    context.restore();
    return {
      labelX: bounds.x + bounds.width / 2,
      labelY: barY + barHeight / 2,
      labelWidth: barWidth - 8,
      warningX: destination.x + destination.width - 8,
      warningY: destination.y + destination.height - 9,
    };
  }

  return {
    labelX: bounds.x + bounds.width / 2,
    labelY: destination.y + 12,
    labelWidth: Math.max(42, destination.width * 0.68),
    warningX: destination.x + destination.width - 8,
    warningY: destination.y + destination.height - 9,
  };
}

export function drawAgentArtwork(
  context: CanvasRenderingContext2D,
  assets: StoreArtAssets,
  agent: StoreCustomerAgent | StoreStaffAgent,
  role: "customer" | "staff",
  pixel: { x: number; y: number },
  task?: StoreStaffTask,
): boolean {
  const facing = resolveAgentFacing(agent);
  const column = FACING_COLUMN[facing];
  const bob = Math.sin(performance.now() / 165 + agent.variant) * 1.1;
  const isStaff = role === "staff";
  const cellWidth = isStaff ? STAFF_CELL_WIDTH : CUSTOMER_CELL_WIDTH;
  const cellHeight = isStaff ? STAFF_CELL_HEIGHT : CUSTOMER_CELL_HEIGHT;
  const customerRow = CUSTOMER_ROWS[Math.abs(agent.variant) % CUSTOMER_ROWS.length] ?? 0;
  const row = isStaff ? STAFF_ROW[task ?? "register"] : customerRow;
  const image = isStaff ? assets.staff : assets.customers;
  const drawWidth = isStaff ? 65 : 58;
  const drawHeight = isStaff ? 88 : 80;

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "rgba(31, 23, 17, .28)";
  context.beginPath();
  context.ellipse(pixel.x, pixel.y + 17, drawWidth * 0.31, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = agent.state === "gone" ? 0 : 1;
  drawAtlasCell(
    context,
    image,
    row * 4 + column,
    4,
    cellWidth,
    cellHeight,
    {
      x: pixel.x - drawWidth / 2,
      y: pixel.y - drawHeight + 22 + bob,
      width: drawWidth,
      height: drawHeight,
    },
  );
  context.restore();
  return true;
}

export function drawUiIcon(
  context: CanvasRenderingContext2D,
  assets: StoreArtAssets,
  index: number,
  x: number,
  y: number,
  size: number,
): void {
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawAtlasCell(
    context,
    assets.icons,
    Math.max(0, Math.min(7, Math.round(index))),
    8,
    ICON_CELL_SIZE,
    ICON_CELL_SIZE,
    { x, y, width: size, height: size },
  );
  context.restore();
}

export const STORE_ART_ATLAS_SPEC = {
  fixtures: { width: 1536, height: 768, columns: 4, rows: 3 },
  staff: { width: 768, height: 768, columns: 4, rows: 3 },
  customers: { width: 640, height: 1760, columns: 4, rows: 8 },
  icons: { width: 1024, height: 128, columns: 8, rows: 1 },
} as const;
