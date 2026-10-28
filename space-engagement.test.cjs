'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const E=require('./space-engagement.js'),S=require('./space-storage.js');
const origin='https://confluence.test',clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}) {
 const state={calls:[],props:new Map(),user:{type:'known',userKey:'account-one',username:'BR47149'},now:Date.parse('2026-10-17T12:00:00Z'),next:10,writes:0,afterWrite:null,...options.state};
 const pages=new Map([['100',[]],['101',['100']],['102',['100','101']],['103',['100','101']],['150',['100']],['151',['100','150']],['160',['100']],['161',['100','101','160']],['170',['100']]].map(([id,ancestors])=>[id,{id,type:'page',status:'current',space:{key:'wcspedia'},ancestors:ancestors.map(id=>({id})),version:{number:2},operations:[{operation:'update',targetType:'page'}]}]));
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 async function fetch(input,init={}) {
  const u=new URL(input),path=u.pathname.slice('/confluence'.length),method=init.method||'GET';state.calls.push({path,method,u,init});
  if(options.intercept){const r=await options.intercept({state,pages,u,path,method,init,response});if(r!==undefined)return r;}
  if(path==='/rest/api/user/current')return response(state.user);
  let m;if((m=/^\/rest\/api\/content\/(\d+)$/.exec(path)))return response(pages.get(m[1])||{},pages.has(m[1])?200:404);
  if((m=/^\/rest\/api\/content\/(\d+)\/property(?:\/(.+))?$/.exec(path))){
   const page=m[1],key=m[2];
   if(method==='GET'){
    if(key)return response(state.props.get(page+':'+key)||{},state.props.has(page+':'+key)?200:404);
    const list=[...state.props.entries()].filter(([k])=>k.startsWith(page+':')).map(([,v])=>v),start=Number(u.searchParams.get('start')),limit=Number(u.searchParams.get('limit')),results=list.slice(start,start+limit);
    return response({results,start,size:results.length,_links:start+limit<list.length?{next:'/confluence/rest/api/content/'+page+'/property?start='+(start+limit)+'&limit='+limit}:{}});
   }
   const body=JSON.parse(init.body),k=page+':'+body.key,prev=state.props.get(k);
   if(method==='POST'&&prev||method==='PUT'&&(!prev||body.id!==prev.id||body.version.number!==prev.version.number+1))return response({},409);
   const value={id:prev?prev.id:String(++state.next),key:body.key,value:body.value,version:{number:prev?prev.version.number+1:1}};state.props.set(k,value);state.writes++;
   if(state.afterWrite){const a=state.afterWrite;state.afterWrite=null;await a({state,value});}
   return response(value);
  }
  return response({},404);
 }
 const config={contextPath:'/confluence',spaceKey:'wcspedia',rootPageId:'100',pageIds:{home:'100',mine:'170'},attachmentPageId:'170',nativePublication:{areaPageIds:{area:'101'},insightsPageId:'150',workingRootPageId:'160'},...options.config};
 const store=S.create({...config,protectedPageIds:['100','101','150','160','170']},{origin,fetch,crypto:webcrypto});
 const make=()=>E.create(config,{storage:store,origin,crypto:webcrypto,now:()=>state.now});
 return {state,pages,store,api:make(),make,config,seed(key,value,version=1,page='102'){state.props.set(page+':'+key,{id:String(++state.next),key,value:clone(value),version:{number:version}});}};
}
function viewCommand(at,suffix='a'){return 'wcsview-'+at+'-'+suffix.repeat(32);}
test('normal load fetches only own vote and known view ledger, not a property scan',async()=>{
 const f=fixture(),v=await f.api.load('102');assert.equal(v.canVote,true);assert.equal(v.canRecord,true);assert.equal(v.views.recordedViews,0);assert.equal(v.myVote.value,null);assert.equal(v.totals,null);
 assert.equal(f.state.calls.filter(c=>c.path.includes('/property/')).length,2);assert.equal(f.state.calls.some(c=>c.path.endsWith('/property')),false);assert.equal(f.state.writes,0);
 assert.equal(v.coverage.completeConfluenceTraffic,false);
});
test('current user is loaded natively and hashed keys contain no username or user key',async()=>{
 const f=fixture();await f.api.vote('102','yes',{requestId:'vote-1',expectedVoteRevision:0});
 const [key]=f.state.props.keys();assert.match(key,/102:wcspedia-helpfulness-v1-[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify([...f.state.props]),/BR47149|account-one/);
 const loaded=await f.api.load('102');assert.equal(loaded.myVote.value,'yes');assert.equal(loaded.myVote.revision,1);
});
test('same user changes one vote; distinct native users have independent votes',async()=>{
 const f=fixture();await f.api.vote('102','yes',{requestId:'yes-1'});await f.api.vote('102','no',{requestId:'no-2',expectedVoteRevision:1});
 f.state.user={type:'known',userKey:'account-two'};await f.api.vote('102','yes',{requestId:'yes-3'});
 const report=await f.api.exportDocument('102');assert.deepEqual([report.helpfulness.yes,report.helpfulness.no,report.helpfulness.total],[1,1,2]);assert.equal(f.state.props.size,2);
 assert.doesNotMatch(JSON.stringify(report),/account-one|account-two|requestId|wcspedia-helpfulness-v1-/);
});
test('out of scope, parent, control and Working descendant pages reject engagement',async()=>{
 const f=fixture();for(const id of ['100','101','150','160','161','170'])await assert.rejects(f.api.load(id),e=>e.code==='OUT_OF_SCOPE');
 f.pages.get('102').space.key='other';await assert.rejects(f.api.vote('102','yes'),e=>['SCOPE','OUT_OF_SCOPE'].includes(e.code));assert.equal(f.state.writes,0);
});
test('Insights descendants are eligible while unrelated WCSpedia pages are rejected',async()=>{
 const f=fixture();assert.equal((await f.api.load('151')).canVote,true);f.pages.get('103').ancestors=[{id:'100'}];await assert.rejects(f.api.recordView('103'),e=>e.code==='OUT_OF_SCOPE');
});
test('native read-only account sees totals but cannot write or pretend success',async()=>{
 const f=fixture();f.pages.get('102').operations=[];const loaded=await f.api.load('102');assert.equal(loaded.canVote,false);assert.equal(loaded.canRecord,false);assert.match(loaded.reason,/edit permission/);
 for(const task of [()=>f.api.vote('102','yes'),()=>f.api.recordView('102')])await assert.rejects(task(),e=>e.code==='FORBIDDEN');assert.equal(f.state.writes,0);
});
test('anonymous accounts are unavailable for writes without generating identity data',async()=>{
 const f=fixture();f.state.user={type:'anonymous'};assert.equal((await f.api.load('102')).canVote,false);await assert.rejects(f.api.recordView('102'),e=>e.code==='AUTH_REQUIRED');assert.equal(f.state.writes,0);
});
test('vote revision conflict never overwrites another tab vote',async()=>{
 const f=fixture();await f.api.vote('102','yes',{expectedVoteRevision:0});await assert.rejects(f.api.vote('102','no',{expectedVoteRevision:0}),e=>e.code==='CONFLICT');assert.equal((await f.api.load('102')).myVote.value,'yes');assert.equal(f.state.writes,1);
});
test('lost vote response is reconciled using original receipt without double writing',async()=>{
 const f=fixture();f.state.afterWrite=async()=>{throw Error('reply lost');};const vote=await f.api.vote('102','yes',{requestId:'lost-vote'});assert.equal(vote.accepted,true);assert.equal(f.state.writes,1);
 const again=await f.api.vote('102','yes',{requestId:'lost-vote'});assert.equal(again.accepted,true);assert.equal(f.state.writes,1);
});
test('view recording shares total and deduplicates rolling 30 minutes per account',async()=>{
 const f=fixture();assert.equal((await f.api.recordView('102')).recordedViews,1);f.state.now+=1000;assert.equal((await f.api.recordView('102')).deduplicated,true);
 f.state.now+=30*60*1000;assert.equal((await f.api.recordView('102')).recordedViews,2);
 f.state.user={type:'known',userKey:'other'};assert.equal((await f.api.recordView('102')).recordedViews,3);assert.equal((await f.api.load('102')).views.recordedViews,3);assert.equal(f.state.writes,3);
});
test('different documents have separate view ledgers and account hashes',async()=>{
 const f=fixture();await f.api.recordView('102');await f.api.recordView('103');assert.equal((await f.api.load('102')).views.recordedViews,1);assert.equal((await f.api.load('103')).views.recordedViews,1);
 const keys=[...f.state.props.values()].map(p=>Object.keys(p.value.active)[0]);assert.notEqual(keys[0],keys[1]);
});
test('lost view write response reconciles exact receipt and does not increment twice',async()=>{
 const f=fixture(),requestId=viewCommand(f.state.now);f.state.afterWrite=async()=>{throw Error('reply lost');};assert.equal((await f.api.recordView('102',{requestId})).recordedViews,1);assert.equal((await f.api.recordView('102',{requestId})).recordedViews,1);assert.equal(f.state.writes,1);
});
test('delayed retries expire instead of recounting after ledger dedup entries are pruned',async()=>{
 const f=fixture(),requestId=viewCommand(f.state.now);await f.api.recordView('102',{requestId});f.state.now+=30*60*1000;
 await assert.rejects(f.make().recordView('102',{requestId}),e=>e.code==='EXPIRED');assert.equal(f.state.writes,1);
});
test('view CAS retries merge other account increments without losing count',async()=>{
 let first=true;const f=fixture({intercept:({state,path,method,response})=>{if(first&&method==='POST'&&path.endsWith('/property')){first=false;const value={schemaVersion:1,pageId:'102',count:1,lastRecordedAt:new Date(state.now).toISOString(),active:{['f'.repeat(64)]:{at:state.now,requestId:viewCommand(state.now,'b')}}};state.props.set('102:'+E.viewKey,{id:'90',key:E.viewKey,value,version:{number:1}});return response({},409);}}});
 const recorded=await f.api.recordView('102');assert.equal(recorded.recordedViews,2);assert.equal(Object.keys(f.state.props.get('102:'+E.viewKey).value.active).length,2);
});
test('view capacity is explicit and never silently drops an active dedup entry',async()=>{
 const f=fixture(),active={};for(let i=0;i<180;i++)active[i.toString(16).padStart(64,'0')]={at:f.state.now,requestId:viewCommand(f.state.now)};
 f.seed(E.viewKey,{schemaVersion:1,pageId:'102',count:180,lastRecordedAt:new Date(f.state.now).toISOString(),active});
 await assert.rejects(f.api.recordView('102'),e=>e.code==='CAPACITY');assert.equal(f.state.writes,0);
 f.state.now+=30*60*1000;assert.equal((await f.api.recordView('102')).recordedViews,181);assert.equal(Object.keys(f.state.props.get('102:'+E.viewKey).value.active).length,1);
});
test('native denial after preflight remains an error with no success receipt',async()=>{
 const f=fixture({intercept:({path,method,response})=>method==='POST'&&path.endsWith('/property')?response({},403):undefined});await assert.rejects(f.api.recordView('102'),e=>e.code==='FORBIDDEN');assert.equal(f.state.writes,0);
});
test('malformed/oversized JSON errors instead of resetting historical data to zero',async()=>{
 const f=fixture();f.seed(E.viewKey,{schemaVersion:1,pageId:'102',count:-1,active:{},lastRecordedAt:null});await assert.rejects(f.api.load('102'),e=>e.code==='INVALID_DATA');await assert.rejects(f.api.recordView('102'),e=>e.code==='INVALID_DATA');
 f.seed(E.viewKey,{schemaVersion:1,pageId:'102',count:0,active:{},lastRecordedAt:null,junk:'x'.repeat(32000)});await assert.rejects(f.api.load('102'),e=>e.code==='CAPACITY');assert.equal(f.state.writes,0);
});
test('explicit export scans bounded pages, aggregates versions and never exports individual votes',async()=>{
 const f=fixture();for(let i=0;i<51;i++)f.seed(E.votePrefix+i.toString(16).padStart(64,'0'),{schemaVersion:1,pageId:'102',value:i%2?'no':'yes',pageVersion:i%2?1:2,updatedAt:new Date(f.state.now).toISOString(),requestId:'seed-'+i});
 await f.api.recordView('102');f.state.calls.length=0;const report=await f.api.exportDocument('102');assert.equal(report.helpfulness.total,51);assert.equal(report.helpfulness.currentVersionTotals.total,26);assert.equal(report.helpfulness.byPageVersion.length,2);assert.equal(report.views.recordedViews,1);assert.equal(report.coverage.activeViewCapacity,180);
 assert.equal(f.state.calls.filter(c=>c.path.endsWith('/property')&&c.method==='GET').length,2);assert.doesNotMatch(JSON.stringify(report),/seed-|"active"|requestId|updatedAt/);
});
test('export rejects malformed property pagination, duplicates, limits and future votes',async()=>{
 const f=fixture({config:{maxEngagementProperties:1}});for(let i=0;i<2;i++)f.seed('other-'+i,{ok:true});await assert.rejects(f.api.exportDocument('102'),e=>e.code==='LIMIT');
 const bad=fixture({intercept:({path,response})=>path.endsWith('/property')?response({results:[],_links:{next:'/confluence/rest/api/content/102/property?start=50'}}):undefined});await assert.rejects(bad.api.exportDocument('102'),e=>e.code==='INVALID_DATA');
 const future=fixture();future.seed(E.votePrefix+'a'.repeat(64),{schemaVersion:1,pageId:'102',value:'yes',pageVersion:3,updatedAt:new Date(future.state.now).toISOString(),requestId:'future'});await assert.rejects(future.api.exportDocument('102'),e=>e.code==='INVALID_DATA');
});
test('export supports already verified read-only storage shim without user/crypto or writes',async()=>{
 const f=fixture();const api=E.create(f.config,{storage:{page:async id=>f.pages.get(id),request:async()=>({results:[],_links:{}})},now:()=>f.state.now});
 const report=await api.exportDocument('102',{pageVersion:2});assert.equal(report.views.recordedViews,0);assert.equal(report.helpfulness.total,0);assert.equal(f.state.calls.length,0);await assert.rejects(api.exportDocument('102',{pageVersion:1}),e=>e.code==='CONFLICT');
});
test('aborted load and export do not submit writes or return partial analytics',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.api.exportDocument('102',{signal:controller.signal}),e=>e.name==='AbortError');await assert.rejects(f.api.load('102',{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(f.state.writes,0);
});
test('a failed read before any vote write does not leave a false unknown pending vote',async()=>{
 let reject=true;const f=fixture({intercept:({path,method,response})=>{if(reject&&method==='GET'&&path.includes('/property/'+E.votePrefix)){reject=false;return response({},503);}}});
 await assert.rejects(f.api.vote('102','yes'));assert.equal(f.state.writes,0);assert.equal((await f.api.vote('102','no')).myVote.value,'no');assert.equal(f.state.writes,1);
});
test('helpfulness rejects stale article version and oversized view requests before writing',async()=>{
 const f=fixture();await assert.rejects(f.api.vote('102','yes',{pageVersion:1}),e=>e.code==='CONFLICT');await assert.rejects(f.api.recordView('102',{requestId:'uuid-without-original-time'}),e=>e.code==='CONFIGURATION');assert.equal(f.state.writes,0);
});
test('export rejects foreign origin and wrong context continuation links',async()=>{
 for(const next of ['https://evil.test/confluence/rest/api/content/102/property?start=1','/wrong/rest/api/content/102/property?start=1']){
  const f=fixture({intercept:({path,response})=>path.endsWith('/property')?response({results:[{key:'unrelated'}],start:0,size:1,_links:{next}}):undefined});await assert.rejects(f.api.exportDocument('102'),e=>e.code==='INVALID_DATA');
 }
});
test('checking a confirmed saved vote releases pending unknown state before a later choice',async()=>{
 let denyReads=false;const f=fixture({intercept:({path,method})=>{if(denyReads&&method==='GET'&&path.includes('/property/'+E.votePrefix))throw Error('offline');}});
 f.state.afterWrite=async()=>{denyReads=true;throw Error('write reply lost');};await assert.rejects(f.api.vote('102','yes',{requestId:'unknown-vote'}),e=>e.code==='UNKNOWN_COMMIT');
 denyReads=false;assert.equal((await f.api.load('102')).myVote.value,'yes');assert.equal((await f.api.vote('102','no',{requestId:'new-vote',expectedVoteRevision:1})).myVote.value,'no');assert.equal(f.state.writes,2);
});
test('an absent read keeps an unknown vote pending and explicit retry uses its original version and request',async()=>{
 let lose=true;const f=fixture({intercept:({method,path})=>{if(lose&&method==='POST'&&path.endsWith('/property')){lose=false;throw Error('request outcome unknown');}}});
 await assert.rejects(f.api.vote('102','yes',{requestId:'original-vote',expectedVoteRevision:0,pageVersion:2}),e=>e.code==='UNKNOWN_COMMIT');
 const before=f.state.calls.filter(c=>c.method==='POST').length,snapshot=await f.api.load('102');
 assert.equal(snapshot.myVote.value,null);assert.deepEqual(snapshot.pendingVote,{value:'yes',requestId:'original-vote',expectedVoteRevision:0,pageVersion:2});
 assert.equal(f.state.calls.filter(c=>c.method==='POST').length,before,'Check must never resubmit');
 await assert.rejects(f.api.vote('102','no'),e=>e.code==='UNKNOWN_COMMIT');
 f.pages.get('102').version.number=3;
 const saved=await f.api.vote('102','yes',{requestId:'original-vote',expectedVoteRevision:0,pageVersion:2});
 assert.equal(saved.pageVersion,3);assert.equal(saved.myVote.pageVersion,2);assert.equal(saved.requestId,'original-vote');assert.equal(f.state.writes,1);
 assert.equal((await f.api.load('102')).pendingVote,null);
});
test('an unchanged saved vote keeps the pending change while a newer revision safely supersedes it',async()=>{
 let lose=false;const f=fixture({intercept:({method,path})=>{if(lose&&method==='PUT'&&path.includes('/property/')){lose=false;throw Error('request outcome unknown');}}});
 await f.api.vote('102','no',{requestId:'first'});lose=true;
 await assert.rejects(f.api.vote('102','yes',{requestId:'pending-change',expectedVoteRevision:1}),e=>e.code==='UNKNOWN_COMMIT');
 const unchanged=await f.api.load('102');assert.equal(unchanged.myVote.value,'no');assert.equal(unchanged.pendingVote.requestId,'pending-change');
 const prop=[...f.state.props.values()][0];prop.version.number=2;prop.value.requestId='other-tab';
 assert.equal((await f.api.load('102')).pendingVote,null);
 await f.api.vote('102','yes',{requestId:'new-choice',expectedVoteRevision:2});assert.equal(f.state.writes,2);
});

test('a native missing-property JSON response means no previous vote, and first vote creates it',async()=>{
 const f=fixture({intercept:({path,method,state,response})=>{
  const key=path.split('/property/')[1];
  if(method==='GET'&&key&&!state.props.has('102:'+key))return response({statusCode:404,data:{authorized:false,valid:true},message:'No content property found with key: '+key,reason:'Not Found'},404);
 }});
 const loaded=await f.api.load('102');assert.equal(loaded.canVote,true);assert.equal(loaded.myVote.value,null);assert.equal(loaded.views.recordedViews,0);
 const saved=await f.api.vote('102','yes',{requestId:'first-vote',expectedVoteRevision:0});assert.equal(saved.myVote.value,'yes');assert.equal(f.state.writes,1);
});

test('card view counts verify the article but do not fetch identity or helpfulness',async()=>{
 const f=fixture();const result=await f.api.loadViews('102');assert.equal(result.pageId,'102');assert.equal(result.views.recordedViews,0);assert.equal(f.state.writes,0);
 assert.equal(f.state.calls.filter(c=>c.path.includes('/property/')).length,1);assert.ok(f.state.calls.some(c=>c.path.endsWith('/content/102')));assert.ok(!f.state.calls.some(c=>c.path.includes('/user/')||c.path.includes('helpfulness')));
 await assert.rejects(f.api.loadViews('161'));await assert.rejects(f.api.loadViews('170'));
});
