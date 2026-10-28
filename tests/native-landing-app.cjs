/* Live landing uses native child-page discovery without changing the existing layout.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/native-landing-app.cjs
 */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset}=require('./app-fixture.cjs');

const areaIds=dataset.areas.map(area=>area.id);
const nativePage=(id,title,category=areaIds[0])=>({
  id,title,summary:'Native child content independent of the reader JSON.',
  category,type:'Guide',updated:'2026-10-16T09:00:00Z',version:2,
  url:'http://localhost:4173/confluence/pages/viewpage.action?pageId='+id
});
const result=(recent=[],overrides={})=>({recent,areas:Object.fromEntries(areaIds.map((key,i)=>[key,{total:i+1}])),...overrides});
async function landingFixture(options={}){
  const requests=[],searchRequests=[];
  const f=await fixture({sourceMode:true,hash:'#/',dataOverride:{...dataset,documents:[]},...options,configureWindow:w=>{
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.rootPageId='100';
    w.WCS_CONFIG.showConnectionStatus=false;w.WCS_CONFIG.mountGlobalTools=false;
    const adapter={
      load:async()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],documents:{},entitlements:[]}}),
      loadMetrics:async()=>({}),
      loadLanding:options=>new Promise((resolve,reject)=>requests.push({options,resolve,reject})),
      searchPages:options=>new Promise((resolve,reject)=>searchRequests.push({options,resolve,reject}))
    };
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
  }});
  return Object.assign(f,{requests,searchRequests,current:()=>requests.filter(request=>!request.options.signal?.aborted).at(-1)});
}

test('live landing loads native latest documents without business-area requests',async t=>{
  const f=await landingFixture();t.after(f.close);
  assert.equal(f.requests.length,1,'The independent library bootstrap must not start landing discovery twice');
  assert.equal(f.all('.discovery-area').length,0);
  assert.equal(f.current().options.areaIds.length,0,'Home does not request removed area counts');
  assert.equal(f.find('.discovery-area-grid'),null);
  assert.equal(f.all('.featured-document').length,0,'No JSON or demo cards are shown while native pages load');
  const search=f.find('#knowledge-query');search.focus();search.value='Continue typing';
  f.current().resolve(result([nativePage('120','Native credit guide'),nativePage('121','Deeply nested training',areaIds[6])]));await tick();
  assert.equal(f.d.activeElement,search,'Background landing discovery preserves the focused search field');
  assert.equal(f.find('#knowledge-query').value,'Continue typing');
  assert.equal(f.all('.discovery-area').length,0);
  assert.equal(f.all('[data-native-area-count]').length,0);
  assert.deepEqual(f.all('.featured-document h3').map(element=>element.textContent),['Native credit guide','Deeply nested training']);
  assert.deepEqual(f.all('.featured-document h3 a').map(element=>new URL(element.href).searchParams.get('pageId')),['120','121']);
  assert.match(f.find('.featured-grid').textContent,/Updated 16 Oct 2026/);
  assert.doesNotMatch(f.find('.featured-grid').textContent,/Approved|\bviews?\b|\bmin read\b/,'Search metadata is not misrepresented as approval, views or measured reading time');
  assert.equal(f.all('header,.connection-bar,.wcs-preview-tools').length,0);
  assert.equal(f.errors.length,0);
});

test('a successfully empty native tree has an explicit empty state without demo cards',async t=>{
  const f=await landingFixture({dataOverride:dataset});t.after(f.close);
  f.current().resolve(result([],{areas:Object.fromEntries(areaIds.map(key=>[key,{total:0}]))}));await tick();
  assert.equal(f.all('.featured-document').length,0);
  assert.ok(f.all('.discovery-area [data-native-area-count]').every(element=>element.textContent.trim()==='0 documents'));
  assert.match(f.find('.featured-section').textContent,/no .*(?:pages|documents)|(?:pages|documents).*appear|nothing.*yet/i,'A truly empty native library explains why latest cards are absent');
  assert.equal(f.find('[data-action="retry-native-landing"]'),null,'A successful empty response is not an outage');
  assert.equal(f.errors.length,0);
});

test('native responses render at most three latest cards even when an older adapter returns more',async t=>{
  const f=await landingFixture();t.after(f.close);
  f.current().resolve(result(Array.from({length:6},(_,i)=>nativePage(String(120+i),'Article '+i))));await tick();
  assert.deepEqual(f.all('.featured-document h3').map(el=>el.textContent),['Article 0','Article 1','Article 2']);
  assert.equal(f.find('.discovery-area-grid'),null);assert.deepEqual(f.errors,[]);
});

test('landing failure offers a retry and never silently falls back to demo or JSON documents',async t=>{
  const f=await landingFixture({dataOverride:dataset});t.after(f.close);
  f.current().reject(Error('Native child pages are unavailable.'));await tick();
  assert.equal(f.all('.featured-document').length,0);
  assert.match(f.root.textContent,/Native child pages are unavailable/);
  assert.ok(f.all('.discovery-area [data-native-area-count]').every(element=>!/^\d+ documents?$/.test(element.textContent.trim())),'Unknown counts must not be taken from the local document snapshot');
  const retry=f.find('[data-action="retry-native-landing"]');assert.ok(retry);retry.click();
  assert.equal(f.requests.length,2);assert.equal(f.current().options.signal.aborted,false);
  f.current().resolve(result([nativePage('120','Recovered native document')]));await tick();
  assert.deepEqual(f.all('.featured-document h3').map(element=>element.textContent),['Recovered native document']);
  assert.equal(f.errors.length,0);
});

test('latest-page failure provides a retry without introducing the removed area section',async t=>{
  const f=await landingFixture();t.after(f.close);
  f.current().resolve(result([],{recentError:{code:'HTTP_ERROR',message:'Latest pages could not be loaded.'}}));await tick();
  assert.equal(f.all('.featured-document').length,0);
  assert.equal(f.find('.discovery-area-grid'),null);
  assert.match(f.root.textContent,/Latest pages could not be loaded/);
  assert.ok(f.find('[data-action="retry-native-landing"]'));
  assert.equal(f.errors.length,0);
});

test('leaving the landing page aborts discovery and an old response cannot overwrite a later visit',async t=>{
  const f=await landingFixture();t.after(f.close);const first=f.current();
  await f.navigate('#/results?q=credit');
  assert.equal(first.options.signal.aborted,true,'Navigation releases native landing work');
  assert.ok(f.find('#native-search-results'));
  first.resolve(result([nativePage('120','Stale first visit')]));await tick();
  assert.equal(f.find('.featured-grid'),null);assert.doesNotMatch(f.root.textContent,/Stale first visit/);
  await f.navigate('#/');const current=f.current();assert.notEqual(current,first);
  current.resolve(result([nativePage('121','Current landing visit')]));await tick();
  assert.deepEqual(f.all('.featured-document h3').map(element=>element.textContent),['Current landing visit']);
  assert.equal(f.errors.length,0);
});

test('a response ignored by transport cancellation cannot replace the current landing request',async t=>{
  const f=await landingFixture();t.after(f.close);const first=f.current();
  await f.navigate('#/results');await f.navigate('#/');const current=f.current();
  current.resolve(result([nativePage('121','Current native result')]));await tick();
  first.resolve(result([nativePage('120','Old native result')]));await tick();
  assert.deepEqual(f.all('.featured-document h3').map(element=>element.textContent),['Current native result']);
  assert.equal(f.errors.length,0);
});

test('returning from the browser back-forward cache resumes an interrupted landing request',async t=>{
  const f=await landingFixture();t.after(f.close);const interrupted=f.current();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  assert.equal(interrupted.options.signal.aborted,true);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();
  const resumed=f.current();assert.ok(resumed,'A restored page resumes native discovery');assert.notEqual(resumed,interrupted);
  resumed.resolve(result([nativePage('122','Restored native page')]));await tick();
  interrupted.resolve(result([nativePage('120','Interrupted old page')]));await tick();
  assert.deepEqual(f.all('.featured-document h3').map(element=>element.textContent),['Restored native page']);
  assert.equal(f.errors.length,0);
});

test('idle return coalesces events, keeps existing cards and input, and refreshes without a splash',async t=>{
  const f=await landingFixture();t.after(f.close);
  f.current().resolve(result([nativePage('120','Previously loaded')]));await tick();
  const input=f.find('#knowledge-query');input.value='Keep my query';input.focus();
  const now=f.w.Date.now();f.w.Date.now=()=>now+600000;
  f.w.dispatchEvent(new f.w.Event('focus'));f.d.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.Event('online'));await tick();
  assert.equal(f.requests.length,2);assert.equal(f.current().options.revalidateSession,true);
  assert.match(f.find('.featured-section').textContent,/Previously loaded/);
  f.current().reject(Object.assign(Error('Connection temporarily unavailable.'),{code:'NETWORK'}));await tick();
  assert.match(f.find('.featured-section').textContent,/Previously loaded/);
  assert.match(f.find('.featured-section').textContent,/Refresh unavailable/);
  assert.equal(f.find('#knowledge-query'),input);assert.equal(input.value,'Keep my query');
  f.find('[data-action="retry-native-landing"]').click();await tick();
  f.current().resolve(result([nativePage('121','Fresh result')]));await tick();
  assert.match(f.find('.featured-section').textContent,/Fresh result/);
  assert.doesNotMatch(f.find('.featured-section').textContent,/Refresh unavailable|Previously loaded/);
  assert.equal(f.errors.length,0);
});

test('partial refresh failure keeps last successful latest cards, but permission failure removes them',async t=>{
  const f=await landingFixture();t.after(f.close);
  f.current().resolve(result([nativePage('120','Last success')]));await tick();
  let now=f.w.Date.now();f.w.Date.now=()=>now+60000;
  f.w.dispatchEvent(new f.w.Event('focus'));await tick();
  f.current().resolve(result([],{recentError:{code:'HTTP_ERROR',status:503,message:'Service unavailable'}}));await tick();
  assert.match(f.find('.featured-section').textContent,/Last success/);
  f.find('[data-action="retry-native-landing"]').click();await tick();
  f.current().reject(Object.assign(Error('Sign in again.'),{status:401}));await tick();
  assert.equal(f.all('.featured-document').length,0);assert.match(f.root.textContent,/Sign in again/);
  assert.doesNotMatch(f.find('.featured-section').textContent,/No documents are available yet/);
  f.find('[data-action="retry-native-landing"]').click();await tick();
  f.current().resolve(result([]));await tick();
  assert.match(f.find('.featured-section').textContent,/No documents are available yet/);
});
