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
import { surfaceOf } from '../ui/architecture';
import { Surfaces } from './textures';

export interface SiteModel {
  root: THREE.Group;
  /** One unseen solid a building, for picking: `userData.id` is the plan element's id. */
  pick: THREE.Mesh[];
  /** Half the size of the plan, metres: what the lights and cameras frame. */
  extent: number;
  surfaces: Surfaces;
  dispose(): void;
}

export interface SiteModelOptions {
  /** Canopies let the ground show through a little: for a plan seen from above. */
  canopyOpacity?: number;
  /** Leave the existing neighbourhood out. */
  noContext?: boolean;
}

const linear = (c: readonly number[]): THREE.Color => new THREE.Color().setRGB((c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255, THREE.SRGBColorSpace);

function paint(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

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
  const shape = new THREE.Shape(ring(outer));
  for (const hole of rings.slice(1)) if (hole.length >= 3) shape.holes.push(new THREE.Path(ring(hole)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.translate(0, 0, outer[0]?.[2] ?? 0);
  g.clearGroups();
  return g;
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
  greenspace: { surface: 'grass', color: [128, 160, 100, 255] },
};
const LAWN: RGBA = [150, 172, 118, 255];
const WALK: RGBA = [214, 210, 200, 255];

/** Build the model. `data` is what the massing view already computes. */
export function buildSiteModel(data: MassingData, opts: SiteModelOptions = {}): SiteModel {
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

  // ground: a wide lawn-grey plate, then the neighbourhood on it
  const reach = Math.max(260, data.extent * 3.2);
  put('plain|ground', plane([[-reach, -reach, -0.02], [reach, -reach, -0.02], [reach, reach, -0.02], [-reach, reach, -0.02]]), [176, 186, 152, 255]);
  if (!opts.noContext) {
    for (const c of data.contextPolygons) {
      const ring = c.polygon[0];
      if (!ring) continue;
      if (c.elevation < 1) put('grass|flat', prism([ring.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], 0.03), [170, 184, 142, 255]);
      else put('plain|solid', prism([ring.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], c.elevation), [238, 235, 228, 255]);
    }
  }
  for (const r of data.roads) {
    put('concrete|flat', ribbon(r.path, 13.4, 0.05), WALK);
    put('grass|flat', ribbon(r.path, 10.6, 0.09), [164, 186, 128, 255]);
    put('asphalt|flat', ribbon(r.path, 7.3, 0.13), [112, 112, 114, 255]);
    put('plain|flat', ribbon(r.path, 0.14, 0.15), [214, 176, 72, 255]);
  }

  // the site
  for (const l of data.lawn) {
    const ring = l.polygon[0];
    if (ring) put('grass|flat', prism([ring.map(p => [p[0] ?? 0, p[1] ?? 0, 0])], 0.17), LAWN);
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
  for (const c of data.curbs) put('concrete|flat', ribbon(c.path, 0.2, 0.36), [226, 223, 214, 255]);
  for (const s of data.stripes) put('plain|flat', ribbon(s.path, 0.12, 0.33), [244, 244, 240, 255]);

  // buildings: walls and roofs in their materials, glass apart
  for (const s of data.slabs) put(`${surfaceOf(s.color)}|solid`, prism(s.polygon, s.elevation), s.color);
  for (const f of data.roofs) put(`${surfaceOf(f.color)}|sheet`, plane(f.polygon), f.color);
  for (const w of data.windows) put('glass|sheet', plane(w.polygon), w.color);
  for (const c of data.cars) put(c.elevation > 0.6 ? 'paint|solid' : 'glass|solid', prism(c.polygon, c.elevation), c.color);

  for (const [key, list] of bins) {
    const [kind, mode] = key.split('|') as [string, string];
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) continue;
    let material = kind === 'glass' ? surfaces.glass() : kind === 'paint' ? surfaces.paint() : surfaces.get(kind as Surface);
    if (mode === 'sheet') { material = material.clone(); material.side = THREE.DoubleSide; }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mode === 'solid' || mode === 'sheet';
    mesh.receiveShadow = true;
    mesh.name = key;
    root.add(mesh);
  }

  // planting: every tree is the same crown, turned, sized and tinted
  const crownG = crown();
  const leaves = surfaces.foliage(opts.canopyOpacity ?? 1) as THREE.MeshStandardMaterial;
  leaves.vertexColors = true;
  const GREENS: RGBA[] = [[86, 132, 62, 255], [100, 146, 66, 255], [78, 120, 66, 255], [112, 150, 72, 255], [92, 138, 78, 255]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1);
  if (data.trees.length) {
    const canopy = new THREE.InstancedMesh(crownG, leaves, data.trees.length);
    const trunkG = new THREE.CylinderGeometry(0.1, 0.17, 1, 7).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a463a, roughness: 1 }), data.trees.length);
    data.trees.forEach((t, i) => {
      // three habits from one crown: broad, upright and tall, by position
      const habit = (i * 7 + Math.round(Math.abs(t.position[0]) * 3)) % 5;
      const R = (t.radiusM ?? 2.8) * (habit === 4 ? 0.62 : habit === 3 ? 0.74 : 0.84);
      const tall = habit === 4 ? 1.9 : habit === 3 ? 1.35 : 1.05;
      const trunk = R * (habit === 4 ? 0.7 : 0.95);
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      canopy.setMatrixAt(i, m4.compose(new THREE.Vector3(t.position[0], t.position[1], trunk + R * 0.78 * tall), q, new THREE.Vector3(R, R, R * tall)));
      canopy.setColorAt(i, linear(GREENS[i % GREENS.length] ?? [100, 140, 70]).multiplyScalar(habit === 4 ? 0.78 : 1));
      trunks.setMatrixAt(i, m4.compose(new THREE.Vector3(t.position[0], t.position[1], 0.1), q, new THREE.Vector3(1 + R * 0.12, 1 + R * 0.12, trunk + R * 0.3)));
    });
    canopy.castShadow = trunks.castShadow = true;
    canopy.receiveShadow = true;
    root.add(canopy, trunks);
  }
  if (data.shrubs.length) {
    const shrubs = new THREE.InstancedMesh(crownG, leaves, data.shrubs.length);
    data.shrubs.forEach(([x, y, r], i) => {
      q.setFromAxisAngle(up, (i * 1.7) % (Math.PI * 2));
      shrubs.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, 0.3 + r * 0.55), q, new THREE.Vector3(r * 0.72, r * 0.72, r * 0.6)));
      shrubs.setColorAt(i, linear(GREENS[(i * 3) % GREENS.length] ?? [100, 140, 70]).multiplyScalar(0.82));
    });
    shrubs.castShadow = true;
    shrubs.receiveShadow = true;
    root.add(shrubs);
  }

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

  return {
    root,
    pick,
    extent: Math.max(20, data.extent / 2),
    surfaces,
    dispose() {
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      surfaces.dispose();
    },
  };
}
