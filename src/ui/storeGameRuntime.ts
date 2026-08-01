import {
  createStoreOperationsEngine,
  defaultCategoryWeightsForHour,
  restoreStoreOperationsEngine,
  type SerializedStoreOperations,
  type StoreCategoryId,
  type StoreEngineContext,
  type StoreFixture,
  type StoreLayout,
  type StoreOperationsEngine,
  type StoreOperationsSnapshot,
  type StoreStaffAssignments,
  type StoreStaffTask,
  type TilePoint,
} from "../game/storeOperationsEngine.js";
import {
  createStoreLayoutEditorUi,
  loadSavedStoreLayout,
} from "./storeLayoutEditorUi.js";
import "./storeGame.css";

const LOGICAL_WIDTH = 1080;
const LOGICAL_HEIGHT = 500;
const GRID_X = 12;
const GRID_Y = 38;
const TILE_WIDTH = 28;
const TILE_HEIGHT = 23;
const STORE_SAVE_KEY = "convenience-store-frontier.store-operations.v1";

const CATEGORY_LABELS: Record<StoreCategoryId, string> = {
  drinks: "飲料",
  dessert: "デザート",
  ready_meal: "弁当・惣菜",
  snacks: "お菓子",
  instant: "カップ麺",
  daily_goods: "日用品",
  magazines: "雑誌・書籍",
};

const CATEGORY_COLORS: Record<StoreCategoryId, readonly string[]> = {
  drinks: ["#5aa8d0", "#e05e4a", "#e5c247", "#6ba65c"],
  dessert: ["#f09ca6", "#f4d26a", "#8fc5d6", "#d99bd3"],
  ready_meal: ["#d96b45", "#efb44a", "#8cb65f", "#b94b3f"],
  snacks: ["#e15241", "#e7bb3f", "#4f91c1", "#6baa58"],
  instant: ["#e2663f", "#f1c34b", "#4e8bb2", "#8aa94f"],
  daily_goods: ["#4f91c1", "#f3f0dc", "#6fb493", "#d97b8f"],
  magazines: ["#d94c4c", "#5d82bb", "#e0bb43", "#7cad5d"],
};

const TASK_LABELS: Record<StoreStaffTask, string> = {
  register: "レジ",
  replenishment: "補充",
  cleaning: "清掃",
};

function optional<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function numberFrom(text: string | null | undefined): number {
  if (!text) return 0;
  const match = text.replaceAll(",", "").replaceAll("−", "-").match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function currentDay(): number {
  return Math.max(1, Math.round(numberFrom(optional("day-label")?.textContent)));
}

function currentHour(): number {
  const text = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(text.split(":")[0] ?? "6", 10);
}

function currentMinute(): number {
  const text = optional("time-label")?.textContent ?? "06:00";
  return Number.parseInt(text.split(":")[1] ?? "0", 10);
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

function tilePixel(tile: TilePoint): { x: number; y: number } {
  return {
    x: GRID_X + tile.x * TILE_WIDTH,
    y: GRID_Y + tile.y * TILE_HEIGHT,
  };
}

function agentPixel(agent: { x: number; y: number }): { x: number; y: number } {
  return {
    x: GRID_X + (agent.x + 0.5) * TILE_WIDTH,
    y: GRID_Y + (agent.y + 0.65) * TILE_HEIGHT,
  };
}

function rect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
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
  context.font = `800 ${size}px monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = "rgba(7,18,31,.85)";
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 1;
  context.fillText(value, Math.round(x), Math.round(y));
  context.restore();
}

function fixtureBounds(fixture: StoreFixture): { x: number; y: number; width: number; height: number } {
  const xs = fixture.tiles.map((tile) => tile.x);
  const ys = fixture.tiles.map((tile) => tile.y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const topLeft = tilePixel({ x: minimumX, y: minimumY });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: (maximumX - minimumX + 1) * TILE_WIDTH,
    height: (maximumY - minimumY + 1) * TILE_HEIGHT,
  };
}

function drawFloor(context: CanvasRenderingContext2D, layout: StoreLayout): void {
  const width = layout.width * TILE_WIDTH;
  const height = layout.height * TILE_HEIGHT;
  rect(context, GRID_X, GRID_Y, width, height, "#d9c8aa", "#e2ac3e", 3);
  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      const pixel = tilePixel({ x, y });
      const edge = x === 0 || y === 0 || x === layout.width - 1 || y === layout.height - 1;
      rect(
        context,
        pixel.x,
        pixel.y,
        TILE_WIDTH,
        TILE_HEIGHT,
        edge ? "#7c756b" : (x + y) % 2 === 0 ? "#dfcfb2" : "#d8c5a5",
        edge ? "#3e4346" : "rgba(105,84,59,.18)",
        1,
      );
    }
  }
}

function drawProducts(
  context: CanvasRenderingContext2D,
  fixture: StoreFixture,
  snapshot: StoreOperationsSnapshot,
  bounds: ReturnType<typeof fixtureBounds>,
): void {
  const categoryId = fixture.categoryId;
  if (!categoryId) return;
  const inventory = snapshot.inventories[categoryId];
  const ratio = inventory.shelfCapacity > 0 ? inventory.shelfUnits / inventory.shelfCapacity : 0;
  const colors = CATEGORY_COLORS[categoryId];
  const columns = Math.max(3, Math.floor((bounds.width - 12) / 14));
  const rows = Math.max(2, Math.floor((bounds.height - 28) / 12));
  const visible = Math.round(columns * rows * ratio);
  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    rect(
      context,
      bounds.x + 7 + column * ((bounds.width - 14) / columns),
      bounds.y + 23 + row * ((bounds.height - 27) / rows),
      9,
      8,
      index < visible ? colors[index % colors.length] ?? "#ddd" : "#77766e",
      "#433b35",
      1,
    );
  }
  if (ratio <= 0.35) {
    const warning = ratio <= 0.02 ? "品切" : "残少";
    rect(context, bounds.x + bounds.width - 42, bounds.y + 2, 40, 18, ratio <= 0.02 ? "#ac3030" : "#d18b25", "#fff0ad", 1);
    text(context, warning, bounds.x + bounds.width - 22, bounds.y + 11, 9, "center");
  }
}

function drawFixture(context: CanvasRenderingContext2D, fixture: StoreFixture, snapshot: StoreOperationsSnapshot): void {
  const bounds = fixtureBounds(fixture);
  if (fixture.kind === "entrance") {
    rect(context, bounds.x, bounds.y - 5, bounds.width, bounds.height + 5, "#92c2cc", "#2c4e58", 2);
    rect(context, bounds.x + bounds.width / 2 - 2, bounds.y - 4, 4, bounds.height + 3, "#e9f7f3", "#e9f7f3", 0);
    text(context, "入口", bounds.x + bounds.width / 2, bounds.y - 11, 10, "center");
    return;
  }
  if (fixture.kind === "backroom") {
    rect(context, bounds.x, bounds.y, bounds.width, bounds.height, "#92785a", "#392e27", 2);
    text(context, "バックヤード", bounds.x + bounds.width / 2, bounds.y + 12, 10, "center");
    for (let index = 0; index < 8; index += 1) {
      rect(context, bounds.x + 8 + (index % 3) * 30, bounds.y + 22 + Math.floor(index / 3) * 15, 24, 11, "#b88a50", "#62472e", 1);
    }
    return;
  }
  if (fixture.kind === "register") {
    rect(context, bounds.x, bounds.y, bounds.width, bounds.height, "#d8d7ca", "#344650", 2);
    rect(context, bounds.x + 10, bounds.y + 12, 48, 30, "#456776", "#172832", 2);
    rect(context, bounds.x + 69, bounds.y + 12, 52, 19, "#8ca4a9", "#243840", 1);
    text(context, "レジ", bounds.x + bounds.width / 2, bounds.y + bounds.height - 12, 11, "center");
    return;
  }
  if (fixture.kind === "waste") {
    const colors = ["#8b8175", "#3f7797", "#4f8954"];
    fixture.tiles.forEach((tile, index) => {
      const pixel = tilePixel(tile);
      rect(context, pixel.x + 3, pixel.y + 2, TILE_WIDTH - 6, TILE_HEIGHT - 4, colors[index % colors.length] ?? "#777", "#30383c", 1);
    });
    return;
  }

  const cold = fixture.kind === "cold_case";
  rect(context, bounds.x, bounds.y, bounds.width, bounds.height, cold ? "#d8e6e8" : "#78634d", cold ? "#2b4956" : "#302820", 2);
  const categoryId = fixture.categoryId;
  if (categoryId) {
    rect(context, bounds.x + 2, bounds.y + 2, bounds.width - 4, 18, cold ? "#2f679d" : "#315f95", "#17304a", 1);
    text(context, CATEGORY_LABELS[categoryId], bounds.x + bounds.width / 2, bounds.y + 11, 10, "center");
    drawProducts(context, fixture, snapshot, bounds);
  }
}

function drawHud(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot): void {
  rect(context, 0, 0, LOGICAL_WIDTH, 34, "#082440", "#e2aa3b", 2);
  text(context, `${currentDay()}日目`, 18, 17, 16);
  text(context, optional("time-label")?.textContent ?? "06:00", 142, 17, 16);
  text(context, optional("weather-label")?.textContent ?? "晴れ", 266, 17, 14);
  text(context, `所持金 ${optional("cash-label")?.textContent ?? "—"}`, 430, 17, 16);
  const status = isStoreOpen() ? (isPlaying() ? "営業中" : "一時停止") : "営業時間外";
  text(context, status, 876, 17, 14, "center", isStoreOpen() ? "#fff4cf" : "#f4b2a9");
  text(context, `店内売上 ¥${snapshot.kpis.revenue.toLocaleString("ja-JP")}`, 1064, 17, 13, "right");
}

function drawPerson(
  context: CanvasRenderingContext2D,
  agent: { x: number; y: number; variant: number },
  uniform: boolean,
  bubble?: string,
  carryBox = false,
): void {
  const pixel = agentPixel(agent);
  const bob = Math.sin(performance.now() / 150 + agent.variant) * 1.2;
  const skin = ["#dda273", "#c98d63", "#edba8c", "#b97a54"][agent.variant % 4] ?? "#dda273";
  const shirt = uniform ? "#277e4c" : ["#315b8b", "#a9463c", "#73508b", "#b1812d", "#37735d"][agent.variant % 5] ?? "#315b8b";
  context.fillStyle = "rgba(34,27,22,.28)";
  context.fillRect(pixel.x - 8, pixel.y + 11, 17, 5);
  rect(context, pixel.x - 6, pixel.y - 15 + bob, 13, 12, skin, "#3a2822", 1);
  rect(context, pixel.x - 8, pixel.y - 3 + bob, 17, 17, shirt, "#26313b", 1);
  rect(context, pixel.x - 7, pixel.y + 14 + bob, 6, 7, "#273b59", "#1c2733", 1);
  rect(context, pixel.x + 3, pixel.y + 14 + bob, 6, 7, "#273b59", "#1c2733", 1);
  if (carryBox) rect(context, pixel.x + 9, pixel.y + 1, 14, 11, "#b98b51", "#65472e", 1);
  if (bubble) {
    const width = Math.max(20, bubble.length * 10 + 8);
    rect(context, pixel.x - width / 2, pixel.y - 35, width, 16, "#082440", "#e2aa3b", 1);
    text(context, bubble, pixel.x, pixel.y - 27, 9, "center");
  }
}

function drawAgents(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot): void {
  for (const item of snapshot.litter) {
    const pixel = agentPixel(item);
    context.fillStyle = "#f1eee0";
    context.beginPath();
    context.moveTo(pixel.x - 5, pixel.y - 3);
    context.lineTo(pixel.x + 4, pixel.y - 5);
    context.lineTo(pixel.x + 6, pixel.y + 3);
    context.lineTo(pixel.x - 4, pixel.y + 5);
    context.closePath();
    context.fill();
  }

  for (const customer of snapshot.customers) {
    let bubble: string | undefined;
    if (customer.regular) bubble = "★";
    if (customer.state === "browsing") bubble = customer.targetCategory ? CATEGORY_LABELS[customer.targetCategory].slice(0, 2) : undefined;
    if (customer.state === "queueing" && customer.patienceRemainingSeconds < 6) bubble = "!";
    if (customer.state === "leaving" && customer.reason === "stockout") bubble = "品切?";
    drawPerson(context, customer, false, bubble, false);
    if (customer.basketUnits > 0) {
      const pixel = agentPixel(customer);
      rect(context, pixel.x - 15, pixel.y + 3, 7, 9, "#2e6fa3", "#153750", 1);
    }
  }

  for (const member of snapshot.staff) {
    const carry = member.carryUnits > 0;
    const label = member.state === "replenishing" ? "補充中" : member.state === "cleaning" ? "清掃中" : TASK_LABELS[member.task];
    drawPerson(context, member, true, label, carry);
  }
}

function drawSidePanel(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot): void {
  const x = 920;
  rect(context, x, GRID_Y, 148, 368, "#0a2a49", "#e2aa3b", 2);
  text(context, "営業状況", x + 74, GRID_Y + 18, 13, "center");
  const rows: Array<[string, string, string?]> = [
    ["入店", `${snapshot.kpis.enteredCustomers}人`],
    ["会計", `${snapshot.kpis.transactions}人`],
    ["販売", `${snapshot.kpis.unitsSold}点`],
    ["行列", `${snapshot.queueCustomerIds.length}人`, snapshot.queueCustomerIds.length >= 5 ? "#ff9d8e" : undefined],
    ["欠品遭遇", `${snapshot.kpis.stockoutEncounters}件`, snapshot.kpis.stockoutEncounters > 0 ? "#ffbd78" : undefined],
    ["離脱", `${snapshot.kpis.queueAbandonments + snapshot.kpis.noPurchaseExits}人`],
    ["ゴミ", `${snapshot.litter.length}個`, snapshot.litter.length >= 4 ? "#ffbd78" : undefined],
  ];
  rows.forEach(([label, value, color], index) => {
    const y = GRID_Y + 46 + index * 31;
    text(context, label, x + 10, y, 11, "left", "#b9d3e3");
    text(context, value, x + 137, y, 12, "right", color ?? "#fff4cf");
    context.strokeStyle = "rgba(226,170,59,.22)";
    context.beginPath();
    context.moveTo(x + 8, y + 15);
    context.lineTo(x + 140, y + 15);
    context.stroke();
  });

  text(context, "店員配置", x + 74, GRID_Y + 276, 12, "center");
  const assignments = snapshot.assignments;
  text(context, `レジ ${assignments.register}`, x + 14, GRID_Y + 304, 11);
  text(context, `補充 ${assignments.replenishment}`, x + 14, GRID_Y + 328, 11);
  text(context, `清掃 ${assignments.cleaning}`, x + 14, GRID_Y + 352, 11);
}

function drawFooter(context: CanvasRenderingContext2D, snapshot: StoreOperationsSnapshot): void {
  rect(context, 0, 412, LOGICAL_WIDTH, 88, "#082440", "#e2aa3b", 2);
  const inventoryRows = Object.values(snapshot.inventories);
  inventoryRows.forEach((inventory, index) => {
    const x = 14 + index * 128;
    const ratio = inventory.shelfUnits / inventory.shelfCapacity;
    text(context, CATEGORY_LABELS[inventory.categoryId], x, 432, 9);
    rect(context, x, 446, 104, 12, "#374653", "#17222e", 1);
    rect(context, x + 1, 447, Math.max(0, 102 * ratio), 10, ratio < 0.2 ? "#bc3b35" : ratio < 0.45 ? "#d58d2d" : "#58a765", "#58a765", 0);
    text(context, `棚${inventory.shelfUnits}/${inventory.shelfCapacity}`, x, 474, 9);
  });
  text(context, `最大行列 ${snapshot.kpis.maximumQueueLength}人`, 1064, 436, 11, "right");
  text(context, `補充 ${snapshot.kpis.replenishedUnits}点`, 1064, 458, 11, "right");
  text(context, `清掃 ${snapshot.kpis.litterCleaned}件`, 1064, 480, 11, "right");
}

function drawFrame(
  context: CanvasRenderingContext2D,
  layout: StoreLayout,
  snapshot: StoreOperationsSnapshot,
): void {
  context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawHud(context, snapshot);
  drawFloor(context, layout);
  for (const fixture of layout.fixtures) drawFixture(context, fixture, snapshot);
  drawAgents(context, snapshot);
  drawSidePanel(context, snapshot);
  drawFooter(context, snapshot);
}

function buildShell(): HTMLElement {
  const shell = document.createElement("main");
  shell.id = "store-game-shell";
  shell.innerHTML = `
    <section class="store-game-stage" aria-label="コンビニ店内営業">
      <canvas id="store-game-canvas" width="1080" height="500"></canvas>
      <div class="orientation-message">端末を横向きにしてください</div>
    </section>
    <nav class="store-game-nav" aria-label="主要メニュー">
      <button type="button" data-game-action="time"><span>▶</span><b>時間</b></button>
      <button type="button" data-game-action="store"><span>▣</span><b>店舗</b></button>
      <button type="button" data-game-action="product"><span>箱</span><b>商品</b></button>
      <button type="button" data-game-action="order"><span>票</span><b>発注</b></button>
      <button type="button" data-game-action="staff"><span>人</span><b>人員</b></button>
      <button type="button" data-game-action="info"><span>▥</span><b>情報</b></button>
    </nav>
    <button type="button" class="store-game-menu" data-game-action="detail">詳細</button>
    <section id="store-staff-panel" class="store-staff-panel" hidden>
      <header><strong>店員配置</strong><button type="button" data-close-staff>閉じる</button></header>
      <p>営業中でも担当を変更できます。合計人数は現在のシフトと同じです。</p>
      <div class="staff-assignment-grid"></div>
    </section>
  `;
  document.body.prepend(shell);
  return shell;
}

function openDetail(target: "store" | "product" | "order" | "info" | "detail"): void {
  document.body.classList.add("store-detail-open");
  const map: Record<typeof target, string> = {
    store: "store-panel",
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
    // Browser storage can be unavailable in private modes; gameplay continues without it.
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
      button.querySelector("span")!.textContent = isPlaying() ? "■" : "▶";
      return;
    }
    if (action === "staff" && staffPanel) {
      renderStaffPanel(staffPanel, getEngine().getSnapshot());
      staffPanel.hidden = !staffPanel.hidden;
      return;
    }
    if (action === "store" || action === "product" || action === "order" || action === "info" || action === "detail") {
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
    replaceEngine(createStoreOperationsEngine(seed));
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
  const context = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !context) return;
  context.imageSmoothingEnabled = false;

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
  bindNavigation(shell, getEngine, replaceEngine);
  createStoreLayoutEditorUi({
    shell,
    canvas,
    getEngine,
    replaceEngine,
    canEdit: () => !isPlaying() && engine.getSnapshot().customers.length === 0,
  });

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
    drawFrame(context, layout, snapshot);
    const timeIcon = shell.querySelector<HTMLElement>("[data-game-action='time'] span");
    if (timeIcon) timeIcon.textContent = isPlaying() ? "■" : "▶";

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
