'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const content=require('./editor-content.js');
const sandbox={window:{WCSEditorContent:content}};
vm.runInNewContext(fs.readFileSync(__dirname+'/editor.js','utf8'),sandbox);
const serialize=sandbox.window.WCSEditor.domToMarkdown;
// Small DOM-shaped fixtures let these serializer invariants run without a CDN,
// browser, build step, or third-party test dependency. Browser interactions are
// separately verified against the delivered HTML.
const text=value=>({nodeType:3,textContent:value});
function node(name,attributes,...children){
  if(!attributes||typeof attributes!=='object'||attributes.nodeType){children.unshift(attributes);attributes={};}
  children=children.flat().filter(x=>x!=null).map(x=>typeof x==='string'?text(x):x);
  const element={nodeType:1,nodeName:name.toUpperCase(),childNodes:children,children:children.filter(x=>x.nodeType===1),style:{fontWeight:'',fontStyle:'',textDecoration:''},getAttribute:key=>attributes[key]??null,hasAttribute:key=>Object.hasOwn(attributes,key),className:attributes.class||'',type:attributes.type||'',checked:!!attributes.checked};
  Object.defineProperty(element,'textContent',{get:()=>children.map(x=>x.textContent).join('')});
  element.querySelectorAll=selector=>{const names=selector.split(',').map(x=>x.toUpperCase()),out=[];for(const child of element.children){if(names.includes(child.nodeName))out.push(child);out.push(...child.querySelectorAll(selector));}return out;};
  element.querySelector=selector=>element.querySelectorAll(selector)[0]||null;
  return element;
}
const doc=(...children)=>node('div',{},...children);

test('visual bold, italic, underline, strike and inline code survive Markdown rendering',()=>{
  const md=serialize(doc(node('p',{},node('strong',{},'Bold'),' ',node('em',{},'italic'),' ',node('u',{},'underlined'),' ',node('s',{},'removed'),' ',node('code',{},'const `tick`'))));
  const html=content.render(md);
  for(const fragment of ['<strong>Bold</strong>','<em>italic</em>','<u>underlined</u>','<s>removed</s>','<code>const `tick`</code>'])assert.ok(html.includes(fragment),html);
});

test('nested ordered and unordered lists retain hierarchy and start number',()=>{
  const md=serialize(doc(node('ol',{start:'3'},node('li',{},'Parent',node('ul',{},node('li',{},'Child',node('ul',{},node('li',{},'Deep child'))))),node('li',{},'Next'))));
  const html=content.render(md);
  assert.match(html,/<ol start="3"/);assert.match(html,/<li>Parent\s*<ul><li>Child\s*<ul><li>Deep child/);assert.match(html,/<li>Next<\/li>/);
});

test('list items preserve loose paragraphs and content after nested lists',()=>{
  const md=serialize(doc(node('ul',{},node('li',{},node('p',{},'Before.'),node('ul',{},node('li',{},'Nested.')),node('p',{},'After.')),node('li',{},'Next.'))));
  const html=content.render(md);assert.match(html,/<li><p>Before\.<\/p><ul><li>Nested\.<\/li><\/ul><p>After\.<\/p><\/li>/);
});

test('code blocks preserve literal backticks, indentation, language and HTML text',()=>{
  const literal='const html = "<script>";\n  ```\n\n\n    indented';
  const md=serialize(doc(node('pre',{},node('code',{class:'language-javascript'},literal))));
  assert.match(md,/^````javascript\n/);const html=content.render(md);
  assert.match(html,/class="language-javascript"/);assert.ok(html.includes('  ```\n\n\n    indented'));assert.ok(html.includes('&lt;script&gt;'));
});

test('inline images serialize stable asset references rather than resolved URLs',()=>{
  const assets=[{id:'image-1',src:'/confluence/download/attachments/1/graph.png',alt:'A chart'}];
  const md=serialize(doc(node('p',{},node('img',{'data-asset-id':'image-1',src:assets[0].src,alt:'A chart'}))));
  assert.equal(md,'![A chart](attachment:image-1)');assert.match(content.render(md,{assets}),/data-asset-id="image-1"/);
});

test('attachment links keep their stable reference and embeds keep resource cards',()=>{
  const attachments=[{id:'file-1',name:'guide.pdf',url:'/confluence/guide.pdf',mimeType:'application/pdf',size:123}];
  const md=serialize(doc(node('p',{},node('a',{'data-attachment-id':'file-1',href:attachments[0].url},'Guide')),node('p',{},node('a',{'data-embed-url':'https://example.com/training',href:'https://example.com/training'},'Open resource'))));
  assert.match(md,/\[Guide\]\(attachment:file-1\)/);assert.match(md,/@\[embed\]\(https:\/\/example.com\/training\)/);const html=content.render(md,{attachments});assert.match(html,/data-attachment-id="file-1"/);assert.match(html,/data-embed-url="https:\/\/example.com\/training"/);
});

test('tables preserve column boundaries, formatting and literal pipes',()=>{
  const md=serialize(doc(node('table',{},node('thead',{},node('tr',{},node('th',{},'Owner'),node('th',{},'A | B'))),node('tbody',{},node('tr',{},node('td',{},'Alex'),node('td',{},node('strong',{},'Reviewed')))))));
  const html=content.render(md);assert.match(html,/<table/);assert.match(html,/<th>A \| B<\/th>/);assert.match(html,/<td><strong>Reviewed<\/strong><\/td>/);
});

test('inline code pipes inside tables stay within the same cell',()=>{
  const md=serialize(doc(node('table',{},node('tr',{},node('th',{},'Code'),node('th',{},'Owner')),node('tr',{},node('td',{},node('code',{},'a|b')),node('td',{},'Alex')))));
  const html=content.render(md);assert.match(html,/<td><code>a\|b<\/code><\/td><td>Alex<\/td>/);
});

test('table column alignment survives visual serialization',()=>{
  const heading=node('th',{},'Amount');heading.style.textAlign='right';
  const md=serialize(doc(node('table',{},node('tr',{},heading),node('tr',{},node('td',{},'42')))));
  assert.match(md,/---:/);assert.match(content.render(md),/text-align:right/);
});

test('rich clipboard scripts, frames and unsafe URLs do not become active content',()=>{
  const md=serialize(doc(node('script',{},'bad()'),node('iframe',{src:'https://example.com'},'Hidden frame'),node('p',{},node('a',{href:'javascript:bad()'},'Unsafe link'),' ',node('img',{src:'javascript:bad()',alt:'Unsafe image'}),' ',node('strong',{},'<svg onload=bad()>'))));
  const html=content.render(md);assert.doesNotMatch(html,/bad\(\)<\/script>|<iframe|<svg|href="javascript:|<img/);assert.match(html,/Unsafe link/);assert.match(html,/&lt;svg/);
});

test('paragraphs, quotes, headings and dividers keep their block structure',()=>{
  const md=serialize(doc(node('h2',{},'Overview'),node('p',{},'Read first.'),node('blockquote',{},node('p',{},'Keep the evidence.'),node('p',{},'Second paragraph.')),node('hr',{}),node('h4',{},'Detail')));
  const html=content.render(md);assert.match(html,/<h2 id="overview">Overview/);assert.match(html,/<blockquote><p>Keep the evidence\.<\/p><p>Second paragraph\.<\/p><\/blockquote>/);assert.match(html,/<hr>/);assert.match(html,/<h4/);
});

test('a self-contained pasted Markdown raster image survives visual serialization',()=>{
  const src='data:image/png;base64,iVBORw0KGgo=';const md=serialize(doc(node('p',{},node('img',{src,alt:'Pasted'}))));assert.ok(md.includes(src));assert.match(content.render(md),/<img/);
});

test('editor exposes complete controls, metadata and attachments without native dialogs',()=>{
  const editor=sandbox.window.WCSEditor.create({actor:{id:'alex',name:'Alex',initials:'AL'},people:[{id:'alex',name:'Alex',role:'Author'},{id:'jordan',name:'Jordan',role:'Manager'}],types:['Blog'],areas:[{id:'area',title:'Area'}],icon:()=>''});const html=editor.html();
  for(const command of ['bold','italic','underline','strikeThrough','link','quote','code','image','insertUnorderedList','insertOrderedList','codeblock','table','divider','clear','embed','fullscreen'])assert.ok(html.includes('data-format="'+command+'"'));
  for(const field of ['editor-tags','editor-processes','editor-regions','editor-attachment-file','editor-cover-file'])assert.ok(html.includes('id="'+field+'"'));
  assert.ok(html.includes('data-editor-action="paste-markdown"'));assert.ok(html.includes('data-editor-action="copy-markdown"'));
  assert.doesNotMatch(html,/\stitle=/);assert.doesNotMatch(fs.readFileSync(__dirname+'/editor.js','utf8'),/\b(?:alert|confirm|prompt|reportValidity)\s*\(/);
});

// Optional real-DOM checks. The production bundle stays dependency-free; use
// NODE_PATH=/tmp/wcspedia-ui-tests/node_modules to run these with the shared
// temporary jsdom harness used by tests/ui-dom.cjs.
let JSDOM;try{({JSDOM}=require('jsdom'));}catch(_){}
function editorFixture(){
  const css=fs.readFileSync(__dirname+'/styles.css','utf8')+fs.readFileSync(__dirname+'/editor-upgrade.css','utf8');
  const dom=new JSDOM('<!doctype html><style>'+css+'</style><main id="wcspedia"><div id="editor-host"></div></main>',{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;w.WCSEditorContent=content;w.HTMLElement.prototype.scrollIntoView=function(){};
  Object.defineProperty(w,'innerWidth',{configurable:true,value:1440});Object.defineProperty(w,'innerHeight',{configurable:true,value:900});
  Object.defineProperty(w,'scrollX',{configurable:true,value:0});Object.defineProperty(w,'scrollY',{configurable:true,value:320});
  let scrollRestore;w.scrollTo=value=>{scrollRestore=value;};
  w.eval(fs.readFileSync(__dirname+'/ui.js','utf8'));w.eval(fs.readFileSync(__dirname+'/editor.js','utf8'));
  const editor=w.WCSEditor.create({actor:{id:'alex',name:'Alex',initials:'AL'},people:[{id:'alex',name:'Alex',role:'Author'},{id:'jordan',name:'Jordan',role:'Manager'}],types:['Blog'],areas:[{id:'area',title:'Area'}],version:{bodyMarkdown:'## Working guidance\n\nKeep the evidence.'},icon:()=>'',cancel(){},preview:()=>'<p>Preview</p>'});
  const host=d.getElementById('editor-host');host.innerHTML=editor.html();editor.bind(host);
  const find=selector=>host.querySelector(selector),form=find('#editor-form'),rich=find('#editor-rich'),toggle=find('[data-format="fullscreen"]');
  rich.tabIndex=0;find('.rich-editor').getBoundingClientRect=()=>({top:260,left:28,width:1384,height:600});
  const key=(el,key)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}));
  const close=()=>{editor.destroy();w.WCSUI.destroy(d.getElementById('wcspedia'));dom.window.close();};
  return {dom,w,d,editor,host,find,form,rich,toggle,key,close,scrollRestore:()=>scrollRestore};
}

test('expanded editor removes both reading-width limits and sizes the whole writing surface',{skip:!JSDOM},()=>{
  const f=editorFixture();try{
    f.toggle.click();assert.ok(f.form.classList.contains('editor-focus-mode'));
    assert.equal(f.form.style.getPropertyValue('--wcs-focus-width'),'1440px');assert.equal(f.form.style.getPropertyValue('--wcs-focus-height'),'900px');
    assert.equal(f.form.style.getPropertyValue('--wcs-focus-panel-height'),'616px');
    assert.equal(f.w.getComputedStyle(f.find('.editor-main')).maxWidth,'none');assert.equal(f.w.getComputedStyle(f.rich).maxWidth,'none');
    assert.equal(f.w.getComputedStyle(f.rich).flexGrow,'1');assert.equal(f.w.getComputedStyle(f.rich).maxHeight,'none');
    assert.equal(f.d.body.style.overflow,'hidden');assert.equal(f.find('[data-editor-action="focus-exit"]').hidden,false);
  }finally{f.close();}
});

test('collapsing preserves text selection and restores host styles, scroll and focus',{skip:!JSDOM},()=>{
  const f=editorFixture();try{
    f.d.body.style.setProperty('overflow','scroll','important');f.d.documentElement.style.overflow='auto';f.host.scrollTop=75;
    f.rich.focus();const text=f.rich.querySelector('p').firstChild,range=f.d.createRange();range.setStart(text,5);range.setEnd(text,8);f.w.getSelection().removeAllRanges();f.w.getSelection().addRange(range);
    const html=f.rich.innerHTML;f.toggle.click();assert.equal(f.w.getSelection().toString(),'the');
    f.key(f.rich,'Escape');assert.equal(f.form.classList.contains('editor-focus-mode'),false);assert.equal(f.rich.innerHTML,html);assert.equal(f.w.getSelection().toString(),'the');
    assert.equal(f.d.activeElement,f.rich);assert.equal(f.d.body.style.overflow,'scroll');assert.equal(f.d.body.style.getPropertyPriority('overflow'),'important');assert.equal(f.d.documentElement.style.overflow,'auto');
    assert.equal(f.host.scrollTop,75);assert.deepEqual(JSON.parse(JSON.stringify(f.scrollRestore())),{left:0,top:320,behavior:'instant'});assert.equal(f.form.style.getPropertyValue('--wcs-focus-width'),'');
  }finally{f.close();}
});

test('expanded Markdown source fills the frame and has an always-accessible exit control',{skip:!JSDOM},()=>{
  const f=editorFixture();try{
    f.toggle.click();f.find('[data-editor-action="source"]').click();const field=f.find('#editor-source');
    assert.equal(field.hidden,false);assert.equal(f.find('.editor-toolbar').hidden,true);assert.equal(f.w.getComputedStyle(field).flexGrow,'1');assert.equal(f.w.getComputedStyle(field).maxWidth,'none');
    field.setSelectionRange(3,10);const value=field.value;f.find('[data-editor-action="focus-exit"]').click();
    assert.equal(f.form.classList.contains('editor-focus-mode'),false);assert.equal(field.value,value);assert.equal(field.selectionStart,3);assert.equal(field.selectionEnd,10);assert.equal(f.d.activeElement,field);
  }finally{f.close();}
});

test('Escape dismisses a Citi dialog without collapsing the expanded editor',{skip:!JSDOM},()=>{
  const f=editorFixture();try{
    f.toggle.click();f.find('[data-format="link"]').click();const dialog=f.d.querySelector('.wcs-ui-dialog');assert.ok(dialog);
    f.key(dialog,'Escape');assert.equal(f.d.querySelector('.wcs-ui-dialog'),null);assert.ok(f.form.classList.contains('editor-focus-mode'));
    f.key(f.rich,'Escape');assert.equal(f.form.classList.contains('editor-focus-mode'),false);
  }finally{f.close();}
});

test('visual viewport changes resize expanded editing for zoom and mobile keyboard',{skip:!JSDOM},async()=>{
  const f=editorFixture();try{
    const viewport=new f.w.EventTarget();Object.assign(viewport,{width:390,height:844,offsetLeft:0,offsetTop:0});Object.defineProperty(f.w,'visualViewport',{configurable:true,value:viewport});
    f.toggle.click();assert.equal(f.form.style.getPropertyValue('--wcs-focus-width'),'390px');
    Object.assign(viewport,{height:420,offsetTop:18});viewport.dispatchEvent(new f.w.Event('resize'));await new Promise(resolve=>f.w.requestAnimationFrame(resolve));
    assert.equal(f.form.style.getPropertyValue('--wcs-focus-height'),'420px');assert.equal(f.form.style.getPropertyValue('--wcs-focus-top'),'18px');assert.equal(f.form.style.getPropertyValue('--wcs-focus-panel-height'),'240px');
    f.toggle.click();viewport.height=600;viewport.dispatchEvent(new f.w.Event('resize'));await new Promise(resolve=>f.w.requestAnimationFrame(resolve));assert.equal(f.form.style.getPropertyValue('--wcs-focus-height'),'');
  }finally{f.close();}
});

test('editor destruction cleans up expanded scrolling and pending layout work',{skip:!JSDOM},async()=>{
  const f=editorFixture();try{
    f.d.body.style.overflow='auto';f.toggle.click();f.editor.destroy();assert.equal(f.d.body.style.overflow,'auto');assert.equal(f.form.classList.contains('editor-focus-mode'),false);
    f.w.dispatchEvent(new f.w.Event('resize'));await new Promise(resolve=>f.w.requestAnimationFrame(resolve));assert.equal(f.form.style.getPropertyValue('--wcs-focus-width'),'');assert.equal(f.scrollRestore(),undefined);
  }finally{f.close();}
});
