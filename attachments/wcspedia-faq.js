/* WCSpedia FAQs: page logic and dependencies.
 * Shared external loader validates the native page, loads one reusable core,
 * then this role registry and its matching HTMLPage renderer.
 * This file alone does not render a page or make data requests.
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
  if (mount.getAttribute('data-wcs-page-role') !== 'faq' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== 'faq') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the wcspedia-faq.html settings and its matching JavaScript pair.');
    return;
  }

  const modules = window.WCSPageModules = window.WCSPageModules || {};
  if (modules['faq']) return;
/* Shared WCSpedia interface glyphs. Exact PAL sidebar paths retain their license
 * in attachments/licenses/sidebar-icons-LICENSE.txt. Artwork, logos and progress
 * indicators are separate. Inline vectors need no image/CDN requests. */
(function(root,factory){
  'use strict';
  var api=root&&root.WCSIcons||factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(root)root.WCSIcons=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var paths={
  "print": '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6zM17 12h1"/>',
  "copy": "<rect x=\"8\" y=\"8\" width=\"12\" height=\"13\" rx=\"2\"/><path d=\"M16 8V3H3v13h5\"/>",
  "book": "<path d=\"M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z\"/>",
  "file": "<path d=\"M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6\"/>",
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "arrow": "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>",
  "chevron": "<path d=\"m9 5 7 7-7 7\"/>",
  "back": "<path d=\"m15 5-7 7 7 7\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "check": "<path d=\"m5 12 4 4L19 6\"/>",
  "shield": "<path d=\"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\"/><path d=\"m8 12 3 3 5-6\"/>",
  "database": "<ellipse cx=\"12\" cy=\"5\" rx=\"8\" ry=\"3\"/><path d=\"M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0\"/>",
  "chart": "<path d=\"M4 3v18h17M8 16v-5m5 5V7m5 9V4\"/>",
  "globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"9\"/><path d=\"M3 12h18\"/>",
  "briefcase": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 7V3h8v4M3 12c5 4 13 4 18 0M12 12v4\"/>",
  "grid": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  "close": "<path d=\"m6 6 12 12M6 18 18 6\"/>",
  "edit": '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/>',
  "suggest": '<path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7ZM7 8h10M7 12h6"/>',
  "markdown": '<path d="M9 3h11v14H9zM5 7H3v14h13v-2"/>',
  "download": "<path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/>",
  "link": "<path d=\"M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2\"/>",
  "users": "<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4c3 0 4 2 4 6\"/>",
  "down": "<path d=\"m6 9 6 6 6-6\"/>",
  "video": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m10 9 5 3-5 3z\"/>",
  "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m3 17 5-5 4 4 4-6 5 7\"/>",
  "table": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"1\"/><path d=\"M3 9h18M3 14h18M9 4v16M15 4v16\"/>",
  "embed": "<path d=\"m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18\"/>",
  "fullscreen": "<path d=\"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5\"/>",
  "divider": "<path d=\"M3 12h18\"/>",
  "clear": "<path d=\"m4 16 8-12 8 12M7 12h10M3 21h18M3 3l18 18\"/>",
  "codeblock": "<path d=\"M8 3H4v18h16V3h-4M9 8l-3 4 3 4m6-8 3 4-3 4\"/>",
  "undo": "<path d=\"m3 5 0 6h6M3 11a8 8 0 1 1 1 7\"/>",
  "redo": "<path d=\"m21 5 0 6h-6m6 0a8 8 0 1 0-1 7\"/>",
  "attachment": "<path d=\"m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2\"/>",
  "job-aid": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"16\" rx=\"2\"/><rect x=\"9\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\"/><path d=\"m8 13 2 2 5-5M8 18h8\"/>",
  "procedure": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"5\" rx=\"1\"/><rect x=\"14\" y=\"16\" width=\"7\" height=\"5\" rx=\"1\"/><path d=\"M6.5 8v10.5H14m-3-3 3 3-3 3M14 5h7m-7 4h5\"/>",
  "knowledge-sharing": "<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><path d=\"M2 15v-2a4 4 0 0 1 8 0v2m4 0v-2a4 4 0 0 1 8 0v2M5 19h14m-3-3 3 3-3 3m-8-6-3 3 3 3\"/>",
  "blog": "<path d=\"M12 4H5a2 2 0 0 0-2 2v14a1 1 0 0 0 1 1h14a2 2 0 0 0 2-2v-7M8 16l1-4L18 3a2.1 2.1 0 0 1 3 3l-9 9-4 1Zm8-11 3 3M7 18h7\"/>",
  "training": "<path d=\"m2 8 10-5 10 5-10 5L2 8Zm4 2v7c4 3 8 3 12 0v-7m4-2v9\"/>",
  "reference": "<path d=\"M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14M5 9h4m-4 4h4m6-4h4m-4 4h4\"/>",
  "report": "<path d=\"M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 17v-3m4 3v-6m4 6v-4\"/>",
  "guide": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z\"/>",
  "playbook": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M8 3v18m3-13 6 4-6 4V8Z\"/>",
  "checklist": "<path d=\"m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M11 6h10m-10 6h10m-10 6h10\"/>",
  "template": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 9v12m4-8h4m-4 4h4\"/>",
  "faq": "<path d=\"M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z\"/><path d=\"M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 3\"/><circle cx=\"12\" cy=\"14\" r=\".5\" fill=\"currentColor\" stroke=\"none\"/>",
  "document": "<path d=\"M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6\"/>",
  "left": "<path d=\"m15 6-6 6 6 6\"/>",
  "right": "<path d=\"m9 6 6 6-6 6\"/>",
  "up": "<path d=\"M12 19V5m-6 6 6-6 6 6\"/>",
  "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 11h18\"/>",
  "user": "<circle cx=\"12\" cy=\"7.75\" r=\"3.5\"/><path d=\"M5 20v-1a7 7 0 0 1 14 0v1H5Z\"/>",
  "lock": "<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3M12 14v3\"/>",
  "bookmark": "<path d=\"M6 3h12v18l-6-4-6 4V3Z\"/>",
  "helpful": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"8.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M7.8 13.5c1.2 3.7 7.2 3.7 8.4 0\"/>",
  "not-helpful": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"8.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0\"/>",
  "arrow-left": "<path d=\"M20 12H4m6-6-6 6 6 6\"/>",
  "external": "<path d=\"M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5\"/>",
  "quote": "<path d=\"M4 11h6v8H3v-7c0-4 2-7 6-8M15 11h6v8h-7v-7c0-4 2-7 6-8\"/>",
  "list": "<path d=\"M8 6h13M8 12h13M8 18h13\"/><circle cx=\"3\" cy=\"6\" r=\".75\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"3\" cy=\"12\" r=\".75\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"3\" cy=\"18\" r=\".75\" fill=\"currentColor\" stroke=\"none\"/>",
  "ordered-list": "<path d=\"M9 6h12M9 12h12M9 18h12M3 4h1v5M3 9h2M2.5 14c0-2 3.5-2 3.5 0 0 1.5-3.5 3-3.5 5H6\"/>",
  "bold": "<path d=\"M6 4h6a4 4 0 0 1 0 8H6V4Zm0 8h7a4 4 0 0 1 0 8H6v-8Z\"/>",
  "italic": "<path d=\"M10 4h8M6 20h8M14 4 10 20\"/>",
  "underline": "<path d=\"M6 4v7a6 6 0 0 0 12 0V4M4 21h16\"/>",
  "strike": "<path d=\"M17 6c-1-2-4-3-7-2-4 1-4 5-1 6m6 4c5 2 3 6-1 6-3 0-5-1-6-3M3 12h18\"/>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6\"/><circle cx=\"12\" cy=\"7.5\" r=\".75\" fill=\"currentColor\" stroke=\"none\"/>",
  "warning": "<path d=\"m12 3 10 18H2L12 3Z\"/><path d=\"M12 9v5\"/><circle cx=\"12\" cy=\"17.5\" r=\".75\" fill=\"currentColor\" stroke=\"none\"/>",
  "error": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m9 9 6 6m0-6-6 6\"/>"
};
  var filled={
  "insights": "M5.5 3.25C4.25736 3.25 3.25 4.25736 3.25 5.5V18.5C3.25 19.7426 4.25736 20.75 5.5 20.75H18.5001C19.7427 20.75 20.7501 19.7426 20.7501 18.5V5.5C20.7501 4.25736 19.7427 3.25 18.5001 3.25H5.5ZM4.75 5.5C4.75 5.08579 5.08579 4.75 5.5 4.75H18.5001C18.9143 4.75 19.2501 5.08579 19.2501 5.5V18.5C19.2501 18.9142 18.9143 19.25 18.5001 19.25H5.5C5.08579 19.25 4.75 18.9142 4.75 18.5V5.5ZM6.25005 9.7143C6.25005 9.30008 6.58583 8.9643 7.00005 8.9643L17 8.96429C17.4143 8.96429 17.75 9.30008 17.75 9.71429C17.75 10.1285 17.4143 10.4643 17 10.4643L7.00005 10.4643C6.58583 10.4643 6.25005 10.1285 6.25005 9.7143ZM6.25005 14.2857C6.25005 13.8715 6.58583 13.5357 7.00005 13.5357H17C17.4143 13.5357 17.75 13.8715 17.75 14.2857C17.75 14.6999 17.4143 15.0357 17 15.0357H7.00005C6.58583 15.0357 6.25005 14.6999 6.25005 14.2857Z",
  "credit-approval-control": "M3.70186 12.0001C3.70186 7.41711 7.41711 3.70186 12.0001 3.70186C16.5831 3.70186 20.2984 7.41711 20.2984 12.0001C20.2984 16.5831 16.5831 20.2984 12.0001 20.2984C7.41711 20.2984 3.70186 16.5831 3.70186 12.0001ZM12.0001 1.90186C6.423 1.90186 1.90186 6.423 1.90186 12.0001C1.90186 17.5772 6.423 22.0984 12.0001 22.0984C17.5772 22.0984 22.0984 17.5772 22.0984 12.0001C22.0984 6.423 17.5772 1.90186 12.0001 1.90186ZM15.6197 10.7395C15.9712 10.388 15.9712 9.81819 15.6197 9.46672C15.2683 9.11525 14.6984 9.11525 14.347 9.46672L11.1894 12.6243L9.6533 11.0883C9.30183 10.7368 8.73198 10.7368 8.38051 11.0883C8.02904 11.4397 8.02904 12.0096 8.38051 12.3611L10.553 14.5335C10.7217 14.7023 10.9507 14.7971 11.1894 14.7971C11.428 14.7971 11.657 14.7023 11.8257 14.5335L15.6197 10.7395Z",
  "credit-information-management": "M3.25 5.5C3.25 4.25736 4.25736 3.25 5.5 3.25H18.5C19.7426 3.25 20.75 4.25736 20.75 5.5V18.5C20.75 19.7426 19.7426 20.75 18.5 20.75H5.5C4.25736 20.75 3.25 19.7426 3.25 18.5V5.5ZM5.5 4.75C5.08579 4.75 4.75 5.08579 4.75 5.5V8.58325L19.25 8.58325V5.5C19.25 5.08579 18.9142 4.75 18.5 4.75H5.5ZM19.25 10.0833H15.416V13.9165H19.25V10.0833ZM13.916 10.0833L10.083 10.0833V13.9165L13.916 13.9165V10.0833ZM8.58301 10.0833H4.75V13.9165H8.58301V10.0833ZM4.75 18.5V15.4165H8.58301V19.25H5.5C5.08579 19.25 4.75 18.9142 4.75 18.5ZM10.083 19.25V15.4165L13.916 15.4165V19.25H10.083ZM15.416 19.25V15.4165H19.25V18.5C19.25 18.9142 18.9142 19.25 18.5 19.25H15.416Z",
  "credit-management-reporting": "M12 2C11.5858 2 11.25 2.33579 11.25 2.75V12C11.25 12.4142 11.5858 12.75 12 12.75H21.25C21.6642 12.75 22 12.4142 22 12C22 6.47715 17.5228 2 12 2ZM12.75 11.25V3.53263C13.2645 3.57761 13.7659 3.66843 14.25 3.80098V3.80099C15.6929 4.19606 16.9827 4.96184 18.0104 5.98959C19.0382 7.01734 19.8039 8.30707 20.199 9.75C20.3316 10.2341 20.4224 10.7355 20.4674 11.25H12.75ZM2 12C2 7.25083 5.31065 3.27489 9.75 2.25415V3.80099C6.14748 4.78734 3.5 8.0845 3.5 12C3.5 16.6944 7.30558 20.5 12 20.5C15.9155 20.5 19.2127 17.8525 20.199 14.25H21.7459C20.7251 18.6894 16.7492 22 12 22C6.47715 22 2 17.5229 2 12Z",
  "deal-closing": "M20.3662 1.11216C20.6592 0.8193 21.134 0.819349 21.4269 1.11227C21.7198 1.4052 21.7197 1.88007 21.4268 2.17293L17.0308 6.56803C16.7379 6.8609 16.263 6.86085 15.9701 6.56792C15.6773 6.275 15.6773 5.80013 15.9702 5.50726L20.3662 1.11216ZM16.6592 2.696C16.952 2.40308 16.952 1.9282 16.659 1.63534C16.3661 1.34248 15.8913 1.34253 15.5984 1.63545L14.0987 3.13545C13.8058 3.42837 13.8059 3.90325 14.0988 4.19611C14.3917 4.48897 14.8666 4.48892 15.1595 4.196L16.6592 2.696ZM11.8343 3.45488C11.7079 3.19888 11.4472 3.0368 11.1617 3.0368C10.8762 3.0368 10.6155 3.19888 10.4892 3.45488L8.06431 8.36817L2.64217 9.15605C2.35966 9.19711 2.12495 9.39499 2.03673 9.6665C1.94851 9.93801 2.02208 10.2361 2.22651 10.4353L6.15001 14.2598L5.2238 19.66C5.17554 19.9414 5.29121 20.2258 5.52216 20.3936C5.75312 20.5614 6.05932 20.5835 6.31201 20.4506L11.1617 17.901L16.0114 20.4506C16.2641 20.5835 16.5703 20.5614 16.8013 20.3936C17.0322 20.2258 17.1479 19.9414 17.0996 19.66L16.1734 14.2598L20.0969 10.4353C20.3014 10.2361 20.3749 9.93801 20.2867 9.6665C20.1985 9.39499 19.9638 9.19711 19.6813 9.15605L14.2591 8.36817L11.8343 3.45488ZM9.23491 9.3856L11.1617 5.48147L13.0885 9.3856C13.1978 9.60696 13.4089 9.76039 13.6532 9.79588L17.9617 10.4219L14.8441 13.4609C14.6673 13.6332 14.5866 13.8814 14.6284 14.1247L15.3643 18.4158L11.5107 16.3898C11.2922 16.275 11.0312 16.275 10.8127 16.3898L6.9591 18.4158L7.69508 14.1247C7.7368 13.8814 7.65614 13.6332 7.47938 13.4609L4.36174 10.4219L8.67021 9.79588C8.91449 9.76039 9.12567 9.60696 9.23491 9.3856ZM21.6514 5.12825C21.9443 5.42111 21.9444 5.89598 21.6515 6.18891L20.1518 7.68891C19.8589 7.98183 19.3841 7.98188 19.0912 7.68901C18.7982 7.39615 18.7982 6.92128 19.091 6.62836L20.5907 5.12836C20.8836 4.83543 21.3585 4.83538 21.6514 5.12825Z",
  "documentation-pledging": "M8.50391 4.25C8.50391 3.83579 8.83969 3.5 9.25391 3.5H15.2777C15.4766 3.5 15.6674 3.57902 15.8081 3.71967L18.2807 6.19234C18.4214 6.333 18.5004 6.52376 18.5004 6.72268V16.75C18.5004 17.1642 18.1646 17.5 17.7504 17.5H16.248V17.4993H14.748V17.5H9.25391C8.83969 17.5 8.50391 17.1642 8.50391 16.75V4.25ZM14.748 19H9.25391C8.01126 19 7.00391 17.9926 7.00391 16.75V6.49854H6.24805C5.83383 6.49854 5.49805 6.83432 5.49805 7.24854V19.75C5.49805 20.1642 5.83383 20.5 6.24805 20.5H13.998C14.4123 20.5 14.748 20.1642 14.748 19.75L14.748 19ZM7.00391 4.99854V4.25C7.00391 3.00736 8.01127 2 9.25391 2H15.2777C15.8745 2 16.4468 2.23705 16.8687 2.659L19.3414 5.13168C19.7634 5.55364 20.0004 6.12594 20.0004 6.72268V16.75C20.0004 17.9926 18.9931 19 17.7504 19H16.248L16.248 19.75C16.248 20.9926 15.2407 22 13.998 22H6.24805C5.00541 22 3.99805 20.9926 3.99805 19.75V7.24854C3.99805 6.00589 5.00541 4.99854 6.24805 4.99854H7.00391Z",
  "emea-credit-admin": "M8.80443 5.60156C7.59109 5.60156 6.60749 6.58517 6.60749 7.79851C6.60749 9.01185 7.59109 9.99545 8.80443 9.99545C10.0178 9.99545 11.0014 9.01185 11.0014 7.79851C11.0014 6.58517 10.0178 5.60156 8.80443 5.60156ZM5.10749 7.79851C5.10749 5.75674 6.76267 4.10156 8.80443 4.10156C10.8462 4.10156 12.5014 5.75674 12.5014 7.79851C12.5014 9.84027 10.8462 11.4955 8.80443 11.4955C6.76267 11.4955 5.10749 9.84027 5.10749 7.79851ZM4.86252 15.3208C4.08769 16.0881 3.70377 17.0608 3.51705 17.8611C3.48384 18.0034 3.5211 18.1175 3.60712 18.2112C3.70161 18.3141 3.86659 18.3987 4.07591 18.3987H13.4249C13.6343 18.3987 13.7992 18.3141 13.8937 18.2112C13.9797 18.1175 14.017 18.0034 13.9838 17.8611C13.7971 17.0608 13.4132 16.0881 12.6383 15.3208C11.8821 14.572 10.6899 13.955 8.75042 13.955C6.81096 13.955 5.61877 14.572 4.86252 15.3208ZM3.8071 14.2549C4.87163 13.2009 6.45602 12.455 8.75042 12.455C11.0448 12.455 12.6292 13.2009 13.6937 14.2549C14.7397 15.2906 15.2207 16.5607 15.4446 17.5202C15.7658 18.8971 14.6071 19.8987 13.4249 19.8987H4.07591C2.89369 19.8987 1.73504 18.8971 2.05628 17.5202C2.28015 16.5607 2.76117 15.2906 3.8071 14.2549ZM15.3042 11.4955C14.4702 11.4955 13.7006 11.2193 13.0821 10.7533C13.3742 10.3314 13.6054 9.86419 13.7632 9.36432C14.1597 9.75463 14.7039 9.99545 15.3042 9.99545C16.5176 9.99545 17.5012 9.01185 17.5012 7.79851C17.5012 6.58517 16.5176 5.60156 15.3042 5.60156C14.7039 5.60156 14.1597 5.84239 13.7632 6.23271C13.6054 5.73284 13.3741 5.26561 13.082 4.84371C13.7006 4.37777 14.4702 4.10156 15.3042 4.10156C17.346 4.10156 19.0012 5.75674 19.0012 7.79851C19.0012 9.84027 17.346 11.4955 15.3042 11.4955ZM19.9248 19.8987H16.3901C16.7014 19.4736 16.9159 18.969 16.9827 18.3987H19.9248C20.1341 18.3987 20.2991 18.3141 20.3936 18.2112C20.4796 18.1175 20.5169 18.0034 20.4837 17.861C20.2969 17.0607 19.913 16.088 19.1382 15.3208C18.4047 14.5945 17.261 13.9921 15.4231 13.9566C15.2232 13.6945 14.9995 13.437 14.7491 13.1891C14.5144 12.9566 14.262 12.7384 13.9916 12.5362C14.3853 12.4831 14.8044 12.4549 15.2503 12.4549C17.5447 12.4549 19.1291 13.2008 20.1936 14.2549C21.2395 15.2906 21.7206 16.5607 21.9444 17.5202C22.2657 18.8971 21.107 19.8987 19.9248 19.8987Z",
  "loan-management": "M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z",
  "regional-operating-manuals": "M7.75586 5.50098C7.75586 5.08676 8.09165 4.75098 8.50586 4.75098H18.4985C18.9127 4.75098 19.2485 5.08676 19.2485 5.50098L19.2485 15.4956C19.2485 15.9098 18.9127 16.2456 18.4985 16.2456H8.50586C8.09165 16.2456 7.75586 15.9098 7.75586 15.4956V5.50098ZM8.50586 3.25098C7.26322 3.25098 6.25586 4.25834 6.25586 5.50098V6.26318H5.50195C4.25931 6.26318 3.25195 7.27054 3.25195 8.51318V18.4995C3.25195 19.7422 4.25931 20.7495 5.50195 20.7495H15.4883C16.7309 20.7495 17.7383 19.7421 17.7383 18.4995L17.7383 17.7456H18.4985C19.7411 17.7456 20.7485 16.7382 20.7485 15.4956L20.7485 5.50097C20.7485 4.25833 19.7411 3.25098 18.4985 3.25098H8.50586ZM16.2383 17.7456H8.50586C7.26322 17.7456 6.25586 16.7382 6.25586 15.4956V7.76318H5.50195C5.08774 7.76318 4.75195 8.09897 4.75195 8.51318V18.4995C4.75195 18.9137 5.08774 19.2495 5.50195 19.2495H15.4883C15.9025 19.2495 16.2383 18.9137 16.2383 18.4995L16.2383 17.7456Z",
  "home": "M5.5 3.25C4.25736 3.25 3.25 4.25736 3.25 5.5V8.99998C3.25 10.2426 4.25736 11.25 5.5 11.25H9C10.2426 11.25 11.25 10.2426 11.25 8.99998V5.5C11.25 4.25736 10.2426 3.25 9 3.25H5.5ZM4.75 5.5C4.75 5.08579 5.08579 4.75 5.5 4.75H9C9.41421 4.75 9.75 5.08579 9.75 5.5V8.99998C9.75 9.41419 9.41421 9.74998 9 9.74998H5.5C5.08579 9.74998 4.75 9.41419 4.75 8.99998V5.5ZM5.5 12.75C4.25736 12.75 3.25 13.7574 3.25 15V18.5C3.25 19.7426 4.25736 20.75 5.5 20.75H9C10.2426 20.75 11.25 19.7427 11.25 18.5V15C11.25 13.7574 10.2426 12.75 9 12.75H5.5ZM4.75 15C4.75 14.5858 5.08579 14.25 5.5 14.25H9C9.41421 14.25 9.75 14.5858 9.75 15V18.5C9.75 18.9142 9.41421 19.25 9 19.25H5.5C5.08579 19.25 4.75 18.9142 4.75 18.5V15ZM12.75 5.5C12.75 4.25736 13.7574 3.25 15 3.25H18.5C19.7426 3.25 20.75 4.25736 20.75 5.5V8.99998C20.75 10.2426 19.7426 11.25 18.5 11.25H15C13.7574 11.25 12.75 10.2426 12.75 8.99998V5.5ZM15 4.75C14.5858 4.75 14.25 5.08579 14.25 5.5V8.99998C14.25 9.41419 14.5858 9.74998 15 9.74998H18.5C18.9142 9.74998 19.25 9.41419 19.25 8.99998V5.5C19.25 5.08579 18.9142 4.75 18.5 4.75H15ZM15 12.75C13.7574 12.75 12.75 13.7574 12.75 15V18.5C12.75 19.7426 13.7574 20.75 15 20.75H18.5C19.7426 20.75 20.75 19.7427 20.75 18.5V15C20.75 13.7574 19.7426 12.75 18.5 12.75H15ZM14.25 15C14.25 14.5858 14.5858 14.25 15 14.25H18.5C18.9142 14.25 19.25 14.5858 19.25 15V18.5C19.25 18.9142 18.9142 19.25 18.5 19.25H15C14.5858 19.25 14.25 18.9142 14.25 18.5V15Z"
};
  var viewBoxes={"insights":"0 0 24 24","credit-approval-control":"0 0 24 24","credit-information-management":"0 0 24 24","credit-management-reporting":"0 0 24 24","deal-closing":"0 0 24 24","documentation-pledging":"0 0 24 24","emea-credit-admin":"0 0 24 24","loan-management":"0 0 20 20","regional-operating-manuals":"0 0 24 24","home":"0 0 24 24","mine":"0 0 24 24","review":"0 0 24 24","saved":"0 0 24 24","entitlements":"0 0 24 24","working":"0 0 24 24"};
  var aliases={"grid":"home","users":"review","copy":"documentation-pledging","chart":"credit-management-reporting","chevron":"right","back":"left","mine":"home","review":"emea-credit-admin","saved":"documentation-pledging","entitlements":"credit-approval-control","working":"regional-operating-manuals","pdf":"file","docx":"file","md":"codeblock","mdx":"codeblock","mdx-template":"template"};
  function escape(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function own(table,key){return Object.prototype.hasOwnProperty.call(table,key);}
  function has(name){name=own(aliases,name)?aliases[name]:name;return own(filled,name)||own(paths,name);}
  function svg(name,options){
    options=options||{};name=own(aliases,name)?aliases[name]:String(name||'file');
    if(!own(filled,name)&&!own(paths,name))name='file';
    var isFilled=own(filled,name),size=Number(options.size)||20;
    size=Math.max(12,Math.min(48,size));
    var classes='wcs-icon'+(options.className?' '+String(options.className).replace(/[^a-zA-Z0-9 _-]/g,''):'');
    var accessible=options.label?' role="img" aria-label="'+escape(options.label)+'"':' aria-hidden="true"';
    return '<svg class="'+classes+'" data-wcs-icon="'+name+'" viewBox="'+(viewBoxes[name]||'0 0 24 24')+'" width="'+size+'" height="'+size+'" fill="'+(isFilled||options.filled===true?'currentColor':'none')+'" stroke="'+(isFilled?'none':'currentColor')+'" stroke-width="'+(options.variant==='action'?'1.7':'1.5')+'" stroke-linecap="round" stroke-linejoin="round" focusable="false"'+accessible+'>'+(isFilled?'<path fill-rule="evenodd" clip-rule="evenodd" d="'+filled[name]+'"/>':paths[name])+'</svg>';
  }
  function node(doc,name,options){var holder=doc.createElement('span');holder.innerHTML=svg(name,options);return holder.firstElementChild;}
  function avatar(person,options){
    options=options||{};
    var extra=String(options.className||'').replace(/[^a-zA-Z0-9 _-]/g,'');
    return '<span class="wcs-avatar'+(extra?' '+extra:'')+'" aria-hidden="true">'+svg('user')+'</span>';
  }
  return Object.freeze({svg:svg,node:node,avatar:avatar,has:has});
});

;
/* Generated by generate-wordmark.py: local Citi Sans Text Bold outlines; no font request. */
(function(w){
  'use strict';
  if(w.WCSBrand)return;
  var wordmark="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"584\" height=\"124\" viewBox=\"0 0 584 124\" role=\"img\" aria-label=\"WCSpedia\" color=\"#255be3\"><title>WCSpedia</title><desc>WCSpedia knowledge library: an open book and blue lettering with a red accent.</desc><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M7 29Q7 24 12 24C26 24 39 28 47 35V99C36 91 23 87 10 88Q7 88 7 85ZM17 35V77C24 77 31 79 37 82V40C31 37 24 35 17 35ZM53 35C61 28 74 24 88 24Q93 24 93 29V85Q93 88 90 88C77 87 64 91 53 99ZM63 40V82C69 79 76 77 83 77V35C76 35 69 37 63 40Z\"/><path fill=\"currentColor\" d=\"M103.7 26H117.6L130.1 82.2L142.4 26H158L170.2 82.4L182.9 26H196.8L178.4 96H162.8L150.2 39.1L137.6 96H122ZM201.6 61Q201.6 50.1 205.6 41.9Q209.6 33.7 217.1 29.25Q224.6 24.8 234.8 24.8Q244.6 24.8 251.85 29.15Q259.1 33.5 262.4 41.7L250.5 47.1Q245.6 36.6 234.9 36.6Q225.5 36.6 220.45 42.95Q215.4 49.3 215.4 60.9Q215.4 72.6 220.45 79Q225.5 85.4 234.7 85.4Q245.9 85.4 251.1 74.3L262.9 79.7Q259.2 88 252 92.6Q244.8 97.2 235 97.2Q224.7 97.2 217.15 92.7Q209.6 88.2 205.6 80Q201.6 71.8 201.6 61ZM267.3 79.4 278.4 74.4Q280.6 80.8 284.7 83.55Q288.8 86.3 295.2 86.3Q301.3 86.3 305 83.7Q308.7 81.1 308.7 76.2Q308.7 72.5 306.4 70.4Q304.1 68.3 299.5 67.1L288.3 64.2Q279.7 62 275.4 57.45Q271.1 52.9 271.1 45.6Q271.1 39.3 274.35 34.6Q277.6 29.9 283.35 27.35Q289.1 24.8 296.3 24.8Q306.1 24.8 313.15 28.85Q320.2 32.9 322.9 40.7L311.5 45.8Q307.5 35.7 296.2 35.7Q291.1 35.7 287.8 38Q284.5 40.3 284.5 44.5Q284.5 47.7 286.6 49.65Q288.7 51.6 293.1 52.8L304.8 55.9Q313.3 58.2 317.65 62.9Q322 67.6 322 75.1Q322 81.9 318.65 86.9Q315.3 91.9 309.2 94.55Q303.1 97.2 295.1 97.2Q284.5 97.2 277.3 92.85Q270.1 88.5 267.3 79.4ZM333.3 46.5H345.3V54Q347.5 49.9 351.75 47.6Q356 45.3 361.3 45.3Q367.7 45.3 372.45 48.5Q377.2 51.7 379.75 57.55Q382.3 63.4 382.3 71.2Q382.3 79.1 379.75 84.95Q377.2 90.8 372.45 94Q367.7 97.2 361.3 97.2Q356.3 97.2 352.2 95.15Q348.1 93.1 345.8 89.4V114H333.3ZM357.4 86.9Q363 86.9 366.2 82.75Q369.4 78.6 369.4 71.2Q369.4 63.8 366.2 59.7Q363 55.6 357.4 55.6Q351.7 55.6 348.4 59.75Q345.1 63.9 345.1 71.2Q345.1 78.6 348.4 82.75Q351.7 86.9 357.4 86.9ZM388.2 71.3Q388.2 63.6 391.25 57.7Q394.3 51.8 399.8 48.55Q405.3 45.3 412.5 45.3Q419.5 45.3 424.7 48.45Q429.9 51.6 432.65 57.1Q435.4 62.6 435.4 69.5Q435.4 71.4 435 74.6H400.8Q401.4 80.9 404.6 84.2Q407.8 87.5 413.2 87.5Q421.2 87.5 424.3 80.4L434.8 84.8Q432 91 426.35 94.1Q420.7 97.2 413.2 97.2Q405.6 97.2 399.95 94.05Q394.3 90.9 391.25 85.05Q388.2 79.2 388.2 71.3ZM423.8 66.4Q423.6 61.4 420.65 58.1Q417.7 54.8 412.5 54.8Q407.9 54.8 404.85 57.8Q401.8 60.8 401 66.4ZM477.9 96V88.9Q475.6 92.8 471.45 95Q467.3 97.2 462.1 97.2Q455.7 97.2 450.95 94Q446.2 90.8 443.65 84.95Q441.1 79.1 441.1 71.2Q441.1 63.4 443.65 57.55Q446.2 51.7 450.95 48.5Q455.7 45.3 462.1 45.3Q467.1 45.3 471.15 47.3Q475.2 49.3 477.5 53V24H490V96ZM466 86.9Q471.7 86.9 475 82.75Q478.3 78.6 478.3 71.2Q478.3 63.9 475 59.75Q471.7 55.6 466 55.6Q460.4 55.6 457.2 59.7Q454 63.8 454 71.2Q454 78.6 457.2 82.75Q460.4 86.9 466 86.9ZM503.9 46.5H516.4V96H503.9ZM526.8 82.2Q526.8 76.3 530.5 72.6Q534.2 68.9 541.6 67.6L552.1 65.9Q555.2 65.3 556.55 64.1Q557.9 62.9 557.9 61Q557.9 58.5 555.65 57Q553.4 55.5 549.3 55.5Q545.2 55.5 542.45 57.1Q539.7 58.7 538.5 61.6L527.8 57Q529.9 51.4 535.65 48.35Q541.4 45.3 549.3 45.3Q559.3 45.3 564.75 49.8Q570.2 54.3 570.2 63.1V82.7Q570.2 85 570.85 85.9Q571.5 86.8 573.1 86.8Q574.8 86.8 575.9 86.1V94.3Q573 96.7 568.6 96.7Q564.8 96.7 562.2 94.95Q559.6 93.2 558.6 89.9Q556.3 93.4 552.55 95.3Q548.8 97.2 543.8 97.2Q536.2 97.2 531.5 93.25Q526.8 89.3 526.8 82.2ZM546.7 87.7Q551.8 87.7 554.85 84.35Q557.9 81 557.9 74.6V71.3Q555.8 73.4 551.4 74.1L545.1 75.3Q539.1 76.3 539.1 81.5Q539.1 84.4 541.05 86.05Q543 87.7 546.7 87.7Z\"/><circle fill=\"#ff3c28\" cx=\"510.15\" cy=\"31\" r=\"7.75\"/></svg>";
  w.WCSBrand=Object.freeze({wordmark:wordmark});
})(window);

;
/* One initial WCSpedia introduction. Later actions keep their own local busy state. */
(function (w) {
  'use strict';
  if (w.WCSLoadingOverlay?.version === 3) return;
  let sequence = 0, startup;
  function create({target, delayMs = 0} = {}) {
    if (startup) { if (target) startup.adoptTarget(target); return startup; }
    const d = target?.ownerDocument || w.document, pending = new Set(), cleanups = [];
    target = target || d.createElement('div');
    let overlay, message, bar, fill, attributes, before, overflow, queuedText, timer, showTimer, frame = 0, closeFrame = 0;
    let closed = false, ready = false, completing = false, cycleStarted = false, cycleComplete = false, completion;
    let resolveCompletion;
    completion = new Promise(resolve => { resolveCompletion = resolve; });
    const address = new URL(w.location.href);
    const hash = value => !value || /^#\/?\??$/.test(value) ? '#/' : value;
    function restore(node, name, value) { if (value == null) node.removeAttribute(name); else node.setAttribute(name, value); }
    function mark() {
      attributes = {busy:target.getAttribute('aria-busy'), inert:target.getAttribute('inert')};
      target.setAttribute('aria-busy','true'); target.setAttribute('inert','');
    }
    function adoptTarget(next) {
      if (!next || next === target || closed) return;
      if (overlay) { restore(target,'aria-busy',attributes.busy); restore(target,'inert',attributes.inert); }
      target = next; if (overlay) mark();
    }
    function close() {
      if (closed) return;
      closed = true; w.clearTimeout(timer); w.clearTimeout(showTimer);
      if (frame) w.cancelAnimationFrame(frame); if (closeFrame) w.cancelAnimationFrame(closeFrame);
      cleanups.splice(0).forEach(fn => fn());
      if (overlay) {
        const refocus = d.activeElement === overlay || overlay.contains(d.activeElement);
        overlay.remove(); overlay = null;
        restore(target,'aria-busy',attributes.busy); restore(target,'inert',attributes.inert);
        if (d.body.style.overflow === 'hidden') d.body.style.overflow = overflow;
        if (refocus && before?.isConnected && !before.closest('[inert]')) before.focus({preventScroll:true});
      }
      resolveCompletion();
    }
    function listen(node, event, fn, options) { node.addEventListener(event,fn,options);cleanups.push(() => node.removeEventListener(event,fn,options)); }
    function keys(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab' && overlay) { event.preventDefault();overlay.focus({preventScroll:true}); }
    }
    function settle() {
      if (closed || !ready || !cycleComplete || d.hidden || closeFrame) return;
      closeFrame = w.requestAnimationFrame(() => { closeFrame = w.requestAnimationFrame(close); });
    }
    function startCycle() {
      if (closed || !overlay || d.hidden || cycleComplete || frame) return;
      frame = w.requestAnimationFrame(() => { frame = w.requestAnimationFrame(() => {
        frame = 0; if (closed || d.hidden || !overlay) return;
        cycleStarted = true; overlay.removeAttribute('data-cycle-restart');overlay.setAttribute('data-cycle-running','');
      }); });
    }
    function animationEnded(event) {
      if (event.target !== fill || event.animationName !== 'wcs-loading-fill' || !cycleStarted) return;
      if (d.hidden) { cycleStarted = false;overlay.setAttribute('data-cycle-restart','');return; }
      cycleComplete = true;overlay.setAttribute('data-cycle-complete','');overlay.removeAttribute('data-cycle-running');settle();
    }
    function visibilityChanged() {
      if (closed) return;
      if (d.hidden) {
        overlay?.removeAttribute('data-cycle-running');
        if (frame) w.cancelAnimationFrame(frame);frame = 0;
        if (closeFrame) w.cancelAnimationFrame(closeFrame);closeFrame = 0;
      } else { startCycle();settle(); }
    }
    function departed() {
      if (w.location.pathname !== address.pathname || w.location.search !== address.search || hash(w.location.hash) !== hash(address.hash)) close();
    }
    function display(text) {
      if (closed) return;
      if (!d.body) { queuedText = text;return; }
      if (!overlay) {
        before = d.activeElement; overflow = d.body.style.overflow;mark();d.body.style.overflow = 'hidden';
        const id = 'wcs-loading-message-' + (++sequence);
        overlay = d.createElement('div');overlay.className = 'wcs-loading-overlay';overlay.setAttribute('role','dialog');
        overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Loading WCSpedia');overlay.tabIndex = -1;
        overlay.innerHTML = '<div class="wcs-loading-panel"><div class="wcs-loading-wordmark">'+(w.WCSBrand?.wordmark || '<span>WCSpedia</span>')+'</div><p class="wcs-loading-message" id="'+id+'" role="status" aria-live="polite"></p><div class="wcs-loading-track" role="progressbar" aria-label="Loading WCSpedia"><div class="wcs-loading-fill"></div></div></div>';
        message = overlay.querySelector('.wcs-loading-message');bar = overlay.querySelector('.wcs-loading-track');fill = overlay.querySelector('.wcs-loading-fill');
        d.body.append(overlay);overlay.focus({preventScroll:true});
        listen(d,'keydown',keys,true);listen(fill,'animationend',animationEnded);listen(d,'visibilitychange',visibilityChanged);
        listen(w,'hashchange',departed);listen(w,'popstate',departed);
        timer = w.setTimeout(close,30000);startCycle();
      }
      message.textContent = text || 'A world of knowledge. One place to find it.';
      bar.setAttribute('aria-valuetext',text || 'Loading WCSpedia');
    }
    function show(text) {
      if (closed) return;
      if (!overlay && delayMs > 0 && !showTimer) showTimer = w.setTimeout(() => { showTimer = null;display(text); },delayMs);
      else display(text);
    }
    function progress(completed,total,text) {
      if (!overlay || !Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return;
      const actual=Math.max(0,Math.min(total,completed));
      bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-valuenow',String(actual));
      if (text) message.textContent = text;
      bar.setAttribute('aria-valuetext',actual+' of '+total+' loading steps complete. '+message.textContent);
    }
    function paint() {
      return new Promise(resolve => {
        let first,second,done = false;
        function finish(){if(done)return;done=true;w.clearTimeout(bound);w.cancelAnimationFrame(first);w.cancelAnimationFrame(second);resolve();}
        const bound=w.setTimeout(finish,250);first=w.requestAnimationFrame(() => {second=w.requestAnimationFrame(finish);});
      });
    }
    function visible(node) { const box=node.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.right>0&&box.top<w.innerHeight&&box.left<w.innerWidth; }
    function mediaReady(node) {
      return new Promise(resolve => {
        const events=node.tagName==='VIDEO'?['loadeddata','error','abort']:['load','error'];let done=false;
        const finish=()=>{if(done)return;done=true;events.forEach(name=>node.removeEventListener(name,finish));resolve();};
        cleanups.push(finish);events.forEach(name=>node.addEventListener(name,finish));
        if(node.tagName==='VIDEO'?node.readyState>=2||node.error:node.complete||!node.getAttribute('src'))finish();
      });
    }
    async function finish() {
      if (closed) return completion;
      if (!overlay) { close();return completion; }
      if (!completing) {
        completing=true;
        const media=Array.from(target.querySelectorAll('img,video')).filter(visible);
        let bound;
        await Promise.race([Promise.all(media.map(mediaReady).concat(d.fonts?.ready||[])).catch(()=>{}),new Promise(resolve=>{bound=w.setTimeout(resolve,2500);})]);
        w.clearTimeout(bound);if(closed)return completion;
        await paint();if(closed)return completion;
        ready=true;settle();
      }
      return completion;
    }
    async function wait(promise,{timeoutMs=60000}={}) {
      let timeout,rejectWait;
      const limit=new Promise((_,reject)=>{rejectWait=reject;timeout=w.setTimeout(()=>reject(new Error('Loading took too long. Check your connection, then try again.')),timeoutMs);});
      const cancel=()=>rejectWait(new Error('Page loading was interrupted.'));pending.add(cancel);
      try{return await Promise.race([promise,limit]);}finally{w.clearTimeout(timeout);pending.delete(cancel);}
    }
    function destroy(){close();for(const cancel of pending)cancel();pending.clear();}
    listen(w,'pagehide',destroy);listen(w,'pageshow',event=>{if(event.persisted)destroy();});
    if(!d.body)listen(d,'DOMContentLoaded',()=>{if(queuedText&&!closed)display(queuedText);},{once:true});
    startup={show,progress,hide:close,cancel:close,finish,wait,destroy,adoptTarget,paint,get closed(){return closed;}};
    return startup;
  }
  function skeleton(label='Loading documents…') {
    const safe=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return '<div class="wcs-loading-skeleton" role="status"><span class="sr-only">'+safe+'</span><div aria-hidden="true">'+Array.from({length:3},()=>'<div class="wcs-skeleton-card"><i></i><i></i><i></i></div>').join('')+'</div></div>';
  }
  w.WCSLoadingOverlay={create,skeleton,version:3};
})(window);

;
/* Mosaic-style page actions. Presentation only: callers supply already-authorized
 * actions and the canonical selected revision. No access or content requests. */
(function (w, d) {
  'use strict';
  if (w.WCSPageActions) return;
  var current = null;
  function allowed(options) {
    if (options.enabled === false || !options.root || !options.root.isConnected || w.top !== w.self) return false;
    var space = d.querySelector('meta[name="ajs-space-key"]');
    if (space && space.content && space.content !== 'wcspedia') return false;
    return !/(?:editpage|createpage|createblogpost|viewpagehistory|diffpages|viewpreviousversions|preview|spacepermissions)\.action$/i.test(w.location.pathname) &&
      !/\/(?:admin|plugins\/servlet\/admin)(?:\/|$)/i.test(w.location.pathname) &&
      !/[?&](?:pageVersion|preview)=/.test(w.location.search) &&
      !/^#\/(?:create|edit)(?:[/?]|$)/.test(w.location.hash) &&
      !d.querySelector('#editpageform,#createpageform,#content-editor,body.contenteditor');
  }
  // Match Mosaic's round 1.7px action outlines; PAL navigation paths remain
  // unchanged. A local fallback keeps controls distinct during a partial load.
  var actionIcons = {edit:'edit',suggest:'suggest',copy:'link',markdown:'markdown',print:'print',download:'download',details:'info'};
  var fallbackPaths = {
    edit:'m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z',
    suggest:'M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7ZM7 8h10M7 12h6',
    markdown:'M9 3h11v14H9zM5 7H3v14h13v-2',
    link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    print:'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6zM17 12h1',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7.5h.01',
    check:'m5 12 4 4L19 6',
    file:'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6'
  };
  function icon(name) {
    if (w.WCSIcons && typeof w.WCSIcons.svg === 'function' && (!w.WCSIcons.has || w.WCSIcons.has(name))) return w.WCSIcons.svg(name,{variant:'action'});
    name=Object.prototype.hasOwnProperty.call(fallbackPaths,name)?name:'file';
    return '<svg class="wcs-icon" data-wcs-icon="'+name+'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+fallbackPaths[name]+'"/></svg>';
  }
  function safeHref(value) {
    try { var url = new URL(value, w.location.href); return /^https?:$/.test(url.protocol) && url.origin === w.location.origin && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; }
  }
  function mount(options) {
    options = options || {};
    if (current) current.destroy();
    if (!allowed(options)) return null;
    var actions = (Array.isArray(options.actions) ? options.actions : []).filter(function (a) { return a && a.id && a.label && a.visible !== false && (typeof a.run === 'function' || safeHref(a.href)); });
    if (!actions.length) return null;
    var rail = d.createElement('nav'), status = d.createElement('p'), disposed = false, timers = new Set(), jobs = new Set(), buttons = [], hiddenSources = [];
    rail.className = 'wcs-page-actions'; rail.setAttribute('aria-label', 'Page actions'); rail.setAttribute('data-wcs-page-actions', '');
    status.className = 'wcs-page-action-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    function announce(message, error) {
      status.textContent = String(message || ''); status.toggleAttribute('data-error', !!error);
      if (error && typeof options.onError === 'function') options.onError(message);
    }
    function later(fn, ms) { var id = w.setTimeout(function () { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; }
    function setState(item, state, label) {
      item.element.dataset.wcsActionState = state;
      item.element.setAttribute('aria-busy', String(state === 'pending'));
      item.element.setAttribute('aria-disabled', String(state === 'pending' || !!item.action.disabled));
      item.label.textContent = label || item.action.label;
      item.element.setAttribute('aria-label', label || item.action.label);
    }
    actions.forEach(function (action) {
      var href = safeHref(action.href), element = d.createElement(typeof action.run === 'function' ? 'button' : 'a');
      if (element.tagName === 'BUTTON') element.type = 'button'; else element.href = href;
      element.className = 'wcs-page-action'; element.dataset.wcsPageAction = action.id;
      element.innerHTML = '<span class="wcs-page-action-icon" aria-hidden="true"><span data-wcs-feedback="idle">' + icon(action.icon || actionIcons[action.id] || action.id) + '</span><span data-wcs-feedback="pending" class="wcs-page-action-spinner"></span><span data-wcs-feedback="success">' + icon('check') + '</span></span>';
      var label = d.createElement('span'); label.className = 'wcs-page-action-label'; element.append(label);
      if (action.hasPopup) { element.setAttribute('aria-haspopup', action.hasPopup); element.setAttribute('aria-expanded', 'false'); }
      var item = {element: element, label: label, action: action, token: 0}; buttons.push(item); setState(item, 'idle');
      element.addEventListener('click', async function (event) {
        if (disposed || action.disabled || element.getAttribute('aria-busy') === 'true' || !allowed(options)) { event.preventDefault(); return; }
        if (typeof action.run !== 'function') return;
        event.preventDefault();
        var controller = new w.AbortController(), token = ++item.token; jobs.add(controller);
        announce('', false);
        setState(item, 'pending', action.busyLabel || action.label + '…');
        try {
          var result = await action.run({anchor: element, signal: controller.signal});
          if (disposed || controller.signal.aborted || item.token !== token) return;
          if (result === false) { setState(item, 'idle'); return; }
          if (action.successLabel) {
            setState(item, 'success', action.successLabel); announce(action.successLabel, false);
            later(function () { if (item.token === token) setState(item, 'idle'); }, 1800);
          } else setState(item, 'idle');
        } catch (error) {
          if (!disposed && !controller.signal.aborted && item.token === token) {
            setState(item, 'idle'); announce(error && error.message || 'This action could not be completed. Try again.', true);
          }
        } finally { jobs.delete(controller); }
      });
      rail.append(element);
      // Hide only explicitly supplied duplicate controls. Restore their original
      // hidden value on teardown; do not touch generic/native toolbars.
      if (action.source && action.source.nodeType === 1 && !hiddenSources.some(function (s) { return s.node === action.source; })) {
        hiddenSources.push({node: action.source, hidden: action.source.hidden}); action.source.hidden = true;
      }
    });
    rail.append(status); d.body.append(rail); options.root.setAttribute('data-wcs-has-page-actions', '');
    function refresh() { if (!disposed && !allowed(options)) destroy(); }
    function pageHide(event) { if (!event.persisted) destroy(); }
    function destroy() {
      if (disposed) return; disposed = true; timers.forEach(w.clearTimeout.bind(w)); jobs.forEach(function (job) { job.abort(); }); timers.clear(); jobs.clear();
      hiddenSources.forEach(function (entry) { entry.node.hidden = entry.hidden; });
      options.root.removeAttribute('data-wcs-has-page-actions'); rail.remove();
      w.removeEventListener('hashchange', refresh); w.removeEventListener('popstate', refresh); w.removeEventListener('pagehide', pageHide); observer && observer.disconnect();
      if (current && current.element === rail) current = null;
    }
    w.addEventListener('hashchange', refresh); w.addEventListener('popstate', refresh); w.addEventListener('pagehide', pageHide);
    var observer = w.MutationObserver ? new w.MutationObserver(function () { if (!options.root.isConnected) destroy(); }) : null;
    if (observer) observer.observe(d.body, {childList: true, subtree: true});
    current = {element: rail, refresh: refresh, destroy: destroy, button: function (id) { var item = buttons.find(function (b) { return b.action.id === id; }); return item && item.element; }};
    return current;
  }
  w.WCSPageActions = Object.freeze({mount: mount, destroy: function () { if (current) current.destroy(); }});
})(window, document);

;
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

;
/* Static help: no workspace, entitlement, document or analytics requests. */
(function(global){
  'use strict';
  const entries=[
    ['How do I find a document or browse a business area?', 'Search from the landing page to find documents and Insights articles. Choose Explore documents to filter by business area, content type, topic or updated year. Only content your signed-in Confluence account can access is included.'],
    ['What is Insights, and which content type should I choose?', 'Insights brings together Guides, Blogs, Training and Reports. Use a Guide for procedures, playbooks or checklists; a Blog for updates and stories; Training for learning materials; and a Report for findings or reference information. Choose Job aid for operational instructions that require review and approval.'],
    ['How do I create a document and use a template?', 'Select Add document in the header, then choose a content type. In the editor, use the template button for that type and complete the title, summary, topics and content. Available actions depend on your entitlements and native Confluence permissions.'],
    ['Where are my drafts, and how does publishing work?', 'My Workspace contains your documents and their workflow status. Save unfinished work there. Guides, Blogs, Training and Reports publish directly to Insights when you select Publish to Insights. Job aids require a business area and assigned reviewers, then follow the review and manager approval steps. Saving a draft does not publish it.'],
    ['How do I review a Job aid or respond to requested changes?', 'Open Reviewer Workspace for work assigned to you. Read the document and review comments before choosing an available action. Authors can find requested changes in My Workspace, update the document and resubmit it. The audit trail records workflow decisions.'],
    ['How do I save an article for later?', 'Use the save action in the document reader, then open Saved from the header to return to it. Removing a saved item removes your bookmark, not the original document. A saved article may become unavailable if it is deleted or your Confluence access changes.'],
    ['How do I edit, suggest a correction or delete a document?', 'Open your document from My Workspace and use the actions available to you. For someone else’s article, use Suggest an edit when available. Deletion requires the document key and a decision comment; you can copy the key from the confirmation dialog. A successful deletion returns you to your originating list.'],
    ['How are covers, summaries, authors and view counts shown?', 'An uploaded cover takes priority. Insights without a cover use a fallback image assigned consistently to the article. Cards use the document’s summary and author, and display recorded view counts when available. “Views unavailable” means a count could not be retrieved; it does not mean zero views.'],
    ['Why can’t I see a document or use an action?', 'Native Confluence permissions control access to pages and attachments. WCSpedia entitlements control the application actions offered to your account; they do not grant Confluence access. If something is missing, ask your space administrator to check both your native access and your entitlement record.'],
    ['What should I do if loading, search or publishing fails?', 'Keep your editor open if a save or publication fails and read the error before retrying. For loading or search errors, use Try again and check that your Confluence session is still signed in. Newly published articles can take time to appear in native search. If the problem continues, share the page link and error with your space administrator; do not share tokens or cookies.']
  ];
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function mount(root,config){
    const home=global.WCSNavigation.resolve('#/',config,global.location.href);
    const explore=global.WCSNavigation.resolve('#/results',config,global.location.href);
    root.innerHTML='<div class="shell discovery-shell"><div class="discovery workspace-page wcs-faq-page"><section class="press-heading page-panel"><div class="discovery-container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="'+escape(home)+'">WCSpedia</a><span class="wcs-breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">FAQs</span></nav><div class="eyebrow">Help &amp; guidance</div><h1>Frequently asked questions</h1><p>Find your way around WCSpedia, from your first search to publishing a document.</p></div></section><div class="discovery-container"><form class="library-workspace-search" role="search"><label for="wcs-faq-search">Search FAQs</label><div class="wcs-faq-search-row"><input id="wcs-faq-search" type="search" maxlength="200" placeholder="Try publishing, saved items or access…" aria-controls="wcs-faq-list" autocomplete="off"><button class="button secondary" type="reset">Clear</button></div></form><p class="library-count" id="wcs-faq-count" role="status"></p><div id="wcs-faq-list">'+entries.map(([q,a],i)=>'<details class="wcs-help-item"><summary id="wcs-help-q-'+i+'">'+escape(q)+''+(global.WCSIcons?global.WCSIcons.svg('down'):'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>')+'</summary><div role="region" aria-labelledby="wcs-help-q-'+i+'"><p>'+escape(a)+'</p></div></details>').join('')+'</div><p class="wcs-faq-empty" hidden>No matching questions. Try a different word or clear your search.</p><div class="wcs-faq-footer"><p>Ready to find what you need?</p><a class="discovery-text-link" href="'+escape(explore)+'">Explore documents '+(global.WCSIcons?global.WCSIcons.svg('arrow'):'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>')+'</a></div></div></div></div>';
    const input=root.querySelector('#wcs-faq-search'),items=[...root.querySelectorAll('.wcs-help-item')];
    const filter=()=>{
      const words=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let visible=0;
      items.forEach((item,i)=>{const matches=words.every(word=>entries[i].join(' ').toLocaleLowerCase().includes(word));item.hidden=!matches;if(matches){visible++;if(words.length)item.open=true;}});
      root.querySelector('#wcs-faq-count').textContent=words.length?visible+' of '+entries.length+' questions':entries.length+' questions';
      root.querySelector('.wcs-faq-empty').hidden=visible!==0;
    };
    input.addEventListener('input',filter);
    root.querySelector('form').addEventListener('submit',event=>event.preventDefault());
    root.querySelector('form').addEventListener('reset',event=>{event.preventDefault();input.value='';items.forEach(item=>item.open=false);filter();input.focus();});
    filter();
    if(global.WCSPageActions){
      const pageTools=global.WCSPageActions.mount({root,actions:[
        {id:'copy',label:'Copy link',icon:'link',successLabel:'Link copied',async run(){
          if(!global.navigator.clipboard?.writeText)throw Error('Clipboard unavailable. Copy the page address from your browser.');
          await global.navigator.clipboard.writeText(global.location.href);
        }},
        {id:'print',label:'Print',icon:'print',run:()=>global.print()}
      ]});
      global.addEventListener('pagehide',()=>pageTools?.destroy(),{once:true});
    }
  }
  global.WCSFAQ={mount};
})(window);

  modules['faq'] = { version: 'f70a954c1217' };
})();
