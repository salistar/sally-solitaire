/**
 * @file auth-storage.ts
 * @description Persistent auth session storage with rolling 7-day window and
 * absolute 30-day cap (per product spec).
 *
 *   - On login: persist accessToken + refreshToken + issuedAt + lastSeenAt
 *   - On every app open: bootstrap() reads, checks two rules, writes back
 *
 *   Rule 1 (rolling 7d): if (now - lastSeenAt) > 7 days → session expired
 *   Rule 2 (absolute 30d): if (now - issuedAt) > 30 days → session expired
 *
 *   If rule 1 OR rule 2 fires → clear storage, user must re-login.
 *   Otherwise → update lastSeenAt = now (rolling extension) and return tokens.
 *
 * Storage backend: AsyncStorage (already in the project). Each value lives
 * under the namespace `sally.auth.*`. We use AsyncStorage rather than
 * expo-secure-store to avoid adding a native module (no rebuild required).
 * Tokens are stored as plain strings — acceptable for our threat model;
 * upgrade to expo-secure-store is a drop-in replacement (same API surface).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_ACCESS  = 'sally.auth.accessToken';
const KEY_REFRESH = 'sally.auth.refreshToken';
const KEY_ISSUED  = 'sally.auth.issuedAt';   // ms since epoch, set ONCE at first login
const KEY_SEEN    = 'sally.auth.lastSeenAt'; // ms since epoch, updated each app open

const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PersistedSession {
  accessToken: string;
  refreshToken: string | null;
  issuedAt: number;
  lastSeenAt: number;
}

/**
 * Persist a freshly-issued session (called from login / register / guest /
 * register flows). Sets issuedAt = now AND lastSeenAt = now.
 */
export async function persistNewSession(
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    AsyncStorage.setItem(KEY_ACCESS, accessToken),
    refreshToken
      ? AsyncStorage.setItem(KEY_REFRESH, refreshToken)
      : AsyncStorage.removeItem(KEY_REFRESH),
    AsyncStorage.setItem(KEY_ISSUED, String(now)),
    AsyncStorage.setItem(KEY_SEEN, String(now)),
  ]);
}

/**
 * Persist rotated tokens after a successful /auth/refresh. Does NOT update
 * issuedAt (the 30-day absolute cap is anchored to the ORIGINAL login).
 * Updates lastSeenAt = now.
 */
export async function persistRotatedTokens(
  accessToken: string,
  refreshToken: string | null,
): Promise<void> {
  const now = Date.now();
  await Promise.all([
    AsyncStorage.setItem(KEY_ACCESS, accessToken),
    refreshToken ? AsyncStorage.setItem(KEY_REFRESH, refreshToken) : Promise.resolve(),
    AsyncStorage.setItem(KEY_SEEN, String(now)),
  ]);
}

/**
 * Bootstrap session on app open. Implements the two-rule policy:
 *   - Absolute 30-day: if `now - issuedAt` > 30d → expire.
 *   - Rolling 7-day:  if `now - lastSeenAt` > 7d → expire.
 *
 * Returns the still-valid session (with lastSeenAt advanced to now) or null
 * if expired/missing. Side-effect: writes lastSeenAt = now if valid.
 */
export async function bootstrapSession(): Promise<PersistedSession | null> {
  const [accessToken, refreshToken, issuedRaw, seenRaw] = await Promise.all([
    AsyncStorage.getItem(KEY_ACCESS),
    AsyncStorage.getItem(KEY_REFRESH),
    AsyncStorage.getItem(KEY_ISSUED),
    AsyncStorage.getItem(KEY_SEEN),
  ]);

  if (!accessToken || !issuedRaw || !seenRaw) {
    // Nothing to restore — could be first launch, or a previous clearSession()
    return null;
  }

  const issuedAt = Number(issuedRaw);
  const lastSeenAt = Number(seenRaw);
  const now = Date.now();

  if (!Number.isFinite(issuedAt) || !Number.isFinite(lastSeenAt)) {
    await clearSession();
    return null;
  }

  // Rule 2: absolute 30-day cap from original login
  if (now - issuedAt > THIRTY_DAYS_MS) {
    await clearSession();
    return null;
  }

  // Rule 1: rolling 7-day window from last app open
  if (now - lastSeenAt > SEVEN_DAYS_MS) {
    await clearSession();
    return null;
  }

  // Valid — advance the rolling window
  await AsyncStorage.setItem(KEY_SEEN, String(now));

  return {
    accessToken,
    refreshToken: refreshToken ?? null,
    issuedAt,
    lastSeenAt: now,
  };
}

/** Wipe all session keys. Called from logout, expired bootstrap, or on demand. */
export async function clearSession(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(KEY_ACCESS),
    AsyncStorage.removeItem(KEY_REFRESH),
    AsyncStorage.removeItem(KEY_ISSUED),
    AsyncStorage.removeItem(KEY_SEEN),
  ]);
}

/** Diagnostics: read raw timestamps without mutating. */
export async function readSessionMeta(): Promise<{
  issuedAt: number | null;
  lastSeenAt: number | null;
  ageDays: number | null;
  inactiveDays: number | null;
} | null> {
  const [issuedRaw, seenRaw] = await Promise.all([
    AsyncStorage.getItem(KEY_ISSUED),
    AsyncStorage.getItem(KEY_SEEN),
  ]);
  if (!issuedRaw || !seenRaw) return null;
  const issuedAt = Number(issuedRaw);
  const lastSeenAt = Number(seenRaw);
  const now = Date.now();
  return {
    issuedAt,
    lastSeenAt,
    ageDays: (now - issuedAt) / (24 * 60 * 60 * 1000),
    inactiveDays: (now - lastSeenAt) / (24 * 60 * 60 * 1000),
  };
}

/** Force-touch the rolling window (useful for explicit "I'm still here" calls). */
export async function touchLastSeen(): Promise<void> {
  await AsyncStorage.setItem(KEY_SEEN, String(Date.now()));
}
