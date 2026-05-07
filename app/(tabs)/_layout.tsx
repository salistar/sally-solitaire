/**
 * @file (tabs)/_layout.tsx
 * @description Tab navigator layout for Solitaire. Configures the bottom tab bar with Play, Leaderboard, and Profile tabs.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Solitaire
 */

import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

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
      {/* Multiplayer tab - hub for quick match / rooms / daily challenge */}
      <Tabs.Screen
        name="multiplayer"
        options={{
          title: t('multiplayer.tab', { defaultValue: 'Multi' }),
          tabBarIcon: () => <TabIcon name="⚔️" />,
        }}
      />
      {/* Leaderboard tab - rankings and scores */}
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t('leaderboard'),
          tabBarIcon: () => <TabIcon name="🏆" />,
        }}
      />
      {/* Profile tab - user stats and info */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: () => <TabIcon name="👤" />,
        }}
      />
    </Tabs>
  );
}

/* === End of (tabs)/_layout.tsx — Solitaire — SallyCards === */
