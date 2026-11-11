// Label placement by priority. A sheet has more to say than it has room for,
// so each label carries a rank and the lower ranks give way: a building tag
// always prints, a stall count prints if it does not cover a tag, a street
// name prints if there is room left.

export interface LabelCandidate {
  id: string;
  /** 1 is placed first. Ties keep their input order. */
  priority: number;
  /** Centre of the label box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Other centres to try, in order, when the first collides. */
  alternates?: Array<[number, number]>;
  /** A required label is placed even when it collides. */
  required?: boolean;
}

export interface PlacedLabel extends LabelCandidate {
  placed: boolean;
  /** True when a required label was placed over another. */
  overlapped: boolean;
}

export const LABEL_PRIORITY = {
  buildingTag: 1,
  buildingCaption: 2,
  parkingCount: 3,
  dimension: 4,
  streetName: 5,
  context: 6,
} as const;

const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;

/**
 * Place labels in priority order inside `bounds`. A label that collides with
 * one already placed tries its alternates, then is dropped unless required.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  opts: { gap?: number; bounds?: { minX: number; minY: number; maxX: number; maxY: number } } = {},
): PlacedLabel[] {
  const gap = opts.gap ?? 1;
  const b = opts.bounds;
  const inside = (c: { x: number; y: number; w: number; h: number }) =>
    !b || (c.x - c.w / 2 >= b.minX && c.x + c.w / 2 <= b.maxX && c.y - c.h / 2 >= b.minY && c.y + c.h / 2 <= b.maxY);
  const order = candidates.map((c, i) => ({ c, i })).sort((p, q) => p.c.priority - q.c.priority || p.i - q.i);
  const kept: PlacedLabel[] = [];
  const out: PlacedLabel[] = new Array(candidates.length);
  for (const { c, i } of order) {
    const tries: Array<[number, number]> = [[c.x, c.y], ...(c.alternates ?? [])];
    let done: PlacedLabel | null = null;
    for (const [x, y] of tries) {
      const box = { ...c, x, y };
      if (!inside(box)) continue;
      if (kept.some(k => hit(box, k, gap))) continue;
      done = { ...box, placed: true, overlapped: false };
      break;
    }
    if (!done && c.required) done = { ...c, placed: true, overlapped: true };
    if (!done) done = { ...c, placed: false, overlapped: false };
    if (done.placed) kept.push(done);
    out[i] = done;
  }
  return out;
}
