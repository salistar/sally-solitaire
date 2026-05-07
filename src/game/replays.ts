/**
 * @file replays.ts
 * @description Stockage local des replays de parties gagnées.
 *
 * Format :
 *   replays:<variantKey> → [{ wonAt, moves, score, durationMs, initialState, actions }]
 *
 * Capacité : 20 replays max par variante (FIFO). Les anciens sont supprimés.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'replay:';
const MAX_PER_VARIANT = 20;

export interface Replay {
  id: string;                // unique
  variantKey: string;
  difficulty: string;
  wonAt: number;             // timestamp ms
  moves: number;
  score: number;
  durationMs: number;
  initialState: any;
  actions: any[];            // séquence GameAction
  dealHash?: string;
}

function keyFor(variantKey: string): string {
  return `${KEY_PREFIX}${variantKey}`;
}

/**
 * Sauvegarde un replay (FIFO 20 max). Idempotent : ignore si dealHash déjà
 * présent (évite duplicatas).
 */
export async function saveReplay(replay: Replay): Promise<void> {
  try {
    const key = keyFor(replay.variantKey);
    const raw = await AsyncStorage.getItem(key);
    const list: Replay[] = raw ? JSON.parse(raw) : [];
    if (replay.dealHash && list.some((r) => r.dealHash === replay.dealHash)) {
      // Déjà sauvegardé → skip
      return;
    }
    list.unshift(replay);
    while (list.length > MAX_PER_VARIANT) list.pop();
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch (err) {
    // Silent : replay non-critique
    console.log('[Replay] save failed', err);
  }
}

/** Liste les replays d'une variante (du + récent au + vieux). */
export async function listReplays(variantKey: string): Promise<Replay[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(variantKey));
    return raw ? (JSON.parse(raw) as Replay[]) : [];
  } catch {
    return [];
  }
}

/** Liste TOUS les replays toutes variantes (pour un écran "Mes victoires"). */
export async function listAllReplays(): Promise<Replay[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const replayKeys = keys.filter((k) => k.startsWith(KEY_PREFIX));
    const all: Replay[] = [];
    for (const k of replayKeys) {
      const raw = await AsyncStorage.getItem(k);
      if (raw) all.push(...(JSON.parse(raw) as Replay[]));
    }
    return all.sort((a, b) => b.wonAt - a.wonAt);
  } catch {
    return [];
  }
}

/** Supprime un replay par ID. */
export async function deleteReplay(variantKey: string, id: string): Promise<void> {
  try {
    const key = keyFor(variantKey);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const list: Replay[] = JSON.parse(raw);
    const filtered = list.filter((r) => r.id !== id);
    await AsyncStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    /* silent */
  }
}

/** Stats globales : total replays + temps min/avg/max par variante. */
export async function getReplayStats(): Promise<Record<string, {
  count: number; minMoves: number; avgMoves: number; minDurationMs: number;
}>> {
  const all = await listAllReplays();
  const out: Record<string, { count: number; minMoves: number; avgMoves: number; minDurationMs: number }> = {};
  for (const r of all) {
    const v = r.variantKey;
    if (!out[v]) out[v] = { count: 0, minMoves: Infinity, avgMoves: 0, minDurationMs: Infinity };
    out[v].count++;
    out[v].avgMoves += r.moves;
    if (r.moves < out[v].minMoves) out[v].minMoves = r.moves;
    if (r.durationMs < out[v].minDurationMs) out[v].minDurationMs = r.durationMs;
  }
  for (const k of Object.keys(out)) {
    out[k].avgMoves = Math.round(out[k].avgMoves / out[k].count);
    if (out[k].minMoves === Infinity) out[k].minMoves = 0;
    if (out[k].minDurationMs === Infinity) out[k].minDurationMs = 0;
  }
  return out;
}
