/**
 * @file analytics.ts
 * @description Wrapper analytics mobile — POST fire-and-forget vers le
 * backend `/analytics/track`. Aucune dépendance externe (pas de Mixpanel/PostHog).
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let _userId: string | null = null;

export function setAnalyticsUser(userId: string | null): void {
  _userId = userId;
}

/**
 * Track un événement. Fire-and-forget : ne bloque jamais l'UI, ne crashe jamais.
 */
export function track(event: string, props?: Record<string, any>): void {
  // setTimeout pour différer derrière les renders critiques
  setTimeout(() => {
    fetch(`${API_URL}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        userId: _userId,
        variant: props?.variant,
        props,
      }),
    }).catch(() => { /* silent */ });
  }, 0);
}

/** Helpers typés pour les events principaux. */
export const Analytics = {
  matchCreated: (variant: string) => track('match_created', { variant }),
  matchJoined: (code: string) => track('match_joined', { code }),
  aiUsed: (variant: string, speed: string) => track('ai_used', { variant, speed }),
  hintUsed: (variant: string) => track('hint_used', { variant }),
  gameWon: (variant: string, difficulty: string, durationMs: number) =>
    track('game_won', { variant, difficulty, durationMs }),
  dailyPlayed: (variant: string) => track('daily_played', { variant }),
  achievementUnlocked: (id: string) => track('achievement_unlocked', { id }),
  skinSelected: (skinId: string) => track('skin_selected', { skinId }),
  tutorialDismissed: () => track('tutorial_dismissed', {}),
};
