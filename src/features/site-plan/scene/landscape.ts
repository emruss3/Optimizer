// Planting for the drawing: illustration, never counted and never scheduled.
// The plan and the model draw the same trees because both read them here.
//
//  - street trees in the planting strip along a plan's own streets
//  - one or two yard trees on each lot, clear of the house and the driveway
//  - on a site with no lots, trees along the property line
//
// Nothing is planted on pavement, on a building, or outside the parcel.
import { pointInPolygon, ringArea, type Pt } from './frame';
import type { SceneFeature, ScenePolygons } from './types';

export interface SceneTree {
  at: Pt;
  /** Canopy radius, feet. */
  radiusFt: number;
  kind: 'street' | 'yard' | 'edge';
}

export const MAX_TREES = 420;

/** A small deterministic generator: the same plan grows the same trees. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const distToRing = (p: Pt, ring: Pt[]): number => {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
};

/** Points every `step` feet along a ring, `offset` feet to its outside (negative: inside). */
function alongRing(ring: Pt[], step: number, offset: number): Pt[] {
  const out: Pt[] = [];
  const side = ringArea(ring) > 0 ? 1 : -1;
  let carry = step / 2;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;
    const nx = ty * side, ny = -tx * side;
    let s = carry;
    for (; s <= len; s += step) out.push([a[0] + tx * s + nx * offset, a[1] + ty * s + ny * offset]);
    carry = s - len;
  }
  return out;
}

export function plantTrees(features: SceneFeature[], parcel: ScenePolygons | null): SceneTree[] {
  const hard = features.filter(f => f.role === 'building' || f.role === 'parking' || f.role === 'drive' || f.role === 'street');
  const onHard = (p: Pt, clear: number) =>
    hard.some(f => f.polygons.some(poly => pointInPolygon(p[0], p[1], poly) || (clear > 0 && poly.some(r => distToRing(p, r) < clear))));
  const inParcel = (p: Pt) => !parcel || parcel.some(poly => pointInPolygon(p[0], p[1], poly));
  const trees: SceneTree[] = [];
  const apart = (p: Pt, d: number) => !trees.some(t => Math.hypot(t.at[0] - p[0], t.at[1] - p[1]) < d);
  const add = (p: Pt, radiusFt: number, kind: SceneTree['kind']) => { if (trees.length < MAX_TREES) trees.push({ at: p, radiusFt, kind }); };

  // street trees: in the strip between the curb and the walk, both sides
  for (const f of features) {
    if (f.styleRole !== 'street') continue;
    const rnd = seeded(hash(f.id));
    for (const poly of f.polygons) {
      const outer = poly[0];
      if (!outer) continue;
      for (const p of alongRing(outer, 42, 4)) {
        if (!inParcel(p) || onHard(p, 2.5) || !apart(p, 24)) continue;
        add(p, 9 + rnd() * 3, 'street');
      }
    }
  }

  const lots = features.filter(f => f.role === 'lot');
  if (lots.length) {
    // yard trees: up to two a lot, away from the house and the pavement
    for (const lot of lots) {
      const ring = lot.polygons[0]?.[0];
      if (!ring) continue;
      const rnd = seeded(hash(lot.id));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of ring) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      const want = 1 + (rnd() < 0.6 ? 1 : 0);
      let placed = 0;
      for (let k = 0; k < 28 && placed < want; k++) {
        const p: Pt = [minX + rnd() * (maxX - minX), minY + rnd() * (maxY - minY)];
        if (!pointInPolygon(p[0], p[1], lot.polygons[0] ?? []) || distToRing(p, ring) < 9) continue;
        if (onHard(p, 11) || !apart(p, 22)) continue;
        add(p, 10 + rnd() * 5, 'yard');
        placed++;
      }
    }
  } else if (parcel) {
    // no lots: a planted edge inside the property line
    for (const poly of parcel) {
      const outer = poly[0];
      if (!outer) continue;
      const rnd = seeded(hash(`edge:${outer.length}:${Math.round(outer[0]?.[0] ?? 0)}`));
      for (const p of alongRing(outer, 36, -9)) {
        if (!inParcel(p) || onHard(p, 5) || !apart(p, 22)) continue;
        add(p, 9 + rnd() * 4, 'edge');
      }
    }
  }
  return trees;
}
