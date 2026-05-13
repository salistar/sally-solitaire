/**
 * @file useUndos.ts
 * @description Combines a local undo-stack (from `useGameWithUndo`) with the
 * user's purchased `undo_pack` inventory. Each undo requires BOTH:
 *   1. A snapshot in the local history (else nothing to restore)
 *   2. An inventory undo unit available (consumed on use)
 *
 * Without inventory undos, the screen's `useGameWithUndo` is purely passive
 * (history grows but can't be popped from the UI). Buy a pack at /spend to
 * activate the button.
 *
 * Usage in a screen:
 *
 *   const [state, dispatch, undoCtl] = useGameWithUndo(reducer, undefined, () => init());
 *   const undos = useUndos(undoCtl);
 *   ...
 *   <Button
 *     label={`↶ Undo (${undos.remainingInventory})`}
 *     onPress={undos.tryUndo}
 *     disabled={!undos.canUndo}
 *   />
 */
import { useCallback } from 'react';
import { useInventory } from './useInventory';
import type { UndoController } from './useGameWithUndo';

export interface UndosHook {
  /** True when both history HAS something AND inventory undo > 0. */
  canUndo: boolean;
  /** Number of undo units left in inventory. */
  remainingInventory: number;
  /** Local history depth available. */
  historyDepth: number;
  /**
   * Attempt to perform 1 undo. Consumes 1 inventory undo + restores prev
   * state. Returns true on success, false if any precondition fails.
   */
  tryUndo: () => Promise<boolean>;
}

export function useUndos(undoCtl: UndoController): UndosHook {
  const inv = useInventory();
  const remainingInventory = inv.totalUndos();
  const historyDepth = undoCtl.depth;
  const canUndo = remainingInventory > 0 && historyDepth > 0;

  const tryUndo = useCallback(async (): Promise<boolean> => {
    if (!undoCtl.canUndo) return false;
    if (remainingInventory <= 0) return false;
    // Consume FIRST (optimistic), then undo locally. If consume fails, we
    // could roll back — but optimistic UX is fine: inventory will re-sync
    // on next render if there was a mismatch.
    const ok = await inv.consume('undo_pack', 1);
    if (!ok) return false;
    undoCtl.undo();
    return true;
  }, [undoCtl, inv, remainingInventory]);

  return { canUndo, remainingInventory, historyDepth, tryUndo };
}
