'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,dataset,tick}=require('./app-fixture.cjs');
const Content=require('../editor-content.js'),Renderer=require('../space-renderer.js'),Insights=require('../insights.js');
const {JSDOM}=require('jsdom');
test('latest cards show the visible update time, including an older Insight updated today',async t=>{
 const data=JSON.parse(JSON.stringify(dataset)),doc=data.documents.find(d=>d.publishedVersion&&d.versions.length===1),v=doc.versions[0];
 doc.type='Blog';doc.area='insights';v.title='Updated 2025 article';v.createdAt='2025-01-02T09:00:00Z';v.approvedAt=null;v.publishedAt='2026-10-23T11:45:00Z';
 const f=await fixture({sourceMode:true,hash:'#/',dataOverride:data});t.after(f.close);
 const first=f.find('.featured-document');assert.equal(first.querySelector('h3').textContent,v.title);
 const time=first.querySelector('time');assert.equal(time.dateTime,'2026-10-23T11:45:00.000Z');assert.match(time.textContent,/23 Oct 2026.*13:45/);assert.equal(time.dataset.tooltip,'Europe/Warsaw');
 assert.match(first.textContent,/Updated/);assert.equal(f.all('.featured-document').length,3);assert.deepEqual(f.errors,[]);
});
for(const explicit of [false,true])test('landing, Insights, search and reader share '+(explicit?'uploaded':'fallback')+' cover, excerpt and author',async t=>{
 const data=JSON.parse(JSON.stringify(dataset)),doc=data.documents.find(d=>d.publishedVersion&&d.versions.length===1),v=doc.versions[0];
 doc.type='Blog';doc.area='insights';doc.authorId=doc.ownerId='alex';doc.publicationMode='direct-insight';v.title='Consistent blog';v.summary='The same published excerpt in every view.';v.cover=explicit?{src:'/confluence/download/attachments/701/cover.jpg',alt:'Cover'}:null;
 data.documents=[doc];const f=await fixture({sourceMode:true,hash:'#/',dataOverride:data});t.after(f.close);
 const author=data.people.find(p=>p.id==='alex').name;
 const cover=f.find('.feature-media img').getAttribute('src');assert.ok(cover);assert.match(f.find('.featured-document').textContent,new RegExp(author));assert.ok(f.find('.featured-document').textContent.includes(v.summary));
 await f.navigate('#/insights');assert.equal(f.find('.wcs-insights-card img').getAttribute('src'),cover);assert.ok(f.find('.wcs-insights-card').textContent.includes(author));assert.ok(f.find('.wcs-insights-card').textContent.includes(v.summary));assert.equal(f.find('.wcs-insights-card [data-document-views]').dataset.documentViews,doc.id);
 await f.navigate('#/results?type=Blog');assert.equal(f.find('.press-card-cover').getAttribute('src'),cover);assert.ok(f.find('.press-card').textContent.includes(author));assert.ok(f.find('.press-card').textContent.includes(v.summary));
 await f.navigate('#/document/'+doc.id+'?tab=content&version='+v.version);assert.equal(f.find('.insights-cover img').getAttribute('src'),cover);assert.ok(f.find('.detail-page').textContent.includes(v.summary));assert.deepEqual(f.errors,[]);
});
test('native card ID does not change fallback selection; native template uses the same canonical key',()=>{
 const key='wcs-doc-public',options={attachmentPageId:'200',contextPath:'/confluence'},expected=Content.insightCoverUrl(key,options);
 const html=Insights.render({...options,baseUrl:'https://example.test',prefiltered:true,documents:[{id:'701',documentKey:key,type:'Blog',title:'Published',summary:'Excerpt',author:'Author',url:'/page'}]});
 const dom=new JSDOM(html);try{assert.equal(dom.window.document.querySelector('img').getAttribute('src'),expected);assert.equal(dom.window.document.querySelector('[data-document-views]').dataset.documentViews,key);}finally{dom.window.close();}
 const v={version:1,revision:1,status:'Published',title:'Published',summary:'Excerpt',bodyMarkdown:'Content',sections:[],createdBy:'a',publishedAt:'2026-10-23T09:00:00Z',commentsEnabled:false};
 const native=Renderer.renderStorage({id:key,type:'Blog',publicationMode:'direct-blog',area:'insights',authorId:'a',ownerId:'a',publishedVersion:1,versions:[v]},v,[{id:'a',name:'Author'}],{...options,hostStyleFlags:true,operation:'published',readerPageId:'701',readerRootId:'123',readerNativeVersion:1});assert.ok(native.includes(expected.replace(/&/g,'&amp;')));
});
