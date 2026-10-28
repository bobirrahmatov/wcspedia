'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick}=require('./app-fixture.cjs');
const policy=require('../confluence-data-starters/entitlements.json');
async function setup(role='entitlements',inspectError=null){
 const calls={loads:[],inspections:0,repairs:0,downloads:0};
 const f=await fixture({role,sourceMode:true,configureWindow(w,d){
  Object.assign(w.WCS_CONFIG,{mode:'confluence',authoringMode:'confluence-session',rootPageId:'100',pageRole:role,mountGlobalTools:false});
  w.URL.createObjectURL=()=>{calls.downloads++;return 'blob:recovery';};w.URL.revokeObjectURL=()=>{};
  const click=w.HTMLAnchorElement.prototype.click;w.HTMLAnchorElement.prototype.click=function(){if(!this.download)click.call(this);};
  const adapter={info:()=>({}),load:async options=>{
   calls.loads.push(options);
   if(!options.discoveryOnly){const error=Error('The committed JSON attachment is missing or replaced: entitlements.json');error.code='CONFLICT';throw error;}
   const data={...w.WCSData,documents:[]};return {data,actorId:'alex',actor:data.people.find(p=>p.id==='alex'),discoveryOnly:true,workspaceLoaded:false,mode:'confluence',canSubmit:false,identity:{soeid:'AM12345',userKey:'alex'},nativePermissions:{documents:{}},effectivePermissions:{}};
  },inspectEntitlementRecovery:async()=>{calls.inspections++;if(inspectError)throw Error(inspectError);return {pageId:'200',filename:'entitlements.json',key:'wcspedia.entitlements.v1',candidate:{id:'999',version:1,bytes:100,sha256:'0'.repeat(64)},property:{version:{number:2}},data:policy};},
  reconcileEntitlementAttachment:async()=>{calls.repairs++;},loadMetrics:async()=>({})};
  Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
  Object.defineProperty(w,'WCSBookmarks',{configurable:true,get:()=>({create:()=>({load:async()=>({available:true,bookmarks:[],revision:1}),resolve:()=>[]})}),set:()=>{}});
  Object.defineProperty(w,'WCSHealthService',{configurable:true,get:()=>({create:()=>({load:async()=>({})})}),set:()=>{}});
  Object.defineProperty(w,'WCSSuggestions',{configurable:true,get:()=>undefined,set:()=>{}});
 }});
 return {...f,calls,button:label=>[...f.root.querySelectorAll('button')].find(b=>b.textContent===label)};
}
test('Saved renders through native discovery even when the entitlement policy is broken',async t=>{
 const f=await setup('saved');t.after(f.close);
 assert.equal(f.calls.loads.length,1);assert.equal(f.calls.loads[0].discoveryOnly,true);
 assert.match(f.root.textContent,/Saved items/);assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
 await f.navigate('#/saved?q=credit');assert.equal(f.calls.loads.length,1,'Filtering saves must not escalate to private workspace access');
 assert.equal(f.calls.inspections,0);assert.equal(f.errors.length,0,f.errors.map(e=>e.message).join('\n'));
});
test('policy recovery requires inspection, a backup download and explicit review before any write',async t=>{
 const f=await setup();t.after(f.close);
 assert.equal(f.calls.repairs,0);assert.ok(f.button('Review JSON recovery'));
 f.button('Review JSON recovery').click();await tick();await tick();
 const apply=f.button('Use reviewed attachment');assert.equal(apply.disabled,true);
 const checkbox=f.root.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new f.w.Event('change'));
 assert.equal(apply.disabled,true,'Review alone is not a backup');assert.equal(f.calls.repairs,0);
 f.button('Download recovery backup').click();assert.equal(f.calls.downloads,1);assert.equal(apply.disabled,false);
 apply.click();await tick();await tick();assert.equal(f.calls.repairs,1);
 assert.match(f.root.textContent,/Attachment reference recovered/);assert.ok(f.button('Try again'));
 assert.equal(f.errors.length,0,f.errors.map(e=>e.message).join('\n'));
});
test('recovery preview errors show a reason and never offer a write action',async t=>{
 const f=await setup('entitlements','Native Edit permission is required');t.after(f.close);
 f.button('Review JSON recovery').click();await tick();await tick();
 assert.match(f.root.textContent,/Native Edit permission is required/);assert.equal(f.button('Use reviewed attachment'),undefined);assert.equal(f.calls.repairs,0);
});
