import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
            if (id.includes('react-map-gl') || id.includes('mapbox-gl')) {
              return 'map-vendor';
            }
            if (id.includes('@deck.gl')) {
              return 'deck-vendor';
            }
            if (id.includes('react') || id.includes('react-dom')) {
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
