/**
 * @file index.tsx
 * @description Entry point / root index that checks auth token and redirects to tabs or welcome screen accordingly.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Solitaire
 */

import { Redirect } from 'expo-router';
import * as api from '../shared/api';

export default function Index() {
  // Check if the user has a stored auth token
  const token = api.getAuthToken();
  console.log('[Solitaire/index] Auth token check:', token ? 'Token found' : 'No token');

  // If authenticated, redirect to main tabs; otherwise redirect to welcome/onboarding
  if (token) {
    console.log('[Solitaire/index] Navigating to /(tabs)');
    return <Redirect href="/(tabs)" />;
  }
  console.log('[Solitaire/index] Navigating to /auth/welcome');
  return <Redirect href="/auth/welcome" />;
}

/* === End of index.tsx — Solitaire — SallyCards === */
