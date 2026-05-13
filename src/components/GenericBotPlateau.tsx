/**
 * @file GenericBotPlateau.tsx
 * @description Mini plateau du bot pour les variantes utilisant les 7
 * moteurs génériques (generic_tableau, generic_distribution, pairs, math,
 * golf_chain, spider_v2, maze).
 *
 * VsBotOverlay couvre seulement les 9 moteurs legacy (klondike/spider/
 * freecell/yukon/golf/pyramid/tripeaks/fortythieves/accordion) parce qu'il
 * suppose une state-shape `tableau[i].cards` propre à ces engines. Les
 * moteurs génériques utilisent `tableau: Card[][]` (sans wrapper `.cards`)
 * et leurs propres types d'actions (DRAW_STOCK, REVEAL_AND_PLACE, MOVE,
 * SELECT…). Ce composant gère cette state-shape unifiée + l'aiguillage
 * par variante (lookup CONFIG dans le bon CONFIGS map).
 *
 * Affiche un mini-plateau de 12 colonnes max (ScrollView horizontal si
 * débordement), avec foundations + stock/waste en haut. Tick le bot via
 * un setInterval qui dispatch une action légale à chaque pulse.
 */
import React, { useEffect, useReducer, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FRENCH_CARD_IMAGES } from './FrenchCard';
import type { Variant } from '../game/variants';

// ─── Imports des moteurs génériques + CONFIGS map ────────────────────────
import {
  createInitialStateFor as initTableau,
  gameReducer as reduceTableau,
  canPlaceOnFoundation as canFoundT,
  canStackOnTableau as canStackT,
} from '../game/engines/_genericTableau';
import {
  createInitialStateFor as initDist,
  gameReducer as reduceDist,
} from '../game/engines/_genericDistribution';
import {
  createInitialStateFor as initPairs,
  gameReducer as reducePairs,
  arePair,
  canRemoveSingle,
  getCardAt,
  listAccessibleLocations,
} from '../game/engines/_genericPairs';
import {
  createInitialStateFor as initMath,
  gameReducer as reduceMath,
  listValidFoundations as listMathFoundations,
} from '../game/engines/_genericMath';
import {
  createInitialStateFor as initGolf,
  gameReducer as reduceGolf,
  listPlayableCells,
} from '../game/engines/_genericGolf';
import {
  createInitialStateFor as initSpiderV2,
  gameReducer as reduceSpiderV2,
  isMovableBlock,
  canStackOn as canStackSpider,
} from '../game/engines/_genericSpider';
import {
  createInitialStateFor as initMaze,
  gameReducer as reduceMaze,
  listFillableHoles,
} from '../game/engines/_mazeEngine';

// Per-variant config modules — generic_tableau family (~70 variants)
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
import * as penguin from '../game/engines/penguin';
import * as stalactites from '../game/engines/stalactites';
import * as bath from '../game/engines/bath';
import * as super_challenge_freecell from '../game/engines/super_challenge_freecell';
import * as tower_of_hanoy from '../game/engines/tower_of_hanoy';
import * as idle_year from '../game/engines/idle_year';
import * as streets_and_alleys_acc from '../game/engines/streets_and_alleys_acc';
import * as mazeT from '../game/engines/maze';
import * as display from '../game/engines/display';
import * as strategy_modern from '../game/engines/strategy_modern';
import * as yukon_cells from '../game/engines/yukon_cells';
import * as forty_thieves from '../game/engines/forty_thieves';
import * as spite_and_malice from '../game/engines/spite_and_malice';
import * as crapette_2p from '../game/engines/crapette_2p';
import * as nerts from '../game/engines/nerts';
import * as racing_demon from '../game/engines/racing_demon';
import * as double_solitaire from '../game/engines/double_solitaire';

// Distribution family
import * as clock_solitaire from '../game/engines/clock_solitaire';
import * as big_ben from '../game/engines/big_ben';
import * as grandfathers_clock from '../game/engines/grandfathers_clock';
import * as hickory_dickory_dock from '../game/engines/hickory_dickory_dock';
import * as travellers from '../game/engines/travellers';

// Pairs family
import * as pyramid_classic from '../game/engines/pyramid_classic';
import * as pyramid_relaxed from '../game/engines/pyramid_relaxed';
import * as giza from '../game/engines/giza';
import * as two_pyramids from '../game/engines/two_pyramids';
import * as pharaoh from '../game/engines/pharaoh';
import * as tuts_tomb from '../game/engines/tuts_tomb';
import * as apophis from '../game/engines/apophis';
import * as cheops from '../game/engines/cheops';
import * as triangle from '../game/engines/triangle';
import * as relaxed_pyramid from '../game/engines/relaxed_pyramid';
import * as monte_carlo from '../game/engines/monte_carlo';
import * as aces_up from '../game/engines/aces_up';
import * as nestor from '../game/engines/nestor';
import * as tens from '../game/engines/tens';
import * as pairsVariant from '../game/engines/pairs';
import * as decade from '../game/engines/decade';
import * as vertical from '../game/engines/vertical';
import * as quinze from '../game/engines/quinze';
import * as idiots_delight from '../game/engines/idiots_delight';
import * as aces_and_kings from '../game/engines/aces_and_kings';
import * as mahjong_cards from '../game/engines/mahjong_cards';
import * as pegged from '../game/engines/pegged';
import * as crystal_cluster from '../game/engines/crystal_cluster';

// Math family
import * as calculation from '../game/engines/calculation';
import * as betsy_ross from '../game/engines/betsy_ross';
import * as auld_lang_syne from '../game/engines/auld_lang_syne';
import * as sir_tommy from '../game/engines/sir_tommy';
import * as strategy from '../game/engines/strategy';
import * as lady_betty from '../game/engines/lady_betty';
import * as quadrille from '../game/engines/quadrille';
import * as above_and_below from '../game/engines/above_and_below';

// Golf-chain family
import * as golfVar from '../game/engines/golf';
import * as triple_peaks from '../game/engines/triple_peaks';
import * as pumpkin from '../game/engines/pumpkin';
import * as diamond_mine from '../game/engines/diamond_mine';
import * as robert from '../game/engines/robert';

// Spider V2 family
import * as spiderwort from '../game/engines/spiderwort';
import * as will_o_wisp from '../game/engines/will_o_wisp';
import * as beetle from '../game/engines/beetle';
import * as mrs_mop from '../game/engines/mrs_mop';

// ─── CONFIG LOOKUP MAPS ──────────────────────────────────────────────────
const TABLEAU_CONFIGS: Record<string, any> = {
  canfield_classic: canfield_classic.CONFIG, demon: demon.CONFIG, storehouse: storehouse.CONFIG,
  selective_canfield: selective_canfield.CONFIG, rainbow: rainbow.CONFIG, american_toad: american_toad.CONFIG,
  duchess: duchess.CONFIG, eagle_wing: eagle_wing.CONFIG, acme: acme.CONFIG,
  beleaguered_castle: beleaguered_castle.CONFIG, citadel: citadel.CONFIG, streets_and_alleys: streets_and_alleys.CONFIG,
  castles_end: castles_end.CONFIG, stronghold: stronghold.CONFIG, fortress: fortress.CONFIG,
  chessboard: chessboard.CONFIG, bastion: bastion.CONFIG, penelope: penelope.CONFIG,
  la_belle_lucie: la_belle_lucie.CONFIG, trefoil: trefoil.CONFIG, shamrocks: shamrocks.CONFIG,
  bristol: bristol.CONFIG, fan: fan.CONFIG, house_in_the_wood: house_in_the_wood.CONFIG,
  house_on_the_hill: house_on_the_hill.CONFIG, falling_star: falling_star.CONFIG, clover_leaf: clover_leaf.CONFIG,
  king_albert: king_albert.CONFIG, raglan: raglan.CONFIG, brigade: brigade.CONFIG,
  belvedere: belvedere.CONFIG, salic_law: salic_law.CONFIG, glencoe: glencoe.CONFIG,
  british_square: british_square.CONFIG, royal_cotillion: royal_cotillion.CONFIG, gypsy: gypsy.CONFIG,
  easy_gypsy: easy_gypsy.CONFIG, whitehead: whitehead.CONFIG, blockade: blockade.CONFIG,
  milligan: milligan.CONFIG, trusty_twelve: trusty_twelve.CONFIG, irmgard: irmgard.CONFIG,
  russian_patience: russian_patience.CONFIG, crapette: crapette.CONFIG, bezique_solitaire: bezique_solitaire.CONFIG,
  boudoir: boudoir.CONFIG, bakers_dozen: bakers_dozen.CONFIG, freecell_two_decks: freecell_two_decks.CONFIG,
  carlton: carlton.CONFIG, patience_carree: patience_carree.CONFIG, quatre_coins: quatre_coins.CONFIG,
  glouton: glouton.CONFIG, maria: maria.CONFIG, streets: streets.CONFIG, number_ten: number_ten.CONFIG,
  rank_and_file: rank_and_file.CONFIG, indian: indian.CONFIG, josephine: josephine.CONFIG,
  deuces: deuces.CONFIG, corona: corona.CONFIG, famous_fifty: famous_fifty.CONFIG,
  big_forty: big_forty.CONFIG, drapeaux: drapeaux.CONFIG, tapis_vert: tapis_vert.CONFIG,
  belle_lucie_fr: belle_lucie_fr.CONFIG, les_huit: les_huit.CONFIG, le_cadran: le_cadran.CONFIG,
  la_tour: la_tour.CONFIG, la_pendule: la_pendule.CONFIG, curds_and_whey: curds_and_whey.CONFIG,
  scuffle: scuffle.CONFIG, la_cigale: la_cigale.CONFIG, la_fourmi: la_fourmi.CONFIG,
  step_by_step: step_by_step.CONFIG, penguin: penguin.CONFIG, stalactites: stalactites.CONFIG,
  bath: bath.CONFIG, super_challenge_freecell: super_challenge_freecell.CONFIG, tower_of_hanoy: tower_of_hanoy.CONFIG,
  idle_year: idle_year.CONFIG, streets_and_alleys_acc: streets_and_alleys_acc.CONFIG,
  maze: mazeT.CONFIG, display: display.CONFIG, strategy_modern: strategy_modern.CONFIG,
  yukon_cells: yukon_cells.CONFIG, forty_thieves: forty_thieves.CONFIG, spite_and_malice: spite_and_malice.CONFIG,
  crapette_2p: crapette_2p.CONFIG, nerts: nerts.CONFIG, racing_demon: racing_demon.CONFIG,
  double_solitaire: double_solitaire.CONFIG,
};
const DISTRIBUTION_CONFIGS: Record<string, any> = {
  clock_solitaire: clock_solitaire.CONFIG, big_ben: big_ben.CONFIG, grandfathers_clock: grandfathers_clock.CONFIG,
  hickory_dickory_dock: hickory_dickory_dock.CONFIG, travellers: travellers.CONFIG,
};
const PAIRS_CONFIGS: Record<string, any> = {
  pyramid_classic: pyramid_classic.PAIRS_CONFIG, pyramid_relaxed: pyramid_relaxed.PAIRS_CONFIG,
  giza: giza.PAIRS_CONFIG, two_pyramids: two_pyramids.PAIRS_CONFIG, pharaoh: pharaoh.PAIRS_CONFIG,
  tuts_tomb: tuts_tomb.PAIRS_CONFIG, apophis: apophis.PAIRS_CONFIG, cheops: cheops.PAIRS_CONFIG,
  triangle: triangle.PAIRS_CONFIG, relaxed_pyramid: relaxed_pyramid.PAIRS_CONFIG,
  monte_carlo: monte_carlo.PAIRS_CONFIG, aces_up: aces_up.PAIRS_CONFIG, nestor: nestor.PAIRS_CONFIG,
  tens: tens.PAIRS_CONFIG, pairs: pairsVariant.PAIRS_CONFIG, decade: decade.PAIRS_CONFIG,
  vertical: vertical.PAIRS_CONFIG, quinze: quinze.PAIRS_CONFIG, idiots_delight: idiots_delight.PAIRS_CONFIG,
  aces_and_kings: aces_and_kings.PAIRS_CONFIG, mahjong_cards: mahjong_cards.PAIRS_CONFIG,
  pegged: pegged.PAIRS_CONFIG, crystal_cluster: crystal_cluster.PAIRS_CONFIG,
};
const MATH_CONFIGS: Record<string, any> = {
  calculation: calculation.MATH_CONFIG, betsy_ross: betsy_ross.MATH_CONFIG,
  auld_lang_syne: auld_lang_syne.MATH_CONFIG, sir_tommy: sir_tommy.MATH_CONFIG,
  strategy: strategy.MATH_CONFIG, lady_betty: lady_betty.MATH_CONFIG,
  quadrille: quadrille.MATH_CONFIG, above_and_below: above_and_below.MATH_CONFIG,
};
const GOLF_CONFIGS: Record<string, any> = {
  golf: golfVar.GOLF_CONFIG, triple_peaks: triple_peaks.GOLF_CONFIG,
  pumpkin: pumpkin.GOLF_CONFIG, diamond_mine: diamond_mine.GOLF_CONFIG, robert: robert.GOLF_CONFIG,
};
const SPIDER_CONFIGS: Record<string, any> = {
  spiderwort: spiderwort.SPIDER_CONFIG, will_o_wisp: will_o_wisp.SPIDER_CONFIG,
  beetle: beetle.SPIDER_CONFIG, mrs_mop: mrs_mop.SPIDER_CONFIG,
};
const MAZE_CONFIGS: Record<string, any> = {
  maze: mazeT.MAZE_CONFIG,
};

// ─── Convert engine Card (rank + suit char) to FRENCH card code ──────────
function codeFromCard(c: any): string | null {
  if (!c) return null;
  const r = c.rank;
  if (typeof r !== 'number') return null;
  const v = r === 1 ? 'A' : r === 10 ? '0' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);
  const s = c.suit;
  if (!s || typeof s !== 'string') return null;
  return `${v}${s}`;
}

const BOT_TICK_MS: Record<string, number> = {
  easy: 4000, medium: 2500, hard: 1500, expert: 800,
};

interface Props {
  variant: Variant;
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  userWon?: boolean;
  onReplay?: () => void;
  onQuit?: () => void;
}

/**
 * Type-erased adapter — each engine family builds one of these. The
 * GenericBotPlateau picks the right adapter at construction time based
 * on `variant.engine`, then drives it with a generic reducer hook.
 */
interface Adapter {
  engineLabel: string;
  initial: () => any;
  reducer: (state: any, action: any) => any;
  /** Pick the next action to advance the bot. Returns null if blocked. */
  nextAction: (state: any) => any | null;
  /** Renders the mini-plateau. */
  renderMini: (state: any) => React.ReactNode;
  /** Reads `won` flag from state. */
  isWon: (state: any) => boolean;
  /** Move counter for stats. */
  moves: (state: any) => number;
  /** Score / score-equivalent for stats banner. */
  score: (state: any) => number;
}

function buildAdapter(v: Variant): Adapter | null {
  switch (v.engine) {
    case 'generic_tableau': {
      const cfg = TABLEAU_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Tableau',
        initial: () => initTableau(cfg),
        reducer: reduceTableau,
        nextAction: (s: any) => findGenericTableauHint(s),
        renderMini: (s: any) => renderTableauMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => (s.foundations ?? []).reduce((a: number, f: any[]) => a + f.length, 0),
      };
    }
    case 'generic_distribution': {
      const cfg = DISTRIBUTION_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Horloge',
        initial: () => initDist(cfg),
        reducer: reduceDist,
        nextAction: (s: any) => (s.won || s.lost ? null : { type: 'REVEAL_AND_PLACE' }),
        renderMini: (s: any) => renderDistributionMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => s.exposedCount ?? 0,
      };
    }
    case 'pairs': {
      const cfg = PAIRS_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Paires',
        initial: () => initPairs(cfg),
        reducer: reducePairs,
        nextAction: (s: any) => findPairsHint(s),
        renderMini: (s: any) => renderPairsMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => (s.removed ?? []).length,
      };
    }
    case 'math': {
      const cfg = MATH_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Math',
        initial: () => initMath(cfg),
        reducer: reduceMath,
        nextAction: (s: any) => findMathHint(s),
        renderMini: (s: any) => renderMathMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => (s.foundations ?? []).reduce((a: number, f: any[]) => a + f.length, 0),
      };
    }
    case 'golf_chain': {
      const cfg = GOLF_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Golf',
        initial: () => initGolf(cfg),
        reducer: reduceGolf,
        nextAction: (s: any) => findGolfHint(s),
        renderMini: (s: any) => renderGolfMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => s.score ?? 0,
      };
    }
    case 'spider_v2': {
      const cfg = SPIDER_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Spider',
        initial: () => initSpiderV2(cfg),
        reducer: reduceSpiderV2,
        nextAction: (s: any) => findSpiderV2Hint(s),
        renderMini: (s: any) => renderSpiderV2Mini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => (s.completedRuns ?? []).length * 13,
      };
    }
    case 'maze': {
      const cfg = MAZE_CONFIGS[v.key];
      if (!cfg) return null;
      return {
        engineLabel: 'Maze',
        initial: () => initMaze(cfg),
        reducer: reduceMaze,
        nextAction: (s: any) => findMazeHint(s),
        renderMini: (s: any) => renderMazeMini(s),
        isWon: (s: any) => !!s.won,
        moves: (s: any) => s.moveCount ?? 0,
        score: (s: any) => s.moveCount ?? 0,
      };
    }
  }
  return null;
}

// ─── Hint functions (simplified versions for the bot) ────────────────────

function findGenericTableauHint(state: any): any {
  const cfg = state.config;
  const baseRank = state.foundationBaseRankResolved;
  // T → F
  for (let t = 0; t < state.tableau.length; t++) {
    const pile = state.tableau[t];
    const card = pile[pile.length - 1];
    if (!card || !card.faceUp) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canFoundT(card, top, cfg, baseRank)) return { type: 'TABLEAU_TO_FOUNDATION', from: t, foundation: f };
    }
  }
  const wt = state.waste[state.waste.length - 1];
  if (wt) {
    for (let f = 0; f < state.foundations.length; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] ?? null;
      if (canFoundT(wt, top, cfg, baseRank)) return { type: 'WASTE_TO_FOUNDATION', foundation: f };
    }
    for (let t = 0; t < state.tableau.length; t++) {
      const target = state.tableau[t][state.tableau[t].length - 1] ?? null;
      if (canStackT(wt, target, cfg)) return { type: 'WASTE_TO_TABLEAU', to: t };
    }
  }
  if (cfg.stockEnabled && state.stock.length > 0) return { type: 'DRAW_STOCK' };
  if (cfg.stockEnabled && state.waste.length > 0 && cfg.stockRecycle !== 'none') {
    if (!(typeof cfg.stockRecycle === 'number' && state.stockRecyclesUsed >= cfg.stockRecycle)) {
      return { type: 'RECYCLE_WASTE' };
    }
  }
  return null;
}

function findPairsHint(state: any): any {
  if (state.won) return null;
  const locs = listAccessibleLocations(state);
  for (const loc of locs) {
    const card = getCardAt(loc, state);
    if (card && canRemoveSingle(card, state.config)) return { type: 'SELECT', loc };
  }
  for (let i = 0; i < locs.length; i++) {
    const a = getCardAt(locs[i], state);
    if (!a) continue;
    for (let j = i + 1; j < locs.length; j++) {
      const b = getCardAt(locs[j], state);
      if (b && arePair(a, b, state.config)) {
        // For pairs we only return one SELECT — the bot tick will fire the
        // second on the next tick (engine clears `selected` on mismatch).
        return { type: 'SELECT', loc: locs[i] };
      }
    }
  }
  if (state.config.stockEnabled && state.stock.length > 0) return { type: 'DRAW_STOCK' };
  return null;
}

function findMathHint(state: any): any {
  if (state.won) return null;
  if (state.pendingStockCard) {
    const valid = listMathFoundations(state.pendingStockCard, state);
    if (valid.length > 0) return { type: 'STOCK_TO_FOUNDATION', foundationIdx: valid[0] };
    return { type: 'STOCK_TO_WASTE', wasteIdx: 0 };
  }
  for (let w = 0; w < state.wastePiles.length; w++) {
    const top = state.wastePiles[w][state.wastePiles[w].length - 1];
    if (!top) continue;
    const valid = listMathFoundations(top, state);
    if (valid.length > 0) return { type: 'WASTE_TO_FOUNDATION', from: w, to: valid[0] };
  }
  if (state.stock.length > 0) return { type: 'DRAW_STOCK' };
  if (state.config.stockRecycle !== 'none') return { type: 'RECYCLE_WASTE' };
  return null;
}

function findGolfHint(state: any): any {
  if (state.won || state.lost) return null;
  const cells = listPlayableCells(state);
  if (cells.length > 0) {
    const [r, c] = cells[0];
    return { type: 'PLAY_CARD', row: r, col: c };
  }
  if (state.stock.length > 0) return { type: 'DRAW_STOCK' };
  if (state.config.stockRecycle !== 'none' && state.waste.length > 0) return { type: 'RECYCLE_WASTE' };
  return null;
}

function findSpiderV2Hint(state: any): any {
  if (state.won) return null;
  for (let from = 0; from < state.tableau.length; from++) {
    const pile = state.tableau[from];
    for (let idx = 0; idx < pile.length; idx++) {
      if (!isMovableBlock(state, from, idx)) continue;
      const card = pile[idx];
      // Productive filter
      const willEmpty = idx === 0;
      const willReveal = idx > 0 && pile[idx - 1].faceUp === false;
      if (!willEmpty && !willReveal) continue;
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        if (canStackSpider(state, card, to)) return { type: 'MOVE', from, cardIdx: idx, to };
      }
    }
  }
  if (state.config.stockEnabled && state.stock.length > 0) return { type: 'DEAL_STOCK' };
  return null;
}

function findMazeHint(state: any): any {
  if (state.won) return null;
  for (let r = 0; r < state.grid.length; r++) {
    for (let c = 0; c < state.grid[r].length; c++) {
      const card = state.grid[r][c];
      if (!card) continue;
      const holes = listFillableHoles(state, card);
      if (holes.length > 0) {
        const [tr, tc] = holes[0];
        return { type: 'MOVE', fromRow: r, fromCol: c, toRow: tr, toCol: tc };
      }
    }
  }
  return null;
}

// ─── Mini-render functions (one per engine family) ───────────────────────

function MiniCard({ code, faceDown }: { code: string | null; faceDown?: boolean }) {
  const src = faceDown
    ? FRENCH_CARD_IMAGES.BACK
    : code
    ? FRENCH_CARD_IMAGES[code] ?? FRENCH_CARD_IMAGES.BACK
    : null;
  if (!src) return <View style={[s.miniCard, s.miniCardEmpty]} />;
  return (
    <View style={s.miniCard}>
      <Image source={src} style={s.miniCardImg} resizeMode="contain" />
    </View>
  );
}

function renderTableauMini(state: any) {
  return (
    <View>
      <View style={s.topRow}>
        <MiniCard code={null} faceDown={state.stock?.length > 0} />
        <MiniCard code={state.waste?.length ? codeFromCard(state.waste[state.waste.length - 1]) : null} />
        <View style={{ flex: 1 }} />
        {(state.foundations ?? []).slice(0, 8).map((f: any[], i: number) => (
          <MiniCard key={i} code={f.length ? codeFromCard(f[f.length - 1]) : null} />
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tableauRow}>
        {(state.tableau ?? []).map((col: any[], ci: number) => (
          <View key={ci} style={s.col}>
            {col.length === 0 ? (
              <View style={[s.miniCard, s.miniCardEmpty]} />
            ) : (
              col.slice(-6).map((card: any, idx: number) => (
                <View key={card.id || idx} style={{ marginTop: idx === 0 ? 0 : -24 }}>
                  <MiniCard
                    code={card.faceUp ? codeFromCard(card) : null}
                    faceDown={!card.faceUp}
                  />
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function renderDistributionMini(state: any) {
  return (
    <View>
      <View style={s.topRow}>
        <Text style={s.miniLabel}>Carte courante</Text>
        <MiniCard code={state.currentCard ? codeFromCard(state.currentCard) : null} />
      </View>
      <View style={s.gridWrap}>
        {(state.piles ?? []).slice(0, 12).map((pile: any[], i: number) => {
          const facedown = pile.filter((c) => c.faceUp === false).length;
          return (
            <View key={i} style={s.gridCell}>
              <Text style={s.cellLabel}>{i + 1}</Text>
              <View style={s.miniCard}>
                <Text style={s.miniCellText}>{facedown}/{pile.length}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function renderPairsMini(state: any) {
  return (
    <View>
      {(state.layout ?? []).map((row: (any | null)[], r: number) => (
        <View key={r} style={s.pairRow}>
          {row.map((card, c) => (
            <MiniCard key={`${r}-${c}`} code={card ? codeFromCard(card) : null} />
          ))}
        </View>
      ))}
      <Text style={s.miniHint}>Retirées : {(state.removed ?? []).length}</Text>
    </View>
  );
}

function renderMathMini(state: any) {
  return (
    <View>
      <View style={s.topRow}>
        {(state.foundations ?? []).map((f: any[], i: number) => (
          <MiniCard key={i} code={f.length ? codeFromCard(f[f.length - 1]) : null} />
        ))}
      </View>
      <View style={s.topRow}>
        {(state.wastePiles ?? []).map((w: any[], i: number) => (
          <MiniCard key={i} code={w.length ? codeFromCard(w[w.length - 1]) : null} />
        ))}
      </View>
      <Text style={s.miniHint}>Stock : {state.stock?.length ?? 0}</Text>
    </View>
  );
}

function renderGolfMini(state: any) {
  return (
    <View>
      <View style={s.topRow}>
        <Text style={s.miniLabel}>Score : {state.score ?? 0}</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.miniLabel}>Pile :</Text>
        <MiniCard code={state.topCard ? codeFromCard(state.topCard) : null} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tableauRow}>
        {(state.layout ?? []).map((row: (any | null)[], r: number) => (
          <View key={r} style={s.golfRow}>
            {row.map((card, c) => (
              <MiniCard key={`${r}-${c}`} code={card ? codeFromCard(card) : null} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function renderSpiderV2Mini(state: any) {
  return (
    <View>
      <View style={s.topRow}>
        <Text style={s.miniLabel}>Suites : {(state.completedRuns ?? []).length}</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.miniLabel}>Stock : {state.stock?.length ?? 0}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tableauRow}>
        {(state.tableau ?? []).map((col: any[], ci: number) => (
          <View key={ci} style={s.col}>
            {col.length === 0 ? (
              <View style={[s.miniCard, s.miniCardEmpty]} />
            ) : (
              col.slice(-6).map((card: any, idx: number) => (
                <View key={card.id || idx} style={{ marginTop: idx === 0 ? 0 : -24 }}>
                  <MiniCard code={card.faceUp ? codeFromCard(card) : null} faceDown={!card.faceUp} />
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function renderMazeMini(state: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {(state.grid ?? []).map((row: (any | null)[], r: number) => (
          <View key={r} style={s.pairRow}>
            {row.map((card, c) => (
              <MiniCard key={`${r}-${c}`} code={card ? codeFromCard(card) : null} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

export default function GenericBotPlateau({
  variant,
  difficulty = 'medium',
  userWon,
  onReplay,
  onQuit,
}: Props) {
  const { t } = useTranslation('game');
  const adapter = buildAdapter(variant);
  // Hook must be called unconditionally — but if no adapter, we throw a
  // simple placeholder reducer so React isn't unhappy.
  const fallbackInit = () => ({ moves: 0 });
  const fallbackReducer = (s: any) => s;
  const [botState, botDispatch] = useReducer(
    adapter ? adapter.reducer : fallbackReducer,
    undefined,
    adapter ? adapter.initial : fallbackInit,
  );
  const [botActive, setBotActive] = useState(false);
  const [winner, setWinner] = useState<'user' | 'bot' | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!adapter || !botActive || winner) return;
    if (adapter.isWon(botState)) {
      setWinner('bot');
      return;
    }
    const id = setInterval(() => {
      const action = adapter.nextAction(botState);
      if (action) botDispatch(action);
    }, BOT_TICK_MS[difficulty]);
    return () => clearInterval(id);
  }, [adapter, botActive, difficulty, winner, botState]);

  useEffect(() => {
    if (userWon && !winner) setWinner('user');
  }, [userWon, winner]);

  if (!adapter) {
    return (
      <View style={[s.banner, { padding: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 12 }}>
          Variante non supportée pour le bot : {variant.key} ({variant.engine})
        </Text>
      </View>
    );
  }

  return (
    <>
      <LinearGradient colors={['#064E3B', '#065F46', '#047857']} style={s.banner}>
        <View style={s.bannerHeader}>
          <Ionicons name={botActive ? 'hardware-chip' : 'hourglass-outline'} size={14} color="#A7F3D0" />
          <Text style={s.bannerTitle}>
            {botActive ? `Bot ${difficulty}` : 'Bot en attente'}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={s.bannerVariant}>{variant.name}</Text>
          <TouchableOpacity onPress={() => setCollapsed((c) => !c)} style={s.collapseBtn}>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={s.botStats}>
          {adapter.engineLabel} · score {adapter.score(botState)} · coups {adapter.moves(botState)}
        </Text>

        {!collapsed && (
          <View style={s.miniBoard}>
            {adapter.renderMini(botState)}
          </View>
        )}

        {!botActive && (
          <TouchableOpacity
            onPress={() => setBotActive(true)}
            activeOpacity={0.85}
            style={s.activateBtn}
          >
            <LinearGradient colors={['#0EA5E9', '#3B82F6']} style={s.activateBtnGrad}>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={s.activateBtnText}>Activer le bot</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <Modal visible={!!winner} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalEmoji}>{winner === 'user' ? '🏆' : '🤖'}</Text>
            <Text style={s.modalTitle}>
              {winner === 'user' ? 'Tu as gagné !' : 'Le bot a gagné'}
            </Text>
            <Text style={s.modalSub}>
              Bot : {adapter.score(botState)} pts en {adapter.moves(botState)} coups
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => { setWinner(null); setBotActive(false); onReplay?.(); }}
                style={[s.modalBtn, { backgroundColor: '#0EA5E9' }]}
              >
                <Text style={s.modalBtnText}>Rejouer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onQuit?.()} style={[s.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={s.modalBtnText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  banner: { padding: 10, borderRadius: 0 },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bannerTitle: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black' },
  bannerVariant: { color: '#A7F3D0', fontSize: 11, fontFamily: 'Inter-Bold' },
  collapseBtn: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 4 },
  botStats: { color: '#D1FAE5', fontSize: 11, marginBottom: 8 },

  miniBoard: { gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableauRow: { gap: 4, paddingVertical: 4 },
  col: { width: 32, alignItems: 'center' },
  miniCard: { width: 30, height: 42, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  miniCardImg: { width: '100%', height: '100%' },
  miniCardEmpty: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed', backgroundColor: 'transparent' },
  miniLabel: { color: '#A7F3D0', fontSize: 10, fontFamily: 'Inter-Bold' },
  miniHint: { color: '#D1FAE5', fontSize: 10, marginTop: 4 },
  miniCellText: { color: '#A7F3D0', fontSize: 9 },

  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  gridCell: { alignItems: 'center', width: 40 },
  cellLabel: { color: '#A7F3D0', fontSize: 9, marginBottom: 2 },

  pairRow: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  golfRow: { flexDirection: 'row', gap: 2 },

  activateBtn: { marginTop: 8, alignSelf: 'center', borderRadius: 999, overflow: 'hidden' },
  activateBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  activateBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },

  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { width: 280, padding: 22, borderRadius: 16, backgroundColor: '#1F2937', alignItems: 'center' },
  modalEmoji: { fontSize: 48 },
  modalTitle: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black', marginTop: 8 },
  modalSub: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },
});

/* === End of GenericBotPlateau.tsx — Solitaire — SallyCards === */
