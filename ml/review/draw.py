import json, glob, os, sys
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from shapely import wkt
import score as SC
D = json.load(open('scores.json'))
def fill(ax, g, **k):
    if g is None or g.is_empty: return
    for p in getattr(g, 'geoms', [g]):
        if p.geom_type == 'Polygon':
            x, y = p.exterior.xy; ax.fill(x, y, **k)
        elif p.geom_type in ('LineString', 'MultiLineString'):
            for l in getattr(p, 'geoms', [p]): x, y = l.xy; ax.plot(x, y, **{kk: v for kk, v in k.items() if kk in ('color', 'lw')})
for row in D['rows']:
    fid, eng = row['fid'], row['eng']; r = json.load(open(f'raw/{fid}_{eng}.json'))
    site = SC.SITE[fid]; parcel = SC.W(site['parcel'])
    fig, ax = plt.subplots(figsize=(4.2, 4.2), dpi=110)
    fill(ax, parcel, facecolor='#f6f4ef', edgecolor='#222', lw=1.2)
    w = SC.W(site.get('water')); fill(ax, w.intersection(parcel) if w is not None else None, color='#9cc9e8', alpha=.6, lw=0)
    if row['res'].get('_empty_wkt') and row['res'].get('no_empty_land', {}).get('ok') is False:
        fill(ax, wkt.loads(row['res']['_empty_wkt']), facecolor='none', edgecolor='#d4553a', hatch='///', lw=.8)
    try: L = SC.extract(eng, r)
    except Exception: L = None
    if L:
        for g in L['lots']: fill(ax, g, facecolor='#e9e1c9', edgecolor='#b9a77a', lw=.4)
        for g in L['green']: fill(ax, g, color='#a8d5a2', lw=0)
        for g in L['pond']: fill(ax, g, color='#6fb3dc', lw=0)
        for g in L['pave']: fill(ax, g, color='#9a9a9a', lw=0)
        for g in L['park']: fill(ax, g, color='#cfcfcf', edgecolor='#777', lw=.3)
        for g in L['bld']: fill(ax, g, color='#3f5f8f', lw=0)
    for _, g in SC.street_lines(site): fill(ax, g, color='#d23', lw=2.2)
    ax.set_aspect('equal'); ax.axis('off'); plt.tight_layout(pad=0.1)
    plt.savefig(f'img/{fid}_{eng}.png'); plt.close(fig)
print('drawn', len(D['rows']))
