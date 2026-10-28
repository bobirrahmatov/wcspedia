'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'article-discussion.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'article-discussion.css'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((r,j) => {resolve=r;reject=j;}); return {promise,resolve,reject}; }
const comment = {id:'101', text:'Helpful guidance.', author:{displayName:'Alex Smith'},createdAt:'2026-10-01T12:00:00Z'};
function fixture(options={}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="article"></div></body></html>', {url:'https://example.test/confluence/pages/viewpage.action?pageId=20',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window, d = w.document, calls = [], notices=[];
  let observer;
  if(options.observer) w.IntersectionObserver = class {constructor(fn){observer={fn,disconnected:false};} observe(){} disconnect(){observer.disconnected=true;}};
  w.WCSNotifications=Object.fromEntries(['success','warning','error'].map(kind=>[kind,text=>notices.push([kind,text])]));
  const adapter={load:async request=>{calls.push(['load',request]);return {comments:[comment],nextCursor:null,canComment:true,user:{displayName:'Bob Rahmatov'}};},create:async request=>{calls.push(['create',request]);return {...comment,id:'102',text:request.text};},...options.adapter};
  w.eval(source);const api = w.WCSArticleDiscussion.mount(d.getElementById('article'),{adapter,lazy:options.lazy===undefined?false:options.lazy,feedback:options.feedback,nativeCommentsUrl:options.nativeCommentsUrl||'/confluence/pages/viewpage.action?pageId=20&wcsNativeUi=1#comments',...options.mount});
  const q=selector=>d.querySelector(selector);
  function draft(text) {q('textarea').value=text;q('textarea').dispatchEvent(new w.Event('input',{bubbles:true}));}
  function submit(){q('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
  return {w,d,q,api,calls,notices,draft,submit,observer:()=>observer,close(){api.destroy();dom.window.close();}};
}
test('lazy mount makes no request until near viewport and duplicate mounts reuse controller',async()=>{
 const f=fixture({lazy:true,observer:true});try{
 assert.equal(f.calls.length,0); assert.equal(f.q('form').hidden,true);
 assert.equal(f.w.WCSArticleDiscussion.mount(f.d.getElementById('article'),{adapter:{}}),f.api);
 f.observer().fn([{isIntersecting:true}]);await tick();assert.equal(f.calls.length,1);assert.equal(f.observer().disconnected,true);
 }finally{f.close();}
});
test('plain text comments and authors render safely; CSS hidden rules beat component display rules',async()=>{
 const f=fixture({adapter:{load:async()=>({comments:[{...comment,text:'<img src=x onerror=alert(1)>\n<script>bad()</script>',author:{displayName:'<svg/onload=bad()>'}}],canComment:true,user:{displayName:'User'}})}});try{await tick();
 assert.equal(f.q('.wcs-discussion-body').textContent,'<img src=x onerror=alert(1)>\n<script>bad()</script>');assert.equal(f.q('.wcs-discussion-list img,.wcs-discussion-list script,.wcs-discussion-list svg'),null);
 assert.match(css,/\[hidden\]\[hidden\]\{display:none!important\}/);assert.equal(f.q('.wcs-discussion-helpful').hidden,true);
 assert.equal(f.q('.wcs-discussion-card .wcs-discussion-quiet'),null,'native top-level posting does not advertise unsupported replies');
 }finally{f.close();}
});
test('posting updates list immediately, deduplicates submits, confirms without reload or draft loss',async()=>{
 const request=deferred();let writes=0;const f=fixture({adapter:{create:async data=>{writes++;await request.promise;return {...comment,id:'102',text:data.text};}}});try{await tick();f.draft('New contribution');f.submit();
 assert.equal(f.q('.wcs-discussion-pending .wcs-discussion-body').textContent,'New contribution');assert.equal(f.q('textarea').value,'New contribution');assert.equal(f.q('textarea').readOnly,true);assert.equal(f.q('button[type=submit]').disabled,true);
 assert.equal(f.q('button[type=submit]').getAttribute('aria-busy'),'true');f.submit();assert.equal(writes,1);request.resolve();await tick();assert.equal(f.q('.wcs-discussion-pending'),null);assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,2);assert.equal(f.q('textarea').value,'');assert.equal(f.q('button[type=submit]').getAttribute('aria-busy'),'false');assert.equal(f.w.location.href,'https://example.test/confluence/pages/viewpage.action?pageId=20');assert.deepEqual(f.notices,[['success','Comment posted.']]);
 }finally{f.close();}
});
test('definite rejection rolls back optimistic row and preserves editable draft',async()=>{
 const f=fixture({adapter:{create:async()=>{throw Object.assign(new Error('Forbidden'),{outcome:'rejected'});}}});try{await tick();f.draft('Keep me');f.submit();await tick();
 assert.equal(f.q('.wcs-discussion-pending'),null);assert.equal(f.q('textarea').value,'Keep me');assert.equal(f.q('textarea').readOnly,false);assert.equal(f.q('button[type=submit]').disabled,false);assert.match(f.q('.wcs-discussion-message').textContent,/not posted/);
 }finally{f.close();}
});
test('uncertain save retains pending comment and blocks duplicate retry while allowing safe read and native fallback',async()=>{
 let writes=0;const f=fixture({adapter:{create:async()=>{writes++;throw Object.assign(new Error('Network lost'),{outcome:'unknown'});}}});try{await tick();f.draft('May already exist');f.submit();await tick();
 assert.match(f.q('.wcs-discussion-pending-label').textContent,/Awaiting/);assert.equal(f.q('button[type=submit]').getAttribute('aria-busy'),'false','Uncertain outcome must not spin forever');assert.equal(f.q('button[type=submit]').disabled,true);assert.equal(f.q('textarea').value,'May already exist');f.submit();assert.equal(writes,1);
 const check=Array.from(f.d.querySelectorAll('button')).find(b=>b.textContent==='Check comments');check.click();await tick();assert.equal(f.calls.length,2);assert.equal(writes,1);assert.equal(f.q('.wcs-discussion-native-link').target,'_blank');assert.match(f.q('.wcs-discussion-native-link').href,/wcsNativeUi=1/);
 }finally{f.close();}
});
test('comment reads are bounded by requested cursor, deduplicated and retry does not post',async()=>{
 let reads=0;const f=fixture({adapter:{load:async request=>{reads++;if(reads===1)return {comments:[comment],nextCursor:20,canComment:false};if(reads===2)throw Error('offline');assert.equal(request.cursor,20);return {comments:[comment,{...comment,id:'103'}],nextCursor:null,canComment:false};}}});try{await tick();
 assert.equal(f.q('form').hidden,true);f.q('.wcs-discussion-list').parentNode.querySelectorAll('button').forEach(b=>{if(b.textContent==='Load more comments')b.click();});await tick();assert.match(f.q('.wcs-discussion-message').textContent,/could not/);assert.equal(f.q('.wcs-discussion-item').dataset.commentId,'101');
 Array.from(f.d.querySelectorAll('button')).find(b=>b.textContent==='Load more comments').click();await tick();assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,2);assert.equal(f.q('form').hidden,true);
 }finally{f.close();}
});
test('feedback is authorized and configured, optimistic selection is rolled back on definite error',async()=>{
 const saved=deferred();const f=fixture({feedback:{load:async()=>({canVote:true,vote:null}),save:()=>saved.promise}});try{await tick();assert.equal(f.q('.wcs-discussion-helpful').hidden,false);f.q('[data-vote=yes]').click();
 assert.equal(f.q('[data-vote=yes]').getAttribute('aria-pressed'),'true');assert.equal(f.q('[data-vote=no]').disabled,true);assert.equal(f.q('.wcs-discussion-vote-status').textContent,'Saving…');saved.reject({outcome:'rejected'});await tick();assert.equal(f.q('[data-vote=yes]').getAttribute('aria-pressed'),'false');assert.match(f.q('.wcs-discussion-vote-status').textContent,/not saved/);assert.equal(f.q('[data-vote=yes]').disabled,false);
 }finally{f.close();}
});
test('successful feedback uses authoritative state; forbidden feedback stays hidden',async()=>{
 const f=fixture({feedback:{load:async()=>({canVote:true,vote:null}),save:async value=>({canVote:true,vote:value})}});try{await tick();f.q('[data-vote=no]').click();await tick();assert.match(f.q('.wcs-discussion-vote-status').textContent,/Thank you/);assert.equal(f.q('[data-vote=no]').getAttribute('aria-pressed'),'true');}finally{f.close();}
 const denied=fixture({feedback:{load:async()=>({canVote:false,vote:null}),save:async()=>{throw Error('must not call');}}});try{await tick();assert.equal(denied.q('.wcs-discussion-helpful').hidden,true);}finally{denied.close();}
});
test('destroy aborts outstanding reads and ignores late replies without notification or remount',async()=>{
 const request=deferred();let signal;const f=fixture({adapter:{load:async options=>{signal=options.signal;return request.promise;}}});await tick();f.api.destroy();assert.equal(signal.aborted,true);request.resolve({comments:[comment],canComment:true});await tick();assert.equal(f.q('.wcs-article-discussion'),null);assert.equal(f.notices.length,0);f.close();
});
test('failed load offers same-origin native fallback and does not expose a cross-origin URL',async()=>{
 const f=fixture({adapter:{load:async()=>{throw Error('offline');}},nativeCommentsUrl:'https://other.example/steal'});try{await tick();assert.equal(f.q('.wcs-discussion-native-link'),null);assert.match(f.q('.wcs-discussion-message').textContent,/could not/);}finally{f.close();}
});
test('late background read cannot erase a comment confirmed after that read started',async()=>{
 const reading=deferred();let reads=0;
 const f=fixture({adapter:{load:async()=>{reads++;if(reads===1)return {comments:[comment],canComment:true};return reading.promise;}}});try{await tick();const refresh=f.api.load();await tick();f.draft('Arrived while refreshing');f.submit();await tick();
 assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,2);
 reading.resolve({comments:[comment],canComment:true});await refresh;
 assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,2);assert.match(f.q('.wcs-discussion-list').textContent,/Arrived while refreshing/);
 }finally{f.close();}
});
test('onLoaded only runs after success and its callback cannot break comments',async()=>{
 let loaded=0;const f=fixture({mount:{onLoaded(){loaded++;throw Error('theme failed');}}});try{await tick();assert.equal(loaded,1);assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,1);assert.doesNotMatch(f.q('.wcs-discussion-message').textContent,/could not/);}finally{f.close();}
});
test('uncertain helpfulness blocks duplicate posts and preserves confirmed vote',async()=>{
 let writes=0;const f=fixture({feedback:{load:async()=>({canVote:true,vote:'yes'}),save:async()=>{writes++;throw {outcome:'unknown'};}}});try{await tick();f.q('[data-vote=no]').click();await tick();assert.equal(f.q('[data-vote=yes]').getAttribute('aria-pressed'),'true');assert.equal(f.q('[data-vote=no]').disabled,true);f.q('[data-vote=no]').click();assert.equal(writes,1);assert.match(f.q('.wcs-discussion-vote-status').textContent,/interrupted/);}finally{f.close();}
});
test('native denial disables posting but preserves a copyable draft and native recovery',async()=>{
 let writes=0;const f=fixture({adapter:{create:async()=>{writes++;throw {code:'FORBIDDEN',outcome:'rejected'};}}});try{await tick();assert.equal(f.q('.wcs-discussion-native-link'),null);f.draft('Copy this draft');f.submit();await tick();assert.equal(f.q('form').hidden,false);assert.equal(f.q('textarea').readOnly,true);assert.equal(f.q('textarea').value,'Copy this draft');assert.equal(f.q('button[type=submit]').hidden,true);f.submit();assert.equal(writes,1);assert.match(f.q('.wcs-discussion-message').textContent,/did not allow/);assert.ok(f.q('.wcs-discussion-message .wcs-discussion-native-link'));}finally{f.close();}
});
test('the composer appears before the discussion and successful reads need no native escape link',async()=>{
 const read=deferred();const f=fixture({adapter:{load:()=>read.promise}});try{
 assert.equal(f.q('form').hidden,true,'posting is unavailable until identity and permission response');
 read.resolve({comments:[comment],canComment:true,user:{displayName:'Authenticated reader'}});await tick();
 assert.equal(f.q('form').hidden,false);assert.equal(f.q('.wcs-discussion-intro').nextElementSibling,f.q('form'));
 assert.ok(f.q('form').compareDocumentPosition(f.q('.wcs-discussion-list'))&f.w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(f.q('.wcs-discussion-native-link'),null);assert.equal(f.q('.wcs-discussion-heading a'),null);
 }finally{f.close();}
});
test('SVG reactions keep text labels, expose selection, and submit only the supported yes/no values',async()=>{
 const writes=[];const saving=deferred();const f=fixture({feedback:{load:async()=>({canVote:true,vote:null}),save:async value=>{writes.push(value);await saving.promise;return {canVote:true,vote:value};}}});try{await tick();
 const yes=f.q('[data-vote=yes]'),no=f.q('[data-vote=no]');
 assert.equal(yes.textContent,'Helpful');assert.equal(no.textContent,'Not helpful');
 assert.equal(yes.getAttribute('aria-label'),'Helpful');assert.equal(no.getAttribute('aria-label'),'Not helpful');
 assert.equal(yes.getAttribute('aria-pressed'),'false');assert.equal(no.getAttribute('aria-pressed'),'false');
 assert.equal(f.q('.wcs-discussion-helpful').parentNode,f.q('.wcs-discussion-heading'));
 for(const svg of f.d.querySelectorAll('.wcs-discussion-reaction svg')){
   assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
   assert.deepEqual(Array.from(svg.children,n=>n.localName),['circle','circle','circle','path']);
   for(const node of [svg,...svg.children])for(const name of node.getAttributeNames())assert.ok(!/^on|href$/i.test(name));
 }
 no.click();assert.equal(no.getAttribute('aria-pressed'),'true');assert.equal(yes.getAttribute('aria-pressed'),'false');assert.equal(no.disabled,true);no.click();assert.deepEqual(writes,['no']);
 saving.resolve();await tick();assert.equal(no.disabled,false);no.click();assert.deepEqual(writes,['no'],'selecting the current reaction must not write again');
 yes.click();await tick();assert.deepEqual(writes,['no','yes']);assert.equal(yes.getAttribute('aria-pressed'),'true');assert.equal(no.getAttribute('aria-pressed'),'false');
 }finally{f.close();}
});
test('reactions have distinct selected colors and reduced-motion handling without comment side bars',async()=>{
 const f=fixture({feedback:{load:async()=>({canVote:true,vote:'yes'}),save:async value=>({canVote:true,vote:value})}});try{await tick();
 const style=f.d.createElement('style');style.textContent=css;f.d.head.append(style);
 assert.equal(f.w.getComputedStyle(f.q('[data-vote=yes]')).color,'rgb(25, 107, 59)');
 f.q('[data-vote=no]').click();await tick();assert.equal(f.w.getComputedStyle(f.q('[data-vote=no]')).color,'rgb(170, 60, 50)');
 assert.doesNotMatch(css,/border-left\s*:/);assert.doesNotMatch(css,/wcs-discussion-item:not\(:last-child\):before/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\).*animation:none!important/);
 }finally{f.close();}
});
test('confirmed external comment merges only into its document without reloading or disturbing the composer',async()=>{
 const f=fixture({mount:{pageId:'20'}});try{await tick();f.draft('Keep this unsent draft');f.q('textarea').focus();
 const initial=f.calls.length,received={...comment,id:'201',pageId:'20',text:'Suggestion <script>literal</script>',author:{id:'native-user',displayName:'Reader'}};
 const emit=(pageId,value)=>f.w.dispatchEvent(new f.w.CustomEvent('wcs:article-comment-created',{detail:{pageId,comment:value}}));
 emit('30',received);emit('20',{...received,pageId:'30'});emit('20',{...received,pending:true});assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,1);
 emit('20',received);emit('20',received);assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,2);assert.equal(f.calls.length,initial);assert.equal(f.q('textarea').value,'Keep this unsent draft');assert.equal(f.d.activeElement,f.q('textarea'));assert.equal(f.q('.wcs-discussion-list script'),null);assert.match(f.q('.wcs-discussion-list').textContent,/Suggestion <script>literal/);
 f.api.destroy();emit('20',{...received,id:'202'});assert.equal(f.q('.wcs-article-discussion'),null);
 }finally{f.close();}
});
test('external suggestion does not erase a pending comment and survives a read started before its confirmation',async()=>{
 const read=deferred(),write=deferred();let reads=0;
 const f=fixture({mount:{pageId:'20'},adapter:{load:async()=>++reads===1?{comments:[comment],canComment:true}:read.promise,create:()=>write.promise}});try{await tick();const refreshing=f.api.load();await tick();f.draft('A separate comment');f.submit();
 f.w.dispatchEvent(new f.w.CustomEvent('wcs:article-comment-created',{detail:{pageId:'20',comment:{...comment,id:'202',pageId:'20',text:'Confirmed suggestion',author:{id:'native-user'}}}}));
 assert.equal(f.q('.wcs-discussion-pending .wcs-discussion-body').textContent,'A separate comment');assert.equal(f.q('textarea').value,'A separate comment');assert.equal(f.q('textarea').readOnly,true);
 read.resolve({comments:[comment],canComment:true});await refreshing;assert.match(f.q('.wcs-discussion-list').textContent,/Confirmed suggestion/);assert.equal(f.q('textarea').value,'A separate comment');
 write.resolve({...comment,id:'203',text:'A separate comment'});await tick();assert.equal(f.d.querySelectorAll('.wcs-discussion-item').length,3);
 }finally{f.close();}
});
