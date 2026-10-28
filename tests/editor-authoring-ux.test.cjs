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
function selectCell(f,index){const cell=f.find('#editor-rich').querySelectorAll('td,th')[index],range=f.d.createRange();range.selectNodeContents(cell);range.collapse(false);const selection=f.w.getSelection();selection.removeAllRanges();selection.addRange(range);f.find('#editor-rich').dispatchEvent(new f.w.MouseEvent('mouseup',{bubbles:true}));return cell.closest('table');}
function key(f,key,extra={}){f.find('#editor-rich').dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));}
function selectionParent(f){const n=f.w.getSelection().anchorNode;return n.nodeType===3?n.parentElement:n;}
const tableMD='| A | B |\n| --- | --- |\n| C | D |';
test('Tab exits last cell without adding rows; Shift Tab exits first, shortcuts and toolbar move outside',()=>{
 const f=fixture({version:{bodyMarkdown:tableMD}});try{
  const table=selectCell(f,3);key(f,'Tab');assert.equal(table.rows.length,2);assert.equal(selectionParent(f),table.nextElementSibling);assert.equal(selectionParent(f).tagName,'P');
  selectCell(f,0);key(f,'Tab',{shiftKey:true});assert.equal(selectionParent(f),table.previousElementSibling);
  selectCell(f,1);key(f,'Enter',{ctrlKey:true});assert.equal(selectionParent(f),table.nextElementSibling);
  selectCell(f,2);f.find('[data-table="before"]').click();assert.equal(selectionParent(f),table.previousElementSibling);
  selectCell(f,2);f.find('[data-table="after"]').click();selectionParent(f).textContent='After the table';assert.match(f.editor.fields().bodyMarkdown,/\| C \| D \|\n\nAfter the table/);
  selectCell(f,0);key(f,'Tab');assert.equal(selectionParent(f).closest('th'),table.rows[0].cells[1]);
 }finally{f.close();}
});
test('type-specific templates preview, copy and append without replacing draft content or metadata',async()=>{
 const f=fixture({types:['Guide','Blog','Training','Report','Job aid'],type:'Blog',version:{bodyMarkdown:'Existing draft text.',tags:['credit-risk']}});try{
  f.input('#editor-title','Keep this title');assert.equal(f.find('[data-editor-action="template"]').textContent,'Blog template');
  f.find('[data-editor-action="template"]').click();assert.match(f.find('#editor-template-markdown').value,/## Key takeaways/);assert.equal(f.editor.fields().bodyMarkdown,'Existing draft text.');
  f.find('[data-copy-template]').click();await tick();assert.match(f.copied,/## Introduction/);
  f.find('#editor-template-markdown').closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.match(f.editor.fields().bodyMarkdown,/^Existing draft text\.\n\n## Introduction/);assert.equal(f.editor.fields().title,'Keep this title');assert.deepEqual([...f.editor.fields().tags],['credit-risk']);
  f.input('#editor-type','Report');assert.equal(f.find('[data-editor-action="template"]').textContent,'Report template');f.find('[data-editor-action="source"]').click();f.find('[data-editor-action="template"]').click();assert.match(f.find('#editor-template-markdown').value,/## Executive summary/);
  f.find('#editor-template-markdown').closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(f.find('#editor-source').value,/## Executive summary/);assert.ok(f.editor.isDirty());assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('edit mode offers the saved document type template and keeps attachments',async()=>{
 const f=fixture({document:{id:'saved-guide',type:'Guide',area:'insights'},version:{version:1,revision:1,bodyMarkdown:'[File](attachment:f1)',attachments:[{id:'f1',name:'file.txt',url:'/confluence/download/attachments/700/file.txt',mimeType:'text/plain',size:10}]}});try{
  assert.equal(f.find('[data-editor-action="template"]').textContent,'Guide template');f.find('[data-editor-action="template"]').click();f.find('#editor-template-markdown').closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(f.editor.fields().bodyMarkdown,/attachment:f1/);assert.equal(f.editor.fields().attachments[0].id,'f1');assert.match(f.editor.fields().bodyMarkdown,/## Troubleshooting/);
 }finally{f.close();}
});
test('all shortlist templates are valid and topic display preserves acronyms and stored filter values',()=>{
 const content=require('../editor-content.js'),insights=require('../insights.js');
 for(const type of content.CREATE_TYPES){const md=content.starterTemplate(type);assert.ok(content.normalizeImport(md).bodyMarkdown);assert.match(content.render(md),/<h2/);}
 assert.equal(content.topicLabel('credit-risk'),'Credit Risk');assert.equal(content.topicLabel('emea api controls'),'EMEA API Controls');assert.equal(content.topicLabel('iPhone support'),'iPhone Support');
 const source=read('insights.js');assert.match(source,/value="'\+esc\(topic\)/);assert.match(source,/esc\(content.topicLabel\(topic\)\)/);
});
