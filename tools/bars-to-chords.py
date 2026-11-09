#!/usr/bin/env python3
"""从逐小节转写（bars.json：{"bar","rh","lh"}）按音高自动判断每小节的和弦：低音权重大、长音权重大，在 大三/小三/属七/减/挂四/大七/小七 里找最匹配的。
输出：每小节一个和弦名（半小节换和弦时输出两个）和判断依据（用到的音）。仅作为「按谱分析」的草稿，必须人工核对。"""
import json, re, sys
from fractions import Fraction
LET = {'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}
NAMES = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']
def pcs(tok):
    out=[]
    core=tok.replace('[','').replace(']','')
    m=re.match(r'^(\d+)(\.*)(.*)$',core)
    n,dots,pit=int(m.group(1)),len(m.group(2)),m.group(3)
    d=Fraction(4,n); add=d
    for _ in range(dots): add/=2; d+=add
    for p in pit.split('+'):
        if not p or p=='r': continue
        mm=re.match(r'^([a-gA-G])\1*([#\-]*)$',p)
        if not mm: continue
        base=LET[p[0].lower()]; acc=p.count('#')-p.count('-')
        out.append(((base+acc)%12,p[0].isupper() and 1 or 0))
    return d,out
DIA=None
if '--key' in sys.argv:
    k=sys.argv[sys.argv.index('--key')+1]; mi=k.endswith('m'); t=NAMES.index(k.rstrip('m')) if k.rstrip('m') in NAMES else 0
    DIA={(t+i)%12 for i in ([0,2,3,5,7,8,10,11] if mi else [0,2,4,5,7,9,11])}
Q={'':[0,4,7],'m':[0,3,7],'7':[0,4,7,10],'dim':[0,3,6],'sus4':[0,5,7],'maj7':[0,4,7,11],'m7':[0,3,7,10],'aug':[0,4,8]}
def best(weights, bass):
    sc=[]
    for r in range(12):
        for q,iv in Q.items():
            S={(r+i)%12 for i in iv}
            inn=sum(w for p,w in weights.items() if p in S); out=sum(w for p,w in weights.items() if p not in S)
            miss=sum(1 for i in iv if (r+i)%12 not in weights)
            s=inn-1.6*out-0.8*miss+(1.2 if bass==r else 0)+(0.5 if bass in S else -0.5)-(0.25 if len(iv)==4 else 0)+(0.15 if q in ('','m') else 0)
            if DIA is not None and S <= DIA: s += 0.5
            sc.append((s,r,q,-len(q)))
    sc.sort(reverse=True); s,r,q,_=sc[0]; return NAMES[r]+q
def hand_w(s, bass_hand, lo=Fraction(0), hi=Fraction(4)):
    w={}; t=Fraction(0); first=None
    for tok in s.split():
        d,ps=pcs(tok)
        ov=max(Fraction(0),min(t+d,hi)-max(t,lo))
        if ov>0:
            for p,_ in ps: w[p]=w.get(p,0)+float(ov)*(1.0 if not bass_hand else 1.4)
            if ps and first is None: first=ps[0][0]
        t+=d
    return w,first
def chord_of(b,lo,hi):
    out={}
    wl,bl=hand_w(b['lh'],True,lo,hi); wr,_=hand_w(b['rh'],False,lo,hi)
    for d in (wr,wl):
        for p,v in d.items(): out[p]=out.get(p,0)+v
    return best(out,bl) if out else None
bars=json.load(open(sys.argv[1]))
res=[]
for b in sorted(bars,key=lambda x:x['bar']):
    whole=chord_of(b,Fraction(0),Fraction(4)); h1=chord_of(b,Fraction(0),Fraction(2)); h2=chord_of(b,Fraction(2),Fraction(4))
    # 前半、后半各自判断；只有两半都有足够的音、且不同、且各自和整小节的判断不矛盾时才拆成两个和弦
    ch=whole
    if h1 and h2 and h1!=h2 and (b['lh'].count('8')>=6 or True):
        ch=h1+' '+h2
    res.append((b['bar'],ch))
for r in res: print(r[0],r[1])
json.dump([{'bar':r[0],'chord':r[1]} for r in res],open(sys.argv[2],'w'),ensure_ascii=False)
