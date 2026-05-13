

// ─── Authentic pair-removal config (used by PairsScreen + _genericPairs engine) ───
import type { PairsConfig } from './_genericPairs';

export const PAIRS_CONFIG: PairsConfig = {
  name: "Pyramide (assouplie)",
  decks: 1,
  layoutKind: "pyramid",
  rows: [1,2,3,4,5,6,7],
  pairRule: "sum",
  pairTarget: 13,
  singleRemovalRank: 13,
  stockEnabled: true,
  stockRecycle: "unlimited",
  stockDrawCount: 1,
  winCondition: "layout-cleared",
};
