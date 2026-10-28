/* Build the small, content-only upload kit for an existing Confluence header.
 * Run: node build-confluence-upload.cjs
 * The generated local/portable previews retain their own embedded fonts.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=__dirname,out=path.join(root,'confluence-upload');
const attachmentMaxBytes=10_000_000;
function checkAttachmentSize(name,bytes){
  if(/^(?:attachments|initial-data|initial-json)\//.test(name)&&bytes>attachmentMaxBytes){
    throw Error('Confluence attachment exceeds the 10 MB (10,000,000 bytes) limit: '+name+' ('+bytes+' bytes). Reduce this file before packaging; the limit applies to each attachment, not the ZIP total.');
  }
}
execFileSync(process.execPath,[path.join(root,'build.cjs')],{cwd:root,stdio:'inherit'});
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const put=(name,content)=>{checkAttachmentSize(name,Buffer.byteLength(content));const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
const copy=(from,to)=>put(to,fs.readFileSync(path.join(root,from)));

// Keep component dimensions/colors intact, but let the Confluence theme supply
// text fonts. Code/source fields deliberately keep their monospace font.
let css=read('wcspedia-style.css')
  .replace(/@font-face\s*\{[^}]*\}\s*/gi,'')
  .replace(/font-family\s*:\s*[^;}]*?(?:WCSCiti|Citi Sans)[^;}]*/g,value=>'font-family:inherit'+(value.includes('!important')?'!important':''))
  .replace(/font:\s*(11px|13px)\s+WCSCiti,[^;}]+/g,(_,size)=>'font-size:'+size+';font-family:inherit')
  .replace(/font:16px\/1 Arial,sans-serif/g,'font-size:16px;line-height:1;font-family:inherit')
  .replace(/Citi Sans, generous spacing/g,'inherited host typography, generous spacing')
  .replace(/\.wcs-preview-tools[^{}]*\{[^}]*\}/g,'')
  .replace(/(?<!#wcspedia )\.control-details-body \.wcs-governance-metadata/g,'#wcspedia .control-details-body .wcs-governance-metadata');
if(/@font-face|data:font|WCSCiti|Citi-Sans-Text|Citi Sans/.test(css))throw Error('A hosted font override remains. Review the upload stylesheet.');
css='/* WCSpedia component styles. Inherits the existing Confluence font; no site header or global reset. */\n'+css;
const bundle=read('wcspedia.js');
// Native discovery needs only this small navigation catalogue. Published
// document snapshots and private workspace data load when their views need
// them; they must not hold up the landing page or native CQL results.
const original=JSON.parse(read('wcspedia-published.json'));
const starter={schemaVersion:1,isDemo:false,people:[],areas:original.areas,types:original.types,documents:[],taxonomyRevision:1,taxonomyAudit:[]};
require('./confluence.js').validateData(starter);
// Preserve one source implementation; emit independently loadable page scripts.
// The standard local/portable bundle remains untouched.
const marker='\n/* Source: app.js */\n';
const split=bundle.indexOf(marker),application=read('app.js');
if(split<0||split!==bundle.lastIndexOf(marker))throw Error('Expected one application renderer in the shared bundle.');
// The shared header owns notifications; page bundles only call its singleton.
const notificationModule='\n/* Source: notifications.js */\n'+read('notifications.js')+'\n;';
if(!bundle.slice(0,split).includes(notificationModule))throw Error('Shared notifications module missing from local bundle.');
const logic=bundle.slice(0,split).replace(notificationModule,'');
if(bundle.slice(split+marker.length)!==application+'\n;')throw Error('The renderer must be the final bundle module. Review the split.');
const entries={home:['wcspedia-landing','Knowledge base'],mine:['wcspedia-my-workspace','My workspace'],review:['wcspedia-reviewer-workspace','Reviewer workspace'],saved:['wcspedia-saved-items','Saved items'],entitlements:['wcspedia-entitlements','Entitlements'],insights:['wcspedia-insights','Insights']};
const engagementBundle=['space-storage.js','space-engagement.js','article-feedback-client.js','article-engagement-bootstrap.js'].map(file=>'/* Source: '+file+' */\n'+read(file)).join('\n;\n');
const discussionBundle=['article-comments.js','article-feedback-client.js','article-discussion.js'].map(file=>'/* Source: '+file+' */\n'+read(file)).join('\n;\n');
const revision=crypto.createHash('sha256').update('covenants-page-pairs-v1').update(css).update(logic).update(JSON.stringify(starter)).update(application).update(read('publication-config.js')).update(read('templates/wcspedia-document.mdx')).update(read('add-document-widgetHTMLPage.js')).update(read('add-document-widget-confluence-macro.html')).update(read('page-style-flags.js')).update(read('notifications.js')).update(engagementBundle).update(discussionBundle).update(read('article-discussion-bootstrap.js')).update(read('article-discussion-header.html')).update(fs.readFileSync(__filename)).digest('hex').slice(0,12);
function pageGuard(role,name){
  return `  const mount = document.getElementById('wcspedia');
  if (!mount) return;
  function failPage(message) {
    const box = document.createElement('div');
    box.className = 'boot-state';
    box.setAttribute('role', 'alert');
    box.textContent = message;
    mount.replaceChildren(box);
  }
  if (mount.getAttribute('data-wcs-page-role') !== '${role}' || !window.WCS_CONFIG || window.WCS_CONFIG.pageRole !== '${role}') {
    failPage('The WCSpedia JavaScript does not match this HTML macro. Use the ${name}.html settings and its matching JavaScript pair.');
    return;
  }
`;
}
function logicScript(role,name,title){
  return `/* WCSpedia ${title}: page logic and dependencies.
 * Covenants loading order: HTML macro with inline settings, ${name}.js,
 * then ${name}HTMLPage.js. No separate configuration attachment.
 * This file alone does not render a page or make data requests.
 */
(function () {
  'use strict';
${pageGuard(role,name)}
  const modules = window.WCSPageModules = window.WCSPageModules || {};
  if (modules['${role}']) return;
  window.WCSDiscoveryCatalog = ${JSON.stringify(starter)};
${logic}
  modules['${role}'] = { version: '${revision}' };
})();
`;
}
function htmlPageScript(role,name,title){
  return `/* WCSpedia ${title}: HTML rendering and startup.
 * Load ${name}.js first, then this file, as with covenantsHTMLPage.js.
 * Uses the settings embedded in this page's HTML macro.
 * Generated from the maintained app.js source; preserves the existing design.
 */
(function () {
  'use strict';
${pageGuard(role,name)}
  if (mount.dataset.wcsPageStarted) return;
  if (!window.WCSPageModules || window.WCSPageModules['${role}']?.version !== '${revision}') {
    failPage('Load ${name}.js before ${name}HTMLPage.js. Use both files from the same upload package and check their attachment URLs.');
    return;
  }
  mount.dataset.wcsPageStarted = '${role}';
  const pageReady = ${application}
  return pageReady;
})();
`;
}
// These obsolete generated files are no longer used by the page macros.
for(const obsolete of ['wcspedia-config.js','wcspedia.js','wcspediaHTMLPage.js'])fs.rmSync(path.join(out,'attachments',obsolete),{force:true});
put('attachments/wcspedia-style.css',css);
put('attachments/wcspedia-article-engagement.js',engagementBundle);
copy('notifications.js','attachments/wcspedia-notifications.js');
copy('file-drop-guard.js','attachments/wcspedia-file-drop-guard.js');
copy('file-drop-guard-header.html','html/wcspedia-file-drop-guard-header.html');
put('html/wcspedia-notifications-header.html',`<!-- Paste once into your EXISTING shared header HTML macro.
Replace REPLACE_WITH_ATTACHMENTS_PAGE_ID with the numeric page hosting the attachments.
Update the existing global wcspedia-style.css inclusion to this build's revision.
This defines shared toast notifications; it adds no header or application root.
-->
<script src="/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/wcspedia-notifications.js?api=v2"></script>
`);
for(const [role,[name,title]] of Object.entries(entries)){
  put('attachments/'+name+'.js',logicScript(role,name,title));
  put('attachments/'+name+'HTMLPage.js',htmlPageScript(role,name,title));
}
// The globally included header has independent dependencies and settings, so it
// can load before/after any page without replacing the page's runtime globals.
put('attachments/wcspedia-add-document.js',`/* WCSpedia shared-header Add document logic. */
(function () {
  'use strict';
  var registry = window.WCSHeaderWidgetModules = window.WCSHeaderWidgetModules || {};
  if (registry.addDocument && registry.addDocument.version === '${revision}') return;
  var scope = { crypto: window.crypto, FormData: window.FormData, Blob: window.Blob, fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : undefined, location: window.location, DOMParser: window.DOMParser };
  (function (globalThis) {
${['vendor/markdown-it-15.0.2.min.js','entitlements.js','editor-content.js','governance.js','workflow.js','space-storage.js','space-renderer.js','space-workflow.js','confluence.js','scroll-tools.js','add-document-widget.js'].map(read).join('\n;\n')}
  })(scope);
  registry.addDocument = { version: '${revision}', Confluence: scope.WCSConfluence, AddDocument: scope.WCSAddDocument, Content: scope.WCSEditorContent };
})();
`);
put('attachments/wcspedia-add-documentHTMLPage.js',read('add-document-widgetHTMLPage.js').replaceAll('REPLACE_WITH_WIDGET_BUILD_REVISION',revision));
put('html/wcspedia-header-widget.html',read('add-document-widget-confluence-macro.html').replaceAll('REPLACE_WITH_WIDGET_BUILD_REVISION',revision));
copy('assets/wcspedia-logo.png','attachments/wcspedia-logo.png');
copy('assets/citi-logo.png','attachments/citi-logo.png');
for(let i=1;i<=50;i++){const file='wcs-insight-cover-'+String(i).padStart(2,'0')+'.jpg';copy('assets/insights-covers/'+file,'attachments/'+file);}
copy('assets/insights-covers/sources.json','licenses/insights-cover-sources.json');
copy('assets/wcspedia-logo-source.txt','licenses/wcspedia-logo-source.txt');
copy('vendor/markdown-it-LICENSE.txt','licenses/markdown-it-LICENSE.txt');
put('attachments/wcspedia-page-style-flags.js',read('page-style-flags.js'));
copy('reader-sidebar.js','attachments/wcspedia-reader-sidebar.js');
put('html/wcspedia-reader-sidebar.html',`<!-- Optional: paste once into an HTML macro in an EXISTING published article.
Do not put this in navBar, a landing page, a collection page or a workspace.
New WCSpedia publications include this loader automatically. Uses the existing shared CSS. -->
<script defer src="/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/wcspedia-reader-sidebar.js?api=v2"></script>
`);
put('html/wcspedia-page-style-flags-header.html',read('page-style-flags-header.html').replaceAll('REPLACE_WITH_STYLE_FLAGS_REVISION',revision));
copy('page-style-flags-marker.html','html/wcspedia-page-style-flags-marker.html');
put('attachments/wcspedia-article-discussion.js',discussionBundle);
copy('article-discussion-bootstrap.js','attachments/wcspedia-article-discussion-bootstrap.js');
put('html/wcspedia-article-discussion-header.html',read('article-discussion-header.html').replaceAll('REPLACE_WITH_ARTICLE_REVISION',revision));
copy('ARTICLE-DISCUSSION.md','templates/ARTICLE-DISCUSSION.md');
copy('INSIGHTS.md','templates/INSIGHTS.md');
copy('MANUAL-ANALYTICS.md','templates/MANUAL-ANALYTICS.md');
put('html/wcspedia-insights-header-link.html',`<!-- Optional link: add to your existing header navigation. No extra header or styles. -->
<a data-wcs-insights-link href="/confluence/pages/viewpage.action?pageId=REPLACE_WITH_INSIGHTS_PAGE_ID">Insights</a>
`);
copy('article-analytics.md','templates/article-analytics.md');
copy('templates/wcspedia-analytics.json','templates/wcspedia-analytics.json');

put('attachments/wcspedia-published.json',JSON.stringify(starter,null,2)+'\n');

const macroConfig=JSON.parse(read('WCSpedia-confluence-macro.html').match(/window\.WCS_CONFIG = (\{[\s\S]*?\n\});/)[1]);
const publication=require('./publication-config.js');
const pageIds={home:'REPLACE_WITH_WCSPEDIA_PAGE_ID',mine:'REPLACE_WITH_MY_WORKSPACE_PAGE_ID',review:'REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID',saved:'REPLACE_WITH_SAVED_ITEMS_PAGE_ID',entitlements:'REPLACE_WITH_ENTITLEMENTS_PAGE_ID'};
const services=Object.fromEntries(['workspaceEndpoint','workflowEndpoint','suggestionEndpoint','entitlementsEndpoint','metricsEndpoint','bookmarksEndpoint','healthEndpoint'].map(key=>[key,'']));
const settings={authoringMode:'confluence-session',contextPath:'/confluence',spaceKey:'',attachmentPageId:'REPLACE_WITH_ATTACHMENTS_PAGE_ID',pageIds,insightsPageId:publication.insightsPageId,workingRootPageId:publication.workingRootPageId,areaPageIds:publication.areaPageIds,search:{timeoutMs:12000,excludePageIds:[],excludeAncestorIds:[]},services,charts:{...macroConfig.charts,allowCDN:true},exports:macroConfig.exports};
delete settings.exports.logoUrl;
delete settings.exports.mdxTemplateUrl;
function inlineSettings(role){return `/* EDIT SETTINGS HERE — no separate config.js attachment.
 * pageIds.home = numeric pageId from the WCSpedia landing page URL.
 * Do not enter a space ID, space name or space key as pageIds.home.
 * spaceKey = exact Confluence space key, which may differ from "WCSpedia".
 * Leave spaceKey blank to resolve and verify the landing page's actual space.
 * Every search, including Updated year, stays in that space and landing tree.
 * attachmentPageId = the page hosting JS, logos, reader JSON and entitlements.json.
 * Entitlements always read entitlements.json from attachmentPageId.
 * No separate entitlement source, filename or policy-page setting is required.
 * pageIds.entitlements is the interface page, not the policy attachment host.
 * Keep the same IDs in all six macros; only their page roles differ.
 * Native-session mode uses built-in Confluence APIs; leave legacy services empty.
 */
(function () {
  'use strict';
  var settings = ${JSON.stringify(settings,null,2)};
  var context = settings.contextPath.replace(/\\/+$/, '');
  var rootPageId = settings.pageIds.home;
  var attachmentPageId = settings.attachmentPageId || rootPageId;
  var attachment = function (name) { return context + '/download/attachments/' + encodeURIComponent(attachmentPageId) + '/' + name + '?api=v2'; };
  var pages = {};
  Object.keys(settings.pageIds).forEach(function (key) { pages[key] = context + '/pages/viewpage.action?pageId=' + encodeURIComponent(settings.pageIds[key]); });
  pages.insights = context + '/pages/viewpage.action?pageId=' + encodeURIComponent(settings.insightsPageId);
  window.WCS_CONFIG = Object.assign({}, settings.services, {
    mode: 'confluence', authoringMode: settings.authoringMode, contextPath: context, rootPageId: rootPageId,
    attachmentPageId: attachmentPageId, attachmentFilename: 'wcspedia-published.json',
    pageRole: '${role}', pages: pages, showConnectionStatus: false, mountGlobalTools: false,
    brandLogoUrl: attachment('wcspedia-logo.png'),
    nativePublication: { enabled: true, publishedRootPageId: rootPageId, workingRootPageId: settings.workingRootPageId, areaPageIds: settings.areaPageIds, insightsPageId: settings.insightsPageId, insightsTypes: ['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ'] },
    search: settings.search, charts: settings.charts,
    exports: Object.assign({}, settings.exports, { logoUrl: attachment('citi-logo.png'), mdxTemplateUrl: attachment('wcspedia-document.mdx') })
  });
  if (settings.spaceKey) window.WCS_CONFIG.spaceKey = settings.spaceKey;
})();
`;}
put('html/wcspedia-global-styles.html',`<!-- Reference only: this stylesheet is loaded ONCE in your existing global Look and Feel/header.
If the same WCSpedia component CSS is already loaded globally, do not add a second link.
Replace REPLACE_WITH_ATTACHMENTS_PAGE_ID with the page hosting the attachments.
No header, fonts, scripts or application root are added here.
-->
<link rel="stylesheet" href="/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/wcspedia-style.css?api=v2">
`);
for(const [role,[name,title]] of Object.entries(entries)){
  put('html/'+name+'.html',`<!-- WCSpedia ${title} — Covenants-style HTML macro.
Paste this whole fragment into one HTML macro on the matching native page.
Edit the settings below and the TWO attachment script URLs at the end.
REPLACE_WITH_ATTACHMENTS_PAGE_ID is the files page, not necessarily the landing page.
Use your existing global WCSpedia CSS; do not add a header or font here.
Order: inline settings → page logic JS → page HTMLPage JS. No config.js file.
-->
<div id="wcspedia" data-wcs-page-role="${role}" role="main" aria-label="WCSpedia ${title}"></div>
<script>
${inlineSettings(role)}</script>
<script src="/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/${name}.js?api=v2" onerror="document.getElementById('wcspedia').textContent='Could not load ${name}.js. Check the attachment page ID, filename and access.';"></script>
<script src="/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/${name}HTMLPage.js?api=v2" onerror="document.getElementById('wcspedia').textContent='Could not load ${name}HTMLPage.js. Check the attachment page ID, filename and access.';"></script>
`);
}
copy('CONFLUENCE-WORKFLOW.md','docs/CONFLUENCE-WORKFLOW.md');
copy('NATIVE-PUBLICATION.md','docs/NATIVE-PUBLICATION.md');
copy('ENTITLEMENTS.md','docs/ENTITLEMENTS.md');
copy('ADD-DOCUMENT-WIDGET.md','docs/ADD-DOCUMENT-WIDGET.md');
copy('PAGE-STYLE-FLAGS.md','docs/PAGE-STYLE-FLAGS.md');
copy('DATA-STARTERS.md','docs/DATA-STARTERS.md');
put('docs/MDX-IMPORT.md',read('MDX-IMPORT.md').replace(/\]\(templates\//g,'](../templates/'));
copy('templates/wcspedia-document.mdx','templates/wcspedia-document.mdx');
copy('templates/wcspedia-document.mdx','attachments/wcspedia-document.mdx');
copy('templates/wcspedia-metadata.yaml','templates/wcspedia-metadata.yaml');
copy('confluence-data-starters/entitlements.json','initial-data/entitlements.json');
copy('NATIVE-SPACE-SETUP.md','templates/NATIVE-SPACE-SETUP.md');
put('README.md',read('UPLOAD-READY.md'));
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const next=path.join(dir,entry.name);if(entry.isDirectory())walk(next);else if(entry.name!=='SHA256SUMS.txt')files.push(next);}}
walk(out);
for(const file of files)checkAttachmentSize(path.relative(out,file).split(path.sep).join('/'),fs.statSync(file).size);
put('SHA256SUMS.txt',files.sort().map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')+'  '+path.relative(out,file).split(path.sep).join('/')).join('\n')+'\n');
execFileSync('python3',[path.join(root,'package-confluence-upload.py')],{cwd:root,stdio:'inherit'});
// The supported delivery is the complete configured upload package. Standalone
// historical widget packaging scripts remain as reference, not parallel releases.
console.log('Built content-only Confluence upload kit: '+out);
