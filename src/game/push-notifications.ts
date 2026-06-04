/**
 * @file push-notifications.ts
 * @description Real expo-notifications integration replacing the stubs.
 */
import { useEffect } from 'react';

let Notifications: any = null;
try { Notifications = require('expo-notifications'); } catch {}

const DAILY_REMINDER_HOUR = 20; // 8 PM local
const DAILY_REMINDER_MINUTE = 0;

export async function setupDailyChallengeNotification(): Promise<{
  scheduled: boolean; reason?: string;
}> {
  if (!Notifications) return { scheduled: false, reason: 'expo-notifications not installed' };
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return { scheduled: false, reason: 'Permissions refusées' };

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Cancel previous
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Schedule daily reminder at 20:00 local
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Ton défi quotidien t\'attend !',
        body: 'Joue une partie pour gagner +50 pièces',
        sound: true,
      },
      trigger: {
        hour: DAILY_REMINDER_HOUR,
        minute: DAILY_REMINDER_MINUTE,
        repeats: true,
      },
    });
    return { scheduled: true };
  } catch (e) {
    return { scheduled: false, reason: (e as any)?.message };
  }
}

export async function cancelDailyChallengeNotification(): Promise<void> {
  if (!Notifications) return;
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

export async function sendLocalTestNotification(title: string, body: string): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { seconds: 1 },
    });
  } catch {}
}

export function pushNotificationsAvailable(): boolean { return !!Notifications; }

export function usePushSetup() {
  useEffect(() => {
    setupDailyChallengeNotification().catch(() => {});
  }, []);
}
