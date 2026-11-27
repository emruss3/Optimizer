# whole-plan tokens: drives (centreline points), buildings, parking fields
from data import *
import data as D
NPX=NX
V2={}; o=D.VOCAB
for k,n in [('DRV',1),('PRK',1),('SEC',1),('px',NX),('py',NX),('pw',NW),('pd',NW),('pa',NA)]:
    V2[k]=(o,n); o+=n
VOCAB2=o
DRV,PRK,SEC=V2['DRV'][0],V2['PRK'][0],V2['SEC'][0]
def encode2(p):
    e=encode(p); site,edges,T,S,has,ang=frame(p); e['drv']=[]; e['prk']=[]
    if p['d']:
        for q in wkt.loads(p['d']).geoms:
            g=T(q); 
            if g.geom_type=='Polygon':
                L,Dd,a=mrr(g); c=g.centroid; r=math.radians(a); g=LineString([(c.x-L/2*math.cos(r),c.y-L/2*math.sin(r)),(c.x+L/2*math.cos(r),c.y+L/2*math.sin(r))])
            g=g.simplify(0.02*S)
            pts=[(x/S,y/S) for x,y in g.coords][:24]
            if len(pts)>=2: e['drv'].append(pts)
    for w in p['p'] or []:
        g=T(wkt.loads(w)); 
        for q in (g.geoms if g.geom_type.startswith('Multi') else [g]):
            if q.area<150: continue
            L,Dd,a=mrr(q); e['prk'].append(dict(x=q.centroid.x/S,y=q.centroid.y/S,w=L,d=Dd,a=a,g=q))
    return e
def toks2(e,mirror=False):
    sx=-1 if mirror else 1
    out=[BOS]
    dr=[[(sx*x,y) for x,y in l] for l in e['drv']]
    dr=[l if (qx(l[0][1]),qx(l[0][0]))<=(qx(l[-1][1]),qx(l[-1][0])) else l[::-1] for l in dr]
    dr.sort(key=lambda l:(qx(l[0][1]),qx(l[0][0])))
    for l in dr:
        out.append(DRV)
        for x,y in l: out+=[V2['px'][0]+qx(x),V2['py'][0]+qx(y)]
    out.append(SEC)
    out+=toks(e['b'],mirror)[1:-1]
    out.append(SEC)
    pk=[dict(p) for p in e['prk']]
    for p in pk:
        if mirror: p['x']=-p['x']; p['a']=(180-p['a'])%180
    pk.sort(key=lambda p:(qx(p['y']),qx(p['x'])))
    for p in pk[:60]:
        out+=[PRK,V2['px'][0]+qx(p['x']),V2['py'][0]+qx(p['y']),V2['pw'][0]+qw(p['w']),V2['pd'][0]+qw(p['d']),V2['pa'][0]+int((p['a']%180)/180*NA)%NA]
    return out+[EOS]
def load2():
    P=json.load(open('plans.json')); out=[]
    for p in P:
        if not p['b']: continue
        try: out.append(encode2(p))
        except Exception as ex: print('skip',p['pid'],ex)
    return out
if __name__=='__main__':
    E=load2(); L=[len(toks2(e)) for e in E]; print(len(E),VOCAB2,max(L),int(np.median(L)))
    print(sum(len(e['drv']) for e in E), sum(len(e['prk']) for e in E))
    import pickle; pickle.dump(E,open('E2.pkl','wb'))
