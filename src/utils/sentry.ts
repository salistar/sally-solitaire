/**
 * @file sentry.ts
 * @description Sentry error tracking — defensive (no-op if @sentry/react-native missing).
 * Setup: 1) Add @sentry/react-native to package.json
 *        2) Set EXPO_PUBLIC_SENTRY_DSN in .env.production
 *        3) Sentry.init({ dsn: SENTRY_DSN }) called automatically at module load
 */
let Sentry: any = null;
try { Sentry = require('@sentry/react-native'); } catch {}

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

if (Sentry && DSN) {
  try {
    Sentry.init({
      dsn: DSN,
      tracesSampleRate: 0.1,
      enableInExpoDevelopment: false,
      debug: false,
      environment: process.env.EXPO_PUBLIC_BUILD_ENV || 'production',
    });
  } catch (e) {
    console.warn('[SENTRY] init failed:', (e as any)?.message);
  }
}

export function captureException(err: any, context?: Record<string, any>): void {
  if (Sentry?.captureException) {
    try { Sentry.captureException(err, { contexts: { custom: context || {} } }); }
    catch {}
  }
  console.error('[SENTRY-LOCAL]', err?.message ?? err, err?.stack);
}

export function captureMessage(msg: string, level: 'info'|'warning'|'error' = 'info'): void {
  if (Sentry?.captureMessage) {
    try { Sentry.captureMessage(msg, level); } catch {}
  }
  console.log(`[SENTRY-LOCAL/${level.toUpperCase()}]`, msg);
}

export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (Sentry?.setUser) {
    try { Sentry.setUser(user); } catch {}
  }
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, any>): void {
  if (Sentry?.addBreadcrumb) {
    try {
      Sentry.addBreadcrumb({
        category, message, data,
        level: 'info',
        timestamp: Date.now() / 1000,
      });
    } catch {}
  }
}

export function sentryAvailable(): boolean {
  return !!Sentry && !!DSN;
}
