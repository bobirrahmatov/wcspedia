/* One on-demand script registry per document, shared by navBar and page pairs. */
(function(root){
  'use strict';
  if(root.WCSLibraryLoader)return;
  var loads=new Map();
  function load(source,timeout){
    var url;
    try{url=new URL(source,root.location.href);if(url.username||url.password||url.hash||url.origin!==root.location.origin||!['https:','http:','file:'].includes(url.protocol))throw Error('Use a same-origin library attachment.');}
    catch(error){return Promise.reject(error);}
    if(loads.has(url.href))return loads.get(url.href);
    var pending=new Promise(function(resolve,reject){
      var script=root.document.createElement('script'),timer;
      function finish(error){clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();}
      script.src=url.href;script.async=true;script.setAttribute('data-wcs-shared-library','');
      script.onload=function(){finish();};script.onerror=function(){finish(Error('The library attachment could not be loaded: '+url.pathname));};
      timer=setTimeout(function(){finish(Error('The library attachment timed out: '+url.pathname));},timeout||20000);
      root.document.head.appendChild(script);
    });
    loads.set(url.href,pending);pending.catch(function(){loads.delete(url.href);});return pending;
  }
  root.WCSLibraryLoader=Object.freeze({load:load});
})(typeof globalThis!=='undefined'?globalThis:this);
