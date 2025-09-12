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
    
    console.log(`📊 Estimated initial JS: ${(estimatedSize / 1024).toFixed(1)}KB (Budget: ${(PERFORMANCE_BUDGET.initialJS / 1024).toFixed(1)}KB)`);
    
    if (estimatedSize > PERFORMANCE_BUDGET.initialJS) {
      console.warn('⚠️ Initial JS exceeds performance budget!');
    }
  }
};

// Monitor Web Vitals
export const initWebVitalsMonitoring = () => {
  if (typeof performance !== 'undefined' && 'PerformanceObserver' in window) {
    // Monitor FCP
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === 'first-contentful-paint') {
          const fcp = entry.startTime;
          console.log(`🎯 First Contentful Paint: ${fcp.toFixed(1)}ms (Target: ${PERFORMANCE_BUDGET.firstContentfulPaint}ms)`);
          
          if (fcp > PERFORMANCE_BUDGET.firstContentfulPaint) {
            console.warn('⚠️ FCP exceeds performance budget!');
          }
        }
      });
    }).observe({ entryTypes: ['paint'] });

    // Monitor LCP
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      const lcp = lastEntry.startTime;
      
      console.log(`🎯 Largest Contentful Paint: ${lcp.toFixed(1)}ms (Target: ${PERFORMANCE_BUDGET.largestContentfulPaint}ms)`);
      
      if (lcp > PERFORMANCE_BUDGET.largestContentfulPaint) {
        console.warn('⚠️ LCP exceeds performance budget!');
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });
  }
};

// Preload critical resources
export const preloadCriticalResources = () => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
  link.as = 'style';
  document.head.appendChild(link);
};