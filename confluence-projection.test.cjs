'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProjectionWriter,validateProjection}=require('./confluence-projection.cjs');
const {fixture,document,approved,people}=require('./tests/helpers/confluence-publication-fixture.cjs');
const {projectionFixture}=require('./tests/helpers/confluence-projection-fixture.cjs');
const {readerProjection}=require('./publication-workflow.cjs');
function data(){const doc=approved(document());doc.publishedConfluencePageId='1001';doc.publishedConfluencePageVersion=2;return readerProjection({schemaVersion:1,isDemo:false,people,areas:[{id:doc.area,title:'Credit approval control'}],documents:[doc]});}
function setup(options={}){const j=fixture(),f=projectionFixture(options),config={baseUrl:'https://confluence.test/confluence',rootPageId:'101',journal:j.journal,fetch:f.fetch};return {...f,journal:j.journal,entries:j.entries,config,write:createProjectionWriter(config)};}
const args=()=>({data:data(),expectedAttachmentVersion:1,requestId:'publish-1'});
test('approved reader projection retains validated source provenance without accepting workflow timestamp overrides',()=>{
  const d=data(),v=d.documents[0].versions[0];
  v.sourceMetadata={schemaVersion:1,sourceId:'source-01',originalCreatedAt:'2020-04-20',originalUpdatedAt:'2024-10-15T09:30:00+02:00',sourceAuthor:'Original author',sourcePath:'credit/example.mdx'};v.sourceImportedAt='2026-10-15T09:00:00.000Z';
  const saved=JSON.parse(validateProjection(d)).documents[0].versions[0];
  assert.deepEqual(saved.sourceMetadata,v.sourceMetadata);assert.equal(saved.sourceImportedAt,v.sourceImportedAt);assert.equal(saved.approvedAt,v.approvedAt);
  for(const change of [v=>v.sourceMetadata.privateNote='do not publish',v=>v.sourceMetadata.originalUpdatedAt='2024-02-30',v=>delete v.sourceImportedAt,v=>v.sourceImportedAt='2026-10-15']){
    const bad=JSON.parse(JSON.stringify(d));change(bad.documents[0].versions[0]);assert.throws(()=>validateProjection(bad));
  }
});
test('approved projection updates existing attachment and verifies exact uploaded bytes and version',async()=>{const f=setup(),input=args(),r=await f.write(input);assert.deepEqual(r,{attachmentVersion:2});assert.equal(f.state.posts,1);assert.deepEqual(JSON.parse(f.state.versions.get(2)),JSON.parse(validateProjection(input.data)));assert.ok(f.state.calls.some(c=>c.method==='POST'&&c.url.endsWith('/child/attachment/900/data')));});
test('same completed projection is replayed without creating another attachment version',async()=>{const f=setup(),input=args();await f.write(input);assert.deepEqual(await f.write(input),{attachmentVersion:2});assert.equal(f.state.posts,1);});
test('lost upload response reconciles exact native next version and bytes without retrying POST',async()=>{const f=setup({losePost:true}),input=args();await assert.rejects(f.write(input),{code:'PROJECTION_UNCERTAIN'});assert.deepEqual(await f.write(input),{attachmentVersion:2});assert.equal(f.state.posts,1);});
test('uncertain uncommitted upload does not issue a duplicate POST',async()=>{const f=setup({failBeforePost:true}),input=args();await assert.rejects(f.write(input),{code:'PROJECTION_UNCERTAIN'});await assert.rejects(f.write(input),{code:'PUBLICATION_PENDING'});assert.equal(f.state.posts,1);assert.equal(f.state.version,1);});
test('a pending upload blocks another request or changed bytes',async()=>{const f=setup({losePost:true}),input=args();await assert.rejects(f.write(input));await assert.rejects(f.write({...input,requestId:'other'}),{code:'PUBLICATION_PENDING'});input.data.documents[0].versions[0].summary='Different';await assert.rejects(f.write(input),{code:'PUBLICATION_PENDING'});assert.equal(f.state.posts,1);});
test('stale native attachment version rejects before upload and durable intent',async()=>{const f=setup();f.state.version=2;await assert.rejects(f.write(args()),{code:'PROJECTION_CONFLICT'});assert.equal(f.state.posts,0);assert.equal(f.entries.size,0);});
test('missing initial attachment fails instead of creating an ambiguous second attachment',async()=>{const f=setup({missing:true});await assert.rejects(f.write(args()),{code:'PROJECTION_CONFIGURATION'});assert.equal(f.state.posts,0);});
test('different read-back bytes do not count as a successful publication',async()=>{const f=setup({corruptUpload:true}),input=args();await assert.rejects(f.write(input),{code:'PROJECTION_CONFLICT'});await assert.rejects(f.write(input),{code:'PROJECTION_CONFLICT'});assert.equal(f.state.posts,1);});
test('document drafts, audit events, governance review evidence, entitlements and working mappings never reach upload',async()=>{for(const change of [d=>d.documents[0].versions[0].status='Draft',d=>d.documents[0].audit=[{id:'private'}],d=>d.documents[0].versions[0].governanceReview={reason:'private'},d=>d.entitlementPolicy={records:[]},d=>d.documents[0].publishedConfluencePageId='1002',d=>d.privateData='private',d=>d.documents[0].versions[0].sections[0].privateData='private']){const f=setup(),input=args();change(input.data);await assert.rejects(f.write(input));assert.equal(f.state.calls.length,0);}});
test('approval metadata and confirmed native page mapping are required',()=>{for(const change of [d=>delete d.documents[0].confluencePageId,d=>d.documents[0].versions[0].reviewedRevision=99,d=>d.documents[0].versions[0].approvedBy='author']){const d=data();change(d);assert.throws(()=>validateProjection(d));}});
test('illustrative data is rejected for production reader publication',()=>{const d=data();d.isDemo=true;assert.throws(()=>validateProjection(d),/Illustrative/);});
test('empty reader projection after draft save is valid and records native attachment version',async()=>{const f=setup(),input=args();input.data.documents=[];assert.deepEqual(await f.write(input),{attachmentVersion:2});});
test('concurrent same requests serialize to one native upload',async()=>{const f=setup(),input=args();const values=await Promise.all([f.write(input),f.write(input)]);assert.deepEqual(values,[{attachmentVersion:2},{attachmentVersion:2}]);assert.equal(f.state.posts,1);});
test('repeat request ID with different expected version or bytes is rejected',async()=>{const f=setup(),input=args();await f.write(input);await assert.rejects(f.write({...input,expectedAttachmentVersion:2}),{code:'PROJECTION_CONFLICT'});assert.equal(f.state.posts,1);});
test('reader metadata change during version read-back is detected',async()=>{const f=setup();let shifted=false;f.config.fetch=async(url,init)=>{const result=await f.fetch(url,init);if(!shifted&&url.includes('/download/attachments/')){shifted=true;f.state.version++;f.state.versions.set(f.state.version,Buffer.from('{}'));}return result;};await assert.rejects(createProjectionWriter(f.config)(args()),{code:'PROJECTION_CONFLICT'});});
test('URL credentials, non-HTTPS and path filenames are rejected',()=>{const f=setup();for(const changes of [{baseUrl:'http://example.test/confluence'},{baseUrl:'https://user:secret@example.test/confluence'},{filename:'../data.json'}])assert.throws(()=>createProjectionWriter({...f.config,...changes}));});
test('preflight allows missing native mapping only for the one pending document and write remains strict',async()=>{const f=setup(),d=data(),key=d.documents[0].id;delete d.documents[0].confluencePageId;delete d.documents[0].confluencePageVersion;assert.ok(Buffer.isBuffer(f.write.preflight(d,{pendingDocumentKey:key})));assert.throws(()=>f.write.preflight(d,{pendingDocumentKey:'another'}),/confirmed native/);assert.throws(()=>f.write.validate(d),/confirmed native/);await assert.rejects(f.write({data:d,expectedAttachmentVersion:1,requestId:'new'}),/confirmed native/);assert.equal(f.state.calls.length,0);});


test('reader projection retains an approved disabled discussion and rejects non-boolean settings',()=>{
  const d=data();d.documents[0].type='Blog';d.documents[0].versions[0].commentsEnabled=false;
  assert.equal(JSON.parse(validateProjection(d)).documents[0].versions[0].commentsEnabled,false);
  for(const value of [null,'false',0]){d.documents[0].versions[0].commentsEnabled=value;assert.throws(()=>validateProjection(d),/commentsEnabled/);}
});

test('reader projection uses a conservative 10 MB UTF-8 file limit before native writes',async()=>{
  const f=setup(),d={schemaVersion:1,isDemo:false,people:[],areas:[],documents:[],sampleNotice:''};
  const base=validateProjection(d).length;
  d.sampleNotice='x'.repeat(10000000-base);
  assert.equal(validateProjection(d).length,10000000);assert.equal(f.write.maxBytes,10000000);
  d.sampleNotice+='x';
  await assert.rejects(f.write({data:d,expectedAttachmentVersion:1,requestId:'too-large'}),{code:'ATTACHMENT_TOO_LARGE'});
  assert.equal(f.state.calls.length,0);assert.equal(f.entries.size,0);
  d.sampleNotice='漢'.repeat(Math.floor((10000000-base)/3)+1);
  assert.ok(JSON.stringify(d).length<10000000);
  assert.throws(()=>validateProjection(d),{code:'ATTACHMENT_TOO_LARGE'});
});
test('reader projection reserves native mapping bytes during preflight at the attachment ceiling',()=>{
  const f=setup(),d=data(),key=d.documents[0].id;delete d.documents[0].confluencePageId;delete d.documents[0].confluencePageVersion;
  d.sampleNotice='';const base=f.write.preflight(d,{pendingDocumentKey:key}).length;
  d.sampleNotice='x'.repeat(10000000-base-256);
  assert.equal(f.write.preflight(d,{pendingDocumentKey:key}).length,10000000-256);
  d.sampleNotice+='x';assert.throws(()=>f.write.preflight(d,{pendingDocumentKey:key}),{code:'ATTACHMENT_TOO_LARGE'});
});
test('definite reader attachment HTTP 413 releases pending intent and permits a corrected upload',async()=>{
  const f=setup();let reject=true;
  f.config.fetch=(url,init={})=>init.method==='POST'&&reject?Promise.resolve(new Response('',{status:413})):f.fetch(url,init);
  const write=createProjectionWriter(f.config);
  await assert.rejects(write(args()),error=>error.code==='ATTACHMENT_TOO_LARGE'&&error.status===413&&/Reduce the projection/.test(error.message));
  assert.equal([...f.entries.values()][0].pending,null);assert.equal(f.state.version,1);
  reject=false;assert.deepEqual(await write({...args(),requestId:'corrected'}),{attachmentVersion:2});
});
test('reader projection bounds read-back attachments with and without Content-Length',async()=>{
  for(const declared of [true,false]){
    const f=setup();let cancelled=false;
    f.config.fetch=(url,init)=>url.includes('/download/attachments/')?Promise.resolve(new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(declared?1:10000001));},cancel(){cancelled=true;}}),{headers:declared?{'Content-Length':'10000001'}:{}})):f.fetch(url,init);
    await assert.rejects(createProjectionWriter(f.config)(args()),{code:'ATTACHMENT_TOO_LARGE'});
    assert.equal(cancelled,true);
  }
});
