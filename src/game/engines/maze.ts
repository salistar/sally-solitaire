/**
 * @file maze.ts — Maze engine wrapper.
 * @description Now points to the authentic _mazeEngine (grid + hole-filling
 * mechanic). The previous TableauConfig is kept for backward compat with any
 * code that still imports CONFIG, but the variant is routed via the new
 * MAZE_CONFIG below.
 */
import { createInitialStateFor as createTableau, gameReducer as tableauReducer, type TableauConfig, type GameState as TabState, type Action as TabAction } from './_genericTableau';

export const CONFIG: TableauConfig = {
  name: 'Maze',
  decks: 1,
  tableauColumns: 8,
  tableauDealPattern: [7,7,7,7,7,7,7,7],
  tableauFaceUpFromBottom: 'all',
  freeCells: 0,
  reservePiles: 0,
  reservePileSize: 0,
  reserveFaceUp: true,
  foundations: 4,
  foundationBaseRank: 1 as any,
  foundationDirection: 'ascending',
  stackingRule: 'any-different-suit',
  stackingDirection: 'descending',
  emptyColumnRule: 'any',
  stockEnabled: false,
  stockDrawCount: 1,
  stockRecycle: 'unlimited',
  tableauRedeals: 0,
  multiCardMove: true,
};

export function createInitialState(seed?: number): TabState {
  return createTableau(CONFIG, seed);
}

export const gameReducer = tableauReducer;
export type { TabState as GameState, TabAction as Action };

// ─── Authentic Maze config (used by MazeScreen + _mazeEngine) ───
import type { MazeConfig } from './_mazeEngine';

export const MAZE_CONFIG: MazeConfig = {
  name: 'Maze',
  rows: 6,
  cols: 9,
  removeRanks: [13], // remove all 4 Kings at start
};
