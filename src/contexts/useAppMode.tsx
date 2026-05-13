/**
 * @file useAppMode.tsx
 * @description Single source of truth for the user's chosen app mode:
 *
 *   - 'local'  : offline-first. No /users/me, no /leaderboards, no multiplayer.
 *                Play any of the 177 solitaire variants against yourself.
 *                Stats stay on-device only.
 *   - 'cloud'  : full backend. Login required. ELO, daily rewards, races,
 *                tournaments, shop, achievements all powered by the API.
 *   - null     : not yet decided (first launch before /auth/mode-select).
 *
 * The choice is persisted in AsyncStorage under `app.mode` (chosen at
 * /auth/mode-select, can be reset from the settings screen via setMode).
 *
 * Screens consume `useAppMode().mode` to branch UI:
 *   - hide cloud-only CTAs in local mode (multiplayer, leaderboard, shop)
 *   - skip backend fetches that would only 401 (NoSessionError already
 *     short-circuits api.getMe but the cleaner pattern is "don't call at all")
 *   - surface a "Sign in to unlock online features" prompt where relevant
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'local' | 'cloud';

const MODE_STORAGE_KEY = 'app.mode';

export interface AppModeHook {
  /** null until storage is hydrated; then 'local' or 'cloud'. */
  mode: AppMode | null;
  /** True once we've finished reading AsyncStorage. Use to gate UI hidden until known. */
  hydrated: boolean;
  /** Update + persist. Triggers a re-render in every consumer. */
  setMode: (next: AppMode) => Promise<void>;
}

const AppModeContext = createContext<AppModeHook>({
  mode: null,
  hydrated: false,
  setMode: async () => {},
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted choice on mount. Failures fall through to `null` so
  // the user gets sent through /auth/mode-select again — safer than guessing.
  useEffect(() => {
    AsyncStorage.getItem(MODE_STORAGE_KEY).then((stored) => {
      if (stored === 'local' || stored === 'cloud') setModeState(stored);
    }).catch(() => {}).finally(() => setHydrated(true));
  }, []);

  const setMode = useCallback(async (next: AppMode) => {
    setModeState(next);
    try { await AsyncStorage.setItem(MODE_STORAGE_KEY, next); } catch { /* silent */ }
  }, []);

  return (
    <AppModeContext.Provider value={{ mode, hydrated, setMode }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeHook {
  return useContext(AppModeContext);
}

/** Helper: true only in cloud mode (after hydration). False in local + while hydrating. */
export function useIsCloud(): boolean {
  const { mode, hydrated } = useAppMode();
  return hydrated && mode === 'cloud';
}

/** Helper: true only in local mode (after hydration). False in cloud + while hydrating. */
export function useIsLocal(): boolean {
  const { mode, hydrated } = useAppMode();
  return hydrated && mode === 'local';
}
