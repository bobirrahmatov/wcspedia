/* Local loopback only. Start WCS_MOCK_PORT=4175 node mock-confluence.cjs (default Jordan session).
 * This exercises actual HTTP; it is not a deployed Confluence service or authentication test.
 */
'use strict';
const assert=require('node:assert/strict'),S=require('../suggestions.js');
const port=Number(process.env.WCS_MOCK_PORT||4175);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local mock port.');
const origin='http://127.0.0.1:'+port,endpoint=origin+'/confluence/mock/suggestions?rootPageId=100';
async function workspace(){const response=await fetch(origin+'/confluence/mock/workspace?rootPageId=100');assert.equal(response.status,200);return (await response.json()).data;}
async function command(value){return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':value.requestId},body:JSON.stringify(value)});}
(async()=>{
  const data=await workspace(),actor=data.people.find(person=>person.id==='jordan');
  const identity=await (await fetch(origin+'/confluence/rest/api/user/current')).json();assert.equal(identity.username,'JL12345','Run this smoke with the default Jordan mock session.');
  const doc=data.documents.find(item=>item.reviewerId===actor.id&&item.versions.some(version=>version.status==='Published')),version=doc.versions.find(item=>item.status==='Published'),before=JSON.stringify(doc);
  const context={title:version.title,url:origin+'/mock-live.html#/document/'+encodeURIComponent(doc.id)+'?version='+version.version,documentId:doc.id,version:version.version,revision:version.revision,ownerId:doc.ownerId,reviewerId:doc.reviewerId,approverId:doc.approverId,anchor:{exact:'Example selected text',prefix:'Before ',suffix:' after',heading:'Example',containerId:'example',startOffset:7,endOffset:28}};
  const payload={type:'Correction',correction:'Clarify the checklist handover step.',reason:'Local API verification; sample request only.',context};
  const client=S.createService({config:{mode:'confluence',rootPageId:'100',suggestionEndpoint:'/confluence/mock/suggestions'},location:{href:origin+'/mock-live.html'},getActor:()=>actor,fetch});
  const requestId='suggestion-http-'+Date.now(),record=await client.submit(payload,requestId),retry=await client.submit(payload,requestId);
  assert.deepEqual(retry,record);assert.equal(record.createdBy.id,'jordan');assert.equal(record.status,'Open');assert.equal(record.context.revision,version.revision);
  const mine=await client.list({scope:'mine'}),review=await client.list({scope:'review'});assert.ok(mine.some(row=>row.id===record.id));assert.ok(review.some(row=>row.id===record.id));
  const decision={status:'Resolved',comment:'Verified the request; no document edit is made by this test.',expectedRevision:1},resolved=await client.decide(record.id,decision,requestId+'-decision');
  assert.equal(resolved.status,'Resolved');assert.equal(resolved.revision,2);assert.equal(resolved.history.at(-1).actor.id,'jordan');assert.deepEqual(await client.decide(record.id,decision,requestId+'-decision'),resolved);
  await assert.rejects(client.decide(record.id,{...decision,status:'Dismissed'},requestId+'-stale'),error=>error.code==='CONFLICT');
  await assert.rejects(client.submit({...payload,reason:'A different payload using the same key.'},requestId),error=>error.code==='CONFLICT');
  const forged=await command({action:'create',requestId:requestId+'-actor',actorId:'alex',payload:{...payload,actorId:'alex'}});assert.equal(forged.status,200);assert.equal((await forged.json()).suggestion.createdBy.id,'jordan','The mock must derive actor from its fixed server session.');
  const spoofedAssignments=await command({action:'create',requestId:requestId+'-assignment',payload:{...payload,context:{...context,reviewerId:'alex',approverId:'alex'}}});assert.equal(spoofedAssignments.status,403);
  const staleRevision=await command({action:'create',requestId:requestId+'-version',payload:{...payload,context:{...context,revision:999}}});assert.equal(staleRevision.status,409);
  const outsideSource=await command({action:'create',requestId:requestId+'-outside',payload:{...payload,context:{title:'Other site',url:'https://external.example/page'}}});assert.equal(outsideSource.status,403);
  const after=(await workspace()).documents.find(item=>item.id===doc.id);assert.equal(JSON.stringify(after),before,'Suggestion submission and triage must not mutate document content, approval state or audit history.');
  console.log('API suggestions smoke passed: create → retry → list → resolve → decision retry; stale commands, forged assignments and foreign sources rejected; server actor enforced; document and audit unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
