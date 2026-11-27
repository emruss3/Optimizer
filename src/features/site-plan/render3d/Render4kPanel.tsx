import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { DrawingScene } from '../scene/types';
import type { MassingData } from '../ui/massingData';
import type { RenderCameraId, RenderJob } from './exportJob';

const service = (import.meta.env.VITE_RENDER_SERVICE_URL as string | undefined)?.replace(/\/+$/, '');
const CAMERAS: Record<RenderCameraId, string> = { street: 'Street', drone: 'Aerial', approach: 'Entry' };
type Package = { glb: ArrayBuffer; job: RenderJob };
type JobStatus = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  revision: string;
  appearance: RenderJob['appearance'];
  cameras: RenderCameraId[];
  files: string[];
  error: string | null;
  reused?: boolean;
};
type Props = {
  data: MassingData;
  scene: DrawingScene;
  style: string;
  sunKey: string;
  sunHour: number;
  grossSf?: number | null | undefined;
  savedPlanId?: string | undefined;
  camera: RenderCameraId;
  alleyPavers?: boolean | undefined;
  onClose: () => void;
};

async function request(path: string, signal: AbortSignal, init: RequestInit = {}) {
  const { data } = await supabase?.auth.getSession() ?? {};
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sign in to send this scene to the render service.');
  const response = await fetch(`${service}/v1/jobs${path}`, {
    ...init, mode: 'cors', signal, credentials: 'omit', headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.error ?? 'The render service could not complete the request.');
  }
  return response;
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const action = 'rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50';
const secondary = 'rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50';
const pending = (status?: JobStatus['status']) => status === 'queued' || status === 'running';
const describeError = (error: unknown) => error instanceof Error ? error.message : 'The render request could not be completed.';

export function Render4kPanel({ data, scene, style, sunKey, sunHour, grossSf, savedPlanId, camera, alleyPavers, onClose }: Props) {
  const [bundle, setBundle] = useState<Package | null>(null);
  const [choice, setChoice] = useState<RenderCameraId>(camera);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const life = useRef<AbortController>();
  const fileName = `parcel-${scene.identity.parcelId}-${scene.identity.revision}`.replace(/[^a-z0-9_-]/gi, '-');

  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    setBundle(null);
    setJob(null);
    setError(undefined);
    void import('./exportJob').then(({ buildRenderJob }) =>
      buildRenderJob(data, scene, { style, sunKey, sunHour, grossSf, alleyPavers }),
    ).then(result => {
      if (!active) return;
      setBundle(result);
      setChoice(result.job.cameras.some(c => c.id === camera) ? camera : 'drone');
    }).catch(e => { if (active) setError(describeError(e)); });
    return () => { active = false; };
  }, [data, scene, style, sunKey, sunHour, grossSf, camera, alleyPavers, refresh]);

  const jobId = job?.id, jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !pending(jobStatus) || error) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await request(`/${jobId}`, controller.signal);
        const next: JobStatus = await response.json();
        if (controller.signal.aborted) return;
        setJob(next);
        if (pending(next.status)) timer = setTimeout(poll, 2500);
      } catch (e) {
        if (!controller.signal.aborted) setError(describeError(e));
      }
    };
    timer = setTimeout(poll, 1200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus, error]);

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    const signal = life.current?.signal;
    if (!signal || signal.aborted) return;
    setBusy(true);
    setError(undefined);
    try {
      await task(signal);
    } catch (e) {
      if (!signal.aborted) setError(describeError(e));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  function queue() {
    if (!bundle) return;
    void run(async signal => {
      const form = new FormData();
      form.set('manifest', JSON.stringify(bundle.job));
      form.set('cameras', JSON.stringify([choice]));
      if (savedPlanId) form.set('saved_plan_id', savedPlanId);
      const sceneBlob = new Blob([bundle.glb], { type: 'model/gltf-binary' });
      if (typeof CompressionStream !== 'undefined') {
        const packed = await new Response(sceneBlob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        form.set('scene', packed, 'scene.glb.gz');
        form.set('encoding', 'gzip');
      } else {
        form.set('scene', sceneBlob, 'scene.glb');
      }
      const response = await request('', signal, { method: 'POST', body: form });
      setJob(await response.json());
    });
  }

  function localExport() {
    if (!bundle) return;
    void run(async signal => {
      const { zip, strToU8 } = await import('three/examples/jsm/libs/fflate.module.js');
      const contents = {
        'scene.glb': new Uint8Array(bundle.glb),
        'render-job.json': strToU8(JSON.stringify(bundle.job, null, 2)),
        'render.txt': strToU8(`Parcel ${scene.identity.parcelId} · Revision ${scene.identity.revision}\n` +
          `Open this package in Parcel Proforma's scripts/render4k renderer.\n\n` +
          `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/render4k/render_job.py -- render-job.json --cameras ${choice}\n`),
      };
      const bytes = await new Promise<Uint8Array>((resolve, reject) =>
        zip(contents, { level: 4 }, (err, result) => err ? reject(err) : resolve(result)));
      if (!signal.aborted) save(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), `${fileName}-render.zip`);
    });
  }

  return (
    <section className="absolute right-2 top-16 z-20 w-80 max-w-[calc(100%-1rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg"
      aria-label="4K render" data-testid="render-4k-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{service ? '4K render' : '4K scene pack (offline)'}</h2>
        <button type="button" aria-label="Close 4K render" className="px-2 py-1 text-lg leading-none text-slate-500 hover:text-slate-900" onClick={onClose}>×</button>
      </div>
      <p className="mt-1 text-slate-600">3840 × 2160 · revision {scene.identity.revision}</p>
      {!bundle && !error && <p className="mt-3" role="status">Preparing the scene and its cameras…</p>}
      {bundle && <>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span>View</span>
          <select value={choice} className="rounded border border-slate-300 bg-white px-2 py-1"
            disabled={busy || pending(jobStatus)} onChange={e => { setChoice(e.target.value as RenderCameraId); setJob(null); setError(undefined); }}>
            {bundle.job.cameras.map(c => <option key={c.id} value={c.id}>{CAMERAS[c.id]}</option>)}
          </select>
        </label>
        {job && <p className="mt-3" role="status" data-testid="render-4k-status">
          {job.status === 'queued' && 'Queued'}
          {job.status === 'running' && 'Rendering in Cycles…'}
          {job.status === 'completed' && (job.reused ? 'Existing render ready' : 'Render ready')}
          {job.status === 'failed' && (job.error ?? 'The render failed.')}
        </p>}
        {job?.status === 'completed' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {job.files.map(file => <button key={file} type="button" className={secondary} disabled={busy}
              onClick={() => void run(async signal => {
                const response = await request(`/${job.id}/files/${file}`, signal);
                save(await response.blob(), `${fileName}-${file}`);
              })}>{file.endsWith('.png') ? 'Download PNG' : file.endsWith('.exr') ? 'Download EXR' : file === 'render-job.json' ? 'Manifest' : 'Report'}</button>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {service && !job && <button className={action} type="button" disabled={busy} onClick={queue}>{busy ? 'Preparing upload…' : 'Request render'}</button>}
          {service && job?.status === 'failed' && <button className={action} type="button" disabled={busy} onClick={() =>
            void run(async signal => {
              const response = await request(`/${job.id}/retry`, signal, { method: 'POST' });
              setJob(await response.json());
            })}>Retry render</button>}
          <button type="button" className={service ? secondary : action} disabled={busy} onClick={localExport} data-testid="render-4k-export">
            Export scene ZIP
          </button>
        </div>
        {!service && <p className="mt-2 text-slate-600" data-testid="render-4k-offline">No render service is connected, so no finished 4K image is made here. The ZIP holds this revision's scene, cameras and instructions; rendering it in Blender produces the 3840 × 2160 image.</p>}
      </>}
      {error && <div className="mt-3 space-y-2">
        <p role="alert" className="text-amber-800">{error}</p>
        {!bundle && <button type="button" className={secondary} onClick={() => setRefresh(n => n + 1)}>Prepare scene again</button>}
        {pending(jobStatus) && <button type="button" className={secondary} onClick={() => setError(undefined)}>Resume checking</button>}
      </div>}
    </section>
  );
}
