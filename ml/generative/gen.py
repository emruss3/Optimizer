import math, sys, json, random, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from data import *
torch.manual_seed(0); random.seed(0); np.random.seed(0); torch.set_num_threads(2)
D=128; MAXL=720
class Gen(nn.Module):
    def __init__(s,d=D,L=4,H=4,p=0.2):
        super().__init__()
        s.tok=nn.Embedding(VOCAB,d); s.pos=nn.Embedding(MAXL,d); s.fld=nn.Embedding(8,d)
        s.c=nn.Sequential(nn.Linear(8,d),nn.GELU(),nn.Linear(d,d)); s.bp=nn.Linear(2,d); s.be=nn.Embedding(NE,d); s.bpos=nn.Embedding(NB,d)
        l=nn.TransformerEncoderLayer(d,H,4*d,p,batch_first=True,norm_first=True,activation='gelu'); s.tr=nn.TransformerEncoder(l,L)
        s.ln=nn.LayerNorm(d); s.out=nn.Linear(d,VOCAB); s.drop=nn.Dropout(p)
    def forward(s,c,bp,x):
        B,T=x.shape; ar=torch.arange(T)
        pre=torch.cat([s.c(c)[:,None],s.bp(bp[:,:,:2])+s.be(bp[:,:,2].long())+s.bpos(torch.arange(NB))[None]],1)
        h=s.tok(x)+s.pos(ar)[None]+s.fld(((ar-1)%7).clamp(min=0)+ (ar>0).long())[None]
        h=s.drop(torch.cat([pre,h],1)); n=h.shape[1]
        m=torch.triu(torch.ones(n,n,dtype=torch.bool),1)
        return s.out(s.ln(s.tr(h,mask=m)))[:,1+NB:]
def batch(es,aug):
    C=[];BP=[];X=[]
    for e in es:
        mir=aug and random.random()<0.5
        b=bpts(e,mir)
        if aug: b=np.roll(b,random.randrange(NB),0)
        u=e['units']
        if aug and u: u=u*math.exp(random.gauss(0,0.05))
        C.append(cond(e,u)); BP.append(b); X.append(toks(e['b'],mir))
    T=max(len(x) for x in X); X=[x+[PAD]*(T-len(x)) for x in X]
    return torch.tensor(np.array(C)),torch.tensor(np.array(BP)),torch.tensor(X)
def loss_of(m,es,aug):
    c,bp,x=batch(es,aug); lg=m(c,bp,x[:,:-1])
    return F.cross_entropy(lg.reshape(-1,VOCAB),x[:,1:].reshape(-1),ignore_index=PAD,label_smoothing=0.05 if aug else 0.)
def train(E,epochs=300):
    tr=[e for e in E if e['split']=='train' and not isval(e['pid'])]; va=[e for e in E if e['split']=='train' and isval(e['pid'])]
    m=Gen(); opt=torch.optim.AdamW(m.parameters(),3e-4,weight_decay=0.05); best=(9,None)
    for ep in range(epochs):
        m.train(); random.shuffle(tr)
        for i in range(0,len(tr),12):
            opt.zero_grad(); l=loss_of(m,tr[i:i+12],True); l.backward(); nn.utils.clip_grad_norm_(m.parameters(),1.); opt.step()
        if ep%10==9:
            m.eval()
            with torch.no_grad(): v=np.mean([loss_of(m,va[i:i+11],False).item() for i in range(0,len(va),11)])
            if v<best[0]: best=(v,{k:t.clone() for k,t in m.state_dict().items()}); torch.save(best[1],'gen_v1_best.pt')
            print(ep+1,round(l.item(),3),round(float(v),3),flush=True)
    m.load_state_dict(best[1]); print('best val',best[0]); return m
def fmask(k):
    mk=torch.full((VOCAB,),-1e9); o,n=OFF[k]; mk[o:o+n]=0
    if k=='t': mk[EOS]=0
    return mk
MASK={k:fmask(k) for k in FIELDS}
@torch.no_grad()
def sample(m,e,N=16,temp=0.9,units=None,tries=25,constrain=True):
    m.eval(); S=e['S']; site=e['site']; tgt=units or e['units']
    c=torch.tensor(cond(e,tgt))[None].repeat(N,1); bp=torch.tensor(bpts(e))[None].repeat(N,1,1)
    seqs=[[BOS] for _ in range(N)]; geoms=[[] for _ in range(N)]; ll=[0.]*N; done=[False]*N; fails=[0]*N; un=[0]*N
    raw_ok=raw_n=0
    while not all(done):
        act=[i for i in range(N) if not done[i]]; new=[[] for _ in act]; lp=[0.]*len(act)
        for k in FIELDS:
            xs=[seqs[i]+new[j] for j,i in enumerate(act)]; T=max(map(len,xs))
            x=torch.tensor([s+[PAD]*(T-len(s)) for s in xs])
            lg=m(c[:len(act)],bp[:len(act)],x)
            for j in range(len(act)):
                if new[j] and new[j][0]==EOS: continue
                z=lg[j,len(xs[j])-1]/temp+MASK[k]; pr=torch.log_softmax(z,-1); t=torch.multinomial(pr.exp(),1).item()
                new[j].append(t); lp[j]+=pr[t].item()
        for j,i in enumerate(act):
            nb=new[j]
            if nb[0]==EOS or len(seqs[i])+8>MAXL-1: seqs[i].append(EOS); done[i]=True; continue
            v=[nb[q]-OFF[k][0] for q,k in enumerate(FIELDS)]
            g=rect(dx(v[1])*S,dx(v[2])*S,dw(v[3]),dw(v[4]),(v[5]+0.5)*180/NA); u=du(v[6]) or 0
            ok=g.intersection(site).area>=0.97*g.area and all(g.intersection(h).area<1 for h in geoms[i])
            raw_n+=1; raw_ok+=ok
            if ok or not constrain:
                if constrain and tgt and un[i]+u>1.1*tgt and geoms[i]: seqs[i].append(EOS); done[i]=True; continue
                seqs[i]+=nb; geoms[i].append(g); ll[i]+=lp[j]; un[i]+=u; fails[i]=0
            else:
                fails[i]+=1
                if fails[i]>=tries: seqs[i].append(EOS); done[i]=True
    out=[]
    for i in range(N):
        bl=[]; s=seqs[i][1:-1]
        for q in range(0,len(s),7):
            v=[s[q+r]-OFF[k][0] for r,k in enumerate(FIELDS)]
            bl.append(dict(t=v[0],w=dw(v[3]),d=dw(v[4]),u=du(v[6]),g=geoms[i][q//7]))
        out.append(dict(b=bl,ll=ll[i]/max(len(s),1),units=un[i]))
    return out,raw_ok,raw_n
def measures(bl,e):
    if not bl: return None
    L=[max(b['w'],b['d']) for b in bl]; Dp=[min(b['w'],b['d']) for b in bl]; us=[b['u'] for b in bl if b['u']]
    m=dict(nb=len(bl),len=float(np.median(L)),dep=float(np.median(Dp)),cov=sum(b['g'].area for b in bl)/e['site'].area,upb=float(np.mean(us)) if us else None)
    if e['has']:
        st=e['street']; m['setback']=min(b['g'].distance(st) for b in bl)+5
        m['units']=sum(us)
    return m
def err(a,b,keys=('nb','len','dep','cov','upb','setback')):
    v=[abs(math.log(a[k]/b[k])) for k in keys if a.get(k) and b.get(k)]
    return float(np.mean(v)) if v else None
def pick(samples,tgt):
    s=[x for x in samples if x['b']] or samples
    return min(s,key=lambda x:(round(abs(math.log(max(x['units'],1)/tgt)),1) if tgt else 0,-x['ll']))
if __name__=='__main__':
    E=load()
    m=train(E,int(sys.argv[1]) if len(sys.argv)>1 else 300); torch.save(m.state_dict(),'gen_v1.pt')
