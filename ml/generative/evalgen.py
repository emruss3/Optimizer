import sys, json, math, numpy as np, torch
from gen import *
E=load(); m=Gen(); m.load_state_dict(torch.load(sys.argv[1])); N=int(sys.argv[2]) if len(sys.argv)>2 else 16
tr=[e for e in E if e['split']=='train']; dev=[e for e in E if e['split']=='dev' and e['units']]
eng={r[0]:dict(units=r[1],len=r[2],dep=r[3],cov=r[4]/100,upb=r[5],nb=max(1,round(r[6]*r[7]))) for r in json.load(open('engine.json'))}
rows=[]; rok=rn=0; store={}
for e in dev:
    civ=measures(e['b'],e)
    s,a,b=sample(m,e,N); rok+=a; rn+=b
    g=pick(s,e['units']); gm=measures(g['b'],e)
    # lookup control: nearest train plan, same typology
    c=min([t for t in tr if t['typ']==e['typ'] and t['units']],key=lambda t:abs(math.log(t['ac']/e['ac']))+abs(math.log((t['units']/t['ac'])/(e['units']/e['ac']))))
    cm=measures(c['b'],c); 
    if cm.get('upb'): cm['nb']=max(1,round(e['units']/cm['upb']))
    cm['cov']=cm['cov']*(e['units']/e['ac'])/(c['units']/c['ac'])
    K=('nb','len','dep','cov','upb')
    r=dict(pid=e['pid'],typ=e['typ'],tgt=e['units'],gen_units=g['units'],nb_c=civ['nb'],nb_g=gm['nb'] if gm else 0,
           e_gen=err(gm,civ) if gm else None,e_gen5=err(gm,civ,K) if gm else None,e_look=err(cm,civ),e_look5=err(cm,civ,K),
           e_eng5=err(eng[e['pid']],civ,K) if e['pid'] in eng else None, ok=bool(gm) and abs(math.log(max(g['units'],1)/e['units']))<math.log(1.15))
    rows.append(r); store[e['pid']]=[b['g'].wkt for b in g['b']]
    print(json.dumps({k:(round(v,3) if isinstance(v,float) else v) for k,v in r.items()}),flush=True)
json.dump(store,open('gen_dev.json','w'))
def mean(k,f=lambda r:True):
    v=[r[k] for r in rows if r[k] is not None and f(r)]; return (round(float(np.mean(v)),3),len(v))
print('raw valid first-try',rok,rn,round(rok/max(rn,1),3))
print('units within 15% of target',sum(r['ok'] for r in rows),len(rows))
for t in ['all']+TYPS:
    f=(lambda r:True) if t=='all' else (lambda r,t=t:r['typ']==t)
    print(t,'gen',mean('e_gen',f),'lookup',mean('e_look',f),'| 5-measure gen',mean('e_gen5',f),'lookup',mean('e_look5',f))
f=lambda r:r['e_eng5'] is not None
print('engine sites: gen',mean('e_gen5',f),'lookup',mean('e_look5',f),'engine',mean('e_eng5',f))
