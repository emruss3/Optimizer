// A tab that stays open across a release (audit cf4f0e8, R3): the page was built against one set
// of files, and a part it fetches late (the 3D view, the home studio) may no longer be on the
// server once a new release replaces them. The import then fails with a 404. That is not a broken
// renderer and not a network blip, and retrying the same import cannot succeed: the file is gone.
//
// This module tells the cases apart, so the planner can say which it is, keep the plan, and offer
// the new release only after the work is kept.
import { mark } from './timeline';

/** A part of the app could not be fetched. */
export class ChunkLoadError extends Error {
  readonly chunk: string;
  /** The file was not on the server (replaced by a newer release). */
  readonly missing: boolean;
  /** The address the failed file was asked for, when the browser said. */
  readonly url: string | null;
  constructor(chunk: string, cause: unknown, missing: boolean, url: string | null) {
    super(missing
      ? `The ${chunk} files of this tab's release are no longer on the server`
      : `The ${chunk} files could not be fetched${cause instanceof Error ? `: ${cause.message}` : ''}`);
    this.name = 'ChunkLoadError';
    this.chunk = chunk;
    this.missing = missing;
    this.url = url;
  }
}

const CHUNK_MESSAGES = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading chunk [\w-]+ failed/i,
];

/** Whether an error is a failed fetch of one of the app's own files. */
export function isChunkLoadError(err: unknown): boolean {
  if (err instanceof ChunkLoadError) return true;
  if (!(err instanceof Error)) return false;
  return err.name === 'ChunkLoadError' || CHUNK_MESSAGES.some(re => re.test(err.message));
}

/** The address in a browser's import error, if it gave one. */
export function chunkUrlFrom(err: unknown): string | null {
  const m = err instanceof Error ? /(https?:\/\/\S+?\.(?:m?js|css))/.exec(err.message) : null;
  return m?.[1] ?? null;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Whether the server still has the file: false on a 404/410, null when it could not be asked. */
export async function chunkStillServed(url: string | null, fetcher: Fetcher = fetch): Promise<boolean | null> {
  if (!url) return null;
  try {
    const res = await fetcher(url, { method: 'HEAD', cache: 'no-store' });
    if (res.status === 404 || res.status === 410) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

/** The entry script this page was built with, e.g. /assets/index-AbC123.js. */
export function currentEntry(doc: Document = document): string | null {
  const s = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!s) return null;
  try { return new URL(s.src, doc.baseURI).pathname; } catch { return s.getAttribute('src'); }
}

/** The entry script the server hands a new tab now, read from its index page. */
export async function latestEntry(fetcher: Fetcher = fetch, base = '/'): Promise<string | null> {
  try {
    const res = await fetcher(base, { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/.exec(html) ?? /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html);
    if (!m?.[1]) return null;
    try { return new URL(m[1], 'http://x').pathname; } catch { return m[1]; }
  } catch {
    return null;
  }
}

/** Whether a newer release is being served than the one this tab runs. */
export async function newerReleaseServed(fetcher: Fetcher = fetch, doc: Document = document): Promise<boolean | null> {
  const mine = currentEntry(doc);
  const now = await latestEntry(fetcher);
  if (!mine || !now) return null;
  return mine !== now;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch one of the app's late parts. A failed fetch whose file is still on the server is a blip
 * and is tried once more; a file the server no longer has is reported as missing (a newer release
 * replaced it), with no second try, since the same address cannot succeed.
 */
export async function loadChunk<T>(chunk: string, factory: () => Promise<T>, opts: { fetcher?: Fetcher; retryMs?: number } = {}): Promise<T> {
  try {
    return await factory();
  } catch (first) {
    if (!isChunkLoadError(first)) throw first;
    const url = chunkUrlFrom(first);
    const served = await chunkStillServed(url, opts.fetcher);
    if (served === false) {
      mark('chunk-missing', { chunk, url });
      throw new ChunkLoadError(chunk, first, true, url);
    }
    await wait(opts.retryMs ?? 800);
    try {
      return await factory();
    } catch (second) {
      if (!isChunkLoadError(second)) throw second;
      // after a second failure, ask whether the release moved on, even without an address to check
      const newer = served == null ? await newerReleaseServed(opts.fetcher) : false;
      mark('chunk-failed', { chunk, url, newer });
      throw new ChunkLoadError(chunk, second, newer === true, url);
    }
  }
}
