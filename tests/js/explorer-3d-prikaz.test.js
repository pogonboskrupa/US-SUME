'use strict';
// v4.2.3: "Explorer mode - 3D prikaz" — preimenovanje i 3D prikaz bez odredišta.
const assert = require('node:assert/strict'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const tw = fs.readFileSync(__dirname + '/../../static/js/terrain-workspace.js', 'utf8');
const ex = fs.readFileSync(__dirname + '/../../static/js/explorer-navigation.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
assert(/id="menu-explorer-mod"[\s\S]{0,700}<span>Explorer mode - 3D prikaz<\/span>/.test(html), 'meni: Explorer mode - 3D prikaz bez opisa');
assert(/<h3>Explorer mode - 3D prikaz<\/h3>/.test(html), 'Teren kartica preimenovana');
assert(!/>Explorer mod</.test(html), 'nema starog naziva u prikazu');
// Meni nudi: 3D prikaz bez odredišta, navigaciju do odredišta i isključivanje
assert(/3D prikaz — prati me/.test(tw) && /Navigacija do odredišta/.test(tw) && /Isključi 3D prikaz/.test(tw), 'izbor u meniju');
assert(/function explorerSlobodno\(\)/.test(tw) && /free:true/.test(tw) && /explorerSlobodno,render/.test(tw), 'slobodan 3D prikaz');
assert(/_dlgActions\('Explorer mode - 3D prikaz/.test(tw), 'dijalog nosi naziv');
// Explorer: bez odredišta nema cilja, udaljenosti ni dolaska
assert(/free=!!target\.free/.test(ex) && /arrived=!free&&/.test(ex) && /dist=valid&&!free\?/.test(ex), 'bez odredišta nema udaljenosti');
assert(/if\(!t\.free\)goal=/.test(ex), 'bez markera cilja');
assert(/classList\.toggle\('explorer-free',!!t\.free\)/.test(ex) && /'explorer-free'\);chrome=null/.test(ex), 'klasa se postavlja i čisti');
assert(/body\.explorer-free :is\(\.ex-target,\.ex-guidance,#ex-overview/.test(css), 'cilj i Pregled skriveni u 3D prikazu');
console.log('OK explorer 3D prikaz');
