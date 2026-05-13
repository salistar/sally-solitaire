/**
 * @file useLocalNotifications.ts
 * @description Thin wrapper around expo-notifications for LOCAL push
 * notifications. No remote APNs/FCM setup required — these fire while the
 * app is running (foreground or background) on the same device.
 *
 * MVP scope:
 *   - Permission request on first call to `notify(...)`.
 *   - In-foreground notifications get a banner via setNotificationHandler.
 *   - De-dup: callers pass an `id`, repeat notify() with the same id is a no-op
 *     until `clear(id)` is called. Prevents spam when polling fires the same
 *     pending-match event over and over.
 *
 * Out of scope (future PR):
 *   - Remote push tokens (would need APNs / FCM credentials)
 *   - Scheduled notifications (Notifications.scheduleNotificationAsync with
 *     trigger) — currently we fire immediately
 *   - Action buttons on the notification (e.g. "Rejoindre")
 */
import { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

// Configure how notifications appear when the app is foregrounded.
// expo-notifications defaults to not showing them at all in-foreground — we
// override so the user sees the banner even while looking at the home screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // expo-notifications v0.29 still requires the legacy `shouldShowAlert`
    // (deprecated in v0.30 in favor of `shouldShowBanner` + `shouldShowList`).
    // We set both so the handler works correctly across minor versions.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export interface LocalNotificationsHook {
  /**
   * Fire a notification immediately. Idempotent per `id` — once notified for
   * a given id, repeat calls are no-ops until you call `clear(id)`.
   */
  notify: (id: string, title: string, body: string) => Promise<void>;
  /** Reset the de-dup latch for an id so the next notify() can fire again. */
  clear: (id: string) => void;
}

export function useLocalNotifications(): LocalNotificationsHook {
  const firedRef = useRef<Set<string>>(new Set());
  const permissionGrantedRef = useRef<boolean | null>(null);

  // Pre-check permission status on mount. Doesn't request — request happens
  // lazily on first notify() so we don't pop the prompt if the feature is
  // never exercised.
  useEffect(() => {
    Notifications.getPermissionsAsync().then((res) => {
      permissionGrantedRef.current = res.granted;
    }).catch(() => { permissionGrantedRef.current = false; });
  }, []);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    if (permissionGrantedRef.current === true) return true;
    try {
      const res = await Notifications.requestPermissionsAsync();
      permissionGrantedRef.current = res.granted;
      return res.granted;
    } catch {
      permissionGrantedRef.current = false;
      return false;
    }
  }, []);

  const notify = useCallback(async (id: string, title: string, body: string) => {
    if (firedRef.current.has(id)) return;
    firedRef.current.add(id);
    const allowed = await ensurePermission();
    if (!allowed) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null, // fire immediately
      });
    } catch {
      // Silent — better than crashing the screen on a notif error.
    }
  }, [ensurePermission]);

  const clear = useCallback((id: string) => {
    firedRef.current.delete(id);
  }, []);

  return { notify, clear };
}
