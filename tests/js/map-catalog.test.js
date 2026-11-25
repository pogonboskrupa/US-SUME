const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes={'installed-local-list':{},'installed-local-count':{},'mapfav-grid':{},'mapfav-count':{},'ls-sqlite-in-grid':{},'ls-offline-count':{}};
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

c._sqlRestoreFailed.push({name:'A — odgođena',deferred:true});
assert.equal(api.localRows()[0].name,'Odjel 2','Aktivna karta mora biti prva i ispred abecedno ranijih odgođenih karata');
api.renderOffline();assert(nodes['ls-sqlite-in-grid'].innerHTML.includes('aria-pressed="true"'));
assert(nodes['ls-sqlite-in-grid'].innerHTML.includes('Odjel 10 &lt;test&gt;'));
assert(nodes['ls-sqlite-in-grid'].innerHTML.includes('data-map-name="A — odgođena"'));

// v5.0.1: Brzi izbor — Google satelit UVIJEK, do 2 offline karte (zadnje skinuta prva) sa nagib/ekspozicija dugmadima
{
  const n2={'mapfav-grid':{},'mapfav-count':{}};
  const g={},a={},b2={},cc={};const on=new Set([b2]);
  const k={window:{},localStorage:{getItem:()=>null},document:{getElementById:id=>n2[id],addEventListener:()=>{}},map:{hasLayer:l=>on.has(l)},
    _sqlLayers:[{name:'Stara',layer:a,visible:false},{name:'Nova',layer:b2,visible:true},{name:'Srednja',layer:cc,visible:false}],_sqlRestoreFailed:[],
    _OVL:{slope:{},ekspo:{}},_ovlState:{},TL:{'📡 Google':g},_activeLayerKey:()=> '_sqlite_1',_mapFavThumbHtml:()=>'<svg></svg>',
    _mapFavs:[{id:'s',name:'Nova',type:'sqlite',sqliteId:'Nova',auto:'srv'},{id:'g',name:'Google satelit',type:'tl',tlKey:'📡 Google'},{id:'m',name:'Moja topo',type:'tl',tlKey:'Topo'}]};
  vm.runInNewContext(fs.readFileSync('static/js/map-catalog.js','utf8'),k);const m=k.window.MapCatalog;
  m.setRecent([{name:'Stara',savedAt:1},{name:'Nova',savedAt:300,meta:{_nativeId:'x'}},{name:'Srednja',savedAt:200},{name:'Nema na telefonu',savedAt:999}]);
  assert.deepEqual(Array.from(m.offlineNajnovije(),r=>r.name),['Nova','Srednja'],'najviše 2, zadnje skinuta prva, samo karte na telefonu');
  m.renderFavorites();const h=n2['mapfav-grid'].innerHTML;
  assert(h.includes('data-brzo="google"'),'Google satelit uvijek u brzom izboru');
  assert.equal((h.match(/class="mfav-activate" data-brzo="off"/g)||[]).length,2,'dvije offline karte');
  assert(h.indexOf('Nova')<h.indexOf('Srednja')&&!h.includes('>Stara<'),'redoslijed i kapa');
  assert(h.includes('NAJNOVIJA')&&h.includes('data-ovl="slope"')&&h.includes('data-ovl="ekspo"'),'oznaka najnovije i dugmad nagib/ekspozicija');
  assert(h.includes('Moja topo')&&!/data-fav-action="open"[^>]*Otvori Nova/.test(h)&&(h.match(/data-fav-action="open"/g)||[]).length===1,'u Moje karte samo ručno dodane');
  // Google se prikazuje i kad ga korisnik nema u omiljenima
  k._mapFavs.splice(0);m.renderFavorites();assert(n2['mapfav-grid'].innerHTML.includes('data-brzo="google"'));
  console.log('OK: brzi izbor — Google uvijek, 2 najnovije offline karte, nagib/ekspozicija');
}
