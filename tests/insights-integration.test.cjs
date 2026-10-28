/* Exercise the real app, Insights renderer, navigation and DOM bindings with
 * independently delayed native search/access/library transports. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,read,tick,dataset}=require('./app-fixture.cjs');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const identity={soeid:'AM12345',userKey:'alex',username:'AM12345',displayName:'Alex Morgan'};
const page=(id,title,type='Blog')=>({id,title,type,summary:'A short excerpt.',url:'http://localhost:4173/confluence/pages/viewpage.action?pageId='+id,updated:'2026-10-17T09:00:00Z',tags:['lending']});
const result=(items,next=null)=>({results:items,total:items.length+(next?1:0),start:0,limit:9,nextContinuation:next});
function access(who=identity,admin=false){return {
  identity:{...who},entitlementPolicy:{schemaVersion:1,revision:1,records:admin?[{id:'grant-admin',soeid:who.soeid,displayName:who.displayName||'Administrator',scope:'*',active:true,permissions:['content.create','entitlements.view','entitlements.edit']}]:[],audit:[]},
  nativePermissions:{root:[{operation:'create',targetType:'page'}],entitlements:['read','update'].map(operation=>({operation,targetType:'page'})),documents:{}}
};}
function begin({publishedArticle,hash='#/insights',config={},discussionConfig,documents=[]}={}){
  const library=deferred(),search=[],checks=[],landing=[],loads=[],articleReads=[],exports=[],blobs=[],downloads=[],revocations=[];let w,d;
  const ready=fixture({sourceMode:true,hash,dataOverride:{...dataset,documents},configureWindow:window=>{
    w=window;d=w.document;
    if(publishedArticle){w.fetch=async()=>{throw Error('Optional native fixture service unavailable');};w.eval(read('space-personal.js'));w.eval(read('article-comments.js'));}
    Object.assign(w.WCS_CONFIG,{mode:'confluence',pageRole:'insights',initialView:'insights',rootPageId:'100',spaceKey:'wcspedia',workflowEndpoint:'/confluence/rest/wcspedia/1/workflow',mountGlobalTools:false,showConnectionStatus:false},config);
    if(discussionConfig)w.WCS_ARTICLE_DISCUSSION_CONFIG=discussionConfig;
    w.URL.createObjectURL=blob=>{const href='blob:http://localhost:4173/analytics-'+(blobs.length+1);blobs.push({blob,href});return href;};
    w.URL.revokeObjectURL=href=>revocations.push(href);
    const nativeClick=w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click=function(){if(this.download){downloads.push({filename:this.download,href:this.href});return;}return nativeClick.call(this);};
    const adapter={
      info:()=>({searchSpaceKey:'wcspedia'}),
      load:async options=>{loads.push(options);return {data:w.WCSData,actorId:'alex',canSubmit:false,identity:{...identity},nativePermissions:{root:[],documents:{},entitlements:[]},discoveryOnly:true};},
      loadPublishedArticle:async(id,options)=>{articleReads.push({id,options});if(!publishedArticle)throw Error('Article unavailable');return JSON.parse(JSON.stringify(publishedArticle));},
      loadAccess:options=>{const pending=deferred();checks.push({options,...pending});return pending.promise;},
      loadMetrics:async()=>({}),
      searchPages:options=>{const pending=deferred();search.push({options,...pending});return pending.promise;},
      loadLanding:options=>{const pending=deferred();landing.push({options,...pending});return pending.promise;}
    };
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
    w.WCSArticleAnalyticsDownload={create:config=>{const pending=deferred();exports.push({config,...pending});return {collect:options=>{exports.at(-1).options=options;return pending.promise;}};}};
    let implementation;
    Object.defineProperty(w,'WCSLibraryWorkflows',{configurable:true,set:value=>{implementation=value;},get:()=>({create:options=>{
      const instance=implementation.create(options);return {...instance,load:(...args)=>library.promise.then(()=>instance.load(...args))};
    }})});
  }});
  return {ready,library,search,checks,landing,loads,articleReads,exports,blobs,downloads,revocations,get w(){return w;},get d(){return d;}};
}
async function started(t,options){const f=begin(options);t.after(()=>f.w?.close());for(let i=0;i<12&&!f.d?.querySelector('#wcs-insights-query');i++)await tick();assert.ok(f.d?.querySelector('#wcs-insights-query'),'Insights renders while independent library data is pending');return f;}
const query=f=>f.d.querySelector('#wcs-insights-query');
const titles=f=>[...f.d.querySelectorAll('.wcs-insights-card h2')].map(el=>el.textContent);
const type=f=>f.d.querySelector('[data-wcs-insights-type][aria-selected=true]')?.dataset.wcsInsightsType;
async function go(f,hash){f.w.location.hash=hash;await tick();await tick();}
test('business-area host opens scoped Explore and keeps search, pagination and reset in that area',async t=>{
 const area='credit-approval-control';
 const f=begin({hash:'',config:{pageRole:'home',initialView:'',businessArea:area,nativePublication:{areaPageIds:{[area]:'401'}}}});t.after(()=>f.w?.close());f.library.resolve();await f.ready;
 assert.equal(f.search[0].options.area,area);assert.equal(f.landing.length,0);assert.match(f.d.querySelector('h1').textContent,/Credit Approval Control/);
 f.search[0].resolve(result([page('301','Scoped child')],{start:6}));await tick();await tick();
 const reset=new URL(f.d.querySelector('.reset-link').href);assert.equal(new URLSearchParams(reset.hash.split('?')[1]).get('area'),area);
 await go(f,'#/results?q=handover&page=2');assert.equal(f.search.at(-1).options.area,area);assert.equal(f.search.at(-1).options.query,'handover');
});
test('native latest cards display the Confluence update date and time without extra page reads',async t=>{
 const f=begin({hash:'#/',config:{pageRole:'home',initialView:'home'}});t.after(()=>f.w?.close());
 f.library.resolve();await f.ready;
 for(let i=0;i<12&&!f.landing.length;i++)await tick();
 assert.equal(f.landing.length,1);
 f.landing[0].resolve({recent:[{...page('301','Older document updated today'),updated:'2026-10-23T11:45:00Z'}, {...page('302','Unknown update'),updated:null}],areas:{},recentReady:true,complete:true});
 await tick();await tick();
 const cards=f.d.querySelectorAll('.featured-document');assert.equal(cards.length,2);
 const time=cards[0].querySelector('time');assert.equal(time.dateTime,'2026-10-23T11:45:00.000Z');assert.match(time.textContent,/23 Oct 2026.*13:45/);
 assert.match(cards[1].textContent,/Update date unavailable/);assert.equal(cards[1].querySelector('time'),null);assert.equal(f.articleReads.length,0);
});
function typing(f,value){const input=query(f);input.focus();input.value=value;input.setSelectionRange(value.length,value.length);input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input;}
function assertTyping(f,value){assert.equal(query(f).value,value);assert.equal(f.d.activeElement,query(f),'A background response must preserve focus in the active search input');}

test('Insights discovery is independent of saved-item startup and library completion preserves an unfinished query',async t=>{
  const f=await started(t);assert.equal(f.loads[0].discoveryOnly,true);assert.equal(f.search.length,1);assert.equal(f.checks.length,0);
  f.search[0].resolve(result([page('301','Ready article')]));await tick();typing(f,'Keep this unfinished query');
  const requests=f.search.length;f.library.resolve();await f.ready;await tick();
  assertTyping(f,'Keep this unfinished query');assert.deepEqual(titles(f),['Ready article']);assert.equal(f.search.length,requests);
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);assert.equal(f.d.querySelector('#wcspedia').hasAttribute('inert'),false);
});

test('an independent library failure keeps Insights results and search usable',async t=>{
  const f=await started(t);f.search[0].resolve(result([page('301','Article remains available')]));await tick();typing(f,'Still typing');
  f.library.reject(Error('Saved-items service failed'));await f.ready;await tick();
  assert.ok(query(f));assertTyping(f,'Still typing');assert.deepEqual(titles(f),['Article remains available']);
  assert.doesNotMatch(f.d.querySelector('#wcspedia').textContent,/WCSpedia could not load/);
  assert.match(f.d.querySelector('#wcs-notifications').textContent,/Saved items and content health could not load/);
});

test('background search and access settlements preserve text and focus without filtering full-text matches against excerpts',async t=>{
  const f=await started(t,{hash:'#/insights?q=bodyonly'});typing(f,'My next query');
  f.search[0].resolve(result([page('301','Unrelated title with a body match')]));await tick();
  assertTyping(f,'My next query');assert.deepEqual(titles(f),['Unrelated title with a body match']);
  assert.equal(f.checks.length,0);assertTyping(f,'My next query');
  assert.equal(f.d.querySelector('[data-wcs-insights-create]'),null);assert.equal(f.d.querySelector('[data-wcs-insights-export]'),null);
  assert.deepEqual(Array.from(f.search[0].options.types),require('../editor-content.js').INSIGHT_TYPES);assert.equal(f.search[0].options.query,'bodyonly');
  f.library.resolve();await f.ready;
});

test('filter navigation aborts old requests and late responses cannot overwrite or warm the active filter',async t=>{
  const f=await started(t);const old=f.search[0];f.d.querySelector('[data-wcs-insights-type="Blog"]').click();await tick();await tick();
  assert.equal(old.options.signal.aborted,true);assert.equal(type(f),'Blog');assert.deepEqual(Array.from(f.search[1].options.types),['Blog']);
  f.search[1].resolve(result([page('302','Current blog')]));await tick();old.resolve(result([page('301','Stale insight','Reference')]));await tick();
  assert.deepEqual(titles(f),['Current blog']);await go(f,'#/insights?type=all');assert.equal(f.search.length,3,'The abandoned result must not populate the all-types cache');
  f.search[2].resolve(result([page('303','Current all-types insight')]));f.library.resolve();await f.ready;
});

test('load-more failure retains earlier cards and retry uses the same scoped continuation',async t=>{
  const f=await started(t),continuation={start:9,cql:'scoped test fixture',limit:9};
  f.search[0].resolve(result([page('301','First article')],continuation));await tick();
  f.d.querySelector('[data-wcs-insights-more]').click();await tick();assert.equal(f.search[1].options.continuation,continuation);
  f.search[1].reject(Error('Second page failed'));await tick();assert.deepEqual(titles(f),['First article']);assert.match(f.d.querySelector('[role=alert]').textContent,/Second page failed/);
  f.d.querySelector('[data-wcs-insights-retry]').click();await tick();assert.equal(f.search[2].options.continuation,continuation);
  f.search[2].resolve(result([page('301','First article'),page('302','Second article')]));await tick();
  assert.deepEqual(titles(f),['First article','Second article']);assert.equal(f.d.querySelector('[data-wcs-insights-more]'),null);
  f.library.resolve();await f.ready;
});

test('Insights omits management requests and analytics downloads and enhances Topics after every response',async t=>{
  const f=await started(t);
  assert.equal(f.checks.length,0);assert.equal(f.exports.length,0);
  assert.equal(f.d.querySelector('[data-wcs-insights-export]'),null);
  assert.equal(f.d.querySelector('[data-wcs-insights-search] button').textContent,'Search');
  assert.ok(f.d.querySelector('[data-wcs-insights-search] button .wcs-button-spinner'));
  f.search[0].resolve(result([page('301','Article')]));await tick();
  const select=f.d.querySelector('[data-wcs-insights-topic]');assert.equal(select.hidden,true);
  const trigger=f.d.querySelector('.wcs-insights-topic-filter [role=combobox]');assert.ok(trigger);trigger.click();
  assert.ok(f.d.querySelector('.wcs-ui-popover [role=option]'));
  select.value='lending';select.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();
  assert.equal(f.search[1].options.tag,'lending');assert.ok(f.d.querySelector('.wcs-insights-topic-filter [role=combobox]'));
  f.search[1].resolve(result([page('301','Article')]));f.library.resolve();await f.ready;
});
test('browser-cache restoration rechecks Insights data without starting management or analytics',async t=>{
  const f=await started(t);f.search[0].resolve(result([page('301','Before restore')]));await tick();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(f.search.length,2);assert.equal(f.checks.length,0);assert.equal(f.exports.length,0);
  f.search[1].resolve(result([page('302','After restore')]));await tick();assert.deepEqual(titles(f),['After restore']);
  f.library.resolve();await f.ready;
});

test('Insights uses only an approved projection cover matching the returned native page and version',async t=>{
  const template=dataset.documents.find(doc=>doc.type==='Blog'&&doc.publishedVersion);
  const known=(id,version)=>{const doc=JSON.parse(JSON.stringify(template));doc.id='fixture-'+id;doc.publishedConfluencePageId=id;doc.publishedConfluencePageVersion=version;doc.versions.find(item=>item.version===doc.publishedVersion).cover={src:'/confluence/download/attachments/'+id+'/approved.png',alt:'Approved cover'};return doc;};
  const matching=known('301',2),stale=known('302',2),deleted=known('303',2);deleted.deletedAt='2026-10-17T08:00:00Z';
  const f=await started(t,{documents:[matching,stale,deleted]});
  f.search[0].resolve(result([{...page('301','Approved cover'),version:2},{...page('302','Changed native page'),version:3},{...page('303','Deleted projection'),version:2},{...page('304','Unknown page'),version:2}]));await tick();
  assert.equal(f.d.querySelector('[data-wcs-insights-document="301"] img').getAttribute('src'),'/confluence/download/attachments/301/approved.png');
  for(const id of ['302','303','304'])assert.equal(f.d.querySelector('[data-wcs-insights-document="'+id+'"] img').dataset.wcsCoverDefault,'true','A stale, deleted or unknown projection cannot contribute a cover');
  assert.equal(f.search.length,1);assert.equal(f.loads.length,1,'Cover matching must not start per-card hydration');assert.equal(f.exports.length,0);
  f.library.resolve();await f.ready;
});

 test('published route renders the workspace reader without requesting private workflow data',async t=>{
 const doc=JSON.parse(JSON.stringify(dataset.documents.find(d=>d.publishedVersion)));
 doc.versions=doc.versions.filter(v=>v.version===doc.publishedVersion);doc.audit=[];doc.publicReader=true;doc.publishedConfluencePageId='701';
 const f=begin({hash:'#/published/701',publishedArticle:{document:doc,people:dataset.people},config:{pageRole:'home',initialView:'home',authoringMode:'confluence-session',nativePublication:{workingRootPageId:'600',insightsPageId:'700',areaPageIds:{loans:'400'}}}});t.after(()=>f.w?.close());
 await f.ready;await tick();
 assert.equal(f.articleReads.length,1);assert.ok(f.loads.every(l=>l.discoveryOnly===true));
 assert.equal(f.d.querySelector('.detail-page .insights-header h1')?.textContent,doc.versions[0].title,f.d.querySelector('#wcspedia').textContent);
 assert.ok(f.d.querySelector('.document-body'));assert.equal(f.d.querySelector('.document-edit-action'),null);
 assert.ok([...f.d.querySelectorAll('.tabs a')].every(a=>a.href.includes('/published/701')));
 assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
 f.library.resolve();await tick();assert.equal(f.articleReads.length,1);
 });
