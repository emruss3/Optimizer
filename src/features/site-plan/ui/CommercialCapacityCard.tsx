// Order-8 audit (2405 12th Ave S): a commercial-only lot used to reach the
// planner as "industrial", fail to compile, and blank the canvas — while the
// architect's whole answer was FAR × lot (5,171 SF at FAR 0.60). The product
// has no retail massing engine yet; what it CAN say honestly is the ceiling
// an architect builds to, from the same ordinance caps the context resolves.
// Deal language, no properties panel, honesty styled (amber), not apologized.
import React from 'react';

export interface CommercialCapacityCardProps {
  zoning?: string | null;
  /** As-of-right uses the resolver reported (e.g. ['commercial','industrial']). */
  uses: string[];
  lotSqft?: number | null;
  maxFar?: number | null;
  maxHeightFt?: number | null;
  maxImperviousPct?: number | null;
  frontSetbackFt?: number | null;
  rearSetbackFt?: number | null;
  /** The context's own FAR × lot number when present (entitlement_capacity.max_gfa_sqft). */
  allowableGsf?: number | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export const CommercialCapacityCard: React.FC<CommercialCapacityCardProps> = ({
  zoning, uses, lotSqft, maxFar, maxHeightFt, maxImperviousPct, frontSetbackFt, rearSetbackFt, allowableGsf,
}) => {
  const derived = maxFar != null && lotSqft != null && maxFar > 0 && lotSqft > 0 ? maxFar * lotSqft : null;
  const allowable = allowableGsf ?? derived;
  const useWords = uses
    .filter(u => u === 'commercial' || u === 'industrial')
    .map(u => (u === 'commercial' ? 'retail / office' : 'industrial'));
  return (
    <div
      data-testid="commercial-capacity-card"
      className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="font-semibold">
        Commercial lot{zoning ? ` · ${zoning}` : ''} — {useWords.length ? useWords.join(' and ') : 'non-residential use'} permitted as-of-right; no residential use is.
      </div>
      <div className="mt-1 text-xs text-amber-800">
        {allowable != null ? (
          <>
            Allowable floor area <span className="font-semibold tabular-nums">{fmt(allowable)} SF</span>
            {maxFar != null && lotSqft != null ? ` (FAR ${maxFar} × ${fmt(lotSqft)} SF lot)` : ''}
          </>
        ) : (
          <>Allowable floor area not resolvable — the district has no FAR on file.</>
        )}
        {maxHeightFt != null ? ` · height ${fmt(maxHeightFt)} ft` : ''}
        {maxImperviousPct != null ? ` · impervious ${fmt(maxImperviousPct)}%` : ''}
        {frontSetbackFt != null || rearSetbackFt != null
          ? ` · setbacks front ${frontSetbackFt ?? '—'} ft / rear ${rearSetbackFt ?? '—'} ft`
          : ''}
        .
      </div>
      <div className="mt-1 text-xs text-amber-800">
        Retail massing is not modeled yet — the allowable area above is the ceiling an architect builds to
        (single-tenant full plate or a stacked two-tenant scheme). No house or apartment plan is offered
        because none is permitted here as-of-right.
      </div>
    </div>
  );
};
