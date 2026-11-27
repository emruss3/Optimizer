import json,collections
def f(x):
    try: return float(x)
    except: return None
def arche(s):
    B=[b for b in (s['b'] or []) if (b.get('area') or 0)>=1500]
    if not B: return 'no buildings'
    cov=f(s['cov']) or 0; stv=f(s['st']) or 0
    big=max(B,key=lambda b:b['area'])
    if cov>0.5: return 'block'
    if len(B)==1:
        if (big.get('fill') or 1)<0.75 and stv>=4 and big['area']>20000: return 'wrap'
        a=big.get('angle_to_street'); d=big.get('to_street')
        if a is not None and a>=60 and (d or 999)<=40: return 'street bar'
        return 'single set back'
    perp=[b for b in B if b.get('angle_to_street') is not None and b['angle_to_street']<=30]
    if len(B)<=4 and len(perp)>=0.6*len(B): return 'perpendicular bars'
    if len(B)<=4: return 'few buildings'
    return 'garden campus'
q=lambda v,p: sorted(v)[int(p*(len(v)-1))] if v else None
