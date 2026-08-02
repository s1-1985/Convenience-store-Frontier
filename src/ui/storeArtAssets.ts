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

const FIXTURE_CELL_WIDTH = 192;
const FIXTURE_CELL_HEIGHT = 128;
const STAFF_CELL_WIDTH = 96;
const STAFF_CELL_HEIGHT = 128;
const CUSTOMER_CELL_WIDTH = 80;
const CUSTOMER_CELL_HEIGHT = 110;
const ICON_CELL_SIZE = 64;

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

const CUSTOMER_ROWS = [0, 1, 3, 4, 5, 7] as const;

const ASSET_URLS = {
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
      loadImage(ASSET_URLS.fixtures),
      loadImage(ASSET_URLS.staff),
      loadImage(ASSET_URLS.customers),
      loadImage(ASSET_URLS.icons),
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

function fixtureLabelColor(fixture: StoreFixture): string {
  if (fixture.categoryId === "ready_meal") return "#b94d32";
  if (fixture.categoryId === "dessert") return "#398558";
  if (fixture.categoryId === "magazines") return "#704596";
  if (fixture.categoryId === "instant") return "#43864a";
  if (fixture.categoryId === "daily_goods") return "#a53d37";
  if (fixture.kind === "entrance") return "#25745c";
  if (fixture.kind === "register") return "#356741";
  return "#245e99";
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
  const longFootprint = Math.max(bounds.width, bounds.height);
  const widthFactor = fixture.kind === "register" ? 1.16 : fixture.kind === "waste" ? 1.28 : 1.12;
  const visualWidth = Math.max(80, longFootprint * widthFactor);
  const naturalHeight = visualWidth * (FIXTURE_CELL_HEIGHT / FIXTURE_CELL_WIDTH);
  const minimumHeight = fixture.kind === "register"
    ? Math.max(92, bounds.height * 1.28)
    : fixture.kind === "waste"
      ? Math.max(64, bounds.height * 1.75)
      : Math.max(88, Math.min(126, bounds.height * 2.45));
  const visualHeight = Math.max(naturalHeight, minimumHeight);
  const destination: DrawBounds = {
    x: bounds.x + (bounds.width - visualWidth) / 2,
    y: bounds.y + bounds.height - visualHeight + 5,
    width: visualWidth,
    height: visualHeight,
  };

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (rotated) {
    context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    context.rotate(Math.PI / 2);
    drawAtlasCell(
      context,
      assets.fixtures,
      index,
      4,
      FIXTURE_CELL_WIDTH,
      FIXTURE_CELL_HEIGHT,
      {
        x: -visualWidth / 2,
        y: bounds.width / 2 - visualHeight + 5,
        width: visualWidth,
        height: visualHeight,
      },
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

  const labelWidth = Math.max(52, visualWidth * 0.7);
  const labelHeight = Math.max(15, Math.min(21, visualHeight * 0.17));
  const labelX = bounds.x + bounds.width / 2;
  const labelY = rotated ? bounds.y + bounds.height / 2 : destination.y + labelHeight * 0.88;
  context.save();
  context.fillStyle = fixtureLabelColor(fixture);
  context.strokeStyle = "rgba(255,244,207,.92)";
  context.lineWidth = 1;
  context.fillRect(labelX - labelWidth / 2, labelY - labelHeight / 2, labelWidth, labelHeight);
  context.strokeRect(labelX - labelWidth / 2, labelY - labelHeight / 2, labelWidth, labelHeight);
  context.restore();

  return {
    labelX,
    labelY,
    labelWidth,
    warningX: bounds.x + bounds.width - 3,
    warningY: bounds.y + bounds.height - 3,
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
  const bob = Math.sin(performance.now() / 170 + agent.variant) * 1.3;
  const isStaff = role === "staff";
  const cellWidth = isStaff ? STAFF_CELL_WIDTH : CUSTOMER_CELL_WIDTH;
  const cellHeight = isStaff ? STAFF_CELL_HEIGHT : CUSTOMER_CELL_HEIGHT;
  const row = isStaff
    ? STAFF_ROW[task ?? "register"]
    : CUSTOMER_ROWS[Math.abs(agent.variant) % CUSTOMER_ROWS.length] ?? 0;
  const image = isStaff ? assets.staff : assets.customers;
  const drawWidth = isStaff ? 70 : 62;
  const drawHeight = isStaff ? 94 : 85;

  context.save();
  context.fillStyle = "rgba(30, 22, 15, .24)";
  context.beginPath();
  context.ellipse(pixel.x, pixel.y + 13, drawWidth * 0.31, 5.5, 0, 0, Math.PI * 2);
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
      y: pixel.y - drawHeight + 18 + bob,
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
  drawAtlasCell(
    context,
    assets.icons,
    Math.max(0, Math.min(7, Math.round(index))),
    8,
    ICON_CELL_SIZE,
    ICON_CELL_SIZE,
    { x, y, width: size, height: size },
  );
}

export const STORE_ART_ATLAS_SPEC = {
  fixtures: { width: 768, height: 384, columns: 4, rows: 3 },
  staff: { width: 384, height: 384, columns: 4, rows: 3 },
  customers: { width: 320, height: 880, columns: 4, rows: 8 },
  icons: { width: 512, height: 64, columns: 8, rows: 1 },
} as const;
