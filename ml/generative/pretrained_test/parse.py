import json,re,glob,sys
P=[]
for f in sorted(sys.argv[1:]):
    s=open(f).read()
    try: o=json.loads(s)
    except Exception: o=None
    txt=o['result'] if isinstance(o,dict) and 'result' in o else s
    i=txt.find('[{"j"'); j=txt.rfind('}]')
    if i<0: print('skip',f,len(s)); continue
    rows=json.loads(txt[i:j+2])
    for r in rows: P.append(json.loads(r['j']))
    print(f[-20:],len(rows))
seen={}
for p in P: seen[p['pid']]=p
P=list(seen.values())
json.dump(P,open('plans.json','w'))
import collections
print(len(P),collections.Counter((p['split'],p['pos']) for p in P))
print(collections.Counter(p['split'] for p in P if p['pos'] and p['ur'] and p['sr']))
