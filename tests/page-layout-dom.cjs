/* NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/page-layout-dom.cjs */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,read}=require('./app-fixture.cjs');
const css=['styles.css','ui.css','workspace.css','entitlements-page.css','data-table.css','library-workflows.css'].map(read).join('\n');
function addStyles(w,d){
  const host=d.createElement('style');host.textContent='html,body{overflow:visible} .host-toolbar{height:76px;overflow:visible} #wcspedia{height:1400px;min-height:100vh;overflow:auto} #wcspedia .shell{max-height:500px;overflow:auto}';d.head.append(host);
  const style=d.createElement('style');style.textContent=css;d.head.append(style);
  const header=d.createElement('div');header.className='host-toolbar';header.textContent='Existing Confluence header';d.body.prepend(header);
}
for(const role of ['home','mine','review','saved','entitlements'])test(role+' uses uncapped document flow and aligns the introduction with its content',async t=>{
  const f=await fixture({role,actor:'jordan',sourceMode:true,configureWindow:addStyles});t.after(f.close);
  const frame=f.w.getComputedStyle(f.root),shell=f.w.getComputedStyle(f.find('.shell'));
  assert.equal(frame.overflow,'visible','Confluence owns the vertical page scrollbar');
  assert.equal(frame.height,'auto');assert.equal(frame.maxHeight,'none');
  assert.equal(frame.minHeight,'0');
  assert.equal(frame.maxWidth,'none','The macro has no fixed desktop width cap');
  assert.equal(frame.borderRadius,'var(--wcs-page-radius)');
  assert.equal(shell.height,'auto');assert.equal(shell.maxHeight,'none');
  assert.equal(shell.overflow,'visible','Long content extends the host page instead of an inner pane');
  assert.equal(shell.maxWidth,'none');
  const panel=f.find('.page-panel');assert.ok(panel,'Page uses the shared introduction');
  const body=f.all('.discovery-container').find(node=>!node.closest('.page-panel'));assert.ok(body,'Page has a main content container');
  const top=f.w.getComputedStyle(panel),bottom=f.w.getComputedStyle(body);
  assert.equal(top.width,bottom.width,'Top and bottom surfaces share the same horizontal edges');
  assert.equal(top.maxWidth,bottom.maxWidth);assert.equal(bottom.maxWidth,'none');
  assert.equal(bottom.maxHeight,'none');assert.equal(bottom.overflow,'visible','Main sections do not create their own vertical pane');
  assert.equal(f.w.getComputedStyle(f.d.body).overflow,'visible','WCSpedia must not lock its Confluence host');
  assert.equal(f.w.getComputedStyle(f.d.querySelector('.host-toolbar')).height,'76px','Existing header sizing is untouched');
  assert.equal(f.errors.length,0);
});
test('entitlements keep full rows in document flow and retain horizontal table access',async t=>{
  const f=await fixture({role:'entitlements',actor:'jordan',sourceMode:true,configureWindow:addStyles});t.after(f.close);
  const tables=f.all('.wcs-data-table-scroll');assert.ok(tables.length);
  for(const table of tables){const style=f.w.getComputedStyle(table);assert.equal(style.height,'auto');assert.equal(style.maxHeight,'none');assert.equal(style.overflowX,'auto');assert.equal(style.overflowY,'hidden');}
  const directory=f.w.getComputedStyle(f.find('.entitlement-directory'));assert.equal(directory.height,'auto');assert.equal(directory.maxHeight,'none');assert.equal(directory.overflow,'visible');
  assert.ok(f.find('[data-entitlement="add"]'));assert.ok(f.find('[data-entitlement="export"]'));
  f.find('[data-entitlement="add"]').click();
  const dialog=f.find('.wcs-ui-dialog');assert.ok(dialog);assert.equal(f.w.getComputedStyle(dialog).overflow,'auto','Small-screen dialogs remain usable independently of the page frame');
  assert.equal(f.w.getComputedStyle(f.find('.wcs-ui-backdrop')).position,'fixed');
  assert.match(f.w.getComputedStyle(f.find('.wcs-ui-backdrop')).zIndex,/wcs-overlay-z-index/);
  assert.equal(f.errors.length,0);
});

test('search clear control stays neutral and keyboard accessible against host button styling',async t=>{
  const f=await fixture({sourceMode:true,configureWindow(w,d){const host=d.createElement('style');host.textContent='button{background:blue;color:white;border:3px solid blue;box-shadow:0 0 4px blue} input[type=search]{background:blue;color:white}';d.head.append(host);addStyles(w,d);}});t.after(f.close);
  const clear=f.find('[data-clear-search]');assert.ok(clear);assert.equal(clear.type,'button');assert.equal(clear.getAttribute('aria-label'),'Clear search');assert.equal(clear.hidden,true);
  const input=f.input('[data-suggest]','credit');assert.equal(clear.hidden,false);
  const computed=f.w.getComputedStyle(clear);assert.equal(computed.backgroundColor,'rgba(0, 0, 0, 0)');assert.equal(computed.color,'rgb(91, 108, 126)');assert.equal(computed.boxShadow,'none');
  clear.click();assert.equal(input.value,'');assert.equal(clear.hidden,true);assert.equal(f.d.activeElement,input);assert.equal(f.find('#search-suggestions').hidden,true);assert.equal(f.w.location.hash,'#/');assert.equal(f.errors.length,0);
});
