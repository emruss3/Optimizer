// The site as a lit, textured model: the same data the massing view draws
// (ui/massingData), turned into meshes with real materials. Buildings keep
// the footprints and heights of the plan; nothing here adds or moves one.
//
// The model is built with z up, in local metres, and stood up for the
// renderer (y up) by the root group.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MassingData } from '../ui/massingData';
import type { RenderSlab, RGBA, Surface } from '../ui/renderModel';
import { buildArchitecture, hashId, type ArchStyle } from '../ui/architecture';
import { buildingHeight } from '../scene/heights';
import { pointInPolygon } from '../scene/frame';
import { builtFocus, type Focus } from '../scene/builtFocus';
import { METERS_PER_FOOT } from '../../../engine/units';
import { Surfaces } from './textures';
import { Tree } from '@dgreenheck/ez-tree';

export interface SiteModel {
  root: THREE.Group;
  /** One unseen solid a building, for picking: `userData.id` is the plan element's id. */
  pick: THREE.Mesh[];
  /** Half the size of the plan, metres: what the lights and cameras frame. */
  extent: number;
  /** The parcel a camera should centre on and fit: its middle (x east, y north) and the radius that holds all of it, metres. */
  focus: { x: number; y: number; radius: number };
  /** The built part of the plan, where it is much smaller than the parcel; otherwise the parcel. */
  built: Focus;
  surfaces: Surfaces;
  /** Settles when the pictures the trees are made of have arrived (or after a few seconds without them): a still waits for it. */
  ready: Promise<void>;
  dispose(): void;
}

/** A texture's picture arrives some time after the texture is made. Settles when it has, or after six seconds. */
function arrived(texture: THREE.Texture | null | undefined): Promise<boolean> {
  return new Promise(resolve => {
    if (!texture) { resolve(false); return; }
    const t0 = Date.now();
    const look = () => {
      const img = texture.image as { complete?: boolean; naturalWidth?: number; width?: number } | undefined;
      if (img && img.complete !== false && (img.naturalWidth ?? img.width ?? 0) > 0) resolve(true);
      else if (Date.now() - t0 > 6000) resolve(false);
      else setTimeout(look, 40);
    };
    look();
  });
}

/** One grown tree, stood up for the model (z up), ready to be placed many times. */
interface TreeForm {
  wood: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  bark: THREE.Material;
  leaf: THREE.Material;
  leafDepth: THREE.Material;
  /** Its height and the radius of its crown, in its own units. */
  height: number;
  radius: number;
}

/**
 * Grow a tree with ez-tree: real branching and textured leaves. One of each
 * kind is grown for a model and placed many times, turned and sized. A shrub
 * is grown with few limbs: it is seen small, and there are many of them.
 */
function grow(preset: string, seed: number, opacity: number, shrub = false): TreeForm | null {
  try {
    const tree = new Tree();
    tree.loadPreset(preset);
    tree.options.seed = seed;
    const o = tree.options;
    const cap = (sections: number[], segments: number[]) => {
      for (const k of [0, 1, 2, 3] as const) {
        o.branch.sections[k] = Math.min(o.branch.sections[k], sections[k] ?? 3);
        o.branch.segments[k] = Math.min(o.branch.segments[k], segments[k] ?? 3);
      }
    };
    if (shrub) {
      o.branch.levels = Math.min(o.branch.levels, 2);
      cap([3, 2, 2, 2], [3, 3, 3, 3]);
      o.leaves.count = Math.max(3, Math.round(o.leaves.count * 0.7));
      o.leaves.size = o.leaves.size * 1.7;
    } else {
      // a tree in full leaf: larger leaves than the preset's, and limbs no finer than the eye can see
      cap([8, 6, 4, 3], [6, 5, 4, 3]);
      o.leaves.count = Math.round(o.leaves.count * 1.1);
      o.leaves.size = o.leaves.size * 2.1;
    }
    o.leaves.sizeVariance = Math.max(o.leaves.sizeVariance, 0.6);
    tree.generate();
    const wood = tree.branchesMesh.geometry.clone().rotateX(Math.PI / 2);
    const leaves = tree.leavesMesh.geometry.clone().rotateX(Math.PI / 2);
    leaves.computeBoundingBox();
    wood.computeBoundingBox();
    const lb = leaves.boundingBox as THREE.Box3, wb = wood.boundingBox as THREE.Box3;
    const height = Math.max(lb.max.z, wb.max.z);
    const radius = Math.max(lb.max.x, -lb.min.x, lb.max.y, -lb.min.y);
    const barkOf = tree.branchesMesh.material as THREE.MeshPhongMaterial;
    const leafOf = tree.leavesMesh.material as THREE.MeshPhongMaterial;
    const bark = new THREE.MeshStandardMaterial({ map: barkOf.map ?? null, color: barkOf.color, roughness: 1, metalness: 0 });
    const leaf = new THREE.MeshStandardMaterial({ map: leafOf.map ?? null, color: leafOf.color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, transparent: opacity < 1, opacity });
    // a leaf casts the shadow of its own outline, not of its card
    const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafOf.map ?? null, alphaTest: 0.5 });
    if (typeof window !== 'undefined' && (window as unknown as { __renderDebug?: boolean }).__renderDebug) {
      console.info(`[render] ${preset}${shrub ? ' (shrub)' : ''}: ${((wood.index?.count ?? wood.getAttribute('position').count) / 3) | 0} wood, ${((leaves.index?.count ?? leaves.getAttribute('position').count) / 3) | 0} leaf triangles`);
    }
    return { wood, leaves, bark, leaf, leafDepth, height, radius: Math.max(radius, 0.01) };
  } catch (err) {
    console.warn(`[render] tree "${preset}" could not be grown`, err);
    return null;
  }
}

/**
 * A grown tree's portrait, painted from its own leaves: the tree from the side
 * in the left half of the picture and from above in the right. Far off, a tree
 * is drawn as a few crossed cards carrying this picture, which costs almost
 * nothing, so the surroundings can be as wooded as a real neighbourhood. The
 * leaves' picture arrives a moment after the tree is grown; the portrait is
 * painted when it has.
 */
function portrait(form: TreeForm): { picture: THREE.DataTexture; painted: Promise<void> } | null {
  if (typeof document === 'undefined') return null;
  const leafOf = form.leaf as THREE.MeshStandardMaterial;
  if (!leafOf.map) return null;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S * 2;
  canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const pixels = new Uint8Array(S * 2 * S * 4);
  const texture = new THREE.DataTexture(pixels, S * 2, S, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  const paint = () => {
    const img = leafOf.map?.image as HTMLImageElement | undefined;
    if (!img) return;
    const started = performance.now();
    // the leaf picture in four strengths of light, in the tree's own green
    const tint = leafOf.color;
    const shades = [0.62, 0.86, 1.1, 1.36].map(k => {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const x = c.getContext('2d');
      if (!x) return c;
      x.drawImage(img, 0, 0, 48, 48);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = `rgb(${Math.min(255, Math.round(tint.r * 255 * k * 1.25))},${Math.min(255, Math.round(tint.g * 255 * k * 1.25))},${Math.min(255, Math.round(tint.b * 255 * k * 1.25))})`;
      x.fillRect(0, 0, 48, 48);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(img, 0, 0, 48, 48);
      return c;
    });
    // one card to a leaf: its middle and its size
    const p = form.leaves.getAttribute('position') as THREE.BufferAttribute;
    const leaves: Array<[number, number, number, number]> = [];
    for (let i = 0; i + 7 < p.count; i += 8) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2) + p.getX(i + 3)) / 4, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2) + p.getY(i + 3)) / 4, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2) + p.getZ(i + 3)) / 4;
      leaves.push([x, y, z, Math.hypot(p.getX(i + 2) - p.getX(i), p.getY(i + 2) - p.getY(i), p.getZ(i + 2) - p.getZ(i)) / 1.41]);
    }
    ctx.clearRect(0, 0, S * 2, S);
    const M = Math.max(form.height, form.radius * 2), k = (S - 6) / M;
    // the trunk, then the leaves from the back to the front; lower and further ones are in shade
    ctx.strokeStyle = '#4a3a2c';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, form.radius * k * 0.09);
    ctx.beginPath(); ctx.moveTo(S / 2, S - 2); ctx.lineTo(S / 2, S - 2 - form.height * k * 0.5); ctx.stroke();
    const put = (u: number, v: number, size: number, light: number, turn: number) => {
      const shade = shades[Math.max(0, Math.min(3, Math.round(light * 3)))] as HTMLCanvasElement;
      ctx.save();
      ctx.translate(u, v);
      ctx.rotate(turn);
      ctx.drawImage(shade, -size / 2, -size / 2, size, size);
      ctx.restore();
    };
    leaves.sort((a, b) => b[1] - a[1]).forEach(([x, y, z, size], i) => {
      const light = 0.2 + 0.55 * (z / form.height) + 0.1 * (-x / form.radius) + 0.25 * (0.5 - y / (2 * form.radius)) + ((i * 37) % 10) / 60;
      put(S / 2 + x * k, S - 3 - z * k, size * k * 1.2, light, (i * 2.4) % 6.28);
    });
    // from above the crown is lit much as its sides are, so the card that lies in it does not stand out
    const kt = (S - 6) / (form.radius * 2);
    leaves.sort((a, b) => a[2] - b[2]).forEach(([x, y, z, size], i) => {
      put(S + S / 2 + x * kt, S / 2 - y * kt, size * kt * 1.2, 0.15 + 0.6 * (z / form.height) + ((i * 37) % 10) / 60, (i * 2.4) % 6.28);
    });
    // into the texture, bottom row first; where nothing is painted the colour is the leaves' own,
    // so the picture has no dark edge when it is seen small
    const data = ctx.getImageData(0, 0, S * 2, S).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i + 3] ?? 0) > 200) { r += data[i] ?? 0; g += data[i + 1] ?? 0; b += data[i + 2] ?? 0; n++; }
    const mean = n ? [r / n, g / n, b / n] : [70, 100, 50];
    for (let row = 0; row < S; row++) {
      for (let col = 0; col < S * 2; col++) {
        const from = ((S - 1 - row) * S * 2 + col) * 4, to = (row * S * 2 + col) * 4;
        const a = data[from + 3] ?? 0;
        pixels[to] = a < 12 ? (mean[0] ?? 0) : (data[from] ?? 0);
        pixels[to + 1] = a < 12 ? (mean[1] ?? 0) : (data[from + 1] ?? 0);
        pixels[to + 2] = a < 12 ? (mean[2] ?? 0) : (data[from + 2] ?? 0);
        pixels[to + 3] = a;
      }
    }
    texture.needsUpdate = true;
    if ((window as unknown as { __renderDebug?: boolean }).__renderDebug) console.info(`[time] portrait of ${leaves.length} leaves painted in ${Math.round(performance.now() - started)} ms`);
  };
  return { picture: texture, painted: arrived(leafOf.map).then(ok => { if (ok) paint(); }) };
}

/**
 * The cards a portrait is carried on: three upright ones crossed at the trunk
 * and one lying in the crown. Each is drawn from both sides and lit as the
 * ground is, whichever way it faces.
 */
function cards(form: TreeForm): THREE.BufferGeometry {
  const M = Math.max(form.height, form.radius * 2), R = form.radius * 0.86;
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], u0: number, u1: number) => {
    const corners: Array<[number[], number, number]> = [[a, u0, 0], [b, u1, 0], [c, u1, 1], [d, u0, 1]];
    for (const order of [[0, 1, 2, 0, 2, 3], [0, 2, 1, 0, 3, 2]]) {
      for (const i of order) {
        const [q, u, v] = corners[i] as [number[], number, number];
        pos.push(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0);
        uv.push(u, v);
        nor.push(0, 0, 1);
      }
    }
  };
  for (const deg of [0, 60, 120]) {
    const a = (deg * Math.PI) / 180, cx = (Math.cos(a) * M) / 2, cy = (Math.sin(a) * M) / 2;
    quad([-cx, -cy, 0], [cx, cy, 0], [cx, cy, M], [-cx, -cy, M], 0, 0.5);
  }
  const z = form.height * 0.52;
  quad([-R, -R, z], [R, -R, z], [R, R, z], [-R, R, z], 0.5, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export interface SiteModelOptions {
  /** Canopies let the ground show through a little: for a plan seen from above. */
  canopyOpacity?: number;
  /** Leave the existing neighbourhood out. */
  noContext?: boolean;
  /** Show the existing buildings as plain white solids on a bare ground: for
   *  a plan seen from above, where the surroundings must not compete. */
  clayContext?: boolean;
  /** The plan for review, not for show: the proposal in its materials, the neighbours as plain
   *  white solids, no trees to hide it, and the parcel line, the buildable envelope and the
   *  access drawn on the ground. */
  review?: boolean;
  /** A lighter model of the same plan, for a device that draws on its processor
   *  (render3d/quality): the site's trees as painted cards, no shrubs, plain neighbours. */
  light?: boolean;
}

/** The style the existing houses round a site are drawn in: ordinary, and not the scheme's own. */
const NEIGHBOUR_STYLE: ArchStyle = 'heritage';

const linear = (c: readonly number[]): THREE.Color => new THREE.Color().setRGB((c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255, THREE.SRGBColorSpace);
/** A tint that may be brighter than white: a plain multiplier on what it colours. */
const bright = (c: readonly number[]): THREE.Color => new THREE.Color((c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255);

function paint(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A four-cornered solid, built directly: most parts of a building are one. */
function box(q: Array<[number, number]>, z0: number, h: number): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = q[i] as [number, number], b = q[(i + 1) % 4] as [number, number]; area += a[0] * b[1] - b[0] * a[1]; }
  const r = area < 0 ? [q[3], q[2], q[1], q[0]] as Array<[number, number]> : q;
  const z1 = z0 + h;
  const pos = new Float32Array(108), nor = new Float32Array(108), uv = new Float32Array(72);
  let v = 0;
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, s: number, t: number) => {
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
    uv[v * 2] = s; uv[v * 2 + 1] = t;
    v++;
  };
  let run = 0;
  for (let i = 0; i < 4; i++) {
    const a = r[i] as [number, number], b = r[(i + 1) % 4] as [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
    const nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
    vert(a[0], a[1], z0, nx, ny, 0, run, z0); vert(b[0], b[1], z0, nx, ny, 0, run + len, z0); vert(b[0], b[1], z1, nx, ny, 0, run + len, z1);
    vert(a[0], a[1], z0, nx, ny, 0, run, z0); vert(b[0], b[1], z1, nx, ny, 0, run + len, z1); vert(a[0], a[1], z1, nx, ny, 0, run, z1);
    run += len;
  }
  const [a, b, c, d] = r as [[number, number], [number, number], [number, number], [number, number]];
  for (const [p0, p1, p2] of [[a, b, c], [a, c, d]] as Array<Array<[number, number]>>) {
    for (const p of [p0, p1, p2] as Array<[number, number]>) vert(p[0], p[1], z1, 0, 0, 1, p[0], p[1]);
    for (const p of [p0, p2, p1] as Array<[number, number]>) vert(p[0], p[1], z0, 0, 0, -1, p[0], p[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const signed = (pts: THREE.Vector2[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i] as THREE.Vector2, q = pts[(i + 1) % pts.length] as THREE.Vector2; a += p.x * q.y - q.x * p.y; }
  return a;
};

/** A footprint (rings of [x, y, z], courts kept) raised by `h` from its own z. */
function prism(rings: number[][][], h: number): THREE.BufferGeometry | null {
  const ring = (r: number[][]) => {
    const pts = r.map(p => new THREE.Vector2(p[0] ?? 0, p[1] ?? 0));
    const a = pts[0], b = pts[pts.length - 1];
    if (a && b && pts.length > 3 && a.distanceTo(b) < 1e-6) pts.pop();
    return pts;
  };
  const outer = rings[0];
  if (!outer || outer.length < 3 || h <= 0) return null;
  const first = ring(outer);
  if (rings.length === 1 && first.length === 4) return box(first.map(p => [p.x, p.y] as [number, number]), outer[0]?.[2] ?? 0, h);
  const shape = new THREE.Shape(first);
  const turn = Math.sign(signed(first));
  for (const hole of rings.slice(1)) {
    if (hole.length < 3) continue;
    // a court must run the other way round from the outline, or its walls face into the solid
    const pts = ring(hole);
    shape.holes.push(new THREE.Path(Math.sign(signed(pts)) === turn ? pts.reverse() : pts));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.translate(0, 0, outer[0]?.[2] ?? 0);
  g.clearGroups();
  return g;
}

/**
 * The gaps between parcels that are streets: for each parcel edge, a strip
 * reaching out to the parcel that faces it, where one does within `maxM`.
 * Edges that share a line with a neighbour, or face open land, get none.
 */
export function streetGaps(rings: number[][][], maxM = 32): number[][][] {
  const parcels = rings
    .filter(r => r.length >= 3)
    .map(r => {
      const xs = r.map(p => p[0] ?? 0), ys = r.map(p => p[1] ?? 0);
      return { ring: r, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    });
  const owner = (x: number, y: number, skip: number): number =>
    parcels.findIndex((q, j) => j !== skip && x >= q.minX && x <= q.maxX && y >= q.minY && y <= q.maxY && pointInPolygon(x, y, [q.ring as never]));
  const out: number[][][] = [];
  parcels.forEach((q, i) => {
    const r = q.ring;
    let area = 0;
    for (let k = 0; k < r.length; k++) { const a = r[k]!, b = r[(k + 1) % r.length]!; area += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0); }
    const sign = area > 0 ? 1 : -1;
    for (let k = 0; k < r.length; k++) {
      const a = r[k]!, b = r[(k + 1) % r.length]!;
      const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 0, by = b[1] ?? 0;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 3) continue;
      // outward normal of the edge
      const nx = (sign * (by - ay)) / len, ny = (-sign * (bx - ax)) / len;
      let reach = 0;
      for (const t of [0.25, 0.5, 0.75]) {
        const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
        // a neighbour right against the edge: a lot line, not a street
        if (owner(mx + nx * 2, my + ny * 2, i) >= 0) continue;
        for (let d = 6; d <= maxM; d += 2) {
          const facing = owner(mx + nx * d, my + ny * d, i);
          // each gap is paved once, from the parcel listed first
          if (facing >= 0) { if (facing > i) reach = Math.max(reach, d); break; }
        }
      }
      if (reach > 0) {
        // run on past both ends by the street's width, so crossings are paved too; parcels are drawn over it
        const ux = ((bx - ax) / len) * reach, uy = ((by - ay) / len) * reach;
        out.push([[ax - ux, ay - uy], [bx + ux, by + uy], [bx + ux + nx * reach, by + uy + ny * reach], [ax - ux + nx * reach, ay - uy + ny * reach]]);
      }
    }
  });
  return out;
}

/** A flat, convex polygon in space, with texture coordinates in metres along its first edge. */
function plane(points: number[][]): THREE.BufferGeometry | null {
  if (points.length < 3) return null;
  const v = points.map(p => new THREE.Vector3(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0));
  const o = v[0] as THREE.Vector3;
  const u = (v[1] as THREE.Vector3).clone().sub(o).normalize();
  const n = new THREE.Vector3().crossVectors(u, (v[2] as THREE.Vector3).clone().sub(o)).normalize();
  const w = new THREE.Vector3().crossVectors(n, u);
  const pos: number[] = [], uv: number[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    for (const p of [o, v[i] as THREE.Vector3, v[i + 1] as THREE.Vector3]) {
      pos.push(p.x, p.y, p.z);
      const d = p.clone().sub(o);
      uv.push(d.dot(u), d.dot(w));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A line drawn `width` wide on the ground at height `z`, joints rounded. */
function ribbon(path: number[][], width: number, z: number): THREE.BufferGeometry | null {
  const pos: number[] = [], uv: number[] = [];
  const hw = width / 2;
  let run = 0;
  const tri = (a: number[], b: number[], c: number[]) => { for (const p of [a, b, c]) { pos.push(p[0] ?? 0, p[1] ?? 0, z); uv.push(p[2] ?? 0, p[3] ?? 0); } };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (!a || !b) continue;
    const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 0, by = b[1] ?? 0;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-4) continue;
    const nx = (-(by - ay) / len) * hw, ny = ((bx - ax) / len) * hw;
    const p0 = [ax + nx, ay + ny, run, width], p1 = [ax - nx, ay - ny, run, 0];
    const p2 = [bx - nx, by - ny, run + len, 0], p3 = [bx + nx, by + ny, run + len, width];
    tri(p0, p1, p2); tri(p0, p2, p3);
    // a disc at the joint closes the gap on the outside of a bend
    for (let k = 0; k < 10; k++) {
      const t0 = (k * Math.PI) / 5, t1 = ((k + 1) * Math.PI) / 5;
      tri([bx, by, run + len, hw], [bx + Math.cos(t0) * hw, by + Math.sin(t0) * hw, run + len + Math.cos(t0) * hw, hw + Math.sin(t0) * hw], [bx + Math.cos(t1) * hw, by + Math.sin(t1) * hw, run + len + Math.cos(t1) * hw, hw + Math.sin(t1) * hw]);
    }
    run += len;
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A crown of leaves: five lobes, each a lumpy ball, shaded darker underneath. */
function crown(): THREE.BufferGeometry {
  const lobes: Array<[number, number, number, number]> = [[0, 0, 0, 1], [0.56, 0.18, 0.1, 0.66], [-0.5, 0.3, -0.04, 0.64], [0.12, -0.56, 0.16, 0.62], [-0.16, 0.1, 0.56, 0.66], [0.2, 0.46, -0.3, 0.5]];
  const parts = lobes.map(([x, y, z, r], k) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const f = 1 + 0.11 * Math.sin(vx * 9.1 + k) * Math.cos(vy * 7.3 + k * 2) + 0.07 * Math.sin(vz * 11.7 + k * 3);
      p.setXYZ(i, vx * f + x, vy * f + y, vz * f * 0.86 + z);
    }
    return g;
  });
  // welded, so each lobe is lit as a round form and not as flat facets
  const welded = parts.map(p => { const w = mergeVertices(p.deleteAttribute('normal').deleteAttribute('uv'), 1e-3); w.computeVertexNormals(); return w; });
  const g = mergeGeometries(welded, false) as THREE.BufferGeometry;
  parts.forEach(p => p.dispose());
  welded.forEach(p => p.dispose());
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getZ(i) + 0.9) / 1.9));
    const v = 0.42 + 0.58 * t * t;           // the underside of a crown is in its own shade
    c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

const SITE: Record<string, { surface: Surface; color: RGBA }> = {
  street: { surface: 'asphalt', color: [118, 118, 120, 255] },
  drive: { surface: 'asphalt', color: [128, 128, 130, 255] },
  'parking-aisle': { surface: 'asphalt', color: [128, 128, 130, 255] },
  circulation: { surface: 'asphalt', color: [128, 128, 130, 255] },
  parking: { surface: 'asphalt', color: [140, 140, 142, 255] },
  'parking-bay': { surface: 'asphalt', color: [140, 140, 142, 255] },
  driveway: { surface: 'concrete', color: [206, 202, 192, 255] },
  greenspace: { surface: 'grass', color: [122, 142, 94, 255] },
};
const LAWN: RGBA = [130, 148, 100, 255];
const WALK: RGBA = [214, 210, 200, 255];

/** Build the model. `data` is what the massing view already computes. */
export function buildSiteModel(data: MassingData, opts: SiteModelOptions = {}): SiteModel {
  const debug = typeof window !== 'undefined' && !!(window as unknown as { __renderDebug?: boolean }).__renderDebug;
  const t0 = debug ? performance.now() : 0;
  const lap = (what: string) => { if (debug) console.info(`[time] model: ${what} at ${Math.round(performance.now() - t0)} ms`); };
  const surfaces = new Surfaces();
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;          // z up in the model, y up on the stage
  const bins = new Map<string, THREE.BufferGeometry[]>();
  const put = (key: string, g: THREE.BufferGeometry | null, color: readonly number[]) => {
    if (!g) return;
    const list = bins.get(key) ?? [];
    list.push(paint(g.index ? g.toNonIndexed() : g, linear(color)));
    bins.set(key, list);
  };

  // ground: a wide plate that runs out into the haze, then the neighbourhood on it
  const real = !opts.clayContext && !opts.review;
  const reach = Math.max(1600, data.extent * 16);
  put('plain|ground', plane([[-reach, -reach, -0.02], [reach, -reach, -0.02], [reach, reach, -0.02], [-reach, reach, -0.02]]), real ? [118, 134, 94, 255] : [176, 186, 152, 255]);
  // Public streets. The record gives the neighbouring parcels, and often no street lines: a gap
  // between two parcels is right of way. A road-coloured strip is laid across each such gap, so
  // the streets read even where no line was sent. Open land beside a parcel is not a street: a
  // strip is laid only where another parcel faces the edge within a street's width.
  if (!opts.noContext) {
    const streetColor = opts.review || opts.clayContext ? [176, 178, 180, 255] : [120, 120, 122, 255];
    const streetKey = opts.review || opts.clayContext ? 'plain|flat' : 'asphalt|flat';
    for (const q of streetGaps([
      ...data.contextPolygons.filter(c => c.elevation < 1).map(c => c.polygon[0] ?? []),
      ...(data.lawn[0]?.polygon[0] ? [data.lawn[0].polygon[0]] : []),
    ])) put(streetKey, plane(q.map(p => [p[0] ?? 0, p[1] ?? 0, -0.005])), streetColor);
  }
  const neighbours: Array<{ ring: number[][]; minX: number; minY: number; maxX: number; maxY: number }> = [];
  // how far from the middle of the site a neighbour is still drawn with its windows and roof
  const detailReach = Math.max(110, data.extent * 0.95);
  const FAR_WALLS: RGBA[] = [[206, 196, 176, 255], [186, 180, 170, 255], [150, 104, 88, 255], [198, 192, 184, 255], [164, 170, 172, 255], [214, 206, 188, 255]];
  if (!opts.noContext) {
    const streets: Array<[number, number]> = data.roads.flatMap(r => r.path.map(p => [p[0] ?? 0, p[1] ?? 0] as [number, number]));
    data.contextPolygons.forEach((c, n) => {
      const ring = c.polygon[0];
      if (!ring) return;
      const flat = ring.map(p => [p[0] ?? 0, p[1] ?? 0]);
      if (c.elevation < 1) {
        put('grass|flat', prism([flat.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], 0.03), real ? [126, 144, 98, 255] : [170, 184, 142, 255]);
        return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, area = 0;
      flat.forEach((p, k) => {
        const q0 = flat[(k + 1) % flat.length] ?? p;
        area += (p[0] ?? 0) * (q0[1] ?? 0) - (q0[0] ?? 0) * (p[1] ?? 0);
        minX = Math.min(minX, p[0] ?? 0); maxX = Math.max(maxX, p[0] ?? 0); minY = Math.min(minY, p[1] ?? 0); maxY = Math.max(maxY, p[1] ?? 0);
      });
      neighbours.push({ ring: flat, minX, minY, maxX, maxY });
      if (!real) {
        put('plain|solid', prism([flat.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], c.elevation), [238, 235, 228, 255]);
        return;
      }
      // far from the site, and everywhere on a device that draws on its processor, a neighbour
      // is its footprint at its height under a dark roof
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      if (opts.light || Math.max(Math.abs(cx), Math.abs(cy)) > detailReach) {
        const wall = FAR_WALLS[hashId(`existing-${n}`) % FAR_WALLS.length] ?? [196, 190, 182, 255];
        put(`${wall[0] === 150 ? 'brick' : 'siding'}|solid`, prism([flat.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], c.elevation), wall);
        put('shingle|solid', prism([flat.map(p => [p[0] ?? 0, p[1] ?? 0, c.elevation])], 0.4), [84, 82, 84, 255]);
        return;
      }
      // the public record gives a footprint and a story count. A small
      // four-cornered one is drawn as a house; anything else as a plain
      // building with a dark roof. How they look is illustration.
      const stories = Math.max(1, Math.round((c.elevation / METERS_PER_FOOT - 4) / 10));
      const a = Math.abs(area / 2);
      if (flat.length === 5 && a > 35 && a < 520) {
        const built = buildArchitecture(`existing-${n}`, 'Existing building', [flat], 'house', buildingHeight('house', Math.min(stories, 3)), streets, 2, NEIGHBOUR_STYLE);
        for (const sl of built.slabs) put(`${sl.surface ?? 'plain'}|solid`, prism(sl.polygon, sl.elevation), sl.color);
        for (const f of built.flats) put(`${f.surface ?? 'plain'}|sheet`, plane(f.polygon), f.color);
        for (const w of built.glass) put('glass|sheet', plane(w.polygon), w.color);
        return;
      }
      // a house the record draws with more corners keeps its footprint under a hipped roof; a larger
      // building is drawn plainly at its height, walls with windows under a parapet
      const large = a < 520 && stories <= 2
        ? buildArchitecture(`existing-${n}`, 'Existing building', [flat], 'existing', buildingHeight('house', stories))
        : buildArchitecture(`existing-${n}`, 'Existing building', [flat], 'other', buildingHeight('existing', stories), streets, 2.4, hashId(`existing-${n}`) % 3 === 0 ? 'modern' : NEIGHBOUR_STYLE);
      for (const sl of large.slabs) put(`${sl.surface ?? 'plain'}|solid`, prism(sl.polygon, sl.elevation), sl.color);
      for (const f of large.flats) put(`${f.surface ?? 'plain'}|sheet`, plane(f.polygon), f.color);
      for (const w of large.glass) put('glass|sheet', plane(w.polygon), w.color);
    });
  }
  for (const r of data.roads) {
    put('concrete|flat', ribbon(r.path, 13.4, 0.05), WALK);
    put('grass|flat', ribbon(r.path, 10.6, 0.09), [130, 148, 100, 255]);
    put('asphalt|flat', ribbon(r.path, 7.3, 0.13), [112, 112, 114, 255]);
    put('plain|flat', ribbon(r.path, 0.14, 0.15), [214, 176, 72, 255]);
  }

  // the site
  for (const l of data.lawn) {
    const ring = l.polygon[0];
    // in review the parcel is lighter than the land round it, so there is no doubt which one it is
    if (ring) put('grass|flat', prism([ring.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], 0.17), opts.review ? [214, 224, 170, 255] : LAWN);
  }
  // a subdivision's lots: each yard its own shade of lawn, and a board fence round the back of it.
  // Illustration: the plan draws a lot line, not a fence.
  if (data.lots.length && !opts.review) {
    const pads = data.polygons.filter(p => p.building).map(p => (p.polygon[0] ?? []).map(q => [q[0] ?? 0, q[1] ?? 0] as [number, number]));
    const paved: Array<[number, number]> = data.polygons.filter(p => !p.building && SITE[p.kind ?? ''] && SITE[p.kind ?? '']?.surface !== 'grass').flatMap(p => (p.polygon[0] ?? []).map(q => [q[0] ?? 0, q[1] ?? 0] as [number, number]));
    const middle = (r: Array<[number, number]>): [number, number] => { const n = Math.max(1, r.length); return [r.reduce((a, q) => a + q[0], 0) / n, r.reduce((a, q) => a + q[1], 0) / n]; };
    const FENCE: RGBA = [156, 132, 104, 255];
    const built = new Set<string>();
    data.lots.forEach((lot, i) => {
      const ring = lot.map(q => [q[0] ?? 0, q[1] ?? 0] as [number, number]);
      const t = 0.94 + ((i * 37) % 13) / 100;
      put('grass|flat', prism([ring.map(q => [q[0], q[1], 0])], 0.19), [LAWN[0] * t, LAWN[1] * (t + ((i * 11) % 5 - 2) / 100), LAWN[2] * t, 255]);
      const pad = pads.find(r => r.length >= 3 && pointInPolygon(middle(r)[0], middle(r)[1], [ring]));
      if (!pad || !paved.length) return;
      // the house faces the nearest pavement; the fence stands on the lot lines behind the middle of the house
      const c = middle(pad);
      let near = paved[0] as [number, number], best = Infinity;
      for (const q of paved) { const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2; if (d < best) { best = d; near = q; } }
      const fl = Math.hypot(near[0] - c[0], near[1] - c[1]) || 1, fx = (near[0] - c[0]) / fl, fy = (near[1] - c[1]) / fl;
      for (let k = 0; k < ring.length - 1; k++) {
        const a = ring[k] as [number, number], b = ring[k + 1] as [number, number];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        const parts = Math.max(1, Math.round(len / 2.4)), nx = (-(b[1] - a[1]) / len) * 0.045, ny = ((b[0] - a[0]) / len) * 0.045;
        for (let j = 0; j < parts; j++) {
          const p0: [number, number] = [a[0] + ((b[0] - a[0]) * j) / parts, a[1] + ((b[1] - a[1]) * j) / parts];
          const p1: [number, number] = [a[0] + ((b[0] - a[0]) * (j + 1)) / parts, a[1] + ((b[1] - a[1]) * (j + 1)) / parts];
          const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
          if ((mx - c[0]) * fx + (my - c[1]) * fy > -1.5) continue;
          if (paved.some(q => (q[0] - mx) ** 2 + (q[1] - my) ** 2 < 9)) continue;
          const key = `${Math.round(mx * 2)},${Math.round(my * 2)}`;
          if (built.has(key)) continue;
          built.add(key);
          put('wood|solid', prism([[[p0[0] + nx, p0[1] + ny, 0.17], [p1[0] + nx, p1[1] + ny, 0.17], [p1[0] - nx, p1[1] - ny, 0.17], [p0[0] - nx, p0[1] - ny, 0.17]]], 1.75), FENCE);
        }
      }
    });
  }
  for (const w of data.walks) {
    put('concrete|flat', ribbon(w.path, w.widthM, 0.21), WALK);
    if (w.strip) put('grass|flat', ribbon(w.path, w.widthM / 2, 0.25), LAWN);
  }
  for (const p of data.polygons) {
    if (p.building) continue;
    const m = SITE[p.kind ?? ''];
    if (!m) continue;
    put(`${m.surface}|flat`, prism(p.polygon.map(r => r.map(q => [q[0] ?? 0, q[1] ?? 0, 0])), m.surface === 'grass' ? 0.27 : 0.3), m.color);
  }
  // in review the edges of the streets and drives are drawn in amber: the access is what is being checked
  for (const c of data.curbs) put(opts.review ? 'plain|flat' : 'concrete|flat', ribbon(c.path, opts.review ? 0.45 : 0.2, 0.36), opts.review ? [234, 138, 30, 255] : [226, 223, 214, 255]);
  // and the parcel line and the buildable envelope are drawn on the ground
  if (opts.review) for (const g of data.groundPaths) put('plain|flat', ribbon(g.path, Math.max(0.5, g.widthM * 1.1), 0.42), g.color);
  for (const s of data.stripes) put('plain|flat', ribbon(s.path, 0.12, 0.33), [244, 244, 240, 255]);

  // buildings: walls and roofs in their materials, glass apart
  for (const s of data.slabs) put(`${s.surface ?? 'plain'}|solid`, prism(s.polygon, s.elevation), s.color);
  for (const f of data.roofs) put(`${f.surface ?? 'plain'}|sheet`, plane(f.polygon), f.color);
  for (const w of data.windows) put('glass|sheet', plane(w.polygon), w.color);
  for (const c of data.cars) put(c.elevation > 0.6 ? 'paint|solid' : 'glass|solid', prism(c.polygon, c.elevation), c.color);

  lap(`${[...bins.values()].reduce((n, l) => n + l.length, 0)} parts made`);
  for (const [key, list] of bins) {
    const [kind, mode] = key.split('|') as [string, string];
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) continue;
    let material = kind === 'glass' ? surfaces.glass() : kind === 'paint' ? surfaces.paint() : surfaces.get(kind as Surface);
    const see = kind === 'railing' || kind === 'glassrail';
    if (mode === 'sheet' && !see) {
      const single = material as THREE.MeshStandardMaterial, both = material.clone() as THREE.MeshStandardMaterial;
      both.side = THREE.DoubleSide;
      material = both;
      // the two-sided copy takes the photographed surface when the one it was copied from does
      void Promise.all(surfaces.pending).then(() => {
        if (both.map === single.map) return;
        both.map = single.map; both.bumpMap = single.bumpMap; both.normalMap = single.normalMap;
        if (single.normalScale) both.normalScale = single.normalScale.clone();
        both.needsUpdate = true;
      });
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = !see && (mode === 'solid' || mode === 'sheet');
    if (see) mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.name = key;
    root.add(mesh);
  }

  lap('parts merged');
  // planting: a few grown trees (ez-tree), each placed many times, turned and
  // sized to the canopy the scene gives it. If none can be grown, the lobed
  // crown stands in.
  const opacity = opts.canopyOpacity ?? 1;
  const kinds = ['Ash Medium', 'Oak Medium', 'Ash Large', 'Oak Small', 'Ash Small'].map((p, i) => grow(p, 1200 + i * 37, opacity)).filter((t): t is TreeForm => !!t);
  const cardsOnly = !!opts.light && typeof document !== 'undefined';
  const bushes = cardsOnly ? [] : ['Bush 1', 'Bush 3', 'Bush 1'].map((p, i) => grow(p, 400 + i * 11, 1, true)).filter((t): t is TreeForm => !!t);
  // the leaves and bark are pictures that arrive after the trees are grown
  const waits: Array<Promise<unknown>> = [...kinds, ...bushes].flatMap(t => [arrived((t.leaf as THREE.MeshStandardMaterial).map), arrived((t.bark as THREE.MeshStandardMaterial).map)]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1);
  const place = (forms: TreeForm[], items: Array<{ x: number; y: number; r: number; tint?: readonly number[] }>, z: number, shadows = true) => {
    forms.forEach((form, k) => {
      const mine = items.filter((_, i) => i % forms.length === k);
      if (!mine.length) return;
      const wood = new THREE.InstancedMesh(form.wood, form.bark, mine.length);
      const leaves = new THREE.InstancedMesh(form.leaves, form.leaf, mine.length);
      mine.forEach((t, i) => {
        const sc = (t.r / form.radius) * (0.92 + ((i * 37) % 17) / 100);
        q.setFromAxisAngle(up, (i * 2.399 + k) % (Math.PI * 2));
        m4.compose(new THREE.Vector3(t.x, t.y, z), q, new THREE.Vector3(sc, sc, sc));
        wood.setMatrixAt(i, m4);
        leaves.setMatrixAt(i, m4);
        if (t.tint) leaves.setColorAt(i, linear(t.tint));
      });
      wood.castShadow = leaves.castShadow = shadows;
      wood.receiveShadow = leaves.receiveShadow = shadows;
      leaves.customDepthMaterial = form.leafDepth;
      root.add(wood, leaves);
    });
  };
  // Trees as painted cards: portraits of the grown trees on crossed quads. The surroundings are
  // planted this way everywhere, and the site's own trees too on a device that draws on its processor.
  let sat: Array<{ form: TreeForm; picture: THREE.DataTexture }> | null = null;
  const sitters = () => (sat ??= kinds.flatMap(form => { const made = portrait(form); if (made) waits.push(made.painted); return made ? [{ form, picture: made.picture }] : []; }));
  // cards are lit as flat ground is, which under a low sun is less than a crown catches: the tints make up for it
  const TINTS: Array<readonly number[]> = [[255, 255, 255], [214, 236, 204], [232, 232, 200], [196, 226, 196], [236, 244, 216], [204, 222, 190], [182, 214, 182]].map(c => c.map(v => v * 1.12));
  const plant = (spots: Array<[number, number, number]>, name: string, shadows: boolean) => {
    const all = sitters();
    all.forEach(({ form, picture }, k) => {
      const mine = spots.filter((_, i) => i % all.length === k);
      if (!mine.length) return;
      const mesh = new THREE.InstancedMesh(cards(form), new THREE.MeshLambertMaterial({ map: picture, alphaTest: 0.5 }), mine.length);
      mine.forEach(([x, y, r], i) => {
        const sc = ((r * 1.25) / form.radius) * (0.9 + ((i * 37) % 21) / 100);
        q.setFromAxisAngle(up, (i * 2.399 + k) % (Math.PI * 2));
        mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, 0.02), q, new THREE.Vector3(sc, sc, sc * (0.92 + ((i * 13) % 17) / 100))));
        mesh.setColorAt(i, bright((i * 31) % 100 < 2 ? [300, 250, 170] : TINTS[(i * 7) % TINTS.length] ?? [280, 280, 280]));
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = false;
      if (shadows) mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: picture, alphaTest: 0.5 });
      // a card is mostly air: the occlusion pass, which would read it as a wall, leaves it out
      mesh.userData.noOcclusion = true;
      mesh.name = name;
      root.add(mesh);
    });
  };
  if (opts.review) {
    // no planting in review: nothing stands between the reader and the proposal
  } else if (kinds.length && cardsOnly && sitters().length) {
    plant(data.trees.map(t => [t.position[0], t.position[1], (t.radiusM ?? 2.8) * 1.12]), 'site-trees', true);
  } else if (kinds.length) {
    // no two trees on a street are the same green
    const GREENS: Array<readonly number[]> = [[255, 255, 255], [226, 242, 214], [246, 240, 212], [212, 234, 208], [238, 246, 224]];
    place(kinds, data.trees.map((t, i) => ({ x: t.position[0], y: t.position[1], r: (t.radiusM ?? 2.8) * 1.4, tint: GREENS[(i * 7) % GREENS.length] ?? [255, 255, 255] })), 0.1);
    if (bushes.length) place(bushes, data.shrubs.map(([x, y, r]) => ({ x, y, r: r * 1.7 })), 0.25);
  } else {
    const crownG = crown();
    const leavesM = surfaces.foliage(opacity) as THREE.MeshStandardMaterial;
    leavesM.vertexColors = true;
    const canopy = new THREE.InstancedMesh(crownG, leavesM, Math.max(1, data.trees.length));
    canopy.count = data.trees.length;
    data.trees.forEach((t, i) => {
      const R = (t.radiusM ?? 2.8) * 0.84;
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      canopy.setMatrixAt(i, m4.compose(new THREE.Vector3(t.position[0], t.position[1], R * 1.7), q, new THREE.Vector3(R, R, R * 1.05)));
      canopy.setColorAt(i, linear([100, 140, 70]));
    });
    canopy.castShadow = true;
    root.add(canopy);
  }

  // the surroundings are wooded, as the neighbourhoods round a site are: light
  // crowns scattered between the existing buildings and out toward the haze.
  // Illustration: nothing in the record says where a tree stands.
  if (real && !opts.noContext) {
    const site = data.lawn[0]?.polygon[0]?.map(p => [p[0] ?? 0, p[1] ?? 0]) ?? null;
    const half = data.extent / 2;
    const near = (x: number, y: number) => {
      for (const r of data.roads) {
        for (let k = 0; k < r.path.length - 1; k++) {
          const a = r.path[k], b = r.path[k + 1];
          if (!a || !b) continue;
          const ax = a[0] ?? 0, ay = a[1] ?? 0, dx = (b[0] ?? 0) - ax, dy = (b[1] ?? 0) - ay;
          const l2 = dx * dx + dy * dy;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < 9) return true;
        }
      }
      return false;
    };
    let seed = 20261112;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // trees stand in groves with clearings between them, not on a grid: the chance of one rises and falls over the ground
    const lattice = (i: number, j: number) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
    const grove = (x: number, y: number) => {
      const u = x / 85, v = y / 85, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      return (lattice(i, j) * (1 - su) + lattice(i + 1, j) * su) * (1 - sv) + (lattice(i, j + 1) * (1 - su) + lattice(i + 1, j + 1) * su) * sv;
    };
    const scatter = (inner: number, outer: number, wanted: number, keep: number, limit: number) => {
      // no closer together than wanted, and no more of them than the limit: the whole ring is planted
      const step = Math.max(wanted, Math.sqrt(((2 * outer) ** 2 - (2 * inner) ** 2) * keep / limit));
      const spots: Array<[number, number, number]> = [];
      for (let x = -outer; x <= outer; x += step) {
        for (let y = -outer; y <= outer; y += step) {
          const px = x + (rnd() - 0.5) * step * 1.3, py = y + (rnd() - 0.5) * step * 1.3, size = 2.6 + rnd() * rnd() * 7.2;
          const d = Math.max(Math.abs(px), Math.abs(py));
          if (rnd() > keep * (0.3 + 1.4 * grove(px, py)) || d < inner || d > outer) continue;
          if (site && pointInPolygon(px, py, [site])) continue;
          if (neighbours.some(b => px > b.minX - 3 && px < b.maxX + 3 && py > b.minY - 3 && py < b.maxY + 3)) continue;
          if (d < half * 4 && near(px, py)) continue;
          spots.push([px, py, size]);
        }
      }
      return spots;
    };
    const TONES: RGBA[] = [[92, 122, 70, 255], [104, 132, 76, 255], [84, 112, 66, 255], [112, 134, 80, 255], [96, 120, 78, 255], [78, 106, 64, 255]];
    const TURNED: RGBA[] = [[150, 126, 70, 255], [136, 104, 66, 255], [156, 140, 78, 255]];
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    // a canopy seen from the air: a few lumpy lobes, lit as round forms, dark underneath, leaf-dappled
    const canopy = (lobes: Array<[number, number, number, number]>, detail: number): THREE.BufferGeometry => {
      const parts = lobes.map(([x, y, z, r], k) => {
        const g = new THREE.IcosahedronGeometry(r, detail);
        const p = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
          const f = 1 + 0.16 * Math.sin(vx * 7.1 + k * 1.7) * Math.cos(vy * 6.3 + k) + 0.1 * Math.sin(vz * 9.7 + k * 2.3);
          p.setXYZ(i, vx * f + x, vy * f + y, vz * f * 0.82 + z);
        }
        return g;
      });
      const g = parts.length === 1 ? (parts[0] as THREE.BufferGeometry) : (mergeGeometries(parts, false) as THREE.BufferGeometry);
      if (parts.length > 1) parts.forEach(q0 => q0.dispose());
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = Math.max(0, Math.min(1, (p.getZ(i) + 0.85) / 1.8));
        const v = 0.4 + 0.6 * t * t;
        c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    };
    const stand = (spots: Array<[number, number, number]>, geometry: THREE.BufferGeometry, name: string, shadows: boolean) => {
      if (!spots.length) return;
      const wood = new THREE.InstancedMesh(geometry, surfaces.canopy(), spots.length);
      spots.forEach(([x, y, r], i) => {
        ee.set(((i * 13) % 9 - 4) * 0.02, ((i * 7) % 9 - 4) * 0.02, (i * 1.9) % (Math.PI * 2));
        qq.setFromEuler(ee);
        // a crown that sits on the ground: wider than tall, no gap under it
        const w = r * (1.15 + ((i * 29) % 11) / 40);
        wood.setMatrixAt(i, mm.compose(new THREE.Vector3(x, y, r * 0.78), qq, new THREE.Vector3(w, w, r * (0.95 + ((i * 17) % 7) / 30))));
        // most are green; a few have turned
        wood.setColorAt(i, linear((i * 31) % 100 < 2 ? TURNED[i % TURNED.length] ?? [150, 126, 70] : TONES[(i * 7) % TONES.length] ?? [92, 122, 70]));
      });
      wood.castShadow = shadows;
      wood.receiveShadow = false;
      wood.name = name;
      root.add(wood);
    };
    // the surrounding trees are portraits of the site's own, on crossed cards; where a portrait
    // cannot be painted (no leaf picture), lumpy crowns stand in
    const nearby = scatter(0, half * 4, 12, 0.62, opts.light ? 2200 : 4500), beyond = scatter(half * 4, half * 13, 22, 0.7, opts.light ? 5000 : 11000);
    if (sitters().length) {
      plant(nearby, 'surrounding-trees', true);
      plant(beyond, 'far-trees', false);
    } else {
      stand(nearby.filter((_, i) => i % 2 === 0), canopy([[0, 0, 0, 1], [0.58, 0.2, 0.06, 0.68], [-0.46, 0.36, -0.04, 0.64], [0.05, -0.55, 0.1, 0.6]], 1), 'surrounding-trees', true);
      stand(beyond.filter((_, i) => i % 2 === 0), canopy([[0, 0, 0, 1]], 1), 'far-trees', false);
    }
  }

  lap('trees planted');
  // what a camera centres on: the parcel, or the plan where no parcel is known
  const outline = (data.lawn[0]?.polygon[0] ?? []).map(p => [p[0] ?? 0, p[1] ?? 0] as [number, number]);
  const held = outline.length >= 3 ? outline : [[-data.extent / 2, -data.extent / 2], [data.extent / 2, data.extent / 2]] as Array<[number, number]>;
  const fx = (Math.min(...held.map(p => p[0])) + Math.max(...held.map(p => p[0]))) / 2, fy = (Math.min(...held.map(p => p[1])) + Math.max(...held.map(p => p[1]))) / 2;
  const focus = { x: fx, y: fy, radius: Math.max(15, ...held.map(p => Math.hypot(p[0] - fx, p[1] - fy))) };
  // what a picture of the scheme centres on (scene/builtFocus): the buildings or their densest group on a large parcel
  const byBuilding = new Map<string, Array<[number, number]>>();
  for (const sl of data.slabs as RenderSlab[]) {
    if (sl.part === 'detail') continue;
    const list = byBuilding.get(sl.id) ?? [];
    for (const p of sl.polygon[0] ?? []) list.push([p[0] ?? 0, p[1] ?? 0]);
    byBuilding.set(sl.id, list);
  }
  const built = builtFocus(focus, [...byBuilding.values()]);
  // picking: one unseen solid a building
  const pickGroup = new THREE.Group();
  pickGroup.visible = false;
  const byId = new Map<string, THREE.BufferGeometry[]>();
  for (const s of data.slabs as RenderSlab[]) {
    if (s.part === 'detail') continue;
    const g = prism(s.polygon, s.elevation);
    if (g) byId.set(s.id, [...(byId.get(s.id) ?? []), g]);
  }
  const pick: THREE.Mesh[] = [];
  for (const [id, list] of byId) {
    const g = mergeGeometries(list, false);
    list.forEach(x => x.dispose());
    if (!g) continue;
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    pickGroup.add(mesh);
    pick.push(mesh);
  }
  root.add(pickGroup);
  root.updateMatrixWorld(true);
  lap('done');

  return {
    root,
    pick,
    extent: Math.max(20, data.extent / 2),
    focus,
    built,
    surfaces,
    ready: Promise.all(waits).then(() => Promise.all(surfaces.pending)).then(() => undefined),
    dispose() {
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      surfaces.dispose();
    },
  };
}
