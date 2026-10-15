import json, re, os
import numpy as np
from PIL import Image, ImageDraw
ROOT='/workspace/cpn-v2'
src=open(ROOT+'/hero-rigs.js').read()
rigs={}
cur=None
for line in src.split('\n'):
    m=re.match(r"\s+(\w+): \{$",line)
    if m: cur=m.group(1); rigs[cur]={}; continue
    m=re.match(r"\s+(\w+): \{ file: '([\w.]+)', w: (\d+), h: (\d+), px: (\d+), py: (\d+), parent: (?:'(\w+)'|null), ax: (\d+), ay: (\d+)(?:, grip: (-?\d+))?",line)
    if m and cur:
        n,f,w,h,px,py,par,ax,ay,g=m.groups()
        rigs[cur][n]=dict(file=f,w=int(w),h=int(h),px=int(px),py=int(py),parent=par,ax=int(ax),ay=int(ay),grip=int(g) if g else None)
stats={}
S=4
for hero,parts in rigs.items():
    stats[hero]={}
    front=[n for n in parts if not n.endswith('_b')]
    ims=[]
    for n in front:
        p=parts[n]; im=Image.open(f"{ROOT}/assets/heroes/{hero}/{p['file']}").convert('RGBA'); a=np.asarray(im)[...,3]
        ys,xs=np.nonzero(a>=128)
        st=dict(size=im.size, mode=Image.open(f"{ROOT}/assets/heroes/{hero}/{p['file']}").mode,
            opaque_px=int((a>=250).sum()), partial_px=int(((a>0)&(a<250)).sum()), total=int(a.size),
            bbox=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())] if len(xs) else None,
            pivot=[p['px'],p['py']], pivot_alpha=int(a[min(p['py'],a.shape[0]-1),min(p['px'],a.shape[1]-1)]),
            components=None)
        from scipy import ndimage
        lab,nc=ndimage.label(a>=64); st['components']=int(nc)
        # child attach points that land in this image
        kids={k:[q['ax'],q['ay']] for k,q in parts.items() if q['parent']==n}
        st['child_attach']={k:[v[0],v[1], int(a[min(v[1],a.shape[0]-1),min(v[0],a.shape[1]-1)])] for k,v in kids.items()}
        stats[hero][n]=st
        # magnified panel on checker
        W,H=im.size
        bg=Image.new('RGBA',(W*S,H*S))
        d=ImageDraw.Draw(bg)
        for y in range(0,H*S,8):
            for x in range(0,W*S,8):
                d.rectangle([x,y,x+7,y+7],fill=(200,200,200,255) if (x//8+y//8)%2 else (150,150,150,255))
        bg.alpha_composite(im.resize((W*S,H*S),Image.NEAREST))
        d=ImageDraw.Draw(bg)
        cx,cy=p['px']*S+S//2,p['py']*S+S//2
        d.ellipse([cx-5,cy-5,cx+5,cy+5],outline=(255,0,0,255),width=2)
        for k,(x,y,_) in st['child_attach'].items():
            x,y=x*S+S//2,y*S+S//2
            d.rectangle([x-4,y-4,x+4,y+4],outline=(0,90,255,255),width=2)
        if n=='shin' and hero in SOLES:
            for (x,y) in SOLES[hero]:
                x,y=x*S+S//2,y*S+S//2; d.line([x-5,y,x+5,y],fill=(0,200,0,255),width=2); d.line([x,y-5,x,y+5],fill=(0,200,0,255),width=2)
        ims.append((n,bg,st))
    # compose
    pad=20; Wt=sum(b.size[0] for _,b,_ in ims)+pad*(len(ims)+1); Ht=max(b.size[1] for _,b,_ in ims)+70
    sheet=Image.new('RGBA',(Wt,Ht),(23,27,43,255)); d=ImageDraw.Draw(sheet)
    d.text((pad,6),f"{hero}: source part PNGs at 4x nearest (red=pivot, blue=child attach, green=SOLES heel/toe)",fill=(255,255,255,255))
    x=pad
    for n,b,st in ims:
        sheet.alpha_composite(b,(x,40)); d.text((x,24),f"{n} {st['size'][0]}x{st['size'][1]}",fill=(220,230,255,255)); x+=b.size[0]+pad
    sheet.save(f"/tmp/hv2/parts/{hero}_parts_4x.png")
json.dump(stats,open('/tmp/hv2/parts/part-stats.json','w'),indent=1)
print(json.dumps({h:{n:[s['size'],s['partial_px'],s['components'],s['pivot_alpha'],s['bbox']] for n,s in v.items()} for h,v in stats.items()}))
