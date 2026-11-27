// Designs linked to a project, by the parcels that make it up (handoff 11-27, "My plans"). A link is
// added only when the project's parent and phase parcels are known: a street match is never taken
// for one. Until then the project is listed with what is missing, and its parcels show
// "No project plans linked".
import { WEST_HEIMAN_IDS } from './westHeimanDesigns';

export interface ProjectPlanLink {
  projectId: string;
  name: string;
  /** App parcel ids (ogc_fid) of the parent and each phase. Empty until mapped. */
  parcels: string[];
  designIds: readonly string[];
  /** What is still needed before the link applies, when anything is. */
  missing: string | null;
}

export const PROJECT_PLAN_LINKS: readonly ProjectPlanLink[] = [
  {
    projectId: 'the-lanes-2500-w-heiman',
    name: 'The Lanes · 2500 W Heiman St',
    // not 2611 W Heiman (a different parcel); the parent and phase parcels are not identified yet
    parcels: [],
    designIds: WEST_HEIMAN_IDS,
    missing: 'the parent and phase parcel numbers, the matching civil plan and the dimensioned architectural sheets',
  },
];

/** The project plans linked to this parcel, if any. */
export function projectPlansFor(ogcFid: string | number | null | undefined, links: readonly ProjectPlanLink[] = PROJECT_PLAN_LINKS): { project: ProjectPlanLink; designIds: string[] } | null {
  if (ogcFid == null) return null;
  const id = String(ogcFid);
  const project = links.find(l => l.parcels.includes(id));
  return project ? { project, designIds: [...project.designIds] } : null;
}
