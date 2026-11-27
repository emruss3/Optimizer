import json, math, numpy as np, hashlib
from shapely import wkt
from shapely.geometry import shape, Polygon, LineString, box
from shapely.affinity import translate, rotate, scale as sscale
from shapely.ops import unary_union
TYPES=['detached','townhome_row','cottage_court','garden_walk_up','stacked_flats','podium','wrap','tuck_under','none']
TYPS=['multifamily','townhome','residential','mixed_use']
ECLS={'street_frontage':0,'alley_frontage':1,'private_drive_frontage':1,'neighboring_homes':2,'neighboring_multifamily':3,'commercial':4,'industrial':4,'stream_corridor':5,'vacant_land':6,'open_space':6}
NE=8; NB=32
NX=64; XR=1.2; NW=32; WMIN=12.; WMAX=500.; NA=12
UB=[1,2,3,4,6,8,12,16,24,36,60,100,200,10**9]; NU=len(UB)+1
OFF={}; o=3
for k,n in [('t',len(TYPES)),('x',NX),('y',NX),('w',NW),('d',NW),('a',NA),('u',NU)]:
    OFF[k]=(o,n); o+=n
VOCAB=o; PAD,BOS,EOS=0,1,2; FIELDS=['t','x','y','w','d','a','u']
def qx(v): return int(np.clip((v+XR)/(2*XR)*NX,0,NX-1))
def dx(i): return (i+0.5)/NX*2*XR-XR
def qw(v): return int(np.clip(math.log(max(v,WMIN)/WMIN)/math.log(WMAX/WMIN)*NW,0,NW-1))
def dw(i): return WMIN*math.exp((i+0.5)/NW*math.log(WMAX/WMIN))
def qu(u):
    if u is None: return NU-1
    for i,b in enumerate(UB):
        if u<=b: return i
def du(i):
    if i==NU-1: return None
    lo=1 if i==0 else UB[i-1]+1; hi=min(UB[i],300)
    return int(round(math.sqrt(lo*hi)))
def mrr(poly):
    r=poly.minimum_rotated_rectangle; c=list(r.exterior.coords)
    e=[(math.dist(c[i],c[i+1]),math.degrees(math.atan2(c[i+1][1]-c[i][1],c[i+1][0]-c[i][0]))) for i in range(2)]
    e.sort(reverse=True); return e[0][0],e[1][0],e[0][1]%180
def frame(p):
    site=wkt.loads(p['site']); site=site if site.geom_type=='Polygon' else max(site.geoms,key=lambda g:g.area)
    edges=[(shape(e['geom_2274']),e['type']) for e in p['ctx']['boundary_edges']]
    st=[g for g,t in edges if t=='street_frontage']
    c=site.centroid; has=bool(st)
    if has:
        g=max(st,key=lambda g:g.length); a=list(g.coords); ang=math.degrees(math.atan2(a[-1][1]-a[0][1],a[-1][0]-a[0][0]))
    else: ang=mrr(site)[2]
    S=math.sqrt(site.area)
    def T(g): return rotate(translate(g,-c.x,-c.y),-ang,origin=(0,0))
    if has and T(g).centroid.y>0: ang+=180
    return site,edges,T,S,has,ang
def building(g):
    L,D,a=mrr(g); return g.centroid.x,g.centroid.y,L,D,a
def rect(cx,cy,L,D,a): return rotate(box(cx-L/2,cy-D/2,cx+L/2,cy+D/2),a,origin=(cx,cy))
def encode(p):
    site,edges,T,S,has,ang=frame(p)
    fs=T(site); ring=fs.exterior
    pts=[]; fe=[(T(g),ECLS.get(t,7)) for g,t in edges]
    for i in range(NB):
        q=ring.interpolate(i/NB,normalized=True)
        cls=min(fe,key=lambda e:e[0].distance(q))[1] if fe else 7
        pts.append((q.x/S,q.y/S,cls))
    bl=[]
    for b in p['b'] or []:
        g=T(wkt.loads(b['w'])); cx,cy,L,D,a=building(g)
        u=int(float(b['u'])) if b['u'] else None
        bl.append(dict(t=TYPES.index(b['t'] or 'none'),x=cx/S,y=cy/S,w=L,d=D,a=a,u=u,g=g))
    units=(p['tm'] or {}).get('units') or sum(b['u'] or 0 for b in bl) or None
    return dict(pid=p['pid'],typ=p['typ'],split=p['split'],site=fs,S=S,has=has,pts=pts,b=bl,units=units,ac=site.area/43560,
                street=unary_union([g for g,c in fe if c==0]) if has else None)
def cond(e,units=None):
    u=units or e['units'] or 1
    v=[math.log(e['ac']),math.log(u),math.log(u/e['ac']),float(e['has'])]+[float(e['typ']==t) for t in TYPS]
    return np.array(v,dtype=np.float32)
def toks(bl,mirror=False):
    bs=[dict(b) for b in bl]
    if mirror:
        for b in bs: b['x']=-b['x']; b['a']=(180-b['a'])%180
    bs.sort(key=lambda b:(qx(b['y']),qx(b['x'])))
    out=[BOS]
    for b in bs:
        out+=[OFF['t'][0]+b['t'],OFF['x'][0]+qx(b['x']),OFF['y'][0]+qx(b['y']),OFF['w'][0]+qw(b['w']),OFF['d'][0]+qw(b['d']),OFF['a'][0]+int((b['a']%180)/180*NA)%NA,OFF['u'][0]+qu(b['u'])]
    return out+[EOS]
def bpts(e,mirror=False):
    a=np.array(e['pts'],dtype=np.float32)
    if mirror: a=a[::-1].copy(); a[:,0]*=-1
    return a
def load():
    P=json.load(open('plans.json')); out=[]
    for p in P:
        if not p['b']: continue
        try: out.append(encode(p))
        except Exception as ex: print('skip',p['pid'],ex)
    return out
def isval(pid): return int(hashlib.md5(str(pid).encode()).hexdigest(),16)%7==0
if __name__=='__main__':
    E=load(); print(len(E),VOCAB, max(len(toks(e['b'])) for e in E))
    import collections; print(collections.Counter((e['split'],isval(e['pid'])) for e in E))
