// What the parcel-tiles CI broker allows (docs/PARCEL_TILES.md, section 3).
// Pure functions, so the rules are tested without Deno or the network.

export const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'parcel-tiles';
export const REPOSITORY = 'emruss3/Optimizer';
export const WORKFLOW_PATH = '.github/workflows/parcel-tiles.yml';
export const BRANCH_REF = 'refs/heads/main';
export const BUCKET = 'parcel-tiles';

export const TILE_TYPE = 'application/vnd.mapbox-vector-tile';
export const JSON_TYPE = 'application/json';

type Claims = Record<string, unknown>;

/**
 * Who may call: only a run of this repository's parcel-tiles workflow, from
 * main. The signature, issuer, audience and expiry are checked before this, by
 * jwtVerify against GitHub's published keys. Returns the reason for a refusal,
 * or null.
 */
export function claimsProblem(c: Claims): string | null {
  if (c.repository !== REPOSITORY) return `repository ${String(c.repository)} is not ${REPOSITORY}`;
  if (c.ref !== BRANCH_REF) return `ref ${String(c.ref)} is not ${BRANCH_REF}`;
  const want = `${REPOSITORY}/${WORKFLOW_PATH}@${BRANCH_REF}`;
  if (c.workflow_ref !== want) return `workflow ${String(c.workflow_ref)} is not ${want}`;
  if (c.event_name !== 'workflow_dispatch') return `event ${String(c.event_name)} is not workflow_dispatch`;
  return null;
}

const RELEASE = '[A-Za-z0-9][A-Za-z0-9._-]{0,99}';
const TILE_KEY = new RegExp(`^releases/${RELEASE}/(\\d{1,2})/(\\d{1,7})/(\\d{1,7})\\.pbf$`);
const RELEASE_MANIFEST = new RegExp(`^releases/${RELEASE}/manifest\\.json$`);

/**
 * What may be written: tiles and a manifest under releases/<release>/, and the
 * one live manifest.json. Nothing else, and nothing is ever deleted. Returns
 * the content type and cache header the object gets, or a refusal.
 */
export function objectRule(key: string): { contentType: string; cacheControl: string } | { problem: string } {
  if (key.includes('..') || key.includes('//')) return { problem: 'the key has an empty or parent segment' };
  const t = TILE_KEY.exec(key);
  if (t) {
    const z = Number(t[1]), x = Number(t[2]), y = Number(t[3]);
    if (z > 22 || x >= 2 ** z || y >= 2 ** z) return { problem: `tile ${z}/${x}/${y} does not exist` };
    return { contentType: TILE_TYPE, cacheControl: 'public, max-age=31536000, immutable' };
  }
  if (RELEASE_MANIFEST.test(key)) return { contentType: JSON_TYPE, cacheControl: 'public, max-age=31536000, immutable' };
  if (key === 'manifest.json') return { contentType: JSON_TYPE, cacheControl: 'public, max-age=60' };
  return { problem: `the key ${key} is not a release tile, a release manifest or manifest.json` };
}

export const MAX_OBJECT_BYTES = 1_000_000;
export const MAX_EXPORT_PAGE = 5000;
