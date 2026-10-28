'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('./entitlements.js');
const admin={soeid:'JL12345'};
const native={root:[{operation:'create',targetType:'page'}],entitlements:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}],documents:{'doc-1':[{operation:'update',targetType:'page'},{operation:'delete',targetType:'page'}]}};
function policy(){return {schemaVersion:1,revision:1,records:[{id:'admin',soeid:'JL12345',displayName:'Jordan',scope:'*',permissions:[...E.PERMISSIONS],active:true},{id:'author',soeid:'AM12345',displayName:'Alex',scope:'*',permissions:['content.create','content.edit'],active:true}],audit:[]};}
function row(overrides={}){return {id:'new',soeid:'XY12345',displayName:'New colleague',scope:'doc-1',permissions:['content.edit'],active:true,...overrides};}
function apply(p,cmd,identity=admin){return E.applyCommand(p,{expectedRevision:p.revision,comment:'Access requested for assigned work.',...cmd},{identity,native,now:'2026-10-15T12:00:00Z'});}
test('SOEID comes only from authenticated username, never display name or account ID',()=>{
 assert.equal(E.normalizeSOEID(' am12345 '),'AM12345');
 assert.equal(E.identity({type:'known',username:'am12345',displayName:'Different Person'}).soeid,'AM12345');
 assert.equal(E.identity({type:'anonymous',username:'AM12345'}),null);
 assert.equal(E.identity({displayName:'AM12345',accountId:'AM12345'}),null);
 assert.equal(E.identity({username:'DOMAIN\\AM12345'}),null);
});
test('effective rights require central entitlement AND correct target page native operation',()=>{
 const p=policy(), author={soeid:'am12345',role:'Manager'};
 assert.equal(E.effective(p,author,'content.create',{native}),true);
 assert.equal(E.effective(p,author,'content.edit',{native,documentKey:'doc-1'}),true);
 assert.equal(E.effective(p,author,'content.edit',{native,documentKey:'other'}),false);
 assert.equal(E.effective(p,author,'content.delete',{native,documentKey:'doc-1'}),false);
 assert.equal(E.effective(p,{soeid:'NO12345',role:'Manager'},'content.create',{native}),false);
 assert.equal(E.effective(p,author,'content.create',{native:{...native,root:[{operation:'update',targetType:'page'}]}}),false);
 assert.equal(E.effective(p,author,'content.edit',{native:{...native,documents:{'doc-1':[{operation:'update',targetType:'attachment'}]}},documentKey:'doc-1'}),false);
 assert.equal(E.effective(null,author,'content.create',{native}),false);
});
test('unique IDs and SOEID/scope pairs allow distinct document scopes without wildcard expansion',()=>{
 const p=policy();p.records.push(row({soeid:'AM12345'}));assert.doesNotThrow(()=>E.validatePolicy(p));
 p.records.push(row({id:'another',soeid:'am12345'}));assert.throws(()=>E.validatePolicy(p),/unique/);
 assert.throws(()=>E.validatePolicy({...policy(),records:[row({scope:'doc-*'})]}),/exact document key/);
 assert.throws(()=>E.validatePolicy({...policy(),records:[row({permissions:['entitlements.edit']})]}),/global scope/);
 assert.throws(()=>E.validatePolicy({...policy(),records:[row({permissions:['admin']})]}),/supported/);
});
test('native read plus update and explicit view are needed to administer entitlements',()=>{
 const p=policy();
 assert.equal(E.effective(p,admin,'entitlements.view',{native}),true);
 assert.equal(E.effective(p,admin,'entitlements.add',{native:{...native,entitlements:[{operation:'update',targetType:'page'}]}}),false);
 p.records[0].permissions=p.records[0].permissions.filter(v=>v!=='entitlements.view');
 assert.equal(E.effective(p,admin,'entitlements.add',{native}),false);
});
test('adds produce immutable revision history with trusted actor and exact changes',()=>{
 const original=policy(),next=apply(original,{action:'add',record:row(),actorSOEID:'FORGED'});
 assert.equal(original.records.length,2);assert.equal(next.revision,2);assert.equal(next.records.length,3);
 assert.equal(next.audit[0].actorSOEID,'JL12345');assert.equal(next.audit[0].changes[0].before,null);assert.equal(next.audit[0].changes[0].after.id,'new');
 assert.throws(()=>E.applyCommand(next,{action:'add',record:row(),expectedRevision:1,comment:'Stale'},{identity:admin,native}),e=>e.code==='CONFLICT');
});
test('editing cannot add rows, change a principal, or silently revoke authority',()=>{
 let p=policy();p.records[0].permissions=p.records[0].permissions.filter(v=>v!=='entitlements.revoke');
 assert.throws(()=>apply(p,{action:'edit',recordId:'missing',record:row()}),e=>e.code==='CONFLICT');
 assert.throws(()=>apply(p,{action:'edit',recordId:'author',record:{...p.records[1],soeid:'ZZ12345'}}),/cannot change/);
 assert.throws(()=>apply(p,{action:'edit',recordId:'author',record:{...p.records[1],permissions:['content.edit']}}),e=>e.code==='FORBIDDEN');
 assert.throws(()=>apply(p,{action:'edit',recordId:'author',record:{...p.records[1],active:false}}),e=>e.code==='FORBIDDEN');
});
test('grantors cannot grant permissions or global scope they do not hold',()=>{
 const p=policy();p.records[0].permissions=p.records[0].permissions.filter(v=>v!=='content.delete');
 assert.throws(()=>apply(p,{action:'add',record:row({permissions:['content.delete']})}),e=>e.code==='FORBIDDEN');
 p.records[0].permissions=p.records[0].permissions.filter(v=>v!=='content.edit');p.records.push(row({id:'scoped-admin',soeid:'JL12345'}));
 assert.throws(()=>apply(p,{action:'add',record:row({scope:'*'})}),e=>e.code==='FORBIDDEN');
 assert.equal(apply(p,{action:'add',record:row()}).records.length,4);
});
test('last full entitlement administrator cannot be removed or deactivated',()=>{
 const p=policy();
 assert.throws(()=>apply(p,{action:'revoke',recordId:'admin'}),e=>e.code==='LAST_ADMIN');
 assert.throws(()=>apply(p,{action:'edit',recordId:'admin',record:{...p.records[0],active:false}}),e=>e.code==='LAST_ADMIN');
 const next=apply(p,{action:'revoke',recordId:'author'});assert.equal(next.records.length,1);assert.equal(next.audit[0].changes[0].after,null);
});
