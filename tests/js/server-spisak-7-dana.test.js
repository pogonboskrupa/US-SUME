// v4.4.1: spisak poslanih/primljenih u sekciji Server pamti samo zadnjih 7 dana (podaci na uređaju ostaju).
const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync('static/js/server-panel.js','utf8');
assert(/TRANSFER_DANA_MS = 7 \* 86400000/.test(s));
const svjez=new Function('TRANSFER_DANA_MS','return '+s.match(/const svjez = (r => [^;]+);/)[1])(7*86400000);
const d=Date.now();
assert(svjez({ts:d-86400000})&&!svjez({ts:d-8*86400000})&&!svjez({ts:0})&&!svjez({}),'filtar 7 dana');
const t=s.slice(s.indexOf('function transfers('),s.indexOf('function saveTransfers('));
assert(/rows\.filter\(svjez\)/.test(t)&&/localStorage\.setItem/.test(t),'stari zapisi se brišu iz spiska');
assert(!/removeItem|_OL\.|vlake\s*=/.test(t),'briše se samo spisak, ne podaci');
assert(/\.filter\(svjez\)\.sort/.test(s),'upis ne vraća stare zapise');
console.log('ok spisak 7 dana');
