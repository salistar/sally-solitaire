/**
 * @file _genericPairs.ts
 * @description Authentic pair-removal engine for the Pyramid, Pairs (Monte
 * Carlo, Nestor, Decade, Quinze…), and Mahjong (cards) families. Covers
 * variants whose core mechanic is "select two accessible cards that satisfy
 * a pair-validity rule (sum=N, same rank, ±1 sequence, same suit) and remove
 * both from the layout".
 *
 * Replaces the previous approximation where these variants routed through
 * the tableau-foundation generic engine (which doesn't model pair removal).
 *
 * Supported layouts:
 *   - 'pyramid'   — N rows in a stacked pyramid; a card is accessible only if
 *                   no card overlaps the row below.
 *   - 'columns'   — N columns of M cards each; only the tail of each column.
 *   - 'grid'      — flat grid of cards; all face-up, all accessible.
 *   - 'tripeaks'  — 3 peaks sharing a base row (handled here for completeness,
 *                   though the ±1 chain mechanic uses _genericGolf instead).
 *
 * Supported pair rules:
 *   - sum: card1.value + card2.value == target (default 13). Aces/Faces use
 *          A=1, J=11, Q=12, K=13. King self-removes if target=13.
 *   - rank-match: same rank (Monte Carlo).
 *   - suit-match: same suit (Concentration variants).
 *   - rank-or-suit: rank OR suit identical (Royal Marriage style).
 *   - sequence-1: |v1 - v2| == 1 (chain games).
 *   - aces-up: special — discard the lower of two same-suit cards in same row.
 */

import type { Suit, Rank, Card } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export type PairsLayoutKind = 'pyramid' | 'columns' | 'grid' | 'tripeaks';
export type PairsRule = 'sum' | 'rank-match' | 'suit-match' | 'rank-or-suit' | 'sequence-1' | 'aces-up';
export type StockRecycle = 'unlimited' | 'none' | number;

export interface PairsConfig {
  name: string;
  decks: 1 | 2;
  layoutKind: PairsLayoutKind;
  /** Pyramid: rows (e.g. [1,2,3,4,5,6,7]). Columns/grid: irrelevant. */
  rows?: number[];
  /** Columns/grid: cards per column (length = number of columns). */
  columns?: number[];
  /** Grid: explicit [cols, rows]. */
  gridSize?: [number, number];
  pairRule: PairsRule;
  /** For 'sum' rule: target sum. Default 13. */
  pairTarget?: number;
  /** For 'sum'+target=13: rank that self-removes (default 13=King). null = no single removal. */
  singleRemovalRank?: number | null;
  stockEnabled: boolean;
  stockRecycle: StockRecycle;
  /** Number of cards drawn per stock tap (1 for most pair games). */
  stockDrawCount: number;
  /** Aces Up: 4 columns mode — distribute 1 card per column on each "draw". */
  acesUpDistributePerDraw?: boolean;
  /** Win condition tweak. */
  winCondition: 'all-cleared' | 'layout-cleared' | 'aces-remaining';
}

/** Position of a card in the layout (used to address it from actions). */
export type CardLocation =
  | { kind: 'layout'; row: number; col: number } // for pyramid/columns/grid
  | { kind: 'waste' }                            // top of waste
  | { kind: 'reserve'; idx: number };            // for variants with reserves

export interface PairsGameState {
  config: PairsConfig;
  /** Flat layout: layout[row][col] = card or null (null = removed). */
  layout: (Card | null)[][];
  stock: Card[];
  waste: Card[];
  removed: Card[];      // discard pile (informational)
  stockRecyclesUsed: number;
  moveCount: number;
  won: boolean;
  lost: boolean;
  /** Selected card waiting for its pair partner. */
  selected: CardLocation | null;
}

export type PairsAction =
  | { type: 'SELECT'; loc: CardLocation }
  | { type: 'TRY_REMOVE_SINGLE'; loc: CardLocation }
  | { type: 'TRY_REMOVE_PAIR'; a: CardLocation; b: CardLocation }
  | { type: 'DRAW_STOCK' }
  | { type: 'RECYCLE_WASTE' }
  | { type: 'DEAL_ACES_UP' }
  | { type: 'CHECK_END' };

// ─── Deck construction ──────────────────────────────────────────────────────

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
          faceUp: true,
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

export function createInitialStateFor(config: PairsConfig, seed?: number | string | null): PairsGameState {
  const rng = rngFromSeed(seed);
  let deck = shuffleSeeded(buildDeck(config.decks), rng);
  let layout: (Card | null)[][] = [];

  if (config.layoutKind === 'pyramid') {
    const rows = config.rows ?? [1, 2, 3, 4, 5, 6, 7];
    for (let r = 0; r < rows.length; r++) {
      const row: (Card | null)[] = [];
      for (let c = 0; c < rows[r]; c++) {
        const card = deck.shift();
        row.push(card ? { ...card, faceUp: true } : null);
      }
      layout.push(row);
    }
  } else if (config.layoutKind === 'columns') {
    const cols = config.columns ?? [];
    // Represent columns as ROWS of equal length (jagged), so layout[colIdx] = column cards.
    for (let c = 0; c < cols.length; c++) {
      const col: (Card | null)[] = [];
      for (let i = 0; i < cols[c]; i++) {
        const card = deck.shift();
        col.push(card ? { ...card, faceUp: true } : null);
      }
      layout.push(col);
    }
  } else if (config.layoutKind === 'grid') {
    const [w, h] = config.gridSize ?? [5, 5];
    for (let r = 0; r < h; r++) {
      const row: (Card | null)[] = [];
      for (let c = 0; c < w; c++) {
        const card = deck.shift();
        row.push(card ? { ...card, faceUp: true } : null);
      }
      layout.push(row);
    }
  } else if (config.layoutKind === 'tripeaks') {
    // 3 peaks (positions 0,3,6 of top row), descending to a base row of 10
    layout = [
      [deck.shift() || null, null, null, deck.shift() || null, null, null, deck.shift() || null, null, null, null].map(c => c ? { ...c, faceUp: false } : null),
      [deck.shift() || null, deck.shift() || null, null, deck.shift() || null, deck.shift() || null, null, deck.shift() || null, deck.shift() || null, null, null].map(c => c ? { ...c, faceUp: false } : null),
      Array.from({ length: 9 }, () => {
        const c = deck.shift();
        return c ? { ...c, faceUp: false } : null;
      }),
      Array.from({ length: 10 }, () => {
        const c = deck.shift();
        return c ? { ...c, faceUp: true } : null;
      }),
    ];
  }

  return {
    config,
    layout,
    stock: config.stockEnabled ? deck.map((c) => ({ ...c, faceUp: false })) : [],
    waste: [],
    removed: [],
    stockRecyclesUsed: 0,
    moveCount: 0,
    won: false,
    lost: false,
    selected: null,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cardValue(card: Card): number {
  // For sum rules: A=1, 2..10=face, J=11, Q=12, K=13.
  return card.rank;
}

function isAccessibleInLayout(loc: CardLocation & { kind: 'layout' }, state: PairsGameState): boolean {
  const cfg = state.config;
  const { row, col } = loc;
  const card = state.layout[row]?.[col];
  if (!card) return false;

  if (cfg.layoutKind === 'pyramid' || cfg.layoutKind === 'tripeaks') {
    // A card is accessible if no card overlaps it in the row below.
    const below = state.layout[row + 1];
    if (!below) return true; // bottom row
    // For pyramid: card at (r,c) is covered by (r+1, c) and (r+1, c+1)
    const left = below[col];
    const right = below[col + 1];
    return !left && !right;
  }
  if (cfg.layoutKind === 'columns') {
    // Only the tail of each column is accessible
    const column = state.layout[row]; // here row == colIdx for columns layout
    // Find last non-null card; that's the tail.
    for (let i = column.length - 1; i >= 0; i--) {
      if (column[i]) return i === col;
    }
    return false;
  }
  if (cfg.layoutKind === 'grid') {
    // Grid: all cards accessible.
    return true;
  }
  return false;
}

export function isAccessible(loc: CardLocation, state: PairsGameState): boolean {
  if (loc.kind === 'waste') return state.waste.length > 0;
  if (loc.kind === 'reserve') return false; // reserves use a different mechanic
  return isAccessibleInLayout(loc, state);
}

export function getCardAt(loc: CardLocation, state: PairsGameState): Card | null {
  if (loc.kind === 'waste') {
    return state.waste[state.waste.length - 1] ?? null;
  }
  if (loc.kind === 'layout') {
    return state.layout[loc.row]?.[loc.col] ?? null;
  }
  return null;
}

export function arePair(a: Card, b: Card, config: PairsConfig): boolean {
  if (a.id === b.id) return false; // can't pair a card with itself
  switch (config.pairRule) {
    case 'sum':
      return cardValue(a) + cardValue(b) === (config.pairTarget ?? 13);
    case 'rank-match':
      return a.rank === b.rank;
    case 'suit-match':
      return a.suit === b.suit;
    case 'rank-or-suit':
      return a.rank === b.rank || a.suit === b.suit;
    case 'sequence-1':
      return Math.abs(a.rank - b.rank) === 1;
    case 'aces-up':
      // Discard the lower of two same-suit cards. Both must be same suit;
      // the LOWER one is removed (the caller picks which is which).
      return a.suit === b.suit && a.rank !== b.rank;
    default:
      return false;
  }
}

export function canRemoveSingle(card: Card, config: PairsConfig): boolean {
  if (config.singleRemovalRank == null) return false;
  return card.rank === config.singleRemovalRank;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function gameReducer(state: PairsGameState, action: PairsAction): PairsGameState {
  switch (action.type) {
    case 'SELECT': {
      // If nothing selected: select this card. If already selected: try pair.
      if (!state.selected) {
        if (!isAccessible(action.loc, state)) return state;
        // If single-removable rank, auto-remove
        const c = getCardAt(action.loc, state);
        if (c && canRemoveSingle(c, state.config)) {
          return removeSingle(state, action.loc);
        }
        return { ...state, selected: action.loc };
      }
      // Already had a selection: same loc → deselect; else try pair
      const sameLoc = locEquals(state.selected, action.loc);
      if (sameLoc) return { ...state, selected: null };
      return tryRemovePair(state, state.selected, action.loc);
    }

    case 'TRY_REMOVE_SINGLE':
      return removeSingle(state, action.loc);

    case 'TRY_REMOVE_PAIR':
      return tryRemovePair(state, action.a, action.b);

    case 'DRAW_STOCK': {
      if (!state.config.stockEnabled || state.stock.length === 0) return state;
      if (state.config.acesUpDistributePerDraw) {
        // Aces Up: distribute 1 card on each column.
        const cols = state.layout;
        const newLayout = cols.map((col, idx) => {
          const draw = state.stock[state.stock.length - 1 - idx];
          return draw ? [...col, { ...draw, faceUp: true }] : col;
        });
        const drawnCount = Math.min(cols.length, state.stock.length);
        return {
          ...state,
          layout: newLayout,
          stock: state.stock.slice(0, state.stock.length - drawnCount),
          moveCount: state.moveCount + 1,
          selected: null,
        };
      }
      const drawn: Card[] = [];
      for (let i = 0; i < state.config.stockDrawCount && state.stock.length > 0; i++) {
        const c = state.stock[state.stock.length - 1 - i];
        drawn.push({ ...c, faceUp: true });
      }
      return {
        ...state,
        stock: state.stock.slice(0, state.stock.length - drawn.length),
        waste: state.waste.concat(drawn),
        moveCount: state.moveCount + 1,
        selected: null,
      };
    }

    case 'RECYCLE_WASTE': {
      if (!state.config.stockEnabled || state.stock.length > 0 || state.waste.length === 0) return state;
      if (state.config.stockRecycle === 'none') return state;
      if (typeof state.config.stockRecycle === 'number' && state.stockRecyclesUsed >= state.config.stockRecycle) return state;
      return {
        ...state,
        stock: state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false })),
        waste: [],
        stockRecyclesUsed: state.stockRecyclesUsed + 1,
        moveCount: state.moveCount + 1,
        selected: null,
      };
    }

    case 'DEAL_ACES_UP':
      return gameReducer(state, { type: 'DRAW_STOCK' });

    case 'CHECK_END':
      return checkEnd(state);

    default:
      return state;
  }
}

function locEquals(a: CardLocation, b: CardLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'layout' && b.kind === 'layout') return a.row === b.row && a.col === b.col;
  if (a.kind === 'reserve' && b.kind === 'reserve') return a.idx === b.idx;
  return true; // both 'waste'
}

function removeCardAt(state: PairsGameState, loc: CardLocation): PairsGameState {
  const card = getCardAt(loc, state);
  if (!card) return state;
  if (loc.kind === 'waste') {
    return {
      ...state,
      waste: state.waste.slice(0, -1),
      removed: state.removed.concat([card]),
    };
  }
  if (loc.kind === 'layout') {
    const newLayout = state.layout.map((row) => row.slice());
    newLayout[loc.row][loc.col] = null;
    return { ...state, layout: newLayout, removed: state.removed.concat([card]) };
  }
  return state;
}

function removeSingle(state: PairsGameState, loc: CardLocation): PairsGameState {
  const card = getCardAt(loc, state);
  if (!card) return state;
  if (!isAccessible(loc, state)) return state;
  if (!canRemoveSingle(card, state.config)) return state;
  const next = removeCardAt(state, loc);
  return checkEnd({ ...next, moveCount: state.moveCount + 1, selected: null });
}

function tryRemovePair(state: PairsGameState, a: CardLocation, b: CardLocation): PairsGameState {
  const cardA = getCardAt(a, state);
  const cardB = getCardAt(b, state);
  if (!cardA || !cardB) return state;
  if (!isAccessible(a, state) || !isAccessible(b, state)) return state;
  if (!arePair(cardA, cardB, state.config)) return { ...state, selected: null };

  // For Aces-Up: only the LOWER of the two same-suit cards is removed.
  // (Then the empty slot can receive a new deal — Aces Up's whole point.)
  let next = state;
  if (state.config.pairRule === 'aces-up') {
    const lowerLoc = cardA.rank < cardB.rank ? a : b;
    next = removeCardAt(next, lowerLoc);
  } else {
    next = removeCardAt(next, a);
    next = removeCardAt(next, b);
  }

  return checkEnd({ ...next, moveCount: state.moveCount + 1, selected: null });
}

function checkEnd(state: PairsGameState): PairsGameState {
  // Count cards still in layout
  let cardsInLayout = 0;
  for (const row of state.layout) for (const c of row) if (c) cardsInLayout++;

  if (state.config.winCondition === 'aces-remaining') {
    // Aces Up: win if only 4 Aces are left in the layout.
    let aces = 0;
    let nonAces = 0;
    for (const row of state.layout) for (const c of row) if (c) {
      if (c.rank === 1) aces++; else nonAces++;
    }
    if (nonAces === 0 && aces === 4 && state.stock.length === 0) {
      return { ...state, won: true };
    }
    return state;
  }

  if (state.config.winCondition === 'layout-cleared') {
    if (cardsInLayout === 0) return { ...state, won: true };
    return state;
  }

  // Default: all cards (layout + stock + waste) removed
  if (cardsInLayout === 0 && state.stock.length === 0 && state.waste.length === 0) {
    return { ...state, won: true };
  }
  return state;
}

// Helper exported for the UI: list all currently-accessible layout positions.
export function listAccessibleLocations(state: PairsGameState): CardLocation[] {
  const out: CardLocation[] = [];
  for (let r = 0; r < state.layout.length; r++) {
    for (let c = 0; c < state.layout[r].length; c++) {
      if (state.layout[r][c] && isAccessibleInLayout({ kind: 'layout', row: r, col: c }, state)) {
        out.push({ kind: 'layout', row: r, col: c });
      }
    }
  }
  if (state.waste.length > 0) out.push({ kind: 'waste' });
  return out;
}
