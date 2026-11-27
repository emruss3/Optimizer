"""Design model v2: the program now includes the normalised product types (share of traced buildings per product type) in place of the stored typology.
Same train/dev discipline as v1: fit and penalty choice on train only, development read once, held-out never read."""
import json, re, sys, math
import numpy as np
def load(path, key):
    raw = open(path).read()
    j = json.loads(raw)
    txt = j[0]['text'] if isinstance(j, list) else raw
    if isinstance(j, list): txt = json.loads(txt)['result']
    m = re.search(r'\[\{.*\}\]', txt, re.S)
    return json.loads(m.group(0))[0][key]
def load_v1(path):
    raw = open(path).read(); m = re.search(r'\[\{.*\}\]', raw, re.S)
    return json.loads(m.group(0).encode().decode('unicode_escape'))[0]['rows']
rows = load_v1(sys.argv[1]); labels = load(sys.argv[2], 'labels')
TARGETS = ['stalls_per_unit','parking_pct','coverage_pct','units_per_bldg','length_med','depth_med','bldg_setback_med','bldg_per_ac','footprint_med']
PT = ['garden_walk_up','stacked_flats','wrap','podium','townhome_row','detached','cottage_court']   # tuck_under has one plan: folded into garden_walk_up
TYP = ['multifamily','townhome','residential','mixed_use']
def shares(k):
    l = labels.get(k)
    if not l or not l.get('pt'): return None
    tot = sum(e['traced_buildings'] for e in l['pt'])
    s = {p: 0.0 for p in PT}
    for e in l['pt']:
        t = 'garden_walk_up' if e['type'] == 'tuck_under' else e['type']
        if t in s: s[t] += e['traced_buildings'] / tot
    return s
def base(r):
    mm = r['m'] or {}; du, ac = mm.get('du_ac'), mm.get('site_ac')
    if not du or not ac or du <= 0 or ac <= 0 or r['t'] not in TYP: return None
    return math.log(du), math.log(ac)
def x_v1(r):
    b = base(r)
    if b is None: return None
    ld, la = b; x = [1.0, ld, la, ld*la]
    for p in TYP[1:]:
        d = 1.0 if r['t'] == p else 0.0; x += [d, d*ld]
    return x
def x_v2(r):
    b = base(r); s = shares(r['k'])
    if b is None or s is None: return None
    ld, la = b; x = [1.0, ld, la, ld*la]
    for p in PT[1:]: x += [s[p], s[p]*ld]
    return x
FN2 = ['const','ln_du','ln_ac','ln_du_x_ln_ac'] + [f for p in PT[1:] for f in (p, p+'_x_ln_du')]
D = [r for r in rows if r['s'] in ('train','dev') and x_v1(r) is not None and x_v2(r) is not None]
tr = [r for r in D if r['s']=='train']; dv = [r for r in D if r['s']=='dev']
def ridge(X, y, a):
    P = np.eye(X.shape[1]); P[0,0] = 0
    return np.linalg.solve(X.T @ X + a*P, X.T @ y)
def fit(T, xf, t):
    X = np.array([xf(r) for r in T]); y = np.array([math.log(r['m'][t]) for r in T]); best = None
    for a in [0.1, 0.3, 1, 3, 10, 30, 100]:
        e = np.mean([abs(X[i] @ ridge(X[np.arange(len(T))!=i], y[np.arange(len(T))!=i], a) - y[i]) for i in range(len(T))])
        if best is None or e < best[0]: best = (e, a)
    return ridge(X, y, best[1]), best[1], y.std()
def dom(r):
    s = shares(r['k']); return max(s, key=s.get)
out = {'n_train': len(tr), 'n_dev': len(dv), 'features': FN2, 'coef': {}, 'measures': {}}
tot = {'v1': [], 'v2': [], 'lookup_typology': [], 'lookup_product': [], 'product_median': []}
for t in TARGETS:
    T = [r for r in tr if r['m'].get(t) and r['m'][t] > 0]; V = [r for r in dv if r['m'].get(t) and r['m'][t] > 0]
    if len(T) < 30 or len(V) < 5: continue
    w1, a1, sd = fit(T, x_v1, t); w2, a2, _ = fit(T, x_v2, t)
    lv = lambda r: math.log(r['m'][t])
    def knn(r, same):
        b = base(r); c = sorted([(abs(b[0]-base(q)[0]) + abs(b[1]-base(q)[1]), lv(q)) for q in T if same(q, r)])[:9]
        return float(np.median([v for _, v in c])) if c else float(np.median([lv(q) for q in T]))
    e = {k: [] for k in tot}
    for r in V:
        v = lv(r)
        e['v1'].append(abs(np.array(x_v1(r)) @ w1 - v)/sd); e['v2'].append(abs(np.array(x_v2(r)) @ w2 - v)/sd)
        e['lookup_typology'].append(abs(knn(r, lambda q, r: q['t']==r['t']) - v)/sd); e['lookup_product'].append(abs(knn(r, lambda q, r: dom(q)==dom(r)) - v)/sd)
        pm = [lv(q) for q in T if dom(q)==dom(r)]; e['product_median'].append(abs(float(np.median(pm if pm else [lv(q) for q in T])) - v)/sd)
    out['measures'][t] = {'n_train': len(T), 'n_dev': len(V), **{k: round(float(np.mean(x)), 3) for k, x in e.items()}}
    out['coef'][t] = [round(float(c), 4) for c in w2]
    for k in tot: tot[k] += e[k]
out['overall_dev'] = {k: round(float(np.mean(v)), 3) for k, v in tot.items()}
out['train_products'] = {p: sum(1 for r in tr if dom(r)==p) for p in PT}; out['dev_products'] = {p: sum(1 for r in dv if dom(r)==p) for p in PT}
def predict(sh, du, ac):
    ld, la = math.log(du), math.log(ac); x = [1.0, ld, la, ld*la]
    for p in PT[1:]: x += [sh.get(p, 0.0), sh.get(p, 0.0)*ld]
    return {t: round(float(math.exp(np.array(x) @ np.array(out['coef'][t]))), 2) for t in out['coef']}
out['examples'] = {'garden walk-up, 37 units on 4.12 ac': predict({}, 37/4.12, 4.12), 'townhome rows, 37 homes on 4.12 ac': predict({'townhome_row': 1}, 37/4.12, 4.12), 'garden walk-up, 250 units on 12 ac': predict({}, 250/12, 12), 'podium, 150 units on 1.5 ac': predict({'podium': 1}, 100, 1.5)}
json.dump(out, open('design_model_v2.json', 'w'))
print(json.dumps({k: out[k] for k in ['n_train','n_dev','overall_dev','train_products','dev_products']}))
for t, v in out['measures'].items(): print(t, v)
for k, v in out['examples'].items(): print(k, v)
