/**
 * @file _genericDistribution.ts
 * @description Shared engine for clock-style solitaire variants (Clock Solitaire,
 * Big Ben, Grandfather's Clock, Hickory Dickory Dock, Travellers). Each clock
 * variant arranges 12-13 piles in a circle and the player reveals + distributes
 * cards based on rank (where the card "belongs" on the clock).
 *
 * Scope:
 * - 12 hour piles + 1 center pile (configurable)
 * - Initial deal of N cards per pile
 * - Reveal-and-place mechanic
 * - Win = all piles complete with their target rank
 * - Lose = pivot card is the last needed and no moves remain
 */

import type { Card, Suit, Rank } from './_genericTableau';
import { rngFromSeed, shuffleSeeded } from './_shuffleSeeded';

export interface DistributionConfig {
  name: string;
  decks: 1 | 2;
  /** Number of clock piles (typically 12 for hours). */
  clockPiles: number;
  /** Cards per pile at deal time. */
  cardsPerPile: number;
  /** Has center pivot pile? */
  hasCenterPile: boolean;
  /** Cards in the center pivot at start. */
  centerPileSize: number;
  /** Pile index for each rank (1=A → 0/index in clockPiles). For 12 piles: A=0, 2=1, ..., Q=11; K → center. */
  pileForRank: (rank: Rank) => number; // -1 = center
}

export interface DistributionGameState {
  config: DistributionConfig;
  piles: Card[][];        // length = clockPiles + (hasCenterPile ? 1 : 0); center at index clockPiles
  currentCard: Card | null; // top of the most recent place; drives next move
  exposedCount: number;     // total cards revealed
  moveCount: number;
  won: boolean;
  lost: boolean;
}

export type DistributionAction =
  | { type: 'REVEAL_AND_PLACE' }
  | { type: 'CHECK_WIN' };

// ────────────────────────────────────────────────────────────────────────────

function buildDeck(decks: 1 | 2): Card[] {
  const out: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (let r = 1; r <= 13; r++) {
        out.push({ id: `${names[r] || String(r)}${suit}#${d + 1}`, suit, rank: r as Rank, faceUp: false });
      }
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createInitialStateFor(config: DistributionConfig, seed?: number | string | null): DistributionGameState {
  const rng = rngFromSeed(seed);
  const deck = shuffleSeeded(buildDeck(config.decks), rng);
  const totalPiles = config.clockPiles + (config.hasCenterPile ? 1 : 0);
  const piles: Card[][] = Array.from({ length: totalPiles }, () => []);
  let idx = 0;
  for (let p = 0; p < config.clockPiles; p++) {
    for (let i = 0; i < config.cardsPerPile; i++) {
      const c = deck[idx++];
      if (c) piles[p].push({ ...c, faceUp: false });
    }
  }
  if (config.hasCenterPile) {
    for (let i = 0; i < config.centerPileSize; i++) {
      const c = deck[idx++];
      if (c) piles[config.clockPiles].push({ ...c, faceUp: false });
    }
  }
  // Flip top of center pile to start the chain
  const center = config.hasCenterPile ? piles[config.clockPiles] : piles[0];
  let currentCard: Card | null = null;
  if (center.length > 0) {
    center[center.length - 1] = { ...center[center.length - 1], faceUp: true };
    currentCard = center[center.length - 1];
  }
  return {
    config,
    piles,
    currentCard,
    exposedCount: 1,
    moveCount: 0,
    won: false,
    lost: false,
  };
}

export function gameReducer(state: DistributionGameState, action: DistributionAction): DistributionGameState {
  switch (action.type) {
    case 'REVEAL_AND_PLACE': {
      if (state.won || state.lost || !state.currentCard) return state;
      // Determine target pile based on current card's rank
      const targetIdx = state.config.pileForRank(state.currentCard.rank);
      const actualTargetIdx = targetIdx === -1
        ? (state.config.hasCenterPile ? state.config.clockPiles : -1)
        : targetIdx;
      if (actualTargetIdx < 0) return state;
      const targetPile = state.piles[actualTargetIdx];
      // Find a face-down card in the target pile to reveal
      const faceDownIdx = targetPile.findIndex((c) => !c.faceUp);
      if (faceDownIdx === -1) {
        // No face-down card to reveal: game over (loss if any piles unrevealed)
        const anyHidden = state.piles.some((p) => p.some((c) => !c.faceUp));
        return { ...state, lost: anyHidden, won: !anyHidden, moveCount: state.moveCount + 1 };
      }
      const revealed = { ...targetPile[faceDownIdx], faceUp: true };
      const newTarget = targetPile.slice();
      newTarget[faceDownIdx] = revealed;
      const newPiles = state.piles.slice();
      newPiles[actualTargetIdx] = newTarget;
      const newState: DistributionGameState = {
        ...state,
        piles: newPiles,
        currentCard: revealed,
        exposedCount: state.exposedCount + 1,
        moveCount: state.moveCount + 1,
      };
      // Win check: all piles fully face-up
      const allFaceUp = newPiles.every((p) => p.every((c) => c.faceUp));
      if (allFaceUp) return { ...newState, won: true };
      return newState;
    }
    case 'CHECK_WIN':
      return state;
    default:
      return state;
  }
}

// Default pile-for-rank mapping (12 hour piles + center for Kings)
export function defaultPileForRank(rank: Rank): number {
  if (rank === 13) return -1; // King → center
  return rank - 1; // A=0, 2=1, ..., Q=11
}
