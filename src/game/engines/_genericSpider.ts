/**
 * @file _genericSpider.ts
 * @description Authentic Spider engine with the signature K→A auto-removal
 * mechanic. Replaces the previous approximation where Spiderwort, Will o' the
 * Wisp, Beetle, and Mrs. Mop ran on _genericTableau (which doesn't model
 * complete-run removal).
 *
 * The Spider family's defining trait: when a tableau column ends with a
 * complete K→A run (same suit), those 13 cards are AUTOMATICALLY moved to a
 * foundation slot, freeing the column tail. Win = all 4 (1-deck) or 8
 * (2-deck) runs collected.
 *
 * This engine is configurable:
 *   - 1 or 2 decks (52 or 104 cards)
 *   - Arbitrary column count + deal pattern
 *   - Suit count: 1, 2, or 4 (controls how many distinct suits are used)
 *   - Stock present or not, draw count, recycle rules
 *   - Stacking direction: descending (default Spider) or both
 *   - Empty column rule: any-allowed or king-only or forbidden
 *
 * The existing `spiderEngine.ts` stays intact for the legacy spider-1/2/4
 * variants — we don't touch it to avoid regressions. This new engine powers
 * the 4 dataset variants currently approximated.
 */

import type { Suit, Rank, Card } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export type SpiderEmptyRule = 'any' | 'king-only' | 'forbidden';

export interface SpiderConfig {
  name: string;
  decks: 1 | 2;
  tableauColumns: number;
  tableauDealPattern: number[];
  /** Cards from bottom of each column that start face-up. 'all' = all. */
  tableauFaceUpFromBottom: number | 'all';
  /** 1 = single suit only (Spider 1 Suit), 2, or 4 suits used. */
  suitMode: 1 | 2 | 4;
  /** Stack rule on tableau: descending same-suit (Spider) or alternating colors (Black Widow). */
  stackingRule: 'same-suit' | 'alternating-colors';
  emptyColumnRule: SpiderEmptyRule;
  /** Stock distribution: 1 card per column on each draw. */
  stockEnabled: boolean;
  /** Number of dealings allowed from stock. Spider classic: 5 deals (10×5=50). */
  stockDealCount: number;
  /** May we draw from stock when an empty column exists? Most variants: no. */
  allowDrawWithEmptyColumn: boolean;
  /** Allow moving any block (not just a same-suit run) between columns? Scorpion=true. */
  allowAnyBlockMove: boolean;
}

export interface SpiderGameState {
  config: SpiderConfig;
  tableau: Card[][];
  stock: Card[];
  /** Each completed K→A run lands here as a 13-card pile. */
  completedRuns: Card[][];
  stockDealsUsed: number;
  moveCount: number;
  won: boolean;
}

export type SpiderAction =
  | { type: 'MOVE'; from: number; cardIdx: number; to: number }
  | { type: 'DEAL_STOCK' };

// ─── Deck ───────────────────────────────────────────────────────────────────

function buildSpiderDeck(decks: 1 | 2, suitMode: 1 | 2 | 4): Card[] {
  const out: Card[] = [];
  const allSuits: Suit[] = ['S', 'H', 'D', 'C'];
  const suits: Suit[] = suitMode === 1 ? ['S']
                      : suitMode === 2 ? ['S', 'H']
                      : allSuits;
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  // Total cards: 52 × decks. If suitMode < 4, we duplicate one suit to fill.
  const targetCount = 52 * decks;
  let made = 0;
  let deckIdx = 0;
  while (made < targetCount) {
    for (const suit of suits) {
      for (let r = 1; r <= 13 && made < targetCount; r++) {
        out.push({
          id: `${names[r] || String(r)}${suit}#${deckIdx + 1}`,
          suit,
          rank: r as Rank,
          faceUp: false,
        });
        made++;
      }
    }
    deckIdx++;
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

export function createInitialStateFor(config: SpiderConfig, seed?: number | string | null): SpiderGameState {
  const rng = rngFromSeed(seed);
  let deck = shuffleSeeded(buildSpiderDeck(config.decks, config.suitMode), rng);
  const tableau: Card[][] = [];
  for (let col = 0; col < config.tableauColumns; col++) {
    const size = config.tableauDealPattern[col] ?? 0;
    const pile: Card[] = [];
    for (let i = 0; i < size; i++) {
      const c = deck.shift();
      if (!c) break;
      const fromBottom = size - 1 - i;
      const faceUp =
        config.tableauFaceUpFromBottom === 'all' ||
        fromBottom < (config.tableauFaceUpFromBottom as number);
      pile.push({ ...c, faceUp });
    }
    tableau.push(pile);
  }
  const stock = config.stockEnabled ? deck.map((c) => ({ ...c, faceUp: false })) : [];
  return {
    config,
    tableau,
    stock,
    completedRuns: [],
    stockDealsUsed: 0,
    moveCount: 0,
    won: false,
  };
}

// ─── Move validation ────────────────────────────────────────────────────────

function colorOf(s: Suit): 'red' | 'black' { return s === 'H' || s === 'D' ? 'red' : 'black'; }

/**
 * Is the slice tableau[from][cardIdx..end] a movable block?
 * In strict Spider, the block must be a single descending run of the same suit.
 * In Scorpion-mode (allowAnyBlockMove), any contiguous face-up block moves.
 */
export function isMovableBlock(state: SpiderGameState, from: number, cardIdx: number): boolean {
  const pile = state.tableau[from];
  if (!pile || cardIdx >= pile.length) return false;
  const slice = pile.slice(cardIdx);
  if (slice.some((c) => !c.faceUp)) return false;
  if (state.config.allowAnyBlockMove) return true;
  // Strict: same-suit descending run
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].suit !== slice[i - 1].suit) return false;
    if (slice[i].rank !== slice[i - 1].rank - 1) return false;
  }
  return true;
}

export function canStackOn(state: SpiderGameState, child: Card, to: number): boolean {
  const cfg = state.config;
  const pile = state.tableau[to];
  if (pile.length === 0) {
    if (cfg.emptyColumnRule === 'forbidden') return false;
    if (cfg.emptyColumnRule === 'king-only') return child.rank === 13;
    return true;
  }
  const target = pile[pile.length - 1];
  if (!target.faceUp) return false;
  // Descending rank-1
  if (child.rank !== target.rank - 1) return false;
  if (cfg.stackingRule === 'same-suit') return child.suit === target.suit;
  if (cfg.stackingRule === 'alternating-colors') return colorOf(child.suit) !== colorOf(target.suit);
  return true;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function gameReducer(state: SpiderGameState, action: SpiderAction): SpiderGameState {
  switch (action.type) {
    case 'MOVE': {
      const fromPile = state.tableau[action.from];
      if (!fromPile) return state;
      if (!isMovableBlock(state, action.from, action.cardIdx)) return state;
      const block = fromPile.slice(action.cardIdx);
      const movingHead = block[0];
      if (!canStackOn(state, movingHead, action.to)) return state;
      const newFrom = fromPile.slice(0, action.cardIdx);
      // Flip the new top of `from` if it was face-down
      if (newFrom.length > 0 && !newFrom[newFrom.length - 1].faceUp) {
        newFrom[newFrom.length - 1] = { ...newFrom[newFrom.length - 1], faceUp: true };
      }
      const newTo = state.tableau[action.to].concat(block);
      const newTableau = state.tableau.slice();
      newTableau[action.from] = newFrom;
      newTableau[action.to] = newTo;
      let next: SpiderGameState = { ...state, tableau: newTableau, moveCount: state.moveCount + 1 };
      next = autoRemoveRuns(next);
      return checkWin(next);
    }
    case 'DEAL_STOCK': {
      const cfg = state.config;
      if (!cfg.stockEnabled || state.stock.length === 0) return state;
      if (state.stockDealsUsed >= cfg.stockDealCount) return state;
      // Block draws if any column is empty (unless allowDrawWithEmptyColumn)
      const hasEmpty = state.tableau.some((c) => c.length === 0);
      if (hasEmpty && !cfg.allowDrawWithEmptyColumn) return state;
      // Deal 1 card per column (or as many as stock allows)
      const newTableau = state.tableau.map((col) => col.slice());
      let consumed = 0;
      for (let i = 0; i < cfg.tableauColumns && consumed < state.stock.length; i++) {
        const c = state.stock[state.stock.length - 1 - consumed];
        newTableau[i].push({ ...c, faceUp: true });
        consumed++;
      }
      return {
        ...state,
        tableau: newTableau,
        stock: state.stock.slice(0, state.stock.length - consumed),
        stockDealsUsed: state.stockDealsUsed + 1,
        moveCount: state.moveCount + 1,
      };
    }
    default:
      return state;
  }
}

/** Scan every column's tail for a complete K→A same-suit run; auto-remove. */
function autoRemoveRuns(state: SpiderGameState): SpiderGameState {
  const newTableau = state.tableau.map((col) => col.slice());
  const newCompleted = state.completedRuns.slice();
  let removed = false;

  for (let col = 0; col < newTableau.length; col++) {
    const pile = newTableau[col];
    if (pile.length < 13) continue;
    // Walk from the tail: must be A, 2, ..., K in descending order (K at top of run)
    // i.e. pile[end] = A, pile[end-1] = 2, ..., pile[end-12] = K
    let valid = true;
    const top = pile[pile.length - 1];
    if (top.rank !== 1) continue; // tail must be the Ace
    const suit = top.suit;
    for (let i = 0; i < 13; i++) {
      const card = pile[pile.length - 1 - i];
      if (!card || !card.faceUp) { valid = false; break; }
      if (card.rank !== i + 1) { valid = false; break; }
      if (card.suit !== suit) { valid = false; break; }
    }
    if (valid) {
      // Remove the 13 cards from the column tail
      const run = pile.slice(pile.length - 13).reverse(); // K → A order for display
      newTableau[col] = pile.slice(0, pile.length - 13);
      // Flip the new tail if needed
      const remaining = newTableau[col];
      if (remaining.length > 0 && !remaining[remaining.length - 1].faceUp) {
        remaining[remaining.length - 1] = { ...remaining[remaining.length - 1], faceUp: true };
      }
      newCompleted.push(run);
      removed = true;
    }
  }
  return removed ? { ...state, tableau: newTableau, completedRuns: newCompleted } : state;
}

function checkWin(state: SpiderGameState): SpiderGameState {
  const expected = state.config.decks === 2 ? 8 : 4;
  if (state.completedRuns.length >= expected) return { ...state, won: true };
  return state;
}
