/**
 * @deprecated — The seed-pad / mutate-pad genetic pipeline has been removed.
 * Layout generation is now handled by the simulated-annealing optimizer
 * (src/engine/optimizer.ts) triggered from SiteWorkspace → workerManager.optimizeSite().
 *
 * This stub is kept so existing route/component trees that reference
 * <LayoutGenerator /> don't crash at import time.
 */

import React from 'react';

interface LayoutGeneratorProps {
  parcel_id: string;
  parcel_area_sqft: number;
  onLayoutSelected?: (layout: unknown) => void;
  className?: string;
}

export function LayoutGenerator({
  className = '',
}: LayoutGeneratorProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500 ${className}`}>
      <p>
        Layout generation has moved to the <strong>Generate Plan</strong> button
        in the Site Plan workspace (simulated-annealing optimizer).
      </p>
    </div>
  );
}
