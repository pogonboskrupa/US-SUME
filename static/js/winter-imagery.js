/* Esri Wayback: zima se potvrđuje datumom akvizicije na lokaciji u USK-u. */
(function(root){
  'use strict';
  let geometry=null,generation=0,masked=null;
  function acquisition(attributes){
    const s=String(attributes?.SRC_DATE||'');if(!/^\d{8}$/.test(s))return null;
    const date=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8),d=new Date(date+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
    const resolution=Number(attributes.SRC_RES),sample=Number(attributes.SAMP_RES);
    return {date,winter:['12','01','02'].includes(s.slice(4,6)),resolution,sample:Number.isFinite(sample)&&sample>0?sample:resolution,provider:String(attributes.NICE_DESC||attributes.NICE_NAME||'Esri')};
  }
  function candidates(releases){
    const out=[],urls=new Set(),years=new Set();
    for(const r of releases||[]){const year=r.date.slice(0,4);
      if(out.length>=24)break;
      if(!r.metadataUrl||urls.has(r.metadataUrl))continue;
      if(out.length>=8&&years.has(year))continue;
      urls.add(r.metadataUrl);years.add(year);out.push(r);
    }
    return out;
  }
  function clip(geo,coords){
    if(!geo)return '';
    const ring=geo.coordinates[0];
    return 'polygon('+ring.map(p=>{const q=L.CRS.EPSG3857.latLngToPoint(L.latLng(p[1],p[0]),coords.z);return (q.x-coords.x*256)/2.56+'% '+(q.y-coords.y*256)/2.56+'%';}).join(',')+')';
  }
  function apply(geo){
    masked=geo;_wbTileLayer.options.bounds=geo?L.geoJSON(geo).getBounds():null;
    for(const t of Object.values(_wbTileLayer._tiles||{}))t.el.style.clipPath=clip(geo,t.coords);
  }
  function cancel(){generation++;apply(null);const button=document.getElementById('wb-winter-search');if(button)button.disabled=false;}
  function status(text){const el=document.getElementById('wb-winter-status');if(el)el.textContent=text;}
  async function search(){
    const token=++generation,center=map.getCenter(),initialUrl=_wbCurUrl;
    const valid=()=>token===generation&&_wbOn&&_wbCurUrl===initialUrl&&map.getCenter().distanceTo(center)<50;
    const button=document.getElementById('wb-winter-search');if(button)button.disabled=true;
    try{
      if(!_mrezaProbaj()){status('Za provjeru datuma snimanja potreban je internet.');return;}
      if(!geometry){const r=await _fetchT('static/data/usk-boundary.geojson',5000);if(!r.ok)throw new Error('Granica kantona nije dostupna');const f=await r.json();geometry=f.geometry;}
      if(!turf.booleanPointInPolygon(turf.point([center.lng,center.lat]),turf.polygon(geometry.coordinates))){status('Pretraga je samo za Unsko-sanski kanton. Postavi sredinu karte u odjel unutar USK-a.');return;}
      if(!(_wbReleases||[]).some(r=>r.metadataUrl)){if(!await _wbUcitajReleases(true))throw new Error('Lista arhive nije dostupna');}
      if(!valid())return;
      const list=candidates(_wbReleases);let failures=0,checked=0,found=null;
      if(!list.length)throw new Error('Arhiva nema metapodatke za provjeru');
      for(let i=0;i<list.length&&!found;i+=4){
        status('Provjeravam stvarni datum snimanja: '+checked+' / '+list.length+' verzija…');
        const result=await Promise.allSettled(list.slice(i,i+4).map(async rel=>{
          if(!/^https:\/\/metadata\.maptiles\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery_Metadata_[\w]+\/MapServer$/.test(rel.metadataUrl))throw new Error('Neispravan izvor metapodataka');
          const params=new URLSearchParams({f:'json',geometry:center.lng+','+center.lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'SRC_DATE,SRC_RES,SAMP_RES,NICE_DESC,NICE_NAME,DrawOrder',returnGeometry:'false'});
          const r=await _fetchT(rel.metadataUrl+'/6/query?'+params,8000);if(!r.ok)throw new Error('Metapodaci nisu dostupni');
          const data=await r.json();if(data.error||!Array.isArray(data.features))throw new Error('Nepotpun odgovor');
          const rows=data.features.map(f=>f.attributes).sort((a,b)=>(b.DrawOrder||0)-(a.DrawOrder||0));
          const a=acquisition(rows[0]);return a?.winter&&a.resolution>0&&a.resolution<=2&&a.sample<=2?{rel,...a}:null;
        }));
        if(!valid())return;
        for(const r of result){checked++;if(r.status==='rejected')failures++;else if(r.value&&!found)found=r.value;}
      }
      if(found){
        const sel=document.getElementById('wb-datum');if(sel)sel.value=found.rel.url;
        _wbPostaviDatum(found.rel.url,geometry);
        status('Zimski snimak na sredini karte: '+found.date+' · izvor '+found.resolution.toLocaleString('bs-BA')+' m · '+found.provider+'. Prikaz ograničen na USK. Datum i kvalitet susjednih dijelova mozaika mogu biti drugačiji; bez lišća/snijega provjeri vizuelno.');
      }else status(failures?'Dio arhive nije provjeren zbog mreže ('+failures+'). Nije pronađen potvrđen zimski snimak; pokušaj ponovo.':'U '+checked+' pregledanih verzija nije pronađen potvrđen zimski snimak do 2 m na sredini karte. Pokušaj na drugoj lokaciji u USK-u.');
    }catch(e){if(token===generation)status(e.message||'Provjera nije uspjela.');}
    finally{if(token===generation&&button)button.disabled=false;}
  }
  root.WbWinter={search,cancel,apply,acquisition,candidates};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.WbWinter;
  if(typeof document!=='undefined'&&typeof _wbTileLayer!=='undefined'){
    const original=_wbTileLayer.createTile;
    _wbTileLayer.createTile=function(coords,done){const img=original.call(this,coords,done);img.style.clipPath=clip(masked,coords);return img;};
  }
})(typeof window!=='undefined'?window:globalThis);
