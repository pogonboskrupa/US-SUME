'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const f=src.slice(src.indexOf('async function _localKmlRestore'),src.indexOf('function _ozKmlToggleEdit'));
assert(/DendroRender\?\.state\?\.lite/.test(f),'čita da li je uređaj u laganom prikazu');
assert(/\(spor \|\| !_localKmlRestore\._odgodio\)/.test(f),'na sporom uređaju se odgađa svaki veliki sloj, ne samo prvi');
assert(/requestIdleCallback/.test(f)&&/spor \? \(data\.vis === false \? 15000 : 5000\)/.test(f),'duže čekanje + mirovanje niti');
assert(/else|:\s*\(data\.vis === false \? 8000 : 2000\)/.test(f),'na brzom uređaju ostaje staro ponašanje');
console.log('OK spori uređaj: veliki lokalni slojevi se učitavaju naknadno');
