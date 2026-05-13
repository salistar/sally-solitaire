/**
 * @file GenericDistributionScreen.tsx
 * @description Minimalist Screen for clock-style solitaires (Clock Solitaire,
 * Big Ben, Grandfather's Clock). Renders 12 hour piles in a circle (approx.)
 * with the center pile in the middle. One tap = reveal next card.
 *
 * Designed to be functional; the visual feels closer to a tutorial than to a
 * full-game UI. Production polish (real clock face, animations) is a TODO.
 */
import React, { useReducer, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from './AppHeader';
import FrenchCard from './FrenchCard';
import HintFlashBanner from './HintFlashBanner';
import GenericGameHeader from './GenericGameHeader';
import GenericStatsBanner from './GenericStatsBanner';
import { useTheme } from '../contexts/AppProviders';
import { useHints, type Difficulty } from '../game/hintsHook';
import { useGenericActionLog, dumpGenericDistribution } from '../game/useGenericActionLog';
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
  type DistributionConfig,
  type DistributionGameState,
} from '../game/engines/_genericDistribution';

import * as clock_solitaire from '../game/engines/clock_solitaire';
import * as big_ben from '../game/engines/big_ben';
import * as grandfathers_clock from '../game/engines/grandfathers_clock';
import * as hickory_dickory_dock from '../game/engines/hickory_dickory_dock';
import * as travellers from '../game/engines/travellers';

const CONFIGS: Record<string, DistributionConfig> = {
  clock_solitaire: clock_solitaire.CONFIG,
  big_ben: big_ben.CONFIG,
  grandfathers_clock: grandfathers_clock.CONFIG,
  hickory_dickory_dock: hickory_dickory_dock.CONFIG,
  travellers: travellers.CONFIG,
};

function cardCode(c: { rank: number; suit: string }): string {
  const v = c.rank === 1 ? 'A' : c.rank === 10 ? '0' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${v}${c.suit}`;
}

interface Props {
  variant: Variant;
  difficulty?: string;
}

export default function GenericDistributionScreen({ variant, difficulty }: Props) {
  const config = CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration introuvable pour: {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[GenericDistributionScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
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
        subLabel={`${config.clockPiles} piles${config.hasCenterPile ? ' + centre' : ''}`}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — révèle & place"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: DistributionConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.exposedCount,
    moves: state.moveCount,
    finished: !!state.won || state.lost,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: state.exposedCount,
    moves: state.moveCount,
  });
  // Klondike-style action log per move.
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: state.exposedCount,
    extra: `révélées=${state.exposedCount}`,
    dump: () => dumpGenericDistribution(state),
  });
  // Hint: just dispatch the canonical clock-style action (reveal & place).
  // The Distribution engine has a single legal move type — REVEAL_AND_PLACE
  // — that exposes the next stock card and snaps it into its hour pile.
  React.useEffect(() => {
    if (hintTick === 0) return;
    if (state.won || state.lost) return;
    // eslint-disable-next-line no-console
    console.log(`[GenericDistributionScreen.Inner] hintTick=${hintTick} → REVEAL_AND_PLACE`);
    dispatch({ type: 'REVEAL_AND_PLACE' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  // Sum of cards still face-down across all piles — used in the "RESTE" stat.
  const totalFaceDown = state.piles.reduce(
    (acc, p) => acc + p.filter((c) => c.faceUp === false).length,
    0,
  );

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'RÉVÉLÉES', value: state.exposedCount },
            { label: 'RESTE', value: totalFaceDown },
          ]}
        />
        {/* Current card display — large FrenchCard graphic so the player
            sees the actual playing card, not a text fallback. */}
        <View style={S.currentWrap}>
          <Text style={S.smallLabel}>Carte courante</Text>
          {state.currentCard ? (
            <FrenchCard code={cardCode(state.currentCard)} width={90} height={126} />
          ) : (
            <View style={S.emptyBigCard}><Text style={S.placeholder}>·</Text></View>
          )}
        </View>

        {/* Clock piles */}
        <View style={S.clockWrap}>
          {state.piles.slice(0, config.clockPiles).map((pile, i) => (
            <View key={i} style={S.pile}>
              <Text style={S.pileLabel}>{labelForPile(i, config.clockPiles)}</Text>
              <View style={S.miniCard}>
                <Text style={S.miniCount}>{pile.filter((c) => !c.faceUp).length}/{pile.length}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Center pile */}
        {config.hasCenterPile && (
          <View style={S.centerWrap}>
            <Text style={S.smallLabel}>Centre</Text>
            <View style={S.emptyBigCard}>
              <Text style={S.placeholder}>{state.piles[config.clockPiles]?.filter((c) => !c.faceUp).length ?? 0}/{state.piles[config.clockPiles]?.length ?? 0}</Text>
            </View>
          </View>
        )}

        {/* Action button */}
        <TouchableOpacity
          style={[S.actionBtn, (state.won || state.lost) && S.actionBtnDisabled]}
          onPress={() => dispatch({ type: 'REVEAL_AND_PLACE' })}
          disabled={state.won || state.lost}
          activeOpacity={0.85}
        >
          <Text style={S.actionLabel}>Révéler & Placer</Text>
        </TouchableOpacity>

        <Text style={S.counter}>Cartes révélées : {state.exposedCount} • Mouvements : {state.moveCount}</Text>

        {state.won && (
          <View style={S.overlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
          </View>
        )}
        {state.lost && (
          <View style={S.overlay}>
            <Text style={S.loseText}>Partie bloquée — l'horloge n'a pas tourné jusqu'au bout.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function labelForPile(i: number, total: number): string {
  if (total !== 12) return String(i + 1);
  // Map 0-11 to 1, 2, ..., J, Q
  const r = i + 1;
  return r === 11 ? 'J' : r === 12 ? 'Q' : String(r);
}

const S = StyleSheet.create({
  root: { flex: 1 },
  innerRoot: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12, paddingBottom: 80, alignItems: 'center' },
  title: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 13, marginBottom: 24, textAlign: 'center' },
  smallLabel: { color: '#9CA3AF', fontSize: 11, marginBottom: 6, letterSpacing: 1.5 },
  currentWrap: { alignItems: 'center', marginBottom: 24, gap: 8 },
  emptyBigCard: { width: 90, height: 126, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  placeholder: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '700' },
  clockWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 },
  pile: { width: 60, alignItems: 'center' },
  pileLabel: { color: '#FCD34D', fontSize: 16, fontWeight: '900', marginBottom: 4 },
  miniCard: { width: 52, height: 64, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  miniCount: { color: '#E9D5FF', fontSize: 12 },
  centerWrap: { alignItems: 'center', marginBottom: 16 },
  actionBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: '#7C3AED', marginVertical: 16 },
  actionBtnDisabled: { opacity: 0.4 },
  actionLabel: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 1 },
  counter: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  overlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(124,58,237,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  loseText: { color: '#F87171', fontSize: 14, textAlign: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 16 },
});
