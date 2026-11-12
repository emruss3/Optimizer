// Street access as a finding the user can act on: what is known, why it is
// not settled, and what evidence would settle it. Every figure here is the
// engine's own; nothing is measured in the browser.
import type { LineString } from 'geojson';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { feature4326To3857 } from '../../../utils/reproject';
import type { ParcelFrontage } from './parcelFrontage';
import type { MfAccessSummary } from './mfAccess';

export interface AccessFinding {
  state: 'verified' | 'needs_verification';
  headline: string;
  /** What the app knows, and where from. */
  why: string;
  /** Evidence that would settle it. Empty when nothing is open. */
  clears: string[];
  /** The street edge of the parcel in the plan's frame, when the frontage layer has one. */
  frontageLine: number[][] | null;
  frontageLabel: string | null;
}

const SURVEY = 'A boundary survey or recorded plat that shows the parcel line on a public right-of-way.';
const EASEMENT = 'A recorded access easement across the neighbouring parcel, with its width.';
const CURB = 'A driveway permit or approved curb cut for the street the plan enters from.';

function frontageInPlanFrame(frontage: ParcelFrontage | null | undefined): number[][] | null {
  const g = frontage?.primary?.geom_2274 as LineString | undefined;
  if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
  try {
    const out = feature4326To3857(geom2274To4326(g) as never) as LineString;
    return out.coordinates as number[][];
  } catch {
    return null;
  }
}

export function accessFinding(input: {
  frontage: ParcelFrontage | null | undefined;
  /** The engine's own access reading, when a plan answer carries one. */
  engineAccess: { type: string; message: string | null } | null | undefined;
  /** Flags on the plan and its context. */
  flags: string[];
  /** Drives on the plan and whether one reaches the parcel line; null when the plan has no drives to check. */
  drives: MfAccessSummary | null;
}): AccessFinding | null {
  const { frontage, engineAccess, flags, drives } = input;
  const line = frontageInPlanFrame(frontage);
  const ft = frontage && !frontage.landlocked && frontage.total_frontage_ft > 0 ? Math.round(frontage.total_frontage_ft) : null;
  const label = ft != null ? `Street frontage · ${ft} ft` : null;
  const base = { frontageLine: line, frontageLabel: label };

  if (engineAccess?.type === 'none' || (!engineAccess && frontage?.landlocked === true)) {
    return {
      ...base, frontageLine: null, frontageLabel: null,
      state: 'needs_verification',
      headline: 'No street access on record',
      why: engineAccess?.message ?? 'The parcel map shows no boundary on a street, right-of-way or mapped lane. The plan assumes access by easement.',
      clears: [EASEMENT, SURVEY],
    };
  }
  if (engineAccess?.type === 'private_lane') {
    return {
      ...base,
      state: 'needs_verification',
      headline: 'Access is by a private lane',
      why: engineAccess.message ?? 'The parcel is reached over a private lane, not a public street.',
      clears: [EASEMENT, 'The maintenance agreement for the lane, if one is recorded.'],
    };
  }
  if (flags.includes('entry_heuristic_no_row_frontage')) {
    return {
      ...base,
      state: 'needs_verification',
      headline: 'Street access needs verification',
      why: 'No right-of-way edge was found on the parcel boundary. The entry was placed on the longest edge as a stand-in.',
      clears: [SURVEY, EASEMENT],
    };
  }
  if (flags.includes('frontage_geometry_is_placeholder_until_road_edge_upgrade')) {
    return {
      ...base,
      state: 'needs_verification',
      headline: 'Street access needs verification',
      why: line
        ? 'The plan enters from the edge the parcel map shows as street frontage. That edge comes from the parcel map, not from a surveyed road edge.'
        : 'The street edge used for the entry is an estimate, not a surveyed road edge.',
      clears: [SURVEY, CURB],
    };
  }
  if (drives && drives.drives > 0 && !drives.curb) {
    return {
      ...base,
      state: 'needs_verification',
      headline: 'The drive does not reach the street',
      why: 'No drive on this plan touches the parcel line, so the parking has no drawn way out.',
      clears: ['A plan whose entry drive meets the highlighted frontage. Recalculate, or draw the drive to the street edge.', CURB],
    };
  }
  if (!frontage && !engineAccess) return null;
  return {
    ...base,
    state: 'verified',
    headline: 'Street frontage found',
    why: ft != null
      ? `The parcel map shows ${ft} ft of boundary on a street. This is from the parcel map, not a survey.`
      : 'The engine reads a street on the parcel boundary. This is from the parcel map, not a survey.',
    clears: [],
  };
}
