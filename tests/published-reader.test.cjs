'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Renderer=require('../space-renderer.js'),C=require('../confluence.js'),Search=require('../search.js');
const dom=new JSDOM('');
const people=[{id:'a',name:'Author',initials:'A',role:'Author'}];
function article(){const v={version:2,revision:3,status:'Published',title:'Public article',summary:'Summary',bodyMarkdown:'## Public\n\nVisible content.',sections:[],createdBy:'a',publishedAt:'2026-10-22T10:00:00Z',commentsEnabled:true,governanceReview:{secret:'private decision'}};return {id:'wcs-doc-public',reference:'WCS-BL-123',type:'Blog',area:'insights',publicationMode:'direct-blog',authorId:'a',ownerId:'a',confluencePageId:'600',publishedVersion:2,versions:[{version:1,status:'Draft',bodyMarkdown:'SECRET DRAFT'},v],audit:[{secret:'PRIVATE AUDIT'}]};}
function body(doc=article(),options={}){return Renderer.renderStorage(doc,doc.versions.at(-1),people,{hostStyleFlags:true,operation:'published',readerPageId:'701',readerRootId:'123',readerNativeVersion:4,...options});}
function page(storage=body()){return {id:'701',type:'page',status:'current',space:{key:'WCS'},ancestors:[{id:'123'},{id:'700'}],version:{number:4},body:{storage:{value:storage}}};}
function adapter(p=page()){const calls=[];const fetch=async(input,init)=>{const u=new URL(input);calls.push({u,init});if(u.pathname.endsWith('/user/current'))return new Response(JSON.stringify({type:'known',username:'reader',userKey:'reader'}));if(u.pathname.endsWith('/content/123'))return new Response(JSON.stringify({id:'123',type:'page',space:{key:'WCS'}}));assert.equal(u.pathname,'/confluence/rest/api/content/701');return new Response(JSON.stringify(p));};return {calls,client:C.create({mode:'confluence',rootPageId:'123',spaceKey:'WCS',nativePublication:{enabled:true,workingRootPageId:'600',insightsPageId:'700',areaPageIds:{loans:'400'}}},{fetch,location:{href:'https://example.test/confluence/pages/viewpage.action?pageId=123'},search:Search,DOMParser:dom.window.DOMParser})};}
test('published reader uses only public native body and excludes working versions, mappings and audit',async()=>{
 const f=adapter();const result=await f.client.loadPublishedArticle('701');const d=result.document;
 assert.equal(d.publicReader,true);assert.equal(d.publishedConfluencePageId,'701');assert.equal(d.publishedConfluencePageVersion,4);
 assert.equal(d.confluencePageId,undefined);assert.equal(d.versions.length,1);assert.equal(d.versions[0].title,'Public article');assert.deepEqual(d.audit,[]);
 assert.equal(d.versions[0].governanceReview,undefined);assert.doesNotMatch(body(),/SECRET DRAFT|PRIVATE AUDIT|private decision/);
 assert.ok(f.calls.every(c=>c.init.method==='GET'));assert.equal(f.calls.some(c=>c.u.pathname.includes('/600')),false);
});
test('reader rejects working trees, different spaces, wrong destination and duplicated or missing snapshots',async()=>{
 for(const change of [p=>p.ancestors=[{id:'123'},{id:'600'}],p=>p.space.key='OTHER',p=>p.version.number++,p=>p.ancestors=[{id:'123'},{id:'400'}],p=>p.body.storage.value+=p.body.storage.value,p=>p.body.storage.value='<p>Legacy article</p>']){const p=page();change(p);await assert.rejects(adapter(p).client.loadPublishedArticle('701'));}
});
test('reader metadata cannot close its inert script and media points at the publication',async()=>{
 const d=article(),v=d.versions.at(-1);v.title='</script><script>alert(1)</script>';v.cover={src:'/confluence/download/attachments/600/cover.png?version=1',alt:'Cover'};
 const html=body(d,{media:{$cover:{fileName:'cover.png',url:'/confluence/download/attachments/701/cover.png?version=1',sourceUrl:v.cover.src}}});
 const r=await adapter(page(html)).client.loadPublishedArticle('701');assert.equal(r.document.versions[0].title,v.title);assert.match(r.document.versions[0].cover.src,/attachments\/701\//);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
test.after(()=>dom.window.close());

test('native discovery cards share the published reader metadata without per-card requests',async()=>{
 const doc=article();doc.versions.at(-1).cover={src:'/confluence/download/attachments/701/cover.jpg',alt:'Cover'};
 const p=page(body(doc,{media:{$cover:{fileName:'cover.jpg',url:doc.versions.at(-1).cover.src,sourceUrl:doc.versions.at(-1).cover.src}}}));p.title='Public article · WCS 701';p.metadata={labels:{results:['wcs-published','wcs-reader','wcs-type-blog','wcs-area-insights'].map(name=>({name}))}};
 const calls=[];const client=C.create({mode:'confluence',authoringMode:'confluence-session',rootPageId:'123',spaceKey:'WCS',nativePublication:{enabled:true,workingRootPageId:'600',insightsPageId:'700',areaPageIds:{loans:'400'}}},{crypto:require('node:crypto').webcrypto,location:{href:'https://example.test/confluence/pages/viewpage.action?pageId=123'},DOMParser:dom.window.DOMParser,search:Search,fetch:async(input,init)=>{
  const u=new URL(input);calls.push(u);
  if(u.pathname.endsWith('/user/current'))return Response.json({type:'known',username:'reader',userKey:'reader'});
  if(u.pathname.endsWith('/content/123'))return Response.json({id:'123',type:'page',space:{key:'WCS'}});
  if(u.pathname.endsWith('/content/701'))return Response.json(p);
  if(u.pathname.includes('/content/701/property/'))return Response.json({}, {status:404});
  if(u.pathname.endsWith('/child/page')||u.pathname.endsWith('/content/search'))return Response.json({results:[p],start:0,limit:9,size:1});
  throw Error('Unexpected request '+u.pathname);
 }});
 for(const options of [{scope:'tree',limit:9},{scope:'tree',insights:true,nativeChildren:true,types:['Blog'],limit:9}]){
  const result=await client.searchPages(options),row=result.results[0];assert.equal(row.summary,'Summary');assert.equal(row.author,'Author');assert.equal(row.documentKey,doc.id);assert.equal(row.cover.src,doc.versions.at(-1).cover.src);assert.match(row.url,/#\/published\/701$/);
 }
 assert.ok(!calls.some(u=>u.pathname.endsWith('/701')),'No per-card metadata requests');
 const start=calls.length,counts=await client.loadMetrics([doc.id]);assert.equal(counts[doc.id],0);assert.equal(calls.slice(start).length,2);assert.ok(!calls.slice(start).some(u=>u.pathname.includes('helpfulness')||u.pathname.includes('/user/')));assert.ok(calls.filter(u=>u.pathname.endsWith('/content/search')).every(u=>u.searchParams.get('expand').includes('body.storage')));
});
