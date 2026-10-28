'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {createStore,WINDOW_MS}=require('./view-count-store.cjs');
const command={rootPageId:'100',documentKey:'doc-one',version:1,revision:1,requestId:'request-0001',actorSOEID:'AB12345'};
test('views count once per authenticated person and document in a rolling thirty-minute window',()=>{
  let now=100;const store=createStore({now:()=>now});
  assert.equal(store.record(command).counted,true);
  now+=WINDOW_MS-1;
  assert.deepEqual(store.record({...command,requestId:'request-0002'}),{accepted:true,requestId:'request-0002',documentKey:'doc-one',views:1,counted:false});
  now+=1;
  assert.equal(store.record({...command,requestId:'request-0003'}).views,2,'exact boundary counts; refreshes did not prolong the window');
  assert.equal(store.record({...command,requestId:'request-0004',actorSOEID:'CD12345'}).views,3,'a different authenticated person counts');
  assert.equal(store.record({...command,requestId:'request-0005',documentKey:'doc-two'}).views,1,'a different document has an independent counter');
});
test('network retries remain idempotent after the thirty-minute window and payload mismatches conflict',()=>{
  let now=0;const store=createStore({now:()=>now});const first=store.record(command);
  now+=WINDOW_MS*4;
  assert.deepEqual(store.record(command),first);
  assert.equal(store.count('doc-one','100'),1);
  assert.throws(()=>store.record({...command,revision:2}),e=>e.code==='CONFLICT');
  assert.throws(()=>store.record({...command,documentKey:'doc-two'}),e=>e.code==='CONFLICT');
});
test('publication changes do not reset the document visit window and synchronous duplicate races count once',()=>{
  let now=0;const store=createStore({now:()=>now});
  const results=Array.from({length:100},(_,index)=>store.record({...command,requestId:'request-'+String(index).padStart(4,'0')}));
  assert.equal(results.filter(result=>result.counted).length,1);
  assert.equal(store.record({...command,requestId:'new-version-0001',version:2,revision:3}).counted,false);
  now+=WINDOW_MS;
  assert.equal(store.record({...command,requestId:'new-version-0002',version:2,revision:3}).views,2);
});
test('invalid trusted commands and backwards clocks fail without changing the counter',()=>{
  let now=100;const store=createStore({now:()=>now});
  for(const change of [{actorSOEID:'forged name'},{requestId:''},{version:0},{revision:1.1},{documentKey:'../one'},{rootPageId:'wrong'}])assert.throws(()=>store.record({...command,...change}));
  assert.equal(store.count('doc-one','100'),0);
  store.record(command);now=99;
  assert.throws(()=>store.record({...command,requestId:'request-other'}),e=>e.code==='CONFLICT');
  assert.equal(store.count('doc-one','100'),1);
});
