/**
 * @file _genericGolf.ts
 * @description Authentic ±1 chain engine for the Golf / TriPeaks / Black Hole
 * family. Core mechanic: a single "waste" pile (the only valid destination)
 * accepts cards from the layout whose rank is ±1 from the waste's top card.
 * The sequence is optionally circular (Ace ↔ King) and supports combo
 * multipliers (chained moves without drawing double the score).
 *
 * Replaces the previous approximation where Black Hole, Triple Peaks, Pumpkin,
 * Diamond Mine, Robert were forced through the tableau-foundation engine
 * (which doesn't model "card to waste by ±1").
 *
 * Supported layouts:
 *   - 'peaks'    — N peaks (TriPeaks default 3) sharing a base row, top rows
 *                  start face-down and flip when their two covering cards
 *                  are removed.
 *   - 'columns'  — N columns of cards, tail of each column accessible.
 *   - 'grid'     — flat grid (Pumpkin), all face-up, all accessible until
 *                  removed.
 *   - 'radial'   — Black Hole: N piles of M cards around a central pivot.
 *   - 'rows'     — All in a Row : N horizontal rows; tail of each row is
 *                  accessible (left- or right-most card).
 */

import type { Suit, Rank, Card } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export type GolfLayoutKind = 'peaks' | 'columns' | 'grid' | 'radial' | 'rows';

export interface GolfConfig {
  name: string;
  decks: 1 | 2;
  layoutKind: GolfLayoutKind;
  /** peaks/grid/rows: cards per row. columns/radial: cards per pile. */
  shape: number[];
  /** Some peak layouts hide the upper rows initially (flipped when uncovered). */
  hideUpperRows?: number; // e.g. 3 → top 3 rows start face-down (TriPeaks)
  /** Sequence rule. */
  circular: boolean; // true: Ace can follow King and vice-versa
  /** Whether a stock pile exists. */
  stockEnabled: boolean;
  /** Recycle policy when stock empties. */
  stockRecycle: 'unlimited' | 'none' | number;
  /** Cards drawn per stock tap (default 1). */
  stockDrawCount: number;
  /** Combo enabled (each chained card doubles score). */
  comboEnabled: boolean;
  /** Score per card removed without combo. */
  pointsPerCard: number;
  /** Pre-seed the waste with the first stock card on init? */
  seedWasteFromStock: boolean;
  /** Win condition. */
  winCondition: 'layout-cleared' | 'all-cleared';
}

export interface GolfGameState {
  config: GolfConfig;
  /** layout[row][col] = card or null. */
  layout: (Card | null)[][];
  stock: Card[];
  waste: Card[];
  /** Top card of waste (driver for ±1). */
  topCard: Card | null;
  score: number;
  combo: number;
  moveCount: number;
  stockRecyclesUsed: number;
  won: boolean;
  lost: boolean;
}

export type GolfAction =
  | { type: 'PLAY_CARD'; row: number; col: number }
  | { type: 'DRAW_STOCK' }
  | { type: 'RECYCLE_WASTE' }
  | { type: 'CHECK_END' };

// ─── Deck ───────────────────────────────────────────────────────────────────

function buildDeck(decks: 1 | 2): Card[] {
  const out: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (let r = 1; r <= 13; r++) {
        out.push({
          id: `${names[r] || String(r)}${suit}#${d + 1}`,
          suit,
          rank: r as Rank,
          faceUp: false,
        });
      }
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

export function createInitialStateFor(config: GolfConfig, seed?: number | string | null): GolfGameState {
  const rng = rngFromSeed(seed);
  let deck = shuffleSeeded(buildDeck(config.decks), rng);
  const layout: (Card | null)[][] = [];
  const hideUpper = config.hideUpperRows ?? 0;

  for (let r = 0; r < config.shape.length; r++) {
    const size = config.shape[r];
    const row: (Card | null)[] = [];
    const rowFaceUp = r >= hideUpper;
    for (let c = 0; c < size; c++) {
      const card = deck.shift();
      row.push(card ? { ...card, faceUp: rowFaceUp } : null);
    }
    layout.push(row);
  }

  let stock: Card[] = [];
  let waste: Card[] = [];
  let topCard: Card | null = null;

  if (config.stockEnabled) {
    stock = deck.map((c) => ({ ...c, faceUp: false }));
    deck = [];
    if (config.seedWasteFromStock && stock.length > 0) {
      const seed = stock.pop()!;
      seed.faceUp = true;
      waste.push(seed);
      topCard = seed;
    }
  } else if (config.layoutKind === 'radial' && deck.length > 0) {
    // Black Hole: center card is the seed
    const seed = deck.shift()!;
    seed.faceUp = true;
    waste.push(seed);
    topCard = seed;
  }

  return {
    config,
    layout,
    stock,
    waste,
    topCard,
    score: 0,
    combo: 0,
    moveCount: 0,
    stockRecyclesUsed: 0,
    won: false,
    lost: false,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Cards covered by another card directly below. */
function isAccessible(state: GolfGameState, r: number, c: number): boolean {
  const cfg = state.config;
  const card = state.layout[r]?.[c];
  if (!card) return false;

  if (cfg.layoutKind === 'peaks') {
    // Peak/TriPeaks layout: card at (r,c) is covered by (r+1,c) and (r+1,c+1)
    const below = state.layout[r + 1];
    if (!below) return card.faceUp; // bottom row always accessible if visible
    const left = below[c];
    const right = below[c + 1];
    if (left || right) return false;
    return card.faceUp;
  }
  if (cfg.layoutKind === 'columns') {
    // Tail of column is accessible
    const col = state.layout[r];
    for (let i = col.length - 1; i >= 0; i--) {
      if (col[i]) return i === c;
    }
    return false;
  }
  if (cfg.layoutKind === 'grid') {
    return true;
  }
  if (cfg.layoutKind === 'radial') {
    // Tail of pile (top of stack)
    const pile = state.layout[r];
    for (let i = pile.length - 1; i >= 0; i--) {
      if (pile[i]) return i === c;
    }
    return false;
  }
  if (cfg.layoutKind === 'rows') {
    // Either end (leftmost or rightmost non-null) is accessible.
    const row = state.layout[r];
    const firstIdx = row.findIndex((x) => x !== null);
    let lastIdx = -1;
    for (let i = row.length - 1; i >= 0; i--) if (row[i]) { lastIdx = i; break; }
    return c === firstIdx || c === lastIdx;
  }
  return false;
}

export function canPlay(card: Card, top: Card | null, config: GolfConfig): boolean {
  if (!top) return true; // Empty waste accepts anything (rare, only at start)
  const diff = Math.abs(card.rank - top.rank);
  if (diff === 1) return true;
  if (config.circular && diff === 12) return true; // A=1 ↔ K=13
  return false;
}

/** Flip newly-uncovered face-down cards after a removal. */
function flipUncovered(state: GolfGameState): GolfGameState {
  if (state.config.layoutKind !== 'peaks') return state;
  const layout = state.layout.map((row) => row.slice());
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      const card = layout[r][c];
      if (card && !card.faceUp) {
        const below = layout[r + 1];
        if (!below) {
          layout[r][c] = { ...card, faceUp: true };
          continue;
        }
        const left = below[c];
        const right = below[c + 1];
        if (!left && !right) {
          layout[r][c] = { ...card, faceUp: true };
        }
      }
    }
  }
  return { ...state, layout };
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function gameReducer(state: GolfGameState, action: GolfAction): GolfGameState {
  switch (action.type) {
    case 'PLAY_CARD': {
      if (state.won || state.lost) return state;
      const card = state.layout[action.row]?.[action.col];
      if (!card || !card.faceUp) return state;
      if (!isAccessible(state, action.row, action.col)) return state;
      if (!canPlay(card, state.topCard, state.config)) return state;

      // Compute score with combo
      const cfg = state.config;
      const comboMul = cfg.comboEnabled ? Math.pow(2, state.combo) : 1;
      const earned = cfg.pointsPerCard * comboMul;

      const newLayout = state.layout.map((row) => row.slice());
      newLayout[action.row][action.col] = null;
      const newWaste = state.waste.concat([{ ...card, faceUp: true }]);
      let next: GolfGameState = {
        ...state,
        layout: newLayout,
        waste: newWaste,
        topCard: card,
        score: state.score + earned,
        combo: state.combo + 1,
        moveCount: state.moveCount + 1,
      };
      next = flipUncovered(next);
      return checkEnd(next);
    }

    case 'DRAW_STOCK': {
      if (!state.config.stockEnabled || state.stock.length === 0) return state;
      const drawn: Card[] = [];
      for (let i = 0; i < state.config.stockDrawCount && state.stock.length > 0; i++) {
        const c = state.stock[state.stock.length - 1 - i];
        drawn.push({ ...c, faceUp: true });
      }
      const newStock = state.stock.slice(0, state.stock.length - drawn.length);
      const newWaste = state.waste.concat(drawn);
      const top = drawn[drawn.length - 1] ?? state.topCard;
      return checkEnd({
        ...state,
        stock: newStock,
        waste: newWaste,
        topCard: top,
        combo: 0, // drawing resets combo
        moveCount: state.moveCount + 1,
      });
    }

    case 'RECYCLE_WASTE': {
      if (!state.config.stockEnabled || state.stock.length > 0 || state.waste.length === 0) return state;
      if (state.config.stockRecycle === 'none') return state;
      if (typeof state.config.stockRecycle === 'number' && state.stockRecyclesUsed >= state.config.stockRecycle) return state;
      return {
        ...state,
        stock: state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false })),
        waste: [],
        topCard: null,
        combo: 0,
        stockRecyclesUsed: state.stockRecyclesUsed + 1,
        moveCount: state.moveCount + 1,
      };
    }

    case 'CHECK_END':
      return checkEnd(state);

    default:
      return state;
  }
}

function checkEnd(state: GolfGameState): GolfGameState {
  // Count cards remaining in layout
  let cardsLeft = 0;
  for (const row of state.layout) for (const c of row) if (c) cardsLeft++;

  if (cardsLeft === 0) {
    // Cleared layout → win
    return { ...state, won: true };
  }

  // Lose condition: no playable layout card AND no stock left
  if (state.stock.length === 0) {
    let canMove = false;
    for (let r = 0; r < state.layout.length && !canMove; r++) {
      for (let c = 0; c < state.layout[r].length && !canMove; c++) {
        const card = state.layout[r][c];
        if (card && card.faceUp && isAccessible(state, r, c) && canPlay(card, state.topCard, state.config)) {
          canMove = true;
        }
      }
    }
    if (!canMove) return { ...state, lost: true };
  }

  return state;
}

/** UI helper: which (row,col) cells are playable right now? */
export function listPlayableCells(state: GolfGameState): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < state.layout.length; r++) {
    for (let c = 0; c < state.layout[r].length; c++) {
      const card = state.layout[r][c];
      if (card && card.faceUp && isAccessible(state, r, c) && canPlay(card, state.topCard, state.config)) {
        out.push([r, c]);
      }
    }
  }
  return out;
}
