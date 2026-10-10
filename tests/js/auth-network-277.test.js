'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const login=html.slice(html.indexOf('async function doLogin()'),html.indexOf('// --- Register ---'));
const network=html.slice(html.indexOf('function _isNetworkErr('),html.indexOf('// Prolazna greška SERVERA'));
async function run({online=true,quality='dobra',lookup={data:'test@example.invalid',error:null},signError=null,cached=null,saved=null}={}){
 const messages=[],calls=[];let entered=0;
 const fields={'auth-ime':{value:'Test'},'auth-prezime':{value:'K'},'auth-pin':{value:'123456'},'auth-err':{style:{}},'auth-zapamti':{checked:false}};
 const env={document:{getElementById:k=>fields[k]},navigator:{onLine:online},_profileLoad:()=>cached,_loadSavedUser:()=>saved,_mrezaProbaj:()=>quality==='dobra',_mrezaStanje:()=>quality,_mrezaSila:ms=>calls.push(['sila',ms]),_setOfflineMode:()=>{},showApp:()=>entered++,showToast:()=>{},showAuthErr:m=>messages.push(m),_authBusy:()=>{},_clearSavedUser:()=>{},localStorage:{setItem(){}},sbLoadProfile:async()=>{},sb:{rpc:async()=>{calls.push(['rpc']);if(lookup instanceof Error)throw lookup;return lookup},auth:{signInWithPassword:async()=>{calls.push(['signin']);return {error:signError}},getUser:async()=>({data:{user:{id:'u'}}})}}};
 const args=Object.keys(env),api=new Function(...args,`let _authInFlight=false,_appEntered=false,sbUser=null,sbProfile=null;const _SAVED_USER_KEY='saved';${network}${login};return {doLogin,locked:()=>_authInFlight}`)(...Object.values(env));
 await api.doLogin();assert(!api.locked(),'Neuspjela prijava mora dozvoliti ponovni pokušaj');return {messages,calls,entered};
}
(async()=>{
 for(const error of [{message:'AbortError: Failed to fetch (nema veze — radi se lokalno)',code:''},Object.assign(new Error('Network timeout'),{name:'TimeoutError'})]){
  const r=await run({lookup:error instanceof Error?error:{error,data:null},cached:{id:'old'}});assert(r.messages.at(-1).includes('Veza sa serverom'));assert(!r.messages.at(-1).includes('Korisnik nije pronađen'));assert.equal(r.entered,0);assert.equal(r.calls.filter(c=>c[0]==='signin').length,0);
 }
 const missing=await run({lookup:{data:null,error:null}});assert(missing.messages.at(-1).startsWith('Korisnik nije pronađen'));
 const db=await run({lookup:{data:null,error:{message:'permission denied',code:'42501'}}});assert(db.messages.at(-1).includes('Server nije mogao'));assert.equal(db.entered,0);
 const weak=await run({quality:'slaba'});assert.equal(weak.entered,1);assert.deepEqual(weak.calls.map(c=>c[0]),['sila','rpc','signin']);
 const offline=await run({online:false,quality:'nema'});assert.equal(offline.calls.length,0);assert.equal(offline.entered,0);
 const signNetwork=await run({signError:{message:'Failed to fetch',status:0}});assert(signNetwork.messages.at(-1).includes('Veza sa serverom'));assert.equal(signNetwork.entered,0);
 const wrong=await run({signError:{message:'Invalid login credentials',status:400}});assert(wrong.messages.at(-1).startsWith('Pogrešan PIN'));assert.equal(wrong.entered,0);
 const cached=await run({online:false,quality:'nema',cached:{id:'u'},saved:{ime:'Test',pin:'123456'}});assert.equal(cached.entered,1);assert.equal(cached.calls.length,0);
 console.log('OK: Abort/fetch/timeout ≠ nepostojeći nalog, ručna prijava na slaboj vezi, PIN/RLS greške i siguran offline keš');
})().catch(e=>{console.error(e);process.exitCode=1});
