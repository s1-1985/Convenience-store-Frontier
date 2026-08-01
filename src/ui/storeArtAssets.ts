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

const ASSET_URLS = {
  fixtures: "/assets/store/fixtures.svg",
  staff: "/assets/store/staff.svg",
  customers: "/assets/store/customers.svg",
  icons: "/assets/store/icons.svg",
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
  const footprintWidth = rotated ? bounds.height : bounds.width;
  const footprintHeight = rotated ? bounds.width : bounds.height;
  const widthMultiplier = fixture.kind === "backroom" ? 1.18 : fixture.kind === "waste" ? 1.35 : 1.08;
  const visualWidth = footprintWidth * widthMultiplier;
  const aspectHeight = visualWidth * (FIXTURE_CELL_HEIGHT / FIXTURE_CELL_WIDTH);
  const heightMultiplier = fixture.kind === "entrance" ? 3.05 : fixture.kind === "register" ? 1.82 : 2.65;
  const visualHeight = Math.max(footprintHeight * heightMultiplier, aspectHeight);
  const inventory = fixture.categoryId ? snapshot.inventories[fixture.categoryId] : undefined;
  const stockRatio = inventory && inventory.shelfCapacity > 0
    ? Math.max(0, Math.min(1, inventory.shelfUnits / inventory.shelfCapacity))
    : 1;

  const labelColor = fixture.categoryId === "ready_meal"
    ? "#bd5637"
    : fixture.categoryId === "dessert"
      ? "#4c8957"
      : fixture.categoryId === "magazines"
        ? "#76559c"
        : fixture.kind === "entrance"
          ? "#2f765f"
          : "#315f95";
  const unrotatedDestination: DrawBounds = {
    x: bounds.x + (bounds.width - visualWidth) / 2,
    y: bounds.y + bounds.height - visualHeight + 4,
    width: visualWidth,
    height: visualHeight,
  };

  context.save();
  context.globalAlpha = 0.58 + stockRatio * 0.42;
  if (rotated) {
    context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    context.rotate(Math.PI / 2);
    const destination: DrawBounds = {
      x: -footprintWidth / 2 - (visualWidth - footprintWidth) / 2,
      y: footprintHeight / 2 - visualHeight + 4,
      width: visualWidth,
      height: visualHeight,
    };
    drawAtlasCell(
      context,
      assets.fixtures,
      index,
      4,
      FIXTURE_CELL_WIDTH,
      FIXTURE_CELL_HEIGHT,
      destination,
    );
    context.globalAlpha = 0.96;
    context.fillStyle = labelColor;
    context.fillRect(
      destination.x + destination.width * 0.13,
      destination.y + destination.height * 0.08,
      destination.width * 0.74,
      Math.max(13, destination.height * 0.15),
    );
  } else {
    drawAtlasCell(
      context,
      assets.fixtures,
      index,
      4,
      FIXTURE_CELL_WIDTH,
      FIXTURE_CELL_HEIGHT,
      unrotatedDestination,
    );
    context.globalAlpha = 0.96;
    context.fillStyle = labelColor;
    context.fillRect(
      unrotatedDestination.x + unrotatedDestination.width * 0.13,
      unrotatedDestination.y + unrotatedDestination.height * 0.08,
      unrotatedDestination.width * 0.74,
      Math.max(13, unrotatedDestination.height * 0.15),
    );
  }
  context.restore();

  return {
    labelX: bounds.x + bounds.width / 2,
    labelY: rotated
      ? bounds.y + bounds.height / 2
      : unrotatedDestination.y + Math.max(12, unrotatedDestination.height * 0.155),
    labelWidth: Math.max(42, visualWidth * 0.68),
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
  const row = isStaff ? STAFF_ROW[task ?? "register"] : Math.abs(agent.variant) % 8;
  const image = isStaff ? assets.staff : assets.customers;
  const drawWidth = isStaff ? 47 : 42;
  const drawHeight = isStaff ? 63 : 58;

  context.save();
  context.fillStyle = "rgba(23, 18, 14, .25)";
  context.beginPath();
  context.ellipse(pixel.x, pixel.y + 17, drawWidth * 0.34, 4.5, 0, 0, Math.PI * 2);
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
      y: pixel.y - drawHeight + 21 + bob,
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
  fixtures: { width: 1536, height: 768, columns: 4, rows: 3 },
  staff: { width: 768, height: 768, columns: 4, rows: 3 },
  customers: { width: 640, height: 1760, columns: 4, rows: 8 },
  icons: { width: 1024, height: 128, columns: 8, rows: 1 },
} as const;
