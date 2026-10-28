/* NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/editor-governance.cjs */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const G=require('../governance.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const tick=(delay=0)=>new Promise(resolve=>setTimeout(resolve,delay));
const metadata=()=>G.normalize({classification:'other-nhd',owningTeam:'Credit Operations',scope:'How to locate the supporting evidence.',audience:'Credit Operations colleagues',supportingTeam:'Learning',classificationRationale:'This guide explains an existing task without creating requirements.',sources:[{id:'source-1',title:'Authoritative source',url:'https://confluence.example/reference',version:'3.2',lastVerifiedAt:'2026-10-01T10:15:32Z'}]});
function fixture(overrides={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM('<main id="wcspedia"></main>',{url:'https://prototype.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.matchMedia=()=>({matches:false});
  for(const method of ['alert','confirm','prompt'])w[method]=()=>{throw Error('Native dialog forbidden');};
  let copied='',saved=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  for(const file of ['vendor/markdown-it-15.0.2.min.js','ui.js','editor-content.js','governance.js','editor.js'])w.eval(read(file));
  const host=d.getElementById('wcspedia'),options={actor:{id:'author',name:'Alex',initials:'AM'},people:[{id:'author',name:'Alex',initials:'AM',role:'Author'},{id:'manager',name:'Jordan',initials:'JL',role:'Manager'}],areas:[{id:'credit',title:'Credit Operations'}],types:['Job aid','Procedure','Guide','Checklist','FAQ','Playbook','Template','Reference','Blog','Training'],icon:()=>'',save:async fields=>saved.push(JSON.parse(JSON.stringify(fields))),preview:fields=>w.WCSEditorContent.render(fields.bodyMarkdown,fields),...overrides};
  let editor;
  const mount=()=>{editor=w.WCSEditor.create(options);host.innerHTML=editor.html();editor.bind(host);};mount();
  const find=selector=>host.querySelector(selector),input=(selector,value)=>{const el=find(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return el;};
  return {w,d,host,find,input,errors,saved,get editor(){return editor;},get copied(){return copied;},async submit(){find('#editor-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();},remount(){editor.destroy();w.WCSUI.destroy(host);mount();},close(){editor.destroy();w.WCSUI.destroy(host);w.close();}};
}
function content(f){f.input('#editor-title','Evidence guide');f.input('#editor-summary','Find the evidence for a task.');f.find('#editor-rich').innerHTML='<p>Locate the current reference.</p>';f.find('#editor-rich').dispatchEvent(new f.w.Event('input',{bubbles:true}));f.input('#editor-comment','Create the initial guide.');}
test('simplified editor omits governance without replacing stored metadata',async()=>{
 const f=fixture({type:'Job aid',governanceEnabled:false,version:{governance:metadata()}});
 try{assert.equal(f.find('.editor-governance'),null);content(f);await f.submit();assert.equal(f.saved.length,1);assert.equal(Object.hasOwn(f.saved[0],'governance'),false);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
function complete(f){for(const key of ['classification','owningTeam','scope','audience','supportingTeam','classificationRationale'])f.input('#editor-governance-'+key,metadata()[key]);}
function source(f){f.find('[data-governance-add-source]').click();const row=f.host.querySelector('[data-governance-source]:last-child');for(const [key,value] of Object.entries(metadata().sources[0])){const el=row.querySelector('[data-source-field='+key+']');el.value=key==='lastVerifiedAt'?value.slice(0,10):value;el.dispatchEvent(new f.w.Event('input',{bubbles:true}));}return row;}

test('new authoring offers configured non-procedure types and saves an explicitly unclassified draft',async()=>{
 const f=fixture({type:'Job aid'});try{const types=[...f.find('#editor-type').options].map(x=>x.value);assert.equal(types.includes('Procedure'),false);assert.deepEqual(types,['Job aid','Guide','Blog','Training']);assert.equal(f.find('#editor-type').value,'Job aid');const disclosure=f.find('.editor-governance');assert.equal(disclosure.open,false);disclosure.querySelector('summary').click();assert.equal(disclosure.open,true);assert.equal(f.find('#editor-governance-classification').value,'unclassified');assert.match(f.find('[data-governance-assessment]').textContent,/classification/);content(f);await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].governance.classification,'unclassified');assert.equal(f.saved[0].governance.reviewMonths,24);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('legacy edits preserve absent governance and retain the existing Procedure classification for migration',async()=>{
 const doc={id:'legacy',type:'Procedure',area:'credit',ownerId:'author',reviewerId:'manager',approverId:'manager'},version={version:1,revision:2,title:'Existing procedure',summary:'Existing document.',bodyMarkdown:'A previous task description.',status:'Published'};
 const f=fixture({document:doc,version,editingPublished:true});try{assert.equal(f.find('#editor-type').disabled,true);assert.match(f.find('#editor-type').selectedOptions[0].textContent,/existing Procedure/);f.find('.editor-governance summary').click();f.input('#editor-title','A revised title');f.input('#editor-comment','Clarify the title.');assert.equal(Object.hasOwn(f.editor.fields(),'governance'),false);await f.submit();assert.equal(f.saved.length,1);assert.equal(Object.hasOwn(f.saved[0],'governance'),false);assert.equal(version.governance,undefined);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('source rows and unchanged full verification timestamps survive editing and recovery without false changes',async()=>{
 const governance=metadata(),f=fixture({version:{title:'Source guide',summary:'Summary',bodyMarkdown:'Follow the existing source.',governance}});try{assert.equal(f.find('[data-source-field=lastVerifiedAt]').value,'2026-10-01');assert.equal(f.find('[data-source-field=lastVerifiedAt]').type,'text');assert.equal(f.find('[data-source-field=lastVerifiedAt]').dataset.wcsUi,'date');f.input('#editor-governance-supportingTeam','Learning and Development');assert.equal(f.editor.fields().governance.sources[0].lastVerifiedAt,'2026-10-01T10:15:32Z');f.remount();assert.ok(f.find('[data-restore]'));f.find('[data-restore]').click();assert.equal(f.find('.editor-governance').open,true);assert.equal(f.editor.fields().governance.supportingTeam,'Learning and Development');assert.equal(f.editor.fields().governance.sources[0].lastVerifiedAt,'2026-10-01T10:15:32Z');assert.ok(f.editor.isDirty());f.input('[data-source-field=lastVerifiedAt]','2026-10-02');assert.equal(f.editor.fields().governance.sources[0].lastVerifiedAt,'2026-10-02');assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('draft validation rejects unsafe or duplicate source identities; removal allows retry without lost fields',async()=>{
 const f=fixture();try{content(f);complete(f);const first=source(f);f.input('[data-source-field=url]','javascript:alert(1)');await f.submit();assert.equal(f.saved.length,0);assert.match(f.find('#editor-error').textContent,/HTTPS/);assert.equal(f.find('#editor-governance-owningTeam').value,'Credit Operations');f.input('[data-source-field=url]','https://confluence.example/reference');const second=source(f);await f.submit();assert.equal(f.saved.length,0);assert.match(f.find('#editor-error').textContent,/unique/);second.querySelector('[data-governance-remove-source]').click();assert.equal(f.d.activeElement,f.find('[data-governance-add-source]'));await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].governance.sources.length,1);assert.equal(f.saved[0].governance.sources[0].id,'source-1');assert.equal(first.isConnected,true);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('classification adjusts the review basis and preview flags wording without claiming approval',async()=>{
 const f=fixture();try{content(f);complete(f);f.input('#editor-title','Mandatory policy <img src=x onerror=alert(1)>');await tick(180);const preview=f.find('[data-governance-assessment]');assert.match(preview.textContent,/wording flag/);assert.match(preview.textContent,/assigned reviewer must confirm/);assert.equal(preview.querySelector('img'),null);f.input('#editor-governance-classification','formal-reference');await tick(180);assert.equal(f.editor.fields().governance.reviewBasis,'formal-governance');assert.match(f.find('[data-governance-review-caption]').textContent,/authoritative source/);assert.doesNotMatch(f.find('.editor-governance-target').textContent,/24 calendar months/);f.input('#editor-governance-classification','other-bod');await tick(180);assert.equal(f.editor.fields().governance.reviewBasis,'business-best-practice');assert.match(f.find('.editor-governance-target').textContent,/24 calendar months/);assert.match(f.find('.editor-governance-target').textContent,/not a mandatory governance cycle/);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('copying Markdown includes readable governance and source references, never private decision JSON',async()=>{
 const f=fixture({version:{title:'Source guide',summary:'Summary',bodyMarkdown:'Read the source.',governance:metadata(),governanceReview:{reason:'PRIVATE REVIEW'}}});try{f.find('[data-editor-action=copy-markdown]').click();await tick();assert.match(f.copied,/## Governance/);assert.match(f.copied,/\*\*Document classification:\*\* Other NHD/);assert.match(f.copied,/### Authoritative sources/);assert.match(f.copied,/Source ID: source-1/);assert.match(f.copied,/2026-10-01T10:15:32Z/);assert.doesNotMatch(f.copied,/PRIVATE REVIEW|"baselineVersion"/);assert.deepEqual(f.errors,[]);}finally{f.close();}
});

test('document slugs follow new titles automatically with accent normalization and known collision suffixes',()=>{
 const f=fixture({existingSlugs:['cafe-evidence-guide','cafe-evidence-guide-2']});try{
  const field=f.find('#editor-slug');assert.equal(field.readOnly,true);assert.equal(field.value,'');
  f.input('#editor-title','Café evidence guide');assert.equal(f.editor.fields().slug,'cafe-evidence-guide-3');
  f.input('#editor-title','Clear handover: evidence & contacts');assert.equal(f.editor.fields().slug,'clear-handover-evidence-contacts');
  assert.match(f.find('#editor-slug-help').textContent,/Generated from the title/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('an explicit custom slug survives title edits and recovery until automatic generation is restored',()=>{
 const f=fixture();try{
  content(f);f.find('[data-editor-action=slug-customize]').click();assert.equal(f.find('#editor-slug').readOnly,false);
  f.input('#editor-slug','credit-evidence');f.input('#editor-title','A clearer document title');assert.equal(f.editor.fields().slug,'credit-evidence');
  f.remount();f.find('[data-restore]').click();assert.equal(f.editor.fields().slug,'credit-evidence');assert.equal(f.find('#editor-slug').readOnly,false);
  f.input('#editor-title','Another title');assert.equal(f.editor.fields().slug,'credit-evidence');
  f.find('[data-editor-action=slug-auto]').click();assert.equal(f.editor.fields().slug,'another-title');assert.equal(f.find('#editor-slug').readOnly,true);
  f.input('#editor-title','Final title');assert.equal(f.editor.fields().slug,'final-title');
  assert.equal(Object.hasOwn(f.editor.fields(),'editorState'),false);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('automatic slug mode survives recovery and non-Latin titles receive a stable usable fallback',()=>{
 const f=fixture();try{
  content(f);f.input('#editor-title','信用服务培训');const fallback=f.editor.fields().slug;assert.match(fallback,/^document-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  f.input('#editor-title','信用服务培训 — 更新');assert.equal(f.editor.fields().slug,fallback);
  f.remount();f.find('[data-restore]').click();assert.equal(f.editor.fields().slug,fallback);assert.equal(f.find('#editor-slug').readOnly,true);
  f.input('#editor-title','Credit training');assert.equal(f.editor.fields().slug,'credit-training');
  f.input('#editor-title','');assert.equal(f.editor.fields().slug,'');assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('editing or recovering an existing document preserves its saved slug when the title changes',()=>{
 const doc={id:'permanent-document-key',type:'Job aid',area:'credit',ownerId:'author',reviewerId:'manager',approverId:'manager'},version={version:2,revision:3,slug:'saved-document-link',title:'Old title',summary:'Existing guidance.',bodyMarkdown:'Keep the document identity.',status:'Published'};
 const f=fixture({document:doc,version,editingPublished:true});try{
  f.input('#editor-title','Renamed guidance');assert.equal(f.editor.fields().slug,'saved-document-link');assert.equal(f.find('#editor-slug').readOnly,true);
  f.remount();f.find('[data-restore]').click();f.input('#editor-title','Another renamed title');assert.equal(f.editor.fields().slug,'saved-document-link');
  assert.equal(doc.id,'permanent-document-key');assert.equal(version.slug,'saved-document-link');assert.match(f.find('#editor-slug-help').textContent,/saved slug stays unchanged/);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('collision suffixes fit the maximum slug length and manual malformed slugs are rejected without losing content',async()=>{
 const long='a'.repeat(120),f=fixture({existingSlugs:[long,long.slice(0,118)+'-2']});try{
  content(f);f.input('#editor-title',long);assert.equal(f.editor.fields().slug,long.slice(0,118)+'-3');assert.equal(f.editor.fields().slug.length,120);
  f.find('[data-editor-action=slug-customize]').click();f.input('#editor-slug','Not a valid slug');await f.submit();assert.equal(f.saved.length,0);assert.match(f.find('#editor-error').textContent,/lowercase slug/);assert.equal(f.find('#editor-title').value,long);
  f.find('[data-editor-action=slug-auto]').click();await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].slug,long.slice(0,118)+'-3');assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('source identifiers are generated once, hidden from authoring, and kept stable through edits and recovery',()=>{
 const f=fixture({version:{title:'Source guide',summary:'Summary',bodyMarkdown:'Read the source.',governance:metadata()}});try{
  const prior=f.find('[data-source-field=id]');assert.equal(prior.type,'hidden');assert.equal(prior.value,'source-1');
  f.find('[data-governance-add-source]').click();f.find('[data-governance-add-source]').click();
  const before=f.editor.fields().governance.sources.map(s=>s.id);assert.equal(new Set(before).size,3);assert.match(before[1],/^source-/);
  assert.equal(f.host.querySelectorAll('[data-source-field=id]:not([type=hidden])').length,0);assert.equal(f.host.querySelectorAll('.editor-governance-source-meta .editor-field').length,6);
  f.input('[data-source-field=title]','Updated source title');assert.deepEqual(Array.from(f.editor.fields().governance.sources,s=>s.id),Array.from(before));
  f.remount();f.find('[data-restore]').click();assert.deepEqual(Array.from(f.editor.fields().governance.sources,s=>s.id),Array.from(before));assert.equal(f.editor.fields().governance.sources[0].lastVerifiedAt,'2026-10-01T10:15:32Z');assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
