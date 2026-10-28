/* Permission-aware application flows against the shared deployed bundle.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/entitlements-app.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,files,tick,STORE}=require('./app-fixture.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const contentDoc=dataset.documents.find(doc=>doc.versions.at(-1).status==='Published');
const draftDoc=dataset.documents.find(doc=>doc.versions.at(-1).status==='Draft');
const policyWithout=(soeid,permission)=>{const policy=clone(dataset.entitlementPolicy);for(const record of policy.records)if(record.soeid===soeid)record.permissions=record.permissions.filter(p=>p!==permission);return policy;};
const savedDocuments=f=>JSON.parse(f.w.localStorage.getItem(STORE)||'{"documents":[]}').documents;
const savedPolicy=f=>JSON.parse(f.w.localStorage.getItem(STORE+'.entitlements'));
const assertNoErrors=f=>assert.deepEqual(f.errors.map(error=>error.message),[]);
(async()=>{
  let passed=0;const failures=[];const sourceMode=process.argv.includes('--source');
  async function check(name,run){try{await run();passed++;process.stdout.write('PASS '+name+'\n');}catch(error){failures.push(error);console.error('FAIL '+name+'\n'+error.stack);}}
  await check('large result sets keep a bounded pager and preserve query, type, and sort when changing page',async()=>{
    const data=clone(dataset);data.documents=Array.from({length:223},(_,i)=>{const doc=clone(contentDoc),number=String(i+1).padStart(3,'0');doc.id='library-entry-'+number;doc.reference='WCS-JA-'+number;doc.type='Job aid';doc.versions[0].title='Library entry '+number;return doc;});
    const f=await fixture({hash:'#/results?q=Library&type=Job+aid&sort=title&page=20',dataOverride:data,sourceMode});try{
      assert.equal(f.all('.press-card').length,6);const pager=f.find('nav[aria-label="Document pages"]');assert.ok(pager);
      assert.equal(pager.querySelector('[aria-current="page"]').textContent,'20');assert.ok(pager.querySelectorAll('.wcs-page-numbers>li').length<=13);
      assert.equal(pager.querySelectorAll('.wcs-page-gap').length,2);assert.equal(pager.querySelectorAll('.wcs-page-gap a,.wcs-page-gap button').length,0);
      const next=pager.querySelector('.wcs-page-next'),params=new URLSearchParams(new URL(next.href).hash.split('?')[1]);
      assert.equal(params.get('q'),'Library');assert.equal(params.get('type'),'Job aid');assert.equal(params.get('sort'),'title');assert.equal(params.get('page'),'21');
      next.click();await tick();await tick();assert.equal(f.find('[aria-current="page"]').textContent,'21');assert.match(f.find('.discovery-pagination').textContent,/Showing 121–126 of 223/);
      assertNoErrors(f);
    }finally{f.close();}
  });
  await check('the standalone creation control is present on all local pages and routes to the author workspace',async()=>{
    for(const role of Object.keys(files)){
      const f=await fixture({role,actor:'alex',sourceMode});try{
        const host=f.d.querySelector('[data-wcs-add-document]');assert.ok(host,role+' navigation host');assert.equal(host.closest('#wcspedia'),null);
        const trigger=host.querySelector('button');assert.ok(trigger);assert.equal(trigger.disabled,false);trigger.click();await tick();
        const item=[...f.d.querySelectorAll('[role=menuitem]')].find(node=>node.textContent==='Training');assert.ok(item);item.click();await tick();await tick();
        const target=f.navigation.at(-1)||f.w.location.href;assert.equal(new URL(target).pathname,'/'+files.mine);assert.equal(new URLSearchParams(new URL(target).hash.split('?')[1]).get('type'),'Training');
        assertNoErrors(f);
      }finally{f.close();}
    }
  });
  await check('a denied identity sees the Citi access message without privileged directory records or controls',async()=>{
    const f=await fixture({role:'entitlements',actor:'alex',sourceMode});try{
      assert.equal(f.find('h1').textContent,'Not permitted');assert.match(f.find('.access-identity').textContent,/AM12345/);assert.equal(f.find('.entitlement-table'),null);assert.equal(f.find('[data-entitlement="add"]'),null);
      assert.ok(f.d.querySelector('[data-wcs-entitlements-link]').href.includes(files.entitlements));assertNoErrors(f);
    }finally{f.close();}
  });
  await check('large entitlement directories paginate with bounded links and normalize fractional page input',async()=>{
    const policy=clone(dataset.entitlementPolicy);for(let i=0;i<223;i++)policy.records.push({id:'grant-fixture-'+i,soeid:'U'+String(10000+i),displayName:'Colleague '+i,scope:'*',permissions:['content.edit'],active:true});
    const f=await fixture({role:'entitlements',actor:'jordan',hash:'#/entitlements?page=12.5',policy,sourceMode});try{
      assert.equal(f.all('.entitlement-table tbody tr').length,10);assert.equal(f.find('[aria-current="page"]').textContent,'12');assert.match(f.find('.discovery-pagination').textContent,/Showing 111–120 of 225/);
      assert.ok(f.all('.wcs-page-numbers>li').length<=13);assert.equal(f.all('.wcs-page-gap').length,2);
      const size=f.find('#entitlement-page-size');size.value='25';size.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();
      assert.equal(f.all('.entitlement-table tbody tr').length,25);assert.equal(f.find('[aria-current=page]').textContent,'1');
      f.input('#entitlement-query','Colleague');await f.submit('[data-entitlement-search]');assert.equal(f.find('#entitlement-page-size').value,'25');assert.equal(f.all('.entitlement-table tbody tr').length,25);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('directory viewing does not grant entitlement administration or document creation',async()=>{
    const policy=clone(dataset.entitlementPolicy);policy.records.push({id:'grant-reader-view',soeid:'RD12345',displayName:'Reader',scope:'*',permissions:['entitlements.view'],active:true});
    const f=await fixture({role:'entitlements',actor:'reader',policy,sourceMode});try{
      assert.ok(f.find('.entitlement-table'));assert.equal(f.all('[data-entitlement="add"],[data-entitlement="edit"],[data-entitlement="revoke"]').length,0);
      const creationHost=f.d.querySelector('[data-wcs-add-document]');assert.ok(creationHost);
      assert.equal(creationHost.dataset.wcsAddState,'denied');assert.equal(creationHost.hidden,false);
      assert.equal(creationHost.querySelector('button').disabled,true);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('global navigation respects unsaved editor changes through the shared Citi dialog',async()=>{
    const f=await fixture({role:'mine',hash:'#/create',actor:'alex',sourceMode});try{
      f.input('#editor-title','An unfinished draft');f.d.querySelector('[data-wcs-entitlements-link]').click();await tick();assert.equal(f.navigation.length,0);assert.match(f.find('.wcs-ui-dialog').textContent,/Keep your changes/);f.find('[data-keep]').click();assert.equal(f.find('#editor-title').value,'An unfinished draft');
      f.d.querySelector('[data-wcs-add-document] button').click();await tick();[...f.d.querySelectorAll('[role=menuitem]')].find(item=>item.textContent==='Training').click();await tick();assert.equal(f.navigation.length,0);assert.match(f.find('.wcs-ui-dialog').textContent,/Keep your changes/);f.find('[data-keep]').click();assert.equal(f.find('#editor-title').value,'An unfinished draft');assertNoErrors(f);
    }finally{f.close();}
  });
  await check('the directory searches SOEID and records add, edit, and revoke with actor and before/after history',async()=>{
    const f=await fixture({role:'entitlements',actor:'jordan',sourceMode});try{
      assert.equal(f.all('.entitlement-table tbody tr').length,2);f.input('#entitlement-query','AM12345');await f.submit('[data-entitlement-search]');assert.equal(f.all('.entitlement-table tbody tr').length,1);assert.match(f.find('.entitlement-table tbody').textContent,/Alex Morgan/);
      await f.navigate('#/entitlements');f.find('[data-entitlement="add"]').click();f.input('#access-soeid','RD12345');f.input('#access-name','Reader');f.find('[name="permission"][value="content.create"]').checked=true;f.input('#access-reason','Training contributor access.');await f.submit('[data-entitlement-form]');
      let policy=savedPolicy(f),record=policy.records.find(r=>r.soeid==='RD12345');assert.ok(record);assert.equal(policy.revision,2);assert.equal(policy.audit.at(-1).actorSOEID,'JL12345');assert.equal(policy.audit.at(-1).changes[0].before,null);assert.equal(f.find('.wcs-ui-dialog'),null);
      f.find('[data-entitlement="edit"][data-id="'+record.id+'"]').click();assert.equal(f.find('#access-soeid').readOnly,true);f.find('[name="permission"][value="content.edit"]').checked=true;f.input('#access-reason','Permit maintenance of training material.');await f.submit('[data-entitlement-form]');
      policy=savedPolicy(f);record=policy.records.find(r=>r.id===record.id);assert.ok(record.permissions.includes('content.edit'));assert.equal(policy.revision,3);assert.equal(policy.audit.at(-1).action,'edit');assert.ok(policy.audit.at(-1).changes[0].before.permissions.includes('content.create'));
      f.find('[data-entitlement="revoke"][data-id="'+record.id+'"]').click();f.input('#access-reason','Contributor assignment ended.');await f.submit('[data-entitlement-form]');policy=savedPolicy(f);assert.equal(policy.records.some(r=>r.id===record.id),false);assert.equal(policy.revision,4);assert.equal(policy.audit.at(-1).action,'revoke');assert.equal(policy.audit.at(-1).changes[0].after,null);assert.equal(f.all('.entitlement-history-table tbody tr').length,3);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('the last entitlement administrator cannot be revoked through the directory',async()=>{
    const f=await fixture({role:'entitlements',actor:'jordan',sourceMode});try{
      f.find('[data-entitlement="revoke"][data-id="grant-jordan-admin"]').click();f.input('#access-reason','Attempt to remove final administrator.');await f.submit('[data-entitlement-form]');
      assert.match(f.find('.wcs-ui-dialog .form-error').textContent,/last active entitlement administrator/i);assert.equal(f.w.localStorage.getItem(STORE+'.entitlements'),null);assert.ok(f.find('[data-entitlement-cancel]'));assertNoErrors(f);
    }finally{f.close();}
  });
  await check('a policy update removes editing controls and blocks direct editor access',async()=>{
    const f=await fixture({actor:'alex',hash:'#/document/'+draftDoc.id,sourceMode});try{
      assert.ok(f.find('[data-action="edit"]'));await f.policyChange(policyWithout('AM12345','content.edit'));assert.equal(f.find('[data-action="edit"]'),null);
      await f.navigate('#/edit/'+draftDoc.id);assert.match(f.root.textContent,/Editing unavailable/);assert.equal(f.find('#editor-form'),null);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('published edit opens the full editor and saving atomically creates an audited draft',async()=>{
    const f=await fixture({role:'mine',actor:'alex',hash:'#/document/'+contentDoc.id,sourceMode});try{
      assert.ok(f.find('[data-action="revise"]'));assert.equal(f.find('[data-action="delete"]'),null);f.find('[data-action="revise"]').click();await tick();await tick();
      assert.equal(f.find('.wcs-ui-dialog'),null);assert.ok(f.find('#editor-form'));assert.equal(savedDocuments(f).length,0,'Opening editor does not create a draft');assert.match(f.find('#editor-save-status').textContent,/Editing published version/);
      f.input('#editor-title','Updated information record procedure');f.input('#editor-comment','Specify the receiving owner.');await f.submit('#editor-form');
      let doc=savedDocuments(f).find(d=>d.id===contentDoc.id);assert.ok(doc);assert.equal(doc.id,contentDoc.id);assert.equal(doc.versions.length,contentDoc.versions.length+1);assert.equal(doc.publishedVersion,contentDoc.publishedVersion);assert.deepEqual(doc.versions[0],contentDoc.versions[0]);assert.equal(doc.versions.at(-1).title,'Updated information record procedure');assert.equal(doc.versions.at(-1).revision,1);assert.equal(doc.audit.at(-1).action,'revise');assert.equal(doc.audit.at(-1).actorSOEID.toUpperCase(),'AM12345');assert.equal(doc.audit.at(-1).documentKey,contentDoc.id);assert.ok(doc.audit.at(-1).changes.some(c=>c.field==='title'));assert.ok(f.navigation.at(-1).includes('#/document/'+contentDoc.id+'?tab=content&version=2'));
      await f.navigate('#/edit/'+doc.id);f.input('#editor-title','Second saved revision');f.input('#editor-comment','Clarify the receiving team.');await f.submit('#editor-form');doc=savedDocuments(f).find(d=>d.id===contentDoc.id);assert.equal(doc.versions.at(-1).revision,2);assert.equal(doc.audit.at(-1).action,'edit');assert.deepEqual(doc.versions[0],contentDoc.versions[0]);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('canceling a published edit discards unsaved changes without creating a working version',async()=>{
    const source='#/document/'+contentDoc.id+'?tab=content&version=1',f=await fixture({role:'mine',actor:'alex',hash:'#/edit/'+contentDoc.id+'?returnTo='+encodeURIComponent(source),sourceMode});try{
      f.input('#editor-title','Unsaved published change');f.find('[data-editor-action="cancel"]').click();assert.match(f.find('.wcs-ui-dialog').textContent,/Keep your changes/);f.find('[data-discard]').click();assert.equal(savedDocuments(f).length,0);assert.equal(new URL(f.navigation.at(-1)).hash,source);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('published edits are rejected when permission is revoked or a concurrent draft has been saved',async()=>{
    for(const conflict of ['permission','revision']){const f=await fixture({role:'mine',actor:'alex',hash:'#/edit/'+contentDoc.id,sourceMode});try{
      f.input('#editor-title','Keep this unsaved change');f.input('#editor-comment','Test commit-time access and concurrency.');
      if(conflict==='permission')await f.policyChange(policyWithout('AM12345','content.edit'));
      else{const doc=f.w.WCSWorkflow.transition(clone(contentDoc),'revise',{actorId:'alex',people:dataset.people,now:new Date().toISOString(),expectedVersion:1,expectedRevision:contentDoc.versions.at(-1).revision,expectedAuditLength:contentDoc.audit.length,comment:'A concurrent working draft.'});f.w.localStorage.setItem(STORE,JSON.stringify({schema:3,documents:dataset.documents.map(d=>d.id===doc.id?doc:d),areas:dataset.areas}));}
      await f.submit('#editor-form');assert.equal(f.find('#editor-title').value,'Keep this unsaved change');assert.match(f.find('#editor-error').textContent,/permission|status|changed/i);assert.equal(savedDocuments(f).some(d=>d.versions.some(v=>v.title==='Keep this unsaved change')),false);assertNoErrors(f);
    }finally{f.close();}}
  });
  await check('storage quota failure preserves the editor and retry saves exactly one audited draft',async()=>{
    const initial={schema:3,documents:clone(dataset.documents),areas:clone(dataset.areas)},f=await fixture({role:'mine',actor:'alex',hash:'#/edit/'+contentDoc.id,stored:initial,sourceMode,configureWindow(w){
      const setItem=w.Storage.prototype.setItem;w.__testQuotaFull=false;w.Storage.prototype.setItem=function(key,value){if(this===w.localStorage&&key===STORE&&w.__testQuotaFull)throw new w.DOMException('Storage quota exceeded.','QuotaExceededError');return setItem.call(this,key,value);};
    }});try{
      const before=f.w.localStorage.getItem(STORE);f.input('#editor-title','A draft retained when storage is full');f.input('#editor-comment','Clarify ownership without losing the working copy.');f.w.__testQuotaFull=true;await f.submit('#editor-form');
      assert.equal(f.w.localStorage.getItem(STORE),before,'Failed persistence does not add a version or audit event');assert.equal(f.navigation.length,0,'Failed save cannot leave the editor');assert.ok(f.find('#editor-form'));assert.equal(f.find('#editor-title').value,'A draft retained when storage is full');assert.equal(f.find('#editor-comment').value,'Clarify ownership without losing the working copy.');assert.match(f.find('#editor-error').textContent,/storage.*unavailable or full/i);assert.equal(f.find('#editor-save-button').disabled,false);
      f.w.__testQuotaFull=false;await f.submit('#editor-form');const saved=savedDocuments(f).find(d=>d.id===contentDoc.id);assert.equal(saved.versions.length,contentDoc.versions.length+1);assert.equal(saved.audit.length,contentDoc.audit.length+1);assert.equal(saved.audit.at(-1).action,'revise');assert.equal(saved.versions.at(-1).title,'A draft retained when storage is full');assert.deepEqual(saved.versions[0],contentDoc.versions[0]);assert.equal(saved.publishedVersion,contentDoc.publishedVersion);assert.equal(f.navigation.length,1);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('article audit offers no JSON download action',async()=>{
    const f=await fixture({actor:'alex',hash:'#/document/'+contentDoc.id+'?tab=audit',sourceMode});try{assert.equal(f.find('[data-action="export"]'),null);assert.equal(f.all('button,a').some(el=>/export.*json|download.*json/i.test(el.textContent)),false);assertNoErrors(f);}finally{f.close();}
  });
  await check('delete requires the exact key and preserves version snapshots with a deletion audit',async()=>{
    const f=await fixture({actor:'jordan',hash:'#/document/'+contentDoc.id,sourceMode});try{
      f.find('[data-action="delete"]').click();f.input('[name="delete-key"]','wrong-key');f.input('[name="action-comment"]','Superseded procedure removed from circulation.');await f.submit('#workflow-form');assert.match(f.find('#form-error').textContent,/exact document key/i);assert.equal(savedDocuments(f).length,0);
      f.input('[name="delete-key"]',contentDoc.id);await f.submit('#workflow-form');const doc=savedDocuments(f).find(d=>d.id===contentDoc.id);assert.ok(doc.deletedAt);assert.equal(doc.deletedBy,'jordan');assert.equal(doc.versions.length,contentDoc.versions.length);assert.equal(doc.audit.at(-1).action,'delete');assert.equal(doc.audit.at(-1).documentKey,contentDoc.id);assert.equal(doc.audit.at(-1).actorSOEID.toUpperCase(),'JL12345');
      await f.navigate('#/results?q='+encodeURIComponent(contentDoc.versions[0].title));assert.equal(f.all('.press-card h2 a').some(a=>new URL(a.href).hash.startsWith('#/document/'+contentDoc.id+'?')),false);await f.navigate('#/document/'+contentDoc.id);assert.equal(f.find('.document-body'),null);assert.equal(f.find('[data-action="delete"]'),null);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('revocation during an open delete dialog is rechecked at commit',async()=>{
    const f=await fixture({actor:'jordan',hash:'#/document/'+contentDoc.id,sourceMode});try{
      f.find('[data-action="delete"]').click();await f.policyChange(policyWithout('JL12345','content.delete'));f.input('[name="delete-key"]',contentDoc.id);f.input('[name="action-comment"]','Attempt after permission was revoked.');await f.submit('#workflow-form');
      assert.equal(savedDocuments(f).length,0);assert.match(f.find('#form-error').textContent,/permission|allowed|entitl/i);assertNoErrors(f);
    }finally{f.close();}
  });
  await check('revocation during editing blocks saving without discarding the entered content',async()=>{
    const f=await fixture({role:'mine',actor:'alex',hash:'#/edit/'+draftDoc.id,sourceMode});try{
      f.input('#editor-title','Unsaved maintenance note');f.input('#editor-comment','A change entered before entitlement removal.');await f.policyChange(policyWithout('AM12345','content.edit'));await f.submit('#editor-form');assert.equal(savedDocuments(f).length,0);assert.equal(f.find('#editor-title').value,'Unsaved maintenance note');assert.match(f.find('#editor-error').textContent,/permission|allowed|entitl/i);assertNoErrors(f);
    }finally{f.close();}
  });
  if(failures.length)throw new AggregateError(failures,failures.length+' entitlement application checks failed.');
  process.stdout.write(passed+' entitlement application checks passed'+(sourceMode?' (source modules)':' (deployment bundle)')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
