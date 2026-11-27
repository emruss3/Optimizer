import json, base64, html
S=json.load(open('sheets.json')); by={}
for x in S: by.setdefault(x['sid'],[]).append(x)
LAB={'civil':("1. What the civil got approved","The real plan for this site, traced from the approved SP drawing. This is the answer the model is judged against."),
     'pretrained':("2. What the pretrained model drew","Same site and unit count, first try. It never saw the plan above."),
     'nearest':("3. The closest approved plan in the training set","A different site. This is what the lookup control answers with: the most similar plan we already have.")}
out=[]
for sid,xs in by.items():
    x=xs[0]
    out.append('<section><header><h2>%s, %.1f acres, %d units</h2><p class="tag %s">Model scored %s than the lookup: %.2f against %.2f</p></header>'%(x['typ'],x['ac'],x['tgt'],x['verdict'],x['verdict'],x['e1'],x['l1']))
    for y in xs:
        svg=open('svg/%s_%s.svg'%(sid,y['kind']),'rb').read()
        t,d=LAB[y['kind']]; dd=y['title']['data']
        facts=' · '.join('%s %s'%(a['label'].lower(),a['value']) for a in dd[:3])
        out.append('<figure><figcaption><b>%s</b><span>%s</span><span class="n">%s · %s</span></figcaption><img alt="%s" src="data:image/svg+xml;base64,%s"></figure>'%(t,d,html.escape(y['title']['project'].strip()),facts,html.escape(t),base64.b64encode(svg).decode()))
    out.append('</section>')
tpl=open('page2_tpl.html').read().replace('{{SECTIONS}}','\n'.join(out))
open('sheets.html','w').write(tpl); print(len(tpl))
