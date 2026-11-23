import re, sys, json, html
out=[]
for f in sys.argv[1:]:
    s=open(f,encoding='utf-8',errors='ignore').read()
    for card in s.split('<div class="card border-0 rounded-4 mb-4">')[1:]:
        t=lambda c: (m:=re.search(r'class="'+c+r'[^"]*"[^>]*>\s*(.*?)\s*</span>',card,re.S)) and html.unescape(re.sub(r'\s+',' ',m.group(1))).strip()
        fare=re.search(r'data-adults-fare="([\d.]+)"',card)
        if not fare: continue
        g=lambda a:(m:=re.search(r'data-'+a+r'="([^"]*)"',card)) and m.group(1)
        out.append(dict(file=f,title=t('trip-list-main-text'),bus=t('trip-list-sub-text'),route=t('trip-list-sup-text'),time=t('trip-list-time'),left=t('trip-list-passenger-left'),fare=fare.group(1),fee=g('convenience-fee'),frm=g('from-id'),to=g('to-id')))
print(json.dumps(out,indent=0,ensure_ascii=False))
