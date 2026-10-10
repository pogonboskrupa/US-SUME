'use strict';
// Simulacija, ne produkcijski projekat. Računice su stvarne funkcije aplikacije.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0);let i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const twoTeams=process.argv.includes('--teams');
const origin=[16,44.9],R=6371000,cos=Math.cos(origin[1]*Math.PI/180),toLL=(x,y)=>[origin[0]+x/(R*cos)*180/Math.PI,origin[1]+y/R*180/Math.PI];
const height=(x,y)=>420+.35*y+14*Math.sin(x/120)+7*Math.sin(y/90)+.02*x;
function isoY(x,target){let lo=-150,hi=850;for(let i=0;i<35;i++){const y=(lo+hi)/2;height(x,y)<target?lo=y:hi=y;}return (lo+hi)/2;}
const ring=[];for(let y=0;y<=640;y+=40)ring.push(toLL(12+20*Math.sin(y/100),y));for(let x=80;x<=880;x+=80)ring.push(toLL(x,640+12*Math.sin(x/170)));for(let y=640;y>=0;y-=40)ring.push(toLL(900+12*Math.sin(y/90),y));for(let x=880;x>=80;x-=80)ring.push(toLL(x,10*Math.sin(x/150)));ring.push(ring[0]);
const project={id:'SIM-DOZ-6D',name:'SIMULACIJA · Odjel sa više padina',boundary_geojson:{type:'Polygon',coordinates:[ring]},created_at:'2026-09-21T05:00:00Z'},members=['A','B','C','D'].map((user_id,i)=>({user_id,role:i?'engineer':'manager',_korisnik:{ime:'Projektant',prezime:String(i+1)}}));
const tracks=[],sessions=[],counts=[2,3,2,3,2,3];let row=0;
for(let day=0;day<6;day++){
 for(let k=0;k<counts[day];k++,row++){
  for(let person=0;person<4;person++){
   const layer=twoTeams?row*2+person%2:row*4+person;
   const target=height(450,75+layer*(532/(twoTeams?29:59)));
   const uid=members[person].user_id,pts=[],total=201;
   for(let n=0;n<total;n++){
    const t=row%2?(total-1-n)/(total-1):n/(total-1),x=twoTeams?Math.floor(person/2)*450+36+t*378:36+t*828,y=isoY(x,target),ll=toLL(x,y);
    const stamp=Date.UTC(2026,8,21+day,5)+k*7200e3+n*30e3;
    const p={user_id:uid,project_id:project.id,latitude:ll[1],longitude:ll[0],altitude:height(x,y),recorded_at:new Date(stamp).toISOString()};
    pts.push(p);tracks.push(p);
   }
   sessions.push({uid,day:day+1,row,altitude:target,coordinates:pts.map(p=>[p.longitude,p.latitude])});
  }
 }
}
const sources=['_dozTackaMs','_dozTragoviPoKorisniku','_dozTragoviPotpis','_dozBuildUserTracks','_dozComputeBands','_dozPokrivenost','_dozGetBoundaryGeoJSON'].map(fn).join('\n');
function env(pts){return new Function('turf','tracks','DozBands',`let _dozTracks=tracks,_dozSelId='SIM-DOZ-6D',_DOZ_BAND_OUTER_M=20,_DOZ_TRACK_BUF_KEY='none';const localStorage={getItem:()=>null};let _dozUTMemo={k:null,v:null},_dozBandsMemo={k:null,v:null},_dozPokrMemo={k:null,v:null};${sources};return {_dozComputeBands,_dozPokrivenost,_dozBuildUserTracks};`)(turf,pts,require('../../static/js/doznaka-bands.js'));}
const api=env(tracks),start=performance.now(),bands=api._dozComputeBands(project),cover=api._dozPokrivenost(project),elapsed=performance.now()-start;
const boundary=turf.polygon([ring]),area=turf.area(boundary)/10000;
assert.equal(tracks.length,12060);assert(tracks.every(p=>turf.booleanPointInPolygon(turf.point([p.longitude,p.latitude]),boundary)),'Svi radni tragovi su unutar odjela');assert.equal(api._dozBuildUserTracks().length,60);assert.equal(bands.length,60);assert(bands.every(b=>b.joined===true),'Svi susjedni pojasevi imaju zajedničku granicu');assert(api._dozBuildUserTracks().every(t=>t.line.geometry.coordinates.length===201),'GPS tragovi se ne skraćuju zbog blizine kolege');assert(cover.ukupnoHa<=area+1e-6);assert(cover.preklopHa>=0);
const again=performance.now();api._dozPokrivenost(project);const cachedMs=performance.now()-again;
// Nedavna, daleka kolegina linija ne smije povećati bafer iznad korisnikovih 20 m.
const sample=tracks.filter(p=>p.user_id==='A'&&p.recorded_at.slice(0,10)==='2026-09-21').slice(0,201),other=sample.map(p=>({...p,user_id:'B',latitude:p.latitude+.003}));
const alone=env(sample)._dozPokrivenost(project).poKorisniku.A,far=env([...sample,...other])._dozPokrivenost(project).poKorisniku.A;assert(Math.abs(alone-far)<.001,'Daleki kolega ne širi pojas');
const daily=[];for(let d=1;d<=6;d++){const end=Date.UTC(2026,8,21+d);const a=env(tracks.filter(p=>Date.parse(p.recorded_at)<end));const c=a._dozPokrivenost(project);daily.push({day:d,perPerson:counts[d-1],newBands:counts[d-1]*4,cumulativeHa:c.ukupnoHa});}
const features=bands.map(b=>{const uidSessions=sessions.filter(s=>s.uid===b.uid),idx=bands.filter(a=>a.uid===b.uid).indexOf(b);return {...b.polygon,properties:{uid:b.uid,day:uidSessions[idx].day,areaHa:b.areaHa}};});
const report={simulation:true,layout:twoTeams?'dvije ekipe; u svakoj jedan iznad drugog':'četiri projektanta jedan iznad drugog',origin,terrain:'Sintetički teren sa više padina; nije izmjereni DEM stvarnog odjela.',project,members,tracks,sessions,bands:{type:'FeatureCollection',features},areaHa:area,coveredHa:cover.ukupnoHa,remainingHa:Math.max(0,area-cover.ukupnoHa),overlapHa:cover.preklopHa,perUserHa:cover.poKorisniku,daily,performance:{initialMs:elapsed,cachedMs,environment:'Node.js u cloud okruženju; nije fizički telefon'},bufferRadiusM:20};
const out=path.join(__dirname,twoTeams?'../../outputs/doznaka-two-teams':'../../outputs/doznaka-sixdays');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'simulation.json'),JSON.stringify(report));fs.writeFileSync(path.join(out,'pojasevi.geojson'),JSON.stringify(report.bands));fs.writeFileSync(path.join(out,'odjel.geojson'),JSON.stringify({type:'Feature',properties:{simulation:true,areaHa:area},geometry:project.boundary_geojson}));
console.log(JSON.stringify({points:tracks.length,bands:bands.length,areaHa:area,coveredHa:cover.ukupnoHa,remainingHa:report.remainingHa,overlapHa:cover.preklopHa,perUserHa:report.perUserHa,daily,initialMs:elapsed,cachedMs}));
