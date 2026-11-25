import * as THREE from 'three';
import type { RenderSlab, RGBA } from '../ui/renderModel';

type XYZ = [number, number, number];
type HeightAt = (x: number, y: number) => number;
type Covered = (x: number, y: number) => boolean;

export type SurfaceCut = {
  x0: number; x1: number; y0: number; y1: number;
  edges: Array<(x: number, y: number) => number>;
};

/** Remove the lawn directly under a paved strip so a walk can descend below the adjacent grade. */
export function approachCut({ start, end, width }: NonNullable<RenderSlab['approach']>): SurfaceCut | null {
  const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
  if (length < 0.18) return null;
  const ux = dx / length, uy = dy / length;
  const half = width / 2 - 0.004;
  const along = (x: number, y: number) => (x - start[0]) * ux + (y - start[1]) * uy;
  const across = (x: number, y: number) => (y - start[1]) * ux - (x - start[0]) * uy;
  return {
    x0: Math.min(start[0], end[0]) - half, x1: Math.max(start[0], end[0]) + half,
    y0: Math.min(start[1], end[1]) - half, y1: Math.max(start[1], end[1]) + half,
    edges: [(x, y) => along(x, y), (x, y) => length - along(x, y), (x, y) => half + across(x, y), (x, y) => half - across(x, y)],
  };
}

export function cutGround(geometry: THREE.BufferGeometry, cuts: SurfaceCut[]): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  cuts = cuts.filter(cut => box.min.x < cut.x1 && box.max.x > cut.x0 && box.min.y < cut.y1 && box.max.y > cut.y0);
  if (!cuts.length) return geometry;
  const attrs = Object.entries(geometry.attributes).map(([name, attr]) => ({ name, attr, rows: [] as number[] }));
  const pos = geometry.getAttribute('position'), index = geometry.index;
  const xy = (vertex: number) => [pos.getX(vertex), pos.getY(vertex)];
  const clip = (poly: number[][], edge: SurfaceCut['edges'][number]) => {
    const outside: number[][] = [], inside: number[][] = [];
    for (let n = 0; n < poly.length; n++) {
      const a = poly[n]!, b = poly[(n + 1) % poly.length]!;
      const fa = edge(a[0]!, a[1]!), fb = edge(b[0]!, b[1]!);
      if (fa <= 0) outside.push(a);
      if (fa >= 0) inside.push(a);
      if (fa * fb < 0) {
        const cut = a.map((v, p) => v + (b[p]! - v) * fa / (fa - fb));
        outside.push(cut);
        inside.push(cut);
      }
    }
    return { outside, inside };
  };
  const count = index?.count ?? pos.count;
  for (let n = 0; n + 2 < count; n += 3) {
    const vs = [n, n + 1, n + 2].map(i => index?.getX(i) ?? i);
    const tri = vs.map((v, i) => [...xy(v), Number(i === 0), Number(i === 1), Number(i === 2)]);
    const xs = tri.map(v => v[0]!), ys = tri.map(v => v[1]!);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    let polygons = [tri];
    for (const cut of cuts) {
      if (x0 >= cut.x1 || x1 <= cut.x0 || y0 >= cut.y1 || y1 <= cut.y0) continue;
      const remain: number[][][] = [];
      for (const original of polygons) {
        let poly = original;
        for (const edge of cut.edges) {
          const { outside, inside } = clip(poly, edge);
          if (outside.length >= 3) remain.push(outside);
          poly = inside;
          if (poly.length < 3) break;
        }
      }
      polygons = remain;
    }
    for (const polygon of polygons) for (let i = 1; i < polygon.length - 1; i++) {
      for (const point of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) {
        for (const { attr, rows } of attrs) for (let k = 0; k < attr.itemSize; k++) rows.push(
          point[2]! * attr.getComponent(vs[0]!, k) + point[3]! * attr.getComponent(vs[1]!, k) + point[4]! * attr.getComponent(vs[2]!, k),
        );
      }
    }
  }
  const result = new THREE.BufferGeometry();
  for (const { name, attr, rows } of attrs) result.setAttribute(name, new THREE.Float32BufferAttribute(rows, attr.itemSize));
  return result;
}

export interface ApproachAnchor {
  id: string;
  building: string;
  kind: 'walk' | 'apron';
  threshold: XYZ;
  connection: XYZ;
  facing?: [number, number];
}

/** Accumulate strips and faces as one geometry, with dimensions and UVs in metres. */
class Faces {
  private xyz: number[] = [];
  private uv: number[] = [];

  quad(a: XYZ, b: XYZ, c: XYZ, d: XYZ): void {
    const u = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const v = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    this.xyz.push(...a, ...b, ...c, ...a, ...c, ...d);
    this.uv.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v);
  }

  done(): THREE.BufferGeometry | null {
    if (!this.xyz.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.xyz, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.computeVertexNormals();
    return geometry;
  }
}

export function approachGeometry(
  id: string,
  building: string,
  approach: NonNullable<RenderSlab['approach']>,
  pad: number,
  heightAt: HeightAt,
): { concrete: THREE.BufferGeometry | null; joints: THREE.BufferGeometry | null; anchor: ApproachAnchor } {
  const { start, end, width, kind } = approach;
  const x = end[0] - start[0], y = end[1] - start[1], length = Math.hypot(x, y);
  const first = pad + approach.threshold;
  const last = heightAt(...end) + approach.pavement;
  const anchor: ApproachAnchor = { id, building, kind, threshold: [...start, first], connection: [...end, last], ...(approach.facing ? { facing: approach.facing } : {}) };
  if (length < 0.18) return { concrete: null, joints: null, anchor };

  const rise = last - first;
  const risers = Math.ceil(Math.abs(rise) / 0.17);
  const stepped = kind === 'walk' && Math.abs(rise) > 0.23 && Math.abs(rise) / length > 0.09 && length >= (risers + 1) * 0.26;
  const steps = stepped ? risers + 1 : Math.max(1, Math.ceil(length / 1.52));
  const nx = -y / length, ny = x / length, half = width / 2;
  const top = (s: number, d: number, z: number): XYZ => [start[0] + x * s + nx * d, start[1] + y * s + ny * d, z];
  const below = (p: XYZ): XYZ => [p[0], p[1], Math.min(p[2] - 0.14, heightAt(p[0], p[1]) + 0.06)];
  const shoulder = (p: XYZ): XYZ => [p[0], p[1], Math.max(p[2], heightAt(p[0], p[1]) + 0.19)];
  const concrete = new Faces(), joints = new Faces();
  for (let i = 0; i < steps; i++) {
    const a = i / steps, b = (i + 1) / steps;
    const z = stepped ? first + rise * i / (steps - 1) : first + rise * a;
    const next = stepped ? z : first + rise * b;
    const al = top(a, half, z), ar = top(a, -half, z);
    const bl = top(b, half, next), br = top(b, -half, next);
    concrete.quad(al, ar, br, bl);
    concrete.quad(al, bl, below(bl), below(al));
    concrete.quad(ar, below(ar), below(br), br);
    if (shoulder(al)[2] > al[2] || shoulder(bl)[2] > bl[2]) concrete.quad(bl, al, shoulder(al), shoulder(bl));
    if (shoulder(ar)[2] > ar[2] || shoulder(br)[2] > br[2]) concrete.quad(ar, br, shoulder(br), shoulder(ar));
    if (i === 0) concrete.quad(ar, al, below(al), below(ar));
    if (i === steps - 1) concrete.quad(bl, br, below(br), below(bl));
    if (stepped && i < steps - 1) {
      const tread = first + rise * (i + 1) / (steps - 1);
      const tl = top(b, half, tread), tr = top(b, -half, tread);
      if (rise > 0) concrete.quad(br, bl, tl, tr);
      else concrete.quad(bl, br, tr, tl);
    } else if (i > 0 && !stepped) {
      const gap = 0.007 / length;
      joints.quad(top(a - gap, half, z - rise * gap + 0.002), top(a - gap, -half, z - rise * gap + 0.002),
        top(a + gap, -half, z + rise * gap + 0.002), top(a + gap, half, z + rise * gap + 0.002));
    }
  }
  return { concrete: concrete.done(), joints: joints.done(), anchor };
}

/** Geometric gutters, curb faces and scored concrete drawn around mapped road lines. */
export function streetDetails(path: number[][], covered: Covered): Array<{ geometry: THREE.BufferGeometry; color: RGBA; part: 'curb' | 'walk' | 'joint' }> {
  const gutter = new Faces(), walks = new Faces(), joints = new Faces();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const ax = a[0] ?? 0, ay = a[1] ?? 0;
    const dx = (b[0] ?? 0) - ax, dy = (b[1] ?? 0) - ay, length = Math.hypot(dx, dy);
    if (length < 0.02) continue;
    const div = Math.max(1, Math.ceil(length / 1.52));
    for (const side of [1, -1]) {
      const nx = side * -dy / length, ny = side * dx / length;
      const p = (s: number, d: number, z: number): XYZ => [ax + dx * s + nx * d, ay + dy * s + ny * d, z];
      const strip = (faces: Faces, l: number, r: number, near: number, far: number, ln: number, lf: number, rn = ln, rf = lf) => {
        const a0 = p(l, near, ln), a1 = p(l, far, lf), b0 = p(r, near, rn), b1 = p(r, far, rf);
        if (side > 0) faces.quad(a0, b0, b1, a1);
        else faces.quad(a1, b1, b0, a0);
      };
      const cut = (t: number) => {
        const [x, y] = p(t, 4.05, 0);
        return covered(x, y);
      };
      for (let j = 0; j < div; j++) {
        const l = j / div, r = (j + 1) / div;
        const cross = cut((l + r) / 2);
        const h0 = cross || cut(l) ? 0.148 : 0.255;
        const h1 = cross || cut(r) ? 0.148 : 0.255;
        const [wx, wy] = p((l + r) / 2, 5.92, 0);
        if (cross || covered(wx, wy)) continue;
        strip(gutter, l, r, 3.52, 3.79, 0.133, 0.142);
        strip(gutter, l, r, 3.79, 3.83, 0.142, h0, 0.142, h1);
        strip(gutter, l, r, 3.83, 3.99, h0, h0 - 0.006, h1, h1 - 0.006);
        strip(gutter, l, r, 3.99, 4.01, h0 - 0.006, 0.092, h1 - 0.006, 0.092);
        strip(walks, l, r, 5.25, 6.6, 0.182, 0.197);
        strip(walks, l, r, 5.22, 5.25, 0.054, 0.182);
        strip(walks, l, r, 6.6, 6.63, 0.197, 0.054);
        if (j > 0) strip(joints, l - 0.005 / length, l + 0.005 / length, 5.25, 6.6, 0.183, 0.198);
      }
    }
  }
  const result: ReturnType<typeof streetDetails> = [];
  const curb = gutter.done(), walk = walks.done(), joint = joints.done();
  if (curb) result.push({ geometry: curb, color: [173, 166, 151, 255], part: 'curb' });
  if (walk) result.push({ geometry: walk, color: [198, 190, 173, 255], part: 'walk' });
  if (joint) result.push({ geometry: joint, color: [112, 106, 94, 255], part: 'joint' });
  return result;
}

/** Raise curb sections only along the boundary of the paved area. */
export function planCurb(path: number[][], paved: Covered): THREE.BufferGeometry | null {
  const curb = new Faces();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const ax = a[0] ?? 0, ay = a[1] ?? 0;
    const dx = (b[0] ?? 0) - ax, dy = (b[1] ?? 0) - ay;
    const length = Math.hypot(dx, dy);
    if (length < 0.1) continue;
    const div = Math.max(1, Math.ceil(length / 1.25));
    const nx = -dy / length, ny = dx / length;
    const p = (s: number, d: number, z: number): XYZ => [ax + dx * s + nx * d, ay + dy * s + ny * d, z];
    for (let j = 0; j < div; j++) {
      const l = j / div, r = (j + 1) / div, mid = (l + r) / 2;
      const [lx, ly] = p(mid, 0.22, 0), [rx, ry] = p(mid, -0.22, 0);
      const left = paved(lx, ly), right = paved(rx, ry);
      if (left === right) continue;
      const outside = left ? -1 : 1;
      const insideL = p(l, -outside * 0.025, 0.304), insideR = p(r, -outside * 0.025, 0.304);
      const topL = p(l, outside * 0.045, 0.44), topR = p(r, outside * 0.045, 0.44);
      const endL = p(l, outside * 0.195, 0.426), endR = p(r, outside * 0.195, 0.426);
      const lowerL = p(l, outside * 0.20, 0.265), lowerR = p(r, outside * 0.20, 0.265);
      if (left) {
        curb.quad(topL, topR, insideR, insideL);
        curb.quad(endL, endR, topR, topL);
        curb.quad(lowerL, lowerR, endR, endL);
      } else {
        curb.quad(insideL, insideR, topR, topL);
        curb.quad(topL, topR, endR, endL);
        curb.quad(endL, endR, lowerR, lowerL);
      }
    }
  }
  return curb.done();
}
