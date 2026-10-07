'use strict';
// Real SQLite B-trees with overflow images; page I/O is measured, not a padded tiny database.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maps-248-'));
cp.execFileSync('python3',['-c',`
import sqlite3,sys
from pathlib import Path
p=Path(sys.argv[1])
for name,n,size,tail in [('cover.mbtiles',1024,32768,' WITHOUT ROWID'),('scan.mbtiles',2048,8192,'')]:
 c=sqlite3.connect(p/name)
 c.execute('CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB'+(',PRIMARY KEY(zoom_level,tile_column,tile_row)' if tail else '')+')'+tail)
 c.executemany('INSERT INTO tiles VALUES(?,?,?,?)',((14,8000+i,11000,b'\\x89PNG'+i.to_bytes(4,'big')+bytes(size-8)) for i in range(n)))
 c.commit();c.close()
`,dir]);
const html=fs.readFileSync(process.env.SQLMAP_HTML||path.join(__dirname,'../../index.html'),'utf8');
const begin=html.indexOf('const _SQL_WORKER_SRC = `')+'const _SQL_WORKER_SRC = `'.length;let end=begin;
for(;;){end=html.indexOf('`',end);if(html[end-1]!=='\\')break;end++;}
const src=new Function('_SQLJS_CDN','_SQLJS_LOCAL','return `'+html.slice(begin,end)+'`;')('cdn/','local/');
const Mini=new Function(src.slice(src.indexOf('class MiniSqlite {'),src.indexOf('// ── Kraj MiniSqlite'))+';return MiniSqlite')();
async function check(name,index,limit){
 const bytes=fs.readFileSync(path.join(dir,name));let reads=0;
 const m=new Mini({size:bytes.length,slice:(a,b)=>({arrayBuffer:async()=>{reads++;return bytes.buffer.slice(bytes.byteOffset+a,bytes.byteOffset+Math.min(b,bytes.length));}})});
 const start=performance.now();await m.init();const initReads=reads;reads=0;m._c.clear();
 const data=await m.tile(14,8000+index,16383-11000);assert.ok(data);assert.equal(new DataView(data.buffer,data.byteOffset+4,4).getUint32(0),index);
 const result={name,size:bytes.length,initReads,tileReads:reads,milliseconds:Math.round(performance.now()-start)};console.log(JSON.stringify(result));
 if(!process.env.SQLMAP_BASELINE){assert.ok(initReads<=12,'Opening must not fetch sample image overflow pages');assert.ok(reads<=limit,'Only the matching image should be read: '+JSON.stringify(result));}
 if(name==='cover.mbtiles')assert.equal(await m.tile(14,7999,16383-11000),null);
}
(async()=>{try{await check('cover.mbtiles',1000,35);await check('scan.mbtiles',0,5);await check('scan.mbtiles',2000,300);}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
