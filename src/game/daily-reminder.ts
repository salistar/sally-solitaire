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
