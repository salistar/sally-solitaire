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
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const out: Record<string, api.DealSeed | null> = {};
      await Promise.all(VARIANTS.map(async (v) => {
        const d = await api.fetchDailyChallenge(v.key);
        out[v.key] = d;
      }));
      setDeals(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    markDailyReminderShown();
  }, [fetchAll]);

  const today = new Date().toLocaleDateString();

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
  variantCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
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
