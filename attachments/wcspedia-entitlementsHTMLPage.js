/* WCSpedia Entitlements: HTML rendering and startup.
 * Load wcspedia-entitlements.js first, then this file, as with covenantsHTMLPage.js.
 * Uses settings validated by the external shared loader.
 * The shared core holds the maintained app.js implementation once.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('e873788a7aff'))) return;
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
  if (mount.getAttribute('data-wcs-page-role') !== 'entitlements' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'entitlements') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-entitlements.html settings and its matching JavaScript pair.');
    return;
  }

  if (mount.dataset.wcsPageStarted) return;
  if (!window.WCSPageModules || window.WCSPageModules['entitlements']?.version !== 'e873788a7aff') {
    failPage('Load wcspedia-entitlements.js before wcspedia-entitlementsHTMLPage.js. Use both files from the same upload package and check their attachment URLs.');
    return;
  }
  if (window.WCSPageRenderer?.version !== 'e873788a7aff' || typeof window.WCSPageRenderer.start !== 'function') { failPage('The WCSpedia page renderer is unavailable. Upload the matching package.'); return; }
  mount.dataset.wcsPageStarted = 'entitlements';
  const pageReady=window.WCSPageRenderer.start();
  if(pageReady&&typeof pageReady.catch==='function')pageReady.catch(error=>failPage(error.message));
  return pageReady;
})();
