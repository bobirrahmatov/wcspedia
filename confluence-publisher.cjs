'use strict';
/* Trusted-server module. Call only after authentication, CSRF, native permissions,
 * business entitlements and the exact workflow transition have been checked.
 * REST writes are a resumable saga: persist the staged domain transition/outbox
 * before invoking this module; commit the domain result only after its receipt.
 * Never send this module, credentials or its journal to a browser/attachment. */
const {createHash, randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const MAX_ATTACHMENT_BYTES=10000000; // Conservative 10 MB ceiling per Confluence attachment.
const AREAS=['credit-approval-control','credit-information-management','credit-management-reporting','deal-closing','documentation-pledging','emea-credit-admin','loan-management','regional-operating-manuals'];
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const json=x=>JSON.stringify(canonical(x));
function fail(message,code='PUBLICATION_INVALID'){const e=new Error(message);e.code=code;throw e;}
function validateMedia(item){
  if(!item||!Buffer.isBuffer(item.bytes)||!item.bytes.length||!item.fileName||!/^[-A-Za-z0-9._]+$/.test(item.fileName))fail('Media must be validated bytes with a safe filename and a non-empty body.');
  if(item.bytes.length>MAX_ATTACHMENT_BYTES)fail('Each Confluence attachment must be 10 MB (10,000,000 bytes) or smaller. Reduce the file before saving.','ATTACHMENT_TOO_LARGE');
}
async function attachmentBytes(response){
  const failSize=()=>fail('A Confluence attachment exceeds the 10 MB (10,000,000 byte) limit.','ATTACHMENT_TOO_LARGE');
  const length=response.headers?.get?.('content-length');
  if(length!=null&&Number(length)>MAX_ATTACHMENT_BYTES){await response.body?.cancel?.();failSize();}
  if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader(),chunks=[];let length=0;
    try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX_ATTACHMENT_BYTES){await reader.cancel();failSize();}chunks.push(Buffer.from(part.value));}}finally{reader.releaseLock();}
    return Buffer.concat(chunks,length);
  }
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>MAX_ATTACHMENT_BYTES)failSize();return bytes;
}
function id(v,name){if(typeof v!=='string'||!/^\d*[1-9]\d*$/.test(v)||v[0]==='0')fail(`${name} must be a positive numeric page ID.`);return v;}
function text(v,name){if(typeof v!=='string'||!v.trim())fail(`${name} is required.`);return v.trim();}
function escape(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const anchor=value=>'<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">'+escape(value)+'</ac:parameter></ac:structured-macro>';
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function marker(body,value){return typeof body==='string'&&body.includes('>'+value+'</ac:parameter>');}
function validateSnapshot(document,people,operation){
  if(!document||typeof document!=='object'||document.deletedAt)fail('An active document is required.');
  text(document.id,'Document key');text(document.area,'Business area');text(document.type,'Content type');
  if(!Array.isArray(document.versions)||!document.versions.length)fail('Document versions are required.');
  const v=document.versions.reduce((a,b)=>a.version>b.version?a:b);
  if(!Number.isSafeInteger(v.version)||v.version<1||!Number.isSafeInteger(v.revision)||v.revision<1)fail('Version and revision must be positive integers.');
  text(v.title,'Document title');
  if(Object.hasOwn(v,'commentsEnabled')&&typeof v.commentsEnabled!=='boolean')fail('commentsEnabled must be true or false.');
  if(operation==='published'){
    const known=new Map((people||[]).map(p=>[p.id,p]));
    if(v.status!=='Published'||document.publishedVersion!==v.version)fail('Only the current approved snapshot can be published.');
    if(v.reviewedBy!==document.reviewerId||v.approvedBy!==document.approverId||v.reviewedRevision!==v.revision||!known.has(v.reviewedBy)||known.get(v.approvedBy)?.role!=='Manager')fail('Review and manager approval must match this exact document revision.');
    const contributors=new Set([document.authorId,v.createdBy,...(v.contributorIds||[])]);
    if(contributors.has(v.reviewedBy)||contributors.has(v.approvedBy))fail('A contributor cannot review or approve their own revision.');
    const review=Date.parse(v.reviewedAt),approval=Date.parse(v.approvedAt);
    if(!Number.isFinite(review)||!Number.isFinite(approval)||review>approval)fail('Valid review and approval timestamps are required.');
    const audit=(document.audit||[]).filter(e=>e.action==='approve'&&e.version===v.version&&e.revision===v.revision&&e.actorId===v.approvedBy&&e.at===v.approvedAt);
    if(audit.length!==1)fail('An exact-revision approval audit event is required.');
  }
  return v;
}
function createPublisher(config){
  if(!config||typeof config!=='object')fail('Publisher configuration is required.');
  const base=new URL(text(config.baseUrl,'Confluence base URL'));
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)fail('Use an HTTPS Confluence base URL without embedded credentials or query strings.');
  base.pathname=base.pathname.replace(/\/$/,'');
  const spaceKey=text(config.spaceKey,'Space key'),workingRoot=id(config.workingRootPageId,'Working root'),publishedRoot=id(config.publishedRootPageId,'Published root');
  if(workingRoot===publishedRoot)fail('Working and published roots must differ.');
  const areas=config.areaPageIds&&clone(config.areaPageIds);
  if(!areas||AREAS.some(a=>!Object.hasOwn(areas,a)))fail('Configure all eight business-area parent page IDs.');
  AREAS.forEach(a=>id(areas[a],a));
  if(new Set([workingRoot,publishedRoot,...AREAS.map(a=>areas[a])]).size!==10)fail('Working, published and area page IDs must be distinct.');
  const insightsTypes=config.insightsTypes===undefined?[]:clone(config.insightsTypes);
  if(!Array.isArray(insightsTypes)||insightsTypes.length>20||insightsTypes.some(type=>typeof type!=='string'||!type.trim()||type!==type.trim()||type.length>80)||new Set(insightsTypes).size!==insightsTypes.length)fail('insightsTypes must be distinct content type names.');
  const insightsId=config.insightsPageId==null||config.insightsPageId===''?'':id(config.insightsPageId,'Insights parent');
  if(insightsId&&[workingRoot,publishedRoot,...Object.values(areas)].includes(insightsId))fail('Insights must use a distinct native parent page.');
  function destination(document,operation){
    if(operation==='working')return workingRoot;
    if(insightsTypes.includes(document.type)){
      if(!insightsId)fail('Configure the Insights parent page ID before publishing this content type.','INSIGHTS_NOT_CONFIGURED');
      return insightsId;
    }
    return areas[document.area];
  }
  const fetcher=config.fetch||globalThis.fetch,journal=config.journal;
  if(typeof fetcher!=='function'||!journal||!['get','set','withLock'].every(k=>typeof journal[k]==='function'))fail('A fetch transport and durable locking journal are required.');
  const renderer=config.renderStorage||((...args)=>require('./confluence-storage.cjs').renderStorage(...args));
  if(config.hostStyleFlags!=null&&typeof config.hostStyleFlags!=='boolean')fail('hostStyleFlags must be true or false.');
  const hostStyleFlags=config.hostStyleFlags!==false;
  const collect=config.collectMedia||((...args)=>require('./confluence-storage.cjs').collectMedia(...args));
  const headers={Accept:'application/json',...(config.headers||{})};
  const journalKey=documentKey=>'native-publisher:'+publishedRoot+':'+hash(base.href+'\n'+documentKey);
  async function request(route,options={},binary=false){
    const target=new URL(base.href.replace(/\/$/,'')+route);
    if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname+'/'))fail('REST route escaped the configured Confluence base.');
    let response;try{response=await fetcher(target.href,{...options,headers:{...headers,...(options.headers||{})},redirect:'error'});}catch(error){const e=new Error('The Confluence request did not return a confirmed result. Retry this same operation to reconcile it.');e.code='CONFLUENCE_UNCERTAIN';e.cause=error;throw e;}
    if(!response.ok){const e=new Error(response.status===413?'Confluence rejected the upload because its attachment or request size limit was exceeded. Each attachment must be 10 MB or smaller; the server or proxy may impose a lower limit.':`Confluence returned HTTP ${response.status}.`);e.status=response.status;e.code=response.status===413?'ATTACHMENT_TOO_LARGE':response.status===409?'CONFLUENCE_CONFLICT':'CONFLUENCE_HTTP';try{await response.body?.cancel?.();}catch(_){}throw e;}
    if(response.status===204)return null;
    if(binary)return attachmentBytes(response);
    try{return await response.json();}catch(error){const e=new Error('Confluence returned an invalid JSON confirmation.');e.code='CONFLUENCE_UNCERTAIN';e.cause=error;throw e;}
  }
  const post=(route,payload,method='POST')=>request(route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  async function page(pageId){const p=await request('/rest/api/content/'+id(pageId,'Page ID')+'?expand=space,ancestors,version,body.storage');if(p.id!==pageId||p.type!=='page'||p.status!=='current'||!Number.isSafeInteger(p.version?.number)||!Array.isArray(p.ancestors)||p.space?.key!==spaceKey)fail('Confluence returned an invalid, unavailable or out-of-space page.','PAGE_SCOPE');return p;}
  const parent=p=>p.ancestors.at(-1)?.id;
  async function configurationCheck(){
    const [working,published,...areaPages]=await Promise.all([page(workingRoot),page(publishedRoot),...AREAS.map(a=>page(areas[a]))]);
    if(working.ancestors.some(a=>a.id===publishedRoot)||published.ancestors.some(a=>a.id===workingRoot))fail('Working and published roots must not overlap.','PAGE_SCOPE');
    areaPages.forEach((p,i)=>{if(parent(p)!==publishedRoot||p.id!==areas[AREAS[i]])fail('Every business-area page must be directly beneath the configured published root.','PAGE_SCOPE');});
    if(insightsId){const insights=await page(insightsId);if(parent(insights)!==publishedRoot||insights.ancestors.some(a=>a.id===workingRoot))fail('The Insights parent must be directly beneath the WCSpedia published root in the configured space.','PAGE_SCOPE');}
    const restrictions=await request('/rest/api/content/'+workingRoot+'/restriction/byOperation/read?expand=restrictions.user,restrictions.group');
    if(restrictions.operation!=='read'||!((restrictions.restrictions?.user?.results?.length||0)+(restrictions.restrictions?.group?.results?.length||0)))fail('The working root must have explicit native read restrictions before drafting.','WORKING_ROOT_UNRESTRICTED');
    return {spaceKey,workingRootPageId:workingRoot,publishedRootPageId:publishedRoot,areaPageIds:clone(areas),insightsPageId:insightsId,insightsTypes:insightsTypes.slice()};
  }
  const mapping=r=>{const m={};if(r.working){m.confluencePageId=r.working.pageId;m.confluencePageVersion=r.working.pageVersion;}if(r.published){m.publishedConfluencePageId=r.published.pageId;m.publishedConfluencePageVersion=r.published.pageVersion;}return m;};
  function checkIncoming(doc,record){
    for(const [field,name] of [['confluencePageId','working'],['publishedConfluencePageId','published']]){
      if(doc[field]!=null&&doc[field]!==record[name]?.pageId)fail('The document page mapping differs from the durable publisher journal.','PAGE_MAPPING');
      const versionField=name==='working'?'confluencePageVersion':'publishedConfluencePageVersion';
      if(doc[versionField]!=null&&doc[versionField]!==record[name]?.pageVersion)fail('The document native page version is stale.','CONFLUENCE_CONFLICT');
    }
  }
  function identity(documentKey,operation){return 'wcs-'+operation+'-'+hash(documentKey);}
  async function verifiedManaged(entry,record,operation,allowedParent){
    const p=await page(entry.pageId);
    if(parent(p)!==allowedParent||!marker(p.body?.storage?.value,identity(record.documentKey,operation))||!marker(p.body.storage.value,entry.identityNonce))fail('The managed page was moved or its document identity changed.','PAGE_SCOPE');
    return p;
  }
  async function findPending(op,record,operation){
    const result=await request('/rest/api/content?type=page&spaceKey='+encodeURIComponent(spaceKey)+'&title='+encodeURIComponent(op.seedTitle)+'&expand=space,ancestors,version,body.storage&limit=2');
    if(!Array.isArray(result.results)||result.results.length>1)fail('Cannot reconcile the pending page creation unambiguously.','CONFLUENCE_UNCERTAIN');
    if(!result.results.length)fail('The previous create outcome is unknown. No duplicate was created; administrator reconciliation is required.','CONFLUENCE_UNCERTAIN');
    const p=await page(String(result.results[0].id));
    if(parent(p)!==workingRoot||!marker(p.body?.storage?.value,identity(record.documentKey,operation))||!marker(p.body.storage.value,op.identityNonce))fail('A conflicting page cannot be adopted as this document.','PAGE_MAPPING');
    return p;
  }
  async function mediaOnPage(pageId,items,media,op,persist){
    for(const item of items){
      validateMedia(item);
      const digest=hash(item.bytes),prior=op.media?.[item.fileName];
      const result=await request('/rest/api/content/'+pageId+'/child/attachment?filename='+encodeURIComponent(item.fileName)+'&expand=version&limit=2');
      if(!Array.isArray(result.results)||result.results.length>1)fail('Attachment lookup was ambiguous.');
      let attachment=result.results[0];
      if(attachment){
        const version=attachment.version?.number;if(!Number.isSafeInteger(version)||version<1)fail('Attachment version was not confirmed.');
        const bytes=await request('/download/attachments/'+pageId+'/'+encodeURIComponent(item.fileName)+'?version='+version,{},true);
        if(hash(bytes)!==digest)fail('An existing attachment does not match the approved bytes.','MEDIA_CONFLICT');
        if(prior&&(prior.id!==attachment.id||prior.version!==version))fail('A staged attachment was modified outside this publication.','MEDIA_CONFLICT');
      }else{
        const form=new FormData();form.append('file',new Blob([item.bytes],{type:item.mediaType||'application/octet-stream'}),item.fileName);form.append('comment','WCSpedia SHA-256 '+digest);
        const result=await request('/rest/api/content/'+pageId+'/child/attachment',{method:'POST',headers:{'X-Atlassian-Token':'nocheck'},body:form});
        attachment=result.results?.[0];if(!attachment?.id||!Number.isSafeInteger(attachment.version?.number)||attachment.title!==item.fileName)fail('Confluence did not confirm the attachment upload.','CONFLUENCE_UNCERTAIN');
        const uploaded=await request('/download/attachments/'+pageId+'/'+encodeURIComponent(item.fileName)+'?version='+attachment.version.number,{},true);
        if(hash(uploaded)!==digest)fail('Uploaded attachment bytes were not confirmed.','MEDIA_CONFLICT');
      }
      op.media=op.media||{};op.media[item.fileName]={id:attachment.id,version:attachment.version.number,digest};await persist();
      const entry={fileName:item.fileName,pageId,attachmentId:attachment.id,version:attachment.version.number};
      [item.id,item.key,item.sourceUrl].filter(Boolean).forEach(key=>media[key]=entry);
    }
  }
  async function validate({document,people,action,media: suppliedMedia}){
    if(action==='delete'){
      const key=text(document?.id,'Document key');
      if(!document.deletedAt||!document.deletedAuditEventId||!(document.audit||[]).some(e=>e.id===document.deletedAuditEventId&&e.action==='delete'&&e.documentKey===key))fail('Retain an authorized deletion audit event before trashing native pages.');
      if(!Object.hasOwn(areas,document.area))fail('Unknown business area.');
      return {operation:'deleted',documentKey:key,areaId:document.area};
    }
    const operation=action==='approve'?'published':'working',version=validateSnapshot(document,people,operation);
    if(!Object.hasOwn(areas,document.area))fail('Unknown business area.');
    const parentPageId=destination(document,operation);
    const media=clone(suppliedMedia||{}),items=await collect(document,version,{operation,media});
    if(!Array.isArray(items))fail('The media staging plan is invalid.');
    for(const item of items){
      validateMedia(item);
      [item.id,item.key,item.sourceUrl].filter(Boolean).forEach(key=>media[key]={fileName:item.fileName});
    }
    const rendered=await renderer(document,version,people,{operation,documentKey:document.id,parentPageId,media,hostStyleFlags});
    if(typeof rendered!=='string'||!rendered.trim())fail('The storage renderer returned no document body.');
    return {operation,documentKey:document.id,areaId:document.area,version:version.version,revision:version.revision};
  }
  async function run(operation,input){
    const {document,people,requestId}=input||{};text(requestId,'Idempotency request ID');
    const version=validateSnapshot(document,people,operation),documentKey=document.id;
    if(!Object.hasOwn(areas,document.area))fail('Unknown business area.');
    // Server-supplied staged media only. Caller never forwards browser mappings.
    const finalParent=destination(document,operation);
    const initialMedia=clone(input.media||{}),items=await collect(document,version,{operation,media:initialMedia});
    if(!Array.isArray(items))fail('The media staging plan is invalid.');
    // Reject all oversized resources before creating a page or recording intent.
    items.forEach(validateMedia);
    const operationKey=hash(json({operation,documentKey,area:document.area,type:document.type,version,people,media:initialMedia,mediaDigests:items.map(i=>({key:i.key,fileName:i.fileName,digest:hash(i.bytes)}))}));
    return journal.withLock(journalKey(documentKey),async()=>{
      await configurationCheck();
      const record=await journal.get(journalKey(documentKey))||{documentKey,areaId:document.area,operations:{}};
      if(record.documentKey!==documentKey||record.areaId!==document.area)fail('The document key or business-area mapping cannot change implicitly.','PAGE_MAPPING');
      if(record.deletion)fail('The document is pending deletion or has been deleted.');
      const recordedParent=record[operation]?.parentPageId||(record[operation]&&(operation==='working'?workingRoot:areas[record.areaId]));
      if(recordedParent&&recordedParent!==finalParent)fail('This document already has a different publication parent. Complete an explicit migration before changing its destination.','CONFLUENCE_CONFLICT');
      const existingOp=record.operations[operationKey];
      // Retried pending/committed writes can legitimately be ahead of domain state.
      if(!existingOp)checkIncoming(document,record);
      if(existingOp?.state==='committed'){
        if(record[operation]?.pageId!==existingOp.receipt.pageId||record[operation]?.pageVersion!==existingOp.receipt.pageVersion)fail('This publication request was superseded.','CONFLUENCE_CONFLICT');
        const p=await verifiedManaged(record[operation],record,operation,finalParent);
        if(p.version.number!==existingOp.receipt.pageVersion||!marker(p.body.storage.value,existingOp.snapshotMarker))fail('The page changed after this publication.','CONFLUENCE_CONFLICT');
        return {receipt:clone(existingOp.receipt),mapping:mapping(record)};
      }
      let op=existingOp;
      if(!op){
        if(Object.values(record.operations).some(o=>o.state!=='committed'))fail('Reconcile the unfinished publication before saving another revision.','PUBLICATION_PENDING');
        op=record.operations[operationKey]={state:'planned',requestId,identityNonce:record[operation]?.identityNonce||'wcs-created-'+randomUUID(),snapshotMarker:'wcs-snapshot-'+operationKey,seedTitle:'WCSpedia '+operation+' '+hash(documentKey).slice(0,32),pageId:record[operation]?.pageId||null,expectedPageVersion:record[operation]?.pageVersion||null};
        await journal.set(journalKey(documentKey),record);
      }
      const persist=()=>journal.set(journalKey(documentKey),record);
      let p;
      if(!op.pageId){
        if(op.state==='create-pending')p=await findPending(op,record,operation);
        else{
          op.state='create-pending';await persist();
          p=await post('/rest/api/content',{type:'page',title:op.seedTitle,space:{key:spaceKey},ancestors:[{id:workingRoot}],body:{storage:{representation:'storage',value:anchor(identity(documentKey,operation))+anchor(op.identityNonce)+'<p>WCSpedia content is being prepared.</p>'}}});
          if(!p?.id)fail('Confluence did not confirm the created page ID.','CONFLUENCE_UNCERTAIN');
          p=await page(String(p.id));
          if(parent(p)!==workingRoot||!marker(p.body?.storage?.value,op.identityNonce))fail('Created page identity or parent was not confirmed.','PAGE_MAPPING');
        }
        op.pageId=p.id;op.expectedPageVersion=p.version.number;op.newPage=true;op.state='preparing';await persist();
      }
      const currentParent=op.newPage?workingRoot:finalParent;
      p=await page(op.pageId);
      if(op.state==='write-pending'&&p.version.number===op.expectedPageVersion+1&&parent(p)===finalParent&&marker(p.body?.storage?.value,op.snapshotMarker)&&marker(p.body.storage.value,op.identityNonce)){
        op.pageVersion=p.version.number;op.state='body-committed';await persist();
      }else if(op.state!=='body-committed'){
        if(parent(p)!==currentParent||p.version.number!==op.expectedPageVersion||!marker(p.body?.storage?.value,identity(documentKey,operation))||!marker(p.body.storage.value,op.identityNonce))fail('The native page was modified or moved; refresh before retrying.','CONFLUENCE_CONFLICT');
        const media={...initialMedia};await mediaOnPage(p.id,items,media,op,persist);
        const rendered=await renderer(document,version,people,{operation,documentKey,parentPageId:finalParent,media,hostStyleFlags});
        if(typeof rendered!=='string'||!rendered.trim())fail('The storage renderer returned no document body.');
        const body=anchor(identity(documentKey,operation))+anchor(op.identityNonce)+anchor(op.snapshotMarker)+rendered;
        // Re-read immediately before CAS; attachment writes must not mask an edit.
        p=await page(p.id);if(p.version.number!==op.expectedPageVersion||parent(p)!==currentParent)fail('Native content changed during media staging.','CONFLUENCE_CONFLICT');
        op.state='write-pending';await persist();
        const suffix=' ['+(operation==='working'?'Working · ':'')+hash(documentKey).slice(0,12)+']';
        await post('/rest/api/content/'+p.id,{id:p.id,type:'page',title:version.title.slice(0,240-suffix.length)+suffix,space:{key:spaceKey},ancestors:[{id:finalParent}],version:{number:op.expectedPageVersion+1,message:'WCSpedia '+operation+' v'+version.version+' r'+version.revision},body:{storage:{representation:'storage',value:body}}},'PUT');
        p=await page(p.id);
        if(p.version.number!==op.expectedPageVersion+1||parent(p)!==finalParent||!marker(p.body?.storage?.value,op.snapshotMarker))fail('The native content write was not confirmed.','CONFLUENCE_UNCERTAIN');
        op.pageVersion=p.version.number;op.state='body-committed';await persist();
      }
      p=await verifiedManaged({pageId:op.pageId,identityNonce:op.identityNonce},record,operation,finalParent);
      if(p.version.number!==op.pageVersion||!marker(p.body.storage.value,op.snapshotMarker))fail('The committed native content changed before finalization.','CONFLUENCE_CONFLICT');
      const labels=['wcspedia','wcs-document','wcs-area-'+document.area,'wcs-type-'+slug(document.type),'wcs-status-'+(operation==='published'?'published':'working')];
      for(const [field,kind] of [['tags','tag'],['processes','process'],['regions','region']])for(const value of version[field]||[]){const normalized=String(value).trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!/[^\x20-\x7e]/.test(normalized)&&slug(normalized))labels.push('wcs-'+kind+'-'+slug(normalized));}
      // Retire removed facets only; retain labels belonging to native Confluence/users.
      const oldLabels=await request('/rest/api/content/'+p.id+'/label?limit=200');
      if(!Array.isArray(oldLabels.results)||oldLabels._links?.next)fail('Cannot reconcile this page label set safely.');
      for(const label of oldLabels.results){if(/^wcs-(?:area|type|status|tag|process|region)-/.test(label.name)&&!labels.includes(label.name))await request('/rest/api/content/'+p.id+'/label?name='+encodeURIComponent(label.name),{method:'DELETE'});}
      await post('/rest/api/content/'+p.id+'/label',labels.map(name=>({prefix:'global',name})));
      op.receipt={operation,documentKey,areaId:document.area,pageId:p.id,parentPageId:finalParent,pageVersion:p.version.number,version:version.version,revision:version.revision};op.state='committed';
      record[operation]={pageId:p.id,pageVersion:p.version.number,parentPageId:finalParent,identityNonce:op.identityNonce};await persist();
      return {receipt:clone(op.receipt),mapping:mapping(record)};
    });
  }
  async function trashDocument({document,requestId}){
    text(requestId,'Idempotency request ID');const key=text(document?.id,'Document key');
    if(!document.deletedAt||!document.deletedAuditEventId||!(document.audit||[]).some(e=>e.id===document.deletedAuditEventId&&e.action==='delete'&&e.documentKey===key))fail('Retain an authorized deletion audit event before trashing native pages.');
    return journal.withLock(journalKey(key),async()=>{
      await configurationCheck();const record=await journal.get(journalKey(key));if(!record||record.areaId!==document.area)fail('A durable document mapping is required for deletion.','PAGE_MAPPING');
      if(record.deletion?.state==='committed')return {receipt:clone(record.deletion.receipt),mapping:mapping(record)};
      if(Object.values(record.operations).some(op=>op.state!=='committed'))fail('Reconcile unfinished publication before deleting the document.','PUBLICATION_PENDING');
      checkIncoming(document,record);
      record.deletion=record.deletion||{state:'pending',requestId,eventId:document.deletedAuditEventId,pages:{}};
      if(record.deletion.eventId!==document.deletedAuditEventId)fail('The deletion event differs from the pending deletion.');
      await journal.set(journalKey(key),record);
      for(const operation of ['working','published']){
        const entry=record[operation];if(!entry||record.deletion.pages[operation]==='trashed')continue;
        let p;try{p=await verifiedManaged(entry,record,operation,entry.parentPageId||(operation==='working'?workingRoot:areas[record.areaId]));}catch(error){if(error.status===404&&record.deletion.pages[operation]==='delete-pending'){record.deletion.pages[operation]='trashed';await journal.set(journalKey(key),record);continue;}throw error;}
        if(p.version.number!==entry.pageVersion)fail('The native page changed before deletion.','CONFLUENCE_CONFLICT');
        record.deletion.pages[operation]='delete-pending';await journal.set(journalKey(key),record);
        await request('/rest/api/content/'+p.id,{method:'DELETE'});
        record.deletion.pages[operation]='trashed';await journal.set(journalKey(key),record);
      }
      record.deletion.receipt={operation:'deleted',documentKey:key,areaId:record.areaId,workingPageId:record.working?.pageId||null,publishedPageId:record.published?.pageId||null,auditEventId:document.deletedAuditEventId};record.deletion.state='committed';await journal.set(journalKey(key),record);
      return {receipt:clone(record.deletion.receipt),mapping:mapping(record)};
    });
  }
  function publicationDestination(document){if(!document||!Object.hasOwn(areas,document.area))fail('Unknown business area.');return Object.freeze({kind:insightsTypes.includes(document.type)?'insights':'area',parentPageId:destination(document,'published')});}
  return Object.freeze({configurationCheck,publicationDestination,validate,syncWorking:input=>run('working',input),publishApproved:input=>run('published',input),trashDocument});
}
/* Durable reference journal for ONE Node process on ONE host. Atomic rename and
 * fsync protect files; in-process queues serialize operations. Clustered services
 * MUST inject a database journal with distributed withLock/transaction semantics.
 * The directory contains trusted state and must not be served or attached. */
const fileJournalQueues=new Map();
function createFileJournal(directory){
  const root=path.resolve(text(directory,'Journal directory'));
  if(!fileJournalQueues.has(root))fileJournalQueues.set(root,new Map());
  const queues=fileJournalQueues.get(root);
  const file=key=>path.join(root,hash(text(key,'Journal key'))+'.json');
  async function get(key){try{return JSON.parse(await fs.readFile(file(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function set(key,value){await fs.mkdir(root,{recursive:true,mode:0o700});const target=file(key),temp=target+'.'+randomUUID()+'.tmp';let handle;try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;await fs.rename(temp,target);const dir=await fs.open(root,'r');try{await dir.sync();}finally{await dir.close();}}finally{if(handle)await handle.close();await fs.rm(temp,{force:true});}}
  async function withLock(key,fn){const prior=queues.get(key)||Promise.resolve();let release;const current=new Promise(r=>{release=r;});queues.set(key,current);await prior;try{return await fn();}finally{release();if(queues.get(key)===current)queues.delete(key);}}
  return {get,set,withLock};
}
module.exports={createPublisher,createFileJournal,AREAS};
