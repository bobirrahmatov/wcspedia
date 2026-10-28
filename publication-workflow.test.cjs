'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createWorkflowService,readerProjection}=require('./publication-workflow.cjs');
const W=require('./workflow.js'),G=require('./governance.js');
const seed=require('./wcspedia-data.json');
const copy=value=>JSON.parse(JSON.stringify(value));
const operations=names=>names.map(operation=>({operation,targetType:'page'}));
function fixture(){
  const initial=copy(seed);initial.documents=[];
  initial.people.forEach(person=>person.confluence={userKey:'key-'+person.id,username:person.soeid});
  const records=new Map(),locks=new Map(),results=new Map(),native=new Map(),projections=new Map();
  const journal={async get(key){return records.has(key)?copy(records.get(key)):null;},async set(key,value){records.set(key,copy(value));},async withLock(key,fn){const prior=locks.get(key)||Promise.resolve();let release;const done=new Promise(resolve=>release=resolve);locks.set(key,done);await prior;try{return await fn();}finally{release();}}};
  const flags={failProjection:false,denyUpdate:false,denyPublishedDelete:false,nativeCalls:0,policy:copy(seed.entitlementPolicy)};
  const publisher={validate(){},async configurationCheck(){return {publishedRootPageId:'100'};},async syncWorking(input){return sync(input,'working');},async publishApproved(input){return sync(input,'published');},async trashDocument(input){return sync(input,'deleted');}};
  async function sync({document,requestId},operation){
    if(results.has(requestId))return copy(results.get(requestId));
    flags.nativeCalls++;
    const old=native.get(document.id)||{},mapping={...old};
    const version=W.currentVersion(document);
    if(operation==='working'){mapping.confluencePageId=old.confluencePageId||String(500+native.size);mapping.confluencePageVersion=(old.confluencePageVersion||0)+1;}
    if(operation==='published'){mapping.publishedConfluencePageId=old.publishedConfluencePageId||String(700+native.size);mapping.publishedConfluencePageVersion=(old.publishedConfluencePageVersion||0)+1;}
    native.set(document.id,mapping);
    const result={mapping,receipt:{operation,documentKey:document.id,areaId:document.area,pageId:operation==='working'?mapping.confluencePageId:mapping.publishedConfluencePageId,parentPageId:operation==='working'?'200':'101',pageVersion:operation==='working'?mapping.confluencePageVersion:mapping.publishedConfluencePageVersion,version:version.version,revision:version.revision}};
    results.set(requestId,copy(result));return result;
  }
  const opts={rootPageId:'100',journal,publisher,loadInitialState:async()=>({data:initial,attachmentVersion:1}),loadPolicy:async()=>flags.policy,authenticate:async session=>{const person=initial.people.find(p=>p.id===session);return {type:'known',username:person.soeid,userKey:person.confluence.userKey};},nativeAccess:async({document})=>({root:operations(['read','create']),workingRoot:operations(['read','create']),area:operations(['read','create']),published:operations(flags.denyPublishedDelete?['read','update']:['read','update','delete']),documents:document?{[document.id]:operations(flags.denyUpdate?['read']:['read','update','delete'])}:{},pageVersion:document&&(native.get(document.id)?.confluencePageVersion||document.confluencePageVersion)}),writeProjection:async({data,expectedAttachmentVersion,requestId})=>{
    if(flags.failProjection){flags.failProjection=false;throw new Error('Projection unavailable');}
    if(!projections.has(requestId))projections.set(requestId,{attachmentVersion:expectedAttachmentVersion+1,data:copy(data)});
    return {attachmentVersion:projections.get(requestId).attachmentVersion};
  },now:()=>new Date().toISOString()};
  const service=createWorkflowService(opts);
  const fields={id:'native-document',reference:'WCS-JA-900',area:'credit-approval-control',type:'Job aid',authorId:'alex',ownerId:'alex',reviewerId:'jordan',approverId:'jordan',title:'Prepare a handover',summary:'A practical learning aid.',bodyMarkdown:'## Overview\n\nCheck the source record before handover.',governance:G.normalize({classification:'other-nhd',owningTeam:'WCS Learning',scope:'Internal learning support.',audience:'Credit service colleagues',classificationRationale:'This aid explains a task and leaves formal requirements to the source.'})};
  async function command(action,extra={}){
    const snapshot=await service.snapshot(),doc=snapshot.data.documents.find(d=>d.id==='native-document');
    const current=doc&&W.currentVersion(doc);
    return {rootPageId:'100',action,comment:'Verified change.',requestId:randomUUID(),expectedAttachmentVersion:snapshot.attachmentVersion,expectedEntitlementRevision:flags.policy.revision,...(action==='create'?{fields:copy(fields)}:{docId:doc.id,documentKey:doc.id,confluencePageId:doc.confluencePageId,expectedPageVersion:doc.confluencePageVersion,expectedVersion:current.version,expectedRevision:current.revision,expectedAuditLength:doc.audit.length}),...extra};
  }
  const act=async(action,actor='alex',extra={})=>service.execute(await command(action,extra),actor);
  return {service,opts,flags,records,results,native,projections,fields,command,act};
}
async function publish(f){
  await f.act('create');await f.act('submit');
  const doc=(await f.service.snapshot()).data.documents[0],version=W.currentVersion(doc);
  await f.act('complete-review','jordan',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:version.version,revision:version.revision,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'clear',reason:'The wording and source applicability have been reviewed.'}});
  return f.act('approve','jordan',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
}
const importMetadata=()=>({schemaVersion:1,sourceId:'legacy-01',originalCreatedAt:'2020-05-06',originalUpdatedAt:'2024-07-08T09:00:00+02:00',sourceAuthor:'Legacy author',sourcePath:'docs/legacy.mdx'});
test('trusted service supplies import time and retains provenance through resumed transactions',async()=>{
  const f=fixture();f.fields.sourceMetadata=importMetadata();f.opts.now=()=> '2026-10-16T09:00:00.000Z';
  const command=await f.command('create');f.flags.failProjection=true;
  await assert.rejects(f.service.execute(command,'alex'),/Projection unavailable/);
  f.opts.now=()=> '2026-10-16T10:00:00.000Z';await f.service.execute(command,'alex');
  const doc=(await f.service.snapshot()).data.documents[0],v=W.currentVersion(doc);
  assert.deepEqual(v.sourceMetadata,importMetadata());assert.equal(v.sourceImportedAt,'2026-10-16T09:00:00.000Z');assert.equal(v.createdAt,v.sourceImportedAt);
  const bad=fixture();await assert.rejects(bad.act('create','alex',{fields:{...bad.fields,sourceMetadata:importMetadata(),sourceImportedAt:'2000-01-01T00:00:00.000Z'}}),/recorded by the service/);assert.equal(bad.flags.nativeCalls,0);
});
test('duplicate source IDs are rejected within the authoritative library before native writes',async()=>{
  const f=fixture();f.fields.sourceMetadata=importMetadata();await f.act('create');const count=f.flags.nativeCalls;
  await assert.rejects(f.act('create','alex',{fields:{...f.fields,id:'different-document'}}),{code:'SOURCE_ALREADY_IMPORTED'});
  assert.equal(f.flags.nativeCalls,count);assert.equal((await f.service.snapshot()).data.documents.length,1);
});
test('pasting MDX into an existing different document cannot adopt an already registered source ID',async()=>{
  const f=fixture();await f.act('create');
  await f.act('create','alex',{fields:{...f.fields,id:'other-document',sourceMetadata:importMetadata()}});
  const count=f.flags.nativeCalls;
  await assert.rejects(f.act('edit','alex',{changes:{sourceMetadata:importMetadata()}}),{code:'SOURCE_ALREADY_IMPORTED'});
  assert.equal(f.flags.nativeCalls,count);assert.equal(W.currentVersion((await f.service.snapshot()).data.documents[0]).sourceMetadata,undefined);
});
test('trusted workflow creates a restricted page, then publishes the reviewed revision and excludes working mappings',async()=>{
  const f=fixture();const response=await publish(f),snapshot=await f.service.snapshot(),doc=snapshot.data.documents[0];
  assert.equal(response.publication.operation,'published');assert.equal(response.publication.parentPageId,'101');
  assert.notEqual(doc.confluencePageId,doc.publishedConfluencePageId);
  const projection=readerProjection(snapshot.data),reader=projection.documents[0];
  assert.equal(reader.confluencePageId,doc.publishedConfluencePageId);assert.equal(reader.publishedConfluencePageId,undefined);
  assert.equal(reader.versions.length,1);assert.deepEqual(reader.audit,[]);assert.equal(reader.versions[0].governanceReview,undefined);
  assert.equal(doc.audit.at(-1).actorSOEID.toUpperCase(),'JL12345');
});
test('projection failure retains the exact native transaction and recovers without repeating native writes',async()=>{
  const f=fixture(),command=await f.command('create');f.flags.failProjection=true;
  await assert.rejects(f.service.execute(command,'alex'),/Projection unavailable/);
  let snapshot=await f.service.snapshot();assert.equal(snapshot.data.documents.length,0);assert.equal(snapshot.pendingRequestId,command.requestId);
  const pending=f.records.get('workflow-library:100').pending.document,at=pending.audit[0].at,calls=f.flags.nativeCalls;
  const restarted=createWorkflowService(f.opts),response=await restarted.execute(command,'alex');
  snapshot=await restarted.snapshot();assert.equal(snapshot.data.documents[0].audit[0].at,at);assert.equal(f.flags.nativeCalls,calls);assert.equal(snapshot.pendingRequestId,null);
  assert.deepEqual(await restarted.execute(command,'alex'),response);assert.equal(f.flags.nativeCalls,calls);
});
test('a pending publication blocks different commands and request ID reuse',async()=>{
  const f=fixture(),command=await f.command('create');f.flags.failProjection=true;
  await assert.rejects(f.service.execute(command,'alex'));
  await assert.rejects(f.service.execute({...command,requestId:randomUUID()},'alex'),{code:'PUBLICATION_PENDING'});
  await assert.rejects(f.service.execute({...command,comment:'Different text'},'alex'),{code:'PUBLICATION_PENDING'});
  await f.service.execute(command,'alex');
  await assert.rejects(f.service.execute({...command,comment:'Different text'},'alex'),{code:'CONFLICT'});
});
test('server identity, central entitlements and current native rights govern writes',async()=>{
  const f=fixture(),command=await f.command('create');
  await assert.rejects(f.service.execute({...command,actorId:'alex',permissionContext:{create:true}},'reader'),{code:'FORBIDDEN'});
  await f.service.execute({...command,actorId:'jordan',actorSOEID:'FORGED',parentPageId:'999'},'alex');
  const doc=(await f.service.snapshot()).data.documents[0];assert.equal(doc.audit[0].actorId,'alex');assert.equal(doc.audit[0].actorSOEID.toUpperCase(),'AM12345');assert.equal(doc.confluencePageId,'500');
  f.flags.denyUpdate=true;
  await assert.rejects(f.act('edit','alex',{changes:{title:'New title'}}),{code:'FORBIDDEN'});
  assert.equal(f.flags.nativeCalls,1);
});
test('native version conflicts and stale entitlement revisions fail before any write',async()=>{
  const f=fixture();await f.act('create');const count=f.flags.nativeCalls;
  await assert.rejects(f.act('edit','alex',{changes:{title:'New title'},expectedPageVersion:999}),{code:'CONFLICT'});
  await assert.rejects(f.act('edit','alex',{changes:{title:'New title'},expectedEntitlementRevision:999}),{code:'CONFLICT'});
  assert.equal(f.flags.nativeCalls,count);assert.equal((await f.service.snapshot()).pendingRequestId,null);
});
test('new documents cannot choose native page mappings',async()=>{
  const f=fixture();await assert.rejects(f.act('create','alex',{fields:{...f.fields,confluencePageId:'999'}}),/cannot choose/);
  assert.equal(f.flags.nativeCalls,0);
});
test('author cannot bypass review and approve their own revision',async()=>{
  const f=fixture();await f.act('create');await f.act('submit');
  await assert.rejects(f.act('approve','alex',{nextReviewAt:'2027-10-15',approvedBy:'jordan'}),/not allowed/);
  assert.equal(W.currentVersion((await f.service.snapshot()).data.documents[0]).status,'In review');
});
test('deleting also requires native permission on the published page',async()=>{
  const f=fixture();await publish(f);f.flags.denyPublishedDelete=true;
  await assert.rejects(f.act('delete','jordan'),{code:'FORBIDDEN'});
  f.flags.denyPublishedDelete=false;const result=await f.act('delete','jordan');
  assert.equal(result.confluencePageDeleted,true);assert.equal(readerProjection((await f.service.snapshot()).data).documents.length,0);
});
test('native mode refuses unmigrated published fixtures rather than silently adopting page IDs',async()=>{
  assert.throws(()=>readerProjection(seed),{code:'MIGRATION_REQUIRED'});
});
test('failed asynchronous media preflight does not leave a blocked transaction',async()=>{
  const f=fixture();f.opts.publisher.validate=async()=>{throw Error('Upload the remote image first.');};
  await assert.rejects(f.act('create'),/Upload the remote image/);
  assert.equal((await f.service.snapshot()).pendingRequestId,null);assert.equal(f.flags.nativeCalls,0);
});
test('publisher and search root mismatch is rejected before creating a page',async()=>{
  const f=fixture();f.opts.publisher.configurationCheck=async()=>({publishedRootPageId:'999'});
  await assert.rejects(f.act('create'),{code:'CONFIGURATION'});
  assert.equal((await f.service.snapshot()).pendingRequestId,null);assert.equal(f.flags.nativeCalls,0);
});
test('reader projection preflight fails before native writes or a pending transaction',async()=>{
  const f=fixture();f.opts.writeProjection.preflight=async()=>{throw Error('Reader projection exceeds the limit.');};
  await assert.rejects(f.act('create'),/exceeds the limit/);
  assert.equal((await f.service.snapshot()).pendingRequestId,null);assert.equal(f.flags.nativeCalls,0);
});


test('first Insights approval requires exact trusted destination permissions, not business-area create access',async()=>{
 for(const proof of [null,{pageId:'wrong',operations:operations(['read','create'])},{pageId:'400',operations:operations(['read'])},{pageId:'400',operations:operations(['create'])}]){
   const f=fixture();f.fields.type='Blog';f.opts.publisher.publicationDestination=()=>({kind:'insights',parentPageId:'400'});const base=f.opts.nativeAccess;
   f.opts.nativeAccess=async args=>{if(args.action==='approve')assert.deepEqual(args.publicationDestination,{kind:'insights',parentPageId:'400'});return {...await base(args),publicationDestination:proof};};
   await assert.rejects(publish(f),{code:'FORBIDDEN'});const current=W.currentVersion((await f.service.snapshot()).data.documents[0]);assert.equal(current.status,'Awaiting approval');assert.equal(f.flags.nativeCalls,3);
 }
 const f=fixture();f.fields.type='Blog';f.opts.publisher.publicationDestination=()=>({kind:'insights',parentPageId:'400'});const base=f.opts.nativeAccess;f.opts.nativeAccess=async args=>({...await base(args),publicationDestination:{pageId:'400',operations:operations(['read','create'])}});await publish(f);assert.equal(W.currentVersion((await f.service.snapshot()).data.documents[0]).status,'Published');
});
