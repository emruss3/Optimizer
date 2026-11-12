// Photoreal pass. The app sends a picture of its own 3D view; this function
// asks an image model on the Vercel AI Gateway to repaint it as a photograph,
// keeping the layout, and returns the result.
//
// - Only a signed-in user of the app may call it (their Supabase session is
//   checked on every call), and only if their account is on the list in
//   PHOTOREAL_ALLOWED_EMAILS. With no list nobody may: reaching the image
//   service costs money, and turning it on must not open that spend to anyone
//   who can sign up. `*` in the list allows every signed-in user, for a
//   deployment whose sign-ups are closed.
// - The prompt is written here, not by the caller: the caller chooses a view
//   and a kind of building from short fixed lists and nothing else.
// - Only the picture is sent to the model. No address, parcel id or owner.
// - On Vercel the call is made with the project's own identity (OIDC); an
//   AI_GATEWAY_API_KEY, when set, is used instead. No key reaches the browser.
//
// The result is an impression: the model invents materials, planting, sky and
// surroundings, and may shift a detail. The app labels it so.

const GATEWAY = 'https://ai-gateway.vercel.sh/v1';
export const DEFAULT_MODEL = 'openai/gpt-image-2';
/** The largest picture accepted, in bytes: the platform's request limit is 4.5 MB. */
export const MAX_IMAGE_BYTES = 3_300_000;

const PRODUCTS = {
  houses: 'detached single-family homes',
  townhomes: 'rows of attached townhomes',
  apartments: 'apartment buildings with surface parking',
};

const VIEWS = {
  aerial: 'an aerial drone photograph',
  street: 'a photograph taken from a low drone at street level',
};

// What each architectural style of the app is built of, in a photographer's words.
const STYLES = {
  mansard: 'brick ground floors, lap siding and board-and-batten above in tan, blue-grey, sage green and cream, steep shingled mansard top floors with boxed dormers, black-framed windows with grids, black metal balcony railings and window boxes',
  farmhouse: 'white and dark board-and-batten siding, steep gabled roofs in dark shingles and standing-seam metal, black-framed windows, metal porch roofs on timber posts and cedar accents',
  modern: 'flat roofs, white stucco over charcoal panels, cedar accent walls, large black-framed windows without grids, glass railings and roof decks',
  heritage: 'craftsman houses in earth-tone lap siding with deep eaves, shingled gables and porches on brick piers, and brick buildings with stone trim and black steel windows',
};

/** The instruction to the model. `view`, `product`, `stories` and `style` come from fixed lists. */
export function buildPrompt({ view = 'aerial', product = 'houses', stories = 2, style = 'mansard' } = {}) {
  const v = VIEWS[view] ?? VIEWS.aerial;
  const p = PRODUCTS[product] ?? PRODUCTS.houses;
  const s = STYLES[style] ?? STYLES.mansard;
  const n = Math.max(1, Math.min(12, Math.round(Number(stories) || 2)));
  return [
    `Turn this computer render of a proposed residential development into ${v}, photorealistic, the kind a real estate developer uses in marketing. The development is ${p}, ${n} ${n === 1 ? 'story' : 'stories'} tall.`,
    'Keep the layout exactly as shown. Every building stays in the same place with the same footprint, height, orientation and roof direction. Streets, sidewalks, driveways and parking stay exactly where they are. The camera position, angle and framing do not change. Do not add, remove or move any building in the development.',
    `Keep the architecture exactly as the render shows it: ${s}. Every building keeps its own wall materials and colours, its roof shape, the positions of its windows and doors, its balconies, porches and garage doors. Do not redesign any building. Only make it real: finished new construction photographed on site, with real brick, wood, metal and glass, reflections in the windows and crisp shadows. Asphalt streets with concrete curbs and sidewalks. Healthy mown lawns, planting beds with shrubs and mulch. Mature trees with full natural crowns, a few turning orange and red.`,
    'Replace the simplified surroundings with a real, leafy, established neighbourhood: older houses among a dense tree canopy running out to the horizon, soft haze in the distance, a real sky with scattered clouds.',
    'Late afternoon golden-hour sunlight, warm, with long soft shadows. Natural colours, fine detail, sharp focus, shot on a full-frame camera. No text, no labels, no logos, no watermark.',
  ].join('\n\n');
}

/** A `data:image/png|jpeg;base64,…` URL as its type and bytes, or null. */
export function parseImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length < 1000 || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: `image/${m[1]}`, ext: m[1] === 'jpeg' ? 'jpg' : 'png', bytes };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The signed-in user (id and email), or null. */
async function userOf(request, env, fetchImpl) {
  const auth = request.headers.get('authorization') ?? '';
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!/^Bearer \S+$/.test(auth) || !url || !anon) return null;
  try {
    const r = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { authorization: auth, apikey: anon } });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === 'string' ? { id: u.id, email: typeof u.email === 'string' ? u.email : '' } : null;
  } catch {
    return null;
  }
}

/** The accounts that may use the image service: lower-case emails, or `*` for every signed-in user. */
export function allowedAccounts(env) {
  return String(env.PHOTOREAL_ALLOWED_EMAILS ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
}

const asDataUrl = b64 => `data:image/${b64.startsWith('/9j/') ? 'jpeg' : b64.startsWith('UklGR') ? 'webp' : 'png'};base64,${b64}`;

/** Ask the model. Image-only models take the picture as a file; chat models take it in a message. */
async function repaint({ model, prompt, image, token, fetchImpl }) {
  const headers = { authorization: `Bearer ${token}` };
  if (model.startsWith('google/')) {
    const r = await fetchImpl(`${GATEWAY}/chat/completions`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        modalities: ['text', 'image'],
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.bytes.toString('base64')}` } }] }],
      }),
    });
    const body = await r.json().catch(() => null);
    const url = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!r.ok || typeof url !== 'string') throw new Error(body?.error?.message ?? `the image model answered ${r.status}`);
    return url;
  }
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('image', new Blob([image.bytes], { type: image.mime }), `view.${image.ext}`);
  if (model.startsWith('openai/')) {
    form.set('size', '1536x1024');
    form.set('quality', 'high');
    form.set('output_format', 'jpeg');
  }
  const r = await fetchImpl(`${GATEWAY}/images/edits`, { method: 'POST', headers, body: form });
  const body = await r.json().catch(() => null);
  const b64 = body?.data?.[0]?.b64_json;
  if (!r.ok || typeof b64 !== 'string') throw new Error(body?.error?.message ?? `the image model answered ${r.status}`);
  return asDataUrl(b64);
}

/** The whole request, with its dependencies passed in so it can be tested. */
export async function handle(request, env = process.env, fetchImpl = fetch) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const user = await userOf(request, env, fetchImpl);
  if (!user) return json(401, { error: 'Sign in to make a photoreal picture.' });
  const allowed = allowedAccounts(env);
  if (!allowed.length) return json(503, { error: 'Photoreal pictures are not turned on for this deployment.' });
  if (!allowed.includes('*') && !allowed.includes(user.email.toLowerCase())) return json(403, { error: 'Photoreal pictures are not turned on for this account.' });
  const token = env.AI_GATEWAY_API_KEY || request.headers.get('x-vercel-oidc-token') || env.VERCEL_OIDC_TOKEN;
  if (!token) return json(503, { error: 'The image service is not set up for this deployment.' });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'The request was not readable.' });
  }
  const image = parseImage(body?.image);
  if (!image) return json(400, { error: 'Send one PNG or JPEG picture of the view, under 3 MB.' });
  const model = env.PHOTOREAL_MODEL || DEFAULT_MODEL;
  try {
    const picture = await repaint({ model, prompt: buildPrompt(body), image, token, fetchImpl });
    return json(200, { image: picture, model });
  } catch (err) {
    // what the model's service said stays in the function's log; the caller is told only that it failed
    console.error('[photoreal] the image model failed:', String(err?.message ?? err).slice(0, 500));
    return json(502, { error: 'The image model could not make the picture. Try again in a minute.' });
  }
}

export default { fetch: request => handle(request) };
