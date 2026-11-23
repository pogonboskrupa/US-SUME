'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const html=require('fs').readFileSync(__dirname+'/../../index.html','utf8');
const a=src.indexOf('function _msrLblPoligon'),b=src.indexOf('function _msrDrawAllSaved');
const f=new Function('L',src.slice(a,b)+';return {p:_msrLblPoligon,l:_msrLblLinija};')({latLngBounds:()=>({getCenter:()=>({lat:0,lng:0})})});
// konkavan L-poligon: oznaka mora biti UNUTRA, ne na ivici
const pts=[[0,0],[0,10],[2,10],[2,2],[10,2],[10,0]].map(([la,lo])=>({lat:44+la*0.001,lng:16+lo*0.001}));
const [la,lo]=f.p(pts);
const u=(x,y)=>{let r=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const A=pts[i],B=pts[j];if((A.lat>y)!==(B.lat>y)&&x<(B.lng-A.lng)*(y-A.lat)/(B.lat-A.lat)+A.lng)r=!r;}return r;};
assert(u(lo,la),'oznaka je unutar poligona');
// pravougaonik: pol nedostupnosti ≈ sredina
const r=[[0,0],[0,4],[2,4],[2,0]].map(([a2,b2])=>({lat:44+a2*0.001,lng:16+b2*0.001}));
const c=f.p(r);assert(Math.abs(c[0]-44.001)<0.0003&&Math.abs(c[1]-16.002)<0.0006,'centar pravougaonika');
// linija: polovina dužine, ne srednji vrh
const l=f.l([{lat:44,lng:16},{lat:44,lng:16.001},{lat:44,lng:16.01}]);
assert(l[1]>16.004&&l[1]<16.006,'tačka na polovini dužine');
// v4.5.6: oznake su uvijek tu (površina u ha u sredini, dužina/nagib pored linije), bez prekidača
assert(/_msrOznake\(m\.pts, 'area', color\)/.test(src)&&/_msrOznake\(m\.pts, mode, color\)/.test(src)&&/_msrOznake\(pts, _msrMode, _msrColor\)/.test(src));
assert(!/showLbl/.test(src.slice(src.indexOf('function _msrRegAdd'))),'nema više prekidača oznake');
assert(!/id="mqm-lbl"/.test(html));
assert(/msrArea: false, msrLen: false/.test(src));
console.log('OK msr oznaka');
