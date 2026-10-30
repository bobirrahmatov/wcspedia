/* WCSpedia Knowledge base: HTML rendering and startup.
 * Load wcspedia-landing.js first, then this file, as with covenantsHTMLPage.js.
 * Uses settings validated by the external shared loader.
 * The shared core holds the maintained app.js implementation once.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('f70a954c1217'))) return;
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
  if (mount.getAttribute('data-wcs-page-role') !== 'home' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'home') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-landing.html settings and its matching JavaScript pair.');
    return;
  }

  if (mount.dataset.wcsPageStarted) return;
  if (!window.WCSPageModules || window.WCSPageModules['home']?.version !== 'f70a954c1217') {
    failPage('Load wcspedia-landing.js before wcspedia-landingHTMLPage.js. Use both files from the same upload package and check their attachment URLs.');
    return;
  }
  if (window.WCSPageRenderer?.version !== 'f70a954c1217' || typeof window.WCSPageRenderer.start !== 'function') { failPage('The WCSpedia page renderer is unavailable. Upload the matching package.'); return; }
  mount.dataset.wcsPageStarted = 'home';
  const pageReady=window.WCSPageRenderer.start();
  if(pageReady&&typeof pageReady.catch==='function')pageReady.catch(error=>failPage(error.message));
  return pageReady;
})();
