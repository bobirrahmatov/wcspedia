/* WCSpedia FAQs: HTML rendering and startup.
 * Load wcspedia-faq.js first, then this file, as with covenantsHTMLPage.js.
 * Uses settings validated by the external shared loader.
 * The shared core holds the maintained app.js implementation once.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('31017340734c'))) return;
  function failPage(message) {
    if (window.__WCSMacroLoader) { window.__WCSMacroLoader.fail(Error(message)); return; }
    const box = document.createElement('div');
    box.className = 'boot-state';
    box.setAttribute('role', 'alert');
    box.textContent = message;
    mount.replaceChildren(box);
    window.WCSHeaderLoading?.cancel();
    window.WCSLoadingOverlay?.create()?.cancel();
  }
  if (mount.getAttribute('data-wcs-page-role') !== 'faq' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'faq') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-faq.html settings and its matching JavaScript pair.');
    return;
  }

  if (mount.dataset.wcsPageStarted) return;
  if (!window.WCSPageModules || window.WCSPageModules['faq']?.version !== '31017340734c') {
    failPage('Load wcspedia-faq.js before wcspedia-faqHTMLPage.js. Use both files from the same upload package and check their attachment URLs.');
    return;
  }
  mount.dataset.wcsPageStarted = 'faq';
  return (async function(){
    const loading=window.WCSHeaderLoading?.claim(mount)||window.WCSLoadingOverlay.create({target:mount});
    loading.show('Loading WCSpedia…');
    try { window.WCSFAQ.mount(mount,window.WCS_CONFIG);await loading.finish(); }
    catch(error){ loading.cancel();failPage(error.message); }
  })();
})();
