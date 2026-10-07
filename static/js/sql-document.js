/* Read-only sql.js filesystem over seekable Android documents; bounded 4 MB page cache. */
(function(root){
  'use strict';
  function source(size,read){
    const chunks=new Map(),chunkSize=65536,maxChunks=64;
    return {size,readAt(heap,offset,length,position){
      const count=Math.max(0,Math.min(length,size-position));let done=0;
      while(done<count){
        const at=position+done,key=Math.floor(at/chunkSize),start=key*chunkSize;
        let bytes=chunks.get(key);
        if(bytes){chunks.delete(key);chunks.set(key,bytes);}
        else{
          const n=Math.min(chunkSize,size-start);bytes=read(start,n);
          if(!(bytes instanceof Uint8Array)||bytes.length!==n)throw Error('Nepotpuno čitanje karte');
          chunks.set(key,bytes);if(chunks.size>maxChunks)chunks.delete(chunks.keys().next().value);
        }
        const inside=at-start,n=Math.min(count-done,bytes.length-inside);
        heap.set(bytes.subarray(inside,inside+n),offset+done);done+=n;
      }
      return done;
    },cacheBytes:()=>Array.from(chunks.values()).reduce((sum,b)=>sum+b.length,0)};
  }
  function httpSource(size,url){
    return source(size,(at,length)=>{
      // Sync I/O exists only inside the dedicated SQL Worker, never the UI thread.
      const xhr=new XMLHttpRequest();xhr.open('GET',url+'/read/'+at+'/'+length,false);xhr.responseType='arraybuffer';xhr.send();
      if(xhr.status!==200)throw Error('Fajl karte nije dostupan — ponovo ga odaberi');
      return new Uint8Array(xhr.response);
    });
  }
  function metadata(db,fmt){
    const one=(sql,args)=>db.exec(sql,args)[0]?.values?.[0];const m={};
    const exists=t=>!!one("SELECT 1 FROM sqlite_master WHERE name=? LIMIT 1",[t]);
    const quote=t=>'"'+t.replace(/"/g,'""')+'"';let table='tiles';
    if(fmt==='gpkg')table=one("SELECT table_name FROM gpkg_contents WHERE data_type='tiles' LIMIT 1")?.[0];
    if(!table)throw Error('Nedostaju raster pločice');
    if(exists('metadata'))for(const [k,v]of db.exec('SELECT name,value FROM metadata LIMIT 256')[0]?.values||[])if(k&&!String(k).startsWith('_'))m[k]=v;
    if(String(m.format).toLowerCase()==='pbf')throw Error('Odaberi raster MBTiles kartu (ova sadrži PBF podatke)');
    let lo=0,hi=22,zOff=17;const rm=fmt==='rmaps',zcol=(rm||fmt==='alpinequest')?'z':'zoom_level',xcol=(rm||fmt==='alpinequest')?'x':'tile_column',ycol=(rm||fmt==='alpinequest')?'y':'tile_row';
    const sample=one('SELECT '+[zcol,xcol,ycol].map(quote).join(',')+' FROM '+quote(table)+' LIMIT 1');
    if(rm&&sample){const inv=17-sample[0];if(inv<0||inv>22||sample[1]>=2**inv||sample[2]>=2**inv)zOff=0;hi=zOff||22;}
    const webZ=sample?(rm&&zOff?zOff-sample[0]:sample[0]):null;
    if(rm&&exists('info')){
      const info=one('SELECT minzoom,maxzoom FROM info LIMIT 1');
      if(info){lo=Math.min(+info[0],+info[1]);hi=Math.max(+info[0],+info[1]);if(zOff&&sample&&sample[0]>=lo&&sample[0]<=hi&&(webZ<lo||webZ>hi)){const a=lo;lo=zOff-hi;hi=zOff-a;}}
    }
    if(!rm&&!('minzoom'in m)&&!('maxzoom'in m)){
      const sql='SELECT '+quote(zcol)+' FROM '+quote(table)+' ORDER BY '+quote(zcol);
      const plan=db.exec('EXPLAIN QUERY PLAN '+sql+' LIMIT 1')[0]?.values||[];
      if(!plan.some(r=>String(r[3]).includes('TEMP B-TREE'))){lo=+(one(sql+' ASC LIMIT 1')?.[0]??lo);hi=+(one(sql+' DESC LIMIT 1')?.[0]??hi);}
    }
    if(!('minzoom'in m))m.minzoom=lo;if(!('maxzoom'in m))m.maxzoom=hi;
    if(sample&&!m.center&&!m.bounds&&webZ>=0&&webZ<=22){
      const n=2**webZ,yy=fmt==='mbtiles'?n-1-sample[2]:sample[2];
      const lon=(sample[1]+.5)/n*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(yy+.5)/n)))*180/Math.PI;
      m.center=lon+','+lat+','+webZ;
    }
    return {meta:m,zOff,table};
  }
  root.SqlDocument={source,httpSource,metadata};
})(typeof self!=='undefined'?self:globalThis);
