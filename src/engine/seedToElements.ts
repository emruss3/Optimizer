/**
 * Stage-ordered seed rendering (SEND_TO_CLAUDE_CODE_4 item 1): map the
 * engine's placed seed — zones, spine + entry apron, striped bays, the
 * single-L as ONE building outline — onto canvas elements in draw order.
 * Geometry: EPSG:2274 feet → WGS84 → EPSG:3857 metres (the canvas frame);
 * all AREAS/LENGTHS displayed come from the engine's feet, never re-measured.
 */
import polyclip from 'polygon-clipping';
import type { Polygon, LineString, Point, Position } from 'geojson';
import type { Element } from './types';
import { generateUnitMixForCount } from './model';
import { geom2274To4326 } from '../utils/tnStatePlane';
import { feature4326To3857 } from '../utils/reproject';
import type { SeedPlan } from '../features/site-plan/api/seedPlan';

const AVG_UNIT_SF = 950;

export function isSeedElement(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith('seed-');
}

const to3857 = <T extends { type: string; coordinates: unknown }>(g: T): T =>
  feature4326To3857(geom2274To4326(g) as never) as T;

/** Buffer a 2-point spine line into a drive rectangle (width in metres). */
function lineToRect(line: LineString, widthM: number): Polygon | null {
  const c = line.coordinates as Position[];
  if (!c || c.length < 2) return null;
  const [x1, y1] = c[0];
  const [x2, y2] = c[c.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const nx = (-dy / len) * (widthM / 2);
  const ny = (dx / len) * (widthM / 2);
  return {
    type: 'Polygon',
    coordinates: [[
      [x1 + nx, y1 + ny], [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny], [x1 - nx, y1 - ny],
      [x1 + nx, y1 + ny],
    ]],
  };
}

export function seedToElements(seed: SeedPlan): { elements: Element[]; basis: string; inFamily: string | null } {
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];
  const stories = Math.max(1, Math.round(seed.stories ?? 4));

  // Stage 1 — lot zones (subtle ground fills; greenspace type is exempt from
  // the overlap gate by design, exactly right for zone underlays).
  const zones: Array<[string, Polygon | null | undefined, string]> = [
    ['seed-zone-front', seed.skeleton?.front_zone_2274 as Polygon | undefined, '#E8EEF5'],
    ['seed-zone-rear', seed.skeleton?.rear_zone_2274 as Polygon | undefined, '#EDF2EC'],
  ];
  for (const [id, geom, color] of zones) {
    if (!geom) continue;
    elements.push({
      id,
      type: 'greenspace',
      name: id === 'seed-zone-front' ? 'Front zone (building-priority)' : 'Rear zone (parking-priority)',
      geometry: to3857(geom),
      // Subtle ground tints, not landscape green — the zone is vocabulary,
      // not a lawn (styleOverride opts out of the type's default fill).
      properties: { color, opacity: 0.35, styleOverride: true, zone: true },
      metadata: meta,
    } as Element);
  }

  // Stage 2 — spine + entry apron
  const spine = seed.skeleton?.spine_2274 as LineString | undefined;
  if (spine) {
    const rect = lineToRect(to3857(spine), 7.3); // 24 ft drive
    if (rect) {
      elements.push({
        id: 'seed-spine',
        type: 'circulation',
        name: 'Spine drive',
        geometry: rect,
        properties: { color: '#D8DEE6' },
        metadata: meta,
      } as Element);
    }
  }
  const entry = seed.skeleton?.entry_2274 as Point | undefined;
  if (entry) {
    const [ex, ey] = (to3857(entry).coordinates as Position);
    const w = 3.7, d = 3.0; // 12×10 ft apron marker at the curb
    elements.push({
      id: 'seed-entry',
      type: 'circulation',
      name: 'Entry',
      geometry: {
        type: 'Polygon',
        coordinates: [[[ex - w, ey - d], [ex + w, ey - d], [ex + w, ey + d], [ex - w, ey + d], [ex - w, ey - d]]],
      },
      properties: { color: '#CBD5E1', entry: true },
      metadata: meta,
    } as Element);
  }

  // Stage 3 — parking bays, stalls apportioned by area share
  const bays = seed.parking_seed?.bays ?? [];
  const totalBayArea = bays.reduce((a, b) => a + (b.area_sqft ?? 0), 0);
  const stallsTotal = seed.parking_seed?.stalls_achieved_est ?? 0;
  bays.forEach((b, i) => {
    const share = totalBayArea > 0 ? (b.area_sqft ?? 0) / totalBayArea : 1 / Math.max(1, bays.length);
    const stalls = Math.max(0, Math.round(stallsTotal * share));
    elements.push({
      id: `seed-bay-${b.row ?? i + 1}`,
      type: 'parking',
      name: stalls ? `Bay row ${b.row ?? i + 1} · ~${stalls} stalls` : `Bay row ${b.row ?? i + 1}`,
      geometry: to3857(b.geom_2274 as Polygon),
      properties: { stalls, parkingSpaces: stalls, color: '#CBD5E1' },
      metadata: meta,
    } as Element);
  });

  // Stage 4 — one building outline per STRUCTURE. v2 seeds emit native
  // single polygons ("zero union calls; gate on structures[]" — engine
  // note); the leg-union + corner-weld below survives only as the fallback
  // for pre-v2 seeds.
  const structures = (seed.structures ?? []).filter(st => st?.geom_2274);
  if (structures.length > 0) {
    const leg1 = seed.seed?.leg1;
    const wing = seed.seed?.wing;
    structures.forEach((st, i) => {
      const footprintSqft = st.footprint_sqft
        ?? [leg1, wing].reduce((a, l) => a + (l ? l.length_ft * l.depth_ft : 0), 0);
      const gsf = footprintSqft * stories;
      const units = Math.max(1, Math.round(gsf / AVG_UNIT_SF));
      const retention = st.envelope_retention_pct;
      elements.push({
        id: `seed-structure-${st.structure_id ?? i + 1}`,
        type: 'building',
        name: structures.length === 1
          ? `${(seed.composition ?? 'seed mass').replace(/_/g, ' ')} × ${stories} st`
          : `Structure ${st.structure_id ?? i + 1} × ${stories} st`,
        geometry: to3857(st.geom_2274 as Polygon),
        properties: {
          areaSqFt: Math.round(footprintSqft),
          floors: stories,
          stories,
          unitMix: generateUnitMixForCount(units),
          use: 'residential',
          color: '#3B82F6',
          seedRetention: retention != null ? { structure: retention } : undefined,
        },
        metadata: meta,
      } as Element);
    });
  } else {
  const legPolys2274: Polygon[] = [];
  for (const leg of [seed.seed?.leg1, seed.seed?.wing]) {
    if (leg?.geom_2274) legPolys2274.push(leg.geom_2274 as Polygon);
  }
  let outlines2274: Polygon[] = legPolys2274;
  if (legPolys2274.length > 1) {
    try {
      // The envelope clip can leave the wing touching leg1 at a single
      // VERTEX (point contact unions into two rings). Weld any
      // near-coincident vertex pairs with a 1-ft square so the L merges
      // into one outline — invisible at plan scale, decisive topologically.
      const bridges: Position[][][] = [];
      const ringA = legPolys2274[0].coordinates[0] as Position[];
      for (const other of legPolys2274.slice(1)) {
        const ringB = other.coordinates[0] as Position[];
        for (const [ax, ay] of ringA) {
          for (const [bx, by] of ringB) {
            if (Math.hypot(ax - bx, ay - by) < 1.5) {
              const cx = (ax + bx) / 2, cy = (ay + by) / 2, r = 0.6;
              bridges.push([[
                [cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r],
              ]]);
            }
          }
        }
      }
      const union = polyclip.union(
        [legPolys2274[0].coordinates] as never,
        ...legPolys2274.slice(1).map(pl => [pl.coordinates] as never),
        ...bridges.map(b => [b] as never)
      ) as unknown as Position[][][];
      if (union.length >= 1) {
        outlines2274 = union.map(piece => ({ type: 'Polygon', coordinates: piece as never }));
      }
    } catch { /* keep the individual legs */ }
  }
  if (outlines2274.length) {
    // One outline is the design intent; disjoint pieces would be an engine
    // seed gap — render them all rather than silently dropping mass.
    const outline: Polygon = to3857(outlines2274[0]);
    const extraPieces = outlines2274.slice(1).map(to3857);
    const leg1 = seed.seed?.leg1;
    const wing = seed.seed?.wing;
    const footprintSqft = [leg1, wing].reduce(
      (a, l) => a + (l ? l.length_ft * l.depth_ft : 0), 0
    );
    const gsf = footprintSqft * stories;
    const units = Math.max(1, Math.round(gsf / AVG_UNIT_SF));
    elements.push({
      id: 'seed-building-L',
      type: 'building',
      name: `Single L · ${leg1?.length_ft ?? 0}+${wing?.length_ft ?? 0} ft × ${stories} st`,
      geometry: outline,
      properties: {
        areaSqFt: Math.round(footprintSqft),
        floors: stories,
        stories,
        unitMix: generateUnitMixForCount(units),
        use: 'residential',
        color: '#3B82F6',
        seedRetention: {
          leg1: leg1?.envelope_retention_pct ?? null,
          wing: wing?.envelope_retention_pct ?? null,
        },
      },
      metadata: meta,
    } as Element);
    extraPieces.forEach((piece, i) => {
      elements.push({
        id: `seed-building-piece-${i + 2}`,
        type: 'building',
        name: `Seed mass ${i + 2}`,
        geometry: piece,
        properties: { floors: stories, stories, use: 'residential', color: '#3B82F6' },
        metadata: meta,
      } as Element);
    });
  }
  }

  // Fire lanes render as first-class geometry when the solver emits them.
  (seed.fire_lanes ?? []).forEach((fl, i) => {
    if (!fl?.geom_2274) return;
    elements.push({
      id: `seed-firelane-${i + 1}`,
      type: 'circulation',
      name: 'Fire lane',
      geometry: to3857(fl.geom_2274 as Polygon),
      properties: { color: '#F1D6D6', styleOverride: true, opacity: 0.55, strokeColor: '#D9A0A0', fireLane: true },
      metadata: meta,
    } as Element);
  });

  // Napkin: the engine's own basis + the in-family vocabulary when clipped.
  const retentions = structures.length > 0
    ? structures
        .filter(st => st.envelope_retention_pct != null)
        .map((st, i) => ({ pct: st.envelope_retention_pct as number, name: `structure ${st.structure_id ?? i + 1}` }))
    : [seed.seed?.leg1, seed.seed?.wing]
        .filter((l): l is SeedLeg => !!l)
        .map(l => ({ pct: l.envelope_retention_pct, name: l === seed.seed?.leg1 ? 'leg' : 'wing' }));
  const clipped = retentions.filter(r => r.pct < 90);
  const inFamily = clipped.length
    ? clipped.map(r => `${r.name} −${Math.round((100 - r.pct) * 10) / 10}%`).join(', ')
    : null;
  const stallsLine = seed.parking_seed
    ? ` · parking seed ${seed.parking_seed.stalls_achieved_est ?? '?'}/${seed.parking_seed.stalls_target ?? '?'} stalls`
    : '';
  const basis = `Seed plan (Stage 1+2): ${seed.composition?.replace(/_/g, ' ') ?? 'placed composition'} · ` +
    `${stories} st ${seed.construction_type?.type ?? ''}`.trim() + stallsLine;

  return { elements, basis, inFamily };
}
