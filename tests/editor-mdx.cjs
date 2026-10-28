'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const metadata={format:'wcspedia-mdx-v1',title:'Historical evidence guide',summary:'Find the supporting evidence.',type:'Guide',area:'insights',sourceId:'legacy-evidence-01',originalCreatedAt:'2021-04-08',originalUpdatedAt:'2024-06-12T14:30:00+02:00',sourceAuthor:'Original author',sourcePath:'legacy/evidence.mdx',tags:['Collateral'],processes:['Annual review'],regions:['EMEA']};
const mdx=(changes={},body='## Purpose\n\nLocate the current reference.')=>'---\n'+Object.entries({...metadata,...changes}).map(([key,value])=>key+': '+JSON.stringify(value)).join('\n')+'\n---\n\n'+body;
function fixture(overrides={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM('<main id="wcspedia"></main>',{url:'https://prototype.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.matchMedia=()=>({matches:false});
  let copied='',saved=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  for(const file of ['vendor/markdown-it-15.0.2.min.js','ui.js','editor-content.js','governance.js','editor.js'])w.eval(read(file));
  const host=d.getElementById('wcspedia'),options={actor:{id:'author',name:'Alex',initials:'AM'},people:[{id:'author',name:'Alex',initials:'AM',role:'Author'},{id:'manager',name:'Jordan',initials:'JL',role:'Manager'}],areas:[{id:'credit-approval-control',title:'Credit Approval Control'}],types:['Guide','Job aid','Procedure'],icon:()=>'',save:async fields=>saved.push(JSON.parse(JSON.stringify(fields))),preview:fields=>w.WCSEditorContent.render(fields.bodyMarkdown,fields),...overrides};
  let editor;
  const mount=()=>{editor=w.WCSEditor.create(options);host.innerHTML=editor.html();editor.bind(host);};mount();
  const find=selector=>host.querySelector(selector),input=(selector,value)=>{const el=find(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return el;};
  return {w,d,host,find,input,errors,saved,get editor(){return editor;},get copied(){return copied;},async submit(){find('#editor-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();},remount(){editor.destroy();w.WCSUI.destroy(host);mount();},close(){editor.destroy();w.WCSUI.destroy(host);w.close();}};
}
function openImport(f,text){f.find('[data-editor-action="paste-markdown"]').click();f.input('#paste-markdown-content',text);}
async function importStep(f){f.find('#paste-markdown-content').closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();}
async function applyImport(f,text){openImport(f,text);await importStep(f);assert.equal(f.find('[data-import-preview]').hidden,false);await importStep(f);assert.equal(f.find('#paste-markdown-content'),null);}

test('MDX previews without mutation, applies metadata and body, then saves with no supplied import timestamp',async()=>{
  const f=fixture();try{
    f.input('#editor-title','Existing unsaved title');openImport(f,mdx());await importStep(f);
    assert.equal(f.editor.fields().title,'Existing unsaved title');assert.equal(f.editor.fields().sourceMetadata,undefined);
    assert.match(f.find('[data-import-preview]').textContent,/2021-04-08/);assert.match(f.find('[data-import-preview]').textContent,/2024-06-12T14:30:00\+02:00/);
    await importStep(f);const fields=JSON.parse(JSON.stringify(f.editor.fields()));
    assert.equal(fields.title,metadata.title);assert.equal(fields.summary,metadata.summary);assert.equal(fields.type,'Guide');assert.equal(fields.area,metadata.area);assert.deepEqual(fields.tags,['Collateral']);
    assert.equal(fields.sourceMetadata.originalCreatedAt,'2021-04-08');assert.equal(fields.sourceMetadata.originalUpdatedAt,metadata.originalUpdatedAt);assert.equal(fields.sourceImportedAt,undefined);
    assert.equal(fields.slug,'historical-evidence-guide');assert.equal(fields.bodyMarkdown,'## Purpose\n\nLocate the current reference.');assert.doesNotMatch(f.find('#editor-rich').textContent,/wcspedia-mdx-v1|sourceId/);
    await f.submit();assert.equal(f.saved.length,1);assert.deepEqual(f.saved[0].sourceMetadata,fields.sourceMetadata);assert.equal(f.saved[0].sourceImportedAt,undefined);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});
test('revised paste must be previewed again and metadata cannot be inserted into another body',async()=>{
  const f=fixture();try{
    openImport(f,mdx());await importStep(f);f.input('#paste-markdown-content',mdx({title:'Corrected title'}));await importStep(f);
    assert.equal(f.editor.fields().title,'');assert.match(f.find('[data-import-preview]').textContent,/Corrected title/);
    f.input('#paste-markdown-mode','insert');await importStep(f);assert.match(f.find('.editor-dialog-error').textContent,/complete document/);assert.equal(f.editor.fields().sourceMetadata,undefined);
    f.input('#paste-markdown-mode','replace');await importStep(f);await importStep(f);assert.equal(f.editor.fields().title,'Corrected title');
  }finally{f.close();}
});
test('invalid dates, unavailable area/type and executable MDX leave editor content intact',async()=>{
  for(const [text,pattern] of [[mdx({originalCreatedAt:'2021-02-29'}),/date/i],[mdx({type:'Job aid',area:'unknown-area'}),/business area/],[mdx({type:'Unknown',area:'credit-approval-control'}),/content type/],[mdx({},'<Widget />'),/JSX|MDX|component/i],[mdx({sourceImportedAt:'2020-01-01'}),/field|key/i]]){
    const f=fixture();try{f.input('#editor-title','Keep this title');f.find('#editor-rich').innerHTML='<p>Keep this body.</p>';openImport(f,text);await importStep(f);assert.match(f.find('.editor-dialog-error').textContent,pattern);assert.equal(f.editor.fields().title,'Keep this title');assert.equal(f.editor.fields().bodyMarkdown,'Keep this body.');assert.equal(f.editor.fields().sourceMetadata,undefined);assert.deepEqual(f.errors,[]);}finally{f.close();}
  }
});
test('provenance survives recovery, ordinary Markdown replacement, save and copied Markdown',async()=>{
  const f=fixture();try{
    await applyImport(f,mdx({originalCreatedAt:null}));f.remount();f.find('[data-restore]').click();assert.equal(f.editor.fields().sourceMetadata.originalCreatedAt,null);assert.equal(f.editor.fields().sourceMetadata.sourceId,metadata.sourceId);
    await applyImport(f,'## Updated body\n\nRetain the source dates.');assert.equal(f.editor.fields().sourceMetadata.originalUpdatedAt,metadata.originalUpdatedAt);
    f.find('[data-editor-action="copy-markdown"]').click();await tick();const imported=f.w.WCSEditorContent.normalizeImport(f.copied);assert.equal(imported.metadata.sourceMetadata.sourceId,metadata.sourceId);assert.equal(imported.metadata.area,metadata.area);assert.equal(imported.metadata.type,'Guide');
    await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].sourceMetadata.originalCreatedAt,null);assert.match(f.find('#editor-source-metadata').textContent,/Not recorded/);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});
test('existing source identity is protected while original-date corrections and saved slug survive',async()=>{
  const parsed=require('../editor-content.js').normalizeImport(mdx()),sourceMetadata=parsed.metadata.sourceMetadata;
  const f=fixture({document:{id:'doc-1',type:'Guide',area:metadata.area,ownerId:'author',reviewerId:'manager',approverId:'manager'},version:{title:metadata.title,summary:metadata.summary,slug:'saved-slug',bodyMarkdown:parsed.bodyMarkdown,sourceMetadata,sourceImportedAt:'2026-10-16T08:00:00.000Z',version:1,revision:1}});try{
    openImport(f,mdx({sourceId:'different-source'}));await importStep(f);assert.match(f.find('.editor-dialog-error').textContent,/different Source ID/);assert.equal(f.editor.fields().sourceMetadata.sourceId,metadata.sourceId);
    f.input('#paste-markdown-content',mdx({originalUpdatedAt:'2025-01-09'}));await importStep(f);await importStep(f);
    assert.equal(f.editor.fields().sourceMetadata.originalUpdatedAt,'2025-01-09');assert.equal(f.editor.fields().slug,'saved-slug');f.input('#editor-comment','Correct source date from original record.');await f.submit();assert.equal(f.saved.length,1);assert.equal(f.saved[0].sourceImportedAt,undefined);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});
test('metadata in source editing is rejected with guidance instead of silently stripped',async()=>{
  const f=fixture();try{f.find('[data-editor-action="source"]').click();f.input('#editor-source',mdx());f.find('[data-editor-action="preview"]').click();assert.match(f.find('#editor-error').textContent,/Use Paste MDX/);assert.equal(f.editor.fields().sourceMetadata,undefined);assert.equal(f.find('#editor-source').value,mdx());}finally{f.close();}
});
test('raw frontmatter in recovery stays intact in source mode until explicitly imported',async()=>{
  const f=fixture();try{
    f.find('[data-editor-action="source"]').click();f.input('#editor-source',mdx());f.remount();f.find('[data-restore]').click();
    assert.equal(f.find('#editor-source').hidden,false);assert.equal(f.find('#editor-source').value,mdx());assert.equal(f.editor.fields().bodyMarkdown,mdx());assert.equal(f.editor.fields().sourceMetadata,undefined);
    assert.match(f.find('#editor-error').textContent,/complete MDX was restored/);await applyImport(f,f.find('#editor-source').value);assert.equal(f.editor.fields().sourceMetadata.originalCreatedAt,'2021-04-08');assert.doesNotMatch(f.editor.fields().bodyMarkdown,/originalCreatedAt/);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});

test('explicit import and failed save report typed notifications without reporting keystrokes or preview',async()=>{
  const notices=[];const f=fixture({notify:(message,options)=>notices.push({message,type:options.type}),save:async()=>{throw Error('Save service is unavailable.');}});try{
    f.input('#editor-title','A title');assert.equal(notices.length,0);
    openImport(f,mdx());await importStep(f);assert.equal(notices.length,0);await importStep(f);
    assert.equal(notices.length,1);assert.equal(notices[0].type,'success');assert.match(notices[0].message,/Import applied/);
    await f.submit();assert.equal(notices.length,2);assert.equal(notices[1].type,'error');assert.match(f.find('#editor-error').textContent,/Save service is unavailable/);
    assert.equal(f.editor.fields().title,metadata.title);
  }finally{f.close();}
});


test('Blog comment selector preserves false through MDX import, recovery, save and export',async()=>{
 const f=fixture({types:['Blog','Guide'],type:'Blog'});try{
   assert.equal(f.find('#editor-comments-settings').hidden,false);assert.equal(f.editor.fields().commentsEnabled,true);
   f.input('#editor-type','Guide');assert.equal(f.find('#editor-comments-settings').hidden,false);
   await applyImport(f,mdx({type:'Blog',commentsEnabled:false}));
   assert.equal(f.find('#editor-comments-settings').hidden,false);assert.equal(f.editor.fields().commentsEnabled,false);
   f.remount();f.find('[data-restore]').click();assert.equal(f.editor.fields().commentsEnabled,false);
   f.find('[data-editor-action="copy-markdown"]').click();await tick();assert.equal(f.w.WCSEditorContent.normalizeImport(f.copied).metadata.commentsEnabled,false);
   await f.submit();assert.equal(f.saved[0].commentsEnabled,false);
   for(const bad of ['false',0,null]){openImport(f,mdx({type:'Blog',commentsEnabled:bad}));await importStep(f);assert.match(f.find('.editor-dialog-error').textContent,/commentsEnabled/);assert.equal(f.editor.fields().commentsEnabled,false);f.find('.wcs-ui-close').click();}
 }finally{f.close();}
});

test('blog editor fixes destination to Insights and excludes review assignments',async()=>{
  const f=fixture({types:['Job aid','Blog'],type:'Blog'});try{
    assert.equal(f.find('#editor-area').closest('.editor-field').hidden,true);
    assert.equal(f.find('.editor-ownership').hidden,true);assert.equal(f.find('.editor-governance').hidden,true);
    assert.equal(f.find('#editor-insights-destination').hidden,false);
    assert.equal(f.find('#editor-save-button').textContent,'Publish to Insights');
    let fields=f.editor.fields();assert.equal(fields.area,'insights');assert.equal(fields.publicationMode,'direct-blog');assert.equal(fields.reviewerId,null);assert.equal(fields.approverId,null);assert.equal(fields.governance,undefined);
    f.input('#editor-type','Job aid');assert.equal(f.find('.editor-ownership').hidden,false);assert.equal(f.find('#editor-area').closest('.editor-field').hidden,false);assert.equal(f.editor.fields().publicationMode,undefined);
    f.input('#editor-type','Blog');await applyImport(f,mdx({type:'Blog',area:'insights'}));
    await f.submit();assert.equal(f.saved[0].area,'insights');assert.equal(f.saved[0].type,'Blog');assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});
test('unknown save keeps exact fields locked and offers Check save without a page reload',async()=>{
  const attempts=[];const f=fixture({save:async fields=>{attempts.push(JSON.parse(JSON.stringify(fields)));if(attempts.length===1){const e=Error('Write confirmation timed out');e.code='UNKNOWN_COMMIT';e.recoverable=true;throw e;}}});try{
    await applyImport(f,mdx());await f.submit();
    assert.equal(f.find('#editor-save-button').textContent,'Check save');assert.equal(f.find('#editor-save-button').disabled,false);
    assert.equal(f.find('#editor-title').disabled,true);assert.equal(f.find('#editor-rich').contentEditable,'false');assert.equal(f.find('[data-action="editor-reload"]'),null);assert.equal(f.editor.isBusy(),true);
    assert.equal(f.editor.requestLeave('#/'),false);
    // Even a scripted value change cannot replace the pending request's fields.
    f.find('#editor-title').value='Different title';await f.submit();
    assert.deepEqual(attempts[1],attempts[0]);assert.equal(f.editor.isBusy(),false);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});

test('editor remains usable after ten-minute idle and detached dialog cleanup preserves draft',async()=>{
 const f=fixture();try{
  await applyImport(f,mdx());const fields=JSON.stringify(f.editor.fields());
  f.find('[data-format="link"]').click();const dialog=f.find('.wcs-ui-backdrop');assert.ok(dialog);
  dialog.remove();await tick();
  const now=f.w.Date.now();f.w.Date.now=()=>now+600000;
  f.d.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(f.host.querySelector('[inert]'),null);
  f.find('[data-format="link"]').click();assert.ok(f.find('#insert-link-url'),'Detached dialog must not block new tools');
  f.find('[data-dialog-cancel]').click();
  f.find('[data-editor-action="preview"]').click();assert.equal(f.find('#editor-reader').hidden,false);
  f.find('[data-editor-action="preview"]').click();assert.equal(f.find('#editor-reader').hidden,true);
  assert.equal(JSON.stringify(f.editor.fields()),fields);await f.submit();assert.equal(f.saved.length,1);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('returning to the tab does not unlock an unknown save or change its retry payload',async()=>{
 const attempts=[];const f=fixture({save:async fields=>{attempts.push(JSON.stringify(fields));if(attempts.length===1){const e=Error('Unknown save');e.recoverable=true;throw e;}}});try{
  await applyImport(f,mdx());await f.submit();
  f.d.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(f.find('#editor-title').disabled,true);assert.equal(f.find('#editor-save-button').textContent,'Check save');
  await f.submit();assert.equal(attempts[0],attempts[1]);assert.equal(attempts.length,2);
 }finally{f.close();}
});

for(const type of require('../editor-content.js').INSIGHT_TYPES){
 test(type+' editor and MDX import omit business area and approval fields',async()=>{
  const f=fixture({types:['Job aid',...require('../editor-content.js').INSIGHT_TYPES],type});try{
   for(const selector of ['.editor-ownership','.editor-governance'])assert.equal(f.find(selector).hidden,true);
   assert.equal(f.find('#editor-area').closest('.editor-field').hidden,true);
   assert.equal(f.find('#editor-comments-settings').hidden,false);
   await applyImport(f,mdx({type,area:'credit-approval-control'}));await f.submit();
   assert.equal(f.saved.length,1);assert.equal(f.saved[0].area,'insights');assert.equal(f.saved[0].reviewerId,null);assert.equal(f.saved[0].approverId,null);
   assert.equal(f.saved[0].type,require('../editor-content.js').groupType(type));
   assert.equal(f.saved[0].publicationMode,type==='Blog'?'direct-blog':'direct-insight');assert.equal(f.saved[0].governance,undefined);
   f.input('#editor-type','Job aid');assert.equal(f.find('.editor-ownership').hidden,false);assert.equal(f.find('.editor-governance').hidden,false);
   assert.equal(f.editor.fields().publicationMode,undefined);assert.equal(f.find('#editor-save-button').textContent,'Save draft');assert.deepEqual(f.errors,[]);
  }finally{f.close();}
 });
}
