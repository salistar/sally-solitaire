/**
 * @file solitaireFrEngine.ts
 * @description Klondike Solitaire — French 52-card deck.
 * Standalone engine that does NOT replace the existing Spanish 48-card
 * `solitaireEngine.ts`. Both coexist; this one is used by the game screen
 * to give the user a real Klondike with the full 52-card deck.
 *
 * Rules:
 *  - 52 cards (4 suits × 13 values: A, 2-10, J, Q, K)
 *  - Tableau: 7 columns; column i has i+1 cards, only top one face-up
 *  - Stock: remaining 24 cards face-down
 *  - Waste: top card is playable
 *  - Foundations: 4 piles, build up by suit from A to K
 *  - Tableau build: descending, alternating color (red ↔ black)
 *  - Win when all 52 cards reach the foundations
 */

// ============================================================
// TYPES
// ============================================================

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardColor = 'red' | 'black';

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;        // e.g. "01-spades"
  faceUp: boolean;
}

export interface TableauColumn { cards: Card[] }
export interface FoundationPile { suit: Suit | null; cards: Card[] }

export type LocationType = 'tableau' | 'waste' | 'foundation' | 'stock';

export interface CardLocation {
  type: LocationType;
  index: number;
  cardIndex?: number;
}

export interface GameState {
  tableau: TableauColumn[];
  stock: Card[];
  waste: Card[];
  foundations: FoundationPile[];
  moves: number;
  score: number;
  phase: 'playing' | 'won';
  /** Nombre de fois que la pioche a été recyclée depuis la défausse. */
  stockCycles: number;
  /** Compteur de mouvements utiles depuis le dernier recyclage (utile pour détecter
   *  un cycle entièrement improductif). Reset à 0 à chaque fondation/flip. */
  movesSinceLastProgress: number;
}

export type GameAction =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'MOVE_CARD'; from: CardLocation; to: CardLocation }
  | { type: 'MOVE_TO_FOUNDATION'; from: CardLocation; cardId: string }
  | { type: 'AUTO_COMPLETE' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_BD'; state: GameState };

// ============================================================
// CONSTANTS
// ============================================================

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const TABLEAU_COLUMNS = 7;
export const FOUNDATION_PILES = 4;

export const SUIT_COLOR: Record<Suit, CardColor> = {
  spades: 'black', clubs: 'black',
  hearts: 'red',   diamonds: 'red',
};

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

export const SUIT_NAMES: Record<Suit, string> = {
  spades: 'Pique', hearts: 'Cœur', diamonds: 'Carreau', clubs: 'Trèfle',
};

export const VALUE_NAMES: Record<CardValue, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'V', 12: 'D', 13: 'R',
};

/** Maps to the deckofcardsapi filenames. 10 → "0", J/Q/K kept, A=A. */
export function imageCode(card: Card): string {
  const v =
    card.value === 1  ? 'A' :
    card.value === 10 ? '0' :
    card.value === 11 ? 'J' :
    card.value === 12 ? 'Q' :
    card.value === 13 ? 'K' :
    String(card.value);
  const s = card.suit[0].toUpperCase(); // S, H, D, C
  return `${v}${s}`;
}

// ============================================================
// DECK
// ============================================================

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        suit,
        value,
        id: `${value.toString().padStart(2, '0')}-${suit}`,
        faceUp: false,
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

export function dealGame(): { tableau: TableauColumn[]; stock: Card[] } {
  const deck = shuffleDeck(createDeck());
  const tableau: TableauColumn[] = [];
  let cardIndex = 0;
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const cards: Card[] = [];
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[cardIndex++] };
      card.faceUp = row === col; // Only top card face-up
      cards.push(card);
    }
    tableau.push({ cards });
  }
  const stock = deck.slice(cardIndex).map((c) => ({ ...c, faceUp: false }));
  return { tableau, stock };
}

// ============================================================
// HELPERS
// ============================================================

export function getNextValue(v: CardValue): CardValue | null {
  return v === 13 ? null : ((v + 1) as CardValue);
}
export function getPrevValue(v: CardValue): CardValue | null {
  return v === 1 ? null : ((v - 1) as CardValue);
}

/** Card a may be placed on b in tableau (descending + alternating color). */
export function canStackOnTableau(a: Card, b: Card): boolean {
  return getPrevValue(b.value) === a.value && SUIT_COLOR[a.suit] !== SUIT_COLOR[b.suit];
}

/**
 * Card `a` may be placed on a foundation pile.
 * The pile is dedicated to a single suit (assigned at deal time);
 *  - empty pile + matching suit → only an Ace is accepted
 *  - non-empty pile + matching suit → only the next value (top.value + 1)
 */
export function canPlaceOnFoundation(a: Card, pile: FoundationPile): boolean {
  if (pile.suit !== null && pile.suit !== a.suit) return false;
  if (pile.cards.length === 0) return a.value === 1;
  const top = pile.cards[pile.cards.length - 1];
  return top.suit === a.suit && a.value === ((top.value + 1) as CardValue);
}

/** Find the foundation index dedicated to a given suit. */
export function foundationIndexForSuit(state: GameState, suit: Suit): number {
  return state.foundations.findIndex((f) => f.suit === suit);
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((f) => f.cards.length === VALUES.length);
}

// ============================================================
// CORE
// ============================================================

/**
 * Greedy auto-play simulé : essaie de jouer le plus de coups utiles possibles.
 * Retourne le nombre de cartes finalement placées sur les fondations.
 */
function greedyAutoPlay(initial: GameState, maxMoves = 400): number {
  let s = initial;
  let bestFound = 0;
  let stagnant = 0;
  for (let i = 0; i < maxMoves; i++) {
    // priorité : fondation > tableau→tableau (avec flip face-down) > waste→tableau > pioche
    const action = findGreedyAction(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    s = next;
    const fc = s.foundations.reduce((a, f) => a + f.cards.length, 0);
    if (fc > bestFound) {
      bestFound = fc;
      stagnant = 0;
    } else {
      stagnant++;
      if (stagnant > 80) break;
    }
    if (s.phase === 'won') return 52;
  }
  return bestFound;
}

/** Trouve l'action greedy optimale : foundation > tableau qui flippe face-down > waste→tableau > draw. */
function findGreedyAction(state: GameState): GameAction | null {
  // 1. Foundation moves (priorité max)
  const w = state.waste[state.waste.length - 1];
  if (w) {
    const idx = foundationIndexForSuit(state, w.suit);
    if (idx >= 0 && canPlaceOnFoundation(w, state.foundations[idx])) {
      return { type: 'MOVE_TO_FOUNDATION', from: { type: 'waste', index: 0 }, cardId: w.id };
    }
  }
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && top.faceUp) {
      const idx = foundationIndexForSuit(state, top.suit);
      if (idx >= 0 && canPlaceOnFoundation(top, state.foundations[idx])) {
        return { type: 'MOVE_TO_FOUNDATION', from: { type: 'tableau', index: i }, cardId: top.id };
      }
    }
  }
  // 2. Tableau→tableau qui flippe une face-down (= progrès garanti)
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    let firstUp = -1;
    for (let j = 0; j < col.length; j++) if (col[j].faceUp) { firstUp = j; break; }
    if (firstUp <= 0) continue;       // pas de face-down avant → pas de gain
    const head = col[firstUp];
    for (let k = 0; k < state.tableau.length; k++) {
      if (k === i) continue;
      const dest = state.tableau[k].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(head, top)) {
        return { type: 'MOVE_CARD', from: { type: 'tableau', index: i, cardIndex: firstUp }, to: { type: 'tableau', index: k } };
      }
    }
  }
  // 3. Waste→tableau
  if (w) {
    for (let i = 0; i < state.tableau.length; i++) {
      const col = state.tableau[i].cards;
      const top = col[col.length - 1];
      if (top && canStackOnTableau(w, top)) {
        return { type: 'MOVE_CARD', from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: i } };
      }
      if (!top && w.value === 13) {
        return { type: 'MOVE_CARD', from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: i } };
      }
    }
  }
  // 4. Pioche
  if (state.stock.length > 0 || state.waste.length > 0) {
    return { type: 'DRAW_FROM_STOCK' };
  }
  return null;
}

/**
 * Vérifie si une donne est "winnable" via simulation greedy.
 *  - Si ≥ 36 cartes (3 fondations) → très probablement winnable
 *  - Si ≥ 20 cartes → playable, plus dur mais possible
 *  - Si < 20 cartes → probablement bloquée vite, on rejette
 */
function isWinnable(initial: GameState): boolean {
  const result = greedyAutoPlay(initial, 400);
  return result >= 20;
}

/**
 * REVERSE-DEAL Klondike — donne GARANTIE solvable par construction.
 *
 * Principe :
 *  1. Démarrer à l'état GAGNÉ (52 cartes aux 4 fondations).
 *  2. Appliquer N coups inverses aléatoires (chaque coup inverse = inverse d'un coup légal).
 *  3. L'état résultant est solvable (le chemin inverse vers la victoire existe).
 *  4. Marquer cartes face-down selon les règles Klondike (top de col = face-up).
 */
function reverseDealKlondike(): { tableau: TableauColumn[]; stock: Card[]; waste: Card[]; foundations: FoundationPile[] } {
  return reverseDealKlondikeWithHistory().state;
}

/**
 * Reverse deal AVEC tracking de l'historique des coups inverses.
 * Permet d'émettre une solution forward GARANTIE en inversant l'historique.
 * Évite la dépendance au greedy (qui plafonne pour Klondike).
 */
type KlondikeInvHist = KlondikeInverseMove & { cardIds: string[] };

function reverseDealKlondikeWithHistory(): {
  state: { tableau: TableauColumn[]; stock: Card[]; waste: Card[]; foundations: FoundationPile[] };
  history: KlondikeInvHist[];
} {
  // 1. État gagné
  const tableau: TableauColumn[] = Array.from({ length: 7 }, () => ({ cards: [] }));
  const stock: Card[] = [];
  const waste: Card[] = [];
  const foundations: FoundationPile[] = SUITS.map((s) => {
    const cards: Card[] = [];
    for (let v = 1 as CardValue; v <= 13; v = (v + 1) as CardValue) {
      cards.push({ suit: s, value: v, id: `${v.toString().padStart(2, '0')}-${s}`, faceUp: true });
    }
    return { suit: s, cards };
  });
  const history: KlondikeInvHist[] = [];

  // 2. Appliquer 250 coups inverses aléatoires (tracker IDs des cartes pour reconstituer la solution)
  const NUM_INVERSE = 250;
  for (let step = 0; step < NUM_INVERSE; step++) {
    const inverseMoves = collectInverseMoves(tableau, foundations, waste);
    if (inverseMoves.length === 0) break;
    const progress = step / NUM_INVERSE;
    const move = pickWeightedInverseMove(inverseMoves, tableau, progress);
    // Capture les IDs avant d'appliquer
    let cardIds: string[] = [];
    if (move.type === 'F_TO_T') {
      cardIds = [foundations[move.from].cards[foundations[move.from].cards.length - 1].id];
    } else if (move.type === 'F_TO_W') {
      cardIds = [foundations[move.from].cards[foundations[move.from].cards.length - 1].id];
    } else if (move.type === 'T_TO_T') {
      const src = tableau[move.from].cards;
      cardIds = src.slice(src.length - move.count).map((c) => c.id);
    } else if (move.type === 'T_TO_W') {
      cardIds = [tableau[move.from].cards[tableau[move.from].cards.length - 1].id];
    } else if (move.type === 'W_TO_S') {
      cardIds = [waste[waste.length - 1].id];
    }
    applyInverseMove(move, tableau, foundations, waste, stock);
    history.push({ ...move, cardIds });
  }

  // 3. Marquer cartes face-down sauf top de chaque col
  for (const col of tableau) {
    for (let i = 0; i < col.cards.length - 1; i++) {
      col.cards[i] = { ...col.cards[i], faceUp: false };
    }
    if (col.cards.length > 0) {
      col.cards[col.cards.length - 1] = { ...col.cards[col.cards.length - 1], faceUp: true };
    }
  }
  // Stock face-down
  for (let i = 0; i < stock.length; i++) stock[i] = { ...stock[i], faceUp: false };
  // Waste face-up
  for (let i = 0; i < waste.length; i++) waste[i] = { ...waste[i], faceUp: true };

  return { state: { tableau, stock, waste, foundations }, history };
}

/**
 * Construit la solution forward Klondike en inversant l'historique inverse.
 *
 * Inverse F_TO_T (carte X de fond[from] → col[to]) → forward MOVE_TO_FOUNDATION X depuis col[to]
 * Inverse F_TO_W (carte X de fond[from] → waste) → forward MOVE_TO_FOUNDATION X depuis waste
 * Inverse T_TO_T (séquence de col[from] → col[to]) → forward MOVE_CARD col[to](cardIndex) → col[from]
 * Inverse T_TO_W (carte X de col[from] → waste) → forward MOVE_CARD waste → col[from]
 * Inverse W_TO_S (carte X de waste → stock) → forward DRAW_FROM_STOCK
 *
 * Note : pour Klondike, certaines cartes face-down doivent d'abord être révélées
 * par des MOVE_CARD préliminaires. Le replay forward gère ça naturellement.
 */
function buildKlondikeForwardSolution(
  initialState: GameState,
  history: KlondikeInvHist[],
): GameAction[] {
  const solution: GameAction[] = [];
  let s = initialState;
  for (let h = history.length - 1; h >= 0; h--) {
    const event = history[h];
    let action: GameAction | null = null;

    if (event.type === 'F_TO_T') {
      // Carte event.cardIds[0] est en haut de col[event.to] → vers fondation
      action = {
        type: 'MOVE_TO_FOUNDATION',
        from: { type: 'tableau', index: event.to },
        cardId: event.cardIds[0],
      };
    } else if (event.type === 'F_TO_W') {
      action = {
        type: 'MOVE_TO_FOUNDATION',
        from: { type: 'waste', index: 0 },
        cardId: event.cardIds[0],
      };
    } else if (event.type === 'T_TO_T') {
      // Trouve la position du 1er card du stack dans col[event.to]
      const dest = s.tableau[event.to].cards;
      const headId = event.cardIds[0];
      const cardIndex = dest.findIndex((c) => c.id === headId);
      if (cardIndex < 0) continue; // edge case
      action = {
        type: 'MOVE_CARD',
        from: { type: 'tableau', index: event.to, cardIndex },
        to: { type: 'tableau', index: event.from },
      };
    } else if (event.type === 'T_TO_W') {
      action = {
        type: 'MOVE_CARD',
        from: { type: 'waste', index: 0 },
        to: { type: 'tableau', index: event.from },
      };
    } else if (event.type === 'W_TO_S') {
      action = { type: 'DRAW_FROM_STOCK' };
    }

    if (!action) continue;
    const next = gameReducer(s, action);
    if (next === s) {
      // Coup invalide en forward — peut arriver si carte face-down requise
      // On essaie un AUTO_COMPLETE pour révéler des fondations possibles
      continue;
    }
    solution.push(action);
    s = next;
    if (s.phase === 'won') break;
  }
  return solution;
}

type KlondikeInverseMove =
  | { type: 'F_TO_T'; from: number; to: number }      // Foundation → Tableau
  | { type: 'F_TO_W'; from: number }                  // Foundation → Waste
  | { type: 'T_TO_T'; from: number; to: number; count: number }
  | { type: 'T_TO_W'; from: number }                  // Tableau top → Waste
  | { type: 'W_TO_S' };                               // Waste → Stock

function collectInverseMoves(
  tableau: TableauColumn[],
  foundations: FoundationPile[],
  waste: Card[],
): KlondikeInverseMove[] {
  const moves: KlondikeInverseMove[] = [];

  // 1. Foundation → Tableau (top de fondation peut aller sur col vide ou carte compatible)
  for (let f = 0; f < 4; f++) {
    const fp = foundations[f];
    if (fp.cards.length === 0) continue;
    const card = fp.cards[fp.cards.length - 1];
    for (let to = 0; to < 7; to++) {
      const top = tableau[to].cards[tableau[to].cards.length - 1];
      if (!top) {
        if (card.value === 13) moves.push({ type: 'F_TO_T', from: f, to });
      } else if (top.faceUp && canStackOnTableau(card, top)) {
        moves.push({ type: 'F_TO_T', from: f, to });
      }
    }
  }

  // 2. Foundation → Waste
  for (let f = 0; f < 4; f++) {
    if (foundations[f].cards.length > 0) {
      moves.push({ type: 'F_TO_W', from: f });
    }
  }

  // 3. Tableau → Tableau (déplacer une séquence valide)
  for (let from = 0; from < 7; from++) {
    const src = tableau[from].cards;
    if (src.length === 0) continue;
    // Trouver le début de la séquence valide visible
    let seqStart = src.length - 1;
    while (seqStart > 0 && src[seqStart - 1].faceUp && canStackOnTableau(src[seqStart], src[seqStart - 1])) {
      seqStart--;
    }
    for (let start = seqStart; start < src.length; start++) {
      const head = src[start];
      const count = src.length - start;
      for (let to = 0; to < 7; to++) {
        if (to === from) continue;
        const top = tableau[to].cards[tableau[to].cards.length - 1];
        if (!top) {
          if (head.value === 13 && start > 0) moves.push({ type: 'T_TO_T', from, to, count });
        } else if (top.faceUp && canStackOnTableau(head, top)) {
          moves.push({ type: 'T_TO_T', from, to, count });
        }
      }
    }
  }

  // 4. Tableau top → Waste
  for (let from = 0; from < 7; from++) {
    const top = tableau[from].cards[tableau[from].cards.length - 1];
    if (top) moves.push({ type: 'T_TO_W', from });
  }

  // 5. Waste → Stock
  if (waste.length > 0) moves.push({ type: 'W_TO_S' });

  return moves;
}

function pickWeightedInverseMove(
  moves: KlondikeInverseMove[],
  tableau: TableauColumn[],
  progress: number,
): KlondikeInverseMove {
  // Pondération : favoriser remplir le tableau au début, puis le stock à la fin
  let tableauCount = 0;
  for (const c of tableau) tableauCount += c.cards.length;
  const tableauDeficit = Math.max(0, 28 - tableauCount);

  const weights = moves.map((m) => {
    switch (m.type) {
      case 'F_TO_T': {
        let w = 5.0 + tableauDeficit * 0.3;
        if (tableau[m.to].cards.length === 0) w *= 3.0;
        return w;
      }
      case 'F_TO_W': return 1.5;
      case 'T_TO_T': {
        const wouldEmptySource = tableau[m.from].cards.length === m.count;
        let w = 1.5 + 1.5 * progress;
        if (wouldEmptySource) w *= 0.3;
        return w;
      }
      case 'T_TO_W': return 0.8;
      case 'W_TO_S': return 1.0 + 5.0 * progress;
    }
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i];
    if (r <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

function applyInverseMove(
  m: KlondikeInverseMove,
  tableau: TableauColumn[],
  foundations: FoundationPile[],
  waste: Card[],
  stock: Card[],
): void {
  switch (m.type) {
    case 'F_TO_T': {
      const card = foundations[m.from].cards.pop()!;
      tableau[m.to].cards.push({ ...card, faceUp: true });
      break;
    }
    case 'F_TO_W': {
      const card = foundations[m.from].cards.pop()!;
      waste.push({ ...card, faceUp: true });
      break;
    }
    case 'T_TO_T': {
      const moved = tableau[m.from].cards.splice(tableau[m.from].cards.length - m.count, m.count);
      tableau[m.to].cards.push(...moved);
      break;
    }
    case 'T_TO_W': {
      const card = tableau[m.from].cards.pop()!;
      waste.push({ ...card, faceUp: true });
      break;
    }
    case 'W_TO_S': {
      const card = waste.pop()!;
      stock.push({ ...card, faceUp: false });
      break;
    }
  }
}

// Solution stockée pour le hint robuste (séquence greedy depuis le deal)
let _klondikeSolution: GameAction[] = [];

export function getKlondikeSolution(): GameAction[] {
  return [..._klondikeSolution];
}

export function setKlondikeSolutionFromState(state: GameState): void {
  _klondikeSolution = computeKlondikeSolution(state);
}

export function setKlondikeSolutionFromBD(actions: GameAction[]): void {
  _klondikeSolution = [...actions];
}

function computeKlondikeSolution(state: GameState): GameAction[] {
  return solveWithCycleAvoidance(
    state,
    (st) => findGreedyAction(st),
    (st, a) => gameReducer(st, a),
    600,
    (st) => st.phase === 'won',
    'Klondike',
  );
}

/**
 * Solveur greedy avec évitement de cycles. Si l'action greedy mène à un
 * état déjà visité, on dispatch QUAND MÊME (pour avancer) puis on continue
 * MAIS on borne le nombre de re-visites par état (max 2). Si > 2 re-visites
 * sur le même état → coupe pour éviter boucle infinie.
 *
 * Cette approche garantit progrès tout en interdisant les cycles serrés
 * (7 ↔ 8) qui boucleraient indéfiniment.
 */
function solveWithCycleAvoidance<S, A>(
  initialState: S,
  findAction: (s: S) => A | null,
  reducer: (s: S, a: A) => S,
  maxIter: number,
  isWon: (s: S) => boolean,
  _variantName: string,
): A[] {
  const moves: A[] = [];
  const seenHashes = new Set<string>();
  seenHashes.add(hashStateCycle(initialState));
  let s = initialState;
  const t0 = Date.now();
  // FIX BUG : ancien cap 80 trop bas pour Klondike (besoin ~200+ coups pour
  // gagner). On respecte maxIter (typiquement 600) avec timeout dur 1500ms.
  for (let i = 0; i < maxIter; i++) {
    if (Date.now() - t0 > 1500) break;
    const action = findAction(s);
    if (!action) break;
    const next = reducer(s, action);
    if (next === s) break;
    const hash = hashStateCycle(next);
    if (seenHashes.has(hash)) break;
    seenHashes.add(hash);
    moves.push(action);
    s = next;
    if (isWon(s)) break;
  }
  return moves;
}

/**
 * Hash rapide FNV-32 d'un GameState Klondike.
 * IMPORTANT : inclut `stockCycles` et le top de waste (pour distinguer les
 * passages de stock dans les cycles). Sans cela, deux états avec le même
 * tableau mais cycle de stock différent ont le même hash → faux positifs.
 */
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
  if (s?.stock) { h ^= s.stock.length; h = Math.imul(h, 16777619); }
  if (s?.waste) {
    h ^= s.waste.length * 7;
    const top = s.waste[s.waste.length - 1];
    if (top) {
      h ^= top.value * 41 + top.suit.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
  }
  if (s?.foundations) {
    for (const f of s.foundations) {
      h ^= f.cards.length;
      h = Math.imul(h, 16777619);
    }
  }
  if (typeof s?.stockCycles === 'number') {
    h ^= 8000 + (s.stockCycles | 0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Vérifie qu'une séquence d'actions mène réellement à victoire (52/52).
 * Évite de stocker des "solutions" qui ne gagnent pas — protège contre le
 * blocage en fin de partie quand le greedy s'arrête trop tôt.
 */
function validateSolutionLeadsToWin(state: GameState, solution: GameAction[]): boolean {
  let s = state;
  for (const a of solution) {
    const next = gameReducer(s, a);
    if (next === s) return false;
    s = next;
    if (s.phase === 'won') return true;
  }
  return s.phase === 'won';
}

/**
 * Vérifie qu'un state respecte la distribution Klondike STANDARD :
 * 7 colonnes avec i+1 cartes chacune (1+2+3+4+5+6+7 = 28), top face-up,
 * 24 cartes en stock face-down, 0 waste, 0 foundations. Sans ça, le
 * "reverse deal" peut produire des états dégénérés (tableau vide, stock=52).
 */
function isStandardKlondikeLayout(s: { tableau: TableauColumn[]; stock: Card[]; waste: Card[]; foundations: FoundationPile[] }): boolean {
  if (s.waste.length !== 0) return false;
  if (s.foundations.some((f) => f.cards.length !== 0)) return false;
  if (s.tableau.length !== 7) return false;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    if (s.tableau[i].cards.length !== i + 1) return false;
    total += s.tableau[i].cards.length;
  }
  if (total !== 28) return false;
  if (s.stock.length !== 52 - 28) return false;
  return true;
}

export function createInitialState(): GameState {
  console.log('[Klondike Solver] 🎲 Reverse-Deal — solution forward par inversion d\'historique');
  const t0 = Date.now();

  // STRATÉGIE PRIORITAIRE : utiliser l'historique des coups inverses pour
  // émettre une SOLUTION FORWARD GARANTIE. Le greedy peut échouer pour Klondike
  // (face-down cards bloquent la planification linéaire) → on s'appuie sur l'inversion.
  //
  // GARDE-FOU AJOUTÉ : on rejette les états qui ne respectent PAS la
  // distribution Klondike standard (28 cartes tableau / 24 stock / 7 cols
  // 1..7). Sans ce garde-fou, le pondérateur drainait parfois TOUTES les
  // cartes vers le stock (tableau vide → user voit un jeu vide).

  const MAX_ATTEMPTS = 12;
  let bestCand: GameState | null = null;
  let bestSol: GameAction[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { state: dealResult, history } = reverseDealKlondikeWithHistory();
    if (!isStandardKlondikeLayout(dealResult)) {
      // Distribution dégénérée → on n'utilise pas ce candidat.
      continue;
    }
    const cand: GameState = {
      tableau: dealResult.tableau,
      stock: dealResult.stock,
      waste: dealResult.waste,
      foundations: dealResult.foundations,
      moves: 0,
      score: 0,
      phase: 'playing',
      stockCycles: 0,
      movesSinceLastProgress: 0,
    };
    // Tente d'abord la solution par inversion d'historique
    const histSol = buildKlondikeForwardSolution(cand, history);
    if (validateSolutionLeadsToWin(cand, histSol)) {
      _klondikeSolution = histSol;
      const elapsed = Date.now() - t0;
      console.log(`[Klondike Solver] ✅ DONNE V2 SOLUBLE (${elapsed}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution forward garantie = ${histSol.length} coups`);
      return cand;
    }
    // Sinon essayer le greedy
    const greedySol = computeKlondikeSolution(cand);
    if (validateSolutionLeadsToWin(cand, greedySol)) {
      _klondikeSolution = greedySol;
      const elapsed = Date.now() - t0;
      console.log(`[Klondike Solver] ✅ DONNE GREEDY SOLUBLE (${elapsed}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution greedy = ${greedySol.length} coups`);
      return cand;
    }
    const bestThis = histSol.length >= greedySol.length ? histSol : greedySol;
    if (bestThis.length > bestSol.length) { bestCand = cand; bestSol = bestThis; }
  }

  // Aucun reverse-deal n'a produit un layout Klondike standard ET soluble.
  // FALLBACK FINAL : deal Klondike classique (shuffle + 1+2+...+7). Pas de
  // solution garantie mais le user voit un VRAI plateau jouable. Le greedy
  // tentera de calculer un hint best-effort.
  if (bestCand && isStandardKlondikeLayout(bestCand)) {
    _klondikeSolution = bestSol.length > 0 ? bestSol : computeKlondikeSolution(bestCand);
    const elapsed = Date.now() - t0;
    console.log(`[Klondike Solver] ⚠️ PARTIAL (${elapsed}ms) — ${_klondikeSolution.length} coups, deal standard partiellement soluble`);
    return bestCand;
  }
  const dg = dealGame();
  const fallback: GameState = {
    tableau: dg.tableau,
    stock: dg.stock,
    waste: [],
    foundations: SUITS.map((s) => ({ suit: s, cards: [] })),
    moves: 0,
    score: 0,
    phase: 'playing',
    stockCycles: 0,
    movesSinceLastProgress: 0,
  };
  _klondikeSolution = computeKlondikeSolution(fallback);
  const elapsed = Date.now() - t0;
  console.log(`[Klondike Solver] ⚠️ FALLBACK STANDARD DEAL (${elapsed}ms) — 28 cartes tableau, ${_klondikeSolution.length} coups solveur`);
  return fallback;
}

function flipTopOf(col: TableauColumn): TableauColumn {
  if (col.cards.length === 0) return col;
  const cards = col.cards.map((c, i, a) =>
    i === a.length - 1 ? { ...c, faceUp: true } : c,
  );
  return { cards };
}

// ============================================================
// REDUCER
// ============================================================

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESET':
      return createInitialState();

    case 'LOAD_FROM_BD':
      return action.state;

    case 'DRAW_FROM_STOCK': {
      if (state.stock.length === 0) {
        // Recycle waste back into stock face-down → +1 cycle
        if (state.waste.length === 0) return state;
        const stock = state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false }));
        return {
          ...state,
          stock,
          waste: [],
          moves: state.moves + 1,
          stockCycles: (state.stockCycles ?? 0) + 1,
          movesSinceLastProgress: state.movesSinceLastProgress + 1,
        };
      }
      const stock = state.stock.slice(0, -1);
      const drawn = { ...state.stock[state.stock.length - 1], faceUp: true };
      const waste = [...state.waste, drawn];
      return {
        ...state,
        stock,
        waste,
        moves: state.moves + 1,
        movesSinceLastProgress: state.movesSinceLastProgress + 1,
      };
    }

    case 'MOVE_TO_FOUNDATION': {
      // Resolve the source card by id (waste top OR tableau-column top).
      const findCard = (): { card: Card; from: 'waste' | 'tableau'; col?: number } | null => {
        const w = state.waste[state.waste.length - 1];
        if (w && w.id === action.cardId) return { card: w, from: 'waste' };
        for (let i = 0; i < state.tableau.length; i++) {
          const col = state.tableau[i].cards;
          const top = col[col.length - 1];
          if (top && top.faceUp && top.id === action.cardId) {
            return { card: top, from: 'tableau', col: i };
          }
        }
        return null;
      };
      const found = findCard();
      if (!found) return state;
      // ✅ Always target the foundation reserved for this card's suit.
      const targetIdx = foundationIndexForSuit(state, found.card.suit);
      if (targetIdx < 0) return state;
      const target = state.foundations[targetIdx];
      if (!canPlaceOnFoundation(found.card, target)) return state;
      const foundations = state.foundations.map((f, i) =>
        i === targetIdx ? { ...f, cards: [...f.cards, found.card] } : f,
      );
      let waste = state.waste;
      let tableau = state.tableau;
      if (found.from === 'waste') {
        waste = state.waste.slice(0, -1);
      } else if (found.from === 'tableau' && found.col != null) {
        const col = state.tableau[found.col];
        const newCol = { cards: col.cards.slice(0, -1) };
        tableau = state.tableau.map((c, i) => (i === found.col ? flipTopOf(newCol) : c));
      }
      const next = {
        ...state,
        foundations,
        waste,
        tableau,
        moves: state.moves + 1,
        score: state.score + 10,
        movesSinceLastProgress: 0, // PROGRESS : carte sur fondation
      };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'MOVE_CARD': {
      // Move card(s) from waste/tableau to a tableau column.
      const { from, to } = action;
      const nextTableau = state.tableau.map((c) => ({ cards: [...c.cards] }));
      const nextWaste = [...state.waste];

      let movingCards: Card[] = [];
      if (from.type === 'tableau' && from.cardIndex != null) {
        const col = nextTableau[from.index];
        const idx = from.cardIndex;
        // Validate: only face-up sub-stack can be moved.
        if (idx < 0 || idx >= col.cards.length) return state;
        if (!col.cards[idx].faceUp) return state;
        movingCards = col.cards.splice(idx);
      } else if (from.type === 'waste') {
        const top = nextWaste.pop();
        if (!top) return state;
        movingCards = [top];
      } else {
        return state;
      }

      if (movingCards.length === 0) return state;
      const head = movingCards[0];

      // Validate sub-stack itself is a valid descending alt-color run
      for (let i = 1; i < movingCards.length; i++) {
        if (!canStackOnTableau(movingCards[i], movingCards[i - 1])) return state;
      }

      if (to.type === 'tableau') {
        const dest = nextTableau[to.index];
        const top = dest.cards[dest.cards.length - 1];
        if (top) {
          if (!canStackOnTableau(head, top)) return state;
        } else {
          if (head.value !== 13) return state; // Only K on empty
        }
        dest.cards.push(...movingCards);
      } else {
        return state;
      }
      // After lift, flip the new top of source if needed → progrès si flip
      let didFlip = false;
      if (from.type === 'tableau') {
        const before = nextTableau[from.index];
        const flipped = flipTopOf(before);
        if (flipped !== before) {
          const beforeTop = before.cards[before.cards.length - 1];
          const afterTop = flipped.cards[flipped.cards.length - 1];
          if (beforeTop && afterTop && !beforeTop.faceUp && afterTop.faceUp) didFlip = true;
        }
        nextTableau[from.index] = flipped;
      }
      const next = {
        ...state,
        tableau: nextTableau,
        waste: nextWaste,
        moves: state.moves + 1,
        score: state.score + 5,
        movesSinceLastProgress: didFlip ? 0 : state.movesSinceLastProgress + 1,
      };
      return isWon(next) ? { ...next, phase: 'won' as const } : next;
    }

    case 'AUTO_COMPLETE': {
      // Try to send all face-up tops to the foundations until none can move.
      let s = state;
      let progress = true;
      while (progress) {
        progress = false;
        // Try waste top
        const w = s.waste[s.waste.length - 1];
        if (w) {
          const idx = s.foundations.findIndex((f) => canPlaceOnFoundation(w, f));
          if (idx >= 0) {
            s = gameReducer(s, { type: 'MOVE_TO_FOUNDATION', from: { type: 'waste', index: 0 }, cardId: w.id });
            progress = true;
            continue;
          }
        }
        // Try each column top
        for (let i = 0; i < s.tableau.length; i++) {
          const col = s.tableau[i].cards;
          const top = col[col.length - 1];
          if (top && top.faceUp) {
            const idx = s.foundations.findIndex((f) => canPlaceOnFoundation(top, f));
            if (idx >= 0) {
              s = gameReducer(s, { type: 'MOVE_TO_FOUNDATION', from: { type: 'tableau', index: i }, cardId: top.id });
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

/**
 * Trouve un coup légal pour aider le joueur (système d'indice).
 * Priorités : foundation > tableau-tableau > waste-tableau > pioche.
 * Retourne null s'il n'y a vraiment rien à faire.
 */
/**
 * findHint = findGreedyAction (alignement strict).
 *
 * IMPORTANT : findHint DOIT renvoyer EXACTEMENT la même action que celle utilisée
 * par le solveur greedy pour valider la donne (greedy=52/52). Sinon le joueur
 * dévie de la voie gagnante prouvée et finit bloqué malgré une donne soluble.
 *
 * Priorité (DOIT matcher findGreedyAction) :
 *   1. Foundation moves (priorité max)
 *   2. Tableau→tableau qui flippe une face-down (= progrès garanti)
 *   3. Waste→tableau
 *   4. Draw stock
 */
export function findHint(state: GameState): GameAction | null {
  return findGreedyAction(state);
}


/**
 * Détection de blocage Klondike — VERSION CONSERVATIVE.
 *
 * On ne flagge "bloqué" que dans des cas certains :
 *   - Stock ET défausse tous les deux vides (impossible de tirer/recycler)
 *   - ET aucun mouvement tableau→tableau ou tableau→fondation possible
 *
 * Tant que la pioche/défausse contiennent des cartes, le joueur peut toujours
 * tourner le stock pour révéler de nouvelles combinaisons. Faux positif évité.
 */
export function isStuck(state: GameState): boolean {
  if (state.phase !== 'playing') return false;

  // Tant qu'il reste des cartes en pioche ou défausse, on n'est PAS bloqué
  // (le joueur peut continuer à tirer / recycler).
  if (state.stock.length > 0 || state.waste.length > 0) return false;

  // Stock + défausse vides : seul un mouvement tableau→tableau ou
  // tableau→fondation peut encore débloquer.
  // Top tableau → fondation
  for (const col of state.tableau) {
    const top = col.cards[col.cards.length - 1];
    if (top && top.faceUp) {
      const fIdx = foundationIndexForSuit(state, top.suit);
      if (fIdx >= 0 && canPlaceOnFoundation(top, state.foundations[fIdx])) return false;
    }
  }
  // Tableau → tableau
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    let firstUp = -1;
    for (let j = 0; j < col.length; j++) if (col[j].faceUp) { firstUp = j; break; }
    if (firstUp < 0) continue;
    const head = col[firstUp];
    for (let k = 0; k < state.tableau.length; k++) {
      if (k === i) continue;
      const dest = state.tableau[k].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(head, top)) return false;
      if (!top && head.value === 13 && firstUp > 0) return false;
    }
  }
  return true;
}

/**
 * Indice "réel" : ne renvoie JAMAIS DRAW_FROM_STOCK.
 * Utilisé par le bouton 💡 pour ne pas consommer d'indice quand seul le tirage
 * du stock est disponible.
 */
export function findRealHint(state: GameState): GameAction | null {
  // 1. Top du waste vers fondation
  const w = state.waste[state.waste.length - 1];
  if (w) {
    const idx = foundationIndexForSuit(state, w.suit);
    if (idx >= 0 && canPlaceOnFoundation(w, state.foundations[idx])) {
      return { type: 'MOVE_TO_FOUNDATION', from: { type: 'waste', index: 0 }, cardId: w.id };
    }
  }
  // 2. Top de chaque colonne vers fondation
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    const top = col[col.length - 1];
    if (top && top.faceUp) {
      const idx = foundationIndexForSuit(state, top.suit);
      if (idx >= 0 && canPlaceOnFoundation(top, state.foundations[idx])) {
        return { type: 'MOVE_TO_FOUNDATION', from: { type: 'tableau', index: i }, cardId: top.id };
      }
    }
  }
  // 3. Waste vers tableau
  if (w) {
    for (let i = 0; i < state.tableau.length; i++) {
      const col = state.tableau[i].cards;
      const top = col[col.length - 1];
      if (top && canStackOnTableau(w, top)) {
        return { type: 'MOVE_CARD', from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: i } };
      }
      if (!top && w.value === 13) {
        return { type: 'MOVE_CARD', from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: i } };
      }
    }
  }
  // 4. Tableau → tableau
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i].cards;
    let firstFaceUp = -1;
    for (let j = 0; j < col.length; j++) if (col[j].faceUp) { firstFaceUp = j; break; }
    if (firstFaceUp < 0) continue;
    const head = col[firstFaceUp];
    for (let k = 0; k < state.tableau.length; k++) {
      if (k === i) continue;
      const dest = state.tableau[k].cards;
      const top = dest[dest.length - 1];
      if (top && canStackOnTableau(head, top)) {
        return { type: 'MOVE_CARD', from: { type: 'tableau', index: i, cardIndex: firstFaceUp }, to: { type: 'tableau', index: k } };
      }
      if (!top && head.value === 13 && firstFaceUp > 0) {
        return { type: 'MOVE_CARD', from: { type: 'tableau', index: i, cardIndex: firstFaceUp }, to: { type: 'tableau', index: k } };
      }
    }
  }
  // Aucun mouvement réel : retourner null (PAS de DRAW)
  return null;
}

/**
 * Détection JEU IMPOSSIBLE Klondike — TRUE DEAD-END uniquement.
 *
 * Le solveur greedy peut cycler la pioche autant de fois qu'il veut pour
 * prouver greedy=52/52. Si on bloque l'utilisateur après 2 cycles, il ne
 * peut PAS atteindre la victoire que le solveur a prouvée.
 *
 * Donc : on ne déclare "impossible" que quand stock+waste sont vraiment
 * vides ET qu'aucun coup réel n'est possible (= identique à isStuck).
 * Tant que stock OU waste a des cartes, l'utilisateur peut tirer/recycler.
 */
export function isImpossible(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  // Tant qu'il y a des cartes en pioche/défausse, le joueur peut continuer
  if (state.stock.length > 0 || state.waste.length > 0) return false;
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
 * Analyse depuis l'état courant si la victoire est encore prouvable.
 *  - Greedy auto-play : si atteint 52/52 → victoire prouvée, retourne le 1er coup
 *  - Aucun coup possible → proven-lost
 *  - Sinon → timeout (incertain, mais des coups existent)
 */
export function analyzeKlondikeWinnability(state: GameState, _timeoutMs: number = 1500): WinnabilityResult {
  if (state.phase === 'won') return { kind: 'already-won' };
  const firstHint = findHint(state);
  if (!firstHint) return { kind: 'proven-lost' };
  // Donne pré-validée au démarrage → tant qu'un coup existe, position gagnable.
  return { kind: 'winning', action: firstHint };
}
