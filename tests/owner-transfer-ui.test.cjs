'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick,dataset,STORE}=require('./app-fixture.cjs');
test('manager reassigns from the reader, stays on that view, and sees the audited new owner',async t=>{
 const hash='#/document/credit-data-maintenance?tab=content';
 const f=await fixture({sourceMode:true,actor:'jordan',hash});t.after(f.close);
 const button=f.find('[data-action="reassign-owner"]');assert.ok(button);button.click();await tick();
 const option=f.all('#owner-id option').find(o=>o.value);assert.ok(option);
 f.input('#owner-id',option.value);f.input('#action-comment','Transfer operational responsibility.');await f.submit('#workflow-form');
 assert.equal(f.find('#workflow-form'),null);assert.equal(f.w.location.hash,hash);
 const saved=JSON.parse(f.w.localStorage.getItem(STORE)).documents.find(d=>d.id==='credit-data-maintenance');
 assert.equal(saved.ownerId,option.value);assert.equal(saved.authorId,dataset.documents.find(d=>d.id===saved.id).authorId);assert.equal(saved.audit.at(-1).action,'reassign-owner');assert.deepEqual(f.errors,[]);
});
