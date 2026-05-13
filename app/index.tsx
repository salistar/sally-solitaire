/**
 * @file index.tsx
 * @description Entry-point route. Bootstraps the auth session from persistent
 * storage (rolling 7-day / absolute 30-day policy in shared/auth-storage.ts)
 * and routes to:
 *   - `/(tabs)` if a valid session was restored
 *   - `/auth/welcome` otherwise (first launch or expired session)
 *
 * Shows a brief loading state while AsyncStorage is being read. The check is
 * async because the legacy synchronous `getAuthToken()` only saw in-memory
 * state — empty on every cold start. The async bootstrap restores the token
 * from disk before deciding which screen to mount.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../shared/api';

type Decision = 'loading' | 'tabs' | 'welcome';

export default function Index() {
  const [decision, setDecision] = useState<Decision>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Local mode short-circuit: if the user previously picked offline
        // play, send them straight to /(tabs) WITHOUT touching the auth
        // bootstrap. Avoids reading stale tokens that no longer match the
        // chosen mode, and skips any backend call at app start.
        const mode = await AsyncStorage.getItem('app.mode').catch(() => null);
        if (cancelled) return;
        if (mode === 'local') {
          console.log('[Solitaire/index] Mode local persisté → /(tabs) (no auth bootstrap)');
          setDecision('tabs');
          return;
        }

        const restored = await api.bootstrapAuth();
        if (cancelled) return;
        if (restored) {
          console.log('[Solitaire/index] Session restored from storage — → /(tabs)');
          setDecision('tabs');
        } else {
          console.log('[Solitaire/index] No valid session — → /auth/welcome');
          setDecision('welcome');
        }
      } catch (e) {
        console.error('[Solitaire/index] bootstrap failed:', e);
        if (!cancelled) setDecision('welcome');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (decision === 'loading') {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#0F172A', '#1E1B4B', '#0F172A']}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#A78BFA" />
      </View>
    );
  }

  return <Redirect href={decision === 'tabs' ? '/(tabs)' : '/auth/welcome'} />;
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
});

/* === End of index.tsx — Solitaire — SallyCards === */
