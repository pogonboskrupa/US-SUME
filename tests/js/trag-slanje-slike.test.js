// v4.4.3: slanje traga kolegi SA slikama (jedan KML, slike kao data: URI), uz smanjenje do ograničenja.
// v4.7.6: kad pune slike ne stanu, slike se ponovo sažimaju na čitljiv format (720→300 px), ne na sličice od 60 px.
const assert=require('assert');const src=require('./_izvor').izvor();
const ex=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}};
const cst=n=>{const a=src.indexOf('const '+n+' = ');return src.slice(a,src.indexOf(';\n',a)+2);};
const mk=(max,full)=>new Function('_kmlcGet','_PRIM_MAX_BAJTA','Blob','_escXml','_tragIme','_hexToKmlColor',cst('_TRAG_SLIKE_NIVOI')+ex('_tragToKml')+ex('_tragKmlSaSlikama')+';return _tragKmlSaSlikama;')
 (async k=>full,max,class{constructor(a){this.size=a.join('').length}},s=>String(s),t=>t.name,()=>'ff0000ff');
const t={name:'Trag 1',pts:[[44.8,16.1],[44.81,16.11]],fotos:[1,2,3].map(i=>({la:44.8,lo:16.1+i/1000,ts:i,thumb:'data:image/jpeg;base64,'+'T'.repeat(100)}))};
const pun='data:image/jpeg;base64,'+'F'.repeat(5000);
const pozivi=[];
// Lažno sažimanje: veličina raste sa kvadratom stranice, kao stvaran JPEG.
const smanji=async(du,px,q)=>{pozivi.push(px);return 'data:image/jpeg;base64,'+'S'.repeat(Math.round(5000*(px/900)*(px/900)));};
(async()=>{
 let r=await mk(100000,pun)(t,smanji);assert.equal(r.poslano,3);assert(!r.smanjeno);assert((r.kml.match(/FFFFF/g)||[]).length>0,'pune slike');
 assert.equal((r.kml.match(/<Point>/g)||[]).length,3,'tačka po slici');
 assert.equal(pozivi.length,0,'kad stane, ništa se ne sažima');
 r=await mk(3000,pun)(t,smanji);assert.equal(r.poslano,3);assert(r.smanjeno);assert(!/FFFFF/.test(r.kml),'pune ne idu kad ne stanu');
 assert(/SSSSS/.test(r.kml)&&!/TTTTT/.test(r.kml),'sažete čitljive slike, ne sličice od 60 px');
 assert(r.px>=300&&r.kml.length<=3000,'stane uz čitljiv format: '+r.px);
 assert(!pozivi.includes(720),'nivoi koji očito ne staju se preskaču (bez sažimanja 5 puta)');
 // Sažimanje ne uspije (oštećena slika) → ta slika ide kao sličica, ostale normalno.
 r=await mk(3000,pun)(t,async()=>{throw new Error('x');});assert.equal(r.poslano,3);assert(/TTTTT/.test(r.kml),'rezerva: sličica');
 r=await mk(1000,pun)(t,smanji);assert(r.poslano<3&&r.poslano>=0);assert(r.kml.length<=1000||r.poslano===0,'samo koliko stane');
 assert(/_tragPosaljiSaSlikama\(t\)/.test(src),'akcija SA slikama u izvozu traga');
 assert(/length >= 30\) \{/.test(src),'31. slika ne nestaje tiho');
 console.log('ok trag sa slikama');
})().catch(e=>{console.error(e);process.exit(1)});
