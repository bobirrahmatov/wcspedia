/* Shared routes across independently hosted Confluence pages. */
(function (root, factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WCSNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function roleFor(href){
    if(typeof href!=='string'||!href.startsWith('#/'))return null;
    const [path,query='']=href.slice(1).split('?'),p=new URLSearchParams(query);
    if(path==='/faq')return 'faq';
    if(path==='/insights')return 'insights';
    if(path==='/entitlements')return 'entitlements';
    if(path==='/review'||path.startsWith('/review/')||(path==='/results'&&p.get('view')==='review'))return 'review';
    if(path==='/saved')return 'saved';
    if(path==='/health')return 'mine';
    if(path==='/create'||path.startsWith('/edit/')||path==='/categories'||(path==='/results'&&p.get('view')==='mine'))return 'mine';
    return 'home';
  }
  const pageDefaults={home:'#/',mine:'#/results?view=mine',review:'#/review',saved:'#/saved',entitlements:'#/entitlements',insights:'#/insights',faq:'#/faq'};
  function isDefaultRoute(href,role){
    const expected=pageDefaults[role];if(!expected||typeof href!=='string')return false;
    const [path,query='']=href.split('?'),[defaultPath,defaultQuery='']=expected.split('?');
    if(path!==defaultPath)return false;
    const actual=new URLSearchParams(query),wanted=new URLSearchParams(defaultQuery);
    return actual.size===wanted.size&&Array.from(wanted).every(([key,value])=>actual.get(key)===value);
  }
  function usesCleanDefault(config){
    return config.mode==='confluence'&&!!pageDefaults[config.pageRole]&&!config.documentId&&initialHash(config)===pageDefaults[config.pageRole];
  }
  function routeHash(config,currentHash){
    return currentHash&&currentHash!=='#'?currentHash:initialHash(config);
  }
  function canonicalUrl(config,currentUrl){
    if(!usesCleanDefault(config))return currentUrl;
    try{
      const target=new URL(currentUrl);
      if(!target.hash||isDefaultRoute(target.hash,config.pageRole))target.hash='';
      return target.href;
    }catch(_){return currentUrl;}
  }
  function resolve(href,config,currentUrl){
    if(typeof href==='string'&&/^#\/search(?:\?|$)/.test(href))href='#/?focus=search';
    const role=roleFor(href);
    // Area hosts reuse the landing pair, but each native parent opens its own
    // Explore scope. The actual home link must still leave that area host.
    if(role==='home'&&config.mode==='confluence'){
      const [path,query='']=href.slice(1).split('?');
      let area=new URLSearchParams(query).get('area');
      if(path.startsWith('/topic/'))try{area=decodeURIComponent(path.slice(7));}catch(_){area=null;}
      const mappings=config.nativePublication?.areaPageIds||{},id=Object.prototype.hasOwnProperty.call(mappings,area)?String(mappings[area]):'';
      if(/^[1-9]\d{0,19}$/.test(id)){
        if(config.businessArea===area)return href;
        try{const target=new URL((config.contextPath||'/confluence')+'/pages/viewpage.action',currentUrl);target.searchParams.set('pageId',id);target.hash=href.slice(1);return target.href;}catch(_){}
      }
      if(config.businessArea&&(path==='/'||path==='/results')&&!area&&config.pages?.home){
        try{const current=new URL(currentUrl),target=new URL(config.pages.home,current);if(target.origin===current.origin){target.hash=isDefaultRoute(href,'home')?'':href.slice(1);return target.href;}}catch(_){}
      }
    }
    if(!role||!config.pages||role===(config.pageRole||'home')||!config.pages[role])return href;
    try{
      const current=new URL(currentUrl),target=new URL(config.pages[role],current);
      if(target.origin!==current.origin||!['https:','http:','file:'].includes(target.protocol))return href;
      // The target's native page already identifies its default screen. Keep
      // fragments only for meaningful subroutes, searches and filters.
      target.hash=config.mode==='confluence'&&isDefaultRoute(href,role)?'':href.slice(1);
      return target.href;
    }catch(_){return href;}
  }
  function initialHash(config){
    if(config.pageRole==='faq')return '#/faq';
    if(config.documentId)return '#/document/'+encodeURIComponent(config.documentId);
    if(config.pageRole==='home'&&typeof config.businessArea==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.businessArea))return '#/topic/'+encodeURIComponent(config.businessArea);
    if(config.initialView==='insights'||config.pageRole==='insights')return '#/insights';
    if(config.initialView==='saved'||config.pageRole==='saved')return '#/saved';
    if(config.initialView==='mine'||config.pageRole==='mine')return '#/results?view=mine';
    if(config.initialView==='search')return '#/?focus=search';
    if(['results','review'].includes(config.initialView))return '#/'+config.initialView;
    if(config.pageRole==='entitlements')return '#/entitlements';
    if(config.pageRole==='review')return '#/review';
    return '#/';
  }
  function isListRoute(hash){return typeof hash==='string'&&/^#\/(?:$|\?|results(?:\?|$)|review(?:\?|$)|insights(?:\?|$)|saved(?:\?|$)|health(?:\?|$)|topic\/[^?]+(?:\?|$))/.test(hash);}
  function afterDelete(config,hash,previousList){
    const current=routeHash(config,hash);
    if(isListRoute(current))return current;
    const requested=new URLSearchParams(current.split('?')[1]||'').get('returnTo');
    if(isListRoute(requested))return requested;
    if(isListRoute(previousList))return previousList;
    // Remain on the current native host. Never route deletion to another page
    // because of the deleted document's content type.
    const fallback=initialHash({...config,documentId:undefined});
    return isListRoute(fallback)?fallback:'#/results?view=mine';
  }
  return {roleFor,resolve,initialHash,routeHash,canonicalUrl,isListRoute,afterDelete};
});
