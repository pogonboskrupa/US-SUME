'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function _checkLatestVersion()');
const source=html.slice(start,html.indexOf('\nfunction _showVersionBanner',start));
async function check(apk,response,dismissed){
 const calls=[],shown=[];
 const e={location:{hostname:apk?'appassets.androidplatform.net':'device.test'},Date,APP_VER:'v2.7.2',
 _fetchT:async url=>{calls.push(url);if(response instanceof Error)throw response;return {ok:true,json:async()=>response,text:async()=>response};},
 _verCmp:(a,b)=>a.localeCompare(b,undefined,{numeric:true}),localStorage:{getItem:()=>dismissed},_showVersionBanner:(v,a)=>shown.push([v,a])};
 vm.createContext(e);vm.runInContext(source,e);await e._checkLatestVersion();return {calls,shown};
}
async function main(){
 const release={tag_name:'v2.7.3',draft:false,assets:[{name:'app-debug.apk',state:'uploaded'}]};
 let r=await check(true,[release]);assert.equal(r.shown[0][0],'2.7.3');assert.equal(r.shown[0][1],true);assert.match(r.calls[0],/api.github.com.*releases\?per_page=1/);
 for(const item of [{...release,assets:[]},{...release,draft:true},{...release,assets:[{name:'app-debug.apk',state:'starter'}]},{...release,tag_name:'v2.7.2'},{...release,tag_name:'bad-tag'}])assert.equal((await check(true,[item])).shown.length,0);
 assert.equal((await check(true,[release],'2.7.3')).shown.length,0);assert.equal((await check(true,new Error('offline'))).shown.length,0);
 r=await check(false,"const APP_VERSION = '2.7.3';");assert.match(r.calls[0],/^\.\/sw.js/);assert.equal(r.shown[0][0],'2.7.3');
 console.log('OK update discovery: published APK only, pending/draft skipped, version/dismissal/offline, web SW');
}
main().catch(e=>{console.error(e);process.exit(1)});
