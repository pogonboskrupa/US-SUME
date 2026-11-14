const { izvor } = require('./_izvor');
const s = izvor();
const wrapStart = s.indexOf('<div id="ab-izmjeri-wrap"');
const menuStart = s.indexOf('<div id="ab-izmjeri-menu"');
const wrapEnd = s.indexOf('</div>', s.indexOf('</button>', wrapStart));
if (!(wrapStart > 0 && menuStart > wrapEnd)) { console.error('FAIL: meni Izmjeri mora biti van #ab-izmjeri-wrap (wrap se sakrije uz projekat)'); process.exit(1); }
if (!/closest\('#ab-izmjeri-menu'\)/.test(s)) { console.error('FAIL: zatvarač ne smije zatvarati klik unutar menija'); process.exit(1); }
console.log('ok');
