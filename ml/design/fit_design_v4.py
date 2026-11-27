"""Design model v4: inputs from the per-feature labels and site context added to the SP data on 2026-11-13 (building type per building, stories, parking type by area,
classified boundary edges with street frontage geometry). New targets measured from the street frontage: building setback from the frontage and whether parking sits behind the buildings.
Fit and penalty choice on train only; development read once; held-out never read."""
import json, re, sys, math
import numpy as np
raw = open(sys.argv[1]).read()
rows = json.loads(re.search(r'\[\{.*\}\]', raw, re.S).group(0).encode().decode('unicode_escape'))[0]['rows']
PT = ['garden_walk_up','stacked_flats','wrap','podium','townhome_row','detached','cottage_court']
BASE_T = ['stalls_per_unit','parking_pct','coverage_pct','units_per_bldg','length_med','depth_med','bldg_setback_med','bldg_per_ac','footprint_med']
D = []
for k, r in rows.items():
    m = r.get('m') or {}; du, ac = m.get('du_ac'), m.get('site_ac'); bt = r.get('bt') or {}
    if r['s'] not in ('train','dev') or not du or not ac or du <= 0 or ac <= 0 or not bt: continue
    tot = sum(bt.values()); sh = {p: 0.0 for p in PT}
    for t, n in bt.items():
        t = 'garden_walk_up' if t == 'tuck_under' else t
        if t in sh: sh[t] += n / tot
    ed = r.get('ed') or {}; per = float(r.get('per') or 0) or None; sf = ac * 43560
    fr = float(ed.get('street_frontage', 0) or 0)
    pkt = r.get('pkt') or {}; pa = sum(pkt.values()) or None
    y = dict(m)
    if r.get('bfd') is not None: y['front_setback_med'] = r['bfd'] + 1.0
    if r.get('bfn') is not None: y['front_setback_min'] = r['bfn'] + 1.0
    if r.get('pfd') and r.get('bcd') and r['pfd'] > 0 and r['bcd'] > 0: y['parking_behind_index'] = r['pfd'] / r['bcd']
    D.append({'k': k, 's': r['s'], 'ld': math.log(du), 'la': math.log(ac), 'sh': sh, 'dom': max(sh, key=sh.get), 'y': y,
              'st': r.get('st'), 'pk_g': (pkt.get('garage', 0) / pa) if pa else None, 'pk_s': ((pkt.get('structured', 0) + pkt.get('tuck_under', 0)) / pa) if pa else None,
              'fr': math.log(fr / math.sqrt(sf)) if fr > 0 else None, 'frs': (fr / per) if per else None,
              'e_home': (float(ed.get('neighboring_homes', 0)) / per) if per else None, 'e_vac': (float(ed.get('vacant_land', 0)) / per) if per else None,
              'e_str': (float(ed.get('stream_corridor', 0)) / per) if per else None, 'e_com': ((float(ed.get('commercial', 0)) + float(ed.get('industrial', 0))) / per) if per else None,
              'e_unk': (float(ed.get('unknown', 0)) / per) if per else None, 'ap': math.log1p(r['ap']) if r.get('ap') is not None else None, 'cmp': r.get('cmp')})
tr = [r for r in D if r['s']=='train']; dv = [r for r in D if r['s']=='dev']
OPT = ['st','pk_g','pk_s','ap','cmp']; FRONT = ['fr','frs','e_home','e_vac','e_str','e_com','e_unk']
med = {k: float(np.median([r[k] for r in tr if r[k] is not None])) for k in OPT + FRONT}
def xprog(r):
    x = [1.0, r['ld'], r['la'], r['ld']*r['la']]
    for p in PT[1:]: x += [r['sh'][p], r['sh'][p]*r['ld']]
    return x
def xadd(r, keys):
    x = []
    for k in keys: x += [(math.log(r[k]) if k == 'st' else r[k]) if r[k] is not None else (math.log(med[k]) if k == 'st' else med[k]), 0.0 if r[k] is not None else 1.0]
    return x
x_nofront = lambda r: xprog(r) + xadd(r, OPT)
x_v4 = lambda r: xprog(r) + xadd(r, OPT) + xadd(r, FRONT)
def ridge(X, y, a):
    P = np.eye(X.shape[1]); P[0,0] = 0
    return np.linalg.solve(X.T @ X + a*P, X.T @ y)
def fit(T, xf, t):
    X = np.array([xf(r) for r in T]); y = np.array([math.log(r['y'][t]) for r in T]); idx = np.arange(len(T)); best = None
    for a in [1, 3, 10, 30, 100, 300]:
        e = np.mean([abs(X[i] @ ridge(X[idx!=i], y[idx!=i], a) - y[i]) for i in range(len(T))])
        if best is None or e < best[0]: best = (e, a)
    return ridge(X, y, best[1]), y.std()
names = ['product_median','lookup_product','program_only','no_frontage','v4_all']
def run(targets):
    tot = {n: [] for n in names}; per = {}
    for t in targets:
        T = [r for r in tr if r['y'].get(t) and r['y'][t] > 0]; V = [r for r in dv if r['y'].get(t) and r['y'][t] > 0]
        if len(T) < 30 or len(V) < 5: continue
        lv = lambda r: math.log(r['y'][t]); wp, sd = fit(T, xprog, t); wn, _ = fit(T, x_nofront, t); w4, _ = fit(T, x_v4, t)
        def knn(r):
            c = sorted([(abs(r['ld']-q['ld']) + abs(r['la']-q['la']), lv(q)) for q in T if q['dom']==r['dom']])[:9]
            return float(np.median([v for _, v in c])) if c else float(np.median([lv(q) for q in T]))
        e = {n: [] for n in names}
        for r in V:
            v = lv(r); pm = [lv(q) for q in T if q['dom']==r['dom']] or [lv(q) for q in T]
            e['product_median'].append(abs(float(np.median(pm)) - v)/sd); e['lookup_product'].append(abs(knn(r) - v)/sd)
            e['program_only'].append(abs(np.array(xprog(r)) @ wp - v)/sd); e['no_frontage'].append(abs(np.array(x_nofront(r)) @ wn - v)/sd); e['v4_all'].append(abs(np.array(x_v4(r)) @ w4 - v)/sd)
        per[t] = {'n_train': len(T), 'n_dev': len(V), **{n: round(float(np.mean(v)), 3) for n, v in e.items()}}
        for n in names: tot[n] += e[n]
    return {n: round(float(np.mean(v)), 3) for n, v in tot.items()}, per
o1, p1 = run(BASE_T); o2, p2 = run(['front_setback_med','front_setback_min','parking_behind_index'])
print(json.dumps({'n_train': len(tr), 'n_dev': len(dv), 'train_products': {p: sum(1 for r in tr if r['dom']==p) for p in PT}, 'inputs_present_train': {k: sum(1 for r in tr if r[k] is not None) for k in OPT + ['fr']},
                  'nine_measures_dev': o1, 'frontage_measures_dev': o2}))
for t, v in {**p1, **p2}.items(): print(t, v)
tm = lambda key: {p: round(float(np.median([r['y'][key] for r in tr if r['dom']==p and r['y'].get(key)])), 2) for p in PT if sum(1 for r in tr if r['dom']==p and r['y'].get(key)) >= 3}
print('civil medians, train: front_setback_med(+1 ft)', tm('front_setback_med'), 'parking_behind_index', tm('parking_behind_index'))
