"""Cijeli glavni inline blok → static/js/app/glavni.js, SINHRONO na istom mjestu.

Semantika je identična (jedan skript postaje jedan skript, isti redoslijed, isti
globalni opseg); mijenja se samo to da 1,7 MB JS-a više ne putuje unutar
index.html. Mjerenje u APK-u (instrument v3) je pokazalo da se prvi <script>
izvrši tek kad stigne CIJELI HTML, pa svaki bajt HTML-a kasni sve ostalo.
"""
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
REL = 'static/js/app/glavni.js'
html = (ROOT / 'index.html').read_text(encoding='utf-8')
m = max(re.finditer(r'<script>([\s\S]*?)</script>', html), key=lambda m: len(m.group(1)))
assert len(m.group(1)) > 1_000_000, 'glavni blok nije pronađen'
(ROOT / REL).write_text('// @izdvojeno-iz index.html (cijeli glavni inline blok, sinhrono na istom mjestu)\n' + m.group(1) + '\n', encoding='utf-8')
html = html[:m.start()] + '<script src="' + REL + '" data-izdvojeno-blok></script>' + html[m.end():]
(ROOT / 'index.html').write_text(html, encoding='utf-8')
sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
unos = "  './static/js/offline-layer.js',"
sw = sw.replace(unos, unos + "\n  './" + REL + "',", 1)
(ROOT / 'sw.js').write_text(sw, encoding='utf-8')
mf = ROOT / 'android/assets-manifest.json'
spec = json.loads(mf.read_text()); spec['required'].append(REL)
mf.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + '\n')
print('glavni blok', len(m.group(1).encode()) // 1024, 'KB →', REL, '; index.html sada', len(html.encode()) // 1024, 'KB')
