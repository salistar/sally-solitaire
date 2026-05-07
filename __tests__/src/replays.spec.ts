/**
 * Tests pour le module replays (sauvegarde local des victoires).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveReplay, listReplays, listAllReplays, deleteReplay, getReplayStats, Replay } from '../../src/game/replays';

function makeReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    id: `id-${Math.random()}`,
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

describe('replays', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('saveReplay', () => {
    it('sauvegarde un replay et le rend récupérable', async () => {
      const r = makeReplay({ id: 'test-1' });
      await saveReplay(r);
      const list = await listReplays('klondike-1');
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('test-1');
    });

    it('skip les doublons par dealHash', async () => {
      const r1 = makeReplay({ id: 'a', dealHash: 'hash-X' });
      const r2 = makeReplay({ id: 'b', dealHash: 'hash-X' });
      await saveReplay(r1);
      await saveReplay(r2);
      const list = await listReplays('klondike-1');
      expect(list).toHaveLength(1); // r2 skip
      expect(list[0].id).toBe('a');
    });

    it('limite à 20 replays par variante (FIFO)', async () => {
      for (let i = 0; i < 25; i++) {
        await saveReplay(makeReplay({ id: `r-${i}` }));
      }
      const list = await listReplays('klondike-1');
      expect(list).toHaveLength(20);
      // Les plus récents en tête (unshift)
      expect(list[0].id).toBe('r-24');
    });
  });

  describe('listAllReplays', () => {
    it('aggrège toutes les variantes triées par date', async () => {
      await saveReplay(makeReplay({ id: 'k', variantKey: 'klondike-1', wonAt: 1000 }));
      await saveReplay(makeReplay({ id: 's', variantKey: 'spider-1', wonAt: 2000 }));
      await saveReplay(makeReplay({ id: 'f', variantKey: 'freecell', wonAt: 3000 }));
      const all = await listAllReplays();
      expect(all).toHaveLength(3);
      // Tri descendant
      expect(all.map((r) => r.id)).toEqual(['f', 's', 'k']);
    });
  });

  describe('deleteReplay', () => {
    it('supprime un replay par id', async () => {
      await saveReplay(makeReplay({ id: 'a' }));
      await saveReplay(makeReplay({ id: 'b' }));
      await deleteReplay('klondike-1', 'a');
      const list = await listReplays('klondike-1');
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('b');
    });
  });

  describe('getReplayStats', () => {
    it('calcule wins / minMoves / avgMoves / minDurationMs par variante', async () => {
      await saveReplay(makeReplay({ id: '1', variantKey: 'klondike-1', moves: 100, durationMs: 60000 }));
      await saveReplay(makeReplay({ id: '2', variantKey: 'klondike-1', moves: 80, durationMs: 50000 }));
      await saveReplay(makeReplay({ id: '3', variantKey: 'spider-1', moves: 200, durationMs: 90000 }));

      const stats = await getReplayStats();
      expect(stats['klondike-1'].count).toBe(2);
      expect(stats['klondike-1'].minMoves).toBe(80);
      expect(stats['klondike-1'].avgMoves).toBe(90);
      expect(stats['klondike-1'].minDurationMs).toBe(50000);
      expect(stats['spider-1'].count).toBe(1);
    });
  });
});
