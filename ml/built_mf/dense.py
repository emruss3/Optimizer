import json,sys,base64,io
sys.path.insert(0,'/home/claude/linecls'); from util import load_rows
from PIL import Image, ImageDraw
src,batch=sys.argv[1],int(sys.argv[2])
J=load_rows(src)[0]['j']; J=json.loads(J) if isinstance(J,str) else J
items=J['items']; S=150
order=[it['id'] for it in items]; json.dump(order,open(f'thumbs/b{batch}.json','w'))
for part in range(0,len(items),20):
    sub=items[part:part+20]
    W=Image.new('RGB',(4*(2*S+14),5*(S+18)),'white'); d=ImageDraw.Draw(W)
    for i,it in enumerate(sub):
        x=(i%4)*(2*S+14); y=(i//4)*(S+18)
        for j,yr in enumerate(('2010','2026')):
            b=it['jpg'].get(yr)
            im=Image.open(io.BytesIO(base64.b64decode(b))).convert('RGB') if b else Image.new('RGB',(S,S),'grey')
            im.thumbnail((S,S)); W.paste(im,(x+j*(S+2),y+16))
        d.text((x+2,y+2),f"#{part+i}  (2010 | 2026)",fill='black')
    W.save(f'thumbs/b{batch}_{part//20}.jpg',quality=80)
print(len(items))
