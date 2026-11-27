"""Selector v1 (subdivisions): predict the code-clean lots the engine will get from a fitted street layout, before running the engine,
so the deep search can run the best layouts first. Fitted on training-site layouts only; development sites are scored once; held-out never read.
Input rows: [split, site, try, cutter_lots, n_streets, n_vertices, roads_chars, site_ac, compactness, site_points, n_lots, clean, err, street_ft]
No site identifier is a feature (the site key is used only to group layouts of one site)."""
import json, re, sys, math
import numpy as np
raw = open(sys.argv[1]).read()
rows = json.loads(re.search(r'\[\{.*\}\]', raw, re.S).group(0).encode().decode('unicode_escape'))[0]['rows']
R = []
for s, sk, tr, le, ns, nv, rl, ac, cmp_, npnt, nl, clean, err, sft in rows:
    y = float(nl) if (clean and nl is not None and not err) else 0.0
    R.append({'split': s, 'site': sk, 'try': tr or 0, 'le': float(le or 0), 'ns': ns or 0, 'nv': nv or 0, 'ac': float(ac or 0), 'cmp': float(cmp_ or 0), 'np': npnt or 0, 'y': y, 'clean': bool(clean) and not err, 'raw': float(nl or 0)})
by = {}
for r in R: by.setdefault((r['split'], r['site']), []).append(r)
for g in by.values():
    mx = max(r['le'] for r in g) or 1.0; srt = sorted(g, key=lambda r: -r['le'])
    for i, r in enumerate(srt): r['rk'] = i; r['rel'] = r['le'] / mx
def x(r):
    le, ac = r['le'], max(r['ac'], 0.05)
    return [1.0, le, math.log1p(le), le/ac, r['rel'], r['rk'], r['ns'], r['nv']/max(r['ns'],1), math.log(ac), r['cmp'], math.log1p(r['np']), r['ns']/ac]
FN = ['const','cutter_lots','ln_cutter','cutter_per_ac','cutter_rel_to_site_best','cutter_rank','n_streets','vertices_per_street','ln_site_ac','compactness','ln_site_points','streets_per_ac']
tr = [r for r in R if r['split'] == 'train_all']; dv = [r for r in R if r['split'] == 'dev']
X = np.array([x(r) for r in tr]); mu = X[:,1:].mean(0); sd = X[:,1:].std(0) + 1e-9
def z(M): return np.hstack([M[:, :1], (M[:, 1:] - mu) / sd])
Xz = z(X)
def ridge(A, y, a):
    P = np.eye(A.shape[1]); P[0,0] = 0
    return np.linalg.solve(A.T @ A + a*P, A.T @ y)
# two parts: will the plan be code-clean (linear probability), and lots if clean
yc = np.array([1.0 if r['clean'] else 0.0 for r in tr]); yl = np.array([r['y'] for r in tr])
sites = sorted({r['site'] for r in tr}); fold = {s: i % 5 for i, s in enumerate(sites)}
def cv(a):
    e = []
    for f in range(5):
        k = np.array([fold[r['site']] != f for r in tr]); w = ridge(Xz[k], yl[k], a); e.append(np.mean(np.abs(Xz[~k] @ w - yl[~k])))
    return float(np.mean(e))
alpha = min([0.1, 1, 10, 100, 1000], key=cv)
w = ridge(Xz, yl, alpha); wc = ridge(Xz, yc, alpha)
def score(r): return float(z(np.array([x(r)]))[0] @ w)
def best_of(g, key, k): return max((r['y'] for r in sorted(g, key=key)[:k]), default=0.0)
out = {'n_train_layouts': len(tr), 'n_train_sites': len(sites), 'n_dev_layouts': len(dv), 'alpha': alpha, 'train_clean_share': round(float(yc.mean()), 3),
       'cv_mae_lots': round(cv(alpha), 2), 'cv_mae_cutter_only': round(float(np.mean(np.abs(np.array([r['le'] for r in tr]) - yl))), 2)}
for name, grp in (('dev', dv),):
    G = {}
    for r in grp: G.setdefault(r['site'], []).append(r)
    res = {'sites': len(G)}
    for k in (1, 2, 3, 6):
        res[f'top{k}'] = {'selector': sum(best_of(g, lambda r: -score(r), k) for g in G.values()), 'cutter': sum(best_of(g, lambda r: -r['le'], k) for g in G.values()),
                          'try_order': sum(best_of(g, lambda r: r['try'], k) for g in G.values())}
    res['mae_selector'] = round(float(np.mean([abs(score(r) - r['y']) for r in grp])), 2); res['mae_cutter'] = round(float(np.mean([abs(r['le'] - r['y']) for r in grp])), 2)
    res['clean_share'] = round(float(np.mean([1.0 if r['clean'] else 0.0 for r in grp])), 3)
    out[name] = res
# same comparison inside train by 5-fold (sites never in their own fold's fit), as a larger sample
Gt = {}
for r in tr: Gt.setdefault(r['site'], []).append(r)
cvres = {f'top{k}': {'selector': 0.0, 'cutter': 0.0} for k in (1, 2, 3, 6)}
for f in range(5):
    k_ = np.array([fold[r['site']] != f for r in tr]); wf = ridge(Xz[k_], yl[k_], alpha)
    for s, g in Gt.items():
        if fold[s] != f: continue
        sc = lambda r: -float(z(np.array([x(r)]))[0] @ wf)
        for k in (1, 2, 3, 6):
            cvres[f'top{k}']['selector'] += best_of(g, sc, k); cvres[f'top{k}']['cutter'] += best_of(g, lambda r: -r['le'], k)
out['train_cross_validated'] = {'sites': len(Gt), **cvres}
out['weights_standardised'] = {f: round(float(c), 3) for f, c in zip(FN, w)}
json.dump({'features': FN, 'mu': mu.tolist(), 'sd': sd.tolist(), 'w': w.tolist(), 'alpha': alpha}, open(sys.argv[2], 'w'))
print(json.dumps(out, indent=0))
