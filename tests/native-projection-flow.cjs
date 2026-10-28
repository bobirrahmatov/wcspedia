'use strict';
// Actual coordinator, native page publisher, storage renderer and projection
// writer over a local HTTP REST simulation. No live Confluence is contacted.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {once}=require('node:events');
const {fixture}=require('./helpers/confluence-publication-fixture.cjs');
const {projectionFixture}=require('./helpers/confluence-projection-fixture.cjs');
const {createPublisher,AREAS}=require('../confluence-publisher.cjs');
const {createProjectionWriter}=require('../confluence-projection.cjs');
const {createWorkflowService}=require('../publication-workflow.cjs');
const W=require('../workflow.js'),G=require('../governance.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const people=[{id:'author',name:'Author',role:'Author',soeid:'AM12345'},{id:'manager',name:'Manager',role:'Manager',soeid:'JL12345'}];
const operations=['read','create','update','delete'].map(operation=>({operation,targetType:'page'}));
async function setup(t){
 const f=fixture(),projection=projectionFixture(),nativeFetch=f.config.fetch;
 const server=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),url='https://confluence.test'+req.url;
  const body=!bytes.length?undefined:/^multipart\/form-data/.test(req.headers['content-type']||'')?await new Request(url,{method:req.method,headers:req.headers,body:bytes}).formData():bytes.toString('utf8');
  const result=await(projection.matches(url)?projection.fetch:nativeFetch)(url,{method:req.method,headers:req.headers,body});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const transport=(url,init)=>{const u=new URL(url);return fetch('http://127.0.0.1:'+server.address().port+u.pathname+u.search,init);};
 delete f.config.renderStorage;delete f.config.collectMedia;f.config.fetch=transport;
 const publisher=createPublisher(f.config),writeProjection=createProjectionWriter({baseUrl:'https://confluence.test/confluence',rootPageId:'101',journal:f.journal,fetch:transport});
 const policy={schemaVersion:1,revision:1,records:people.map(p=>({id:p.id,soeid:p.soeid,displayName:p.name,scope:'*',permissions:['content.create','content.edit','content.delete'],active:true})),audit:[]};
 const service=createWorkflowService({rootPageId:'101',journal:f.journal,publisher,writeProjection,
  loadInitialState:async()=>({data:{schemaVersion:1,isDemo:false,people,areas:AREAS.map(id=>({id,title:id})),documents:[]},attachmentVersion:1}),
  authenticate:async session=>({type:'known',username:session==='manager'?'JL12345':'AM12345'}),loadPolicy:async()=>copy(policy),
  nativeAccess:async({document})=>({root:operations,workingRoot:operations,area:operations,published:operations,documents:document?{[document.id]:operations}:{},pageVersion:document?f.pages.get(document.confluencePageId)?.version.number:undefined}),now:()=> '2026-10-15T12:00:00.000Z'});
 let serial=0;
 async function command(action,extra={}){const snapshot=await service.snapshot(),doc=snapshot.data.documents[0],v=doc&&W.currentVersion(doc);return {action,rootPageId:'101',requestId:'projection-flow-'+(++serial),comment:'Verified content change.',expectedEntitlementRevision:1,expectedAttachmentVersion:snapshot.attachmentVersion,...(doc?{docId:doc.id,documentKey:doc.id,confluencePageId:doc.confluencePageId,expectedPageVersion:doc.confluencePageVersion,expectedVersion:v.version,expectedRevision:v.revision,expectedAuditLength:doc.audit.length}:{}),...extra};}
 const act=async(action,session,extra={})=>{const cmd=await command(action,extra);return service.execute(cmd,session);};
 async function prepareApproval(){await act('submit','author');const v=W.currentVersion((await service.snapshot()).data.documents[0]);await act('complete-review','manager',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(i=>[i.key,true])),findingDisposition:'clear',reason:'Sources, content and ownership checked.'}});return command('approve',{nextReviewAt:'2028-10-15'});}
 return {...f,projection,service,act,command,prepareApproval};
}
function fields(){return {id:'wcs-doc-projection-flow',reference:'WCS-JA-100',area:'loan-management',type:'Job aid',ownerId:'author',authorId:'author',reviewerId:'manager',approverId:'manager',title:'Loan servicing checklist',summary:'Guidance for loan servicing colleagues.',bodyMarkdown:'## Getting ready\n\nCheck the current source record.',governance:{classification:'other-nhd',owningTeam:'Loan Management',scope:'Task support.',audience:'Loan servicing colleagues.',classificationRationale:'Guidance for operational tasks.',reviewBasis:'business-best-practice',reviewMonths:24,sources:[]}};}
test('real HTTP projection stays empty for drafts and contains the approved native child after approval',async t=>{const f=await setup(t);await f.act('create','author',{fields:fields()});assert.deepEqual(JSON.parse(f.projection.state.versions.get(2)).documents,[]);const cmd=await f.prepareApproval();await f.service.execute(cmd,'manager');const state=await f.service.snapshot(),published=JSON.parse(f.projection.state.versions.get(f.projection.state.version));assert.equal(published.documents.length,1);const reader=published.documents[0],doc=state.data.documents[0];assert.equal(reader.confluencePageId,doc.publishedConfluencePageId);assert.notEqual(reader.confluencePageId,doc.confluencePageId);assert.equal(f.pages.get(reader.confluencePageId).ancestors.at(-1).id,'206');assert.deepEqual(reader.audit,[]);assert.equal(reader.versions[0].governanceReview,undefined);assert.equal(state.attachmentVersion,f.projection.state.version);});
test('lost reader upload response recovers coordinator and attachment without duplicate page or attachment revision',async t=>{const f=await setup(t);await f.act('create','author',{fields:fields()});const cmd=await f.prepareApproval(),postsBefore=f.projection.state.posts;f.projection.state.losePost=true;await assert.rejects(f.service.execute(cmd,'manager'),{code:'PROJECTION_HTTP'});const pending=await f.service.snapshot();assert.equal(pending.pendingRequestId,cmd.requestId);assert.equal(W.currentVersion(pending.data.documents[0]).status,'Awaiting approval');const countPages=f.pages.size,version=f.projection.state.version;const receipt=await f.service.execute(cmd,'manager');assert.equal(receipt.attachmentVersion,version);assert.equal(f.projection.state.posts,postsBefore+1);assert.equal(f.pages.size,countPages);assert.equal((await f.service.snapshot()).pendingRequestId,null);assert.equal(W.currentVersion((await f.service.snapshot()).data.documents[0]).status,'Published');});
test('uncertain reader upload with no observed native version change remains pending and is not blindly retried',async t=>{const f=await setup(t);await f.act('create','author',{fields:fields()});const cmd=await f.prepareApproval();f.projection.state.failBeforePost=true;await assert.rejects(f.service.execute(cmd,'manager'));const posts=f.projection.state.posts;await assert.rejects(f.service.execute(cmd,'manager'),{code:'PUBLICATION_PENDING'});assert.equal(f.projection.state.posts,posts);assert.equal((await f.service.snapshot()).pendingRequestId,cmd.requestId);});
