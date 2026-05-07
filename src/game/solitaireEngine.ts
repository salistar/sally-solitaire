/**
 * SolitaireEngine - Klondike Solitaire for the Spanish 40-card deck
 * Single-player card game.
 *
 * Rules:
 * - 40 cards total
 * - Tableau: 7 columns, column i has i cards (1..7), top card face-up
 * - Stock: remaining 12 cards face-down
 * - Waste: draw from stock, top card playable
 * - Foundation: 4 piles, build up by suit from 1 to 12
 * - Tableau build: descending, alternating color groups
 *   (bastos/espadas = dark, copas/oros = light)
 * - Win when all 40 cards are in the foundations
 */

// ============================================================
// TYPES
// ============================================================

export type Suit = 'bastos' | 'copas' | 'espadas' | 'oros';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export type ColorGroup = 'dark' | 'light';

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;
  faceUp: boolean;
}

export interface TableauColumn {
  cards: Card[];
}

export interface FoundationPile {
  suit: Suit | null;
  cards: Card[];
}

export type LocationType = 'tableau' | 'waste' | 'foundation' | 'stock';

export interface CardLocation {
  type: LocationType;
  index: number; // column/pile index
  cardIndex?: number; // index within the column
}

export interface GameState {
  tableau: TableauColumn[];
  stock: Card[];
  waste: Card[];
  foundations: FoundationPile[];
  moves: number;
  phase: 'playing' | 'won';
}

export type GameAction =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'MOVE_CARD'; from: CardLocation; to: CardLocation }
  | { type: 'MOVE_TO_FOUNDATION'; from: CardLocation; cardId: string }
  | { type: 'AUTO_COMPLETE' }
  | { type: 'RESET' };

// ============================================================
// CONSTANTS
// ============================================================

export const SUITS: Suit[] = ['bastos', 'copas', 'espadas', 'oros'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const TABLEAU_COLUMNS = 7;
export const FOUNDATION_PILES = 4;

/** Ordered values for foundation building (1,2,3,4,5,6,7,10,11,12) */
export const VALUE_ORDER: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const SUIT_COLORS: Record<Suit, ColorGroup> = {
  bastos: 'dark',
  espadas: 'dark',
  copas: 'light',
  oros: 'light',
};

export const SUIT_NAMES: Record<Suit, string> = {
  bastos: 'Bâtons',
  copas: 'Coupes',
  espadas: 'Épées',
  oros: 'Deniers',
};

export const VALUE_NAMES: Record<CardValue, string> = {
  1: 'As',
  2: 'Deux',
  3: 'Trois',
  4: 'Quatre',
  5: 'Cinq',
  6: 'Six',
  7: 'Sept',
  10: 'Sota',
  11: 'Caballo',
  12: 'Rey',
};

// ============================================================
// DECK
// ============================================================

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      const valueStr = value.toString().padStart(2, '0');
      deck.push({
        suit,
        value,
        id: `${valueStr}-${suit}`,
        faceUp: false,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// HELPERS
// ============================================================

/** Get color group for a suit */
export function getColorGroup(suit: Suit): ColorGroup {
  return SUIT_COLORS[suit];
}

/** Check if two cards have alternating colors */
export function isAlternatingColor(a: Card, b: Card): boolean {
  return getColorGroup(a.suit) !== getColorGroup(b.suit);
}

/** Get the next value in sequence (for foundations) */
export function getNextValue(value: CardValue): CardValue | null {
  const idx = VALUE_ORDER.indexOf(value);
  if (idx === -1 || idx >= VALUE_ORDER.length - 1) return null;
  return VALUE_ORDER[idx + 1];
}

/** Get the previous value in sequence (for tableau building down) */
export function getPrevValue(value: CardValue): CardValue | null {
  const idx = VALUE_ORDER.indexOf(value);
  if (idx <= 0) return null;
  return VALUE_ORDER[idx - 1];
}

/** Get value rank (0-based index in VALUE_ORDER) */
export function getValueRank(value: CardValue): number {
  return VALUE_ORDER.indexOf(value);
}

/** Format card for display */
export function formatCard(card: Card): string {
  return `${VALUE_NAMES[card.value]} de ${SUIT_NAMES[card.suit]}`;
}

export function getCardImagePath(card: Card): string {
  return `${card.id}.png`;
}

export function getCardBackImagePath(): string {
  return 'back.png';
}

// ============================================================
// TABLEAU RULES
// ============================================================

/** Check if a card can be placed on a tableau column */
export function canPlaceOnTableau(card: Card, column: TableauColumn): boolean {
  // Empty column: only value 12 (Rey/King equivalent)
  if (column.cards.length === 0) {
    return card.value === 12;
  }

  const topCard = column.cards[column.cards.length - 1];
  if (!topCard.faceUp) return false;

  // Must alternate color and be one rank lower
  return (
    isAlternatingColor(card, topCard) &&
    getValueRank(card.value) === getValueRank(topCard.value) - 1
  );
}

/** Check if a card can be placed on a foundation pile */
export function canPlaceOnFoundation(card: Card, foundation: FoundationPile): boolean {
  if (foundation.cards.length === 0) {
    // First card must be an As (1)
    return card.value === 1;
  }

  // Must be same suit and next value in sequence
  if (foundation.suit !== card.suit) return false;
  const topCard = foundation.cards[foundation.cards.length - 1];
  const nextVal = getNextValue(topCard.value);
  return nextVal === card.value;
}

/** Get movable stack from a tableau column starting at cardIndex */
export function getMovableStack(column: TableauColumn, cardIndex: number): Card[] | null {
  if (cardIndex < 0 || cardIndex >= column.cards.length) return null;
  if (!column.cards[cardIndex].faceUp) return null;

  // Verify the stack is valid (alternating colors, descending values)
  const stack = column.cards.slice(cardIndex);
  for (let i = 1; i < stack.length; i++) {
    if (
      !isAlternatingColor(stack[i - 1], stack[i]) ||
      getValueRank(stack[i - 1].value) !== getValueRank(stack[i].value) + 1
    ) {
      return null;
    }
  }

  return stack;
}

// ============================================================
// DEAL
// ============================================================

/** Deal cards into tableau and stock */
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

  // Remaining cards go to stock (face-down)
  const stock = deck.slice(cardIndex).map((c) => ({ ...c, faceUp: false }));

  return { tableau, stock };
}

// ============================================================
// WIN CHECK
// ============================================================

/** Check if the game is won (all foundations complete) */
export function checkWin(foundations: FoundationPile[]): boolean {
  return foundations.every((f) => f.cards.length === VALUES.length);
}

// ============================================================
// SOLVER & SOLUTION API (inspiré spiderEngine — pattern cascade oracle)
// ============================================================

/** Solution stockée pour le bouton 💡. */
let _solitaireSolution: GameAction[] = [];
export function getSolitaireSolution(): GameAction[] {
  return [..._solitaireSolution];
}
export function setSolitaireSolutionFromState(state: GameState): void {
  _solitaireSolution = computeSolitaireSolution(state);
}
export function setSolitaireSolutionFromBD(actions: GameAction[]): void {
  _solitaireSolution = [...actions];
}

/**
 * Hash anti-cycle pour le solveur greedy.
 * Inclut tableau, stock len, waste len + top, foundations len, et un compteur
 * de cycles de stock implicite (longueur waste + stock fluctue donc OK).
 */
function hashSolitaireState(s: GameState): string {
  let h = 2166136261;
  for (const col of s.tableau) {
    for (const c of col.cards) {
      h ^= c.value * 31 + c.suit.charCodeAt(0) + (c.faceUp ? 100 : 0);
      h = Math.imul(h, 16777619);
    }
    h ^= 255;
    h = Math.imul(h, 16777619);
  }
  h ^= s.stock.length;
  h = Math.imul(h, 16777619);
  h ^= s.waste.length * 7;
  const wt = s.waste[s.waste.length - 1];
  if (wt) {
    h ^= wt.value * 41 + wt.suit.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  for (const f of s.foundations) {
    h ^= f.cards.length;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Solveur greedy : priorise les coups vers fondation, puis tableau→tableau qui
 * révèlent une carte face-down, puis waste→tableau, puis DRAW. Stop sur cycle.
 */
function computeSolitaireSolution(state: GameState): GameAction[] {
  const moves: GameAction[] = [];
  const visited = new Set<string>();
  visited.add(hashSolitaireState(state));
  let s = state;
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) {
    if (Date.now() - t0 > 800) break;
    if (s.phase === 'won') break;
    const action = pickGreedyAction(s);
    if (!action) break;
    const next = gameReducer(s, action);
    if (next === s) break;
    const h = hashSolitaireState(next);
    if (visited.has(h)) break;
    visited.add(h);
    moves.push(action);
    s = next;
  }
  return moves;
}

/** Choix greedy : foundation > révélateur tableau > waste→tableau > DRAW. */
function pickGreedyAction(state: GameState): GameAction | null {
  // 1) Cartes vers fondation (waste + tableau tops)
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const c = state.tableau[col];
    if (c.cards.length === 0) continue;
    const top = c.cards[c.cards.length - 1];
    if (!top.faceUp) continue;
    for (let f = 0; f < FOUNDATION_PILES; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f])) {
        return {
          type: 'MOVE_TO_FOUNDATION',
          from: { type: 'tableau', index: col, cardIndex: c.cards.length - 1 },
          cardId: top.id,
        };
      }
    }
  }
  if (state.waste.length > 0) {
    const wt = state.waste[state.waste.length - 1];
    for (let f = 0; f < FOUNDATION_PILES; f++) {
      if (canPlaceOnFoundation(wt, state.foundations[f])) {
        return {
          type: 'MOVE_TO_FOUNDATION',
          from: { type: 'waste', index: 0 },
          cardId: wt.id,
        };
      }
    }
  }
  // 2) Tableau→tableau qui révèle une carte face-down (cardIndex > 0 + précédente face-down)
  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const fc = state.tableau[from];
    for (let ci = 0; ci < fc.cards.length; ci++) {
      if (!fc.cards[ci].faceUp) continue;
      const stack = getMovableStack(fc, ci);
      if (!stack) continue;
      // Préférer les déplacements qui révèlent : ci > 0 et carte précédente face-down
      const reveals = ci > 0 && !fc.cards[ci - 1].faceUp;
      if (!reveals) continue;
      for (let to = 0; to < TABLEAU_COLUMNS; to++) {
        if (to === from) continue;
        if (canPlaceOnTableau(stack[0], state.tableau[to])) {
          return {
            type: 'MOVE_CARD',
            from: { type: 'tableau', index: from, cardIndex: ci },
            to: { type: 'tableau', index: to },
          };
        }
      }
    }
  }
  // 3) Waste→tableau
  if (state.waste.length > 0) {
    const wt = state.waste[state.waste.length - 1];
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      if (canPlaceOnTableau(wt, state.tableau[to])) {
        return {
          type: 'MOVE_CARD',
          from: { type: 'waste', index: 0 },
          to: { type: 'tableau', index: to },
        };
      }
    }
  }
  // 4) Stock→waste si stock non vide
  if (state.stock.length > 0) return { type: 'DRAW_FROM_STOCK' };
  // 5) Recycle waste→stock (1 fois max grâce au hash anti-cycle)
  if (state.waste.length > 0) return { type: 'DRAW_FROM_STOCK' };
  return null;
}

/**
 * Cascade oracle : simule la résolution complète. Si la donne mène à `won`
 * via le greedy, elle est garantie solvable. Inspiré de spiderEngine.
 */
function simulateSolitaireCascade(state: GameState, totalTimeoutMs = 800): GameAction[] | null {
  const moves = computeSolitaireSolution(state);
  // Re-vérifie victoire stricte
  let s = state;
  for (const a of moves) {
    const next = gameReducer(s, a);
    if (next === s) return null;
    s = next;
    if (s.phase === 'won') return moves;
  }
  return s.phase === 'won' ? moves : null;
}

// ============================================================
// INITIAL STATE
// ============================================================

export function createInitialState(): GameState {
  const __t0 = Date.now();
  console.log('[Solitaire ES40 Solver] 🎲 Random + cascade oracle (Spider 1-couleur pattern)');

  // STRATÉGIE : random deal + cascade oracle (Spanish 40-card est ~75% solvable
  // naturellement, donc pas besoin de reverse-deal complexe)
  const MAX_ATTEMPTS = 8;
  const baseEmpty: GameState = {
    tableau: [],
    stock: [],
    waste: [],
    foundations: [
      { suit: null, cards: [] },
      { suit: null, cards: [] },
      { suit: null, cards: [] },
      { suit: null, cards: [] },
    ],
    moves: 0,
    phase: 'playing',
  };

  // 1) Random deal + cascade oracle (validation phase=won stricte)
  let bestCand: GameState | null = null;
  let bestSol: GameAction[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { tableau, stock } = dealGame();
    const candidate: GameState = { ...baseEmpty, tableau, stock };
    const sol = simulateSolitaireCascade(candidate);
    if (sol && sol.length > 0) {
      _solitaireSolution = sol;
      console.log(`[Solitaire ES40 Solver] ✅ DONNE RANDOM SOLUBLE (${Date.now() - __t0}ms, attempt ${attempt + 1}/${MAX_ATTEMPTS}) — solution = ${sol.length} coups (validée gagnante)`);
      return candidate;
    }
    // Garde la meilleure tentative partielle pour le fallback
    const partial = computeSolitaireSolution(candidate);
    if (partial.length > bestSol.length) { bestCand = candidate; bestSol = partial; }
  }

  // 2) Fallback : la donne avec la plus longue progression greedy (peut être incomplète)
  const fallback = bestCand ?? (() => {
    const { tableau, stock } = dealGame();
    return { ...baseEmpty, tableau, stock };
  })();
  _solitaireSolution = bestSol.length > 0 ? bestSol : computeSolitaireSolution(fallback);
  console.log(`[Solitaire ES40 Solver] ⚠️ FALLBACK (${Date.now() - __t0}ms) — solution = ${_solitaireSolution.length} coups (best-effort, le smartHint complétera)`);
  return fallback;
}

// ============================================================
// GAME ACTIONS
// ============================================================

/** Draw from stock to waste */
export function drawFromStock(state: GameState): GameState {
  if (state.phase !== 'playing') return state;

  if (state.stock.length === 0) {
    // Recycle waste back to stock
    if (state.waste.length === 0) return state;
    return {
      ...state,
      stock: [...state.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      moves: state.moves + 1,
    };
  }

  const newStock = [...state.stock];
  const drawn = { ...newStock.pop()!, faceUp: true };
  const newWaste = [...state.waste, drawn];

  return {
    ...state,
    stock: newStock,
    waste: newWaste,
    moves: state.moves + 1,
  };
}

/** Flip the top card of a tableau column if face-down */
function revealTopCard(column: TableauColumn): TableauColumn {
  if (column.cards.length === 0) return column;
  const topCard = column.cards[column.cards.length - 1];
  if (topCard.faceUp) return column;

  const newCards = [...column.cards];
  newCards[newCards.length - 1] = { ...topCard, faceUp: true };
  return { cards: newCards };
}

/** Move card(s) between locations */
export function moveCard(state: GameState, from: CardLocation, to: CardLocation): GameState {
  if (state.phase !== 'playing') return state;

  // === From Waste ===
  if (from.type === 'waste') {
    if (state.waste.length === 0) return state;
    const card = state.waste[state.waste.length - 1];

    if (to.type === 'tableau') {
      const targetCol = state.tableau[to.index];
      if (!canPlaceOnTableau(card, targetCol)) return state;

      const newWaste = state.waste.slice(0, -1);
      const newTableau = [...state.tableau];
      newTableau[to.index] = {
        cards: [...targetCol.cards, { ...card, faceUp: true }],
      };

      return { ...state, waste: newWaste, tableau: newTableau, moves: state.moves + 1 };
    }

    if (to.type === 'foundation') {
      const targetFdn = state.foundations[to.index];
      if (!canPlaceOnFoundation(card, targetFdn)) return state;

      const newWaste = state.waste.slice(0, -1);
      const newFoundations = [...state.foundations];
      newFoundations[to.index] = {
        suit: card.suit,
        cards: [...targetFdn.cards, { ...card, faceUp: true }],
      };

      const newState: GameState = {
        ...state,
        waste: newWaste,
        foundations: newFoundations,
        moves: state.moves + 1,
      };

      if (checkWin(newFoundations)) {
        return { ...newState, phase: 'won' };
      }
      return newState;
    }

    return state;
  }

  // === From Tableau ===
  if (from.type === 'tableau') {
    const fromCol = state.tableau[from.index];
    const cardIdx = from.cardIndex ?? fromCol.cards.length - 1;

    if (to.type === 'tableau') {
      const stack = getMovableStack(fromCol, cardIdx);
      if (!stack) return state;

      const targetCol = state.tableau[to.index];
      if (!canPlaceOnTableau(stack[0], targetCol)) return state;

      const newTableau = [...state.tableau];
      const remainingCards = fromCol.cards.slice(0, cardIdx);
      newTableau[from.index] = revealTopCard({ cards: remainingCards });
      newTableau[to.index] = {
        cards: [...targetCol.cards, ...stack.map((c) => ({ ...c, faceUp: true }))],
      };

      return { ...state, tableau: newTableau, moves: state.moves + 1 };
    }

    if (to.type === 'foundation') {
      // Only single card (top of column) can go to foundation
      if (cardIdx !== fromCol.cards.length - 1) return state;
      const card = fromCol.cards[cardIdx];
      if (!card.faceUp) return state;

      const targetFdn = state.foundations[to.index];
      if (!canPlaceOnFoundation(card, targetFdn)) return state;

      const newTableau = [...state.tableau];
      const remainingCards = fromCol.cards.slice(0, -1);
      newTableau[from.index] = revealTopCard({ cards: remainingCards });

      const newFoundations = [...state.foundations];
      newFoundations[to.index] = {
        suit: card.suit,
        cards: [...targetFdn.cards, { ...card, faceUp: true }],
      };

      const newState: GameState = {
        ...state,
        tableau: newTableau,
        foundations: newFoundations,
        moves: state.moves + 1,
      };

      if (checkWin(newFoundations)) {
        return { ...newState, phase: 'won' };
      }
      return newState;
    }

    return state;
  }

  // === From Foundation (to tableau only, for undo/strategy) ===
  if (from.type === 'foundation') {
    const fdn = state.foundations[from.index];
    if (fdn.cards.length === 0) return state;
    const card = fdn.cards[fdn.cards.length - 1];

    if (to.type === 'tableau') {
      const targetCol = state.tableau[to.index];
      if (!canPlaceOnTableau(card, targetCol)) return state;

      const newFoundations = [...state.foundations];
      newFoundations[from.index] = {
        suit: fdn.cards.length > 1 ? fdn.suit : null,
        cards: fdn.cards.slice(0, -1),
      };

      const newTableau = [...state.tableau];
      newTableau[to.index] = {
        cards: [...targetCol.cards, { ...card, faceUp: true }],
      };

      return {
        ...state,
        foundations: newFoundations,
        tableau: newTableau,
        moves: state.moves + 1,
      };
    }

    return state;
  }

  return state;
}

/** Try to auto-move a card to its foundation */
export function moveToFoundation(state: GameState, from: CardLocation, cardId: string): GameState {
  if (state.phase !== 'playing') return state;

  let card: Card | null = null;

  if (from.type === 'waste') {
    if (state.waste.length === 0) return state;
    const top = state.waste[state.waste.length - 1];
    if (top.id !== cardId) return state;
    card = top;
  } else if (from.type === 'tableau') {
    const col = state.tableau[from.index];
    if (col.cards.length === 0) return state;
    const top = col.cards[col.cards.length - 1];
    if (top.id !== cardId || !top.faceUp) return state;
    card = top;
  } else {
    return state;
  }

  if (!card) return state;

  // Find a suitable foundation pile
  for (let i = 0; i < state.foundations.length; i++) {
    if (canPlaceOnFoundation(card, state.foundations[i])) {
      return moveCard(state, from, { type: 'foundation', index: i });
    }
  }

  return state;
}

// ============================================================
// REDUCER
// ============================================================

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'DRAW_FROM_STOCK':
      return drawFromStock(state);

    case 'MOVE_CARD':
      return moveCard(state, action.from, action.to);

    case 'MOVE_TO_FOUNDATION':
      return moveToFoundation(state, action.from, action.cardId);

    case 'AUTO_COMPLETE': {
      // Try to move all possible cards to foundations
      let current = state;
      let changed = true;
      while (changed) {
        changed = false;
        // Try waste
        if (current.waste.length > 0) {
          const top = current.waste[current.waste.length - 1];
          const next = moveToFoundation(
            current,
            { type: 'waste', index: 0 },
            top.id
          );
          if (next !== current) {
            current = next;
            changed = true;
            continue;
          }
        }
        // Try each tableau column
        for (let col = 0; col < TABLEAU_COLUMNS; col++) {
          const column = current.tableau[col];
          if (column.cards.length === 0) continue;
          const top = column.cards[column.cards.length - 1];
          if (!top.faceUp) continue;
          const next = moveToFoundation(
            current,
            { type: 'tableau', index: col },
            top.id
          );
          if (next !== current) {
            current = next;
            changed = true;
            break;
          }
        }
      }
      return current;
    }

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================
// QUERY HELPERS
// ============================================================

/** Get all valid moves from current state (for hint system) */
export function getValidMoves(state: GameState): Array<{ from: CardLocation; to: CardLocation }> {
  const moves: Array<{ from: CardLocation; to: CardLocation }> = [];

  // Waste -> Tableau / Foundation
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    for (let col = 0; col < TABLEAU_COLUMNS; col++) {
      if (canPlaceOnTableau(card, state.tableau[col])) {
        moves.push({ from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: col } });
      }
    }
    for (let f = 0; f < FOUNDATION_PILES; f++) {
      if (canPlaceOnFoundation(card, state.foundations[f])) {
        moves.push({ from: { type: 'waste', index: 0 }, to: { type: 'foundation', index: f } });
      }
    }
  }

  // Tableau -> Tableau / Foundation
  for (let fromCol = 0; fromCol < TABLEAU_COLUMNS; fromCol++) {
    const col = state.tableau[fromCol];
    if (col.cards.length === 0) continue;

    // Top card to foundation
    const topCard = col.cards[col.cards.length - 1];
    if (topCard.faceUp) {
      for (let f = 0; f < FOUNDATION_PILES; f++) {
        if (canPlaceOnFoundation(topCard, state.foundations[f])) {
          moves.push({
            from: { type: 'tableau', index: fromCol, cardIndex: col.cards.length - 1 },
            to: { type: 'foundation', index: f },
          });
        }
      }
    }

    // Stacks to other columns
    for (let ci = 0; ci < col.cards.length; ci++) {
      if (!col.cards[ci].faceUp) continue;
      const stack = getMovableStack(col, ci);
      if (!stack) continue;

      for (let toCol = 0; toCol < TABLEAU_COLUMNS; toCol++) {
        if (toCol === fromCol) continue;
        if (canPlaceOnTableau(stack[0], state.tableau[toCol])) {
          moves.push({
            from: { type: 'tableau', index: fromCol, cardIndex: ci },
            to: { type: 'tableau', index: toCol },
          });
        }
      }
    }
  }

  return moves;
}

/** Count total cards in foundations */
export function getFoundationCount(state: GameState): number {
  return state.foundations.reduce((sum, f) => sum + f.cards.length, 0);
}
