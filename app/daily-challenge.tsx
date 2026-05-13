/**
 * @file daily-challenge.tsx
 * @description Daily Challenge — affiche le seed du jour pour les variantes
 * principales. Tout le monde reçoit le même deal le même jour (déterministe).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as api from '../shared/api';
import { markDailyReminderShown } from '../src/game/daily-reminder';
import { useAchievementToast } from '../src/contexts/AchievementToastContext';

const VARIANTS = [
  { key: 'klondike-1', label: 'Klondike', icon: '♠️' },
  { key: 'spider-2', label: 'Spider 2', icon: '🕷️' },
  { key: 'freecell', label: 'FreeCell', icon: '♥️' },
  { key: 'yukon', label: 'Yukon', icon: '🏔️' },
  { key: 'golf', label: 'Golf', icon: '⛳' },
  { key: 'pyramid', label: 'Pyramid', icon: '🔺' },
];

export default function DailyChallengeScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const [deals, setDeals] = useState<Record<string, api.DealSeed | null>>({});
  const [dailyBoards, setDailyBoards] = useState<Record<string, api.LeaderboardEntry[]>>({});
  const [rewards, setRewards] = useState<api.UserRewards | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const outDeals: Record<string, api.DealSeed | null> = {};
      const outBoards: Record<string, api.LeaderboardEntry[]> = {};
      const me = await api.getMe().catch(() => null);
      const rewardsPromise = me?.id ? api.fetchUserRewards(me.id) : Promise.resolve(null);
      await Promise.all(VARIANTS.map(async (v) => {
        const [d, top] = await Promise.all([
          api.fetchDailyChallenge(v.key),
          api.fetchDailyLeaderboard(v.key, undefined, 3),
        ]);
        outDeals[v.key] = d;
        outBoards[v.key] = top;
      }));
      const r = await rewardsPromise;
      setDeals(outDeals);
      setDailyBoards(outBoards);
      setRewards(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    markDailyReminderShown();
  }, [fetchAll]);

  const today = new Date().toLocaleDateString();

  const toast = useAchievementToast();

  const claimReward = useCallback(async (variant: string) => {
    const me = await api.getMe().catch(() => null);
    if (!me?.id) return;
    const result = await api.awardDailyReward({
      userId: me.id,
      displayName: me.username ?? 'Joueur',
      variant,
    });
    if (result) {
      // Fire unlock toasts BEFORE refreshing UI so the user sees them
      if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
        toast.showAchievements(result.unlockedAchievements);
      }
      // Refresh rewards display
      const fresh = await api.fetchUserRewards(me.id);
      if (fresh) setRewards(fresh);
    }
  }, [toast]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Daily Challenge" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={palette.text} />}
      >
        <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: '#F59E0B' }]}>
          <Ionicons name="calendar" size={28} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: palette.text }]}>{today}</Text>
            <Text style={[styles.heroSub, { color: palette.textSecondary }]}>
              Le même deal pour tous, partout dans le monde 🌍
            </Text>
          </View>
        </View>

        {rewards && (
          <TouchableOpacity
            onPress={() => router.push('/spend')}
            style={[styles.rewardsCard, { backgroundColor: palette.card, borderColor: '#7C3AED' }]}
            activeOpacity={0.85}
          >
            <View style={styles.rewardsStat}>
              <Text style={styles.rewardsValue}>🪙 {rewards.coins}</Text>
              <Text style={[styles.rewardsLabel, { color: palette.textSecondary }]}>COINS</Text>
            </View>
            <View style={styles.rewardsDivider} />
            <View style={styles.rewardsStat}>
              <Text style={styles.rewardsValue}>⭐ {rewards.xp}</Text>
              <Text style={[styles.rewardsLabel, { color: palette.textSecondary }]}>XP · Niv. {rewards.level}</Text>
            </View>
            <View style={styles.rewardsDivider} />
            <View style={styles.rewardsStat}>
              <Text style={styles.rewardsValue}>🔥 {rewards.dailyStreak}</Text>
              <Text style={[styles.rewardsLabel, { color: palette.textSecondary }]}>
                STREAK · Best {rewards.bestStreak}
              </Text>
            </View>
            <View style={styles.rewardsCta}>
              <Text style={styles.rewardsCtaText}>🛒 Dépenser →</Text>
            </View>
          </TouchableOpacity>
        )}

        {rewards && (
          <TouchableOpacity
            onPress={() => router.push('/achievements-online')}
            style={styles.achievementsBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.achievementsBtnIcon}>🏆</Text>
            <Text style={styles.achievementsBtnText}>Mes achievements & badges</Text>
            <Text style={styles.achievementsBtnChevron}>›</Text>
          </TouchableOpacity>
        )}

        {VARIANTS.map((v) => {
          const seed = deals[v.key];
          const dispo = !!seed;
          return (
            <TouchableOpacity
              key={v.key}
              disabled={!dispo}
              onPress={() => router.push(`/game/solo?variant=${v.key}&difficulty=medium&daily=1`)}
              style={[styles.variantCard, {
                backgroundColor: palette.card,
                borderColor: palette.border,
                opacity: dispo ? 1 : 0.4,
              }]}>
              <View style={styles.variantRow}>
                <Text style={styles.variantIcon}>{v.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.variantName, { color: palette.text }]}>{v.label}</Text>
                  {dispo ? (
                    <Text style={[styles.variantHash, { color: palette.textSecondary }]}>
                      Hash : {seed.dealHash?.slice(0, 8) ?? '—'} · seed #{seed.seedIndex}
                    </Text>
                  ) : (
                    <Text style={[styles.variantHash, { color: palette.textSecondary }]}>
                      Pas encore disponible
                    </Text>
                  )}
                </View>
                {dispo ? (
                  <Ionicons name="play-circle" size={28} color="#10B981" />
                ) : (
                  <Ionicons name="hourglass" size={20} color={palette.textSecondary} />
                )}
              </View>
              {/* Top 3 du jour pour cette variante */}
              {dailyBoards[v.key] && dailyBoards[v.key].length > 0 && (
                <View style={[styles.topBoard, { borderTopColor: palette.border }]}>
                  <Text style={[styles.topBoardLabel, { color: palette.textSecondary }]}>
                    🏆 TOP DU JOUR
                  </Text>
                  {dailyBoards[v.key].map((entry, i) => (
                    <View key={entry.userId} style={styles.topBoardRow}>
                      <Text style={[styles.topBoardRank, { color: palette.text }]}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                      </Text>
                      <Text style={[styles.topBoardName, { color: palette.text }]} numberOfLines={1}>
                        {entry.displayName}
                      </Text>
                      <Text style={[styles.topBoardScore, { color: '#10B981' }]}>
                        {entry.bestScore} pts
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Claim reward — idempotent côté serveur */}
              {dispo && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); claimReward(v.key); }}
                  style={[
                    styles.claimBtn,
                    rewards?.todaysVariants?.includes(v.key) && styles.claimBtnDone,
                  ]}
                >
                  <Text style={styles.claimBtnText}>
                    {rewards?.todaysVariants?.includes(v.key) ? '✓ Récompense réclamée' : '🎁 Réclamer la récompense'}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={[styles.note, { borderColor: palette.border }]}>
          <Ionicons name="information-circle" size={14} color={palette.textSecondary} />
          <Text style={[styles.noteText, { color: palette.textSecondary }]}>
            Le Daily Challenge change tous les jours à minuit UTC. Reviens demain
            pour un nouveau deal. Tes stats sont enregistrées comme toute autre partie.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1, borderRadius: 12,
  },
  heroTitle: { fontSize: 16, fontFamily: 'Inter-Black' },
  heroSub: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  rewardsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderRadius: 12,
  },
  rewardsStat: { alignItems: 'center', flex: 1 },
  rewardsValue: { color: '#FCD34D', fontSize: 16, fontFamily: 'Inter-Black' },
  rewardsLabel: { fontSize: 9, letterSpacing: 1, marginTop: 2, fontFamily: 'Inter-Black' },
  rewardsDivider: { width: 1, height: 32, backgroundColor: 'rgba(167,139,250,0.3)' },
  rewardsCta: { position: 'absolute', top: 4, right: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(124,58,237,0.4)', borderRadius: 6 },
  rewardsCtaText: { color: '#FCD34D', fontSize: 9, fontFamily: 'Inter-Black' },
  achievementsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: 'rgba(252,211,77,0.12)', borderWidth: 1, borderColor: 'rgba(252,211,77,0.35)',
  },
  achievementsBtnIcon: { fontSize: 18 },
  achievementsBtnText: { color: '#FCD34D', fontSize: 13, fontFamily: 'Inter-Bold', flex: 1 },
  achievementsBtnChevron: { color: '#FCD34D', fontSize: 22, fontWeight: '900' },
  variantCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
  topBoard: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, gap: 4 },
  topBoardLabel: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1, marginBottom: 4 },
  topBoardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBoardRank: { fontSize: 12, width: 18 },
  topBoardName: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular' },
  topBoardScore: { fontSize: 11, fontFamily: 'Inter-Black' },
  claimBtn: { marginTop: 10, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: '#7C3AED' },
  claimBtnDone: { backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 1, borderColor: '#10B981' },
  claimBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black' },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  variantIcon: { fontSize: 24 },
  variantName: { fontSize: 15, fontFamily: 'Inter-Black' },
  variantHash: { fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  note: {
    flexDirection: 'row', gap: 6,
    padding: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 10, fontFamily: 'Inter-Regular', lineHeight: 14 },
});
