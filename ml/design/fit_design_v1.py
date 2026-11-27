"""Design model v1: predict a civil's design measures from the program (product, density, site size).
Train split only for fitting and for choosing the ridge penalty (leave-one-out); development split for the comparison; held-out never read."""
import json, re, sys, math
import numpy as np
raw = open(sys.argv[1]).read()
m = re.search(r'\[\{.*\}\]', raw, re.S)
rows = json.loads(json.loads(m.group(0).replace('\\"', '"').replace('\\\\', '\\'))[0]['rows']) if False else None
# the tool wraps the result as an escaped JSON string; undo one level of escaping
txt = m.group(0).encode().decode('unicode_escape')
outer = json.loads(txt)
rows = outer[0]['rows']
TARGETS = ['stalls_per_unit','parking_pct','coverage_pct','units_per_bldg','length_med','depth_med','parking_interior_index','bldg_setback_med','bldg_per_ac','footprint_med']
PRODUCTS = ['multifamily','townhome','residential','mixed_use']
def feats(r):
    mm = r['m'] or {}
    du, ac = mm.get('du_ac'), mm.get('site_ac')
    if not du or not ac or du <= 0 or ac <= 0 or r['t'] not in PRODUCTS: return None
    ld, la = math.log(du), math.log(ac)
    x = [1.0, ld, la, ld*la]
    for p in PRODUCTS[1:]:
        d = 1.0 if r['t'] == p else 0.0
        x += [d, d*ld]
    return x
FN = ['const','ln_du','ln_ac','ln_du_x_ln_ac'] + [f for p in PRODUCTS[1:] for f in (p, p+'_x_ln_du')]
data = [(r, feats(r)) for r in rows]
data = [(r, x) for r, x in data if x is not None and r['s'] in ('train','dev')]
tr = [(r, x) for r, x in data if r['s'] == 'train']; dv = [(r, x) for r, x in data if r['s'] == 'dev']
def ridge(X, y, a):
    P = np.eye(X.shape[1]); P[0,0] = 0
    return np.linalg.solve(X.T @ X + a*P, X.T @ y)
out = {'features': FN, 'n_train': len(tr), 'n_dev': len(dv), 'by_product_dev': {p: sum(1 for r,_ in dv if r['t']==p) for p in PRODUCTS}, 'measures': {}, 'coef': {}}
tot = {'ridge': [], 'median': [], 'knn': [], 'global': []}
for t in TARGETS:
    T = [(r, x, math.log(r['m'][t])) for r, x in tr if r['m'].get(t) and r['m'][t] > 0]
    D = [(r, x, math.log(r['m'][t])) for r, x in dv if r['m'].get(t) and r['m'][t] > 0]
    if len(T) < 30 or len(D) < 5: continue
    X = np.array([x for _, x, _ in T]); y = np.array([v for _, _, v in T]); sd = y.std()
    best = None
    for a in [0.1, 0.3, 1, 3, 10, 30, 100]:
        errs = []
        for i in range(len(T)):
            k = np.arange(len(T)) != i
            w = ridge(X[k], y[k], a); errs.append(abs(X[i] @ w - y[i]))
        e = float(np.mean(errs))
        if best is None or e < best[0]: best = (e, a)
    w = ridge(X, y, best[1])
    med = {p: float(np.median([v for r, _, v in T if r['t'] == p])) if any(r['t'] == p for r, _, _ in T) else float(np.median(y)) for p in PRODUCTS}
    gmed = float(np.median(y))
    def knn(r, x):
        c = sorted([(abs(x[1]-xx[1]) + abs(x[2]-xx[2]), v) for rr, xx, v in T if rr['t'] == r['t']])[:9]
        return float(np.median([v for _, v in c])) if c else gmed
    e = {'ridge': [], 'median': [], 'knn': [], 'global': []}
    for r, x, v in D:
        e['ridge'].append(abs(np.array(x) @ w - v)/sd); e['median'].append(abs(med[r['t']] - v)/sd); e['knn'].append(abs(knn(r, x) - v)/sd); e['global'].append(abs(gmed - v)/sd)
    out['measures'][t] = {'n_train': len(T), 'n_dev': len(D), 'alpha': best[1], **{k: round(float(np.mean(v)), 3) for k, v in e.items()}}
    out['coef'][t] = {f: round(float(c), 5) for f, c in zip(FN, w)}
    for k in tot: tot[k] += e[k]
out['overall_dev'] = {k: round(float(np.mean(v)), 3) for k, v in tot.items()}
# examples: the owner's two programs and the acceptance parcel
def predict(prod, du, ac):
    x = feats({'t': prod, 'm': {'du_ac': du, 'site_ac': ac}})
    return {t: round(float(math.exp(np.array(x) @ np.array([out['coef'][t][f] for f in FN]))), 2) for t in out['coef']}
out['examples'] = {'multifamily 37 units on 4.12 ac (2301 25th Ave N)': predict('multifamily', 37/4.12, 4.12), 'multifamily 300 units on 1 ac': predict('multifamily', 300, 1.0), 'multifamily 250 units on 12 ac': predict('multifamily', 250/12, 12), 'townhome 60 homes on 5 ac': predict('townhome', 12, 5)}
out['train_range'] = {p: {'du_ac': [round(min(r['m']['du_ac'] for r,_ in tr if r['t']==p),1), round(max(r['m']['du_ac'] for r,_ in tr if r['t']==p),1)], 'site_ac': [round(min(r['m']['site_ac'] for r,_ in tr if r['t']==p),2), round(max(r['m']['site_ac'] for r,_ in tr if r['t']==p),1)], 'n': sum(1 for r,_ in tr if r['t']==p)} for p in PRODUCTS}
json.dump(out, open('design_model_v1.json', 'w'), indent=1)
print(json.dumps({k: out[k] for k in ['n_train','n_dev','by_product_dev','overall_dev','measures','examples','train_range']}, indent=0))
