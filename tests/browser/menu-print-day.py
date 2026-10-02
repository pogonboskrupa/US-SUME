"""Stvarni HTML/CSS i funkcije Menija/štampe, sa lokalnim lažnim projektom."""
import asyncio, json, mimetypes, os, re
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'index.html').read_text()
OUT = ROOT / 'outputs/ui-2.1.3'

def function(name):
    match = re.search(r'(?:async )?function ' + name + r'\(', SOURCE)
    assert match, name
    start = match.start()
    depth = 0
    for i in range(SOURCE.index('{', start), len(SOURCE)):
        depth += SOURCE[i] == '{'
        depth -= SOURCE[i] == '}'
        if depth == 0:
            return SOURCE[start:i+1]
    raise ValueError(name)

menu_start = SOURCE.index('<div id="menu-dropdown"')
menu = SOURCE[menu_start:SOURCE.index('<!-- ─── STIL LINIJA MODAL', menu_start)]
action_start = SOURCE.index('<div id="action-bar">')
action = SOURCE[action_start:SOURCE.index('<!--', SOURCE.index('\n</div>\n', action_start)+10)]
styles = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', SOURCE[:SOURCE.index('</head>')], re.S))
styles += '\n' + (ROOT / 'static/css/field-design.css').read_text()
print_start = SOURCE.index('const _STP_FORMATI =')
print_js = SOURCE[print_start:SOURCE.index("map.on('moveend zoomend'", print_start)]
javascript = '''
const APP_VER='v2.1.3'; let sbUser={id:'A'},sbProfile={id:'A',ime:'Emina',prezime:'Projektant',sumarija:'Šumarija Bos.Krupa'};
let _aktivniProjektId='P',_activeTab='karta',vlake=[],_projekti=[{id:'P',odjel:'105',gj:'Gornja Una'}];
const isVodeci=()=>false,isSpdField=()=>false,getOdjelBounds=()=>null,showToast=()=>{};
const map={options:{zoomSnap:1},center:{lat:44.9,lng:16},zoom:13,getCenter(){return this.center;},getZoom(){return this.zoom;},setView(c,z){this.center=c;this.zoom=z;},invalidateSize(){}};
''' + '\n'.join(function(n) for n in ['_escHtml','_niceScaleLen','_fmtScaleLen','_menuIdentityRender','toggleMenuDropdown','closeMenuDropdown']) + '\n' + print_js
javascript += '\n' + (ROOT / 'static/js/field-design.js').read_text()
fixture = '<!DOCTYPE html><html lang="bs"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color"><style>' + styles + '''
#menu-btn{position:fixed;left:10px;top:8px;width:60px;height:44px;z-index:9999}
#wrapper{position:fixed;inset:0}#main{position:absolute;inset:60px 0 65px}#map{position:absolute;inset:0;background:repeating-linear-gradient(30deg,#dce9d5 0 35px,#e9f1e4 36px 70px)}
</style></head><body><div id="wrapper"><button id="menu-btn" onclick="toggleMenuDropdown(event)">Meni</button><div id="main"><div id="map">
<div id="print-naslov" class="stp-el"></div><div id="print-legend" class="stp-el"></div>
<div id="print-scalebar" class="stp-el"><div id="psb-mj"></div><div id="psb-bar"></div><span id="psb-mid"></span><span id="psb-full"></span></div>
</div></div>''' + action + '</div>' + menu + '<div id="stampa-kontrole"></div><script>' + javascript + '</script></body></html>'

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, **({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
        page = await browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        async def route(r):
            path = r.request.url.split('ui.test',1)[-1].split('?',1)[0]
            if path == '/':
                await r.fulfill(content_type='text/html', body=fixture)
            elif path == '/icon-192.png':
                await r.fulfill(content_type='image/png', body=(ROOT/'icon-192.png').read_bytes())
            else:
                await r.fulfill(status=404, body='fixture only')
        await page.route('**/*', route)
        await page.goto('https://ui.test/')
        for theme in ['day','dark']:
            await page.evaluate('(theme)=>{localStorage.setItem("tvlake_field_theme_v1",theme);document.documentElement.dataset.fieldTheme=theme}',theme)
            for width,height in [(320,568),(390,650),(768,800),(568,320)]:
                await page.set_viewport_size({'width':width,'height':height})
                await page.evaluate('closeMenuDropdown()')
                await page.click('#menu-btn')
                await page.wait_for_timeout(450)
                await page.wait_for_function('document.querySelector(".mdrop-brand img").complete')
                assert await page.locator('#menu-user-label').inner_text() == 'Emina Projektant'
                assert await page.locator('#menu-app-ver').inner_text() == 'Verzija v2.1.3'
                dims = await page.evaluate('''()=>{const m=document.querySelector('#menu-dropdown'),f=document.querySelector('.mdrop-footer'),s=document.querySelector('.mdrop-sections');const b=m.getBoundingClientRect(),fb=f.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom,footer:fb.bottom,scroll:s.clientHeight,width:m.clientWidth,content:m.scrollWidth};}''')
                assert dims['left']>=0 and dims['right']<=width and dims['bottom']<=height, dims
                assert dims['footer']<=height and dims['scroll']>40 and dims['content']<=dims['width'], dims
                await page.screenshot(path=str(OUT/f'menu-{theme}-{width}-{height}.png'))
                await page.evaluate('closeMenuDropdown()')
                if theme=='day':
                    colors=await page.evaluate('''()=>['ab-loc','ab-izmjeri'].map(id=>getComputedStyle(document.getElementById(id)).color)''')
                    assert colors==['rgb(16, 32, 51)','rgb(16, 32, 51)'],colors
        await page.set_viewport_size({'width':390,'height':800})
        await page.evaluate('document.documentElement.dataset.fieldTheme="day";stampaOtvori();_stpUredi()')
        await page.locator('textarea').nth(0).fill('Plan vlaka 2026\nOpis radilišta <test>')
        await page.locator('textarea').nth(1).fill('Zajednička mreža\nSve dužine su u metrima.')
        await page.evaluate("_stpLegStavka('vlaka',true);_stpLegNaziv('vlaka','Projektovana traktorska vlaka')")
        assert 'Šumarija Bos.Krupa' not in await page.locator('#print-naslov').inner_text()
        assert 'Opis radilišta <test>' in await page.locator('#print-naslov').inner_text()
        assert await page.locator('#print-naslov test').count()==0
        assert 'Projektovana traktorska vlaka' in await page.locator('#print-legend').inner_text()
        before=await page.evaluate('({w:document.querySelector("#map").style.width,h:document.querySelector("#map").style.height,m:_stp.mjerilo})')
        await page.evaluate('_stpPregled()')
        assert await page.locator('textarea').count()==0
        after=await page.evaluate('({w:document.querySelector("#map").style.width,h:document.querySelector("#map").style.height,m:_stp.mjerilo})')
        assert before==after
        await page.screenshot(path=str(OUT/'print-preview-day.png'))
        await page.emulate_media(media='print')
        assert not await page.locator('#stampa-kontrole').is_visible()
        assert await page.locator('#print-naslov').is_visible()
        assert await page.locator('#map').evaluate('(e)=>getComputedStyle(e).transform')=='none'
        await page.pdf(path=str(OUT/'karta-provjera.pdf'),width='297mm',height='210mm',print_background=True)
        assert not errors,errors
        await browser.close()
    print('OK: Meni 8 veličina/tema, stalni footer, Dnevni kontrast, opisi, legenda i print/PDF')

asyncio.run(main())
