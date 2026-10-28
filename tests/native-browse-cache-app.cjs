/* Native discovery reuses short-lived authorized responses, never a stored index. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset}=require('./app-fixture.cjs');
const areaIds=dataset.areas.map(area=>area.id);
const page=(id,title)=>({id,title,url:'http://localhost:4173/confluence/pages/viewpage.action?pageId='+id,updated:'2026-10-16T09:00:00Z'});
const result=items=>({results:items,total:items.length,start:0,limit:6,nextContinuation:null});
async function setup(options={}){
  const search=[],landing=[],loads=[];
  const f=await fixture({sourceMode:true,hash:'#/',dataOverride:{...dataset,documents:[]},...options,configureWindow:w=>{
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.rootPageId='100';w.WCS_CONFIG.showConnectionStatus=false;w.WCS_CONFIG.mountGlobalTools=false;
    const session=()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],documents:{},entitlements:[]}});
    const adapter={info:()=>({}),load:async opts=>{loads.push(opts);return {...session(),discoveryOnly:options.lazy===true&&opts?.discoveryOnly===true};},loadMetrics:async()=>({}),searchPages:options=>new Promise((resolve,reject)=>search.push({options,resolve,reject})),loadLanding:options=>new Promise((resolve,reject)=>landing.push({options,resolve,reject}))};
    if(options.onAdapter)options.onAdapter(adapter,session);
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
  }});
  return {...f,search,landing,loads};
}
function snapshot(recent=[],extra={}){return {recent,areas:Object.fromEntries(areaIds.map(area=>[area,{total:1}])),recentReady:true,complete:true,...extra};}
const titles=f=>f.all('.press-card h2').map(el=>el.textContent);

test('latest cards and settled area counts appear progressively; a warmed area opens without another query',async t=>{
  const f=await setup();t.after(f.close);const pending=f.landing[0],items=[page('305','Ready native area page')];
  pending.options.onUpdate(snapshot([page('306','Latest native page')],{complete:false,areas:{[areaIds[0]]:{total:1,searchResult:result(items)}}}));
  assert.match(f.find('#native-landing-documents').textContent,/Latest native page/);
  assert.equal(f.find('#native-landing-documents').getAttribute('aria-busy'),'false');
  const focused=f.find('.featured-document h3 a');focused.focus();
  pending.options.onUpdate(snapshot([page('306','Latest native page')],{complete:false,areas:{[areaIds[0]]:{total:1,searchResult:result(items)}}}));
  assert.equal(f.d.activeElement,focused,'Other count updates do not replace the latest cards or drop keyboard focus');
  assert.equal(f.all('.area-count')[0].textContent,'1 document');assert.match(f.all('.area-count')[1].textContent,/Loading/);
  await f.navigate('#/topic/'+areaIds[0]);
  assert.deepEqual(titles(f),['Ready native area page']);assert.equal(f.search.length,0,'Ready CQL data is reused without another network round trip');
  assert.equal(pending.options.signal.aborted,true,'Unneeded landing count work yields to navigation');
  assert.equal(f.find('#native-search-results').hasAttribute('aria-busy'),false);assert.equal(f.errors.length,0);
});

test('returning to the landing page retains a completed response but its TTL and page lifecycle are bounded',async t=>{
  const f=await setup();t.after(f.close);
  f.landing[0].resolve(snapshot([page('305','Recent document')]));await tick();
  await f.navigate('#/results?tag=Loans');f.search[0].resolve(result([page('306','Loan topic')]));await tick();
  await f.navigate('#/');assert.match(f.find('#native-landing-documents').textContent,/Recent document/);assert.equal(f.landing.length,1);
  const now=f.w.Date.now;f.w.Date.now=()=>now()+31000;
  await f.navigate('#/results?tag=Loans');assert.equal(f.search.length,2,'Expired results must ask Confluence again');
  f.search[1].resolve(result([page('307','Current loan topic')]));await tick();
  await f.navigate('#/');assert.equal(f.landing.length,2,'Expired landing data is refreshed too');
  f.landing[1].resolve(snapshot([page('308','Current recent document')]));await tick();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(f.landing.length,3,'Restoring a browser-cached page rechecks authorization and data');assert.equal(f.errors.length,0);
});

test('exact filters reuse completed results; unrelated filters and failed requests never receive cached matches',async t=>{
  const f=await setup({hash:'#/results?tag=Loans'});t.after(f.close);
  f.search[0].resolve(result([page('305','Loan topic')]));await tick();
  await f.navigate('#/results?tag=Loans&year=2026');assert.equal(f.search.length,2);assert.deepEqual(titles(f),[]);
  f.search[1].reject(Error('Search temporarily unavailable'));await tick();assert.match(f.root.textContent,/temporarily unavailable/);
  await f.navigate('#/results?tag=Loans');assert.deepEqual(titles(f),['Loan topic']);assert.equal(f.search.length,2);
  await f.navigate('#/results?tag=Loans&year=2026');assert.equal(f.search.length,3,'Failures never suppress a retry');assert.deepEqual(titles(f),[]);
  assert.equal(f.errors.length,0);
});

test('focused area intent starts one request that transfers to the click; leaving cancels it',async t=>{
  const f=await setup();t.after(f.close);f.landing[0].resolve(snapshot());await tick();
  f.all('.discovery-area')[0].focus();await tick();assert.equal(f.search.length,1);const prefetch=f.search[0];
  assert.equal(prefetch.options.area,areaIds[0]);assert.equal(prefetch.options.start,0);assert.equal(prefetch.options.limit,6);
  await f.navigate('#/topic/'+areaIds[0]);assert.equal(f.search.length,1,'Click consumes the pending intent request');assert.equal(prefetch.options.signal.aborted,false);
  await f.navigate('#/topic/'+areaIds[1]);assert.equal(prefetch.options.signal.aborted,true);assert.equal(f.search.length,2);
  f.search[1].resolve(result([page('306','Current area')]));await tick();prefetch.resolve(result([page('305','Abandoned area')]));await tick();
  assert.deepEqual(titles(f),['Current area']);
  await f.navigate('#/topic/'+areaIds[0]);assert.equal(f.search.length,3,'An abandoned response cannot silently repopulate the cache');assert.deepEqual(titles(f),[]);assert.equal(f.errors.length,0);
});

test('a speculative failure stays silent and a real area click retries normally',async t=>{
  const f=await setup();t.after(f.close);f.landing[0].resolve(snapshot());await tick();
  f.all('.discovery-area')[0].focus();await tick();f.search[0].reject(Error('Prefetch failed'));await tick();
  assert.doesNotMatch(f.root.textContent,/Prefetch failed|Search unavailable/);
  await f.navigate('#/topic/'+areaIds[0]);assert.equal(f.search.length,2);
  f.search[1].resolve(result([page('305','Clicked area')]));await tick();assert.deepEqual(titles(f),['Clicked area']);assert.equal(f.errors.length,0);
});

test('a slow failed count does not erase latest documents that already loaded',async t=>{
  const f=await setup();t.after(f.close);const pending=f.landing[0];
  pending.options.onUpdate(snapshot([page('305','Already loaded latest')],{complete:false,areas:{}}));
  pending.reject(Object.assign(Error('Remaining counts timed out'),{code:'SEARCH_TIMEOUT'}));await tick();
  assert.match(f.find('#native-landing-documents').textContent,/Already loaded latest/);assert.match(f.find('#native-landing-documents').textContent,/Showing previously loaded documents/);
  assert.ok(f.find('[data-action="retry-native-landing"]'));assert.equal(f.errors.length,0);
});

test('discovery startup skips working document hydration; entering a private route waits for full authorization',async t=>{
  let full;
  const f=await setup({lazy:true,onAdapter(adapter,session){const load=adapter.load;adapter.load=opts=>opts?.discoveryOnly?load(opts):new Promise((resolve,reject)=>{full={opts,resolve,reject,session};});}});t.after(f.close);
  assert.equal(f.loads[0].discoveryOnly,true);assert.ok(f.find('.discovery-area-grid'));
  await f.navigate('#/entitlements');assert.ok(full);assert.ok(f.find('.wcs-loading-skeleton'));assert.match(f.root.textContent,/Loading your workspace/);assert.equal(f.find('.entitlements-page'),null);
  full.resolve({...full.session(),discoveryOnly:false});await tick();await tick();
  assert.equal(f.find('.wcs-page-placeholder'),null);assert.match(f.root.textContent,/Entitlements unavailable/);assert.equal(f.errors.length,0);
});

test('leaving a private hydration cancels it and stale failure cannot replace discovery',async t=>{
  let full;
  const f=await setup({lazy:true,onAdapter(adapter,session){const load=adapter.load;adapter.load=opts=>opts?.discoveryOnly?load(opts):new Promise((resolve,reject)=>{full={opts,resolve,reject,session};});}});t.after(f.close);
  await f.navigate('#/entitlements');const abandoned=full;
  await f.navigate('#/');assert.equal(abandoned.opts.signal.aborted,true);assert.ok(f.find('.discovery-area-grid'));
  abandoned.reject(Error('Old access load failed'));await tick();assert.doesNotMatch(f.root.textContent,/Old access load failed/);
  await f.navigate('#/entitlements');assert.notEqual(full,abandoned);full.reject(Error('Workspace is unavailable'));await tick();assert.match(f.root.textContent,/Workspace is unavailable/);
  f.find('[data-action="retry-workspace-session"]').click();await tick();assert.ok(f.find('.wcs-loading-skeleton'));assert.match(f.root.textContent,/Loading your workspace/);assert.notEqual(full,abandoned);assert.equal(f.errors.length,0);
});

test('native workspace navigation requests the current scope and reloads when it broadens',async t=>{
  const calls=[];
  const f=await setup({role:'mine',hash:'#/create?type=Blog',onAdapter(adapter,session){adapter.load=async opts=>{calls.push(opts);return {...session(),workspaceLoaded:true,workspaceScope:opts.workspaceScope,discoveryOnly:!!opts.discoveryOnly};};}});t.after(f.close);
  assert.equal(calls[0].workspaceScope,'create');
  await f.navigate('#/results?view=mine');await tick();assert.equal(calls.at(-1).workspaceScope,'mine');
  const count=calls.length;await f.navigate('#/results?view=mine&status=Draft');assert.equal(calls.length,count,'Local list filters reuse the current authorized scope');
  await f.navigate('#/review/doc-123');await tick();assert.equal(calls.at(-1).workspaceScope,'document:doc-123');
  await f.navigate('#/review');await tick();assert.equal(calls.at(-1).workspaceScope,'review');
  await f.navigate('#/health');await tick();assert.equal(calls.at(-1).workspaceScope,'all');assert.equal(f.errors.length,0);
});
test('switching private scopes aborts an older load and ignores its late result',async t=>{
  const requests=[];
  const f=await setup({role:'mine',hash:'#/create',onAdapter(adapter,session){let first=true;adapter.load=opts=>{if(first){first=false;return Promise.resolve({...session(),workspaceLoaded:true,workspaceScope:'create'});}return new Promise((resolve,reject)=>requests.push({opts,resolve,reject,session}));};}});t.after(f.close);
  await f.navigate('#/results?view=mine');const older=requests[0];
  await f.navigate('#/review');assert.equal(older.opts.signal.aborted,true);assert.equal(requests.at(-1).opts.workspaceScope,'review');
  older.reject(Error('Abandoned mine error'));await tick();assert.doesNotMatch(f.root.textContent,/Abandoned mine error/);
  const current=requests.at(-1);current.resolve({...current.session(),workspaceLoaded:true,workspaceScope:'review'});await tick();
  assert.equal(f.find('h1').textContent,'Reviewer workspace');assert.equal(f.errors.length,0);
});
