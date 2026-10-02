// Pregled tabova: samo lokalni podaci, bez mreže i automatskog slanja.
(function () {
  'use strict';
  const panels = {vlake:'panel', projekat:'proj-panel', doznaka:'doznaka-panel', tragovi:'tragovi-panel'};
  const states = new Map();
  let scope = '', state, serverTab = 'project', serverPage = 0, serverScope = '', pending = new Set(), lastRows = [];
  const size = 60;
  function key() { return (sbUser?.id || 'guest') + ':' + (_aktivniProjektId || 'none'); }
  function sync() {
    const next = key();
    if (next === scope && state) return;
    scope = next;
    state = states.get(next) || {search:'', sort:'naziv', steep:false, filter:'all', page:0, colleagueSearch:'', colleaguePage:0, scroll:{}};
    states.set(next, state);
    _vlTrazi = state.search; _vlSort = state.sort; _vlSamoStrme = state.steep;
    const input = document.getElementById('vl-trazi'); if (input) input.value = state.search;
  }
  function remember(tab) {
    sync();
    const el = document.getElementById(panels[tab]);
    if (el) state.scroll[tab] = el.scrollTop;
    state.search = _vlTrazi; state.sort = _vlSort; state.steep = _vlSamoStrme;
  }
  function context() {
    sync();
    const p = (_projekti || []).find(p => p.id === _aktivniProjektId);
    Object.entries(panels).forEach(([tab, id]) => {
      const panel = document.getElementById(id); if (!panel) return;
      panel.style.overflowAnchor='none'; // zamjena redova ne smije pomjeriti zapamćen položaj
      let bar = panel.querySelector('.data-context');
      if (!bar) { bar = document.createElement('div'); bar.className = 'data-context'; panel.prepend(bar); }
      const label = p ? [p.gj,p.odjel].filter(Boolean).join(' · ') : 'Nije odabran projekat';
      const odjel = tab === 'doznaka' ? _dozOdjeli.find(o => o.id === _dozSelId) : null;
      bar.innerHTML = '<span>📁 ' + _escHtml(label) + '</span><button type="button" onclick="switchTab(\'projekat\')">Projekti</button>' +
        (odjel ? '<small>Doznaka: ' + _escHtml(odjel.name) + (_dozLinkedProjektId === p?.id ? ' · povezana' : ' · zaseban odjel') + '</small>' : '');
    });
  }
  function restore(tab) {
    sync(); context();
    const el = document.getElementById(panels[tab]), target = state.scroll[tab] || 0, ownerScope=scope;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (el && key() === ownerScope && _activeTab === tab) el.scrollTop = target; }));
  }
  function queueKeys() {
    pending = new Set();
    _OL.loadQueue().filter(o => !o._uid || o._uid === sbUser?.id).forEach(o => {
      const p = o.payload || {};
      if (p.nm && p.projekt_id) pending.add(p.projekt_id + ':' + p.nm);
      if (p.nm && p.projektId) pending.add(p.projektId + ':' + p.nm);
      if (p.id) pending.add(String(p.id));
    });
  }
  function isPending(v) { return pending.has(v.projektId + ':' + v.nm) || (v.sbId && pending.has(String(v.sbId))) || !v.sbId; }
  function prepare() {
    sync(); queueKeys();
    let controls = document.getElementById('data-vl-controls');
    if (!controls) {
      controls = document.createElement('div'); controls.id = 'data-vl-controls'; controls.className = 'data-controls';
      document.getElementById('vl')?.before(controls);
    }
    if (controls) controls.innerHTML = '<button onclick="_tabFilter(\'all\')" aria-pressed="' + (state.filter==='all') + '">Sve vlake</button><button onclick="_tabFilter(\'pending\')" aria-pressed="' + (state.filter==='pending') + '">Za slanje</button><small>Pretraga i filteri rade offline</small>';
    return state.filter === 'pending';
  }
  function status(v) {
    return '<div class="data-row-status">' + (isPending(v) ? '✓ Lokalno · nije poslano' : '☁ Na serveru · lokalna kopija') + '</div>';
  }
  function pager(el, count, page, action) {
    if (count <= size) return;
    const nav = document.createElement('div'); nav.className = 'data-pager';
    nav.innerHTML = '<button ' + (!page ? 'disabled' : '') + ' onclick="' + action + '(' + (page-1) + ')">‹ Prethodno</button><span>' + (page*size+1) + '–' + Math.min(count,(page+1)*size) + ' / ' + count + '</span><button ' + ((page+1)*size>=count ? 'disabled' : '') + ' onclick="' + action + '(' + (page+1) + ')">Sljedeće ›</button>';
    el.append(nav);
  }
  function render(el, rows) {
    sync();
    lastRows=rows;
    state.page = Math.max(0, Math.min(state.page, Math.ceil(rows.length / size)-1));
    rows.slice(state.page*size,(state.page+1)*size).forEach(args => _renderVlakaRow(el,...args));
    // Samo jedna stranica kartica u DOM-u; redovi i dalje nose stvarni vlake[] indeks.
    const nav = document.getElementById('data-vl-controls');
    if (nav) pager(nav, rows.length, state.page, '_tabPage');
    if (!rows.length && state.filter==='pending') {
      const empty = document.getElementById('nv');
      if (empty) { empty.style.display = 'block'; empty.textContent = 'Nema vlaka za slanje u ovom projektu.'; }
    }
  }
  function filter(value) { sync(); state.filter = value==='pending'?'pending':'all'; state.page=0; rndList(); }
  function page(value) { sync(); state.page=Math.max(0,value|0); rndList(); document.getElementById('data-vl-controls')?.scrollIntoView({block:'start'}); }
  function changed() { sync(); state.search=_vlTrazi; state.sort=_vlSort; state.steep=_vlSamoStrme; state.page=0; }
  function reveal(i) {
    sync();
    const index=lastRows.findIndex(args => args[1]===i);
    if (index<0 || Math.floor(index/size)===state.page) return;
    state.page=Math.floor(index/size); rndList();
  }
  function colleagues(entries) {
    sync();
    const section = document.getElementById('kolege-vlake-sec');
    let controls = document.getElementById('data-colleague-controls');
    if (!controls && section) {
      controls = document.createElement('div'); controls.id='data-colleague-controls'; controls.className='data-controls';
      const input = document.createElement('input'); input.type='search'; input.placeholder='Traži vlaku ili kolegu…'; input.setAttribute('aria-label','Traži vlaku ili kolegu');
      input.addEventListener('input',() => { sync(); state.colleagueSearch=input.value; state.colleaguePage=0; rndKolegeVlakeList(); });
      controls.append(input); document.getElementById('kolege-vl').before(controls);
    }
    if (controls) controls.querySelector('input').value=state.colleagueSearch;
    const query=state.colleagueSearch.trim().toLowerCase();
    const rows=entries.filter(([key,v]) => (key+' '+(v.ime||'')).toLowerCase().includes(query));
    state.colleaguePage=Math.max(0,Math.min(state.colleaguePage,Math.ceil(rows.length/size)-1));
    if (controls) { controls.querySelector('.data-pager')?.remove(); const nav=document.createElement('div');nav.className='data-pager';controls.append(nav);pager(nav,rows.length,state.colleaguePage,'_tabColleaguePage'); }
    return rows.slice(state.colleaguePage*size,(state.colleaguePage+1)*size);
  }
  function serverCounts(q) {
    if(serverScope !== (sbUser?.id || '')) {serverScope=sbUser?.id || '';serverTab='project';serverPage=0;}
    q=(q || _OL.loadQueue()).filter(o => (!o._uid || o._uid === sbUser?.id) && (typeof _SERVER_SAMO_LOKALNO==='undefined' || !_SERVER_SAMO_LOKALNO.has(o.type)));
    const problem = q.filter(o => o._blocked || o._lastErr || o._retries);
    const tabs = document.getElementById('data-server-tabs');
    const shared = new Set((_projekti || []).filter(p => p.korisnik_id === sbUser?.id || (p.clanovi || []).some(c => c.korisnik_id === sbUser?.id)).map(p => p.id));
    const receivedCount = _serverPrimljenoUcitaj().filter(x => shared.has(x.projektId)).length;
    if (tabs) tabs.innerHTML = [['project','Pregled',typeof _serverProjektModel==='function' ? _serverProjektModel().rows.length : 0],['send','Za slanje',q.length],['received','Primljeno',receivedCount],['problems','Problemi',problem.length]].map(([id,label,n]) => '<button role="tab" aria-selected="'+(id===serverTab)+'" onclick="_tabServer(\''+id+'\')">'+label+' ('+n+')</button>').join('');
    return problem;
  }
  function serverPrepare(q) {
    const problem=serverCounts(q);
    const received = document.getElementById('data-server-received'), list = document.getElementById('syncq-list');
    if (received) received.hidden = serverTab!=='received';
    if (list) list.hidden = serverTab==='received';
    const project = document.getElementById('server-project-view');
    if(project)project.hidden=serverTab!=='project';
    const preview=document.getElementById('server-send-preview');if(preview)preview.hidden=serverTab!=='project'&&serverTab!=='send';
    if(list)list.hidden=serverTab==='received'||serverTab==='project';
    const rows = serverTab==='problems' ? problem : q.filter(o=>typeof _SERVER_SAMO_LOKALNO==='undefined' || !_SERVER_SAMO_LOKALNO.has(o.type));
    serverPage = Math.max(0,Math.min(serverPage,Math.ceil(rows.length/size)-1));
    const nav = document.getElementById('data-server-pager');
    if (nav) { nav.innerHTML=''; nav.hidden=serverTab==='received'||serverTab==='project'; pager(nav,rows.length,serverPage,'_tabServerPage'); }
    const empty = document.getElementById('data-server-empty');
    if (empty) { empty.hidden=serverTab==='received'||serverTab==='project'||!!rows.length; empty.textContent=serverTab==='problems'?'Nema zabilježenih problema pri slanju.':'Nema operacija u redu. GPS tačke doznake prikazane su u sažetku iznad.'; }
    return rows.slice(serverPage*size,(serverPage+1)*size);
  }
  Object.assign(window, {_tabRemember:remember, _tabRestore:restore, _tabContext:context, _tabListPrepare:prepare, _tabPending:isPending, _tabRowStatus:status, _tabListRender:render, _tabFilter:filter, _tabPage:page, _tabChanged:changed, _tabServerPrepare:serverPrepare, _tabServerCounts:serverCounts, _tabColleagues:colleagues, _tabReveal:reveal,
    _tabColleaguePage(value) { sync(); state.colleaguePage=Math.max(0,value|0); rndKolegeVlakeList(); },
    _tabServer(value) { serverTab=['project','send','received','problems'].includes(value)?value:'project'; serverPage=0; openSyncQueuePanel(); },
    _tabServerPage(value) { serverPage=Math.max(0,value|0); openSyncQueuePanel(); }
  });
  context();
})();

