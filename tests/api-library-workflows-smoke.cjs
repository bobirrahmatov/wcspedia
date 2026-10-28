/* Loopback-only integration of new adapters with the existing Confluence mock. */
'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const H=require('../content-health.js'),Health=require('../health-service.js'),Bookmarks=require('../bookmarks.js'),W=require('../workflow.js'),G=require('../governance.js'),seed=structuredClone(require('../wcspedia-data.json'));
const port=Number(process.env.WCS_LIBRARY_TEST_PORT||4183),origin='http://127.0.0.1:'+port;
const docs=seed.documents.filter(d=>W.publishedVersion(d)),doc=docs.find(d=>H.resources(W.publishedVersion(d)).length===0),denied=docs.find(d=>d.id!==doc.id),version=W.publishedVersion(doc),identity=seed.people.find(p=>p.id==='jordan');
// Only the isolated test fixture is classified; committed legacy approvals stay unchanged.
version.governance=G.normalize({classification:'other-nhd',owningTeam:'WCS Learning',scope:'Sample support knowledge.',audience:'Credit service colleagues',classificationRationale:'Descriptive business aid.'});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'wcs-library-http-')),fixtureFile=path.join(temporary,'fixture.json');fs.writeFileSync(fixtureFile,JSON.stringify(seed));
const server=spawn(process.execPath,[path.join(__dirname,'../mock-confluence.cjs')],{env:{...process.env,WCS_MOCK_PORT:String(port),WCS_MOCK_ACTOR:'jordan',WCS_MOCK_DENY_READ_DOCUMENTS:denied.id,WCS_MOCK_DATA_FILE:fixtureFile},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mock startup timed out.')),10000);server.once('error',reject);server.stderr.on('data',chunk=>{clearTimeout(timer);reject(Error(String(chunk)));});server.stdout.on('data',chunk=>{if(String(chunk).includes('Local Confluence simulation:')){clearTimeout(timer);resolve();}});});
const config={mode:'confluence',rootPageId:'100',healthEndpoint:origin+'/confluence/mock/health'},location={href:origin+'/mock-live.html',origin};
const client=Health.create({config,identity,fetch,location});
const command=(action,revision,extra={})=>({action,expectedRevision:revision,expectedPublishedVersion:version.version,expectedPublishedRevision:version.revision,reason:'Loopback test: '+action,...extra});
const get=async route=>{const r=await fetch(origin+route);assert.equal(r.status,200);return r.json();};
(async()=>{
 await ready;
 const baseline=await get('/confluence/mock/workspace?rootPageId=100');
 assert.deepEqual(Object.keys(await client.load([doc])),[]);
 await assert.rejects(client.load([denied]),e=>e.code==='HEALTH_FORBIDDEN');
 const rules=H.defaults();rules.reviewWarningDays=365;
 let record=await client.submit(doc.id,command('update-rules',0,{rules,assigneeId:doc.ownerId}));assert.equal(record.rulesRevision,1);assert.equal(record.audit[0].actorSOEID,identity.soeid.toLowerCase());
 await assert.rejects(client.submit(doc.id,command('start',0)),e=>e.code==='HEALTH_CONFLICT');
 await assert.rejects(client.submit(doc.id,command('start',record.revision,{expectedPublishedRevision:version.revision+1})),e=>e.code==='HEALTH_CONFLICT');
 record=await client.submit(doc.id,command('start',record.revision));assert.equal(record.status,'In progress');
 record=await client.submit(doc.id,command('submit',record.revision));assert.equal(record.status,'Ready for verification');
 await assert.rejects(client.submit(doc.id,command('resolve',record.revision)));
 record=await client.submit(doc.id,command('update-rules',record.revision,{rules:H.defaults(),assigneeId:doc.ownerId}));
 record=await client.submit(doc.id,command('resolve',record.revision));assert.equal(record.status,'Resolved');assert.equal(record.audit.length,5);
 const loaded=await client.load([doc]);assert.equal(loaded[doc.id].status,'Resolved');
 const post=(payload,headers={})=>fetch(origin+'/confluence/mock/health?rootPageId=100',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',...headers},body:JSON.stringify(payload)});
 assert.equal((await post({documentId:doc.id,command:command('start',record.revision),actor:{role:'Manager'}})).status,400);
 assert.equal((await post({documentId:doc.id,command:command('start',record.revision)},{Origin:'https://foreign.example'})).status,403);
 assert.equal((await fetch(origin+'/confluence/mock/health?rootPageId=100',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const bookmarks=Bookmarks.create({mode:'confluence',rootPageId:'100',identity,endpoint:origin+'/confluence/mock/bookmarks',baseUrl:location.href,fetch,getDocuments:()=>docs,canRead:d=>d.id!==denied.id,publishedVersion:W.publishedVersion});
 const saved=await bookmarks.set(doc.id,true,{expectedRevision:(await bookmarks.load()).revision});assert.equal(saved.bookmarks[0].documentId,doc.id);assert.equal((await bookmarks.load()).bookmarks.length,1);
 assert.deepEqual(await get('/confluence/mock/workspace?rootPageId=100'),baseline,'Personal saves and health rules never mutate document content or its audit.');
 console.log('PASS assembled loopback adapters: bookmarks, manager health workflow, conflicts, native read denial, CSRF, forgery, and unchanged document snapshots');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{server.kill('SIGTERM');fs.rmSync(temporary,{recursive:true,force:true});});
