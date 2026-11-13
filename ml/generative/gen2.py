import math, sys, json, random, pickle, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from data2 import *
from shapely.ops import unary_union
torch.manual_seed(0); random.seed(0); np.random.seed(0); torch.set_num_threads(2)
MAXL=960; HW=12.0
class Gen2(nn.Module):
    def __init__(s,d=128,L=4,H=4,p=0.2):
        super().__init__()
        s.tok=nn.Embedding(VOCAB2,d); s.pos=nn.Embedding(MAXL,d)
        s.c=nn.Sequential(nn.Linear(8,d),nn.GELU(),nn.Linear(d,d)); s.bp=nn.Linear(2,d); s.be=nn.Embedding(NE,d); s.bpos=nn.Embedding(NB,d)
        l=nn.TransformerEncoderLayer(d,H,4*d,p,batch_first=True,norm_first=True,activation='gelu'); s.tr=nn.TransformerEncoder(l,L,enable_nested_tensor=False)
        s.ln=nn.LayerNorm(d); s.out=nn.Linear(d,VOCAB2); s.drop=nn.Dropout(p)
    def forward(s,c,bp,x):
        B,T=x.shape
        pre=torch.cat([s.c(c)[:,None],s.bp(bp[:,:,:2])+s.be(bp[:,:,2].long())+s.bpos(torch.arange(NB))[None]],1)
        h=s.drop(torch.cat([pre,s.tok(x)+s.pos(torch.arange(T))[None]],1)); n=h.shape[1]
        return s.out(s.ln(s.tr(h,mask=torch.triu(torch.ones(n,n,dtype=torch.bool),1))))[:,1+NB:]
def batch(es,aug):
    C=[];BP=[];X=[]
    for e in es:
        mir=aug and random.random()<0.5; b=bpts(e,mir)
        if aug: b=np.roll(b,random.randrange(NB),0)
        u=e['units']
        if aug and u: u=u*math.exp(random.gauss(0,0.05))
        C.append(cond(e,u)); BP.append(b); X.append(toks2(e,mir)[:MAXL])
    T=max(map(len,X)); X=[x+[PAD]*(T-len(x)) for x in X]
    return torch.tensor(np.array(C)),torch.tensor(np.array(BP)),torch.tensor(X)
def loss_of(m,es,aug):
    c,bp,x=batch(es,aug); lg=m(c,bp,x[:,:-1])
    return F.cross_entropy(lg.reshape(-1,VOCAB2),x[:,1:].reshape(-1),ignore_index=PAD,label_smoothing=0.05 if aug else 0.)
def train(E,epochs,name):
    tr=[e for e in E if e['split']=='train' and not isval(e['pid'])]; va=[e for e in E if e['split']=='train' and isval(e['pid'])]
    m=Gen2(); opt=torch.optim.AdamW(m.parameters(),3e-4,weight_decay=0.05); best=9
    for ep in range(epochs):
        m.train(); random.shuffle(tr); bs=[]
        for w in range(0,len(tr),36):
            ch=sorted(tr[w:w+36],key=lambda e:len(e['b'])*7+len(e['prk'])*6); bs+=[ch[i:i+12] for i in range(0,len(ch),12)]
        random.shuffle(bs)
        for bt in bs:
            opt.zero_grad(); l=loss_of(m,bt,True); l.backward(); nn.utils.clip_grad_norm_(m.parameters(),1.); opt.step()
        if ep%10==9:
            m.eval()
            with torch.no_grad(): v=float(np.mean([loss_of(m,va[i:i+11],False).item() for i in range(0,len(va),11)]))
            if v<best: best=v; torch.save(m.state_dict(),name)
            print(ep+1,round(l.item(),3),round(v,3),flush=True)
def rng(k,V=None):
    o,n=(V2[k] if k in V2 else OFF[k]); return list(range(o,o+n))
R={k:rng(k) for k in list(V2)+list(OFF)}
def allowed(sec,cur):
    n=len(cur)
    if sec==0:
        if n==0: return [DRV,SEC]
        if n==1: return R['px']
        if n%2==0: return R['py']
        a=list(R['px']) if n<49 else []
        return a+([DRV,SEC] if n>=5 else [])
    if sec==1:
        if n==0: return R['t']+[SEC]
        return R[FIELDS[n]]
    if n==0: return [PRK,EOS]
    return R[['px','py','pw','pd','pa'][n-1]]
@torch.no_grad()
def sample(m,e,N=16,temp=0.9,tries=25):
    m.eval(); S=e['S']; site=e['site']; sb=site.buffer(2); tgt=e['units']
    c=torch.tensor(cond(e,tgt))[None].repeat(N,1); bp=torch.tensor(bpts(e))[None].repeat(N,1,1)
    st=[dict(seq=[BOS],cur=[],sec=0,drv=[],b=[],prk=[],ll=0.,cl=0.,done=False,fails=0,un=0,pave=None,nt=0) for _ in range(N)]
    stats=dict(d=[0,0],b=[0,0],p=[0,0])
    def close(s,term):
        s['seq']+=s['cur']+[term]; s['ll']+=s['cl']; s['nt']+=len(s['cur'])+1; s['cur']=[]; s['cl']=0.; s['fails']=0
        if term==SEC: s['sec']+=1
        if term==SEC and s['sec']==1: s['pave']=unary_union([l.buffer(HW) for l in s['drv']]) if s['drv'] else None
        if term==EOS: s['done']=True
    def fail(s,term_on_giveup):
        s['cur']=[]; s['cl']=0.; s['fails']+=1
        if s['fails']>=tries: close(s,term_on_giveup)
    while not all(s['done'] for s in st):
        act=[s for s in st if not s['done']]
        xs=[s['seq']+s['cur'] for s in act]; T=max(map(len,xs))
        lg=m(c[:len(act)],bp[:len(act)],torch.tensor([x+[PAD]*(T-len(x)) for x in xs]))
        for j,s in enumerate(act):
            if len(xs[j])>=MAXL-10: close(s,EOS); continue
            al=allowed(s['sec'],s['cur']); z=lg[j,len(xs[j])-1][al]/temp; pr=torch.log_softmax(z,-1); i=torch.multinomial(pr.exp(),1).item(); t=al[i]; lp=pr[i].item()
            sec=s['sec']; cur=s['cur']
            if sec==0:
                if t in (DRV,SEC) and len(cur)>=5:
                    pts=[(dx(cur[q]-V2['px'][0])*S,dx(cur[q+1]-V2['py'][0])*S) for q in range(1,len(cur),2)]
                    g=LineString(pts); ok=g.length>0 and g.intersection(sb).length>=0.95*g.length; stats['d'][0]+=ok; stats['d'][1]+=1
                    if ok:
                        s['drv'].append(g); s['seq']+=cur; s['ll']+=s['cl']; s['nt']+=len(cur); s['cur']=[]; s['cl']=0.; s['fails']=0
                        if t==SEC: close(s,SEC)
                        else: s['cur']=[DRV]; s['cl']=lp
                    else: fail(s,SEC)
                elif t==SEC: s['cl']+=lp; close(s,SEC)
                else: cur.append(t); s['cl']+=lp
            elif sec==1:
                if t==SEC: s['cl']+=lp; close(s,SEC); continue
                cur.append(t); s['cl']+=lp
                if len(cur)==7:
                    v=[cur[q]-OFF[k][0] for q,k in enumerate(FIELDS)]
                    g=rect(dx(v[1])*S,dx(v[2])*S,dw(v[3]),dw(v[4]),(v[5]+0.5)*180/NA); u=du(v[6]) or 0
                    ok=g.intersection(site).area>=0.97*g.area and all(g.intersection(h['g']).area<1 for h in s['b']) and (s['pave'] is None or g.intersection(s['pave']).area<0.1*g.area)
                    stats['b'][0]+=ok; stats['b'][1]+=1
                    if ok and tgt and s['un']+u>1.1*tgt and s['b']: s['cur']=[]; close(s,SEC)
                    elif ok:
                        s['b'].append(dict(t=v[0],w=dw(v[3]),d=dw(v[4]),u=du(v[6]),g=g)); s['un']+=u
                        s['seq']+=cur; s['ll']+=s['cl']; s['nt']+=7; s['cur']=[]; s['cl']=0.; s['fails']=0
                    else: fail(s,SEC)
            else:
                if t==EOS: s['cl']+=lp; close(s,EOS); continue
                cur.append(t); s['cl']+=lp
                if len(cur)==6:
                    g=rect(dx(cur[1]-V2['px'][0])*S,dx(cur[2]-V2['py'][0])*S,dw(cur[3]-V2['pw'][0]),dw(cur[4]-V2['pd'][0]),(cur[5]-V2['pa'][0]+0.5)*180/NA)
                    ok=g.intersection(site).area>=0.9*g.area and all(g.intersection(h['g']).area<0.05*g.area for h in s['b']) and all(g.intersection(h).area<0.3*g.area for h in s['prk'])
                    stats['p'][0]+=ok; stats['p'][1]+=1
                    if ok: s['prk'].append(g); s['seq']+=cur; s['ll']+=s['cl']; s['nt']+=6; s['cur']=[]; s['cl']=0.; s['fails']=0
                    else: fail(s,EOS)
    return [dict(b=s['b'],drv=s['drv'],prk=s['prk'],ll=s['ll']/max(s['nt'],1),units=s['un']) for s in st],stats
def civil(e):
    S=e['S']; return dict(b=e['b'],drv=[LineString([(x*S,y*S) for x,y in l]) for l in e['drv']],prk=[p['g'] for p in e['prk']],units=sum(b['u'] or 0 for b in e['b']))
def raw(pl,e):
    out={}
    if not pl['b']: return out
    bu=unary_union([b['g'] for b in pl['b']])
    if pl['drv']:
        dl=unary_union(pl['drv']); out['comp']=len(getattr(unary_union([l.buffer(HW+3) for l in pl['drv']]),'geoms',[0]))
        out['b_drv']=max(b['g'].distance(dl) for b in pl['b'])
        if e['has']: out['d_street']=dl.distance(e['street'])
        if pl['prk']: out['p_drv']=max(p.distance(dl) for p in pl['prk'])
    if pl['prk']:
        pu=unary_union(pl['prk']); out['b_prk']=float(np.percentile([b['g'].distance(pu) for b in pl['b']],90))
    return out
def meas(pl,e):
    bl=pl['b']
    if not bl: return None
    us=[b['u'] for b in bl if b['u']]
    m=dict(nb=len(bl),len=float(np.median([max(b['w'],b['d']) for b in bl])),dep=float(np.median([min(b['w'],b['d']) for b in bl])),cov=sum(b['g'].area for b in bl)/e['site'].area,upb=float(np.mean(us)) if us else None)
    if e['has']: m['setback']=min(b['g'].distance(e['street']) for b in bl)+5
    if pl['prk']: m['park']=unary_union(pl['prk']).area/e['site'].area
    if pl['drv']: m['drv']=sum(l.length for l in pl['drv'])/e['S']
    return m
KEYS=('nb','len','dep','cov','upb','setback','park','drv')
def err(a,b,keys=KEYS):
    v=[abs(math.log(a[k]/b[k])) for k in keys if a.get(k) and b.get(k)]
    return float(np.mean(v)) if v else None
if __name__=='__main__':
    E=pickle.load(open('E2.pkl','rb')); train(E,int(sys.argv[1]),'gen_v2_best.pt')
