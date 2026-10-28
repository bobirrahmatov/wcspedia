/* Self-contained loopback verification. Each child process has a fixed fictional
 * session; a server-owned temporary fixture carries state between sessions.
 * No production host, browser actor override, or committed sample is modified. */
'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{randomUUID}=require('node:crypto');
const W=require('../workflow.js'),G=require('../governance.js'),C=require('../confluence.js'),seed=require('../wcspedia-data.json');
let child=null,origin,fixtureFile,temp;
const clone=value=>JSON.parse(JSON.stringify(value));
async function stop(){if(!child)return;const old=child;child=null;if(old.exitCode===null){const exited=once(old,'exit');old.kill('SIGTERM');await exited;}}
async function start(actor,data){
  await stop();await fs.writeFile(fixtureFile,JSON.stringify(data));
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));origin='http://127.0.0.1:'+port;
  child=spawn(process.execPath,[path.join(__dirname,'../mock-confluence.cjs')],{env:{...process.env,WCS_MOCK_PORT:String(port),WCS_MOCK_ACTOR:actor,WCS_MOCK_DATA_FILE:fixtureFile,WCS_MOCK_DENY_READ_DOCUMENTS:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mock startup timed out.')),10000);let output='';const fail=error=>{clearTimeout(timer);reject(error);};child.once('error',fail);child.once('exit',code=>fail(Error('Mock exited before startup: '+code)));child.stderr.on('data',chunk=>fail(Error(String(chunk))));child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Local Confluence simulation:')){clearTimeout(timer);resolve();}});});
  const identity=await get('/confluence/rest/api/user/current');assert.equal(identity.userKey,'mock-'+actor+'-key');
}
async function get(route){const response=await fetch(origin+route);const body=await response.json();assert.equal(response.status,200,body.message);return body;}
async function workspace(){return (await get('/confluence/mock/workspace?rootPageId=100')).data;}
async function command(action,extra={}){
  const metadata=await get('/confluence/rest/api/content/100/child/attachment?filename=wcspedia-published.json');
  const base={action,rootPageId:'100',expectedAttachmentVersion:metadata.results[0].version.number,expectedEntitlementRevision:seed.entitlementPolicy.revision,comment:'Local governance verification.',requestId:randomUUID()};
  if(action!=='create'){
    const doc=(await workspace()).documents.find(d=>d.id===extra.docId);assert.ok(doc,'The test document is visible to this fixed session.');
    const version=W.currentVersion(doc),page=await get('/confluence/rest/api/content/'+doc.confluencePageId+'?expand=version,operations');
    Object.assign(base,{docId:doc.id,documentKey:doc.id,confluencePageId:doc.confluencePageId,expectedPageVersion:page.version.number,expectedVersion:version.version,expectedRevision:version.revision,expectedAuditLength:doc.audit.length});
  }
  return {...base,...extra};
}
async function post(payload,status=200){const response=await fetch(origin+'/confluence/mock/actions',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':payload.requestId},body:JSON.stringify(payload)});const body=await response.json();assert.equal(response.status,status,body.message);return body;}
async function act(action,extra,status){return post(await command(action,extra),status);}
const id='http-governance-'+randomUUID();
const metadata=G.normalize({classification:'other-nhd',owningTeam:'WCS Learning',scope:'Descriptive internal learning support.',audience:'Credit service colleagues',classificationRationale:'A learning aid; formal requirements remain in the official source.'});
const fields={id,reference:'WCS-GOV-HTTP',type:'Job aid',area:seed.areas[0].id,ownerId:'alex',authorId:'alex',reviewerId:'jordan',approverId:'jordan',title:'Prepare a learning handover',summary:'A practical internal learning aid.',sections:[{id:'overview',title:'Overview',paragraphs:['The source says this record must be retained. Consult the official source for applicability.'],bullets:[]}],governance:G.normalize()};
function evidence(version){return {baselineVersion:G.BASELINE_VERSION,version:version.version,revision:version.revision,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'addressed',reason:'Private review rationale: wording references the source; applicability checked. This is not an exception approval.'};}
function fixtureWith(doc){const data=clone(seed);data.documents.push(clone(doc));return data;}
(async()=>{
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'wcs-governance-http-'));fixtureFile=path.join(temp,'fixture.json');
  await start('alex',seed);
  const legacyBefore=await get('/confluence/download/attachments/100/wcspedia-published.json');
  assert.ok(legacyBefore.documents.length);assert.ok(legacyBefore.documents.some(d=>!W.publishedVersion(d).governance),'Legacy approved documents remain readable without reclassification.');
  await act('create',{fields,actorId:'jordan',actorSOEID:'FORGED'});
  let doc=(await workspace()).documents.find(d=>d.id===id);assert.equal(doc.audit[0].actorId,'alex');assert.equal(doc.audit[0].actorSOEID.toUpperCase(),seed.people.find(p=>p.id==='alex').soeid.toUpperCase());
  const beforeIncomplete=clone(doc);
  await act('submit',{docId:id,requireGovernance:false},400);
  assert.deepEqual((await workspace()).documents.find(d=>d.id===id),beforeIncomplete,'Invalid submission has no audit or content mutation.');
  await act('edit',{docId:id,changes:{governance:metadata}});
  await act('submit',{docId:id,requireGovernance:false});
  doc=(await workspace()).documents.find(d=>d.id===id);
  assert.equal(W.currentVersion(doc).status,'In review');assert.equal(W.currentVersion(doc).revision,2);
  await act('complete-review',{docId:id,governanceReview:evidence(W.currentVersion(doc)),actorId:'jordan',role:'Manager'},400);
  const authorPublished=await get('/confluence/download/attachments/100/wcspedia-published.json');
  assert.deepEqual(authorPublished,legacyBefore,'Creating and submitting a draft never changes approved reader snapshots.');

  await start('jordan',fixtureWith(doc));
  const pending=clone((await workspace()).documents.find(d=>d.id===id)),current=W.currentVersion(pending),valid=evidence(current);
  await act('complete-review',{docId:id,requireGovernance:false},400);
  await act('complete-review',{docId:id,governanceReview:{...valid,revision:current.revision-1}},400);
  await act('complete-review',{docId:id,governanceReview:{...valid,checks:{...valid.checks,sources:false}}},400);
  await act('complete-review',{docId:id,governanceReview:{...valid,reviewedBy:'alex'}},400);
  await act('complete-review',{docId:id,governanceReview:{...valid,findingDisposition:'clear'}},400);
  await act('complete-review',{docId:id,governanceReview:{...valid,findingDisposition:'needs-authority'}},400);
  assert.deepEqual((await workspace()).documents.find(d=>d.id===id),pending,'Rejected reviews preserve the exact revision and audit.');
  const reviewCommand=await command('complete-review',{docId:id,governanceReview:valid,actorId:'alex',actorSOEID:'FORGED',reviewedAt:'1990-01-01',requireGovernance:false});
  const accepted=await post(reviewCommand);assert.deepEqual(await post(reviewCommand),accepted,'A retry is deduplicated without another review event.');
  await post({...reviewCommand,comment:'Changed request content'},409);
  doc=(await workspace()).documents.find(d=>d.id===id);const reviewed=W.currentVersion(doc);
  assert.equal(reviewed.governanceReview.reviewedBy,'jordan');assert.equal(reviewed.governanceReview.actorSOEID.toUpperCase(),seed.people.find(p=>p.id==='jordan').soeid.toUpperCase());assert.equal(reviewed.governanceReview.revision,current.revision);assert.notEqual(reviewed.governanceReview.reviewedAt,'1990-01-01');
  await act('approve',{docId:id,nextReviewAt:G.nextReviewDate(new Date().toISOString(),36),requireGovernance:false},400);
  assert.equal(W.currentVersion((await workspace()).documents.find(d=>d.id===id)).status,'Awaiting approval');
  await act('approve',{docId:id,nextReviewAt:G.nextReviewDate(new Date().toISOString(),24),actorId:'alex',approvedAt:'1990-01-01'});
  doc=(await workspace()).documents.find(d=>d.id===id);const approved=W.publishedVersion(doc);
  assert.equal(approved.approvedBy,'jordan');assert.equal(approved.nextReviewAt.slice(0,10),G.nextReviewDate(approved.approvedAt,24));assert.deepEqual(approved.governance,metadata);assert.ok(approved.governanceReview);
  const published=await get('/confluence/download/attachments/100/wcspedia-published.json'),readerDoc=published.documents.find(d=>d.id===id);
  assert.equal(Object.hasOwn(W.publishedVersion(readerDoc),'governanceReview'),false);assert.deepEqual(W.publishedVersion(readerDoc).governance,metadata);assert.deepEqual(readerDoc.audit,[]);assert.equal(JSON.stringify(published).includes(valid.reason),false);
  C.validateData(published);
  for(const original of legacyBefore.documents){const same=published.documents.find(d=>d.id===original.id);assert.deepEqual(same,original,'Original approved snapshots remain unchanged.');}

  await start('reader',fixtureWith(doc));
  const restricted=(await workspace()).documents.find(d=>d.id===id);
  assert.equal(Object.hasOwn(W.publishedVersion(restricted),'governanceReview'),false,'Restricted workspace reader fallback also removes private evidence.');assert.deepEqual(restricted.audit,[]);
  assert.equal(JSON.stringify(restricted).includes(valid.reason),false);
  await act('revise',{docId:id,expectedAuditLength:doc.audit.length,actorId:'jordan',role:'Manager',permissionContext:{edit:true}},403);
  console.log('PASS governance HTTP: fixed author → manager → reader sessions; required metadata, exact-revision checklist, unresolved flags, 24-month bound, trusted identity, idempotency, private evidence exclusion, and unchanged legacy publications.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();if(temp)await fs.rm(temp,{recursive:true,force:true});});
