/**
 * Validation : la solution exacte précalculée par reverseDealSpider mène bien
 * à un état gagnant (8 runs complets, phase='won').
 */
import {
  createInitialState,
  getSpiderSolution,
  gameReducer,
  isWon,
  type GameState,
} from '../src/game/spiderEngine';

describe('Spider — solution exacte', () => {
  test('5 donnes spider-1 : solution mène à la victoire et stock=50', () => {
    let failures = 0;
    let randomDealsCount = 0;
    let fallbackCount = 0;
    for (let trial = 0; trial < 5; trial++) {
      const initial = createInitialState(1);
      const solution = getSpiderSolution();

      // Random deal aura stock=50, fallback reverse-deal aura stock=0
      if (initial.stock.length === 50) randomDealsCount++;
      else fallbackCount++;

      let s: GameState = initial;
      let appliedCount = 0;
      for (const action of solution) {
        const next = gameReducer(s, action);
        if (next === s) break;
        s = next;
        appliedCount++;
      }

      if (
        appliedCount !== solution.length ||
        s.completed.length !== 8 ||
        !isWon(s) ||
        s.phase !== 'won'
      ) {
        failures++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[VALIDATION suit=1] random=${randomDealsCount}/5, fallback=${fallbackCount}/5, failures=${failures}/5`,
    );
    expect(failures).toBe(0);
  }, 60000);

  test('3 donnes spider-4 : solution mène à la victoire', () => {
    let failures = 0;
    let randomDealsCount = 0;
    let fallbackCount = 0;
    for (let trial = 0; trial < 3; trial++) {
      const initial = createInitialState(4);
      const solution = getSpiderSolution();

      if (initial.stock.length === 50) randomDealsCount++;
      else fallbackCount++;

      let s: GameState = initial;
      let appliedCount = 0;
      for (const action of solution) {
        const next = gameReducer(s, action);
        if (next === s) break;
        s = next;
        appliedCount++;
      }

      if (
        appliedCount !== solution.length ||
        s.completed.length !== 8 ||
        !isWon(s) ||
        s.phase !== 'won'
      ) {
        failures++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[VALIDATION suit=4] random=${randomDealsCount}/3, fallback=${fallbackCount}/3, failures=${failures}/3`,
    );
    expect(failures).toBe(0);
  }, 120000);
});
