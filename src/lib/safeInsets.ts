// The part of a canvas a fit can use: the canvas less the panels and buttons standing over its edges
// (navigation audit 11-27: "the canvas fits underneath the UI, rather than between controls"). Each
// overlay is charged to the one edge it hugs that costs the least drawing area, so a corner button
// stack takes a strip off one side, not a band off two.

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Insets { top: number; right: number; bottom: number; left: number }

/** How close to an edge an overlay must start to count as standing on it, px. */
const HUG = 28;
/** No edge gives up more than this share of the canvas. */
const CAP = 0.3;

export function safeInsets(canvas: Box, overlays: Box[]): Insets {
  const w = canvas.right - canvas.left, h = canvas.bottom - canvas.top;
  const out: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!(w > 0 && h > 0)) return out;
  for (const o of overlays) {
    // only what actually stands over the canvas
    const ix = Math.min(o.right, canvas.right) - Math.max(o.left, canvas.left);
    const iy = Math.min(o.bottom, canvas.bottom) - Math.max(o.top, canvas.top);
    if (ix <= 0 || iy <= 0) continue;
    if (ix * iy > w * h * 0.4) continue; // a sheet over the whole canvas is not an edge overlay
    const options: Array<[keyof Insets, number, number]> = [];
    if (o.top - canvas.top < HUG) options.push(['top', o.bottom - canvas.top, (o.bottom - canvas.top) * w]);
    if (canvas.bottom - o.bottom < HUG) options.push(['bottom', canvas.bottom - o.top, (canvas.bottom - o.top) * w]);
    if (o.left - canvas.left < HUG) options.push(['left', o.right - canvas.left, (o.right - canvas.left) * h]);
    if (canvas.right - o.right < HUG) options.push(['right', canvas.right - o.left, (canvas.right - o.left) * h]);
    if (!options.length) continue; // floating mid-canvas: not an edge to keep clear
    options.sort((a, b) => a[2] - b[2]);
    const [edge, size] = options[0]!;
    out[edge] = Math.max(out[edge], size);
  }
  out.top = Math.min(out.top, h * CAP);
  out.bottom = Math.min(out.bottom, h * CAP);
  out.left = Math.min(out.left, w * CAP);
  out.right = Math.min(out.right, w * CAP);
  return out;
}

/** The overlays standing over an element: absolutely or fixed positioned, visible, not containing it. */
export function overlaysOver(el: HTMLElement, scope: ParentNode = document): Box[] {
  const r = el.getBoundingClientRect();
  const boxes: Box[] = [];
  for (const o of Array.from(scope.querySelectorAll<HTMLElement>('div,aside,nav,section'))) {
    if (o === el || o.contains(el)) continue;
    const cs = getComputedStyle(o);
    if ((cs.position !== 'absolute' && cs.position !== 'fixed') || cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    const b = o.getBoundingClientRect();
    if (b.width < 8 || b.height < 8) continue;
    if (b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom) continue;
    boxes.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom });
  }
  return boxes;
}
