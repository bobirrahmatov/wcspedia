'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','scroll-tools.js'),'utf8');
const frame=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
function fixture(nested=false){
 const dom=new JSDOM(nested?'<div id="pane" style="overflow-y:auto"><div id="main-content"><h1>Native article</h1></div></div>':'<main id="wcspedia"><h1>Knowledge</h1></main>',{url:'https://example.test/confluence/page#/results?q=credit',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,pane=nested?d.getElementById('pane'):d.documentElement;let height=2000;Object.defineProperty(pane,'scrollHeight',{get:()=>height});Object.defineProperty(pane,'clientHeight',{value:500});w.matchMedia=()=>({matches:true});
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};let scrolled;
 if(nested)pane.scrollTo=o=>{scrolled=o;pane.scrollTop=o.top;};else w.scrollTo=o=>{scrolled=o;pane.scrollTop=o.top;};
 w.eval(source);const instance=w.WCSScrollTools.mount();
 return {w,d,pane,instance,get scrolled(){return scrolled;},resize:value=>height=value,close:()=>w.close()};
}
for(const nested of [false,true])test('progress follows '+(nested?'native content pane':'document')+' and click preserves the app route',async()=>{
 const f=fixture(nested);try{
  const b=f.d.getElementById('wcs-back-to-top');assert.equal(b.hidden,true);f.pane.scrollTop=750;f.pane.dispatchEvent(new f.w.Event('scroll'));await frame(f.w);
  assert.equal(b.hidden,false);assert.equal(b.style.getPropertyValue('--wcs-scroll-progress'),'0.5000');
  const url=f.w.location.href;b.click();assert.deepEqual(JSON.parse(JSON.stringify(f.scrolled)),{top:0,behavior:'instant'});assert.equal(f.w.location.href,url);assert.equal(f.d.activeElement.tagName,'H1');await frame(f.w);assert.equal(b.hidden,true);
  assert.equal(b.parentElement,f.d.body);assert.equal(b.querySelectorAll('svg').length,2);
 }finally{f.close();}
});
test('duplicate includes share one instance; resizing content recomputes progress and short pages hide it',async()=>{
 const f=fixture();try{f.w.eval(source);assert.equal(f.w.WCSScrollTools.mount(),f.instance);assert.equal(f.d.querySelectorAll('#wcs-back-to-top').length,1);f.pane.scrollTop=750;f.resize(3500);f.w.dispatchEvent(new f.w.Event('resize'));await frame(f.w);assert.equal(f.d.getElementById('wcs-back-to-top').style.getPropertyValue('--wcs-scroll-progress'),'0.2500');f.resize(500);f.instance.refresh();await frame(f.w);assert.equal(f.d.getElementById('wcs-back-to-top').hidden,true);f.instance.destroy();assert.equal(f.d.getElementById('wcs-back-to-top'),null);}finally{f.close();}
});
test('dialogs hide the control and prevent background scrolling',async()=>{
 const f=fixture();try{f.pane.scrollTop=900;f.instance.refresh();await frame(f.w);const dialog=f.d.createElement('div');dialog.setAttribute('aria-modal','true');f.d.body.append(dialog);await frame(f.w);const b=f.d.getElementById('wcs-back-to-top');assert.equal(b.hidden,true);b.click();assert.equal(f.scrolled,undefined);dialog.remove();await frame(f.w);assert.equal(b.hidden,false);}finally{f.close();}
});
