# Turns civil plans, pretrained layouts and nearest training plans into the app's plan elements (EPSG:3857)
import json, sys, math, glob
import score as s
from pick import sel
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.affinity import rotate, translate
from shapely.ops import transform, unary_union
tf=Transformer.from_crs(2274,3857,always_xy=True).transform
P=json.load(open('plans.json')); RAW={p['pid']:p for p in P}
for p in P: p['ctx']['boundary_edges']=p['ctx']['boundary_edges'] or []
txt=open(sys.argv[1]).read(); o=json.loads(txt); t=o['result'] if isinstance(o,dict) else txt
CTX={}
for r in json.loads(t[t.find('[{"j"'):t.rfind('}]')+2]): j=json.loads(r['j']); CTX[j['pid']]=j
def back(pid):
    site,ed,T,S,has,ang=s.frame(RAW[pid]); c=site.centroid
    return lambda g: transform(tf, translate(rotate(g,ang,origin=(0,0)),c.x,c.y))
def polys(g): return [q for q in (g.geoms if g.geom_type.startswith('Multi') or g.geom_type=='GeometryCollection' else [g]) if q.geom_type=='Polygon' and not q.is_empty]
def els(pl,B):
    out=[]; n=0
    def add(typ,name,g,props):
        nonlocal n
        for q in polys(g):
            n+=1; out.append(dict(id='%s-%d'%(typ,n),type=typ,name=name,geometry=mapping(B(q)),properties=props,metadata=dict(createdAt='',updatedAt='',source='imported')))
    if pl['drv']: add('circulation','Private drive',unary_union([l.buffer(s.HW,cap_style=2,join_style=2) for l in pl['drv']]),{})
    for p in pl['prk']: add('parking','Parking',p,{})
    for b in pl['b']:
        t=s.TYPES[b['t']]; pr=dict(areaSqFt=round(b['g'].area),storiesAssumed=True)
        if b['u']: pr['units']=b['u']
        if t in('detached','cottage_court'): pr['house']=True
        elif t=='townhome_row': pr['townhome']=True
        elif t=='none': pr['use']='existing'
        else: pr['use']='residential'; pr['productType']=t
        add('building',t.replace('_',' '),b['g'],pr)
    return out
NAMES={'multifamily':'Multifamily','townhome':'Townhome','residential':'Residential','mixed_use':'Mixed use'}
sheets=[]
for r,w in sel:
    v=s.idx[r['sid']]; e=s.BY[v['pid']]; c=s.BY[v['nn'][0]]
    gen=s.parse(json.load(open('layouts/%s.json'%r['sid']))['samples'][0])
    for kind,ee,pl in (('civil',e,s.civil(e)),('pretrained',e,gen),('nearest',c,s.civil(c))):
        cx=CTX[ee['pid']]; label={'civil':"Civil's approved plan",'pretrained':'Pretrained model, first try','nearest':'Nearest training plan (lookup control)'}[kind]
        data=[dict(label='Site',value='%.2f ac'%ee['ac']),dict(label='Units',value=str(pl['units'])),dict(label='Buildings',value=str(len(pl['b']))),dict(label='Parking fields',value=str(len(pl['prk'])))]
        if kind=='pretrained': data+=[dict(label='Error vs civil',value='%.2f'%r['e1']),dict(label='Checks',value='pass' if r['pass1'] else 'fail')]
        if kind=='nearest': data+=[dict(label='Lookup error vs civil',value='%.2f'%r['l1'])]
        sheets.append(dict(sid=r['sid'],kind=kind,typ=NAMES[r['typ']],verdict=w,e1=r['e1'],l1=r['l1'],tgt=r['tgt'],ac=e['ac'],
            title=dict(project='%s  %s'%(cx['case'] or '',cx['name'] or ''),subtitle=label,date='16 Nov 2026',data=data,
                notes=['Stories are not in the layout data.','Stall counts are not drawn.'] ),
            input=dict(parcelId=cx['case'] or ee['pid'][:8],schemeId=kind,elements=els(pl,back(ee['pid'])),parcelGeometry=cx['site'],
                schedule=dict(units=pl['units'],stalls=None),generator=kind,
                context=dict(buildings=[dict(polygon=dict(type='Polygon',coordinates=q)) for g in (cx['bldgs'] or []) for q in (g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']])],
                    parcels=[dict(type='Polygon',coordinates=q) for g in (cx['parcels'] or []) for q in (g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']])],
                    roads=[dict(name=rd['name'],line=dict(coordinates=ln)) for rd in (cx['roads'] or []) if rd['line'].get('coordinates') for ln in (rd['line']['coordinates'] if rd['line']['type']=='MultiLineString' else [rd['line']['coordinates']]) if len(ln)>=2]))))
json.dump(sheets,open('sheets.json','w')); print(len(sheets),[ (x['sid'],x['kind'],len(x['input']['elements']),len(x['input']['context']['roads'])) for x in sheets[:3]])
