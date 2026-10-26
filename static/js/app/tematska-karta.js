// @izdvojeno-iz index.html (glavni inline blok) — Tematska karta (.gpkg), korak 2
const _TEM_RAMP      = ['#1a9641','#a6d96a','#ffffbf','#fdae61','#d7191c'];
// Registar u memoriji: {id, name, grp, features:[{attrs,polys}], cols, theme, visible,
//  styles:{kolona:{breaks:[4],colors:[5]}} (ručne klase/boje), colLabels:{kolona:'Naziv'}
//  (ručno preimenovani atributi — samo prikaz, ne dira sirove podatke), _cls (za legendu)}
let _temMaps     = [];
let _temRenderer = null;   // L.canvas — hiljade poligona, SVG bi gušio
let _temEdOpenId = null;   // karta čiji je editor klasa otvoren u modalu
let _temSelectedId = null, _temView = 'files';
let _temQueue = Promise.resolve(), _temRestorePending = null, _temEpoch = 0;
let _temLoadStatus = '';
let _temEdDraft  = {};     // { [mapId]: {colors:[...], edges:[...]} } — nesačuvano stanje editora dok je otvoren

// Palete za brojčane teme (sekvencijalne/divergentne). 'zc' je zadana (isto kao ranije).
const _TEM_PALETE = {
  zc:   { nm: 'Zeleno → crveno', c: _TEM_RAMP },
  zel:  { nm: 'Zelena',          c: ['#edf8e9','#bae4b3','#74c476','#31a354','#006d2c'] },
  pl:   { nm: 'Plava',           c: ['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'] },
  smd:  { nm: 'Žuto → smeđe',    c: ['#ffffd4','#fed98e','#fe9929','#d95f0e','#993404'] },
  vir:  { nm: 'Ljubičasto → žuto', c: ['#440154','#3b528b','#21918c','#5ec962','#fde725'] }
};
// Kategorijske teme: dobro razlučive boje (prvih 12), dalje zlatni ugao po HSL-u.
const _TEM_KAT_BOJE = ['#2563eb','#f97316','#16a34a','#dc2626','#9333ea','#ca8a04',
  '#0891b2','#db2777','#65a30d','#7c3aed','#ea580c','#0d9488'];
const _TEM_KAT_MAX = 20;   // tekstualna kolona sa više različitih vrijednosti nije tema (npr. broj odjela)
// Kolona deklarisana kao TEXT u .gpkg je šifra, ne mjera (gazdinska klasa "4411" izgleda kao
// broj, ali kvantili nad šiframa nemaju smisla) — uvijek kategorija, i sa više vrijednosti.
const _TEM_KAT_MAX_TXT = 80;
const _TEM_POV_RE = /^povr[sš]ina(_ha)?$/i;
const _TEM_ID_RE = /^(odjel|odsjek|odjel_odsjek|odsjek_id|napomena|opis|procjena_i_ogranicenja)$/i;   // oznake/slobodan tekst — nikad tema
// Prikazni nazivi uobičajenih kolona šumarskog .gpkg-a (npr. granica taksacije) — samo prikaz.
const _TEM_NAZIVI = { gj: 'GJ', odjel: 'Odjel', odsjek: 'Odsjek', gazdinska_klasa: 'Gazdinska klasa',
  gk_grupa: 'Grupa gazd. klase', povrsina_ha: 'Površina (ha)', ugrozenost: 'Ugroženost',
  svzv: 'ŠVZV', minirano: 'Minirano', napomena: 'Napomena' };   // kolona površine iz fajla (zamjenjuje izračunatu)

// Boje za proizvoljan broj klasa (n≥2) — interpolacija duž sidrenih boja palete.
function _temRampFor(n, ramp) {
  const r = (ramp && ramp.length >= 2) ? ramp : _TEM_RAMP;
  if (n <= 1) return [r[0]];
  const hexToRgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
  const rgbToHex = rgb => '#' + rgb.map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (r.length - 1);
    const i0 = Math.floor(pos), i1 = Math.min(r.length - 1, i0 + 1), f = pos - i0;
    const c0 = hexToRgb(r[i0]), c1 = hexToRgb(r[i1]);
    out.push(rgbToHex([c0[0]+(c1[0]-c0[0])*f, c0[1]+(c1[1]-c0[1])*f, c0[2]+(c1[2]-c0[2])*f]));
  }
  return out;
}
function _temKatBoje(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i < _TEM_KAT_BOJE.length) { out.push(_TEM_KAT_BOJE[i]); continue; }
    const h = Math.round((i * 137.508) % 360), s = 0.62, l = 0.48;
    const k = m => (m + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = m => Math.round(255 * (l - a * Math.max(-1, Math.min(k(m) - 3, 9 - k(m), 1))));
    out.push('#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join(''));
  }
  return out;
}

// Vrijednost atributa kao broj — prazno/null je NaN, NE nula. Number(null) je 0, pa bi
// odsjek bez podatka inače upao u najnižu klasu i povukao minimum/kvantile na 0.
function _temNum(v) {
  if (v == null || v === '' || typeof v === 'boolean') return NaN;
  return Number(v);
}
// Prikaz broja: decimalni zarez, razmak za hiljade (WebView bez bs lokala daje "1,234").
function _temBr(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 100 ? String(Math.round(v)) : String(+v.toFixed(a >= 10 ? 1 : 2));
  const [c, d] = s.split('.');
  return c.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + d : '');
}
function _temHa(ha) {
  if (!Number.isFinite(ha)) return '—';
  return (ha < 10 ? String(+ha.toFixed(1)).replace('.', ',') : _temBr(Math.round(ha))) + ' ha';
}

// Površina odsjeka iz geometrije (ha) — sferna formula kao turf.area, bez mreže/biblioteke.
// Keš na feature-u: geometrija se poslije učitavanja ne mijenja.
function _temPrstenM2(ring) {
  const R = 6378137, rad = Math.PI / 180, n = ring.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const la1 = a.lat ?? a[0], lo1 = a.lng ?? a[1], la2 = b.lat ?? b[0], lo2 = b.lng ?? b[1];
    s += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad));
  }
  return Math.abs(s * R * R / 2);
}
function _temPovrsinaHa(f) {
  if (Number.isFinite(f._ha)) return f._ha;
  let m2 = 0;
  (f.polys || []).forEach(p => {
    let rings = p.getLatLngs ? p.getLatLngs() : p;
    if (!rings || !rings.length) return;
    if (rings[0] && rings[0].lat !== undefined) rings = [rings];
    rings.forEach((r, i) => { m2 += (i === 0 ? 1 : -1) * _temPrstenM2(r); });   // prvi prsten je vanjski, ostali rupe
  });
  f._ha = Math.max(0, m2) / 10000;
  return f._ha;
}

// Indeks klase za vrijednost, -1 = bez podatka / nepoznata kategorija.
function _temKlasaIdx(cls, raw) {
  if (!cls) return -1;
  if (cls.cat) return (raw == null || raw === '') ? -1 : cls.vals.indexOf(String(raw));
  const v = _temNum(raw);
  if (!Number.isFinite(v)) return -1;
  if(cls.ranges) return cls.ranges.findIndex(r=>v>=r.min && v<=r.max);
  let c = 0;
  for (const b of cls.breaks) { if (v >= b) c++; else break; }
  return Math.min(c, cls.colors.length - 1);
}
function _temBojaZa(cls, raw) {
  const i = _temKlasaIdx(cls, raw);
  return i < 0 ? null : cls.colors[i];
}
// Klase za prikaz (legenda, pregled): {i, boja, lbl}. Kvantili se dedupliciraju pa zna
// biti manje granica nego boja — klasa iza zadnje granice je nedostižna i ne prikazuje se.
function _temKlaseOpis(cls) {
  if (!cls) return [];
  if (cls.cat) return cls.vals.map((v, i) => ({ i, boja: cls.colors[i], lbl: v }));
  if(cls.ranges) return cls.ranges.map((r,i)=>({i,boja:cls.colors[i],lbl:_temBr(r.min)+' – '+_temBr(r.max)+(r.label ? ' · '+r.label : '')}));
  const nK = Math.min(cls.colors.length, cls.breaks.length + 1);
  const edges = [cls.min, ...cls.breaks.slice(0, nK - 1), cls.max];
  const out = [];
  for (let i = 0; i < nK; i++) out.push({ i, boja: cls.colors[i], lbl: _temBr(edges[i]) + ' – ' + _temBr(edges[i + 1]) });
  return out;
}

// Jednaki intervali između min i max; granice zaokružene prema širini koraka.
function _temJednakiIntervali(min, max, n) {
  if (!(max > min) || n < 2) return [];
  const step = (max - min) / n, dec = step >= 10 ? 0 : step >= 1 ? 1 : 2;
  const out = [];
  for (let i = 1; i < n; i++) {
    const b = +(min + step * i).toFixed(dec);
    if (b > min && b < max && (!out.length || b > out[out.length - 1])) out.push(b);
  }
  return out;
}

// Pregled aktivne teme: broj odsjeka i površina po klasi + prosjek (i ponderisan površinom —
// mali odsjek sa ekstremnom vrijednošću inače vuče obični prosjek koliko i velik).
function _temStatistika(entry) {
  const cls = entry?._cls;
  if (!cls) return null;
  const klase = cls.colors.map(() => ({ n: 0, ha: 0 }));
  const bez = { n: 0, ha: 0 };
  let ukupnoHa = 0, nVal = 0, sum = 0, sumW = 0, w = 0, min = Infinity, max = -Infinity;
  entry.features.forEach(f => {
    const ha = _temPovrsinaHa(f), raw = f.attrs[cls.col];
    ukupnoHa += ha;
    const i = _temKlasaIdx(cls, raw);
    if (i < 0) { bez.n++; bez.ha += ha; return; }
    klase[i].n++; klase[i].ha += ha;
    if (!cls.cat) {
      const v = _temNum(raw);
      nVal++; sum += v; sumW += v * ha; w += ha;
      if (v < min) min = v; if (v > max) max = v;
    }
  });
  return { klase, bez, ukupnoHa, n: entry.features.length,
    prosjek: nVal ? sum / nVal : NaN, prosjekPov: w > 0 ? sumW / w : NaN,
    min: nVal ? min : NaN, max: nVal ? max : NaN };
}

// Stanje editora klasa iz aktivne klasifikacije (isti oblik na sva četiri mjesta).
function _temDraftIz(cls, pal) {
  if (!cls) return null;
  if (cls.cat) return { cat: true, vals: cls.vals.slice(), colors: cls.colors.slice() };
  const nK = Math.min(cls.colors.length, cls.breaks.length + 1);
  const edges=[cls.min,...cls.breaks.slice(0,nK-1),cls.max];
  return {colors:cls.colors.slice(0,nK),edges,pal:pal || cls.pal || 'zc',
    ...(cls.ranges ? {sourceRanges:cls.ranges.map(r=>({...r})),sourceEdges:edges.slice()} : {})};
}

function _temRegSave(maps = _temMaps, removedId = null) {
  try {
    // Sačuvaj i zapise čiji se fajl još otvara ili trenutno nije dostupan.
    const old = JSON.parse(localStorage.getItem(_TEM_REG_KEY) || '[]');
    const rows = maps.map(m => ({ id: m.id, name: m.name, theme: m.theme,
      visible: m.visible, opacity: m.opacity, styles: m.styles || {}, colLabels: m.colLabels || {} }));
    if (Array.isArray(old)) old.forEach(m => {
      if (m.id !== removedId && !rows.some(r => r.id === m.id)) rows.push(m);
    });
    localStorage.setItem(_TEM_REG_KEY, JSON.stringify(rows));
    return true;
  } catch(e) { console.warn('Tematske karte: registar nije sačuvan', e); return false; }
}
function _temById(id) { return _temMaps.find(m => m.id === id); }
// Prikazni naziv atributa — ručno preimenovan (colLabels) ili auto (_ → razmak)
function _temColLabel(entry, col) {
  if (!col) return '';
  if (col === '__ha') return 'Površina (ha)';   // izračunata kolona tabele (_TEM_HA_COL)
  return (entry?.colLabels && entry.colLabels[col]) || _TEM_NAZIVI[String(col).toLowerCase()] || col.replace(/_/g, ' ');
}

// GPKG geometrija: 'GP' magic + flags + srs_id + envelope, pa standardni WKB.
// Vraća { srsId, polys: [[ring…]] } gdje je ring lista [x, y] SIROVIH koordinata
// (transformacija u lat/lng se radi poslije, kad se srs razriješi).
function _parseGpkgGeom(bytes) {
  if (!bytes || bytes.length < 12 || bytes[0] !== 0x47 || bytes[1] !== 0x50) return null;
  const blen = bytes.byteLength;
  const view = new DataView(bytes.buffer, bytes.byteOffset, blen);
  const flags = bytes[3];
  if (flags & 0x20) return null;               // prazna geometrija
  const hdrLe = !!(flags & 0x01);
  const srsId = view.getInt32(4, hdrLe);
  const envSizes = [0, 32, 48, 48, 64];
  let pos = 8 + (envSizes[(flags >> 1) & 0x07] || 0);

  const _OOB = { oob: true };
  let le = true;
  const rU32 = () => { if (pos + 4 > blen) throw _OOB; const v = view.getUint32(pos, le); pos += 4; return v; };
  const rF64 = () => { if (pos + 8 > blen) throw _OOB; const v = view.getFloat64(pos, le); pos += 8; return v; };
  const dimsOf = t => 2 + (((t >= 1000 && t < 2000) || t >= 3000) ? 1 : 0) + (t >= 2000 ? 1 : 0);

  const polys = [];
  function readGeom(depth) {
    if (depth > 3 || pos >= blen) throw _OOB;
    le = bytes[pos++] === 0x01;                // WKB: svaka geometrija nosi SVOJ endian bajt
    const gt = rU32(), base = gt % 1000, nd = dimsOf(gt);
    if (base === 3) {                          // Polygon
      const nr = rU32(); if (nr > 1e6) throw _OOB;
      const rings = [];
      for (let i = 0; i < nr; i++) {
        const n = rU32(); if (n > 5e6) throw _OOB;
        const pts = [];
        for (let j = 0; j < n; j++) {
          const x = rF64(), y = rF64();
          for (let k = 2; k < nd; k++) rF64(); // preskoči Z/M
          pts.push([x, y]);
        }
        rings.push(pts);
      }
      polys.push(rings);
    } else if (base === 6 || base === 7) {     // MultiPolygon / GeometryCollection
      const n = rU32(); if (n > 1e5) throw _OOB;
      for (let i = 0; i < n; i++) readGeom(depth + 1);
    }
    // ostale tipove (tačke/linije) ignorišemo — tematska karta je poligonska
  }
  try { readGeom(0); } catch(e) { if (!e.oob) throw e; }
  return { srsId, polys };
}

// Razriješi transformaciju srs → WGS84. Vraća fn([x,y]) → [lat,lng] ili null (već WGS84).
function _temResolveTr(srsId, srsDefs) {
  if (srsId === 4326 || srsId === 0 || srsId === -1) return null;
  const known = { 31276: 'EPSG:31276', 31275: 'EPSG:31275', 3908: 'EPSG:3908' };
  let src = known[srsId] || null;
  if (!src && srsDefs && srsDefs[srsId]) {
    try { proj4('TEM_SRC', 'WGS84', [0, 0]); } catch(e) {}
    try { proj4.defs('TEM_SRC', srsDefs[srsId]); src = 'TEM_SRC'; } catch(e) { src = null; }
  }
  if (!src) return null; // nepoznat srs — pretpostavi WGS84, heuristika ispod hvata metre
  return ([x, y]) => { const [lng, lat] = proj4(src, 'WGS84', [x, y]); return [lat, lng]; };
}

// Ugrađene teme/legenda su podaci fajla, ne nove računice pogodnosti.
// Čitaju se samo male metapodatkovne tabele; model_audit/ulazi se ne skeniraju.
async function _temReadSourceStyles(mini, tables, entry, ft) {
  const read = async name => {
    const t=tables[name]; if(!t) return [];
    const cols=(t.sql.match(/\(([\s\S]+)\)/)?.[1] || '').split(',').map(c=>c.trim().split(/\s+/)[0].replace(/["'`]/g,'').toLowerCase());
    const rows=[];
    try { await mini._scanLeaves(t.root,(rid,r)=>{
      if(rows.length>=1000) throw {metadataLimit:true};
      const row={};cols.forEach((c,i)=>{row[c]=r[i]});rows.push(row);
    },null,64); } catch(e) { if(!e.metadataLimit) throw e; }
    return rows;
  };
  const fields=new Set(entry.cols), source={}, order=[];
  const add=(col,label,description)=>{
    col=String(col || '').toLowerCase(); if(!fields.has(col)) return null;
    if(!source[col]) { source[col]={label:String(label || col.replace(/_/g,' ')),description:String(description || ''),ranges:[],outline:false}; order.push(col); }
    return source[col];
  };
  for(const r of await read('teme')) add(r.polje,r.naziv,r.opis);
  const color=v=>/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : null;
  for(const r of await read('legenda')) {
    const t=add(r.tema),lo=_temNum(r.min_vrijednost),hi=_temNum(r.max_vrijednost),c=color(r.boja);
    if(!t || !Number.isFinite(lo) || !Number.isFinite(hi) || hi<lo || !c) continue;
    const alpha=_temNum(r.alfa);
    t.ranges.push({min:lo,max:hi,color:c,label:String(r.naziv || ''),opacity:Number.isFinite(alpha)?Math.max(0,Math.min(1,alpha/255)):1});
  }
  // QGIS graduated SimpleFill fallback ako fajl nema tabelu legenda.
  // XML se samo parsira: ne izvršava se i ne preuzima nijedan vanjski resurs.
  let defaultCol=null;
  for(const r of await read('layer_styles')) {
    if(String(r.f_table_name || '').toLowerCase()!==ft.name.toLowerCase() || !r.styleqml || String(r.styleqml).length>2000000) continue;
    const xml=new DOMParser().parseFromString(String(r.styleqml),'application/xml');
    if(xml.querySelector('parsererror')) continue;
    const renderer=xml.querySelector('renderer-v2[type="graduatedSymbol"]');if(!renderer) continue;
    const col=String(renderer.getAttribute('attr') || '').toLowerCase(),t=add(col,r.stylename,r.description);if(!t) continue;
    if(Number(r.useasdefault)===1) defaultCol=col;
    if(t.ranges.length) continue;
    const symbols={};
    xml.querySelectorAll('symbols > symbol').forEach(symbol=>{
      const raw=symbol.querySelector('Option[name="color"],prop[k="color"]');
      const parts=String(raw?.getAttribute('value') || raw?.getAttribute('v') || '').split(',').map(Number);
      if(parts.length<3 || parts.some(v=>!Number.isFinite(v)||v<0||v>255)) return;
      const c='#'+parts.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
      const alpha=_temNum(symbol.getAttribute('alpha'));
      symbols[symbol.getAttribute('name')]={color:c,opacity:(Number.isFinite(alpha)?Math.max(0,Math.min(1,alpha)):1)*(parts.length>3?parts[3]/255:1)};
    });
    renderer.querySelectorAll('ranges > range').forEach(range=>{
      if(range.getAttribute('render')==='false')return;
      const lo=_temNum(range.getAttribute('lower')),hi=_temNum(range.getAttribute('upper')),symbol=symbols[range.getAttribute('symbol')];
      if(symbol && Number.isFinite(lo) && Number.isFinite(hi) && hi>=lo)t.ranges.push({min:lo,max:hi,...symbol,label:range.getAttribute('label') || ''});
    });
  }
  for(const col of Object.keys(source)) {
    const t=source[col];t.ranges.sort((a,b)=>a.min-b.min);
    if(!t.ranges.length || t.ranges.length>20 || t.ranges.some((r,i)=>i && r.min<t.ranges[i-1].max)) { delete source[col];continue; }
    if(!entry.colLabels[col]) entry.colLabels[col]=t.label;
  }
  entry.sourceThemes=source;entry.sourceOrder=order.filter(c=>source[c]);
  entry.sourceDefaultTheme=source[defaultCol] ? defaultCol : entry.sourceOrder[0] || null;
}
function _temSourceClass(entry,col,ranges) {
  const source=entry.sourceThemes?.[col];if(!source)return null;
  const rows=(ranges || source.ranges).map(r=>({...r}));
  if(!rows.length || rows.some(r=>!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.max<r.min||!/^#[0-9a-f]{6}$/i.test(r.color || '')))return null;
  return {col,ranges:rows,breaks:rows.slice(1).map(r=>r.min),colors:rows.map(r=>r.color),
    min:rows[0].min,max:rows[rows.length-1].max,pal:'source',hideMissing:true,outline:source.outline};
}

function _temCurrent(epoch, owner) {
  return epoch === _temEpoch && owner === (typeof sbUser !== 'undefined' ? sbUser?.id : null);
}
function _temStatus(text) {
  _temLoadStatus = text;
  const el = document.getElementById('tem-load-status');
  if (el) el.textContent = text;
}
function _gpkgLoadFile(file) { return _gpkgLoadFiles(file ? [file] : []); }
function _gpkgLoadFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return Promise.resolve();
  const epoch = _temEpoch, owner = typeof sbUser !== 'undefined' ? sbUser?.id : null;
  const current = () => _temCurrent(epoch, owner);
  const run = async () => {
    if (!current()) return;
    showTemModal();
    let done = 0;
    for (let i = 0; i < list.length; i++) {
      if (!current()) break;
      const file = list[i];
      _temStatus(`Učitavanje ${i + 1}/${list.length}: ${file.name}`);
      let key = null;
      try {
        if (!/\.gpkg$/i.test(file.name)) throw new Error('Odaberi GPKG fajl');
        const buf = await file.arrayBuffer();
        if (!current()) break;
        const entry = await _gpkgParseBuf(buf, file.name, { stage: true, isCurrent: current });
        if (!entry) throw new Error('Fajl nema čitljive poligone');
        if (!current()) break;
        _temStatus(`Čuvanje ${i + 1}/${list.length}: ${file.name}`);
        key = _TEM_IDB_PFX + entry.id;
        if (!await _kmlcSave(key, buf)) throw new Error('Nema dovoljno prostora ili čuvanje fajla nije uspjelo');
        if (!current()) { await _kmlcDelete(key); break; }
        if (!_temRegSave([..._temMaps, entry])) throw new Error('Registar nije sačuvan — oslobodi prostor i pokušaj ponovo');
        _temMaps.push(entry);
        key = null; // Odavde fajl ima potvrđen registar; greška UI-a ne briše izvornik.
        if (entry.visible) entry.grp.addTo(map);
        _temLegendUpd();
        if (!_temSelectedId) _temSelectedId = entry.id;
        done++;
        _temModalRender(true);
      } catch(e) {
        if (key) await _kmlcDelete(key);
        if (!current()) break;
        console.warn('GPKG učitavanje:', e);
        showToast('GPKG: ' + file.name + ' — ' + (e.message || 'učitavanje nije uspjelo'));
      }
    }
    if (current()) _temStatus(`Učitano ${done}/${list.length} fajlova. Sačuvane karte rade bez interneta.`);
  };
  const task = _temQueue.then(run);
  _temQueue = task.catch(e => { if (current()) _temStatus('Učitavanje nije uspjelo. Pokušaj ponovo.'); console.warn(e); });
  return _temQueue;
}

// Parsira buf i registruje novu kartu. `saved` = zapis iz registra (restore poslije
// restarta: id/theme/visible/styles se zadržavaju). Vraća entry ili null.
async function _gpkgParseBuf(buf, name, opts, saved) {
  if (!_MiniSqliteMain) { showToast('⚠ SQLite čitač nije dostupan'); return false; }
  const mini = new _MiniSqliteMain(new File([buf], 'tem.gpkg'));
  await mini.init();

  // 1. Sve tabele iz sqlite_master
  const tables = {};
  await mini._scanLeaves(1, (rid, r) => {
    if (r[0] === 'table' && r[1]) tables[r[1].toLowerCase()] = { name: r[1], root: r[3], sql: r[4] || '' };
  });

  // 2. gpkg_spatial_ref_sys → definicije za nepoznate srs-ove (kolona 'definition')
  const srsDefs = {};
  const srsT = tables['gpkg_spatial_ref_sys'];
  if (srsT) {
    const srsCols = (srsT.sql.match(/\(([^)]+)\)/)?.[1] || '').split(',')
      .map(c => c.trim().split(/\s+/)[0].toLowerCase().replace(/["'`]/g, ''));
    const iId = srsCols.indexOf('srs_id'), iDef = srsCols.indexOf('definition');
    if (iId >= 0 && iDef >= 0) {
      try { await mini._scanLeaves(srsT.root, (rid, r) => { if (r[iId] != null && r[iDef]) srsDefs[r[iId]] = r[iDef]; }); } catch(e) {}
    }
  }

  // 3. Nađi feature tabelu: probe za blob s 'GP' magicom
  const _isGpBlob = v => v && (v instanceof Uint8Array) && v.length >= 12 && v[0] === 0x47 && v[1] === 0x50;
  let ft = null, geomIdx = -1;
  for (const key of Object.keys(tables)) {
    if (/^(gpkg_|sqlite_|rtree_)/.test(key)) continue;
    const t = tables[key];
    let found = -1, probed = 0;
    try {
      await mini._scanLeaves(t.root, (rid, r) => {
        for (let j = 0; j < r.length; j++) { if (_isGpBlob(r[j])) { found = j; throw { stop: 1 }; } }
        if (++probed >= 50) throw { stop: 1 };
      });
    } catch(e) { if (!e.stop) throw e; }
    if (found >= 0) { ft = t; geomIdx = found; break; }
  }
  if (!ft) { showToast('⚠ U GPKG fajlu nije nađena tabela s poligonima'); return null; }

  // 4. Imena kolona + offset (rowid-alias može pomjeriti payload — isti obrazac kao odsjeci)
  const colDefs = (ft.sql.match(/\(([\s\S]+)\)/)?.[1] || '').split(',').map(c => c.trim().split(/\s+/));
  const colNames = colDefs.map(d => (d[0] || '').toLowerCase().replace(/["'`]/g, ''));
  const colTypes = colDefs.map(d => (d[1] || '').toUpperCase());
  const declaredGeom = colNames.findIndex(n => /geom|shape/.test(n));
  const colOffset = declaredGeom >= 0 ? (declaredGeom - geomIdx) : 0;
  const attrName = j => colNames[j + colOffset] || ('kolona_' + j);
  const attrTxt = j => /^(TEXT|VARCHAR|CHAR|CLOB|NVARCHAR)/.test(colTypes[j + colOffset] || '');

  // 5. Novi entry u registru (restore zadržava id/temu/vidljivost/ručne klase)
  _temRenderer = _temRenderer || L.canvas({ padding: 0.3 });
  const entry = {
    id: saved?.id || ('t' + Date.now().toString(36) + Math.floor(Math.random() * 1e4)),
    name, grp: L.layerGroup(), features: [], cols: [],
    theme: null, visible: saved ? saved.visible !== false : true,
    opacity: (saved && Number.isFinite(saved.opacity)) ? saved.opacity : 0.55,
    styles: (saved && saved.styles) || {}, colLabels: (saved && saved.colLabels) || {}, _cls: null
  };
  const numStats = {}; // ime → {num, tot}
  let tr = null, trResolved = false, cnt = 0, allBounds = null;

  await mini._scanLeaves(ft.root, (rid, row) => {
    const blob = row[geomIdx];
    if (!_isGpBlob(blob)) return;
    const g = _parseGpkgGeom(blob);
    if (!g || !g.polys.length) return;
    if (!trResolved) {
      tr = _temResolveTr(g.srsId, srsDefs);
      // Heuristika: koordinate u metrima (nema tr, |x| > 180) → probaj MGI zonu po x_0
      if (!tr) {
        const p0 = g.polys[0]?.[0]?.[0];
        if (p0 && Math.abs(p0[0]) > 180) tr = _temResolveTr(p0[0] > 6e6 ? 31276 : 31275, srsDefs);
      }
      trResolved = true;
    }
    const attrs = {};
    for (let j = 0; j < row.length; j++) {
      if (j === geomIdx) continue;
      const nm = attrName(j);
      if (nm === 'fid' || nm === 'id') continue;
      const v = row[j];
      attrs[nm] = (v instanceof Uint8Array) ? null : v;
      const st = numStats[nm] = numStats[nm] || { num: 0, tot: 0, vals: new Set(), mnogo: false, txt: attrTxt(j) };
      if (v != null && v !== '') {
        st.tot++;
        if (Number.isFinite(Number(v))) st.num++;
        if (!st.mnogo) { st.vals.add(String(v)); if (st.vals.size > (st.txt ? _TEM_KAT_MAX_TXT : _TEM_KAT_MAX)) { st.mnogo = true; st.vals.clear(); } }
      }
    }
    const f = { attrs, polys: [] };
    for (const rings of g.polys) {
      const llRings = rings.map(ring => ring.map(pt => {
        if (tr) { try { return tr(pt); } catch { return [pt[1], pt[0]]; } }
        return [pt[1], pt[0]];   // WGS84: [x=lng, y=lat] → [lat, lng]
      }));
      if (!llRings[0]?.length) continue;
      const poly = L.polygon(llRings, {
        renderer: _temRenderer, color: '#94a3b8', weight: 1, opacity: 0.8,
        fillColor: '#94a3b8', fillOpacity: 0.08, interactive: true
      });
      poly.bindPopup(() => _temPopupHtml(entry, f), { minWidth: 240, maxWidth: 300, className: 'tem-popup' });
      f.polys.push(poly);
      entry.grp.addLayer(poly);
      try { const b = poly.getBounds(); if (b.isValid()) allBounds = allBounds ? allBounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); } catch {}
      cnt++;
    }
    if (opts?.isCurrent && !opts.isCurrent()) throw new Error('Učitavanje prekinuto');
    if (f.polys.length) entry.features.push(f);
  }, null, 64);

  if (!cnt) { showToast('⚠ GPKG: nije parsiran nijedan poligon'); return null; }
  entry.cols = Object.keys(numStats).filter(n => {
    const s = numStats[n];
    return s.tot >= 3 && s.num / s.tot >= 0.8 && !s.txt;
  }).sort();
  // Kategorijske teme: pretežno tekstualna kolona sa 2..20 različitih vrijednosti
  // (uređajni razred, vrsta, GJ...), a TEXT kolona do 80. Broj odjela ima stotine
  // vrijednosti — nije tema. TEXT kolona sa JEDNOM vrijednošću je tema samo ako dio
  // odsjeka nema podatak: to je oznaka (npr. minirano "Da") i vrijedi je istaći na karti.
  const nF = entry.features.length;
  entry.catCols = Object.keys(numStats).filter(n => {
    const s = numStats[n];
    if (s.tot < 3 || s.mnogo || _TEM_ID_RE.test(n) || !(s.txt || s.num / s.tot < 0.8)) return false;
    return s.vals.size >= 2 || (s.txt && s.vals.size === 1 && s.tot < nF);
  }).sort();
  await _temReadSourceStyles(mini, tables, entry, ft);
  if(entry.sourceOrder.length) entry.cols=[...entry.sourceOrder,...entry.cols.filter(c=>!entry.sourceOrder.includes(c))];
  if(!saved && entry.sourceDefaultTheme) entry.opacity=entry.sourceThemes[entry.sourceDefaultTheme].ranges[0].opacity;
  entry._bounds = allBounds;
  if (opts?.isCurrent && !opts.isCurrent()) return null;
  if (opts?.canPublish && !opts.canPublish()) return null;
  entry.theme = saved ? saved.theme || null : entry.sourceDefaultTheme;
  if(entry.theme && !entry.styles[entry.theme]) { entry._cls=_temSourceClass(entry,entry.theme); if(entry._cls)_temOboji(entry); }
  if (opts?.stage) return entry;
  if (_temById(entry.id)) return _temById(entry.id);
  _temMaps.push(entry);
  if (entry.visible) entry.grp.addTo(map);

  if (opts?.fit && allBounds && allBounds.isValid()) map.fitBounds(allBounds, { padding: [20, 20] });
  // Uspješno učitavanje prikazano je u panelu karata, bez obavijesti.

  // Vrati zapamćenu temu (restore poslije restarta)
  if (entry.theme && (entry.cols.includes(entry.theme) || entry.catCols.includes(entry.theme))) _temApplyTheme(entry.id, entry.theme);
  if (typeof _temModalRender === 'function') _temModalRender(true);
  return entry;
}

// Popup kartica — moderna, tamna, jak kontrast. Zaglavlje istakne odjel/GJ i površinu
// iz geometrije; aktivna tema karte je naglašena bojom njene klase (kao QGIS identify).
function _temPopupHtml(entry, f) {
  const entries = Object.entries(f.attrs).filter(([, v]) => v != null && v !== '');
  // Prepoznaj odjel i GJ za zaglavlje (raw ili preimenovan naziv)
  const findKey = (...names) => entries.find(([k]) =>
    names.includes(k.toLowerCase()) || names.includes(_temColLabel(entry, k).toLowerCase()))?.[0];
  const kOdjel = findKey('odjel', 'odsjek', 'odjel/odsjek', 'naziv');
  let kOdsjek = findKey('odsjek');
  if (kOdsjek === kOdjel) kOdsjek = null;
  const kGj = findKey('gj', 'gazdinska jedinica');
  const kPov = entries.find(([k]) => _TEM_POV_RE.test(k))?.[0];
  const odjelV = kOdjel ? f.attrs[kOdjel] : null;
  const odsjekV = kOdsjek ? f.attrs[kOdsjek] : null;
  const gjV = kGj ? f.attrs[kGj] : null;
  // Površina iz fajla (npr. povrsina_ha) ima prednost; inače procjena iz geometrije.
  const haF = kPov ? _temNum(f.attrs[kPov]) : NaN, ha = Number.isFinite(haF) ? haF : _temPovrsinaHa(f);
  const haTxt = ha > 0 ? `<span class="ha" title="Površina odsjeka">${Number.isFinite(haF) ? '' : '≈ '}${_temHa(ha)}</span>` : '';
  const header = `<div class="tem-card-hd">
    ${odjelV != null ? `<div class="odjel">${_escHtml(String(odjelV))}${odsjekV != null ? `<span class="ods">${_escHtml(String(odsjekV))}</span>` : ''}</div>` : `<div class="odjel sm">${_escHtml(entry.name)}</div>`}
    <div class="gj">${gjV != null ? _escHtml(String(gjV)) : ''}${haTxt}</div>
  </div>`;
  const cls = entry._cls;
  const rows = entries
    .filter(([k]) => k !== kOdjel && k !== kOdsjek && k !== kGj && k !== kPov)
    .map(([k, v]) => {
      const hot = k === entry.theme;
      const boja = hot ? _temBojaZa(cls, v) : null;
      const chip = boja ? `<i class="chip" style="background:${boja};"></i>` : '';
      return `<div class="tem-card-row${hot ? ' hot' : ''}${typeof v==='string' && v.length>90 ? ' long' : ''}">
        <span class="k">${_escHtml(_temColLabel(entry, k))}</span>
        <span class="v">${chip}${_escHtml(_temFmtVal(v))}</span>
      </div>`;
    }).join('');
  return `<div class="tem-card">${header}
    <div class="tem-card-body">${rows || '<div class="tem-card-row"><span class="k">Nema atributa</span></div>'}</div>
  </div>`;
}

// Automatske kvantilne granice (n klasa → n-1 granica, deduplikovano)
function _temQuantiles(vals, n = 5) {
  const breaks = [];
  for (let k = 1; k < n; k++) {
    const b = vals[Math.min(vals.length - 1, Math.floor(vals.length * k / n))];
    if (!breaks.length || b > breaks[breaks.length - 1]) breaks.push(b);
  }
  return breaks;
}

// Primijeni temu na kartu: ručne klase/boje (entry.styles[col]) imaju prednost, inače kvantili.
// Tekstualna kolona (entry.catCols) daje kategorijsku temu — boja po vrijednosti.
function _temApplyTheme(id, col) {
  const entry = _temById(id);
  if (!entry) return;
  if (_temEdOpenId !== id) delete _temEdDraft[id];
  if (!col) {
    entry.theme = null;
    entry._cls = null;
    if (_temEdOpenId === id) { _temEdOpenId = null; delete _temEdDraft[id]; }   // editor bez teme nema šta prikazati
    _temOboji(entry);
    _temRegSave(); _temLegendUpd();
    return;
  }
  const ov = entry.styles?.[col];
  const source = entry.sourceThemes?.[col];
  const sourceClass = source && (!ov || ov.ranges) ? _temSourceClass(entry,col,ov?.ranges) : null;
  if(sourceClass) { entry.theme=col;entry._cls=sourceClass; }
  else if ((entry.catCols || []).includes(col)) {
    const vidjeno = new Set();
    entry.features.forEach(f => { const v = f.attrs[col]; if (v != null && v !== '') vidjeno.add(String(v)); });
    if (!vidjeno.size) { showToast('⚠ Nema vrijednosti za temu "' + _temColLabel(entry, col) + '"'); return; }
    const vals = [...vidjeno].sort((a, b) => a.localeCompare(b, 'bs', { numeric: true }));
    const def = _temKatBoje(vals.length), cc = ov?.catColors || {};
    const colors = vals.map((v, i) => /^#[0-9a-f]{6}$/i.test(cc[v] || '') ? cc[v] : def[i]);
    entry.theme = col;
    entry._cls = { col, cat: true, vals, colors };
  } else {
    const vals = entry.features.map(f => _temNum(f.attrs[col])).filter(Number.isFinite).sort((a, b) => a - b);
    if (vals.length < 2) { showToast('⚠ Premalo vrijednosti za temu "' + _temColLabel(entry, col) + '"'); return; }
    // Broj klasa = proizvoljan (ručno podešen preko editora); default 5 kad nema override-a.
    const nDefault = 5;
    const breaks = (ov?.breaks?.length ? ov.breaks.slice().sort((a, b) => a - b) : _temQuantiles(vals, nDefault));
    const colors = (ov?.colors?.length >= 2 ? ov.colors : _temRampFor(nDefault));
    // lo/hi: ručno postavljene granice prve/zadnje klase (samo prikaz u legendi/editoru —
    // klasifikacija je vođena isključivo unutrašnjim granicama).
    const lo = Number.isFinite(ov?.lo) ? ov.lo : vals[0];
    const hi = Number.isFinite(ov?.hi) ? ov.hi : vals[vals.length - 1];
    entry.theme = col;
    entry._cls = { col, breaks, colors, min: lo, max: hi, pal: ov?.pal || 'zc' };
  }
  if(source && entry._cls) entry._cls.hideMissing=true;
  _temOboji(entry);
  // Editor otvoren za ovu kartu (npr. promjena teme iz dropdowna dok je editor
  // otvoren) — draft mora pratiti NOVU temu, inače ostaje na starim klasama.
  if (_temEdOpenId === id) _temEdDraft[id] = _temDraftIz(entry._cls);
  _temRegSave(); _temLegendUpd();
}

// Oboji sve poligone karte prema entry._cls (ili neutralno kad teme nema).
function _temOboji(entry) {
  const cls = entry._cls;
  const fo = Number.isFinite(entry.opacity) ? entry.opacity : 0.55;
  const bezTeme = { color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.08, weight: 1 };
  const bezPodatka = { color: '#64748b', fillColor: '#64748b', fillOpacity: Math.min(0.1, fo * 0.15), weight: 0.8 };
  entry.features.forEach(f => {
    const c = cls ? _temBojaZa(cls, f.attrs[cls.col]) : null;
    const st = !cls ? {...bezTeme,stroke:true,fill:true,interactive:true} : c
      ? {color:c,fillColor:c,fillOpacity:fo,weight:cls.ranges && cls.outline===false ? 0 : 1,stroke:!(cls.ranges && cls.outline===false),fill:true,interactive:true}
      : cls.hideMissing ? {stroke:false,fill:false,fillOpacity:0,weight:0,interactive:false} : {...bezPodatka,stroke:true,fill:true,interactive:true};
    f.polys.forEach(p => p.setStyle(st));
  });
}

// Jačina boje (fill opacity) tematskog sloja — uživo, bez reklasifikacije.
// oninput osvježi samo prikaz; kad korisnik pusti (change) → save.
function _temSetOpacity(id, val, commit) {
  const entry = _temById(id);
  if (!entry) return;
  const fo = Math.max(0.05, Math.min(1, parseFloat(val)));
  entry.opacity = fo;
  const lbl = document.getElementById('tem-op-lbl-' + id);
  if (lbl) lbl.textContent = Math.round(fo * 100) + '%';
  if (entry._cls) _temOboji(entry);
  if (commit) _temRegSave();
}

// Legenda na karti: jedan blok po VIDLJIVOJ karti s aktivnom temom. Dodir je skuplja na
// naslov (pamti se) — na malom ekranu kategorijska legenda zna zauzeti pola karte.
const _TEM_LEG_KEY = 'tvlake_tem_leg_skupljena';
function _temLegSkupljena() { try { return localStorage.getItem(_TEM_LEG_KEY) === '1'; } catch(e) { return false; } }
function _temLegToggle() {
  try { localStorage.setItem(_TEM_LEG_KEY, _temLegSkupljena() ? '0' : '1'); } catch(e) {}
  _temLegendUpd();
}
function _temLegendUpd() {
  let el = document.getElementById('tem-legend');
  const active = _temMaps.filter(m => m.visible && m._cls);
  if (!active.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'tem-legend';
    el.className = 'tem-leg';
    el.onclick = _temLegToggle;
    // Klik na legendu ne smije proći do karte (map.on('click') — mjerenja/vlake fallback).
    try { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); } catch(e) {}
    document.getElementById('map').appendChild(el);
  }
  const skup = _temLegSkupljena();
  el.classList.toggle('skup', skup);
  el.innerHTML = active.map(m => {
    const opis = _temKlaseOpis(m._cls);
    const naslov = `<div class="tem-leg-hd"><span>${_escHtml(_temColLabel(m, m._cls.col))}</span><span class="car">${skup ? '▸' : '▾'}</span></div>`;
    if (skup) return naslov + `<div class="tem-leg-strip">${opis.map(k => `<i style="background:${k.boja};"></i>`).join('')}</div>`;
    const imaBez = m.features.some(f => _temKlasaIdx(m._cls, f.attrs[m._cls.col]) < 0);
    const rows = opis.map(k => `<div class="tem-leg-row"><i style="background:${k.boja};"></i><span>${_escHtml(k.lbl)}</span></div>`).join('')
      + (imaBez ? `<div class="tem-leg-row bez"><i></i><span>${m._cls.hideMissing ? 'bez prikazane ocjene · sakriveno' : 'bez podatka'}</span></div>` : '');
    return naslov + rows;
  }).join('<div style="height:7px;"></div>');
}

// Vidljivost jedne karte (toggle u panelu)
function _temSetVisible(id, on) {
  const entry = _temById(id);
  if (!entry) return;
  const was = entry.visible;
  entry.visible = !!on;
  if (!_temRegSave()) { entry.visible = was; showToast('Vidljivost nije sačuvana: oslobodi prostor'); _temModalRender(true); return; }
  try { if (on) entry.grp.addTo(map); else map.removeLayer(entry.grp); } catch(e) {}
  _temLegendUpd(); _temModalRender(true);
}

function _temZoom(id) {
  const entry = _temById(id);
  if (entry?._bounds?.isValid()) { closeTemModal(); map.fitBounds(entry._bounds, { padding: [20, 20] }); }
}

// Preimenuj prikazni naziv trenutno odabranog atributa (samo prikaz — select, legenda,
// popup kartica; sirovi naziv kolone u .gpkg fajlu ostaje netaknut).
async function _temRenameCol(id) {
  const entry = _temById(id);
  if (!entry || !entry.theme) { showToast('⚠ Prvo odaberi temu koju želiš preimenovati'); return; }
  const cur = _temColLabel(entry, entry.theme);
  const val = await _dlgPrompt('Novi naziv za atribut:', cur, { title: '✏ Preimenuj atribut' });
  if (val == null) return;
  const trimmed = val.trim();
  if (!trimmed) { showToast('⚠ Naziv ne može biti prazan'); return; }
  entry.colLabels = entry.colLabels || {};
  entry.colLabels[entry.theme] = trimmed;
  _temRegSave();
  _temModalRender(true);
  _temLegendUpd();
  showToast('💾 Naziv zapisan — ostaje sačuvan i poslije odjave');
}

// Ukloni JEDNU kartu (trajno — briše i IDB i registar)
async function _temRemoveMap(id) {
  const entry = _temFileRows().find(m => m.id === id);
  if (!entry) return;
  const epoch = _temEpoch, owner = typeof sbUser !== 'undefined' ? sbUser?.id : null;
  if (!await _dlgConfirm(`Ukloniti tematsku kartu "${entry.name}"?`, { danger: true })) return;
  if (!_temCurrent(epoch, owner)) return;
  if (!_temRegSave(_temMaps.filter(m => m.id !== id), id)) { showToast('Karta nije uklonjena: čuvanje nije uspjelo'); return; }
  try { map.removeLayer(entry.grp); } catch(e) {}
  _temMaps = _temMaps.filter(m => m.id !== id);
  if (_temEdOpenId === id) _temEdOpenId = null;
  delete _temEdDraft[id];
  _kmlcDelete(_TEM_IDB_PFX + id).catch(() => {});
  _temLegendUpd(); _temModalRender(true);
  showToast('🗑 Tematska karta uklonjena');
}

// In-memory reset SVIH karata (odjava) — IDB + registar OSTAJU (isti korisnik ih vraća)
function _temRemoveAll(silent) {
  _temEpoch++; _temRestorePending = null; _temSelectedId = null; _temEdDraft = {}; _temLoadStatus = '';
  _temMaps.forEach(m => { try { map.removeLayer(m.grp); } catch(e) {} });
  _temMaps = [];
  _temEdOpenId = null;
  _temLegendUpd();
}

// Restore poslije restarta/prijave (poziva se iz showApp, iza prvog painta)
function _temRestore() {
  if (_temRestorePending) return _temRestorePending;
  const epoch = _temEpoch, owner = typeof sbUser !== 'undefined' ? sbUser?.id : null;
  const current = () => _temCurrent(epoch, owner);
  const run = async () => {
    if (!current()) return;
    // Legacy izvornik ostaje dok obje nove kopije nisu potvrđene.
    try {
      const name = localStorage.getItem(_TEM_NAME_KEY);
      if (name && !_temById('legacy1')) {
        const buf = await _kmlcGet(_TEM_IDB_KEY);
        if (buf && current()) {
          const entry = await _gpkgParseBuf(buf, name, { stage: true, isCurrent: current },
            { id: 'legacy1', theme: localStorage.getItem(_TEM_THEME_KEY), visible: true, styles: {} });
          if (entry && current() && await _kmlcSave(_TEM_IDB_PFX + entry.id, buf) && current() && _temRegSave([..._temMaps, entry])) {
            localStorage.removeItem(_TEM_NAME_KEY); localStorage.removeItem(_TEM_THEME_KEY);
            await _kmlcDelete(_TEM_IDB_KEY);
          }
        }
      }
    } catch(e) { console.warn('GPKG legacy:', e); }
    for (const saved of _temFileRows()) {
      if (!current()) break;
      if (_temById(saved.id)) continue;
      try {
        const buf = await _kmlcGet(_TEM_IDB_PFX + saved.id);
        if (buf && current()) await _gpkgParseBuf(buf, saved.name, { fit: false, isCurrent: current, canPublish: () => _temFileRows().some(m => m.id === saved.id) }, saved);
      } catch(e) { console.warn('GPKG ponovno otvaranje:', saved.name, e); }
    }
    if (current()) _temModalRender(true);
  };
  const task = _temQueue.then(run);
  _temQueue = task.catch(e => console.warn('GPKG restore:', e));
  _temRestorePending = _temQueue;
  const pending = _temRestorePending;
  pending.finally(() => { if (_temRestorePending === pending) _temRestorePending = null; });
  return _temRestorePending;
}

// ── Panel "Tematska karta" (meni) — pregled, teme, klase/boje, brisanje ───────
function showTemModal() {
  if (typeof closeLayerSheet === 'function') closeLayerSheet();
  document.getElementById('tem-modal').style.display = 'flex';
  _temModalRender(true);
}
function closeTemModal() {
  _temCaptureDraft();
  document.getElementById('tem-modal').style.display = 'none';
}

// ── Tabela atributa (QGIS-style) ──────────────────────────────────────────────
let _temTblId = null;
let _temTblSort = { col: null, dir: 1 };
let _temTblQ = '';
let _temTblSelById = {};      // id karte → Set izabranih kolona
let _temTblColsOpen = false;  // da li je birač kolona otvoren
let _temTblKlase = new Set(); // filter po klasi aktivne teme (indeks klase, -1 = bez podatka)
let _temTblUPrikazu = false;  // samo odsjeci koji su u trenutnom prikazu karte
const _TEM_TBL_KORAK = 300;  // redova po dijelu crtanja (ostatak se docrtava skrolom)
const _TEM_HA_COL = '__ha';   // izračunata kolona: površina odsjeka iz geometrije
const _TEM_TBL_KOL_KEY = 'tvlake_tem_tbl_skrivene';   // {mapId: [skrivene kolone]}

// Vrijednost ćelije — površina se računa iz geometrije, ostalo je atribut iz fajla.
function _temTblVal(f, col) {
  if (col === _TEM_HA_COL) { const ha = _temPovrsinaHa(f); return ha > 0 ? Math.round(ha * 100) / 100 : null; }
  return f.attrs[col];
}

// Redoslijed kolona za tabelu: odjel/GJ prve, pa površina, ostale u redoslijedu prvog pojavljivanja.
function _temTblCols(entry) {
  const keys = [];
  const seen = new Set();
  entry.features.forEach(f => Object.keys(f.attrs).forEach(k => {
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }));
  const lc = s => String(s).toLowerCase();
  const findKey = (...names) => keys.find(k =>
    names.includes(lc(k)) || names.includes(lc(_temColLabel(entry, k))));
  const kOdjel = findKey('odjel', 'odjel/odsjek', 'odjel_odsjek', 'odsjek');
  let kOdsjek = findKey('odsjek', 'odsjek broj');
  if (kOdsjek === kOdjel) kOdsjek = null;   // isti stub → nema zasebnog odsjeka
  const kGj = findKey('gj', 'gazdinska jedinica');
  const locked = [kOdjel, kOdsjek].filter(Boolean);   // uvijek prikazane, nisu u pickeru
  const head = [kOdjel, kOdsjek, kGj].filter(Boolean);
  // Fajl koji već nosi površinu (povrsina_ha) ne dobija drugu, izračunatu kolonu pored nje.
  const kPov = keys.find(k => _TEM_POV_RE.test(k)) || _TEM_HA_COL;
  const rest = keys.filter(k => !head.includes(k) && k !== kPov);
  return { cols: [...head, kPov, ...rest], kOdjel, kOdsjek, kGj, locked };
}
function _temTblNum(entry, col) { return col === _TEM_HA_COL || entry.cols.includes(col); }

// Izbor kolona se pamti po karti kao spisak SKRIVENIH — kolona koja se tek pojavi
// (npr. nova verzija .gpkg fajla) je vidljiva, umjesto da tiho izostane.
function _temTblSkrivene() {
  try { const o = JSON.parse(localStorage.getItem(_TEM_TBL_KOL_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch (e) { return {}; }
}
function _temTblSelSet(entry) {
  if (!_temTblSelById[entry.id]) {
    const skr = new Set(_temTblSkrivene()[entry.id] || []);
    _temTblSelById[entry.id] = new Set(_temTblCols(entry).cols.filter(c => !skr.has(c)));
  }
  return _temTblSelById[entry.id];
}
function _temTblSelSacuvaj(entry) {
  const sel = _temTblSelSet(entry);
  const o = _temTblSkrivene();
  o[entry.id] = _temTblCols(entry).cols.filter(c => !sel.has(c));
  try { localStorage.setItem(_TEM_TBL_KOL_KEY, JSON.stringify(o)); } catch (e) {}
}
// Vidljive kolone = zaključane (odjel/odsjek) uvijek + ostale po izboru (čuva redoslijed)
function _temTblVisibleCols(entry) {
  const { cols, locked } = _temTblCols(entry);
  const sel = _temTblSelSet(entry);
  return cols.filter(c => locked.includes(c) || sel.has(c));
}

function showTemTable(id) {
  const entry = _temById(id);
  if (!entry) return;
  _temTblId = id;
  const tk = _temTblCols(entry);
  _temTblSort = { col: tk.kGj || tk.kOdjel || null, dir: 1 };   // default: po GJ, pa odjelu i odsjeku ↑
  _temTblQ = '';
  _temTblKlase = new Set();
  _temTblUPrikazu = false;
  _temTblColsOpen = false;
  const s = document.getElementById('ttm-search'); if (s) s.value = '';
  const menu = document.getElementById('ttm-cols-menu'); if (menu) menu.style.display = 'none';
  _temTblSelSet(entry);
  document.getElementById('ttm-name').textContent = entry.name;
  document.getElementById('tem-table-modal').style.display = 'flex';
  _temTblRender();
}
function closeTemTable() {
  document.getElementById('tem-table-modal').style.display = 'none';
  _temTblColsOpen = false;
  const menu = document.getElementById('ttm-cols-menu'); if (menu) menu.style.display = 'none';
  document.removeEventListener('click', _temTblColsOutside);
  _temTblId = null;
}

function _temTblSortBy(ci) {
  const entry = _temById(_temTblId);
  if (!entry) return;
  const col = _temTblVisibleCols(entry)[ci];
  if (!col) return;
  if (_temTblSort.col === col) _temTblSort.dir *= -1;
  else _temTblSort = { col, dir: 1 };
  _temTblRender();
}

// ── Birač kolona ──────────────────────────────────────────────────────────────
function _temTblColsMenu() {
  _temTblColsOpen = !_temTblColsOpen;
  const menu = document.getElementById('ttm-cols-menu');
  if (!menu) return;
  if (_temTblColsOpen) {
    _temTblColsRenderMenu(); menu.style.display = 'block';
    setTimeout(() => document.addEventListener('click', _temTblColsOutside), 0);
  } else {
    menu.style.display = 'none';
    document.removeEventListener('click', _temTblColsOutside);
  }
}
function _temTblColsOutside(e) {
  const menu = document.getElementById('ttm-cols-menu');
  const btn = document.getElementById('ttm-colsbtn');
  if (!menu || menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  _temTblColsOpen = false;
  menu.style.display = 'none';
  document.removeEventListener('click', _temTblColsOutside);
}
function _temTblColsRenderMenu() {
  const entry = _temById(_temTblId);
  const menu = document.getElementById('ttm-cols-menu');
  if (!entry || !menu) return;
  const { cols: all, locked } = _temTblCols(entry);
  const sel = _temTblSelSet(entry);
  const items = all.map((c, ci) => {
    const lbl = _escHtml(_temColLabel(entry, c)) + (c === entry.theme ? ' <em>tema</em>' : '');
    if (locked.includes(c)) {   // odjel/odsjek — uvijek prikazano, zaključano
      return `<div class="ttm-col-item on" style="cursor:default;opacity:0.85;">
        <span class="cb">🔒</span><span>${lbl}</span>
      </div>`;
    }
    const on = sel.has(c);
    return `<div class="ttm-col-item ${on ? 'on' : 'off'}" onclick="_temTblColToggle(${ci})">
      <span class="cb">${on ? '☑' : '☐'}</span><span>${lbl}</span>
    </div>`;
  }).join('');
  menu.innerHTML = `<div class="ttm-cm-hd">
      <button onclick="_temTblColsAll()">Sve</button>
      <button onclick="_temTblColsNone()">Ništa</button>
    </div>${items}`;
}
function _temTblColToggle(ci) {
  const entry = _temById(_temTblId);
  if (!entry) return;
  const { cols, locked } = _temTblCols(entry);
  const col = cols[ci];
  if (!col || locked.includes(col)) return;   // zaključane se ne mijenjaju
  const sel = _temTblSelSet(entry);
  if (sel.has(col)) sel.delete(col); else sel.add(col);
  _temTblSelSacuvaj(entry);
  _temTblColsRenderMenu();
  _temTblRender();
}
function _temTblColsAll() {
  const entry = _temById(_temTblId);
  if (!entry) return;
  _temTblSelById[entry.id] = new Set(_temTblCols(entry).cols);
  _temTblSelSacuvaj(entry);
  _temTblColsRenderMenu();
  _temTblRender();
}
function _temTblColsNone() {
  const entry = _temById(_temTblId);
  if (!entry) return;
  _temTblSelById[entry.id] = new Set();
  _temTblSelSacuvaj(entry);
  _temTblColsRenderMenu();
  _temTblRender();
}
function _temTblSearch(v) {
  _temTblQ = (v || '').trim().toLowerCase();
  const x = document.getElementById('ttm-search-x'); if (x) x.style.display = _temTblQ ? 'flex' : 'none';
  _temTblRender();
}
function _temTblSearchClear() {
  const s = document.getElementById('ttm-search'); if (s) s.value = '';
  _temTblSearch('');
}

// ── Filteri: klasa aktivne teme i "u prikazu karte" ─────────────────────────
function _temTblKlasaToggle(k) {
  if (_temTblKlase.has(k)) _temTblKlase.delete(k); else _temTblKlase.add(k);
  _temTblRender();
}
function _temTblPrikazToggle() { _temTblUPrikazu = !_temTblUPrikazu; _temTblRender(); }
function _temTblFilteriPonisti() {
  _temTblKlase = new Set(); _temTblUPrikazu = false;
  _temTblSearchClear();
}
function _temTblGranice(f) {
  if (f._b !== undefined) return f._b;
  let b = null;
  f.polys.forEach(p => { try { const pb = p.getBounds(); if (pb.isValid()) b = b ? b.extend(pb) : L.latLngBounds(pb.getSouthWest(), pb.getNorthEast()); } catch (e) {} });
  f._b = b;
  return b;
}

// Redovi za prikaz I izvoz (isti filter i sort — CSV mora sadržavati ono što se vidi).
// Vraća [{i, f}] gdje je i ORIGINALNI indeks u entry.features (klik → zoom).
function _temTblRedovi(entry) {
  const cols = _temTblVisibleCols(entry);
  let rows = entry.features.map((f, i) => ({ i, f }));
  if (_temTblQ) {
    rows = rows.filter(r => cols.some(c => {
      const v = _temTblVal(r.f, c);
      return v != null && String(v).toLowerCase().includes(_temTblQ);
    }));
  }
  const cls = entry._cls;
  if (cls && _temTblKlase.size) rows = rows.filter(r => _temTblKlase.has(_temKlasaIdx(cls, r.f.attrs[cls.col])));
  if (_temTblUPrikazu) {
    let mb = null;
    try { mb = map.getBounds(); } catch (e) {}
    if (mb) rows = rows.filter(r => { const b = _temTblGranice(r.f); return b && mb.intersects(b); });
  }
  const sc = _temTblSort.col;
  if (sc) {
    const isNum = _temTblNum(entry, sc);
    // Jednake vrijednosti se redaju po GJ → odjel → odsjek: bez toga sort po odjelu
    // miješa "1a" iz tri različite GJ, a sort po GJ ostavlja odjele nasumično.
    const { kGj, kOdjel, kOdsjek } = _temTblCols(entry);
    const dalje = [kGj, kOdjel, kOdsjek].filter(k => k && k !== sc);
    const txt = (x, y) => _temColl.compare(String(x ?? ''), String(y ?? ''));
    rows.sort((a, b) => {
      const av = _temTblVal(a.f, sc), bv = _temTblVal(b.f, sc);
      const ae = av == null || av === '', be = bv == null || bv === '';
      if (ae !== be) return ae ? 1 : -1;   // prazne vrijednosti uvijek na dno
      if (!ae) {
        const cmp = isNum ? _temNum(av) - _temNum(bv) : txt(av, bv);
        if (cmp) return cmp * _temTblSort.dir;
      }
      for (const k of dalje) { const c = txt(a.f.attrs[k], b.f.attrs[k]); if (c) return c; }
      return 0;
    });
  }
  return rows;
}

// Broj decimala po koloni (0–2, najviše što vrijednosti stvarno imaju) — "435" i
// "435,20" u istoj koloni se ne mogu porediti pogledom, a zarez mora stajati u liniji.
function _temTblDec(entry, col) {
  if (col === _TEM_HA_COL) return 2;
  entry._dec = entry._dec || {};
  if (entry._dec[col] !== undefined) return entry._dec[col];
  let d = 0;
  for (const f of entry.features) {
    const v = _temNum(f.attrs[col]);
    if (!Number.isFinite(v) || Number.isInteger(v)) continue;
    const s = String(v), e = s.indexOf('.');
    d = Math.max(d, e < 0 ? 2 : Math.min(2, s.length - e - 1));
    if (d === 2) break;
  }
  entry._dec[col] = d;
  return d;
}
function _temTblBroj(v, dec) {
  const n = _temNum(v);
  if (!Number.isFinite(n)) return v == null || v === '' ? '' : String(v);
  const [c, d] = n.toFixed(dec).split('.');
  return c.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + d : '');
}

// Zbirni red: površina se SABIRA, ostale brojčane kolone se USREDNJAVAJU (zbir zalihe
// po ha ili visine nema smisla). Računa se nad filtriranim redovima — pokazuje ono što se gleda.
function _temTblZbir(entry, cols, rows) {
  return cols.map(c => {
    if (!_temTblNum(entry, c)) return null;
    const vals = rows.map(r => _temNum(_temTblVal(r.f, c))).filter(Number.isFinite);
    if (!vals.length) return null;
    const s = vals.reduce((a, b) => a + b, 0);
    return (c === _TEM_HA_COL || _TEM_POV_RE.test(c)) ? { tip: 'Σ', v: s, dec: 2 } : { tip: 'ø', v: s / vals.length, dec: Math.max(1, _temTblDec(entry, c)) };
  });
}

function _temFmtVal(v) {
  if (v == null || v === '') return '';
  return (typeof v === 'number' && !Number.isInteger(v)) ? v.toFixed(2).replace('.', ',') : String(v);
}

function _temTblChipsHtml(entry) {
  const cls = entry._cls;
  let h = '';
  if (cls) {
    const st = _temStatistika(entry);
    const chip = (k, boja, lbl, n) => `<button class="ttm-chip${_temTblKlase.has(k) ? ' on' : ''}" onclick="_temTblKlasaToggle(${k})">
      <i style="${boja ? 'background:' + boja : ''}" class="${boja ? '' : 'bez'}"></i>${_escHtml(lbl)}<b>${n}</b></button>`;
    h += _temKlaseOpis(cls).map(k => chip(k.i, k.boja, k.lbl, st.klase[k.i].n)).join('')
      + (st.bez.n ? chip(-1, null, 'bez podatka', st.bez.n) : '');
  }
  h += `<button class="ttm-chip prikaz${_temTblUPrikazu ? ' on' : ''}" onclick="_temTblPrikazToggle()"><svg class="ic"><use href="#ic-trazi"/></svg>U prikazu karte</button>`;
  return h;
}

function _temTblRender() {
  const entry = _temById(_temTblId);
  const scroll = document.getElementById('ttm-scroll');
  const foot = document.getElementById('ttm-foot');
  if (!entry || !scroll) return;
  const allCols = _temTblCols(entry).cols;
  const cols = _temTblVisibleCols(entry);
  const total = entry.features.length;
  const ukHa = entry.features.reduce((s, f) => s + _temPovrsinaHa(f), 0);

  const cbtn = document.getElementById('ttm-colsbtn');
  if (cbtn) cbtn.innerHTML = `<svg class="ic"><use href="#ic-postavke"/></svg> Kolone <b>${cols.length}/${allCols.length}</b>`;
  const sub = document.getElementById('ttm-sub');
  if (sub) sub.textContent = `${total} odsjeka · ${_temHa(ukHa)}`;
  const chips = document.getElementById('ttm-chips');
  if (chips) chips.innerHTML = _temTblChipsHtml(entry);

  if (!cols.length) {
    scroll.innerHTML = '<div class="ttm-prazno">Nijedna kolona nije odabrana.<br>Otvori <b>Kolone</b> i označi atribute.</div>';
    foot.textContent = `${total} redova`;
    return;
  }

  const rows = _temTblRedovi(entry);
  const filtrirano = !!(_temTblQ || _temTblKlase.size || _temTblUPrikazu);
  if (!rows.length) {
    scroll.innerHTML = `<div class="ttm-prazno">Nijedan odsjek ne odgovara filteru.
      <button onclick="_temTblFilteriPonisti()">Poništi filtere</button></div>`;
    foot.textContent = `Prikazano 0 od ${total}`;
    return;
  }
  const cls = entry._cls;
  const sc = _temTblSort.col;
  const dec = cols.map(c => _temTblNum(entry, c) ? _temTblDec(entry, c) : null);
  const klasa = (c, ci) => [c === entry.theme ? 'hot' : '', ci === 0 ? 'stick' : '', dec[ci] != null ? 'num' : ''].filter(Boolean).join(' ');

  const arw = c => c === sc ? `<span class="arw">${_temTblSort.dir > 0 ? '▲' : '▼'}</span>` : '';
  const thead = '<tr>' + cols.map((c, ci) =>
    `<th class="${klasa(c, ci)}" onclick="_temTblSortBy(${ci})">${_escHtml(_temColLabel(entry, c))}${arw(c)}</th>`).join('') + '</tr>';

  const klase = cols.map((c, ci) => klasa(c, ci));
  const redHtml = r => {
    const tds = cols.map((c, ci) => {
      const v = _temTblVal(r.f, c);
      const k = klase[ci];
      if (v == null || v === '') return `<td${k ? ` class="${k}"` : ''}><span class="nil">—</span></td>`;
      const boja = c === entry.theme ? _temBojaZa(cls, v) : null;
      const chip = boja ? `<span class="chip" style="background:${boja};"></span>` : '';
      const txt = dec[ci] != null ? _temTblBroj(v, dec[ci]) : _temFmtVal(v);
      return `<td${k ? ` class="${k}"` : ''}>${chip}${_escHtml(txt)}</td>`;
    }).join('');
    return `<tr onclick="_temTblRowClick(${r.i})">${tds}</tr>`;
  };
  // Crta se po dijelovima: 1635 odsjeka × 10 kolona odjednom je ~1 s i na desktopu.
  // Prvi dio odmah, ostatak kad se skrolom približi kraju (_temTblDodaj).
  _temTblCtx = { rows, redHtml, shown: Math.min(rows.length, _TEM_TBL_KORAK) };
  const tbody = rows.slice(0, _temTblCtx.shown).map(redHtml).join('');

  const zbir = _temTblZbir(entry, cols, rows);
  const tfoot = '<tr>' + cols.map((c, ci) => {
    if (ci === 0) return `<td class="stick zb">${rows.length} ${rows.length === 1 ? 'red' : 'redova'}</td>`;
    const z = zbir[ci];
    return z ? `<td class="num" title="${z.tip === 'Σ' ? 'Zbir' : 'Prosjek'}"><em>${z.tip}</em> ${_escHtml(_temTblBroj(z.v, z.dec))}</td>` : '<td></td>';
  }).join('') + '</tr>';

  scroll.innerHTML = `<table class="ttm-tbl"><thead>${thead}</thead><tbody id="ttm-tbody">${tbody}</tbody><tfoot>${tfoot}</tfoot></table>`;
  scroll.scrollTop = 0;
  scroll.onscroll = _temTblNaSkrol;
  foot.innerHTML = `Prikazano <b>${rows.length}</b> od ${total}`
    + (filtrirano ? ` · <button class="ttm-reset" onclick="_temTblFilteriPonisti()">poništi filtere</button>` : '')
    + `<span class="leg">Σ zbir · ø prosjek</span>`;
}

let _temTblCtx = null;
// Jedan collator za sve sortove — localeCompare sa opcijama gradi novi pri SVAKOM poređenju.
const _temColl = new Intl.Collator('bs', { numeric: true });
function _temTblDodaj() {
  const c = _temTblCtx, tb = document.getElementById('ttm-tbody');
  if (!c || !tb || c.shown >= c.rows.length) return;
  const do_ = Math.min(c.rows.length, c.shown + _TEM_TBL_KORAK);
  tb.insertAdjacentHTML('beforeend', c.rows.slice(c.shown, do_).map(c.redHtml).join(''));
  c.shown = do_;
}
function _temTblNaSkrol() {
  const s = document.getElementById('ttm-scroll');
  if (s && s.scrollTop + s.clientHeight > s.scrollHeight - 800) _temTblDodaj();
}

// Klik na red → zumira na taj odsjek na karti i otvori popup
function _temTblRowClick(i) {
  const entry = _temById(_temTblId);
  if (!entry) return;
  const f = entry.features[i];
  if (!f || !f.polys.length) return;
  closeTemTable();
  closeTemModal();
  if (!entry.visible) _temSetVisible(entry.id, true);
  const b = _temTblGranice(f);
  if (b && b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
  setTimeout(() => { try { f.polys[0].openPopup(); } catch(e) {} }, 250);
}

// CSV: vidljive kolone, filtrirani i sortirani redovi (tačno ono što je na ekranu, bez
// kape crtanja). Separator ";" + decimalni ZAREZ — tako Excel na bs/hr postavkama broj
// čita kao broj; tačka uz ";" daje tekst (ili datum) i kolonu nije moguće sabrati.
function _temTblCsv(entry) {
  const cols = _temTblVisibleCols(entry);
  const esc = s => /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const cell = (f, c) => {
    const v = _temTblVal(f, c);
    if (v == null) return '';
    if (_temTblNum(entry, c)) { const n = _temNum(v); if (Number.isFinite(n)) return String(n).replace('.', ','); }
    return esc(String(v));
  };
  const lines = [cols.map(c => esc(_temColLabel(entry, c))).join(';')];
  _temTblRedovi(entry).forEach(r => lines.push(cols.map(c => cell(r.f, c)).join(';')));
  return '﻿' + lines.join('\r\n');   // BOM: Excel inače dijakritiku čita kao Windows-1250 smeće
}
function _temTblCsvIme(entry) {
  const osnova = String(entry.name || 'tabela').replace(/\.gpkg$/i, '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 48);
  return 'Tabela_' + (osnova || 'tabela') + '.csv';
}
async function _temTblExport() {
  const entry = _temById(_temTblId);
  if (!entry) return;
  if (!_temTblVisibleCols(entry).length) { showToast('⚠ Nijedna kolona nije odabrana'); return; }
  const n = _temTblRedovi(entry).length;
  if (!n) { showToast('⚠ Nema redova za izvoz — poništi filtere'); return; }
  const i = await _dlgActions(`📋 CSV — ${n} ${n === 1 ? 'red' : 'redova'}`, [
    { label: '<svg class="ic"><use href="#ic-posalji"/></svg> Podijeli (Viber, WhatsApp, e-mail…)' },
    { label: '<svg class="ic"><use href="#ic-uvezi"/></svg> Sačuvaj .csv na telefon' },
  ]);
  if (i !== 0 && i !== 1) return;
  const csv = _temTblCsv(entry), ime = _temTblCsvIme(entry);
  try {
    if (i === 0) {
      if (typeof AndroidShare !== 'undefined' && AndroidShare.shareFile) {
        AndroidShare.shareFile(ime, 'data:text/csv;base64,' + btoa(unescape(encodeURIComponent(csv))), entry.name, 'Tabela atributa — ' + entry.name);
        return;
      }
      const file = new File([csv], ime, { type: 'text/csv' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: entry.name }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    // Sačuvaj (ili dijeljenje nije podržano): u APK-u <a download> presreće AndroidDownload most
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = ime;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('💾 Sačuvano: ' + ime + ' (' + n + ' redova)');
  } catch(e) {
    showToast('⚠ CSV nije uspio: ' + (e.message || 'nepoznato'));
  }
}

function _temFileRows() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(_TEM_REG_KEY) || '[]'); } catch(e) {}
  return [..._temMaps, ...(Array.isArray(saved) ? saved : []).filter(m => !_temById(m.id)).map(m => ({ ...m, unavailable: true }))];
}
function _temCaptureDraft() {
  const ed = document.querySelector('#tem-modal-body .tem-ed');
  if (ed?.dataset.temMapId === _temEdOpenId && _temEdDraft[_temEdOpenId]) _temEdPovuci(_temEdDraft[_temEdOpenId]);
}
const _TEM_SADNJA_FILE = 'USK_SADNJA_7_VRSTA_PROCJENA_V3.gpkg';
const _TEM_SADNJA_VRSTE = ['bukva','jela','smrca','hrast_kitnjak','hrast_luznjak','pitomi_kesten','gorski_javor'];
function _temIsSadnja(m) { return String(m?.name || '').toLowerCase() === _TEM_SADNJA_FILE.toLowerCase(); }
function _temOpenSadnja(id) {
  _temCaptureDraft();
  if (_temIsSadnja(_temById(id))) _temSelectedId = id;
  _temSwitchView('sadnja');
}
function _temSadnjaTheme(id, col) {
  const m = _temById(id);
  if (!_temIsSadnja(m) || !_TEM_SADNJA_VRSTE.includes(col) || !m.cols.includes(col)) return;
  _temCaptureDraft(); _temApplyTheme(id, col); _temModalRender();
}
function _temChoose(id) {
  _temCaptureDraft(); _temSelectedId = id; _temView = 'style'; _temModalRender();
  document.getElementById('tem-modal-body').scrollTop = 0;
}
function _temSwitchView(view) {
  _temCaptureDraft(); _temView = view; _temModalRender();
  document.getElementById('tem-modal-body').scrollTop = 0;
}
function _temSetAllVisible(on) {
  const old = _temMaps.map(m => m.visible);
  _temMaps.forEach(m => { m.visible = !!on; });
  if (!_temRegSave()) { _temMaps.forEach((m, i) => { m.visible = old[i]; }); showToast('Vidljivost nije sačuvana: oslobodi prostor'); _temModalRender(true); return; }
  _temMaps.forEach(m => { if (on) m.grp.addTo(map); else map.removeLayer(m.grp); });
  _temLegendUpd(); _temModalRender(true);
}
function _temModalRender(preserveDraft = false) {
  const body = document.getElementById('tem-modal-body');
  if (!body || document.getElementById('tem-modal').style.display === 'none') return;
  if (preserveDraft) _temCaptureDraft();
  const scroll = body.scrollTop, focus = document.activeElement;
  const focusId = body.contains(focus) ? focus.id : null;
  const rows = _temFileRows();
  const sadnja = _temView === 'sadnja', sadnjaMaps = _temMaps.filter(_temIsSadnja);
  if (sadnja && !_temIsSadnja(_temById(_temSelectedId))) _temSelectedId = sadnjaMaps[0]?.id || null;
  if (!_temById(_temSelectedId)) _temSelectedId = _temMaps[0]?.id || null;
  document.getElementById('tem-file-count').textContent = sadnja
    ? `${rows.filter(_temIsSadnja).length} fajlova za sadnju · ${sadnjaMaps.filter(m => m.visible).length} prikazano`
    : `${rows.length} fajlova · ${_temMaps.filter(m => m.visible).length} prikazano`;
  document.querySelectorAll('[data-tem-view]').forEach(el => {
    const on = el.dataset.temView === _temView;
    el.setAttribute('aria-selected', String(on)); el.classList.toggle('active', on);
  });
  _temStatus(_temLoadStatus);
  const cards = _temMaps.filter(m => m.id === _temSelectedId && (!sadnja || _temIsSadnja(m))).map(m => {
    const opt = c => `<option value="${_escHtml(c)}"${c === m.theme ? ' selected' : ''}>${_escHtml(_temColLabel(m, c))}</option>`;
    const kat = m.catCols || [];
    const opts = '<option value="">— Bez teme —</option>'
      + (kat.length
        ? `<optgroup label="Brojčane">${m.cols.map(opt).join('')}</optgroup><optgroup label="Kategorije">${kat.map(opt).join('')}</optgroup>`
        : m.cols.map(opt).join(''));
    const edOpen = _temEdOpenId === m.id && m.theme;
    const ukHa = m.features.reduce((s, f) => s + _temPovrsinaHa(f), 0);
    const jid = _jsAttr(m.id);
    const op = Math.round((m.opacity ?? 0.55) * 100);
    return `
    <div class="tem-mc${m.visible ? '' : ' skriven'}">
      <div class="tem-mc-hd">
        <div class="tem-mc-ti">
          <div class="nm">${_escHtml(m.name)}</div>
          <div class="sub">${m.features.length} ${sadnja ? 'ćelija' : 'odsjeka'} · ${_temHa(ukHa)} · ${m.cols.length + kat.length} tema</div>
        </div>
        <label class="tem-file-check"><input type="checkbox" ${m.visible ? 'checked' : ''} onchange="_temSetVisible('${jid}',this.checked)" aria-label="Prikaži ${_escHtml(m.name)}"><span>Prikaži</span></label>
      </div>
      ${sadnja ? `<div class="tem-lbl">Odaberi vrstu drveta</div><div class="tem-sadnja-species" role="group" aria-label="Vrste za procjenu sadnje">${_TEM_SADNJA_VRSTE.filter(c => m.cols.includes(c)).map(c => `<button data-sadnja-species="${c}" aria-pressed="${c === m.theme}" class="${c === m.theme ? 'active' : ''}" onclick="_temSadnjaTheme('${jid}','${c}')">${_escHtml(_temColLabel(m,c))}</button>`).join('')}</div>` : `<div class="tem-lbl">Tema (boji odsjeke po atributu)</div>
      <div class="tem-row">
        <select class="tem-sel" onchange="_temApplyTheme('${jid}', this.value || null);_temModalRender()">${opts}</select>
        <button class="tem-ib" onclick="_temRenameCol('${jid}')" ${m.theme ? '' : 'disabled'} title="Preimenuj naziv atributa"><svg class="ic"><use href="#ic-crtaj"/></svg></button>
      </div>`}
      ${m.sourceThemes?.[m.theme] ? `<details class="tem-source-info"><summary>Legenda i opis iz fajla</summary><p>${_escHtml(m.sourceThemes[m.theme].description)}</p><p>Prazne ćelije nemaju prikazanu ocjenu i skrivene su na karti.</p></details>` : ''}
      ${m.theme ? _temPregledHtml(m) : ''}
      ${m.theme ? `<div class="tem-op">
        <span>Jačina boje</span>
        <input type="range" min="5" max="100" step="1" value="${op}"
          oninput="_temSetOpacity('${jid}', this.value / 100, false)"
          onchange="_temSetOpacity('${jid}', this.value / 100, true)">
        <b id="tem-op-lbl-${_escHtml(m.id)}">${op}%</b>
      </div>` : ''}
      <div class="tem-akc">
        <button onclick="_temZoom('${jid}')"><svg class="ic"><use href="#ic-trazi"/></svg> Zumiraj</button>
        <button onclick="showTemTable('${jid}')"><svg class="ic"><use href="#ic-kopiraj"/></svg> Tabela</button>
        <button class="${edOpen ? 'akt' : ''}" onclick="_temEdToggle('${jid}')" ${m.theme ? '' : 'disabled'}><svg class="ic"><use href="#ic-boja"/></svg> Klase i boje</button>
        <button class="del" onclick="_temRemoveMap('${jid}')"><svg class="ic"><use href="#ic-zatvori"/></svg> Ukloni kartu</button>
      </div>
      ${edOpen ? _temClassEdHtml(m) : ''}
    </div>`;
  }).join('');
  const listing = rows.map(m => {
    const id = _jsAttr(m.id);
    return `<article class="tem-file${m.visible && !m.unavailable ? ' shown' : ''}">
      <div class="tem-file-top"><span class="tem-file-icon">GPKG</span><div class="tem-file-info">
        <b>${_escHtml(m.name)}</b><small>${m.unavailable ? 'Sačuvan zapis · fajl nije otvoren' : `${m.features.length} odsjeka · ${m.visible ? 'Prikazano' : 'Sakriveno'} · ${m.theme ? _escHtml(_temColLabel(m, m.theme)) : 'Bez teme'}`}</small>
      </div>${!m.unavailable ? `<label class="tem-file-check"><input type="checkbox" ${m.visible ? 'checked' : ''} onchange="_temSetVisible('${id}',this.checked)" aria-label="Prikaži ${_escHtml(m.name)}"><span>Prikaži</span></label>` : ''}</div>
      <div class="tem-file-actions">${m.unavailable
        ? '<button onclick="_temRestore()">Pokušaj otvoriti</button>'
        : `<button onclick="${_temIsSadnja(m) ? '_temOpenSadnja' : '_temChoose'}('${id}')">${_temIsSadnja(m) ? 'Sadnja · 7 vrsta' : 'Tema i stil'}</button><button onclick="_temZoom('${id}')">Na karti</button><button onclick="showTemTable('${id}')">Tabela</button>`}
        <button class="del" onclick="_temRemoveMap('${id}')" aria-label="Ukloni ${_escHtml(m.name)}">Ukloni</button>
      </div></article>`;
  }).join('');
  const empty = `<div class="tem-prazno"><div class="ico">📊</div><div class="t">Nema učitanih tematskih karata</div><div class="d">Odaberi jedan ili više .gpkg fajlova sa odjelima i odsjecima. Sačuvani fajlovi dostupni su bez interneta.</div></div>`;
  const sadnjaIntro = `<header class="tem-sadnja-intro"><small>TEMATSKA PROCJENA</small><h4>Sadnja · Unsko-sanski kanton</h4><p>Izaberi jednu vrstu za prikaz ocjena na karti. Legenda prikazuje značenje boja iz fajla.</p></header>`;
  const sadnjaEmpty = `<div class="tem-sadnja-empty"><b>${_escHtml(_TEM_SADNJA_FILE)}</b><p>${rows.some(_temIsSadnja) ? 'Fajl je sačuvan, ali još nije otvoren.' : 'Učitaj ovaj fajl da prikažeš procjenu za sedam vrsta drveta.'}</p>${rows.some(_temIsSadnja) ? '<button onclick="_temRestore()">Otvori sačuvani fajl</button>' : ''}<button onclick="document.getElementById('tem-file-input').click()">Učitaj fajl za sadnju</button></div>`;
  body.innerHTML = _temView === 'files'
    ? `${rows.length ? '<div class="tem-bulk"><button onclick="_temSetAllVisible(true)">Prikaži sve</button><button onclick="_temSetAllVisible(false)">Sakrij sve</button></div>' : ''}${listing || empty}`
    : sadnja ? `${sadnjaIntro}${sadnjaMaps.length > 1 ? `<label class="tem-picker">Fajl za sadnju<select class="tem-sel" onchange="_temOpenSadnja(this.value)">${sadnjaMaps.map(m => `<option value="${_escHtml(m.id)}"${m.id === _temSelectedId ? ' selected' : ''}>${_escHtml(m.name)}</option>`).join('')}</select></label>` : ''}${cards || sadnjaEmpty}`
    : `${_temMaps.length ? `<label class="tem-picker">Postavke fajla<select class="tem-sel" onchange="_temChoose(this.value)">${_temMaps.map(m => `<option value="${_escHtml(m.id)}"${m.id === _temSelectedId ? ' selected' : ''}>${_escHtml(m.name)}</option>`).join('')}</select></label>` : ''}${cards || empty}`;
  body.scrollTop = scroll;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });

}

const _TEM_PG_MAX = 12;
const _temPgSve = new Set();   // karte kojima je u pregledu otvorena puna lista kategorija
function _temPgSveToggle(id) { if (_temPgSve.has(id)) _temPgSve.delete(id); else _temPgSve.add(id); _temModalRender(true); }

// Pregled teme: po klasi boja, raspon/vrijednost, broj odsjeka, površina i udio (traka).
function _temPregledHtml(m) {
  const st = _temStatistika(m);
  if (!st) return '';
  let opis = _temKlaseOpis(m._cls);
  // Kategorija sa mnogo vrijednosti (gazdinska klasa ~70): najveće po površini prve, a
  // lista se skraćuje na 12 dok korisnik ne zatraži sve — inače pregled postane zid redova.
  const dugo = m._cls.cat && opis.length > _TEM_PG_MAX;
  if (dugo) opis = opis.slice().sort((a, b) => st.klase[b.i].ha - st.klase[a.i].ha);
  const sve = !dugo || _temPgSve.has(m.id);
  const maxHa = Math.max(0.0001, ...opis.map(k => st.klase[k.i].ha), st.bez.ha);
  const red = (boja, lbl, n, ha, bez) => {
    const u = st.ukupnoHa > 0 ? ha / st.ukupnoHa * 100 : 0;
    const pct = u > 0 && u < 0.5 ? '&lt;1' : Math.round(u);
    return `<div class="tem-pg-row${bez ? ' bez' : ''}">
      <i class="sw" style="${boja ? 'background:' + boja : ''}"></i>
      <span class="rng">${_escHtml(lbl)}</span>
      <span class="bar"><b style="width:${Math.round(ha / maxHa * 100)}%;${boja ? 'background:' + boja : ''}"></b></span>
      <span class="val">${n} · ${_temHa(ha)} <em>${pct}%</em></span>
    </div>`;
  };
  const skr = sve ? opis : opis.slice(0, _TEM_PG_MAX), ost = opis.slice(skr.length);
  const ostHa = ost.reduce((a, k) => a + st.klase[k.i].ha, 0);
  const rows = skr.map(k => red(k.boja, k.lbl, st.klase[k.i].n, st.klase[k.i].ha, false)).join('')
    + (ost.length ? `<button class="tem-pg-vise" onclick="_temPgSveToggle('${_jsAttr(m.id)}')">+ još ${ost.length} vrijednosti · ${_temHa(ostHa)} — prikaži sve</button>` : '')
    + (dugo && sve ? `<button class="tem-pg-vise" onclick="_temPgSveToggle('${_jsAttr(m.id)}')">prikaži samo ${_TEM_PG_MAX} najvećih</button>` : '')
    + (st.bez.n ? red(null, 'bez podatka', st.bez.n, st.bez.ha, true) : '');
  const sum = m._cls.cat
    ? (() => {
        const naj = opis.reduce((a, k) => (!a || st.klase[k.i].ha > st.klase[a.i].ha) ? k : a, null);
        return `${opis.length} ${opis.length === 1 ? 'vrijednost' : 'vrijednosti'}${naj ? ` · najviše površine: <b>${_escHtml(naj.lbl)}</b>` : ''}`;
      })()
    : `Prosjek <b>${_temBr(st.prosjek)}</b> · po površini <b>${_temBr(st.prosjekPov)}</b> · raspon ${_temBr(st.min)} – ${_temBr(st.max)}`;
  return `<div class="tem-pg">
    <div class="tem-pg-sum">${sum}</div>
    ${rows}
    <div class="tem-pg-leg">broj odsjeka · površina · udio u ukupnoj površini</div>
  </div>`;
}

function _temEdToggle(id) {
  if (_temEdOpenId === id) { _temEdOpenId = null; delete _temEdDraft[id]; _temModalRender(); return; }
  _temCaptureDraft();
  _temEdOpenId = id;
  const entry = _temById(id);
  if (entry?._cls && !_temEdDraft[id]) _temEdDraft[id] = _temDraftIz(entry._cls);
  _temModalRender();
}

// Editor klasa/boja za aktivnu temu karte: proizvoljan broj klasa (min 2, max 20),
// svaka sa svojom bojom + OD/DO. Susjedne klase dijele granicu (do klase N = od
// klase N+1) da nema rupa/preklapanja — polja "od"/"do" su dva odvojena inputa nad
// ISTOM granicom, uživo sinhronizovana (_temEdSyncEdge). Izvor istine dok je editor
// otvoren je _temEdDraft[m.id] — ➕/✕, paleta i automatske klase mutiraju ga i ponovo
// renderuju editor; sve se trajno sačuva (localStorage + IndexedDB) tek na "Zapiši".
// Kategorijska tema ima samo boju po vrijednosti (granica nema).
const _TEM_MAX_CLASSES = 20;
function _temClassEdHtml(m) {
  const d = _temEdDraft[m.id];
  if (!d) return '';
  const jid = _jsAttr(m.id);
  const naslov = `<div class="tem-ed-ti"><b>${_escHtml(_temColLabel(m, m.theme))}</b> — ${d.cat ? 'boja svake vrijednosti' : 'granice i boje klasa'}</div>`;
  const dugmad = `<div class="tem-ed-btns">
      <button class="ok" onclick="_temClassEdApply('${jid}')" title="Trajno čuva opsege i boje — ostaju i poslije odjave"><svg class="ic"><use href="#ic-sacuvaj"/></svg> Zapiši</button>
      <button onclick="_temClassEdReset('${jid}')" title="Briše ručne izmjene ove teme"><svg class="ic"><use href="#ic-osvjezi"/></svg> Vrati zadano</button>
    </div>`;
  if (d.cat) {
    const st = _temStatistika(m);
    const rows = d.vals.map((v, i) => `<div class="tem-ed-r">
      <input type="color" id="tem-ed-c-${i}" value="${d.colors[i]}">
      <span class="kat">${_escHtml(v)}</span>
      <span class="n">${st?.klase[i]?.n ?? 0} odsj.</span>
    </div>`).join('');
    return `<div class="tem-ed" data-tem-map-id="${_escHtml(m.id)}">${naslov}${rows}${dugmad}</div>`;
  }
  const colors = d.colors, edges = d.edges, n = colors.length;
  const fmtN = v => (v == null || !Number.isFinite(v)) ? '' : (+(+v).toFixed(2));
  const numIn = (val, extraAttrs) => `<input type="number" step="any" inputmode="decimal" value="${fmtN(val)}" ${extraAttrs}>`;
  const palete = Object.entries(_TEM_PALETE).map(([k, p]) =>
    `<button class="tem-pal${d.pal === k ? ' akt' : ''}" onclick="_temEdPaleta('${jid}','${k}')" title="${_escHtml(p.nm)}"
      style="background:linear-gradient(90deg,${p.c.join(',')});"></button>`).join('')
    + `<button class="tem-pal obrni" onclick="_temEdObrni('${jid}')" title="Obrni redoslijed boja">⇄</button>`;
  const nOpts = [3, 4, 5, 6, 7, 8, 9].map(k => `<option value="${k}"${k === n ? ' selected' : ''}>${k}</option>`).join('');
  const rows = colors.map((c, i) => {
    const delBtn = n > 2
      ? `<button class="x" onclick="_temEdRemoveClass('${jid}',${i})" title="Ukloni klasu"><svg class="ic"><use href="#ic-zatvori"/></svg></button>`
      : `<span class="x"></span>`;
    return `<div class="tem-ed-r">
      <input type="color" id="tem-ed-c-${i}" value="${c}">
      ${numIn(edges[i], `id="tem-ed-lo-${i}" onchange="_temEdSyncEdge(${i},this.value)"`)}
      <span class="crt">–</span>
      ${numIn(edges[i + 1], `id="tem-ed-hi-${i}" onchange="_temEdSyncEdge(${i + 1},this.value)"`)}
      ${delBtn}
    </div>`;
  }).join('');
  const addBtn = n < _TEM_MAX_CLASSES
    ? `<button class="tem-ed-add" onclick="_temEdAddClass('${jid}')"><svg class="ic"><use href="#ic-dodaj"/></svg> Dodaj klasu</button>`
    : `<div class="tem-ed-max">Maksimalno ${_TEM_MAX_CLASSES} klasa</div>`;
  return `<div class="tem-ed" data-tem-map-id="${_escHtml(m.id)}">${naslov}
    <div class="tem-ed-sek">Paleta</div>
    <div class="tem-pals">${palete}</div>
    <div class="tem-ed-sek">Automatske klase</div>
    <div class="tem-ed-auto">
      <select id="tem-ed-n" title="Broj klasa">${nOpts}</select>
      <button onclick="_temEdAuto('${jid}','kv')" title="Svaka klasa ima približno isti broj odsjeka">Kvantili</button>
      <button onclick="_temEdAuto('${jid}','ji')" title="Svaka klasa pokriva isti raspon vrijednosti">Jednaki intervali</button>
    </div>
    <div class="tem-ed-sek">Klase (od – do)</div>
    ${rows}${addBtn}${dugmad}</div>`;
}

// Granica sa indeksom `edge` (0=lo, 1..n-1=unutrašnje, n=hi) postoji u DOM-u na dva
// mjesta (kao "do" reda edge-1 i kao "od" reda edge) — kad se jedno promijeni, uskladi drugo.
function _temEdSyncEdge(edge, val) {
  const lo = document.getElementById('tem-ed-lo-' + edge);       // "od" reda `edge`
  const hi = document.getElementById('tem-ed-hi-' + (edge - 1));  // "do" reda `edge-1`
  if (lo && lo.value !== val) lo.value = val;
  if (hi && hi.value !== val) hi.value = val;
}

// Pročita trenutno stanje n redova iz DOM-a (boje + n+1 granica) — koristi ga i
// "Zapiši" i ➕/✕/paleta (da se ne izgube ručne izmjene korisnika prije mutacije).
function _temEdScrapeDom(n) {
  const colors = [];
  for (let i = 0; i < n; i++) colors.push(document.getElementById('tem-ed-c-' + i)?.value || _TEM_RAMP[i % _TEM_RAMP.length]);
  const lo0 = parseFloat(document.getElementById('tem-ed-lo-0')?.value);
  const edges = [lo0];
  for (let i = 0; i < n; i++) edges.push(parseFloat(document.getElementById('tem-ed-hi-' + i)?.value));
  return { colors, edges };
}
// Kao _temEdScrapeDom, ali polje kojeg nema u DOM-u (ili je prazno) zadržava vrijednost iz drafta.
function _temEdPovuci(d) {
  d.colors = d.colors.map((c, i) => document.getElementById('tem-ed-c-' + i)?.value || c);
  if (d.cat) return;
  const s = _temEdScrapeDom(d.colors.length);
  // polje koje korisnik ispraznio ne smije obrisati granicu iz drafta
  d.edges = s.edges.map((v, i) => Number.isFinite(v) ? v : d.edges[i]);
}

function _temEdPaleta(id, key) {
  const d = _temEdDraft[id];
  if (!d || d.cat || !_TEM_PALETE[key]) return;
  _temEdPovuci(d);
  d.pal = key;
  d.colors = _temRampFor(d.colors.length, _TEM_PALETE[key].c);
  _temModalRender();
}
function _temEdObrni(id) {
  const d = _temEdDraft[id];
  if (!d || d.cat) return;
  _temEdPovuci(d);
  d.colors.reverse();
  _temModalRender();
}

// Automatske granice iz podataka — puni draft (vidljivo odmah), trajno tek na "Zapiši".
function _temEdAuto(id, metoda) {
  const entry = _temById(id), d = _temEdDraft[id];
  if (!entry || !d || d.cat || !entry.theme) return;
  const n = Math.max(2, Math.min(_TEM_MAX_CLASSES, parseInt(document.getElementById('tem-ed-n')?.value, 10) || 5));
  const vals = entry.features.map(f => _temNum(f.attrs[entry.theme])).filter(Number.isFinite).sort((a, b) => a - b);
  if (vals.length < 2) return;
  const lo = vals[0], hi = vals[vals.length - 1];
  const breaks = metoda === 'ji' ? _temJednakiIntervali(lo, hi, n) : _temQuantiles(vals, n);
  d.edges = [lo, ...breaks, hi];
  d.colors = _temRampFor(breaks.length + 1, _TEM_PALETE[d.pal]?.c);
  if (breaks.length + 1 < n) showToast(`ℹ Podaci daju samo ${breaks.length + 1} različite klase`);
  _temModalRender();
}

function _temEdAddClass(id) {
  const d = _temEdDraft[id];
  if (!d || d.cat) return;
  if (d.colors.length >= _TEM_MAX_CLASSES) { showToast('⚠ Maksimalno ' + _TEM_MAX_CLASSES + ' klasa'); return; }
  _temEdPovuci(d);   // povuci trenutne DOM izmjene prije mutacije
  const n = d.colors.length;
  const last2 = d.edges[n - 1], lastHi = d.edges[n];
  const mid = Number.isFinite(last2) && Number.isFinite(lastHi) ? (last2 + lastHi) / 2 : lastHi;
  d.edges.splice(n, 0, mid);   // nova granica dijeli POSLJEDNJU klasu na dvije
  d.colors.push(KORISNIK_PAL[n % KORISNIK_PAL.length] || '#94a3b8');
  _temModalRender();
}

function _temEdRemoveClass(id, idx) {
  const d = _temEdDraft[id];
  if (!d || d.cat) return;
  if (d.colors.length <= 2) { showToast('⚠ Minimalno 2 klase'); return; }
  _temEdPovuci(d);
  const n = d.colors.length;
  d.colors.splice(idx, 1);
  if (idx < n - 1) d.edges.splice(idx + 1, 1); else d.edges.splice(idx, 1);
  _temModalRender();
}

function _temClassEdApply(id) {
  const entry = _temById(id);
  if (!entry || !entry.theme) return;
  const d = _temEdDraft[id];
  if (!d) return;
  entry.styles = entry.styles || {};
  if (d.cat) {
    _temEdPovuci(d);
    const catColors = {};
    d.vals.forEach((v, i) => { catColors[v] = d.colors[i]; });
    entry.styles[entry.theme] = { catColors };
    _temApplyTheme(id, entry.theme);
    _temModalRender();
    showToast('💾 Boje zapisane — ostaju sačuvane i poslije odjave');
    return;
  }
  const n = d.colors.length;
  const { colors, edges } = _temEdScrapeDom(n);
  if (edges.some(v => !Number.isFinite(v))) { showToast('⚠ Sva polja moraju biti brojevi'); return; }
  for (let i = 1; i < edges.length; i++) {
    if (edges[i] <= edges[i - 1]) { showToast('⚠ Vrijednosti moraju rasti (svaka "do" > prethodne "od")'); return; }
  }
  entry.styles[entry.theme] = { breaks: edges.slice(1, -1), colors, lo: edges[0], hi: edges[edges.length - 1], pal: d.pal || 'zc' };
  if(d.sourceRanges?.length===n && d.sourceEdges?.length===edges.length && edges.every((v,i)=>v===d.sourceEdges[i]))
    entry.styles[entry.theme].ranges=d.sourceRanges.map((r,i)=>({...r,color:colors[i]}));
  _temApplyTheme(id, entry.theme);   // ponovo boji poligone + _temRegSave() (trajno pamćenje)
  _temModalRender();
  showToast('💾 Zapisano (' + n + ' klasa) — ostaje sačuvano i poslije odjave');
}

function _temClassEdReset(id) {
  const entry = _temById(id);
  if (!entry || !entry.theme) return;
  if (entry.styles) delete entry.styles[entry.theme];
  _temApplyTheme(id, entry.theme);   // zadano: 5 kvantilnih klasa / zadane boje kategorija
  _temModalRender();
  showToast('↺ Vraćeno na zadane klase i boje');
}

