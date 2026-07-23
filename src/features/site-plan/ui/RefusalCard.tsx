// J1 refusal UX (UX plan rev C, Round 1): a correct NO is a deliverable.
// The engine's buildability verdict renders with its numbers and — when a
// narrower typology would fit — a one-tap switch. Honesty is styled, not
// apologized (design doctrine rule 5): amber, not error-red.
import React from 'react';
import type { ParcelBuildability } from '../api/parcelBuildability';

/** A townhome row's party-wall slice is far shallower than the 67.3 ft
 *  double-loaded apartment bar; ≥36 ft of inscribed width is enough to
 *  suggest the switch. */
const TH_MIN_WIDTH_FT = 36;

export const RefusalCard: React.FC<{
  buildability: ParcelBuildability;
  onSwitchToTownhomes?: () => void;
}> = ({ buildability, onSwitchToTownhomes }) => {
  const width = buildability.max_inscribed_width_ft;
  const barDepth = buildability.bar_depth_required_ft;
  const canSuggestTownhome =
    buildability.verdict !== 'unbuildable_area' &&
    typeof width === 'number' && width >= TH_MIN_WIDTH_FT &&
    !!onSwitchToTownhomes;
  return (
    <div
      data-testid="refusal-card"
      className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="font-semibold">
        Refused: {buildability.reason ?? buildability.verdict.replace(/_/g, ' ')}
      </div>
      <div className="mt-1 text-xs text-amber-800">
        {typeof width === 'number' && typeof barDepth === 'number' && (
          <span>
            Max inscribed width {width.toLocaleString()} ft vs {barDepth} ft bar depth required
            {typeof buildability.envelope_sqft === 'number'
              ? ` · buildable envelope ${Math.round(buildability.envelope_sqft).toLocaleString()} sf`
              : ''}
            .{' '}
          </span>
        )}
        {canSuggestTownhome ? (
          <>
            A townhome row (≥{TH_MIN_WIDTH_FT} ft) would fit this envelope.{' '}
            <button
              type="button"
              onClick={onSwitchToTownhomes}
              className="font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              Try townhomes
            </button>
          </>
        ) : (
          <span>
            No typology we model fits this envelope — the correct answer for this parcel is no.
          </span>
        )}
      </div>
    </div>
  );
};
