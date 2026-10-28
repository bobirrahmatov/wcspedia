'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE}=require('./app-fixture.cjs');
test('review and approval dialogs need only the decision comment in the default workflow',async t=>{
 const data=JSON.parse(JSON.stringify(dataset)),doc=data.documents.find(d=>d.id==='credit-approval-checklist');
 const version=doc.versions.at(-1);delete version.governance;delete version.governanceReview;
 const f=await fixture({role:'review',actor:'jordan',sourceMode:true,hash:'#/review/'+doc.id,dataOverride:data});t.after(f.close);
 f.find('[data-action="complete-review"]').click();await tick();
 assert.equal(f.find('[name="findingDisposition"]'),null);assert.equal(f.find('[data-governance-review]'),null);
 f.input('#action-comment','Reviewed this revision.');await f.submit('#workflow-form');
 assert.equal(f.find('#form-error:not([hidden])'),null);
 f.find('[data-action="approve"]').click();await tick();assert.equal(f.find('#next-review'),null);
 f.input('#action-comment','Approve the reviewed revision.');await f.submit('#workflow-form');
 const stored=JSON.parse(f.w.localStorage.getItem(STORE));
 const saved=(stored.documents||stored.data?.documents).find(d=>d.id===doc.id).versions.at(-1);
 assert.equal(saved.status,'Published');assert.equal(saved.nextReviewAt,null);assert.ok(saved.approvedAt);assert.ok(saved.reviewedAt);assert.deepEqual(f.errors,[]);
});
