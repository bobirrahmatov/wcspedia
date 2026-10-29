/* Source: icons.js */
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
  "edit": "<path d=\"m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z\"/>",
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
    return '<svg class="'+classes+'" data-wcs-icon="'+name+'" viewBox="'+(viewBoxes[name]||'0 0 24 24')+'" width="'+size+'" height="'+size+'" fill="'+(isFilled||options.filled===true?'currentColor':'none')+'" stroke="'+(isFilled?'none':'currentColor')+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"'+accessible+'>'+(isFilled?'<path fill-rule="evenodd" clip-rule="evenodd" d="'+filled[name]+'"/>':paths[name])+'</svg>';
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
/* Source: article-comments.js */
/* Native Confluence Server/Data Center footer comments. The native REST service
 * owns comment permissions and storage; no document JSON or page body is changed.
 * https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/
 * https://docs.atlassian.com/ConfluenceServer/rest/7.18.3/
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSArticleComments = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PAGE_SIZE = 20, MAX_TEXT = 10000, MAX_RESPONSE = 1024 * 1024;
  function problem(message, code, outcome) {
    var error = new Error(message); error.code = code || 'INVALID_DATA';
    if (outcome) { error.outcome = outcome; error.retryable = false; }
    return error;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function id(value) { return (typeof value === 'string' || Number.isSafeInteger(value)) && /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : ''; }
  function escape(value) { return value.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(value, max) { return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max || 500) : ''; }
  function abort(signal) { if (signal && signal.aborted) { var error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; } }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
  function storage(text) {
    if (typeof text !== 'string') throw problem('Enter a comment.', 'VALIDATION');
    text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    if (!text || text.length > MAX_TEXT) throw problem('Enter a comment of 1 to 10,000 characters.', 'VALIDATION');
    return { text: text, html: '<p>' + escape(text).replace(/\n/g, '<br />') + '</p>' };
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var fetcher = dependencies.fetch || (root.fetch && root.fetch.bind(root));
    var location = dependencies.location || root.location, address;
    try { address = new URL(location && (location.href || location.origin)); } catch (_) { throw problem('A Confluence page URL is required.', 'CONFIGURATION'); }
    if (!/^https?:$/.test(address.protocol) || address.username || address.password || typeof fetcher !== 'function') throw problem('Use the signed-in Confluence origin.', 'CONFIGURATION');
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || context && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context)) throw problem('Use a plain Confluence context path.', 'CONFIGURATION');
    context = context.replace(/\/+$/, '');
    if (config.baseUrl != null) {
      var base; try { base = new URL(config.baseUrl, address.origin); } catch (_) { throw problem('Invalid Confluence base URL.', 'CONFIGURATION'); }
      if (base.origin !== address.origin || base.pathname.replace(/\/+$/, '') !== context || base.username || base.password || base.hash || base.search) throw problem('Use this Confluence origin and context.', 'CONFIGURATION');
    }
    var rootId = id(config.rootPageId), spaceKey = clean(config.spaceKey, 255);
    var publication = object(config.nativePublication) ? config.nativePublication : config;
    var insightsId = publication.insightsPageId == null || publication.insightsPageId === '' ? '' : id(publication.insightsPageId);
    if (publication.insightsPageId && !insightsId) throw problem('Configure a numeric Insights parent page ID.', 'CONFIGURATION');
    var areas = object(publication.areaPageIds) ? publication.areaPageIds : {}, areaIds = Object.keys(areas).map(function (key) { return id(areas[key]); });
    if (!rootId || !spaceKey || !areaIds.length || areaIds.some(function (value) { return !value || value === rootId; }) || new Set(areaIds).size !== areaIds.length) throw problem('Configure the WCSpedia root, exact space key and distinct business-area page IDs.', 'CONFIGURATION');
    if (insightsId && [rootId].concat(areaIds).includes(insightsId)) throw problem('Insights must have a distinct parent page ID.', 'CONFIGURATION');
    var excludedPages = new Set([rootId].concat(areaIds, insightsId ? [insightsId] : [])), excludedTrees = new Set();
    function exclude(value, subtree) {
      if (value == null || value === '') return;
      var parsed = id(value); if (!parsed) throw problem('Exclusions require numeric Confluence page IDs.', 'CONFIGURATION');
      excludedPages.add(parsed); if (subtree) excludedTrees.add(parsed);
    }
    exclude(config.attachmentPageId);
    Object.keys(object(config.pageIds) ? config.pageIds : {}).forEach(function (key) { exclude(config.pageIds[key]); });
    exclude(publication.workingRootPageId, true);
    var search = object(config.search) ? config.search : {};
    ['excludePageIds', 'excludeAncestorIds'].forEach(function (key) {
      if (search[key] != null && (!Array.isArray(search[key]) || search[key].length > 100)) throw problem('Use at most 100 excluded pages.', 'CONFIGURATION');
      (search[key] || []).forEach(function (value) { exclude(value, key === 'excludeAncestorIds'); });
    });
    // Existing generated page configuration stores navigation URLs rather than IDs.
    Object.keys(object(config.pages) ? config.pages : {}).forEach(function (key) {
      var url; try { url = new URL(config.pages[key], address); } catch (_) { return; }
      if (url.origin !== address.origin || context && !url.pathname.startsWith(context + '/')) return;
      var match = url.pathname.match(/\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/);
      var page = id(url.searchParams.get('pageId')) || match && id(match[1]); if (page) excludedPages.add(page);
    });
    if (insightsId && excludedTrees.has(insightsId) || excludedTrees.has(rootId) || areaIds.some(function (area) { return excludedTrees.has(area); })) throw problem('The working or excluded subtree must be separate from the WCSpedia root and business areas.', 'CONFIGURATION');
    var timeoutMs = config.timeoutMs == null ? 12000 : config.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw problem('Use a timeout between 1,000 and 30,000 milliseconds.', 'CONFIGURATION');
    var clock = dependencies.now || Date.now, Parser = dependencies.DOMParser || root.DOMParser;
    var scopes = new Map(), denied = new Set(), activeWrites = new Set();
    function endpoint(path, query) { var url = new URL(context + '/rest/api' + path, address.origin); if (query) url.search = new URLSearchParams(query).toString(); return url; }
    function pageUrl(pageId, commentId) { return address.origin + context + '/pages/viewpage.action?pageId=' + pageId + (commentId ? '&focusedCommentId=' + commentId + '#comment-' + commentId : ''); }
    function unknown() { return problem('Confluence may have saved your comment. Check the discussion before posting it again.', 'OUTCOME_UNKNOWN', 'unknown'); }
    async function request(url, options) {
      options = options || {}; var writing = options.body !== undefined, signal = options.signal;
      abort(signal);
      var controller = new AbortController(), timedOut = false;
      var onAbort = function () { controller.abort(); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      var timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        var response;
        try { response = await fetcher(url.href, { method: writing ? 'POST' : 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal, headers: Object.assign({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, writing ? { 'Content-Type': 'application/json' } : {}), body: writing ? JSON.stringify(options.body) : undefined }); }
        catch (error) {
          if (writing) throw unknown();
          abort(signal);
          throw problem(timedOut ? 'Loading comments took too long. Try again.' : 'Confluence could not be reached.', timedOut ? 'TIMEOUT' : 'NETWORK');
        }
        if (!response.ok) {
          if (writing && (response.status >= 500 || response.status === 408)) throw unknown();
          var error = problem(response.status === 401 ? 'Sign in to Confluence to comment.' : response.status === 403 ? 'Confluence does not permit this comment action.' : response.status === 404 ? 'This page or comment is unavailable.' : 'Confluence could not complete this request (' + response.status + ').', response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR', writing ? 'rejected' : undefined);
          error.status = response.status; throw error;
        }
        var body, value;
        try { body = await response.text(); if (body.length > MAX_RESPONSE) throw new Error('Too large'); value = JSON.parse(body); }
        catch (_) { if (writing) throw unknown(); abort(signal); throw problem('Confluence did not return valid comment data.', 'INVALID_DATA'); }
        if (!writing) abort(signal);
        return value;
      } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
    }
    function user(value) {
      value = object(value) ? value : {};
      var userId = clean(value.userKey || value.username, 255);
      return { id: userId, userKey: clean(value.userKey, 255), username: clean(value.username, 255), displayName: clean(value.displayName, 255) || (userId ? 'Confluence user' : 'Anonymous'), authenticated: value.type !== 'anonymous' && value.type !== 'unknown' && !!userId };
    }
    function sameUser(a,b) { if (a.userKey && b.userKey) return a.userKey === b.userKey; return !!(a.id && a.id === b.id || a.username && b.username && a.username.toLowerCase() === b.username.toLowerCase()); }
    function commentsSetting(page) {
      var body = page.body && page.body.storage && page.body.storage.value;
      if (typeof body !== 'string' || body.length > 800000 || typeof Parser !== 'function') throw problem('The article comment setting could not be verified. Comments are unavailable until the setting can be read.', 'COMMENTS_SETTINGS_UNAVAILABLE');
      // Read only real native Anchor macros, not escaped examples/code/macros.
      // This marker shares the same CAS revision as the approved article content.
      // Native storage can contain HTML named entities and Atlassian template
      // namespaces. Normalize known entities without interpreting article markup.
      var entities = Object.create(null);
      body = body.replace(/&([A-Za-z][A-Za-z0-9]+);/g, function (whole, name) {
        if (/^(amp|lt|gt|quot|apos)$/.test(name)) return whole;
        if (!Object.prototype.hasOwnProperty.call(entities, name)) {
          var decoded = new Parser().parseFromString('<textarea>' + whole + '</textarea>', 'text/html').body.textContent;
          entities[name] = decoded === whole ? whole : Array.from(decoded).map(function (point) { return '&#' + point.codePointAt(0) + ';'; }).join('');
        }
        return entities[name];
      });
      var parsed = new Parser().parseFromString('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri" xmlns:at="urn:at">' + body + '</root>', 'text/xml');
      if (parsed.querySelector('parsererror')) throw problem('The article comment setting is malformed. Comments are unavailable until it is corrected.', 'COMMENTS_SETTINGS_INVALID');
      var markers = [];
      Array.from(parsed.getElementsByTagNameNS('urn:ac', 'structured-macro')).forEach(function (macro) {
        if (macro.getAttributeNS('urn:ac', 'name') !== 'anchor') return;
        Array.from(macro.children).forEach(function (parameter) {
          if (parameter.namespaceURI !== 'urn:ac' || parameter.localName !== 'parameter' || parameter.getAttributeNS('urn:ac', 'name') !== '') return;
          var value = parameter.textContent.trim();
          if (value.indexOf('wcs-comments-') === 0) markers.push(value);
        });
      });
      if (!markers.length) return true; // Pre-setting native pages retain existing discussion behavior.
      if (markers.length !== 1 || !/^wcs-comments-v1-(enabled|disabled)$/.test(markers[0])) throw problem('The article comment setting is malformed or duplicated. Comments are unavailable until it is corrected.', 'COMMENTS_SETTINGS_INVALID');
      return markers[0] === 'wcs-comments-v1-enabled';
    }
    async function resolve(pageId, options) {
      options = options || {}; pageId = id(pageId);
      if (!pageId || excludedPages.has(pageId)) throw problem('Discussion is available on child articles only.', 'OUT_OF_SCOPE');
      abort(options.signal);
      var cached = scopes.get(pageId);
      if (!options.force && cached && clock() - cached.at < 30000) return Object.assign({}, cached.value, { user: Object.assign({}, cached.value.user), canComment: cached.value.canComment && !denied.has(pageId) });
      var results = await Promise.all([
        request(endpoint('/content/' + rootId, { expand: 'space' }), { signal: options.signal }),
        request(endpoint('/content/' + pageId, { expand: 'space,ancestors,operations,version,body.storage' }), { signal: options.signal }),
        request(endpoint('/user/current'), { signal: options.signal })
      ]);
      abort(options.signal);
      var rootPage = results[0], page = results[1];
      if (!object(rootPage) || id(rootPage.id) !== rootId || rootPage.type !== 'page' || !rootPage.space || rootPage.space.key !== spaceKey || rootPage.status && rootPage.status !== 'current') throw problem('The WCSpedia root does not match the configured space.', 'OUT_OF_SCOPE');
      var ancestors = object(page) && Array.isArray(page.ancestors) ? page.ancestors.map(function (entry) { return id(entry.id); }) : [];
      var rootPosition = ancestors.indexOf(rootId), areaId = '';
      Object.keys(areas).forEach(function (key) { if (ancestors.indexOf(id(areas[key])) > rootPosition && ancestors.indexOf(id(areas[key])) >= 0) areaId = key; });
      if (insightsId && ancestors.indexOf(insightsId) > rootPosition && ancestors.indexOf(insightsId) >= 0) areaId = 'insights';
      if (!object(page) || id(page.id) !== pageId || page.type !== 'page' || page.status !== 'current' || !page.space || page.space.key !== spaceKey || rootPosition < 0 || !areaId || ancestors.some(function (ancestor) { return excludedTrees.has(ancestor); })) throw problem('This page is outside the WCSpedia article tree.', 'OUT_OF_SCOPE');
      var actor = user(results[2]), commentsEnabled = commentsSetting(page);
      // Older Server releases omit comment operations. A signed-in reader may
      // submit a request; the native endpoint always decides whether to accept it.
      // A local UI entitlement is never used to grant native comment permission.
      var explicit = Array.isArray(page.operations) && page.operations.some(function (operation) { return operation.operation === 'create' && operation.targetType === 'comment'; });
      var result = { pageId: pageId, title: clean(page.title), url: pageUrl(pageId), areaId: areaId, spaceKey: spaceKey, commentsEnabled: commentsEnabled, user: actor, canComment: commentsEnabled && actor.authenticated && !denied.has(pageId), permissionKnown: !!explicit, nativePage: JSON.parse(JSON.stringify(page)) };
      if (scopes.size >= 10) scopes.delete(scopes.keys().next().value);
      scopes.set(pageId, { at: clock(), value: result }); return Object.assign({}, result, { user: Object.assign({}, actor) });
    }
    function plain(html) {
      if (typeof html !== 'string' || html.length > 250000 || typeof Parser !== 'function') throw problem('A browser parser is required to read comments.', 'INVALID_DATA');
      var doc = new Parser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,iframe,object,embed,template,noscript,svg,math,form,input,button,textarea,select,[hidden],[aria-hidden="true"]').forEach(function (node) { node.remove(); });
      doc.querySelectorAll('br').forEach(function (node) { node.replaceWith(doc.createTextNode('\n')); });
      doc.querySelectorAll('p,div,li,pre,blockquote,tr,h1,h2,h3,h4,h5,h6').forEach(function (node) { node.appendChild(doc.createTextNode('\n')); });
      return (doc.body.textContent || '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    function normalize(value, pageId, fallback) {
      if (!object(value) || !id(value.id) || value.type !== 'comment' || value.status && value.status !== 'current') throw problem('Confluence returned invalid comment data.', 'INVALID_DATA');
      if (object(value.container) && (id(value.container.id) !== pageId || value.container.type && value.container.type !== 'page')) throw problem('Confluence returned a comment for another page.', 'OUT_OF_SCOPE');
      if (value.extensions && value.extensions.location && value.extensions.location !== 'footer') throw problem('Inline comments are displayed in native Confluence.', 'INVALID_DATA');
      var body = value.body || {}, html = body.view && body.view.value || body.storage && body.storage.value;
      var history = value.history || {}, version = value.version || {}, author = user(history.createdBy || version.by);
      var parent = null;
      (Array.isArray(value.ancestors) ? value.ancestors : []).forEach(function (ancestor) { if (ancestor.type === 'comment' && id(ancestor.id)) parent = id(ancestor.id); });
      return { id: id(value.id), pageId: pageId, text: typeof html === 'string' ? plain(html) : fallback || '', version: Number.isSafeInteger(version.number) && version.number > 0 ? version.number : null, author: { id: author.id, userKey: author.userKey, username: author.username, displayName: author.id || author.displayName !== 'Anonymous' ? author.displayName : 'Confluence user' }, createdAt: timestamp(history.createdDate || version.when), updatedAt: timestamp(version.when), url: pageUrl(pageId, id(value.id)), parentId: parent };
    }
    function nextStart(value, pageId, start, count) {
      var link = value._links && value._links.next;
      if (!link) return null;
      if (typeof link !== 'string' || /[\\\u0000-\u0020]/.test(link) || /%(?:2e|2f|5c|25)/i.test(link)) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      var url = new URL(link, address.origin + context + '/');
      var expected = '/rest/api/content/' + pageId + '/child/comment';
      if (url.origin !== address.origin || url.username || url.password || url.hash || (url.pathname !== context + expected && url.pathname !== expected)) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      var raw = url.searchParams.get('start'), next = Number(raw);
      if (!/^\d+$/.test(raw || '') || !Number.isSafeInteger(next) || next <= start || next > start + count || next > 1000000) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      // Only the validated offset is reused. Returned URLs/filters are never fetched.
      return next;
    }
    async function list(pageId, options) {
      options = options || {}; var scope = await resolve(pageId, options); pageId = scope.pageId;
      if (!scope.commentsEnabled && !options.includeDisabled) throw problem('Comments are disabled for this article. Existing comments remain in Confluence.', 'COMMENTS_DISABLED');
      var start = options.start == null ? 0 : options.start;
      if (!Number.isSafeInteger(start) || start < 0 || start > 1000000) throw problem('Invalid comment offset.', 'VALIDATION');
      var result = await request(endpoint('/content/' + pageId + '/child/comment', { expand: 'body.view,history,version,ancestors,container', location: 'footer', depth: 'all', start: String(start), limit: String(PAGE_SIZE) }), { signal: options.signal });
      if (!object(result) || !Array.isArray(result.results) || result.results.length > PAGE_SIZE || result.start != null && result.start !== start) throw problem('Confluence returned invalid comments.', 'INVALID_DATA');
      var seen = new Set(), comments = result.results.map(function (value) { var comment = normalize(value, pageId); if (seen.has(comment.id)) throw problem('Duplicate comment data.', 'INVALID_DATA'); seen.add(comment.id); return comment; });
      var total = result.totalSize == null ? result.totalCount : result.totalSize;
      return { comments: comments, start: start, limit: PAGE_SIZE, nextStart: nextStart(result, pageId, start, result.results.length), total: Number.isSafeInteger(total) && total >= start + result.results.length ? total : null, canComment: scope.canComment, user: scope.user };
    }
    async function getComment(pageId, commentId, options) {
      options = options || {}; pageId = id(pageId); commentId = id(commentId);
      if (!pageId || !commentId) throw problem('Use a native article and comment ID.', 'VALIDATION');
      await resolve(pageId, options);
      var value = await request(endpoint('/content/' + commentId, { expand: 'body.view,history,version,ancestors,container' }), { signal: options.signal });
      if (!object(value.container) || id(value.container.id) !== pageId) throw problem('The comment does not belong to this article.', 'OUT_OF_SCOPE');
      if (id(value.id) !== commentId) throw problem('Confluence returned another comment.', 'INVALID_DATA');
      return normalize(value, pageId);
    }
    async function createComment(pageId, input) {
      input = input || {}; var content;
      try { content = storage(input.text); } catch (error) { error.outcome = 'rejected'; throw error; }
      pageId = id(pageId);
      var parentId = input.parentId == null ? null : id(input.parentId);
      if (input.parentId != null && !parentId) throw problem('Use a native parent comment ID.', 'VALIDATION', 'rejected');
      if (!pageId) throw problem('An article page ID is required.', 'VALIDATION', 'rejected');
      if (activeWrites.has(pageId)) throw problem('A comment is already being sent for this article.', 'BUSY', 'rejected');
      activeWrites.add(pageId);
      var postAttempted = false;
      try {
        var scope = await resolve(pageId, { force: true, signal: input.signal });
        if (!scope.commentsEnabled) throw problem('Comments are disabled for this article. Your text has not been submitted.', 'COMMENTS_DISABLED', 'rejected');
        if (!scope.canComment) throw problem('Sign in with a Confluence account allowed to comment.', 'FORBIDDEN', 'rejected');
        // Consumers can pin their recovery record to this fresh authenticated
        // scope without repeating the same root/page/current-user reads.
        if (parentId) await getComment(pageId, parentId, { signal: input.signal });
        if (typeof input.beforeSubmit === 'function') await input.beforeSubmit(Object.assign({}, scope, { user: Object.assign({}, scope.user) }));
        abort(input.signal);
        var result;
        postAttempted = true;
        // Navigation may cancel preflight reads, but cannot safely undo a POST
        // once sent. Keep observing its bounded result rather than claiming an
        // aborted browser request means Confluence did not save the comment.
        try { result = await request(endpoint('/content', { expand: 'body.view,history,version,ancestors,container' }), { body: Object.assign({ type: 'comment', container: { id: pageId, type: 'page' }, body: { storage: { value: content.html, representation: 'storage' } } }, parentId ? { ancestors: [{ id: parentId, type: 'comment' }] } : {}) }); }
        catch (error) { if (error.code === 'FORBIDDEN') { denied.add(pageId); scopes.delete(pageId); } throw error; }
        // No post retry and no invented author/time. The response confirms the ID.
        try { var saved = normalize(result, pageId, content.text); if (saved.text !== content.text || !sameUser(saved.author, scope.user) || saved.parentId !== parentId) throw unknown(); return saved; } catch (_) { throw unknown(); }
      } catch (error) {
        if (!postAttempted && !error.outcome) error.outcome = 'rejected';
        throw error;
      } finally { activeWrites.delete(pageId); }
    }
    function clear() { scopes.clear(); denied.clear(); }
    return Object.freeze({ resolve: resolve, list: list, getComment: getComment, createComment: createComment, clear: clear });
  }
  return Object.freeze({ create: create, pageSize: PAGE_SIZE, maxTextLength: MAX_TEXT });
}));

;
/* Source: article-feedback-client.js */
/* Native JSON feedback, with the earlier service adapter retained for legacy mode. */
(function (global) {
  'use strict';
  if (global.WCSArticleFeedback) return;
  function nativeClient(options) {
    function error(message, outcome) { var e = new Error(message); e.outcome = outcome || 'unknown'; return e; }
    function integer(value, minimum) { return Number.isSafeInteger(value) && value >= minimum; }
    var expectedRoot = options.rootPageId || options.config && options.config.rootPageId;
    if (!/^[1-9]\d{0,19}$/.test(options.pageId || '') || expectedRoot != null && !/^[1-9]\d{0,19}$/.test(expectedRoot)) throw error('Native feedback requires numeric document and root page IDs.', 'rejected');
    if (!options.engagement && !global.WCSSpaceEngagement) throw error('Load the matching native engagement module.', 'rejected');
    var adapter = options.engagement || global.WCSSpaceEngagement.create(options.config || options), state, writing = false, pending;
    if (!adapter || typeof adapter.load !== 'function' || typeof adapter.vote !== 'function') throw error('The native engagement adapter is unavailable.', 'rejected');
    function validate(value, receipt) {
      if (!value || (!receipt && value.schemaVersion !== 1) || (value.schemaVersion != null && value.schemaVersion !== 1) || value.pageId !== options.pageId || expectedRoot && value.rootPageId != null && value.rootPageId !== expectedRoot || !integer(value.pageVersion, 1) || typeof value.canVote !== 'boolean' || !value.myVote || ![null, 'yes', 'no'].includes(value.myVote.value) || !integer(value.myVote.revision, 0)) throw error('Feedback could not be confirmed.');
      var vote = value.myVote;
      if (vote.value === null ? vote.revision !== 0 || vote.pageVersion !== null : !integer(vote.revision, 1) || !integer(vote.pageVersion, 1) || vote.pageVersion > value.pageVersion) throw error('Feedback could not be confirmed.');
      var unresolved = value.pendingVote;
      if (unresolved != null && (!['yes', 'no'].includes(unresolved.value) || typeof unresolved.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(unresolved.requestId) || !integer(unresolved.expectedVoteRevision, 0) || !integer(unresolved.pageVersion, 1) || unresolved.pageVersion > value.pageVersion)) throw error('The pending feedback command could not be confirmed.');
      if (receipt && (value.accepted !== true || value.requestId !== receipt.requestId || vote.value !== receipt.value || vote.pageVersion !== receipt.pageVersion || vote.revision <= receipt.expectedVoteRevision)) throw error('The feedback save receipt could not be confirmed.');
      return value;
    }
    function project(value, receipt) {
      validate(value, receipt);
      // Retain only validated state; an external prime caller cannot mutate the
      // revision or permission used by the next command after this call returns.
      state = {pageVersion: value.pageVersion, canVote: value.canVote, reason: typeof value.reason === 'string' ? value.reason : '', myVote: {value: value.myVote.value, revision: value.myVote.revision, pageVersion: value.myVote.pageVersion}};
      if (receipt) pending = null;
      else if (Object.prototype.hasOwnProperty.call(value, 'pendingVote')) pending = value.pendingVote ? {value: value.pendingVote.value, requestId: value.pendingVote.requestId, expectedVoteRevision: value.pendingVote.expectedVoteRevision, pageVersion: value.pendingVote.pageVersion} : null;
      return {canVote: state.canVote, vote: state.myVote.value, reason: state.reason, source: 'confluence-json', pendingVote: pending ? {value: pending.value} : null};
    }
    function secureId() {
      try { return typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Array.from(global.crypto.getRandomValues(new Uint8Array(24))).map(function (value) { return value.toString(16).padStart(2, '0'); }).join(''); }
      catch (_) { throw error('Secure request identifiers are unavailable.', 'rejected'); }
    }
    return Object.freeze({
      prime: function (value) { return project(value); },
      load: async function (args) { return project(await adapter.load(options.pageId, args || {})); },
      save: async function (value, args) {
        if (!state || !state.canVote || writing || !['yes', 'no'].includes(value)) throw error('Load feedback and verify native permission before voting.', 'rejected');
        if (args && args.signal && args.signal.aborted) throw error('Feedback cancelled before saving.', 'rejected');
        if (pending && pending.value !== value) throw error('Resolve the previous feedback save before changing your choice.');
        var retrying = !!pending;
        if (!pending) pending = {value: value, requestId: secureId(), expectedVoteRevision: state.myVote.revision, pageVersion: state.pageVersion};
        var command = pending; writing = true;
        try {
          var result = await adapter.vote(options.pageId, value, Object.assign({}, command, {signal: args && args.signal}));
          var projected = project(result, command); pending = null; return projected;
        } catch (failure) {
          // An invalid/lost confirmation remains unknown; only definite native
          // rejections permit the UI to present an ordinary retry immediately.
          if (!failure.outcome && failure.code && !['UNKNOWN_COMMIT', 'NETWORK', 'TIMEOUT'].includes(failure.code) && failure.name !== 'AbortError') failure.outcome = 'rejected';
          // A rejected retry does not establish the outcome of the earlier
          // request. Only a subsequent native read can release that uncertainty.
          if (retrying) failure.outcome = 'unknown';
          else if (failure.outcome === 'rejected') pending = null;
          throw failure;
        } finally { writing = false; }
      }
    });
  }
  function create(options) {
    options = options || {};
    if (options.authoringMode === 'confluence-session' || options.config && options.config.authoringMode === 'confluence-session') return nativeClient(options);
    var endpoint = new URL(options.endpoint, global.location.href);
    var context = options.contextPath || '/confluence';
    if (endpoint.origin !== global.location.origin || endpoint.username || endpoint.password || !endpoint.pathname.startsWith(context + '/') || endpoint.search || endpoint.hash || !/^[1-9]\d{0,19}$/.test(options.rootPageId) || !/^[1-9]\d{0,19}$/.test(options.pageId)) throw new Error('Feedback requires a same-origin Confluence endpoint and numeric page IDs.');
    var state = null, writing = false;
    function error(message, definite) { var value = new Error(message); value.outcome = definite ? 'rejected' : 'unknown'; return value; }
    function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
    function totals(value) { return value && ['yes', 'no', 'total'].every(function (key) { return integer(value[key]); }) && value.yes + value.no === value.total; }
    function normalize(data, command) {
      if (!data || data.schemaVersion !== 1 || String(data.rootPageId) !== String(options.rootPageId) || String(data.pageId) !== String(options.pageId) || !integer(data.revision) || !data.myVote || !integer(data.myVote.revision) || !integer(data.pageVersion) || data.pageVersion < 1 || ![null, 'yes', 'no'].includes(data.myVote.value) || !totals(data.totals) || !totals(data.currentVersionTotals) || data.currentVersionTotals.total > data.totals.total || (data.myVote.value === null ? data.myVote.pageVersion !== null || data.myVote.revision !== 0 : !integer(data.myVote.pageVersion) || data.myVote.pageVersion < 1 || data.myVote.revision < 1)) throw error('Invalid feedback confirmation.', false);
      if (command && (data.accepted !== true || data.requestId !== command.requestId || data.myVote.value !== command.value || typeof data.changed !== 'boolean')) throw error('Invalid feedback save receipt.', false);
      if (!state || data.revision >= state.revision) state = data;
      return {canVote: true, vote: state.myVote.value, helpful: state.totals.yes, total: state.totals.total};
    }
    async function request(url, init, signal, command) {
      var controller = new global.AbortController(), timeout = setTimeout(function () { controller.abort(); }, 12000);
      function abort() { controller.abort(); }
      if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true}); }
      try {
        var response = await global.fetch(url, Object.assign({credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal}, init));
        if (!response.ok) throw error('Feedback request failed (' + response.status + ').', [400, 401, 403, 404, 409, 413, 422, 429].includes(response.status));
        return normalize(await response.json(), command);
      } finally { clearTimeout(timeout); if (signal) signal.removeEventListener('abort', abort); }
    }
    return Object.freeze({
      load: function (args) {
        var url = new URL(endpoint.href); url.searchParams.set('rootPageId', options.rootPageId); url.searchParams.set('pageId', options.pageId);
        return request(url.href, {}, args && args.signal);
      },
      save: async function (value, args) {
        if (!state || writing || !['yes', 'no'].includes(value)) throw error('Load feedback before voting; only one vote can be saved at a time.', true);
        if (args && args.signal && args.signal.aborted) throw error('Feedback cancelled before saving.', true);
        var requestId;
        try { requestId = typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Array.from(global.crypto.getRandomValues(new Uint8Array(24))).map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); } catch (_) { throw error('Secure request identifiers are unavailable.', true); }
        var command = {rootPageId: options.rootPageId, pageId: options.pageId, pageVersion: state.pageVersion, value: value, expectedVoteRevision: state.myVote.revision, requestId: requestId};
        writing = true;
        try { return await request(endpoint.href, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': requestId}, body: JSON.stringify(command)}, args && args.signal, command); }
        finally { writing = false; }
      }
    });
  }
  global.WCSArticleFeedback = Object.freeze({create: create});
})(window);

;
/* Source: article-discussion.js */
/* Native article comments: bounded reads and optimistic writes, with no page reload. */
(function (global) {
  'use strict';
  if (global.WCSArticleDiscussion) return;
  var sequence = 0;
  var mounts = new WeakMap();

  function mount(host, options) {
    options = options || {};
    if (!host || !host.ownerDocument || !options.adapter) throw new Error('An article host and comments adapter are required.');
    if (mounts.has(host)) return mounts.get(host);
    var doc = host.ownerDocument, adapter = options.adapter, feedback = options.feedback;
    var discussionPageId = /^[1-9]\d{0,19}$/.test(String(options.pageId || '')) ? String(options.pageId) : '';
    var id = 'wcs-discussion-' + (++sequence), disposed = false, loading = null, observer = null;
    var comments = [], cursor = null, canComment = false, user = {}, pending = null, reply = null, mutationEpoch = 0;
    var voteState = null, voteBusy = false, voteUnknown = false, controllers = new Set();
    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = String(text);
      return node;
    }
    function button(text, className, action) {
      var node = el('button', 'wcs-discussion-button' + (className ? ' ' + className : ''), text);
      node.type = 'button';
      if (action) node.addEventListener('click', action);
      return node;
    }
    function reaction(value, text) {
      var node = button('', 'wcs-discussion-reaction', function () { saveVote(value); });
      node.dataset.vote = value; node.setAttribute('aria-label', text); node.setAttribute('aria-pressed', 'false');
      var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      [['circle', {cx:'12', cy:'12', r:'9'}], ['circle', {cx:'8.5', cy:'9.5', r:'.8', fill:'currentColor', stroke:'none'}], ['circle', {cx:'15.5', cy:'9.5', r:'.8', fill:'currentColor', stroke:'none'}], ['path', {d:value === 'yes' ? 'M7.8 13.5c1.2 3.7 7.2 3.7 8.4 0' : 'M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0'}]].forEach(function (part) {
        var shape = doc.createElementNS('http://www.w3.org/2000/svg', part[0]);
        Object.keys(part[1]).forEach(function (name) { shape.setAttribute(name, part[1][name]); }); svg.append(shape);
      });
      node.append(global.WCSIcons?global.WCSIcons.node(doc,value==='yes'?'helpful':'not-helpful'):svg, el('span', '', text)); return node;
    }
    function notify(kind, text) {
      if (global.WCSNotifications && typeof global.WCSNotifications[kind] === 'function') global.WCSNotifications[kind](text);
    }
    function controller() { var item = new global.AbortController(); controllers.add(item); return item; }
    function finish(item) { controllers.delete(item); }
    function unknown(error) { return !error || !(error.outcome === 'rejected' || error.definite === true || error.unknownCommit === false); }
    function authorName(value) { return String(value && (value.displayName || value.name) || 'Confluence user'); }
    function initials(value) { return authorName(value).split(/[\s,]+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0); }).join('').toUpperCase(); }
    function setMessage(text, isError) {
      message.textContent = text || '';
      message.classList.toggle('wcs-discussion-error', !!isError);
      message.setAttribute('role', isError ? 'alert' : 'status');
    }
    function safeURL(value) {
      if (!value) return '';
      try { var url = new URL(value, global.location.href); return url.origin === global.location.origin && /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
    }
    var root = el('div', 'wcs-article-discussion');
    root.setAttribute('role', 'region'); root.setAttribute('aria-labelledby', id + '-heading');
    var helpful = el('div', 'wcs-discussion-helpful'); helpful.hidden = true;
    var helpfulLabel = el('span', 'wcs-discussion-helpful-label', 'Was this article helpful?');
    var votes = el('div', 'wcs-discussion-votes'); votes.setAttribute('role', 'group'); votes.setAttribute('aria-label', 'Was this article helpful?');
    var yes = reaction('yes', 'Helpful');
    var no = reaction('no', 'Not helpful');
    var voteMessage = el('span', 'wcs-discussion-vote-status'); voteMessage.setAttribute('role', 'status');
    votes.append(yes, no); helpful.append(helpfulLabel, votes, voteMessage);
    var headingRow = el('div', 'wcs-discussion-heading');
    var heading = el('h2', '', 'Comments'); heading.id = id + '-heading';
    var count = el('span', 'wcs-discussion-count');
    headingRow.append(heading, count, helpful);
    var introduction = el('p', 'wcs-discussion-intro', 'Ask a question or share something useful with your colleagues.');
    var list = el('ol', 'wcs-discussion-list'); list.setAttribute('aria-label', 'Article comments');
    var message = el('p', 'wcs-discussion-message', 'Comments load when you reach this section.'); message.setAttribute('role', 'status');
    var loadButton = button('Load comments', '', function () { load(); });
    var more = button('Load more comments', '', function () { load(true); }); more.hidden = true;
    var form = el('form', 'wcs-discussion-form'); form.hidden = true;
    var label = el('label', 'wcs-discussion-label', 'Add a comment'); label.htmlFor = id + '-text';
    var textarea = el('textarea', 'wcs-discussion-textarea'); textarea.id = id + '-text'; textarea.rows = 4; textarea.maxLength = 10000; textarea.required = true;
    textarea.placeholder = 'Write your comment…'; textarea.setAttribute('aria-describedby', id + '-hint');
    var hint = el('p', 'wcs-discussion-hint', 'Your comment is saved on this Confluence article.'); hint.id = id + '-hint';
    var actions = el('div', 'wcs-discussion-compose-actions');
    var cancel = button('Cancel reply', 'wcs-discussion-quiet', function () { reply = null; syncComposer(); textarea.focus(); }); cancel.hidden = true;
    var submit = button('Post comment', 'wcs-discussion-primary'); submit.type = 'submit';
    actions.append(cancel, submit); form.append(label, textarea, hint, actions);
    root.append(headingRow, introduction, form, list, message, loadButton, more); host.append(root);

    function syncComposer() {
      form.hidden = !canComment && !textarea.value.trim();
      label.textContent = !canComment ? 'Your draft' : reply ? 'Reply to ' + authorName(reply.author) : 'Add a comment';
      cancel.hidden = !reply; cancel.disabled = !!pending || !canComment;
      textarea.readOnly = !!pending || !canComment; submit.hidden = !canComment; submit.disabled = !canComment || !!pending || !textarea.value.trim();
      hint.textContent = canComment ? 'Your comment is saved on this Confluence article.' : 'Posting is unavailable. You can copy this draft and open Confluence comments.';
      submit.setAttribute('aria-busy', String(!!pending && !pending.unknown));
      submit.textContent = pending ? (pending.unknown ? 'Confirmation unavailable' : 'Posting…') : (reply ? 'Post reply' : 'Post comment');
    }
    function commentNode(comment) {
      var item = el('li', 'wcs-discussion-item'); item.dataset.commentId = String(comment.id);
      if (comment.pending) item.classList.add('wcs-discussion-pending');
      if (comment.parentId) item.classList.add('wcs-discussion-reply');
      var avatar = el('span', 'wcs-discussion-avatar'); avatar.setAttribute('aria-hidden', 'true');
      if(global.WCSIcons)avatar.append(global.WCSIcons.node(doc,'user'));
      else avatar.textContent=initials(comment.author);
      var card = el('div', 'wcs-discussion-card');
      var meta = el('div', 'wcs-discussion-meta'); meta.append(el('strong', 'wcs-discussion-author', authorName(comment.author)));
      if (comment.parentId) meta.append(el('span', 'wcs-discussion-reply-label', 'replied'));
      if (comment.pending) meta.append(el('span', 'wcs-discussion-pending-label', comment.unknown ? 'Awaiting confirmation' : 'Posting…'));
      else if (comment.createdAt && Number.isFinite(Date.parse(comment.createdAt))) {
        var date = new Date(comment.createdAt), time = el('time', '', date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}));
        time.dateTime = date.toISOString(); meta.append(time);
      }
      var body = el('div', 'wcs-discussion-body', comment.text || ''); card.append(meta, body);
      if (!comment.pending && canComment && !pending && options.replies === true) {
        var respond = button('Reply', 'wcs-discussion-quiet', function () { reply = comment; syncComposer(); textarea.focus(); });
        card.append(respond);
      }
      item.append(avatar, card); return item;
    }
    function renderList() {
      list.replaceChildren(); comments.forEach(function (comment) { list.append(commentNode(comment)); });
      if (pending) list.append(commentNode(pending));
      count.textContent = comments.length ? String(comments.length) + (cursor !== null ? '+' : '') : '';
      more.hidden = cursor === null; more.disabled = !!loading || !!pending;
    }
    function merge(items, reset) {
      var all = reset ? [] : comments.slice(), seen = new Set(all.map(function (item) { return String(item.id); }));
      (Array.isArray(items) ? items : []).forEach(function (item) {
        if (!item || !item.id || seen.has(String(item.id))) return;
        seen.add(String(item.id)); all.push(item);
      });
      comments = all;
    }
    function externalComment(event) {
      // This event carries a confirmed native write, not an instruction to fetch
      // or change permissions. Keep the composer, pending write and cursor intact.
      var detail=event && event.detail, comment=detail && detail.comment;
      if(disposed || !discussionPageId || !detail || String(detail.pageId)!==discussionPageId || !comment || String(comment.pageId)!==discussionPageId || !/^[1-9]\d{0,19}$/.test(String(comment.id||'')) || typeof comment.text!=='string' || comment.text.length>10000 || comment.pending || comment.parentId || !comment.author || typeof comment.author.id!=='string' || !comment.author.id || comment.author.id.length>255) return;
      if(comments.some(function(item){return String(item.id)===String(comment.id);}))return;
      var received={id:String(comment.id),pageId:discussionPageId,text:comment.text,author:{id:comment.author.id,displayName:String(comment.author.displayName||'Confluence user').slice(0,255)},createdAt:typeof comment.createdAt==='string'&&Number.isFinite(Date.parse(comment.createdAt))?comment.createdAt:null,parentId:null};
      mutationEpoch++;merge([received]);renderList();
    }
    global.addEventListener('wcs:article-comment-created',externalComment);
    async function load(append) {
      if (disposed || loading || (append && pending)) return loading;
      if (observer) { observer.disconnect(); observer = null; }
      var request = controller(), requestEpoch = mutationEpoch;
      loadButton.hidden = !!append; loadButton.disabled = true; loadButton.setAttribute('aria-busy', String(!append)); more.disabled = true; more.setAttribute('aria-busy', String(!!append)); list.setAttribute('aria-busy', 'true'); setMessage('Loading comments…');
      loading = (async function () {
        try {
          var result = await Promise.resolve().then(function () { if (disposed || request.signal.aborted) throw new Error('Read cancelled'); return adapter.load({cursor: append ? cursor : null, signal: request.signal}); });
          if (disposed) return;
          merge(result.comments, !!(!append && !pending && requestEpoch === mutationEpoch)); cursor = result.nextCursor == null ? null : result.nextCursor;
          loadButton.hidden = true; canComment = result.canComment === true; user = result.user || user;
          if (pending && pending.unknown && typeof adapter.reconcile === 'function') {
            var reconciled = await adapter.reconcile(pending, {signal: request.signal});
            if (disposed) return;
            if (reconciled && reconciled.id) { merge([reconciled]); pending = null; textarea.value = ''; reply = null; notify('success', 'Comment posted.'); }
          }
          setMessage(comments.length || pending ? '' : 'No comments yet. Start the conversation.');
          if (!canComment && !pending) setMessage('Commenting is unavailable for this account on this article.');
          if (typeof options.onLoaded === 'function') { try { options.onLoaded(result); } catch (_) { /* Host decoration cannot turn a successful read into an error. */ } }
        } catch (error) {
          if (disposed || request.signal.aborted) return;
          setMessage('Comments could not be loaded. Please try again.', true); nativeLink(); loadButton.textContent = 'Retry loading comments'; loadButton.hidden = false;
        } finally {
          finish(request); loading = null; more.removeAttribute('aria-busy'); loadButton.removeAttribute('aria-busy'); loadButton.disabled = false;
          if (!disposed) { list.removeAttribute('aria-busy'); renderList(); syncComposer(); if (pending && pending.unknown) unknownMessage(); }
        }
      })();
      if (!append && feedback && !voteState) loadFeedback();
      return loading;
    }
    function nativeLink() {
      var url = safeURL(options.nativeCommentsUrl);
      if (url) { var link = el('a', 'wcs-discussion-native-link', 'Open Confluence comments'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; message.append(doc.createTextNode(' '), link); }
    }
    function unknownMessage() {
      setMessage('Confluence may have saved your comment, but confirmation was interrupted. Check the comments before posting it again.', true);
      nativeLink();
      loadButton.textContent = 'Check comments'; loadButton.hidden = false;
    }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var text = textarea.value.trim();
      if (disposed || pending || !canComment || !text) return;
      mutationEpoch++;
      pending = {id: 'pending-' + Date.now(), text: text, author: user, createdAt: new Date().toISOString(), parentId: reply && reply.id || null, pending: true};
      var request = controller(), sending = pending;
      renderList(); syncComposer(); setMessage('Posting your comment…');
      try {
        var result = await adapter.create({text: text, parentId: sending.parentId, signal: request.signal});
        if (disposed) return;
        if (!result || !result.id) throw new Error('Missing save confirmation');
        merge([result]); pending = null; textarea.value = ''; reply = null; setMessage('Comment posted.'); notify('success', 'Comment posted.');
      } catch (error) {
        if (disposed) return;
        if (unknown(error)) { pending.unknown = true; unknownMessage(); notify('warning', 'Comment confirmation was interrupted. Check before posting again.'); }
        else {
          pending = null;
          if (error.code === 'COMMENTS_DISABLED' || error.code === 'SETTINGS_INVALID' || error.code === 'SETTINGS_UNAVAILABLE') { canComment = false; setMessage(error.code === 'COMMENTS_DISABLED' ? 'Comments are disabled for this article. Your draft is still available to copy.' : 'Comment settings could not be verified. Your draft is still available to copy.', true); }
          else if (error.code === 'FORBIDDEN' || error.status === 401 || error.status === 403) { canComment = false; setMessage('Confluence did not allow this comment. Your draft is still available to copy.', true); nativeLink(); }
          else setMessage('Your comment was not posted. Your draft is still here; you can try again.', true);
          notify('error', 'Comment was not posted. Your draft has been kept.');
        }
      } finally { finish(request); if (!disposed) { renderList(); syncComposer(); } }
    });
    textarea.addEventListener('input', syncComposer);
    function renderVote() {
      helpful.hidden = !voteState || voteState.canVote !== true;
      yes.setAttribute('aria-pressed', String(!!voteState && voteState.vote === 'yes'));
      no.setAttribute('aria-pressed', String(!!voteState && voteState.vote === 'no'));
      yes.disabled = no.disabled = voteBusy || voteUnknown;
      yes.setAttribute('aria-busy', String(voteBusy && voteState?.vote === 'yes'));
      no.setAttribute('aria-busy', String(voteBusy && voteState?.vote === 'no'));
    }
    async function loadFeedback() {
      if (!feedback || typeof feedback.load !== 'function' || disposed) return;
      var request = controller();
      try { var result = await feedback.load({signal: request.signal}); if (!disposed) { voteState = result; renderVote(); } } catch (_) { /* Feedback availability never blocks comments or reading. */ }
      finally { finish(request); }
    }
    async function saveVote(value) {
      if (disposed || voteBusy || voteUnknown || !feedback || !voteState || voteState.canVote !== true || voteState.vote === value) return;
      var before = voteState, request = controller(); voteBusy = true; voteState = Object.assign({}, before, {vote: value}); renderVote(); voteMessage.textContent = 'Saving…';
      try {
        var result = await feedback.save(value, {signal: request.signal});
        if (disposed) return;
        if (!result || result.vote !== value) throw new Error('Missing feedback confirmation');
        voteState = result; voteMessage.textContent = 'Thank you for your feedback.'; notify('success', 'Feedback saved.');
      } catch (error) {
        if (disposed) return;
        voteState = before;
        if (unknown(error)) { voteUnknown = true; voteMessage.textContent = 'Confirmation was interrupted. Check back before voting again.'; notify('warning', 'Feedback could not be confirmed.'); }
        else { voteMessage.textContent = 'Feedback was not saved. Please try again.'; notify('error', 'Feedback was not saved.'); loadFeedback(); }
      } finally { finish(request); voteBusy = false; if (!disposed) renderVote(); }
    }
    function destroy() {
      if (disposed) return;
      disposed = true; global.removeEventListener('wcs:article-comment-created',externalComment); if (observer) observer.disconnect(); controllers.forEach(function (request) { request.abort(); }); controllers.clear(); root.remove(); mounts.delete(host);
    }
    var api = Object.freeze({load: function () { return load(); }, destroy: destroy}); mounts.set(host, api);
    if (options.lazy !== false && typeof global.IntersectionObserver === 'function') {
      observer = new global.IntersectionObserver(function (entries) { if (entries.some(function (entry) { return entry.isIntersecting; })) load(); }, {rootMargin: '300px 0px'});
      observer.observe(root);
    } else if (options.lazy === false) load();
    return api;
  }
  global.WCSArticleDiscussion = Object.freeze({mount: mount});
})(window);
