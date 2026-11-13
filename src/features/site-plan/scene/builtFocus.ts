// What a picture of a scheme should frame. A small plan on a small parcel:
// the parcel. A few buildings on a large parcel: the buildings. Many buildings
// spread across a large parcel: the densest group of them, so that homes are
// not specks. Units are whatever the points are in; nothing here is displayed.
export interface Focus { x: number; y: number; radius: number; kind: 'parcel' | 'built' | 'cluster' }

export function builtFocus(parcel: { x: number; y: number; radius: number }, buildings: Array<[number, number]>[]): Focus {
  const whole: Focus = { ...parcel, kind: 'parcel' };
  const pts = buildings.flat();
  if (pts.length < 3) return whole;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2;
  const br = Math.max(15, ...pts.map(p => Math.hypot(p[0] - bx, p[1] - by))) * 1.25;
  if (br < parcel.radius * 0.6) return { x: bx, y: by, radius: br, kind: 'built' };
  // spread across the parcel: the group with the most buildings within a third of the parcel's reach
  const centres = buildings.filter(b => b.length > 0).map(b => [b.reduce((s, p) => s + p[0], 0) / b.length, b.reduce((s, p) => s + p[1], 0) / b.length] as [number, number]);
  if (centres.length < 12) return whole;
  const reach = parcel.radius * 0.32;
  let best: [number, number] | null = null, most = 0;
  for (const c of centres) {
    const near = centres.filter(o => Math.hypot(o[0] - c[0], o[1] - c[1]) <= reach);
    if (near.length > most) {
      most = near.length;
      best = [near.reduce((s, p) => s + p[0], 0) / near.length, near.reduce((s, p) => s + p[1], 0) / near.length];
    }
  }
  // a group worth a picture holds a good share of the plan
  if (!best || most < Math.max(6, centres.length * 0.25)) return whole;
  return { x: best[0], y: best[1], radius: reach * 1.15, kind: 'cluster' };
}
