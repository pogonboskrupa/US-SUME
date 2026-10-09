/* Tastatura za oznake vlaka: ostaje unutar postojećeg lista/dijaloga. */
(function(root){
'use strict';
const instances=new WeakMap();
function mount(input,host,{onDone,onHide}={}){
  unmount(host);
  const previousMode=input.inputMode; input.inputMode='none';
  host.classList.add('vlaka-keyboard');host.setAttribute('role','group');host.setAttribute('aria-label','Tastatura za oznaku vlake');
  let abc=false;
  function button(label,action,title){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',title||label);b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',action);return b;}
  function edit(text,erase=false){
    const a=input.selectionStart??input.value.length,b=input.selectionEnd??a;
    const from=erase&&a===b?Math.max(0,a-1):a;
    input.value=input.value.slice(0,from)+text+input.value.slice(b);
    input.focus({preventScroll:true});input.setSelectionRange(from+text.length,from+text.length);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function render(){
    host.replaceChildren();
    const top=document.createElement('div');top.className='vk-top';
    const title=document.createElement('span');title.textContent='Oznaka vlake';top.append(title);
    const toggle=button(abc?'123':'ABC',()=>{abc=!abc;render();},abc?'Prikaži brojeve':'Prikaži slova');toggle.setAttribute('aria-pressed',String(abc));top.append(toggle);
    if(onHide)top.append(button('Sakrij',onHide,'Sakrij tastaturu'));
    host.append(top);
    const keys=document.createElement('div');keys.className='vk-keys'+(abc?' vk-letters':'');
    for(const key of abc?'QWERTZUIOPASDFGHJKLYXCVBNMČĆŠĐŽ'.split(''):['1','2','3','4','5','6','7','8','9','T','0','.'])keys.append(button(key,()=>edit(key),key==='.'?'Tačka za krak':key));
    host.append(keys);
    const actions=document.createElement('div');actions.className='vk-actions';
    actions.append(button('←',()=>{input.focus({preventScroll:true});const p=Math.max(0,(input.selectionStart??0)-1);input.setSelectionRange(p,p);},'Pomjeri kursor lijevo'));
    actions.append(button('→',()=>{input.focus({preventScroll:true});const p=Math.min(input.value.length,(input.selectionEnd??0)+1);input.setSelectionRange(p,p);},'Pomjeri kursor desno'));
    actions.append(button('⌫',()=>edit('',true),'Obriši znak'));
    if(onDone){const done=button('Gotovo',onDone,'Potvrdi oznaku vlake');done.className='vk-done';actions.append(done);}host.append(actions);
  }
  instances.set(host,()=>{input.inputMode=previousMode;host.replaceChildren();host.classList.remove('vlaka-keyboard');host.removeAttribute('role');host.removeAttribute('aria-label');});render();
}
function unmount(host){if(!host)return;instances.get(host)?.();instances.delete(host);}
function picker(){const inp=document.getElementById('vpick-input'),host=document.getElementById('vpick-keyboard');if(!inp||!host)return;host.hidden=false;mount(inp,host,{onDone:()=>_vpickGo(),onHide:()=>{unmount(host);host.hidden=true;inp.blur();}});}
root.VlakaKeyboard={mount,unmount,picker};
})(typeof window!=='undefined'?window:globalThis);
