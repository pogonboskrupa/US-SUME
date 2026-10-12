const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:560,height:380},deviceScaleFactor:2});
  const uri='data:image/png;base64,'+fs.readFileSync(path.join(root,'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')).toString('base64');
  await page.setContent(`<style>body{margin:24px;background:#ecf0f3;color:#17212b;font:16px Arial}h2{font-size:18px;margin:0 0 20px}.row{display:flex;gap:24px;align-items:center;margin:22px 0}.label{width:90px}.icon{width:96px;height:96px;background:#42523C;position:relative;overflow:hidden;flex:none}.circle{border-radius:50%}.round{border-radius:25%}.square{border-radius:4%}.icon img{position:absolute;width:150%;height:150%;left:50%;top:50%;transform:translate(-50%,-50%)}.larger img{width:165.278%;height:165.278%}small{font-size:12px;color:#526272}.small{width:48px;height:48px}</style><h2>Dendro Map — veći simbol, isti okvir</h2>`+
  [['Prije',false],['Sada',true]].map(([label,larger])=>`<div class="row"><span class="label">${label}</span>${['circle','round','square'].map(shape=>`<div class="icon ${shape} ${larger?'larger':''}"><img src="${uri}"></div>`).join('')}</div>`).join('')+
  `<div class="row"><span class="label">48 px</span>${['circle','round','square'].map(shape=>`<div class="icon small ${shape} larger"><img src="${uri}"></div>`).join('')}</div><small>Simulacija Android adaptivnih maski; originalna grafika nije mijenjana.</small>`);
  assert.equal(await page.locator('.icon').count(),9);await page.screenshot({path:path.join(root,'outputs/launcher-icon-preview.png')});
  console.log('Launcher preview: old/new circle, rounded square, square + 48px generated');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
