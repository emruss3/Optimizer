import React, { useEffect, useMemo, useState } from 'react';
import { X, Calculator, Eye } from 'lucide-react';
import type { Element } from '../../../engine/types';
import type { MfCandidate } from '../api/generateMfPlan';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

type Drawing = Element[] | null | 'loading';

interface Row {
  key: string;
  label: string;
  value: (c: MfCandidate) => number | null;
  show: (v: number) => string;
  /** How a difference from the first scheme reads. */
  diff: (d: number) => string;
}

const signed = (d: number, text: string) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${text}`;

const ROWS: Row[] = [
  { key: 'units', label: 'Units', value: c => num(c.metrics.units_est), show: v => v.toLocaleString(), diff: d => signed(d, Math.abs(d).toLocaleString()) },
  { key: 'stalls', label: 'Parking stalls', value: c => num(c.metrics.stalls), show: v => v.toLocaleString(), diff: d => signed(d, Math.abs(d).toLocaleString()) },
  { key: 'gsf', label: 'Building area', value: c => num(c.metrics.gfa_sqft), show: v => `${Math.round(v).toLocaleString()} GSF`, diff: d => signed(d, Math.round(Math.abs(d)).toLocaleString()) },
  { key: 'far', label: 'FAR', value: c => num(c.metrics.far), show: v => v.toFixed(2), diff: d => signed(d, Math.abs(d).toFixed(2)) },
  { key: 'margin', label: 'Margin on cost', value: c => (typeof c.marginOnCost === 'number' ? c.marginOnCost * 100 : null), show: v => `${v.toFixed(1)}%`, diff: d => signed(d, `${Math.abs(d).toFixed(1)} pts`) },
];

const FILL: Partial<Record<Element['type'], string>> = {
  greenspace: '#dfe9d6',
  circulation: '#cfcfca',
  road: '#cfcfca',
  'parking-aisle': '#cfcfca',
  parking: '#e4e2dc',
  'parking-bay': '#e4e2dc',
  building: '#3b4654',
};
const ORDER: Element['type'][] = ['greenspace', 'circulation', 'road', 'parking-aisle', 'parking', 'parking-bay', 'building'];

/** One scheme, drawn inside the frame every scheme in the comparison shares. */
const SchemeDrawing: React.FC<{ ring: number[][]; elements: Drawing; frame: { x: number; y: number; w: number; h: number } }> = ({ ring, elements, frame }) => {
  // the plan frame has north up; the screen has y down
  const path = (pts: number[][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${((p[0] ?? 0) - frame.x).toFixed(2)} ${(frame.y + frame.h - (p[1] ?? 0)).toFixed(2)}`).join('') + 'Z';
  const sorted = Array.isArray(elements)
    ? [...elements].filter(e => FILL[e.type]).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    : [];
  // one screen pixel, in plan units: the drawing is fitted into a 320 by 224 box
  const hair = Math.max(frame.w / 320, frame.h / 224);
  return (
    <svg viewBox={`0 0 ${frame.w} ${frame.h}`} className="w-full h-56 bg-stone-50 rounded border border-gray-200" role="img" aria-label="Scheme drawing">
      <path d={path(ring)} fill="#f4f2ec" stroke="none" />
      {sorted.map(e => (
        <path key={e.id} d={(e.geometry.coordinates as number[][][]).map(path).join('')} fillRule="evenodd" fill={FILL[e.type]} stroke={e.type === 'building' ? '#1f2630' : 'none'} strokeWidth={hair} />
      ))}
      <path d={path(ring)} fill="none" stroke="#b4232a" strokeWidth={hair * 1.6} strokeDasharray={`${hair * 8} ${hair * 3} ${hair * 2} ${hair * 3}`} />
      {elements === 'loading' && (
        <text x={frame.w / 2} y={frame.h / 2} textAnchor="middle" fontSize={hair * 11} fill="#6b7280">Drawing…</text>
      )}
      {elements === null && (
        <text x={frame.w / 2} y={frame.h / 2} textAnchor="middle" fontSize={hair * 11} fill="#6b7280">Drawing not available</text>
      )}
    </svg>
  );
};

/**
 * Saved schemes side by side. Every drawing uses one frame fitted to the
 * parcel, so a building that looks bigger is bigger. The figures are the ones
 * stored with each scheme; nothing is measured here.
 */
const SchemeCompare: React.FC<{
  schemes: { candidate: MfCandidate; name: string }[];
  parcelRing: number[][];
  load: (c: MfCandidate) => Promise<Element[] | null>;
  activeId: string | null;
  onView: (c: MfCandidate) => void;
  onUnderwrite: (c: MfCandidate) => void;
  onClose: () => void;
}> = ({ schemes, parcelRing, load, activeId, onView, onUnderwrite, onClose }) => {
  const [drawings, setDrawings] = useState<Record<string, Drawing>>({});
  const ids = schemes.map(s => s.candidate.id).join('|');

  useEffect(() => {
    let live = true;
    // one at a time: each replay is a full solve on the server
    (async () => {
      for (const s of schemes) {
        if (!live) return;
        setDrawings(d => ({ ...d, [s.candidate.id]: 'loading' }));
        const els = await load(s.candidate).catch(() => null);
        if (!live) return;
        setDrawings(d => ({ ...d, [s.candidate.id]: els }));
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, load]);

  const frame = useMemo(() => {
    const xs = parcelRing.map(p => p[0] ?? 0), ys = parcelRing.map(p => p[1] ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [parcelRing]);

  const base = schemes[0]?.candidate;
  const rows = ROWS.filter(r => schemes.some(s => r.value(s.candidate) != null));
  const cols = schemes.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="scheme-compare" role="dialog" aria-label="Compare schemes">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Compare schemes</h2>
            <p className="text-xs text-gray-500">Same parcel, same scale. Differences are against {schemes[0]?.name}. Figures are the ones saved with each scheme; each drawing is replayed from its saved settings.</p>
          </div>
          <button onClick={onClose} aria-label="Close comparison" className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className={`grid ${cols} gap-4 p-4`}>
          {schemes.map(({ candidate: c, name }, i) => (
            <div key={c.id} data-testid={`compare-col-${i}`} className="min-w-0">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-semibold text-gray-900">{name}</span>
                <span className="text-[11px] text-gray-500">
                  {activeId === c.id ? 'On the sheet now' : c.createdAt ? new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <SchemeDrawing ring={parcelRing} elements={drawings[c.id] === undefined ? 'loading' : drawings[c.id]!} frame={frame} />
              <table className="w-full mt-2 text-xs">
                <tbody>
                  {rows.map(r => {
                    const v = r.value(c);
                    const b = base ? r.value(base) : null;
                    const d = i > 0 && v != null && b != null ? v - b : null;
                    return (
                      <tr key={r.key} className="border-b border-gray-100 last:border-0">
                        <td className="py-1 text-gray-500">{r.label}</td>
                        <td className="py-1 text-right tabular-nums font-medium text-gray-900" data-testid={`compare-${r.key}-${i}`}>
                          {v != null ? r.show(v) : 'not reported'}
                        </td>
                        <td className={`py-1 pl-2 w-20 text-right tabular-nums ${d == null || d === 0 ? 'text-gray-400' : d > 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {i === 0 ? '' : d == null ? '' : d === 0 ? 'same' : r.diff(d)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { onUnderwrite(c); onClose(); }}
                  data-testid={`compare-underwrite-${i}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                  <Calculator className="w-3.5 h-3.5" /> Underwrite this scheme
                </button>
                <button
                  onClick={() => { onView(c); onClose(); }}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="w-3.5 h-3.5" /> Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SchemeCompare;
