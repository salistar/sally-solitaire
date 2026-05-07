/**
 * @file profile.tsx
 * @description Profil utilisateur — stats agrégées par variante + progression
 * achievements. Combine les replays locaux (victoires) avec une vue globale.
 *
 * Sources :
 *  - Replays AsyncStorage : nb victoires, meilleur score/temps/coups par variante
 *  - Achievements : badges débloqués
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as Replays from '../src/game/replays';
import * as Achievements from '../src/game/achievements';
import * as Elo from '../src/game/solitaire-elo';

const VARIANTS_GROUPS: { key: string; label: string; matcher: (v: string) => boolean }[] = [
  { key: 'klondike', label: 'Klondike', matcher: (v) => v.startsWith('klondike') },
  { key: 'spider', label: 'Spider', matcher: (v) => v.startsWith('spider') },
  { key: 'freecell', label: 'FreeCell', matcher: (v) => v === 'freecell' },
  { key: 'yukon', label: 'Yukon', matcher: (v) => v === 'yukon' },
  { key: 'golf', label: 'Golf', matcher: (v) => v === 'golf' },
  { key: 'pyramid', label: 'Pyramid', matcher: (v) => v === 'pyramid' },
  { key: 'tripeaks', label: 'TriPeaks', matcher: (v) => v === 'tripeaks' },
  { key: 'forty-thieves', label: 'Forty Thieves', matcher: (v) => v === 'forty-thieves' },
  { key: 'accordion', label: 'Accordion', matcher: (v) => v === 'accordion' },
];

function fmtDuration(ms: number): string {
  if (ms === 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}`;
}

interface VariantStats {
  wins: number;
  bestMoves: number;
  bestScore: number;
  bestDurationMs: number;
  totalDurationMs: number;
}

export default function ProfileScreen() {
  const { palette } = useTheme();
  const [replays, setReplays] = useState<Replays.Replay[]>([]);
  const [unlocked, setUnlocked] = useState<Record<string, number>>({});
  const [totalAch, setTotalAch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [globalElo, setGlobalElo] = useState(1000);
  const [eloMap, setEloMap] = useState<Record<string, Elo.VariantElo>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await Replays.listAllReplays();
      setReplays(all);
      const a = await Achievements.evaluateAchievements();
      setUnlocked(a.unlocked);
      setTotalAch(a.all.length);
      const elo = await Elo.computeEloByVariant();
      setEloMap(elo);
      const g = await Elo.computeGlobalElo();
      setGlobalElo(g);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Calcul stats par groupe
  const groupStats: Record<string, VariantStats> = {};
  for (const g of VARIANTS_GROUPS) {
    const inGroup = replays.filter((r) => g.matcher(r.variantKey));
    if (inGroup.length === 0) continue;
    let bestMoves = Infinity, bestScore = -Infinity, bestDur = Infinity, totalDur = 0;
    for (const r of inGroup) {
      if (r.moves > 0 && r.moves < bestMoves) bestMoves = r.moves;
      if (r.score > bestScore) bestScore = r.score;
      if (r.durationMs > 0 && r.durationMs < bestDur) bestDur = r.durationMs;
      totalDur += r.durationMs;
    }
    groupStats[g.key] = {
      wins: inGroup.length,
      bestMoves: bestMoves === Infinity ? 0 : bestMoves,
      bestScore: bestScore === -Infinity ? 0 : bestScore,
      bestDurationMs: bestDur === Infinity ? 0 : bestDur,
      totalDurationMs: totalDur,
    };
  }

  const totalWins = replays.length;
  const totalDurationMs = replays.reduce((a, r) => a + r.durationMs, 0);
  const variantsPlayed = Object.keys(groupStats).length;
  const hardWins = replays.filter((r) => r.difficulty === 'hard').length;
  const unlockedCount = Object.keys(unlocked).length;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Profil" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.text} />}
      >
        {/* Top stats */}
        <View style={[styles.topStats, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.topStatBox}>
            <Ionicons name="trophy" size={22} color="#F59E0B" />
            <Text style={[styles.topStatValue, { color: palette.text }]}>{totalWins}</Text>
            <Text style={[styles.topStatLabel, { color: palette.textSecondary }]}>Victoires</Text>
          </View>
          <View style={styles.topStatBox}>
            <Ionicons name="apps" size={22} color="#0EA5E9" />
            <Text style={[styles.topStatValue, { color: palette.text }]}>{variantsPlayed}/9</Text>
            <Text style={[styles.topStatLabel, { color: palette.textSecondary }]}>Variantes</Text>
          </View>
          <View style={styles.topStatBox}>
            <Ionicons name="shield" size={22} color="#EF4444" />
            <Text style={[styles.topStatValue, { color: palette.text }]}>{hardWins}</Text>
            <Text style={[styles.topStatLabel, { color: palette.textSecondary }]}>Hard</Text>
          </View>
          <View style={styles.topStatBox}>
            <Ionicons name="medal" size={22} color="#A855F7" />
            <Text style={[styles.topStatValue, { color: palette.text }]}>{unlockedCount}/{totalAch}</Text>
            <Text style={[styles.topStatLabel, { color: palette.textSecondary }]}>Badges</Text>
          </View>
        </View>

        <View style={[styles.totalTimeCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="time" size={18} color={palette.textSecondary} />
          <Text style={[styles.totalTimeText, { color: palette.text }]}>
            Temps total joué : {fmtDuration(totalDurationMs)}
          </Text>
        </View>

        {/* ELO global + tier */}
        {(() => {
          const r = Elo.rankFromElo(globalElo);
          return (
            <View style={[styles.eloCard, { backgroundColor: palette.card, borderColor: r.color, borderWidth: 2 }]}>
              <Text style={styles.eloEmoji}>{r.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eloTier, { color: r.color }]}>{r.tier}</Text>
                <Text style={[styles.eloValue, { color: palette.text }]}>{globalElo} ELO</Text>
                <Text style={[styles.eloHint, { color: palette.textSecondary }]}>
                  Calculé par variante depuis tes victoires (difficulté × bonus)
                </Text>
              </View>
            </View>
          );
        })()}

        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Par variante</Text>

        {VARIANTS_GROUPS.map((g) => {
          const s = groupStats[g.key];
          if (!s) {
            return (
              <View key={g.key} style={[styles.variantCard, { backgroundColor: palette.card, borderColor: palette.border, opacity: 0.4 }]}>
                <View style={styles.variantHeader}>
                  <Text style={[styles.variantName, { color: palette.text }]}>{g.label}</Text>
                  <Text style={[styles.variantHint, { color: palette.textSecondary }]}>Aucune victoire</Text>
                </View>
              </View>
            );
          }
          const variantElo = eloMap[g.key];
          return (
            <View key={g.key} style={[styles.variantCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.variantHeader}>
                <Text style={[styles.variantName, { color: palette.text }]}>{g.label}</Text>
                {variantElo && variantElo.wins > 0 ? (
                  <Text style={[styles.eloChip, { color: Elo.rankFromElo(variantElo.elo).color }]}>
                    {variantElo.elo} ELO
                  </Text>
                ) : null}
                <Text style={[styles.variantBadge, { backgroundColor: '#10B981' }]}>{s.wins}× ✓</Text>
              </View>
              <View style={styles.variantStats}>
                <View style={styles.statCol}>
                  <Text style={[styles.statKey, { color: palette.textSecondary }]}>Best coups</Text>
                  <Text style={[styles.statVal, { color: palette.text }]}>{s.bestMoves}</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={[styles.statKey, { color: palette.textSecondary }]}>Best score</Text>
                  <Text style={[styles.statVal, { color: palette.text }]}>{s.bestScore}</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={[styles.statKey, { color: palette.textSecondary }]}>Best temps</Text>
                  <Text style={[styles.statVal, { color: palette.text }]}>{fmtDuration(s.bestDurationMs)}</Text>
                </View>
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
  topStats: {
    flexDirection: 'row', justifyContent: 'space-around',
    padding: 14, borderWidth: 1, borderRadius: 12, gap: 8,
  },
  topStatBox: { alignItems: 'center', flex: 1, gap: 2 },
  topStatValue: { fontSize: 18, fontFamily: 'Inter-Black' },
  topStatLabel: { fontSize: 10, fontFamily: 'Inter-Medium', opacity: 0.7 },
  totalTimeCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
  },
  totalTimeText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  eloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12,
  },
  eloEmoji: { fontSize: 32 },
  eloTier: { fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 1 },
  eloValue: { fontSize: 20, fontFamily: 'Inter-Black', marginTop: 2 },
  eloHint: { fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 4 },
  eloChip: { fontSize: 10, fontFamily: 'Inter-Black' },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-Black', letterSpacing: 1, marginTop: 4 },
  variantCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  variantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variantName: { fontSize: 14, fontFamily: 'Inter-Black' },
  variantHint: { fontSize: 11, fontFamily: 'Inter-Regular', fontStyle: 'italic' },
  variantBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', overflow: 'hidden',
  },
  variantStats: { flexDirection: 'row', gap: 12 },
  statCol: { flex: 1 },
  statKey: { fontSize: 9, fontFamily: 'Inter-Medium', opacity: 0.7 },
  statVal: { fontSize: 14, fontFamily: 'Inter-Black' },
});
