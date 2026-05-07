/**
 * @file push-notifications.ts
 * @description Wrapper pour les push notifs natives via `expo-notifications`.
 *
 * **STATUS : STUBS no-op par défaut.**
 *
 * Pour activer les vraies push système :
 *   1. `pnpm add expo-notifications`
 *   2. Décommenter le bloc `// === IMPL ===` ci-dessous
 *   3. Le bloc `// === STUBS ===` peut rester en fallback ou être supprimé
 *
 * Pourquoi les stubs ? Metro bundler analyse statiquement les imports — un
 * `require('expo-notifications')` dans un try/catch plante quand même au
 * bundle si la lib n'est pas dans node_modules. Donc on encapsule l'import
 * dans un bloc commenté que l'utilisateur active manuellement.
 */

// === STUBS (actifs par défaut) =======================================

export async function setupDailyChallengeNotification(): Promise<{
  scheduled: boolean;
  reason?: string;
}> {
  return { scheduled: false, reason: 'expo-notifications not installed (stub)' };
}

export async function cancelDailyChallengeNotification(): Promise<void> {
  // no-op
}

export function pushNotificationsAvailable(): boolean {
  return false;
}

// === IMPL (à décommenter quand expo-notifications est installé) ======
//
// import * as Notifications from 'expo-notifications';
//
// export async function setupDailyChallengeNotification(): Promise<{
//   scheduled: boolean; reason?: string;
// }> {
//   try {
//     const perm = await Notifications.requestPermissionsAsync();
//     if (!perm.granted) return { scheduled: false, reason: 'Permissions refusées' };
//
//     Notifications.setNotificationHandler({
//       handleNotification: async () => ({
//         shouldShowAlert: true,
//         shouldPlaySound: false,
//         shouldSetBadge: false,
//       }),
//     });
//
//     await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
//
//     await Notifications.scheduleNotificationAsync({
//       content: {
//         title: '🃏 Daily Challenge dispo !',
//         body: "Le deal du jour t'attend. Bonne chance !",
//         sound: false,
//         data: { route: '/daily-challenge' },
//       },
//       trigger: { hour: 8, minute: 0, repeats: true } as any,
//     });
//     return { scheduled: true };
//   } catch (err: any) {
//     return { scheduled: false, reason: String(err?.message ?? err) };
//   }
// }
//
// export async function cancelDailyChallengeNotification(): Promise<void> {
//   try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
// }
//
// export function pushNotificationsAvailable(): boolean { return true; }
