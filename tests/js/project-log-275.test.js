'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(n){const m=html.match(new RegExp('(?:async )?function '+n+'\\('));assert(m,n);let d=0;for(let i=html.indexOf('{',m.index);i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&--d===0)return html.slice(m.index,i+1);}throw Error(n);}
const project=(id,odjel,gj='Una',owner='A')=>({id,odjel,gj,sumarija:'Krupa',korisnik_id:owner,clanovi:[]});
const store=new Map(),els=new Map(['proj-detalji-sec','dnevni-log','project-log-actions','proj-panel','pm-list-wrap','pm-detail','pm-back-btn','pm-title','pm-body','pm-detail-body'].map(id=>[id,{style:{display:'none'},innerHTML:'',textContent:'',querySelector:()=>null}]));
const e={console,document:{getElementById:id=>els.get(id)},localStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)||null},sbUser:{id:'A'},sbProfile:{ime:'Ana',prezime:'Test',sumarija:'Krupa'},kolegeMap:{B:{ime:'Amir Kolega'}},_projekti:[project('P','105'),project('Q','105','Grmeč','B'),project('R','201')],_aktivniProjektId:'P',_pdProjektId:null,dnevniLog:[],vlake:[{projektId:'P',nm:'T1',pts:[]},{projektId:'Q',nm:'T1',pts:[]}],showToast:()=>{},isReadOnly:()=>false,todayStr:()=> '2026-10-10',getIme:()=> 'Ana Test',getOdjel:()=>e._projekti.find(p=>p.id===e._aktivniProjektId).odjel,_ukupnoVlakeM:a=>a.length*100,calcL:()=>100,_dayActiveMs:60000,recOn:false,_loadDayTiming:()=>null,_fmtTime:()=>'',_dayWorkStart:0,_dayWorkEnd:0,updProjStats:()=>{},rndOdjeliRekap:()=>{},_dlgConfirm:async()=>true,_mrezaProbaj:()=>false,_pmProjectRows:()=>[],_enrichVlakeElevation:async()=>{},_pmBuildDetail:(p,v,l)=>JSON.stringify(l),fmtDate:s=>s,fmtL:n=>n+' m',_fmtDur:n=>n+' min',_parseHHMM:()=>0};
vm.createContext(e);vm.runInContext("let _pmDetailId=null,_pmLastData=null;"+['_escHtml','_projektTimIds','_projektIme','_logEntryMatchesProject','_projectLog','_logViewProjectId','logDan','rndLog','clearLog','_applyLogRows','_pmOpenDetail'].map(fn).join('\n'),e);
(async()=>{
 assert(!e._logEntryMatchesProject({odjel:'105',projektant:'Ana Test'},e._projekti[0]),'dva projekta istog odjela ne smiju dijeliti stari log');
 assert(e._logEntryMatchesProject({odjel:'105',gj:'Una',projektant:'Ana Test'},e._projekti[0]));
 assert(!e._logEntryMatchesProject({odjel:'105',gj:'Una',projektant:'Amir Kolega'},e._projekti[0]),'tuđi profil nije član');
 assert(!e._logEntryMatchesProject({odjel:'201',projektant:'Nepoznat'},e._projekti[2]));
 assert(e._logEntryMatchesProject({projektId:'Q',odjel:'105'},e._projekti[1]));
 e.logDan();e._aktivniProjektId='Q';e.logDan();e.logDan();
 assert.equal(e.dnevniLog[0].entries.length,2,'isti korisnik isti dan na dva projekta: dva unosa');
 assert.deepEqual(Array.from(e.dnevniLog[0].entries,x=>x.projektId).sort(),['P','Q']);
 assert.equal(e._projectLog('P')[0].entries.length,1);
 e._aktivniProjektId='R';e.sbProfile.is_admin=true;e.rndLog();assert(!els.get('dnevni-log').innerHTML.includes('Ana Test'));
 e._aktivniProjektId='P';els.get('proj-detalji-sec').style.display='';e._pdProjektId='R';e.rndLog();assert(!els.get('dnevni-log').innerHTML.includes('Ana Test'),'admin pregleda drugi projekat bez aktiviranja');
 await e._pmOpenDetail('R');assert.equal(els.get('pm-detail-body').innerHTML,'[]');
 await e._pmOpenDetail('Q');assert(els.get('pm-detail-body').innerHTML.includes('Ana Test'));
 e._pdProjektId=null;els.get('proj-detalji-sec').style.display='none';await e.clearLog();
 assert.equal(e.dnevniLog[0].entries.length,1);assert.equal(e.dnevniLog[0].entries[0].projektId,'Q','brisanje P čuva Q');
 e._applyLogRows([{datum:'2026-10-10',projektant:'Ana Test',projekt_id:'P',odjel:'105',meters:10},{datum:'2026-10-10',projektant:'Ana Test',projekt_id:'Q',odjel:'105',meters:20}]);
 assert.equal(e.dnevniLog[0].entries.length,2,'isti ID projekta ne udvostručuje lokalni zapis');
 assert.equal(e._projectLog('Q')[0].entries[0].meters,100,'lokalni zapis ima prednost');
 // Serverski fallback mora filtrirati i korisnika, ne samo tekst odjela.
 e.sb={from:()=>({select(){return this},eq(){return this},then(resolve){resolve({data:[{datum:'2026-10-10',odjel:'201',korisnik_id:'B',projektant:'Amir Kolega',meters:999}]})}})};e._mrezaProbaj=()=>true;
 await e._pmOpenDetail('R');assert.equal(els.get('pm-detail-body').innerHTML,'[]');
 console.log('OK: dnevnik po projektu, dva projekta istog odjela/dana, admin pregled, sigurna legacy atribucija, lokalni merge i ograničeno brisanje');
})().catch(err=>{console.error(err);process.exitCode=1});
