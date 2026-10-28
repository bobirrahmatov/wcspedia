/* Runs inline in each page macro, before either attachment script downloads.
 * Uses the existing global stylesheet and hands the same overlay to app.js. */
(function (global) {
  'use strict';
  const target=document.getElementById('wcspedia');
  if(!target||global.WCSPageBoot)return;
  const loading=global.WCSLoadingOverlay.create({target});
  let timer,failed=false,claimed=false;
  function fail(message){
    if(failed||claimed)return;
    failed=true;clearTimeout(timer);loading.destroy();
    const box=document.createElement('div');box.className='boot-state';box.setAttribute('role','alert');
    const heading=document.createElement('h1');heading.textContent='WCSpedia could not load';
    const detail=document.createElement('p');detail.textContent=message;
    const retry=document.createElement('button');retry.className='button';retry.textContent='Try again';retry.onclick=()=>location.reload();
    box.append(heading,detail,retry);target.replaceChildren(box);
  }
  global.WCSPageBoot={
    get failed(){return failed;},
    fail,
    claim(mount){
      if(mount!==target)return null;
      if(failed)throw new Error('Page startup expired. Reload to try again.');
      claimed=true;clearTimeout(timer);return loading;
    }
  };
  loading.show('Loading WCSpedia…');
  timer=setTimeout(()=>fail('Page scripts took too long to load. Check your connection and try again.'),60000);
  global.addEventListener('pagehide',()=>{clearTimeout(timer);loading.hide();});
  global.addEventListener('pageshow',event=>{if(event.persisted&&!claimed)fail('Page loading was interrupted. Reload to try again.');});
})(window);
