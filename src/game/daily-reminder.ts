/**
 * @file daily-reminder.ts
 * @description Système de "rappel quotidien" pour le Daily Challenge.
 *
 * Note : `expo-notifications` n'est pas installé. À la place, un système
 * in-app simple qui :
 *   - Au lancement de l'app, vérifie si on est après 8h aujourd'hui
 *   - Si oui ET pas déjà notifié aujourd'hui → callback `onShouldNotify(date)`
 *   - Persiste `daily-reminder:last-shown` = YYYY-MM-DD
 *
 * Pour des vraies push notifs système (même app fermée), il faudra ajouter
 * `expo-notifications` + `Notifications.scheduleNotificationAsync({ trigger: { hour: 8, minute: 0, repeats: true } })`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'daily-reminder:last-shown';

/** Format YYYY-MM-DD pour la date locale (pas UTC pour respecter timezone). */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Vérifie si on doit notifier pour le Daily Challenge.
 * Critères : après 8h locales + pas notifié aujourd'hui.
 *
 * Retourne true si l'UI doit afficher le rappel.
 */
export async function shouldShowDailyReminder(): Promise<boolean> {
  try {
    const now = new Date();
    if (now.getHours() < 8) return false; // trop tôt
    const last = await AsyncStorage.getItem(STORAGE_KEY);
    return last !== todayKey();
  } catch {
    return false;
  }
}

/** À appeler après que l'utilisateur a vu / dismissé le rappel. */
export async function markDailyReminderShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, todayKey());
  } catch { /* silent */ }
}

/** Reset (utile en debug ou pour relancer la notif manuellement). */
export async function resetDailyReminder(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────
// Streak-aware reminder
// ─────────────────────────────────────────────────────────────────────────
//
// Beyond the daily "have you played today" reminder, we now expose a richer
// view of the streak state so the home screen can surface a banner with the
// urgency the player actually needs (e.g. "Joue avant minuit ou tu perds ta
// série de 12 jours").
//
// Why purely client-side / no expo-notifications:
//   - expo-notifications adds APNs/FCM credential overhead — out of scope.
//   - The in-app banner suffices as long as the player opens the app at least
//     once a day, which is the targeted retention behavior anyway.
//   - When the dep is added later, the same logic can drive
//     `scheduleNotificationAsync` calls without changing the data flow.

/**
 * Status snapshot derived from the user's rewards row. Pure function of the
 * inputs — easy to unit-test without mocking AsyncStorage / fetch.
 */
export interface StreakState {
  /** Current consecutive-day streak count (0 if never played). */
  streak: number;
  /** True if the user has already claimed at least one daily variant today (UTC). */
  playedTodayUtc: boolean;
  /** True if `streak > 0 && !playedTodayUtc` — at risk of losing it tonight. */
  streakAtRisk: boolean;
  /** Hours remaining before UTC midnight rollover (when the streak would break). */
  hoursUntilMidnightUtc: number;
  /**
   * Urgency tier for UI styling:
   *   - 'none'    : nothing to show (streak=0, or already played today)
   *   - 'info'    : streak alive, plenty of time left
   *   - 'warning' : streak alive, < 6h left
   *   - 'urgent'  : streak alive, < 2h left
   */
  urgency: 'none' | 'info' | 'warning' | 'urgent';
}

/**
 * Compute the streak state from a rewards row + current time. Pulled out as a
 * pure helper so the UI can show different urgency tiers without a redundant
 * roundtrip and so tests don't need to mock the API.
 *
 * `lastDailyDate` and the comparison day are in UTC to match the server's
 * `awardDailyCompletion` logic (which also uses UTC for its idempotency key).
 */
export function computeStreakState(
  rewards: { dailyStreak: number; lastDailyDate: string } | null,
  now: Date = new Date(),
): StreakState {
  if (!rewards) {
    return { streak: 0, playedTodayUtc: false, streakAtRisk: false, hoursUntilMidnightUtc: 24, urgency: 'none' };
  }

  const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const playedTodayUtc = rewards.lastDailyDate === todayUtc;
  const streak = rewards.dailyStreak ?? 0;

  // ms until next UTC midnight
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0,
  ));
  const hoursUntilMidnightUtc = Math.max(0, (midnight.getTime() - now.getTime()) / 3_600_000);

  const streakAtRisk = streak > 0 && !playedTodayUtc;

  let urgency: StreakState['urgency'] = 'none';
  if (streakAtRisk) {
    if (hoursUntilMidnightUtc < 2) urgency = 'urgent';
    else if (hoursUntilMidnightUtc < 6) urgency = 'warning';
    else urgency = 'info';
  }

  return { streak, playedTodayUtc, streakAtRisk, hoursUntilMidnightUtc, urgency };
}
