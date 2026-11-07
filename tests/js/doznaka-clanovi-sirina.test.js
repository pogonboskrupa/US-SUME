'use strict';
// Širina pojasa je UKUPNA (pola po strani) + dodavanje projektanata (terenski profil, šumarija).
const assert=require('assert'),{izvor}=require('./_izvor');
const src=izvor(),html=require('fs').readFileSync('index.html','utf8');let n=0;const t=(m,f)=>{f();n++;console.log('  ok  '+m);};
const fn=name=>{const i=src.indexOf('function '+name+'(');assert(i>=0,name);let d=0,k=src.indexOf('{',i);for(let j=k;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)return src.slice(i,j+1);}};
t('pola širine ide u bafer: 20 m ukupno = 10 m po strani',()=>{
  for(const [ukupno,pola] of [[20,10],[10,5],[40,20],[15,7.5]]){
    const f=new Function('_DOZ_BAND_OUTER_M',fn('_dozPojasPolovina')+';return _dozPojasPolovina();');
    assert.strictEqual(f(ukupno),pola);
  }
});
t('bafer i DozBands dobijaju polovinu, ne punu vrijednost',()=>{
  assert(/DozBands\.build\(userTracks,bndFeat,_dozPojasPolovina\(\),turf\)/.test(src));
  assert(/let bufDist = _dozPojasPolovina\(\);/.test(src));
  assert(!/bufDist = _DOZ_BAND_OUTER_M/.test(src));
});
t('izbor širine kaže ukupno i po strani, zadano 20 (10+10)',()=>{
  assert(/Širina pojasa:/.test(html)&&/20 m \(10 \+ 10, zadano\)/.test(html));
});
t('terenski profil ne može dodati projektanta (doznaka, projekat, potvrda)',()=>{
  for(const f of ['dozAddMember','openDodajClanPanel','confirmDodajClanove']){
    const body=src.slice(src.indexOf('function '+f+'('));
    assert(/^[^{]*\{\s*if \(isSpdField\(\)\)/.test(body),f);
  }
  assert(/doz-add-member-btn/.test(html)&&/_dozAddBtn\.style\.display = \(typeof isSpdField/.test(src));
  assert(/_addSec\.style\.display = isSpdField\(\) \? 'none'/.test(src));
});
t('projekt nudi samo korisnike iz šumarije projekta, doznaka provjerava šumariju',()=>{
  assert(/k\.sumarija === _pdSum/.test(src));
  assert(/u\.sumarija === me\.sumarija/.test(src));
});
console.log(n+' prošlo, 0 palo');
