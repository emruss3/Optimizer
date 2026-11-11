// A-01 Site Plan as a vector sheet. The sheet is drawn from the scene and from
// nothing else: the tags, stories, areas and heights on it are the scene's own
// strings, so they are the ones the plan and the 3D inspector show.
//
// The page is in points (72 per inch) at its true size, so a numeric scale is
// exact when the sheet is printed at 100%. It is stated only when the scene's
// frame has been checked against an engine dimension.
import type { DrawingScene, ScenePolygons } from './types';
import type { Pt } from './frame';
import { LABEL_PRIORITY, placeLabels, type LabelCandidate, type PlacedLabel } from './labels';

export type SheetSize = 'letter' | 'tabloid';

export const SHEET_SIZES: Record<SheetSize, { wIn: number; hIn: number; label: string }> = {
  letter: { wIn: 11, hIn: 8.5, label: 'Letter landscape, 11 × 8.5 in' },
  tabloid: { wIn: 17, hIn: 11, label: 'Tabloid landscape, 17 × 11 in' },
};

/** Engineering scales, feet per inch. */
const SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000];

export interface SheetTitle {
  project: string;
  subtitle?: string | null;
  date: string;
  notes?: string[];
}

export interface SheetModel {
  size: SheetSize;
  widthPt: number;
  heightPt: number;
  /** Feet per inch at full size. */
  ftPerInch: number;
  /** `1" = 40'`, or null when the frame is not verified. */
  numericScale: string | null;
  scaleBarFt: number;
  /** Rows of the building schedule, as printed. */
  schedule: Array<{ tag: string; id: string; use: string; floors: string; footprint: string; gross: string; height: string }>;
  labels: PlacedLabel[];
  svg: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n: number) => Math.round(n * 100) / 100;

export function renderSitePlanSheet(scene: DrawingScene, title: SheetTitle, size: SheetSize = 'tabloid'): SheetModel {
  const { wIn, hIn } = SHEET_SIZES[size];
  const W = wIn * 72, H = hIn * 72;
  const M = 0.35 * 72;                       // margin
  const stripW = (size === 'tabloid' ? 3.6 : 2.9) * 72;
  const draw = { x: M, y: M, w: W - 2 * M - stripW, h: H - 2 * M };
  const strip = { x: draw.x + draw.w, y: M, w: stripW, h: H - 2 * M };
  const pad = 0.3 * 72;

  const e = scene.extentFt;
  const spanX = Math.max(1, e.maxX - e.minX), spanY = Math.max(1, e.maxY - e.minY);
  const availIn = { w: (draw.w - 2 * pad) / 72, h: (draw.h - 2 * pad) / 72 };
  const ftPerInch = SCALES.find(s => spanX / s <= availIn.w && spanY / s <= availIn.h) ?? 2000;
  const k = 72 / ftPerInch;                  // points per foot
  const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
  const px = draw.x + draw.w / 2, py = draw.y + draw.h / 2;
  const P = (p: Pt): Pt => [r2(px + (p[0] - cx) * k), r2(py - (p[1] - cy) * k)];
  const path = (polys: ScenePolygons) =>
    polys.map(poly => poly.map(ring => 'M' + ring.map(p => P(p).join(' ')).join('L') + 'Z').join('')).join('');

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" data-sheet="A-01" data-size="${size}">`);
  out.push('<defs>');
  out.push(`<clipPath id="a01-clip"><rect x="${draw.x}" y="${draw.y}" width="${draw.w}" height="${draw.h}"/></clipPath>`);
  out.push('<pattern id="a01-open" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.45" fill="#8a8a8a"/><circle cx="4.5" cy="4.5" r="0.45" fill="#8a8a8a"/></pattern>');
  out.push('<pattern id="a01-bldg" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#d2d2d2"/><line x1="0" y1="0" x2="0" y2="5" stroke="#8c8c8c" stroke-width="0.7"/></pattern>');
  out.push('</defs>');
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  // the drawing
  out.push('<g clip-path="url(#a01-clip)">');
  if (scene.context.parcels.length) out.push(`<path d="${path([...scene.context.parcels.map(r => r)])}" fill="none" stroke="#d6d6d6" stroke-width="0.4" data-role="context-parcel"/>`);
  for (const road of scene.context.roads) {
    out.push(`<polyline points="${road.path.map(p => P(p).join(',')).join(' ')}" fill="none" stroke="#e2e2e2" stroke-width="${r2(Math.max(2, 20 * k))}" stroke-linecap="round" stroke-linejoin="round" data-role="context-street"/>`);
  }
  for (const b of scene.context.buildings) out.push(`<path d="${path(b.polygons)}" fill="#ececec" stroke="#cfcfcf" stroke-width="0.4" fill-rule="evenodd" data-role="context-building"/>`);
  if (scene.parcel) out.push(`<path d="${path(scene.parcel.polygons)}" fill="#ffffff" fill-rule="evenodd" stroke="none"/>`);
  const STYLE = {
    'open-space': 'fill="url(#a01-open)" stroke="#9a9a9a" stroke-width="0.4"',
    lot: 'fill="none" stroke="#555555" stroke-width="0.6"',
    street: 'fill="#e4e4e4" stroke="#8a8a8a" stroke-width="0.5"',
    drive: 'fill="#e4e4e4" stroke="#9a9a9a" stroke-width="0.4"',
    parking: 'fill="#f6f6f6" stroke="#777777" stroke-width="0.5"',
    other: 'fill="none" stroke="#9a9a9a" stroke-width="0.4"',
    house: 'fill="#d2d2d2" stroke="#333333" stroke-width="0.6"',
    amenity: 'fill="#e6e6e6" stroke="#111111" stroke-width="1"',
    building: 'fill="url(#a01-bldg)" stroke="#111111" stroke-width="1.2"',
  } as const;
  const ORDER = ['open-space', 'lot', 'street', 'drive', 'parking', 'other', 'house', 'amenity', 'building'] as const;
  for (const role of ORDER) {
    for (const f of scene.features) {
      if (f.styleRole !== role) continue;
      out.push(`<path d="${path(f.polygons)}" ${STYLE[role]} fill-rule="evenodd" data-role="${role}" data-feature-id="${esc(f.id)}"/>`);
    }
  }
  if (scene.envelope) out.push(`<path d="${path(scene.envelope.polygons)}" fill="none" stroke="#555555" stroke-width="0.6" stroke-dasharray="4 3" data-role="envelope"/>`);
  if (scene.parcel) out.push(`<path d="${path(scene.parcel.polygons)}" fill="none" fill-rule="evenodd" stroke="#000000" stroke-width="1.6" stroke-dasharray="16 3 3 3 3 3" data-role="parcel"/>`);

  // labels, by priority
  const cands: LabelCandidate[] = [];
  const text = new Map<string, { lines: string[]; kind: string; size: number }>();
  const tagR = 8;
  for (const b of scene.buildings) {
    if (!b.tagOnPlan) continue;
    const [x, y] = P(b.labelPoint);
    cands.push({ id: `tag:${b.id}`, priority: LABEL_PRIORITY.buildingTag, x, y, w: tagR * 2, h: tagR * 2, required: true });
    const lines = b.display.planLines;
    const w = Math.max(...lines.map(l => l.length)) * 6.5 * 0.5 + 6, h = lines.length * 8 + 4;
    cands.push({
      id: `cap:${b.id}`, priority: LABEL_PRIORITY.buildingCaption, x, y: y + tagR + h / 2 + 2, w, h,
      alternates: [[x, y - tagR - h / 2 - 2], [x + tagR + w / 2 + 3, y], [x - tagR - w / 2 - 3, y]],
    });
    text.set(`cap:${b.id}`, { lines, kind: 'caption', size: 6.5 });
  }
  for (const f of scene.features) {
    if (f.role !== 'parking' || f.stalls == null || f.stalls <= 0) continue;
    const c = centre(f.polygons);
    if (!c) continue;
    const [x, y] = P(c);
    const s = `${f.stalls} stalls`;
    cands.push({ id: `park:${f.id}`, priority: LABEL_PRIORITY.parkingCount, x, y, w: s.length * 3.2 + 6, h: 10 });
    text.set(`park:${f.id}`, { lines: [s], kind: 'parking', size: 6 });
  }
  const seenRoad = new Set<string>();
  for (const road of scene.context.roads) {
    if (!road.name || seenRoad.has(road.name) || road.path.length < 2) continue;
    seenRoad.add(road.name);
    const mid = P(road.path[Math.floor(road.path.length / 2)] ?? [0, 0]);
    const s = road.name.toUpperCase();
    cands.push({ id: `road:${road.name}`, priority: LABEL_PRIORITY.streetName, x: mid[0], y: mid[1], w: s.length * 3.4 + 6, h: 9 });
    text.set(`road:${road.name}`, { lines: [s], kind: 'street', size: 5.5 });
  }
  const labels = placeLabels(cands, { gap: 1.5, bounds: { minX: draw.x + 2, minY: draw.y + 2, maxX: draw.x + draw.w - 2, maxY: draw.y + draw.h - 2 } });
  for (const l of labels) {
    if (!l.placed) continue;
    if (l.id.startsWith('tag:')) {
      const b = scene.buildings.find(q => `tag:${q.id}` === l.id)!;
      out.push(`<g data-label="building-tag" data-feature-id="${esc(b.id)}"><circle cx="${l.x}" cy="${l.y}" r="${tagR}" fill="#ffffff" stroke="#000000" stroke-width="1"/><text x="${l.x}" y="${r2(l.y + 3.2)}" font-size="${b.tag.length > 1 ? 7 : 9}" font-weight="700" text-anchor="middle" fill="#000000">${esc(b.tag)}</text></g>`);
      continue;
    }
    const t = text.get(l.id);
    if (!t) continue;
    const fill = t.kind === 'street' ? '#6a6a6a' : '#111111';
    out.push(`<g data-label="${t.kind}"><rect x="${r2(l.x - l.w / 2)}" y="${r2(l.y - l.h / 2)}" width="${r2(l.w)}" height="${r2(l.h)}" fill="#ffffff" fill-opacity="${t.kind === 'street' ? 0.6 : 0.9}"/>`);
    t.lines.forEach((line, i) => {
      const ty = l.y - ((t.lines.length - 1) * 8) / 2 + i * 8 + t.size * 0.35;
      out.push(`<text x="${l.x}" y="${r2(ty)}" font-size="${t.size}" font-weight="${i === 0 && t.kind === 'caption' ? 700 : 400}" text-anchor="middle" fill="${fill}">${esc(line)}</text>`);
    });
    out.push('</g>');
  }
  out.push('</g>');

  // frame
  out.push(`<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#000000" stroke-width="1.2"/>`);
  out.push(`<line x1="${strip.x}" y1="${strip.y}" x2="${strip.x}" y2="${strip.y + strip.h}" stroke="#000000" stroke-width="1"/>`);

  // title strip
  const tx = strip.x + 10, tw = strip.w - 20;
  let y = strip.y + 20;
  const line = (s: string, sz: number, weight = 400, fill = '#111111', gap = 3) => {
    for (const part of wrap(s, Math.floor(tw / (sz * 0.5)))) {
      out.push(`<text x="${tx}" y="${r2(y)}" font-size="${sz}" font-weight="${weight}" fill="${fill}">${esc(part)}</text>`);
      y += sz + gap;
    }
  };
  const rule = () => { out.push(`<line x1="${strip.x}" y1="${r2(y)}" x2="${strip.x + strip.w}" y2="${r2(y)}" stroke="#000000" stroke-width="0.5"/>`); y += 12; };
  line(title.project, 12, 700);
  if (title.subtitle) line(title.subtitle, 7.5, 400, '#333333');
  y += 2; rule();

  line('BUILDINGS', 7, 700, '#333333', 4);
  const colAt = [0, 0.1, 0.36, 0.5, 0.74];
  const col = (i: number) => r2(tx + (colAt[i] ?? 0) * tw);
  const head = ['', 'Use', 'Stories', 'Footprint', 'Height'];
  head.forEach((h, i) => out.push(`<text x="${col(i)}" y="${r2(y)}" font-size="5.8" fill="#555555">${esc(h)}</text>`));
  y += 8;
  const schedule: SheetModel['schedule'] = [];
  const onSheet = scene.buildings.filter(b => b.tagOnPlan);
  const small = scene.buildings.filter(b => !b.tagOnPlan);
  let estimated = false;
  for (const b of onSheet.slice(0, 14)) {
    const d = b.display;
    schedule.push({ tag: b.tag, id: b.id, use: d.use, floors: d.floors, footprint: d.footprint, gross: d.gross, height: `${d.heightLabel} ${d.height}` });
    if (b.height.basis === 'estimated') estimated = true;
    const cells = [b.tag, d.use, String(b.floors.value), d.footprint, d.heightShort];
    out.push(`<g data-schedule-row="${esc(b.id)}">` + cells.map((c, i) => `<text x="${col(i)}" y="${r2(y)}" font-size="6.5" font-weight="${i === 0 ? 700 : 400}" fill="#111111">${esc(c)}</text>`).join('') + '</g>');
    y += 9;
  }
  if (onSheet.length > 14) line(`and ${onSheet.length - 14} more`, 6, 400, '#555555');
  if (small.length) {
    const kinds = new Map<string, number>();
    for (const b of small) kinds.set(b.display.use, (kinds.get(b.display.use) ?? 0) + 1);
    line([...kinds].map(([u, n]) => `${n} ${u.toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ') + ' (not tagged)', 6.5, 400, '#111111');
  }
  if (!scene.buildings.length) line('No building on this sheet.', 6.5, 400, '#555555');
  y += 3;
  const totals: string[] = [];
  if (scene.schedule.units != null) totals.push(`${scene.schedule.units.toLocaleString('en-US')} units`);
  if (scene.schedule.stalls != null) totals.push(`${scene.schedule.stalls.toLocaleString('en-US')} stalls`);
  if (totals.length) line(`Scheme schedule: ${totals.join(' · ')}`, 6.5, 700);
  if (!scene.schedule.consistent) line('The drawn features do not add up to the scheme schedule.', 6, 400, '#111111');
  if (estimated) line('Heights are estimated from story counts and are above grade. The plan carries no measured height.', 5.8, 400, '#333333', 2.5);
  y += 4; rule();

  // legend: only what is on the sheet
  line('LEGEND', 7, 700, '#333333', 5);
  const present = new Set(scene.features.map(f => f.styleRole));
  const LEGEND: Array<[string, string, string]> = [
    ['parcel', 'Property line', 'fill="none" stroke="#000000" stroke-width="1.4" stroke-dasharray="8 2 2 2 2 2"'],
    ['envelope', 'Setback line', 'fill="none" stroke="#555555" stroke-width="0.6" stroke-dasharray="4 3"'],
    ['building', 'Building', STYLE.building],
    ['amenity', 'Amenity', STYLE.amenity],
    ['house', 'House or townhome', STYLE.house],
    ['parking', 'Parking', STYLE.parking],
    ['drive', 'Drive', STYLE.drive],
    ['street', 'Street', STYLE.street],
    ['lot', 'Lot line', STYLE.lot],
    ['open-space', 'Open space', STYLE['open-space']],
    ['context', 'Existing building', 'fill="#ececec" stroke="#cfcfcf" stroke-width="0.4"'],
  ];
  for (const [key, label, style] of LEGEND) {
    const has = key === 'parcel' ? !!scene.parcel : key === 'envelope' ? !!scene.envelope : key === 'context' ? scene.context.buildings.length > 0 : present.has(key as never);
    if (!has) continue;
    if (key === 'parcel' || key === 'envelope' || key === 'lot') out.push(`<line x1="${tx}" y1="${r2(y - 2.5)}" x2="${tx + 18}" y2="${r2(y - 2.5)}" ${style}/>`);
    else out.push(`<rect x="${tx}" y="${r2(y - 6.5)}" width="18" height="8" ${style}/>`);
    out.push(`<text x="${tx + 24}" y="${r2(y)}" font-size="6.5" fill="#111111" data-legend="${key}">${esc(label)}</text>`);
    y += 11;
  }
  y += 2; rule();

  // notes
  for (const n of title.notes ?? []) line(n, 5.8, 400, '#333333', 2.5);

  // bottom block: north, scale, sheet number
  const by = strip.y + strip.h;
  const verified = scene.frameCheck.status === 'verified';
  const numericScale = verified ? `1" = ${ftPerInch}'` : null;
  const barFt = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 2000, 4000].find(f => f * k >= 1.2 * 72) ?? ftPerInch * 2;
  const barPt = barFt * k;
  const sy = by - 96;
  out.push(`<line x1="${strip.x}" y1="${r2(sy - 46)}" x2="${strip.x + strip.w}" y2="${r2(sy - 46)}" stroke="#000000" stroke-width="0.5"/>`);
  // north arrow: the frame is north-up and the sheet does not rotate it
  const nx = strip.x + strip.w - 26, ny = sy - 10;
  out.push(`<g data-role="north-arrow" transform="rotate(${scene.frame.northDeg} ${nx} ${ny})"><path d="M${nx} ${ny - 22}L${nx + 7} ${ny + 6}L${nx} ${ny + 1}L${nx - 7} ${ny + 6}Z" fill="#000000"/><text x="${nx}" y="${ny - 25}" font-size="8" font-weight="700" text-anchor="middle">N</text></g>`);
  out.push(`<g data-role="scale-bar"><rect x="${tx}" y="${r2(sy - 14)}" width="${r2(barPt / 2)}" height="4" fill="#000000"/><rect x="${r2(tx + barPt / 2)}" y="${r2(sy - 14)}" width="${r2(barPt / 2)}" height="4" fill="#ffffff" stroke="#000000" stroke-width="0.6"/><rect x="${tx}" y="${r2(sy - 14)}" width="${r2(barPt)}" height="4" fill="none" stroke="#000000" stroke-width="0.6"/>`);
  out.push(`<text x="${tx}" y="${r2(sy - 17)}" font-size="6" fill="#111111">0</text><text x="${r2(tx + barPt / 2)}" y="${r2(sy - 17)}" font-size="6" text-anchor="middle" fill="#111111">${barFt / 2}</text><text x="${r2(tx + barPt)}" y="${r2(sy - 17)}" font-size="6" text-anchor="middle" fill="#111111">${barFt} ft</text></g>`);
  out.push(`<text x="${tx}" y="${r2(sy)}" font-size="6.5" fill="#111111" data-role="numeric-scale">${esc(numericScale ? `Scale ${numericScale} at full size (${SHEET_SIZES[size].wIn} × ${SHEET_SIZES[size].hIn} in)` : 'Graphic scale only: the drawing frame is not verified')}</text>`);
  out.push(`<line x1="${strip.x}" y1="${r2(sy + 10)}" x2="${strip.x + strip.w}" y2="${r2(sy + 10)}" stroke="#000000" stroke-width="0.5"/>`);
  out.push(`<text x="${tx}" y="${r2(sy + 26)}" font-size="7" font-weight="700" fill="#111111">CONCEPT · NOT FOR CONSTRUCTION</text>`);
  out.push(`<text x="${tx}" y="${r2(sy + 37)}" font-size="5.8" fill="#333333">${esc(`Parcel ${scene.identity.parcelId} · scheme ${scene.identity.schemeId} · rev ${scene.identity.revision} · ${title.date}`)}</text>`);
  out.push(`<line x1="${strip.x}" y1="${r2(sy + 46)}" x2="${strip.x + strip.w}" y2="${r2(sy + 46)}" stroke="#000000" stroke-width="0.5"/>`);
  out.push(`<text x="${tx}" y="${r2(by - 22)}" font-size="13" font-weight="700" fill="#000000">SITE PLAN</text>`);
  out.push(`<text x="${strip.x + strip.w - 10}" y="${r2(by - 16)}" font-size="24" font-weight="700" text-anchor="end" fill="#000000" data-role="sheet-number">A-01</text>`);
  out.push('</svg>');

  return { size, widthPt: W, heightPt: H, ftPerInch, numericScale, scaleBarFt: barFt, schedule, labels, svg: out.join('\n') };
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
