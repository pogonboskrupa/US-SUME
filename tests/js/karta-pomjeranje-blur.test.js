// v4.3.0: kontrole preko karte nemaju backdrop-filter (ponovno zamućenje u svakom frame-u pri pomjeranju).
const fs=require('fs'),assert=require('assert');
const css=fs.readFileSync('static/css/field-design.css','utf8');
const m=css.match(/html :is\(([^)]*)\)\{-webkit-backdrop-filter:none!important;backdrop-filter:none!important\}/);
assert(m,'pravilo bez zamućenja postoji');
for(const id of ['#nv-badge','#action-bar','#map-zoom-btns','#layer-switch-btn','#dem-legend'])assert(m[1].includes(id),id);
console.log('ok');
