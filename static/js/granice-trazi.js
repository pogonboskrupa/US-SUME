// Granice odjela — pronađi odjel po broju/nazivu u UČITANIM granicama.
// Radi potpuno offline: pretražuje poligone koji su već na telefonu (kmlLs),
// ne pita server. Poligoni nose broj odjela u nazivu ili u atributima
// (ExtendedData / tabela u opisu), pa se pretražuje oboje kroz _layerInfo.
'use strict';
(function (root) {
  const MAX = 12;
  let highlight = null, lastQuery = '';
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function leaves(k) {
    const out = [];
    const walk = g => g?.eachLayer?.(l => { if (l._kmlIsPolygon) out.push(l); else if (l.eachLayer) walk(l); });
    walk(k?.grp);
    return out;
  }
  // Atributi poligona kao [[ključ, vrijednost]] — prazno ako info nije dostupan.
  function attrs(l) {
    try { return typeof _layerInfo === 'function' ? _layerInfo(l).attrs : Object.entries(l._kmlExtData || {}); }
    catch (e) { return []; }
  }
  // Poligoni iz slojeva granica imaju prednost; ostali uvezeni poligoni se i
  // dalje pretražuju (vlastiti KML odjela nema GitHub ulogu).
  function candidates() {
    if (typeof kmlLs === 'undefined') return [];
    const isB = k => !!root.GithubLayers?.isBoundary?.(k) || /granic|odjel|boundary/i.test(String(k._origName || k.name || ''));
    return kmlLs.flatMap((k, i) => k?.grp ? leaves(k).map(l => ({ k, i, l, b: isB(k) })) : []);
  }
  // Rang: tačno poklapanje vrijednosti (npr. odjel "105") > početak > sadržano.
  // Broj se poredi i bez decimala ("105.000000" iz SHP-a je 105).
  function score(c, q) {
    const name = norm(c.l._kmlName), vals = attrs(c.l).map(([, v]) => norm(v).replace(/^(\d+)\.0+$/, '$1'));
    const all = [name, ...vals];
    if (all.includes(q)) return 3;
    if (all.some(v => v.startsWith(q))) return 2;
    const tokens = q.split(/\s+/).filter(Boolean), text = all.join(' ');
    return tokens.every(t => text.includes(t)) ? 1 : 0;
  }
  function search(query) {
    const q = norm(query);
    if (!q) return [];
    return candidates().map(c => ({ ...c, s: score(c, q) })).filter(c => c.s > 0)
      .sort((a, b) => b.s - a.s || (b.b - a.b) || String(a.l._kmlName || '').localeCompare(String(b.l._kmlName || ''), 'bs', { numeric: true }));
  }
  function ha(l) {
    try { return typeof turf !== 'undefined' ? turf.area(l.toGeoJSON()) / 10000 : NaN; } catch (e) { return NaN; }
  }
  function label(c) {
    const a = attrs(c.l), pick = re => (a.find(([k]) => re.test(k)) || [])[1];
    const gj = pick(/^(gj|gospodarsk|gazdinsk.*jedin|g\.?j\.?)$/i), od = pick(/^odjel/i), os = pick(/^odsjek/i);
    const parts = [gj, od ? 'odjel ' + String(od).replace(/\.0+$/, '') + (os || '') : ''].filter(Boolean);
    return parts.join(' · ');
  }
  function render() {
    const el = document.getElementById('granice-trazi-rez');
    if (!el) return;
    const input = document.getElementById('granice-trazi');
    const q = input ? input.value : lastQuery;
    lastQuery = q;
    if (!norm(q)) { el.innerHTML = ''; return; }
    const all = search(q), esc = typeof _escHtml === 'function' ? _escHtml : String;
    if (!candidates().length) { el.innerHTML = '<p class="gt-empty">Nema učitanih granica. Preuzmi granice ispod ili dodaj vlastiti KML.</p>'; return; }
    if (!all.length) { el.innerHTML = '<p class="gt-empty">Nema odjela za „' + esc(q) + '“.</p>'; return; }
    el.innerHTML = all.slice(0, MAX).map((c, n) => {
      const h = ha(c.l), sub = [label(c), Number.isFinite(h) ? h.toFixed(h < 10 ? 2 : 1).replace('.', ',') + ' ha' : '', c.k.name].filter(Boolean);
      return '<button type="button" class="gt-row" data-n="' + n + '" onclick="GraniceTrazi.open(' + n + ')"><b>' + esc(c.l._kmlName || 'Poligon bez naziva') + '</b><small>' + esc(sub.join(' · ')) + '</small><span aria-hidden="true">›</span></button>';
    }).join('') + (all.length > MAX ? '<p class="gt-empty">Još ' + (all.length - MAX) + ' — suzi pretragu.</p>' : '');
    render._last = all;
  }
  // Slušalac zatvaranja popupa se veže za JEDAN rezultat i skida se u clear():
  // otvaranje drugog rezultata zatvara prethodni popup, pa bi stari slušalac
  // (map.once) odmah obrisao žuti obrub NOVOG rezultata.
  let onClose = null;
  function clear() {
    if (onClose) { try { map.off('popupclose', onClose); } catch (e) {} onClose = null; }
    if (highlight) { try { map.removeLayer(highlight); } catch (e) {} highlight = null; }
  }
  // Odjel se istakne žutim obrubom i kad je sam sloj sakriven ili u režimu
  // "Samo za poligon" — inače bi klik na rezultat pomjerio kartu na prazno.
  function open(n) {
    const c = (render._last || [])[n];
    if (!c || typeof map === 'undefined') return;
    clear();
    try {
      highlight = L.geoJSON(c.l.toGeoJSON(), { interactive: false, style: { color: '#facc15', weight: 4, opacity: 1, fill: true, fillColor: '#facc15', fillOpacity: 0.12, dashArray: '' } }).addTo(map);
    } catch (e) { highlight = null; }
    if (typeof closeLayerSheet === 'function') closeLayerSheet();
    if (typeof switchTab === 'function' && typeof _activeTab !== 'undefined' && _activeTab !== 'karta') switchTab('karta');
    const b = c.l.getBounds?.();
    if (b && b.isValid()) {
      map.fitBounds(b, { padding: [40, 40], maxZoom: 17, animate: false });
      if (typeof _kmlOpenPopup === 'function') _kmlOpenPopup(c.l, b.getCenter());
    }
    const mine = highlight;
    onClose = () => setTimeout(() => { if (highlight === mine) clear(); }, 0);
    map.on('popupclose', onClose);
  }
  root.GraniceTrazi = { search, render, open, clear, score, label };
})(typeof window !== 'undefined' ? window : globalThis);
