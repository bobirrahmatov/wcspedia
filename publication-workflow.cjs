'use strict';
/* Trusted service integration for the existing WCSpedia editor. Do not bundle
 * or attach this file. The host provides authentication, fresh native ACLs,
 * the central entitlement policy, and an idempotent projection writer. */
const {createHash}=require('node:crypto');
const W=require('./workflow.js');
const E=require('./entitlements.js');
const C=require('./confluence.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ACTIONS=['create','edit','revise','submit','request-changes','complete-review','approve','delete'];
function fail(message,code='VALIDATION'){const error=new Error(message);error.code=code;throw error;}
function buildReaderProjection(input,pendingDocumentKey){
  const data=clone(input);delete data.entitlementPolicy;data.taxonomyAudit=[];
  data.documents=data.documents.flatMap(doc=>{
    const selected=W.publishedVersion(doc);
    if(!selected||doc.deletedAt)return [];
    if(!doc.publishedConfluencePageId&&doc.id!==pendingDocumentKey)fail('An approved document has no confirmed native publication. Migrate it before enabling native publication.','MIGRATION_REQUIRED');
    const version=clone(selected);delete version.governanceReview;
    const result={...doc,versions:[version],audit:[],confluencePageId:doc.publishedConfluencePageId,confluencePageVersion:doc.publishedConfluencePageVersion};
    delete result.publishedConfluencePageId;delete result.publishedConfluencePageVersion;delete result.confluence;
    return [result];
  });
  return C.validateData(data);
}
// Public reader responses always require confirmed native mappings. Only the
// private preflight path may describe a not-yet-created approved child.
function readerProjection(input){return buildReaderProjection(input,null);}
function actorFor(data,user){
  const identity=E.identity(user);if(!identity)fail('A signed-in Confluence account with a mapped SOEID is required.','FORBIDDEN');
  const matches=data.people.filter(person=>{
    const mapping=person.confluence||{};
    const keys=['userKey','accountId'].filter(key=>user[key]&&mapping[key]);
    if(keys.some(key=>user[key]!==mapping[key]))return false;
    const ids=[person.soeid,mapping.username].filter(Boolean).map(E.normalizeSOEID);
    return ids.length>0&&ids.every(id=>id===identity.soeid);
  });
  if(matches.length!==1)fail('The authenticated SOEID must resolve to exactly one directory person.','FORBIDDEN');
  return {identity,actor:matches[0]};
}
/**
 * journal: durable get/set/withLock. All writers must share its library lock.
 * loadInitialState(): {data, attachmentVersion}; called only for first install.
 * authenticate(session): Confluence current-user record from the trusted host.
 * loadPolicy(): latest authoritative entitlements.json attachment, validated with entitlements.js.
 * nativeAccess({identity,document,areaId,action,recovery,publicationDestination}): fresh caller permissions,
 *   {root, documents, workingRoot, area, published, pageVersion}. Operation
 *   For first Insights publication, publicationDestination is supplied from the
 *   trusted publisher. Return publicationDestination:{pageId,operations} with
 *   the exact parent ID and this actor's read/page + create/page operations.
 *   Business-area permissions cannot substitute for Insights permissions.
 *   Operation arrays use Confluence {operation,targetType:'page'} entries.
 *   recovery is supplied ONLY from the matching trusted delete journal and
 *   contains action, requestId, documentKey, stage, auditEventId and pageIds.
 *   For this case return deletionRecovery:{space:[current operations],
 *   pages:{pageId:{status:'current'|'trashed',operations:[current operations]}}}.
 *   Space operations must include read/space and delete/page. A current page
 *   needs read/page + delete/page. Confirm trashed status through an authoritative
 *   native lookup; a 404 (which can mean denied/moved) is NOT trash evidence.
 *   Never accept recovery descriptors or permission results from request JSON.
 * writeProjection({data,expectedAttachmentVersion,requestId}): durable,
 *   idempotent CAS write returning {attachmentVersion}. Same request ID and
 *   bytes MUST recover the same result after a timeout, never upload twice.
 * The HTTP host checks CSRF/origin/body limits and supplies session separately
 * from command; never fill session from request JSON.
 */
function createWorkflowService(options){
  const {journal,publisher,rootPageId}=options||{};
  if(!/^[1-9]\d*$/.test(rootPageId||'')||!journal||!['get','set','withLock'].every(key=>typeof journal[key]==='function')||!publisher||!['validate','configurationCheck','syncWorking','publishApproved','trashDocument'].every(key=>typeof publisher[key]==='function'))fail('Configure the trusted publisher, numeric root and durable journal.','CONFIGURATION');
  for(const key of ['loadInitialState','authenticate','loadPolicy','nativeAccess','writeProjection'])if(typeof options[key]!=='function')fail('Configure the trusted '+key+' adapter.','CONFIGURATION');
  const stateKey='workflow-library:'+rootPageId;
  async function state(){
    let value=await journal.get(stateKey);
    if(!value){
      const initial=await options.loadInitialState();C.validateData(initial.data);
      if(!Number.isSafeInteger(initial.attachmentVersion)||initial.attachmentVersion<1)fail('Initial reader attachment version is required.','CONFIGURATION');
      value={schemaVersion:1,data:clone(initial.data),attachmentVersion:initial.attachmentVersion,pending:null,completed:{}};
      // Native mode never publishes historical sample records or silently adopts
      // arbitrary page IDs. Existing content needs an explicit migration.
      readerProjection(value.data);
      await journal.set(stateKey,value);
    }
    return value;
  }
  async function access(command,principal,value,policy,recovery){
    const {identity,actor}=principal;
    const document=command.action==='create'?null:value.data.documents.find(doc=>doc.id===command.docId);
    if(command.action!=='create'&&!document)fail('The document does not exist.','NOT_FOUND');
    const publicationDestination=command.action==='approve'&&typeof publisher.publicationDestination==='function'?publisher.publicationDestination(document):null;
    const native=await options.nativeAccess({publicationDestination,identity,document:document&&clone(document),areaId:document?document.area:command.fields?.area,action:command.action,recovery:recovery?clone(recovery):null});
    const key=document?.id||command.fields?.id;
    const effective=permission=>E.effective(policy,identity,permission,{native,documentKey:key});
    if(!E.nativeHas(native?.root,'read'))fail('Native library read permission is required.','FORBIDDEN');
    if(recovery){
      // Page operations disappear after trashing. Recovery authority is never
      // inferred from that absence: the host confirms current space rights and
      // the native status/rights of EVERY journal-bound page independently.
      const proof=native?.deletionRecovery;
      const spaceRead=Array.isArray(proof?.space)&&proof.space.some(operation=>operation?.operation==='read'&&operation.targetType==='space');
      if(!E.hasGrant(policy,identity,'content.delete',key)||!spaceRead||!E.nativeHas(proof?.space,'delete'))fail('Current central delete entitlement and native space read/delete permissions are required to recover deletion.','FORBIDDEN');
      for(const pageId of recovery.pageIds){
        const page=proof?.pages?.[pageId];
        if(!page||!['current','trashed'].includes(page.status))fail('Confirm each managed page is current or authoritatively trashed before retrying deletion.','FORBIDDEN');
        if(page.status==='current'&&(!E.nativeHas(page.operations,'read')||!E.nativeHas(page.operations,'delete')))fail('Each remaining page still requires current native read and delete permission.','FORBIDDEN');
      }
    }else if(command.action==='create'){
      if(!effective('content.create')||!E.nativeHas(native.workingRoot,'create'))fail('The central create entitlement and native authoring permission are required.','FORBIDDEN');
    }else{
      const rights=native.documents?.[key];
      if(!E.nativeHas(rights,'read'))fail('Native document read permission is required.','FORBIDDEN');
      if(['edit','revise','submit','delete'].includes(command.action)){
        if(!effective(command.action==='delete'?'content.delete':'content.edit'))fail('Both central entitlement and native document permission are required.','FORBIDDEN');
      }else if(!E.nativeHas(rights,'update'))fail('Native update permission is required for the assigned reviewer or approver.','FORBIDDEN');
      if(command.action==='approve'){
        const target=publicationDestination?.kind==='insights'?native.publicationDestination:null;
        const createAllowed=publicationDestination?.kind==='insights'?target?.pageId===publicationDestination.parentPageId&&E.nativeHas(target.operations,'read')&&E.nativeHas(target.operations,'create'):E.nativeHas(native.area,'create');
        if(!(document.publishedConfluencePageId?E.nativeHas(native.published,'update'):createAllowed))fail('The approver needs native permission on the exact publication destination.','FORBIDDEN');
      }
      if(command.action==='delete'&&document.publishedConfluencePageId&&!E.nativeHas(native.published,'delete'))fail('Deleting this document also requires native delete permission on its published page.','FORBIDDEN');
    }
    return {actor,identity,native,document,permissionContext:{actorId:actor.id,documentId:key,create:effective('content.create'),edit:document&&effective('content.edit'),delete:document&&effective('content.delete')}};
  }
  async function execute(command,session){
    if(!command||!ACTIONS.includes(command.action)||command.rootPageId!==rootPageId||typeof command.requestId!=='string'||!command.requestId.trim()||command.requestId.length>160||typeof command.comment!=='string'||!command.comment.trim())fail('A valid root, command, request ID and change reason are required.');
    // The service is always native; omitting this client hint cannot disable it.
    if(command.nativePublication!=null&&(command.nativePublication.required!==true||Object.keys(command.nativePublication).length!==1))fail('Parent page routing is configured on the server.');
    return journal.withLock(stateKey,async()=>{
      const value=await state(),policy=E.validatePolicy(await options.loadPolicy());
      const principal=actorFor(value.data,await options.authenticate(session));
      const signature=fingerprint({command,actorId:principal.actor.id,soeid:principal.identity.soeid});
      const previous=value.completed[command.requestId];
      if(previous&&previous.fingerprint!==signature)fail('This request ID was already used for another command.','CONFLICT');
      if(!previous&&value.pending&&(value.pending.requestId!==command.requestId||value.pending.fingerprint!==signature))fail('A prior publication is awaiting recovery. Retry its original request before another change.','PUBLICATION_PENDING');
      const matchingPending=!previous&&value.pending;
      let recovery=null;
      if(command.action==='delete'&&(previous||matchingPending)){
        const deletion=matchingPending?matchingPending.document:value.data.documents.find(doc=>doc.id===command.docId);
        if(!deletion?.deletedAt||!deletion.deletedAuditEventId||!(deletion.audit||[]).some(event=>event.id===deletion.deletedAuditEventId&&event.action==='delete'&&event.documentKey===deletion.id))fail('The retained deletion audit is unavailable.','CONFLICT');
        recovery={action:'delete',requestId:command.requestId,documentKey:deletion.id,stage:previous?'completed':matchingPending.phase,auditEventId:deletion.deletedAuditEventId,pageIds:[deletion.confluencePageId,deletion.publishedConfluencePageId].filter(Boolean)};
        if(!recovery.pageIds.length)fail('The retained deletion page mappings are unavailable.','CONFLICT');
      }
      const auth=await access(command,principal,value,policy,recovery);
      if(previous)return clone(previous.response);
      // Exact journaled retries keep their original fingerprint and expected
      // policy revision. Today's grants and native ACLs are rechecked above.
      if(!matchingPending&&command.expectedEntitlementRevision!==policy.revision)fail('Entitlements changed. Reload before continuing.','CONFLICT');
      if(!value.pending){
        if(command.expectedAttachmentVersion!==value.attachmentVersion)fail('The library changed. Reload before continuing.','CONFLICT');
        const now=options.now?options.now():new Date().toISOString();
        const domainOptions={actorId:auth.actor.id,actorSOEID:auth.identity.soeid,people:value.data.people,comment:command.comment,expectedVersion:command.expectedVersion,expectedRevision:command.expectedRevision,expectedAuditLength:command.expectedAuditLength,now,changes:command.changes,nextReviewAt:command.nextReviewAt,effectiveAt:now,requireGovernance:true,governanceReview:command.governanceReview,permissionContext:auth.permissionContext};
        let changed;
        if(command.action==='create'){
          if(!command.fields||value.data.documents.some(doc=>doc.id===command.fields.id))fail('The permanent document key already exists or is missing.','CONFLICT');
          if(command.fields.confluence||Object.keys(command.fields).some(key=>/pageId|parent|confluence/i.test(key)))fail('A new document cannot choose native page mappings.');
          changed=W.createDocument(command.fields,domainOptions);
          if(!value.data.areas.some(area=>area.id===changed.area))fail('Choose an existing business area.');
        }else{
          const existing=auth.document;
          if(existing.deletedAt||command.documentKey!==existing.id||command.confluencePageId!==existing.confluencePageId||!Number.isSafeInteger(command.expectedPageVersion)||command.expectedPageVersion!==auth.native.pageVersion||command.expectedPageVersion!==existing.confluencePageVersion)fail('The document or its native page changed. Reload before continuing.','CONFLICT');
          changed=W.transition(existing,command.action,domainOptions);
        }
        const sourceId=W.currentVersion(changed).sourceMetadata?.sourceId;
        if(sourceId&&value.data.documents.some(doc=>doc.id!==changed.id&&doc.versions.some(version=>version.sourceMetadata?.sourceId===sourceId)))fail('This source ID already belongs to a document in this WCSpedia library. Open that document to update it.','SOURCE_ALREADY_IMPORTED');
        await publisher.validate({document:changed,people:value.data.people,action:command.action});
        if(typeof options.writeProjection.preflight==='function'){
          const proposed=clone(value.data),position=proposed.documents.findIndex(doc=>doc.id===changed.id);
          if(position<0)proposed.documents.push(changed);else proposed.documents[position]=changed;
          await options.writeProjection.preflight(buildReaderProjection(proposed,changed.id),{pendingDocumentKey:changed.id});
        }
        const routing=await publisher.configurationCheck();
        if(routing?.publishedRootPageId!==rootPageId)fail('The publisher root must match the WCSpedia library and search root.','CONFIGURATION');
        // Persist the exact transition (including server time and audit event)
        // BEFORE native writes. Retrying must not regenerate an approval.
        value.pending={requestId:command.requestId,fingerprint:signature,document:changed,people:clone(value.data.people),actorId:auth.actor.id,phase:'prepared'};
        await journal.set(stateKey,value);
      }
      const pending=value.pending;
      if(pending.phase==='prepared'){
        const result=command.action==='delete'
          ?await publisher.trashDocument({document:pending.document,requestId:command.requestId})
          :await publisher.syncWorking({document:pending.document,people:pending.people,requestId:command.requestId+':working'});
        Object.assign(pending.document,result.mapping);
        pending.receipt=result.receipt;pending.phase='working';await journal.set(stateKey,value);
      }
      if(pending.phase==='working'){
        if(command.action==='approve'){
          const result=await publisher.publishApproved({document:pending.document,people:pending.people,requestId:command.requestId});
          Object.assign(pending.document,result.mapping);pending.receipt=result.receipt;
        }
        pending.phase='native';await journal.set(stateKey,value);
      }
      const next=clone(value.data),index=next.documents.findIndex(doc=>doc.id===pending.document.id);
      if(index<0)next.documents.push(clone(pending.document));else next.documents[index]=clone(pending.document);
      C.validateData(next);
      const projected=await options.writeProjection({data:readerProjection(next),expectedAttachmentVersion:value.attachmentVersion,requestId:command.requestId});
      if(!projected||!Number.isSafeInteger(projected.attachmentVersion)||projected.attachmentVersion<=value.attachmentVersion)fail('The reader projection was not confirmed. Retry this same request.','PROJECTION_UNCONFIRMED');
      const response={accepted:true,requestId:command.requestId,attachmentVersion:projected.attachmentVersion,publication:pending.receipt};
      if(command.action==='delete')Object.assign(response,{documentKey:pending.document.id,deleted:true,confluencePageDeleted:true});
      value.data=next;value.attachmentVersion=projected.attachmentVersion;value.pending=null;
      value.completed[command.requestId]={fingerprint:signature,response};
      // Document, audit, native mappings and commit receipt become visible in
      // one durable record. No successful response precedes this write.
      await journal.set(stateKey,value);
      return clone(response);
    });
  }
  async function snapshot(){return journal.withLock(stateKey,async()=>{const value=await state();return {data:clone(value.data),attachmentVersion:value.attachmentVersion,pendingRequestId:value.pending?.requestId||null};});}
  return Object.freeze({execute,snapshot});
}
module.exports={createWorkflowService,readerProjection};
