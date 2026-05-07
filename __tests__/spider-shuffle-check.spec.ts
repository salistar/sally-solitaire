/**
 * Vérifie que createInitialState produit une donne aléatoire ET soluble.
 */
import {
  createInitialState,
  getSpiderSolution,
  gameReducer,
} from '../src/game/spiderEngine';

describe('Spider — cascade oracle', () => {
  test('5 donnes spider-1 : layout valide + solution gagne', () => {
    let solvedCount = 0;
    let totalTime = 0;
    for (let trial = 0; trial < 5; trial++) {
      const t0 = Date.now();
      const state = createInitialState(1);
      const elapsed = Date.now() - t0;
      totalTime += elapsed;
      const solution = getSpiderSolution();
      const tableauTotal = state.tableau.reduce((a, c) => a + c.cards.length, 0);
      const sizes = state.tableau.map((c) => c.cards.length);

      if (solution.length > 0) {
        let s = state;
        for (const action of solution) {
          const next = gameReducer(s, action);
          if (next === s) break;
          s = next;
          if (s.completed.length === 8) break;
        }
        if (s.completed.length === 8) solvedCount++;
      }
      // eslint-disable-next-line no-console
      console.log(
        `  Trial ${trial + 1}: ${elapsed}ms, sol=${solution.length}, stock=${state.stock.length}, tableau=${tableauTotal}, sizes=[${sizes.join(',')}]`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n[VALIDATION V2] solved=${solvedCount}/5, avg=${(totalTime / 5).toFixed(0)}ms`,
    );
    expect(solvedCount).toBe(5);
  }, 60000);
});
