import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  persistNewSession,
  persistRotatedTokens,
  bootstrapSession,
  clearSession,
} from './auth-storage';

/**
 * Résout l'URL de l'API dynamiquement :
 *   1. Si EXPO_PUBLIC_API_URL est défini → l'utilise tel quel
 *   2. Sinon, utilise l'IP de Metro (debuggerHost) + port 3000
 *      → l'IP suit automatiquement le Wi-Fi (pas besoin d'éditer .env)
 *   3. Fallback localhost pour le web ou quand rien n'est détecté
 */
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // hostUri ressemble à "192.168.1.12:8081" en dev
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return `http://${host}:3000/api/v1`;
  }
  return 'http://localhost:3000/api/v1';
}

const API_URL = resolveApiUrl();

/** Même logique pour le socket-server (port 3001). */
function resolveSocketUrl(): string {
  if (process.env.EXPO_PUBLIC_SOCKET_URL) {
    return process.env.EXPO_PUBLIC_SOCKET_URL;
  }
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export const SOCKET_URL = resolveSocketUrl();

if (__DEV__) {
  console.log('[api] API →', API_URL);
  console.log('[api] Socket →', SOCKET_URL);
}

// In-memory token storage. The persistence layer (auth-storage.ts) mirrors
// these into AsyncStorage with a rolling 7-day / absolute 30-day policy.
// `bootstrapAuth()` is called from useAuth's mount effect to rehydrate them.
let authToken: string | null = null;
let refreshToken: string | null = null;

/**
 * Restore the auth session from persistent storage on app start. Applies the
 * 7-day rolling + 30-day absolute expiry rules; returns true if the session
 * is still valid (tokens loaded into memory), false otherwise (storage
 * cleared, user must re-login).
 */
export async function bootstrapAuth(): Promise<boolean> {
  const session = await bootstrapSession();
  if (!session) {
    authToken = null;
    refreshToken = null;
    return false;
  }
  authToken = session.accessToken;
  refreshToken = session.refreshToken;
  return true;
}

export interface User {
  id: string;
  email: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  teamWinRate: number;
  rank: number;
  coins: number;
  achievements: number;
  memberSince: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
}

export interface Room {
  code: string;
  gameType: string;
  status: 'waiting' | 'playing' | 'finished';
  playersCount: number;
  playersMax: number;
  createdAt: string;
}

export interface Bot {
  id: string;
  name: string;
  level: 'easy' | 'medium' | 'hard' | 'expert';
}

// Utility function to handle fetch with error handling.
//
// Auto-refresh on 401 :
//   Le JWT expire après JWT_EXPIRES_IN (15min par défaut). Sans refresh
//   automatique, toute requête après expiration échouait en "Unauthorized".
//   On intercepte 401 → on appelle /auth/refresh une fois → on retry la
//   requête originale avec le nouveau token. Si le refresh échoue lui-même,
//   on propage l'erreur (l'utilisateur devra se reconnecter).
//
//   `_isRetry=true` empêche les boucles infinies si /auth/refresh renvoie 401.
let _refreshInFlight: Promise<boolean> | null = null;

/**
 * Callback registered by the root layout — fired when a 401 + refresh
 * cascade fails. The layout uses it to navigate to /auth/welcome and clear
 * any user-derived state. Kept as a module-level setter (rather than a
 * context) so the API module stays UI-framework-agnostic.
 */
type UnauthenticatedHandler = () => void;
let _onUnauthenticated: UnauthenticatedHandler | null = null;
export function setOnUnauthenticated(handler: UnauthenticatedHandler | null): void {
  _onUnauthenticated = handler;
}

/**
 * Clear in-memory + persisted session and fire the unauthenticated handler.
 * Called when the refresh token is also dead (e.g. JWT secret rotated server-
 * side, refresh older than 7 days, account deleted). Idempotent.
 */
async function handleUnauthenticated(): Promise<void> {
  authToken = null;
  refreshToken = null;
  invalidateMeCache();
  try { await clearSession(); } catch { /* best-effort */ }
  if (_onUnauthenticated) {
    try { _onUnauthenticated(); } catch { /* swallow — UI layer's job */ }
  }
}

async function ensureRefreshedOnce(): Promise<boolean> {
  if (!refreshToken) return false;
  // Une seule requête de refresh à la fois (évite N appels parallèles).
  if (!_refreshInFlight) {
    _refreshInFlight = (async () => {
      try {
        const url = `${API_URL}/auth/refresh`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          // Refresh itself failed → the persisted session is dead. Wipe it
          // so the next app launch goes through the auth flow cleanly
          // instead of restoring a zombie token.
          await handleUnauthenticated();
          return false;
        }
        const body = await res.json();
        const data = body.data ?? body;
        if (data.accessToken) authToken = data.accessToken;
        if (data.refreshToken) refreshToken = data.refreshToken;
        if (data.accessToken) {
          // Mirror rotated tokens to storage. issuedAt is preserved
          // (30-day cap stays anchored to original login).
          await persistRotatedTokens(data.accessToken, data.refreshToken ?? refreshToken);
        }
        return !!data.accessToken;
      } catch {
        await handleUnauthenticated();
        return false;
      } finally {
        _refreshInFlight = null;
      }
    })();
  }
  return _refreshInFlight;
}

async function fetchWithToken(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<any> {
  const url = `${API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 401 → tentative de refresh + retry une seule fois.
    // Skip refresh sur les endpoints d'auth eux-mêmes (login/refresh) pour
    // éviter les boucles : un 401 sur /auth/login signifie mauvais creds,
    // pas un token expiré.
    if (
      response.status === 401 &&
      !_isRetry &&
      !endpoint.startsWith('/auth/login') &&
      !endpoint.startsWith('/auth/register') &&
      !endpoint.startsWith('/auth/refresh')
    ) {
      const refreshed = await ensureRefreshedOnce();
      if (refreshed) {
        return fetchWithToken(endpoint, options, true);
      }
    }

    if (!response.ok) {
      let message = `API error: ${response.status}`;
      try {
        const errorData = await response.json();
        // API error format: { error: { message } } or { message }
        if (errorData.error?.message) message = errorData.error.message;
        else if (errorData.message) message = errorData.message;
      } catch {}
      // Throw a typed error carrying the status so callers can branch
      // without parsing the message string.
      const err = new Error(message) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    const json = await response.json();
    // API wraps responses in { success, data, timestamp } — unwrap
    return json.data !== undefined ? json.data : json;
  } catch (error: any) {
    // Quiet expected client-side states (401 anonymous, 429 throttle). The
    // caller decides whether they want to surface these — most call sites
    // have a fallback path. Only network/server errors stay loud.
    const status: number | undefined = error?.status;
    const isQuiet = status === 401 || status === 429;
    if (!isQuiet) console.error(`API call failed: ${endpoint}`, error);
    throw error;
  }
}

// Authentication APIs
export async function login(email: string, password: string, options?: { gameType?: string }) {
  try {
    const data = await fetchWithToken('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, gameType: options?.gameType }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    // Persist with fresh issuedAt — starts the 30-day absolute clock.
    if (data.accessToken) {
      invalidateMeCache();
      await persistNewSession(data.accessToken, data.refreshToken ?? null);
    }

    return data;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function register(
  email: string,
  username: string,
  password: string
) {
  try {
    const data = await fetchWithToken('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    if (data.accessToken) {
      invalidateMeCache();
      await persistNewSession(data.accessToken, data.refreshToken ?? null);
    }

    return data;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

/**
 * `getMe()` in-memory cache + in-flight dedupe.
 *
 * Why: many components mount in parallel (HomeScreen + Profile + Leaderboard
 * tabs, every FrenchCard via useCardSkin → useInventory, every undo button
 * via useUndos → useInventory) and each fires `getMe()` on mount. Without
 * coalescing, a single Klondike screen with 30 visible cards triggers 30+
 * concurrent /users/me calls and the server throttler (3 req/s) bursts into
 * `ThrottlerException: Too Many Requests`.
 *
 * Strategy:
 *   - Cache the resolved User for `GET_ME_CACHE_TTL_MS` (10s).
 *   - While a request is in flight, return the same promise to all callers.
 *   - `invalidateMeCache()` clears it on login / logout / handleUnauthenticated.
 *
 * Local-mode short-circuit: if there's no in-memory token (user picked the
 * offline-only mode from /auth/mode-select OR never logged in), we throw a
 * `NoSessionError` immediately without hitting the network. Avoids spamming
 * `/users/me` 401s when no session is even possible. Callers should catch
 * `NoSessionError` and treat the user as guest/anonymous locally.
 */
export class NoSessionError extends Error {
  constructor() {
    super('no-session');
    this.name = 'NoSessionError';
  }
}

const GET_ME_CACHE_TTL_MS = 10_000;
let _getMeCache: { value: User; at: number } | null = null;
let _getMeInFlight: Promise<User> | null = null;
let _getMeFailureCacheUntil = 0; // negative cache: avoid retry storm on 401

export function invalidateMeCache(): void {
  _getMeCache = null;
  _getMeInFlight = null;
  _getMeFailureCacheUntil = 0;
}

export async function getMe(): Promise<User> {
  // No token at all → local-mode or fresh install. Short-circuit so callers
  // don't trigger 30+ doomed /users/me requests.
  if (!authToken && !refreshToken) {
    throw new NoSessionError();
  }
  const now = Date.now();
  // Negative-cache failed calls for a short window so a render storm of
  // useCardSkin → useInventory → getMe doesn't repeatedly hit a 401.
  if (now < _getMeFailureCacheUntil) {
    throw new NoSessionError();
  }
  if (_getMeCache && now - _getMeCache.at < GET_ME_CACHE_TTL_MS) {
    return _getMeCache.value;
  }
  if (_getMeInFlight) return _getMeInFlight;
  _getMeInFlight = (async () => {
    try {
      const data = await fetchWithToken('/users/me', { method: 'GET' });
      _getMeCache = { value: data, at: Date.now() };
      return data;
    } catch (error) {
      // Treat 401 (incl. failed refresh) as "no session for now". Pin a
      // 30 s negative-cache so the next render burst is silent.
      _getMeFailureCacheUntil = Date.now() + 30_000;
      throw error;
    } finally {
      _getMeInFlight = null;
    }
  })();
  return _getMeInFlight;
}

export async function refreshTokenAsync(): Promise<{ token: string }> {
  try {
    const data = await fetchWithToken('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    // Rotated tokens: keep the original issuedAt (30-day cap is anchored
    // to first login), but bump lastSeenAt.
    if (data.accessToken) {
      await persistRotatedTokens(data.accessToken, data.refreshToken ?? refreshToken);
    }

    return data;
  } catch (error) {
    console.error('Token refresh failed:', error);
    authToken = null;
    refreshToken = null;
    await clearSession();
    throw error;
  }
}

export async function logout() {
  authToken = null;
  refreshToken = null;
  invalidateMeCache();
  await clearSession();
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null, refresh?: string | null) {
  authToken = token;
  if (refresh !== undefined) {
    refreshToken = refresh;
  }
}

// Guest session
export async function createGuestSession(): Promise<{ token: string }> {
  try {
    const data = await fetchWithToken('/auth/guest', {
      method: 'POST',
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    // Guests get the same rolling-window treatment as full users.
    if (data.accessToken) {
      invalidateMeCache();
      await persistNewSession(data.accessToken, data.refreshToken ?? null);
    }

    return data;
  } catch (error) {
    console.error('Failed to create guest session:', error);
    throw error;
  }
}

// Players API — fetch players for a specific game
export async function getPlayers(gameType: string): Promise<any[]> {
  try {
    const data = await fetchWithToken(`/users/by-game/${gameType}`, { method: 'GET' });
    return Array.isArray(data) ? data : (data.users || []);
  } catch (error) {
    console.error(`Failed to fetch players for ${gameType}:`, error);
    return [];
  }
}

// Leaderboard APIs
export async function getLeaderboard(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season',
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}?filter=${filter}&limit=${limit}`,
      { method: 'GET' }
    );
    return data.entries || [];
  } catch (error) {
    console.error(`Failed to fetch leaderboard for ${gameType}:`, error);
    return [];
  }
}

export async function getMyRank(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season'
): Promise<{ rank: number; elo: number; percentile: number }> {
  // Skip the request if no session — rank requires auth.
  if (!authToken && !refreshToken) {
    return { rank: 0, elo: 0, percentile: 0 };
  }
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}/my-rank?filter=${filter}`,
      { method: 'GET' }
    );
    return data;
  } catch (error: any) {
    // Quiet expected anonymous / throttle states.
    const status = error?.status;
    if (status !== 401 && status !== 429) {
      console.error(`Failed to fetch rank for ${gameType}:`, error);
    }
    return { rank: 0, elo: 0, percentile: 0 };
  }
}

// Room APIs
export async function createRoom(
  gameType: string,
  config: {
    isPrivate?: boolean;
    maxPlayers?: number;
    botDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  } = {}
): Promise<Room> {
  try {
    const data = await fetchWithToken('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        gameType,
        ...config,
      }),
    });
    return data;
  } catch (error) {
    console.error('Failed to create room:', error);
    throw error;
  }
}

export async function listRooms(gameType: string): Promise<Room[]> {
  try {
    const data = await fetchWithToken(`/rooms?gameType=${gameType}`, {
      method: 'GET',
    });
    return data.rooms || [];
  } catch (error) {
    console.error('Failed to list rooms:', error);
    return [];
  }
}

export async function joinRoom(code: string): Promise<Room> {
  try {
    const data = await fetchWithToken(`/rooms/${code}/join`, {
      method: 'POST',
    });
    return data;
  } catch (error) {
    console.error('Failed to join room:', error);
    throw error;
  }
}

export async function leaveRoom(code: string): Promise<void> {
  try {
    await fetchWithToken(`/rooms/${code}/leave`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Failed to leave room:', error);
    throw error;
  }
}

// Bot APIs
export async function listBots(): Promise<Bot[]> {
  try {
    const data = await fetchWithToken('/bots', {
      method: 'GET',
    });
    return data.bots || [];
  } catch (error) {
    console.error('Failed to fetch bots:', error);
    return [];
  }
}

// Update profile
export async function updateProfile(updates: Partial<User>): Promise<User> {
  try {
    const data = await fetchWithToken('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data;
  } catch (error) {
    console.error('Failed to update profile:', error);
    throw error;
  }
}

// ──────────────────────────────────────────────
// Extended Leaderboard (world / country / city)
// ──────────────────────────────────────────────

export async function getLeaderboardScoped(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season',
  scope: 'world' | 'country' | 'city' = 'world',
  limit = 50,
): Promise<{ entries: LeaderboardEntry[]; scope: string; filter: string; total: number }> {
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}?filter=${filter}&scope=${scope}&limit=${limit}`,
      { method: 'GET' },
    );
    return {
      entries: data.entries || [],
      scope: data.scope || scope,
      filter: data.filter || filter,
      total: data.total || 0,
    };
  } catch (e) {
    console.error(`getLeaderboardScoped(${gameType}, ${scope}) failed`, e);
    return { entries: [], scope, filter, total: 0 };
  }
}

// ──────────────────────────────────────────────
// Rooms (create / list / join / ready / start)
// ──────────────────────────────────────────────

export interface RoomFull {
  code: string;
  hostId: string;
  gameType: string;
  status: 'waiting' | 'starting' | 'in_progress' | 'finished';
  mode: 'public' | 'private' | 'ranked';
  maxPlayers: number;
  minPlayers: number;
  playersCount: number;
  players: Array<{ userId: string; username: string; isReady: boolean; isHost?: boolean; joinedAt: string }>;
  config: Record<string, any>;
  shareUrl: string;
  createdAt: string;
}

export async function createRoomFull(
  gameType: string,
  opts: { isPrivate?: boolean; maxPlayers?: number; minPlayers?: number; stake?: number } = {},
): Promise<RoomFull> {
  return fetchWithToken('/rooms', {
    method: 'POST',
    body: JSON.stringify({ gameType, ...opts }),
  });
}

export async function listRoomsFull(gameType?: string): Promise<{ rooms: RoomFull[]; total: number }> {
  const q = gameType ? `?gameType=${gameType}` : '';
  return fetchWithToken(`/rooms${q}`, { method: 'GET' });
}

export async function findRoomByCode(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}`, { method: 'GET' });
}

export async function joinRoomFull(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/join`, { method: 'POST' });
}

export async function leaveRoomFull(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/leave`, { method: 'POST' });
}

export async function setReady(code: string, isReady: boolean): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/ready`, {
    method: 'POST',
    body: JSON.stringify({ isReady }),
  });
}

export async function startGame(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/start`, { method: 'POST' });
}

/**
 * Simulation mode — creates a room pre-filled with `userCount` random
 * users from the DB as "bots" that will auto-play once the game starts.
 */
export async function simulateRoom(gameType: string, userCount: number): Promise<RoomFull> {
  return fetchWithToken('/rooms/simulate', {
    method: 'POST',
    body: JSON.stringify({ gameType, userCount }),
  });
}

// ──────────────────────────────────────────────
// Bots (local vs-bot mode)
// ──────────────────────────────────────────────

export async function botMove(
  gameType: string,
  state: { hand: string[]; table?: string[]; history?: any[]; lockedCards?: string[]; rules?: string },
  difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium',
): Promise<{ card: string | null; action: string; confidence: number; reasoning?: string }> {
  return fetchWithToken(`/bots/${gameType}/move`, {
    method: 'POST',
    body: JSON.stringify({ difficulty, state }),
  });
}

// ──────────────────────────────────────────────
// Shop
// ──────────────────────────────────────────────

export interface ShopPackage {
  productId: string;
  name: string;
  coins: number;
  bonus: number;
  priceEur: number;
  priceUsd: number;
  icon: string;
  gradient: [string, string];
  sortOrder: number;
  popular?: boolean;
  bestValue?: boolean;
  subscription?: boolean;
  durationDays?: number;
}

export async function getShopPackages(): Promise<ShopPackage[]> {
  try {
    const data = await fetchWithToken('/shop/packages', { method: 'GET' });
    return Array.isArray(data) ? data : data.packages || [];
  } catch (e) {
    console.error('getShopPackages failed', e);
    return [];
  }
}

export async function confirmPurchase(
  gameType: string,
  productId: string,
  purchaseId: string,
  platform: 'android' | 'ios',
): Promise<{ amount: number; newBalance: number; pkg: any }> {
  return fetchWithToken('/shop/purchase/confirm', {
    method: 'POST',
    body: JSON.stringify({ gameType, productId, purchaseId, platform }),
  });
}

// ──────────────────────────────────────────────
// Daily Challenge
// ──────────────────────────────────────────────

export async function getDailyChallenge(gameType: string): Promise<any> {
  try {
    return await fetchWithToken(`/challenges/daily/${gameType}`, { method: 'GET' });
  } catch (e: any) {
    // 404 = backend hasn't created today's challenge yet; return a local
    // default so the UI still renders a valid daily card.
    const isMissing = /not found|no challenge/i.test(e?.message || '');
    if (isMissing) {
      return {
        gameType,
        title: 'Défi du jour',
        description: 'Gagne 3 parties consécutives pour empocher le bonus',
        rewardCoins: 50,
        rewardXp: 100,
        active: true,
        participants: [],
        date: new Date().toISOString(),
        fallback: true,
      };
    }
    console.error('getDailyChallenge failed', e);
    return null;
  }
}

export async function joinDailyChallenge(gameType: string): Promise<RoomFull> {
  return fetchWithToken(`/challenges/daily/${gameType}/matchmake`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Games (stat sync at end of match)
// ──────────────────────────────────────────────

export async function completeGame(result: {
  gameType: string;
  gameId?: string;
  durationMs?: number;
  mode?: string;
  players: Array<{ userId: string; username?: string; placement: number; score?: number; isBot?: boolean }>;
}): Promise<{ updated: Array<{ userId: string; eloDelta: number; won: boolean }> }> {
  return fetchWithToken('/games/complete', {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

/**
 * Persist a SOLO Solitaire game (no opponents). Best-effort:
 * tries `/games/save` first, falls back to `/leaderboards/<gameType>/submit`,
 * and finally falls back to `/games/complete` (treating the user as
 * placement=1 if won, =2 if lost) so we always update stats/ELO server-side.
 */
export async function saveSoloGame(input: {
  gameType: string;            // 'solitaire'
  variant: string;              // 'klondike-1' | 'klondike-3' | ...
  score: number;
  moves: number;
  durationMs: number;
  won: boolean;
  /** Niveau de difficulté choisi avant la partie. */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Nombre d'indices utilisés. */
  hintsUsed?: number;
}): Promise<{ persisted: boolean; via: 'games/save' | 'leaderboards' | 'games/complete' | 'none' }> {
  // 1) preferred dedicated solo endpoint
  try {
    await fetchWithToken('/games/save', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { persisted: true, via: 'games/save' };
  } catch (e1) {
    // 2) leaderboards/<gameType>/submit
    try {
      await fetchWithToken(`/leaderboards/${input.gameType}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          score: input.score,
          variant: input.variant,
          moves: input.moves,
          durationMs: input.durationMs,
          won: input.won,
        }),
      });
      return { persisted: true, via: 'leaderboards' };
    } catch (e2) {
      // 3) reuse /games/complete with a single-player payload
      try {
        const me = authToken ? await getMe().catch(() => null) : null;
        if (me) {
          await completeGame({
            gameType: input.gameType,
            mode: input.variant,
            durationMs: input.durationMs,
            players: [
              { userId: (me as any).id ?? (me as any)._id, username: me.username, placement: input.won ? 1 : 2, score: input.score, isBot: false },
            ],
          });
          return { persisted: true, via: 'games/complete' };
        }
      } catch (e3) {
        console.error('saveSoloGame: all 3 endpoints failed', { e1, e2, e3 });
      }
      return { persisted: false, via: 'none' };
    }
  }
}

// =====================================================================
// DEAL SEEDS — fetch pré-générées depuis la BD
// =====================================================================

export interface DealSeed {
  variant: string;
  seedIndex: number;
  initialState: any;
  solution: any[];
  difficulty: string;
  dealHash: string;
  metadata?: any;
}

/** GET /deal-seeds/random/:variant — retourne UN deal aléatoire ou null si aucun. */
export async function fetchRandomDealSeed(variant: string, difficulty?: string): Promise<DealSeed | null> {
  try {
    const url = `${API_URL}/deal-seeds/random/${encodeURIComponent(variant)}${difficulty ? `?difficulty=${difficulty}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json?.data) return json.data as DealSeed;
    return null;
  } catch (err) {
    return null;
  }
}

/** POST /deal-seeds/submit — soumet un deal généré localement pour populariser la BD. */
export async function submitDealSeed(payload: {
  variant: string;
  initialState: any;
  solution: any[];
  difficulty?: string;
  dealHash: string;
  metadata?: any;
}): Promise<{ ok: boolean; duplicate?: boolean }> {
  try {
    const res = await fetch(`${API_URL}/deal-seeds/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return { ok: !!json?.success, duplicate: !!json?.duplicate };
  } catch {
    return { ok: false };
  }
}

export interface DealSeedStats {
  total: Record<string, number>;
  withSolution: Record<string, number>;
  coverage: Record<string, number>;
  grandTotal: number;
  grandWithSolution: number;
}

export interface SeedingStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt: number | null;
  finishedAt: number | null;
  progress: { variant: string; inserted: number; target: number; done: boolean }[];
  totalGenerated: number;
  error: string | null;
}

/** GET /deal-seeds/seeding-status — statut de la génération background. */
export async function fetchSeedingStatus(): Promise<SeedingStatus | null> {
  try {
    const res = await fetch(`${API_URL}/deal-seeds/seeding-status`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as SeedingStatus) : null;
  } catch {
    return null;
  }
}

export interface SeedHistoryPoint {
  timestamp: string; // ISO date
  grandTotal: number;
  grandWithSolution: number;
  perVariant: Record<string, number>;
  source: string;
}

/** GET /deal-seeds/seeding-history — points d'historique (les N plus récents). */
export async function fetchSeedingHistory(limit = 100): Promise<SeedHistoryPoint[]> {
  try {
    const res = await fetch(`${API_URL}/deal-seeds/seeding-history?limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as SeedHistoryPoint[]) : [];
  } catch {
    return [];
  }
}

/** GET /deal-seeds/daily/:variant — seed déterministe du jour. */
export async function fetchDailyChallenge(variant: string, date?: Date): Promise<DealSeed | null> {
  try {
    const dateQ = date ? `?date=${date.toISOString()}` : '';
    const res = await fetch(`${API_URL}/deal-seeds/daily/${encodeURIComponent(variant)}${dateQ}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as DealSeed) : null;
  } catch { return null; }
}

// =====================================================================
// SOLITAIRE MATCHES — multiplayer 1v1
// =====================================================================

export interface SolitairePlayerProgress {
  userId: string;
  displayName: string;
  score: number;
  moves: number;
  finished: boolean;
  finishedAt: number | null;
  joinedAt: number;
}

export interface SolitaireMatch {
  code: string;
  variant: string;
  difficulty: string;
  initialState: any;
  dealHash?: string;
  status: 'waiting' | 'playing' | 'finished';
  players: SolitairePlayerProgress[];
  winnerId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Achievements unlocked by the winner side-effect of finishing this match. */
  winnerAchievementsUnlocked?: AchievementDef[];
  /** Same for the loser (ELO milestones can fire on loss). */
  loserAchievementsUnlocked?: AchievementDef[];
}

/**
 * Wrapper-result shape : retourne soit le match, soit une erreur structurée.
 * Avant : `Promise<Match | null>` — toute panne (réseau, 4xx, 5xx, parse JSON)
 * tombait sur `null` et l'UI affichait "backend offline" sans diagnostic.
 * Maintenant : on remonte un objet `{ ok: false, error: string }` pour que
 * le QuickMatchScreen puisse afficher la VRAIE cause (e.g. "BAD_REQUEST :
 * variant manquante", "Network request failed", "API error: 500", etc.).
 */
export type MatchResult =
  | { ok: true; match: SolitaireMatch }
  | { ok: false; error: string };

export async function quickMatch(payload: {
  variant: string; difficulty?: string; userId: string; displayName: string;
}): Promise<MatchResult> {
  // eslint-disable-next-line no-console
  console.log('[api.quickMatch] POST /solitaire-matches/quick-match', { variant: payload.variant, userId: payload.userId, displayName: payload.displayName });
  try {
    const data = await fetchWithToken('/solitaire-matches/quick-match', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // eslint-disable-next-line no-console
    console.log('[api.quickMatch] ← response', { success: data?.success, code: data?.data?.code, status: data?.data?.status });
    if (data?.success && data.data) return { ok: true, match: data.data as SolitaireMatch };
    return { ok: false, error: data?.error ?? 'Réponse backend invalide' };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[api.quickMatch] ✗ failed', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'Erreur réseau' };
  }
}

export async function joinMatch(code: string, payload: {
  userId: string; displayName: string;
}): Promise<MatchResult> {
  // eslint-disable-next-line no-console
  console.log(`[api.joinMatch] POST /solitaire-matches/join/${code}`, { userId: payload.userId });
  try {
    const data = await fetchWithToken(`/solitaire-matches/join/${encodeURIComponent(code)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // eslint-disable-next-line no-console
    console.log('[api.joinMatch] ← response', { success: data?.success, code: data?.data?.code });
    if (data?.success && data.data) return { ok: true, match: data.data as SolitaireMatch };
    return { ok: false, error: data?.error ?? 'Code introuvable ou match plein' };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[api.joinMatch] ✗ failed', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'Erreur réseau' };
  }
}

export async function getMatch(code: string): Promise<SolitaireMatch | null> {
  try {
    const data = await fetchWithToken(`/solitaire-matches/${encodeURIComponent(code)}`);
    return data?.success ? (data.data as SolitaireMatch) : null;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[api.getMatch] ✗ polling failed', e?.message ?? e);
    return null;
  }
}

/**
 * Update progress d'un match. **`actions[]` est requis par défaut** pour
 * permettre l'anti-cheat fort côté serveur (re-simulation via gameReducer).
 *
 * Si tu n'as pas la liste d'actions (cas legacy), passe `actions: []` :
 * le backend ne fera que les sanity checks (pas de hard validation).
 */
export async function reportMatchProgress(code: string, payload: {
  userId: string;
  score: number;
  moves: number;
  finished?: boolean;
  actions: any[]; // requis par défaut (anti-cheat fort)
}): Promise<SolitaireMatch | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/${encodeURIComponent(code)}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Anti-cheat refus : on log mais on ne crashe pas
      console.warn(`reportMatchProgress rejected: ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json?.success ? (json.data as SolitaireMatch) : null;
  } catch { return null; }
}

/**
 * Race replay snapshot returned by `GET /solitaire-matches/:code/replay`.
 * `players[].actions` is the full per-player action log (each entry has a
 * variant-specific shape — feed to the right `gameReducer` to step through).
 * `actionsCount` is a convenience field so the UI doesn't have to walk the
 * array to show "0/127 coups".
 */
export interface RaceReplay {
  code: string;
  variant: string;
  difficulty: string;
  initialState: any;
  dealHash?: string;
  status: 'waiting' | 'playing' | 'finished';
  winnerId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** True when the server flagged the match — ELO was skipped. */
  flagged: boolean;
  flagReasons: string[];
  players: Array<{
    userId: string;
    displayName: string;
    score: number;
    moves: number;
    finished: boolean;
    finishedAt: number | null;
    actionsCount: number;
    actions: any[];
  }>;
}

export async function fetchRaceReplay(code: string): Promise<RaceReplay | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/${encodeURIComponent(code)}/replay`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as RaceReplay) : null;
  } catch { return null; }
}

/**
 * Compact per-match summary for the "Mes races" history screen. The server
 * trims out actions[] and initialState so this stays light even with 50+
 * matches — the user clicks one to load the full replay via `fetchRaceReplay`.
 *
 * `youWon` is null when the match isn't finished yet (status='playing').
 */
export interface RaceHistoryEntry {
  code: string;
  variant: string;
  difficulty: string;
  status: 'waiting' | 'playing' | 'finished';
  winnerId: string | null;
  finishedAt: number | null;
  startedAt: number | null;
  createdAt: string;
  selfScore: number;
  selfMoves: number;
  selfFinished: boolean;
  /** Opponent userId — null when the match was created but nobody joined yet. */
  opponentUserId: string | null;
  opponentDisplayName: string | null;
  opponentScore: number | null;
  opponentMoves: number | null;
  youWon: boolean | null;
  /** True when server-side anti-cheat caught suspicious plausibility values
   *  (too-fast finish, impossible score, too-few moves). ELO not applied. */
  flagged: boolean;
  /** Human-readable failure reasons populated alongside `flagged`. */
  flagReasons: string[];
}

export async function fetchMyRaces(userId: string, opts?: {
  limit?: number;
  includeWaiting?: boolean;
}): Promise<RaceHistoryEntry[]> {
  try {
    const q = new URLSearchParams();
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.includeWaiting) q.set('includeWaiting', '1');
    const url = `${API_URL}/solitaire-matches/user/${encodeURIComponent(userId)}/recent` +
      (q.toString() ? `?${q.toString()}` : '');
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success && Array.isArray(json.data) ? (json.data as RaceHistoryEntry[]) : [];
  } catch { return []; }
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  bestScore: number;
  bestMoves: number;
  bestDurationMs: number;
  totalWins: number;
}

export type LeaderboardSort = 'score' | 'time' | 'moves';

export async function fetchSolitaireLeaderboard(
  variant: string,
  limit = 100,
  sort: LeaderboardSort = 'score',
): Promise<LeaderboardEntry[]> {
  try {
    const path = sort === 'time'
      ? `/solitaire-matches/leaderboard/${encodeURIComponent(variant)}/time?limit=${limit}`
      : sort === 'moves'
      ? `/solitaire-matches/leaderboard/${encodeURIComponent(variant)}/moves?limit=${limit}`
      : `/solitaire-matches/leaderboard/${encodeURIComponent(variant)}?limit=${limit}`;
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as LeaderboardEntry[]) : [];
  } catch { return []; }
}

// ─── Rewards (XP / coins / streak) ────────────────────────────────────
// Server-side daily-challenge wallet. Each user has one document with their
// current XP, coins, level, and consecutive-day streak. `awardDailyReward`
// is idempotent per (userId, variant, day) — repeated calls for the same
// variant on the same UTC day return `alreadyAwarded: true` without granting
// anything.

export interface UserRewards {
  userId: string;
  displayName: string;
  coins: number;
  xp: number;
  level: number;
  dailyStreak: number;
  bestStreak: number;
  totalDailyCompletions: number;
  lastDailyDate: string;
  todaysVariants: string[];
}

export interface AwardResult {
  alreadyAwarded: boolean;
  coinsAwarded: number;
  xpAwarded: number;
  newCoins: number;
  newXp: number;
  newLevel: number;
  newStreak: number;
  bestStreak: number;
  /** Achievements unlocked as a side-effect of this award (server-computed). */
  unlockedAchievements?: AchievementDef[];
  /** True when `xp_boost_2x` was active and `xpAwarded` was doubled. */
  xpBoosted?: boolean;
  /** Epoch-ms expiry of the user's active XP boost, or null if none. */
  xpBoostExpiresAt?: number | null;
}

export async function fetchUserRewards(userId: string): Promise<UserRewards | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/rewards/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as UserRewards | null) : null;
  } catch { return null; }
}

export async function awardDailyReward(payload: {
  userId: string; displayName: string; variant: string;
}): Promise<AwardResult | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/rewards/award-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as AwardResult) : null;
  } catch { return null; }
}

// ─── Tournaments ─────────────────────────────────────────────────────
// Single-elimination brackets at 4 / 8 / 16 players. Host creates →
// players register → host starts → bracket auto-spawns 1v1 matches as
// pairs become ready. Match results feed back into the bracket via the
// existing /progress endpoint (the tournamentCode field on the match
// triggers a server-side advance call).

export interface TournamentParticipant {
  userId: string;
  displayName: string;
  registeredAt: number;
  eliminated: boolean;
  finalRank?: number;
}

export interface TournamentBracketNode {
  round: number;
  position: number;
  p1UserId: string | null;
  p1DisplayName: string | null;
  p2UserId: string | null;
  p2DisplayName: string | null;
  matchCode: string | null;
  winnerUserId: string | null;
  /** 'winners' | 'losers' | 'grand-final'. Absent on single-elim docs. */
  bracketType?: 'winners' | 'losers' | 'grand-final';
}

export type TournamentFormat = 'single-elim' | 'double-elim' | 'round-robin';

export interface Tournament {
  code: string;
  name: string;
  variant: string;
  difficulty: string;
  status: 'registration' | 'playing' | 'finished';
  format: TournamentFormat;
  maxParticipants: number;
  participants: TournamentParticipant[];
  bracket: TournamentBracketNode[];
  championUserId: string | null;
  championDisplayName: string | null;
  runnerUpUserId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  hostUserId: string;
  /** True once champion + runner-up have been credited. Idempotency guard. */
  rewardsPaid: boolean;
  /** Coins credited to the champion when status flipped to 'finished'. */
  championCoinsRewarded: number;
  /** Coins credited to the runner-up. */
  runnerUpCoinsRewarded: number;
  /** Champion's lifetime tournament wins snapshot at finish time. */
  championLifetimeWins: number;
  /** Per-person pot for each semifinalist (8p+ brackets only, else 0). */
  semifinalistCoinsRewarded?: number;
  /** Per-person pot for each quarterfinalist (16p only, else 0). */
  quarterfinalistCoinsRewarded?: number;
}

export async function fetchTournaments(opts?: { variant?: string; limit?: number }): Promise<Tournament[]> {
  try {
    const q = new URLSearchParams();
    if (opts?.variant) q.set('variant', opts.variant);
    if (opts?.limit) q.set('limit', String(opts.limit));
    const url = `${API_URL}/solitaire-tournaments${q.toString() ? `?${q.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success && Array.isArray(json.data) ? (json.data as Tournament[]) : [];
  } catch { return []; }
}

export async function fetchTournament(code: string): Promise<Tournament | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as Tournament) : null;
  } catch { return null; }
}

export async function createTournament(payload: {
  name: string;
  variant: string;
  difficulty?: string;
  maxParticipants: number;
  hostUserId: string;
  hostDisplayName: string;
  format?: TournamentFormat;
}): Promise<Tournament | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as Tournament) : null;
  } catch { return null; }
}

export async function registerToTournament(code: string, userId: string, displayName: string): Promise<Tournament | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments/${encodeURIComponent(code)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, displayName }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as Tournament) : null;
  } catch { return null; }
}

export async function startTournament(code: string, hostUserId: string): Promise<Tournament | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments/${encodeURIComponent(code)}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostUserId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as Tournament) : null;
  } catch { return null; }
}

export interface PendingTournamentMatch {
  tournamentCode: string;
  tournamentName: string;
  matchCode: string;
  round: number;
  position: number;
  opponentDisplayName: string | null;
  variant: string;
}

export async function registerPushToken(payload: {
  userId: string;
  token: string;
  displayName?: string;
  platform?: 'ios' | 'android' | 'web';
}): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments/push-tokens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.success;
  } catch { return false; }
}

export interface NotificationPrefs {
  userId: string;
  matchReady: boolean;
  achievement: boolean;
  tournamentResult: boolean;
  streakReminder: boolean;
}

export interface NotificationEntry {
  id: string;
  userId: string;
  category: 'matchReady' | 'achievement' | 'tournamentResult' | 'streakReminder';
  title: string;
  body: string;
  routeTo: string | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(userId: string, limit = 30, offset = 0): Promise<NotificationEntry[]> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/notifications/${encodeURIComponent(userId)}?limit=${limit}&offset=${offset}`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success && Array.isArray(json.data) ? (json.data as NotificationEntry[]) : [];
  } catch { return []; }
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/notifications/${encodeURIComponent(userId)}/unread-count`,
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.success ? (json.data?.count ?? 0) : 0;
  } catch { return 0; }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/notifications/${encodeURIComponent(userId)}/mark-all-read`,
      { method: 'POST' },
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.success ? (json.data?.modified ?? 0) : 0;
  } catch { return 0; }
}

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs | null> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/notification-prefs/${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as NotificationPrefs) : null;
  } catch { return null; }
}

export async function updateNotificationPrefs(
  userId: string,
  patch: Partial<Pick<NotificationPrefs, 'matchReady' | 'achievement' | 'tournamentResult'>>,
): Promise<NotificationPrefs | null> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/notification-prefs/${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as NotificationPrefs) : null;
  } catch { return null; }
}

export async function setUserTimezone(userId: string, displayName: string, timezone: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/rewards/timezone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, displayName, timezone }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.success;
  } catch { return false; }
}

export async function unregisterPushTokens(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/solitaire-tournaments/push-tokens/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.success;
  } catch { return false; }
}

/** Tournament bracket matches awaiting this user's play (for the home banner). */
export async function fetchPendingTournamentMatches(userId: string): Promise<PendingTournamentMatch[]> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-tournaments/user/${encodeURIComponent(userId)}/pending`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success && Array.isArray(json.data) ? (json.data as PendingTournamentMatch[]) : [];
  } catch { return []; }
}

// ─── Achievements ─────────────────────────────────────────────────────
// Static catalog of unlockable badges (race wins, ELO milestones, daily
// streaks, XP levels, shop purchases). Each unlock grants coins automatically.
// Reward / shop / purchase endpoints return `unlockedAchievements: AchievementDef[]`
// so the UI can show a toast when something is newly unlocked.

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  coinsReward: number;
  category: 'race' | 'daily' | 'collection' | 'progression';
  order: number;
}

export interface UserAchievementUnlock {
  achievementId: string;
  unlockedAt: number;
  coinsRewarded: number;
  def: AchievementDef | null;
}

export interface UserAchievementsDto {
  userId: string;
  displayName: string;
  unlocked: UserAchievementUnlock[];
  totalCoinsFromAchievements: number;
  progress: { unlocked: number; total: number };
}

export async function fetchAchievementsCatalog(): Promise<AchievementDef[]> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/achievements/catalog`);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as AchievementDef[]) : [];
  } catch { return []; }
}

export async function fetchUserAchievements(userId: string): Promise<UserAchievementsDto | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/achievements/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as UserAchievementsDto) : null;
  } catch { return null; }
}

// ─── Shop ─────────────────────────────────────────────────────────────
// Coins-spendable catalog of consumables (hints, undos, streak saves),
// cosmetics (skins) and boosts (XP multiplier). Each purchase debits the
// user's reward wallet and grants the item to their inventory.

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: 'consumable' | 'cosmetic' | 'boost';
  priceCoins: number;
  icon: string;
  qtyPerPurchase: number;
  oneTime?: boolean;
}

export interface InventoryEntry {
  itemId: string;
  qty: number;
  acquiredAt: number;
  itemMeta: ShopItem | null;
  /** Epoch-ms expiry for timed boosts (e.g. `xp_boost_2x`). Absent otherwise. */
  activeUntil?: number | null;
}

export interface InventoryDto {
  userId: string;
  displayName: string;
  items: InventoryEntry[];
  totalPurchases: number;
  totalCoinsSpent: number;
}

export type PurchaseResult =
  | { ok: true; item: ShopItem; coinsBefore: number; coinsAfter: number; inventoryQty: number; unlockedAchievements?: AchievementDef[] }
  | { ok: false; reason: 'unknown-item' | 'insufficient-coins' | 'already-owned' | 'BAD_REQUEST'; needed?: number; has?: number; unlockedAchievements?: AchievementDef[] };

export async function fetchShopItems(): Promise<ShopItem[]> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/shop/items`);
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as ShopItem[]) : [];
  } catch { return []; }
}

export async function fetchInventory(userId: string): Promise<InventoryDto | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/shop/inventory/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as InventoryDto | null) : null;
  } catch { return null; }
}

export async function purchaseShopItem(payload: {
  userId: string; displayName: string; itemId: string;
}): Promise<PurchaseResult | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/shop/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as PurchaseResult) : null;
  } catch { return null; }
}

export type ConsumeResult =
  | { ok: true; itemId: string; remaining: number }
  | { ok: false; reason: 'unknown-item' | 'not-owned' | 'insufficient-qty' | 'cosmetic-not-consumable' | 'BAD_REQUEST'; has?: number };

/** Consume one or more units of an inventory item (typically a hint or undo). */
export async function consumeInventoryItem(payload: {
  userId: string; itemId: string; qty?: number;
}): Promise<ConsumeResult | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/shop/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as ConsumeResult) : null;
  } catch { return null; }
}

// ─── Daily leaderboard ────────────────────────────────────────────────
// Top scores submitted TODAY (UTC) for a variant. The list resets at
// midnight UTC, which gives players a daily FOMO loop. Pair with the
// existing /game/solo?variant=X&daily=1 deep-link to drive engagement.

export async function fetchDailyLeaderboard(
  variant: string,
  dateIso?: string,
  limit: number = 20,
): Promise<LeaderboardEntry[]> {
  try {
    const q = new URLSearchParams({ limit: String(limit) });
    if (dateIso) q.set('date', dateIso);
    const res = await fetch(
      `${API_URL}/solitaire-matches/daily-leaderboard/${encodeURIComponent(variant)}?${q.toString()}`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as LeaderboardEntry[]) : [];
  } catch { return []; }
}

// ─── Race ELO ─────────────────────────────────────────────────────────
// 1v1 race ELO ranking (variant='global' = aggregate across all 177 variants).
// ELO is computed server-side at match finish using EloService.computeDuelDeltas.

export interface RaceEloEntry {
  rank: number;
  userId: string;
  displayName: string;
  variant: string;
  elo: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export async function fetchRaceLeaderboard(
  variant: string = 'global',
  limit: number = 50,
): Promise<RaceEloEntry[]> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-matches/race-leaderboard?variant=${encodeURIComponent(variant)}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json?.success ? (json.data as RaceEloEntry[]) : [];
  } catch { return []; }
}

export async function fetchUserRaceElo(
  userId: string,
  variant: string = 'global',
): Promise<RaceEloEntry | null> {
  try {
    const res = await fetch(
      `${API_URL}/solitaire-matches/race-elo/${encodeURIComponent(userId)}?variant=${encodeURIComponent(variant)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as RaceEloEntry | null) : null;
  } catch { return null; }
}

export async function submitSolitaireScore(payload: {
  userId: string; displayName: string; variant: string;
  difficulty?: string; score: number; moves: number; durationMs: number; won?: boolean;
}): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/score-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return !!json?.success;
  } catch { return false; }
}

/** GET /deal-seeds/stats — retourne le breakdown par variante. */
export async function fetchDealSeedStats(): Promise<DealSeedStats | null> {
  try {
    const res = await fetch(`${API_URL}/deal-seeds/stats`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    const data = json.data;
    // Compat ancien format (plat) → nouveau
    if (data && !('total' in data) && typeof data === 'object') {
      const total: Record<string, number> = data;
      let g = 0;
      for (const k of Object.keys(total)) g += total[k];
      return { total, withSolution: {}, coverage: {}, grandTotal: g, grandWithSolution: 0 };
    }
    return data as DealSeedStats;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SPIDER V2 — deals pré-générés (collection spider_deals_v2)
// ─────────────────────────────────────────────────────────────────────────

export interface SpiderDealV2 {
  _id: string;
  variant: string;
  difficulty: string;
  solvable: boolean;
  total_turns: number;
  solution_length: number;
  turns: Array<{
    turn: number;
    move: { type: string; from?: number; to?: number; count?: number } | null;
    description?: string;
    state: {
      tableau: string[][];
      stock: string[][];
      foundations: any[];
    };
  }>;
}

/**
 * Unwrap the API response. The NestJS global interceptor wraps EVERY response
 * as `{success, data, timestamp}`. Some controllers ALSO wrap their return
 * value the same way (legacy), so we may end up with `{success, data: {success, data: X}}`.
 * This helper handles both single and double wrapping.
 */
function unwrapApiResponse<T>(json: any): T | null {
  // Single wrap: {success, data: X}
  if (json?.success && json?.data !== undefined) {
    const inner = json.data;
    // Double wrap: data itself is {success, data: X}
    if (inner?.success !== undefined && inner?.data !== undefined) {
      // If inner is a wrapper, unwrap once more (else inner IS the data)
      if (typeof inner.success === 'boolean' && (inner.data || inner.error)) {
        return inner.success ? (inner.data as T) : null;
      }
    }
    return inner as T;
  }
  return null;
}

/**
 * GET /deal-seeds/spider-v2/random — un deal aléatoire.
 * @param difficulty 'easy' | 'medium' | 'hard'
 * @param variant '1-suit' | '2-suit' | '4-suit' (filtre par variant Spider)
 */
export async function fetchRandomSpiderV2Deal(
  difficulty?: string,
  variant?: string,
): Promise<SpiderDealV2 | null> {
  try {
    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    if (variant) params.set('variant', variant);
    const qs = params.toString();
    const url = `${API_URL}/deal-seeds/spider-v2/random${qs ? `?${qs}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const deal = unwrapApiResponse<SpiderDealV2>(json);
    if (!deal || !deal._id) {
      console.warn('[api] fetchRandomSpiderV2Deal: deal sans _id reçu', JSON.stringify(json).slice(0, 200));
      return null;
    }
    return deal;
  } catch (err) {
    console.warn('[api] fetchRandomSpiderV2Deal error:', err);
    return null;
  }
}

/** GET /deal-seeds/spider-v2/:dealId — un deal spécifique avec tous les turns. */
export async function fetchSpiderV2DealById(dealId: string): Promise<SpiderDealV2 | null> {
  try {
    const url = `${API_URL}/deal-seeds/spider-v2/${encodeURIComponent(dealId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const deal = unwrapApiResponse<SpiderDealV2>(json);
    if (!deal || !deal._id) {
      console.warn('[api] fetchSpiderV2DealById: deal sans _id reçu', JSON.stringify(json).slice(0, 200));
      return null;
    }
    return deal;
  } catch (err) {
    console.warn('[api] fetchSpiderV2DealById error:', err);
    return null;
  }
}
