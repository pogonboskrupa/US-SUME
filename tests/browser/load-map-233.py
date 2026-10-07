"""Stvarni LoadMap, Leaflet, SQL.js worker i IndexedDB; sintetičke raster karte."""
import asyncio
import importlib.util
import math
import mimetypes
import os
import sqlite3
import struct
import tempfile
import zlib
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('menu_fixture', ROOT/'tests/browser/menu-tools.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
OUT = ROOT/'outputs/ui-preview'
engine = b.section('let _sqlLayers = [];', 'function getOfflineBounds()')
js = """
const APP_VER='v2.3.3',_LASTMAP_KEY='tvlake_last_map';let _mapFavs=[];
const map=L.map('map').setView([44.9,16],14),TL={};
let confirmAnswer=false,confirmCalls=[],importCalls=0;
const showToast=()=>{},isAdmin=()=>false,_lsRenderSqlite=()=>{},closeLayerSheet=()=>{},
_mapFavSave=()=>{},openLayerImport=()=>{importCalls++},
_dlgConfirm=async(t,o)=>{confirmCalls.push({t,o});return confirmAnswer};
""" + '\n'.join(b.function(n) for n in ['_escHtml', '_escAttr', '_saveLastMap', 'setLayerSqlite']) + '\n' + engine
fixture = ('<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1">'
           '<link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>' + b.styles +
           '\n#map{position:fixed;inset:0;background:#dae8ce}</style></head><body>' + b.sprite +
           '<div id="map"></div>' + b.section('<div id="loadmap-modal"', '<!-- VLAKA INFO POPUP -->') +
           '<script src="/static/libs/leaflet.min.js"></script><script src="/static/js/map-downloads.js"></script><script>' + js + '</script></body></html>')


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))
    # Obojeni raster sa linijama: stvarni PNG za SQL worker i Leaflet dekodiranje.
    raw = b''.join(b'\0' + b''.join(bytes((58, 103, 67, 255) if y % 32 < 3 else
                                   (188, 210, 158, 255)) for x in range(256)) for y in range(256))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', 256, 256, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def mbtiles(path, valid=True):
    db = sqlite3.connect(path)
    if valid:
        db.execute('CREATE TABLE metadata (name TEXT, value TEXT)')
        db.executemany('INSERT INTO metadata VALUES (?,?)', [
            ('name', 'Odjel 105'), ('format', 'png'), ('minzoom', '14'), ('maxzoom', '14'),
            ('bounds', '15.99,44.89,16.01,44.91'), ('center', '16,44.9,14')])
        db.execute('CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)')
        x = math.floor((16+180)/360*2**14)
        y = math.floor((1-math.asinh(math.tan(math.radians(44.9)))/math.pi)/2*2**14)
        db.executemany('INSERT INTO tiles VALUES (?,?,?,?)',
                      [(14, x+dx, 2**14-1-(y+dy), png()) for dx in [-1, 0, 1] for dy in [-1, 0, 1]])
    else:
        db.execute('CREATE TABLE obična_baza (id INTEGER)')
    db.commit()
    db.close()
    return path.read_bytes()


async def bounded(page, selector, width, height):
    r = await page.locator(selector).evaluate('e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:e.clientWidth,sw:e.scrollWidth}}')
    assert r['x'] >= -1 and r['y'] >= -1 and r['right'] <= width+1 and r['bottom'] <= height+1 and r['sw'] <= r['w']+1, (selector, r)


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        payload = mbtiles(Path(td)/'raster.mbtiles')
        not_map = mbtiles(Path(td)/'ordinary.db', False)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, **({'executable_path': os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
        ctx = await browser.new_context(viewport={'width': 390, 'height': 800})
        external, errors, downloads = [], [], []
        async def route(r):
            if not r.request.url.startswith('https://ui.test/'):
                external.append(r.request.url)
                await r.abort()
                return
            path = r.request.url.split('ui.test', 1)[1].split('?', 1)[0]
            if path == '/':
                await r.fulfill(content_type='text/html', body=fixture)
            else:
                f = ROOT/path.lstrip('/')
                if path.startswith('/static/') and f.is_file():
                    await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream', body=f.read_bytes())
                else:
                    await r.fulfill(status=404, body='Fixture only')
        await ctx.route('**/*', route)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('https://ui.test/')
        await page.evaluate('openLoadMapScreen()')
        assert await page.locator('#loadmap-pane-add').is_visible()
        assert await page.locator('#loadmap-file-input').get_attribute('accept') is None
        assert await page.locator('#loadmap-file-input').get_attribute('multiple') is not None
        assert await page.locator('.lm-src-btn').count() == 0
        # Bez ručnog Drive taba/uputa. Android bridge kontroliše preuzimanje;
        # stvarna instalacija/SQLite/tiles/reload provjeravaju se na emulatoru.
        download=page.locator('#loadmap-unsko-download')
        assert await page.locator('#loadmap-unsko-title').inner_text()=='Unsko_2021-2031'
        assert await download.get_attribute('href') is None
        assert await page.locator('.lm-download-card ol,.lm-download-source').count()==0
        await page.evaluate("window.downloadState={ok:true,state:'idle'};window.downloadCalls=[];window.AndroidMapDownloads={request:(id,text)=>{const msg=JSON.parse(text);downloadCalls.push(msg.type);if(msg.type==='start')downloadState={ok:true,state:'downloading',bytes:400000000,total:1567670272};if(msg.type==='cancel')downloadState={ok:true,state:'idle'};queueMicrotask(()=>MapDownloads.reply(id,downloadState));}};MapDownloads.resume()")
        await page.wait_for_function("!document.getElementById('loadmap-unsko-download').disabled")
        await ctx.set_offline(True)
        await download.click()
        assert 'uključi internet' in await page.locator('#loadmap-unsko-status').inner_text()
        assert await page.evaluate("!downloadCalls.includes('start')")
        await ctx.set_offline(False)
        await download.click()
        await page.wait_for_function("document.getElementById('loadmap-unsko-progress').value===400000000")
        assert len(ctx.pages)==1 and page.url=='https://ui.test/'
        await page.evaluate("downloadState={ok:true,state:'paused',bytes:400000000,total:1567670272};MapDownloads.resume()")
        await page.wait_for_function("document.getElementById('loadmap-unsko-status').textContent.includes('Čekam vezu')")
        await download.scroll_into_view_if_needed()
        await page.screenshot(path=str(OUT/'download-unsko-251.png'))
        await page.locator('#loadmap-unsko-cancel').click()
        await page.wait_for_function("document.getElementById('loadmap-unsko-progress').hidden&&!document.getElementById('loadmap-unsko-download').disabled")
        assert await page.evaluate("downloadCalls.includes('cancel')")

        # Mješoviti izbor: samo prava SQLite zaglavlja mogu biti potvrđena.
        name = 'Topo Čuvar <105> & "sjever".mbtiles'
        await page.locator('#loadmap-file-input').set_input_files([
            {'name': name, 'mimeType': 'application/octet-stream', 'buffer': payload},
            {'name': 'pogrešna.mbtiles', 'mimeType': 'application/octet-stream', 'buffer': b'not sqlite'}])
        await page.wait_for_function('_loadmapPending.length===1')
        assert await page.locator('.lm-sheet-file').count() == 2
        assert await page.locator('.lm-sheet-file.is-invalid').count() == 1
        assert name in await page.locator('#loadmap-sheet-list').inner_text()
        assert await page.locator('#loadmap-sheet-list img').count() == 0
        await page.locator('#loadmap-confirm').click()
        await page.wait_for_function('_sqlLayers.length===1 && document.querySelector("#loadmap-manage .lm-card")', timeout=30000)
        assert await page.locator('#loadmap-pane-maps').is_visible()
        assert 'Sačuvana na telefonu' in await page.locator('.lm-card').inner_text()
        assert await page.evaluate('_sqlLayers[0].saved') is True
        await page.wait_for_function('localStorage.getItem("lm_thumb_"+_sqlLayers[0].name)')
        assert (await page.locator('.lm-card .lm-thumb').get_attribute('src')).startswith('data:image/jpeg')
        await page.locator('.lm-card-btns .lm-primary').click()
        await page.wait_for_function('!document.getElementById("loadmap-modal").classList.contains("show")')
        await page.wait_for_function('Object.values(_sqlLayers[0].layer._tiles).some(t=>t.loaded)', timeout=15000)
        assert await page.evaluate('JSON.parse(localStorage.getItem(_LASTMAP_KEY)).sqlId===_sqlLayers[0].name')

        # Stvarno ponovno otvaranje iz IDB bez interneta i novog izvornog fajla.
        await ctx.set_offline(True)
        await page.reload()
        # Interceptovana fixture navigacija u Chromiumu resetuje online indikator.
        # Ponovo primijeni mrežnu emulaciju prije stvarnog IDB/worker otvaranja.
        await ctx.set_offline(False)
        await ctx.set_offline(True)
        await page.evaluate('openLoadMapScreen();_loadmapTab("maps")')
        await page.wait_for_function('document.querySelector("#loadmap-manage .lm-card")')
        assert await page.evaluate('_sqlLayers.length') == 0
        assert 'Sačuvana na telefonu' in await page.locator('.lm-card').inner_text()
        await page.locator('.lm-card-btns .lm-primary').click()
        await page.wait_for_function('_sqlLayers.length===1 && _sqlLayers[0].visible', timeout=30000)
        await page.wait_for_function('Object.values(_sqlLayers[0].layer._tiles).some(t=>t.loaded)', timeout=15000)
        assert await page.evaluate('navigator.onLine') is False
        await page.evaluate('openLoadMapScreen();_loadmapTab("maps")')
        await page.wait_for_function('document.querySelector(".lm-card.active")')
        await page.locator('.lm-card-details summary').click()
        await page.locator('.lm-opacity input').fill('63')
        assert await page.evaluate('_sqlLayers[0].layer.options.opacity') == .63
        old_z = await page.evaluate('_sqlLayers[0].layer.options.zIndex||0')
        await page.locator('.lm-layer-order button').last.click()
        assert await page.evaluate('_sqlLayers[0].layer.options.zIndex') == old_z+1
        await page.locator('.lm-card-btns .lm-secondary').click()
        await page.wait_for_function('!document.querySelector(".lm-card.active")')
        assert await page.evaluate('!map.hasLayer(_sqlLayers[0].layer)')
        await page.fill('#loadmap-search', 'ne postoji')
        await page.wait_for_function('document.querySelectorAll(".lm-card").length===0')
        assert await page.evaluate('(async()=> (await _mapMgrCollect()).length)()') == 1
        await page.fill('#loadmap-search', 'Čuvar')
        await page.wait_for_function('document.querySelector(".lm-card")')
        await page.fill('#loadmap-search', '')

        for theme in ['day', 'dark']:
            await page.evaluate('t=>document.documentElement.dataset.fieldTheme=t', theme)
            for width, height in [(320,568), (390,800), (568,320), (800,600)]:
                await page.set_viewport_size({'width': width, 'height': height})
                await page.evaluate('_loadmapTab("add")')
                await bounded(page, '#loadmap-modal', width, height)
                assert await page.locator('.lm-download-card').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                await bounded(page, '#loadmap-body', width, height)
                assert await page.locator('#loadmap-pick').evaluate('e=>e.getBoundingClientRect().height') >= 44
                await page.screenshot(path=str(OUT/f'loadmap-add-{theme}-{width}-{height}.png'))
                await page.click('#loadmap-tab-maps')
                await bounded(page, '#loadmap-body', width, height)
                await page.screenshot(path=str(OUT/f'loadmap-maps-{theme}-{width}-{height}.png'))
                if width == 390:
                    await page.locator('.lm-card').scroll_into_view_if_needed()
                    await page.screenshot(path=str(OUT/f'loadmap-controls-{theme}.png'))
                await page.evaluate('loadmapHandleFiles([new File(["invalid"],"neispravna.db")])')
                assert await page.locator('#loadmap-confirm').is_disabled()
                await bounded(page, '#loadmap-sheet-box', width, height)
                await page.screenshot(path=str(OUT/f'loadmap-preview-{theme}-{width}-{height}.png'))
                await page.evaluate('loadmapCancelSheet()')

        # Otkazan ili noviji izbor nadjačava zakašnjelu provjeru prethodnog fajla.
        await page.evaluate('window.slowDone=loadmapHandleFiles([{name:"slow.db",size:16,slice:()=>({arrayBuffer:()=>new Promise(r=>window.headerRelease=r)})}]);void 0')
        await page.evaluate('loadmapCancelSheet();headerRelease(new TextEncoder().encode("SQLite format 3\\0").buffer)')
        await page.evaluate('slowDone')
        assert await page.evaluate('_loadmapPending.length') == 0
        assert not await page.locator('#loadmap-sheet').is_visible()
        await page.evaluate('window.slowDone=loadmapHandleFiles([{name:"slow.db",size:16,slice:()=>({arrayBuffer:()=>new Promise(r=>window.headerRelease=r)})}]);void 0')
        await page.evaluate('loadmapHandleFiles([new File(["wrong"],"new.db")])')
        await page.evaluate('headerRelease(new TextEncoder().encode("SQLite format 3\\0").buffer);void 0')
        await page.evaluate('slowDone')
        assert 'new.db' in await page.locator('#loadmap-sheet-list').inner_text()
        assert await page.evaluate('_loadmapPending.length') == 0
        await page.evaluate('loadmapCancelSheet()')

        # SQLite zaglavlje samo po sebi nije karta: ne smije prijaviti lažan uspjeh.
        await page.locator('#loadmap-file-input').set_input_files({'name': 'obična.db', 'mimeType': 'application/octet-stream', 'buffer': not_map})
        await page.wait_for_function('_loadmapPending.length===1')
        await page.locator('#loadmap-confirm').click()
        await page.wait_for_function('document.getElementById("loadmap-status").dataset.state==="error"', timeout=30000)
        assert await page.evaluate('_sqlLayers.length') == 1

        # Brisanje je eksplicitno, uz potvrdu; odbijena potvrda čuva stvarnu IDB kartu.
        await page.evaluate('_loadmapTab("maps");_loadmapRenderManage()')
        await page.wait_for_function('document.querySelector(".lm-card")')
        await page.locator('.lm-card-details summary').click()
        await page.locator('.lm-delete').click()
        assert await page.evaluate('(async()=> (await _mapMgrCollect()).length)()') == 1
        await page.evaluate('confirmAnswer=true')
        await page.locator('.lm-delete').click()
        await page.wait_for_function('_sqlLayers.length===0 && !document.querySelector(".lm-card")')
        assert await page.evaluate('(async()=> (await _mapMgrCollect()).length)()') == 0
        assert not errors, errors
        assert not external, external
        print('LoadMap: stvarni raster/worker/IDB, offline restart, kontrole, neispravni fajlovi, kasni izbor, brisanje, 26 PNG — OK')
        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
