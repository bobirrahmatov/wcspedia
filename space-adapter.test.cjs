const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const E = require('./entitlements.js');
const C = require('./confluence.js');
const clone = v => JSON.parse(JSON.stringify(v));
const seed = require('./confluence-data-starters/entitlements.json');
const original = require('./confluence-data-starters/wcspedia-published.json');
const catalog = {...original, people:[], documents:[]};
function fixture(role='entitlements', overrides={}) {
  let policy=clone(seed), revision=0, attachmentVersion=1, writes=0;
  const user={type:'known',username:'br47149',displayName:'Bob',userKey:'verified-br47149'};
  const trace=[], commands=[];
  const store={
    user:async()=>clone(user),
    page:async id=>({id,type:'page',space:{key:'wcspedia'},version:{number:1},operations:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}]}),
    readJSON:async()=>({data:clone(policy),revision,attachmentId:'999',attachmentVersion,fingerprint:'999:'+attachmentVersion+':test-digest'}),
    writeJSON:async(id,name,key,data,options)=>{trace.push({id,name,key,options});assert.equal(options.expectedRevision,revision);assert.equal(options.expectedAttachmentVersion,attachmentVersion);assert.equal(options.expectedFingerprint,'999:'+attachmentVersion+':test-digest');policy=clone(data);revision+=2;attachmentVersion++;writes++;}
  };
  const workflow={
    capabilities:async()=>({canCreateDocument:true}),
    load:async input=>{trace.push({skipDocuments:input.skipDocuments,workspaceScope:input.workspaceScope}); const actor={id:'wcs-user-br47149',name:'Bob',role:'Manager',initials:'BR',soeid:'BR47149'};return {...input.access,data:{...clone(input.catalog),people:[actor]},actor,actorId:actor.id,workspaceLoaded:!input.skipDocuments,canSubmit:!input.skipDocuments,mode:'confluence',identityMapped:true,nativePageVersions:{},attachmentVersion:1};},
    submit:async(command,session)=>{commands.push(command);if(commands.length===1){const error=Error('Lost response');error.code='UNKNOWN_COMMIT';throw error;}return session;}
  };
  global.WCSSpaceStorage={create:(config)=>{assert.deepEqual(config.storagePageIds,['200','200']);return store;}};
  global.WCSSpaceWorkflow={create:(config,deps)=>{assert.equal(deps.storage,store);return workflow;}};
  const config={mode:'confluence',authoringMode:'confluence-session',contextPath:'/confluence',spaceKey:'wcspedia',rootPageId:'100',attachmentPageId:'200',pageRole:role,nativePublication:{workingRootPageId:'300',insightsPageId:'400'},...overrides};
  const adapter=C.create(config,{catalog,crypto,location:{href:'https://example.test/confluence/pages/viewpage.action?pageId=100'},fetch:async url=>{trace.push(String(url));if(new URL(url).pathname.endsWith('/content/100'))return new Response(JSON.stringify({id:'100',type:'page',space:{key:'wcspedia'}}));if(String(url).endsWith('/user/current'))return new Response(JSON.stringify(user));throw Error('Unexpected legacy request '+url);}});
  return {adapter,trace,commands,workflow,user,store,get policy(){return policy;},get writes(){return writes;},revoke(){policy.records[0].permissions=policy.records[0].permissions.filter(p=>p!=='entitlements.add');}};
}
test.afterEach(()=>{delete global.WCSSpaceStorage;delete global.WCSSpaceWorkflow;delete global.WCSSpaceEngagement;delete global.WCSSpaceAccessSync;});
test('native adapter loads Entitlements without a global projection or custom endpoint',async()=>{
  const f=fixture();const session=await f.adapter.load();
  assert.equal(session.effectivePermissions['entitlements.add'],true);
  assert.equal(f.trace.find(x=>typeof x==='object').skipDocuments,true);
  assert.equal(f.adapter.info().workflowConfigured,true);
  assert.equal(f.adapter.info().entitlementServiceConfigured,true);
  assert.equal(f.trace.filter(x=>typeof x==='string').every(x=>['/confluence/rest/api/content/100','/confluence/rest/api/user/current'].includes(new URL(x).pathname)),true);
});
test('policy repair validates the reviewed file and is restricted to the native Entitlements interface',async()=>{
 const f=fixture(),calls=[];
 const preview={canRepair:true,data:clone(seed),pageId:'200',filename:'entitlements.json',candidate:{id:'999',version:2,bytes:200}};
 f.store.inspectJSON=async(...args)=>{calls.push(['inspect',...args]);return clone(preview);};
 f.store.reconcileJSON=async(...args)=>{calls.push(['repair',...args]);};
 await assert.rejects(f.adapter.reconcileEntitlementAttachment(),{code:'NOT_LOADED'});
 const shown=await f.adapter.inspectEntitlementRecovery();shown.data.records=[];
 assert.equal(calls[0][1],'200');assert.equal(calls[0][2],'entitlements.json');assert.equal(calls[0][3],'wcspedia.entitlements.v1');
 await f.adapter.reconcileEntitlementAttachment();
 assert.deepEqual(calls[1][1].data,seed,'Caller edits cannot change the captured recovery policy');
 assert.match(calls[1][2].requestId,/^entitlement-recovery-/);
 await assert.rejects(f.adapter.reconcileEntitlementAttachment(),{code:'NOT_LOADED'});
 const other=fixture('saved');
 await assert.rejects(other.adapter.inspectEntitlementRecovery(),{code:'CONFIGURATION'});
});
test('malformed policy or native read-only access cannot prepare entitlement recovery',async()=>{
 for(const invalid of ['policy','permission','size']){
  const f=fixture();let writes=0;
  f.store.inspectJSON=async()=>({canRepair:invalid!=='permission',data:invalid==='policy'?{records:[]}:clone(seed),candidate:{bytes:invalid==='size'?3*1024*1024:100}});
  f.store.reconcileJSON=async()=>{writes++;};
  await assert.rejects(f.adapter.inspectEntitlementRecovery(),e=>['INVALID_ENTITLEMENTS','FORBIDDEN'].includes(e.code));
  await assert.rejects(f.adapter.reconcileEntitlementAttachment(),{code:'NOT_LOADED'});
  assert.equal(writes,0);
 }
});
test('native Saved discovery session does not read JSON policy or enumerate Working documents',async()=>{
 const f=fixture('saved');
 f.store.readJSON=async()=>{throw Error('Policy reference is broken');};
 f.workflow.load=async()=>{throw Error('Private workspace must not load');};
 const session=await f.adapter.load({discoveryOnly:true});
 assert.equal(session.discoveryOnly,true);assert.equal(session.workspaceLoaded,false);assert.equal(session.canSubmit,false);
 assert.equal(session.identity.soeid,'BR47149');assert.equal(session.effectivePermissions['content.create'],false);
 assert.deepEqual(session.data.documents,[]);
});
test('native policy save refreshes grants, CAS-writes existing JSON and confirms its audit',async()=>{
  const f=fixture();await f.adapter.load();
  const result=await f.adapter.submitEntitlementCommand({action:'add',expectedRevision:1,comment:'Add colleague',record:{id:'colleague',soeid:'AB12345',displayName:'Colleague',scope:'*',permissions:['content.create','content.edit'],active:true}});
  assert.equal(f.writes,1);assert.equal(result.entitlementPolicy.revision,2);
  const write=f.trace.find(x=>x.options);assert.equal(write.id,'200');assert.equal(write.name,'entitlements.json');assert.match(write.options.requestId,/^[a-f0-9-]{36}$/);
  assert.equal(E.validatePolicy(result.entitlementPolicy).audit[0].actorSOEID,'BR47149');
});
test('revoked entitlement and changed signed-in identity cannot save using stale UI grants',async()=>{
  const f=fixture();await f.adapter.load();f.revoke();
  const command={action:'add',expectedRevision:1,comment:'Add colleague',record:{id:'colleague',soeid:'AB12345',displayName:'Colleague',scope:'*',permissions:['content.create'],active:true}};
  await assert.rejects(f.adapter.submitEntitlementCommand(command),{code:'FORBIDDEN'});assert.equal(f.writes,0);
  f.user.userKey='different-account';await assert.rejects(f.adapter.submitEntitlementCommand(command),{code:'IDENTITY_MAPPING'});assert.equal(f.writes,0);
});
test('a changed policy file requires review before saving even if its manual JSON revision was not incremented',async()=>{
 const f=fixture();await f.adapter.load();
 const read=f.store.readJSON;f.store.readJSON=async()=>({...await read(),attachmentId:'replacement',fingerprint:'replacement:1:different'});
 await assert.rejects(f.adapter.submitEntitlementCommand({action:'add',expectedRevision:1,comment:'Add colleague',record:{id:'colleague',soeid:'AB12345',displayName:'Colleague',scope:'*',permissions:['content.create'],active:true}}),{code:'CONFLICT'});
 assert.equal(f.writes,0);
});
test('workflow adapter retains request identity after unknown outcome and refreshes through native module',async()=>{
  const f=fixture('mine');await f.adapter.load();
  const command={action:'create',comment:'Draft',fields:{id:'doc-test'}};
  await assert.rejects(f.adapter.submitAction(command),{code:'UNKNOWN_COMMIT'});
  await f.adapter.submitAction(command);
  assert.equal(f.commands[0].requestId,f.commands[1].requestId);assert.equal(f.commands[0].expectedEntitlementRevision,1);
});
test('draft setup failures do not block policy administration; creation remains unavailable',async()=>{
  const f=fixture();f.workflow.capabilities=async()=>{throw Error('Restrict the working root');};
  const session=await f.adapter.load();assert.equal(session.effectivePermissions['content.create'],false);
  assert.equal(session.effectivePermissions['entitlements.edit'],true);assert.match(session.creationMessage,/Restrict/);
});
test('unknown workflow retry keeps the complete original payload after a workspace reload',async()=>{
  const f=fixture('mine'), originalLoad=f.workflow.load;
  let nativeVersion=7;
  f.workflow.load=async input=>({...await originalLoad(input),nativePageVersions:{'doc-test':nativeVersion}});
  await f.adapter.load();
  const command={action:'edit',docId:'doc-test',comment:'Revision',fields:{title:'Revised document'}};
  await assert.rejects(f.adapter.submitAction(command),{code:'UNKNOWN_COMMIT'});
  nativeVersion=8;
  await f.adapter.load();
  await f.adapter.submitAction(command);
  assert.equal(f.commands[0].expectedPageVersion,7);
  assert.deepEqual(f.commands[1],f.commands[0]);
});
test('native mode ignores stale custom capability endpoint settings',async()=>{
  const f=fixture('entitlements',{workflowEndpoint:'/confluence/legacy-workflow',workspaceEndpoint:'/confluence/legacy-workspace'});
  const session=await f.adapter.load();
  assert.equal(session.effectivePermissions['content.create'],true);
  assert.equal(f.trace.filter(x=>typeof x==='string').some(x=>x.includes('legacy-')),false);
});

function metricFixture(count=12) {
  const sample=require('./wcspedia-data.json'),template=sample.documents.find(doc=>doc.publishedVersion&&doc.versions.length===1);
  const documents=Array.from({length:count},(_,index)=>({...clone(template),id:'metric-'+index,confluencePageId:String(1000+index),publishedConfluencePageId:String(2000+index),publishedConfluencePageVersion:3}));
  const calls={create:[],load:[],record:[]},f=fixture('mine',{metricsEndpoint:'/confluence/legacy-metrics'}),originalLoad=f.workflow.load;
  f.workflow.load=async input=>{const session=await originalLoad(input);session.data.people.push(...clone(sample.people));session.data.documents=clone(documents);return session;};
  const engagement={
    load:async pageId=>{calls.load.push(pageId);return {schemaVersion:1,pageId,pageVersion:3,views:{recordedViews:Number(pageId)-2000}};},
    recordView:async(...args)=>{calls.record.push(args);return {recordedViews:8,counted:true};}
  };
  global.WCSSpaceEngagement={create:(config,deps)=>{calls.create.push({config,deps});return engagement;}};
  return {...f,documents,calls,engagement};
}
test('native metrics read only explicit visible keys, deduplicate them and ignore the legacy endpoint',async()=>{
  const f=metricFixture();await f.adapter.load();
  assert.deepEqual(f.calls.load,[],'Session startup must not scan the library for counts');
  assert.equal(f.calls.create.length,0,'The engagement helper is lazy');
  const counts=await f.adapter.loadMetrics(['metric-7','metric-2','metric-7']);
  assert.deepEqual({...counts},{'metric-7':7,'metric-2':2});
  assert.deepEqual(f.calls.load,['2007','2002'],'Only published page mappings are read');
  assert.equal(f.calls.create.length,1);assert.equal(f.calls.create[0].deps.origin,'https://example.test');
  assert.equal(f.trace.filter(x=>typeof x==='string').some(x=>x.includes('legacy-metrics')),false);
  f.calls.load.length=0;
  assert.deepEqual({...await f.adapter.loadMetrics([])},{});assert.deepEqual(f.calls.load,[]);
});
test('native metrics refuse implicit, malformed and unbounded key lists before any read',async()=>{
  const f=metricFixture();await f.adapter.load();
  for(const input of [undefined,null,'metric-1',[null],['bad key'],Array(51).fill('metric-1')]){
    await assert.rejects(f.adapter.loadMetrics(input),{code:'INVALID_METRICS'});
  }
  await assert.rejects(f.adapter.loadMetrics(['metric-0','not-loaded']),{code:'METRICS_UNAVAILABLE'});
  assert.deepEqual(f.calls.load,[],'All requested mappings are validated before workers start');
});
test('native metrics require a loaded published mapping and never substitute its working page',async()=>{
  const f=metricFixture();
  await assert.rejects(f.adapter.loadMetrics(['metric-0']),{code:'METRICS_UNAVAILABLE'});
  delete f.documents[0].publishedConfluencePageId;
  f.documents[1].deletedAt='2026-10-17T10:00:00.000Z';
  f.documents[2].publishedVersion=null;f.documents[2].versions[0].status='Draft';
  await f.adapter.load();
  for(const key of ['metric-0','metric-1','metric-2'])await assert.rejects(f.adapter.loadMetrics([key]),{code:'METRICS_UNAVAILABLE'});
  assert.deepEqual(f.calls.load,[]);
});
test('native metric read concurrency stays at four even for a longer visible page',async()=>{
  const f=metricFixture(13),waiting=[];let active=0,peak=0;
  f.engagement.load=pageId=>{f.calls.load.push(pageId);active++;peak=Math.max(peak,active);return new Promise(resolve=>waiting.push(()=>{active--;resolve({pageId,views:{recordedViews:2}});}));};
  await f.adapter.load();
  let done=false;const pending=f.adapter.loadMetrics(f.documents.map(doc=>doc.id)).then(result=>{done=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(active,4);assert.equal(f.calls.load.length,4);
  while(!done){const batch=waiting.splice(0);for(const release of batch)release();await new Promise(resolve=>setImmediate(resolve));}
  const result=await pending;assert.equal(peak,4);assert.equal(active,0);assert.equal(Object.keys(result).length,13);assert.equal(f.calls.load.length,13);
});
test('native metric reads reject foreign pages and malformed counts instead of reporting zero',async()=>{
  const f=metricFixture();await f.adapter.load();
  const invalid=[null,{}, {pageId:'9999',views:{recordedViews:1}},...[-1,1.5,Number.MAX_SAFE_INTEGER+1,'2',NaN,null,undefined].map(recordedViews=>({pageId:'2000',views:{recordedViews}}))];
  for(const value of invalid){f.engagement.load=async()=>value;await assert.rejects(f.adapter.loadMetrics(['metric-0']),{code:'INVALID_METRICS'});}
  f.engagement.load=async()=>{const error=Error('Native access denied');error.code='FORBIDDEN';throw error;};
  await assert.rejects(f.adapter.loadMetrics(['metric-0']),{code:'FORBIDDEN'});
});
test('native view writes require the exact approved version and revision and let the module own its retry receipt',async()=>{
  const f=metricFixture(),v=f.documents[0].versions[0];await f.adapter.load();
  const command={documentKey:'metric-0',version:v.version,revision:v.revision,requestId:'legacy-generic-uuid'};
  await assert.rejects(f.adapter.recordView({...command,version:v.version+1}),{code:'CONFLICT'});
  await assert.rejects(f.adapter.recordView({...command,revision:v.revision+1}),{code:'CONFLICT'});
  assert.deepEqual(f.calls.record,[]);
  assert.deepEqual(await f.adapter.recordView(command),{documentKey:'metric-0',views:8,counted:true});
  assert.deepEqual(f.calls.record,[['2000']],'The native module creates its timestamped receipt; generic UUIDs must not be forwarded');
  assert.equal(f.trace.filter(x=>typeof x==='string').some(x=>x.includes('legacy-metrics')),false);
});
test('native view writes require a valid recordedViews receipt and preserve unknown outcomes',async()=>{
  const f=metricFixture(),v=f.documents[0].versions[0];await f.adapter.load();
  const command={documentKey:'metric-0',version:v.version,revision:v.revision};
  for(const value of [null,{}, {views:8,counted:true},{recordedViews:0},{recordedViews:0,counted:'true'},...[-1,1.5,'2',Number.MAX_SAFE_INTEGER+1].map(recordedViews=>({recordedViews,counted:true}))]){
    f.engagement.recordView=async()=>value;await assert.rejects(f.adapter.recordView(command),{code:'UNKNOWN_COMMIT'});
  }
  f.engagement.recordView=async()=>({recordedViews:0,counted:false});
  assert.deepEqual(await f.adapter.recordView(command),{documentKey:'metric-0',views:0,counted:false});
  let attempts=0;f.engagement.recordView=async()=>{attempts++;const error=Error('Commit not confirmed');error.code='UNKNOWN_COMMIT';throw error;};
  await assert.rejects(f.adapter.recordView(command),{code:'UNKNOWN_COMMIT'});assert.equal(attempts,1,'Adapter must not automatically replay native writes');
});

test('native adapter passes explicit lightweight route scopes to the workflow',async()=>{
  const f=fixture('mine');await f.adapter.load({workspaceScope:'create'});
  assert.equal(f.trace.find(x=>typeof x==='object').workspaceScope,'create');
});

const addSyncUser=()=>({action:'add',expectedRevision:1,comment:'Add colleague',record:{id:'sync-colleague',soeid:'AB12345',displayName:'Colleague',scope:'*',permissions:['content.create','content.edit'],active:true}});
function syncFixture(){
 const state={calls:0,fail:false,status:{status:'not-configured'}};
 global.WCSSpaceAccessSync={create:(config,deps)=>({status:async()=>state.status,sync:async()=>{state.calls++;assert.equal(config.entitlementsPageId,'200');const p=await deps.loadPolicy();assert.ok(p.records.some(r=>r.soeid==='AB12345'));if(state.fail)throw Error('Native grant denied');state.status={status:'complete',policyRevision:p.revision,message:'Access synchronized'};return state.status;}})};
 return {f:fixture('entitlements',{nativeAccessSync:true}),state};
}
test('native entitlement commit automatically synchronizes the verified new policy',async()=>{
 const {f,state}=syncFixture();await f.adapter.load();assert.equal(state.calls,0,'Loading is read-only');
 const result=await f.adapter.submitEntitlementCommand(addSyncUser());assert.equal(f.writes,1);assert.equal(state.calls,1);assert.equal(result.entitlementSync.status,'complete');assert.equal(result.entitlementSync.policyRevision,2);
});
test('failed native sync preserves JSON success and Sync access retries without another entitlement write',async()=>{
 const {f,state}=syncFixture();await f.adapter.load();state.fail=true;
 const result=await f.adapter.submitEntitlementCommand(addSyncUser());assert.equal(result.entitlementSync.status,'incomplete');assert.equal(result.entitlementPolicy.revision,2);assert.equal(f.writes,1);
 state.fail=false;const retried=await f.adapter.syncEntitlementAccess();assert.equal(retried.entitlementSync.status,'complete');assert.equal(f.writes,1);assert.equal(state.calls,2);
});
test('lost JSON response is reconciled before sync without duplicating the entitlement',async()=>{
 const {f,state}=syncFixture();await f.adapter.load();const write=f.store.writeJSON;
 f.store.writeJSON=async(...args)=>{await write(...args);throw Object.assign(Error('Response lost'),{code:'UNKNOWN_COMMIT'});};
 await assert.rejects(f.adapter.submitEntitlementCommand(addSyncUser()),{code:'UNKNOWN_COMMIT'});assert.equal(state.calls,0);assert.equal(f.writes,1);
 const result=await f.adapter.submitEntitlementCommand(addSyncUser());assert.equal(result.entitlementSync.status,'complete');assert.equal(f.writes,1);assert.equal(state.calls,1);assert.equal(result.entitlementPolicy.records.filter(r=>r.soeid==='AB12345').length,1);
});

test('automatic sync refreshes creation capabilities before returning the Entitlements session',async()=>{
 const {f,state}=syncFixture();f.workflow.capabilities=async()=>({canCreateDocument:state.calls>0});
 const before=await f.adapter.load();assert.equal(before.effectivePermissions['content.create'],false);
 const after=await f.adapter.submitEntitlementCommand(addSyncUser());assert.equal(after.effectivePermissions['content.create'],true);assert.equal(after.entitlementSync.status,'complete');
});

for(const role of ['mine','review'])test('native '+role+' startup defers duplicate capability probe to its verified workspace load',async()=>{
 const f=fixture(role);let loads=0,duplicates=0;
 f.workflow.capabilities=async()=>{duplicates++;throw Error('Duplicate native boundary read');};
 const original=f.workflow.load;
 f.workflow.load=async input=>{loads++;assert.equal(input.skipDocuments,false);return original(input);};
 const session=await f.adapter.load({workspaceScope:role});
 assert.equal(loads,1);assert.equal(duplicates,0);assert.equal(session.workspaceLoaded,true);
 // Standalone Add-widget access still checks native capability.
 let probes=0;f.workflow.capabilities=async()=>{probes++;return {canCreateDocument:false,reason:'Native permission denied'};};
 const access=await f.adapter.loadAccess();assert.equal(probes,1);assert.equal(access.effectivePermissions['content.create'],false);
});
