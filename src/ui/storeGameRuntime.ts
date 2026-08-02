import {
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
  restoreStoreOperationsEngine,
  type SerializedStoreOperations,
  type StoreCategoryId,
  type StoreCustomerAgent,
  type StoreEngineContext,
  type StoreFixture,
  type StoreLayout,
  type StoreOperationsEngine,
  type StoreOperationsSnapshot,
  type StoreStaffAssignments,
  type StoreStaffAgent,
  type StoreStaffTask,
  type TilePoint,
} from "../game/storeOperationsEngine.js";
import {
  createStoreLayoutEditorUi,
  loadSavedStoreLayout,
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

function currentDay(): number {
  return Math.max(1, Math.round(numberFrom(optional("day-label")?.textContent)));
}

function currentHour(): number {
  const value = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(value.split(":")[0] ?? "6", 10);
}

function currentMinute(): number {
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

function arrivalRatePerMinute(): number {
  const hour = currentHour();
  const base = hour < 10 ? 5.2 : hour < 14 ? 8.2 : hour < 18 ? 4.4 : 6.3;
  const aggregateQueue = numberFrom(optional("queue-metric")?.textContent);
  const aggregateVisits = numberFrom(optional("visit-metric")?.textContent);
  const pressure = Math.min(1.55, 0.85 + Math.sqrt(Math.max(0, aggregateVisits)) / 45 + aggregateQueue * 0.04);
  return base * pressure;
}

function engineContext(): StoreEngineContext {
  return {
    isOpen: isStoreOpen(),
    arrivalRatePerMinute: arrivalRatePerMinute(),
    categoryWeights: defaultCategoryWeightsForHour(currentHour()),
    requestedStaffCount: currentStaffing(),
  };
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
    ? drawFixtureArtwork(context, storeArtAssets, fixture, snapshot, bounds)
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
  drawStatusCard(context, 8, 94, "営業日", `${currentDay()}日目`);
  drawStatusCard(context, 108, 113, "時刻", optional("time-label")?.textContent ?? "06:00", 0);
  drawStatusCard(context, 227, 136, "天気", optional("weather-label")?.textContent ?? "晴れ", 7);
  drawStatusCard(context, 369, 232, "所持金", optional("cash-label")?.textContent ?? "—", 6);
  drawStatusCard(context, 607, 158, "店内売上", `¥${snapshot.kpis.revenue.toLocaleString("ja-JP")}`, 5);
  const status = isStoreOpen() ? (isPlaying() ? "営業中" : "一時停止") : "営業時間外";
  drawStatusCard(context, 771, 145, "営業状態", status, undefined, isStoreOpen() ? "#fff4cf" : "#ffb5a8");
  drawStatusCard(context, 922, 150, "来店／会計", `${snapshot.kpis.enteredCustomers}／${snapshot.kpis.transactions}人`, 4);
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

  const kpiX = 850;
  const rows: Array<[string, string, string?]> = [
    ["行列", `${snapshot.queueCustomerIds.length}人`, snapshot.queueCustomerIds.length >= 5 ? "#ff9d8e" : undefined],
    ["欠品遭遇", `${snapshot.kpis.stockoutEncounters}件`, snapshot.kpis.stockoutEncounters > 0 ? "#ffbe78" : undefined],
    ["離脱", `${snapshot.kpis.noPurchaseExits + snapshot.kpis.queueAbandonments}人`],
  ];
  rows.forEach(([label, value, color], index) => {
    const x = kpiX + (index % 3) * 75;
    rect(context, x, y + 11, 68, 48, "#0d3154", "#315e7d", 1);
    text(context, label, x + 34, y + 24, 8, "center", "#b8d5e8");
    text(context, value, x + 34, y + 43, 12, "center", color ?? "#fff4cf");
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
      <header><strong>店員配置</strong><button type="button" data-close-staff>閉じる</button></header>
      <p>営業中でも担当を変更できます。合計人数は現在のシフトと同じです。</p>
      <div class="staff-assignment-grid"></div>
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
    row.innerHTML = `<strong>店員${index + 1}</strong>`;
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
}

function bindNavigation(
  shell: HTMLElement,
  layoutEditor: StoreLayoutEditorUi,
  getEngine: () => StoreOperationsEngine,
  replaceEngine: (engine: StoreOperationsEngine) => void,
): void {
  const staffPanel = shell.querySelector<HTMLElement>("#store-staff-panel");
  shell.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const closeStaff = target?.closest<HTMLButtonElement>("[data-close-staff]");
    if (closeStaff && staffPanel) {
      staffPanel.hidden = true;
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

    const button = target?.closest<HTMLButtonElement>("[data-game-action]");
    if (!button) return;
    const action = button.dataset.gameAction;
    if (action === "time") {
      optional<HTMLButtonElement>("play-button")?.click();
      button.setAttribute("aria-pressed", String(isPlaying()));
      return;
    }
    if (action === "store") {
      layoutEditor.open();
      return;
    }
    if (action === "staff" && staffPanel) {
      renderStaffPanel(staffPanel, getEngine().getSnapshot());
      staffPanel.hidden = !staffPanel.hidden;
      return;
    }
    if (action === "product" || action === "order" || action === "info" || action === "detail") {
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

  const getEngine = (): StoreOperationsEngine => engine;
  const replaceEngine = (next: StoreOperationsEngine): void => {
    engine = next;
    layout = next.getLayout();
    knownDay = currentDay();
  };
  const layoutEditor = createStoreLayoutEditorUi({
    shell,
    canvas,
    getEngine,
    replaceEngine,
    canEdit: () => !isPlaying() && engine.getSnapshot().customers.length === 0,
  });
  bindNavigation(shell, layoutEditor, getEngine, replaceEngine);

  engine.advance(0.01, engineContext());

  const render = (timestamp: number): void => {
    const realDelta = Math.min(0.1, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    const day = currentDay();
    if (day !== knownDay) {
      engine.beginDay(day);
      knownDay = day;
    }
    if (isPlaying()) engine.advance(realDelta * visualTimeScale(), engineContext());
    else engine.advance(0.001, engineContext());

    const snapshot = engine.getSnapshot();
    drawFrame(context, layout, snapshot, layoutEditor.isOpen());
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
