/**
 * @file _genericMath.ts
 * @description Authentic engine for the Numeric/Math family — solitaires
 * whose signature is "foundations built by a fixed arithmetic step
 * (modulo 13), not by simple A→K". Powers Calculation, Sir Tommy,
 * Strategy, Auld Lang Syne, Lady Betty, Betsy Ross, Quadrille,
 * Above and Below.
 *
 * Replaces the previous approximation where these variants routed through
 * generic_tableau (which only models A→K by suit foundations).
 *
 * Signature mechanics:
 *   - 4 foundations (sometimes 8 for two-deck variants).
 *   - Each foundation has its own BASE RANK and STEP.
 *     Calculation: bases [A,2,3,4], steps [+1,+2,+3,+4] modulo 13.
 *   - N waste piles where stock cards are stashed before being routed to
 *     foundations.
 *   - The player draws from stock → chooses a waste pile to deposit on.
 *   - From any waste pile (top card), card may be sent to a foundation if
 *     it matches that foundation's expected next rank.
 *
 * Suit is generally ignored ("numeric" family) — Calculation, Sir Tommy,
 * Strategy, etc. all use suit-agnostic foundations. Quadrille is an
 * exception (it has suit-paired foundations).
 */

import type { Suit, Rank, Card } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export type MathSuitRule = 'any' | 'same-suit' | 'matching-pair';
export type StockRecycle = 'unlimited' | 'none' | number;

export interface MathConfig {
  name: string;
  decks: 1 | 2;
  /** Total foundations (typically 4, sometimes 8). */
  numFoundations: number;
  /** Pre-placed base rank for each foundation (length = numFoundations). */
  foundationBaseRanks: number[];
  /** Per-foundation step. null = "any rank +1 forward" (Sir Tommy style). */
  foundationSteps: (number | null)[];
  /** Wrap-around past King (rank 14 → 1, etc.). */
  foundationsModular: boolean;
  /** 'asc' or 'desc' per foundation. Default 'asc'. */
  foundationDirections?: ('asc' | 'desc')[];
  foundationSuitRule: MathSuitRule;
  /** Waste piles count (Calculation=4, Strategy=8, Auld Lang Syne=4). */
  numWastePiles: number;
  /** Can move from one waste pile to another? */
  wasteToWasteAllowed: boolean;
  /** Auld Lang Syne mode: deal 4 cards (one per waste) on each draw. */
  dealAllOnDraw: boolean;
  /** Strategy mode: stock must be fully distributed to waste piles before
   *  any foundation play is allowed. */
  mustDistributeStockFirst: boolean;
  stockRecycle: StockRecycle;
  winCondition: 'all-on-foundations';
}

export interface MathGameState {
  config: MathConfig;
  foundations: Card[][];
  wastePiles: Card[][];
  stock: Card[];
  /** Cards remaining to deposit on waste piles (for distribute-first variants). */
  pendingStockCard: Card | null;
  moveCount: number;
  stockRecyclesUsed: number;
  won: boolean;
  lost: boolean;
}

export type MathAction =
  | { type: 'DRAW_STOCK' }
  | { type: 'STOCK_TO_WASTE'; wasteIdx: number }
  | { type: 'STOCK_TO_FOUNDATION'; foundationIdx: number }
  | { type: 'WASTE_TO_FOUNDATION'; from: number; to: number }
  | { type: 'WASTE_TO_WASTE'; from: number; to: number }
  | { type: 'RECYCLE_WASTE' };

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

export function createInitialStateFor(config: MathConfig, seed?: number | string | null): MathGameState {
  const rng = rngFromSeed(seed);
  let deck = shuffleSeeded(buildDeck(config.decks), rng);

  // For variants with pre-placed foundation bases (Calculation, Betsy Ross),
  // we PULL the appropriate cards out of the deck to seed each foundation.
  const foundations: Card[][] = [];
  for (let i = 0; i < config.numFoundations; i++) {
    const baseRank = config.foundationBaseRanks[i];
    if (baseRank == null) {
      foundations.push([]);
      continue;
    }
    // Find any card of that rank in the deck (suit doesn't matter for math variants)
    const idx = deck.findIndex((c) => c.rank === baseRank);
    if (idx >= 0) {
      const card = deck.splice(idx, 1)[0];
      foundations.push([{ ...card, faceUp: true }]);
    } else {
      foundations.push([]);
    }
  }

  // Empty waste piles
  const wastePiles: Card[][] = Array.from({ length: config.numWastePiles }, () => []);

  // Remaining deck becomes the stock (face-down)
  const stock = deck.map((c) => ({ ...c, faceUp: false }));

  return {
    config,
    foundations,
    wastePiles,
    stock,
    pendingStockCard: null,
    moveCount: 0,
    stockRecyclesUsed: 0,
    won: false,
    lost: false,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

/** What rank should follow `topRank` on a foundation with the given step+modular? */
export function nextExpectedRank(topRank: number, step: number, modular: boolean, direction: 'asc' | 'desc'): number {
  const delta = direction === 'asc' ? step : -step;
  let next = topRank + delta;
  if (modular) {
    // Map to [1, 13] range
    next = ((next - 1) % 13 + 13) % 13 + 1;
  }
  return next;
}

export function canPlaceOnFoundation(card: Card, foundationIdx: number, state: MathGameState): boolean {
  const cfg = state.config;
  const foundation = state.foundations[foundationIdx];
  if (!foundation) return false;
  const top = foundation[foundation.length - 1];

  // Suit rule
  if (cfg.foundationSuitRule === 'same-suit' && top && card.suit !== top.suit) return false;

  // Empty foundation: must match base rank
  if (!top) {
    const base = cfg.foundationBaseRanks[foundationIdx];
    if (base == null) return false;
    return card.rank === base;
  }

  // Step rule
  const step = cfg.foundationSteps[foundationIdx];
  const direction = (cfg.foundationDirections ?? Array(cfg.numFoundations).fill('asc'))[foundationIdx] || 'asc';
  if (step == null) {
    // "any forward step" — for Sir Tommy / Auld Lang Syne style: each foundation
    // builds A→K (or descending) regardless. Treat null as +1.
    const next = nextExpectedRank(top.rank, 1, cfg.foundationsModular, direction);
    return card.rank === next;
  }
  const next = nextExpectedRank(top.rank, step, cfg.foundationsModular, direction);
  return card.rank === next;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function gameReducer(state: MathGameState, action: MathAction): MathGameState {
  const cfg = state.config;
  switch (action.type) {
    case 'DRAW_STOCK': {
      if (state.stock.length === 0) return state;
      if (cfg.dealAllOnDraw) {
        // Auld Lang Syne: deal 1 card per waste pile
        const newWastes = state.wastePiles.map((w) => w.slice());
        let consumed = 0;
        for (let i = 0; i < cfg.numWastePiles && consumed < state.stock.length; i++) {
          const c = state.stock[state.stock.length - 1 - consumed];
          newWastes[i].push({ ...c, faceUp: true });
          consumed++;
        }
        return {
          ...state,
          stock: state.stock.slice(0, state.stock.length - consumed),
          wastePiles: newWastes,
          moveCount: state.moveCount + 1,
        };
      }
      // Single card → into pendingStockCard, player must route it
      const c = state.stock[state.stock.length - 1];
      return {
        ...state,
        stock: state.stock.slice(0, -1),
        pendingStockCard: { ...c, faceUp: true },
        moveCount: state.moveCount + 1,
      };
    }

    case 'STOCK_TO_WASTE': {
      if (!state.pendingStockCard) return state;
      if (action.wasteIdx < 0 || action.wasteIdx >= cfg.numWastePiles) return state;
      const newWastes = state.wastePiles.map((w) => w.slice());
      newWastes[action.wasteIdx].push(state.pendingStockCard);
      return {
        ...state,
        wastePiles: newWastes,
        pendingStockCard: null,
        moveCount: state.moveCount + 1,
      };
    }

    case 'STOCK_TO_FOUNDATION': {
      if (!state.pendingStockCard) return state;
      if (!canPlaceOnFoundation(state.pendingStockCard, action.foundationIdx, state)) return state;
      const newFoundations = state.foundations.map((f) => f.slice());
      newFoundations[action.foundationIdx].push(state.pendingStockCard);
      return checkWin({
        ...state,
        foundations: newFoundations,
        pendingStockCard: null,
        moveCount: state.moveCount + 1,
      });
    }

    case 'WASTE_TO_FOUNDATION': {
      const fromPile = state.wastePiles[action.from];
      if (!fromPile || fromPile.length === 0) return state;
      const card = fromPile[fromPile.length - 1];
      if (cfg.mustDistributeStockFirst && state.stock.length > 0) return state;
      if (!canPlaceOnFoundation(card, action.to, state)) return state;
      const newWastes = state.wastePiles.map((w) => w.slice());
      newWastes[action.from] = fromPile.slice(0, -1);
      const newFoundations = state.foundations.map((f) => f.slice());
      newFoundations[action.to].push(card);
      return checkWin({
        ...state,
        wastePiles: newWastes,
        foundations: newFoundations,
        moveCount: state.moveCount + 1,
      });
    }

    case 'WASTE_TO_WASTE': {
      if (!cfg.wasteToWasteAllowed) return state;
      const from = state.wastePiles[action.from];
      if (!from || from.length === 0) return state;
      if (action.from === action.to) return state;
      const card = from[from.length - 1];
      const newWastes = state.wastePiles.map((w) => w.slice());
      newWastes[action.from] = from.slice(0, -1);
      newWastes[action.to].push(card);
      return { ...state, wastePiles: newWastes, moveCount: state.moveCount + 1 };
    }

    case 'RECYCLE_WASTE': {
      if (cfg.stockRecycle === 'none' || state.stock.length > 0) return state;
      if (typeof cfg.stockRecycle === 'number' && state.stockRecyclesUsed >= cfg.stockRecycle) return state;
      // Merge all waste piles into a new stock (in reverse order)
      const allCards: Card[] = [];
      for (const w of state.wastePiles) for (const c of w) allCards.push(c);
      const newStock = allCards.slice().reverse().map((c) => ({ ...c, faceUp: false }));
      return {
        ...state,
        stock: newStock,
        wastePiles: Array.from({ length: cfg.numWastePiles }, () => []),
        stockRecyclesUsed: state.stockRecyclesUsed + 1,
        moveCount: state.moveCount + 1,
      };
    }

    default:
      return state;
  }
}

function checkWin(state: MathGameState): MathGameState {
  // Win when all foundations are full (13 cards each for single deck)
  const expectedPerFoundation = 13;
  const totalNeeded = state.config.numFoundations * expectedPerFoundation;
  const totalOnFoundations = state.foundations.reduce((s, f) => s + f.length, 0);
  if (totalOnFoundations >= totalNeeded) return { ...state, won: true };
  return state;
}

/** UI helper: which foundations would accept the pending or waste-top card? */
export function listValidFoundations(card: Card, state: MathGameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.config.numFoundations; i++) {
    if (canPlaceOnFoundation(card, i, state)) out.push(i);
  }
  return out;
}
