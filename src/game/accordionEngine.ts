/**
 * @file accordionEngine.ts — Accordion Solitaire (52 cards).
 *
 * Layout:
 *  - 52 cards laid out left-to-right in a single row, all face-up.
 *
 * Play:
 *  - You may move a card LEFT onto:
 *      • its IMMEDIATE left neighbor (distance 1), OR
 *      • the 3rd card to its left (distance 3),
 *    BUT ONLY if the source and target share the SAME VALUE *or* the SAME SUIT.
 *  - When moved, the source card is placed ON TOP of the target (the target
 *    becomes the new top of that pile). Right-side cards shift left by 1.
 *
 * Win = collapse all 52 cards into a SINGLE pile.
 *
 * Difficulty: ~0.3% theoretical win rate — extremely hard.
 */

import { rngFromSeed } from './engines/_shuffleSeeded';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card { suit: Suit; value: CardValue; id: string; }

/** A "pile" in Accordion = a stack of cards; the TOP card determines matching. */
export interface Pile {
  /** Cards in arrival order; top = last. */
  cards: Card[];
}

export interface GameState {
  /** Row of piles, left-to-right. Win = piles.length === 1. */
  piles: Pile[];
  /** Selected pile index (for tap-to-move). */
  selected: number | null;
  moves: number;
  score: number;       // = 52 - piles.length (collapses made)
  phase: 'playing' | 'won' | 'lost';
}

export type GameAction =
  | { type: 'TAP_PILE'; index: number }
  | { type: 'MOVE'; from: number; to: number }
  | { type: 'CLEAR_SELECT' }
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

function dealOnce(): GameState {
  const deck = shuffle(buildDeck());
  const piles: Pile[] = deck.map((c) => ({ cards: [c] }));
  return { piles, selected: null, moves: 0, score: 0, phase: 'playing' };
}

/** Score : combien de collapses le greedy peut effectuer. */
function accordionProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 100; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    if (s.phase !== 'playing') break;
  }
  return 52 - s.piles.length;
}

/**
 * VRAI SOLVEUR DFS — prouve qu'une donne possède au moins UNE solution.
 *
 * Accordion = état caractérisé par la séquence des cartes du dessus de chaque pile.
 * Les cartes "enfouies" sous une pile n'influencent plus le jeu (seul le top compte
 * pour les futurs matchs). Donc la clé canonique = séquence des tops left→right.
 *
 * On essaie tous les coups (distance 1 ou 3), on backtrack en cas d'impasse.
 * Mémoïsation pour éviter de revisiter la même séquence de tops.
 *
 * Retourne true si soluble (peut atteindre 1 pile), false sinon ou timeout.
 */
function isAccordionSolvable(initial: GameState, timeoutMs: number): boolean {
  const t0 = Date.now();
  const visited = new Set<string>();
  const MAX_VISITED = 200_000;

  const topKey = (piles: Pile[]): string => {
    let s = '';
    for (const p of piles) {
      const t = p.cards[p.cards.length - 1];
      s += t.suit[0] + t.value + ',';
    }
    return s;
  };

  let timeoutHit = false;

  function dfs(state: GameState): boolean {
    if (state.piles.length === 1) return true;
    if (timeoutHit) return false;
    if ((Date.now() - t0) > timeoutMs) { timeoutHit = true; return false; }
    if (visited.size > MAX_VISITED) return false;

    const k = topKey(state.piles);
    if (visited.has(k)) return false;
    visited.add(k);

    // Génère tous les coups valides, priorise distance-3 (plus impactant)
    // et les coups les plus à droite en premier (libère plus de place).
    type Move = { from: number; to: number; pri: number };
    const moves: Move[] = [];
    for (let from = 1; from < state.piles.length; from++) {
      if (from >= 3 && canCollapse(state.piles, from, from - 3)) {
        moves.push({ from, to: from - 3, pri: 1000 + from });
      }
      if (canCollapse(state.piles, from, from - 1)) {
        moves.push({ from, to: from - 1, pri: from });
      }
    }
    moves.sort((a, b) => b.pri - a.pri);

    for (const m of moves) {
      // Effectue le coup manuellement (sans passer par le reducer pour éviter
      // les recalculs phase 'lost')
      const moving = state.piles[m.from];
      const target: Pile = { cards: [...state.piles[m.to].cards, ...moving.cards] };
      const piles: Pile[] = [];
      for (let i = 0; i < state.piles.length; i++) {
        if (i === m.from) continue;
        piles.push(i === m.to ? target : state.piles[i]);
      }
      const next: GameState = { ...state, piles, selected: null, moves: state.moves + 1, score: 52 - piles.length };
      if (dfs(next)) return true;
    }
    return false;
  }

  return dfs(initial);
}

/**
 * REVERSE-DEAL Accordion — donne GARANTIE soluble par construction.
 *
 * Principe : démarrer de l'état GAGNÉ (1 pile de 52 cartes) et faire 51 inverse-
 * collapses pour étaler les cartes en 52 piles individuelles.
 *
 * Inverse-collapse à position i (pile P_i avec ≥2 cartes) :
 *  - Prendre la carte du HAUT X de P_i (qui était l'ancienne pile B)
 *  - Vérifier que X ↔ P_i[size-2] partagent valeur ou couleur (règle Accordion)
 *  - Créer une nouvelle pile {X} et l'insérer à position i+1 (dist=1) OU i+3 (dist=3)
 *  - Décaler les piles à droite de l'insertion
 *
 * Garantie : par construction, le chemin inverse (51 collapses) mène à 1 pile = victoire.
 */
function reverseDealAccordion(): GameState {
  return reverseDealAccordionWithHistory().state;
}

/**
 * Reverse-deal Accordion AVEC tracking de l'historique pour solution garantie.
 * Chaque inverse-collapse pop le top et l'insère à i+1 ou i+3.
 * Forward : depuis le deal, pile à insertAt → collapse vers pile à pileIdx (distance 1 ou 3).
 */
type AccInvHist = { pileIdx: number; insertAt: number };

function reverseDealAccordionWithHistory(): { state: GameState; history: AccInvHist[] } {
  // 1. Démarre avec 1 pile de 52 cartes (état gagné)
  const deck = shuffle(buildDeck());
  let piles: Pile[] = [{ cards: deck }];
  const history: AccInvHist[] = [];

  // 2. Faire 51 inverse-collapses pour étaler en 52 piles
  let safety = 200;
  while (piles.length < 52 && safety-- > 0) {
    type InvOpt = { pileIdx: number; insertAt: number };
    const options: InvOpt[] = [];
    for (let i = 0; i < piles.length; i++) {
      const p = piles[i];
      if (p.cards.length < 2) continue;
      const top = p.cards[p.cards.length - 1];
      const beneath = p.cards[p.cards.length - 2];
      if (top.value !== beneath.value && top.suit !== beneath.suit) continue;
      options.push({ pileIdx: i, insertAt: i + 1 });
      if (i + 3 <= piles.length) {
        options.push({ pileIdx: i, insertAt: i + 3 });
      }
    }
    if (options.length === 0) {
      // Relax : split la plus grosse pile sans contrainte (rare ; le forward replay
      // pourrait alors échouer pour cette étape — on l'accepte comme edge case)
      let largestIdx = 0;
      for (let i = 1; i < piles.length; i++) {
        if (piles[i].cards.length > piles[largestIdx].cards.length) largestIdx = i;
      }
      if (piles[largestIdx].cards.length < 2) break;
      options.push({ pileIdx: largestIdx, insertAt: largestIdx + 1 });
    }
    const opt = options[Math.floor(Math.random() * options.length)];
    const sourcePile = piles[opt.pileIdx];
    const topCard = sourcePile.cards.pop()!;
    const newPile: Pile = { cards: [topCard] };
    piles = [...piles.slice(0, opt.insertAt), newPile, ...piles.slice(opt.insertAt)];
    history.push(opt);
  }

  // 3. Compléter si nécessaire
  while (piles.length < 52) {
    const idx = piles.findIndex((p) => p.cards.length >= 2);
    if (idx < 0) break;
    const top = piles[idx].cards.pop()!;
    piles = [...piles.slice(0, idx + 1), { cards: [top] }, ...piles.slice(idx + 1)];
    history.push({ pileIdx: idx, insertAt: idx + 1 });
  }

  return {
    state: { piles, selected: null, moves: 0, score: 0, phase: 'playing' },
    history,
  };
}

/**
 * Construit la solution forward Accordion en inversant l'historique des inverse-collapses.
 *
 * Inverse {pileIdx: i, insertAt: j} (j ∈ {i+1, i+3}) : on a pop le top de pile i, l'a inséré comme nouvelle pile à j.
 * Forward : depuis l'état initial, la pile à `currentInsertAt` (qui contient juste cette carte ou plus) doit collapse
 * vers la pile à `currentPileIdx` (à gauche). Distance = j - i = 1 ou 3.
 *
 * IMPORTANT : les indices changent au fur et à mesure que les piles fusionnent. On reconstruit en prenant
 * les events DANS L'ORDRE INVERSE de l'historique : le DERNIER inverse-collapse est le PREMIER forward-collapse.
 * À chaque step forward, le sourcePile et targetPile sont aux positions exactes (pileIdx, insertAt) car
 * les piles à droite n'ont pas encore été fusionnées (elles fusionneront APRÈS dans la solution).
 */
function buildAccordionForwardSolution(state: GameState, history: AccInvHist[]): GameAction[] {
  const solution: GameAction[] = [];
  let s = state;
  for (let h = history.length - 1; h >= 0; h--) {
    const event = history[h];
    // Forward : MOVE pile event.insertAt → event.pileIdx (collapse)
    const action: GameAction = { type: 'MOVE', from: event.insertAt, to: event.pileIdx };
    const next = gameReducer(s, action);
    if (next === s) {
      // Coup invalide : edge case (relax-split en deal sans contrainte)
      continue;
    }
    solution.push(action);
    s = next;
    if (s.piles.length === 1) break;
  }
  return solution;
}

let _accordionSolution: GameAction[] = [];

export function getAccordionSolution(): GameAction[] {
  return [..._accordionSolution];
}

export function setAccordionSolutionFromState(state: GameState): void {
  _accordionSolution = computeAccordionSolution(state);
}

export function setAccordionSolutionFromBD(actions: GameAction[]): void {
  _accordionSolution = [...actions];
}

function computeAccordionSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  // 200 iter (chaque collapse ~2 actions max : SELECT + MOVE)
  for (let i = 0; i < 200; i++) {
    if (Date.now() - t0 > 800) break;
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
    if (s.piles.length === 1) break;
  }
  return moves;
}

/**
 * Hash d'un GameState Accordion. IMPORTANT : inclut `selected` car en mode
 * tap-to-move, un TAP de sélection ne change que ce champ. Sans cela, le
 * solveur greedy s'arrête immédiatement (faux positif anti-cycle, même bug
 * que dans Pyramid).
 */
function hashStateCycle(s: any): string {
  let h = 2166136261;
  if (s?.piles) {
    for (const p of s.piles) {
      for (const c of p.cards) {
        h ^= (c.value * 31 + c.suit.charCodeAt(0));
        h = Math.imul(h, 16777619);
      }
      h ^= 255;
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.selected !== null && s?.selected !== undefined) {
    h ^= 7000 + (s.selected | 0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function validateAccordionSolution(state: GameState, solution: GameAction[]): boolean {
  let s = state;
  for (const a of solution) {
    const next = gameReducer(s, a);
    if (next === s) return false;
    s = next;
    if (s.piles.length === 1) return true;
  }
  return s.piles.length === 1;
}

export function createInitialState(seed?: number | string | null): GameState {
  const _rng = rngFromSeed(seed);
  const _origRandom = Math.random;
  Math.random = _rng;
  try {
    console.log("[Accordion Solver] 🎲 Reverse-Deal — solution forward par inversion d'historique");
    const __t0 = Date.now();

    // STRATÉGIE PRIORITAIRE : émettre la solution forward depuis l'historique
    // des inverse-collapses. Accordion ~0.3% solvable au random ; le greedy n'a
    // aucune chance — l'inversion d'historique est la SEULE approche fiable.
    const MAX_ATTEMPTS = 12;
    let bestCand: GameState | null = null;
    let bestSol: GameAction[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { state, history } = reverseDealAccordionWithHistory();
      const sol = buildAccordionForwardSolution(state, history);
      if (validateAccordionSolution(state, sol)) {
        _accordionSolution = sol;
        console.log(`[Accordion Solver] ✅ DONNE V2 SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution forward garantie = ${sol.length} coups`);
        return state;
      }
      if (sol.length > bestSol.length) { bestCand = state; bestSol = sol; }
    }
    const fallback = bestCand ?? reverseDealAccordion();
    _accordionSolution = bestSol.length > 0 ? bestSol : computeAccordionSolution(fallback);
    console.log(`[Accordion Solver] ⚠️ FALLBACK (${Date.now() - __t0}ms) — ${_accordionSolution.length} coups partiels, ${fallback.piles.length} piles`);
    return fallback;
  } finally {
    Math.random = _origRandom;
  }
}

export function topOf(pile: Pile): Card {
  return pile.cards[pile.cards.length - 1];
}

/** Source pile may be moved onto target IFF target is at distance 1 OR 3 to the LEFT
 *  AND the top cards share value or suit. */
export function canCollapse(piles: Pile[], from: number, to: number): boolean {
  if (from <= to) return false;
  const dist = from - to;
  if (dist !== 1 && dist !== 3) return false;
  const a = topOf(piles[from]);
  const b = topOf(piles[to]);
  return a.value === b.value || a.suit === b.suit;
}

export function isWon(state: GameState): boolean {
  return state.piles.length === 1;
}

export function isLost(state: GameState): boolean {
  if (state.piles.length === 1) return false;
  for (let i = 1; i < state.piles.length; i++) {
    if (canCollapse(state.piles, i, i - 1)) return false;
    if (i >= 3 && canCollapse(state.piles, i, i - 3)) return false;
  }
  return true;
}

function performMove(state: GameState, from: number, to: number): GameState {
  const moving = state.piles[from];
  // "moving onto" = stack the moving pile on top of target pile
  const target: Pile = {
    cards: [...state.piles[to].cards, ...moving.cards],
  };
  const piles: Pile[] = [];
  for (let i = 0; i < state.piles.length; i++) {
    if (i === from) continue;
    piles.push(i === to ? target : state.piles[i]);
  }
  const next: GameState = {
    ...state,
    piles,
    selected: null,
    moves: state.moves + 1,
    score: 52 - piles.length,
  };
  if (isWon(next)) return { ...next, phase: 'won' };
  if (isLost(next)) return { ...next, phase: 'lost' };
  return next;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;
    case 'CLEAR_SELECT': return { ...state, selected: null };

    case 'MOVE': {
      if (!canCollapse(state.piles, action.from, action.to)) return state;
      return performMove(state, action.from, action.to);
    }

    case 'TAP_PILE': {
      // First tap : select. Second tap on a valid target : collapse.
      if (state.selected === null) {
        return { ...state, selected: action.index };
      }
      if (state.selected === action.index) {
        return { ...state, selected: null };
      }
      // We treat the higher index as the moving pile.
      const from = Math.max(state.selected, action.index);
      const to = Math.min(state.selected, action.index);
      if (canCollapse(state.piles, from, to)) {
        return performMove(state, from, to);
      }
      // Otherwise update selection
      return { ...state, selected: action.index };
    }

    default:
      return state;
  }
}

/** Indice basique : trouve un collapse possible (priorité distance 3). */
export function findHint(state: GameState): GameAction | null {
  for (let from = 3; from < state.piles.length; from++) {
    if (canCollapse(state.piles, from, from - 3)) {
      return { type: 'MOVE', from, to: from - 3 };
    }
  }
  for (let from = 1; from < state.piles.length; from++) {
    if (canCollapse(state.piles, from, from - 1)) {
      return { type: 'MOVE', from, to: from - 1 };
    }
  }
  return null;
}

/**
 * Résultat de l'analyse de gagnabilité.
 *  - `winning` : un coup menant à la victoire a été trouvé (DFS prouvé)
 *  - `proven-lost` : DFS exhaustif terminé, AUCUN coup ne mène à la victoire
 *  - `timeout` : DFS a manqué de temps — solvabilité INCONNUE
 *  - `already-won` : déjà gagné (1 pile)
 */
export type WinnabilityResult =
  | { kind: 'winning'; action: GameAction }
  | { kind: 'proven-lost' }
  | { kind: 'timeout' }
  | { kind: 'already-won' };

/**
 * Analyse complète : retourne un résultat structuré qui distingue
 * les vrais "perdus" des "inconnus" (timeout). À utiliser pour les
 * vérifications en arrière-plan dans l'UI.
 */
export function analyzeAccordionWinnability(state: GameState, timeoutMs: number = 1500): WinnabilityResult {
  if (state.piles.length === 1) return { kind: 'already-won' };
  const t0 = Date.now();
  const visited = new Set<string>();
  const MAX_VISITED = 200_000;

  const topKey = (piles: Pile[]): string => {
    let s = '';
    for (const p of piles) {
      const t = p.cards[p.cards.length - 1];
      s += t.suit[0] + t.value + ',';
    }
    return s;
  };

  let timeoutHit = false;

  function dfs(piles: Pile[]): boolean {
    if (piles.length === 1) return true;
    if (timeoutHit) return false;
    if ((Date.now() - t0) > timeoutMs) { timeoutHit = true; return false; }
    if (visited.size > MAX_VISITED) return false;

    const k = topKey(piles);
    if (visited.has(k)) return false;
    visited.add(k);

    type Move = { from: number; to: number; pri: number };
    const moves: Move[] = [];
    for (let from = 1; from < piles.length; from++) {
      if (from >= 3 && canCollapse(piles, from, from - 3)) {
        moves.push({ from, to: from - 3, pri: 1000 + from });
      }
      if (canCollapse(piles, from, from - 1)) {
        moves.push({ from, to: from - 1, pri: from });
      }
    }
    moves.sort((a, b) => b.pri - a.pri);

    for (const m of moves) {
      const target: Pile = { cards: [...piles[m.to].cards, ...piles[m.from].cards] };
      const next: Pile[] = [];
      for (let i = 0; i < piles.length; i++) {
        if (i === m.from) continue;
        next.push(i === m.to ? target : piles[i]);
      }
      if (dfs(next)) return true;
    }
    return false;
  }

  type Move = { from: number; to: number; pri: number };
  const candidates: Move[] = [];
  for (let from = 1; from < state.piles.length; from++) {
    if (from >= 3 && canCollapse(state.piles, from, from - 3)) {
      candidates.push({ from, to: from - 3, pri: 1000 + from });
    }
    if (canCollapse(state.piles, from, from - 1)) {
      candidates.push({ from, to: from - 1, pri: from });
    }
  }
  candidates.sort((a, b) => b.pri - a.pri);

  // Si aucun coup possible et > 1 pile → vraiment perdu
  if (candidates.length === 0) return { kind: 'proven-lost' };

  for (const m of candidates) {
    if (timeoutHit) break;
    visited.clear();
    const target: Pile = { cards: [...state.piles[m.to].cards, ...state.piles[m.from].cards] };
    const next: Pile[] = [];
    for (let i = 0; i < state.piles.length; i++) {
      if (i === m.from) continue;
      next.push(i === m.to ? target : state.piles[i]);
    }
    if (dfs(next)) {
      return { kind: 'winning', action: { type: 'MOVE', from: m.from, to: m.to } };
    }
  }

  // Si timeout AU MILIEU de l'exploration : on ne sait pas
  // Si on a fini d'explorer toutes les branches sans trouver : prouvé perdu
  return timeoutHit ? { kind: 'timeout' } : { kind: 'proven-lost' };
}

/**
 * INDICE INTELLIGENT — DFS depuis l'état courant pour trouver un coup
 * qui mène à une victoire prouvée (1 pile finale).
 *
 * Si l'état est encore solvable → retourne un coup gagnant (le 1er trouvé).
 * Si plus aucune solution possible → retourne null (signal "impasse").
 *
 * C'est ce qu'utilise le bouton « Indice » : tu reçois TOUJOURS un coup
 * qui te garde sur la voie de la victoire.
 */
export function findWinningHint(state: GameState, timeoutMs: number = 1500): GameAction | null {
  if (state.piles.length === 1) return null;
  const t0 = Date.now();
  const visited = new Set<string>();
  const MAX_VISITED = 200_000;

  const topKey = (piles: Pile[]): string => {
    let s = '';
    for (const p of piles) {
      const t = p.cards[p.cards.length - 1];
      s += t.suit[0] + t.value + ',';
    }
    return s;
  };

  let timeoutHit = false;

  function dfs(piles: Pile[]): boolean {
    if (piles.length === 1) return true;
    if (timeoutHit) return false;
    if ((Date.now() - t0) > timeoutMs) { timeoutHit = true; return false; }
    if (visited.size > MAX_VISITED) return false;

    const k = topKey(piles);
    if (visited.has(k)) return false;
    visited.add(k);

    type Move = { from: number; to: number; pri: number };
    const moves: Move[] = [];
    for (let from = 1; from < piles.length; from++) {
      if (from >= 3 && canCollapse(piles, from, from - 3)) {
        moves.push({ from, to: from - 3, pri: 1000 + from });
      }
      if (canCollapse(piles, from, from - 1)) {
        moves.push({ from, to: from - 1, pri: from });
      }
    }
    moves.sort((a, b) => b.pri - a.pri);

    for (const m of moves) {
      const target: Pile = { cards: [...piles[m.to].cards, ...piles[m.from].cards] };
      const next: Pile[] = [];
      for (let i = 0; i < piles.length; i++) {
        if (i === m.from) continue;
        next.push(i === m.to ? target : piles[i]);
      }
      if (dfs(next)) return true;
    }
    return false;
  }

  // Essaie chaque coup top-level et vérifie si la position résultante est gagnante.
  type Move = { from: number; to: number; pri: number };
  const candidates: Move[] = [];
  for (let from = 1; from < state.piles.length; from++) {
    if (from >= 3 && canCollapse(state.piles, from, from - 3)) {
      candidates.push({ from, to: from - 3, pri: 1000 + from });
    }
    if (canCollapse(state.piles, from, from - 1)) {
      candidates.push({ from, to: from - 1, pri: from });
    }
  }
  candidates.sort((a, b) => b.pri - a.pri);

  for (const m of candidates) {
    visited.clear();
    const target: Pile = { cards: [...state.piles[m.to].cards, ...state.piles[m.from].cards] };
    const next: Pile[] = [];
    for (let i = 0; i < state.piles.length; i++) {
      if (i === m.from) continue;
      next.push(i === m.to ? target : state.piles[i]);
    }
    if (dfs(next)) {
      console.log(`[Accordion Hint] 🎯 Coup gagnant : pile ${m.from} → pile ${m.to} (distance ${m.from - m.to})`);
      return { type: 'MOVE', from: m.from, to: m.to };
    }
  }

  console.log(`[Accordion Hint] ⚠️ Aucune suite gagnante trouvée depuis l'état actuel (${state.piles.length} piles restantes)`);
  return null;
}


/** Détection de blocage : phase déjà 'lost' OU plus aucun coup. */
export function isStuck(state: GameState): boolean {
  if ((state.phase as string) === 'lost') return true;
  if (state.phase !== 'playing') return false;
  return findHint(state) === null;
}


/** Détection JEU IMPOSSIBLE : aucun coup possible (pas de pioche pour relancer). */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  return findHint(state) === null;
}
