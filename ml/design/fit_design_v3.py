"""Design model v3: v2's program inputs (normalised product shares, density, site size) plus parking type, stories, frontage, access points and site compactness.
Same discipline: fit and penalty choice on train only; development read once; held-out never read. Missing inputs get the train median and a missing flag."""
import json, re, sys, math
import numpy as np
def load_tool(path, key):
    j = json.loads(open(path).read()); txt = json.loads(j[0]['text'])['result']
    return json.loads(re.search(r'\[\{.*\}\]', txt, re.S).group(0))[0][key]
raw = open(sys.argv[1]).read()
rows = json.loads(re.search(r'\[\{.*\}\]', raw, re.S).group(0).encode().decode('unicode_escape'))[0]['rows']
labels = load_tool(sys.argv[2], 'labels'); extra = load_tool(sys.argv[3], 'extra')
TARGETS = ['stalls_per_unit','parking_pct','coverage_pct','units_per_bldg','length_med','depth_med','bldg_setback_med','bldg_per_ac','footprint_med']
PT = ['garden_walk_up','stacked_flats','wrap','podium','townhome_row','detached','cottage_court']
def shares(k):
    l = labels.get(k)
    if not l or not l.get('pt'): return None
    tot = sum(e['traced_buildings'] for e in l['pt']); s = {p: 0.0 for p in PT}
    for e in l['pt']:
        t = 'garden_walk_up' if e['type'] == 'tuck_under' else e['type']
        if t in s: s[t] += e['traced_buildings'] / tot
    return s
def pk_class(v):
    if not v: return None
    if 'struct' in v or 'podium' in v or 'deck' in v or 'underground' in v: return 'structured'
    if 'tuck' in v: return 'tuck'
    if 'garage' in v: return 'garage'
    if 'surface' in v: return 'surface'
    return 'other'
def base(r):
    mm = r['m'] or {}; du, ac = mm.get('du_ac'), mm.get('site_ac')
    return None if (not du or not ac or du <= 0 or ac <= 0) else (math.log(du), math.log(ac), ac)
D = [r for r in rows if r['s'] in ('train','dev') and base(r) and shares(r['k'])]
tr = [r for r in D if r['s']=='train']; dv = [r for r in D if r['s']=='dev']
def raw_extra(r):
    e = extra.get(r['k'], {}); ac = base(r)[2]
    st = e.get('st'); fr = e.get('fr'); ap = e.get('ap'); cmp_ = e.get('cmp')
    return {'ln_st': math.log(st) if st else None, 'ln_fr': math.log(fr / math.sqrt(ac * 43560)) if fr else None, 'ln_ap': math.log1p(ap) if ap is not None else None, 'cmp': cmp_, 'pk': pk_class(e.get('pk'))}
med = {k: float(np.median([raw_extra(r)[k] for r in tr if raw_extra(r)[k] is not None])) for k in ('ln_st','ln_fr','ln_ap','cmp')}
def x2(r):
    ld, la, _ = base(r); s = shares(r['k']); x = [1.0, ld, la, ld*la]
    for p in PT[1:]: x += [s[p], s[p]*ld]
    return x
def x3(r):
    e = raw_extra(r); x = x2(r)
    for k in ('ln_st','ln_fr','ln_ap','cmp'): x += [e[k] if e[k] is not None else med[k], 0.0 if e[k] is not None else 1.0]
    for c in ('garage','structured','tuck','other'): x.append(1.0 if e['pk'] == c else 0.0)
    x.append(1.0 if e['pk'] is None else 0.0)
    return x
def ridge(X, y, a):
    P = np.eye(X.shape[1]); P[0,0] = 0
    return np.linalg.solve(X.T @ X + a*P, X.T @ y)
def fit(T, xf, t):
    X = np.array([xf(r) for r in T]); y = np.array([math.log(r['m'][t]) for r in T]); best = None; idx = np.arange(len(T))
    for a in [0.3, 1, 3, 10, 30, 100]:
        e = np.mean([abs(X[i] @ ridge(X[idx!=i], y[idx!=i], a) - y[i]) for i in range(len(T))])
        if best is None or e < best[0]: best = (e, a)
    return ridge(X, y, best[1]), best[1], y.std()
def dom(r): s = shares(r['k']); return max(s, key=s.get)
tot = {'v2': [], 'v3': [], 'lookup_product': [], 'lookup_product_parking': []}; per = {}
for t in TARGETS:
    T = [r for r in tr if r['m'].get(t) and r['m'][t] > 0]; V = [r for r in dv if r['m'].get(t) and r['m'][t] > 0]
    if len(T) < 30 or len(V) < 5: continue
    w2, _, sd = fit(T, x2, t); w3, a3, _ = fit(T, x3, t); lv = lambda r: math.log(r['m'][t])
    def knn(r, same):
        b = base(r); c = sorted([(abs(b[0]-base(q)[0]) + abs(b[1]-base(q)[1]), lv(q)) for q in T if same(q, r)])[:9]
        if len(c) < 3: c = sorted([(abs(b[0]-base(q)[0]) + abs(b[1]-base(q)[1]), lv(q)) for q in T if dom(q)==dom(r)])[:9]
        return float(np.median([v for _, v in c])) if c else float(np.median([lv(q) for q in T]))
    e = {k: [] for k in tot}
    for r in V:
        v = lv(r)
        e['v2'].append(abs(np.array(x2(r)) @ w2 - v)/sd); e['v3'].append(abs(np.array(x3(r)) @ w3 - v)/sd)
        e['lookup_product'].append(abs(knn(r, lambda q, r: dom(q)==dom(r)) - v)/sd)
        e['lookup_product_parking'].append(abs(knn(r, lambda q, r: dom(q)==dom(r) and raw_extra(q)['pk']==raw_extra(r)['pk']) - v)/sd)
    per[t] = {k: round(float(np.mean(v)), 3) for k, v in e.items()}
    for k in tot: tot[k] += e[k]
cov = {k: sum(1 for r in tr if raw_extra(r)[k] is not None) for k in ('ln_st','ln_fr','ln_ap','cmp','pk')}
print(json.dumps({'n_train': len(tr), 'n_dev': len(dv), 'train_inputs_present': cov, 'overall_dev': {k: round(float(np.mean(v)), 3) for k, v in tot.items()}}))
for t, v in per.items(): print(t, v)
