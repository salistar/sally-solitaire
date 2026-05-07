/**
 * @file debug-bd.tsx
 * @description Debug screen pour visualiser l'état des seed deals en BD.
 * Affiche par variante : compte total + couverture solution non-vide (%).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as api from '../shared/api';

const VARIANTS_ORDER = [
  'klondike-1', 'klondike-3', 'klondike-vegas',
  'spider-1', 'spider-2', 'spider-4',
  'freecell', 'yukon', 'golf', 'pyramid', 'tripeaks',
  'forty-thieves', 'accordion',
];

const TARGET_PER_VARIANT = 100;

/**
 * Mini-graphique en barres à partir d'une série de points (du + récent au + vieux).
 * Hauteur fixe, max scaled, vertical bars en flex.
 */
function HistorySparkline({ points, palette }: {
  points: api.SeedHistoryPoint[]; palette: any;
}) {
  if (!points || points.length === 0) {
    return (
      <View style={[styles.sparkContainer, { borderColor: palette.border }]}>
        <Text style={[styles.sparkEmpty, { color: palette.textSecondary }]}>
          Pas encore d'historique — au moins 1 snapshot après le startup ou 1h après.
        </Text>
      </View>
    );
  }
  // Inverser (oldest → newest) pour lecture gauche → droite
  const series = [...points].reverse();
  const max = Math.max(...series.map((p) => p.grandTotal), 1);
  return (
    <View style={[styles.sparkContainer, { borderColor: palette.border, backgroundColor: palette.card }]}>
      <View style={styles.sparkHeader}>
        <Text style={[styles.sparkTitle, { color: palette.text }]}>Évolution BD</Text>
        <Text style={[styles.sparkRange, { color: palette.textSecondary }]}>
          {series.length} pts — max {max}
        </Text>
      </View>
      <View style={styles.sparkBars}>
        {series.map((p, i) => {
          const h = Math.max(2, Math.round((p.grandTotal / max) * 60));
          const hSol = Math.max(0, Math.round((p.grandWithSolution / max) * 60));
          return (
            <View key={i} style={styles.sparkBarStack}>
              <View style={[styles.sparkBarBg, { height: h, backgroundColor: '#0EA5E9' }]} />
              <View style={[styles.sparkBarFg, { height: hSol, backgroundColor: '#10B981' }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.sparkLegend}>
        <View style={styles.sparkLegendItem}>
          <View style={[styles.sparkDot, { backgroundColor: '#0EA5E9' }]} />
          <Text style={[styles.sparkLegendText, { color: palette.textSecondary }]}>Total</Text>
        </View>
        <View style={styles.sparkLegendItem}>
          <View style={[styles.sparkDot, { backgroundColor: '#10B981' }]} />
          <Text style={[styles.sparkLegendText, { color: palette.textSecondary }]}>Avec solution</Text>
        </View>
      </View>
    </View>
  );
}

function VariantRow({ variant, total, withSolution, coverage, palette }: {
  variant: string; total: number; withSolution: number; coverage: number; palette: any;
}) {
  const ratio = Math.min(1, total / TARGET_PER_VARIANT);
  const fillColor = total >= TARGET_PER_VARIANT ? '#10B981'
    : total >= TARGET_PER_VARIANT / 2 ? '#F59E0B' : '#EF4444';
  const solColor = coverage >= 80 ? '#10B981'
    : coverage >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      <View style={styles.rowHeader}>
        <Text style={[styles.variantName, { color: palette.text }]}>{variant}</Text>
        <Text style={[styles.count, { color: palette.textSecondary }]}>
          {total}/{TARGET_PER_VARIANT}
        </Text>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.bar, { backgroundColor: palette.border }]}>
          <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: fillColor }]} />
        </View>
      </View>
      <View style={styles.solRow}>
        <Ionicons name="bulb-outline" size={12} color={solColor} />
        <Text style={[styles.solText, { color: solColor }]}>
          {withSolution}/{total} solutions ({coverage.toFixed(0)}%)
        </Text>
      </View>
    </View>
  );
}

export default function DebugBdScreen() {
  const { palette } = useTheme();
  const [stats, setStats] = useState<api.DealSeedStats | null>(null);
  const [seeding, setSeeding] = useState<api.SeedingStatus | null>(null);
  const [history, setHistory] = useState<api.SeedHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, st, hi] = await Promise.all([
        api.fetchDealSeedStats(),
        api.fetchSeedingStatus(),
        api.fetchSeedingHistory(50),
      ]);
      if (!s) {
        setError('BD inaccessible — backend offline ?');
        setStats(null);
      } else {
        setStats(s);
      }
      setSeeding(st);
      setHistory(hi);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh toutes les 3s tant que seeding running
  useEffect(() => {
    if (seeding?.status !== 'running') return;
    const timer = setInterval(fetchAll, 3000);
    return () => clearInterval(timer);
  }, [seeding?.status, fetchAll]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="BD Status (Debug)" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={palette.text} />}
      >
        <View style={[styles.summary, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.summaryRow}>
            <Ionicons name="library" size={18} color={palette.text} />
            <Text style={[styles.summaryLabel, { color: palette.text }]}>Total seeds</Text>
            <Text style={[styles.summaryValue, { color: palette.text }]}>
              {stats?.grandTotal ?? '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="bulb" size={18} color="#10B981" />
            <Text style={[styles.summaryLabel, { color: palette.text }]}>Avec solution</Text>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>
              {stats?.grandWithSolution ?? '—'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="speedometer" size={18} color="#0EA5E9" />
            <Text style={[styles.summaryLabel, { color: palette.text }]}>Cible</Text>
            <Text style={[styles.summaryValue, { color: '#0EA5E9' }]}>
              {VARIANTS_ORDER.length * TARGET_PER_VARIANT}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBox, { borderColor: '#EF4444' }]}>
            <Ionicons name="warning" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {seeding && seeding.status !== 'idle' ? (
          <View style={[styles.seedingBox, {
            borderColor: seeding.status === 'running' ? '#0EA5E9' :
                         seeding.status === 'done' ? '#10B981' : '#EF4444',
            backgroundColor: seeding.status === 'running' ? 'rgba(14,165,233,0.10)' :
                             seeding.status === 'done' ? 'rgba(16,185,129,0.10)' :
                             'rgba(239,68,68,0.10)',
          }]}>
            <Ionicons
              name={seeding.status === 'running' ? 'sync' :
                    seeding.status === 'done' ? 'checkmark-circle' : 'warning'}
              size={16}
              color={seeding.status === 'running' ? '#0EA5E9' :
                     seeding.status === 'done' ? '#10B981' : '#EF4444'} />
            <Text style={[styles.seedingText, { color: palette.text }]}>
              {seeding.status === 'running'
                ? `Génération en cours… ${seeding.totalGenerated} générés`
                : seeding.status === 'done'
                ? `Génération terminée — ${seeding.totalGenerated} insérés`
                : `Erreur : ${seeding.error}`}
            </Text>
          </View>
        ) : null}

        <View style={[styles.list, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {VARIANTS_ORDER.map((v) => {
            const total = stats?.total[v] ?? 0;
            const ws = stats?.withSolution[v] ?? 0;
            const cov = stats?.coverage[v] ?? 0;
            return (
              <VariantRow key={v} variant={v} total={total} withSolution={ws} coverage={cov} palette={palette} />
            );
          })}
        </View>

        <HistorySparkline points={history} palette={palette} />

        <TouchableOpacity onPress={fetchAll} style={[styles.refreshBtn, { backgroundColor: '#0EA5E9' }]}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.refreshText}>Actualiser</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  summary: {
    flexDirection: 'row', justifyContent: 'space-around',
    padding: 14, borderRadius: 12, borderWidth: 1, gap: 12,
  },
  summaryRow: { alignItems: 'center', gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: 'Inter-Medium', opacity: 0.7 },
  summaryValue: { fontSize: 18, fontFamily: 'Inter-Black' },
  errorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  errorText: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  seedingBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
  },
  seedingText: { fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  list: {
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  row: {
    padding: 12, borderBottomWidth: 1, gap: 6,
  },
  rowHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  variantName: { fontSize: 14, fontFamily: 'Inter-Black' },
  count: { fontSize: 12, fontFamily: 'Inter-Medium' },
  barContainer: {},
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  solRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  solText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 12, borderRadius: 8, marginTop: 8,
  },
  refreshText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
  sparkContainer: {
    borderWidth: 1, borderRadius: 12, padding: 12, gap: 6,
  },
  sparkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sparkTitle: { fontSize: 13, fontFamily: 'Inter-Black' },
  sparkRange: { fontSize: 10, fontFamily: 'Inter-Medium', opacity: 0.7 },
  sparkBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 64 },
  sparkBarStack: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end', position: 'relative', minWidth: 2 },
  sparkBarBg: { width: '100%', borderTopLeftRadius: 1, borderTopRightRadius: 1, opacity: 0.5 },
  sparkBarFg: { width: '100%', position: 'absolute', bottom: 0, borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  sparkLegend: { flexDirection: 'row', gap: 12, marginTop: 4 },
  sparkLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sparkDot: { width: 8, height: 8, borderRadius: 4 },
  sparkLegendText: { fontSize: 10, fontFamily: 'Inter-Medium' },
  sparkEmpty: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'center', opacity: 0.6, padding: 20 },
});
