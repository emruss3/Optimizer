"""Developer-quality review of the app's plans. One row per plan (parcel x engine), one result per check:
pass / fail / n/a, with the measured value. Thresholds are review settings (THR), each with its reason; change them
here and re-run. Inputs: review_set.json, sites.json (parcel, street runs, setbacks, water), maxbuild.json, raw/*.json."""
import json, glob, os, math, sys
import numpy as np, shapely
from shapely import wkt
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union, transform
import warnings; warnings.filterwarnings('ignore')
from pyproj import Transformer
TO2274 = Transformer.from_crs(4326, 2274, always_xy=True).transform
THR = dict(
    units_share=0.85,        # plan reaches 85% of the by-right maximum (owner: maximize units by right)
    sf_units_share=0.65,     # subdivisions: 65% of the gross lot arithmetic (streets take ~16% in recorded subdivisions, site_priors_v1_2; the rest is odd-shaped leftover)
    green_min_ac=1.0,        # the green check applies on sites of an acre or more
    street_touch_ft=6,       # a drive within 6 ft of a street edge reaches it (layout checker kit, street_touch_ft)
    front_zone_ft=60,        # a building within front setback + 60 ft of a street line faces that street
    street_wall_share=0.40,  # at least 40% of street frontage faced by buildings (apartments/townhomes)
    parking_front_share=0.20,# at most 20% of surface parking between the street and the buildings
    empty_share=0.15,        # largest unexplained open piece over 15% of the site fails ...
    empty_min_sf=10000,      # ... and over 10,000 sf
    clear_ft=40,             # land within 40 ft of a building, lot, parking field or pond counts as used (yards, aisles, walks)
    green_link_ft=60,        # a green counts as used land only when it lies within 60 ft of a building (a green for homes that were deleted does not)
    orphan_ft=60,            # pavement farther than 60 ft from every building and parking field serves nothing
    orphan_share=0.15,       # more than 15% of the pavement serving nothing fails
    green_share=0.02,        # programmed green/amenity at least 2% of the site (apartments/townhomes)
    fire_reach_ft=150,       # IFC 503.1.1: every point of the building within 150 ft of fire access
)
S = {s['fid']: s for s in json.load(open('review_set.json'))}
SITE = {int(k): v for k, v in json.load(open('sites.json')).items()}
MB = {int(k): v for k, v in json.load(open('maxbuild.json')).items()}


def g4326(d):
    try: return transform(TO2274, shape(d))
    except Exception: return None


def gl(items, key='geom'):
    out = []
    for it in items or []:
        if isinstance(it, dict):
            if it.get('geom_2274'):
                try: out.append(shape(it['geom_2274'])); continue
                except Exception: pass
            g = it.get(key) or it.get('geometry')
            if g: out.append(g4326(g))
            elif it.get('type') and it.get('coordinates'): out.append(g4326(it))
    return [shapely.make_valid(g) for g in out if g is not None and not g.is_empty]


def W(s):
    try: return shapely.make_valid(wkt.loads(s)) if s else None
    except Exception: return None


def extract(eng, r):
    """common layers in EPSG:2274: buildings, pavement (drives/alleys/streets), parking, green, ponds, lots; units; stalls"""
    L = dict(bld=[], pave=[], park=[], green=[], pond=[], lots=[], units=None, stalls=None, stalls_req=None, guest=None, guest_target=None)
    if eng == 'mf':
        L['bld'] = gl(r.get('buildings')); L['pave'] = gl(r.get('drives')); L['park'] = gl((r.get('parking') or {}).get('bays'))
        L['green'] = gl(r.get('greens')) + gl([r['amenity']] if isinstance(r.get('amenity'), dict) else r.get('amenity'))
        m = r.get('metrics') or {}
        L['units'] = m.get('units_est') or m.get('units'); L['stalls'] = m.get('stalls') if m.get('stalls') is not None else (r.get('parking') or {}).get('stalls')
        L['stalls_req'] = m.get('stalls_required')
        # the plan basis carries the drawn count when metrics.stalls disagrees (e.g. "178/116 stalls")
        import re
        mm = re.search(r'(\d+)/(\d+) stalls', r.get('plan_basis') or '')
        if mm: L['stalls_drawn'] = int(mm.group(1))
    elif eng == 'th':
        L['bld'] = gl(r.get('buildings')); L['pave'] = gl(r.get('alleys')) + gl(r.get('streets'))
        p = r.get('parking') or {}
        L['park'] = gl(p.get('guest_pockets')); L['green'] = gl(r.get('greens')) + gl(r.get('amenity') if isinstance(r.get('amenity'), list) else [])
        L['units'] = (r.get('metrics') or {}).get('homes'); L['guest'] = p.get('guest_stalls'); L['guest_target'] = p.get('guest_target')
    elif eng == 'sf':
        L['lots'] = [g for g in [W(r.get('lots_wkt'))] if g]; L['pave'] = [g for g in [W(r.get('row_wkt')), W(r.get('pave_wkt')), W(r.get('drives_wkt'))] if g]
        L['pond'] = [g for g in [W(r.get('pond_wkt'))] if g]; L['green'] = [g for g in [W(r.get('park_wkt')), W(r.get('green_strip_wkt'))] if g]
        L['units'] = r.get('lots'); L['bld'] = []
    return L


def street_lines(site):
    out = []
    for s in site.get('streets') or []:
        g = W(s['wkt'])
        if g is not None: out.append((s['name'], g))
    return out


def score(fid, eng, r):
    s = S[fid]; site = SITE[fid]; parcel = W(site['parcel']); A = parcel.area
    res = {}
    def put(k, ok, val, note=''): res[k] = dict(ok=ok, val=val, note=note)
    if not isinstance(r, dict) or r.get('error') or (eng != 'sf' and not r.get('buildings')) or (eng == 'sf' and not r.get('lots')):
        why = (r.get('error') or r.get('status') or ('0 lots' if eng == 'sf' else 'no buildings')) if isinstance(r, dict) else 'none'
        put('plan_produced', False, why, 'no plan')
        return res
    put('plan_produced', True, 'ok')
    L = extract(eng, r)
    streets = street_lines(site); sts = unary_union([g for _, g in streets]) if streets else None
    # 1 units against the by-right maximum
    cap = None
    if eng in ('mf', 'th') and fid in MB: cap = max(MB[fid]['units_at_max'], MB[fid]['units_max'])
    if eng == 'sf': cap = site.get('sf_lots')
    if cap and L['units'] is not None:
        sh = L['units'] / cap; put('units_vs_by_right', sh >= (THR['sf_units_share'] if eng == 'sf' else THR['units_share']), f"{L['units']} of {cap}", 'by-right max from fn_max_buildout (units-max option) or gross lot arithmetic')
    else: put('units_vs_by_right', None, f"{L['units']} of ?", 'no by-right figure')
    # 2 drive reaches a street
    net = unary_union(L['pave'] + (L['park'] if eng == 'mf' else [])) if (L['pave'] or L['park']) else None
    if sts is None: put('drive_reaches_street', None, 'no street edge on record')
    elif net is None: put('drive_reaches_street', eng == 'th' and bool(L['bld']), 'no drives drawn', 'homes front the street' if eng == 'th' else '')
    else:
        d = net.distance(sts); put('drive_reaches_street', d <= THR['street_touch_ft'], f"{d:.0f} ft")
    # 3 buildings face the streets (apartments, townhomes)
    sb = site.get('setbacks') or {}
    front = float((sb.get('front') or {}).get('value') or 20) if isinstance(sb.get('front'), dict) else float(sb.get('front') or 20)
    if isinstance(r.get('rules'), dict) and r['rules'].get('front_setback_ft') is not None: front = float(r['rules']['front_setback_ft'])
    if eng in ('mf', 'th') and streets and L['bld']:
        B = unary_union(L['bld']); tot = faced = 0.0
        for _, g in streets:
            for line in getattr(g, 'geoms', [g]):
                n = max(2, int(line.length // 10))
                for i in range(n):
                    p = line.interpolate((i + 0.5) / n, normalized=True); tot += line.length / n
                    if B.distance(p) <= front + THR['front_zone_ft']: faced += line.length / n
        sh = faced / tot if tot else 0
        put('buildings_face_streets', sh >= THR['street_wall_share'], f"{100*sh:.0f}% of {tot:.0f} ft")
    else: put('buildings_face_streets', None, 'n/a')
    # 4 parking not between the street and the buildings
    if eng in ('mf', 'th') and L['park'] and L['bld'] and sts is not None:
        B = unary_union(L['bld']); pa = fa = 0.0
        for p in L['park']:
            c = p.representative_point(); ds = c.distance(sts)
            # in front: nearer the street than the nearest building is, and within the front zone
            nb = min(L['bld'], key=lambda b: b.distance(c)); front_of = ds < nb.distance(sts) and ds <= front + THR['front_zone_ft']
            pa += p.area; fa += p.area if front_of else 0
        sh = fa / pa if pa else 0
        put('parking_not_in_front', sh <= THR['parking_front_share'], f"{100*sh:.0f}% of parking in front")
    else: put('parking_not_in_front', None, 'n/a')
    # 5 unexplained empty land
    core = [g for g in L['bld'] + L['park'] + L['pond'] + L['lots'] if g is not None]
    water = W(site.get('water'))
    if core:
        Bc = unary_union(L['bld'] + L['lots']) if (L['bld'] or L['lots']) else None
        greens = [g for g in L['green'] if Bc is not None and g.distance(Bc) <= THR['green_link_ft']]
        U = unary_union([g.buffer(THR['clear_ft']) for g in core + greens])
        if water is not None: U = U.union(water)
        if sts is not None: U = U.union(sts.buffer(front))
        empty = parcel.buffer(-5).difference(U)
        pieces = sorted([q for q in getattr(empty, 'geoms', [empty]) if q.area > 0], key=lambda q: -q.area)
        big = pieces[0].area if pieces else 0.0
        put('no_empty_land', not (big > THR['empty_share'] * A and big > THR['empty_min_sf']), f"largest {big/A*100:.0f}% of site ({big/43560:.1f} ac)", 'steep ground not excluded yet')
        res['_empty_wkt'] = pieces[0].wkt if pieces else None
    else: put('no_empty_land', None, 'n/a')
    # 5b pavement that serves nothing (drives or alleys left behind when homes are removed)
    if L['pave'] and (L['bld'] or L['park']) and eng != 'sf':
        P = unary_union(L['pave']); far = P.difference(unary_union(L['bld'] + L['park']).buffer(THR['orphan_ft']))
        if sts is not None: far = far.difference(sts.buffer(THR['orphan_ft']))   # entry drives from the street are fine
        sh = far.area / P.area if P.area else 0
        put('no_orphan_pavement', sh <= THR['orphan_share'], f"{100*sh:.0f}% of pavement serves nothing")
    else: put('no_orphan_pavement', None, 'n/a')
    # 6 parking quantity
    if eng == 'mf':
        st = L.get('stalls_drawn', L['stalls']); rq = L['stalls_req']
        if st is not None and rq:
            ok = st >= rq
            note = f"metrics.stalls {L['stalls']} vs drawn {L['stalls_drawn']}" if L.get('stalls_drawn') is not None and L['stalls'] != L['stalls_drawn'] else ''
            put('parking_meets_need', ok, f"{st} of {rq}", note)
        else: put('parking_meets_need', None, f"{st} of {rq}")
    elif eng == 'th' and L['guest_target']:
        put('parking_meets_need', (L['guest'] or 0) >= L['guest_target'], f"{L['guest']} of {L['guest_target']} guest stalls")
    else: put('parking_meets_need', None, 'n/a')
    # 7 programmed green
    if eng in ('mf', 'th') and A >= THR['green_min_ac'] * 43560:
        ga = unary_union(L['green']).area if L['green'] else 0.0
        put('usable_green', ga >= THR['green_share'] * A, f"{100*ga/A:.1f}% of site")
    else: put('usable_green', None, 'n/a')
    # 8 front setback
    if L['bld'] and sts is not None:
        dmin = min(b.distance(sts) for b in L['bld'])
        put('front_setback', dmin >= front - 1, f"{dmin:.0f} ft (need {front:.0f})")
    else: put('front_setback', None, 'n/a')
    # 9 fire reach
    if L['bld'] and (net is not None or sts is not None):
        acc = unary_union([g for g in [net, sts] if g is not None])
        worst = max(max(Point(c).distance(acc) for c in b.exterior.coords) if hasattr(b, 'exterior') else 0 for b in L['bld'])
        put('fire_reach', worst <= THR['fire_reach_ft'], f"{worst:.0f} ft")
    else: put('fire_reach', None, 'n/a')
    return res


if __name__ == '__main__':
    rows = []
    for f in sorted(glob.glob('raw/*.json')):
        fid, eng = os.path.basename(f)[:-5].split('_'); fid = int(fid)
        r = json.load(open(f))
        try: res = score(fid, eng, r)
        except Exception as e: res = dict(scorer_error=dict(ok=None, val=repr(e)[:200]))
        rows.append(dict(fid=fid, eng=eng, group=S[fid]['group'], flagged=S[fid]['flagged'], why=S[fid]['why'], zoning=S[fid]['zoning'], res=res))
    json.dump(dict(thresholds=THR, rows=rows), open('scores.json', 'w'))
    CHECKS = ['plan_produced', 'units_vs_by_right', 'drive_reaches_street', 'buildings_face_streets', 'parking_not_in_front', 'no_empty_land', 'no_orphan_pavement', 'parking_meets_need', 'usable_green', 'front_setback', 'fire_reach']
    for row in rows:
        r = row['res']; fails = [k for k in CHECKS if r.get(k, {}).get('ok') is False]
        print(row['fid'], row['eng'], row['zoning'], 'FLAG' if row['flagged'] else '    ', 'fails:', ', '.join(f"{k}({r[k]['val']})" for k in fails) or '-', ' | scorer_error' if 'scorer_error' in r else '')
    print()
    for k in CHECKS:
        v = [row['res'].get(k, {}).get('ok') for row in rows]
        print(f"{k:24s} pass {sum(1 for x in v if x is True):2d}  fail {sum(1 for x in v if x is False):2d}  n/a {sum(1 for x in v if x is None):2d}")
    clean = sum(1 for row in rows if not any(row['res'].get(k, {}).get('ok') is False for k in CHECKS))
    print('plans with no failed check', clean, 'of', len(rows))
