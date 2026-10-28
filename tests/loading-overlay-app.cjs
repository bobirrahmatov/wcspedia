/* Exercise the shipped bundle while actual startup promises are pending. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {read,files,dataset,tick}=require('./app-fixture.cjs');
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const sourceMode=process.argv.includes('--source');
const bundle=read('wcspedia.js');
const runtime=sourceMode?[...bundle.matchAll(/\/\* Source: ([^\n]+) \*\//g)].map(match=>read(match[1])+'\n;').join('\n'):bundle;
function begin(role='home',{timeout=false,header=false,hash=''}={}){
  const dom=new JSDOM(read(files[role]),{url:'http://localhost:4173/'+files[role]+hash,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,request=deferred();
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false});
  for(const script of d.querySelectorAll('script:not([src])'))w.eval(script.textContent);
  w.WCS_CONFIG.charts={...w.WCS_CONFIG.charts,offline:true};
  w.fetch=()=>request.promise;
  if(timeout){const timer=w.setTimeout.bind(w);w.setTimeout=(callback,ms,...args)=>timer(callback,ms===60000?5:ms,...args);}
  if(header)w.eval(read('loading-overlay.js'));
  const headerAPI=w.WCSLoadingOverlay;
  const ready=w.eval(runtime);
  const respond=(data=dataset)=>request.resolve({ok:true,text:async()=>JSON.stringify(data)});
  return {dom,w,d,ready,respond,headerAPI,root:d.getElementById('wcspedia'),close:async()=>{await tick();w.close();}};
}
test('landing loader covers startup and leaves the page usable',async t=>{
  const f=begin('home');t.after(f.close);
  assert.ok(f.d.querySelector('.wcs-loading-overlay'),'Startup opens the overlay immediately');
  assert.equal(f.root.querySelector('.wcs-loading-skeleton'),null);
  await new Promise(resolve=>setTimeout(resolve,220));
  const overlay=f.d.querySelector('.wcs-loading-overlay');
  assert.ok(overlay,'The pending data request shows the shared overlay');
  assert.equal(overlay.parentElement,f.d.body,'Root rendering cannot discard the loader');
  assert.equal(f.root.getAttribute('aria-busy'),'true');
  assert.ok(f.root.hasAttribute('inert'));
  assert.equal(overlay.querySelectorAll('[role="img"][aria-label="Citi"]').length,1);
  assert.ok(overlay.querySelector('.wcs-loading-panel [role="img"][aria-label="Citi"]'));
  assert.equal(overlay.querySelector('.wcs-loading-brand'),null);
  f.respond();await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.getAttribute('aria-busy'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  assert.ok(f.root.querySelector('h1'));
  assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
});
for(const [role,hash] of [
  ['mine',''],['review',''],['saved',''],['entitlements',''],
  ['mine','#/create'],['mine','#/edit/sample'],
  ['home','#/results?q=credit'],['home','#/document/sample'],['home','#/create']
])test('all page startups show one immediate overlay and release it: '+role+hash,async t=>{
  const f=begin(role,{hash});t.after(f.close);
  assert.equal(f.d.querySelectorAll('.wcs-loading-overlay').length,1);
  assert.equal(f.root.querySelector('.wcs-loading-skeleton'),null);
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(f.d.querySelectorAll('.wcs-loading-overlay').length,1);
  assert.equal(f.root.hasAttribute('inert'),true);
  f.respond();await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  assert.notEqual(f.d.body.style.overflow,'hidden');
  assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
});
for(const role of ['mine','review','saved','entitlements'])test('nonlanding failed startup keeps its inline retry screen: '+role,async t=>{
  const f=begin(role);t.after(f.close);f.respond({});await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  assert.notEqual(f.d.body.style.overflow,'hidden');
  assert.match(f.root.textContent,/WCSpedia could not load/);
  assert.equal(f.root.querySelector('button').textContent,'Try again');
});
test('nonlanding requests still time out and ignore a late success',async t=>{
  const f=begin('mine',{timeout:true});t.after(f.close);await f.ready;
  assert.match(f.root.textContent,/Loading took too long/);
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  f.respond();await tick();await tick();assert.match(f.root.textContent,/Loading took too long/);
});
test('page departure cancels nonlanding startup without a modal loader',async t=>{
  const f=begin('review');t.after(f.close);
  f.w.dispatchEvent(new f.w.Event('pagehide'));await f.ready;
  assert.match(f.root.textContent,/Page loading was interrupted/);
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  f.respond();await tick();assert.match(f.root.textContent,/Page loading was interrupted/);
});
test('loader waits for library data and advances only after a completed step',async t=>{
  const f=begin();t.after(f.close);
  const library=deferred(),create=f.w.WCSLibraryWorkflows.create;
  f.w.WCSLibraryWorkflows={create:options=>{
    const instance=create(options);
    return {...instance,load:async(...args)=>{await library.promise;return instance.load(...args);}};
  }};
  f.respond();await new Promise(resolve=>setTimeout(resolve,220));
  const bar=f.d.querySelector('.wcs-loading-track');
  assert.ok(bar);
  assert.equal(bar.getAttribute('aria-valuenow'),'1');
  assert.equal(bar.getAttribute('aria-valuemax'),'3');
  assert.match(bar.getAttribute('aria-valuetext'),/Loading saved items/);
  library.resolve();await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
});
test('failed data requests expose the existing retry screen without an overlay',async t=>{
  const f=begin();t.after(f.close);f.respond({});await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  assert.match(f.root.textContent,/WCSpedia could not load/);
  assert.equal(f.root.querySelector('button').textContent,'Try again');
  assert.equal(f.d.activeElement,f.root.querySelector('h1'));
});
test('a later initialization error also releases the loading layer',async t=>{
  const f=begin();t.after(f.close);
  f.w.WCSLibraryWorkflows={create:()=>{throw Error('Unable to prepare the library.');}};
  f.respond();await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(f.root.hasAttribute('inert'),false);
  assert.match(f.root.textContent,/Unable to prepare the library/);
});
test('a timed-out request cannot later replace the retry screen with a success',async t=>{
  const f=begin('home',{timeout:true});t.after(f.close);await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
  assert.match(f.root.textContent,/Loading took too long/);
  f.respond();await tick();await tick();
  assert.match(f.root.textContent,/Loading took too long/);
});

test('shared header defines the loader without opening it on a normal Confluence page',t=>{
  const dom=new JSDOM('<main id="main-content"><h1>Native Confluence document</h1></main>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  w.eval(read('loading-overlay.js'));const api=w.WCSLoadingOverlay;
  w.eval(read('loading-overlay.js'));
  assert.equal(w.WCSLoadingOverlay,api,'Repeated header includes retain the same component');
  assert.equal(w.document.querySelector('.wcs-loading-overlay'),null);
  assert.equal(w.document.querySelector('[inert]'),null);
});
test('header component and page bundle share one loader without double initialization',async t=>{
  const f=begin('home',{header:true});t.after(f.close);
  assert.equal(f.w.WCSLoadingOverlay,f.headerAPI);
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(f.d.querySelectorAll('.wcs-loading-overlay').length,1);
  f.respond();await f.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
});
test('generated shared-header installation keeps assets global and application configuration per page',()=>{
  const header=read('wcspedia-global-header-confluence-macro.html');
  const fragments=['WCSpedia-confluence-macro.html','wcspedia-my-workspace-confluence-macro.html','wcspedia-reviewer-workspace-confluence-macro.html','wcspedia-saved-items-confluence-macro.html','wcspedia-entitlements-confluence-macro.html'];
  for(const file of fragments){
    const dom=new JSDOM(header+read('confluence-global-header/'+file));
    try{
      const d=dom.window.document;
      assert.equal(d.querySelectorAll('link[rel="stylesheet"]').length,1,file);
      assert.equal(d.querySelectorAll('#wcspedia').length,1,file);
      const sources=[...d.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
      assert.equal(sources.filter(s=>s.includes('/loading-overlay.js?')).length,1,file);
      assert.equal(sources.filter(s=>s.includes('/wcspedia.js?')).length,1,file);
      const style=new URL(d.querySelector('link').getAttribute('href'),'https://confluence.example');
      assert.ok(sources.every(src=>new URL(src,'https://confluence.example').searchParams.get('v')===style.searchParams.get('v')),'Every attachment URL shares the build revision');
    }finally{dom.window.close();}
  }
});

for(const delay of [0,220])test('leaving the landing route cancels its splash even during startup: '+delay,async t=>{
 const f=begin('home');t.after(f.close);
 if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 f.w.location.hash='#/results?q=credit';await tick();await new Promise(resolve=>setTimeout(resolve,220));
 assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
 assert.equal(f.root.hasAttribute('inert'),false);assert.notEqual(f.d.body.style.overflow,'hidden');
 f.respond();await f.ready;assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
});
