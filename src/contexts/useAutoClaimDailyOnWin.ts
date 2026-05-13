/**
 * @file useAutoClaimDailyOnWin.ts
 * @description Auto-claim the daily reward when a solo game is won.
 *
 * Drops into each engine screen as a single line:
 *
 *   useAutoClaimDailyOnWin(variant.key, won);
 *
 * Behavior:
 *  - Fires once per `won` rising edge (guarded by a ref).
 *  - No-op when there's no logged-in user.
 *  - The server is idempotent per (userId, variant, UTC-day): repeated wins
 *    on the same variant the same day return `alreadyAwarded:true` and
 *    grant nothing.
 *  - Fires any newly-unlocked achievement toasts via AchievementToast context.
 *
 * Why hook-based (not embedded in `saveGameResult`):
 *  - Needs the `useAchievementToast()` context to fire unlock banners.
 *  - Keeps the side-effect inside the React tree where toasts render.
 */
import { useEffect, useRef } from 'react';
import * as api from '../../shared/api';
import { useAchievementToast } from './AchievementToastContext';

export function useAutoClaimDailyOnWin(variantKey: string, won: boolean): void {
  const toast = useAchievementToast();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!won) {
      // Reset the latch when the screen loops back to a fresh game (won → false).
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    (async () => {
      const me = await api.getMe().catch(() => null);
      if (!me?.id) return;
      const result = await api.awardDailyReward({
        userId: me.id,
        displayName: me.username ?? 'Joueur',
        variant: variantKey,
      });
      if (!result) return;
      if (!result.alreadyAwarded) {
        // eslint-disable-next-line no-console
        console.log(
          `🎁 [DailyAutoClaim] ${variantKey} → +${result.coinsAwarded} coins, +${result.xpAwarded} XP` +
          `${result.xpBoosted ? ' [⚡ 2× XP]' : ''}, streak ${result.newStreak}`,
        );
      }
      if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
        toast.showAchievements(result.unlockedAchievements);
      }
    })();
  }, [won, variantKey, toast]);
}
