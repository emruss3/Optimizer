// The scene handed to the offline renderer (scripts/render4k): a GLB of the
// same model the workspace draws, with a stable id and a material slot on
// every mesh, and a job file that fixes the cameras, the sun and the points a
// render is checked against.
//
// Units: everything in the job file is in feet, in the plan's local frame
// (east, north, up). The GLB alone is in metres, y up, because the glTF
// format requires it; the job file says so and the worker converts once.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
import type { MassingData } from '../ui/massingData';
import type { DrawingScene } from '../scene/types';
import { sunPosition, SUN_DATES } from '../ui/sunPosition';
import { buildSiteModel, plantId } from './siteScene';
import { aerialShot, approachShot, prominentSubject, streetShot, DEFAULT_RENDER_SUN, FT, type Shot } from './shots';
import { BUILD_SHA } from '../../../lib/buildInfo';
import siteAssets from './siteAssets.json';

export const RENDER_JOB_SCHEMA = 1;
const SENSOR_MM = 36;
export type RenderCameraId = 'street' | 'drone' | 'approach';

export interface JobCamera {
  id: RenderCameraId;
  basis: string;
  position_ft: [number, number, number];
  target_ft: [number, number, number];
  /** On a 36 mm wide sensor, horizontal fit. */
  focal_length_mm: number;
  sensor_width_mm: number;
  /** Lens shift up, as a fraction of the sensor's width: the camera stays level. */
  shift_y: number;
  clip_ft: [number, number];
  aspect: number;
  resolution: [number, number];
}

export interface RenderJob {
  schema_version: number;
  units: 'ft';
  frame: string;
  origin: { lat_deg: number; lon_deg: number };
  site: { parcel_id: string; scheme_id: string; revision: string };
  scheme_sha256: string;
  appearance: { preset: string; style: string; kit: string; assets_sha256: string; build: string; sha256: string };
  /** The scheme's own figures, as the drawing scene carries them. */
  quantities: { buildings: number; stories: number[]; units: number | null; stalls: number | null; gross_sf: number | null };
  glb: { file: string; sha256: string; bytes: number; units: string; axes: string };
  mesh_groups: Array<{ id: string; owner: string; slot: string; triangles: number }>;
  /** The whole model's extent along east, north and up: three unequal lengths, so a swapped or mirrored axis shows. */
  bounds_ft: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] };
  /**
   * The main building as the model draws it, taken before the scene was turned and packed:
   * its top (roof included) and its extent east and north. The worker reads the same three from the GLB.
   */
  known: { id: string; mesh_prefix: string; top_ft: number; span_ft: [number, number]; drawing_height_ft: number } | null;
  /** The foreground templates and their transforms are in the GLB. The worker fills in distant crowns. */
  planting: {
    trees: Array<{ id: string; position_ft: [number, number, number]; crown_radius_ft: number }>;
    shrubs: Array<{ id: string; position_ft: [number, number, number]; radius_ft: number }>;
    shared: string[];
  };
  omitted: string[];
  /**
   * The ground the scene stands on, or null when it is drawn flat. Elevations are the survey's own;
   * a building's pad is an assumption of the picture, not a design grade.
   */
  terrain: {
    source: string; datum: string; samples: number;
    /** The elevation of the frame's zero height. */
    zero_elevation_ft: number;
    sampled_range_ft: [number, number];
    coverage: string;
    grading: { rule: string; existing_slope_pct: number; graded_slope_pct: number; deepest_cut_ft: number; deepest_fill_ft: number } | null;
    pads: Array<{ building: string; pad_elevation_ft: number; lowest_ground_ft: number; highest_ground_ft: number; deepest_cut_ft: number; deepest_fill_ft: number }>;
  } | null;
  cameras: JobCamera[];
  lighting: { sun_azimuth_deg: number; sun_altitude_deg: number; sun_date: string; solar_hour: number; exposure_ev: number; seed: number; sky: string; sky_rotation_deg: number };
  /** Points on the main building, and where each camera must put them at 1920 by 1080. */
  anchors: Array<{ id: string; position_ft: [number, number, number]; expected_px: Record<string, [number, number]> }>;
  renderer: { preset: string; style: string; asset_version: string };
}

const ft = (m: number) => Math.round((m / FT) * 1000) / 1000;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async (value: unknown) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));

/** The camera the live view would use for a job camera, at a fixed 16:9 picture: the browser side of the parity check. */
export function browserCamera(c: JobCamera, width = 1920, height = 1080): THREE.PerspectiveCamera {
  const hfov = 2 * Math.atan(c.sensor_width_mm / (2 * c.focal_length_mm));
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / c.aspect);
  // the shift, as the live view applies it: a frame `lift` times taller, of which the picture is the top
  const lift = 1 + 2 * c.shift_y * c.aspect;
  const cam = new THREE.PerspectiveCamera((2 * Math.atan(Math.tan(vfov / 2) * lift) * 180) / Math.PI, width / (height * lift), c.clip_ft[0] * FT, c.clip_ft[1] * FT);
  if (lift > 1) cam.setViewOffset(width, height * lift, 0, 0, width, height);
  // local east, north, up to three's east, up, minus north
  cam.position.set(c.position_ft[0] * FT, c.position_ft[2] * FT, -c.position_ft[1] * FT);
  cam.lookAt(c.target_ft[0] * FT, c.target_ft[2] * FT, -c.target_ft[1] * FT);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

/** Where a camera puts a point of the local frame, in pixels from the top left. */
export function projectPx(cam: THREE.PerspectiveCamera, p_ft: [number, number, number], width = 1920, height = 1080): [number, number] {
  const v = new THREE.Vector3(p_ft[0] * FT, p_ft[2] * FT, -p_ft[1] * FT).project(cam);
  return [Math.round((v.x * 0.5 + 0.5) * width * 100) / 100, Math.round((0.5 - v.y * 0.5) * height * 100) / 100];
}

export async function buildRenderJob(
  data: MassingData,
  scene: DrawingScene,
  opts: { style: string; sunKey?: string; sunHour?: number; glbFile?: string; grossSf?: number | null | undefined; preset?: 'gray-pass' | 'daylight' },
): Promise<{ glb: ArrayBuffer; job: RenderJob }> {
  const model = buildSiteModel(data, { keepParts: true });
  try {
    await model.ready;
    const vehicles = model.root.getObjectByName('parked-vehicles');
    // each building's extent in the model's own frame (metres, z up), before anything is turned
    const extents = new Map<string, THREE.Box3>();
    for (const part of model.parts) {
      if (vehicles && part.owner.startsWith('car:')) {
        part.geometry.dispose();
        continue;
      }
      if (!part.owner.startsWith('building:')) continue;
      part.geometry.computeBoundingBox();
      const b = extents.get(part.owner) ?? new THREE.Box3();
      b.union(part.geometry.boundingBox!);
      extents.set(part.owner, b);
    }
    const grade = model.grade;
    const terrain = grade?.terrain ?? null;
    // one mesh for each feature and material slot, named for both
    const groups = new Map<string, { owner: string; slot: string; list: THREE.BufferGeometry[] }>();
    for (const part of model.parts) {
      const id = `${part.owner}__${part.slot}`;
      const g = groups.get(id) ?? { owner: part.owner, slot: part.slot, list: [] };
      g.list.push(part.geometry);
      groups.set(id, g);
    }
    const out = new THREE.Scene();
    out.name = `parcel-${scene.identity.parcelId}-rev-${scene.identity.revision}`;
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const toYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);   // the model's z up to glTF's y up
    const mesh_groups: RenderJob['mesh_groups'] = [];
    for (const [id, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const pieces = dissolveFlat(g.list);
      const merged = mergeGeometries(pieces, false);
      [...g.list, ...pieces].forEach(x => x.dispose());
      if (!merged) continue;
      merged.applyMatrix4(toYUp);
      const indexed = mergeVertices(merged, 1e-5);
      merged.dispose();
      let mat = materials.get(g.slot);
      if (!mat) { mat = new THREE.MeshStandardMaterial({ name: g.slot, color: 0xb4b4b4, roughness: 0.9, metalness: 0 }); materials.set(g.slot, mat); }
      const mesh = new THREE.Mesh(indexed, mat);
      mesh.name = id;
      mesh.userData = { id, owner: g.owner, slot: g.slot };
      out.add(mesh);
      mesh_groups.push({ id, owner: g.owner, slot: g.slot, triangles: (indexed.index?.count ?? indexed.getAttribute('position').count) / 3 });
    }
    const shared = new Set<string>();
    for (const { id, form, matrix } of model.plants) {
      const leaf = form.leaf as THREE.MeshStandardMaterial;
      const bark = form.bark as THREE.MeshStandardMaterial;
      if (!leaf.map?.image?.naturalWidth || (bark.map && !bark.map.image?.naturalWidth)) continue;
      const owner = `plant:${id}`;
      if (shared.has(id)) continue;
      shared.add(id);
      for (const [slot, geometry, material] of [['foliage-bark', form.wood, bark], ['foliage-leaf', form.leaves, leaf]] as const) {
        const name = `${owner}__${slot}`;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.applyMatrix4(toYUp.clone().multiply(matrix));
        mesh.name = name;
        mesh.userData = { id: name, owner, slot };
        out.add(mesh);
        mesh_groups.push({ id: name, owner, slot, triangles: (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 });
      }
    }
    const matrices = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (const bin of vehicles?.children ?? []) {
      if (!(bin instanceof THREE.InstancedMesh) || !(bin.material instanceof THREE.MeshStandardMaterial)) continue;
      const geometry = mergeVertices(bin.geometry, 1e-5);
      const slot = `vehicle-${bin.userData.partId}`;
      for (let i = 0; i < bin.count; i++) {
        const owner = `vehicle:${bin.userData.spots[i]}`, id = `${owner}__${slot}`;
        if (bin.instanceColor) bin.getColorAt(i, tint);
        const key = bin.instanceColor ? `${slot}:${tint.getHexString()}` : slot;
        let material = materials.get(key);
        if (!material) {
          material = bin.material.clone();
          if (bin.instanceColor) material.color.multiply(tint);
          materials.set(key, material);
        }
        const mesh = new THREE.Mesh(geometry, material);
        bin.getMatrixAt(i, matrices);
        mesh.applyMatrix4(toYUp.clone().multiply(matrices));
        mesh.name = id;
        mesh.userData = { id, owner, slot };
        out.add(mesh);
        mesh_groups.push({ id, owner, slot, triangles: (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 });
      }
    }
    const box = new THREE.Box3().setFromObject(out, true);
    // back from y up to east, north, up
    const lo: [number, number, number] = [ft(box.min.x), ft(-box.max.z), ft(box.min.y)];
    const hi: [number, number, number] = [ft(box.max.x), ft(-box.min.z), ft(box.max.y)];
    const bounds_ft = { min: lo, max: hi, size: [0, 1, 2].map(i => Math.round((hi[i]! - lo[i]!) * 1000) / 1000) as [number, number, number] };
    const glb = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
    new Set(out.children.flatMap(o => o instanceof THREE.Mesh && !o.name.startsWith('plant:') ? [o.geometry] : [])).forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    const sha256 = hex(await crypto.subtle.digest('SHA-256', glb));

    // cameras: the same two the live view offers, at a fixed 16:9 picture
    const aspect = 16 / 9, resolution: [number, number] = [3840, 2160];
    const cameras: JobCamera[] = [];
    const focal = (vfovDeg: number) => SENSOR_MM / (2 * Math.tan(Math.atan(Math.tan((vfovDeg * Math.PI) / 360) * aspect)));
    const far = ft(Math.max(2000, data.extent * 40));
    const groundAt = model.groundAt;
    const { subjects, obstacles, roads, trees, approaches, foreground } = model.ground;
    const main = prominentSubject(subjects);
    const padZ = main?.base ?? groundAt(model.built.x, model.built.y);
    const add = (id: RenderCameraId, shot: Shot | null) => {
      if (!shot) return;
      cameras.push({
        id, basis: shot.basis,
        position_ft: shot.position.map(ft) as [number, number, number],
        target_ft: shot.target.map(ft) as [number, number, number],
        focal_length_mm: Math.round(focal(shot.fovDeg) * 1000) / 1000,
        sensor_width_mm: SENSOR_MM,
        shift_y: Math.round(((shot.lift - 1) / 2 / aspect) * 100000) / 100000,
        clip_ft: [id === 'drone' ? 5 : 1, far], aspect, resolution,
      });
    };
    add('street', streetShot(subjects, obstacles, roads, aspect, trees, groundAt, foreground));
    add('drone', aerialShot(model.built, data.aerialAzimuth, aspect, padZ));
    add('approach', approachShot(approaches, subjects, obstacles, trees, groundAt, foreground, aspect));

    // anchors: the corners of the main building, at the ground and at its top
    const anchors: RenderJob['anchors'] = [];
    const cams = cameras.map(c => ({ id: c.id, cam: browserCamera(c) }));
    const addAnchor = (id: string, point: [number, number, number]) => {
      const position_ft = point.map(ft) as [number, number, number];
      anchors.push({ id, position_ft, expected_px: Object.fromEntries(cams.map(c => [c.id, projectPx(c.cam, position_ft)])) });
    };
    if (main) {
      main.points.forEach((pt, i) => {
        for (const [tag, z] of [['base', padZ], ['top', main.height + padZ]] as Array<[string, number]>) {
          addAnchor(`main-${tag}-${i}`, [pt[0], pt[1], z]);
        }
      });
    }
    for (const approach of approaches.slice(0, 12)) {
      addAnchor(`${approach.id}-threshold`, approach.threshold);
      addAnchor(`${approach.id}-pavement`, approach.connection);
    }

    const sunKey = opts.sunKey ?? DEFAULT_RENDER_SUN.key, solarHour = opts.sunHour ?? DEFAULT_RENDER_SUN.hour;
    const sun = sunPosition(SUN_DATES.find(d => d.key === sunKey)?.dayOfYear ?? 80, solarHour, data.origin.latDeg);
    const appearance = { preset: opts.preset ?? 'daylight', style: opts.style, kit: siteAssets.version, assets_sha256: await digest(siteAssets), build: BUILD_SHA };
    const quantities = {
      buildings: scene.buildings.length,
      stories: scene.buildings.map(x => x.height.levelsFt.length),
      units: scene.schedule.units ?? scene.schedule.buildingUnits,
      stalls: scene.schedule.stalls ?? scene.schedule.featureStalls,
      gross_sf: opts.grossSf && opts.grossSf > 0 ? opts.grossSf : null,
    };
    const job: RenderJob = {
      schema_version: RENDER_JOB_SCHEMA,
      units: 'ft',
      frame: 'local east, north, up; origin at the centre of the plan',
      origin: { lat_deg: data.origin.latDeg, lon_deg: data.origin.lonDeg },
      site: { parcel_id: scene.identity.parcelId, scheme_id: scene.identity.schemeId, revision: scene.identity.revision },
      scheme_sha256: await digest({
        identity: scene.identity, parcel: scene.parcel, features: scene.features, quantities,
        heights: scene.buildings.map(b => ({ id: b.id, height: b.height })),
        pads: grade?.padList,
      }),
      appearance: { ...appearance, sha256: await digest(appearance) },
      quantities,
      glb: { file: opts.glbFile ?? 'scene.glb', sha256, bytes: glb.byteLength, units: 'metres (the glTF format requires them)', axes: 'x east, y up, z south' },
      mesh_groups,
      bounds_ft,
      known: (() => {
        const e = main?.id ? extents.get(`building:${main.id}`) : undefined;
        if (!main?.id || !e) return null;
        return { id: main.id, mesh_prefix: `building:${main.id}__`, top_ft: ft(e.max.z), span_ft: [ft(e.max.x - e.min.x), ft(e.max.y - e.min.y)] as [number, number], drawing_height_ft: ft(main.height) };
      })(),
      planting: { trees: model.ground.trees.map(t => ({ id: plantId(t[0], t[1]), position_ft: [ft(t[0]), ft(t[1]), ft(groundAt(t[0], t[1]))] as [number, number, number], crown_radius_ft: ft(t[2]) })),
        shrubs: data.shrubs.map(b => ({ id: plantId(b[0], b[1], 'shrub'), position_ft: [ft(b[0]), ft(b[1]), ft(groundAt(b[0], b[1]))] as [number, number, number], radius_ft: ft(b[2] * 1.7) })),
        shared: [...shared],
      },
      omitted: ['Distant crowns use simplified counterparts.', ...(vehicles ? [] : ['Vehicles use the plan’s simplified geometry.'])],
      terrain: terrain ? {
        source: terrain.source, datum: 'NAVD88', samples: terrain.samples,
        zero_elevation_ft: terrain.zeroFt,
        sampled_range_ft: terrain.rangeFt,
        coverage: `Sampled on a 20 ft grid over the parcel and a 100 ft margin. Past that there are no elevations: the edge is held and eased to one level over ${Math.round(60 / FT)} ft.`,
        grading: grade?.grading ?? null,
        pads: grade?.padList ?? [],
      } : null,
      cameras,
      lighting: { sun_azimuth_deg: Math.round(sun.azimuthDeg * 100) / 100, sun_altitude_deg: Math.round(sun.altitudeDeg * 100) / 100, sun_date: sunKey, solar_hour: solarHour, exposure_ev: 0, seed: 1, sky: siteAssets.sky.file, sky_rotation_deg: siteAssets.sky.rotation_deg },
      anchors,
      renderer: { preset: opts.preset ?? 'daylight', style: opts.style, asset_version: siteAssets.version },
    };
    return { glb, job };
  } finally {
    model.dispose();
  }
}


/**
 * Flat pieces lying at one height (road ribbons, pavement plates) overlap each
 * other where they meet. A rasteriser draws that without trouble; a ray tracer
 * shades each piece in the other's shadow and the overlap comes out black. This
 * joins the pieces at each height into single outlines. No surface moves: the
 * result covers exactly the ground the pieces covered, at the same height.
 */
export function dissolveFlat(list: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const levels = new Map<number, { template: THREE.BufferGeometry; sources: THREE.BufferGeometry[]; tris: Array<[number, number][][]> }>();
  for (const g of list) {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    let flat = pos.count >= 3 && !!nor;
    const z0 = pos.count ? pos.getZ(0) : 0;
    for (let i = 0; flat && i < pos.count; i++) if (Math.abs(pos.getZ(i) - z0) > 1e-6 || nor!.getZ(i) < 0.99) flat = false;
    if (!flat) { out.push(g.clone()); continue; }
    const key = Math.round(z0 * 1e5);
    const level = levels.get(key) ?? { template: g, sources: [], tris: [] };
    level.sources.push(g);
    const idx = g.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const [a, b, c] = [0, 1, 2].map(k => (idx ? idx.getX(i + k) : i + k)) as [number, number, number];
      const ring: [number, number][] = [[pos.getX(a), pos.getY(a)], [pos.getX(b), pos.getY(b)], [pos.getX(c), pos.getY(c)]];
      const area = (ring[1]![0] - ring[0]![0]) * (ring[2]![1] - ring[0]![1]) - (ring[2]![0] - ring[0]![0]) * (ring[1]![1] - ring[0]![1]);
      if (Math.abs(area) > 1e-9) level.tris.push([[...ring, ring[0]!]]);
    }
    levels.set(key, level);
  }
  for (const [key, level] of levels) {
    if (!level.tris.length) continue;
    const z = key / 1e5;
    let joined: [number, number][][][];
    try {
      joined = polygonClipping.union(level.tris[0]!, ...level.tris.slice(1)) as [number, number][][][];
    } catch {
      // a shape the joiner cannot take: keep the pieces as they were
      for (const g of level.sources) out.push(g.clone());
      continue;
    }
    for (const poly of joined) {
      const [outer, ...holes] = poly;
      if (!outer || outer.length < 4) continue;
      const shape = new THREE.Shape(outer.slice(0, -1).map(p => new THREE.Vector2(p[0], p[1])));
      for (const h of holes) shape.holes.push(new THREE.Path(h.slice(0, -1).map(p => new THREE.Vector2(p[0], p[1]))));
      let sheet: THREE.BufferGeometry = new THREE.ShapeGeometry(shape);
      if (!level.template.getIndex()) { const flatSheet = sheet.toNonIndexed(); sheet.dispose(); sheet = flatSheet; }
      const pos = sheet.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setZ(i, z);
      // the same attributes as the pieces it replaces, so it merges with its neighbours
      for (const name of Object.keys(sheet.attributes)) if (name !== 'position' && !level.template.getAttribute(name)) sheet.deleteAttribute(name);
      for (const name of Object.keys(level.template.attributes)) {
        if (name === 'position') continue;
        const src = level.template.getAttribute(name) as THREE.BufferAttribute;
        const Ctor = src.array.constructor as new (n: number) => THREE.TypedArray;
        const arr = new Ctor(pos.count * src.itemSize);
        const attr = new THREE.BufferAttribute(arr, src.itemSize, src.normalized);
        const fromSheet = name === 'uv' ? (sheet.getAttribute('uv') as THREE.BufferAttribute | undefined) : undefined;
        for (let i = 0; i < pos.count; i++) for (let k = 0; k < src.itemSize; k++) {
          // one value for the whole sheet (its colour, its upward normal), except the texture coordinates
          arr[i * src.itemSize + k] = fromSheet && k < 2 ? (k === 0 ? fromSheet.getX(i) : fromSheet.getY(i)) : (src.array[k] as number);
        }
        sheet.setAttribute(name, attr);
      }
      out.push(sheet);
    }
  }
  return out;
}


