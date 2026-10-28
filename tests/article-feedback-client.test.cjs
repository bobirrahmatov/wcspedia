'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'..','article-feedback-client.js'),'utf8');
const valid=()=>({schemaVersion:1,rootPageId:'10',pageId:'40',pageVersion:3,revision:7,totals:{yes:4,no:2,total:6},currentVersionTotals:{yes:3,no:1,total:4},myVote:{value:null,revision:0,pageVersion:null}});
function response(data,status=200){return{ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>data,text:async()=>JSON.stringify(data)};}
function fixture(options={}){const dom=new JSDOM('',{url:'https://example.test/confluence/pages/viewpage.action?pageId=40',runScripts:'outside-only'});const w=dom.window,calls=[];w.crypto.randomUUID=()=> 'e925056a-8512-4c52-8367-7154d9ef3995';w.fetch=async(url,init)=>{calls.push([url,init]);return options.fetch?options.fetch(url,init):response(valid());};w.eval(source);return{w,calls,create(extra={}){return w.WCSArticleFeedback.create({endpoint:'/confluence/rest/wcspedia/feedback',rootPageId:'10',pageId:'40',...extra});},close(){dom.window.close();}};}
test('feedback endpoint and page identities must be local and explicit',()=>{const f=fixture();try{for(const extra of [{endpoint:'https://external.test/confluence/rest/x'},{endpoint:'/outside'},{endpoint:'/confluence/rest/x?token=bad'},{endpoint:'/confluence/rest/x#x'},{endpoint:'https://user:password@example.test/confluence/rest/x'},{rootPageId:''},{pageId:'invalid'}])assert.throws(()=>f.create(extra),undefined,JSON.stringify(extra));assert.equal(f.calls.length,0);}finally{f.close();}});
test('GET is page-specific and no-store; POST uses returned vote revision and server identity, once',async()=>{
 const f=fixture({fetch:async(url,init)=>response(init.method==='POST'?{...valid(),accepted:true,changed:true,requestId:JSON.parse(init.body).requestId,myVote:{value:'yes',revision:1,pageVersion:3}}:valid())});try{const client=f.create();const loaded=await client.load();assert.equal(loaded.vote,null);assert.equal(loaded.canVote,true);const get=new URL(f.calls[0][0]);assert.equal(get.searchParams.get('rootPageId'),'10');assert.equal(get.searchParams.get('pageId'),'40');assert.equal(f.calls[0][1].credentials,'same-origin');assert.equal(f.calls[0][1].cache,'no-store');assert.equal(f.calls[0][1].redirect,'error');const saved=await client.save('yes');assert.equal(saved.vote,'yes');assert.equal(f.calls.length,2);const init=f.calls[1][1],body=JSON.parse(init.body);assert.equal(body.expectedVoteRevision,0);assert.equal(body.pageVersion,3);assert.equal(body.requestId,init.headers['Idempotency-Key']);assert.equal(body.actorId,undefined);assert.equal(body.user,undefined);assert.equal(init.headers['X-Requested-With'],'XMLHttpRequest');}finally{f.close();}
});
test('fresh GET updates revision after viewer or version changes without sending actor data',async()=>{
 let n=0;const f=fixture({fetch:async(url,init)=>{n++;return response(init.method==='POST'?{...valid(),accepted:true,changed:true,requestId:JSON.parse(init.body).requestId,pageVersion:4,myVote:{value:'no',revision:10,pageVersion:4}}:n===1?valid():{...valid(),pageVersion:4,myVote:{value:'yes',revision:9,pageVersion:4}});}});try{const client=f.create();await client.load();await client.load();await client.save('no');const body=JSON.parse(f.calls[2][1].body);assert.equal(body.expectedVoteRevision,9);assert.equal(body.pageVersion,4);assert.equal(body.actorId,undefined);}finally{f.close();}
});
test('invalid server feedback is rejected instead of becoming authorized saved state',async()=>{
 const cases=[{schemaVersion:2},{rootPageId:'99'},{pageId:'99'},{pageVersion:0},{revision:-1},{totals:{yes:-1,no:2,total:1}},{totals:{yes:2,no:2,total:9}},{currentVersionTotals:{yes:1.5,no:0,total:1.5}},{myVote:{value:'maybe',revision:0,pageVersion:null}},{myVote:{value:'yes',revision:1,pageVersion:0}}];
 for(const change of cases){const f=fixture({fetch:async()=>response({...valid(),...change})});try{await assert.rejects(f.create().load(),undefined,JSON.stringify(change));assert.equal(f.calls.length,1);}finally{f.close();}}
});
test('definite rejection and unknown save do not trigger automatic retries',async()=>{
 for(const status of [403,409,500,'network']){let n=0;const f=fixture({fetch:async()=>{n++;if(n===1)return response(valid());if(status==='network')throw Error('offline');return response({},status);}});try{const client=f.create();await client.load();await assert.rejects(client.save('no'),error=>status===403||status===409?error.outcome==='rejected':error.outcome!=='rejected');assert.equal(f.calls.length,2);}finally{f.close();}}
});
test('save before load and invalid vote fail locally without network',async()=>{const f=fixture();try{const client=f.create();await assert.rejects(client.save('yes'));assert.equal(f.calls.length,0);await client.load();await assert.rejects(client.save('other'));assert.equal(f.calls.length,1);}finally{f.close();}});
test('only one vote mutation is in flight and mismatched receipts never confirm a save',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const f=fixture({fetch:async(url,init)=>init.method==='POST'?pending:response(valid())});try{const client=f.create();await client.load();const first=client.save('yes');await assert.rejects(client.save('no'),error=>error.outcome==='rejected');assert.equal(f.calls.length,2);finish(response({...valid(),accepted:true,changed:true,requestId:'different-request',myVote:{value:'yes',revision:1,pageVersion:3}}));await assert.rejects(first,error=>error.outcome==='unknown');assert.equal(f.calls.length,2);}finally{f.close();}
});
test('older Confluence browsers use secure random bytes when randomUUID is unavailable',async()=>{
 const f=fixture({fetch:async(url,init)=>response(init.method==='POST'?{...valid(),accepted:true,changed:true,requestId:JSON.parse(init.body).requestId,myVote:{value:'yes',revision:1,pageVersion:3}}:valid())});try{f.w.crypto.randomUUID=undefined;const client=f.create();await client.load();await client.save('yes');const body=JSON.parse(f.calls[1][1].body);assert.match(body.requestId,/^[a-f0-9]{48}$/);}finally{f.close();}
});

function nativeValid(extra={}){return{schemaVersion:1,rootPageId:'10',pageId:'40',pageVersion:3,canVote:true,canRecord:true,myVote:{value:null,revision:0,pageVersion:null},pendingVote:null,views:{recordedViews:5},...extra};}
function nativeFixture(options={}){
 const f=fixture(),nativeCalls=[];
 const api={load:async(pageId,args)=>{nativeCalls.push(['load',pageId,args]);return options.load?options.load(pageId,args):nativeValid();},vote:async(pageId,value,args)=>{nativeCalls.push(['vote',pageId,value,args]);return options.vote?options.vote(pageId,value,args):{schemaVersion:1,accepted:true,requestId:args.requestId,pageId,pageVersion:3,canVote:true,myVote:{value,revision:1,pageVersion:3}};}};
 f.w.WCSSpaceEngagement={create:()=>api};
 return{...f,nativeCalls,api,create(extra={}){return f.w.WCSArticleFeedback.create({authoringMode:'confluence-session',config:{authoringMode:'confluence-session',rootPageId:'10',spaceKey:'wcspedia'},pageId:'40',...extra});}};
}
test('native feedback reads and mutates page JSON through the existing engagement adapter without service fetch',async()=>{
 const f=nativeFixture();try{const client=f.create();assert.equal(f.nativeCalls.length,0);const loaded=await client.load();assert.equal(loaded.canVote,true);assert.equal(loaded.vote,null);const signal=new f.w.AbortController().signal;const saved=await client.save('yes',{signal});assert.equal(saved.vote,'yes');assert.equal(saved.source,'confluence-json');assert.equal(f.calls.length,0);assert.equal(f.nativeCalls.length,2);assert.equal(f.nativeCalls[1][1],'40');const command=f.nativeCalls[1][3];assert.equal(command.expectedVoteRevision,0);assert.equal(command.pageVersion,3);assert.equal(command.signal,signal);assert.equal(command.actorId,undefined);assert.equal(command.user,undefined);}finally{f.close();}
});
test('native prime reuses verified loaded data without a second API read; read-only accounts cannot vote',async()=>{
 const f=nativeFixture();try{const client=f.create();const view=client.prime(nativeValid({canVote:false,reason:'Native edit required'}));assert.equal(view.canVote,false);assert.equal(view.reason,'Native edit required');await assert.rejects(client.save('yes'),e=>e.outcome==='rejected');assert.equal(f.nativeCalls.length,0);client.prime(nativeValid());await client.save('no');assert.equal(f.nativeCalls[0][0],'vote');}finally{f.close();}
});
test('native one-flight guard and definite permission denial never confirm feedback or retry automatically',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const f=nativeFixture({vote:()=>pending});try{const client=f.create();await client.load();const save=client.save('yes');await assert.rejects(client.save('no'),e=>e.outcome==='rejected');resolve({accepted:true,requestId:f.nativeCalls[1][3].requestId,pageId:'40',pageVersion:3,canVote:true,myVote:{value:'yes',revision:1,pageVersion:3}});assert.equal((await save).vote,'yes');assert.equal(f.nativeCalls.length,2);}finally{f.close();}
 const denied=nativeFixture({vote:async()=>{throw Object.assign(Error('Denied'),{code:'FORBIDDEN'});}});try{const client=denied.create();await client.load();await assert.rejects(client.save('yes'),e=>e.outcome==='rejected');assert.equal(denied.nativeCalls.length,2);}finally{denied.close();}
});
test('unknown native save preserves the original request ID for explicit same-choice reconciliation',async()=>{
 let writes=0;const f=nativeFixture({vote:async(pageId,value,args)=>{if(++writes===1)throw Object.assign(Error('Lost reply'),{code:'UNKNOWN_COMMIT'});return{accepted:true,requestId:args.requestId,pageId,pageVersion:3,canVote:true,myVote:{value,revision:1,pageVersion:3}};}});try{const client=f.create();await client.load();await assert.rejects(client.save('yes'),e=>e.outcome!=='rejected');assert.equal(f.nativeCalls.length,2);await client.save('yes');assert.equal(f.nativeCalls.length,3);assert.equal(f.nativeCalls[1][3].requestId,f.nativeCalls[2][3].requestId);}finally{f.close();}
});
test('unresolved native Check stays read-only, blocks new choices and preserves the exact original retry',async()=>{
 let command,writes=0;const f=nativeFixture({load:async()=>nativeValid(command?{pendingVote:command,pageVersion:4}:{}),vote:async(pageId,value,args)=>{command={value,requestId:args.requestId,expectedVoteRevision:args.expectedVoteRevision,pageVersion:args.pageVersion};if(++writes===1)throw Object.assign(Error('Lost reply'),{code:'UNKNOWN_COMMIT'});return{accepted:true,requestId:args.requestId,pageId,pageVersion:4,canVote:true,myVote:{value,revision:1,pageVersion:3}};}});
 try{const client=f.create();await client.load();await assert.rejects(client.save('yes'));const checked=await client.load();assert.equal(checked.pendingVote.value,'yes');assert.equal(checked.vote,null);assert.equal(writes,1);await assert.rejects(client.save('no'),e=>e.outcome==='unknown');assert.equal(writes,1);const saved=await client.save('yes');assert.equal(saved.vote,'yes');assert.equal(saved.pendingVote,null);const commands=f.nativeCalls.filter(c=>c[0]==='vote').map(c=>c[3]);assert.equal(commands[0].requestId,commands[1].requestId);assert.equal(commands[1].pageVersion,3);assert.equal(commands[1].expectedVoteRevision,0);}finally{f.close();}
});
test('rejected original retry remains unknown until a native Check proves it resolved',async()=>{
 let writes=0,unresolved=false;const f=nativeFixture({load:async()=>nativeValid({pendingVote:unresolved?{value:'yes',requestId:'retained',expectedVoteRevision:0,pageVersion:3}:null}),vote:async()=>{unresolved=true;throw Object.assign(Error(++writes===1?'Lost reply':'Permission changed'),{code:writes===1?'UNKNOWN_COMMIT':'FORBIDDEN'});}});
 try{const client=f.create();await client.load();await assert.rejects(client.save('yes'));await client.load();await assert.rejects(client.save('yes'),e=>e.outcome==='unknown');assert.equal((await client.load()).pendingVote.value,'yes');unresolved=false;assert.equal((await client.load()).pendingVote,null);assert.equal(writes,2);}finally{f.close();}
});
test('native adapter validates page IDs and all saved state before authorizing a vote',async()=>{
 const changes=[{schemaVersion:2},{pageId:'99'},{pageVersion:0},{myVote:{value:'yes',revision:-1,pageVersion:3}},{myVote:{value:'yes',revision:1,pageVersion:4}},{myVote:{value:null,revision:1,pageVersion:3}},{pendingVote:{value:'yes',requestId:'bad id',expectedVoteRevision:0,pageVersion:3}},{pendingVote:{value:'yes',requestId:'valid',expectedVoteRevision:0,pageVersion:4}}];
 for(const change of changes){const f=nativeFixture({load:async()=>nativeValid(change)});try{await assert.rejects(f.create().load(),undefined,JSON.stringify(change));assert.equal(f.nativeCalls.filter(c=>c[0]==='vote').length,0);}finally{f.close();}}
 const f=nativeFixture();try{assert.throws(()=>f.create({pageId:'invalid'}));assert.equal(f.nativeCalls.length,0);}finally{f.close();}
});
test('native save requires a matching accepted receipt and request identity',async()=>{
 for(const change of [{accepted:false},{pageId:'999'},{requestId:'wrong-request'},{pageVersion:0},{myVote:{value:'yes',revision:0,pageVersion:3}}]){
 const f=nativeFixture({vote:async(pageId,value,args)=>({schemaVersion:1,accepted:true,requestId:args.requestId,pageId,pageVersion:3,canVote:true,myVote:{value,revision:1,pageVersion:3},...change})});try{const client=f.create();await client.load();await assert.rejects(client.save('yes'),e=>e.outcome!=='rejected',JSON.stringify(change));assert.equal(f.nativeCalls.filter(c=>c[0]==='vote').length,1);}finally{f.close();}
 }
});
test('native feedback also supports secure random bytes when randomUUID is unavailable',async()=>{
 const f=nativeFixture();try{f.w.crypto.randomUUID=undefined;const client=f.create();await client.load();await client.save('yes');assert.match(f.nativeCalls[1][3].requestId,/^[a-f0-9]{48}$/);}finally{f.close();}
});
test('native feedback confirmation composes with the real engagement module and versioned property writes',async()=>{
 const E=require('../space-engagement.js'),{webcrypto}=require('node:crypto'),properties=new Map();let nextId=1,nonce=0;
 const config={rootPageId:'10',spaceKey:'wcspedia',nativePublication:{areaPageIds:{credit:'20'},workingRootPageId:'12'}};
 const storage={
  page:async()=>({id:'40',type:'page',status:'current',space:{key:'wcspedia'},ancestors:[{id:'10'},{id:'20'}],version:{number:3},operations:[{operation:'update',targetType:'page'}]}),
  user:async()=>({type:'known',userKey:'PRIVATE_NATIVE_ACCOUNT'}),
  request:async path=>{const key=path.match(/\/property\/([^?]+)/)[1],property=properties.get(key);if(!property)throw Object.assign(Error('missing'),{status:404});return property;},
  putProperty:async(pageId,key,value,expected)=>{const before=properties.get(key);assert.equal(expected,before?before.version.number:null);const property={id:before?before.id:String(nextId++),key,value,version:{number:before?before.version.number+1:1}};properties.set(key,property);return property;}
 };
 const api=E.create(config,{storage,crypto:webcrypto,now:()=>Date.parse('2026-10-17T12:00:00.000Z')}),f=nativeFixture();
 try{f.w.crypto.randomUUID=()=> 'real-native-command-'+(++nonce);const client=f.create({engagement:api});assert.equal((await client.load()).vote,null);assert.equal((await client.save('yes')).vote,'yes');assert.equal((await client.save('no')).vote,'no');assert.equal((await client.load()).vote,'no');assert.equal(properties.size,1);assert.equal([...properties.values()][0].version.number,2);assert.equal(f.calls.length,0);assert.doesNotMatch(JSON.stringify([...properties]),/PRIVATE_NATIVE_ACCOUNT/);}finally{f.close();}
});
