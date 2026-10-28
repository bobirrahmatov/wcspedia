/* Native content-health persistence for WCSpedia-managed documents. Health rules
 * and review evidence live on the restricted Working page, beside its approved
 * document snapshot. Native permissions remain authoritative; browser policy is
 * cooperative guidance. Attachment CAS is supplied by WCSSpaceStorage. */
(function(root,factory){
  'use strict';var node=typeof module==='object'&&module.exports;
  var api=factory(root,node?require('./content-health.js'):root.WCSContentHealth,node?require('./entitlements.js'):root.WCSEntitlements,node?require('./space-storage.js'):root.WCSSpaceStorage);
  if(node)module.exports=api;else root.WCSSpaceHealth=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,H,E,S){
  'use strict';
  var FILE='wcspedia-health.json',KEY='wcspedia.health.v1',JOURNAL='wcspedia.health.operation',DOCUMENT='wcspedia-document.json',STATE='wcspedia.workflow.state';
  var FIELDS=['action','expectedRevision','reason','rules','assigneeId','evidence','expectedPublishedVersion','expectedPublishedRevision','expectedFingerprint','triggerType','sourceId','outcome','caseIds'];
  function fail(code,message){var e=new Error(message);e.code=code;throw e;}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
  function id(v){return /^[1-9]\d{0,19}$/.test(String(v||''))?String(v):'';}
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(object(v))return Object.keys(v).sort().reduce(function(out,k){if(v[k]!==undefined)out[k]=canonical(v[k]);return out;},{});return v;}
  function hash(v){return H.digest(JSON.stringify(canonical(v)));}
  function cleanCommand(command){if(!object(command))fail('HEALTH_INPUT','A content-health command is required.');var value={};FIELDS.forEach(function(k){if(command[k]!==undefined)value[k]=clone(command[k]);});if(typeof value.reason==='string')value.reason=value.reason.trim();return value;}
  function published(doc){return doc&&Array.isArray(doc.versions)&&doc.versions.find(function(v){return v.version===doc.publishedVersion&&v.status==='Published';});}
  function create(config,options){
    config=config||{};options=options||{};var native=config.nativePublication||{},rootId=id(config.rootPageId),workingId=id(native.workingRootPageId||config.workingRootPageId),policyId=id(config.entitlementsPageId||config.attachmentPageId),space=config.spaceKey;
    if(!rootId||!workingId||!policyId||rootId===workingId||typeof space!=='string'||!space||!H||!E||!S)fail('HEALTH_CONFIGURATION','Configure native WCSpedia storage, Working and entitlements before loading content health.');
    var protectedIds=Array.from(new Set([rootId,workingId,policyId,id(config.attachmentPageId),id(native.insightsPageId)].concat(Object.values(config.pageIds||{}),Object.values(native.areaPageIds||{})).map(id).filter(Boolean)));
    var db=options.nativeStorage||S.create({contextPath:config.contextPath,baseUrl:config.baseUrl,spaceKey:space,rootPageId:rootId,extraRootPageIds:[workingId],allowedPageIds:[policyId],protectedPageIds:protectedIds}, {fetch:options.fetch||root.fetch,crypto:options.crypto||root.crypto,origin:options.location&&options.location.origin||root.location&&root.location.origin});
    var subject=E.normalizeSOEID(typeof options.identity==='string'?options.identity:options.identity&&options.identity.soeid),identityKey=null,documents=new Map(),queues=new Map();
    if(!subject)fail('HEALTH_IDENTITY','Sign in with a valid SOEID before loading content health.');
    function serial(key,fn){var before=queues.get(key)||Promise.resolve(),run=before.catch(function(){}).then(fn);queues.set(key,run);return run.finally(function(){if(queues.get(key)===run)queues.delete(key);});}
    async function user(){var value=await db.user(),who=E.identity(value),key=value&&value.type==='known'&&(value.userKey||value.accountId||value.username);if(!who||who.soeid!==subject||!key||identityKey&&identityKey!==key)fail('HEALTH_IDENTITY','Your Confluence identity changed. Reload content health before continuing.');identityKey=key;return who;}
    function working(page){if(!page||page.type!=='page'||page.status!=='current'||page.space?.key!==space||!Array.isArray(page.ancestors)||String(page.ancestors[page.ancestors.length-1]?.id)!==workingId||protectedIds.includes(String(page.id)))fail('HEALTH_SCOPE','Health records belong to document pages beneath the configured Working page only.');return page;}
    function marked(page,key){return !!page.body?.storage?.value?.includes('<ac:parameter ac:name="">wcs-document-'+key+'</ac:parameter>');}
    async function locate(documentId){var context=typeof options.getContext==='function'?await options.getContext(documentId):null,doc=context&&context.document||documents.get(documentId);if(doc&&doc.singlePageInsight)fail('HEALTH_UNMANAGED','Insights uses published page history. Private review cases require a protected Job aid workflow record.');if(!doc||doc.id!==documentId||doc.deletedAt||doc.nativeSessionWorkflow!==true||!id(doc.confluencePageId))fail('HEALTH_UNMANAGED','Content-health edits require a WCSpedia-managed approved document. Import this document into the authoring workflow first.');return {id:documentId,pageId:id(doc.confluencePageId)};}
    function record(value,target){if(value===null)return null;if(!object(value)||value.schemaVersion!==1||value.documentKey!==target.id||value.workingPageId!==target.pageId||!object(value.record)||value.record.redacted===true)fail('HEALTH_CORRUPT','The health attachment belongs to a different document or is invalid.');H.validate(value.record,target.id);if(value.receipt&&(!object(value.receipt)||typeof value.receipt.requestId!=='string'||typeof value.receipt.commandHash!=='string'||!Number.isSafeInteger(value.receipt.fromRevision)||!E.normalizeSOEID(value.receipt.actorSOEID)))fail('HEALTH_CORRUPT','The health commit receipt is invalid.');return value;}
    async function source(target){
      var p=working(await db.page(target.pageId,'body.storage')),result=await db.readJSON(target.pageId,DOCUMENT,STATE),value=result.data,doc=value&&value.document;
      if(result.pointer?.pending)fail('HEALTH_WORKFLOW_PENDING','Finish the pending document save or approval before changing content health.');
      if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.people)||!doc||doc.id!==target.id||doc.nativeSessionWorkflow!==true||id(doc.confluencePageId)!==target.pageId||doc.deletedAt||!marked(p,target.id))fail('HEALTH_SCOPE','The Working document identity could not be verified.');
      var journal=await db.property(target.pageId,'wcspedia.workflow.operation');if(journal&&journal.value&&!journal.value.done)fail('HEALTH_WORKFLOW_PENDING','Finish the pending document save or approval before changing content health.');
      var version=published(doc);if(!version||!id(doc.publishedConfluencePageId))fail('HEALTH_UNPUBLISHED','Content-health changes require a current approved document.');
      var pub=await db.page(id(doc.publishedConfluencePageId),'body.storage'),ancestors=pub.ancestors||[];
      if(pub.type!=='page'||pub.status!=='current'||pub.space?.key!==space||!ancestors.some(function(a){return String(a.id)===rootId;})||ancestors.some(function(a){return String(a.id)===workingId;})||protectedIds.includes(String(pub.id))||!marked(pub,target.id)||pub.version?.number!==doc.publishedConfluencePageVersion)fail('HEALTH_SOURCE_CHANGED','The published native page changed outside this approved snapshot. Reconcile it through the document workflow first.');
      return {document:clone(doc),people:clone(value.people),page:p,binding:hash({documentKey:doc.id,workingPageId:target.pageId,publishedPageId:pub.id,publishedNativeVersion:pub.version.number,approvedSnapshot:H.sourceFingerprint(version)})};
    }
    async function authority(target,current){
      var who=await user(),policyFile=await db.readJSON(policyId,config.entitlementsFilename||'entitlements.json','wcspedia.entitlements.v1');
      if(policyFile.pointer?.pending)fail('HEALTH_FORBIDDEN','Entitlements are being updated. Retry after that change is confirmed.');
      var policy=E.validatePolicy(policyFile.data),page=working(await db.page(target.pageId));
      if(!E.nativeHas(page.operations,'update')||!E.hasGrant(policy,who,'content.edit',target.id))fail('HEALTH_FORBIDDEN','Current Confluence edit permission and a WCSpedia document-edit grant are required.');
      var people=current.people.map(function(p){var person=clone(p),soeid=E.normalizeSOEID(p.soeid||p.confluence?.username);person.soeid=soeid;person.role='Reader';if(soeid){var grants=policy.records.filter(function(r){return r.active&&r.soeid===soeid;});person.role=['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(function(cap){return grants.some(function(r){return r.scope==='*'&&r.permissions.includes(cap);});})?'Manager':grants.some(function(r){return r.permissions.includes('content.edit')||r.permissions.includes('content.create');})?'Author':'Reader';}return person;});
      var actor=people.find(function(p){return p.soeid===who.soeid;});
      if(!actor){actor={id:'wcs-user-'+who.soeid.toLowerCase(),soeid:who.soeid,name:who.displayName,role:['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(function(cap){return E.hasGrant(policy,who,cap,'*');})?'Manager':'Author'};people.push(actor);}
      if(new Set(people.map(function(p){return p.id;})).size!==people.length||people.filter(function(p){return p.soeid===who.soeid;}).length!==1)fail('HEALTH_IDENTITY','The workflow directory identity is ambiguous.');
      return {people:people,actor:actor,context:{canEdit:true,signedSOEID:who.soeid}};
    }
    async function load(list){
      if(!Array.isArray(list)||list.some(function(d){return !d||typeof d.id!=='string';}))fail('HEALTH_INPUT','Provide the readable documents to load content health.');
      await user();documents=new Map(list.map(function(d){return [d.id,clone(d)];}));var result=Object.create(null),eligible=list.filter(function(d){return d.nativeSessionWorkflow===true&&!d.singlePageInsight&&published(d)&&!d.deletedAt;}),next=0;
      await Promise.all(Array.from({length:Math.min(4,eligible.length)},async function(){while(next<eligible.length){var doc=eligible[next++],target={id:doc.id,pageId:id(doc.confluencePageId)};working(await db.page(target.pageId));var state=await db.readJSON(target.pageId,FILE,KEY),value=record(state.data,target);var operation=await db.property(target.pageId,JOURNAL,{optional:true});if(state.pointer?.pending||operation?.value&&!operation.value.done){var error=new Error('A health save is awaiting confirmation. Retry the original action to reconcile it.');error.code='HEALTH_OUTCOME_UNKNOWN';if(operation?.value?.actorSOEID===subject)error.recoveryDocumentId=doc.id;throw error;}if(value)result[doc.id]=clone(value.record);}}));
      return result;
    }
    // A prepared operation has not called the attachment writer. Its journal
    // phase is CAS-switched before that call, so another tab cannot abandon it
    // after an upload may have started. Never clear a pending attachment write.
    async function abortPrepared(recovery){
      if(!recovery)return false;
      await user();
      var target=recovery.target,entry=await db.property(target.pageId,JOURNAL,{optional:true}),op=entry&&entry.value;
      if(!op||op.requestId!==recovery.requestId||op.actorSOEID!==subject||op.done||op.writeStarted!==false)return false;
      var state=await db.readJSON(target.pageId,FILE,KEY);
      if(state.pointer?.pending||state.revision!==op.expectedRevision||state.attachmentVersion!==op.expectedAttachmentVersion||hash(state.data)!==op.healthHash)return false;
      await db.putProperty(target.pageId,JOURNAL,Object.assign({},op,{done:true,aborted:true,abortReason:'Stopped before attachment write; the existing health record is unchanged.'}),entry.version.number);
      return true;
    }
    function submit(documentId,input){var recovery=null;return serial(documentId,async function(){
      if(typeof documentId!=='string'||!documentId)fail('HEALTH_INPUT','A document key is required.');
      var command=cleanCommand(input),commandHash=hash(command),target=await locate(documentId),state=await db.readJSON(target.pageId,FILE,KEY),value=record(state.data,target),entry=await db.property(target.pageId,JOURNAL,{optional:true}),pending=entry&&entry.value;
      function validOperation(op){return object(op)&&op.schemaVersion===1&&op.documentKey===target.id&&op.workingPageId===target.pageId&&typeof op.done==='boolean'&&typeof op.requestId==='string'&&op.requestId.startsWith('health-')&&op.commandHash===hash(op.command)&&Number.isFinite(Date.parse(op.at))&&Number.isSafeInteger(op.expectedRevision)&&Number.isSafeInteger(op.expectedAttachmentVersion)&&typeof op.binding==='string'&&(op.writeStarted===undefined||typeof op.writeStarted==='boolean'&&typeof op.healthHash==='string')&&E.normalizeSOEID(op.actorSOEID);}
      if(pending&&!validOperation(pending))fail('HEALTH_CORRUPT','The native health operation journal is invalid.');
      var same=pending&&pending.commandHash===commandHash&&pending.actorSOEID===subject;
      if(pending&&!pending.done&&!same)fail('HEALTH_PENDING','Another health action is pending. Its original author must retry that action before a new change.');
      if(same&&!pending.done)recovery={target:target,requestId:pending.requestId};
      // A lost response can be recovered across reloads using the same action.
      if(same&&value?.receipt?.requestId===pending.requestId&&value.receipt.commandHash===commandHash&&value.receipt.actorSOEID===subject){await authority(target,{people:[]});if(!pending.done)await db.putProperty(target.pageId,JOURNAL,Object.assign({},pending,{done:true}),entry.version.number);return clone(value.record);}
      var current=await source(target),access=await authority(target,current);
      if(pending&&!pending.done&&(pending.binding!==current.binding||pending.expectedRevision!==state.revision&&!(state.pointer?.pending?.requestId===pending.requestId)))fail('HEALTH_CONFLICT','The document or health baseline changed while a save was pending. Reconcile the recorded operation before continuing.');
      var actionTime=pending&&!pending.done?pending.at:options.now?options.now():new Date().toISOString();
      var updated=H.transition(value&&value.record,current.document,command,Object.assign({},access,{now:actionTime}));
      var startOperation=!pending||pending.done;
      if(startOperation){
        var crypto=options.crypto||root.crypto;if(!crypto||typeof crypto.randomUUID!=='function')fail('HEALTH_CONFIGURATION','A secure request identifier is required.');
        pending={schemaVersion:1,documentKey:target.id,workingPageId:target.pageId,requestId:'health-'+crypto.randomUUID(),actorSOEID:subject,command:command,commandHash:commandHash,binding:current.binding,at:actionTime,expectedRevision:state.revision,expectedAttachmentVersion:state.attachmentVersion,expectedFingerprint:state.fingerprint,healthHash:hash(state.data),writeStarted:false,done:false};
      }
      var envelope={schemaVersion:1,documentKey:target.id,workingPageId:target.pageId,record:updated,receipt:{requestId:pending.requestId,commandHash:commandHash,actorSOEID:subject,fromRevision:command.expectedRevision}};
      if(new TextEncoder().encode(JSON.stringify(envelope)).byteLength>10000000)fail('HEALTH_LIMIT','This document’s health history exceeds the 10 MB attachment limit. Export and archive its history before starting a new record; the existing file was preserved.');
      recovery={target:target,requestId:pending.requestId};
      if(startOperation)entry=await db.putProperty(target.pageId,JOURNAL,pending,entry?entry.version.number:null);
      // Refresh native grants and approved content immediately before committing.
      var checked=await source(target);if(checked.binding!==pending.binding)fail('HEALTH_SOURCE_CHANGED','The approved document changed before this health save. Reconcile the pending action.');
      var refreshed=await authority(target,checked),freshResult=H.transition(value&&value.record,checked.document,command,Object.assign({},refreshed,{now:pending.at}));
      if(hash(freshResult)!==hash(updated))fail('HEALTH_AUTHORITY_CHANGED','Your current access changed the outcome of this health action. Refresh before submitting it again.');
      updated=freshResult;envelope.record=updated;
      if(pending.writeStarted===false){pending=Object.assign({},pending,{writeStarted:true});entry=await db.putProperty(target.pageId,JOURNAL,pending,entry.version.number);} 
      var saved=await db.writeJSON(target.pageId,FILE,KEY,envelope,{expectedRevision:pending.expectedRevision,expectedAttachmentVersion:pending.expectedAttachmentVersion,expectedFingerprint:pending.expectedFingerprint,requestId:pending.requestId});
      var confirmed=record(saved.data,target);if(!confirmed||confirmed.receipt?.requestId!==pending.requestId||hash(confirmed.record)!==hash(updated))fail('HEALTH_OUTCOME_UNKNOWN','Confluence did not confirm this health action. Retry the original action to reconcile it.');
      await db.putProperty(target.pageId,JOURNAL,Object.assign({},pending,{done:true}),entry.version.number);
      return clone(confirmed.record);
    }).catch(async function(error){
      var abandoned=false;try{abandoned=await abortPrepared(recovery);}catch(_){/* Preserve the journal if native permission, CAS or confirmation is uncertain. */}
      if(abandoned){error.operationAborted=true;error.message+=' No health change was saved; the prepared operation was released.';}
      if(!abandoned&&['UNKNOWN_COMMIT','HEALTH_OUTCOME_UNKNOWN'].includes(error.code)){error.retryOriginal=true;error.recoveryDocumentId=documentId;}
      throw error;
    });}
    async function recover(documentId){await user();var target=await locate(documentId),entry=await db.property(target.pageId,JOURNAL,{optional:true}),op=entry&&entry.value;if(!op||op.actorSOEID!==subject||!object(op.command))fail('HEALTH_FORBIDDEN','Only the original signed-in author can recover this health action.');return submit(documentId,op.command);}
    return Object.freeze({load:load,submit:submit,recover:recover,available:true,live:true,native:true,storeKey:null,supports:function(doc){return !!doc&&doc.nativeSessionWorkflow===true&&!doc.singlePageInsight&&!!published(doc);}});
  }
  return Object.freeze({create:create,FILE:FILE,KEY:KEY,JOURNAL:JOURNAL});
});
