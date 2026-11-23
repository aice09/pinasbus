# Downloads one freely licensed photo per destination region from Wikimedia Commons and records attribution.
# Usage: python3 -I scripts/fetch_places.py public/places data/places.json
import json, sys, urllib.parse, urllib.request, re, html
OUT, META = sys.argv[1], sys.argv[2]
UA = {'User-Agent': 'PINASBUS-demo/1.0 (https://pinasbus.phlopentech.org)'}
QUERIES = {
  'ilocos': 'Bangui wind farm Ilocos Norte', 'vigan': 'Calle Crisologo Vigan', 'albay': 'Mayon Volcano Albay', 'camarines-sur': 'Caramoan islands',
  'sorsogon': 'Bulusan volcano Sorsogon', 'catanduanes': 'Binurong Point Catanduanes', 'masbate': 'Masbate island beach', 'baguio': 'Baguio City panorama',
  'pangasinan': 'Hundred Islands Alaminos', 'zambales': 'Anawangin Cove Zambales', 'cagayan': 'Palaui Island Cagayan', 'central-luzon': 'Mount Arayat Pampanga',
  'leyte': 'San Juanico Bridge', 'metro-manila': 'Makati skyline night', 'laguna': 'Mount Makiling Laguna', 'default': 'Philippine countryside rice fields mountains',
}
OK = re.compile(r'^(CC BY(-SA)? [0-9.]+|CC0|Public domain|CC BY-SA [0-9.]+ .*|CC BY [0-9.]+ .*)$', re.I)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read()
meta = {}
for key, query in QUERIES.items():
    api = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': f'{query} filetype:bitmap',
        'gsrnamespace': 6, 'gsrlimit': 12, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 1800})
    pages = sorted(json.loads(get(api)).get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata', {})
        lic = em.get('LicenseShortName', {}).get('value', '')
        if not OK.match(lic) or ii.get('width', 0) < 1600 or ii.get('width', 0) < ii.get('height', 0): continue
        data = get(ii['thumburl'])
        if not data.startswith(b'\xff\xd8'): continue  # JPEG only
        open(f'{OUT}/{key}.jpg', 'wb').write(data)
        artist = re.sub('<[^>]+>', '', html.unescape(em.get('Artist', {}).get('value', 'Unknown'))).strip()
        meta[key] = {'title': p['title'].removeprefix('File:'), 'author': artist[:80], 'license': lic, 'licenseUrl': em.get('LicenseUrl', {}).get('value', ''), 'source': ii.get('descriptionurl', '')}
        print(key, '->', p['title'][:60], '|', lic, '|', len(data)//1024, 'KB'); break
    else: print(key, '-> NOT FOUND')
json.dump(meta, open(META, 'w'), indent=1, ensure_ascii=False)
