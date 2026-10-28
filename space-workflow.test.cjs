'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto,randomUUID}=require('node:crypto');
const SW=require('./space-workflow.js'),W=require('./workflow.js'),G=require('./governance.js'),Renderer=require('./space-renderer.js'),ServerRenderer=require('./confluence-storage.cjs');
const clone=v=>JSON.parse(JSON.stringify(v)),ops=names=>names.map(operation=>({operation,targetType:'page'}));
function fixture(){
  let actor='AA12345',next=500;
  const pages=new Map(),properties=new Map(),states=new Map(),attachments=new Map(),trashed=new Map(),writes=[],flags={unrestricted:false,denyCreate:false,denyRestrict:false,failState:false,failBody:false,failBodyAfter:false,failSummary:false,failStateAfter:false,reserveState:false,failDeleteAfter:false,noSpaceOperations:false,labels:[]};
  const native=(id,parent,title)=>({id:String(id),type:'page',status:'current',title:title||'Page '+id,space:{key:'wcspedia'},ancestors:parent?[{id:String(parent)}]:[],version:{number:1},operations:ops(['read','update','delete']),body:{storage:{value:''}}});
  pages.set('100',native('100'));pages.set('200',native('200'));pages.set('101',native('101','100'));pages.set('102',native('102','100'));
  const policy={schemaVersion:1,revision:1,audit:[],records:[{id:'author',soeid:'AA12345',displayName:'Author',scope:'*',permissions:['content.create','content.edit'],active:true},{id:'manager',soeid:'BB12345',displayName:'Manager',scope:'*',permissions:['content.create','content.edit','content.delete','entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'],active:true}]};
  const catalog={schemaVersion:1,isDemo:false,people:[],areas:[{id:'credit-approval-control',title:'Credit Approval Control'}],documents:[]};
  const user=()=>({type:'known',username:actor,userKey:'key-'+actor,displayName:actor==='AA12345'?'Author':'Manager'});
  const restrictions=new Map(),readRestrictions=new Map();
  const storage={
    async user(){return user();},
    async page(id){if(!pages.has(String(id))){const e=Error('Not found');e.status=404;throw e;}return clone(pages.get(String(id)));},
    async property(id,key){return clone(properties.get(id+':'+key)||null);},
    async putProperty(id,key,value,expected){if(flags.failSummary&&key==='wcspedia-workflow-summary'){flags.failSummary=false;throw Error('Summary write failed');}const k=id+':'+key,old=properties.get(k);assert.equal(expected,old?.version.number??null,'CAS property revision');const p={id:k,key,value:clone(value),version:{number:(old?.version.number||0)+1}};properties.set(k,p);writes.push(['property',id,key]);return clone(p);},
    async readJSON(id){return clone(states.get(id)||{data:null,revision:0,attachmentVersion:0});},
    async writeJSON(id,file,key,data,o){if(flags.failState){flags.failState=false;throw Error('State upload failed');}const old=states.get(id);if(flags.reserveState){flags.reserveState=false;states.set(id,{data:old?.data||null,revision:(old?.revision||0)+1,attachmentVersion:old?.attachmentVersion||0,pointer:{pending:{requestId:o.requestId,expectedRevision:o.expectedRevision}}});throw Error('Pending JSON upload');}assert.equal(o.expectedRevision,old?.pointer?.pending?.expectedRevision??old?.revision??0);const result={data:clone(data),revision:(old?.revision||0)+2,attachmentVersion:(old?.attachmentVersion||0)+1};states.set(id,result);writes.push(['state',id]);if(flags.failStateAfter){flags.failStateAfter=false;throw Error('State reply lost');}return clone(result);},
    async request(path,opts={}){
      const url=new URL(path,'https://example.test'),method=opts.method||'GET',body=typeof opts.body==='string'?JSON.parse(opts.body):opts.body;let m;
      if(method!=='GET')writes.push([method,path,body===undefined?null:clone(body)]);
      if(path.includes('/permissions/user/'))return flags.denyCreate?[]:[{operation:{targetType:'page',operationKey:'create'}}];
      if(path.startsWith('/rest/api/space/'))return flags.noSpaceOperations?{key:'wcspedia'}:{key:'wcspedia',operations:flags.denyCreate?[]:ops(['create'])};
      if(path.startsWith('/rest/api/user?'))return {type:'known',username:url.searchParams.get('username'),userKey:'key-'+url.searchParams.get('username')};
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)\/restriction\/byOperation\/(read|update)$/))){if(flags.denyReadRestrictions&&m[2]==='read'){const error=Error('Restrictions are not readable');error.status=403;error.code='FORBIDDEN';throw error;}const values=m[2]==='read'?(readRestrictions.get(m[1])?.user||((!flags.unrestricted&&m[1]==='200')||m[1]===flags.inheritedAt?[{username:'AA12345'}]:[])):restrictions.get(m[1])||[];return {operation:m[2],restrictions:{user:{results:values},group:{results:m[2]==='read'?(readRestrictions.get(m[1])?.group||[]):[]}}};}
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)\/restriction$/))&&method==='PUT'){if(flags.denyRestrict){const e=Error('No restrict permission');e.code='FORBIDDEN';throw e;}for(const entry of body){if(entry.operation==='update')restrictions.set(m[1],entry.restrictions.user);if(entry.operation==='read')readRestrictions.set(m[1],clone(entry.restrictions));}return {};}
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)\/child\/page$/))){const rows=Array.from(pages.values()).filter(p=>p.ancestors.at(-1)?.id===m[1]);return {results:clone(rows),_links:{}};}
      if(url.pathname==='/rest/api/content'&&method==='GET')return {results:clone(Array.from(pages.values()).filter(p=>p.title===url.searchParams.get('title')))};
      if(url.pathname==='/rest/api/content'&&method==='POST'){const p=native(next++,body.ancestors[0].id,body.title);p.body=body.body;pages.set(p.id,p);if(flags.createdReadOnly)p.operations=ops(['read']);if(flags.createdMissingPermissions)delete p.operations;return flags.minimalCreateResponse?{id:p.id}:clone(p);}
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)$/))&&method==='PUT'){
        if(flags.failBody){flags.failBody=false;throw Error('Native body failed');}
        const p=pages.get(m[1]);assert.equal(body.version.number,p.version.number+1,'native page CAS');Object.assign(p,body);if(flags.failBodyAfter){flags.failBodyAfter=false;throw Error('Native response lost');}return clone(p);
      }
      if(url.pathname.endsWith('/label')){if(method==='GET')return {results:flags.labels.map(name=>({name}))};if(method==='DELETE')flags.labels=flags.labels.filter(n=>n!==url.searchParams.get('name'));else flags.labels=Array.from(new Set(flags.labels.concat(body.map(l=>l.name))));return {results:body||[]};}
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)\/child\/attachment$/))){if(method==='POST'){const file=body.get('file'),data=new Uint8Array(await file.arrayBuffer()),a={id:String(next++),type:'attachment',title:file.name,version:{number:1},container:{type:'page',id:m[1]},bytes:data};attachments.set(m[1]+':'+file.name,a);return {results:[{...a,bytes:undefined}]};}const a=attachments.get(m[1]+':'+url.searchParams.get('filename'));return {results:a?[{...a,bytes:undefined}]:[]};}
      if((m=url.pathname.match(/^\/download\/attachments\/(\d+)\/(.+)$/)))return attachments.get(m[1]+':'+decodeURIComponent(m[2])).bytes;
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)$/))&&method==='DELETE'){trashed.set(m[1],{...pages.get(m[1]),status:'trashed'});pages.delete(m[1]);if(flags.failDeleteAfter){flags.failDeleteAfter=false;const e=Error('Delete reply lost');e.code='UNKNOWN_COMMIT';throw e;}return null;}
      if((m=url.pathname.match(/^\/rest\/api\/content\/(\d+)$/))&&url.searchParams.get('status')==='trashed')return clone(trashed.get(m[1])||null);
      throw Error('Unexpected native request: '+method+' '+path);
    }
  };
  const config={spaceKey:'wcspedia',rootPageId:'100',workingRootPageId:'200',insightsPageId:'102',areaPageIds:{'credit-approval-control':'101'},baseUrl:'https://example.test/confluence'};
  const api=SW.create(config,{storage,crypto:webcrypto,origin:'https://example.test',fetch:async url=>{const u=new URL(url),m=u.pathname.match(/\/download\/attachments\/(\d+)\/(.+)$/),a=attachments.get(m[1]+':'+decodeURIComponent(m[2]));return {ok:!!a,url,headers:{get:k=>k==='content-length'?String(a.bytes.length):'image/png'},arrayBuffer:async()=>a.bytes.buffer};},loadPolicy:async()=>clone(policy)});
  const fields={id:'doc-native-01',reference:'WCS-JA-001',area:'credit-approval-control',type:'Job aid',ownerId:'wcs-user-aa12345',authorId:'wcs-user-aa12345',reviewerId:'wcs-user-bb12345',approverId:'wcs-user-bb12345',title:'Handover',summary:'Learning guidance.',bodyMarkdown:'## Overview\n\nCheck the source record before handover.',governance:G.normalize({classification:'other-nhd',owningTeam:'WCS Learning',scope:'Internal learning support.',audience:'Credit service colleagues',classificationRationale:'This aid explains a task and leaves formal requirements to the source.'})};
  async function load(){return api.load({catalog});}
  async function command(action,session,extra={}){const d=session.data.documents.find(d=>d.id===fields.id),v=d&&W.currentVersion(d);return {action,comment:'Verified change.',requestId:randomUUID(),expectedEntitlementRevision:policy.revision,...(action==='create'?{fields:clone(fields)}:{docId:d.id,expectedVersion:v.version,expectedRevision:v.revision,expectedAuditLength:d.audit.length,expectedPageVersion:d.confluencePageVersion}),...extra};}
  async function act(action,extra={}){const s=await load(),c=await command(action,s,extra);return api.submit(c,s);}
  return {api,config,storage,policy,catalog,flags,pages,properties,states,attachments,trashed,writes,fields,load,command,act,setActor(value){actor=value;}};
}
async function review(f){await f.act('create');await f.act('submit');f.setActor('BB12345');const s=await f.load(),v=W.currentVersion(s.data.documents[0]);return f.act('complete-review',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(i=>[i.key,true])),findingDisposition:'clear',reason:'Reviewed the exact wording and applicability.'}});}
test('simplified Job aid creation, review and approval need no governance fields or review date',async()=>{
 const f=fixture();delete f.fields.governance;
 await f.act('create');await f.act('submit');
 await assert.rejects(f.act('approve'),/not allowed|not permitted|assigned|approve/i);
 f.setActor('BB12345');await f.act('complete-review');
 const result=await f.act('approve'),doc=result.data.documents[0],v=W.currentVersion(doc);
 assert.equal(v.status,'Published');assert.ok(v.reviewedAt);assert.ok(v.approvedAt);assert.equal(v.nextReviewAt,null);assert.equal(v.governance,undefined);
 assert.equal(f.pages.get(doc.publishedConfluencePageId).ancestors.at(-1).id,'101');
});
test('simplified workflow preserves recorded governance metadata during content edits',async()=>{
 const f=fixture();await f.act('create');const old=W.currentVersion((await f.load()).data.documents[0]).governance;
 const result=await f.act('edit',{changes:{title:'Clearer handover'}});
 assert.deepEqual(W.currentVersion(result.data.documents[0]).governance,old);
});
test('Job aid restriction 403 retries the same private creation after native access is fixed',async()=>{
 const f=fixture(),request=f.storage.request;let denied=true;
 f.storage.request=async(path,options={})=>{
   if(denied&&options.method==='PUT'&&path.endsWith('/restriction'))throw Object.assign(Error('Native restriction denied'),{status:403,code:'CONFLUENCE_HTTP'});
   return request(path,options);
 };
 const session=await f.load(),command=await f.command('create',session);
 await assert.rejects(f.api.submit(command,session),error=>error.status===403&&error.recoverable===true&&/Sync access in Entitlements/.test(error.message)&&/Check save/.test(error.message));
 assert.equal(f.states.size,0);assert.equal(f.pages.get('500').ancestors.at(-1).id,'200');assert.doesNotMatch(f.pages.get('500').body.storage.value,/Check the source record/);
 denied=false;const result=await f.api.submit(command,session);
 assert.equal(result.data.documents[0].confluencePageId,'500');assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});
test('native creation requires actual space Add page plus JSON grant and restricted working root',async()=>{const f=fixture();assert.equal((await f.api.capabilities()).canCreateDocument,true);f.flags.denyCreate=true;assert.equal((await f.api.capabilities()).canCreateDocument,false);await assert.rejects(f.act('create'),{code:'FORBIDDEN'});assert.equal(f.writes.length,0);f.flags.denyCreate=false;f.flags.unrestricted=true;await assert.rejects(f.act('create'),{code:'WORKING_ROOT_UNRESTRICTED'});assert.equal(f.writes.length,0);});
test('custom editor save creates readable native working page and per-document state without shared library writes',async()=>{const f=fixture(),s=await f.act('create'),d=s.data.documents[0];assert.equal(d.confluencePageId,'500');assert.equal(d.nativeSessionWorkflow,true);assert.equal(W.currentVersion(d).status,'Draft');assert.match(f.pages.get('500').body.storage.value,/Check the source record/);assert.equal(f.pages.get('500').ancestors[0].id,'200');assert.equal(f.states.size,1);assert.ok(f.writes.filter(w=>w[0]==='state').every(w=>w[1]==='500'));assert.equal(s.actor.role,'Author');assert.equal(s.data.people.find(p=>p.soeid==='BB12345').role,'Manager');});
test('exact-revision review and manager approval publishes native page under business area',async()=>{const f=fixture();await review(f);const s=await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)}),d=s.data.documents[0];assert.equal(W.currentVersion(d).status,'Published');assert.equal(d.publishedConfluencePageId,'501');assert.equal(f.pages.get('501').ancestors[0].id,'101');assert.match(f.pages.get('501').body.storage.value,/Approved by/);assert.ok(f.writes.some(w=>w[0]==='PUT'&&w[1]==='/rest/api/content/501/restriction'));});
test('blogs publish beneath Insights, preserving the current editor',async()=>{const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});const s=await f.act('create');const page=f.pages.get(s.data.documents[0].publishedConfluencePageId);assert.equal(page.ancestors[0].id,'102');assert.match(page.body.storage.value,/class="wcs-native-article"/);assert.match(page.body.storage.value,/href="\/confluence\/pages\/viewpage.action\?pageId=102"/);assert.match(page.body.storage.value,/ac:name="html"/);assert.match(page.body.storage.value,/ac:name="hidden">true/);});
test('drafts pair View and Edit while publications send only Edit with minimal native users',async()=>{
 const f=fixture(),original=f.storage.request;let checked=0;
 f.storage.request=async(path,options={})=>{
  if(options.method==='PUT'&&path.endsWith('/restriction')){
   assert.match(path,/^\/rest\/api\/content\/\d+\/restriction$/);
   const body=JSON.parse(options.body);assert.deepEqual(body.map(r=>r.operation),path.includes('/500/')?['read','update']:['update']);
   for(const u of body.find(r=>r.operation==='update').restrictions.user)assert.deepEqual(Object.keys(u).sort(),['type','username']);
   checked++;
  }
  return original(path,options);
 };
 await review(f);
 const saved=await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});assert.equal(W.currentVersion(saved.data.documents[0]).status,'Published');assert.equal(checked,2);
});
test('Job aid restriction HTTP 400 leaves publication private and exact-request recovery reuses the existing pages',async()=>{
 const f=fixture(),original=f.storage.request;let reject=true;
 f.storage.request=async(path,options={})=>{
  if(reject&&options.method==='PUT'&&path==='/rest/api/content/501/restriction')throw Object.assign(Error('Confluence rejected the restriction payload.'),{code:'CONFLUENCE_HTTP',status:400});
  return original(path,options);
 };
 await review(f);
 const session=await f.load(),command=await f.command('approve',session,{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 await assert.rejects(f.api.submit(command,session),{status:400});
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'200');
 assert.match(f.pages.get('501').body.storage.value,/being prepared/);
 reject=false;
 const recovered=await f.api.submit(command,session);
 assert.equal(recovered.data.documents[0].publishedConfluencePageId,'501');
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'101');
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,2);
});
test('Job aid creation reuses exact native editing restrictions without a PUT',async()=>{
 const f=fixture(),original=f.storage.request;f.flags.denyRestrict=true;
 f.storage.request=async(path,options={})=>{
  const result=await original(path,options);
  if(path.startsWith('/rest/api/content/500/restriction/byOperation/'))result.restrictions.user.results=[{username:'bb12345'},{username:'aa12345'}];
  return result;
 };
 const session=await f.act('create');assert.equal(W.currentVersion(session.data.documents[0]).status,'Draft');
 assert.equal(f.writes.filter(w=>w[1].endsWith('/restriction')).length,0);
});
test('Job aid approval resumes after native dialog correction with the original request',async()=>{
 const f=fixture(),original=f.storage.request;let corrected=false;
 f.storage.request=async(path,options={})=>{
  if(options.method==='PUT'&&path==='/rest/api/content/501/restriction')throw Object.assign(Error('Restriction write unavailable'),{status:404,code:'CONFLUENCE_HTTP'});
  const result=await original(path,options);
  if(corrected&&path.startsWith('/rest/api/content/501/restriction/byOperation/update'))result.restrictions.user.results=[{username:'BB12345'}];
  if(corrected&&path.startsWith('/rest/api/content/501/restriction/byOperation/read'))result.restrictions.user.results=[];
  return result;
 };
 await review(f);const session=await f.load(),command=await f.command('approve',session,{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 await assert.rejects(f.api.submit(command,session),e=>e.recoverable===true&&e.status===404&&e.code==='CONFLUENCE_HTTP'&&/Job aid page 501/.test(e.message)&&/Required individual editors: BB12345/.test(e.message));
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'200');corrected=true;
 const recovered=await f.api.submit(command,session);assert.equal(recovered.data.documents[0].publishedConfluencePageId,'501');
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'101');assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,2);
});
for(const variant of ['extra-user','group','paginated','changed-on-verification'])test('Job aid does not accept native restriction '+variant,async()=>{
 const f=fixture(),original=f.storage.request;let reads=0;f.flags.denyRestrict=true;
 f.storage.request=async(path,options={})=>{
  const result=await original(path,options);
  if(path.startsWith('/rest/api/content/500/restriction/byOperation/update')){
   reads++;result.restrictions.user.results=[{username:'AA12345'},{username:'BB12345'}];
   if(variant==='extra-user'||variant==='changed-on-verification'&&reads>1)result.restrictions.user.results.push({username:'CC12345'});
   if(variant==='group')result.restrictions.group.results=[{name:'all-users'}];
   if(variant==='paginated')result.restrictions.user._links={next:'/next'};
  }
  return result;
 };
 await assert.rejects(f.act('create'));
 assert.equal(f.states.size,0);assert.doesNotMatch(f.pages.get('500').body.storage.value,/Check the source record/);
});
test('restriction diagnostics preserve an unknown write outcome for reconciliation',async()=>{
 const f=fixture(),original=f.storage.request;
 f.storage.request=async(path,options={})=>{
  if(options.method==='PUT'&&path.endsWith('/restriction'))throw Object.assign(Error('Write response lost'),{code:'UNKNOWN_COMMIT'});
  return original(path,options);
 };
 await assert.rejects(f.act('create'),e=>e.code==='UNKNOWN_COMMIT'&&/Job aid page 500/.test(e.message)&&/Write response lost/.test(e.message));
 assert.equal(f.states.size,0);
});
test('submitting an older author-only Job aid automatically restores assigned editors',async()=>{
 const f=fixture();await f.act('create');
 // Simulate a pre-existing author-only native restriction, outside the app.
 await f.storage.request('/rest/api/content/500/restriction',{method:'PUT',body:JSON.stringify([{operation:'update',restrictions:{user:[{type:'known',username:'AA12345'}],group:[]}}])});
 const count=f.writes.length;
 const submitted=await f.act('submit');assert.equal(W.currentVersion(submitted.data.documents[0]).status,'In review');
 const newWrites=f.writes.slice(count),restriction=newWrites.find(w=>w[1]==='/rest/api/content/500/restriction');
 assert.deepEqual(restriction[2].find(r=>r.operation==='update').restrictions.user.map(u=>u.username).sort(),['AA12345','BB12345']);
 assert.ok(newWrites.indexOf(restriction)<newWrites.findIndex(w=>w[0]==='PUT'&&w[1]==='/rest/api/content/500'));
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});
test('automatic submit permission failure preserves Draft and same-request recovery',async()=>{
 const f=fixture();await f.act('create');
 await f.storage.request('/rest/api/content/500/restriction',{method:'PUT',body:JSON.stringify([{operation:'update',restrictions:{user:[{type:'known',username:'AA12345'}],group:[]}}])});
 const session=await f.load(),command=await f.command('submit',session),version=f.pages.get('500').version.number;
 f.flags.denyRestrict=true;
 await assert.rejects(f.api.submit(command,session),e=>e.code==='FORBIDDEN'&&e.recoverable===true);
 assert.equal(f.pages.get('500').version.number,version);assert.equal(W.currentVersion(f.states.get('500').data.document).status,'Draft');
 f.flags.denyRestrict=false;
 const recovered=await f.api.submit(command,session);assert.equal(W.currentVersion(recovered.data.documents[0]).status,'In review');
 assert.equal(recovered.data.documents[0].audit.filter(e=>e.action==='submit').length,1);
});
test('new Job aid revisions automatically repair author-only Working permissions',async()=>{
 const f=fixture();await review(f);await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 await f.storage.request('/rest/api/content/500/restriction',{method:'PUT',body:JSON.stringify([{operation:'update',restrictions:{user:[{type:'known',username:'AA12345'}],group:[]}}])});
 f.setActor('AA12345');const count=f.writes.length;
 const revised=await f.act('revise',{changes:{title:'Updated handover'}});assert.equal(W.currentVersion(revised.data.documents[0]).status,'Draft');
 assert.ok(f.writes.slice(count).some(w=>w[0]==='PUT'&&w[1]==='/rest/api/content/500/restriction'));
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'101');
});
test('failed restriction assignment never writes draft text or exposes a public page',async()=>{const f=fixture();f.flags.denyRestrict=true;await assert.rejects(f.act('create'),{code:'FORBIDDEN'});const p=f.pages.get('500');assert.match(p.body.storage.value,/being prepared/);assert.doesNotMatch(p.body.storage.value,/Check the source record/);assert.equal(f.states.size,0);});
test('failed state write resumes the original request without duplicating native page or audit',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.flags.failState=true;await assert.rejects(f.api.submit(c,s),/State upload failed/);const version=f.pages.get('500').version.number;const result=await f.api.submit(c,s);assert.equal(f.pages.size,5);assert.equal(f.pages.get('500').version.number,version);assert.equal(result.data.documents[0].audit.length,1);const again=await f.api.submit(c,s);assert.equal(again.data.documents[0].audit.length,1);});
test('unknown native write response resumes from operation marker',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.flags.failBodyAfter=true;await assert.rejects(f.api.submit(c,s),/response lost/);const version=f.pages.get('500').version.number;await f.api.submit(c,s);assert.equal(f.pages.get('500').version.number,version);});
test('invalid review transition does not poison the operation journal',async()=>{const f=fixture();await f.act('create');f.setActor('BB12345');await assert.rejects(f.act('approve',{nextReviewAt:'2027-01-01'}),/not allowed/);assert.equal(f.properties.get('500:'+SW.JOURNAL_KEY).value.done,true);});
test('stale native page version rejects editing before writes',async()=>{const f=fixture();await f.act('create');const s=await f.load(),c=await f.command('edit',s,{changes:{summary:'Changed summary.'}});f.pages.get('500').version.number++;const n=f.writes.length;await assert.rejects(f.api.submit(c,s),{code:'CONFLICT'});assert.equal(f.writes.length,n);});
test('revoked identity grants and account switch cannot reuse a loaded session',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.setActor('BB12345');await assert.rejects(f.api.submit(c,s),{code:'IDENTITY_MAPPING'});f.setActor('AA12345');f.policy.records[0].active=false;await assert.rejects(f.api.submit(c,s),{code:'FORBIDDEN'});assert.equal(f.writes.length,0);});
test('self review and malformed native destination fail without publication',async()=>{const f=fixture();f.fields.reviewerId=f.fields.authorId;await assert.rejects(f.act('create'),/cannot review/);assert.equal(f.writes.length,0);const g=fixture();await review(g);g.pages.get('101').ancestors=[{id:'999'}];await assert.rejects(g.act('approve',{nextReviewAt:'2027-10-01'}),{code:'PAGE_SCOPE'});assert.equal(g.pages.size,5);});
test('browser renderer keeps rich markdown/native code/tables consistent with server reference',async()=>{const f=fixture(),s=await f.act('create'),d=s.data.documents[0],v=W.currentVersion(d);v.bodyMarkdown='## Table\n\n| Field | Value |\n|---|---|\n| A | B |\n\n```js\nconst x = 1 < 2;\n```\n\n<script>alert(1)</script>';v.sections=require('./editor-content.js').toSections(v.bodyMarkdown);assert.equal(Renderer.renderStorage(d,v,s.data.people),ServerRenderer.renderStorage(d,v,s.data.people));assert.doesNotMatch(Renderer.renderStorage(d,v),/<script>/);assert.match(Renderer.renderStorage(d,v),/ac:name="code"/);});

test('Entitlements/Saved metadata load does not need a restricted working root',async()=>{const f=fixture();f.flags.unrestricted=true;const s=await f.api.load({catalog:f.catalog,skipDocuments:true});assert.equal(s.workspaceLoaded,false);assert.equal(s.canSubmit,false);assert.equal(s.actor.soeid,'AA12345');});
test('committed state with failed summary is recovered into the visible workspace',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.flags.failSummary=true;await assert.rejects(f.api.submit(c,s),/Summary write failed/);assert.equal((await f.load()).data.documents.length,0);const result=await f.api.submit(c,s);assert.equal(result.data.documents.length,1);assert.equal(result.data.documents[0].audit.length,1);});
test('pending JSON pointer reservation resumes with its original expected revision',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.flags.reserveState=true;await assert.rejects(f.api.submit(c,s),/Pending JSON upload/);assert.equal((await f.api.submit(c,s)).data.documents.length,1);});
test('native edits after an unknown reply cannot be mistaken for this committed operation',async()=>{const f=fixture(),s=await f.load(),c=await f.command('create',s);f.flags.failBodyAfter=true;await assert.rejects(f.api.submit(c,s));f.pages.get('500').version.number++;await assert.rejects(f.api.submit(c,s),{code:'CONFLICT'});assert.equal(f.states.size,0);});
test('publication removes stale managed labels while preserving native/user labels',async()=>{const f=fixture();f.flags.labels=['keep-this','wcs-tag-old','wcs-topic-legacy','wcs-region-old'];f.fields.tags=['Updated topic'];f.fields.processes=['Handover'];f.fields.regions=['EMEA'];await review(f);await f.act('approve',{nextReviewAt:'2027-10-01'});assert.ok(f.flags.labels.includes('keep-this'));for(const name of ['wcs-tag-updated-topic','wcs-process-handover','wcs-region-emea'])assert.ok(f.flags.labels.includes(name));assert.ok(!f.flags.labels.includes('wcs-tag-old'));assert.ok(!f.flags.labels.includes('wcs-topic-legacy'));});
test('editing and republishing preserves the published native page ID',async()=>{const f=fixture();await review(f);let s=await f.act('approve',{nextReviewAt:'2027-10-01'}),id=s.data.documents[0].publishedConfluencePageId;f.setActor('AA12345');await f.act('revise',{changes:{summary:'Revised summary.'}});await f.act('submit');f.setActor('BB12345');s=await f.load();const v=W.currentVersion(s.data.documents[0]);await f.act('complete-review',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(i=>[i.key,true])),findingDisposition:'clear',reason:'Reviewed revised wording.'}});s=await f.act('approve',{nextReviewAt:'2027-10-01'});assert.equal(s.data.documents[0].publishedConfluencePageId,id);assert.equal(f.pages.size,6);});
test('delete recovery requires native trashed evidence and retains working audit history',async()=>{const f=fixture();await review(f);await f.act('approve',{nextReviewAt:'2027-10-01'});const s=await f.load(),c=await f.command('delete',s);f.flags.failDeleteAfter=true;await assert.rejects(f.api.submit(c,s),/Delete reply lost/);const result=await f.api.submit(c,s);assert.ok(result.data.documents[0].deletedAt);assert.ok(f.pages.has('500'));assert.ok(f.trashed.has('501'));assert.equal(result.data.documents[0].audit.at(-1).action,'delete');});
test('images are staged and verified as native document attachments before publication',async()=>{const f=fixture();const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==';f.fields.assets=[{id:'diagram',src,alt:'A diagram'}];f.fields.bodyMarkdown+='\n\n![Diagram](attachment:diagram)';let s=await f.act('create');assert.equal(f.attachments.size,1);const d=s.data.documents[0];assert.match(W.currentVersion(d).assets[0].src,/^\/confluence\/download\/attachments\/500\//);assert.doesNotMatch(JSON.stringify(d),/data:image/);await f.act('submit');f.setActor('BB12345');s=await f.load();const v=W.currentVersion(s.data.documents[0]);await f.act('complete-review',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(i=>[i.key,true])),findingDisposition:'clear',reason:'Reviewed diagram and wording.'}});s=await f.act('approve',{nextReviewAt:'2027-10-01'});assert.equal(f.attachments.size,2);assert.match(f.pages.get(s.data.documents[0].publishedConfluencePageId).body.storage.value,/<ri:attachment/);});

test('Data Center without space.operations checks native space grants, never parent Edit or JSON alone',async()=>{const f=fixture();f.flags.noSpaceOperations=true;assert.equal((await f.api.capabilities()).canCreateDocument,true);f.pages.get('200').operations=ops(['read']);assert.equal((await f.api.capabilities()).canCreateDocument,true);f.flags.noSpaceOperations=false;f.flags.denyCreate=true;f.pages.get('200').operations=ops(['read','update']);assert.equal((await f.api.capabilities()).canCreateDocument,false);});


test('fully revoked manager cannot approve using a retained directory role',async()=>{const f=fixture();await review(f);const s=await f.load(),c=await f.command('approve',s,{nextReviewAt:'2027-10-01'});f.policy.records[1].active=false;const n=f.writes.length;await assert.rejects(f.api.submit(c,s),{code:'FORBIDDEN'});assert.equal(f.writes.length,n);assert.equal((await f.load()).actor.role,'Reader');});
test('mutated pinned media is rejected before workflow body writes',async()=>{const f=fixture();f.fields.assets=[{id:'diagram',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==',alt:'A diagram'}];f.fields.bodyMarkdown+='\n\n![Diagram](attachment:diagram)';await f.act('create');const a=Array.from(f.attachments.values())[0];a.bytes=new Uint8Array(a.bytes);a.bytes[0]^=1;const before=f.pages.get('500').version.number;await assert.rejects(f.act('submit'),{code:'INTEGRITY'});assert.equal(f.pages.get('500').version.number,before);});

test('attachment identity, positive native version and pagination must be verified before body insertion',async()=>{
  for(const invalid of ['container','version','type','pagination']){
    const f=fixture();f.fields.assets=[{id:'diagram',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==',alt:'A diagram'}];f.fields.bodyMarkdown+='\n\n![Diagram](attachment:diagram)';
    const original=f.storage.request;
    f.storage.request=async function(path,o={}){
      if(path.includes('/child/attachment?')&&(!o.method||o.method==='GET')){
        const title=new URL(path,'https://example.test').searchParams.get('filename'),a={id:'900',type:'attachment',title,container:{type:'page',id:'500'},version:{number:1}};
        if(invalid==='container')delete a.container;if(invalid==='version')a.version.number=0;if(invalid==='type')a.type='page';
        return {results:[a],_links:invalid==='pagination'?{next:'?start=1'}:{}};
      }
      return original(path,o);
    };
    await assert.rejects(f.act('create'),{code:invalid==='pagination'?'INVALID_RESPONSE':'UNKNOWN_COMMIT'});
    assert.equal(f.pages.get('500').version.number,1);assert.equal(f.states.size,0);
  }
});

 test('workspace reads remain available when privacy setup is missing; mutations still fail before writes',async()=>{
  const f=fixture();await f.act('create');f.flags.unrestricted=true;
  const s=await f.load();assert.equal(s.data.documents.length,1);assert.equal(s.canSubmit,false);assert.equal(s.documentPermissions[s.data.documents[0].id].edit,false);
  assert.match(s.creationMessage,/Working page/);const cap=await f.api.capabilities();assert.equal(cap.canCreateDocument,false);assert.match(cap.reason,/Sync access in Entitlements/);assert.match(cap.reason,/View only on Working, not Edit/);
  const writes=f.writes.length;await assert.rejects(f.act('edit',{changes:{summary:'Must not save'}}),{code:'WORKING_ROOT_UNRESTRICTED'});assert.equal(f.writes.length,writes);
 });
 test('native viewing restrictions on a verified Working ancestor permit the existing private draft workflow',async()=>{
  const f=fixture();f.flags.unrestricted=true;f.flags.inheritedAt='100';f.pages.get('200').ancestors=[{id:'100'}];
  assert.equal((await f.api.capabilities()).canCreateDocument,true);assert.equal((await f.act('create')).data.documents.length,1);
 });

test('unverifiable native restrictions allow workspace reads but never enable writes',async()=>{
 const f=fixture();await f.act('create');f.flags.denyReadRestrictions=true;
 const session=await f.load();assert.equal(session.data.documents.length,1);assert.equal(session.canSubmit,false);
 assert.match((await f.api.capabilities()).reason,/could not verify/);const count=f.writes.length;
 await assert.rejects(f.act('create'),{code:'FORBIDDEN'});assert.equal(f.writes.length,count);
});

test('workspace recovers a child-list HTTP 500 with space and direct-parent scoped CQL and hydrates matching drafts',async()=>{
 const f=fixture();await f.act('create');const request=f.storage.request,page=f.storage.page,queries=[],hydrated=[];
 f.storage.request=async(path,options)=>{
  const u=new URL(path,'https://example.test');
  if(u.pathname==='/rest/api/content/200/child/page'){assert.equal(u.searchParams.get('expand'),'space,ancestors,version,operations');const e=Error('Collection failed');e.status=500;throw e;}
  if(u.pathname==='/rest/api/content/search'){
   queries.push(u);assert.equal(u.searchParams.get('cql'),'type = page AND space = "wcspedia" AND parent = 200 ORDER BY id ASC');
   return {results:Array.from(f.pages.values()).filter(p=>p.ancestors.at(-1)?.id==='200').map(p=>{const copy=clone(p);delete copy.body;return copy;}),_links:{}};
  }
  return request(path,options);
 };
 f.storage.page=async(id,...args)=>{hydrated.push(id);return page(id,...args);};
 const loaded=await f.load();assert.equal(loaded.data.documents.length,1);assert.equal(loaded.canSubmit,true);assert.equal(queries.length,1);assert.ok(hydrated.includes('500'));
});

test('creation capability does not depend on listing Working children or their content bodies',async()=>{
 const f=fixture(),request=f.storage.request,page=f.storage.page;
 f.storage.page=async(id,expand,...args)=>{assert.doesNotMatch(expand,/body|history|metadata/);return page(id,expand,...args);};
 f.storage.request=async(path,options)=>{assert.doesNotMatch(path,/child\/page|content\/search/);return request(path,options);};
 assert.equal((await f.api.capabilities()).canCreateDocument,true);
});

for(const status of [401,403,404])test('workspace never falls back around native listing HTTP '+status,async()=>{
 const f=fixture(),request=f.storage.request;let searches=0;
 f.storage.request=async(path,options)=>{if(path.includes('/child/page')){const e=Error('Denied or missing');e.status=status;throw e;}if(path.startsWith('/rest/api/content/search'))searches++;return request(path,options);};
 await assert.rejects(f.load(),e=>e.status===status);assert.equal(searches,0);
});

test('workspace CQL fallback rejects a result outside its verified Working parent',async()=>{
 const f=fixture(),request=f.storage.request;
 f.storage.request=async(path,options)=>{if(path.includes('/child/page')){const e=Error('Collection failed');e.status=500;throw e;}if(path.startsWith('/rest/api/content/search'))return {results:[clone(f.pages.get('101'))]};return request(path,options);};
 await assert.rejects(f.load(),{code:'PAGE_SCOPE'});
});

test('workspace CQL fallback paginates without following returned next URLs or repeating failed endpoint',async()=>{
 const f=fixture(),request=f.storage.request;let attempts=0,offsets=[];
 f.storage.request=async(path,options)=>{
  if(path.startsWith('/rest/api/content/200/child/page')){attempts++;const e=Error('Collection failed');e.status=500;throw e;}
  if(path.startsWith('/rest/api/content/search')){const u=new URL(path,'https://example.test'),start=Number(u.searchParams.get('start'));offsets.push(start);assert.match(u.searchParams.get('cql'),/space = "wcspedia" AND parent = 200/);return {results:[{...clone(f.pages.get('200')),id:String(500+start),ancestors:[{id:'200'}]}],_links:start===0?{next:'https://untrusted.test/next'}:{}};}
  return request(path,options);
 };
 assert.equal((await f.load()).data.documents.length,0);assert.equal(attempts,1);assert.deepEqual(offsets,[0,1]);
});

test('failed fallback remains an error rather than claiming that the workspace is empty',async()=>{
 const f=fixture(),request=f.storage.request;let attempts=0;
 f.storage.request=async(path,options)=>{if(path.includes('/child/page')||path.startsWith('/rest/api/content/search')){attempts++;const e=Error('Server unavailable');e.status=503;throw e;}return request(path,options);};
 await assert.rejects(f.load(),e=>e.status===503);assert.equal(attempts,4,'Each independent parent tries its scoped fallback once');
});

// Model the storage normalization performed by Confluence, including macro IDs.
function normalizeAnchors(f){
  const original=f.storage.request;
  f.storage.request=async function(path,options){
    const result=await original(path,options);
    function normalize(p){if(p?.body?.storage)p.body.storage.value=p.body.storage.value.replace(/<ac:structured-macro ac:name="anchor" ac:schema-version="1">/g,"<ac:structured-macro ac:macro-id='native-generated-id' ac:schema-version='1' ac:name='anchor'>").replace(/<ac:parameter ac:name="">/g,"<ac:parameter ac:name=''>");}
    for(const p of f.pages.values())normalize(p);
    normalize(result);for(const p of result?.results||[])normalize(p);
    return result;
  };
}
test('normalized native anchors survive create, review and publication',async()=>{
  const f=fixture();normalizeAnchors(f);await review(f);
  const result=await f.act('approve',{nextReviewAt:'2027-10-01'});
  assert.equal(W.currentVersion(result.data.documents[0]).status,'Published');
  assert.ok(f.pages.has(result.data.documents[0].publishedConfluencePageId));
});
test('normalized draft seed resumes a failed save without duplicate pages or audit',async()=>{
  const f=fixture();normalizeAnchors(f);const session=await f.load(),command=await f.command('create',session);
  f.flags.failBody=true;await assert.rejects(f.api.submit(command,session),/Native body failed/);
  const result=await f.api.submit(command,session);
  assert.equal(f.pages.size,5);assert.equal(result.data.documents[0].audit.length,1);
});
test('normalized operation anchor recovers an unknown commit without rewriting content',async()=>{
  const f=fixture();normalizeAnchors(f);const session=await f.load(),command=await f.command('create',session);
  f.flags.failBodyAfter=true;await assert.rejects(f.api.submit(command,session),/response lost/);
  const version=f.pages.get('500').version.number;
  await f.api.submit(command,session);assert.equal(f.pages.get('500').version.number,version);
});
test('title lookup hydrates an omitted body before verifying the existing seed',async()=>{
  const f=fixture();const session=await f.load(),command=await f.command('create',session);
  f.flags.failBody=true;await assert.rejects(f.api.submit(command,session));
  const request=f.storage.request;
  f.storage.request=async function(path,options){const result=await request(path,options);if(path.startsWith('/rest/api/content?'))for(const p of result.results)delete p.body;return result;};
  assert.equal((await f.api.submit(command,session)).data.documents.length,1);
});
test('text, code, comments and nested macros cannot impersonate working identity',async()=>{
  for(const wrap of [s=>'<p>'+s.replace(/</g,'&lt;')+'</p>',s=>'<!--'+s+'-->',s=>'<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA['+s+']]></ac:plain-text-body></ac:structured-macro>',s=>'<ac:structured-macro ac:name="other"><ac:rich-text-body>'+s+'</ac:rich-text-body></ac:structured-macro>']){
    const f=fixture(),session=await f.load(),command=await f.command('create',session);
    f.flags.failBody=true;await assert.rejects(f.api.submit(command,session));
    f.pages.get('500').body.storage.value=wrap(f.pages.get('500').body.storage.value);
    const writes=f.writes.length;
    await assert.rejects(f.api.submit(command,session),/title is already used/);
    assert.equal(f.writes.length,writes);
  }
});

test('direct blog publishes to Insights with no reviewer, approver or approval events',async()=>{
  const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null,commentsEnabled:false});delete f.fields.governance;
  f.policy.records=f.policy.records.filter(r=>r.soeid==='AA12345');
  let s=await f.act('create'),d=s.data.documents[0],v=W.currentVersion(d);
  require('./confluence.js').validateData(s.data);
  assert.equal(v.status,'Published');assert.equal(d.reviewerId,null);assert.equal(d.approverId,null);
  assert.equal(v.approvedBy,null);assert.equal(v.reviewedBy,null);assert.ok(v.publishedAt);
  assert.deepEqual(d.audit.map(e=>e.action),['create']);assert.equal(d.audit[0].toStatus,'Published');
  assert.equal(f.pages.get(d.publishedConfluencePageId).ancestors.at(-1).id,'102');
  assert.doesNotMatch(f.pages.get(d.publishedConfluencePageId).body.storage.value,/Approved by|Reviewed by/);
  assert.match(f.pages.get(d.publishedConfluencePageId).body.storage.value,/Published by/);
  assert.equal(v.commentsEnabled,false);
  const id=d.publishedConfluencePageId;s=await f.act('revise',{changes:{summary:'Updated blog summary.'}});d=s.data.documents[0];
  assert.equal(W.currentVersion(d).status,'Published');assert.equal(d.publishedConfluencePageId,id);assert.equal(f.pages.get(id).ancestors.at(-1).id,'102');
});
test('direct blog mode cannot bypass approvals for documents or choose a business destination',async()=>{
  for(const fields of [{type:'Procedure',area:'insights'},{type:'Blog',area:'credit-approval-control'}]){
    const f=fixture();Object.assign(f.fields,fields,{publicationMode:'direct-blog',reviewerId:null,approverId:null});
    await assert.rejects(f.act('create'));assert.equal(f.writes.length,0);
  }
});
test('direct blog lost save response recovers without duplicate publication',async()=>{
  const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
  const s=await f.load(),command=await f.command('create',s);f.flags.failState=true;
  await assert.rejects(f.api.submit(command,s));const count=f.pages.size;
  const result=await f.api.submit(command,s);assert.equal(f.pages.size,count);assert.equal(result.data.documents[0].audit.length,1);
});
test('save reuses its verified preflight when rebuilding the workspace response',async()=>{
  const f=fixture(),session=await f.load(),command=await f.command('create',session);let rootReads=0;
  const getPage=f.storage.page;f.storage.page=async function(id,...args){if(id==='100')rootReads++;return getPage(id,...args);};
  await f.api.submit(command,session);assert.equal(rootReads,1,'one current-action root preflight, not another after write');
});

test('new editor verifies permissions without listing or downloading working documents',async()=>{
  const f=fixture();await f.act('create');let listings=0,reads=0;
  const request=f.storage.request,read=f.storage.readJSON;
  f.storage.request=async function(path,...args){if(path.includes('/child/page'))listings++;return request(path,...args);};
  f.storage.readJSON=async function(...args){reads++;return read(...args);};
  const s=await f.api.load({workspaceScope:'create'});
  assert.equal(s.workspaceScope,'create');assert.equal(s.workspaceLoaded,true);assert.equal(s.canSubmit,true);
  assert.equal(s.data.documents.length,0);assert.equal(listings,0);assert.equal(reads,0);
  f.flags.denyCreate=true;assert.equal((await f.api.load({workspaceScope:'create'})).effectivePermissions['content.create'],false);
});
test('targeted document and post-save confirmation do not enumerate unrelated working pages',async()=>{
  const f=fixture();await f.act('create');let listings=0,reads=[];
  const request=f.storage.request,read=f.storage.readJSON;
  f.storage.request=async function(path,...args){if(path.includes('/child/page')){listings++;throw Error('Unrelated listing unavailable');}return request(path,...args);};
  f.storage.readJSON=async function(id,...args){reads.push(id);return read(id,...args);};
  const s=await f.api.load({workspaceScope:'document:'+f.fields.id});
  assert.equal(s.data.documents.length,1);assert.deepEqual(reads,['500']);
  const result=await f.api.submit(await f.command('edit',s,{changes:{summary:'Only this document changes.'}}),s);
  assert.equal(listings,0);assert.ok(reads.every(id=>id==='500'));assert.equal(result.workspaceScope,'document:'+f.fields.id);
  assert.equal(W.currentVersion(result.data.documents[0]).summary,'Only this document changes.');
});
test('workspace summaries exclude unrelated full histories before hydration',async()=>{
  const f=fixture();await f.act('create');let reads=0;const read=f.storage.readJSON;
  f.storage.readJSON=async function(...args){reads++;return read(...args);};
  // Manager is assigned as reviewer, not owner; neither view needs this draft.
  f.setActor('BB12345');
  assert.equal((await f.api.load({workspaceScope:'mine'})).data.documents.length,0);
  assert.equal((await f.api.load({workspaceScope:'review'})).data.documents.length,0);assert.equal(reads,0);
  f.setActor('AA12345');await f.act('submit');f.setActor('BB12345');reads=0;
  const s=await f.api.load({workspaceScope:'review'});assert.equal(s.data.documents.length,1);assert.equal(reads,1);
  assert.equal(W.currentVersion(s.data.documents[0]).status,'In review');
});
test('targeted detail still rejects a moved native page and invalid scope',async()=>{
  const f=fixture();await f.act('create');f.pages.get('500').ancestors=[{id:'101'}];
  await assert.rejects(f.api.load({workspaceScope:'document:'+f.fields.id}),{code:'PAGE_SCOPE'});
  await assert.rejects(f.api.load({workspaceScope:'document:../escape'}),{code:'CONFIGURATION'});
});

test('20-document fixture downloads only the manager-owned history for My Workspace',async()=>{
  const f=fixture();await f.act('create');const basePage=f.pages.get('500'),baseState=f.states.get('500');
  for(let i=0;i<19;i++){
    const id=String(600+i),documentKey='doc-seed-'+i,p=clone(basePage),state=clone(baseState),d=state.data.document;
    p.id=id;p.title='WCSpedia working '+documentKey;p.body.storage.value=p.body.storage.value.replaceAll(d.id,documentKey);
    d.id=documentKey;d.confluencePageId=id;if(i===0)d.ownerId='wcs-user-bb12345';
    f.pages.set(id,p);f.states.set(id,state);
    f.properties.set(id+':wcspedia-workflow-summary',{value:{schemaVersion:1,documentKey,people:[d.ownerId,d.authorId,d.reviewerId,d.approverId],status:'Draft'},version:{number:1}});
  }
  f.setActor('BB12345');let reads=0;const read=f.storage.readJSON;f.storage.readJSON=async function(...args){reads++;return read(...args);};
  assert.equal((await f.api.load({workspaceScope:'all'})).data.documents.length,20);assert.equal(reads,20);
  reads=0;const mine=await f.api.load({workspaceScope:'mine'});assert.equal(mine.data.documents.length,1);assert.equal(reads,1);
  require('./confluence.js').validateData(mine.data);
});

for (const type of require('./editor-content.js').INSIGHT_TYPES) {
  test(type+' publishes and edits without restriction-write permission or manager accounts',async()=>{
    const f=fixture();Object.assign(f.fields,{type,area:'insights',publicationMode:type==='Blog'?'direct-blog':'direct-insight',reviewerId:null,approverId:null});delete f.fields.governance;
    f.policy.records=f.policy.records.filter(r=>r.soeid==='AA12345');f.flags.denyRestrict=true;
    const original=f.storage.request;
    f.storage.request=async(path,opts)=>{assert.ok(!path.startsWith('/rest/api/user?'),'Direct publishing does not look up workflow assignees');return original(path,opts);};
    let s=await f.act('create'),d=s.data.documents[0],id=d.publishedConfluencePageId;
    assert.equal(W.currentVersion(d).status,'Published');assert.equal(f.pages.get(id).ancestors.at(-1).id,'102');
    assert.deepEqual(d.audit.map(e=>e.action),['create']);assert.equal(d.approverId,null);assert.equal(d.reviewerId,null);
    require('./confluence.js').validateData(s.data);
    s=await f.act('revise',{changes:{summary:'An updated Insights article.'}});d=s.data.documents[0];
    assert.equal(d.publishedConfluencePageId,id);assert.equal(d.publishedVersion,2);assert.equal(d.versions[0].summary,'Learning guidance.');
    await assert.rejects(f.act('submit'),{code:'INVALID_ACTION'});
    assert.equal(f.writes.filter(w=>w[1].endsWith('/restriction')).length,0);
  });
}
test('Job aid cannot opt into direct publication or choose Insights as a destination',async()=>{
  for(const publicationMode of ['direct-insight','direct-blog']){
    const f=fixture();Object.assign(f.fields,{area:'insights',publicationMode,reviewerId:null,approverId:null});
    await assert.rejects(f.act('create'));assert.equal(f.writes.length,0);
  }
});

test('Insights resumes a prepared working page from the old restriction stage without duplicate creation',async()=>{
 const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
 const session=await f.load(),command=await f.command('create',session),original=f.storage.putProperty;let stop=true;
 await f.storage.request('/rest/api/content',{method:'POST',body:JSON.stringify({title:'WCSpedia working '+f.fields.id,ancestors:[{id:'200'}],body:{storage:{value:['wcs-document-'+f.fields.id,'wcs-created-'+command.requestId,'wcs-kind-working'].map(v=>'<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">'+v+'</ac:parameter></ac:structured-macro>').join('')}}})});
 f.storage.putProperty=async(...args)=>{
  const result=await original(...args);
  if(stop&&args[1]===SW.JOURNAL_KEY&&args[2].stage==='reserved')throw Error('Old save stopped before restricting the working page');
  return result;
 };
 await assert.rejects(f.api.submit(command,session),/Old save stopped/);
 assert.equal(f.pages.get('500').version.number,1);assert.equal(f.properties.get('500:'+SW.JOURNAL_KEY).value.done,false);
 stop=false;f.flags.denyRestrict=true;
 const saved=await f.api.submit(command,session),doc=saved.data.documents[0];
 assert.equal(doc.confluencePageId,'500');assert.equal(W.currentVersion(doc).status,'Published');
 assert.equal(f.pages.get(doc.publishedConfluencePageId).ancestors.at(-1).id,'102');
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,2);
 assert.equal(f.writes.filter(w=>w[1].endsWith('/restriction')).length,0);
});

test('direct Insights publishing still requires native update permission on the new publication',async()=>{
 const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
 const original=f.storage.page;
 f.storage.page=async(id,...args)=>{const p=await original(id,...args);if(id==='500')p.operations=ops(['read']);return p;};
 await assert.rejects(f.act('create'),{code:'FORBIDDEN'});
 assert.equal(f.pages.get('500').ancestors.at(-1).id,'102');assert.match(f.pages.get('500').body.storage.value,/being prepared/);
});

test('Insights preserves existing native restrictions and rejects an editor whose published-page access was revoked',async()=>{
 const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
 const s=await f.act('create'),published=s.data.documents[0].publishedConfluencePageId;
 f.pages.get(published).operations=ops(['read']);
 const before=f.pages.get(published).version.number;
 await assert.rejects(f.act('revise',{changes:{summary:'Must not publish'}}),{code:'FORBIDDEN'});
 assert.equal(f.pages.get(published).version.number,before);
 assert.equal(f.writes.filter(w=>w[1].includes('/restriction')).length,0);
});
test('explicit legacy Guide save moves its existing page to Insights and recovers a lost state write',async()=>{
  const f=fixture();await review(f);let s=await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
  const id=s.data.documents[0].publishedConfluencePageId;
  // A previously approved non-Job-aid snapshot from the old publishing policy.
  f.states.get('500').data.document.type='Guide';f.setActor('AA12345');
  s=await f.load();const previous=clone(s.data.documents[0]),command=await f.command('revise',s,{changes:{summary:'Updated for Insights.'}});
  f.flags.failState=true;await assert.rejects(f.api.submit(command,s),/State upload failed/);
  const result=await f.api.submit(command,s),d=result.data.documents[0];
  assert.equal(d.publishedConfluencePageId,id);assert.equal(f.pages.get(id).ancestors.at(-1).id,'102');assert.equal(d.publicationMode,'direct-insight');
  assert.deepEqual(d.versions[0],previous.versions[0]);assert.deepEqual(d.audit.slice(0,-1),previous.audit);
  const changes=d.audit.at(-1).changes;assert.ok(changes.some(c=>c.field==='area'&&c.before==='credit-approval-control'&&c.after==='insights'));
  assert.ok(changes.some(c=>c.field==='reviewerId'&&c.after===null));assert.equal(f.pages.size,6);
});
test('legacy Insights migration rejects a page moved outside its recorded destination',async()=>{
  const f=fixture();await review(f);let s=await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
  const id=s.data.documents[0].publishedConfluencePageId;f.states.get('500').data.document.type='Guide';
  f.pages.get(id).ancestors=[{id:'999'}];f.setActor('AA12345');
  await assert.rejects(f.act('revise',{changes:{summary:'Updated for Insights.'}}),{code:'PAGE_SCOPE'});
  assert.equal(f.pages.get(id).ancestors.at(-1).id,'999');
});


test('minimal native POST response is hydrated before checking edit permission for a direct blog',async()=>{
  const f=fixture();f.flags.minimalCreateResponse=true;
  Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});delete f.fields.governance;
  const original=f.storage.page,reads=[];f.storage.page=async(id,expand,options)=>{reads.push({id,expand});return original(id,expand,options);};
  const first=await f.act('create'),doc=first.data.documents[0],publishedId=doc.publishedConfluencePageId;
  assert.equal(W.currentVersion(doc).status,'Published');assert.equal(f.pages.get(publishedId).ancestors.at(-1).id,'102');
  assert.ok(reads.some(r=>r.id===doc.confluencePageId&&r.expand.includes('operations')&&r.expand.includes('body.storage')));
  const revised=await f.act('revise',{changes:{summary:'Update the existing blog.'}});
  assert.equal(revised.data.documents[0].publishedConfluencePageId,publishedId);
  assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1,'One Insights article; edits reuse it');
});

test('fresh native denial still blocks a minimal create response without writing state or publication',async()=>{
  const f=fixture();f.flags.minimalCreateResponse=true;f.flags.createdReadOnly=true;
  await assert.rejects(f.act('create'),error=>error.code==='FORBIDDEN'&&error.message.includes('500'));
  assert.equal(f.states.size,0);assert.equal(f.properties.size,0);assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});

test('missing permissions on the expanded GET is distinguished from explicit native denial',async()=>{
  const f=fixture();f.flags.minimalCreateResponse=true;f.flags.createdMissingPermissions=true;
  await assert.rejects(f.act('create'),error=>error.code==='INVALID_PERMISSIONS'&&error.message.includes('500'));
  assert.equal(f.states.size,0);assert.equal(f.properties.size,0);
});

test('retry after a lost post-create read reuses the exact seed and request instead of duplicating it',async()=>{
  const f=fixture();f.flags.minimalCreateResponse=true;
  const session=await f.load(),command=await f.command('create',session),original=f.storage.page;let failed=false;
  f.storage.page=async(id,...args)=>{if(id==='500'&&!failed){failed=true;throw Object.assign(Error('Network disconnected after create'),{code:'NETWORK'});}return original(id,...args);};
  await assert.rejects(f.api.submit(command,session),{code:'NETWORK'});
  const recovered=await f.api.submit(command,session);assert.equal(recovered.data.documents[0].confluencePageId,'500');
  assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});

test('strict native read/update validation accepts automatic drafts and space-readable publication',async()=>{
 const f=fixture(),original=f.storage.request;
 f.storage.request=async(path,options={})=>{
  if(options.method==='PUT'&&path.endsWith('/restriction')){
   const payload=JSON.parse(options.body),read=payload.find(r=>r.operation==='read'),update=payload.find(r=>r.operation==='update');
   if(read&&update){
    for(const user of update.restrictions.user)assert.ok(read.restrictions.user.some(r=>r.username===user.username),"'update' restrictions requires 'read' restrictions for same user/group");
   }
  }
  return original(path,options);
 };
 await review(f);
 const draftRead=await f.storage.request('/rest/api/content/500/restriction/byOperation/read');
 assert.deepEqual(draftRead.restrictions.user.results.map(u=>u.username).sort(),['AA12345','BB12345']);
 await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 const pubRead=await f.storage.request('/rest/api/content/501/restriction/byOperation/read'),pubEdit=await f.storage.request('/rest/api/content/501/restriction/byOperation/update');
 assert.deepEqual(pubRead.restrictions.user.results,[]);assert.deepEqual(pubRead.restrictions.group.results,[]);
 assert.deepEqual(pubEdit.restrictions.user.results.map(u=>u.username),['BB12345']);
});
test('paired draft update preserves additional native viewers and viewing groups',async()=>{
 const f=fixture();
 await f.storage.request('/rest/api/content/500/restriction',{method:'PUT',body:JSON.stringify([{operation:'read',restrictions:{user:[{type:'known',username:'CC12345'}],group:[{name:'existing-review-observers'}]}}])});
 await f.act('create');const read=await f.storage.request('/rest/api/content/500/restriction/byOperation/read');
 assert.deepEqual(read.restrictions.user.results.map(u=>u.username).sort(),['AA12345','BB12345','CC12345']);
 assert.deepEqual(read.restrictions.group.results,[{name:'existing-review-observers'}]);
});
test('publishing a revision preserves existing published viewing restrictions',async()=>{
 const f=fixture();await review(f);await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 await f.storage.request('/rest/api/content/501/restriction',{method:'PUT',body:JSON.stringify([{operation:'read',restrictions:{user:[{type:'known',username:'BB12345'},{type:'known',username:'CC12345'}],group:[{name:'existing-readers'}]}}])});
 f.setActor('AA12345');await f.act('revise',{changes:{title:'Revised handover'}});await f.act('submit');f.setActor('BB12345');
 const session=await f.load(),v=W.currentVersion(session.data.documents[0]);
 await f.act('complete-review',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(i=>[i.key,true])),findingDisposition:'clear',reason:'Reviewed revision.'}});
 await f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});
 const read=await f.storage.request('/rest/api/content/501/restriction/byOperation/read');
 assert.deepEqual(read.restrictions.user.results.map(u=>u.username).sort(),['BB12345','CC12345']);assert.deepEqual(read.restrictions.group.results,[{name:'existing-readers'}]);
});
test('server rejection of paired first-publication permissions never moves content out of Working',async()=>{
 const f=fixture(),original=f.storage.request;await review(f);
 f.storage.request=async(path,options={})=>{if(path==='/rest/api/content/501/restriction'&&options.method==='PUT')throw Object.assign(Error("'update' restrictions requires 'read' restrictions for same user/group"),{status:400,code:'CONFLUENCE_HTTP'});return original(path,options);};
 await assert.rejects(f.act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)}),e=>e.status===400&&e.recoverable);
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'200');assert.match(f.pages.get('501').body.storage.value,/being prepared/);
 assert.equal(W.currentVersion(f.states.get('500').data.document).status,'Awaiting approval');
});

test('publication adds native styling and reader labels alongside existing discovery labels',async()=>{
 const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
 const s=await f.act('create'),doc=s.data.documents[0];
 for(const name of ['wcs-published','wcs-area-insights','wcs-reader','hide-title','hide-comments','hide-actions','hide-footer'])assert.ok(f.flags.labels.includes(name),name);
 assert.match(f.pages.get(doc.publishedConfluencePageId).body.storage.value,/id="wcs-published-reader"/);
});

test('publishing builds only the article snapshot and never copies the Insights parent HTML',async()=>{
 const f=fixture();f.pages.get('102').body.storage.value='<ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<div id="wcspedia">PARENT_LAUNCHER</div><script>citiStyleAdd("hide-sidebar")</script>]]></ac:plain-text-body></ac:structured-macro>';
 Object.assign(f.fields,{type:'Report',area:'insights',publicationMode:'direct-insight',reviewerId:null,approverId:null});
 // Derive the supported publication mode rather than imposing a new contract.
 f.fields.publicationMode=require('./editor-content.js').publicationModeFor('Report');
 const s=await f.act('create'),p=f.pages.get(s.data.documents[0].publishedConfluencePageId);
 assert.equal(p.ancestors[0].id,'102');assert.match(p.body.storage.value,/wcs-native-article-layout/);
 assert.doesNotMatch(p.body.storage.value,/PARENT_LAUNCHER|citiStyleAdd|hide-sidebar|id="wcspedia"/);
});

function severalMedia(f){
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==','base64');
  f.fields.assets=Array.from({length:5},(_,i)=>({id:'figure'+i,src:'data:image/png;base64,'+Buffer.concat([png,Buffer.from([i])]).toString('base64'),alt:'Figure '+i}));
  f.fields.bodyMarkdown+='\n\n'+f.fields.assets.map(a=>'!['+a.alt+'](attachment:'+a.id+')').join('\n\n');
}
test('independent media uploads overlap with a three-transfer ceiling and verified bytes',async()=>{
  const f=fixture();severalMedia(f);const original=f.storage.request;
  let active=0,maximum=0;
  f.storage.request=async(path,options={})=>{
    if(options.method==='POST'&&path.endsWith('/child/attachment')){
      active++;maximum=Math.max(maximum,active);
      try{await new Promise(resolve=>setTimeout(resolve,15));return await original(path,options);}finally{active--;}
    }
    return original(path,options);
  };
  const result=await f.act('create');
  assert.equal(maximum,3);assert.equal(active,0);assert.equal(f.attachments.size,5);
  assert.equal(Object.keys(f.states.get(result.data.documents[0].confluencePageId).data.media).length,5);
});
test('media failure drains started uploads before recovery and stops queued uploads',async()=>{
  const f=fixture();severalMedia(f);const original=f.storage.request;
  let active=0,started=0;
  f.storage.request=async(path,options={})=>{
    if(options.method==='POST'&&path.endsWith('/child/attachment')){
      const index=++started;active++;
      try{if(index===1)throw Error('Upload unavailable');await new Promise(resolve=>setTimeout(resolve,25));return await original(path,options);}finally{active--;}
    }
    return original(path,options);
  };
  await assert.rejects(f.act('create'),/Upload unavailable/);
  assert.equal(active,0);assert.equal(started,3);assert.equal(f.pages.get('500').version.number,1);
  assert.equal(f.states.size,0,'No successful workflow state before the failed transfer is reconciled');
});

test('native owner transfer records both people, refreshes published metadata and preserves the author',async()=>{
 const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});
 await f.act('create');const before=(await f.load()).data.documents[0];
 const result=await f.act('reassign-owner',{ownerId:'wcs-user-bb12345'}),doc=result.data.documents[0];
 assert.equal(doc.ownerId,'wcs-user-bb12345');assert.equal(doc.authorId,before.authorId);assert.deepEqual(doc.versions,before.versions);
 assert.equal(doc.audit.at(-1).action,'reassign-owner');assert.equal(doc.publishedConfluencePageVersion,before.publishedConfluencePageVersion+1);
 assert.ok(f.states.get(doc.confluencePageId).data.people.some(p=>p.id===doc.ownerId));
 f.pages.get(doc.confluencePageId).operations=ops(['read']);
 await assert.rejects(f.act('reassign-owner',{ownerId:before.ownerId}),/does not permit|not allowed/);
});

test('owner reassignment during a new Job aid draft does not publish unapproved content',async()=>{
 const f=fixture();await review(f);await f.act('approve',{nextReviewAt:'2027-10-01'});f.setActor('AA12345');
 await f.act('revise',{changes:{title:'PRIVATE NEXT DRAFT',bodyMarkdown:'This draft must remain private.'}});
 f.setActor('BB12345');const result=await f.act('reassign-owner',{ownerId:'wcs-user-bb12345'}),doc=result.data.documents[0],published=f.pages.get(doc.publishedConfluencePageId);
 assert.equal(W.currentVersion(doc).status,'Draft');assert.equal(doc.publishedVersion,1);assert.equal(W.currentVersion(doc).title,'PRIVATE NEXT DRAFT');
 assert.doesNotMatch(published.body.storage.value,/PRIVATE NEXT DRAFT|This draft must remain private/);assert.match(published.body.storage.value,/Handover/);
});

test('reviewer workspace and actions work without Working-root editing',async()=>{const f=fixture();await f.act('create');await f.act('submit');f.setActor('BB12345');f.pages.get('200').operations=ops(['read']);const session=await f.api.load({catalog:f.catalog,workspaceScope:'review'});assert.equal(session.data.documents.length,1);assert.equal(session.canSubmit,true);const result=await f.act('complete-review');assert.equal(W.currentVersion(result.data.documents[0]).status,'Awaiting approval');});

function directFixture(){const f=fixture();Object.assign(f.fields,{type:'Blog',area:'insights',publicationMode:'direct-blog',reviewerId:null,approverId:null});return f;}
function reopen(f){return SW.create(f.config,{storage:f.storage,crypto:webcrypto,origin:'https://example.test',loadPolicy:async()=>clone(f.policy)});}
test('new Insights uses exactly one native article and stores only published snapshots',async()=>{
 const f=directFixture();f.fields.changeSummary='PRIVATE DRAFT NOTE';await f.act('create');
 let s=await f.act('revise',{changes:{summary:'Fresh public summary.'},comment:'PRIVATE EDIT NOTE'});const d=s.data.documents[0];
 assert.equal(d.singlePageInsight,true);assert.equal(d.confluencePageId,d.publishedConfluencePageId);
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
 assert.ok([...f.pages.values()].every(p=>p.ancestors.at(-1)?.id!=='200'));
 assert.ok(d.versions.every(v=>v.status==='Published'));assert.doesNotMatch(JSON.stringify([...f.states.values()]),/PRIVATE DRAFT NOTE|PRIVATE EDIT NOTE|versionSnapshot/);
 const restored=await reopen(f).load({catalog:f.catalog,workspaceScope:'document:'+d.id});
 assert.equal(restored.data.documents.length,1);assert.equal(restored.data.documents[0].id,d.id);
 assert.equal((await reopen(f).load({catalog:f.catalog,workspaceScope:'mine'})).data.documents.length,1);
 assert.equal((await reopen(f).load({catalog:f.catalog,workspaceScope:'review'})).data.documents.length,0);
 require('./confluence.js').validateData(restored.data);
});
for(const flag of ['failBody','failBodyAfter','failSummary','failState','failStateAfter','reserveState'])test('one-page Insights creation recovers across reload after '+flag,async()=>{
 const f=directFixture(),session=await f.load(),command=await f.command('create',session);f.flags[flag]=true;
 await assert.rejects(f.api.submit(command,session));const result=await reopen(f).submit(command,session),d=result.data.documents[0];
 assert.equal(d.confluencePageId,d.publishedConfluencePageId);assert.equal(d.audit.length,1);
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
 assert.equal(f.pages.get(d.confluencePageId).version.number,2);
});
test('a lost Insights POST response recovers from its native seed title without a duplicate',async()=>{
 const f=directFixture(),session=await f.load(),command=await f.command('create',session),original=f.storage.request;let lose=true;
 f.storage.request=async(path,options)=>{const result=await original(path,options);if(lose&&path==='/rest/api/content'&&options?.method==='POST'){lose=false;throw Error('POST reply lost');}return result;};
 await assert.rejects(f.api.submit(command,session),/POST reply lost/);const recovered=await reopen(f).submit(command,session);
 assert.equal(recovered.data.documents[0].publishedConfluencePageId,'500');assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});
for(const flag of ['failBodyAfter','failStateAfter'])test('one-page Insights edit recovers without adding a revision after '+flag,async()=>{
 const f=directFixture();await f.act('create');const session=await f.load(),command=await f.command('revise',session,{changes:{title:'Updated title'}});f.flags[flag]=true;
 await assert.rejects(f.api.submit(command,session));const result=await reopen(f).submit(command,session),doc=result.data.documents[0];
 assert.equal(W.currentVersion(doc).version,2);assert.equal(W.currentVersion(doc).revision,1);assert.equal(doc.audit.length,2);assert.equal(f.pages.get(doc.confluencePageId).version.number,3);
});
for(const flag of [null,'failState','failStateAfter','failSummary','failBodyAfter','failDeleteAfter'])test('single Insights deletion and exact retry retain native trashed evidence: '+flag,async()=>{
 const f=directFixture();await f.act('create');f.setActor('BB12345');const session=await f.load(),command=await f.command('delete',session);
 if(flag){f.flags[flag]=true;await assert.rejects(f.api.submit(command,session));}
 const result=await reopen(f).submit(command,session);assert.equal(result.data.documents.length,0);assert.ok(f.trashed.has('500'));assert.equal(f.pages.size,4);
 const again=await reopen(f).submit(command,session);assert.equal(again.data.documents.length,0);assert.equal(f.trashed.size,1);
 assert.equal(f.states.get('500').data.document.audit.at(-1).action,'delete');
});
test('missing Insights is not mistaken for a confirmed delete and another request cannot adopt a trash receipt',async()=>{
 const f=directFixture();await f.act('create');f.setActor('BB12345');const session=await f.load(),command=await f.command('delete',session);
 f.flags.failDeleteAfter=true;await assert.rejects(f.api.submit(command,session));
 await assert.rejects(reopen(f).submit({...command,requestId:randomUUID()},session),{code:'UNKNOWN_COMMIT'});
 f.trashed.clear();await assert.rejects(reopen(f).submit(command,session),{code:'UNKNOWN_COMMIT'});
});
test('native external edit and movement of a single Insights page fail before writes',async()=>{
 for(const change of ['version','parent']){const f=directFixture();await f.act('create');if(change==='version')f.pages.get('500').version.number++;else f.pages.get('500').ancestors=[{id:'101'}];const session=change==='version'?await f.load():await f.api.load({catalog:f.catalog,workspaceScope:'create'});
 if(change==='parent'){await assert.rejects(f.api.load({catalog:f.catalog,workspaceScope:'document:'+f.fields.id}),{code:'PAGE_SCOPE'});continue;}
 const count=f.writes.length;await assert.rejects(f.api.submit(await f.command('revise',session,{changes:{title:'Overwrite'}}),session),{code:'CONFLICT'});assert.equal(f.writes.length,count);
 }
});
test('single Insights page mapping never exempts a Job aid or a duplicate document from validation',async()=>{
 const f=directFixture(),session=await f.act('create'),data=clone(session.data),validate=require('./confluence.js').validateData;
 data.documents.push({...clone(data.documents[0]),id:'another-id'});assert.throws(()=>validate(data),{code:'INVALID_MAPPING'});
 data.documents.pop();data.documents[0].type='Job aid';assert.throws(()=>validate(data),{code:'INVALID_MAPPING'});
});
test('an inaccessible known Insights save never creates a replacement article',async()=>{
 const f=directFixture(),session=await f.load(),command=await f.command('create',session);f.flags.failState=true;await assert.rejects(f.api.submit(command,session));
 const original=f.storage.page;f.storage.page=async(id,...args)=>{if(id==='500')throw Object.assign(Error('Not found'),{status:404});return original(id,...args);};
 await assert.rejects(f.api.submit(command,session),{code:'UNKNOWN_COMMIT'});assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,1);
});

for(const failAfter of ['none','read','update'])test('first publication separates viewing cleanup and recovers the same page after '+failAfter,async()=>{
 const f=fixture();await review(f);
 // Simulate a preparation page with direct viewers left by an earlier attempt.
 await f.storage.request('/rest/api/content/501/restriction',{method:'PUT',body:JSON.stringify([{operation:'read',restrictions:{user:[{type:'known',username:'BB12345'}],group:[]}}])});
 const original=f.storage.request;let lost=false;
 f.storage.request=async(path,options={})=>{
  if(path==='/rest/api/content/501/restriction'&&options.method==='PUT'){
   const payload=JSON.parse(options.body);
   assert.equal(payload.length,1,'Never combine clearing View with setting Edit');
   assert.equal(f.pages.get('501').ancestors.at(-1).id,'200','Remain under protected Working');
   assert.match(f.pages.get('501').body.storage.value,/being prepared/);
   const result=await original(path,options);
   if(!lost&&payload[0].operation===failAfter){lost=true;throw Object.assign(Error('Reply lost'),{code:'UNKNOWN_COMMIT'});}
   return result;
  }
  return original(path,options);
 };
 const session=await f.load(),command=await f.command('approve',session);
 if(failAfter!=='none'){
  await assert.rejects(f.api.submit(command,session),{code:'UNKNOWN_COMMIT'});
  assert.equal(f.pages.get('501').ancestors.at(-1).id,'200');
 }
 const result=await f.api.submit(command,session);
 assert.equal(result.data.documents[0].publishedConfluencePageId,'501');
 assert.equal(f.pages.get('501').ancestors.at(-1).id,'101');
 assert.deepEqual((await original('/rest/api/content/501/restriction/byOperation/read')).restrictions.user.results,[]);
 assert.deepEqual((await original('/rest/api/content/501/restriction/byOperation/update')).restrictions.user.results.map(u=>u.username),['BB12345']);
 assert.equal(f.writes.filter(w=>w[0]==='POST'&&w[1]==='/rest/api/content').length,2);
});

test('workspace starts both parent listings without waiting for the first response',async()=>{
 const f=fixture(),original=f.storage.request,started=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 f.storage.request=async(path,options)=>{
  if(path.includes('/child/page')){started.push(path);if(started.length===2)release();await gate;}
  return original(path,options);
 };
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;release();},1000);
 try {await f.load();assert.equal(started.length,2);assert.equal(timedOut,false);}finally{clearTimeout(timer);}
});
