/**
 * @file achievements.ts
 * @description Système d'achievements (badges débloqués) basé sur les
 * replays sauvegardés localement. Chaque achievement est défini par une
 * fonction de prédicat sur la liste des replays.
 *
 * Stockage : `achievements:unlocked` = { id: timestamp }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Replay, listAllReplays } from './replays';

const STORAGE_KEY = 'achievements:unlocked';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;            // nom Ionicon
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** Vérifie si débloqué selon la liste actuelle de replays. */
  check: (replays: Replay[]) => boolean;
}

/** Liste statique des achievements. */
export const ACHIEVEMENTS: Achievement[] = [
  // Première victoire
  {
    id: 'first-win',
    title: 'Premier Triomphe',
    description: 'Gagne ta toute première partie.',
    icon: 'trophy',
    rarity: 'common',
    check: (rs) => rs.length >= 1,
  },
  // Volume
  {
    id: 'win-10',
    title: 'Apprenti',
    description: 'Gagne 10 parties (toutes variantes).',
    icon: 'medal',
    rarity: 'common',
    check: (rs) => rs.length >= 10,
  },
  {
    id: 'win-50',
    title: 'Vétéran',
    description: 'Gagne 50 parties.',
    icon: 'star',
    rarity: 'rare',
    check: (rs) => rs.length >= 50,
  },
  {
    id: 'win-100',
    title: 'Légende',
    description: 'Gagne 100 parties.',
    icon: 'flame',
    rarity: 'legendary',
    check: (rs) => rs.length >= 100,
  },
  // Difficulté
  {
    id: 'win-hard',
    title: 'Cœur d\'acier',
    description: 'Gagne une partie en mode HARD.',
    icon: 'shield',
    rarity: 'rare',
    check: (rs) => rs.some((r) => r.difficulty === 'hard'),
  },
  {
    id: 'win-hard-5',
    title: 'Maître du chaos',
    description: 'Gagne 5 parties en mode HARD.',
    icon: 'flash',
    rarity: 'epic',
    check: (rs) => rs.filter((r) => r.difficulty === 'hard').length >= 5,
  },
  // Variétés
  {
    id: 'all-variants',
    title: 'Polyvalent',
    description: 'Gagne au moins une fois dans chacune des 9 variantes (groupes).',
    icon: 'apps',
    rarity: 'epic',
    check: (rs) => {
      const groups = new Set<string>();
      for (const r of rs) {
        if (r.variantKey.startsWith('klondike')) groups.add('klondike');
        else if (r.variantKey.startsWith('spider')) groups.add('spider');
        else groups.add(r.variantKey);
      }
      // 9 groupes cibles : klondike, spider, freecell, yukon, golf, pyramid, tripeaks, forty-thieves, accordion
      return groups.size >= 9;
    },
  },
  // Speed
  {
    id: 'speedrun-2min',
    title: 'Sprinter',
    description: 'Gagne une partie en moins de 2 minutes.',
    icon: 'stopwatch',
    rarity: 'rare',
    check: (rs) => rs.some((r) => r.durationMs > 0 && r.durationMs < 2 * 60_000),
  },
  {
    id: 'speedrun-1min',
    title: 'Foudre',
    description: 'Gagne une partie en moins d\'1 minute.',
    icon: 'flash-off',
    rarity: 'legendary',
    check: (rs) => rs.some((r) => r.durationMs > 0 && r.durationMs < 60_000),
  },
  // Efficacité
  {
    id: 'low-moves-50',
    title: 'Économe',
    description: 'Gagne une partie en moins de 50 coups.',
    icon: 'leaf',
    rarity: 'rare',
    check: (rs) => rs.some((r) => r.moves > 0 && r.moves < 50),
  },
  // Variantes spécifiques
  {
    id: 'klondike-master',
    title: 'Maître du Klondike',
    description: 'Gagne 10 Klondike.',
    icon: 'diamond',
    rarity: 'rare',
    check: (rs) => rs.filter((r) => r.variantKey.startsWith('klondike')).length >= 10,
  },
  {
    id: 'spider-4-win',
    title: 'Tisseur 4 couleurs',
    description: 'Gagne au moins une fois en Spider 4 couleurs.',
    icon: 'bug',
    rarity: 'epic',
    check: (rs) => rs.some((r) => r.variantKey === 'spider-4'),
  },
];

export interface UnlockedAchievement extends Achievement {
  unlockedAt: number;
}

/** Calcule + persiste les achievements. Retourne ceux nouvellement débloqués. */
export async function evaluateAchievements(): Promise<{
  all: Achievement[];
  unlocked: Record<string, number>;
  newlyUnlocked: Achievement[];
}> {
  const replays = await listAllReplays();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const unlocked: Record<string, number> = raw ? JSON.parse(raw) : {};
  const newlyUnlocked: Achievement[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (unlocked[ach.id]) continue;
    if (ach.check(replays)) {
      unlocked[ach.id] = Date.now();
      newlyUnlocked.push(ach);
    }
  }

  if (newlyUnlocked.length > 0) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));
  }

  return { all: ACHIEVEMENTS, unlocked, newlyUnlocked };
}

/** Lit les achievements unlocked sans recalculer. */
export async function getUnlockedAchievements(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
