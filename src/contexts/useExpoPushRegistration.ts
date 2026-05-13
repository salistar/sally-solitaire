/**
 * @file useExpoPushRegistration.ts
 * @description Side-effecting hook that runs once on user login to:
 *
 *   1. Request iOS/Android notification permission (if not yet granted)
 *   2. Fetch the device's Expo push token
 *   3. POST it to the backend (`POST /solitaire-tournaments/push-tokens/register`)
 *      so the server can fire remote pushes for this user
 *   4. Subscribe to notification taps and navigate to the `routeTo` data
 *      field when the user opens a tournament-match notification
 *
 * Idempotent — re-running with the same logged-in user is a no-op past the
 * initial register call (de-duped by the AsyncStorage flag).
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as api from '../../shared/api';

const REGISTERED_FLAG_KEY = 'sally.solitaire.push-token-registered-for-user';

export function useExpoPushRegistration(
  user: { id: string; username: string } | null,
): void {
  const router = useRouter();
  const taskInFlight = useRef(false);

  // Effect 1 : register the device token with our backend, exactly once per
  // (user, app-install) pair. Skips silently if permissions denied or the
  // platform doesn't support push (e.g. simulators sometimes can't get a
  // real token).
  useEffect(() => {
    if (!user?.id || taskInFlight.current) return;
    taskInFlight.current = true;
    (async () => {
      try {
        const flag = await AsyncStorage.getItem(REGISTERED_FLAG_KEY);
        if (flag === user.id) return; // Already registered for this user

        const perms = await Notifications.getPermissionsAsync();
        let granted = perms.granted;
        if (!granted) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
        }
        if (!granted) return;

        const tokenRes = await Notifications.getExpoPushTokenAsync();
        const ok = await api.registerPushToken({
          userId: user.id,
          token: tokenRes.data,
          displayName: user.username,
          platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        });
        if (ok) {
          await AsyncStorage.setItem(REGISTERED_FLAG_KEY, user.id);
        }
        // Also report the device's IANA timezone so the streak cron can fire
        // at 22h local instead of 22h UTC. Best-effort — server uses 'UTC'
        // fallback if missing.
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz) await api.setUserTimezone(user.id, user.username, tz);
        } catch { /* no-op — Intl missing on very old engines */ }
      } catch {
        // Swallow — push is opportunistic, the in-app banner is the floor.
      } finally {
        taskInFlight.current = false;
      }
    })();
  }, [user?.id, user?.username]);

  // Effect 2 : listen for taps on notifications and route to the payload
  // `routeTo` field. The backend sets `routeTo` to e.g. `/game/race/M-XYZ`
  // when sending a "match prêt" push, so the user lands straight in their
  // race screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { routeTo?: string } | null;
      const routeTo = data?.routeTo;
      if (typeof routeTo === 'string' && routeTo.startsWith('/')) {
        router.push(routeTo as any);
      }
    });
    return () => sub.remove();
  }, [router]);
}
