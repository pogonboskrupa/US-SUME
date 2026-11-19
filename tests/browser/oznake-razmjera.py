"""Prikaz oznaka u razmjeri (v4.8.2): fotografije i mjerenja zadano do 1:12 500, KML do 1:50 000.

Stvarni index.html, keširan profil, bez mreže. Zumira se kartom i provjerava da li su sloj
fotografije, sačuvanog mjerenja i KML-a na karti; da korisnikov izbor u Meniju mijenja prag i
preživi ponovno učitavanje; i da isključen KML ne vaskrsne zumiranjem.
"""
import asyncio, json, mimetypes, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
UID = '11111111-1111-4111-8111-111111111111'
PROFIL = json.dumps({'ts': 0, 'data': {'id': UID, 'odobren': True, 'sumarija': 'TEST', 'ime': 'Test', 'prezime': 'Razmjera'}})
OUT = os.environ.get('UI_OUT')
KML = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>A</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16.15,44.90,0 16.16,44.90,0 16.16,44.91,0 16.15,44.90,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>'


async def stanje(page):
    return await page.evaluate("""() => ({ r: _ozrRazmjera,
      foto: map.hasLayer(_locFotos[0].marker), msr: !!_msrSavedLayer && map.hasLayer(_msrSavedLayer),
      kml: map.hasLayer(kmlLs[kmlLs.length-1].grp) })""")


async def zum(page, z):
    await page.evaluate("(z) => { map.setView([44.905, 16.155], z, {animate:false}); }", z)
    await page.wait_for_timeout(150)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
        ctx = await browser.new_context(service_workers='block', viewport={'width': 360, 'height': 740})

        async def route(r):
            url = r.request.url
            if not url.startswith('http://ozr.test/'):
                await r.abort(); return
            f = ROOT / (url.split('ozr.test/', 1)[1].split('?', 1)[0] or 'index.html')
            if f.is_file():
                await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', body=f.read_bytes())
            else:
                await r.fulfill(status=404, body='')
        await ctx.route('**/*', route)
        await ctx.route_web_socket('**/*', lambda ws: ws.close())
        seed = f"localStorage.setItem('tvlake_ol_profile',{json.dumps(PROFIL)});localStorage.setItem('tvlake_device_last_user','{UID}');"
        await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
        await ctx.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');" + seed + "}")
        page = await ctx.new_page()
        greske = []
        page.on('pageerror', lambda e: greske.append(str(e)))
        await page.goto('http://ozr.test/')
        await page.wait_for_function('window._startupTiming', timeout=60000)
        await page.evaluate("""async (kml) => {
          const m = _buildFotoMarker(44.905, 16.155, '', '', 0, 777, true, false);
          _locFotos.push({la:44.905, lo:16.155, ts:777, thumb:'', full:'', marker:m, shared:false, opis:''});
          _msrRegistry.push({id:'mr_t', name:'M', mode:'dist', color:'#fbbf24', pts:[{lat:44.905,lng:16.155},{lat:44.906,lng:16.157}]});
          _msrDrawAllSaved();
          await _localLayerKml('test-razmjera.kml', kml, sbUser.id);
        }""", KML)
        # z16 ≈ 1:10 000 (sve vidljivo), z14 ≈ 1:25 000-ish, z12 ≈ 1:100 000
        oc = {}
        for z in (16, 15, 14, 13, 12, 11):
            await zum(page, z)
            oc[z] = await stanje(page)
        print(oc)
        for z, s in oc.items():
            assert s['foto'] == (s['r'] <= 12500), ('foto', z, s)
            assert s['msr'] == (s['r'] <= 12500), ('msr', z, s)
            assert s['kml'] == (s['r'] <= 50000), ('kml', z, s)
        assert any(not s['foto'] for s in oc.values()) and any(s['foto'] for s in oc.values())
        assert any(s['kml'] and not s['foto'] for s in oc.values()), 'postoji razmjera gdje se KML vidi a foto ne'
        # isključen KML ne vaskrsava zumiranjem
        await zum(page, 11)
        await page.evaluate("togK(kmlLs.length-1)")   # vis -> false (bio zoom-sakriven)
        await zum(page, 16)
        assert not (await stanje(page))['kml'], 'isključen KML se ne vraća zumiranjem'
        await page.evaluate("togK(kmlLs.length-1)")
        assert (await stanje(page))['kml']
        # uključivanje dok je sitna razmjera: ne crta se, ali se pojavi čim se zumira bliže
        await page.evaluate("togK(kmlLs.length-1)")
        await zum(page, 11)
        await page.evaluate("togK(kmlLs.length-1)")
        assert not (await stanje(page))['kml']
        await zum(page, 16)
        assert (await stanje(page))['kml'], 'uključen pri sitnoj razmjeri pojavi se pri krupnijoj'
        # Meni: promjena praga za fotografije na "Uvijek" i za KML na 1:12 500
        await page.evaluate("ozrOtvori()")
        await page.wait_for_selector('#ozr-bg .ozr-sh')
        assert await page.locator('#ozr-bg .ozr-red').count() == 3
        m = await page.evaluate("""() => ({ over: document.documentElement.scrollWidth - innerWidth,
          mete: [...document.querySelectorAll('#ozr-bg button')].filter(b => b.getBoundingClientRect().height < 44).length })""")
        assert m['over'] <= 1 and m['mete'] == 0, m
        await page.click('#ozr-bg button[data-k="foto"][data-v="0"]')
        await page.click('#ozr-bg button[data-k="kml"][data-v="12500"]')
        if OUT:
            await page.screenshot(path=f'{OUT}/ozr.png')
        assert await page.locator('#ozr-bg button[data-k="foto"][data-v="0"][aria-pressed=true]').count() == 1
        await zum(page, 13)
        s = await stanje(page)
        assert s['foto'] and not s['kml'] and not s['msr'], s
        assert json.loads(await page.evaluate("localStorage.getItem('tvlake_oznake_razmjera_v1')")) == {'foto': 0, 'msr': 12500, 'kml': 12500}
        await page.click('#ozr-bg .ozr-zad')
        s = await stanje(page)
        assert not s['foto'] and s['kml'], ('vrati zadano', s)
        await page.click('#ozr-bg .ozr-x')
        # meni stavka je prije "Stil linija"
        html = await page.evaluate("document.getElementById('menu-dropdown').innerHTML")
        assert 0 <= html.index('Prikaz oznaka u razmjeri') < html.index('Stil linija')
        await browser.close()
        assert not greske, greske
        print('OK prikaz oznaka u razmjeri')

asyncio.run(main())
