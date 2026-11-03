/* Stabilan prikaz na uređajima sa manje RAM-a i sporijim WebView/GPU-om. */
(function (root) {
  'use strict';

  function finite(value) {
    value = Number(value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function nativeStatus() {
    try {
      if (root.AndroidDevice && typeof root.AndroidDevice.status === 'function') {
        return JSON.parse(root.AndroidDevice.status()) || {};
      }
    } catch (e) {}
    return {};
  }

  function detect(nav, native) {
    nav = nav || {};
    native = native || {};
    const memoryGb = finite(native.memoryGb) || finite(nav.deviceMemory);
    const cores = finite(nav.hardwareConcurrency);
    const lowRam = native.lowRam === true;
    // deviceMemory je namjerno zaokružen browser signal. Ne nagađamo "slab"
    // uređaj kad nijedan podatak nije dostupan; Android APK daje stvarni total RAM.
    const lite = lowRam || (memoryGb > 0 && memoryGb <= 4) || (cores > 0 && cores <= 4);
    return {
      mode: lite ? 'lite' : 'full',
      lite,
      memoryGb,
      cores,
      tileBuffer: lite ? 2 : 4,
      overlayBuffer: lite ? 1 : 2,
      sqlCache: lite ? 72 : 160,
      mainTileConcurrency: lite ? 4 : 8,
      workerTileConcurrency: lite ? 3 : 5,
      animations: !lite,
      pressureCount: 0,
      lastPressure: 0
    };
  }

  const state = detect(root.navigator, nativeStatus());
  const listeners = new Set();
  const MODE_KEY = 'tvlake_render_mode';      // 'auto' (zadano) | 'lite' | 'full' — izbor korisnika
  const SLOW_KEY = 'tvlake_render_slow_v1';   // {ts}: auto-detekcija je izmjerila trzanje na ovom uređaju
  const SLOW_TTL = 30 * 24 * 3600 * 1000;
  function ls(get, k, v) {
    try { if (get) return root.localStorage.getItem(k); if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function liteProfile() {
    state.lite = true; state.mode = 'lite';
    state.tileBuffer = Math.min(state.tileBuffer, 2);
    state.overlayBuffer = 1;
    state.sqlCache = Math.min(state.sqlCache, 72);
    state.mainTileConcurrency = Math.min(state.mainTileConcurrency, 4);
    state.workerTileConcurrency = Math.min(state.workerTileConcurrency, 3);
    state.animations = false;
  }
  function fullProfile() {
    const f = detect({ deviceMemory: 8, hardwareConcurrency: 8 }, {});
    state.lite = false; state.mode = 'full';
    state.tileBuffer = f.tileBuffer; state.overlayBuffer = f.overlayBuffer; state.sqlCache = f.sqlCache;
    state.mainTileConcurrency = f.mainTileConcurrency; state.workerTileConcurrency = f.workerTileConcurrency;
    state.animations = true;
  }
  // Izbor korisnika pobjeđuje; inače svježa auto-detekcija trzanja; inače RAM/jezgre.
  (function applyStored() {
    const m = ls(true, MODE_KEY);
    if (m === 'lite') { liteProfile(); state.userMode = 'lite'; return; }
    if (m === 'full') { fullProfile(); state.userMode = 'full'; return; }
    state.userMode = 'auto';
    try {
      const sl = JSON.parse(ls(true, SLOW_KEY) || 'null');
      if (sl && Date.now() - sl.ts < SLOW_TTL && !state.lite) { liteProfile(); state.slowDetected = true; }
    } catch (e) {}
  })();
  function mark() {
    try {
      document.documentElement.dataset.renderProfile = state.mode;
      document.documentElement.classList.toggle('render-lite', state.lite);
    } catch (e) {}
  }
  function pressure(level) {
    state.pressureCount++;
    state.lastPressure = Date.now();
    state.lite = true;
    state.mode = 'lite';
    state.tileBuffer = Math.min(state.tileBuffer, 1);
    state.overlayBuffer = 1;
    state.sqlCache = Math.min(state.sqlCache, 48);
    state.mainTileConcurrency = Math.min(state.mainTileConcurrency, 3);
    state.workerTileConcurrency = Math.min(state.workerTileConcurrency, 2);
    state.animations = false;
    mark();
    for (const fn of [...listeners]) {
      try { fn(Number(level) || 0); } catch (e) { console.warn('Render memory cleanup:', e); }
    }
  }
  // Ručni izbor prikaza (Slojevi karte): 'auto' | 'lite' | 'full'. Odmah se primjenjuje.
  function setMode(mode) {
    if (mode !== 'lite' && mode !== 'full') mode = 'auto';
    ls(false, MODE_KEY, mode === 'auto' ? null : mode);
    if (mode === 'auto') ls(false, SLOW_KEY, null);
    state.userMode = mode;
    if (mode === 'lite') liteProfile();
    else if (mode === 'full') fullProfile();
    else { const d = detect(root.navigator, nativeStatus()); if (d.lite) liteProfile(); else fullProfile(); state.slowDetected = false; }
    mark();
    for (const fn of [...listeners]) { try { fn(0); } catch (e) {} }
  }
  // Auto-detekcija: uređaj STVARNO trza pri pomicanju/skrolu → lagani prikaz (bez
  // blur pozadina, animacija i sa manjim tile budžetom), zapamćen 30 dana.
  function slow(reason) {
    if (state.userMode !== 'auto' || state.lite) return;
    liteProfile(); state.slowDetected = true; state.slowReason = reason || '';
    ls(false, SLOW_KEY, JSON.stringify({ ts: Date.now() }));
    mark();
  }
  // Mjerenje trzanja: samo dok prst pomjera kartu ili skrola, ne kad app miruje.
  function frameMonitor() {
    if (!root.requestAnimationFrame || !root.document || typeof root.document.addEventListener !== 'function') return;
    let active = false, last = 0, frames = [], quietTimer = null, bad = 0, good = 0;
    function tick(t) {
      if (!active) return;
      if (last) frames.push(t - last);
      last = t; root.requestAnimationFrame(tick);
    }
    function finish() {
      active = false; last = 0; const f = frames; frames = [];
      if (f.length < 25 || state.lite || state.userMode !== 'auto') return;
      const sorted = f.slice().sort((a, b) => a - b), p50 = sorted[sorted.length >> 1];
      const teski = f.filter(x => x > 50).length / f.length;
      if (p50 > 32 || teski > 0.3) bad++; else good++;
      if (bad >= 3 && bad > good) slow('p50=' + Math.round(p50) + 'ms');
    }
    function touch() {
      if (!active && !state.lite) { active = true; last = 0; frames = []; root.requestAnimationFrame(tick); }
      clearTimeout(quietTimer); quietTimer = setTimeout(finish, 350);
    }
    ['touchmove', 'scroll'].forEach(e => root.document.addEventListener(e, touch, { passive: true, capture: true }));
  }
  function onPressure(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }
  function snapshot() { return Object.assign({}, state); }

  mark();
  root.addEventListener && root.addEventListener('dendro-memory-pressure', function (event) {
    pressure(event && event.detail && event.detail.level);
  });
  frameMonitor();
  root.DendroRender = { state, detect, pressure, onPressure, snapshot, setMode, slow };
  if (typeof module !== 'undefined' && module.exports) module.exports = { detect };
})(typeof window !== 'undefined' ? window : globalThis);
