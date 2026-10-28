'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const profile=JSON.parse(read('confluence-installation.json')),policy=JSON.parse(read('confluence-data-starters/entitlements.json'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function fixture({unrestricted=false,denied=false,networkOnce=false,navbarId=null,duplicate=false,missingRevision=false,pageId=profile.pageIds.home}={}){
 const actions='<div data-wcs-header-add-document></div><div class="aui-buttons"><button id="quick-create-page-button">Create</button></div>';
 const markup=navbarId?'<header id="header"><button id="create-page-button">Native Create</button></header><div id="'+navbarId+'">'+actions+'</div>':'<header id="header">'+actions+'</header>';
 const dom=new JSDOM(markup+(duplicate?'<div data-wcs-header-add-document></div><div data-wcs-add-document></div>':''),{url:'https://example.test/confluence/pages/viewpage.action?pageId='+pageId,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],warnings=[];
 for(const [name,value] of Object.entries({TextEncoder,TextDecoder,Headers,Response,AbortController,FormData,Blob}))w[name]=value;
 Object.defineProperty(w,'crypto',{value:webcrypto});
 w.console.warn=message=>warnings.push(message);
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};
 w.WCS_ADD_DOCUMENT_CONFIG={mode:'confluence',authoringMode:'confluence-session',spaceKey:'wcspedia',contextPath:'/confluence',rootPageId:profile.pageIds.home,attachmentPageId:profile.attachmentPageId,workspacePageId:profile.pageIds.mine,nativePublication:{workingRootPageId:profile.workingRootPageId,insightsPageId:profile.insightsPageId},types:['Job aid','Blog']};
 w.fetch=async(input,init={})=>{
  const u=new URL(input),p=u.pathname;calls.push({url:u,method:init.method||'GET'});
  if(networkOnce){networkOnce=false;throw Error('Temporary network interruption');}
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  if(p.endsWith('/user/current'))return json({type:'known',username:'br47149',userKey:'br47149',displayName:'BR47149'});
  if(p.endsWith('/space/wcspedia'))return json({key:'wcspedia'});
  if(p.includes('/space/wcspedia/permissions/user/'))return json([{operation:{targetType:'page',operationKey:'create'}}]);
  if(p.endsWith('/restriction/byOperation/read'))return json({operation:'read',restrictions:{user:{results:unrestricted?[]:[{username:'br47149'}]},group:{results:[]}}});
  if(p.endsWith('/property'))return json({results:[]});
  if(p.endsWith('/property/wcspedia.entitlements.v1'))return json({},404);
  if(p.endsWith('/child/attachment'))return json({results:[{id:'555',type:'attachment',title:'entitlements.json',version:{number:1},container:{id:profile.attachmentPageId,type:'page'}}]});
  if(p.endsWith('/entitlements.json')){const value={...policy};if(missingRevision)delete value.revision;return json(denied?{...value,records:[]}:value);}
  const match=/\/rest\/api\/content\/(\d+)$/.exec(p);
  if(match)return json({id:match[1],type:'page',status:'current',space:{key:'wcspedia'},ancestors:[],version:{number:1},operations:match[1]===String(profile.workingRootPageId)?[{operation:'read',targetType:'page'}]:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}]});
  throw Error('Unexpected request '+input);
 };
 w.eval(read('confluence-upload/attachments/wcspedia-add-document.js'));
 w.eval(read('confluence-upload/attachments/wcspedia-add-documentHTMLPage.js'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const host=w.document.querySelector('[data-wcs-header-add-document]');
 for(let i=0;i<100&&(!host.dataset.wcsAddState||host.dataset.wcsAddState==='loading');i++)await tick();
 return {dom,w,host,calls,warnings,setPrivacy:value=>unrestricted=!value,close:()=>w.close()};
}
test('real native header bundle shows BR47149 Add document below the navbar using entitlements.json without services',async()=>{
 const f=await fixture();try{
  assert.equal(f.host.dataset.wcsAddState,'ready',f.warnings.join('\n'));
  assert.equal(f.host.hidden,false);assert.equal(f.host.querySelector('button').disabled,false);
  assert.equal(f.host.parentElement,f.w.document.body);assert.ok(f.host.hasAttribute('data-wcs-floating-add'));
  assert.ok(f.calls.some(c=>c.url.pathname.endsWith('/entitlements.json')));
  assert.equal(f.calls.some(c=>c.url.pathname.endsWith('/property/wcspedia.entitlements.v1')),false);
  assert.ok(f.calls.every(c=>c.method==='GET'),'Showing the header must not write metadata');
 }finally{f.close();}
});
test('duplicate current and legacy macro mounts share one header instance and one startup',async()=>{
 const f=await fixture({duplicate:true,navbarId:'navBar'});try{
  assert.equal(f.host.dataset.wcsAddState,'ready',f.warnings.join('\n'));
  assert.equal(f.w.document.querySelectorAll('[data-wcs-header-add-document],[data-wcs-add-document]').length,1);
  const count=f.calls.length,button=f.host.querySelector('button');
  f.host.parentElement.insertAdjacentHTML('beforeend','<div data-wcs-header-add-document><button>Add document</button></div><div data-wcs-add-document></div>');
  f.w.eval(read('confluence-upload/attachments/wcspedia-add-documentHTMLPage.js'));
  await tick();
  assert.equal(f.w.document.querySelectorAll('[data-wcs-header-add-document],[data-wcs-add-document]').length,1);
  assert.equal(f.host.querySelector('button'),button);
  assert.equal(f.calls.length,count,'A repeated include must not reload policy or recheck access');
  button.click();
  for(let i=0;i<100&&!f.w.document.querySelector('[role=menu]');i++)await tick();
  assert.equal(f.w.document.querySelectorAll('[role=menu]').length,1);
 }finally{f.close();}
});
test('missing JSON revision leaves an actionable disabled widget without rewriting policy',async()=>{
 const f=await fixture({missingRevision:true});try{
  assert.equal(f.host.querySelector('button').disabled,true);
  assert.match(f.host.dataset.wcsAddMessage,/entitlements.json.*schemaVersion.*revision/);
  assert.ok(f.calls.every(c=>c.method==='GET'));
 }finally{f.close();}
});
test('native draft privacy errors are diagnosed exactly and missing grants leave Add document disabled',async()=>{
 const broken=await fixture({unrestricted:true});try{
  assert.equal(broken.host.hidden,false);assert.equal(broken.host.querySelector('button').disabled,true);
  assert.equal(broken.host.dataset.wcsAddCode,'WORKING_ROOT_UNRESTRICTED');
  assert.match(broken.host.dataset.wcsAddMessage,/has no viewing protection/);
 }finally{broken.close();}
 const denied=await fixture({denied:true});try{
  assert.equal(denied.host.hidden,false);assert.equal(denied.host.querySelector('button').disabled,true);assert.equal(denied.host.dataset.wcsAddState,'denied');
 }finally{denied.close();}
});
test('header recovers from one transient startup failure without exposing denied actions',async()=>{
 const f=await fixture({networkOnce:true});try{
  assert.equal(f.host.hidden,false);assert.equal(f.host.querySelector('button').disabled,true);assert.equal(f.host.dataset.wcsAddCode,'NETWORK');
  await new Promise(resolve=>setTimeout(resolve,2200));
  assert.equal(f.host.dataset.wcsAddState,'ready',f.warnings.join('\n'));
  assert.equal(f.host.hidden,false);
 }finally{f.close();}
});
test('header rechecks native access after each Back/Forward restoration',async()=>{
 const f=await fixture();try{
  assert.equal(f.host.dataset.wcsAddState,'ready');
  for(let n=0;n<2;n++){
   const before=f.calls.filter(c=>c.url.pathname.endsWith('/user/current')).length;
   f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
   f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
   for(let i=0;i<100&&f.host.dataset.wcsAddState==='loading';i++)await tick();
   assert.equal(f.host.dataset.wcsAddState,'ready');
   assert.ok(f.calls.filter(c=>c.url.pathname.endsWith('/user/current')).length>before);
  }
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:false}));
  assert.equal(f.host.dataset.wcsHeaderWidgetStarted,undefined);
 }finally{f.close();}
});

for(const navbarId of ['navHeader','navBar'])test('widget floats below existing '+navbarId+' on every configured page without starting a splash',async()=>{
 for(const pageId of Object.values(profile.pageIds)){
  const f=await fixture({navbarId,pageId});try{
   assert.equal(f.host.dataset.wcsAddState,'ready',f.warnings.join('\n'));
   assert.ok(f.w.document.getElementById(navbarId));assert.equal(f.host.parentElement,f.w.document.body);assert.ok(f.host.hasAttribute('data-wcs-floating-add'));
   assert.equal(f.w.document.querySelectorAll('[data-wcs-header-add-document]').length,1);
   assert.equal(f.w.document.querySelector('.wcs-loading-overlay,.wcs-page-placeholder'),null);
   assert.equal(f.w.document.body.style.overflow,'');assert.equal(f.w.document.querySelector('[inert]'),null);
  }finally{f.close();}
 }
});

test('post-sync widget retry refreshes native access without granting Working-root Edit',async()=>{
 const f=await fixture({unrestricted:true});try{
  assert.equal(f.host.dataset.wcsAddCode,'WORKING_ROOT_UNRESTRICTED');f.setPrivacy(true);
  f.host.dispatchEvent(new f.w.Event('wcspedia:retry-add-document'));
  for(let i=0;i<100&&f.host.dataset.wcsAddState==='loading';i++)await tick();
  assert.equal(f.host.dataset.wcsAddState,'ready');assert.equal(f.host.querySelector('button').disabled,false);assert.ok(f.calls.every(c=>c.method==='GET'));
 }finally{f.close();}
});
