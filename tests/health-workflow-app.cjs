/* Real WCSpedia health flows through the application, shared UI and service.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/health-workflow-app.cjs --source
 * Omit --source (or pass --bundle) to exercise the built deployment bundle. */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE}=require('./app-fixture.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),ID='credit-data-maintenance',HEALTH_STORE='wcspedia-content-health-v1';
const sourceMode=process.argv.includes('--source');
function sourceData(){
  const data=clone(dataset),version=data.documents.find(doc=>doc.id===ID).versions[0],now=Date.now(),day=86400000;
  // Keep the same reviewed publication, with a date clearly inside 365 days and
  // outside 30 days, independently of when this regression suite is run.
  version.governance={classification:'formal-reference',reviewBasis:'formal-governance',owningTeam:'Reference team',scope:'Historical reference',audience:'Credit operations',classificationRationale:'Existing formal reference fixture'};
  version.nextReviewAt=new Date(now+90*day).toISOString();version.reviewedAt=new Date(now-2*day).toISOString();version.approvedAt=new Date(now-day).toISOString();
  return data;
}
const record=f=>JSON.parse(f.w.localStorage.getItem(HEALTH_STORE)||'{"records":[]}').records.find(item=>item.documentKey===ID);
const snapshot=f=>f.w.localStorage.getItem(HEALTH_STORE);
const assertNoErrors=f=>assert.deepEqual(f.errors.map(error=>error.message),[]);
async function openFixture(options={}){return fixture({actor:'jordan',hash:'#/document/'+ID+'?tab=health',dataOverride:sourceData(),sourceMode,...options});}
async function actor(f,id){const field=f.find('#demo-actor');assert.ok(field,'Shared demo identity control');field.value=id;field.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();}
async function rules(f,warning,reason='Set a document-specific review warning.'){
  const trigger=f.find('[data-health-action="update-rules"]');assert.ok(trigger,'Manager rule action');trigger.click();f.input('.wcs-health-form [name=reviewWarningDays]',String(warning));f.input('.wcs-health-form [name=reason]',reason);await f.submit('.wcs-health-form');assert.equal(f.find('.wcs-health-form'),null,'Rules dialog closes after confirmed save');
}
async function action(f,name,reason){const trigger=f.find('[data-health-action="'+name+'"]');assert.ok(trigger,name+' action');trigger.click();f.input('.wcs-health-form [name=reason]',reason);await f.submit('.wcs-health-form');assert.equal(f.find('.wcs-health-form'),null,name+' dialog closes after confirmed save');}
(async()=>{
  let passed=0;const failures=[];
  async function check(name,run){try{await run();passed++;process.stdout.write('PASS '+name+'\n');}catch(error){failures.push(error);console.error('FAIL '+name+'\n'+error.stack);}}
  await check('manager rules persist separately from documents and update the detail, results, and health workspace',async()=>{
    const f=await openFixture();try{
      const documentsBefore=f.w.localStorage.getItem(STORE),seedBefore=JSON.stringify(f.w.WCSData.documents);
      assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Healthy');assert.match(f.find('.wcs-health-rule-panel h3').textContent,/Default rules/);
      await rules(f,365,'Start an earlier warning for this procedure.');
      const saved=record(f);assert.equal(saved.revision,1);assert.equal(saved.rulesRevision,1);assert.equal(saved.rules.reviewWarningDays,365);assert.equal(saved.documentKey,ID);assert.equal(saved.audit.length,1);assert.equal(saved.audit[0].action,'update-rules');assert.equal(saved.audit[0].actorSOEID.toUpperCase(),'JL12345');assert.ok(saved.audit[0].changes.some(change=>change.field==='rules'&&change.before.reviewWarningDays===30&&change.after.reviewWarningDays===365));assert.ok(saved.dueAt);
      assert.equal(f.w.localStorage.getItem(STORE),documentsBefore,'Health changes do not rewrite document versions');assert.equal(JSON.stringify(f.w.WCSData.documents),seedBefore);assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Review due');assert.match(f.find('.wcs-health-rule-panel h3').textContent,/Document rules.*revision 1/);assert.match(f.find('.wcs-health-audit').textContent,/Start an earlier warning/);
      await f.navigate('#/results?q=Maintaining+a+credit+information+record');assert.equal(f.find('.press-card .wcs-health-tag').textContent,'Review due');
      await f.navigate('#/health');const row=f.find('[data-record-key="'+ID+'"]');assert.ok(row);assert.equal(row.querySelector('.wcs-health-tag').textContent,'Review due');assert.match(row.textContent,/Alex Morgan/);assert.ok(row.querySelector('a[href*="tab=health"]'));assertNoErrors(f);
    }finally{f.close();}
  });
  await check('authors can work findings without changing rules, and readers never receive private health history',async()=>{
    const f=await openFixture();try{
      await rules(f,365,'PRIVATE MANAGER REASON');const before=snapshot(f);await actor(f,'alex');assert.ok(f.find('[data-health-action=start]'));assert.equal(f.find('[data-health-action=update-rules]'),null);assert.equal(f.find('[data-health-action=resolve]'),null);
      const forged=f.d.createElement('button');forged.dataset.healthAction='update-rules';f.find('.wcs-health').append(forged);forged.click();assert.equal(f.find('.wcs-health-form'),null);assert.match(f.find('.wcs-health-action-error').textContent,/permission/);assert.equal(snapshot(f),before);
      await actor(f,'reader');assert.equal(f.find('.wcs-health-audit'),null);assert.equal(f.find('[data-health-action]'),null);assert.equal(f.root.textContent.includes('PRIVATE MANAGER REASON'),false);assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Review due');assert.equal(f.all('.wcs-health-check').length,4);assert.equal(snapshot(f),before);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('owner submits health work and manager can resolve only after the finding is cleared',async()=>{
    const f=await openFixture();try{
      await rules(f,365,'Begin an earlier review cycle.');await actor(f,'alex');await action(f,'start','I am checking the current review schedule.');assert.equal(record(f).status,'In progress');await action(f,'submit','The current approved review date remains correct.');assert.equal(record(f).status,'Ready for verification');assert.equal(f.find('[data-health-action=resolve]'),null);
      await actor(f,'jordan');assert.equal(f.find('[data-health-action=resolve]'),null);assert.match(f.find('.wcs-health').textContent,/Resolve becomes available/);const unresolved=snapshot(f),forged=f.d.createElement('button');forged.dataset.healthAction='resolve';f.find('.wcs-health').append(forged);forged.click();assert.equal(f.find('.wcs-health-form'),null);assert.equal(snapshot(f),unresolved,'An unresolved finding cannot be bypassed using a forged action');
      await rules(f,30,'The standard 30-day warning is appropriate for this procedure.');assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Healthy');await action(f,'resolve','I verified all enabled checks against the current approved document.');const saved=record(f);assert.equal(saved.status,'Resolved');assert.equal(saved.revision,5);assert.deepEqual(saved.audit.map(event=>event.action),['update-rules','start','submit','update-rules','resolve']);assert.deepEqual(saved.audit.map(event=>event.actorSOEID.toUpperCase()),['JL12345','AM12345','AM12345','JL12345','JL12345']);assert.equal(f.find('.wcs-health-progress [aria-current=step]').textContent,'4Resolved');assertNoErrors(f);
    }finally{f.close();}
  });
  await check('a newer approved revision rejects an open rules command and retains the unsaved explanation',async()=>{
    const data=sourceData(),f=await openFixture({dataOverride:data});try{
      f.find('[data-health-action=update-rules]').click();f.input('.wcs-health-form [name=reviewWarningDays]','365');f.input('.wcs-health-form [name=reason]','Keep this explanation after the publication changes.');const before=snapshot(f),changed=clone(data),doc=changed.documents.find(item=>item.id===ID);doc.versions[0].revision++;doc.versions[0].reviewedRevision=doc.versions[0].revision;
      const state=JSON.stringify({schema:3,documents:changed.documents,areas:changed.areas});f.w.localStorage.setItem(STORE,state);f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:STORE,newValue:state,storageArea:f.w.localStorage}));await tick();await tick();assert.ok(f.find('.wcs-health-form'),'Concurrent publication must not discard the dialog');await f.submit('.wcs-health-form');assert.equal(snapshot(f),before);assert.equal(f.find('.wcs-health-form [name=reason]').value,'Keep this explanation after the publication changes.');assert.match(f.find('.wcs-health-form .form-error').textContent,/approved document changed/i);assert.equal(f.find('.wcs-health-form [type=submit]').disabled,true,'Stale publication requires refresh before retry');assert.equal(JSON.parse(f.w.localStorage.getItem(STORE)).documents.find(item=>item.id===ID).versions[0].revision,2);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('revocation during a rules dialog blocks save without losing entries or writing health audit',async()=>{
    const f=await openFixture();try{
      f.find('[data-health-action=update-rules]').click();f.input('.wcs-health-form [name=reviewWarningDays]','365');f.input('.wcs-health-form [name=reason]','Retain this work after access is revoked.');const before=snapshot(f),policy=clone(dataset.entitlementPolicy);policy.records.forEach(item=>{if(item.soeid==='JL12345')item.permissions=item.permissions.filter(permission=>permission!=='content.edit');});await f.policyChange(policy);
      assert.ok(f.find('.wcs-health-form'),'Entitlement refresh must not discard the dialog');await f.submit('.wcs-health-form');assert.equal(snapshot(f),before);assert.equal(record(f),undefined);assert.equal(f.find('.wcs-health-form [name=reason]').value,'Retain this work after access is revoked.');assert.equal(f.find('.wcs-health-form [name=reviewWarningDays]').value,'365');assert.match(f.find('.wcs-health-form .form-error').textContent,/permission|access/i);assertNoErrors(f);
    }finally{f.close();}
  });
  if(failures.length)throw new AggregateError(failures,failures.length+' health application checks failed.');
  process.stdout.write(passed+' health application checks passed'+(sourceMode?' (source modules)':' (deployment bundle)')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
