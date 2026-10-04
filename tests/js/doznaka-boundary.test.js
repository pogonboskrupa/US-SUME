'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../../static/js/doznaka-boundary.js');
function image(){const width=360,height=360,data=new Uint8ClampedArray(width*height*4);data.fill(255);return {width,height,data,points:[[76,76],[284,76],[284,284],[76,284]],radius:30};}
function rect(im,x,y,w,h,rgb){for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){const at=(py*im.width+px)*4;im.data[at]=rgb[0];im.data[at+1]=rgb[1];im.data[at+2]=rgb[2];}}
function border(im,edge=60,color=[20,20,20],thick=4,dashed=true){const end=360-edge;for(let p=edge+10;p<end-9;p+=28){const n=dashed?Math.min(18,end-p):end-edge-20;rect(im,p,edge,n,thick,color);rect(im,p,end,n,thick,color);rect(im,edge,p,thick,n,color);rect(im,end,p,thick,n,color);if(!dashed)break;}return im;}
test('thick black dashes follow real boundary, not rough polygon',()=>{const im=border(image()),r=B.detect(im);assert.equal(r.ok,true,r.reason);assert.equal(r.color,'black');assert.ok(r.dashes>=24);assert.ok(r.points.length>=4);assert.ok(r.points.some(p=>Math.abs(p[0]-61.5)<2));assert.ok(B.area(r.points)>B.area(im.points));assert.equal(B.crosses(r.points),false);});
test('blue boundary independently recognized',()=>{const r=B.detect(border(image(),60,[25,50,180]));assert.equal(r.ok,true,r.reason);assert.equal(r.color,'blue');});
test('thin contours cannot become department border',()=>{assert.equal(B.detect(border(image(),60,[20,20,20],1)).ok,false);});
test('continuous roads are rejected',()=>{assert.equal(B.detect(border(image(),60,[20,20,20],4,false)).ok,false);});
test('missing side leaves manual geometry unchanged',()=>{const im=border(image());rect(im,45,280,280,35,[255,255,255]);const saved=JSON.stringify(im.points);assert.equal(B.detect(im).ok,false);assert.equal(JSON.stringify(im.points),saved);});
test('OCR text boxes exclude label-shaped marks from candidates',()=>{const im=border(image());im.words=[{text:'ODJEL',x0:45,y0:45,x1:325,y1:70}];assert.equal(B.detect(im).ok,false);});
test('two complete colors require explicit selection',()=>{const im=border(border(image()),70,[25,50,180]);const r=B.detect(im);assert.equal(r.ok,false);assert.match(r.reason,/dvije/);assert.equal(B.detect({...im,color:'blue'}).color,'blue');assert.equal(B.detect({...im,color:'black'}).color,'black');});
test('unrelated distant borders are excluded by corridor',()=>{const im=border(image(),20);assert.equal(B.detect(im).ok,false);});
test('self-intersecting rough polygon refused',()=>{const im=border(image());im.points=[[76,76],[284,284],[76,284],[284,76]];assert.equal(B.detect(im).ok,false);});
test('transparent unloaded tiles cannot generate lines',()=>{const im=border(image());for(let k=3;k<im.data.length;k+=4)im.data[k]=0;assert.equal(B.detect(im).ok,false);});
test('malformed or excessive images and points refused',()=>{assert.equal(B.detect({...image(),width:4000}).ok,false);assert.equal(B.detect({...image(),points:[[0,0],[NaN,1],[40,40]]}).ok,false);assert.equal(B.detect({...image(),points:Array(65).fill([40,40])}).ok,false);});
test('slightly irregular dash centres preserve bends',()=>{const im=border(image());rect(im,145,60,50,4,[255,255,255]);rect(im,154,57,18,4,[20,20,20]);const r=B.detect(im);assert.equal(r.ok,true,r.reason);assert.ok(r.points.some(p=>p[1]<60));});

test('OCR punctuation cannot erase true boundary dashes',()=>{const im=border(image());im.words=[{text:'---',x0:45,y0:45,x1:325,y1:70}];const r=B.detect(im);assert.equal(r.ok,true,r.reason);});
