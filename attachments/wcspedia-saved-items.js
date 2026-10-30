/* WCSpedia Saved items: page logic and dependencies.
 * Shared external loader validates the native page, loads one reusable core,
 * then this role registry and its matching HTMLPage renderer.
 * This file alone does not render a page or make data requests.
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
  if (mount.getAttribute('data-wcs-page-role') !== 'saved' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'saved') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-saved-items.html settings and its matching JavaScript pair.');
    return;
  }

  const modules = window.WCSPageModules = window.WCSPageModules || {};
  if (modules['saved']) return;
  if (window.WCSCoreVersion !== 'e873788a7aff') { failPage('The shared WCSpedia core is unavailable. Upload the matching package.'); return; }
  modules['saved'] = { version: 'e873788a7aff' };
})();
