import json, numpy as np
R=json.load(open('results.json'))
def med(q):  # site whose margin is the median of the group (lower-middle when even)
    q=sorted(q,key=lambda r:r['e1']-r['l1']); return q[(len(q)-1)//2] if q else None
sel=[]
for t in ['multifamily','townhome']:
    q=[r for r in R if r['typ']==t]
    sel.append((med([r for r in q if r['e1']<r['l1']]),'better')); sel.append((med([r for r in q if r['e1']>=r['l1']]),'worse'))
for t in ['residential','mixed_use']:
    r=med([r for r in R if r['typ']==t]); sel.append((r,'better' if r['e1']<r['l1'] else 'worse'))
if __name__=='__main__':
    for t in ['multifamily','townhome','residential','mixed_use']:
        q=[r for r in R if r['typ']==t]; print(t,len(q),'better',sum(r['e1']<r['l1'] for r in q),[(r['sid'],round(r['e1']-r['l1'],2)) for r in sorted(q,key=lambda r:r['e1']-r['l1'])])
    for r,w in sel: print(r['sid'],r['typ'],w,r['tgt'],round(r['e1'],2),round(r['l1'],2),r['pass1'])
