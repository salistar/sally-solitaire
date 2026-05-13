/**
 * @file SpiderV2Screen.tsx
 * @description UI for the new generic Spider engine (_genericSpider.ts) with
 * authentic K→A auto-removal. Renders the tableau columns, the stock counter,
 * and the completed-runs strip on top.
 *
 * Powers 4 variants currently approximated as generic_tableau :
 *   spiderwort, will_o_wisp, beetle, mrs_mop.
 *
 * Tap a card → selects it (and the block below it). Tap a destination column
 * → engine validates the move. Tap selected card again → deselects.
 */
import React, { useReducer, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from './AppHeader';
import FrenchCard from './FrenchCard';
import HintFlashBanner from './HintFlashBanner';
import GenericGameHeader from './GenericGameHeader';
import GenericStatsBanner from './GenericStatsBanner';
import StockPile from './StockPile';
import { useTheme } from '../contexts/AppProviders';
import { useHints, type Difficulty } from '../game/hintsHook';
import { useGenericActionLog, dumpSpiderV2 } from '../game/useGenericActionLog';
import { useRaceReport } from '../contexts/useRaceReport';
import { useRace } from '../contexts/RaceContext';
import { useGameWithUndo } from '../contexts/useGameWithUndo';
import { useUndos } from '../contexts/useUndos';
import { useAutoClaimDailyOnWin } from '../contexts/useAutoClaimDailyOnWin';
import { useSaveSoloOnWin } from '../contexts/useSaveSoloOnWin';
import FloatingUndoButton from './FloatingUndoButton';
import type { Variant } from '../game/variants';
import {
  createInitialStateFor,
  gameReducer,
  isMovableBlock,
  canStackOn,
  type SpiderConfig,
} from '../game/engines/_genericSpider';

import * as spiderwort from '../game/engines/spiderwort';
import * as will_o_wisp from '../game/engines/will_o_wisp';
import * as beetle from '../game/engines/beetle';
import * as mrs_mop from '../game/engines/mrs_mop';

const SPIDER_CONFIGS: Record<string, SpiderConfig> = {
  spiderwort: spiderwort.SPIDER_CONFIG,
  will_o_wisp: will_o_wisp.SPIDER_CONFIG,
  beetle: beetle.SPIDER_CONFIG,
  mrs_mop: mrs_mop.SPIDER_CONFIG,
};

const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
function cardCode(c: { rank: number; suit: string }): string {
  const v = c.rank === 1 ? 'A' : c.rank === 10 ? '0' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${v}${c.suit}`;
}
const isRed = (s: string) => s === 'H' || s === 'D';

interface Props {
  variant: Variant;
  difficulty?: string;
}

export default function SpiderV2Screen({ variant, difficulty }: Props) {
  const config = SPIDER_CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration Spider introuvable pour : {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[SpiderV2Screen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
    if (!hints.canUseHint) return;
    hints.consume();
    setHintTick((n) => n + 1);
  };
  const expectedRunsForHeader = config.decks === 2 ? 8 : 4;
  return (
    <View style={S.root}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader title={variant.name} subtitle={variant.shortDesc} showBack />
      <GenericGameHeader
        difficulty={d}
        hints={hints}
        onHint={onHint}
        onReset={onRestart}
        subLabel={`Spider • ${expectedRunsForHeader} suites`}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — bloc déplaçable détecté"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: SpiderConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.completedRuns.length * 13,
    moves: state.moveCount,
    finished: !!state.won,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: state.completedRuns.length * 13,
    moves: state.moveCount,
  });
  const expectedRuns = config.decks === 2 ? 8 : 4;
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: state.completedRuns.length * 13,
    extra: `suites=${state.completedRuns.length}/${expectedRuns}`,
    dump: () => dumpSpiderV2(state),
  });
  const [sel, setSel] = useState<{ col: number; idx: number } | null>(null);

  // Hint: enumerate all legal MOVE candidates, score them by productivity
  // (reveals face-down > empties column > extends a run), pick the first
  // one whose signature hasn't repeated in the last 8 hints (anti-cycle).
  // If everything cycles AND stock is available → DEAL_STOCK as fallback.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const hintHistoryRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    if (hintTick === 0) return;
    const cur = stateRef.current;
    if (cur.won) return;

    type Cand = { from: number; cardIdx: number; to: number; sig: string; score: number };
    const candidates: Cand[] = [];
    for (let from = 0; from < cur.tableau.length; from++) {
      const pile = cur.tableau[from];
      for (let idx = 0; idx < pile.length; idx++) {
        if (!isMovableBlock(cur, from, idx)) continue;
        const card = pile[idx];
        // PRE-FILTER: skip pure-shuffle candidates BEFORE expanding by
        // destination. A move is "productive" iff it reveals a face-down
        // OR empties the source column. Without this gate, ♠10 could be
        // suggested for C6→C1 even though nothing useful happens.
        const willEmpty = idx === 0;
        const willReveal = idx > 0 && pile[idx - 1].faceUp === false;
        if (!willEmpty && !willReveal) continue;
        for (let to = 0; to < cur.tableau.length; to++) {
          if (to === from) continue;
          if (!canStackOn(cur, card, to)) continue;
          const targetEmpty = cur.tableau[to].length === 0;
          let score = 0;
          if (willReveal) score += 100;
          if (willEmpty) score += 60;
          if (targetEmpty) score += 20;
          candidates.push({
            from,
            cardIdx: idx,
            to,
            sig: `MOVE:${card.id}->${to}`,
            score,
          });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    // Pick first non-cyclic candidate. Anti-cycle layered like
    // GenericTableauScreen: no-immediate-reverse + per-card frequency cap
    // + signature de-dupe (≥ 2 occurrences blocked).
    const lastSig = hintHistoryRef.current[hintHistoryRef.current.length - 1];
    const cardCount: Record<string, number> = {};
    for (const s of hintHistoryRef.current) {
      const m = s.match(/^MOVE:([^-]+)->/);
      if (m) cardCount[m[1]] = (cardCount[m[1]] ?? 0) + 1;
    }
    for (const c of candidates) {
      // Guard #1: no-immediate-reverse on the same card id
      if (lastSig) {
        const lastCard = lastSig.match(/^MOVE:([^-]+)->/)?.[1];
        const thisCard = c.sig.match(/^MOVE:([^-]+)->/)?.[1];
        if (lastCard && lastCard === thisCard) continue;
      }
      // Guard #2: per-card frequency cap
      const thisCard = c.sig.match(/^MOVE:([^-]+)->/)?.[1];
      if (thisCard && (cardCount[thisCard] ?? 0) >= 3) continue;
      // Guard #3: signature de-dupe
      const occ = hintHistoryRef.current.filter((s) => s === c.sig).length;
      if (occ >= 2) continue;
      // eslint-disable-next-line no-console
      console.log(`[SpiderV2Screen.Inner] hintTick=${hintTick} → MOVE col${c.from}@${c.cardIdx} → col${c.to} (score=${c.score}) sig=${c.sig}`);
      hintHistoryRef.current.push(c.sig);
      if (hintHistoryRef.current.length > 8) hintHistoryRef.current.shift();
      dispatch({ type: 'MOVE', from: c.from, cardIdx: c.cardIdx, to: c.to });
      setSel(null);
      return;
    }

    // No productive move → try stock
    const blocked = cur.tableau.some((c) => c.length === 0) && !cur.config.allowDrawWithEmptyColumn;
    if (cur.config.stockEnabled && cur.stock.length > 0 && !blocked) {
      // eslint-disable-next-line no-console
      console.log(`[SpiderV2Screen.Inner] hintTick=${hintTick} → DEAL_STOCK (aucun coup productif)`);
      dispatch({ type: 'DEAL_STOCK' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[SpiderV2Screen.Inner] hintTick=${hintTick} → aucun coup non-cyclique (position figée)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  const onCardPress = (col: number, idx: number) => {
    if (sel) {
      if (sel.col === col && sel.idx === idx) {
        setSel(null);
        return;
      }
      // Tap on another column / position → try move
      dispatch({ type: 'MOVE', from: sel.col, cardIdx: sel.idx, to: col });
      setSel(null);
    } else {
      // Need to be a movable block start
      if (!isMovableBlock(state, col, idx)) return;
      setSel({ col, idx });
    }
  };

  const onColumnPress = (col: number) => {
    if (!sel) return;
    dispatch({ type: 'MOVE', from: sel.col, cardIdx: sel.idx, to: col });
    setSel(null);
  };

  const expected = config.decks === 2 ? 8 : 4;

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'SUITES', value: `${state.completedRuns.length}/${expected}` },
            { label: 'STOCK', value: state.stock.length },
          ]}
        />
        <Text style={S.subtitle}>
          Empilement {config.stackingRule === 'same-suit' ? 'même couleur' : 'alternées'}
        </Text>

        {/* Completed runs strip */}
        <View style={S.row}>
          {Array.from({ length: expected }).map((_, i) => {
            const run = state.completedRuns[i];
            return (
              <View key={i} style={[S.completedSlot, !!run && S.completedSlotFilled]}>
                {run ? (
                  <Text style={[S.completedText, { color: isRed(run[0].suit) ? '#DC2626' : '#0F172A' }]}>
                    K-A {SUIT_GLYPH[run[0].suit]}
                  </Text>
                ) : (
                  <Text style={S.completedPlaceholder}>·</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Tableau */}
        <ScrollView horizontal contentContainerStyle={S.tableauWrap}>
          {state.tableau.map((col, c) => (
            <TouchableOpacity
              key={c}
              activeOpacity={1}
              style={S.column}
              onPress={() => onColumnPress(c)}
            >
              {col.length === 0 ? (
                <View style={S.emptySlot}>
                  <Text style={S.emptyText}>·</Text>
                </View>
              ) : (
                col.map((card, idx) => {
                  const isSel = sel?.col === c && sel.idx === idx;
                  const isInBlock = sel?.col === c && idx > sel.idx;
                  return (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        S.cardWrap,
                        idx > 0 && { marginTop: -36 },
                        (isSel || isInBlock) && S.cardWrapSel,
                      ]}
                      onPress={(e) => { e.stopPropagation?.(); onCardPress(c, idx); }}
                      activeOpacity={0.7}
                    >
                      <FrenchCard code={card.faceUp ? cardCode(card) : 'BACK'} width={44} height={60} />
                    </TouchableOpacity>
                  );
                })
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Stock control — dos de carte française + compteur. Spider
            distribue le stock par paquets (10 cartes par tap), pas carte
            par carte comme Klondike. */}
        {config.stockEnabled && state.stock.length > 0 && (
          <View style={S.stockRow}>
            <StockPile
              count={state.stock.length}
              canRecycle={false}
              onPress={() => {
                const blocked = state.tableau.some((c) => c.length === 0) && !config.allowDrawWithEmptyColumn;
                if (blocked) return;
                dispatch({ type: 'DEAL_STOCK' });
              }}
              width={50}
              height={70}
            />
            <Text style={S.stockLabel}>Distribuer 10 cartes</Text>
          </View>
        )}

        <Text style={S.counter}>
          Suites complétées : {state.completedRuns.length}/{expected} • Mouvements : {state.moveCount}
        </Text>

        {state.won && (
          <View style={S.winOverlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>{expected} suites K→A formées en {state.moveCount} coups</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  innerRoot: { flex: 1 },
  scrollContent: { padding: 14, paddingTop: 12, paddingBottom: 80, alignItems: 'center' },
  title: { color: '#FCD34D', fontSize: 20, fontFamily: 'Inter-Black', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 11, textAlign: 'center', marginBottom: 14, paddingHorizontal: 20 },

  row: { flexDirection: 'row', gap: 4, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' },

  completedSlot: { width: 44, height: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  completedSlotFilled: { backgroundColor: '#fff', borderColor: '#10B981', borderWidth: 2 },
  completedText: { fontSize: 11, fontWeight: '900' },
  completedPlaceholder: { color: '#475569', fontSize: 14 },

  tableauWrap: { flexDirection: 'row', gap: 6, paddingHorizontal: 4, marginBottom: 12 },
  column: { width: 48, minHeight: 60 },

  cardWrap: { borderRadius: 8 },
  cardWrapSel: { borderWidth: 2, borderColor: '#FCD34D', borderRadius: 10 },
  emptySlot: { width: 44, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  cornerRank: { position: 'absolute', top: 3, left: 3, fontSize: 10, fontWeight: '900' },
  cardSuit: { fontSize: 22, fontWeight: '900' },

  stockRow: { marginVertical: 10 },
  stockBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7C3AED' },
  stockBtnDisabled: { opacity: 0.4 },
  stockLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  counter: { color: '#9CA3AF', fontSize: 12, marginTop: 8 },
  winOverlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 12, marginTop: 4 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
