const test=require('node:test'),assert=require('node:assert/strict'),nav=require('./navigation.js');
const config={pageRole:'home',pages:{home:'./wcspedia-local.html',mine:'./wcspedia-my-workspace.html',review:'./wcspedia-reviewer-workspace.html',saved:'./wcspedia-saved-items.html',insights:'./wcspedia-insights.html'}};
const base='http://127.0.0.1:4173/wcspedia-local.html';
test('each configured business area opens Explore on its own native host and returns home correctly',()=>{
 const installation=require('./confluence-installation.json'),areas=installation.areaPageIds,origin='https://example.test';
 const settings={mode:'confluence',contextPath:'/confluence',pageRole:'home',pages:{home:'/confluence/pages/viewpage.action?pageId='+installation.pageIds.home},nativePublication:{areaPageIds:areas}};
 for(const [area,id] of Object.entries(areas)){
  const scoped={...settings,businessArea:area},host=origin+'/confluence/pages/viewpage.action?pageId='+id;
  assert.equal(nav.initialHash(scoped),'#/topic/'+area);
  assert.equal(nav.resolve('#/topic/'+area,settings,origin+'/confluence/'),host+'#/topic/'+area);
  assert.equal(nav.resolve('#/results?area='+area+'&q=loan&page=2',scoped,host),'#/results?area='+area+'&q=loan&page=2');
  assert.equal(nav.resolve('#/',scoped,host),origin+settings.pages.home);
  assert.equal(nav.resolve('#/results',scoped,host),origin+settings.pages.home+'#/results');
  assert.equal(nav.resolve('#/published/789',scoped,host),'#/published/789');
 }
});
test('dedicated pages receive document-authoring and review routes with filters intact',()=>{
 assert.equal(nav.resolve('#/results?view=mine&q=credit',config,base),'http://127.0.0.1:4173/wcspedia-my-workspace.html#/results?view=mine&q=credit');
 assert.equal(nav.resolve('#/edit/doc-1',config,base),'http://127.0.0.1:4173/wcspedia-my-workspace.html#/edit/doc-1');
 assert.equal(nav.resolve('#/review/doc-1',{...config,pageRole:'mine'},base),'http://127.0.0.1:4173/wcspedia-reviewer-workspace.html#/review/doc-1');
 assert.equal(nav.resolve('#/review?stage=In+review',{...config,pageRole:'review'},base),'#/review?stage=In+review');
});
test('native Confluence page query parameters are preserved',()=>{
 const cfg={...config,pages:{mine:'/confluence/pages/viewpage.action?pageId=REPLACE_WITH_MY_WORKSPACE_PAGE_ID'}};
 assert.equal(nav.resolve('#/create?type=Training',cfg,'https://example.test/confluence/pages/viewpage.action?pageId=123'),'https://example.test/confluence/pages/viewpage.action?pageId=REPLACE_WITH_MY_WORKSPACE_PAGE_ID#/create?type=Training');
});
test('unconfigured, external and executable page URLs never become application redirects',()=>{
 for(const dest of ['https://evil.test/page','javascript:alert(1)','data:text/html,test'])assert.equal(nav.resolve('#/create',{...config,pages:{mine:dest}},base),'#/create');
 assert.equal(nav.resolve('#/create',{},base),'#/create');
 assert.equal(nav.resolve('https://example.test',config,base),'https://example.test');
});
test('each entry point opens its own default view',()=>{
 assert.equal(nav.initialHash({initialView:'search'}),'#/?focus=search');
 assert.equal(nav.initialHash({pageRole:'mine'}),'#/results?view=mine');
 assert.equal(nav.initialHash({pageRole:'review'}),'#/review');
 assert.equal(nav.initialHash({pageRole:'saved'}),'#/saved');
 assert.equal(nav.initialHash({pageRole:'insights'}),'#/insights');
 assert.equal(nav.initialHash({initialView:'insights'}),'#/insights');
 assert.equal(nav.initialHash({initialView:'saved'}),'#/saved');
 assert.equal(nav.initialHash({documentId:'a/b'}),'#/document/a%2Fb');
});
test('Saved items has a dedicated page with search preserved and returns readers to the main library',()=>{
 assert.equal(nav.resolve('#/saved?q=credit&page=2',config,base),'http://127.0.0.1:4173/wcspedia-saved-items.html#/saved?q=credit&page=2');
 assert.equal(nav.resolve('#/saved',{...config,pageRole:'mine'},base),'http://127.0.0.1:4173/wcspedia-saved-items.html#/saved');
 assert.equal(nav.resolve('#/saved?q=credit',{...config,pageRole:'saved'},base),'#/saved?q=credit');
 const saved={...config,pageRole:'saved'},savedBase='http://127.0.0.1:4173/wcspedia-saved-items.html';
 assert.equal(nav.resolve('#/search',saved,savedBase),'http://127.0.0.1:4173/wcspedia-local.html#/?focus=search');
 assert.equal(nav.resolve('#/search',config,base),'#/?focus=search');
 assert.equal(nav.resolve('#/',saved,savedBase),'http://127.0.0.1:4173/wcspedia-local.html#/');
 assert.equal(nav.resolve('#/document/doc-a?tab=content&version=2',saved,savedBase),'http://127.0.0.1:4173/wcspedia-local.html#/document/doc-a?tab=content&version=2');
});
test('hosted Saved items preserves its Confluence page ID and older configurations retain local hash routing',()=>{
 const hosted={...config,pages:{...config.pages,saved:'/confluence/pages/viewpage.action?pageId=REPLACE_WITH_SAVED_ITEMS_PAGE_ID'}};
 assert.equal(nav.resolve('#/saved?q=credit',hosted,'https://example.test/confluence/pages/viewpage.action?pageId=123'),'https://example.test/confluence/pages/viewpage.action?pageId=REPLACE_WITH_SAVED_ITEMS_PAGE_ID#/saved?q=credit');
 const legacy={...config,pages:{home:config.pages.home,mine:config.pages.mine}};
 assert.equal(nav.resolve('#/saved',legacy,base),'#/saved');
 assert.equal(nav.resolve('#/saved',{...config,pages:{saved:'https://evil.example/saved'}},base),'#/saved');
});

const hosted={mode:'confluence',pageRole:'home',pages:{home:'/confluence/pages/viewpage.action?pageId=100&spaceKey=WCS',mine:'/confluence/pages/viewpage.action?pageId=101',review:'/confluence/pages/viewpage.action?pageId=102',saved:'/confluence/pages/viewpage.action?pageId=103',entitlements:'/confluence/display/WCS/Entitlements?src=header',insights:'/confluence/pages/viewpage.action?pageId=3961735728'}};
const hostedBase='https://example.test/confluence/pages/viewpage.action?pageId=100&spaceKey=WCS';
const defaultRoutes={home:'#/',mine:'#/results?view=mine',review:'#/review',saved:'#/saved',entitlements:'#/entitlements',insights:'#/insights'};
for(const [role,hash] of Object.entries(defaultRoutes))test('hosted '+role+' default has a clean URL and a stable logical route',()=>{
  const cfg={...hosted,pageRole:role},page='https://example.test'+hosted.pages[role];
  assert.equal(nav.canonicalUrl(cfg,page+hash),page);
  assert.equal(nav.canonicalUrl(cfg,page+'#'),page);
  assert.equal(nav.routeHash(cfg,''),hash);
  assert.equal(nav.routeHash(cfg,hash),hash);
  assert.equal(nav.canonicalUrl({...cfg,mode:'embedded'},page+hash),page+hash,'Local/demo addresses retain their explicit routes');
  const sourceRole=role==='home'?'saved':'home';
  assert.equal(nav.resolve(hash,{...hosted,pageRole:sourceRole},hostedBase),page,'Cross-page defaults need no duplicate fragment');
  assert.equal(nav.resolve(hash,cfg,page),hash,'Same-page transitions keep the existing hashchange lifecycle');
});
test('hosted canonical URLs retain meaningful search, pagination and editor routes',()=>{
  for(const [role,hash] of [['home','#/results?q=credit&year=2020'],['mine','#/results?view=mine&page=2'],['review','#/review?stage=In+review'],['saved','#/saved?q=loan'],['entitlements','#/entitlements?tab=audit'],['mine','#/edit/doc-1'],['home','#/?focus=search']]){
    const cfg={...hosted,pageRole:role},page='https://example.test'+hosted.pages[role];
    assert.equal(nav.canonicalUrl(cfg,page+hash),page+hash);assert.equal(nav.routeHash(cfg,hash),hash);
  }
  assert.equal(nav.resolve('#/saved?q=loan',hosted,hostedBase),'https://example.test/confluence/pages/viewpage.action?pageId=103#/saved?q=loan');
});
test('custom initial views and document-bound pages retain their explicit default routes',()=>{
  for(const cfg of [{...hosted,initialView:'results'},{...hosted,documentId:'doc-1'},{...hosted,pageRole:'unknown'}])assert.equal(nav.canonicalUrl(cfg,hostedBase+'#/'),hostedBase+'#/');
  assert.equal(nav.routeHash({...hosted,documentId:'doc-1'},''),'#/document/doc-1');
  assert.equal(nav.canonicalUrl(hosted,'invalid url'),'invalid url');
});

test('Insights preserves filters across native navigation without adding a redundant default fragment',()=>{
 assert.equal(nav.roleFor('#/insights?q=credit'),'insights');
 assert.equal(nav.resolve('#/insights?type=Blog&topic=Credit',hosted,hostedBase),'https://example.test/confluence/pages/viewpage.action?pageId=3961735728#/insights?type=Blog&topic=Credit');
 assert.equal(nav.resolve('#/insights',hosted,hostedBase),'https://example.test/confluence/pages/viewpage.action?pageId=3961735728');
 assert.equal(nav.resolve('#/insights',{...hosted,pages:{insights:'https://other.example/insights'}},hostedBase),'#/insights');
});

test('deletion keeps the current list and filters instead of using content type routing',()=>{
  const nav=require('./navigation.js');
  for(const hash of ['#/results?view=mine&type=Blog&page=2&q=test','#/review?stage=In+review&page=3','#/insights?topic=Credit','#/saved?q=test','#/topic/credit-approval-control?q=loan']){
    assert.equal(nav.afterDelete({pageRole:'mine'},hash,'#/insights'),hash);
  }
  assert.equal(nav.afterDelete({pageRole:'mine'},''),'#/results?view=mine');
  assert.equal(nav.afterDelete({pageRole:'review'},''),'#/review');
});
test('reader deletion uses a safe originating list or the current host default',()=>{
  const nav=require('./navigation.js'),origin='#/results?view=mine&type=Blog&page=2';
  assert.equal(nav.afterDelete({pageRole:'home'},'#/document/abc?returnTo='+encodeURIComponent(origin)),origin);
  assert.equal(nav.afterDelete({pageRole:'review'},'#/review/abc','#/review?q=loan'),'#/review?q=loan');
  for(const invalid of ['https://example.com/','javascript:alert(1)','#/document/deleted','#/review/deleted'])assert.equal(nav.afterDelete({pageRole:'mine'},'#/document/abc?returnTo='+encodeURIComponent(invalid)),'#/results?view=mine');
});
