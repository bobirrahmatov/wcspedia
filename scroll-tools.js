/* Shared page scroll control. Uses the existing Confluence scroll owner; no
 * nested scroll box, network requests or hash navigation. Inline SVG adapted
 * from the user's CodeFronts progress-ring example. */
(function(win){
  'use strict';
  if(!win||win.WCSScrollTools)return;
  var doc=win.document,instance;
  function mount(){
    if(instance){instance.refresh();return instance;}
    if(!doc.body)return null;
    var button=doc.getElementById('wcs-back-to-top');if(button)button.remove();
    button=doc.createElement('button');button.id='wcs-back-to-top';button.type='button';button.hidden=true;
    button.setAttribute('aria-label','Back to top');button.title='Back to top';button.dataset.wcsScrollControl='';
    button.innerHTML='<svg class="wcs-scroll-ring-svg" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle class="wcs-scroll-track" cx="26" cy="26" r="22" fill="none" stroke-width="3.5"/><circle class="wcs-scroll-ring" cx="26" cy="26" r="22" fill="none" stroke-width="3.5" stroke-linecap="round"/></svg><svg class="wcs-scroll-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    doc.body.append(button);
    var frame=null,disposed=false,pane=null,content=null,resize=null,mutations=null;
    function primary(){return doc.querySelector('#wcspedia')||doc.querySelector('#main-content')||doc.querySelector('.wiki-content')||doc.querySelector('main')||doc.body;}
    function owner(node){
      for(var el=node;el&&el!==doc.body&&el!==doc.documentElement;el=el.parentElement){
        if(/^(auto|scroll)$/.test(win.getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight)return el;
      }
      return doc.scrollingElement||doc.documentElement;
    }
    function rootPane(el){return el===doc.scrollingElement||el===doc.documentElement||el===doc.body;}
    function modal(){return Array.from(doc.querySelectorAll('[aria-modal="true"]')).some(function(el){return !el.hidden&&el.getClientRects().length;});}
    function update(){
      frame=null;if(disposed)return;
      var nextContent=primary(),nextPane=owner(nextContent);
      if(content!==nextContent||pane!==nextPane){content=nextContent;pane=nextPane;if(resize){resize.disconnect();resize.observe(content);if(pane!==content)resize.observe(pane);}}
      var top=rootPane(pane)?Math.max(win.scrollY||0,pane.scrollTop||0):pane.scrollTop;
      var max=Math.max(0,pane.scrollHeight-(rootPane(pane)?doc.documentElement.clientHeight||win.innerHeight:pane.clientHeight));
      var progress=max?Math.min(1,Math.max(0,top/max)):0;
      button.style.setProperty('--wcs-scroll-progress',progress.toFixed(4));
      button.hidden=!max||progress<=0.08||modal();
    }
    function schedule(){if(!disposed&&frame===null)frame=win.requestAnimationFrame(update);}
    function toTop(){
      if(modal())return;
      pane=owner(primary());var behavior=win.matchMedia&&win.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
      if(rootPane(pane))win.scrollTo({top:0,behavior:behavior});else if(pane.scrollTo)pane.scrollTo({top:0,behavior:behavior});else pane.scrollTop=0;
      var heading=primary().querySelector('h1,h2');
      if(heading){var added=!heading.hasAttribute('tabindex');if(added){heading.setAttribute('tabindex','-1');heading.addEventListener('blur',function cleanup(){heading.removeAttribute('tabindex');},{once:true});}heading.focus({preventScroll:true});}
      schedule();
    }
    button.addEventListener('click',toTop);
    doc.addEventListener('scroll',schedule,{capture:true,passive:true});win.addEventListener('scroll',schedule,{passive:true});win.addEventListener('resize',schedule,{passive:true});win.addEventListener('pageshow',schedule);
    if(win.visualViewport)win.visualViewport.addEventListener('resize',schedule,{passive:true});
    if(win.ResizeObserver)resize=new win.ResizeObserver(schedule);
    // Only structural changes: writing progress styles does not trigger this.
    if(win.MutationObserver){mutations=new win.MutationObserver(schedule);mutations.observe(doc.body,{childList:true,subtree:true});}
    instance={refresh:schedule,destroy:function(){disposed=true;if(frame!==null)win.cancelAnimationFrame(frame);if(resize)resize.disconnect();if(mutations)mutations.disconnect();doc.removeEventListener('scroll',schedule,true);win.removeEventListener('scroll',schedule);win.removeEventListener('resize',schedule);win.removeEventListener('pageshow',schedule);if(win.visualViewport)win.visualViewport.removeEventListener('resize',schedule);button.remove();instance=null;}};
    update();return instance;
  }
  win.WCSScrollTools={mount:mount};
})(typeof window!=='undefined'?window:null);
