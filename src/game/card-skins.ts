/**
 * @file card-skins.ts
 * @description Catalogue des skins de cartes + persistance des préférences user.
 *
 * Stockage local (AsyncStorage) — pour la synchro cross-device, ces prefs
 * pourraient être push vers /users/me/settings/cardSkin.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type SkinId =
  | 'classic'      // 🎴 défaut
  | 'minimal'      // ⚪ blanc épuré
  | 'neon'         // 💎 fluo bordures
  | 'royal'        // 👑 doré royal
  | 'aqua'         // 🌊 bleu aquatique
  | 'sunset'       // 🌅 dégradé orange/rose
  | 'forest';      // 🌲 vert sombre

export interface CardSkin {
  id: SkinId;
  name: string;
  emoji: string;
  description: string;
  /** Coût en gold virtuel — 0 = gratuit. */
  cost: number;
  /** Couleurs principales pour preview/border. */
  primary: string;
  secondary: string;
  /** Si true, exigeait un achat dans la shop pour être actif. */
  premium: boolean;
}

export const SKIN_CATALOG: CardSkin[] = [
  {
    id: 'classic',
    name: 'Classique',
    emoji: '🎴',
    description: 'Le design original, intemporel.',
    cost: 0,
    primary: '#FFFFFF',
    secondary: '#1F2937',
    premium: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    emoji: '⚪',
    description: 'Épuré, blanc pur, ultra-lisible.',
    cost: 0,
    primary: '#F9FAFB',
    secondary: '#374151',
    premium: false,
  },
  {
    id: 'neon',
    name: 'Néon',
    emoji: '💎',
    description: 'Bordures fluo cyan/magenta.',
    cost: 200,
    primary: '#0EA5E9',
    secondary: '#A855F7',
    premium: true,
  },
  {
    id: 'royal',
    name: 'Royal',
    emoji: '👑',
    description: 'Doré, accents pourpres, prestigieux.',
    cost: 500,
    primary: '#F59E0B',
    secondary: '#7E22CE',
    premium: true,
  },
  {
    id: 'aqua',
    name: 'Aqua',
    emoji: '🌊',
    description: 'Bleu aquatique apaisant.',
    cost: 200,
    primary: '#06B6D4',
    secondary: '#0E7490',
    premium: true,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    emoji: '🌅',
    description: 'Dégradé orange/rose chaleureux.',
    cost: 200,
    primary: '#F97316',
    secondary: '#EC4899',
    premium: true,
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌲',
    description: 'Vert sombre nature.',
    cost: 200,
    primary: '#15803D',
    secondary: '#064E3B',
    premium: true,
  },
];

const STORAGE_SELECTED = 'cardSkin:selected';
const STORAGE_OWNED = 'cardSkin:owned';

/** Skin actuellement actif (défaut: classic). */
export async function getSelectedSkin(): Promise<SkinId> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SELECTED);
    return (raw as SkinId) ?? 'classic';
  } catch { return 'classic'; }
}

export async function selectSkin(id: SkinId): Promise<void> {
  await AsyncStorage.setItem(STORAGE_SELECTED, id);
}

/** Liste des skins possédés (achetés ou gratuits). */
export async function getOwnedSkins(): Promise<SkinId[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_OWNED);
    const owned: SkinId[] = raw ? JSON.parse(raw) : [];
    // Toujours inclure les gratuits
    const free = SKIN_CATALOG.filter((s) => !s.premium).map((s) => s.id);
    const all = Array.from(new Set([...free, ...owned]));
    return all;
  } catch { return SKIN_CATALOG.filter((s) => !s.premium).map((s) => s.id); }
}

export async function purchaseSkin(id: SkinId): Promise<{ ok: boolean; reason?: string }> {
  const skin = SKIN_CATALOG.find((s) => s.id === id);
  if (!skin) return { ok: false, reason: 'Skin inconnu' };
  // Note : la déduction du gold se fait côté backend (shop).
  // Ici on stocke juste l'ownership.
  const owned = await getOwnedSkins();
  if (owned.includes(id)) return { ok: false, reason: 'Déjà possédé' };
  owned.push(id);
  await AsyncStorage.setItem(STORAGE_OWNED, JSON.stringify(owned));
  return { ok: true };
}

export function findSkin(id: SkinId): CardSkin | null {
  return SKIN_CATALOG.find((s) => s.id === id) ?? null;
}
