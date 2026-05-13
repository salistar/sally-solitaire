/**
 * @file race-history.tsx
 * @description "Mes races" — historique des matches 1v1 du joueur courant.
 * Liste compacte triée du plus récent au plus ancien, avec score, adversaire,
 * variante, et résultat. Tap → ouvre le replay viewer `/race-replay/:code`.
 *
 * Pas de stats agrégées (W/L counters, ELO) — l'écran `leaderboard-race` gère
 * déjà ce rôle. Ici on se concentre sur la chronologie navigable, ce qui
 * complète la boucle "joue → finis → revois ta partie".
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as api from '../shared/api';

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  waiting:  { color: '#FCD34D', bg: 'rgba(252,211,77,0.15)' },
  playing:  { color: '#0EA5E9', bg: 'rgba(14,165,233,0.15)' },
  finished: { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
};

export default function RaceHistoryScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation('screens');
  const statusLabel: Record<string, string> = {
    waiting: t('tournaments.statusRegistration'),
    playing: t('tournaments.statusPlaying'),
    finished: t('tournaments.statusFinished'),
  };
  const formatRelative = (ms: number | null): string => {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return t('relTime.now');
    if (min < 60) return t('relTime.minAgo', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t('relTime.hAgo', { n: h });
    const d = Math.floor(h / 24);
    if (d < 7) return t('relTime.dAgo', { n: d });
    return new Date(ms).toLocaleDateString();
  };
  const [items, setItems] = useState<api.RaceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await api.getMe().catch(() => null);
      if (!user?.id) {
        setItems([]);
        return;
      }
      setMe({ id: user.id, username: user.username });
      const list = await api.fetchMyRaces(user.id, { limit: 50 });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={t('raceHistory.title')} subtitle={t('raceHistory.subtitle')} showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.text} />}
      >
        {!me && !loading && (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Ionicons name="log-in-outline" size={32} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.text }]}>
              {t('raceHistory.emptyLogin')}
            </Text>
          </View>
        )}

        {me && items.length === 0 && !loading && (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Ionicons name="game-controller-outline" size={32} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.text }]}>
              {t('raceHistory.emptyNone')}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/quick-match')}
              style={[styles.ctaBtn, { backgroundColor: '#7C3AED' }]}
            >
              <Text style={styles.ctaBtnText}>{t('raceHistory.emptyCta')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {items.map((m) => {
          const color = STATUS_COLOR[m.status] ?? STATUS_COLOR.finished;
          const isWin = m.youWon === true;
          const isLoss = m.youWon === false;
          const tint = isWin ? '#10B981' : isLoss ? '#EF4444' : palette.textSecondary;
          const resultLabel = m.status !== 'finished'
            ? t('raceHistory.resultPending')
            : isWin ? t('raceHistory.resultWin') : isLoss ? t('raceHistory.resultLoss') : t('raceHistory.resultPending');
          return (
            <TouchableOpacity
              key={m.code}
              onPress={() => router.push(`/race-replay/${m.code}`)}
              style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}
              activeOpacity={0.85}
            >
              <View style={styles.rowTop}>
                <View style={[styles.statusBadge, { backgroundColor: color.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: color.color }]}>
                    {statusLabel[m.status] ?? m.status}
                  </Text>
                </View>
                {m.flagged && (
                  <View style={[styles.statusBadge, { backgroundColor: 'rgba(239,68,68,0.18)' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>{t('raceHistory.contested')}</Text>
                  </View>
                )}
                <Text style={[styles.variant, { color: palette.text }]} numberOfLines={1}>
                  {m.variant}
                </Text>
                <Text style={[styles.relTime, { color: palette.textSecondary }]}>
                  {formatRelative(m.finishedAt ?? m.startedAt ?? Date.parse(m.createdAt))}
                </Text>
              </View>

              <View style={styles.rowBody}>
                <View style={{ flex: 1 }}>
                  {m.opponentUserId ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        router.push(`/user/${m.opponentUserId}`);
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[styles.opponent, { color: '#0EA5E9' }]} numberOfLines={1}>
                        {t('raceHistory.vs', { name: m.opponentDisplayName ?? m.opponentUserId.slice(0, 8) })} ›
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.opponent, { color: palette.text }]} numberOfLines={1}>
                      {t('raceHistory.vsWaiting')}
                    </Text>
                  )}
                  <Text style={[styles.statsLine, { color: palette.textSecondary }]}>
                    {t('raceHistory.selfLine', { score: m.selfScore, moves: m.selfMoves })}
                    {m.opponentScore != null
                      ? ` · ${t('raceHistory.oppLine', { score: m.opponentScore, moves: m.opponentMoves })}`
                      : ''}
                  </Text>
                </View>
                <View style={styles.rightCol}>
                  <Text style={[styles.resultLabel, { color: tint }]}>{resultLabel}</Text>
                  <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {items.length > 0 && (
          <Text style={[styles.footer, { color: palette.textSecondary }]}>
            {t('raceHistory.footer', { n: items.length })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 10, paddingBottom: 32 },
  emptyBox: {
    alignItems: 'center', gap: 12,
    padding: 24, borderWidth: 1, borderRadius: 14,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  ctaBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  ctaBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black' },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  variant: { flex: 1, fontSize: 13, fontFamily: 'Inter-Bold' },
  relTime: { fontSize: 10, fontFamily: 'Inter-Regular' },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  opponent: { fontSize: 13, fontFamily: 'Inter-Black' },
  statsLine: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  resultLabel: { fontSize: 11, fontFamily: 'Inter-Black', letterSpacing: 1 },
  footer: { fontSize: 10, fontFamily: 'Inter-Regular', textAlign: 'center', marginTop: 8 },
});
