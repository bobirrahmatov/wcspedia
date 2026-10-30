/* WCSpedia Reviewer workspace: HTML rendering and startup.
 * Load wcspedia-reviewer-workspace.js first, then this file, as with covenantsHTMLPage.js.
 * Uses settings validated by the external shared loader.
 * The shared core holds the maintained app.js implementation once.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('e2db2c0c561d'))) return;
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
  if (mount.getAttribute('data-wcs-page-role') !== 'review' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'review') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-reviewer-workspace.html settings and its matching JavaScript pair.');
    return;
  }

  if (mount.dataset.wcsPageStarted) return;
  if (!window.WCSPageModules || window.WCSPageModules['review']?.version !== 'e2db2c0c561d') {
    failPage('Load wcspedia-reviewer-workspace.js before wcspedia-reviewer-workspaceHTMLPage.js. Use both files from the same upload package and check their attachment URLs.');
    return;
  }
  if (window.WCSPageRenderer?.version !== 'e2db2c0c561d' || typeof window.WCSPageRenderer.start !== 'function') { failPage('The WCSpedia page renderer is unavailable. Upload the matching package.'); return; }
  mount.dataset.wcsPageStarted = 'review';
  const pageReady=window.WCSPageRenderer.start();
  if(pageReady&&typeof pageReady.catch==='function')pageReady.catch(error=>failPage(error.message));
  return pageReady;
})();
