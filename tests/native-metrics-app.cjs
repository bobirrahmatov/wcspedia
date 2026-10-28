/* Native metric reads stay proportional to the rendered page, not the library. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,dataset,tick}=require('./app-fixture.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function readingClock(w,d){
  const set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w),pending=new Map();let id=900000,hidden=false;
  w.setTimeout=(callback,delay,...args)=>{if(delay!==2000)return set(callback,delay,...args);const key=id++;pending.set(key,()=>callback(...args));return key;};
  w.clearTimeout=key=>pending.has(key)?pending.delete(key):clear(key);
  Object.defineProperty(d,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
  return {pending:()=>pending.size,hide(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},async dwell(){const ready=[...pending.values()];pending.clear();for(const callback of ready)await callback();await tick();await tick();}};
}
function data(){
  const value=clone(dataset),base=value.documents.find(doc=>doc.publishedVersion&&doc.versions.length===1);
  value.documents=Array.from({length:19},(_,i)=>{const doc=clone(base);doc.id='native-metric-'+i;doc.reference='WCS-METRIC-'+i;doc.authorId=doc.ownerId='alex';doc.versions[0].title='Native metric document '+String(i).padStart(2,'0');doc.confluencePageId=String(1000+i);doc.publishedConfluencePageId=String(2000+i);return doc;});
  return value;
}
async function setup(options={}){
  const documents=data(),calls={load:[],record:[],search:[]};let clock;
  const f=await fixture({sourceMode:true,role:options.role||'mine',hash:options.hash||'#/results?view=mine',dataOverride:documents,configureWindow(w,d){
    clock=readingClock(w,d);Object.assign(w.WCS_CONFIG,{mode:'confluence',authoringMode:'confluence-session',rootPageId:'100',mountGlobalTools:false});
    const adapter={info:()=>({}),load:async()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],entitlements:[],documents:Object.fromEntries(documents.documents.map(doc=>[doc.id,[{operation:'read',targetType:'page'}]]))}}),
      loadMetrics:async keys=>{calls.load.push(Array.isArray(keys)?Array.from(keys):keys);return options.loadMetrics?options.loadMetrics(keys):Object.fromEntries(keys.map(key=>[key,4]));},
      recordView:async input=>{calls.record.push({...input});return options.recordView?options.recordView(input):{documentKey:input.documentKey,views:5,counted:true};},
      searchPages:async input=>{calls.search.push(input);return {results:[],total:0,start:0,limit:6,nextContinuation:null};},
      loadLanding:async()=>({recent:[],areas:{},recentReady:true,complete:true})
    };
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
    // Saved-item and health integrations are independent of these metric tests.
    const library={load:async()=>{},tag:()=>'',report:()=>null,bookmarkButton:()=>'',tabs:()=>'',mount(){},unmount(){},destroy(){}};
    Object.defineProperty(w,'WCSLibraryWorkflows',{configurable:true,get:()=>({create:()=>library}),set:()=>{}});
    Object.defineProperty(w,'WCSSuggestions',{configurable:true,get:()=>undefined,set:()=>{}});
    if(options.configureWindow)options.configureWindow(w,d);
  }});
  assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/,f.root.textContent);
  return {...f,calls,clock,data:documents};
}
const visible=f=>[...new Set(f.all('[data-document-views]').map(el=>el.dataset.documentViews))];
const requests=f=>[...new Set(f.calls.load.flat())];
const article=f=>f.find('.insights-byline [data-document-views]');
const route=id=>'#/document/'+id+'?tab=content&version=1';
test('native workspace counts request only rendered documents and load the next page on demand',async t=>{
  const f=await setup();t.after(f.close);
  const first=visible(f);assert.equal(first.length,6);assert.deepEqual(requests(f).sort(),first.slice().sort());
  assert.ok(requests(f).length<f.data.documents.length,'Initial metrics must not enumerate every document');
  assert.ok(f.calls.load.every(keys=>Array.isArray(keys)&&keys.length<=6));
  for(const label of f.all('[data-document-views]')){assert.equal(label.textContent,'4 recorded views');assert.match(label.title,/not total Confluence traffic/);}
  assert.equal(f.clock.pending(),0);assert.deepEqual(f.calls.record,[]);
  await f.navigate('#/results?view=mine&page=2');const second=visible(f);
  assert.equal(second.length,6);assert.deepEqual(requests(f).sort(),[...new Set([...first,...second])].sort());
  assert.equal(f.calls.record.length,0);assert.deepEqual(f.errors,[]);
});
test('native workspace removes view sorting and normalizes stale view-sorted URLs',async t=>{
  const f=await setup({hash:'#/results?view=mine&sort=most-viewed'});t.after(f.close);
  const select=f.find('[data-filter="sort"]');assert.ok(select);assert.equal(select.value,'updated');
  assert.equal([...select.options].some(option=>['most-viewed','least-viewed'].includes(option.value)),false);
  assert.equal(f.find('.metrics-status'),null,'No unsupported global-count sort wait');
  assert.deepEqual(requests(f).sort(),visible(f).sort());assert.deepEqual(f.errors,[]);
});
test('native discovery does not scan managed-document counts behind CQL results',async t=>{
  const f=await setup({role:'home',hash:'#/results?q=guidance&sort=most-viewed'});t.after(f.close);
  assert.equal(f.calls.search.length,1);assert.equal(f.calls.search[0].sort,'updated');assert.deepEqual(f.calls.load,[]);assert.deepEqual(f.calls.record,[]);
  assert.equal(f.clock.pending(),0);assert.deepEqual(f.errors,[]);
});
test('native article displays confirmed recorded views and records only after the visible interval',async t=>{
  const f=await setup({role:'home',hash:route('native-metric-0')});t.after(f.close);
  assert.equal(article(f).textContent,'4 recorded views');assert.equal(f.calls.record.length,0);assert.equal(f.clock.pending(),1);
  assert.deepEqual(requests(f).sort(),visible(f).sort());
  await f.clock.dwell();assert.equal(f.calls.record.length,1);assert.equal(article(f).textContent,'5 recorded views');
  const command=f.calls.record[0];assert.equal(command.documentKey,'native-metric-0');assert.equal(command.version,1);assert.equal(command.revision,f.data.documents[0].versions[0].revision);assert.equal(command.requestId,undefined);
  await f.clock.dwell();assert.equal(f.calls.record.length,1);assert.deepEqual(f.errors,[]);
});
test('native recording failure preserves last confirmed count and does not automatically retry the write',async t=>{
  const f=await setup({role:'home',hash:route('native-metric-0'),recordView:async()=>{const error=Error('Response lost');error.code='UNKNOWN_COMMIT';throw error;}});t.after(f.close);
  await f.clock.dwell();assert.equal(f.calls.record.length,1);assert.equal(article(f).textContent,'4 recorded views');assert.match(article(f).title,/not confirmed/);
  assert.equal(f.clock.pending(),0);await f.clock.dwell();await tick();assert.equal(f.calls.record.length,1);
  assert.deepEqual(f.errors,[]);
});
test('native failed count reads show unavailable and cannot initiate a view write',async t=>{
  const f=await setup({role:'home',hash:route('native-metric-0'),loadMetrics:async()=>{throw Error('Native properties unavailable');}});t.after(f.close);
  assert.equal(article(f).textContent,'Views unavailable');assert.equal(f.clock.pending(),0);await f.clock.dwell();assert.deepEqual(f.calls.record,[]);assert.deepEqual(f.errors,[]);
});
test('native managed article resumes its visible interval after a bfcache restoration',async t=>{
  const f=await setup({role:'home',hash:route('native-metric-0')});t.after(f.close);
  assert.equal(f.clock.pending(),1);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.clock.pending(),0);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await tick();
  assert.equal(f.clock.pending(),1,'A restored visible article starts a fresh interval');
  await f.clock.dwell();assert.equal(f.calls.record.length,1);assert.deepEqual(f.errors,[]);
});
test('a delayed native count refresh cannot replace a newer confirmed recording',async t=>{
  let delayed=false,release;
  const f=await setup({role:'home',hash:route('native-metric-0'),loadMetrics:async keys=>{
    const counts=Object.fromEntries(keys.map(key=>[key,4]));
    return delayed?new Promise(resolve=>{release=()=>resolve(counts);}):counts;
  }});t.after(f.close);
  delayed=true;
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'wcspedia.governed.v4',newValue:'{}',storageArea:f.w.localStorage}));await tick();
  // A native storage event may be ignored entirely; if it triggers a refresh,
  // that old read must not replace a newer confirmed native mutation receipt.
  await f.clock.dwell();assert.equal(article(f).textContent,'5 recorded views');
  if(release){release();await tick();await tick();}
  assert.equal(article(f).textContent,'5 recorded views');assert.deepEqual(f.errors,[]);
});
