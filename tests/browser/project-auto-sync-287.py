"""Puna app + pravi Supabase JS: roditelj prije članstva, offline i izgubljen odgovor."""
import asyncio, base64, json, mimetypes, os, time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/287';OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800})
  errors=[];external=[];calls=[];state={};flags={};hold=asyncio.Event();started=asyncio.Event()
  users=[{'id':A,'ime':'Emina','prezime':'Projektant','sumarija':'TEST','odobren':True},
         {'id':B,'ime':'Adnan','prezime':'Kolega','sumarija':'TEST','odobren':True}]
  async def route(r):
   u=urlparse(r.request.url)
   if u.netloc=='device.test':
    name=u.path.lstrip('/') or 'index.html';f=ROOT/name
    if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
    elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
    return
   if u.netloc!='server.fixture':
    if r.request.method not in ['GET','HEAD']:external.append(r.request.url)
    await r.abort();return
   headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
   if r.request.method=='OPTIONS':await r.fulfill(status=204,headers=headers);return
   if u.path=='/auth/v1/user':await r.fulfill(headers=headers,content_type='application/json',body=json.dumps({'id':A,'aud':'authenticated','role':'authenticated'}));return
   table=u.path.split('/')[-1];method=r.request.method;query=parse_qs(u.query)
   calls.append({'table':table,'method':method,'query':query})
   async def reply(data,status=200):await r.fulfill(status=status,headers=headers,content_type='application/json',body=json.dumps(data))
   if '/rpc/app_record_activity' in u.path:await reply(None);return
   if method=='POST':
    payload=json.loads(r.request.post_data);rows=payload if isinstance(payload,list) else [payload]
    if table in ['projekti','doz_projects']:
     assert '_tempId' not in rows[0]
     if flags.get('hold'):started.set();await hold.wait();flags.pop('hold',None)
     if flags.get('deny'):await reply({'code':'42501','message':'fixture denied'},403);return
     if rows[0]['id'] in state.get(table,{}):await reply({'code':'23505','message':'duplicate id'},409);return
     state.setdefault(table,{})[rows[0]['id']]=rows[0]
     if flags.pop('lose',False):await r.abort('failed');return
    elif table in ['projekt_clanovi','doz_project_members']:
     parent,key=('projekti','projekt_id') if table=='projekt_clanovi' else ('doz_projects','project_id')
     assert all(row[key] in state.get(parent,{}) for row in rows),'članstvo poslano prije projekta'
     for row in rows:state.setdefault(table,{})[str(len(state.get(table,{})))]=row
    else:raise AssertionError('automatski poslan terenski podatak: '+table)
    await reply(rows[0] if 'vnd.pgrst.object' in r.request.headers.get('accept','') else rows);return
   rows=users if table=='korisnici' else list(state.get(table,{}).values())
   for k,v in query.items():
    if v[0].startswith('eq.'):rows=[x for x in rows if str(x.get(k)).lower()==v[0][3:].lower()]
    if v[0].startswith('neq.'):rows=[x for x in rows if str(x.get(k))!=v[0][4:]]
   offset=int(query.get('offset',['0'])[0]);limit=int(query.get('limit',[str(len(rows))])[0]);rows=rows[offset:offset+limit]
   await reply(rows[0] if rows and 'vnd.pgrst.object' in r.request.headers.get('accept','') else None if 'vnd.pgrst.object' in r.request.headers.get('accept','') else rows)
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>window.fixtureOnline===true,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};if(!localStorage.getItem('tvlake_device_last_user')){const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,odobren:true,sumarija:'TEST',ime:'Emina',prezime:'Projektant'}}));localStorage.setItem('tvlake_device_last_user',id);} """)
  page=await ctx.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)+' '+e.stack))
  def part(value):return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
  token=part({'alg':'HS256','typ':'JWT'})+'.'+part({'sub':A,'exp':int(time.time())+3600})+'.'+part('fixture')
  async def ready():
   await page.wait_for_function('_startupRestore._done')
   await page.evaluate("""async token=>{fixtureOnline=true;_netZaboraviKvarove();sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Emina',prezime:'Projektant'};sbInitData=async()=>{};_reloadCoreData=async()=>{};sbStartRealtime=()=>{};sb=supabase.createClient('https://server.fixture','fixture-public-key',{global:{fetch:reliableFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await sb.auth.setSession({access_token:token,refresh_token:'fixture'});_revealApp();}""",token)
  async def create(name,online=True):
   await page.evaluate('(online)=>{fixtureOnline=online;switchTab("projekat");showNovProjektForm()}',online)
   await page.locator('#np-odjel').fill(name);await page.locator('#np-gj-plain').fill('TEST')
   await page.locator('[onclick="saveNovProjekt()"]').click()
   return await page.evaluate('_aktivniProjektId')
  async def add(id):
   await page.evaluate("""id=>{switchTab("projekat");showProjektDetalji(id);window._pdAvailable=[['22222222-2222-4222-8222-222222222222',{ime:'Adnan Kolega',color:'#3b82f6'}]];openDodajClanPanel()}""",id)
   await page.locator('#pd-add-checks input').check()
   await page.evaluate('()=>{window.memberTask=confirmDodajClanove()}')
  await page.goto('https://device.test/');await ready()
  print('check delayed parent',flush=True)
  # Local UI is ready while POST still waits; membership must wait for the same flight.
  await page.evaluate("_OL.enqueue({type:'upsert_vlaka',payload:{nm:'T99',korisnik_id:sbUser.id}});localStorage.setItem(_DOZ_TRACK_BUF_KEY,JSON.stringify([{user_id:sbUser.id,project_id:'unrelated',_qid:'gps',recorded_at:new Date().toISOString()}]))")
  flags['hold']=True;id=await create('105');await asyncio.wait_for(started.wait(),10)
  assert await page.evaluate('id=>_projekti.find(p=>p.id===id)._pendingSync&&_OL.load(_OL.PROJEKTI).some(p=>p.id===id)',id)
  await add(id);await page.wait_for_timeout(150)
  assert not any(c['method']=='POST' and c['table']=='projekt_clanovi' for c in calls)
  hold.set();await page.evaluate('memberTask')
  assert await page.evaluate('id=>!_projekti.find(p=>p.id===id)._pendingSync&&_projekti.find(p=>p.id===id).clanovi.length===1',id)
  assert await page.evaluate('_serverTransfers("sent").some(r=>r.item==="Novi projekat")&&_serverZadnje()>0')
  assert len([c for c in calls if c['method']=='POST' and c['table']=='projekti'])==1
  assert await page.evaluate('_OL.loadQueue().some(o=>o.type==="upsert_vlaka")&&JSON.parse(localStorage.getItem(_DOZ_TRACK_BUF_KEY)).length===1&&!_serverSaljem')
  print('check offline restart',flush=True)
  # Offline create/restart -> online event sends the durable parent without sending field data.
  offline=await create('106',False);before=len(calls)
  assert await page.evaluate('id=>_projekti.find(p=>p.id===id)._pendingSync',offline)
  await page.reload();await ready();assert await page.evaluate('id=>_OL.loadQueue().some(o=>o.payload.id===id)',arg=offline)
  await page.evaluate('window.dispatchEvent(new Event("online"))')
  await page.wait_for_function('id=>!_OL.loadQueue().some(o=>o.payload.id===id)',arg=offline)
  assert offline in state['projekti'];assert len(calls)>before
  print('check lost reply',flush=True)
  # Lost INSERT response: same client UUID is confirmed by duplicate/read, not a second project.
  flags['lose']=True;lost=await create('107');await page.wait_for_function('!_syncInProgress')
  assert lost in state['projekti'];assert await page.evaluate('id=>_OL.loadQueue().some(o=>o.payload.id===id)',lost)
  await page.evaluate('()=>{_syncMrezaPalaU=0;_netZaboraviKvarove();return _processOfflineQueue(true)}')
  assert await page.evaluate('id=>!_OL.loadQueue().some(o=>o.payload.id===id)',lost)
  assert len(state['projekti'])==3
  print('check parent RLS',flush=True)
  # RLS rejection of parent never attempts member INSERT; row survives for retry.
  flags['deny']=True;denied=await create('108');await page.wait_for_function('!_syncInProgress')
  members=len(state['projekt_clanovi']);await add(denied);await page.evaluate('memberTask')
  assert len(state['projekt_clanovi'])==members
  assert await page.evaluate('id=>_projekti.find(p=>p.id===id)._pendingSync&&_OL.loadQueue().some(o=>o.payload.id===id)',denied)
  flags.pop('deny');await page.evaluate('id=>{const q=_OL.loadQueue();q.forEach(o=>{if(o.payload.id===id)delete o._retryAt});localStorage.setItem(_OL.QUEUE,JSON.stringify(q));return _autoPosaljiNoveProjekte()}',denied)
  print('check doznaka',flush=True)
  # Doznaka create uses the same automatic queue; member picker only follows server confirmation.
  await page.evaluate("()=>{switchTab('doznaka');dozShowCreateOdjel();_dozCreateBoundary={type:'Polygon',coordinates:[[[16,44.9],[16.003,44.9],[16.003,44.903],[16,44.9]]]};_dozCreateAreaHa=4}")
  await page.locator('#doz-create-gj').fill('TEST');await page.locator('#doz-create-odjel').fill('109');await page.locator('#doz-create-submit').click()
  did=await page.evaluate('_dozOdjeli[0].id');await page.wait_for_function('id=>!_dozOdjeli.find(o=>o.id===id)._pendingSync',arg=did)
  assert did in state['doz_projects']
  await page.evaluate('async id=>{await dozSelectOdjel(id);await dozAddMember()}',did)
  await page.locator('#doz-member-picker button').filter(has_text='Dodaj').click()
  try:await page.wait_for_function('!_dozPickMember._busy')
  except Exception:
   print('member diagnostics',json.dumps(calls[-20:]),await page.evaluate('({sync:_syncInProgress,busy:_dozPickMember._busy,selection:_dozSelId})'),flush=True);raise
  assert any(row.get('user_id')==B for row in state['doz_project_members'].values())
  print('check missing/auth',flush=True)
  # Cache quota: durable parent survives an unconfirmed local cache, then retry confirms the same UUID.
  await page.evaluate('()=>{window.oldOlSave=_OL.save;_OL.save=function(k,v){return k===_OL.PROJEKTI?false:oldOlSave.call(this,k,v)}}')
  quota=await create('110');await page.wait_for_function('!_syncInProgress')
  assert quota in state['projekti'];assert await page.evaluate('id=>_OL.loadQueue().some(o=>o.payload.id===id)&&_projekti.find(p=>p.id===id)._pendingSync',quota)
  await page.evaluate('id=>{_OL.save=oldOlSave;const q=_OL.loadQueue();q.forEach(o=>{if(o.payload.id===id)delete o._retryAt});localStorage.setItem(_OL.QUEUE,JSON.stringify(q));return _autoPosaljiNoveProjekte()}',quota)
  assert await page.evaluate('id=>!_OL.loadQueue().some(o=>o.payload.id===id)&&_OL.load(_OL.PROJEKTI).some(p=>p.id===id&&!p._pendingSync)',quota)
  # Read confirmation itself can fail: no member write, no fabricated success.
  state['projekti'].pop(id);count=len(state['projekt_clanovi']);await add(id);await page.evaluate('memberTask');assert len(state['projekt_clanovi'])==count
  # Cached auth stub and a foreign owner cannot publish projects automatically.
  await page.evaluate("()=>{sbUser._cachedStub=true;_OL.enqueue({type:'insert_projekt',payload:{id:'cached',korisnik_id:sbUser.id,odjel:'cached',_tempId:'cached'}});return _autoPosaljiNoveProjekte()}")
  assert 'cached' not in state['projekti']
  await page.evaluate("()=>{delete sbUser._cachedStub;sbUser={id:'33333333-3333-4333-8333-333333333333'};return _autoPosaljiNoveProjekte()}")
  assert 'cached' not in state['projekti']
  assert not errors,errors;assert not external,external
  (OUT/'project-sync.json').write_text(json.dumps({'version':'2.8.7','full_app':True,'actual_supabase_js':True,'checks':['delayed parent before member','offline restart + online retry','lost reply idempotence','RLS parent blocks member','doznaka auto + member','missing parent read','cached auth and owner isolation','cache quota preserves parent','field queue and GPS remain local'],'external_writes':external,'errors':errors},indent=2))
  print('OK 2.8.7: full app + real Supabase JS, automatic parents, member ordering, offline restart/retry, lost response/RLS/auth isolation; no external writes')
  await ctx.close();await browser.close()
asyncio.run(main())
