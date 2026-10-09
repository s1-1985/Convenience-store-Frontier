import { describe, expect, it } from "vitest";
import {
  applyCrossInfluence,
  applyLevelChangeRoll,
  applySquareInfluence,
  createInitialTownGrid,
  runMonthlyTownGrowthTick,
  TOWN_GRID_HEIGHT,
  TOWN_GRID_WIDTH,
  type TownGrid,
} from "../simulation/townGrowth.js";

function tileAt(grid: TownGrid, row: number, col: number) {
  return grid.tiles[row * grid.width + col]!;
}

describe("createInitialTownGrid", () => {
  it("原作の60×50区画(design/ps1-reference/algorithms.md §7)で初期化される", () => {
    const grid = createInitialTownGrid();
    expect(grid.width).toBe(TOWN_GRID_WIDTH);
    expect(grid.height).toBe(TOWN_GRID_HEIGHT);
    expect(grid.tiles).toHaveLength(TOWN_GRID_WIDTH * TOWN_GRID_HEIGHT);
    expect(grid.tiles.every((tile) => tile.level === 0 && tile.influence === 0)).toBe(true);
  });
});

describe("applySquareInfluence", () => {
  it("中心8マス拡張(17×17)の全マスへ+30する", () => {
    const grid = createInitialTownGrid();
    const center = { row: 25, col: 30 };
    applySquareInfluence(grid, center);

    expect(tileAt(grid, 25, 30).influence).toBe(30);
    expect(tileAt(grid, 25 - 8, 30 - 8).influence).toBe(30);
    expect(tileAt(grid, 25 + 8, 30 + 8).influence).toBe(30);
    expect(tileAt(grid, 25 - 9, 30).influence).toBe(0);
    expect(tileAt(grid, 25, 30 + 9).influence).toBe(0);
  });

  it("100を超えて蓄積しない", () => {
    const grid = createInitialTownGrid();
    const center = { row: 25, col: 30 };
    for (let i = 0; i < 5; i += 1) {
      applySquareInfluence(grid, center);
    }
    expect(tileAt(grid, 25, 30).influence).toBe(100);
  });
});

describe("applyCrossInfluence", () => {
  it("上1マス+左右3マスの十字へ+10する(中心自体は対象外)", () => {
    const grid = createInitialTownGrid();
    const center = { row: 25, col: 30 };
    applyCrossInfluence(grid, center);

    expect(tileAt(grid, 24, 30).influence).toBe(10);
    expect(tileAt(grid, 25, 27).influence).toBe(10);
    expect(tileAt(grid, 25, 33).influence).toBe(10);
    expect(tileAt(grid, 25, 30).influence).toBe(10);
    expect(tileAt(grid, 25, 34).influence).toBe(0);
    expect(tileAt(grid, 26, 30).influence).toBe(0);
  });

  it("category=1(道路)のマスには加算しない", () => {
    const grid = createInitialTownGrid();
    const center = { row: 25, col: 30 };
    tileAt(grid, 25, 33).category = 1;
    applyCrossInfluence(grid, center);
    expect(tileAt(grid, 25, 33).influence).toBe(0);
  });
});

describe("applyLevelChangeRoll", () => {
  it("roll<=影響値ならレベルが上がる", () => {
    const grid = createInitialTownGrid();
    tileAt(grid, 0, 0).influence = 100;
    applyLevelChangeRoll(grid, () => 0);
    expect(tileAt(grid, 0, 0).level).toBe(1);
  });

  it("roll>影響値ならレベルは変わらない", () => {
    const grid = createInitialTownGrid();
    tileAt(grid, 0, 0).influence = 10;
    applyLevelChangeRoll(grid, () => 0.99);
    expect(tileAt(grid, 0, 0).level).toBe(0);
  });

  it("レベル25で上限に達し、それ以上は上がらない", () => {
    const grid = createInitialTownGrid();
    const tile = tileAt(grid, 0, 0);
    tile.influence = 100;
    tile.level = 25;
    applyLevelChangeRoll(grid, () => 0);
    expect(tile.level).toBe(25);
  });
});

describe("runMonthlyTownGrowthTick", () => {
  it("影響源から7.1→7.2の順で適用し、集計値を返す", () => {
    const grid = createInitialTownGrid();
    const result = runMonthlyTownGrowthTick(grid, [{ row: 25, col: 30 }], () => 0);

    // 中心マスは正方形影響(+30)と非対称影響(+10)の両方を受ける
    expect(tileAt(grid, 25, 30).influence).toBe(40);
    expect(tileAt(grid, 25, 30).level).toBe(1);
    expect(result.maxLevel).toBeGreaterThanOrEqual(1);
    expect(result.influencedTileCount).toBeGreaterThan(0);
    expect(result.averageLevel).toBeGreaterThan(0);
  });

  it("同じシードなら決定的に同じ結果になる", () => {
    const sources = [{ row: 25, col: 30 }];
    let seed = 1;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const gridA = createInitialTownGrid();
    const resultA = runMonthlyTownGrowthTick(gridA, sources, rng);

    seed = 1;
    const gridB = createInitialTownGrid();
    const resultB = runMonthlyTownGrowthTick(gridB, sources, rng);

    expect(resultA).toEqual(resultB);
    expect(gridA).toEqual(gridB);
  });
});
