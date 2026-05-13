/**
 * @file _layout.tsx
 * @description Root layout for Solitaire. Hydrates theme + locale via
 * AppProviders (defensive — never blocks), plays an AnimatedSplash on top
 * for 2.2 s min, then shows the expo-router Stack.
 *
 * Safety nets in place:
 *   - native splash hidden after 400 ms no-matter-what
 *   - AnimatedSplash fades at 2.2 s regardless of font state
 *   - AppProviders renders with defaults immediately, hydrates async
 */

import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/i18n.config';
import { AppProviders, useTheme } from '../src/contexts/AppProviders';
import { AchievementToastProvider } from '../src/contexts/AchievementToastContext';
import { AppModeProvider } from '../src/contexts/useAppMode';
import AnimatedSplash from '../src/components/AnimatedSplash';
import { logger } from '../src/utils/logger';
import { setupDailyChallengeNotification, pushNotificationsAvailable } from '../src/game/push-notifications';
import { setOnUnauthenticated } from '../shared/api';

SplashScreen.preventAutoHideAsync().catch(() => {});
setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 400);

console.log('[Solitaire/_layout] module loaded');
const log = logger.scoped('_layout');

function RootStackInner() {
  const { isDark } = useTheme();
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="auth/welcome" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="game/[roomCode]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/local" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/vs-bot" />
        <Stack.Screen name="room/create" />
        <Stack.Screen name="room/join" />
        <Stack.Screen name="room/simulate" />
        <Stack.Screen name="room/lobby" options={{ gestureEnabled: false }} />
        <Stack.Screen name="shop" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scores" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  console.log('[Solitaire/_layout] RootLayout rendering');
  log.screen('RootLayout rendering');

  const [fontsLoaded] = useFonts({
    'Inter-Regular':  require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Bold':     require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Black':    require('../assets/fonts/Inter-Black.ttf'),
  });

  const [minSplashDone, setMinSplashDone] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    log.screen('mounted');
    const t = setTimeout(() => setMinSplashDone(true), 2200);

    // Wire the API's "session is dead" callback to a navigation reset. Fires
    // when /auth/refresh itself returns 401 (refresh token expired, server
    // JWT secret rotated, account deleted). Without this, the app keeps
    // retrying authenticated calls forever with a zombie token after a
    // Docker rebuild that rotated JWT_SECRET — exactly the case we just hit.
    setOnUnauthenticated(() => {
      log.explain('session expirée détectée par l\'API → redirect /auth/welcome');
      try { router.replace('/auth/welcome'); } catch { /* router not ready yet — safe to ignore */ }
    });

    // Schedule daily push notification (8h locales) si expo-notifications dispo
    if (pushNotificationsAvailable()) {
      setupDailyChallengeNotification().then((r) => {
        if (r.scheduled) log.explain('Daily push notification scheduled (8h locales)');
        else log.warn('Daily push notification not scheduled', r.reason ?? '');
      });
    } else {
      log.explain('expo-notifications absent — fallback on in-app daily reminder');
    }
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      log.explain('polices prêtes → masquage du splash natif');
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (minSplashDone) {
      log.explain(`durée min du splash atteinte (polices=${fontsLoaded}) → fondu du splash animé`);
      setSplashVisible(false);
    }
  }, [fontsLoaded, minSplashDone]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <AppProviders>
            <AppModeProvider>
              <AchievementToastProvider>
                <RootStackInner />
              </AchievementToastProvider>
            </AppModeProvider>
          </AppProviders>
          {splashVisible && <AnimatedSplash visible={splashVisible} />}
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/* === End of _layout.tsx — Solitaire — SallyCards === */
