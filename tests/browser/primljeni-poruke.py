"""Primljeni podaci (v4.8.0): kartice Fajlovi/Poruke/Poslano/Kolege i prozor za poruku.

Stvarni index.html, keširan profil, bez mreže, 360 px, noć i dan. Provjerava da sve kartice
stanu bez horizontalnog skrola, da se poruka prikazuje kao oblačić sa tekstom, da otvaranje sa
samo nepročitanom porukom počinje na Porukama i da prozor za poruku ima tekst, brze odgovore,
lokaciju i dugme Pošalji koje je ugašeno dok je polje prazno.
"""
import asyncio, json, mimetypes, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
UID = '11111111-1111-4111-8111-111111111111'
PROFIL = json.dumps({'ts': 0, 'data': {'id': UID, 'odobren': True, 'sumarija': 'TEST', 'ime': 'Test', 'prezime': 'Poruke'}})
OUT = os.environ.get('UI_OUT')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
        greske = []
        for tema in ('dark', 'day'):
            ctx = await browser.new_context(service_workers='block', viewport={'width': 360, 'height': 740}, device_scale_factor=1)

            async def route(r):
                url = r.request.url
                if not url.startswith('http://prm.test/'):
                    await r.abort(); return
                name = url.split('prm.test/', 1)[1].split('?', 1)[0] or 'index.html'
                f = ROOT / name
                if f.is_file():
                    await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', body=f.read_bytes())
                else:
                    await r.fulfill(status=404, body='')
            await ctx.route('**/*', route)
            await ctx.route_web_socket('**/*', lambda ws: ws.close())
            seed = (f"localStorage.setItem('tvlake_ol_profile',{json.dumps(PROFIL)});localStorage.setItem('tvlake_device_last_user','{UID}');"
                    f"localStorage.setItem('tvlake_field_theme_v1','{tema}');")
            await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
            await ctx.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');" + seed + "}")
            page = await ctx.new_page()
            page.on('pageerror', lambda e: greske.append(str(e)))
            await page.goto('http://prm.test/')
            await page.wait_for_function('window._startupTiming', timeout=60000)
            await page.evaluate("""(uid) => {
              const sad = Date.now();
              const l = [
                {id:'m1', vrsta:'kml', naziv:'✉ Stižem za 10 min, čekaj kod rampe', poruka:'Stižem za 10 min, čekaj kod rampe na ulazu u odjel 42.', lok:[44.9,16.1], od:'k1', odIme:'Ana Anić', t:sad-300000, kb:1, vidjeno:false},
                {id:'f1', vrsta:'trag', naziv:'Trag 18.11. obilazak granice', od:'k1', odIme:'Ana Anić', t:sad-7200000, kb:42, vidjeno:true},
                {id:'f2', vrsta:'kml', naziv:'Foto 18.11.26 10:15 · odjel 42', od:'k2', odIme:'Edin Edić', t:sad-86400000, kb:310, vidjeno:true},
                {id:'f3', vrsta:'poligon', naziv:'Izmjerena površina sječe', od:'k2', odIme:'Edin Edić', t:sad-2*86400000, kb:3, vidjeno:true}];
              localStorage.setItem('tvlake_primljeni_v1:' + uid, JSON.stringify(l));
              localStorage.setItem('tvlake_poslani_v1:' + uid, JSON.stringify([{t:sad-60000, vrsta:'kml', naziv:'✉ Gdje si?', kome:'Ana Anić'},{t:sad-3600000, vrsta:'trag', naziv:'Trag jutro', kome:'Edin Edić'}]));
              localStorage.setItem('tvlake_kontakti_v1:' + uid, JSON.stringify([{id:'k1', ime:'Ana Anić', sumarija:'Krupa'},{id:'k2', ime:'Edin Edić', sumarija:'Cazin'}]));
              primljeniOtvori();
            }""", UID)
            await page.wait_for_selector('#primljeni-panel .prm-tabovi')
            sel = await page.evaluate("document.querySelector('#primljeni-panel .prm-tabovi [aria-selected=true]').textContent")
            assert 'Poruke' in sel, 'samo nepročitana poruka → otvara se na Porukama: ' + sel
            for tab in ('m', 'p', 's', 'k'):
                await page.evaluate(f"_primTabPostavi('{tab}')")
                m = await page.evaluate("""() => { const el = document.getElementById('primljeni-panel'), b = el.querySelector('.prm-body');
                  const sir = [...el.querySelectorAll('.prm-tabovi button')].map(x => x.getBoundingClientRect().width);
                  return { over: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - innerWidth, sir, mete: [...el.querySelectorAll('button')].filter(x => x.offsetParent && x.getBoundingClientRect().height < 38).map(x => x.textContent.trim()).slice(0, 5) }; }""")
                assert m['over'] <= 1 and m['page'] <= 1, (tema, tab, m)
                assert min(m['sir']) > 70, ('kartice preuske', m['sir'])
                assert not m['mete'], ('premale dodirne mete', tema, tab, m['mete'])
                if tab == 'm':
                    t = await page.evaluate("document.querySelector('#primljeni-panel .prm-por p').textContent")
                    assert 'rampe na ulazu' in t
                    assert await page.locator('#primljeni-panel .prm-por-a button', has_text='Odgovori').count() == 1
                    assert await page.locator('#primljeni-panel .prm-por-a button', has_text='Lokacija').count() == 1
                if tab == 'p':
                    assert await page.locator('#primljeni-panel .prm-red').count() == 3, 'poruke nisu među fajlovima'
                if OUT:
                    await page.screenshot(path=f'{OUT}/prm-{tema}-{tab}.png')
            await page.evaluate("porukaNova('k1','Ana Anić')")
            await page.wait_for_selector('#por-bg .por-sh')
            assert await page.evaluate("document.querySelector('#por-bg .por-salji').disabled"), 'Pošalji ugašen dok je prazno'
            await page.click('#por-bg .por-brze button:first-child')
            assert not await page.evaluate("document.querySelector('#por-bg .por-salji').disabled")
            assert await page.evaluate("document.getElementById('por-tekst').value") == 'Stižem'
            assert await page.evaluate("localStorage.getItem('tvlake_poruka_nacrt_v1')") == 'Stižem', 'nacrt se čuva'
            if OUT:
                await page.screenshot(path=f'{OUT}/prm-{tema}-poruka.png')
            await page.click('#por-bg .por-odu')
            assert await page.locator('#por-bg').count() == 0
            await ctx.close()
        await browser.close()
        assert not greske, greske
        print('OK primljeni podaci + poruke (noć/dan, 360 px)')

asyncio.run(main())
