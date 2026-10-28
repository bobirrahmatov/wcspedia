'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs');
function setup(t,id='123',path='/pages/viewpage.action'){
 const dom=new JSDOM('<meta name="ajs-page-id" content="'+id+'"><body><header>Header</header><script data-wcs-loading-pages="123,456"></script><main id="wcspedia"></main></body>',{url:'https://example.test/confluence'+path,runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 Object.defineProperty(d,'currentScript',{get:()=>d.querySelector('script')});
 w.eval(fs.readFileSync('loading-overlay.js','utf8'));w.eval(fs.readFileSync('header-loading.js','utf8'));return {w,d};
}
test('header creates one overlay and hands it to the app without touching configuration',async t=>{
 const {w,d}=setup(t),first=d.querySelector('.wcs-loading-overlay');assert.ok(first);assert.equal(w.WCS_CONFIG,undefined);
 w.eval(fs.readFileSync('loading-overlay.js','utf8'));w.eval(fs.readFileSync('header-loading.js','utf8'));
 const root=d.querySelector('main'),loader=w.WCSHeaderLoading.claim(root);assert.equal(d.querySelectorAll('.wcs-loading-overlay').length,1);assert.equal(d.querySelector('.wcs-loading-overlay'),first);assert.ok(root.hasAttribute('inert'));
 assert.equal(w.WCSHeaderLoading.claim(root),null);await loader.paint();loader.hide();assert.equal(d.querySelector('.wcs-loading-overlay'),null);assert.equal(root.hasAttribute('inert'),false);assert.equal(d.body.style.overflow,'');
});
test('header is inactive on unrelated pages and native editors',t=>{for(const [id,path] of [['999','/pages/viewpage.action'],['123','/pages/editpage.action']]){const {w,d}=setup(t,id,path);assert.equal(w.WCSHeaderLoading,undefined);assert.equal(d.querySelector('.wcs-loading-overlay'),null);}});
test('header releases on startup error and bfcache restore',async t=>{
 const {w,d}=setup(t);d.querySelector('main').innerHTML='<div class="boot-state" role="alert">Failure</div>';await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelector('.wcs-loading-overlay'),null);assert.equal(w.WCSHeaderLoading.claim(d.querySelector('main')),null);
 const other=setup(t);other.w.dispatchEvent(new other.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(other.d.querySelector('.wcs-loading-overlay'),null);
});
