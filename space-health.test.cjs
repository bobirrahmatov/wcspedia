'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const Service=require('./health-service.js'),Native=require('./space-health.js'),H=require('./content-health.js'),E=require('./entitlements.js'),seed=require('./wcspedia-data.json');
const clone=v=>JSON.parse(JSON.stringify(v)),NOW='2026-10-17T12:00:00.000Z';
const config={mode:'confluence',authoringMode:'confluence-session',spaceKey:'wcspedia',rootPageId:'100',attachmentPageId:'200',contextPath:'/confluence',nativePublication:{workingRootPageId:'300',insightsPageId:'400',areaPageIds:{'credit-approval-control':'500'}}};
function fixture(){
  const doc=clone(seed.documents[0]);doc.versions=[doc.versions[0]];doc.nativeSessionWorkflow=true;doc.confluencePageId='301';doc.publishedConfluencePageId='501';doc.publishedConfluencePageVersion=4;
  const people=clone(seed.people),actor=people.find(p=>p.id==='jordan'),user={type:'known',username:actor.soeid.toLowerCase(),userKey:'key-jordan'},policy={schemaVersion:1,revision:1,audit:[],records:[{id:'manager',soeid:actor.soeid,displayName:actor.name,scope:'*',permissions:E.PERMISSIONS,active:true}]};
  const marker='<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">wcs-document-'+doc.id+'</ac:parameter></ac:structured-macro>';
  const page=(id,ancestors,version)=>({id,type:'page',status:'current',space:{key:'wcspedia'},ancestors:ancestors.map(id=>({id})),version:{number:version},body:{storage:{value:marker}},operations:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}]});
  const pages=new Map([['301',page('301',['100','300'],1)],['501',page('501',['100','500'],4)]]),props=new Map(),health={data:null,revision:0,attachmentVersion:0,pointer:null};let writes=0,writeMode='',beforeWrite=null,afterJournal=null;
  const db={
    user:async()=>clone(user),page:async id=>{if(!pages.has(id))throw Object.assign(Error('Not found'),{code:'NOT_FOUND'});return clone(pages.get(id));},
    property:async(id,key)=>clone(props.get(id+':'+key)||null),
    putProperty:async(id,key,value,expected)=>{const old=props.get(id+':'+key);if((old?.version.number||null)!==expected)throw Object.assign(Error('CAS conflict'),{code:'CONFLICT'});const next={id:'900',key,value:clone(value),version:{number:(expected||0)+1}};props.set(id+':'+key,next);if(afterJournal&&key===Native.JOURNAL&&!value.done)await afterJournal();return clone(next);},
    readJSON:async(id,name)=>{if(name==='entitlements.json')return {data:clone(policy),revision:0,attachmentVersion:1};if(name==='wcspedia-document.json')return {data:{schemaVersion:1,document:clone(doc),people:clone(people)},revision:2,attachmentVersion:1,pointer:null};assert.equal(name,Native.FILE);assert.equal(id,'301');return clone(health);},
    writeJSON:async(id,name,key,value,input)=>{assert.equal(id,'301');assert.equal(name,Native.FILE);assert.equal(key,Native.KEY);assert.match(input.requestId,/^health-/);if(beforeWrite)await beforeWrite();if(health.revision!==input.expectedRevision||health.attachmentVersion!==input.expectedAttachmentVersion)throw Object.assign(Error('Changed'),{code:'CONFLICT'});if(writeMode==='before'){writeMode='';throw Object.assign(Error('Lost confirmation'),{code:'UNKNOWN_COMMIT'});}writes++;health.data=clone(value);health.revision+=2;health.attachmentVersion++;if(writeMode==='after'){writeMode='';throw Object.assign(Error('Lost confirmation'),{code:'UNKNOWN_COMMIT'});}return clone(health);}
  };
  const service=extra=>Service.create({config,identity:{soeid:actor.soeid},nativeStorage:db,crypto:webcrypto,now:()=>NOW,getContext:()=>({document:doc,people,actor,canEdit:true,signedSOEID:actor.soeid}),...extra});
  const cmd=(action='update-rules',revision=0,fields={})=>({action,expectedRevision:revision,expectedPublishedVersion:1,expectedPublishedRevision:1,reason:'Review schedule agreed with owner.',rules:{...H.defaults(),reviewWarningDays:45},...fields});
  return {service,doc,people,actor,user,policy,pages,props,health,db,cmd,get writes(){return writes;},set writeMode(v){writeMode=v;},set beforeWrite(v){beforeWrite=v;},set afterJournal(v){afterJournal=v;}};
}
test('native service saves rules and audit per managed document and reopens without custom services',async()=>{
  const f=fixture(),s=f.service();assert.equal(s.available,true);assert.equal(s.native,true);assert.deepEqual(Object.keys(await s.load([f.doc])),[]);
  const result=await s.submit(f.doc.id,f.cmd());assert.equal(result.rules.reviewWarningDays,45);assert.equal(result.revision,1);assert.equal(result.audit[0].actorId,'jordan');assert.equal(result.audit[0].actorSOEID,'jl12345');
  const reopened=(await f.service().load([f.doc]))[f.doc.id];assert.deepEqual(reopened,result);assert.equal(f.writes,1);assert.equal(f.props.get('301:'+Native.JOURNAL).value.done,true);
});
test('two native clients preserve the first rules and reject stale revision writes',async()=>{
  const f=fixture(),a=f.service(),b=f.service(),result=await Promise.allSettled([a.submit(f.doc.id,f.cmd()),b.submit(f.doc.id,f.cmd('update-rules',0,{rules:{...H.defaults(),reviewWarningDays:90}}))]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.ok(['HEALTH_PENDING','HEALTH_CONFLICT','CONFLICT'].includes(result.find(r=>r.status==='rejected').reason.code));assert.equal(f.writes,1);assert.equal(f.health.data.record.audit.length,1);
});
test('current policy revocation and native edit removal both reject cached UI permissions',async()=>{
  for(const denial of ['policy','native']){const f=fixture(),s=f.service();await s.load([f.doc]);if(denial==='policy')f.policy.records[0].active=false;else f.pages.get('301').operations=[];await assert.rejects(s.submit(f.doc.id,f.cmd()),{code:'HEALTH_FORBIDDEN'});assert.equal(f.writes,0);}
});
test('policy is reread again after reserving an operation before attachment commit',async()=>{
  const f=fixture();f.afterJournal=async()=>{f.policy.records[0].active=false;};await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_FORBIDDEN'});assert.equal(f.writes,0);
});
test('retained Manager directory role cannot authorize a revoked manager',async()=>{
  const f=fixture();f.policy.records[0].permissions=['content.edit'];await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_FORBIDDEN'});assert.equal(f.people.find(p=>p.id==='jordan').role,'Manager');assert.equal(f.writes,0);
});
test('identity switching does not inherit an already opened manager action',async()=>{
  const f=fixture(),s=f.service();await s.load([f.doc]);f.user.username='AM12345';await assert.rejects(s.submit(f.doc.id,f.cmd()),{code:'HEALTH_IDENTITY'});assert.equal(f.writes,0);
});
test('native published modifications and spoofed Working document mappings fail closed',async()=>{
  for(const change of ['native-version','other-working-parent','marker','other-space']){const f=fixture();if(change==='native-version')f.pages.get('501').version.number++;if(change==='other-working-parent')f.pages.get('301').ancestors=[{id:'999'}];if(change==='marker')f.pages.get('301').body.storage.value='Other document';if(change==='other-space')f.pages.get('501').space.key='unrelated';await assert.rejects(f.service().submit(f.doc.id,f.cmd()),e=>['HEALTH_SCOPE','HEALTH_SOURCE_CHANGED'].includes(e.code));assert.equal(f.writes,0);}
});
test('source-bound review evidence uses authoritative approved content, not passed actor fields',async()=>{
  const f=fixture(),version=f.doc.versions[0],command=f.cmd('record-review-trigger',0,{triggerType:'feedback',evidence:'Readers report a missing step.',expectedFingerprint:H.sourceFingerprint(version),actor:{id:'forged',role:'Manager'},signedSOEID:'forged'});
  const record=await f.service().submit(f.doc.id,command);assert.equal(record.cases[0].sourceFingerprint,H.sourceFingerprint(version));assert.equal(record.cases[0].actorId,'jordan');assert.equal(record.cases[0].actorSOEID,'jl12345');assert.equal(f.props.get('301:'+Native.JOURNAL).value.command.actor,undefined);
  const stale=f.cmd('record-review-trigger',record.revision,{triggerType:'feedback',evidence:'Changed',expectedFingerprint:'sha256:'+'0'.repeat(64)});await assert.rejects(f.service().submit(f.doc.id,stale),{code:'HEALTH_CONFLICT'});assert.equal(f.writes,1);
});
test('lost committed response reconciles after reopening without another upload or audit',async()=>{
  const f=fixture();f.writeMode='after';await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'UNKNOWN_COMMIT'});assert.equal(f.writes,1);
  const result=await f.service().submit(f.doc.id,f.cmd());assert.equal(result.revision,1);assert.equal(result.audit.length,1);assert.equal(f.writes,1);assert.equal(f.props.get('301:'+Native.JOURNAL).value.done,true);
});
test('unconfirmed original action retains its timestamp and can resume after reopening',async()=>{
  const f=fixture();f.writeMode='before';await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'UNKNOWN_COMMIT'});assert.equal(f.writes,0);
  const result=await f.service({now:()=>new Date(Date.parse(NOW)+60000).toISOString()}).submit(f.doc.id,f.cmd());assert.equal(result.audit[0].at,NOW);assert.equal(f.writes,1);
});
test('a pending action cannot be replaced with a different command',async()=>{
  const f=fixture();f.writeMode='before';await assert.rejects(f.service().submit(f.doc.id,f.cmd()));await assert.rejects(f.service().submit(f.doc.id,f.cmd('update-rules',0,{reason:'Different change'})),{code:'HEALTH_PENDING'});assert.equal(f.writes,0);
});
test('newly published snapshot during reservation prevents saving rules against stale source',async()=>{
  const f=fixture();f.afterJournal=async()=>{f.doc.versions[0].summary='New approved summary';};await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_SOURCE_CHANGED'});assert.equal(f.writes,0);
});
test('unmanaged or unpublished documents cannot receive fabricated approval-bound health edits',async()=>{
  const f=fixture(),s=f.service();delete f.doc.nativeSessionWorkflow;assert.deepEqual(Object.keys(await s.load([f.doc])),[]);assert.equal(s.supports(f.doc),false);await assert.rejects(s.submit(f.doc.id,f.cmd()),{code:'HEALTH_UNMANAGED'});f.doc.nativeSessionWorkflow=true;f.doc.publishedVersion=null;await assert.rejects(s.submit(f.doc.id,f.cmd()),{code:'HEALTH_UNPUBLISHED'});assert.equal(f.writes,0);
});
test('corrupt health data is preserved and does not become fresh default rules',async()=>{
  const f=fixture();f.health.data={schemaVersion:1,documentKey:'wrong',workingPageId:'301',record:{}};await assert.rejects(f.service().load([f.doc]),{code:'HEALTH_CORRUPT'});await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_CORRUPT'});assert.equal(f.writes,0);
});
test('pending document publication blocks health writes until workflow recovery completes',async()=>{
  const f=fixture();f.props.set('301:wcspedia.workflow.operation',{value:{done:false}});await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_WORKFLOW_PENDING'});assert.equal(f.writes,0);
});

test('load exposes only the original author’s pending recovery and recover replays that saved command',async()=>{
  const f=fixture();f.writeMode='after';await assert.rejects(f.service().submit(f.doc.id,f.cmd()),error=>error.code==='UNKNOWN_COMMIT'&&error.retryOriginal===true);
  const reopened=f.service();await assert.rejects(reopened.load([f.doc]),error=>error.recoveryDocumentId===f.doc.id);const result=await reopened.recover(f.doc.id);assert.equal(result.rules.reviewWarningDays,45);assert.equal(f.writes,1);assert.equal((await reopened.load([f.doc]))[f.doc.id].revision,1);
});
test('oversized health history fails before reserving a native operation and preserves existing evidence',async()=>{
  const f=fixture(),record=H.initial(f.doc);record.padding='x'.repeat(10000000);f.health.data={schemaVersion:1,documentKey:f.doc.id,workingPageId:'301',record};await assert.rejects(f.service().submit(f.doc.id,f.cmd()),{code:'HEALTH_LIMIT'});assert.equal(f.props.has('301:'+Native.JOURNAL),false);assert.equal(f.writes,0);assert.equal(f.health.data.record.padding.length,10000000);
});

test('a committed health action can be acknowledged after a later native content edit without replaying the action',async()=>{
  const f=fixture();f.writeMode='after';await assert.rejects(f.service().submit(f.doc.id,f.cmd()));f.pages.get('501').version.number++;
  const result=await f.service().recover(f.doc.id);assert.equal(result.revision,1);assert.equal(f.writes,1);assert.equal(f.props.get('301:'+Native.JOURNAL).value.done,true);await assert.rejects(f.service().submit(f.doc.id,f.cmd('update-rules',1)),{code:'HEALTH_SOURCE_CHANGED'});
});
test('a definite pre-write source change releases its untouched prepared journal and allows a new action',async()=>{
  const f=fixture();f.afterJournal=async()=>{f.doc.versions[0].summary='Approved content was updated.';};
  await assert.rejects(f.service().submit(f.doc.id,f.cmd()),error=>error.code==='HEALTH_SOURCE_CHANGED'&&error.operationAborted===true);
  const journal=f.props.get('301:'+Native.JOURNAL).value;assert.equal(journal.done,true);assert.equal(journal.aborted,true);assert.equal(journal.writeStarted,false);assert.equal(f.writes,0);
  f.afterJournal=null;const saved=await f.service().submit(f.doc.id,f.cmd('update-rules',0,{reason:'Rules for the refreshed approved content.'}));assert.equal(saved.revision,1);assert.equal(f.writes,1);assert.notEqual(f.props.get('301:'+Native.JOURNAL).value.requestId,journal.requestId);
});
test('revocation before attachment writing releases the journal instead of permanently locking rules',async()=>{
  const f=fixture(),original=clone(f.policy);f.afterJournal=async()=>{f.policy.records[0].active=false;};await assert.rejects(f.service().submit(f.doc.id,f.cmd()),error=>error.code==='HEALTH_FORBIDDEN'&&error.operationAborted===true);
  assert.equal(f.props.get('301:'+Native.JOURNAL).value.aborted,true);assert.equal(f.writes,0);f.policy.records=original.records;f.afterJournal=null;
  assert.equal((await f.service().submit(f.doc.id,f.cmd())).revision,1);assert.equal(f.writes,1);
});
test('manager downgrade between checks cannot persist a manager-verified owner review',async()=>{
  const f=fixture();f.doc.ownerId='jordan';f.afterJournal=async()=>{f.policy.records[0].permissions=['content.edit'];};
  const command=f.cmd('document-reviewed',0,{outcome:'no-change',evidence:'Reviewed the current guidance.',expectedFingerprint:H.sourceFingerprint(f.doc.versions[0])});
  await assert.rejects(f.service().submit(f.doc.id,command),error=>error.code==='HEALTH_AUTHORITY_CHANGED'&&error.operationAborted===true);assert.equal(f.writes,0);assert.equal(f.health.data,null);assert.equal(f.props.get('301:'+Native.JOURNAL).value.aborted,true);
  f.afterJournal=null;const record=await f.service().submit(f.doc.id,command);assert.equal(record.reviews[0].verified,false);assert.equal(record.reviews[0].verifiedByRole,null);assert.equal(f.writes,1);
});
test('safe abort never clears an attachment that is pending or no longer matches the journal baseline',async()=>{
  for(const divergence of ['pending','changed']){const f=fixture();f.afterJournal=async()=>{f.doc.versions[0].summary='Changed source';if(divergence==='pending')f.health.pointer={pending:{requestId:'other-write'}};else f.health.revision++;};await assert.rejects(f.service().submit(f.doc.id,f.cmd()),error=>error.code==='HEALTH_SOURCE_CHANGED'&&!error.operationAborted);assert.equal(f.props.get('301:'+Native.JOURNAL).value.done,false);assert.equal(f.writes,0);}
});
test('a writing-phase unknown outcome remains pending even when the current file still looks unchanged',async()=>{
  const f=fixture();f.writeMode='before';await assert.rejects(f.service().submit(f.doc.id,f.cmd()),error=>error.code==='UNKNOWN_COMMIT'&&error.retryOriginal===true&&!error.operationAborted);const op=f.props.get('301:'+Native.JOURNAL).value;assert.equal(op.writeStarted,true);assert.equal(op.done,false);assert.equal(f.health.data,null);
});
test('single-page Insights never writes private health evidence on its public article or blocks other health loads',async()=>{
 const f=fixture();f.doc.singlePageInsight=true;const s=f.service();
 assert.equal(s.supports(f.doc),false);assert.deepEqual(Object.keys(await s.load([f.doc])),[]);
 await assert.rejects(s.submit(f.doc.id,f.cmd()),e=>e.code==='HEALTH_UNMANAGED'&&/Private review cases/.test(e.message));assert.equal(f.writes,0);
});
