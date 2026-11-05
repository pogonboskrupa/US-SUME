const assert = require('assert');
const zlib = require('zlib');
const { izvor } = require('./_izvor');
const src = izvor();
function fn(ime, kraj) { const a = src.indexOf(ime); assert(a > 0, ime); const b = src.indexOf(kraj, a); assert(b > a, kraj); return src.slice(a, b); }

// 1) ZIP (KMZ) bez kompresije je ispravan: CRC i raspored provjerava stvarni unzip
const zipKod = fn('const _CRC_TAB', 'function _dataUrlBajti');
const Z = new Function('TextEncoder', zipKod + '; return {_zipStore,_crc32};')(TextEncoder);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const zip = Buffer.from(Z._zipStore([{ name: 'doc.kml', data: new TextEncoder().encode('<kml/>') }, { name: 'files/slika1.jpg', data: new Uint8Array(jpg) }]));
assert.strictEqual(Z._crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'CRC32 standardni test vektor');
assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);
const eocd = zip.length - 22; assert.strictEqual(zip.readUInt32LE(eocd), 0x06054b50); assert.strictEqual(zip.readUInt16LE(eocd + 10), 2);
const cenOff = zip.readUInt32LE(eocd + 16); assert.strictEqual(zip.readUInt32LE(cenOff), 0x02014b50);
const lo = zip.readUInt32LE(cenOff + 42 + 46 + 7 + 0 - 0) ; // drugi ulaz: preskoči prvi ulaz centralnog direktorija
// prvi ulaz: 46 + ime(7); drugi počinje poslije
const dr = cenOff + 46 + 7; assert.strictEqual(zip.readUInt32LE(dr), 0x02014b50);
const off2 = zip.readUInt32LE(dr + 42), n2 = zip.readUInt32LE(dr + 20), nl = zip.readUInt16LE(off2 + 26);
assert.deepStrictEqual(zip.slice(off2 + 30 + nl, off2 + 30 + nl + n2), jpg, 'slika je netaknuta u arhivi');

// 2) KML sadrži Placemark za svaku sliku i LineString traga
const kmlKod = fn('function _tragToKml(t, fotoFajlovi)', '// ── KMZ');
const toKml = new Function('_escXml', '_tragIme', '_hexToKmlColor', kmlKod + '; return _tragToKml;')(x => x, () => 'T', () => 'ff0000ff');
const k = toKml({ pts: [[1, 2], [3, 4]], color: '#f00' }, [{ putanja: 'files/slika1.jpg', la: 5, lo: 6 }]);
assert(/<LineString>/.test(k) && /files\/slika1\.jpg/.test(k) && /<coordinates>6,5,0<\/coordinates>/.test(k));
assert(!/<Point>/.test(toKml({ pts: [[1, 2]], color: '#f00' })), 'bez slika nema tačaka');

// 3) Stabilizacija ne odgađa snimanje; slabi fiksevi se preskaču dok traje
const gate = fn('function _gpsStabilizeGate(beginFn)', 'function _gpsStabFinish');
assert(/try \{ beginFn\(\); \}/.test(gate), 'snimanje kreće odmah');
assert(!/_gpsStabBeginFn = beginFn/.test(gate), 'gate više ne drži početak do kraja stabilizacije');
assert(/_gpsStabPending/.test(fn('function _addTragPoint', 'nowOverride:')) && /_gpsStabPending/.test(fn('function _vlakaProcessGpsPoint', '2. SPIKE')));

// 4) Slika u tragu: dugme, meta i kopiranje na sačuvani trag
assert(/id="ab-trag-foto"/.test(src) && /function _tragFoto\(\)/.test(src));
assert(/meta\.fotos\.slice\(0, 30\)/.test(src) && /_tragFotoCeka && _tragOn/.test(src));
assert(!/id="ab-trag-stats"/.test(src), 'prikaz broja tačaka je uklonjen');

// 5) Ažuriranje se može smanjiti
assert(/function _updMin\(\)/.test(src) && /id="upd-min"/.test(src) && /function _updPillSync\(\)/.test(src));
assert(/st\.min && !_UPD_ZAVRSNE\.includes\(p\.faza\)/.test(src), 'napredak ne otvara prozor ponovo dok je smanjen');
console.log('trag-slike-stabilizacija-update: ok');
