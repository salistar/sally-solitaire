/**
 * @file replays.tsx
 * @description Écran "Mes Replays" : liste les victoires sauvegardées
 * localement, expose des stats par variante, et permet l'export JSON
 * (presse-papier — copie complète des replays).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/contexts/AppProviders';
import * as Replays from '../src/game/replays';

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const day = d.toLocaleDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

export default function ReplaysScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const [replays, setReplays] = useState<Replays.Replay[]>([]);
  const [stats, setStats] = useState<Record<string, { count: number; minMoves: number; avgMoves: number; minDurationMs: number }>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await Replays.listAllReplays();
      setReplays(all);
      const s = await Replays.getReplayStats();
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const exportAll = useCallback(async () => {
    const json = JSON.stringify({
      exportedAt: new Date().toISOString(),
      count: replays.length,
      replays,
    }, null, 2);
    await Clipboard.setStringAsync(json);
    Alert.alert('Exporté ✅', `${replays.length} replays copiés dans le presse-papier (${(json.length / 1024).toFixed(1)} KB).`);
  }, [replays]);

  const exportOne = useCallback(async (r: Replays.Replay) => {
    const json = JSON.stringify(r, null, 2);
    await Clipboard.setStringAsync(json);
    Alert.alert('Exporté ✅', `Replay ${r.variantKey} copié.`);
  }, []);

  const deleteOne = useCallback(async (r: Replays.Replay) => {
    Alert.alert('Supprimer ?', `Replay ${r.variantKey} du ${fmtDate(r.wonAt)}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await Replays.deleteReplay(r.variantKey, r.id);
          await refresh();
        },
      },
    ]);
  }, [refresh]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Mes Victoires" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.text} />}
      >
        <View style={[styles.summaryCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="trophy" size={22} color="#F59E0B" />
          <Text style={[styles.summaryText, { color: palette.text }]}>
            {replays.length} victoires sauvegardées
          </Text>
          {replays.length > 0 ? (
            <TouchableOpacity onPress={exportAll}
              style={[styles.exportAllBtn, { backgroundColor: '#0EA5E9' }]}>
              <Ionicons name="copy" size={14} color="#fff" />
              <Text style={styles.exportAllText}>Exporter tout</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {Object.keys(stats).length > 0 ? (
          <View style={[styles.statsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.statsTitle, { color: palette.text }]}>Stats par variante</Text>
            {Object.entries(stats).map(([k, v]) => (
              <View key={k} style={[styles.statsRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.statsVariant, { color: palette.text }]}>{k}</Text>
                <View style={styles.statsValues}>
                  <Text style={[styles.statsValue, { color: palette.textSecondary }]}>
                    {v.count}× • min {v.minMoves} coups • {fmtDuration(v.minDurationMs)} record
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {replays.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: palette.border }]}>
            <Ionicons name="hourglass" size={48} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              Aucune victoire sauvegardée. Joue et gagne pour remplir la liste.
            </Text>
          </View>
        ) : (
          replays.map((r) => (
            <View key={r.id} style={[styles.replayCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.replayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replayVariant, { color: palette.text }]}>{r.variantKey}</Text>
                  <Text style={[styles.replayDate, { color: palette.textSecondary }]}>
                    {fmtDate(r.wonAt)} • {r.difficulty}
                  </Text>
                </View>
                <View style={styles.replayStats}>
                  <Text style={[styles.replayValue, { color: palette.text }]}>{r.moves}c</Text>
                  <Text style={[styles.replayValue, { color: palette.text }]}>{fmtDuration(r.durationMs)}</Text>
                </View>
              </View>
              <View style={styles.replayActions}>
                {r.actions && r.actions.length > 0 ? (
                  <TouchableOpacity onPress={() => router.push(`/replay/${r.id}`)} style={styles.replayBtn}>
                    <Ionicons name="play" size={12} color="#10B981" />
                    <Text style={[styles.replayBtnText, { color: '#10B981' }]}>Rejouer</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => exportOne(r)} style={styles.replayBtn}>
                  <Ionicons name="copy" size={12} color="#0EA5E9" />
                  <Text style={[styles.replayBtnText, { color: '#0EA5E9' }]}>JSON</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteOne(r)} style={styles.replayBtn}>
                  <Ionicons name="trash" size={12} color="#EF4444" />
                  <Text style={[styles.replayBtnText, { color: '#EF4444' }]}>Suppr</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderWidth: 1, borderRadius: 12,
  },
  summaryText: { flex: 1, fontSize: 14, fontFamily: 'Inter-Black' },
  exportAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  exportAllText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },
  statsCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  statsTitle: { fontSize: 13, fontFamily: 'Inter-Black', padding: 12 },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 10, borderTopWidth: 1,
  },
  statsVariant: { fontSize: 12, fontFamily: 'Inter-Black' },
  statsValues: { flex: 1, alignItems: 'flex-end' },
  statsValue: { fontSize: 11, fontFamily: 'Inter-Medium' },
  emptyBox: {
    alignItems: 'center', gap: 12, padding: 30,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  replayCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  replayRow: { flexDirection: 'row', alignItems: 'center' },
  replayVariant: { fontSize: 14, fontFamily: 'Inter-Black' },
  replayDate: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  replayStats: { gap: 2, alignItems: 'flex-end' },
  replayValue: { fontSize: 12, fontFamily: 'Inter-Black' },
  replayActions: { flexDirection: 'row', gap: 8 },
  replayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  replayBtnText: { fontSize: 10, fontFamily: 'Inter-Black' },
});
