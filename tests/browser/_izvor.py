"""Logički izvor aplikacije za Python testove (isto kao tests/js/_izvor.js).

index.html u kojem je svaki marker `/* @izdvojeno static/js/app/X.js */`
zamijenjen sadržajem tog fajla — testovi koji čitaju tekst izvora ne moraju
znati gdje kod fizički živi poslije izdvajanja iz glavnog inline bloka.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_MARKER = re.compile(r'/\* @izdvojeno (static/js/[\w./-]+\.js) \*/')
_ZAGLAVLJE = re.compile(r'^// @izdvojeno-iz index\.html[^\n]*\n')


def _fajl(m):
    rel = m.group(1)
    f = ROOT / rel
    if not f.is_file():
        raise FileNotFoundError('Marker @izdvojeno pokazuje na nepostojeći fajl: ' + rel)
    s = f.read_text(encoding='utf-8')
    if not _ZAGLAVLJE.match(s):
        raise ValueError('Izdvojeni fajl nema zaglavlje: ' + rel)
    s = _ZAGLAVLJE.sub('', s, count=1)
    return s[:-1] if s.endswith('\n') else s


def izvor():
    return _MARKER.sub(_fajl, (ROOT / 'index.html').read_text(encoding='utf-8'))
