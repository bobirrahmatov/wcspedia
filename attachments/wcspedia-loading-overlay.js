/* Outlined WCSpedia wordmark from the existing registered Citi Sans Text face. No font request. */
(function(w){
  'use strict';
  if(w.WCSBrand)return;
  var wordmark="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 499.3 120\" role=\"img\" aria-label=\"WCSpedia\" color=\"#255be3\"><path fill=\"currentColor\" transform=\"translate(0 97) scale(0.1 -0.1)\" d=\"M25 700H118L259 112L414 700H518L673 109L819 700H912L727 0H622L466 593L310 0H205ZM987 350Q987 457 1025.0 539.0Q1063 621 1135.0 666.5Q1207 712 1305 712Q1400 712 1470.5 665.0Q1541 618 1573 536L1494 497Q1438 632 1306 632Q1199 632 1140.5 558.0Q1082 484 1082 352Q1082 218 1140.5 143.0Q1199 68 1304 68Q1440 68 1499 212L1578 173Q1546 86 1475.0 37.0Q1404 -12 1309 -12Q1209 -12 1136.5 34.0Q1064 80 1025.5 162.0Q987 244 987 350ZM1652 153 1729 197Q1751 131 1799.5 99.5Q1848 68 1927 68Q2005 68 2047.5 101.0Q2090 134 2090 194Q2090 242 2061.5 267.0Q2033 292 1970 306L1851 333Q1768 352 1725.5 397.0Q1683 442 1683 512Q1683 604 1747.5 658.0Q1812 712 1925 712Q2021 712 2087.0 673.0Q2153 634 2182 562L2104 518Q2059 632 1922 632Q1854 632 1816.0 603.0Q1778 574 1778 522Q1778 479 1806.5 454.5Q1835 430 1895 416L2015 388Q2101 368 2142.5 322.5Q2184 277 2184 200Q2184 136 2152.5 88.0Q2121 40 2062.5 14.0Q2004 -12 1924 -12Q1817 -12 1749.0 30.0Q1681 72 1652 153ZM2319 495H2399V408Q2421 456 2464.5 481.5Q2508 507 2567 507Q2634 507 2683.5 474.5Q2733 442 2759.0 383.0Q2785 324 2785 247Q2785 170 2759.0 111.5Q2733 53 2683.5 20.5Q2634 -12 2567 -12Q2511 -12 2469.0 11.0Q2427 34 2404 77V-180H2319ZM2555 65Q2625 65 2661.5 113.0Q2698 161 2698 247Q2698 334 2661.5 382.0Q2625 430 2555 430Q2483 430 2441.0 380.5Q2399 331 2399 247Q2399 165 2441.0 115.0Q2483 65 2555 65ZM2875 245Q2875 320 2903.0 379.0Q2931 438 2983.0 472.0Q3035 506 3104 506Q3169 506 3217.5 474.5Q3266 443 3292.0 388.5Q3318 334 3318 267Q3318 256 3316 224H2963Q2969 147 3006.5 106.0Q3044 65 3110 65Q3202 65 3237 148L3310 107Q3286 52 3233.5 20.0Q3181 -12 3107 -12Q3035 -12 2982.5 20.5Q2930 53 2902.5 111.0Q2875 169 2875 245ZM3234 290Q3234 348 3199.0 389.0Q3164 430 3102 430Q3047 430 3010.0 393.0Q2973 356 2964 290ZM3784 0V87Q3762 39 3718.5 13.5Q3675 -12 3616 -12Q3549 -12 3499.5 20.5Q3450 53 3424.0 111.5Q3398 170 3398 247Q3398 324 3424.0 383.0Q3450 442 3499.5 474.5Q3549 507 3616 507Q3673 507 3715.0 484.0Q3757 461 3780 416V720H3865V0ZM3628 65Q3700 65 3742.0 115.0Q3784 165 3784 247Q3784 331 3742.0 380.5Q3700 430 3628 430Q3558 430 3521.5 382.0Q3485 334 3485 247Q3485 161 3521.5 113.0Q3558 65 3628 65ZM4035 495H4120V0H4035ZM4020 640Q4020 667 4036.0 682.5Q4052 698 4078 698Q4104 698 4120.0 682.5Q4136 667 4136 640Q4136 613 4120.0 597.5Q4104 582 4078 582Q4052 582 4036.0 597.5Q4020 613 4020 640ZM4255 136Q4255 194 4293.0 230.5Q4331 267 4405 279L4507 295Q4546 301 4563.5 315.5Q4581 330 4581 358Q4581 390 4550.0 410.0Q4519 430 4468 430Q4376 430 4338 358L4266 399Q4289 450 4342.0 478.5Q4395 507 4468 507Q4559 507 4612.5 464.0Q4666 421 4666 340V110Q4666 85 4673.0 75.5Q4680 66 4698 66Q4713 66 4728 73V12Q4702 -7 4668 -7Q4633 -7 4612.5 14.0Q4592 35 4587 75Q4566 34 4524.5 11.0Q4483 -12 4427 -12Q4351 -12 4303.0 28.0Q4255 68 4255 136ZM4441 60Q4505 60 4543.0 99.5Q4581 139 4581 209V257Q4559 237 4496 226L4417 213Q4341 200 4341 139Q4341 102 4367.0 81.0Q4393 60 4441 60Z\"/><circle fill=\"#ee3b43\" cx=\"485.3\" cy=\"89\" r=\"6\"/></svg>";
  w.WCSBrand=Object.freeze({wordmark:wordmark});
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
      if (!d.body) { queuedText = text;return; }
      if (!overlay) {
        before = d.activeElement; overflow = d.body.style.overflow;mark();d.body.style.overflow = 'hidden';
        const id = 'wcs-loading-message-' + (++sequence);
        overlay = d.createElement('div');overlay.className = 'wcs-loading-overlay';overlay.setAttribute('role','dialog');
        overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Loading WCSpedia');overlay.tabIndex = -1;
        overlay.innerHTML = '<div class="wcs-loading-panel"><div class="wcs-loading-wordmark">'+(w.WCSBrand?.wordmark || '<span>WCSpedia</span>')+'</div><p class="wcs-loading-message" id="'+id+'" role="status" aria-live="polite"></p><div class="wcs-loading-track" role="progressbar" aria-label="Loading WCSpedia"><div class="wcs-loading-fill"></div></div></div>';
        message = overlay.querySelector('.wcs-loading-message');bar = overlay.querySelector('.wcs-loading-track');fill = overlay.querySelector('.wcs-loading-fill');
        d.body.append(overlay);overlay.focus({preventScroll:true});
        listen(d,'keydown',keys,true);listen(fill,'animationend',animationEnded);listen(d,'visibilitychange',visibilityChanged);
        listen(w,'hashchange',departed);listen(w,'popstate',departed);
        timer = w.setTimeout(close,30000);startCycle();
      }
      message.textContent = text || 'A world of knowledge. One place to find it.';
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
    loading=w.WCSLoadingOverlay.create({target:d.getElementById('wcspedia')||d.createElement('div')});loading.show('A world of knowledge. One place to find it.');
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
