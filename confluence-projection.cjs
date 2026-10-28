'use strict';
/* SERVER ONLY. This writer updates the approved reader projection, never the
 * authoring/audit store. Confluence's attachment API has no atomic CAS. All
 * writers must share this protected journal/lock; restrict native attachment
 * writes to this service. Stop for reconciliation when an upload is uncertain.
 * A pre-created empty wcspedia-published.json is required on the reader root. */
const {createHash}=require('node:crypto');
const C=require('./confluence.js');
const MAX_ATTACHMENT_BYTES=10000000; // UTF-8 file bytes, excluding multipart framing.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function fail(message,code='PROJECTION_INVALID'){const error=new Error(message);error.code=code;throw error;}
function fields(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(label+' contains unsupported or private fields.');}
function validateProjection(data,options={}){
  let missingMapping=false;
  C.validateData(data);
  fields(data,['schemaVersion','isDemo','asOf','sampleNotice','people','areas','documents','types','taxonomyRevision','taxonomyAudit'],'Reader projection');
  if(data.isDemo===true)fail('Illustrative data cannot be published to the production reader projection.');
  if(data.types!=null&&(!Array.isArray(data.types)||data.types.some(v=>typeof v!=='string')))fail('Content types must be plain text labels.');
  for(const key of ['asOf','sampleNotice'])if(data[key]!=null&&typeof data[key]!=='string')fail('Reader projection metadata must be plain text.');
  if((data.taxonomyAudit||[]).length)fail('The reader projection cannot include taxonomy audit evidence.');
  for(const person of data.people){fields(person,['id','name','role','initials','isSample','soeid','confluence'],'Directory person');for(const key of ['initials','soeid'])if(person[key]!=null&&typeof person[key]!=='string')fail('Directory labels must be plain text.');if(person.isSample!=null&&typeof person.isSample!=='boolean')fail('Invalid sample marker.');if(person.confluence){fields(person.confluence,['username','userKey','accountId'],'Confluence identity');if(Object.values(person.confluence).some(value=>typeof value!=='string'))fail('Confluence identity fields must be plain text.');}}
  for(const area of data.areas){fields(area,['id','title','description','icon'],'Business area');for(const key of ['description','icon'])if(area[key]!=null&&typeof area[key]!=='string')fail('Business area labels must be plain text.');}
  for(const doc of data.documents){
    fields(doc,['id','reference','area','type','ownerId','authorId','reviewerId','approverId','publishedVersion','versions','audit','confluencePageId','confluencePageVersion'],'Reader document');
    if(doc.audit.length||doc.versions.length!==1||doc.versions[0].status!=='Published'||doc.publishedVersion!==doc.versions[0].version)fail('Reader documents must contain only one current approved version and no audit evidence.');
    if(doc.id===options.pendingDocumentKey&&doc.confluencePageId==null&&doc.confluencePageVersion==null)missingMapping=true;
    else if(typeof doc.confluencePageId!=='string'||!/^\d*[1-9]\d*$/.test(doc.confluencePageId)||doc.confluencePageId.startsWith('0')||!Number.isSafeInteger(doc.confluencePageVersion)||doc.confluencePageVersion<1)fail('A confirmed native reader page ID and version are required.');
    const v=doc.versions[0];
    fields(v,['version','revision','status','title','summary','sections','createdAt','createdBy','contributorIds','changeSummary','reviewedBy','reviewedAt','reviewedRevision','approvedBy','approvedAt','effectiveAt','nextReviewAt','bodyMarkdown','slug','highlights','cover','tags','processes','regions','assets','attachments','governance','sourceMetadata','sourceImportedAt','commentsEnabled'],'Approved version');
    if(own(v,'commentsEnabled')&&typeof v.commentsEnabled!=='boolean')fail('commentsEnabled must be true or false.');
    for(const key of ['createdAt','createdBy','changeSummary','reviewedBy','reviewedAt','approvedBy','approvedAt','effectiveAt','nextReviewAt'])if(v[key]!=null&&typeof v[key]!=='string')fail('Approved version metadata must be plain text.');
    if(v.contributorIds!=null&&(!Array.isArray(v.contributorIds)||v.contributorIds.some(id=>typeof id!=='string'||!data.people.some(p=>p.id===id))))fail('Document contributors must be known people.');
    if(v.reviewedBy!==doc.reviewerId||v.approvedBy!==doc.approverId||v.reviewedRevision!==v.revision||!Number.isFinite(Date.parse(v.reviewedAt))||!Number.isFinite(Date.parse(v.approvedAt))||Date.parse(v.reviewedAt)>Date.parse(v.approvedAt)||data.people.find(p=>p.id===v.approvedBy)?.role!=='Manager')fail('The reader snapshot must retain exact-revision review and manager approval metadata.');
    if([doc.authorId,v.createdBy,...(v.contributorIds||[])].some(id=>id===v.reviewedBy||id===v.approvedBy))fail('A contributor cannot approve or review the reader snapshot.');
    for(const section of v.sections)fields(section,['id','title','paragraphs','bullets'],'Document section');
    if(v.cover)fields(v.cover,['src','alt','caption'],'Cover image');
    for(const asset of v.assets||[])fields(asset,['id','src','alt'],'Inline image');
    for(const attachment of v.attachments||[])fields(attachment,['id','name','url','mimeType','size'],'Attachment');
  }
  const bytes=Buffer.from(JSON.stringify(canonical(data),null,2)+'\n','utf8');
  if(bytes.length+(missingMapping?256:0)>MAX_ATTACHMENT_BYTES)fail('The reader projection exceeds the 10 MB (10,000,000 byte) Confluence attachment limit. Archive old projection data or move the read model to a paginated service.','ATTACHMENT_TOO_LARGE');
  return bytes;
}
function createProjectionWriter(config){
  if(!config||typeof config!=='object')fail('Projection writer configuration is required.');
  const base=new URL(config.baseUrl),root=config.rootPageId,filename=config.filename||'wcspedia-published.json',journal=config.journal,fetcher=config.fetch||globalThis.fetch;
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)fail('Configure an HTTPS Confluence base without embedded credentials.');
  base.pathname=base.pathname.replace(/\/$/,'');
  if(typeof root!=='string'||!/^\d*[1-9]\d*$/.test(root)||root[0]==='0'||!/^[-A-Za-z0-9._]+\.json$/.test(filename)||filename.length>160)fail('Configure a numeric root and safe JSON attachment filename.');
  if(typeof fetcher!=='function'||!journal||!['get','set','withLock'].every(name=>typeof journal[name]==='function'))fail('A fetch transport and durable locking journal are required.');
  const stateKey='projection:'+root+':'+filename+':'+digest(base.href),headers={Accept:'application/json',...(config.headers||{})};
  async function request(route,init={},responseType='json'){
    const url=new URL(base.href.replace(/\/$/,'')+route);
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname+'/'))fail('The projection request escaped the configured Confluence base.');
    let response;try{response=await fetcher(url.href,{...init,headers:{...headers,...(init.headers||{})},redirect:'error'});}catch(error){const e=new Error('The reader projection request outcome is uncertain. Retry the same request to reconcile it.');e.code='PROJECTION_UNCERTAIN';e.cause=error;throw e;}
    if(!response.ok){const error=new Error(response.status===413?'Confluence rejected the reader JSON attachment because its attachment or request size limit was exceeded (maximum 10 MB per attachment). Reduce the projection; the server or proxy may impose a lower limit.':'Confluence reader attachment returned HTTP '+response.status+'.');error.code=response.status===413?'ATTACHMENT_TOO_LARGE':'PROJECTION_HTTP';error.status=response.status;try{await response.body?.cancel?.();}catch(_){}throw error;}
    if(responseType==='none')return null;
    if(responseType==='bytes'){
      const oversized=()=>fail('The reader JSON attachment exceeds the 10 MB (10,000,000 byte) limit.','ATTACHMENT_TOO_LARGE');
      const length=response.headers?.get?.('content-length');
      if(length!=null&&Number(length)>MAX_ATTACHMENT_BYTES){await response.body?.cancel?.();oversized();}
      if(response.body&&typeof response.body.getReader==='function'){
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_ATTACHMENT_BYTES){await reader.cancel();oversized();}chunks.push(Buffer.from(part.value));}}finally{reader.releaseLock();}
        return Buffer.concat(chunks,size);
      }
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>MAX_ATTACHMENT_BYTES)oversized();return bytes;
    }
    try{return await response.json();}catch(error){fail('Confluence returned an invalid projection confirmation.','PROJECTION_UNCERTAIN');}
  }
  async function metadata(){
    const result=await request('/rest/api/content/'+root+'/child/attachment?filename='+encodeURIComponent(filename)+'&expand=version&limit=2');
    if(!Array.isArray(result.results)||result.results.length!==1||result._links?.next)fail('Pre-upload exactly one empty reader JSON attachment on the configured root.','PROJECTION_CONFIGURATION');
    const item=result.results[0];
    if(typeof item.id!=='string'||!/^\d*[1-9]\d*$/.test(item.id)||item.title!==filename||!Number.isSafeInteger(item.version?.number)||item.version.number<1)fail('Confluence returned an invalid reader attachment identity.');
    return {id:item.id,version:item.version.number};
  }
  const bytesAt=version=>request('/download/attachments/'+root+'/'+encodeURIComponent(filename)+'?version='+version,{},'bytes');
  const writeProjection=async function({data,expectedAttachmentVersion,requestId}){
    const bytes=validateProjection(data),hash=digest(bytes);
    if(!Number.isSafeInteger(expectedAttachmentVersion)||expectedAttachmentVersion<1||typeof requestId!=='string'||!requestId.trim()||requestId.length>160)fail('An expected attachment version and stable request ID are required.');
    return journal.withLock(stateKey,async()=>{
      const state=await journal.get(stateKey)||{schemaVersion:1,pending:null,completed:{}};
      const previous=own(state.completed,requestId)?state.completed[requestId]:null;
      if(previous&&(previous.digest!==hash||previous.expectedVersion!==expectedAttachmentVersion))fail('This projection request ID was already used for different bytes or a different version.','PROJECTION_CONFLICT');
      if(state.pending&&(state.pending.requestId!==requestId||state.pending.digest!==hash||state.pending.expectedVersion!==expectedAttachmentVersion))fail('An earlier reader projection requires reconciliation before another write.','PUBLICATION_PENDING');
      const current=await metadata();
      if(previous){
        if(current.id!==previous.attachmentId||current.version!==previous.attachmentVersion||digest(await bytesAt(previous.attachmentVersion))!==hash)fail('The reader attachment changed after this confirmed projection.','PROJECTION_CONFLICT');
        const final=await metadata();if(final.id!==current.id||final.version!==current.version)fail('The reader attachment changed during verification.','PROJECTION_CONFLICT');
        return {attachmentVersion:previous.attachmentVersion};
      }
      if(state.pending){
        if(current.id!==state.pending.attachmentId)fail('The reader attachment identity changed during publication.','PROJECTION_CONFLICT');
        if(current.version===expectedAttachmentVersion)fail('The prior upload remains uncertain. No duplicate upload was sent; an administrator must reconcile it before continuing.','PUBLICATION_PENDING');
        if(current.version!==expectedAttachmentVersion+1||digest(await bytesAt(current.version))!==hash)fail('The reader attachment diverged from the pending publication. Inspect its version history.','PROJECTION_CONFLICT');
      }else{
        if(current.version!==expectedAttachmentVersion)fail('The reader attachment changed. Refresh before publishing.','PROJECTION_CONFLICT');
        state.pending={requestId,digest:hash,expectedVersion:expectedAttachmentVersion,attachmentId:current.id};
        await journal.set(stateKey,state);
        const form=new FormData();form.append('file',new Blob([bytes],{type:'application/json'}),filename);form.append('comment','WCSpedia approved reader projection; SHA-256 '+hash);form.append('minorEdit','false');
        try{await request('/rest/api/content/'+root+'/child/attachment/'+current.id+'/data',{method:'POST',headers:{'X-Atlassian-Token':'nocheck'},body:form},'none');}
        catch(error){
          // A definite HTTP 413 rejected the upload. It is not an uncertain write
          // and must not leave a permanent pending intent blocking smaller data.
          if(error.status===413){state.pending=null;await journal.set(stateKey,state);}
          throw error;
        }
        const confirmed=await metadata();
        if(confirmed.id!==current.id||confirmed.version!==expectedAttachmentVersion+1||digest(await bytesAt(confirmed.version))!==hash)fail('The reader projection was not confirmed at the expected native attachment version.','PROJECTION_CONFLICT');
      }
      const final=await metadata();if(final.id!==current.id||final.version!==expectedAttachmentVersion+1)fail('The reader attachment changed during verification.','PROJECTION_CONFLICT');
      const receipt={attachmentId:current.id,attachmentVersion:expectedAttachmentVersion+1,expectedVersion:expectedAttachmentVersion,digest:hash};
      Object.defineProperty(state.completed,requestId,{value:receipt,writable:true,enumerable:true,configurable:true});state.pending=null;await journal.set(stateKey,state);
      return {attachmentVersion:receipt.attachmentVersion};
    });
  };
  writeProjection.validate=data=>validateProjection(data);
  writeProjection.preflight=(data,options={})=>validateProjection(data,{pendingDocumentKey:options.pendingDocumentKey});
  writeProjection.maxBytes=MAX_ATTACHMENT_BYTES;
  return Object.freeze(writeProjection);
}
module.exports={createProjectionWriter,validateProjection:data=>validateProjection(data)};
