'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createPublicationHandler,MAX_BODY_BYTES}=require('./publication-http.cjs');
const origin='https://confluence.test',rootPageId='100';
const workflowPath='/confluence/rest/wcspedia/1/workflow',workspacePath='/confluence/rest/wcspedia/1/workspace';
const command=()=>({rootPageId,action:'create',requestId:'request-001',comment:'Create a reviewed document.',expectedAttachmentVersion:1,expectedEntitlementRevision:1,fields:{id:'new-document'}});
const data=()=>({schemaVersion:1,people:[{id:'author',name:'An author',role:'Author',soeid:'AA12345'}],areas:[],documents:[]});
async function fixture(t,extra={}){
  const calls=[],session=Object.freeze({verifiedSession:'server-only'});
  const options={origin,rootPageId,workflowPath,workspacePath,authenticate:async req=>req.headers.cookie==='session=valid'?session:null,loadWorkspace:async(auth,input)=>{calls.push({workspace:input,session:auth});return {data:data(),attachmentVersion:7,pendingRequestId:'private-journal-id'};},loadCapabilities:async(auth,input)=>{calls.push({capabilities:input,session:auth});return {rootPageId,identity:{soeid:'aa12345',userKey:'trusted-user-key'},canCreateDocument:true};},service:{execute:async(input,auth)=>{calls.push({command:input,session:auth});return {accepted:true,requestId:input.requestId,attachmentVersion:8};}},...extra};
  const handler=createPublicationHandler(options);
  const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  async function request({path=workflowPath,method='POST',headers={},body=JSON.stringify(command()),chunks,holdOpen=false}={}){
    const sentHeaders={Cookie:'session=valid',...(method==='POST'?{Origin:origin,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','Idempotency-Key':'request-001'}:{}),...headers};
    for(const key of Object.keys(sentHeaders))if(sentHeaders[key]==null)delete sentHeaders[key];
    return new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:sentHeaders},res=>{
        const received=[];res.on('data',chunk=>received.push(chunk));res.on('end',()=>{const raw=Buffer.concat(received).toString('utf8');resolve({status:res.statusCode,headers:res.headers,body:raw?JSON.parse(raw):null});req.destroy();});
      });
      req.on('error',reject);
      for(const chunk of chunks||[body])if(chunk!=null)req.write(chunk);
      if(!holdOpen)req.end();
    });
  }
  return {request,calls,session,options};
}
test('POST routes a command with only the authenticated session, and GET returns only a filtered workspace envelope',async t=>{
  const f=await fixture(t);
  const saved=await f.request();assert.equal(saved.status,200);assert.equal(saved.body.accepted,true);
  assert.strictEqual(f.calls[0].session,f.session);assert.deepEqual(f.calls[0].command,command());
  const workspace=await f.request({method:'GET',path:workspacePath+'?rootPageId=100',body:null});
  assert.equal(workspace.status,200);assert.deepEqual(workspace.body,{data:data(),attachmentVersion:7});
  assert.strictEqual(f.calls[1].session,f.session);assert.deepEqual(f.calls[1].workspace,{rootPageId});
  for(const result of [saved,workspace]){assert.equal(result.headers['cache-control'],'private, no-store');assert.equal(result.headers['x-content-type-options'],'nosniff');assert.equal(result.headers.vary,'Cookie');assert.equal(result.headers['access-control-allow-origin'],undefined);}
});
test('both endpoints require trusted authentication, including an empty reader directory bootstrap',async t=>{
  const f=await fixture(t,{loadWorkspace:async()=>({data:{schemaVersion:1,people:[],areas:[],documents:[]},attachmentVersion:1})});
  for(const method of ['POST','GET']){const result=await f.request({method,path:method==='POST'?workflowPath:workspacePath+'?rootPageId=100',headers:{Cookie:null},body:method==='GET'?null:undefined});assert.equal(result.status,401);}
  assert.equal(f.calls.length,0);
  assert.equal((await f.request({method:'GET',path:workspacePath+'?rootPageId=100',body:null})).status,200);
});
test('capability checks use the authenticated caller without loading the full workspace',async t=>{
  const f=await fixture(t);
  const result=await f.request({method:'GET',path:workspacePath+'?rootPageId=100&capabilitiesOnly=true',body:null});
  assert.equal(result.status,200);assert.deepEqual(result.body,{rootPageId,identity:{soeid:'AA12345',userKey:'trusted-user-key'},canCreateDocument:true});
  assert.equal(f.calls.length,1);assert.strictEqual(f.calls[0].session,f.session);assert.deepEqual(f.calls[0].capabilities,{rootPageId});
  const denied=await fixture(t,{loadCapabilities:async()=>({rootPageId,identity:{soeid:'AA12345'},canCreateDocument:false,privatePolicy:'never exposed'})});
  assert.deepEqual((await denied.request({method:'GET',path:workspacePath+'?capabilitiesOnly=true&rootPageId=100',body:null})).body,{rootPageId,identity:{soeid:'AA12345'},canCreateDocument:false});
});
test('malformed, mismatched, missing and string-true capability proofs fail closed',async t=>{
  for(const result of [null,{rootPageId:'999',identity:{soeid:'AA12345'},canCreateDocument:true},{rootPageId,identity:{soeid:'AA12345'},canCreateDocument:'true'},{rootPageId,identity:{soeid:'AA12345',userKey:123},canCreateDocument:true},{rootPageId,identity:{},canCreateDocument:true}]){
    const f=await fixture(t,{loadCapabilities:async()=>result});assert.equal((await f.request({method:'GET',path:workspacePath+'?rootPageId=100&capabilitiesOnly=true',body:null})).status,503);
  }
  const f=await fixture(t);
  for(const suffix of ['&capabilitiesOnly=false','&capabilitiesOnly=true&capabilitiesOnly=true','&capabilitiesOnly=true&soeid=ADMIN'])assert.equal((await f.request({method:'GET',path:workspacePath+'?rootPageId=100'+suffix,body:null})).status,400);
  assert.equal((await f.request({method:'GET',path:workspacePath+'?rootPageId=100&capabilitiesOnly=true',headers:{Cookie:null},body:null})).status,401);assert.equal(f.calls.length,0);
});
test('cross-origin mutations, cross-site reads, non-JSON and compressed bodies are rejected before executing',async t=>{
  const f=await fixture(t);
  for(const headers of [{Origin:'https://other.test'},{Origin:null},{'X-Requested-With':null},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.request({headers})).status,403);
  assert.equal((await f.request({method:'GET',path:workspacePath+'?rootPageId=100',headers:{Origin:'https://other.test'},body:null})).status,403);
  for(const headers of [{'Content-Type':'text/plain'},{'Content-Type':'application/json; charset=latin1'},{'Content-Encoding':'gzip'}])assert.equal((await f.request({headers})).status,415);
  assert.equal(f.calls.length,0);
  assert.equal((await f.request({headers:{Origin:null,Referer:origin+'/confluence/pages/viewpage.action?pageId=100','Content-Type':'application/json; charset=UTF-8'}})).status,200);
});
test('routes reject query aliases, other roots, duplicate roots, unsupported methods and normalized path aliases',async t=>{
  const f=await fixture(t);
  for(const path of [workspacePath,workspacePath+'?rootPageId=999',workspacePath+'?rootPageId=100&rootPageId=100',workspacePath+'?rootPageId=100&actor=admin'])assert.equal((await f.request({method:'GET',path,body:null})).status,400);
  assert.equal((await f.request({path:workflowPath+'?rootPageId=100'})).status,400);
  assert.equal((await f.request({body:JSON.stringify({...command(),rootPageId:'999'})})).status,400);
  for(const [path,method,allow] of [[workspacePath,'POST','GET'],[workflowPath,'GET','POST'],[workflowPath,'OPTIONS','POST']]){const r=await f.request({path,method,body:null});assert.equal(r.status,405);assert.equal(r.headers.allow,allow);}
  assert.equal((await f.request({path:'/confluence/rest/wcspedia/1/alias/../workflow'})).status,400);
  assert.equal((await f.request({path:'/confluence/rest/wcspedia/1/snapshot',body:null})).status,404);
  assert.equal(f.calls.length,0);
});
test('browser supplied identity, permission context, parent mappings and unsupported commands cannot enter the service',async t=>{
  const f=await fixture(t);
  for(const injected of [{actorId:'administrator'},{session:{user:'admin'}},{nativeAccess:{root:true}},{permissionContext:{create:true}},{parentPageId:'999'},{action:'add-category'}])assert.equal((await f.request({body:JSON.stringify({...command(),...injected})})).status,400);
  assert.equal(f.calls.length,0);
});
test('idempotency header must match a bounded safe request ID',async t=>{
  const f=await fixture(t);
  for(const headers of [{'Idempotency-Key':null},{'Idempotency-Key':'different'}])assert.equal((await f.request({headers})).status,400);
  for(const requestId of ['', 'x'.repeat(161),'request with spaces'])assert.equal((await f.request({body:JSON.stringify({...command(),requestId}),headers:{'Idempotency-Key':requestId||'empty'}})).status,400);
  assert.equal(f.calls.length,0);
});
test('invalid JSON and malformed UTF-8 cannot mutate a document',async t=>{
  const f=await fixture(t);
  for(const body of ['{','null','[]',Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d])])assert.equal((await f.request({body})).status,400);
  assert.equal(f.calls.length,0);
});
test('byte limits apply both to declared length and multibyte chunked request bodies',async t=>{
  const body=Buffer.from(JSON.stringify({...command(),comment:'界'.repeat(50)}));
  const f=await fixture(t,{maxBodyBytes:body.length-1});
  assert.equal((await f.request({body,headers:{'Content-Length':String(body.length)}})).status,413);
  assert.equal((await f.request({chunks:[body.subarray(0,80),body.subarray(80)]})).status,413);
  assert.equal(f.calls.length,0);
  const exact=await fixture(t,{maxBodyBytes:body.length});assert.equal((await exact.request({body})).status,200);
});
test('incomplete request bodies time out before execution',async t=>{
  const f=await fixture(t,{requestTimeoutMs:25});
  const result=await f.request({chunks:['{'],holdOpen:true});assert.equal(result.status,408);assert.equal(f.calls.length,0);
});
test('trusted workspace callback must return a valid filtered snapshot and positive version',async t=>{
  for(const result of [{data:data(),attachmentVersion:0},{data:{people:[],documents:[{}],areas:[]},attachmentVersion:1},null]){
    const f=await fixture(t,{loadWorkspace:async()=>result});const response=await f.request({method:'GET',path:workspacePath+'?rootPageId=100',body:null});assert.equal(response.status,503);assert.equal(response.body.code,'PUBLICATION_SERVICE');
  }
});
test('known conflicts retain safe codes; private host error text is never sent to the browser',async t=>{
  for(const [code,status] of [['FORBIDDEN',403],['CONFLICT',409],['PUBLICATION_PENDING',409],['ATTACHMENT_TOO_LARGE',413],['CONFLUENCE_UNCERTAIN',503],['UNEXPECTED',503]]){
    const f=await fixture(t,{service:{execute:async()=>{const e=Error('SECRET TOKEN AND PRIVATE URL');e.code=code;throw e;}}});
    const r=await f.request();assert.equal(r.status,status);assert.equal(JSON.stringify(r).includes('SECRET'),false);assert.equal(r.body.code,code==='UNEXPECTED'?'PUBLICATION_SERVICE':code);
  }
});
test('handler configuration cannot omit trusted callbacks or route outside an exact HTTPS origin',()=>{
  const options={origin,rootPageId,workflowPath,workspacePath,authenticate:async()=>({}),loadWorkspace:async()=>({data:data(),attachmentVersion:1}),loadCapabilities:async()=>({}),service:{execute:async()=>({})}};
  for(const change of [{authenticate:null},{loadWorkspace:null},{loadCapabilities:null},{service:{snapshot(){}}},{origin:'http://confluence.test'},{origin:origin+'/'},{rootPageId:'0'},{workflowPath:workspacePath},{workspacePath:'//other.test/workspace'},{workflowPath:'/confluence/../workflow'},{maxBodyBytes:MAX_BODY_BYTES+1},{requestTimeoutMs:0}])assert.throws(()=>createPublicationHandler({...options,...change}));
});
