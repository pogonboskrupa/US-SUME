// v4.4.0: GJ po šumarijama vodi admin; projektant bira iz padajućeg spiska ili upiše svoju.
const fs=require('fs'),assert=require('assert');
const src=require('./_izvor').izvor(),html=fs.readFileSync('index.html','utf8');
const mig=fs.readFileSync('supabase/migrations/20261120_gospodarske_jedinice.sql','utf8');
assert(/je_admin\(\)/.test(mig)&&/admin_gj_dodaj/.test(mig)&&/admin_gj_obrisi/.test(mig)&&/je_odobren\(\)/.test(mig));
assert(/'ŠUMARIJA BOS\.KRUPA','Risovac Krupa'/.test(mig),'Krupa spisak prenesen');
assert(html.includes('id="menu-gj-item"')&&html.indexOf('id="menu-gj-item"')>html.indexOf('id="menu-admin-item"'),'meni poslije Korisnici');
// logika spiska
const ex=n=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}};
const st={};const ls={getItem:k=>k in st?st[k]:null,setItem:(k,v)=>st[k]=String(v)};
const f=new Function('localStorage','sbProfile','sbUser',"const _GJ_SRV_KEY='tvlake_gj_srv_v1',_GJ_MOJE_KEY='tvlake_gj_moje_v1:',_GJ_KRUPA_UGRADJENO=['Risovac Krupa','Vojskova'];"+ex('_gjSrvKes')+ex('_gjSrvZa')+ex('_gjMoje')+ex('_gjOpcije')+ex('_gjZapamti')+';return {_gjOpcije,_gjZapamti,_gjSrvZa};');
let g=f(ls,{sumarija:'ŠUMARIJA BOS.KRUPA'},{id:'u1'});
assert.deepEqual(g._gjOpcije(),['Risovac Krupa','Vojskova'],'bez keša: ugrađeni Krupa spisak');
g=f(ls,{sumarija:'ŠUMARIJA CAZIN'},{id:'u1'});assert.deepEqual(g._gjOpcije(),[],'Cazin bez keša prazno');
st['tvlake_gj_srv_v1']=JSON.stringify([{id:'1',sumarija:'ŠUMARIJA CAZIN',naziv:'Pećigrad'},{id:'2',sumarija:'ŠUMARIJA BIHAĆ',naziv:'Plješevica'}]);
assert.deepEqual(g._gjOpcije(),['Pećigrad'],'samo GJ svoje šumarije');
g._gjZapamti('Moja GJ');g._gjZapamti('pećigrad');
assert.deepEqual(g._gjOpcije(),['Pećigrad','Moja GJ'],'vlastita GJ se pamti, duplikat admin GJ ne');
assert(/<option value="_custom">Druga GJ \(upiši\)…<\/option>/.test(src),'uvijek postoji opcija upisa');
console.log('ok gospodarske jedinice');
