/* End-to-end application checks for the classification-aware review flow.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/governance-app.cjs [--source] */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE}=require('./app-fixture.cjs');
const G=require('../governance.js'),W=require('../workflow.js');
const sourceMode=process.argv.includes('--source'),ID='credit-data-maintenance';
const clone=value=>JSON.parse(JSON.stringify(value));
const metadata=()=>G.normalize({classification:'other-nhd',owningTeam:'Credit Information Management',scope:'Support record handovers across the WCS team.',audience:'WCS document authors and reviewers.',classificationRationale:'A practical job aid supporting existing responsibilities.',sources:[]});
function governed(status='In review',flags=false){
  const data=clone(dataset),doc=data.documents.find(d=>d.id===ID),base=clone(W.publishedVersion(doc));
  const draft={...clone(base),version:base.version+1,revision:1,status,title:'Prepare a clear handover',summary:flags?'The policy reference must be checked.':'Help colleagues understand a record handover.',governance:metadata(),sections:[{id:'overview',title:'Handover checks',paragraphs:['Confirm the recipient and the record link.'],bullets:['Record any open questions.']}],bodyMarkdown:'## Handover checks\n\nConfirm the recipient and the record link.\n\n- Record any open questions.',createdAt:'2026-10-15T08:00:00.000Z',createdBy:'alex',reviewedBy:null,reviewedAt:null,reviewedRevision:null,approvedBy:null,approvedAt:null,effectiveAt:null,nextReviewAt:null};
  draft.sections=require('../editor-content.js').toSections(draft.bodyMarkdown);delete draft.governanceReview;doc.versions=[base,draft];return data;
}
const click=async button=>{assert.ok(button);button.click();await tick();await tick();};
const dataFor=f=>JSON.parse(f.w.localStorage.getItem(STORE)).documents.find(d=>d.id===ID);
const reviewFields=(f,disposition)=>{for(const input of f.all('.wcs-governance-check input'))input.checked=true;f.input('[name=governance-disposition]',disposition);f.input('#action-comment','Sources and scope checked against this exact version. The cited wording describes an existing source; this is not an exception approval.');};
(async()=>{
  const failures=[];let count=0;
  async function check(name,run){try{await run();count++;console.log('PASS '+name);}catch(error){failures.push(error);console.error('FAIL '+name+'\n'+error.stack);}}
  await check('legacy reader sees classification review label without rewritten snapshots or reviewer evidence',async()=>{
    const before=clone(dataset),f=await fixture({hash:'#/document/'+ID,actor:'reader',sourceMode});try{assert.ok(f.find('[data-governance-unclassified]'));assert.equal(f.find('[data-action=edit],[data-action=revise]'),null);assert.equal(f.w.localStorage.getItem(STORE),null);assert.deepEqual(JSON.parse(JSON.stringify(f.w.WCSData)),before);assert.equal(f.find('.wcs-governance-evidence'),null);assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('incomplete governance cannot be submitted while legacy approved content remains available',async()=>{
    const data=governed('Draft'),doc=data.documents.find(d=>d.id===ID);delete doc.versions[1].governance;
    const f=await fixture({hash:'#/review/'+ID,actor:'alex',dataOverride:data,sourceMode});try{await click(f.find('[data-action=submit]'));f.input('#action-comment','Send this draft for review.');await f.submit('#workflow-form');assert.match(f.find('#form-error').textContent,/governance|classification|owning team/i);assert.ok(f.find('#workflow-form'));assert.equal(f.w.localStorage.getItem(STORE),null);assert.equal(W.publishedVersion(doc).version,doc.versions[0].version);assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('review checklist records exact-revision evidence and approval uses a 24-calendar-month target',async()=>{
    const data=governed(),doc=data.documents.find(d=>d.id===ID),original=clone(doc.versions[0]);
    const f=await fixture({hash:'#/review/'+ID,actor:'jordan',dataOverride:data,sourceMode});try{
      assert.ok(f.find('.wcs-governance-panel'));await click(f.find('[data-action=complete-review]'));assert.equal(f.all('.wcs-governance-check input').length,6);
      f.input('#action-comment','The content was reviewed.');await f.submit('#workflow-form');assert.equal(f.w.localStorage.getItem(STORE),null,'Missing checks cannot save');
      reviewFields(f,'clear');await f.submit('#workflow-form');assert.equal(f.find('#workflow-form'),null);let saved=dataFor(f),v=W.currentVersion(saved);assert.equal(v.status,'Awaiting approval');assert.equal(v.governanceReview.revision,1);assert.equal(v.governanceReview.reviewedBy,'jordan');assert.equal(v.governanceReview.actorSOEID.toUpperCase(),'JL12345');assert.equal(v.governanceReview.checks.guardrails,true);
      await click(f.find('[data-action=approve]'));const target=G.nextReviewDate(new Date().toISOString());assert.equal(f.find('#next-review').value,target);assert.equal(f.find('#next-review').max,target);assert.match(f.find('#workflow-form').textContent,/business best practice|Business best practice/);f.input('#action-comment','Approve the reviewed job aid for the intended audience.');await f.submit('#workflow-form');assert.equal(f.find('#workflow-form'),null);saved=dataFor(f);v=W.currentVersion(saved);assert.equal(v.status,'Published');assert.equal(v.nextReviewAt.slice(0,10),target);assert.deepEqual(saved.versions[0],original);assert.ok(saved.audit.some(e=>e.changes.some(c=>c.field==='governanceReview')));assert.equal(f.errors.length,0);
    }finally{f.close();}
  });
  await check('unresolved wording flags block completion and documented assessment is retained',async()=>{
    const f=await fixture({hash:'#/review/'+ID,actor:'jordan',dataOverride:governed('In review',true),sourceMode});try{await click(f.find('[data-action=complete-review]'));assert.ok(f.find('.wcs-governance-flags'));assert.equal(f.find('[name=governance-disposition] option[value=clear]'),null);reviewFields(f,'needs-authority');await f.submit('#workflow-form');assert.match(f.find('#form-error').textContent,/authority|unresolved|complete/i);assert.equal(f.w.localStorage.getItem(STORE),null);reviewFields(f,'addressed');await f.submit('#workflow-form');const v=W.currentVersion(dataFor(f));assert.equal(v.governanceReview.findingDisposition,'addressed');assert.ok(v.governanceReview.flagIds.length>=2);assert.match(v.governanceReview.reason,/not an exception/);assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('new draft editing clears the checklist while preserving previous approval evidence',async()=>{
    let data=governed(),doc=data.documents.find(d=>d.id===ID),v=W.currentVersion(doc);const opts={actorId:'jordan',people:data.people,now:'2026-10-15T10:00:00.000Z',expectedVersion:v.version,expectedRevision:v.revision,expectedAuditLength:doc.audit.length,comment:'Reviewed content.',requireGovernance:true,actorSOEID:'JL12345'};
    doc=W.transition(doc,'complete-review',{...opts,governanceReview:{version:v.version,revision:v.revision,baselineVersion:G.BASELINE_VERSION,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'clear',reason:'The content and sources have been checked.'}});doc=W.transition(doc,'approve',{...opts,expectedAuditLength:doc.audit.length,effectiveAt:opts.now,nextReviewAt:'2028-10-15'});data.documents=data.documents.map(d=>d.id===ID?doc:d);
    const f=await fixture({hash:'#/edit/'+ID,actor:'alex',dataOverride:data,sourceMode});try{assert.ok(f.find('#editor-title'));f.input('#editor-title','Prepare an updated handover');f.input('#editor-comment','Clarify the handover title.');await f.submit('#editor-form');const saved=dataFor(f),draft=W.currentVersion(saved);assert.equal(draft.status,'Draft');assert.equal(draft.governanceReview,null);assert.equal(draft.governance.classification,'other-nhd');assert.deepEqual(saved.versions.find(x=>x.version===doc.publishedVersion),doc.versions.find(x=>x.version===doc.publishedVersion));assert.equal(f.errors.length,0);}finally{f.close();}
  });
  if(failures.length)throw new AggregateError(failures,'Governance application checks failed');
  console.log(count+' governance application checks passed '+(sourceMode?'(source)':'(bundle)'));
})().catch(error=>{console.error(error);process.exitCode=1;});
