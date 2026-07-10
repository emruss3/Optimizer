/// <reference types="vite/client" />

// Build identity injected by vite.config.ts `define` (commit sha + UTC time).
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;
