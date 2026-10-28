#!/usr/bin/env node
/* TEST FIXTURE ONLY — local visual QA, not a workflow implementation.
 * Never package/deploy this server or its synthetic records to Confluence.
 * Run: node build.cjs && node build-native.cjs && node tests/native-preview.cjs [--port=4177]
 * Browser: http://127.0.0.1:4177/native-preview.html
 */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const portArg=process.argv.find(value=>value.startsWith('--port='));
const port=Number(portArg?portArg.slice(7):process.env.NATIVE_PREVIEW_PORT||4177);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a port from 1024 to 65535.');
const origin='http://127.0.0.1:'+port,escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const people={owner:{name:'Alex Morgan (sample)',soeid:'AM12345'},team:'Credit operations — sample team'};
const titles=['Credit approval checklist','Preparing a clear handover','Understanding the credit lifecycle','Deal closing essentials','Recorded training: document ownership','Sharing lessons from a complex review','Getting started with loan management','Evidence and reference links','Writing a useful job aid','Reviewing a document revision','A guide to effective knowledge sharing','Quarterly learning highlights'];
const types=['job-aid','guide','training','checklist','training','blog','reference','report','job-aid','guide','knowledge-sharing','blog'];
const regions=['emea','global','nam','apac','global','latam'];
const pages=new Map(),workflow=new Map();let nextId=1001;
function makePage(id,index,working=false){
  const title=titles[index%titles.length]+(index>=titles.length?' · example '+(Math.floor(index/titles.length)+1):'');
  return {id:String(id),type:'page',title,status:'current',space:{key:'WCS'},ancestors:[{id:working?'200':'100'}],version:{number:working?4:3,when:'2026-10-'+String(15-index%10).padStart(2,'0')+'T10:00:00Z',by:{displayName:people.owner.name,username:'am12345',userKey:'sample-author'}},operations:working?[{operation:'update',targetType:'page'}]:[],metadata:{labels:{results:[{name:'wcspedia'},{name:'wcs-type-'+types[index%types.length]},{name:'wcs-region-'+regions[index%regions.length]}]}},body:{view:{value:'<div class="excerpt"><p>Practical guidance for '+title.toLowerCase()+'. This fictional page demonstrates the native WCSpedia reading experience.</p></div><h2>Before you start</h2><p>Confirm the document owner, the intended audience and the source material. This is synthetic demonstration content and contains no operational instructions.</p><h2>What to capture</h2><ol><li>Record the context and supporting evidence.</li><li>Check that the information is clear and current.</li><li>Send the saved revision for independent review.</li></ol><table><thead><tr><th>Record</th><th>Purpose</th></tr></thead><tbody><tr><td>Document owner</td><td>Accountability for the content</td></tr><tr><td>Native version</td><td>Traceability of the saved revision</td></tr><tr><td>Review notes</td><td>Evidence supporting the decision</td></tr></tbody></table><h2>Further reading</h2><p>Open related pages in the native library. Published content remains readable while another revision is being prepared.</p>'}},_links:{base:origin+'/confluence',webui:'/pages/viewpage.action?pageId='+id}};
}
for(let i=0;i<72;i++)pages.set(String(301+i),makePage(301+i,i));
for(let i=0;i<6;i++){pages.set(String(901+i),makePage(901+i,i,true));workflow.set(String(901+i),i%2?'Awaiting approval':'In review');}
function config(role='home',currentPageId){return {contextPath:'/confluence',publishedRootPageId:'100',workingRootPageId:'200',spaceKey:'WCS',nativeWorkflowEndpoint:'/confluence/native-workflow',pageRole:role,...(currentPageId?{currentPageId}:{} )};}
function chrome(title,content,mount,settings=config()){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+' · synthetic WCSpedia preview</title><link rel="stylesheet" href="/wcspedia-style.css"><style>body{margin:0;background:#fff}.preview-tools{font:13px Arial,sans-serif;padding:12px 24px;background:#f5f8fa;border-bottom:1px solid #dce4ec;display:flex;align-items:center;gap:20px;flex-wrap:wrap;color:#5b6c7e}.preview-tools a{color:#17355f;text-decoration:none}.preview-tools strong{font-size:11px;letter-spacing:.5px}.preview-document{max-width:1100px;margin:28px auto;padding:0 24px;font-family:WCSCiti,Arial,sans-serif;color:#17355f;line-height:1.65}.preview-document h1{font-size:40px;font-weight:400;line-height:1.2}.preview-document>article{max-width:820px;margin:36px auto}.preview-document table{border-collapse:collapse;width:100%}.preview-document th,.preview-document td{border:1px solid #dce4ec;padding:12px;text-align:left}.preview-document h2{margin-top:32px;font-weight:400}.preview-handoff{border:1px solid #dce4ec;border-radius:20px;padding:32px;background:#f5f8fa}.preview-tools #native-add{margin-left:auto}</style></head><body><div class="preview-tools"><strong>TEST FIXTURE · SYNTHETIC DATA</strong><a href="/native-preview.html">Library</a><a href="/native-preview.html?role=mine">My workspace</a><a href="/native-preview.html?role=review">Reviewer workspace</a><a href="/native-preview.html?role=saved">Saved items</a><div id="native-add"></div></div>'+content+'<script>window.WCS_NATIVE_CONFIG='+JSON.stringify(settings).replace(/</g,'\\u003c')+';</script><script src="/wcspedia-native.js"></script><script>'+mount+';WCSNativeApp.mountCreateWidget(document.getElementById("native-add"),WCS_NATIVE_CONFIG);</script></body></html>';
}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function html(res,body,status=200){res.writeHead(status,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(body);}
function collection(items,url){const start=Math.max(0,Number(url.searchParams.get('start'))||0),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||12));return {results:items.slice(start,start+limit),start,limit,totalSize:items.length};}
async function readBody(req){let text='';for await(const part of req){text+=part;if(text.length>65536)throw Error('Request too large');}return JSON.parse(text||'{}');}
function nativeScope(page,working){return page.ancestors.some(a=>a.id===(working?'200':'100'));}
function searchPages(url){const cql=url.searchParams.get('cql')||'',working=/ancestor = 200\b/.test(cql);let items=Array.from(pages.values()).filter(page=>nativeScope(page,working));
  const labels=Array.from(cql.matchAll(/label = "(wcs-(?:type|region|area)-[^"\\]+)"/g),match=>match[1]);
  for(const label of labels)items=items.filter(page=>page.metadata.labels.results.some(value=>value.name===label));
  const terms=Array.from(cql.matchAll(/text ~ ("(?:\\.|[^"\\])*")/g),match=>{try{return JSON.parse(match[1]).replace(/^"|"$/g,'').replace(/\\(.)/g,'$1').toLowerCase();}catch{return '';}}).filter(Boolean);
  for(const term of terms)items=items.filter(page=>(page.title+' '+page.body.view.value).toLowerCase().includes(term));
  if(cql.includes('favourite = currentUser()'))items=items.filter(page=>Number(page.id)%3===0);
  if(cql.includes('ORDER BY title ASC'))items.sort((a,b)=>a.title.localeCompare(b.title));else if(cql.includes('ORDER BY lastmodified DESC'))items.sort((a,b)=>b.version.when.localeCompare(a.version.when));return collection(items,url);
}
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),pathname=url.pathname;
  if(pathname==='/'){res.writeHead(302,{Location:'/native-preview.html'});res.end();return;}
  if(pathname==='/native-preview.html'){
    const role=['home','mine','review','saved'].includes(url.searchParams.get('role'))?url.searchParams.get('role'):'home';
    html(res,chrome('Native library','<main id="wcspedia" aria-label="Knowledge library"></main>','WCSNativeApp.mount(document.getElementById("wcspedia"),WCS_NATIVE_CONFIG)',config(role)));return;
  }
  if(pathname==='/wcspedia-native.js'||pathname==='/wcspedia-style.css'||/^\/assets\/(citi-text-(regular|bold)\.ttf|citi-logo\.(png|svg))$/.test(pathname)){
    const file=pathname==='/wcspedia-native.js'?path.join(root,'experimental-native/wcspedia-native.js'):pathname==='/wcspedia-style.css'?path.join(root,'experimental-native/wcspedia-native-style.css'):path.join(root,pathname.slice(1));if(!fs.existsSync(file)){res.writeHead(404);res.end('Build the optional native experiment first.');return;}
    const ext=path.extname(file),type={'.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'}[ext];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return;
  }
  if(pathname==='/confluence/rest/api/content/search'){json(res,searchPages(url));return;}
  if(pathname==='/confluence/rest/api/user/current'){json(res,{type:'known',displayName:people.owner.name,username:'am12345',userKey:'sample-author'});return;}
  const api=pathname.match(/^\/confluence\/rest\/api\/content\/(\d+)(?:\/(property|child\/attachment))?$/);
  if(api){const page=pages.get(api[1]);if(!page){json(res,{message:'Synthetic page not found'},404);return;}if(api[2]==='property'){json(res,{results:[{key:'wcs.metadata',value:{sourcePageVersion:page.version.number,docKey:'WCS-DEMO-'+page.id,owner:people.owner,team:people.team,summary:'A sample '+page.title.toLowerCase()+' resource.',nextReviewDate:'2028-10-15',reviewBasis:'Event-driven; periodic check expected within two years'}}],start:0});return;}if(api[2]==='child/attachment'){json(res,{results:[],start:0});return;}json(res,page);return;}
  if(pathname==='/confluence/native-workflow'){
    if(req.method==='GET'){
      if(url.searchParams.get('view')==='document'){const id=url.searchParams.get('pageId'),page=pages.get(id);if(!page){json(res,{},404);return;}const working=nativeScope(page,true);json(res,{pageId:id,expectedVersion:page.version.number,submissionToken:'synthetic-'+id+'-'+page.version.number,status:workflow.get(id)||(working?'Draft':'Published'),capabilities:{edit:true,submit:working,'complete-review':working,'request-changes':working,approve:working,delete:working}});return;}
      let items=Array.from(pages.values()).filter(page=>nativeScope(page,true));const query=(url.searchParams.get('query')||'').toLowerCase();if(query)items=items.filter(page=>page.title.toLowerCase().includes(query));for(const kind of ['type','region']){const val=url.searchParams.get(kind);if(val)items=items.filter(page=>page.metadata.labels.results.some(label=>label.name==='wcs-'+kind+'-'+val));}if(url.searchParams.get('sort')==='title')items.sort((a,b)=>a.title.localeCompare(b.title));json(res,collection(items.map(page=>({id:page.id})),url));return;
    }
    if(req.method==='POST'){
      const body=await readBody(req);
      if(body.action==='prepare-create'){const id=String(nextId++),page=makePage(id,0,true);page.title=String(body.title||'New sample page');page.metadata.labels.results=[{name:'wcspedia'},{name:'wcs-type-'+String(body.type||'job-aid')},{name:'wcs-region-global'}];page.body.view.value='<h2>New synthetic page</h2><p>This is a native-editor hand-off demonstration. It does not implement a Confluence editor.</p>';pages.set(id,page);json(res,{workingPageId:id});return;}
      if(body.action==='prepare-edit'){let id=String(Number(body.pageId)+600);if(!pages.has(id)){const original=pages.get(String(body.pageId));if(!original){json(res,{},404);return;}const copy=JSON.parse(JSON.stringify(original));copy.id=id;copy.ancestors=[{id:'200'}];copy.operations=[{operation:'update',targetType:'page'}];copy._links.webui='/pages/viewpage.action?pageId='+id;pages.set(id,copy);}json(res,{workingPageId:id});return;}
      if(['submit','complete-review','request-changes','approve','delete'].includes(body.action)){const id=String(body.pageId),page=pages.get(id);if(!page){json(res,{},404);return;}if(page.version.number!==body.expectedVersion){json(res,{},409);return;}if(body.action==='delete')pages.delete(id);else workflow.set(id,{'submit':'In review','complete-review':'Awaiting approval','request-changes':'Changes requested','approve':'Approved (test fixture)'}[body.action]);json(res,{committed:true,action:body.action,pageId:id,eventId:'synthetic-'+Date.now(),testFixture:true});return;}
      json(res,{message:'Unsupported fixture action'},400);return;
    }
  }
  if(pathname==='/confluence/pages/viewpage.action'||pathname==='/confluence/pages/editpage.action'){
    const id=url.searchParams.get('pageId'),page=pages.get(id);if(!page){html(res,'Synthetic page not found',404);return;}
    if(pathname.includes('editpage')){html(res,chrome('Native editor hand-off','<main class="preview-document"><div class="preview-handoff"><p>TEST FIXTURE · NO REAL EDITOR</p><h1>Native editor hand-off</h1><p>WCSpedia correctly routed this action to Confluence page <strong>'+escape(id)+'</strong>: '+escape(page.title)+'.</p><p>On your Confluence instance, its native editor opens at this URL. This local fixture deliberately provides no imitation editor or persisted production content.</p><a href="/confluence/pages/viewpage.action?pageId='+escape(id)+'">Return to the synthetic working page →</a></div></main>','',config('home',id)));return;}
    html(res,chrome(page.title,'<main class="preview-document"><h1>'+escape(page.title)+'</h1><div id="native-controls" data-page-id="'+escape(id)+'"></div><article>'+page.body.view.value+'</article></main>','WCSNativeApp.mountDocumentControls(document.getElementById("native-controls"),WCS_NATIVE_CONFIG)',config('home',id)));return;
  }
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not a route in the local synthetic preview.');
}catch(error){json(res,{message:'Local fixture error: '+error.message},500);}});
server.listen(port,'127.0.0.1',()=>{process.stdout.write('Synthetic native WCSpedia preview: '+origin+'/native-preview.html\nTEST FIXTURE ONLY. No private Confluence calls or production data.\n');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
