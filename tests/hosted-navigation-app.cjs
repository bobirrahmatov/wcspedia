/* Exercise clean dedicated-page routing with the real app and a stubbed host adapter. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick}=require('./app-fixture.cjs');
const defaults={home:'#/',mine:'#/results?view=mine',review:'#/review',saved:'#/saved',entitlements:'#/entitlements'};
async function hosted(role,hash='',legacyHeaderMount=false){
  return fixture({role,actor:'jordan',sourceMode:true,configureWindow(w,d){
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.mountGlobalTools=false;
    if(legacyHeaderMount){
      w.WCS_CONFIG.mountGlobalTools=true;
      w.WCS_CONFIG.addDocumentMountSelector='[data-wcs-header-add-document]';
      d.body.insertAdjacentHTML('afterbegin','<div id="navBar"><div data-wcs-header-add-document><button id="header-owned-button">Add document</button></div></div>');
    }
    w.WCS_CONFIG.pages=Object.fromEntries(Object.keys(defaults).map((key,index)=>[key,'/confluence/pages/viewpage.action?pageId='+(100+index)]));
    w.history.replaceState(null,'','/confluence/display/WCS/'+role+'?pageId=104&src=header'+hash);
    const adapter={
      async load(){const data=w.WCSData,ops=['read','update','delete'].map(operation=>({operation,targetType:'page'}));return {data,actorId:'jordan',canSubmit:true,workspaceLoaded:true,policyConfigured:true,identity:w.WCSEntitlements.identity({type:'known',username:'JL12345',userKey:'jordan',displayName:'Jordan Lee'}),entitlementPolicy:data.entitlementPolicy,nativePermissions:{root:[{operation:'create',targetType:'page'}],entitlements:ops,documents:Object.fromEntries(data.documents.map(doc=>[doc.id,ops]))}};},
      info(){return {entitlementsSource:'attachment',entitlementsPageId:'104',entitlementsFilename:'entitlements.json',entitlementServiceConfigured:false};},
      async loadMetrics(){return {};},async loadLanding(){return {areas:{},recent:[]};},async searchPages(){return {results:[],total:0,start:0};}
    };
    // Keep real adapter utilities while isolating routing from network and policy setup.
    const evaluate=w.eval;w.eval=source=>{const result=evaluate(source);if(source.startsWith('/* WCSpedia Confluence Data Center adapter.'))w.WCSConfluence={...w.WCSConfluence,create:()=>adapter};return result;};
  }});
}
for(const role of Object.keys(defaults))test('hosted '+role+' opens its own view without duplicating the route in the address',async t=>{
  const f=await hosted(role);t.after(f.close);
  assert.equal(f.w.location.hash,'');assert.equal(f.w.location.search,'?pageId=104&src=header');
  assert.ok(f.find('h1'));assert.doesNotMatch(f.root.textContent,/WCSpedia could not load/);
  assert.equal(f.w.WCSNavigation.routeHash(f.w.WCS_CONFIG,f.w.location.hash),defaults[role]);
  await f.navigate(defaults[role]);assert.equal(f.w.location.hash,'','Previously shared default-route links canonicalize too');assert.equal(f.w.location.search,'?pageId=104&src=header');
  assert.equal(f.errors.length,0,f.errors.map(e=>e.message).join('\n'));
});
test('hosted filtered routes survive back and forward navigation to the clean default', {timeout:3000},async t=>{
  const f=await hosted('saved');t.after(f.close);
  await f.navigate('#/saved?q=credit&page=2');assert.equal(f.w.location.hash,'#/saved?q=credit&page=2');assert.equal(f.find('[data-library-search] input').value,'credit');
  const travel=async direction=>{await new Promise(resolve=>{f.w.addEventListener('popstate',resolve,{once:true});f.w.history[direction]();});await tick();await tick();};
  await travel('back');assert.equal(f.w.location.hash,'');assert.equal(f.find('[data-library-search] input').value,'');
  await travel('forward');assert.equal(f.w.location.hash,'#/saved?q=credit&page=2');assert.equal(f.find('[data-library-search] input').value,'credit');
  assert.equal(f.w.location.search,'?pageId=104&src=header');assert.equal(f.errors.length,0);
});
test('hosted direct filtered and redundant-default URLs initialize correctly',async t=>{
  const f=await hosted('entitlements','#/entitlements');t.after(f.close);assert.equal(f.w.location.hash,'');assert.match(f.find('h1').textContent,/The right access/);
  const filtered=await hosted('saved','#/saved?q=handover');t.after(filtered.close);assert.equal(filtered.w.location.hash,'#/saved?q=handover');assert.equal(filtered.find('[data-library-search] input').value,'handover');assert.equal(filtered.errors.length,0);
});
test('live page renders never replace the header-owned widget even with legacy mount settings',async t=>{
 const f=await hosted('saved','',true);t.after(f.close);
 const button=f.d.getElementById('header-owned-button');
 assert.ok(button,'Initial page hydration must preserve the header button');
 await f.navigate('#/saved?q=credit');
 assert.equal(f.d.querySelector('[data-wcs-header-add-document] button'),button);
 assert.equal(f.d.querySelector('[data-wcs-header-add-document]').hidden,false);
 assert.equal(f.errors.length,0);
});
