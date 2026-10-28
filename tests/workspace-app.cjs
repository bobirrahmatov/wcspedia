/* Real-DOM integration checks against the generated deployment bundle.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
 * No browser automation or runtime dependencies are added to WCSpedia.
 */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,files,tick,STORE}=require('./app-fixture.cjs');
(async()=>{
  let passed=0;async function check(name,run){await run();passed++;process.stdout.write('PASS '+name+'\n');}
  const sourceMode=process.argv.includes('--source');
  await check('generated bundle exposes all new dependencies and mounts the knowledge home',async()=>{
    const f=await fixture({sourceMode});try{for(const name of ['WCSNavigation','WCSWorkspaceCharts','WCSSuggestions','WCSEditor','WCSEntitlements','WCSPagination','WCSEntitlementsPage','WCSAddDocument','WCSDataTable','WCSWorkspaceTable'])assert.ok(f.w[name],name+' missing from bundle');assert.match(f.find('h1').textContent,/world of knowledge/i);assert.equal(f.all('.wcs-suggestion-widget').length,1);assert.equal(f.errors.length,0);assert.equal(f.all('.demo-bar,.connection-bar,.workspace-entry-links').length,0,'Landing omits identity/demo strips and workspace navigation');for(const role of ['mine','review','entitlements'])assert.equal(new URL(f.w.WCS_CONFIG.pages[role],f.w.location.href).pathname,'/'+files[role],'Workspace remains available through its configured native-navigation destination');}finally{f.close();}
  });
  await check('My workspace opens its own view and status chips filter current document versions',async()=>{
    const f=await fixture({role:'mine',sourceMode});try{assert.equal(f.w.location.hash,'#/results?view=mine');assert.equal(f.find('h1').textContent,'My workspace');assert.ok(f.find('[data-suggestion-inbox="mine"]'));const link=f.all('.workspace-status-tabs a').find(a=>a.textContent.startsWith('In review'));assert.ok(link);await f.navigate(new URL(link.href).hash);assert.equal(f.find('.workspace-status-tabs a[aria-current="page"]').textContent.trim().startsWith('In review'),true);const current=dataset.documents.filter(doc=>doc.authorId==='alex'||doc.ownerId==='alex').map(doc=>doc.versions.reduce((a,b)=>a.version>b.version?a:b)).filter(v=>v.status==='In review');assert.equal(f.all('.workspace-document-row').length,current.length);assert.ok(f.all('.workspace-document-row .badge').every(b=>b.textContent==='In review'));assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('Reviewer workspace focuses on the queue and preserves stage filtering',async()=>{
    const f=await fixture({role:'review',actor:'jordan',sourceMode});try{assert.equal(f.find('h1').textContent,'Reviewer workspace');assert.equal(f.charts.length,0);assert.ok(f.find('[data-suggestion-inbox="review"]'));assert.equal(f.all('.workspace-status-tabs').length,0);const stage=f.find('[data-review-stage]');assert.deepEqual([...stage.options].map(o=>o.value),['','In review','Awaiting approval']);stage.value='In review';stage.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();assert.ok(f.all('.workspace-review-row .badge').every(b=>b.textContent==='In review'));assert.ok(f.charts.slice(0,2).every(c=>c.destroyed));await f.navigate('#/document/'+dataset.documents[0].id);assert.ok(f.charts.every(c=>c.destroyed));assert.equal(f.all('.wcs-suggestion-widget').length,1);assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('My workspace and suggestions share the entitlement table surface, including empty results',async()=>{
    const f=await fixture({role:'mine',hash:'#/results?view=mine&q=NoDocumentMatchesThis',sourceMode});try{
      assert.equal(f.all('.press-results .workspace-document-row').length,0);assert.ok(f.find('.press-results .wcs-workspace-table.wcs-data-table'));assert.match(f.find('.press-results .wcs-data-table-state').textContent,/No matching documents/);assert.ok(f.find('[data-suggestion-inbox] .wcs-data-table'));assert.match(f.find('[data-suggestion-inbox] .wcs-data-table-state').textContent,/No open suggestions/);assert.equal(f.all('.press-card,.review-item').length,0);assert.equal(f.errors.length,0);
    }finally{f.close();}
  });
  await check('workspace row edit and delete actions target the exact document and obey refreshed entitlements',async()=>{
    const policy=JSON.parse(JSON.stringify(dataset.entitlementPolicy)),grant=policy.records.find(r=>r.soeid==='AM12345');grant.permissions.push('content.delete');
    const f=await fixture({role:'mine',hash:'#/results?view=mine&status=Draft',policy,sourceMode});try{
      const row=f.all('.workspace-document-row').at(-1),id=row.dataset.recordKey,original=dataset.documents.find(d=>d.id===id);assert.ok(id);assert.ok(row.querySelector('[data-action=edit]'));assert.ok(row.querySelector('[data-action=delete]'));
      row.querySelector('[data-action=edit]').click();await tick();await tick();assert.equal(f.find('#editor-title').value,original.versions.at(-1).title);assert.equal(f.w.location.hash.split('?')[0],'#/edit/'+id);assert.equal(new URLSearchParams(f.w.location.hash.split('?')[1]).get('returnTo'),'#/results?view=mine&status=Draft');assert.equal(f.find('.wcs-ui-dialog'),null);
      await f.navigate('#/results?view=mine&status=Draft');f.find('[data-action=delete][data-document-id="'+id+'"]').click();assert.equal(f.find('[name="delete-key"]').placeholder,id);f.input('[name="delete-key"]',id);f.input('[name="action-comment"]','Duplicate draft removed after review.');await f.submit('#workflow-form');
      const stored=JSON.parse(f.w.localStorage.getItem(STORE)).documents;assert.ok(stored.find(d=>d.id===id).deletedAt);assert.equal(stored.filter(d=>d.deletedAt).length,1);assert.equal(stored.find(d=>d.id===id).audit.at(-1).actorSOEID.toUpperCase(),'AM12345');
      await f.navigate('#/results?view=mine&status=Draft');grant.permissions=grant.permissions.filter(p=>!['content.edit','content.delete'].includes(p));await f.policyChange(policy);assert.ok(f.find('.workspace-document-row'));assert.equal(f.all('.workspace-document-row [data-action=edit],.workspace-document-row [data-action=delete]').length,0);assert.equal(f.errors.length,0);
    }finally{f.close();}
  });
  await check('reviewer table pagination preserves search and stage while compacting a large queue',async()=>{
    const data=JSON.parse(JSON.stringify(dataset)),template=data.documents.find(d=>d.versions.at(-1).status==='In review');data.documents=Array.from({length:223},(_,i)=>{const d=JSON.parse(JSON.stringify(template));d.id='queue-document-'+i;d.reference='QUEUE-'+i;d.versions.at(-1).title='Queue check '+String(i).padStart(3,'0');return d;});
    const f=await fixture({role:'review',actor:'jordan',hash:'#/review?stage=In+review&q=Queue&page=12',dataOverride:data,sourceMode});try{
      assert.equal(f.all('.workspace-review-row').length,10);assert.equal(f.find('.review-queue [aria-current=page]').textContent,'12');assert.equal(f.all('.review-queue .wcs-page-gap').length,2);assert.ok(f.all('.review-queue .wcs-page-numbers>li').length<=13);
      const next=f.find('.review-queue .wcs-page-next'),params=new URLSearchParams(new URL(next.href).hash.split('?')[1]);assert.equal(params.get('q'),'Queue');assert.equal(params.get('stage'),'In review');assert.equal(params.get('page'),'13');next.click();await tick();await tick();assert.match(f.find('.review-queue .discovery-pagination').textContent,/Showing 121–130 of 223/);
      f.input('#review-query','Queue check 222');await f.submit('[data-review-search]');assert.equal(f.all('.workspace-review-row').length,1);assert.equal(new URLSearchParams(f.w.location.hash.split('?')[1]).get('stage'),'In review');assert.equal(f.find('.review-queue [aria-current=page]').textContent,'1');
      const stage=f.find('[data-review-stage]');stage.value='Awaiting approval';stage.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();assert.equal(f.find('#review-query').value,'Queue check 222');assert.equal(f.all('.workspace-review-row').length,0);assert.match(f.find('.review-queue .wcs-data-table-state').textContent,/all caught up/);assert.equal(f.errors.length,0);
    }finally{f.close();}
  });
  await check('dirty cross-page links and search shortcut use the Citi discard dialog',async()=>{
    const f=await fixture({role:'mine',hash:'#/create',sourceMode});try{f.input('#editor-title','Unsaved guidance');const home=f.find('.breadcrumbs a');home.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));assert.equal(f.navigation.length,0);assert.match(f.find('.wcs-ui-dialog').textContent,/Keep your changes/);f.find('[data-keep]').click();assert.equal(f.find('#editor-title').value,'Unsaved guidance');f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));assert.equal(f.navigation.length,0);assert.match(f.find('.wcs-ui-dialog')?.textContent||'',/Keep your changes/);f.find('[data-discard]').click();assert.equal(f.navigation.at(-1),'http://localhost:4173/wcspedia-local.html#/?focus=search');assert.equal(f.errors.length,0);}finally{f.close();}
  });
  await check('draft save persists before cross-page review navigation and the new page reloads that draft',async()=>{
    const f=await fixture({role:'mine',hash:'#/create?type=Job+aid',sourceMode});let saved,target,id;try{
      f.input('#editor-title','A handover worth sharing');f.input('#editor-summary','Practical steps with ownership and supporting evidence.');const rich=f.find('#editor-rich');rich.innerHTML='<h2>Prepare the handover</h2><p>Collect the evidence and identify the next owner.</p>';rich.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.find('#editor-form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
      saved=f.w.localStorage.getItem(STORE);assert.ok(saved);const added=JSON.parse(saved).documents.find(doc=>doc.versions.some(v=>v.title==='A handover worth sharing'));assert.ok(added);id=added.id;target=f.navigation.at(-1);assert.equal(target,'http://localhost:4173/wcspedia-reviewer-workspace.html#/review/'+id);assert.equal(f.errors.length,0);
    }finally{f.close();}
    const next=await fixture({role:'review',hash:new URL(target).hash,stored:saved,sourceMode});try{assert.equal(next.find('h1').textContent,'A handover worth sharing');assert.ok(next.find('[data-action="submit"]'));assert.match(next.find('.review-content').textContent,/Collect the evidence/);assert.equal(next.all('.wcs-suggestion-widget').length,1);assert.equal(next.errors.length,0);}finally{next.close();}
  });
  await check('suggestion widget listeners and dialogs are cleaned up between page renders',async()=>{
    const f=await fixture({role:'mine',sourceMode});try{
      for(let i=0;i<3;i++){await f.navigate('#/results?view=mine&status='+encodeURIComponent(i%2?'Draft':'Published'));assert.equal(f.all('.wcs-suggestion-widget').length,1);}
      const shortcut=()=>new f.w.KeyboardEvent('keydown',{key:'s',altKey:true,shiftKey:true,bubbles:true,cancelable:true});
      const hostEvent=shortcut();f.d.body.dispatchEvent(hostEvent);assert.equal(hostEvent.defaultPrevented,false,'Confluence shortcuts outside WCSpedia remain available');assert.equal(f.all('.wcs-ui-dialog').length,0);
      const appRoot=f.d.getElementById('wcspedia');appRoot.tabIndex=-1;appRoot.focus();assert.equal(f.d.activeElement,appRoot);const appEvent=shortcut();appRoot.dispatchEvent(appEvent);
      assert.equal(appEvent.defaultPrevented,true);assert.equal(f.all('.wcs-ui-dialog').length,1);assert.match(f.find('.wcs-ui-dialog').textContent,/Suggest an edit/);f.find('[data-suggestion-cancel]').click();assert.equal(f.all('.wcs-ui-dialog').length,0);assert.equal(f.errors.length,0);
    }finally{f.close();}
  });
  process.stdout.write(passed+' workspace application integration checks passed'+(sourceMode?' (source modules)':' (deployment bundle)')+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
