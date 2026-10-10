const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('static/js/explorer-navigation.js','utf8'),ctx);
const {perspective,unperspective,rotate}=ctx.window.ExplorerNavigation;
for(const [w,h] of [[320,568],[390,800],[568,320],[800,600]]){
 const pitch=48*Math.PI/180,depth=Math.max(900,h*2.5);
 for(const x of [-w/2,0,w/2])for(const y of [-h/2,0,h/2]){
  const p={x,y},inv=unperspective(p,pitch,depth),out=perspective(inv,pitch,depth);
  assert(Math.abs(out.x-x)<1e-8&&Math.abs(out.y-y)<1e-8);
  for(const a of [0,90,180,270,359,1]){
   const rot=rotate(inv,a*Math.PI/180),back=rotate(rot,-a*Math.PI/180),actual=perspective(back,pitch,depth);
   assert(Math.abs(actual.x-x)<1e-8&&Math.abs(actual.y-y)<1e-8);
  }
 }
 // Dalji dio karte je uži, bliži je širi; cilj ostaje na preciznoj projekciji.
 assert(perspective({x:100,y:-100},pitch,depth).x<100);
 assert(perspective({x:100,y:100},pitch,depth).x>100);
}
console.log('Explorer 3D: projekcija/inverzija, šest smjerova i četiri ekrana — OK');
