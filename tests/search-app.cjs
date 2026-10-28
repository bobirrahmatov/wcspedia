/* Search interaction regressions against the shared deployment bundle. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {fixture,tick,dataset}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source');
const settle=()=>new Promise(resolve=>setTimeout(resolve,180));
function traceSearch(f){
  const original=f.w.WCSDiscovery,calls=[];
  f.w.WCSDiscovery={...original,searchDocuments(...args){calls.push(args[1]);return original.searchDocuments(...args);}};
  return calls;
}
test('typing a query performs one search after the pause and retains keyboard navigation',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);const calls=traceSearch(f);
  f.find('#knowledge-query').focus();
  for(const q of ['Ha','Hand','Handover'])f.input('#knowledge-query',q);
  assert.equal(calls.length,0);
  await settle();
  assert.equal(calls.length,1);assert.equal(calls[0].query,'Handover');
  assert.equal(f.find('#search-suggestions').hidden,false);
  assert.ok(f.all('#search-suggestions a').length>1);
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(f.d.activeElement,f.find('#search-suggestions a'));
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(f.find('#search-suggestions').hidden,true);
  assert.equal(f.d.activeElement,f.find('#knowledge-query'));
  assert.equal(f.errors.length,0);
});
test('Escape, clearing, blur and navigation prevent delayed suggestions from reopening',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);const calls=traceSearch(f);
  const enter=()=>{f.find('#knowledge-query').focus();f.input('#knowledge-query','Handover');};
  enter();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();
  assert.equal(calls.length,0);assert.equal(f.find('#search-suggestions').hidden,true);
  enter();f.input('#knowledge-query','');await settle();assert.equal(calls.length,0);
  enter();f.find('[data-search] button').focus();await settle();assert.equal(calls.length,0);
  enter();await f.navigate('#/results?q=credit');const afterNavigation=calls.length;
  await settle();assert.equal(calls.length,afterNavigation);assert.equal(f.find('#search-suggestions').hidden,true);
  assert.equal(f.errors.length,0);
});
test('composition waits for the completed query and submission cancels pending suggestions',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);const calls=traceSearch(f),input=f.find('#knowledge-query');
  input.focus();input.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true}));
  input.value='Handover';input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,isComposing:true}));
  await settle();assert.equal(calls.length,0);
  input.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true}));await settle();
  assert.equal(calls.length,1);assert.equal(calls[0].query,'Handover');
  f.input('#knowledge-query','credit');await f.submit('[data-search]');const afterSubmit=calls.length;
  await settle();assert.equal(calls.length,afterSubmit);assert.equal(f.find('#search-suggestions').hidden,true);
  assert.equal(new URLSearchParams(f.w.location.hash.split('?')[1]).get('q'),'credit');
  assert.equal(f.errors.length,0);
});
test('results reuse a single unfiltered discovery pass for all available facets',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);const calls=traceSearch(f);
  await f.navigate('#/results?q=NoMatchingDocument&type=Training');
  assert.equal(calls.filter(options=>!options.query).length,1);
  assert.ok(f.all('[data-filter="tag"] option').length>1,'Facet options remain available for clearing a query with no results');
  assert.equal(f.all('.press-card').length,0);
  assert.equal(f.errors.length,0);
});
async function liveSearchFixture(options={}){
  const requests=[],landing=[];
  const f=await fixture({sourceMode,hash:'#/results',...options,configureWindow:w=>{
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.rootPageId='100';
    const adapter={
      load:async()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],documents:{},entitlements:[]}}),
      loadMetrics:async()=>({}),
      loadLanding:options=>new Promise((resolve,reject)=>landing.push({options,resolve,reject})),
      searchPages:options=>new Promise((resolve,reject)=>requests.push({options,resolve,reject}))
    };
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
  }});
  return Object.assign(f,{requests,landing,currentRequest:()=>requests.filter(request=>!request.options.signal?.aborted).at(-1)});
}
function nativePage(id,title,summary='Native content absent from the JSON document snapshot.'){
  return {id,title,summary,url:'http://localhost:4173/confluence/pages/viewpage.action?pageId='+id,updated:'2026-10-16T09:00:00Z'};
}
const nativeResult=(pages,extra={})=>({results:pages,total:pages.length,start:0,limit:6,nextStart:null,nextContinuation:null,...extra});
const resultRegion=f=>f.find('.press-results');
function searchButton(f,pattern){const button=f.all('.press-results button').find(button=>pattern.test(button.textContent));assert.ok(button,'Search button '+pattern);return button;}
test('live main search immediately uses the complete native page tree and links native results',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native',dataOverride:{...dataset,documents:[]}});t.after(f.close);
  const request=f.currentRequest();assert.ok(request,'Search starts when the results route opens');
  assert.equal(request.options.scope,'tree');assert.equal(request.options.query,'native');
  assert.equal(f.find('[data-action="search-pages"]'),null,'No separate secondary search is required');
  assert.equal(f.all('.press-card').length,0,'Snapshot cards do not appear while native search loads');
  request.resolve(nativeResult([nativePage('303','Native child guide'),nativePage('304','Unlabelled native guide'),nativePage('305','Deep child page')]));await tick();
  assert.deepEqual(f.all('.press-card h2').map(el=>el.textContent),['Native child guide','Unlabelled native guide','Deep child page']);
  assert.deepEqual(f.all('.press-card h2 a').map(el=>new URL(el.href).searchParams.get('pageId')),['303','304','305']);
  assert.match(resultRegion(f).textContent,/3 results/);
  assert.equal(f.errors.length,0);
});
test('live autocomplete uses CQL and a superseded suggestion response cannot reopen old results',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);const calls=traceSearch(f);
  f.find('#knowledge-query').focus();f.input('#knowledge-query','native');await settle();
  const first=f.currentRequest();assert.ok(first);assert.equal(first.options.scope,'tree');assert.equal(first.options.query,'native');
  assert.equal(first.options.limit,6);assert.equal(first.options.start,0);
  assert.notEqual(first.options.excerpt,false,'Suggestions use the same request as the first results page');
  assert.equal(calls.length,0,'Live autocomplete never searches JSON document bodies');
  f.input('#knowledge-query','new native');assert.equal(first.options.signal.aborted,true);await settle();
  const latest=f.currentRequest();assert.notEqual(latest,first);
  latest.resolve(nativeResult([nativePage('305','New native suggestion')]));await tick();
  first.resolve(nativeResult([nativePage('304','Old native suggestion')]));await tick();
  const suggestions=f.find('#search-suggestions');assert.equal(suggestions.hidden,false);
  assert.match(suggestions.textContent,/New native suggestion/);assert.doesNotMatch(suggestions.textContent,/Old native suggestion/);
  assert.equal(new URL(suggestions.querySelector('a').href).searchParams.get('pageId'),'305');
  f.input('#knowledge-query','another');await settle();const pending=f.currentRequest();
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(pending.options.signal.aborted,true);
  pending.resolve(nativeResult([nativePage('306','Dismissed suggestion')]));await tick();
  assert.equal(suggestions.hidden,true);assert.equal(f.errors.length,0);
});
test('typed results update all six cards and retain filters without submitting',async t=>{
  const f=await liveSearchFixture({hash:'#/results?area=deal-closing&type=Guide&tag=Loans&process=Handover&region=EMEA&year=2026&sort=title'});t.after(f.close);
  f.currentRequest().resolve(nativeResult([]));await tick();
  f.find('#knowledge-query').focus();f.input('#knowledge-query',' native ');await settle();
  const suggestion=f.currentRequest();
  for(const [key,value]of Object.entries({scope:'tree',query:'native',area:'deal-closing',type:'Guide',tag:'Loans',process:'Handover',region:'EMEA',year:'2026',sort:'title',limit:6,start:0}))assert.equal(suggestion.options[key],value,key);
  const pages=Array.from({length:6},(_,index)=>nativePage(String(310+index),'Native document '+(index+1)));
  suggestion.resolve(nativeResult(pages,{total:8,nextStart:6,nextContinuation:{cql:'opaque query',limit:6,start:6}}));await tick();
  assert.equal(f.find('#search-suggestions').hidden,true);
  assert.deepEqual(f.all('.press-card h2').map(node=>node.textContent),pages.map(page=>page.title),'Typing displays the full results without submission');
  const requests=f.requests.length;
  await f.submit('[data-search]');
  assert.equal(f.requests.length,requests,'Submitting completed suggestions does not repeat the same CQL request');
  assert.deepEqual(f.all('.press-card h2').map(node=>node.textContent),pages.map(page=>page.title));
  assert.match(f.find('#native-search-count').textContent,/8 results/);assert.ok(f.find('.wcs-page-next'),'The full result metadata retains continuation controls');
  assert.equal(f.find('#native-search-results').hasAttribute('aria-busy'),false);assert.equal(f.errors.length,0);
});
test('cancelled suggestions neither reopen nor warm an abandoned query for later submission',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);
  f.find('#knowledge-query').focus();f.input('#knowledge-query','abandoned');await settle();const abandoned=f.currentRequest();
  f.input('#knowledge-query','current');await settle();const current=f.currentRequest();
  assert.equal(abandoned.options.signal.aborted,true);
  current.resolve(nativeResult([nativePage('305','Current native suggestion')]));await tick();
  abandoned.resolve(nativeResult([nativePage('306','Abandoned native suggestion')]));await tick();
  assert.doesNotMatch(f.find('#search-suggestions').textContent,/Abandoned native suggestion/);
  f.input('#knowledge-query','abandoned');await f.submit('[data-search]');
  assert.equal(f.requests.length,3,'A late cancelled response cannot populate the reuse cache');
  assert.equal(f.currentRequest().options.query,'abandoned');assert.equal(f.all('.press-card').length,0);
  f.currentRequest().resolve(nativeResult([nativePage('307','Fresh abandoned-query result')]));await tick();
  assert.deepEqual(f.all('.press-card h2').map(node=>node.textContent),['Fresh abandoned-query result']);assert.equal(f.errors.length,0);
});
test('typing yields optional landing work while retaining settled cards without area cards',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);const pending=f.landing[0],areaId=dataset.areas[0].id;
  pending.options.onUpdate({recent:[nativePage('305','Latest already loaded')],recentReady:true,complete:false,areas:{[areaId]:{total:null}}});
  assert.equal(f.all('.area-count').length,0);
  const latest=f.find('.featured-document');f.find('#knowledge-query').focus();f.input('#knowledge-query','native');
  assert.equal(pending.options.signal.aborted,true,'Optional requests yield before the search debounce expires');
  assert.equal(f.find('.featured-document'),latest,'Pausing warmups preserves already rendered latest cards');
  assert.ok(f.all('[data-native-area-count]').every(node=>node.textContent==='Browse documents'));
  assert.equal(f.find('#native-landing-documents').getAttribute('aria-busy'),'false');
  pending.options.onUpdate({recent:[nativePage('306','Stale warmup update')],recentReady:true,complete:true,areas:{[areaId]:{total:0}}});
  pending.reject(Error('Aborted warmup failed late'));await tick();
  assert.match(f.find('#native-landing-documents').textContent,/Latest already loaded/);assert.doesNotMatch(f.root.textContent,/Stale warmup update|Aborted warmup failed/);
  await settle();f.currentRequest().resolve(nativeResult([nativePage('307','Search result')]));await tick();await f.submit('[data-search]');
  await f.navigate('#/');
  assert.equal(f.landing.length,1,'Returning to a fresh partial landing does not restart optional work');
  assert.match(f.find('#native-landing-documents').textContent,/Latest already loaded/);assert.ok(f.all('[data-native-area-count]').every(node=>node.textContent==='Browse documents'));assert.equal(f.errors.length,0);
});
test('pausing landing before latest data arrives does not claim the library is empty',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);const pending=f.landing[0];
  f.find('#knowledge-query').focus();f.input('#knowledge-query','native');
  assert.equal(pending.options.signal.aborted,true);assert.doesNotMatch(f.find('#native-landing-documents').textContent,/No documents|Loading the latest/);
  assert.match(f.find('[data-action="retry-native-landing"]').textContent,/Load latest documents/);
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  f.find('[data-action="retry-native-landing"]').click();assert.equal(f.landing.length,2,'The optional latest request remains available on demand');
  f.landing[1].reject(Error('Confluence latest is unavailable'));await tick();
  assert.match(f.find('#native-landing-documents').textContent,/Confluence latest is unavailable/);assert.match(f.find('[data-action="retry-native-landing"]').textContent,/Try again/);assert.equal(f.errors.length,0);
});
test('returning home resumes an interrupted latest list without adding area cards',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);const pending=f.landing[0],areaId=dataset.areas[0].id;
  pending.options.onUpdate({recent:[],recentReady:false,complete:false,areas:{[areaId]:{total:7}}});
  f.find('#knowledge-query').focus();f.input('#knowledge-query','native');
  await f.submit('[data-search]');assert.equal(pending.options.signal.aborted,true);
  await f.navigate('#/');assert.equal(f.landing.length,2,'A new home visit resumes latest documents that never arrived');
  assert.equal(f.all('.area-count').length,0);
  f.landing[1].options.onUpdate({recent:[],recentReady:false,complete:false,areas:{}});
  assert.equal(f.all('.area-count').length,0);
  f.landing[1].resolve({recent:[nativePage('305','Resumed latest document')],recentReady:true,complete:true,areas:{[areaId]:{total:8}}});await tick();
  assert.match(f.find('#native-landing-documents').textContent,/Resumed latest document/);assert.equal(f.all('.area-count').length,0);
  pending.resolve({recent:[nativePage('306','Cancelled latest document')],areas:{}});await tick();assert.doesNotMatch(f.root.textContent,/Cancelled latest document/);assert.equal(f.errors.length,0);
});
test('Explore provides business-area filters after removing the home grid',async t=>{
    const f=await liveSearchFixture({hash:'#/'});t.after(f.close);
    assert.equal(f.landing[0].options.areaIds.length,0);
    assert.equal(f.all('.discovery-area').length,0);
    await f.navigate('#/results');
    const options=f.all('select option').map(el=>el.textContent);
    for(const area of dataset.areas)assert.ok(options.includes(area.title),area.title);
    assert.deepEqual(f.errors,[]);
});
test('later landing progress snapshots do not extend an already warmed area response TTL',async t=>{
  const f=await liveSearchFixture({hash:'#/'});t.after(f.close);const pending=f.landing[0],areaId=dataset.areas[0].id;
  const now=f.w.Date.now();let elapsed=0;f.w.Date.now=()=>now+elapsed;
  const snapshot={recent:[],recentReady:true,complete:false,areas:{[areaId]:{total:1,searchResult:nativeResult([nativePage('305','Originally warmed page')])}}};
  pending.options.onUpdate(JSON.parse(JSON.stringify(snapshot)));
  elapsed=20000;pending.options.onUpdate(JSON.parse(JSON.stringify(snapshot)));
  elapsed=30001;await f.navigate('#/topic/'+areaId);
  assert.equal(f.requests.length,1,'A cloned progress snapshot is not a fresh Confluence response');
  assert.equal(f.all('.press-card').length,0,'Expired area rows are withheld while permissions and data are checked again');
  f.currentRequest().resolve(nativeResult([nativePage('306','Fresh authorized page')]));await tick();
  assert.deepEqual(f.all('.press-card h2').map(node=>node.textContent),['Fresh authorized page']);assert.equal(f.errors.length,0);
});
test('a cancelled main CQL response cannot replace a newer response after returning to the same route',async t=>{
  const f=await liveSearchFixture();t.after(f.close);const first=f.currentRequest();assert.ok(first);
  await f.navigate('#/');assert.equal(first.options.signal.aborted,true);
  await f.navigate('#/results');const latest=f.currentRequest();assert.notEqual(latest,first);
  latest.resolve(nativeResult([nativePage('305','Latest result')]));await tick();
  first.resolve(nativeResult([nativePage('304','Stale result')]));await tick();
  assert.match(resultRegion(f).textContent,/Latest result/);assert.doesNotMatch(resultRegion(f).textContent,/Stale result/);
  assert.equal(f.all('.press-card').length,1);
  assert.equal(f.errors.length,0);
});
test('native search errors stay visible and never fall back to JSON matches; retry uses the same query',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=Handover'});t.after(f.close);
  f.currentRequest().reject(Error('Confluence search is unavailable.'));await tick();
  assert.match(resultRegion(f).textContent,/Confluence search is unavailable/);
  assert.equal(f.all('.press-card').length,0,'An outage does not silently narrow search to loaded JSON');
  searchButton(f,/Retry|Try again/i).click();
  const retry=f.currentRequest();assert.equal(retry.options.scope,'tree');assert.equal(retry.options.query,'Handover');
  retry.resolve(nativeResult([]));await tick();
  assert.match(resultRegion(f).textContent,/No matching/);assert.equal(f.all('.press-card').length,0);
  assert.equal(f.errors.length,0);
});
test('restoring a pending results page from browser history resumes the cancelled search',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native&area=deal-closing'});t.after(f.close);
  const first=f.currentRequest();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  assert.equal(first.options.signal.aborted,true);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  const restored=f.currentRequest();assert.notEqual(restored,first);
  assert.equal(restored.options.query,'native');assert.equal(restored.options.area,'deal-closing');assert.equal(restored.options.scope,'tree');
  restored.resolve(nativeResult([nativePage('305','Restored deep child result')]));await tick();
  first.resolve(nativeResult([nativePage('304','Cancelled old result')]));await tick();
  assert.deepEqual(f.all('.press-card h2').map(el=>el.textContent),['Restored deep child result']);
  assert.equal(f.find('#native-search-results').hasAttribute('aria-busy'),false);
  assert.equal(f.errors.length,0);
});
test('browser-history restoration invalidates real adapter results while ordinary navigation reuses them',async t=>{
  const calls=[];let readable=true;
  const f=await fixture({sourceMode,hash:'#/results?q=native',dataOverride:{...dataset,documents:[]},configureWindow:w=>{
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.rootPageId='100';
    const adapter=require('../confluence.js').create({mode:'confluence',rootPageId:'100',contextPath:'/confluence',nativePublication:{enabled:false}},{
      location:{href:w.location.href},DOMParser:w.DOMParser,search:require('../search.js'),fetch:async url=>{
        const target=new URL(url);calls.push(target);
        let payload;
        if(target.pathname==='/confluence/rest/api/content/100')payload={id:'100',type:'page',space:{key:'WCS'}};
        else if(target.pathname==='/confluence/rest/api/content/search')payload={results:readable?[{id:'305',type:'page',title:'Previously accessible document',space:{key:'WCS'},ancestors:[{id:'100'}],version:{number:1,when:'2026-10-16T09:00:00Z'},metadata:{labels:{results:[]}}}]:[],start:0,limit:6,_links:{}};
        else throw Error('Unexpected native read '+target.pathname);
        return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
      }
    });
    const mounted={...adapter,load:async()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],documents:{},entitlements:[]}}),loadMetrics:async()=>({})};
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>mounted}),set:()=>{}});
  }});t.after(f.close);
  const queries=()=>calls.filter(url=>url.pathname.endsWith('/content/search')).length;
  assert.deepEqual(f.all('.press-card h2').map(node=>node.textContent),['Previously accessible document']);assert.equal(queries(),1);
  await f.navigate('#/results?q=another');assert.equal(queries(),2);
  await f.navigate('#/results?q=native');assert.equal(queries(),2,'Ordinary exact-query navigation still reuses fresh results');
  readable=false;
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();await tick();
  assert.equal(queries(),3,'A restored page rechecks Confluence even inside the adapter cache TTL');
  assert.equal(calls.filter(url=>url.pathname==='/confluence/rest/api/content/100').length,2,'The restored search verifies its root scope again');
  assert.equal(f.all('.press-card').length,0);assert.doesNotMatch(resultRegion(f).textContent,/Previously accessible document/);
  assert.match(resultRegion(f).textContent,/No matching/);assert.equal(f.errors.length,0);
});
test('repeated submit while the same first-page query is pending keeps the original request',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native&area=deal-closing'});t.after(f.close);
  const first=f.currentRequest(),count=f.requests.length;
  await f.submit('[data-search]');await f.submit('[data-search]');
  assert.equal(f.requests.length,count);assert.equal(first.options.signal.aborted,false);
  assert.equal(f.find('#native-search-count').textContent,'Searching…');
  assert.doesNotMatch(resultRegion(f).textContent,/Searching WCSpedia and its child pages/);
  f.input('#knowledge-query','new native');await f.submit('[data-search]');
  assert.equal(first.options.signal.aborted,true);
  const replacement=f.currentRequest();assert.equal(replacement.options.query,'new native');assert.equal(replacement.options.area,'deal-closing');
  replacement.resolve(nativeResult([nativePage('305','New query result')]));await tick();
  assert.equal(f.all('.press-card').length,1);assert.equal(f.errors.length,0);
});
test('typing the already displayed native query does not issue a competing autocomplete search',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native'});t.after(f.close);
  const first=f.currentRequest();
  f.find('#knowledge-query').focus();f.input('#knowledge-query','native');await settle();
  assert.equal(f.requests.length,1,'Pending main request is sufficient for this query');
  first.resolve(nativeResult([nativePage('305','Native query result')]));await tick();
  f.input('#knowledge-query',' native ');await settle();
  assert.equal(f.requests.length,1,'Visible results are sufficient for the same trimmed query');
  assert.equal(f.find('#search-suggestions').hidden,true);
  f.input('#knowledge-query','new native');await settle();
  assert.equal(f.requests.length,2);assert.equal(f.currentRequest().options.query,'new native');
  assert.equal(f.errors.length,0);
});
test('a search deadline leaves a retryable error instead of an indefinite loading state',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native'});t.after(f.close);
  const first=f.currentRequest(),error=Object.assign(Error('Confluence search took too long. Try again.'),{code:'SEARCH_TIMEOUT'});
  first.reject(error);await tick();
  assert.equal(first.options.signal.aborted,false,'An adapter deadline does not cancel the UI caller');
  assert.equal(f.find('#native-search-count').textContent,'Search unavailable');
  assert.equal(f.find('#native-search-results').hasAttribute('aria-busy'),false);
  assert.match(resultRegion(f).textContent,/took too long/);
  searchButton(f,/Try again/).click();const retry=f.currentRequest();
  assert.notEqual(retry,first);assert.equal(retry.options.query,'native');assert.equal(retry.options.scope,'tree');
  retry.resolve(nativeResult([nativePage('305','Successful retry')]));await tick();
  assert.match(resultRegion(f).textContent,/Successful retry/);assert.equal(f.errors.length,0);
});
test('CQL pagination retains every filter and changing a filter cancels an old continuation',async t=>{
  const hash='#/results?q=Handover&area=deal-closing&type=Guide&tag=Knowledge+quality&process=Handover&region=EMEA&year=2026&sort=title';
  const f=await liveSearchFixture({hash});t.after(f.close);
  const first=f.currentRequest();
  for(const [key,value]of Object.entries({scope:'tree',query:'Handover',area:'deal-closing',type:'Guide',tag:'Knowledge quality',process:'Handover',region:'EMEA',year:'2026',sort:'title'}))assert.equal(first.options[key],value,key);
  const continuation={cql:'opaque generated query',limit:first.options.limit,start:1};
  first.resolve(nativeResult([nativePage('304','First filtered page')],{total:3,nextStart:1,nextContinuation:continuation}));await tick();
  f.find('.wcs-page-next').click();await tick();await tick();const second=f.currentRequest();
  for(const key of ['scope','query','area','type','tag','process','region','year','sort'])assert.equal(second.options[key],first.options[key],key+' is retained');
  assert.deepEqual(JSON.parse(JSON.stringify(second.options.continuation)),continuation);
  second.resolve(nativeResult([nativePage('305','Second filtered page')],{total:3,start:1,nextStart:2,nextContinuation:{...continuation,start:2}}));await tick();
  assert.deepEqual(f.all('.press-card h2').map(el=>el.textContent),['Second filtered page']);
  assert.ok(f.find('.wcs-page-previous'),'An earlier page remains reachable');
  f.find('.wcs-page-next').click();await tick();await tick();const obsolete=f.currentRequest();
  const type=f.find('[data-filter="type"]');type.value='Training';type.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();
  assert.equal(obsolete.options.signal.aborted,true);
  const replacement=f.currentRequest();assert.equal(replacement.options.type,'Training');assert.equal(replacement.options.continuation==null,true);assert.equal(replacement.options.start||0,0);
  replacement.resolve(nativeResult([nativePage('306','New filtered training')]));await tick();
  obsolete.resolve(nativeResult([nativePage('307','Old continuation page')]));await tick();
  assert.deepEqual(f.all('.press-card h2').map(el=>el.textContent),['New filtered training']);
  assert.equal(f.errors.length,0);
});
test('cursor pagination does not invent result ordinals after a partial page',async t=>{
  const f=await liveSearchFixture({hash:'#/results?q=native'});t.after(f.close);
  const first=f.currentRequest(),continuation={cql:'opaque generated query',limit:first.options.limit,cursor:'native-next'};
  first.resolve(nativeResult([nativePage('304','First native page'),nativePage('305','Second native page')],{total:4,nextStart:null,nextContinuation:continuation}));await tick();
  f.find('.wcs-page-next').click();await tick();await tick();
  const next=f.currentRequest();assert.deepEqual(JSON.parse(JSON.stringify(next.options.continuation)),continuation);
  next.resolve(nativeResult([nativePage('306','Third native page'),nativePage('307','Fourth native page')],{total:4,start:null}));await tick();
  assert.match(f.find('#native-search-count').textContent,/4 results/);
  const pagination=f.find('.discovery-pagination').textContent;
  assert.match(pagination,/2 results on this page/);
  assert.doesNotMatch(pagination,/Showing 7[–-]8|7[–-]8 of 4/);
  assert.equal(f.all('.press-card').length,2);assert.equal(f.errors.length,0);
});
test('business-area routes use native CQL while personal workspace searches retain their working versions',async t=>{
  const f=await liveSearchFixture({hash:'#/topic/deal-closing'});t.after(f.close);
  assert.equal(f.currentRequest().options.area,'deal-closing');assert.equal(f.currentRequest().options.scope,'tree');
  f.currentRequest().resolve(nativeResult([nativePage('305','Deep deal closing guide')]));await tick();
  assert.match(resultRegion(f).textContent,/Deep deal closing guide/);
  const mine=await liveSearchFixture({role:'mine',hash:'#/results?view=mine'});t.after(mine.close);
  assert.equal(mine.requests.length,0,'Private workflow searches do not become public page-tree searches');
  assert.ok(mine.find('.workspace-page'));assert.ok(mine.find('table'),'Working documents remain available in the existing table');
  mine.find('#knowledge-query').focus();mine.input('#knowledge-query','Handover');await settle();
  assert.equal(mine.requests.length,0);assert.equal(mine.errors.length,0);
});
test('the real adapter searches the complete simulated tree across server pagination without document attachments',async t=>{
  const port=Number(process.env.WCS_SEARCH_TEST_PORT||4188),origin='http://127.0.0.1:'+port;
  const server=spawn(process.execPath,[path.join(__dirname,'../mock-confluence.cjs')],{env:{...process.env,WCS_MOCK_PORT:String(port),WCS_MOCK_ACTOR:'reader'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Native search simulation startup timed out.')),10000);
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(Error('Native search simulation exited: '+code));});
    server.stderr.on('data',chunk=>{clearTimeout(timer);reject(Error(String(chunk)));});
    server.stdout.on('data',chunk=>{if(String(chunk).includes('Local Confluence simulation:')){clearTimeout(timer);resolve();}});
  });
  const calls=[],dom=new JSDOM('');t.after(()=>dom.window.close());
  const mappings=Object.fromEntries(dataset.areas.map((area,index)=>[area.id,String(210+index)]));
  const adapter=require('../confluence.js').create({mode:'confluence',rootPageId:'100',contextPath:'/confluence',nativePublication:{enabled:false,areaPageIds:mappings}},{fetch:(url,options)=>{calls.push(new URL(url));return fetch(url,options);},location:{href:origin+'/mock-live.html'},DOMParser:dom.window.DOMParser,search:require('../search.js')});
  const ids=[];let continuation;
  for(let count=0;count<20;count++){
    const result=await adapter.searchPages({scope:'tree',sort:'title',limit:3,continuation});
    ids.push(...result.results.map(page=>page.id));
    if(!result.nextContinuation)break;continuation=result.nextContinuation;
  }
  assert.equal(new Set(ids).size,5,'All five native documents appear once, including unlabelled and nested descendants');
  assert.equal(ids.length,5);
  for(const id of ['301','302','303','304','305'])assert.ok(ids.includes(id),'Native page '+id+' is searchable');
  for(const id of ['100',...Object.values(mappings)])assert.ok(!ids.includes(id),'Navigation container '+id+' is excluded without excluding its descendants');
  assert.ok(!ids.includes('901')&&!ids.includes('902'),'Unrelated pages and other spaces are excluded');
  const query=await adapter.searchPages({scope:'tree',query:'Handover',limit:20});
  assert.deepEqual(query.results.map(page=>page.id).sort(),['304','305'],'Query results include unlabelled and nested native descendants without area navigation pages');
  const area=await adapter.searchPages({scope:'tree',area:'deal-closing',limit:20});
  assert.deepEqual(area.results.map(page=>page.id).sort(),['303','304','305'],'Native area ancestry includes unlabelled descendants without its container page');
  const training=await adapter.searchPages({scope:'tree',type:'Training',limit:20});
  assert.deepEqual(training.results.map(page=>page.id),['302','303'],'Training includes the shortlisted legacy Knowledge sharing type');
  const excluded=await adapter.searchPages({scope:'tree',excludeIds:['301'],excludeAncestorIds:['304'],limit:20});
  assert.deepEqual(excluded.results.map(page=>page.id).sort(),['302','303'],'Exact page exclusions and entire branch exclusions are distinct');
  const autocomplete=await adapter.searchPages({scope:'tree',query:'Handover',excerpt:false,limit:4});
  assert.equal(autocomplete.results.length,2);assert.ok(autocomplete.results.every(page=>page.summary===''));
  const autocompleteURL=calls.at(-1),rawAutocomplete=await (await fetch(autocompleteURL)).json();
  assert.equal(autocompleteURL.pathname,'/confluence/rest/api/content/search');
  assert.equal(autocompleteURL.searchParams.has('excerpt'),false);assert.ok(rawAutocomplete.results.every(page=>!page.body&&!page.excerpt),'Native discovery does not download page bodies or generate excerpts');
  const landing=await adapter.loadLanding({areaIds:dataset.areas.map(area=>area.id)});
  assert.equal(landing.recent.length,3);assert.equal(landing.areas['deal-closing'].total,null,'Missing Content API totals stay unknown');
  assert.equal(landing.areas['deal-closing'].searchResult.results.length,3,'The area still warms its native document cards');
  assert.ok(landing.recent.every(page=>['301','302','303','304','305'].includes(page.id)),'Latest cards contain documents, not navigation containers');
  const nativeCalls=calls.filter(url=>url.pathname.endsWith('/rest/api/content/search'));
  assert.ok(nativeCalls.length>4,'The adapter followed server pagination');
  assert.ok(nativeCalls.every(url=>url.searchParams.get('cql').includes('ancestor = 100')&&!url.searchParams.get('cql').includes('id = 100 OR')&&url.searchParams.get('cql').includes('space = "MOCK"')));
  assert.ok(nativeCalls.every(url=>!url.searchParams.get('cql').includes('wcs-status-published')),'Whole-tree searches do not require workflow labels');
  assert.ok(nativeCalls.filter(url=>url!==autocompleteURL).some(url=>String(url.searchParams.get('expand')).includes('body.storage')),'Visible cards receive published metadata in their bounded search batch');
  assert.ok(calls.every(url=>!url.pathname.includes('/attachments/')),'Native discovery never reads the JSON attachment');
});

test('first landing character shows loading immediately and completes without Enter',async t=>{
 const f=await liveSearchFixture({hash:'#/'});t.after(f.close);
 const input=f.find('#knowledge-query');input.focus();f.input('#knowledge-query','c');
 assert.equal(f.find('[data-search-loading]').hidden,false);assert.equal(f.find('form[data-search] button[type=submit]').getAttribute('aria-busy'),null);assert.equal(f.all('form[data-search] .wcs-button-spinner').length,0);assert.equal(f.find('#search-suggestions').hidden,false);assert.match(f.find('#search-suggestions').textContent,/Searching/);
 await settle();assert.equal(f.currentRequest().options.query,'c');
 f.currentRequest().resolve(nativeResult([nativePage('303','Credit approval')]));await tick();
 assert.match(f.find('#search-suggestions').textContent,/Credit approval/);assert.equal(f.find('[data-search-loading]').hidden,true);assert.equal(f.d.activeElement,input);assert.ok(['','#/'].includes(f.w.location.hash));
});
test('typing refreshes business-area results in place, cancels stale reads and preserves input and history',async t=>{
 const f=await liveSearchFixture({hash:'#/topic/deal-closing?type=Guide&page=3'});t.after(f.close);
 const old=f.currentRequest(),input=f.find('#knowledge-query'),length=f.w.history.length;input.focus();f.input('#knowledge-query','c');
 assert.equal(old.options.signal.aborted,true);assert.equal(f.find('[data-search-loading]').hidden,false);
 await settle();const first=f.currentRequest();assert.equal(first.options.start,0);assert.equal(first.options.area,'deal-closing');assert.equal(first.options.type,'Guide');
 f.input('#knowledge-query','credit');assert.equal(first.options.signal.aborted,true);await settle();const latest=f.currentRequest();
 latest.resolve(nativeResult([nativePage('307','Credit guide')]));await tick();first.resolve(nativeResult([nativePage('308','Stale guide')]));old.resolve(nativeResult([nativePage('309','Old page')]));await tick();
 assert.equal(f.find('#knowledge-query'),input);assert.equal(f.d.activeElement,input);assert.equal(input.value,'credit');assert.equal(f.w.history.length,length);assert.match(f.w.location.hash,/q=credit/);assert.doesNotMatch(f.w.location.hash,/page=/);
 assert.deepEqual(f.all('.press-card h2').map(n=>n.textContent),['Credit guide']);assert.equal(f.find('[data-search-loading]').hidden,true);
});
test('clearing or typing back to a cancelled query resumes results; blur does not strand loading',async t=>{
 const f=await liveSearchFixture({hash:'#/results?q=credit'});t.after(f.close);
 const input=f.find('#knowledge-query');input.focus();f.input('#knowledge-query','other');f.input('#knowledge-query','credit');
 f.find('[data-search] button[type=submit]').focus();await settle();assert.equal(f.requests.length,2);assert.equal(f.currentRequest().options.query,'credit');
 f.currentRequest().resolve(nativeResult([nativePage('307','Credit guide')]));await tick();assert.equal(f.find('[data-search-loading]').hidden,true);
 f.find('[data-clear-search]').click();await settle();assert.equal(f.currentRequest().options.query,'');assert.equal(f.find('#knowledge-query'),input);
 f.currentRequest().reject(Error('Search temporarily unavailable'));await tick();assert.equal(f.find('[data-search-loading]').hidden,true);assert.match(resultRegion(f).textContent,/temporarily unavailable/);
});

test('local library results refresh while typing and clearing without replacing the input',async t=>{
 const f=await fixture({sourceMode});t.after(f.close);await f.navigate('#/results');
 const input=f.find('#knowledge-query');input.focus();f.input('#knowledge-query','NoMatchingDocument');await settle();
 assert.equal(f.all('.press-card').length,0);assert.equal(f.find('#knowledge-query'),input);assert.equal(f.d.activeElement,input);assert.equal(f.find('[data-search-loading]').hidden,true);
 f.find('[data-clear-search]').click();await settle();assert.ok(f.all('.press-card').length>0);assert.equal(f.find('#knowledge-query'),input);assert.equal(f.errors.length,0);
});
