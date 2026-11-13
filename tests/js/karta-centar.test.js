// v4.5.0: promjena karte zadržava centar; obavijest o ažuriranju — regex u Postgresu najviše 255 ponavljanja.
const fs=require('fs'),assert=require('assert');const src=require('./_izvor').izvor();
const f=src.slice(src.indexOf('function setLayerSqlite('),src.indexOf('function setLayerSqlite(')+1800);
assert(!/_sqlmapMetaAutoZoom\(sl\.meta/.test(f),'setLayerSqlite ne pomjera pogled');
assert(!/setLayerSqlite\(idx\);_sqlmapMetaAutoZoom/.test(src),'_loadmapShow ne pomjera pogled');
assert(/setLayerSqlite\(_sqlLayers\.length-1\);_sqlmapMetaAutoZoom\(result\.meta,name\)/.test(src),'novi uvoz i dalje centrira na kartu');
const sql=fs.readFileSync('supabase/migrations/20261121_obavijest_azuriranje.sql','utf8');
for(const m of sql.matchAll(/\{(\d+),(\d+)\}/g))assert(+m[2]<=255,'Postgres: najviše 255 ponavljanja → '+m[0]);
console.log('ok centar / regex');
