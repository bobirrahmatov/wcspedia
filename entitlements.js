/* One shared WCSpedia entitlement model. Browser checks control presentation only.
 * A trusted service must resolve the session, policy and native Confluence rights
 * again for every mutation. Never accept client identity or permission decisions.
 */
(function(root,factory){'use strict';var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.WCSEntitlements=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var PERMISSIONS=['content.create','content.edit','content.delete','entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'];
  function fail(message,code){var e=new Error(message);e.code=code||'INVALID_ENTITLEMENTS';throw e;}
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function normalizeSOEID(v){return typeof v==='string'&&/^[a-z0-9]{2,32}$/i.test(v.trim())?v.trim().toUpperCase():'';}
  function identity(user){
    if(!object(user)||user.type==='anonymous'||!normalizeSOEID(user.username))return null;
    return {soeid:normalizeSOEID(user.username),username:user.username,userKey:typeof user.userKey==='string'?user.userKey:null,accountId:typeof user.accountId==='string'?user.accountId:null,displayName:typeof user.displayName==='string'?user.displayName:user.username};
  }
  function validScope(v){return v==='*'||typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);}
  function record(value){
    if(!object(value)||typeof value.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.id))fail('Every entitlement row needs a stable record ID.');
    var id=normalizeSOEID(value.soeid);
    if(!id)fail('Use a valid SOEID made of letters and numbers.');
    if(typeof value.displayName!=='string'||!value.displayName.trim()||value.displayName.length>150)fail('A display name of up to 150 characters is required.');
    if(!validScope(value.scope))fail('Use * for all documents or an exact document key.');
    if(!Array.isArray(value.permissions)||!value.permissions.length||new Set(value.permissions).size!==value.permissions.length||value.permissions.some(function(p){return PERMISSIONS.indexOf(p)<0;}))fail('Use distinct, supported entitlement permissions.');
    if(value.scope!=='*'&&value.permissions.some(function(p){return p==='content.create'||p.indexOf('entitlements.')===0;}))fail('Creation and entitlement administration permissions must have global scope.');
    if(typeof value.active!=='boolean')fail('Active must be true or false.');
    return {id:value.id,soeid:id,displayName:value.displayName.trim(),scope:value.scope,permissions:value.permissions.slice().sort(),active:value.active};
  }
  function validatePolicy(input){
    if(!object(input)||input.schemaVersion!==1||!Number.isSafeInteger(input.revision)||input.revision<1||!Array.isArray(input.records)||!Array.isArray(input.audit))fail('entitlements.json must retain schemaVersion: 1, its positive revision, records and audit. Only filename/URL cache suffixes were removed; restore missing fields from the last valid policy without resetting grants or history.');
    var ids=new Set(),identities=new Set();
    var rows=input.records.map(function(v){var r=record(v),key=r.soeid+'|'+r.scope;if(ids.has(r.id)||identities.has(key))fail('Entitlement record IDs and SOEID / scope pairs must be unique.');ids.add(r.id);identities.add(key);return r;});
    var events=new Set(),previous=0;
    input.audit.forEach(function(e){if(!object(e)||typeof e.id!=='string'||!e.id||events.has(e.id)||!normalizeSOEID(e.actorSOEID)||!['add','edit','revoke'].includes(e.action)||!Number.isSafeInteger(e.revision)||e.revision<2||e.revision>input.revision||e.revision<=previous||!Number.isFinite(Date.parse(e.at))||typeof e.comment!=='string'||!e.comment.trim()||!Array.isArray(e.changes))fail('Invalid entitlement audit event.');events.add(e.id);previous=e.revision;});
    return {schemaVersion:1,revision:input.revision,records:rows,audit:clone(input.audit)};
  }
  function hasGrant(policy,who,permission,scope){
    if(!who||!normalizeSOEID(who.soeid)||!PERMISSIONS.includes(permission)||!validScope(scope))return false;
    var id=normalizeSOEID(who.soeid);
    return policy.records.some(function(r){return r.active&&normalizeSOEID(r.soeid)===id&&r.permissions.includes(permission)&&(r.scope==='*'||r.scope===scope);});
  }
  function nativeHas(operations,operation){return Array.isArray(operations)&&operations.some(function(o){return object(o)&&o.targetType==='page'&&o.operation===operation;});}
  function effective(policy,who,permission,options){
    options=options||{};var native=options.native||{},scope=permission==='content.edit'||permission==='content.delete'?options.documentKey:'*';
    try{policy=validatePolicy(policy);}catch(_){return false;}
    if(!hasGrant(policy,who,permission,scope))return false;
    if(permission==='content.create')return nativeHas(native.root,'create');
    if(permission==='content.edit'||permission==='content.delete')return nativeHas((native.documents||{})[scope],permission==='content.edit'?'update':'delete');
    if(permission==='entitlements.view')return nativeHas(native.entitlements,'read');
    return hasGrant(policy,who,'entitlements.view','*')&&nativeHas(native.entitlements,'read')&&nativeHas(native.entitlements,'update');
  }
  function applyCommand(input,command,options){
    options=options||{};var policy=validatePolicy(input),who=options.identity;
    if(!object(command)||!['add','edit','revoke'].includes(command.action)||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==policy.revision)fail('Entitlements changed. Reload before saving.','CONFLICT');
    if(typeof command.comment!=='string'||!command.comment.trim()||command.comment.length>2000)fail('A change reason of up to 2,000 characters is required.');
    if(!effective(policy,who,'entitlements.'+command.action,{native:options.native}))fail('You are not entitled to make this change.','FORBIDDEN');
    var before=null,after=null,index=-1;
    if(command.action==='add'){
      after=record(command.record);
      if(policy.records.some(function(r){return r.id===after.id||r.soeid===after.soeid&&r.scope===after.scope;}))fail('This entitlement record or SOEID / scope already exists.','CONFLICT');
    }else{
      index=policy.records.findIndex(function(r){return r.id===command.recordId;});
      if(index<0)fail('The entitlement record no longer exists.','CONFLICT');
      before=policy.records[index];
      if(command.action==='edit'){
        after=record(command.record);
        if(after.id!==before.id||after.soeid!==before.soeid||after.scope!==before.scope)fail('Record ID, SOEID and scope cannot change. Revoke and add a new record.');
        if((before.active&&!after.active||before.permissions.some(function(p){return !after.permissions.includes(p);}))&&!effective(policy,who,'entitlements.revoke',{native:options.native}))fail('Removing authority also requires entitlement revoke permission.','FORBIDDEN');
      }
    }
    if(after&&after.active)after.permissions.forEach(function(p){if(!hasGrant(policy,who,p,after.scope))fail('You cannot grant a permission or scope you do not hold.','FORBIDDEN');});
    var next=clone(policy);
    if(command.action==='add')next.records.push(after);else if(command.action==='revoke')next.records.splice(index,1);else next.records[index]=after;
    var admins=function(p){return p.records.filter(function(r){return r.active&&r.scope==='*'&&['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(function(x){return r.permissions.includes(x);});}).length;};
    if(admins(policy)>0&&admins(next)===0)fail('The last active entitlement administrator cannot be removed.','LAST_ADMIN');
    var now=options.now||new Date().toISOString();
    if(!Number.isFinite(Date.parse(now)))fail('A valid server action time is required.');
    if(policy.audit.length&&Date.parse(now)<Date.parse(policy.audit[policy.audit.length-1].at))fail('Action time cannot precede the latest audit event.');
    next.revision+=1;
    next.audit.push({id:'entitlement-event-'+next.revision,revision:next.revision,actorSOEID:normalizeSOEID(who.soeid),action:command.action,at:new Date(now).toISOString(),comment:command.comment.trim(),changes:[{field:'records',recordId:(after||before).id,before:before,after:after}]});
    return validatePolicy(next);
  }
  return Object.freeze({PERMISSIONS:Object.freeze(PERMISSIONS),normalizeSOEID:normalizeSOEID,identity:identity,validatePolicy:validatePolicy,hasGrant:hasGrant,nativeHas:nativeHas,effective:effective,applyCommand:applyCommand});
});
