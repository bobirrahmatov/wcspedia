/* WCSpedia Knowledge base: page logic and dependencies.
 * Shared external loader validates the native page, loads one reusable core,
 * then this role registry and its matching HTMLPage renderer.
 * This file alone does not render a page or make data requests.
 */
(function () {
  'use strict';
  const mount = document.getElementById('wcspedia');
  if (!mount || (window.__WCSMacroLoader && !window.__WCSMacroLoader.canRender?.('b0ed10d1898b'))) return;
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

  const modules = window.WCSPageModules = window.WCSPageModules || {};
  if (modules['home']) return;
  if (window.WCSCoreVersion !== 'b0ed10d1898b') { failPage('The shared WCSpedia core is unavailable. Upload the matching package.'); return; }
  modules['home'] = { version: 'b0ed10d1898b' };
})();
