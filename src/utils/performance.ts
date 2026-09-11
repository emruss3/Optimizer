// Performance monitoring utilities
export const PERFORMANCE_BUDGET = {
  initialJS: 200 * 1024, // 200KB initial JS budget
  totalAssets: 1000 * 1024, // 1MB total assets budget
  firstContentfulPaint: 2000, // 2s FCP target
  largestContentfulPaint: 4000, // 4s LCP target
};

// Monitor bundle size in development
export const logBundleSize = () => {
  if (import.meta.env.DEV && typeof performance !== 'undefined') {
    // Log initial bundle size estimation
    const initialScripts = document.querySelectorAll('script[src]');
    let estimatedSize = 0;
    
    initialScripts.forEach(script => {
      const src = script.getAttribute('src');
      if (src && src.includes('assets')) {
        // Rough estimation based on typical gzipped sizes
        estimatedSize += 50 * 1024; // ~50KB per chunk estimation
      }
    });
    
    const overBudget = estimatedSize > PERFORMANCE_BUDGET.initialJS;
    console.log(`📊 Estimated initial JS: ${(estimatedSize / 1024).toFixed(1)}KB (Budget: ${(PERFORMANCE_BUDGET.initialJS / 1024).toFixed(1)}KB)${overBudget ? ' — over budget (dev estimate, not representative of the production bundle)' : ''}`);
  }
};

// Monitor Web Vitals
export const initWebVitalsMonitoring = () => {
  if (typeof performance !== 'undefined' && 'PerformanceObserver' in window) {
    // Monitor FCP
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            // Use renderTime or startTime, whichever is available
            const fcp = (entry as any).renderTime || entry.startTime;
            // Only log if it's a reasonable value (less than 60 seconds)
            if (fcp < 60000) {
              // Dev-mode paint timings are inflated (unminified, on-demand transforms)
              // and are not comparable to the production budget, so note it inline
              // rather than emitting an alarming warning.
              const overBudget = fcp > PERFORMANCE_BUDGET.firstContentfulPaint;
              console.log(`🎯 First Contentful Paint: ${fcp.toFixed(1)}ms (Target: ${PERFORMANCE_BUDGET.firstContentfulPaint}ms)${overBudget ? ' — over dev budget (not representative of production)' : ''}`);
            }
          }
        });
      }).observe({ entryTypes: ['paint'] });
    } catch (e) {
      console.warn('FCP monitoring not supported:', e);
    }

    // Monitor LCP
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length === 0) return;
        
        const lastEntry = entries[entries.length - 1] as any;
        // Use renderTime or loadTime, fallback to startTime
        const lcp = lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime;
        
        // Only log if it's a reasonable value (less than 60 seconds)
        if (lcp < 60000) {
          // Dev-mode paint timings are inflated (unminified, on-demand transforms)
          // and are not comparable to the production budget, so note it inline
          // rather than emitting an alarming warning.
          const overBudget = lcp > PERFORMANCE_BUDGET.largestContentfulPaint;
          console.log(`🎯 Largest Contentful Paint: ${lcp.toFixed(1)}ms (Target: ${PERFORMANCE_BUDGET.largestContentfulPaint}ms)${overBudget ? ' — over dev budget (not representative of production)' : ''}`);
        } else {
          console.warn('⚠️ LCP value seems incorrect:', lcp, 'ms. Ignoring.');
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('LCP monitoring not supported:', e);
    }
  }
};

// Preload critical resources
export const preloadCriticalResources = () => {
  // Only preload if not already loaded (prevents duplicate preload warnings)
  const existingLink = document.querySelector('link[href*="mapbox-gl.css"]');
  if (existingLink) {
    return; // Already loaded
  }
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
  link.as = 'style';
  document.head.appendChild(link);
};