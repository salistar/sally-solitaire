/**
 * @file _genericTableau.ts
 * @description Shared tableau-foundation engine used by the Canfield, Castle,
 * and Fans solitaire families. Designed to be configured via a `TableauConfig`
 * passed at init time — variant-specific files in this directory compose it.
 *
 * Scope:
 * - N tableau piles with configurable deal pattern + face-up rules
 * - Optional stock (with draw count + recycle policy)
 * - Optional reserve piles (Canfield-style)
 * - Optional free cells (FreeCell-style; not the default — included for reuse)
 * - 4 or 8 foundations with configurable base rank and direction
 * - Stacking rules: 'alternating-colors', 'same-suit', 'any-different-suit',
 *   'any-different-color', 'any'
 * - Empty-column rules: 'any', 'king-only', 'forbidden'
 *
 * Out of scope (handled by sibling _genericDistribution.ts):
 * - Clock layouts, paired-card removal, pip-sum mechanics
 *
 * Note: This engine is intentionally permissive about edge cases — it favors
 * "the game plays reasonably" over "the game enforces every nuance of the
 * variant's rules". Variant-specific tweaks live in the wrapper files.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // A..K
export type Color = 'red' | 'black';

export interface Card {
  id: string;        // unique within game, e.g. "AS#1"
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export function colorOf(suit: Suit): Color {
  return suit === 'H' || suit === 'D' ? 'red' : 'black';
}

export type StackingRule =
  | 'alternating-colors'    // red ↔ black (Klondike, FreeCell)
  | 'same-suit'              // ♠ on ♠ (Forty Thieves, Spider-like)
  | 'any-different-suit'     // any suit ≠ self (Thumb and Pouch)
  | 'any-different-color'    // any color ≠ self (Moosehide)
  | 'any';                   // no constraint (Fans single-pile rule)

export type EmptyColumnRule = 'any' | 'king-only' | 'forbidden';
export type RunDirection = 'descending' | 'ascending' | 'both';
export type StockRecycle = 'unlimited' | 'none' | number;

export interface TableauConfig {
  /** Display name (FR). */
  name: string;
  /** Number of decks (1, 2, 3). */
  decks: 1 | 2 | 3;
  /** Number of tableau columns. */
  tableauColumns: number;
  /** Cards per column (length must equal tableauColumns). */
  tableauDealPattern: number[];
  /** How many cards from the bottom of each column start face-up. 'all' = all. */
  tableauFaceUpFromBottom: number | 'all';
  /** Number of free cells (FreeCell-like). */
  freeCells: number;
  /** Number of reserve piles (Canfield/Agnes). */
  reservePiles: number;
  /** Cards per reserve pile (single number applied to each). */
  reservePileSize: number;
  /** Are reserve piles face-up? */
  reserveFaceUp: boolean;
  /** Number of foundations. */
  foundations: number;
  /** Base rank for foundations: 1=Ace, 'variable'=set by first stock card. */
  foundationBaseRank: Rank | 'variable';
  /** Foundation build direction. */
  foundationDirection: RunDirection;
  /** Tableau stacking rule. */
  stackingRule: StackingRule;
  /** Tableau stacking direction. */
  stackingDirection: RunDirection;
  /** Empty column accepts what? */
  emptyColumnRule: EmptyColumnRule;
  /** Stock present? */
  stockEnabled: boolean;
  /** Cards drawn per stock tap. */
  stockDrawCount: number;
  /** Stock recycle policy. */
  stockRecycle: StockRecycle;
  /** Number of redeals allowed for the tableau (Fans: La Belle Lucie has 2). */
  tableauRedeals: number;
  /** Allowed to move multi-card sequences? */
  multiCardMove: boolean;
}

export interface GameState {
  config: TableauConfig;
  tableau: Card[][];        // tableauColumns piles
  freeCells: (Card | null)[]; // length = freeCells
  reserves: Card[][];        // length = reservePiles
  foundations: Card[][];     // length = foundations
  stock: Card[];
  waste: Card[];
  /** Resolved rank for variable-base foundations (set after first stock card). */
  foundationBaseRankResolved: Rank;
  stockRecyclesUsed: number;
  tableauRedealsUsed: number;
  moveCount: number;
  history: Action[];
  won: boolean;
  lost: boolean;
}

export type Action =
  | { type: 'DRAW_STOCK' }
  | { type: 'RECYCLE_WASTE' }
  | { type: 'TABLEAU_TO_TABLEAU'; from: number; cardIdx: number; to: number }
  | { type: 'TABLEAU_TO_FOUNDATION'; from: number; foundation: number }
  | { type: 'WASTE_TO_TABLEAU'; to: number }
  | { type: 'WASTE_TO_FOUNDATION'; foundation: number }
  | { type: 'RESERVE_TO_TABLEAU'; reserve: number; to: number }
  | { type: 'RESERVE_TO_FOUNDATION'; reserve: number; foundation: number }
  | { type: 'FREECELL_TO_TABLEAU'; cell: number; to: number }
  | { type: 'FREECELL_TO_FOUNDATION'; cell: number; foundation: number }
  | { type: 'TABLEAU_TO_FREECELL'; from: number; cell: number }
  | { type: 'REDEAL_TABLEAU' }
  | { type: 'UNDO' };

// ────────────────────────────────────────────────────────────────────────────
// Deck construction
// ────────────────────────────────────────────────────────────────────────────

function buildDeck(decks: 1 | 2 | 3): Card[] {
  const out: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (let rank = 1 as Rank; rank <= 13; rank = (rank + 1) as Rank) {
        out.push({ id: `${rankChar(rank)}${suit}#${d + 1}`, suit, rank, faceUp: false });
      }
    }
  }
  return out;
}

function rankChar(r: Rank): string {
  return ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[r] || String(r);
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Initial state
// ────────────────────────────────────────────────────────────────────────────

export function createInitialStateFor(config: TableauConfig, seed?: number | string | null): GameState {
  // Accept a numeric seed OR a string seed (FNV-1a → 32-bit) so race-mode
  // (where the seed is the match code) and local seeded tests both work.
  let rng: () => number;
  if (seed == null) {
    rng = Math.random;
  } else if (typeof seed === 'number') {
    rng = mulberry32(seed);
  } else {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    rng = mulberry32(h >>> 0);
  }
  let deck = shuffle(buildDeck(config.decks), rng);

  // Reserves
  const reserves: Card[][] = [];
  for (let r = 0; r < config.reservePiles; r++) {
    const pile = deck.splice(0, config.reservePileSize).map((c) => ({ ...c, faceUp: config.reserveFaceUp }));
    reserves.push(pile);
  }

  // Tableau
  const tableau: Card[][] = [];
  for (let col = 0; col < config.tableauColumns; col++) {
    const size = config.tableauDealPattern[col] ?? 0;
    const pile = deck.splice(0, size).map((c, idx, arr) => {
      const fromBottom = arr.length - 1 - idx; // 0 = last card
      const faceUp =
        config.tableauFaceUpFromBottom === 'all' ||
        fromBottom < config.tableauFaceUpFromBottom;
      return { ...c, faceUp };
    });
    tableau.push(pile);
  }

  // Foundations (empty piles)
  const foundations: Card[][] = Array.from({ length: config.foundations }, () => []);

  // Free cells
  const freeCells: (Card | null)[] = Array.from({ length: config.freeCells }, () => null);

  // Resolve foundation base rank
  let foundationBaseRankResolved: Rank = 1 as Rank;
  if (config.foundationBaseRank === 'variable') {
    // Take next card from deck (becomes the first foundation card)
    const first = deck[0];
    foundationBaseRankResolved = first ? first.rank : (1 as Rank);
    if (first) {
      foundations[0].push({ ...first, faceUp: true });
      deck.shift();
    }
  } else {
    foundationBaseRankResolved = config.foundationBaseRank;
  }

  // Stock / waste
  let stock: Card[] = [];
  if (config.stockEnabled) {
    stock = deck.map((c) => ({ ...c, faceUp: false }));
    deck = [];
  } else {
    // Distribute leftover cards onto the last tableau column if any
    if (deck.length > 0 && config.tableauColumns > 0) {
      const lastCol = tableau[config.tableauColumns - 1];
      for (const c of deck) lastCol.push({ ...c, faceUp: true });
      deck = [];
    }
  }
  const waste: Card[] = [];

  return {
    config,
    tableau,
    freeCells,
    reserves,
    foundations,
    stock,
    waste,
    foundationBaseRankResolved,
    stockRecyclesUsed: 0,
    tableauRedealsUsed: 0,
    moveCount: 0,
    history: [],
    won: false,
    lost: false,
  };
}

// Deterministic RNG for tests / reproducible deals.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────────────────

export function canStackOnTableau(child: Card, parent: Card | null, cfg: TableauConfig): boolean {
  if (parent == null) {
    // Empty column
    if (cfg.emptyColumnRule === 'forbidden') return false;
    if (cfg.emptyColumnRule === 'king-only') return child.rank === 13;
    return true;
  }
  // Rank check
  const okDir =
    cfg.stackingDirection === 'descending' ? parent.rank === child.rank + 1 :
    cfg.stackingDirection === 'ascending'  ? parent.rank === child.rank - 1 :
    Math.abs(parent.rank - child.rank) === 1; // both
  if (!okDir) return false;
  // Suit check
  const cChild = colorOf(child.suit);
  const cParent = colorOf(parent.suit);
  switch (cfg.stackingRule) {
    case 'alternating-colors':  return cChild !== cParent;
    case 'same-suit':            return child.suit === parent.suit;
    case 'any-different-suit':   return child.suit !== parent.suit;
    case 'any-different-color':  return cChild !== cParent;
    case 'any':                  return true;
    default:                     return false;
  }
}

export function canPlaceOnFoundation(child: Card, top: Card | null, cfg: TableauConfig, baseRank: Rank): boolean {
  // Empty foundation accepts the base rank (and matching suit if non-empty foundations carry suit)
  if (top == null) return child.rank === baseRank;
  if (top.suit !== child.suit) return false;
  // Build direction
  if (cfg.foundationDirection === 'ascending')  return child.rank === (top.rank % 13) + 1;
  if (cfg.foundationDirection === 'descending') return top.rank === (child.rank % 13) + 1;
  return Math.abs(top.rank - child.rank) === 1; // both
}

// ────────────────────────────────────────────────────────────────────────────
// Reducer
// ────────────────────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: Action): GameState {
  const cfg = state.config;
  switch (action.type) {
    case 'DRAW_STOCK': {
      if (!cfg.stockEnabled || state.stock.length === 0) return state;
      const drawn: Card[] = [];
      for (let i = 0; i < cfg.stockDrawCount && state.stock.length > 0; i++) {
        drawn.push({ ...state.stock[state.stock.length - 1], faceUp: true });
      }
      const newStock = state.stock.slice(0, state.stock.length - drawn.length);
      const newWaste = state.waste.concat(drawn);
      return next(state, { stock: newStock, waste: newWaste });
    }
    case 'RECYCLE_WASTE': {
      if (!cfg.stockEnabled || state.stock.length > 0 || state.waste.length === 0) return state;
      if (cfg.stockRecycle === 'none') return state;
      if (typeof cfg.stockRecycle === 'number' && state.stockRecyclesUsed >= cfg.stockRecycle) return state;
      const newStock = state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false }));
      return next(state, { stock: newStock, waste: [], stockRecyclesUsed: state.stockRecyclesUsed + 1 });
    }
    case 'TABLEAU_TO_TABLEAU': {
      const fromPile = state.tableau[action.from];
      const toPile = state.tableau[action.to];
      if (!fromPile || !toPile) return state;
      const card = fromPile[action.cardIdx];
      if (!card || !card.faceUp) return state;
      // Multi-card move: validate the sequence is sane (only when multiCardMove)
      if (action.cardIdx < fromPile.length - 1 && !cfg.multiCardMove) return state;
      const moving = fromPile.slice(action.cardIdx);
      const target = toPile[toPile.length - 1] ?? null;
      if (!canStackOnTableau(moving[0], target, cfg)) return state;
      const newFrom = fromPile.slice(0, action.cardIdx);
      // Auto-flip the new top of `from`
      if (newFrom.length > 0 && !newFrom[newFrom.length - 1].faceUp) {
        newFrom[newFrom.length - 1] = { ...newFrom[newFrom.length - 1], faceUp: true };
      }
      const newTo = toPile.concat(moving);
      const newTableau = state.tableau.slice();
      newTableau[action.from] = newFrom;
      newTableau[action.to] = newTo;
      return next(state, { tableau: newTableau });
    }
    case 'TABLEAU_TO_FOUNDATION': {
      const pile = state.tableau[action.from];
      if (!pile || pile.length === 0) return state;
      const card = pile[pile.length - 1];
      const foundationPile = state.foundations[action.foundation];
      const top = foundationPile[foundationPile.length - 1] ?? null;
      if (!canPlaceOnFoundation(card, top, cfg, state.foundationBaseRankResolved)) return state;
      const newPile = pile.slice(0, pile.length - 1);
      if (newPile.length > 0 && !newPile[newPile.length - 1].faceUp) {
        newPile[newPile.length - 1] = { ...newPile[newPile.length - 1], faceUp: true };
      }
      const newFoundations = state.foundations.slice();
      newFoundations[action.foundation] = foundationPile.concat([card]);
      const newTableau = state.tableau.slice();
      newTableau[action.from] = newPile;
      return checkWin(next(state, { tableau: newTableau, foundations: newFoundations }));
    }
    case 'WASTE_TO_TABLEAU': {
      if (state.waste.length === 0) return state;
      const card = state.waste[state.waste.length - 1];
      const toPile = state.tableau[action.to];
      if (!toPile) return state;
      const target = toPile[toPile.length - 1] ?? null;
      if (!canStackOnTableau(card, target, cfg)) return state;
      const newWaste = state.waste.slice(0, -1);
      const newTableau = state.tableau.slice();
      newTableau[action.to] = toPile.concat([card]);
      return next(state, { waste: newWaste, tableau: newTableau });
    }
    case 'WASTE_TO_FOUNDATION': {
      if (state.waste.length === 0) return state;
      const card = state.waste[state.waste.length - 1];
      const foundationPile = state.foundations[action.foundation];
      const top = foundationPile[foundationPile.length - 1] ?? null;
      if (!canPlaceOnFoundation(card, top, cfg, state.foundationBaseRankResolved)) return state;
      const newFoundations = state.foundations.slice();
      newFoundations[action.foundation] = foundationPile.concat([card]);
      return checkWin(next(state, { waste: state.waste.slice(0, -1), foundations: newFoundations }));
    }
    case 'RESERVE_TO_TABLEAU': {
      const pile = state.reserves[action.reserve];
      if (!pile || pile.length === 0) return state;
      const card = pile[pile.length - 1];
      const toPile = state.tableau[action.to];
      if (!toPile) return state;
      const target = toPile[toPile.length - 1] ?? null;
      if (!canStackOnTableau(card, target, cfg)) return state;
      const newReserves = state.reserves.slice();
      newReserves[action.reserve] = pile.slice(0, -1);
      const newTableau = state.tableau.slice();
      newTableau[action.to] = toPile.concat([card]);
      return next(state, { reserves: newReserves, tableau: newTableau });
    }
    case 'RESERVE_TO_FOUNDATION': {
      const pile = state.reserves[action.reserve];
      if (!pile || pile.length === 0) return state;
      const card = pile[pile.length - 1];
      const foundationPile = state.foundations[action.foundation];
      const top = foundationPile[foundationPile.length - 1] ?? null;
      if (!canPlaceOnFoundation(card, top, cfg, state.foundationBaseRankResolved)) return state;
      const newReserves = state.reserves.slice();
      newReserves[action.reserve] = pile.slice(0, -1);
      const newFoundations = state.foundations.slice();
      newFoundations[action.foundation] = foundationPile.concat([card]);
      return checkWin(next(state, { reserves: newReserves, foundations: newFoundations }));
    }
    case 'FREECELL_TO_TABLEAU': {
      const card = state.freeCells[action.cell];
      if (!card) return state;
      const toPile = state.tableau[action.to];
      if (!toPile) return state;
      const target = toPile[toPile.length - 1] ?? null;
      if (!canStackOnTableau(card, target, cfg)) return state;
      const newCells = state.freeCells.slice();
      newCells[action.cell] = null;
      const newTableau = state.tableau.slice();
      newTableau[action.to] = toPile.concat([card]);
      return next(state, { freeCells: newCells, tableau: newTableau });
    }
    case 'FREECELL_TO_FOUNDATION': {
      const card = state.freeCells[action.cell];
      if (!card) return state;
      const foundationPile = state.foundations[action.foundation];
      const top = foundationPile[foundationPile.length - 1] ?? null;
      if (!canPlaceOnFoundation(card, top, cfg, state.foundationBaseRankResolved)) return state;
      const newCells = state.freeCells.slice();
      newCells[action.cell] = null;
      const newFoundations = state.foundations.slice();
      newFoundations[action.foundation] = foundationPile.concat([card]);
      return checkWin(next(state, { freeCells: newCells, foundations: newFoundations }));
    }
    case 'TABLEAU_TO_FREECELL': {
      const pile = state.tableau[action.from];
      if (!pile || pile.length === 0) return state;
      if (state.freeCells[action.cell] != null) return state;
      const card = pile[pile.length - 1];
      const newPile = pile.slice(0, -1);
      if (newPile.length > 0 && !newPile[newPile.length - 1].faceUp) {
        newPile[newPile.length - 1] = { ...newPile[newPile.length - 1], faceUp: true };
      }
      const newCells = state.freeCells.slice();
      newCells[action.cell] = card;
      const newTableau = state.tableau.slice();
      newTableau[action.from] = newPile;
      return next(state, { tableau: newTableau, freeCells: newCells });
    }
    case 'REDEAL_TABLEAU': {
      if (state.tableauRedealsUsed >= cfg.tableauRedeals) return state;
      // Collect all non-foundation, non-empty tableau cards, shuffle, redeal.
      const remaining = state.tableau.flat();
      const reshuffled = shuffle(remaining);
      const newTableau: Card[][] = [];
      let idx = 0;
      for (let col = 0; col < cfg.tableauColumns; col++) {
        const size = cfg.tableauDealPattern[col] ?? 0;
        newTableau.push(reshuffled.slice(idx, idx + size).map((c) => ({ ...c, faceUp: true })));
        idx += size;
      }
      return next(state, { tableau: newTableau, tableauRedealsUsed: state.tableauRedealsUsed + 1 });
    }
    case 'UNDO': {
      // Lightweight: not implemented (history would need to capture full state).
      return state;
    }
    default:
      return state;
  }
}

function next(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch, moveCount: state.moveCount + 1 };
}

function checkWin(state: GameState): GameState {
  // Generic: all foundations filled to their max (13 cards per for ascending A→K).
  const expectedPerFoundation = 13;
  const totalNeeded = state.config.foundations * expectedPerFoundation;
  const totalOnFoundations = state.foundations.reduce((sum, p) => sum + p.length, 0);
  if (totalOnFoundations >= totalNeeded) return { ...state, won: true };
  return state;
}
