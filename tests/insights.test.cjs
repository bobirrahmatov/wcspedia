'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const insights=require('../insights.js');
const baseUrl='https://example.test/confluence/pages/viewpage.action?pageId=10';
const documents=[
 {id:'1',type:'Blog',title:'Credit learning',summary:'A simpler approval process.',tags:['Credit','Learning'],area:'credit',updatedAt:'2026-10-12T23:00:00Z',url:'/confluence/pages/viewpage.action?pageId=1',cover:{src:'/confluence/download/attachments/1/cover.png'},author:{name:'Alex'}},
 {id:'2',type:'Knowledge sharing',title:'Team lessons',summary:'What our team learned.',tags:['Learning'],area:'credit',updatedAt:'2026-10-13T10:00:00Z',url:'#/document/2'},
 {id:'3',type:'Reference',title:'Credit reference',summary:'Useful information.',tags:['Credit'],updatedAt:'2026-10-01',url:'/confluence/pages/viewpage.action?pageId=3'},
 {id:'4',type:'Procedure',title:'Operational procedure',tags:['Operations'],url:'#/document/4'},
 {id:'5',type:'Blog',title:'Unapproved story',status:'Draft',tags:['Draft'],url:'#/document/5'},
 {id:'6',type:'Blog',title:'Deleted story',deletedAt:'2026-10-01',url:'#/document/6'}
];
function dom(options={}){return new JSDOM('<div id="wcspedia">'+insights.render({baseUrl,documents,...options})+'</div>',{url:baseUrl,pretendToBeVisual:true});}
test('eligible published types are deduplicated, sorted newest first and bounded without mutating data',()=>{
 const snapshot=JSON.stringify(documents),value=insights.select({documents:[...documents,documents[0]],limit:2});
 assert.deepEqual(value.items.map(d=>d.id),['2','1']);assert.equal(value.total,4);assert.equal(value.hasMore,true);
 assert.deepEqual(value.topics,['Credit','Learning','Operations']);assert.equal(JSON.stringify(documents),snapshot);
});
test('type/topic filters are exact and search requires every word; foreign topics do not match',()=>{
 assert.deepEqual(insights.select({documents,filter:{type:'blog',topic:'credit',q:'approval learning'}}).items.map(d=>d.id),['1']);
 assert.equal(insights.select({documents,filter:{topic:'Cred'}}).total,0);
 assert.equal(insights.select({documents,filter:{type:'Unrecognised'}}).total,0);
 assert.equal(insights.select({documents,filter:{q:'credit missing'}}).total,0);
});
test('caller controls eligible generic types without inventing another taxonomy',()=>{
 assert.deepEqual(insights.select({documents,types:['Procedure'],filter:{}}).items.map(d=>d.id),['4']);
 assert.deepEqual(insights.select({documents,types:[]}).items,[]);
});
test('all untrusted content is escaped and unsafe image/navigation sources do not render',()=>{
 const unsafe={id:'<script>',type:'Blog',title:'<img src=x onerror=alert(1)>',summary:'<script>no()</script>',tags:['<b>topic</b>'],url:'javascript:alert(1)',cover:'https://tracker.test/image',author:'<svg/onload=bad()>'};
 const d=dom({documents:[unsafe],error:'<script>bad()</script>'});try{
 assert.equal(d.window.document.querySelector('script,img[src*="tracker.test"]'),null);assert.match(d.window.document.querySelector('h2').textContent,/<img/);
 assert.equal(d.window.document.querySelector('.wcs-insights-card a'),null);assert.equal(d.window.document.querySelector('.wcs-insights-error').textContent,'<script>bad()</script>Try again');
 }finally{d.window.close();}
});
test('same-origin article covers are lazy, decorative and have stable landscape dimensions and inline SVG fallback',()=>{
 const d=dom();try{
 const img=d.window.document.querySelector('img');assert.equal(img.getAttribute('loading'),'lazy');assert.equal(img.alt,'');assert.equal(img.width,800);assert.equal(img.height,500);
 assert.equal(d.window.document.querySelectorAll('img').length,4);assert.equal(d.window.document.querySelectorAll('.wcs-insights-card--text').length,3);
 assert.equal(d.window.document.querySelectorAll('body body,header,meta').length,0);
 }finally{d.window.close();}
});
test('Insights omits analytics for all roles and leaves creation to the shared header',()=>{
 const no=dom(),yes=dom({canCreate:true,canExport:true});try{
 assert.equal(no.window.document.querySelector('[data-wcs-insights-export],[data-wcs-insights-create]'),null);
 assert.equal(yes.window.document.querySelector('[data-wcs-insights-create]'),null);
 assert.equal(no.window.document.querySelector('.wcs-insights-actions'),null);
 assert.equal(yes.window.document.querySelector('[data-wcs-insights-export]'),null);
 }finally{no.window.close();yes.window.close();}
});
test('native incomplete results never claim an exhaustive total and remote load-more remains available',()=>{
 const d=dom({complete:false,hasMore:true});try{
 assert.match(d.window.document.querySelector('[role=status]').textContent,/4 insights loaded/);
 assert.ok(d.window.document.querySelector('[data-wcs-insights-more]'));
 }finally{d.window.close();}
});
test('empty filters remain visible and offer a reset; empty initial library does not advertise reset',()=>{
 const d=dom({filter:{topic:'Unknown'}}),empty=dom({documents:[]});try{
 assert.equal(d.window.document.querySelector('[data-wcs-insights-topic]').value,'Unknown');assert.ok(d.window.document.querySelector('[data-wcs-insights-reset]'));
 assert.equal(empty.window.document.querySelector('[data-wcs-insights-reset]'),null);
 }finally{d.window.close();empty.window.close();}
});
test('bound search/topic/type controls preserve the other filters, dispatch once and clean up',()=>{
 const d=dom({filter:{type:'Blog',topic:'Credit',q:'approval'}}),w=d.window,host=w.document.getElementById('wcspedia'),calls=[];
 const bind=insights.bind(host,{onFilter:next=>calls.push(next)});
 w.document.querySelector('[data-wcs-insights-type="Report"]').click();
 const select=w.document.querySelector('[data-wcs-insights-topic]');select.value='Learning';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 w.document.querySelector('[name=q]').value=' team ';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.deepEqual(calls,[{type:'Report',topic:'Credit',q:'approval'},{type:'Blog',topic:'Learning',q:'approval'},{type:'Blog',topic:'Credit',q:'team'}]);
 bind.destroy();w.document.querySelector('[data-wcs-insights-type=all]').click();assert.equal(calls.length,3);w.close();
});
test('tab keys move focus without making a request until activation; rebinding removes old listeners',()=>{
 const d=dom(),w=d.window,host=w.document.getElementById('wcspedia');let old=0,next=0;
 insights.bind(host,{onFilter:()=>old++});const bind=insights.bind(host,{onFilter:()=>next++});const all=w.document.querySelector('[data-wcs-insights-type=all]');
 all.focus();all.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
 assert.equal(w.document.activeElement.dataset.wcsInsightsType,'Guide');assert.equal(next,0);
 w.document.activeElement.click();assert.equal(old,0);assert.equal(next,1);bind.destroy();w.close();
});
test('retry and paging hooks are independent from document navigation',()=>{
 const d=dom({canExport:true,error:'Read failed',hasMore:true}),w=d.window,calls=[];
 const bind=insights.bind(w.document.getElementById('wcspedia'),Object.fromEntries(['More','Retry'].map(name=>['on'+name,()=>calls.push(name)])));
 for(const name of ['more','retry'])w.document.querySelector('[data-wcs-insights-'+name+']').click();
 assert.deepEqual(calls,['More','Retry']);bind.destroy();w.close();
});
test('styles stay scoped, inherit host font and supply responsive/reduced-motion behavior',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','insights.css'),'utf8');
 assert.match(css,/#wcspedia \.wcs-insights\{/);assert.match(css,/font-family:inherit!important/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/max-width:520px/);
 assert.doesNotMatch(css,/border-left\s*:|@font-face|https?:|100vh/);
});

test('native CQL body/topic matches survive lightweight metadata rendering without double filtering',()=>{
 const native={id:'7',type:'Blog',title:'Team update',summary:'',tags:[],url:'/confluence/pages/viewpage.action?pageId=7'};
 const options={documents:[native],filter:{q:'a phrase found only in native page body',topic:'label-not-expanded'},prefiltered:true};
 assert.deepEqual(insights.select(options).items.map(d=>d.id),['7']);
 assert.equal(insights.select({...options,prefiltered:false}).total,0);
 assert.equal(insights.select({...options,documents:[{...native,type:'Job aid'}]}).total,0);
});

test('unavailable cover attachments fall back to a readable text card without a broken-image tile',()=>{
 const d=dom(),w=d.window,host=w.document.getElementById('wcspedia'),bind=insights.bind(host,{}),img=w.document.querySelector('[data-wcs-insights-document="1"] img');
 const card=img.closest('.wcs-insights-card');img.dispatchEvent(new w.Event('error'));assert.match(img.getAttribute('src'),/wcs-insight-cover-\d{2}\.jpg/);img.dispatchEvent(new w.Event('error'));assert.equal(card.querySelector('img'),null);assert.ok(card.querySelector('.wcs-insights-placeholder'));assert.equal(card.classList.contains('wcs-insights-card--text'),true);
 assert.match(card.textContent,/Credit learning/);bind.destroy();w.close();
});

test('incremental native pages beyond 100 are not silently hidden by a second rendering cap',()=>{
 const many=Array.from({length:108},(_,i)=>({id:String(i+1),title:'Article '+i,type:'Blog',url:'#/document/'+i}));
 const model=insights.select({documents:many,limit:108,prefiltered:true});assert.equal(model.items.length,108);assert.equal(model.total,108);assert.equal(model.hasMore,false);
});

test('an untyped native batch with more pages does not claim the whole Insights collection is empty',()=>{
 const d=dom({documents:[],hasMore:true});assert.match(d.window.document.querySelector('.wcs-insights-empty').textContent,/this batch/);assert.ok(d.window.document.querySelector('[data-wcs-insights-more]'));d.window.close();
});

test('a search or append has exactly one busy button, never a second tab/search indicator',()=>{
 for(const appending of [false,true]){const d=dom({loading:true,hasMore:true,appending});try{const busy=d.window.document.querySelectorAll('button[aria-busy="true"]');assert.equal(busy.length,1);assert.ok(busy[0].matches(appending?'[data-wcs-insights-more]':'[type=submit]'));}finally{d.window.close();}}
});

test('50 attachment fallback covers are stable per article across sorting/filtering, while explicit covers win',()=>{
 const opts={baseUrl:'https://example.test/confluence/pages/viewpage.action?pageId=1',attachmentPageId:'3962195316',contextPath:'/confluence',limit:500,documents:Array.from({length:500},(_,i)=>({id:'article-'+i,type:'Blog',title:'Article '+i}))};
 const a=new JSDOM(insights.render(opts)),b=new JSDOM(insights.render({...opts,documents:opts.documents.slice().reverse()}));
 try {const seen=new Set();a.window.document.querySelectorAll('[data-wcs-insights-document]').forEach(card=>{const src=card.querySelector('img').getAttribute('src');assert.match(src,/^\/confluence\/download\/attachments\/3962195316\/wcs-insight-cover-\d{2}\.jpg\?api=v2$/);assert.equal(src,b.window.document.querySelector('[data-wcs-insights-document="'+card.dataset.wcsInsightsDocument+'"] img').getAttribute('src'));seen.add(src);});assert.equal(seen.size,50);}
 finally{a.window.close();b.window.close();}
});
