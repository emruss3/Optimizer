import React from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../store/ui';

const N = (n?: number | null) => (n ?? "—");
const I = (n?: number | null) => (Number.isFinite(n as any) ? (n as number).toLocaleString() : "—");
const $ = (n?: number | null) => (Number.isFinite(n as any) ? (n as number).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}) : "—");

export default function MinimalParcelDrawer() {
  const { openDrawer, selectedParcel: p, closeDrawer, setSelectedParcel } = useUIStore();
  
  // Show when parcel is selected OR when openDrawer is explicitly PARCEL
  const isParcelDrawerOpen = selectedParcel || openDrawer === 'PARCEL';
  
  if (!isParcelDrawerOpen || !p) return null;

  const handleClose = () => {
    setSelectedParcel(null);
    closeDrawer();
  };

  return (
    <aside className="fixed right-0 top-0 h-full w-[460px] overflow-y-auto bg-white shadow-2xl p-5 z-50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{p.address ?? "Parcel"}</h2>
        <button
          onClick={handleClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close parcel details"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <div><b>Parcel #</b> {p.parcelnumb ?? "—"}</div>
        <div><b>Zoning</b> {p.zoning ?? "—"} <span className="text-gray-500">({p.zoning_description ?? "—"})</span></div>
        <div><b>Use</b> {p.usedesc ?? "—"}</div>

        <hr className="my-2"/>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><b>Deeded Acres</b> {N(p.deeded_acres)}</div>
          <div><b>Sq Ft</b> {I(p.sqft)}</div>
          <div><b>Year Built</b> {I(p.yearbuilt)}</div>
          <div><b>Style</b> {p.structstyle ?? "—"}</div>
          <div><b>Units</b> {I(p.numunits)}</div>
        </div>

        <hr className="my-2"/>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><b>Parcel Value</b> {$(p.parval)}</div>
          <div><b>Land Value</b> {$(p.landval)}</div>
          <div><b>Improvement Value</b> {$(p.improvval)}</div>
          <div><b>Last Sale</b> {$(p.saleprice)} {p.saledate ? `(${p.saledate})` : ""}</div>
          <div><b>Tax (Year)</b> {$(p.taxamt)} {p.taxyear ?? ""}</div>
        </div>

        <hr className="my-2"/>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div><b>Max FAR</b> {N(p.max_far)}</div>
          <div><b>Max DU/acre</b> {N(p.max_density_du_per_acre)}</div>
          <div><b>Max Impervious %</b> {N(p.max_impervious_coverage_pct)}</div>
          <div><b>Front Setback (ft)</b> {N(p.min_front_setback_ft)}</div>
          <div><b>Side Setback (ft)</b> {N(p.min_side_setback_ft)}</div>
          <div><b>Rear Setback (ft)</b> {N(p.min_rear_setback_ft)}</div>
        </div>

        <hr className="my-2"/>
        <div><b>Lat/Lon</b> {N(p.lat)}, {N(p.lon)}</div>
      </div>
    </aside>
  );
}