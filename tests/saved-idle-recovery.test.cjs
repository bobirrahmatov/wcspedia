'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset}=require('./app-fixture.cjs');
const doc=dataset.documents.find(d=>d.publishedVersion),version=doc.versions.find(v=>v.version===doc.publishedVersion);
async function savedFixture(){
  let loads=0,healthLoads=0,resolveHealth,win;
  const pending=[];
  const service={load:()=>{loads++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));},resolve:state=>state.available?state.bookmarks.map(b=>({documentId:b.documentId,doc,version})):[]};
  const started=fixture({sourceMode:true,role:'saved',configureWindow:w=>{
    win=w;w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.authoringMode='confluence-session';w.WCS_CONFIG.mountGlobalTools=false;
    const adapter={load:async()=>({data:w.WCSData,actorId:'alex',identity:{soeid:'AM12345',userKey:'alex'},canSubmit:false,nativePermissions:{documents:{}}}),loadMetrics:async()=>({})};
    for(const [name,value] of Object.entries({WCSSuggestions:{mount:()=>({destroy(){}})},WCSConfluence:{create:()=>adapter},WCSBookmarks:{create:()=>service},WCSHealthService:{create:()=>({load:()=>{healthLoads++;return new Promise(r=>resolveHealth=r);}})}}))Object.defineProperty(w,name,{configurable:true,get:()=>value,set:()=>{}});
  }});
  while(!pending.length)await tick();
  pending[0].resolve(state());await tick();await tick();
  const earlyText=win.document.querySelector('#wcspedia').textContent;
  resolveHealth({});const f=await started;
  return Object.assign(f,{earlyText,pending,loads:()=>loads,healthLoads:()=>healthLoads,finishHealth:()=>resolveHealth({})});
}
const state=(revision=1,bookmarks=[{documentId:doc.id}])=>({available:true,revision,bookmarks});

test('Saved items paints before unrelated health completes and resumes only its own read after idle',async t=>{
  const f=await savedFixture();t.after(f.close);
  f.pending[0].resolve(state());await tick();await tick();
  assert.match(f.earlyText,new RegExp(version.title),'Saved rows render while health remains pending');
  assert.match(f.find('tbody').textContent,new RegExp(version.title));
  f.finishHealth();await tick();
  const search=f.find('[data-library-search] input');search.value='Unsubmitted filter';search.focus();
  const now=f.w.Date.now();f.w.Date.now=()=>now+600000;
  f.w.dispatchEvent(new f.w.Event('focus'));f.d.dispatchEvent(new f.w.Event('visibilitychange'));await tick();
  assert.equal(f.loads(),2);assert.equal(f.healthLoads(),1);
  f.pending[1].reject(Object.assign(Error('Offline'),{code:'NETWORK'}));await tick();await tick();
  assert.match(f.find('tbody').textContent,new RegExp(version.title));assert.match(f.root.textContent,/Showing previously loaded saved items/);
  assert.equal(f.find('[data-library-search] input').value,'Unsubmitted filter');assert.equal(f.d.activeElement,f.find('[data-library-search] input'));
  assert.ok(f.find('[data-library-action="bookmark"]').disabled);
  f.find('[data-library-action="retry"]').click();await tick();
  f.pending[2].resolve(state(2));await tick();await tick();
  assert.doesNotMatch(f.root.textContent,/Refresh unavailable/);assert.equal(f.healthLoads(),1);
  assert.equal(f.find('[data-library-action="bookmark"]').disabled,false);
  assert.equal(f.errors.length,0);
});

test('Saved items clears old rows on auth failure and accepts genuine empty results after recovery',async t=>{
  const f=await savedFixture();t.after(f.close);f.pending[0].resolve(state());f.finishHealth();await tick();await tick();
  const now=f.w.Date.now();f.w.Date.now=()=>now+600000;f.w.dispatchEvent(new f.w.Event('focus'));await tick();
  f.pending[1].reject(Object.assign(Error('Sign in again'),{code:'AUTH_REQUIRED',status:401}));await tick();await tick();
  assert.equal(f.all('tbody tr').length,0);assert.match(f.root.textContent,/Sign in again/);assert.doesNotMatch(f.root.textContent,/No saved documents yet/);
  f.find('[data-library-action="retry"]').click();await tick();f.pending[2].resolve(state(2,[]));await tick();await tick();
  assert.match(f.root.textContent,/No saved documents yet/);assert.equal(f.errors.length,0);
});

test('Saved items revalidates when restored from the browser back-forward cache',async t=>{
  const f=await savedFixture();t.after(f.close);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();
  assert.equal(f.loads(),2);assert.equal(f.healthLoads(),1);
  f.pending[1].resolve(state(2,[]));await tick();await tick();
  assert.match(f.root.textContent,/No saved documents yet/);assert.equal(f.errors.length,0);
});
