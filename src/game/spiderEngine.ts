/**
 * @file spiderEngine.ts — Spider Solitaire (1/2/4 suits, 104 cards = 2 decks).
 *
 * 10 columns. Cols 1..4 = 6 cards (5 face-down + 1 face-up). Cols 5..10 = 5 cards
 * (4 face-down + 1 face-up). 50 remaining cards = 5 deals of 10.
 *
 * Tableau: descending build, ANY color (Roi → As).
 * To move a stack you must have a single-suit run.
 * 8 complete K→A runs of the same suit are auto-removed to "completed" piles.
 * Win = 8 runs completed.
 *
 * Pile rule: cannot deal if any column is empty.
 */

import { rngFromSeed } from './engines/_shuffleSeeded';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;       // unique even with 2 decks: e.g. "01-spades-0"
  faceUp: boolean;
}

export interface Column { cards: Card[] }

export type SuitMode = 1 | 2 | 4;

export interface GameState {
  tableau: Column[];      // 10 columns
  stock: Card[];          // remaining undealt
  completed: Card[][];    // each entry = a finished K→A suit (max 8)
  moves: number;
  score: number;
  phase: 'playing' | 'won';
  suitMode: SuitMode;
}

export type GameAction =
  | { type: 'DEAL_ROW' }
  | { type: 'MOVE_RUN'; fromCol: number; fromCardIndex: number; toCol: number; skipAutoComplete?: boolean }
  | { type: 'AUTO_COMPLETE' }
  | { type: 'RESET'; suitMode?: SuitMode }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const COLUMNS = 10;
export const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
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

/** Build a 104-card deck with the given number of suits used. */
export function buildDeck(suitMode: SuitMode): Card[] {
  const suits = suitMode === 1
    ? (['spades'] as Suit[])
    : suitMode === 2
      ? (['spades', 'hearts'] as Suit[])
      : ALL_SUITS;
  const reps = 104 / (suits.length * 13);
  const deck: Card[] = [];
  let counter = 0;
  for (let r = 0; r < reps; r++) {
    for (const suit of suits) {
      for (const value of VALUES) {
        deck.push({
          suit,
          value,
          id: `${value.toString().padStart(2, '0')}-${suit}-${counter++}`,
          faceUp: false,
        });
      }
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

/** Helpers pour le reverse-deal : trouver les coups valides entre colonnes.
 *
 * Stratégie hybride :
 *   - Sur cols NON-VIDES : count=1 uniquement (face-down strict OK)
 *   - Sur cols VIDES : count >= 1 autorisé (pour seeder cols à plus d'1 carte)
 *
 * Les cards déplacées par count > 1 vers col vide doivent être marquées
 * face-up dans l'état initial (sinon forward MOVE_RUN échoue).
 */
function findInverseTableauMoves(tableau: Column[]): Array<{ from: number; to: number; count: number }> {
  const moves: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from < 10; from++) {
    const src = tableau[from].cards;
    if (src.length === 0) continue;
    // Trouve la plus longue séquence mono-suit descendante en bas de src
    let seqStart = src.length - 1;
    while (
      seqStart > 0 &&
      src[seqStart - 1].suit === src[seqStart].suit &&
      src[seqStart - 1].value === src[seqStart].value + 1
    ) {
      seqStart--;
    }
    // Pour chaque count possible (1 à src.length - seqStart)
    for (let start = seqStart; start < src.length; start++) {
      const head = src[start]; // tête du slice (rang le plus haut)
      const count = src.length - start;
      // Ne pas vider entièrement la source
      if (start === 0) continue;
      for (let to = 0; to < 10; to++) {
        if (to === from) continue;
        const dst = tableau[to].cards;
        const dstTop = dst[dst.length - 1];
        if (!dstTop) {
          // Col vide accepte tout
          moves.push({ from, to, count });
        } else if (dstTop.value === head.value + 1) {
          // Col non-vide : rank+1 match
          moves.push({ from, to, count });
        }
      }
    }
  }
  return moves;
}

function applyInverseTableauMove(tableau: Column[], m: { from: number; to: number; count: number }): void {
  const moved = tableau[m.from].cards.splice(tableau[m.from].cards.length - m.count, m.count);
  tableau[m.to].cards.push(...moved);
}

/**
 * GÉNÉRATION INVERSE V2 — selon spec mathématique formelle.
 *
 * Algo :
 *   1. État GAGNANT initial : 8 fondations complètes K→A, tableau vide
 *   2. Boucle 6 PHASES (1 deal initial + 5 redeals stock) :
 *        a. UNFOUND k_i : place K..A d'une fondation sur col vide
 *        b. SPLIT-MOVES count=1 random pour brasser
 *        c. UNDEAL (phases 0..4) : pop top de chaque col → packet stock
 *   3. Marquer face-down (seul top face-up — règles Spider authentiques)
 *   4. Inverser l'historique → solution forward GARANTIE gagnante
 *
 * Invariants :
 *   - Σ k_i = 8 (toutes les fondations défaites)
 *   - 5 undeals (5 packets de 10 cartes en stock = 50 cartes)
 *   - Layout final : Σ |T_i| = 54, |Stock| = 50
 *
 * Le forward replay : DEAL_ROW (× nb undeals) + MOVE_RUN reversed + AUTO_COMPLETE
 */
function reverseDealSpider(suitMode: SuitMode): { state: GameState; solution: GameAction[] } {
  // 1. Construire 8 fondations complètes K→A
  const allowedSuits: Suit[] = suitMode === 1
    ? (['spades'] as Suit[])
    : suitMode === 2
      ? (['spades', 'hearts'] as Suit[])
      : (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]);
  const seqsPerSuit = 8 / allowedSuits.length;
  const foundations: Card[][] = [];
  let counter = 0;
  for (const suit of allowedSuits) {
    for (let i = 0; i < seqsPerSuit; i++) {
      const run: Card[] = [];
      for (let v = 13; v >= 1; v--) {
        run.push({
          suit, value: v as CardValue,
          id: `${v.toString().padStart(2, '0')}-${suit}-${counter++}`,
          faceUp: true,
        });
      }
      foundations.push(run);
    }
  }
  // Shuffle l'ordre des fondations
  for (let i = foundations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [foundations[i], foundations[j]] = [foundations[j], foundations[i]];
  }

  // 2. Tableau vide initial (état GAGNANT : 8 fondations, tableau vide)
  const tableau: Column[] = Array.from({ length: 10 }, () => ({ cards: [] }));
  const stockPackets: Card[][] = [];

  // History des coups inverses (sera reversed pour donner la solution)
  type Hist =
    | { type: 'UNFOUND'; col: number }
    | { type: 'SPLIT'; from: number; to: number; count: number }
    | { type: 'UNDEAL' };
  const history: Hist[] = [];

  // Track les card ids qui DOIVENT rester face-up (impliquées dans count > 1 lifts)
  const liftedCardIds = new Set<string>();
  const trackLift = (move: { from: number; to: number; count: number }) => {
    if (move.count > 1) {
      const src = tableau[move.from].cards;
      const slice = src.slice(src.length - move.count);
      for (const c of slice) liftedCardIds.add(c.id);
    }
  };

  // 3. Boucle 6 phases : phase 0 = TOUS les 8 unfounds + splits, phases 1-5
  //    = splits + undeal. Σ unfounds = 8, Σ undeals = 5.
  //    Mettre tous les unfounds en phase 0 garantit qu'on a 104 cartes
  //    distribuées avant de tenter les undeals (donc cols boostables à ≥2).
  const unfoundsPerPhase = [8, 0, 0, 0, 0, 0];
  let foundationIdx = 0;
  const NUM_PHASES = 6;

  const helperEmptyCol = (): number => tableau.findIndex((c) => c.cards.length === 0);

  const helperForceEmptyACol = (): boolean => {
    let attempts = 0;
    while (helperEmptyCol() === -1 && attempts < 50) {
      attempts++;
      let largestCol = 0;
      for (let i = 1; i < 10; i++) {
        if (tableau[i].cards.length > tableau[largestCol].cards.length) largestCol = i;
      }
      const moves = findInverseTableauMoves(tableau).filter((m) => m.from === largestCol);
      if (moves.length === 0) return false;
      const move = moves[Math.floor(Math.random() * moves.length)];
      trackLift(move);
      applyInverseTableauMove(tableau, move);
      history.push({ type: 'SPLIT', from: move.from, to: move.to, count: move.count });
    }
    return helperEmptyCol() !== -1;
  };

  const helperFillEmptyCols = (): boolean => {
    let attempts = 0;
    while (tableau.some((c) => c.cards.length === 0) && attempts < 80) {
      attempts++;
      const fills = findInverseTableauMoves(tableau).filter(
        (m) => tableau[m.to].cards.length === 0,
      );
      if (fills.length === 0) return false;
      const move = fills[Math.floor(Math.random() * fills.length)];
      trackLift(move);
      applyInverseTableauMove(tableau, move);
      history.push({ type: 'SPLIT', from: move.from, to: move.to, count: move.count });
    }
    return tableau.every((c) => c.cards.length > 0);
  };

  // Avant UNDEAL : assurer cols ≥ 2 (sinon post-undeal empty col casse next DEAL_ROW)
  const helperBoostColsForUndeal = (): boolean => {
    if (!helperFillEmptyCols()) return false;
    // Maintenant toutes les cols ≥ 1. On veut toutes ≥ 2.
    let attempts = 0;
    while (tableau.some((c) => c.cards.length < 2) && attempts < 200) {
      attempts++;
      // Cherche moves qui grossissent une col cible sans shrink en-dessous de 2
      const boosts = findInverseTableauMoves(tableau).filter((m) => {
        const dstSize = tableau[m.to].cards.length;
        const srcSizeAfter = tableau[m.from].cards.length - m.count;
        return dstSize < 2 && srcSizeAfter >= 2;
      });
      if (boosts.length === 0) {
        // Relax : autorise shrink à 1
        const fb = findInverseTableauMoves(tableau).filter((m) => {
          const dstSize = tableau[m.to].cards.length;
          const srcSizeAfter = tableau[m.from].cards.length - m.count;
          return dstSize < 2 && srcSizeAfter >= 1;
        });
        if (fb.length === 0) return false;
        const m = fb[Math.floor(Math.random() * fb.length)];
        trackLift(m);
        applyInverseTableauMove(tableau, m);
        history.push({ type: 'SPLIT', from: m.from, to: m.to, count: m.count });
        continue;
      }
      // Préfère count > 1 (seed plus efficace)
      const big = boosts.filter((m) => m.count >= 2);
      const pool = big.length > 0 ? big : boosts;
      const move = pool[Math.floor(Math.random() * pool.length)];
      trackLift(move);
      applyInverseTableauMove(tableau, move);
      history.push({ type: 'SPLIT', from: move.from, to: move.to, count: move.count });
    }
    return tableau.every((c) => c.cards.length >= 2);
  };

  for (let phase = 0; phase < NUM_PHASES; phase++) {
    // a. UNFOUNDS : place k_phase fondations sur cols vides
    for (let u = 0; u < unfoundsPerPhase[phase]; u++) {
      let target = helperEmptyCol();
      if (target === -1) {
        if (!helperForceEmptyACol()) break;
        target = helperEmptyCol();
        if (target === -1) break;
      }
      tableau[target].cards = foundations[foundationIdx].map((c) => ({ ...c, faceUp: true }));
      history.push({ type: 'UNFOUND', col: target });
      foundationIdx++;
    }

    // b. SPLIT-MOVES count=1 — mix biaisé pour balancer les cols vers la
    //    target shape [11,11,11,11,10,10,10,10,10,10] (pour atteindre
    //    [6,6,6,6,5,5,5,5,5,5] après 5 undeals).
    const target = [11, 11, 11, 11, 10, 10, 10, 10, 10, 10];
    const numSplits = phase === 0 ? 200 : 30; // beaucoup de mixing en phase 0
    for (let s = 0; s < numSplits; s++) {
      const moves = findInverseTableauMoves(tableau);
      if (moves.length === 0) break;
      // Bias : favoriser moves qui rapprochent les cols de la target
      const sizes = tableau.map((c) => c.cards.length);
      const sortedSizes = [...sizes].sort((a, b) => b - a);
      const isOverTarget = (i: number) => sizes[i] > sortedSizes[i] + 1;
      const isUnderTarget = (i: number) => sizes[i] < sortedSizes[i] - 1;
      const balanced = moves.filter(
        (m) =>
          (sizes[m.from] > 1 && sizes[m.to] < 11) &&
          // Préfère shrink les overs et grow les unders
          (isOverTarget(m.from) || isUnderTarget(m.to)),
      );
      const pool = balanced.length > 0 ? balanced : moves;
      const move = pool[Math.floor(Math.random() * pool.length)];
      trackLift(move);
      applyInverseTableauMove(tableau, move);
      history.push({ type: 'SPLIT', from: move.from, to: move.to, count: move.count });
    }

    // c. UNDEAL (phases 0..4 uniquement) — toutes les cols doivent avoir ≥ 2
    // pour que post-pop chaque col garde ≥ 1 (DEAL_ROW forward réussira)
    if (phase < 5) {
      if (!helperBoostColsForUndeal()) continue;
      const packet: Card[] = [];
      for (let i = 0; i < 10; i++) {
        packet.push({ ...tableau[i].cards.pop()!, faceUp: false });
      }
      stockPackets.push(packet);
      history.push({ type: 'UNDEAL' });
    }
  }

  // 4. Marquage face-down : seul le top + cartes impliquées dans count > 1
  //    lifts sont face-up. Les cartes face-down sont celles JAMAIS levées en
  //    bloc par le forward replay (donc lift count=1 OK avec flipTopOf).
  for (const col of tableau) {
    for (let i = 0; i < col.cards.length; i++) {
      const isTop = i === col.cards.length - 1;
      const isLifted = liftedCardIds.has(col.cards[i].id);
      col.cards[i] = { ...col.cards[i], faceUp: isTop || isLifted };
    }
  }

  // 5. Construire stock : packets en ordre inverse (le plus récent en tête,
  //    pour que le 1er forward DEAL_ROW lise la dernière undeal en premier)
  const stock: Card[] = [];
  for (let i = stockPackets.length - 1; i >= 0; i--) {
    stock.push(...stockPackets[i]);
  }

  const initialState: GameState = {
    tableau, stock, completed: [], moves: 0, score: 500,
    phase: 'playing', suitMode,
  };

  // 6. Construire la SOLUTION FORWARD en inversant l'historique
  const solution: GameAction[] = [];
  let simState: GameState = initialState;

  for (let h = history.length - 1; h >= 0; h--) {
    const event = history[h];
    if (event.type === 'UNDEAL') {
      const action: GameAction = { type: 'DEAL_ROW' };
      const next = gameReducer(simState, action);
      if (next === simState) {
        console.warn('[Spider Solver V2] DEAL_ROW rejeu echec');
        break;
      }
      solution.push(action);
      simState = next;
    } else if (event.type === 'SPLIT') {
      // Inverse forward = MOVE_RUN de event.to vers event.from
      const fromCol = event.to;
      const toCol = event.from;
      const colSize = simState.tableau[fromCol].cards.length;
      const fromCardIndex = colSize - event.count;
      if (fromCardIndex < 0) {
        console.warn(`[Spider Solver V2] SPLIT rejeu impossible idx ${h}`);
        break;
      }
      const action: GameAction = {
        type: 'MOVE_RUN', fromCol, fromCardIndex, toCol,
        skipAutoComplete: true,
      };
      const next = gameReducer(simState, action);
      if (next === simState) {
        console.warn(`[Spider Solver V2] MOVE_RUN rejete idx ${h}: col ${fromCol}[${fromCardIndex}]->${toCol}`);
        break;
      }
      solution.push(action);
      simState = next;
    }
    // UNFOUND n'a pas d'inverse forward — sera traite par AUTO_COMPLETE final
  }

  // 7. AUTO_COMPLETE final pour recolter les K..A
  if (simState.completed.length < 8) {
    const action: GameAction = { type: 'AUTO_COMPLETE' };
    const next = gameReducer(simState, action);
    if (next !== simState) {
      solution.push(action);
      simState = next;
    }
  }

  const tableauCount = tableau.reduce((a, c) => a + c.cards.length, 0);
  console.log(
    `[Spider Solver V2] Solution: ${solution.length} coups, ` +
    `tableau=${tableauCount}, stock=${stock.length}, packets=${stockPackets.length}, ` +
    `final completed=${simState.completed.length}/8`,
  );

  return { state: initialState, solution };
}

function dealOnce(suitMode: SuitMode): GameState {
  const deck = shuffleDeck(buildDeck(suitMode));
  const tableau: Column[] = [];
  let i = 0;
  for (let c = 0; c < COLUMNS; c++) {
    const cards: Card[] = [];
    const size = c < 4 ? 6 : 5;
    for (let r = 0; r < size; r++) {
      const card = { ...deck[i++], faceUp: r === size - 1 };
      cards.push(card);
    }
    tableau.push({ cards });
  }
  const stock = deck.slice(i).map((c) => ({ ...c, faceUp: false }));
  return { tableau, stock, completed: [], moves: 0, score: 500, phase: 'playing', suitMode };
}

/** Score d'une donne via greedy : compte les cartes face-up rendues mobiles + runs complétés. */
function spiderProgress(initial: GameState): number {
  let s = initial;
  for (let i = 0; i < 200; i++) {
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
  }
  // Score = runs complétés × 13 + cartes face-up qui n'étaient pas face-up au départ
  const completedCards = s.completed.length * 13;
  const initialFaceUp = initial.tableau.reduce((a, c) => a + c.cards.filter((x) => x.faceUp).length, 0);
  const finalFaceUp = s.tableau.reduce((a, c) => a + c.cards.filter((x) => x.faceUp).length, 0);
  return completedCards + (finalFaceUp - initialFaceUp);
}

// Solution stockée pour le hint robuste (séquence greedy depuis le deal)
let _spiderSolution: GameAction[] = [];

export function getSpiderSolution(): GameAction[] {
  return [..._spiderSolution];
}

export function setSpiderSolutionFromState(state: GameState): void {
  _spiderSolution = computeSpiderSolution(state);
}

export function setSpiderSolutionFromBD(actions: GameAction[]): void {
  _spiderSolution = [...actions];
}

function computeSpiderSolution(
  state: GameState,
  opts: { maxIter?: number; timeoutMs?: number } = {},
): GameAction[] {
  const maxIter = opts.maxIter ?? 80;
  const timeoutMs = opts.timeoutMs ?? 500;
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  const t0 = Date.now();
  for (let i = 0; i < maxIter; i++) {
    if (Date.now() - t0 > timeoutMs) break;
    const action = findHint(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
    if (s.completed.length === 8) break;
  }
  return moves;
}

/**
 * CASCADE SIMULATOR : reproduit la logique de la cascade hint runtime
 * (productive → DEAL_ROW → endgame solver → coup de secours). Si elle
 * gagne, le deal est garanti solvable par le bouton indice.
 *
 * → ORACLE de solvabilité PRÉCIS pour notre flux runtime.
 */
function simulateCascade(state: GameState, maxMoves = 400, totalTimeoutMs = 1500): GameAction[] | null {
  const tStart = Date.now();
  const path: GameAction[] = [];
  const visited = new Set<string>();
  let s = state;
  visited.add(hashStateCycle(s));

  // Productive : lookahead 2 (révèle face-down OU complète run)
  const isProductive = (before: GameState, after: GameState): boolean => {
    if (after.completed.length > before.completed.length) return true;
    // face-down comptées ?
    let beforeFaceDown = 0, afterFaceDown = 0;
    for (const col of before.tableau) for (const c of col.cards) if (!c.faceUp) beforeFaceDown++;
    for (const col of after.tableau) for (const c of col.cards) if (!c.faceUp) afterFaceDown++;
    return afterFaceDown < beforeFaceDown;
  };

  const findProductive = (cur: GameState): GameAction | null => {
    const moves = collectAllMoves(cur);
    // Niveau 1
    for (const m of moves) {
      const next = gameReducer(cur, m);
      if (next === cur) continue;
      if (visited.has(hashStateCycle(next))) continue;
      if (isProductive(cur, next)) return m;
    }
    // Niveau 2
    for (const m of moves) {
      const next = gameReducer(cur, m);
      if (next === cur) continue;
      if (visited.has(hashStateCycle(next))) continue;
      const subMoves = collectAllMoves(next).slice(0, 30);
      for (const sub of subMoves) {
        const next2 = gameReducer(next, sub);
        if (next2 === next) continue;
        if (isProductive(next, next2)) return m;
      }
    }
    return null;
  };

  const findEndgame = (cur: GameState, timeLimit: number): GameAction | null => {
    if (cur.completed.length < 5) return null;
    const tStart = Date.now();
    const target = cur.completed.length + 1;
    type Beam = { st: GameState; first: GameAction; depth: number };
    const seen = new Set<string>();
    for (const h of visited) seen.add(h);
    let beams: Beam[] = collectAllMoves(cur)
      .map((m) => ({ next: gameReducer(cur, m), m }))
      .filter((x) => x.next !== cur && !seen.has(hashStateCycle(x.next)))
      .map((x) => ({ st: x.next, first: x.m, depth: 1 }));
    while (beams.length > 0) {
      if (Date.now() - tStart > timeLimit) break;
      for (const b of beams) {
        if (b.st.completed.length >= target) return b.first;
      }
      const next: Beam[] = [];
      for (const b of beams) {
        if (b.depth >= 30) continue;
        const moves = collectAllMoves(b.st);
        for (const m of moves) {
          const ns = gameReducer(b.st, m);
          if (ns === b.st) continue;
          const h = hashStateCycle(ns);
          if (seen.has(h)) continue;
          seen.add(h);
          next.push({ st: ns, first: b.first, depth: b.depth + 1 });
        }
      }
      if (next.length === 0) break;
      next.sort((a, b) => {
        const ca = (a.st.completed?.length ?? 0) - (b.st.completed?.length ?? 0);
        if (ca !== 0) return -ca;
        return staticEval(b.st) - staticEval(a.st);
      });
      beams = next.slice(0, 80);
    }
    return null;
  };

  for (let i = 0; i < maxMoves; i++) {
    if (Date.now() - tStart > totalTimeoutMs) return null;
    if (s.completed.length === 8) return path;

    let action: GameAction | null = findProductive(s);

    if (!action && s.stock.length >= COLUMNS && !s.tableau.some((c) => c.cards.length === 0)) {
      action = { type: 'DEAL_ROW' };
    }

    if (!action) {
      action = findEndgame(s, 200);
    }

    if (!action) {
      const moves = collectAllMoves(s);
      for (const m of moves) {
        const next = gameReducer(s, m);
        if (next === s) continue;
        if (!visited.has(hashStateCycle(next))) {
          action = m;
          break;
        }
      }
    }

    if (!action) return null;

    const next = gameReducer(s, action);
    if (next === s) return null;
    s = next;
    visited.add(hashStateCycle(s));
    path.push(action);
  }
  return s.completed.length === 8 ? path : null;
}

/**
 * BEAM SEARCH : exploration parallèle de N chemins simultanés. À chaque étape,
 * on garde les BEAM_WIDTH meilleurs états (par staticEval) et on les expand.
 * Beaucoup plus puissant que greedy pour Spider — trouve des chemins gagnants
 * que le greedy rate.
 */
function beamSearchSolve(
  state: GameState,
  opts: { beamWidth: number; maxDepth: number; timeoutMs: number },
): GameAction[] {
  const t0 = Date.now();
  type Beam = { state: GameState; path: GameAction[]; score: number };
  let beams: Beam[] = [{ state, path: [], score: staticEval(state) }];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let bestWin: GameAction[] | null = null;

  for (let depth = 0; depth < opts.maxDepth; depth++) {
    if (Date.now() - t0 > opts.timeoutMs) break;
    const candidates: Beam[] = [];

    for (const beam of beams) {
      if (beam.state.completed.length === 8) {
        if (!bestWin || beam.path.length < bestWin.length) bestWin = beam.path;
        continue;
      }
      // Énumère tous les coups MOVE_RUN
      const moves = collectAllMoves(beam.state);
      // Ajoute DEAL_ROW si possible
      if (
        beam.state.stock.length >= COLUMNS &&
        !beam.state.tableau.some((c) => c.cards.length === 0)
      ) {
        moves.push({ type: 'DEAL_ROW' });
      }
      for (const m of moves) {
        const next = gameReducer(beam.state, m);
        if (next === beam.state) continue;
        const hash = hashStateCycle(next);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        candidates.push({
          state: next,
          path: [...beam.path, m],
          score: staticEval(next),
        });
      }
    }

    if (candidates.length === 0) break;
    if (bestWin) break;

    // Garde les top-N meilleurs candidats
    candidates.sort((a, b) => b.score - a.score);
    beams = candidates.slice(0, opts.beamWidth);
  }

  // Vérifie une dernière fois si un beam a gagné
  if (!bestWin) {
    for (const beam of beams) {
      if (beam.state.completed.length === 8) {
        if (!bestWin || beam.path.length < bestWin.length) bestWin = beam.path;
      }
    }
  }
  return bestWin ?? [];
}

/**
 * Solveur stochastique : plusieurs trials avec randomisation parmi les top-K
 * moves. Beaucoup plus robuste que le greedy strict pour les donnes Spider.
 */
function stochasticSolve(
  state: GameState,
  opts: { trials: number; perTrialIter: number; totalTimeoutMs: number },
): GameAction[] {
  const t0 = Date.now();
  for (let trial = 0; trial < opts.trials; trial++) {
    if (Date.now() - t0 > opts.totalTimeoutMs) break;
    const path = singleStochasticRun(state, opts.perTrialIter, trial);
    // Vérifie victoire
    let s = state;
    let won = false;
    for (const a of path) {
      const next = gameReducer(s, a);
      if (next === s) break;
      s = next;
      if (s.completed.length === 8) { won = true; break; }
    }
    if (won) return path;
  }
  return [];
}

/** Une exécution greedy avec randomisation parmi les top-K moves. */
function singleStochasticRun(
  state: GameState,
  maxIter: number,
  trialSeed: number,
): GameAction[] {
  const moves: GameAction[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(state));
  let s = state;
  // Randomness simple basé sur trialSeed
  let rng = trialSeed * 9301 + 49297;
  const next01 = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  const TOP_K = 4;

  for (let i = 0; i < maxIter; i++) {
    if (s.completed.length === 8) break;
    // Énumère les coups + score lookahead 1
    const candidates = collectAllMoves(s)
      .map((m) => {
        const next = gameReducer(s, m);
        if (next === s) return null;
        return { m, next, score: staticEval(next) };
      })
      .filter((x): x is { m: GameAction; next: GameState; score: number } => x !== null);

    // Ajoute DEAL_ROW si possible
    if (s.stock.length >= COLUMNS && !s.tableau.some((c) => c.cards.length === 0)) {
      const dealNext = gameReducer(s, { type: 'DEAL_ROW' });
      if (dealNext !== s) {
        candidates.push({ m: { type: 'DEAL_ROW' }, next: dealNext, score: staticEval(dealNext) });
      }
    }

    if (candidates.length === 0) break;
    // Tri décroissant par score
    candidates.sort((a, b) => b.score - a.score);
    // Filtre cycles
    const fresh = candidates.filter((c) => !seenHashes.has(hashStateCycle(c.next)));
    if (fresh.length === 0) break;

    // Pick parmi top-K (avec randomisation)
    const pool = fresh.slice(0, Math.min(TOP_K, fresh.length));
    const pick = trial0Bias(pool, next01);
    seenHashes.add(hashStateCycle(pick.next));
    moves.push(pick.m);
    s = pick.next;
  }
  return moves;
}

/**
 * Trial 0 = greedy strict (top-1). Trials 1+ = randomisation parmi top-K.
 * Aide à explorer des chemins alternatifs.
 */
function trial0Bias<T extends { score: number }>(
  pool: T[],
  rand01: () => number,
): T {
  if (pool.length === 1) return pool[0];
  // 60% top, 40% randomisé parmi top-K
  if (rand01() < 0.6) return pool[0];
  return pool[Math.floor(rand01() * pool.length)];
}

/**
 * Tente plusieurs donnes random `dealOnce` jusqu'à en trouver une dont le
 * solveur stochastique mène à la victoire. Sinon retourne null.
 */
function findSolvableRandomDeal(
  suitMode: SuitMode,
  maxAttempts: number,
  perAttemptTimeoutMs: number,
): { state: GameState; solution: GameAction[] } | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = dealOnce(suitMode);
    const solution = stochasticSolve(candidate, {
      trials: 30,
      perTrialIter: 800,
      totalTimeoutMs: perAttemptTimeoutMs,
    });
    if (solution.length > 0) {
      // Re-vérifie victoire (paranoia)
      let s = candidate;
      let won = false;
      for (const action of solution) {
        const next = gameReducer(s, action);
        if (next === s) break;
        s = next;
        if (s.completed.length === 8) { won = true; break; }
      }
      if (won) return { state: candidate, solution };
    }
  }
  return null;
}

/** Hash rapide d'un GameState Spider — 32-bit FNV, pas de JSON.stringify. */
function hashStateCycle(s: any): string {
  let h = 2166136261;
  // Hash juste les positions de cartes (pas moves/score/phase)
  if (s?.tableau) {
    for (const col of s.tableau) {
      for (const c of col.cards) {
        h ^= (c.value * 31 + c.suit.charCodeAt(0) + (c.faceUp ? 100 : 0));
        h = Math.imul(h, 16777619);
      }
      h ^= 255; // séparateur de colonne
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.stock) {
    h ^= s.stock.length;
    h = Math.imul(h, 16777619);
  }
  if (s?.completed) {
    h ^= s.completed.length * 1000;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * État placeholder VIDE (10 cols vides, stock vide, completed=[]). À utiliser
 * comme état initial quand on sait que `LOAD_FROM_BD` va override juste après
 * (mode BD), pour éviter de lancer le solveur V2 coûteux pour rien.
 */
export function createEmptyPlaceholderState(suitMode: SuitMode = 4): GameState {
  return {
    tableau: Array.from({ length: 10 }, () => ({ cards: [] })),
    stock: [],
    completed: [],
    moves: 0,
    score: 500,
    phase: 'playing',
    suitMode,
  };
}

export function createInitialState(suitMode: SuitMode = 4, seed?: number | string | null): GameState {
  const _rng = rngFromSeed(seed);
  const _origRandom = Math.random;
  Math.random = _rng;
  try {
    const __t0 = Date.now();

    // STRATÉGIE : DONNE RANDOM AUTHENTIQUE + ORACLE CASCADE
    //   1. Génère un dealOnce random (visuel mélangé : pas de patterns K..A)
    //   2. Simule la CASCADE complète (productive → DEAL_ROW → endgame solver
    //      → coup de secours). Si elle gagne, le deal est SOLUBLE PAR LE
    //      BOUTON INDICE (puisque le bouton utilise la même cascade).
    //   3. Si oui → on stocke la solution complète, garantie victoire au hint
    //   4. Sinon → on retente avec une nouvelle donne random (jusqu'à N essais)
    //   5. En dernier recours → fallback V2 (rare, garantie absolue de solvabilité)
    //
    // PRIORITÉ AU RANDOM : pour 1-suit, on tente 20× avant V2 (quasi 100%
    //   solvable au random + visuel propre). Pour 4-suit, V2 plus probable
    //   car la solvabilité au random est plus faible.

    const MAX_ATTEMPTS = suitMode === 1 ? 30 : suitMode === 2 ? 20 : 12;
    const cascadeTimeout = suitMode === 1 ? 1200 : suitMode === 2 ? 1500 : 2000;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = dealOnce(suitMode);
      const solution = simulateCascade(candidate, 500, cascadeTimeout);
      if (solution !== null) {
        // Re-vérification stricte
        let s = candidate;
        let won = false;
        for (const action of solution) {
          const next = gameReducer(s, action);
          if (next === s) break;
          s = next;
          if (s.completed.length === 8) { won = true; break; }
        }
        if (won) {
          _spiderSolution = solution;
          const __elapsed = Date.now() - __t0;
          console.log(
            `[Spider Solver] ✅ DONNE RANDOM SOLUBLE (${__elapsed}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}, suitMode=${suitMode}) — stock=${candidate.stock.length}, solution=${solution.length} coups via cascade`,
          );
          return candidate;
        }
      }
    }

    // Tentative finale : stochasticSolve sur une donne random (puissance plus forte)
    console.log(`[Spider Solver] ⚠️ Cascade a échoué ${MAX_ATTEMPTS}× — tentative stochasticSolve`);
    const stochResult = findSolvableRandomDeal(suitMode, 6, 400);
    if (stochResult) {
      _spiderSolution = stochResult.solution;
      const __elapsed = Date.now() - __t0;
      console.log(
        `[Spider Solver] ✅ DONNE STOCHASTIC SOLUBLE (${__elapsed}ms) — stock=${stochResult.state.stock.length}, solution=${stochResult.solution.length}`,
      );
      return stochResult.state;
    }

    // Fallback V2 (très rare) : garantie absolue de solvabilité
    console.log(`[Spider Solver] ⚠️ Tous oracles ont échoué — fallback V2 (visuellement plus simple)`);
    const { state, solution } = reverseDealSpider(suitMode);
    _spiderSolution = solution;
    const __elapsed = Date.now() - __t0;
    console.log(
      `[Spider Solver] ✅ DONNE FALLBACK V2 SOLUBLE (${__elapsed}ms) — stock=${state.stock.length}, solution=${solution.length}`,
    );
    return state;
  } finally {
    Math.random = _origRandom;
  }
}

/** Check if a contiguous slice of cards forms a "single-suit descending run". */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].faceUp) return false;
    if (i > 0) {
      const prev = cards[i - 1];
      const cur = cards[i];
      if (prev.suit !== cur.suit) return false;
      if (cur.value !== prev.value - 1) return false;
    }
  }
  return true;
}

/** Anything goes for stacking on tableau (only top card check). */
export function canPlaceTop(card: Card, top: Card | null): boolean {
  if (!top) return true; // empty column accepts anything
  return card.value === top.value - 1;
}

function flipTopOf(col: Column): Column {
  if (col.cards.length === 0) return col;
  const cards = col.cards.map((c, i, a) =>
    i === a.length - 1 ? { ...c, faceUp: true } : c,
  );
  return { cards };
}

function detectCompletedRun(col: Column): { remaining: Column; completed: Card[] } | null {
  // A completed run = K..A same suit, all face up at the bottom.
  if (col.cards.length < 13) return null;
  const slice = col.cards.slice(-13);
  if (slice[0].value !== 13) return null;
  if (!isValidRun(slice)) return null;
  return {
    remaining: { cards: col.cards.slice(0, -13) },
    completed: slice,
  };
}

export function isWon(state: GameState): boolean {
  return state.completed.length >= 8;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET':
      return createInitialState(action.suitMode ?? state.suitMode);

    case 'LOAD_FROM_BD':
      return action.state;

    case 'DEAL_ROW': {
      // Cannot deal if any column is empty.
      if (state.tableau.some((c) => c.cards.length === 0)) return state;
      if (state.stock.length < COLUMNS) return state;
      const tableau = state.tableau.map((c, i) => ({
        cards: [...c.cards, { ...state.stock[i], faceUp: true }],
      }));
      const stock = state.stock.slice(COLUMNS);
      return { ...state, tableau, stock, moves: state.moves + 1 };
    }

    case 'MOVE_RUN': {
      const { fromCol, fromCardIndex, toCol, skipAutoComplete } = action;
      if (fromCol === toCol) return state;
      const src = state.tableau[fromCol];
      if (fromCardIndex < 0 || fromCardIndex >= src.cards.length) return state;
      const moving = src.cards.slice(fromCardIndex);
      if (!isValidRun(moving)) return state;
      const dest = state.tableau[toCol];
      const top = dest.cards[dest.cards.length - 1];
      if (top && !canPlaceTop(moving[0], top)) return state;

      let nextSrc: Column = { cards: src.cards.slice(0, fromCardIndex) };
      nextSrc = flipTopOf(nextSrc);
      let nextDest: Column = { cards: [...dest.cards, ...moving] };

      // After move, check if dest now has a finished run to remove.
      // SKIP detection si skipAutoComplete=true (utilisé par la solution
      // précalculée pour éviter qu'un run K..A reformé mid-rejeu n'empty une
      // col et casse les coups suivants).
      const completedCheck = skipAutoComplete ? null : detectCompletedRun(nextDest);
      let completed = state.completed;
      if (completedCheck) {
        nextDest = completedCheck.remaining;
        completed = [...completed, completedCheck.completed];
      }

      const tableau = state.tableau.map((c, i) =>
        i === fromCol ? nextSrc : i === toCol ? nextDest : c,
      );
      const next = {
        ...state,
        tableau,
        completed,
        moves: state.moves + 1,
        score: state.score - 1 + (completedCheck ? 100 : 0),
      };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'AUTO_COMPLETE': {
      // Scan all columns repeatedly. CRITIQUE : on flippe TOUTES les cartes
      // face-up avant la détection (AUTO_COMPLETE est l'action de finalisation
      // — quand elle est invoquée, la donne est censée être quasi-gagnée et
      // les face-down restants sont juste une artefact de la solution rejeu).
      let tableau = state.tableau.map((c) => ({
        cards: c.cards.map((card) => ({ ...card, faceUp: true })),
      }));
      let completed = state.completed;
      let changed = true;
      let iter = 0;
      while (changed && iter < 16) {
        iter++;
        changed = false;
        for (let i = 0; i < tableau.length; i++) {
          const check = detectCompletedRun(tableau[i]);
          if (check) {
            tableau = tableau.map((c, j) =>
              j === i ? flipTopOf(check.remaining) : c,
            );
            completed = [...completed, check.completed];
            changed = true;
          }
        }
      }
      if (completed === state.completed) return state;
      const next = {
        ...state,
        tableau,
        completed,
        moves: state.moves + 1,
        score: state.score + (completed.length - state.completed.length) * 100,
      };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    default:
      return state;
  }
}

/**
 * Évaluation statique d'un état Spider — plus la valeur est élevée, mieux c'est.
 *
 * Critères :
 *   - Runs complétés × 100000 (cible principale)
 *   - Colonnes vides × 1000 (slots libres = grande flexibilité)
 *   - Cartes face-up exposées × 50
 *   - Suite descendante même couleur en bas : runLen²×10 (QUADRATIQUE → favorise
 *     fortement la consolidation : 1 run de 6 (360) > 2 runs de 3 (180))
 */
function staticEval(state: GameState): number {
  let score = 0;
  score += state.completed.length * 100000;
  for (const col of state.tableau) {
    if (col.cards.length === 0) {
      score += 1000;
      continue;
    }
    let faceUps = 0;
    for (const c of col.cards) if (c.faceUp) faceUps++;
    score += faceUps * 50;
    // Suite descendante même couleur en bas de colonne (quadratique)
    let runLen = 1;
    for (let i = col.cards.length - 1; i > 0; i--) {
      const cur = col.cards[i];
      const prev = col.cards[i - 1];
      if (!cur.faceUp || !prev.faceUp) break;
      if (prev.value === cur.value + 1 && prev.suit === cur.suit) runLen++;
      else break;
    }
    score += runLen * runLen * 10;
  }
  return score;
}

/** Énumère TOUS les coups MOVE_RUN légaux depuis un état. */
function collectAllMoves(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      const moving = src.slice(i);
      if (!isValidRun(moving)) continue;
      const head = moving[0];
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        const dest = state.tableau[to].cards;
        const top = dest[dest.length - 1];
        if (!top || canPlaceTop(head, top)) {
          if (i === 0 && !top) continue;  // ne pas déplacer une colonne vide vers une autre vide
          moves.push({ type: 'MOVE_RUN', fromCol: from, fromCardIndex: i, toCol: to });
        }
      }
    }
  }
  return moves;
}

/**
 * Indice intelligent avec 2-STEP LOOKAHEAD + AVOID set anti-cycle.
 *
 * RÈGLE STRICTE :
 *   - Ne propose un coup MOVE_RUN QUE s'il améliore STRICTEMENT l'eval
 *   - Sinon → DEAL_ROW (distribue de nouvelles cartes du stock)
 *   - Sinon → null (vraiment bloqué : pas de stock, plus de coup utile)
 *
 * Cette règle élimine les cycles : un coup neutre (M puis M') a eval identique
 * et est donc REFUSÉ → on déclenche un DEAL_ROW automatique.
 *
 * @param avoid : signatures d'actions à éviter (cycles récents).
 */
export function findHint(state: GameState, avoid?: Set<string>): GameAction | null {
  const currentEval = staticEval(state);
  const moves = collectAllMoves(state);

  let bestMove: GameAction | null = null;
  let bestLookahead = currentEval;   // STRICT : on cherche > current

  for (const m of moves) {
    if (avoid && avoid.has(JSON.stringify(m))) continue;
    const next = gameReducer(state, m);
    if (next === state) continue;
    const evalNext = staticEval(next);
    let bestSecond = evalNext;
    const movesNext = collectAllMoves(next);
    for (const m2 of movesNext) {
      const next2 = gameReducer(next, m2);
      if (next2 === next) continue;
      const eval2 = staticEval(next2);
      if (eval2 > bestSecond) bestSecond = eval2;
    }
    if (bestSecond > bestLookahead) {
      bestLookahead = bestSecond;
      bestMove = m;
    }
  }

  // 1) Coup STRICTEMENT progressif trouvé
  if (bestMove) return bestMove;

  // 2) Aucun coup ne progresse → DEAL_ROW pour relancer (priorité haute)
  if (state.stock.length >= COLUMNS && !state.tableau.some((c) => c.cards.length === 0)) {
    return { type: 'DEAL_ROW' };
  }

  // 3) Pas de stock + pas de coup progressif → vraiment bloqué
  return null;
}


/** Détection de blocage : stock vide (ou col vide) + aucun coup réel possible. */
export function isStuck(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  // Si on peut encore distribuer (stock suffisant + pas de col vide), pas stuck
  if (state.stock.length >= COLUMNS && !state.tableau.some((c) => c.cards.length === 0)) return false;
  return findRealHint(state) === null;
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
 * Analyse Spider : 8 runs complets de 13 = 104 cartes en `completed` = win.
 */
export function analyzeSpiderWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.completed && state.completed.length === 8) return { kind: 'already-won' };
  // ULTRA-RAPIDE : on vérifie juste qu'un coup existe (sans lookahead).
  // Le bouton 💡 utilisera findHint avec lookahead complet quand l'utilisateur clique.
  const hasMove = collectAllMoves(state).length > 0;
  if (!hasMove) {
    if (state.stock.length >= COLUMNS && !state.tableau.some((c) => c.cards.length === 0)) {
      return { kind: 'winning', action: { type: 'DEAL_ROW' } };
    }
    return { kind: 'proven-lost' };
  }
  // Action proposée pour le badge "winning" : le 1er coup légal (suffit pour le badge)
  return { kind: 'winning', action: collectAllMoves(state)[0] };
}

/** Indice RÉEL (sans pioche/deal). Retourne null si seul DRAW est possible.
  */
export function findRealHint(state: GameState): GameAction | null {
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    for (let i = 0; i < src.length; i++) {
      if (!src[i].faceUp) continue;
      const moving = src.slice(i);
      if (!isValidRun(moving)) continue;
      const head = moving[0];
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        const dest = state.tableau[to].cards;
        const top = dest[dest.length - 1];
        if (!top || canPlaceTop(head, top)) {
          if (i === 0 && !top) continue;
          return { type: 'MOVE_RUN', fromCol: from, fromCardIndex: i, toCol: to };
        }
      }
    }
  }
  if (state.stock.length >= COLUMNS && !state.tableau.some((c) => c.cards.length === 0)) {
    return { type: 'DEAL_ROW' };
  }
  return null;
}


/** Détection JEU IMPOSSIBLE : stock vide + aucun coup réel possible. */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.stock && state.stock.length > 0) return false;
  return findRealHint ? findRealHint(state) === null : findHint(state) === null;
}
