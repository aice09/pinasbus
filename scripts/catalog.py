import json,re,sys
d=json.load(open(sys.argv[1]))
fmap={'Naga':'Naga CBD','MasbateCity':'Masbate City','res_Masbate':'Gubat','res_Lagonoy':'Lagonoy','res_Virac':'Virac'}
MNL={'EDSA Cubao','Alabang','Turbina','PITX','Arcovia Pasig','Avenida','Ermita','Aurora Cubao','Alabang Starmall'}
def t24(s):
    h,m=int(s[:2]),int(s[3:5]); ap=s[5:]
    if ap=='pm' and h!=12: h+=12
    if ap=='am' and h==12: h=0
    return f'{h:02d}:{m:02d}'
trips={}
for r in d:
    code=r['title'].split('Trip ')[-1].strip()
    a,b=[x.strip() for x in r['route'].replace(' (additional fare applies)','').split(' - ',1)]
    base=re.sub(r'^(r3/|)','',r['file'][:-5]); dest=fmap.get(base,base)
    south=a in MNL
    key=(code,'S' if south else 'N')
    t=trips.setdefault(key,dict(code=code,dir='south' if south else 'north',bus=r['bus'].split(' (')[0].strip(),fare=int(r['fare']),pickups={},dropoffs=set()))
    if south:
        t['pickups'][a]=t24(r['time']); t['dropoffs'].add(dest)
    else:
        t['pickups'][a]=t24(r['time']); t['dropoffs'].add(b)
    t['fare']=max(t['fare'],int(r['fare']))
out=[]
for (c,dr),t in sorted(trips.items()):
    t['pickups']=[{'station':k,'time':v} for k,v in sorted(t['pickups'].items(),key=lambda x:x[1])]
    t['dropoffs']=sorted(t['dropoffs'])
    t['id']=(c+'-'+dr).lower()
    out.append(t)
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
for t in out: print(t['id'],t['bus'],t['fare'],[p['station']+'@'+p['time'] for p in t['pickups']],'->',t['dropoffs'])
