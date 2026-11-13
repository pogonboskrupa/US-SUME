// v4.4.3: slanje traga kolegi SA slikama (jedan KML, slike kao data: URI), uz smanjenje do ograničenja.
const assert=require('assert');const src=require('./_izvor').izvor();
const ex=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}};
const mk=(max,full)=>new Function('_kmlcGet','_PRIM_MAX_BAJTA','Blob','_escXml','_tragIme','_hexToKmlColor',ex('_tragToKml')+ex('_tragKmlSaSlikama')+';return _tragKmlSaSlikama;')
 (async k=>full,max,class{constructor(a){this.size=a.join('').length}},s=>String(s),t=>t.name,()=>'ff0000ff');
const t={name:'Trag 1',pts:[[44.8,16.1],[44.81,16.11]],fotos:[1,2,3].map(i=>({la:44.8,lo:16.1+i/1000,ts:i,thumb:'data:image/jpeg;base64,'+'T'.repeat(100)}))};
const pun='data:image/jpeg;base64,'+'F'.repeat(5000);
(async()=>{
 let r=await mk(100000,pun)(t);assert.equal(r.poslano,3);assert(!r.smanjeno);assert((r.kml.match(/FFFFF/g)||[]).length>0,'pune slike');
 assert.equal((r.kml.match(/<Point>/g)||[]).length,3,'tačka po slici');
 r=await mk(3000,pun)(t);assert.equal(r.poslano,3);assert(r.smanjeno);assert(!/FFFFF/.test(r.kml),'smanjene kad pune ne stanu');
 r=await mk(1000,pun)(t);assert(r.poslano<3&&r.poslano>=0);assert(r.kml.length<=1000||r.poslano===0,'samo koliko stane');
 assert(/_tragPosaljiSaSlikama\(t\)/.test(src),'akcija SA slikama u izvozu traga');
 assert(/length >= 30\) \{/.test(src),'31. slika ne nestaje tiho');
 console.log('ok trag sa slikama');
})().catch(e=>{console.error(e);process.exit(1)});
