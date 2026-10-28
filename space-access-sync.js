/* Entitlements -> native access, executed as the signed-in space administrator.
 * Cooperating runs use a versioned property lease; native restrictions and JSON
 * are not one transaction. Only grants recorded as app-owned are revoked.
 * DC reference: /server/confluence/rest/v9225/api-group-space-permissions/ */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.WCSSpaceAccessSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const KEY='wcspedia.access-sync.v1',MAX_USERS=120;
const ALLOWED=['space:read','space:restrict','page:create','page:delete','attachment:create'];
const copy=v=>JSON.parse(JSON.stringify(v));
function fail(message,code='ACCESS_SYNC_INCOMPLETE'){throw Object.assign(new Error(message),{code});}
function norm(s){return typeof s==='string'?s.trim().toUpperCase():'';}
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
function equal(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
function operation(p){const o=p.operation||p;return o.targetType+':'+(o.operationKey||o.operation);}
function roster(policy){
 const map=new Map();
 for(const r of policy.records){if(!r.active)continue;const caps=r.permissions;
 const worker=caps.some(c=>['content.create','content.edit','content.delete'].includes(c));
 const manager=['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(c=>policy.records.some(a=>a.active&&a.soeid===r.soeid&&a.scope==='*'&&a.permissions.includes(c)));
 if(!worker&&!manager)continue;
 const value=map.get(r.soeid)||new Set(['space:read','page:create','attachment:create','space:restrict']);
 if(caps.includes('content.delete'))value.add('page:delete');map.set(r.soeid,value);
 }
 return [...map].map(([soeid,ops])=>({soeid,ops:[...ops].sort()})).sort((a,b)=>a.soeid.localeCompare(b.soeid));
}
function create(config,deps){
 const storage=deps.storage,E=deps.entitlements,space=config.spaceKey,working=String(config.nativePublication?.workingRootPageId||config.workingRootPageId||''),host=String(config.entitlementsPageId||config.attachmentPageId||'');
 if(!/^[A-Za-z0-9_~.-]+$/.test(space)||!/^\d+$/.test(working)||!/^\d+$/.test(host)||working===host)fail('Configure distinct Working and entitlement pages.','CONFIGURATION');
 const now=deps.now||Date.now,uuid=deps.uuid||(()=>root.crypto.randomUUID());
 const req=(path,method='GET',body)=>storage.request(path,{method,headers:body?{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}:undefined,body:body?JSON.stringify(body):undefined});
 async function policy(){const r=await deps.loadPolicy();return E.validatePolicy(r.data||r);}
 async function digest(p){const bytes=new TextEncoder().encode(JSON.stringify(canonical(p)));const crypto=deps.crypto||root.crypto;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
 async function permissionList(key){const result=await req('/rest/api/space/'+encodeURIComponent(space)+'/permissions/user/'+encodeURIComponent(key));if(!Array.isArray(result)||result.some(p=>!p||!p.operation||typeof p.operation.targetType!=='string'||typeof p.operation.operationKey!=='string'||p.spaceKey&&p.spaceKey!==space))fail('Confluence did not return verifiable space permissions.');return result.map(operation);}
 async function restrictions(id,op){const r=await req('/rest/api/content/'+id+'/restriction/byOperation/'+op+'?expand=restrictions.user,restrictions.group&limit=200');
 if(r?.operation!==op||!Array.isArray(r.restrictions?.user?.results)||!Array.isArray(r.restrictions?.group?.results)||[r.restrictions.user,r.restrictions.group].some(v=>v._links?.next||v.size>v.results.length))fail('The native restriction list is incomplete.');
 const users=r.restrictions.user.results.map(u=>{if(!u.username)fail('A restriction subject has no native username.');return {type:'known',username:u.username};});
 const groups=r.restrictions.group.results.map(g=>{if(!g.name)fail('A restriction group has no name.');return {type:'group',name:g.name};});users.sort((a,b)=>norm(a.username).localeCompare(norm(b.username)));groups.sort((a,b)=>a.name.localeCompare(b.name));return {user:users,group:groups};}
 async function status(p){
  const saved=await storage.property(host,KEY);
  if(!saved)return {status:'not-configured',message:'Sync existing access once. Future entitlement saves sync automatically.'};
  const v=saved.value,current=v.policyFingerprint===await digest(E.validatePolicy(p));
  const running=v.status==='running'&&v.lease?.until>now();
  // A successful journal records a past synchronization. Native restrictions
  // can subsequently be changed outside WCSpedia; do not report stale success.
  if(current&&['complete','attention'].includes(v.status)){
   if(v.workingRootPageId!==working)return {status:'incomplete',message:'The configured Working page changed. Run Sync access again.',warnings:v.warnings||[]};
   const read=await restrictions(working,'read');
   const viewers=new Set(read.user.map(u=>norm(u.username)));
   const missing=roster(p).some(t=>!viewers.has(norm(t.soeid)));
   if((!read.user.length&&!read.group.length)||missing)return {status:'incomplete',message:'Working viewing restrictions changed since the last synchronization. Run Sync access to restore access from JSON. Authors and reviewers need View only on Working; its editing list stays unchanged.',updatedAt:v.updatedAt,warnings:v.warnings||[],policyRevision:p.revision};
  }
  return {status:current&&['complete','attention'].includes(v.status)?v.status:running?'running':'incomplete',message:!current?'Entitlements changed. Synchronize native access for the current roster.':v.status==='running'&&!running?'The previous synchronization stopped. Retry to reconcile access.':v.message||'',updatedAt:v.updatedAt,warnings:v.warnings||[],policyRevision:v.policyRevision};
 }

 async function sync(){
 const p=await policy(),actor=await storage.user(),identity=E.identity(actor);
 if(!identity||!['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(c=>E.hasGrant(p,identity,c,'*')))fail('Access synchronization requires a full entitlement administrator.','FORBIDDEN');
 const [page,policyPage,sp]=await Promise.all([storage.page(working,'space,ancestors,version,operations'),storage.page(host,'space,version,operations'),req('/rest/api/space/'+encodeURIComponent(space)+'?expand=operations')]);
 if(page.space?.key!==space||policyPage.space?.key!==space||!Array.isArray(page.ancestors))fail('Native access synchronization must stay inside the configured space.','SCOPE');
 if(!policyPage.operations?.some(o=>o.operation==='update'&&o.targetType==='page')||!page.operations?.some(o=>o.operation==='update'&&o.targetType==='page'))fail('The administrator syncing access needs native Edit on the entitlement host and Working. Authors and reviewers do not need Working Edit.','FORBIDDEN');
 if(sp.key!==space||sp.operations!=null&&!Array.isArray(sp.operations))fail('Confluence returned invalid space permissions.','SCOPE');
 const nativeAdmin=Array.isArray(sp.operations)?sp.operations.some(o=>['administer','admin'].includes(o.operation)&&o.targetType==='space'):actor.userKey&&(await permissionList(actor.userKey)).includes('space:administer');
 if(!nativeAdmin)fail('Sync access must be run by a native space administrator. JSON administration alone cannot grant Confluence permissions.','FORBIDDEN');
 // Do not broaden unrelated ancestor restrictions. A parent restriction would
 // still deny access even after this Working-only synchronization.
 for(const a of page.ancestors){if(!/^\d+$/.test(String(a.id)))fail('Invalid Working ancestry.');const r=await restrictions(String(a.id),'read');if(r.user.length||r.group.length)fail('Working inherits viewing restrictions from page '+a.id+'. A space administrator must reconcile that ancestor before access can be synchronized.');}
 let journal=await storage.property(host,KEY),state=journal?.value;
 if(state&&(state.schemaVersion!==1||!Array.isArray(state.managed)||state.managed.some(v=>!v||!E.normalizeSOEID(v.soeid)||!v.userKey||!v.username||!Array.isArray(v.spaceOps)||v.spaceOps.some(op=>!ALLOWED.includes(op)))))fail('Access synchronization state is invalid; preserve it for recovery.');
 if(state?.lease&&state.lease.until>now())fail('Another access synchronization is running. Wait and retry.','ACCESS_SYNC_BUSY');
 const token=uuid(),stamp=await digest(p),targets=roster(p),owned=copy(state?.managed||[]);
 if(new Set([...targets,...owned].map(x=>x.soeid)).size>MAX_USERS)fail('This synchronization supports up to '+MAX_USERS+' managed people. No access was changed.');
 state={schemaVersion:1,workingRootPageId:working,policyRevision:p.revision,policyFingerprint:stamp,status:'running',managed:owned,lease:{token,until:now()+120000},actorSOEID:identity.soeid,updatedAt:new Date(now()).toISOString(),warnings:[],message:''};
 if(journal?.value.workingRootPageId&&journal.value.workingRootPageId!==working)fail('Working changed; reconcile the previous access setup before proceeding.');
 journal=await storage.putProperty(host,KEY,state,journal?.version.number??null);
 async function checkpoint(){state.updatedAt=new Date(now()).toISOString();state.lease={token,until:now()+120000};journal=await storage.putProperty(host,KEY,state,journal.version.number);}
 async function guard(){if(!equal(E.identity(await storage.user()),identity))fail('Your Confluence account changed. Reload before synchronizing.','IDENTITY_MAPPING');const current=await storage.property(host,KEY);if(current?.value.lease?.token!==token||current.version.number!==journal.version.number)fail('Access synchronization changed in another session.','CONFLICT');if(await digest(await policy())!==stamp)fail('Entitlements changed during synchronization. Retry with the latest policy.','CONFLICT');}
 try {
  let read=await restrictions(working,'read'),edit=await restrictions(working,'update');const originalRead=copy(read);
  const protectedUsers=new Set([identity.soeid,...edit.user.map(u=>norm(u.username))]);
  // Keep an administrator anchor: removing the last viewer would open drafts.
  if(!read.user.some(u=>norm(u.username)===identity.soeid))read.user.push({type:'known',username:actor.username});
  const keep=read.user.filter(u=>!owned.some(v=>v.workingRead&&v.soeid===norm(u.username)&&!targets.some(t=>t.soeid===v.soeid))||protectedUsers.has(norm(u.username)));
  const expected={user:keep,group:read.group};
  for(const t of targets){
   await guard();const u=await req('/rest/api/user?username='+encodeURIComponent(t.soeid));
   if(E.identity(u)?.soeid!==t.soeid||!u.userKey||!u.username)fail('Cannot verify native account '+t.soeid+'.');
   let item=state.managed.find(x=>x.soeid===t.soeid);
   if(item&&item.userKey!==u.userKey)fail('Native identity changed for '+t.soeid+'.');
   if(!item){item={soeid:t.soeid,username:u.username,userKey:u.userKey,spaceOps:[],workingRead:false};state.managed.push(item);}
   if(!expected.user.some(x=>norm(x.username)===t.soeid)){expected.user.push({type:'known',username:u.username});item.workingRead=true;}
   // Pre-existing direct viewing grants remain administrator-owned. They are
   // explicitly reported on revocation instead of silently taking ownership.
   const before=await permissionList(u.userKey),missing=t.ops.filter(op=>!before.includes(op));
   item.spaceOps=[...new Set(item.spaceOps.concat(missing))];await checkpoint();
   if(missing.length){await guard();await req('/rest/api/space/'+encodeURIComponent(space)+'/permissions/user/'+encodeURIComponent(u.userKey)+'/grant','PUT',missing.map(op=>{const [targetType,operationKey]=op.split(':');return {targetType,operationKey};}));}
   const after=await permissionList(u.userKey);if(t.ops.some(op=>!after.includes(op)))fail('Native space grants were not confirmed for '+t.soeid+'.');
  }
  // Preserve parent editing exactly, including native groups. Read subjects
  // include existing individual editors to satisfy this server's pair rule.
  for(const u of edit.user)if(!expected.user.some(x=>norm(x.username)===norm(u.username)))expected.user.push(u);
  for(const g of edit.group)if(!expected.group.some(x=>x.name===g.name))fail('Working has an editing group without a matching viewing restriction. Preserve and reconcile this existing native setup before synchronization.');
  expected.user.sort((a,b)=>norm(a.username).localeCompare(norm(b.username)));
  if(!expected.user.length&&!expected.group.length)fail('Cannot remove the last Working viewer.');
  await checkpoint();await guard();
  const freshRead=await restrictions(working,'read'),freshEdit=await restrictions(working,'update');
  // The current administrator anchor was only added to our local plan.
  if(!equal(freshEdit,edit)||!equal(freshRead,originalRead))fail('Working restrictions changed; retry.','CONFLICT');
  if(!equal(freshRead,expected)){await req('/rest/api/content/'+working+'/restriction','PUT',[{operation:'read',restrictions:expected},{operation:'update',restrictions:edit}]);}
  if(!equal(await restrictions(working,'read'),expected)||!equal(await restrictions(working,'update'),edit))fail('Working access was not confirmed. Retry synchronization.');
  for(const item of state.managed){
   const target=targets.find(t=>t.soeid===item.soeid),remove=item.spaceOps.filter(op=>!target?.ops.includes(op));
   if(remove.some(op=>!ALLOWED.includes(op)))fail('An unsupported permission was found in the managed access record.');
   if(remove.length){
    if(item.soeid===identity.soeid){state.warnings.push('Your own native permissions were preserved; another administrator must reconcile them.');continue;}
    await guard();await req('/rest/api/space/'+encodeURIComponent(space)+'/permissions/user/'+encodeURIComponent(item.userKey)+'/revoke','PUT',remove.map(op=>{const [targetType,operationKey]=op.split(':');return {targetType,operationKey};}));
    const after=await permissionList(item.userKey);if(remove.some(op=>after.includes(op)))fail('Native revocation was not confirmed for '+item.soeid+'.');
    item.spaceOps=item.spaceOps.filter(op=>!remove.includes(op));
   }
   if(!target){const remaining=await permissionList(item.userKey);if(remaining.some(op=>ALLOWED.includes(op)))state.warnings.push(item.soeid+' retains pre-existing native space permissions.');if(expected.user.some(u=>norm(u.username)===item.soeid))state.warnings.push(item.soeid+' retains a pre-existing or administrator Working grant.');else item.workingRead=false;}
   await checkpoint();
  }
  const inactive=new Set(p.records.filter(r=>!targets.some(t=>t.soeid===r.soeid)).map(r=>r.soeid));
  for(const s of inactive)if(expected.user.some(u=>norm(u.username)===s)&&!state.warnings.some(w=>w.startsWith(s)))state.warnings.push(s+' retains a pre-existing or administrator Working grant.');
  if(expected.group.length)state.warnings.push('Existing native groups were preserved; group-derived access is not revoked by JSON.');
  await guard();state.status=state.warnings.length?'attention':'complete';state.message=state.warnings.length?'Managed access synchronized; review retained native access.':'Managed native access synchronized. Working editing permissions were preserved.';
  state.managed=state.managed.filter(item=>targets.some(t=>t.soeid===item.soeid)||item.spaceOps.length||item.workingRead);
  state.lease=null;state.updatedAt=new Date(now()).toISOString();journal=await storage.putProperty(host,KEY,state,journal.version.number);return {status:state.status,message:state.message,warnings:state.warnings,policyRevision:p.revision};
 }catch(e){
  state.status='incomplete';state.message='JSON entitlements are saved, but native access setup is incomplete. '+e.message;state.lease=null;
  try{await storage.putProperty(host,KEY,state,journal.version.number);}catch(_){}
  throw Object.assign(new Error(state.message),{code:'ACCESS_SYNC_INCOMPLETE',status:e.status,cause:e});
 }
 }
 return {sync,status};
}
return {create,roster};
});
