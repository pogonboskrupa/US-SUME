"""Opis fotografije — brzi izbor (v4.8.1): dijalog sa 5 izbora + slobodan tekst, noć/dan, 360 px."""
import asyncio, json, mimetypes, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
UID = '11111111-1111-4111-8111-111111111111'
PROFIL = json.dumps({'ts': 0, 'data': {'id': UID, 'odobren': True, 'sumarija': 'TEST', 'ime': 'Test', 'prezime': 'Foto'}})
OUT = os.environ.get('UI_OUT')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
        greske = []
        for tema in ('dark', 'day'):
            ctx = await browser.new_context(service_workers='block', viewport={'width': 360, 'height': 740})

            async def route(r):
                url = r.request.url
                if not url.startswith('http://fop.test/'):
                    await r.abort(); return
                f = ROOT / (url.split('fop.test/', 1)[1].split('?', 1)[0] or 'index.html')
                if f.is_file():
                    await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', body=f.read_bytes())
                else:
                    await r.fulfill(status=404, body='')
            await ctx.route('**/*', route)
            await ctx.route_web_socket('**/*', lambda ws: ws.close())
            seed = f"localStorage.setItem('tvlake_ol_profile',{json.dumps(PROFIL)});localStorage.setItem('tvlake_device_last_user','{UID}');localStorage.setItem('tvlake_field_theme_v1','{tema}');"
            await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
            await ctx.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');" + seed + "}")
            page = await ctx.new_page()
            page.on('pageerror', lambda e: greske.append(str(e)))
            await page.goto('http://fop.test/')
            await page.wait_for_function('window._startupTiming', timeout=60000)
            await page.evaluate("() => { _locFotos.push({la:44,lo:16,ts:777,thumb:'',full:'',marker:null,opis:''}); window._p = _fotoOpisPitaj(777, ''); }")
            await page.wait_for_selector('#fop-bg .fop-sh')
            assert await page.locator('#fop-bg .fop-brzi button').count() == 5
            m = await page.evaluate("""() => { const sh = document.querySelector('#fop-bg .fop-sh').getBoundingClientRect();
              return { over: document.documentElement.scrollWidth - innerWidth, mete: [...document.querySelectorAll('#fop-bg button')].filter(b => b.getBoundingClientRect().height < 40).length, desno: sh.right <= innerWidth + 1 }; }""")
            assert m['over'] <= 1 and m['mete'] == 0 and m['desno'], m
            await page.click('#fop-bg .fop-brzi button:has-text("Sanitar")')
            await page.click('#fop-bg .fop-brzi button:has-text("Bespravna")')
            await page.fill('#fop-tekst', 'bukva 60 cm')
            assert await page.inner_text('#fop-pre') == '→ Sanitar, Bespravna sječa, bukva 60 cm'
            if OUT:
                await page.screenshot(path=f'{OUT}/fop-{tema}.png')
            await page.click('#fop-bg .fop-sac')
            await page.evaluate("() => window._p")
            assert await page.evaluate("_locFotos.find(f => f.ts === 777).opis") == 'Sanitar, Bespravna sječa, bukva 60 cm'
            assert await page.locator('#fop-bg').count() == 0
            # uređivanje + odustani ne mijenja opis
            await page.evaluate("() => { window._p = _fotoOpisPitaj(777, 'Sanitar, Bespravna sječa, bukva 60 cm'); }")
            await page.wait_for_selector('#fop-bg')
            assert await page.evaluate("[...document.querySelectorAll('#fop-bg .fop-brzi button[aria-pressed=true]')].map(b => b.textContent).join('|')") == 'Sanitar|Bespravna sječa'
            assert await page.input_value('#fop-tekst') == 'bukva 60 cm'
            await page.click('#fop-bg .fop-brzi button:has-text("Sanitar")')
            await page.click('#fop-bg .fop-odu')
            await page.evaluate("() => window._p")
            assert await page.evaluate("_locFotos.find(f => f.ts === 777).opis") == 'Sanitar, Bespravna sječa, bukva 60 cm', 'Odustani ne mijenja'
            await ctx.close()
        await browser.close()
        assert not greske, greske
        print('OK opis fotografije — brzi izbor (noć/dan, 360 px)')

asyncio.run(main())
