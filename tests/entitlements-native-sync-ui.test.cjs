'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(overrides={}){
 const dom=new JSDOM('<div id="wcspedia"></div>',{url:'https://example.test/#/entitlements',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,root=w.document.querySelector('#wcspedia');
 for(const f of ['data-table.js','pagination.js','entitlements-page.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
 const notifications=[],options={policy:{revision:1,records:[],audit:[]},identity:{soeid:'ADMIN1'},can:()=>true,documents:[],download(){},go(){},refresh(){},notify:(...a)=>notifications.push(a),nativeSync:{status:'incomplete',message:'Native grant denied'},syncAccess:async()=>({status:'complete'}),...overrides};
 root.innerHTML=w.WCSEntitlementsPage.markup(options);const handle=w.WCSEntitlementsPage.mount(root,options);
 return {w,root,notifications,close(){handle.destroy();w.close();}};
}
test('sync button prevents duplicate requests and refreshes successful access status',async()=>{
 let release,calls=0,refresh=0;const f=fixture({syncAccess:()=>{calls++;return new Promise(r=>release=r);},refresh:()=>refresh++});
 try{const b=f.root.querySelector('[data-entitlement-sync]');const actions=b.closest('.entitlement-header-actions');assert.ok(actions);assert.equal(actions.querySelector('[data-entitlement="add"]').previousElementSibling,b);assert.equal(f.root.querySelectorAll('[data-entitlement-sync]').length,1);assert.equal(b.getAttribute('aria-describedby'),f.root.querySelector('[data-sync-status]').id);b.click();b.click();assert.equal(calls,1);assert.equal(b.disabled,true);assert.equal(b.getAttribute('aria-busy'),'true');assert.match(f.root.querySelector('[data-sync-status]').textContent,/Synchronizing/);release({status:'complete'});await tick();assert.equal(refresh,1);assert.equal(b.disabled,false);assert.equal(b.hasAttribute('aria-busy'),false);assert.equal(f.notifications[0][1].type,'success');}finally{f.close();}
});
test('sync error is readable and retry remains available without navigating or creating a record',async()=>{
 let calls=0;const f=fixture({syncAccess:async()=>{calls++;throw Error('Confluence rejected access: HTTP 403');}});
 try{const b=f.root.querySelector('[data-entitlement-sync]');b.click();await tick();assert.equal(b.disabled,false);assert.match(f.root.querySelector('[data-sync-status]').textContent,/HTTP 403/);assert.equal(f.notifications[0][1].type,'error');b.click();await tick();assert.equal(calls,2);assert.equal(f.root.querySelector('[role="dialog"]'),null);}finally{f.close();}
});
test('only a full entitlement administrator sees synchronization controls; server messages stay text',()=>{
 const f=fixture({can:p=>p==='entitlements.view',nativeSync:{status:'attention',message:'<img src=x onerror=alert(1)>',warnings:['<script>bad</script>']}});
 try{assert.equal(f.root.querySelector('[data-entitlement-sync]'),null);assert.equal(f.root.querySelector('img'),null);assert.equal(f.root.querySelector('script'),null);assert.match(f.root.textContent,/Working editing stays unchanged/);}finally{f.close();}
});
