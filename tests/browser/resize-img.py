"""v4.7.9: sažimanje fotografije ne blokira glavnu nit — dekodiranje kroz createImageBitmap,
kodiranje kroz toBlob. Stvarne funkcije iz glavni.js, stvarna JPEG slika 4000×3000."""
import asyncio,os,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
js=''
for n in ['_resizeImgCanvasUrl','_resizeImgStaro','_resizeImgVise','_resizeImg']:
    js+='\n'+b.function(n)
js+='''
async function napraviJpeg(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
 for(let i=0;i<400;i++){x.fillStyle=`hsl(${i*37%360},60%,${30+i%40}%)`;x.fillRect((i*97)%w,(i*53)%h,300,200);}
 return await new Promise(r=>c.toBlob(r,'image/jpeg',0.92));}
async function dim(du){const i=new Image();i.src=du;await i.decode();return [i.width,i.height];}
// Najduži zastoj glavne niti dok traje posao: tajmer od 4 ms, mjeri najveći razmak.
async function zastoj(fn){let max=0,last=performance.now(),go=true;
 const tick=()=>{const t=performance.now();max=Math.max(max,t-last);last=t;if(go)setTimeout(tick,4);};setTimeout(tick,4);
 const r=await fn();go=false;await new Promise(r=>setTimeout(r,20));return {r,max:Math.round(max)};}
'''
html='<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  br=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);pg=await br.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  await pg.route('**/*',lambda r:r.fulfill(content_type='text/html',body=html));await pg.goto('https://fixture.test/')
  # CPU 4× (srednji telefon); prvi krug je zagrijavanje.
  cdp=await pg.context.new_cdp_session(pg);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  await pg.evaluate('''async()=>{const f=await napraviJpeg(2000,1500);await _resizeImgVise(f,[[900,0.8]]);await _resizeImgStaro(f,900,0.8);}''')
  r=await pg.evaluate('''async()=>{const f=await napraviJpeg(4000,3000);
   const novo=await zastoj(()=>_resizeImgVise(f,[[60,0.78],[900,0.8]]));
   const f2=await napraviJpeg(4000,3000);
   const staro=await zastoj(()=>Promise.all([_resizeImgStaro(f2,60,0.78),_resizeImgStaro(f2,900,0.8)]));
   const jedan=await _resizeImg(f,900,0.8);
   return {thumb:await dim(novo.r[0]),full:await dim(novo.r[1]),jedan:await dim(jedan),
     jpeg:novo.r[1].startsWith('data:image/jpeg'),novoMax:novo.max,staroMax:staro.max};}''')
  print(r)
  assert r['thumb']==[60,45] and r['full']==[900,675] and r['jedan']==[900,675],r
  assert r['jpeg'],r
  assert r['novoMax']*2<r['staroMax'],r
  await cdp.send('Emulation.setCPUThrottlingRate',{'rate':1})
  # Bez createImageBitmap ide stari put i daje isti rezultat.
  r2=await pg.evaluate('''async()=>{const f=await napraviJpeg(1200,800);const cib=window.createImageBitmap;window.createImageBitmap=undefined;
   try{return await dim(await _resizeImg(f,600,0.8));}finally{window.createImageBitmap=cib;}}''')
  assert r2==[600,400],r2
  # Pokvarena slika se odbija (ne visi).
  r3=await pg.evaluate('''async()=>{try{await _resizeImg(new Blob(['nije slika'],{type:'image/jpeg'}),600,0.8);return 'prošlo';}catch(e){return 'odbijeno';}}''')
  assert r3=='odbijeno',r3
  assert not errs,errs
  await br.close();print('resize-img: ok')
asyncio.run(main())
