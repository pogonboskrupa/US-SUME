const { izvor } = require('./_izvor');
const s = izvor();
const pick = n => { const a = s.indexOf('function ' + n); const b = s.indexOf('\n}\n', a) + 3; return s.slice(a, b); };
const names = ['_msrHaTxt','_msrPolaLinije','_msrUzorci','_msrProfilStat'];
const code = names.map(pick).join('\n') + `
function _msrHaversine(a,b,c,d){const R=6371000,t=Math.PI/180,x=(c-a)*t,y=(d-b)*t,q=Math.sin(x/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function _msrPts2Len(p){let l=0;for(let i=0;i<p.length-1;i++)l+=_msrHaversine(p[i].lat,p[i].lng,p[i+1].lat,p[i+1].lng);return l;}
return {_msrHaTxt,_msrPolaLinije,_msrUzorci,_msrProfilStat,_msrPts2Len};`;
const f = new Function(code)();
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
ok(f._msrHaTxt(87800) === '8.78 ha', 'ha 2 decimale');
ok(f._msrHaTxt(420) === '0.0420 ha', 'mala površina i dalje u ha: ' + f._msrHaTxt(420));
ok(/ ha$/.test(f._msrHaTxt(5000000)), 'velika površina ostaje u ha, ne km²');
const pts = [{lat:44,lng:16},{lat:44,lng:16.001},{lat:44,lng:16.01}];
const pola = f._msrPolaLinije(pts); ok(pola.i === 1 && pola.lng > 16.004 && pola.lng < 16.006, 'pola dužine na drugom segmentu');
const S = f._msrUzorci(pts); ok(S.length >= 6 && S[0].d === 0 && Math.abs(S[S.length-1].d - f._msrPts2Len(pts)) < 1, 'uzorci od početka do kraja');
const st = f._msrProfilStat({ S: [{d:0},{d:10},{d:20}], alts: [100,102,110] }); ok(st.max > 0 && st.min === 100 && st.maxAlt === 110, 'statistika profila');
ok(/_msrProfilOsvjezi\(\);/.test(pick('_msrUpdPanel')), 'panel osvježava profil');
ok(/Profil terena/.test(pick('_msrPopupHtml')), 'popup ima profil za dist/nagib');
console.log('ok');
