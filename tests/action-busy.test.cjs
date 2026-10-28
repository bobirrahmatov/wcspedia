'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(){const dom=new JSDOM('<div id="wcspedia"></div>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=123',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.eval(read('ui.js'));return {w,d:w.document,ui:w.WCSUI,close:()=>w.close()};}
test('an async button prevents duplicate calls, keeps its label and restores state on rejection',async()=>{
 const f=fixture();try{
  const b=f.d.createElement('button');b.textContent='Save';f.d.body.append(b);const pending=deferred();let calls=0;
  const task=f.ui.runButton(b,()=>{calls++;return pending.promise;});
  assert.equal(b.getAttribute('aria-busy'),'true');assert.equal(b.disabled,true);assert.equal(b.textContent,'Save');assert.equal(b.querySelectorAll('.wcs-button-spinner').length,1);
  await f.ui.runButton(b,()=>calls++);assert.equal(calls,1);
  pending.reject(Error('offline'));await assert.rejects(task,/offline/);assert.equal(b.disabled,false);assert.equal(b.hasAttribute('aria-busy'),false);assert.equal(b.querySelector('.wcs-button-spinner'),null);
  b.disabled=true;await f.ui.runButton(b,()=>calls++);assert.equal(calls,1,'Permission-disabled controls stay disabled');
 }finally{f.close();}
});
test('dialog marks the actual submitter and preserves pre-existing disabled controls',()=>{
 const f=fixture();try{
  const handle=f.ui.dialog({body:'<form><button type="submit" value="dismiss">Dismiss</button><button type="submit" value="approve">Approve</button><button type="button" disabled>Unavailable</button></form>'});
  const form=handle.body.querySelector('form'),[dismiss,approve,unavailable]=form.querySelectorAll('button');
  form.addEventListener('submit',e=>{e.preventDefault();handle.setBusy(true);});
  form.dispatchEvent(new f.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:approve}));
  assert.equal(approve.getAttribute('aria-busy'),'true');assert.equal(dismiss.hasAttribute('aria-busy'),false);assert.equal(dismiss.disabled,true);assert.equal(handle.close(),false);
  handle.setBusy(false);assert.equal(approve.disabled,false);assert.equal(dismiss.disabled,false);assert.equal(unavailable.disabled,true);assert.equal(approve.hasAttribute('aria-busy'),false);assert.equal(handle.close(),true);
 }finally{f.close();}
});
test('Add entitlement shows pending feedback, rejects duplicate submits and recovers after a failed save',async()=>{
 const f=fixture();try{
  for(const file of ['entitlements.js','data-table.js','pagination.js','entitlements-page.js'])f.w.eval(read(file));
  const root=f.d.querySelector('#wcspedia'),pending=deferred();let calls=0;
  const options={policy:{schemaVersion:1,revision:1,records:[],audit:[]},identity:{soeid:'BR47149'},documents:[],can:()=>true,notify(){},refresh(){},go(){},save(){calls++;return pending.promise;}};
  root.innerHTML=f.w.WCSEntitlementsPage.markup(options);f.w.WCSEntitlementsPage.mount(root,options);
  root.querySelector('[data-entitlement="add"]').click();const form=root.querySelector('[data-entitlement-form]');
  form.elements.soeid.value='AB12345';form.elements.displayName.value='Colleague';form.elements.comment.value='Needs access';form.querySelector('[name=permission]').checked=true;
  const button=form.querySelector('[type=submit]'),send=()=>form.dispatchEvent(new f.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));
  send();assert.equal(calls,1);assert.ok(button.querySelector('.wcs-button-spinner'));assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(button.disabled,true);send();assert.equal(calls,1);
  pending.reject(Error('Connection unavailable'));await tick();assert.equal(button.disabled,false);assert.equal(button.hasAttribute('aria-busy'),false);assert.match(form.querySelector('.form-error').textContent,/Connection unavailable/);
 }finally{f.close();}
});
test('closing a page cancels a delayed overlay and a fast load never traps focus',async()=>{
 const f=fixture();try{
  f.w.eval(read('loading-overlay.js'));const target=f.d.querySelector('#wcspedia');const loader=f.w.WCSLoadingOverlay.create({target,delayMs:15});
  loader.show();loader.hide();await new Promise(r=>setTimeout(r,25));assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);assert.equal(target.hasAttribute('inert'),false);
  loader.show();f.w.dispatchEvent(new f.w.Event('pagehide'));await new Promise(r=>setTimeout(r,25));assert.equal(f.d.querySelector('.wcs-loading-overlay'),null);
 }finally{f.close();}
});
test('a recovery lock blocks resubmission without pretending a finished request is still running',()=>{
 const f=fixture();try{
  const handle=f.ui.dialog({body:'<form><button type="submit">Approve</button></form>'});
  handle.setBusy(true);handle.setBusy(false);handle.setBusy(true,{pending:false});
  assert.equal(handle.busy,true);assert.equal(handle.body.querySelector('button').disabled,true);
  assert.equal(handle.element.getAttribute('aria-busy'),'false');
  assert.equal(handle.body.querySelector('[aria-busy="true"]'),null);
  handle.setBusy(false);handle.close();
 }finally{f.close();}
});
