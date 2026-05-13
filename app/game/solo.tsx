/**
 * @file game/solo.tsx — Écran de jeu solo Solitaire (toutes variantes).
 *
 * Aucune simulation P2P, pas de socket, pas de Jitsi : Solitaire est un jeu
 * solo. Le screen multiplexe selon `variant` :
 *   - klondike-1 / klondike-3 / klondike-vegas → solitaireFrEngine
 *   - spider-1 / spider-2 / spider-4           → spiderEngine
 *   - freecell                                  → freecellEngine
 */
import React, { useReducer, useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Modal, Alert, Animated, Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppHeader from '../../src/components/AppHeader';
import FrenchCard from '../../src/components/FrenchCard';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import { APP_CONFIG } from '../../src/config/app.config';
import { findVariant } from '../../src/game/variants';
import VsBotOverlay from '../../src/components/VsBotOverlay';
import VsBotLayout from '../../src/components/VsBotLayout';
import GenericBotPlateau from '../../src/components/GenericBotPlateau';
import P2PCall from '../../src/components/P2PCall';
import ExternalJitsiCall from '../../src/components/ExternalJitsiCall';

import * as Klondike from '../../src/game/solitaireFrEngine';
import * as Spider from '../../src/game/spiderEngine';
import * as FreeCell from '../../src/game/freecellEngine';
import * as Yukon from '../../src/game/yukonEngine';
import * as Golf from '../../src/game/golfEngine';
import * as Pyramid from '../../src/game/pyramidEngine';
import * as TriPeaks from '../../src/game/tripeaksEngine';
import * as FortyThieves from '../../src/game/fortyThievesEngine';
import * as Accordion from '../../src/game/accordionEngine';
import GenericTableauScreen from '../../src/components/GenericTableauScreen';
import GenericDistributionScreen from '../../src/components/GenericDistributionScreen';
import PairsScreen from '../../src/components/PairsScreen';
import GolfChainScreen from '../../src/components/GolfScreen';
import MathScreen from '../../src/components/MathScreen';
import SpiderV2Screen from '../../src/components/SpiderV2Screen';
import MazeScreen from '../../src/components/MazeScreen';
import { useRaceReport } from '../../src/contexts/useRaceReport';
import { useRace } from '../../src/contexts/RaceContext';
import { useInventory } from '../../src/contexts/useInventory';
import { useAutoClaimDailyOnWin } from '../../src/contexts/useAutoClaimDailyOnWin';
import { useGameWithUndo } from '../../src/contexts/useGameWithUndo';
import FloatingUndoButton from '../../src/components/FloatingUndoButton';

import * as api from '../../shared/api';
import * as Replays from '../../src/game/replays';
import { describeAction as _describeActionExt } from '../../src/game/action-describer';
import {
  convertRawStateToGameState as bdConvertSpiderState,
  convertRawMoveToAction as bdConvertSpiderMove,
  variantToSuitMode as bdVariantToSuitMode,
  type SpiderV2RawDeal,
} from '../../src/game/spiderBDAdapter';

// ─────────────────────────────────────────────────────────────────────────
// Difficulty system (Easy = ∞ hints, Medium = 3, Hard = 0/aucun bouton)
// ─────────────────────────────────────────────────────────────────────────
export type Difficulty = 'easy' | 'medium' | 'hard';

export function hintsAllowed(d: Difficulty): number {
  return d === 'easy' ? Infinity : d === 'medium' ? 3 : 0;
}

/** Hook timer : retourne secondes écoulées, ticke chaque seconde. */
function useChrono(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  const reset = useCallback(() => { startedAtRef.current = Date.now(); setSeconds(0); }, []);
  const elapsedMs = useCallback(() => Date.now() - startedAtRef.current, []);
  return { seconds, reset, elapsedMs };
}

/**
 * Hook indices : combine deux sources :
 *   - Pool de difficulté (Easy=∞, Medium=3, Hard=0) — fourni d'office, gratuit.
 *   - Pool inventaire (hint_1 / hint_5 achetés au /spend) — utilisé en
 *     surplus, consommé sur le serveur via /shop/consume.
 *
 * Le bouton hint reste activé tant que l'une des deux sources est non vide.
 * Quand on `consume()`, on prend d'abord du pool difficulté ; quand il est
 * épuisé, on tire de l'inventaire (qui est asynchrone — l'optimistic-update
 * dans useInventory évite le lag visuel).
 */
function useHints(difficulty: Difficulty) {
  const max = hintsAllowed(difficulty);
  const [used, setUsed] = useState(0);
  const inv = useInventory();
  const difficultyRemaining = max === Infinity ? Infinity : Math.max(0, max - used);
  const inventoryHints = inv.totalHints();
  const remaining = difficultyRemaining === Infinity ? Infinity : difficultyRemaining + inventoryHints;
  const canUseHint =
    difficulty !== 'hard' &&
    (difficultyRemaining > 0 || inventoryHints > 0);
  const consume = useCallback(() => {
    if (difficulty === 'hard') return;
    if (difficultyRemaining > 0 && difficultyRemaining !== Infinity) {
      setUsed((u) => u + 1);
      return;
    }
    if (difficultyRemaining === Infinity) {
      // Easy mode: free unlimited hints, no inventory cost
      return;
    }
    // Difficulty pool exhausted → drain inventory
    inv.consumeHint();
  }, [difficulty, difficultyRemaining, inv]);
  const reset = useCallback(() => setUsed(0), []);
  return {
    remaining,
    canUseHint,
    consume,
    reset,
    used,
    inventoryHints, // exposed for UI badge "+N from inventory"
  };
}

/** Format mm:ss */
function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// =====================================================================
// AUTO-SUBMIT : chaque deal local généré est POSTé vers la BD pour
// alimenter le catalogue partagé (deals 100% solubles via reverse-deal).
// =====================================================================
function dealHashOf(state: any): string {
  const str = JSON.stringify(state);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function useAutoSubmitDeal(
  variantKey: string,
  initialState: any,
  difficulty: string,
  getSolution: () => any[],
  source: 'local' | 'bd' = 'local',
) {
  const submittedRef = useRef(false);
  useEffect(() => {
    if (submittedRef.current) return;
    if (source !== 'local') return;   // ne pas re-submit si vient de la BD
    submittedRef.current = true;
    // Fire-and-forget après 500ms (laisse l'UI charger d'abord)
    setTimeout(() => {
      try {
        const sol = getSolution();
        api.submitDealSeed({
          variant: variantKey,
          initialState,
          solution: sol,
          difficulty,
          dealHash: dealHashOf(initialState),
          metadata: { source: 'mobile-reverse-deal', timestamp: Date.now() },
        }).then((r) => {
          if (r.ok && !r.duplicate) {
            console.log(`💾 [DealSeeds] ✅ Deal soumis pour ${variantKey} (BD enrichie)`);
          }
        }).catch(() => {});
      } catch {}
    }, 500);
  }, []);
}

// =====================================================================
// BD-FIRST LOAD : après le mount, fetch un deal BD ; si OK, dispatch
// LOAD_FROM_BD pour remplacer le state local et installe la solution BD.
// Le local reste actif tout de suite (pas de flash blanc).
// =====================================================================
function useBDFirstLoad<S, A>(
  variantKey: string,
  difficulty: string,
  dispatch: React.Dispatch<A>,
  setSolutionFromBD: (actions: A[]) => void,
  setSolutionFromState: (s: S) => void,
  getSolution: () => A[],
  buildLoadAction: (state: any) => A,
): void {
  // Lit fromBD des params URL. Comportement :
  //   - fromBD === 'true' (clic "Donne BD") → charge BD
  //   - fromBD === 'false' (clic "Jouer Local") → SKIP, pure génération locale
  //   - fromBD non défini (legacy / tests) → charge BD (rétrocompat)
  const { fromBD } = useLocalSearchParams<{ fromBD?: string }>();
  const enabled = fromBD !== 'false';

  const calledRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      logger.dev(`🎲 [DealSeeds] ${variantKey} : mode LOCAL choisi, BD skip`);
      return;
    }
    if (calledRef.current) return;
    calledRef.current = true;
    let cancelled = false;
    api.fetchRandomDealSeed(variantKey, difficulty).then((seed) => {
      if (cancelled) return;
      if (!seed || !seed.initialState) return;
      logger.dev(`🌐 [DealSeeds] Deal BD ${variantKey} chargé — remplace le local`);
      dispatch(buildLoadAction(seed.initialState));
      if (Array.isArray(seed.solution) && seed.solution.length > 0) {
        setSolutionFromBD(seed.solution as A[]);
        logger.dev(`🌐 [DealSeeds] Solution BD ${variantKey} installée (${seed.solution.length} coups)`);
      } else {
        // Solution BD vide : recalcule localement + ré-soumet pour
        // enrichir la BD (F: solution upsert).
        try {
          setSolutionFromState(seed.initialState as S);
          const sol = getSolution();
          if (sol.length > 0) {
            logger.dev(`🌐 [DealSeeds] Solution recalculée localement (${sol.length} coups) — resubmit`);
            api.submitDealSeed({
              variant: variantKey,
              initialState: seed.initialState,
              solution: sol,
              difficulty,
              dealHash: seed.dealHash,
            }).catch(() => {});
          }
        } catch (e) {
          console.log(`⚠️ [DealSeeds] Recalcul solution échoué :`, e);
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
}

/**
 * Hook qui log un message à chaque coup réel (incrément de state.moves).
 * Utilisé par les 9 screens pour avoir des logs par action.
 */
/** Format compact d'une carte : "♠K" / "♥7" / etc. */
function fmtCard(c: any): string {
  if (!c) return '·';
  const v = c.value;
  const vs = v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v);
  const sg = c.suit === 'spades' ? '♠' : c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '?';
  return c.faceUp === false ? `[${sg}${vs}]` : `${sg}${vs}`;
}

/** Dump compact des positions de cartes selon le state (couvre les 9 variantes). */
function dumpCards(state: any): string {
  if (!state) return '';
  const lines: string[] = [];
  if (state.tableau) {
    state.tableau.forEach((col: any, i: number) => {
      const cards = (col.cards ?? []).map(fmtCard).join(' ');
      lines.push(`  C${i + 1}: ${cards || '(vide)'}`);
    });
  }
  if (state.freeCells) {
    const fc = state.freeCells.map((c: any) => fmtCard(c)).join(' ');
    lines.push(`  Free: ${fc}`);
  }
  if (state.foundations) {
    const fo = state.foundations.map((f: any) => f.cards.length > 0 ? fmtCard(f.cards[f.cards.length - 1]) : '·').join(' ');
    lines.push(`  Found: ${fo}`);
  }
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.waste && state.waste.length) {
    const top = state.waste[state.waste.length - 1];
    lines.push(`  Waste: ${fmtCard(top)} (${state.waste.length})`);
  }
  if (state.completed) lines.push(`  Completed: ${state.completed.length}/8`);
  if (state.pyramid) {
    state.pyramid.forEach((row: any[], i: number) => {
      lines.push(`  R${i}: ${row.map(fmtCard).join(' ')}`);
    });
  }
  if (state.slots) {
    const visible = state.slots.filter((s: any) => s.card).length;
    lines.push(`  Slots: ${visible}/28 visibles`);
  }
  if (state.piles) {
    const tops = state.piles.map((p: any) => fmtCard(p.cards[p.cards.length - 1])).join(' ');
    lines.push(`  Piles(${state.piles.length}): ${tops}`);
  }
  return lines.join('\n');
}

/** Compte le nombre total de cartes face-down dans le tableau Spider. */
function countFaceDown(state: any): number {
  if (!state?.tableau) return 0;
  let n = 0;
  for (const col of state.tableau) {
    for (const c of col.cards ?? []) if (c.faceUp === false) n++;
  }
  return n;
}

/** Un coup est PRODUCTIF s'il :
 *   - révèle une carte face-down (réduit countFaceDown)
 *   - OU complète un run (state.completed.length augmente)
 */
function isProductiveSpider(before: any, after: any): boolean {
  if (countFaceDown(after) < countFaceDown(before)) return true;
  if ((after.completed?.length ?? 0) > (before.completed?.length ?? 0)) return true;
  return false;
}

/** Énumère TOUS les MOVE_RUN légaux Spider et retourne la liste avec leur next state. */
function enumerateLegalSpiderMoves(state: any): { action: any; next: any }[] {
  const out: { action: any; next: any }[] = [];
  if (!state?.tableau) return out;
  for (let from = 0; from < state.tableau.length; from++) {
    const cards = state.tableau[from].cards;
    for (let idx = 0; idx < cards.length; idx++) {
      if (cards[idx].faceUp === false) continue;
      for (let to = 0; to < state.tableau.length; to++) {
        if (to === from) continue;
        const action = { type: 'MOVE_RUN', fromCol: from, fromCardIndex: idx, toCol: to };
        try {
          const next = Spider.gameReducer(state, action as any);
          if (next !== state) out.push({ action, next });
        } catch { /* ignore */ }
      }
    }
  }
  return out;
}

/**
 * Cherche un coup PRODUCTIF en regardant 2 niveaux à l'avance.
 *  - Niveau 1 : si un coup est directement productif (face-down révélée ou run complété), retourne-le
 *  - Niveau 2 : sinon, pour chaque coup possible, simule et regarde
 *    si UN coup suivant est productif. Si oui → retourne le coup niveau 1.
 *  - Sinon → null (le brute-force "rotation stérile" est BANNI).
 *
 * Skip aussi tout coup menant à un état déjà visité (anti-cycle).
 */
function findProductiveSpiderMove(state: any, visited?: Set<string>): any | null {
  const isCyclic = (next: any) => visited && visited.has(quickHashState(next));
  const moves = enumerateLegalSpiderMoves(state);

  // Niveau 1 : coup directement productif
  for (const m of moves) {
    if (isCyclic(m.next)) continue;
    if (isProductiveSpider(state, m.next)) return m.action;
  }

  // Niveau 2 : un coup suivant sera productif ?
  for (const m of moves) {
    if (isCyclic(m.next)) continue;
    const subMoves = enumerateLegalSpiderMoves(m.next);
    // Limite à 30 sub-moves pour rester rapide
    for (let i = 0; i < Math.min(30, subMoves.length); i++) {
      const sub = subMoves[i];
      if (isProductiveSpider(m.next, sub.next)) return m.action; // ce coup débloque
    }
  }

  return null;
}

/**
 * ENDGAME BEAM SEARCH : quand on est proche de la victoire (5+ runs done),
 * cherche en profondeur (≤ 25 coups) une séquence qui complète un nouveau
 * run. Renvoie le PREMIER coup de la séquence trouvée (le reste sera trouvé
 * au prochain appel par récursion implicite).
 */
function findEndgameSpiderMove(state: any, visited?: Set<string>): any | null {
  if (!state || !state.completed || state.completed.length < 5) return null;
  if (state.phase === 'won') return null;

  type Beam = { state: any; firstAction: any; depth: number };
  const t0 = Date.now();
  const TIMEOUT_MS = 800;
  const MAX_DEPTH = 25;
  const BEAM_WIDTH = 60;
  const targetCompleted = state.completed.length + 1; // viser 1 run de plus

  let beams: Beam[] = enumerateLegalSpiderMoves(state)
    .filter((m: any) => !visited || !visited.has(quickHashState(m.next)))
    .map((m: any) => ({ state: m.next, firstAction: m.action, depth: 1 }));

  const seen = new Set<string>();
  if (visited) for (const h of visited) seen.add(h);

  while (beams.length > 0) {
    if (Date.now() - t0 > TIMEOUT_MS) break;

    // Check victory in current beams
    for (const b of beams) {
      if (b.state.completed.length >= targetCompleted) return b.firstAction;
    }

    const next: Beam[] = [];
    for (const b of beams) {
      if (b.depth >= MAX_DEPTH) continue;
      const moves = enumerateLegalSpiderMoves(b.state);
      for (const m of moves) {
        const h = quickHashState(m.next);
        if (seen.has(h)) continue;
        seen.add(h);
        next.push({ state: m.next, firstAction: b.firstAction, depth: b.depth + 1 });
      }
    }
    if (next.length === 0) break;
    // Beam : prefer states with most completed runs, then most empty cols
    next.sort((a, b) => {
      const ca = (a.state.completed?.length ?? 0) - (b.state.completed?.length ?? 0);
      if (ca !== 0) return -ca;
      const ea = (a.state.tableau || []).filter((c: any) => c.cards.length === 0).length;
      const eb = (b.state.tableau || []).filter((c: any) => c.cards.length === 0).length;
      return eb - ea;
    });
    beams = next.slice(0, BEAM_WIDTH);
  }

  return null;
}

function useActionLog(variantKey: string, moves: number, score: number, extra?: string, state?: any) {
  const prevMovesRef = useRef(0);
  useEffect(() => {
    if (moves > prevMovesRef.current) {
      const delta = moves - prevMovesRef.current;
      const tag = delta === 1 ? `Coup #${moves}` : `+${delta} coups → #${moves}`;
      console.log(`🎯 [${variantKey}] ${tag} — score=${score}${extra ? ` | ${extra}` : ''}`);
      if (state) {
        const dump = dumpCards(state);
        if (dump) console.log(`📋 [${variantKey}] État après coup:\n${dump}`);
      }
      prevMovesRef.current = moves;
    }
  }, [moves, score, extra, variantKey, state]);
}

// ─────────────────────────────────────────────────────────────────────────
// SOLVABILITY — type, hook & helpers communs aux 9 variantes
// ─────────────────────────────────────────────────────────────────────────
type WinnabilityResult =
  | { kind: 'winning'; action: any }
  | { kind: 'proven-lost' }
  | { kind: 'timeout' }
  | { kind: 'already-won' };

type SolvableState = 'unknown' | 'winning' | 'lost-path' | 'checking';

/**
 * Hook qui re-vérifie la solvabilité après chaque coup réel (déclenché par
 * la dépendance `triggerKey`, généralement le `state.moves` ou pile count).
 * Ne re-tourne PAS sur les sélections vides.
 */
function useSolvabilityCheck<S extends { phase: string }>(
  state: S,
  triggerKey: number | string,
  analyzer: (s: S, timeoutMs: number) => WinnabilityResult,
  variantName: string,
  forceWinning: boolean = false,
): SolvableState {
  const [solvable, setSolvable] = useState<SolvableState>('unknown');
  useEffect(() => {
    if (state.phase === 'won') return;
    if (forceWinning) { setSolvable('winning'); return; }
    if ((state.phase as string) === 'lost') { setSolvable('lost-path'); return; }
    setSolvable('checking');
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const r = analyzer(state, 500);
      if (cancelled) return;
      if (r.kind === 'winning') setSolvable('winning');
      else if (r.kind === 'proven-lost') {
        setSolvable('lost-path');
        console.log(`⚠️ [${variantName}] Position bloquée — utilise « Recommencer »`);
      } else if (r.kind === 'timeout') {
        // DFS pas concluant : on reste optimiste (donne pré-validée au start)
        setSolvable('winning');
      } else {
        setSolvable('winning');
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(id); };
  }, [triggerKey]);
  return solvable;
}

/**
 * Hook anti-cycle pour le bouton 💡.
 *
 * Track les 8 dernières actions suggérées. Si la même action est suggérée
 * 3 fois dans cette fenêtre → cycle détecté, refuse l'action et retourne null.
 * Le screen affiche alors une alerte "cycle — recommence".
 */
/**
 * Hook qui retourne la prochaine action de la solution stockée (si dispo).
 * Tracke un index local. Si solution[idx] ne change pas l'état (divergence),
 * retourne null pour que le caller fasse un fallback.
 */
/** Re-export pour compat (la vraie impl est dans `src/game/action-describer.ts`) */
const describeAction = _describeActionExt;

const AI_SPEEDS = [
  { ms: 1500, label: '0.5×' },
  { ms: 700, label: '1×' },
  { ms: 350, label: '2×' },
  { ms: 100, label: 'Turbo' },
];

/**
 * REPLAY RECORDER : capture l'état initial + intercepte les dispatch pour
 * enregistrer la séquence d'actions. Au won, `commit()` sauvegarde le replay.
 *
 * Usage :
 *   const [state, baseDispatch, undoCtl] = useGameWithUndo(...);
 *   const replayRec = useReplayRecorder(state, baseDispatch);
 *   const dispatch = replayRec.dispatch; // remplace baseDispatch
 *   useEffect(() => { if (won) replayRec.commit(...) }, [won]);
 *
 * Au RESET, l'enregistreur s'auto-réinitialise (détecté via state.moves === 0).
 */
function useReplayRecorder<S, A>(state: S, baseDispatch: React.Dispatch<A>) {
  const initialStateRef = useRef<S>(state);
  const actionsRef = useRef<A[]>([]);
  const lastMovesRef = useRef<number>(-1);

  // Reset auto sur RESET (state.moves repasse à 0)
  useEffect(() => {
    const moves = (state as any)?.moves ?? 0;
    if (moves === 0 && lastMovesRef.current > 0) {
      // RESET détecté
      initialStateRef.current = state;
      actionsRef.current = [];
    }
    lastMovesRef.current = moves;
  }, [state]);

  // Capture initialState exactement une fois (au 1er state stable)
  useEffect(() => {
    initialStateRef.current = state;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispatch = useCallback((a: A) => {
    const t = (a as any)?.type;
    if (t === 'LOAD_FROM_BD') {
      // BD load = remplace l'état initial du replay, RAZ actions
      initialStateRef.current = (a as any).state;
      actionsRef.current = [];
    } else if (t === 'RESET') {
      // RESET = re-init au prochain render via le useEffect détectant moves=0
      // (on enregistre quand même l'action pour que la suite reflète le bon state)
      actionsRef.current = [];
    } else {
      actionsRef.current.push(a);
    }
    baseDispatch(a);
  }, [baseDispatch]);

  const commit = useCallback(async (params: {
    variantKey: string;
    difficulty: string;
    moves: number;
    score: number;
    durationMs: number;
    dealHash?: string;
  }) => {
    const replay: Replays.Replay = {
      id: `${params.variantKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      variantKey: params.variantKey,
      difficulty: params.difficulty,
      wonAt: Date.now(),
      moves: params.moves,
      score: params.score,
      durationMs: params.durationMs,
      initialState: initialStateRef.current,
      actions: [...actionsRef.current],
      dealHash: params.dealHash,
    };
    await Replays.saveReplay(replay);
  }, []);

  const reset = useCallback((newInitialState: S) => {
    initialStateRef.current = newInitialState;
    actionsRef.current = [];
  }, []);

  /** Snapshot des actions enregistrées (pour anti-cheat ou export). */
  const getActions = useCallback((): A[] => {
    return [...actionsRef.current];
  }, []);

  return { dispatch, commit, reset, getActions };
}

/** Hook réutilisable pour gérer state AI (playing + speed cycle). */
function useAiState() {
  const [aiPlaying, setAiPlaying] = useState(false);
  const [aiSpeedIdx, setAiSpeedIdx] = useState(1); // default: 1×
  const aiSpeed = AI_SPEEDS[aiSpeedIdx];
  const cycleSpeed = useCallback(() => setAiSpeedIdx((i) => (i + 1) % AI_SPEEDS.length), []);
  return { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed };
}

/**
 * Affiche un modal d'onboarding au PREMIER clic sur le bouton AI.
 * Persiste via AsyncStorage : `ai_tutorial_seen=1` après dismiss.
 */
const AI_TUTORIAL_KEY = 'ai_tutorial_seen_v1';

function useAiTutorial() {
  const [needsTutorial, setNeedsTutorial] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(AI_TUTORIAL_KEY)
      .then((v) => setNeedsTutorial(v !== '1'))
      .catch(() => setNeedsTutorial(false));
  }, []);
  const dismiss = useCallback(() => {
    setNeedsTutorial(false);
    AsyncStorage.setItem(AI_TUTORIAL_KEY, '1').catch(() => {});
  }, []);
  return { needsTutorial: needsTutorial === true, dismiss };
}

function AiTutorialModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={tutorialStyles.backdrop}>
        <View style={[tutorialStyles.box, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[tutorialStyles.title, { color: palette.text }]}>
            {t('solo.ai.tutorialTitle')}
          </Text>
          <Text style={[tutorialStyles.body, { color: palette.textSecondary }]}>
            {t('solo.ai.tutorialBody')}
          </Text>
          <TouchableOpacity onPress={onDismiss} style={[tutorialStyles.btn, { backgroundColor: '#0EA5E9' }]}>
            <Text style={tutorialStyles.btnText}>{t('solo.ai.tutorialOk')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Badge "→ XXXX" affiché à côté du bouton AI. En mode Turbo, anime un pulse
 * pour signaler la rapidité (sinon l'utilisateur voit défiler les coups
 * sans comprendre).
 */
function AiPreviewBadge({ label, pulsing }: { label: string; pulsing: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulsing) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0,  duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, scale]);
  const bg = pulsing ? 'rgba(249,115,22,0.95)' : 'rgba(14,165,233,0.85)';
  return (
    <Animated.View style={[styles.aiPreviewBadge, { backgroundColor: bg, transform: [{ scale }] }]}>
      <Ionicons name={pulsing ? 'flash' : 'arrow-forward'} size={10} color="#fff" />
      <Text style={styles.aiPreviewText}>{label}</Text>
    </Animated.View>
  );
}

const tutorialStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1000, padding: 24,
  },
  box: {
    borderRadius: 16, borderWidth: 1, padding: 20, gap: 14,
    maxWidth: 360, width: '100%',
  },
  title: { fontSize: 18, fontFamily: 'Inter-Black' },
  body: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Regular' },
  btn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
});

/**
 * AUTO-PLAY (mode Computer / IA) : quand `playing=true`, calcule la prochaine
 * action et la dispatch après `intervalMs`. Expose la prochaine action
 * via `nextAction` pour permettre un highlight de preview.
 *
 * Phase 1 (~highlight): après `playing=true`, calcul de l'action → setNextAction.
 * Phase 2 (~dispatch): après ~intervalMs, dispatch l'action et invalide la preview.
 */
function useAutoPlay<S, A>(
  playing: boolean,
  state: S,
  dispatch: React.Dispatch<A>,
  reducer: (s: S, a: A) => S,
  getSolution: () => A[],
  fallbackHint: (s: S) => A | null,    // gardé pour compat signature, NON utilisé (policy stricte solution stockée)
  variantName: string,
  intervalMs: number,
  onStop?: () => void,
): { nextAction: A | null } {
  // Stabilise onStop dans une ref pour éviter re-runs en boucle quand
  // le callback parent est recréé à chaque render.
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const idxRef = useRef(0);
  const aiMovesRef = useRef(0);          // # coups dispatch PAR l'AI
  const lastSeenMovesRef = useRef(-1);   // # coups vu au tick précédent (vérification intervention)
  // ANTI-CYCLE : track les états visités par l'AI. Si l'AI s'apprête à
  // dispatcher un coup qui mène à un état DÉJÀ visité, on STOPPE l'AI.
  // Garantit qu'aucun ping-pong ne tourne indéfiniment.
  const visitedStatesRef = useRef<Set<string>>(new Set());
  const [nextAction, setNextAction] = useState<A | null>(null);

  useEffect(() => {
    if (!playing) { setNextAction(null); return; }
    const phase = (state as any)?.phase;
    if (phase !== 'playing') {
      logger.dev(`🤖 [${variantName}] AutoPlay stop : phase=${phase}`);
      setNextAction(null);
      onStopRef.current?.();
      return;
    }
    // Détection d'intervention humaine
    const stateMoves = (state as any)?.moves ?? 0;
    if (lastSeenMovesRef.current >= 0) {
      const humanInterruptions = stateMoves - lastSeenMovesRef.current - 1;
      if (humanInterruptions > 0) {
        logger.dev(`🤖 [${variantName}] Intervention manuelle (${humanInterruptions} coup${humanInterruptions > 1 ? 's' : ''}) — recalcul`);
      }
    }
    lastSeenMovesRef.current = stateMoves;

    // Track l'état actuel pour détecter les cycles
    const currentHash = quickHashState(state);
    visitedStatesRef.current.add(currentHash);

    // POLITIQUE STRICTE : l'AI ne joue QUE la solution stockée (garantie sans
    // cycle). Pas de fallback findHint. Quand la solution est épuisée → STOP.
    // Cela évite ABSOLUMENT toute boucle infinie ou jeu sans progrès.
    let action: A | null = null;
    const sol = getSolution();
    while (idxRef.current < sol.length) {
      const a = sol[idxRef.current];
      const next = reducer(state, a);
      if (next !== state) { action = a; break; }
      idxRef.current++;
    }
    if (!action) {
      console.log(`🤖 [${variantName}] AutoPlay STOP : solution stockée épuisée (${idxRef.current}/${sol.length})`);
      setNextAction(null);
      onStopRef.current?.();
      return;
    }
    // SAFETY: vérifie que ce coup ne ramène pas à un état déjà visité
    const nextState = reducer(state, action);
    const nextHash = quickHashState(nextState);
    if (visitedStatesRef.current.has(nextHash)) {
      console.log(`🔁 [${variantName}] AutoPlay STOP : coup mènerait à un état déjà visité (cycle évité)`);
      setNextAction(null);
      onStopRef.current?.();
      return;
    }

    setNextAction(action);
    const dispatchTimer = setTimeout(() => {
      dispatch(action!);
      idxRef.current++;
      aiMovesRef.current++;
      setNextAction(null);
    }, intervalMs);
    return () => clearTimeout(dispatchTimer);
    // IMPORTANT : `fallbackHint` et `onStop` SONT EXCLUS des deps car ils
    // sont recréés à chaque render parent (closures inline) → boucle infinie
    // de re-render sinon. `onStop` est stabilisé via `onStopRef`. `fallbackHint`
    // n'est plus utilisé (policy stricte solution stockée only).
    // `getSolution` est une référence module-level stable, OK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, state, dispatch, reducer, getSolution, variantName, intervalMs]);

  // Reset des refs quand le hook est invoqué pour une nouvelle session
  useEffect(() => {
    if (!playing) {
      idxRef.current = 0;
      aiMovesRef.current = 0;
      lastSeenMovesRef.current = -1;
      visitedStatesRef.current = new Set();
    }
  }, [playing]);

  return { nextAction };
}

function useStoredSolution<S, A>(
  getSolution: () => A[],
  reducer: (s: S, a: A) => S,
  variantName: string,
) {
  const idxRef = useRef(0);
  // Anti-cycle : tracker les hash d'états visités. Si on retombe sur un
  // état déjà vu, c'est un ping-pong (ex: 7 entre 2 huits) → reject.
  const stateHashesRef = useRef<string[]>([]);
  // Track les "moves" pour reset auto entre parties. Si state.moves recule
  // (ex : 0 après une victoire à 45), c'est une nouvelle partie → reset refs.
  const lastMovesRef = useRef(0);
  // Track la signature de la solution pour reset si elle change.
  const lastSolSigRef = useRef<string>('');
  return useCallback((state: S): A | null => {
    const sol = getSolution();
    // Détecter nouvelle partie : moves a reculé OU solution change d'identité
    const moves = (state as any)?.moves ?? 0;
    const solSig = sol.length === 0 ? '' :
      `${sol.length}|${JSON.stringify(sol[0])}`;
    const isNewGame = moves < lastMovesRef.current || solSig !== lastSolSigRef.current;
    if (isNewGame) {
      idxRef.current = 0;
      stateHashesRef.current = [];
      lastSolSigRef.current = solSig;
      logger.dev(`🔄 [${variantName}] Nouvelle partie détectée — reset idx solution`);
    }
    lastMovesRef.current = moves;

    if (idxRef.current >= sol.length) return null;
    const action = sol[idxRef.current];
    // Vérifie que l'action est valide dans l'état courant
    const next = reducer(state, action);
    if (next === state) {
      logger.dev(`📍 [${variantName}] Solution stockée invalide à idx ${idxRef.current} — fallback`);
      return null;
    }
    // Anti-cycle : on TRACK les hashes mais on N'APPLIQUE PLUS le bypass.
    // Les solutions générées par inversion d'historique peuvent traverser
    // des états déjà vus (paires d'actions qui s'annulent localement) tout
    // en menant correctement à la victoire au final. Bypass ces actions
    // casserait la séquence et ferait dévier de la solution validée.
    // On garde le log pour debug mais on TRUST la solution validée.
    const nextHash = quickHashState(next);
    const recent = stateHashesRef.current;
    if (recent.includes(nextHash)) {
      logger.dev(`🔁 [${variantName}] État déjà vu dans la solution (hash ${nextHash.slice(0, 8)}) — on continue (solution validée)`);
      // Pas de bypass — la solution stockée est connue pour mener à victoire.
    }
    recent.push(nextHash);
    if (recent.length > 16) recent.shift();
    logger.dev(`💡 [${variantName}] Solution stockée — coup ${idxRef.current + 1}/${sol.length}`);
    idxRef.current++;
    return action;
  }, [getSolution, reducer, variantName]);
}

/**
 * Hash 32-bit FNV-1a d'un GameState — rapide.
 *
 * IMPORTANT : pour le tableau (Spider, Klondike, etc.), on **trie** les
 * signatures de colonnes avant de hasher. Cela rend le hash **invariant
 * à la permutation des colonnes** : déplacer ♠2♠A entre 4 colonnes vides
 * (C1→C2→C3→C4) produit le même hash → détecté comme cycle.
 *
 * Sans ce tri, l'utilisateur faisait 270 coups en rotation infinie.
 */
function quickHashState(state: any): string {
  if (!state || typeof state !== 'object') return '0';
  let h = 2166136261;
  const fold = (v: number) => { h ^= v >>> 0; h = Math.imul(h, 16777619); };
  // Helper : signature compacte d'une colonne
  const colSig = (col: any): string => {
    if (!col?.cards) return '';
    return col.cards.map((c: any) =>
      `${c.value}:${c.suit[0]}${c.faceUp === false ? 'd' : 'u'}`
    ).join('|');
  };
  // Tableau : trier les colonnes par signature → invariant permutation
  if (state.tableau) {
    const sigs = state.tableau.map(colSig).sort();
    for (const sig of sigs) {
      for (let i = 0; i < sig.length; i++) fold(sig.charCodeAt(i));
      fold(255);
    }
  }
  if (state.stock?.length != null) fold(state.stock.length);
  if (state.waste?.length != null) fold(state.waste.length * 7);
  if (state.foundations) {
    // Trier aussi les foundations par taille (pour Klondike, peu importe quelle suit)
    const fcounts = state.foundations.map((f: any) => f.cards?.length ?? 0).sort();
    for (const c of fcounts) fold(c);
  }
  if (state.freeCells) {
    // FreeCells : trier (l'emplacement n'a pas d'importance)
    const fcs = state.freeCells.map((c: any) =>
      c ? (c.value * 31 + c.suit.charCodeAt(0)) : 0
    ).sort((a: number, b: number) => a - b);
    for (const v of fcs) fold(v);
  }
  if (state.completed?.length != null) fold(state.completed.length * 1000);
  // Pyramid (positions FIXES — pas de tri)
  if (state.pyramid) {
    for (const row of state.pyramid) {
      for (const c of row) fold(c ? (c.value * 31 + c.suit.charCodeAt(0)) : 999);
    }
  }
  // TriPeaks (positions FIXES — pas de tri)
  if (state.slots) {
    for (const slot of state.slots) {
      fold(slot.card ? (slot.card.value * 31 + slot.card.suit.charCodeAt(0)) : 999);
    }
  }
  // Accordion (ordre IMPORTANT — pas de tri)
  if (state.piles) {
    for (const p of state.piles) {
      if (p?.cards) {
        for (const c of p.cards) fold(c.value * 31 + c.suit.charCodeAt(0));
      }
      fold(255);
    }
  }
  // CRITIQUE : `selected` distingue les états tap-to-select (Pyramid, Accordion).
  // Sans ça, TAP_PYRAMID(p) qui ne fait que sélectionner produit le même hash
  // que l'état précédent → faux positif "cycle détecté" → la solution stockée
  // est bypass et le jeu reste bloqué.
  if (state.selected !== undefined && state.selected !== null) {
    if (typeof state.selected === 'number') {
      fold(7000 + state.selected);
    } else if (state.selected.type === 'pyramid') {
      fold(8000 + (state.selected.row * 10) + state.selected.col);
    } else if (state.selected.type === 'waste') {
      fold(9000);
    }
  }
  // Combo (TriPeaks) — chains affect available scoring/state
  if (typeof state.combo === 'number') fold(6000 + state.combo);
  // StockCycles (Klondike FR) — passages de stock
  if (typeof state.stockCycles === 'number') fold(5000 + state.stockCycles);
  return (h >>> 0).toString(36);
}

function useSmartHint<S, A>(
  analyzer: (s: S, timeoutMs: number) => WinnabilityResult,
  fallback: (s: S, avoid?: Set<string>) => A | null,
  variantName: string,
) {
  const recentRef = useRef<string[]>([]);
  // Compte combien de fois chaque action a été proposée récemment.
  // Si une action revient ≥3 fois dans les 8 dernières → cycle confirmé.
  return useCallback((state: S): { action: A | null; cycle: boolean } => {
    const avoidSet = new Set(recentRef.current.slice(-4));

    const r = analyzer(state, 3000);
    let action: A | null = null;
    if (r.kind === 'winning') {
      const sig = JSON.stringify(r.action);
      if (avoidSet.has(sig)) {
        action = fallback(state, avoidSet);
      } else {
        action = r.action as A;
      }
    } else if (r.kind === 'timeout') action = fallback(state, avoidSet);
    else if (r.kind === 'proven-lost') action = fallback(state, avoidSet);

    if (!action) {
      // Toutes les options récentes épuisées et findHint sans avoid donne rien.
      // Vérifions si on peut retry sans avoid → si oui, on dispatch (cycle non confirmé).
      const fb = fallback(state);
      if (fb) {
        const sig = JSON.stringify(fb);
        // Si ce coup a déjà été proposé ≥2 fois → CYCLE CONFIRMÉ
        const occ = recentRef.current.filter((s) => s === sig).length;
        if (occ >= 2) {
          console.log(`🔁 [${variantName}] Cycle CONFIRMÉ : ${sig.slice(0, 60)} proposé ${occ + 1}× — STOP`);
          return { action: null, cycle: true };
        }
        console.log(`🔄 [${variantName}] Toutes options récentes épuisées — coup forcé`);
        return { action: fb, cycle: false };
      }
      return { action: null, cycle: false };
    }

    const actionType = (action as any)?.type as string | undefined;
    const isProgressAction = actionType === 'DEAL_ROW' || actionType === 'DRAW_FROM_STOCK' || actionType === 'DRAW' || actionType === 'DEAL';

    if (!isProgressAction) {
      const sig = JSON.stringify(action);
      const recent = recentRef.current;
      // Détection cycle : si même action déjà ≥2 fois dans les 8 dernières → CYCLE
      const occ = recent.filter((s) => s === sig).length;
      if (occ >= 2) {
        console.log(`🔁 [${variantName}] Cycle CONFIRMÉ sur ${sig.slice(0, 60)} (${occ + 1}× / 8) — STOP`);
        return { action: null, cycle: true };
      }
      recent.push(sig);
      if (recent.length > 8) recent.shift();
    }
    return { action, cycle: false };
  }, [analyzer, fallback, variantName]);
}

/** Bandeau visuel uniforme pour les 4 états de solvabilité. */
function SolvabilityBadge({ state }: { state: SolvableState }) {
  if (state === 'unknown') return null;
  if (state === 'lost-path') {
    return (
      <View style={{ backgroundColor: '#7C2D12', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="warning" size={14} color="#FED7AA" />
        <Text style={{ color: '#FED7AA', fontSize: 12, flex: 1 }}>Position non gagnable — Recommence</Text>
      </View>
    );
  }
  if (state === 'winning') {
    return (
      <View style={{ backgroundColor: '#064E3B', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="checkmark-circle" size={14} color="#A7F3D0" />
        <Text style={{ color: '#A7F3D0', fontSize: 12 }}>Position gagnable ✓</Text>
      </View>
    );
  }
  // checking
  return (
    <View style={{ backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="hourglass" size={14} color="#94A3B8" />
      <Text style={{ color: '#94A3B8', fontSize: 12 }}>Analyse de la position…</Text>
    </View>
  );
}

const log = logger.scoped('SoloGame');

export default function SoloGameScreen() {
  const { variant, difficulty: diffParam, vs, call, room } = useLocalSearchParams<{
    variant: string;
    difficulty?: string;
    vs?: string;
    call?: string;
    room?: string;
  }>();
  // En mode vs=bot, on force `easy` pour donner au joueur les indices ∞
  // (hintsAllowed('easy') === Infinity). Le user peut spammer le bouton 💡
  // quand il veut sans limite. Le `difficulty` du bot lui-même reste géré
  // séparément dans VsBotOverlay (sa cadence à lui).
  const isVsBot = vs === 'bot';
  const difficulty: Difficulty = isVsBot
    ? 'easy'
    : (diffParam === 'easy' || diffParam === 'hard' || diffParam === 'medium') ? diffParam : 'medium';
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const v = findVariant(variant ?? 'klondike-1');

  if (!v || !v.available) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title={t('solo.unavailableTitle')} showBack />
        <Text style={{ color: palette.text, padding: 20 }}>
          {t('solo.unavailableBody')}
        </Text>
      </View>
    );
  }

  // Factory : crée une NOUVELLE instance de l'écran moteur à chaque appel.
  // Indispensable pour pouvoir rendre Plateau 1 ET Plateau 2 avec le MÊME
  // écran moteur (mêmes règles, mêmes visuels, mêmes assets), mais chacun
  // avec son propre state interne. Chaque retour d'élément JSX donne une
  // instance React indépendante avec ses propres hooks/useReducer/seed.
  const buildEngineScreen = (): React.ReactNode => {
    if (v.engine === 'klondike') return <KlondikeScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'spider') return <SpiderScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'freecell') return <FreeCellScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'yukon') return <YukonScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'golf') return <GolfScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'pyramid') return <PyramidScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'tripeaks') return <TriPeaksScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'fortythieves') return <FortyThievesScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'accordion') return <AccordionScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'generic_tableau') return <GenericTableauScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'generic_distribution') return <GenericDistributionScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'pairs') return <PairsScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'golf_chain') return <GolfChainScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'math') return <MathScreen variant={v} difficulty={difficulty} />;
    if (v.engine === 'spider_v2') return <SpiderV2Screen variant={v} difficulty={difficulty} />;
    if (v.engine === 'maze') return <MazeScreen variant={v} difficulty={difficulty} />;
    return null;
  };
  const engineScreen = buildEngineScreen();

  if (!engineScreen) return null;

  if (!isVsBot) return <>{engineScreen}</>;

  // Mode vs=bot : Plateau 2 utilise le MÊME écran moteur que Plateau 1.
  // L'ancien `engineMod` (qui choisissait un module legacy pour
  // VsBotOverlay) n'est plus nécessaire — buildEngineScreen() rend une
  // instance React indépendante qui gère son propre state interne.

  // Si `?call=webrtc-p2p` ou `?call=jitsi-local` ET `?room=CODE`, on
  // incruste un panneau caméra (réduit) en haut-droite — l'utilisateur
  // voit son adversaire EN MÊME TEMPS que les 2 plateaux (le sien plein
  // écran + bot via VsBotOverlay).
  const showCallPanel = !!call && !!room;
  const callHost = (() => {
    // Reproduit la logique de lobby.tsx pour Jitsi local
    return undefined as string | undefined;
  })();

  // ═════════════════════════════════════════════════════════════════════
  // PLATEAU 2 — VISUEL IDENTIQUE À PLATEAU 1
  // ═════════════════════════════════════════════════════════════════════
  // Le bot joue sur le MÊME écran moteur que l'utilisateur. On appelle
  // `buildEngineScreen()` une seconde fois pour obtenir une instance React
  // distincte avec son propre state interne. Visuellement c'est identique
  // à Plateau 1 (même variante, mêmes cartes françaises PNG, même header
  // GameHeader, mêmes stats, même hint button).
  //
  // Wrapper `pointerEvents="none"` → bloque toutes les interactions tactiles
  // sur Plateau 2 (l'utilisateur ne peut pas accidentellement jouer pour le
  // bot). Le bot dispose de son propre seed/deal indépendant — donc les 2
  // plateaux peuvent avoir des donnes différentes (à syncer plus tard via
  // RaceContext si on veut comparer les coups sur une donne identique).
  //
  // L'ancien <VsBotOverlay> et <GenericBotPlateau> ne sont plus utilisés ici
  // (fichiers conservés pour ne pas casser d'autres callsites éventuels).
  const botEngineScreen = buildEngineScreen();
  const botPlateauNode = (
    <View pointerEvents="none" style={{ flex: 1 }}>
      {botEngineScreen}
    </View>
  );

  const callPanelNode = showCallPanel ? (
    call === 'webrtc-p2p' ? (
      <P2PCall
        roomCode={room!}
        displayName="Player"
        authToken={api.getAuthToken() || ''}
        simulatedPeers={[]}
        onClose={() => router.setParams({ call: undefined } as any)}
        layout="horizontal"
        botFallback={{ displayName: `Bot ${v.name}`, emoji: '🤖' }}
      />
    ) : (
      <ExternalJitsiCall
        roomCode={room!}
        displayName="Player"
        host={(global as any).__JITSI_LOCAL_HOST__ || 'localhost:8000'}
        simulatedPeers={[]}
        onClose={() => router.setParams({ call: undefined } as any)}
      />
    )
  ) : null;

  if (showCallPanel) {
    // Mode appel → layout structuré, scrollable, caméra en strip dédiée.
    return (
      <VsBotLayout
        userPlateau={engineScreen}
        botPlateau={botPlateauNode}
        callPanel={callPanelNode}
      />
    );
  }

  // Mode vs=bot sans appel → split simple haut/bas (comportement legacy).
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 65 }}>{engineScreen}</View>
      <View style={{ flex: 35 }}>{botPlateauNode}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composant générique : Modal "Jeu impossible"
// ─────────────────────────────────────────────────────────────────────────
function ImpossibleModal({ visible, onAgain, onQuit }: { visible: boolean; onAgain: () => void; onQuit: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <LinearGradient colors={['#581C87', '#1F0B2A']} style={[styles.modalCard, { borderColor: '#A855F7' }]}>
          <Text style={{ fontSize: 56 }}>🚫</Text>
          <Text style={styles.modalTitle}>{t('solo.impossible.title')}</Text>
          <Text style={[styles.modalSub, { textAlign: 'center', paddingHorizontal: 8 }]}>{t('solo.impossible.body')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <TouchableOpacity onPress={onAgain} style={[styles.modalBtn, { backgroundColor: '#A855F7' }]}>
              <Text style={styles.modalBtnText}>🔄 {t('solo.impossible.again')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onQuit} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={styles.modalBtnText}>{t('solo.quit')}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composant générique : Modal "Partie bloquée"
// ─────────────────────────────────────────────────────────────────────────
function StuckModal({ visible, onAgain, onQuit, onContinue }: { visible: boolean; onAgain: () => void; onQuit: () => void; onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <LinearGradient colors={['#7F1D1D', '#1F1216']} style={[styles.modalCard, { borderColor: '#EF4444' }]}>
          <Text style={{ fontSize: 56 }}>🔒</Text>
          <Text style={styles.modalTitle}>{t('solo.stuck.title')}</Text>
          <Text style={[styles.modalSub, { textAlign: 'center', paddingHorizontal: 8 }]}>{t('solo.stuck.body')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <TouchableOpacity onPress={onAgain} style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.modalBtnText}>🔄 {t('solo.stuck.again')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onContinue} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={styles.modalBtnText}>{t('solo.stuck.continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onQuit} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={styles.modalBtnText}>{t('solo.quit')}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composant générique : Chrono + Difficulty + Hint button
// ─────────────────────────────────────────────────────────────────────────
function GameHeader({ difficulty, seconds, hintsRemaining, canUseHint, onHint, onReset, palette, aiPlaying, onToggleAi, aiPreview, aiSpeed, onCycleSpeed }: {
  difficulty: Difficulty; seconds: number; hintsRemaining: number; canUseHint: boolean;
  onHint: () => void; onReset: () => void; palette: any;
  aiPlaying?: boolean; onToggleAi?: () => void;
  aiPreview?: string | null;
  aiSpeed?: { ms: number; label: string };
  onCycleSpeed?: () => void;
}) {
  const { t } = useTranslation();
  const colorByDiff: Record<Difficulty, string> = { easy: '#10B981', medium: '#F59E0B', hard: '#EF4444' };
  // L'AI suit la même règle que les hints : interdite en hard mode
  const aiAllowed = difficulty !== 'hard';
  const { needsTutorial, dismiss: dismissTutorial } = useAiTutorial();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Auto-show tutorial à la 1ère ouverture d'une partie (peu importe difficulté).
  // L'utilisateur en hard mode voit donc l'explication malgré que le bouton AI
  // soit caché — il sait que l'AI existe en easy/medium.
  useEffect(() => {
    if (needsTutorial && !tutorialOpen) {
      const timer = setTimeout(() => setTutorialOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [needsTutorial]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleAiToggle = useCallback(() => {
    if (needsTutorial && !aiPlaying) {
      // Clic AI alors que tutoriel pas dismissé : ouvre le tutoriel
      setTutorialOpen(true);
      return;
    }
    onToggleAi?.();
  }, [needsTutorial, aiPlaying, onToggleAi]);
  const handleTutorialDismiss = useCallback(() => {
    setTutorialOpen(false);
    dismissTutorial();
    // Si l'utilisateur a cliqué AI ET qu'on est en mode autorisé → démarre l'AI.
    // Si auto-show (pas de clic AI) ou hard mode → ne lance rien, juste dismiss.
    // Heuristique : démarrer si aiAllowed && !aiPlaying.
    // L'utilisateur peut toujours cliquer AI ensuite. Pour rester non-intrusif,
    // on NE démarre PAS automatiquement après dismiss.
  }, [dismissTutorial]);
  return (
    <View style={[styles.gameHeader, { borderColor: palette.border }]}>
      <View style={[styles.diffBadge, { backgroundColor: colorByDiff[difficulty] }]}>
        <Text style={styles.diffBadgeText}>{t(`solo.diff.${difficulty}`)}</Text>
      </View>
      <View style={styles.chrono}>
        <Ionicons name="time" size={14} color={palette.text} />
        <Text style={[styles.chronoText, { color: palette.text }]}>{fmtTime(seconds)}</Text>
      </View>
      {difficulty !== 'hard' ? (
        <TouchableOpacity onPress={onHint} disabled={!canUseHint}
          style={[styles.hintBtn, { backgroundColor: canUseHint ? APP_CONFIG.primary : 'rgba(255,255,255,0.1)' }]}>
          <Ionicons name="bulb" size={14} color="#fff" />
          <Text style={styles.hintBtnText}>
            {hintsRemaining === Infinity ? '∞' : `${hintsRemaining}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.hintBtn, { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444', borderWidth: 1 }]}>
          <Ionicons name="lock-closed" size={14} color="#EF4444" />
          <Text style={[styles.hintBtnText, { color: '#EF4444' }]}>{t('solo.diff.noHint')}</Text>
        </View>
      )}
      {onToggleAi && aiAllowed ? (
        <>
          <TouchableOpacity onPress={handleAiToggle}
            style={[styles.hintBtn, { backgroundColor: aiPlaying ? '#EF4444' : '#0EA5E9', marginLeft: 6 }]}>
            <Ionicons name={aiPlaying ? 'stop' : 'play'} size={14} color="#fff" />
            <Text style={styles.hintBtnText}>{aiPlaying ? t('solo.ai.stop') : t('solo.ai.start')}</Text>
          </TouchableOpacity>
          {aiPlaying && aiSpeed && onCycleSpeed ? (
            <TouchableOpacity onPress={onCycleSpeed}
              style={[styles.hintBtn, {
                backgroundColor: aiSpeed.label === 'Turbo' ? '#F97316' : '#1E293B',
                marginLeft: 4,
              }]}>
              <Ionicons name={aiSpeed.label === 'Turbo' ? 'flash' : 'speedometer'} size={12} color="#fff" />
              <Text style={[styles.hintBtnText, { fontSize: 10 }]}>{aiSpeed.label}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {aiPlaying && aiPreview ? (
        <AiPreviewBadge label={aiPreview} pulsing={aiSpeed?.label === 'Turbo'} />
      ) : null}
      <AiTutorialModal visible={tutorialOpen} onDismiss={handleTutorialDismiss} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KLONDIKE
// ─────────────────────────────────────────────────────────────────────────
export function KlondikeScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const drawCount: 1 | 3 = variant.options?.drawCount ?? 1;

  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Klondike.gameReducer, undefined, () =>
    Klondike.createInitialState(_race?.seed),
  );
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];

  // JEU IMPOSSIBLE : 2 cycles complets de la pioche + aucun coup possible
  useEffect(() => {
    if (state.phase !== 'playing' || showImpossible) return;
    if (Klondike.isImpossible(state)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: state.score ?? 0, moves: state.moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = (state.phase as string) === 'lost' || Klondike.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const [selected, setSelected] = useState<{ src: 'tableau' | 'waste'; col?: number; cardIndex?: number } | null>(null);

  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, Klondike.analyzeKlondikeWinnability, 'Klondike');
  useActionLog(variant.key, state.moves, state.score, `fondations=${state.foundations.reduce((a, f) => a + f.cards.length, 0)}/52`, state);
  const smartHint = useSmartHint(Klondike.analyzeKlondikeWinnability, Klondike.findHint, 'Klondike');
  const solHint = useStoredSolution(Klondike.getKlondikeSolution, Klondike.gameReducer, 'Klondike');
  useAutoSubmitDeal(variant.key, state, difficulty, Klondike.getKlondikeSolution);
  useBDFirstLoad<Klondike.GameState, Klondike.GameAction>(
    variant.key, difficulty, dispatch,
    Klondike.setKlondikeSolutionFromBD,
    Klondike.setKlondikeSolutionFromState,
    Klondike.getKlondikeSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Klondike.GameState, Klondike.GameAction>(
    aiPlaying, state, dispatch, Klondike.gameReducer,
    Klondike.getKlondikeSolution, Klondike.findHint, 'Klondike', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  // Persist game result on win (incl. difficulty + hintsUsed + durée chrono)
  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [Klondike] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    saveGameResult({
      gameType: 'solitaire',
      variant: variant.key,
      score: state.score,
      moves: state.moves,
      durationMs: chrono.elapsedMs(),
      won: true,
      difficulty,
      hintsUsed: hints.used,
    });
    replayRec.commit({
      variantKey: variant.key, difficulty,
      moves: state.moves, score: state.score,
      durationMs: chrono.elapsedMs(),
    });
  }, [won]);

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // Solution stockée épuisée → tenter AUTO-DRAW depuis stock.
    // Si DRAW refusé (stock vide), fallback findHint pour proposer un coup.
    if (state.stock && state.stock.length > 0) {
      const drawAttempt = Klondike.gameReducer(state, { type: 'DRAW_FROM_STOCK' } as any);
      if (drawAttempt !== state) {
        console.log(`💡 [Klondike] Plus de coup stockée — auto-DRAW du stock`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        for (let i = 0; i < drawCount; i++) dispatch({ type: 'DRAW_FROM_STOCK' });
        hints.consume();
        return;
      }
    }
    // Stock vide ou DRAW refusé → tenter findHint
    const fallback = Klondike.findHint(state);
    if (fallback) {
      console.log(`💡 [Klondike] Stock vide — coup proposé : ${JSON.stringify(fallback)}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [Klondike] Plus de coup et stock vide — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
    setSelected(null);
  };

  const drawStock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    for (let i = 0; i < drawCount; i++) {
      dispatch({ type: 'DRAW_FROM_STOCK' });
    }
  };

  const onCardPress = (src: 'tableau' | 'waste', cardId: string, col?: number, cardIndex?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selected) {
      // Second tap: move selected → destination column
      if (src === 'tableau' && col != null) {
        if (selected.src === 'tableau' && selected.col != null && selected.cardIndex != null) {
          // Same card re-tapped → just deselect
          if (selected.col === col && selected.cardIndex === cardIndex) {
            setSelected(null);
            return;
          }
          dispatch({
            type: 'MOVE_CARD',
            from: { type: 'tableau', index: selected.col, cardIndex: selected.cardIndex },
            to:   { type: 'tableau', index: col },
          });
        } else if (selected.src === 'waste') {
          dispatch({
            type: 'MOVE_CARD',
            from: { type: 'waste', index: 0 },
            to:   { type: 'tableau', index: col },
          });
        }
      }
      setSelected(null);
      return;
    }

    // First tap: try foundation auto-move on the top card only.
    // (The reducer rejects mid-stack cards.)
    const card = src === 'waste'
      ? state.waste[state.waste.length - 1]
      : (col != null ? state.tableau[col].cards[state.tableau[col].cards.length - 1] : null);
    const isTopCard = card?.id === cardId;
    if (isTopCard) {
      const targetIdx = Klondike.foundationIndexForSuit(state, card!.suit);
      if (targetIdx >= 0 && Klondike.canPlaceOnFoundation(card!, state.foundations[targetIdx])) {
        dispatch({ type: 'MOVE_TO_FOUNDATION', from: { type: src, index: 0 }, cardId });
        return;
      }
    }
    // Otherwise enter "select for tableau move" mode.
    setSelected({ src, col, cardIndex });
  };

  const onColumnEmptyPress = (col: number) => {
    if (!selected) return;
    if (selected.src === 'tableau' && selected.col != null && selected.cardIndex != null) {
      dispatch({
        type: 'MOVE_CARD',
        from: { type: 'tableau', index: selected.col, cardIndex: selected.cardIndex },
        to:   { type: 'tableau', index: col },
      });
    } else if (selected.src === 'waste') {
      dispatch({
        type: 'MOVE_CARD',
        from: { type: 'waste', index: 0 },
        to:   { type: 'tableau', index: col },
      });
    }
    setSelected(null);
  };

  const reset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAiPlaying(false);
    dispatch({ type: 'RESET' });
    setSelected(null);
    setShowWin(false);
    chrono.reset();
    hints.reset();
  };

  const cardsInFoundations = state.foundations.reduce((a, f) => a + f.cards.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader
        title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })}
        subtitle={t('solo.klondikeSubtitle', { drawCount })}
        showBack
      />

      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={52 - cardsInFoundations} palette={palette} />

        {/* Top: stock + waste + foundations */}
        <View style={styles.topRow}>
          <Pressable onPress={drawStock} style={styles.slot}>
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}>
                  <Text style={styles.badgeText}>{state.stock.length}</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: APP_CONFIG.primary }]}>
                <Ionicons name="refresh" size={22} color={APP_CONFIG.primary} />
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => state.waste.length > 0 && onCardPress('waste', state.waste[state.waste.length - 1].id)}
            style={[styles.slot, selected?.src === 'waste' && styles.selected]}
          >
            {state.waste.length > 0 ? (
              <FrenchCard code={Klondike.imageCode(state.waste[state.waste.length - 1])} width={50} height={70} />
            ) : (
              <View style={[styles.empty, { borderColor: palette.border }]}>
                <Text style={{ color: palette.textSecondary, fontSize: 9 }}>{t('solo.waste')}</Text>
              </View>
            )}
          </Pressable>

          <View style={{ width: 6 }} />

          {state.foundations.map((f, i) => {
            const top = f.cards[f.cards.length - 1];
            return (
              <View key={i} style={styles.slot}>
                {top ? (
                  <FrenchCard code={Klondike.imageCode(top)} width={50} height={70} />
                ) : (
                  <View style={[styles.empty, { borderColor: palette.border }]}>
                    <Text style={{ fontSize: 26, color: palette.textSecondary }}>
                      {Klondike.SUIT_GLYPH[f.suit ?? Klondike.SUITS[i]]}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Tableau */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableau')}</Text>
        <View style={styles.tableau}>
          {state.tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.col}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.length === 0 ? (
                <Pressable
                  onPress={() => onColumnEmptyPress(colIdx)}
                  style={[styles.empty, styles.emptyCol, { borderColor: palette.border }]}
                >
                  <Ionicons name="add" size={14} color={palette.textSecondary} />
                </Pressable>
              ) : (
                col.cards.map((card, cardIdx) => {
                  const isSelected =
                    selected?.src === 'tableau' &&
                    selected.col === colIdx &&
                    selected.cardIndex === cardIdx;
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => card.faceUp && onCardPress('tableau', card.id, colIdx, cardIdx)}
                      style={[
                        styles.tableauCardWrap,
                        { marginTop: cardIdx === 0 ? 0 : -45 },
                        isSelected && styles.selected,
                      ]}
                    >
                      <FrenchCard code={card.faceUp ? Klondike.imageCode(card) : 'BACK'} width={42} height={62} />
                    </Pressable>
                  );
                })
              )}
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'AUTO_COMPLETE' })} style={[styles.btn, { backgroundColor: '#10B981' }]}>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.auto')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.restart')}</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={selected ? t('solo.hintKlondikeSelected') : t('solo.hintKlondikeIdle')} />
      </ScrollView>

      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SPIDER
// ─────────────────────────────────────────────────────────────────────────
export function SpiderScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const suitMode = (variant.options?.suitMode ?? 4) as 1 | 2 | 4;
  // ── BD mode (deals pré-générés) ─────────────────────────────────────────
  // Si l'URL contient ?fromBD=true&dealId=… on fetch le deal MongoDB et on
  // override l'état initial. Le bouton hint passe alors en mode "replay" :
  // il lit le coup suivant depuis la séquence pré-calculée.
  const { fromBD: fromBDParam, dealId: dealIdParam } = useLocalSearchParams<{
    fromBD?: string; dealId?: string;
  }>();
  // Strict check : fromBD doit être exactement 'true' ET dealId doit être une
  // chaîne non vide ET pas la string littérale 'undefined' (cas edge expo-router)
  const isBDMode =
    fromBDParam === 'true' &&
    typeof dealIdParam === 'string' &&
    dealIdParam.length > 0 &&
    dealIdParam !== 'undefined';
  const bdTurnsRef = useRef<SpiderV2RawDeal['turns'] | null>(null);
  const bdNextTurnIdxRef = useRef<number>(1); // turn 0 = init, on commence à 1
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setBDLoading] = useState<boolean>(isBDMode);

  // En mode BD : on évite la génération locale coûteuse (solveur V2). On
  // initialise avec un placeholder VIDE, le useEffect plus bas chargera le
  // vrai deal depuis MongoDB et le dispatchera via LOAD_FROM_BD.
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Spider.gameReducer, undefined, () =>
    isBDMode
      ? Spider.createEmptyPlaceholderState(suitMode)
      : Spider.createInitialState(suitMode, _race?.seed),
  );
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;

  // Fetch + load le deal BD au montage UNIQUEMENT si fromBD=true
  useEffect(() => {
    if (!isBDMode || !dealIdParam) return;
    let cancelled = false;
    (async () => {
      try {
        const deal = await api.fetchSpiderV2DealById(String(dealIdParam));
        if (cancelled) return;
        if (!deal) {
          console.warn(`[SpiderBD] Deal introuvable : ${dealIdParam}`);
          setBDLoading(false);
          return;
        }
        const turn0 = deal.turns?.[0];
        if (!turn0?.state) {
          console.warn(`[SpiderBD] Turn 0 absent du deal ${dealIdParam}`);
          setBDLoading(false);
          return;
        }
        const sm = bdVariantToSuitMode(deal.variant) as 1 | 2 | 4;
        const initial = bdConvertSpiderState(turn0.state, sm);
        bdTurnsRef.current = deal.turns;
        bdNextTurnIdxRef.current = 1;
        dispatch({ type: 'LOAD_FROM_BD', state: initial });
        console.log(`[SpiderBD] Deal chargé : ${deal._id} (${deal.total_turns} tours, suitMode=${sm})`);
        setBDLoading(false);
      } catch (err: any) {
        console.warn(`[SpiderBD] Erreur fetch : ${err?.message ?? err}`);
        setBDLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBDMode, dealIdParam]);
  // ANTI-CYCLE GLOBAL : tracker tous les états visités depuis le début
  // de la partie. Tout coup proposé qui mène à un hash déjà vu est REFUSÉ.
  const visitedHashesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    visitedHashesRef.current.add(quickHashState(state));
  }, [state]);
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  // Détecte si le state est un PLACEHOLDER vide (mode BD avant chargement) :
  // 10 cols vides + stock vide + completed=[] = placeholder, pas un vrai blocage
  const isPlaceholder = (s: any): boolean =>
    !!s &&
    Array.isArray(s.tableau) &&
    s.tableau.length === 10 &&
    s.tableau.every((c: any) => c.cards?.length === 0) &&
    (s.stock?.length ?? 0) === 0 &&
    (s.completed?.length ?? 0) === 0;

  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    // Skip impossible check si on est en mode BD AVANT chargement (placeholder)
    if (isBDMode && isPlaceholder(state)) return;
    // Skip aussi si on est en mode BD ET qu'il reste des turns à jouer
    // (sinon le check fire entre 2 dispatch alors que la solution n'est pas finie)
    if (isBDMode && bdTurnsRef.current && bdNextTurnIdxRef.current < bdTurnsRef.current.length) return;
    if (Spider.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    // Skip stuck check si placeholder BD
    if (isBDMode && isPlaceholder(state)) return;
    // Skip si BD avec turns restants
    if (isBDMode && bdTurnsRef.current && bdNextTurnIdxRef.current < bdTurnsRef.current.length) return;
    const blocked = (state.phase as string) === 'lost' || Spider.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const [selected, setSelected] = useState<{ col: number; cardIndex: number } | null>(null);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  // En mode BD : Python garantit la solvabilité → forceWinning=true bypass
  // le check d'analyzer (qui peut être trop conservateur sur le placeholder).
  const solvable = useSolvabilityCheck(
    state,
    `${state.moves}-${state.tableau.reduce((a,c)=>a+c.cards.length,0)}`,
    Spider.analyzeSpiderWinnability,
    'Spider',
    isBDMode,
  );
  useActionLog(variant.key, state.moves, state.score, `runs=${state.completed.length}/8`, state);
  const smartHint = useSmartHint(Spider.analyzeSpiderWinnability, Spider.findHint, 'Spider');
  const solHint = useStoredSolution(Spider.getSpiderSolution, Spider.gameReducer, 'Spider');
  useAutoSubmitDeal(variant.key, state, difficulty, Spider.getSpiderSolution);
  useBDFirstLoad<Spider.GameState, Spider.GameAction>(
    variant.key, difficulty, dispatch,
    Spider.setSpiderSolutionFromBD,
    Spider.setSpiderSolutionFromState,
    Spider.getSpiderSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Spider.GameState, Spider.GameAction>(
    aiPlaying, state, dispatch, Spider.gameReducer,
    Spider.getSpiderSolution, (s) => Spider.findHint(s), 'Spider', aiSpeed.ms,
    () => setAiPlaying(false),
  );
  const onHint = () => {
    if (!hints.canUseHint) return;
    // BD MODE : on LOAD directement le state du turn suivant depuis le JSON
    // (au lieu de dispatcher MOVE_RUN qui re-calcule face-up différemment
    // de Python). Cela garantit que notre état matche EXACTEMENT Python
    // à chaque turn, pas de divergence sur les cartes face-up.
    if (isBDMode && bdTurnsRef.current) {
      const turns = bdTurnsRef.current;
      const idx = bdNextTurnIdxRef.current;
      if (idx >= turns.length) {
        console.log(`[SpiderBD] Plus de coup en BD (idx=${idx}/${turns.length})`);
      } else {
        const nextTurn = turns[idx];
        if (nextTurn?.state) {
          // Convertit le state Python du turn suivant et le charge directement
          const nextState = bdConvertSpiderState(nextTurn.state, suitMode);
          // Préserve le score (chaque turn → score décrémente comme un MOVE_RUN)
          // Détecte si une fondation a été complétée (foundations.length augmenté)
          const prevFoundations = (state as any).completed?.length ?? 0;
          const newFoundations = (nextTurn.state.foundations ?? []).filter((f) => f).length;
          const completionBonus = (newFoundations - prevFoundations) * 100;
          // FIX CRITIQUE : si 8/8 fondations → phase='won' obligatoire,
          // sinon le check JEU IMPOSSIBLE qui tourne juste après ne voit pas
          // la victoire (state.phase reste 'playing') et déclenche la défaite
          // alors qu'on vient de gagner.
          const isWinState = newFoundations >= 8;
          const stateWithMoves: any = {
            ...nextState,
            moves: state.moves + 1,
            score: state.score - 1 + completionBonus,
            // Reconstruit les fondations complétées (Python ne stocke que la suit)
            completed: Array.from({ length: newFoundations }, (_, i) =>
              (state as any).completed?.[i] ?? [],
            ),
            phase: isWinState ? 'won' : 'playing',
          };
          console.log(`[SpiderBD] Turn ${idx} → load state (move=${JSON.stringify(nextTurn.move)})`);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          dispatch({ type: 'LOAD_FROM_BD', state: stateWithMoves });
          bdNextTurnIdxRef.current = idx + 1;
          hints.consume();
          return;
        }
        console.warn(`[SpiderBD] Turn ${idx} sans state — fallback cascade`);
      }
    }
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // CASCADE INTELLIGENTE : on PRIVILÉGIE les coups productifs et on
    // évite DEAL_ROW tant qu'il existe un coup productif.
    //
    // Coup PRODUCTIF = révèle une face-down OU complète un run.
    // Anticipation 2 niveaux : si A → A' n'est pas productif mais que
    // depuis A' un coup A'B est productif, alors A est productif.
    //
    // Ordre :
    //  1) findProductiveSpiderMove (lookahead 2) — le COEUR du système
    //  2) DEAL_ROW si autorisé (ne s'utilise QUE si plus rien de productif)
    //  3) Coup pour remplir colonne vide (débloquer DEAL_ROW)
    //  4) Stop : recommence la partie
    const visited = visitedHashesRef.current;

    // 1) Coup productif (lookahead 2 niveaux, anti-cycle)
    const productive = findProductiveSpiderMove(state, visited);
    if (productive) {
      console.log(`💡 [Spider] Coup productif (lookahead 2) : ${JSON.stringify(productive)}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(productive);
      hints.consume();
      return;
    }

    // 2) Aucun coup productif : DEAL_ROW si autorisé
    if (state.stock && state.stock.length > 0) {
      const dealAttempt = Spider.gameReducer(state, { type: 'DEAL_ROW' } as any);
      if (dealAttempt !== state) {
        console.log(`💡 [Spider] Aucun coup productif — DEAL_ROW depuis stock (${state.stock.length} cartes)`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        dispatch({ type: 'DEAL_ROW' });
        hints.consume();
        return;
      }
      // 3) DEAL_ROW refusé (col vide) → coup de remplissage
      const fillMove = enumerateLegalSpiderMoves(state).find(
        (m) => !visited.has(quickHashState(m.next))
      );
      if (fillMove) {
        console.log(`💡 [Spider] DEAL_ROW bloqué (col vide) — remplissage : ${JSON.stringify(fillMove.action)}`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        dispatch(fillMove.action);
        hints.consume();
        return;
      }
    }

    // 4) ENDGAME : si on est proche de la victoire (5+ runs done), beam search
    //    profond pour trouver le chemin vers une nouvelle complétion de run.
    if (state.completed && state.completed.length >= 5) {
      const endgameMove = findEndgameSpiderMove(state, visited);
      if (endgameMove) {
        console.log(`💡 [Spider] Endgame solver — coup vers complétion : ${JSON.stringify(endgameMove)}`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        dispatch(endgameMove);
        hints.consume();
        return;
      }
    }

    // 5) Pas productif + pas de DEAL_ROW + pas d'endgame : on tente N'IMPORTE
    //    QUEL coup légal non-vu (cycle detection via visited).
    const anyLegal = enumerateLegalSpiderMoves(state).find(
      (m) => !visited.has(quickHashState(m.next))
    );
    if (anyLegal) {
      console.log(`💡 [Spider] Plus de coup productif — coup de secours : ${JSON.stringify(anyLegal.action)}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      dispatch(anyLegal.action);
      hints.consume();
      return;
    }

    // 5) Vraiment plus rien : tous les états atteints + pas de stock + pas de coup non-vu
    console.log(`💡 [Spider] Tous les états explorés — partie réellement bloquée`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); hints.consume(); setSelected(null);
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [Spider] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    saveGameResult({
      gameType: 'solitaire',
      variant: variant.key,
      score: state.score,
      moves: state.moves,
      durationMs: chrono.elapsedMs(),
      won: true,
      difficulty,
      hintsUsed: hints.used,
    });
    replayRec.commit({
      variantKey: variant.key, difficulty,
      moves: state.moves, score: state.score,
      durationMs: chrono.elapsedMs(),
    });
  }, [won]);

  const onCardPress = (col: number, cardIndex: number, faceUp: boolean) => {
    if (!faceUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selected) {
      dispatch({ type: 'MOVE_RUN', fromCol: selected.col, fromCardIndex: selected.cardIndex, toCol: col });
      setSelected(null);
    } else {
      setSelected({ col, cardIndex });
    }
  };

  const dealRow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({ type: 'DEAL_ROW' });
  };

  const reset = () => {
    setAiPlaying(false);
    // En mode BD on rejoue le même deal depuis le tour 0 ; sinon on génère
    // une nouvelle donne random.
    if (isBDMode && bdTurnsRef.current) {
      const turn0 = bdTurnsRef.current[0];
      if (turn0?.state) {
        const sm = (variant.options?.suitMode ?? suitMode) as 1 | 2 | 4;
        const initial = bdConvertSpiderState(turn0.state, sm);
        dispatch({ type: 'LOAD_FROM_BD', state: initial });
        bdNextTurnIdxRef.current = 1;
      } else {
        dispatch({ type: 'RESET', suitMode });
      }
    } else {
      dispatch({ type: 'RESET', suitMode });
    }
    setSelected(null);
    setShowWin(false);
    chrono.reset();
    hints.reset();
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={isBDMode ? `BD : ${dealIdParam}` : t('solo.spiderSubtitle', { suitMode })} showBack />

      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats
          moves={state.moves}
          score={state.score}
          remaining={104 - state.completed.length * 13 - state.tableau.reduce((a, c) => a + c.cards.length, 0)}
          palette={palette}
        />

        {/* Suites complétées + pioche */}
        <View style={styles.topRow}>
          <Pressable
            onPress={dealRow}
            style={[styles.slot, state.tableau.some((c) => c.cards.length === 0) && { opacity: 0.4 }]}
          >
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}>
                  <Text style={styles.badgeText}>{Math.floor(state.stock.length / 10)}</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: palette.border }]}>
                <Text style={{ color: palette.textSecondary, fontSize: 9 }}>{t('solo.empty')}</Text>
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text style={{ color: palette.textSecondary, fontSize: 12, fontFamily: 'Inter-Bold' }}>
            ✅ {t('solo.spiderRunsLabel', { done: state.completed.length, total: 8 })}
          </Text>
        </View>

        {/* 10 colonnes */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableauCols', { n: 10 })}</Text>
        <View style={[styles.tableau, { gap: 2 }]}>
          {state.tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.colSpider}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.length === 0 ? (
                <Pressable
                  onPress={() => selected && (
                    dispatch({ type: 'MOVE_RUN', fromCol: selected.col, fromCardIndex: selected.cardIndex, toCol: colIdx }),
                    setSelected(null)
                  )}
                  style={[styles.empty, { width: 32, height: 50, borderColor: palette.border }]}
                >
                  <Ionicons name="add" size={12} color={palette.textSecondary} />
                </Pressable>
              ) : (
                col.cards.map((card, cardIdx) => {
                  const isSelected = selected?.col === colIdx && selected.cardIndex === cardIdx;
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => onCardPress(colIdx, cardIdx, card.faceUp)}
                      style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -38 }, isSelected && styles.selected]}
                    >
                      <FrenchCard code={card.faceUp ? Spider.imageCode(card) : 'BACK'} width={32} height={50} />
                    </Pressable>
                  );
                })
              )}
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={dealRow} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="layers" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.deal')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.restart')}</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={selected ? t('solo.hintSpiderSelected') : t('solo.hintSpiderIdle')} />
      </ScrollView>

      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FREECELL
// ─────────────────────────────────────────────────────────────────────────
export function FreeCellScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(FreeCell.gameReducer, undefined, () =>
    FreeCell.createInitialState(_race?.seed),
  );
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (FreeCell.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = (state.phase as string) === 'lost' || FreeCell.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const [selected, setSelected] = useState<{ cardId: string } | null>(null);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, FreeCell.analyzeFreeCellWinnability, 'FreeCell');
  useActionLog(variant.key, state.moves, state.score, `fondations=${state.foundations.reduce((a, f) => a + f.cards.length, 0)}/52`, state);
  const smartHint = useSmartHint(FreeCell.analyzeFreeCellWinnability, FreeCell.findHint, 'FreeCell');
  const solHint = useStoredSolution(FreeCell.getFreeCellSolution, FreeCell.gameReducer, 'FreeCell');
  useAutoSubmitDeal(variant.key, state, difficulty, FreeCell.getFreeCellSolution);
  useBDFirstLoad<FreeCell.GameState, FreeCell.GameAction>(
    variant.key, difficulty, dispatch,
    FreeCell.setFreeCellSolutionFromBD,
    FreeCell.setFreeCellSolutionFromState,
    FreeCell.getFreeCellSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<FreeCell.GameState, FreeCell.GameAction>(
    aiPlaying, state, dispatch, FreeCell.gameReducer,
    FreeCell.getFreeCellSolution, FreeCell.findHint, 'FreeCell', aiSpeed.ms,
    () => setAiPlaying(false),
  );
  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // FreeCell n'a pas de stock → fallback findHint pour proposer un coup
    const fallback = FreeCell.findHint(state);
    if (fallback) {
      console.log(`💡 [FreeCell] Solution stockée épuisée — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [FreeCell] Plus de coup possible — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [FreeCell] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    saveGameResult({
      gameType: 'solitaire',
      variant: variant.key,
      score: state.score,
      moves: state.moves,
      durationMs: chrono.elapsedMs(),
      won: true,
      difficulty,
      hintsUsed: hints.used,
    });
    replayRec.commit({
      variantKey: variant.key, difficulty,
      moves: state.moves, score: state.score,
      durationMs: chrono.elapsedMs(),
    });
  }, [won]);

  const move = (toType: 'tableau' | 'freecell' | 'foundation', toIndex: number) => {
    if (!selected) return;
    dispatch({ type: 'MOVE_CARD', cardId: selected.cardId, toType, toIndex });
    setSelected(null);
  };

  const onCardPress = (cardId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelected({ cardId });
  };

  const reset = () => {
    setAiPlaying(false);
    dispatch({ type: 'RESET' });
    setSelected(null);
    setShowWin(false);
    chrono.reset();
    hints.reset();
  };

  const cardsInFoundations = state.foundations.reduce((a, f) => a + f.cards.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t('variant.freecell.name', { defaultValue: 'FreeCell' })} subtitle={t('solo.freecellSubtitle')} showBack />

      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={52 - cardsInFoundations} palette={palette} />

        {/* 4 free cells + 4 foundations */}
        <View style={styles.topRow}>
          {state.freeCells.map((c, i) => (
            <Pressable key={`fc${i}`} onPress={() => selected ? move('freecell', i) : c && onCardPress(c.id)}
              style={[styles.slot, selected && c?.id === selected.cardId && styles.selected]}>
              {c ? (
                <FrenchCard code={FreeCell.imageCode(c)} width={50} height={70} />
              ) : (
                <View style={[styles.empty, { borderColor: '#06B6D4' }]}>
                  <Text style={{ color: '#06B6D4', fontSize: 10, fontFamily: 'Inter-Bold' }}>FC{i + 1}</Text>
                </View>
              )}
            </Pressable>
          ))}
          <View style={{ width: 6 }} />
          {state.foundations.map((f, i) => {
            const top = f.cards[f.cards.length - 1];
            return (
              <Pressable key={`fo${i}`} onPress={() => selected && move('foundation', i)} style={styles.slot}>
                {top ? (
                  <FrenchCard code={FreeCell.imageCode(top)} width={50} height={70} />
                ) : (
                  <View style={[styles.empty, { borderColor: palette.border }]}>
                    <Text style={{ fontSize: 26, color: palette.textSecondary }}>
                      {FreeCell.SUIT_GLYPH[f.suit]}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* 8 colonnes */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableauCols', { n: 8 })}</Text>
        <View style={[styles.tableau, { gap: 4 }]}>
          {state.tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.col}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.length === 0 ? (
                <Pressable onPress={() => selected && move('tableau', colIdx)} style={[styles.empty, styles.emptyCol, { borderColor: palette.border }]}>
                  <Ionicons name="add" size={14} color={palette.textSecondary} />
                </Pressable>
              ) : (
                col.cards.map((card, cardIdx) => {
                  const isSelected = selected?.cardId === card.id;
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => selected ? move('tableau', colIdx) : onCardPress(card.id)}
                      style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -45 }, isSelected && styles.selected]}
                    >
                      <FrenchCard code={FreeCell.imageCode(card)} width={42} height={62} />
                    </Pressable>
                  );
                })
              )}
            </View>
          ))}
        </View>

        <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 8 }}>
          {t('solo.freeCellStatus', {
            freeCells: state.freeCells.filter((c) => !c).length,
            emptyCols: state.tableau.filter((c) => c.cards.length === 0).length,
            maxMove: FreeCell.maxMovableCards(state),
          })}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'AUTO_TO_FOUNDATIONS' })} style={[styles.btn, { backgroundColor: '#10B981' }]}>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.autoFoundations')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.btnText}>{t('solo.restart')}</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={selected ? t('solo.hintFreeCellSelected') : t('solo.hintFreeCellIdle')} />
      </ScrollView>

      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// YUKON
// ─────────────────────────────────────────────────────────────────────────
export function YukonScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Yukon.gameReducer, undefined, () => Yukon.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (Yukon.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = (state.phase as string) === 'lost' || Yukon.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const [selected, setSelected] = useState<{ col: number; idx: number } | null>(null);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, Yukon.analyzeYukonWinnability, 'Yukon');
  useActionLog(variant.key, state.moves, state.score, `fondations=${state.foundations.reduce((a, f) => a + f.cards.length, 0)}/52`, state);
  const smartHint = useSmartHint(Yukon.analyzeYukonWinnability, Yukon.findHint, 'Yukon');
  const solHint = useStoredSolution(Yukon.getYukonSolution, Yukon.gameReducer, 'Yukon');
  useAutoSubmitDeal(variant.key, state, difficulty, Yukon.getYukonSolution);
  useBDFirstLoad<Yukon.GameState, Yukon.GameAction>(
    variant.key, difficulty, dispatch,
    Yukon.setYukonSolutionFromBD,
    Yukon.setYukonSolutionFromState,
    Yukon.getYukonSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Yukon.GameState, Yukon.GameAction>(
    aiPlaying, state, dispatch, Yukon.gameReducer,
    Yukon.getYukonSolution, Yukon.findHint, 'Yukon', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // Yukon n'a pas de stock → fallback findHint pour proposer un coup
    const fallback = Yukon.findHint(state);
    if (fallback) {
      console.log(`💡 [Yukon] Solution stockée épuisée — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      setSelected(null);
      return;
    }
    console.log(`💡 [Yukon] Plus de coup possible — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
    setSelected(null);
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [Yukon] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: state.score, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: state.score, durationMs: chrono.elapsedMs() });
  }, [won]);

  const onCardPress = (col: number, idx: number, faceUp: boolean) => {
    if (!faceUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selected) {
      if (selected.col === col && selected.idx === idx) { setSelected(null); return; }
      dispatch({ type: 'MOVE', fromCol: selected.col, fromCardIndex: selected.idx, toCol: col });
      setSelected(null);
      return;
    }
    // Try foundation auto if it's the top card
    const card = state.tableau[col].cards[state.tableau[col].cards.length - 1];
    if (card && card.id === state.tableau[col].cards[idx].id) {
      const fIdx = state.foundations.findIndex((f) => Yukon.canPlaceOnFoundation(card, f));
      if (fIdx >= 0) { dispatch({ type: 'TO_FOUNDATION', cardId: card.id }); return; }
    }
    setSelected({ col, idx });
  };

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setSelected(null); setShowWin(false); };
  const cardsInFoundations = state.foundations.reduce((a, f) => a + f.cards.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.yukonSubtitle')} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={52 - cardsInFoundations} palette={palette} />

        {/* Foundations */}
        <View style={styles.topRow}>
          {state.foundations.map((f, i) => {
            const top = f.cards[f.cards.length - 1];
            return (
              <View key={i} style={styles.slot}>
                {top ? (
                  <FrenchCard code={Yukon.imageCode(top)} width={50} height={70} />
                ) : (
                  <View style={[styles.empty, { borderColor: palette.border }]}>
                    <Text style={{ fontSize: 26, color: palette.textSecondary }}>{Yukon.SUIT_GLYPH[f.suit]}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableauCols', { n: 7 })}</Text>
        <View style={styles.tableau}>
          {state.tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.col}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.length === 0 ? (
                <Pressable
                  onPress={() => selected && (dispatch({ type: 'MOVE', fromCol: selected.col, fromCardIndex: selected.idx, toCol: colIdx }), setSelected(null))}
                  style={[styles.empty, styles.emptyCol, { borderColor: palette.border }]}
                >
                  <Ionicons name="add" size={14} color={palette.textSecondary} />
                </Pressable>
              ) : (
                col.cards.map((card, cardIdx) => {
                  const isSel = selected?.col === colIdx && selected.idx === cardIdx;
                  return (
                    <Pressable key={card.id} onPress={() => card.faceUp && onCardPress(colIdx, cardIdx, true)}
                      style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -45 }, isSel && styles.selected]}>
                      <FrenchCard code={card.faceUp ? Yukon.imageCode(card) : 'BACK'} width={42} height={62} />
                    </Pressable>
                  );
                })
              )}
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'AUTO_COMPLETE' })} style={[styles.btn, { backgroundColor: '#10B981' }]}>
            <Ionicons name="flash" size={16} color="#fff" /><Text style={styles.btnText}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={selected ? t('solo.hintYukonSelected') : t('solo.hintYukonIdle')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// GOLF
// ─────────────────────────────────────────────────────────────────────────
export function GolfScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Golf.gameReducer, undefined, () => Golf.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (Golf.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = state.phase === 'lost' || Golf.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const lost = state.phase === 'lost';
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, Golf.analyzeGolfWinnability, 'Golf');
  useActionLog(variant.key, state.moves, state.score, `waste=${state.waste.length}, stock=${state.stock.length}`, state);
  const smartHint = useSmartHint(Golf.analyzeGolfWinnability, Golf.findHint, 'Golf');
  const solHint = useStoredSolution(Golf.getGolfSolution, Golf.gameReducer, 'Golf');
  useAutoSubmitDeal(variant.key, state, difficulty, Golf.getGolfSolution);
  useBDFirstLoad<Golf.GameState, Golf.GameAction>(
    variant.key, difficulty, dispatch,
    Golf.setGolfSolutionFromBD,
    Golf.setGolfSolutionFromState,
    Golf.getGolfSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Golf.GameState, Golf.GameAction>(
    aiPlaying, state, dispatch, Golf.gameReducer,
    Golf.getGolfSolution, Golf.findHint, 'Golf', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // Solution stockée épuisée → tenter AUTO-DRAW puis fallback findHint
    if (state.stock && state.stock.length > 0) {
      const drawAttempt = Golf.gameReducer(state, { type: 'DRAW' } as any);
      if (drawAttempt !== state) {
        console.log(`💡 [Golf] Plus de coup stockée — auto-DRAW du stock`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        dispatch({ type: 'DRAW' });
        hints.consume();
        return;
      }
    }
    const fallback = Golf.findHint(state);
    if (fallback) {
      console.log(`💡 [Golf] Stock épuisé — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [Golf] Plus de coup et stock vide — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [Golf] VICTOIRE — ${state.moves} coups, score ${100 - state.score}`);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: 100 - state.score, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: 100 - state.score, durationMs: chrono.elapsedMs() });
  }, [won]);

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setShowWin(false); };
  const wasteTop = state.waste[state.waste.length - 1];

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.golfSubtitle')} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={state.score} palette={palette} />

        <View style={styles.topRow}>
          <Pressable onPress={() => dispatch({ type: 'DRAW' })} style={styles.slot}>
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}>
                  <Text style={styles.badgeText}>{state.stock.length}</Text>
                </View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: palette.border }]}>
                <Ionicons name="lock-closed" size={18} color={palette.textSecondary} />
              </View>
            )}
          </Pressable>
          <View style={{ width: 12 }} />
          <View style={styles.slot}>
            {wasteTop ? <FrenchCard code={Golf.imageCode(wasteTop)} width={50} height={70} /> : null}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableauCards', { n: 35 })}</Text>
        <View style={styles.tableau}>
          {state.tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.col}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.map((card, cardIdx) => {
                const isTop = cardIdx === col.cards.length - 1;
                const playable = isTop && Golf.isPlayableOn(card, wasteTop);
                return (
                  <Pressable key={card.id} onPress={() => isTop && dispatch({ type: 'PLAY', col: colIdx })}
                    style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -45 }, playable && styles.selected]}>
                    <FrenchCard code={Golf.imageCode(card)} width={42} height={62} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'DRAW' })} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="layers" size={16} color="#fff" /><Text style={styles.btnText}>{t('solo.draw')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={lost ? t('solo.hintGolfLost') : t('solo.hintGolfIdle')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: 100 - state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PYRAMID
// ─────────────────────────────────────────────────────────────────────────
export function PyramidScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Pyramid.gameReducer, undefined, () => Pyramid.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (Pyramid.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = state.phase === 'lost' || Pyramid.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, Pyramid.analyzePyramidWinnability, 'Pyramid');
  useActionLog(variant.key, state.moves, state.score, `pyramide retirée=${state.score}/28`, state);
  const smartHint = useSmartHint(Pyramid.analyzePyramidWinnability, Pyramid.findHint, 'Pyramid');
  const solHint = useStoredSolution(Pyramid.getPyramidSolution, Pyramid.gameReducer, 'Pyramid');
  useAutoSubmitDeal(variant.key, state, difficulty, Pyramid.getPyramidSolution);
  useBDFirstLoad<Pyramid.GameState, Pyramid.GameAction>(
    variant.key, difficulty, dispatch,
    Pyramid.setPyramidSolutionFromBD,
    Pyramid.setPyramidSolutionFromState,
    Pyramid.getPyramidSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Pyramid.GameState, Pyramid.GameAction>(
    aiPlaying, state, dispatch, Pyramid.gameReducer,
    Pyramid.getPyramidSolution, Pyramid.findHint, 'Pyramid', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // Solution stockée épuisée → tenter AUTO-DRAW puis fallback findHint
    if (state.stock && state.stock.length > 0) {
      const drawAttempt = Pyramid.gameReducer(state, { type: 'DRAW' } as any);
      if (drawAttempt !== state) {
        console.log(`💡 [Pyramid] Plus de coup stockée — auto-DRAW du stock`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        dispatch({ type: 'DRAW' });
        hints.consume();
        return;
      }
    }
    const fallback = Pyramid.findHint(state);
    if (fallback) {
      console.log(`💡 [Pyramid] Stock épuisé — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [Pyramid] Plus de coup et stock vide — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    console.log(`🏆 [Pyramid] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    setShowWin(true);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: state.score, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: state.score, durationMs: chrono.elapsedMs() });
  }, [won]);

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setShowWin(false); };
  const wasteTop = state.waste[state.waste.length - 1];

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.pyramidSubtitle')} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={28 - state.score} palette={palette} />

        {/* Pyramid */}
        <View style={{ alignItems: 'center', marginVertical: 16 }}>
          {state.pyramid.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 4, marginBottom: -25 }}>
              {row.map((slot, c) => {
                const avail = Pyramid.isAvailable(state.pyramid, r, c);
                const isSel = state.selected?.type === 'pyramid' && state.selected.row === r && state.selected.col === c;
                return slot ? (
                  <Pressable key={c} onPress={() => dispatch({ type: 'TAP_PYRAMID', row: r, col: c })}
                    style={[{ opacity: avail ? 1 : 0.45 }, isSel && styles.selected]}>
                    <FrenchCard code={Pyramid.imageCode(slot)} width={38} height={56} />
                  </Pressable>
                ) : (
                  <View key={c} style={{ width: 38, height: 56 }} />
                );
              })}
            </View>
          ))}
        </View>

        {/* Stock + waste */}
        <View style={styles.topRow}>
          <Pressable onPress={() => dispatch({ type: 'DRAW' })} style={styles.slot}>
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}><Text style={styles.badgeText}>{state.stock.length}</Text></View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: palette.border }]}><Ionicons name="lock-closed" size={18} color={palette.textSecondary} /></View>
            )}
          </Pressable>
          <View style={{ width: 12 }} />
          <Pressable onPress={() => wasteTop && dispatch({ type: 'TAP_WASTE' })}
            style={[styles.slot, state.selected?.type === 'waste' && styles.selected]}>
            {wasteTop ? <FrenchCard code={Pyramid.imageCode(wasteTop)} width={50} height={70} /> : (
              <View style={[styles.empty, { borderColor: palette.border }]}><Text style={{ color: palette.textSecondary, fontSize: 9 }}>WASTE</Text></View>
            )}
          </Pressable>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'DRAW' })} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="layers" size={16} color="#fff" /><Text style={styles.btnText}>{t('solo.draw')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={t('solo.hintPyramid')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TRIPEAKS
// ─────────────────────────────────────────────────────────────────────────
export function TriPeaksScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(TriPeaks.gameReducer, undefined, () => TriPeaks.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (TriPeaks.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = state.phase === 'lost' || TriPeaks.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, TriPeaks.analyzeTriPeaksWinnability, 'TriPeaks');
  useActionLog(variant.key, state.moves, state.score, `combo=${state.combo}, restantes=${state.slots.filter((s) => s.card).length}/28`, state);
  const smartHint = useSmartHint(TriPeaks.analyzeTriPeaksWinnability, TriPeaks.findHint, 'TriPeaks');
  const solHint = useStoredSolution(TriPeaks.getTriPeaksSolution, TriPeaks.gameReducer, 'TriPeaks');
  useAutoSubmitDeal(variant.key, state, difficulty, TriPeaks.getTriPeaksSolution);
  useBDFirstLoad<TriPeaks.GameState, TriPeaks.GameAction>(
    variant.key, difficulty, dispatch,
    TriPeaks.setTriPeaksSolutionFromBD,
    TriPeaks.setTriPeaksSolutionFromState,
    TriPeaks.getTriPeaksSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<TriPeaks.GameState, TriPeaks.GameAction>(
    aiPlaying, state, dispatch, TriPeaks.gameReducer,
    TriPeaks.getTriPeaksSolution, TriPeaks.findHint, 'TriPeaks', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // POLITIQUE STRICTE : si la solution stockée est épuisée, on NE dispatche
    // RIEN. Pas de fallback findHint qui pourrait proposer un coup improductif
    // ou cyclique. L'utilisateur peut cliquer "Distribuer" pour redistribuer.
    // Solution stockée épuisée → tenter AUTO-DRAW puis fallback findHint
    if (state.stock && state.stock.length > 0) {
      const drawAttempt = TriPeaks.gameReducer(state, { type: 'DRAW' } as any);
      if (drawAttempt !== state) {
        console.log(`💡 [TriPeaks] Plus de coup stockée — auto-DRAW du stock`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        dispatch({ type: 'DRAW' });
        hints.consume();
        return;
      }
    }
    const fallback = TriPeaks.findHint(state);
    if (fallback) {
      console.log(`💡 [TriPeaks] Stock épuisé — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [TriPeaks] Plus de coup et stock vide — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [TriPeaks] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: state.score, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: state.score, durationMs: chrono.elapsedMs() });
  }, [won]);

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setShowWin(false); };
  const wasteTop = state.waste[state.waste.length - 1];

  // Render each row: row 0 (3 cards), row 1 (6), row 2 (9), row 3 (10).
  const rowRanges = [[0,3],[3,9],[9,18],[18,28]];

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.tripeaksSubtitle', { combo: state.combo })} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={state.slots.filter((s) => s.card).length} palette={palette} />

        <View style={{ alignItems: 'center', marginVertical: 12 }}>
          {rowRanges.map(([s, e], r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 3, marginBottom: -22 }}>
              {state.slots.slice(s, e).map((slot, idx) => {
                const globalIdx = s + idx;
                if (!slot.card) return <View key={globalIdx} style={{ width: 36, height: 50 }} />;
                return (
                  <Pressable key={globalIdx}
                    onPress={() => slot.faceUp && dispatch({ type: 'PLAY_SLOT', index: globalIdx })}
                    style={{ opacity: slot.faceUp ? 1 : 0.6 }}>
                    <FrenchCard code={slot.faceUp ? TriPeaks.imageCode(slot.card) : 'BACK'} width={36} height={50} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.topRow}>
          <Pressable onPress={() => dispatch({ type: 'DRAW' })} style={styles.slot}>
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}><Text style={styles.badgeText}>{state.stock.length}</Text></View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: palette.border }]}><Ionicons name="lock-closed" size={18} color={palette.textSecondary} /></View>
            )}
          </Pressable>
          <View style={{ width: 12 }} />
          <View style={styles.slot}>
            {wasteTop ? <FrenchCard code={TriPeaks.imageCode(wasteTop)} width={50} height={70} /> : null}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'DRAW' })} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="layers" size={16} color="#fff" /><Text style={styles.btnText}>{t('solo.draw')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={t('solo.hintTriPeaks')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FORTY THIEVES
// ─────────────────────────────────────────────────────────────────────────
export function FortyThievesScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(FortyThieves.gameReducer, undefined, () => FortyThieves.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (FortyThieves.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = (state.phase as string) === 'lost' || FortyThieves.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const [selected, setSelected] = useState<{ src: 'tableau' | 'waste'; col?: number } | null>(null);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);
  const solvable = useSolvabilityCheck(state, state.moves, FortyThieves.analyzeFortyThievesWinnability, 'FortyThieves');
  useActionLog(variant.key, state.moves, state.score, `fondations=${state.foundations.reduce((a, f) => a + f.cards.length, 0)}/104`, state);
  const smartHint = useSmartHint(FortyThieves.analyzeFortyThievesWinnability, FortyThieves.findHint, 'FortyThieves');
  const solHint = useStoredSolution(FortyThieves.getFortyThievesSolution, FortyThieves.gameReducer, 'FortyThieves');
  useAutoSubmitDeal(variant.key, state, difficulty, FortyThieves.getFortyThievesSolution);
  useBDFirstLoad<FortyThieves.GameState, FortyThieves.GameAction>(
    variant.key, difficulty, dispatch,
    FortyThieves.setFortyThievesSolutionFromBD,
    FortyThieves.setFortyThievesSolutionFromState,
    FortyThieves.getFortyThievesSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<FortyThieves.GameState, FortyThieves.GameAction>(
    aiPlaying, state, dispatch, FortyThieves.gameReducer,
    FortyThieves.getFortyThievesSolution, FortyThieves.findHint, 'FortyThieves', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // POLITIQUE STRICTE : si la solution stockée est épuisée, on NE dispatche
    // RIEN. Pas de fallback findHint qui pourrait proposer un coup improductif
    // ou cyclique. L'utilisateur peut cliquer "Distribuer" pour redistribuer.
    // Solution stockée épuisée → tenter AUTO-DRAW puis fallback findHint
    if (state.stock && state.stock.length > 0) {
      const drawAttempt = FortyThieves.gameReducer(state, { type: 'DRAW' } as any);
      if (drawAttempt !== state) {
        console.log(`💡 [FortyThieves] Plus de coup stockée — auto-DRAW du stock`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        dispatch({ type: 'DRAW' });
        hints.consume();
        return;
      }
    }
    const fallback = FortyThieves.findHint(state);
    if (fallback) {
      console.log(`💡 [FortyThieves] Stock épuisé — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [FortyThieves] Plus de coup et stock vide — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
    setSelected(null);
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    console.log(`🏆 [FortyThieves] VICTOIRE — ${state.moves} coups, score ${state.score}`);
    setShowWin(true);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: state.score, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: state.score, durationMs: chrono.elapsedMs() });
  }, [won]);

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setSelected(null); setShowWin(false); };
  const wasteTop = state.waste[state.waste.length - 1];
  const cardsInFoundations = state.foundations.reduce((a, f) => a + f.cards.length, 0);

  const onTopColPress = (colIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selected) {
      if (selected.src === 'tableau' && selected.col === colIdx) { setSelected(null); return; }
      if (selected.src === 'tableau' && selected.col != null) {
        dispatch({ type: 'MOVE_TABLEAU', fromCol: selected.col, toCol: colIdx });
      } else if (selected.src === 'waste') {
        dispatch({ type: 'WASTE_TO_TABLEAU', toCol: colIdx });
      }
      setSelected(null);
      return;
    }
    // Try foundation auto
    const top = state.tableau[colIdx].cards[state.tableau[colIdx].cards.length - 1];
    if (top && FortyThieves.findFoundationFor(top, state.foundations) >= 0) {
      dispatch({ type: 'TO_FOUNDATION', src: 'tableau', col: colIdx });
      return;
    }
    setSelected({ src: 'tableau', col: colIdx });
  };

  const onWastePress = () => {
    if (!wasteTop) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (FortyThieves.findFoundationFor(wasteTop, state.foundations) >= 0) {
      dispatch({ type: 'TO_FOUNDATION', src: 'waste' });
      return;
    }
    setSelected({ src: 'waste' });
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.fortyThievesSubtitle')} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={104 - cardsInFoundations} palette={palette} />

        {/* Stock + Waste + Foundations (tight row) */}
        <View style={styles.topRow}>
          <Pressable onPress={() => dispatch({ type: 'DRAW' })} style={styles.slot}>
            {state.stock.length > 0 ? (
              <View>
                <FrenchCard code="BACK" width={42} height={60} />
                <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary }]}><Text style={styles.badgeText}>{state.stock.length}</Text></View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: palette.border, width: 42, height: 60 }]}><Ionicons name="lock-closed" size={14} color={palette.textSecondary} /></View>
            )}
          </Pressable>
          <Pressable onPress={onWastePress} style={[styles.slot, selected?.src === 'waste' && styles.selected]}>
            {wasteTop ? (
              <FrenchCard code={FortyThieves.imageCode(wasteTop)} width={42} height={60} />
            ) : (
              <View style={[styles.empty, { borderColor: palette.border, width: 42, height: 60 }]}><Text style={{ color: palette.textSecondary, fontSize: 8 }}>WASTE</Text></View>
            )}
          </Pressable>
          <View style={{ width: 4 }} />
          {state.foundations.map((f, i) => {
            const top = f.cards[f.cards.length - 1];
            return (
              <View key={i} style={[styles.slot, { width: 28, height: 40 }]}>
                {top ? (
                  <FrenchCard code={FortyThieves.imageCode(top)} width={28} height={40} />
                ) : (
                  <View style={[styles.empty, { borderColor: palette.border, width: 28, height: 40 }]}>
                    <Text style={{ fontSize: 14, color: palette.textSecondary }}>{f.suit ? FortyThieves.SUIT_GLYPH[f.suit] : '?'}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('solo.tableauCols', { n: 10 })}</Text>
        <View style={[styles.tableau, { gap: 2 }]}>
          {state.tableau.map((col, colIdx) => (
            <Pressable key={colIdx} onPress={() => onTopColPress(colIdx)}
              style={[{ flex: 1, alignItems: 'center' }, selected?.src === 'tableau' && selected.col === colIdx && styles.selected]}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>{colIdx + 1}</Text>
              {col.cards.length === 0 ? (
                <View style={[styles.empty, { width: 32, height: 50, borderColor: palette.border }]}>
                  <Ionicons name="add" size={12} color={palette.textSecondary} />
                </View>
              ) : (
                col.cards.map((card, cardIdx) => (
                  <View key={card.id} style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -38 }]}>
                    <FrenchCard code={FortyThieves.imageCode(card)} width={32} height={50} />
                  </View>
                ))
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => dispatch({ type: 'AUTO_COMPLETE' })} style={[styles.btn, { backgroundColor: '#10B981' }]}>
            <Ionicons name="flash" size={16} color="#fff" /><Text style={styles.btnText}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={t('solo.hintFortyThieves')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ACCORDION
// ─────────────────────────────────────────────────────────────────────────
export function AccordionScreen({ variant, difficulty }: { variant: any; difficulty: Difficulty }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const _race = useRace();
  const [state, baseDispatch, undoCtl] = useGameWithUndo(Accordion.gameReducer, undefined, () => Accordion.createInitialState(_race?.seed));
  const _replayRec = useReplayRecorder(state, baseDispatch);
  useRaceReport({ score: state.score, moves: state.moves, finished: state.phase === 'won', getActions: _replayRec.getActions });
  const dispatch = _replayRec.dispatch;
  const [showWin, setShowWin] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [showImpossible, setShowImpossible] = useState(false);
  // Hook unifié : ré-évalue la solvabilité à chaque coup (state.moves change)
  const solvable = useSolvabilityCheck(state, state.moves, Accordion.analyzeAccordionWinnability, 'Accordion');
  useActionLog(variant.key, state.moves, state.score, `piles=${state.piles.length}/52`, state);
  const smartHint = useSmartHint(Accordion.analyzeAccordionWinnability, Accordion.findHint, 'Accordion');
  const solHint = useStoredSolution(Accordion.getAccordionSolution, Accordion.gameReducer, 'Accordion');
  useAutoSubmitDeal(variant.key, state, difficulty, Accordion.getAccordionSolution);
  useBDFirstLoad<Accordion.GameState, Accordion.GameAction>(
    variant.key, difficulty, dispatch,
    Accordion.setAccordionSolutionFromBD,
    Accordion.setAccordionSolutionFromState,
    Accordion.getAccordionSolution,
    (s) => ({ type: 'LOAD_FROM_BD', state: s }),
  );
  const replayRec = _replayRec;
  const { aiPlaying, setAiPlaying, aiSpeed, cycleSpeed } = useAiState();
  const { nextAction: aiNext } = useAutoPlay<Accordion.GameState, Accordion.GameAction>(
    aiPlaying, state, dispatch, Accordion.gameReducer,
    Accordion.getAccordionSolution, Accordion.findHint, 'Accordion', aiSpeed.ms,
    () => setAiPlaying(false),
  );

  useEffect(() => {
    if ((state as any).phase !== 'playing' || showImpossible) return;
    if (Accordion.isImpossible(state as any)) {
      console.log(`🚫 [SoloGame] JEU IMPOSSIBLE — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setShowImpossible(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showImpossible]);
  const [stuckSavedRef] = [{ current: false } as { current: boolean }];
  useEffect(() => {
    if (state.phase === 'won') return;
    if (showStuck) return;
    const blocked = state.phase === 'lost' || Accordion.isStuck(state as any);
    if (blocked) {
      console.log(`🔒 [SoloGame] BLOCAGE détecté — variante=${variant.key} phase=${state.phase} difficulté=${difficulty}`);
      setShowStuck(true);
      if (!stuckSavedRef.current) {
        stuckSavedRef.current = true;
        saveGameResult({
          gameType: 'solitaire', variant: variant.key,
          score: (state as any).score ?? 0, moves: (state as any).moves ?? 0,
          durationMs: chrono.elapsedMs(), won: false, difficulty, hintsUsed: hints.used,
        });
      }
    }
  }, [state, showStuck]);
  const won = state.phase === 'won';
  useAutoClaimDailyOnWin(variant.key, won);
  const lost = state.phase === 'lost';
  const chrono = useChrono(!won);
  const hints = useHints(difficulty);

  const onHint = () => {
    if (!hints.canUseHint) return;
    // PRIORITÉ : utiliser la solution stockée (= chemin gagnant prouvé)
    const stored = solHint(state);
    if (stored) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(stored);
      hints.consume();
      return;
    }
    // Accordion n'a pas de stock → fallback findHint pour proposer un coup
    const fallback = Accordion.findHint(state);
    if (fallback) {
      console.log(`💡 [Accordion] Solution stockée épuisée — coup proposé`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      dispatch(fallback);
      hints.consume();
      return;
    }
    console.log(`💡 [Accordion] Plus de coup possible — recommence la partie`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    hints.consume();
  };

  useEffect(() => {
    if (!won) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowWin(true);
    console.log(`🏆 [Accordion] VICTOIRE — ${state.moves} coups, ${state.piles.length} pile finale`);
    saveGameResult({ gameType: 'solitaire', variant: variant.key, score: state.score + 100, moves: state.moves, durationMs: chrono.elapsedMs(), won: true, difficulty, hintsUsed: hints.used });
    replayRec.commit({ variantKey: variant.key, difficulty, moves: state.moves, score: state.score + 100, durationMs: chrono.elapsedMs() });
  }, [won]);

  const reset = () => { setAiPlaying(false); dispatch({ type: 'RESET' }); setShowWin(false); };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <FloatingUndoButton undoCtl={undoCtl} />
      <AppHeader title={t(`variant.${variant.key}.name`, { defaultValue: variant.name })} subtitle={t('solo.accordionSubtitle', { count: state.piles.length })} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        <GameHeader difficulty={difficulty} seconds={chrono.seconds} hintsRemaining={hints.remaining} canUseHint={hints.canUseHint} onHint={onHint} onReset={reset} palette={palette} aiPlaying={aiPlaying} onToggleAi={() => setAiPlaying((p) => !p)} aiPreview={aiNext ? describeAction(aiNext) : null} aiSpeed={aiSpeed} onCycleSpeed={cycleSpeed} />
        <SolvabilityBadge state={solvable} />
        <BannerStats moves={state.moves} score={state.score} remaining={state.piles.length} palette={palette} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginVertical: 16 }}>
          {state.piles.map((pile, i) => {
            const top = Accordion.topOf(pile);
            const isSel = state.selected === i;
            return (
              <Pressable key={i} onPress={() => dispatch({ type: 'TAP_PILE', index: i })}
                style={[isSel && styles.selected]}>
                <View>
                  <FrenchCard code={Accordion.imageCode(top)} width={36} height={52} />
                  {pile.cards.length > 1 && (
                    <View style={[styles.badge, { backgroundColor: APP_CONFIG.primary, top: -6, right: -6 }]}>
                      <Text style={styles.badgeText}>{pile.cards.length}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.btnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>
        <Hint palette={palette} text={lost ? t('solo.hintAccordionLost') : t('solo.hintAccordion')} />
      </ScrollView>
      <ImpossibleModal visible={showImpossible} onAgain={() => { setShowImpossible(false); reset(); }} onQuit={() => router.back()} />
      <StuckModal visible={showStuck} onAgain={() => { setShowStuck(false); reset(); }} onQuit={() => router.back()} onContinue={() => setShowStuck(false)} />
      <WinModal visible={showWin} stats={{ moves: state.moves, score: state.score + 100 }} onAgain={reset} onQuit={() => router.back()} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────
function BannerStats({ moves, score, remaining, palette }: any) {
  const { t } = useTranslation();
  return (
    <LinearGradient
      colors={[APP_CONFIG.primary + '33', palette.card]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.banner, { borderColor: palette.border }]}
    >
      <View style={styles.bannerStat}>
        <Text style={[styles.bannerLabel, { color: palette.textSecondary }]}>{t('solo.moves')}</Text>
        <Text style={[styles.bannerValue, { color: palette.text }]}>{moves}</Text>
      </View>
      <View style={styles.bannerStat}>
        <Text style={[styles.bannerLabel, { color: palette.textSecondary }]}>{t('solo.scoreLabel')}</Text>
        <Text style={[styles.bannerValue, { color: APP_CONFIG.primary }]}>{score}</Text>
      </View>
      <View style={styles.bannerStat}>
        <Text style={[styles.bannerLabel, { color: palette.textSecondary }]}>{t('solo.remaining')}</Text>
        <Text style={[styles.bannerValue, { color: palette.text }]}>{remaining}</Text>
      </View>
    </LinearGradient>
  );
}

function Hint({ palette, text }: any) {
  return (
    <View style={[styles.hint, { borderColor: palette.border }]}>
      <Ionicons name="information-circle-outline" size={14} color={palette.textSecondary} />
      <Text style={[styles.hintText, { color: palette.textSecondary }]}>{text}</Text>
    </View>
  );
}

function WinModal({ visible, stats, onAgain, onQuit }: any) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <LinearGradient colors={['#0A0A1A', APP_CONFIG.secondary]} style={[styles.modalCard, { borderColor: APP_CONFIG.primary }]}>
          <Text style={{ fontSize: 56 }}>🏆</Text>
          <Text style={styles.modalTitle}>{t('solo.winTitle')}</Text>
          <Text style={styles.modalSub}>{t('solo.winStats', { moves: stats.moves, score: stats.score })}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
            <TouchableOpacity onPress={onAgain} style={[styles.modalBtn, { backgroundColor: APP_CONFIG.primary }]}>
              <Text style={styles.modalBtnText}>🔄 {t('solo.playAgain')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onQuit} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={styles.modalBtnText}>{t('solo.quit')}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PERSIST RESULT TO BACKEND
// ─────────────────────────────────────────────────────────────────────────
async function saveGameResult(payload: {
  gameType: string;
  variant: string;
  score: number;
  moves: number;
  durationMs: number;
  won: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  hintsUsed?: number;
}) {
  console.log('🎮 [SoloGame] ===== FIN DE PARTIE =====');
  console.log(`🎮 [SoloGame] Variante : ${payload.variant} | Difficulté : ${payload.difficulty ?? 'medium'}`);
  console.log(`🎮 [SoloGame] Résultat : ${payload.won ? '🏆 VICTOIRE' : '❌ Perdue/Quittée'}`);
  console.log(`🎮 [SoloGame] Score : ${payload.score} | Coups : ${payload.moves} | Indices : ${payload.hintsUsed ?? 0}`);
  console.log(`🎮 [SoloGame] Durée : ${Math.floor(payload.durationMs / 1000)}s`);
  try {
    log.bin('persist solo game', payload);
    const res = await api.saveSoloGame(payload);
    if (res.persisted) {
      console.log(`💾 [SoloGame] ✅ Données sauvegardées en BD via ${res.via}`);
    } else {
      console.log('💾 [SoloGame] ⚠️ Échec de la persistance — partie non enregistrée');
    }
    log.bout(`persist via ${res.via}`, { persisted: res.persisted });
  } catch (e: any) {
    console.log(`💾 [SoloGame] ❌ Erreur persistance : ${e?.message ?? e}`);
    log.error('persist failed', e?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, paddingBottom: 40 },
  banner: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 12,
  },
  bannerStat: { alignItems: 'center', flex: 1 },
  bannerLabel: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  bannerValue: { fontSize: 20, fontFamily: 'Inter-Black', marginTop: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 10, flexWrap: 'wrap' },
  slot: { width: 50, height: 70 },
  empty: {
    width: 50, height: 70, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyCol: { width: 42, height: 62 },
  badge: {
    position: 'absolute', bottom: -4, right: -4,
    borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black' },
  selected: {
    transform: [{ scale: 1.08 }],
    shadowColor: APP_CONFIG.primary, shadowOpacity: 0.9, shadowRadius: 8, elevation: 8,
  },

  sectionTitle: { fontSize: 13, fontFamily: 'Inter-Bold', marginBottom: 8, marginTop: 8 },
  tableau: { flexDirection: 'row', gap: 4, alignItems: 'flex-start', minHeight: 320 },
  col: { flex: 1, alignItems: 'center' },
  colSpider: { flex: 1, alignItems: 'center', minWidth: 30 },
  colLabel: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1, marginBottom: 4, opacity: 0.5 },
  tableauCardWrap: { zIndex: 1 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  hintText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 15 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { padding: 28, borderRadius: 20, alignItems: 'center', borderWidth: 2, minWidth: 280 },
  modalTitle: { color: '#fff', fontSize: 22, fontFamily: 'Inter-Black', marginTop: 8 },
  modalSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 6 },
  modalBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },

  // GameHeader (difficulty + chrono + hint button)
  gameHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  diffBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },
  chrono: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chronoText: { fontSize: 14, fontFamily: 'Inter-Black' },
  hintBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 56, justifyContent: 'center',
  },
  hintBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black' },
  aiPreviewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    marginLeft: 6,
  },
  aiPreviewText: {
    color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 0.5,
  },
});
