/**
 * @file leaderboard-race.tsx
 * @description Race ELO leaderboard — top players by ELO rating from
 * the 1v1 race mode. Distinct from the per-variant SCORE leaderboard
 * (which uses /solitaire-matches/leaderboard/:variant — that ranks solo
 * runs by score/time/moves). This one queries /solitaire-matches/race-leaderboard
 * and exposes the global aggregate plus per-variant rankings.
 *
 * UX:
 *   - Top bar: variant picker (Global + alphabetical list of 177 playable variants)
 *   - Pull-to-refresh
 *   - Per row: rank • displayName • ELO • W-L • winRate%
 *   - "You" row highlighted if current user is in top N
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as api from '../shared/api';
import { AVAILABLE_VARIANTS } from '../src/game/variants';

const PAGE_SIZE = 50;

export default function LeaderboardRaceScreen() {
  const router = useRouter();
  const [variant, setVariant] = useState<string>('global');
  const [entries, setEntries] = useState<api.RaceEloEntry[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const variantOptions = useMemo(() => {
    return [
      { key: 'global', label: '🌍 Global (toutes variantes)' },
      ...AVAILABLE_VARIANTS.map((v) => ({ key: v.key, label: v.name })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    ];
  }, []);

  const variantLabel = variantOptions.find((o) => o.key === variant)?.label ?? variant;

  // Hydrate userId (so we can highlight "you" in the list)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await api.getMe().catch(() => null);
      if (!cancelled && me?.id) setMeId(me.id);
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await api.fetchRaceLeaderboard(variant, PAGE_SIZE);
    setEntries(rows);
    setLoading(false);
  }, [variant]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0F172A', '#1E1B4B', '#0F172A']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Classement ELO</Text>
            <Text style={styles.subtitle}>Race 1v1 — top {PAGE_SIZE}</Text>
          </View>
        </View>

        {/* Variant picker */}
        <TouchableOpacity style={styles.variantPicker} onPress={() => setPickerOpen(true)}>
          <Text style={styles.variantPickerText} numberOfLines={1}>{variantLabel}</Text>
          <Ionicons name="chevron-down" size={18} color="#A78BFA" />
        </TouchableOpacity>

        {/* List */}
        {loading && entries.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#A78BFA" />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Aucun classement encore pour cette variante.</Text>
            <Text style={styles.emptySub}>Joue ta première partie 1v1 pour apparaître ici.</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => `${item.userId}-${item.variant}`}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A78BFA" />}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => router.push(`/user/${item.userId}`)}
                activeOpacity={0.85}
                style={[styles.row, item.userId === meId && styles.rowMe]}
              >
                <Text style={[styles.rank, index === 0 && styles.rankGold, index === 1 && styles.rankSilver, index === 2 && styles.rankBronze]}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.displayName}
                    {item.userId === meId && <Text style={styles.meTag}> (toi)</Text>}
                  </Text>
                  <Text style={styles.stats}>
                    {item.wins}V · {item.losses}D · {Math.round(item.winRate * 100)}%
                  </Text>
                </View>
                <View style={styles.eloBox}>
                  <Text style={styles.eloVal}>{item.elo}</Text>
                  <Text style={styles.eloLabel}>ELO</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#A78BFA" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>

      {/* Variant picker modal */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choisis une variante</Text>
            <ScrollView>
              {variantOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.modalRow, variant === opt.key && styles.modalRowSelected]}
                  onPress={() => { setVariant(opt.key); setPickerOpen(false); }}
                >
                  <Text style={[styles.modalRowText, variant === opt.key && { color: '#FCD34D' }]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {variant === opt.key && <Ionicons name="checkmark" size={18} color="#FCD34D" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn: { padding: 6 },
  title: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black' },
  subtitle: { color: '#A78BFA', fontSize: 11, letterSpacing: 1, marginTop: 2 },

  variantPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  variantPickerText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold', flex: 1 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Bold', marginBottom: 8 },
  emptySub: { color: '#9CA3AF', fontSize: 12, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(15,11,40,0.6)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMe: { borderColor: '#FCD34D', borderWidth: 2, backgroundColor: 'rgba(252,211,77,0.06)' },
  rank: { width: 38, fontSize: 14, color: '#A78BFA', fontFamily: 'Inter-Black', textAlign: 'center' },
  rankGold: { color: '#FCD34D' },
  rankSilver: { color: '#D1D5DB' },
  rankBronze: { color: '#F59E0B' },
  name: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  meTag: { color: '#FCD34D', fontSize: 12, fontWeight: '900' },
  stats: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  eloBox: { alignItems: 'flex-end', minWidth: 60 },
  eloVal: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black' },
  eloLabel: { color: '#7C3AED', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, maxHeight: '70%', backgroundColor: '#1E1B4B', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  modalTitle: { color: '#FCD34D', fontSize: 16, fontFamily: 'Inter-Black', marginBottom: 12 },
  modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6 },
  modalRowSelected: { backgroundColor: 'rgba(124,58,237,0.25)' },
  modalRowText: { color: '#E9D5FF', fontSize: 14, flex: 1 },
});
