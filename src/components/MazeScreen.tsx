/**
 * @file MazeScreen.tsx
 * @description UI for the unique Maze solitaire mechanic. Renders a grid of
 * cards with holes (null cells). Tap a card → highlight all holes it can fill
 * (based on neighbor sequence rule). Tap a fillable hole → engine moves card.
 *
 * Powers a single dataset variant : maze.
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
import { useGenericActionLog, dumpMaze } from '../game/useGenericActionLog';
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
  canFillHole,
  listFillableHoles,
  type MazeConfig,
} from '../game/engines/_mazeEngine';

import * as maze from '../game/engines/maze';

const MAZE_CONFIGS: Record<string, MazeConfig> = {
  maze: maze.MAZE_CONFIG,
};

const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
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

export default function MazeScreen({ variant, difficulty }: Props) {
  const config = MAZE_CONFIGS[variant.key];
  const { palette } = useTheme();
  const d: Difficulty = (difficulty === 'easy' || difficulty === 'hard' || difficulty === 'medium') ? difficulty : 'medium';
  const hints = useHints(d);
  const [runId, setRunId] = useState(0);
  const [hintTick, setHintTick] = useState(0);
  if (!config) {
    return (
      <View style={S.errorWrap}>
        <AppHeader title={variant.name} showBack />
        <Text style={S.errorText}>Configuration Maze introuvable pour : {variant.key}</Text>
      </View>
    );
  }
  const onRestart = () => { hints.reset(); setRunId((n) => n + 1); };
  const onHint = () => {
    // eslint-disable-next-line no-console
    console.log(`[MazeScreen] 💡 hint pressed — variant=${variant.key} canUseHint=${hints.canUseHint} remaining=${hints.remaining}`);
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
        subLabel={`Grille ${config.rows}×${config.cols}`}
      />
      <Inner key={runId} config={config} variant={variant} hintTick={hintTick} />
      <HintFlashBanner
        tick={hintTick}
        message="💡 Indice — un trou est remplissable"
        hintsLeft={hints.remaining === Infinity ? '∞' : hints.remaining}
      />
    </View>
  );
}

function Inner({ config, variant, hintTick }: { config: MazeConfig; variant: Variant; hintTick: number }) {
  const race = useRace();
  const [state, dispatch, undoCtl] = useGameWithUndo(gameReducer, undefined, () => createInitialStateFor(config, race?.seed));
  const undos = useUndos(undoCtl);
  useRaceReport({
    score: state.moveCount,
    moves: state.moveCount,
    finished: !!state.won,
    getActions: undoCtl.getActions,
  });
  useAutoClaimDailyOnWin(variant.key, !!state.won);
  useSaveSoloOnWin({
    variantKey: variant.key,
    won: !!state.won,
    // Maze a une métrique inversée : moins de coups = meilleur score.
    // Score conventionnel = 200 - moveCount (capped at 0).
    score: Math.max(0, 200 - state.moveCount),
    moves: state.moveCount,
  });
  useGenericActionLog({
    variantKey: variant.key,
    moves: state.moveCount,
    score: state.moveCount,
    extra: `grille=${config.rows}×${config.cols}`,
    dump: () => dumpMaze(state),
  });
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);

  // Hint: pick the first card whose move into a hole hasn't already been
  // suggested twice in the last 8 hints. Maze is a slide-puzzle where the
  // previous source becomes a new hole, so a card can theoretically move
  // back and forth between two positions if both directions stay legal —
  // anti-cycle history prevents that.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const hintHistoryRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    if (hintTick === 0) return;
    const cur = stateRef.current;
    if (cur.won) return;

    type Cand = { fromR: number; fromC: number; toR: number; toC: number; sig: string };
    const candidates: Cand[] = [];
    for (let r = 0; r < cur.grid.length; r++) {
      for (let c = 0; c < cur.grid[r].length; c++) {
        const card = cur.grid[r][c];
        if (!card) continue;
        const holes = listFillableHoles(cur, card);
        for (const [tr, tc] of holes) {
          candidates.push({
            fromR: r,
            fromC: c,
            toR: tr,
            toC: tc,
            sig: `MOVE:${card.id}->${tr},${tc}`,
          });
        }
      }
    }

    for (const cnd of candidates) {
      const occ = hintHistoryRef.current.filter((s) => s === cnd.sig).length;
      if (occ >= 2) continue;
      // eslint-disable-next-line no-console
      console.log(`[MazeScreen.Inner] hintTick=${hintTick} → MOVE ${cnd.fromR},${cnd.fromC} → ${cnd.toR},${cnd.toC}`);
      hintHistoryRef.current.push(cnd.sig);
      if (hintHistoryRef.current.length > 8) hintHistoryRef.current.shift();
      dispatch({ type: 'MOVE', fromRow: cnd.fromR, fromCol: cnd.fromC, toRow: cnd.toR, toCol: cnd.toC });
      setSelected(null);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[MazeScreen.Inner] hintTick=${hintTick} → aucun coup non-cyclique (position figée)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTick]);

  const selectedCard = selected ? state.grid[selected.r][selected.c] : null;
  const fillableHoles = selectedCard ? listFillableHoles(state, selectedCard) : [];
  const isFillable = (r: number, c: number) =>
    fillableHoles.some(([fr, fc]) => fr === r && fc === c);

  const onCellPress = (r: number, c: number) => {
    const cell = state.grid[r][c];
    if (selected) {
      if (cell === null && isFillable(r, c)) {
        dispatch({ type: 'MOVE', fromRow: selected.r, fromCol: selected.c, toRow: r, toCol: c });
        setSelected(null);
        return;
      }
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }
    }
    if (cell) setSelected({ r, c });
  };

  // Count of placed cards and holes for the stat banner.
  const placed = state.grid.reduce((sum, row) => sum + row.filter((c) => c != null).length, 0);
  const holesCount = config.rows * config.cols - placed;

  return (
    <View style={S.innerRoot}>
      <FloatingUndoButton undoCtl={undoCtl} top={56} />
      <ScrollView contentContainerStyle={S.scrollContent}>
        <GenericStatsBanner
          stats={[
            { label: 'MOUVEMENTS', value: state.moveCount },
            { label: 'CARTES', value: placed },
            { label: 'TROUS', value: holesCount },
          ]}
        />

        <ScrollView horizontal contentContainerStyle={S.gridScrollContent}>
          <View style={S.grid}>
            {state.grid.map((row, r) => (
              <View key={r} style={S.row}>
                {row.map((card, c) => {
                  const isSel = selected?.r === r && selected.c === c;
                  const isHole = card === null;
                  const fillable = isHole && isFillable(r, c);
                  return (
                    <TouchableOpacity
                      key={`${r}-${c}`}
                      style={[
                        S.cellWrap,
                        fillable && S.cellWrapFillable,
                        isSel && S.cellWrapSel,
                      ]}
                      onPress={() => onCellPress(r, c)}
                      activeOpacity={0.7}
                    >
                      {card ? (
                        <FrenchCard code={cardCode(card)} width={42} height={56} />
                      ) : (
                        <View style={[S.hole, fillable && S.holeFillable]}>
                          <Text style={S.holeText}>·</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={S.counter}>
          Mouvements : {state.moveCount}
          {selected && selectedCard && (
            <Text style={{ color: '#FCD34D' }}> • Sélection : {rankLabel(selectedCard.rank)}{SUIT_GLYPH[selectedCard.suit]}</Text>
          )}
        </Text>

        {state.won && (
          <View style={S.winOverlay}>
            <Text style={S.winText}>🏆 Victoire !</Text>
            <Text style={S.winSub}>4 séquences A→Q complètes en {state.moveCount} coups</Text>
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
  subtitle: { color: '#C4B5FD', fontSize: 11, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },

  gridScrollContent: { paddingHorizontal: 4 },
  grid: { flexDirection: 'column' },
  row: { flexDirection: 'row', gap: 3, marginBottom: 3 },

  cellWrap: { borderRadius: 8 },
  cellWrapSel: { borderWidth: 2, borderColor: '#FCD34D', borderRadius: 10 },
  cellWrapFillable: { borderWidth: 2, borderColor: '#10B981', borderRadius: 10 },
  hole: { width: 42, height: 56, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.04)' },
  holeFillable: { backgroundColor: 'rgba(16,185,129,0.25)', borderColor: '#10B981', borderStyle: 'solid' },
  holeText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },

  counter: { color: '#9CA3AF', fontSize: 12, marginTop: 12, textAlign: 'center' },
  winOverlay: { marginTop: 24, padding: 20, backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 12, alignItems: 'center' },
  winText: { color: '#FCD34D', fontSize: 24, fontFamily: 'Inter-Black' },
  winSub: { color: '#fff', fontSize: 12, marginTop: 4 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#052E25' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
