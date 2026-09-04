/**
 * Street profiles (2026-09-04): existing grade along each through-street's
 * centreline from the parcel topography — the plan-and-profile view a civil
 * sheet carries. Stations in feet, elevations in NAVD88 feet, the vertical
 * exaggeration stated. Existing grade only: the design profile is the civil's
 * decision, not something to invent here.
 */
import React from 'react';
import type { Position } from 'geojson';
import type { Element } from '../../../engine/types';
import { TopoGrid, profileAlong, stationLabel, type ParcelTopo, type ProfilePoint } from '../api/parcelTopo';

export interface StreetProfileData {
  id: string;
  name: string;
  widthFt: number | null;
  lengthFt: number;
  points: ProfilePoint[];
  startZ: number;
  endZ: number;
  lowZ: number;
  highZ: number;
  /** end-to-end grade, % (signed: positive rises along the station) */
  overallGradePct: number;
  /** steepest grade between consecutive samples, % (absolute) */
  maxGradePct: number;
  hazardCrossingFt: number | null;
}

export function buildStreetProfiles(elements: Element[], grid: TopoGrid | null, stepFt = 25): StreetProfileData[] {
  if (!grid) return [];
  const out: StreetProfileData[] = [];
  for (const el of elements) {
    const p = el.properties as Record<string, unknown> | undefined;
    if (el.type !== 'circulation' || p?.kind !== 'through' || !Array.isArray(p.centerline2274)) continue;
    const pts = profileAlong(grid, p.centerline2274 as Position[], stepFt);
    if (pts.length < 2) continue;
    const zs = pts.map(q => q.zFt);
    const L = pts[pts.length - 1].stationFt;
    let maxG = 0;
    for (let i = 1; i < pts.length; i++) {
      const run = pts[i].stationFt - pts[i - 1].stationFt;
      if (run > 0) maxG = Math.max(maxG, Math.abs((pts[i].zFt - pts[i - 1].zFt) / run) * 100);
    }
    out.push({
      id: el.id,
      name: String(el.name ?? 'Street'),
      widthFt: typeof p.widthFt === 'number' ? p.widthFt : null,
      lengthFt: Math.round(L),
      points: pts,
      startZ: zs[0],
      endZ: zs[zs.length - 1],
      lowZ: Math.min(...zs),
      highZ: Math.max(...zs),
      overallGradePct: L > 0 ? Math.round(((zs[zs.length - 1] - zs[0]) / L) * 1000) / 10 : 0,
      maxGradePct: Math.round(maxG * 10) / 10,
      hazardCrossingFt: typeof p.hazardCrossingFt === 'number' && p.hazardCrossingFt > 0 ? p.hazardCrossingFt : null,
    });
  }
  return out;
}

const W = 760, H = 180, ML = 46, MR = 14, MT = 16, MB = 28;

const ProfileChart: React.FC<{ d: StreetProfileData }> = ({ d }) => {
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const L = Math.max(1, d.lengthFt);
  const range = Math.max(4, d.highZ - d.lowZ);
  const pad = range * 0.15;
  const zLo = d.lowZ - pad, zHi = d.highZ + pad;
  const sx = (s: number) => ML + (s / L) * plotW;
  const sy = (z: number) => MT + plotH - ((z - zLo) / (zHi - zLo)) * plotH;
  const exag = (plotH / (zHi - zLo)) / (plotW / L);
  const path = d.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.stationFt).toFixed(1)},${sy(p.zFt).toFixed(1)}`).join(' ');
  const stationStep = L > 1500 ? 200 : 100;
  const stations: number[] = [];
  for (let s = 0; s <= L; s += stationStep) stations.push(s);
  const zStep = zHi - zLo > 30 ? 10 : zHi - zLo > 12 ? 5 : zHi - zLo > 4 ? 2 : 1;
  const zTicks: number[] = [];
  for (let z = Math.ceil(zLo / zStep) * zStep; z <= zHi; z += zStep) zTicks.push(z);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${d.name} existing grade profile`}>
      <rect x={ML} y={MT} width={plotW} height={plotH} fill="#FAFAF9" stroke="#E7E5E4" />
      {zTicks.map(z => (
        <g key={`z${z}`}>
          <line x1={ML} x2={ML + plotW} y1={sy(z)} y2={sy(z)} stroke="#E7E5E4" strokeWidth={0.6} />
          <text x={ML - 4} y={sy(z) + 3} fontSize={9} textAnchor="end" fill="#78716C">{z}</text>
        </g>
      ))}
      {stations.map(s => (
        <g key={`s${s}`}>
          <line x1={sx(s)} x2={sx(s)} y1={MT} y2={MT + plotH} stroke="#E7E5E4" strokeWidth={0.6} />
          <text x={sx(s)} y={MT + plotH + 12} fontSize={9} textAnchor="middle" fill="#78716C">{stationLabel(s)}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#92400E" strokeWidth={1.6} />
      <circle cx={sx(0)} cy={sy(d.startZ)} r={2.4} fill="#92400E" />
      <circle cx={sx(L)} cy={sy(d.endZ)} r={2.4} fill="#92400E" />
      <text x={sx(0) + 4} y={sy(d.startZ) - 5} fontSize={9} fill="#57534E">EG {d.startZ.toFixed(1)}</text>
      <text x={sx(L) - 4} y={sy(d.endZ) - 5} fontSize={9} textAnchor="end" fill="#57534E">EG {d.endZ.toFixed(1)}</text>
      <text x={ML + plotW} y={MT + plotH + 24} fontSize={8.5} textAnchor="end" fill="#A8A29E">
        station (ft) · elevation NAVD88 (ft) · vertical exaggeration {exag >= 10 ? Math.round(exag) : exag.toFixed(1)}×
      </text>
    </svg>
  );
};

export const StreetProfilePanel: React.FC<{ profiles: StreetProfileData[]; topo: ParcelTopo | null }> = ({ profiles, topo }) => {
  if (!topo) {
    return (
      <div data-testid="street-profile-empty" className="p-4 text-xs text-gray-500">
        Topography is not available for this parcel yet (USGS 3DEP fetch pending or unreachable) — no profile can be drawn.
      </div>
    );
  }
  if (profiles.length === 0) {
    return (
      <div data-testid="street-profile-empty" className="p-4 text-xs text-gray-500">
        No through-street on this plan to profile. Topography: {topo.z_min_ft}–{topo.z_max_ft} ft, mean slope {topo.mean_slope_pct}%, steepest {topo.max_slope_pct}%.
      </div>
    );
  }
  return (
    <div data-testid="street-profile" className="p-3 space-y-4">
      {profiles.map(d => (
        <div key={d.id} data-testid={`street-profile-${d.id}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
            <span className="font-semibold text-gray-800">{d.name} · existing grade</span>
            <span className="text-gray-600">
              {d.lengthFt.toLocaleString()} ft{d.widthFt ? ` · ${d.widthFt}' R.O.W.` : ''} · EG {d.startZ.toFixed(1)} → {d.endZ.toFixed(1)} ·{' '}
              {d.overallGradePct > 0 ? '+' : ''}{d.overallGradePct}% overall · steepest {d.maxGradePct}% over 25 ft · low {d.lowZ.toFixed(1)} / high {d.highZ.toFixed(1)}
              {d.hazardCrossingFt ? ` · crosses ${d.hazardCrossingFt} ft of held-out land (culvert / bridge)` : ''}
            </span>
          </div>
          <ProfileChart d={d} />
        </div>
      ))}
      <div className="text-[10px] text-gray-400">
        {topo.source ?? 'USGS 3DEP 1 m DEM'} · {topo.spacing_ft}-ft sample grid · parcel {topo.z_min_ft}–{topo.z_max_ft} ft, mean slope {topo.mean_slope_pct}%, steepest {topo.max_slope_pct}%. Existing grade only — the design profile is the civil's.
      </div>
    </div>
  );
};

export default StreetProfilePanel;
