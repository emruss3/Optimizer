"""Generative site-plan model for apartments and townhomes (mf_gen).

A transformer writes a site plan as tokens (drive centrelines, then buildings, then parking fields), conditioned
on the site outline with its edge classes (street, alley, neighbours, stream...), the site size, the product and
the unit target. It is trained only on approved SP plans traced into Supabase (train split; the development split
is the validation set; the held-out split is never sent here).

In production the model does not decide alone. It proposes building positions inside the buildable envelope the
planner context gives; the database pins them into the rule engine, which adds drives and parking and enforces
setbacks, parking ratios, access and fire reach. A proposal that breaks a rule is repaired or dropped by the engine.

Origin: ml/generative/data.py, data2.py, gen2.py on this branch (run 1-2, 13 Nov), packaged for Modal.
"""
import hashlib
import json
import math
import random
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from shapely import wkt
from shapely.affinity import rotate, translate
from shapely.geometry import LineString, box, shape
from shapely.ops import unary_union

# ---------------------------------------------------------------- vocabulary (same as ml/generative/data.py)
TYPES = ['detached', 'townhome_row', 'cottage_court', 'garden_walk_up', 'stacked_flats', 'podium', 'wrap', 'tuck_under', 'none']
TYPS = ['multifamily', 'townhome', 'residential', 'mixed_use']
ECLS = {'street_frontage': 0, 'alley_frontage': 1, 'private_drive_frontage': 1, 'neighboring_homes': 2,
        'neighboring_multifamily': 3, 'commercial': 4, 'industrial': 4, 'stream_corridor': 5, 'vacant_land': 6, 'open_space': 6}
NE = 8; NB = 32
NX = 64; XR = 1.2; NW = 32; WMIN = 12.; WMAX = 500.; NA = 12
UB = [1, 2, 3, 4, 6, 8, 12, 16, 24, 36, 60, 100, 200, 10 ** 9]; NU = len(UB) + 1
OFF = {}; _o = 3
for _k, _n in [('t', len(TYPES)), ('x', NX), ('y', NX), ('w', NW), ('d', NW), ('a', NA), ('u', NU)]:
    OFF[_k] = (_o, _n); _o += _n
VOCAB = _o; PAD, BOS, EOS = 0, 1, 2; FIELDS = ['t', 'x', 'y', 'w', 'd', 'a', 'u']
V2 = {}
for _k, _n in [('DRV', 1), ('PRK', 1), ('SEC', 1), ('px', NX), ('py', NX), ('pw', NW), ('pd', NW), ('pa', NA)]:
    V2[_k] = (_o, _n); _o += _n
VOCAB2 = _o
DRV, PRK, SEC = V2['DRV'][0], V2['PRK'][0], V2['SEC'][0]
MAXL = 960; HW = 12.0
UO, UN = OFF['u']


def qx(v): return int(np.clip((v + XR) / (2 * XR) * NX, 0, NX - 1))
def dx(i): return (i + 0.5) / NX * 2 * XR - XR
def qw(v): return int(np.clip(math.log(max(v, WMIN) / WMIN) / math.log(WMAX / WMIN) * NW, 0, NW - 1))
def dw(i): return WMIN * math.exp((i + 0.5) / NW * math.log(WMAX / WMIN))


def qu(u):
    if u is None: return NU - 1
    for i, b in enumerate(UB):
        if u <= b: return i


def du(i):
    if i == NU - 1: return None
    lo = 1 if i == 0 else UB[i - 1] + 1; hi = min(UB[i], 300)
    return int(round(math.sqrt(lo * hi)))


def mrr(poly):
    r = poly.minimum_rotated_rectangle; c = list(r.exterior.coords)
    e = [(math.dist(c[i], c[i + 1]), math.degrees(math.atan2(c[i + 1][1] - c[i][1], c[i + 1][0] - c[i][0]))) for i in range(2)]
    e.sort(reverse=True); return e[0][0], e[1][0], e[0][1] % 180


def rect(cx, cy, L, D, a): return rotate(box(cx - L / 2, cy - D / 2, cx + L / 2, cy + D / 2), a, origin=(cx, cy))


# ---------------------------------------------------------------- site frame: longest street edge along x, street below
def frame(p):
    site = wkt.loads(p['site']); site = site if site.geom_type == 'Polygon' else max(site.geoms, key=lambda g: g.area)
    edges = [(shape(e['geom_2274']) if 'geom_2274' in e else wkt.loads(e['wkt']), e['type']) for e in (p.get('ctx') or {}).get('boundary_edges') or []]
    st = [g for g, t in edges if t == 'street_frontage']
    c = site.centroid; has = bool(st)
    if has:
        g = max(st, key=lambda g: g.length); a = list(g.coords); ang = math.degrees(math.atan2(a[-1][1] - a[0][1], a[-1][0] - a[0][0]))
    else:
        ang = mrr(site)[2]
    S = math.sqrt(site.area)
    cx, cy = c.x, c.y

    def T(g): return rotate(translate(g, -cx, -cy), -ang, origin=(0, 0))
    if has and T(g).centroid.y > 0: ang += 180

    def Ti(g): return translate(rotate(g, ang, origin=(0, 0)), cx, cy)
    return site, edges, T, S, has, ang, Ti


def encode(p):
    site, edges, T, S, has, ang, Ti = frame(p)
    fs = T(site); ring = fs.exterior
    pts = []; fe = [(T(g), ECLS.get(t, 7)) for g, t in edges]
    for i in range(NB):
        q = ring.interpolate(i / NB, normalized=True)
        cls = min(fe, key=lambda e: e[0].distance(q))[1] if fe else 7
        pts.append((q.x / S, q.y / S, cls))
    bl = []
    for b in p.get('b') or []:
        g = T(wkt.loads(b['w']))
        if g.is_empty or g.area < 50: continue
        L, D, a = mrr(g)
        u = int(float(b['u'])) if b.get('u') else None
        bl.append(dict(t=TYPES.index(b['t'] if b.get('t') in TYPES else 'none'), x=g.centroid.x / S, y=g.centroid.y / S, w=L, d=D, a=a, u=u, g=g))
    units = ((p.get('tm') or {}).get('units')) or sum(b['u'] or 0 for b in bl) or None
    e = dict(pid=p.get('pid'), typ=p.get('typ'), split=p.get('split'), site=fs, S=S, has=has, pts=pts, b=bl,
             units=float(units) if units else None, ac=site.area / 43560, T=T, Ti=Ti,
             street=unary_union([g for g, c in fe if c == 0]) if has else None, drv=[], prk=[])
    if p.get('d'):
        for q in getattr(wkt.loads(p['d']), 'geoms', [wkt.loads(p['d'])]):
            g = T(q)
            if g.geom_type == 'Polygon':
                L, Dd, a = mrr(g); c = g.centroid; r = math.radians(a)
                g = LineString([(c.x - L / 2 * math.cos(r), c.y - L / 2 * math.sin(r)), (c.x + L / 2 * math.cos(r), c.y + L / 2 * math.sin(r))])
            if g.geom_type != 'LineString': continue
            g = g.simplify(0.02 * S)
            pts2 = [(x / S, y / S) for x, y in g.coords][:24]
            if len(pts2) >= 2: e['drv'].append(pts2)
    for w in p.get('p') or []:
        g = T(wkt.loads(w))
        for q in (g.geoms if g.geom_type.startswith('Multi') else [g]):
            if q.area < 150: continue
            L, Dd, a = mrr(q); e['prk'].append(dict(x=q.centroid.x / S, y=q.centroid.y / S, w=L, d=Dd, a=a, g=q))
    return e


def cond(e, units=None):
    u = units or e['units'] or 1
    v = [math.log(e['ac']), math.log(u), math.log(u / e['ac']), float(e['has'])] + [float(e['typ'] == t) for t in TYPS]
    return np.array(v, dtype=np.float32)


def btoks(bl, mirror=False):
    bs = [dict(b) for b in bl]
    if mirror:
        for b in bs: b['x'] = -b['x']; b['a'] = (180 - b['a']) % 180
    bs.sort(key=lambda b: (qx(b['y']), qx(b['x'])))
    out = []
    for b in bs:
        out += [OFF['t'][0] + b['t'], OFF['x'][0] + qx(b['x']), OFF['y'][0] + qx(b['y']), OFF['w'][0] + qw(b['w']),
                OFF['d'][0] + qw(b['d']), OFF['a'][0] + int((b['a'] % 180) / 180 * NA) % NA, OFF['u'][0] + qu(b['u'])]
    return out


def toks2(e, mirror=False):
    sx = -1 if mirror else 1
    out = [BOS]
    dr = [[(sx * x, y) for x, y in l] for l in e['drv']]
    dr = [l if (qx(l[0][1]), qx(l[0][0])) <= (qx(l[-1][1]), qx(l[-1][0])) else l[::-1] for l in dr]
    dr.sort(key=lambda l: (qx(l[0][1]), qx(l[0][0])))
    for l in dr:
        out.append(DRV)
        for x, y in l: out += [V2['px'][0] + qx(x), V2['py'][0] + qx(y)]
    out.append(SEC)
    out += btoks(e['b'], mirror)
    out.append(SEC)
    pk = [dict(p) for p in e['prk']]
    for p in pk:
        if mirror: p['x'] = -p['x']; p['a'] = (180 - p['a']) % 180
    pk.sort(key=lambda p: (qx(p['y']), qx(p['x'])))
    for p in pk[:60]:
        out += [PRK, V2['px'][0] + qx(p['x']), V2['py'][0] + qx(p['y']), V2['pw'][0] + qw(p['w']), V2['pd'][0] + qw(p['d']),
                V2['pa'][0] + int((p['a'] % 180) / 180 * NA) % NA]
    return out + [EOS]


def bpts(e, mirror=False):
    a = np.array(e['pts'], dtype=np.float32)
    if mirror: a = a[::-1].copy(); a[:, 0] *= -1
    return a


def parse_lines(lines, log=print):
    out = []
    for ln in lines:
        ln = ln.strip()
        if not ln: continue
        try:
            p = json.loads(ln)
        except Exception:
            continue
        if not p.get('b') or not p.get('pos'): continue          # position-verified plans with buildings only
        try:
            out.append(encode(p))
        except Exception as ex:
            log(f"skip {p.get('pid')}: {ex!r}"[:200])
    return out


# ---------------------------------------------------------------- model
class Gen2(nn.Module):
    def __init__(s, d=128, L=4, H=4, p=0.2):
        super().__init__()
        s.tok = nn.Embedding(VOCAB2, d); s.pos = nn.Embedding(MAXL, d)
        s.c = nn.Sequential(nn.Linear(8, d), nn.GELU(), nn.Linear(d, d)); s.bp = nn.Linear(2, d); s.be = nn.Embedding(NE, d); s.bpos = nn.Embedding(NB, d)
        l = nn.TransformerEncoderLayer(d, H, 4 * d, p, batch_first=True, norm_first=True, activation='gelu')
        s.tr = nn.TransformerEncoder(l, L, enable_nested_tensor=False)
        s.ln = nn.LayerNorm(d); s.out = nn.Linear(d, VOCAB2); s.drop = nn.Dropout(p); s.rem = nn.Linear(2, d)

    def forward(s, c, bp, x, r):
        B, T = x.shape; dev = x.device
        pre = torch.cat([s.c(c)[:, None], s.bp(bp[:, :, :2]) + s.be(bp[:, :, 2].long()) + s.bpos(torch.arange(NB, device=dev))[None]], 1)
        h = s.drop(torch.cat([pre, s.tok(x) + s.pos(torch.arange(T, device=dev))[None] + s.rem(r)], 1)); n = h.shape[1]
        return s.out(s.ln(s.tr(h, mask=torch.triu(torch.ones(n, n, dtype=torch.bool, device=dev), 1))))[:, 1 + NB:]


def prog(x, tgt):
    out = []; u = 0; n = 0
    for t in x:
        out.append((u / max(tgt or 1, 1), math.log1p(n) / 4))
        if UO <= t < UO + UN: u += du(t - UO) or 0; n += 1
    return out


def batch(es, aug, dev):
    C = []; BP = []; X = []; R = []
    for e in es:
        mir = aug and random.random() < 0.5; b = bpts(e, mir)
        if aug: b = np.roll(b, random.randrange(NB), 0)
        u = e['units']
        if aug and u: u = u * math.exp(random.gauss(0, 0.05))
        C.append(cond(e, u)); BP.append(b); X.append(toks2(e, mir)[:MAXL]); R.append(prog(X[-1], u))
    T = max(map(len, X)); R = [r + [(0., 0.)] * (T - len(x)) for r, x in zip(R, X)]; X = [x + [PAD] * (T - len(x)) for x in X]
    f = lambda a, **k: torch.tensor(np.array(a), **k).to(dev)
    return f(C), f(BP), f(X), f(R, dtype=torch.float32)


def loss_of(m, es, aug, dev):
    c, bp, x, r = batch(es, aug, dev); lg = m(c, bp, x[:, :-1], r[:, :-1])
    return F.cross_entropy(lg.reshape(-1, VOCAB2), x[:, 1:].reshape(-1), ignore_index=PAD, label_smoothing=0.05 if aug else 0.)


def isval(pid): return int(hashlib.md5(str(pid).encode()).hexdigest(), 16) % 7 == 0


def train(minutes, lines, out_dir, cfg=None, log=print, **_):
    """Trains on the train split; the development split is the validation set. Saves the best state by validation loss."""
    cfg = dict(cfg or {}); seed = int(cfg.get('seed', 0)); torch.manual_seed(seed); random.seed(seed); np.random.seed(seed)
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    E = parse_lines(lines, log)
    tr = [e for e in E if e['split'] == 'train']; va = [e for e in E if e['split'] == 'dev']
    if cfg.get('val') == 'hash':                                # alternative: hold a hashed seventh of train back
        va = [e for e in tr if isval(e['pid'])]; tr = [e for e in tr if not isval(e['pid'])]
    log(f"plans: train {len(tr)}, validation {len(va)}, device {dev}")
    arch = dict(d=int(cfg.get('d', 128)), L=int(cfg.get('L', 4)), H=int(cfg.get('H', 4)), p=float(cfg.get('dropout', 0.2)))
    m = Gen2(**arch).to(dev); opt = torch.optim.AdamW(m.parameters(), float(cfg.get('lr', 3e-4)), weight_decay=float(cfg.get('wd', 0.05)))
    bsz = int(cfg.get('batch', 12)); best = 1e9; ep = 0; t0 = time.time(); hist = []; since = 0
    patience = int(cfg.get('patience_evals', 12))
    while time.time() - t0 < minutes * 60:
        m.train(); random.shuffle(tr); bs = []
        for w in range(0, len(tr), 3 * bsz):
            ch = sorted(tr[w:w + 3 * bsz], key=lambda e: len(e['b']) * 7 + len(e['prk']) * 6); bs += [ch[i:i + bsz] for i in range(0, len(ch), bsz)]
        random.shuffle(bs)
        for bt in bs:
            opt.zero_grad(); l = loss_of(m, bt, True, dev); l.backward(); nn.utils.clip_grad_norm_(m.parameters(), 1.); opt.step()
        ep += 1
        if ep % int(cfg.get('eval_every', 5)) == 0:
            m.eval()
            with torch.no_grad():
                v = float(np.mean([loss_of(m, va[i:i + bsz], False, dev).item() for i in range(0, len(va), bsz)]))
            hist.append((ep, round(l.item(), 4), round(v, 4)))
            if v < best:
                best = v; since = 0
                torch.save({'state': m.state_dict(), 'arch': arch, 'cfg': cfg, 'val_loss': v, 'epoch': ep}, f"{out_dir}/mf_gen_v1.pt")
            else:
                since += 1
            log(f"epoch {ep} train {l.item():.3f} val {v:.3f} best {best:.3f}")
            if since >= patience: log('validation stopped improving'); break
    return dict(best_val_loss=best, epochs=ep, n_train=len(tr), n_val=len(va), history=hist[-40:], arch=arch, minutes=round((time.time() - t0) / 60, 1))


def load_model(path):
    ck = torch.load(path, map_location='cpu', weights_only=False)
    m = Gen2(**ck['arch']); m.load_state_dict(ck['state']); m.eval()
    return m, ck


# ---------------------------------------------------------------- sampling
def _rng(k):
    o, n = (V2[k] if k in V2 else OFF[k]); return list(range(o, o + n))


RG = {k: _rng(k) for k in list(V2) + list(OFF)}


def allowed(sec, cur):
    n = len(cur)
    if sec == 0:
        if n == 0: return [DRV, SEC]
        if n == 1: return RG['px']
        if n % 2 == 0: return RG['py']
        a = list(RG['px']) if n < 49 else []
        return a + ([DRV, SEC] if n >= 5 else [])
    if sec == 1:
        if n == 0: return RG['t'] + [SEC]
        return RG[FIELDS[n]]
    if n == 0: return [PRK, EOS]
    return RG[['px', 'py', 'pw', 'pd', 'pa'][n - 1]]


@torch.no_grad()
def sample(m, e, N=8, temp=0.9, tries=60, place=None):
    """Samples N plans. `place` (site frame) is where buildings may stand: the buildable envelope when the
    planner context supplies one, otherwise the site."""
    m.eval(); S = e['S']; site = e['site']; sb = site.buffer(2); tgt = e['units']; place = place if place is not None else site
    c = torch.tensor(cond(e, tgt))[None].repeat(N, 1); bp = torch.tensor(bpts(e))[None].repeat(N, 1, 1)
    st = [dict(seq=[BOS], cur=[], sec=0, drv=[], b=[], prk=[], ll=0., cl=0., done=False, fails=0, un=0, pave=None, nt=0, tf=0) for _ in range(N)]
    stats = dict(d=[0, 0], b=[0, 0], p=[0, 0])

    def close(s, term):
        s['seq'] += s['cur'] + [term]; s['ll'] += s['cl']; s['nt'] += len(s['cur']) + 1; s['cur'] = []; s['cl'] = 0.; s['fails'] = 0
        if term == SEC: s['sec'] += 1
        if term == SEC and s['sec'] == 1: s['pave'] = unary_union([l.buffer(HW) for l in s['drv']]) if s['drv'] else None
        if term == EOS: s['done'] = True

    def fail(s, term_on_giveup):
        s['cur'] = []; s['cl'] = 0.; s['fails'] += 1; s['tf'] += 1
        if s['fails'] >= tries or s['tf'] >= 3 * tries: close(s, term_on_giveup)

    while not all(s['done'] for s in st):
        act = [s for s in st if not s['done']]
        xs = [s['seq'] + s['cur'] for s in act]; T = max(map(len, xs))
        rr = torch.tensor([prog(x, tgt) + [(0., 0.)] * (T - len(x)) for x in xs], dtype=torch.float32)
        lg = m(c[:len(act)], bp[:len(act)], torch.tensor([x + [PAD] * (T - len(x)) for x in xs]), rr)
        for j, s in enumerate(act):
            if len(xs[j]) >= MAXL - 10: close(s, EOS); continue
            al = allowed(s['sec'], s['cur'])
            if s['sec'] == 1 and not s['cur'] and tgt and s['un'] < 0.85 * tgt and s['fails'] < tries - 1 and s['tf'] < 3 * tries - 1:
                al = [a for a in al if a != SEC]
            z = lg[j, len(xs[j]) - 1][al] / temp; pr = torch.log_softmax(z, -1); i = torch.multinomial(pr.exp(), 1).item(); t = al[i]; lp = pr[i].item()
            sec = s['sec']; cur = s['cur']
            if sec == 0:
                if t in (DRV, SEC) and len(cur) >= 5:
                    pts = [(dx(cur[q] - V2['px'][0]) * S, dx(cur[q + 1] - V2['py'][0]) * S) for q in range(1, len(cur), 2)]
                    g = LineString(pts); ok = g.length > 0 and g.intersection(sb).length >= 0.95 * g.length; stats['d'][0] += ok; stats['d'][1] += 1
                    if ok:
                        s['drv'].append(g); s['seq'] += cur; s['ll'] += s['cl']; s['nt'] += len(cur); s['cur'] = []; s['cl'] = 0.; s['fails'] = 0
                        if t == SEC: close(s, SEC)
                        else: s['cur'] = [DRV]; s['cl'] = lp
                    else: fail(s, SEC)
                elif t == SEC: s['cl'] += lp; close(s, SEC)
                else: cur.append(t); s['cl'] += lp
            elif sec == 1:
                if t == SEC: s['cl'] += lp; close(s, SEC); continue
                cur.append(t); s['cl'] += lp
                if len(cur) == 7:
                    v = [cur[q] - OFF[k][0] for q, k in enumerate(FIELDS)]
                    g = rect(dx(v[1]) * S, dx(v[2]) * S, dw(v[3]), dw(v[4]), (v[5] + 0.5) * 180 / NA); u = du(v[6]) or 0
                    ok = (g.intersection(place).area >= 0.97 * g.area and all(g.intersection(h['g']).area < 1 for h in s['b'])
                          and (s['pave'] is None or g.intersection(s['pave']).area < 0.1 * g.area))
                    stats['b'][0] += ok; stats['b'][1] += 1
                    if ok and tgt and s['un'] + u > 1.1 * tgt and s['b']: s['cur'] = []; close(s, SEC)
                    elif ok:
                        s['b'].append(dict(t=v[0], w=dw(v[3]), d=dw(v[4]), u=du(v[6]), g=g)); s['un'] += u
                        s['seq'] += cur; s['ll'] += s['cl']; s['nt'] += 7; s['cur'] = []; s['cl'] = 0.; s['fails'] = 0
                    else: fail(s, SEC)
            else:
                if t == EOS: s['cl'] += lp; close(s, EOS); continue
                cur.append(t); s['cl'] += lp
                if len(cur) == 6:
                    g = rect(dx(cur[1] - V2['px'][0]) * S, dx(cur[2] - V2['py'][0]) * S, dw(cur[3] - V2['pw'][0]), dw(cur[4] - V2['pd'][0]), (cur[5] - V2['pa'][0] + 0.5) * 180 / NA)
                    ok = g.intersection(site).area >= 0.9 * g.area and all(g.intersection(h['g']).area < 0.05 * g.area for h in s['b']) and all(g.intersection(h).area < 0.3 * g.area for h in s['prk'])
                    stats['p'][0] += ok; stats['p'][1] += 1
                    if ok: s['prk'].append(g); s['seq'] += cur; s['ll'] += s['cl']; s['nt'] += 6; s['cur'] = []; s['cl'] = 0.; s['fails'] = 0
                    else: fail(s, EOS)
    return [dict(b=s['b'], drv=s['drv'], prk=s['prk'], ll=s['ll'] / max(s['nt'], 1), units=s['un']) for s in st], stats


def propose(model, req, n=8, temp=0.9):
    """req: site_wkt (EPSG:2274), edges [{type, wkt}], envelope_wkt (optional), units, typ.
    Returns proposals with buildings, drives and parking fields as EPSG:2274 WKT."""
    p = dict(pid='request', typ=req.get('typ') or 'multifamily', split='request', site=req['site_wkt'],
             ctx=dict(boundary_edges=[dict(type=e['type'], wkt=e['wkt']) for e in req.get('edges') or []]),
             b=[], tm=dict(units=req.get('units')))
    e = encode(p)
    if not e['units']: return dict(error='a unit target is required')
    place = None
    if req.get('envelope_wkt'):
        env = e['T'](wkt.loads(req['envelope_wkt']))
        place = env if not env.is_empty else None
    plans, stats = sample(model, e, N=max(1, min(int(n), 24)), temp=float(temp), place=place)
    Ti = e['Ti']; out = []
    for pl in sorted(plans, key=lambda q: -q['ll']):
        out.append(dict(
            loglik=round(pl['ll'], 4), units_proposed=pl['units'],
            buildings=[dict(type=TYPES[b['t']], units=b['u'], wkt=Ti(b['g']).wkt) for b in pl['b']],
            drives=[Ti(l).wkt for l in pl['drv']],
            parking=[Ti(g).wkt for g in pl['prk']]))
    return dict(proposals=out, valid_rate={k: (v[0] / v[1] if v[1] else None) for k, v in stats.items()})
