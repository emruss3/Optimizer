import json, sys, html
import score as s
from pick import sel
from shapely.geometry import LineString
P=json.load(open('plans.json')); RAW={p['pid']:p for p in P}
for p in P: p['ctx']['boundary_edges']=p['ctx']['boundary_edges'] or []
def streets(pid):
    site,ed,T,S,has,ang=s.frame(RAW[pid]); return [T(g) for g,t in ed if t=='street_frontage']
def poly(g,cls):
    gs=g.geoms if g.geom_type.startswith('Multi') else [g]
    return ''.join('<polygon class="%s" points="%s"/>'%(cls,' '.join('%.1f,%.1f'%(x,-y) for x,y in q.exterior.coords)) for q in gs)
def line(g,cls,w=None):
    return '<polyline class="%s"%s points="%s"/>'%(cls,' stroke-width="%s"'%w if w else '',' '.join('%.1f,%.1f'%(x,-y) for x,y in g.coords))
def panel(title,e,pl,ext,note):
    b=e['site'].bounds; cx=(b[0]+b[2])/2; cy=(b[1]+b[3])/2; h=ext/2
    px=ext/300.0   # feet per screen unit at nominal size, for line weights
    o=['<figure><svg viewBox="%.1f %.1f %.1f %.1f" role="img" aria-label="%s">'%(cx-h,-cy-h,ext,ext,html.escape(title))]
    o.append(poly(e['site'],'site'))
    for l in pl['drv']: o.append(line(l,'drive',24))
    for p in pl['prk']: o.append(poly(p,'park'))
    for bd in pl['b']: o.append(poly(bd['g'],'bldg'))
    for g in streets(e['pid']): o.append(line(g,'street',round(3.2*px,1)))
    o.append('<line class="bar" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%.1f"/><text class="bart" x="%.1f" y="%.1f" font-size="%.1f">100 ft</text>'%(cx-h+6*px,-cy+h-8*px,cx-h+6*px+100,-cy+h-8*px,1.6*px,cx-h+6*px,-cy+h-13*px,9*px))
    o.append('</svg><figcaption><b>%s</b><span>%s</span><span class="n">%d units · %d building%s</span></figcaption></figure>'%(title,note,pl['units'],len(pl['b']),'' if len(pl['b'])==1 else 's'))
    return ''.join(o)
NAMES={'multifamily':'Multifamily','townhome':'Townhome','residential':'Residential','mixed_use':'Mixed use'}
secs=[]
for r,w in sel:
    v=s.idx[r['sid']]; e=s.BY[v['pid']]; c=s.BY[v['nn'][0]]
    gen=s.parse(json.load(open('layouts/%s.json'%r['sid']))['samples'][0])
    ext=1.08*max(max(x['site'].bounds[2]-x['site'].bounds[0],x['site'].bounds[3]-x['site'].bounds[1]) for x in (e,c))
    civ=s.civil(e); cc=s.civil(c)
    secs.append('<section><header><h2>%s, %.1f acres, %d units</h2><p class="tag %s">Pretrained scored %s than the lookup</p></header><div class="row">%s%s%s</div><p class="err"><span>Pretrained error <b>%.2f</b></span><span>Lookup error <b>%.2f</b></span><span class="dim">%s</span></p></section>'%(
        NAMES[r['typ']],e['ac'],e['units'],w,w,
        panel("Civil's approved plan",e,civ,ext,'the label'),
        panel('Pretrained, first try',e,gen,ext,'checks pass' if r['pass1'] else 'a check fails'),
        panel('Nearest training plan',c,cc,ext,'%.1f acres, its own site'%c['ac']),
        r['e1'],r['l1'],'Site %s. Lower is better. Mean over the measures both plans have.'%r['sid']))
page=open('page_tpl.html').read().replace('{{SECTIONS}}','\n'.join(secs))
open('page.html','w').write(page); print(len(page))
