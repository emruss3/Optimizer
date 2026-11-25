import { describe, it, expect } from 'vitest';
import { claimsProblem, objectRule } from './policy';

const good = {
  repository: 'emruss3/Optimizer',
  ref: 'refs/heads/main',
  workflow_ref: 'emruss3/Optimizer/.github/workflows/parcel-tiles.yml@refs/heads/main',
  event_name: 'workflow_dispatch',
};

describe('who the parcel-tiles broker accepts', () => {
  it('accepts a hand-started run of the parcel-tiles workflow on main', () => {
    expect(claimsProblem(good)).toBeNull();
  });

  it('refuses another repository, a branch, another workflow or a non-manual event', () => {
    expect(claimsProblem({ ...good, repository: 'someone/Optimizer' })).toMatch(/repository/);
    expect(claimsProblem({ ...good, ref: 'refs/heads/claude/eager-bell-SSYei' })).toMatch(/ref/);
    expect(claimsProblem({ ...good, ref: 'refs/pull/1/merge' })).toMatch(/ref/);
    expect(claimsProblem({ ...good, workflow_ref: 'emruss3/Optimizer/.github/workflows/ci.yml@refs/heads/main' })).toMatch(/workflow/);
    expect(claimsProblem({ ...good, event_name: 'pull_request_target' })).toMatch(/event/);
    expect(claimsProblem({})).not.toBeNull();
  });
});

describe('what the parcel-tiles broker may write', () => {
  const release = '2026-11-24_regrid-2025-05-29_abc1234';

  it('allows release tiles, the release manifest and the live manifest, each with its own cache rule', () => {
    expect(objectRule(`releases/${release}/17/33930/51412.pbf`)).toEqual({ contentType: 'application/vnd.mapbox-vector-tile', cacheControl: 'public, max-age=31536000, immutable' });
    expect(objectRule(`releases/${release}/manifest.json`)).toMatchObject({ contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' });
    expect(objectRule('manifest.json')).toMatchObject({ contentType: 'application/json', cacheControl: 'public, max-age=60' });
  });

  it('refuses anything else', () => {
    for (const key of [
      'index.html', 'releases/x/notes.txt', `releases/${release}/17/33930/51412.mvt`,
      `releases/../manifest.json`, `releases/${release}//17/1/1.pbf`, `releases/.hidden/1/0/0.pbf`,
      `releases/${release}/3/9/0.pbf`, `releases/${release}/23/0/0.pbf`, 'other/manifest.json', '',
    ]) expect(objectRule(key)).toHaveProperty('problem');
  });
});
