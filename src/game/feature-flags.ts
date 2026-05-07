/**
 * @file feature-flags.ts
 * @description Système de feature flags / A/B testing local-first.
 *
 * Bucket déterministe : hash(userId or deviceId) % 100. Les variantes sont
 * définies dans `EXPERIMENTS`. La variante actuelle est persistée pour
 * stabilité entre sessions.
 *
 * Pour des flags backend-driven, ajouter un endpoint `/feature-flags` qui
 * retourne `{ flagId: variantKey }` selon `userId`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '../utils/analytics';

const STORAGE_KEY = 'feature-flags:bucket';
const STORAGE_DEVICE_ID = 'feature-flags:device-id';

export interface ExperimentVariant {
  key: string;
  weight: number;        // pourcentage (somme = 100)
  description?: string;
}

export interface Experiment {
  id: string;
  description: string;
  variants: ExperimentVariant[];
}

/**
 * Catalogue des expérimentations actives.
 * Pour ajouter une expé : ajouter ici, choisir variant via `getVariant(id)`.
 */
export const EXPERIMENTS: Experiment[] = [
  {
    id: 'ai-tutorial-style',
    description: 'Tutoriel AI : long vs court',
    variants: [
      { key: 'control', weight: 50, description: 'Tutoriel original (paragraphe)' },
      { key: 'short', weight: 50, description: 'Tutoriel court (3 puces)' },
    ],
  },
  {
    id: 'home-cta',
    description: 'Bouton CTA accueil : "Jouer" vs "Quick Match"',
    variants: [
      { key: 'play', weight: 50 },
      { key: 'quick-match', weight: 50 },
    ],
  },
  {
    id: 'difficulty-default',
    description: 'Difficulté par défaut au 1er lancement',
    variants: [
      { key: 'easy', weight: 30 },
      { key: 'medium', weight: 60 },
      { key: 'hard', weight: 10 },
    ],
  },
];

let _deviceIdCache: string | null = null;
let _bucketsCache: Record<string, string> = {};

/** Stable device ID (persisté). */
async function getDeviceId(): Promise<string> {
  if (_deviceIdCache) return _deviceIdCache;
  let id = await AsyncStorage.getItem(STORAGE_DEVICE_ID);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    await AsyncStorage.setItem(STORAGE_DEVICE_ID, id);
  }
  _deviceIdCache = id;
  return id;
}

/** Hash 32-bit deterministic. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pick variant déterministe pour (deviceId, experimentId). */
function pickVariant(deviceId: string, exp: Experiment): string {
  const h = hashStr(`${deviceId}-${exp.id}`) % 100;
  let acc = 0;
  for (const v of exp.variants) {
    acc += v.weight;
    if (h < acc) return v.key;
  }
  return exp.variants[exp.variants.length - 1].key;
}

/**
 * Récupère la variante active pour une expérience. Cache les buckets pour
 * stabilité dans la session, persiste pour les sessions suivantes.
 */
export async function getVariant(experimentId: string): Promise<string | null> {
  const exp = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!exp) return null;

  // Cache mémoire
  if (_bucketsCache[experimentId]) return _bucketsCache[experimentId];

  // Cache persistant
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const persisted: Record<string, string> = JSON.parse(raw);
      if (persisted[experimentId]) {
        _bucketsCache[experimentId] = persisted[experimentId];
        return persisted[experimentId];
      }
    }
  } catch { /* silent */ }

  // Calcul nouveau bucket
  const deviceId = await getDeviceId();
  const variant = pickVariant(deviceId, exp);
  _bucketsCache[experimentId] = variant;

  // Persiste
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const persisted: Record<string, string> = raw ? JSON.parse(raw) : {};
    persisted[experimentId] = variant;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch { /* silent */ }

  // Track exposure (analytics)
  track('experiment_exposed', { experimentId, variant });
  return variant;
}

/** Variante synchrone (cache). À utiliser après `getVariant()` au mount. */
export function getVariantSync(experimentId: string): string | null {
  return _bucketsCache[experimentId] ?? null;
}

/** Force une variante (debug uniquement). */
export async function forceVariant(experimentId: string, variant: string): Promise<void> {
  _bucketsCache[experimentId] = variant;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const persisted: Record<string, string> = raw ? JSON.parse(raw) : {};
    persisted[experimentId] = variant;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch { /* silent */ }
}

/** Reset toutes les buckets (debug). */
export async function resetAllExperiments(): Promise<void> {
  _bucketsCache = {};
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* silent */ }
}
