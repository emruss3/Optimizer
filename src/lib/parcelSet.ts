// ParcelSet helper utilities for consistent Set<string> operations
export type ParcelSet = Set<string>;

/**
 * Convert Set<string> to string[] for iteration
 * Use this instead of Array.from(set) throughout the app
 */
export const toArray = (s: ParcelSet): string[] => Array.from(s);

/**
 * Generate stable key for Set<string> memoization
 * Use this for useEffect dependencies and cache keys
 */
export const setKey = (s: ParcelSet): string => [...s].sort().join('|');

/**
 * Safe size check for ParcelSet
 */
export const hasItems = (s: ParcelSet): boolean => s.size > 0;

/**
 * Safe contains check for ParcelSet
 */
export const contains = (s: ParcelSet, item: string): boolean => s.has(item);

/**
 * Create new ParcelSet with added item (immutable)
 */
export const addToSet = (s: ParcelSet, item: string): ParcelSet => 
  new Set([...s, item]);

/**
 * Create new ParcelSet with removed item (immutable)
 */
export const removeFromSet = (s: ParcelSet, item: string): ParcelSet => 
  new Set([...s].filter(p => p !== item));