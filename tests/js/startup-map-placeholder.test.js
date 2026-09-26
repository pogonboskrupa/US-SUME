const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('(function _restoreLastMap()');
const end = html.indexOf('})();', start);
assert.ok(start >= 0 && end > start, '_restoreLastMap mora postojati');
const restore = html.slice(start, end + 5);
const sqlite = restore.match(/if \(saved\?\.type === 'sqlite'\) \{([\s\S]*?)\n    \}/);
assert.ok(sqlite, 'mora postojati SQLite startup grana');
assert.ok(sqlite[1].includes('TL[restoredKey].addTo(map)'),
  'osnovna karta mora biti dodana prije čekanja velike SQLite baze');
assert.ok(sqlite[1].indexOf('TL[restoredKey].addTo(map)') < sqlite[1].indexOf('return'),
  'osnovna karta mora biti vidljiva prije izlaza iz startup grane');
assert.ok(restore.includes('_mapRestoreIndicatorShow(saved.sqlId)'),
  'učitavanje mora biti označeno i debug mora dobiti naziv aktivne karte');
const recentPos = html.indexOf('id="loadmap-recent"');
const debugPos = html.indexOf('id="loadmap-startup-debug"');
assert.ok(recentPos >= 0 && debugPos > recentPos,
  'startup debug mora biti unutar Učitaj kartu, ispod Nedavne karte');

console.log('5 prošlo, 0 palo — karta je vidljiva, debug je ispod Nedavne karte');
