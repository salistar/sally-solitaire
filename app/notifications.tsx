/**
 * @file notifications.tsx
 * @description Inbox of every push notification the user has received,
 * powered by the server-side notification log (PR 44). Pulls the last 30
 * entries on mount, marks all-read on view, deep-links via `routeTo`.
 *
 * UX:
 *   - Pull-to-refresh for newer entries
 *   - Unread entries get a colored chip on the left
 *   - Tap routes via the saved `routeTo`; missing → no-op
 *   - "Tout marquer comme lu" header button if unread > 0
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

const CATEGORY_ICON: Record<string, string> = {
  matchReady: '🏆',
  achievement: '🏅',
  tournamentResult: '🥇',
  streakReminder: '🔥',
};

/** Localized label for each push category. Uses the `screens` namespace. */
function useCategoryLabels() {
  const { t } = useTranslation('screens');
  return {
    matchReady: t('notifications.categoryMatchReady'),
    achievement: t('notifications.categoryAchievement'),
    tournamentResult: t('notifications.categoryTournamentResult'),
    streakReminder: t('notifications.categoryStreakReminder'),
  };
}

function useFormatRelative() {
  const { t } = useTranslation('screens');
  return (ms: number): string => {
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
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation('screens');
  const categoryLabels = useCategoryLabels();
  const formatRelative = useFormatRelative();
  const [items, setItems] = useState<api.NotificationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);

  const PAGE_SIZE = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await api.getMe().catch(() => null);
      if (!user?.id) {
        setItems([]);
        setHasMore(false);
        return;
      }
      setMe({ id: user.id, username: user.username });
      const list = await api.fetchNotifications(user.id, PAGE_SIZE, 0);
      setItems(list);
      setHasMore(list.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  // Infinite-scroll fetcher — appends next page. Idempotent : guarded by
  // hasMore + loadingMore so spamming the scroll bottom doesn't double-fire.
  const loadMore = useCallback(async () => {
    if (!me?.id || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await api.fetchNotifications(me.id, PAGE_SIZE, items.length);
      if (next.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...prev, ...next]);
        if (next.length < PAGE_SIZE) setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [me?.id, items.length, loadingMore, hasMore]);

  useEffect(() => { load(); }, [load]);

  // Mark everything read once the user has viewed the inbox. The optimistic
  // local update gives instant feedback ; the server call is fire-and-forget
  // since a transient failure isn't worth showing the user.
  useEffect(() => {
    if (!me?.id || items.length === 0) return;
    const hasUnread = items.some((n) => !n.read);
    if (!hasUnread) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    api.markAllNotificationsRead(me.id).catch(() => {});
  }, [me?.id, items.length]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.text} />}
        onScroll={({ nativeEvent }) => {
          // Trigger loadMore when within 100px of the bottom. Matches the
          // common infinite-scroll heuristic ; uses native onScroll directly
          // (no FlatList) to keep the layout simple.
          const dist = nativeEvent.contentSize.height
            - nativeEvent.contentOffset.y
            - nativeEvent.layoutMeasurement.height;
          if (dist < 100 && hasMore && !loadingMore) loadMore();
        }}
        scrollEventThrottle={400}
      >
        {!me && !loading && (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Ionicons name="log-in-outline" size={32} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.text }]}>
              {t('notifications.emptyLogin')}
            </Text>
          </View>
        )}

        {me && items.length === 0 && !loading && (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Ionicons name="notifications-off-outline" size={32} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.text }]}>
              {t('notifications.emptyNone')}
            </Text>
          </View>
        )}

        {items.map((n) => {
          const ts = Date.parse(n.createdAt);
          return (
            <TouchableOpacity
              key={n.id}
              onPress={() => {
                if (n.routeTo) router.push(n.routeTo as any);
              }}
              activeOpacity={n.routeTo ? 0.85 : 1}
              style={[styles.row, {
                backgroundColor: palette.card,
                borderColor: palette.border,
                opacity: n.read ? 0.7 : 1,
              }]}
            >
              <Text style={styles.icon}>{CATEGORY_ICON[n.category] ?? '🔔'}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.category, { color: palette.textSecondary }]}>
                    {(categoryLabels as any)[n.category] ?? n.category}
                  </Text>
                  <Text style={[styles.time, { color: palette.textSecondary }]}>
                    {formatRelative(ts)}
                  </Text>
                </View>
                <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                  {n.title}
                </Text>
                <Text style={[styles.body, { color: palette.textSecondary }]} numberOfLines={2}>
                  {n.body}
                </Text>
              </View>
              {n.routeTo && (
                <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
              )}
            </TouchableOpacity>
          );
        })}
        {loadingMore && (
          <Text style={[styles.loadingMore, { color: palette.textSecondary }]}>…</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 8, paddingBottom: 32 },
  emptyBox: {
    alignItems: 'center', gap: 8, padding: 24, borderWidth: 1, borderRadius: 14,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderWidth: 1, borderRadius: 10,
  },
  icon: { fontSize: 26 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  category: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  time: { fontSize: 9, fontFamily: 'Inter-Regular', marginLeft: 'auto' },
  title: { fontSize: 14, fontFamily: 'Inter-Black', marginTop: 2 },
  body: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  loadingMore: { textAlign: 'center', paddingVertical: 12, fontSize: 18 },
});
