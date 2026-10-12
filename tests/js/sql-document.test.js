'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
require('../../static/js/sql-document.js');const {SqlDocument}=globalThis;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sqlite-doc-'));
(async()=>{try{
 const SQL=await require('../../static/libs/sql-wasm.js')();
 cp.execFileSync('python3',['-c',`
import sqlite3,sys
from pathlib import Path
p=Path(sys.argv[1]);c=sqlite3.connect(p/'normalized.mbtiles')
c.executescript('CREATE TABLE metadata(name TEXT,value TEXT); INSERT INTO metadata VALUES("minzoom","13"),("maxzoom","13"),("format","png"); CREATE TABLE images(tile_id TEXT PRIMARY KEY,tile_data BLOB) WITHOUT ROWID; CREATE TABLE map(zoom_level INT,tile_column INT,tile_row INT,tile_id TEXT,UNIQUE(zoom_level,tile_column,tile_row)); CREATE VIEW tiles AS SELECT zoom_level,tile_column,tile_row,tile_data FROM map JOIN images USING(tile_id);')
for i in range(1024):
 c.execute('INSERT INTO images VALUES(?,?)',(str(i),b'\\x89PNG'+i.to_bytes(4,'big')+bytes(32760)));c.execute('INSERT INTO map VALUES(13,?,5251,?)',(4462+i,str(i)))
c.commit();c.close()
`,dir]);
 const large=path.join(dir,'large.sqlitedb');fs.copyFileSync(path.join(__dirname,'../fixtures/rmaps-mini.sqlitedb'),large);fs.truncateSync(large,1_500_000_000);
 for(const [file,fmt,x,column]of [[large,'rmaps',4463,'image'],[path.join(dir,'normalized.mbtiles'),'mbtiles',5485,'tile_data']]){
  const fd=fs.openSync(file,'r');let calls=0,total=0;const size=fs.statSync(file).size;
  const source=SqlDocument.source(size,(offset,count)=>{calls++;total+=count;const bytes=new Uint8Array(count);assert.equal(fs.readSync(fd,bytes,0,count,offset),count);return bytes;});
  const start=performance.now(),db=SQL.openReadOnlyFile(source),meta=SqlDocument.metadata(db,fmt);
  const [pz,px,py]=meta.meta._preview;
  assert.ok(pz>=0&&pz<=22&&px>=0&&py>=0&&px<2**pz&&py<2**pz);
  const preview=fmt==='rmaps'?db.exec('SELECT image FROM tiles WHERE x=? AND y=? AND z=?',[px,py,17-pz])[0].values[0][0]:db.exec('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',[pz,px,2**pz-1-py])[0].values[0][0];
  assert.equal(preview[0],137,'Preview coordinates point to an existing raster tile');
  const tile=fmt==='rmaps'?db.exec('SELECT image FROM tiles WHERE x=? AND y=2940 AND z=4',[x])[0].values[0][0]:db.exec('SELECT tile_data FROM tiles WHERE zoom_level=13 AND tile_column=? AND tile_row=5251',[x])[0].values[0][0];
  assert.equal(tile[0],137);if(fmt==='rmaps')assert.deepEqual([meta.meta.minzoom,meta.meta.maxzoom],[12,14]);else assert.equal(new DataView(tile.buffer,tile.byteOffset+4,4).getUint32(0),1023);
  assert.throws(()=>db.run('DELETE FROM '+(fmt==='rmaps'?'tiles':'images')),/readonly|read-only|read only/i);
  assert.ok(total<=2097152,'Opening/last tile must read <2 MB, never the whole database');
  console.log(JSON.stringify({file:path.basename(file),size,calls,bytesRead:total,openAndTileMs:Math.round(performance.now()-start),cacheBytes:source.cacheBytes(),readonly:true}));
  db.close();assert.equal(fs.statSync(file).size,size);fs.closeSync(fd);
 }
 const cache=SqlDocument.source(100*65536,(a,n)=>new Uint8Array(n));for(let i=0;i<100;i++)cache.readAt(new Uint8Array(1),0,1,i*65536);assert.equal(cache.cacheBytes(),64*65536);
 assert.throws(()=>SqlDocument.source(100,()=>new Uint8Array(0)).readAt(new Uint8Array(1),0,1,0),/Nepotpuno/);
 const legacy=new SQL.Database(fs.readFileSync(path.join(__dirname,'../fixtures/mbtiles-mini.mbtiles')));assert.ok(legacy.exec('SELECT count(*) FROM tiles')[0].values[0][0]>0);legacy.close();
 console.log('Read-only VFS: real 1.5 GB file, normalized overflow images, binary tile, bounded cache, short read and unchanged legacy engine — OK');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
