

// ─── Authentic pair-removal config (used by PairsScreen + _genericPairs engine) ───
import type { PairsConfig } from './_genericPairs';

export const PAIRS_CONFIG: PairsConfig = {
  name: "Two Pyramids",
  decks: 1,
  layoutKind: "pyramid",
  rows: [2,4,6,8,10,12,14],
  pairRule: "sum",
  pairTarget: 13,
  singleRemovalRank: 13,
  stockEnabled: true,
  stockRecycle: "none",
  stockDrawCount: 1,
  winCondition: "layout-cleared",
};
