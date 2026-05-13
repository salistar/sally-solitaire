/**
 * @file achievements-online.tsx
 * @description Server-side achievements gallery. Distinct from the local
 * achievements.tsx (which reads from a local file-stored stats system).
 * This one queries /solitaire-matches/achievements/* and reflects unlocks
 * triggered by race wins, daily completions, XP milestones, and purchases.
 *
 * Shows the full catalog grouped by category, with each badge marked as
 * 🔒 locked or unlocked (with timestamp + coins rewarded). Progress bar
 * shows total unlocked / total catalog.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../shared/api';

const CATEGORY_LABEL: Record<string, string> = {
  race: '⚔️ Race 1v1',
  daily: '☀️ Défi du jour',
  progression: '⭐ Progression',
  collection: '🛒 Collection',
};

const CATEGORY_ORDER = ['race', 'daily', 'progression', 'collection'];

export default function AchievementsOnlineScreen() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<api.AchievementDef[]>([]);
  const [user, setUser] = useState<api.UserAchievementsDto | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.getMe().catch(() => null);
      const [cat, u] = await Promise.all([
        api.fetchAchievementsCatalog(),
        me?.id ? api.fetchUserAchievements(me.id) : Promise.resolve(null),
      ]);
      setCatalog(cat);
      setUser(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const unlockedMap = useMemo(() => {
    const m: Record<string, { unlockedAt: number; coinsRewarded: number }> = {};
    for (const u of user?.unlocked ?? []) {
      m[u.achievementId] = { unlockedAt: u.unlockedAt, coinsRewarded: u.coinsRewarded };
    }
    return m;
  }, [user]);

  const grouped = useMemo(() => {
    const out: Record<string, api.AchievementDef[]> = {};
    for (const def of catalog) {
      if (!out[def.category]) out[def.category] = [];
      out[def.category].push(def);
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.order - b.order);
    return out;
  }, [catalog]);

  const totalUnlocked = user?.progress.unlocked ?? 0;
  const totalCatalog = user?.progress.total ?? catalog.length;
  const progressPercent = totalCatalog > 0 ? (totalUnlocked / totalCatalog) * 100 : 0;

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F172A', '#1E1B4B', '#0F172A']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Achievements</Text>
            <Text style={s.subtitle}>Badges & récompenses serveur</Text>
          </View>
        </View>

        <View style={s.progressCard}>
          <Text style={s.progressLabel}>
            {totalUnlocked} / {totalCatalog} débloqués
          </Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${progressPercent}%` as any }]} />
          </View>
          {user && user.totalCoinsFromAchievements > 0 && (
            <Text style={s.progressCoins}>🪙 {user.totalCoinsFromAchievements} coins gagnés via achievements</Text>
          )}
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#A78BFA" />}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {CATEGORY_ORDER.map((cat) => {
            const list = grouped[cat];
            if (!list || list.length === 0) return null;
            return (
              <View key={cat}>
                <Text style={s.sectionHeader}>{CATEGORY_LABEL[cat] ?? cat}</Text>
                {list.map((def) => {
                  const unlock = unlockedMap[def.id];
                  const isUnlocked = !!unlock;
                  return (
                    <View key={def.id} style={[s.card, isUnlocked && s.cardUnlocked]}>
                      <Text style={[s.cardIcon, !isUnlocked && s.cardIconLocked]}>
                        {isUnlocked ? def.icon : '🔒'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardName, !isUnlocked && s.cardNameLocked]}>{def.name}</Text>
                        <Text style={s.cardDesc} numberOfLines={2}>{def.description}</Text>
                        {isUnlocked && (
                          <Text style={s.cardUnlockedAt}>
                            Débloqué le {new Date(unlock.unlockedAt).toLocaleDateString()} · +{unlock.coinsRewarded}🪙
                          </Text>
                        )}
                      </View>
                      <View style={s.rewardBadge}>
                        <Text style={s.rewardBadgeText}>🪙 {def.coinsReward}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn: { padding: 6 },
  title: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black' },
  subtitle: { color: '#A78BFA', fontSize: 11, marginTop: 2 },

  progressCard: {
    marginHorizontal: 12, marginBottom: 10,
    padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  progressLabel: { color: '#FCD34D', fontSize: 13, fontFamily: 'Inter-Black', marginBottom: 6 },
  progressBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FCD34D' },
  progressCoins: { color: '#C4B5FD', fontSize: 11, marginTop: 6 },

  sectionHeader: { color: '#C4B5FD', fontSize: 12, letterSpacing: 1, fontFamily: 'Inter-Black', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginBottom: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(15,11,40,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardUnlocked: { borderColor: 'rgba(252,211,77,0.35)', backgroundColor: 'rgba(252,211,77,0.06)' },
  cardIcon: { fontSize: 28 },
  cardIconLocked: { opacity: 0.5 },
  cardName: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  cardNameLocked: { color: '#9CA3AF' },
  cardDesc: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  cardUnlockedAt: { color: '#10B981', fontSize: 10, marginTop: 4 },

  rewardBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(124,58,237,0.25)' },
  rewardBadgeText: { color: '#FCD34D', fontSize: 11, fontFamily: 'Inter-Black' },
});
