const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes={'installed-local-list':{},'installed-local-count':{},'mapfav-grid':{},'mapfav-count':{}};
const layerA={},layerB={},base={};const active=new Set([layerB,base]);
const c={window:{},document:{getElementById:id=>nodes[id],addEventListener:()=>{}},map:{hasLayer:l=>active.has(l)},
 _sqlLayers:[{name:'Odjel 10 <test>',fmt:'mbtiles',visible:false,layer:layerA},{name:'Odjel 2',fmt:'gpkg',visible:true,layer:layerB}],
 _sqlRestoreFailed:[{name:'Odjel 10 <test>',deferred:true},{name:'Odjel 3',deferred:true},{name:'Odjel 4',error:'loš fajl'}],
 _mapFavs:[{id:'1',name:'Karta <A>',type:'sqlite',sqliteId:'Odjel 2'},{id:'2',name:'Nedostaje',type:'sqlite',sqliteId:'Obrisana'},
 {id:'3',name:'Topo',type:'tl',tlKey:'Topo'}],TL:{Topo:base},_activeLayerKey:()=> 'Topo',_mapFavThumbHtml:()=>'<svg></svg>'};
vm.runInNewContext(fs.readFileSync('static/js/map-catalog.js','utf8'),c);const api=c.window.MapCatalog;
assert.deepEqual(Array.from(api.localRows(),r=>r.name),['Odjel 2','Odjel 3','Odjel 4','Odjel 10 <test>']);
api.renderInstalled();assert.equal(nodes['installed-local-count'].textContent,'4 karata na telefonu');
assert(nodes['installed-local-list'].innerHTML.includes('Odjel 10 &lt;test&gt;'));assert(!nodes['installed-local-list'].innerHTML.includes('Odjel 10 <test>'));
assert.equal(api.favoriteState(c._mapFavs[0]).active,true);assert.equal(api.favoriteState(c._mapFavs[1]).available,false);
api.renderFavorites();assert(nodes['mapfav-grid'].innerHTML.includes('Karta &lt;A&gt;'));assert(nodes['mapfav-grid'].innerHTML.includes('disabled'));
assert(nodes['mapfav-grid'].innerHTML.includes('offline samo sačuvani dijelovi'));
assert.equal(c._sqlLayers.length,2);assert.equal(c._sqlRestoreFailed.length,3);
console.log('OK: lokalne/odgođene karte, sortiranje, aktivnost, sigurna imena i offline oznake omiljenih');
