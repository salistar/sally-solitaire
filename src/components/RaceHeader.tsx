/**
 * @file RaceHeader.tsx
 * @description Top bar showing the local player vs the remote opponent during
 * a 1v1 race. Renders two progress rows (avatar + name + score + moves +
 * status). The "winner" of each pair (higher score so far) gets a green glow;
 * the finished status displays a 🏆.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SolitairePlayerProgress } from '../../shared/api';
import { useRace } from '../contexts/RaceContext';

interface Props {
  match: { players: SolitairePlayerProgress[]; status: string; winnerId: string | null } | null;
  selfUserId: string;
  /** When true, a small "🟢 LIVE" badge shows in the divider. */
  socketConnected?: boolean;
}

export default function RaceHeader({ match, selfUserId, socketConnected }: Props) {
  // Read from RaceContext if not explicitly passed
  const race = useRace();
  const liveSocket = socketConnected ?? race?.socketConnected ?? false;
  const players = match?.players ?? [];
  const me = players.find((p) => p.userId === selfUserId);
  const opp = players.find((p) => p.userId !== selfUserId);
  const winner = match?.winnerId;
  const status = match?.status ?? 'waiting';

  return (
    <LinearGradient
      colors={['rgba(124,58,237,0.18)', 'rgba(192,38,211,0.12)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.row}>
        <PlayerSlot label="MOI" player={me} isWinner={winner === me?.userId} />
        <View style={styles.divider}>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.status}>{status === 'playing' ? '⏱ EN COURS' : status === 'finished' ? '🏁 FINI' : '⏳ ATTENTE'}</Text>
          {liveSocket && (
            <View style={styles.liveBadge}>
              <View style={styles.livePulse} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <PlayerSlot label="ADVERSAIRE" player={opp} isWinner={winner === opp?.userId} alignRight />
      </View>
    </LinearGradient>
  );
}

function PlayerSlot({ label, player, isWinner, alignRight }: {
  label: string;
  player?: SolitairePlayerProgress;
  isWinner: boolean;
  alignRight?: boolean;
}) {
  return (
    <View style={[styles.slot, alignRight && { alignItems: 'flex-end' }]}>
      <Text style={[styles.label, alignRight && { textAlign: 'right' }]}>{label}</Text>
      {player ? (
        <>
          <Text style={[styles.name, isWinner && styles.nameWinner]} numberOfLines={1}>
            {isWinner && '🏆 '}
            {player.displayName}
          </Text>
          <View style={styles.statsRow}>
            <Stat label="Score" value={player.score} />
            <Stat label="Coups" value={player.moves} />
            {player.finished && <Text style={styles.doneTag}>✓ Fini</Text>}
          </View>
        </>
      ) : (
        <Text style={styles.waiting}>en attente…</Text>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slot: { flex: 1 },
  label: { color: '#A78BFA', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 2 },
  name: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold', marginBottom: 2 },
  nameWinner: { color: '#FCD34D' },
  statsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stat: { alignItems: 'center', minWidth: 30 },
  statValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  statLabel: { color: '#9CA3AF', fontSize: 8, letterSpacing: 0.5 },
  divider: { alignItems: 'center', paddingHorizontal: 6 },
  vs: { color: '#FCD34D', fontSize: 16, fontFamily: 'Inter-Black' },
  status: { color: '#C4B5FD', fontSize: 8, marginTop: 2, fontWeight: '700' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 3, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 4 },
  livePulse: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { color: '#10B981', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  doneTag: { color: '#10B981', fontSize: 10, fontWeight: '900', marginLeft: 4 },
  waiting: { color: '#6B7280', fontStyle: 'italic', fontSize: 11 },
});
