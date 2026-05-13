/**
 * @file yukonEngine.ts — Yukon Solitaire (52 cards, 1 deck).
 *
 * Like Klondike but:
 *  - NO stock / NO waste : the 52 cards are dealt entirely on the 7 columns.
 *  - You may move ANY face-up card with all the cards below it (the moving
 *    group does NOT need to be a valid descending alternating-color run).
 *  - Foundations are the same: A → K per suit.
 *  - Empty column accepts only a King (with everything below).
 *
 * Layout (52 cards):
 *  col 1 = 1 card        (faceUp)
 *  col 2 = 6 cards (1↓ + 5↑)
 *  col 3 = 7 cards (1↓ + 6↑)
 *  col 4 = 8 cards (2↓ + 6↑)
 *  col 5 = 9 cards (3↓ + 6↑)
 *  col 6 = 10 cards (4↓ + 6↑)
 *  col 7 = 11 cards (5↓ + 6↑)
 */

import { rngFromSeed } from './engines/_shuffleSeeded';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardColor = 'red' | 'black';

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;
  faceUp: boolean;
}

export interface Column { cards: Card[] }
export interface FoundationPile { suit: Suit; cards: Card[] }

export interface GameState {
  tableau: Column[];          // 7 columns
  foundations: FoundationPile[];
  moves: number;
  score: number;
  phase: 'playing' | 'won';
}

export type GameAction =
  | { type: 'MOVE'; fromCol: number; fromCardIndex: number; toCol: number }
  | { type: 'TO_FOUNDATION'; cardId: string }
  | { type: 'AUTO_COMPLETE' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const COLUMNS = 7;
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const SUIT_COLOR: Record<Suit, CardColor> = {
  spades: 'black', clubs: 'black',
  hearts: 'red',   diamonds: 'red',
};

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

const COL_SIZES = [1, 6, 7, 8, 9, 10, 11];                         // total 52
const COL_FACEUP = [1, 5, 6, 6, 6, 6, 6];                          // last N up

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

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, id: `${value.toString().padStart(2, '0')}-${suit}`, faceUp: false });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dealOnce(): GameState {
  const deck = shuffleDeck(buildDeck());
  const tableau: Column[] = [];
  let i = 0;
  for (let c = 0; c < COLUMNS; c++) {
    const cards: Card[] = [];
    const total = COL_SIZES[c];
    const up = COL_FACEUP[c];
    for (let r = 0; r < total; r++) {
      const card: Card = { ...deck[i++], faceUp: r >= total - up };
      cards.push(card);
    }
    tableau.push({ cards });
  }
  return {
    tableau,
    foundations: SUITS.map((s) => ({ suit: s, cards: [] })),
    moves: 0,
    score: 0,
    phase: 'playing',
  };
}

/** Greedy auto-play : compte les cartes placées en fondation. */
function greedyAutoPlay(initial: GameState, maxMoves = 300): number {
  let s = initial;
  let stagnant = 0, best = 0;
  for (let i = 0; i < maxMoves; i++) {
    let action: GameAction | null = null;
    // Foundation moves first
    for (let ci = 0; ci < s.tableau.length; ci++) {
      const top = s.tableau[ci].cards[s.tableau[ci].cards.length - 1];
      if (top && top.faceUp) {
        const fIdx = s.foundations.findIndex((f) => canPlaceOnFoundation(top, f));
        if (fIdx >= 0) { action = { type: 'TO_FOUNDATION', cardId: top.id }; break; }
      }
    }
    // Tableau→tableau qui flippe une face-down
    if (!action) {
      for (let from = 0; from < s.tableau.length && !action; from++) {
        const col = s.tableau[from].cards;
        let firstUp = -1;
        for (let j = 0; j < col.length; j++) if (col[j].faceUp) { firstUp = j; break; }
        if (firstUp <= 0) continue;
        const head = col[firstUp];
        for (let to = 0; to < s.tableau.length && !action; to++) {
          if (to === from) continue;
          const top = s.tableau[to].cards[s.tableau[to].cards.length - 1];
          if (top && canStackOnTableau(head, top)) {
            action = { type: 'MOVE', fromCol: from, fromCardIndex: firstUp, toCol: to };
          }
        }
      }
    }
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    const fc = s.foundations.reduce((a, f) => a + f.cards.length, 0);
    if (fc > best) { best = fc; stagnant = 0; } else { stagnant++; if (stagnant > 60) break; }
  }
  return best;
}

/**
 * REVERSE-DEAL Yukon — donne GARANTIE soluble.
 * Yukon n'a PAS de stock : 52 cartes toutes sur le tableau.
 *
 *  1. État final : 4 fondations complètes, tableau vide
 *  2. Coups inverses : foundation → tableau (placer la top de fondation sur col)
 *                      tableau → tableau (déplacer un bloc, pas besoin d'ordre)
 *  3. Marquer face-down selon les règles Yukon (col i = i face-down + reste face-up)
 */
function reverseDealYukon(): GameState {
  // 1. État gagné
  const tableau: Column[] = Array.from({ length: 7 }, () => ({ cards: [] }));
  const foundations: FoundationPile[] = SUITS.map((s) => {
    const cards: Card[] = [];
    for (let v = 1 as CardValue; v <= 13; v = (v + 1) as CardValue) {
      cards.push({ suit: s, value: v, id: `${v.toString().padStart(2, '0')}-${s}`, faceUp: true });
    }
    return { suit: s, cards };
  });

  // 2. Appliquer 200 coups inverses pour disperser les cartes sur le tableau
  const NUM_INVERSE = 200;
  for (let step = 0; step < NUM_INVERSE; step++) {
    type InvMove =
      | { type: 'F_TO_T'; from: number; to: number }
      | { type: 'T_TO_T'; from: number; to: number; count: number };
    const moves: InvMove[] = [];

    // F → T : top fondation → col vide ou compatible
    for (let f = 0; f < 4; f++) {
      const fp = foundations[f];
      if (fp.cards.length === 0) continue;
      const card = fp.cards[fp.cards.length - 1];
      for (let to = 0; to < 7; to++) {
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top) {
          if (card.value === 13) moves.push({ type: 'F_TO_T', from: f, to });
        } else if (canStackOnTableau(card, top)) {
          moves.push({ type: 'F_TO_T', from: f, to });
        }
      }
    }
    // T → T : déplacer n'importe quel bloc visible (Yukon = bloc non ordonné)
    for (let from = 0; from < 7; from++) {
      const src = tableau[from].cards;
      for (let i = 0; i < src.length; i++) {
        const head = src[i];
        const count = src.length - i;
        for (let to = 0; to < 7; to++) {
          if (to === from) continue;
          const top = tableau[to].cards[tableau[to].cards.length - 1];
          if (!top) {
            if (head.value === 13 && i > 0) moves.push({ type: 'T_TO_T', from, to, count });
          } else if (canStackOnTableau(head, top)) {
            moves.push({ type: 'T_TO_T', from, to, count });
          }
        }
      }
    }

    if (moves.length === 0) break;
    // Préfère F_TO_T au début pour vider les fondations
    const progress = step / NUM_INVERSE;
    const weights = moves.map((m) => m.type === 'F_TO_T' ? (5 + 0.3 * (28 - tableau.reduce((a, c) => a + c.cards.length, 0))) : (1 + 1.5 * progress));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen: InvMove = moves[0];
    for (let i = 0; i < moves.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = moves[i]; break; }
    }

    if (chosen.type === 'F_TO_T') {
      const card = foundations[chosen.from].cards.pop()!;
      tableau[chosen.to].cards.push({ ...card });
    } else {
      const moved = tableau[chosen.from].cards.splice(tableau[chosen.from].cards.length - chosen.count, chosen.count);
      tableau[chosen.to].cards.push(...moved);
    }
  }

  // 3. Yukon layout : col i = i first cards face-down (col0=0, col1=1, ..., col6=5 hidden + 6 face-up)
  // En pratique : on cache les premières cartes selon COL_FACEUP
  for (let c = 0; c < 7; c++) {
    const col = tableau[c].cards;
    const visibleCount = COL_FACEUP[c];
    const hiddenCount = Math.max(0, col.length - visibleCount);
    for (let i = 0; i < col.length; i++) {
      col[i] = { ...col[i], faceUp: i >= hiddenCount };
    }
  }

  return {
    tableau,
    foundations,
    moves: 0,
    score: 0,
    phase: 'playing',
  };
}

let _yukonSolution: GameAction[] = [];

export function getYukonSolution(): GameAction[] {
  return [..._yukonSolution];
}

export function setYukonSolutionFromState(state: GameState): void {
  _yukonSolution = computeYukonSolution(state);
}

export function setYukonSolutionFromBD(actions: GameAction[]): void {
  _yukonSolution = [...actions];
}

function computeYukonSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  // FIX BUG : 80 itérations trop bas pour Yukon (souvent 100+ coups requis).
  // On augmente à 600 avec timeout 1500ms pour sécuriser la victoire greedy.
  for (let i = 0; i < 600; i++) {
    if (Date.now() - t0 > 1500) break;
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

function validateYukonSolution(state: GameState, solution: GameAction[]): boolean {
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
        h ^= (c.value * 31 + c.suit.charCodeAt(0) + (c.faceUp ? 100 : 0));
        h = Math.imul(h, 16777619);
      }
      h ^= 255;
      h = Math.imul(h, 16777619);
    }
  }
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
    console.log("[Yukon Solver] 🎲 Reverse-Deal Yukon — random + validation gagnante");
    const t0 = Date.now();
    const MAX_ATTEMPTS = 8;
    let lastCand: GameState | null = null;
    let lastSol: GameAction[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const cand = reverseDealYukon();
      const sol = computeYukonSolution(cand);
      if (validateYukonSolution(cand, sol)) {
        _yukonSolution = sol;
        console.log(`[Yukon Solver] ✅ DONNE SOLUBLE (${Date.now() - t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution = ${sol.length} coups (validée gagnante)`);
        return cand;
      }
      if (sol.length > lastSol.length) { lastCand = cand; lastSol = sol; }
    }
    const fallback = lastCand ?? reverseDealYukon();
    _yukonSolution = lastSol.length > 0 ? lastSol : computeYukonSolution(fallback);
    console.log(`[Yukon Solver] ⚠️ FALLBACK (${Date.now() - t0}ms) — ${_yukonSolution.length} coups partiels`);
    return fallback;
  } finally {
    Math.random = _origRandom;
  }
}

export function canStackOnTableau(a: Card, b: Card): boolean {
  return a.value === b.value - 1 && SUIT_COLOR[a.suit] !== SUIT_COLOR[b.suit];
}

export function canPlaceOnFoundation(a: Card, pile: FoundationPile): boolean {
  if (pile.suit !== a.suit) return false;
  if (pile.cards.length === 0) return a.value === 1;
  const top = pile.cards[pile.cards.length - 1];
  return a.value === top.value + 1;
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((f) => f.cards.length === 13);
}

function flipTopOf(col: Column): Column {
  if (col.cards.length === 0) return col;
  const cards = col.cards.map((c, i, a) =>
    i === a.length - 1 ? { ...c, faceUp: true } : c,
  );
  return { cards };
}

function findCard(state: GameState, cardId: string): { col: number; idx: number } | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    for (let j = 0; j < col.length; j++) {
      if (col[j].id === cardId) return { col: i, idx: j };
    }
  }
  return null;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;

    case 'MOVE': {
      const { fromCol, fromCardIndex, toCol } = action;
      if (fromCol === toCol) return state;
      const src = state.tableau[fromCol];
      if (fromCardIndex < 0 || fromCardIndex >= src.cards.length) return state;
      const head = src.cards[fromCardIndex];
      if (!head.faceUp) return state;
      // Yukon: ANY group from fromCardIndex moves together (no run validation).
      const moving = src.cards.slice(fromCardIndex);
      const dest = state.tableau[toCol];
      const top = dest.cards[dest.cards.length - 1];
      if (top) {
        if (!canStackOnTableau(head, top)) return state;
      } else {
        // Empty column: only a King (with whatever below) may go there.
        if (head.value !== 13) return state;
      }
      const nextSrc = flipTopOf({ cards: src.cards.slice(0, fromCardIndex) });
      const nextDest: Column = { cards: [...dest.cards, ...moving] };
      const tableau = state.tableau.map((c, i) =>
        i === fromCol ? nextSrc : i === toCol ? nextDest : c,
      );
      const next = { ...state, tableau, moves: state.moves + 1, score: state.score + 1 };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'TO_FOUNDATION': {
      const found = findCard(state, action.cardId);
      if (!found) return state;
      const col = state.tableau[found.col];
      if (found.idx !== col.cards.length - 1) return state; // top only
      const card = col.cards[found.idx];
      if (!card.faceUp) return state;
      const targetIdx = state.foundations.findIndex((f) => f.suit === card.suit);
      if (targetIdx < 0) return state;
      if (!canPlaceOnFoundation(card, state.foundations[targetIdx])) return state;
      const foundations = state.foundations.map((f, i) =>
        i === targetIdx ? { ...f, cards: [...f.cards, card] } : f,
      );
      const newCol = flipTopOf({ cards: col.cards.slice(0, -1) });
      const tableau = state.tableau.map((c, i) => (i === found.col ? newCol : c));
      const next = { ...state, foundations, tableau, moves: state.moves + 1, score: state.score + 10 };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'AUTO_COMPLETE': {
      let s = state;
      let progress = true;
      while (progress) {
        progress = false;
        for (let i = 0; i < s.tableau.length; i++) {
          const col = s.tableau[i].cards;
          const top = col[col.length - 1];
          if (top && top.faceUp) {
            const fIdx = s.foundations.findIndex((f) => canPlaceOnFoundation(top, f));
            if (fIdx >= 0) {
              s = gameReducer(s, { type: 'TO_FOUNDATION', cardId: top.id });
              progress = true;
              break;
            }
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
 * Analyse Yukon : 52 cartes en fondation = win.
 */
export function analyzeYukonWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Évaluation statique d'un état Yukon (plus c'est haut, mieux c'est). */
function staticEval(state: GameState): number {
  let score = 0;
  // Cartes en fondation : objectif principal
  score += state.foundations.reduce((a, f) => a + f.cards.length, 0) * 10000;
  for (const col of state.tableau) {
    if (col.cards.length === 0) {
      score += 500;          // colonne vide = grande flexibilité
      continue;
    }
    let faceUps = 0;
    for (const c of col.cards) if (c.faceUp) faceUps++;
    score += faceUps * 100;  // face-ups exposés
    // Suite descendante alternant couleurs en bas (préparation foundation)
    let runLen = 1;
    for (let i = col.cards.length - 1; i > 0; i--) {
      const cur = col.cards[i];
      const prev = col.cards[i - 1];
      if (!cur.faceUp || !prev.faceUp) break;
      if (canStackOnTableau(cur, prev)) runLen++;
      else break;
    }
    score += runLen * 30;
  }
  return score;
}

/** Énumère TOUS les coups légaux depuis l'état. */
function collectAllMoves(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  // 1. Top → fondation (toujours bonus)
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && top.faceUp) {
      const idx = state.foundations.findIndex((f) => canPlaceOnFoundation(top, f));
      if (idx >= 0) moves.push({ type: 'TO_FOUNDATION', cardId: top.id });
    }
  }
  // 2. Tableau → tableau (tous les coups MOVE valides)
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      const head = src[i];
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        const dest = state.tableau[to].cards;
        const top = dest[dest.length - 1];
        if (top && canStackOnTableau(head, top)) {
          moves.push({ type: 'MOVE', fromCol: from, fromCardIndex: i, toCol: to });
        } else if (!top && head.value === 13 && i > 0) {
          moves.push({ type: 'MOVE', fromCol: from, fromCardIndex: i, toCol: to });
        }
      }
    }
  }
  return moves;
}

/**
 * Indice intelligent Yukon avec 1-step lookahead.
 * Choisit le coup avec eval STRICTEMENT supérieure à l'état actuel.
 * Sinon → null (vraiment bloqué — pas de stock dans Yukon).
 */
export function findHint(state: GameState): GameAction | null {
  const currentEval = staticEval(state);
  const moves = collectAllMoves(state);
  let bestMove: GameAction | null = null;
  let bestScore = currentEval;
  for (const m of moves) {
    const next = gameReducer(state, m);
    if (next === state) continue;
    const score = staticEval(next);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}


/** Détection de blocage : aucun coup légal possible et la partie est en cours. */
export function isStuck(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  return findHint(state) === null;
}


/** Détection JEU IMPOSSIBLE : aucun coup possible (pas de pioche pour relancer). */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  return findHint(state) === null;
}
