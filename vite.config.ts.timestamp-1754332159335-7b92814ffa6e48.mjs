// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  build: {
    // Performance budget enforcement - <200KB initial JS
    chunkSizeWarningLimit: 200,
    // 200KB warning limit per chunk
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate heavy libraries into their own chunks for code splitting
          "react-vendor": ["react", "react-dom"],
          "map-vendor": ["react-map-gl", "mapbox-gl"],
          // Lazy loaded
          "deck-vendor": ["@deck.gl/react", "@deck.gl/core", "@deck.gl/layers", "@deck.gl/aggregation-layers"],
          // Lazy loaded
          "ui-vendor": ["lucide-react"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "state-vendor": ["zustand"]
        }
      }
    },
    // Additional performance optimizations
    reportCompressedSize: true,
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-map-gl") || id.includes("mapbox-gl")) {
              return "map-vendor";
            }
            if (id.includes("@deck.gl")) {
              return "deck-vendor";
            }
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-vendor";
            }
            if (id.includes("lucide-react")) {
              return "ui-vendor";
            }
            if (id.includes("@supabase")) {
              return "supabase-vendor";
            }
            if (id.includes("zustand")) {
              return "state-vendor";
            }
          }
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ["lucide-react"],
    include: ["@deck.gl/react", "@deck.gl/core", "@deck.gl/layers", "@deck.gl/aggregation-layers"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIGJ1aWxkOiB7XG4gICAgLy8gUGVyZm9ybWFuY2UgYnVkZ2V0IGVuZm9yY2VtZW50IC0gPDIwMEtCIGluaXRpYWwgSlNcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDIwMCwgLy8gMjAwS0Igd2FybmluZyBsaW1pdCBwZXIgY2h1bmtcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgLy8gU2VwYXJhdGUgaGVhdnkgbGlicmFyaWVzIGludG8gdGhlaXIgb3duIGNodW5rcyBmb3IgY29kZSBzcGxpdHRpbmdcbiAgICAgICAgICAncmVhY3QtdmVuZG9yJzogWydyZWFjdCcsICdyZWFjdC1kb20nXSxcbiAgICAgICAgICAnbWFwLXZlbmRvcic6IFsncmVhY3QtbWFwLWdsJywgJ21hcGJveC1nbCddLCAvLyBMYXp5IGxvYWRlZFxuICAgICAgICAgICdkZWNrLXZlbmRvcic6IFsnQGRlY2suZ2wvcmVhY3QnLCAnQGRlY2suZ2wvY29yZScsICdAZGVjay5nbC9sYXllcnMnLCAnQGRlY2suZ2wvYWdncmVnYXRpb24tbGF5ZXJzJ10sIC8vIExhenkgbG9hZGVkXG4gICAgICAgICAgJ3VpLXZlbmRvcic6IFsnbHVjaWRlLXJlYWN0J10sXG4gICAgICAgICAgJ3N1cGFiYXNlLXZlbmRvcic6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXG4gICAgICAgICAgJ3N0YXRlLXZlbmRvcic6IFsnenVzdGFuZCddXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgLy8gQWRkaXRpb25hbCBwZXJmb3JtYW5jZSBvcHRpbWl6YXRpb25zXG4gICAgcmVwb3J0Q29tcHJlc3NlZFNpemU6IHRydWUsXG4gICAgbWluaWZ5OiAnZXNidWlsZCcsXG4gICAgdGFyZ2V0OiAnZXMyMDIwJyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgLy8gRHluYW1pYyBpbXBvcnRzIHNob3VsZCBiZSBzZXBhcmF0ZSBjaHVua3NcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSB7XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlYWN0LW1hcC1nbCcpIHx8IGlkLmluY2x1ZGVzKCdtYXBib3gtZ2wnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ21hcC12ZW5kb3InO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAZGVjay5nbCcpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAnZGVjay12ZW5kb3InO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdCcpIHx8IGlkLmluY2x1ZGVzKCdyZWFjdC1kb20nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3JlYWN0LXZlbmRvcic7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndWktdmVuZG9yJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnQHN1cGFiYXNlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdzdXBhYmFzZS12ZW5kb3InO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCd6dXN0YW5kJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICdzdGF0ZS12ZW5kb3InO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgICBpbmNsdWRlOiBbJ0BkZWNrLmdsL3JlYWN0JywgJ0BkZWNrLmdsL2NvcmUnLCAnQGRlY2suZ2wvbGF5ZXJzJywgJ0BkZWNrLmdsL2FnZ3JlZ2F0aW9uLWxheWVycyddLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlOLFNBQVMsb0JBQW9CO0FBQ3RQLE9BQU8sV0FBVztBQUdsQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsT0FBTztBQUFBO0FBQUEsSUFFTCx1QkFBdUI7QUFBQTtBQUFBLElBQ3ZCLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWM7QUFBQTtBQUFBLFVBRVosZ0JBQWdCLENBQUMsU0FBUyxXQUFXO0FBQUEsVUFDckMsY0FBYyxDQUFDLGdCQUFnQixXQUFXO0FBQUE7QUFBQSxVQUMxQyxlQUFlLENBQUMsa0JBQWtCLGlCQUFpQixtQkFBbUIsNkJBQTZCO0FBQUE7QUFBQSxVQUNuRyxhQUFhLENBQUMsY0FBYztBQUFBLFVBQzVCLG1CQUFtQixDQUFDLHVCQUF1QjtBQUFBLFVBQzNDLGdCQUFnQixDQUFDLFNBQVM7QUFBQSxRQUM1QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUVBLHNCQUFzQjtBQUFBLElBQ3RCLFFBQVE7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGFBQWEsSUFBSTtBQUVmLGNBQUksR0FBRyxTQUFTLGNBQWMsR0FBRztBQUMvQixnQkFBSSxHQUFHLFNBQVMsY0FBYyxLQUFLLEdBQUcsU0FBUyxXQUFXLEdBQUc7QUFDM0QscUJBQU87QUFBQSxZQUNUO0FBQ0EsZ0JBQUksR0FBRyxTQUFTLFVBQVUsR0FBRztBQUMzQixxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxHQUFHLFNBQVMsT0FBTyxLQUFLLEdBQUcsU0FBUyxXQUFXLEdBQUc7QUFDcEQscUJBQU87QUFBQSxZQUNUO0FBQ0EsZ0JBQUksR0FBRyxTQUFTLGNBQWMsR0FBRztBQUMvQixxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxHQUFHLFNBQVMsV0FBVyxHQUFHO0FBQzVCLHFCQUFPO0FBQUEsWUFDVDtBQUNBLGdCQUFJLEdBQUcsU0FBUyxTQUFTLEdBQUc7QUFDMUIscUJBQU87QUFBQSxZQUNUO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxjQUFjO0FBQUEsSUFDeEIsU0FBUyxDQUFDLGtCQUFrQixpQkFBaUIsbUJBQW1CLDZCQUE2QjtBQUFBLEVBQy9GO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
