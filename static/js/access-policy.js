/* Probni pristup: rok stiže u zaštićenom profilu sa servera. Odobrenje/uloge ostaju zasebne. */
(function(root){
'use strict';
function state(p,now=Date.now()){
 if(!p)return {kind:'missing',allowed:false};
 if(p.is_admin===true||p.odobren!==false)return {kind:'approved',allowed:true};
 if(p.prvo_odobren_at!=null)return {kind:'revoked',allowed:false};
 const expires=typeof p.probni_do==='string'?Date.parse(p.probni_do):NaN;
 if(!Number.isFinite(expires))return {kind:'pending',allowed:false};
 return {kind:now<expires?'trial':'expired',allowed:now<expires,expires,remaining:Math.max(0,expires-now)};
}
function watch(getProfile,onBlocked){
 let timer=null,stopped=false;
 function stop(){stopped=true;if(timer!=null)root.clearTimeout(timer);root.document?.removeEventListener('visibilitychange',check);}
 function check(){
  if(stopped)return;if(timer!=null)root.clearTimeout(timer);timer=null;
  const s=state(getProfile());
  if(s.kind==='approved'||s.kind==='missing'){stop();return;}
  if(!s.allowed){stop();onBlocked(s);return;}
  timer=root.setTimeout(check,Math.max(1,Math.min(60000,s.remaining)));
 }
 if(state(getProfile()).kind==='trial'){root.document?.addEventListener('visibilitychange',check);check();}
 return stop;
}
root.AccessPolicy={state,canUse:(p,now)=>state(p,now).allowed,watch};
})(window);
