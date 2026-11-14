const assert = require('assert'); const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../supabase/migrations/20261122_obavijest_azuriranje_bez_regexa.sql', 'utf8');
const telo = sql.split('\n').filter(r => !/^\s*--/.test(r)).join('\n');
assert(/create or replace function public\.admin_posalji_azuriranje/.test(telo));
assert(!/!~|\s~\s|regexp_/.test(telo), 'bez regularnih izraza (invalid repetition count(s))');
assert(/je_admin\(\)/.test(telo));
console.log('obavijest-azuriranje-bez-regexa: ok');
