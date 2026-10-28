/* Exercise the delivered Confluence macro through real local HTTP requests.
 * No test request may leave the isolated loopback server.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/confluence-upload-http.test.cjs
 */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');
const directory=path.join(__dirname,'../confluence-upload');
const read=file=>fs.readFileSync(path.join(directory,file),'utf8');
function installed(source){
  const ids={REPLACE_WITH_WCSPEDIA_PAGE_ID:'100',REPLACE_WITH_ATTACHMENTS_PAGE_ID:'900',REPLACE_WITH_MY_WORKSPACE_PAGE_ID:'101',REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID:'102',REPLACE_WITH_SAVED_ITEMS_PAGE_ID:'103',REPLACE_WITH_ENTITLEMENTS_PAGE_ID:'104',REPLACE_WITH_RESTRICTED_WORKING_ROOT_PAGE_ID:'200',REPLACE_WITH_INSIGHTS_PAGE_ID:'800'};
  let nextArea=300;
  return source.replace(/REPLACE_WITH_[A-Z0-9_]+/g,key=>ids[key]||(ids[key]=String(nextArea++)));
}
async function until(condition,message){
  const deadline=Date.now()+5000;
  while(!condition()){
    assert.ok(Date.now()<deadline,message);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}

for(const scenario of [{responseModel:'totalSize'},{responseModel:'totalCount'},{responseModel:'absent'},{responseModel:'absent',earlyArea:true}])test('landing macro uses direct scoped Content Search with '+scenario.responseModel+' totals'+(scenario.earlyArea?' and an immediate area click':''),async t=>{
  const {responseModel,earlyArea}=scenario,requests=[],errors=[],unexpected=[],held=[];
  const macro=installed(read('html/wcspedia-landing.html'));
  const stylesheet=installed(read('html/wcspedia-global-styles.html'));
  const html='<!doctype html><html><head>'+stylesheet+'</head><body><header id="host-header">Existing Citi header'+installed(read('html/wcspedia-notifications-header.html'))+'</header>'+macro+'</body></html>';
  const assets=new Map([
    ['wcspedia-notifications.js','application/javascript'],['wcspedia-landing.js','application/javascript'],['wcspedia-landingHTMLPage.js','application/javascript'],['wcspedia-style.css','text/css'],['wcspedia-logo.png','image/png'],['citi-logo.png','image/png']
  ]);
  const child={id:'123',type:'page',title:'Nested training result',space:{key:'WCS'},ancestors:[{id:'100'},{id:'300'},{id:'120'}],version:{number:2,when:'2026-10-16T09:00:00Z'},metadata:{labels:{results:[]}}};
  const areaPages=Array.from({length:8},(_,i)=>({id:String(300+i),type:'page',title:'Business area '+i,space:{key:'WCS'},ancestors:[{id:'100'}],version:{number:1}}));
  const server=http.createServer((request,response)=>{
    const target=new URL(request.url,'http://localhost'),record={method:request.method,target,receivedAt:performance.now()};requests.push(record);
    function send(status,type,body){record.respondedAt=performance.now();response.writeHead(status,{'Content-Type':type+(type.startsWith('text/')||type==='application/javascript'||type==='application/json'?'; charset=utf-8':'')});response.end(body);}
    function json(body){send(200,'application/json',JSON.stringify(body));}
    if(request.method!=='GET'){unexpected.push(request.method+' '+request.url);send(405,'text/plain','Read-only fixture');return;}
    if(target.pathname==='/confluence/pages/viewpage.action'&&target.searchParams.get('pageId')==='100'){send(200,'text/html',html);return;}
    const attachment=target.pathname.match(/^\/confluence\/download\/attachments\/900\/([^/]+)$/);
    if(attachment&&assets.has(attachment[1])){send(200,assets.get(attachment[1]),fs.readFileSync(path.join(directory,'attachments',attachment[1])));return;}
    if(target.pathname==='/confluence/rest/api/content/900/child/attachment'){json({results:[{id:target.searchParams.get('filename')==='entitlements.json'?'501':'500',title:target.searchParams.get('filename'),version:{number:1}}]});return;}
    if(target.pathname==='/confluence/download/attachments/900/wcspedia-published.json'){send(200,'application/json',read('attachments/wcspedia-published.json'));return;}
    if(target.pathname==='/confluence/rest/api/content/900'){json({id:'900',type:'page',operations:[],version:{number:1}});return;}
    if(target.pathname==='/confluence/download/attachments/900/entitlements.json'){send(200,'application/json',read('initial-data/entitlements.json'));return;}
    if(target.pathname==='/confluence/rest/api/user/current'){setTimeout(()=>json({type:'known',username:'RE12345',userKey:'real-server-account',displayName:'Signed-in colleague'}),50);return;}
    if(target.pathname==='/confluence/rest/api/content/100'){setTimeout(()=>json({id:'100',type:'page',space:{key:'WCS'},operations:[{operation:'read',targetType:'page'}],version:{number:1}}),50);return;}
    if(target.pathname==='/confluence/rest/api/content/search'){
      const cql=target.searchParams.get('cql')||'',selected=cql.match(/(?:^| AND )id IN \(([^)]+)\)/);
      const ids=selected?new Set(selected[1].split(',').map(value=>value.trim())):null;
      const results=ids?[...areaPages,child].filter(page=>ids.has(page.id)):/ancestor\s*=\s*30[1-7]\b/.test(cql)?[]:[child];
      const payload={results,start:0,limit:Number(target.searchParams.get('limit'))||results.length,size:results.length,_links:{}};
      if(responseModel!=='absent')payload[responseModel]=results.length;
      const sendResult=()=>json(payload);
      if((earlyArea&&/\(id = 300 OR ancestor = 300/.test(cql))||(cql.includes('text ~')&&cql.includes('pending')))held.push({target,send:sendResult});
      else sendResult();return;
    }
    unexpected.push(request.url);send(404,'text/plain','Unexpected fixture request');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin='http://127.0.0.1:'+server.address().port;
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error));
  class LocalResources extends ResourceLoader{
    fetch(address,options){
      if(new URL(address).origin!==origin){errors.push(new Error('External resource blocked: '+address));return null;}
      return super.fetch(address,options);
    }
  }
  const dom=await JSDOM.fromURL(origin+'/confluence/pages/viewpage.action?pageId=100',{
    runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole,
    beforeParse(w){
      w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
      w.fetch=(address,options)=>{
        const target=new URL(String(address),origin);
        if(target.origin!==origin)return Promise.reject(new Error('External request blocked: '+target.href));
        // Bridge jsdom cancellation to Node's HTTP fetch without replacing DOM signals.
        if(!options?.signal)return fetch(target,options);
        const controller=new AbortController(),abort=()=>controller.abort();
        if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});
        return fetch(target,{...options,signal:controller.signal}).finally(()=>options.signal.removeEventListener('abort',abort));
      };
      w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false});
    }
  });
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  await until(()=>d.querySelector('#wcspedia h1'),'Landing renderer did not complete through its actual script URLs');
  assert.match(d.querySelector('#wcspedia h1').textContent,/A world of knowledge\./);
  assert.equal(d.querySelector('#host-header').textContent.trim(),'Existing Citi header');
  assert.ok(w.WCSNotifications,'Shared header installs the notifications API');
  assert.equal(d.querySelectorAll('header').length,1);
  assert.equal(d.querySelector('#wcspedia').dataset.wcsPageStarted,'home');
  assert.equal(w.WCS_CONFIG.rootPageId,'100');assert.equal(w.WCS_CONFIG.attachmentPageId,'900');
  assert.equal(w.WCS_CONFIG.nativePublication.insightsPageId,'800');
  assert.equal(w.WCS_CONFIG.pageRole,'home');
  for(const name of ['wcspedia-notifications.js','wcspedia-landing.js','wcspedia-landingHTMLPage.js']){
    assert.equal(requests.filter(request=>request.target.pathname==='/confluence/download/attachments/900/'+name).length,1,name+' loads exactly once over HTTP');
  }
  assert.equal(requests.some(request=>/wcspedia-config\.js/.test(request.target.pathname)),false,'No external configuration request is needed');
  const assertFastBootstrap=()=>{
    assert.equal(requests.some(request=>request.target.pathname.endsWith('/wcspedia-published.json')||request.target.searchParams.get('filename')==='wcspedia-published.json'),false,'Native discovery never waits for the reader projection attachment');
    assert.equal(requests.some(request=>request.target.pathname==='/confluence/rest/api/search'),false,'Discovery uses one direct Content Search transport');
    const account=requests.find(request=>request.target.pathname==='/confluence/rest/api/user/current'),scope=requests.find(request=>request.target.pathname==='/confluence/rest/api/content/100');
    assert.ok(account&&scope,'Both identity and root scope are verified');
    assert.ok(account.receivedAt<scope.respondedAt&&scope.receivedAt<account.respondedAt,'Identity and root validation run concurrently');
  };
  assertFastBootstrap();
  assert.equal(requests.some(request=>request.target.pathname.endsWith('/entitlements.json')||request.target.searchParams.get('filename')==='entitlements.json'),false,'Read-only discovery does not wait for the entitlement policy');
  if(earlyArea){
    await until(()=>held.length===1,'The first area request was not started');
    const firstArea=held[0],before=requests.filter(request=>request.target.searchParams.get('cql')===firstArea.target.searchParams.get('cql')).length;
    d.querySelector('.discovery-area').click();
    await until(()=>d.querySelector('#native-search-results'),'The immediate area click did not open its results screen');
    firstArea.send();
    await until(()=>d.querySelector('#native-search-results .press-card h2')?.textContent==='Nested training result','The in-flight area response was not handed to the clicked screen');
    assert.equal(before,1);assert.equal(requests.filter(request=>request.target.searchParams.get('cql')===firstArea.target.searchParams.get('cql')).length,1,'An immediate area click joins the pending request instead of aborting and refetching it');
    assert.equal(d.querySelector('select[data-filter="area"]').value,'credit-approval-control');
    assert.match(firstArea.target.searchParams.get('cql'),/^type = page AND ancestor = 100 AND space = "WCS"/);
    assert.match(firstArea.target.searchParams.get('cql'),/ancestor NOT IN \(200\)/);
    assertFastBootstrap();assert.deepEqual(unexpected,[]);assert.deepEqual(errors.map(error=>error.message),[]);return;
  }
  await until(()=>d.querySelector('.featured-document h3')?.textContent==='Nested training result','Landing page did not display the native child without a populated JSON snapshot');
  assert.equal(d.querySelectorAll('.discovery-area').length,9);
  await until(()=>[...d.querySelectorAll('.discovery-area [data-native-area-count]')].every(element=>!/^Loading/.test(element.textContent.trim())),'Progressive business-area counts did not finish');
  const counts=[...d.querySelectorAll('.discovery-area [data-native-area-count]')].map(element=>element.textContent.trim());
  if(responseModel==='absent')assert.ok(counts.every(count=>!/^\d+ documents?$/.test(count)),'An endpoint without totals does not invent exact business-area counts');
  else assert.deepEqual(counts,['1 document',...Array(7).fill('0 documents')]);
  assert.equal(new URL(d.querySelector('.featured-document h3 a').href).searchParams.get('pageId'),'123','The landing card links directly to the native child');
  assert.doesNotMatch(d.querySelector('.featured-grid').textContent,/Approved|\bviews?\b|\bmin read\b/);
  const browseCalls=()=>requests.filter(request=>/\/rest\/api\/(?:content\/)?search$/.test(request.target.pathname));
  const areaQuery=browseCalls().find(request=>(request.target.searchParams.get('cql')||'').includes('(id = 300 OR ancestor = 300'));
  assert.ok(areaQuery,'The mapped business area has a native CQL query');
  assert.match(areaQuery.target.searchParams.get('cql'),/\(id = 300 OR ancestor = 300 OR \(ancestor = 800 AND label = "wcs-area-credit-approval-control"\)\)/);
  assert.match(areaQuery.target.searchParams.get('cql'),/id NOT IN \([^)]*\b800\b/,'The Insights interface is excluded while its matching descendants remain searchable');
  const beforeArea=browseCalls().length;
  d.querySelector('.discovery-area').click();
  await until(()=>d.querySelector('#native-search-results .press-card h2')?.textContent==='Nested training result','The business-area click did not reuse its prefetched native document');
  assert.equal(browseCalls().length,beforeArea,'A warmed business-area click needs no new Confluence request');
  if(responseModel!=='absent')assert.match(d.querySelector('#native-search-count').textContent,/1 result\b/);
  assert.equal(d.querySelector('select[data-filter="area"]').value,'credit-approval-control');
  d.querySelector('#wcspedia .breadcrumbs a').click();
  await until(()=>d.querySelector('.featured-document h3')?.textContent==='Nested training result','Returning home did not restore the recent documents');
  assert.equal(browseCalls().length,beforeArea,'Returning home reuses its completed landing discovery');
  const form=d.querySelector('#wcspedia form[data-search]');assert.ok(form,'Landing search form renders');
  form.querySelector('input[name="q"]').value='loan';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>d.querySelector('#native-search-results')?.textContent.includes('Nested training result'),'Submitting landing search did not render the native child-page result').catch(error=>{error.message+='\n'+d.querySelector('#wcspedia').textContent+'\nRequests: '+JSON.stringify(requests.map(r=>r.target.href))+'\nErrors: '+JSON.stringify(errors.map(e=>e.message));throw new Error(error.message);});
  const search=requests.find(request=>/\/rest\/api\/(?:content\/)?search$/.test(request.target.pathname)&&/text\s*~/.test(request.target.searchParams.get('cql')||''));
  assert.ok(search,'The search form performs a CQL request');
  if(responseModel!=='absent')assert.match(d.querySelector('#native-search-count').textContent,/1 result\b/,'Explicit Content Search total metadata reaches the delivered UI');
  assert.match(search.target.searchParams.get('cql'),/space = "WCS"/);
  assert.match(search.target.searchParams.get('cql'),/ancestor = 100/);
  assert.doesNotMatch(search.target.searchParams.get('cql'),/id = 100 OR/);
  assert.match(search.target.searchParams.get('cql'),/id NOT IN \([^)]*\b100\b/);
  assert.match(search.target.searchParams.get('cql'),/ancestor NOT IN \(200\)/);
  assert.equal(search.target.pathname,'/confluence/rest/api/content/search');
  assert.doesNotMatch(search.target.searchParams.get('cql'),/ancestor = 900/);
  assert.ok(requests.some(request=>request.target.pathname==='/confluence/rest/api/content/100'),'The real landing page determines the verified search space');
  assert.ok([...d.querySelectorAll('#native-search-results a')].some(anchor=>new URL(anchor.href).searchParams.get('pageId')==='123'),'Search opens the matched native child page');
  // Exercise the actual deployed select handler, not just the CQL builder.
  // No year facet request may crawl Confluence or drop the landing subtree.
  const searchCalls=()=>browseCalls().filter(request=>!/(?:^| AND )id IN \(/.test(request.target.searchParams.get('cql')||''));
  const assertScope=target=>{
    const cql=target.searchParams.get('cql')||'';
    assert.match(cql,/^type = page AND ancestor = 100 AND space = "WCS"(?: AND |$)/);
    assert.ok(Number(target.searchParams.get('limit'))<=6,'Each request is a bounded result/count page');
    assert.doesNotMatch(target.searchParams.get('expand')||'',/body\./,'Search does not download page bodies');
  };
  const beforeYear=searchCalls().length;
  const year=d.querySelector('select[data-filter="year"]');
  assert.equal(year.getAttribute('aria-label'),'Updated year');
  year.value='2026';year.dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>searchCalls().length>beforeYear&&d.querySelector('#native-search-results .press-card'),'Year filter did not complete');
  const yearQuery=searchCalls().at(-1).target.searchParams.get('cql');
  assert.match(yearQuery,/lastmodified >= "2026-01-01" AND lastmodified < "2027-01-01"/);
  assert.equal(searchCalls().length,beforeYear+1,'Selecting a year issues one scoped request, no year lookup');
  const beforeReset=browseCalls().length;
  const resetMount=d.querySelector('#native-search-results'),resetYear=d.querySelector('select[data-filter="year"]');
  resetYear.value='';resetYear.dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>d.querySelector('#native-search-results')!==resetMount&&d.querySelector('#native-search-results .press-card')&&!d.querySelector('select[data-filter="year"]').value,'Clearing year did not restore cached results');
  assert.equal(browseCalls().length,beforeReset,'Resetting to the prior exact query reuses its results');
  for(const {target} of searchCalls())assertScope(target);
  const lookups=requests.filter(request=>request.target.pathname==='/confluence/rest/api/content/search');
  const mappings=lookups.filter(request=>/id IN \(300, 301, 302, 303, 304, 305, 306, 307\)/.test(request.target.searchParams.get('cql')||''));
  assert.equal(mappings.length,1,'All eight business-area parents are verified in one bounded request');
  assert.equal(requests.filter(request=>/\/rest\/api\/content\/30[0-7]$/.test(request.target.pathname)).length,0,'There is no one-request-per-area verification waterfall');
  for(const {target} of lookups){
    const cql=target.searchParams.get('cql')||'';
    assert.match(cql,/ancestor = 100/);assert.match(cql,/space = "WCS"/);
    assert.ok(Number(target.searchParams.get('limit'))<=8,'Content metadata lookup is bounded');
    assert.doesNotMatch(target.searchParams.get('expand')||'',/body\./,'Compatibility lookups retrieve metadata only');
  }
  // Submitting an autocomplete search while its native request is unfinished
  // must adopt the same six-row result instead of cancelling and fetching again.
  const pendingForm=d.querySelector('#wcspedia form[data-search]'),pendingInput=pendingForm.querySelector('input[name="q"]');
  pendingInput.focus();pendingInput.value='pending';pendingInput.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>held.length===1,'Autocomplete did not start its native request');
  const pending=held[0],pendingCQL=pending.target.searchParams.get('cql');
  assert.equal(pending.target.searchParams.get('limit'),'6','Suggestions fetch the reusable result-page size');
  pendingForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>d.querySelector('#native-search-results')&&d.querySelector('input[name="q"]').value==='pending','Submitting the pending suggestion did not open results');
  pending.send();
  await until(()=>d.querySelector('#native-search-results .press-card h2')?.textContent==='Nested training result','Submitting an unfinished suggestion did not reuse its result');
  assert.equal(requests.filter(request=>request.target.searchParams.get('cql')===pendingCQL).length,1,'One native request serves suggestions and submitted results');
  assertScope(pending.target);assertFastBootstrap();
  assert.deepEqual(unexpected,[]);
  assert.deepEqual(errors.map(error=>error.message),[]);
});
