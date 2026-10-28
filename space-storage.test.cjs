'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const S=require('./space-storage.js');
const origin='https://confluence.test',filename='entitlements.json',key='wcspedia.entitlements';
const clone=value=>JSON.parse(JSON.stringify(value));
test('HTTP 400 exposes a bounded JSON validation reason with the exact native request path',async()=>{
 const f=fixture({intercept:({method,response})=>method==='PUT'?response({message:'Invalid restriction subject.',errorMessages:['Choose an active user.'],stackTrace:'INTERNAL STACK'},400):undefined});
 await assert.rejects(f.store.request('/rest/api/content/101/restriction',{method:'PUT',body:'[]'}),e=>{
  assert.equal(e.status,400);assert.equal(e.code,'CONFLUENCE_HTTP');
  assert.match(e.message,/PUT \/confluence\/rest\/api\/content\/101\/restriction/);
  assert.match(e.message,/Server: Invalid restriction subject\. Choose an active user\./);
  assert.doesNotMatch(e.message,/INTERNAL STACK/);return true;
 });
});
test('unreadable, HTML and oversized validation errors retain the HTTP status without dumping their body',async()=>{
 for(const body of [new Response('<html>proxy login</html>',{status:400,headers:{'Content-Type':'text/html'}}),
  new Response('invalid JSON',{status:400,headers:{'Content-Type':'application/json'}}),
  new Response(JSON.stringify({message:'x'.repeat(9000)}),{status:400,headers:{'Content-Type':'application/json'}}),
  new Response(JSON.stringify({message:'<script>untrusted</script>'}),{status:400,headers:{'Content-Type':'application/json'}})]){
  const f=fixture({intercept:({method})=>method==='PUT'?body:undefined});
  await assert.rejects(f.store.request('/rest/api/content/101/restriction',{method:'PUT'}),e=>e.status===400&&e.code==='CONFLUENCE_HTTP'&&!e.message.includes('Server:'));
 }
});
test('a stalled validation response preserves confirmed HTTP 400 rather than reporting an unknown write',async()=>{
 let cancelled=false;
 const f=fixture({config:{writeTimeoutMs:30},intercept:({method})=>method==='PUT'?new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:400,headers:{'Content-Type':'application/json'}}):undefined});
 await assert.rejects(f.store.request('/rest/api/content/101/restriction',{method:'PUT'}),e=>e.status===400&&e.code==='CONFLUENCE_HTTP');
 assert.equal(cancelled,true);
});
function fixture(options={}){
  const state={calls:[],props:new Map(),files:new Map(),pages:new Map(),user:{type:'known',username:'BR47149',userKey:'user-br47149'},uploadCount:0,propertyWrites:0,nextId:700,failUpload:null,failProperty:null,...options.state};
  for(const [pageId,ancestors] of [['100',[]],['101',['100']],['200',[]]])state.pages.set(pageId,{id:pageId,type:'page',status:'current',space:{key:'wcspedia'},ancestors:ancestors.map(id=>({id})),operations:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}],version:{number:1}});
  const response=(value,status=200)=>new Response(value===null?null:typeof value==='string'?value:JSON.stringify(value),{status,headers:status===204?{}:{'Content-Type':'application/json'}});
  function file(pageId,name){return state.files.get(pageId+':'+name);}
  function meta(pageId,name){const f=file(pageId,name);return {results:f?[{id:f.id,type:'attachment',title:name,container:{id:pageId,type:'page'},version:{number:f.versions.length},_links:{download:'https://attacker.test/stolen'}}]:[]};}
  function seed(pageId,data,name=filename){const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));state.files.set(pageId+':'+name,{id:String(++state.nextId),versions:[bytes]});return file(pageId,name);}
  function property(pageId,propertyKey){return state.props.get(pageId+':'+propertyKey);}
  async function fetcher(input,init={}){
    const u=new URL(input),path=u.pathname.slice('/confluence'.length),method=init.method||'GET';
    state.calls.push({url:u.href,path,method,init});
    if(options.intercept){const intercepted=await options.intercept({u,path,method,init,state,response,meta,file,property});if(intercepted!==undefined)return intercepted;}
    if(path==='/rest/api/user/current')return response(state.user);
    let m;
    if((m=/^\/rest\/api\/content\/(\d+)$/.exec(path))&&method==='GET')return response(state.pages.get(m[1])||{},state.pages.has(m[1])?200:404);
    if((m=/^\/rest\/api\/content\/(\d+)\/property(?:\/([^/]+))?$/.exec(path))){
      const pageId=m[1],propertyKey=m[2]&&decodeURIComponent(m[2]);
      if(method==='GET'&&!propertyKey){
        const rows=[...state.props.entries()].filter(([name])=>name.startsWith(pageId+':')).map(([,value])=>value),start=Number(u.searchParams.get('start')||0),limit=Number(u.searchParams.get('limit')||100);
        return response({results:rows.slice(start,start+limit),_links:start+limit<rows.length?{next:'?start='+(start+limit)}:{}});
      }
      if(method==='GET')return response(property(pageId,propertyKey)||{},property(pageId,propertyKey)?200:404);
      const body=JSON.parse(init.body),name=body.key,previous=property(pageId,name);
      if((method==='POST'&&previous)||(method==='PUT'&&(!previous||body.id!==previous.id||body.version.number!==previous.version.number+1)))return response({},409);
      if(state.failProperty==='before'){state.failProperty=null;throw Error('network before property');}
      const next={id:previous?.id||String(++state.nextId),key:name,value:body.value,version:{number:body.version.number},content:{id:pageId}};
      state.props.set(pageId+':'+name,next);state.propertyWrites++;
      if(state.failProperty==='after'){state.failProperty=null;throw Error('network after property');}
      return response(next);
    }
    if((m=/^\/rest\/api\/content\/(\d+)\/child\/attachment(?:\/(\d+)\/data)?$/.exec(path))){
      const pageId=m[1];
      if(method==='GET')return response(meta(pageId,u.searchParams.get('filename')));
      if(state.failUpload==='before'){state.failUpload=null;throw Error('network before upload');}
      if(state.failUpload===413){state.failUpload=null;return response({},413);}
      const uploaded=init.body.get('file'),name=uploaded.name,existing=file(pageId,name),bytes=Buffer.from(await uploaded.arrayBuffer());
      if(m[2]&&(!existing||existing.id!==m[2]))return response({},404);
      if(existing)existing.versions.push(bytes);else state.files.set(pageId+':'+name,{id:String(++state.nextId),versions:[bytes]});
      state.uploadCount++;
      if(state.failUpload==='after'){state.failUpload=null;throw Error('network after upload');}
      return response(meta(pageId,name));
    }
    if((m=/^\/download\/attachments\/(\d+)\/([^/]+)$/.exec(path))){const f=file(m[1],decodeURIComponent(m[2])),version=Number(u.searchParams.get('version')||f?.versions.length);return f&&f.versions[version-1]?new Response(f.versions[version-1]):response({},404);}
    return response({ok:true});
  }
  const config={baseUrl:origin+'/confluence',spaceKey:'wcspedia',rootPageId:'100',...options.config};
  const store=S.create(config,{origin,crypto:webcrypto,fetch:fetcher});
  return {store,state,seed,file,property,response,meta,create:()=>S.create(config,{origin,crypto:webcrypto,fetch:fetcher})};
}
const save=(store,data,options={})=>store.writeJSON('101',filename,key,data,{expectedRevision:0,expectedAttachmentVersion:0,requestId:'request-001',...options});
test('native transport uses only same-origin session and configured context with bounded JSON',async()=>{
 const f=fixture();assert.equal((await f.store.user()).username,'BR47149');
 const call=f.state.calls[0];assert.equal(call.url,origin+'/confluence/rest/api/user/current');assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.redirect,'error');assert.equal(call.init.cache,'no-store');
 for(const path of ['https://evil.test/rest/api/content','//evil.test/rest/api/content','/../rest/api/content','/rest/api/%2e%2e/content','/rest/api/content#secret','/other/path'])await assert.rejects(f.store.request(path),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/user/current',{headers:{Authorization:'secret'}}),e=>e.code==='CONFIGURATION');
 assert.equal(f.state.calls.length,1);
});
test('page reads verify exact native space, configured subtree and explicit extra hosts',async()=>{
 const f=fixture();assert.equal((await f.store.page('101','body.storage')).id,'101');assert.match(f.state.calls[0].url,/body.storage/);
 await assert.rejects(f.store.page('200'),e=>e.code==='SCOPE');
 f.state.pages.get('101').space.key='OTHER';await assert.rejects(f.store.page('101'),e=>e.code==='SCOPE');
 const extra=fixture({config:{allowedPageIds:['200']}});assert.equal((await extra.store.page('200')).id,'200');
 extra.state.pages.get('200').space.key='OTHER';await assert.rejects(extra.store.page('200'),e=>e.code==='SCOPE');
});
test('protected pages, policy denied pages and missing native edit rights reject storage writes',async()=>{
 const protectedPage=fixture({config:{protectedPageIds:['101']}});await assert.rejects(save(protectedPage.store,{a:1}),e=>e.code==='FORBIDDEN');assert.equal(protectedPage.state.calls.length,0);
 const denied=fixture({config:{authorize:async()=>false}});await assert.rejects(save(denied.store,{a:1}),e=>e.code==='FORBIDDEN');assert.equal(denied.state.propertyWrites,0);
 const readOnly=fixture();readOnly.state.pages.get('101').operations=[{operation:'read',targetType:'page'}];await assert.rejects(save(readOnly.store,{a:1}),e=>e.code==='FORBIDDEN');
});
test('explicit JSON storage hosts stay protected from page-body and delete mutations',async()=>{
 const f=fixture({config:{protectedPageIds:['101'],storagePageIds:['101']}});
 assert.deepEqual((await save(f.store,{grants:[]})).data,{grants:[]});
 for(const method of ['PUT','DELETE'])await assert.rejects(f.store.request('/rest/api/content/101',{method,body:'{}'}),e=>e.code==='FORBIDDEN');
});
test('public native mutations scope their target and deny credentials/protected destinations',async()=>{
 const f=fixture({config:{protectedPageIds:['100']}});
 await assert.rejects(f.store.request('/rest/api/content/200',{method:'PUT',body:'{}'}),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/content/100/label',{method:'POST',body:'[]'}),e=>e.code==='FORBIDDEN');
 await assert.rejects(f.store.request('/rest/api/content/101',{method:'PUT',body:JSON.stringify({id:'101',type:'page',space:{key:'OTHER'}})}),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/content/101',{method:'PUT',body:JSON.stringify({id:'101',type:'page',ancestors:[{id:'200'}]})}),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/content/101/move/append/200',{method:'PUT'}),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/content',{method:'POST',body:JSON.stringify({type:'page',space:{key:'OTHER'},ancestors:[{id:'101'}]})}),e=>e.code==='SCOPE');
 await assert.rejects(f.store.request('/rest/api/space/wcspedia',{method:'DELETE'}),e=>e.code==='SCOPE');
 await f.store.request('/rest/api/content',{method:'POST',body:JSON.stringify({type:'comment',container:{id:'101'}})});
 assert.equal(f.state.calls.filter(c=>c.method!=='GET').length,1);
});
test('an existing live JSON is read without creating a pointer or changing its attachment',async()=>{
 const f=fixture(),native=f.seed('101',{records:[{soeid:'BR47149'}]});
 const result=await f.store.readJSON('101',filename,key);
 assert.match(result.fingerprint,/^701:1:[a-f0-9]{64}$/);
 assert.deepEqual(result,{data:{records:[{soeid:'BR47149'}]},revision:0,attachmentId:native.id,attachmentVersion:1,fingerprint:result.fingerprint,pointer:null});
 assert.equal(f.state.calls.some(c=>c.method!=='GET'),false);
 assert.ok(f.state.calls.some(c=>c.url.endsWith('/download/attachments/101/entitlements.json?api=v2')));
 assert.equal(f.state.calls.some(c=>c.url.includes('attacker.test')),false);
 assert.equal(f.state.calls.some(c=>c.path.endsWith('/property/'+key)),false,'Missing JSON metadata must not issue a noisy 404 lookup');
});
test('JSON metadata lookup follows bounded collection pages and propagates real endpoint failures',async()=>{
 const f=fixture();
 for(let i=0;i<101;i++)f.state.props.set('101:unrelated-'+i,{id:String(800+i),key:'unrelated-'+i,value:{},version:{number:1}});
 f.seed('101',{existing:true});
 assert.deepEqual((await f.store.readJSON('101',filename,key)).data,{existing:true});
 assert.ok(f.state.calls.some(c=>c.url.includes('start=100')));
 const denied=fixture({intercept:({path,response})=>path.endsWith('/property')?response({},403):undefined});
 await assert.rejects(denied.store.readJSON('101',filename,key),e=>e.status===403&&e.message.includes('GET /confluence/rest/api/content/101/property'));
 const unavailable=fixture({intercept:({path,response})=>path.endsWith('/property')?response({},404):undefined});
 await assert.rejects(unavailable.store.readJSON('101',filename,key),e=>e.status===404,'Unavailable metadata API must not be treated as an absent pointer');
});
test('JSON uploads use one full filename and /data only when updating an existing attachment',async()=>{
 const f=fixture();const first=await save(f.store,{value:1});
 const second=await save(f.store,{value:2},{expectedRevision:first.revision,expectedAttachmentVersion:1,requestId:'request-002'});
 const uploads=f.state.calls.filter(c=>c.method==='POST'&&c.path.includes('/child/attachment'));
 assert.equal(uploads.length,2);
 assert.equal(uploads[0].path,'/rest/api/content/101/child/attachment');
 assert.equal(uploads[1].path,'/rest/api/content/101/child/attachment/'+first.attachmentId+'/data');
 for(const upload of uploads){assert.equal(upload.init.body.get('file').name,'entitlements.json');assert.equal(upload.init.body.get('file').type,'application/json');}
 assert.equal(f.state.files.size,1);assert.equal(second.attachmentVersion,2);
});
test('404 on metadata creation reports the failed POST and never overwrites the live policy',async()=>{
 const f=fixture({intercept:({method,path,response})=>method==='POST'&&path.endsWith('/property')?response({},404):undefined});
 f.seed('101',{records:['keep']});
 await assert.rejects(save(f.store,{records:['new']},{expectedAttachmentVersion:1}),e=>e.status===404&&e.message.includes('POST /confluence/rest/api/content/101/property'));
 assert.equal(f.state.uploadCount,0);assert.equal(f.state.propertyWrites,0);
 assert.deepEqual(JSON.parse(f.file('101',filename).versions[0]),{records:['keep']});
});
test('missing JSON has an explicit empty snapshot and first write reserves then commits one file',async()=>{
 const f=fixture();assert.deepEqual(await f.store.readJSON('101',filename,key),{data:null,revision:0,attachmentId:null,attachmentVersion:0,fingerprint:null,pointer:null});
 const result=await save(f.store,{records:[]});assert.deepEqual(result.data,{records:[]});assert.equal(result.revision,2);assert.equal(result.attachmentVersion,1);assert.equal(result.pointer.pending,null);
 assert.equal(f.state.uploadCount,1);assert.equal(f.state.propertyWrites,2);assert.equal(f.state.files.size,1);
 const again=await save(f.store,{records:[]});assert.deepEqual(again,result);assert.equal(f.state.uploadCount,1);
});
test('first managed write preserves the existing live baseline and refuses stale native versions',async()=>{
 const f=fixture();f.seed('101',{live:'preserved'});
 await assert.rejects(save(f.store,{starter:'wrong'}),e=>e.code==='CONFLICT');assert.equal(f.state.propertyWrites,0);assert.equal(f.state.uploadCount,0);
 const result=await save(f.store,{live:'updated'},{expectedAttachmentVersion:1});assert.equal(result.attachmentVersion,2);assert.deepEqual(JSON.parse(f.file('101',filename).versions[0]),{live:'preserved'});
});
test('content-property writes include ID and version CAS and recover a lost confirmation without repeating',async()=>{
 const f=fixture();assert.equal(await f.store.property('101','wcspedia.operation'),null);
 f.state.failProperty='after';const created=await f.store.putProperty('101','wcspedia.operation',{stage:'prepared'},null);assert.equal(created.version.number,1);assert.equal(f.state.propertyWrites,1);
 const updated=await f.store.putProperty('101','wcspedia.operation',{stage:'done'},1);assert.equal(updated.version.number,2);
 const put=f.state.calls.find(c=>c.method==='PUT');assert.equal(JSON.parse(put.init.body).id,created.id);assert.equal(JSON.parse(put.init.body).version.number,2);
 await assert.rejects(f.store.putProperty('101','wcspedia.operation',{stage:'lost'},1),e=>e.code==='CONFLICT');
});
test('parallel writers cannot silently overwrite one another even when attachment names are shared',async()=>{
 const f=fixture(),second=f.create();
 const outcomes=await Promise.allSettled([save(f.store,{writer:'a'}),save(second,{writer:'b'},{requestId:'request-002'})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);assert.equal(f.state.uploadCount,1);
 const winner=outcomes.find(r=>r.status==='fulfilled').value;assert.deepEqual((await f.store.readJSON('101',filename,key)).data,winner.data);
});
test('simultaneous same-request retries upload at most once',async()=>{
 const f=fixture();const results=await Promise.allSettled([save(f.store,{a:1}),save(f.create(),{a:1})]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.state.uploadCount,1);
 assert.deepEqual((await save(f.store,{a:1})).data,{a:1});
});
test('unknown upload after commit is reconciled by its version and digest without a second upload',async()=>{
 const f=fixture();f.state.failUpload='after';const result=await save(f.store,{a:1});assert.equal(result.attachmentVersion,1);assert.equal(f.state.uploadCount,1);
 assert.deepEqual(await save(f.store,{a:1}),result);assert.equal(f.state.uploadCount,1);
 await assert.rejects(save(f.store,{a:2}),e=>e.code==='CONFLICT');
});
test('unknown upload before commit stays pending, exposes previous data and never retries blindly',async()=>{
 const f=fixture();f.seed('101',{a:'old'});f.state.failUpload='before';
 const opts={expectedAttachmentVersion:1};await assert.rejects(save(f.store,{a:'new'},opts),e=>e.code==='UNKNOWN_COMMIT');
 const read=await f.store.readJSON('101',filename,key);assert.deepEqual(read.data,{a:'old'});assert.equal(read.pointer.pending.requestId,'request-001');
 await assert.rejects(save(f.store,{a:'new'},opts),e=>e.code==='UNKNOWN_COMMIT');assert.equal(f.state.uploadCount,0);assert.equal(f.state.calls.filter(c=>c.method==='POST'&&c.path.includes('child/attachment')).length,1);
 await assert.rejects(save(f.store,{other:'write'},{requestId:'request-002',expectedRevision:read.revision,expectedAttachmentVersion:1}),e=>e.code==='WRITE_PENDING');
 // The original request can recover when the delayed native upload becomes visible.
 f.file('101',filename).versions.push(Buffer.from(JSON.stringify({a:'new'})));
 const recovered=await save(f.store,{a:'new'},opts);assert.deepEqual(recovered.data,{a:'new'});assert.equal(recovered.attachmentVersion,2);
});
test('lost reservation and final CAS responses recover by exact values without duplicate uploads',async()=>{
 const reserved=fixture();reserved.state.failProperty='after';assert.equal((await save(reserved.store,{a:1})).revision,2);assert.equal(reserved.state.uploadCount,1);
 const final=fixture({intercept:async({method,path,state})=>{if(method==='PUT'&&path.endsWith('/property/'+key)&&state.propertyWrites===1)state.failProperty='after';}});
 assert.equal((await save(final.store,{a:1})).revision,2);assert.equal(final.state.uploadCount,1);
});
test('definite upload rejection releases only its own reservation and allows a corrected save',async()=>{
 const f=fixture();f.state.failUpload=413;
 await assert.rejects(save(f.store,{a:1}),e=>e.code==='ATTACHMENT_TOO_LARGE'&&e.status===413);
 const current=await f.store.readJSON('101',filename,key);assert.equal(current.pointer.pending,null);assert.equal(current.data,null);
 const result=await save(f.store,{a:2},{expectedRevision:current.revision,requestId:'corrected-002'});assert.deepEqual(result.data,{a:2});
});
test('digest and pointer identity verification refuse tampered data and cross-page metadata',async()=>{
 const f=fixture();await save(f.store,{a:1});f.file('101',filename).versions[0]=Buffer.from('{"a":2}');
 await assert.rejects(f.store.readJSON('101',filename,key),e=>e.code==='INTEGRITY');
 f.property('101',key).value.pageId='200';await assert.rejects(f.store.readJSON('101',filename,key),e=>e.code==='INVALID_POINTER');
 const bad=fixture({intercept:async({method,path,response})=>method==='GET'&&path.endsWith('/child/attachment')?response({results:[{id:'9',type:'attachment',title:filename,version:{number:1},container:{id:'200',type:'page'}}]}):undefined});
 await assert.rejects(bad.store.readJSON('101',filename,key),e=>e.code==='INVALID_ATTACHMENT');
});
test('external manual attachment changes read the latest policy without pointer recovery',async()=>{
 const f=fixture();await save(f.store,{grant:true});f.file('101',filename).versions.push(Buffer.from('{"grant":false}'));
 assert.deepEqual((await f.store.readJSON('101',filename,key)).data,{grant:false});assert.equal(f.state.uploadCount,1);
});
test('every JSON filename uses latest reads and can save a reviewed manual replacement through /data',async()=>{
 for(const name of ['entitlements.json','wcspedia-document.json','wcspedia-content-health.json']){
  const f=fixture(),propertyKey='wcspedia.fixture';
  await f.store.writeJSON('101',name,propertyKey,{value:'original'},{expectedRevision:0,expectedAttachmentVersion:0,requestId:'original'});
  const replacement=f.seed('101',{value:'manual',history:['retain']},name);
  const read=await f.store.readJSON('101',name,propertyKey);
  assert.deepEqual(read.data,{value:'manual',history:['retain']});
  assert.equal(read.attachmentId,replacement.id);
  const latest=f.state.calls.filter(c=>c.path.endsWith('/'+name)&&c.method==='GET').at(-1);
  assert.equal(new URL(latest.url).searchParams.has('version'),false);
  const result=await f.store.writeJSON('101',name,propertyKey,{...read.data,value:'managed'},{
   expectedRevision:read.revision,expectedAttachmentVersion:read.attachmentVersion,expectedFingerprint:read.fingerprint,requestId:'after-manual'});
  assert.deepEqual(result.data,{value:'managed',history:['retain']});
  assert.ok(f.state.calls.some(c=>c.method==='POST'&&c.path.endsWith('/'+replacement.id+'/data')));
 }
});
test('a same-version replacement after reading cannot be overwritten by a stale editor',async()=>{
 for(const managed of [false,true]){
  const f=fixture();if(managed)await save(f.store,{a:1});else f.seed('101',{a:1});
  const read=await f.store.readJSON('101',filename,key);
  f.seed('101',{a:'replaced'});
  const uploads=f.state.uploadCount,writes=f.state.propertyWrites;
  await assert.rejects(save(f.store,{a:'stale'},{expectedRevision:read.revision,expectedAttachmentVersion:read.attachmentVersion,expectedFingerprint:read.fingerprint,requestId:'stale-editor'}),{code:'CONFLICT'});
  assert.equal(f.state.uploadCount,uploads);assert.equal(f.state.propertyWrites,writes);
  assert.deepEqual((await f.store.readJSON('101',filename,key)).data,{a:'replaced'});
 }
});
test('reusing an old success receipt after manual replacement cannot report that stale save as confirmed',async()=>{
 const f=fixture();await save(f.store,{a:1});f.seed('101',{a:2});
 await assert.rejects(save(f.store,{a:1}),{code:'CONFLICT'});
 assert.equal(f.state.uploadCount,1);
});
test('latest JSON reads reject changes during download and never reset a missing managed file',async()=>{
 let alter=false;
 const f=fixture({intercept:({path,file})=>{
  if(alter&&path.endsWith('/'+filename)){alter=false;file('101',filename).versions.push(Buffer.from('{"a":"raced"}'));}
 }});
 await save(f.store,{a:1});alter=true;
 await assert.rejects(f.store.readJSON('101',filename,key),{code:'CONFLICT'});
 f.state.files.clear();
 await assert.rejects(f.store.readJSON('101',filename,key),{code:'ATTACHMENT_NOT_FOUND'});
 assert.equal(f.state.uploadCount,1);
});
test('recovery explicitly adopts a replaced attachment without uploading or changing its JSON',async()=>{
 const f=fixture();await save(f.store,{grants:['old'],audit:['keep']});
 const old=clone(f.property('101',key)),replacement={grants:['new'],audit:['keep','manual change']};
 const file=f.seed('101',replacement);const writes=f.state.propertyWrites;
 assert.deepEqual((await f.store.readJSON('101',filename,key)).data,replacement);
 const preview=await f.store.inspectJSON('101',filename,key);
 assert.deepEqual(preview.property,old);assert.equal(preview.candidate.id,file.id);assert.equal(preview.canRepair,true);
 assert.equal(f.state.propertyWrites,writes,'Inspection must not change the reference');
 const repaired=await f.store.reconcileJSON(preview,{requestId:'recovery-001'});
 assert.deepEqual(repaired.data,replacement);assert.equal(repaired.attachmentId,file.id);
 assert.equal(f.state.uploadCount,1,'Recovery does not re-upload the file');
 assert.equal(f.state.propertyWrites,writes+1);assert.equal(file.versions.length,1);
 assert.deepEqual((await f.store.readJSON('101',filename,key)).data,replacement);
});
test('recovery supports a manual newer version and the next managed save still uses /data',async()=>{
 const f=fixture();await save(f.store,{a:1});
 f.file('101',filename).versions.push(Buffer.from('{"a":2}'));
 const preview=await f.store.inspectJSON('101',filename,key);
 const recovered=await f.store.reconcileJSON(preview,{requestId:'recovery-002'});
 assert.deepEqual(recovered.data,{a:2});
 await save(f.store,{a:3},{expectedRevision:recovered.revision,expectedAttachmentVersion:2,requestId:'after-recovery'});
 const uploads=f.state.calls.filter(c=>c.method==='POST'&&c.path.includes('/child/attachment'));
 assert.equal(uploads.length,2);assert.match(uploads[1].path,/\/data$/);
});
test('recovery rejects missing files, malformed JSON, pending writes and readers without native Edit',async()=>{
 const missing=fixture();await save(missing.store,{a:1});missing.state.files.clear();
 await assert.rejects(missing.store.inspectJSON('101',filename,key),{code:'ATTACHMENT_NOT_FOUND'});
 const malformed=fixture();malformed.seed('101',Buffer.from('{bad'));
 await assert.rejects(malformed.store.inspectJSON('101',filename,key),{code:'INVALID_JSON'});
 const pending=fixture();pending.seed('101',{a:1});pending.state.failUpload='before';
 await assert.rejects(save(pending.store,{a:2},{expectedAttachmentVersion:1}),{code:'UNKNOWN_COMMIT'});
 await assert.rejects(pending.store.inspectJSON('101',filename,key),{code:'WRITE_PENDING'});
 const denied=fixture();denied.seed('101',{a:1});denied.state.pages.get('101').operations=[];
 const preview=await denied.store.inspectJSON('101',filename,key);assert.equal(preview.canRepair,false);
 await assert.rejects(denied.store.reconcileJSON(preview,{requestId:'denied-recovery'}),{code:'FORBIDDEN'});
 assert.equal(denied.state.propertyWrites,0);assert.equal(denied.state.uploadCount,0);
});
test('attachment replacement or pointer change after preview prevents recovery',async()=>{
 for(const change of ['attachment','property']){
  const f=fixture();await save(f.store,{a:1});const preview=await f.store.inspectJSON('101',filename,key);
  if(change==='attachment')f.seed('101',{a:2});
  else f.property('101',key).version.number++;
  const count=f.state.propertyWrites;
  await assert.rejects(f.store.reconcileJSON(preview,{requestId:'stale-recovery'}),{code:'CONFLICT'});
  assert.equal(f.state.propertyWrites,count);
 }
});
test('recovery CAS conflict does not overwrite a concurrent managed writer',async()=>{
 let reject=false;
 const f=fixture({intercept:async({method,path,response})=>reject&&method==='PUT'&&path.endsWith('/property/'+key)?response({},409):undefined});
 await save(f.store,{a:1});f.seed('101',{a:2});const preview=await f.store.inspectJSON('101',filename,key);reject=true;
 const previous=clone(f.property('101',key));
 await assert.rejects(f.store.reconcileJSON(preview,{requestId:'racing-recovery'}),{code:'CONFLICT'});
 assert.deepEqual(f.property('101',key),previous);
});
test('attachment limits use UTF-8 bytes and reject before any network mutation',async()=>{
 const f=fixture();const exact={value:'x'.repeat(S.MAX_BYTES-12)};assert.equal(Buffer.byteLength(JSON.stringify(exact)),S.MAX_BYTES);
 const result=await save(f.store,exact);assert.equal(result.pointer.attachment.bytes,S.MAX_BYTES);
 const tooLarge=fixture();await assert.rejects(save(tooLarge.store,{value:'界'.repeat(Math.ceil(S.MAX_BYTES/3))}),e=>e.code==='ATTACHMENT_TOO_LARGE');assert.equal(tooLarge.state.calls.length,0);
});
test('native multipart uploads apply the 10MB limit separately to each file',async()=>{
 const f=fixture();let body=new FormData();body.append('file',new Blob([new Uint8Array(S.MAX_BYTES+1)]),'too-big.bin');
 await assert.rejects(f.store.request('/rest/api/content/101/child/attachment',{method:'POST',body}),e=>e.code==='ATTACHMENT_TOO_LARGE');assert.equal(f.state.calls.length,0);
 body=new FormData();body.append('file',new Blob([new Uint8Array(S.MAX_BYTES)]),'one.bin');body.append('file',new Blob([new Uint8Array(S.MAX_BYTES)]),'two.bin');
 await f.store.request('/rest/api/content/101/child/attachment',{method:'POST',body});assert.equal(f.state.uploadCount,1);
});
test('native fetch and response-body stalls time out and caller abort remains cancellation',async()=>{
 const stalled=fixture({config:{requestTimeoutMs:15,writeTimeoutMs:15},intercept:async()=>new Promise(()=>{})});
 await assert.rejects(stalled.store.user(),e=>e.code==='TIMEOUT');
 let cancelled=false;
 const body=fixture({config:{requestTimeoutMs:15,writeTimeoutMs:15},intercept:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))});
 await assert.rejects(body.store.user(),e=>e.code==='TIMEOUT');assert.equal(cancelled,true);
 const controller=new AbortController(),pending=stalled.store.user({signal:controller.signal});controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 const write=fixture({config:{requestTimeoutMs:15,writeTimeoutMs:15},intercept:async({method})=>method==='POST'?new Promise(()=>{}):undefined});
 await assert.rejects(write.store.request('/rest/api/content/101/label',{method:'POST',body:'[]'}),e=>e.code==='UNKNOWN_COMMIT');
});
test('native changes between initialization reservation and upload are not adopted or overwritten',async()=>{
 let changed=false;
 const f=fixture({intercept:async({method,path,state,file})=>{if(!changed&&method==='GET'&&path.endsWith('/child/attachment')&&state.propertyWrites===1){changed=true;file('101',filename).versions.push(Buffer.from('{"manual":true}'));}}});
 f.seed('101',{baseline:true});await assert.rejects(save(f.store,{replacement:true},{expectedAttachmentVersion:1}),e=>e.code==='CONFLICT');
 assert.equal(f.state.uploadCount,0);assert.deepEqual(JSON.parse(f.file('101',filename).versions[1]),{manual:true});
});
test('streamed and declared oversized reads are cancelled, including multibyte JSON',async()=>{
 for(const declared of [false,true]){
  let cancelled=false;
  const f=fixture({intercept:async({path})=>path==='/rest/api/user/current'?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(S.MAX_BYTES));c.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}}),{headers:declared?{'Content-Length':String(S.MAX_BYTES+1)}:{}}):undefined});
  await assert.rejects(f.store.user(),e=>e.code==='ATTACHMENT_TOO_LARGE');assert.equal(cancelled,true);
 }
});
test('malformed UTF-8, duplicate attachment metadata and unauthenticated writers fail closed',async()=>{
 const invalid=fixture();invalid.seed('101',Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]));await assert.rejects(invalid.store.readJSON('101',filename,key),e=>e.code==='INVALID_JSON');
 const ambiguous=fixture({intercept:async({path,response})=>path.endsWith('/child/attachment')?response({results:[{},{}]}):undefined});await assert.rejects(ambiguous.store.readJSON('101',filename,key),e=>e.code==='INVALID_ATTACHMENT');
 const anonymous=fixture({state:{user:{type:'anonymous'}}});await assert.rejects(save(anonymous.store,{a:1}),e=>e.code==='AUTH_REQUIRED');assert.equal(anonymous.state.propertyWrites,0);
});
test('invalid configuration and property bytes are rejected without native writes',async()=>{
 for(const config of [{baseUrl:'https://other.test/confluence'},{spaceKey:''},{rootPageId:'0'},{protectedPageIds:['bad']},{baseUrl:origin+'/confluence?secret=1'}])assert.throws(()=>fixture({config}));
 const f=fixture();await assert.rejects(f.store.putProperty('101','wcspedia.big',{text:'界'.repeat(11000)},null),e=>e.code==='ATTACHMENT_TOO_LARGE');assert.equal(f.state.calls.length,0);
});

test('production storage composes with native workflow creation, review and publication',async()=>{
 const SW=require('./space-workflow.js'),W=require('./workflow.js'),G=require('./governance.js'),C=require('./confluence.js');
 const restrictions=new Map(),nativeReads=new Map(),nativeOps=['read','update','delete','create'].map(operation=>({operation,targetType:'page'}));
 const f=fixture({config:{extraRootPageIds:['200']},intercept:async({u,path,method,init,state,response})=>{
  let m;const body=typeof init.body==='string'?JSON.parse(init.body):null;
  if(path.startsWith('/rest/api/space/'))return response({key:'wcspedia',operations:nativeOps});
  if(path==='/rest/api/user')return response({type:'known',username:u.searchParams.get('username'),userKey:'key-'+u.searchParams.get('username')});
  if((m=/^\/rest\/api\/content\/(\d+)\/restriction\/byOperation\/(read|update)$/.exec(path))){
   const users=m[2]==='read'?(nativeReads.get(m[1])||[{type:'known',username:'AA12345',userKey:'key-AA12345'}]):restrictions.get(m[1])||[];
   return response({operation:m[2],restrictions:{user:{results:users},group:{results:[]}}});
  }
  if((m=/^\/rest\/api\/content\/(\d+)\/restriction$/.exec(path))&&method==='PUT'){restrictions.set(m[1],body.find(row=>row.operation==='update').restrictions.user);const read=body.find(row=>row.operation==='read');if(read)nativeReads.set(m[1],read.restrictions.user);return response({});}
  if((m=/^\/rest\/api\/content\/(\d+)\/child\/page$/.exec(path)))return response({results:[...state.pages.values()].filter(p=>p.ancestors.at(-1)?.id===m[1]),_links:{}});
  if(path==='/rest/api/content'&&method==='GET')return response({results:[...state.pages.values()].filter(p=>p.title===u.searchParams.get('title'))});
  if(path==='/rest/api/content'&&method==='POST'){
   const id=String(++state.nextId),parent=state.pages.get(body.ancestors.at(-1).id);
   const p={...body,id,status:'current',version:{number:1},operations:clone(nativeOps),ancestors:[...parent.ancestors,{id:parent.id}]};state.pages.set(id,p);return response(p);
  }
  if((m=/^\/rest\/api\/content\/(\d+)$/.exec(path))&&method==='PUT'){
   const p=state.pages.get(m[1]);if(body.version.number!==p.version.number+1)return response({},409);
   const parent=state.pages.get(body.ancestors.at(-1).id);Object.assign(p,body,{ancestors:[...parent.ancestors,{id:parent.id}]});return response(p);
  }
  if(path.endsWith('/label'))return response({results:[]});
 }});
 f.state.pages.set('102',{...clone(f.state.pages.get('101')),id:'102'});
 for(const p of f.state.pages.values()){p.operations=clone(nativeOps);p.body={storage:{value:'<p>Native host page.</p>'}};}
 const config={baseUrl:origin+'/confluence',spaceKey:'wcspedia',rootPageId:'100',workingRootPageId:'200',insightsPageId:'102',areaPageIds:{'credit-approval-control':'101'}};
 const catalog={schemaVersion:1,isDemo:false,people:[],documents:[],areas:[{id:'credit-approval-control',title:'Credit Approval Control'}]};
 const policy={schemaVersion:1,revision:1,audit:[],records:[{id:'author',soeid:'AA12345',displayName:'Author',scope:'*',permissions:['content.create','content.edit'],active:true},{id:'manager',soeid:'BB12345',displayName:'Manager',scope:'*',permissions:['content.create','content.edit','content.delete','entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'],active:true}]};
 const api=SW.create(config,{storage:f.store,origin,crypto:webcrypto,loadPolicy:async()=>clone(policy)});
 const fields={id:'integrated-doc',reference:'WCS-JA-001',area:'credit-approval-control',type:'Job aid',ownerId:'wcs-user-aa12345',authorId:'wcs-user-aa12345',reviewerId:'wcs-user-bb12345',approverId:'wcs-user-bb12345',title:'Integrated native document',summary:'A native workflow composition check.',bodyMarkdown:'## Guidance\n\nUse the native page and its attachments.',governance:G.normalize({classification:'other-nhd',owningTeam:'WCS Learning',scope:'Internal learning support.',audience:'Credit service colleagues',classificationRationale:'This explains a task and leaves formal requirements to the source.'})};
 function actor(soeid){f.state.user={type:'known',username:soeid,userKey:'key-'+soeid,displayName:soeid};}
 let count=0;
 async function act(action,extra={}){const s=await api.load({catalog}),d=s.data.documents[0],v=d&&W.currentVersion(d);return api.submit({action,requestId:'integrated-request-'+(++count),comment:'Checked native persistence.',expectedEntitlementRevision:1,...(action==='create'?{fields}:{docId:d.id,expectedVersion:v.version,expectedRevision:v.revision,expectedAuditLength:d.audit.length,expectedPageVersion:d.confluencePageVersion}),...extra},s);}
 actor('AA12345');f.state.failUpload='after';let session=await act('create'),doc=session.data.documents[0];
 C.validateData(session.data);
 assert.equal(W.currentVersion(doc).status,'Draft');assert.equal(f.state.uploadCount,1,'lost native JSON upload response is reconciled, not uploaded again');
 const workingId=doc.confluencePageId;
 let persisted=await f.store.readJSON(workingId,SW.STATE_FILENAME,SW.STATE_KEY);assert.equal(persisted.revision,2);assert.equal(persisted.pointer.pending,null);
 session=await act('submit');C.validateData(session.data);actor('BB12345');session=await api.load({catalog});const version=W.currentVersion(session.data.documents[0]);
 await act('complete-review',{governanceReview:{baselineVersion:G.BASELINE_VERSION,version:version.version,revision:version.revision,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'clear',reason:'Reviewed the exact saved native revision.'}});
 session=await act('approve',{nextReviewAt:G.nextReviewDate(new Date().toISOString(),24)});doc=session.data.documents[0];
 C.validateData(session.data);
 assert.equal(W.currentVersion(doc).status,'Published');assert.equal(f.state.pages.get(doc.publishedConfluencePageId).ancestors.at(-1).id,'101');
 persisted=await f.store.readJSON(workingId,SW.STATE_FILENAME,SW.STATE_KEY);assert.equal(persisted.attachmentVersion,4);assert.equal(persisted.revision,8);assert.equal(persisted.pointer.pending,null);
 assert.equal(f.state.files.size,1,'only the individual working document gets a JSON metadata file');
 assert.equal(f.property(workingId,SW.JOURNAL_KEY).value.done,true);
 assert.ok(f.state.calls.filter(c=>c.method==='PUT'&&c.path.includes('/property/')).every(c=>/^\d+$/.test(JSON.parse(c.init.body).id)));
});

test('optional health journal lookup uses the native collection and never mistakes server failure for absence',async()=>{
 const f=fixture();assert.equal(await f.store.property('101','wcspedia.health.operation',{optional:true}),null);
 assert.equal(f.state.calls.some(c=>c.path.includes('/property/wcspedia.health.operation')),false);
 const broken=fixture({intercept:({path,response})=>path.endsWith('/property')?response({message:'Unavailable'},503):undefined});
 await assert.rejects(broken.store.property('101','wcspedia.health.operation',{optional:true}),e=>e.status===503);
});

test('native permission synchronization allows only configured-space user grants in the bounded allowlist',async()=>{
 const f=fixture({config:{allowSpacePermissionSync:true}}),path='/rest/api/space/wcspedia/permissions/user/key-123/grant';
 const body=JSON.stringify([{targetType:'space',operationKey:'restrict'},{targetType:'page',operationKey:'create'}]);
 await f.store.request(path,{method:'PUT',body});assert.equal(f.state.calls.length,1);
 for(const target of [path.replace('wcspedia','other'),path.replace('/user/','/group/'),path.replace('/grant','/delete')])await assert.rejects(f.store.request(target,{method:'PUT',body}),{code:'SCOPE'});
 for(const invalid of ['[]','{}',JSON.stringify([{targetType:'space',operationKey:'administer'}]),JSON.stringify([{targetType:'page',operationKey:'create',extra:true}])])await assert.rejects(f.store.request(path,{method:'PUT',body:invalid}),{code:'SCOPE'});
 await assert.rejects(fixture().store.request(path,{method:'PUT',body}),{code:'SCOPE'});assert.equal(f.state.calls.length,1,'Rejected writes never reach the network');
});
