import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';

export const MAX_SCENE = 128 * 1024 * 1024;
export const MAX_MANIFEST = 6 * 1024 * 1024;
export const MAX_UPLOAD = MAX_SCENE + MAX_MANIFEST + 8192;
export const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().min(1).max(256);
const coord = z.number().min(-1_000_000).max(1_000_000);
const point = z.tuple([coord, coord, coord]);
const pair = z.tuple([coord, coord]);
const id = z.enum(['street', 'drone', 'approach']);
const camera = z.object({
  id, position_ft: point, target_ft: point,
  focal_length_mm: z.number().min(10).max(150), sensor_width_mm: z.literal(36),
  shift_y: z.number().min(0).max(0.5), aspect: z.literal(16 / 9),
  clip_ft: z.tuple([z.number().positive(), z.number().positive().max(1_000_000)]),
  resolution: z.tuple([z.literal(3840), z.literal(2160)]),
}).refine(c => c.clip_ft[0] < c.clip_ft[1] && c.position_ft.some((x, i) => x !== c.target_ft[i]));
const bounded = z.number().int().nonnegative().max(10_000_000);
const manifest = z.object({
  schema_version: z.literal(1), units: z.literal('ft'),
  site: z.object({ parcel_id: name, scheme_id: name, revision: name }),
  scheme_sha256: hash,
  appearance: z.object({ preset: z.literal('daylight'), style: name, kit: name, assets_sha256: hash, build: name, sha256: hash }),
  quantities: z.object({ buildings: bounded, stories: z.array(bounded).max(10_000), units: bounded.nullable(), stalls: bounded.nullable(), gross_sf: z.number().positive().nullable() }),
  glb: z.object({ file: z.literal('scene.glb'), sha256: hash, bytes: z.number().int().positive().max(MAX_SCENE) }),
  mesh_groups: z.array(z.object({ id: name, owner: name, slot: name, triangles: bounded })).min(1).max(20_000),
  bounds_ft: z.object({ min: point, max: point, size: point }),
  known: z.object({ id: name, mesh_prefix: name, top_ft: coord, span_ft: pair }).nullable(),
  cameras: z.array(camera).min(1).max(3),
  planting: z.object({
    trees: z.array(z.object({ id: name, position_ft: point, crown_radius_ft: z.number().positive().max(150) })).max(20_000),
    shrubs: z.array(z.object({ id: name, position_ft: point, radius_ft: z.number().positive().max(50) })).max(5_000),
    shared: z.array(name).max(20_000).optional(),
  }),
  renderer: z.object({ preset: z.literal('daylight'), style: name, asset_version: name }),
  anchors: z.array(z.object({ id: name, position_ft: point, expected_px: z.partialRecord(id, pair) })).max(2_000),
  lighting: z.object({
    sun_azimuth_deg: z.number().min(0).max(360), sun_altitude_deg: z.number().min(-90).max(90),
    exposure_ev: z.number().min(-4).max(4), seed: bounded, sky: name, sky_rotation_deg: z.number().min(-360).max(360),
  }),
});
const selection = z.array(id).min(1).max(3);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = detail => new HttpError(400, detail);

function readJson(raw, message) {
  try {
    return JSON.parse(raw);
  } catch {
    throw invalid(message);
  }
}

/** The workspace exports ordinary static GLB geometry with one embedded buffer. */
function validateGlb(glb, job) {
  if (glb.length < 28 || glb.length !== job.glb.bytes || sha256(glb) !== job.glb.sha256 ||
    glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length) {
    throw invalid('Scene geometry does not match its manifest.');
  }
  const end = 20 + glb.readUInt32LE(12);
  if (end + 8 >= glb.length || end % 4 || glb.readUInt32LE(16) !== 0x4e4f534a ||
    glb.readUInt32LE(end + 4) !== 0x004e4942 || end + 8 + glb.readUInt32LE(end) !== glb.length) {
    throw invalid('The scene must contain one JSON chunk and one binary chunk.');
  }
  const model = readJson(glb.toString('utf8', 20, end), 'The scene JSON is invalid.');
  const uint = value => Number.isInteger(value) && value >= 0;
  const sections = model?.bufferViews;
  const accessors = model?.accessors;
  const images = model?.images ?? [];
  if (model?.asset?.version !== '2.0' || model.buffers?.length !== 1 || model.buffers[0]?.uri !== undefined ||
    !uint(model.buffers[0]?.byteLength) || model.buffers[0].byteLength > glb.length - end - 8 ||
    (model.extensionsUsed ?? []).some(extension => extension !== 'KHR_texture_transform') ||
    model.extensionsRequired?.length || model.animations !== undefined || model.skins !== undefined ||
    !Array.isArray(model.nodes) || model.nodes.length !== job.mesh_groups.length ||
    !Array.isArray(model.meshes) || !Array.isArray(sections) || !Array.isArray(accessors) || !Array.isArray(images) ||
    images.length > 32 || sections.length > 100_000 || accessors.length > 100_000) {
    throw invalid('Use a static scene exported from the 3D workspace.');
  }
  if (sections.some(v => v?.buffer !== 0 || !uint(v.byteOffset ?? 0) || !uint(v.byteLength) ||
    (v.byteOffset ?? 0) + v.byteLength > model.buffers[0].byteLength)) throw invalid('The scene has an invalid buffer view.');
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  if (accessors.some(a => {
    const section = sections[a?.bufferView], elementSize = bytes[a?.componentType] * components[a?.type];
    return !section || !elementSize || !uint(a.count) || !uint(a.byteOffset ?? 0) || a.sparse !== undefined ||
      (a.byteOffset ?? 0) + a.count * (section.byteStride ?? elementSize) > section.byteLength;
  })) throw invalid('The scene has invalid geometry attributes.');
  if (images.some(entry => {
    const view = sections[entry?.bufferView];
    if (!view || entry.uri !== undefined || entry.mimeType !== 'image/png' || view.byteLength < 24 || view.byteLength > 8_388_608) return true;
    const start = end + 8 + (view.byteOffset ?? 0);
    return glb.readBigUInt64BE(start) !== 0x89504e470d0a1a0an ||
      glb.readUInt32BE(start + 16) > 4096 || glb.readUInt32BE(start + 20) > 4096;
  })) throw invalid('The scene has unsupported texture data.');
  if (!model.meshes.every(mesh => {
    const p = mesh?.primitives?.[0];
    return mesh?.primitives?.length === 1 && [undefined, 4].includes(p?.mode) &&
      accessors[p?.attributes?.POSITION]?.type === 'VEC3' &&
      (p.indices === undefined || accessors[p.indices]?.type === 'SCALAR');
  })) {
    throw invalid('The render scene contains unsupported meshes.');
  }
  const groups = new Map(job.mesh_groups.map(g => [g.id, g]));
  let triangles = 0;
  for (const node of model.nodes) {
    const g = groups.get(node?.extras?.id), primitive = model.meshes[node?.mesh]?.primitives[0];
    if (!g || g.slot !== node.extras.slot || node.children?.length || !primitive) throw invalid('The scene mesh list is invalid.');
    const n = (accessors[primitive.indices]?.count ?? accessors[primitive.attributes.POSITION].count) / 3;
    if (g.triangles !== n) throw invalid('The scene triangle count does not match its manifest.');
    triangles += n;
    groups.delete(g.id);
  }
  if (triangles > 4_000_000) throw new HttpError(413, 'The scene exceeds the render geometry limit.');
}

export async function readRenderInput(req, catalog) {
  const contentType = req.headers['content-type'];
  if (!contentType?.startsWith('multipart/form-data;')) throw invalid('Upload the scene as form data.');
  if (Number(req.headers['content-length']) > MAX_UPLOAD) throw new HttpError(413, 'The scene exceeds the upload limit.');
  let size = 0;
  const chunks = [];
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    size += part.length;
    if (size > MAX_UPLOAD) {
      req.resume();
      throw new HttpError(413, 'The scene exceeds the upload limit.');
    }
    chunks.push(part);
  }
  const body = Buffer.concat(chunks, size);
  const form = await new Response(body, { headers: { 'content-type': contentType } }).formData().catch(() => {
    throw invalid('The scene upload is incomplete.');
  });
  const raw = form.get('manifest');
  const file = form.get('scene');
  const encoding = form.get('encoding') ?? 'identity';
  const savedPlanId = form.get('saved_plan_id');
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_MANIFEST || !(file instanceof Blob) ||
    (savedPlanId !== null && (typeof savedPlanId !== 'string' || !UUID.test(savedPlanId))) ||
    !['gzip', 'identity'].includes(encoding)) throw invalid('The scene upload is missing a valid manifest or geometry.');
  const job = readJson(raw, 'The render manifest is invalid.');
  const parsed = manifest.safeParse(job);
  if (!parsed.success) throw invalid('The scene manifest is unsupported. Reopen 3D and export the active scheme again.');
  const { appearance, cameras, renderer, lighting } = parsed.data;
  if (appearance.kit !== catalog.version || renderer.asset_version !== catalog.version ||
    appearance.assets_sha256 !== sha256(JSON.stringify(catalog)) || lighting.sky !== catalog.sky.file ||
    appearance.style !== renderer.style ||
    appearance.sha256 !== sha256(JSON.stringify({
      preset: appearance.preset, style: appearance.style, kit: appearance.kit,
      assets_sha256: appearance.assets_sha256, build: appearance.build,
    }))) {
    throw new HttpError(409, 'The viewer and render worker use different asset versions. Reload the app and try again.');
  }
  const ids = new Set(cameras.map(c => c.id));
  const requested = selection.safeParse(readJson(form.get('cameras'), 'Choose a render camera.'));
  if (!requested.success || ids.size !== cameras.length || new Set(requested.data).size !== requested.data.length ||
    requested.data.some(c => !ids.has(c))) throw invalid('Choose a camera available for this scheme.');
  if (job.mesh_groups.reduce((n, g) => n + g.triangles, 0) > 4_000_000) {
    throw new HttpError(413, 'The scene exceeds the render geometry limit.');
  }
  let glb = Buffer.from(await file.arrayBuffer());
  if (encoding === 'gzip') {
    try {
      glb = gunzipSync(glb, { maxOutputLength: MAX_SCENE });
    } catch {
      throw invalid('The compressed scene is invalid or too large.');
    }
  }
  validateGlb(glb, job);
  return { job, glb, savedPlanId, cameras: requested.data.sort() };
}
