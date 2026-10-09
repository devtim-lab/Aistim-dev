#!/usr/bin/env python3
"""Bangun ZIP untuk Chrome Web Store dari manifest.json repo ini.

Beda dengan ZIP biasa (jalur "Load unpacked"/CRX):
  - buang "key" dan "update_url" (Web Store memakai kunci & mekanisme update sendiri -> update otomatis)
  - host/izin dipersempit: hanya Erzap (+ partdistro untuk jembatan fetch, + GitHub untuk sinkronisasi script)

Pemakaian: python3 tools/build-store.py [folder_output]
Hasil    : <folder_output>/Aistim-dev-store-<versi>.zip   (manifest.json di root zip)
"""
import json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else ROOT
ERZAP = 'https://*.erzap.com/*'
HOSTS = [ERZAP, 'https://partdistro.com/*', 'https://raw.githubusercontent.com/*', 'https://api.github.com/*']

m = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
for k in ('key', 'update_url'):
    m.pop(k, None)
m['host_permissions'] = HOSTS
for cs in m.get('content_scripts', []):
    cs['matches'] = [ERZAP]
for war in m.get('web_accessible_resources', []):
    war['matches'] = [ERZAP]

assert 'key' not in m and 'update_url' not in m
assert '<all_urls>' not in json.dumps(m), 'masih ada <all_urls>'

zpath = os.path.join(OUT, 'Aistim-dev-store-%s.zip' % m['version'])
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(m, indent=2, ensure_ascii=False) + '\n')
    for d in ('background', 'content', 'popup', 'icons', 'scripts'):
        for base, _, files in os.walk(os.path.join(ROOT, d)):
            for f in sorted(files):
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, ROOT))
print(zpath)
