// What a camera actually shows of a building (audit eb378b1, P0: "make camera tests use what the
// user sees"). A street or entry camera used to be accepted when a few rays from the eye reached the
// building's centre and corners past the tree crowns; the picture could still be mostly trees,
// fence and a neighbour. This draws the model the camera would draw, small and flat-coloured, and
// counts the building's pixels: how much of it falls in the picture, how much of that is not hidden,
// and what hides the rest, keeping planting and parked cars apart from built and ground blockers.
import * as THREE from 'three';
import type { Shot } from './shots';

export type HiddenBy = 'vegetation' | 'structures' | 'vehicles';

export interface Seen {
  /** The building measured (plan element id). */
  subject: string;
  /** Share of the building's outline that falls inside the picture, 0 to 1. */
  framed: number;
  /** Share of the building's outline in the picture that is not hidden, 0 to 1. */
  visible: number;
  /** Share of the building's outline in the picture hidden by each kind of thing. */
  hiddenBy: Record<HiddenBy, number>;
  /** Share of the picture the building takes up, 0 to 1. */
  coverage: number;
}

/** Accepted without comment: most of the building in the picture, and most of that in view. */
export const SEEN_GOOD = { visible: 0.6, framed: 0.85, coverage: 0.015 } as const;
/** Shown, but said to be partly hidden; below this the camera is not used. */
export const SEEN_FLOOR = { visible: 0.3, framed: 0.6, coverage: 0.006 } as const;
export type SeenBar = { visible: number; framed: number; coverage: number };
/** An entrance or garage view is close to one door of the building: it is not meant to hold all
 *  of it, so only what is in the picture is judged, and it must fill a fair part of it. */
export const CLOSE_BARS: { good: SeenBar; floor: SeenBar } = { good: { visible: 0.6, framed: 0, coverage: 0.05 }, floor: { visible: 0.3, framed: 0, coverage: 0.02 } };
export const WHOLE_BARS: { good: SeenBar; floor: SeenBar } = { good: SEEN_GOOD, floor: SEEN_FLOOR };

export function seenOk(s: Seen, bar: SeenBar = SEEN_GOOD): boolean {
  return s.visible >= bar.visible && s.framed >= bar.framed && s.coverage >= bar.coverage;
}

/** How a seen measurement compares: the better picture of the building first. */
export function seenScore(s: Seen, good: SeenBar = SEEN_GOOD): number {
  return s.visible * (good.framed > 0 ? Math.min(1, s.framed / good.framed) : 1) * Math.min(1, s.coverage / good.coverage);
}

/** The main thing hiding the building, if anything hides a noticeable part of it. */
export function mainBlocker(s: Seen): HiddenBy | null {
  const [kind, share] = (Object.entries(s.hiddenBy) as Array<[HiddenBy, number]>).sort((a, b) => b[1] - a[1])[0]!;
  return share >= 0.08 ? kind : null;
}

const BLOCKER_WORDS: Record<HiddenBy, string> = { vegetation: 'trees and planting', structures: 'buildings, walls or ground', vehicles: 'parked cars' };

/** The receipt line for a camera: the building, how much of it is seen, and what hides the rest. */
export function seenWords(s: Seen, label: string): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const hidden = (Object.entries(s.hiddenBy) as Array<[HiddenBy, number]>).filter(([, v]) => v >= 0.02).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${BLOCKER_WORDS[k]} hide ${pct(v)}`);
  return `${label}: ${pct(s.visible)} visible, ${pct(s.framed)} in frame${hidden.length ? `; ${hidden.join(', ')}` : ''}`;
}

/** Why none of the places tried shows the building, in words a reviewer can act on. */
export function unseenReason(best: Seen | null, tried: number, label: string, floor: SeenBar = SEEN_FLOOR): string {
  if (!best) return `${label} is not drawn in the model, so no camera could be checked against it`;
  const blocker = mainBlocker(best);
  if (best.visible >= floor.visible && best.coverage < floor.coverage) return `from the ${tried} eye-level place${tried === 1 ? '' : 's'} checked, ${label} is too small in the picture to show`;
  if (best.visible >= floor.visible && best.framed < floor.framed) return `from the ${tried} eye-level place${tried === 1 ? '' : 's'} checked, ${label} does not fit in the picture`;
  return `from the ${tried} eye-level place${tried === 1 ? '' : 's'} checked, at most ${Math.round(best.visible * 100)}% of ${label} is visible${blocker ? `: ${BLOCKER_WORDS[blocker]} hide the rest` : ''}`;
}

const COLOR: Record<HiddenBy | 'subject', THREE.Color> = {
  subject: new THREE.Color(1, 1, 1),
  structures: new THREE.Color(1, 0, 0),
  vegetation: new THREE.Color(0, 1, 0),
  vehicles: new THREE.Color(0, 0, 1),
};
const MAX_POINTS = 48;
/** How far past its walls a building's own parts reach (eaves, porch, stoop), metres. */
const MARGIN = 2.4;

interface ProbeUniforms {
  uPoly: { value: THREE.Vector2[] };
  uCount: { value: number };
  uBase: { value: number };
  uOnly: { value: number };
}

function probeMaterial(kind: HiddenBy, source: THREE.Material | undefined, u: ProbeUniforms): THREE.MeshBasicMaterial {
  const src = source as (THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null }) | undefined;
  const cut = !!src && (src.alphaTest > 0 || (src.transparent && !!(src.map || src.alphaMap)));
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...(cut ? { map: src!.map ?? null, alphaMap: src!.alphaMap ?? null, alphaTest: src!.alphaTest || 0.5 } : {}) });
  const tint = COLOR[kind];
  m.onBeforeCompile = shader => {
    // the kind is a uniform, not part of the program: one program serves all three kinds
    Object.assign(shader.uniforms, u, { uTint: { value: tint }, uMayBeMine: { value: kind === 'structures' ? 1 : 0 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vProbeWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvProbeWorld = (inverse(viewMatrix) * mvPosition).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vProbeWorld;
uniform vec2 uPoly[${MAX_POINTS}];
uniform int uCount;
uniform float uBase;
uniform float uOnly;
uniform vec3 uTint;
uniform float uMayBeMine;
bool probeInside(vec2 p) {
  bool inside = false;
  float near = 1e9;
  for (int i = 0; i < ${MAX_POINTS}; i++) {
    if (i >= uCount) break;
    vec2 a = uPoly[i];
    vec2 b = uPoly[i + 1 < uCount ? i + 1 : 0];
    if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    near = min(near, length(p - (a + ab * t)));
  }
  return inside || near < ${MARGIN.toFixed(2)};
}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
// model axes: x east, y north (stage -z), z up (stage y)
vec2 probeXY = vec2(vProbeWorld.x, -vProbeWorld.z);
bool probeMine = uMayBeMine > 0.5 && vProbeWorld.y > uBase + 0.3 && probeInside(probeXY);
if (uOnly > 0.5 && !probeMine) discard;
gl_FragColor = vec4(probeMine ? vec3(1.0) : uTint, 1.0);`);
  };
  m.customProgramCacheKey = () => `probe-${cut ? 'cut' : 'solid'}`;
  return m;
}

function kindOf(o: THREE.Object3D): HiddenBy {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.standsOnGround) return 'vegetation';
    if (p.name === 'parked-vehicles') return 'vehicles';
  }
  return 'structures';
}

const targets = new WeakMap<THREE.WebGLRenderer, THREE.WebGLRenderTarget>();

/**
 * Draw `root` from `camera` (as it stands, lens shift included) twice at a small size, with a view
 * twice as wide so the part of the building outside the picture is counted too: once as it is,
 * once with only the building. `outline` is the building's footprint (x east, y north, metres) and
 * `base` the level it stands on. Returns null if nothing of the building is drawn at all.
 */
export function measureSeen(
  renderer: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.PerspectiveCamera,
  subject: { id: string; outline: Array<[number, number]>; base: number }, width = 256,
): Seen | null {
  const aspect = camera.aspect * (camera.view?.enabled ? camera.view.fullHeight / camera.view.height : 1) || 16 / 9;
  const w = width, h = Math.max(16, Math.round(width / Math.max(0.3, aspect)));
  let rt = targets.get(renderer);
  if (!rt) { rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true }); targets.set(renderer, rt); }
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

  const pts = subject.outline.slice(0, MAX_POINTS);
  const poly = Array.from({ length: MAX_POINTS }, (_, i) => new THREE.Vector2(...(pts[i] ?? [0, 0])));
  const u: ProbeUniforms = { uPoly: { value: poly }, uCount: { value: pts.length }, uBase: { value: subject.base }, uOnly: { value: 0 } };
  const made = new Map<string, THREE.MeshBasicMaterial>();
  const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
  const hidden: THREE.Object3D[] = [];
  const kinds = new Map<THREE.Mesh, HiddenBy>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) {
      const r = o as THREE.Line & THREE.Points & THREE.Sprite;
      if ((r.isLine || r.isPoints || r.isSprite) && o.visible) { hidden.push(o); o.visible = false; }
      return;
    }
    if (!o.visible) return;
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // a contact shadow or a see-through overlay hides nothing
    if (src && (src.depthWrite === false || (src.transparent && src.opacity < 0.35 && !(src as THREE.MeshBasicMaterial).map))) { hidden.push(o); o.visible = false; return; }
    const kind = kindOf(o);
    const cut = !!src && (src.alphaTest > 0 || (src.transparent && !!((src as THREE.MeshBasicMaterial).map)));
    const key = cut ? `${kind}|${(src as THREE.MeshBasicMaterial).map?.uuid ?? 'none'}|${src!.alphaTest}` : kind;
    let m = made.get(key);
    if (!m) { m = probeMaterial(kind, cut ? src : undefined, u); made.set(key, m); }
    swapped.push([mesh, mesh.material]);
    kinds.set(mesh, kind);
    mesh.material = m;
  });

  // the picture's frustum, twice as wide and tall: the picture is the middle half of the probe
  const wide = camera.clone();
  wide.projectionMatrix.copy(new THREE.Matrix4().makeScale(0.5, 0.5, 1).multiply(camera.projectionMatrix));
  wide.projectionMatrixInverse.copy(wide.projectionMatrix).invert();
  wide.updateMatrixWorld(true);

  const prev = { target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate, xr: renderer.xr.enabled };
  const full = new Uint8Array(w * h * 4), only = new Uint8Array(w * h * 4);
  try {
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rt);
    u.uOnly.value = 0;
    renderer.render(root, wide);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, full);
    // only the building: the planting and cars are left out, the rest discards outside its outline
    for (const [mesh, kind] of kinds) if (kind !== 'structures') mesh.visible = false;
    u.uOnly.value = 1;
    renderer.render(root, wide);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, only);
    for (const [mesh, kind] of kinds) if (kind !== 'structures') mesh.visible = true;
  } finally {
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.clear, prev.alpha);
    renderer.autoClear = prev.auto;
    renderer.shadowMap.autoUpdate = prev.shadows;
    renderer.xr.enabled = prev.xr;
    for (const [mesh, mat] of swapped) mesh.material = mat;
    for (const o of hidden) o.visible = true;
    made.forEach(m => m.dispose());
  }
  return countSeen(full, only, w, h, subject.id);
}

const isWhite = (b: Uint8Array, i: number) => b[i]! > 200 && b[i + 1]! > 200 && b[i + 2]! > 200;

/** The counting, apart from the drawing (tested on its own): `full` the model as drawn, `only` the
 *  building alone, both w × h RGBA with the picture in the middle half. */
export function countSeen(full: Uint8Array, only: Uint8Array, w: number, h: number, subject: string): Seen | null {
  const x0 = Math.floor(w / 4), x1 = Math.ceil((w * 3) / 4), y0 = Math.floor(h / 4), y1 = Math.ceil((h * 3) / 4);
  let all = 0, inside = 0, seen = 0;
  const hiddenBy: Record<HiddenBy, number> = { vegetation: 0, structures: 0, vehicles: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!isWhite(only, i)) continue;
    all++;
    if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
    inside++;
    if (isWhite(full, i)) { seen++; continue; }
    const r = full[i]!, g = full[i + 1]!, b = full[i + 2]!;
    if (g > 128 && g >= r && g >= b) hiddenBy.vegetation++;
    else if (b > 128 && b >= r) hiddenBy.vehicles++;
    else hiddenBy.structures++;
  }
  if (!all) return null;
  const share = (n: number) => (inside ? n / inside : 0);
  return {
    subject,
    framed: inside / all,
    visible: share(seen),
    hiddenBy: { vegetation: share(hiddenBy.vegetation), structures: share(hiddenBy.structures), vehicles: share(hiddenBy.vehicles) },
    coverage: inside / ((x1 - x0) * (y1 - y0)),
  };
}

/** Of the places tried, the one to use: the first that shows the building well, else the best one
 *  that still shows it, else none (the view says why). Pure, for the tests. */
export function choosePlace<T>(tried: Array<{ shot: T; seen: Seen | null }>, bars = WHOLE_BARS): { pick: { shot: T; seen: Seen } | null; quality: 'good' | 'partial' | 'none'; best: Seen | null } {
  const measured = tried.filter((t): t is { shot: T; seen: Seen } => !!t.seen);
  const good = measured.find(t => seenOk(t.seen, bars.good));
  if (good) return { pick: good, quality: 'good', best: good.seen };
  const best = [...measured].sort((a, b) => seenScore(b.seen, bars.good) - seenScore(a.seen, bars.good))[0] ?? null;
  if (best && seenOk(best.seen, bars.floor)) return { pick: best, quality: 'partial', best: best.seen };
  return { pick: null, quality: 'none', best: best?.seen ?? null };
}

export type ShotWithSeen = Shot & { seen?: Seen };
