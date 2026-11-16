'use strict';
// v4.6.9: Explorer — glatko klizanje kamere i prekidač Reljef (postojeći sloj sjenčenja terena).
const assert = require('node:assert/strict'), fs = require('fs');
const { izvor } = require('./_izvor');
const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const css = fs.readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
const ex = fs.readFileSync(__dirname + '/../../static/js/explorer-navigation.js', 'utf8');
const src = izvor();
assert(/\.ex-world\.ex-glide[^{]*\.leaflet-map-pane\s*\{transition:transform var\(--ex-dur/.test(css), 'CSS tranzicija na omotaču i Leaflet panelu');
assert(/dispAngle\+=\(\(angle-prevAngle\+540\)%360\)-180/.test(ex), 'neprekinut ugao za tranziciju (bez skoka 359→1)');
assert(/dm<80/.test(ex) && /sameView/.test(ex), 'veliki skok, zum i resize ostaju trenutni');
assert(/resize\(\)\{if\(!world\)return;world\.classList\.remove\('ex-glide'\)/.test(ex), 'resize bez klizanja');
assert(!/setInterval\([^)]*glide/i.test(ex) && !/requestAnimationFrame\([^)]*glide/i.test(ex), 'nema JS petlje po frejmu za klizanje');
assert(/id="ex-relief"[^>]*onclick="_exReljef\(\)"/.test(html) && html.indexOf('id="ex-relief"') < html.indexOf('id="explorer-you"'), 'dugme Reljef u gornjoj traci Explorera (ne širi donji panel)');
assert(/function _exReljef\(\)\s*\{\s*_instToggle\('elev', !_ovlState\.elev\)/.test(src), 'Reljef koristi postojeći sloj elev');
assert(/isRelief: \(\) => !!_ovlState\.elev/.test(src), 'stanje dugmeta prati sloj');
assert(/_ovlState = \{ elev: false/.test(src), 'sjenčenje je zadano isključeno (bez troška)');
console.log('OK explorer glide + reljef');
