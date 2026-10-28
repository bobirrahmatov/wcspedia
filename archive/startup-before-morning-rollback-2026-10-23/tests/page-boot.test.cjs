'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {read}=require('./app-fixture.cjs');
function begin(t){
 const dom=new JSDOM('<body><header>Existing navbar</header><main id="wcspedia"></main></body>',{url:'https://example.com/confluence/pages/viewpage.action?pageId=123',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window;w.eval(read('loading-overlay.js'));w.eval(read('page-boot.js'));return {w,d:w.document,root:w.document.querySelector('main')};
}
test('macro opens one overlay before application scripts and hands over the same DOM instance',t=>{
 const {w,d,root}=begin(t),overlay=d.querySelector('.wcs-loading-overlay');assert.ok(overlay);assert.equal(root.childElementCount,0);assert.ok(root.hasAttribute('inert'));
 w.eval(read('loading-overlay.js'));w.eval(read('page-boot.js'));
 const loading=w.WCSPageBoot.claim(root);loading.show('Loading your page…');assert.equal(d.querySelector('.wcs-loading-overlay'),overlay);assert.equal(d.querySelectorAll('.wcs-loading-overlay').length,1);
 loading.hide();assert.equal(root.hasAttribute('inert'),false);assert.notEqual(d.body.style.overflow,'hidden');assert.equal(d.querySelector('.wcs-loading-overlay'),null);
});
test('attachment failure releases the overlay, exposes retry and blocks late startup',t=>{
 const {w,d,root}=begin(t);w.WCSPageBoot.fail('Attachment missing');
 assert.equal(d.querySelector('.wcs-loading-overlay'),null);assert.equal(root.hasAttribute('inert'),false);assert.match(root.textContent,/Attachment missing/);assert.match(root.textContent,/Try again/);assert.throws(()=>w.WCSPageBoot.claim(root),/expired/);
});
test('attachment deadline releases loading and cannot be revived by a late script',t=>{
 const dom=new JSDOM('<main id="wcspedia"></main>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let expire;
 w.setTimeout=callback=>{expire=callback;return 1;};w.eval(read('loading-overlay.js'));w.eval(read('page-boot.js'));expire();
 assert.equal(w.document.querySelector('.wcs-loading-overlay'),null);assert.match(w.document.querySelector('main').textContent,/scripts took too long/);assert.equal(w.WCSPageBoot.failed,true);
});
test('all seven upload macros bootstrap inline before the attachment scripts without extra CSS or headers',()=>{
 for(const name of ['landing','my-workspace','reviewer-workspace','saved-items','entitlements','insights','faq']){
 const dom=new JSDOM(read('confluence-upload/html/wcspedia-'+name+'.html'));try{
 const scripts=[...dom.window.document.querySelectorAll('script')];assert.match(scripts[0].textContent,/loading.show\('Loading WCSpedia/);assert.ok(!scripts[0].src);assert.equal(scripts.filter(s=>s.src).length,2);assert.ok(scripts.filter(s=>s.src).every(s=>s.getAttribute('onerror').includes('WCSPageBoot.fail')));assert.equal(dom.window.document.querySelector('style,header,nav'),null);
 }finally{dom.window.close();}}
});

 for(const scenario of ['normal','missing-marker','overwritten-global','inline-not-executed'])test('configured FAQ '+scenario+' '+'releases the immediate overlay without native data calls',async t=>{
  const dom=new JSDOM(read('confluence-ready/html/wcspedia-faq.html'),{url:'https://example.test/confluence/pages/viewpage.action?pageId=3973992401',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;let requests=0;w.fetch=()=>{requests++;throw Error('Unexpected request from static help');};
  const scripts=[...d.querySelectorAll('script')];
  if(scenario!=='inline-not-executed'){w.eval(scripts[0].textContent);assert.ok(d.querySelector('.wcs-loading-overlay'));assert.equal(w.WCS_CONFIG.pageRole,'faq');}
  else {assert.equal(w.WCS_CONFIG,undefined);scripts[0].remove();}
  if(scenario==='missing-marker')d.querySelector('#wcspedia').removeAttribute('data-wcs-page-role');
  for(const script of scripts.filter(s=>s.src)){if(scenario==='overwritten-global')w.WCS_CONFIG={pageRole:'home'};const file=new URL(script.src).pathname.split('/').pop();await w.eval(read('confluence-ready/attachments/'+file));}
  assert.equal(d.querySelector('.wcs-loading-overlay'),null);assert.equal(d.querySelectorAll('details[open]').length,10);
  assert.equal(requests,0);assert.equal(d.querySelector('main,[role="main"]').hasAttribute('inert'),false);
  assert.equal(w.WCSConfluence,undefined,'FAQ dependency bundle omits REST and workspace clients');
  assert.match(d.querySelector('.breadcrumbs a').href,/pageId=3954553300$/);
 });

test('all seven macros initialize their settings before overlay code can fail',t=>{
 for(const name of ['landing','my-workspace','reviewer-workspace','saved-items','entitlements','insights','faq']){
  const dom=new JSDOM(read('confluence-ready/html/wcspedia-'+name+'.html'),{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.WCSLoadingOverlay={create(){throw Error('Simulated host overlay failure');},skeleton(){}};
  assert.throws(()=>w.eval(w.document.querySelector('script').textContent),/Simulated host overlay failure/);
  assert.ok(w.WCS_CONFIG.pageRole);
  assert.equal(w.document.getElementById('wcspedia').wcsPageConfig,w.WCS_CONFIG);
 }
});

test('all seven page attachments initialize exact configuration when every inline script is removed',async t=>{
 for(const name of ['landing','my-workspace','reviewer-workspace','saved-items','entitlements','insights','faq']){
  const dom=new JSDOM(read('confluence-ready/html/wcspedia-'+name+'.html'),{url:'https://example.test/confluence/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
  const inline=d.querySelector('script:not([src])');
  const oracle=new JSDOM(read('confluence-ready/html/wcspedia-'+name+'.html'),{runScripts:'outside-only'});
  let expected;try{oracle.window.eval(oracle.window.document.querySelector('script:not([src])').textContent);expected=JSON.stringify(oracle.window.WCS_CONFIG);}finally{oracle.window.close();}
  inline.remove();assert.equal(w.WCS_CONFIG,undefined);assert.equal(w.WCSLoadingOverlay,undefined);assert.equal(w.WCSPageBoot,undefined);
  let requests=0;w.fetch=()=>{requests++;throw Error('Logic must not fetch');};
  await w.eval(read('confluence-ready/attachments/wcspedia-'+name+'.js'));
  assert.equal(JSON.stringify(w.WCS_CONFIG),expected,name);
  assert.ok(w.WCSPageModules[w.WCS_CONFIG.pageRole]);
  assert.equal(d.querySelectorAll('.wcs-loading-overlay').length,1);
  assert.equal(requests,0);
 }
});
test('markup settings never authorize the wrong script role or malformed data',async t=>{
 for(const invalid of ['wrong-role','malformed']){
  const dom=new JSDOM(read('confluence-ready/html/wcspedia-faq.html'),{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
  if(invalid==='malformed')d.getElementById('wcspedia').setAttribute('data-wcs-page-settings','not JSON');
  await w.eval(read('confluence-ready/attachments/wcspedia-'+(invalid==='wrong-role'?'landing':'faq')+'.js'));
  assert.match(d.querySelector('.boot-state').textContent,invalid==='wrong-role'?/does not match/:/could not be read/);
  assert.equal(w.WCSPageModules,undefined);
  assert.equal(w.WCSConfluence,undefined);
 }
});
