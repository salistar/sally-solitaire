/**
 * @file freecellEngine.ts — FreeCell Solitaire (52 cards, 1 deck).
 *
 * Layout:
 *  - 8 tableau columns (cols 1-4: 7 cards, cols 5-8: 6 cards). All face-up.
 *  - 4 free cells (1 card each).
 *  - 4 foundations (suit-dedicated, A → K).
 *
 * Tableau build: descending + alternating color (red/black).
 * Multi-card move limit: (free_cells + 1) * 2^(empty_columns) cards.
 *
 * ~99.999% of deals are solvable — pure skill game.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardColor = 'red' | 'black';

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;
  faceUp: true; // always face-up in FreeCell
}

export interface Column { cards: Card[] }
export interface FoundationPile { suit: Suit; cards: Card[] }
export type FreeCell = Card | null;

export interface GameState {
  tableau: Column[];          // 8 columns
  freeCells: FreeCell[];      // 4 cells
  foundations: FoundationPile[];  // 4 piles
  moves: number;
  score: number;
  phase: 'playing' | 'won';
}

export type GameAction =
  | { type: 'MOVE_CARD'; cardId: string; toType: 'tableau' | 'freecell' | 'foundation'; toIndex: number }
  | { type: 'AUTO_TO_FOUNDATIONS' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

export const COLUMNS = 8;
export const FREE_CELLS = 4;
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const SUIT_COLOR: Record<Suit, CardColor> = {
  spades: 'black', clubs: 'black',
  hearts: 'red',   diamonds: 'red',
};

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

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        suit,
        value,
        id: `${value.toString().padStart(2, '0')}-${suit}`,
        faceUp: true,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dealOnce(): GameState {
  const deck = shuffleDeck(buildDeck());
  const tableau: Column[] = Array.from({ length: COLUMNS }, () => ({ cards: [] }));
  for (let i = 0; i < deck.length; i++) {
    tableau[i % COLUMNS].cards.push(deck[i]);
  }
  return {
    tableau,
    freeCells: Array(FREE_CELLS).fill(null),
    foundations: SUITS.map((s) => ({ suit: s, cards: [] })),
    moves: 0,
    score: 0,
    phase: 'playing',
  };
}

/**
 * FreeCell est ~99.999% soluble (Microsoft FreeCell : 1 deal sur ~32 000 est insoluble).
 * Pas besoin de solveur : on deal et on lance.
 */
function freecellProgress(_initial: GameState): number {
  // Conservé pour compat éventuelle ; FreeCell n'a pas vraiment besoin de greedy
  // car presque tous les deals sont solubles.
  return 52;
}

/**
 * REVERSE-DEAL FreeCell — donne GARANTIE soluble + SOLUTION FORWARD ENREGISTRÉE.
 *
 * On track l'historique des coups inverses (F↔T, F↔FC, T↔T, T↔FC, FC↔T).
 * En inversant cette histoire on obtient une SOLUTION FORWARD GARANTIE GAGNANTE
 * (sans dépendre du greedy faible). Cela évite les "solutions de 8 coups" qui
 * laissent la donne bloquée à 7/52 cartes en fondation.
 *
 * 8 colonnes, 4 cellules libres, pas de stock. Toutes cartes face-up.
 */
type FreeCellInvHist =
  | { type: 'F_TO_T'; from: number; to: number; cardId: string }
  | { type: 'F_TO_FC'; from: number; cellIdx: number; cardId: string }
  | { type: 'T_TO_T'; from: number; to: number; cardId: string }
  | { type: 'T_TO_FC'; from: number; cellIdx: number; cardId: string }
  | { type: 'FC_TO_T'; cellIdx: number; to: number; cardId: string };

function reverseDealFreeCell(): { state: GameState; solution: GameAction[] } {
  // 1. État gagné : 4 fondations complètes, tableau vide, freecells vides
  const tableau: Column[] = Array.from({ length: COLUMNS }, () => ({ cards: [] }));
  const freeCells: FreeCell[] = Array(FREE_CELLS).fill(null);
  const foundations: FoundationPile[] = SUITS.map((s) => {
    const cards: Card[] = [];
    for (let v = 1 as CardValue; v <= 13; v = (v + 1) as CardValue) {
      cards.push({ suit: s, value: v, id: `${v.toString().padStart(2, '0')}-${s}`, faceUp: true });
    }
    return { suit: s, cards };
  });
  const history: FreeCellInvHist[] = [];

  // 2. Coups inverses : F→T, F→FreeCell, T→T, T→FreeCell, FreeCell→T
  const NUM_INVERSE = 200;
  for (let step = 0; step < NUM_INVERSE; step++) {
    type InvMove =
      | { type: 'F_TO_T'; from: number; to: number }
      | { type: 'F_TO_FC'; from: number; cellIdx: number }
      | { type: 'T_TO_T'; from: number; to: number }
      | { type: 'T_TO_FC'; from: number; cellIdx: number }
      | { type: 'FC_TO_T'; cellIdx: number; to: number };

    const moves: InvMove[] = [];

    for (let f = 0; f < 4; f++) {
      const fp = foundations[f];
      if (fp.cards.length === 0) continue;
      const card = fp.cards[fp.cards.length - 1];
      // F → T (col vide ou top compatible)
      for (let to = 0; to < COLUMNS; to++) {
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top) moves.push({ type: 'F_TO_T', from: f, to });
        else if (canStackOnTableau(card, top)) moves.push({ type: 'F_TO_T', from: f, to });
      }
      // F → FreeCell vide
      const emptyCell = freeCells.findIndex((c) => c === null);
      if (emptyCell >= 0) moves.push({ type: 'F_TO_FC', from: f, cellIdx: emptyCell });
    }

    // T → T
    for (let from = 0; from < COLUMNS; from++) {
      const src = tableau[from].cards;
      if (src.length === 0) continue;
      const head = src[src.length - 1];
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from) continue;
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top) moves.push({ type: 'T_TO_T', from, to });
        else if (canStackOnTableau(head, top)) moves.push({ type: 'T_TO_T', from, to });
      }
      // T → FreeCell vide
      const emptyCell = freeCells.findIndex((c) => c === null);
      if (emptyCell >= 0) moves.push({ type: 'T_TO_FC', from, cellIdx: emptyCell });
    }

    // FreeCell → T
    for (let i = 0; i < FREE_CELLS; i++) {
      if (!freeCells[i]) continue;
      const card = freeCells[i]!;
      for (let to = 0; to < COLUMNS; to++) {
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top) moves.push({ type: 'FC_TO_T', cellIdx: i, to });
        else if (canStackOnTableau(card, top)) moves.push({ type: 'FC_TO_T', cellIdx: i, to });
      }
    }

    if (moves.length === 0) break;
    const progress = step / NUM_INVERSE;
    const tableauTotal = tableau.reduce((a, c) => a + c.cards.length, 0);
    const tableauDeficit = Math.max(0, 52 - tableauTotal);
    const weights = moves.map((m) => {
      switch (m.type) {
        case 'F_TO_T': return 5 + tableauDeficit * 0.3;
        case 'F_TO_FC': return 0.5;
        case 'T_TO_T': return 1.5 + 1.5 * progress;
        case 'T_TO_FC': return 0.4;
        case 'FC_TO_T': return 2.0;
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
        const card = foundations[chosen.from].cards.pop()!;
        tableau[chosen.to].cards.push(card);
        history.push({ type: 'F_TO_T', from: chosen.from, to: chosen.to, cardId: card.id });
        break;
      }
      case 'F_TO_FC': {
        const card = foundations[chosen.from].cards.pop()!;
        freeCells[chosen.cellIdx] = card;
        history.push({ type: 'F_TO_FC', from: chosen.from, cellIdx: chosen.cellIdx, cardId: card.id });
        break;
      }
      case 'T_TO_T': {
        const card = tableau[chosen.from].cards.pop()!;
        tableau[chosen.to].cards.push(card);
        history.push({ type: 'T_TO_T', from: chosen.from, to: chosen.to, cardId: card.id });
        break;
      }
      case 'T_TO_FC': {
        const card = tableau[chosen.from].cards.pop()!;
        freeCells[chosen.cellIdx] = card;
        history.push({ type: 'T_TO_FC', from: chosen.from, cellIdx: chosen.cellIdx, cardId: card.id });
        break;
      }
      case 'FC_TO_T': {
        const card = freeCells[chosen.cellIdx]!;
        freeCells[chosen.cellIdx] = null;
        tableau[chosen.to].cards.push(card);
        history.push({ type: 'FC_TO_T', cellIdx: chosen.cellIdx, to: chosen.to, cardId: card.id });
        break;
      }
    }
  }

  // 3. Évacuer les freecells dans le tableau (le deal initial doit avoir freecells vides)
  // On ajoute aussi des entrées d'historique "FC_TO_T_EVAC" : leur inverse forward
  // sera T→FC dans la solution → utile.
  const evacHistory: FreeCellInvHist[] = [];
  for (let i = 0; i < FREE_CELLS; i++) {
    if (freeCells[i]) {
      let best = 0;
      let bestLen = Infinity;
      for (let to = 0; to < COLUMNS; to++) {
        if (tableau[to].cards.length < bestLen) { best = to; bestLen = tableau[to].cards.length; }
      }
      const card = freeCells[i]!;
      tableau[best].cards.push(card);
      evacHistory.push({ type: 'FC_TO_T', cellIdx: i, to: best, cardId: card.id });
      freeCells[i] = null;
    }
  }
  // Évacuations à la FIN de l'historique inverse → seront les PREMIÈRES actions
  // forward (T→FC) dans la solution.
  for (const h of evacHistory) history.push(h);

  const initialState: GameState = {
    tableau,
    freeCells,
    foundations,
    moves: 0,
    score: 0,
    phase: 'playing',
  };

  // 4. Construire la SOLUTION FORWARD en inversant l'historique.
  //    Action publique du moteur : MOVE_CARD { cardId, toType, toIndex }.
  //    Le moteur trouve la carte par ID — pas besoin de spécifier l'origine.
  //
  //    Inverse F_TO_T (carte X de fond[from] → col[to]) → forward T→F : MOVE_CARD X → foundation[from].
  //    Inverse F_TO_FC (carte X de fond[from] → cell[cellIdx]) → forward FC→F : MOVE_CARD X → foundation[from].
  //    Inverse T_TO_T (carte X de col[from] → col[to]) → forward T→T : MOVE_CARD X → tableau[from].
  //    Inverse T_TO_FC (carte X de col[from] → cell[cellIdx]) → forward FC→T : MOVE_CARD X → tableau[from].
  //    Inverse FC_TO_T (carte X de cell[cellIdx] → col[to]) → forward T→FC : MOVE_CARD X → freecell[cellIdx].
  const solution: GameAction[] = [];
  let simState: GameState = initialState;

  for (let h = history.length - 1; h >= 0; h--) {
    const event = history[h];
    let action: GameAction | null = null;

    if (event.type === 'F_TO_T') {
      action = { type: 'MOVE_CARD', cardId: event.cardId, toType: 'foundation', toIndex: event.from };
    } else if (event.type === 'F_TO_FC') {
      action = { type: 'MOVE_CARD', cardId: event.cardId, toType: 'foundation', toIndex: event.from };
    } else if (event.type === 'T_TO_T') {
      action = { type: 'MOVE_CARD', cardId: event.cardId, toType: 'tableau', toIndex: event.from };
    } else if (event.type === 'T_TO_FC') {
      action = { type: 'MOVE_CARD', cardId: event.cardId, toType: 'tableau', toIndex: event.from };
    } else if (event.type === 'FC_TO_T') {
      action = { type: 'MOVE_CARD', cardId: event.cardId, toType: 'freecell', toIndex: event.cellIdx };
    }

    if (!action) continue;
    const next = gameReducer(simState, action);
    if (next === simState) {
      console.warn(`[FreeCell V2] Forward replay rejette idx ${h} type=${event.type} cardId=${event.cardId}`);
      continue;
    }
    solution.push(action);
    simState = next;
    if (simState.phase === 'won') break;
  }

  return { state: initialState, solution };
}

let _freecellSolution: GameAction[] = [];

export function getFreeCellSolution(): GameAction[] {
  return [..._freecellSolution];
}

export function setFreeCellSolutionFromState(state: GameState): void {
  _freecellSolution = computeFreeCellSolution(state);
}

export function setFreeCellSolutionFromBD(actions: GameAction[]): void {
  _freecellSolution = [...actions];
}

function computeFreeCellSolution(state: GameState): GameAction[] {
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
    if (s.phase === 'won') break;
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
  if (s?.freeCells) {
    for (const c of s.freeCells) {
      h ^= c ? (c.value * 31 + c.suit.charCodeAt(0)) : 0;
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

export function createInitialState(): GameState {
  console.log("[FreeCell Solver] 🎲 Reverse-Deal FreeCell — donne + solution forward garanties");
  const t0 = Date.now();

  // STRATÉGIE inspirée Spider :
  //   1) Génère une donne via reverseDealFreeCell + solution forward (par inversion de l'historique).
  //      Cette solution est GARANTIE de mener à victoire (52/52 fondations).
  //   2) Si la solution stockée est trop courte (<10 coups) ou ne gagne pas, on retry.
  //   3) Fallback : computeFreeCellSolution sur la donne (greedy faible).

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { state, solution } = reverseDealFreeCell();
    // Vérifie strict : la solution mène-t-elle à phase=won ?
    let s = state;
    let won = false;
    for (const a of solution) {
      const next = gameReducer(s, a);
      if (next === s) break;
      s = next;
      if (s.phase === 'won') { won = true; break; }
    }
    if (won && solution.length >= 30) {
      _freecellSolution = solution;
      console.log(`[FreeCell Solver] ✅ DONNE V2 SOLUBLE (${Date.now() - t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution forward garantie = ${solution.length} coups`);
      return state;
    }
  }

  // Fallback : reverseDeal + greedy (peu probable, mais conservé pour la robustesse)
  const { state } = reverseDealFreeCell();
  _freecellSolution = computeFreeCellSolution(state);
  console.log(`[FreeCell Solver] ⚠️ FALLBACK (${Date.now() - t0}ms) — solution greedy = ${_freecellSolution.length} coups (peut être incomplète)`);
  return state;
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

/** How many cards can be moved together. */
export function maxMovableCards(state: GameState, includingDestEmpty: boolean = false): number {
  const freeCells = state.freeCells.filter((c) => c === null).length;
  const emptyCols = state.tableau.filter((c) => c.cards.length === 0).length - (includingDestEmpty ? 1 : 0);
  return (freeCells + 1) * Math.pow(2, Math.max(0, emptyCols));
}

function findCard(state: GameState, cardId: string): { card: Card; from: 'tableau' | 'freecell'; idx: number; cardIndex?: number } | null {
  for (let i = 0; i < state.freeCells.length; i++) {
    const c = state.freeCells[i];
    if (c?.id === cardId) return { card: c, from: 'freecell', idx: i };
  }
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    for (let j = 0; j < col.length; j++) {
      if (col[j].id === cardId) {
        return { card: col[j], from: 'tableau', idx: i, cardIndex: j };
      }
    }
  }
  return null;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET':
      return createInitialState();

    case 'LOAD_FROM_BD':
      return action.state;

    case 'MOVE_CARD': {
      const found = findCard(state, action.cardId);
      if (!found) return state;
      const { toType, toIndex } = action;

      // FREECELL destination: only one card, only if cell empty.
      if (toType === 'freecell') {
        if (found.from === 'tableau' && found.cardIndex !== state.tableau[found.idx].cards.length - 1) return state;
        if (state.freeCells[toIndex] !== null) return state;
        const freeCells = state.freeCells.map((c, i) => (i === toIndex ? found.card : c));
        let tableau = state.tableau;
        if (found.from === 'tableau') {
          tableau = state.tableau.map((c, i) =>
            i === found.idx ? { cards: c.cards.slice(0, -1) } : c,
          );
        }
        return { ...state, freeCells, tableau, moves: state.moves + 1, score: state.score + 1 };
      }

      // FOUNDATION destination: must match suit + ascending.
      if (toType === 'foundation') {
        // Only the top card may go to a foundation.
        if (found.from === 'tableau' && found.cardIndex !== state.tableau[found.idx].cards.length - 1) return state;
        const targetIdx = state.foundations.findIndex((f) => f.suit === found.card.suit);
        if (targetIdx < 0) return state;
        if (!canPlaceOnFoundation(found.card, state.foundations[targetIdx])) return state;
        const foundations = state.foundations.map((f, i) =>
          i === targetIdx ? { ...f, cards: [...f.cards, found.card] } : f,
        );
        let freeCells = state.freeCells;
        let tableau = state.tableau;
        if (found.from === 'freecell') {
          freeCells = state.freeCells.map((c, i) => (i === found.idx ? null : c));
        } else {
          tableau = state.tableau.map((c, i) =>
            i === found.idx ? { cards: c.cards.slice(0, -1) } : c,
          );
        }
        const next = { ...state, foundations, freeCells, tableau, moves: state.moves + 1, score: state.score + 10 };
        return isWon(next) ? { ...next, phase: 'won' as const } : next;
      }

      // TABLEAU destination
      if (toType === 'tableau') {
        const dest = state.tableau[toIndex];
        const top = dest.cards[dest.cards.length - 1];
        const movingCards: Card[] = found.from === 'tableau'
          ? state.tableau[found.idx].cards.slice(found.cardIndex)
          : [found.card];

        // Validate the run if multiple cards
        for (let k = 1; k < movingCards.length; k++) {
          if (!canStackOnTableau(movingCards[k], movingCards[k - 1])) return state;
        }
        // Check destination compatibility
        if (top) {
          if (!canStackOnTableau(movingCards[0], top)) return state;
        } // empty col accepts any card in FreeCell

        // Check movable count
        const max = maxMovableCards(state, !top);
        if (movingCards.length > max) return state;

        let freeCells = state.freeCells;
        let tableau = state.tableau.map((c, i) => {
          if (i === toIndex) return { cards: [...c.cards, ...movingCards] };
          if (i === found.idx && found.from === 'tableau') {
            return { cards: c.cards.slice(0, found.cardIndex) };
          }
          return c;
        });
        if (found.from === 'freecell') {
          freeCells = state.freeCells.map((c, i) => (i === found.idx ? null : c));
        }
        const next = { ...state, freeCells, tableau, moves: state.moves + 1, score: state.score + 1 };
        return isWon(next) ? { ...next, phase: 'won' as const } : next;
      }
      return state;
    }

    case 'AUTO_TO_FOUNDATIONS': {
      let s = state;
      let progress = true;
      while (progress) {
        progress = false;
        for (let i = 0; i < s.freeCells.length; i++) {
          const c = s.freeCells[i];
          if (!c) continue;
          const fIdx = s.foundations.findIndex((f) => f.suit === c.suit);
          if (fIdx >= 0 && canPlaceOnFoundation(c, s.foundations[fIdx])) {
            s = gameReducer(s, { type: 'MOVE_CARD', cardId: c.id, toType: 'foundation', toIndex: fIdx });
            progress = true;
            break;
          }
        }
        if (progress) continue;
        for (let i = 0; i < s.tableau.length; i++) {
          const col = s.tableau[i].cards;
          const top = col[col.length - 1];
          if (!top) continue;
          const fIdx = s.foundations.findIndex((f) => f.suit === top.suit);
          if (fIdx >= 0 && canPlaceOnFoundation(top, s.foundations[fIdx])) {
            s = gameReducer(s, { type: 'MOVE_CARD', cardId: top.id, toType: 'foundation', toIndex: fIdx });
            progress = true;
            break;
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
 * Analyse FreeCell : 52 cartes en fondation = win.
 * (FreeCell est ~99.999% soluble — quasi tous les états sont winnable)
 */
export function analyzeFreeCellWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  return { kind: 'winning', action: firstHint };
}

/** Évaluation statique d'un état FreeCell (plus c'est haut, mieux c'est). */
function staticEvalFreeCell(state: GameState): number {
  let score = 0;
  // Cartes en fondation : objectif principal
  score += state.foundations.reduce((a, f) => a + f.cards.length, 0) * 10000;
  // Free cells utilisés = mauvais (cartes coincées)
  const cellsUsed = state.freeCells.filter((c) => c !== null).length;
  score -= cellsUsed * 50;
  // Colonnes vides = excellent (slots libres)
  const emptyCols = state.tableau.filter((c) => c.cards.length === 0).length;
  score += emptyCols * 800;
  // Suite descendante alternant couleurs en bas de chaque colonne
  for (const col of state.tableau) {
    if (col.cards.length === 0) continue;
    let runLen = 1;
    for (let i = col.cards.length - 1; i > 0; i--) {
      const cur = col.cards[i];
      const prev = col.cards[i - 1];
      if (canStackOnTableau(cur, prev)) runLen++;
      else break;
    }
    score += runLen * 30;
  }
  return score;
}

/** Énumère tous les coups légaux. */
function collectAllMovesFreeCell(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  // 1. Tableau top → fondation
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top) {
      const fi = state.foundations.findIndex((f) => canPlaceOnFoundation(top, f));
      if (fi >= 0) moves.push({ type: 'MOVE_CARD', cardId: top.id, toType: 'foundation', toIndex: fi });
    }
  }
  // 2. Free cell → fondation
  for (const c of state.freeCells) {
    if (!c) continue;
    const fi = state.foundations.findIndex((f) => canPlaceOnFoundation(c, f));
    if (fi >= 0) moves.push({ type: 'MOVE_CARD', cardId: c.id, toType: 'foundation', toIndex: fi });
  }
  // 3. Tableau → tableau
  for (let from = 0; from < state.tableau.length; from++) {
    const src = state.tableau[from].cards;
    if (src.length === 0) continue;
    const head = src[src.length - 1];
    for (let to = 0; to < state.tableau.length; to++) {
      if (to === from) continue;
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(head, top)) {
        moves.push({ type: 'MOVE_CARD', cardId: head.id, toType: 'tableau', toIndex: to });
      } else if (!top) {
        moves.push({ type: 'MOVE_CARD', cardId: head.id, toType: 'tableau', toIndex: to });
      }
    }
  }
  // 4. Free cell → tableau
  for (const c of state.freeCells) {
    if (!c) continue;
    for (let to = 0; to < state.tableau.length; to++) {
      const dest = state.tableau[to].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(c, top)) {
        moves.push({ type: 'MOVE_CARD', cardId: c.id, toType: 'tableau', toIndex: to });
      }
    }
  }
  // 5. Tableau top → free cell (en dernier recours)
  const emptyCellIdx = state.freeCells.findIndex((c) => c === null);
  if (emptyCellIdx >= 0) {
    for (let i = 0; i < state.tableau.length; i++) {
      const col = state.tableau[i].cards;
      const top = col[col.length - 1];
      if (top) moves.push({ type: 'MOVE_CARD', cardId: top.id, toType: 'freecell', toIndex: emptyCellIdx });
    }
  }
  return moves;
}

/**
 * Indice intelligent FreeCell avec 1-step lookahead.
 * Choisit le coup avec eval STRICTEMENT supérieure à l'état actuel.
 */
export function findHint(state: GameState): GameAction | null {
  const currentEval = staticEvalFreeCell(state);
  const moves = collectAllMovesFreeCell(state);
  let bestMove: GameAction | null = null;
  let bestScore = currentEval;
  for (const m of moves) {
    const next = gameReducer(state, m);
    if (next === state) continue;
    const score = staticEvalFreeCell(next);
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
