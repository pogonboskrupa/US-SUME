'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const HTML=require('./_izvor').izvor();
const POC='const _SQL_WORKER_SRC = `';const a=HTML.indexOf(POC)+POC.length;let j=a;for(;;){j=HTML.indexOf('`',j);if(HTML[j-1]!=='\\')break;j++;}
const SRC=new Function('_SQLJS_CDN','_SQLJS_LOCAL','return `'+HTML.slice(a,j)+'`;')('c/','l/');
const M=new Function(SRC.slice(SRC.indexOf('class MiniSqlite {'),SRC.indexOf('// ── Kraj MiniSqlite'))+'\nreturn MiniSqlite;')();
(async()=>{
 const buf=fs.readFileSync(__dirname+'/../fixtures/mbtiles-mini.mbtiles');
 const file={size:buf.length,slice:(p,q)=>({arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset+p,buf.byteOffset+Math.min(q,buf.length))})};
 const m=new M(file);await m.init();
 const z=13,x=4462,y=2940,tms=(1<<z)-1-y;
 let upiti=0;const orig=m._tile.bind(m);m._tile=async(...a)=>{upiti++;return orig(...a);};
 // Prije dokaza: promašaj košta dva upita (TMS pa XYZ)
 upiti=0;assert.equal(await m.tile(z,999,999),null);assert.equal(upiti,2);
 // Fixture je TMS: pogodak na prvom pokušaju, a poslije 8 pogodaka orijentacija se zaključava
 for(let i=0;i<9;i++)assert.ok(await m.tile(z,x,y)||await m.tile(z,x,tms),'pogodak');
 // (fixture čuva jedan smjer; zaključavanje mora biti ili 't' ili 'x', nikad pogrešno za pogotke)
 assert.ok(m._ori==='t'||m._ori==='x','orijentacija zaključana poslije 8+ pogodaka u istom smjeru, a ima '+m._ori);
 upiti=0;assert.equal(await m.tile(z,999,999),null);assert.equal(upiti,1,'promašaj poslije zaključavanja košta jedan upit');
 assert.ok(await m.tile(z,x,y),'pogodak i dalje radi poslije zaključavanja');
 // Trovanje: 1 pogodak u suprotnom smjeru (init dijagnostika) ne smije zaključati pogrešno
 const m2=new M(file);await m2.init();m2._oriNote('x');for(let i=0;i<8;i++)m2._oriNote('t');
 assert.equal(m2._ori,'t');
 const m3=new M(file);await m3.init();for(let i=0;i<8;i++){m3._oriNote('t');m3._oriNote('x');}
 assert.equal(m3._ori,undefined,'mješoviti uzorak se ne zaključava');
 console.log('OK mbtiles orijentacija');
})().catch(e=>{console.error(e);process.exit(1);});
