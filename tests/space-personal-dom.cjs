/* NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/space-personal-dom.cjs */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<main id="wcspedia"><h1>Article</h1><p>Example content</p><div id="inbox"></div></main>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=201',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,root=w.document.getElementById('wcspedia'),tick=()=>new Promise(done=>setTimeout(done,0)),calls=[];let commentsEnabled=true,postStatus=200,lostResponse=false,stored=null;
w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.HTMLElement.prototype.scrollIntoView=function(){};
const user={type:'known',userKey:'user-1',username:'br47149',displayName:'Example reader'};
const page=id=>({id,type:'page',status:'current',space:{key:'wcspedia'},ancestors:id==='100'?[]:[{id:'100'},{id:'200'}],body:{storage:{value:'<p>Example</p><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">wcs-comments-v1-'+(commentsEnabled?'enabled':'disabled')+'</ac:parameter></ac:structured-macro>'}},operations:[],title:'Article'});
w.fetch=async(url,init)=>{
  calls.push({url,init});const u=new URL(url);let body,status=200;
  if(u.pathname.endsWith('/user/current'))body=user;
  else if(init.method==='POST'){
    const command=JSON.parse(init.body);assert.equal(command.type,'comment');assert.deepEqual(command.container,{id:'201',type:'page'});assert.equal(command.history,undefined);assert.equal(command.version,undefined);
    status=postStatus;body={id:'401',type:'comment',status:'current',container:{id:'201',type:'page'},history:{createdBy:user,createdDate:'2026-10-17T10:00:00.000Z'},body:{view:{value:command.body.storage.value}}};stored=body;if(lostResponse)throw Error('Connection dropped after native write');
  }else if(u.pathname.endsWith('/child/comment'))body={results:stored?[stored]:[],start:0,_links:{}};
  else body=page(u.pathname.split('/').at(-1));
  return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)};
};
for(const file of ['ui.js','pagination.js','data-table.js','article-comments.js','space-personal.js','suggestions.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const config={mode:'confluence',authoringMode:'confluence-session',contextPath:'/confluence',rootPageId:'100',spaceKey:'wcspedia',nativePublication:{areaPageIds:{credit:'200'},workingRootPageId:'900',insightsPageId:'300'}};
const notices=[],widget=w.WCSSuggestions.mount({root,config,getActor:()=>({id:'br47149',name:'Reader'}),getContext:()=>({title:'Article',url:w.location.href,documentId:'doc-1',nativePageId:'201'}),notify:message=>notices.push(message)});
const submit=form=>form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('[type=submit]')}));
async function open(){widget.open();await tick();await tick();return root.querySelector('.suggestion-form');}
(async()=>{
  const initialCalls=calls.length;await tick();assert.equal(calls.length,initialCalls,'native suggestion widget never requests a global queue on page load');
  let form=await open();assert.equal(form.querySelector('[type=submit]').disabled,false);assert.match(form.querySelector('.suggestion-delivery').textContent,/comment.*Confluence account/);
  form.elements.correction.value='<img src=x onerror=alert(1)>';form.elements.reason.value='Update the example.';submit(form);await tick();await tick();
  const command=JSON.parse(calls.find(c=>c.init.method==='POST').init.body);assert.match(command.body.storage.value,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(command.body.storage.value,/<img/);assert.equal(root.querySelector('[role=dialog]'),null);assert.match(notices.at(-1),/posted to the document comments/);assert.equal(w.location.href,'https://example.test/confluence/pages/viewpage.action?pageId=201');
  commentsEnabled=false;form=await open();assert.equal(form.querySelector('[type=submit]').disabled,true);assert.match(form.querySelector('.suggestion-delivery').textContent,/disabled/);assert.equal(form.querySelector('[data-suggestion-copy]').disabled,false);form.querySelector('[data-suggestion-cancel]').click();
  commentsEnabled=true;lostResponse=true;form=await open();form.elements.correction.value='Follow-up';form.elements.reason.value='A new correction';submit(form);await tick();await tick();assert.equal(form.querySelector('[type=submit]').textContent,'Check submission');assert.equal(form.elements.correction.value,'Follow-up');const before=calls.filter(c=>c.init.method==='POST').length;submit(form);await tick();await tick();assert.equal(calls.filter(c=>c.init.method==='POST').length,before);assert.equal(root.querySelector('[role=dialog]'),null);
  const inbox=w.WCSSuggestions.mountInbox(w.document.getElementById('inbox'),{service:widget.service,scope:'review'});assert.match(w.document.getElementById('inbox').textContent,/Suggestions stay with their document/);assert.equal(root.querySelector('[data-suggestion-filter]'),null);inbox.destroy();widget.destroy();w.WCSUI.destroy(root);
  console.log('PASS native suggestion DOM: current-session escaped comment, permission preflight, copy fallback, no reload/queue, unknown-outcome reconciliation');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
