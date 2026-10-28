'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLocal, WINDOW_MS} = require('./view-counts.js');
const storageKey = 'wcspedia.views.v1';
function memory(initial) {
  const values = new Map(initial === undefined ? [] : [[storageKey, initial]]);
  return {values, getItem:key=>values.has(key)?values.get(key):null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)};
}
function snapshot(views=1) {
  return {schemaVersion:1,lastObservedAt:1000,documents:[{documentKey:'doc-1',views,viewers:[{viewerKey:'alex',lastCountedAt:1000}],requests:[]}]};
}
const failure = code => error => error && error.name === 'ViewCountsError' && error.code === code;

test('fresh storage reports zero only for requested keys and never fabricates counts', async()=>{
  const storage=memory(), service=createLocal({storage,now:()=>0});
  const counts=await service.load(['doc-1','doc-2','doc-1']);
  assert.deepEqual(Object.entries(counts),[['doc-1',0],['doc-2',0]]);
  assert.equal(storage.getItem(storageKey),null);
  assert.deepEqual(await service.record({documentKey:'doc-1',viewerKey:'alex'}),{documentKey:'doc-1',views:1,counted:true});
  assert.deepEqual(Object.entries(await service.load(['doc-2'])),[['doc-2',0]]);
  assert.deepEqual(Object.entries(await service.load([])),[]);
});

test('a view counts once per viewer and document in a rolling 30-minute window', async()=>{
  const storage=memory();let time=1000;
  let service=createLocal({storage,now:()=>time});
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex'})).counted,true);
  time+=WINDOW_MS-1;
  assert.deepEqual(await service.record({documentKey:'doc-1',viewerKey:'alex'}),{documentKey:'doc-1',views:1,counted:false});
  service=createLocal({storage,now:()=>time}); // Reloading preserves deduplication.
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex'})).views,1);
  time+=1;
  assert.deepEqual(await service.record({documentKey:'doc-1',viewerKey:'alex'}),{documentKey:'doc-1',views:2,counted:true});
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'jordan'})).views,3);
  assert.equal((await service.record({documentKey:'doc-2',viewerKey:'alex'})).views,1);
  assert.equal((await service.load(['doc-1']))['doc-1'],3);
});

test('reading metrics never records a view, and stable document keys accumulate across revisions', async()=>{
  const storage=memory(),service=createLocal({storage,now:()=>1000});
  await service.record({documentKey:'stable-key',viewerKey:'alex',version:1,title:'Original title'});
  const stored=storage.getItem(storageKey);
  await Promise.all(Array.from({length:10},()=>service.load(['stable-key'])));
  assert.equal(storage.getItem(storageKey),stored);
  assert.equal((await service.record({documentKey:'stable-key',viewerKey:'alex',version:2,title:'Changed title'})).views,1);
  assert.equal((await service.record({documentKey:'stable-key',viewerKey:'jordan',version:3})).views,2);
});

test('parallel calls and separate instances sharing storage cannot lose increments', async()=>{
  const storage=memory(),first=createLocal({storage,now:()=>1000}),second=createLocal({storage,now:()=>1000});
  const repeats=await Promise.all(Array.from({length:50},(_,index)=>(index%2?first:second).record({documentKey:'doc-1',viewerKey:'alex'})));
  assert.equal(repeats.filter(value=>value.counted).length,1);
  const distinct=await Promise.all(Array.from({length:50},(_,index)=>(index%2?first:second).record({documentKey:'doc-1',viewerKey:'viewer-'+index})));
  assert.equal(distinct.filter(value=>value.counted).length,50);
  assert.equal((await first.load(['doc-1']))['doc-1'],51);
});

test('the optional lock adapter covers the complete read-modify-write across storage wrappers', async()=>{
  const backing=memory();let queue=Promise.resolve(),active=0,peak=0,calls=0;
  function withLock(name,task) {
    assert.equal(name,'wcspedia-view-counts:'+storageKey);calls++;
    const run=queue.catch(()=>{}).then(async()=>{active++;peak=Math.max(peak,active);try{return await task();}finally{active--;}});
    queue=run;return run;
  }
  function wrapper() { return {getItem:async key=>{await Promise.resolve();return backing.getItem(key);},setItem:async(key,value)=>{await Promise.resolve();backing.setItem(key,value);},removeItem:key=>backing.removeItem(key)}; }
  const first=createLocal({storage:wrapper(),now:()=>1000,withLock}),second=createLocal({storage:wrapper(),now:()=>1000,withLock});
  await Promise.all(Array.from({length:20},(_,index)=>(index%2?first:second).record({documentKey:'doc-1',viewerKey:'viewer-'+index})));
  assert.equal((await first.load(['doc-1']))['doc-1'],20);assert.equal(peak,1);assert.equal(calls,21);
  await first.reset();assert.equal(calls,22);
});

test('request IDs make retries idempotent even after the rolling window expires', async()=>{
  const storage=memory();let time=1000;
  const service=createLocal({storage,now:()=>time});
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex',requestId:'request-1'})).views,1);
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex',requestId:'request-2'})).counted,false);
  time+=WINDOW_MS;
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex',requestId:'request-1'})).views,1);
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex',requestId:'request-2'})).views,1);
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex',requestId:'request-3'})).views,2);
  await assert.rejects(service.record({documentKey:'doc-1',viewerKey:'jordan',requestId:'request-1'}),failure('VIEW_COUNTS_INPUT'));
});

test('clock rollback cannot increment an existing document, new viewer, or new document', async()=>{
  const storage=memory();let time=1000;
  const service=createLocal({storage,now:()=>time});
  await service.record({documentKey:'doc-1',viewerKey:'alex'});
  time+=100;
  await service.record({documentKey:'doc-1',viewerKey:'alex'});
  const stored=storage.getItem(storageKey);time=1050;
  for(const input of [{documentKey:'doc-1',viewerKey:'alex'},{documentKey:'doc-1',viewerKey:'jordan'},{documentKey:'doc-2',viewerKey:'alex'}]) {
    assert.equal((await service.record(input)).counted,false);
  }
  assert.equal(storage.getItem(storageKey),stored);
  time=1000+WINDOW_MS;
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex'})).views,2);
});

test('storage read failures and malformed records are reported, never shown as zero', async()=>{
  const inaccessible=memory();inaccessible.getItem=()=>{throw new Error('Access denied');};
  await assert.rejects(createLocal({storage:inaccessible}).load(['doc-1']),failure('VIEW_COUNTS_STORAGE'));
  for(const raw of ['',undefined,'{bad','null','[]','{}',JSON.stringify({...snapshot(),schemaVersion:2}),JSON.stringify({...snapshot(),lastObservedAt:-1}),JSON.stringify({...snapshot(),lastObservedAt:Infinity})]) {
    const storage=memory();storage.getItem=()=>raw;
    await assert.rejects(createLocal({storage}).load(['doc-1']),failure('VIEW_COUNTS_CORRUPT'));
  }
});

test('corrupt counts, timestamps, duplicate keys, and malformed request history fail closed', async()=>{
  const cases=[
    state=>state.documents[0].views=-1,
    state=>state.documents[0].views=1.5,
    state=>state.documents[0].views=Number.MAX_SAFE_INTEGER+1,
    state=>state.documents[0].views=0,
    state=>state.documents[0].viewerKey='unexpected-field',
    state=>state.documents.push({...state.documents[0]}),
    state=>state.documents[0].viewers.push({...state.documents[0].viewers[0]}),
    state=>state.documents[0].viewers[0].lastCountedAt=1001,
    state=>state.documents[0].viewers[0].lastCountedAt=-1,
    state=>state.documents[0].requests.push({requestId:'request-1',viewerKey:'missing-viewer',at:1000}),
    state=>state.documents[0].requests.push({requestId:'request-1',viewerKey:'alex',at:1001}),
    state=>state.documents[0].requests.push(...Array.from({length:2},()=>({requestId:'request-1',viewerKey:'alex',at:1000})))
  ];
  for(const mutate of cases) {
    const state=snapshot();mutate(state);
    const service=createLocal({storage:memory(JSON.stringify(state))});
    await assert.rejects(service.load(['doc-1']),failure('VIEW_COUNTS_CORRUPT'));
    await assert.rejects(service.record({documentKey:'doc-1',viewerKey:'alex'}),failure('VIEW_COUNTS_CORRUPT'));
  }
});

test('write failure does not report a count or poison subsequent serialized operations', async()=>{
  const storage=memory(),save=storage.setItem;
  storage.setItem=()=>{throw new Error('Quota exceeded');};
  const service=createLocal({storage,now:()=>1000});
  await assert.rejects(service.record({documentKey:'doc-1',viewerKey:'alex'}),failure('VIEW_COUNTS_STORAGE'));
  assert.equal((await service.load(['doc-1']))['doc-1'],0);
  storage.setItem=save;
  assert.deepEqual(await service.record({documentKey:'doc-1',viewerKey:'alex'}),{documentKey:'doc-1',views:1,counted:true});
  storage.removeItem=()=>{throw new Error('Blocked');};
  await assert.rejects(service.reset(),failure('VIEW_COUNTS_STORAGE'));
  assert.equal((await service.load(['doc-1']))['doc-1'],1);
});

test('safe-integer overflow is rejected before persistence; existing duplicate views remain valid', async()=>{
  const storage=memory(JSON.stringify(snapshot(Number.MAX_SAFE_INTEGER))),service=createLocal({storage,now:()=>1000});
  assert.equal((await service.record({documentKey:'doc-1',viewerKey:'alex'})).counted,false);
  const stored=storage.getItem(storageKey);
  await assert.rejects(service.record({documentKey:'doc-1',viewerKey:'jordan'}),failure('VIEW_COUNTS_OVERFLOW'));
  assert.equal(storage.getItem(storageKey),stored);
  assert.equal((await service.load(['doc-1']))['doc-1'],Number.MAX_SAFE_INTEGER);
});

test('keys survive JSON escapes and prototype property names without collisions', async()=>{
  const storage=memory(),service=createLocal({storage,now:()=>0});
  const keys=['__proto__','constructor','toString','document "quoted" \\ slash','文書-1'];
  for(const documentKey of keys) assert.equal((await service.record({documentKey,viewerKey:'__proto__',requestId:'request "quoted" \\'})).views,1);
  const counts=await service.load(keys);
  assert.equal(Object.getPrototypeOf(counts),null);
  assert.deepEqual(Object.keys(counts),keys);
  assert.ok(Object.values(counts).every(value=>value===1));
  assert.equal({}.views,undefined);
});

test('invalid inputs and invalid clocks are rejected without writing storage', async()=>{
  const storage=memory(),service=createLocal({storage,now:()=>1000});
  assert.throws(()=>createLocal({storage:{}}),failure('VIEW_COUNTS_INPUT'));
  assert.throws(()=>createLocal({storage,key:''}),failure('VIEW_COUNTS_INPUT'));
  assert.throws(()=>createLocal({storage,now:1000}),failure('VIEW_COUNTS_INPUT'));
  assert.throws(()=>createLocal({storage,withLock:true}),failure('VIEW_COUNTS_INPUT'));
  for(const value of ['',null,undefined,123,' padded','trailing ','bad\nkey','x'.repeat(257)]) {
    await assert.rejects(service.record({documentKey:value,viewerKey:'alex'}),failure('VIEW_COUNTS_INPUT'));
    await assert.rejects(service.record({documentKey:'doc-1',viewerKey:value}),failure('VIEW_COUNTS_INPUT'));
    await assert.rejects(service.load([value]),failure('VIEW_COUNTS_INPUT'));
  }
  await assert.rejects(service.load('doc-1'),failure('VIEW_COUNTS_INPUT'));
  await assert.rejects(service.record(null),failure('VIEW_COUNTS_INPUT'));
  await assert.rejects(service.record({documentKey:'doc-1',viewerKey:'alex',requestId:''}),failure('VIEW_COUNTS_INPUT'));
  for(const value of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1000']) {
    await assert.rejects(createLocal({storage,now:()=>value}).record({documentKey:'doc-1',viewerKey:'alex'}),failure('VIEW_COUNTS_INPUT'));
  }
  assert.equal(storage.getItem(storageKey),null);
});

test('lock failures do not downgrade to an unlocked write', async()=>{
  const storage=memory();
  await assert.rejects(createLocal({storage,withLock:async()=>{throw new Error('Lock failed');}}).record({documentKey:'doc-1',viewerKey:'alex'}),/Lock failed/);
  await assert.rejects(createLocal({storage,withLock:async()=>{}}).record({documentKey:'doc-1',viewerKey:'alex'}),failure('VIEW_COUNTS_LOCK'));
  assert.equal(storage.getItem(storageKey),null);
});

test('reset removes only the local metrics record and retains unrelated storage', async()=>{
  const storage=memory();storage.setItem('workflow','unchanged');
  const service=createLocal({storage,now:()=>0});
  await service.record({documentKey:'doc-1',viewerKey:'alex'});
  await service.reset();
  assert.equal(storage.getItem(storageKey),null);assert.equal(storage.getItem('workflow'),'unchanged');
  assert.equal((await service.load(['doc-1']))['doc-1'],0);
});
