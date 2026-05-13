/**
 * @file (tabs)/_layout.tsx
 * @description Tab navigator layout for Solitaire. Configures the bottom tab bar with Play, Leaderboard, and Profile tabs.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Solitaire
 */

import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as api from '../../shared/api';
import { useIsLocal } from '../../src/contexts/useAppMode';

/**
 * TabIcon - Renders an emoji as a tab bar icon
 * @param name - The emoji string to display
 */
function TabIcon({ name }: { name: string }) {
  return <Text style={{ fontSize: 20 }}>{name}</Text>;
}

export default function TabsLayout() {
  // Hook: Access translation function for localized tab titles
  const { t } = useTranslation();
  const isLocal = useIsLocal();
  // Unread notification count for the Profile tab badge. Polled every 60s.
  // Server-side cap is unbounded but realistic values stay small (< 99).
  // Skipped entirely in local mode (no notifications exist there).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (isLocal) { setUnread(0); return; }
    let cancelled = false;
    const refresh = async () => {
      try {
        const me = await api.getMe();
        if (cancelled) return;
        const n = await api.fetchUnreadNotificationCount(me.id);
        if (!cancelled) setUnread(n);
      } catch {
        if (!cancelled) setUnread(0);
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isLocal]);

  console.log('[Solitaire/TabsLayout] Rendering tab navigator');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /* Tab bar styling: dark background with platform-specific height */
        tabBarStyle: {
          backgroundColor: '#111827',
          borderTopColor: 'rgba(255,255,255,0.1)',
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#16A34A',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Play tab - main game screen */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('play'),
          tabBarIcon: () => <TabIcon name="🎮" />,
        }}
      />
      {/* Multiplayer tab — hub for quick match / rooms / daily challenge.
          Hidden in local mode (no online opponent possible). */}
      <Tabs.Screen
        name="multiplayer"
        options={{
          title: t('multiplayer.tab', { defaultValue: 'Multi' }),
          tabBarIcon: () => <TabIcon name="⚔️" />,
          href: isLocal ? null : undefined,
        }}
      />
      {/* Leaderboard tab — global ELO rankings.
          Hidden in local mode (rankings need a backend). */}
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t('leaderboard'),
          tabBarIcon: () => <TabIcon name="🏆" />,
          href: isLocal ? null : undefined,
        }}
      />
      {/* Profile tab - user stats and info. Badge shows unread push count
          so the user notices a new tournament/achievement notif without
          leaving the home screen. Cap displayed value at "99+" to avoid
          overflow in the small badge bubble. */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: () => <TabIcon name="👤" />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#fff', fontSize: 10 },
        }}
      />
    </Tabs>
  );
}

/* === End of (tabs)/_layout.tsx — Solitaire — SallyCards === */
