"""Priprema web assets i provjera stvarnog APK ZIP sadržaja (Python standardna biblioteka)."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile


def sources(root):
    spec = json.loads((root / 'android/assets-manifest.json').read_text())
    for name in spec['files'] + spec['required']:
        p = root / name
        if not p.is_file() or not p.stat().st_size:
            raise ValueError('Nedostaje ili je prazan obavezni fajl: ' + name)
    patterns = [('index.html', r"APP_VER\s*=\s*'v([0-9.]+)'"),
                ('sw.js', r"APP_VERSION\s*=\s*'([0-9.]+)'"),
                ('android/app/build.gradle', r'versionName\s+"([0-9.]+)"')]
    versions = []
    for name, pattern in patterns:
        match = re.search(pattern, (root / name).read_text(encoding='utf-8-sig'))
        if not match:
            raise ValueError('Nije pronađena verzija: ' + name)
        versions.append(match[1])
    if len(set(versions)) != 1:
        raise ValueError('Verzije web/SW/Android se ne poklapaju: ' + ', '.join(versions))
    names = set(spec['files'])
    for directory in spec['directories']:
        base = root / directory
        if base.exists():
            names.update(p.relative_to(root).as_posix() for p in base.rglob('*') if p.is_file())
    return sorted(names)


def prepare(root, output):
    names = sources(root)  # Validacija prije diranja postojećeg sadržaja.
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='assets-stage-', dir=output.parent) as stage:
        stage = Path(stage)
        for name in names:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / name, target)
        if output.exists():
            shutil.rmtree(output)
        stage.rename(output)
    return len(names)


def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(chunk)
    return h.digest()


def verify(root, apk):
    names = sources(root)
    with zipfile.ZipFile(apk) as z:
        entries = z.namelist()
        for name in names:
            entry = 'assets/' + name
            if entries.count(entry) != 1:
                raise ValueError('Nedostaje ili je dupliran APK fajl: ' + entry)
            with (root / name).open('rb') as src, z.open(entry) as packed:
                if digest(src) != digest(packed):
                    raise ValueError('Zastarjeli ili izmijenjeni APK fajl: ' + entry)
    return len(names)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'verify'])
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--apk', type=Path)
    args = parser.parse_args()
    try:
        root = args.root.resolve()
        if args.action == 'verify':
            if not args.apk:
                parser.error('verify zahtijeva --apk')
            count = verify(root, args.apk)
        else:
            count = prepare(root, root / 'android/app/src/main/assets')
        print(f'OK: {args.action}, {count} fajlova')
    except (OSError, ValueError, zipfile.BadZipFile, KeyError) as exc:
        parser.exit(1, f'GREŠKA: {exc}\n')
