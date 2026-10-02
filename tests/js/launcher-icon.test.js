const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),res=path.join(root,'android/app/src/main/res');
// Read-only PNG alpha analysis; no image regeneration or change to the brand.
function rgba(file){
 const b=fs.readFileSync(file),w=b.readUInt32BE(16),h=b.readUInt32BE(20);assert.equal(b[24],8);assert.equal(b[25],6);
 const chunks=[];for(let p=8;p<b.length;){const n=b.readUInt32BE(p);if(b.toString('ascii',p+4,p+8)==='IDAT')chunks.push(b.subarray(p+8,p+8+n));p+=12+n;}
 const raw=zlib.inflateSync(Buffer.concat(chunks)),out=Buffer.alloc(w*h*4),stride=w*4;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<h;y++){
  const filter=raw[y*(stride+1)];assert.ok(filter<=4);
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=4?out[i-4]:0,b=y?out[i-stride]:0,c=y&&x>=4?out[i-stride-4]:0;
   out[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
  }
 }return {w,h,out};
}
const manifest=fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
assert.ok(manifest.includes('android:icon="@mipmap/ic_launcher_visible"'));assert.ok(manifest.includes('android:roundIcon="@mipmap/ic_launcher_round_visible"'));
const layer=fs.readFileSync(path.join(res,'drawable/ic_launcher_foreground_visible.xml'),'utf8');
for(const edge of ['left','top','right','bottom'])assert.ok(layer.includes(`android:${edge}="-5.5dp"`));
assert.ok(layer.includes('@mipmap/ic_launcher_foreground'));assert.ok(layer.includes('android:gravity="fill"'));
for(const name of ['ic_launcher_visible','ic_launcher_round_visible']){
 const adaptive=fs.readFileSync(path.join(res,'mipmap-anydpi-v26',name+'.xml'),'utf8');
 assert.ok(adaptive.includes('@color/ic_launcher_background'));assert.ok(adaptive.includes('@drawable/ic_launcher_foreground_visible'));
 const legacy=fs.readFileSync(path.join(res,'mipmap-anydpi',name+'.xml'),'utf8');assert.ok(legacy.includes('-2.5dp'));assert.ok(legacy.includes('android:gravity="fill"'));assert.ok(legacy.includes('@mipmap/ic_launcher_foreground'));assert.ok(legacy.includes('@color/ic_launcher_background'));
}
const results=[];
for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
 const {w,h,out}=rgba(path.join(res,'mipmap-'+density,'ic_launcher_foreground.png'));assert.equal(w,h);
 let radius=0,minX=w,minY=h,maxX=0,maxY=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(out[(y*w+x)*4+3]>0){
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  // Include pixel corners + 1 target pixel interpolation allowance.
  radius=Math.max(radius,Math.hypot(Math.abs(x+.5-w/2)+.5,Math.abs(y+.5-h/2)+.5)*119/108+1);
 }
 assert.ok(radius<=w*33/108,`${density}: artwork exceeds central 66dp safe circle (${radius})`);
 const diagonal=Math.hypot(maxX-minX+1,maxY-minY+1)*119/108/w;
 assert.ok(diagonal<=.61,`${density}: bounding diagonal exceeds safe-zone rule (${diagonal})`);
 results.push({density,radius:Math.round(radius*100)/100,safeRadius:w*33/108});
}
console.log(JSON.stringify({enlargement:'10.2%',safeZone:true,densities:results}));
