// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build identity, so a running bundle can always say which commit it is —
// stale deploys have masqueraded as bugs before. Vercel/GitHub expose the sha.
const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'dev').slice(0, 7);
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Performance budget enforcement - <200KB initial JS
    chunkSizeWarningLimit: 200, // 200KB warning limit per chunk
    // Additional performance optimizations
    reportCompressedSize: true,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Dynamic imports should be separate chunks
          if (id.includes('node_modules')) {
            // mapbox/react-map-gl also NOT manually chunked (same hoisting
            // trap as @deck.gl): all importers are lazy, automatic chunking
            // keeps the 445 KB gz behind the MapPanel island.
            // @deck.gl deliberately NOT manually chunked: every importer is
            // lazy (MapView overlays, Massing3D), and a manual chunk hoisted
            // vite's preload helper into it — dragging 199 KB gz back into
            // the initial graph. Automatic chunking keeps it behind lazy.
            // Exact-package match: the old includes('react') swallowed
            // react-map-gl (~600 KB) into the EAGER vendor chunk.
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
              return 'react-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'ui-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('zustand')) {
              return 'state-vendor';
            }
          }
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['@deck.gl/react', '@deck.gl/core', '@deck.gl/layers', '@deck.gl/aggregation-layers'],
  },
});
