import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assets', REPO / 'android/assets.py')
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

class AssetsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.output = self.root / 'android/app/src/main/assets'
        self.spec = json.loads((REPO / 'android/assets-manifest.json').read_text())
        self.put('android/assets-manifest.json', json.dumps(self.spec))
        for name in self.spec['files'] + self.spec['required']:
            self.put(name, 'fixture ' + name)
        self.put('index.html', "const APP_VER = 'v2.0.2';")
        self.put('sw.js', "const APP_VERSION = '2.0.2';")
        self.put('android/app/build.gradle', 'versionName "2.0.2"')
        self.put('static/extra.dat', 'additional asset')

    def put(self, name, value):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(value)

    def apk(self, stale=None, missing=None):
        p = self.root / 'fixture.apk'
        with zipfile.ZipFile(p, 'w') as z:
            for name in assets.sources(self.root):
                if name == missing:
                    continue
                z.writestr('assets/' + name, b'stale' if name == stale else (self.root / name).read_bytes())
        return p

    def test_prepare_replaces_stale_removes_obsolete(self):
        self.put('android/app/src/main/assets/obsolete.js', 'old')
        assets.prepare(self.root, self.output)
        self.assertFalse((self.output / 'obsolete.js').exists())
        self.assertEqual((self.output / 'static/extra.dat').read_text(), 'additional asset')
        self.assertEqual((self.output / 'index.html').read_bytes(), (self.root / 'index.html').read_bytes())

    def test_missing_required_keeps_previous_output(self):
        self.put('android/app/src/main/assets/sentinel', 'previous')
        (self.root / 'static/js/offline-layer.js').unlink()
        with self.assertRaises(ValueError): assets.prepare(self.root, self.output)
        self.assertTrue((self.output / 'sentinel').exists())

    def test_version_mismatch_fails(self):
        self.put('sw.js', "const APP_VERSION = '1.0.0';")
        with self.assertRaises(ValueError): assets.prepare(self.root, self.output)

    def test_valid_apk(self):
        self.assertGreater(assets.verify(self.root, self.apk()), 0)

    def test_stale_same_version_js_fails(self):
        with self.assertRaisesRegex(ValueError, 'Zastarjeli'):
            assets.verify(self.root, self.apk(stale='static/js/offline-layer.js'))

    def test_missing_wasm_fails(self):
        with self.assertRaisesRegex(ValueError, 'Nedostaje'):
            assets.verify(self.root, self.apk(missing='static/libs/sql-wasm.wasm'))

if __name__ == '__main__': unittest.main()
