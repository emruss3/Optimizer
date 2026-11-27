# Same checks and measures as ml/generative/eval5.py (raw, meas, err copied from gen2.py; torch not needed)
import sys, json, math, pickle, os, glob, numpy as np
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from data2 import *
from shapely.geometry import LineString
from shapely.ops import unary_union
HW=12.0
E,FL=pickle.load(open('E.pkl','rb')); idx=json.load(open('index.json')); BY={e['pid']:e for e in E}
def civil(e):
    S=e['S']; return dict(b=e['b'],drv=[LineString([(x*S,y*S) for x,y in l]) for l in e['drv']],prk=[p['g'] for p in e['prk']],units=sum(b['u'] or 0 for b in e['b']))
def raw(pl,e):
    out={}
    if not pl['b']: return out
    if pl['drv']:
        dl=unary_union(pl['drv']); out['comp']=len(getattr(unary_union([l.buffer(HW+3) for l in pl['drv']]),'geoms',[0]))
        out['b_drv']=max(b['g'].distance(dl) for b in pl['b'])
        if e['has']: out['d_street']=dl.distance(e['street'])
        if pl['prk']: out['p_drv']=max(p.distance(dl) for p in pl['prk'])
    if pl['prk']:
        pu=unary_union(pl['prk']); out['b_prk']=float(np.percentile([b['g'].distance(pu) for b in pl['b']],90))
    return out
def meas(pl,e):
    bl=pl['b']
    if not bl: return None
    us=[b['u'] for b in bl if b['u']]
    m=dict(nb=len(bl),len=float(np.median([max(b['w'],b['d']) for b in bl])),dep=float(np.median([min(b['w'],b['d']) for b in bl])),cov=sum(b['g'].area for b in bl)/e['site'].area,upb=float(np.mean(us)) if us else None)
    if e['has']: m['setback']=min(b['g'].distance(e['street']) for b in bl)+5
    if pl['prk']: m['park']=unary_union(pl['prk']).area/e['site'].area
    if pl['drv']: m['drv']=sum(l.length for l in pl['drv'])/e['S']
    return m
KEYS=('nb','len','dep','cov','upb','setback','park','drv'); K5=('nb','len','dep','cov','upb')
def err(a,b,keys=KEYS):
    v=[abs(math.log(a[k]/b[k])) for k in keys if a.get(k) and b.get(k)]
    return float(np.mean(v)) if v else None
tr=[e for e in E if e['split']=='train' and FL[e['pid']]['pos']]
RT=[raw(civil(e),e) for e in tr]
TOL={k:float(np.percentile([r[k] for r in RT if k in r],90)) for k in ['b_drv','d_street','p_drv','b_prk']}
def checks(pl,e,tgt):
    r=raw(pl,e); c={}
    c['has_buildings']=bool(pl['b']); c['has_drive']=bool(pl['drv'])
    c['drive_connected']=r.get('comp')==1
    c['building_near_drive']='b_drv' in r and r['b_drv']<=TOL['b_drv']
    if e['has']: c['drive_reaches_street']='d_street' in r and r['d_street']<=TOL['d_street']
    c['parking_near_drive']=('p_drv' not in r) or r['p_drv']<=TOL['p_drv']
    c['units_on_target']=bool(tgt) and pl['units']>0 and abs(math.log(pl['units']/tgt))<math.log(1.15)
    return c
def parse(s):
    b=[]
    for x in s.get('buildings',[]):
        L,D=float(x['length']),float(x['depth']); a=float(x.get('angle_deg',0))
        g=rect(float(x['cx']),float(x['cy']),L,D,a); u=x.get('units')
        b.append(dict(t=TYPES.index(x['type']) if x.get('type') in TYPES else 8,w=L,d=D,a=a%180,u=int(u) if u else None,g=g))
    drv=[LineString(l) for l in s.get('drives',[]) if len(l)>=2]
    prk=[rect(float(x['cx']),float(x['cy']),float(x['length']),float(x['depth']),float(x.get('angle_deg',0))) for x in s.get('parking',[])]
    return dict(b=b,drv=drv,prk=prk,units=sum(x['u'] or 0 for x in b))
def valid(pl,e):
    # the trained model's sampler rejects these at generation time (gen2.sample); here they are only counted
    site=e['site']; pave=unary_union([l.buffer(HW) for l in pl['drv']]) if pl['drv'] else None
    nb=len(pl['b']) or 1
    inside=sum(b['g'].intersection(site).area>=0.97*b['g'].area for b in pl['b'])/nb
    olap=sum(any(b['g'].intersection(h['g']).area>=1 for h in pl['b'] if h is not b) for b in pl['b'])/nb
    onpave=sum(pave is not None and b['g'].intersection(pave).area>=0.1*b['g'].area for b in pl['b'])/nb
    pin=sum(p.intersection(site).area>=0.9*p.area for p in pl['prk'])/len(pl['prk']) if pl['prk'] else 1.0
    return dict(inside=inside,overlap=olap,on_pavement=onpave,parking_inside=pin,clean=inside==1 and olap==0 and onpave==0 and pin==1)
def lookup(e,k=1):
    cs=sorted([t for t in tr if t['typ']==e['typ'] and t['units']],key=lambda t:abs(math.log(t['ac']/e['ac']))+abs(math.log((t['units']/t['ac'])/(e['units']/e['ac']))))[:k]
    out=[]
    for c in cs:
        lm=meas(civil(c),c); r=(e['units']/e['ac'])/(c['units']/c['ac'])
        if lm.get('upb'): lm['nb']=max(1,round(e['units']/lm['upb']))
        lm['cov']*=r
        if lm.get('park'): lm['park']*=r
        out.append(lm)
    return out
if __name__=='__main__':
    print('tolerances',{k:round(v) for k,v in TOL.items()}); rows=[]
    for sid,v in sorted(idx.items()):
        f='layouts/%s.json'%sid
        if not os.path.exists(f): continue
        e=BY[v['pid']]; cv=civil(e); cm=meas(cv,e)
        try: S=[parse(s) for s in json.load(open(f))['samples']]
        except Exception as ex: print(sid,'PARSE FAIL',ex); continue
        ck=[checks(s,e,e['units']) for s in S]; vl=[valid(s,e) for s in S]; ms=[meas(s,e) or {} for s in S]
        best=max(range(len(S)),key=lambda i:(sum(ck[i].values())+vl[i]['clean'],-i))
        lk=lookup(e,3)
        med={k:float(np.median([l[k] for l in lk if l.get(k)])) for k in KEYS if any(l.get(k) for l in lk)}
        rows.append(dict(sid=sid,typ=e['typ'],tgt=e['units'],n=len(S),
            e1=err(ms[0],cm),e1_5=err(ms[0],cm,K5),eb=err(ms[best],cm),eb_5=err(ms[best],cm,K5),
            l1=err(lk[0],cm),l1_5=err(lk[0],cm,K5),l3=err(med,cm),
            pass1=all(ck[0].values()),passb=all(ck[best].values()),clean1=vl[0]['clean'],cleanb=vl[best]['clean'],
            unit1=ck[0]['units_on_target'],ck=ck,vl=vl,
            pm={k:abs(math.log(ms[0][k]/cm[k])) for k in KEYS if ms[0].get(k) and cm.get(k)},
            pl={k:abs(math.log(lk[0][k]/cm[k])) for k in KEYS if lk[0].get(k) and cm.get(k)},
            cc=all(v for k,v in checks(cv,e,e['units']).items() if k!='units_on_target')))
    json.dump(rows,open('results.json','w'))
    mean=lambda k:float(np.mean([r[k] for r in rows if r[k] is not None])) if rows else None
    print('sites',len(rows))
    for k in ['e1','l1','eb','l3','e1_5','l1_5','eb_5','pass1','passb','clean1','cleanb','unit1','cc']: print(k,round(mean(k),3))
    for k in KEYS:
        a=[r['pm'][k] for r in rows if k in r['pm'] and k in r['pl']]; b=[r['pl'][k] for r in rows if k in r['pm'] and k in r['pl']]
        if a: print('  %-8s n=%2d model %.2f lookup %.2f'%(k,len(a),np.mean(a),np.mean(b)))
    chk={}
    for r in rows:
        for k,v in r['ck'][0].items(): chk.setdefault(k,[]).append(v)
        for k in ['inside','overlap','on_pavement']: chk.setdefault('v_'+k,[]).append(r['vl'][0][k])
    print({k:round(float(np.mean(v)),2) for k,v in chk.items()})
