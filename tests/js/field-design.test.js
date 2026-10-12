'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../static/js/field-design.js'),'utf8');
function env(saved,fail=false) {
 const attributes={},meta={},button={setAttribute:(k,v)=>attributes[k]=v},events={},storage=new Map(saved?[['tvlake_field_theme_v1',saved]]:[]),toasts=[];
 const context={window:{},document:{documentElement:{dataset:{}},querySelector:()=>meta,getElementById:()=>button,addEventListener:(k,v)=>events[k]=v},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(fail)throw Error('quota');storage.set(k,v);}},showToast:s=>toasts.push(s)};
 vm.runInNewContext(source,context);return {context,attributes,meta,button,events,storage,toasts};
}
const dark=env();assert.equal(dark.context.document.documentElement.dataset.fieldTheme,'dark');assert.equal(dark.storage.size,0);
assert.match(dark.button.innerHTML,/Dnevni mod/);assert.ok(!dark.button.innerHTML.includes('za sunce'));
dark.context.window.toggleFieldTheme();assert.equal(dark.context.document.documentElement.dataset.fieldTheme,'day');assert.equal(dark.attributes['aria-pressed'],'true');assert.equal(dark.meta.content,'#f8fafc');assert.equal(dark.storage.get('tvlake_field_theme_v1'),'day');
const day=env('day');assert.equal(day.context.document.documentElement.dataset.fieldTheme,'day');day.events.DOMContentLoaded();assert.match(day.button.innerHTML,/uključen/);
assert.match(day.button.innerHTML,/Dnevni mod — uključen/);assert.equal(day.button.title,'Isključi Dnevni mod');
day.context.window.toggleFieldTheme();assert.equal(day.context.document.documentElement.dataset.fieldTheme,'dark');assert.equal(day.attributes['aria-pressed'],'false');
assert.equal(env('unknown').context.document.documentElement.dataset.fieldTheme,'dark');
const full=env(null,true);full.context.window.toggleFieldTheme();assert.equal(full.context.document.documentElement.dataset.fieldTheme,'day');assert.equal(full.toasts.length,1);
assert.ok(!/fetch\(|sb\.|enqueue\(|recOn\s*=/.test(source),'dizajn dira mrežu ili snimanje');
console.log('Terenski prikaz: lokalna postavka, obnova, ARIA i puna memorija — OK');
