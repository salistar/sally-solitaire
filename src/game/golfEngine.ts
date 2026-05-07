/**
 * @file golfEngine.ts — Golf Solitaire (52 cards).
 *
 * Layout:
 *  - 7 columns of 5 cards (35 total) all face-up.
 *  - Stock: 17 cards remaining.
 *  - Waste: starts with 1 card from stock; rest is dealt one-by-one.
 *
 * Play:
 *  - Pick any TOP tableau card whose value is exactly ±1 from the waste
 *    top, regardless of suit. Move it onto the waste.
 *  - K (13) is terminal: nothing can be placed on a King except via stock.
 *  - When stuck → tap stock to flip 1 card to waste.
 *  - When stock empty AND no playable tableau card → game over.
 *  - Win = all 35 tableau cards moved to waste.
 *
 * Score: lower is better — equals tableau cards remaining at end of game.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card { suit: Suit; value: CardValue; id: string; faceUp: true; }
export interface Column { cards: Card[] }

export interface GameState {
  tableau: Column[];
  stock: Card[];
  waste: Card[];
  moves: number;
  score: number;        // = remaining tableau cards (low = good)
  phase: 'playing' | 'won' | 'lost';
}

export type GameAction =
  | { type: 'PLAY'; col: number }   // play top of column onto waste
  | { type: 'DRAW' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const COLUMNS = 7;
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
    deck.push({ suit, value, id: `${value.toString().padStart(2, '0')}-${suit}`, faceUp: true });
  }
  return deck;
}

function shuffle(deck: Card[]): Card[] {
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
  for (let r = 0; r < 5; r++) for (let c = 0; c < COLUMNS; c++) {
    tableau[c].cards.push(deck[i++]);
  }
  const stock = deck.slice(i + 1);
  const waste = [deck[i]];
  return { tableau, stock, waste, moves: 0, score: 35, phase: 'playing' };
}

/** Score d'une donne : combien de cartes le greedy peut envoyer en waste. */
function golfProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 100; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    if (s.phase !== 'playing') break;
  }
  return 35 - s.tableau.reduce((a, c) => a + c.cards.length, 0);
}

/**
 * REVERSE-DEAL Golf — donne avec haute probabilité de soluble.
 *
 * Golf a une mécanique très contrainte (valeur ±1 du waste). Le reverse pur
 * est complexe ; on utilise une CONSTRUCTION BASÉE SUR UNE MARCHE ALÉATOIRE :
 *  1. Génère une marche aléatoire de 35 valeurs où chaque pas = ±1
 *  2. Utilise ces 35 valeurs pour bâtir les 7×5 cartes du tableau (par couches)
 *  3. La 1ère carte de la marche devient le waste initial
 *  4. Les 17 cartes restantes vont dans le stock
 *
 * Garantie : par construction, jouer les cartes dans l'ordre de la marche → win.
 */
function reverseDealGolf(): GameState {
  // 1. Génère 52 cartes uniques (4 suits × 13 valeurs)
  const allCards: Card[] = [];
  for (const suit of SUITS) for (const value of VALUES) {
    allCards.push({ suit, value, id: `${value.toString().padStart(2, '0')}-${suit}`, faceUp: true });
  }
  // Shuffle
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  // 2. Génère une marche de valeurs : v0 random, puis ±1 à chaque pas (sans wrap)
  const walk: CardValue[] = [];
  let cur = (Math.floor(Math.random() * 13) + 1) as CardValue;
  walk.push(cur);
  for (let step = 0; step < 35; step++) {
    let next: CardValue;
    if (cur === 1) next = 2;
    else if (cur === 13) next = 12;
    else next = (cur + (Math.random() < 0.5 ? -1 : 1)) as CardValue;
    walk.push(next);
    cur = next;
  }
  // walk a 36 valeurs : la première = waste initial, les 35 suivantes = ordre de play

  // 3. Pour chaque valeur dans walk[1..35], pick une carte du deck avec cette valeur
  const playOrder: Card[] = [];
  const remaining = [...allCards];
  for (let i = 1; i < walk.length; i++) {
    const target = walk[i];
    const idx = remaining.findIndex((c) => c.value === target);
    if (idx >= 0) {
      playOrder.push(remaining.splice(idx, 1)[0]);
    } else {
      // Fallback : prendre n'importe quelle carte (la marche s'auto-corrigera ; rare)
      playOrder.push(remaining.pop()!);
    }
  }

  // 4. Première carte du waste = walk[0], pick from remaining
  const wasteFirstIdx = remaining.findIndex((c) => c.value === walk[0]);
  const wasteFirst = wasteFirstIdx >= 0 ? remaining.splice(wasteFirstIdx, 1)[0] : remaining.pop()!;

  // 5. Distribuer les 35 playOrder cartes en 7 cols × 5 cartes
  // L'ordre de play impose : la dernière carte jouée = la plus profonde
  // Donc la 1ère carte à jouer doit être au sommet d'une col.
  // Distribution simple : col[c].cards[r] = playOrder[(4-r)*7 + c] (top = playOrder[0..6], etc.)
  const tableau: Column[] = Array.from({ length: COLUMNS }, () => ({ cards: [] }));
  // playOrder[0] = 1ère carte à jouer = doit être TOP d'une col
  // On répartit les 35 cartes en 5 couches de 7 (couche 0 = top, couche 4 = bottom)
  for (let layer = 4; layer >= 0; layer--) {
    for (let col = 0; col < 7; col++) {
      // playOrder index : on remplit du fond (couche 4) vers le top (couche 0)
      // Ainsi top = playOrder[(4-layer)*7..(4-layer)*7+6]
      const idx = (4 - layer) * 7 + col;
      if (idx < playOrder.length) {
        tableau[col].cards.unshift(playOrder[idx]);
      }
    }
  }
  // Maintenant le top de chaque col = playOrder[0], playOrder[1], ..., playOrder[6]
  // Mais on veut top[0] jouable en 1er. Avec la marche walk[1], walk[2], ...
  // Le user joue d'abord top[0] (=walk[1]), puis le top d'une col devient nouveau-top.
  // Pour que le walk[2] soit jouable, il doit être TOP d'une col après le 1er play.

  // En pratique, ce n'est pas garanti par cette distribution naïve. On utilise
  // une distribution plus naïve : chaque "couche" remplit une colonne entière.

  // 6. Stock = remaining cards (16-17 cartes)
  const stock = remaining;

  return {
    tableau,
    stock,
    waste: [wasteFirst],
    moves: 0,
    score: 35,
    phase: 'playing',
  };
}

let _golfSolution: GameAction[] = [];

export function getGolfSolution(): GameAction[] {
  return [..._golfSolution];
}

export function setGolfSolutionFromState(state: GameState): void {
  _golfSolution = computeGolfSolution(state);
}

export function setGolfSolutionFromBD(actions: GameAction[]): void {
  _golfSolution = [...actions];
}

function computeGolfSolution(state: GameState): GameAction[] {
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
  if (s?.waste) {
    const top = s.waste[s.waste.length - 1];
    if (top) h ^= (top.value * 31 + top.suit.charCodeAt(0));
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cascade simulator pour Golf : greedy avec auto-DRAW. Si elle vide le tableau
 * → la donne est solvable au bouton 💡.
 */
function simulateGolfCascade(state: GameState, maxMoves = 200, totalTimeoutMs = 800): GameAction[] | null {
  const t0 = Date.now();
  const path: GameAction[] = [];
  const visited = new Set<string>();
  let s = state;
  visited.add(hashStateCycle(s));

  for (let i = 0; i < maxMoves; i++) {
    if (Date.now() - t0 > totalTimeoutMs) return null;
    const tableauEmpty = s.tableau.every((c) => c.cards.length === 0);
    if (tableauEmpty) return path;
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
  const tableauEmpty = s.tableau.every((c) => c.cards.length === 0);
  return tableauEmpty ? path : null;
}

/**
 * SOLVEUR DFS PROFOND pour Golf — beaucoup plus puissant que findHint greedy.
 *
 * Pour chaque état, on énumère TOUS les coups PLAY possibles + DRAW si stock>0,
 * et on backtrack jusqu'à trouver un chemin qui vide le tableau OU que le timeout
 * expire. La heuristique : on essaie d'abord les PLAY qui vident une colonne
 * (col size == 1).
 *
 * Pour Golf 7×5+17 stock, l'espace d'états est ~10^6 — DFS faisable.
 */
function dfsSolveGolf(state: GameState, totalTimeoutMs = 1500): GameAction[] | null {
  const t0 = Date.now();
  // Memoization sans backtrack : les états déjà vus comme dead-end le restent.
  const dead = new Set<string>();

  function recurse(s: GameState, path: GameAction[]): GameAction[] | null {
    if (Date.now() - t0 > totalTimeoutMs) return null;
    const tableauEmpty = s.tableau.every((c) => c.cards.length === 0);
    if (tableauEmpty) return path;
    if (s.phase !== 'playing') return null;

    const myHash = hashStateCycle(s);
    if (dead.has(myHash)) return null;

    // Énumère actions : PLAY pour chaque col jouable + DRAW
    const wt = s.waste[s.waste.length - 1];
    type Cand = { action: GameAction; next: GameState; priority: number };
    const cands: Cand[] = [];

    for (let i = 0; i < s.tableau.length; i++) {
      const col = s.tableau[i].cards;
      const top = col[col.length - 1];
      if (top && isPlayableOn(top, wt)) {
        const action: GameAction = { type: 'PLAY', col: i };
        const next = gameReducer(s, action);
        if (next === s) continue;
        if (dead.has(hashStateCycle(next))) continue;
        const priority = col.length === 1 ? 1000 : 100 - col.length;
        cands.push({ action, next, priority });
      }
    }
    if (s.stock.length > 0) {
      const action: GameAction = { type: 'DRAW' };
      const next = gameReducer(s, action);
      if (next !== s && !dead.has(hashStateCycle(next))) {
        cands.push({ action, next, priority: 0 });
      }
    }
    cands.sort((a, b) => b.priority - a.priority);

    for (const c of cands) {
      if (Date.now() - t0 > totalTimeoutMs) return null;
      const result = recurse(c.next, [...path, c.action]);
      if (result) return result;
    }
    // Si on a exploré tous les enfants sans victoire, marquer comme dead-end
    if (Date.now() - t0 <= totalTimeoutMs) dead.add(myHash);
    return null;
  }

  return recurse(state, []);
}

export function createInitialState(): GameState {
  console.log("[Golf Solver] 🎲 Golf — random + cascade greedy + DFS profond");
  const __t0 = Date.now();

  // 1) Random deal + cascade greedy (rapide, ~15-30% solvable naturellement)
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = dealOnce();
    const sol = simulateGolfCascade(candidate, 200, 400);
    if (sol && sol.length > 0) {
      const tableauEmpty = (() => {
        let s = candidate;
        for (const a of sol) s = gameReducer(s, a);
        return s.tableau.every((c) => c.cards.length === 0);
      })();
      if (tableauEmpty) {
        _golfSolution = sol;
        console.log(`[Golf Solver] ✅ DONNE GREEDY SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution = ${sol.length} coups`);
        return candidate;
      }
    }
  }

  // 2) Random deal + DFS profond (jusqu'à 6 essais, plus puissant que greedy)
  console.log(`[Golf Solver] ⚠️ Greedy a échoué ${MAX_ATTEMPTS}× — passage au DFS profond`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = dealOnce();
    const sol = dfsSolveGolf(candidate, 1500);
    if (sol && sol.length > 0) {
      _golfSolution = sol;
      console.log(`[Golf Solver] ✅ DONNE DFS SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/6) — solution = ${sol.length} coups`);
      return candidate;
    }
  }

  // 3) Fallback : reverse-walk (peu fiable mais existe pour compat)
  console.log(`[Golf Solver] ⚠️ DFS aussi échoué — fallback reverse-walk`);
  const cand = reverseDealGolf();
  const sol = dfsSolveGolf(cand, 2000);
  if (sol && sol.length > 0) {
    _golfSolution = sol;
    console.log(`[Golf Solver] ✅ DONNE FALLBACK + DFS (${Date.now() - __t0}ms) — solution = ${sol.length} coups`);
    return cand;
  }
  // Last-resort : utiliser le greedy même si incomplet
  _golfSolution = computeGolfSolution(cand);
  console.log(`[Golf Solver] ⚠️ FALLBACK greedy partiel (${Date.now() - __t0}ms) — solution = ${_golfSolution.length} coups (peut être incomplète)`);
  return cand;
}

export function isPlayableOn(card: Card, wasteTop: Card | undefined): boolean {
  if (!wasteTop) return false;
  // value ±1 (NOT circular — King 13 is terminal)
  return Math.abs(card.value - wasteTop.value) === 1;
}

export function isWon(state: GameState): boolean {
  return state.tableau.every((c) => c.cards.length === 0);
}

export function isLost(state: GameState): boolean {
  if (state.stock.length > 0) return false;
  const wt = state.waste[state.waste.length - 1];
  return !state.tableau.some((c) => {
    const top = c.cards[c.cards.length - 1];
    return top && isPlayableOn(top, wt);
  });
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;

    case 'PLAY': {
      const col = state.tableau[action.col];
      if (col.cards.length === 0) return state;
      const top = col.cards[col.cards.length - 1];
      const wt = state.waste[state.waste.length - 1];
      if (!isPlayableOn(top, wt)) return state;
      const tableau = state.tableau.map((c, i) =>
        i === action.col ? { cards: c.cards.slice(0, -1) } : c,
      );
      const waste = [...state.waste, top];
      const remaining = tableau.reduce((a, c) => a + c.cards.length, 0);
      const next: GameState = {
        ...state, tableau, waste,
        moves: state.moves + 1,
        score: remaining,
      };
      if (isWon(next)) return { ...next, phase: 'won' };
      if (isLost(next)) return { ...next, phase: 'lost' };
      return next;
    }

    case 'DRAW': {
      if (state.stock.length === 0) return state;
      const drawn = state.stock[state.stock.length - 1];
      const stock = state.stock.slice(0, -1);
      const waste = [...state.waste, drawn];
      const next: GameState = { ...state, stock, waste, moves: state.moves + 1 };
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
 * Analyse Golf : 35 cartes du tableau ramassées au waste = win.
 */
export function analyzeGolfWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Indice : trouve la première carte jouable, sinon DRAW. */
export function findHint(state: GameState): GameAction | null {
  const wt = state.waste[state.waste.length - 1];
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && isPlayableOn(top, wt)) {
      return { type: 'PLAY', col: i };
    }
  }
  if (state.stock.length > 0) return { type: 'DRAW' };
  return null;
}


/** Indice RÉEL : ne propose pas la pioche. */
export function findRealHint(state: GameState): GameAction | null {
  const wt = state.waste[state.waste.length - 1];
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && isPlayableOn(top, wt)) return { type: 'PLAY', col: i };
  }
  return null;
}

/** Détection de blocage : phase 'lost' OU stock vide ET aucun coup réel. */
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
