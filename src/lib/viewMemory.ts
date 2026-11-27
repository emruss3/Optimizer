// Where the user left each view, kept across the 2D ↔ 3D switch (navigation audit 11-27, P0.1). The 2D
// canvas and the 3D view unmount when the other is shown; their camera lived in component state and
// was lost, so 2D came back fitted and 3D came back on the aerial. This keeps both, per parcel, for
// the session (in memory: view-only, never saved with the plan).
//
//  - 2D: the world point at the centre of the canvas and the zoom, so a canvas that comes back at a
//    different size still centres on the same place (a pan offset alone would not).
//  - 3D: the camera position, target and lens, with the plan revision they were taken on.

export interface View2D {
  /** world (EPSG:3857) point at the canvas centre */
  centerX: number;
  centerY: number;
  zoom: number;
  /** the user moved the view (a resize then keeps it instead of fitting again) */
  userMoved: boolean;
}

export interface View3D {
  revision: string;
  review: boolean;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** the preset or custom view it was, and its stated basis */
  shot?: string;
  basis?: string;
}

const MAX = 24;
const views2d = new Map<string, View2D>();
const views3d = new Map<string, View3D>();

function put<V>(map: Map<string, V>, key: string, v: V): void {
  map.delete(key);
  map.set(key, v);
  while (map.size > MAX) map.delete(map.keys().next().value as string);
}

export function remember2D(parcel: string, v: View2D): void { put(views2d, parcel, v); }
export function recall2D(parcel: string): View2D | null { return views2d.get(parcel) ?? null; }
export function remember3D(parcel: string, v: View3D): void { put(views3d, parcel, v); }
export function recall3D(parcel: string): View3D | null { return views3d.get(parcel) ?? null; }
export function forgetViews(): void { views2d.clear(); views3d.clear(); }

/** The pan that puts a world point at the centre of a canvas of this size (the 2D viewport's convention: y up). */
export function panFor(v: Pick<View2D, 'centerX' | 'centerY' | 'zoom'>, width: number, height: number): { zoom: number; panX: number; panY: number } {
  return { zoom: v.zoom, panX: width / 2 - v.centerX * v.zoom, panY: height / 2 + v.centerY * v.zoom };
}

/** The world point at the centre of a canvas for this viewport. */
export function centerOf(vp: { zoom: number; panX: number; panY: number }, width: number, height: number): { centerX: number; centerY: number } {
  return { centerX: (width / 2 - vp.panX) / vp.zoom, centerY: -(height / 2 - vp.panY) / vp.zoom };
}
