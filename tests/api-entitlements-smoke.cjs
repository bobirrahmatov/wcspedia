/* Local loopback only. Start WCS_MOCK_PORT=4175 node mock-confluence.cjs
 * with the default fictional Jordan session. Requires jsdom via NODE_PATH.
 * Exercises the trusted-service contract; not a production security certification.
 */
'use strict';
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {randomUUID}=require('node:crypto');
const API=require('../confluence.js'), W=require('../workflow.js'), E=require('../entitlements.js');
const port=Number(process.env.WCS_MOCK_PORT||4175);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local mock port.');
const origin='http://127.0.0.1:'+port;
const config={mode:'confluence',rootPageId:'100',contextPath:'/confluence',workspaceEndpoint:'/confluence/mock/workspace',workflowEndpoint:'/confluence/mock/actions',entitlementsPageId:'150',entitlementsSource:'attachment',entitlementsFilename:'entitlements.json',entitlementsEndpoint:'/confluence/mock/entitlements'};
const client=API.create(config,{fetch,location:{href:origin+'/mock-live.html'},DOMParser:new JSDOM('').window.DOMParser});
const headers=id=>({'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Idempotency-Key':id});
const post=(route,command,extra={})=>fetch(origin+'/confluence/mock/'+route,{method:'POST',headers:{...headers(command.requestId),...extra},body:JSON.stringify(command)});
async function jsonGet(route){const response=await fetch(origin+route);assert.equal(response.status,200);return response.json();}
const reason='Local verification of centralized entitlement controls.';
(async()=>{
  let session=await client.load();
  assert.equal(session.identity.soeid,'JL12345');
  assert.equal(session.effectivePermissions['entitlements.add'],true);
  const initialRevision=session.entitlementPolicy.revision;
  const row={id:'http-grant-'+randomUUID(),soeid:'QA12345',displayName:'Fictional verification account',scope:'*',permissions:['content.edit'],active:true};
  const requestId=randomUUID(),add={action:'add',rootPageId:'100',entitlementsPageId:'150',entitlementsSource:'attachment',entitlementsFilename:'entitlements.json',expectedAttachmentId:session.entitlementAttachmentId,expectedAttachmentVersion:session.entitlementAttachmentVersion,expectedRevision:initialRevision,comment:reason,record:row,requestId,actorId:'alex',actorSOEID:'FORGED'};
  const missingCSRF=await fetch(origin+'/confluence/mock/entitlements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(add)});assert.equal(missingCSRF.status,403);
  assert.equal((await post('entitlements',add,{Origin:'https://foreign.example'})).status,403);
  const accepted=await post('entitlements',add);assert.equal(accepted.status,200);const acknowledgment=await accepted.json();
  assert.deepEqual(await (await post('entitlements',add)).json(),acknowledgment,'same request retry is deduplicated');
  assert.equal((await post('entitlements',{...add,record:{...row,displayName:'Changed'},requestId})).status,409);
  assert.equal((await post('entitlements',{...add,requestId:randomUUID(),record:{...row,id:'other-row',soeid:'QA99999'}})).status,409,'stale policy revision fails');
  let journal=await jsonGet('/confluence/mock/entitlements?rootPageId=100');
  assert.equal(journal.policy.audit.at(-1).actorSOEID,'JL12345','server identity wins over forged body actor');
  assert.equal(journal.policy.audit.at(-1).changes[0].after.id,row.id);
  session=await client.load();
  session=await client.submitEntitlementCommand({action:'edit',recordId:row.id,record:{...row,displayName:'Renamed verification account'},expectedRevision:session.entitlementPolicy.revision,comment:reason});
  assert.equal(session.entitlementPolicy.records.find(r=>r.id===row.id).displayName,'Renamed verification account');
  session=await client.submitEntitlementCommand({action:'revoke',recordId:row.id,expectedRevision:session.entitlementPolicy.revision,comment:reason});
  assert.equal(session.entitlementPolicy.records.some(r=>r.id===row.id),false);
  await assert.rejects(client.submitEntitlementCommand({action:'revoke',recordId:'grant-jordan-admin',expectedRevision:session.entitlementPolicy.revision,comment:reason}),/last active/i);

  // A native update is versioned independently of the versioned JSON record.
  let doc=session.data.documents.find(d=>!d.deletedAt&&W.currentVersion(d).status==='Published');
  assert.ok(doc);const stableKey=doc.id,pageId=doc.confluencePageId;
  const actionInput=(action,record,extra={})=>({action,docId:record.id,expectedVersion:W.currentVersion(record).version,expectedRevision:W.currentVersion(record).revision,expectedAuditLength:record.audit.length,comment:reason,...extra});
  session=await client.submitAction(actionInput('revise',doc));
  doc=session.data.documents.find(d=>d.id===stableKey);
  session=await client.submitAction(actionInput('edit',doc,{changes:{title:'Renamed without changing the permanent document key',slug:'renamed-with-the-same-key'}}));
  doc=session.data.documents.find(d=>d.id===stableKey);
  assert.equal(doc.id,stableKey);assert.equal(doc.confluencePageId,pageId);
  assert.equal(doc.audit.at(-1).actorSOEID.toUpperCase(),'JL12345');
  assert.ok(W.currentVersion(doc).contributorIds.includes('jordan'));
  const command={...actionInput('delete',doc),rootPageId:'100',documentKey:stableKey,confluencePageId:pageId,expectedPageVersion:session.nativePageVersions[stableKey],expectedAttachmentVersion:session.attachmentVersion,expectedEntitlementRevision:session.entitlementPolicy.revision,requestId:randomUUID(),actorId:'alex',permissionContext:{delete:true}};
  assert.equal((await post('actions',{...command,expectedPageVersion:command.expectedPageVersion-1,requestId:randomUUID()})).status,409,'stale native page version is rejected');
  assert.equal((await post('actions',{...command,expectedEntitlementRevision:command.expectedEntitlementRevision-1,requestId:randomUUID()})).status,409,'stale policy is rejected');
  assert.equal((await post('actions',{...command,expectedAuditLength:0,requestId:randomUUID()})).status,409,'stale audit is rejected');
  assert.equal((await post('actions',{...command,confluencePageId:'100',requestId:randomUUID()})).status,409,'a forged parent-page target is rejected');
  const removed=await post('actions',command);assert.equal(removed.status,200);const removedAck=await removed.json();
  assert.equal(removedAck.documentKey,stableKey);assert.equal(removedAck.deleted,true);assert.equal(removedAck.confluencePageDeleted,true);
  assert.deepEqual(await (await post('actions',command)).json(),removedAck,'delete retry does not create another audit event');
  assert.equal((await fetch(origin+'/confluence/rest/api/content/'+pageId+'?expand=operations,version')).status,404,'the entire mapped native page is trashed');
  session=await client.load();
  const retained=session.data.documents.find(d=>d.id===stableKey);
  assert.equal(retained.deletedBy,'jordan');assert.equal(retained.deletedReason,reason);
  assert.equal(W.publishedVersion(retained),null);
  const published=await jsonGet('/confluence/download/attachments/100/wcspedia-published.json');
  assert.equal(published.documents.some(d=>d.id===stableKey),false);
  assert.equal(published.entitlementPolicy,undefined,'reader snapshots do not embed the central admin policy');
  const retention=await jsonGet('/confluence/mock/deletion-audit?documentKey='+encodeURIComponent(stableKey));
  assert.equal(retention.document.id,stableKey);assert.equal(retention.nativePageId,pageId);
  assert.deepEqual(retention.document.versions,doc.versions);
  assert.equal(retention.document.audit.at(-1).action,'delete');
  const effective=E.effective(session.entitlementPolicy,session.identity,'content.delete',{native:{...session.nativePermissions,documents:{[stableKey]:[{operation:'read',targetType:'page'}]}},documentKey:stableKey});
  assert.equal(effective,false,'central grant alone cannot override absent native delete permission');
  // Withdraw the central delete grant while native delete still exists, then
  // attempt to forge the old browser permission. The service must deny it.
  const administrator=session.entitlementPolicy.records.find(r=>r.id==='grant-jordan-admin');
  session=await client.submitEntitlementCommand({action:'edit',recordId:administrator.id,record:{...administrator,permissions:administrator.permissions.filter(p=>p!=='content.delete')},expectedRevision:session.entitlementPolicy.revision,comment:'Remove delete authority for an authorization regression check.'});
  const deniedDoc=session.data.documents.find(d=>!d.deletedAt),deniedCommand={...actionInput('delete',deniedDoc),rootPageId:'100',documentKey:deniedDoc.id,confluencePageId:deniedDoc.confluencePageId,expectedPageVersion:session.nativePageVersions[deniedDoc.id],expectedAttachmentVersion:session.attachmentVersion,expectedEntitlementRevision:session.entitlementPolicy.revision,requestId:randomUUID(),actorId:'jordan',actorSOEID:'JL12345',permissionContext:{actorId:'jordan',documentId:deniedDoc.id,delete:true}};
  assert.equal((await post('actions',deniedCommand)).status,403,'browser-supplied delete grant cannot override the fresh central policy');
  const stillCurrent=await jsonGet('/confluence/rest/api/content/'+deniedDoc.confluencePageId+'?expand=operations,version');
  assert.equal(stillCurrent.status,'current');
  console.log('API entitlements smoke passed: SOEID identity → add/edit/revoke + audit → immutable-key edit → guarded native deletion + retained journal; CSRF, stale native/policy/audit state, target spoofing, idempotency, and last-admin protection verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
