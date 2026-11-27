import json,sys
sys.path.insert(0,'/home/claude/linecls'); from util import load_rows
sys.path.insert(0,'/home/claude/review'); import score as S
CH=['plan_produced','units_vs_by_right','drive_reaches_street','buildings_face_streets','parking_not_in_front','no_empty_land','no_orphan_pavement','parking_meets_need','usable_green','front_setback','fire_reach']
def summ(res,r):
    fails=[c for c in CH if res.get(c,{}).get('ok') is False]
    m=r.get('metrics') or {}
    return dict(fails=fails,nf=len(fails),units=m.get('units_est') or m.get('units'))
T='/tmp/claude-tool-results/453657aa-defe-5409-90a5-36dc13c4812f/mcp-Supabase-execute_sql-'
ARMS={'model':[T+'1795718647803-wu5p8c-7ed154a8.txt',T+'1795718655305-6ub06d-6d8d2a13.txt',T+'1795718663631-ukmsgi-779063c7.txt'],
      'random':[T+'1795719332649-bqc7hc-104479af.txt',T+'1795719356668-x6t1cu-ca3602f6.txt',T+'1795719363134-24imky-6b05d511.txt']}
FIDS=[382774,487660,489018,571134,632606,660274,660366,662916,666135,668808,669448,674370,691906,701867]
cand={a:{} for a in ARMS}
for a,fs in ARMS.items():
    for f in fs:
        for row in load_rows(f):
            r=row['r']; r=json.loads(r) if isinstance(r,str) else r
            cand[a].setdefault(row['fid'],[]).append(dict(i=row['i'],**summ(S.score(row['fid'],'mf',r),r)))
out={}
for a in ARMS:
    c=dict(def_nf=0,pick_nf=0,units_def=0,units_pick=0,picked=0,improved=0,valid=0,tries=0)
    for fid in FIDS:
        d=json.load(open(f'raw/{fid}_mf.json')); ds=summ(S.score(fid,'mf',d),d); ds['i']='default'
        cs=cand[a].get(fid,[]); c['valid']+=len(cs); c['tries']+=6
        pool=[ds]+cs; umax=max((q['units'] or 0) for q in pool)
        pick=sorted([q for q in pool if (q['units'] or 0)>=0.98*umax],key=lambda q:(q['nf'],q['i']!='default'))[0]
        c['def_nf']+=ds['nf']; c['pick_nf']+=pick['nf']; c['units_def']+=ds['units'] or 0; c['units_pick']+=pick['units'] or 0
        c['picked']+=pick['i']!='default'; c['improved']+=pick['nf']<ds['nf']
    out[a]=c; print(a,c)
json.dump(out,open('/home/claude/curb/arms.json','w'))
