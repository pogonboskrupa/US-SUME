'use strict';
// Doznaka uživo (broadcast tragovi kolega) + minimiziranje stabilizacije GPS-a,
// nad STVARNIM kodom iz glavni.js.
const assert=require('assert'),{izvor}=require('./_izvor');
const src=izvor();let n=0;const t=(m,f)=>{f();n++;console.log('  ok  '+m);};
const fn=(name)=>{const i=src.indexOf('function '+name+'(');assert(i>=0,name);let d=0,k=src.indexOf('{',i);for(let j=k;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)return src.slice(i,j+1);}};
const mk=()=>{
  const layer={adds:[],rem:[],addLayer(x){this.adds.push(x);},removeLayer(x){this.rem.push(x);},addTo(){return this;}};
  const L={layerGroup:()=>layer,polyline:(pts)=>({pts,setLatLngs(p){this.pts=p;return this;},addTo(){return this;}}),circleMarker:()=>({bindTooltip(){return this;},setLatLng(){},addTo(){return this;}})};
  const env={_dozLiveZadnja:{},_dozEkipaZakazi(){},_dozLiveProj:'P1',_dozLiveLayer:null,_dozLiveTrails:{},_DOZ_LIVE_MAX:3,_dozMembers:[{user_id:'a'},{user_id:'b'}],DOZ_ENG_COLORS:['#f00','#0f0'],sbUser:{id:'me'},window:{map:{}},map:{removeLayer(){}},L,_escHtml:x=>x,_dozImeClana:()=>'Ime Prezime'};
  const code=['_dozLiveUkloni','_dozLivePrimi'].map(fn).join('\n');
  const f=new Function(...Object.keys(env),code+';return {_dozLivePrimi,_dozLiveUkloni,get layer(){return _dozLiveLayer;}};');
  return {api:f(...Object.values(env)),env,layer};
};
t('trag kolege iz odjela se crta, a trag nepoznatog korisnika i vlastiti ne',()=>{
  const {api,env}=mk();
  api._dozLivePrimi({uid:'a',pid:'P1',la:44,lo:16});
  api._dozLivePrimi({uid:'zzz',pid:'P1',la:44,lo:16});
  api._dozLivePrimi({uid:'me',pid:'P1',la:44,lo:16});
  api._dozLivePrimi({uid:'b',pid:'DRUGI',la:44,lo:16});
  assert.deepStrictEqual(Object.keys(env._dozLiveTrails),['a']);
});
t('trag je ograničen na _DOZ_LIVE_MAX tačaka',()=>{
  const {api,env}=mk();
  for(let i=0;i<6;i++)api._dozLivePrimi({uid:'a',pid:'P1',la:44+i/1000,lo:16});
  assert.strictEqual(env._dozLiveTrails.a.pts.length,3);
});
t('_dozLiveUkloni briše trag kolege',()=>{
  const {api,env}=mk();api._dozLivePrimi({uid:'a',pid:'P1',la:44,lo:16});api._dozLiveUkloni('a');
  assert.deepStrictEqual(Object.keys(env._dozLiveTrails),[]);
});
t('slanje i prijem su vezani za kanal odjela, a stop se šalje pri završetku',()=>{
  assert(/sb\.channel\('doz-live-' \+ projectId/.test(src));
  assert(/_dozLiveSalji\(lat, lng, acc\)/.test(src));
  assert(/function dozStopGPS[\s\S]{0,900}_dozLiveStop\(\)/.test(src));
});
t('stabilizacija: može se smanjiti, tok se ne prekida, pilula se čisti pri završetku',()=>{
  assert(/function _gpsStabMin\(on\)/.test(src));
  assert(/function _gpsStabFinish[\s\S]{0,500}gstab-pill/.test(src));
  assert(/onclick="_gpsStabMin\(true\)"/.test(src));
});
t('stabilizacija nikad ne blokira ekran: pri izgradnji odmah ide u pilulu, pilula ima otkazivanje',()=>{
  const b=src.slice(src.indexOf('function _buildGpsStabOverlay()'));
  assert(/document\.body\.appendChild\(d\);[\s\S]{0,160}_gpsStabMin\(true\);/.test(b));
  assert(/pill\.lastChild\.onclick = \(\) => _gpsStabCancel\(\)/.test(src));
});
console.log(n+' prošlo, 0 palo');
