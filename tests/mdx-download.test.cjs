'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const content = require('../editor-content.js');
const {fixture, tick, dataset} = require('./app-fixture.cjs');
const template = () => fs.readFileSync(path.join(__dirname, '../templates/wcspedia-document.mdx'), 'utf8');
const origin = 'https://confluence.example';
const page = origin + '/confluence/pages/viewpage.action?pageId=123';
const config = {mode:'confluence', contextPath:'/confluence', rootPageId:'123', attachmentPageId:'900'};
function response(body = template(), extra = {}) { return {ok:true, status:200, url:'', headers:new Headers({'content-type':'application/octet-stream'}), text:async()=>body, ...extra}; }
function api(fetch, extra = {}) {
  const host = {WCSMarkdownIt:require('../vendor/markdown-it-15.0.2.min.js'), WCSEditorContent:content, URL, Blob, AbortController, setTimeout, clearTimeout, location:{href:page}, fetch, ...extra};
  vm.createContext(host); vm.runInContext(fs.readFileSync(path.join(__dirname,'../document-export.js'),'utf8'),host);
  return host.WCSDocumentExport;
}
test('template fetch uses the assets page, current origin and credentials, with no CQL or export libraries', async()=>{
  const calls=[], e=api(async(url,options)=>{calls.push({url,options});return response();});
  assert.equal(await e.loadMDXTemplate(config),template());
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,origin+'/confluence/download/attachments/900/wcspedia-document.mdx?api=v2');
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.cache,'no-cache');
});
test('template uses latest despite old macro suffixes and respects custom context and local preview', async()=>{
  const calls=[], e=api(async url=>{calls.push(url);return response();});
  await e.loadMDXTemplate({...config,exports:{mdxTemplateUrl:'/confluence/download/attachments/900/wcspedia-document.mdx?api=v2&v=build&version=2'}});
  await e.loadMDXTemplate({...config,contextPath:'/wiki/'});
  await e.loadMDXTemplate({mode:'local'},{baseUrl:'http://localhost:4189/wcspedia-local.html'});
  assert.equal(calls[0],origin+'/confluence/download/attachments/900/wcspedia-document.mdx?api=v2');
  assert.equal(calls[1],origin+'/wiki/download/attachments/900/wcspedia-document.mdx?api=v2');
  assert.equal(calls[2],'http://localhost:4189/templates/wcspedia-document.mdx');
});
test('missing setup and external or executable template URLs fail before requests', async()=>{
  let requests=0;const e=api(async()=>{requests++;return response();});
  await assert.rejects(e.loadMDXTemplate({...config,attachmentPageId:'REPLACE_WITH_ATTACHMENTS_PAGE_ID'}),/attachmentPageId/);
  for(const url of ['https://outside.example/template.mdx','javascript:alert(1)','data:text/plain,MDX','/confluence/template.js','https://user:pass@confluence.example/template.mdx']) {
    await assert.rejects(e.loadMDXTemplate({...config,exports:{mdxTemplateUrl:url}}),/same Confluence site/);
  }
  assert.equal(requests,0);
});
test('template missing, login HTML, redirect, oversized, and malformed content produce actionable failures', async()=>{
  for(const [value,pattern] of [
    [response('',{ok:false,status:404}),/HTTP 404/],
    [response('<html>Sign in</html>',{headers:new Headers({'content-type':'text/html'})}),/sign-in/],
    [response(template(),{url:'https://identity.example/login'}),/redirected outside/],
    [response('x'.repeat(128001)),/did not return/],
    [response(template(),{headers:new Headers({'content-length':'128001'})}),/too large/],
    [response(''),/did not return/],
    [response('# Not the configured template'),/metadata block/],
    [response('---\nformat: "unknown"\n---\nBody'),/import format/]
  ]) await assert.rejects(api(async()=>value).loadMDXTemplate(config),pattern);
});
test('cancellation aborts the fetch and late completion cannot return a template',async()=>{
  let resolve,request;const controller=new AbortController();
  const pending=api((url,options)=>{request=options;return new Promise(r=>{resolve=r;});}).loadMDXTemplate(config,{signal:controller.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(request.signal.aborted,true);
  resolve(response());
  let requests=0;await assert.rejects(api(async()=>{requests++;return response();}).loadMDXTemplate(config,{signal:controller.signal}),{name:'AbortError'});assert.equal(requests,0);
});
test('a stalled template fetch has a bounded timeout even if fetch ignores abort',async()=>{
  let timeout,request;const e=api((url,options)=>{request=options;return new Promise(()=>{});},{setTimeout(callback,ms){assert.equal(ms,12000);timeout=callback;return 1;},clearTimeout(){}});
  const pending=e.loadMDXTemplate(config);timeout();await assert.rejects(pending,/timed out/);assert.equal(request.signal.aborted,true);
});
function blobText(w,blob){return new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsText(blob);});}
test('real application Download exports selected revision MDX and the hosted template',async t=>{
  const doc=dataset.documents.find(d=>d.publishedVersion),selected=doc.versions.find(v=>v.version===doc.publishedVersion),downloads=[],requests=[];
  const f=await fixture({sourceMode:true,hash:'#/document/'+doc.id+'?version='+selected.version,configureWindow(w){
    w.fetch=async(url,options)=>{requests.push({url,options});return response();};
    w.URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:https://confluence.example/download';};
    w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).filename=this.download;};
    w.WCS_CONFIG.exports.mdxTemplateUrl='/confluence/download/attachments/900/wcspedia-document.mdx?api=v2&v=current';
  }});t.after(f.close);
  const click=async format=>{assert.ok(f.find('[data-wcs-export]'));f.find('[data-wcs-export]').click();f.find('[data-export-format="'+format+'"]').click();await tick();await tick();};
  await click('mdx');assert.equal(downloads.length,1,f.find('.form-error')?.textContent);
  const exported=content.normalizeImport(await blobText(f.w,downloads[0].blob),{assets:[],attachments:[]});
  assert.equal(exported.metadata.title,selected.title);assert.equal(exported.metadata.area,doc.area);assert.equal(exported.metadata.type,doc.type);
  assert.ok(downloads[0].filename.endsWith('-v'+selected.version+'-r'+selected.revision+'.mdx'));assert.equal(requests.length,0,'Document MDX is serialized locally');
  await click('mdx-template');assert.equal(downloads.length,2,f.find('.form-error')?.textContent);assert.equal(downloads[1].filename,'wcspedia-document.mdx');
  assert.equal(await blobText(f.w,downloads[1].blob),template());assert.equal(requests.length,1);assert.equal(new URL(requests[0].url).pathname,'/confluence/download/attachments/900/wcspedia-document.mdx');
  assert.equal(f.errors.length,0);
});
