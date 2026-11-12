"""Layout model v1: writes a subdivision's streets and the lots along each street.

Input  : the site outline, the lot module (width, depth), a yield bucket, and the roads that already exist beside the site.
Output : lots along the existing roads, then every new street as a line with the lots along each of its sides,
         each lot as (gap, width, depth). Lots written in order along one side of a street cannot overlap one another.

Sequence:
  BOS, yield, lot width, lot depth, outline points, SEP,
  then per road (existing roads first, then new streets, longest first):
      XSTREET or STREET, points, SIDE_L, front, (gap, width, depth)*, SIDE_R, front, (gap, width, depth)*
  EOS

Everything is in feet, relative to the site centre. The model is trained on recorded subdivisions. It does not decide
which lots count: resolve() turns its bands into lots that do not overlap, lie on the site and off the street, and
meet the lot standard. The database applies the same steps before a plan is shown.

Run:  python layout_model.py train <minutes> <export files...>
      python layout_model.py ref <export files...>      (how many built lots survive the format and the checks)
"""
import json, math, os, random, re, sys, time

import torch
import torch.nn as nn
import torch.nn.functional as F
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring, unary_union

DEV = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ---- vocabulary -------------------------------------------------------------------------------------------------
PAD, BOS, SEP, EOS, STREET, XSTREET, SIDE_L, SIDE_R = range(8)
Y0, NY, YBIN = 8, 24, 0.05          # yield bucket: lots as a share of (site area / lot module area)
C0, NC, CBIN = Y0 + NY, 480, 10     # coordinates: 10 ft bins, +-2400 ft from the site centre
W0, NW, WBIN = C0 + NC, 400, 1      # lot width along the street: 1 ft bins
D0, ND, DBIN = W0 + NW, 120, 5      # lot depth: 5 ft bins
G0, NG, GBIN = D0 + ND, 240, 5      # gap before a lot along the street: 5 ft bins
F0, NF, FBIN = G0 + NG, 24, 5       # distance from the street line to the front of its lots: 5 ft bins
V = F0 + NF

# Settings. Model and training sizes are choices for this run. The lot standard is the one the rule engine is
# replayed with (module width and depth from the plat, minimum area = the smaller of the plat's small-lot area and
# 95% of the module), so the model and the engine are held to the same lots.
CFG = dict(
    ctx=640, max_boundary_pts=40, max_roads=16, max_street_pts=24, max_new_streets=12,
    d_model=192, heads=6, layers=6, dropout=0.1,
    batch=12, lr=3e-4, weight_decay=0.05, warmup=100, val_sites=100, eval_every=100,
    temp=0.8, topk=20, tries=4, yield_pcts=[0.75, 0.9, 0.95, 0.99],
    module_round_ft=5, min_area_module_share=0.95,   # as training.fn_ai_site_opts
    strict_width=True,      # model lots must be at least the module width (the engine's standard lot)
    inner_margin_row=0.5,   # a street counts as on the site when it is at least this many right-of-way widths inside the outline
    min_street_ft=30.0,     # shorter pieces of street are not kept
    existing_inside_share=0.5,   # a mapped street with less than this share of its length inside the site is an existing road
    min_band_depth=20.0, min_lot_w=10.0,   # numerical guards: thinner pieces are not lots
    match_min=50,           # a recorded lot is used when at least this % of it matched its street band
    reach_tol=3.0,          # a kept lot must still reach its street to within this many feet
)


def ctok(v): return C0 + max(0, min(NC - 1, round(v / CBIN) + NC // 2))
def unc(t): return (t - C0 - NC // 2) * CBIN
def wtok(v): return W0 + max(1, min(NW - 1, round(v / WBIN)))
def dtok(v): return D0 + max(1, min(ND - 1, round(v / DBIN)))
def ytok(v): return Y0 + max(0, min(NY - 1, round(v / YBIN)))
def ftok(v): return F0 + max(0, min(NF - 1, round(v / FBIN)))


# ---- geometry helpers -------------------------------------------------------------------------------------------
def signed_area(b):
    return sum(b[i][0] * b[(i + 1) % len(b)][1] - b[(i + 1) % len(b)][0] * b[i][1] for i in range(len(b))) / 2


def line_len(line):
    return sum(math.dist(line[i], line[i + 1]) for i in range(len(line) - 1))


def xf(pt, th, mir):
    x, y = pt
    if mir:
        x = -x
    c, s = math.cos(th), math.sin(th)
    return x * c - y * s, x * s + y * c


def poly_of(b):
    P = Polygon(b).buffer(0)
    if P.geom_type != 'Polygon':
        P = max(getattr(P, 'geoms', [P]), key=lambda g: g.area) if not P.is_empty else P
    return P


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == 'LineString':
        return [g]
    return [x for x in getattr(g, 'geoms', []) if x.geom_type == 'LineString']


def simplify_to(g, n, tols=(0, 20, 30, 45, 70, 100, 150)):
    for t in tols:
        h = g.simplify(t) if t else g
        pts = list(h.exterior.coords)[:-1] if h.geom_type == 'Polygon' else list(h.coords)
        if len(pts) <= n:
            return pts
    return None


def canon(s, th=0.0, mir=False):
    """The site in a standard form: outline counter-clockwise from its top point; existing roads first, then new
    streets, longest first; each line runs from its upper end; lots keyed by side (1 = left of the line's direction)."""
    b = [xf(p, th, mir) for p in s['b']]
    if signed_area(b) < 0:
        b.reverse()
    i0 = max(range(len(b)), key=lambda i: (b[i][1], -b[i][0]))
    b = b[i0:] + b[:i0]
    items = []
    for r in s['roads']:
        ln = [xf(p, th, mir) for p in r['line']]
        L = r['len']
        flip = (ln[-1][1], -ln[-1][0]) > (ln[0][1], -ln[0][0])
        if flip:
            ln.reverse()
        lots, front = {}, {}
        for side in (1, -1):
            ns = side * (-1 if mir else 1) * (-1 if flip else 1)
            lots[ns] = sorted(((L - bb, L - a, dep) if flip else (a, bb, dep)) for a, bb, dep in r['lots'][side])
            front[ns] = r['front'][side]
        items.append({'ctx': r['ctx'], 'line': ln, 'len': L, 'lots': lots, 'front': front})
    items.sort(key=lambda t: (not t['ctx'], -t['len']))
    return b, items


# ---- encoding ---------------------------------------------------------------------------------------------------
def prefix_tokens(s, b, y):
    seq = [BOS, ytok(y), wtok(s['w']), dtok(s['d'])]
    for x, yy in b:
        seq += [ctok(x), ctok(yy)]
    seq.append(SEP)
    return seq


def road_tokens(ctx, line):
    out = [XSTREET if ctx else STREET]
    for x, y in line:
        out += [ctok(x), ctok(y)]
    return out


def encode(s, cfg, th=0.0, mir=False):
    b, roads = canon(s, th, mir)
    seq = prefix_tokens(s, b, s['yield'])
    for r in roads:
        seq += road_tokens(r['ctx'], r['line'])
        for side, tok in ((1, SIDE_L), (-1, SIDE_R)):
            seq += [tok, ftok(r['front'][side])]
            pos = 0.0                               # where the previous lot ends once decoded: rounding cannot build up
            for a, bb, dep in r['lots'][side]:
                g = min(NG - 1, max(0, round((a - pos) / GBIN)))
                a_dec = pos + g * GBIN
                w = min(NW - 1, round((bb - a_dec) / WBIN))
                if w * WBIN < cfg['min_lot_w']:
                    continue
                seq += [G0 + g, W0 + w, dtok(dep)]
                pos = a_dec + w * WBIN
    seq.append(EOS)
    return seq


def decode(seq):
    """Tokens back to roads and lots. Tolerates a sequence that stops early."""
    i = seq.index(SEP) + 1
    roads = []
    while i < len(seq) and seq[i] in (STREET, XSTREET):
        r = {'ctx': seq[i] == XSTREET, 'line': [], 'lots': {1: [], -1: []}, 'front': {1: 0.0, -1: 0.0}}
        i += 1
        while i + 1 < len(seq) and C0 <= seq[i] < C0 + NC and C0 <= seq[i + 1] < C0 + NC:
            r['line'].append((unc(seq[i]), unc(seq[i + 1])))
            i += 2
        for side, tok in ((1, SIDE_L), (-1, SIDE_R)):
            if i + 1 < len(seq) and seq[i] == tok and F0 <= seq[i + 1] < F0 + NF:
                r['front'][side] = (seq[i + 1] - F0) * FBIN
                i += 2
                pos = 0.0
                while i + 2 < len(seq) and G0 <= seq[i] < G0 + NG:
                    a = pos + (seq[i] - G0) * GBIN
                    pos = a + (seq[i + 1] - W0) * WBIN
                    r['lots'][side].append((a, pos, (seq[i + 2] - D0) * DBIN))
                    i += 3
        r['len'] = line_len(r['line']) if len(r['line']) >= 2 else 0.0
        roads.append(r)
    return roads


# ---- data -------------------------------------------------------------------------------------------------------
def read_export(path):
    raw = open(path).read()
    m = re.search(r'\[\{.*\}\]', raw, re.S)          # a saved query result wraps the text in JSON
    if m:
        try:
            return json.loads(m.group(0).encode().decode('unicode_escape'))[0]['txt'].split('\n')
        except Exception:
            pass
    return raw.split('\n')


def parse_site(p, cfg):
    """One plat: split|key|w|d|row_w|area_p10|outline|streets|lots|n_total  (training.fn_layout_export_v2)."""
    b = [tuple(map(float, q.split())) for q in p[6].split(';')]
    if b[0] == b[-1]:
        b = b[:-1]
    if len(b) < 3:
        return 'outline'
    P = poly_of(b)
    if P.is_empty or P.area < 1:
        return 'outline'
    b = simplify_to(P, cfg['max_boundary_pts'])
    if b is None:
        return 'outline_points'
    if max(math.hypot(*pt) for pt in b) > CBIN * (NC // 2 - 5):
        return 'too_large'
    rw = float(p[4] or 50)
    raw = {}
    for q in p[8].split(';'):
        v = q.split()
        if len(v) == 7:
            raw.setdefault(int(v[0]), []).append((int(v[1]),) + tuple(float(x) for x in v[2:]))
    n_all = sum(len(v) for v in raw.values())
    inner = P.buffer(-cfg['inner_margin_row'] * rw)
    roads, n_fmt, widths, depths = [], 0, [], []
    for k, item in enumerate(p[7].split(';'), 1):
        tl, _, pts = item.partition('@')
        pts = [tuple(map(float, q.split())) for q in pts.split(',')]
        if len(pts) < 2:
            continue
        ln = LineString(pts)
        if ln.length < 1:
            continue
        sc = ln.length / float(tl) if float(tl or 0) > 0 else 1.0     # lot positions were measured on the unsimplified street
        parts = []
        if ln.length >= cfg['min_street_ft']:
            # a mapped street that lies mostly outside the site is an existing road (given to the model); one that lies
            # mostly inside is a street of the subdivision (the model must write it, entrance included)
            ctx = ln.intersection(inner).length < cfg['existing_inside_share'] * ln.length
            c = simplify_to(ln, cfg['max_street_pts'])
            if c is None:
                return 'street_points'
            parts.append({'ctx': ctx, 'line': c, 'g': LineString(c), 'lots': {1: [], -1: []}, 'f': {1: [], -1: []}})
        for side, c, cd, f, area, match in raw.get(k, []):
            if not parts or match < cfg['match_min']:
                continue
            dep = 2 * (cd - f)                    # a band of the lot's own area, centred where the lot is
            if dep < cfg['min_band_depth']:
                continue
            w = area / dep
            if not cfg['min_lot_w'] <= w < NW * WBIN:
                continue
            pt = ln.interpolate(min(c * sc, ln.length))
            part = min(parts, key=lambda q: q['g'].distance(pt))
            pos = part['g'].project(pt)
            part['lots'][side].append((pos - w / 2, pos + w / 2, dep))
            part['f'][side].append(f)
            n_fmt += 1
            widths.append(w)
            depths.append(dep)
        for q in parts:
            if q['ctx'] or q['lots'][1] or q['lots'][-1] or q['g'].length >= rw:
                med = lambda v: sorted(v)[len(v) // 2] if v else rw / 2
                roads.append({'ctx': q['ctx'], 'line': q['line'], 'len': q['g'].length,
                              'lots': {sd: sorted(q['lots'][sd]) for sd in (1, -1)}, 'front': {sd: med(q['f'][sd]) for sd in (1, -1)}})
    if not roads or not n_fmt:
        return 'no_lots'
    if len(roads) > cfg['max_roads']:
        return 'roads'
    w, d = float(p[2] or 0), float(p[3] or 0)
    if w < 10 or d < 10:                          # no module on record: take it from the lots themselves
        w, d = sorted(widths)[len(widths) // 2], sorted(depths)[len(depths) // 2]
    mr = cfg['module_round_ft']
    w, d = round(w / mr) * mr, round(d / mr) * mr
    amin = float(p[5] or 0) or cfg['min_area_module_share'] * w * d
    s = {'split': p[0], 'key': p[1], 'w': w, 'd': d, 'rw': rw, 'min_sf': round(min(amin, cfg['min_area_module_share'] * w * d)),
         'b': b, 'roads': roads, 'n_fmt': n_fmt, 'n_total': int(p[9] or n_all), 'area': P.area}
    s['yield'] = n_fmt / max(1.0, P.area / (w * d))
    if len(encode(s, cfg)) > cfg['ctx']:
        return 'too_long'
    return s


def parse_lines(lines, cfg):
    sites, drop = [], {}
    for line in lines:
        p = line.strip().split('|')
        if len(p) != 10 or not p[6] or not p[7] or not p[8]:
            if line.strip():
                drop['fields'] = drop.get('fields', 0) + 1
            continue
        try:
            s = parse_site(p, cfg)
        except Exception as e:
            s = 'error:' + type(e).__name__
        if isinstance(s, str):
            drop[s] = drop.get(s, 0) + 1
            if p[0] != 'train':
                drop[p[0] + '_dropped'] = drop.get(p[0] + '_dropped', 0) + 1
        else:
            sites.append(s)
    return sites, drop


# ---- model ------------------------------------------------------------------------------------------------------
class Block(nn.Module):
    def __init__(self, d, h, drop):
        super().__init__()
        self.h, self.p = h, drop
        self.ln1 = nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d)
        self.proj = nn.Linear(d, d)
        self.ln2 = nn.LayerNorm(d)
        self.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
        self.drop = nn.Dropout(drop)

    def forward(self, x, cache=None):
        B, T, D = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(B, T, 3, self.h, D // self.h).permute(2, 0, 3, 1, 4)
        if cache is None:
            y = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=self.p if self.training else 0.0)
        else:                                       # generation: keys and values of earlier tokens are kept
            if 'k' in cache:
                k = torch.cat([cache['k'], k], 2)
                v = torch.cat([cache['v'], v], 2)
            cache['k'], cache['v'] = k, v
            Tc = k.shape[2] - T
            mask = None if T == 1 else torch.ones(T, Tc + T, dtype=torch.bool, device=x.device).tril(Tc)
            y = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
        x = x + self.drop(self.proj(y.transpose(1, 2).reshape(B, T, D)))
        return x + self.drop(self.mlp(self.ln2(x)))


class LayoutModel(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        d = cfg['d_model']
        self.tok = nn.Embedding(V, d)
        self.pos = nn.Embedding(cfg['ctx'], d)
        self.blocks = nn.ModuleList([Block(d, cfg['heads'], cfg['dropout']) for _ in range(cfg['layers'])])
        self.ln = nn.LayerNorm(d)
        self.head = nn.Linear(d, V, bias=False)

    def forward(self, idx, caches=None, pos0=0):
        T = idx.shape[1]
        x = self.tok(idx) + self.pos(torch.arange(pos0, pos0 + T, device=idx.device))
        for i, b in enumerate(self.blocks):
            x = b(x, None if caches is None else caches[i])
        return self.head(self.ln(x))


def loss_of(model, seqs):
    T = max(len(q) for q in seqs)
    x = torch.full((len(seqs), T), PAD, dtype=torch.long)
    for i, q in enumerate(seqs):
        x[i, :len(q)] = torch.tensor(q)
    x = x.to(DEV)
    lg = model(x[:, :-1])
    return F.cross_entropy(lg.reshape(-1, V), x[:, 1:].reshape(-1), ignore_index=PAD)


# ---- generation -------------------------------------------------------------------------------------------------
class Gen:
    """Feeds tokens to the model one step at a time and keeps the next-token scores."""

    def __init__(self, model, cfg, toks):
        self.m, self.cfg = model, cfg
        self.caches = [dict() for _ in model.blocks]
        self.n, self.seq = 0, []
        self.push(toks)

    def room(self, k):
        return self.n + k <= self.cfg['ctx']

    def push(self, toks):
        toks = [toks] if isinstance(toks, int) else list(toks)
        self.logits = self.m(torch.tensor([toks], device=DEV), self.caches, self.n)[0, -1].float().cpu()
        self.n += len(toks)
        self.seq += toks

    def pick(self, allowed):
        allowed = list(allowed)
        lg = self.logits[allowed] / self.cfg['temp']
        if self.cfg['topk'] < len(allowed):
            kth = torch.topk(lg, self.cfg['topk']).values[-1]
            lg = lg.masked_fill(lg < kth, float('-inf'))
        return allowed[int(torch.multinomial(F.softmax(lg, -1), 1))]


COORDS = range(C0, C0 + NC)
DEPTHS = range(D0 + 1, D0 + ND)


def gen_side(g, L, stop, min_w):
    """Lots along one side of a road of length L. Only lots that fit on the road and meet the width can be written."""
    lots, pos = [], 0.0
    wmin = math.ceil(max(min_w, g.cfg['min_lot_w']) / WBIN)
    while g.room(5):
        gmax = int((L - wmin * WBIN - pos) // GBIN)
        t = g.pick(list(stop) + (list(range(G0, G0 + min(NG, gmax + 1))) if gmax >= 0 else []))
        if t in stop:
            break
        a = pos + (t - G0) * GBIN
        wmax = min(NW - 1, int((L - a) // WBIN))
        if wmax < wmin:
            break
        g.push(t)
        wt = g.pick(range(W0 + wmin, W0 + wmax + 1))
        g.push(wt)
        dt = g.pick(DEPTHS)
        g.push(dt)
        pos = a + (wt - W0) * WBIN
        lots.append((a, pos, (dt - D0) * DBIN))
    return lots


@torch.no_grad()
def generate(model, s, cfg, y, new_streets=None):
    """One layout for site s. Existing roads are given. new_streets = lines to use for the new streets (the model
    then writes only the lots); None = the model writes the new streets too. Returns roads as decode() does."""
    b, roads = canon(s)
    P = poly_of(b)
    min_w = s['w'] if cfg['strict_width'] else 0.0
    g = Gen(model, cfg, prefix_tokens(s, b, y))
    out = []

    def sides(r):
        for side, tok, stop in ((1, SIDE_L, (SIDE_R,)), (-1, SIDE_R, (XSTREET, STREET, EOS))):
            if not g.room(2):
                break
            g.push([tok, ftok(r['front'][side])])
            r['lots'][side] = gen_side(g, r['len'], stop, min_w)
        out.append(r)

    def road(ctx, line):
        f = (ftok(max(0.0, P.distance(LineString(line))) if ctx else s['rw'] / 2) - F0) * FBIN
        return {'ctx': ctx, 'line': line, 'len': line_len(line), 'lots': {1: [], -1: []}, 'front': {1: f, -1: f}}

    given = [(True, r['line']) for r in roads if r['ctx']] + [(False, l) for l in (new_streets or [])]
    for ctx, line in given:
        toks = road_tokens(ctx, line)
        if not g.room(len(toks) + 6):
            break
        g.push(toks)
        sides(road(ctx, line))
    if new_streets is None:
        n_new = 0
        while n_new < cfg['max_new_streets'] and g.room(14):
            if g.pick([STREET, EOS]) == EOS:
                break
            g.push(STREET)
            line = []
            while True:
                full = len(line) >= cfg['max_street_pts'] or not g.room(10)
                if full and len(line) < 2:
                    break
                t = SIDE_L if full else g.pick(list(COORDS) + ([SIDE_L] if len(line) >= 2 else []))
                if t == SIDE_L:
                    break
                g.push(t)
                yy = g.pick(COORDS)
                g.push(yy)
                line.append((unc(t), unc(yy)))
            if len(line) < 2:
                break
            n_new += 1
            sides(road(False, line))
    return out


def pack(s, cfg, roads, P):
    """Control with no model: lots of the module width and depth packed along both sides of every road given."""
    out = []
    for r in roads:
        f = (ftok(max(0.0, P.distance(LineString(r['line']))) if r['ctx'] else s['rw'] / 2) - F0) * FBIN
        n = int(r['len'] // s['w'])
        lots = [(k * s['w'], (k + 1) * s['w'], s['d']) for k in range(n)]
        out.append({'ctx': r['ctx'], 'line': r['line'], 'len': r['len'], 'lots': {1: lots, -1: list(lots)}, 'front': {1: f, -1: f}})
    return out


# ---- resolve: bands to lots that count --------------------------------------------------------------------------
def resolve(s, b, roads, cfg, min_w):
    """Turns the written bands into lots and counts those that meet the standard. In order: a lot is cut to the
    site, cut clear of street right-of-way and of lots already kept, and then must still have the minimum area,
    the minimum width along its street, and reach its street. Lots on a new street that does not connect to an
    existing road (directly or through other streets) do not count. Returns (lots that count, lots written)."""
    P = poly_of(b)
    if P.is_empty:
        return 0, 0
    lines = [LineString(r['line']) if len(r['line']) >= 2 else None for r in roads]
    tol = s['rw']
    anchored = {i for i, r in enumerate(roads) if r['ctx'] and lines[i] is not None}
    if not anchored:                               # no existing road on record: a street reaching the edge is taken as the way in
        anchored = {i for i, l in enumerate(lines) if l is not None and l.distance(P.exterior) <= tol}
    grew = True
    while grew:
        grew = False
        for i, l in enumerate(lines):
            if l is not None and i not in anchored and any(l.distance(lines[j]) <= tol for j in anchored):
                anchored.add(i)
                grew = True
    row = []
    for i, r in enumerate(roads):
        if not r['ctx'] and lines[i] is not None:
            for sd in (1, -1):
                if r['front'][sd] > 0.5:
                    row.append(lines[i].buffer(sd * r['front'][sd], single_sided=True, cap_style='flat'))
    build = P.difference(unary_union(row)) if row else P
    kept, written = [], 0
    for i, r in enumerate(roads):
        for sd in (1, -1):
            for a, bb, dep in r['lots'][sd]:
                written += 1
                if i not in anchored or dep < 5:
                    continue
                sub = substring(lines[i], max(0.0, a), min(lines[i].length, bb))
                if sub.geom_type != 'LineString' or sub.length < max(min_w - 0.5, 5.0):
                    continue
                f = r['front'][sd]
                try:
                    band = sub.buffer(sd * (f + dep), single_sided=True, cap_style='flat', join_style='mitre', mitre_limit=2)
                    if f > 0.5:
                        band = band.difference(sub.buffer(sd * f, single_sided=True, cap_style='flat', join_style='mitre', mitre_limit=2))
                    piece = band.intersection(build)
                    reach = piece.distance(sub) if not piece.is_empty else 0.0      # how near the street the land itself comes
                    x0, y0, x1, y1 = piece.bounds if not piece.is_empty else (0, 0, 0, 0)
                    for k in kept:
                        kb = k.bounds
                        if not (kb[2] < x0 or kb[0] > x1 or kb[3] < y0 or kb[1] > y1):
                            piece = piece.difference(k)
                    if piece.geom_type != 'Polygon':
                        polys = [q for q in getattr(piece, 'geoms', []) if q.geom_type == 'Polygon']
                        piece = max(polys, key=lambda q: q.area) if polys else None
                except Exception:
                    continue
                if piece is None or piece.is_empty or piece.area < s['min_sf'] or piece.distance(sub) > reach + cfg['reach_tol']:
                    continue
                kept.append(piece)
    return len(kept), written


def evaluate(model, sites, cfg, ytargets, per_site=False):
    rows, t0 = [], time.time()
    for s in sites:
        b, roads = canon(s)
        P = poly_of(b)
        r = {'key': s['key'], 'built': s['n_total'], 'in_format': s['n_fmt']}
        ref = decode(encode(s, cfg))
        r['ref_area'] = resolve(s, b, ref, cfg, 0.0)[0]
        r['ref_strict'] = resolve(s, b, ref, cfg, s['w'])[0]
        r['packed'] = resolve(s, b, pack(s, cfg, roads, P), cfg, s['w'])[0]
        r['packed_existing_only'] = resolve(s, b, pack(s, cfg, [q for q in roads if q['ctx']], P), cfg, s['w'])[0]
        if model is not None:
            mw = s['w'] if cfg['strict_width'] else 0.0
            yy = ytargets[min(1, len(ytargets) - 1)]
            r['model_lots'] = resolve(s, b, generate(model, s, cfg, yy, [q['line'] for q in roads if not q['ctx']]), cfg, mw)[0]
            tries, packed = [], []
            for t in range(cfg['tries']):
                roads_t = generate(model, s, cfg, ytargets[t % len(ytargets)])
                tries.append(resolve(s, b, roads_t, cfg, mw)[0])
                packed.append(resolve(s, b, pack(s, cfg, roads_t, P), cfg, s['w'])[0])      # the model's streets, lots packed by rule
            r['model_all_1'], r['model_all_best'] = tries[0], max(tries)
            r['model_streets_packed_best'] = max(packed)
            r['model_either_best'] = max(max(a, c) for a, c in zip(tries, packed))
        rows.append(r)
    built = max(1, sum(r['built'] for r in rows))
    tot = lambda k: sum(r.get(k, 0) for r in rows)
    sh = lambda k: round(tot(k) / built, 3)
    out = {'sites': len(rows), 'built_lots': tot('built'), 'seconds': round(time.time() - t0),
           'built_lots_in_format': sh('in_format'),
           'built_layout_resolved_area_standard': sh('ref_area'),
           'built_layout_resolved_module_width': sh('ref_strict'),
           'control_packed_on_built_streets': sh('packed'),
           'control_packed_on_existing_roads_only': sh('packed_existing_only')}
    if model is not None:
        out.update({'model_lots_on_built_streets': sh('model_lots'),
                    'model_streets_and_lots_one_try': sh('model_all_1'),
                    'model_streets_and_lots_best_of_%d' % cfg['tries']: sh('model_all_best'),
                    'model_streets_rule_packed_best_of_%d' % cfg['tries']: sh('model_streets_packed_best'),
                    'model_streets_either_best_of_%d' % cfg['tries']: sh('model_either_best'),
                    'sites_model_lots_beat_packed': sum(1 for r in rows if r['model_lots'] > r['packed']),
                    'sites_model_all_beat_existing_only': sum(1 for r in rows if r['model_all_best'] > r['packed_existing_only'])})
    if per_site:
        out['rows'] = rows
    return out


# ---- training ---------------------------------------------------------------------------------------------------
def split_sites(sites, cfg):
    tr = sorted((s for s in sites if s['split'] == 'train'), key=lambda s: s['key'])
    va, tr = tr[:cfg['val_sites']], tr[cfg['val_sites']:]          # keys are hashes, so this slice is arbitrary
    return tr, va, [s for s in sites if s['split'] == 'dev'], [s for s in sites if s['split'] == 'holdout']


def train(minutes, lines, out_dir='.', cfg=None, log=print, eval_holdout=True):
    cfg = dict(CFG, **(cfg or {}))
    torch.manual_seed(0)
    random.seed(0)
    sites, drop = parse_lines(lines, cfg)
    tr, va, dv, ho = split_sites(sites, cfg)
    ys = sorted(s['yield'] for s in tr)
    ytargets = [ys[min(len(ys) - 1, int(p * len(ys)))] for p in cfg['yield_pcts']]
    log(json.dumps({'device': str(DEV), 'sites': len(sites), 'dropped': drop, 'train': len(tr), 'val': len(va), 'dev': len(dv),
                    'holdout': len(ho), 'vocab': V, 'yield_targets': [round(y, 2) for y in ytargets]}))
    model = LayoutModel(cfg).to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg['lr'], weight_decay=cfg['weight_decay'])
    path = os.path.join(out_dir, 'layout_model_v1.pt')
    val_seqs = [encode(s, cfg) for s in va]

    def val_loss():
        model.eval()
        with torch.no_grad():
            parts = [float(loss_of(model, val_seqs[i:i + 16])) for i in range(0, len(val_seqs), 16)]
        return sum(parts) / max(1, len(parts))

    def save():
        torch.save({'state': model.state_dict(), 'cfg': cfg, 'ytargets': ytargets, 'vocab': V}, path)

    best = val_loss()
    save()                                           # a checkpoint always exists, however short the run
    t0, step, hist = time.time(), 0, []
    while time.time() - t0 < minutes * 60:
        model.train()
        batch = [encode(random.choice(tr), cfg, random.uniform(0, 2 * math.pi), random.random() < 0.5) for _ in range(cfg['batch'])]
        frac = (time.time() - t0) / (minutes * 60)
        for gr in opt.param_groups:
            gr['lr'] = cfg['lr'] * min(1.0, (step + 1) / cfg['warmup']) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * frac)))
        loss = loss_of(model, [q[:cfg['ctx']] for q in batch])
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        step += 1
        if step % cfg['eval_every'] == 0:
            vl = val_loss()
            hist.append({'step': step, 'min': round((time.time() - t0) / 60, 1), 'train': round(float(loss.detach()), 3), 'val': round(vl, 3)})
            log(json.dumps(hist[-1]))
            if vl < best:
                best = vl
                save()
    vl = val_loss()
    if vl < best:
        best = vl
        save()
    ck = torch.load(path, map_location=DEV)
    model.load_state_dict(ck['state'])
    model.eval()
    cap = cfg.get('eval_cap')                        # smoke tests only: score the first few sites of each group
    res = {'steps': step, 'best_val_loss': round(best, 3), 'train_sites': len(tr), 'params': sum(p.numel() for p in model.parameters()),
           'dropped': drop, 'history': hist[-5:], 'val': evaluate(model, va[:cap or 30], cfg, ytargets), 'dev': evaluate(model, dv[:cap], cfg, ytargets, per_site=True)}
    if eval_holdout:
        res['holdout'] = evaluate(model, ho[:cap], cfg, ytargets)    # aggregate only
    json.dump(dict(res, cfg=cfg), open(os.path.join(out_dir, 'layout_model_v1_results.json'), 'w'))
    log('RESULT_V1 ' + json.dumps(dict(res, dev={k: v for k, v in res['dev'].items() if k != 'rows'})))
    return res


def site_from_request(d, cfg):
    """A site sent by the database: outline and nearby existing roads in map feet, lot module and minimum area.
    Returns the site in the model's frame (feet from the outline's centre) or a text reason it cannot be handled."""
    P0 = poly_of([tuple(p) for p in d['outline']])
    if P0.is_empty or P0.area < 1:
        return 'outline'
    ox, oy = P0.centroid.x, P0.centroid.y
    P = poly_of([(x - ox, y - oy) for x, y in d['outline']])
    b = simplify_to(P, cfg['max_boundary_pts'])
    if b is None:
        return 'outline_points'
    if max(math.hypot(*pt) for pt in b) > CBIN * (NC // 2 - 5):
        return 'too_large'
    rw = float(d.get('rw') or 50)
    inner = P.buffer(-cfg['inner_margin_row'] * rw)
    roads = []
    for line in d.get('roads') or []:
        if len(line) < 2:
            continue
        g = LineString([(x - ox, y - oy) for x, y in line])
        if g.length < cfg['min_street_ft'] or g.intersection(inner).length >= cfg['existing_inside_share'] * g.length:
            continue                              # too short, or a street inside the site (not an existing road)
        c = simplify_to(g, cfg['max_street_pts'])
        if c:
            roads.append({'ctx': True, 'line': c, 'len': LineString(c).length, 'lots': {1: [], -1: []}, 'front': {1: rw / 2, -1: rw / 2}})
    roads = sorted(roads, key=lambda r: -r['len'])[:max(0, cfg['max_roads'] - cfg['max_new_streets'])]
    return {'key': d.get('key'), 'split': 'request', 'w': float(d['w']), 'd': float(d['d']), 'rw': rw, 'min_sf': float(d['min_sf']),
            'b': b, 'roads': roads, 'n_fmt': 0, 'n_total': 0, 'area': P.area, 'yield': 0.0, 'origin': (ox, oy)}


def roads_to_json(roads, s):
    """A layout for the database: lines back in map feet; lots as [from, to, depth] along each line, left then right."""
    ox, oy = s.get('origin', (0.0, 0.0))
    return [{'existing': r['ctx'], 'line': [[round(x + ox, 1), round(y + oy, 1)] for x, y in r['line']],
             'front': [r['front'][1], r['front'][-1]], 'left': [list(l) for l in r['lots'][1]], 'right': [list(l) for l in r['lots'][-1]]}
            for r in roads if len(r['line']) >= 2]


def load_model(path):
    ck = torch.load(path, map_location=DEV)
    model = LayoutModel(ck['cfg']).to(DEV)
    model.load_state_dict(ck['state'])
    model.eval()
    return model, ck['cfg'], ck['ytargets']


if __name__ == '__main__':
    mode = sys.argv[1]
    over = json.loads(os.environ.get('CFG', '{}'))
    if mode == 'ref':
        cfg = dict(CFG, **over)
        sites, drop = parse_lines([l for f in sys.argv[2:] for l in read_export(f)], cfg)
        tr, va, dv, ho = split_sites(sites, cfg)
        print(json.dumps({'sites': len(sites), 'train': len(tr), 'val': len(va), 'dev': len(dv), 'holdout': len(ho), 'dropped': drop,
                          'max_seq': max(len(encode(s, cfg)) for s in sites)}))
        for name, group in (('val', va), ('dev', dv)):
            print(name, json.dumps(evaluate(None, group, cfg, None)))
    else:
        train(float(sys.argv[2]), [l for f in sys.argv[3:] for l in read_export(f)], cfg=over,
              eval_holdout=os.environ.get('HOLDOUT', '1') == '1')
