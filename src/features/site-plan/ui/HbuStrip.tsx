import React, { useEffect, useState } from 'react';
import { compilePlannerContext } from '../api/plannerContext';
import { fetchMaxBuildout } from '../api/maxBuildout';

interface HbuRow {
  use: string;
  typology: string;
  allowed: boolean;
  maxGsf: number | null;
  unitsAtMax: number | null;
  entitledUnits: number | null;
}

const labelForUse = (u: string): string =>
  u.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * HIGHEST & BEST USE comparator (P1-1): "highest and best" is analyzed,
 * never asserted. Every as-of-right use compiles (cached snapshots — this
 * is cheap on revisit), its theoretical envelope is fetched, and the uses
 * rank by legal GSF ceiling. Clicking a row flips the workspace to that
 * use through the same use-change path the Design Context panel uses.
 * Deliberately envelope-based in v1: financial ranking joins when the
 * pro-forma layer un-parks.
 */
const HbuStrip: React.FC<{
  ogcFid: number;
  uses: string[];
  activeUse: string;
  onSelectUse: (use: string) => void;
}> = ({ ogcFid, uses, activeUse, onSelectUse }) => {
  const [rows, setRows] = useState<HbuRow[] | null>(null);

  useEffect(() => {
    if (!ogcFid || uses.length < 2) {
      setRows(null);
      return;
    }
    let cancelled = false;
    Promise.all(
      uses.map(async (use): Promise<HbuRow> => {
        try {
          const ctx = await compilePlannerContext(ogcFid, use);
          const typology = ctx?.context.typology ?? use;
          const allowed = !!ctx?.generation_allowed;
          if (!ctx || typology !== 'multifamily') {
            return { use, typology, allowed, maxGsf: null, unitsAtMax: null, entitledUnits: null };
          }
          const b = await fetchMaxBuildout(ogcFid, 'multifamily');
          return {
            use,
            typology,
            allowed,
            maxGsf: b?.max_gsf ?? null,
            unitsAtMax: b?.units_at_max ?? null,
            entitledUnits: b?.entitlement_capacity?.max_units ?? null,
          };
        } catch {
          return { use, typology: use, allowed: false, maxGsf: null, unitsAtMax: null, entitledUnits: null };
        }
      })
    ).then(r => {
      if (cancelled) return;
      // Rank by legal GSF ceiling; envelope-less products sink but stay
      // visible (lot-fit uses are legitimate, just not GSF-ranked yet).
      r.sort((a, b) => (b.maxGsf ?? -1) - (a.maxGsf ?? -1));
      setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [ogcFid, uses.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || rows.length < 2) return null;
  const best = rows[0];

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Highest &amp; best (by legal envelope)
        </span>
        {rows.map((r, i) => {
          const active = r.use === activeUse;
          const isBest = i === 0 && r.maxGsf != null;
          return (
            <button
              key={r.use}
              onClick={() => !active && onSelectUse(r.use)}
              title={
                r.maxGsf != null
                  ? `Theoretical envelope ${r.maxGsf.toLocaleString()} GSF · ${r.unitsAtMax ?? '—'}u at max` +
                    (r.entitledUnits != null ? ` · ${r.entitledUnits}u entitled` : '')
                  : 'Lot-fit product — not GSF-ranked in v1'
              }
              className={`text-xs rounded-full px-2.5 py-1 border flex items-center gap-1.5 ${
                active
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
              } ${!r.allowed ? 'opacity-50' : ''}`}
            >
              {isBest && <span aria-label="Highest and best" title="Highest legal envelope">★</span>}
              <span className="font-medium">{labelForUse(r.use)}</span>
              {r.maxGsf != null ? (
                <span className="tabular-nums text-gray-500">
                  {Math.round(r.maxGsf / 1000)}k GSF{r.unitsAtMax != null ? ` · ${r.unitsAtMax}u` : ''}
                </span>
              ) : (
                <span className="text-gray-400">lot fit</span>
              )}
              {!r.allowed && <span className="text-red-500">not permitted</span>}
            </button>
          );
        })}
        {best.maxGsf != null && best.use !== activeUse && (
          <span className="text-[11px] text-amber-700">
            The active use is not the highest envelope — click {labelForUse(best.use)} to plan it.
          </span>
        )}
      </div>
    </div>
  );
};

export default HbuStrip;
