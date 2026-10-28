'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,tick}=require('./app-fixture.cjs');
test('authoring defers personal/health reads and entering their view loads them once',async t=>{
  let libraryReads=0,implementation;
  const f=await fixture({role:'mine',hash:'#/create?type=Blog',sourceMode:true,configureWindow(w){
    w.WCS_CONFIG.mode='confluence';w.WCS_CONFIG.authoringMode='confluence-session';w.WCS_CONFIG.mountGlobalTools=false;
    Object.defineProperty(w,'WCSSuggestions',{configurable:true,get:()=>null,set:()=>{}});
    const adapter={info:()=>({}),load:async opts=>({data:w.WCSData,actorId:'alex',canSubmit:false,workspaceLoaded:true,workspaceScope:opts.workspaceScope,identity:{soeid:'AM12345'},nativePermissions:{root:[],documents:{},entitlements:[]}}),loadMetrics:async()=>({})};
    Object.defineProperty(w,'WCSConfluence',{configurable:true,get:()=>({create:()=>adapter}),set:()=>{}});
    Object.defineProperty(w,'WCSLibraryWorkflows',{configurable:true,get:()=>({create:opts=>{const service=implementation.create(opts);return {...service,load:(...args)=>{libraryReads++;return service.load(...args);}};}}),set:value=>{implementation=value;}});
  }});t.after(f.close);
  assert.equal(libraryReads,0);
  await f.navigate('#/entitlements');await tick();assert.equal(libraryReads,0);
  await f.navigate('#/health');await tick();assert.equal(libraryReads,1);
  await f.navigate('#/health?page=2');assert.equal(libraryReads,1);assert.equal(f.errors.length,0);
});
test('preview uses one shared reader column and returning preserves the draft',async t=>{
  const f=await fixture({role:'mine',hash:'#/create?type=Blog',sourceMode:true});t.after(f.close);
  f.input('#editor-title','Preview alignment');f.input('#editor-summary','A useful summary.');
  const rich=f.find('#editor-rich');rich.innerHTML='<h2>Heading</h2><p>Useful content.</p>';rich.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  f.find('[data-editor-action="preview"]').click();
  const layout=f.find('#editor-reader .editor-preview-layout');assert.ok(layout.querySelector(':scope > .insights-header'));assert.ok(layout.querySelector(':scope > .editor-preview-body'));
  assert.equal(layout.querySelector('.insights-category').textContent,'Insights');
  assert.match(layout.querySelector('.article-taxonomy a:last-child').href,/#\/insights$/);
  f.find('[data-editor-action="preview"]').click();assert.equal(f.find('#editor-title').value,'Preview alignment');assert.match(f.find('#editor-rich').textContent,/Useful content/);assert.equal(f.find('#editor-reader').hidden,true);assert.equal(f.errors.length,0);
});
test('Insights articles never show pending approval controls, including old review links',async t=>{
  const {dataset}=require('./app-fixture.cjs');const data=JSON.parse(JSON.stringify(dataset));
  const doc=data.documents.find(d=>d.type==='Procedure'&&d.publishedVersion);
  doc.area='insights';doc.publicationMode='direct-insight';doc.reviewerId=null;doc.approverId=null;
  const v=doc.versions.find(v=>v.version===doc.publishedVersion);v.publishedAt=v.approvedAt;v.approvedAt=null;v.approvedBy=null;v.reviewedAt=null;v.reviewedBy=null;
  const f=await fixture({role:'mine',hash:'#/review/'+doc.id,actor:doc.authorId,dataOverride:data,sourceMode:true});t.after(f.close);
  assert.ok(f.find('[aria-label="Article details"]'));assert.doesNotMatch(f.find('[aria-label="Article details"]').textContent,/Pending approval|Pending review|Assigned to/);
  assert.match(f.find('.insights-category').textContent,/Insights/);assert.doesNotMatch(f.find('.insights-byline').textContent,/Draft/);
  await f.navigate('#/document/'+doc.id+'?tab=approval');assert.ok(f.find('[aria-label="Article details"]'));assert.equal(f.find('.review-decision'),null);assert.deepEqual(f.errors,[]);
});
