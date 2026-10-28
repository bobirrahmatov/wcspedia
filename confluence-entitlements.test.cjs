'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEntitlementsService}=require('./confluence-entitlements.cjs');
const E=require('./entitlements.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const admin={soeid:'BR47149'};
const native={root:[{operation:'read',targetType:'page'},{operation:'create',targetType:'page'}],entitlements:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}],documents:{}};
const ctx=()=>({identity:admin,native:clone(native)});
function policy(){return {schemaVersion:1,revision:1,records:[{id:'admin-br47149',soeid:'BR47149',displayName:'BR47149',scope:'*',permissions:[...E.PERMISSIONS],active:true},{id:'author',soeid:'AM12345',displayName:'Author',scope:'*',permissions:['content.create','content.edit'],active:true}],audit:[]};}
const row=()=>({id:'new-person',soeid:'XY12345',displayName:'New colleague',scope:'*',permissions:['content.create','content.edit'],active:true});
const command=()=>({action:'add',record:row(),expectedRevision:1,expectedAttachmentId:'900',expectedAttachmentVersion:1,comment:'Approved access request.',requestId:'entitlement-command-1',rootPageId:'101',entitlementsPageId:'102',entitlementsSource:'attachment',entitlementsFilename:'entitlements.json'});
function fixture(options={}){
  const versions=new Map([[1,Buffer.from(JSON.stringify(options.policy||policy()))]]),entries=new Map(),locks=new Map();
  const state={version:1,id:'900',versions,posts:0,calls:[],metadataReads:0,discardedPostBodies:0};
  const journal={get:async key=>entries.has(key)?clone(entries.get(key)):undefined,set:async(key,value)=>entries.set(key,clone(value)),withLock:async(key,fn)=>{const prior=locks.get(key)||Promise.resolve();let release;const gate=new Promise(r=>release=r),tail=prior.then(()=>gate);locks.set(key,tail);await prior;try{return await fn();}finally{release();if(locks.get(key)===tail)locks.delete(key);}}};
  const fetch=async(url,init={})=>{
    const u=new URL(url),method=init.method||'GET';state.calls.push({url,method,headers:init.headers,redirect:init.redirect,cache:init.cache});
    assert.equal(u.origin,'https://confluence.test');
    if(method==='GET'&&u.pathname==='/confluence/rest/api/content/102/child/attachment'){
      state.metadataReads++;assert.equal(u.searchParams.get('filename'),'entitlements.json');
      return new Response(JSON.stringify({results:options.missing?[]:[{id:state.id,title:'entitlements.json',version:{number:state.version}}]}),{headers:{'Content-Type':'application/json'}});
    }
    if(method==='GET'&&u.pathname==='/confluence/download/attachments/102/entitlements.json'){
      const bytes=state.versions.get(Number(u.searchParams.get('version')));assert.ok(bytes,'version-pinned attachment request');
      if(options.changeDuringRead&&!state.shifted){state.shifted=true;state.versions.set(++state.version,bytes);}
      return new Response(bytes,{headers:{'Content-Type':'application/json'}});
    }
    if(method==='POST'&&u.pathname==='/confluence/rest/api/content/102/child/attachment/'+state.id+'/data'){
      state.posts++;assert.equal(init.headers['X-Atlassian-Token'],'nocheck');
      const file=init.body.get('file');assert.equal(file.name,'entitlements.json');
      if(options.failBeforePost)throw new Error('connection failed before observed commit');
      const bytes=Buffer.from(await file.arrayBuffer());state.versions.set(++state.version,options.corruptUpload?Buffer.from(JSON.stringify(policy())):bytes);
      if(options.losePost)throw new Error('response lost after commit');
      return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{}'));},cancel(){state.discardedPostBodies++;}}),{status:200});
    }
    throw new Error('Unexpected Confluence call '+method+' '+url);
  };
  const config={baseUrl:'https://confluence.test/confluence',rootPageId:'101',entitlementsPageId:'102',filename:'entitlements.json',journal,fetch,now:()=> '2026-10-16T12:30:00.000Z'};
  return {state,entries,journal,config,service:createEntitlementsService(config)};
}

test('single version-pinned JSON is the policy, with full audit only for entitlement viewers',async()=>{
  const f=fixture(),adminRead=await f.service.read(ctx());
  assert.equal(adminRead.attachmentId,'900');assert.equal(adminRead.attachmentVersion,1);assert.equal(adminRead.attachmentDigest.length,64);assert.equal(adminRead.policy.records.length,2);
  const member=await f.service.read({identity:{soeid:'am12345'},native:{root:[{operation:'read',targetType:'page'}],entitlements:[]}});
  assert.equal(member.policy.revision,1);assert.deepEqual(member.policy.records.map(r=>r.soeid),['AM12345']);assert.deepEqual(member.policy.audit,[]);
  await f.service.execute(command(),ctx());
  const memberAfter=await f.service.read({identity:{soeid:'am12345'},native});assert.equal(memberAfter.policy.revision,2);assert.equal(memberAfter.policy.audit.length,0);
  assert.equal((await f.service.read(ctx())).policy.audit.length,1);
  const unknown=await f.service.read({identity:{soeid:'NO12345'},native});assert.equal(unknown.policy.records.length,0);
  const trusted=await f.service.loadPolicy();assert.equal(trusted.records.length,3);assert.equal(trusted.audit.length,1);
  assert.ok(f.state.calls.every(call=>call.redirect==='error'&&call.cache==='no-store'));
});
test('save updates only the existing attachment and records trusted actor, clock and exact record changes',async()=>{
  const f=fixture(),result=await f.service.execute(command(),ctx());
  assert.equal(f.state.posts,1);assert.equal(f.state.discardedPostBodies,1);assert.equal(result.attachmentVersion,2);assert.equal(result.policy.revision,2);
  const uploaded=JSON.parse(f.state.versions.get(2));assert.deepEqual(uploaded,result.policy);
  assert.equal(uploaded.audit[0].actorSOEID,'BR47149');assert.equal(uploaded.audit[0].at,'2026-10-16T12:30:00.000Z');assert.equal(uploaded.audit[0].changes[0].after.id,row().id);
  assert.deepEqual(Object.keys(uploaded).sort(),['audit','records','revision','schemaVersion']);
  assert.ok(f.state.calls.find(call=>call.method==='POST').url.endsWith('/child/attachment/900/data'));
});
test('authenticated read scope is required and ordinary members cannot elevate their own authority',async()=>{
  const f=fixture();
  for(const options of [{identity:null,native},{identity:admin,native:{}},{identity:{soeid:'not valid'},native}])await assert.rejects(f.service.read(options),{code:'FORBIDDEN'});
  await assert.rejects(f.service.execute(command(),{identity:{soeid:'AM12345'},native}),{code:'FORBIDDEN'});
  await assert.rejects(f.service.execute(command(),{identity:admin,native:{...native,entitlements:[{operation:'read',targetType:'page'}]}}),{code:'FORBIDDEN'});
  assert.equal(f.state.posts,0);
});
test('native update and application grant checks also apply to completed replay',async()=>{
  const f=fixture();await f.service.execute(command(),ctx());
  await assert.rejects(f.service.execute(command(),{identity:admin,native:{...native,entitlements:[{operation:'read',targetType:'page'}]}}),{code:'FORBIDDEN'});
  const p=JSON.parse(f.state.versions.get(2));p.records[0].active=false;f.state.versions.set(++f.state.version,Buffer.from(JSON.stringify(p)));
  await assert.rejects(f.service.execute(command(),ctx()),{code:'FORBIDDEN'});assert.equal(f.state.posts,1);
});
test('last administrator removal and granting authority the actor does not hold are rejected',async()=>{
  const f=fixture();await assert.rejects(f.service.execute({...command(),action:'revoke',recordId:'admin-br47149'},ctx()),{code:'LAST_ADMIN'});
  const p=policy();p.records[0].permissions=p.records[0].permissions.filter(x=>x!=='content.delete');const limited=fixture({policy:p});
  await assert.rejects(limited.service.execute({...command(),record:{...row(),permissions:['content.delete']}},ctx()),{code:'FORBIDDEN'});
  assert.equal(f.state.posts+limited.state.posts,0);
});
test('stale policy revision, native attachment version, and replaced attachment ID reject before intent or upload',async()=>{
  for(const changes of [{expectedRevision:2},{expectedAttachmentVersion:2},{expectedAttachmentId:'901'}]){
    const f=fixture();await assert.rejects(f.service.execute({...command(),...changes},ctx()),{code:'CONFLICT'});assert.equal(f.state.posts,0);assert.equal(f.entries.size,0);
  }
});
test('completed identical retry and concurrent duplicate commands perform one upload',async()=>{
  const f=fixture(),results=await Promise.all([f.service.execute(command(),ctx()),f.service.execute(command(),ctx())]);
  assert.equal(f.state.posts,1);assert.deepEqual(results[0],results[1]);assert.equal((await f.service.execute(command(),ctx())).policy.revision,2);assert.equal(f.state.posts,1);
});
test('same request ID is bound to its normalized payload and authenticated actor',async()=>{
  const p=policy();p.records.push({id:'second-admin',soeid:'JK12345',displayName:'Other admin',scope:'*',permissions:[...E.PERMISSIONS],active:true});const f=fixture({policy:p});
  await f.service.execute(command(),ctx());
  await assert.rejects(f.service.execute({...command(),comment:'Changed reason'},ctx()),{code:'CONFLICT'});
  await assert.rejects(f.service.execute(command(),{identity:{soeid:'JK12345'},native}),{code:'CONFLICT'});assert.equal(f.state.posts,1);
});
test('lost committed response reconciles the exact next native version and bytes without sending POST again',async()=>{
  const f=fixture({losePost:true});await assert.rejects(f.service.execute(command(),ctx()),{code:'ENTITLEMENTS_UNCERTAIN'});
  assert.equal(f.state.version,2);const result=await f.service.execute(command(),ctx());assert.equal(result.policy.revision,2);assert.equal(result.attachmentVersion,2);assert.equal(f.state.posts,1);
  const journal=[...f.entries.values()][0];assert.equal(journal.pending,null);assert.equal(journal.completed[command().requestId].digest,result.attachmentDigest);assert.equal(JSON.stringify(journal).includes('New colleague'),false);
});
test('uncertain upload still at the prior version never blindly retries POST and blocks unrelated changes',async()=>{
  const f=fixture({failBeforePost:true});await assert.rejects(f.service.execute(command(),ctx()),{code:'ENTITLEMENTS_UNCERTAIN'});
  await assert.rejects(f.service.execute(command(),ctx()),{code:'ENTITLEMENTS_PENDING'});
  await assert.rejects(f.service.execute({...command(),requestId:'different'},ctx()),{code:'ENTITLEMENTS_PENDING'});
  assert.equal(f.state.posts,1);assert.equal(f.state.version,1);
});
test('changed bytes at the expected uploaded version cannot be mistaken for success',async()=>{
  const f=fixture({corruptUpload:true});await assert.rejects(f.service.execute(command(),ctx()),{code:'CONFLICT'});await assert.rejects(f.service.execute(command(),ctx()),{code:'CONFLICT'});assert.equal(f.state.posts,1);
});
test('metadata movement during download, missing seed, invalid JSON and oversized policy fail closed',async()=>{
  const moved=fixture({changeDuringRead:true});await assert.rejects(moved.service.read(ctx()),{code:'CONFLICT'});
  const missing=fixture({missing:true});await assert.rejects(missing.service.read(ctx()),{code:'ENTITLEMENTS_CONFIGURATION'});
  const invalid=fixture();invalid.state.versions.set(1,Buffer.from('{oops'));await assert.rejects(invalid.service.read(ctx()),/invalid entitlement JSON/);
  const oversized=fixture();oversized.state.versions.set(1,Buffer.alloc(2*1024*1024+1,32));await assert.rejects(oversized.service.read(ctx()),/size limit/);
});
test('configured scope and filename cannot be redirected by command, and browser authority fields are rejected',async()=>{
  const f=fixture();for(const changes of [{rootPageId:'999'},{entitlementsPageId:'999'},{entitlementsSource:'page'},{entitlementsFilename:'other.json'},{actorSOEID:'FAKE'},{at:'2000-01-01T00:00:00Z'},{native:{entitlements:native.entitlements}}])await assert.rejects(f.service.execute({...command(),...changes},ctx()));
  assert.equal(f.state.calls.length,0);assert.equal(f.state.posts,0);
});
test('service requires safe configured IDs, HTTPS/context URL, fixed file and shared journal',()=>{
  const f=fixture();for(const changes of [{baseUrl:'http://confluence.test/confluence'},{baseUrl:'https://user:secret@confluence.test/confluence'},{baseUrl:'https://confluence.test/confluence?query=1'},{rootPageId:'x'},{entitlementsPageId:'0'},{filename:'../entitlements.json'},{filename:'policy.json'},{journal:null},{now:'client timestamp'}])assert.throws(()=>createEntitlementsService({...f.config,...changes}));
});
test('root-context Confluence URLs retain same-origin path confinement and fresh reads',async()=>{
  const f=fixture(),service=createEntitlementsService({...f.config,baseUrl:'https://confluence.test/',fetch:(url,init)=>{const parsed=new URL(url);assert.ok(parsed.pathname.startsWith('/rest/')||parsed.pathname.startsWith('/download/'));assert.equal(init.cache,'no-store');return f.config.fetch(parsed.origin+'/confluence'+parsed.pathname+parsed.search,init);}});
  assert.equal((await service.read(ctx())).policy.revision,1);
});
test('replayed older success returns freshly authorized current policy after later valid commands',async()=>{
  const f=fixture();await f.service.execute(command(),ctx());
  await f.service.execute({...command(),action:'revoke',recordId:row().id,expectedRevision:2,expectedAttachmentVersion:2,requestId:'second-command'},ctx());
  const replay=await f.service.execute(command(),ctx());assert.equal(replay.policy.revision,3);assert.equal(replay.attachmentVersion,3);assert.equal(f.state.posts,2);assert.equal(replay.policy.records.some(r=>r.id===row().id),false);
});

test('definite entitlement HTTP 413 is actionable and does not strand a pending policy write',async()=>{
  const f=fixture();let reject=true;
  const transport=f.config.fetch;f.config.fetch=(url,init={})=>init.method==='POST'&&reject?Promise.resolve(new Response('',{status:413})):transport(url,init);
  const service=createEntitlementsService(f.config);
  await assert.rejects(service.execute(command(),ctx()),error=>error.code==='ATTACHMENT_TOO_LARGE'&&error.status===413&&/server or proxy/.test(error.message));
  assert.equal([...f.entries.values()][0].pending,null);assert.equal(f.state.version,1);assert.equal(f.state.posts,0);
  reject=false;assert.equal((await service.execute({...command(),requestId:'corrected-upload'},ctx())).policy.revision,2);
});
