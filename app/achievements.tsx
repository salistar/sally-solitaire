/**
 * @file achievements.tsx
 * @description Écran qui affiche tous les achievements (badges) avec leur
 * statut (débloqué / verrouillé) et la date de déblocage.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as Achievements from '../src/game/achievements';

const RARITY_COLOR: Record<string, string> = {
  common: '#9CA3AF',
  rare: '#0EA5E9',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export default function AchievementsScreen() {
  const { palette } = useTheme();
  const [all, setAll] = useState<Achievements.Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await Achievements.evaluateAchievements();
      setAll(r.all);
      setUnlocked(r.unlocked);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unlockedCount = Object.keys(unlocked).length;
  const total = all.length;
  const ratio = total === 0 ? 0 : unlockedCount / total;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Achievements" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.text} />}
      >
        <View style={[styles.summary, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="medal" size={28} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: palette.text }]}>
              {unlockedCount} / {total} débloqués
            </Text>
            <View style={[styles.progressBar, { backgroundColor: palette.border }]}>
              <View style={[styles.progressFill, {
                width: `${ratio * 100}%`,
                backgroundColor: ratio >= 1 ? '#F59E0B' :
                                 ratio >= 0.5 ? '#10B981' : '#0EA5E9',
              }]} />
            </View>
            <Text style={[styles.summaryHint, { color: palette.textSecondary }]}>
              {ratio >= 1 ? 'Tous les badges décrochés ! 🏆' :
               `${total - unlockedCount} badges à découvrir`}
            </Text>
          </View>
        </View>

        {all.map((a) => {
          const isUnlocked = !!unlocked[a.id];
          const color = RARITY_COLOR[a.rarity];
          return (
            <View
              key={a.id}
              style={[
                styles.card,
                {
                  backgroundColor: palette.card,
                  borderColor: isUnlocked ? color : palette.border,
                  opacity: isUnlocked ? 1 : 0.5,
                },
              ]}>
              <View style={[styles.iconBox, { backgroundColor: isUnlocked ? color : palette.border }]}>
                <Ionicons
                  name={(isUnlocked ? a.icon : 'lock-closed') as any}
                  size={20}
                  color="#fff"
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{a.title}</Text>
                  <View style={[styles.rarityBadge, { backgroundColor: color }]}>
                    <Text style={styles.rarityText}>{RARITY_LABEL[a.rarity]}</Text>
                  </View>
                </View>
                <Text style={[styles.cardDesc, { color: palette.textSecondary }]}>
                  {a.description}
                </Text>
                {isUnlocked ? (
                  <Text style={[styles.unlockedDate, { color: '#10B981' }]}>
                    ✓ Débloqué le {fmtDate(unlocked[a.id])}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  summary: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    padding: 14, borderWidth: 1, borderRadius: 12,
  },
  summaryTitle: { fontSize: 15, fontFamily: 'Inter-Black' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 3 },
  summaryHint: { fontSize: 11, fontFamily: 'Inter-Medium', marginTop: 4 },
  card: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    padding: 12, borderWidth: 1, borderRadius: 10,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTitle: { fontSize: 14, fontFamily: 'Inter-Black', flex: 1 },
  rarityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rarityText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Black' },
  cardDesc: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  unlockedDate: { fontSize: 10, fontFamily: 'Inter-Black', marginTop: 6 },
});
