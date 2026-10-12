"""Vizuelna provjera stvarnog Server markup-a/CSS-a/modula uz lažne podatke."""
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
HTML=(ROOT/'index.html').read_text()
def fn(name):
    m=re.search(r'(?:async )?function '+re.escape(name)+r'\(',HTML)
    assert m,name
    start=m.start(); i=HTML.index('{',start); depth=0
    for j in range(i,len(HTML)):
        if HTML[j]=='{':depth+=1
        if HTML[j]=='}':
            depth-=1
            if depth==0:return HTML[start:j+1]
    raise AssertionError(name)
PANEL=HTML[HTML.index('<div id="syncq-bg"'):HTML.index('<!-- Share foto')]
BOOT="""
let sbUser={id:'me'},sbProfile={ime:'Emina',prezime:'Projektant'},_aktivniProjektId='P',_vlakaSaveTimers={},vlake=[],kolegeMap={other:{ime:'Amir Kolega'}},_dozOdjeli=[],_dozSelId=null,_dozLinkedProjektId=null,_activeTab='karta',_vlTrazi='',_vlSort='naziv',_vlSamoStrme=false;
let _projekti=[{id:'P',gj:'GJ Bosanska Krupa',odjel:'105',datum:'2026-10-02',korisnik_id:'me',clanovi:[{korisnik_id:'other'}]},{id:'Q',gj:'GJ Drugi projekat',odjel:'206',korisnik_id:'other',clanovi:[{korisnik_id:'me'}]}];
let rows=[],queue=[],_serverSaljem=false,_serverPrimljenoBusy=false,_KVC_KEY='kvc';
const _SERVER_SAMO_LOKALNO=new Set(['upsert_trag','upsert_log','upsert_labels','delete_trag']),_SERVER_ZADNJE_KEY='last';
const _OL={VLAKE:'own',load:()=>rows.filter(r=>r.korisnik_id==='me'),loadQueue:()=>queue};
const _OP_LABELS={upsert_vlaka:'↑ Snimi vlaku',delete_vlaka:'Obriši vlaku'};
function _escHtml(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function _kvcLoad(id){return rows.filter(r=>r.projekt_id===id);}
function isAdmin(){return false;}function isVodeci(){return false;}
function _serverNaCekanju(){return {stavki:queue.length,red:queue.length,blok:1,doz:0};}
function _mrezaStanje(){return 'nema';}function serverPosalji(){}function serverPreuzmiDijeljeno(){}
function showToast(){}function _exportFieldRecovery(){}function _syncQueueClearAll(){}
let reportHtml='';function _openOrDownloadReport(h){reportHtml=h;}
async function aktivirajProjekt(id){_aktivniProjektId=id;}function switchTab(){}
for(let i=1;i<=145;i++)rows.push({id:'v'+i,nm:'T'+i,br:i,kr:0,korisnik_id:i<=35?'me':'other',projekt_id:'P',projektant_ime:i<=35?'Emina Projektant':'Amir Kolega',pts:[{la:44.80+i/100000,lo:16.15},{la:44.802+i/100000,lo:16.151}]});
for(let i=1;i<=7;i++)rows.push({id:'q'+i,nm:'T'+i,korisnik_id:'other',projekt_id:'Q',pts:[{la:44.9,lo:16},{la:44.901,lo:16}]});
for(let i=1;i<=35;i++)vlake.push({nm:'T'+i,sbId:'v'+i,projektId:'P',pts:rows[i-1].pts,projektantIme:'Emina Projektant'});
for(let i=1;i<=3;i++)queue.push({type:'upsert_vlaka',_uid:'me',_qid:'q'+i,payload:rows[i-1],_blocked:i===1,_lastErr:i===1?{message:'Server odbija upis. Lokalni podatak ostaje sačuvan.',code:'42501'}:null});
"""
FNS=['dst','calcL','_fmtAgo','_serverZadnje','_serverSazetakRender','_serverPrimljenoKljuc','_serverPrimljenoUcitaj','_serverPrimljenoZapamti','_serverPrimljenoRender','_serverPrimljenoIzKesa','openSyncQueuePanel','closeSyncQueuePanel']
async def main():
    out=ROOT/'outputs';out.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/lib/chromium/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-crashpad-for-testing'])
        page=await browser.new_page(viewport={'width':412,'height':850})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        await page.route('**/*',lambda r:r.fulfill(content_type='text/html',body='<html lang="bs"><meta name="viewport" content="width=device-width,initial-scale=1"><body>'+PANEL+'</body></html>'))
        await page.goto('https://server-preview.test/')
        await page.add_style_tag(content='body{margin:0;background:#182337;font:14px system-ui}button{cursor:pointer}svg{width:20px;height:20px}')
        await page.add_style_tag(path=str(ROOT/'static/css/field-design.css'))
        await page.add_style_tag(path=str(ROOT/'static/css/server-panel.css'))
        await page.add_script_tag(content=BOOT+'\n'+'\n'.join(fn(n)for n in FNS))
        await page.add_script_tag(path=str(ROOT/'static/js/tab-data.js'))
        await page.add_script_tag(path=str(ROOT/'static/js/server-panel.js'))
        await page.evaluate("_serverProjektPreuzeto('P',rows.filter(r=>r.projekt_id==='P'));openSyncQueuePanel();")
        assert await page.locator('#server-project-list .sp-vlaka').count()==60
        assert 'Emina Projektant' in await page.locator('#server-identity').inner_text()
        assert '145' in await page.locator('#server-project-summary').inner_text()
        for theme in ['night','day']:
            await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
            for width in [320,360,412,768]:
                await page.set_viewport_size({'width':width,'height':850})
                assert await page.evaluate("document.getElementById('syncq-panel').scrollWidth<=document.getElementById('syncq-panel').clientWidth"),(theme,width)
                await page.screenshot(path=str(out/f'server-{theme}-{width}.png'))
        await page.locator('#server-project-search').fill('Amir')
        assert await page.locator('#server-project-list .sp-vlaka').count()==60
        await page.evaluate('_serverProjektPage(1)')
        assert await page.locator('#server-project-list .sp-vlaka').count()==50
        await page.evaluate('_serverProjektReport()')
        assert await page.evaluate("(reportHtml.match(/<tr><td>/g)||[]).length")==145
        await page.locator('#server-project-select').select_option('Q')
        assert await page.locator('#server-project-list .sp-vlaka').count()==7
        assert await page.evaluate('_aktivniProjektId')=='P'
        await page.evaluate("_tabServer('send')")
        assert await page.locator('#syncq-list > div').count()==3
        assert 'Odjel 105' in await page.locator('#syncq-list').inner_text()
        assert 'Emina Projektant' in await page.locator('#syncq-list').inner_text()
        await page.evaluate("_tabServer('problems')")
        assert await page.locator('#syncq-list > div').count()==1
        assert '42501' in await page.locator('#syncq-list').inner_text()
        assert not errors,errors
        await browser.close()
        print(json.dumps({'checks':19,'vlake':145,'widths':[320,360,412,768],'themes':2,'pageErrors':errors,'productionNetwork':False}))
if __name__=='__main__':asyncio.run(main())
