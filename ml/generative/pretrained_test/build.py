import sys, json, math, pickle, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
from data2 import *            # repo encoders (no torch)
P=json.load(open('plans.json')); E=[]; flags={}
for p in P:
    flags[p['pid']]=dict(pos=bool(p['pos']),ur=bool(p['ur']),sr=bool(p['sr']))
    p['ctx']['boundary_edges']=p['ctx']['boundary_edges'] or []
    if not p['b']: print('nob',p['pid']); continue
    try: e=encode2(p); E.append(e)
    except Exception as ex: print('skip',p['pid'],p['split'],ex)
pickle.dump((E,flags),open('E.pkl','wb'))
tr=[e for e in E if e['split']=='train' and flags[e['pid']]['pos'] and e['units']]
dev=[e for e in E if e['split']=='dev' and flags[e['pid']]['pos'] and e['units']]
print('train clean',len(tr),'dev',len(dev))
def dist(t,e): return abs(math.log(t['ac']/e['ac']))+abs(math.log((t['units']/t['ac'])/(e['units']/e['ac'])))
def near(e,k=3):
    c=[t for t in tr if t['typ']==e['typ']]
    return sorted(c,key=lambda t:dist(t,e))[:k]
R=lambda v:round(float(v),1)
def edges(p_raw):
    site,ed,T,S,has,ang=frame(p_raw); out=[]
    for g,t in ed:
        g=T(g).simplify(1.0); out.append(dict(type=t,line=[[R(x),R(y)] for x,y in g.coords]))
    return out
RAW={p['pid']:p for p in P}
def plan_txt(e):
    S=e['S']; L=[]
    L.append('drives (centrelines, ft): '+json.dumps([[[R(x*S),R(y*S)] for x,y in l] for l in e['drv']]))
    L.append('buildings [type, cx, cy, length, depth, angle_deg, units]:')
    for b in e['b']: L.append('  '+json.dumps([TYPES[b['t']],R(b['x']*S),R(b['y']*S),R(b['w']),R(b['d']),R(b['a']),b['u']]))
    L.append('parking fields [cx, cy, length, depth, angle_deg]:')
    for p in e['prk']: L.append('  '+json.dumps([R(p['x']*S),R(p['y']*S),R(p['w']),R(p['d']),R(p['a'])]))
    return '\n'.join(L)
def site_txt(e):
    return ('site: %.2f acres, product family %s, %d units (%.1f units/acre)\n'%(e['ac'],e['typ'],e['units'],e['units']/e['ac'])+
            'boundary polygon (ft): '+json.dumps([[R(x),R(y)] for x,y in e['site'].exterior.coords])+'\n'+
            'boundary edges with what lies beyond each: '+json.dumps(edges(RAW[e['pid']])))
os.makedirs('prompts',exist_ok=True); os.makedirs('out',exist_ok=True); idx={}
for i,e in enumerate(sorted(dev,key=lambda e:e['pid'])):
    nn=near(e); idx['s%02d'%i]=dict(pid=e['pid'],nn=[t['pid'] for t in nn])
    t=['# Site s%02d'%i,'',
'Coordinates are feet in a local frame: origin at the site centroid; when the site has street frontage, the longest street edge runs along x and lies on the low-y side.','',
'## The site to lay out', site_txt(e),'']
    if not nn: t.append('(no approved plan of this product family is available as an example)')
    for j,c in enumerate(nn):
        t+=['## Example %d: an approved plan on a similar site (its own local frame, same conventions)'%(j+1), site_txt(c), plan_txt(c),'']
    open('prompts/s%02d.md'%i,'w').write('\n'.join(t))
json.dump(idx,open('index.json','w'))
import glob; print(sorted((os.path.getsize(f),f) for f in glob.glob('prompts/*'))[-3:], sum(os.path.getsize(f) for f in glob.glob('prompts/*')))
