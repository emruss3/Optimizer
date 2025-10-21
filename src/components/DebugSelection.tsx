import { useSitePlanStore } from '@/store/sitePlan';

export function DebugSelection() {
  const selectedParcel = useSitePlanStore(s => s.selectedParcel);
  const activeSitePlan = useSitePlanStore(s => s.activeSitePlan);
  
  return (
    <div className="fixed bottom-2 left-2 z-50 bg-black/70 text-white px-2 py-1 rounded text-xs">
      <div>Parcel: {selectedParcel?.ogc_fid ?? 'none'}</div>
      <div>Site Plan: {activeSitePlan ? 'yes' : 'no'}</div>
    </div>
  );
}

