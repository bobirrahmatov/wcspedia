/* Document reading/view metrics through real app routes and controls.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs [--source]
 */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE}=require('./app-fixture.cjs');
const viewCounts=require('../view-counts.js');
const content=require('../editor-content.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const VIEW_STORE='wcspedia.views.v1';
const sourceMode=process.argv.includes('--source');
const published=dataset.documents.find(doc=>doc.publishedVersion&&doc.versions.length===1);
const revised=dataset.documents.find(doc=>doc.publishedVersion&&doc.versions.length>1);
const draft=dataset.documents.find(doc=>!doc.publishedVersion);
const url=(doc,tab='content',version=doc.publishedVersion)=>'#/document/'+doc.id+'?tab='+tab+(version?'&version='+version:'');

function readingClock(w,d){
  const originalSet=w.setTimeout.bind(w),originalClear=w.clearTimeout.bind(w),pending=new Map();let id=1000000,hidden=false;
  w.setTimeout=(callback,delay,...args)=>{if(delay!==2000)return originalSet(callback,delay,...args);const key=id++;pending.set(key,()=>callback(...args));return key;};
  w.clearTimeout=key=>{if(pending.has(key)){pending.delete(key);return;}originalClear(key);};
  Object.defineProperty(d,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
  return {pending:()=>pending.size,hide(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},async dwell(){const ready=[...pending.entries()];pending.clear();for(const [,callback]of ready)await callback();await tick();await tick();}};
}
async function setup(options={}){
  let clock;const configure=options.configureWindow;
  const f=await fixture({...options,sourceMode,configureWindow:async(w,d)=>{clock=readingClock(w,d);if(configure)await configure(w,d);}});
  return Object.assign(f,{clock});
}
const counter=f=>f.find('.insights-byline [data-document-views]');
const state=f=>{const value=f.w.localStorage.getItem(VIEW_STORE);return value===null?null:JSON.parse(value);};
const count=(f,id)=>state(f)?.documents.find(doc=>doc.documentKey===id)?.views||0;
const noErrors=f=>assert.deepEqual(f.errors.map(error=>error.message),[]);
const cardIds=f=>f.all('.press-card h2 a').map(anchor=>decodeURIComponent(new URL(anchor.href).hash.split('?')[0].split('/').at(-1)));
async function seed(w,counts){
  const store=viewCounts.createLocal({storage:w.localStorage});
  for(const [documentKey,total]of Object.entries(counts))for(let i=0;i<total;i++)await store.record({documentKey,viewerKey:'seed-reader-'+i,requestId:'seed-'+documentKey+'-'+i});
}
function interceptLocalAdapter(w,decorate){
  let installed;
  Object.defineProperty(w,'WCSViewCounts',{configurable:true,get:()=>installed,set:api=>{installed={...api,createLocal:options=>decorate(api.createLocal(options))};}});
}

(async()=>{
  let passed=0;const failures=[];
  async function check(name,run){try{await run();passed++;process.stdout.write('PASS '+name+'\n');}catch(error){failures.push(error);console.error('FAIL '+name+'\n'+error.stack);}}
  await check('a published article counts only after the visible dwell interval and updates article/card labels without a document revision',async()=>{
    const f=await setup({hash:url(published),actor:'reader'});try{
      assert.match(f.find('.insights-byline .document-reading-time').textContent,/^[1-9]\d* min read$/);
      assert.equal(counter(f).textContent,'0 demo views');assert.equal(count(f,published.id),0);assert.equal(f.clock.pending(),1);
      assert.equal(f.w.localStorage.getItem(STORE),null);await f.clock.dwell();
      assert.equal(counter(f).textContent,'1 demo view');assert.equal(counter(f).getAttribute('aria-label'),'1 demo view');assert.equal(count(f,published.id),1);assert.equal(f.clock.pending(),0);
      assert.equal(f.w.localStorage.getItem(STORE),null,'Reading must not create a document revision or approval audit');
      await f.navigate('#/results?q='+encodeURIComponent(published.versions[0].title));
      assert.match(f.find('.press-card .document-reading-time').textContent,/min read/);assert.equal(f.find('.press-card [data-document-views]').textContent,'1 demo view');
      await f.clock.dwell();assert.equal(count(f,published.id),1);noErrors(f);
    }finally{f.close();}
  });
  await check('lists, audit/history tabs, review pages, working drafts and superseded snapshots do not count as article views',async()=>{
    const data=clone(dataset),historyDoc=data.documents.find(doc=>doc.id===published.id),next=clone(historyDoc.versions[0]);
    next.version=2;next.revision=1;historyDoc.versions.push(next);historyDoc.publishedVersion=2;
    const f=await setup({hash:'#/results',actor:'alex',dataOverride:data});try{
      const routes=['#/','#/results',url(published,'audit',2),url(published,'versions',2),'#/review/'+published.id,url(draft,'content',1),url(revised,'content',revised.versions.at(-1).version),url(historyDoc,'content',1)];
      for(const route of routes){await f.navigate(route);assert.equal(f.clock.pending(),0,'No reading timer on '+route);await f.clock.dwell();}
      assert.equal(state(f),null);noErrors(f);
    }finally{f.close();}
  });
  await check('leaving quickly or hiding a tab cancels its reading interval; returning requires a new visible interval',async()=>{
    const f=await setup({hash:url(published),actor:'reader'});try{
      assert.equal(f.clock.pending(),1);await f.navigate('#/results');assert.equal(f.clock.pending(),0);await f.clock.dwell();assert.equal(state(f),null);
      await f.navigate(url(published));assert.equal(f.clock.pending(),1);f.clock.hide(true);assert.equal(f.clock.pending(),0);await f.clock.dwell();assert.equal(state(f),null);
      f.clock.hide(false);assert.equal(counter(f).textContent,'0 demo views');assert.equal(f.clock.pending(),1);await f.clock.dwell();assert.equal(count(f,published.id),1);
      f.clock.hide(true);f.clock.hide(false);await f.clock.dwell();assert.equal(count(f,published.id),1);noErrors(f);
    }finally{f.close();}
  });
  await check('same-person reopening and a fresh application load retain one counted visit, while another person gets a separate visit',async()=>{
    let stored;const f=await setup({hash:url(published),actor:'reader'});try{
      await f.clock.dwell();await f.navigate('#/results');await f.navigate(url(published));await f.clock.dwell();assert.equal(count(f,published.id),1);stored=f.w.localStorage.getItem(VIEW_STORE);noErrors(f);
    }finally{f.close();}
    const reload=await setup({hash:url(published),actor:'reader',configureWindow:w=>w.localStorage.setItem(VIEW_STORE,stored)});try{
      assert.equal(counter(reload).textContent,'1 demo view');await reload.clock.dwell();assert.equal(count(reload,published.id),1);
      const persona=reload.find('#demo-actor');persona.value='alex';persona.dispatchEvent(new reload.w.Event('change',{bubbles:true}));await tick();await reload.clock.dwell();
      assert.equal(count(reload,published.id),2);assert.equal(counter(reload).textContent,'2 demo views');noErrors(reload);
    }finally{reload.close();}
  });
  await check('all four metric sort controls order the approved snapshots while retaining search, type and area filters',async()=>{
    const data=clone(dataset),base=clone(published),area=base.area;
    data.documents=[['short',2],['medium',40],['long',450]].map(([id,length])=>{
      const doc=clone(base),v=doc.versions[0];doc.id=id;doc.type='Job aid';doc.reference='WCS-'+id;v.title='Guidance '+id;v.summary='Shared guidance';v.bodyMarkdown=Array(length).fill('evidence').join(' ');v.sections=content.toSections(v.bodyMarkdown);v.highlights=[];v.cover=null;v.assets=[];v.attachments=[];return doc;
    });
    const pending=clone(data.documents[0].versions[0]);pending.version=2;pending.status='Draft';pending.approvedAt=null;pending.bodyMarkdown=Array(2000).fill('pending').join(' ');pending.sections=content.toSections(pending.bodyMarkdown);data.documents[0].versions.push(pending);
    const excluded=clone(data.documents[1]);excluded.id='excluded';excluded.type='Blog';data.documents.push(excluded);
    const f=await setup({hash:'#/results?q=guidance&type=Job+aid&area='+area+'&page=2',actor:'reader',dataOverride:data,configureWindow:w=>seed(w,{short:3,medium:1,long:2,excluded:20})});try{
      const expected={shortest:['short','medium','long'],longest:['long','medium','short'],'most-viewed':['short','long','medium'],'least-viewed':['medium','long','short']};
      for(const [sort,ids]of Object.entries(expected)){
        const select=f.find('[data-filter="sort"]');assert.ok([...select.options].some(option=>option.value===sort));select.value=sort;select.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();
        assert.deepEqual(cardIds(f),ids,sort);const params=new URLSearchParams(f.w.location.hash.split('?')[1]);assert.equal(params.get('q'),'guidance');assert.equal(params.get('type'),'Job aid');assert.equal(params.get('area'),area);assert.equal(params.get('page'),'1');assert.equal(params.get('sort'),sort);
      }
      await f.navigate('#/results?sort=shortest&q=guidance&type=Job+aid&area='+area);
      assert.equal(f.all('.press-card .document-reading-time')[0].textContent,'1 min read');assert.equal(f.all('.press-card .document-reading-time')[1].textContent,'1 min read');assert.equal(f.all('.press-card .document-reading-time')[2].textContent,'3 min read');
      assert.equal(f.clock.pending(),0);noErrors(f);
    }finally{f.close();}
  });
  await check('view totals arriving from another page update counters and re-sort a view-sorted library',async()=>{
    const data=clone(dataset);data.documents=data.documents.filter(doc=>doc.publishedVersion).slice(0,3);
    const f=await setup({hash:'#/results?sort=most-viewed',dataOverride:data,actor:'reader'});try{
      const target=data.documents.at(-1);await seed(f.w,{[target.id]:4});f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:VIEW_STORE,newValue:f.w.localStorage.getItem(VIEW_STORE),storageArea:f.w.localStorage}));await tick();await tick();
      assert.equal(cardIds(f)[0],target.id);assert.equal(f.find('.press-card [data-document-views]').textContent,'4 demo views');noErrors(f);
    }finally{f.close();}
  });
  await check('a delayed older metrics load cannot reduce the count returned by a successful article visit',async()=>{
    let delay=false,release;
    const f=await setup({hash:url(published),actor:'reader',configureWindow:w=>interceptLocalAdapter(w,base=>({...base,load:async keys=>{const result=await base.load(keys);return delay?new Promise(resolve=>{release=()=>resolve(result);}):result;}}))});try{
      delay=true;const empty='{"schemaVersion":1,"lastObservedAt":null,"documents":[]}';f.w.localStorage.setItem(VIEW_STORE,empty);f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:VIEW_STORE,newValue:empty,storageArea:f.w.localStorage}));await tick();await tick();assert.equal(typeof release,'function');
      await f.clock.dwell();assert.equal(counter(f).textContent,'1 demo view');release();await tick();await tick();assert.equal(counter(f).textContent,'1 demo view');assert.equal(count(f,published.id),1);noErrors(f);
    }finally{f.close();}
  });
  await check('a visit response arriving after navigation reorders the visible most-viewed library',async()=>{
    const data=clone(dataset);data.documents=data.documents.filter(doc=>doc.publishedVersion).slice(0,3);
    const target=data.documents.at(-1);let release;
    const f=await setup({hash:url(target),actor:'reader',dataOverride:data,configureWindow:w=>interceptLocalAdapter(w,base=>({...base,record:async input=>{const result=await base.record(input);return new Promise(resolve=>{release=()=>resolve(result);});}}))});try{
      const recording=f.clock.dwell();await tick();await tick();assert.equal(typeof release,'function');await f.navigate('#/results?sort=most-viewed');
      release();await recording;await tick();assert.equal(cardIds(f)[0],target.id);assert.equal(f.find('.press-card [data-document-views]').textContent,'1 demo view');noErrors(f);
    }finally{f.close();}
  });
  await check('a newly published key receives a measured zero after the document store refreshes',async()=>{
    const data=clone(dataset);data.documents=[clone(published)];const added=clone(published);added.id='new-publication';added.reference='WCS-NEW-001';added.versions[0].title='Freshly published guidance';
    const f=await setup({hash:'#/results?sort=least-viewed',actor:'reader',dataOverride:data});try{
      const next={schema:3,documents:data.documents.concat(added),areas:data.areas,taxonomyRevision:data.taxonomyRevision||1,taxonomyAudit:[]};f.w.localStorage.setItem(STORE,JSON.stringify(next));f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:STORE,newValue:JSON.stringify(next),storageArea:f.w.localStorage}));await tick();await tick();
      const label=f.find('[data-document-views="new-publication"]');assert.ok(label);assert.equal(label.textContent,'0 demo views');assert.equal(f.clock.pending(),0);assert.equal(state(f),null);noErrors(f);
    }finally{f.close();}
  });
  await check('corrupt or inaccessible metrics storage displays unavailable instead of false zeroes and is never overwritten',async()=>{
    for(const inaccessible of [false,true]){
      const f=await setup({hash:'#/results?sort=most-viewed',actor:'reader',configureWindow:w=>{
        if(!inaccessible)w.localStorage.setItem(VIEW_STORE,'{"schemaVersion":1,"documents":"broken"}');
        else{const original=w.Storage.prototype.getItem;w.Storage.prototype.getItem=function(key){if(key===VIEW_STORE)throw Error('Storage unavailable');return original.call(this,key);};}
      }});try{
        assert.ok(f.all('[data-document-views]').length>0);for(const label of f.all('[data-document-views]'))assert.equal(label.textContent,'Views unavailable');assert.match(f.find('.metrics-status').textContent,/unavailable/);
        await f.navigate(url(published));assert.equal(counter(f).textContent,'Views unavailable');assert.equal(f.clock.pending(),0);await f.clock.dwell();
        if(!inaccessible)assert.equal(f.w.localStorage.getItem(VIEW_STORE),'{"schemaVersion":1,"documents":"broken"}');noErrors(f);
      }finally{f.close();}
    }
  });
  await check('failed writes do not optimistically increase the count and bounded retries end in an unavailable label',async()=>{
    let attempts=0;const f=await setup({hash:url(published),actor:'reader',configureWindow:w=>{const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key===VIEW_STORE){attempts++;throw Error('Quota exceeded');}return original.call(this,key,value);};}});try{
      assert.equal(counter(f).textContent,'0 demo views');await f.clock.dwell();assert.equal(counter(f).textContent,'0 demo views');await f.clock.dwell();
      assert.equal(attempts,2);assert.equal(counter(f).textContent,'Views unavailable');assert.equal(state(f),null);assert.equal(f.clock.pending(),0);assert.equal(f.w.localStorage.getItem(STORE),null);noErrors(f);
    }finally{f.close();}
  });
  if(failures.length)throw new AggregateError(failures,failures.length+' metrics application checks failed.');
  process.stdout.write(passed+' metrics application checks passed'+(sourceMode?' (source modules)':' (deployment bundle)')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
