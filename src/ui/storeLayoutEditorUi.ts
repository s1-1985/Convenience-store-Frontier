import {
  createDefaultStoreLayout,
  restoreStoreOperationsEngine,
  type StoreFixture,
  type StoreLayout,
  type StoreOperationsEngine,
  type TilePoint,
} from "../game/storeOperationsEngine.js";
import {
  cloneStoreLayout,
  createStoredStoreLayout,
  editableStoreFixtureIds,
  evaluateStoreLayout,
  isEditableStoreFixture,
  moveStoreFixture,
  parseStoredStoreLayout,
  prepareOperationsForStoreLayout,
  rotateStoreFixtureClockwise,
  storeFixtureAtTile,
  storeFixtureBounds,
  type StoreLayoutEvaluation,
} from "../game/storeLayoutEditor.js";
import { configureHiDpiCanvas } from "./storeCanvasResolution.js";
import "./storeLayoutEditor.css";

const STORE_LAYOUT_SAVE_KEY = "convenience-store-frontier.store-layout.v1";
const LOGICAL_WIDTH = 1080;
const LOGICAL_HEIGHT = 500;
const GRID_X = 12;
const GRID_Y = 38;
const TILE_WIDTH = 28;
const TILE_HEIGHT = 23;

const FIXTURE_LABELS: Record<string, string> = {
  drinks: "飲料ケース",
  dessert: "デザートケース",
  "ready-meal": "弁当・惣菜ケース",
  magazines: "雑誌・書籍棚",
  snacks: "お菓子棚",
  instant: "カップ麺棚",
  "daily-goods": "日用品棚",
};

export interface StoreLayoutEditorUiOptions {
  shell: HTMLElement;
  canvas: HTMLCanvasElement;
  getEngine: () => StoreOperationsEngine;
  replaceEngine: (engine: StoreOperationsEngine) => void;
  canEdit: () => boolean;
}

export interface StoreLayoutEditorUi {
  open(): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
  destroy(): void;
}

function fixtureLabel(fixture: StoreFixture | undefined): string {
  if (!fixture) return "棚を選択してください";
  return FIXTURE_LABELS[fixture.id] ?? fixture.categoryId ?? fixture.id;
}

function tileFromPointer(canvas: HTMLCanvasElement, event: PointerEvent): TilePoint | undefined {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return undefined;
  const logicalX = ((event.clientX - bounds.left) / bounds.width) * LOGICAL_WIDTH;
  const logicalY = ((event.clientY - bounds.top) / bounds.height) * LOGICAL_HEIGHT;
  const x = Math.floor((logicalX - GRID_X) / TILE_WIDTH);
  const y = Math.floor((logicalY - GRID_Y) / TILE_HEIGHT);
  if (x < 0 || y < 0) return undefined;
  return { x, y };
}

function tilePixel(tile: TilePoint): { x: number; y: number } {
  return {
    x: GRID_X + tile.x * TILE_WIDTH,
    y: GRID_Y + tile.y * TILE_HEIGHT,
  };
}

function drawText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 11,
  color = "#fff4cf",
): void {
  context.save();
  context.font = `800 ${size}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = "rgba(0,0,0,.85)";
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 1;
  context.fillText(value, x, y);
  context.restore();
}

function drawEditorOverlay(
  context: CanvasRenderingContext2D,
  layout: StoreLayout,
  evaluation: StoreLayoutEvaluation,
  selectedFixtureId: string | undefined,
): void {
  context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  context.fillStyle = "rgba(3, 13, 24, .34)";
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  const peak = Math.max(1, evaluation.metrics.congestionPeak);
  for (const hotspot of evaluation.metrics.hotspots.slice(0, 60)) {
    if (hotspot.count < 2) continue;
    const pixel = tilePixel(hotspot);
    const strength = hotspot.count / peak;
    context.fillStyle = `rgba(239, 107, 55, ${0.08 + strength * 0.32})`;
    context.fillRect(pixel.x + 1, pixel.y + 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);
  }

  context.strokeStyle = "rgba(255, 244, 207, .18)";
  context.lineWidth = 1;
  for (let x = 0; x <= layout.width; x += 1) {
    const pixelX = GRID_X + x * TILE_WIDTH;
    context.beginPath();
    context.moveTo(pixelX, GRID_Y);
    context.lineTo(pixelX, GRID_Y + layout.height * TILE_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= layout.height; y += 1) {
    const pixelY = GRID_Y + y * TILE_HEIGHT;
    context.beginPath();
    context.moveTo(GRID_X, pixelY);
    context.lineTo(GRID_X + layout.width * TILE_WIDTH, pixelY);
    context.stroke();
  }

  for (const fixture of layout.fixtures.filter(isEditableStoreFixture)) {
    const bounds = storeFixtureBounds(fixture);
    const pixel = tilePixel(bounds);
    const selected = fixture.id === selectedFixtureId;
    context.fillStyle = selected ? "rgba(255, 205, 73, .18)" : "rgba(57, 174, 226, .08)";
    context.fillRect(pixel.x, pixel.y, bounds.width * TILE_WIDTH, bounds.height * TILE_HEIGHT);
    context.strokeStyle = selected ? "#ffcf49" : "rgba(112, 211, 255, .82)";
    context.lineWidth = selected ? 4 : 2;
    context.strokeRect(
      pixel.x + 1,
      pixel.y + 1,
      bounds.width * TILE_WIDTH - 2,
      bounds.height * TILE_HEIGHT - 2,
    );
    drawText(
      context,
      fixtureLabel(fixture),
      pixel.x + (bounds.width * TILE_WIDTH) / 2,
      pixel.y + (bounds.height * TILE_HEIGHT) / 2,
      selected ? 12 : 10,
      selected ? "#fff4cf" : "#d8f2ff",
    );
  }

  for (const issue of evaluation.issues) {
    if (!issue.tile) continue;
    const pixel = tilePixel(issue.tile);
    context.fillStyle = "rgba(218, 58, 58, .55)";
    context.fillRect(pixel.x + 1, pixel.y + 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);
  }

  context.fillStyle = evaluation.isValid ? "rgba(16, 92, 69, .94)" : "rgba(133, 37, 37, .94)";
  context.fillRect(326, 3, 428, 29);
  drawText(
    context,
    selectedFixtureId ? "移動先の床をタップ　別の棚をタップすると選択変更" : "移動する棚をタップ",
    540,
    17,
    12,
  );
}

function createPanel(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "store-layout-editor-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <header>
      <div><strong>売場編集</strong><small>営業停止中のみ</small></div>
      <button type="button" data-layout-action="close">閉じる</button>
    </header>
    <div class="layout-editor-selected">棚を選択してください</div>
    <div class="layout-editor-metrics">
      <div><span>客動線</span><b data-layout-metric="customer">—</b></div>
      <div><span>補充動線</span><b data-layout-metric="replenishment">—</b></div>
      <div><span>集中度</span><b data-layout-metric="congestion">—</b></div>
      <div><span>配置点</span><b data-layout-metric="score">—</b></div>
    </div>
    <div class="layout-editor-fixtures" aria-label="移動できる設備"></div>
    <div class="layout-editor-message" role="status"></div>
    <div class="layout-editor-tools">
      <button type="button" data-layout-action="rotate">↻ 回転</button>
      <button type="button" data-layout-action="undo">↶ 一手戻す</button>
      <button type="button" data-layout-action="reset">初期配置</button>
    </div>
    <div class="layout-editor-decisions">
      <button type="button" data-layout-action="cancel">取消</button>
      <button type="button" class="layout-editor-apply" data-layout-action="apply">この配置で営業</button>
    </div>
  `;
  return panel;
}

function createToast(shell: HTMLElement): (message: string) => void {
  const toast = document.createElement("div");
  toast.className = "store-layout-editor-toast";
  toast.hidden = true;
  shell.append(toast);
  let timer = 0;
  return (message: string): void => {
    window.clearTimeout(timer);
    toast.textContent = message;
    toast.hidden = false;
    timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  };
}

export function loadSavedStoreLayout(): StoreLayout | undefined {
  try {
    const raw = window.localStorage.getItem(STORE_LAYOUT_SAVE_KEY);
    if (!raw) return undefined;
    return parseStoredStoreLayout(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function saveStoreLayout(layout: StoreLayout): void {
  try {
    window.localStorage.setItem(STORE_LAYOUT_SAVE_KEY, JSON.stringify(createStoredStoreLayout(layout)));
  } catch {
    // Gameplay continues when browser storage is unavailable.
  }
}

export function clearSavedStoreLayout(): void {
  try {
    window.localStorage.removeItem(STORE_LAYOUT_SAVE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function createStoreLayoutEditorUi(options: StoreLayoutEditorUiOptions): StoreLayoutEditorUi {
  const stage = options.canvas.closest<HTMLElement>(".store-game-stage");
  if (!stage) throw new Error("Store layout editor requires the store game stage");

  const overlay = document.createElement("canvas");
  overlay.className = "store-layout-editor-canvas";
  overlay.width = LOGICAL_WIDTH;
  overlay.height = LOGICAL_HEIGHT;
  overlay.hidden = true;
  overlay.setAttribute("aria-label", "売場レイアウト編集グリッド");
  stage.append(overlay);
  const contextCandidate = overlay.getContext("2d");
  if (!contextCandidate) throw new Error("Store layout editor canvas is unavailable");
  const overlayContext: CanvasRenderingContext2D = contextCandidate;
  const resizeOverlay = (): void => {
    configureHiDpiCanvas(overlay, overlayContext, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  };
  resizeOverlay();
  window.addEventListener("resize", resizeOverlay);

  const panel = createPanel();
  options.shell.append(panel);
  const showToast = createToast(options.shell);

  let opened = false;
  let originalLayout = cloneStoreLayout(options.getEngine().getLayout());
  let workingLayout = cloneStoreLayout(originalLayout);
  let selectedFixtureId: string | undefined;
  let history: StoreLayout[] = [];
  let evaluation = evaluateStoreLayout(workingLayout);

  const selectedLabel = panel.querySelector<HTMLElement>(".layout-editor-selected");
  const message = panel.querySelector<HTMLElement>(".layout-editor-message");
  const fixtureList = panel.querySelector<HTMLElement>(".layout-editor-fixtures");
  const applyButton = panel.querySelector<HTMLButtonElement>("[data-layout-action='apply']");
  const undoButton = panel.querySelector<HTMLButtonElement>("[data-layout-action='undo']");
  const rotateButton = panel.querySelector<HTMLButtonElement>("[data-layout-action='rotate']");

  const metric = (name: string): HTMLElement | null =>
    panel.querySelector<HTMLElement>(`[data-layout-metric='${name}']`);

  function selectedFixture(): StoreFixture | undefined {
    return workingLayout.fixtures.find((fixture) => fixture.id === selectedFixtureId);
  }

  function rebuildFixtureList(): void {
    if (!fixtureList) return;
    fixtureList.replaceChildren();
    for (const fixtureId of editableStoreFixtureIds(workingLayout)) {
      const fixture = workingLayout.fixtures.find((candidate) => candidate.id === fixtureId);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.layoutFixture = fixtureId;
      button.textContent = fixtureLabel(fixture);
      button.setAttribute("aria-pressed", String(fixtureId === selectedFixtureId));
      fixtureList.append(button);
    }
  }

  function render(): void {
    evaluation = evaluateStoreLayout(workingLayout);
    const fixture = selectedFixture();
    if (selectedLabel) selectedLabel.textContent = fixture ? `選択中：${fixtureLabel(fixture)}` : "棚を選択してください";
    if (metric("customer")) metric("customer")!.textContent = evaluation.isValid ? `${evaluation.metrics.averageCustomerSteps}歩` : "—";
    if (metric("replenishment")) metric("replenishment")!.textContent = evaluation.isValid ? `${evaluation.metrics.averageReplenishmentSteps}歩` : "—";
    if (metric("congestion")) metric("congestion")!.textContent = evaluation.isValid ? `${evaluation.metrics.congestionPeak}` : "—";
    if (metric("score")) metric("score")!.textContent = evaluation.isValid ? `${evaluation.metrics.score}点` : "—";
    if (message) {
      message.textContent = evaluation.isValid
        ? "配置可能です。橙色が客・補充動線の集中地点です。"
        : evaluation.issues[0]?.message ?? "この配置は確定できません。";
      message.dataset.valid = String(evaluation.isValid);
    }
    if (applyButton) applyButton.disabled = !evaluation.isValid;
    if (undoButton) undoButton.disabled = history.length === 0;
    if (rotateButton) rotateButton.disabled = fixture === undefined;
    rebuildFixtureList();
    drawEditorOverlay(overlayContext, workingLayout, evaluation, selectedFixtureId);
  }

  function pushHistory(): void {
    history.push(cloneStoreLayout(workingLayout));
    if (history.length > 24) history = history.slice(-24);
  }

  function open(): void {
    if (!options.canEdit()) {
      showToast("時間を停止し、店内に客がいない時に売場を編集できます");
      return;
    }
    originalLayout = cloneStoreLayout(options.getEngine().getLayout());
    workingLayout = cloneStoreLayout(originalLayout);
    selectedFixtureId = undefined;
    history = [];
    opened = true;
    overlay.hidden = false;
    panel.hidden = false;
    options.shell.classList.add("layout-editor-open");
    render();
  }

  function close(): void {
    opened = false;
    overlay.hidden = true;
    panel.hidden = true;
    options.shell.classList.remove("layout-editor-open");
  }

  function apply(): void {
    evaluation = evaluateStoreLayout(workingLayout);
    if (!evaluation.isValid) {
      render();
      return;
    }
    const serialized = prepareOperationsForStoreLayout(options.getEngine().serialize(), workingLayout);
    const engine = restoreStoreOperationsEngine(serialized, workingLayout);
    options.replaceEngine(engine);
    saveStoreLayout(workingLayout);
    showToast("新しい売場配置を保存しました");
    close();
  }

  function handleOverlayPointer(event: PointerEvent): void {
    if (!opened) return;
    const tile = tileFromPointer(overlay, event);
    if (!tile) return;
    const touchedFixture = storeFixtureAtTile(workingLayout, tile);
    if (touchedFixture) {
      selectedFixtureId = touchedFixture.id;
      render();
      return;
    }
    if (!selectedFixtureId) {
      showToast("先に移動する棚を選んでください");
      return;
    }
    pushHistory();
    workingLayout = moveStoreFixture(workingLayout, selectedFixtureId, tile);
    render();
  }

  function handlePanelClick(event: Event): void {
    const target = event.target as Element | null;
    const fixtureButton = target?.closest<HTMLButtonElement>("[data-layout-fixture]");
    if (fixtureButton?.dataset.layoutFixture) {
      selectedFixtureId = fixtureButton.dataset.layoutFixture;
      render();
      return;
    }
    const actionButton = target?.closest<HTMLButtonElement>("[data-layout-action]");
    const action = actionButton?.dataset.layoutAction;
    if (!action) return;
    if (action === "close" || action === "cancel") {
      workingLayout = cloneStoreLayout(originalLayout);
      close();
      return;
    }
    if (action === "apply") {
      apply();
      return;
    }
    if (action === "undo") {
      const previous = history.pop();
      if (previous) workingLayout = previous;
      render();
      return;
    }
    if (action === "reset") {
      pushHistory();
      workingLayout = createDefaultStoreLayout();
      selectedFixtureId = undefined;
      render();
      return;
    }
    if (action === "rotate" && selectedFixtureId) {
      pushHistory();
      workingLayout = rotateStoreFixtureClockwise(workingLayout, selectedFixtureId);
      render();
    }
  }

  function handleShellCapture(event: Event): void {
    const target = event.target as Element | null;
    const storeButton = target?.closest<HTMLButtonElement>("[data-game-action='store']");
    if (!storeButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (opened) close();
    else open();
  }

  function handleResetCapture(): void {
    clearSavedStoreLayout();
    close();
  }

  overlay.addEventListener("pointerdown", handleOverlayPointer);
  panel.addEventListener("click", handlePanelClick);
  options.shell.addEventListener("click", handleShellCapture, true);
  document.getElementById("reset-button")?.addEventListener("click", handleResetCapture, true);

  return {
    open,
    close,
    isOpen: () => opened,
    refresh: render,
    destroy(): void {
      overlay.removeEventListener("pointerdown", handleOverlayPointer);
      panel.removeEventListener("click", handlePanelClick);
      options.shell.removeEventListener("click", handleShellCapture, true);
      document.getElementById("reset-button")?.removeEventListener("click", handleResetCapture, true);
      window.removeEventListener("resize", resizeOverlay);
      overlay.remove();
      panel.remove();
    },
  };
}
