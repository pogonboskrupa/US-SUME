// Lokalna postavka prikaza; ne pristupa projektu, GPS-u, redu ni mreži.
(function () {
  'use strict';
  const key='tvlake_field_theme_v1';
  let theme='dark';
  try { if(localStorage.getItem(key)==='day') theme='day'; } catch(e) {}
  function apply() {
    document.documentElement.dataset.fieldTheme=theme;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.content=theme==='day'?'#f8fafc':'#16213e';
    const button=document.getElementById('field-theme-toggle');
    if(button) {
      button.setAttribute('aria-pressed',String(theme==='day'));
      button.innerHTML='<span class="mdrop-ico" aria-hidden="true"><svg class="dm-menu-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="static/icons/navigation.svg#dm-sun"/></svg></span><span>'+(theme==='day'?'Dnevni mod — uključen':'Dnevni mod')+'</span>';
      button.title=theme==='day'?'Isključi Dnevni mod':'Uključi Dnevni mod';
    }
  }
  window.toggleFieldTheme=function () {
    theme=theme==='day'?'dark':'day';
    apply();
    try { localStorage.setItem(key,theme); }
    catch(e) { if(typeof showToast==='function') showToast('Prikaz promijenjen; postavka nije trajno sačuvana.'); }
  };
  apply(); // prije prvog crtanja, uključujući offline APK
  document.addEventListener('DOMContentLoaded',apply);
})();
// Koordinate mogu zauzeti dva reda. Kontrole slijede stvarnu visinu, i nakon rotacije.
document.addEventListener('DOMContentLoaded',function () {
  const badge=document.getElementById('nv-badge'),mapEl=document.getElementById('map');
  if(!badge||!mapEl)return;
  const place=()=>{if(badge.offsetHeight)mapEl.style.setProperty('--map-controls-top',(badge.offsetTop+badge.offsetHeight+8)+'px');};
  place();
  if(typeof ResizeObserver==='function')new ResizeObserver(place).observe(badge);
  else window.addEventListener?.('resize',place);
});
