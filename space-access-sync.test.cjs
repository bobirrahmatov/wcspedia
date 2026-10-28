'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto,randomUUID}=require('node:crypto');
const S=require('./space-access-sync.js'),E=require('./entitlements.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const p={schemaVersion:1,revision:1,audit:[],records:[{id:'admin',soeid:'ADMIN1',displayName:'Admin',scope:'*',permissions:[...E.PERMISSIONS],active:true},{id:'author',soeid:'AUTHOR1',displayName:'Author',scope:'*',permissions:['content.create','content.edit'],active:true}]};
 const state={journal:null,read:{user:[{type:'known',username:'ADMIN1'}],group:[]},edit:{user:[{type:'known',username:'ADMIN1'}],group:[]},grants:new Map([['key-ADMIN1',['space:read','space:restrict','space:administer','page:create','page:delete','attachment:create']]]),writes:[],actor:'ADMIN1',admin:true,parentEdit:true,ancestors:[],fail:null,hook:null};
 const user=name=>({type:'known',username:name,userKey:'key-'+name});
 const storage={
  user:async()=>user(state.actor),
  page:async id=>({id,space:{key:'wcspedia'},ancestors:id==='200'?state.ancestors:[],operations:(id!=='200'||state.parentEdit)?[{operation:'update',targetType:'page'}]:[]}),
  property:async()=>copy(state.journal),
  putProperty:async(id,key,v,version)=>{if(version!==(state.journal?.version.number??null))throw Object.assign(Error('CAS conflict'),{code:'CONFLICT'});state.journal={key,value:copy(v),version:{number:(version||0)+1}};return copy(state.journal);},
  request:async(path,init={})=>{
   const u=new URL(path,'https://test'),method=init.method||'GET';if(state.hook)await state.hook(path,method);
   if(state.fail?.(path,method))throw Object.assign(Error('Denied '+path),{status:403});
   if(path.startsWith('/rest/api/user?'))return user(u.searchParams.get('username'));
   if(path.includes('/permissions/user/')){const key=decodeURIComponent(u.pathname.split('/')[7]);const current=state.grants.get(key)||[];
    if(method==='GET')return current.map(op=>{const [targetType,operationKey]=op.split(':');return {spaceKey:'wcspedia',operation:{targetType,operationKey}};});
    const ops=JSON.parse(init.body).map(o=>o.targetType+':'+o.operationKey);state.writes.push([method,path,ops]);
    state.grants.set(key,path.endsWith('/grant')?[...new Set(current.concat(ops))]:current.filter(op=>!ops.includes(op)));return null;}
   if(path.startsWith('/rest/api/space/'))return {key:'wcspedia',operations:state.admin?[{operation:'administer',targetType:'space'}]:[]};
   if(path.includes('/restriction/byOperation/')){const op=u.pathname.split('/').at(-1);const r=path.includes('/300/')?{user:[{type:'known',username:'EXTERNAL'}],group:[]}:state[op==='read'?'read':'edit'];return {operation:op,restrictions:{user:{results:copy(r.user)},group:{results:copy(r.group)}}};}
   if(path==='/rest/api/content/200/restriction'&&method==='PUT'){const body=JSON.parse(init.body);state.writes.push([method,path,body]);state.read=body.find(r=>r.operation==='read').restrictions;state.edit=body.find(r=>r.operation==='update').restrictions;return null;}
   throw Error('Unexpected '+method+' '+path);
  }
 };
 const api=S.create({spaceKey:'wcspedia',entitlementsPageId:'900',nativePublication:{workingRootPageId:'200'}},{storage,entitlements:E,crypto:webcrypto,uuid:randomUUID,loadPolicy:async()=>copy(p)});
 return {p,state,storage,api};
}
test('sync provisions roster space grants and Working viewing without parent editing',async()=>{const f=fixture(),before=copy(f.state.edit);const result=await f.api.sync();assert.equal(result.status,'complete');assert.deepEqual(f.state.edit,before);assert.ok(f.state.read.user.some(u=>u.username==='AUTHOR1'));assert.deepEqual(f.state.grants.get('key-AUTHOR1').sort(),['space:read','space:restrict','page:create','attachment:create'].sort());assert.equal((await f.api.status(f.p)).status,'complete');});
test('repeated synchronization is idempotent and does not alter JSON',async()=>{const f=fixture(),before=copy(f.p);await f.api.sync();const writes=f.state.writes.length;await f.api.sync();assert.equal(f.state.writes.length,writes);assert.deepEqual(f.p,before);});
test('revoke removes only app-owned native grants and view access',async()=>{const f=fixture();f.state.grants.set('key-AUTHOR1',['space:read','space:export']);await f.api.sync();f.p.records[1].active=false;f.p.revision++;await f.api.sync();assert.deepEqual(f.state.grants.get('key-AUTHOR1'),['space:read','space:export']);assert.ok(!f.state.read.user.some(u=>u.username==='AUTHOR1'));assert.equal(f.state.read.user.length,1);assert.equal(f.state.edit.user[0].username,'ADMIN1');});
test('pre-existing views and groups are preserved and reported on revoke',async()=>{const f=fixture();f.state.read.user.push({type:'known',username:'AUTHOR1'});f.state.read.group.push({type:'group',name:'original-team'});await f.api.sync();f.p.records[1].active=false;f.p.revision++;const r=await f.api.sync();assert.equal(r.status,'attention');assert.ok(r.warnings.some(w=>w.startsWith('AUTHOR1')));assert.equal(f.state.read.group[0].name,'original-team');assert.ok(f.state.read.user.some(u=>u.username==='AUTHOR1'));});
test('403 leaves a durable incomplete status and retry reconciles without duplicate grants',async()=>{const f=fixture();f.state.fail=(path,m)=>m==='PUT'&&path.endsWith('/restriction');await assert.rejects(f.api.sync(),e=>e.code==='ACCESS_SYNC_INCOMPLETE'&&e.status===403);assert.equal(f.state.journal.value.status,'incomplete');assert.equal(f.state.journal.value.lease,null);f.state.fail=null;await f.api.sync();assert.equal(f.state.writes.filter(w=>w[1].endsWith('/grant')).length,1);assert.equal(f.state.journal.value.status,'complete');});
test('lost grant response retains intent so later revocation removes the grant',async()=>{const f=fixture(),request=f.storage.request;let fail=true;f.storage.request=async(p,o)=>{const r=await request(p,o);if(fail&&p.endsWith('/grant')){fail=false;throw Error('Response lost');}return r;};await assert.rejects(f.api.sync(),{code:'ACCESS_SYNC_INCOMPLETE'});f.p.records[1].active=false;f.p.revision++;await f.api.sync();assert.deepEqual(f.state.grants.get('key-AUTHOR1'),[]);});
test('active native synchronization lease prevents concurrent writers',async()=>{const f=fixture();f.state.journal={version:{number:1},value:{schemaVersion:1,managed:[],lease:{token:'other',until:Date.now()+60000}}};await assert.rejects(f.api.sync(),{code:'ACCESS_SYNC_BUSY'});assert.equal(f.state.writes.length,0);});
test('changed JSON stops before another native mutation and remains retryable',async()=>{const f=fixture();let changed=false;f.state.hook=async(path,method)=>{if(!changed&&path.includes('/permissions/user/key-AUTHOR1')&&method==='GET'){changed=true;f.p.records[1].active=false;f.p.revision++;}};await assert.rejects(f.api.sync(),{code:'ACCESS_SYNC_INCOMPLETE'});assert.equal(f.state.writes.length,0);f.state.hook=null;await f.api.sync();assert.equal(f.state.read.user.length,1);});
test('a non-admin or missing admin parent-edit permission cannot synchronize',async()=>{for(const key of ['admin','parentEdit']){const f=fixture();f.state[key]=false;await assert.rejects(f.api.sync(),{code:'FORBIDDEN'});assert.equal(f.state.writes.length,0);}const f=fixture();f.state.actor='AUTHOR1';await assert.rejects(f.api.sync(),{code:'FORBIDDEN'});});
test('inherited ancestor privacy is never silently widened',async()=>{const f=fixture();f.state.ancestors=[{id:'300'}];await assert.rejects(f.api.sync(),/inherits viewing restrictions/);assert.equal(f.state.writes.length,0);});
test('empty direct Working restrictions become restricted, never public',async()=>{const f=fixture();f.state.read.user=[];await f.api.sync();assert.ok(f.state.read.user.some(u=>u.username==='ADMIN1'));assert.equal(f.state.read.user.length,2);});
test('removed Working viewing restrictions invalidate stale success and retry restores View without adding editors',async()=>{
 const f=fixture();await f.api.sync();const edit=copy(f.state.edit);f.state.read={user:[],group:[]};const writes=f.state.writes.length;
 const status=await f.api.status(f.p);assert.equal(status.status,'incomplete');assert.match(status.message,/viewing restrictions changed/);assert.equal(f.state.writes.length,writes);
 await f.api.sync();assert.equal((await f.api.status(f.p)).status,'complete');assert.ok(f.state.read.user.some(u=>u.username==='AUTHOR1'));assert.deepEqual(f.state.edit,edit);
});
test('missing managed viewer invalidates success even while another viewer protects Working',async()=>{
 const f=fixture();await f.api.sync();f.state.read.user=f.state.read.user.filter(u=>u.username!=='AUTHOR1');assert.equal((await f.api.status(f.p)).status,'incomplete');
});
test('unverifiable live viewing restrictions cannot return a successful sync status',async()=>{
 const f=fixture();await f.api.sync();f.state.fail=path=>path.includes('/restriction/byOperation/read');await assert.rejects(f.api.status(f.p),{status:403});
});
test('partial grant changes and delete-only revocation retain still-needed permissions',async()=>{const f=fixture();f.p.records[1].permissions.push('content.delete');await f.api.sync();assert.ok(f.state.grants.get('key-AUTHOR1').includes('page:delete'));f.p.records[1].permissions=['content.edit'];f.p.revision++;await f.api.sync();assert.ok(!f.state.grants.get('key-AUTHOR1').includes('page:delete'));assert.ok(f.state.read.user.some(u=>u.username==='AUTHOR1'));});
test('out-of-band Working change before write causes a conflict without overwrite',async()=>{const f=fixture();f.state.hook=async(path,method)=>{if(path.endsWith('/grant')&&method==='PUT')f.state.read.user.push({type:'known',username:'MANUAL1'});};await assert.rejects(f.api.sync(),{code:'ACCESS_SYNC_INCOMPLETE'});assert.ok(f.state.read.user.some(u=>u.username==='MANUAL1'));assert.equal(f.state.writes.filter(w=>w[1].endsWith('/restriction')).length,0);});
test('missing space.operations uses verified native administrator grant, never parent Edit as authority',async()=>{
 const f=fixture(),request=f.storage.request;f.storage.request=async(path,init)=>path==='/rest/api/space/wcspedia?expand=operations'?{key:'wcspedia'}:request(path,init);
 assert.equal((await f.api.sync()).status,'complete');
 f.state.grants.set('key-ADMIN1',['space:read','page:create']);await assert.rejects(f.api.sync(),{code:'FORBIDDEN'});
});
test('changed signed-in identity halts synchronization before native grants',async()=>{
 const f=fixture();f.state.hook=async(path)=>{if(path.includes('/permissions/user/key-AUTHOR1'))f.state.actor='AUTHOR1';};
 await assert.rejects(f.api.sync(),e=>e.code==='ACCESS_SYNC_INCOMPLETE'&&/account changed/.test(e.message));assert.equal(f.state.writes.length,0);
});
test('unsupported native permissions endpoint leaves JSON untouched and no success claim',async()=>{
 const f=fixture(),before=copy(f.p);f.state.fail=(path)=>path.includes('/permissions/user/');await assert.rejects(f.api.sync(),{code:'ACCESS_SYNC_INCOMPLETE'});assert.equal(f.state.journal.value.status,'incomplete');assert.deepEqual(f.p,before);assert.equal(f.state.writes.length,0);
});
