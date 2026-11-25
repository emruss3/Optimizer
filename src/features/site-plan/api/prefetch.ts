/**
 * Start the planner's server calls while the parcel drawer is open.
 *
 * On the production database (a 280 MB cache for 5 GB, 2026-11-24) the first
 * planner calls for a parcel nobody has opened recently read from disk: the
 * context compile took 9 to 23 s and could pass the API timeout, while the
 * same calls a moment later answered in about a second. A user who opens a
 * parcel reads the drawer for a few seconds before opening the planner, so
 * the calls start then. Each call keeps its answer in the module cache the
 * planner already reads (a failed answer is dropped, so the planner asks
 * again), and the database's own cache holds the parcel's rows either way.
 *
 * At most one parcel at a time, and each parcel once per page load: browsing
 * the map should not multiply the load on the database.
 */
import { compilePlannerContext } from './plannerContext';
import { fetchParcelTopo } from './parcelTopo';
import { fetchPlannerNeighbors } from './neighbors';
import { fetchSeedPlan } from './seedPlan';
import { fetchPermittedUses, normalizePermittedUses, pickDefaultUse, defaultUseFromZoningBase } from './designContext';

export interface PrefetchDeps {
  topo: (id: number) => Promise<unknown>;
  neighbors: (id: number) => Promise<unknown>;
  seed: (id: number) => Promise<unknown>;
  permittedUses: (id: number) => Promise<unknown>;
  compile: (id: number, use: string) => Promise<unknown>;
  useFor: (raw: unknown, zoning: string | null | undefined) => string;
}

const defaultDeps: PrefetchDeps = {
  topo: fetchParcelTopo,
  neighbors: fetchPlannerNeighbors,
  seed: id => fetchSeedPlan(id),
  permittedUses: id => fetchPermittedUses(id),
  compile: (id, use) => compilePlannerContext(id, use),
  // the same choice the planner makes before its first compile (SiteWorkspace)
  useFor: (raw, zoning) => {
    const list = normalizePermittedUses(raw as never);
    return (list.length ? pickDefaultUse(list) : defaultUseFromZoningBase(zoning ?? undefined)) || 'single_family';
  },
};

const started = new Set<number>();
let inFlight: Promise<void> | null = null;

export function prefetchPlanner(ogcFid: number, zoning: string | null | undefined, deps: PrefetchDeps = defaultDeps): Promise<void> | null {
  if (!Number.isFinite(ogcFid) || ogcFid <= 0 || started.has(ogcFid) || inFlight) return null;
  started.add(ogcFid);
  const swallow = (p: Promise<unknown>) => p.catch(() => null);
  inFlight = (async () => {
    // the context needs the use first; topography, neighbours and the seed do not
    const context = (async () => {
      const raw = await swallow(deps.permittedUses(ogcFid));
      await swallow(deps.compile(ogcFid, deps.useFor(raw, zoning)));
    })();
    await Promise.all([context, swallow(deps.topo(ogcFid)), swallow(deps.neighbors(ogcFid)), swallow(deps.seed(ogcFid))]);
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function __resetPrefetch(): void {
  started.clear();
  inFlight = null;
}
