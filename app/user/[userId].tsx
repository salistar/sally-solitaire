/**
 * @file user/[userId].tsx
 * @description Public profile viewer for any solitaire player. Rendered when
 * tapping an opponent in race-history, the race-replay player cards, or the
 * race leaderboard.
 *
 * No new backend endpoint — composes three already-public reads:
 *   - `fetchUserRaceElo(userId, 'global')` → name + global ELO + W/L/winRate
 *   - `fetchMyRaces(userId, { limit: 5 })`  → 5 most recent matches
 *   - `fetchUserAchievements(userId)`        → unlocked count + progress
 *
 * Private data stays private: coins wallet, daily streak, inventory, and the
 * cheat-strikes counter are NOT shown here. Shadow-banned status is also
 * hidden by design (revealing it would let cheaters tune their evasion).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import * as api from '../../shared/api';

function formatRelative(ms: number | null): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d}j`;
  return new Date(ms).toLocaleDateString();
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [elo, setElo] = useState<api.RaceEloEntry | null>(null);
  const [recent, setRecent] = useState<api.RaceHistoryEntry[]>([]);
  const [achievements, setAchievements] = useState<api.UserAchievementsDto | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [eloRow, racesList, ach, self] = await Promise.all([
        api.fetchUserRaceElo(userId, 'global'),
        api.fetchMyRaces(userId, { limit: 5 }),
        api.fetchUserAchievements(userId),
        api.getMe().catch(() => null),
      ]);
      setElo(eloRow);
      setRecent(racesList);
      setAchievements(ach);
      setMe(self ? { id: self.id } : null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const isSelf = me?.id === userId;
  // Best displayName source: ELO row → achievements DTO → fallback to userId
  const displayName = elo?.displayName ?? achievements?.displayName ?? userId ?? 'Joueur';

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Profil" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.text} />}
      >
        {/* Header card : name + self-flag */}
        <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarLetter}>
              {(displayName[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: palette.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.heroSub, { color: palette.textSecondary }]} numberOfLines={1}>
              {isSelf ? "C'est toi" : `ID : ${userId?.slice(0, 8)}…`}
            </Text>
          </View>
        </View>

        {/* ELO + stats card */}
        <View style={[styles.statsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Stats race (global)</Text>
          {elo ? (
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{elo.elo}</Text>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>ELO</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>{elo.wins}</Text>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>VICTOIRES</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: '#EF4444' }]}>{elo.losses}</Text>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>DÉFAITES</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{Math.round(elo.winRate * 100)}%</Text>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>WIN RATE</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.emptyHint, { color: palette.textSecondary }]}>
              Aucune partie classée jouée.
            </Text>
          )}
        </View>

        {/* Achievements progress card */}
        {achievements && (
          <TouchableOpacity
            onPress={() => isSelf && router.push('/achievements-online')}
            disabled={!isSelf}
            activeOpacity={isSelf ? 0.85 : 1}
            style={[styles.achievementsCard, {
              backgroundColor: palette.card, borderColor: palette.border,
            }]}
          >
            <Text style={styles.achievementsIcon}>🏆</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.achievementsTitle, { color: palette.text }]}>
                Achievements
              </Text>
              <Text style={[styles.achievementsSub, { color: palette.textSecondary }]}>
                {achievements.progress.unlocked} / {achievements.progress.total} débloqués
              </Text>
              <View style={[styles.achievementsBar, { backgroundColor: palette.border }]}>
                <View style={[styles.achievementsBarFill, {
                  width: `${achievements.progress.total > 0
                    ? (achievements.progress.unlocked / achievements.progress.total) * 100
                    : 0}%`,
                }]} />
              </View>
            </View>
            {isSelf && <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />}
          </TouchableOpacity>
        )}

        {/* Recent matches */}
        <View style={[styles.recentSection]}>
          <Text style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            5 DERNIÈRES RACES
          </Text>
          {recent.length === 0 && !loading && (
            <Text style={[styles.emptyHint, { color: palette.textSecondary }]}>
              Aucune race jouée pour le moment.
            </Text>
          )}
          {recent.map((m) => {
            const isWin = m.youWon === true;
            const isLoss = m.youWon === false;
            const tint = isWin ? '#10B981' : isLoss ? '#EF4444' : palette.textSecondary;
            const label = m.status !== 'finished' ? '· · ·'
              : isWin ? 'WIN' : isLoss ? 'LOSS' : 'NUL';
            return (
              <TouchableOpacity
                key={m.code}
                onPress={() => router.push(`/race-replay/${m.code}`)}
                style={[styles.matchRow, { backgroundColor: palette.card, borderColor: palette.border }]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.matchRowTop}>
                    <Text style={[styles.matchVariant, { color: palette.text }]} numberOfLines={1}>
                      {m.variant}
                    </Text>
                    {m.flagged && (
                      <Text style={styles.matchFlagged}>⚠</Text>
                    )}
                    <Text style={[styles.matchTime, { color: palette.textSecondary }]}>
                      {formatRelative(m.finishedAt ?? m.startedAt ?? Date.parse(m.createdAt))}
                    </Text>
                  </View>
                  <Text style={[styles.matchOpp, { color: palette.textSecondary }]} numberOfLines={1}>
                    vs {m.opponentDisplayName ?? '(en attente)'} · {m.selfScore} pts
                  </Text>
                </View>
                <Text style={[styles.matchResult, { color: tint }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.footerNote, { borderColor: palette.border }]}>
          <Ionicons name="information-circle" size={14} color={palette.textSecondary} />
          <Text style={[styles.footerNoteText, { color: palette.textSecondary }]}>
            Profil public — seules les stats de jeu sont visibles. Le solde de coins, les boosts
            actifs et le streak quotidien restent privés.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderWidth: 1, borderRadius: 14,
  },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarLetter: { color: '#fff', fontSize: 22, fontFamily: 'Inter-Black' },
  heroName: { fontSize: 18, fontFamily: 'Inter-Black' },
  heroSub: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },

  statsCard: { padding: 14, borderWidth: 1, borderRadius: 14, gap: 10 },
  cardTitle: { fontSize: 12, fontFamily: 'Inter-Black', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#FCD34D', fontSize: 18, fontFamily: 'Inter-Black' },
  statLabel: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter-Black' },
  statsDivider: { width: 1, height: 28, backgroundColor: 'rgba(167,139,250,0.3)' },

  achievementsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1, borderRadius: 14,
  },
  achievementsIcon: { fontSize: 28 },
  achievementsTitle: { fontSize: 14, fontFamily: 'Inter-Black' },
  achievementsSub: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  achievementsBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  achievementsBarFill: { height: '100%', backgroundColor: '#10B981' },

  recentSection: { gap: 6 },
  sectionHeader: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1, paddingHorizontal: 4 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderWidth: 1, borderRadius: 10,
  },
  matchRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchVariant: { fontSize: 12, fontFamily: 'Inter-Bold', flex: 1 },
  matchFlagged: { color: '#EF4444', fontSize: 12 },
  matchTime: { fontSize: 10, fontFamily: 'Inter-Regular' },
  matchOpp: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  matchResult: { fontSize: 11, fontFamily: 'Inter-Black', letterSpacing: 1 },

  emptyHint: { fontSize: 12, fontFamily: 'Inter-Regular', textAlign: 'center', paddingVertical: 8 },

  footerNote: {
    flexDirection: 'row', gap: 8,
    padding: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, marginTop: 8,
  },
  footerNoteText: { flex: 1, fontSize: 10, fontFamily: 'Inter-Regular', lineHeight: 14 },
});
