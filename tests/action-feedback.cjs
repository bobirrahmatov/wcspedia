/* Focused action outcome checks; no global toast rendering dependency. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(files){
  const dom=new JSDOM('<div id="wcspedia"><div class="shell"></div></div>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=100',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const file of files)w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  return {w,d,host:d.querySelector('#wcspedia'),close:()=>w.close()};
}
function grantsFixture(save){
  const f=fixture(['ui.js','pagination.js','data-table.js','entitlements.js','entitlements-page.js']),notices=[];
  const options={can:()=>true,policy:{revision:1,records:[],audit:[]},documents:[],identity:{soeid:'BR47149'},save,refresh:()=>{},notify:(message,options)=>notices.push({message,type:options.type}),download:()=>{},go:()=>{}};
  f.host.querySelector('.shell').innerHTML=f.w.WCSEntitlementsPage.markup(options);
  const handle=f.w.WCSEntitlementsPage.mount(f.host,options);
  function submit(){f.host.querySelector('[data-entitlement=add]').click();const form=f.d.querySelector('[data-entitlement-form]');form.elements.soeid.value='AB12345';form.elements.displayName.value='Another reader';form.elements.comment.value='Create knowledge articles';form.querySelector('[name=permission]').checked=true;form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));return form;}
  return {...f,notices,handle,submit,options};
}
test('entitlements distinguish a missing policy from a loaded policy without a matching grant',()=>{
  const f=fixture(['entitlements.js','entitlements-page.js']);
  try{
    const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../confluence-data-starters/entitlements.json'),'utf8'));
    const options={can:()=>false,identity:{soeid:'ZZ99999'},policy:null,access:{configured:false,source:'attachment',filename:'entitlements.json',pageId:'900'}};
    f.host.innerHTML=f.w.WCSEntitlementsPage.markup(options);
    assert.equal(f.host.querySelector('h1').textContent,'Entitlements unavailable');
    assert.match(f.host.textContent,/policy is not loaded/);
    assert.match(f.host.textContent,/Upload entitlements\.json to the configured attachments page/);
    assert.doesNotMatch(f.host.textContent,/In JSON mode|entitlement table/);
    options.policy=policy;options.access.configured=true;
    f.host.innerHTML=f.w.WCSEntitlementsPage.markup(options);
    assert.equal(f.host.querySelector('h1').textContent,'Not permitted');
    assert.match(f.host.textContent,/No active View entitlements grant.*ZZ99999.*entitlements.json.*900/);
    assert.doesNotMatch(f.host.textContent,/BR47149/,'Denied users do not see policy records');
    options.identity=null;options.policy=null;
    f.host.innerHTML=f.w.WCSEntitlementsPage.markup(options);
    assert.match(f.host.textContent,/could not identify your signed-in SOEID/);
    assert.doesNotMatch(f.host.textContent,/upload entitlements.json/);
  }finally{f.close();}
});
test('entitlement guidance always names the JSON attachment and service-disconnected access remains read-only',()=>{
  const f=fixture(['ui.js','pagination.js','data-table.js','entitlements.js','entitlements-page.js']);
  let handle;
  try{
    const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../confluence-data-starters/entitlements.json'),'utf8'));
    const options={can:permission=>permission==='entitlements.view',identity:{soeid:'BR47149'},policy,documents:[],access:{configured:true,filename:'entitlements.json',pageId:'900',serviceConnected:false},notify:()=>{},download:()=>{},go:()=>{}};
    f.host.querySelector('.shell').innerHTML=f.w.WCSEntitlementsPage.markup(options);
    handle=f.w.WCSEntitlementsPage.mount(f.host,options);
    assert.match(f.host.textContent,/screen is read-only until the entitlement service is connected/);
    assert.match(f.host.textContent,/maintain entitlements\.json on its Confluence page/);
    assert.doesNotMatch(f.host.textContent,/entitlement table/);
    assert.equal(f.host.querySelector('[data-entitlement=add],[data-entitlement=edit],[data-entitlement=revoke]'),null);
    assert.ok(f.host.querySelector('[data-entitlement=export]'));
    options.can=()=>false;options.policy=null;options.access.filename='custom-access.json';
    f.host.innerHTML=f.w.WCSEntitlementsPage.markup(options);
    assert.match(f.host.textContent,/Upload custom-access\.json/);
    assert.doesNotMatch(f.host.textContent,/entitlement table/);
  }finally{handle?.destroy();f.close();}
});
test('an authorized administrator sees disabled actions and a reason when saving is unconfigured',()=>{
  const f=fixture(['ui.js','pagination.js','data-table.js','entitlements.js','entitlements-page.js']);let handle,calls=0;
  try{
    const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../confluence-data-starters/entitlements.json'),'utf8'));
    const options={can:()=>true,identity:{soeid:'BR47149'},policy,documents:[],access:{configured:true,filename:'entitlements.json',serviceConnected:false},save:()=>calls++,notify:()=>{},go:()=>{},download:()=>{}};
    f.host.querySelector('.shell').innerHTML=f.w.WCSEntitlementsPage.markup(options);handle=f.w.WCSEntitlementsPage.mount(f.host,options);
    const buttons=[...f.host.querySelectorAll('[data-entitlement=add],[data-entitlement=edit],[data-entitlement=revoke]')];
    assert.equal(buttons.length,3);assert.ok(f.d.getElementById('entitlement-save-status'));
    for(const button of buttons){assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-describedby'),'entitlement-save-status');button.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));}
    assert.equal(f.d.querySelector('[data-entitlement-form]'),null);assert.equal(calls,0);
  }finally{handle?.destroy();f.close();}
});
test('an invalid Add can be corrected without losing input or sending a save',async()=>{
  const saved=[];const f=grantsFixture(async command=>saved.push(command));
  try{
    f.host.querySelector('[data-entitlement=add]').click();const form=f.d.querySelector('[data-entitlement-form]');
    form.elements.soeid.value=' ab12345 ';form.elements.displayName.value=' Another reader ';form.elements.comment.value='Access for contributor';
    const submit=async()=>{form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
    await submit();assert.match(form.querySelector('.form-error').textContent,/Select at least one permission/);assert.equal(saved.length,0);
    assert.equal(form.elements.soeid.value,'AB12345');assert.equal(form.elements.displayName.value,' Another reader ');
    form.querySelector('[name=permission]').checked=true;
    f.options.policy.records.push({id:'existing-person',soeid:'AB12345',scope:'*'});
    await submit();assert.match(form.querySelector('.form-error').textContent,/edit the existing record/);assert.equal(saved.length,0);assert.equal(form.querySelector('[type=submit]').disabled,false);
    form.elements.soeid.value='AB12346';await submit();assert.equal(saved.length,1);assert.equal(saved[0].record.soeid,'AB12346');assert.equal(saved[0].record.displayName,'Another reader');
  }finally{f.handle.destroy();f.close();}
});
test('editing a record for an unloaded document keeps its exact scope visible',()=>{
  const f=grantsFixture(async()=>{});
  try{
    f.options.policy.records.push({id:'scoped-row',soeid:'AB12345',displayName:'Scoped colleague',scope:'doc-outside-directory',permissions:['content.edit'],active:true});
    const button=f.d.createElement('button');button.dataset.entitlement='edit';button.dataset.id='scoped-row';f.host.append(button);button.click();
    const select=f.d.querySelector('[name=scope]');assert.equal(select.value,'doc-outside-directory');assert.equal(select.disabled,true);assert.match(select.selectedOptions[0].textContent,/doc-outside-directory/);
  }finally{f.handle.destroy();f.close();}
});
test('an uncertain entitlement save blocks repeat submission until reload',async()=>{
  let calls=0;const f=grantsFixture(async()=>{calls++;throw Object.assign(Error('The attachment outcome needs reconciliation.'),{code:'ENTITLEMENTS_PENDING'});});
  try{
    const form=f.submit();await tick();assert.equal(calls,1);assert.equal(form.querySelector('[type=submit]').disabled,true);
    form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(calls,1);assert.equal(f.notices.filter(n=>n.type==='success').length,0);
  }finally{f.handle.destroy();f.close();}
});
test('entitlement save emits one success after persistence and export announces its download',async()=>{
  let calls=0;const f=grantsFixture(async()=>calls++);try{
    f.submit();await tick();assert.equal(calls,1);assert.equal(f.d.querySelector('[role=dialog]'),null);assert.equal(f.notices.length,1);assert.equal(f.notices[0].type,'success');
    f.host.querySelector('[data-entitlement=export]').click();assert.equal(f.notices.length,2);assert.equal(f.notices[1].type,'success');assert.match(f.notices[1].message,/audit download/);
  }finally{f.handle.destroy();f.close();}
});
test('entitlement rejection emits one error and preserves the input for retry',async()=>{
  const f=grantsFixture(async()=>{throw Error('Access service unavailable');});try{
    const form=f.submit();await tick();assert.equal(f.notices.length,1);assert.equal(f.notices[0].type,'error');assert.equal(form.elements.displayName.value,'Another reader');assert.match(form.querySelector('.form-error').textContent,/Access service unavailable/);assert.equal(form.querySelector('.form-error').hidden,false);
  }finally{f.handle.destroy();f.close();}
});
test('entitlement teardown suppresses a late saved result',async()=>{
  let finish;const f=grantsFixture(()=>new Promise(resolve=>finish=resolve));try{
    f.submit();f.handle.destroy();finish();await tick();assert.equal(f.notices.length,0);assert.equal(f.d.querySelector('[role=dialog]'),null);
  }finally{f.close();}
});
test('bookmark save and remove emit success; failed persistence never emits a false success',async()=>{
  const f=fixture(['library-workflows.js']),notices=[];let state={available:true,bookmarks:[],revision:1},reject=false;
  const doc={id:'doc-1'},service={load:async()=>state,resolve:()=>[],set:async(id,saved)=>{if(reject)throw Error('Personal save service unavailable');state={available:true,bookmarks:saved?[{documentId:id}]:[],revision:state.revision+1};return state;}};
  f.w.WCSContentHealth={};f.w.WCSContentHealthUI={};f.w.WCSDataTable={escape:String};f.w.WCSBookmarks={create:()=>service};f.w.WCSHealthService={create:()=>({load:async()=>({})})};
  f.host.innerHTML='<button data-library-action="bookmark" data-library-document="doc-1">Save</button>';
  const options={container:f.host,config:{mode:'embedded'},storage:{},context:()=>({documents:[doc],identity:{soeid:'BR47149'},people:[],actor:{id:'person'},canRead:()=>true}),publishedVersion:()=>({version:1}),refresh:()=>{f.host.querySelector('button').disabled=false;},notify:(message,options)=>notices.push({message,type:options.type})};
  const handle=f.w.WCSLibraryWorkflows.create(options);
  try{await handle.load();f.host.querySelector('button').click();await tick();assert.equal(notices.length,1);assert.equal(notices[0].type,'success');assert.match(notices[0].message,/Saved to/);f.host.querySelector('button').click();await tick();assert.equal(notices.length,2);assert.match(notices[1].message,/Removed from/);reject=true;f.host.querySelector('button').click();await tick();assert.equal(notices.length,3);assert.equal(notices[2].type,'error');assert.match(notices[2].message,/unavailable/);assert.equal(state.bookmarks.length,0);}finally{handle.destroy();f.close();}
});
