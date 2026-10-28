'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const renderer=require('../space-renderer.js'),content=require('../editor-content.js');
function article(type='Blog'){
 const version={version:1,revision:1,title:'Article <title>',summary:'A concise introduction.',status:'Published',createdAt:'2026-10-22T10:00:00Z',publishedAt:'2026-10-22T11:00:00Z',createdBy:'author',bodyMarkdown:'## A section\n\n**Readable** body.\n\n```js\nconst x = 1 < 2;\n```\n\n<script>window.injected=true</script>',assets:[],attachments:[]};
 const doc={id:'wcs-doc-article',type,area:'insights',publicationMode:content.publicationModeFor(type),ownerId:'author',authorId:'author',publishedVersion:1,versions:[version]};
 return {doc,version};
}
function rendered(type){const f=article(type);return renderer.renderStorage(f.doc,f.version,[{id:'author',name:'Article author'}],{operation:'published',hostStyleFlags:true});}
function parse(source){return new JSDOM('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">'+source+'</root>',{contentType:'text/xml'});}
test('all four published Insights types receive one article heading, hidden metadata and a non-executable styling marker',()=>{
 for(const type of ['Guide','Blog','Training','Report']){
  const html=rendered(type),dom=parse(html);try{
   assert.equal(dom.window.document.querySelectorAll('.wcs-native-article h1').length,1);
   assert.ok(dom.window.document.querySelector('.wcs-native-article-layout > .wcs-native-article-body'));
   assert.ok(dom.window.document.querySelector('.wcs-native-article-layout > .wcs-native-article-control'));
   assert.ok(dom.window.document.querySelector('.wcs-native-article-art'));
   assert.doesNotMatch(html,/WCS_CONFIG|id="wcspedia"|navBar|hide-sidebar/);
   assert.equal(dom.window.document.querySelector('h1').textContent,'Article <title>');
   assert.match(html,/ac:name="id">wcspedia-document<\/ac:parameter><ac:parameter ac:name="hidden">true/);
   assert.match(html,/Document key.*wcs-doc-article/);
   assert.match(html,/ac:name="code"/);assert.match(html,/&lt;script&gt;window.injected=true/);
   assert.match(html,/wcs-comments-v1-/);assert.match(html,/wcs-page-style-v1/);
   assert.equal((html.match(/ac:name="html"/g)||[]).length,0);
   assert.doesNotMatch(html,/citiStyleAdd|citiStyleRemove|<script>/);
  }finally{dom.window.close();}
 }
});
test('existing article snippet is a passive marker, without a script or host-theme dependency',()=>{
 const snippet=fs.readFileSync(require('node:path').join(__dirname,'../page-style-flags-marker.html'),'utf8');
 assert.doesNotMatch(snippet,/<script|citiStyleAdd|citiStyleRemove/);
 const dom=new JSDOM(snippet);try{assert.equal(dom.window.document.querySelector('[data-wcs-document-page]').getAttribute('data-wcs-style-flags'),'hide-title hide-comments hide-actions hide-footer');}finally{dom.window.close();}
});

test('sidebar loader belongs to published articles only and accepts only the configured attachment path',()=>{
 const f=article(),url='/confluence/download/attachments/3962195316/wcspedia-reader-sidebar.js?api=v2';
 const options={operation:'published',hostStyleFlags:true,readerSidebarUrl:url};
 const html=renderer.renderStorage(f.doc,f.version,[],options),dom=parse(html);
 try {assert.match(html,/ac:name="html"/);assert.ok(html.includes('<script defer src="'+url+'"></script>'));assert.equal(dom.window.document.querySelectorAll('.wcs-native-article').length,1);}finally{dom.window.close();}
 assert.doesNotMatch(renderer.renderStorage(f.doc,f.version,[],{...options,operation:'working'}),/wcspedia-reader-sidebar/);
 assert.throws(()=>renderer.renderStorage(f.doc,f.version,[],{...options,readerSidebarUrl:'https://external.test/sidebar.js'}),/same-origin/);
});
