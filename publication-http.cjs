'use strict';
/* SERVER ONLY. Mount before body-parsing middleware, behind the trusted host's
 * Confluence authentication. This adapter does not implement SSO, native ACLs,
 * a workspace policy, or a public route to service.snapshot(). */
const C=require('./confluence.js'),E=require('./entitlements.js');
const MAX_BODY_BYTES=10000000;
const ACTIONS=new Set(['create','edit','revise','submit','request-changes','complete-review','approve','delete']);
const COMMAND_FIELDS=new Set(['rootPageId','action','requestId','comment','expectedAttachmentVersion','expectedEntitlementRevision','fields','docId','expectedVersion','expectedRevision','expectedAuditLength','documentKey','confluencePageId','expectedPageVersion','changes','governanceReview','nextReviewAt','nativePublication']);
const ERRORS={
  HTTP_INPUT:[400,'The workflow request is invalid.'],
  HTTP_ORIGIN:[403,'The request origin could not be verified.'],
  HTTP_AUTH:[401,'Sign in to use your WCSpedia workspace.'],
  HTTP_MEDIA:[415,'Send UTF-8 JSON without content encoding.'],
  HTTP_SIZE:[413,'The workflow request exceeds its configured size limit.'],
  HTTP_TIMEOUT:[408,'The request body was not received in time.'],
  VALIDATION:[400,'The document change is invalid. Check the required fields.'],
  INVALID_DATA:[400,'The document change contains invalid data.'],
  FORBIDDEN:[403,'Your current permissions do not allow this action.'],
  NOT_FOUND:[404,'The requested document is unavailable.'],
  CONFLICT:[409,'The document, entitlement policy or library changed. Reload before continuing.'],
  CONFLUENCE_CONFLICT:[409,'The native Confluence page changed. Reload before continuing.'],
  PROJECTION_CONFLICT:[409,'The reader attachment changed. An administrator must reconcile its version.'],
  SOURCE_ALREADY_IMPORTED:[409,'This source document was already imported. Open it to make changes.'],
  ATTACHMENT_TOO_LARGE:[413,'A document attachment or reader JSON exceeds the 10 MB Confluence limit.'],
  PUBLICATION_PENDING:[409,'An earlier publication needs recovery. Retry its original request ID.'],
  CONFLUENCE_UNCERTAIN:[503,'Publication is not confirmed. Preserve and retry the original request ID.'],
  PROJECTION_UNCERTAIN:[503,'Reader publication is not confirmed. Preserve and retry the original request ID.'],
  PROJECTION_UNCONFIRMED:[503,'Reader publication is not confirmed. Preserve and retry the original request ID.']
};
function fail(code){const error=new Error(code);error.code=code;throw error;}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function readBody(req,maxBytes,timeoutMs){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    const cleanup=()=>{clearTimeout(timer);req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',error);req.removeListener('aborted',aborted);};
    const error=cause=>{cleanup();req.pause();reject(cause);};
    const rejectCode=code=>{const cause=new Error(code);cause.code=code;error(cause);};
    const data=chunk=>{if(!Buffer.isBuffer(chunk)){rejectCode('HTTP_MEDIA');return;}size+=chunk.length;if(size>maxBytes){rejectCode('HTTP_SIZE');return;}chunks.push(chunk);};
    const end=()=>{cleanup();resolve(Buffer.concat(chunks,size));};
    const aborted=()=>rejectCode('HTTP_INPUT');
    const timer=setTimeout(()=>rejectCode('HTTP_TIMEOUT'),timeoutMs);timer.unref?.();
    req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',aborted);
    if(req.aborted||req.destroyed)aborted();
  });
}
function createPublicationHandler(options){
  const {service,authenticate,loadWorkspace,loadCapabilities,origin,rootPageId,workflowPath,workspacePath}=options||{};
  const maxBodyBytes=options?.maxBodyBytes??MAX_BODY_BYTES,requestTimeoutMs=options?.requestTimeoutMs??30000;
  let base;try{base=new URL(origin);}catch(_){throw Error('Configure an exact HTTPS Confluence origin.');}
  const validPath=value=>typeof value==='string'&&/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(value);
  if(base.protocol!=='https:'||base.origin!==origin||base.username||base.password||!(/^[1-9]\d*$/).test(rootPageId||'')||!validPath(workflowPath)||!validPath(workspacePath)||workflowPath===workspacePath||typeof authenticate!=='function'||typeof loadWorkspace!=='function'||typeof loadCapabilities!=='function'||typeof service?.execute!=='function'||!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>MAX_BODY_BYTES||!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>120000)throw Error('Configure distinct same-origin routes, numeric root, trusted authentication/workspace/capability adapters, workflow service and bounded request limits.');
  function json(res,status,value){
    if(res.destroyed||res.writableEnded)return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'});
    res.end(JSON.stringify(value));
  }
  return async function handle(req,res){
    let url;try{url=new URL(req.url,origin);}catch(_){return false;}
    if(url.pathname!==workflowPath&&url.pathname!==workspacePath)return false;
    try{
      const rawPath=String(req.url).split('?')[0];
      if(url.origin!==origin||rawPath!==url.pathname||url.hash)fail('HTTP_INPUT');
      const workspace=url.pathname===workspacePath,method=workspace?'GET':'POST';
      if(req.method!==method){res.setHeader('Allow',method);json(res,405,{code:'METHOD_NOT_ALLOWED',message:'Use '+method+' for this route.'});return true;}
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==origin))fail('HTTP_ORIGIN');
      if(!workspace){
        let requestOrigin=req.headers.origin;
        if(!requestOrigin&&req.headers.referer){try{requestOrigin=new URL(req.headers.referer).origin;}catch(_){}}
        if(requestOrigin!==origin||req.headers['x-requested-with']!=='XMLHttpRequest')fail('HTTP_ORIGIN');
        if(!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(req.headers['content-type']||'')||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))fail('HTTP_MEDIA');
        if(url.search)fail('HTTP_INPUT');
        const length=req.headers['content-length'];
        if(length!=null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))fail('HTTP_INPUT');
        if(Number(length)>maxBodyBytes)fail('HTTP_SIZE');
      }else{
        const keys=[...url.searchParams.keys()];
        if(new Set(keys).size!==keys.length||keys.some(key=>!['rootPageId','capabilitiesOnly'].includes(key))||url.searchParams.get('rootPageId')!==rootPageId||(url.searchParams.has('capabilitiesOnly')&&url.searchParams.get('capabilitiesOnly')!=='true'))fail('HTTP_INPUT');
      }
      const session=await authenticate(req);
      if(!session)fail('HTTP_AUTH');
      if(workspace){
        if(url.searchParams.has('capabilitiesOnly')){
          // This is an independently authorized lightweight proof, not a claim
          // supplied by the browser or permissions of the publishing account.
          const result=await loadCapabilities(session,{rootPageId});
          if(!object(result)||result.rootPageId!==rootPageId||!object(result.identity)||!E.normalizeSOEID(result.identity.soeid)||typeof result.canCreateDocument!=='boolean')throw Error('Invalid trusted capability response.');
          const identity={soeid:E.normalizeSOEID(result.identity.soeid)};
          for(const key of ['userKey','accountId'])if(result.identity[key]!=null){if(typeof result.identity[key]!=='string'||!result.identity[key].trim())throw Error('Invalid trusted capability identity.');identity[key]=result.identity[key];}
          json(res,200,{rootPageId,identity,canCreateDocument:result.canCreateDocument});return true;
        }
        // Only the host can filter documents, directory entries and audit data
        // using fresh native read rights and this caller's assignments/grants.
        const result=await loadWorkspace(session,{rootPageId});
        if(!object(result)||!Number.isSafeInteger(result.attachmentVersion)||result.attachmentVersion<1)throw Error('Invalid trusted workspace response.');
        let data;try{data=C.validateData(result.data);}catch(_){throw Error('Invalid trusted workspace response.');}
        json(res,200,{data,attachmentVersion:result.attachmentVersion});return true;
      }
      const bytes=await readBody(req,maxBodyBytes,requestTimeoutMs);
      let command;try{command=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('HTTP_INPUT');}
      if(!object(command)||Object.keys(command).some(key=>!COMMAND_FIELDS.has(key))||command.rootPageId!==rootPageId||!ACTIONS.has(command.action)||typeof command.requestId!=='string'||!/^[-A-Za-z0-9_:]{1,160}$/.test(command.requestId)||req.headers['idempotency-key']!==command.requestId)fail('HTTP_INPUT');
      // A disconnect after this point must not cancel a durable publication.
      // The original request ID is how the host/client recovers an unknown result.
      json(res,200,await service.execute(command,session));return true;
    }catch(error){
      // Do not echo arbitrary upstream messages, URLs, credentials or HTML.
      const known=Object.hasOwn(ERRORS,error?.code),[status,message]=known?ERRORS[error.code]:[503,'The publication service is unavailable. Preserve the request ID and contact your administrator.'];
      if(!req.complete)res.setHeader('Connection','close');
      json(res,status,{code:known?error.code:'PUBLICATION_SERVICE',message});return true;
    }
  };
}
module.exports=Object.freeze({createPublicationHandler,MAX_BODY_BYTES});
