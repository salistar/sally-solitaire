/**
 * @file hintsHook.ts
 * @description Difficulty-aware hint budget hook. Originally lived inside
 * solo.tsx for the legacy 9 engine screens (Klondike, Spider, FreeCell…),
 * now extracted so the 7 generic screens (GenericTableau, Pairs, Math,
 * Golf, Maze, SpiderV2, Distribution) can share the SAME UX:
 *
 *   - Easy   → unlimited hints (button shows ∞)
 *   - Medium → 3 hints per game (counter decrements 3 → 2 → 1 → 0)
 *   - Hard   → no hints (button hidden)
 *
 * The hook layers two pools:
 *   1. **Free difficulty pool** — given automatically based on selected
 *      difficulty (3 for medium, ∞ for easy).
 *   2. **Inventory pool** — `hint_1` / `hint_5` items the user bought at
 *      /spend, consumed via `inv.consumeHint()` once the free pool runs dry.
 *
 * Engine screens just call `useHints(difficulty)` and read `remaining` /
 * `canUseHint` for the button, calling `consume()` on press.
 */
import { useState, useCallback } from 'react';
import { useInventory } from '../contexts/useInventory';

export type Difficulty = 'easy' | 'medium' | 'hard';

export function hintsAllowed(d: Difficulty): number {
  return d === 'easy' ? Infinity : d === 'medium' ? 3 : 0;
}

export interface HintsHook {
  /** Total hints left (difficulty pool + inventory). Infinity in easy. */
  remaining: number;
  /** True if the player can press the button right now. */
  canUseHint: boolean;
  /** Consume 1 hint. Drains difficulty pool first, then inventory. */
  consume: () => void;
  /** Reset the local counter (call on new deal). */
  reset: () => void;
  /** How many hints have been consumed this game (for stats). */
  used: number;
  /** Inventory-only count (used for the "+N inventaire" badge). */
  inventoryHints: number;
}

export function useHints(difficulty: Difficulty): HintsHook {
  const max = hintsAllowed(difficulty);
  const [used, setUsed] = useState(0);
  const inv = useInventory();
  const difficultyRemaining = max === Infinity ? Infinity : Math.max(0, max - used);
  const inventoryHints = inv.totalHints();
  const remaining = difficultyRemaining === Infinity ? Infinity : difficultyRemaining + inventoryHints;
  const canUseHint =
    difficulty !== 'hard' &&
    (difficultyRemaining > 0 || inventoryHints > 0);
  const consume = useCallback(() => {
    if (difficulty === 'hard') return;
    if (difficultyRemaining > 0 && difficultyRemaining !== Infinity) {
      setUsed((u) => u + 1);
      return;
    }
    if (difficultyRemaining === Infinity) {
      // Easy mode: free unlimited hints, no inventory cost
      return;
    }
    // Difficulty pool exhausted → drain inventory
    inv.consumeHint();
  }, [difficulty, difficultyRemaining, inv]);
  const reset = useCallback(() => setUsed(0), []);
  return { remaining, canUseHint, consume, reset, used, inventoryHints };
}

/* === End of hintsHook.ts — Solitaire — SallyCards === */
