"""save.py <job index> <saved result file>: store the plan payload as raw/<fid>_<engine>.json and delete the result file."""
import json,sys,os
sys.path.insert(0,'/home/claude/linecls'); from util import load_rows
i=int(sys.argv[1]); f,eng,_=json.load(open('/home/claude/review/jobs.json'))[i]
rows=load_rows(sys.argv[2]); r=rows[0]['r']
if isinstance(r,str): r=json.loads(r)
json.dump(r,open(f'/home/claude/review/raw/{f}_{eng}.json','w')); os.remove(sys.argv[2])
print(i,f,eng,'saved',len(json.dumps(r)),'bytes', 'error' if isinstance(r,dict) and r.get('error') else '')
