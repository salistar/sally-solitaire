/**
 * @file leaderboard.tsx
 * @description Top 100 joueurs par variante de solitaire.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as api from '../shared/api';

const VARIANTS = [
  'klondike-1', 'klondike-3', 'spider-1', 'spider-2', 'spider-4',
  'freecell', 'yukon', 'golf', 'pyramid', 'tripeaks', 'forty-thieves', 'accordion',
];

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}`;
}

export default function LeaderboardScreen() {
  const { palette } = useTheme();
  const [variant, setVariant] = useState('klondike-1');
  const [sort, setSort] = useState<api.LeaderboardSort>('score');
  const [entries, setEntries] = useState<api.LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchSolitaireLeaderboard(variant, 100, sort);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [variant, sort]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Leaderboard" showBack />

      {/* Sélecteur variante */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.variantBar}>
        {VARIANTS.map((v) => (
          <TouchableOpacity key={v} onPress={() => setVariant(v)}
            style={[styles.variantChip, {
              backgroundColor: variant === v ? '#0EA5E9' : palette.border,
            }]}>
            <Text style={[styles.variantChipText, {
              color: variant === v ? '#fff' : palette.text,
            }]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sélecteur tri */}
      <View style={styles.sortBar}>
        {([
          { key: 'score', label: '🏆 Score', icon: 'trophy' },
          { key: 'time', label: '⏱️ Temps', icon: 'stopwatch' },
          { key: 'moves', label: '👣 Coups', icon: 'footsteps' },
        ] as { key: api.LeaderboardSort; label: string; icon: any }[]).map((s) => (
          <TouchableOpacity key={s.key} onPress={() => setSort(s.key)}
            style={[styles.sortChip, {
              backgroundColor: sort === s.key ? '#10B981' : palette.border,
            }]}>
            <Text style={[styles.sortChipText, {
              color: sort === s.key ? '#fff' : palette.text,
            }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.text} />}
      >
        {entries.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: palette.border }]}>
            <Ionicons name="trophy" size={48} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              Pas encore de scores pour {variant}.
              Joue et gagne pour apparaître ici !
            </Text>
          </View>
        ) : (
          entries.map((e) => {
            const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : '';
            return (
              <View
                key={e.userId}
                style={[styles.row, {
                  backgroundColor: palette.card,
                  borderColor: e.rank <= 3 ? '#F59E0B' : palette.border,
                  borderWidth: e.rank <= 3 ? 2 : 1,
                }]}>
                <Text style={[styles.rank, { color: palette.text }]}>
                  {medal || `#${e.rank}`}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: palette.text }]}>{e.displayName}</Text>
                  <Text style={[styles.subStats, { color: palette.textSecondary }]}>
                    {e.totalWins} victoire{e.totalWins > 1 ? 's' : ''} · best {e.bestMoves}c · {fmtDuration(e.bestDurationMs)}
                  </Text>
                </View>
                <View style={styles.scoreCol}>
                  <Text style={[styles.score, { color: palette.text }]}>{e.bestScore}</Text>
                  <Text style={[styles.scoreLabel, { color: palette.textSecondary }]}>pts</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  variantBar: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  variantChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 4,
  },
  variantChipText: { fontSize: 11, fontFamily: 'Inter-Black' },
  sortBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8,
  },
  sortChip: {
    flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center',
  },
  sortChipText: { fontSize: 11, fontFamily: 'Inter-Black' },
  content: { padding: 16, gap: 6 },
  emptyBox: {
    alignItems: 'center', gap: 12, padding: 30,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  row: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    padding: 12, borderRadius: 8,
  },
  rank: { width: 36, textAlign: 'center', fontSize: 14, fontFamily: 'Inter-Black' },
  name: { fontSize: 14, fontFamily: 'Inter-Black' },
  subStats: { fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
  scoreCol: { alignItems: 'flex-end' },
  score: { fontSize: 18, fontFamily: 'Inter-Black' },
  scoreLabel: { fontSize: 9, fontFamily: 'Inter-Medium', opacity: 0.7 },
});
