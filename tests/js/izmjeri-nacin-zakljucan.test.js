const fs = require('fs');
const css = fs.readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
if (!/#mjtrg-panel \.msr-modes button:not\(\.on\)\s*\{display:none/.test(css)) { console.error('FAIL: neizabrani načini moraju biti sakriveni'); process.exit(1); }
if (!/#mjtrg-panel \.msr-modes button\s*\{pointer-events:none/.test(css)) { console.error('FAIL: oznaka načina ne smije biti klikabilna'); process.exit(1); }
console.log('ok');
