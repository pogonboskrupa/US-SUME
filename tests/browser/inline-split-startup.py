"""Pokretanje poslije izdvajanja dijelova glavnog inline bloka u defer skripte.

Defer skripta se izvršava poslije cijelog parsiranja: kod koji glavni blok
koristi SINHRONO tokom parsiranja bi pukao na ReferenceError. Provjeravaju se
tri puta pokretanja (keširan profil, bez profila → login, promjena korisnika
na uređaju — taj put čita ključeve Tematske karte) i otvaranje panela
izdvojenog dijela, nad stvarnim index.html i stvarnim Leafletom, offline.
"""
import asyncio, json, mimetypes, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
UID = '11111111-1111-4111-8111-111111111111'
DRUGI = '22222222-2222-4222-8222-222222222222'
PROFIL = json.dumps({'ts': 0, 'data': {'id': UID, 'odobren': True, 'sumarija': 'TEST', 'ime': 'Test', 'prezime': 'Split'}})


async def pokreni(p, seed):
    browser = await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
    ctx = await browser.new_context(service_workers='block', viewport={'width': 360, 'height': 740})
    errors = []

    async def route(r):
        url = r.request.url
        if not url.startswith('http://split.test/'):
            await r.abort(); return
        name = url.split('split.test/', 1)[1].split('?', 1)[0] or 'index.html'
        f = ROOT / name
        if f.is_file():
            await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', body=f.read_bytes())
        else:
            await r.fulfill(status=404, body='')
    await ctx.route('**/*', route)
    await ctx.route_web_socket('**/*', lambda ws: ws.close())
    await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
    await ctx.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');" + seed + "}")
    page = await ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ReferenceError' in m.text else None)
    await page.goto('http://split.test/')
    await page.wait_for_function('window._startupTiming', timeout=60000)
    return browser, page, errors


async def main():
    async with async_playwright() as p:
        # 1) Keširan profil: ulaz offline, _startupRestore, izdvojeni kod prisutan.
        b, page, err = await pokreni(p, f"localStorage.setItem('tvlake_ol_profile',{json.dumps(PROFIL)});localStorage.setItem('tvlake_device_last_user','{UID}');")
        await page.wait_for_function('_startupRestore._done&&_appEntered', timeout=30000)
        assert await page.evaluate("typeof _temRestore==='function'&&Array.isArray(_temMaps)&&typeof _TEM_REG_KEY==='string'"), 'izdvojeni kod nije učitan'
        await page.evaluate('showTemModal()')
        await page.wait_for_timeout(300)
        assert await page.evaluate("[...document.querySelectorAll('*')].some(e=>/Tematsk/.test(e.textContent||'')&&e.offsetParent)"), 'panel Tematske karte se ne prikazuje'
        assert not err, ('greške uz keširan profil', err)
        await b.close()
        print('✓ keširan profil: ulaz, _startupRestore, panel Tematske karte, 0 grešaka')

        # 2) Bez profila: login ekran, bez grešaka.
        b, page, err = await pokreni(p, "localStorage.clear();")
        await page.wait_for_timeout(1500)
        assert await page.evaluate("getComputedStyle(document.getElementById('auth-screen')).display!=='none'"), 'login ekran nije prikazan'
        assert await page.evaluate("typeof _temRestore==='function'"), 'izdvojeni kod nije učitan na login ekranu'
        assert not err, ('greške bez profila', err)
        await b.close()
        print('✓ bez profila: login ekran, 0 grešaka')

        # 3) Promjena korisnika na uređaju: put koji SINHRONO kreće iz showApp i
        #    čita _TEM_REG_KEY; stari tematski registar mora otići u arhivu/brisanje.
        b, page, err = await pokreni(p, f"localStorage.setItem('tvlake_ol_profile',{json.dumps(PROFIL)});localStorage.setItem('tvlake_device_last_user','{DRUGI}');localStorage.setItem('tvlake_tem_reg_v1','[{{\"id\":\"stari\"}}]');")
        await page.wait_for_function(f"localStorage.getItem('tvlake_device_last_user')==='{UID}'", timeout=30000)
        assert await page.evaluate("localStorage.getItem('tvlake_tem_reg_v1')!=='[{\"id\":\"stari\"}]'"), 'tematski registar prethodnog korisnika ostao'
        assert not err, ('greške pri promjeni korisnika', err)
        await b.close()
        print('✓ promjena korisnika: registar prethodnog naloga sklonjen, 0 grešaka')

asyncio.run(main())
