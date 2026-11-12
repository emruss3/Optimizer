// The app's side of the photoreal pass: send a picture of the 3D view to the
// app's own function (api/photoreal.js) and get a photoreal impression back.
// Only the picture leaves the browser, with which view it is and what kind of
// building stands on the site. The key to the image model is never here.
import { supabase } from '../../../lib/supabase';
import type { DrawingScene } from '../scene/types';

export interface PhotorealRequest {
  /** The view as a `data:image/jpeg;base64,…` URL. */
  image: string;
  view: 'aerial' | 'street';
  product: 'houses' | 'townhomes' | 'apartments';
  stories: number;
  /** The architectural style the view is drawn in, so the picture keeps it. */
  style?: 'mansard' | 'farmhouse' | 'modern' | 'heritage';
}

export interface PhotorealResult {
  image: string;
  model: string;
}

/** What stands on the site, in the words the function knows. */
export function describeScene(scene: DrawingScene): Pick<PhotorealRequest, 'product' | 'stories'> {
  const uses = new Set(scene.buildings.map(b => b.use));
  const product = uses.has('apartments') ? 'apartments' : uses.has('townhome') ? 'townhomes' : 'houses';
  const stories = scene.buildings.reduce((m, b) => Math.max(m, b.floors.value), 1);
  return { product, stories };
}

/** A canvas as a JPEG no wider than `maxWidth`: small enough to send, large enough to guide the model. */
export function canvasToJpeg(source: HTMLCanvasElement, maxWidth = 1536, quality = 0.9): string {
  const scale = Math.min(1, maxWidth / Math.max(1, source.width));
  if (scale === 1) return source.toDataURL('image/jpeg', quality);
  const c = document.createElement('canvas');
  c.width = Math.round(source.width * scale);
  c.height = Math.round(source.height * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return source.toDataURL('image/jpeg', quality);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/** Ask for the photoreal picture. Rejects with a sentence fit to show the user. */
export async function requestPhotoreal(req: PhotorealRequest, fetchImpl: typeof fetch = fetch): Promise<PhotorealResult> {
  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? null;
  } catch {
    token = null;
  }
  if (!token) throw new Error('Sign in to make a photoreal picture.');
  let r: Response;
  try {
    r = await fetchImpl('/api/photoreal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error('The photoreal service could not be reached.');
  }
  const body = (await r.json().catch(() => null)) as { image?: string; model?: string; error?: string } | null;
  if (!r.ok || !body?.image) {
    throw new Error(body?.error ?? (r.status === 404 ? 'Photoreal pictures are made on the deployed app, not on a local server.' : `The photoreal service answered ${r.status}.`));
  }
  return { image: body.image, model: body.model ?? 'image model' };
}
