/* Validate the content-only files actually supplied for Confluence upload.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/confluence-upload.test.cjs
 */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const C=require('../confluence.js');
const directory=path.join(__dirname,'../confluence-upload');
const read=file=>fs.readFileSync(path.join(directory,file),'utf8');
const entries={home:'wcspedia-landing.html',mine:'wcspedia-my-workspace.html',review:'wcspedia-reviewer-workspace.html',saved:'wcspedia-saved-items.html',entitlements:'wcspedia-entitlements.html',insights:'wcspedia-insights.html'};
const scriptFor=role=>'attachments/'+entries[role].replace(/\.html$/,'.js');
const rendererFor=role=>'attachments/'+entries[role].replace(/\.html$/,'HTMLPage.js');
const initialHashes={home:'#/',mine:'#/results?view=mine',review:'#/review',saved:'#/saved',entitlements:'#/entitlements',insights:'#/insights'};
const initialHeadings={home:/A world of knowledge\./,mine:/My workspace/,review:/Your reading workspace/,saved:/Saved items/,entitlements:/The right access/,insights:/All Insights/};
const origin='https://confluence.example';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function settled(predicate,message){
  const deadline=Date.now()+2500;
  while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(predicate(),typeof message==='function'?message():message);
}
function browserAPIs(w){
  Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});
  Object.assign(w,{Headers,TextEncoder,TextDecoder});
}
function nativePage(id,extra={}){return {id,type:'page',status:'current',title:'Page '+id,space:{key:'WCS'},ancestors:id==='100'?[]:[{id:'100'}],operations:[{operation:'read',targetType:'page'}],version:{number:1},...extra};}
function configure(dom,transform=source=>source){
  const inline=dom.window.document.querySelector('script:not([src])');
  assert.ok(inline,'The macro contains its installation settings');
  const ids={REPLACE_WITH_WCSPEDIA_PAGE_ID:'100',REPLACE_WITH_ATTACHMENTS_PAGE_ID:'900',REPLACE_WITH_MY_WORKSPACE_PAGE_ID:'101',REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID:'102',REPLACE_WITH_SAVED_ITEMS_PAGE_ID:'103',REPLACE_WITH_ENTITLEMENTS_PAGE_ID:'104',REPLACE_WITH_INSIGHTS_PAGE_ID:'105',REPLACE_WITH_RESTRICTED_WORKING_ROOT_PAGE_ID:'200'};
  let areaId=300;
  const configured=inline.textContent.replace(/REPLACE_WITH_[A-Z0-9_]+/g,key=>ids[key]||(ids[key]=String(areaId++)));
  dom.window.eval(transform(configured));
  return dom.window.WCS_CONFIG;
}
function page(role){return new JSDOM('<!doctype html><html><head></head><body>'+read('html/'+entries[role])+'</body></html>',{url:origin+'/confluence/pages/viewpage.action?pageId=999',runScripts:'outside-only',pretendToBeVisual:true});}
function url(value){return new URL(value,origin+'/confluence/pages/viewpage.action?pageId=999');}
function cssRules(sheet){return [...sheet.cssRules].flatMap(rule=>rule.cssRules?cssRules(rule):rule.selectorText?[rule]:[]);}

test('each content-only HTML fragment declares inline settings then loads its own logic and HTML renderer',()=>{
  for(const [role,file] of Object.entries(entries)){
    const source=read('html/'+file),dom=page(role),d=dom.window.document;
    try{
      assert.equal(d.querySelectorAll('#wcspedia').length,1,file);
      assert.equal(d.querySelector('#wcspedia').dataset.wcsPageRole,role,file);
      assert.equal(d.querySelector('#wcspedia').hasAttribute('data-wcs-style-flags'),false,file);
      assert.equal(d.querySelectorAll('header,.wcs-preview-tools').length,0,file);
      assert.doesNotMatch(source,/<\/?(?:html|head|body|meta)\b/i,file+' is pasted into an HTML macro, not installed as a document');
      assert.equal(d.querySelectorAll('link[rel="stylesheet"],style').length,0,file+' relies on the one global stylesheet');
      const scripts=[...d.querySelectorAll('script')];
      assert.equal(scripts.length,3,file+' declares settings, logic, and renderer once each');
      assert.equal(scripts[0].hasAttribute('src'),false,'Settings are inline, with no separate config attachment');
      assert.match(scripts[0].textContent,/WCS_CONFIG/);
      assert.match(scripts[0].textContent,/attachmentPageId/,'The asset host is configured independently of the landing/search root');
      assert.ok(scripts.slice(1).every(script=>script.src&&!script.textContent.trim()));
      assert.equal(path.posix.basename(url(scripts[1].getAttribute('src')).pathname),file.replace(/\.html$/,'.js'));
      assert.equal(path.posix.basename(url(scripts[2].getAttribute('src')).pathname),file.replace(/\.html$/,'HTMLPage.js'));
      assert.ok(scripts.every(script=>!script.hasAttribute('async')&&!script.hasAttribute('defer')),'Dependent scripts retain their declared execution order');
      for(const element of d.querySelectorAll('script[src],link[href]')){
        const asset=url(element.getAttribute('src')||element.getAttribute('href'));
        assert.equal(asset.origin,origin,'Attachments load on the existing Confluence origin');
        assert.match(asset.pathname,/^\/confluence\/download\/attachments\/REPLACE_WITH_ATTACHMENTS_PAGE_ID\//);
        assert.equal(asset.searchParams.get('api'),'v2');
        assert.ok(fs.existsSync(path.join(directory,'attachments',path.posix.basename(asset.pathname))),'Every linked file is supplied');
      }
    }finally{dom.window.close();}
  }
});

test('all eight business-area macros preserve startup order and share scoped Explore settings',()=>{
  const profile=require('../confluence-installation.json');
  for(const [area,pageId] of Object.entries(profile.areaPageIds)) {
    const source=fs.readFileSync(path.join(__dirname,'../confluence-ready/html/areas',area+'.html'),'utf8');
    const dom=new JSDOM(source,{url:origin+'/confluence/pages/viewpage.action?pageId='+pageId,runScripts:'outside-only'});
    try {
      const d=dom.window.document,scripts=[...d.querySelectorAll('script')];
      assert.equal(d.querySelectorAll('#wcspedia').length,1);
      assert.equal(d.querySelector('#wcspedia').dataset.wcsPageRole,'home');
      assert.equal(scripts.length,3);
      dom.window.eval(scripts[0].textContent);
      const cfg=dom.window.WCS_CONFIG;
      assert.equal(cfg.pageRole,'home');assert.equal(cfg.businessArea,area);
      assert.equal(cfg.governanceEnabled,false);
      assert.equal(String(cfg.nativePublication.areaPageIds[area]),String(pageId));
      assert.match(scripts[1].src,/wcspedia-landing\.js\?api=v2$/);
      assert.match(scripts[2].src,/wcspedia-landingHTMLPage\.js\?api=v2$/);
      assert.doesNotMatch(source,/REPLACE_WITH_|<header|page-boot/);
      const navbar=fs.readFileSync(path.join(__dirname,'../confluence-ready/html/wcspedia-navbar.html'),'utf8');
      const header=new JSDOM(navbar);
      try {assert.ok(header.window.document.querySelector('[data-wcs-loading-pages]').getAttribute('data-wcs-loading-pages').split(',').includes(String(pageId)));}finally{header.window.close();}
    } finally {dom.window.close();}
  }
});

test('every macro downloads the supplied MDX template from its configured attachment page',()=>{
  const content=require('../editor-content.js');
  assert.equal(read('attachments/wcspedia-document.mdx'),read('templates/wcspedia-document.mdx'));
  assert.ok(content.normalizeImport(read('attachments/wcspedia-document.mdx')).metadata);
  for(const role of Object.keys(entries)){
    const dom=page(role);
    try {
      const config=configure(dom),template=url(config.exports.mdxTemplateUrl);
      assert.equal(template.origin,origin);
      assert.equal(template.pathname,'/confluence/download/attachments/900/wcspedia-document.mdx');
      assert.equal(template.searchParams.get('api'),'v2');
      assert.equal(template.searchParams.has('v'),false);
    } finally {dom.window.close();}
  }
});

test('shared-header flag attachment excludes all delivered interface pages without adding a header or network dependency',()=>{
  const header=new JSDOM(read('html/wcspedia-page-style-flags-header.html'));
  try{
    const d=header.window.document,scripts=[...d.querySelectorAll('script')];
    assert.equal(scripts.length,1);
    assert.equal(d.querySelectorAll('header,style,link,#wcspedia,[data-wcs-style-flags]').length,0);
    const asset=url(scripts[0].getAttribute('src'));
    assert.match(asset.pathname,/^\/confluence\/download\/attachments\/REPLACE_WITH_ATTACHMENTS_PAGE_ID\/wcspedia-page-style-flags\.js$/);
    assert.equal(asset.searchParams.has('v'),false);assert.equal(asset.searchParams.get('api'),'v2');
    const helper=read('attachments/wcspedia-page-style-flags.js');
    for(const role of Object.keys(entries)){
      const dom=page(role);
      try{
        dom.window.fetch=()=>{throw Error('Style flags must not make a network request');};
        dom.window.eval(helper);
        assert.deepEqual([...dom.window.document.body.classList],[]);
        assert.ok(dom.window.document.querySelector('#wcspedia'),'Application content remains mounted');
      }finally{dom.window.close();}
    }
  }finally{header.window.close();}
});

test('global styles are supplied as one CSS-only look-and-feel fragment',()=>{
  const source=read('html/wcspedia-global-styles.html');
  const dom=new JSDOM(source);
  try{
    const d=dom.window.document,links=[...d.querySelectorAll('link[rel="stylesheet"]')];
    assert.equal(links.length,1);
    assert.equal(path.posix.basename(url(links[0].getAttribute('href')).pathname),'wcspedia-style.css');
    assert.equal(d.querySelectorAll('script,style,header,#wcspedia').length,0);
    assert.doesNotMatch(source,/<\/?(?:html|head|body|meta)\b/i);
  }finally{dom.window.close();}
});

test('each page has separate dependency and HTML renderer files without redesigning the application',()=>{
  const application=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  for(const role of Object.keys(entries)){
    const logic=read(scriptFor(role)),renderer=read(rendererFor(role));
    assert.equal(logic.includes(application),false,role+' logic does not bootstrap the page');
    assert.ok(renderer.includes(application),role+' retains the established page renderer without a redesign');
    assert.equal(renderer.split(application).length,2,role+' includes one renderer and bootstrap');
    for(const module of ['confluence.js','navigation.js','workflow.js','search.js','space-storage.js','space-workflow.js','space-personal.js','space-engagement.js','space-health.js']){
      const source=fs.readFileSync(path.join(__dirname,'../'+module),'utf8');
      assert.ok(logic.includes(source),role+' logic includes '+module);
      assert.equal(renderer.includes(source),false,role+' renderer does not duplicate '+module);
    }
  }
  for(const obsolete of ['wcspedia.js','wcspediaHTMLPage.js','wcspedia-config.js'])assert.ok(!fs.existsSync(path.join(directory,'attachments',obsolete)),obsolete+' is not supplied for accidental mixed installation');
});

test('inline settings respect each page role and separate same-origin attachment and search roots',()=>{
  let shared;
  for(const role of Object.keys(entries)){
    const dom=page(role);
    try{
      const config=configure(dom);
      assert.equal(config.mode,'confluence');
      assert.equal(config.authoringMode,'confluence-session');
      assert.equal(config.spaceKey,undefined,'The generic macro verifies the configured landing page to resolve its real space');
      for(const endpoint of ['workspaceEndpoint','workflowEndpoint','entitlementsEndpoint','bookmarksEndpoint','suggestionEndpoint'])assert.equal(config[endpoint],'','No custom backend endpoint is required');
      assert.equal(config.pageRole,role);
      assert.equal(config.rootPageId,'100');
      assert.equal(config.attachmentPageId,'900');
      for(const obsolete of ['entitlementsPageId','entitlementsSource','entitlementsFilename']) {
        assert.equal(Object.hasOwn(config,obsolete),false,role+' does not require '+obsolete);
        assert.doesNotMatch(read('html/'+entries[role]),new RegExp(obsolete+'\\s*:'));
      }
      assert.equal(url(config.pages.entitlements).searchParams.get('pageId'),'104','The Entitlements interface keeps its navigation page ID');
      const adapter=C.create(config,{location:dom.window.location,fetch:async()=>{throw new Error('No requests expected');}});
      assert.equal(adapter.info().entitlementsConfigured,true,'The attachment page provides the JSON policy location');
      assert.equal(config.showConnectionStatus,false);
      assert.equal(config.mountGlobalTools,false);
      assert.equal(config.search.timeoutMs,12000);
      assert.equal(JSON.stringify(config.search.excludePageIds),'[]');
      assert.equal(JSON.stringify(config.search.excludeAncestorIds),'[]');
      assert.equal(config.nativePublication.publishedRootPageId,config.rootPageId,'Search and publication use the same WCSpedia root');
      assert.equal(Object.keys(config.nativePublication.areaPageIds).length,8);
      assert.equal(config.nativePublication.insightsPageId,'105');
      assert.deepEqual(JSON.parse(JSON.stringify(config.nativePublication.insightsTypes)),['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']);
      assert.equal(url(config.pages.insights).searchParams.get('pageId'),'105');
      for(const value of [...Object.values(config.pages),config.brandLogoUrl,config.exports.logoUrl]){
        const target=url(value);assert.equal(target.origin,origin);assert.ok(target.pathname.startsWith('/confluence/'));
      }
      for(const value of Object.values(config.pages))assert.equal(url(value).pathname,'/confluence/pages/viewpage.action');
      for(const value of [config.brandLogoUrl,config.exports.logoUrl])assert.match(url(value).pathname,/^\/confluence\/download\/attachments\/900\//);
      assert.equal(url(config.pages.home).searchParams.get('pageId'),'100');
      const stable=JSON.stringify({...config,pageRole:null});
      if(shared)assert.equal(stable,shared,'Generated defaults share the same routing and service configuration');else shared=stable;
    }finally{dom.window.close();}
  }
});

test('hosted CSS inherits host fonts, retains code fonts, and has no site-wide rules',()=>{
  const css=read('attachments/wcspedia-style.css');
  assert.doesNotMatch(css,/@font-face|data:font|\.ttf\b|\.woff2?\b/i,'No duplicate downloadable or embedded fonts');
  assert.doesNotMatch(css,/WCSCiti|Citi-Sans-Text|Citi Sans|Inter\b/,'No forced application font');
  assert.doesNotMatch(css,/font(?:-family)?\s*:[^;}]*\b(?:Arial|sans-serif)\b/i,'UI controls inherit the host font as well');
  assert.match(css,/monospace/,'Code and source fields retain their deliberate monospace font');
  const dom=new JSDOM('<!doctype html><head><style>'+css+'</style></head><body></body>');
  try{
    const rules=cssRules(dom.window.document.styleSheets[0]);
    for(const rule of rules){
      for(const selector of rule.selectorText.split(',')){
        const nativeArticleRules=new Set([
          'body[data-wcs-active-style-flags~="hide-title"] #title-heading',
          'body[data-wcs-active-style-flags~="hide-actions"] #main-header .content-navigation',
          'body[data-wcs-active-style-flags~="hide-actions"] #content > .page-actions',
          'body[data-wcs-active-style-flags~="hide-comments"] #comments-section',
          'body[data-wcs-active-style-flags~="hide-comments"] #add-comment',
          'body[data-wcs-active-style-flags~="hide-footer"] #footer'
        ]);
        if([':root',':root[data-color-mode="dark"]','body[data-color-mode="dark"]'].includes(selector.trim())){
          for(let i=0;i<rule.style.length;i++)assert.match(rule.style[i],/^--wcs-(?:theme-|color-scheme$)/,'Root theme rules may only define namespaced variables, never change the host');
        }else if(nativeArticleRules.has(selector.trim())){
          assert.equal(rule.style.length,1);assert.equal(rule.style.getPropertyValue('display'),'none');assert.equal(rule.style.getPropertyPriority('display'),'important');
        }else if(/^body\[data-wcs-reader-nav(?:=native)?\]/.test(selector.trim())){
          assert.match(selector.trim(),/^body\[data-wcs-reader-nav(?:=native)?\](?::not\(:has\(#main\)\))?(?:$| (?:\.wcs-reader-|\.wcs-native-sidebar-tooltip(?:$|[ .:]|\[)|#main|#wcspedia))/,'Reader rules must remain opt-in and target only its navigation/content');
        }else assert.doesNotMatch(selector.trim(),/^(?:html|body|:root|\*)(?:\b|\s|[:.#\[]|$)/,'No global host reset: '+selector);
      }
    }
    for(const selector of ['#wcspedia','.wcs-loading-overlay','.wcs-add-document','.wcs-add-document-popover']){
      const fonts=rules.filter(rule=>rule.selectorText.split(',').some(s=>s.trim()===selector)).map(rule=>rule.style.getPropertyValue('font-family')).filter(Boolean);
      assert.ok(fonts.length,'Font declaration exists for '+selector);
      assert.ok(['inherit','var(--wcs-space-font,var(--wcs-resolved-space-font,inherit))'].includes(fonts.at(-1).trim()),selector+' uses inherited or resolved existing Confluence fonts');
    }
    for(const rule of rules.filter(rule=>/highcharts-(?:container|root)/.test(rule.selectorText))){
      const family=rule.style.getPropertyValue('font-family');if(family)assert.equal(family.trim(),'inherit');
    }
  }finally{dom.window.close();}
});

test('starter library has eight areas and no sample document or person records',()=>{
  const data=JSON.parse(read('attachments/wcspedia-published.json'));
  assert.deepEqual(data.documents,[]);assert.deepEqual(data.people,[]);assert.equal(data.areas.length,8);
  assert.equal(new Set(data.areas.map(area=>area.id)).size,8);
  assert.ok(!data.taxonomyAudit||data.taxonomyAudit.length===0);
  assert.equal(C.validateData(data),data,'The supplied clean library is accepted by the deployed adapter');
  const dom=page('home');
  try{assert.deepEqual(Object.keys(configure(dom).nativePublication.areaPageIds).sort(),data.areas.map(area=>area.id).sort());}
  finally{dom.window.close();}
});

test('the separate initial entitlement attachment contains only the requested bootstrap administrator',()=>{
  const E=require('../entitlements.js');
  const policy=E.validatePolicy(JSON.parse(read('initial-data/entitlements.json')));
  assert.equal(policy.revision,1);assert.deepEqual(policy.audit,[]);
  assert.equal(policy.records.length,1);assert.equal(policy.records[0].soeid,'BR47149');
  assert.equal(policy.records[0].scope,'*');assert.equal(policy.records[0].active,true);
  assert.deepEqual(policy.records[0].permissions.slice().sort(),[...E.PERMISSIONS].sort());
  assert.equal(read('initial-data/entitlements.json'),fs.readFileSync(path.join(__dirname,'../confluence-data-starters/entitlements.json'),'utf8'));
  assert.equal(fs.existsSync(path.join(directory,'attachments/entitlements.json')),false,'First-install policy is separate from routine JS uploads');
});

for(const {role,policyWritable=false} of Object.keys(entries).map(role=>({role})).concat([{role:'entitlements',policyWritable:true}]))test('uploaded '+role+(policyWritable?' with native policy edit permission':'')+' bootstraps without changing the existing header or host styles',async t=>{
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const host='<header id="existing-header"><a data-wcs-entitlements-link href="/existing-access">Existing navigation</a><div data-wcs-add-document>Existing create menu</div></header><aside id="existing-sidebar">Existing sidebar</aside>';
  const dom=new JSDOM('<!doctype html><html><head><style>body{font-family:"Existing Host Font";color:rgb(1,2,3)}#existing-header{padding:17px;background:rgb(4,5,6)}</style><style>'+read('attachments/wcspedia-style.css')+'</style></head><body>'+host+read('html/'+entries[role])+'</body></html>',{url:origin+'/confluence/pages/viewpage.action?pageId=999',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document,config=configure(dom),header=d.querySelector('#existing-header');
  browserAPIs(w);
  const headerBefore=header.outerHTML,bodyFont=w.getComputedStyle(d.body).fontFamily,headerStyle=w.getComputedStyle(header).cssText;
  // Replace installation placeholders with one isolated, read-only server fixture.
  config.rootPageId='100';config.charts={...config.charts,offline:true};
  config.nativePublication={...config.nativePublication,publishedRootPageId:'100',workingRootPageId:'200',areaPageIds:Object.fromEntries(Object.keys(config.nativePublication.areaPageIds).map((key,i)=>[key,String(300+i)]))};
  for(const key of ['workspaceEndpoint','workflowEndpoint','suggestionEndpoint','entitlementsEndpoint','metricsEndpoint','bookmarksEndpoint','healthEndpoint'])config[key]='';
  const requests=[];
  w.fetch=async(address,options={})=>{
    const target=url(String(address));requests.push({target,options});let body,status=200;
    assert.equal(options.method||'GET','GET','Clean startup never performs a write');
    assert.equal(target.origin,origin,'Native data stays on the authenticated Confluence origin');
    assert.match(target.pathname,/^\/confluence\/(?:rest\/api\/|download\/attachments\/)/,'No separately deployed backend route is used');
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.redirect,'error');
    if(target.pathname.endsWith('/rest/api/user/current'))body={type:'known',username:role==='entitlements'?'BR47149':'RE12345',userKey:'real-server-account',displayName:'Signed-in colleague'};
    else if(target.pathname.endsWith('/rest/api/content/900/child/attachment')){
      assert.equal(target.searchParams.get('filename'),'entitlements.json','Native startup never reads a whole-library JSON snapshot');
      body={results:[{id:'501',type:'attachment',title:'entitlements.json',container:{id:'900',type:'page'},version:{number:1}}],_links:{}};
    }
    else if(target.pathname.endsWith('/rest/api/content/900'))body=nativePage('900',{operations:policyWritable?[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}]:[]});
    else if(target.pathname.endsWith('/rest/api/content/900/property'))body={results:[],start:0,limit:100,_links:{}};
    else if(target.pathname.includes('/rest/api/content/900/property/')){status=404;body={message:'Initial policy has no managed pointer yet'};}
    else if(target.pathname.endsWith('/rest/api/content/200')){
      if(['saved','entitlements'].includes(role)){status=403;body={message:'Private working area is unavailable to this fixture'};}
      else body=nativePage('200');
    }
    else if(target.pathname.endsWith('/rest/api/content/200/restriction/byOperation/read'))body={operation:'read',restrictions:{user:{results:[]},group:{results:[{name:'wcspedia-authors'}]}}};
    else if(target.pathname.endsWith('/rest/api/content/200/child/page'))body={results:[],start:0,limit:50,size:0,_links:{}};
    else if(target.pathname.endsWith('/rest/api/space/WCS'))body={key:'WCS',operations:[]};
    else if(target.pathname.endsWith('/download/attachments/900/entitlements.json'))body=JSON.parse(read('initial-data/entitlements.json'));
    else if(target.pathname.endsWith('/download/attachments/900/wcspedia-published.json'))body=JSON.parse(read('attachments/wcspedia-published.json'));
    else if(target.pathname.endsWith('/rest/api/content/105/child/page'))body={results:[],start:0,limit:9,size:0,_links:{}};
    else if(target.pathname.endsWith('/rest/api/content/105'))body=nativePage('105');
    else if(target.pathname.endsWith('/rest/api/content/100'))body=nativePage('100');
    else if(target.pathname.endsWith('/rest/api/content/401'))body=nativePage('401',{title:'Native saved article'});
    else if(target.pathname.endsWith('/rest/api/content/search')){
      const cql=target.searchParams.get('cql')||'';
      assert.match(cql,/ancestor = 100/,'Mapped-area metadata remains within the WCSpedia tree');
      assert.match(cql,/space = "WCS"/,'Mapped-area metadata remains within the verified space');
      if((target.searchParams.get('expand')||'').includes('body.storage'))assert.ok(Number(target.searchParams.get('limit'))<=9,'Article bodies are confined to the visible card batch');
      if (/(?:^| AND )id IN \(/.test(cql)) {
        assert.doesNotMatch(target.searchParams.get('expand')||'',/body\./,'Area metadata does not fetch article bodies');
        assert.match(cql,/id IN \(300, 301, 302, 303, 304, 305, 306, 307\)/,'Only the configured area parents are fetched');
        body={results:Array.from({length:8},(_,i)=>nativePage(String(300+i),{title:'Business area '+i})),start:0,limit:8,size:8,_links:{}};
      } else if(role==='saved'&&cql.includes('favourite = currentUser()'))body={results:[nativePage('401',{title:'Native saved article'})],start:0,limit:50,size:1,_links:{}};
      else body={results:[],totalSize:0,start:0,limit:Number(target.searchParams.get('limit')),_links:{}};
    }
    else if(target.pathname.endsWith('/rest/api/search'))body={results:[],totalSize:0,start:0,limit:6,_links:{}};
    else throw Error('Unexpected startup request: '+target.href);
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false});
  assert.equal(requests.length,0,'Configuration alone does not fetch any data');
  await w.eval(read('attachments/wcspedia-notifications.js'));
  const globalNotifications=w.WCSNotifications;
  assert.ok(globalNotifications);
  const initialMount=d.querySelector('#wcspedia').innerHTML,initialOverlay=d.querySelector('.wcs-loading-overlay');
  assert.equal(initialOverlay,null,'Restored morning macro leaves loading to the application');
  assert.equal(w.WCSPageBoot,undefined);
  await w.eval(read(scriptFor(role)));await tick();await tick();
  assert.equal(w.WCS_CONFIG,config,'The page owns its configured settings');
  assert.equal(requests.length,0,'Loading the logic file does not fetch or render the page');
  assert.equal(d.querySelector('#wcspedia').innerHTML,initialMount,'The logic leaves the initial loading status untouched; the HTML renderer owns application markup');
  assert.equal(d.querySelector('.wcs-loading-overlay'),initialOverlay,'Loading the logic preserves the macro overlay');
  assert.equal(d.querySelectorAll('.wcs-loading-overlay').length,0);
  assert.ok(w.WCSPageModules&&w.WCSPageModules[role],'Matching logic registers its page role');
  assert.equal(d.querySelector('#wcspedia').getAttribute('data-wcs-page-role'),role,'The configured HTML marker matches the page role');
  assert.equal(w.WCSDiscoveryCatalog.areas.length,8,'The small navigation catalogue arrives in the existing logic attachment');
  assert.equal(w.WCSDiscoveryCatalog.documents.length,0,'No document bodies or reader snapshots are bundled');
  assert.equal(w.WCSDiscoveryCatalog.people.length,0,'The catalogue has no user or entitlement records');
  assert.equal(d.querySelector('#wcspedia').dataset.wcsPageStarted,undefined);
  for(const api of ['WCSConfluence','WCSSearch','WCSWorkflow','WCSEditor','WCSNavigation','WCSLoadingOverlay','WCSSpaceStorage','WCSSpaceWorkflow','WCSSpacePersonal'])assert.ok(w[api],'The page supplies its own dependency '+api);
  await w.eval(read(rendererFor(role)));
  assert.equal(w.WCS_CONFIG,config);
  await settled(()=>!!d.querySelector('#wcspedia h1,#wcspedia h2')&&!d.querySelector('.wcs-loading-overlay'),()=>role+' did not finish loading: '+d.querySelector('#wcspedia').textContent);
  if(role==='home')await settled(()=>[...d.querySelectorAll('.discovery-area [data-native-area-count]')].every(e=>e.textContent.trim()==='0 documents'),'Area counts finish after scoped native discovery');
  if(role==='saved')await settled(()=>d.querySelector('#wcspedia').textContent.includes('Native saved article'),()=>d.querySelector('#wcspedia').textContent);
  assert.equal(d.querySelector('#wcspedia').dataset.wcsPageStarted,role);
  assert.equal(w.WCSNotifications,globalNotifications,'Page uses the shared header singleton');
  assert.equal(header.outerHTML,headerBefore,'Existing header tools are not replaced');
  assert.equal(d.querySelectorAll('header').length,1,'No duplicate site header');
  assert.equal(d.querySelectorAll('#wcspedia').length,1,'One application mount');
  assert.equal(d.querySelector('.connection-bar,.wcs-preview-tools'),null,'Hosted pages do not add extra application chrome');
  assert.equal(d.querySelector('.wcs-loading-overlay'),null,'Loading completes and releases the page');
  assert.equal(d.querySelector('#wcspedia').hasAttribute('inert'),false);
  assert.ok(d.querySelector('#wcspedia h1,#wcspedia h2'),'The requested page or its permitted read-only state renders');
  assert.equal(w.location.hash,'','The named hosted page renders its own default without a redundant hash');
  assert.match(d.querySelector('#wcspedia h1,#wcspedia h2').textContent,initialHeadings[role]);
  if(role==='entitlements'){
    assert.match(d.querySelector('.entitlement-table').textContent,/BR47149/);
    assert.doesNotMatch(d.querySelector('#wcspedia').textContent,/until the entitlement service is connected/);
    if(policyWritable){
      const add=d.querySelector('[data-entitlement=add]');assert.ok(add);assert.equal(add.disabled,false);
      assert.ok(d.querySelector('[data-entitlement=edit]'));assert.ok(d.querySelector('[data-entitlement=revoke]'));
      add.click();await tick();
      assert.ok(d.querySelector('[data-entitlement-form]'),'The existing Add entitlement UI opens using native attachment persistence');
      assert.ok(d.querySelector('[data-entitlement-form] [name=soeid]'));
      d.querySelector('[data-entitlement-cancel]').click();await tick();
      assert.equal(d.querySelector('[data-entitlement-form]'),null,'Cancelling does not write policy');
    } else {
      assert.equal(d.querySelector('[data-entitlement=add]'),null);
      assert.equal(d.querySelector('[data-entitlement=edit],[data-entitlement=revoke]'),null,'JSON grants alone cannot bypass native edit permission on the policy host');
    }
  }
  if(role==='review')assert.match(d.querySelector('#wcspedia').textContent,/Review tasks are available to assigned reviewers/,'An unmapped reader is not granted reviewer access');
  assert.doesNotMatch(d.querySelector('#wcspedia').textContent,/WCSpedia could not load|Alex Morgan|Jamie Patel/);
  assert.equal(w.getComputedStyle(d.body).fontFamily,bodyFont);
  assert.equal(w.getComputedStyle(header).cssText,headerStyle);
  assert.equal(d.querySelector('#existing-sidebar').textContent,'Existing sidebar');
  if(role==='home'){
    assert.equal(d.querySelectorAll('.discovery-area').length,0,'The clean landing omits business-area cards');
    assert.deepEqual([...d.querySelectorAll('.discovery-area [data-native-area-count]')].map(element=>element.textContent.trim()),[],'Home no longer renders business-area counts');
    assert.ok(requests.some(request=>request.target.pathname.endsWith('/rest/api/content/search')),'The landing page discovers native children directly through Content CQL');
    assert.equal(requests.some(request=>request.target.pathname.endsWith('/entitlements.json')||request.target.searchParams.get('filename')==='entitlements.json'),false,'Discovery does not load authoring policy before displaying native pages');
  }
  await w.WCSConfluence.create(config).searchPages({scope:'tree',query:'loan',limit:6});
  assert.ok(requests.some(request=>request.target.pathname.endsWith('/rest/api/user/current')),'The signed-in identity is read from Confluence');
  const discoveryRole=['home','insights','saved'].includes(role);
  assert.equal(requests.some(request=>request.target.pathname.endsWith('/download/attachments/900/wcspedia-published.json')),false,'Native views load current Confluence data without a whole-library JSON snapshot');
  assert.equal(config.spaceKey,'WCS','Native storage receives the landing page’s verified space key');
  if(['saved','entitlements'].includes(role)){
    assert.equal(requests.some(request=>request.target.pathname.endsWith('/rest/api/content/200/child/page')),false,'This page does not load document workspace metadata');
    assert.equal(requests.some(request=>(request.target.searchParams.get('filename')||'')==='wcspedia-document.json'),false);
  }
  if(role==='saved'){
    assert.equal(requests.some(request=>request.target.pathname.endsWith('/entitlements.json')||request.target.searchParams.get('filename')==='entitlements.json'),false,'Saved items do not depend on the entitlement attachment');
    const nativeLink=[...d.querySelectorAll('#wcspedia a[href]')].find(a=>a.textContent.includes('Native saved article'));
    assert.ok(nativeLink,'A saved native page does not need a managed JSON document record');
    assert.equal(url(nativeLink.href).searchParams.get('pageId'),'401');
    assert.equal(url(nativeLink.href).hash,'');
    assert.doesNotMatch(d.querySelector('#wcspedia').textContent,/Invalid Date|undefined|NaN/);
    assert.ok(requests.some(request=>(request.target.searchParams.get('cql')||'').includes('favourite = currentUser()')),'Saved items use the current user’s personal Confluence favourites');
  }
  if(!discoveryRole)assert.ok(requests.some(request=>request.target.pathname.endsWith('/rest/api/content/900/child/attachment')),'Managed views retain version-pinned attachment metadata');
  assert.ok(requests.some(request=>request.target.pathname.endsWith('/rest/api/content/100')),'Search resolves the landing page context, not the attachment page');
  assert.equal(requests.some(request=>request.target.pathname.endsWith('/rest/api/search')),false,'The standard install avoids a redundant Search-to-Content compatibility request');
  for(const request of requests.filter(request=>request.target.pathname.endsWith('/rest/api/content/search'))){
    const cql=request.target.searchParams.get('cql');
    assert.match(cql,/ancestor\s*=\s*100/,'CQL includes all descendants of the real landing page');
    assert.doesNotMatch(cql,/ancestor\s*=\s*900/,'CQL does not search the attachment host tree');
  }
  if(role==='insights'){
    await settled(()=>d.querySelector('.wcs-insights-empty'),'Insights finishes native discovery without an analytics policy check');
    assert.ok(requests.some(request=>request.target.pathname.endsWith('/rest/api/content/105/child/page')),'Insights lists native children without waiting for indexing');
    await tick();await tick();
  }
  const requestsBeforeRepeat=requests.length,rendered=d.querySelector('#wcspedia').innerHTML,navigation=w.WCSNavigation;
  await w.eval(read(scriptFor(role)));await w.eval(read(rendererFor(role)));await tick();await tick();
  assert.equal(requests.length,requestsBeforeRepeat,'Loading the same page script twice never repeats data requests: '+requests.slice(requestsBeforeRepeat).map(r=>r.target.pathname+'?'+r.target.searchParams).join(' | '));
  assert.equal(d.querySelector('#wcspedia').innerHTML,rendered,'Loading twice leaves the rendered page intact');
  assert.equal(w.WCSNavigation,navigation,'Loading twice does not replace shared dependencies or bind handlers again');
  const routes={home:'#/',mine:'#/results?view=mine',review:'#/review',saved:'#/saved',entitlements:'#/entitlements',insights:'#/insights'};
  for(const [targetRole,href] of Object.entries(routes)){
    const target=w.WCSNavigation.resolve(href,config,w.location.href);
    if(targetRole===role)assert.equal(target,href,'The active page keeps local routing');
    else{
      const destination=url(target),configured=url(config.pages[targetRole]);
      assert.equal(destination.pathname,configured.pathname);
      assert.equal(destination.search,configured.search,'Cross-page navigation uses the configured Confluence page ID');
      assert.equal(destination.hash,'');
    }
  }
  assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));
});

test('mismatched logic or HTML renderer fails visibly before loading dependencies or making requests',async()=>{
  for(const role of Object.keys(entries))for(const fileFor of [scriptFor,rendererFor]){
    const dom=page(role);
    try{
      const w=dom.window,d=w.document;
      configure(dom);
      const wrongRole=role==='home'?'mine':'home',requests=[];
      w.fetch=async address=>{requests.push(address);throw Error('A mismatched script must not fetch');};
      await w.eval(read(fileFor(wrongRole)));await tick();
      assert.equal(requests.length,0,role+' did not request data');
      assert.match(d.querySelector('#wcspedia .boot-state').textContent,/does not match/i);
      assert.ok(d.querySelector('#wcspedia [role="alert"]'),'The configuration error is announced');
      assert.equal(w.WCSConfluence,undefined,'Role mismatch is rejected before executing dependencies');
      assert.equal(d.querySelector('.wcs-loading-overlay'),null);
    }finally{dom.window.close();}
  }
});

test('a mismatched inline configuration fails before page startup',async()=>{
  const dom=page('home');
  try{
    const w=dom.window,config=configure(dom),requests=[];
    config.pageRole='review';
    w.fetch=async address=>{requests.push(address);throw Error('A mismatched configuration must not fetch');};
    await w.eval(read(scriptFor('home')));await tick();
    assert.equal(requests.length,0);
    assert.match(w.document.querySelector('#wcspedia .boot-state').textContent,/does not match/i);
    assert.equal(w.WCSConfluence,undefined);
  }finally{dom.window.close();}
});


test('HTML renderer reports missing matching logic before requests or overlay startup',async()=>{
  for(const role of Object.keys(entries)){
    const dom=page(role);
    try{
      const w=dom.window,requests=[];
      configure(dom);
      w.fetch=async address=>{requests.push(address);throw Error('Missing logic must not fetch');};
      await w.eval(read(rendererFor(role)));await tick();
      assert.equal(requests.length,0);
      assert.match(w.document.querySelector('#wcspedia .boot-state[role="alert"]').textContent,/Load .+ before /i);
      assert.equal(w.document.querySelector('.wcs-loading-overlay'),null);
      assert.equal(w.document.querySelector('#wcspedia').dataset.wcsPageStarted,undefined);
    }finally{dom.window.close();}
  }
});

test('HTML renderer rejects mismatched configuration after its logic has loaded',async()=>{
  const dom=page('home');
  try{
    const w=dom.window,config=configure(dom),requests=[];
    w.fetch=async address=>{requests.push(address);throw Error('Mismatched configuration must not fetch');};
    await w.eval(read(scriptFor('home')));
    config.pageRole='review';
    await w.eval(read(rendererFor('home')));await tick();
    assert.equal(requests.length,0);
    assert.match(w.document.querySelector('#wcspedia .boot-state[role="alert"]').textContent,/does not match/i);
    assert.equal(w.document.querySelector('#wcspedia').dataset.wcsPageStarted,undefined);
  }finally{dom.window.close();}
});


test('notifications load once from the existing header and stay outside content-only page bundles',()=>{
  const fragment=read('html/wcspedia-notifications-header.html'),dom=new JSDOM(fragment,{runScripts:'outside-only',url:origin+'/confluence/pages/viewpage.action?pageId=100'});
  try{
    const scripts=[...dom.window.document.querySelectorAll('script')];assert.equal(scripts.length,1);
    assert.doesNotMatch(fragment,/<\/?(?:html|head|body|meta)\b/i);
    assert.equal(dom.window.document.querySelectorAll('#wcspedia,header,style,link').length,0);
    const asset=url(scripts[0].getAttribute('src'));assert.equal(path.posix.basename(asset.pathname),'wcspedia-notifications.js');
    const runtime=read('attachments/wcspedia-notifications.js');
    dom.window.eval(runtime);const api=dom.window.WCSNotifications;dom.window.eval(runtime);assert.equal(dom.window.WCSNotifications,api);
    for(const role of Object.keys(entries)) {assert.equal(read(scriptFor(role)).includes(runtime),false,'Header runtime is not duplicated in '+role);assert.match(read(rendererFor(role)),/WCSNotifications/);}
    for(const type of ['success','error','warning','info'])api.show('Outcome '+type,{type,duration:0});
    const region=dom.window.document.querySelector('#wcs-notifications');assert.ok(region);assert.equal(region.parentElement,dom.window.document.body);
  }finally{dom.window.close();}
});

test('sidebar is delivered as an article-local loader, never in the shared flag helper',()=>{
 assert.doesNotMatch(read('attachments/wcspedia-page-style-flags.js'),/WCSReaderSidebar/);
 assert.match(read('attachments/wcspedia-reader-sidebar.js'),/WCSReaderSidebar/);
 const dom=new JSDOM(read('html/wcspedia-reader-sidebar.html'));
 try{assert.equal(dom.window.document.querySelectorAll('script').length,1);assert.match(dom.window.document.querySelector('script').src,/wcspedia-reader-sidebar\.js\?api=v2$/);assert.equal(dom.window.document.querySelectorAll('header,style,link').length,0);}finally{dom.window.close();}
});

test('all 50 cover attachments are local JPEGs under the server limit with recorded sources',()=>{
 const sources=JSON.parse(read('licenses/insights-cover-sources.json'));assert.equal(sources.length,50);
 for(const item of sources){const bytes=fs.readFileSync(path.join(directory,'attachments',item.file));assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.ok(bytes.length<10_000_000);assert.match(item.sourceUrl,/^https:\/\/www\.citigroup\.com\//);}
});

test('missing HTML marker never permits a script for the wrong configured role',async t=>{
 const dom=page('home');t.after(()=>dom.window.close());const w=dom.window,d=w.document;configure(dom);
 d.querySelector('#wcspedia').removeAttribute('data-wcs-page-role');
 w.fetch=()=>{throw Error('Wrong-role scripts must not request data');};
 await w.eval(read(scriptFor('saved')));
 assert.match(d.querySelector('.boot-state').textContent,/does not match/);
 assert.equal(w.WCSConfluence,undefined);assert.equal(d.querySelector('.wcs-loading-overlay'),null);
});
test('conflicting explicit marker is rejected even when inline settings match the script',async t=>{
 const dom=page('home');t.after(()=>dom.window.close());const w=dom.window,d=w.document;configure(dom);
 d.querySelector('#wcspedia').setAttribute('data-wcs-page-role','saved');
 await w.eval(read(scriptFor('home')));
 assert.match(d.querySelector('.boot-state').textContent,/does not match/);
 assert.equal(w.WCSConfluence,undefined);assert.equal(d.querySelector('.wcs-loading-overlay'),null);
});
test('mixed build versions remain blocked before application startup',async t=>{
 const dom=page('home');t.after(()=>dom.window.close());const w=dom.window,d=w.document;configure(dom);
 await w.eval(read(scriptFor('home')));w.WCSPageModules.home.version='previous-build';
 await w.eval(read(rendererFor('home')));
 assert.match(d.querySelector('.boot-state').textContent,/same upload package/);
 assert.equal(d.querySelector('#wcspedia').dataset.wcsPageStarted,undefined);assert.equal(d.querySelector('.wcs-loading-overlay'),null);
});



test('shared PAL font helper is shipped once in navBar without sidebar activation or a font CDN',()=>{
 const header=fs.readFileSync(path.join(__dirname,'../ready/shared/navbar.html'),'utf8');
 assert.equal((header.match(/<script src="[^"\n]*wcspedia-space-typography\.js/g)||[]).length,1);
 assert.doesNotMatch(header,/<script src="[^"\n]*wcspedia-reader-sidebar\.js/);
 const helper=read('attachments/wcspedia-space-typography.js');
 assert.equal(helper,fs.readFileSync(path.join(__dirname,'../space-typography.js'),'utf8'));
 assert.doesNotMatch(helper,/fetch\(|https?:|new FontFace|WCSReaderSidebar/);
 assert.ok(fs.existsSync(path.join(directory,'licenses/sidebar-icons-LICENSE.txt')));
});
