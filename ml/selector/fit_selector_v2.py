"""Selector v2 (subdivisions): geometry features of each layout (training.fn_layout_features) and a gradient-boosted model.
Fitted on training sites only; settings chosen by 5-fold cross-validation by site inside train; development scored once; held-out never read.
No site or precedent identifier is a feature (the hashed site key only groups a site's layouts)."""
import json, re, sys, math, pickle
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
raw = open(sys.argv[1]).read()
rows = json.loads(re.search(r'\[\{.*\}\]', raw, re.S).group(0).encode().decode('unicode_escape'))[0]['rows']
R = []
for r in rows:
    f = r['f']; ac = max(float(f.get('site_ac') or 0), 0.05)
    y = float(r['n']) if (r['c'] and r['n'] is not None and not r['e']) else 0.0
    R.append({'split': r['s'], 'site': r['k'], 'try': r['t'] or 0, 'le': float(r['le'] or 0), 'y': y, 'f': f, 'ac': ac})
by = {}
for r in R: by.setdefault((r['split'], r['site']), []).append(r)
for g in by.values():
    mx = max(r['le'] for r in g) or 1.0; mst = max(float(r['f'].get('street_ft') or 0) for r in g) or 1.0
    for i, r in enumerate(sorted(g, key=lambda r: -r['le'])): r['rk'] = i; r['rel'] = r['le'] / mx; r['st_rel'] = float(r['f'].get('street_ft') or 0) / mst
FN = ['cutter_lots','cutter_per_ac','cutter_rel','cutter_rank','site_ac','compactness','hull_ratio','n_streets','street_ft','street_ft_per_ac','street_inside_share','street_rel','longest_ft',
      'ends_boundary','ends_street','ends_dead','crossings','reach_1','reach_2','reach_3','lots_per_100ft']
def x(r):
    f = r['f']; g = lambda k: float(f.get(k) or 0); st = g('street_ft')
    return [r['le'], r['le']/r['ac'], r['rel'], r['rk'], r['ac'], g('compactness'), g('hull_ratio'), g('n_streets'), st, st/r['ac'], g('street_ft_inside')/max(st,1), r['st_rel'], g('longest_ft'),
            g('ends_boundary'), g('ends_street'), g('ends_dead'), g('crossings'), g('reach_1'), g('reach_2'), g('reach_3'), 100*r['le']/max(st,1)]
tr = [r for r in R if r['split']=='train_all']; dv = [r for r in R if r['split']=='dev']
X = np.array([x(r) for r in tr]); y = np.array([r['y'] for r in tr]); Xd = np.array([x(r) for r in dv])
sites = sorted({r['site'] for r in tr}); fold = {s: i % 5 for i, s in enumerate(sites)}; fo = np.array([fold[r['site']] for r in tr])
def best_of(g, sc, k): return max((r['y'] for r, _ in sorted(zip(g, sc), key=lambda t: -t[1])[:k]), default=0.0)
def topk(rows_, scores):
    G = {}
    for r, s in zip(rows_, scores): G.setdefault(r['site'], []).append((r, s))
    return {k: sum(best_of([a for a, _ in g], [b for _, b in g], k) for g in G.values()) for k in (1, 2, 3, 6)}, len(G)
def cv_scores(make):
    out = np.zeros(len(tr))
    for f in range(5):
        m = make(); m.fit(X[fo != f], y[fo != f]); out[fo == f] = m.predict(X[fo == f])
    return out
grid = [dict(max_depth=d, learning_rate=lr, max_iter=it, min_samples_leaf=ml) for d in (3, 5) for lr in (0.05, 0.1) for it in (150, 300) for ml in (10, 30)]
best = None
for p in grid:
    s = cv_scores(lambda: HistGradientBoostingRegressor(random_state=0, **p)); t3 = topk(tr, s)[0][3]
    if best is None or t3 > best[0]: best = (t3, p, s)
p, s_gb = best[1], best[2]
s_lin = cv_scores(lambda: make_pipeline(StandardScaler(), Ridge(alpha=10)))
cut_tr = [r['le'] for r in tr]
out = {'n_train_layouts': len(tr), 'n_train_sites': len(sites), 'n_dev_layouts': len(dv), 'chosen': p, 'train_cross_validated': {'sites': len(sites), 'cutter': topk(tr, cut_tr)[0], 'ridge_same_features': topk(tr, s_lin)[0], 'boosted': topk(tr, s_gb)[0],
       'mae_boosted': round(float(np.mean(np.abs(s_gb - y))), 2), 'mae_cutter': round(float(np.mean(np.abs(np.array(cut_tr) - y))), 2)}}
m = HistGradientBoostingRegressor(random_state=0, **p).fit(X, y); sd_ = m.predict(Xd)
lin = make_pipeline(StandardScaler(), Ridge(alpha=10)).fit(X, y)
dres, ns = topk(dv, sd_)
out['dev'] = {'sites': ns, 'cutter': topk(dv, [r['le'] for r in dv])[0], 'ridge_same_features': topk(dv, lin.predict(Xd))[0], 'boosted': dres, 'mae_boosted': round(float(np.mean(np.abs(sd_ - np.array([r['y'] for r in dv])))), 2), 'mae_cutter': round(float(np.mean([abs(r['le'] - r['y']) for r in dv])), 2)}
from sklearn.inspection import permutation_importance
imp = permutation_importance(m, X, y, n_repeats=3, random_state=0)
out['importance'] = {FN[i]: round(float(imp.importances_mean[i]), 3) for i in np.argsort(-imp.importances_mean)[:8]}
pickle.dump({'model': m, 'features': FN, 'params': p}, open(sys.argv[2], 'wb'))
print(json.dumps(out))
