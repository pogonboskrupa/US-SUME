/* Aktivnost je rad u aplikaciji, ne autentikacija niti otvoren neaktivan ekran. */
(function(root){
'use strict';
let busy=false,lastTry=0,missingUntil=0,noVer=false;
function appVer(){try{return typeof APP_VER==='string'?APP_VER:null;}catch(e){return null;}}
// APK ima native mostove; webapp (Pages) ih nema.
function platforma(){return root.AndroidUpdate||root.AndroidGps?'apk':'web';}
const key=uid=>'dendro_activity_pending_v1:'+uid;
function owner(){return typeof sbUser!=='undefined'?sbUser?.id:null;}
function touch(gps=false){const uid=owner();if(!uid||!gps&&document.visibilityState!=='visible')return;try{localStorage.setItem(key(uid),String(Date.now()));}catch(e){}flush();}
async function flush(){
 const uid=owner();if(!uid||busy||Date.now()<missingUntil||typeof sb==='undefined'||!sb||Date.now()-lastTry<60000)return;
 if(typeof _mrezaProbaj==='function'?!_mrezaProbaj():!navigator.onLine)return;
 let stamp;try{stamp=Number(localStorage.getItem(key(uid)));}catch(e){return;}if(!Number.isFinite(stamp)||stamp<=0)return;
 busy=true;lastTry=Date.now();
 const controller=new AbortController();let timer;
 const observed=new Date(stamp).toISOString(),ver=appVer();
 const call=withVer=>{const req=withVer
   ?sb.rpc('app_record_activity_ver',{p_user_id:uid,p_observed_at:observed,p_app_ver:ver,p_platforma:platforma()})
   :sb.rpc('app_record_activity_for_user',{p_user_id:uid,p_observed_at:observed});
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({error:{code:'TIMEOUT'}});},12000);});
  return Promise.race([req.abortSignal?req.abortSignal(controller.signal):req,timeout]);};
 const missing=e=>e&&(e.code==='PGRST202'||e.code==='42883');
 try{let {error}=await call(!!ver&&!noVer);
  // Migracija verzije još nije pokrenuta: aktivnost ide starim putem.
  if(missing(error)&&ver&&!noVer){noVer=true;clearTimeout(timer);({error}=await call(false));}
  if(error){if(missing(error))missingUntil=Date.now()+300000;return;}
  if(owner()===uid&&Number(localStorage.getItem(key(uid)))===stamp)localStorage.removeItem(key(uid));
 }catch(e){}finally{clearTimeout(timer);busy=false;}
}
function gpsWork(){
 const recording=(typeof recOn!=='undefined'&&recOn&&!recPaused)||(typeof _dozGpsOn!=='undefined'&&_dozGpsOn&&!_dozGpsPaused)||(typeof _tragOn!=='undefined'&&_tragOn&&!_tragPaused);
 const fix=Math.max(typeof _lastGpsFixTime!=='undefined'?_lastGpsFixTime:0,typeof _dozLastLiveFixTs!=='undefined'?_dozLastLiveFixTs:0);
 if(recording&&fix&&Date.now()-fix<120000)touch(true);else flush();
}
root.UserActivity={touch,flush};
if(typeof document!=='undefined'){
 for(const ev of ['pointerdown','keydown'])document.addEventListener(ev,e=>{if(e.isTrusted)touch();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')flush();});
 root.addEventListener('online',flush);setInterval(gpsWork,60000);
}
})(typeof window!=='undefined'?window:globalThis);
