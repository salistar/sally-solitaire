/**
 * @file analytics.ts
 * @description Firebase Analytics tracking — defensive.
 * Setup: 1) Install @react-native-firebase/app + @react-native-firebase/analytics
 *        2) Place google-services.json in android/app/
 *        3) Events queued and flushed automatically by Firebase SDK
 */
let analytics: any = null;
try {
  const a = require('@react-native-firebase/analytics');
  analytics = a.default ? a.default() : null;
} catch {}

type EventName =
  | 'app_open' | 'login' | 'sign_up' | 'guest_login'
  | 'onboarding_start' | 'onboarding_complete' | 'onboarding_skip'
  | 'game_start' | 'game_end' | 'game_win' | 'game_lose'
  | 'shop_open' | 'purchase_start' | 'purchase_complete' | 'purchase_failed'
  | 'achievement_unlock' | 'friend_invite' | 'tournament_join'
  | 'daily_reward_claim' | 'rewarded_ad_view' | 'screen_view';

export function track(event: EventName, params?: Record<string, any>): void {
  if (analytics?.logEvent) {
    try { analytics.logEvent(event, params || {}); } catch {}
  }
  // Local debug log
  if (__DEV__) console.log('[ANALYTICS]', event, params);
}

export function setUserId(id: string): void {
  if (analytics?.setUserId) {
    try { analytics.setUserId(id); } catch {}
  }
}

export function setUserProperty(key: string, value: string): void {
  if (analytics?.setUserProperty) {
    try { analytics.setUserProperty(key, value); } catch {}
  }
}

export function screenView(screenName: string, screenClass?: string): void {
  if (analytics?.logScreenView) {
    try {
      analytics.logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
    } catch {}
  }
  if (__DEV__) console.log('[ANALYTICS] screen:', screenName);
}

export function analyticsAvailable(): boolean { return !!analytics; }
