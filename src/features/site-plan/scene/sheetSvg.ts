// A-01 Site Plan as a vector sheet, drawn to go into a deck or to print.
// It is drawn from the scene and from nothing else: the tags, stories, areas
// and heights on it are the scene's own strings, so they are the ones the plan
// and the 3D inspector show.
//
// The page is in points (72 per inch) at its true size, so a numeric scale is
// exact when the sheet is printed at 100%. It is stated only when the scene's
// frame has been checked against an engine dimension, and never on the slide
// size, which is shown on a screen.
//
// What is illustration and what is not: building shadows and street trees are
// illustration. Parking stripes are drawn only when they can show exactly the
// stall count the plan reports for the bay. Every colour sits on an outline,
// so the sheet still reads in greyscale.
import type { DrawingScene, ScenePolygons } from './types';
import type { Pt } from './frame';
import { LABEL_PRIORITY, placeLabels, type LabelCandidate, type PlacedLabel } from './labels';

export type SheetSize = 'letter' | 'tabloid' | 'slide';

export const SHEET_SIZES: Record<SheetSize, { wIn: number; hIn: number; label: string; print: boolean }> = {
  letter: { wIn: 11, hIn: 8.5, label: 'Letter landscape, 11 × 8.5 in', print: true },
  tabloid: { wIn: 17, hIn: 11, label: 'Tabloid landscape, 17 × 11 in', print: true },
  slide: { wIn: 13.333, hIn: 7.5, label: 'Slide, 16:9', print: false },
};

/** Engineering scales, feet per inch. */
const SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000];

export interface SheetTitle {
  project: string;
  subtitle?: string | null | undefined;
  date: string;
  notes?: string[] | undefined;
  /** The site data table: figures of the scheme, as the workspace states them. */
  data?: Array<{ label: string; value: string }> | undefined;
}

/** A picture of the site from above (render3d/still) to lay the linework over. */
export interface SheetUnderlay {
  href: string;
  /** True when an image model painted it: the sheet then says so. */
  ai?: boolean | undefined;
}

export interface SheetLayout {
  widthPt: number;
  heightPt: number;
  /** The drawing area on the page, points. */
  draw: { x: number; y: number; w: number; h: number };
  strip: { x: number; y: number; w: number; h: number };
  ftPerInch: number;
  /** Points per foot. */
  k: number;
  /** The ground the drawing area shows, scene feet. */
  ground: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Where the drawing sits on the page and what ground it covers. */
export function sheetLayout(scene: DrawingScene, size: SheetSize): SheetLayout {
  const { wIn, hIn } = SHEET_SIZES[size];
  const W = r2(wIn * 72), H = r2(hIn * 72);
  const M = 0.3 * 72;
  const stripW = (size === 'tabloid' ? 3.7 : size === 'slide' ? 3.5 : 2.95) * 72;
  const draw = { x: M, y: M, w: W - 2 * M - stripW, h: H - 2 * M };
  const strip = { x: draw.x + draw.w, y: M, w: stripW, h: H - 2 * M };
  const pad = 0.45 * 72;
  const e = scene.extentFt;
  const spanX = Math.max(1, e.maxX - e.minX), spanY = Math.max(1, e.maxY - e.minY);
  const availIn = { w: (draw.w - 2 * pad) / 72, h: (draw.h - 2 * pad) / 72 };
  const ftPerInch = SCALES.find(sc => spanX / sc <= availIn.w && spanY / sc <= availIn.h) ?? 2000;
  const k = 72 / ftPerInch;
  const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
  return {
    widthPt: W, heightPt: H, draw, strip, ftPerInch, k,
    ground: { minX: cx - draw.w / 2 / k, maxX: cx + draw.w / 2 / k, minY: cy - draw.h / 2 / k, maxY: cy + draw.h / 2 / k },
  };
}

export interface SheetModel {
  size: SheetSize;
  widthPt: number;
  heightPt: number;
  /** Feet per inch at full size. */
  ftPerInch: number;
  /** `1" = 40'`, or null when the frame is not verified or the page is a slide. */
  numericScale: string | null;
  scaleBarFt: number;
  /** Rows of the building schedule, as printed. */
  schedule: Array<{ tag: string; id: string; use: string; floors: string; footprint: string; gross: string; height: string }>;
  /** The key figures printed large, as printed. */
  figures: Array<{ label: string; value: string }>;
  /** Parking features drawn with stripes, and the stalls the stripes show. */
  striped: Array<{ id: string; stalls: number }>;
  labels: PlacedLabel[];
  svg: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => Math.round(n).toLocaleString('en-US');

const INK = '#1f2328';
const C = {
  ground: '#f3f1ea',
  contextParcel: '#e2ded3',
  contextBuilding: '#e1ddd3',
  contextBuildingEdge: '#cdc8bb',
  road: '#ffffff',
  roadEdge: '#d8d3c6',
  lawn: '#dde8cc',
  open: '#c7dcae',
  openEdge: '#8fae72',
  walk: '#ece8dc',
  walkEdge: '#cfc9b9',
  driveway: '#dcd9d0',
  drive: '#c9c8c3',
  driveEdge: '#a09e97',
  parking: '#e4e3de',
  parkingEdge: '#8d8b84',
  stripe: '#ffffff',
  lot: '#6b6f66',
  street: '#d2d1cb',
  roof: '#ffffff',
  roofEdge: '#2a2e33',
  amenity: '#f0e2bd',
  house: '#f7f3ea',
  tree: '#a5c78a',
  treeEdge: '#6c9856',
  shadow: '#1c2430',
} as const;

/**
 * Stall stripes for a parking bay, or null. Only for a four-cornered bay whose
 * reported count divides into whole rows of stalls 8 to 10 ft wide: the
 * stripes then show exactly that count.
 */
export function stallStripes(input: Pt[], stalls: number | null): { lines: Array<[Pt, Pt]>; rows: number; stalls: Array<[Pt, Pt, Pt, Pt]> } | null {
  if (!stalls || stalls < 2) return null;
  // a point on a straight side is not a corner
  const open = input.slice(0, -1);
  const corners = open.filter((p, i) => {
    const a = open[(i + open.length - 1) % open.length], b = open[(i + 1) % open.length];
    if (!a || !b) return true;
    const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
    return Math.abs(cross) > 0.02 * Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]);
  });
  if (corners.length !== 4) return null;
  const [a, b, c, d] = corners as [Pt, Pt, Pt, Pt];
  const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  // walk the long sides: p0 to p1 and q0 to q1 are the two long edges
  const [p0, p1, q0, q1, long, deep] = l1 >= l2 ? [a, b, d, c, l1, l2] : [b, c, a, d, l2, l1];
  for (const rows of [1, 2]) {
    if (stalls % rows) continue;
    const perRow = stalls / rows;
    const width = long / perRow, depth = deep / rows;
    if (width < 7.8 || width > 10.5 || depth < 14 || depth > 24) continue;
    const lines: Array<[Pt, Pt]> = [];
    const mix = (u: Pt, v: Pt, t: number): Pt => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
    for (let i = 1; i < perRow; i++) lines.push([mix(p0, p1, i / perRow), mix(q0, q1, i / perRow)]);
    if (rows === 2) lines.push([mix(p0, q0, 0.5), mix(p1, q1, 0.5)]);
    // each stall as its four corners: two on a long side, two across the row
    const quads: Array<[Pt, Pt, Pt, Pt]> = [];
    for (let r = 0; r < rows; r++) {
      const u0 = mix(p0, q0, r / rows), u1 = mix(p1, q1, r / rows), v0 = mix(p0, q0, (r + 1) / rows), v1 = mix(p1, q1, (r + 1) / rows);
      for (let i = 0; i < perRow; i++) quads.push([mix(u0, u1, i / perRow), mix(u0, u1, (i + 1) / perRow), mix(v0, v1, (i + 1) / perRow), mix(v0, v1, i / perRow)]);
    }
    return { lines, rows, stalls: quads };
  }
  return null;
}

export function renderSitePlanSheet(scene: DrawingScene, title: SheetTitle, size: SheetSize = 'tabloid', underlay?: SheetUnderlay | null): SheetModel {
  const { wIn, hIn, print } = SHEET_SIZES[size];
  const { widthPt: W, heightPt: H, draw, strip, ftPerInch, k } = sheetLayout(scene, size);
  const M = 0.3 * 72;
  const e = scene.extentFt;
  const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
  // with a rendered picture underneath, the sheet draws linework and labels only
  const lined = !!underlay;
  const px = draw.x + draw.w / 2, py = draw.y + draw.h / 2;
  const P = (p: Pt): Pt => [r2(px + (p[0] - cx) * k), r2(py - (p[1] - cy) * k)];
  const ringPath = (ring: Pt[]) => 'M' + ring.map(p => P(p).join(' ')).join('L') + 'Z';
  const path = (polys: ScenePolygons) => polys.map(poly => poly.map(ringPath).join('')).join('');

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" data-sheet="A-01" data-size="${size}">`);
  out.push('<defs>');
  out.push(`<clipPath id="a01-clip"><rect x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}"/></clipPath>`);
  out.push('</defs>');
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  // the drawing
  out.push('<g clip-path="url(#a01-clip)">');
  const paintedFrom = out.length;
  out.push(`<rect x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}" fill="${C.ground}"/>`);
  if (scene.context.parcels.length) out.push(`<path d="${path(scene.context.parcels)}" fill="none" stroke="${C.contextParcel}" stroke-width="0.5" data-role="context-parcel"/>`);
  // the block's streets: a walk, a planted strip and the roadway, as three
  // strokes on the centre line. Illustration: the record gives the line only.
  const roadW = Math.max(3, 24 * k);
  const roadLine = (road: { path: Pt[] }, color: string, w: number, role?: string) =>
    `<polyline points="${road.path.map(p => P(p).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round"${role ? ` data-role="${role}"` : ''}/>`;
  for (const road of scene.context.roads) out.push(roadLine(road, C.walkEdge, roadW + 22 * k + 0.8));
  for (const road of scene.context.roads) out.push(roadLine(road, C.walk, roadW + 22 * k, 'context-walk'));
  for (const road of scene.context.roads) out.push(roadLine(road, '#e3e6d6', roadW + 11 * k));
  for (const road of scene.context.roads) out.push(roadLine(road, C.roadEdge, roadW + 1.2));
  for (const road of scene.context.roads) out.push(roadLine(road, C.road, roadW, 'context-street'));
  for (const b of scene.context.buildings) out.push(`<path d="${path(b.polygons)}" fill="${C.contextBuilding}" stroke="${C.contextBuildingEdge}" stroke-width="0.4" fill-rule="evenodd" data-role="context-building"/>`);
  if (scene.parcel) out.push(`<path d="${path(scene.parcel.polygons)}" fill="${C.lawn}" fill-rule="evenodd" stroke="none" data-role="site"/>`);

  const STYLE = {
    'open-space': `fill="${C.open}" stroke="${C.openEdge}" stroke-width="0.5"`,
    lot: `fill="none" stroke="${C.lot}" stroke-width="0.7"`,
    street: `fill="${C.street}" stroke="${C.driveEdge}" stroke-width="0.5"`,
    drive: `fill="${C.drive}" stroke="${C.driveEdge}" stroke-width="0.4"`,
    driveway: `fill="${C.driveway}" stroke="${C.parkingEdge}" stroke-width="0.35"`,
    parking: `fill="${C.parking}" stroke="${C.parkingEdge}" stroke-width="0.5"`,
    other: `fill="none" stroke="${C.lot}" stroke-width="0.4"`,
    house: `fill="${C.house}" stroke="${C.roofEdge}" stroke-width="0.7"`,
    amenity: `fill="${C.amenity}" stroke="${C.roofEdge}" stroke-width="0.9"`,
    building: `fill="${C.roof}" stroke="${C.roofEdge}" stroke-width="1.3"`,
  } as const;
  const FLAT = ['open-space', 'lot', 'street', 'drive', 'driveway', 'parking', 'other'] as const;
  const striped: SheetModel['striped'] = [];
  // walks: along the plan's own streets (a planted strip, then the walk) and
  // round each tagged building, drawn as strokes under what they follow
  const walk = (polys: ScenePolygons, widthFt: number, color: string, role?: string) =>
    `<path d="${path(polys)}" fill="none" stroke="${color}" stroke-width="${r2(Math.max(0.8, widthFt * 2 * k))}" stroke-linejoin="round"${role ? ` data-role="${role}" data-illustration="true"` : ''}/>`;
  const streets = scene.features.filter(f => f.styleRole === 'street');
  const walked = scene.buildings.filter(b => b.tagOnPlan);
  let walks = 0;
  for (const f of streets) { out.push(walk(f.polygons, 11.6, C.walkEdge)); walks++; }
  for (const f of streets) out.push(walk(f.polygons, 11, C.walk, 'walk'));
  for (const f of streets) out.push(walk(f.polygons, 5.5, C.lawn));
  for (const b of walked) { out.push(walk(b.polygons, 6.6, C.walkEdge)); walks++; }
  for (const b of walked) out.push(walk(b.polygons, 6, C.walk, 'walk'));
  for (const role of FLAT) {
    for (const f of scene.features) {
      if (f.styleRole !== role) continue;
      out.push(`<path d="${path(f.polygons)}" ${STYLE[role]} fill-rule="evenodd" data-role="${role}" data-feature-id="${esc(f.id)}"/>`);
      if (role !== 'parking') continue;
      const ring = f.polygons.length === 1 ? f.polygons[0]?.[0] : undefined;
      const stripes = ring ? stallStripes(ring, f.stalls) : null;
      if (!stripes || f.stalls == null) continue;
      striped.push({ id: f.id, stalls: f.stalls });
      out.push(`<path d="${stripes.lines.map(([u, v]) => `M${P(u).join(' ')}L${P(v).join(' ')}`).join('')}" fill="none" stroke="${C.stripe}" stroke-width="${r2(Math.max(0.35, 0.5 * k))}" data-role="stall-stripes" data-for="${esc(f.id)}"/>`);
    }
  }

  // shadows: illustration. Each building's footprint swept down and to the
  // right by a length that grows with its height, drawn once under one opacity.
  const shadow: string[] = [];
  for (const b of scene.buildings) {
    const d = Math.min(60, b.height.aboveGradeFt * 0.55);
    for (const poly of b.polygons) {
      const outer = poly[0];
      if (!outer) continue;
      const moved = outer.map((p): Pt => [p[0] + d, p[1] - d]);
      shadow.push(ringPath(moved));
      for (let i = 0; i < outer.length - 1; i++) {
        const u = outer[i], v = outer[i + 1], u2 = moved[i], v2 = moved[i + 1];
        if (u && v && u2 && v2) shadow.push(ringPath([u, v, v2, u2]));
      }
    }
  }
  const trees = scene.landscape.trees;
  const rOf = (t: { radiusFt: number }) => Math.max(1.8, t.radiusFt * k);
  for (const t of trees) {
    const [x, y] = P(t.at);
    const treeR = rOf(t);
    shadow.push(`M${r2(x + treeR * 0.35 - treeR)} ${r2(y + treeR * 0.35)}a${r2(treeR)} ${r2(treeR)} 0 1 0 ${r2(treeR * 2)} 0a${r2(treeR)} ${r2(treeR)} 0 1 0 ${r2(-treeR * 2)} 0Z`);
  }
  // one path a piece: pieces wound opposite ways would cancel inside one path,
  // and the group's single opacity keeps overlaps from darkening twice
  if (shadow.length) out.push(`<g opacity="0.2" fill="${C.shadow}" data-role="shadows" data-illustration="true">${shadow.map(d => `<path d="${d}"/>`).join('')}</g>`);

  for (const role of ['house', 'amenity', 'building'] as const) {
    for (const f of scene.features) {
      if (f.styleRole !== role) continue;
      out.push(`<path d="${path(f.polygons)}" ${STYLE[role]} fill-rule="evenodd" data-role="${role}" data-feature-id="${esc(f.id)}"/>`);
    }
  }
  if (trees.length) {
    out.push('<g data-role="trees" data-illustration="true">');
    const TONES = ['#a5c78a', '#98bd80', '#b0cf95', '#8fb678'];
    trees.forEach((t, i) => {
      const [x, y] = P(t.at);
      const treeR = rOf(t);
      out.push(`<circle cx="${x}" cy="${y}" r="${r2(treeR)}" fill="${TONES[i % TONES.length]}" fill-opacity="0.88" stroke="${C.treeEdge}" stroke-width="0.45"/><circle cx="${r2(x - treeR * 0.22)}" cy="${r2(y - treeR * 0.22)}" r="${r2(treeR * 0.5)}" fill="#ffffff" fill-opacity="0.2"/><circle cx="${x}" cy="${y}" r="${r2(Math.max(0.5, treeR * 0.09))}" fill="${C.treeEdge}"/>`);
    });
    out.push('</g>');
  }
  if (lined && underlay) {
    // the picture carries the ground, the buildings, the planting and the
    // shadows; what was painted above gives way to it, and the plan's own
    // shapes stay as linework over it, each with its id
    out.length = paintedFrom;
    out.push(`<image href="${esc(underlay.href)}" x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}" preserveAspectRatio="none" data-role="underlay"/>`);
    const LINE: Partial<Record<string, string>> = {
      lot: 'stroke="#ffffff" stroke-opacity="0.85" stroke-width="0.8"',
      building: `stroke="${INK}" stroke-width="1.1"`,
      amenity: `stroke="${INK}" stroke-width="0.8"`,
      house: `stroke="${INK}" stroke-opacity="0.45" stroke-width="0.4"`,
    };
    for (const f of scene.features) {
      out.push(`<path d="${path(f.polygons)}" fill="none" ${LINE[f.styleRole] ?? 'stroke="none"'} fill-rule="evenodd" data-role="${f.styleRole}" data-feature-id="${esc(f.id)}"/>`);
    }
    if (scene.parcel) {
      // the surroundings step back a little, so the site is what the eye lands on
      out.push(`<path d="M${draw.x} ${draw.y}h${draw.w}v${draw.h}h${-draw.w}Z${path(scene.parcel.polygons)}" fill="#ffffff" fill-opacity="0.3" fill-rule="evenodd" data-role="surroundings"/>`);
      out.push(`<path d="${path(scene.parcel.polygons)}" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="3.2"/>`);
    }
  }
  if (scene.envelope) out.push(`<path d="${path(scene.envelope.polygons)}" fill="none" stroke="${lined ? '#ffffff' : '#5b6168'}" stroke-width="${lined ? 0.8 : 0.6}" stroke-dasharray="4 3" data-role="envelope"/>`);
  if (scene.parcel) out.push(`<path d="${path(scene.parcel.polygons)}" fill="none" fill-rule="evenodd" stroke="${INK}" stroke-width="1.6" stroke-dasharray="16 3 3 3 3 3" data-role="parcel"/>`);

  // labels, by priority
  const cands: LabelCandidate[] = [];
  const text = new Map<string, { lines: string[]; kind: string; size: number; angle?: number }>();
  const tagR = size === 'letter' ? 8 : 9.5;
  const captions = scene.buildings.filter(b => b.tagOnPlan).length;
  for (const b of scene.buildings) {
    if (!b.tagOnPlan) continue;
    const [x, y] = P(b.labelPoint);
    cands.push({ id: `tag:${b.id}`, priority: LABEL_PRIORITY.buildingTag, x, y, w: tagR * 2, h: tagR * 2, required: true });
    // with more than two tagged buildings the schedule carries the detail and
    // the plan keeps its tags clear
    if (captions > 2) continue;
    const lines = b.display.planLines;
    const w = Math.max(...lines.map(l => l.length)) * 7 * 0.5 + 8, h = lines.length * 9 + 5;
    cands.push({
      id: `cap:${b.id}`, priority: LABEL_PRIORITY.buildingCaption, x, y: y + tagR + h / 2 + 3, w, h,
      alternates: [[x, y - tagR - h / 2 - 3], [x + tagR + w / 2 + 4, y], [x - tagR - w / 2 - 4, y]],
    });
    text.set(`cap:${b.id}`, { lines, kind: 'caption', size: 7 });
  }
  for (const f of scene.features) {
    if (f.role !== 'parking' || f.stalls == null || f.stalls <= 0) continue;
    const c = centre(f.polygons);
    if (!c) continue;
    const [x, y] = P(c);
    const s = `${f.stalls} stalls`;
    cands.push({ id: `park:${f.id}`, priority: LABEL_PRIORITY.parkingCount, x, y, w: s.length * 3.4 + 8, h: 11 });
    text.set(`park:${f.id}`, { lines: [s], kind: 'parking', size: 6.5 });
  }
  // lot numbers: a plan of lots is read by them
  for (const f of scene.features) {
    const m = f.role === 'lot' ? /^Lot (\d+)$/.exec(f.name) : null;
    const c = m ? centre(f.polygons) : null;
    if (!m || !c) continue;
    const [x, y] = P(c);
    const s = m[1] ?? '';
    cands.push({ id: `lot:${f.id}`, priority: LABEL_PRIORITY.dimension, x, y, w: s.length * 3.6 + 3, h: 7.5 });
    text.set(`lot:${f.id}`, { lines: [s], kind: 'lot', size: 6 });
  }
  const seenRoad = new Set<string>();
  for (const road of scene.context.roads) {
    if (!road.name || seenRoad.has(road.name) || road.path.length < 2) continue;
    // the longest piece of the road that is on the sheet carries its name
    let best: { mid: Pt; angle: number; len: number } | null = null;
    for (let i = 0; i < road.path.length - 1; i++) {
      const u = road.path[i], v = road.path[i + 1];
      if (!u || !v) continue;
      const a = P(u), b = P(v);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mid[0] < draw.x + 20 || mid[0] > draw.x + draw.w - 20 || mid[1] < draw.y + 12 || mid[1] > draw.y + draw.h - 12) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!best || len > best.len) best = { mid, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, len };
    }
    if (!best) continue;
    seenRoad.add(road.name);
    const s = road.name.toUpperCase();
    const angle = best.angle > 90 ? best.angle - 180 : best.angle < -90 ? best.angle + 180 : best.angle;
    const tw = s.length * 4.1 + 6, rad = (Math.abs(angle) * Math.PI) / 180;
    cands.push({ id: `road:${road.name}`, priority: LABEL_PRIORITY.streetName, x: best.mid[0], y: best.mid[1], w: tw * Math.cos(rad) + 9 * Math.sin(rad), h: tw * Math.sin(rad) + 9 * Math.cos(rad) });
    text.set(`road:${road.name}`, { lines: [s], kind: 'street', size: 6.2, angle });
  }
  const labels = placeLabels(cands, { gap: 1.5, bounds: { minX: draw.x + 2, minY: draw.y + 2, maxX: draw.x + draw.w - 2, maxY: draw.y + draw.h - 2 } });
  for (const l of labels) {
    if (!l.placed) continue;
    if (l.id.startsWith('tag:')) {
      const b = scene.buildings.find(q => `tag:${q.id}` === l.id);
      if (!b) continue;
      out.push(`<g data-label="building-tag" data-feature-id="${esc(b.id)}"><circle cx="${l.x}" cy="${l.y}" r="${tagR}" fill="${INK}"/><text x="${l.x}" y="${r2(l.y + (b.tag.length > 1 ? 2.8 : 3.6))}" font-size="${b.tag.length > 1 ? 7.5 : 10.5}" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(b.tag)}</text></g>`);
      continue;
    }
    const t = text.get(l.id);
    if (!t) continue;
    if (t.kind === 'street') {
      // over a picture the name is white with a dark edge; on the drawn plan, a quiet grey
      const ink = lined ? 'fill="#ffffff" stroke="#1f2328" stroke-opacity="0.55" stroke-width="1.6" paint-order="stroke"' : 'fill="#8a8578"';
      out.push(`<g data-label="street"><text x="${l.x}" y="${r2(l.y + 2.2)}" transform="rotate(${r2(t.angle ?? 0)} ${l.x} ${l.y})" font-size="${lined ? t.size + 0.8 : t.size}" font-weight="600" letter-spacing="0.8" text-anchor="middle" ${ink}>${esc(t.lines[0] ?? '')}</text></g>`);
      continue;
    }
    if (t.kind === 'lot') {
      const ink = lined ? 'fill="#ffffff" stroke="#1f2328" stroke-opacity="0.6" stroke-width="1.5" paint-order="stroke"' : `fill="${INK}"`;
      out.push(`<text x="${l.x}" y="${r2(l.y + 2.1)}" font-size="${t.size}" font-weight="700" text-anchor="middle" ${ink} data-label="lot">${esc(t.lines[0] ?? '')}</text>`);
      continue;
    }
    out.push(`<g data-label="${t.kind}"><rect x="${r2(l.x - l.w / 2)}" y="${r2(l.y - l.h / 2)}" width="${r2(l.w)}" height="${r2(l.h)}" rx="2.5" fill="#ffffff" fill-opacity="0.94"/>`);
    t.lines.forEach((line, i) => {
      const ty = l.y - ((t.lines.length - 1) * 9) / 2 + i * 9 + t.size * 0.35;
      out.push(`<text x="${l.x}" y="${r2(ty)}" font-size="${t.size}" font-weight="${i === 0 && t.kind === 'caption' ? 700 : 500}" text-anchor="middle" fill="${i === 0 ? INK : '#4b5158'}">${esc(line)}</text>`);
    });
    out.push('</g>');
  }
  out.push('</g>');

  // frame
  out.push(`<rect x="${M}" y="${M}" width="${r2(W - 2 * M)}" height="${r2(H - 2 * M)}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  out.push(`<rect x="${strip.x}" y="${strip.y}" width="${strip.w}" height="${strip.h}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`);

  // title strip
  const tx = strip.x + 14, tw = strip.w - 28;
  let y = strip.y + 28;
  const line = (s: string, sz: number, weight = 400, fill: string = INK, gap = 3) => {
    for (const part of wrap(s, Math.floor(tw / (sz * 0.52)))) {
      out.push(`<text x="${tx}" y="${r2(y)}" font-size="${sz}" font-weight="${weight}" fill="${fill}">${esc(part)}</text>`);
      y += sz + gap;
    }
  };
  const rule = (before = 6, after = 14) => {
    y += before;
    out.push(`<line x1="${tx}" y1="${r2(y)}" x2="${tx + tw}" y2="${r2(y)}" stroke="#d5d7da" stroke-width="0.6"/>`);
    y += after;
  };
  const eyebrow = (s: string) => {
    out.push(`<text x="${tx}" y="${r2(y)}" font-size="6.2" font-weight="700" letter-spacing="1.1" fill="#7a8087">${esc(s)}</text>`);
    y += 12;
  };
  out.push(`<text x="${tx}" y="${r2(y - 8)}" font-size="6.2" font-weight="700" letter-spacing="1.1" fill="#7a8087">CONCEPT SITE PLAN</text>`);
  y += 8;
  line(title.project, 15, 700, INK, 3);
  if (title.subtitle) { y += 1; line(title.subtitle, 8, 500, '#4b5158'); }
  rule(4, 20);

  // key figures, from the scheme's schedule and the scene's buildings
  const tagged = scene.buildings.filter(b => b.tagOnPlan && b.use !== 'amenity');
  const small = scene.buildings.filter(b => !b.tagOnPlan);
  const lots = scene.features.filter(f => f.role === 'lot').length;
  const figures: SheetModel['figures'] = [];
  if (scene.schedule.units != null && scene.schedule.units > 0) figures.push({ label: lots > 0 && !tagged.length ? 'LOTS' : 'HOMES', value: num(scene.schedule.units) });
  if (tagged.length) figures.push({ label: tagged.length === 1 ? 'BUILDING' : 'BUILDINGS', value: num(tagged.length) });
  const stories = tagged.length ? Math.max(...tagged.map(b => b.floors.value)) : small.length ? Math.max(...small.map(b => b.floors.value)) : null;
  if (stories != null) figures.push({ label: stories === 1 ? 'STORY' : 'STORIES', value: num(stories) });
  if (scene.schedule.stalls != null && scene.schedule.stalls > 0) figures.push({ label: 'PARKING STALLS', value: num(scene.schedule.stalls) });
  if (tagged.length && tagged.every(b => b.grossSqFt)) figures.push({ label: 'GROSS SF', value: num(tagged.reduce((s, b) => s + (b.grossSqFt?.value ?? 0), 0)) });
  const shown = figures.slice(0, 4);
  shown.forEach((f, i) => {
    const fx = tx + (i % 2) * (tw / 2), fy = y + Math.floor(i / 2) * 40;
    out.push(`<g data-figure="${esc(f.label)}"><text x="${r2(fx)}" y="${r2(fy)}" font-size="${f.value.length > 6 ? 17 : 22}" font-weight="700" fill="${INK}">${esc(f.value)}</text><text x="${r2(fx)}" y="${r2(fy + 11)}" font-size="6" font-weight="600" letter-spacing="0.9" fill="#7a8087">${esc(f.label)}</text></g>`);
  });
  if (shown.length) y += Math.ceil(shown.length / 2) * 40 - 16;
  if (!scene.schedule.consistent) { y += 8; line('The drawn features do not add up to the scheme schedule.', 6.2, 500, '#8a4b12'); }
  rule(8, 16);

  const onSheet = scene.buildings.filter(b => b.tagOnPlan);
  eyebrow(onSheet.length || !small.length ? 'BUILDINGS' : 'HOMES');
  const colAt = [0, 0.11, 0.42, 0.56, 0.78];
  const col = (i: number) => r2(tx + (colAt[i] ?? 0) * tw);
  if (onSheet.length) {
    ['', 'Use', 'Stories', 'Footprint', 'Height'].forEach((h, i) => out.push(`<text x="${col(i)}" y="${r2(y)}" font-size="5.8" fill="#7a8087">${esc(h)}</text>`));
    y += 10;
  }
  const schedule: SheetModel['schedule'] = [];
  const maxRows = size === 'tabloid' ? 12 : 7;
  let estimated = false;
  onSheet.forEach((b, i) => {
    const d = b.display;
    schedule.push({ tag: b.tag, id: b.id, use: d.use, floors: d.floors, footprint: d.footprint, gross: d.gross, height: `${d.heightLabel} ${d.height}` });
    if (b.height.basis === 'estimated') estimated = true;
    if (i >= maxRows) return;
    const cells = [b.tag, d.use, String(b.floors.value), d.footprint, d.heightShort];
    out.push(`<g data-schedule-row="${esc(b.id)}">` + cells.map((c, j) => `<text x="${col(j)}" y="${r2(y)}" font-size="6.8" font-weight="${j === 0 ? 700 : 400}" fill="${INK}">${esc(c)}</text>`).join('') + '</g>');
    y += 10;
  });
  if (onSheet.length > maxRows) line(`and ${onSheet.length - maxRows} more`, 6.2, 400, '#7a8087');
  if (small.length) {
    if (small.some(b => b.height.basis === 'estimated')) estimated = true;
    const kinds = new Map<string, number>();
    for (const b of small) kinds.set(b.display.use, (kinds.get(b.display.use) ?? 0) + 1);
    line([...kinds].map(([u, n]) => `${n} ${u.toLowerCase()}${n === 1 ? '' : 's'}`).join(' · '), 6.8, 400, INK);
  }
  if (!scene.buildings.length) line('No building on this sheet.', 6.8, 400, '#7a8087');
  if (estimated) { y += 2; line('Heights are estimated from story counts and are above grade. The plan carries no measured height.', 5.8, 400, '#7a8087', 2.5); }
  rule(6, 14);

  // legend: only what is on the sheet
  eyebrow('LEGEND');
  const present = new Set<string>(scene.features.map(f => f.styleRole));
  const LEGEND: Array<[string, string, string]> = [
    ['parcel', 'Property line', `fill="none" stroke="${INK}" stroke-width="1.3" stroke-dasharray="8 2 2 2 2 2"`],
    ['envelope', 'Setback line', 'fill="none" stroke="#5b6168" stroke-width="0.6" stroke-dasharray="4 3"'],
    ['building', 'Building', STYLE.building],
    ['amenity', 'Amenity', STYLE.amenity],
    ['house', 'House or townhome', STYLE.house],
    ['parking', 'Parking', STYLE.parking],
    ['drive', 'Drive', STYLE.drive],
    ['driveway', 'Driveway', STYLE.driveway],
    ['walk', 'Walk', `fill="${C.walk}" stroke="${C.walkEdge}" stroke-width="0.5"`],
    ['street', 'Street', STYLE.street],
    ['lot', 'Lot line', STYLE.lot],
    ['open-space', 'Open space', STYLE['open-space']],
    ['context', 'Existing building', `fill="${C.contextBuilding}" stroke="${C.contextBuildingEdge}" stroke-width="0.4"`],
  ];
  const items = LEGEND.filter(([key]) => (key === 'parcel' ? !!scene.parcel : key === 'envelope' ? !!scene.envelope : key === 'context' ? scene.context.buildings.length > 0 : key === 'walk' ? walks > 0 : present.has(key)));
  items.forEach(([key, label, style], i) => {
    const lx = tx + (i % 2) * (tw / 2), ly = y + Math.floor(i / 2) * 12;
    if (key === 'parcel' || key === 'envelope' || key === 'lot') out.push(`<line x1="${r2(lx)}" y1="${r2(ly - 2.5)}" x2="${r2(lx + 16)}" y2="${r2(ly - 2.5)}" ${style}/>`);
    else out.push(`<rect x="${r2(lx)}" y="${r2(ly - 6.5)}" width="16" height="8" ${style}/>`);
    out.push(`<text x="${r2(lx + 21)}" y="${r2(ly)}" font-size="6.5" fill="${INK}" data-legend="${key}">${esc(label)}</text>`);
  });
  y += Math.ceil(items.length / 2) * 12;

  // the site data table, where the workspace supplied one
  if (title.data?.length) {
    rule(4, 14);
    eyebrow('SITE DATA');
    for (const row of title.data) {
      // the table stops short of the scale and the north arrow
      if (y > strip.y + strip.h - 118 - 10) break;
      out.push(`<g data-site-data="${esc(row.label)}"><text x="${tx}" y="${r2(y)}" font-size="6.6" fill="#4b5158">${esc(row.label)}</text><text x="${tx + tw}" y="${r2(y)}" font-size="6.6" font-weight="600" text-anchor="end" fill="${INK}">${esc(row.value)}</text></g>`);
      y += 9.6;
    }
  }

  // bottom block: north, scale, sheet number
  const by = strip.y + strip.h;
  const blockTop = by - 118;
  // notes take the room that is left above the bottom block
  if ((title.notes?.length || trees.length || shadow.length) && y < blockTop - 30) {
    rule(2, 12);
    const notes = [...(title.notes ?? [])];
    if (trees.length || shadow.length || walks) notes.push(lined ? 'Rendered from the plan. Facades, walks, planting, cars and shadows are illustration.' : 'Walks, trees and shadows are illustration.');
    for (const n of notes) {
      if (y > blockTop - 14) break;
      line(n, 5.8, 400, '#7a8087', 2.5);
    }
  }
  const verified = scene.frameCheck.status === 'verified';
  const numericScale = verified && print ? `1" = ${ftPerInch}'` : null;
  const barFt = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 2000, 4000].find(f => f * k >= 1.1 * 72) ?? ftPerInch * 2;
  const barPt = barFt * k;
  out.push(`<line x1="${tx}" y1="${r2(blockTop)}" x2="${tx + tw}" y2="${r2(blockTop)}" stroke="#d5d7da" stroke-width="0.6"/>`);
  const sy = blockTop + 34;
  const nx = tx + tw - 12, ny = blockTop + 30;
  out.push(`<g data-role="north-arrow" transform="rotate(${scene.frame.northDeg} ${nx} ${ny})"><circle cx="${nx}" cy="${ny}" r="13" fill="none" stroke="${INK}" stroke-width="0.7"/><path d="M${nx} ${ny - 11}L${nx + 5.5} ${ny + 7}L${nx} ${ny + 3}L${nx - 5.5} ${ny + 7}Z" fill="${INK}"/><text x="${nx}" y="${ny - 16}" font-size="7" font-weight="700" text-anchor="middle" fill="${INK}">N</text></g>`);
  out.push(`<g data-role="scale-bar"><rect x="${tx}" y="${r2(sy - 5)}" width="${r2(barPt / 2)}" height="4" fill="${INK}"/><rect x="${r2(tx + barPt / 2)}" y="${r2(sy - 5)}" width="${r2(barPt / 2)}" height="4" fill="#ffffff"/><rect x="${tx}" y="${r2(sy - 5)}" width="${r2(barPt)}" height="4" fill="none" stroke="${INK}" stroke-width="0.6"/>`);
  out.push(`<text x="${tx}" y="${r2(sy - 8)}" font-size="6" fill="${INK}">0</text><text x="${r2(tx + barPt / 2)}" y="${r2(sy - 8)}" font-size="6" text-anchor="middle" fill="${INK}">${barFt / 2}</text><text x="${r2(tx + barPt)}" y="${r2(sy - 8)}" font-size="6" text-anchor="middle" fill="${INK}">${barFt} ft</text></g>`);
  const scaleLine = numericScale
    ? `Scale ${numericScale} at full size (${wIn} × ${hIn} in)`
    : !print ? 'Graphic scale' : 'Graphic scale only: the drawing frame is not verified';
  out.push(`<text x="${tx}" y="${r2(sy + 11)}" font-size="6.2" fill="#4b5158" data-role="numeric-scale">${esc(scaleLine)}</text>`);
  out.push(`<line x1="${tx}" y1="${r2(blockTop + 58)}" x2="${tx + tw}" y2="${r2(blockTop + 58)}" stroke="#d5d7da" stroke-width="0.6"/>`);
  out.push(`<text x="${tx}" y="${r2(by - 44)}" font-size="6.2" font-weight="700" letter-spacing="1.1" fill="#7a8087">CONCEPT · NOT FOR CONSTRUCTION</text>`);
  out.push(`<text x="${tx}" y="${r2(by - 33)}" font-size="5.6" fill="#7a8087">${esc(`Parcel ${scene.identity.parcelId} · ${scene.identity.schemeId} · rev ${scene.identity.revision} · ${title.date}`)}</text>`);
  out.push(`<text x="${tx}" y="${r2(by - 13)}" font-size="11" font-weight="700" fill="${INK}">Site Plan</text>`);
  out.push(`<text x="${tx + tw}" y="${r2(by - 12)}" font-size="20" font-weight="700" text-anchor="end" fill="${INK}" data-role="sheet-number">A-01</text>`);
  out.push('</svg>');

  return { size, widthPt: W, heightPt: H, ftPerInch, numericScale, scaleBarFt: barFt, schedule, figures: shown, striped, labels, svg: out.join('\n') };
}

function centre(polys: ScenePolygons): Pt | null {
  const ring = polys[0]?.[0];
  if (!ring?.length) return null;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

function wrap(s: string, max: number): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Where the picture sits on the rendering sheet, points. */
export function viewSheetLayout(size: SheetSize): { widthPt: number; heightPt: number; image: { x: number; y: number; w: number; h: number } } {
  const { wIn, hIn } = SHEET_SIZES[size];
  const W = r2(wIn * 72), H = r2(hIn * 72);
  const M = 0.3 * 72, band = 1.02 * 72;
  return { widthPt: W, heightPt: H, image: { x: M, y: M, w: W - 2 * M, h: H - 2 * M - band } };
}

/**
 * A-02 Aerial View: a rendering of the scheme filling the page, with a band
 * under it that names the project, gives the scheme's figures and says what
 * the picture is. Without a picture yet, the frame and the band are drawn and
 * the picture's place says it is being rendered.
 */
export function renderViewSheet(scene: DrawingScene, title: SheetTitle, size: SheetSize, picture: SheetUnderlay | null): { svg: string; widthPt: number; heightPt: number } {
  const { wIn, hIn } = SHEET_SIZES[size];
  const { widthPt: W, heightPt: H, image } = viewSheetLayout(size);
  const M = image.x;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" data-sheet="A-02" data-size="${size}">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  if (picture) out.push(`<image href="${esc(picture.href)}" x="${image.x}" y="${image.y}" width="${image.w}" height="${image.h}" preserveAspectRatio="xMidYMid slice" data-role="rendering"/>`);
  else out.push(`<rect x="${image.x}" y="${image.y}" width="${image.w}" height="${image.h}" fill="#eef1f3"/><text x="${r2(image.x + image.w / 2)}" y="${r2(image.y + image.h / 2)}" font-size="10" text-anchor="middle" fill="#7a8087">Rendering the view</text>`);
  out.push(`<rect x="${M}" y="${M}" width="${r2(W - 2 * M)}" height="${r2(H - 2 * M)}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  const by = image.y + image.h;
  out.push(`<line x1="${M}" y1="${r2(by)}" x2="${r2(W - M)}" y2="${r2(by)}" stroke="${INK}" stroke-width="1"/>`);
  const tx = M + 16;
  out.push(`<text x="${tx}" y="${r2(by + 22)}" font-size="6.2" font-weight="700" letter-spacing="1.1" fill="#7a8087">${picture?.ai ? 'AERIAL VIEW · AI IMPRESSION' : 'AERIAL VIEW · CONCEPT'}</text>`);
  out.push(`<text x="${tx}" y="${r2(by + 42)}" font-size="16" font-weight="700" fill="${INK}">${esc(title.project)}</text>`);
  if (title.subtitle) out.push(`<text x="${tx}" y="${r2(by + 54)}" font-size="7.5" fill="#4b5158">${esc(title.subtitle.length > 110 ? title.subtitle.slice(0, 108) + '…' : title.subtitle)}</text>`);
  // the scheme's figures, from the site data the workspace states
  const rows = (title.data ?? []).filter(r => r.label !== 'Zoning').slice(0, 4);
  const colW = Math.min(118, (W * 0.44) / Math.max(1, rows.length));
  const fx0 = W - M - 150 - rows.length * colW;
  rows.forEach((r, i) => {
    const x = fx0 + i * colW;
    out.push(`<g data-figure="${esc(r.label)}"><text x="${r2(x)}" y="${r2(by + 38)}" font-size="${r.value.length > 14 ? 10 : 14}" font-weight="700" fill="${INK}">${esc(r.value)}</text><text x="${r2(x)}" y="${r2(by + 50)}" font-size="6" font-weight="600" letter-spacing="0.9" fill="#7a8087">${esc(r.label.toUpperCase())}</text></g>`);
  });
  out.push(`<text x="${r2(W - M - 14)}" y="${r2(by + 44)}" font-size="20" font-weight="700" text-anchor="end" fill="${INK}" data-role="sheet-number">A-02</text>`);
  out.push(`<text x="${r2(W - M - 14)}" y="${r2(by + 57)}" font-size="5.6" text-anchor="end" fill="#7a8087">${esc(`Parcel ${scene.identity.parcelId} · rev ${scene.identity.revision} · ${title.date}`)}</text>`);
  out.push(`<text x="${tx}" y="${r2(H - M - 5)}" font-size="5.4" fill="#7a8087" data-role="view-note">${picture?.ai
    ? "An AI impression painted over a render of the plan. The layout is the plan's. Materials, planting, sky and surroundings are invented, and a detail may differ from the plan. Not a design."
    : "Rendered from the plan's footprints and story counts. Facades, roofs above the eaves, planting, cars, light and the surroundings are illustration, not a design."}</text>`);
  out.push('</svg>');
  return { svg: out.join('\n'), widthPt: W, heightPt: H };
}

/** Where a line through `at` along `dir` crosses a ring: distances along the line, in the ring's units, sorted. */
export function crossings(ring: ArrayLike<ArrayLike<number>>, at: Pt, dir: Pt): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const ax = (a[0] ?? 0) - at[0], ay = (a[1] ?? 0) - at[1], bx = (b[0] ?? 0) - at[0], by = (b[1] ?? 0) - at[1];
    // signed distance of each end from the line, and where the edge crosses it
    const da = ax * -dir[1] + ay * dir[0], db = bx * -dir[1] + by * dir[0];
    if ((da > 0) === (db > 0) || da === db) continue;
    const k = da / (da - db);
    out.push((ax + (bx - ax) * k) * dir[0] + (ay + (by - ay) * k) * dir[1]);
  }
  return out.sort((p, q) => p - q);
}

/**
 * A-03 Section A–A: a cut across the first tagged building, at right angles to
 * its longest wall, from property line to property line. Every building the
 * cut passes through is drawn as its stories at the scene's heights. The
 * ground is drawn level: the plan carries no grade. Heights are the scene's
 * (estimated from story counts unless the plan reports one); no horizontal
 * distance is stated, and the sheet carries a graphic scale only.
 */
export function renderSectionSheet(scene: DrawingScene, title: SheetTitle, size: SheetSize): { svg: string; widthPt: number; heightPt: number; drawn: number } {
  const { wIn, hIn } = SHEET_SIZES[size];
  const { widthPt: W, heightPt: H, image } = viewSheetLayout(size);
  const M = image.x;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" data-sheet="A-03" data-scene-key="${esc(scene.identity.key)}" data-revision="${esc(scene.identity.revision)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<rect x="${M}" y="${M}" width="${r2(W - 2 * M)}" height="${r2(H - 2 * M)}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  const by = image.y + image.h;
  out.push(`<line x1="${M}" y1="${r2(by)}" x2="${r2(W - M)}" y2="${r2(by)}" stroke="${INK}" stroke-width="1"/>`);

  const subject = scene.buildings.find(b => b.tagOnPlan) ?? scene.buildings[0];
  const ring = subject?.polygons[0]?.[0];
  let drawn = 0;
  if (subject && ring && ring.length >= 3) {
    // the cut runs at right angles to the building's longest wall, through its label point
    let long: Pt = [1, 0], best = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > best) { best = len; long = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; }
    }
    const dir: Pt = [-long[1], long[0]], at = subject.labelPoint;
    const lot = scene.parcel?.polygons[0]?.[0];
    const lotCuts = lot ? crossings(lot, at, dir) : [];
    const before = lotCuts.filter(t => t < 0), after = lotCuts.filter(t => t > 0);
    const cuts = scene.buildings.map(b => ({ b, hits: crossings(b.polygons[0]?.[0] ?? [], at, dir) })).filter(c => c.hits.length >= 2);
    const lo = Math.min(before.length ? (before[before.length - 1] as number) : Infinity, ...cuts.flatMap(c => c.hits)) - 12;
    const hi = Math.max(after.length ? (after[0] as number) : -Infinity, ...cuts.flatMap(c => c.hits)) + 12;
    const tallest = Math.max(10, ...cuts.map(c => c.b.height.aboveGradeFt));
    // one scale both ways: a true section
    const k = Math.min((image.w - 120) / (hi - lo), (image.h - 110) / (tallest + 16));
    const x = (t: number) => r2(image.x + image.w / 2 + (t - (lo + hi) / 2) * k);
    const ground = image.y + image.h - 56;
    const y = (ft: number) => r2(ground - ft * k);
    out.push(`<g data-role="section" data-building="${esc(subject.id)}">`);
    out.push(`<rect x="${x(lo)}" y="${r2(ground)}" width="${r2((hi - lo) * k)}" height="14" fill="#e9e6df"/><line x1="${x(lo)}" y1="${r2(ground)}" x2="${x(hi)}" y2="${r2(ground)}" stroke="${INK}" stroke-width="1.2" data-role="ground"/>`);
    for (const t of [before[before.length - 1], after[0]]) {
      if (t == null) continue;
      out.push(`<g data-role="property-line"><line x1="${x(t)}" y1="${y(tallest + 8)}" x2="${x(t)}" y2="${r2(ground + 14)}" stroke="${INK}" stroke-width="0.9" stroke-dasharray="7 2.5 1.5 2.5"/><text x="${x(t)}" y="${r2(y(tallest + 8) - 4)}" font-size="6" text-anchor="middle" fill="#4b5158">Property line</text></g>`);
    }
    for (const { b, hits } of cuts) {
      const a = hits[0] as number, z = hits[hits.length - 1] as number;
      const levels = b.height.levelsFt;
      levels.forEach((top, i) => {
        const base = i === 0 ? 0 : (levels[i - 1] as number);
        out.push(`<rect x="${x(a)}" y="${y(top)}" width="${r2((z - a) * k)}" height="${r2((top - base) * k)}" fill="${i % 2 ? '#f4f1ea' : '#ebe7de'}" stroke="${INK}" stroke-width="0.8" data-level="${i + 1}"/>`);
        if ((top - base) * k >= 9) out.push(`<text x="${r2(x(a) + 5)}" y="${r2(y((top + base) / 2) + 2.4)}" font-size="6.2" fill="#4b5158">Level ${i + 1}</text>`);
      });
      const top = b.height.aboveGradeFt, dx = x(z) + 12;
      out.push(`<g data-role="height" data-building="${esc(b.id)}"><line x1="${dx}" y1="${r2(ground)}" x2="${dx}" y2="${y(top)}" stroke="${INK}" stroke-width="0.6"/><line x1="${r2(dx - 3)}" y1="${r2(ground)}" x2="${r2(dx + 3)}" y2="${r2(ground)}" stroke="${INK}" stroke-width="0.6"/><line x1="${r2(dx - 3)}" y1="${y(top)}" x2="${r2(dx + 3)}" y2="${y(top)}" stroke="${INK}" stroke-width="0.6"/>`
        + `<text x="${r2(dx + 6)}" y="${r2((ground + y(top)) / 2 + 2.4)}" font-size="6.6" fill="${INK}">${esc(`${b.height.basis === 'estimated' ? 'est. ' : ''}${Math.round(top)} ft`)}</text></g>`);
      out.push(`<text x="${r2((x(a) + x(z)) / 2)}" y="${r2(y(top) - 6)}" font-size="8" font-weight="700" text-anchor="middle" fill="${INK}">${esc(`${b.display.title} · ${levels.length} ${levels.length === 1 ? 'story' : 'stories'}`)}</text>`);
      drawn++;
    }
    // a graphic scale: the section states no horizontal distance in figures
    const bar = [100, 50, 20, 10].find(ft => ft * k <= image.w * 0.22) ?? 10;
    const sx = image.x + 18, sy = ground + 36;
    out.push(`<g data-role="scale-bar"><rect x="${r2(sx)}" y="${r2(sy)}" width="${r2((bar / 2) * k)}" height="3" fill="${INK}"/><rect x="${r2(sx + (bar / 2) * k)}" y="${r2(sy)}" width="${r2((bar / 2) * k)}" height="3" fill="#fff" stroke="${INK}" stroke-width="0.6"/><text x="${r2(sx)}" y="${r2(sy - 3)}" font-size="5.6" fill="#4b5158">0</text><text x="${r2(sx + bar * k)}" y="${r2(sy - 3)}" font-size="5.6" text-anchor="middle" fill="#4b5158">${bar} ft</text></g>`);
    out.push('</g>');
  } else {
    out.push(`<text x="${r2(W / 2)}" y="${r2(image.y + image.h / 2)}" font-size="10" text-anchor="middle" fill="#7a8087">No building on this plan to cut a section through.</text>`);
  }
  const tx = M + 16;
  out.push(`<text x="${tx}" y="${r2(by + 22)}" font-size="6.2" font-weight="700" letter-spacing="1.1" fill="#7a8087">SECTION A–A · CONCEPT</text>`);
  out.push(`<text x="${tx}" y="${r2(by + 42)}" font-size="16" font-weight="700" fill="${INK}">${esc(title.project)}</text>`);
  if (title.subtitle) out.push(`<text x="${tx}" y="${r2(by + 54)}" font-size="7.5" fill="#4b5158">${esc(title.subtitle.length > 110 ? title.subtitle.slice(0, 108) + '…' : title.subtitle)}</text>`);
  out.push(`<text x="${r2(W - M - 14)}" y="${r2(by + 44)}" font-size="20" font-weight="700" text-anchor="end" fill="${INK}" data-role="sheet-number">A-03</text>`);
  out.push(`<text x="${r2(W - M - 14)}" y="${r2(by + 57)}" font-size="5.6" text-anchor="end" fill="#7a8087">${esc(`Parcel ${scene.identity.parcelId} · rev ${scene.identity.revision} · ${title.date}`)}</text>`);
  out.push(`<text x="${tx}" y="${r2(H - M - 5)}" font-size="5.4" fill="#7a8087" data-role="section-note">${esc(subject?.height.basis === 'reported'
    ? 'Schematic. The ground is drawn level: the plan carries no grade. Roofs and parapets are not drawn. Graphic scale only.'
    : 'Schematic. The ground is drawn level: the plan carries no grade. Heights are estimated from story counts and are not measured or controlling. Roofs and parapets are not drawn. Graphic scale only.')}</text>`);
  out.push('</svg>');
  return { svg: out.join('\n'), widthPt: W, heightPt: H, drawn };
}
