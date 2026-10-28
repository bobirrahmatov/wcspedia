'use strict';
/* SERVER ONLY. Authentication, session identity, fresh native page operations,
 * CSRF and endpoint routing belong to the trusted HTTP host. This module never
 * trusts a browser-provided actor or native rights. Keep the single policy
 * attachment writable only by this service; Confluence attachment updates have
 * no atomic compare-and-swap. Every service instance must share the durable
 * journal/lock. Receipts are private operational state, not a second policy.
 * Pre-upload entitlements.json once; an uncertain upload is never blindly retried.
 */
const {createHash}=require('node:crypto');
const E=require('./entitlements.js');
const MAX_BYTES=2*1024*1024;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(value).digest('hex');
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const clone=value=>JSON.parse(JSON.stringify(value));
function fail(message,code='ENTITLEMENTS_INVALID'){const error=new Error(message);error.code=code;throw error;}
function pageId(value,label){if(typeof value!=='string'||!(/^[1-9]\d*$/).test(value))fail(label+' must be a positive numeric page ID.');return value;}
function encodePolicy(policy){const bytes=Buffer.from(JSON.stringify(canonical(E.validatePolicy(policy)),null,2)+'\n');if(bytes.length>MAX_BYTES)fail('The entitlement policy exceeds the 2 MB limit.');return bytes;}

function createEntitlementsService(config){
  if(!config||typeof config!=='object')fail('Entitlement service configuration is required.');
  let base;try{base=new URL(config.baseUrl);}catch(_){fail('Configure an absolute HTTPS Confluence base URL.');}
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)fail('Configure an HTTPS Confluence base without embedded credentials.');
  const contextPath=base.pathname.replace(/\/+$/,'');base.pathname=contextPath;
  const rootPageId=pageId(config.rootPageId,'WCSpedia root'),entitlementsPageId=pageId(config.entitlementsPageId,'Entitlement attachment parent');
  const filename=config.filename||'entitlements.json',journal=config.journal,fetcher=config.fetch||globalThis.fetch;
  if(filename!=='entitlements.json')fail('The entitlement attachment must be named entitlements.json.');
  if(typeof fetcher!=='function'||!journal||!['get','set','withLock'].every(key=>typeof journal[key]==='function'))fail('A fetch transport and shared durable locking journal are required.');
  if(config.now!=null&&typeof config.now!=='function')fail('now must be a trusted server clock function.');
  const headers={Accept:'application/json',...(config.headers||{})};
  // Bind the lock to the physical file, including across different root aliases.
  const journalKey='entitlements:'+hash(base.href+'\n'+entitlementsPageId+'\n'+filename);
  async function request(route,init={}){
    const url=new URL(base.href.replace(/\/$/,'')+route);
    if(url.origin!==base.origin||!url.pathname.startsWith(contextPath+'/'))fail('The entitlement request escaped the configured Confluence base.');
    let response;try{response=await fetcher(url.href,{...init,headers:{...headers,...(init.headers||{})},redirect:'error',cache:'no-store'});}catch(cause){const error=new Error('Confluence did not confirm the entitlement request. Retry the same command to reconcile its outcome.');error.code='ENTITLEMENTS_UNCERTAIN';error.cause=cause;throw error;}
    if(!response.ok){await discard(response);const error=new Error(response.status===413?'Confluence rejected the entitlement JSON attachment because its attachment or request size limit was exceeded. The policy is limited to 2 MB; check whether your server or proxy applies a lower limit.':'Confluence entitlement attachment returned HTTP '+response.status+'.');error.code=response.status===413?'ATTACHMENT_TOO_LARGE':'ENTITLEMENTS_HTTP';error.status=response.status;throw error;}
    return response;
  }
  async function discard(response){try{await response.body?.cancel?.();}catch(_){/* Attachment read-back, not this response body, confirms writes. */}}
  async function boundedBytes(response,limit){
    const length=response.headers?.get?.('content-length');
    if(length!=null&&Number(length)>limit){await response.body?.cancel?.();fail('The entitlement response exceeds its size limit.');}
    let bytes;
    if(response.body&&typeof response.body.getReader==='function'){
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('The entitlement response exceeds its size limit.');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
      bytes=Buffer.concat(chunks,size);
    }else{bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>limit)fail('The entitlement response exceeds its size limit.');}
    return bytes;
  }
  function parseJSON(bytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('Confluence returned invalid entitlement JSON.');}}
  async function metadata(){
    const result=parseJSON(await boundedBytes(await request('/rest/api/content/'+entitlementsPageId+'/child/attachment?filename='+encodeURIComponent(filename)+'&expand=version&limit=2'),64*1024));
    if(!Array.isArray(result.results)||result.results.length!==1||result._links?.next)fail('Pre-upload exactly one entitlements.json attachment on the configured page.','ENTITLEMENTS_CONFIGURATION');
    const item=result.results[0];
    if(typeof item.id!=='string'||!(/^[1-9]\d*$/).test(item.id)||item.title!==filename||!Number.isSafeInteger(item.version?.number)||item.version.number<1)fail('Confluence returned an invalid entitlement attachment identity.');
    return {attachmentId:item.id,attachmentVersion:item.version.number};
  }
  async function snapshot(){
    const first=await metadata();
    const bytes=await boundedBytes(await request('/download/attachments/'+entitlementsPageId+'/'+encodeURIComponent(filename)+'?version='+first.attachmentVersion),MAX_BYTES);
    const policy=E.validatePolicy(parseJSON(bytes)),last=await metadata();
    if(last.attachmentId!==first.attachmentId||last.attachmentVersion!==first.attachmentVersion)fail('Entitlements changed during loading. Reload before saving.','CONFLICT');
    return {...first,attachmentDigest:hash(bytes),policy};
  }
  function context(options){
    const identity=options?.identity,native=options?.native;
    if(!identity||!E.normalizeSOEID(identity.soeid)||!native||typeof native!=='object')fail('A trusted authenticated identity and fresh native rights are required.','FORBIDDEN');
    if(!E.nativeHas(native.root,'read')&&!E.nativeHas(native.entitlements,'read'))fail('Your Confluence session cannot read WCSpedia.','FORBIDDEN');
    return {identity:{...identity,soeid:E.normalizeSOEID(identity.soeid)},native};
  }
  function visible(current,ctx){
    const policy=E.effective(current.policy,ctx.identity,'entitlements.view',{native:ctx.native})?current.policy:{...current.policy,records:current.policy.records.filter(row=>row.soeid===ctx.identity.soeid),audit:[]};
    return {...current,policy:clone(policy)};
  }
  function normalizeCommand(command){
    if(!command||typeof command!=='object'||Array.isArray(command))fail('An entitlement command is required.');
    const allowed=['action','record','recordId','expectedRevision','expectedAttachmentVersion','expectedAttachmentId','requestId','comment','rootPageId','entitlementsPageId','entitlementsSource','entitlementsFilename'];
    if(Object.keys(command).some(key=>!allowed.includes(key)))fail('The entitlement command contains unsupported fields.');
    for(const [key,value] of [['rootPageId',rootPageId],['entitlementsPageId',entitlementsPageId],['entitlementsSource','attachment'],['entitlementsFilename',filename]])if(command[key]!=null&&command[key]!==value)fail('The entitlement command targets a different configured policy.','ENTITLEMENTS_CONFIGURATION');
    if(!['add','edit','revoke'].includes(command.action)||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<1||!Number.isSafeInteger(command.expectedAttachmentVersion)||command.expectedAttachmentVersion<1||typeof command.expectedAttachmentId!=='string'||!(/^[1-9]\d*$/).test(command.expectedAttachmentId))fail('A valid action and expected policy revision, attachment ID and version are required.');
    if(typeof command.requestId!=='string'||!(/^[-A-Za-z0-9_:]{1,160}$/).test(command.requestId))fail('A stable request ID is required.');
    if(typeof command.comment!=='string'||!command.comment.trim()||command.comment.length>2000)fail('A change reason of up to 2,000 characters is required.');
    const out={action:command.action,expectedRevision:command.expectedRevision,expectedAttachmentVersion:command.expectedAttachmentVersion,expectedAttachmentId:command.expectedAttachmentId,requestId:command.requestId,comment:command.comment.trim()};
    if(command.action!=='add'){if(typeof command.recordId!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/).test(command.recordId))fail('A valid target record ID is required.');out.recordId=command.recordId;}
    if(command.action!=='revoke')out.record=E.validatePolicy({schemaVersion:1,revision:1,records:[command.record],audit:[]}).records[0];
    return out;
  }
  function authorize(current,command,ctx){if(!E.effective(current.policy,ctx.identity,'entitlements.'+command.action,{native:ctx.native}))fail('You are not entitled to make this change.','FORBIDDEN');}
  function stateValue(state){
    if(state==null)return {schemaVersion:1,pending:null,completed:{}};
    if(state.schemaVersion!==1||!state.completed||typeof state.completed!=='object'||Array.isArray(state.completed))fail('The private entitlement journal needs administrator reconciliation.','ENTITLEMENTS_PENDING');
    return state;
  }
  async function read(options){const ctx=context(options);return visible(await snapshot(),ctx);}
  async function execute(input,options){
    const ctx=context(options),command=normalizeCommand(input);
    const fingerprint=hash(JSON.stringify(canonical({actorSOEID:ctx.identity.soeid,command})));
    return journal.withLock(journalKey,async()=>{
      const state=stateValue(await journal.get(journalKey));
      const previous=own(state.completed,command.requestId)?state.completed[command.requestId]:null;
      if(previous&&previous.fingerprint!==fingerprint)fail('This request ID was already used by another actor or command.','CONFLICT');
      if(state.pending&&(state.pending.requestId!==command.requestId||state.pending.fingerprint!==fingerprint))fail('An earlier entitlement upload must be reconciled before another change.','ENTITLEMENTS_PENDING');
      const current=await snapshot();
      // Fresh rights are required for initial writes, pending reconciliation and
      // completed replay. A receipt must never restore a revoked user's access.
      authorize(current,command,ctx);
      if(previous){
        if(current.attachmentId!==previous.attachmentId||current.attachmentVersion<previous.attachmentVersion||current.policy.revision<previous.policyRevision)fail('The confirmed entitlement attachment was replaced or rolled back.','CONFLICT');
        if(current.attachmentVersion===previous.attachmentVersion&&current.attachmentDigest!==previous.digest)fail('The confirmed entitlement attachment bytes changed.','CONFLICT');
        return visible(current,ctx);
      }
      let pending=state.pending;
      if(pending){
        if(current.attachmentId!==pending.attachmentId)fail('The entitlement attachment was replaced during the pending upload.','CONFLICT');
        if(current.attachmentVersion===command.expectedAttachmentVersion)fail('The previous upload remains uncertain. No duplicate upload was sent; an administrator must reconcile it.','ENTITLEMENTS_PENDING');
        if(current.attachmentVersion!==command.expectedAttachmentVersion+1||current.attachmentDigest!==pending.digest||current.policy.revision!==command.expectedRevision+1)fail('The entitlement attachment diverged from the pending upload. Inspect its version history.','CONFLICT');
      }else{
        if(current.policy.revision!==command.expectedRevision||current.attachmentVersion!==command.expectedAttachmentVersion||current.attachmentId!==command.expectedAttachmentId)fail('Entitlements changed. Reload before saving.','CONFLICT');
        const next=E.applyCommand(current.policy,command,{...ctx,now:config.now?config.now():new Date().toISOString()});
        const bytes=encodePolicy(next);
        pending={requestId:command.requestId,fingerprint,attachmentId:current.attachmentId,expectedVersion:current.attachmentVersion,digest:hash(bytes),policyRevision:next.revision};
        state.pending=pending;await journal.set(journalKey,state);
        const form=new FormData();form.append('file',new Blob([bytes],{type:'application/json'}),filename);form.append('comment','WCSpedia entitlement revision '+next.revision+'; SHA-256 '+pending.digest);form.append('minorEdit','false');
        try{await discard(await request('/rest/api/content/'+entitlementsPageId+'/child/attachment/'+current.attachmentId+'/data',{method:'POST',headers:{'X-Atlassian-Token':'nocheck'},body:form}));}
        catch(error){if(error.status===413){state.pending=null;await journal.set(journalKey,state);}throw error;}
      }
      const confirmed=await snapshot();
      if(confirmed.attachmentId!==pending.attachmentId||confirmed.attachmentVersion!==pending.expectedVersion+1||confirmed.attachmentDigest!==pending.digest||confirmed.policy.revision!==pending.policyRevision)fail('The entitlement upload was not confirmed at its expected attachment version.','CONFLICT');
      const receipt={fingerprint,attachmentId:confirmed.attachmentId,attachmentVersion:confirmed.attachmentVersion,digest:confirmed.attachmentDigest,policyRevision:confirmed.policy.revision};
      Object.defineProperty(state.completed,command.requestId,{value:receipt,writable:true,enumerable:true,configurable:true});state.pending=null;await journal.set(journalKey,state);
      return visible(confirmed,ctx);
    });
  }
  // Trusted workflow authorization calls this directly. Do not expose it as an
  // unauthenticated HTTP handler: unlike read(), it deliberately returns all rows.
  const loadPolicy=async()=>clone((await snapshot()).policy);
  return Object.freeze({read,execute,loadPolicy,maxBytes:MAX_BYTES});
}
module.exports={createEntitlementsService};
