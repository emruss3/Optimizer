// Site planner feedback (owner, 2026-11-27: "a site planner feedback box that connects to claude to help update
// plans ... that feedback should help change the layout and go into the engine context so we don't keep seeing the
// same issues").
//
// The app sends the owner's note, a summary of the plan on screen, the settings the engine accepts (with their
// limits), the notes already made on this parcel and the lessons raised before for its district and product, and
// optionally a picture of the view. Claude reads the note and answers with structured JSON: what is being asked,
// the kind of issue, how widely it applies, one general lesson, and the engine settings that would address it.
// Claude never draws: the engine draws the plan from those settings and checks it. Every setting is checked here
// against the engine's limits before it goes back to the app.
//
// - Only a signed-in user of the app may call it (the Supabase session is checked on every call), and only an
//   account on PLAN_FEEDBACK_ALLOWED_EMAILS (or, when that is unset, PHOTOREAL_ALLOWED_EMAILS). `*` allows every
//   signed-in user. With no list nobody may: each call costs money.
// - Claude is reached through the Vercel AI Gateway with the project's own identity (OIDC) or AI_GATEWAY_API_KEY;
//   with ANTHROPIC_API_KEY set, directly. No key reaches the browser.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';
const GATEWAY = 'https://ai-gateway.vercel.sh';
export const MAX_NOTE = 4000;
export const MAX_IMAGE_BYTES = 3_300_000;

export const CATEGORIES = ['street_layout', 'lot_layout', 'building_placement', 'unit_mix', 'parking', 'open_space', 'access', 'grading_drainage', 'numbers_or_labels', 'rendering_or_view', 'other'];
export const SCOPES = ['parcel', 'district', 'product', 'all'];
/** The pattern value that means "keep the pattern as it is". */
export const KEEP = 'keep';

export const SYSTEM = `You help a real estate developer improve site plans drawn by a rule-based planning engine.
The developer looks at a plan and writes a note about what is wrong or what they want. You read the note, the plan summary, the picture when one is attached, and what has been said before, and answer with one JSON object.

How the engine works: for single-family subdivisions it chooses a street pattern and lays out lots by right under the zoning district's standards. Lot sizes, setbacks and density come from zoning and are not yours to change. You can change only the street pattern and the settings listed in the request, each within its min and max. You never draw geometry; the engine redraws the plan from your settings and checks it against zoning and engineering rules. Townhome and apartment plans take no settings from you yet.

What to answer:
- reading: what the developer is asking for, in one or two plain sentences.
- category and scope. Scope is "parcel" when the note is about this site's particulars, "district" when it is about how plans in this zoning district should be laid out, "product" when it is about this kind of housing anywhere, and "all" when it applies to every plan.
- lesson: one sentence a planning engine could follow on other sites. No addresses or parcel numbers.
- engine_can_change: true only when a listed pattern or setting plausibly addresses the note. If the note is about something the engine cannot change (architecture, rendering, labels, numbers on the sheet, townhome or apartment layouts), set it false, leave the changes empty, and say why in why_not.
- changes: pattern is "keep" or one listed pattern; settings lists only the keys you would change, with a value inside the limits (for a yes/no setting use 1 or 0). Change as little as addresses the note. Prefer changes that keep or raise the number of homes; if a change is likely to cost homes, say so in the reply.
- reply: two or three plain sentences to the developer saying what you would change and what to check after the engine redraws. Do not promise a result: the engine decides what fits.
- If the note repeats a lesson raised before, say so in the reply.
Write for a developer, not an engineer: no setting keys or jargon in reading or reply.`;

/** The JSON the model must answer with. Enums are built from the engine's own lists, so no other key or pattern can come back. */
export function feedbackSchema(levers) {
  const patterns = (levers?.patterns ?? []).filter(p => typeof p === 'string');
  const keys = (levers?.settings ?? []).map(s => s?.key).filter(k => typeof k === 'string');
  const properties = {
    reading: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    scope: { type: 'string', enum: SCOPES },
    lesson: { type: 'string' },
    engine_can_change: { type: 'boolean' },
    why_not: { type: 'string', description: 'Empty when the engine can change it.' },
    reply: { type: 'string' },
  };
  const required = ['reading', 'category', 'scope', 'lesson', 'engine_can_change', 'why_not', 'reply'];
  if (patterns.length || keys.length) {
    properties.changes = {
      type: 'object',
      additionalProperties: false,
      required: ['pattern', 'settings'],
      properties: {
        pattern: { type: 'string', enum: [KEEP, ...patterns] },
        settings: keys.length
          ? { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string', enum: keys }, value: { type: 'number' } } } }
          : { type: 'array', items: { type: 'string', enum: ['none'] } },
      },
    };
    required.push('changes');
  }
  return { type: 'object', additionalProperties: false, required, properties };
}

/** The model's changes, checked against the engine's limits: unknown keys dropped, values clamped and snapped to the step. */
export function checkChanges(changes, levers) {
  const out = { pattern: null, params: {} };
  if (!changes || typeof changes !== 'object') return out;
  const patterns = new Set((levers?.patterns ?? []).filter(p => typeof p === 'string'));
  if (typeof changes.pattern === 'string' && changes.pattern !== KEEP && patterns.has(changes.pattern)) out.pattern = changes.pattern;
  const byKey = new Map((levers?.settings ?? []).filter(s => s && typeof s.key === 'string').map(s => [s.key, s]));
  for (const item of Array.isArray(changes.settings) ? changes.settings : []) {
    const s = item && byKey.get(item.key);
    const v = Number(item?.value);
    if (!s || !Number.isFinite(v)) continue;
    if (s.kind === 'bool') { out.params[s.key] = v >= 0.5; continue; }
    const lo = Number.isFinite(Number(s.min)) ? Number(s.min) : -Infinity, hi = Number.isFinite(Number(s.max)) ? Number(s.max) : Infinity;
    let x = Math.min(hi, Math.max(lo, v));
    const step = Number(s.step);
    if (Number.isFinite(step) && step > 0 && Number.isFinite(lo)) x = Math.min(hi, lo + Math.round((x - lo) / step) * step);
    x = Math.round(x * 10000) / 10000;
    if (s.current != null && Number(s.current) === x) continue; // no change
    out.params[s.key] = x;
  }
  return out;
}

const clip = (s, n) => String(s ?? '').slice(0, n);

/** The request's text: the note last, after what it is about. */
export function buildUserText({ note, plan, levers, prior }) {
  const parts = [
    `Plan on screen:\n${JSON.stringify(plan ?? {}, null, 1).slice(0, 12000)}`,
    `Settings the engine accepts for this plan (change only these, within min and max):\n${JSON.stringify({ patterns: levers?.patterns ?? [], settings: levers?.settings ?? [] }).slice(0, 6000)}`,
  ];
  const notes = Array.isArray(prior?.parcel_notes) ? prior.parcel_notes.slice(0, 10) : [];
  const lessons = Array.isArray(prior?.lessons) ? prior.lessons.slice(0, 12) : [];
  if (notes.length) parts.push(`Notes already made on this parcel, newest first:\n${JSON.stringify(notes).slice(0, 5000)}`);
  if (lessons.length) parts.push(`Lessons raised before for this district, product or every plan, most repeated first:\n${JSON.stringify(lessons).slice(0, 5000)}`);
  parts.push(`The developer's note:\n${clip(note, MAX_NOTE)}`);
  return parts.join('\n\n');
}

/** A `data:image/png|jpeg;base64,…` URL as a Claude image block, or null. */
export function imageBlock(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes < 1000 || bytes > MAX_IMAGE_BYTES) return null;
  return { type: 'image', source: { type: 'base64', media_type: `image/${m[1]}`, data: m[2] } };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

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

export function allowedAccounts(env) {
  return String(env.PLAN_FEEDBACK_ALLOWED_EMAILS ?? env.PHOTOREAL_ALLOWED_EMAILS ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
}

/** The Anthropic client: direct with ANTHROPIC_API_KEY, else through the AI Gateway. Null when neither is set up. */
export function clientFor(request, env) {
  if (env.ANTHROPIC_API_KEY) return { client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), model: env.PLAN_FEEDBACK_MODEL || MODEL, direct: true };
  const token = env.AI_GATEWAY_API_KEY || request.headers.get('x-vercel-oidc-token') || env.VERCEL_OIDC_TOKEN;
  if (!token) return null;
  return { client: new Anthropic({ apiKey: token, baseURL: GATEWAY }), model: env.PLAN_FEEDBACK_MODEL || `anthropic/${MODEL}`, direct: false };
}

/** Ask Claude. Returns the parsed JSON answer, or throws with a reason for the log. */
export async function askClaude({ client, model, direct }, { note, plan, levers, prior, image }) {
  const content = [];
  const img = imageBlock(image);
  if (img) content.push(img);
  content.push({ type: 'text', text: buildUserText({ note, plan, levers, prior }) });
  const params = {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: feedbackSchema(levers) } },
    messages: [{ role: 'user', content }],
  };
  // Directly, a policy decline is retried on another model inside the same call (server-side fallbacks);
  // the gateway passes the plain request.
  const send = p => direct
    ? client.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : client.messages.create(p);
  let msg;
  try {
    msg = await send(params);
  } catch (err) {
    // a route that does not take the answer format: ask for the same JSON in words, once, and parse it
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    console.warn('[plan-feedback] the answer format was refused; asking for JSON in the prompt:', String(err.message).slice(0, 200));
    const schema = JSON.stringify(params.output_config.format.schema);
    msg = await send({
      ...params,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: `Answer with only one JSON object, no other text, matching this JSON schema:\n${schema}` }] }],
    });
  }
  if (msg.stop_reason === 'refusal') throw new Error(`the model declined (${msg.stop_details?.category ?? 'no category'})`);
  if (msg.stop_reason === 'max_tokens') throw new Error('the answer was cut off');
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { answer: parseAnswer(text), model: msg.model ?? model, usage: msg.usage };
}

/** The JSON object in the model's text (the whole text under the answer format; the outermost braces otherwise). */
export function parseAnswer(text) {
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('the answer was not JSON');
    return JSON.parse(text.slice(a, b + 1));
  }
}

/** The whole request, with its dependencies passed in so it can be tested. */
export async function handle(request, env = process.env, fetchImpl = fetch, ask = askClaude) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const user = await userOf(request, env, fetchImpl);
  if (!user) return json(401, { error: 'Sign in to send feedback.' });
  const allowed = allowedAccounts(env);
  if (!allowed.length) return json(503, { error: 'Plan feedback is not turned on for this deployment.' });
  if (!allowed.includes('*') && !allowed.includes(user.email.toLowerCase())) return json(403, { error: 'Plan feedback is not turned on for this account.' });
  const conn = clientFor(request, env);
  if (!conn) return json(503, { error: 'The model service is not set up for this deployment.' });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'The request was not readable.' });
  }
  const note = String(body?.note ?? '').trim();
  if (note.length < 3 || note.length > MAX_NOTE) return json(400, { error: `Write a note of 3 to ${MAX_NOTE} characters.` });
  const levers = body?.levers && typeof body.levers === 'object' ? body.levers : { patterns: [], settings: [] };
  try {
    const { answer, model } = await ask(conn, { note, plan: body?.plan ?? {}, levers, prior: body?.prior ?? {}, image: body?.image });
    const changes = checkChanges(answer?.changes, levers);
    const hasChanges = !!changes.pattern || Object.keys(changes.params).length > 0;
    return json(200, {
      reading: clip(answer?.reading, 1200),
      category: CATEGORIES.includes(answer?.category) ? answer.category : 'other',
      scope: SCOPES.includes(answer?.scope) ? answer.scope : 'parcel',
      lesson: clip(answer?.lesson, 600),
      engineCanChange: !!answer?.engine_can_change && hasChanges,
      changes: hasChanges ? changes : null,
      whyNot: clip(answer?.why_not, 600) || null,
      reply: clip(answer?.reply, 1500),
      model,
    });
  } catch (err) {
    console.error('[plan-feedback] the model call failed:', String(err?.message ?? err).slice(0, 500));
    return json(502, { error: 'Claude could not read the note just now. Try again in a minute.' });
  }
}

export default { fetch: request => handle(request) };
