/* App-level integration for personal bookmarks and manager-controlled health. */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE,read}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source');
const doc=dataset.documents.find(d=>d.publishedVersion),hash='#/document/'+doc.id;
const settle=async()=>{for(let i=0;i<5;i++)await tick();};
async function click(f,selector){assert.ok(f.find(selector),selector);f.find(selector).click();await settle();}
(async()=>{
 let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
 await check('personal Save persists and Saved items opens the current approved document',async()=>{
  let saved;const f=await fixture({hash,sourceMode});try{
   assert.equal(f.find('[data-library-action="bookmark"]').getAttribute('aria-pressed'),'false');
   await click(f,'[data-library-action="bookmark"]');assert.equal(f.find('[data-library-action="bookmark"]').getAttribute('aria-pressed'),'true');
   saved=f.w.localStorage.getItem('wcspedia.bookmarks.v1');assert.ok(saved);assert.doesNotMatch(saved,/bodyMarkdown|summary|sections/);
   await f.navigate('#/saved');assert.equal(f.all('tbody tr').length,1);assert.match(f.find('tbody').textContent,/Current approved version/);assert.ok(f.find('.wcs-data-table-title').href.includes(doc.id));
   await click(f,'[data-library-action="bookmark"]');assert.equal(f.all('tbody tr').length,0);assert.match(f.find('.wcs-data-table-state').textContent,/No saved documents/);assert.equal(f.errors.length,0);
  }finally{f.close();}
  const restored=await fixture({role:'saved',sourceMode,configureWindow(w){w.localStorage.setItem('wcspedia.bookmarks.v1',saved);}});try{assert.equal(restored.w.location.hash,'#/saved');assert.equal(restored.all('tbody tr').length,1);assert.equal(restored.find('.wcs-data-table-title').href,'http://localhost:4173/wcspedia-local.html#/document/'+doc.id+'?tab=content&version='+doc.publishedVersion);assert.equal(restored.errors.length,0);}finally{restored.close();}
 });
 await check('Saved items has its own entry page and shared globally styled Confluence macro',async()=>{
  const f=await fixture({role:'saved',sourceMode});try{
   assert.equal(f.w.WCS_CONFIG.pageRole,'saved');assert.equal(f.w.location.hash,'#/saved');assert.match(f.find('h1').textContent,/Saved items/);assert.equal(f.find('.library-workspace-tabs'),null,'Standalone Saved page uses native navigation, not workspace tabs');
   assert.equal(f.find('.breadcrumbs a').href,'http://localhost:4173/wcspedia-local.html#/');
   assert.equal(f.errors.length,0);
  }finally{f.close();}
  const macro=read('wcspedia-saved-items-confluence-macro.html');assert.match(macro,/"pageRole": "saved"/);assert.match(macro,/REPLACE_WITH_SAVED_ITEMS_PAGE_ID/);const scriptURL=macro.match(/<script src="([^"\n]+wcspedia\.js\?[^"\n]+)"/);assert.ok(scriptURL,'Saved items loads the shared bundle');const assetURL=new URL(scriptURL[1].replace(/&amp;/g,'&'),'https://confluence.example');assert.equal(assetURL.pathname.split('/').at(-1),'wcspedia.js');assert.equal(assetURL.searchParams.get('api'),'v2');assert.equal(assetURL.searchParams.has('v'),false,'The legacy shared macro uses the latest attachment filename without a pinned version');assert.doesNotMatch(macro,/<link\b[^>]*rel=["']stylesheet|<style\b/i);
  assert.match(read('WCSpedia-saved-items-prototype.html'),/"pageRole": "saved"/);
 });
 await check('workspace Saved links target the standalone page and older Saved hashes still render',async()=>{
  const f=await fixture({role:'mine',sourceMode});try{
   assert.equal(f.find('.library-workspace-tabs a[href$="#/saved"]').href,'http://localhost:4173/wcspedia-saved-items.html#/saved');
   await f.navigate('#/saved');assert.match(f.find('h1').textContent,/Saved items/);assert.equal(f.find('.wcs-data-table')!==null,true);assert.equal(f.errors.length,0);
  }finally{f.close();}
 });
 await check('reviewer workspace omits duplicate secondary navigation while Saved remains directly reachable',async()=>{
  const f=await fixture({role:'review',actor:'jordan',sourceMode});try{
   assert.equal(f.find('.library-workspace-tabs'),null,'The simplified reviewer screen uses the existing shared header');
   await f.navigate('#/saved');assert.match(f.find('h1').textContent,/Saved items/);assert.equal(f.errors.length,0);
  }finally{f.close();}
 });
 await check('dirty editor navigation to the Saved page keeps or discards through the shared Citi dialog',async()=>{
  const f=await fixture({role:'mine',hash:'#/create',sourceMode});try{
   f.input('#editor-title','An unfinished procedure');const savedLink=f.d.createElement('a');savedLink.href=f.w.WCSNavigation.resolve('#/saved',f.w.WCS_CONFIG,f.w.location.href);savedLink.textContent='Saved items';f.root.querySelector('.breadcrumbs').append(savedLink);
   savedLink.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));assert.equal(f.navigation.length,0);assert.match(f.find('.wcs-ui-dialog').textContent,/Keep your changes/);f.find('[data-keep]').click();assert.equal(f.find('#editor-title').value,'An unfinished procedure');
   savedLink.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));f.find('[data-discard]').click();assert.equal(f.navigation.at(-1),'http://localhost:4173/wcspedia-saved-items.html#/saved');assert.equal(f.errors.length,0);
  }finally{f.close();}
 });
 await check('switching SOEID isolates bookmarks and switching back restores them',async()=>{
  const f=await fixture({hash,sourceMode});try{await click(f,'[data-library-action="bookmark"]');
   for(const [identity,expected] of [['jordan','false'],['alex','true']]){const select=f.find('#demo-actor');select.value=identity;select.dispatchEvent(new f.w.Event('change',{bubbles:true}));await settle();assert.equal(f.find('[data-library-action="bookmark"]').getAttribute('aria-pressed'),expected);}
   assert.equal(f.errors.length,0);
  }finally{f.close();}
 });
 await check('bookmark storage failure never shows Saved or reports success',async()=>{
  const f=await fixture({hash,sourceMode});try{f.w.Storage.prototype.setItem=function(){throw new Error('Quota exceeded');};await click(f,'[data-library-action="bookmark"]');assert.equal(f.find('[data-library-action="bookmark"]').getAttribute('aria-pressed'),'false');assert.match(f.d.querySelector('#wcs-notifications').textContent,/could not|unavailable|save|storage/i);assert.equal(f.find('[data-library-action="bookmark"]').disabled,false);assert.equal(f.errors.length,0);}finally{f.close();}
 });
 await check('workspace navigation, search and health tags share the existing table components',async()=>{
  const f=await fixture({role:'mine',sourceMode});try{assert.ok(f.find('.library-workspace-tabs a[href$="#/saved"]'));assert.ok(f.find('.library-workspace-tabs a[href$="#/health"]'));assert.ok(f.find('.wcs-workspace-table .wcs-health-tag'));await f.navigate('#/health');assert.ok(f.find('.page-panel'));assert.ok(f.find('.wcs-data-table'));assert.ok(f.all('tbody tr').length<=8);f.input('[data-library-search] input','no matching title');await f.submit('[data-library-search]');assert.equal(f.all('tbody tr').length,0);assert.match(f.find('.wcs-data-table-state').textContent,/No documents/);assert.equal(f.errors.length,0);}finally{f.close();}
 });
 await check('manager rule controls are separate from author and reader views',async()=>{
  for(const actor of ['alex','jordan','reader']){const f=await fixture({hash:hash+'?tab=health',actor,sourceMode});try{assert.ok(f.find('.wcs-health'));assert.equal(!!f.find('[data-health-action="update-rules"]'),actor==='jordan');if(actor==='reader'){assert.equal(f.find('.wcs-health-audit'),null);assert.equal(f.find('[data-health-action]'),null);}assert.equal(f.errors.length,0);}finally{f.close();}}
 });
 await check('a deleted bookmarked document disappears without creating a copied snapshot',async()=>{
  const f=await fixture({hash,sourceMode});try{await click(f,'[data-library-action="bookmark"]');const data=JSON.parse(JSON.stringify(dataset));data.documents.find(d=>d.id===doc.id).deletedAt=new Date().toISOString();f.w.localStorage.setItem(STORE,JSON.stringify({schema:3,...data}));await f.navigate('#/saved');assert.equal(f.all('tbody tr').length,0);assert.equal(f.errors.length,0);}finally{f.close();}
 });
 await check('Reset demo clears personal saves and document health rules before reloading the default library',async()=>{
  const data=JSON.parse(JSON.stringify(dataset)),published=data.documents.find(d=>d.id===doc.id).versions.find(v=>v.version===doc.publishedVersion);published.nextReviewAt=new Date(Date.now()+90*86400000).toISOString();
  const f=await fixture({hash:hash+'?tab=health',dataOverride:data,sourceMode});try{
   f.w.localStorage.setItem('unrelated-workspace-preference','keep');await click(f,'[data-library-action="bookmark"]');
   const person=f.find('#demo-actor');person.value='jordan';person.dispatchEvent(new f.w.Event('change',{bubbles:true}));await settle();await click(f,'[data-library-action="bookmark"]');
   await click(f,'[data-health-action="update-rules"]');f.input('.wcs-health-form [name=reviewWarningDays]','365');f.input('.wcs-health-form [name=reason]','Temporary demo warning policy.');await f.submit('.wcs-health-form');await settle();
   const healthKey=f.w.WCSHealthService.STORE,savedProfiles=JSON.parse(f.w.localStorage.getItem('wcspedia.bookmarks.v1')).profiles;assert.equal(savedProfiles.filter(profile=>profile.bookmarks.length===1).length,2);assert.equal(JSON.parse(f.w.localStorage.getItem(healthKey)).records[0].rules.reviewWarningDays,365);assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Review due');
   await click(f,'[data-action="reset"]');assert.equal(f.w.localStorage.getItem('wcspedia.bookmarks.v1'),null);assert.equal(f.w.localStorage.getItem(healthKey),null);assert.equal(f.w.localStorage.getItem(STORE+'.actor'),'alex');assert.equal(f.w.localStorage.getItem('unrelated-workspace-preference'),'keep');
   await f.navigate('#/saved');assert.equal(f.all('tbody tr').length,0);assert.match(f.find('.wcs-data-table-state').textContent,/No saved documents/);
   await f.navigate(hash+'?tab=health');assert.equal(f.find('[data-library-action="bookmark"]').getAttribute('aria-pressed'),'false');assert.match(f.find('.wcs-health-rule-panel h3').textContent,/Default rules/);assert.match(f.find('.wcs-health-rule-panel').textContent,/Review warning: 30 days/);assert.equal(f.find('.wcs-health-overview .wcs-health-tag').textContent,'Check needed','Reset restores the legacy unclassified seed without assigning governance metadata.');assert.equal(f.find('.wcs-health-audit tbody tr'),null);assert.equal(f.w.localStorage.getItem(healthKey),null);assert.equal(f.errors.length,0);
  }finally{f.close();}
 });
 console.log(passed+' library workflow application checks passed'+(sourceMode?' (source modules)':' (deployment bundle)'));
})().catch(error=>{console.error(error);process.exitCode=1;});
