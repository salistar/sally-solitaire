/**
 * @file _mazeEngine.ts
 * @description Authentic Maze solitaire engine. Maze has a unique mechanic that
 * doesn't fit any of the other generic engines:
 *
 *   - 52 cards (or 48 after removing all 4 Kings) laid in a 6-row × 9-col grid
 *     (4 cells empty at start, the "holes").
 *   - A hole can be filled by a card whose rank is ONE HIGHER than the card to
 *     its LEFT (same suit), OR by a card whose rank is ONE LOWER than the card
 *     to its RIGHT (same suit). The grid is "wrap-around": end of row N
 *     connects to start of row N+1.
 *   - Goal: arrange all cards in 4 sequences A → Q (no Kings) by suit, reading
 *     left-to-right, top-to-bottom.
 *
 * Powers a single dataset variant : maze.
 */

import type { Suit, Rank, Card } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export interface MazeConfig {
  name: string;
  rows: number;
  cols: number;
  /** Ranks removed at game start (Maze removes all 4 Kings). */
  removeRanks: number[];
}

export interface MazeGameState {
  config: MazeConfig;
  /** grid[r][c] = card or null (hole). Flat positions for wrap-around: pos = r*cols + c. */
  grid: (Card | null)[][];
  moveCount: number;
  won: boolean;
}

export type MazeAction =
  | { type: 'MOVE'; fromRow: number; fromCol: number; toRow: number; toCol: number };

// ─── Deck ───────────────────────────────────────────────────────────────────

function buildDeck(): Card[] {
  const out: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  for (const suit of suits) {
    for (let r = 1; r <= 13; r++) {
      out.push({
        id: `${names[r] || String(r)}${suit}#1`,
        suit,
        rank: r as Rank,
        faceUp: true,
      });
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Initial state ──────────────────────────────────────────────────────────

export function createInitialStateFor(config: MazeConfig, seed?: number | string | null): MazeGameState {
  const rng = rngFromSeed(seed);
  let deck = buildDeck();
  // Remove specified ranks (all suits)
  if (config.removeRanks.length > 0) {
    deck = deck.filter((c) => !config.removeRanks.includes(c.rank));
  }
  deck = shuffleSeeded(deck, rng);

  const totalCells = config.rows * config.cols;
  const grid: (Card | null)[][] = Array.from({ length: config.rows }, () => Array(config.cols).fill(null));

  // Place each remaining card in random grid positions; leave holes for empty cells.
  const positions: Array<[number, number]> = [];
  for (let r = 0; r < config.rows; r++) for (let c = 0; c < config.cols; c++) positions.push([r, c]);

  // Shuffle positions, then place cards in the first N positions
  const shuffledPositions = shuffleSeeded(positions, rng);
  for (let i = 0; i < Math.min(deck.length, totalCells); i++) {
    const [r, c] = shuffledPositions[i];
    grid[r][c] = deck[i];
  }

  return {
    config,
    grid,
    moveCount: 0,
    won: false,
  };
}

// ─── Position arithmetic (wrap-around) ──────────────────────────────────────

function posToIndex(r: number, c: number, cols: number): number {
  return r * cols + c;
}

function indexToPos(i: number, cols: number): [number, number] {
  return [Math.floor(i / cols), i % cols];
}

/** Get the LEFT neighbor (wraps from start of row N to end of row N-1). null if at very start. */
function leftNeighbor(state: MazeGameState, r: number, c: number): Card | null {
  const i = posToIndex(r, c, state.config.cols);
  if (i === 0) return null;
  const [pr, pc] = indexToPos(i - 1, state.config.cols);
  return state.grid[pr][pc];
}

/** Get the RIGHT neighbor (wraps from end of row N to start of row N+1). null if at very end. */
function rightNeighbor(state: MazeGameState, r: number, c: number): Card | null {
  const i = posToIndex(r, c, state.config.cols);
  const max = state.config.rows * state.config.cols - 1;
  if (i === max) return null;
  const [nr, nc] = indexToPos(i + 1, state.config.cols);
  return state.grid[nr][nc];
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Can `card` be placed into the hole at (toRow, toCol)?
 *   - Card's rank = (left neighbor's rank + 1) and same suit, OR
 *   - Card's rank = (right neighbor's rank - 1) and same suit.
 */
export function canFillHole(state: MazeGameState, card: Card, toRow: number, toCol: number): boolean {
  if (state.grid[toRow][toCol] !== null) return false;
  const left = leftNeighbor(state, toRow, toCol);
  const right = rightNeighbor(state, toRow, toCol);
  if (left && left.suit === card.suit && card.rank === left.rank + 1) return true;
  if (right && right.suit === card.suit && card.rank === right.rank - 1) return true;
  // Edge case: at the very start, any card can be placed if the right neighbor
  // accepts (no left neighbor at i=0). Same for the very end (no right neighbor).
  if (!left && right && right.suit === card.suit && card.rank === right.rank - 1) return true;
  if (left && !right && left.suit === card.suit && card.rank === left.rank + 1) return true;
  return false;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function gameReducer(state: MazeGameState, action: MazeAction): MazeGameState {
  switch (action.type) {
    case 'MOVE': {
      const card = state.grid[action.fromRow]?.[action.fromCol];
      if (!card) return state;
      if (!canFillHole(state, card, action.toRow, action.toCol)) return state;
      const newGrid = state.grid.map((row) => row.slice());
      newGrid[action.toRow][action.toCol] = card;
      newGrid[action.fromRow][action.fromCol] = null;
      return checkWin({
        ...state,
        grid: newGrid,
        moveCount: state.moveCount + 1,
      });
    }
    default:
      return state;
  }
}

/** Win: cards reading left→right, top→bottom form 4 same-suit A→Q sequences. */
function checkWin(state: MazeGameState): MazeGameState {
  const flat: Card[] = [];
  for (const row of state.grid) for (const c of row) if (c) flat.push(c);
  if (flat.length !== 48) return state; // Maze expects 48 cards after King removal

  // Walk the flat array: expect 4 ascending A→Q runs, each same suit.
  let runStart = 0;
  let runs = 0;
  for (let i = 0; i < flat.length; i++) {
    const expectedRank = (i - runStart) + 1;
    if (flat[i].rank !== expectedRank) return state;
    if (flat[i].suit !== flat[runStart].suit) return state;
    if (flat[i].rank === 12) {
      runs++;
      runStart = i + 1;
    }
  }
  if (runs === 4) return { ...state, won: true };
  return state;
}

/** UI helper: list all holes (toRow, toCol) currently fillable by `card`. */
export function listFillableHoles(state: MazeGameState, card: Card): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < state.config.rows; r++) {
    for (let c = 0; c < state.config.cols; c++) {
      if (canFillHole(state, card, r, c)) out.push([r, c]);
    }
  }
  return out;
}
