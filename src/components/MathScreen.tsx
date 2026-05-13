/**
 * @file MathScreen.tsx
 * @description UI for variable-step foundation solitaires powered by
 * _genericMath.ts. Layout: 4 (or 8) foundations on top, N waste piles below,
 * stock at the bottom. Player draws → routes to a waste pile OR directly
 * to a valid foundation if rules accept it.
 *
 * Powers 8 variants : calculation, betsy_ross, auld_lang_syne, sir_tommy,
 * strategy, lady_betty, quadrille, above_and_below.
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
import { useGenericActionLog, dumpMath } from '../game/useGenericActionLog';
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
  canPlaceOnFoundation,
  listValidFoundations,
  type MathConfig,
} from '../game/engines/_genericMath';

import * as calculation from '../game/engines/calculation';
import * as betsy_ross from '../game/engines/betsy_ross';
import * as auld_lang_syne from '../game/engines/auld_lang_syne';
import * as sir_tommy from '../game/engines/sir_tommy';
import * as strategy from '../game/engines/strategy';
import * as lady_betty from '../game/engines/lady_betty';
import * as quadrille from '../game/engines/quadrille';
import * as above_and_below from '../game/engines/above_and_below';

const MATH_CONFIGS: Record<string, MathConfig> = {
  calculation: calculation.MATH_CONFIG,
  betsy_ross: betsy_ross.MATH_CONFIG,
  auld_lang_syne: auld_lang_syne.MATH_CONFIG,
  sir_tommy: sir_tommy.MATH_CONFIG,
  strategy: strategy.MATH_CONFIG,
  lady_betty: lady_betty.MATH_CONFIG,
  quadrille: quadrille.MATH_CONFIG,
  above_and_below: above_and_below.MATH_CONFIG,
};

const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r);
function cardCode(c: { rank: number; suit: string }): string {
  const v = c.rank === 1 ? 'A' : c.rank === 10 ? '0' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${v}${c.suit}`;
}

interface Props {
  variant: Variant;
  difficulty?: string;
}

export default function MathScreen({ variant, difficulty }: Props) {
  const config = MATH_CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration Math introuvable pour : {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[MathScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
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
        subLabel={describeRule(config)}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — calcul du prochain coup"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: MathConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.foundations.reduce((s, f) => s + f.length, 0),
    moves: state.moveCount,
    finished: !!state.won,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  const totalFound = state.foundations.reduce((s, f) => s + f.length, 0);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    score: totalFound,
    moves: state.moveCount,
  });
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: totalFound,
    extra: `fondations=${totalFound}/${state.foundations.length * 13}`,
    dump: () => dumpMath(state),
  });

  // What foundations would accept the pending stock card or top of selected waste?
  const pendingValidFoundations = state.pendingStockCard
    ? listValidFoundations(state.pendingStockCard, state)
    : [];

  // Hint: priority order
  //   1. Pending stock card → first valid foundation
  //   2. Pending stock card → first waste pile (just stash it)
  //   3. Top of any waste pile → first valid foundation
  //   4. Draw from stock if non-empty
  //   5. Recycle waste if allowed
  const stateRef = React.useRef(state);
  stateRef.current = state;
  React.useEffect(() => {
    if (hintTick === 0) return;
    const cur = stateRef.current;
    if (cur.won) return;
    if (cur.pendingStockCard) {
      const valid = listValidFoundations(cur.pendingStockCard, cur);
      if (valid.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[MathScreen.Inner] hintTick=${hintTick} → STOCK_TO_FOUNDATION ${valid[0]}`);
        dispatch({ type: 'STOCK_TO_FOUNDATION', foundationIdx: valid[0] });
        return;
      }
      // No foundation accepts it — stash in waste 0
      // eslint-disable-next-line no-console
      console.log(`[MathScreen.Inner] hintTick=${hintTick} → STOCK_TO_WASTE 0`);
      dispatch({ type: 'STOCK_TO_WASTE', wasteIdx: 0 });
      return;
    }
    for (let w = 0; w < cur.wastePiles.length; w++) {
      const top = cur.wastePiles[w][cur.wastePiles[w].length - 1];
      if (!top) continue;
      const valid = listValidFoundations(top, cur);
      if (valid.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[MathScreen.Inner] hintTick=${hintTick} → WASTE_TO_FOUNDATION ${w}→${valid[0]}`);
        dispatch({ type: 'WASTE_TO_FOUNDATION', from: w, to: valid[0] });
        return;
      }
    }
    if (cur.stock.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[MathScreen.Inner] hintTick=${hintTick} → DRAW_STOCK`);
      dispatch({ type: 'DRAW_STOCK' });
      return;
    }
    if (cur.config.stockRecycle !== 'none') {
      // eslint-disable-next-line no-console
      console.log(`[MathScreen.Inner] hintTick=${hintTick} → RECYCLE_WASTE`);
      dispatch({ type: 'RECYCLE_WASTE' });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[MathScreen.Inner] hintTick=${hintTick} → no move found`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'FONDATIONS', value: `${totalFound}/${state.foundations.length * 13}` },
            { label: 'STOCK', value: state.stock.length },
          ]}
        />

        {/* Foundations row */}
        <View style={S.row}>
          {state.foundations.map((f, i) => {
            const top = f[f.length - 1];
            const baseRank = config.foundationBaseRanks[i];
            const step = config.foundationSteps[i];
            const isValid = state.pendingStockCard && pendingValidFoundations.includes(i);
            return (
              <TouchableOpacity
                key={i}
                style={[S.foundationSlot, isValid && S.foundationSlotValid]}
                onPress={() => state.pendingStockCard && dispatch({ type: 'STOCK_TO_FOUNDATION', foundationIdx: i })}
                disabled={!isValid}
                activeOpacity={isValid ? 0.7 : 1}
              >
                {top ? (
                  <FrenchCard code={cardCode(top)} width={48} height={66} />
                ) : (
                  <View style={S.foundationEmpty}>
                    <Text style={S.foundationPlaceholder}>
                      {baseRank != null ? `${rankLabel(baseRank)}` : '·'}
                    </Text>
                  </View>
                )}
                <Text style={S.foundationStep}>
                  +{step ?? 1}
                </Text>
                <Text style={S.foundationCount}>{f.length}/13</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Pending stock card */}
        {state.pendingStockCard && (
          <View style={S.pendingRow}>
            <Text style={S.smallLabel}>À placer :</Text>
            <FrenchCard code={cardCode(state.pendingStockCard)} width={60} height={84} />
            <Text style={S.hintText}>↓ Choisis fondation ou défausse</Text>
          </View>
        )}

        {/* Waste piles */}
        <View style={S.row}>
          {state.wastePiles.map((pile, i) => {
            const top = pile[pile.length - 1];
            const acceptsPending = !!state.pendingStockCard;
            const wasteTopValidFoundations = top ? listValidFoundations(top, state) : [];
            return (
              <View key={i} style={S.wasteCol}>
                <TouchableOpacity
                  style={[S.wasteSlot, acceptsPending && S.wasteSlotValid]}
                  onPress={() => acceptsPending && dispatch({ type: 'STOCK_TO_WASTE', wasteIdx: i })}
                  activeOpacity={acceptsPending ? 0.7 : 1}
                >
                  {top ? (
                    <FrenchCard code={cardCode(top)} width={44} height={62} />
                  ) : (
                    <View style={S.wasteEmpty}>
                      <Text style={S.foundationPlaceholder}>·</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {/* Send-to-foundation buttons */}
                {top && wasteTopValidFoundations.length > 0 && !state.pendingStockCard && (
                  <View style={S.wasteBtns}>
                    {wasteTopValidFoundations.map((fIdx) => (
                      <TouchableOpacity
                        key={fIdx}
                        style={S.wasteBtn}
                        onPress={() => dispatch({ type: 'WASTE_TO_FOUNDATION', from: i, to: fIdx })}
                      >
                        <Text style={S.wasteBtnText}>→F{fIdx + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={S.smallLabel}>W{i + 1} • {pile.length}</Text>
              </View>
            );
          })}
        </View>

        {/* Stock control — dos de carte française avec compteur */}
        <View style={S.stockRow}>
          <StockPile
            count={state.stock.length}
            canRecycle={config.stockRecycle !== 'none' && state.wastePiles.some((w) => w.length > 0)}
            onPress={() => state.stock.length > 0 ? dispatch({ type: 'DRAW_STOCK' }) : dispatch({ type: 'RECYCLE_WASTE' })}
          />
          <Text style={S.stockLabel}>
            {state.stock.length > 0 ? 'Pioche' : (config.stockRecycle !== 'none' ? 'Recycler' : 'Vide')}
          </Text>
        </View>

        <Text style={S.counter}>
          Sur fondations : {state.foundations.reduce((s, f) => s + f.length, 0)} • Mouvements : {state.moveCount}
        </Text>

        {state.won && (
          <View style={S.winOverlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>Toutes les fondations complètes en {state.moveCount} coups</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function describeRule(c: MathConfig): string {
  const steps = c.foundationSteps.map((s) => s == null ? '+1' : `+${s}`).join(', ');
  const mod = c.foundationsModular ? ' (mod 13)' : '';
  return `${c.numFoundations} fondations à pas ${steps}${mod} • ${c.numWastePiles} défausse${c.numWastePiles > 1 ? 's' : ''}`;
}

const S = StyleSheet.create({
  root: { flex: 1 },
  innerRoot: { flex: 1 },
  scrollContent: { padding: 14, paddingTop: 12, paddingBottom: 80, alignItems: 'center' },
  title: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black', marginBottom: 4 },
  subtitle: { color: '#C4B5FD', fontSize: 12, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },

  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' },

  foundationSlot: { width: 56, height: 92, alignItems: 'center', justifyContent: 'center', padding: 2 },
  foundationSlotValid: { borderWidth: 2, borderColor: '#10B981', borderRadius: 10 },
  foundationEmpty: { width: 48, height: 66, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  foundationPlaceholder: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '900' },
  foundationStep: { position: 'absolute', top: 4, right: 6, fontSize: 9, color: '#FCD34D', fontWeight: '900' },
  foundationCount: { position: 'absolute', bottom: 2, fontSize: 8, color: 'rgba(255,255,255,0.55)' },

  pendingRow: { alignItems: 'center', marginBottom: 16, padding: 12, backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 10, gap: 6 },
  hintText: { color: '#A7F3D0', fontSize: 11 },

  wasteCol: { alignItems: 'center', width: 56 },
  wasteSlot: { width: 50, height: 70, alignItems: 'center', justifyContent: 'center', padding: 2 },
  wasteSlotValid: { borderWidth: 2, borderColor: '#10B981', borderRadius: 10 },
  wasteEmpty: { width: 44, height: 62, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  wasteBtns: { flexDirection: 'row', gap: 2, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  wasteBtn: { paddingHorizontal: 4, paddingVertical: 2, backgroundColor: '#10B981', borderRadius: 4 },
  wasteBtnText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  smallLabel: { color: '#9CA3AF', fontSize: 10, marginTop: 2 },

  stockRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginVertical: 8 },
  stockBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7C3AED' },
  stockBtnDisabled: { opacity: 0.4 },
  stockLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  counter: { color: '#9CA3AF', fontSize: 12, marginTop: 12 },
  winOverlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 12, marginTop: 4 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
