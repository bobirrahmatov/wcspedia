/* Build the upload kit first with node build-confluence-upload.cjs, then run:
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/add-document-widget.cjs
 * Exercises both maintained sources and the actual generated header pair. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'..','add-document-widget.js'),'utf8');
const startup=fs.readFileSync(path.join(__dirname,'..','add-document-widgetHTMLPage.js'),'utf8').replaceAll('REPLACE_WITH_WIDGET_BUILD_REVISION','widget-test');
const dependencies=['vendor/markdown-it-15.0.2.min.js','editor-content.js','entitlements.js','confluence.js','scroll-tools.js','add-document-widget.js'].map(name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8')).join('\n;\n');
const upload=path.join(__dirname,'..','confluence-upload');
const generated={
  macro:fs.readFileSync(path.join(upload,'html','wcspedia-header-widget.html'),'utf8'),
  logic:fs.readFileSync(path.join(upload,'attachments','wcspedia-add-document.js'),'utf8'),
  startup:fs.readFileSync(path.join(upload,'attachments','wcspedia-add-documentHTMLPage.js'),'utf8')
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function assertDisabled(host) { assert.equal(host.hidden,false); assert.equal(host.querySelectorAll('button').length,1); const button=host.querySelector('button'); assert.equal(button.disabled,true); assert.match(button.textContent,/Add document/); assert.ok(button.title); assert.equal(host.querySelector('[role="menu"]'),null); button.click(); assert.equal(host.ownerDocument.querySelector('[role="menu"]'),null); }
function assertReady(host) { assert.equal(host.hidden,false); assert.equal(host.querySelectorAll('button').length,1); assert.equal(host.querySelector('button').disabled,false); }
function fixture(){
  const dom=new JSDOM('<button id="before">Before</button><div id="host"></div><button id="after">After</button>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=1',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;w.console.warn=()=>{};w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.eval(source);
  return {w,d,host:d.getElementById('host'),close:()=>w.close()};
}
function permissionTimers(f){
  const active=new Map(),set=f.w.setTimeout.bind(f.w),clear=f.w.clearTimeout.bind(f.w);let next=-1;
  f.w.setTimeout=(callback,delay,...args)=>{if(delay>=1000&&delay<=30000){const id=next--;active.set(id,()=>callback(...args));return id;}return set(callback,delay,...args);};
  f.w.clearTimeout=id=>{if(active.has(id))active.delete(id);else clear(id);};
  return {get size(){return active.size;},expire(){const entry=active.entries().next().value;assert.ok(entry,'An access deadline must be pending');active.delete(entry[0]);entry[1]();}};
}
function headerFixture(overrides={},built=false,policyState='ready'){
  const f=fixture(),requests=[];
  f.w.TextEncoder=TextEncoder;
  f.host.setAttribute('data-wcs-header-add-document','');
  f.w.WCS_CONFIG={pageRole:'home',rootPageId:'100'};
  f.w.WCSConfluence={existingPageAdapter:true};f.w.WCSEntitlements={existingPagePolicy:true};
  const pageConfig=f.w.WCS_CONFIG,pageAdapter=f.w.WCSConfluence,pagePolicy=f.w.WCSEntitlements;
  if(built){
    f.host.removeAttribute('data-wcs-header-add-document');
    f.host.innerHTML=generated.macro.replaceAll('REPLACE_WITH_ATTACHMENTS_PAGE_ID','900').replaceAll('REPLACE_WITH_WCSPEDIA_PAGE_ID','100').replaceAll('REPLACE_WITH_MY_WORKSPACE_PAGE_ID','102');
    const inline=f.host.querySelector('script:not([src])');f.w.eval(inline.textContent);
    f.host=f.host.querySelector('[data-wcs-header-add-document]');
    Object.assign(f.w.WCS_ADD_DOCUMENT_CONFIG,{authoringMode:'service',workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace'},overrides);
  }else f.w.WCS_ADD_DOCUMENT_CONFIG=Object.assign({mode:'confluence',contextPath:'/confluence',attachmentPageId:'900',rootPageId:'100',workspacePageId:'102',entitlementsPageId:'200',workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace',types:['Job aid','Blog']},overrides);
  f.w.fetch=async (url,options)=>{
    requests.push({url:String(url),options});const u=new URL(String(url));let body;
    if(u.pathname==='/confluence/rest/api/user/current')body={type:'known',username:'AM12345',userKey:'user-1',displayName:'Alex Morgan'};
    else if(u.pathname==='/confluence/rest/api/content/100')body={id:'100',operations:[{operation:policyState.startsWith('space-')?'read':'create',targetType:'page'}]};
    else if(u.pathname==='/confluence/rest/wcspedia/workspace'&&u.searchParams.get('capabilitiesOnly')==='true')body={rootPageId:'100',identity:{soeid:'AM12345',userKey:'user-1'},canCreateDocument:policyState==='space-allowed'};
    else if(/^\/confluence\/rest\/api\/content\/(200|900)$/.test(u.pathname))body={id:u.pathname.split('/').pop(),operations:[{operation:'read',targetType:'page'}],version:{number:1}};
    else if(/^\/confluence\/rest\/api\/content\/(200|900)\/child\/attachment$/.test(u.pathname))body={results:policyState==='missing'?[]:[{id:'205',title:'entitlements.json',version:{number:1}}]};
    else if(/^\/confluence\/download\/attachments\/(200|900)\/entitlements\.json$/.test(u.pathname)){
      if(policyState==='unavailable')return {ok:false,status:503,text:async()=>''};
      body=policyState==='invalid'?'invalid JSON policy':{schemaVersion:1,revision:1,records:[{id:'grant-1',soeid:'AM12345',displayName:'Alex Morgan',scope:'*',permissions:['content.create'],active:true}],audit:[]};
    }
    else throw Error('Unexpected header fetch: '+url);
    return {ok:true,text:async()=>JSON.stringify(body)};
  };
  const logic=built?generated.logic:`(function(){var scope={fetch:window.fetch.bind(window),location:window.location,DOMParser:window.DOMParser};(function(globalThis){${dependencies}\n})(scope);window.WCSHeaderWidgetModules={addDocument:{version:'widget-test',Confluence:scope.WCSConfluence,AddDocument:scope.WCSAddDocument,Content:scope.WCSEditorContent}};})();`;
  f.w.eval(logic);
  return Object.assign(f,{requests,pageConfig,pageAdapter,pagePolicy,start:()=>f.w.eval(built?generated.startup:startup),reloadLogic:()=>f.w.eval(logic)});
}
function headerLayout(f,{list=false,create=true,explicit=false}={}){
  const header=f.d.createElement('header');header.id='header';
  const group=explicit?'<button data-wcs-create-anchor type="button">Create</button>':'<div class="aui-buttons"><a id="quick-create-page-button" href="/confluence/pages/createpage.action">Create</a><a id="create-page-button" href="/confluence/pages/createpage.action" aria-label="Create from template">•••</a></div>';
  header.innerHTML=list?'<ul id="native-actions"><li id="create-slot">'+(create?group:'')+'</li><li><a id="native-search" href="/search">Search</a></li></ul><div id="widget-original-slot"><span>Existing header content</span></div>':'<div id="native-actions">'+(create?group:'')+'<a id="native-search" href="/search">Search</a><div id="widget-original-slot"><span>Existing header content</span></div></div>';
  f.d.body.prepend(header);header.querySelector('#widget-original-slot').append(f.host);
  return {header,group,slot:header.querySelector('#widget-original-slot'),actions:header.querySelector('#native-actions'),createSlot:header.querySelector('#create-slot')};
}
function placementObservers(f){
  const NativeObserver=f.w.MutationObserver,observed=[];
  f.w.MutationObserver=class extends NativeObserver {
    constructor(callback){super(callback);this.record={targets:[],disconnected:false};observed.push(this.record);}
    observe(target,options){this.record.targets.push(target);return super.observe(target,options);}
    disconnect(){this.record.disconnected=true;return super.disconnect();}
  };
  return observed;
}
(async()=>{
 let passed=0;async function check(name,run){if(process.env.WCS_WIDGET_SOURCE_ONLY&&name.startsWith('generated '))return;await run();passed++;process.stdout.write('PASS '+name+'\n');}
 await check('authorization loads before enabling creation and is checked again before routing',async()=>{
   const f=fixture();try{let calls=0;const routes=[];const handle=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>{calls++;return true;},types:['Job aid','Blog'],createUrl:'/confluence/pages/viewpage.action?pageId=2',navigate:(url,type)=>routes.push({url,type})});
   assertDisabled(f.host);await handle.ready;assertReady(f.host);const button=f.host.querySelector('button');assert.equal(calls,1);
   button.click();await tick();assert.equal(calls,2);const items=f.d.querySelectorAll('[role=menuitem]');assert.equal(items.length,2);items[1].click();await tick();assert.equal(calls,3);assert.deepEqual(routes,[{url:'https://example.test/confluence/pages/viewpage.action?pageId=2#/create?type=Blog',type:'Blog'}]);handle.destroy();}finally{f.close();}
 });
 await check('header buttons remain visibly disabled through access failure and denial',async()=>{
   const f=fixture();try{
     const header=f.d.createElement('header');header.id='navHeader';f.d.body.append(header);header.append(f.host);
     const theme=f.d.createElement('style');theme.textContent='#navHeader button { background: blue!important; color:white!important; }';f.d.head.append(theme);
     const styles=f.d.createElement('style');styles.textContent=fs.readFileSync(path.join(__dirname,'..','add-document-widget.css'),'utf8');f.d.head.append(styles);
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>true,types:['Blog'],createUrl:'#/create'});
     const button=f.host.querySelector('button');
     assert.equal(button.getAttribute('aria-busy'),'true');
     assert.equal(button.getAttribute('aria-disabled'),'true');
     await h.ready;assertReady(f.host);
     assert.equal(button.getAttribute('aria-disabled'),'false');
     assert.equal(button.getAttribute('aria-busy'),'false');
     for(const provider of [async()=>{throw Error('Entitlement attachment unavailable');},async()=>false]){
       await h.update({canCreate:provider});assertDisabled(f.host);
       assert.equal(button.getAttribute('aria-disabled'),'true');
       assert.equal(button.getAttribute('aria-busy'),'false');
       assert.equal(f.w.getComputedStyle(button).backgroundColor,'rgb(238, 241, 245)');
       assert.equal(f.w.getComputedStyle(button).color,'rgb(107, 119, 140)');
     }
   }finally{f.close();}
 });
 await check('missing, denied, failed, and truthy nonboolean providers fail closed',async()=>{
   for(const provider of [undefined,async()=>false,async()=>({allowed:true}),async()=>{throw Error('no session');}]){
     const f=fixture();try{const h=f.w.WCSAddDocument.mount(f.host,{canCreate:provider,types:['Blog'],createUrl:'#/create'});assert.equal(await h.ready,false);assertDisabled(f.host);assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.host.querySelector('[role=status]'),null);}finally{f.close();}
   }
 });
 await check('same-origin validation blocks external and executable destinations',async()=>{
   for(const url of ['https://other.test/create','javascript:alert(1)','data:text/html,hello','//other.test/create']){
     const f=fixture();try{const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>true,types:['Blog'],createUrl:url});assert.equal(await h.ready,false);assertDisabled(f.host);}finally{f.close();}
   }
 });
 await check('keyboard navigation, Escape, Tab, and outside dismissal use the same menu',async()=>{
   const f=fixture();try{const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>true,types:['Job aid','Blog','Training'],createUrl:'#/create'});await h.ready;const trigger=f.host.querySelector('button');
   trigger.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await tick();assert.equal(f.d.activeElement.textContent,'Job aid');
   f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement.textContent,'Training');
   f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.d.activeElement,trigger);
   trigger.click();await tick();f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.d.activeElement.id,'after');
   trigger.click();await tick();f.d.getElementById('before').dispatchEvent(new f.w.Event('pointerdown',{bubbles:true}));assert.equal(f.d.querySelector('[role=menu]'),null);
   h.destroy();}finally{f.close();}
 });
 await check('delayed menu authorization respects Escape, outside focus and pointer intent',async()=>{
   for(const cancel of ['escape','focus','pointer']){
     const f=fixture();try{let checks=0,resolve;
       const h=f.w.WCSAddDocument.mount(f.host,{canCreate:()=>++checks===2?new Promise(done=>{resolve=done;}):Promise.resolve(true),types:['Blog'],createUrl:'#/create'});
       await h.ready;const trigger=f.host.querySelector('button');trigger.focus();trigger.click();assert.equal(f.host.hidden,false);assert.equal(trigger.disabled,true);assert.equal(trigger.getAttribute('aria-busy'),'true');
       const other=f.d.getElementById('after');
       if(cancel==='escape')f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
       if(cancel==='focus')other.focus();
       if(cancel==='pointer')other.dispatchEvent(new f.w.Event('pointerdown',{bubbles:true}));
       const focus=f.d.activeElement;resolve(true);await tick();assertReady(f.host);assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.d.activeElement,focus);
       f.host.querySelector('button').click();await tick();assert.ok(f.d.querySelector('[role=menu]'),'A later deliberate click can open the authorized menu');h.destroy();
     }finally{f.close();}
   }
 });
 await check('canceled selection restores trigger focus only when no other interaction or dialog took focus',async()=>{
   for(const guard of ['cancel','dialog','other-focus']){
     const f=fixture();try{let checks=0,resolve,navigations=0;
       const h=f.w.WCSAddDocument.mount(f.host,{canCreate:()=>++checks===3?new Promise(done=>{resolve=done;}):Promise.resolve(true),types:['Blog'],createUrl:'#/create',navigate:()=>{
         navigations++;if(guard==='dialog'){const dialog=f.d.createElement('div');dialog.setAttribute('role','dialog');dialog.tabIndex=-1;f.d.body.append(dialog);dialog.focus();}return false;
       }});
       await h.ready;f.host.querySelector('button').click();await tick();f.d.querySelector('[role=menuitem]').click();assert.equal(f.host.hidden,false);assert.equal(f.host.querySelector('button').getAttribute('aria-busy'),'true');
       if(guard==='other-focus')f.d.getElementById('after').focus();resolve(true);await tick();assertReady(f.host);assert.equal(f.d.querySelector('[role=menu]'),null);
       if(guard==='cancel'){assert.equal(navigations,1);assert.equal(f.d.activeElement,f.host.querySelector('button'));}
       if(guard==='dialog'){assert.equal(navigations,1);assert.equal(f.d.activeElement,f.d.querySelector('[role=dialog]'));}
       if(guard==='other-focus'){assert.equal(navigations,0);assert.equal(f.d.activeElement,f.d.getElementById('after'));}
       h.destroy();
     }finally{f.close();}
   }
 });
 await check('mount is idempotent and update replaces types without duplicate listeners',async()=>{
   const f=fixture();try{const options={canCreate:async()=>true,types:['Blog'],createUrl:'#/create'},a=f.w.WCSAddDocument.mount(f.host,options),b=f.w.WCSAddDocument.mount(f.host,{types:['Training']});assert.equal(a,b);await b.ready;assert.equal(f.host.querySelectorAll('button').length,1);f.host.querySelector('button').click();await tick();assert.equal(f.d.querySelectorAll('[role=menu]').length,1);assert.equal(f.d.querySelector('[role=menuitem]').textContent,'Training');b.destroy();assert.equal(f.host.children.length,0);assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(await b.update(options),false);}finally{f.close();}
 });
 await check('stale permission responses cannot re-enable a denied or destroyed widget',async()=>{
   const f=fixture();try{let resolve;const h=f.w.WCSAddDocument.mount(f.host,{canCreate:()=>new Promise(r=>{resolve=r;}),types:['Blog'],createUrl:'#/create'});const old=h.ready;await h.update({canCreate:async()=>false});resolve(true);await old;assertDisabled(f.host);let pending;h.update({canCreate:()=>new Promise(r=>{pending=r;})});h.destroy();pending(true);await h.ready;assert.equal(f.host.children.length,0);}finally{f.close();}
 });
 await check('a hung permission check times out, aborts, and leaves no visible or focusable header content',async()=>{
   const f=fixture();try{const timers=permissionTimers(f),pending=[];
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:request=>new Promise(resolve=>pending.push({resolve,signal:request.signal})),types:['Blog'],createUrl:'#/create'});
     assertDisabled(f.host);assert.equal(timers.size,1);assert.equal(pending[0].signal.aborted,false);timers.expire();assert.equal(await h.ready,false);assert.equal(pending[0].signal.aborted,true);
     assertDisabled(f.host);assert.equal(f.d.querySelector('[aria-label="Retry document creation access check"]'),null);
     pending[0].resolve(true);await tick();assertDisabled(f.host);assert.equal(f.d.querySelector('[role=menu]'),null);
     h.update({});assert.equal(pending.length,2);assertDisabled(f.host);pending[1].resolve(true);assert.equal(await h.ready,true);assertReady(f.host);assert.equal(timers.size,0);h.destroy();
   }finally{f.close();}
 });
 await check('a late permission grant after selection timeout never navigates or reopens the menu',async()=>{
   const f=fixture();try{const timers=permissionTimers(f);let checks=0,late,signal,navigations=0;
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:request=>{checks++;if(checks===3){signal=request.signal;return new Promise(resolve=>{late=resolve;});}return Promise.resolve(true);},types:['Blog'],createUrl:'#/create',navigate:()=>{navigations++;}});
     await h.ready;f.host.querySelector('button').click();await tick();f.d.querySelector('[role=menuitem]').click();assert.equal(checks,3);timers.expire();await tick();assert.equal(signal.aborted,true);assert.equal(navigations,0);
     late(true);await tick();assert.equal(navigations,0);assert.equal(f.d.querySelector('[role=menu]'),null);assertDisabled(f.host);
     h.update({});assert.equal(await h.ready,true);assert.equal(checks,4);assert.equal(navigations,0);h.destroy();
   }finally{f.close();}
 });
 await check('destroy cancels an unfinished permission check and removes its timer and controls',async()=>{
   const f=fixture();try{const timers=permissionTimers(f);let late,signal;
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:request=>{signal=request.signal;return new Promise(resolve=>{late=resolve;});},types:['Blog'],createUrl:'#/create'});
     const pending=h.ready;h.destroy();assert.equal(signal.aborted,true);assert.equal(timers.size,0);assert.equal(await pending,false);late(true);await tick();assert.equal(f.host.children.length,0);assert.equal(f.d.querySelector('[role=menu]'),null);
   }finally{f.close();}
 });
 await check('revoked access blocks creation at selection and no untrusted labels become markup',async()=>{
   const f=fixture();try{let permitted=true,navigated=false;const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>permitted,types:[{value:'Blog',label:'<img src=x onerror=alert(1)>',description:'<script>bad</script>'}],createUrl:'#/create',navigate:()=>{navigated=true;}});await h.ready;f.host.querySelector('button').click();await tick();assert.equal(f.d.querySelectorAll('.wcs-add-document-popover img,.wcs-add-document-popover script').length,0);permitted=false;f.d.querySelector('[role=menuitem]').click();await tick();assert.equal(navigated,false);assertDisabled(f.host);}finally{f.close();}
 });
 await check('missing integration hides the control without querying permissions',async()=>{
   const f=fixture();try{let checks=0;const handle=f.w.WCSAddDocument.mount(f.host,{unavailableMessage:'Document creation is not connected.',canCreate:async()=>{checks++;return true;},types:['Blog'],createUrl:'#/create'});assert.equal(await handle.ready,false);assert.equal(checks,0);assertDisabled(f.host);await handle.update({unavailableMessage:''});assert.equal(checks,1);assert.equal(f.host.querySelector('button').disabled,false);}finally{f.close();}
 });
 await check('widget clicks do not invoke host delegated page-action handlers',async()=>{
   const f=fixture();try{let hostClicks=0,navigations=0;f.d.addEventListener('click',()=>{hostClicks++;});const handle=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>true,types:['Blog'],createUrl:'#/create',navigate:()=>{navigations++;}});await handle.ready;f.host.querySelector('button').click();await tick();f.d.querySelector('[role=menuitem]').click();await tick();assert.equal(navigations,1);assert.equal(hostClicks,0);}finally{f.close();}
 });
 await check('header pair reads shared policy without starting the app or altering its globals',async()=>{
   const f=headerFixture();try{f.start();await tick();await tick();assert.equal(f.host.querySelector('button').disabled,false);assert.equal(f.requests.length,6);assert.equal(f.w.WCS_CONFIG,f.pageConfig);assert.equal(f.w.WCSConfluence,f.pageAdapter);assert.equal(f.w.WCSEntitlements,f.pagePolicy);assert.equal(f.d.getElementById('wcspedia'),null);assert.ok(f.requests.every(r=>r.options.method==='GET'&&r.options.credentials==='same-origin'));assert.ok(f.requests.some(r=>new URL(r.url).pathname==='/confluence/download/attachments/200/entitlements.json'));assert.ok(f.requests.every(r=>!r.url.includes('/workspace')&&!r.url.includes('body.storage')));f.start();f.d.dispatchEvent(new f.w.Event('DOMContentLoaded'));await tick();assert.equal(f.host.querySelectorAll('button').length,1);assert.equal(f.requests.length,6);f.host.querySelector('button').click();await tick();assert.equal(f.d.querySelectorAll('[role=menuitem]').length,5);assert.equal(f.requests.length,6);}finally{f.close();}
 });
 await check('header missing authoring services has an empty hidden state',async()=>{
   for(const overrides of [{workflowEndpoint:''},{workspaceEndpoint:''}]){const f=headerFixture(overrides);try{f.start();await tick();assert.equal(f.requests.length,0);assertDisabled(f.host);}finally{f.close();}}
 });
 await check('header attachment policies resolve blank policy IDs to the attachments page',async()=>{
   for(const entitlementsPageId of ['',null,undefined]){const f=headerFixture({entitlementsPageId});try{
     f.start();await tick();await tick();assert.equal(f.host.querySelector('button').disabled,false);assert.equal(f.requests.length,6);
     assert.ok(f.requests.some(request=>new URL(request.url).pathname==='/confluence/rest/api/content/900'));
     assert.ok(f.requests.some(request=>new URL(request.url).pathname==='/confluence/download/attachments/900/entitlements.json'));
     assert.ok(f.requests.every(request=>!new URL(request.url).pathname.includes('/200')));
   }finally{f.close();}}
 });
 await check('attachment policy fallback still requires both authoring services',async()=>{
   for(const missing of ['workflowEndpoint','workspaceEndpoint']){const f=headerFixture({entitlementsSource:'attachment',entitlementsPageId:'',[missing]:''});try{
     f.start();await tick();assert.equal(f.requests.length,0);assertDisabled(f.host);
   }finally{f.close();}}
 });
 await check('header never falls back to a native table when the JSON attachment is missing or unavailable',async()=>{
   for(const state of ['missing','unavailable','invalid']){const f=headerFixture({},false,state);try{
     f.start();await tick();await tick();assertDisabled(f.host);
     assert.ok(f.requests.some(request=>new URL(request.url).pathname==='/confluence/rest/api/content/200/child/attachment'));
     assert.ok(f.requests.every(request=>!new URL(request.url).searchParams.get('expand')?.includes('body.storage')));
     assert.equal(f.d.querySelector('[role=menu]'),null);
   }finally{f.close();}}
 });
 await check('header rejects an explicitly configured native-table source before requesting access',async()=>{
   const f=headerFixture({entitlementsSource:'table'});try{
     f.start();await tick();assert.equal(f.requests.length,0);assertDisabled(f.host);
   }finally{f.close();}
 });
 await check('header passes its bounded access signal and never accepts a late grant after timeout',async()=>{
   const f=headerFixture({accessTimeoutMs:1000});try{const timers=permissionTimers(f),checks=[];
     f.w.WCSHeaderWidgetModules.addDocument.Confluence={create:()=>({info:()=>({entitlementsConfigured:true,workflowConfigured:true,workspaceConfigured:true}),loadAccess:options=>new Promise(resolve=>checks.push({resolve,signal:options.signal}))})};
     f.start();await tick();assert.equal(checks.length,1);assertDisabled(f.host);timers.expire();await tick();assert.equal(checks[0].signal.aborted,true);assertDisabled(f.host);
     checks[0].resolve({effectivePermissions:{'content.create':true}});await tick();assertDisabled(f.host);assert.equal(timers.size,1,'Only the bounded transient retry remains scheduled');
   }finally{f.close();}
 });
 await check('header selection delegates navigation so an active editor can guard unsaved work',async()=>{
   const f=headerFixture();try{let destination;f.d.addEventListener('wcspedia:navigate',event=>{destination=event.detail.href;event.preventDefault();});f.start();await tick();f.host.querySelector('button').click();await tick();f.d.querySelector('[role=menuitem][data-label=blogs]').click();await tick();assert.equal(destination,'https://example.test/confluence/pages/viewpage.action?pageId=102#/create?type=Blog');assert.equal(f.requests.length,6);}finally{f.close();}
 });
 await check('header rejects mismatched pairs and invalid IDs before doing network work',async()=>{
   for(const overrides of [{rootPageId:'PLACEHOLDER'},{attachmentPageId:'https://example.test'},{workspacePageId:'0'},{workflowEndpoint:'https://other.test/endpoint'},{accessTimeoutMs:0},{accessTimeoutMs:'1000'},{accessTimeoutMs:30001}]){const f=headerFixture(overrides);try{f.start();await tick();assert.equal(f.requests.length,0);assertDisabled(f.host);}finally{f.close();}}
   const f=headerFixture();try{f.w.WCSHeaderWidgetModules.addDocument.version='old';f.start();await tick();assert.equal(f.requests.length,0);assertDisabled(f.host);}finally{f.close();}
 });
 await check('header macro contains its own inline settings and only the matching script pair',async()=>{
   const html=fs.readFileSync(path.join(__dirname,'..','add-document-widget-confluence-macro.html'),'utf8');const dom=new JSDOM(html);
   try{const d=dom.window.document,scripts=Array.from(d.querySelectorAll('script[src]'));assert.equal(scripts.length,2);assert.match(scripts[0].getAttribute('src'),/wcspedia-add-document\.js/);assert.match(scripts[1].getAttribute('src'),/wcspedia-add-documentHTMLPage\.js/);assert.equal(d.querySelectorAll('link,style,#wcspedia').length,0);assert.match(html,/WCS_ADD_DOCUMENT_CONFIG\s*=/);assert.doesNotMatch(html,/window\.WCS_CONFIG\s*=/);assert.ok(scripts.every(s=>s.getAttribute('src').includes('REPLACE_WITH_ATTACHMENTS_PAGE_ID')));}finally{dom.window.close();}
 });
 await check('header keeps a disabled button before scripts and replaces stale controls on script errors',async()=>{
   const html=fs.readFileSync(path.join(__dirname,'..','add-document-widget-confluence-macro.html'),'utf8');
   const dom=new JSDOM(html,{runScripts:'outside-only'});try{const w=dom.window,host=w.document.querySelector('[data-wcs-header-add-document]');w.console.warn=()=>{};w.eval(w.document.querySelector('script:not([src])').textContent);assertDisabled(host);
     for(const script of w.document.querySelectorAll('script[src]')){host.hidden=false;host.innerHTML='<button>Stale action</button>';w.eval(script.getAttribute('onerror'));assertDisabled(host);}
   }finally{dom.window.close();}
 });
 for(const built of [false,true]){
  const prefix=built?'generated ':'';
  await check(prefix+'floating widget preserves native header controls and has exactly one accessible trigger',async()=>{
   const f=headerFixture({},built);try{
    const layout=headerLayout(f,{list:true}),group=layout.header.querySelector('.aui-buttons'),markup=group.innerHTML;
    layout.header.getBoundingClientRect=()=>({bottom:104});
    f.start();await tick();await tick();assertReady(f.host);
    assert.equal(f.host.parentElement,f.d.body);assert.equal(f.host.style.getPropertyValue('--wcs-add-top'),'');assert.ok(f.d.getElementById('wcs-back-to-top'));
    assert.equal(group.innerHTML,markup);assert.equal(layout.actions.children.length,2);
    assert.equal(f.host.querySelector('button').getAttribute('aria-label'),'Add document');
    const count=f.requests.length;f.start();await tick();assert.equal(f.requests.length,count);
    assert.equal(f.d.querySelectorAll('[data-wcs-header-add-document]').length,1);
   }finally{f.close();}
  });
  await check(prefix+'floating menu still opens and Escape returns focus to trigger',async()=>{
   const f=headerFixture({},built);try{
    headerLayout(f);f.start();await tick();await tick();const button=f.host.querySelector('button');button.click();await tick();
    assert.ok(f.d.querySelector('[role=menu]'));f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(f.d.querySelector('[role=menu]'),null);assert.equal(f.d.activeElement,button);
   }finally{f.close();}
  });
 }
 await check('floating controls stay independent of navbar scroll without refetching access',async()=>{
  const f=headerFixture();try{
   headerLayout(f);f.start();await tick();await tick();const count=f.requests.length;
   f.w.dispatchEvent(new f.w.Event('scroll'));f.w.dispatchEvent(new f.w.Event('resize'));await new Promise(resolve=>f.w.requestAnimationFrame(resolve));
   assert.equal(f.host.style.getPropertyValue('--wcs-add-top'),'');assert.equal(f.host.parentElement,f.d.body);
   assert.equal(f.d.querySelectorAll('#wcs-back-to-top').length,1);assert.equal(f.requests.length,count);
  }finally{f.close();}
 });
 await check('floating disabled states remain visible without changing native Create',async()=>{
  for(const state of ['missing','unavailable','denied']){
   const f=headerFixture(state==='missing'?{workspaceEndpoint:''}:{},false,state==='unavailable'?'unavailable':'ready');try{
    const layout=headerLayout(f),group=layout.header.querySelector('.aui-buttons'),markup=group.innerHTML;
    if(state==='denied')f.w.WCSHeaderWidgetModules.addDocument.Confluence={create:()=>({info:()=>({entitlementsConfigured:true}),loadAccess:async()=>({effectivePermissions:{'content.create':false}})})};
    f.start();await tick();await tick();assertDisabled(f.host);assert.equal(f.host.parentElement,f.d.body);assert.equal(group.innerHTML,markup);
   }finally{f.close();}
  }
 });
 await check('generated macro and widget pair share one revision and preserve page modules',async()=>{
   const f=headerFixture({},true);try{
     const module=f.w.WCSHeaderWidgetModules.addDocument,version=module.version;
     assert.match(version,/^[0-9a-f]{12}$/);
     assert.doesNotMatch(generated.logic+generated.startup+generated.macro,/REPLACE_WITH_WIDGET_BUILD_REVISION/);
     const scripts=Array.from(f.d.querySelectorAll('script[src]'));assert.equal(scripts.length,2);
     scripts.forEach(script=>{const src=new URL(script.src);assert.equal(src.searchParams.has('v'),false);assert.equal(src.searchParams.get('api'),'v2');assert.equal(src.origin,f.w.location.origin);assert.match(src.pathname,/\/download\/attachments\/900\/wcspedia-add-document(?:HTMLPage)?\.js$/);});
     assert.equal(f.requests.length,0);f.start();await tick();await tick();
     assert.equal(f.host.querySelector('button').disabled,false);assert.equal(f.requests.length,6);
     assert.equal(f.w.WCS_CONFIG,f.pageConfig);assert.equal(f.w.WCSConfluence,f.pageAdapter);assert.equal(f.w.WCSEntitlements,f.pagePolicy);
     assert.equal(f.d.querySelectorAll('#wcspedia,link,style').length,0);
     f.reloadLogic();f.start();await tick();assert.equal(f.w.WCSHeaderWidgetModules.addDocument,module);assert.equal(f.requests.length,6);assert.equal(f.host.querySelectorAll('button').length,1);
   }finally{f.close();}
 });
 await check('generated widget authenticates again and emits cancelable navigation to its configured workspace',async()=>{
   const f=headerFixture({},true);try{
     let destination,cancelable;f.d.addEventListener('wcspedia:navigate',event=>{destination=event.detail.href;cancelable=event.cancelable;event.preventDefault();});
     f.start();await tick();f.host.querySelector('button').click();await tick();
     const blog=Array.from(f.d.querySelectorAll('[role=menuitem]')).find(item=>item.textContent==='Blogs');assert.ok(blog);blog.click();await tick();
     assert.equal(destination,'https://example.test/confluence/pages/viewpage.action?pageId=102#/create?type=Blog');assert.equal(cancelable,true);assert.equal(f.w.location.hash,'');assert.equal(f.requests.length,6);
     assert.ok(f.requests.every(request=>request.options.method==='GET'&&request.options.credentials==='same-origin'));
   }finally{f.close();}
 });
 await check('generated widget uses the attachment policy fallback while preserving authoring-service requirements',async()=>{
   const f=headerFixture({},true);try{
     for(const key of ['entitlementsPageId','entitlementsSource','entitlementsFilename'])assert.equal(Object.hasOwn(f.w.WCS_ADD_DOCUMENT_CONFIG,key),false,'The generated header needs no '+key);
     f.start();await tick();await tick();assert.equal(f.host.querySelector('button').disabled,false);assert.equal(f.requests.length,6);
     assert.ok(f.requests.some(request=>new URL(request.url).pathname==='/confluence/download/attachments/900/entitlements.json'));
   }finally{f.close();}
   for(const missing of ['workflowEndpoint','workspaceEndpoint']){const unavailable=headerFixture({entitlementsPageId:'',entitlementsSource:'attachment',[missing]:''},true);try{
     unavailable.start();await tick();assert.equal(unavailable.requests.length,0);assertDisabled(unavailable.host);
   }finally{unavailable.close();}}
   const legacy=headerFixture({entitlementsPageId:'',entitlementsSource:'table'},true);try{
     legacy.start();await tick();assert.equal(legacy.requests.length,0);assertDisabled(legacy.host);
   }finally{legacy.close();}
 });
 await check('generated widget fails closed for an unavailable backend and a mismatched pair',async()=>{
   const missing=headerFixture({workflowEndpoint:''},true);try{missing.start();await tick();assert.equal(missing.requests.length,0);assertDisabled(missing.host);}finally{missing.close();}
   const mismatched=headerFixture({},true);try{mismatched.w.WCSHeaderWidgetModules.addDocument.version='older-build';mismatched.start();await tick();assert.equal(mismatched.requests.length,0);assertDisabled(mismatched.host);}finally{mismatched.close();}
 });
 await check('Data Center space creation uses a fresh trusted capability without changing the header control',async()=>{
   for(const built of [false,true])for(const policyState of ['space-allowed','space-denied']){
     const f=headerFixture({},built,policyState);try{
       f.start();await tick();await tick();
       assert.equal(f.requests.filter(request=>request.url.includes('capabilitiesOnly=true')).length,1);
       if(policyState==='space-allowed')assertReady(f.host);else assertDisabled(f.host);
       assert.equal(f.requests.some(request=>request.options.method!=='GET'),false);
     }finally{f.close();}
   }
 });
 await check('the global notification service receives only user-triggered route and access outcomes',async()=>{
   const f=fixture();try{
     const notices=[];f.w.WCSNotifications={show:(message,options)=>notices.push({message,type:options.type})};let permitted=true;
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>permitted,types:['Blog'],createUrl:'#/create',navigate:()=>{}});
     await h.ready;assert.equal(notices.length,0);f.host.querySelector('button').click();await tick();assert.equal(notices.length,0);
     f.d.querySelector('[role=menuitem]').click();await tick();assert.equal(notices.length,1);assert.equal(notices[0].type,'info');assert.match(notices[0].message,/Opening.*editor/);
     f.host.querySelector('button').click();await tick();permitted=false;f.d.querySelector('[role=menuitem]').click();await tick();assert.equal(notices.length,2);assert.equal(notices[1].type,'warning');
     await h.update({canCreate:async()=>{throw Error('Unavailable');}});assert.equal(notices.length,2);
     assertDisabled(f.host);assert.equal(f.host.querySelector('[role=status]'),null);h.destroy();
   }finally{f.close();}
 });
 await check('a canceled authoring navigation does not announce that a draft is opening',async()=>{
   const f=fixture();try{
     const notices=[];f.w.WCSNotifications={show:(...args)=>notices.push(args)};
     const h=f.w.WCSAddDocument.mount(f.host,{canCreate:async()=>true,types:['Blog'],createUrl:'#/create',navigate:()=>false});
     await h.ready;f.host.querySelector('button').click();await tick();f.d.querySelector('[role=menuitem]').click();await tick();assert.equal(notices.length,0);h.destroy();
   }finally{f.close();}
 });
 process.stdout.write(passed+' add-document widget checks passed\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
