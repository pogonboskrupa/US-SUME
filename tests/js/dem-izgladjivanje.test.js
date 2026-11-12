// v4.3.6: nagib/ekspozicija na karti iz izglađenih visina (kao izvještaj odjela) — šum DEM-a ne smije davati lažne strmine.
const Q=require('../../static/js/dem-quality.js'),assert=require('assert');
const m=6.77,e=new Float32Array(65536);let s=7;const rnd=()=>((s=s*16807%2147483647)/2147483647-.5);
for(let y=0;y<256;y++)for(let x=0;x<256;x++)e[y*256+x]=500+0.2*x*m+rnd()*10; // ravna kosina 20 % + šum ±5 m
const kl=a=>{let n=0,v=0;for(let y=20;y<236;y++)for(let x=20;x<236;x++){const p=Q.gradient(a,x,y,m).percent;n++;if(p>=30)v++;}return v/n;};
const sir=kl(e),izg=kl(Q.smoothFor(e,m));
assert(sir>0.05,'test mora imati lažne strmine bez izglađivanja: '+sir);
assert(izg<0.005,'izglađeno: lažne strmine nestaju: '+izg);
const sr=Q.gradient(Q.smoothFor(e,m),128,128,m).percent;assert(Math.abs(sr-20)<3,'srednji nagib ostaje ~20 %: '+sr);
const src=require('./_izvor').izvor();
assert((src.match(/DemQuality\.smoothFor/g)||[]).length>=2,'nagib i ekspozicija koriste izglađivanje');
// zadane kolege: pregled s kim već dijeli
assert(/admin_korisnik_dijeljenje/.test(src)&&/Već može dijeliti sa: /.test(src));
console.log('ok dem izglađivanje',sir.toFixed(3),izg.toFixed(4),sr.toFixed(1));
