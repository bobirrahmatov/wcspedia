'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(provider){
 const dom=new JSDOM('<div id="host"></div>',{url:'https://example.test/confluence/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.console.warn=()=>{};
 w.eval(fs.readFileSync(path.join(__dirname,'../add-document-widget.js'),'utf8'));
 let now=100000;w.Date.now=()=>now;const routes=[];
 const host=d.getElementById('host'),handle=w.WCSAddDocument.mount(host,{reuseNavigationAccess:true,canCreate:provider,types:['Blog','Guide'],createUrl:'#/create',navigate:url=>{routes.push(url);return false;}});
 return {w,d,host,handle,routes,button:()=>host.querySelector('button'),idle:()=>{now+=600000;},close:()=>w.close()};
}
test('verified navigation opens and selects without repeating network permission reads',async t=>{
 let reads=0;const f=fixture(async()=>{reads++;return true;});t.after(f.close);await f.handle.ready;
 for(let i=0;i<3;i++){f.button().click();await tick();f.d.querySelector('[role=menuitem]').click();await tick();}
 assert.equal(reads,1);assert.equal(f.routes.length,3);assert.equal(f.button().disabled,false);
});
test('ten-minute idle return refreshes once in background, keeps navigation responsive, then disables on denial',async t=>{
 let reads=0,finish;const f=fixture(()=>++reads===1?Promise.resolve(true):new Promise(resolve=>{finish=resolve;}));t.after(f.close);await f.handle.ready;
 f.idle();f.d.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.Event('focus'));
 assert.equal(reads,2);assert.equal(f.button().disabled,false);assert.equal(f.button().getAttribute('aria-busy'),'false');
 f.button().click();await tick();assert.ok(f.d.querySelector('[role=menu]'));assert.equal(reads,2);
 finish(false);await tick();assert.equal(f.button().disabled,true);assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.routes.length,0);
});
test('click after idle opens immediately while refresh runs and failed access can recover on focus',async t=>{
 let reads=0,reject;const f=fixture(()=>++reads===2?new Promise((_,fail)=>{reject=fail;}):Promise.resolve(true));t.after(f.close);await f.handle.ready;
 f.idle();f.button().click();await tick();assert.ok(f.d.querySelector('[role=menu]'));assert.equal(reads,2);
 reject(Error('Session unavailable'));await tick();assert.equal(f.button().disabled,true);
 f.w.dispatchEvent(new f.w.Event('focus'));await tick();assert.equal(reads,3);assert.equal(f.button().disabled,false);assert.equal(f.d.querySelector('[role=menu]'),null);
});
test('explicit configuration update invalidates navigation hint and late refresh cannot undo denial',async t=>{
 let reads=0,finish;const f=fixture(()=>++reads===1?Promise.resolve(true):new Promise(resolve=>{finish=resolve;}));t.after(f.close);await f.handle.ready;
 f.idle();f.w.dispatchEvent(new f.w.Event('focus'));
 await f.handle.update({canCreate:async()=>false});finish(true);await tick();assert.equal(f.button().disabled,true);assert.equal(f.routes.length,0);
});
