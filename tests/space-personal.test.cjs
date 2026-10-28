'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Personal=require('../space-personal.js'),Bookmarks=require('../bookmarks.js'),Suggestions=require('../suggestions.js');
const config={mode:'confluence',authoringMode:'confluence-session',contextPath:'/confluence',rootPageId:'100',spaceKey:'wcspedia',attachmentPageId:'500',pages:{mine:'/confluence/pages/viewpage.action?pageId=600'},nativePublication:{areaPageIds:{credit:'200'},workingRootPageId:'900',insightsPageId:'300'}};
const location={href:'https://example.test/confluence/pages/viewpage.action?pageId=100'};
const page=(id,changes={})=>({id,type:'page',status:'current',space:{key:'wcspedia'},ancestors:[{id:'100'},{id:'200'}],version:{number:3},title:'Article '+id,...changes});
const doc={id:'doc-1',confluencePageId:'201',publishedVersion:1,versions:[{version:1,revision:2,status:'Published',title:'Approved article',summary:''}]};
function fixture(){
  let user={userKey:'user-1',username:'br47149',type:'known'},docs=[doc],results=[page('201'),page('202')],saved=new Set(['201','202']),callOverride,labelsOverride,pageOverride;
  const calls=[],storage={user:async()=>user,page:async id=>pageOverride?pageOverride(id):page(id),request:async(path,init={})=>{
    calls.push({path,init});if(callOverride){const result=await callOverride(path,init);if(result!==undefined)return result;}
    const url=new URL(path,'https://example.test'),id=url.pathname.match(/content\/(\d+)/)?.[1];
    if(url.pathname.endsWith('/search'))return {results,start:Number(url.searchParams.get('start')),_links:{}};
    if(url.pathname.endsWith('/label')){
      if(init.method==='POST')saved.add(id);else if(init.method==='DELETE')saved.delete(id);
      if(labelsOverride)return labelsOverride(path,init);
      return {results:saved.has(id)?[{prefix:'my',name:'favourite'}]:[],_links:{}};
    }
    throw Error('Unexpected request '+path);
  }};
  const options={getDocuments:()=>docs,canRead:()=>true};
  return {storage,calls,saved,options,create:()=>Personal.create(config,{location,storage}).bookmarks(options),setUser:v=>user=v,setDocs:v=>docs=v,setResults:v=>results=v,override:fn=>callOverride=fn,labels:fn=>labelsOverride=fn,pages:fn=>pageOverride=fn};
}
test('native favourites are scoped CQL current-user pages, including native documents outside the managed catalog',async()=>{
  const f=fixture(),service=f.create(),state=await service.load(),rows=service.resolve(state);
  assert.deepEqual(state.bookmarks,[{documentId:'doc-1',savedAt:null},{documentId:'native-202',savedAt:null}]);
  assert.equal(rows[0].version.title,'Approved article');assert.equal(rows[1].doc.nativePage,true);assert.equal(rows[1].doc.nativeUrl,'https://example.test/confluence/pages/viewpage.action?pageId=202');
  const query=new URL(f.calls[0].path,'https://example.test').searchParams;assert.match(query.get('cql'),/space = "wcspedia" AND ancestor = 100 AND favourite = currentUser\(\)/);assert.equal(query.get('expand'),'space,ancestors,version');
  assert.equal(service.storageKey,null);assert.equal(state.bookmarks[0].savedAt,null,'native API does not invent a saved timestamp');
});
test('working, navigation, foreign-space and foreign-root pages never enter Saved items',async()=>{
  const f=fixture();f.setResults([page('100'),page('200'),page('500'),page('600'),page('901',{ancestors:[{id:'100'},{id:'900'}]}),page('42',{space:{key:'OTHER'}}),page('43',{ancestors:[{id:'1'}]}),page('202')]);
  assert.deepEqual((await f.create().load()).bookmarks.map(v=>v.documentId),['native-202']);
});
test('native personal label mutation confirms membership directly, even while the CQL index is stale',async()=>{
  const f=fixture(),service=f.create(),initial=await service.load();
  const removed=await service.set('doc-1',false,{expectedRevision:initial.revision});
  assert.deepEqual(removed.bookmarks.map(v=>v.documentId),['native-202']);
  assert.equal(f.calls.find(c=>c.init.method==='DELETE').path,'/rest/api/content/201/label?name=my%3Afavourite');
  const added=await service.set('doc-1',true,{expectedRevision:removed.revision});assert.equal(added.bookmarks.length,2);
  const body=JSON.parse(f.calls.find(c=>c.init.method==='POST').init.body);assert.deepEqual(body,[{prefix:'my',name:'favourite'}]);assert.doesNotMatch(JSON.stringify(body),/user|soeid|global/);
});
test('native favourites scope-check before mutation, pin session and serialize conflicting commands',async()=>{
  const f=fixture(),service=f.create(),state=await service.load();
  const result=await Promise.allSettled([service.set('doc-1',false,{expectedRevision:state.revision}),service.set('native-202',false,{expectedRevision:state.revision})]);
  assert.equal(result[0].status,'fulfilled');assert.equal(result[1].reason.code,'BOOKMARKS_CONFLICT');
  f.setUser({userKey:'other',type:'known'});await assert.rejects(service.set('native-202',false,{expectedRevision:result[0].value.revision}),{code:'BOOKMARKS_IDENTITY'});
  f.setUser({userKey:'user-1',type:'known'});f.pages(id=>page(id,{space:{key:'OTHER'}}));
  await assert.rejects(service.set('native-202',false,{expectedRevision:result[0].value.revision}),{code:'OUT_OF_SCOPE'});
  assert.equal(f.calls.filter(c=>c.init.method).length,1);
});
test('native label errors do not fall back to global labels or report success',async()=>{
  const f=fixture(),service=f.create(),state=await service.load();
  f.override((path,init)=>{if(init.method)throw Object.assign(Error('Denied'),{code:'FORBIDDEN'});});
  await assert.rejects(service.set('doc-1',false,{expectedRevision:state.revision}),{code:'FORBIDDEN'});
  assert.equal(f.calls.filter(c=>c.init.method).length,1);assert.equal(service.resolve(state).length,2);
});
test('a lost favourite response is reconciled through membership without repeating the mutation',async()=>{
  const f=fixture(),service=f.create(),state=await service.load();f.override((path,init)=>{if(init.method==='DELETE'){f.saved.delete('201');throw Object.assign(Error('Disconnected'),{code:'UNKNOWN_COMMIT'});}});
  assert.equal((await service.set('doc-1',false,{expectedRevision:state.revision})).bookmarks.length,1);assert.equal(f.calls.filter(c=>c.init.method).length,1);
});
test('native favourites validate pagination and cancellation without publishing partial results',async()=>{
  const f=fixture(),service=f.create();await service.load();
  f.override(path=>path.includes('/search')?{results:[page('201')],start:0,_links:{next:'https://evil.test/confluence/rest/api/content/search?start=1'}}:undefined);
  await assert.rejects(service.load(),{code:'BOOKMARKS_RESPONSE'});
  const abort=new AbortController();abort.abort();const before=f.calls.length;await assert.rejects(service.load({signal:abort.signal}),{name:'AbortError'});assert.equal(f.calls.length,before);
});
test('existing bookmarks entry point chooses native mode without a custom endpoint or browser preference storage',async()=>{
  const f=fixture(),service=Bookmarks.create({mode:'confluence',config,baseUrl:location.href,nativeStorage:f.storage,...f.options});
  assert.equal((await service.load()).available,true);assert.equal(service.native,true);
});
const payload={type:'Correction',correction:'Use <img src=x onerror=alert(1)> literally.',reason:'The example is outdated.',context:{title:'Article',url:location.href,documentId:'doc-1',nativePageId:'201',version:1,revision:2,anchor:{exact:'Original statement'}}};
function suggestionsFixture(){
  let scope={pageId:'201',commentsEnabled:true,canComment:true,user:{id:'user-1'}},error=null,rows=[],finish;
  const calls=[],comments={resolve:async(id,input)=>{calls.push({kind:'resolve',id,input});return scope;},list:async(id,input)=>{calls.push({kind:'list',id,input});return {comments:rows,nextStart:null};},createComment:async(id,input)=>{calls.push({kind:'post',id,input});if(error)throw error;if(finish)await finish;const result={id:'401',pageId:id,text:input.text,author:{id:'user-1'},createdAt:'2026-10-17T10:00:00.000Z'};rows.push(result);return result;}};
  const service=Suggestions.createService({config,location,comments});
  return {calls,service,setScope:v=>scope={...scope,...v},setError:v=>error=v,setRows:v=>rows=v,hold:()=>{let done;finish=new Promise(r=>done=r);return done;}};
}
test('native suggestion is a plain comment on the actual published page, never a document edit/approval',async()=>{
  const f=suggestionsFixture(),result=await f.service.submit(payload,'suggestion-00001'),post=f.calls.find(c=>c.kind==='post');
  assert.equal(post.id,'201');assert.match(post.input.text,/WCSpedia request: suggestion-00001/);assert.match(post.input.text,/not an edit or approval/);assert.match(post.input.text,/<img src=x onerror=alert\(1\)>/,'text is passed to the native comment helper, which escapes storage markup');
  assert.equal(result.id,'401');assert.equal(f.service.canList,false);await assert.rejects(f.service.list({scope:'mine'}),{code:'NATIVE_COMMENTS'});assert.equal(f.service.canTriage({}),false);assert.equal(f.calls.filter(c=>c.kind==='list').length,0);
});
test('native suggestion preflight respects disabled comments and cannot fall back to the landing page',async()=>{
  const f=suggestionsFixture();f.setScope({commentsEnabled:false});await assert.rejects(f.service.submit(payload,'suggestion-00001'),{code:'COMMENTS_DISABLED'});assert.equal(f.calls.some(c=>c.kind==='post'),false);
  const noTarget=structuredClone(payload);delete noTarget.context.nativePageId;await assert.rejects(f.service.submit(noTarget,'suggestion-00002'),{code:'OUT_OF_SCOPE'});
});
test('simultaneous suggestion retries share one native write and changed payloads cannot reuse the request',async()=>{
  const f=suggestionsFixture(),release=f.hold();const first=f.service.submit(payload,'suggestion-00001'),second=f.service.submit(payload,'suggestion-00001');release();
  assert.deepEqual(await first,await second);assert.equal(f.calls.filter(c=>c.kind==='post').length,1);
  await assert.rejects(f.service.submit({...payload,correction:'Different'},'suggestion-00001'),{code:'CONFLICT'});
});
test('unknown comment outcome is reconciled by exact current-user comment and is never posted twice',async()=>{
  const f=suggestionsFixture();f.setError(Object.assign(Error('Lost response'),{code:'OUTCOME_UNKNOWN',outcome:'unknown'}));
  await assert.rejects(f.service.submit(payload,'suggestion-00001'),{code:'OUTCOME_UNKNOWN'});
  await assert.rejects(f.service.submit(payload,'suggestion-00001'),{code:'OUTCOME_UNKNOWN'});
  const post=f.calls.find(c=>c.kind==='post');f.setRows([{id:'401',text:post.input.text,author:{id:'user-1'}}]);
  assert.equal((await f.service.submit(payload,'suggestion-00001')).id,'401');assert.equal(f.calls.filter(c=>c.kind==='post').length,1);
});
test('another user or changed comment cannot impersonate recovery; canceled suggestions send nothing',async()=>{
  const f=suggestionsFixture();f.setError(Object.assign(Error('Lost'),{code:'OUTCOME_UNKNOWN',outcome:'unknown'}));await assert.rejects(f.service.submit(payload,'suggestion-00001'));
  const post=f.calls.find(c=>c.kind==='post');f.setRows([{id:'401',text:post.input.text,author:{id:'another-user'}}]);await assert.rejects(f.service.submit(payload,'suggestion-00001'),{code:'OUTCOME_UNKNOWN'});
  const abort=new AbortController();abort.abort();await assert.rejects(f.service.submit(payload,'suggestion-00002',{signal:abort.signal}),{name:'AbortError'});assert.equal(f.calls.filter(c=>c.kind==='post').length,1);
});
test('oversized native suggestion is rejected before a comment or attachment can be written',async()=>{
  const f=suggestionsFixture();await assert.rejects(f.service.submit({...payload,correction:'x'.repeat(6000),reason:'y'.repeat(3000),context:{...payload.context,anchor:{exact:'z'.repeat(4000)}}},'suggestion-00001'),{code:'VALIDATION'});assert.equal(f.calls.length,0);
});

test('an empty favourites response after session expiry cannot replace the previous saved list',async()=>{
  const f=fixture(),service=f.create();const original=await service.load();
  f.override(path=>{if(path.includes('/search')){f.setUser({type:'anonymous'});return {results:[],start:0,_links:{}};}});
  await assert.rejects(service.load(),{code:'BOOKMARKS_IDENTITY'});
  f.setUser({type:'known',userKey:'user-1',username:'br47149'});f.override(()=>undefined);f.setResults([]);
  assert.equal((await service.load()).bookmarks.length,0,'A verified genuinely empty result is accepted');
  assert.equal(original.bookmarks.length,2);
});
