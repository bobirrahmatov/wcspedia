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

test('all seven macros use the restored small morning settings block and ordered attachment pair',()=>{
 for(const name of ['landing','my-workspace','reviewer-workspace','saved-items','entitlements','insights','faq']){
  const html=read('confluence-ready/html/wcspedia-'+name+'.html'),dom=new JSDOM(html,{runScripts:'outside-only'});
  try{
   const w=dom.window,d=w.document,scripts=[...d.querySelectorAll('script')];
   assert.equal(scripts.length,3);assert.ok(!scripts[0].src);
   assert.doesNotMatch(html,/WCSPageBoot|data-wcs-page-settings|wcsPageConfig|WCSLoadingOverlay/);
   assert.ok(scripts[0].textContent.length<9000);
   w.eval(scripts[0].textContent);assert.ok(w.WCS_CONFIG.pageRole);
   assert.equal(w.WCSPageBoot,undefined);assert.equal(d.querySelector('.wcs-loading-overlay'),null);
   assert.ok(scripts[1].src.endsWith('/wcspedia-'+name+'.js?api=v2'));
   assert.ok(scripts[2].src.endsWith('/wcspedia-'+name+'HTMLPage.js?api=v2'));
  }finally{dom.window.close();}
 }
});
test('configured FAQ uses restored startup, keeps ten answers closed and makes no native data calls',async t=>{
 const dom=new JSDOM(read('confluence-ready/html/wcspedia-faq.html'),{url:'https://example.test/confluence/pages/viewpage.action?pageId=3973992401',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;let requests=0;w.fetch=()=>{requests++;throw Error('FAQ must not fetch');};
 const scripts=[...d.querySelectorAll('script')];w.eval(scripts[0].textContent);
 for(const script of scripts.filter(s=>s.src)){const file=new URL(script.src).pathname.split('/').pop();await w.eval(read('confluence-ready/attachments/'+file));}
 await new Promise(resolve=>setTimeout(resolve,120));
 assert.equal(d.querySelectorAll('details').length,10);assert.equal(d.querySelectorAll('details[open]').length,0);assert.equal(requests,0);
 assert.equal(d.querySelector('.wcs-loading-overlay'),null);assert.equal(d.getElementById('wcspedia').hasAttribute('inert'),false);
 assert.equal(w.WCSConfluence,undefined);assert.match(d.querySelector('.breadcrumbs a').href,/pageId=3954553300$/);
});
test('startup generator matches the recovered 09:51 source except for retained FAQ support',()=>{
 const recovered=read('archive/startup-before-morning-rollback-2026-10-23/recovered-0951-builder.cjs')
  .replace("insights:['wcspedia-insights','Insights']}","insights:['wcspedia-insights','Insights'],faq:['wcspedia-faq','FAQs']}")
  .replace("entitlements:'REPLACE_WITH_ENTITLEMENTS_PAGE_ID'}","entitlements:'REPLACE_WITH_ENTITLEMENTS_PAGE_ID',faq:'REPLACE_WITH_FAQ_PAGE_ID'}")
  .replace('all six macros','all seven macros')
  .replace('${logic}\n  modules',"${role==='faq'?['loading-overlay.js','navigation.js','faq.js'].map(read).join('\\n;\\n'):logic}\n  modules");
 const current=read('build-confluence-upload.cjs');
 const start=current.indexOf('// Early presentation helper'),end=current.indexOf("put('attachments/wcspedia-article-engagement",start);
 assert.equal(current.slice(0,start)+current.slice(end),recovered);
});

test('restored FAQ HTML initializes through actual HTTP script loading without manual evaluation',async t=>{
 const http=require('node:http'),{VirtualConsole}=require('jsdom');
 const requests=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const server=http.createServer((req,res)=>{
  requests.push(req.url);const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/page'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body>'+read('confluence-ready/html/wcspedia-faq.html')+'</body></html>');return;}
  const name=pathname.split('/').pop();
  if(pathname.startsWith('/confluence/download/attachments/3962195316/')&&['wcspedia-faq.js','wcspedia-faqHTMLPage.js'].includes(name)){
   res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(read('confluence-ready/attachments/'+name));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const dom=await JSDOM.fromURL('http://127.0.0.1:'+server.address().port+'/page',{runScripts:'dangerously',resources:'usable',virtualConsole:vc,pretendToBeVisual:true});t.after(()=>dom.window.close());
 const deadline=Date.now()+3000;
 while(dom.window.document.querySelectorAll('details').length!==10&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 await new Promise(resolve=>setTimeout(resolve,120));
 assert.equal(dom.window.document.querySelectorAll('details').length,10);assert.equal(dom.window.document.querySelectorAll('details[open]').length,0);
 assert.equal(dom.window.WCS_CONFIG.pageRole,'faq');assert.equal(dom.window.document.querySelector('.wcs-loading-overlay'),null);
 assert.deepEqual(requests,['/page','/confluence/download/attachments/3962195316/wcspedia-faq.js?api=v2','/confluence/download/attachments/3962195316/wcspedia-faqHTMLPage.js?api=v2']);
 assert.deepEqual(errors,[]);
});
