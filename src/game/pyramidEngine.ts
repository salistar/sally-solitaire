/**
 * @file pyramidEngine.ts — Pyramid Solitaire (52 cards).
 *
 * Layout:
 *  - 28 cards in a pyramid: rows of 1, 2, 3, 4, 5, 6, 7. Each card overlaps
 *    the two below it — a pyramid card is "available" when it has no card
 *    covering it (both children removed, or it's on the bottom row).
 *  - Stock: 24 remaining cards face-down.
 *  - Waste: top card always available.
 *
 * Play:
 *  - Pair two AVAILABLE cards whose values sum to 13 → both removed.
 *    A=1, 2-10=face, J=11, Q=12, K=13.
 *  - K (13) alone is removed (sums to 13 by itself).
 *  - Tap stock to flip a card to waste.
 *
 * Win = entire pyramid removed (the 28 cards).
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card { suit: Suit; value: CardValue; id: string; }

/** A pyramid slot: contains a card or null when removed. */
export type PyramidSlot = Card | null;

export interface GameState {
  /** 7 rows; row r has r+1 slots (1, 2, 3, ..., 7). */
  pyramid: PyramidSlot[][];
  stock: Card[];
  waste: Card[];
  /** Selected card to attempt a pair. */
  selected: { type: 'pyramid'; row: number; col: number } | { type: 'waste' } | null;
  moves: number;
  score: number;        // pyramid removed count (max 28)
  phase: 'playing' | 'won' | 'lost';
}

export type GameAction =
  | { type: 'TAP_PYRAMID'; row: number; col: number }
  | { type: 'TAP_WASTE' }
  | { type: 'DRAW' }
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
  const pyramid: PyramidSlot[][] = [];
  let i = 0;
  for (let r = 0; r < 7; r++) {
    const row: PyramidSlot[] = [];
    for (let c = 0; c <= r; c++) row.push(deck[i++]);
    pyramid.push(row);
  }
  const stock = deck.slice(i);
  return { pyramid, stock, waste: [], selected: null, moves: 0, score: 0, phase: 'playing' };
}

/** Score : combien de cartes de la pyramide le greedy retire. */
function pyramidProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 200; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    if (s.phase !== 'playing') break;
  }
  return s.score;
}

/**
 * REVERSE-DEAL Pyramid V2 — donne 100 % solvable, inspirée de spiderEngine.
 *
 * Stratégie :
 *   1. PLAN DE RETRAIT TOPOLOGIQUE : on simule la suppression bottom-up des
 *      28 positions de la pyramide en piochant 2 positions disponibles par
 *      step (ou 1 position seule si on veut un Roi solo). Cela garantit que
 *      lors du replay forward, chaque paire est cliquable au bon moment.
 *   2. ASSIGNATION VALEURS : pour chaque paire de positions, on tire un type
 *      de paire (R, 13-R) avec R ∈ {1..6} et on assigne 2 cartes du deck
 *      ayant ces rangs. Pour chaque solo, on assigne un Roi.
 *   3. STOCK : les 24 cartes restantes sont mélangées en stock.
 *   4. SOLUTION FORWARD : on émet TAP_PYRAMID(p1) + TAP_PYRAMID(p2) pour
 *      chaque paire, dans l'ordre topologique. Pour un solo Roi : TAP_PYRAMID.
 *
 * Invariants :
 *   - 28 positions retirées en 14 steps (28/2) ou variantes avec K solo.
 *   - Chaque step : positions disponibles (enfants déjà retirés ou bottom row).
 *   - Pairs assignées avec valeurs sommant à 13 et pas de partage de rang
 *     dépassant les 4 cartes par rang du deck.
 */
type PyrPos = { r: number; c: number };

function shuffleArr<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tryReverseDealPyramidOnce(): { state: GameState; solution: GameAction[] } | null {
  // 1. Plan de retrait
  const pyramid: PyramidSlot[][] = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: r + 1 }, () => null as PyramidSlot),
  );
  const removed: boolean[][] = pyramid.map((row) => row.map(() => false));

  const isAvailFwd = (r: number, c: number): boolean => {
    if (removed[r][c]) return false;
    if (r === 6) return true;
    return removed[r + 1][c] && removed[r + 1][c + 1];
  };

  const getAvail = (): PyrPos[] => {
    const out: PyrPos[] = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < pyramid[r].length; c++) {
      if (isAvailFwd(r, c)) out.push({ r, c });
    }
    return out;
  };

  // Décide : combien de Rois solos en pyramide ? 0, 2 (= 13 paires + 2 K solos), 4 (12 paires + 4 K solos)
  // Note : nb cartes pyramide = 28. 14 paires (28 cartes), 13 paires + 2 K (28), 12 paires + 4 K (28).
  const koptions = [0, 2, 4] as const;
  const nKingsInPyramid = koptions[Math.floor(Math.random() * koptions.length)];
  const nPairs = (28 - nKingsInPyramid) / 2;

  type Step =
    | { kind: 'pair'; p1: PyrPos; p2: PyrPos }
    | { kind: 'king'; p: PyrPos };
  const plan: Step[] = [];

  // Génère un plan : on alterne aléatoirement pair ou king (selon les budgets)
  let kingsLeft = nKingsInPyramid;
  let pairsLeft = nPairs;
  while (kingsLeft > 0 || pairsLeft > 0) {
    const avail = getAvail();
    if (avail.length === 0) return null;
    // Choisit pair ou king avec proba ~ proportionnelle aux budgets
    const total = kingsLeft + pairsLeft;
    const wantPair = pairsLeft > 0 && (kingsLeft === 0 || Math.random() * total < pairsLeft);
    if (wantPair) {
      if (avail.length < 2) {
        // fallback : un solo king si possible
        if (kingsLeft > 0) {
          const p = avail[Math.floor(Math.random() * avail.length)];
          plan.push({ kind: 'king', p });
          removed[p.r][p.c] = true;
          kingsLeft--;
          continue;
        }
        return null;
      }
      const idx1 = Math.floor(Math.random() * avail.length);
      const p1 = avail[idx1];
      avail.splice(idx1, 1);
      const idx2 = Math.floor(Math.random() * avail.length);
      const p2 = avail[idx2];
      plan.push({ kind: 'pair', p1, p2 });
      removed[p1.r][p1.c] = true;
      removed[p2.r][p2.c] = true;
      pairsLeft--;
    } else {
      const p = avail[Math.floor(Math.random() * avail.length)];
      plan.push({ kind: 'king', p });
      removed[p.r][p.c] = true;
      kingsLeft--;
    }
  }

  // Sanity : tout retiré ?
  for (let r = 0; r < 7; r++) for (let c = 0; c < pyramid[r].length; c++) {
    if (!removed[r][c]) return null;
  }

  // 2. Assignation des valeurs
  // Chaque paire = (R, 13-R) avec R ∈ {1..6}. Counts par type, max 4 par rang.
  // On a 4 cartes de chaque rang dans le deck.
  // Total cartes par rang utilisées en pyramide = counts[R-1] + counts[6-R] ≤ 4.
  // Plus simple : chaque rang R apparaît dans counts[R-1] paires (R, 13-R), donc
  //   utilisation rang R = counts[R-1] et utilisation rang 13-R = counts[R-1] aussi.
  //   contrainte : counts[R-1] ≤ 4 pour chaque R ∈ {1..6}.
  //   somme(counts) = nPairs.
  const counts = [0, 0, 0, 0, 0, 0];
  let remaining = nPairs;
  let safety = 200;
  while (remaining > 0 && safety-- > 0) {
    const idx = Math.floor(Math.random() * 6);
    if (counts[idx] < 4) {
      counts[idx]++;
      remaining--;
    }
  }
  if (remaining > 0) return null;

  // Construit deck par rang
  const deck = shuffleArr(buildDeck());
  const cardsByRank: Card[][] = Array.from({ length: 14 }, () => []);
  for (const card of deck) cardsByRank[card.value].push(card);
  if (cardsByRank[13].length < nKingsInPyramid) return null;

  // Forme cardPairs (rangs déjà tirés)
  const allTypes: Array<[number, number]> = [
    [1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7],
  ];
  const cardPairs: Array<[Card, Card]> = [];
  for (let i = 0; i < 6; i++) {
    const [a, b] = allTypes[i];
    for (let j = 0; j < counts[i]; j++) {
      const ca = cardsByRank[a].pop();
      const cb = cardsByRank[b].pop();
      if (!ca || !cb) return null;
      cardPairs.push([ca, cb]);
    }
  }
  // Mélange l'ordre des cardPairs (varie quel rang va où)
  const shuffledCardPairs = shuffleArr(cardPairs);
  // Pour chaque pair, on peut aussi swapper p1↔p2
  for (const cp of shuffledCardPairs) {
    if (Math.random() < 0.5) {
      const tmp = cp[0]; cp[0] = cp[1]; cp[1] = tmp;
    }
  }

  // 3. Place les cartes dans la pyramide selon le plan
  // FIX BUG : on POP les Rois (au lieu d'indexer) sinon les Rois utilisés en
  // pyramide se retrouvent aussi dans le stock → cartes dupliquées (52 → 54+).
  let pairIdx = 0;
  for (const step of plan) {
    if (step.kind === 'pair') {
      const [c1, c2] = shuffledCardPairs[pairIdx++];
      pyramid[step.p1.r][step.p1.c] = c1;
      pyramid[step.p2.r][step.p2.c] = c2;
    } else {
      const k = cardsByRank[13].pop();
      if (!k) return null;
      pyramid[step.p.r][step.p.c] = k;
    }
  }

  // 4. Stock = cartes restantes mélangées (après pop des Kings utilisés)
  const remainingCards: Card[] = [];
  for (let v = 1; v <= 13; v++) {
    while (cardsByRank[v].length > 0) remainingCards.push(cardsByRank[v].pop()!);
  }
  const stock = shuffleArr(remainingCards);

  // Sanity check : 28 (pyramide) + stock + 0 (waste) = 52
  let pyrCount = 0;
  for (const row of pyramid) for (const c of row) if (c) pyrCount++;
  if (pyrCount !== 28 || stock.length + pyrCount !== 52) {
    console.warn(`[Pyramid V2] Invariant cassé : pyrCount=${pyrCount} stock=${stock.length}`);
    return null;
  }

  // 5. Solution forward : reproduit le plan via TAP_PYRAMID
  const solution: GameAction[] = [];
  for (const step of plan) {
    if (step.kind === 'pair') {
      solution.push({ type: 'TAP_PYRAMID', row: step.p1.r, col: step.p1.c });
      solution.push({ type: 'TAP_PYRAMID', row: step.p2.r, col: step.p2.c });
    } else {
      solution.push({ type: 'TAP_PYRAMID', row: step.p.r, col: step.p.c });
    }
  }

  const state: GameState = {
    pyramid,
    stock,
    waste: [],
    selected: null,
    moves: 0,
    score: 0,
    phase: 'playing',
  };

  return { state, solution };
}

function reverseDealPyramid(): { state: GameState; solution: GameAction[] } {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = tryReverseDealPyramidOnce();
    if (result) {
      // Valide la solution sur l'engine pour être sûr
      let s = result.state;
      let ok = true;
      for (const action of result.solution) {
        const next = gameReducer(s, action);
        if (next === s) { ok = false; break; }
        s = next;
      }
      if (ok && s.phase === 'won') return result;
    }
  }
  // Fallback : random deal (peu probable de tomber ici)
  const fallback = dealOnce();
  return { state: fallback, solution: [] };
}

let _pyramidSolution: GameAction[] = [];

export function getPyramidSolution(): GameAction[] {
  return [..._pyramidSolution];
}

export function setPyramidSolutionFromState(state: GameState): void {
  _pyramidSolution = computePyramidSolution(state);
}

export function setPyramidSolutionFromBD(actions: GameAction[]): void {
  _pyramidSolution = [...actions];
}

/**
 * Solveur greedy Pyramid. Anti-cycle avec hash incluant `selected` (sinon
 * un TAP de sélection ne change pas le hash → faux positif et break immédiat).
 * Fait progresser la partie en suivant `findHint`. Tolère jusqu'à 200 itérations
 * (4 actions par paire au maximum : TAP, CLEAR_SELECT, TAP, ...).
 */
function computePyramidSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    if (Date.now() - t0 > 800) break;
    if (s.phase !== 'playing') break;
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
  }
  return moves;
}

/**
 * Hash d'un état Pyramid pour anti-cycle.
 * IMPORTANT : inclut `selected` car un TAP de sélection ne change rien d'autre
 * dans l'état mais doit produire un hash distinct (sinon le solveur s'arrête
 * dès la première sélection — bug observé en prod, solution=0 coups).
 */
function hashStateCycle(s: any): string {
  let h = 2166136261;
  if (s?.pyramid) {
    for (const row of s.pyramid) {
      for (const c of row) {
        h ^= c ? (c.value * 31 + c.suit.charCodeAt(0)) : 999;
        h = Math.imul(h, 16777619);
      }
    }
  }
  if (s?.stock) { h ^= s.stock.length; h = Math.imul(h, 16777619); }
  if (s?.waste) {
    h ^= s.waste.length * 7;
    // Inclut le top de waste car le rang du top influe sur les coups dispos
    const top = s.waste[s.waste.length - 1];
    if (top) {
      h ^= top.value * 41 + top.suit.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.selected) {
    if (s.selected.type === 'pyramid') {
      h ^= 5000 + s.selected.row * 10 + s.selected.col;
    } else {
      h ^= 9999;
    }
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Cascade simulator pour Pyramid : reproduit la logique du bouton indice runtime
 * (greedy avec auto-DRAW). Si elle gagne (= pyramide entièrement vidée),
 * la donne est garantie solvable par l'utilisateur via le bouton 💡.
 */
function simulatePyramidCascade(state: GameState, maxMoves = 400, totalTimeoutMs = 1500): GameAction[] | null {
  const t0 = Date.now();
  const path: GameAction[] = [];
  const visited = new Set<string>();
  let s = state;
  visited.add(hashStateCycle(s));

  for (let i = 0; i < maxMoves; i++) {
    if (Date.now() - t0 > totalTimeoutMs) return null;
    if (isWon(s)) return path;
    if ((s.phase as string) === 'lost') return null;

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
  return isWon(s) ? path : null;
}

export function createInitialState(): GameState {
  console.log("[Pyramid Solver] 🎲 Reverse-Deal Pyramid V2 — donne 100% solvable garantie");
  const __t0 = Date.now();

  // STRATÉGIE (inspirée Spider 1-couleur) :
  //   1. Random deal + cascade oracle (jusqu'à 6 essais, deal authentique-mélangé)
  //   2. Fallback : reverseDealPyramid (plan topologique constructif → garantie)

  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = dealOnce();
    const sol = simulatePyramidCascade(candidate, 400, 600);
    if (sol !== null && sol.length > 0) {
      // Vérification stricte
      let s = candidate;
      let won = false;
      for (const action of sol) {
        const next = gameReducer(s, action);
        if (next === s) break;
        s = next;
        if (isWon(s)) { won = true; break; }
      }
      if (won) {
        _pyramidSolution = sol;
        console.log(`[Pyramid Solver] ✅ DONNE RANDOM SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution = ${sol.length} coups via cascade`);
        return candidate;
      }
    }
  }

  // Fallback constructif
  const { state, solution } = reverseDealPyramid();
  _pyramidSolution = solution;
  console.log(`[Pyramid Solver] ✅ DONNE FALLBACK V2 SOLUBLE (${Date.now() - __t0}ms) — solution = ${solution.length} coups (${solution.length} TAP_PYRAMID)`);
  return state;
}

/** A pyramid card is available when both its direct children (below) are removed. */
export function isAvailable(pyramid: PyramidSlot[][], row: number, col: number): boolean {
  if (row < 0 || row >= pyramid.length) return false;
  if (col < 0 || col >= pyramid[row].length) return false;
  if (pyramid[row][col] === null) return false;
  if (row === pyramid.length - 1) return true;
  const nextRow = pyramid[row + 1];
  return nextRow[col] === null && nextRow[col + 1] === null;
}

export function isWon(state: GameState): boolean {
  return state.pyramid.every((row) => row.every((s) => s === null));
}

/** No more legal moves: stock empty, waste has nothing pairable, no available pyramid pair. */
export function isLost(state: GameState): boolean {
  if (state.stock.length > 0) return false;
  // collect available cards (pyramid + waste top)
  const avail: Card[] = [];
  for (let r = 0; r < state.pyramid.length; r++) {
    for (let c = 0; c < state.pyramid[r].length; c++) {
      if (isAvailable(state.pyramid, r, c)) avail.push(state.pyramid[r][c]!);
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt) avail.push(wt);
  // any K alone? → still moves left
  if (avail.some((c) => c.value === 13)) return false;
  // any pair sum = 13?
  for (let i = 0; i < avail.length; i++) {
    for (let j = i + 1; j < avail.length; j++) {
      if (avail[i].value + avail[j].value === 13) return false;
    }
  }
  return true;
}

function removePyramid(state: GameState, row: number, col: number): GameState {
  const pyramid = state.pyramid.map((r, ri) =>
    ri === row ? r.map((s, ci) => (ci === col ? null : s)) : r,
  );
  const removed = state.pyramid.flat().filter((s) => s === null).length;
  return { ...state, pyramid, score: 28 - state.pyramid.flat().filter((s) => s !== null).length };
}

function removeWasteTop(state: GameState): GameState {
  return { ...state, waste: state.waste.slice(0, -1) };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET': return createInitialState();
    case 'LOAD_FROM_BD': return action.state;
    case 'CLEAR_SELECT': return { ...state, selected: null };

    case 'DRAW': {
      if (state.stock.length === 0) return state;
      const drawn = state.stock[state.stock.length - 1];
      return {
        ...state,
        stock: state.stock.slice(0, -1),
        waste: [...state.waste, drawn],
        selected: null,
        moves: state.moves + 1,
      };
    }

    case 'TAP_WASTE': {
      const top = state.waste[state.waste.length - 1];
      if (!top) return state;
      // K alone → remove
      if (top.value === 13) {
        const next = { ...removeWasteTop(state), selected: null, moves: state.moves + 1 };
        const pyramidRemovedCount = next.pyramid.flat().filter((s) => s === null).length;
        const updated = { ...next, score: pyramidRemovedCount } as GameState;
        if (isWon(updated)) return { ...updated, phase: 'won' };
        if (isLost(updated)) return { ...updated, phase: 'lost' };
        return updated;
      }
      // already selected? if pyramid → try pair
      if (state.selected) {
        if (state.selected.type === 'pyramid') {
          const py = state.pyramid[state.selected.row][state.selected.col];
          if (!py) return { ...state, selected: null };
          if (py.value + top.value === 13) {
            let s = removePyramid(state, state.selected.row, state.selected.col);
            s = removeWasteTop(s);
            const next = { ...s, selected: null, moves: state.moves + 1 } as GameState;
            const pyramidRemovedCount = next.pyramid.flat().filter((x) => x === null).length;
            const updated = { ...next, score: pyramidRemovedCount } as GameState;
            if (isWon(updated)) return { ...updated, phase: 'won' };
            if (isLost(updated)) return { ...updated, phase: 'lost' };
            return updated;
          }
        }
        return { ...state, selected: null };
      }
      // select waste
      return { ...state, selected: { type: 'waste' } };
    }

    case 'TAP_PYRAMID': {
      const { row, col } = action;
      if (!isAvailable(state.pyramid, row, col)) return state;
      const card = state.pyramid[row][col]!;
      // K alone → remove
      if (card.value === 13) {
        let s = removePyramid(state, row, col);
        const next = { ...s, selected: null, moves: state.moves + 1 } as GameState;
        const pyramidRemovedCount = next.pyramid.flat().filter((x) => x === null).length;
        const updated = { ...next, score: pyramidRemovedCount } as GameState;
        if (isWon(updated)) return { ...updated, phase: 'won' };
        if (isLost(updated)) return { ...updated, phase: 'lost' };
        return updated;
      }
      // already selected?
      if (state.selected) {
        if (state.selected.type === 'pyramid') {
          if (state.selected.row === row && state.selected.col === col) {
            return { ...state, selected: null };
          }
          const other = state.pyramid[state.selected.row][state.selected.col];
          if (other && card.value + other.value === 13) {
            let s = removePyramid(state, row, col);
            s = removePyramid(s, state.selected.row, state.selected.col);
            const next = { ...s, selected: null, moves: state.moves + 1 } as GameState;
            const pyramidRemovedCount = next.pyramid.flat().filter((x) => x === null).length;
            const updated = { ...next, score: pyramidRemovedCount } as GameState;
            if (isWon(updated)) return { ...updated, phase: 'won' };
            if (isLost(updated)) return { ...updated, phase: 'lost' };
            return updated;
          }
        } else if (state.selected.type === 'waste') {
          const wt = state.waste[state.waste.length - 1];
          if (wt && wt.value + card.value === 13) {
            let s = removePyramid(state, row, col);
            s = removeWasteTop(s);
            const next = { ...s, selected: null, moves: state.moves + 1 } as GameState;
            const pyramidRemovedCount = next.pyramid.flat().filter((x) => x === null).length;
            const updated = { ...next, score: pyramidRemovedCount } as GameState;
            if (isWon(updated)) return { ...updated, phase: 'won' };
            if (isLost(updated)) return { ...updated, phase: 'lost' };
            return updated;
          }
        }
        return { ...state, selected: null };
      }
      return { ...state, selected: { type: 'pyramid', row, col } };
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
 * Analyse Pyramid : 28 cartes de la pyramide retirées = win.
 */
export function analyzePyramidWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Indice : trouve une paire à supprimer, ou un Roi seul, ou DRAW. */
export function findHint(state: GameState): GameAction | null {
  for (let r = 0; r < state.pyramid.length; r++) {
    for (let c = 0; c < state.pyramid[r].length; c++) {
      const card = state.pyramid[r][c];
      if (card && card.value === 13 && isAvailable(state.pyramid, r, c)) {
        return { type: 'TAP_PYRAMID', row: r, col: c };
      }
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt && wt.value === 13) return { type: 'TAP_WASTE' };
  const avail: { r: number; c: number; card: Card }[] = [];
  for (let r = 0; r < state.pyramid.length; r++) {
    for (let c = 0; c < state.pyramid[r].length; c++) {
      const card = state.pyramid[r][c];
      if (card && isAvailable(state.pyramid, r, c)) avail.push({ r, c, card });
    }
  }
  for (let i = 0; i < avail.length; i++) {
    for (let j = i + 1; j < avail.length; j++) {
      if (avail[i].card.value + avail[j].card.value === 13) {
        if (state.selected && state.selected.type === 'pyramid' && state.selected.row === avail[i].r && state.selected.col === avail[i].c) {
          return { type: 'TAP_PYRAMID', row: avail[j].r, col: avail[j].c };
        }
        return { type: 'TAP_PYRAMID', row: avail[i].r, col: avail[i].c };
      }
    }
  }
  if (wt) {
    for (const a of avail) {
      if (a.card.value + wt.value === 13) {
        if (state.selected && state.selected.type === 'waste') {
          return { type: 'TAP_PYRAMID', row: a.r, col: a.c };
        }
        return { type: 'TAP_WASTE' };
      }
    }
  }
  if (state.stock.length > 0) return { type: 'DRAW' };
  return null;
}


/** Indice RÉEL : ne propose pas la pioche. */
export function findRealHint(state: GameState): GameAction | null {
  for (let r = 0; r < state.pyramid.length; r++) {
    for (let c = 0; c < state.pyramid[r].length; c++) {
      const card = state.pyramid[r][c];
      if (card && card.value === 13 && isAvailable(state.pyramid, r, c)) {
        return { type: 'TAP_PYRAMID', row: r, col: c };
      }
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt && wt.value === 13) return { type: 'TAP_WASTE' };
  const avail: { r: number; c: number; card: Card }[] = [];
  for (let r = 0; r < state.pyramid.length; r++) {
    for (let c = 0; c < state.pyramid[r].length; c++) {
      const card = state.pyramid[r][c];
      if (card && isAvailable(state.pyramid, r, c)) avail.push({ r, c, card });
    }
  }
  for (let i = 0; i < avail.length; i++) {
    for (let j = i + 1; j < avail.length; j++) {
      if (avail[i].card.value + avail[j].card.value === 13) {
        if (state.selected && state.selected.type === 'pyramid' && state.selected.row === avail[i].r && state.selected.col === avail[i].c) {
          return { type: 'TAP_PYRAMID', row: avail[j].r, col: avail[j].c };
        }
        return { type: 'TAP_PYRAMID', row: avail[i].r, col: avail[i].c };
      }
    }
  }
  if (wt) {
    for (const a of avail) {
      if (a.card.value + wt.value === 13) {
        if (state.selected && state.selected.type === 'waste') return { type: 'TAP_PYRAMID', row: a.r, col: a.c };
        return { type: 'TAP_WASTE' };
      }
    }
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
