/* Self-contained loopback verification. Owns and stops its mock child process;
 * no requests leave 127.0.0.1. This does not certify a production service.
 */
'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const API=require('../confluence.js'), W=require('../workflow.js');
const seed=require('../wcspedia-data.json');
const port=Number(process.env.WCS_METRICS_TEST_PORT||4176);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local metrics test port.');
const origin='http://127.0.0.1:'+port;
const published=seed.documents.filter(doc=>W.publishedVersion(doc));
const target=published[0],denied=published[1],draft=seed.documents.find(doc=>!W.publishedVersion(doc));
assert.ok(target&&denied&&draft,'The local test needs published and unpublished fixtures.');
const server=spawn(process.execPath,[path.join(__dirname,'../mock-confluence.cjs')],{env:{...process.env,WCS_MOCK_PORT:String(port),WCS_MOCK_ACTOR:'jordan',WCS_MOCK_DENY_READ_DOCUMENTS:denied.id},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Mock startup timed out.')),10000);
  server.once('error',error=>{clearTimeout(timer);reject(error);});
  server.once('exit',code=>{clearTimeout(timer);reject(Error('Mock exited before readiness: '+code));});
  server.stderr.on('data',chunk=>{clearTimeout(timer);reject(Error(String(chunk)));});
  server.stdout.on('data',chunk=>{if(String(chunk).includes('Local Confluence simulation:')){clearTimeout(timer);resolve();}});
});
const config={mode:'confluence',rootPageId:'100',contextPath:'/confluence',workspaceEndpoint:'/confluence/mock/workspace',workflowEndpoint:'/confluence/mock/actions',entitlementsPageId:'150',entitlementsEndpoint:'/confluence/mock/entitlements',metricsEndpoint:'/confluence/mock/metrics'};
const client=API.create(config,{fetch,location:{href:origin+'/mock-live.html'},DOMParser:new JSDOM('').window.DOMParser});
const headers=id=>({'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':id});
const post=(command,extra={})=>fetch(origin+'/confluence/mock/metrics',{method:'POST',headers:{...headers(command.requestId),...extra},body:JSON.stringify(command)});
async function get(route){const response=await fetch(origin+route);assert.equal(response.status,200);return response.json();}
(async()=>{
  await ready;
  const initial=await client.load();
  const counts=await client.loadMetrics();
  assert.equal(counts[target.id],0);assert.equal(counts[denied.id],undefined);assert.equal(counts[draft.id],undefined);
  assert.ok(Object.values(counts).every(count=>count===0),'fresh server counts begin at zero');
  const v=W.publishedVersion(target);
  const command={rootPageId:'100',documentKey:target.id,version:v.version,revision:v.revision,requestId:randomUUID()};
  assert.equal((await post(command,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await fetch(origin+'/confluence/mock/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)})).status,403);
  for(const injected of [{actorSOEID:'FORGED'},{actorId:'alex'},{views:9000},{viewedAt:'1990-01-01'},{nativePermissions:{read:true}}])assert.equal((await post({...command,...injected,requestId:randomUUID()})).status,400,'caller cannot choose identity, counter, or read rights');
  assert.equal((await post({...command,version:v.version+100,requestId:randomUUID()})).status,409);
  assert.equal((await post({...command,revision:v.revision+1,requestId:randomUUID()})).status,409);
  assert.equal((await post({...command,documentKey:draft.id,requestId:randomUUID()})).status,403,'draft/private content does not count');
  assert.equal((await post({...command,documentKey:denied.id,requestId:randomUUID()})).status,403,'native read denial is authoritative');
  assert.equal((await post({...command,documentKey:'missing-document',requestId:randomUUID()})).status,403);
  assert.equal((await client.loadMetrics())[target.id],0,'rejected requests did not change counts');
  const recorded=await client.recordView(command);assert.deepEqual(recorded,{documentKey:target.id,views:1,counted:true});
  assert.deepEqual(await client.recordView(command),recorded,'network retries replay the exact acknowledgment');
  const responses=await Promise.all(Array.from({length:20},()=>client.recordView({...command,requestId:randomUUID()})));
  assert.ok(responses.every(response=>response.views===1&&response.counted===false),'concurrent refreshes by this signed-in person count once');
  const other=published.find(doc=>doc.id!==denied.id&&doc.id!==target.id),otherVersion=W.publishedVersion(other);
  assert.equal((await post({...command,documentKey:other.id,version:otherVersion.version,revision:otherVersion.revision})).status,409,'request ID cannot be reused for a different document');
  assert.equal((await client.loadMetrics())[target.id],1);
  const after=await client.load();
  assert.deepEqual(after.data,initial.data,'counting never changes document content, revision, or audit');
  assert.equal(after.attachmentVersion,initial.attachmentVersion);
  assert.deepEqual(after.nativePageVersions,initial.nativePageVersions);
  assert.deepEqual(after.entitlementPolicy,initial.entitlementPolicy);
  const doc=after.data.documents.find(doc=>doc.id===target.id),current=W.currentVersion(doc);
  await client.deleteDocument({docId:doc.id,expectedVersion:current.version,expectedRevision:current.revision,expectedAuditLength:doc.audit.length,comment:'Local metrics test: remove the published page.'});
  assert.equal((await client.loadMetrics())[doc.id],undefined,'deleted document counts are not returned to readers');
  assert.equal((await post({...command,requestId:randomUUID()})).status,403);
  assert.equal((await post(command)).status,403,'even an idempotent replay rechecks current native access');
  console.log('API metrics smoke passed: real zero counts → authenticated atomic counting → refresh/retry deduplication; stale publication, native read denial, identity/count spoofing, CSRF, deleted/private content, and unchanged workflow revisions/audit verified.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,3000).unref();});}
});
