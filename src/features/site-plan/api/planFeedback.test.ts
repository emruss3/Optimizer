// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: 'user-token' as string | null }));
vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) }, rpc: async () => ({ data: null, error: null }) },
}));

import { describeChanges, guidedVerdict, keptChanges, mergeChanges, planForFeedback, productOf, requestPlanFeedback, startingChanges, type FeedbackLevers } from './planFeedback';

// the server function is plain JavaScript outside the app's sources
interface Fn {
  handle(request: Request, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, ask?: (conn: unknown, req: Record<string, unknown>) => Promise<{ answer: unknown; model: string }>): Promise<Response>;
  feedbackSchema(levers: unknown): { properties: Record<string, { enum?: string[]; properties?: Record<string, { enum?: string[]; items?: { properties?: Record<string, { enum?: string[] }> } }> }>; required: string[] };
  checkChanges(changes: unknown, levers: unknown): { pattern: string | null; params: Record<string, number | boolean> };
  buildUserText(o: Record<string, unknown>): string;
  imageBlock(s: unknown): { type: string; source: { media_type: string } } | null;
  allowedAccounts(env: Record<string, string | undefined>): string[];
  clientFor(request: Request, env: Record<string, string | undefined>): { model: string; direct: boolean } | null;
  KEEP: string;
}
const path = '../../../../api/plan-feedback.js';
const load = async (): Promise<Fn> => (await import(/* @vite-ignore */ path)) as Fn;

const LEVERS: FeedbackLevers = {
  product: 'single_family',
  patterns: ['loop', 'single', 'grid'],
  settings: [
    { key: 'block_len_max_ft', kind: 'num', min: 800, max: 1600, step: 100, current: 1200 },
    { key: 'cul_de_sac_min_lots', kind: 'num', min: 2, max: 5, step: 1, current: 3 },
    { key: 'ring_depth_adaptive', kind: 'bool', min: null, max: null, step: null, current: null },
  ],
};
const ENV = { VITE_SUPABASE_URL: 'https://db.example', VITE_SUPABASE_ANON_KEY: 'anon', AI_GATEWAY_API_KEY: 'gateway-key', PLAN_FEEDBACK_ALLOWED_EMAILS: 'owner@example.com' };
const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer user-token' }) =>
  new Request('https://app.example/api/plan-feedback', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const supabaseUser = (email = 'Owner@Example.com', ok = true) => (async (input: RequestInfo | URL) =>
  String(input).includes('/auth/v1/user') ? (ok ? Response.json({ id: 'u1', email }) : new Response('{}', { status: 401 })) : new Response('{}', { status: 404 })) as typeof fetch;
const ANSWER = {
  reading: 'The street serves too few lots.', category: 'street_layout', scope: 'district', lesson: 'Put lots on both sides of every street.',
  engine_can_change: true, why_not: '', reply: 'Try a grid with shorter blocks.',
  changes: { pattern: 'grid', settings: [{ key: 'block_len_max_ft', value: 940 }, { key: 'made_up_key', value: 3 }] },
};

describe('the plan feedback function', () => {
  it('serves a signed-in user on the list only, and nobody without a list or a model service', async () => {
    const fn = await load();
    const ask = vi.fn(async (_conn: unknown, _req: Record<string, unknown>) => ({ answer: ANSWER, model: 'claude' }));
    expect((await fn.handle(new Request('https://app.example/api/plan-feedback'), ENV, supabaseUser(), ask)).status).toBe(405);
    expect((await fn.handle(post({ note: 'too few lots' }, {}), ENV, supabaseUser(), ask)).status).toBe(401);
    expect((await fn.handle(post({ note: 'too few lots' }), ENV, supabaseUser('Owner@Example.com', false), ask)).status).toBe(401);
    expect((await fn.handle(post({ note: 'too few lots' }), ENV, supabaseUser('someone@elsewhere.example'), ask)).status).toBe(403);
    expect((await fn.handle(post({ note: 'too few lots' }), { ...ENV, PLAN_FEEDBACK_ALLOWED_EMAILS: undefined }, supabaseUser(), ask)).status).toBe(503);
    expect((await fn.handle(post({ note: 'too few lots' }), { ...ENV, AI_GATEWAY_API_KEY: undefined }, supabaseUser(), ask)).status).toBe(503);
    expect((await fn.handle(post({ note: 'no' }), ENV, supabaseUser(), ask)).status).toBe(400);
    expect(ask).not.toHaveBeenCalled();
    // the photoreal list stands in when the feedback list is unset
    expect(fn.allowedAccounts({ PHOTOREAL_ALLOWED_EMAILS: 'A@b.c, *' })).toEqual(['a@b.c', '*']);
  });

  it('returns the reading with only the settings the engine accepts, inside their limits', async () => {
    const fn = await load();
    const ask = vi.fn(async (_conn: unknown, _req: Record<string, unknown>) => ({ answer: ANSWER, model: 'anthropic/claude-opus-5-5' }));
    const res = await fn.handle(post({ note: 'The street serves too few lots', levers: LEVERS, plan: { lots: 5 } }), ENV, supabaseUser(), ask);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ category: 'street_layout', scope: 'district', engineCanChange: true, lesson: 'Put lots on both sides of every street.' });
    expect(body.changes).toEqual({ pattern: 'grid', params: { block_len_max_ft: 900 } });
    expect(body.whyNot).toBeNull();
    // the note and the levers reached the model call; the key never left the server
    const req = ask.mock.calls[0]![1] as unknown as { note: string; levers: unknown };
    expect(req.note).toBe('The street serves too few lots');
    expect(JSON.stringify(body)).not.toContain('gateway-key');
  });

  it('says it failed, without the model service\'s words, when the call fails', async () => {
    const fn = await load();
    const res = await fn.handle(post({ note: 'make it nicer' }), ENV, supabaseUser(), async () => { throw new Error('upstream secret detail'); });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('builds its answer format from the engine\'s own lists', async () => {
    const fn = await load();
    const schema = fn.feedbackSchema(LEVERS);
    expect(schema.properties.changes!.properties!.pattern!.enum).toEqual([fn.KEEP, 'loop', 'single', 'grid']);
    expect(schema.properties.changes!.properties!.settings!.items!.properties!.key!.enum).toEqual(['block_len_max_ft', 'cul_de_sac_min_lots', 'ring_depth_adaptive']);
    expect(schema.required).toContain('changes');
    // an engine that takes no settings: no changes in the answer at all
    expect(fn.feedbackSchema({ patterns: [], settings: [] }).properties.changes).toBeUndefined();
  });

  it('checks every proposed setting: unknown keys and patterns dropped, values clamped and snapped, no-ops removed', async () => {
    const fn = await load();
    expect(fn.checkChanges({ pattern: 'spiral', settings: [{ key: 'block_len_max_ft', value: 5000 }, { key: 'cul_de_sac_min_lots', value: 3 }, { key: 'ring_depth_adaptive', value: 1 }] }, LEVERS))
      .toEqual({ pattern: null, params: { block_len_max_ft: 1600, ring_depth_adaptive: true } });
    expect(fn.checkChanges({ pattern: fn.KEEP, settings: [{ key: 'block_len_max_ft', value: 100 }] }, LEVERS)).toEqual({ pattern: null, params: { block_len_max_ft: 800 } });
    expect(fn.checkChanges(null, LEVERS)).toEqual({ pattern: null, params: {} });
  });

  it('puts the note last, after the plan, the settings and what was said before', async () => {
    const fn = await load();
    const text = fn.buildUserText({ note: 'NOTE', plan: { lots: 5 }, levers: LEVERS, prior: { parcel_notes: [{ note: 'earlier' }], lessons: [{ lesson: 'L', times: 3 }] } });
    expect(text.indexOf('Plan on screen')).toBeLessThan(text.indexOf('Settings the engine accepts'));
    expect(text.indexOf('Notes already made')).toBeLessThan(text.indexOf('NOTE'));
    expect(text.trim().endsWith('NOTE')).toBe(true);
  });

  it('takes a PNG or JPEG picture only, of a sensible size', async () => {
    const fn = await load();
    const big = `data:image/jpeg;base64,${Buffer.from(new Uint8Array(4000).fill(7)).toString('base64')}`;
    expect(fn.imageBlock(big)?.source.media_type).toBe('image/jpeg');
    expect(fn.imageBlock('data:image/gif;base64,AAAA')).toBeNull();
    expect(fn.imageBlock('data:image/png;base64,AAAA')).toBeNull();
  });

  it('reaches Claude directly with an Anthropic key, else through the gateway', async () => {
    const fn = await load();
    const r = post({});
    expect(fn.clientFor(r, { ANTHROPIC_API_KEY: 'k' })).toMatchObject({ model: 'claude-opus-5-5', direct: true });
    expect(fn.clientFor(r, { AI_GATEWAY_API_KEY: 'g' })).toMatchObject({ model: 'anthropic/claude-opus-5-5', direct: false });
    expect(fn.clientFor(r, {})).toBeNull();
  });
});

describe('the app side of plan feedback', () => {
  it('merges changes into the plan options: a pattern replaces, settings join the params, the loop is no pattern', () => {
    expect(mergeChanges({ params: { a: 1 }, lot_w_ft: 50 }, { pattern: 'grid', params: { b: 2 } })).toEqual({ params: { a: 1, b: 2 }, lot_w_ft: 50, pattern: 'grid' });
    expect(mergeChanges({ pattern: 'grid' }, { pattern: 'loop', params: {} })).toEqual({});
    expect(mergeChanges({ pattern: 'grid' }, null)).toEqual({ pattern: 'grid' });
  });

  it('combines a parcel\'s kept adjustments, a later one winning on the same setting', () => {
    const k = (id: string, changes: { pattern: string | null; params: Record<string, number> }) => ({ id, note: '', reading: null, created_at: '', changes });
    expect(keptChanges([k('1', { pattern: 'grid', params: { a: 1, b: 1 } }), k('2', { pattern: null, params: { b: 2 } })])).toEqual({ pattern: 'grid', params: { a: 1, b: 2 } });
    expect(keptChanges([])).toBeNull();
  });

  it('says the changes in a developer\'s words, with the engine\'s value before', () => {
    expect(describeChanges({ pattern: 'grid', params: { block_len_max_ft: 900, ring_depth_adaptive: true } }, LEVERS))
      .toEqual(['Street pattern: a street grid', 'Longest block: 900 ft (was 1,200 ft)', 'Fit loop depth to the site: on']);
  });

  it('names the product by its engine and describes the plan without geometry', () => {
    expect(productOf('sf_v1')).toBe('single_family');
    expect(productOf('th_v3')).toBe('townhome');
    expect(productOf('mf_max_gsf_v1')).toBe('multifamily');
    const plan = planForFeedback({ address: '0 Delk Ave', zoning: 'RS5', generator: 'sf_v1', revision: 'abc', view: '3d', summary: null, options: {}, buildings: [{ use: 'house', label: null }, { use: 'house', label: null }], selected: null });
    expect(plan).toMatchObject({ zoning: 'RS5', buildings: { count: 2, by_use: { house: 2 } } });
    expect(JSON.stringify(plan)).not.toMatch(/POLYGON|coordinates/);
  });

  it('asks only with a session, and passes the server\'s sentence on', async () => {
    session.token = null;
    await expect(requestPlanFeedback({ note: 'x y z', plan: {}, levers: LEVERS, prior: {} })).rejects.toThrow('Sign in to send feedback.');
    session.token = 'user-token';
    const fetchImpl = vi.fn(async () => Response.json({ error: 'Plan feedback is not turned on for this account.' }, { status: 403 })) as unknown as typeof fetch;
    await expect(requestPlanFeedback({ note: 'x y z', plan: {}, levers: LEVERS, prior: {} }, fetchImpl)).rejects.toThrow('not turned on for this account');
  });
});

describe('reading the model\'s answer', () => {
  it('parses the JSON whole, or from the outermost braces when words surround it', async () => {
    const fn = (await load()) as Fn & { parseAnswer(t: string): unknown };
    expect(fn.parseAnswer('{"a":1}')).toEqual({ a: 1 });
    expect(fn.parseAnswer('Here it is: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(() => fn.parseAnswer('no json')).toThrow();
  });
});

describe('the request to Claude', () => {
  type Ask = (conn: unknown, req: Record<string, unknown>) => Promise<{ answer: unknown; model: string }>;
  const loadAsk = async () => (await load()) as Fn & { askClaude: Ask; MODEL: string };
  const reply = (text: string) => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text }], usage: {} });

  it('sends the cached instructions, the answer format from the levers, the picture first and the note last', async () => {
    const fn = await loadAsk();
    const create = vi.fn(async (_p: Record<string, unknown>) => reply(JSON.stringify(ANSWER)));
    const picture = `data:image/png;base64,${Buffer.from(new Uint8Array(4000).fill(9)).toString('base64')}`;
    const out = await fn.askClaude({ client: { messages: { create } }, model: 'anthropic/claude-opus-5-5', direct: false }, { note: 'NOTE', plan: {}, levers: LEVERS, prior: {}, image: picture });
    expect(out.answer).toEqual(ANSWER);
    const p = create.mock.calls[0]![0] as { model: string; system: Array<{ cache_control?: unknown }>; output_config: { effort: string; format: { type: string; schema: { required: string[] } } }; messages: Array<{ content: Array<{ type: string; text?: string }> }> };
    expect(p.model).toBe('anthropic/claude-opus-5-5');
    expect(p.system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.output_config.effort).toBe('medium');
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.output_config.format.schema.required).toContain('changes');
    expect(p.messages[0]!.content[0]!.type).toBe('image');
    expect(p.messages[0]!.content[p.messages[0]!.content.length - 1]!.text!.trim().endsWith('NOTE')).toBe(true);
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('thinking');
  });

  it('asks again without the answer format when a route refuses it, and treats a decline as a failure', async () => {
    const fn = await loadAsk();
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const create = vi.fn()
      .mockRejectedValueOnce(new Anthropic.BadRequestError(400, { error: { message: 'output_config not supported' } }, 'output_config not supported', new Headers()))
      .mockResolvedValueOnce(reply(`Sure: ${JSON.stringify(ANSWER)}`));
    const out = await fn.askClaude({ client: { messages: { create } }, model: 'm', direct: false }, { note: 'NOTE', plan: {}, levers: LEVERS, prior: {} });
    expect(out.answer).toEqual(ANSWER);
    const second = create.mock.calls[1]![0] as { output_config: Record<string, unknown>; messages: Array<{ content: Array<{ text?: string }> }> };
    expect(second.output_config).toEqual({ effort: 'medium' });
    expect(second.messages[0]!.content[second.messages[0]!.content.length - 1]!.text).toMatch(/JSON schema/);
    const declined = vi.fn(async () => ({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: {} }));
    await expect(fn.askClaude({ client: { messages: { create: declined } }, model: 'm', direct: false }, { note: 'NOTE', plan: {}, levers: LEVERS, prior: {} })).rejects.toThrow('declined');
  });

  it('directly, opts into server-side fallbacks', async () => {
    const fn = await loadAsk();
    const create = vi.fn(async (_p: Record<string, unknown>) => reply(JSON.stringify(ANSWER)));
    await fn.askClaude({ client: { beta: { messages: { create } } }, model: 'claude-opus-5-5', direct: true }, { note: 'NOTE', plan: {}, levers: LEVERS, prior: {} });
    expect(create.mock.calls[0]![0]).toMatchObject({ model: 'claude-opus-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  });
});

describe('guidance on later sites', () => {
  const g = (id: string, scope: string, changes: { pattern: string | null; params: Record<string, number> }, lesson: string | null = null) => ({ id, scope, lesson, changes, from_parcel: 1, created_at: id });
  const k = (id: string, changes: { pattern: string | null; params: Record<string, number> }) => ({ id, note: '', reading: null, created_at: id, changes });

  it('starts a site from the guidance that reaches it, then its own kept settings, the more specific winning', () => {
    const start = startingChanges({
      guidance: [g('1', 'all', { pattern: 'loop', params: { block_len_max_ft: 1000 } }, 'Shorter blocks.'), g('2', 'district', { pattern: 'grid', params: {} }, 'Use a grid here.')],
      kept: [k('3', { pattern: null, params: { block_len_max_ft: 900 } })],
    });
    expect(start.changes).toEqual({ pattern: 'grid', params: { block_len_max_ft: 900 } });
    expect(start.ids).toEqual(['1', '2', '3']);
    expect(start.lessons).toEqual(['Shorter blocks.', 'Use a grid here.']);
    expect(startingChanges({ guidance: [], kept: [] }).changes).toBeNull();
  });

  it('keeps a guided plan only when it keeps every home and fails no more checks', () => {
    expect(guidedVerdict({ lots: 10, fails: [] }, { lots: 11, fails: [], status: 'done' })).toEqual({ keep: true, why: '1 more home than the default plan' });
    expect(guidedVerdict({ lots: 10, fails: [] }, { lots: 10, fails: [] })).toEqual({ keep: true, why: 'the same 10 homes as the default plan' });
    expect(guidedVerdict({ lots: 10, fails: [] }, { lots: 8, fails: [] })).toEqual({ keep: false, why: 'the guided plan has 2 fewer homes (8 against 10)' });
    expect(guidedVerdict({ lots: 10, fails: [] }, { lots: 12, fails: ['dead end'] }).keep).toBe(false);
    expect(guidedVerdict({ lots: 10, fails: [] }, { lots: 12, fails: [], status: 'skip' }).keep).toBe(false);
  });
});
