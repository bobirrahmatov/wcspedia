/* Shared early overlay only. Does not initialize the application or its settings. */
(function(w,d){
  'use strict';
  if(w.WCSHeaderLoading)return;
  var script=d.currentScript;
  var allowed=(script?.getAttribute('data-wcs-loading-pages')||'').split(',');
  var id=d.querySelector('meta[name="ajs-page-id"]')?.content||new URL(w.location.href).searchParams.get('pageId')||(w.location.pathname.match(/\/pages\/(\d+)(?:\/|$)/)||[])[1];
  if(!id||!allowed.includes(String(id))||/\/(?:editpage|createpage|resumedraft)\.action$/.test(w.location.pathname)||d.querySelector('#editpageform,#content-editor'))return;
  var loading,claimed=false,expired=false,timer,observer;
  function release(){w.clearTimeout(timer);observer?.disconnect();loading?.destroy();}
  function start(){
    if(!d.body||loading||expired)return;
    loading=w.WCSLoadingOverlay.create({target:d.createElement('div')});
    loading.show('Loading WCSpedia…');
    timer=w.setTimeout(function(){expired=true;release();},60000);
    // A page guard or host attachment error must not remain behind the overlay.
    observer=new MutationObserver(function(){
      if(!claimed&&(d.querySelector('#wcspedia .boot-state[role="alert"]')||/^WCSpedia .*(?:could not load|failed to load|settings are missing|does not match)/i.test(d.getElementById('wcspedia')?.textContent||''))){expired=true;release();}
    });
    observer.observe(d.body,{childList:true,subtree:true});
  }
  w.WCSHeaderLoading={claim:function(root){
    if(claimed||expired)return null;
    start();if(!loading)return null;
    claimed=true;w.clearTimeout(timer);observer?.disconnect();loading.adoptTarget(root);return loading;
  }};
  w.addEventListener('pagehide',release);
  w.addEventListener('pageshow',function(event){if(event.persisted){expired=true;release();}});
  if(d.body)start();else d.addEventListener('DOMContentLoaded',start,{once:true});
})(window,document);
