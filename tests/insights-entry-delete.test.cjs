'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset}=require('./app-fixture.cjs');
for(const clipboard of [true,false])test('delete key copy '+(clipboard?'uses clipboard':'has selectable fallback')+' and never submits or prefills deletion',async t=>{
 let copied='';const f=await fixture({sourceMode:true,actor:'jordan',hash:'#/document/credit-data-maintenance',configureWindow(w){if(clipboard)Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});}});t.after(f.close);
 const del=f.find('[data-action="delete"]');assert.ok(del);del.click();await tick();await tick();
 const input=f.find('#delete-key'),key=f.find('#delete-document-key'),copy=f.find('[data-action="copy-document-key"]');assert.ok(copy);assert.equal(input.value,'');assert.equal(key.textContent,'credit-data-maintenance');
 copy.click();await tick();await tick();assert.equal(input.value,'');assert.ok(f.find('#workflow-form'));
 if(clipboard)assert.equal(copied,key.textContent);else assert.equal(f.w.getSelection().toString(),key.textContent);
 assert.deepEqual(f.errors,[]);
});

async function deleteCurrent(f,id){
 const button=f.find('[data-action="delete"][data-document-id="'+id+'"]')||f.find('[data-action="delete"]');assert.ok(button);button.click();await tick();
 f.input('#delete-key',id);f.input('#action-comment','Remove this obsolete document.');await f.submit('#workflow-form');
}
test('deleting from My Workspace preserves the current page and search filters',async t=>{
 const hash='#/results?view=mine&type=Blog&page=1';
 const policy=JSON.parse(JSON.stringify(dataset.entitlementPolicy));policy.records.find(r=>r.soeid==='AM12345').permissions.push('content.delete');
 const f=await fixture({sourceMode:true,role:'mine',actor:'alex',hash,policy});t.after(f.close);
 const button=f.find('[data-action="delete"]');assert.ok(button);const id=button.dataset.documentId;
 await deleteCurrent(f,id);
 assert.equal(f.w.location.hash,hash);assert.equal(f.find('#workflow-form'),null);
 assert.equal(f.find('[data-action="delete"][data-document-id="'+id+'"]'),null);
 assert.equal(f.navigation.length,0);assert.deepEqual(f.errors,[]);
});
test('deleting in a reader returns to its originating workspace list on the same host',async t=>{
 const origin='#/results?view=mine&q=Credit&page=1';
 const f=await fixture({sourceMode:true,role:'mine',actor:'jordan',hash:'#/document/credit-data-maintenance?returnTo='+encodeURIComponent(origin)});t.after(f.close);
 await deleteCurrent(f,'credit-data-maintenance');
 assert.equal(f.w.location.hash,origin);assert.equal(f.find('#workflow-form'),null);assert.equal(f.navigation.length,0);assert.deepEqual(f.errors,[]);
});
test('failed deletion keeps the reader and confirmation dialog',async t=>{
 const hash='#/document/credit-data-maintenance';
 const f=await fixture({sourceMode:true,role:'mine',actor:'jordan',hash});t.after(f.close);
 f.find('[data-action="delete"]').click();await tick();f.input('#delete-key','wrong');f.input('#action-comment','Remove this obsolete document.');await f.submit('#workflow-form');
 assert.equal(f.w.location.hash,hash);assert.match(f.find('#form-error').textContent,/exact document key/);assert.equal(f.navigation.length,0);
});
test('reader tabs retain the originating list for deletion after changing tabs',async t=>{
 const origin='#/results?view=mine&type=Blog&page=2';
 const f=await fixture({sourceMode:true,role:'mine',actor:'jordan',hash:'#/document/credit-data-maintenance?returnTo='+encodeURIComponent(origin)});t.after(f.close);
 const audit=f.find('.tabs a[href*="tab=audit"]');assert.ok(audit);assert.equal(new URL(audit.href).searchParams.get('returnTo'),null);
 const hash=new URL(audit.href).hash;assert.equal(new URLSearchParams(hash.split('?')[1]).get('returnTo'),origin);
 await f.navigate(hash);await deleteCurrent(f,'credit-data-maintenance');assert.equal(f.w.location.hash,origin);assert.deepEqual(f.errors,[]);
});
