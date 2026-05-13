/**
 * @file GenericTableauScreen.tsx
 * @description Minimalist viable Screen for any variant powered by the
 * GenericTableauEngine. Renders foundations + tableau + stock/waste + reserves +
 * free cells. Tap a card to attempt:
 *   1. Move to a foundation (if valid)
 *   2. Move to the first valid tableau column
 *   3. Move to the first free cell
 *
 * Long-press a card → opens a column picker for explicit destination.
 *
 * Designed to be functional, not pretty. The polished engine-specific screens
 * (KlondikeScreen, SpiderScreen…) are still in solo.tsx for the original 9
 * engines. This screen powers the 30 new engines (Canfield, Castle, Fans).
 */
import React, { useReducer, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import AppHeader from './AppHeader';
import FrenchCard from './FrenchCard';
import HintFlashBanner from './HintFlashBanner';
import GenericGameHeader from './GenericGameHeader';
import GenericStatsBanner from './GenericStatsBanner';
import StockPile from './StockPile';
import { useTheme } from '../contexts/AppProviders';
import { useHints, type Difficulty } from '../game/hintsHook';
import { useGenericActionLog, dumpGenericTableau } from '../game/useGenericActionLog';
import type { Variant } from '../game/variants';
import {
  createInitialStateFor,
  gameReducer,
  canPlaceOnFoundation,
  canStackOnTableau,
  type TableauConfig,
  type GameState,
  type Action,
  type Card as EngineCard,
} from '../game/engines/_genericTableau';
import { useRaceReport } from '../contexts/useRaceReport';
import { useRace } from '../contexts/RaceContext';
import { useGameWithUndo } from '../contexts/useGameWithUndo';
import { useUndos } from '../contexts/useUndos';
import { useAutoClaimDailyOnWin } from '../contexts/useAutoClaimDailyOnWin';
import { useSaveSoloOnWin } from '../contexts/useSaveSoloOnWin';
import FloatingUndoButton from './FloatingUndoButton';

// ─── Lookup the per-variant CONFIG by dynamic import path ──────────────────
import * as canfield_classic from '../game/engines/canfield_classic';
import * as demon from '../game/engines/demon';
import * as storehouse from '../game/engines/storehouse';
import * as selective_canfield from '../game/engines/selective_canfield';
import * as rainbow from '../game/engines/rainbow';
import * as american_toad from '../game/engines/american_toad';
import * as duchess from '../game/engines/duchess';
import * as eagle_wing from '../game/engines/eagle_wing';
import * as acme from '../game/engines/acme';
import * as beleaguered_castle from '../game/engines/beleaguered_castle';
import * as citadel from '../game/engines/citadel';
import * as streets_and_alleys from '../game/engines/streets_and_alleys';
import * as castles_end from '../game/engines/castles_end';
import * as stronghold from '../game/engines/stronghold';
import * as fortress from '../game/engines/fortress';
import * as chessboard from '../game/engines/chessboard';
import * as bastion from '../game/engines/bastion';
import * as penelope from '../game/engines/penelope';
import * as la_belle_lucie from '../game/engines/la_belle_lucie';
import * as trefoil from '../game/engines/trefoil';
import * as shamrocks from '../game/engines/shamrocks';
import * as bristol from '../game/engines/bristol';
import * as fan from '../game/engines/fan';
import * as house_in_the_wood from '../game/engines/house_in_the_wood';
import * as house_on_the_hill from '../game/engines/house_on_the_hill';
import * as falling_star from '../game/engines/falling_star';
import * as clover_leaf from '../game/engines/clover_leaf';
// ── Batch 4 (Royal Coronation / Gypsy / Russian Bezique / Modern Hybrid / French Traditional) ──
import * as king_albert from '../game/engines/king_albert';
import * as raglan from '../game/engines/raglan';
import * as brigade from '../game/engines/brigade';
import * as belvedere from '../game/engines/belvedere';
import * as salic_law from '../game/engines/salic_law';
import * as glencoe from '../game/engines/glencoe';
import * as british_square from '../game/engines/british_square';
import * as royal_cotillion from '../game/engines/royal_cotillion';
import * as gypsy from '../game/engines/gypsy';
import * as easy_gypsy from '../game/engines/easy_gypsy';
import * as whitehead from '../game/engines/whitehead';
import * as blockade from '../game/engines/blockade';
import * as milligan from '../game/engines/milligan';
import * as trusty_twelve from '../game/engines/trusty_twelve';
import * as irmgard from '../game/engines/irmgard';
import * as russian_patience from '../game/engines/russian_patience';
import * as crapette from '../game/engines/crapette';
import * as bezique_solitaire from '../game/engines/bezique_solitaire';
import * as boudoir from '../game/engines/boudoir';
import * as bakers_dozen from '../game/engines/bakers_dozen';
import * as freecell_two_decks from '../game/engines/freecell_two_decks';
import * as carlton from '../game/engines/carlton';
import * as patience_carree from '../game/engines/patience_carree';
import * as quatre_coins from '../game/engines/quatre_coins';
import * as glouton from '../game/engines/glouton';
// ── Batch 5 (Forty Thieves / French Traditional / Modern Hybrid / Spider remaining) ──
import * as maria from '../game/engines/maria';
import * as streets from '../game/engines/streets';
import * as number_ten from '../game/engines/number_ten';
import * as rank_and_file from '../game/engines/rank_and_file';
import * as indian from '../game/engines/indian';
import * as josephine from '../game/engines/josephine';
import * as deuces from '../game/engines/deuces';
import * as corona from '../game/engines/corona';
import * as famous_fifty from '../game/engines/famous_fifty';
import * as big_forty from '../game/engines/big_forty';
import * as drapeaux from '../game/engines/drapeaux';
import * as tapis_vert from '../game/engines/tapis_vert';
import * as belle_lucie_fr from '../game/engines/belle_lucie_fr';
import * as les_huit from '../game/engines/les_huit';
import * as le_cadran from '../game/engines/le_cadran';
import * as la_tour from '../game/engines/la_tour';
import * as la_pendule from '../game/engines/la_pendule';
import * as curds_and_whey from '../game/engines/curds_and_whey';
import * as scuffle from '../game/engines/scuffle';
import * as la_cigale from '../game/engines/la_cigale';
import * as la_fourmi from '../game/engines/la_fourmi';
import * as step_by_step from '../game/engines/step_by_step';
import * as spiderwort from '../game/engines/spiderwort';
import * as will_o_wisp from '../game/engines/will_o_wisp';
import * as beetle from '../game/engines/beetle';
// ── Batch 6 (Spider/FreeCell rem, Pyramid, TriPeaks/Golf, Accordion, Modern Hybrid, Pairs) ──
import * as mrs_mop from '../game/engines/mrs_mop';
import * as penguin from '../game/engines/penguin';
import * as stalactites from '../game/engines/stalactites';
import * as bath from '../game/engines/bath';
import * as super_challenge_freecell from '../game/engines/super_challenge_freecell';
import * as tuts_tomb from '../game/engines/tuts_tomb';
import * as apophis from '../game/engines/apophis';
import * as cheops from '../game/engines/cheops';
import * as relaxed_pyramid from '../game/engines/relaxed_pyramid';
import * as triangle from '../game/engines/triangle';
import * as golf from '../game/engines/golf';
import * as triple_peaks from '../game/engines/triple_peaks';
import * as pumpkin from '../game/engines/pumpkin';
import * as diamond_mine from '../game/engines/diamond_mine';
import * as robert from '../game/engines/robert';
import * as tower_of_hanoy from '../game/engines/tower_of_hanoy';
import * as idle_year from '../game/engines/idle_year';
import * as streets_and_alleys_acc from '../game/engines/streets_and_alleys_acc';
import * as maze from '../game/engines/maze';
import * as display from '../game/engines/display';
import * as strategy_modern from '../game/engines/strategy_modern';
import * as monte_carlo from '../game/engines/monte_carlo';
import * as aces_up from '../game/engines/aces_up';
// ── Batch Final (Yukon Cells, Forty Thieves canonique, Pairs, Numeric/Math, Mahjong, Multiplayer-as-solo) ──
import * as yukon_cells from '../game/engines/yukon_cells';
import * as forty_thieves from '../game/engines/forty_thieves';
import * as nestor from '../game/engines/nestor';
import * as tens from '../game/engines/tens';
import * as pairs from '../game/engines/pairs';
import * as decade from '../game/engines/decade';
import * as vertical from '../game/engines/vertical';
import * as quinze from '../game/engines/quinze';
import * as idiots_delight from '../game/engines/idiots_delight';
import * as aces_and_kings from '../game/engines/aces_and_kings';
import * as calculation from '../game/engines/calculation';
import * as betsy_ross from '../game/engines/betsy_ross';
import * as auld_lang_syne from '../game/engines/auld_lang_syne';
import * as sir_tommy from '../game/engines/sir_tommy';
import * as strategy from '../game/engines/strategy';
import * as lady_betty from '../game/engines/lady_betty';
import * as quadrille from '../game/engines/quadrille';
import * as above_and_below from '../game/engines/above_and_below';
import * as mahjong_cards from '../game/engines/mahjong_cards';
import * as pegged from '../game/engines/pegged';
import * as crystal_cluster from '../game/engines/crystal_cluster';
import * as spite_and_malice from '../game/engines/spite_and_malice';
import * as crapette_2p from '../game/engines/crapette_2p';
import * as nerts from '../game/engines/nerts';
import * as racing_demon from '../game/engines/racing_demon';
import * as double_solitaire from '../game/engines/double_solitaire';

const CONFIGS: Record<string, TableauConfig> = {
  canfield_classic: canfield_classic.CONFIG,
  demon: demon.CONFIG,
  storehouse: storehouse.CONFIG,
  selective_canfield: selective_canfield.CONFIG,
  rainbow: rainbow.CONFIG,
  american_toad: american_toad.CONFIG,
  duchess: duchess.CONFIG,
  eagle_wing: eagle_wing.CONFIG,
  acme: acme.CONFIG,
  beleaguered_castle: beleaguered_castle.CONFIG,
  citadel: citadel.CONFIG,
  streets_and_alleys: streets_and_alleys.CONFIG,
  castles_end: castles_end.CONFIG,
  stronghold: stronghold.CONFIG,
  fortress: fortress.CONFIG,
  chessboard: chessboard.CONFIG,
  bastion: bastion.CONFIG,
  penelope: penelope.CONFIG,
  la_belle_lucie: la_belle_lucie.CONFIG,
  trefoil: trefoil.CONFIG,
  shamrocks: shamrocks.CONFIG,
  bristol: bristol.CONFIG,
  fan: fan.CONFIG,
  house_in_the_wood: house_in_the_wood.CONFIG,
  house_on_the_hill: house_on_the_hill.CONFIG,
  falling_star: falling_star.CONFIG,
  clover_leaf: clover_leaf.CONFIG,
  // Batch 4
  king_albert: king_albert.CONFIG,
  raglan: raglan.CONFIG,
  brigade: brigade.CONFIG,
  belvedere: belvedere.CONFIG,
  salic_law: salic_law.CONFIG,
  glencoe: glencoe.CONFIG,
  british_square: british_square.CONFIG,
  royal_cotillion: royal_cotillion.CONFIG,
  gypsy: gypsy.CONFIG,
  easy_gypsy: easy_gypsy.CONFIG,
  whitehead: whitehead.CONFIG,
  blockade: blockade.CONFIG,
  milligan: milligan.CONFIG,
  trusty_twelve: trusty_twelve.CONFIG,
  irmgard: irmgard.CONFIG,
  russian_patience: russian_patience.CONFIG,
  crapette: crapette.CONFIG,
  bezique_solitaire: bezique_solitaire.CONFIG,
  boudoir: boudoir.CONFIG,
  bakers_dozen: bakers_dozen.CONFIG,
  freecell_two_decks: freecell_two_decks.CONFIG,
  carlton: carlton.CONFIG,
  patience_carree: patience_carree.CONFIG,
  quatre_coins: quatre_coins.CONFIG,
  glouton: glouton.CONFIG,
  // Batch 5
  maria: maria.CONFIG,
  streets: streets.CONFIG,
  number_ten: number_ten.CONFIG,
  rank_and_file: rank_and_file.CONFIG,
  indian: indian.CONFIG,
  josephine: josephine.CONFIG,
  deuces: deuces.CONFIG,
  corona: corona.CONFIG,
  famous_fifty: famous_fifty.CONFIG,
  big_forty: big_forty.CONFIG,
  drapeaux: drapeaux.CONFIG,
  tapis_vert: tapis_vert.CONFIG,
  belle_lucie_fr: belle_lucie_fr.CONFIG,
  les_huit: les_huit.CONFIG,
  le_cadran: le_cadran.CONFIG,
  la_tour: la_tour.CONFIG,
  la_pendule: la_pendule.CONFIG,
  curds_and_whey: curds_and_whey.CONFIG,
  scuffle: scuffle.CONFIG,
  la_cigale: la_cigale.CONFIG,
  la_fourmi: la_fourmi.CONFIG,
  step_by_step: step_by_step.CONFIG,
  spiderwort: spiderwort.CONFIG,
  will_o_wisp: will_o_wisp.CONFIG,
  beetle: beetle.CONFIG,
  // Batch 6
  mrs_mop: mrs_mop.CONFIG,
  penguin: penguin.CONFIG,
  stalactites: stalactites.CONFIG,
  bath: bath.CONFIG,
  super_challenge_freecell: super_challenge_freecell.CONFIG,
  tuts_tomb: tuts_tomb.CONFIG,
  apophis: apophis.CONFIG,
  cheops: cheops.CONFIG,
  relaxed_pyramid: relaxed_pyramid.CONFIG,
  triangle: triangle.CONFIG,
  golf: golf.CONFIG,
  triple_peaks: triple_peaks.CONFIG,
  pumpkin: pumpkin.CONFIG,
  diamond_mine: diamond_mine.CONFIG,
  robert: robert.CONFIG,
  tower_of_hanoy: tower_of_hanoy.CONFIG,
  idle_year: idle_year.CONFIG,
  streets_and_alleys_acc: streets_and_alleys_acc.CONFIG,
  maze: maze.CONFIG,
  display: display.CONFIG,
  strategy_modern: strategy_modern.CONFIG,
  monte_carlo: monte_carlo.CONFIG,
  aces_up: aces_up.CONFIG,
  // Batch Final
  yukon_cells: yukon_cells.CONFIG,
  forty_thieves: forty_thieves.CONFIG,
  nestor: nestor.CONFIG,
  tens: tens.CONFIG,
  pairs: pairs.CONFIG,
  decade: decade.CONFIG,
  vertical: vertical.CONFIG,
  quinze: quinze.CONFIG,
  idiots_delight: idiots_delight.CONFIG,
  aces_and_kings: aces_and_kings.CONFIG,
  calculation: calculation.CONFIG,
  betsy_ross: betsy_ross.CONFIG,
  auld_lang_syne: auld_lang_syne.CONFIG,
  sir_tommy: sir_tommy.CONFIG,
  strategy: strategy.CONFIG,
  lady_betty: lady_betty.CONFIG,
  quadrille: quadrille.CONFIG,
  above_and_below: above_and_below.CONFIG,
  mahjong_cards: mahjong_cards.CONFIG,
  pegged: pegged.CONFIG,
  crystal_cluster: crystal_cluster.CONFIG,
  spite_and_malice: spite_and_malice.CONFIG,
  crapette_2p: crapette_2p.CONFIG,
  nerts: nerts.CONFIG,
  racing_demon: racing_demon.CONFIG,
  double_solitaire: double_solitaire.CONFIG,
};

interface Props {
  variant: Variant;
  difficulty?: string;
}

/**
 * Convert an engine Card (rank 1-13 + suit char) into the deckofcardsapi-style
 * code used by FrenchCard (A/2-9/0/J/Q/K + S/H/D/C). 10 → "0".
 */
function cardCode(c: { rank: number; suit: string }): string {
  const v =
    c.rank === 1 ? 'A' :
    c.rank === 10 ? '0' :
    c.rank === 11 ? 'J' :
    c.rank === 12 ? 'Q' :
    c.rank === 13 ? 'K' :
    String(c.rank);
  return `${v}${c.suit}`;
}

/**
 * Stable signature for an action, used by the anti-cycle history. Two
 * actions with the same signature represent semantically the same "move"
 * for cycle-detection purposes — so the hint won't suggest the same
 * card-to-card shuffle twice in a row.
 */
function actionSig(action: Action, state: GameState): string {
  switch (action.type) {
    case 'TABLEAU_TO_FOUNDATION': {
      const c = state.tableau[action.from]?.[state.tableau[action.from].length - 1];
      return `TF:${c?.id ?? '?'}->${action.foundation}`;
    }
    case 'TABLEAU_TO_TABLEAU': {
      const c = state.tableau[action.from]?.[action.cardIdx];
      return `TT:${c?.id ?? '?'}->${action.to}`;
    }
    case 'WASTE_TO_FOUNDATION': {
      const c = state.waste[state.waste.length - 1];
      return `WF:${c?.id ?? '?'}->${action.foundation}`;
    }
    case 'WASTE_TO_TABLEAU': {
      const c = state.waste[state.waste.length - 1];
      return `WT:${c?.id ?? '?'}->${action.to}`;
    }
    case 'RESERVE_TO_FOUNDATION': return `RF:${action.reserve}->${action.foundation}`;
    case 'RESERVE_TO_TABLEAU': return `RT:${action.reserve}->${action.to}`;
    case 'FREECELL_TO_TABLEAU': return `FT:${action.cell}->${action.to}`;
    case 'FREECELL_TO_FOUNDATION': return `FF:${action.cell}->${action.foundation}`;
    case 'TABLEAU_TO_FREECELL': return `TC:${action.from}->${action.cell}`;
    case 'DRAW_STOCK': return 'DRAW';
    case 'RECYCLE_WASTE': return 'RECYCLE';
    case 'REDEAL_TABLEAU': return 'REDEAL';
    default: return action.type;
  }
}

/**
 * Enumerate all legal hint candidates in PRIORITY order. Each is tagged
 * with its "productivity" — moves that reveal a face-down card or empty
 * a column score higher and are tried first; pure-shuffle TABLEAU↔TABLEAU
 * moves (that don't reveal anything) get the lowest priority so they only
 * fire as a last resort, and even then the anti-cycle history filters
 * out repeats.
 *
 * The caller picks the first candidate whose signature hasn't appeared
 * twice in the recent action history — that's how we break the infinite
 * "move ♠4 to col 5 → move ♠4 back to col 4" loop the user reported.
 */
type HintCandidate = { action: Action; sig: string; productivity: number };
function enumerateHintCandidates(state: GameState): HintCandidate[] {
  const out: HintCandidate[] = [];
  const cfg = state.config;
  const baseRank = state.foundationBaseRankResolved;

  // ── P1: Tableau → Foundation (always productive — frees a column slot) ──
  for (let t = 0; t < state.tableau.length; t++) {
    const pile = state.tableau[t];
    const card = pile[pile.length - 1];
    if (!card || !card.faceUp) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canPlaceOnFoundation(card, top, cfg, baseRank)) {
        const a: Action = { type: 'TABLEAU_TO_FOUNDATION', from: t, foundation: f };
        out.push({ action: a, sig: actionSig(a, state), productivity: 100 });
      }
    }
  }

  // ── P2: Waste → Foundation ──
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    for (let f = 0; f < state.foundations.length; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canPlaceOnFoundation(wasteTop, top, cfg, baseRank)) {
        const a: Action = { type: 'WASTE_TO_FOUNDATION', foundation: f };
        out.push({ action: a, sig: actionSig(a, state), productivity: 90 });
      }
    }
  }

  // ── P3: FreeCell → Foundation ──
  for (let cell = 0; cell < state.freeCells.length; cell++) {
    const c = state.freeCells[cell];
    if (!c) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canPlaceOnFoundation(c, top, cfg, baseRank)) {
        const a: Action = { type: 'FREECELL_TO_FOUNDATION', cell, foundation: f };
        out.push({ action: a, sig: actionSig(a, state), productivity: 85 });
      }
    }
  }

  // ── P4: Reserve → Foundation ──
  for (let r = 0; r < state.reserves.length; r++) {
    const pile = state.reserves[r];
    const top = pile[pile.length - 1];
    if (!top) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      const ftop = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canPlaceOnFoundation(top, ftop, cfg, baseRank)) {
        const a: Action = { type: 'RESERVE_TO_FOUNDATION', reserve: r, foundation: f };
        out.push({ action: a, sig: actionSig(a, state), productivity: 80 });
      }
    }
  }

  // ── P5: Waste → Tableau ──
  if (wasteTop) {
    for (let t = 0; t < state.tableau.length; t++) {
      const target = state.tableau[t][state.tableau[t].length - 1] ?? null;
      if (canStackOnTableau(wasteTop, target, cfg)) {
        const a: Action = { type: 'WASTE_TO_TABLEAU', to: t };
        out.push({ action: a, sig: actionSig(a, state), productivity: 60 });
      }
    }
  }

  // ── P6: Tableau → Tableau (PRODUCTIVE ONLY — reveals face-down / empties) ──
  // This is the cycle-prone branch. We score the move:
  //   - +50 if it would EMPTY the source column (king-can-fill space)
  //   - +40 if it would REVEAL a face-down card underneath the moved block
  //   - skipped if it just shuffles two face-up cards back and forth
  //
  // IMPORTANT: with `multiCardMove: true` engines (Double Solitaire, Yukon,
  // Gypsy…), the engine accepts a `cardIdx` pointing anywhere in the
  // face-up tail — not only the deepest face-up card. We must enumerate
  // EVERY legal startIdx (deepest → top), otherwise single-card moves
  // like ♠10 C6→C1 sneak through unfiltered and the bouncing returns.
  for (let from = 0; from < state.tableau.length; from++) {
    const pile = state.tableau[from];
    if (pile.length === 0) continue;
    // Find the deepest face-up card — that's the floor for `cardIdx`.
    let deepestFaceUp = pile.length - 1;
    if (!pile[deepestFaceUp].faceUp) continue;
    if (cfg.multiCardMove) {
      while (deepestFaceUp > 0 && pile[deepestFaceUp - 1].faceUp) deepestFaceUp--;
    } else {
      // Single-card engines: only the top card is movable.
      deepestFaceUp = pile.length - 1;
    }
    for (let startIdx = deepestFaceUp; startIdx < pile.length; startIdx++) {
      const moving = pile[startIdx];
      const willEmpty = startIdx === 0;
      const willReveal = startIdx > 0 && pile[startIdx - 1].faceUp === false;
      // Pre-filter: if the move would be a pure shuffle, skip it BEFORE
      // even checking destinations. This is what kills the ♠10 ping-pong.
      if (!willEmpty && !willReveal) continue;
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        const target = state.tableau[to][state.tableau[to].length - 1] ?? null;
        if (!canStackOnTableau(moving, target, cfg)) continue;
        const a: Action = { type: 'TABLEAU_TO_TABLEAU', from, cardIdx: startIdx, to };
        out.push({
          action: a,
          sig: actionSig(a, state),
          productivity: willEmpty ? 50 : 40,
        });
      }
    }
  }

  // ── P7: Reserve / FreeCell → Tableau (slot management) ──
  for (let r = 0; r < state.reserves.length; r++) {
    const pile = state.reserves[r];
    const top = pile[pile.length - 1];
    if (!top) continue;
    for (let to = 0; to < state.tableau.length; to++) {
      const target = state.tableau[to][state.tableau[to].length - 1] ?? null;
      if (canStackOnTableau(top, target, cfg)) {
        const a: Action = { type: 'RESERVE_TO_TABLEAU', reserve: r, to };
        out.push({ action: a, sig: actionSig(a, state), productivity: 35 });
      }
    }
  }
  for (let cell = 0; cell < state.freeCells.length; cell++) {
    const c = state.freeCells[cell];
    if (!c) continue;
    for (let to = 0; to < state.tableau.length; to++) {
      const target = state.tableau[to][state.tableau[to].length - 1] ?? null;
      if (canStackOnTableau(c, target, cfg)) {
        const a: Action = { type: 'FREECELL_TO_TABLEAU', cell, to };
        out.push({ action: a, sig: actionSig(a, state), productivity: 30 });
      }
    }
  }

  // ── P8: DRAW_STOCK — always a fresh card, can never cycle ──
  if (cfg.stockEnabled && state.stock.length > 0) {
    out.push({ action: { type: 'DRAW_STOCK' }, sig: 'DRAW', productivity: 20 });
  }

  // ── P9: RECYCLE_WASTE — last resort ──
  if (cfg.stockEnabled && state.waste.length > 0 && cfg.stockRecycle !== 'none') {
    const limit = typeof cfg.stockRecycle === 'number' ? cfg.stockRecycle : Infinity;
    if (state.stockRecyclesUsed < limit) {
      out.push({ action: { type: 'RECYCLE_WASTE' }, sig: 'RECYCLE', productivity: 10 });
    }
  }

  // Sort by productivity descending.
  out.sort((a, b) => b.productivity - a.productivity);
  return out;
}

/**
 * Pick the first hint candidate whose signature passes all 3 anti-cycle
 * guards:
 *
 *   1. **No-immediate-reverse** — if the last hint moved ♠10 from C6→C1,
 *      reject any "move ♠10 from C1→C6" candidate this turn (bouncing
 *      can't even start).
 *   2. **Card-id frequency cap** — if the same card has been moved 3+
 *      times in the last 8 hints, refuse to suggest moving it again
 *      until something else displaces it from the history.
 *   3. **Signature de-dupe** — if an exact `(card, destination)` signature
 *      already appears twice in the history, reject (catches more subtle
 *      3-step cycles like A→B→C→A).
 *
 * Returns the action AND signature so the caller can push the sig into
 * the history ring buffer.
 */
function pickNonCyclicHint(
  state: GameState,
  history: string[],
): { action: Action; sig: string } | null {
  const candidates = enumerateHintCandidates(state);
  const lastSig = history[history.length - 1];

  // Pre-compute per-card occurrence counts for guard #2.
  const cardCount: Record<string, number> = {};
  for (const s of history) {
    // Extract card id from sigs like "TT:♠10#1->5" / "TF:♠A#1->3" / "WT:♣6#1->2"
    const m = s.match(/^[A-Z]{2}:([^-]+)->/);
    if (m) cardCount[m[1]] = (cardCount[m[1]] ?? 0) + 1;
  }

  for (const c of candidates) {
    // Guard #1: no-immediate-reverse for tableau moves
    if (lastSig && isReverseTableauMove(lastSig, c.sig)) continue;
    // Guard #2: per-card frequency cap (only tableau/waste card moves)
    const cardMatch = c.sig.match(/^[A-Z]{2}:([^-]+)->/);
    if (cardMatch) {
      const cardId = cardMatch[1];
      if ((cardCount[cardId] ?? 0) >= 3) continue;
    }
    // Guard #3: signature de-dupe (existing rule, hardened to ≥ 2)
    const occurrences = history.filter((s) => s === c.sig).length;
    if (occurrences >= 2) continue;
    return { action: c.action, sig: c.sig };
  }
  return null;
}

/**
 * Returns true when two consecutive TT signatures form an A→B then B→A
 * pair on the same card id. Used to reject immediate-reverse candidates.
 */
function isReverseTableauMove(lastSig: string, nextSig: string): boolean {
  // Only Tableau↔Tableau bouncing is the typical immediate-reverse case.
  // (WT/TF/WF are productive — even repeated, they don't cycle since the
  // engine state has moved on irreversibly.)
  if (!lastSig.startsWith('TT:') || !nextSig.startsWith('TT:')) return false;
  // Same card id? If we just moved ♠10#1 and we're about to move ♠10#1
  // again, it's reverse direction by definition (the engine wouldn't
  // accept the same forward move twice in a row anyway).
  const lastCard = lastSig.match(/^TT:([^-]+)->/)?.[1];
  const nextCard = nextSig.match(/^TT:([^-]+)->/)?.[1];
  return !!lastCard && lastCard === nextCard;
}

/**
 * Given an Action that's about to be dispatched, return the id of the card
 * that will be moving — so the UI can briefly glow that card before it
 * disappears from its source pile. Returns null for stockless actions
 * (DRAW_STOCK / RECYCLE_WASTE).
 */
function sourceCardIdOf(state: GameState, action: Action): string | null {
  switch (action.type) {
    case 'TABLEAU_TO_FOUNDATION':
    case 'TABLEAU_TO_FREECELL': {
      const pile = state.tableau[action.from];
      return pile?.[pile.length - 1]?.id ?? null;
    }
    case 'TABLEAU_TO_TABLEAU': {
      const pile = state.tableau[action.from];
      return pile?.[action.cardIdx]?.id ?? null;
    }
    case 'WASTE_TO_FOUNDATION':
    case 'WASTE_TO_TABLEAU':
      return state.waste[state.waste.length - 1]?.id ?? null;
    case 'RESERVE_TO_FOUNDATION':
    case 'RESERVE_TO_TABLEAU': {
      const pile = state.reserves[action.reserve];
      return pile?.[pile.length - 1]?.id ?? null;
    }
    case 'FREECELL_TO_TABLEAU':
    case 'FREECELL_TO_FOUNDATION':
      return state.freeCells[action.cell]?.id ?? null;
    default:
      return null;
  }
}

export default function GenericTableauScreen({ variant, difficulty }: Props) {
  const config = CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  // `runId` bumps on Restart → forces React to remount <Inner>, which causes
  // useGameWithUndo to re-run the lazyInit and deal a fresh game.
  const [runId, setRunId] = useState(0);
  // Bumps every time the player presses 💡 so <Inner> can briefly flash a
  // valid move source. The actual highlight logic lives inside Inner — this
  // counter is just the "ping" channel.
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration introuvable pour: {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => {
    hints.reset();
    setRunId((n) => n + 1);
  };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[GenericTableauScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
    if (!hints.canUseHint) return;
    hints.consume();
    setHintTick((n) => n + 1);
  };
  return (
    <View style={S.root}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader title={variant.name} subtitle={variant.shortDesc} showBack />
      <GenericGameHeader
        difficulty={d}
        hints={hints}
        onHint={onHint}
        onReset={onRestart}
        subLabel={`${config.decks === 2 ? '2 jeux' : '1 jeu'} • ${config.tableauColumns} col`}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: TableauConfig; variant: Variant; hintTick: number }) {
  const { t } = useTranslation();
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.foundations.reduce((sum, p) => sum + p.length, 0),
    moves: state.moveCount,
    finished: !!state.won,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  // Enregistre le résultat sur le backend pour qu'il apparaisse dans les
  // leaderboards (top-100, daily, race-ELO). Skip auto en mode local.
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: state.foundations.reduce((sum, p) => sum + p.length, 0),
    moves: state.moveCount,
  });
  // Action log: emits `🎯 Coup #N + 📋 État après coup` after every move,
  // matching the Klondike screen's log format so the variant traces look
  // identical in the Metro console.
  const totalFoundationCards = state.foundations.reduce((sum, p) => sum + p.length, 0);
  const totalCardsExpected = state.config.decks * 52;
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: totalFoundationCards,
    extra: `fondations=${totalFoundationCards}/${totalCardsExpected}`,
    dump: () => dumpGenericTableau(state),
  });
  const [selected, setSelected] = useState<{ kind: 'tab' | 'res' | 'cell' | 'waste'; idx: number; cardIdx?: number } | null>(null);
  // ── Hint: actually PLAY the suggested move (Klondike style) ──────────
  // The wrapper bumps `hintTick` whenever the player taps 💡. We snapshot
  // the source card id for a brief glow (so the player sees WHICH card
  // moved) and then dispatch the action — the engine animates the move
  // because `dispatch` updates state and React re-renders.
  const [hintCardId, setHintCardId] = useState<string | null>(null);
  // Keep a ref to the latest state so the effect always reads fresh data
  // without re-firing on every state change (we only want to react to a
  // new `hintTick` press).
  const stateRef = React.useRef(state);
  stateRef.current = state;
  // Anti-cycle history: signatures of the last 8 hint actions. When the
  // user spams 💡 in a position where ♠4 can swap between cols 4 and 5,
  // the productivity filter rejects the pure-shuffle in the first place,
  // but for free-cell oscillation or king-only-empty-col scenarios where
  // a shuffle IS technically productive (reveals face-down) we still
  // could loop. Two occurrences of the same signature = blocked.
  const hintHistoryRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    if (hintTick === 0) return;
    const picked = pickNonCyclicHint(stateRef.current, hintHistoryRef.current);
    if (!picked) {
      // eslint-disable-next-line no-console
      console.log(`[GenericTableauScreen.Inner] hintTick=${hintTick} → aucun coup non-cyclique (position figée)`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[GenericTableauScreen.Inner] hintTick=${hintTick} → action=${picked.action.type} sig=${picked.sig}`);
    hintHistoryRef.current.push(picked.sig);
    if (hintHistoryRef.current.length > 8) hintHistoryRef.current.shift();
    // Capture the source card id so we can flash it for the player.
    const sourceId = sourceCardIdOf(stateRef.current, picked.action);
    if (sourceId) {
      setHintCardId(sourceId);
      setTimeout(() => setHintCardId(null), 1200);
    }
    dispatch(picked.action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  const tryMove = useCallback((from: typeof selected, to: { kind: 'tab' | 'foundation' | 'cell'; idx: number }) => {
    if (!from) return;
    if (from.kind === 'tab') {
      if (to.kind === 'tab') dispatch({ type: 'TABLEAU_TO_TABLEAU', from: from.idx, cardIdx: from.cardIdx ?? state.tableau[from.idx].length - 1, to: to.idx });
      else if (to.kind === 'foundation') dispatch({ type: 'TABLEAU_TO_FOUNDATION', from: from.idx, foundation: to.idx });
      else if (to.kind === 'cell') dispatch({ type: 'TABLEAU_TO_FREECELL', from: from.idx, cell: to.idx });
    } else if (from.kind === 'res') {
      if (to.kind === 'tab') dispatch({ type: 'RESERVE_TO_TABLEAU', reserve: from.idx, to: to.idx });
      else if (to.kind === 'foundation') dispatch({ type: 'RESERVE_TO_FOUNDATION', reserve: from.idx, foundation: to.idx });
    } else if (from.kind === 'cell') {
      if (to.kind === 'tab') dispatch({ type: 'FREECELL_TO_TABLEAU', cell: from.idx, to: to.idx });
      else if (to.kind === 'foundation') dispatch({ type: 'FREECELL_TO_FOUNDATION', cell: from.idx, foundation: to.idx });
    } else if (from.kind === 'waste') {
      if (to.kind === 'tab') dispatch({ type: 'WASTE_TO_TABLEAU', to: to.idx });
      else if (to.kind === 'foundation') dispatch({ type: 'WASTE_TO_FOUNDATION', foundation: to.idx });
    }
    setSelected(null);
  }, [state.tableau]);

  // Tap pile/card handler with two-step select-and-place flow
  const onPilePress = (kind: 'tab' | 'res' | 'cell' | 'waste' | 'foundation', idx: number, cardIdx?: number) => {
    if (selected) {
      if (kind === 'tab' || kind === 'foundation' || kind === 'cell') {
        tryMove(selected, { kind, idx });
      } else {
        setSelected({ kind, idx, cardIdx });
      }
    } else {
      if (kind === 'foundation') return;
      setSelected({ kind, idx, cardIdx });
    }
  };

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'FONDATIONS', value: `${totalFoundationCards}/${totalCardsExpected}` },
            { label: 'STOCK', value: state.stock.length },
          ]}
        />
        {/* Foundations */}
        <View style={S.row}>
          {state.foundations.map((f, i) => (
            <CardSlot key={i} card={f[f.length - 1]} highlighted={false} onPress={() => onPilePress('foundation', i)} placeholder="A" />
          ))}
          {/* Stock / waste — dos de carte française (FrenchCard BACK)
              avec badge compteur, au lieu du texte "↩76" précédent. */}
          {config.stockEnabled && (
            <>
              <View style={{ width: 8 }} />
              <StockPile
                count={state.stock.length}
                canRecycle={config.stockRecycle !== 'none' && state.waste.length > 0}
                onPress={() => state.stock.length > 0 ? dispatch({ type: 'DRAW_STOCK' }) : dispatch({ type: 'RECYCLE_WASTE' })}
              />
              <CardSlot
                card={state.waste[state.waste.length - 1]}
                highlighted={selected?.kind === 'waste'}
                hinted={!!hintCardId && state.waste[state.waste.length - 1]?.id === hintCardId}
                onPress={() => onPilePress('waste', 0)}
              />
            </>
          )}
        </View>

        {/* Free cells */}
        {config.freeCells > 0 && (
          <View style={S.row}>
            {state.freeCells.map((c, i) => (
              <CardSlot key={i} card={c} highlighted={selected?.kind === 'cell' && selected.idx === i} onPress={() => onPilePress('cell', i)} placeholder="·" />
            ))}
          </View>
        )}

        {/* Reserves */}
        {config.reservePiles > 0 && (
          <View style={S.row}>
            {state.reserves.map((r, i) => (
              <CardSlot key={i} card={r[r.length - 1]} highlighted={selected?.kind === 'res' && selected.idx === i} onPress={() => onPilePress('res', i)} placeholder={`R${r.length}`} />
            ))}
          </View>
        )}

        {/* Tableau */}
        <View style={S.tableauWrap}>
          {state.tableau.map((col, i) => (
            <View key={i} style={S.column}>
              {col.length === 0 ? (
                <CardSlot card={null} highlighted={false} placeholder="·" onPress={() => onPilePress('tab', i)} />
              ) : (
                col.map((c, j) => (
                  <View key={c.id} style={{ marginTop: j === 0 ? 0 : -36 }}>
                    {/* Face-down cards render the BACK graphic instead of a
                        blank slot — matches Klondike's polish. */}
                    <CardSlot
                      card={c}
                      faceDown={!c.faceUp}
                      highlighted={selected?.kind === 'tab' && selected.idx === i && (selected.cardIdx ?? col.length - 1) === j}
                      hinted={hintCardId === c.id}
                      onPress={() => onPilePress('tab', i, j)}
                      placeholder="·"
                    />
                  </View>
                ))
              )}
            </View>
          ))}
        </View>

        {state.won && (
          <View style={S.winOverlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>Mouvements : {state.moveCount}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * CardSlot renders a single 46×64 slot.
 *
 * Two render paths:
 *  - When `card` is provided AND face-up → renders the real `FrenchCard`
 *    graphic (PNG asset matching Klondike). Face-down cards render the
 *    "BACK" graphic. This matches the polished look of KlondikeScreen
 *    instead of the bare text-only fallback the screen had before.
 *  - When `card` is null/undefined → an empty placeholder slot (used for
 *    empty foundations, free cells, stock/waste hints, etc.). The
 *    `placeholder` text is shown in faint green felt so the player can
 *    still read context like "↩76" (cards left in stock) or "A" (the
 *    expected foundation rank).
 */
function CardSlot({ card, highlighted, onPress, placeholder, faceDown, hinted }: { card: EngineCard | null | undefined; highlighted: boolean; onPress?: () => void; placeholder?: string; faceDown?: boolean; hinted?: boolean }) {
  const showBack = !!card && (faceDown || card.faceUp === false);
  const showFace = !!card && !showBack;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[S.cardWrap, highlighted && S.cardWrapHi, hinted && S.cardWrapHint]}>
      {showFace ? (
        <FrenchCard code={cardCode(card!)} width={46} height={64} />
      ) : showBack ? (
        <FrenchCard code="BACK" width={46} height={64} />
      ) : (
        <View style={S.emptySlot}>
          <Text style={S.placeholder}>{placeholder ?? '·'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  innerRoot: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12, paddingBottom: 80 },
  title: { color: '#FCD34D', fontSize: 20, fontFamily: 'Inter-Black', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' },
  tableauWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 6 },
  column: { width: 50, marginBottom: 10 },
  // Wrapper around <FrenchCard /> — holds the highlight ring outside the
  // image so the PNG stays crisp. Felt-friendly dashed border for empty
  // slots (matches Klondike's "DÉFAUSSE" placeholder style).
  cardWrap: { borderRadius: 8 },
  cardWrapHi: { borderWidth: 2, borderColor: '#FCD34D', borderRadius: 10, padding: 0 },
  cardWrapHint: { borderWidth: 3, borderColor: '#22D3EE', borderRadius: 12, shadowColor: '#22D3EE', shadowOpacity: 0.9, shadowRadius: 8 },
  emptySlot: { width: 46, height: 64, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  placeholder: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700' },
  winOverlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(124,58,237,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 14, marginTop: 4 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 16 },
});
