/* WCSpedia Insights: page logic and dependencies.
 * Shared external loader validates the native page, loads one reusable core,
 * then this role registry and its matching HTMLPage renderer.
 * This file alone does not render a page or make data requests.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('0cb7a477338c'))) return;
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
  if (mount.getAttribute('data-wcs-page-role') !== 'insights' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'insights') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-insights.html settings and its matching JavaScript pair.');
    return;
  }

  const modules = window.WCSPageModules = window.WCSPageModules || {};
  if (modules['insights']) return;
  if (window.WCSCoreVersion !== '0cb7a477338c') { failPage('The shared WCSpedia core is unavailable. Upload the matching package.'); return; }
  modules['insights'] = { version: '0cb7a477338c' };
})();
