/**
 * @file tripeaksEngine.ts — TriPeaks Solitaire (52 cards).
 *
 * Layout:
 *  - 3 peaks each made of 4 rows. Top row = 1 card per peak (3 cards),
 *    next rows widen and overlap. Total tableau = 28 cards.
 *  - Stock: 23 cards face-down + 1 starting waste card.
 *
 * Play:
 *  - From the BOTTOM ROW (face-up cards with no card covering them), tap a
 *    card whose value is ±1 from the waste top. Suit doesn't matter.
 *    Circular: A ↔ K (Ace can play on King and vice versa).
 *  - Cards become face-up when both blockers are removed.
 *  - Tap stock to flip a card to waste (no recycling).
 *
 * Win = clear all 28 tableau cards.
 *
 * Score: combo system — chain N consecutive tableau cards without drawing
 * gives 1, 2, 4, 8, 16, ... points (doubles each card; resets on draw).
 */

import { rngFromSeed } from './engines/_shuffleSeeded';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card { suit: Suit; value: CardValue; id: string; }

/**
 * The board is a flat list of 28 slots, indexed left-to-right, top-down.
 * Each slot has its blocker indices into the same array.
 *
 * Layout (TriPeaks "standard"):
 *   row 0: . . X . . . X . . . X . .            (3 cards, indices 0..2)
 *   row 1: . X X X . X X X . X X X .            (6 cards, indices 3..8)
 *   row 2: X X X X X X X X X X X X X X          (9 cards, indices 9..17)
 *   row 3: bottom row of 10 cards               (10 cards, indices 18..27)
 *
 * Easier model: each peak (left/mid/right) is its own pyramid of rows
 *   peak: row0=1, row1=2, row2=3, row3=4 → 10 cards per peak ×3 = 30, but
 *   bottom rows are SHARED, so total = 28.
 *
 * To keep things simple and correct, we use:
 *   row 0: 3 cards    (left peak top, mid peak top, right peak top)
 *   row 1: 6 cards    (2 per peak)
 *   row 2: 9 cards    (3 per peak)
 *   row 3: 10 cards   (shared bottom row)
 */

export interface Slot {
  card: Card | null;
  faceUp: boolean;
  blockers: number[];   // indices that must be null before this card is faceUp
}

export interface GameState {
  slots: Slot[];                  // 28 slots
  stock: Card[];
  waste: Card[];
  /** Multiplier for scoring chain. */
  combo: number;
  moves: number;
  score: number;
  phase: 'playing' | 'won' | 'lost';
}

export type GameAction =
  | { type: 'PLAY_SLOT'; index: number }
  | { type: 'DRAW' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const SUIT_GLYPH: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

export function imageCode(card: Card): string {
  const v =
    card.value === 1  ? 'A' :
    card.value === 10 ? '0' :
    card.value === 11 ? 'J' :
    card.value === 12 ? 'Q' :
    card.value === 13 ? 'K' :
    String(card.value);
  return `${v}${card.suit[0].toUpperCase()}`;
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const value of VALUES) {
    deck.push({ suit, value, id: `${value.toString().padStart(2, '0')}-${suit}` });
  }
  return deck;
}

function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Layout indices:
 *  row0 (3) → 0..2
 *  row1 (6) → 3..8     each row1 idx blocks 2 row0 idx
 *  row2 (9) → 9..17
 *  row3 (10) → 18..27
 *
 * Blockers (cards that must be removed for this slot to flip face-up):
 *  row 0 idx 0  → blocked by 3, 4
 *  row 0 idx 1  → blocked by 5, 6
 *  row 0 idx 2  → blocked by 7, 8
 *  row 1 idx 3  → blocked by 9, 10
 *  row 1 idx 4  → blocked by 10, 11
 *  row 1 idx 5  → blocked by 12, 13
 *  row 1 idx 6  → blocked by 13, 14
 *  row 1 idx 7  → blocked by 15, 16
 *  row 1 idx 8  → blocked by 16, 17
 *  row 2 idx 9  → blocked by 18, 19
 *  row 2 idx 10 → blocked by 19, 20
 *  row 2 idx 11 → blocked by 20, 21
 *  row 2 idx 12 → blocked by 21, 22
 *  row 2 idx 13 → blocked by 22, 23
 *  row 2 idx 14 → blocked by 23, 24
 *  row 2 idx 15 → blocked by 24, 25
 *  row 2 idx 16 → blocked by 25, 26
 *  row 2 idx 17 → blocked by 26, 27
 *  row 3 (18..27) → no blockers
 */
const BLOCKERS: number[][] = [
  [3, 4], [5, 6], [7, 8],                                          // row 0
  [9, 10], [10, 11], [12, 13], [13, 14], [15, 16], [16, 17],       // row 1
  [18, 19], [19, 20], [20, 21], [21, 22], [22, 23],
  [23, 24], [24, 25], [25, 26], [26, 27],                          // row 2
  [], [], [], [], [], [], [], [], [], [],                          // row 3
];

function dealOnce(): GameState {
  const deck = shuffle(buildDeck());
  const slots: Slot[] = [];
  for (let i = 0; i < 28; i++) {
    slots.push({ card: deck[i], faceUp: i >= 18, blockers: BLOCKERS[i] });
  }
  const stock = deck.slice(29);
  const waste = [deck[28]];
  return { slots, stock, waste, combo: 0, moves: 0, score: 0, phase: 'playing' };
}

/** Score : combien de slots le greedy peut vider. */
function tripeaksProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 100; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    if (s.phase !== 'playing') break;
  }
  return s.slots.filter((sl) => sl.card === null).length;
}

/**
 * REVERSE-DEAL TriPeaks — donne avec haute probabilité de soluble.
 *
 * Approche : génère une marche aléatoire de 28 valeurs où chaque pas = ±1
 * (avec wrap A↔K). Les 28 cartes sont placées sur les slots dans l'ORDRE INVERSE
 * de leur retrait (la 1ère carte de la marche = bottom row, la dernière = top).
 */
function reverseDealTriPeaks(): GameState {
  // 1. Génère le deck
  const allCards: Card[] = [];
  for (const suit of SUITS) for (const value of VALUES) {
    allCards.push({ suit, value, id: `${value.toString().padStart(2, '0')}-${suit}` });
  }
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  // 2. Marche de valeurs (28 + 1 pour waste initial)
  const wrap = (v: number): CardValue => {
    if (v < 1) return 13;
    if (v > 13) return 1;
    return v as CardValue;
  };
  const walk: CardValue[] = [];
  let cur = (Math.floor(Math.random() * 13) + 1) as CardValue;
  walk.push(cur);
  for (let step = 0; step < 28; step++) {
    const delta = Math.random() < 0.5 ? -1 : 1;
    cur = wrap(cur + delta);
    walk.push(cur);
  }

  // 3. Pick cards matching walk values
  const remaining = [...allCards];
  const playOrder: Card[] = [];
  for (let i = 1; i < walk.length; i++) {
    const target = walk[i];
    const idx = remaining.findIndex((c) => c.value === target);
    if (idx >= 0) playOrder.push(remaining.splice(idx, 1)[0]);
    else playOrder.push(remaining.pop()!);
  }
  const wasteFirstIdx = remaining.findIndex((c) => c.value === walk[0]);
  const wasteFirst = wasteFirstIdx >= 0 ? remaining.splice(wasteFirstIdx, 1)[0] : remaining.pop()!;

  // 4. Place les 28 cartes dans les slots : index 0..27
  // Bottom row = indices 18..27 (faceUp), top peaks = 0..2
  // playOrder[0] = 1er à jouer = doit être en bottom row
  // playOrder[27] = dernier à jouer = peut être en top
  // Remplir dans l'ordre INVERSE : slot 27 = playOrder[0], slot 0 = playOrder[27]
  const slots: Slot[] = [];
  for (let i = 0; i < 28; i++) {
    const card = playOrder[27 - i];
    slots.push({ card, faceUp: i >= 18, blockers: BLOCKERS[i] });
  }

  return {
    slots,
    stock: remaining,
    waste: [wasteFirst],
    combo: 0,
    moves: 0,
    score: 0,
    phase: 'playing',
  };
}

let _tripeaksSolution: GameAction[] = [];

export function getTriPeaksSolution(): GameAction[] {
  return [..._tripeaksSolution];
}

export function setTriPeaksSolutionFromState(state: GameState): void {
  _tripeaksSolution = computeTriPeaksSolution(state);
}

export function setTriPeaksSolutionFromBD(actions: GameAction[]): void {
  _tripeaksSolution = [...actions];
}

function computeTriPeaksSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) {
    if (Date.now() - t0 > 500) break;
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
    if (s.phase !== 'playing') break;
  }
  return moves;
}

/**
 * Hash d'un GameState TriPeaks pour anti-cycle.
 * IMPORTANT : inclut `combo` car il peut affecter le scoring/comportement et
 * deux états avec le même tableau mais combo différent ne sont pas équivalents
 * du point de vue progression (faux positifs sinon).
 */
function hashStateCycle(s: any): string {
  let h = 2166136261;
  if (s?.slots) {
    for (const slot of s.slots) {
      h ^= slot.card ? (slot.card.value * 31 + slot.card.suit.charCodeAt(0) + (slot.faceUp ? 100 : 0)) : 999;
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.stock) { h ^= s.stock.length; h = Math.imul(h, 16777619); }
  if (s?.waste) {
    const top = s.waste[s.waste.length - 1];
    if (top) h ^= (top.value * 31 + top.suit.charCodeAt(0));
    h = Math.imul(h, 16777619);
  }
  if (typeof s?.combo === 'number') {
    h ^= 6000 + (s.combo | 0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cascade simulator pour TriPeaks (greedy + auto-DRAW si bloqué).
 * Si elle vide les 28 slots → la donne est garantie solvable au bouton 💡.
 */
function simulateTriPeaksCascade(state: GameState, maxMoves = 200, totalTimeoutMs = 800): GameAction[] | null {
  const t0 = Date.now();
  const path: GameAction[] = [];
  const visited = new Set<string>();
  let s = state;
  visited.add(hashStateCycle(s));

  for (let i = 0; i < maxMoves; i++) {
    if (Date.now() - t0 > totalTimeoutMs) return null;
    if (s.slots.every((sl) => sl.card === null)) return path;
    if (s.phase !== 'playing') return null;
    const action = findHint(s);
    if (!action) return null;
    const next = gameReducer(s, action);
    if (next === s) return null;
    const h = hashStateCycle(next);
    if (visited.has(h)) return null;
    visited.add(h);
    path.push(action);
    s = next;
  }
  return s.slots.every((sl) => sl.card === null) ? path : null;
}

export function createInitialState(seed?: number | string | null): GameState {
  const _rng = rngFromSeed(seed);
  const _origRandom = Math.random;
  Math.random = _rng;
  try {
    console.log("[TriPeaks Solver] 🎲 TriPeaks — random + cascade oracle, fallback reverse-walk");
    const __t0 = Date.now();

    // 1) Random deal + cascade oracle
    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = dealOnce();
      const sol = simulateTriPeaksCascade(candidate);
      if (sol && sol.length > 0) {
        _tripeaksSolution = sol;
        console.log(`[TriPeaks Solver] ✅ DONNE RANDOM SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution = ${sol.length} coups`);
        return candidate;
      }
    }

    // 2) Fallback : reverse-walk + greedy
    const cand = reverseDealTriPeaks();
    _tripeaksSolution = computeTriPeaksSolution(cand);
    console.log(`[TriPeaks Solver] ✅ DONNE FALLBACK V2 (${Date.now() - __t0}ms) — solution greedy = ${_tripeaksSolution.length} coups`);
    return cand;
  } finally {
    Math.random = _origRandom;
  }
}

function recomputeFaceUp(slots: Slot[]): Slot[] {
  return slots.map((s, i) => {
    if (s.card === null) return s;
    const allBlockersGone = s.blockers.every((b) => slots[b].card === null);
    return { ...s, faceUp: allBlockersGone };
  });
}

export function isPlayable(card: Card, wasteTop: Card | undefined): boolean {
  if (!wasteTop) return false;
  const diff = Math.abs(card.value - wasteTop.value);
  // ±1 OR circular A↔K (1 ↔ 13)
  return diff === 1 || diff === 12;
}

export function isWon(state: GameState): boolean {
  return state.slots.every((s) => s.card === null);
}

export function isLost(state: GameState): boolean {
  if (state.stock.length > 0) return false;
  const wt = state.waste[state.waste.length - 1];
  return !state.slots.some((s) => s.card && s.faceUp && isPlayable(s.card, wt));
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;

    case 'PLAY_SLOT': {
      const slot = state.slots[action.index];
      if (!slot.card || !slot.faceUp) return state;
      const wt = state.waste[state.waste.length - 1];
      if (!isPlayable(slot.card, wt)) return state;
      const newSlots = state.slots.map((s, i) =>
        i === action.index ? { ...s, card: null, faceUp: false } : s,
      );
      const refreshed = recomputeFaceUp(newSlots);
      const waste = [...state.waste, slot.card];
      const newCombo = state.combo + 1;
      const points = Math.pow(2, newCombo - 1);     // 1, 2, 4, 8...
      const next: GameState = {
        ...state,
        slots: refreshed,
        waste,
        combo: newCombo,
        moves: state.moves + 1,
        score: state.score + points,
      };
      if (isWon(next)) return { ...next, phase: 'won', score: next.score + 100 };
      if (isLost(next)) return { ...next, phase: 'lost' };
      return next;
    }

    case 'DRAW': {
      if (state.stock.length === 0) return state;
      const drawn = state.stock[state.stock.length - 1];
      const next: GameState = {
        ...state,
        stock: state.stock.slice(0, -1),
        waste: [...state.waste, drawn],
        combo: 0,
        moves: state.moves + 1,
      };
      if (isLost(next)) return { ...next, phase: 'lost' };
      return next;
    }

    default:
      return state;
  }
}

// ============================================================
// SOLVABILITY ANALYZER — preuve de victoire par greedy
// ============================================================
export type WinnabilityResult =
  | { kind: 'winning'; action: GameAction }
  | { kind: 'proven-lost' }
  | { kind: 'timeout' }
  | { kind: 'already-won' };

/**
 * Analyse TriPeaks : 28 cartes du tableau vidées = win.
 */
export function analyzeTriPeaksWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Indice : trouve une carte face-up jouable, sinon DRAW. */
export function findHint(state: GameState): GameAction | null {
  const wt = state.waste[state.waste.length - 1];
  for (let i = 0; i < state.slots.length; i++) {
    const s = state.slots[i];
    if (s.card && s.faceUp && isPlayable(s.card, wt)) {
      return { type: 'PLAY_SLOT', index: i };
    }
  }
  if (state.stock.length > 0) return { type: 'DRAW' };
  return null;
}


/** Indice RÉEL : ne propose pas la pioche. */
export function findRealHint(state: GameState): GameAction | null {
  const wt = state.waste[state.waste.length - 1];
  for (let i = 0; i < state.slots.length; i++) {
    const s = state.slots[i];
    if (s.card && s.faceUp && isPlayable(s.card, wt)) return { type: 'PLAY_SLOT', index: i };
  }
  return null;
}

/** Détection de blocage : phase 'lost' OU stock vide + aucun coup réel. */
export function isStuck(state: GameState): boolean {
  if ((state.phase as string) === 'lost') return true;
  if (state.phase !== 'playing') return false;
  if (state.stock.length > 0) return false;
  return findRealHint(state) === null;
}


/** Détection JEU IMPOSSIBLE : stock vide + aucun coup réel possible. */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.stock && state.stock.length > 0) return false;
  return findRealHint ? findRealHint(state) === null : findHint(state) === null;
}
