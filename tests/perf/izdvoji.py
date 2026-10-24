"""Mehaničko izdvajanje raspona linija glavnog inline bloka u defer skriptu.

Upotreba: python3 tests/perf/izdvoji.py <prvaLinija> <zadnjaLinija> <static/js/app/ime.js> "<opis>"

Kod se izrezuje DOSLOVNO (bajt-identično), na njegovom mjestu ostaje marker
`/* @izdvojeno <fajl> */` (tests/js/_izvor.js ga vraća za testove), a fajl dobija
<script defer> odmah iza glavnog bloka, unos u sw.js APP_SHELL i u
android/assets-manifest.json required. Prije izdvajanja OBAVEZNO:
node tests/perf/split-analiza.cjs <prvaLinija> <zadnjaLinija>
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
a, b, rel, opis = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
assert re.fullmatch(r'static/js/app/[\w-]+\.js', rel), rel

# Analiza sigurnosti je obavezna: bez nje bi pogrešan raspon (npr. pomjerene
# linije) tiho izrezao kod koji se koristi tokom parsiranja.
import subprocess
an = subprocess.run(['node', str(ROOT / 'tests/perf/split-analiza.cjs'), str(a), str(b)], capture_output=True, text=True)
print(an.stdout.strip())
if an.returncode != 0:
    sys.exit('ODBIJENO: split-analiza nije čista (rc=%d)\n%s' % (an.returncode, an.stderr))

html = (ROOT / 'index.html').read_text(encoding='utf-8')
lines = html.split('\n')
dio = lines[a - 1:b]
assert dio, 'prazan raspon'
cilj = ROOT / rel
assert not cilj.exists(), rel + ' već postoji'
cilj.parent.mkdir(parents=True, exist_ok=True)
cilj.write_text('// @izdvojeno-iz index.html (glavni inline blok) — ' + opis + '\n' + '\n'.join(dio) + '\n', encoding='utf-8')
lines[a - 1:b] = ['/* @izdvojeno ' + rel + ' */']
html = '\n'.join(lines)

# <script defer> odmah iza glavnog (najvećeg) inline bloka: defer se izvršava
# poslije cijelog parsiranja, redom kojim su tagovi u dokumentu.
blokovi = list(re.finditer(r'<script>([\s\S]*?)</script>', html))
glavni = max(blokovi, key=lambda m: len(m.group(1)))
kraj = glavni.end()
tag = '\n<script src="' + rel + '" defer></script>'
# Ako već postoje izdvojeni defer tagovi, novi ide iza zadnjeg (zadržava redoslijed).
while html.startswith('\n<script src="static/js/app/', kraj):
    kraj = html.index('</script>', kraj) + len('</script>')
html = html[:kraj] + tag + html[kraj:]
(ROOT / 'index.html').write_text(html, encoding='utf-8')

sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
unos = "  './static/js/offline-layer.js',"
assert unos in sw
sw = sw.replace(unos, unos + "\n  './" + rel + "',", 1)
(ROOT / 'sw.js').write_text(sw, encoding='utf-8')

mf = ROOT / 'android/assets-manifest.json'
spec = json.loads(mf.read_text())
spec['required'].append(rel)
mf.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + '\n')
print('izdvojeno', len(dio), 'linija,', sum(len(l) + 1 for l in dio), 'B →', rel)
