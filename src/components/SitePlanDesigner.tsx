import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import type { SelectedParcel } from '../types/parcel';
import { SiteWorkspace } from '../features/site-plan';
import { BUILD_STAMP } from '../lib/buildInfo';

interface SitePlanDesignerProps {
  parcel: SelectedParcel;
  /** Called when the user leaves the planner (X button or Esc). */
  onClose?: () => void;
}

/**
 * Full-screen site planner. Mounting this component IS the navigation — no
 * extra "expand" click. It portals to <body> (the drawer applies a CSS
 * transform, which would otherwise trap a fixed overlay) and takes the whole
 * viewport; Esc or the X returns to the map.
 */
const SitePlanDesigner: React.FC<SitePlanDesignerProps> = ({ parcel, onClose }) => {
  useEffect(() => {
    console.info(`[planner] build ${BUILD_STAMP}`);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" data-testid="siteplan-fullscreen">
      {/* Slim header: where am I + how do I get back */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to map
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {parcel.address || `Parcel ${parcel.ogc_fid}`}
            </span>
            {parcel.zoning && (
              <span className="ml-2 text-xs font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                {parcel.zoning}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden lg:inline text-[10px] text-gray-300 font-mono" title="Build (commit · UTC time)">
            {BUILD_STAMP}
          </span>
          <span className="hidden md:inline text-[11px] text-gray-400">Esc to close</span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Close site planner"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <SiteWorkspace parcel={parcel} />
      </div>
    </div>,
    document.body
  );
};

export default SitePlanDesigner;
