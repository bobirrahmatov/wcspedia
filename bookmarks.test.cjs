'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const bookmarks = require('./bookmarks.js');
const document = id => ({id, publishedVersion:1, versions:[{version:1,revision:1,status:'Published',title:'Approved '+id},{version:2,revision:1,status:'Draft',title:'Private draft'}]});
function fixture(extra={}) {
  let docs=[document('doc-a'),document('doc-b')], denied=new Set(), clock=Date.parse('2026-10-15T09:00:00.000Z'), writes=0;
  const memory=new Map(), storage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>{writes++;memory.set(key,value);}};
  const options={mode:'embedded',storage,key:'test.bookmarks',identity:{soeid:'am12345'},getDocuments:()=>docs,canRead:doc=>!denied.has(doc.id),now:()=>clock,...extra};
  return {memory,storage,options,create:changes=>bookmarks.create({...options,...changes}),docs,denied,setDocs:next=>docs=next,setClock:value=>clock=value,writes:()=>writes};
}
const command=(expectedRevision,requestId='request-00000001')=>({expectedRevision,requestId});
test('save/remove uses stable IDs, returns newest first, and stores no copied document content',async()=>{
  const f=fixture(),service=f.create();assert.deepEqual(await service.load(),{revision:0,bookmarks:[],available:true});
  let state=await service.set('doc-a',true,command(0));f.setClock(Date.parse('2026-10-15T10:00:00.000Z'));
  state=await service.set('doc-b',true,command(1,'request-00000002'));
  assert.equal(state.revision,2);assert.deepEqual(state.bookmarks.map(x=>x.documentId),['doc-b','doc-a']);
  assert.doesNotMatch(f.memory.get('test.bookmarks'),/Approved|Private|versions|title|bodyMarkdown/);
  state=await service.set('doc-a',false,command(2,'request-00000003'));assert.equal(state.revision,3);assert.deepEqual(state.bookmarks.map(x=>x.documentId),['doc-b']);
});
test('SOEID normalization isolates users and root libraries and pins identity to each instance',async()=>{
  const identity={soeid:' am12345 '},f=fixture({identity}),alice=f.create();identity.soeid='JL12345';
  await alice.set('doc-a',true,command(0));const bob=f.create({identity:{soeid:'jl12345'}});
  assert.equal((await bob.load()).bookmarks.length,0);await bob.set('doc-b',true,command(0));
  assert.deepEqual((await alice.load()).bookmarks.map(x=>x.documentId),['doc-a']);
  assert.equal((await f.create({identity:{soeid:'AM12345'}}).load()).bookmarks.length,1);
  assert.equal((await f.create({rootPageId:'100'}).load()).bookmarks.length,0);
  assert.equal(JSON.parse(f.memory.get('test.bookmarks')).profiles.length,2);
});
test('resolving saved items always selects the latest approved version, never a draft snapshot',async()=>{
  const f=fixture(),service=f.create(),state=await service.set('doc-a',true,command(0));
  assert.equal(service.resolve(state)[0].version.title,'Approved doc-a');
  f.docs[0].versions[1].status='Published';f.docs[0].publishedVersion=2;
  assert.equal(service.resolve(state)[0].version.version,2);assert.equal((await service.load()).bookmarks[0].documentId,'doc-a');
  assert.equal(service.resolve(state)[0].savedAt,state.bookmarks[0].savedAt);
});
test('lost access, deleted, unknown, duplicate, and unpublished documents are hidden immediately',async()=>{
  const f=fixture(),service=f.create(),state=await service.set('doc-a',true,command(0));
  f.denied.add('doc-a');assert.deepEqual(service.resolve(state),[]);assert.deepEqual((await service.load()).bookmarks,[]);
  await assert.rejects(service.set('doc-a',true,command(1,'request-00000002')),{code:'BOOKMARKS_FORBIDDEN'});
  f.denied.clear();f.docs[0].deletedAt='2026-10-15';assert.deepEqual(service.resolve(state),[]);
  delete f.docs[0].deletedAt;f.docs[0].publishedVersion=null;assert.deepEqual(service.resolve(state),[]);
  f.docs[0].publishedVersion=1;f.setDocs([f.docs[0],f.docs[0]]);assert.deepEqual(service.resolve(state),[]);
  f.setDocs([]);assert.deepEqual(service.resolve(state),[]);
  assert.deepEqual((await service.set('doc-a',false,command(1,'request-00000003'))).bookmarks,[]);
});
test('save/remove is idempotent and retries never recreate a bookmark removed later',async()=>{
  const f=fixture(),service=f.create(),first=await service.set('doc-a',true,command(0));
  assert.deepEqual(await service.set('doc-a',true,command(0)),first);assert.equal(f.writes(),1);
  const unchanged=await service.set('doc-a',true,command(1,'request-00000002'));assert.deepEqual(unchanged,first);
  await service.set('doc-a',false,command(1,'request-00000003'));
  await assert.rejects(service.set('doc-a',true,command(0)),{code:'BOOKMARKS_CONFLICT'});
  await assert.rejects(service.set('doc-b',true,command(0)),{code:'BOOKMARKS_CONFLICT'});
  assert.deepEqual((await service.load()).bookmarks,[]);
});
test('concurrent instances reread under a shared lock and report stale revisions',async()=>{
  let locks=0;const f=fixture({withLock:async(name,task)=>{assert.equal(name,'wcspedia-bookmarks:test.bookmarks');locks++;return task();}}),a=f.create(),b=f.create();
  const values=await Promise.allSettled([a.set('doc-a',true,command(0)),b.set('doc-b',true,command(0,'request-00000002'))]);
  assert.equal(values.filter(x=>x.status==='fulfilled').length,1);assert.equal(values.find(x=>x.status==='rejected').reason.code,'BOOKMARKS_CONFLICT');assert.equal(locks,2);
  const state=await b.load();await b.set('doc-b',true,command(state.revision,'request-00000003'));assert.equal((await a.load()).bookmarks.length,2);
});
test('concurrent saves for different users preserve both profiles',async()=>{
  const f=fixture(),a=f.create(),b=f.create({identity:'JL12345'});
  await Promise.all([a.set('doc-a',true,command(0)),b.set('doc-b',true,command(0))]);
  assert.deepEqual((await a.load()).bookmarks.map(x=>x.documentId),['doc-a']);assert.deepEqual((await b.load()).bookmarks.map(x=>x.documentId),['doc-b']);
});
test('corrupt and quota-limited storage fail without clearing other users or reporting success',async()=>{
  const f=fixture(),service=f.create();f.memory.set('test.bookmarks','{ broken');
  await assert.rejects(service.load(),{code:'BOOKMARKS_CORRUPT'});await assert.rejects(service.set('doc-a',true,command(0)),{code:'BOOKMARKS_CORRUPT'});assert.equal(f.memory.get('test.bookmarks'),'{ broken');
  f.memory.clear();await service.set('doc-a',true,command(0));const before=f.memory.get('test.bookmarks');f.storage.setItem=()=>{throw Error('Quota exceeded');};
  await assert.rejects(f.create({identity:'JL12345'}).set('doc-b',true,command(0)),{code:'BOOKMARKS_STORAGE'});assert.equal(f.memory.get('test.bookmarks'),before);
});
test('silent storage failure and broken lock adapters never return a successful write',async()=>{
  const f=fixture();f.storage.setItem=()=>{};await assert.rejects(f.create().set('doc-a',true,command(0)),{code:'BOOKMARKS_STORAGE'});
  await assert.rejects(f.create({withLock:()=>{}}).load(),{code:'BOOKMARKS_LOCK'});
  await assert.rejects(f.create({withLock:(name,task)=>{task();return task();}}).load(),{code:'BOOKMARKS_LOCK'});
});
test('input validation rejects anonymous users, invalid keys, and missing optimistic revision',async()=>{
  const f=fixture();assert.throws(()=>f.create({identity:null}),{code:'BOOKMARKS_IDENTITY'});assert.throws(()=>f.create({identity:'../bad'}),{code:'BOOKMARKS_IDENTITY'});
  const service=f.create();await assert.rejects(service.set('doc-a',true),{code:'BOOKMARKS_INPUT'});await assert.rejects(service.set('../escape',true,command(0)),{code:'BOOKMARKS_INPUT'});await assert.rejects(service.set('doc-a','true',command(0)),{code:'BOOKMARKS_INPUT'});
});
function remote(extra={}) {
  const f=fixture(),calls=[];
  let result={schemaVersion:1,rootPageId:'100',subjectSOEID:'AM12345',revision:0,bookmarks:[]},status=200,type='application/json';
  const service=f.create({mode:'confluence',rootPageId:'100',endpoint:'/confluence/bookmarks',baseUrl:'https://example.test/confluence/page',fetch:async(url,init)=>{calls.push({url,init});return {ok:status>=200&&status<300,status,headers:{get:()=>type},json:async()=>result};},...extra});
  return {...f,service,calls,setResult:v=>result=v,setStatus:v=>status=v,setType:v=>type=v};
}
test('live reads and writes use session credentials and CSRF headers without browser identity',async()=>{
  const f=remote();await f.service.load();assert.equal(f.calls[0].url,'https://example.test/confluence/bookmarks?rootPageId=100');
  f.setResult({schemaVersion:1,rootPageId:'100',subjectSOEID:'AM12345',revision:1,bookmarks:[{documentId:'doc-a',savedAt:'2026-10-15T09:00:00.000Z'}]});
  await f.service.set('doc-a',true,command(0));const {init}=f.calls[1];
  assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.headers['X-Requested-With'],'XMLHttpRequest');assert.equal(init.headers['Idempotency-Key'],'request-00000001');
  assert.deepEqual(JSON.parse(init.body),{schemaVersion:1,rootPageId:'100',documentId:'doc-a',saved:true,expectedRevision:0,requestId:'request-00000001'});
  assert.equal(f.memory.size,0);
});
test('unconfigured live bookmarks are unavailable with no local fallback',async()=>{
  const f=remote({endpoint:''});assert.equal((await f.service.load()).available,false);assert.equal((await f.service.load()).revision,null);
  await assert.rejects(f.service.set('doc-a',true,command(0)),{code:'BOOKMARKS_UNAVAILABLE'});assert.equal(f.calls.length,0);assert.equal(f.memory.size,0);
});
test('live endpoint rejects external URLs, credentials, fragments, and ambiguous query config',()=>{
  for(const endpoint of ['https://evil.example/bookmarks','https://u:p@example.test/bookmarks','/bookmarks#bad','/bookmarks?actor=A'])assert.throws(()=>remote({endpoint}),{code:'BOOKMARKS_INPUT'});
});
test('live responses strictly validate identity, root, shape, duplicates, dates and revisions',async()=>{
  const f=remote(),base={schemaVersion:1,rootPageId:'100',subjectSOEID:'AM12345',revision:1,bookmarks:[]};
  for(const response of [{...base,subjectSOEID:'JL12345'},{...base,rootPageId:'101'},{...base,extra:'unsafe'},{...base,revision:-1},{...base,bookmarks:[{documentId:'doc-a',savedAt:'yesterday'}]},{...base,bookmarks:[{documentId:'doc-a',savedAt:'2026-10-15T09:00:00.000Z',title:'copied'}]},{...base,bookmarks:Array(2).fill({documentId:'doc-a',savedAt:'2026-10-15T09:00:00.000Z'})}]){f.setResult(response);await assert.rejects(f.service.load(),{code:'BOOKMARKS_INVALID'});}
  f.setResult(base);f.setType('text/html');await assert.rejects(f.service.load(),{code:'BOOKMARKS_INVALID'});
});
test('live conflicts, permission failures and unconfirmed writes are errors without local fallback',async()=>{
  const f=remote();f.setStatus(409);await assert.rejects(f.service.set('doc-a',true,command(0)),{code:'BOOKMARKS_CONFLICT'});
  f.setStatus(403);await assert.rejects(f.service.load(),{code:'BOOKMARKS_FORBIDDEN'});f.setStatus(500);await assert.rejects(f.service.load(),{code:'BOOKMARKS_SERVICE'});
  f.setStatus(200);await assert.rejects(f.service.set('doc-a',true,command(0)),{code:'BOOKMARKS_CONFLICT'});assert.equal(f.memory.size,0);
  const offline=remote({fetch:async()=>{throw Error('Offline');}});await assert.rejects(offline.service.load(),{code:'BOOKMARKS_NETWORK'});
});
test('live results are filtered against current permissions and catalog on every resolve',async()=>{
  const f=remote();f.setResult({schemaVersion:1,rootPageId:'100',subjectSOEID:'AM12345',revision:1,bookmarks:[{documentId:'doc-a',savedAt:'2026-10-15T09:00:00.000Z'},{documentId:'unknown',savedAt:'2026-10-15T10:00:00.000Z'}]});
  const state=await f.service.load();assert.equal(state.bookmarks.length,1);f.denied.add('doc-a');assert.deepEqual(f.service.resolve(state),[]);assert.deepEqual((await f.service.load()).bookmarks,[]);
});
test('live request timeout bounds a stalled GET and aborts the request',async()=>{
  let signal;const f=remote({requestTimeoutMs:15,fetch:async(url,init)=>{signal=init.signal;return new Promise(()=>{});}}),started=Date.now();
  await assert.rejects(f.service.load(),error=>error.code==='BOOKMARKS_TIMEOUT'&&/too long to load/.test(error.message));
  assert.equal(signal.aborted,true);assert(Date.now()-started<1000);assert.equal(f.memory.size,0);
});
test('POST timeout preserves the exact idempotency command and never claims success',async()=>{
  let sent,signal;const f=remote({requestTimeoutMs:15,fetch:async(url,init)=>{sent=JSON.parse(init.body);signal=init.signal;return new Promise(()=>{});}});
  await assert.rejects(f.service.set('doc-a',true,{expectedRevision:0}),error=>{
    assert.equal(error.code,'BOOKMARKS_TIMEOUT');assert.match(error.message,/result is not confirmed/);assert.equal(error.requestId,sent.requestId);
    assert.deepEqual(error.retryCommand,{documentId:'doc-a',saved:true,expectedRevision:0,requestId:sent.requestId});return true;
  });
  assert.equal(signal.aborted,true);assert.equal(f.memory.size,0);
});
test('request deadline also covers a stalled response body',async()=>{
  let signal;const f=remote({requestTimeoutMs:15,fetch:async(url,init)=>{signal=init.signal;return {ok:true,headers:{get:()=> 'application/json'},json:()=>new Promise(()=>{})};}});
  await assert.rejects(f.service.load(),{code:'BOOKMARKS_TIMEOUT'});assert.equal(signal.aborted,true);
  assert.throws(()=>remote({requestTimeoutMs:0}),{code:'BOOKMARKS_INPUT'});
});
test('mock HTTP route resolves identity server-side, isolates sessions, enforces ACL and idempotency',async t=>{
  const http=require('node:http'),{createRoute}=require('./mock-bookmarks-route.cjs');
  let route,actor={soeid:'AM12345'};const docs=[document('doc-a'),document('doc-b')],denied=new Set();
  const server=http.createServer(async(req,res)=>{if(!await route(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin='http://127.0.0.1:'+server.address().port,endpoint=origin+'/confluence/mock/bookmarks';
  route=createRoute({rootPageId:'100',origin,getActor:()=>actor,getDocuments:()=>docs,canRead:(doc,who)=>!denied.has(who.soeid+':'+doc.id)});
  const get=()=>fetch(endpoint+'?rootPageId=100').then(r=>r.json());
  const post=(body,headers={})=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':body.requestId,Origin:origin,...headers},body:JSON.stringify(body)});
  const payload={schemaVersion:1,rootPageId:'100',documentId:'doc-a',saved:true,expectedRevision:0,requestId:'request-00000001'};
  assert.equal((await get()).revision,0);const first=await (await post(payload)).json();assert.equal(first.revision,1);assert.equal(first.subjectSOEID,'AM12345');assert.deepEqual(await (await post(payload)).json(),first);
  actor={soeid:'JL12345'};assert.equal((await get()).bookmarks.length,0);assert.equal((await post({...payload,documentId:'doc-b'})).status,200);
  assert.equal((await post({...payload,soeid:'AM12345'})).status,400);assert.deepEqual((await get()).bookmarks.map(x=>x.documentId),['doc-b']);
  actor={soeid:'AM12345'};assert.deepEqual((await get()).bookmarks.map(x=>x.documentId),['doc-a']);
  denied.add('AM12345:doc-a');assert.deepEqual((await get()).bookmarks,[]);assert.equal((await post({...payload,expectedRevision:1,requestId:'request-00000002'})).status,403);
  assert.equal((await post({...payload,documentId:'unknown',expectedRevision:1,requestId:'request-00000002'})).status,403);
  assert.equal((await post({...payload,saved:false,expectedRevision:1,requestId:'request-00000003'})).status,200);
  assert.equal((await post({...payload,documentId:'doc-b',expectedRevision:2,requestId:'request-00000004'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({...payload,documentId:'doc-b',expectedRevision:2,requestId:'request-00000004'},{'X-Requested-With':''})).status,403);
  actor=null;assert.equal((await fetch(endpoint+'?rootPageId=100')).status,401);
});
