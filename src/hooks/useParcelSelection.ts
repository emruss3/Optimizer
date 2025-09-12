import { useMemo } from 'react';
import { useActiveProject } from '../store/project';
import { toArray, ParcelSet } from '../lib/parcelSet';

/**
 * Crash-proof parcel selection normalizer
 * Handles various data types and provides safe array operations
 */
export function useParcelSelection() {
  const { selectedParcels, id: activeProjectId, name: activeProjectName } = useActiveProject();
  
  // Normalize selectedParcels to array regardless of input type
  const parcelArr = useMemo(() => {
    if (!selectedParcels) return [];
    
    // Handle Set<string> (primary type)
    if (selectedParcels instanceof Set) {
      return toArray(selectedParcels);
    }
    
    // Handle array (backup)
    if (Array.isArray(selectedParcels)) {
      return selectedParcels.filter(p => p != null).map(String);
    }
    
    // Handle object (legacy support)
    if (typeof selectedParcels === 'object') {
      return Object.values(selectedParcels ?? {}).filter(p => p != null).map(String);
    }
    
    // Fallback for any other type
    return [];
  }, [selectedParcels]);

  // Safe operations that won't crash
  const safeOperations = useMemo(() => ({
    // Safe length check
    count: parcelArr.length,
    
    // Safe boolean checks
    hasSelection: parcelArr.length > 0,
    isEmpty: parcelArr.length === 0,
    isSingle: parcelArr.length === 1,
    isMultiple: parcelArr.length > 1,
    
    // Safe iteration methods
    map: <T>(fn: (id: string, index: number) => T): T[] => parcelArr.map(fn),
    filter: (fn: (id: string) => boolean): string[] => parcelArr.filter(fn),
    forEach: (fn: (id: string, index: number) => void): void => parcelArr.forEach(fn),
    find: (fn: (id: string) => boolean): string | undefined => parcelArr.find(fn),
    includes: (id: string): boolean => parcelArr.includes(id),
    
    // Safe array access
    first: parcelArr[0] || null,
    last: parcelArr[parcelArr.length - 1] || null,
    
    // Safe reduce operations
    reduce: <T>(fn: (acc: T, id: string, index: number) => T, initial: T): T => 
      parcelArr.reduce(fn, initial),
  }), [parcelArr]);

  return {
    // Normalized data
    parcelIds: parcelArr,
    selectedParcels: new Set(parcelArr) as ParcelSet,
    
    // Project context
    activeProjectId,
    activeProjectName,
    
    // Safe operations
    ...safeOperations,
    
    // Raw access for edge cases
    raw: selectedParcels
  };
}