/**
 * Tests pour le module achievements (prédicats sur les replays).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACHIEVEMENTS, evaluateAchievements } from '../../src/game/achievements';
import { saveReplay, Replay } from '../../src/game/replays';

function rep(overrides: Partial<Replay> = {}): Replay {
  return {
    id: `id-${Math.random().toString(36).slice(2, 7)}`,
    variantKey: 'klondike-1',
    difficulty: 'medium',
    wonAt: Date.now(),
    moves: 100,
    score: 500,
    durationMs: 60_000,
    initialState: { phase: 'playing' },
    actions: [],
    ...overrides,
  };
}

describe('achievements', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('expose au moins 10 achievements définis', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.rarity).toMatch(/common|rare|epic|legendary/);
      expect(typeof a.check).toBe('function');
    }
  });

  it('first-win se débloque avec 1 replay', async () => {
    await saveReplay(rep());
    const r = await evaluateAchievements();
    expect(r.unlocked['first-win']).toBeTruthy();
  });

  it('win-10 ne se débloque pas avant 10 victoires', async () => {
    for (let i = 0; i < 5; i++) {
      await saveReplay(rep({ id: `r-${i}` }));
    }
    const r = await evaluateAchievements();
    expect(r.unlocked['win-10']).toBeFalsy();
    expect(r.unlocked['first-win']).toBeTruthy();
  });

  it('win-10 se débloque à partir de 10 victoires', async () => {
    for (let i = 0; i < 10; i++) {
      await saveReplay(rep({ id: `r-${i}` }));
    }
    const r = await evaluateAchievements();
    expect(r.unlocked['win-10']).toBeTruthy();
  });

  it('win-hard se débloque avec 1 victoire en hard', async () => {
    await saveReplay(rep({ difficulty: 'hard' }));
    const r = await evaluateAchievements();
    expect(r.unlocked['win-hard']).toBeTruthy();
  });

  it('speedrun-1min se débloque avec une partie < 60s', async () => {
    await saveReplay(rep({ durationMs: 45_000 }));
    const r = await evaluateAchievements();
    expect(r.unlocked['speedrun-1min']).toBeTruthy();
    expect(r.unlocked['speedrun-2min']).toBeTruthy();
  });

  it('low-moves-50 requiert moins de 50 coups', async () => {
    await saveReplay(rep({ moves: 49 }));
    const r = await evaluateAchievements();
    expect(r.unlocked['low-moves-50']).toBeTruthy();
  });

  it('all-variants requiert toutes les 9 familles', async () => {
    const variants = ['klondike-1', 'spider-1', 'freecell', 'yukon', 'golf',
                      'pyramid', 'tripeaks', 'forty-thieves', 'accordion'];
    for (const v of variants) {
      await saveReplay(rep({ id: `v-${v}`, variantKey: v }));
    }
    const r = await evaluateAchievements();
    expect(r.unlocked['all-variants']).toBeTruthy();
  });

  it('newlyUnlocked = uniquement les nouveaux ; persiste les anciens', async () => {
    await saveReplay(rep());
    const r1 = await evaluateAchievements();
    expect(r1.newlyUnlocked.find((a) => a.id === 'first-win')).toBeTruthy();
    const r2 = await evaluateAchievements();
    // 2e éval : first-win ne doit plus apparaître dans newlyUnlocked
    expect(r2.newlyUnlocked.find((a) => a.id === 'first-win')).toBeFalsy();
    expect(r2.unlocked['first-win']).toBeTruthy();
  });
});
