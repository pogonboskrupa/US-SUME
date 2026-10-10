// =====================================================================
// OFFLINE DATA LAYER (_OL) — izdvojeno iz index.html (v3.29.0)
// ---------------------------------------------------------------------
// Prvi modul izdvojen iz monolita (vidi docs/MODULARIZACIJA.md).
// Učitava se <script src>-om na ISTOJ poziciji gdje je kod ranije bio
// inline — redoslijed izvršavanja je identičan, top-level const/let su
// globalno vidljivi narednim skriptama.
//
// Zavisnosti iz ostatka aplikacije (postoje u browseru u trenutku POZIVA,
// ne parsiranja): showToast, _updSyncBadge (typeof-guard), sbUser
// (typeof-guard), localStorage. U Node testovima se stubuju
// (tests/js/offline-layer.test.js).
// =====================================================================

// crypto.randomUUID() je dodan u Chromium 92 (2021) — starije/neažurirane
// Android WebView komponente ga nemaju, pa nezaštićen poziv baca TypeError.
// Koristi se za privremene klijentske ID-jeve (optimistički UI, kasnije
// zamijenjeni pravim server ID-jem) — ne treba kriptografska jačina.
function _genUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const _DOZ_TRACK_BUF_KEY = 'tvlake_doz_track_buf';
const _OL = {
  VLAKE:    'tvlake_ol_vlake',
  PROJEKTI: 'tvlake_ol_projekti',
  LOG:      'tvlake_ol_log',
  LABELS:   'tvlake_ol_labels',
  PROFILE:  'tvlake_ol_profile',
  KOLEGE:   'tvlake_ol_kolegeMap',
  ODJELI:   'tvlake_ol_odjeli',
  DOZ_ODJELI:   'tvlake_ol_doz_odjeli',
  DOZ_MEMBERS:  'tvlake_ol_doz_members',
  DOZ_MARKINGS: 'tvlake_ol_doz_markings',
  DOZ_TRACKS:   'tvlake_ol_doz_tracks',
  DOZ_SEL_ID:   'tvlake_ol_doz_selid',
  QUEUE:    'tvlake_ol_queue',
  _seq: 0,   // D2-B: brojač za jedinstveni ključ reda (sprječava ts-koliziju u istoj ms)

  save(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); return true; }
    catch(e) { showToast('⚠ Lokalni upis nije uspio — sačuvaj izvoz prije zatvaranja'); return false; }
  },

  load(key) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v?.data ?? null; }
    catch { return null; }
  },

  enqueue(op) {
    try {
      const q = this.loadQueue(true);
      // Deduplicate upsert_vlaka by nm — čuvaj samo zadnju verziju.
      // VAŽNO: uključi projekt_id i id — isto ime (T1) može legitimno postojati u
      // više projekata, pa dedup samo po nm+korisnik briše tuđu pending izmjenu.
      if (op.type === 'upsert_vlaka') {
        const idx = q.findIndex(o => o.type === 'upsert_vlaka' &&
          o.payload.nm === op.payload.nm &&
          o.payload.korisnik_id === op.payload.korisnik_id &&
          (o.payload.projekt_id ?? null) === (op.payload.projekt_id ?? null) &&
          (o.payload.id ?? null) === (op.payload.id ?? null));
        if (idx >= 0) q.splice(idx, 1);
      }
      // Deduplicate upsert_log by datum
      if (op.type === 'upsert_log') {
        const idx = q.findIndex(o => o.type === 'upsert_log' &&
          o.payload.datum === op.payload.datum &&
          o.payload.korisnik_id === op.payload.korisnik_id);
        if (idx >= 0) q.splice(idx, 1);
      }
      // Deduplicate upsert_trag — čuvaj samo zadnju verziju po (nm, korisnik, id,
      // client_uuid). v1.9.3: client_uuid je obavezan dio ključa — ime traga je
      // samo DATUM, pa su dva traga istog dana (oba neposlana) imala isti ključ i
      // drugi je tiho izbacivao prvog iz reda.
      if (op.type === 'upsert_trag') {
        const idx = q.findIndex(o => o.type === 'upsert_trag' &&
          o.payload.nm === op.payload.nm &&
          o.payload.korisnik_id === op.payload.korisnik_id &&
          (o.payload.id ?? null) === (op.payload.id ?? null) &&
          (o.payload.client_uuid ?? null) === (op.payload.client_uuid ?? null));
        if (idx >= 0) q.splice(idx, 1);
      }
      // Deduplicate upsert_labels — uvijek samo zadnji set oznaka za korisnika.
      // Prazan set (sve oznake obrisane) nema korisnika u payload-u, pa ga nosi
      // op.korisnik_id — inače bi stariji, pun set ostao u redu i poslije
      // brisanja vratio oznake na server (v1.9.4).
      if (op.type === 'upsert_labels') {
        const kid = o => o.payload?.[0]?.korisnik_id || o.korisnik_id || null;
        const idx = q.findIndex(o => o.type === 'upsert_labels' && kid(o) && kid(o) === kid(op));
        if (idx >= 0) q.splice(idx, 1);
      }
      // Deduplicate upsert_odjel — isti naziv u istoj šumariji je isti upis.
      if (op.type === 'upsert_odjel') {
        const idx = q.findIndex(o => o.type === 'upsert_odjel' &&
          o.payload?.sumarija === op.payload?.sumarija && o.payload?.naziv === op.payload?.naziv);
        if (idx >= 0) q.splice(idx, 1);
      }
      // D2-B: jedinstveni ključ (_qid) — ts sam zna kolidirati za 2 op. u istoj ms,
      // pa bi removeFromQueue obrisao OBJE (tihi gubitak operacije).
      const qid = Date.now() + '-' + (this._seq = (this._seq + 1) % 1e9);
      // OS-K1: taguj operaciju vlasnikom — red preživljava promjenu korisnika na
      // uređaju, pa procesor MORA znati čije su op-e (tuđe preskače, wipe ih čisti).
      const uid = (typeof sbUser !== 'undefined' && sbUser?.id) || null;
      // OS-S2: klijentski ID za insert tipove bez prirodnog ključa — retry poslije
      // izgubljenog odgovora postaje idempotentan uz potvrdu sadržaja (23505
      // sam nije dokaz uspjeha). NE za
      // upsert_trag: procesor po payload.id bira update-vs-insert granu (trag
      // idempotentnost se rješava pre-lookupom po korisnik+nm u procesoru).
      if (['insert_doz_marking', 'insert_projekt', 'insert_doz_project'].includes(op.type) && op.payload && !op.payload.id) {
        op.payload.id = _genUUID();
      }
      q.push({ ...op, ts: Date.now(), _qid: qid, _uid: uid });
      if (q.length === 501) showToast('⚠ Više od 500 izmjena čeka slanje — sve su zadržane');
      localStorage.setItem(this.QUEUE, JSON.stringify(q));
      if (typeof _updSyncBadge === 'function') _updSyncBadge(q);   // red je već u ruci — ne parsiraj ga opet
      return qid;
    } catch(e) { showToast('⚠ Offline operacija nije sačuvana — provjeri memoriju i izvezi podatke'); return false; }
  },

  loadQueue(strict = false) {
    try {
      const q = JSON.parse(localStorage.getItem(this.QUEUE) || '[]');
      if (!Array.isArray(q)) throw new Error('Oštećen offline red');
      return q;
    } catch(e) {
      // Nikad ne prepisuj oštećen original praznim redom.
      if (strict) throw e;
      return [];
    }
  },

  removeFromQueue(key) {
    try {
      const k = String(key);
      const q = this.loadQueue(true).filter(o => String(o._qid ?? o.ts) !== k);
      localStorage.setItem(this.QUEUE, JSON.stringify(q));
    } catch(e) {}
  },

  // Povećaj brojač pokušaja za operaciju koja je pala ne-mrežnom greškom.
  // Vraća true kad operacija traži ručni retry. Podaci se NIKAD ne odbacuju.
  // errInfo (opciono) { code, message } se pamti na op._lastErr — bez ovoga
  // korisnik na terenu mora moći vidjeti ZAŠTO nešto ne sinkronizira u
  // "Pending sync operacije" panelu, bez gubitka same operacije.
  // v1.9.2: svaki pokušaj nosi i RAZMAK do sljedećeg (_retryAt, 30 s pa
  // udvostručeno, najviše 15 min). Prolaz reda se okida na svaku GPS tačku
  // doznake, pa bi bez razmaka svih 5 pokušaja izgorjelo za 5 sekundi — kratka
  // smetnja servera bi operaciju gurnula u "ručni pokušaj".
  bumpRetry(key, maxRetries, errInfo) {
    try {
      const k = String(key);
      const q = this.loadQueue(true);
      const op = q.find(o => String(o._qid ?? o.ts) === k);   // D2-B: po _qid
      if (!op) return false;
      op._retries = (op._retries || 0) + 1;
      op._retryAt = Date.now() + this.razmakMs(op._retries);
      if (errInfo) op._lastErr = errInfo;
      if (op._retries >= (maxRetries || 5)) {
        op._blocked = true;
        localStorage.setItem(this.QUEUE, JSON.stringify(q));
        return true;
      }
      localStorage.setItem(this.QUEUE, JSON.stringify(q));
      return false;
    } catch(e) { return false; }
  },

  razmakMs(n) { return Math.min(15 * 60000, 30000 * Math.pow(2, Math.max(0, n - 1))); },

  // Prolazna greška servera (baza se restartuje, preopterećena, istekao rok
  // upita): operacija je ispravna i proći će kad se server oporavi — odgodi je
  // uz isti razmak, ali NE troši njene pokušaje (nikad ne ide u "ručni pokušaj").
  odgodi(key, errInfo) {
    try {
      const k = String(key);
      const q = this.loadQueue(true);
      const op = q.find(o => String(o._qid ?? o.ts) === k);
      if (!op) return;
      op._odgode = Math.min(6, (op._odgode || 0) + 1);
      op._retryAt = Date.now() + this.razmakMs(op._odgode);
      if (errInfo) op._lastErr = errInfo;
      localStorage.setItem(this.QUEUE, JSON.stringify(q));
    } catch(e) {}
  }
};

// Node (testovi) — u browseru je `module` undefined pa se preskače.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { _OL, _genUUID, _DOZ_TRACK_BUF_KEY };
}
