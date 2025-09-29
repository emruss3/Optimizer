import { useCallback, useRef, useState } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

interface TouchGesture {
  type: 'tap' | 'double-tap' | 'long-press' | 'pan' | 'pinch' | 'rotate';
  startPoint?: TouchPoint;
  endPoint?: TouchPoint;
  center?: TouchPoint;
  scale?: number;
  rotation?: number;
  deltaX?: number;
  deltaY?: number;
}

export function useTouchGestures() {
  const [gesture, setGesture] = useState<TouchGesture | null>(null);
  const touchStartRef = useRef<TouchPoint[]>([]);
  const touchMoveRef = useRef<TouchPoint[]>([]);
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getTouchPoint = useCallback((touch: Touch): TouchPoint => ({
    x: touch.clientX,
    y: touch.clientY,
    id: touch.identifier
  }), []);

  const getCenter = useCallback((touches: TouchPoint[]): TouchPoint => {
    if (touches.length === 0) return { x: 0, y: 0, id: -1 };
    if (touches.length === 1) return touches[0];

    const centerX = touches.reduce((sum, touch) => sum + touch.x, 0) / touches.length;
    const centerY = touches.reduce((sum, touch) => sum + touch.y, 0) / touches.length;
    
    return { x: centerX, y: centerY, id: -1 };
  }, []);

  const getDistance = useCallback((p1: TouchPoint, p2: TouchPoint): number => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getAngle = useCallback((p1: TouchPoint, p2: TouchPoint): number => {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }, []);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    event.preventDefault();
    
    const touches = Array.from(event.touches).map(getTouchPoint);
    touchStartRef.current = touches;
    touchMoveRef.current = touches;

    // Long press detection
    if (touches.length === 1) {
      longPressTimerRef.current = setTimeout(() => {
        setGesture({
          type: 'long-press',
          startPoint: touches[0],
          center: touches[0]
        });
      }, 500);
    }

    // Double tap detection
    const now = Date.now();
    if (now - lastTapRef.current < 300 && touches.length === 1) {
      setGesture({
        type: 'double-tap',
        startPoint: touches[0],
        center: touches[0]
      });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [getTouchPoint]);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    event.preventDefault();
    
    const touches = Array.from(event.touches).map(getTouchPoint);
    touchMoveRef.current = touches;

    // Clear long press timer if moving
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (touches.length === 1 && touchStartRef.current.length === 1) {
      // Single finger pan
      const start = touchStartRef.current[0];
      const current = touches[0];
      
      setGesture({
        type: 'pan',
        startPoint: start,
        endPoint: current,
        center: current,
        deltaX: current.x - start.x,
        deltaY: current.y - start.y
      });
    } else if (touches.length === 2 && touchStartRef.current.length === 2) {
      // Two finger pinch/rotate
      const startCenter = getCenter(touchStartRef.current);
      const currentCenter = getCenter(touches);
      
      const startDistance = getDistance(touchStartRef.current[0], touchStartRef.current[1]);
      const currentDistance = getDistance(touches[0], touches[1]);
      
      const startAngle = getAngle(touchStartRef.current[0], touchStartRef.current[1]);
      const currentAngle = getAngle(touches[0], touches[1]);
      
      const scale = currentDistance / startDistance;
      const rotation = currentAngle - startAngle;
      
      setGesture({
        type: scale > 1.1 ? 'pinch' : 'rotate',
        startPoint: startCenter,
        endPoint: currentCenter,
        center: currentCenter,
        scale,
        rotation
      });
    }
  }, [getTouchPoint, getCenter, getDistance, getAngle]);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    event.preventDefault();
    
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const touches = Array.from(event.touches).map(getTouchPoint);
    
    if (touches.length === 0 && touchStartRef.current.length === 1) {
      // Single tap
      const start = touchStartRef.current[0];
      const end = touchMoveRef.current[0] || start;
      const distance = getDistance(start, end);
      
      if (distance < 10) { // Small movement threshold
        setGesture({
          type: 'tap',
          startPoint: start,
          endPoint: end,
          center: start
        });
      }
    }

    touchStartRef.current = [];
    touchMoveRef.current = [];
  }, [getTouchPoint, getDistance]);

  const clearGesture = useCallback(() => {
    setGesture(null);
  }, []);

  return {
    gesture,
    clearGesture,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
