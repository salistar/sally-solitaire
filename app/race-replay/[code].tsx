/**
 * @file race-replay/[code].tsx
 * @description Visualiseur de replay 1v1. Charge un match terminé depuis
 * `GET /solitaire-matches/:code/replay` et permet de rejouer la séquence
 * d'actions de l'un des deux joueurs.
 *
 * Architecture :
 *  - Pas de gameplay : on dispatch les actions stockées sur le `gameReducer`
 *    de la variante via le mapping `reducerFor`.
 *  - Le user choisit quel joueur regarder (gagnant par défaut).
 *  - Si la partie n'a pas d'`actions[]` enregistrées (legacy ou client qui
 *    n'a pas streamé son log) on affiche les stats finales + un avertissement.
 *
 * Cohérent avec `app/replay/[id].tsx` (le replay solo) : même UX (progress
 * bar, play/pause/step, speed chips), mais source = REST API plutôt
 * qu'AsyncStorage.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import * as api from '../../shared/api';

import * as Klondike from '../../src/game/solitaireFrEngine';
import * as Spider from '../../src/game/spiderEngine';
import * as FreeCell from '../../src/game/freecellEngine';
import * as Yukon from '../../src/game/yukonEngine';
import * as Golf from '../../src/game/golfEngine';
import * as Pyramid from '../../src/game/pyramidEngine';
import * as TriPeaks from '../../src/game/tripeaksEngine';
import * as FortyThieves from '../../src/game/fortyThievesEngine';
import * as Accordion from '../../src/game/accordionEngine';

type Reducer = (s: any, a: any) => any;

/**
 * Maps a variant key to its engine reducer. Generic-engine variants
 * (`canfield_classic`, `demon`, etc.) are not handled here because the race
 * action log only flows through the legacy engines today. They fall through
 * to `null` and the viewer falls back to a stats-only view.
 */
function reducerFor(variantKey: string): Reducer | null {
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

export default function RaceReplayScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [replay, setReplay] = useState<api.RaceReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerIdx, setSelectedPlayerIdx] = useState(0);

  const [state, setState] = useState<any>(null);
  const [actionIdx, setActionIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const speed = SPEEDS[speedIdx];

  const reducer = useMemo(() => (replay ? reducerFor(replay.variant) : null), [replay]);
  const selectedPlayer = replay?.players[selectedPlayerIdx] ?? null;

  // Fetch replay from REST
  useEffect(() => {
    if (!code) return;
    (async () => {
      const data = await api.fetchRaceReplay(code);
      if (!data) {
        setError(`Match ${code} introuvable`);
        return;
      }
      setReplay(data);
      // Default-select the winner (or the first player if no winner).
      const winnerIdx = data.players.findIndex((p) => p.userId === data.winnerId);
      setSelectedPlayerIdx(winnerIdx >= 0 ? winnerIdx : 0);
    })();
  }, [code]);

  // Reset playback when the player selection changes
  useEffect(() => {
    if (!replay) return;
    setState(replay.initialState);
    setActionIdx(0);
    setPlaying(false);
  }, [replay, selectedPlayerIdx]);

  // Playback loop
  useEffect(() => {
    if (!playing || !reducer || !selectedPlayer) return;
    if (actionIdx >= selectedPlayer.actions.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      const a = selectedPlayer.actions[actionIdx];
      setState((prev: any) => reducer(prev, a));
      setActionIdx((i) => i + 1);
    }, speed.ms);
    return () => clearTimeout(t);
  }, [playing, actionIdx, reducer, selectedPlayer, speed.ms]);

  const restart = () => {
    if (!replay) return;
    setState(replay.initialState);
    setActionIdx(0);
    setPlaying(false);
  };

  const stepNext = () => {
    if (!reducer || !selectedPlayer) return;
    if (actionIdx >= selectedPlayer.actions.length) return;
    const a = selectedPlayer.actions[actionIdx];
    setState((prev: any) => reducer(prev, a));
    setActionIdx((i) => i + 1);
  };

  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Replay race" showBack />
        <View style={styles.center}>
          <Ionicons name="warning" size={48} color="#EF4444" />
          <Text style={[styles.errorText, { color: palette.text }]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!replay) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Replay race" showBack />
        <View style={styles.center}>
          <Text style={{ color: palette.textSecondary }}>Chargement…</Text>
        </View>
      </View>
    );
  }

  const noReducer = !reducer;
  const noActions = !selectedPlayer || selectedPlayer.actions.length === 0;
  const total = selectedPlayer?.actions.length ?? 0;
  const progress = total === 0 ? 1 : actionIdx / total;
  const finished = actionIdx >= total && total > 0;
  const previousAction = actionIdx > 0 ? selectedPlayer?.actions[actionIdx - 1] : null;
  const currentAction = actionIdx < total ? selectedPlayer?.actions[actionIdx] : null;
  const currentMoves = state?.moves ?? 0;
  const currentScore = state?.score ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={`Race ${replay.code}`} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Players row : tap to switch perspective */}
        <View style={styles.playerRow}>
          {replay.players.map((p, i) => {
            const isWinner = p.userId === replay.winnerId;
            const isActive = i === selectedPlayerIdx;
            return (
              <TouchableOpacity
                key={p.userId}
                onPress={() => setSelectedPlayerIdx(i)}
                style={[
                  styles.playerCard,
                  {
                    backgroundColor: palette.card,
                    borderColor: isActive ? '#0EA5E9' : palette.border,
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.playerName, { color: palette.text }]} numberOfLines={1}>
                  {isWinner ? '🏆 ' : ''}{p.displayName}
                </Text>
                <Text style={[styles.playerStat, { color: palette.textSecondary }]}>
                  Score {p.score} · {p.moves} coups
                </Text>
                <Text style={[styles.playerStat, { color: palette.textSecondary }]}>
                  {p.actionsCount > 0 ? `${p.actionsCount} actions` : 'pas d\'actions'}
                </Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/user/${p.userId}`);
                  }}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  style={styles.playerProfileLink}
                >
                  <Text style={styles.playerProfileLinkText}>👤 Profil</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Progress + controls (only if reducer + actions exist) */}
        {!noReducer && !noActions && (
          <>
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
                État actuel : score={currentScore}, moves={currentMoves}
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
                <Text style={styles.ctrlTextWhite}>
                  {finished ? 'Terminé' : (playing ? 'Pause' : 'Lecture')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={stepNext}
                disabled={finished || playing}
                style={[styles.ctrlBtn, {
                  backgroundColor: palette.border, opacity: (finished || playing) ? 0.5 : 1,
                }]}>
                <Ionicons name="play-skip-forward" size={18} color={palette.text} />
                <Text style={[styles.ctrlText, { color: palette.text }]}>+1</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.speedRow}>
              <Text style={[styles.speedLabel, { color: palette.textSecondary }]}>Vitesse</Text>
              {SPEEDS.map((sp, i) => (
                <TouchableOpacity
                  key={sp.ms}
                  onPress={() => setSpeedIdx(i)}
                  style={[styles.speedChip, {
                    backgroundColor: speedIdx === i ? '#0EA5E9' : palette.border,
                  }]}>
                  <Text style={[styles.speedChipText, {
                    color: speedIdx === i ? '#fff' : palette.text,
                  }]}>{sp.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Fallback : variant unsupported by replay engine map */}
        {noReducer && (
          <View style={[styles.warningBox, { borderColor: '#F59E0B' }]}>
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.warningText, { color: palette.text }]}>
              La variante <Text style={{ fontFamily: 'monospace' }}>{replay.variant}</Text> n'est pas
              encore supportée par le viewer (engine générique). Les stats finales restent
              affichées plus bas.
            </Text>
          </View>
        )}

        {/* Fallback : no actions recorded */}
        {!noReducer && noActions && (
          <View style={[styles.warningBox, { borderColor: '#F59E0B' }]}>
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.warningText, { color: palette.text }]}>
              Aucune action enregistrée pour ce joueur — le client ne streamait pas son
              log de coups. La partie a bien eu lieu mais on ne peut pas la rejouer.
            </Text>
          </View>
        )}

        {/* Anti-cheat flag banner — only when the match was contested */}
        {replay.flagged && (
          <View style={[styles.warningBox, { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.10)' }]}>
            <Ionicons name="warning" size={16} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningText, { color: '#EF4444', fontFamily: 'Inter-Bold' }]}>
                Match contesté — ELO non appliqué
              </Text>
              {replay.flagReasons.map((reason, i) => (
                <Text key={i} style={[styles.warningText, { color: palette.textSecondary, marginTop: 2 }]}>
                  · {reason}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Match metadata footer */}
        <View style={[styles.metaCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Informations match</Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Variante : {replay.variant} · {replay.difficulty}
          </Text>
          <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
            Statut : {replay.status}{replay.winnerId ? ` · gagnant ${replay.winnerId}` : ''}
          </Text>
          {replay.finishedAt ? (
            <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
              Terminé : {new Date(replay.finishedAt).toLocaleString()}
            </Text>
          ) : null}
          {replay.dealHash ? (
            <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
              Deal hash : <Text style={{ fontFamily: 'monospace' }}>{replay.dealHash.slice(0, 12)}…</Text>
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter-Black' },
  playerRow: { flexDirection: 'row', gap: 8 },
  playerCard: { flex: 1, padding: 12, borderRadius: 10, gap: 4 },
  playerName: { fontSize: 13, fontFamily: 'Inter-Black' },
  playerStat: { fontSize: 10, fontFamily: 'Inter-Regular' },
  playerProfileLink: {
    marginTop: 6, alignSelf: 'flex-start',
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6,
    backgroundColor: 'rgba(14,165,233,0.18)',
  },
  playerProfileLinkText: { color: '#0EA5E9', fontSize: 10, fontFamily: 'Inter-Bold' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  cardTitle: { fontSize: 13, fontFamily: 'Inter-Black' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%' },
  progressText: { fontSize: 14, fontFamily: 'Inter-Black' },
  statSub: { fontSize: 11, fontFamily: 'Inter-Regular', opacity: 0.7 },
  actionBox: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 2 },
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
  warningBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  warningText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular' },
  metaCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  metaLine: { fontSize: 11, fontFamily: 'Inter-Regular' },
});
