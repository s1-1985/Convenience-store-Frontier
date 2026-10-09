import type { RandomFn } from "./rng.js";

// PS1版「ザ・コンビニ」の街の成長アルゴリズムの移植(design/ps1-reference/algorithms.md
// §7、design/DECISIONS/ADR-0008・ADR-0009参照)。元資料自身が「断片のみ復元」と明記して
// いる区間であり、本実装も確認済みの数式のみを移植する。以下は原作データが無いため
// 意図的に未移植(独自に数値を作って埋めることはしない):
//   - 「店舗影響」(自店の価値を基準に拡張12マス)は除数(divisor)が不明なため未実装
//   - 7.3(建替え判定)は新築時の建物種別テーブル(0x9FF1C相当)の内容が未解読のため未実装
//   - 町人口の集計(§4の町人口集計アルゴリズム)は建物種別→人口の対応表が未解読のため
//     未実装。本モジュールはタイルの影響値・レベルのみを管理し、人口への変換は行わない

export const TOWN_GRID_WIDTH = 60;
export const TOWN_GRID_HEIGHT = 50;

const MAX_LEVEL = 25;
const MIN_LEVEL_FOR_DEMOTE = 2;
const INFLUENCE_CAP = 100;

const SQUARE_INFLUENCE_RADIUS = 8;
const SQUARE_INFLUENCE_STRENGTH = 30;
const CROSS_INFLUENCE_UP = 1;
const CROSS_INFLUENCE_SIDE = 3;
const CROSS_INFLUENCE_STRENGTH = 10;

/** 画面表示名・完全な対応表は未解読(design/ps1-reference/README.md参照)。本実装が
 * 実際に参照するのは、非対称影響の除外条件に使う1(道路相当)のみ。3(空き地)は
 * 将来7.3を実装する際の受け皿として予約している。 */
export type TownTileCategory = 0 | 1 | 3;

export interface TownTile {
  level: number;
  influence: number;
  category: TownTileCategory;
}

export interface TownGrid {
  width: number;
  height: number;
  tiles: TownTile[];
}

export interface InfluenceSource {
  row: number;
  col: number;
}

export function createInitialTownGrid(
  width: number = TOWN_GRID_WIDTH,
  height: number = TOWN_GRID_HEIGHT,
): TownGrid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({
      level: 0,
      influence: 0,
      category: 0,
    })),
  };
}

function tileIndex(grid: TownGrid, row: number, col: number): number | null {
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) {
    return null;
  }
  return row * grid.width + col;
}

function addInfluence(grid: TownGrid, row: number, col: number, amount: number): void {
  const index = tileIndex(grid, row, col);
  if (index === null) {
    return;
  }
  const tile = grid.tiles[index]!;
  tile.influence = Math.min(INFLUENCE_CAP, tile.influence + amount);
}

/** 7.1 正方形影響: 自店中心8マス拡張(17×17)の全マスへ+30(design/ps1-reference/algorithms.md §7.1)。 */
export function applySquareInfluence(grid: TownGrid, source: InfluenceSource): void {
  for (let dRow = -SQUARE_INFLUENCE_RADIUS; dRow <= SQUARE_INFLUENCE_RADIUS; dRow += 1) {
    for (let dCol = -SQUARE_INFLUENCE_RADIUS; dCol <= SQUARE_INFLUENCE_RADIUS; dCol += 1) {
      addInfluence(grid, source.row + dRow, source.col + dCol, SQUARE_INFLUENCE_STRENGTH);
    }
  }
}

/** 7.1 非対称影響: 上1マス+左右3マス拡張の十字、category!=1のマスのみ+10。 */
export function applyCrossInfluence(grid: TownGrid, source: InfluenceSource): void {
  const offsets: Array<[number, number]> = [[-CROSS_INFLUENCE_UP, 0]];
  for (let dCol = -CROSS_INFLUENCE_SIDE; dCol <= CROSS_INFLUENCE_SIDE; dCol += 1) {
    offsets.push([0, dCol]);
  }

  for (const [dRow, dCol] of offsets) {
    const row = source.row + dRow;
    const col = source.col + dCol;
    const index = tileIndex(grid, row, col);
    if (index === null || grid.tiles[index]!.category === 1) {
      continue;
    }
    addInfluence(grid, row, col, CROSS_INFLUENCE_STRENGTH);
  }
}

/**
 * 7.2 建物レベルの昇格・降格。影響値が正なら roll<=影響値 でレベル+1(上限25)、
 * 負なら roll<=-影響値 でレベル-1(下限2)。本実装には影響値を負にする仕組みが
 * まだ無い(7.1の店舗影響は未実装)ため、降格は現状発生しない。
 */
export function applyLevelChangeRoll(grid: TownGrid, rng: RandomFn): void {
  for (const tile of grid.tiles) {
    if (tile.influence > 0) {
      const roll = Math.floor(rng() * 100) + 1;
      if (roll <= tile.influence && tile.level < MAX_LEVEL) {
        tile.level += 1;
      }
    } else if (tile.influence < 0) {
      const roll = Math.floor(rng() * 100) + 1;
      if (roll <= -tile.influence && tile.level >= MIN_LEVEL_FOR_DEMOTE) {
        tile.level -= 1;
      }
    }
  }
}

export interface TownGrowthTickResult {
  averageLevel: number;
  maxLevel: number;
  influencedTileCount: number;
}

/** 月次(MONTH_LENGTH_DAYSごと)に呼ぶ。影響源(自店+競合店)ごとに7.1を適用後、7.2の判定を行う。 */
export function runMonthlyTownGrowthTick(
  grid: TownGrid,
  sources: readonly InfluenceSource[],
  rng: RandomFn,
): TownGrowthTickResult {
  for (const source of sources) {
    applySquareInfluence(grid, source);
    applyCrossInfluence(grid, source);
  }
  applyLevelChangeRoll(grid, rng);

  let levelSum = 0;
  let maxLevel = 0;
  let influencedTileCount = 0;
  for (const tile of grid.tiles) {
    levelSum += tile.level;
    if (tile.level > maxLevel) {
      maxLevel = tile.level;
    }
    if (tile.influence !== 0) {
      influencedTileCount += 1;
    }
  }

  return {
    averageLevel: levelSum / grid.tiles.length,
    maxLevel,
    influencedTileCount,
  };
}
