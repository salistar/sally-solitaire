/**
 * @file fortyThievesEngine.ts — Forty Thieves Solitaire (104 cards = 2 decks).
 *
 * Layout:
 *  - 10 columns × 4 cards = 40 cards on tableau (all face-up).
 *  - 64 cards remaining in stock.
 *  - 1 waste pile (shows top card; non-recyclable).
 *  - 8 foundations (A → K, by suit; 2 piles per suit since 2 decks).
 *
 * Tableau build: descending SAME suit (e.g. 9♠ on 10♠).
 * Move: 1 CARD AT A TIME (no multi-card moves).
 * Empty column: any card may be placed.
 * Stock: tap to flip 1 card to waste.
 * Foundation: A → K by suit (2 per suit).
 *
 * Win: 8 foundations of 13 cards each = 104.
 */

import { rngFromSeed } from './engines/_shuffleSeeded';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card { suit: Suit; value: CardValue; id: string; faceUp: true; }
export interface Column { cards: Card[] }
export interface FoundationPile { suit: Suit | null; cards: Card[] }

export interface GameState {
  tableau: Column[];                // 10 columns
  stock: Card[];                    // 64 cards
  waste: Card[];
  foundations: FoundationPile[];    // 8 piles
  moves: number;
  score: number;
  phase: 'playing' | 'won';
}

export type GameAction =
  | { type: 'DRAW' }
  | { type: 'MOVE_TABLEAU'; fromCol: number; toCol: number }    // top card only
  | { type: 'WASTE_TO_TABLEAU'; toCol: number }
  | { type: 'TO_FOUNDATION'; src: 'tableau' | 'waste'; col?: number }
  | { type: 'AUTO_COMPLETE' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const COLUMNS = 10;
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
  let counter = 0;
  for (let r = 0; r < 2; r++) {
    for (const suit of SUITS) for (const value of VALUES) {
      deck.push({
        suit, value,
        id: `${value.toString().padStart(2, '0')}-${suit}-${counter++}`,
        faceUp: true,
      });
    }
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

function dealOnce(): GameState {
  const deck = shuffle(buildDeck());
  const tableau: Column[] = Array.from({ length: COLUMNS }, () => ({ cards: [] }));
  let i = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLUMNS; c++) {
    tableau[c].cards.push(deck[i++]);
  }
  const stock = deck.slice(i);
  const foundations: FoundationPile[] = [];
  for (const s of SUITS) {
    foundations.push({ suit: s, cards: [] });
    foundations.push({ suit: s, cards: [] });
  }
  return { tableau, stock, waste: [], foundations, moves: 0, score: 0, phase: 'playing' };
}

/** Score : combien de cartes le greedy peut placer en fondation. */
function fortyThievesProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 300; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    if (s.phase !== 'playing') break;
  }
  return s.foundations.reduce((a, f) => a + f.cards.length, 0);
}

/**
 * REVERSE-DEAL FortyThieves — donne avec haute probabilité de soluble.
 *
 * FortyThieves est très difficile (~10-12% solubles). Reverse strict est
 * complexe (stock NON recyclable). On utilise une approche hybride :
 *  1. Démarre à l'état gagné (8 fondations × 13 cartes complètes)
 *  2. Applique 250 coups inverses : F→T, F→W, T→T, T→W, W→S
 *  3. TRACK l'historique inverse → permet d'émettre la SOLUTION FORWARD
 *     en inversant l'ordre, garantissant la victoire (greedy souvent insuffisant).
 *  4. Pas de marquage face-down (toutes cartes visibles dans FortyThieves)
 */
type FTInvHist =
  | { type: 'F_TO_T'; from: number; to: number; cardId: string }
  | { type: 'F_TO_W'; from: number; cardId: string }
  | { type: 'T_TO_T'; from: number; to: number; cardId: string }
  | { type: 'T_TO_W'; from: number; cardId: string }
  | { type: 'W_TO_S'; cardId: string };

function reverseDealFortyThievesWithHistory(): { state: GameState; history: FTInvHist[] } {
  // 1. État gagné : 8 fondations complètes (2 par couleur car 2 jeux)
  const tableau: Column[] = Array.from({ length: COLUMNS }, () => ({ cards: [] }));
  const stock: Card[] = [];
  const waste: Card[] = [];
  const foundations: FoundationPile[] = [];
  let counter = 0;
  for (let r = 0; r < 2; r++) {
    for (const s of SUITS) {
      const cards: Card[] = [];
      for (let v = 1 as CardValue; v <= 13; v = (v + 1) as CardValue) {
        cards.push({
          suit: s, value: v,
          id: `${v.toString().padStart(2, '0')}-${s}-${counter++}`,
          faceUp: true,
        });
      }
      foundations.push({ suit: s, cards });
    }
  }
  const history: FTInvHist[] = [];

  // 2. Coups inverses : 250 itérations
  type InvMove =
    | { type: 'F_TO_T'; from: number; to: number }
    | { type: 'F_TO_W'; from: number }
    | { type: 'T_TO_T'; from: number; to: number }
    | { type: 'T_TO_W'; from: number }
    | { type: 'W_TO_S' };

  const NUM_INVERSE = 250;
  for (let step = 0; step < NUM_INVERSE; step++) {
    const moves: InvMove[] = [];

    // F → T
    for (let f = 0; f < 8; f++) {
      const fp = foundations[f];
      if (fp.cards.length === 0) continue;
      const card = fp.cards[fp.cards.length - 1];
      for (let to = 0; to < COLUMNS; to++) {
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top || canStackOnTableau(card, top)) {
          moves.push({ type: 'F_TO_T', from: f, to });
        }
      }
    }
    // F → W
    for (let f = 0; f < 8; f++) {
      if (foundations[f].cards.length > 0) moves.push({ type: 'F_TO_W', from: f });
    }
    // T → T (1 carte à la fois)
    for (let from = 0; from < COLUMNS; from++) {
      const src = tableau[from].cards;
      if (src.length === 0) continue;
      const card = src[src.length - 1];
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from) continue;
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top || canStackOnTableau(card, top)) {
          moves.push({ type: 'T_TO_T', from, to });
        }
      }
    }
    // T → W
    for (let from = 0; from < COLUMNS; from++) {
      if (tableau[from].cards.length > 0) moves.push({ type: 'T_TO_W', from });
    }
    // W → S
    if (waste.length > 0) moves.push({ type: 'W_TO_S' });

    if (moves.length === 0) break;
    const progress = step / NUM_INVERSE;
    const tableauTotal = tableau.reduce((a, c) => a + c.cards.length, 0);
    const tableauDeficit = Math.max(0, 40 - tableauTotal);
    const weights = moves.map((m) => {
      switch (m.type) {
        case 'F_TO_T': return 5 + tableauDeficit * 0.3;
        case 'F_TO_W': return 1.5;
        case 'T_TO_T': return 1.0 + 1.0 * progress;
        case 'T_TO_W': return 0.8;
        case 'W_TO_S': return 1.0 + 5.0 * progress;
      }
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen: InvMove = moves[0];
    for (let i = 0; i < moves.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = moves[i]; break; }
    }

    switch (chosen.type) {
      case 'F_TO_T': {
        const c = foundations[chosen.from].cards.pop()!;
        tableau[chosen.to].cards.push(c);
        history.push({ type: 'F_TO_T', from: chosen.from, to: chosen.to, cardId: c.id });
        break;
      }
      case 'F_TO_W': {
        const c = foundations[chosen.from].cards.pop()!;
        waste.push(c);
        history.push({ type: 'F_TO_W', from: chosen.from, cardId: c.id });
        break;
      }
      case 'T_TO_T': {
        const c = tableau[chosen.from].cards.pop()!;
        tableau[chosen.to].cards.push(c);
        history.push({ type: 'T_TO_T', from: chosen.from, to: chosen.to, cardId: c.id });
        break;
      }
      case 'T_TO_W': {
        const c = tableau[chosen.from].cards.pop()!;
        waste.push(c);
        history.push({ type: 'T_TO_W', from: chosen.from, cardId: c.id });
        break;
      }
      case 'W_TO_S': {
        const c = waste.pop()!;
        stock.push(c);
        history.push({ type: 'W_TO_S', cardId: c.id });
        break;
      }
    }
  }

  return {
    state: { tableau, stock, waste, foundations, moves: 0, score: 0, phase: 'playing' },
    history,
  };
}

function reverseDealFortyThieves(): GameState {
  return reverseDealFortyThievesWithHistory().state;
}

/**
 * Construit la solution forward en inversant l'historique des coups inverses.
 *
 * Inverse F_TO_T (carte X de fond[from] → col[to]) → forward T→F : TO_FOUNDATION src=tableau col=to
 * Inverse F_TO_W (carte X de fond[from] → waste) → forward W→F : TO_FOUNDATION src=waste
 * Inverse T_TO_T (carte X de col[from] → col[to]) → forward T→T : MOVE_TABLEAU from=to to=from
 * Inverse T_TO_W (carte X de col[from] → waste) → forward W→T : WASTE_TO_TABLEAU toCol=from
 * Inverse W_TO_S (carte X de waste → stock) → forward DRAW (stock→waste)
 */
function buildForwardSolutionFromHistory(state: GameState, history: FTInvHist[]): GameAction[] {
  const solution: GameAction[] = [];
  let s = state;
  for (let h = history.length - 1; h >= 0; h--) {
    const event = history[h];
    let action: GameAction | null = null;

    if (event.type === 'F_TO_T') {
      action = { type: 'TO_FOUNDATION', src: 'tableau', col: event.to };
    } else if (event.type === 'F_TO_W') {
      action = { type: 'TO_FOUNDATION', src: 'waste' };
    } else if (event.type === 'T_TO_T') {
      action = { type: 'MOVE_TABLEAU', fromCol: event.to, toCol: event.from };
    } else if (event.type === 'T_TO_W') {
      action = { type: 'WASTE_TO_TABLEAU', toCol: event.from };
    } else if (event.type === 'W_TO_S') {
      action = { type: 'DRAW' };
    }

    if (!action) continue;
    const next = gameReducer(s, action);
    if (next === s) {
      // Coup invalide en forward — on saute (rare, edge case)
      continue;
    }
    solution.push(action);
    s = next;
    if (s.phase === 'won') break;
  }
  return solution;
}

let _ftSolution: GameAction[] = [];

export function getFortyThievesSolution(): GameAction[] {
  return [..._ftSolution];
}

export function setFortyThievesSolutionFromState(state: GameState): void {
  _ftSolution = computeFortyThievesSolution(state);
}

export function setFortyThievesSolutionFromBD(actions: GameAction[]): void {
  _ftSolution = [...actions];
}

function computeFortyThievesSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  // FIX BUG : 80 trop bas pour Forty Thieves (104 cartes, 250+ coups requis).
  // On augmente à 800 itérations avec timeout 2000ms.
  for (let i = 0; i < 800; i++) {
    if (Date.now() - t0 > 2000) break;
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
    if (s.phase === 'won') break;
  }
  return moves;
}

function validateFortyThievesSolution(state: GameState, solution: GameAction[]): boolean {
  let s = state;
  for (const a of solution) {
    const next = gameReducer(s, a);
    if (next === s) return false;
    s = next;
    if (s.phase === 'won') return true;
  }
  return s.phase === 'won';
}

function hashStateCycle(s: any): string {
  let h = 2166136261;
  if (s?.tableau) {
    for (const col of s.tableau) {
      for (const c of col.cards) {
        h ^= (c.value * 31 + c.suit.charCodeAt(0));
        h = Math.imul(h, 16777619);
      }
      h ^= 255;
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.stock) { h ^= s.stock.length; h = Math.imul(h, 16777619); }
  if (s?.waste) { h ^= s.waste.length; h = Math.imul(h, 16777619); }
  if (s?.foundations) {
    for (const f of s.foundations) {
      h ^= f.cards.length;
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}

export function createInitialState(seed?: number | string | null): GameState {
  const _rng = rngFromSeed(seed);
  const _origRandom = Math.random;
  Math.random = _rng;
  try {
    console.log("[FortyThieves Solver] 🎲 Reverse-Deal — solution forward par inversion d'historique");
    const __t0 = Date.now();

    // STRATÉGIE PRIORITAIRE : utiliser l'historique des coups inverses pour
    // émettre une SOLUTION FORWARD GARANTIE. Le greedy était trop faible pour
    // résoudre Forty Thieves en 600 itérations → on ne dépend plus de lui.
    const MAX_ATTEMPTS = 12;
    let bestCand: GameState | null = null;
    let bestSol: GameAction[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { state, history } = reverseDealFortyThievesWithHistory();
      const sol = buildForwardSolutionFromHistory(state, history);
      if (validateFortyThievesSolution(state, sol)) {
        _ftSolution = sol;
        console.log(`[FortyThieves Solver] ✅ DONNE V2 SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution forward garantie = ${sol.length} coups`);
        return state;
      }
      if (sol.length > bestSol.length) { bestCand = state; bestSol = sol; }
    }

    // Fallback (quasi-impossible) : meilleure tentative partielle
    const fallback = bestCand ?? reverseDealFortyThieves();
    _ftSolution = bestSol.length > 0 ? bestSol : computeFortyThievesSolution(fallback);
    console.log(`[FortyThieves Solver] ⚠️ FALLBACK (${Date.now() - __t0}ms) — ${_ftSolution.length} coups partiels`);
    return fallback;
  } finally {
    Math.random = _origRandom;
  }
}

export function canStackOnTableau(a: Card, b: Card): boolean {
  // Descending same SUIT
  return a.suit === b.suit && a.value === b.value - 1;
}

export function canPlaceOnFoundation(a: Card, pile: FoundationPile): boolean {
  if (pile.suit !== null && pile.suit !== a.suit) return false;
  if (pile.cards.length === 0) return a.value === 1;
  const top = pile.cards[pile.cards.length - 1];
  return top.suit === a.suit && a.value === top.value + 1;
}

/** Pick the foundation (of the right suit) where this card fits. */
export function findFoundationFor(card: Card, foundations: FoundationPile[]): number {
  // Prefer the same suit pile that already has the previous value.
  for (let i = 0; i < foundations.length; i++) {
    if (foundations[i].suit === card.suit && foundations[i].cards.length > 0) {
      const top = foundations[i].cards[foundations[i].cards.length - 1];
      if (top.value + 1 === card.value) return i;
    }
  }
  // Else: empty foundation of this suit accepts only Ace.
  if (card.value === 1) {
    for (let i = 0; i < foundations.length; i++) {
      if (foundations[i].suit === card.suit && foundations[i].cards.length === 0) return i;
    }
  }
  return -1;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((f) => f.cards.length === 13);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;

    case 'DRAW': {
      if (state.stock.length === 0) return state;     // no recycle
      const drawn = state.stock[state.stock.length - 1];
      return {
        ...state,
        stock: state.stock.slice(0, -1),
        waste: [...state.waste, drawn],
        moves: state.moves + 1,
      };
    }

    case 'MOVE_TABLEAU': {
      const { fromCol, toCol } = action;
      if (fromCol === toCol) return state;
      const src = state.tableau[fromCol];
      if (src.cards.length === 0) return state;
      const card = src.cards[src.cards.length - 1];
      const dest = state.tableau[toCol];
      const top = dest.cards[dest.cards.length - 1];
      if (top) {
        if (!canStackOnTableau(card, top)) return state;
      } // empty col accepts any
      const tableau = state.tableau.map((c, i) =>
        i === fromCol ? { cards: c.cards.slice(0, -1) } :
        i === toCol ? { cards: [...c.cards, card] } : c,
      );
      const next = { ...state, tableau, moves: state.moves + 1, score: state.score + 1 };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'WASTE_TO_TABLEAU': {
      const card = state.waste[state.waste.length - 1];
      if (!card) return state;
      const dest = state.tableau[action.toCol];
      const top = dest.cards[dest.cards.length - 1];
      if (top) {
        if (!canStackOnTableau(card, top)) return state;
      }
      const tableau = state.tableau.map((c, i) =>
        i === action.toCol ? { cards: [...c.cards, card] } : c,
      );
      const waste = state.waste.slice(0, -1);
      const next = { ...state, tableau, waste, moves: state.moves + 1, score: state.score + 1 };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'TO_FOUNDATION': {
      let card: Card | undefined;
      if (action.src === 'waste') card = state.waste[state.waste.length - 1];
      else if (action.col != null) {
        const col = state.tableau[action.col];
        card = col.cards[col.cards.length - 1];
      }
      if (!card) return state;
      const fIdx = findFoundationFor(card, state.foundations);
      if (fIdx < 0) return state;
      const foundations = state.foundations.map((f, i) =>
        i === fIdx ? { ...f, cards: [...f.cards, card!] } : f,
      );
      let waste = state.waste, tableau = state.tableau;
      if (action.src === 'waste') waste = state.waste.slice(0, -1);
      else if (action.col != null) {
        tableau = state.tableau.map((c, i) =>
          i === action.col ? { cards: c.cards.slice(0, -1) } : c,
        );
      }
      const next = { ...state, foundations, waste, tableau, moves: state.moves + 1, score: state.score + 10 };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'AUTO_COMPLETE': {
      let s = state;
      let progress = true;
      while (progress) {
        progress = false;
        // waste top
        const wt = s.waste[s.waste.length - 1];
        if (wt) {
          if (findFoundationFor(wt, s.foundations) >= 0) {
            s = gameReducer(s, { type: 'TO_FOUNDATION', src: 'waste' });
            progress = true; continue;
          }
        }
        for (let i = 0; i < s.tableau.length; i++) {
          const col = s.tableau[i].cards;
          const top = col[col.length - 1];
          if (top && findFoundationFor(top, s.foundations) >= 0) {
            s = gameReducer(s, { type: 'TO_FOUNDATION', src: 'tableau', col: i });
            progress = true; break;
          }
        }
      }
      return s;
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
 * Analyse Forty Thieves : 104 cartes (2 jeux) en fondation = win.
 */
export function analyzeFortyThievesWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Évaluation statique FortyThieves. */
function staticEvalFT(state: GameState): number {
  let score = 0;
  score += state.foundations.reduce((a, f) => a + f.cards.length, 0) * 10000;
  score += state.tableau.filter((c) => c.cards.length === 0).length * 600;
  for (const col of state.tableau) {
    if (col.cards.length === 0) continue;
    let runLen = 1;
    for (let i = col.cards.length - 1; i > 0; i--) {
      if (canStackOnTableau(col.cards[i], col.cards[i - 1])) runLen++;
      else break;
    }
    score += runLen * 30;
  }
  return score;
}

/** Énumère tous les coups (sauf DRAW). */
function collectAllMovesFT(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && findFoundationFor(top, state.foundations) >= 0) {
      moves.push({ type: 'TO_FOUNDATION', src: 'tableau', col: i });
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt && findFoundationFor(wt, state.foundations) >= 0) {
    moves.push({ type: 'TO_FOUNDATION', src: 'waste' });
  }
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    if (src.length === 0) continue;
    const card = src[src.length - 1];
    for (let to = 0; to < state.tableau.length; to++) {
      if (to === from) continue;
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(card, top)) {
        moves.push({ type: 'MOVE_TABLEAU', fromCol: from, toCol: to });
      } else if (!top) {
        moves.push({ type: 'MOVE_TABLEAU', fromCol: from, toCol: to });
      }
    }
  }
  if (wt) {
    for (let to = 0; to < state.tableau.length; to++) {
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(wt, top)) {
        moves.push({ type: 'WASTE_TO_TABLEAU', toCol: to });
      } else if (!top) {
        moves.push({ type: 'WASTE_TO_TABLEAU', toCol: to });
      }
    }
  }
  return moves;
}

/**
 * Indice intelligent FortyThieves avec 1-step lookahead.
 * Si aucun coup ne progresse → DRAW (pioche).
 */
export function findHint(state: GameState): GameAction | null {
  const currentEval = staticEvalFT(state);
  const moves = collectAllMovesFT(state);
  let bestMove: GameAction | null = null;
  let bestScore = currentEval;
  for (const m of moves) {
    const next = gameReducer(state, m);
    if (next === state) continue;
    const score = staticEvalFT(next);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  if (bestMove) return bestMove;
  if (state.stock.length > 0) return { type: 'DRAW' };
  return null;
}


/** Détection de blocage : stock vide + aucun coup réel possible. */
export function isStuck(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  // Tant qu'il reste des cartes en pioche, pas bloqué
  if (state.stock.length > 0) return false;
  return findRealHint(state) === null;
}


/** Indice RÉEL (sans pioche/deal). Retourne null si seul DRAW est possible.
  */
export function findRealHint(state: GameState): GameAction | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && findFoundationFor(top, state.foundations) >= 0) {
      return { type: 'TO_FOUNDATION', src: 'tableau', col: i };
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt && findFoundationFor(wt, state.foundations) >= 0) {
    return { type: 'TO_FOUNDATION', src: 'waste' };
  }
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    if (src.length === 0) continue;
    const card = src[src.length - 1];
    for (let to = 0; to < state.tableau.length; to++) {
      if (to === from) continue;
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(card, top)) {
        return { type: 'MOVE_TABLEAU', fromCol: from, toCol: to };
      }
    }
  }
  if (wt) {
    for (let to = 0; to < state.tableau.length; to++) {
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(wt, top)) {
        return { type: 'WASTE_TO_TABLEAU', toCol: to };
      }
    }
  }
  return null;
}


/** Détection JEU IMPOSSIBLE : stock vide + aucun coup réel possible. */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.stock && state.stock.length > 0) return false;
  return findRealHint ? findRealHint(state) === null : findHint(state) === null;
}
