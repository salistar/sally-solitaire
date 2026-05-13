/**
 * @file useInventory.ts
 * @description Hook for engine screens (Klondike, Spider, FreeCell, …) to
 * check the user's purchased consumables (hints, undos, etc.) and consume
 * them. Optimistic-update pattern: decrements local state immediately and
 * fires-and-forgets the server call. If the server rejects, the next
 * inventory fetch will reconcile.
 *
 * Usage in an engine screen:
 *
 *   const inv = useInventory();
 *   ...
 *   // Hint button
 *   <Button
 *     onPress={async () => {
 *       const ok = await inv.consume('hint_1');
 *       if (ok) showHintInGame();
 *       else if (inv.qty('hint_1') === 0) toast('Plus de hints — passe au /spend');
 *     }}
 *     label={`💡 ${inv.qty('hint_1') + inv.qty('hint_5')} hints`}
 *   />
 *
 * Hints can come from either `hint_1` (singles) or `hint_5` (bulk pack).
 * `inv.qty('hint_1')` and `inv.qty('hint_5')` are independent — but
 * `inv.totalHints()` aggregates them. Consume tries `hint_5` first (bulk
 * stack drains first), falls back to `hint_1`.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import * as api from '../../shared/api';

export interface InventoryHook {
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** Map of itemId → owned qty. */
  qty: (itemId: string) => number;
  /** Total hints (sum of hint_1 + hint_5 entries). */
  totalHints: () => number;
  /** Total undos (qty of undo_pack — 1 pack = 10 undos consumed individually). */
  totalUndos: () => number;
  /** Cosmetic ownership check. */
  owns: (cosmeticId: string) => boolean;
  /** Consume a specific item id. Optimistic UI. */
  consume: (itemId: string, qty?: number) => Promise<boolean>;
  /** Auto-pick: drain hint_5 first then hint_1. Returns true if any consumed. */
  consumeHint: () => Promise<boolean>;
  /** Refresh inventory from server (use after purchase from /spend). */
  refresh: () => Promise<void>;
}

const HINT_ITEMS = ['hint_5', 'hint_1']; // drain bulk pack first
const UNDO_ITEM = 'undo_pack';

export function useInventory(): InventoryHook {
  const [items, setItems] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api.getMe().catch(() => null);
      if (!me?.id) { setItems({}); setLoading(false); return; }
      userIdRef.current = me.id;
      const inv = await api.fetchInventory(me.id);
      const next: Record<string, number> = {};
      for (const entry of inv?.items ?? []) {
        next[entry.itemId] = entry.qty;
      }
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const qty = useCallback((itemId: string) => items[itemId] ?? 0, [items]);

  const totalHints = useCallback(
    () => (items['hint_1'] ?? 0) + (items['hint_5'] ?? 0),
    [items],
  );

  const totalUndos = useCallback(
    () => (items[UNDO_ITEM] ?? 0),
    [items],
  );

  const owns = useCallback(
    (cosmeticId: string) => (items[cosmeticId] ?? 0) >= 1,
    [items],
  );

  const consume = useCallback(async (itemId: string, n = 1): Promise<boolean> => {
    const userId = userIdRef.current;
    if (!userId) return false;
    if ((items[itemId] ?? 0) < n) return false;
    // Optimistic decrement
    setItems((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) - n) }));
    const result = await api.consumeInventoryItem({ userId, itemId, qty: n });
    if (!result || !result.ok) {
      // Server rejected → reconcile from truth
      refresh();
      return false;
    }
    // Server might know more accurately than our optimistic
    setItems((prev) => ({ ...prev, [itemId]: result.remaining }));
    return true;
  }, [items, refresh]);

  const consumeHint = useCallback(async (): Promise<boolean> => {
    for (const id of HINT_ITEMS) {
      if ((items[id] ?? 0) > 0) {
        return consume(id, 1);
      }
    }
    return false;
  }, [items, consume]);

  return {
    loading,
    qty,
    totalHints,
    totalUndos,
    owns,
    consume,
    consumeHint,
    refresh,
  };
}
