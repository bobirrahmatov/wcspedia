/* Shared text wordmark. Uses registered space fonts and CSS; no logo media request. */
(function(w){
  'use strict';
  if(w.WCSBrand?.version==='text-gradient-v2')return;
  w.WCSBrand=Object.freeze({version:'text-gradient-v2',tagline:'Good knowledge. Better work.',wordmark:'<span class="wcs-brand-text"><span class="wcs-brand-initials">WCS</span><span class="wcs-brand-name">pedia</span></span>'});
})(window);

;
/* One initial WCSpedia introduction. Later actions keep their own local busy state. */
(function (w) {
  'use strict';
  if (w.WCSLoadingOverlay?.version === 3) return;
  let sequence = 0, startup;
  function create({target, delayMs = 0} = {}) {
    if (startup) { if (target) startup.adoptTarget(target); return startup; }
    const d = target?.ownerDocument || w.document, pending = new Set(), cleanups = [];
    target = target || d.createElement('div');
    let overlay, message, bar, fill, attributes, before, overflow, queuedText, timer, showTimer, frame = 0, closeFrame = 0;
    let closed = false, ready = false, completing = false, cycleStarted = false, cycleComplete = false, completion;
    let resolveCompletion;
    completion = new Promise(resolve => { resolveCompletion = resolve; });
    const address = new URL(w.location.href);
    const hash = value => !value || /^#\/?\??$/.test(value) ? '#/' : value;
    function restore(node, name, value) { if (value == null) node.removeAttribute(name); else node.setAttribute(name, value); }
    function mark() {
      attributes = {busy:target.getAttribute('aria-busy'), inert:target.getAttribute('inert')};
      target.setAttribute('aria-busy','true'); target.setAttribute('inert','');
    }
    function adoptTarget(next) {
      if (!next || next === target || closed) return;
      if (overlay) { restore(target,'aria-busy',attributes.busy); restore(target,'inert',attributes.inert); }
      target = next; if (overlay) mark();
    }
    function close() {
      if (closed) return;
      closed = true; w.clearTimeout(timer); w.clearTimeout(showTimer);
      if (frame) w.cancelAnimationFrame(frame); if (closeFrame) w.cancelAnimationFrame(closeFrame);
      cleanups.splice(0).forEach(fn => fn());
      if (overlay) {
        const refocus = d.activeElement === overlay || overlay.contains(d.activeElement);
        overlay.remove(); overlay = null;
        restore(target,'aria-busy',attributes.busy); restore(target,'inert',attributes.inert);
        if (d.body.style.overflow === 'hidden') d.body.style.overflow = overflow;
        if (refocus && before?.isConnected && !before.closest('[inert]')) before.focus({preventScroll:true});
      }
      resolveCompletion();
    }
    function listen(node, event, fn, options) { node.addEventListener(event,fn,options);cleanups.push(() => node.removeEventListener(event,fn,options)); }
    function keys(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab' && overlay) { event.preventDefault();overlay.focus({preventScroll:true}); }
    }
    function settle() {
      if (closed || !ready || !cycleComplete || d.hidden || closeFrame) return;
      closeFrame = w.requestAnimationFrame(() => { closeFrame = w.requestAnimationFrame(close); });
    }
    function startCycle() {
      if (closed || !overlay || d.hidden || cycleComplete || frame) return;
      frame = w.requestAnimationFrame(() => { frame = w.requestAnimationFrame(() => {
        frame = 0; if (closed || d.hidden || !overlay) return;
        cycleStarted = true; overlay.removeAttribute('data-cycle-restart');overlay.setAttribute('data-cycle-running','');
      }); });
    }
    function animationEnded(event) {
      if (event.target !== fill || event.animationName !== 'wcs-loading-fill' || !cycleStarted) return;
      if (d.hidden) { cycleStarted = false;overlay.setAttribute('data-cycle-restart','');return; }
      cycleComplete = true;overlay.setAttribute('data-cycle-complete','');overlay.removeAttribute('data-cycle-running');settle();
    }
    function visibilityChanged() {
      if (closed) return;
      if (d.hidden) {
        overlay?.removeAttribute('data-cycle-running');
        if (frame) w.cancelAnimationFrame(frame);frame = 0;
        if (closeFrame) w.cancelAnimationFrame(closeFrame);closeFrame = 0;
      } else { startCycle();settle(); }
    }
    function departed() {
      if (w.location.pathname !== address.pathname || w.location.search !== address.search || hash(w.location.hash) !== hash(address.hash)) close();
    }
    function display(text) {
      if (closed) return;
      if (!d.body) { queuedText = text || 'Loading WCSpedia…';return; }
      if (!overlay) {
        before = d.activeElement; overflow = d.body.style.overflow;mark();d.body.style.overflow = 'hidden';
        const id = 'wcs-loading-message-' + (++sequence);
        overlay = d.createElement('div');overlay.className = 'wcs-loading-overlay';overlay.setAttribute('role','dialog');
        overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Loading WCSpedia');overlay.tabIndex = -1;
        overlay.innerHTML = '<div class="wcs-loading-panel"><div class="wcs-loading-wordmark">'+(w.WCSBrand?.wordmark || '<span class="wcs-brand-text"><span class="wcs-brand-initials">WCS</span><span class="wcs-brand-name">pedia</span></span>')+'</div><p class="wcs-loading-tagline"></p><p class="wcs-loading-message" id="'+id+'" role="status" aria-live="polite"></p><div class="wcs-loading-track" role="progressbar" aria-label="Loading WCSpedia"><div class="wcs-loading-fill"></div></div></div>';
        overlay.querySelector('.wcs-loading-tagline').textContent = w.WCSBrand?.tagline || 'Good knowledge. Better work.';
        message = overlay.querySelector('.wcs-loading-message');bar = overlay.querySelector('.wcs-loading-track');fill = overlay.querySelector('.wcs-loading-fill');
        d.body.append(overlay);overlay.focus({preventScroll:true});
        listen(d,'keydown',keys,true);listen(fill,'animationend',animationEnded);listen(d,'visibilitychange',visibilityChanged);
        listen(w,'hashchange',departed);listen(w,'popstate',departed);
        timer = w.setTimeout(close,30000);startCycle();
      }
      message.textContent = text || 'Loading WCSpedia…';
      bar.setAttribute('aria-valuetext',text || 'Loading WCSpedia');
    }
    function show(text) {
      if (closed) return;
      if (!overlay && delayMs > 0 && !showTimer) showTimer = w.setTimeout(() => { showTimer = null;display(text); },delayMs);
      else display(text);
    }
    function progress(completed,total,text) {
      if (!overlay || !Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return;
      const actual=Math.max(0,Math.min(total,completed));
      bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-valuenow',String(actual));
      if (text) message.textContent = text;
      bar.setAttribute('aria-valuetext',actual+' of '+total+' loading steps complete. '+message.textContent);
    }
    function paint() {
      return new Promise(resolve => {
        let first,second,done = false;
        function finish(){if(done)return;done=true;w.clearTimeout(bound);w.cancelAnimationFrame(first);w.cancelAnimationFrame(second);resolve();}
        const bound=w.setTimeout(finish,250);first=w.requestAnimationFrame(() => {second=w.requestAnimationFrame(finish);});
      });
    }
    function visible(node) { const box=node.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.right>0&&box.top<w.innerHeight&&box.left<w.innerWidth; }
    function mediaReady(node) {
      return new Promise(resolve => {
        const events=node.tagName==='VIDEO'?['loadeddata','error','abort']:['load','error'];let done=false;
        const finish=()=>{if(done)return;done=true;events.forEach(name=>node.removeEventListener(name,finish));resolve();};
        cleanups.push(finish);events.forEach(name=>node.addEventListener(name,finish));
        if(node.tagName==='VIDEO'?node.readyState>=2||node.error:node.complete||!node.getAttribute('src'))finish();
      });
    }
    async function finish() {
      if (closed) return completion;
      if (!overlay) { close();return completion; }
      if (!completing) {
        completing=true;
        const media=Array.from(target.querySelectorAll('img,video')).filter(visible);
        let bound;
        await Promise.race([Promise.all(media.map(mediaReady).concat(d.fonts?.ready||[])).catch(()=>{}),new Promise(resolve=>{bound=w.setTimeout(resolve,2500);})]);
        w.clearTimeout(bound);if(closed)return completion;
        await paint();if(closed)return completion;
        ready=true;settle();
      }
      return completion;
    }
    async function wait(promise,{timeoutMs=60000}={}) {
      let timeout,rejectWait;
      const limit=new Promise((_,reject)=>{rejectWait=reject;timeout=w.setTimeout(()=>reject(new Error('Loading took too long. Check your connection, then try again.')),timeoutMs);});
      const cancel=()=>rejectWait(new Error('Page loading was interrupted.'));pending.add(cancel);
      try{return await Promise.race([promise,limit]);}finally{w.clearTimeout(timeout);pending.delete(cancel);}
    }
    function destroy(){close();for(const cancel of pending)cancel();pending.clear();}
    listen(w,'pagehide',destroy);listen(w,'pageshow',event=>{if(event.persisted)destroy();});
    if(!d.body)listen(d,'DOMContentLoaded',()=>{if(queuedText&&!closed)display(queuedText);},{once:true});
    startup={show,progress,hide:close,cancel:close,finish,wait,destroy,adoptTarget,paint,get closed(){return closed;}};
    return startup;
  }
  function skeleton(label='Loading documents…') {
    const safe=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return '<div class="wcs-loading-skeleton" role="status"><span class="sr-only">'+safe+'</span><div aria-hidden="true">'+Array.from({length:3},()=>'<div class="wcs-skeleton-card"><i></i><i></i><i></i></div>').join('')+'</div></div>';
  }
  w.WCSLoadingOverlay={create,skeleton,version:3};
})(window);

;
/* Shared navBar owns the first paint; app pages claim the same one-shot overlay. */
(function(w,d){
  'use strict';
  if(w.WCSHeaderLoading)return;
  var loading,observer,started=false,nativePage=false,settings,readyTimer;
  function meta(name){try{return String(d.querySelector('meta[name="ajs-'+name+'"]')?.content||w.AJS?.Meta?.get(name)||'');}catch(_){return '';}}
  function eligible(config){
    var url=new URL(w.location.href),space=meta('space-key'),context=config.contextPath||'/confluence';
    var pathId=(url.pathname.match(/\/spaces\/([^/]+)\/pages\/([1-9]\d*)(?:\/|$)/)||[]),query=url.searchParams.get('pageId'),nativeId=meta('page-id');
    var overview=url.pathname===context+'/spaces/'+config.spaceKey+'/overview',id=nativeId||query||pathId[2]||(overview?config.pageIds?.home:'');
    var ids=Object.values(config.pageIds||{}).concat(Object.values(config.areaPageIds||{}),config.insightsPageId);
    var view=url.pathname===context+'/pages/viewpage.action'||!!pathId[2]||overview||url.pathname.startsWith(context+'/display/'+config.spaceKey+'/');
    if(!view||!id||w.top!==w.self||space&&space!==config.spaceKey||pathId[1]&&pathId[1]!==config.spaceKey||query&&query!==id||pathId[2]&&pathId[2]!==id||url.searchParams.has('pageVersion')||url.searchParams.has('preview')||url.searchParams.has('wcsNativeUi')||d.querySelector('#editpageform,#createpageform,#content-editor,body.contenteditor'))return null;
    if(!ids.includes(id)&&space!==config.spaceKey)return null;
    if(id===config.attachmentPageId||id===config.workingRootPageId)return null;
    return {id:id,native:!ids.includes(id)};
  }
  function scan(){
    if(!loading||loading.closed){observer?.disconnect();return;}
    var root=d.getElementById('wcspedia');
    if(root){loading.adoptTarget(root);if(root.querySelector('.boot-state[role="alert"],[data-wcs-loader-error]'))cancel();}
  }
  function start(config){
    if(started)return;
    settings=config;var scope=eligible(config);if(!scope)return;
    started=true;nativePage=scope.native;
    loading=w.WCSLoadingOverlay.create({target:d.getElementById('wcspedia')||d.createElement('div')});loading.show();
    observer=new MutationObserver(scan);observer.observe(d.documentElement,{childList:true,subtree:true});scan();
  }
  function cancel(){w.clearTimeout(readyTimer);observer?.disconnect();loading?.cancel();}
  function readyNative(){
    if(!started||!nativePage||loading.closed)return;
    var deadline=Date.now()+4000;
    function check(){
      if(loading.closed)return;
      var root=d.querySelector('#main-content,.wiki-content');
      if(root&&d.readyState!=='loading') {loading.adoptTarget(root);observer?.disconnect();loading.finish();return;}
      if(Date.now()>=deadline){cancel();return;}
      readyTimer=w.setTimeout(check,40);
    }
    check();
  }
  w.WCSHeaderLoading={start:start,claim:function(root){if(!started)return null;loading.adoptTarget(root);return loading;},cancel:cancel,readyNative:readyNative,eligible:eligible};
})(window,document);

;
/* Shared external macro loader. Settings are build input, never a second live JSON file. */
(function(w,d){
  'use strict';
  var settings = {
  "authoringMode": "confluence-session",
  "contextPath": "/confluence",
  "spaceKey": "wcspedia",
  "attachmentPageId": "3962195316",
  "pageIds": {
    "home": "3954553300",
    "mine": "3961735744",
    "review": "3961735749",
    "saved": "3961735759",
    "entitlements": "3961735763",
    "faq": "3973992401"
  },
  "insightsPageId": "3961735728",
  "workingRootPageId": "3961735834",
  "areaPageIds": {
    "credit-approval-control": "3961735771",
    "credit-information-management": "3961735776",
    "credit-management-reporting": "3961735781",
    "deal-closing": "3961735791",
    "documentation-pledging": "3961735795",
    "emea-credit-admin": "3961735800",
    "loan-management": "3961735803",
    "regional-operating-manuals": "3961735808"
  },
  "search": {
    "timeoutMs": 12000,
    "excludePageIds": [],
    "excludeAncestorIds": []
  },
  "services": {
    "workspaceEndpoint": "",
    "workflowEndpoint": "",
    "suggestionEndpoint": "",
    "entitlementsEndpoint": "",
    "metricsEndpoint": "",
    "bookmarksEndpoint": "",
    "healthEndpoint": ""
  },
  "charts": {
    "allowCDN": false
  },
  "exports": {
    "logoDataUrl": "",
    "loadTimeout": 20000,
    "allowCDN": false
  }
};
  var context = settings.contextPath.replace(/\/+$/,'');
  var revision='0cb7a477338c',entry=d.currentScript,owner=entry?.getAttribute('data-wcs-loader-owner')||'page';
  function signature(value){if(Array.isArray(value))return '['+value.map(signature).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+signature(value[key])).join(',')+'}';return JSON.stringify(value);}
  var settingsSignature=signature(settings),prior=w.__WCSMacroLoader;
  if(prior){if(prior.revision!==revision||prior.settingsSignature!==settingsSignature)prior.fail(Error('WCSpedia files from different packages are mixed. Upload the matching attachments and page macros.'));else prior.start(owner);return;}
  var jobs=new Map(),pageState='idle',headerState='idle',dispose=[],cancelled=false,interrupted=false,config;
  var roles={home:'wcspedia-landing',mine:'wcspedia-my-workspace',review:'wcspedia-reviewer-workspace',saved:'wcspedia-saved-items',entitlements:'wcspedia-entitlements',insights:'wcspedia-insights',faq:'wcspedia-faq'};
  function url(file){return context+'/download/attachments/'+settings.attachmentPageId+'/'+file+'?api=v2&wcsBuild='+encodeURIComponent(revision);}
  function meta(name){try{return String(d.querySelector('meta[name="ajs-'+name+'"]')?.content||w.AJS?.Meta?.get(name)||'');}catch(_){return '';}}
  function identity(){
    var address=new URL(w.location.href),path=(address.pathname.match(/\/spaces\/([^/]+)\/pages\/([1-9]\d*)(?:\/|$)/)||[]),query=address.searchParams.get('pageId'),nativeId=meta('page-id'),space=meta('space-key');
    var overview=address.pathname===context+'/spaces/'+settings.spaceKey+'/overview',id=nativeId||query||path[2]||(overview?settings.pageIds.home:'');
    var validView=address.pathname===context+'/pages/viewpage.action'||!!path[2]||overview||address.pathname.startsWith(context+'/display/'+settings.spaceKey+'/');
    if(!validView||w.top!==w.self||space&&space!==settings.spaceKey||path[1]&&path[1]!==settings.spaceKey||query&&query!==id||path[2]&&path[2]!==id||overview&&id!==settings.pageIds.home||address.searchParams.has('pageVersion')||address.searchParams.has('preview')||address.searchParams.has('wcsNativeUi')||d.querySelector('#editpageform,#createpageform,#content-editor,body.contenteditor'))throw Error('This WCSpedia macro belongs on its configured page in the WCSpedia space.');
    return id;
  }
  function verifySettings(){
    if(!/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context)||!/^[A-Za-z0-9_~-]+$/.test(settings.spaceKey))throw Error('The WCSpedia loader configuration is incomplete. Upload the configured package.');
    var ids=[settings.attachmentPageId,settings.workingRootPageId,settings.insightsPageId].concat(Object.values(settings.pageIds||{}),Object.values(settings.areaPageIds||{}));
    if(ids.some(value=>!/^[1-9]\d*$/.test(value))||new Set(ids).size!==ids.length)throw Error('The WCSpedia loader needs the configured numeric page IDs.');
    if(entry?.src){var source=new URL(entry.src,d.baseURI);if(source.origin!==w.location.origin||source.pathname!==context+'/download/attachments/'+settings.attachmentPageId+'/wcspedia-page-loader.js')throw Error('The WCSpedia loader must use the configured same-origin attachment.');}
    Object.values(settings.services||{}).forEach(value=>{if(value&&!value.startsWith(context+'/'))throw Error('WCSpedia services must use this Confluence origin.');});
  }
  function load(file,test){
    if(jobs.has(file))return jobs.get(file);
    var promise=new Promise((resolve,reject)=>{
      if(cancelled){reject(Error('Page loading was interrupted.'));return;}
      var node=d.createElement('script'),done=false,timer;
      function finish(error){if(done)return;done=true;w.clearTimeout(timer);node.removeEventListener('load',loaded);node.removeEventListener('error',failed);if(error)reject(error);else resolve();}
      function loaded(){if(test&&!test())finish(Error(file+' loaded without its expected WCSpedia runtime. Upload the matching package.'));else finish();}
      function failed(){finish(Error('Could not load '+file+'. Check attachment access or refresh the page.'));}
      dispose.push(()=>{if(!done)node.remove();finish(Error('Page loading was interrupted.'));});node.src=url(file);node.async=true;node.setAttribute('data-wcs-runtime','');node.addEventListener('load',loaded);node.addEventListener('error',failed);timer=w.setTimeout(failed,15000);d.head.append(node);
    });
    jobs.set(file,promise);return promise;
  }
  function stylesheet(){
    var file='wcspedia-style.css';if(jobs.has(file))return jobs.get(file);
    var promise=new Promise((resolve,reject)=>{
      var address=new URL(url(file),w.location.href),links=Array.from(d.querySelectorAll('link[rel="stylesheet"]')).filter(node=>{try{var current=new URL(node.href,w.location.href);return current.origin===address.origin&&current.pathname===address.pathname;}catch(_){return false;}}),node=links[0]||d.createElement('link'),done=false,timer;
      links.slice(1).forEach(link=>link.remove());
      function finish(error){if(done)return;done=true;w.clearTimeout(timer);node.removeEventListener('load',loaded);node.removeEventListener('error',failed);if(error)reject(error);else resolve();}
      function loaded(){finish();}function failed(){finish(Error('WCSpedia styles could not load. Check attachment access or refresh.'));}
      dispose.push(()=>finish(Error('Page loading was interrupted.')));
      if(node.href===address.href&&node.sheet){resolve();return;}
      node.rel='stylesheet';node.id='wcs-shared-style';node.addEventListener('load',loaded);node.addEventListener('error',failed);timer=w.setTimeout(failed,15000);node.href=address.href;if(!node.isConnected)d.head.append(node);
    });jobs.set(file,promise);return promise;
  }
  function fail(error){
    if(pageState==='failed')return;
    pageState='failed';cancelled=true;dispose.splice(0).forEach(fn=>fn());
    w.WCSHeaderLoading?.cancel();w.WCSLoadingOverlay?.create()?.cancel();
    var root=d.getElementById('wcspedia');if(!root)return;
    var box=d.createElement('div');box.className='boot-state';box.setAttribute('role','alert');box.setAttribute('data-wcs-loader-error','');
    var title=d.createElement('h2'),text=d.createElement('p'),retry=d.createElement('button');title.textContent='WCSpedia could not load';text.textContent=error?.message||'Refresh this page or use the native page tree.';
    retry.type='button';retry.className='button';retry.textContent='Try again';retry.addEventListener('click',()=>w.location.reload());box.append(title,text,retry);root.replaceChildren(box);
  }
  function makeConfig(role,area){
    var pages={};Object.keys(settings.pageIds).forEach(key=>{pages[key]=context+'/pages/viewpage.action?pageId='+settings.pageIds[key];});pages.insights=context+'/pages/viewpage.action?pageId='+settings.insightsPageId;
    return Object.assign({},settings.services,{mode:'confluence',authoringMode:settings.authoringMode||'confluence-session',contextPath:context,spaceKey:settings.spaceKey,rootPageId:settings.pageIds.home,attachmentPageId:settings.attachmentPageId,attachmentFilename:'wcspedia-published.json',pageRole:role,businessArea:area||'',governanceEnabled:false,nativeAccessSync:true,pages:pages,showConnectionStatus:false,mountGlobalTools:false,nativePublication:{enabled:true,publishedRootPageId:settings.pageIds.home,workingRootPageId:settings.workingRootPageId,areaPageIds:settings.areaPageIds,insightsPageId:settings.insightsPageId,insightsTypes:['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']},search:settings.search,charts:Object.assign({},settings.charts,{allowCDN:false,highchartsSrc:url('highcharts-13.1.0.js'),accessibilitySrc:url('highcharts-13.1.0-accessibility.js')}),exports:Object.assign({},settings.exports,{allowCDN:false,pdfMakeUrl:url('pdfmake-0.2.20.min.js'),pdfFontsUrl:url('pdfmake-0.2.20-vfs-fonts.js'),docxUrl:url('docx-9.5.1.iife.js'),logoUrl:url('citi-logo.png'),mdxTemplateUrl:url('wcspedia-document.mdx')})});
  }
  async function bootPage(){
    if(pageState!=='idle'||cancelled)return;
    var roots=Array.from(d.querySelectorAll('[id="wcspedia"]'));if(!roots.length)return;
    pageState='loading';
    try{
      if(roots.length!==1)throw Error('Use one WCSpedia page macro on this page. Remove the duplicate macro.');
      var root=roots[0],role=root.getAttribute('data-wcs-page-role'),area=root.getAttribute('data-wcs-business-area')||'',id=identity(),expected=area?settings.areaPageIds[area]:role==='insights'?settings.insightsPageId:settings.pageIds[role];
      if(!roles[role]||area&&role!=='home'||!expected||id!==expected||root.getAttribute('data-wcs-page-id')!==expected)throw Error('This WCSpedia page macro does not match the current page. Paste the matching page file from this package.');
      config=makeConfig(role,area);w.WCS_CONFIG=config;root.wcsPageConfig=config;
      await stylesheet();if(cancelled)return;
      if(role!=='faq')await load('wcspedia-core.js',()=>w.WCSCoreVersion===revision&&w.WCSPageRenderer?.version===revision);if(cancelled)return;
      await load(roles[role]+'.js',()=>w.WCSPageModules?.[role]?.version===revision);if(cancelled)return;
      await load(roles[role]+'HTMLPage.js',()=>root.dataset.wcsPageStarted===role);if(!cancelled)pageState='ready';
    }catch(error){if(!cancelled)fail(error);}
  }
  async function bootHeader(){
    if(headerState!=='idle'||cancelled)return;
    headerState='loading';
    try{
      var id;try{id=identity();}catch(_){headerState='inactive';return;}
      var ids=Object.values(settings.pageIds).concat(Object.values(settings.areaPageIds),settings.insightsPageId);
      if(!ids.includes(id)&&meta('space-key')!==settings.spaceKey)return;
      w.WCSHeaderLoading.start(settings);
      w.WCS_FILE_DROP_CONFIG={enabled:true,spaceKey:settings.spaceKey};
      w.WCS_ADD_DOCUMENT_CONFIG={mode:'confluence',authoringMode:'confluence-session',spaceKey:settings.spaceKey,nativePublication:{enabled:true,workingRootPageId:settings.workingRootPageId,insightsPageId:settings.insightsPageId},contextPath:context,attachmentPageId:settings.attachmentPageId,rootPageId:settings.pageIds.home,workspacePageId:settings.pageIds.mine,workflowEndpoint:settings.services.workflowEndpoint||'',workspaceEndpoint:settings.services.workspaceEndpoint||'',accessTimeoutMs:12000,types:['Job aid','Guide','Blog','Training','Report']};
      w.WCS_ARTICLE_DISCUSSION_CONFIG={authoringMode:'confluence-session',contextPath:context,spaceKey:settings.spaceKey,rootPageId:settings.pageIds.home,attachmentPageId:settings.attachmentPageId,insightsPageId:settings.insightsPageId,insightsTypes:['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ'],workingRootPageId:settings.workingRootPageId,pageIds:settings.pageIds,areaPageIds:settings.areaPageIds,excludePageIds:settings.search?.excludePageIds||[],excludeAncestorIds:settings.search?.excludeAncestorIds||[],feedbackEndpoint:'',bundleUrl:url('wcspedia-article-discussion.js')};
      await stylesheet();if(cancelled)return;
      var helpers=['wcspedia-file-drop-guard.js','wcspedia-library-loader.js','wcspedia-space-typography.js','wcspedia-notifications.js','wcspedia-page-style-flags.js'];
      // Header helpers fail independently; a toolbar failure must not replace a loaded document.
      void Promise.allSettled(helpers.map(file=>load(file)));
      void load('wcspedia-add-document.js',()=>!!w.WCSHeaderWidgetModules?.addDocument).then(()=>load('wcspedia-add-documentHTMLPage.js')).catch(error=>{
        var host=d.querySelector('[data-wcs-header-add-document]'),button=host?.querySelector('button');
        if(host)host.dataset.wcsAddState='error';if(button){button.disabled=true;button.title=error.message;button.setAttribute('aria-label','Add document unavailable');}
      });
      void load('wcspedia-article-engagement.js').then(()=>load('wcspedia-article-discussion-bootstrap.js')).catch(error=>w.console?.warn('[WCSpedia discussion]',error.message));
      headerState='ready';w.WCSHeaderLoading.readyNative();
    }catch(error){headerState='failed';w.WCSHeaderLoading.cancel();w.console?.warn('[WCSpedia header]',error?.message);}
  }
  function start(kind){
    if(cancelled)return;
    if(d.querySelectorAll('[id="wcspedia"]').length>1){fail(Error('Use one WCSpedia page macro on this page. Remove the duplicate macro.'));return;}
    if(kind==='navbar'){
      // The file-drop guard belongs to the whole space, including the native
      // editor. It has its own per-gesture scope checks and makes no API calls.
      var address=new URL(w.location.href),pathSpace=(address.pathname.match(/\/(?:spaces|display)\/([^/]+)(?:\/|$)/)||[])[1];
      var nativeSpace=meta('space-key')||pathSpace||address.searchParams.get('spaceKey');
      if(w.top===w.self&&nativeSpace===settings.spaceKey){
        w.WCS_FILE_DROP_CONFIG={enabled:true,spaceKey:settings.spaceKey};
        void load('wcspedia-file-drop-guard.js').catch(error=>{if(!cancelled)w.console?.warn('[WCSpedia file drop]',error.message);});
      }
      void bootHeader();
    }
    void bootPage();
    if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',()=>{void bootPage();},{once:true});
  }
  try{verifySettings();}catch(error){fail(error);return;}
  var style=d.getElementById('wcs-startup-critical');if(!style){style=d.createElement('style');style.id='wcs-startup-critical';style.textContent="/* One opaque startup surface, matching the Mosaic loading rhythm. */\n.wcs-loading-overlay { --wcs-loading-page:#f6f9fc;--wcs-loading-text:#17355f;--wcs-loading-muted:#5b6c7e;--wcs-loading-brand:#255be3;position:fixed!important;inset:0!important;z-index:2147483000!important;display:grid!important;place-items:center;box-sizing:border-box;padding:28px;background:var(--wcs-loading-page)!important;color:var(--wcs-loading-text)!important;isolation:isolate;overflow:auto;overscroll-behavior:contain;text-align:center;font-family:'Citi-Sans-Text',Arial,sans-serif;outline:none; }\nhtml[data-color-mode=dark] .wcs-loading-overlay,html:not([data-color-mode])[data-theme=dark] .wcs-loading-overlay,body[data-color-mode=dark] .wcs-loading-overlay,body:not([data-color-mode])[data-theme=dark] .wcs-loading-overlay {--wcs-loading-page:#0d1b2d;--wcs-loading-text:#dee4ea;--wcs-loading-muted:#aabbd0;--wcs-loading-brand:#85b8ff;}\n.wcs-loading-overlay *,.wcs-loading-overlay *::before,.wcs-loading-overlay *::after{box-sizing:border-box;}\n.wcs-loading-overlay .wcs-loading-panel {width:360px;max-width:100%;padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important;border-radius:0!important;}\n.wcs-loading-overlay .wcs-loading-wordmark {--wcs-wordmark-size:clamp(36px,8vw,64px);display:block!important;width:100%!important;margin:0 0 18px!important;background:transparent!important;text-align:center;}\n/* Real text, shared by early startup and the page. Solid colour is the fallback. */\n:is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text {--wcs-brand-start:#1749cb;--wcs-brand-middle:#315ee8;--wcs-brand-end:#7a46d5;display:inline-block!important;position:relative;padding:0 .2em .08em 0!important;margin:0!important;border:0!important;max-width:100%;font-family:'Citi-Sans-Text',Arial,sans-serif!important;font-size:var(--wcs-wordmark-size,40px)!important;font-weight:700!important;line-height:1.2!important;letter-spacing:-.06em!important;text-transform:none!important;white-space:nowrap;text-decoration:none!important;color:#255be3!important;-webkit-text-fill-color:currentColor;background:none;text-shadow:none;vertical-align:middle;}\n:is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text>span {font-family:inherit!important;font-size:inherit!important;line-height:inherit!important;letter-spacing:inherit!important;color:inherit!important;-webkit-text-fill-color:inherit;background:none!important;}\n:is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text>.wcs-brand-initials {font-weight:700!important;}\n:is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text>.wcs-brand-name {font-weight:400!important;letter-spacing:-.055em!important;}\n:is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text::after {content:\"\";position:absolute;right:0;bottom:.3em;width:.105em;height:.105em;border-radius:50%;background:#ff3c28;}\nhtml[data-color-mode=dark] :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text,html:not([data-color-mode])[data-theme=dark] :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text,body[data-color-mode=dark] :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text,body:not([data-color-mode])[data-theme=dark] :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text {--wcs-brand-start:#85b8ff;--wcs-brand-middle:#a3b9ff;--wcs-brand-end:#c4a5ff;color:#a3b9ff!important;}\n@supports ((background-clip:text) or (-webkit-background-clip:text)) {\n  :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text {background-image:linear-gradient(105deg,var(--wcs-brand-start) 4%,var(--wcs-brand-middle) 50%,var(--wcs-brand-end) 96%);background-clip:text;-webkit-background-clip:text;color:transparent!important;-webkit-text-fill-color:transparent;}\n}\n@media(forced-colors:active) {\n  :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text {background:none!important;color:CanvasText!important;-webkit-text-fill-color:CanvasText!important;}\n  :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text::after {background:CanvasText!important;}\n}\n@media print {\n  :is(#wcspedia,.wcs-loading-overlay) .wcs-brand-text {background:none!important;color:#17355f!important;-webkit-text-fill-color:#17355f!important;}\n}\n.wcs-loading-overlay .wcs-loading-tagline {margin:0 0 28px!important;min-height:21px;color:var(--wcs-loading-muted)!important;font:15px/1.5 'Citi-Sans-Text',Arial,sans-serif!important;letter-spacing:.01em;}\n.wcs-loading-overlay .wcs-loading-message {position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;}\n.wcs-loading-overlay .wcs-loading-track {display:block!important;position:relative!important;width:112px!important;height:3px!important;margin:auto!important;padding:0!important;border:0!important;background:#dce6f2!important;border-radius:3px;overflow:hidden!important;}\n.wcs-loading-overlay .wcs-loading-fill {display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:#255be3!important;border-radius:inherit;opacity:1!important;transform:scaleX(0);transform-origin:left center;animation:wcs-loading-fill 1000ms linear forwards!important;animation-play-state:paused!important;transition:none!important;}\n.wcs-loading-overlay[data-cycle-running] .wcs-loading-fill {animation-play-state:running!important;}\n.wcs-loading-overlay[data-cycle-restart] .wcs-loading-fill {animation:none!important;transform:scaleX(0);}\n.wcs-loading-overlay[data-cycle-complete] .wcs-loading-fill {animation:none!important;transform:scaleX(1);}\n@keyframes wcs-loading-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}\n@media(forced-colors:active){.wcs-loading-overlay{background:Canvas!important;color:CanvasText!important}.wcs-loading-overlay .wcs-loading-track{border:1px solid CanvasText!important}.wcs-loading-overlay .wcs-loading-fill{background:Highlight!important;forced-color-adjust:none}}\n@media print{.wcs-loading-overlay{display:none!important}}\n\n";d.head.append(style);}
  w.__WCSMacroLoader={start:start,fail:fail,canRender:function(version){return !cancelled&&pageState==='loading'&&version===revision;},get status(){return pageState;},revision:revision,settingsSignature:settingsSignature};
  w.addEventListener('pagehide',()=>{interrupted=pageState==='loading'||pageState==='idle';cancelled=true;dispose.splice(0).forEach(fn=>fn());w.WCSHeaderLoading.cancel();},{once:true});
  w.addEventListener('pageshow',event=>{if(event.persisted&&interrupted)fail(Error('Page loading was interrupted when you left this page. Select Try again to reload WCSpedia.'));});
  start(owner);
})(window,document);
