'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick}=require('./app-fixture.cjs');
const frame=()=>new Promise(resolve=>setTimeout(resolve,45));
test('host offsets and viewport changes never introduce an inner application viewport',async t=>{
  let top=120;const f=await fixture({sourceMode:true,configureWindow(w,d){
    const root=d.getElementById('wcspedia');root.getBoundingClientRect=()=>({top,left:0,width:1000,height:600});root.style.setProperty('--wcs-available-height','600px');
    Object.defineProperty(w,'innerHeight',{value:800,configurable:true,writable:true});
    const header=d.createElement('header');header.id='native-host';header.textContent='Existing header';d.body.prepend(header);
  }});t.after(f.close);
  assert.equal(f.root.style.getPropertyValue('--wcs-available-height'),'');
  const pane=f.find(':scope > .shell');assert.equal(pane.hasAttribute('tabindex'),false,'Static page content must not introduce a redundant scroll-region tab stop');assert.equal(pane.getAttribute('role'),'region');
  top=180;f.w.innerHeight=700;f.w.dispatchEvent(new f.w.Event('resize'));await frame();
  assert.equal(f.root.style.getPropertyValue('--wcs-available-height'),'');
  assert.equal(f.d.getElementById('native-host').outerHTML,'<header id="native-host">Existing header</header>');
  assert.equal(f.d.body.style.overflow,'');assert.equal(f.errors.length,0);
});
test('back to top is outside the macro and responds to the host document scroll',async t=>{
  const f=await fixture({sourceMode:true});t.after(f.close);const hostScrolls=[];
  f.w.scrollTo=options=>{hostScrolls.push(options);f.w.scrollY=options.top;f.d.documentElement.scrollTop=options.top;};
  f.w.scrollY=500;f.w.dispatchEvent(new f.w.Event('scroll'));
  const button=f.d.getElementById('wcs-back-to-top');assert.ok(button);assert.equal(button.parentNode,f.d.body);assert.equal(f.root.contains(button),false);assert.equal(button.hidden,false);
  button.click();await tick();assert.equal(hostScrolls.length,1);assert.equal(hostScrolls[0].top,0);assert.equal(hostScrolls[0].behavior,'smooth');assert.equal(button.hidden,true);assert.equal(f.d.activeElement,f.find('h1'));
  await f.navigate('#/results');assert.equal(hostScrolls.length,2);assert.equal(f.d.querySelectorAll('#wcs-back-to-top').length,1);assert.equal(f.errors.length,0);
});
test('back to top follows a Confluence content scroller when the host provides one',async t=>{
  let scroller;const hostScrolls=[];const f=await fixture({sourceMode:true,configureWindow(w,d){
    scroller=d.createElement('div');scroller.style.overflowY='auto';d.getElementById('wcspedia').before(scroller);scroller.append(d.getElementById('wcspedia'));
    Object.defineProperty(scroller,'scrollHeight',{value:1800});Object.defineProperty(scroller,'clientHeight',{value:700});
    w.scrollTo=options=>hostScrolls.push(options);
  }});t.after(f.close);
  scroller.scrollTop=700;scroller.dispatchEvent(new f.w.Event('scroll'));const button=f.d.getElementById('wcs-back-to-top');assert.equal(button.hidden,false);
  f.w.matchMedia=()=>({matches:true});let scrollOptions;scroller.scrollTo=options=>{scrollOptions=options;scroller.scrollTop=options.top;};
  button.click();assert.equal(scroller.scrollTop,0);assert.equal(scrollOptions.behavior,'instant');assert.equal(button.hidden,true);assert.equal(hostScrolls.length,0);
  scroller.scrollTop=600;await f.navigate('#/results');assert.equal(scroller.scrollTop,0);assert.equal(hostScrolls.length,0);assert.equal(f.errors.length,0);
});
test('back-to-top portal hides during a modal and returns when the modal closes',async t=>{
  const f=await fixture({sourceMode:true});t.after(f.close);let scrolls=0;f.w.scrollTo=()=>{scrolls++;};
  f.w.scrollY=600;f.w.dispatchEvent(new f.w.Event('scroll'));const button=f.d.getElementById('wcs-back-to-top');assert.equal(button.hidden,false);
  const dialog=f.w.WCSUI.dialog({title:'Review decision',body:'<button id="modal-action">Continue</button>'});const focused=f.d.activeElement;
  button.click();assert.equal(scrolls,0,'A portal click cannot navigate behind the modal');assert.equal(f.d.activeElement,focused);
  await tick();assert.equal(button.hidden,true,'Visibility updates without requiring a scroll or resize');
  dialog.close();await tick();assert.equal(button.hidden,false,'Closing the modal restores the viewport utility immediately');assert.equal(f.errors.length,0);
});
test('dialog actions stay delegated to WCSpedia without reaching host shortcuts',async t=>{
  const f=await fixture({sourceMode:true});t.after(f.close);let local=0,host=0;
  f.root.addEventListener('click',()=>local++);f.d.addEventListener('click',()=>host++);
  const dialog=f.w.WCSUI.dialog({title:'Hosted dialog',body:'<button type="button">Continue</button><input aria-label="Note">'});
  dialog.body.querySelector('button').click();assert.equal(local,1);assert.equal(host,0);
  let shortcuts=0;f.d.addEventListener('keydown',()=>shortcuts++);
  dialog.body.querySelector('input').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'e',bubbles:true}));assert.equal(shortcuts,0);
  dialog.close();f.d.body.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'e',bubbles:true}));assert.equal(shortcuts,1);
});
