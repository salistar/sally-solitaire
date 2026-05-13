/**
 * @file PairsScreen.tsx
 * @description UI for pair-removal solitaires powered by _genericPairs.ts.
 * Renders the layout (pyramid / columns / grid / tripeaks), the stock+waste
 * if enabled, and lets the user:
 *   - Tap an accessible card → select it (highlighted)
 *   - Tap a second accessible card → engine validates the pair; if valid,
 *     both cards are removed. If invalid, selection clears.
 *   - Tap a card that can self-remove (e.g. King when target=13) → removed
 *     immediately without needing a partner.
 *
 * Powers ~21 variants : Pyramid (8), Pairs (10), Mahjong (3).
 */
import React, { useReducer, useState, useEffect } from 'react';
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
import { useGenericActionLog, dumpPairs } from '../game/useGenericActionLog';
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
  listAccessibleLocations,
  arePair,
  canRemoveSingle,
  getCardAt,
  type PairsConfig,
  type CardLocation,
} from '../game/engines/_genericPairs';

// Static map of variantKey → CONFIG. Built on first render; each wrapper file
// in src/game/engines/ exports its own CONFIG for the variant.
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
import * as pairs from '../game/engines/pairs';
import * as decade from '../game/engines/decade';
import * as vertical from '../game/engines/vertical';
import * as quinze from '../game/engines/quinze';
import * as idiots_delight from '../game/engines/idiots_delight';
import * as aces_and_kings from '../game/engines/aces_and_kings';
import * as mahjong_cards from '../game/engines/mahjong_cards';
import * as pegged from '../game/engines/pegged';
import * as crystal_cluster from '../game/engines/crystal_cluster';

// We accept loose typing here because each module exposes its own engine-flavor
// of CONFIG; the wrappers we point to in this screen all export PairsConfig.
const PAIRS_CONFIGS: Record<string, PairsConfig> = {
  pyramid_classic: pyramid_classic.PAIRS_CONFIG,
  pyramid_relaxed: pyramid_relaxed.PAIRS_CONFIG,
  giza: giza.PAIRS_CONFIG,
  two_pyramids: two_pyramids.PAIRS_CONFIG,
  pharaoh: pharaoh.PAIRS_CONFIG,
  tuts_tomb: tuts_tomb.PAIRS_CONFIG,
  apophis: apophis.PAIRS_CONFIG,
  cheops: cheops.PAIRS_CONFIG,
  triangle: triangle.PAIRS_CONFIG,
  relaxed_pyramid: relaxed_pyramid.PAIRS_CONFIG,
  monte_carlo: monte_carlo.PAIRS_CONFIG,
  aces_up: aces_up.PAIRS_CONFIG,
  nestor: nestor.PAIRS_CONFIG,
  tens: tens.PAIRS_CONFIG,
  pairs: pairs.PAIRS_CONFIG,
  decade: decade.PAIRS_CONFIG,
  vertical: vertical.PAIRS_CONFIG,
  quinze: quinze.PAIRS_CONFIG,
  idiots_delight: idiots_delight.PAIRS_CONFIG,
  aces_and_kings: aces_and_kings.PAIRS_CONFIG,
  mahjong_cards: mahjong_cards.PAIRS_CONFIG,
  pegged: pegged.PAIRS_CONFIG,
  crystal_cluster: crystal_cluster.PAIRS_CONFIG,
};

function cardCode(c: { rank: number; suit: string }): string {
  const v = c.rank === 1 ? 'A' : c.rank === 10 ? '0' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${v}${c.suit}`;
}

interface Props {
  variant: Variant;
  difficulty?: string;
}

export default function PairsScreen({ variant, difficulty }: Props) {
  const config = PAIRS_CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration Pairs introuvable pour : {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[PairsScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
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
        subLabel={describePairRule(config)}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — cherche une paire jouable"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: PairsConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.removed.length,
    moves: state.moveCount,
    finished: !!state.won,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: state.removed.length,
    moves: state.moveCount,
  });
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: state.removed.length,
    extra: `retirées=${state.removed.length}`,
    dump: () => dumpPairs(state),
  });
  const accessible = listAccessibleLocations(state);
  const isLocAccessible = (loc: CardLocation) =>
    accessible.some((l) => locEq(l, loc));

  // Hint: scan accessible cards for the first removable PAIR (or single
  // King in sum=13 variants) and dispatch the matching SELECTs. The engine
  // auto-removes when two selected cards form a valid pair.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  React.useEffect(() => {
    if (hintTick === 0) return;
    const cur = stateRef.current;
    if (cur.won) return;
    const locs = listAccessibleLocations(cur);
    // First try a single-removable card (e.g. King in Pyramid sum=13)
    for (const loc of locs) {
      const card = getCardAt(loc, cur);
      if (card && canRemoveSingle(card, cur.config)) {
        // eslint-disable-next-line no-console
        console.log(`[PairsScreen.Inner] hintTick=${hintTick} → single-remove ${card.id}`);
        dispatch({ type: 'SELECT', loc });
        return;
      }
    }
    // Then look for a pair
    for (let i = 0; i < locs.length; i++) {
      const a = getCardAt(locs[i], cur);
      if (!a) continue;
      for (let j = i + 1; j < locs.length; j++) {
        const b = getCardAt(locs[j], cur);
        if (!b) continue;
        if (arePair(a, b, cur.config)) {
          // eslint-disable-next-line no-console
          console.log(`[PairsScreen.Inner] hintTick=${hintTick} → pair ${a.id} + ${b.id}`);
          dispatch({ type: 'SELECT', loc: locs[i] });
          // Need to dispatch the second after React updates; we use a 0ms
          // setTimeout so React commits the first SELECT before the second.
          const second = locs[j];
          setTimeout(() => dispatch({ type: 'SELECT', loc: second }), 250);
          return;
        }
      }
    }
    // No pair found → tap stock if available
    if (cur.config.stockEnabled && cur.stock.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[PairsScreen.Inner] hintTick=${hintTick} → DRAW_STOCK`);
      dispatch({ type: 'DRAW_STOCK' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[PairsScreen.Inner] hintTick=${hintTick} → no move found`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  // Count cards still on the board for the RESTE stat (across all layout shapes).
  const cardsLeft = state.layout.reduce(
    (sum, row) => sum + row.filter((c) => c != null).length,
    0,
  );

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'RETIRÉES', value: state.removed.length },
            { label: 'RESTE', value: cardsLeft },
          ]}
        />

        {/* Layout */}
        {config.layoutKind === 'pyramid' && (
          <View style={S.pyramidWrap}>
            {state.layout.map((row, r) => (
              <View key={r} style={[S.row, { paddingHorizontal: (state.layout.length - row.length) * 18 }]}>
                {row.map((card, c) => (
                  <PairsCard
                    key={`${r}-${c}`}
                    card={card}
                    accessible={card != null && isLocAccessible({ kind: 'layout', row: r, col: c })}
                    selected={state.selected?.kind === 'layout' && state.selected.row === r && state.selected.col === c}
                    onPress={() => dispatch({ type: 'SELECT', loc: { kind: 'layout', row: r, col: c } })}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {config.layoutKind === 'columns' && (
          <View style={S.columnsWrap}>
            {state.layout.map((col, c) => (
              <View key={c} style={S.column}>
                {col.map((card, r) => {
                  // Only the tail of each column is accessible
                  const tailIdx = lastNonNull(col);
                  const isTail = r === tailIdx;
                  return (
                    <View key={r} style={{ marginTop: r === 0 ? 0 : -36 }}>
                      <PairsCard
                        card={card}
                        accessible={isTail && card != null}
                        selected={state.selected?.kind === 'layout' && state.selected.row === c && state.selected.col === r}
                        onPress={() => isTail && dispatch({ type: 'SELECT', loc: { kind: 'layout', row: c, col: r } })}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {config.layoutKind === 'grid' && (
          <View style={S.gridWrap}>
            {state.layout.map((row, r) => (
              <View key={r} style={S.row}>
                {row.map((card, c) => (
                  <PairsCard
                    key={`${r}-${c}`}
                    card={card}
                    accessible={card != null}
                    selected={state.selected?.kind === 'layout' && state.selected.row === r && state.selected.col === c}
                    onPress={() => dispatch({ type: 'SELECT', loc: { kind: 'layout', row: r, col: c } })}
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Stock + waste — dos de carte française (FrenchCard BACK) */}
        {config.stockEnabled && (
          <View style={S.stockRow}>
            <StockPile
              count={state.stock.length}
              canRecycle={
                state.config.stockRecycle !== 'none' &&
                state.waste.length > 0 &&
                !(typeof state.config.stockRecycle === 'number' && state.stockRecyclesUsed >= state.config.stockRecycle)
              }
              onPress={() => state.stock.length > 0 ? dispatch({ type: 'DRAW_STOCK' }) : dispatch({ type: 'RECYCLE_WASTE' })}
            />
            <PairsCard
              card={state.waste[state.waste.length - 1] ?? null}
              accessible={state.waste.length > 0}
              selected={state.selected?.kind === 'waste'}
              onPress={() => state.waste.length > 0 && dispatch({ type: 'SELECT', loc: { kind: 'waste' } })}
            />
            <Text style={S.smallLabel}>Défausse {state.waste.length}</Text>
          </View>
        )}

        <Text style={S.counter}>
          Retirées : {state.removed.length} • Mouvements : {state.moveCount}
        </Text>

        {state.won && (
          <View style={S.winOverlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>Layout entièrement vidé en {state.moveCount} coups</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function describePairRule(c: PairsConfig): string {
  switch (c.pairRule) {
    case 'sum':
      return `Retire des paires dont la somme = ${c.pairTarget ?? 13}${c.singleRemovalRank ? ` (rang ${c.singleRemovalRank} se retire seul)` : ''}`;
    case 'rank-match':
      return 'Retire des paires de cartes de MÊME rang.';
    case 'suit-match':
      return 'Retire des paires de cartes de MÊME couleur.';
    case 'rank-or-suit':
      return 'Retire des paires partageant MÊME rang OU MÊME couleur.';
    case 'sequence-1':
      return 'Retire des paires en séquence ±1.';
    case 'aces-up':
      return 'Retire la plus PETITE de deux cartes de même couleur dans la même rangée.';
  }
}

function PairsCard({ card, accessible, selected, onPress }: {
  card: { suit: string; rank: number; id: string } | null;
  accessible: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  if (!card) {
    return <View style={S.cardSlotEmpty} />;
  }
  return (
    <TouchableOpacity
      style={[S.cardWrap, !accessible && S.cardWrapDim, selected && S.cardWrapSel]}
      onPress={onPress}
      activeOpacity={accessible ? 0.7 : 1}
      disabled={!accessible}
    >
      <FrenchCard code={cardCode(card)} width={44} height={60} />
    </TouchableOpacity>
  );
}

function locEq(a: CardLocation, b: CardLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'layout' && b.kind === 'layout') return a.row === b.row && a.col === b.col;
  return true;
}

function lastNonNull<T>(arr: (T | null)[]): number {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return i;
  return -1;
}

const S = StyleSheet.create({
  root: { flex: 1 },
  innerRoot: { flex: 1 },
  scrollContent: { padding: 14, paddingTop: 12, paddingBottom: 80, alignItems: 'center' },
  title: { color: '#FCD34D', fontSize: 20, fontFamily: 'Inter-Black', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 12, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },

  pyramidWrap: { alignItems: 'center', marginBottom: 16 },
  columnsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 16 },
  column: { width: 50 },
  gridWrap: { alignItems: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 4, marginBottom: 4 },

  cardWrap: { borderRadius: 8 },
  cardWrapDim: { opacity: 0.4 },
  cardWrapSel: { borderWidth: 2, borderColor: '#FCD34D', borderRadius: 10 },
  cardSlotEmpty: { width: 44, height: 60, opacity: 0 },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stockBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#7C3AED' },
  stockLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },
  smallLabel: { color: '#9CA3AF', fontSize: 11 },

  counter: { color: '#9CA3AF', fontSize: 12, marginTop: 8 },
  winOverlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(124,58,237,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 12, marginTop: 4 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
});
