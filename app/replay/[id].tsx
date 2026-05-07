/**
 * @file replay/[id].tsx
 * @description Écran "Rejouer" : prend un replay sauvegardé et dispatch les
 * actions une par une avec un timer. Affiche un compteur de progression
 * (coup N / total) et permet pause/reprise/skip.
 *
 * État : reconstruit via `useReducer` à partir de `replay.initialState`,
 * puis on applique chaque action du tableau `replay.actions` à l'intervalle
 * choisi.
 */

import React, { useEffect, useState, useReducer, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import * as Replays from '../../src/game/replays';

import * as Klondike from '../../src/game/solitaireFrEngine';
import * as Spider from '../../src/game/spiderEngine';
import * as FreeCell from '../../src/game/freecellEngine';
import * as Yukon from '../../src/game/yukonEngine';
import * as Golf from '../../src/game/golfEngine';
import * as Pyramid from '../../src/game/pyramidEngine';
import * as TriPeaks from '../../src/game/tripeaksEngine';
import * as FortyThieves from '../../src/game/fortyThievesEngine';
import * as Accordion from '../../src/game/accordionEngine';

function reducerFor(variantKey: string): ((s: any, a: any) => any) | null {
  if (variantKey.startsWith('klondike')) return Klondike.gameReducer;
  if (variantKey.startsWith('spider')) return Spider.gameReducer;
  if (variantKey === 'freecell') return FreeCell.gameReducer;
  if (variantKey === 'yukon') return Yukon.gameReducer;
  if (variantKey === 'golf') return Golf.gameReducer;
  if (variantKey === 'pyramid') return Pyramid.gameReducer;
  if (variantKey === 'tripeaks') return TriPeaks.gameReducer;
  if (variantKey === 'forty-thieves') return FortyThieves.gameReducer;
  if (variantKey === 'accordion') return Accordion.gameReducer;
  return null;
}

const SPEEDS = [
  { ms: 1000, label: '0.5×' },
  { ms: 500, label: '1×' },
  { ms: 250, label: '2×' },
  { ms: 50, label: 'Turbo' },
];

export default function ReplayPlayer() {
  const { palette } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [replay, setReplay] = useState<Replays.Replay | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reducer, setReducer] = useState<((s: any, a: any) => any) | null>(null);
  const [stateHistory, setStateHistory] = useState<any>(null);
  const [actionIdx, setActionIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const speed = SPEEDS[speedIdx];

  // Charge le replay depuis AsyncStorage
  useEffect(() => {
    if (!id) return;
    (async () => {
      const all = await Replays.listAllReplays();
      const found = all.find((r) => r.id === id);
      if (!found) {
        setError(`Replay ${id} introuvable`);
        return;
      }
      setReplay(found);
      const r = reducerFor(found.variantKey);
      if (!r) {
        setError(`Variante ${found.variantKey} non supportée pour le replay`);
        return;
      }
      setReducer(() => r);
      setStateHistory(found.initialState);
      setActionIdx(0);
    })();
  }, [id]);

  // Boucle de lecture
  useEffect(() => {
    if (!playing || !replay || !reducer) return;
    if (actionIdx >= replay.actions.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const action = replay.actions[actionIdx];
      setStateHistory((prev: any) => reducer(prev, action));
      setActionIdx((i) => i + 1);
    }, speed.ms);
    return () => clearTimeout(timer);
  }, [playing, actionIdx, replay, reducer, speed.ms]);

  const restart = () => {
    if (!replay) return;
    setStateHistory(replay.initialState);
    setActionIdx(0);
    setPlaying(false);
  };

  const stepNext = () => {
    if (!replay || !reducer) return;
    if (actionIdx >= replay.actions.length) return;
    const action = replay.actions[actionIdx];
    setStateHistory((prev: any) => reducer(prev, action));
    setActionIdx((i) => i + 1);
  };

  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Rejouer" showBack />
        <View style={styles.center}>
          <Ionicons name="warning" size={48} color="#EF4444" />
          <Text style={[styles.errorText, { color: palette.text }]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!replay || !reducer) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Rejouer" showBack />
        <View style={styles.center}>
          <Text style={{ color: palette.textSecondary }}>Chargement…</Text>
        </View>
      </View>
    );
  }

  const total = replay.actions.length;
  const progress = total === 0 ? 1 : actionIdx / total;
  const finished = actionIdx >= total;
  const currentAction = actionIdx < total ? replay.actions[actionIdx] : null;
  const previousAction = actionIdx > 0 ? replay.actions[actionIdx - 1] : null;
  const currentStateMoves = (stateHistory as any)?.moves ?? 0;
  const currentStateScore = (stateHistory as any)?.score ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={`Replay ${replay.variantKey}`} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Progression</Text>
          <View style={[styles.progressBar, { backgroundColor: palette.border }]}>
            <View style={[styles.progressFill, {
              width: `${progress * 100}%`,
              backgroundColor: finished ? '#10B981' : '#0EA5E9',
            }]} />
          </View>
          <Text style={[styles.progressText, { color: palette.text }]}>
            Coup {actionIdx} / {total} {finished ? '✓' : ''}
          </Text>
          <Text style={[styles.statSub, { color: palette.textSecondary }]}>
            État actuel : score={currentStateScore}, moves={currentStateMoves}
          </Text>

          {previousAction ? (
            <View style={[styles.actionBox, { borderColor: palette.border }]}>
              <Text style={[styles.actionLabel, { color: palette.textSecondary }]}>Dernière action</Text>
              <Text style={[styles.actionType, { color: palette.text }]}>
                {(previousAction as any)?.type ?? '?'}
              </Text>
            </View>
          ) : null}
          {currentAction ? (
            <View style={[styles.actionBox, { borderColor: '#0EA5E9' }]}>
              <Text style={[styles.actionLabel, { color: '#0EA5E9' }]}>Prochaine action</Text>
              <Text style={[styles.actionType, { color: palette.text }]}>
                {(currentAction as any)?.type ?? '?'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity onPress={restart} style={[styles.ctrlBtn, { backgroundColor: palette.border }]}>
            <Ionicons name="refresh" size={18} color={palette.text} />
            <Text style={[styles.ctrlText, { color: palette.text }]}>Restart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPlaying((p) => !p)}
            disabled={finished}
            style={[styles.ctrlBtn, {
              backgroundColor: finished ? palette.border : (playing ? '#EF4444' : '#10B981'),
              flex: 2,
            }]}>
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#fff" />
            <Text style={styles.ctrlTextWhite}>{finished ? 'Terminé' : (playing ? 'Pause' : 'Lecture')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={stepNext} disabled={finished || playing}
            style={[styles.ctrlBtn, { backgroundColor: palette.border, opacity: (finished || playing) ? 0.5 : 1 }]}>
            <Ionicons name="play-skip-forward" size={18} color={palette.text} />
            <Text style={[styles.ctrlText, { color: palette.text }]}>+1</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.speedRow}>
          <Text style={[styles.speedLabel, { color: palette.textSecondary }]}>Vitesse</Text>
          {SPEEDS.map((s, i) => (
            <TouchableOpacity key={s.ms} onPress={() => setSpeedIdx(i)}
              style={[styles.speedChip, {
                backgroundColor: speedIdx === i ? '#0EA5E9' : palette.border,
              }]}>
              <Text style={[styles.speedChipText, {
                color: speedIdx === i ? '#fff' : palette.text,
              }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.metaCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Informations</Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Variante : {replay.variantKey} · {replay.difficulty}
          </Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Date : {new Date(replay.wonAt).toLocaleString()}
          </Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Score final : {replay.score} · {replay.moves} coups · {Math.floor(replay.durationMs / 1000)}s
          </Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Actions enregistrées : {total}
          </Text>
        </View>

        {total === 0 ? (
          <View style={[styles.warningBox, { borderColor: '#F59E0B' }]}>
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.warningText, { color: palette.text }]}>
              Ce replay a été enregistré avant l'ajout du recorder de coups.
              Seul l'état initial est disponible — pas la séquence d'actions à rejouer.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter-Black' },
  card: {
    borderWidth: 1, borderRadius: 12, padding: 14, gap: 8,
  },
  cardTitle: { fontSize: 13, fontFamily: 'Inter-Black' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { fontSize: 14, fontFamily: 'Inter-Black' },
  statSub: { fontSize: 11, fontFamily: 'Inter-Regular', opacity: 0.7 },
  actionBox: {
    borderWidth: 1, borderRadius: 8, padding: 8, gap: 2,
  },
  actionLabel: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  actionType: { fontSize: 14, fontFamily: 'monospace' },
  controls: { flexDirection: 'row', gap: 8 },
  ctrlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 12, borderRadius: 8,
  },
  ctrlText: { fontSize: 12, fontFamily: 'Inter-Black' },
  ctrlTextWhite: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black' },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  speedLabel: { fontSize: 11, fontFamily: 'Inter-Black', flex: 1 },
  speedChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  speedChipText: { fontSize: 11, fontFamily: 'Inter-Black' },
  metaCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  metaLine: { fontSize: 11, fontFamily: 'Inter-Regular' },
  warningBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  warningText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular' },
});
