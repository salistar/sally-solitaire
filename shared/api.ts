import { Platform } from 'react-native';
import Constants from 'expo-constants';

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

// In-memory token storage
let authToken: string | null = null;
let refreshToken: string | null = null;

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
        if (!res.ok) return false;
        const body = await res.json();
        const data = body.data ?? body;
        if (data.accessToken) authToken = data.accessToken;
        if (data.refreshToken) refreshToken = data.refreshToken;
        return !!data.accessToken;
      } catch {
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
      throw new Error(message);
    }

    const json = await response.json();
    // API wraps responses in { success, data, timestamp } — unwrap
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
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

    return data;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

export async function getMe(): Promise<User> {
  try {
    const data = await fetchWithToken('/users/me', {
      method: 'GET',
    });
    return data;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    throw error;
  }
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

    return data;
  } catch (error) {
    console.error('Token refresh failed:', error);
    authToken = null;
    refreshToken = null;
    throw error;
  }
}

export async function logout() {
  authToken = null;
  refreshToken = null;
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
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}/my-rank?filter=${filter}`,
      { method: 'GET' }
    );
    return data;
  } catch (error) {
    console.error(`Failed to fetch rank for ${gameType}:`, error);
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
}

export async function quickMatch(payload: {
  variant: string; difficulty?: string; userId: string; displayName: string;
}): Promise<SolitaireMatch | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/quick-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json?.success ? (json.data as SolitaireMatch) : null;
  } catch { return null; }
}

export async function joinMatch(code: string, payload: {
  userId: string; displayName: string;
}): Promise<SolitaireMatch | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/join/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json?.success ? (json.data as SolitaireMatch) : null;
  } catch { return null; }
}

export async function getMatch(code: string): Promise<SolitaireMatch | null> {
  try {
    const res = await fetch(`${API_URL}/solitaire-matches/${encodeURIComponent(code)}`);
    const json = await res.json();
    return json?.success ? (json.data as SolitaireMatch) : null;
  } catch { return null; }
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
