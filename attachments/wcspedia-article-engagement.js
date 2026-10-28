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
  "not-helpful": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"8.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.5\" cy=\"9.5\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0\"/>"
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
  var aliases={"grid":"home","users":"review","copy":"documentation-pledging","chart":"credit-management-reporting","chevron":"right","back":"left","mine":"home","review":"emea-credit-admin","saved":"documentation-pledging","entitlements":"credit-approval-control","working":"regional-operating-manuals"};
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
    return '<span class="avatar wcs-avatar'+(person&&person.role==='Manager'?' manager':'')+(extra?' '+extra:'')+'" aria-hidden="true">'+svg('user')+'</span>';
  }
  return Object.freeze({svg:svg,node:node,avatar:avatar,has:has});
});

;
/* Source: space-storage.js */
/* Native-session storage for the configured WCSpedia space. Normal JSON reads
 * select the latest attachment by filename. A CAS content-property pending
 * reservation serializes cooperating writers; native page bodies, attachments
 * and properties are NOT one transaction. Unknown uploads are reconciled, never
 * blindly repeated. Native Confluence permissions remain authoritative.
 * REST: /content/{id}/property (version CAS), /content/{id}/child/attachment. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSSpaceStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var MAX_BYTES = 10000000, MAX_PROPERTY_BYTES = 32000;
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function integer(v, min) { return Number.isSafeInteger(v) && v >= (min == null ? 0 : min); }
  function id(v) { return typeof v === 'string' && /^[1-9]\d*$/.test(v); }
  function fail(message, code, status) { var e = new Error(message); e.code = code || 'INVALID_DATA'; if (status) e.status = status; throw e; }
  function checkAbort(signal) { if (signal && signal.aborted) { var e = new Error('The request was cancelled.'); e.name = 'AbortError'; throw e; } }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) { return Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(function (key) { return [key, canonical(value[key])]; })) : value; }
  function same(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function jsonBytes(value, limit) {
    var text;
    try { text = JSON.stringify(value); } catch (_) { fail('Use serializable JSON data.', 'INVALID_DATA'); }
    if (text === undefined) fail('Use serializable JSON data.', 'INVALID_DATA');
    var bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > limit) fail('The JSON exceeds the ' + (limit === MAX_BYTES ? '10 MB (10,000,000 byte) attachment' : '32 KB content-property') + ' limit.', 'ATTACHMENT_TOO_LARGE');
    return { text: text, bytes: bytes };
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var fetcher = dependencies.fetch || root.fetch, crypto = dependencies.crypto || root.crypto, timeoutMs = config.requestTimeoutMs == null ? 12000 : config.requestTimeoutMs;
    if (!integer(timeoutMs, 1) || timeoutMs > 60000) fail('Configure a request timeout between 1 and 60000 milliseconds.', 'CONFIGURATION');
    var writeTimeoutMs=config.writeTimeoutMs==null?60000:config.writeTimeoutMs;
    if(!integer(writeTimeoutMs,1)||writeTimeoutMs>120000)fail('Configure a write timeout between 1 and 120000 milliseconds.','CONFIGURATION');
    var origin = dependencies.origin || root.location && root.location.origin;
    var base;
    try { base = new URL(config.baseUrl || (config.contextPath || '/confluence'), origin); } catch (_) { fail('Configure a same-origin Confluence URL.', 'CONFIGURATION'); }
    var context = base.pathname.replace(/\/$/, '');
    if (!origin || base.origin !== origin || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(context || '/') || typeof fetcher !== 'function' || !crypto || !crypto.subtle || typeof crypto.getRandomValues !== 'function') fail('Use the signed-in HTTPS Confluence origin with Web Crypto and fetch.', 'CONFIGURATION');
    var spaceKey = config.spaceKey, roots = [config.rootPageId].concat(config.extraRootPageIds || []), allowed = config.allowedPageIds || [], protectedIds = config.protectedPageIds || [], storageIds = config.storagePageIds || [];
    if (typeof spaceKey !== 'string' || !spaceKey.trim() || !Array.isArray(roots) || !roots.length || roots.some(function (v) { return !id(v); }) || !Array.isArray(allowed) || !Array.isArray(protectedIds) || !Array.isArray(storageIds) || allowed.concat(protectedIds, storageIds).some(function (v) { return !id(v); }) || config.authorize != null && typeof config.authorize !== 'function') fail('Configure the exact space key, roots and permitted page IDs.', 'CONFIGURATION');
    var rootSet = new Set(roots), allowedSet = new Set(allowed), protectedSet = new Set(protectedIds), storageSet = new Set(storageIds), pendingPageReads = new Map();
    async function digest(bytes) { var hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash), function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    function token() { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    function route(path) {
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n#]/.test(path)) fail('Use a native Confluence path on this origin.', 'SCOPE');
      var full = context && path.startsWith(context + '/') ? path : context + path;
      var url = new URL(full, origin), rawPath = full.split('?')[0];
      if (url.origin !== origin || url.pathname !== rawPath || /%(?:2e|2f|5c)/i.test(rawPath) || !(url.pathname.startsWith(context + '/rest/api/') || url.pathname.startsWith(context + '/download/attachments/'))) fail('The request escaped the configured Confluence context.', 'SCOPE');
      return url;
    }
    async function bounded(response, signal, maxBytes) {
      maxBytes = maxBytes || MAX_BYTES;
      var length = response.headers && response.headers.get('content-length');
      if (length != null && /^\d+$/.test(length) && Number(length) > maxBytes) { try { await response.body.cancel(); } catch (_) {} fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE'); }
      if (response.body && typeof response.body.getReader === 'function') {
        var reader = response.body.getReader(), parts = [], size = 0;
        var cancel = function () { reader.cancel().catch(function () {}); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
          while (true) { checkAbort(signal); var part = await reader.read(); checkAbort(signal); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { try { await reader.cancel(); } catch (_) {} fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE'); } parts.push(part.value); }
        } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
        var bytes = new Uint8Array(size), offset = 0; parts.forEach(function (part) { bytes.set(part, offset); offset += part.byteLength; }); return bytes;
      }
      var fallback = new Uint8Array(await response.arrayBuffer());
      if (fallback.byteLength > maxBytes) fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE');
      return fallback;
    }
    async function transport(path, init) {
      init = init || {}; var url = route(path), method = (init.method || 'GET').toUpperCase(), mutation = !['GET', 'HEAD'].includes(method);
      checkAbort(init.signal);
      // Never reuse a pre-write scope/permission read for a later operation.
      // Entries otherwise exist only while that exact read is in flight.
      if (mutation) pendingPageReads.clear();
      var headers = new Headers(init.headers || {});
      if (['authorization', 'cookie', 'proxy-authorization'].some(function (key) { return headers.has(key); })) fail('Use the current Confluence session; do not supply credentials.', 'CONFIGURATION');
      headers.set('Accept', 'application/json'); if (mutation) headers.set('X-Requested-With', 'XMLHttpRequest');
      var response, rejection, controller = new AbortController(), timer, onAbort;
      var stopped = new Promise(function (_, reject) {
        function stop(external) {
          if (rejection) { reject(rejection); controller.abort(); return; }
          var error = new Error(mutation ? 'Confluence has not confirmed '+method+' '+url.pathname+'. Use Check save to recover this same request; do not start another document.' : external ? 'The request was cancelled.' : 'Confluence took too long to respond. Try again.');
          if (mutation) error.code = 'UNKNOWN_COMMIT'; else if (external) error.name = 'AbortError'; else error.code = 'TIMEOUT';
          reject(error); controller.abort();
        }
        timer = setTimeout(function () { stop(false); }, mutation ? writeTimeoutMs : timeoutMs);
        onAbort = function () { stop(true); };
        if (init.signal) init.signal.addEventListener('abort', onAbort, { once: true });
      });
      async function perform() {
      try { response = await fetcher(url.href, Object.assign({}, init, { headers: headers, method: method, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal })); }
      catch (error) { if (!mutation && error.name === 'AbortError') throw error; fail(mutation ? 'The native write outcome is unknown. Preserve the request ID and reload to reconcile it.' : 'Confluence could not be reached.', mutation ? 'UNKNOWN_COMMIT' : 'NETWORK'); }
      if (!response.ok) {
        var codes = { 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'ATTACHMENT_TOO_LARGE' };
        var code = codes[response.status] || (mutation && response.status >= 500 ? 'UNKNOWN_COMMIT' : 'CONFLUENCE_HTTP');
        rejection = new Error(response.status === 413 ? 'Confluence rejected this upload. Each attachment must be at most 10 MB; the host may impose a smaller limit.' : 'Confluence returned HTTP ' + response.status + ' for ' + method + ' ' + url.pathname + '.');
        rejection.code = code; rejection.status = response.status;
        // A short structured validation reason is useful; HTML proxy/login
        // pages, stack traces and full responses must not become UI content.
        if (response.status === 400 && /\bapplication\/(?:[a-z0-9.-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) {
          try {
            var problem = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await bounded(response, controller.signal, 8192)));
            var messages = [problem && problem.message].concat(problem && Array.isArray(problem.errorMessages) ? problem.errorMessages.slice(0,3) : []);
            var detail = messages.filter(function(v){return typeof v === 'string' && !/[<>]/.test(v);}).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
            if (detail) rejection.message += ' Server: ' + detail;
          } catch (_) { /* Keep the original HTTP status if diagnostics are unavailable. */ }
        } else { try { await response.body.cancel(); } catch (_) {} }
        throw rejection;
      }
      if (response.status === 204 || method === 'HEAD') return null;
      try {
        var bytes = await bounded(response, controller.signal);
        if (init.responseType === 'bytes') return bytes;
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch (error) {
        if (!mutation && (error.code || error.name === 'AbortError')) throw error;
        fail(mutation ? 'Confluence did not return a readable write confirmation. Reconcile the original request.' : 'Confluence did not return valid UTF-8 JSON.', mutation ? 'UNKNOWN_COMMIT' : 'INVALID_RESPONSE');
      }
      }
      try { return await Promise.race([perform(), stopped]); }
      finally { clearTimeout(timer); if (init.signal) init.signal.removeEventListener('abort', onAbort); }
    }
    async function page(pageId, expand, options) {
      if (object(expand)) { options = expand; expand = ''; } options = options || {};
      if (!id(pageId) || expand != null && (typeof expand !== 'string' || !/^[A-Za-z0-9.,]*$/.test(expand))) fail('Use a numeric page ID and native expansion names.', 'CONFIGURATION');
      var expansions = Array.from(new Set(['space', 'ancestors', 'operations', 'version'].concat((expand || '').split(',')).filter(Boolean))).join(',');
      checkAbort(options.signal);
      var readKey = pageId + ':' + expansions, group = pendingPageReads.get(readKey), signal = options.signal || null;
      if (!group) { group = []; pendingPageReads.set(readKey, group); }
      var entry = group.find(function (pending) { return pending.signal === signal; });
      if (!entry) {
        entry = { signal: signal, promise: transport('/rest/api/content/' + pageId + '?expand=' + encodeURIComponent(expansions), { signal: options.signal }) };
        group.push(entry);
      }
      var result;
      try { result = await entry.promise; }
      finally {
        var index = group.indexOf(entry); if (index >= 0) group.splice(index, 1);
        if (!group.length && pendingPageReads.get(readKey) === group) pendingPageReads.delete(readKey);
      }
      checkAbort(options.signal);
      if (!object(result) || String(result.id) !== pageId || result.type !== 'page' || result.status != null && result.status !== 'current' || !result.space || result.space.key !== spaceKey || !Array.isArray(result.ancestors) || result.ancestors.some(function (ancestor) { return !object(ancestor) || !id(String(ancestor.id)); })) fail('The page is not a current page in the configured WCSpedia space.', 'SCOPE');
      if (!rootSet.has(pageId) && !allowedSet.has(pageId) && !result.ancestors.some(function (ancestor) { return rootSet.has(String(ancestor.id)); })) fail('The page is outside the configured WCSpedia roots.', 'SCOPE');
      // Callers can annotate their own page without changing another reader.
      return clone(result);
    }
    function writableTarget(pageId, action) {
      if (!id(pageId)) fail('Use a numeric page ID and native expansion names.', 'CONFIGURATION');
      // A dedicated JSON host can remain protected from page body/deletion
      // operations while explicitly accepting its managed property/file pair.
      if (protectedSet.has(pageId) && !(storageSet.has(pageId) && ['json.write', 'property.write'].includes(action))) fail('This page is protected from WCSpedia storage writes.', 'FORBIDDEN');
    }
    async function writable(pageId, action, options, requireUpdate) {
      writableTarget(pageId, action);
      var nativePage = await page(pageId, '', options);
      if (requireUpdate && (!Array.isArray(nativePage.operations) || !nativePage.operations.some(function (op) { return op.operation === 'update' && op.targetType === 'page'; }))) fail('Native Confluence edit permission is required for this storage page.', 'FORBIDDEN');
      if (config.authorize && await config.authorize({ action: action, pageId: pageId, page: clone(nativePage) }) !== true) fail('The configured WCSpedia policy does not permit this write.', 'FORBIDDEN');
      return nativePage;
    }
    async function request(path, init) {
      init = init || {}; var method = (init.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) {
        if (init.body && typeof init.body.entries === 'function') {
          for (var entry of init.body.entries()) { var part = entry[1]; if (part && typeof part.arrayBuffer === 'function' && (!integer(part.size) || part.size > MAX_BYTES)) fail('Each native attachment must be at most 10 MB (10,000,000 bytes).', 'ATTACHMENT_TOO_LARGE'); }
        }
        var url = route(path), relative = url.pathname.slice(context.length), match = /^\/rest\/api\/content\/([1-9]\d*)(?:\/|$)/.exec(relative);
        if (match) {
          await writable(match[1], 'native.' + method.toLowerCase(), { signal: init.signal }, false);
          // Validate the destination too: an in-scope source page must not be
          // used to move content into another space or an unrelated subtree.
          if (method === 'PUT' && relative === '/rest/api/content/' + match[1]) {
            var update; try { update = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
            if (!object(update) || update.id != null && String(update.id) !== match[1] || update.type != null && update.type !== 'page' || update.space && update.space.key !== spaceKey) fail('Native page updates must stay in the configured WCSpedia space.', 'SCOPE');
            if (update.ancestors != null) {
              if (!Array.isArray(update.ancestors) || !update.ancestors.length || update.ancestors.some(function (ancestor) { return !object(ancestor) || !id(String(ancestor.id)); })) fail('Page moves need a verified WCSpedia parent.', 'SCOPE');
              await page(String(update.ancestors[update.ancestors.length - 1].id), '', { signal: init.signal });
            }
          }
          if (/\/move(?:\/|$)/.test(relative)) fail('Use a versioned native page update with a verified destination.', 'SCOPE');
        }
        else if (relative === '/rest/api/content' && method === 'POST') {
          var body; try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
          var parent = body && body.type === 'comment' ? body.container && String(body.container.id) : body && body.type === 'page' && body.ancestors && body.ancestors.length ? String(body.ancestors[body.ancestors.length - 1].id) : null;
          if (!id(parent) || body.type === 'page' && (!body.space || body.space.key !== spaceKey)) fail('Native content must target a verified WCSpedia parent and space.', 'SCOPE');
          await writable(parent, 'native.create-' + body.type, { signal: init.signal }, false);
        } else if (config.allowSpacePermissionSync === true && method === 'PUT' && relative.startsWith('/rest/api/space/'+encodeURIComponent(spaceKey)+'/permissions/user/') && /^\/rest\/api\/space\/[^/]+\/permissions\/user\/[^/]+\/(grant|revoke)$/.test(relative)) {
          var grants;try {grants=JSON.parse(init.body);}catch(_){}
          if(!Array.isArray(grants)||!grants.length||grants.length>5||grants.some(function(g){return !g||Object.keys(g).sort().join(',')!=='operationKey,targetType'||!['space:read','space:restrict','page:create','page:delete','attachment:create'].includes(g.targetType+':'+g.operationKey);}))fail('Only supported WCSpedia native access grants can be synchronized.','SCOPE');
        } else fail('This storage helper does not mutate unrelated Confluence resources.', 'SCOPE');
      }
      return transport(path, init);
    }
    async function user(options) { return transport('/rest/api/user/current', options || {}); }
    function keyCheck(key) { if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) fail('Use a safe content-property key.', 'CONFIGURATION'); }
    function validateProperty(value, pageId, key) {
      if (!object(value) || value.key !== key || !id(String(value.id)) || !object(value.version) || !integer(value.version.number, 1) || !Object.prototype.hasOwnProperty.call(value, 'value') || value.content && String(value.content.id) !== pageId) fail('Confluence returned an invalid content property.', 'INVALID_RESPONSE');
      return value;
    }
    async function getProperty(pageId, key, options) {
      try { return validateProperty(await transport('/rest/api/content/' + pageId + '/property/' + encodeURIComponent(key) + '?expand=version', options || {}), pageId, key); }
      catch (error) { if (error.status === 404) return null; throw error; }
    }
    async function findProperty(pageId, key, options) {
      // A missing JSON pointer is normal on first installation. The collection
      // returns an empty result without the misleading /property/{key} 404.
      // Do not treat an unavailable collection/API as an absent property.
      var start = 0, seen = new Set();
      while (start < 1000) {
        var result = await transport('/rest/api/content/' + pageId + '/property?expand=version&limit=100&start=' + start, options || {});
        if (!object(result) || !Array.isArray(result.results) || result.results.length > 100) fail('Confluence did not return a valid metadata collection.', 'INVALID_RESPONSE');
        var found = null;
        result.results.forEach(function (item) {
          if (!object(item) || typeof item.key !== 'string' || seen.has(item.key)) fail('Confluence metadata pagination repeated or returned an invalid key.', 'INVALID_RESPONSE');
          seen.add(item.key);
          if (item.key === key) found = validateProperty(item, pageId, key);
        });
        if (found) return found;
        if (!(result._links && result._links.next)) return null;
        if (!result.results.length) fail('Confluence metadata pagination did not advance.', 'INVALID_RESPONSE');
        start += result.results.length;
      }
      fail('The metadata lookup exceeded its safe page limit.', 'PROPERTY_LIMIT');
    }
    async function property(pageId, key, options) { keyCheck(key); await page(pageId, '', options); return options && options.optional === true ? findProperty(pageId, key, { signal: options.signal }) : getProperty(pageId, key, options); }
    async function putProperty(pageId, key, value, expectedVersion, options) {
      options = options || {}; keyCheck(key); var encoded = jsonBytes(value, MAX_PROPERTY_BYTES);
      if (expectedVersion !== null && !integer(expectedVersion, 1)) fail('Use null to create a property or its current CAS version to update it.', 'CONFIGURATION');
      writableTarget(pageId, 'property.write');
      // Both checks are fresh reads. Overlap their network latency; the CAS
      // mutation still waits for native permission and the expected revision.
      var checks = await Promise.all([writable(pageId, 'property.write', options, true), getProperty(pageId, key, options)]);
      var previous = checks[1], nextVersion = expectedVersion === null ? 1 : expectedVersion + 1;
      if ((previous ? previous.version.number : null) !== expectedVersion) fail('The content property changed. Reload before writing.', 'CONFLICT');
      var payload = { key: key, value: JSON.parse(encoded.text), version: { number: nextVersion } };
      if (previous) payload.id = previous.id;
      try {
        var result = validateProperty(await transport('/rest/api/content/' + pageId + '/property' + (previous ? '/' + encodeURIComponent(key) : ''), { method: previous ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: options.signal }), pageId, key);
        if (result.version.number !== nextVersion || !same(result.value, payload.value) || previous && result.id !== previous.id) fail('The property write was not confirmed.', 'UNKNOWN_COMMIT');
        return result;
      } catch (error) {
        if (error.code !== 'UNKNOWN_COMMIT' && error.code !== 'CONFLICT') throw error;
        // A lost CAS reply may be confirmed, but no PUT/POST is repeated.
        var found; try { found = await getProperty(pageId, key, {}); } catch (_) { throw error; }
        if (found && found.version.number === nextVersion && same(found.value, payload.value) && (!previous || found.id === previous.id)) return found;
        throw error;
      }
    }
    function fileCheck(filename) { if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,155}\.json$/.test(filename)) fail('Use a safe JSON attachment filename.', 'CONFIGURATION'); }
    async function metadata(pageId, filename, options) {
      var result = await transport('/rest/api/content/' + pageId + '/child/attachment?filename=' + encodeURIComponent(filename) + '&expand=version,container&limit=2', options || {});
      if (!object(result) || !Array.isArray(result.results) || result.results.length > 1 || result._links && result._links.next) fail('The JSON attachment name is missing or ambiguous.', 'INVALID_ATTACHMENT');
      if (!result.results.length) return null;
      var item = result.results[0];
      if (!object(item) || !id(String(item.id)) || item.type !== 'attachment' || item.title !== filename || !item.version || !integer(item.version.number, 1) || !item.container || String(item.container.id) !== pageId || item.container.type !== 'page') fail('The attachment identity, filename or parent did not match.', 'INVALID_ATTACHMENT');
      return { id: String(item.id), version: item.version.number };
    }
    async function bytesAt(pageId, filename, version, options) { return transport('/download/attachments/' + pageId + '/' + encodeURIComponent(filename) + '?api=v2' + (version == null ? '' : '&version=' + version), Object.assign({}, options, { responseType: 'bytes' })); }
    function attachmentCheck(value) { return object(value) && id(value.id) && integer(value.version, 1) && /^[a-f0-9]{64}$/.test(value.sha256) && integer(value.bytes) && value.bytes <= MAX_BYTES; }
    function validatePointer(value, pageId, filename) {
      if (!object(value) || Object.keys(value).some(function (name) { return !['schemaVersion', 'pageId', 'filename', 'attachment', 'lastWrite', 'pending'].includes(name); }) || value.schemaVersion !== 1 || value.pageId !== pageId || value.filename !== filename || value.attachment !== null && !attachmentCheck(value.attachment) || value.lastWrite !== null && !object(value.lastWrite) || value.pending !== null && !object(value.pending)) fail('The JSON pointer does not match this page and attachment.', 'INVALID_POINTER');
      if (value.pending) {
        var p = value.pending;
        if (typeof p.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(p.requestId) || !/^[a-f0-9]{64}$/.test(p.sha256) || !integer(p.bytes) || p.bytes > MAX_BYTES || !integer(p.expectedRevision) || !integer(p.expectedAttachmentVersion) || !integer(p.nativeVersion) || p.attachmentId !== null && !id(p.attachmentId) || typeof p.actor !== 'string' || !p.actor || !/^[a-f0-9]{32}$/.test(p.token)) fail('The pending JSON write is invalid.', 'INVALID_POINTER');
        if (p.expectedAttachmentVersion !== (value.attachment ? value.attachment.version : 0) || p.nativeVersion !== p.expectedAttachmentVersion || p.attachmentId !== (value.attachment ? value.attachment.id : null)) fail('The pending JSON baseline is inconsistent.', 'INVALID_POINTER');
      }
      if (value.lastWrite && (typeof value.lastWrite.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(value.lastWrite.sha256) || !integer(value.lastWrite.expectedRevision) || !integer(value.lastWrite.expectedAttachmentVersion) || typeof value.lastWrite.actor !== 'string')) fail('The JSON commit receipt is invalid.', 'INVALID_POINTER');
      return value;
    }
    async function snapshot(pageId, filename, key, options) {
      var reads = await Promise.all([findProperty(pageId, key, options), metadata(pageId, filename, options)]);
      var prop = reads[0], pointer = prop ? validatePointer(prop.value, pageId, filename) : null, native = reads[1];
      // A pending managed upload is not yet authoritative. Retain its known
      // baseline for the original-request reconciliation protocol only.
      var pending = pointer && pointer.pending, selected = pending ? pointer.attachment : native;
      if (pointer && pointer.attachment && !native) fail('The JSON attachment ' + filename + ' is missing on page ' + pageId + '. Restore or upload it before continuing.', 'ATTACHMENT_NOT_FOUND');
      if (pending && selected && (native.id !== selected.id || native.version < selected.version)) fail('The attachment changed during an unfinished save. Reconcile the original request before continuing.', 'CONFLICT');
      var bytes = selected ? await bytesAt(pageId, filename, pending ? selected.version : null, options) : null, hash = bytes ? await digest(bytes) : null, data = null;
      var committed = pointer && pointer.attachment;
      if (bytes) { try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (_) { fail('The attachment must contain valid UTF-8 JSON.', 'INVALID_JSON'); } }
      var verified = await Promise.all([prop ? getProperty(pageId, key, options) : findProperty(pageId, key, options), metadata(pageId, filename, options)]);
      var fresh = verified[0];
      if ((fresh ? fresh.version.number : 0) !== (prop ? prop.version.number : 0) || fresh && (fresh.id !== prop.id || !same(fresh.value, prop.value))) fail('The JSON pointer changed while loading. Reload it.', 'CONFLICT');
      if (!same(verified[1], native)) fail('The live JSON attachment changed while loading.', 'CONFLICT');
      if (committed && selected && committed.id === selected.id && committed.version === selected.version && (hash !== committed.sha256 || bytes.byteLength !== committed.bytes)) fail('The JSON failed its SHA-256 check for the same native attachment revision.', 'INTEGRITY');
      return { data: data, revision: prop ? prop.version.number : 0, attachmentId: selected ? selected.id : null, attachmentVersion: selected ? selected.version : 0, pointer: pointer, propertyId: prop ? prop.id : null, native: native, baseline: selected ? { id: selected.id, version: selected.version, sha256: hash, bytes: bytes.byteLength } : null };
    }
    function fingerprint(result) { return result.baseline ? result.baseline.id + ':' + result.baseline.version + ':' + result.baseline.sha256 : null; }
    function exposed(result) { return { data: result.data, revision: result.revision, attachmentId: result.attachmentId, attachmentVersion: result.attachmentVersion, fingerprint:fingerprint(result), pointer: result.pointer }; }
    async function readJSON(pageId, filename, pointerKey, options) { fileCheck(filename); keyCheck(pointerKey); await page(pageId, '', options); return exposed(await snapshot(pageId, filename, pointerKey, options || {})); }
    // Optional administrative inspection. Ordinary manual replacements no
    // longer need pointer repair before they can be read.
    async function inspectJSON(pageId, filename, pointerKey, options) {
      options = options || {}; fileCheck(filename); keyCheck(pointerKey);
      var nativePage = await page(pageId, '', options);
      var pair = await Promise.all([findProperty(pageId, pointerKey, options), metadata(pageId, filename, options)]);
      var prop = pair[0], candidate = pair[1], pointer = prop ? validatePointer(prop.value, pageId, filename) : null;
      if (pointer && pointer.pending) fail('A JSON save is pending. Recover its original request before adopting another attachment.', 'WRITE_PENDING');
      if (!candidate) fail('Upload or restore ' + filename + ' on page ' + pageId + ' before reviewing recovery.', 'ATTACHMENT_NOT_FOUND');
      var bytes = await bytesAt(pageId, filename, candidate.version, options), hash = await digest(bytes), data;
      try { data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
      catch (_) { fail(filename + ' must contain valid UTF-8 JSON.', 'INVALID_JSON'); }
      var after = await Promise.all([findProperty(pageId, pointerKey, options), metadata(pageId, filename, options)]);
      if (!same(after[0], prop) || !same(after[1], candidate)) fail('The JSON changed during recovery preview. Inspect it again.', 'CONFLICT');
      return {pageId:pageId, filename:filename, key:pointerKey, property:prop, candidate:{id:candidate.id,version:candidate.version,sha256:hash,bytes:bytes.byteLength}, data:data,
        canRepair:Array.isArray(nativePage.operations) && nativePage.operations.some(function(op){return op.operation==='update'&&op.targetType==='page';})};
    }
    async function reconcileJSON(preview, options) {
      options = options || {};
      if (!object(preview) || !object(preview.candidate)) fail('Inspect the attachment before recovery.', 'CONFIGURATION');
      var pageId = preview.pageId, filename = preview.filename, pointerKey = preview.key;
      fileCheck(filename); keyCheck(pointerKey);
      await writable(pageId, 'json.write', options, true);
      var current = await inspectJSON(pageId, filename, pointerKey, options);
      if (!same(current.property, preview.property) || !same(current.candidate, preview.candidate)) fail('The attachment or its saved reference changed. Inspect it again before recovery.', 'CONFLICT');
      var who = await user(options), actor = who && who.type === 'known' && (who.userKey ? 'key:' + who.userKey : who.accountId ? 'account:' + who.accountId : who.username ? 'user:' + who.username.toUpperCase() : null);
      if (!actor) fail('A signed-in native Confluence account is required.', 'AUTH_REQUIRED');
      var requestId = options.requestId;
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId)) fail('Provide a recovery request ID.', 'CONFIGURATION');
      var next = {schemaVersion:1,pageId:pageId,filename:filename,attachment:current.candidate,pending:null,
        lastWrite:{requestId:requestId,sha256:current.candidate.sha256,actor:actor,
          expectedRevision:current.property ? current.property.version.number : 0,expectedAttachmentVersion:current.candidate.version}};
      // CAS protects cooperating writers. The caller's recovery backup includes
      // the old reference. No attachment upload or policy/history edit occurs.
      await putProperty(pageId, pointerKey, next, current.property ? current.property.version.number : null, options);
      var result = await snapshot(pageId, filename, pointerKey, options);
      if (!result.pointer || !same(result.pointer, next)) fail('Recovery changed before confirmation. Inspect again; do not repeat the write automatically.', 'CONFLICT');
      return exposed(result);
    }
    async function writeJSON(pageId, filename, pointerKey, data, options) {
      options = options || {}; fileCheck(filename); keyCheck(pointerKey);
      var encoded = jsonBytes(data, MAX_BYTES), hash = await digest(encoded.bytes), requestId = options.requestId;
      if (!integer(options.expectedRevision) || !integer(options.expectedAttachmentVersion) || typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId)) fail('Provide the original request ID and expected JSON/native revisions.', 'CONFIGURATION');
      writableTarget(pageId, 'json.write');
      // These independent reads must all succeed before reserving or uploading.
      // No account, permission or JSON revision is reused from an earlier save.
      var checks = await Promise.all([writable(pageId, 'json.write', options, true), user({ signal: options.signal }), snapshot(pageId, filename, pointerKey, options)]);
      var currentUser = checks[1], actor = currentUser && currentUser.type === 'known' && (currentUser.userKey ? 'key:' + currentUser.userKey : currentUser.accountId ? 'account:' + currentUser.accountId : currentUser.username ? 'user:' + currentUser.username.toUpperCase() : null);
      if (!actor) fail('A signed-in native Confluence account is required.', 'AUTH_REQUIRED');
      var before = checks[2], pointer = before.pointer;
      function matches(receipt) { return receipt && receipt.requestId === requestId && receipt.sha256 === hash && receipt.actor === actor && receipt.expectedRevision === options.expectedRevision && receipt.expectedAttachmentVersion === options.expectedAttachmentVersion; }
      if (pointer && pointer.lastWrite && pointer.lastWrite.requestId === requestId) {
        if (!matches(pointer.lastWrite) || !same(before.baseline, pointer.attachment)) fail('This request ID was already used or its attachment has since changed. Reload the latest JSON.', 'CONFLICT');
        return exposed(before);
      }
      var pending = pointer && pointer.pending, reservation, ownsUpload = false;
      if (pending) { if (!matches(pending)) fail('An earlier JSON write requires reconciliation using its original request ID.', 'WRITE_PENDING'); reservation = { id: before.propertyId, version: { number: before.revision }, value: pointer }; }
      else {
        if (before.revision !== options.expectedRevision || before.attachmentVersion !== options.expectedAttachmentVersion) fail('The JSON changed. Reload before saving.', 'CONFLICT');
        if (options.expectedFingerprint !== undefined) {
          if (options.expectedFingerprint !== fingerprint(before)) fail('The JSON file was replaced or changed. Reload before saving.', 'CONFLICT');
        } else if (pointer && !same(pointer.attachment, before.baseline)) {
          fail('Reload the latest attachment with its fingerprint before saving a manual replacement.', 'CONFLICT');
        }
        pending = { requestId: requestId, sha256: hash, bytes: encoded.bytes.byteLength, actor: actor, expectedRevision: options.expectedRevision, expectedAttachmentVersion: options.expectedAttachmentVersion, nativeVersion: before.native ? before.native.version : 0, attachmentId: before.native ? before.native.id : null, token: token() };
        pointer = { schemaVersion: 1, pageId: pageId, filename: filename, attachment: before.baseline, lastWrite: pointer ? pointer.lastWrite : null, pending: pending };
        reservation = await putProperty(pageId, pointerKey, pointer, before.revision || null, options); ownsUpload = true;
      }
      if (ownsUpload) {
        // Recheck the existing native file after winning the property CAS. A
        // native/manual upload is not allowed to become an unnoticed baseline.
        var preUpload = await metadata(pageId, filename, options);
        if ((preUpload ? preUpload.id : null) !== pending.attachmentId || (preUpload ? preUpload.version : 0) !== pending.nativeVersion) fail('The native attachment changed before upload. Reconcile the reserved write.', 'CONFLICT');
        var Form = dependencies.FormData || root.FormData, BlobType = dependencies.Blob || root.Blob;
        if (!Form || !BlobType) fail('This browser cannot upload native attachments.', 'CONFIGURATION');
        var form = new Form(); form.append('file', new BlobType([encoded.bytes], { type: 'application/json' }), filename); form.append('comment', 'WCSpedia JSON ' + requestId + '; SHA-256 ' + hash); form.append('minorEdit', 'false');
        try {
          await transport('/rest/api/content/' + pageId + '/child/attachment' + (pending.attachmentId ? '/' + pending.attachmentId + '/data' : ''), { method: 'POST', headers: { 'X-Atlassian-Token': 'nocheck' }, body: form, signal: options.signal });
        } catch (error) {
          if (error.code !== 'UNKNOWN_COMMIT') {
            // Definite rejections may release this reservation, but never erase
            // another writer's property version or a committed native upload.
            if ([400, 401, 403, 404, 413].includes(error.status)) { try { await putProperty(pageId, pointerKey, Object.assign({}, pointer, { pending: null }), reservation.version.number, {}); } catch (_) {} }
            throw error;
          }
          // Continue with read-only reconciliation of the exact expected bytes.
        }
      }
      var uploaded = await metadata(pageId, filename, {});
      if (!uploaded || uploaded.version === pending.nativeVersion && uploaded.id === pending.attachmentId) fail('The attachment upload is not confirmed yet. Retry only this original request ID to reconcile it; no duplicate upload was sent.', 'UNKNOWN_COMMIT');
      if (uploaded.version !== pending.nativeVersion + 1 || pending.attachmentId && uploaded.id !== pending.attachmentId) fail('The native attachment diverged from this reserved write. Inspect its version history.', 'CONFLICT');
      var confirmedBytes = await bytesAt(pageId, filename, uploaded.version, {});
      if (confirmedBytes.byteLength !== pending.bytes || await digest(confirmedBytes) !== hash) fail('The uploaded attachment does not match this request. No JSON pointer was committed.', 'INTEGRITY');
      var committed = { schemaVersion: 1, pageId: pageId, filename: filename, attachment: { id: uploaded.id, version: uploaded.version, sha256: hash, bytes: confirmedBytes.byteLength }, lastWrite: { requestId: requestId, sha256: hash, actor: actor, expectedRevision: options.expectedRevision, expectedAttachmentVersion: options.expectedAttachmentVersion }, pending: null };
      try { await putProperty(pageId, pointerKey, committed, reservation.version.number, {}); }
      catch (error) {
        if (error.code !== 'CONFLICT' && error.code !== 'UNKNOWN_COMMIT') throw error;
        var found = await getProperty(pageId, pointerKey, {});
        if (!found || !same(found.value, committed)) throw error;
      }
      // The exact uploaded version was downloaded and SHA-256 checked above.
      // Reuse those bytes only within this write; confirm its live pointer and
      // native revision instead of downloading the same attachment again.
      var finalReads = await Promise.all([getProperty(pageId, pointerKey, {}), metadata(pageId, filename, {})]);
      var finalProperty = finalReads[0];
      if (!finalProperty || finalProperty.version.number !== reservation.version.number + 1 || !same(finalProperty.value, committed) || !same(finalReads[1], uploaded)) fail('Another JSON change committed before this confirmation was read. Reload the current state.', 'CONFLICT');
      return exposed({ data: JSON.parse(encoded.text), revision: finalProperty.version.number, attachmentId: uploaded.id, attachmentVersion: uploaded.version, pointer: committed, baseline: committed.attachment });
    }
    return Object.freeze({ request: request, page: page, user: user, property: property, putProperty: putProperty, readJSON: readJSON, writeJSON: writeJSON, inspectJSON:inspectJSON, reconcileJSON:reconcileJSON, maxBytes: MAX_BYTES });
  }
  return Object.freeze({ create: create, MAX_BYTES: MAX_BYTES, MAX_PROPERTY_BYTES: MAX_PROPERTY_BYTES });
});

;
/* Source: space-engagement.js */
/* Space-only helpfulness and recorded views. Native Confluence update permission
 * is required for JSON property writes. These cooperative measurements are not
 * full server analytics or tamper-proof ballots. Article loading reads two known
 * properties; only an explicit analytics export enumerates votes. */
(function (root, factory) {
  'use strict';
  var api = factory(root, typeof module === 'object' && module.exports ? require('./space-storage.js') : root.WCSSpaceStorage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSSpaceEngagement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Storage) {
  'use strict';
  var VOTE_PREFIX = 'wcspedia-helpfulness-v1-', VIEW_KEY = 'wcspedia-recorded-views-v1';
  var WINDOW_MS = 30 * 60 * 1000, MAX_ACTIVE = 180, MAX_BYTES = 32000, PAGE_SIZE = 50;
  var COVERAGE = Object.freeze({ scope: 'wcspedia-published-articles', actors: 'signed-in-users-with-native-page-update', viewDefinition: 'one-successfully-recorded-visit-per-account-per-30-minutes', completeConfluenceTraffic: false, ballotOwnership: 'cooperative-native-editors-can-edit-properties', consistency: 'non-atomic-export', activeViewCapacity: MAX_ACTIVE });
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function integer(v, min) { return Number.isSafeInteger(v) && v >= (min == null ? 0 : min); }
  function id(v) { return typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v); }
  function fail(code, message) { var e = new Error(message); e.code = code; e.outcome = code === 'UNKNOWN_COMMIT' ? 'unknown' : 'rejected'; throw e; }
  function abort(signal) { if (signal && signal.aborted) { var e = new Error('Engagement request cancelled.'); e.name = 'AbortError'; throw e; } }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function size(v) { if (new TextEncoder().encode(JSON.stringify(v)).byteLength > MAX_BYTES) fail('CAPACITY', 'The document engagement JSON exceeds its 32 KB property limit.'); }
  function requestId(v) { return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v); }
  function timestamp(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
  function validateProperty(prop, pageId, key) {
    if (!object(prop) || prop.key !== key || !id(String(prop.id)) || !object(prop.version) || !integer(prop.version.number, 1) || !object(prop.value) || prop.content && String(prop.content.id) !== pageId) fail('INVALID_DATA', 'Confluence returned malformed engagement metadata.');
    size(prop.value); return prop;
  }
  function voteData(prop, pageId, key) {
    if (!prop) return null;
    var v = validateProperty(prop, pageId, key).value;
    if (v.schemaVersion !== 1 || v.pageId !== pageId || !['yes', 'no'].includes(v.value) || !integer(v.pageVersion, 1) || !timestamp(v.updatedAt) || !requestId(v.requestId)) fail('INVALID_DATA', 'The saved helpfulness JSON is invalid.');
    return v;
  }
  function viewData(prop, pageId) {
    if (!prop) return { schemaVersion: 1, pageId: pageId, count: 0, lastRecordedAt: null, active: {} };
    var v = validateProperty(prop, pageId, VIEW_KEY).value;
    if (v.schemaVersion !== 1 || v.pageId !== pageId || !integer(v.count) || !object(v.active) || Object.keys(v.active).length > MAX_ACTIVE || v.count < Object.keys(v.active).length || (v.count === 0 ? v.lastRecordedAt !== null : !timestamp(v.lastRecordedAt))) fail('INVALID_DATA', 'The saved recorded-view JSON is invalid.');
    Object.keys(v.active).forEach(function (key) { var e = v.active[key]; if (!/^[a-f0-9]{64}$/.test(key) || !object(e) || !integer(e.at) || !/^wcsview-\d{1,16}-[a-f0-9]{32}$/.test(e.requestId || '') || Number(e.requestId.split('-')[1]) !== e.at) fail('INVALID_DATA', 'The saved recorded-view deduplication JSON is invalid.'); });
    return v;
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var publication = object(config.nativePublication) ? config.nativePublication : config;
    var rootId = config.rootPageId || config.pageIds && config.pageIds.home, space = config.spaceKey;
    var parents = Object.values(publication.areaPageIds || config.areaPageIds || {});
    var insights = config.insightsPageId || publication.insightsPageId; if (insights) parents.push(insights);
    if (!id(rootId) || typeof space !== 'string' || !space.trim() || space !== space.trim() || !parents.length || parents.length > 50 || parents.some(function (v) { return !id(v) || v === rootId; }) || new Set(parents).size !== parents.length) fail('CONFIGURATION', 'Configure the exact WCSpedia root, space and article parent page IDs.');
    var excluded = new Set([rootId].concat(parents)), excludedTrees = new Set();
    function exclude(v, tree) { if (v == null || v === '') return; if (!id(v)) fail('CONFIGURATION', 'Use numeric excluded page IDs.'); excluded.add(v); if (tree) excludedTrees.add(v); }
    exclude(config.attachmentPageId); Object.values(config.pageIds || {}).forEach(function (v) { exclude(v); });
    exclude(publication.workingRootPageId || config.workingRootPageId, true);
    var search = config.search || {};
    ['excludePageIds', 'excludeAncestorIds'].forEach(function (key) { if (search[key] != null && (!Array.isArray(search[key]) || search[key].length > 100)) fail('CONFIGURATION', 'Invalid engagement page exclusions.'); (search[key] || []).forEach(function (v) { exclude(v, key === 'excludeAncestorIds'); }); });
    if (excludedTrees.has(rootId) || parents.some(function (v) { return excludedTrees.has(v); })) fail('CONFIGURATION', 'Working pages must be separate from published article parents.');
    var store = dependencies.storage || Storage && Storage.create(Object.assign({}, config, { rootPageId: rootId, spaceKey: space, extraRootPageIds: [], allowedPageIds: [], protectedPageIds: Array.from(excluded), authorize: function (write) { verifyPage(write.page, write.pageId); return true; } }), dependencies);
    if (!store || typeof store.page !== 'function' || typeof store.request !== 'function') fail('CONFIGURATION', 'Native Confluence storage is required.');
    var crypto = dependencies.crypto || root.crypto, now = dependencies.now || Date.now, pendingViews = new Map(), pendingVotes = new Map();
    var maxProperties = config.maxEngagementProperties == null ? 100000 : config.maxEngagementProperties;
    if (!integer(maxProperties, 1) || maxProperties > 100000) fail('CONFIGURATION', 'Invalid engagement property export limit.');
    function clock() { var n = now(); if (!integer(n)) fail('INVALID_DATA', 'The browser clock is invalid.'); return n; }
    function verifyPage(p, pageId) {
      var ancestors = p && p.ancestors;
      if (!object(p) || String(p.id) !== pageId || p.type !== 'page' || p.status !== 'current' || !p.space || p.space.key !== space || !Array.isArray(ancestors) || ancestors.some(function (a) { return !object(a) || !id(String(a.id)); }) || !p.version || !integer(p.version.number, 1)) fail('OUT_OF_SCOPE', 'Engagement requires a current WCSpedia article.');
      var ids = ancestors.map(function (a) { return String(a.id); }), rootIndex = ids.indexOf(rootId);
      if (excluded.has(pageId) || rootIndex < 0 || ids.some(function (v) { return excludedTrees.has(v); }) || !parents.some(function (v) { return ids.indexOf(v) > rootIndex; })) fail('OUT_OF_SCOPE', 'Engagement is limited to published business-area and Insights child articles.');
      return p;
    }
    async function page(pageId, options) {
      if (!id(pageId)) fail('CONFIGURATION', 'Use a numeric document page ID.');
      abort(options && options.signal);
      return verifyPage(await store.page(pageId, '', options || {}), pageId);
    }
    async function identity(pageId, options) {
      if (!crypto || !crypto.subtle || !crypto.getRandomValues || typeof store.user !== 'function') fail('CONFIGURATION', 'Signed-in native identity and Web Crypto are required.');
      var u = await store.user(options || {}), actor = u && u.type === 'known' && (u.userKey ? 'key:' + u.userKey : u.accountId ? 'account:' + u.accountId : u.username ? 'user:' + u.username.toUpperCase() : null);
      if (!actor) return null;
      var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(space + ':' + rootId + ':' + pageId + ':' + actor));
      return Array.from(new Uint8Array(digest), function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    }
    function canUpdate(p) { return Array.isArray(p.operations) && p.operations.some(function (v) { return v.operation === 'update' && v.targetType === 'page'; }); }
    async function property(pageId, key, options) {
      try { return validateProperty(await store.request('/rest/api/content/' + pageId + '/property/' + key + '?expand=version', options || {}), pageId, key); }
      catch (error) { if (error.status === 404 || error.code === 'NOT_FOUND') return null; throw error; }
    }
    function result(p, actor, prop, views) {
      var v = actor ? voteData(prop, String(p.id), VOTE_PREFIX + actor) : null, allowed = !!actor && canUpdate(p);
      return { schemaVersion: 1, rootPageId: rootId, pageId: String(p.id), pageVersion: p.version.number, canVote: allowed, canRecord: allowed, reason: !actor ? 'Sign in to record helpfulness and views.' : allowed ? '' : 'Native Confluence page edit permission is required to record helpfulness and views.', myVote: { value: v ? v.value : null, revision: prop ? prop.version.number : 0, pageVersion: v ? v.pageVersion : null }, totals: null, views: { source: 'confluence-content-properties', status: 'available', recordedViews: views.count, windowMinutes: 30, lastRecordedAt: views.lastRecordedAt }, coverage: clone(COVERAGE) };
    }
    async function loadViews(pageId, options) {
      options = options || {};
      await page(pageId, options); // Same scope and access verification as the reader.
      var views = viewData(await property(pageId, VIEW_KEY, options), pageId);
      return {pageId:String(pageId),views:{recordedViews:views.count}};
    }
    async function load(pageId, options) {
      options = options || {};
      var pair = await Promise.all([page(pageId, options), identity(pageId, options)]), p = pair[0], actor = pair[1];
      var props = await Promise.all([actor ? property(pageId, VOTE_PREFIX + actor, options) : null, property(pageId, VIEW_KEY, options)]);
      var snapshot = result(p, actor, props[0], viewData(props[1], pageId)), pendingKey = pageId + ':' + actor, pending = actor && pendingVotes.get(pendingKey);
      if (pending && props[0] && ((props[0].value.requestId === pending.requestId && props[0].value.value === pending.value) || integer(pending.expected) && props[0].version.number > pending.expected)) pendingVotes.delete(pendingKey);
      pending = actor && pendingVotes.get(pendingKey);
      // An absent or unchanged property does not prove an in-flight write failed.
      // Keep its immutable command available for an explicit, idempotent retry.
      snapshot.pendingVote = pending ? { value: pending.value, requestId: pending.requestId, expectedVoteRevision: pending.expected, pageVersion: pending.pageVersion } : null;
      return snapshot;
    }
    function random() { if (!crypto || typeof crypto.getRandomValues !== 'function') fail('CONFIGURATION', 'Secure request identifiers are unavailable.'); return Array.from(crypto.getRandomValues(new Uint8Array(16)), function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    async function writable(pageId, options) {
      var pair = await Promise.all([page(pageId, options), identity(pageId, options)]);
      if (!pair[1]) fail('AUTH_REQUIRED', 'Sign in to record helpfulness and views.');
      if (!canUpdate(pair[0])) fail('FORBIDDEN', 'Native Confluence page edit permission is required to record helpfulness and views.');
      if (typeof store.putProperty !== 'function') fail('CONFIGURATION', 'Native engagement writes are unavailable.');
      return pair;
    }
    async function vote(pageId, value, options) {
      options = options || {}; if (!['yes', 'no'].includes(value)) fail('INVALID_DATA', 'Choose a helpful or unhelpful vote.');
      var pair = await writable(pageId, options), p = pair[0], actor = pair[1], key = VOTE_PREFIX + actor;
      var pendingKey = pageId + ':' + actor, command = pendingVotes.get(pendingKey), wasPending = !!command;
      if (command && command.value !== value) fail('UNKNOWN_COMMIT', 'Reconcile the previous helpfulness vote before changing your choice.');
      if (!command && options.pageVersion != null && options.pageVersion !== p.version.number) fail('CONFLICT', 'The article changed since helpfulness was loaded. Reload before voting.');
      if (!command) { command = { requestId: options.requestId || 'wcsvote-' + random(), value: value, pageVersion: p.version.number, expected: options.expectedVoteRevision }; if (!requestId(command.requestId)) fail('CONFIGURATION', 'Use a valid helpfulness request ID.'); pendingVotes.set(pendingKey, command); }
      var before, data, saved;
      try { before = await property(pageId, key, options); data = voteData(before, pageId, key); }
      catch (error) { if (!wasPending) pendingVotes.delete(pendingKey); throw error; }
      if (data && data.requestId === command.requestId) {
        if (data.value !== command.value) { pendingVotes.delete(pendingKey); fail('CONFLICT', 'This request ID was used for another vote.'); } saved = before;
      } else {
        if (command.expected == null) command.expected = before ? before.version.number : 0;
        if (!integer(command.expected) || command.expected !== (before ? before.version.number : 0)) { pendingVotes.delete(pendingKey); fail('CONFLICT', 'Your helpfulness vote changed in another tab. Reload before voting.'); }
        var next = { schemaVersion: 1, pageId: pageId, value: value, pageVersion: command.pageVersion, updatedAt: new Date(clock()).toISOString(), requestId: command.requestId };
        try { saved = await store.putProperty(pageId, key, next, before ? before.version.number : null, options); voteData(saved, pageId, key); }
        catch (error) {
          if (error.code !== 'UNKNOWN_COMMIT') { pendingVotes.delete(pendingKey); throw error; }
          try { saved = await property(pageId, key, {}); var receipt = voteData(saved, pageId, key); if (!receipt || receipt.requestId !== command.requestId || receipt.value !== value) throw error; }
          catch (_) { throw error; }
        }
      }
      pendingVotes.delete(pendingKey);
      return { accepted: true, requestId: command.requestId, pageId: pageId, pageVersion: p.version.number, canVote: true, myVote: { value: value, revision: saved.version.number, pageVersion: saved.value.pageVersion }, totals: null, coverage: clone(COVERAGE) };
    }
    async function recordView(pageId, options) {
      options = options || {}; var pair = await writable(pageId, options), actor = pair[1], pendingKey = pageId + ':' + actor;
      var command = pendingViews.get(pendingKey), nowMs = clock();
      if (!command) {
        var rid = options.requestId || 'wcsview-' + nowMs + '-' + random(), match = /^wcsview-(\d{1,16})-([a-f0-9]{32})$/.exec(rid);
        if (!match) fail('CONFIGURATION', 'Use the original timestamped WCSpedia view request ID.');
        command = { requestId: rid, at: Number(match[1]) }; pendingViews.set(pendingKey, command);
      }
      if (command.at > nowMs + 60000 || nowMs - command.at >= WINDOW_MS) { pendingViews.delete(pendingKey); fail('EXPIRED', 'This view request expired; it was not counted again. Reload to record a new visit.'); }
      for (var attempt = 0; attempt < 5; attempt++) {
        nowMs = clock();
        if (nowMs - command.at >= WINDOW_MS) { pendingViews.delete(pendingKey); fail('EXPIRED', 'This view request expired; it was not counted again.'); }
        abort(options.signal); var before = await property(pageId, VIEW_KEY, options), data = viewData(before, pageId), mine = data.active[actor];
        if (mine && mine.at > command.at - WINDOW_MS) { pendingViews.delete(pendingKey); return { recorded: mine.requestId === command.requestId, deduplicated: mine.requestId !== command.requestId, requestId: command.requestId, views: data.count, counted: mine.requestId === command.requestId, recordedViews: data.count, lastRecordedAt: data.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) }; }
        var next = clone(data); Object.keys(next.active).forEach(function (key) { if (next.active[key].at <= nowMs - WINDOW_MS) delete next.active[key]; });
        if (Object.keys(next.active).length >= MAX_ACTIVE && !next.active[actor]) { pendingViews.delete(pendingKey); fail('CAPACITY', 'This document reached its active recorded-view limit. This visit was not counted; try again after 30 minutes.'); }
        if (!integer(data.count + 1)) fail('CAPACITY', 'The recorded-view counter reached its safe limit.');
        next.count++; next.active[actor] = { at: command.at, requestId: command.requestId }; next.lastRecordedAt = new Date(Math.max(command.at, Date.parse(data.lastRecordedAt) || 0)).toISOString(); size(next);
        try {
          var written = await store.putProperty(pageId, VIEW_KEY, next, before ? before.version.number : null, options), confirmed = viewData(written, pageId);
          if (!confirmed.active[actor] || confirmed.active[actor].requestId !== command.requestId) fail('UNKNOWN_COMMIT', 'The view write was not confirmed. Retry the original request.');
          pendingViews.delete(pendingKey); return { recorded: true, deduplicated: false, requestId: command.requestId, views: confirmed.count, counted: true, recordedViews: confirmed.count, lastRecordedAt: confirmed.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) };
        } catch (error) {
          if (error.code === 'CONFLICT') continue;
          if (error.code === 'UNKNOWN_COMMIT') {
            try { var checked = viewData(await property(pageId, VIEW_KEY, {}), pageId), entry = checked.active[actor]; if (entry && entry.requestId === command.requestId) { pendingViews.delete(pendingKey); return { recorded: true, deduplicated: false, requestId: command.requestId, views: checked.count, counted: true, recordedViews: checked.count, lastRecordedAt: checked.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) }; } } catch (_) {}
          } else pendingViews.delete(pendingKey);
          throw error;
        }
      }
      pendingViews.delete(pendingKey); fail('CONFLICT', 'Recorded views changed repeatedly. This visit was not confirmed; retry.');
    }
    async function exportDocument(pageId, options) {
      options = options || {}; var p = await page(pageId, options), start = 0, seen = new Set(), votes = { yes: 0, no: 0, total: 0 }, versions = {}, view = null;
      if (options.pageVersion != null && options.pageVersion !== p.version.number) fail('CONFLICT', 'The article changed during analytics collection.');
      do {
        abort(options.signal);
        var path = '/rest/api/content/' + pageId + '/property', batch = await store.request(path + '?expand=version&limit=' + PAGE_SIZE + '&start=' + start, { signal: options.signal });
        if (!object(batch) || !Array.isArray(batch.results) || batch.results.length > PAGE_SIZE || !object(batch._links) || batch.start != null && batch.start !== start || batch.size != null && batch.size !== batch.results.length) fail('INVALID_DATA', 'Invalid engagement analytics pagination.');
        batch.results.forEach(function (prop) {
          if (!object(prop) || typeof prop.key !== 'string' || seen.has(prop.key)) fail('INCOMPLETE', 'Engagement properties changed during analytics collection.');
          seen.add(prop.key); if (seen.size > maxProperties) fail('LIMIT', 'This document exceeded the engagement analytics property limit.');
          if (prop.key === VIEW_KEY) view = viewData(prop, pageId);
          else if (prop.key.startsWith(VOTE_PREFIX)) {
            if (!/^[a-f0-9]{64}$/.test(prop.key.slice(VOTE_PREFIX.length))) fail('INVALID_DATA', 'Malformed helpfulness property key.');
            var value = voteData(prop, pageId, prop.key); if (value.pageVersion > p.version.number) fail('INVALID_DATA', 'Helpfulness refers to a future article version.');
            votes[value.value]++; votes.total++;
            var tally = versions[value.pageVersion] || (versions[value.pageVersion] = { pageVersion: value.pageVersion, yes: 0, no: 0, total: 0 }); tally[value.value]++; tally.total++;
          }
        });
        var count = batch.results.length, next = batch._links.next, total = batch.totalSize == null ? batch.totalCount : batch.totalSize;
        if (total != null && (!integer(total) || total < start + count)) fail('INVALID_DATA', 'Invalid engagement analytics totals.');
        if (!next) { if (total != null && total > start + count) fail('INCOMPLETE', 'Not all engagement properties were returned.'); start = null; }
        else {
          if (!count || typeof next !== 'string' || /[\\\u0000-\u0020]/.test(next) || /%(?:2e|2f|5c|25)/i.test(next)) fail('INVALID_DATA', 'Invalid engagement continuation link.');
          var url; try { url = new URL(next, dependencies.origin || root.location && root.location.origin || 'https://confluence.invalid'); } catch (_) { fail('INVALID_DATA', 'Invalid engagement continuation URL.'); }
          var raw = url.searchParams.get('start'), expectedOrigin = dependencies.origin || root.location && root.location.origin;
          if (expectedOrigin && url.origin !== expectedOrigin) fail('INVALID_DATA', 'Engagement pagination escaped the Confluence origin.');
          if (!/^\d+$/.test(raw || '') || url.searchParams.getAll('start').length !== 1 || Number(raw) !== start + count || url.hash || url.username || url.password || ![path, (config.contextPath == null ? '/confluence' : config.contextPath).replace(/\/$/, '') + path].includes(url.pathname)) fail('INVALID_DATA', 'Invalid engagement continuation offset.');
          // Only the validated offset is reused. Never follow supplied URLs.
          start = Number(raw);
        }
      } while (start !== null);
      view = view || viewData(null, pageId);
      var current = versions[p.version.number] || { yes: 0, no: 0, total: 0 };
      return { schemaVersion: 1, pageId: pageId, pageVersion: p.version.number, observedAt: new Date(clock()).toISOString(), helpfulness: Object.assign({ source: 'confluence-content-properties', status: 'available' }, votes, { currentVersionTotals: { yes: current.yes, no: current.no, total: current.total }, byPageVersion: Object.keys(versions).map(Number).sort(function (a, b) { return a - b; }).map(function (v) { return versions[v]; }) }), views: { source: 'confluence-content-properties', status: 'available', recordedViews: view.count, windowMinutes: 30, lastRecordedAt: view.lastRecordedAt }, coverage: clone(COVERAGE) };
    }
    return Object.freeze({ load: load, loadViews: loadViews, vote: vote, recordView: recordView, exportDocument: exportDocument });
  }
  return Object.freeze({ create: create, votePrefix: VOTE_PREFIX, viewKey: VIEW_KEY, coverage: COVERAGE });
});

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
/* Source: article-engagement-bootstrap.js */
/* Native article engagement. Deferred, scoped and independent of comment loading. */
(function (global, doc) {
  'use strict';
  if (global.WCSArticleEngagementBootstrap) return;
  var settings = global.WCS_ARTICLE_DISCUSSION_CONFIG, timer, request, host, stopped = false, generation = 0, started = false;
  var voteAction = '', voteBusy = false, voteUnknown = false, pendingVoteValue = null, feedback, state, engagement, voteNotice, counter, yes, no, check, retry;
  function candidate() {
    if (!settings || settings.authoringMode !== 'confluence-session' || global.top !== global.self || doc.querySelector('#wcspedia, #editpageform, #wysiwygTextarea, #content-editor, body.contenteditor')) return '';
    var url = new URL(global.location.href), action = doc.querySelector('meta[name="ajs-action"]'), space = doc.querySelector('meta[name="ajs-space-key"]');
    if (url.searchParams.get('wcsNativeUi') === '1' || action && action.content !== 'viewpage' || space && space.content !== settings.spaceKey) return '';
    if (!(/\/pages\/viewpage\.action$/.test(url.pathname) || /\/display\/[^/]+\/.+/.test(url.pathname) || /\/spaces\/[^/]+\/pages\/\d+(?:\/.*)?$/.test(url.pathname))) return '';
    var blocked = false;
    url.searchParams.forEach(function (value, key) { if (/preview/i.test(key) || /^pageVersion$/i.test(key) || /^(action|mode)$/i.test(key) && /^(edit|create|preview|history)$/i.test(value)) blocked = true; });
    if (blocked) return '';
    var meta = doc.querySelector('meta[name="ajs-page-id"]'), id = meta && meta.content || url.searchParams.get('pageId') || (url.pathname.match(/\/pages\/(\d+)(?:\/|$)/) || [])[1] || '';
    var excluded = [settings.rootPageId, settings.attachmentPageId, settings.workingRootPageId, settings.insightsPageId].concat(Object.values(settings.pageIds || {}), Object.values(settings.areaPageIds || {}), settings.excludePageIds || []);
    return /^[1-9]\d*$/.test(id) && !excluded.map(String).includes(String(id)) ? String(id) : '';
  }
  function config() {
    return Object.assign({}, settings, {mode: 'confluence', nativePublication: {areaPageIds: settings.areaPageIds, workingRootPageId: settings.workingRootPageId, insightsPageId: settings.insightsPageId}, search: {excludePageIds: settings.excludePageIds || [], excludeAncestorIds: settings.excludeAncestorIds || []}});
  }
  function el(tag, cls, text) { var node = doc.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; }
  function notify(type, text) { if (global.WCSNotifications && global.WCSNotifications[type]) global.WCSNotifications[type](text); }
  function button(value, label) {
    var b = el('button', 'wcs-discussion-button wcs-discussion-reaction'); b.type = 'button'; b.dataset.vote = value; b.setAttribute('aria-label', label);
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [['viewBox','0 0 24 24'],['width','24'],['height','24'],['aria-hidden','true'],['fill','none'],['stroke','currentColor'],['stroke-width','1.5'],['stroke-linecap','round']].forEach(function (attr) { svg.setAttribute(attr[0], attr[1]); });
    [['circle',{cx:'12',cy:'12',r:'9'}],['circle',{cx:'8.5',cy:'9.5',r:'.8',fill:'currentColor',stroke:'none'}],['circle',{cx:'15.5',cy:'9.5',r:'.8',fill:'currentColor',stroke:'none'}],['path',{d:value==='yes'?'M7.8 13.5c1.2 3.7 7.2 3.7 8.4 0':'M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0'}]].forEach(function (part) {
      var shape = doc.createElementNS('http://www.w3.org/2000/svg', part[0]); Object.keys(part[1]).forEach(function (key) { shape.setAttribute(key, part[1][key]); }); svg.append(shape);
    });
    b.append(global.WCSIcons?global.WCSIcons.node(doc,value==='yes'?'helpful':'not-helpful'):svg, el('span', '', label)); b.addEventListener('click', function () { saveVote(value); }); return b;
  }
  function renderVote() {
    yes.disabled = no.disabled = voteBusy || voteUnknown || !state || !state.canVote;
    yes.setAttribute('aria-pressed', String(!!state && state.vote === 'yes')); no.setAttribute('aria-pressed', String(!!state && state.vote === 'no'));
    check.hidden = !voteUnknown;
    check.disabled = voteBusy;
    yes.setAttribute('aria-busy', String(voteBusy && voteAction === 'save' && state?.vote === 'yes'));
    no.setAttribute('aria-busy', String(voteBusy && voteAction === 'save' && state?.vote === 'no'));
    check.setAttribute('aria-busy', String(voteBusy && voteAction === 'check'));
    retry.setAttribute('aria-busy', String(voteBusy && voteAction === 'retry'));
    retry.hidden = !voteUnknown || !pendingVoteValue;
    retry.disabled = voteBusy || !state || !state.canVote;
  }
  function renderCount(value) {
    if (Number.isSafeInteger(value) && value >= 0) counter.textContent = new Intl.NumberFormat('en-GB').format(value) + (value === 1 ? ' recorded view' : ' recorded views');
    else counter.textContent = 'Recorded views unavailable';
  }
  async function saveVote(value, retrying) {
    if (stopped || voteBusy || !state || !state.canVote || (voteUnknown ? !retrying || value !== pendingVoteValue : retrying || state.vote === value)) return;
    var before = state, current = generation; voteBusy = true; voteAction = retrying ? 'retry' : 'save'; state = Object.assign({}, state, {vote:value}); renderVote(); voteNotice.textContent = 'Saving…';
    try {
      var result = await feedback.save(value, {signal:request.signal}); if (stopped || current !== generation) return;
      state = result; voteUnknown = false; pendingVoteValue = null; voteNotice.textContent = 'Thank you. Your feedback is saved.'; notify('success','Feedback saved.');
    } catch (error) {
      if (stopped || current !== generation) return; state = before;
      voteUnknown = retrying || error.outcome !== 'rejected'; pendingVoteValue = voteUnknown ? value : null;
      voteNotice.textContent = voteUnknown ? 'The save could not be confirmed. Check saved feedback or retry the original vote.' : (error.message || 'Feedback was not saved. Please try again.');
      notify(voteUnknown ? 'warning' : 'error', voteNotice.textContent);
    } finally { if (current === generation) { voteBusy = false; if (!stopped) renderVote(); } }
  }
  async function checkVote() {
    if (voteBusy || stopped) return;
    var current = generation; voteBusy = true; voteAction = 'check'; renderVote();
    try {
      var result = await feedback.load({signal:request.signal}); if (stopped || current !== generation) return; state = result;
      voteUnknown = !!state.pendingVote; pendingVoteValue = voteUnknown ? state.pendingVote.value : null;
      voteNotice.textContent = voteUnknown ? 'The original vote is still unconfirmed. Check again or retry that same vote.' : state.canVote ? 'Saved feedback checked.' : state.reason;
    }
    catch (_) { if (!stopped && current === generation) voteNotice.textContent = 'Saved feedback could not be checked. Try again when connected.'; }
    finally { if (current === generation) { voteBusy = false; if (!stopped) renderVote(); } }
  }
  function mount(data) {
    var content = Array.from(doc.querySelectorAll('#main-content,.wiki-content')).find(function (node) { return !node.closest('#navHeader,#navBar,#header,header,.aui-header,[role="banner"],[data-wcs-header-actions]'); }); if (!content) return false;
    host = el('div','wcs-article-discussion wcs-article-engagement'); host.dataset.wcsArticleEngagement = ''; host.setAttribute('role','region'); host.setAttribute('aria-label','Article feedback and recorded views');
    var row = el('div','wcs-article-engagement-row'); counter = el('span','wcs-article-recorded-views');
    counter.title = 'Successful WCSpedia recordings by signed-in users with native metadata-write permission; one per account per 30 minutes. This is not Confluence’s total page traffic.';
    renderCount(data.views && data.views.recordedViews); row.append(counter);
    var helpful = el('div','wcs-discussion-helpful'); helpful.append(el('span','wcs-discussion-helpful-label','Was this article helpful?'));
    var votes = el('div','wcs-discussion-votes'); votes.setAttribute('role','group'); votes.setAttribute('aria-label','Was this article helpful?');
    yes = button('yes','Helpful'); no = button('no','Not helpful'); votes.append(yes,no); helpful.append(votes);
    voteNotice = el('span','wcs-discussion-vote-status'); voteNotice.setAttribute('role','status');
    if (!data.canVote) voteNotice.textContent = data.reason || 'Native Confluence edit permission is required to save feedback.';
    helpful.append(voteNotice); check = el('button','wcs-discussion-button','Check saved feedback'); check.type = 'button'; check.hidden = true; check.addEventListener('click',checkVote); helpful.append(check);
    retry = el('button','wcs-discussion-button','Retry original vote'); retry.type = 'button'; retry.hidden = true; retry.addEventListener('click',function () { saveVote(pendingVoteValue,true); }); helpful.append(retry);
    row.append(helpful); host.append(row);
    var discussion = content.querySelector('[data-wcs-article-discussion-host]'); if (discussion) content.insertBefore(host,discussion); else content.append(host);
    return true;
  }
  async function start() {
    var id = candidate(); if (started || stopped || !id || doc.visibilityState === 'hidden') return;
    started = true; var current = generation; request = new global.AbortController();
    function active() { return !stopped && generation === current && candidate() === id; }
    try {
      engagement = global.WCSSpaceEngagement.create(config());
      var data = await engagement.load(id,{signal:request.signal}); if (!active()) return;
      // A tab hidden during the read must still qualify for a fresh visible
      // visit later. Do not mount or record while it is hidden.
      if (doc.visibilityState === 'hidden') { started = false; return; }
      feedback = global.WCSArticleFeedback.create({authoringMode:'confluence-session',config:config(),pageId:id,engagement:engagement});
      // Validate and prime the adapter without a second metadata fetch.
      state = feedback.prime ? feedback.prime(data) : await feedback.load({signal:request.signal});
      voteUnknown = !!state.pendingVote; pendingVoteValue = voteUnknown ? state.pendingVote.value : null;
      if (!active() || !mount(data)) return; renderVote();
      if (voteUnknown) voteNotice.textContent = 'The original vote is still unconfirmed. Check again or retry that same vote.';
      if (data.canRecord && doc.visibilityState !== 'hidden') {
        try { var result = await engagement.recordView(id,{signal:request.signal}); if (active()) renderCount(result.recordedViews); }
        catch (error) { if (active()) { counter.title = 'This visit was not confirmed: ' + error.message; counter.textContent += ' · recording unavailable'; } }
      }
    } catch (error) {
      if (!active() || error.name === 'AbortError' || ['SCOPE','OUT_OF_SCOPE','FORBIDDEN','CONFIGURATION','NOT_FOUND'].includes(error.code)) return;
      var content = Array.from(doc.querySelectorAll('#main-content,.wiki-content')).find(function (node) { return !node.closest('#navHeader,#navBar,#header,header,.aui-header,[role="banner"],[data-wcs-header-actions]'); });
      if (content) { host = el('div','wcs-engagement-unavailable','Article feedback and recorded views are temporarily unavailable.'); host.setAttribute('role','status'); content.append(host); }
    }
  }
  function schedule() { clearTimeout(timer); if (!stopped && !started && candidate() && doc.visibilityState !== 'hidden') timer = setTimeout(start,2000); }
  function destroy() { stopped = true; generation++; clearTimeout(timer); if (request) request.abort(); if (host) host.remove(); host = null; }
  global.WCSArticleEngagementBootstrap = Object.freeze({destroy:destroy});
  doc.addEventListener('visibilitychange',schedule);
  global.addEventListener('pagehide',destroy);
  global.addEventListener('pageshow',function (event) { if (event.persisted) { stopped = started = voteBusy = voteUnknown = false; state = null; pendingVoteValue = null; schedule(); } });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})(window,document);
