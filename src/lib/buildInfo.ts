/**
 * Build identity for the running bundle (sha + UTC build time, injected by
 * vite.config.ts). Stale deploys have masqueraded as bugs before — this makes
 * "which build am I looking at?" answerable from the UI and the console.
 * typeof-guarded so environments without the define (vitest) get 'dev'.
 */
export const BUILD_SHA: string = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
export const BUILD_STAMP: string = BUILD_TIME ? `${BUILD_SHA} · ${BUILD_TIME} UTC` : BUILD_SHA;
