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
      button.innerHTML='<span class="mdrop-ico" aria-hidden="true">'+(theme==='day'?'☀':'☾')+'</span><span>'+(theme==='day'?'Dnevni mod — uključen':'Dnevni mod')+'</span>';
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
