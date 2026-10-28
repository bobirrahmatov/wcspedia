'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {JSDOM}=require('jsdom');

const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'wcs-configured-'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'confluence-installation.json'),'utf8'));
const directory=path.join(temp,'ready'),output=path.join(temp,'configured.zip');
const baseArgs=[path.join(root,'package-configured-upload.py'),'--directory',directory,'--output',output];
execFileSync('python3',baseArgs,{cwd:root,encoding:'utf8'});
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const headerParts=['wcspedia-file-drop-guard-header.html','wcspedia-global-styles.html','wcspedia-loading-header.html','wcspedia-notifications-header.html','wcspedia-header-widget.html','wcspedia-page-style-flags-header.html','wcspedia-article-discussion-header.html'];
// Inspect each component inside the single delivered navbar fragment.
const read=name=>{
 if(headerParts.includes(name.replace(/^html\//,''))){
  const source=fs.readFileSync(path.join(directory,'html/wcspedia-navbar.html'),'utf8');
  const section=source.split('<!-- WCSpedia component: '+name.slice(5)+' -->\n')[1];
  assert.ok(section,'Navbar component '+name);return Buffer.from(section.split('<!-- WCSpedia component:')[0]);
 }
 return fs.readFileSync(path.join(directory,name));
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('configured navbar loads the space file-drop guard first with the real space key',()=>{
  const source=fs.readFileSync(path.join(directory,'html/wcspedia-navbar.html'),'utf8');
  const dom=new JSDOM(source,{runScripts:'outside-only',url:'https://example.test/confluence/spaces/'+profile.spaceKey+'/pages/123/Article'});
  try {
    const w=dom.window,scripts=[...w.document.querySelectorAll('script')];
    w.eval(scripts[0].textContent);
    assert.equal(w.WCS_FILE_DROP_CONFIG.spaceKey,profile.spaceKey);
    assert.equal(w.WCS_FILE_DROP_CONFIG.enabled,true);
    assert.equal(scripts.find(s=>s.src).getAttribute('src'),'/confluence/download/attachments/'+profile.attachmentPageId+'/wcspedia-file-drop-guard.js?api=v2');
    const asset=read('attachments/wcspedia-file-drop-guard.js').toString();
    assert.equal(asset,fs.readFileSync(path.join(root,'file-drop-guard.js'),'utf8'));
    w.eval(asset);
    const event=new w.Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:{types:['Files']}});
    w.document.body.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);
    assert.equal(scripts.filter(s=>s.src.includes('wcspedia-file-drop-guard.js')).length,1);
  } finally {dom.window.close();}
});
function archiveWithAttachmentSize(name,size,label){
  const target=path.join(temp,label+'.zip');
  execFileSync('python3',['-c',`
from pathlib import Path
import hashlib,sys,zipfile
source,target,name,size=sys.argv[1:]
target=Path(target)
prefix='wcspedia-upload/'
with zipfile.ZipFile(source) as archive:
    files={n.removeprefix(prefix):archive.read(n) for n in archive.namelist()}
assert name in files
data=files[name]
assert len(data)<=int(size)
files[name]=data+b' '*(int(size)-len(data))
files['SHA256SUMS.txt']=''.join(
    f'{hashlib.sha256(data).hexdigest()}  {name}\\n'
    for name,data in sorted(files.items()) if name!='SHA256SUMS.txt'
).encode()
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name,data in files.items(): archive.writestr(prefix+name,data)
target.with_suffix('.zip.sha256').write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+target.name+'\\n')
`,path.join(root,'WCSpedia-upload-ready.zip'),target,name,String(size)],{encoding:'utf8'});
  return target;
}
const entries={home:'wcspedia-landing.html',mine:'wcspedia-my-workspace.html',review:'wcspedia-reviewer-workspace.html',saved:'wcspedia-saved-items.html',entitlements:'wcspedia-entitlements.html',insights:'wcspedia-insights.html',faq:'wcspedia-faq.html'};
const origin='https://cedt-confluence.nam.nsroot.net';

test('installation profile uses all supplied page IDs and keeps backend endpoints empty',()=>{
  assert.equal(profile.attachmentPageId,'3962195316');
  assert.equal(profile.spaceKey,'wcspedia');
  assert.deepEqual(profile.pageIds,{home:'3954553300',mine:'3961735744',review:'3961735749',saved:'3961735759',entitlements:'3961735763',faq:'3973992401'});
  assert.equal(profile.workingRootPageId,'3961735834');
  assert.equal(profile.insightsPageId,'3961735728');
  assert.deepEqual(profile.areaPageIds,{
    'credit-approval-control':'3961735771','credit-information-management':'3961735776',
    'credit-management-reporting':'3961735781','deal-closing':'3961735791',
    'documentation-pledging':'3961735795','emea-credit-admin':'3961735800',
    'loan-management':'3961735803','regional-operating-manuals':'3961735808'
  });
  assert.ok(Object.values(profile.services).every(value=>value===''));
});

test('all seven configured macros execute with the shared JSON host and exact page/area IDs',()=>{
  for(const [role,file] of Object.entries(entries)){
    const source=read('html/'+file).toString();
    assert.doesNotMatch(source,/REPLACE_WITH_[A-Z0-9_]+_PAGE_ID|entitlementsPageId|entitlementsSource|entitlementsFilename/);
    assert.doesNotMatch(source,/<\/?(?:html|head|body|meta)\b/i);
    const dom=new JSDOM(source,{url:origin+'/confluence/pages/viewpage.action?pageId='+(role==='insights'?profile.insightsPageId:profile.pageIds[role]),runScripts:'outside-only'});
    try{
      const script=dom.window.document.querySelector('script:not([src])');
      dom.window.eval(script.textContent);
      const cfg=dom.window.WCS_CONFIG;
      assert.equal(cfg.pageRole,role);
      assert.equal(cfg.rootPageId,profile.pageIds.home);
      assert.equal(cfg.attachmentPageId,profile.attachmentPageId);
      assert.equal(cfg.spaceKey,profile.spaceKey);
      assert.equal(cfg.authoringMode,'confluence-session');
      assert.equal(cfg.nativeAccessSync,true);
      assert.equal(cfg.nativePublication.workingRootPageId,profile.workingRootPageId);
      assert.equal(cfg.nativePublication.insightsPageId,profile.insightsPageId);
      assert.deepEqual(JSON.parse(JSON.stringify(cfg.nativePublication.insightsTypes)),['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']);
      assert.equal(new URL(cfg.pages.insights,origin).searchParams.get('pageId'),profile.insightsPageId);
      assert.deepEqual(JSON.parse(JSON.stringify(cfg.nativePublication.areaPageIds)),profile.areaPageIds);
      for(const [key,id] of Object.entries(profile.pageIds)){
        const url=new URL(cfg.pages[key],origin);
        assert.equal(url.origin,origin);
        assert.equal(url.searchParams.get('pageId'),id);
      }
      for(const key of Object.keys(profile.services))assert.equal(cfg[key],'');
      for(const script of dom.window.document.querySelectorAll('script[src]')){
        const url=new URL(script.getAttribute('src'),origin);
        assert.equal(url.origin,origin);
        assert.ok(url.pathname.startsWith('/confluence/download/attachments/'+profile.attachmentPageId+'/'));
        assert.equal(url.searchParams.has('v'),false);assert.equal(url.searchParams.get('api'),'v2');
        assert.ok(fs.existsSync(path.join(directory,'attachments',path.posix.basename(url.pathname))));
      }
    }finally{dom.window.close();}
  }
});

test('header and shared helper fragments are ready to paste and add no second header',()=>{
  const dom=new JSDOM(read('html/wcspedia-header-widget.html').toString(),{url:origin+'/confluence/',runScripts:'outside-only'});
  try{
    dom.window.eval(dom.window.document.querySelector('script:not([src])').textContent);
    const cfg=dom.window.WCS_ADD_DOCUMENT_CONFIG;
    assert.equal(cfg.attachmentPageId,profile.attachmentPageId);
    assert.equal(cfg.rootPageId,profile.pageIds.home);
    assert.equal(cfg.workspacePageId,profile.pageIds.mine);
    assert.equal(cfg.workspaceEndpoint,'');assert.equal(cfg.workflowEndpoint,'');
    assert.equal(dom.window.document.querySelectorAll('header,style,link,#wcspedia').length,0);
  }finally{dom.window.close();}
  for(const file of fs.readdirSync(path.join(directory,'html'),{recursive:true}).filter(name=>name.endsWith('.html'))){
    const html=read('html/'+file).toString();
    assert.doesNotMatch(html,/REPLACE_WITH_[A-Z0-9_]+_PAGE_ID|entitlementsPageId|entitlementsSource|entitlementsFilename/);
    for(const match of html.matchAll(/(?:src|href)="([^\"]+)"/g)){
      if(match[1].includes('/download/attachments/'))assert.ok(match[1].includes('/'+profile.attachmentPageId+'/'));
    }
  }
});

test('runtime bytes, cache revisions and existing starter JSON remain identical to the verified source ZIP',()=>{
  execFileSync('python3',['-c',`
from pathlib import Path
import zipfile,re,sys
source,output=sys.argv[1:]
with zipfile.ZipFile(source) as a, zipfile.ZipFile(output) as b:
    original={n.removeprefix('wcspedia-upload/'):a.read(n) for n in a.namelist()}
    configured={n.removeprefix('confluence-ready/'):b.read(n) for n in b.namelist()}
    assert set(original)==set(configured)
    for name,data in original.items():
        if not name.startswith('html/') and name not in ('README.md','SHA256SUMS.txt'):
            assert data==configured[name],name
        elif name.startswith('html/'):
            assert re.findall(rb'v=([a-f0-9]{12})',data)==re.findall(rb'v=([a-f0-9]{12})',configured[name]),name
    assert not any(n.endswith('.cjs') or n.endswith('.py') or 'installation.json' in n for n in configured)
    assert not any(n.endswith('entitlements-table.html') for n in configured)
`,path.join(root,'WCSpedia-upload-ready.zip'),output],{encoding:'utf8'});
  const README=read('README.md').toString();
  assert.match(README,/Keep your live/);assert.match(README,/first installation only/);
  assert.match(README,/No custom service endpoints or server installation are required/);
  assert.match(README,/denied access\/setup errors it stays visible but disabled/);
  assert.match(README,/manual marker for native document pages only/);
  assert.match(README,/10 MB \(10,000,000 bytes\) per attachment/);
  assert.match(README,/Keep the existing WCSpedia editor, design and custom approval workflow/);
});

test('configured directory manifest and ZIP checksum verify all packaged bytes',()=>{
  const hashes=read('SHA256SUMS.txt').toString().trim().split('\n');
  for(const line of hashes){const [digest,name]=line.split('  ');assert.equal(sha(read(name)),digest,name);}
  assert.equal(fs.readFileSync(output+'.sha256','utf8'),sha(fs.readFileSync(output))+'  '+path.basename(output)+'\n');
  execFileSync('python3',['-c',`
from pathlib import Path
import zipfile,sys
directory,output=map(Path,sys.argv[1:])
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for n in z.namelist():
        assert z.read(n)==(directory/n.removeprefix('confluence-ready/')).read_bytes()
`,directory,output]);
});

test('unverified input and invalid IDs are rejected before changing outputs',()=>{
  const previous=sha(fs.readFileSync(output));
  const badArchive=path.join(temp,'bad.zip');
  fs.copyFileSync(path.join(root,'WCSpedia-upload-ready.zip'),badArchive);
  fs.writeFileSync(badArchive+'.sha256','0'.repeat(64)+'  bad.zip\n');
  let result=spawnSync('python3',[...baseArgs,'--source',badArchive],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/ZIP checksum mismatch/);
  const invalid=path.join(temp,'invalid-profile.json');
  fs.writeFileSync(invalid,JSON.stringify({...profile,attachmentPageId:'invalid'}));
  result=spawnSync('python3',[...baseArgs,'--profile',invalid],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/numeric strings/);
  assert.equal(sha(fs.readFileSync(output)),previous);
});

test('unexpected files in the expanded output directory are preserved instead of removed',()=>{
  const note=path.join(directory,'user-note.txt');fs.writeFileSync(note,'Preserve this');
  const result=spawnSync('python3',baseArgs,{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/unexpected files/);
  assert.equal(fs.readFileSync(note,'utf8'),'Preserve this');
  fs.unlinkSync(note);
});

test('oversized runtime attachments and initial JSON reject verified ZIPs without changing existing outputs',()=>{
  const previousZip=sha(fs.readFileSync(output)),previousManifest=sha(read('SHA256SUMS.txt'));
  for(const [index,name] of ['attachments/wcspedia-landing.js','initial-json/entitlements.json'].entries()){
    const source=archiveWithAttachmentSize(name,10_000_001,'oversized-'+index);
    const result=spawnSync('python3',[...baseArgs,'--source',source],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/10 MB \(10,000,000 bytes\) per-file limit/);
    assert.ok(result.stderr.includes(name));
    assert.equal(sha(fs.readFileSync(output)),previousZip);
    assert.equal(sha(read('SHA256SUMS.txt')),previousManifest);
  }
});

test('attachment exactly at the per-file limit is accepted even when combined uncompressed files exceed it',()=>{
  const source=archiveWithAttachmentSize('attachments/wcspedia-logo.png',10_000_000,'at-limit');
  const limitDirectory=path.join(temp,'at-limit-ready');
  const result=spawnSync('python3',[path.join(root,'package-configured-upload.py'),'--source',source,'--directory',limitDirectory,'--output',path.join(temp,'at-limit-configured.zip')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.statSync(path.join(limitDirectory,'attachments/wcspedia-logo.png')).size,10_000_000);
  const manifest=fs.readFileSync(path.join(limitDirectory,'SHA256SUMS.txt'),'utf8');
  const total=manifest.trim().split('\n').reduce((sum,line)=>sum+fs.statSync(path.join(limitDirectory,line.split('  ')[1])).size,0);
  assert.ok(total>10_000_000);
});

test('a verified service profile is propagated consistently without changing runtime assets',()=>{
  const serviceProfile=path.join(temp,'services.json');
  const services={...profile.services,workspaceEndpoint:'/confluence/rest/wcspedia/1/workspace',workflowEndpoint:'/confluence/rest/wcspedia/1/workflow',entitlementsEndpoint:'/confluence/rest/wcspedia/1/entitlements'};
  fs.writeFileSync(serviceProfile,JSON.stringify({...profile,services}));
  const serviceDir=path.join(temp,'service-ready');
  execFileSync('python3',[path.join(root,'package-configured-upload.py'),'--profile',serviceProfile,'--directory',serviceDir,'--output',path.join(temp,'services.zip')]);
  for(const file of Object.values(entries)){
    const source=fs.readFileSync(path.join(serviceDir,'html',file),'utf8');
    for(const endpoint of Object.values(services).filter(Boolean))assert.ok(source.includes(endpoint));
  }
  const header=fs.readFileSync(path.join(serviceDir,'html/wcspedia-navbar.html'),'utf8');
  assert.ok(header.includes(services.workspaceEndpoint));assert.ok(header.includes(services.workflowEndpoint));
});

test('article discussion header uses exact installation scope and keeps its discussion view lazy while sharing the comment API for suggestions',()=>{
  const source=read('html/wcspedia-article-discussion-header.html').toString();
  assert.doesNotMatch(source,/<\/?(?:html|head|body|meta|header)\b/i);
  assert.doesNotMatch(source,/REPLACE_WITH_|entitlementsPageId|entitlementsSource|entitlementsFilename/);
  const dom=new JSDOM(source,{url:origin+'/confluence/pages/viewpage.action?pageId=900',runScripts:'outside-only'});
  try{
    const inline=dom.window.document.querySelectorAll('script:not([src])');
    assert.equal(inline.length,1);dom.window.eval(inline[0].textContent);
    const cfg=dom.window.WCS_ARTICLE_DISCUSSION_CONFIG;
    assert.equal(cfg.contextPath,'/confluence');assert.equal(cfg.spaceKey,profile.spaceKey);
    assert.equal(cfg.rootPageId,profile.pageIds.home);assert.equal(cfg.attachmentPageId,profile.attachmentPageId);
    assert.equal(cfg.workingRootPageId,profile.workingRootPageId);
    assert.equal(cfg.insightsPageId,profile.insightsPageId);
    assert.deepEqual(JSON.parse(JSON.stringify(cfg.insightsTypes)),['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']);
    assert.deepEqual(JSON.parse(JSON.stringify(cfg.pageIds)),profile.pageIds);
    assert.deepEqual(JSON.parse(JSON.stringify(cfg.areaPageIds)),profile.areaPageIds);
    assert.equal(cfg.feedbackEndpoint,'');
    const scripts=dom.window.document.querySelectorAll('script[src]');assert.equal(scripts.length,2);
    assert.equal(cfg.authoringMode,'confluence-session');
    const urls=[new URL(cfg.bundleUrl,origin),...Array.from(scripts,s=>new URL(s.getAttribute('src'),origin))];
    assert.equal(path.posix.basename(urls[0].pathname),'wcspedia-article-discussion.js');
    assert.equal(path.posix.basename(urls[1].pathname),'wcspedia-article-engagement.js');
    assert.equal(path.posix.basename(urls[2].pathname),'wcspedia-article-discussion-bootstrap.js');
    for(const url of urls){
      assert.equal(url.origin,origin);
      assert.ok(url.pathname.startsWith('/confluence/download/attachments/'+profile.attachmentPageId+'/'));
      assert.equal(url.searchParams.has('v'),false);assert.equal(url.searchParams.get('api'),'v2');
      assert.ok(fs.existsSync(path.join(directory,'attachments',path.posix.basename(url.pathname))));
    }
    for(const file of Object.values(entries)){
      const page=new JSDOM(read('html/'+file).toString());
      try{for(const script of page.window.document.querySelectorAll('script[src]')){
        const name=path.posix.basename(new URL(script.getAttribute('src'),origin).pathname);
        assert.doesNotMatch(read('attachments/'+name).toString(),/WCSArticleDiscussion/);
      }}finally{page.window.close();}
    }
  }finally{dom.window.close();}
});

test('Insights header link and manual analytics guides are delivered without extra application chrome',()=>{
 const source=read('html/wcspedia-insights-header-link.html').toString(),dom=new JSDOM(source,{url:origin});
 try{
  assert.equal(dom.window.document.querySelectorAll('a').length,1);assert.equal(dom.window.document.querySelector('a').textContent,'Insights');
  assert.equal(new URL(dom.window.document.querySelector('a').href).searchParams.get('pageId'),profile.insightsPageId);
  assert.equal(dom.window.document.querySelector('header,script,style,#wcspedia'),null);
  assert.match(read('templates/INSIGHTS.md').toString(),/3961735728/);
  assert.match(read('templates/MANUAL-ANALYTICS.md').toString(),/does not upload/);
 }finally{dom.window.close();}
});

test('all supplied attachment URLs omit application cache-version suffixes',()=>{
 const folder=path.join(directory,'html');
 for(const filename of fs.readdirSync(folder,{recursive:true}).filter(name=>name.endsWith('.html'))) {
  const html=fs.readFileSync(path.join(folder,filename),'utf8');
  assert.doesNotMatch(html,/&(?:amp;)?v=/,filename);
 }
});
test('one navbar fragment owns one stylesheet and collapses repeated stylesheet includes',()=>{
 assert.deepEqual(fs.readdirSync(path.join(directory,'attachments')).filter(n=>n.endsWith('.css')),['wcspedia-style.css']);
 for(const file of headerParts)assert.equal(fs.existsSync(path.join(directory,'html',file)),false);
 const source=fs.readFileSync(path.join(directory,'html/wcspedia-navbar.html'),'utf8');
 const dom=new JSDOM(source+source,{url:origin+'/confluence/',runScripts:'outside-only'});
 try{
  for(const script of dom.window.document.querySelectorAll('script:not([src])'))dom.window.eval(script.textContent);
  assert.equal(dom.window.document.querySelectorAll('link[rel=stylesheet]').length,1);
  const cfg=dom.window.WCS_ADD_DOCUMENT_CONFIG;
  assert.equal(cfg.attachmentPageId,profile.attachmentPageId);
  assert.equal(dom.window.WCS_ARTICLE_DISCUSSION_CONFIG.spaceKey,profile.spaceKey);
  // Simulate a duplicate macro's script failure before the widget loads.
  dom.window.console.warn=()=>{};
  dom.window.WCSAddDocumentUnavailable('Attachment unavailable');
  assert.equal(dom.window.document.querySelectorAll('[data-wcs-header-add-document]').length,1);
  const host=dom.window.document.querySelector('[data-wcs-header-add-document]'),button=host.querySelector('button');
  host.dataset.wcsHeaderWidgetStarted='mounted';
  dom.window.WCSAddDocumentUnavailable('Failed duplicate script');
  assert.equal(host.querySelector('button'),button,'Failure fallback must not destroy an active widget');
 }finally{dom.window.close();}
});

test('every configured page uses the same five local vendor attachments and navBar has one lazy loader',()=>{
 const vendors=['highcharts-13.1.0.js','highcharts-13.1.0-accessibility.js','pdfmake-0.2.20.min.js','pdfmake-0.2.20-vfs-fonts.js','docx-9.5.1.iife.js'];
 const files=[...Object.values(entries).map(f=>'html/'+f),...Object.keys(profile.areaPageIds).map(a=>'html/areas/'+a+'.html')];
 for(const file of files){const dom=new JSDOM(read(file).toString(),{url:origin+'/confluence/',runScripts:'outside-only'});try{dom.window.eval(dom.window.document.querySelector('script:not([src])').textContent);const c=dom.window.WCS_CONFIG;assert.equal(c.charts.allowCDN,false);assert.equal(c.exports.allowCDN,false);
 const urls=[c.charts.highchartsSrc,c.charts.accessibilitySrc,c.exports.pdfMakeUrl,c.exports.pdfFontsUrl,c.exports.docxUrl];
 assert.deepEqual(urls.map(u=>path.posix.basename(new URL(u,origin).pathname)),vendors);
 for(const url of urls)assert.equal(new URL(url,origin).origin,origin);
 }finally{dom.window.close();}}
 const navbar=read('html/wcspedia-navbar.html').toString();assert.equal((navbar.match(/src="[^"]*wcspedia-library-loader\.js/g)||[]).length,1);
 for(const file of vendors){assert.ok(fs.existsSync(path.join(directory,'attachments',file)));assert.ok(!navbar.includes(file),'Do not preload '+file+' globally');}
 const sources=JSON.parse(read('licenses/library-sources.json'));for(const item of sources){const bytes=read((item.file.endsWith('.js')?'attachments/':'licenses/')+item.file);assert.equal(sha(bytes),item.sha256);}
});
