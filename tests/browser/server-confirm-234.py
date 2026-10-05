"""Stvarni Supabase JS/PostgREST upiti + offline queue nad kontrolisanim HTTP-om."""
import asyncio
import base64
import importlib.util
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('menu_fixture', ROOT/'tests/browser/menu-tools.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
OUT = ROOT/'outputs/ui-preview'
js = """
let sbUser={id:'u1'},sbProfile={},_serverSaljem=true,_syncInProgress=false,
_syncRerun=false,_syncMrezaPalaU=0,_syncOdgodaT=null;
const _SYNC_PAUZA_MS=20000,_SERVER_SAMO_LOKALNO=new Set(),DOZ_ENG_COLORS=['green'];
let confirmations=[],messages=[],confirmAnswer=false,dialogs=[],_dozOdjeli=[],_dozSelId=null,_dozMarkings=[],vlake=[],_projekti=[],_aktivniProjektId=null;
const _DOZ_TREES_DATA_KEY='fixture_trees',_flushPendingFotos=async()=>{},_mrezaProbaj=()=>true,
_updSyncBadge=()=>{},_updSyncBadgeUskoro=()=>{},_serverSlanjeDozvoljeno=()=>true,
_serverTransferConfirmed=op=>confirmations.push({type:op.type,payload:op.payload}),
showToast=t=>messages.push(t),dozRenderOdjeli=()=>{},_dozRenderOverview=()=>{},openSyncQueuePanel=()=>{},
_dlgConfirm=async t=>{dialogs.push(t);return confirmAnswer};
const sb=supabase.createClient('https://server.fixture','fixture-public-key',
{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
""" + '\n'.join(b.function(n) for n in ['_isNetworkErr', '_isAuthErr', '_serverPrivremeno', '_processOfflineQueue', '_redUkloni', 'sbDeleteVlaka', '_syncQueueDiscard', '_dozRenderStatusRow', 'dozSetStatus'])
js += '\n' + b.section('const _DOZ_STATUSES = [', 'function _dozRenderStatusRow()')
fixture = ('<!DOCTYPE html><html lang="bs"><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1">'
           '<style>'+b.styles+'</style><div id="doznaka-panel" style="display:block;position:static;width:100%;height:auto;padding:16px">'
           '<div id="doz-status-row" style="display:flex;flex-wrap:wrap;gap:6px"></div></div>'
           '<script src="/static/libs/supabase.min.js"></script><script>'+js.split('const sb=')[0]+'</script>'
           '<script src="/static/js/offline-layer.js"></script><script>const sb='+js.split('const sb=',1)[1]+'</script></html>')


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, **({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
        page = await browser.new_page(viewport={'width':320,'height':568})
        errors, external, requests = [], [], []
        state = {'vlake':{},'doz_projects':{}}
        flags = {}
        page.on('pageerror', lambda e:errors.append(str(e)))
        async def route(r):
            u = urlparse(r.request.url)
            if u.netloc == 'ui.test':
                if u.path == '/':await r.fulfill(content_type='text/html',body=fixture)
                elif u.path in ['/static/libs/supabase.min.js','/static/js/offline-layer.js']:
                    await r.fulfill(content_type='text/javascript',body=(ROOT/u.path.lstrip('/')).read_bytes())
                else:await r.fulfill(status=404,body='fixture only')
                return
            if u.netloc != 'server.fixture':
                external.append(r.request.url);await r.abort();return
            headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*',
                       'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}
            if r.request.method == 'OPTIONS':await r.fulfill(status=204,headers=headers);return
            if u.path == '/auth/v1/user':
                await r.fulfill(headers=headers,content_type='application/json',body=json.dumps({'id':'u1','aud':'authenticated','role':'authenticated'}));return
            if u.path == '/auth/v1/logout':await r.fulfill(status=204,headers=headers);return
            table = u.path.split('/')[-1]
            method = r.request.method
            qs = parse_qs(u.query)
            requests.append({'table':table,'method':method,'query':qs,'prefer':r.request.headers.get('prefer','')})
            if flags.get('read_error') and method == 'GET':
                await r.fulfill(status=503,headers=headers,content_type='application/json',body=json.dumps({'code':'PGRST001','message':'fixture unavailable'}));return
            rows = list(state.get(table,{}).values())
            for k, values in qs.items():
                if values[0].startswith('eq.'):rows=[x for x in rows if str(x.get(k))==values[0][3:]]
            if method == 'POST':
                row = json.loads(r.request.post_data)
                if table == 'doz_projects':state[table][row['id']]=row
                reply = row if 'vnd.pgrst.object' in r.request.headers.get('accept','') else [row]
                await r.fulfill(headers=headers,content_type='application/json',body=json.dumps(reply));return
            if method == 'DELETE':
                assert qs.get('korisnik_id') == ['eq.u1'], 'brisanje nije ograničeno vlasnikom'
                rows = [x for x in rows if x['korisnik_id']=='u1' and not flags.get('deny_delete')]
                for row in rows:state[table].pop(row['id'],None)
                if flags.pop('lose_delete_reply',False):await r.abort('failed');return
            if method == 'PATCH':
                assert qs.get('created_by') == ['eq.u1'], 'status nije ograničen kreatorom'
                rows = [x for x in rows if x['created_by']=='u1' and not flags.get('deny_update')]
                for row in rows:row.update(json.loads(r.request.post_data))
            if method in ['PATCH','DELETE'] and flags.get('empty_mutation'):rows=[]
            await r.fulfill(headers=headers,content_type='application/json',body=json.dumps(rows))
        await page.route('**/*',route)
        await page.goto('https://ui.test/')
        def part(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
        token=part({'alg':'HS256','typ':'JWT'})+'.'+part({'sub':'u1','exp':int(time.time())+3600})+'.'+part('fixture')
        session=await page.evaluate('async token=>{const r=await sb.auth.setSession({access_token:token,refresh_token:"fixture-refresh"});return {id:r.data?.user?.id,error:r.error?.message}}',token)
        assert session.get('id')=='u1',session
        async def prepare(op):
            await page.evaluate('op=>{localStorage.clear();confirmations=[];messages=[];_syncMrezaPalaU=0;_OL.enqueue(op)}',op)
            requests.clear()
        async def run():await page.evaluate('_processOfflineQueue(true)')
        async def pending():return await page.evaluate('_OL.loadQueue(true)')

        # Brisanje iz UI-a čak i tokom slanja prvo se trajno upisuje, bez direktnog DELETE-a.
        state['vlake']['v0']={'id':'v0','korisnik_id':'u1'}
        await prepare({'type':'upsert_vlaka','payload':{'id':'v0','korisnik_id':'u1','nm':'T1'}})
        await page.evaluate('sbDeleteVlaka({sbId:"v0",nm:"T1",projektId:"P"})')
        assert not requests
        assert [x['type'] for x in await pending()]==['delete_vlaka']
        assert (await pending())[0]['payload']['projekt_id']=='P'
        await run()
        assert await pending()==[] and 'v0' not in state['vlake']

        # Stvarno izvršeno brisanje, izgubljen HTTP odgovor, zatim retry istog ID-ja.
        state['vlake']['v1']={'id':'v1','korisnik_id':'u1'}
        flags['lose_delete_reply']=True
        await prepare({'type':'delete_vlaka','payload':{'id':'v1'}})
        await run()
        assert 'v1' not in state['vlake'] and len(await pending())==1
        assert await page.evaluate('confirmations.length')==0
        await run()
        assert await pending()==[] and await page.evaluate('confirmations.length')==1,await pending()
        assert [x['method'] for x in requests]==['DELETE','DELETE','GET']

        # RLS prazna mutacija uz postojeći red NE potvrđuje brisanje.
        state['vlake']['v2']={'id':'v2','korisnik_id':'u1'};flags['deny_delete']=True
        await prepare({'type':'delete_vlaka','payload':{'id':'v2'}});await run()
        assert (await pending())[0]['_lastErr']['code']=='NO_CONFIRMATION'
        assert 'v2' in state['vlake'] and await page.evaluate('confirmations.length')==0
        flags.clear()
        state['vlake']['foreign']={'id':'foreign','korisnik_id':'u2'}
        await prepare({'type':'delete_vlaka','payload':{'id':'foreign'}});await run()
        assert (await pending())[0]['_lastErr']['code']=='WRITE_FORBIDDEN'
        assert 'foreign' in state['vlake']
        flags['read_error']=True
        await prepare({'type':'delete_vlaka','payload':{'id':'gone'}});await run()
        assert len(await pending())==1 and await page.evaluate('confirmations.length')==0
        flags.clear()

        # Izgubljena/minimalna potvrda statusa: pročitaj i uporedi željeno stanje.
        state['doz_projects']['own']={'id':'own','created_by':'u1','status':'active'}
        flags['empty_mutation']=True
        await prepare({'type':'upsert_doz_status','payload':{'id':'own','status':'paused'}});await run()
        assert await pending()==[] and state['doz_projects']['own']['status']=='paused'
        assert [x['method'] for x in requests]==['PATCH','GET']
        flags['deny_update']=True
        await prepare({'type':'upsert_doz_status','payload':{'id':'own','status':'completed'}});await run()
        assert (await pending())[0]['_lastErr']['code']=='NO_CONFIRMATION'
        assert state['doz_projects']['own']['status']=='paused'
        state['doz_projects']['colleague']={'id':'colleague','created_by':'u2','status':'active'}
        await prepare({'type':'upsert_doz_status','payload':{'id':'colleague','status':'paused'}});await run()
        assert (await pending())[0]['_lastErr']['code']=='WRITE_FORBIDDEN'
        await prepare({'type':'upsert_doz_status','payload':{'id':'missing','status':'paused'}});await run()
        assert (await pending())[0]['_lastErr']['code']=='TARGET_NOT_FOUND'
        flags.clear()

        # Stari privremeni ID mora se migrirati i u statusu, ne samo zonama.
        await prepare({'type':'insert_doz_project','payload':{'id':'real','_tempId':'local_old','created_by':'u1','status':'active'}})
        await page.evaluate('_dozOdjeli=[{id:"local_old",created_by:"u1"}];_OL.enqueue({type:"upsert_doz_status",payload:{id:"local_old",status:"paused"}})')
        await run()
        assert await pending()==[] and state['doz_projects']['real']['status']=='paused'
        assert await page.evaluate('_dozOdjeli[0].id')=='real'

        # Aktivan odjel kolege ostaje aktivan; samo kreator može staviti status u red.
        await page.evaluate('localStorage.clear();_dozSelId="own";_dozOdjeli=[{id:"own",created_by:"u1",status:"paused"},{id:"other-own",created_by:"u1",status:"active"},{id:"colleague",created_by:"u2",status:"active"}];dozSetStatus("active")')
        q = await pending()
        assert [x['payload']['id'] for x in q]==['own','other-own']
        assert await page.evaluate('_dozOdjeli[2].status')=='active'
        await page.evaluate('_dozSelId="colleague";dozSetStatus("paused");_dozRenderStatusRow()')
        assert len(await pending())==2 and await page.locator('#doz-status-row button:disabled').count()==3
        assert await page.locator('#doz-status-row').is_visible()
        for theme in ['day','dark']:
            await page.evaluate('t=>document.documentElement.dataset.fieldTheme=t',theme)
            await page.screenshot(path=str(OUT/f'doz-status-permissions-{theme}-320.png'))
            assert await page.locator('#doz-status-row').evaluate('e=>e.scrollWidth<=e.clientWidth')
        # Zaostali zabranjeni status može se zasebno ukloniti bez brisanja pojaseva.
        await prepare({'type':'upsert_doz_status','payload':{'id':'colleague','status':'paused'}})
        await page.evaluate('_OL.enqueue({type:"insert_doz_marking",payload:{project_id:"own",created_by:"u1"}});localStorage.setItem(_DOZ_TRACK_BUF_KEY,JSON.stringify([{_qid:"gps",user_id:"u1"}]))')
        await page.evaluate('_syncQueueDiscard(_OL.loadQueue(true)[0]._qid)')
        assert len(await pending())==2
        await page.evaluate('confirmAnswer=true;_syncQueueDiscard(_OL.loadQueue(true)[0]._qid)')
        assert [x['type'] for x in await pending()]==['insert_doz_marking']
        assert await page.evaluate('JSON.parse(localStorage.getItem(_DOZ_TRACK_BUF_KEY))[0]._qid')=='gps'
        assert 'pojasevi' in await page.evaluate('dialogs[0]')
        # Anonimno čitanje [] uz lokalno zapamćeni profil nije potvrda brisanja.
        await page.evaluate('sb.auth.signOut({scope:"local"})')
        await prepare({'type':'delete_vlaka','payload':{'id':'anonymous-not-found'}});await run()
        assert len(await pending())==1 and await page.evaluate('confirmations.length')==0
        assert not errors,errors
        assert not external,external
        print('OK: stvarni Supabase HTTP; izgubljen odgovor brisanja, potvrda stanja, RLS/503/missing, migracija ID-ja, statusi vlasnika/kolege i 2 PNG')
        await browser.close()


if __name__=='__main__':asyncio.run(main())
