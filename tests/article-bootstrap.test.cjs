'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'..','article-discussion-bootstrap.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};}
function fixture(options={}){
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="main-content">Article</div><div id="comments-section">Native comments</div></body></html>',{url:options.url||'https://example.test/confluence/pages/viewpage.action?pageId=40',runScripts:'outside-only'});
 const w=dom.window,d=w.document,calls={create:[],resolve:[],list:[],post:[],mount:[],feedback:[],destroy:0},observers=[];
 Object.defineProperty(d,'readyState',{value:'complete',configurable:true});
 if(options.markup)d.body.insertAdjacentHTML('afterbegin',options.markup);
 if(options.action){const meta=d.createElement('meta');meta.name='ajs-action';meta.content=options.action;d.head.append(meta);}
 if(options.space){const meta=d.createElement('meta');meta.name='ajs-space-key';meta.content=options.space;d.head.append(meta);}
 w.WCS_ARTICLE_DISCUSSION_CONFIG={contextPath:'/confluence',rootPageId:'10',spaceKey:'wcspedia',attachmentPageId:'11',workingRootPageId:'12',pageIds:{home:'10',mine:'13',review:'14',saved:'15',entitlements:'16'},areaPageIds:{credit:'20'},excludePageIds:['17'],excludeAncestorIds:['18'],bundleUrl:'/confluence/download/attachments/11/wcspediaArticleDiscussion.js?v=one',...options.config};
 w.IntersectionObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(host){this.host=host;}disconnect(){this.disconnected=true;}};
 const scope={pageId:'40',user:{id:'u1',displayName:'User'},canComment:true};
 function install(){
 w.WCSArticleComments={create(config){calls.create.push(config);return{resolve:async(id,args)=>{calls.resolve.push([id,args]);return options.resolve?options.resolve(id,args):scope;},list:async(id,args)=>{calls.list.push([id,args]);return{comments:[{id:'100',text:'Hello'}],nextStart:20,canComment:true,user:scope.user};},createComment:async(id,args)=>{calls.post.push([id,args]);return{id:'101',text:args.text};}};}};
 w.WCSArticleFeedback={create(config){calls.feedback.push(config);return{load:async()=>({canVote:true,vote:null}),save:async value=>({canVote:true,vote:value})};}};
 w.WCSArticleDiscussion={mount(host,config){calls.mount.push({host,config});return{destroy(){calls.destroy++;}};}};
 }
 if(options.noObserver)w.IntersectionObserver=undefined;
 if(!options.noBundle)install();w.eval(source);
 return{w,d,calls,observers,install,activate(){observers.at(-1)?.fn([{isIntersecting:true}]);},show(){w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));},hide(){w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));},close(){w.WCSArticleDiscussionBootstrap.destroy();dom.window.close();}};
}
test('interface, area root, editor, history and native bypass pages do no discovery or comment requests',async()=>{
 for(const options of [{url:'https://example.test/confluence/pages/viewpage.action?pageId=10'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=11'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=12'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=13'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=20'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=17'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=40&wcsNativeUi=1'},{url:'https://example.test/confluence/pages/viewpage.action?pageId=40&pageVersion=2'},{url:'https://example.test/confluence/pages/editpage.action?pageId=40'},{action:'pagehistory'},{markup:'<div id="wcspedia"></div>'},{markup:'<form id="editpageform"></form>'}]){
 const f=fixture(options);try{await tick();assert.equal(f.d.querySelector('[data-wcs-article-discussion-host]'),null,JSON.stringify(options));assert.equal(f.calls.resolve.length,0);assert.equal(f.d.querySelectorAll('script').length,0);}finally{f.close();}
 }
});
test('article lazyloads bundle once, coalesces activations and bridges exact scope plus comments and feedback',async()=>{
 const f=fixture({noBundle:true,config:{feedbackEndpoint:'/confluence/rest/wcspedia/feedback'}});try{
 assert.equal(f.calls.resolve.length,0);assert.equal(f.d.querySelectorAll('script').length,0);f.activate();f.activate();assert.equal(f.d.querySelectorAll('script').length,1);f.install();f.d.querySelector('script').dispatchEvent(new f.w.Event('load'));await tick();
 assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.mount.length,1);const config=f.calls.mount[0].config;assert.equal(config.lazy,false);assert.equal(config.replies,false);assert.match(config.nativeCommentsUrl,/wcsNativeUi=1/);assert.equal(f.calls.create[0].nativePublication.areaPageIds.credit,'20');assert.deepEqual(Array.from(f.calls.create[0].search.excludeAncestorIds),['18']);
 const signal=new f.w.AbortController().signal;const result=await config.adapter.load({cursor:20,signal});assert.equal(f.calls.list[0][0],'40');assert.equal(f.calls.list[0][1].start,20);assert.equal(f.calls.list[0][1].signal,signal);assert.equal(result.nextCursor,20);assert.equal(result.user.id,'u1');assert.equal(result.canComment,true);
 await config.adapter.create({text:'Posting',signal});assert.equal(f.calls.post[0][0],'40');assert.equal(f.calls.post[0][1].text,'Posting');assert.equal(f.calls.feedback[0].pageId,'40');
 assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),false);config.onLoaded();assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),true);f.activate();assert.equal(f.calls.mount.length,1);
 }finally{f.close();}
});
test('out of scope articles remove widget; transient failure keeps native comments and offers bypass',async()=>{
 for(const code of ['OUT_OF_SCOPE','FORBIDDEN','CONFIGURATION','NETWORK']){
 const f=fixture({resolve:async()=>{throw Object.assign(Error('failed'),{code});}});try{f.activate();await tick();assert.equal(f.calls.mount.length,0);assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),false);if(code==='NETWORK')assert.match(f.d.querySelector('[data-wcs-article-discussion-host] a').href,/wcsNativeUi=1/);else assert.equal(f.d.querySelector('[data-wcs-article-discussion-host]'),null);}finally{f.close();}
 }
});
test('normal bfcache lifecycle destroys view and removes only owned native-hide marker',async()=>{
 const f=fixture();try{f.activate();await tick();f.calls.mount[0].config.onLoaded();f.hide();assert.equal(f.calls.destroy,1);assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),false);assert.equal(f.d.querySelector('[data-wcs-article-discussion-host]'),null);f.show();f.activate();await tick();assert.equal(f.calls.mount.length,2);}finally{f.close();}
 const owned=fixture();try{owned.d.body.classList.add('wcs-article-discussion-active');owned.activate();await tick();owned.calls.mount[0].config.onLoaded();owned.hide();assert.equal(owned.d.body.classList.contains('wcs-article-discussion-active'),true);}finally{owned.close();}
});
test('pending activation from before bfcache cannot mount or block restored-page activation',async()=>{
 const stale=deferred();let resolves=0;const f=fixture({resolve:async()=>{resolves++;return resolves===1?stale.promise:{};}});try{f.activate();await tick();f.hide();f.show();f.activate();await tick();assert.equal(f.calls.resolve.length,2,'restored page can start immediately');assert.equal(f.calls.mount.length,1);stale.resolve({});await tick();assert.equal(f.calls.mount.length,1,'stale activation cannot mount a second view');f.calls.mount[0].config.onLoaded();assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),true);}finally{f.close();}
});
test('invalid bundle host never loads script and leaves native comments available',async()=>{
 const f=fixture({noBundle:true,config:{bundleUrl:'https://external.test/confluence/download/attachments/11/script.js'}});try{f.activate();await tick();assert.equal(f.d.querySelectorAll('script').length,0);assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),false);assert.ok(f.d.querySelector('[data-wcs-article-discussion-host] a'));}finally{f.close();}
});
test('shared header stays inert on a native page that identifies another space',async()=>{
 const f=fixture({space:'another-space',noBundle:true});try{f.activate();await tick();assert.equal(f.d.querySelector('[data-wcs-article-discussion-host]'),null);assert.equal(f.calls.resolve.length,0);assert.equal(f.d.querySelectorAll('script').length,0);}finally{f.close();}
});
test('failed discussion attachment can retry in place with a visible loading state',async()=>{
 const f=fixture({noBundle:true});try{
  const host=f.d.querySelector('[data-wcs-article-discussion-host]');
  assert.equal(host.querySelector('button'),null);
  f.activate();
  assert.equal(host.getAttribute('aria-busy'),'true');
  f.d.querySelector('script').dispatchEvent(new f.w.Event('error'));await tick();
  assert.equal(host.hasAttribute('aria-busy'),false);
  assert.match(host.textContent,/Retry loading comments/);
  assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),false);
  const url=f.w.location.href;
  host.querySelector('button').click();f.install();
  f.d.querySelector('script').dispatchEvent(new f.w.Event('load'));await tick();
  assert.equal(f.calls.mount.length,1);assert.equal(f.w.location.href,url);
  assert.equal(f.d.querySelectorAll('script').length,1);
 }finally{f.close();}
});


test('disabled discussion shows a notice without loading comments or mounting composer and hides native section',async()=>{
 const f=fixture({resolve:async()=>({commentsEnabled:false}),config:{insightsPageId:'50'}});try{f.activate();await tick();assert.equal(f.calls.mount.length,0);assert.equal(f.calls.list.length,0);assert.equal(f.calls.feedback.length,0);assert.equal(f.calls.create[0].nativePublication.insightsPageId,'50');assert.match(f.d.querySelector('[data-wcs-article-discussion-host]').textContent,/Comments are disabled/);assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),true);}finally{f.close();}
});
test('unreadable or malformed comment setting is visible and does not fall back to a composer',async()=>{
 for(const code of ['COMMENTS_SETTINGS_UNAVAILABLE','COMMENTS_SETTINGS_INVALID']){const f=fixture({resolve:async()=>{throw Object.assign(Error('Comments unavailable: setting could not be verified.'),{code});}});try{f.activate();await tick();assert.equal(f.calls.mount.length,0);assert.match(f.d.querySelector('[role=alert]').textContent,/setting could not be verified/);assert.equal(f.d.querySelector('[data-wcs-article-discussion-host] a'),null);assert.equal(f.d.body.classList.contains('wcs-article-discussion-active'),true);}finally{f.close();}}
});

for (const header of ['header', 'div id="navHeader"', 'div id="navBar"', 'div role="banner"']) {
 test('discussion ignores included header content: '+header, async()=>{
  const tag=header.split(' ')[0];
  const f=fixture({markup:'<'+header+'><div class="wiki-content"><div id="main-content">Shared navigation</div></div></'+tag+'>'});
  try {
   const host=f.d.querySelector('[data-wcs-article-discussion-host]');
   assert.ok(host);assert.equal(host.closest('header,#navHeader,#navBar,[role="banner"]'),null);
   assert.equal(host.parentElement.textContent.startsWith('Article'),true);
   f.activate();await tick();assert.equal(f.calls.resolve[0][0],'40');assert.equal(f.calls.mount.length,1);
  } finally {f.close();}
 });
}
test('header-only content cannot receive a discussion button',()=>{
 const f=fixture({markup:'<div id="navHeader"><div class="wiki-content">Header</div></div>'});
 try {f.hide();f.d.querySelector('#main-content').remove();f.show();assert.equal(f.d.querySelector('[data-wcs-article-discussion-host]'),null);assert.equal(f.calls.resolve.length,0);}finally{f.close();}
});

test('unmarked included wiki content cannot receive article controls',async()=>{
 const f=fixture({markup:'<div class="wiki-content">Included navigation</div>'});
 try {
  const host=f.d.querySelector('[data-wcs-article-discussion-host]');
  assert.equal(host.parentElement.id,'main-content');
  assert.equal(f.d.querySelector('.wiki-content').children.length,0);
  assert.equal(host.textContent,'');assert.equal(host.querySelector('button'),null);
  assert.equal(f.calls.resolve.length,0);
  f.activate();await tick();assert.equal(f.calls.mount.length,1);
 }finally{f.close();}
});
test('without IntersectionObserver article comments load automatically once',async()=>{
 const f=fixture({noObserver:true});
 try{await tick();assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.mount.length,1);assert.equal(f.d.querySelector('.wcs-discussion-load'),null);}finally{f.close();}
});
