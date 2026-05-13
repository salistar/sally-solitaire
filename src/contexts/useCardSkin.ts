/**
 * @file useCardSkin.ts
 * @description Card-back skin selection backed by AsyncStorage. The 3
 * cosmetic skins from the shop (skin_classic, skin_neon, skin_premium) map
 * to programmatic gradient overlays applied on top of the default back.png
 * image — no new assets needed.
 *
 * The hook also exposes the list of OWNED skins (via the inventory hook),
 * so the UI can show a selector with locked/unlocked items.
 *
 *   const skin = useCardSkin();
 *   <FrenchCard skinId={skin.current} ... />
 *   skin.setCurrent('skin_neon')  // refused if not owned
 */
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInventory } from './useInventory';

export type SkinId = 'default' | 'skin_classic' | 'skin_neon' | 'skin_premium';

export interface SkinDef {
  id: SkinId;
  /** Display name. */
  name: string;
  /** Gradient applied over the back-of-card image. */
  gradient: [string, string, string?];
  /** Opacity of the gradient overlay (0..1). 'default' is fully transparent. */
  overlayAlpha: number;
}

const SKINS: Record<SkinId, SkinDef> = {
  default: {
    id: 'default',
    name: 'Standard',
    gradient: ['transparent', 'transparent'],
    overlayAlpha: 0,
  },
  skin_classic: {
    id: 'skin_classic',
    name: 'Classique vintage',
    // Sepia/warm tint
    gradient: ['#92400E', '#F59E0B'],
    overlayAlpha: 0.45,
  },
  skin_neon: {
    id: 'skin_neon',
    name: 'Néon',
    // Cyan → magenta flashy
    gradient: ['#06B6D4', '#7C3AED', '#EC4899'],
    overlayAlpha: 0.55,
  },
  skin_premium: {
    id: 'skin_premium',
    name: 'Holographique premium',
    // Rainbow holographic — 3 stops for a more iridescent feel
    gradient: ['#A855F7', '#EC4899', '#F59E0B'],
    overlayAlpha: 0.7,
  },
};

const STORAGE_KEY = 'sally.solitaire.skin';

export function getSkinDef(id: SkinId): SkinDef {
  return SKINS[id] ?? SKINS.default;
}

export function listAllSkins(): SkinDef[] {
  return Object.values(SKINS);
}

export interface CardSkinHook {
  current: SkinId;
  /** Apply a skin. Refused if the user doesn't own it (returns false). */
  setCurrent: (id: SkinId) => Promise<boolean>;
  /** Is this skin in the user's inventory? `default` is always owned. */
  isOwned: (id: SkinId) => boolean;
  /** All skins available for the picker UI. */
  all: SkinDef[];
}

export function useCardSkin(): CardSkinHook {
  const inv = useInventory();
  const [current, setCurrentState] = useState<SkinId>('default');

  // Hydrate persisted choice
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in SKINS) {
        setCurrentState(stored as SkinId);
      }
    }).catch(() => {});
  }, []);

  const isOwned = useCallback((id: SkinId): boolean => {
    if (id === 'default') return true;
    return inv.owns(id);
  }, [inv]);

  const setCurrent = useCallback(async (id: SkinId): Promise<boolean> => {
    if (!isOwned(id)) return false;
    setCurrentState(id);
    try { await AsyncStorage.setItem(STORAGE_KEY, id); } catch {}
    return true;
  }, [isOwned]);

  // If the persisted skin is no longer owned (refund? data drift), fall back to default.
  useEffect(() => {
    if (current !== 'default' && !inv.loading && !isOwned(current)) {
      setCurrentState('default');
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, [current, inv.loading, isOwned]);

  return {
    current,
    setCurrent,
    isOwned,
    all: listAllSkins(),
  };
}
