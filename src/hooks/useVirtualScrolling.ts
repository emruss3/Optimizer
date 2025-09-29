import { useState, useEffect, useMemo, useCallback } from 'react';

interface VirtualScrollingOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualScrollingResult {
  visibleItems: any[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
}

export function useVirtualScrolling<T>(
  items: T[],
  options: VirtualScrollingOptions
): VirtualScrollingResult {
  const { itemHeight, containerHeight, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const offsetY = visibleRange.startIndex * itemHeight;

  const handleScroll = useCallback((event: Event) => {
    const target = event.target as HTMLElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = document.getElementById('virtual-scroll-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  return {
    visibleItems,
    startIndex: visibleRange.startIndex,
    endIndex: visibleRange.endIndex,
    totalHeight,
    offsetY
  };
}
