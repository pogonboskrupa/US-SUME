const fs=require('fs'),assert=require('assert');
const {izvor}=require('./_izvor');
const src=izvor();
const mig=fs.readFileSync('supabase/migrations/20261118_admin_promijeni_ime.sql','utf8');
assert(/admin_promijeni_ime/.test(mig)&&/je_admin\(\)/.test(mig),'migracija samo za admina');
assert(/update public\.korisnici/i.test(mig));
assert(/async function adminUrediIme\(/.test(src));
assert(src.includes("sb.rpc('admin_promijeni_ime'"));
assert(src.includes("adminUrediIme('${uid}')"),'dugme na kartici');
// referentna karta u meniju
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('id="menu-refkarta"')&&html.includes('id="refkarta-modal"'));
assert(html.indexOf('id="menu-refkarta"')>html.indexOf('showPrintModal()'));
assert(!/<details[^>]*id="reference-card"/.test(html));
assert(/function openRefKartaPanel\(/.test(src)&&/function closeRefKartaPanel\(/.test(src));
console.log('ok');
{
  const g=izvor();
  assert(/function _rkMinimiziraj\(/.test(g)&&/_RK_POS_KEY/.test(g),'ref. karta: minimizacija i pamćenje položaja');
  assert(/onclick="openRefKartaPanel\(\)"/.test(g),'dugme Referentna karta u Studiju vlaka');
  assert(html.includes('id="rk-min-btn"'));
  console.log('ok ref plutajuci');
}
