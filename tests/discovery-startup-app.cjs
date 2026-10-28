/* Independent saved-item/health requests must not block authorized CQL discovery. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source');
function deferred(){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function begin({role='home',hash='#/results?q=native'}={}){
  const library=deferred(),search=[],landing=[];let w,d;
  const ready=fixture({sourceMode,role,hash,dataOverride:{...dataset,documents:[]},configureWindow:window=>{
    w=window;d=w.document;w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.rootPageId='100';
    const adapter={
      load:async()=>({data:w.WCSData,actorId:'alex',canSubmit:false,identity:{type:'known',soeid:'AM12345',userKey:'alex'},nativePermissions:{root:[],documents:{},entitlements:[]}}),
      loadMetrics:async()=>({}),
      searchPages:options=>new Promise((resolve,reject)=>search.push({options,resolve,reject})),
      loadLanding:options=>new Promise((resolve,reject)=>landing.push({options,resolve,reject}))
    };
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
    let implementation;
    Object.defineProperty(w,'WCSLibraryWorkflows',{configurable:true,set:value=>{implementation=value;},get:()=>({create:options=>{
      const instance=implementation.create(options);
      return {...instance,load:(...args)=>library.promise.then(()=>instance.load(...args))};
    }})});
  }});
  return {ready,library,search,landing,get w(){return w;},get d(){return d;}};
}
const page={id:'305',title:'Native nested document',summary:'Native page text.',url:'http://localhost:4173/confluence/pages/viewpage.action?pageId=305'};
for(const hash of ['#/','#/results?q=native'])test('native discovery is usable before saved items and health finish: '+hash,async t=>{
  const pending=begin({hash}),f=await pending.ready;t.after(f.close);
  assert.equal(f.d.querySelectorAll('.wcs-loading-overlay').length,1,'Primary content stays covered until ready');
  assert.equal(f.root.hasAttribute('inert'),true);
  assert.equal(f.root.querySelector('.wcs-loading-skeleton'),null);
  const input=f.find('#knowledge-query');assert.ok(input);
  if(hash==='#/'){
    assert.equal(pending.landing.length,1);
    pending.landing[0].resolve({recent:[page],areas:{}});
  }else{
    assert.equal(pending.search.length,1);
    pending.search[0].resolve({results:[page],total:1,start:0,limit:6,nextContinuation:null});
  }
  await tick();assert.match(f.root.textContent,/Native nested document/);
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null,'Independent library requests do not hold the overlay');
  assert.equal(f.root.hasAttribute('inert'),false);input.focus();input.value='Keep my unfinished query';
  const requestCount=pending.search.length+pending.landing.length;
  pending.library.resolve();await tick();await tick();
  assert.equal(f.find('#knowledge-query'),input,'Library completion does not replace discovery markup');
  assert.equal(input.value,'Keep my unfinished query');assert.equal(f.d.activeElement,input);
  assert.equal(pending.search.length+pending.landing.length,requestCount,'Independent completion does not restart CQL');
  assert.match(f.root.textContent,/Native nested document/);assert.equal(f.errors.length,0);
});
test('a background library failure preserves usable native results and the current query',async t=>{
  const pending=begin(),f=await pending.ready;t.after(f.close);
  pending.search[0].resolve({results:[page],total:1,start:0,limit:6,nextContinuation:null});await tick();
  const input=f.find('#knowledge-query');input.focus();input.value='Still typing';
  pending.library.reject(Error('Independent service failed.'));await tick();await tick();
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);assert.equal(f.root.hasAttribute('inert'),false);
  assert.equal(f.find('#knowledge-query'),input);assert.equal(input.value,'Still typing');assert.equal(f.d.activeElement,input);
  assert.match(f.root.textContent,/Native nested document/);assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
  assert.match(f.d.querySelector('#wcs-notifications').textContent,/Saved items and content health could not load/);
  assert.equal(pending.search.length,1);assert.equal(f.errors.length,0);
});
test('saved-item completion does not restart landing warmups paused for a search',async t=>{
  const pending=begin({hash:'#/'}),f=await pending.ready;t.after(f.close);
  const warmup=pending.landing[0],areaId=dataset.areas[0].id;
  warmup.options.onUpdate({recent:[page],recentReady:true,complete:false,areas:{[areaId]:{total:2}}});
  const latest=f.find('.featured-document'),input=f.find('#knowledge-query');input.focus();f.input('#knowledge-query','Unfinished search');
  assert.equal(warmup.options.signal.aborted,true);
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  pending.library.resolve();await tick();await tick();
  assert.equal(f.find('#knowledge-query'),input);assert.equal(input.value,'Unfinished search');assert.equal(f.d.activeElement,input);
  assert.equal(f.find('.featured-document'),latest);assert.equal(f.all('.area-count').length,0);
  assert.equal(f.all('.area-count').length,0);
  assert.equal(pending.landing.length,1);assert.equal(pending.search.length,0);assert.equal(f.errors.length,0);
});
test('workspace startup keeps the host interactive while library data finishes',async t=>{
  const pending=begin({role:'mine',hash:'#/results?view=mine'});t.after(()=>pending.w?.close());
  await tick();await tick();
  assert.equal(pending.d.querySelector('.wcs-loading-overlay'),null);
  assert.equal(pending.d.getElementById('wcspedia').hasAttribute('inert'),false);
  assert.notEqual(pending.d.body.style.overflow,'hidden');
  assert.match(pending.d.getElementById('wcspedia').textContent,/My workspace/);
  assert.equal(pending.search.length,0);assert.equal(pending.landing.length,0);
  pending.library.resolve();const f=await pending.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);assert.equal(f.root.hasAttribute('inert'),false);
  assert.match(f.root.textContent,/My workspace/);assert.equal(f.errors.length,0);
});
test('an auxiliary library failure leaves the authorized workspace usable',async t=>{
  const pending=begin({role:'mine',hash:'#/results?view=mine'});t.after(()=>pending.w?.close());
  await tick();await tick();assert.equal(pending.d.querySelector('.wcs-loading-overlay'),null);
  pending.library.reject(Error('Workspace services could not load.'));const f=await pending.ready;
  assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);assert.equal(f.root.hasAttribute('inert'),false);
  await tick();assert.match(f.root.textContent,/My workspace/);assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
  assert.match(f.d.body.textContent,/Saved items and content health could not load/);assert.equal(f.errors.length,0);
});
