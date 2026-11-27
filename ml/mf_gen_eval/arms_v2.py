import json,sys,re
sys.path.insert(0,'/home/claude/linecls'); from util import load_rows
sys.path.insert(0,'/home/claude/review'); import score as S
CH=['plan_produced','units_vs_by_right','drive_reaches_street','buildings_face_streets','parking_not_in_front','no_empty_land','no_orphan_pavement','parking_meets_need','usable_green','front_setback','fire_reach']
def summ(res,r):
    fails=[c for c in CH if res.get(c,{}).get('ok') is False]
    m=r.get('metrics') or {}
    return dict(fails=fails,nf=len(fails),units=m.get('units_est') or m.get('units'))
def load(f):
    j=load_rows(f)[0]['j']; return json.loads(j) if isinstance(j,str) else j
T='/tmp/claude-tool-results/453657aa-defe-5409-90a5-36dc13c4812f/mcp-Supabase-execute_sql-'
FILES={'model_v2':T+'1795752162441-tb2oc8-9266ee9e.txt','model_v1':T+'1795752164056-ll2ylr-a654705b.txt','random':T+'1795752166304-rshdsv-5ec409eb.txt'}
FIDS=[382774,487660,489018,571134,632606,660274,660366,662916,666135,668808,669448,674370,691906,701867]
cand={}
for a,f in FILES.items():
    cand[a]={}
    for row in load(f):
        r=row['r']; cand[a].setdefault(row['fid'],[]).append(dict(i=row['i'],**summ(S.score(row['fid'],'mf',r),r)))
out={}; per={}
for a in FILES:
    c=dict(def_nf=0,pick_nf=0,units_def=0,units_pick=0,picked=0,improved=0,valid=0,tries=0,cand_nf=0)
    for fid in FIDS:
        d=json.load(open(f'raw/{fid}_mf.json')); ds=summ(S.score(fid,'mf',d),d); ds['i']='default'
        cs=cand[a].get(fid,[]); c['valid']+=len(cs); c['tries']+=6; c['cand_nf']+=sum(q['nf'] for q in cs)
        pool=[ds]+cs; umax=max((q['units'] or 0) for q in pool)
        pick=sorted([q for q in pool if (q['units'] or 0)>=0.98*umax],key=lambda q:(q['nf'],q['i']!='default'))[0]
        c['def_nf']+=ds['nf']; c['pick_nf']+=pick['nf']; c['units_def']+=ds['units'] or 0; c['units_pick']+=pick['units'] or 0
        c['picked']+=pick['i']!='default'; c['improved']+=pick['nf']<ds['nf']
        per.setdefault(fid,{})[a]=pick['nf']; per[fid]['default']=ds['nf']
    c['avg_cand_nf']=round(c['cand_nf']/max(c['valid'],1),2)
    out[a]=c; print(a,c)
for fid in FIDS: print(fid,per[fid])
json.dump(dict(out=out,per=per),open('/home/claude/curb/arms3.json','w'))
