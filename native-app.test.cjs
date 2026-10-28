/* Integration: NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test native-app.test.cjs */
'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
let JSDOM; try { ({JSDOM}=require('jsdom')); } catch (_) {}
const config={contextPath:'/confluence',publishedRootPageId:'100',workingRootPageId:'200',spaceKey:'WCS',nativeWorkflowEndpoint:'/confluence/rest/wcspedia/native-workflow'};
const url='https://intranet.example/confluence/pages/viewpage.action?pageId=100';
function page(id='301',options={}){
  return {id,type:'page',title:options.title||'Credit approval checklist',space:{key:'WCS'},version:{number:3,when:'2026-10-15T10:00:00Z',by:{displayName:'Alex',username:'am12345'}},ancestors:[{id:options.working?'200':'100'}],operations:options.edit?[{operation:'update',targetType:'page'}]:[],metadata:{labels:{results:[{name:'wcspedia'},{name:'wcs-type-job-aid'},{name:'wcs-region-emea'}]}},body:{view:{value:'<p>Review the evidence.</p>'}},_links:{base:'https://intranet.example/confluence',webui:'/pages/viewpage.action?pageId='+id}};
}
function fixture(options={}){
  const dom=new JSDOM('<!doctype html><html><body><div id="'+(options.rootId||'wcspedia')+'"></div><div id="tools" data-page-id="301"></div><div id="add-document"></div></body></html>',{url,pretendToBeVisual:true});
  const win=dom.window, calls=[],navigation=[],errors=[],clipboard=[],handles=[],pending=[];
  let createFailure=options.createFailure||0,decisionFailure=options.decisionFailure||0;
  const state={pages:{'301':page('301',options),'302':page('302',{working:true,edit:true,title:'New native page'})},caps:options.caps||{},workflowStatus:options.workflowStatus||'Draft',searchCount:0};
  state.pages['200']={...page('200',{working:true,edit:true,title:'Working library'}),ancestors:[]};
  const response=(value,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(value)});
  const fetch=async(address,init)=>{
    const u=new URL(address),body=init.body?JSON.parse(init.body):null;calls.push({url:u,init,body});
    if(u.pathname.endsWith('/rest/api/user/current'))return response(options.anonymous?{type:'anonymous'}:{type:'known',username:'am12345',displayName:'Alex'});
    if(u.pathname.endsWith('/rest/api/content/search')){
      state.searchCount++; if(options.searchError)return response({},options.searchError);
      const start=Number(u.searchParams.get('start')),results=options.searchResults||[state.pages['301']];
      if(options.deferSearch){let resolve;const promise=new Promise(r=>{resolve=r});pending.push({resolve,start});await promise;}
      return response({results,start,limit:12,totalSize:options.totalSize??25});
    }
    if(u.pathname.endsWith('/property'))return response({results:[{key:'wcs.metadata',value:{sourcePageVersion:3,owner:{name:'Alex Morgan',soeid:'AM12345'},team:'Credit operations',summary:'Published guidance'}}],start:0});
    if(u.pathname.endsWith('/native-workflow')){
      if(init.method==='GET'){
        if(u.searchParams.get('view')==='document')return options.workflowFailure?response({},options.workflowFailure):response({pageId:u.searchParams.get('pageId'),status:state.workflowStatus,expectedVersion:3,submissionToken:'snapshot-v3',capabilities:state.caps});
        return response({results:[{id:'302'}],start:Number(u.searchParams.get('start')),totalSize:1});
      }
      if(body.action==='prepare-create'){if(createFailure){const failure=createFailure;createFailure=0;return response({},failure);}state.pages['302'].title=body.title;return response({workingPageId:'302'});}
      if(body.action==='prepare-edit')return response({workingPageId:'302'});
      if(decisionFailure){const failure=decisionFailure;decisionFailure=0;return response({},failure);}
      state.workflowStatus='In review';return response({committed:true,action:body.action,pageId:body.pageId,eventId:'synthetic-event-1'});
    }
    const match=u.pathname.match(/\/rest\/api\/content\/(\d+)$/);if(match)return response(state.pages[match[1]]);
    throw Error('Unexpected request '+u.pathname);
  };
  const sandbox={document:win.document,location:{get href(){return win.location.href;},get origin(){return win.location.origin;},get hash(){return win.location.hash;},set hash(v){win.location.hash=v;},assign:value=>navigation.push(value)},navigator:{clipboard:{writeText:async value=>clipboard.push(value)}},fetch,URL,URLSearchParams,DOMParser:win.DOMParser,FormData:win.FormData,Blob:win.Blob,Event:win.Event,CustomEvent:win.CustomEvent,MutationObserver:win.MutationObserver,AbortController:win.AbortController,HTMLElement:win.HTMLElement,Node:win.Node,getComputedStyle:win.getComputedStyle.bind(win),setTimeout,clearTimeout,queueMicrotask,console,innerWidth:1280,innerHeight:900,addEventListener:win.addEventListener.bind(win),removeEventListener:win.removeEventListener.bind(win),alert:message=>{errors.push(message);throw Error('Native alert is forbidden');}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);
  for(const file of ['ui.js','pagination.js','data-table.js','native-content.js','native-confluence.js','native-app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
  function mount(extra={}){const el=win.document.getElementById(options.rootId||'wcspedia'),handle=sandbox.WCSNativeApp.mount(el,{...config,...extra});handles.push(handle);return {el,handle};}
  function controls(extra={}){const el=win.document.getElementById('tools'),handle=sandbox.WCSNativeApp.mountDocumentControls(el,{...config,...extra});handles.push(handle);return {el,handle};}
  function widget(extra={}){const el=win.document.getElementById('add-document'),handle=sandbox.WCSNativeApp.mountCreateWidget(el,{...config,...extra});handles.push(handle);return {el,handle};}
  function close(){for(const handle of handles)handle.destroy();win.close();}
  return {dom,win,sandbox,state,calls,navigation,errors,clipboard,pending,mount,controls,widget,close};
}
const domTest=(name,fn)=>test(name,{skip:!JSDOM&&'Requires optional jsdom test dependency'},async()=>{const fixtures=[];try{await fn(options=>{const f=fixture(options);fixtures.push(f);return f;});}finally{for(const f of fixtures)f.close();}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate())return;await tick();}throw Error('Timed out waiting for UI state');}
function submit(f,form){form.dispatchEvent(new f.win.Event('submit',{bubbles:true,cancelable:true}));}

domTest('native library queries the configured root and renders safe cards without attachment JSON reads',async make=>{
  const malicious='<img src=x onerror=alert(1)> Review';const f=make({title:malicious,rootId:'native-library'}),{el,handle}=f.mount();await handle.ready;
  assert.equal(el.id,'native-library');assert.equal(el.querySelectorAll('.wcs-native-card').length,1);
  const title=el.querySelector('.wcs-native-card h2 a');assert.ok(title.textContent.includes(malicious));assert.equal(title.querySelector('img'),null);
  assert.equal(title.href,'https://intranet.example/confluence/pages/viewpage.action?pageId=301');
  const cql=f.calls[0].url.searchParams.get('cql');assert.match(cql,/ancestor = 100/);assert.match(cql,/space = "WCS"/);
  assert.ok(f.calls.every(call=>!call.url.pathname.includes('/attachment')&&!call.url.pathname.includes('/download')));
  assert.equal(el.querySelector('[data-native-action="approve"]'),null);
});

domTest('search, filters and pagination preserve URL state and navigate the full native result set',async make=>{
  const f=make({totalSize:1200}),{el,handle}=f.mount();await handle.ready;
  const form=el.querySelector('form');form.elements.q.value='credit approval';form.elements.type.value='training';form.elements.region.value='emea';form.elements.sort.value='title';submit(f,form);
  await waitFor(()=>f.state.searchCount===2&&el.querySelector('.wcs-native-card'));
  const search=f.calls.filter(call=>call.url.pathname.endsWith('/content/search')).at(-1);
  const cql=search.url.searchParams.get('cql');assert.match(cql,/wcs-type-training/);assert.match(cql,/wcs-region-emea/);assert.match(cql,/ORDER BY title ASC/);
  assert.equal(new URLSearchParams(f.win.location.hash.split('?')[1]).get('q'),'credit approval');
  const pager=el.querySelector('nav[aria-label="Pagination"]');assert.ok(pager);assert.ok(pager.querySelectorAll('a').length<15);assert.match(pager.textContent,/…/);
  const second=Array.from(pager.querySelectorAll('a')).find(a=>new URLSearchParams(a.hash.split('?')[1]).get('start')==='12');assert.ok(second);
  f.sandbox.location.hash=second.hash;await waitFor(()=>f.state.searchCount===3&&el.querySelector('.wcs-native-card'));
  const latest=f.calls.filter(call=>call.url.pathname.endsWith('/content/search')).at(-1);assert.equal(latest.url.searchParams.get('start'),'12');assert.match(latest.url.searchParams.get('cql'),/wcs-type-training/);
  f.win.history.back();await waitFor(()=>f.state.searchCount===4&&el.querySelector('.wcs-native-card'));
  assert.equal(f.calls.filter(call=>call.url.pathname.endsWith('/content/search')).at(-1).url.searchParams.get('start'),'0');
});

domTest('saved items use current-user Confluence favourites and workspaces show native pages in the shared table',async make=>{
  const saved=make(),library=saved.mount({pageRole:'saved'});await library.handle.ready;assert.match(saved.calls[0].url.searchParams.get('cql'),/favourite = currentUser\(\)/);assert.match(library.el.textContent,/Saved items/);
  const workspace=make(),view=workspace.mount({pageRole:'mine'});await view.handle.ready;
  assert.ok(view.el.querySelector('table'));assert.match(view.el.textContent,/New native page/);assert.ok(workspace.calls.some(call=>call.url.pathname.endsWith('/content/302')));
  assert.equal(view.el.querySelector('table a').href,'https://intranet.example/confluence/pages/viewpage.action?pageId=302');
});

domTest('outdated search responses cannot replace a later filter result',async make=>{
  const f=make({deferSearch:true}),{el,handle}=f.mount();await waitFor(()=>f.pending.length===1);
  f.sandbox.location.hash='/results?q=new';await waitFor(()=>f.pending.length===2);
  f.pending[1].resolve();await waitFor(()=>el.querySelector('.wcs-native-card'));assert.equal(el.querySelector('input[name=q]').value,'new');
  f.pending[0].resolve();await handle.ready;assert.equal(el.querySelector('input[name=q]').value,'new');
});

domTest('document controls show only available capabilities and native working-page editing opens the native editor',async make=>{
  const reader=make({workflowFailure:404}),readerView=reader.controls();await readerView.handle.ready;
  assert.equal(readerView.el.querySelector('[data-native-action="edit"]'),null);assert.equal(readerView.el.querySelector('[data-native-action="approve"]'),null);
  assert.ok(readerView.el.querySelector('[data-native-action="download"]'));assert.match(readerView.el.textContent,/workflow connection/);
  const author=make({working:true,edit:true,caps:{submit:true}}),view=author.controls();await view.handle.ready;
  assert.ok(view.el.querySelector('[data-native-action="edit"]'));assert.ok(view.el.querySelector('[data-native-action="submit"]'));assert.equal(view.el.querySelector('[data-native-action="approve"]'),null);
  view.el.querySelector('[data-native-action="edit"]').click();await waitFor(()=>author.navigation.length===1);
  assert.equal(author.navigation[0],'https://intranet.example/confluence/pages/editpage.action?pageId=301');
  assert.equal(author.calls.filter(call=>call.init.method==='POST').length,0);
});

domTest('editing a published page resolves its restricted working counterpart instead of editing the published page',async make=>{
  const f=make({caps:{edit:true}}),view=f.controls();await view.handle.ready;view.el.querySelector('[data-native-action="edit"]').click();await waitFor(()=>f.navigation.length===1);
  assert.equal(f.navigation[0],'https://intranet.example/confluence/pages/editpage.action?pageId=302');
  const command=f.calls.find(call=>call.body?.action==='prepare-edit');assert.equal(command.body.pageId,'301');assert.equal(command.body.expectedVersion,3);
});

domTest('workflow failures stay inline and restore dialog controls without native alerts',async make=>{
  const f=make({working:true,caps:{submit:true},decisionFailure:409}),view=f.controls();await view.handle.ready;
  view.el.querySelector('[data-native-action="submit"]').click();const dialog=f.win.document.querySelector('[role=dialog]'),form=dialog.querySelector('form');
  submit(f,form);assert.match(form.textContent,/Enter a reason/);assert.equal(f.calls.some(call=>call.body?.action==='submit'),false);
  form.elements.comment.value='Evidence verified for this saved revision.';submit(f,form);assert.equal(dialog.getAttribute('aria-busy'),'true');
  await waitFor(()=>form.querySelector('[data-native-error]').textContent.includes('changed'));
  assert.equal(dialog.getAttribute('aria-busy'),'false');assert.equal(form.querySelector('[type=submit]').disabled,false);assert.equal(form.querySelector('[data-cancel]').disabled,false);assert.deepEqual(f.errors,[]);
  const command=f.calls.find(call=>call.body?.action==='submit');assert.equal(command.body.expectedVersion,3);assert.equal(command.body.submissionToken,'snapshot-v3');assert.equal(command.body.comment,'Evidence verified for this saved revision.');
});

domTest('add document validates inline, recovers after denial and navigates to server-created native editor',async make=>{
  const f=make({createFailure:403}),view=f.widget();view.el.querySelector('button').click();
  const dialog=f.win.document.querySelector('[role=dialog]'),form=dialog.querySelector('form');submit(f,form);
  assert.match(form.textContent,/Enter a document title/);assert.equal(f.calls.length,0);
  form.elements.title.value='Credit approval checklist';form.elements.type.value='training';form.elements.summary.value='Recorded training';submit(f,form);
  await waitFor(()=>form.querySelector('[data-native-error]').textContent.includes('Not permitted'));
  assert.equal(dialog.getAttribute('aria-busy'),'false');assert.equal(form.querySelector('[type=submit]').disabled,false);assert.equal(form.querySelector('[data-cancel]').disabled,false);
  submit(f,form);await waitFor(()=>f.navigation.length===1);
  assert.equal(f.navigation[0],'https://intranet.example/confluence/pages/editpage.action?pageId=302');
  const commands=f.calls.filter(call=>call.body?.action==='prepare-create');assert.equal(commands.length,2);assert.deepEqual(commands[1].body,{action:'prepare-create',title:'Credit approval checklist',type:'training',summary:'Recorded training'});
  assert.equal(f.state.pages['302'].title,'Credit approval checklist');assert.equal(f.state.pages['301'].title,'Credit approval checklist','same title never overwrites an existing native page by title');
  assert.deepEqual(f.errors,[]);
});

domTest('delete requires explicit title confirmation; native downloads contain no JSON export',async make=>{
  const f=make({caps:{delete:true}}),view=f.controls();await view.handle.ready;
  view.el.querySelector('[data-native-action="download"]').click();const popup=f.win.document.querySelector('.wcs-ui-popover');assert.match(popup.textContent,/PDF document/);assert.match(popup.textContent,/Word document/);assert.match(popup.textContent,/Markdown file/);assert.doesNotMatch(popup.textContent,/JSON/i);f.sandbox.WCSUI.closePopover();
  view.el.querySelector('[data-native-action="delete"]').click();const form=f.win.document.querySelector('[role=dialog] form');form.elements.comment.value='Duplicate content.';form.elements.confirmation.value='wrong title';submit(f,form);
  assert.match(form.textContent,/Enter the exact document title/);assert.equal(f.calls.some(call=>call.body?.action==='delete'),false);
  form.elements.confirmation.value=f.state.pages['301'].title;submit(f,form);await waitFor(()=>view.el.textContent.includes('confirmed deletion'));
  assert.equal(f.calls.filter(call=>call.body?.action==='delete').length,1);
});


domTest('native-template mode hands off to the restricted native template chooser without a workflow write',async make=>{
  const f=make(),view=f.widget({authoringMode:'native-template',nativeWorkflowEndpoint:''});view.el.querySelector('button').click();
  await waitFor(()=>f.navigation.length===1);const target=new URL(f.navigation[0]);
  assert.equal(target.pathname,'/confluence/pages/createpage-choosetemplate.action');assert.equal(target.searchParams.get('fromPageId'),'200');assert.equal(target.searchParams.get('spaceKey'),'WCS');
  assert.ok(f.calls.some(call=>call.url.pathname.endsWith('/user/current')));assert.ok(f.calls.some(call=>call.url.pathname.endsWith('/content/200')));
  assert.equal(f.calls.some(call=>call.init.method==='POST'),false);assert.equal(f.win.document.querySelector('[role=dialog]'),null);
});

domTest('native template hand-off rejects anonymous sessions in the themed dialog and restores launcher',async make=>{
  const f=make({anonymous:true}),view=f.widget({authoringMode:'native-template',nativeWorkflowEndpoint:''}),button=view.el.querySelector('button');button.click();
  await waitFor(()=>f.win.document.querySelector('[role=dialog]'));
  assert.match(f.win.document.querySelector('[role=dialog]').textContent,/Sign in to Confluence/);assert.equal(button.disabled,false);assert.equal(f.navigation.length,0);assert.equal(f.calls.some(call=>call.init.method==='POST'),false);
});
