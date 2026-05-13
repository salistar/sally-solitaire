/**
 * @file GolfScreen.tsx
 * @description UI for ±1-chain solitaires powered by _genericGolf.ts. Renders
 * the layout (peaks / columns / grid / rows / radial), the stock + waste, and
 * lets the user tap an accessible card to play it on the waste if its rank
 * is ±1 from the current top.
 *
 * Powers 5 variants currently using generic_tableau as approximation:
 *   golf, triple_peaks, pumpkin, diamond_mine, robert.
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
import { useGenericActionLog, dumpGolf } from '../game/useGenericActionLog';
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
  listPlayableCells,
  type GolfConfig,
} from '../game/engines/_genericGolf';

import * as golf from '../game/engines/golf';
import * as triple_peaks from '../game/engines/triple_peaks';
import * as pumpkin from '../game/engines/pumpkin';
import * as diamond_mine from '../game/engines/diamond_mine';
import * as robert from '../game/engines/robert';

const GOLF_CONFIGS: Record<string, GolfConfig> = {
  golf: golf.GOLF_CONFIG,
  triple_peaks: triple_peaks.GOLF_CONFIG,
  pumpkin: pumpkin.GOLF_CONFIG,
  diamond_mine: diamond_mine.GOLF_CONFIG,
  robert: robert.GOLF_CONFIG,
};

function cardCode(c: { rank: number; suit: string }): string {
  const v = c.rank === 1 ? 'A' : c.rank === 10 ? '0' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${v}${c.suit}`;
}

interface Props {
  variant: Variant;
  difficulty?: string;
}

export default function GolfScreen({ variant, difficulty }: Props) {
  const config = GOLF_CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration Golf introuvable pour : {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[GolfScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
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
        subLabel={`±1${config.circular ? ' circulaire' : ''}${config.comboEnabled ? ' • combos' : ''}`}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — joue une carte ±1 de la défausse"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: GolfConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.score,
    moves: state.moveCount,
    finished: !!state.won || state.lost,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: state.score,
    moves: state.moveCount,
  });
  const totalRemaining = state.layout.reduce((sum, r) => sum + r.filter((c) => c).length, 0);
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: state.score,
    extra: `reste=${totalRemaining}${state.combo > 0 ? ` combo×${Math.pow(2, state.combo)}` : ''}`,
    dump: () => dumpGolf(state),
  });
  const playable = listPlayableCells(state);
  const isPlayable = (r: number, c: number) => playable.some(([pr, pc]) => pr === r && pc === c);

  // Hint: play the first ±1 chainable card; if nothing chainable, draw stock.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  React.useEffect(() => {
    if (hintTick === 0) return;
    const cur = stateRef.current;
    if (cur.won || cur.lost) return;
    const cells = listPlayableCells(cur);
    if (cells.length > 0) {
      const [r, c] = cells[0];
      // eslint-disable-next-line no-console
      console.log(`[GolfScreen.Inner] hintTick=${hintTick} → PLAY_CARD ${r},${c}`);
      dispatch({ type: 'PLAY_CARD', row: r, col: c });
      return;
    }
    if (cur.stock.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[GolfScreen.Inner] hintTick=${hintTick} → DRAW_STOCK`);
      dispatch({ type: 'DRAW_STOCK' });
      return;
    }
    if (cur.config.stockRecycle !== 'none' && cur.waste.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[GolfScreen.Inner] hintTick=${hintTick} → RECYCLE_WASTE`);
      dispatch({ type: 'RECYCLE_WASTE' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[GolfScreen.Inner] hintTick=${hintTick} → no move found`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'SCORE', value: state.score },
            { label: 'RESTE', value: state.layout.reduce((sum, r) => sum + r.filter((c) => c).length, 0) },
          ]}
        />
        {config.comboEnabled && state.combo > 0 ? (
          <Text style={[S.subtitle, { color: '#FCD34D' }]}>Combo ×{Math.pow(2, state.combo)}</Text>
        ) : null}

        {/* Layout — generic row-by-row render */}
        <View style={S.layoutWrap}>
          {state.layout.map((row, r) => (
            <View key={r} style={[
              S.row,
              config.layoutKind === 'peaks' && { paddingHorizontal: (state.layout[state.layout.length - 1].length - row.length) * 12 },
            ]}>
              {row.map((card, c) => {
                if (!card) return <View key={c} style={S.cardSlotEmpty} />;
                const playable = card.faceUp && isPlayable(r, c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      S.cardWrap,
                      card.faceUp && !playable && S.cardWrapDim,
                      playable && S.cardWrapHi,
                    ]}
                    onPress={() => playable && dispatch({ type: 'PLAY_CARD', row: r, col: c })}
                    disabled={!playable}
                    activeOpacity={playable ? 0.7 : 1}
                  >
                    <FrenchCard code={card.faceUp ? cardCode(card) : 'BACK'} width={44} height={60} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Stock + défausse — dos de carte française + compteur */}
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
              width={50}
              height={70}
            />
            {state.topCard ? (
              <FrenchCard code={cardCode(state.topCard)} width={50} height={70} />
            ) : (
              <View style={S.cardSlotEmpty} />
            )}
            <Text style={S.smallLabel}>Défausse</Text>
          </View>
        )}

        {state.won && (
          <View style={[S.overlay, S.winBg]}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>Score final : {state.score} • {state.moveCount} coups</Text>
          </View>
        )}
        {state.lost && !state.won && (
          <View style={[S.overlay, S.loseBg]}>
            <Text style={S.loseText}>Partie bloquée — plus de mouvement possible.</Text>
            <Text style={S.winSub}>Score : {state.score}</Text>
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
  title: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 12, textAlign: 'center', marginBottom: 16 },

  scoreRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  scoreCell: { alignItems: 'center', minWidth: 70, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(124,58,237,0.18)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  scoreLabel: { color: '#A78BFA', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  scoreVal: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black', marginTop: 2 },

  layoutWrap: { alignItems: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 4, marginBottom: 4 },

  cardWrap: { borderRadius: 8 },
  cardWrapDim: { opacity: 0.45 },
  cardWrapHi: { borderWidth: 2, borderColor: '#10B981', borderRadius: 10 },
  cardSlotEmpty: { width: 44, height: 60, opacity: 0 },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stockBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7C3AED' },
  stockBtnDisabled: { opacity: 0.4 },
  stockLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },
  smallLabel: { color: '#9CA3AF', fontSize: 11 },

  overlay: { marginTop: 20, padding: 20, borderRadius: 12, alignItems: 'center' },
  winBg: { backgroundColor: 'rgba(16,185,129,0.3)' },
  loseBg: { backgroundColor: 'rgba(220,38,38,0.3)' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 12, marginTop: 4 },
  loseText: { color: '#fff', fontSize: 14, textAlign: 'center' },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
