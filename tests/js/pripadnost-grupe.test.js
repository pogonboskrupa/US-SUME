'use strict';
// v4.7.4: Prati me (oker) / Centriraj (tirkiz), pripadnost terenskog profila šumariji, Grupe korisnika po karticama.
const assert = require('node:assert/strict'), fs = require('fs');
const src = require('./_izvor').izvor();
const css = fs.readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
const fn = n => { const a = src.indexOf('function ' + n + '('); assert(a >= 0, n); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) break; } return src.slice(a, i + 1); };
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK ' + n); };

t('boje: Prati me oker, Centriraj tirkiz — svijetlo dok je lokacija uključena, jače kad je uključeno', () => {
  assert(/#ab-loc-popup \.abp-hb\.abp-prati \{background:#fbefcf/.test(css));
  assert(/#ab-loc-popup \.abp-hb\.abp-prati\.prati \{background:#c9961f/.test(css));
  assert(/#ab-loc-popup \.abp-hb\.abp-centar \{background:#d5f5f0/.test(css));
  assert(/#ab-loc-popup \.abp-hb\.abp-centar\.centrirano \{background:#0d9488/.test(css));
  // Pravila moraju biti POSLIJE starog zelenog .prati pravila (ista specifičnost, kasnije pobjeđuje).
  assert(css.lastIndexOf('.abp-hb.prati {background:rgba(34,197,94') < css.indexOf('.abp-hb.abp-prati.prati'));
});

t('Centriraj je "uključen" samo dok karta stoji na mojoj poziciji', () => {
  const el = { cls: new Set(), classList: { toggle(c, on) { on ? el.cls.add(c) : el.cls.delete(c); } } };
  const env = new Function('document', 'g', 'with(g){' + fn('_updCentarBtn') + ' return _updCentarBtn;}');
  const g = { gpsOn: true, lastP: { la: 1, lo: 1 }, _userPannedAway: false };
  const f = env({ getElementById: () => null, querySelector: () => el }, g);
  f(); assert(el.cls.has('centrirano'));
  g._userPannedAway = true; f(); assert(!el.cls.has('centrirano'));
  g._userPannedAway = false; g.lastP = null; f(); assert(!el.cls.has('centrirano'), 'bez fiksa nije centrirano');
  // Mock bez querySelector (stari testovi) ne smije pasti.
  env({ getElementById: () => null }, g)();
});

t('_sumKratko i oznaka korisnika po vrsti/pripadnosti', () => {
  const env = new Function('_pripZa', fn('_sumKratko') + fn('_jeTerenski') + fn('_korOznaka') + 'return {_sumKratko,_korOznaka};');
  const m = { a: 'ŠUMARIJA CAZIN', b: '' };
  const { _sumKratko, _korOznaka } = env(id => m[id]);
  assert.equal(_sumKratko('ŠUMARIJA BOS.KRUPA'), 'Bos. Krupa');
  assert.equal(_sumKratko('ŠUMARIJA SANSKI MOST'), 'Sanski Most');
  assert.deepEqual(_korOznaka({ id: 'a', sumarija: 'ŠPD US ŠUME' }), { t: true, txt: 'Terenski · Cazin', sum: 'ŠUMARIJA CAZIN' });
  assert.deepEqual(_korOznaka({ id: 'b', sumarija: 'ŠPD US ŠUME' }), { t: true, txt: 'Terenski', sum: '' });
  assert.deepEqual(_korOznaka({ id: 'c', sumarija: 'ŠUMARIJA KLJUČ' }), { t: false, txt: 'Ključ', sum: 'ŠUMARIJA KLJUČ' });
  // Pripadnost na samom objektu (admin kartica) ima prednost nad kešom.
  assert.equal(_korOznaka({ id: 'b', sumarija: 'ŠPD US ŠUME', pripadnost: 'ŠUMARIJA KLJUČ' }).txt, 'Terenski · Ključ');
});

t('Moj nalog: kartica pripadnosti samo za terenski profil, čuva preko RPC-a', () => {
  const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
  assert(/<form id="nalog-prip-kartica" class="nalog-kartica" hidden onsubmit="nalogSacuvajPripadnost\(\);return false"/.test(html));
  assert(/<select id="nalog-prip" class="nalog-in">/.test(html));
  assert(/_nalogPripadnostPripremi\(\);\s*m\.hidden = false;/.test(fn('nalogOtvori')));
  assert(/f\.hidden = !teren/.test(fn('_nalogPripadnostPripremi')));
  const s = fn('nalogSacuvajPripadnost');
  assert(/sb\.rpc\('postavi_svoju_pripadnost', \{ p_sumarija: v \}\)/.test(s) && /_profileSave\(sbProfile\)/.test(s) && /_nalogOffline\(\)/.test(s));
  // Opcije: bez same ŠPD, uz "nije odabrano".
  const opc = new Function('_SUMARIJE', '_escHtml', fn('_pripSumarije') + fn('_pripadnostOpcije') + 'return _pripadnostOpcije;')(['ŠPD US ŠUME', 'ŠUMARIJA CAZIN'], x => x)('ŠUMARIJA CAZIN');
  assert(!/ŠPD/.test(opc) && /value="" *>— nije odabrano —/.test(opc.replace('<option value="">', '<option value="" >')) && /value="ŠUMARIJA CAZIN" selected/.test(opc));
});

t('Admin: lista pripadnosti, izbor u kartici korisnika i u Grupama (kartica Terenski)', () => {
  assert(/sb\.rpc\('admin_pripadnost_lista'\)/.test(fn('_pripUcitaj')));
  assert(/sb\.rpc\('admin_set_pripadnost', \{ p_user: uid, p_sumarija: v \}\)/.test(fn('adminSetPripadnost')));
  assert(/pripadnost: _jeTerenski\(u\)/.test(fn('adminLoadUsers')));
  const k = fn('_admKarticaHtml');
  assert(/_jeTerenski\(u\) \? `<label class="adm-prip-izbor">/.test(k) && /_admPripIzbor\('\$\{uid\}'/.test(k));
  const p = fn('_grupePanelRender');
  assert(/tab\('g'/.test(p) && /tab\('z'/.test(p) && /tab\('t'/.test(p), 'tri kartice');
  assert(/Bez pripadnosti/.test(p) && /_grpPripIzbor\(/.test(p), 'terenski po šumarijama, izbor pripadnosti');
  assert(/id="grp-trazi"/.test(p), 'pretraga');
  // Uređivač grupe: šumarija filtrira i terenske po pripadnosti, filter vrste.
  const u = fn('_grupaUredi');
  assert(/o\.sum !== s/.test(u) && /data-v="t"/.test(u) && /data-v="p"/.test(u) && /value="-">Terenski bez pripadnosti/.test(u));
});

t('migracija: zasebna kolona, terenski bira sebi, admin svima, validacija naziva', () => {
  const m = fs.readFileSync(__dirname + '/../../supabase/migrations/20261123_pripadnost_sumarija.sql', 'utf8');
  assert(/ADD COLUMN IF NOT EXISTS pripadnost text/.test(m));
  assert(/k\.sumarija='ŠPD US ŠUME'\) THEN\s*RAISE EXCEPTION 'Pripadnost šumariji bira samo terenski profil'/.test(m));
  assert(/p <> 'ŠPD US ŠUME' AND EXISTS\(SELECT 1 FROM public\.sumarije s WHERE s\.naziv=p AND s\.aktivna\)/.test(m));
  assert(/GRANT EXECUTE ON FUNCTION public\.postavi_svoju_pripadnost\(text\) TO authenticated/.test(m));
  assert(!/admin_get_all_users/.test(m.replace(/--.*$/gm, '')), 'stari RPC se ne mijenja');
});
console.log(ok + ' prošlo, 0 palo');
