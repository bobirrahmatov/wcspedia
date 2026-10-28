/* Optional same-origin Node routing adapter. Authentication is supplied by the
 * host's trusted Confluence middleware. This file does not deploy a service. */
'use strict';
function createArticleFeedbackHandler({service,authenticate,origin,pathname}){
  const base=new URL(origin);
  if(!['http:','https:'].includes(base.protocol)||base.origin!==origin||base.username||base.password||typeof pathname!=='string'||!pathname.startsWith('/')||pathname.includes('?')||pathname.includes('#')||typeof authenticate!=='function'||!service||!['read','vote','analytics'].every(k=>typeof service[k]==='function'))throw Error('Configure a same-origin route, trusted authentication middleware and feedback service.');
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'});res.end(JSON.stringify(value));};
  return async function handle(req,res,url){
    url=url||new URL(req.url,origin);
    if(url.pathname!==pathname)return false;
    try{
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');json(res,405,{code:'METHOD_NOT_ALLOWED',message:'Use GET or POST.'});return true;}
      if(req.method==='POST'){
        let requestOrigin=req.headers.origin;
        if(!requestOrigin&&req.headers.referer){try{requestOrigin=new URL(req.headers.referer).origin;}catch(_){}}
        if(requestOrigin!==origin||req.headers['x-requested-with']!=='XMLHttpRequest'||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){json(res,403,{code:'FEEDBACK_FORBIDDEN',message:'The feedback request origin could not be verified.'});return true;}
      }
      const context=await authenticate(req);
      if(!context){json(res,401,{code:'FEEDBACK_UNAUTHENTICATED',message:'Sign in to use article feedback.'});return true;}
      if(req.method==='GET'){
        const keys=[...url.searchParams.keys()];
        if(new Set(keys).size!==keys.length||keys.some(k=>!['rootPageId','pageId','format'].includes(k))||(url.searchParams.has('format')&&url.searchParams.get('format')!=='analytics')){json(res,400,{code:'FEEDBACK_INPUT',message:'Invalid feedback query.'});return true;}
        const input={rootPageId:url.searchParams.get('rootPageId'),pageId:url.searchParams.get('pageId')};
        const result=url.searchParams.get('format')==='analytics'?await service.analytics(input,context):await service.read(input,context);
        if(url.searchParams.get('format')==='analytics')res.setHeader('Content-Disposition','attachment; filename="wcspedia-feedback-'+input.pageId+'.json"');
        json(res,200,result);return true;
      }
      if(url.search){json(res,400,{code:'FEEDBACK_INPUT',message:'POST feedback fields in the JSON body.'});return true;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192){json(res,413,{code:'FEEDBACK_INPUT',message:'Feedback request is too large.'});return true;}chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){json(res,400,{code:'FEEDBACK_INPUT',message:'Invalid feedback JSON.'});return true;}
      if(!input||typeof input.requestId!=='string'||req.headers['idempotency-key']!==input.requestId){json(res,400,{code:'FEEDBACK_INPUT',message:'The Idempotency-Key must match the request ID.'});return true;}
      json(res,200,await service.vote(input,context));return true;
    }catch(e){
      const status={FEEDBACK_INPUT:400,FEEDBACK_FORBIDDEN:403,FEEDBACK_CONFLICT:409,FEEDBACK_BUSY:503,FEEDBACK_CAPACITY:503}[e.code]||503;
      const safe=['FEEDBACK_INPUT','FEEDBACK_FORBIDDEN','FEEDBACK_CONFLICT','FEEDBACK_BUSY','FEEDBACK_CAPACITY'].includes(e.code);
      json(res,status,{code:safe?e.code:'FEEDBACK_SERVICE',message:safe?e.message:'Article feedback is temporarily unavailable.'});return true;
    }
  };
}
module.exports=Object.freeze({createArticleFeedbackHandler});
