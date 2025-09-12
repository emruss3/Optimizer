import React from 'react';

interface SelectionOutlineUpdaterProps {
  mapRef: React.RefObject<any>;
  selectedIds: Set<string> | string[];
}

export default function SelectionOutlineUpdater({ mapRef, selectedIds }: SelectionOutlineUpdaterProps) {
  // Normalize selectedIds to array
  const idArray = Array.isArray(selectedIds) ? selectedIds : Array.from(selectedIds);
  
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    // Wait for map to be fully loaded
    if (!map.isStyleLoaded()) {
      map.once('styledata', () => {
        updateSelectionFilter();
      });
    } else {
      updateSelectionFilter();
    }
    
    function updateSelectionFilter() {
      try {
        // Update selected parcel outline filter
        if (map.getLayer('selected-project-parcel-outline')) {
          map.setFilter('selected-project-parcel-outline', [
            'in',
            ['to-string', ['get', 'ogc_fid']],
            ['literal', idArray]
          ]);
        }
        
        if (map.getLayer('selected-project-parcel-fill')) {
          map.setFilter('selected-project-parcel-fill', [
            'in', 
            ['to-string', ['get', 'ogc_fid']],
            ['literal', idArray]
          ]);
        }
      } catch (error) {
        console.warn('Error updating selection filter:', error);
      }
    }
  }, [mapRef, idArray]);
  
  return null;
}