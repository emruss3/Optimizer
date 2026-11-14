import sys, json, math, pickle, numpy as np, torch
from gen2 import *
E=pickle.load(open('E2.pkl','rb')); m=Gen2(); m.load_state_dict(torch.load(sys.argv[1])); N=int(sys.argv[2]) if len(sys.argv)>2 else 16
tr=[e for e in E if e['split']=='train']; dev=[e for e in E if e['split']=='dev' and e['units']]
# checker tolerances: 90th percentile of the civil train plans (nothing hand-set)
RT=[raw(civil(e),e) for e in tr]
TOL={k:float(np.percentile([r[k] for r in RT if k in r],90)) for k in ['b_drv','d_street','p_drv','b_prk']}
print('tolerances',{k:round(v) for k,v in TOL.items()})
def checks(pl,e,tgt):
    r=raw(pl,e); c={}
    c['has_buildings']=bool(pl['b']); c['has_drive']=bool(pl['drv'])
    c['drive_connected']=r.get('comp')==1
    c['building_near_drive']='b_drv' in r and r['b_drv']<=TOL['b_drv']
    if e['has']: c['drive_reaches_street']='d_street' in r and r['d_street']<=TOL['d_street']
    c['parking_near_drive']=('p_drv' not in r) or r['p_drv']<=TOL['p_drv']
    c['units_on_target']=bool(tgt) and pl['units']>0 and abs(math.log(pl['units']/tgt))<math.log(1.15)
    return c
def pick(ss,e):
    return max(ss,key=lambda s:(sum(checks(s,e,e['units']).values()),s['ll']))
eng={r[0]:dict(units=r[1],len=r[2],dep=r[3],cov=r[4]/100,upb=r[5],nb=max(1,round(r[6]*r[7]))) for r in json.load(open('engine.json'))}
rows=[]; ST=dict(d=[0,0],b=[0,0],p=[0,0]); store={}; CG={}; CC={}
K5=('nb','len','dep','cov','upb')
import os
RES='eval_rows.jsonl'; done_={json.loads(l)['pid'] for l in open(RES)} if os.path.exists(RES) else set()
for e in dev:
    if e['pid'] in done_: continue
    cv=civil(e); cm=meas(cv,e)
    ss,st=sample(m,e,N)
    for k in ST: ST[k][0]+=st[k][0]; ST[k][1]+=st[k][1]
    g=pick(ss,e); gm=meas(g,e) or {}
    cg=checks(g,e,e['units']); cc=checks(cv,e,e['units'])
    for k,v in cg.items(): CG.setdefault(k,[]).append(v)
    for k,v in cc.items():
        if k!='units_on_target': CC.setdefault(k,[]).append(v)
    c=min([t for t in tr if t['typ']==e['typ'] and t['units']],key=lambda t:abs(math.log(t['ac']/e['ac']))+abs(math.log((t['units']/t['ac'])/(e['units']/e['ac']))))
    lm=meas(civil(c),c); k=(e['units']/e['ac'])/(c['units']/c['ac'])
    if lm.get('upb'): lm['nb']=max(1,round(e['units']/lm['upb']))
    lm['cov']*=k
    if lm.get('park'): lm['park']*=k
    r=dict(pid=e['pid'],typ=e['typ'],tgt=e['units'],units=g['units'],nb_c=cm['nb'],nb_g=len(g['b']),nd=len(g['drv']),npk=len(g['prk']),allpass=all(cg.values()),
           e_gen=err(gm,cm),e_look=err(lm,cm),e_gen5=err(gm,cm,K5),e_look5=err(lm,cm,K5),e_eng5=err(eng[e['pid']],cm,K5) if e['pid'] in eng else None)
    r['cg']=cg; r['cc']=cc; r['st']=st; open(RES,'a').write(json.dumps(r)+'\n')
    rows.append(r); store[e['pid']]=dict(site=e['site'].wkt,street=e['street'].wkt if e['has'] else None,typ=e['typ'],tgt=e['units'],units=g['units'],allpass=r['allpass'],
        gen=dict(b=[b['g'].wkt for b in g['b']],d=[l.wkt for l in g['drv']],p=[p.wkt for p in g['prk']]),civ=dict(b=[b['g'].wkt for b in cv['b']],d=[l.wkt for l in cv['drv']],p=[p.wkt for p in cv['prk']]))
    print(json.dumps({k:(round(v,3) if isinstance(v,float) else v) for k,v in r.items()}),flush=True)
json.dump(store,open('gen3_dev_part.json','w'))
print('DONE')
