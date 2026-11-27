import { describe, it, expect, vi } from 'vitest';
import { ChunkLoadError, chunkStillServed, chunkUrlFrom, isChunkLoadError, latestEntry, loadChunk } from './staleBuild';

const importError = (url: string) => new TypeError(`Failed to fetch dynamically imported module: ${url}`);
const res = (status: number, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body }) as Response;

describe('a tab left open across a release (audit cf4f0e8, R3)', () => {
  it('recognises the browsers\' failed-import errors and reads the address', () => {
    const e = importError('https://app.example/assets/Massing3D-CndDccb2.js');
    expect(isChunkLoadError(e)).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('WebGL context lost'))).toBe(false);
    expect(chunkUrlFrom(e)).toBe('https://app.example/assets/Massing3D-CndDccb2.js');
  });

  it('calls a 404 missing and anything unanswerable unknown', async () => {
    expect(await chunkStillServed('https://x/a.js', async () => res(404))).toBe(false);
    expect(await chunkStillServed('https://x/a.js', async () => res(200))).toBe(true);
    expect(await chunkStillServed('https://x/a.js', async () => { throw new Error('offline'); })).toBeNull();
    expect(await chunkStillServed(null)).toBeNull();
  });

  it('reports a replaced file as missing at once, without asking for it again', async () => {
    const factory = vi.fn(async () => { throw importError('https://app.example/assets/Massing3D-old.js'); });
    const err = await loadChunk('3D view', factory, { fetcher: async () => res(404), retryMs: 0 }).catch(e => e);
    expect(err).toBeInstanceOf(ChunkLoadError);
    expect((err as ChunkLoadError).missing).toBe(true);
    expect((err as ChunkLoadError).chunk).toBe('3D view');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('tries a blip once more and succeeds', async () => {
    let n = 0;
    const factory = vi.fn(async () => { if (n++ === 0) throw importError('https://app.example/assets/Massing3D-a.js'); return { default: 'ok' }; });
    expect(await loadChunk('3D view', factory, { fetcher: async () => res(200), retryMs: 0 })).toEqual({ default: 'ok' });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('passes on errors that are not failed fetches untouched', async () => {
    const boom = new Error('shader failed');
    await expect(loadChunk('3D view', async () => { throw boom; })).rejects.toBe(boom);
  });

  it('reads the entry script a new tab would get', async () => {
    const html = '<html><head><script type="module" crossorigin src="/assets/index-NEW123.js"></script></head></html>';
    expect(await latestEntry(async () => res(200, html))).toBe('/assets/index-NEW123.js');
    expect(await latestEntry(async () => res(500))).toBeNull();
  });
});
