'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {createArticleFeedbackService,createArticleFeedbackFileStore}=require('./article-feedback-service.cjs');
const {createArticleFeedbackHandler}=require('./article-feedback-http.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
function fixture(extra={}){
  const records=new Map(),queues=new Map();let writes=0,accesses=0,clock=Date.parse('2026-10-17T12:00:00.000Z');
  const store={get:async k=>records.has(k)?copy(records.get(k)):null,set:async(k,v)=>{writes++;records.set(k,copy(v));},withLock:async(k,fn)=>{const previous=queues.get(k)||Promise.resolve();const current=previous.catch(()=>{}).then(fn);queues.set(k,current);try{return await current;}finally{if(queues.get(k)===current)queues.delete(k);}}};
  const access={authenticated:true,rootReadable:true,canRead:true,page:{id:'1002',type:'page',status:'current',spaceKey:'wcspedia',ancestorIds:['100','1001'],version:3}};
  const options={rootPageId:'100',spaceKey:'wcspedia',areaPageIds:['1001','1003'],store,actorSecret:'server only stable key at least thirty two bytes',resolveAccess:async({pageId,context})=>{accesses++;return {...copy(access),actorId:context?.actor,page:{...copy(access.page),id:pageId}};},canExportAnalytics:async({context})=>context?.admin===true,now:()=>clock,...extra};
  return {service:createArticleFeedbackService(options),options,records,store,access,writes:()=>writes,accesses:()=>accesses,setClock:v=>clock=v};
}
const target={rootPageId:'100',pageId:'1002'};
const context={actor:'confluence-user-key-123'};
function command(changes={}){return {...target,pageVersion:3,value:'yes',expectedVoteRevision:0,requestId:'vote-request-0001',...changes};}
test('first read is empty without creating a file; first vote creates one and exposes no actor identifiers',async()=>{
  const f=fixture(),empty=await f.service.read(target,context);
  assert.deepEqual(empty.totals,{yes:0,no:0,total:0});assert.deepEqual(empty.myVote,{value:null,revision:0,pageVersion:null});assert.equal(f.writes(),0);
  const result=await f.service.vote(command(),context);
  assert.equal(result.accepted,true);assert.equal(result.changed,true);assert.deepEqual(result.totals,{yes:1,no:0,total:1});assert.deepEqual(result.currentVersionTotals,result.totals);assert.deepEqual(result.myVote,{value:'yes',revision:1,pageVersion:3});assert.equal(f.records.size,1);
  assert.equal(JSON.stringify([...f.records.values()]).includes(context.actor),false);assert.equal(JSON.stringify(result).includes('actor'),false);
});
test('changing Yes to No counts one voter, records version-aware changes, and rejects stale actor revisions',async()=>{
  const f=fixture();await f.service.vote(command(),context);
  const result=await f.service.vote(command({value:'no',expectedVoteRevision:1,requestId:'vote-request-0002'}),context);
  assert.deepEqual(result.totals,{yes:0,no:1,total:1});assert.equal(result.myVote.revision,2);
  await assert.rejects(f.service.vote(command({requestId:'vote-request-0003'}),context),{code:'FEEDBACK_CONFLICT'});
  f.access.page.version=4;const next=await f.service.read(target,context);assert.deepEqual(next.currentVersionTotals,{yes:0,no:0,total:0});assert.equal(next.myVote.pageVersion,3);
  await assert.rejects(f.service.vote(command({expectedVoteRevision:2,requestId:'vote-request-0004'}),context),{code:'FEEDBACK_CONFLICT'});
  const updated=await f.service.vote(command({value:'no',pageVersion:4,expectedVoteRevision:2,requestId:'vote-request-0005'}),context);assert.equal(updated.myVote.pageVersion,4);assert.equal(updated.totals.total,1);assert.equal(updated.currentVersionTotals.no,1);
  assert.equal(f.records.get('100:1002').events.length,3);
});
test('same-choice no-op is receipted without inventing an extra vote, event or revision',async()=>{
  const f=fixture();await f.service.vote(command(),context);
  const noOp=await f.service.vote(command({expectedVoteRevision:1,requestId:'vote-request-0002'}),context);
  assert.equal(noOp.changed,false);assert.equal(noOp.revision,1);assert.equal(noOp.myVote.revision,1);assert.equal(f.records.get('100:1002').events.length,1);
  assert.deepEqual(await f.service.vote(command({expectedVoteRevision:1,requestId:'vote-request-0002'}),context),noOp);
});
test('concurrent users do not lose votes and concurrent duplicate clicks commit only once',async()=>{
  const f=fixture();await Promise.all(Array.from({length:30},(_,i)=>f.service.vote(command({requestId:'concurrent-vote-'+i}),{actor:'reader-'+i})));
  assert.equal((await f.service.read(target,context)).totals.yes,30);
  const results=await Promise.all(Array.from({length:10},()=>f.service.vote(command(),context)));
  assert.ok(results.every(r=>r.totals.yes===31&&r.myVote.revision===1));assert.equal(f.writes(),31);
});
test('same request replay is exact, payload reuse conflicts, and native access is checked again',async()=>{
  const f=fixture(),result=await f.service.vote(command(),context);
  await f.service.vote(command({requestId:'reader-two-request'}),{actor:'another-reader'});
  assert.deepEqual(await f.service.vote(command(),context),result);assert.equal(f.writes(),2);
  await assert.rejects(f.service.vote(command({value:'no'}),context),{code:'FEEDBACK_CONFLICT'});
  f.access.canRead=false;await assert.rejects(f.service.vote(command(),context),{code:'FEEDBACK_FORBIDDEN'});await assert.rejects(f.service.read(target,context),{code:'FEEDBACK_FORBIDDEN'});
  assert.equal(f.writes(),2);assert.equal(f.accesses(),6);
});
test('ambiguous storage response can be retried with same request ID without another mutation',async()=>{
  const f=fixture();let lost=true;
  const realSet=f.store.set;f.store.set=async(k,v)=>{await realSet(k,v);if(lost){lost=false;throw Error('lost acknowledgement');}};
  await assert.rejects(f.service.vote(command(),context),/lost acknowledgement/);
  assert.equal((await f.service.vote(command(),context)).totals.yes,1);assert.equal(f.writes(),1);
});
test('unauthenticated, other space/root, non-child, trashed and missing native read scope fail closed',async()=>{
  for(const change of [a=>a.authenticated=false,a=>a.rootReadable=false,a=>a.canRead=false,a=>a.page.status='trashed',a=>a.page.type='blogpost',a=>a.page.spaceKey='other',a=>a.page.ancestorIds=['1001'],a=>a.page.ancestorIds=['100'],a=>a.page.ancestorIds=['1001','100'],a=>a.page.version=0]){
    const f=fixture();change(f.access);await assert.rejects(f.service.read(target,context),{code:'FEEDBACK_FORBIDDEN'});await assert.rejects(f.service.vote(command(),context),{code:'FEEDBACK_FORBIDDEN'});assert.equal(f.writes(),0);
  }
  const f=fixture();for(const pageId of ['100','1001','not-a-page'])await assert.rejects(f.service.read({...target,pageId},context),{code:'FEEDBACK_INPUT'});
  await assert.rejects(f.service.read(target,{}),{code:'FEEDBACK_FORBIDDEN'});
});
test('browser cannot select identity, native rights, timestamps or aggregate totals',async()=>{
  const f=fixture();for(const injected of [{actorId:'forged'},{actorSOEID:'BR47149'},{canRead:true},{timestamp:'2020'},{totals:{yes:99999}},{spaceKey:'elsewhere'}])await assert.rejects(f.service.vote({...command(),...injected},context),{code:'FEEDBACK_INPUT'});
  for(const change of [{value:true},{value:'maybe'},{pageVersion:0},{expectedVoteRevision:-1},{requestId:'short'},{rootPageId:'999'}])await assert.rejects(f.service.vote(command(change),context),{code:'FEEDBACK_INPUT'});
  assert.equal(f.writes(),0);
});
test('configured interface, attachment and working-tree exclusions always take precedence over area ancestry',async()=>{
  const f=fixture({excludePageIds:['1009','1010'],excludeAncestorIds:['1011']});
  for(const pageId of ['1009','1010','1011'])await assert.rejects(f.service.read({...target,pageId},context),{code:'FEEDBACK_INPUT'});
  f.access.page.ancestorIds=['100','1001','1011'];
  await assert.rejects(f.service.read(target,context),{code:'FEEDBACK_FORBIDDEN'});
  await assert.rejects(f.service.vote(command(),context),{code:'FEEDBACK_FORBIDDEN'});assert.equal(f.writes(),0);
  for(const extra of [{excludePageIds:['bad']},{excludeAncestorIds:['0']},{excludePageIds:['1002','1002']}])assert.throws(()=>createArticleFeedbackService({...f.options,...extra}),{code:'FEEDBACK_INPUT'});
});
test('configured Insights descendants support read, vote and authorized analytics; the parent remains excluded',async()=>{
  const f=fixture({insightsPageId:'2001'});f.access.page.ancestorIds=['100','2001','2002'];
  assert.equal((await f.service.read(target,context)).totals.total,0);
  assert.equal((await f.service.vote(command(),context)).totals.yes,1);
  assert.equal((await f.service.analytics(target,{...context,admin:true})).totals.yes,1);
  for(const method of ['read','analytics'])await assert.rejects(f.service[method]({...target,pageId:'2001'},{...context,admin:true}),{code:'FEEDBACK_INPUT'});
  await assert.rejects(f.service.vote(command({pageId:'2001'}),context),{code:'FEEDBACK_INPUT'});assert.equal(f.writes(),1);
});
test('Insights scope cannot bypass exact root, native space, native read rights or workflow exclusions',async()=>{
  for(const change of [a=>a.page.ancestorIds=['2001','100'],a=>a.page.ancestorIds=['999','2001'],a=>a.page.ancestorIds=['100','2001','2009'],a=>a.page.spaceKey='another',a=>a.canRead=false]){
    const f=fixture({insightsPageId:'2001',excludeAncestorIds:['2009']});f.access.page.ancestorIds=['100','2001'];change(f.access);
    await assert.rejects(f.service.read(target,context),{code:'FEEDBACK_FORBIDDEN'});await assert.rejects(f.service.vote(command(),context),{code:'FEEDBACK_FORBIDDEN'});assert.equal(f.writes(),0);
  }
  const unconfigured=fixture();unconfigured.access.page.ancestorIds=['100','2001'];await assert.rejects(unconfigured.service.read(target,context),{code:'FEEDBACK_FORBIDDEN'});
});
test('Insights service parent is optional but must be a distinct valid configured page ID',async()=>{
  for(const insightsPageId of [undefined,null,'']){const f=fixture({insightsPageId});assert.equal((await f.service.read(target,context)).totals.total,0);}
  for(const insightsPageId of ['bad','0','100','1001',2001])assert.throws(()=>fixture({insightsPageId}),{code:'FEEDBACK_INPUT'});
});
test('analytics export is explicitly authorized and contains only revision-aware aggregates',async()=>{
  const f=fixture();await f.service.vote(command(),context);f.access.page.version=4;await f.service.vote(command({pageVersion:4,value:'no'}),{actor:'another-reader'});
  await assert.rejects(f.service.analytics(target,context),{code:'FEEDBACK_FORBIDDEN'});
  const report=await f.service.analytics(target,{...context,admin:true});
  assert.deepEqual(report.byPageVersion,[{pageVersion:3,yes:1,no:0,total:1},{pageVersion:4,yes:0,no:1,total:1}]);assert.deepEqual(report.totals,{yes:1,no:1,total:2});
  for(const key of ['actors','actor','votes','events','requests','myVote'])assert.equal(Object.hasOwn(report,key),false);
});
test('damaged records and clock rollback are not overwritten',async()=>{
  const f=fixture();await f.service.vote(command(),context);f.setClock(Date.parse('2020-01-01T00:00:00Z'));
  await assert.rejects(f.service.vote(command({value:'no',expectedVoteRevision:1,requestId:'vote-request-0002'}),context),{code:'FEEDBACK_CLOCK'});
  f.records.get('100:1002').votes[0].revision=99;await assert.rejects(f.service.read(target,context),{code:'FEEDBACK_CORRUPT'});assert.equal(f.writes(),1);
});
test('input snapshots cannot be changed while authorization waits',async()=>{
  let release;const gate=new Promise(r=>release=r);const f=fixture();const original=f.options.resolveAccess;
  const s=createArticleFeedbackService({...f.options,resolveAccess:async args=>{await gate;return original(args);}});
  const input=command(),pending=s.vote(input,context);input.value='no';input.pageId='999';release();
  const result=await pending;assert.equal(result.pageId,'1002');assert.equal(result.myVote.value,'yes');
});
test('private JSON files persist across instances and filesystem locks serialize separate stores',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wcspedia-feedback-'));
  try{
    const a=createArticleFeedbackFileStore(dir),b=createArticleFeedbackFileStore(dir),f=fixture({store:a}),g=createArticleFeedbackService({...f.options,store:b});
    await Promise.all([f.service.vote(command(),context),g.vote(command(),{actor:'second-reader'})]);
    assert.equal((await g.read(target,context)).totals.total,2);
    const files=await fs.readdir(dir);assert.deepEqual(files,['wcspedia-feedback-100-1002.json']);
    assert.equal((await fs.stat(path.join(dir,files[0]))).mode&0o777,0o600);
    await fs.mkdir(path.join(dir,files[0]+'.lock'));const stuck=createArticleFeedbackFileStore(dir,{lockTimeoutMs:10});
    await assert.rejects(stuck.withLock('100:1002',()=>assert.fail('must not steal lock')),{code:'FEEDBACK_BUSY'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('HTTP route enforces origin, authentication, payload/header identity and protected aggregate export',async()=>{
  const f=fixture();let origin;
  const server=http.createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const handler=createArticleFeedbackHandler({service:f.service,origin,pathname:'/feedback',authenticate:async req=>req.headers.cookie==='session=test'?{...context,admin:req.headers['x-test-admin']==='yes'}:null});
  const headers={'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':'vote-request-0001',Origin:origin,Cookie:'session=test'};
  const post=(body,extra={})=>fetch(origin+'/feedback',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  try{
    assert.equal((await post(command(),{Origin:'https://elsewhere.test'})).status,403);
    assert.equal((await post(command(),{Cookie:''})).status,401);
    assert.equal((await post(command(),{'Idempotency-Key':'wrong'})).status,400);
    assert.equal((await post({...command(),actorId:'forged'})).status,400);
    const saved=await post(command());assert.equal(saved.status,200);assert.equal((await saved.json()).totals.yes,1);
    const read=await fetch(origin+'/feedback?rootPageId=100&pageId=1002',{headers:{Cookie:'session=test'}});assert.equal(read.status,200);assert.match(read.headers.get('cache-control'),/no-store/);assert.equal((await read.json()).myVote.value,'yes');
    const url=origin+'/feedback?rootPageId=100&pageId=1002&format=analytics';assert.equal((await fetch(url,{headers:{Cookie:'session=test'}})).status,403);
    const exportFile=await fetch(url,{headers:{Cookie:'session=test','X-Test-Admin':'yes'}});assert.equal(exportFile.status,200);assert.match(exportFile.headers.get('content-disposition'),/wcspedia-feedback-1002.json/);assert.equal((await exportFile.json()).totals.total,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
