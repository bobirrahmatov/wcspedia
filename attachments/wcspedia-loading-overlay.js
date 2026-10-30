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
