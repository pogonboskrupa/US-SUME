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
  root.DendroRender = { state, detect, pressure, onPressure, snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = { detect };
})(typeof window !== 'undefined' ? window : globalThis);
