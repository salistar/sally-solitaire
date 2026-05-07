/**
 * @file sentry.ts
 * @description Wrapper Sentry léger côté mobile.
 *
 * **STATUS : STUBS no-op par défaut.**
 *
 * Pour activer Sentry :
 *   1. `pnpm add sentry-expo` (ou `@sentry/react-native`)
 *   2. Décommenter le bloc `// === IMPL ===` ci-dessous
 *   3. Configurer la DSN dans app.json (extra.sentryDsn) puis appeler
 *      Sentry.init() au boot de l'app
 *
 * Pourquoi les stubs ? Metro bundler ne tolère pas un require dynamique
 * vers un module absent — l'erreur "Requiring unknown module 'undefined'"
 * apparaît au bundle. On commente proprement à la place.
 */

// === STUBS (actifs par défaut) =======================================

export function captureException(err: any): void {
  console.error('[SENTRY-LOCAL]', err?.message ?? err, err?.stack);
}

export function captureMessage(msg: string): void {
  console.log('[SENTRY-LOCAL]', msg);
}

export function sentryAvailable(): boolean {
  return false;
}

// === IMPL (à décommenter quand sentry-expo est installé) =============
//
// import * as Sentry from 'sentry-expo';
//
// export function initSentry(dsn: string) {
//   Sentry.init({
//     dsn,
//     enableInExpoDevelopment: false,
//     debug: false,
//   });
// }
//
// export function captureException(err: any): void {
//   Sentry.Native?.captureException(err);
// }
//
// export function captureMessage(msg: string): void {
//   Sentry.Native?.captureMessage(msg);
// }
//
// export function sentryAvailable(): boolean { return true; }
