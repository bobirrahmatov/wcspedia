/* DOM tests: NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test native-content.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('./native-content.js');
let JSDOM;
try { ({JSDOM} = require('jsdom')); } catch (_) { /* Pure normalization still runs without optional DOM test dependency. */ }
const domTest = (name, fn) => test(name, {skip: !JSDOM && 'Install jsdom or set NODE_PATH for DOM tests'}, () => {
  const win = new JSDOM('').window, previous = global.DOMParser;
  global.DOMParser = win.DOMParser;
  try { fn(); } finally { if (previous) global.DOMParser = previous; else delete global.DOMParser; win.close(); }
});
const base = 'https://intranet.example/confluence/pages/viewpage.action?pageId=12';
function page(html = '') {
  return {id:'12', title:'Credit review guide', type:'page', version:{number:3,when:'2026-10-15T10:00:00Z',by:{displayName:'Alex',username:'am12345',userKey:'u1'}},
    metadata:{labels:{results:[{name:'wcspedia'},{name:'wcs-type-job-aid'},{name:'wcs-area-loans'},{name:'wcs-region-emea'}]}},
    body:{view:{value:html}}, _links:{base:'https://intranet.example/confluence',webui:'/pages/viewpage.action?pageId=12'}};
}

test('summary-only CQL pages normalize without invented content, approvals or view metrics', () => {
  const result = N.normalizePage(page());
  assert.equal(result.id,'12'); assert.equal(result.title,'Credit review guide');
  assert.equal(result.type,'Job aid'); assert.equal(result.area,'loans'); assert.deepEqual(result.regions,['emea']);
  assert.equal(result.version,3); assert.equal(result.updatedBy.username,'am12345');
  assert.equal(result.readingMinutes,null); assert.equal(result.nativeBodyHtml,'');
  for (const key of ['approvedBy','approvalDate','views','status','bodyMarkdown','sections']) assert.equal(key in result,false);
});

test('content properties override label metadata but approval claims never become trusted fields', () => {
  const result=N.normalizePage(page(),{results:[{key:'wcs.metadata',value:{sourcePageVersion:3,docKey:'WCS-42',type:'Training',owner:{name:'Jordan',soeid:'jl67890'},team:'Credit',regions:['Global'],processes:'Review; Handover',summary:'Sample',approved:true}}]});
  assert.equal(result.documentKey,'WCS-42'); assert.equal(result.owner.soeid,'JL67890');
  assert.equal(result.type,'Training'); assert.deepEqual(result.processes,['Review','Handover']);
  assert.deepEqual(result.regions,['Global']); assert.equal(result.metadataSource,'content-property'); assert.equal('approved' in result,false);
});

test('missing DOMParser fails closed for real body processing', () => {
  const previous=global.DOMParser; delete global.DOMParser;
  try { assert.throws(()=>N.sanitizeView('<p>Hi</p>',base),/DOMParser/); assert.throws(()=>N.normalizePage(page('<p>Hi</p>')),/DOMParser/); }
  finally {if(previous) global.DOMParser=previous;}
});

domTest('sanitizer preserves readable native structure while removing executable and page-control content', () => {
  const html=N.sanitizeView('<h2 id="steps">Steps</h2><p style="color:red" onclick="bad()">Use <strong>evidence</strong> <a href="#steps">above</a>.</p><table><tr><th scope="col">Name</th><th>Value</th></tr><tr><td colspan="2">Confirmed</td></tr></table><script>steal()</script><style>body{display:none}</style><form><input value="x"></form><nav>Sidebar</nav><svg onload="bad()"><text>Bad</text></svg>',base);
  assert.match(html,/<h2 id="wcs-native-steps">Steps<\/h2>/);
  assert.match(html,/<a href="#wcs-native-steps"/); assert.match(html,/<td colspan="2">Confirmed<\/td>/);
  assert.doesNotMatch(html,/script|onclick|style=|<form|<nav|<svg|steal\(\)|Sidebar/);
});

domTest('URL handling denies javascript, data, credential URLs and unapproved remote media', () => {
  const html=N.sanitizeView('<a href="javascript:alert(1)">Bad</a><a href="https://user:pass@evil.example">Credentials</a><img src="data:image/svg+xml,evil" onerror="bad()"><img src="//evil.example/pixel.png"><img src="https://evil.example/pixel.png"><img src="/confluence/download/attachments/12/cover.png" alt="Cover"><a href="https://help.example/guide">Safe</a><video src="https://evil.example/video.mp4" autoplay onplay="bad()"></video>',base);
  assert.doesNotMatch(html,/javascript:|data:|evil.example|onerror|onplay|autoplay|user:pass/);
  assert.match(html,/src="https:\/\/intranet.example\/confluence\/download\/attachments\/12\/cover.png"/);
  assert.match(html,/href="https:\/\/help.example\/guide"/);
  assert.match(html,/<video controls="" preload="none">/);
});

domTest('SharePoint iframe becomes a safe recording link and arbitrary embeds are omitted', () => {
  const html=N.sanitizeView('<iframe src="https://tenant.sharepoint.com/sites/training/recording" title="Training recording" allow="camera" srcdoc="bad"></iframe><iframe src="https://sharepoint.com.evil.example/video"></iframe>',base);
  assert.doesNotMatch(html,/<iframe|srcdoc|allow=|evil.example/);
  assert.match(html,/>Training recording<\/a>/); assert.match(html,/Embedded content is available/);
});

domTest('metadata table extracts expected fields and property metadata remains the preferred source', () => {
  const html='<div class="details-macro"><table><tbody><tr><th>Document key</th><td>WCS-90</td></tr><tr><th>Content type</th><td>Job aid</td></tr><tr><th>Document owner</th><td>Alex</td></tr><tr><th>Owner SOEID</th><td>am12345</td></tr><tr><th>Owning team</th><td>Loans</td></tr><tr><th>Regions covered</th><td>NAM; EMEA</td></tr><tr><th>Next review due date</th><td>2028-10-15</td></tr></tbody></table></div><p>Check the record.</p>';
  const result=N.normalizePage(page(html));
  assert.equal(result.documentKey,'WCS-90'); assert.equal(result.owner.soeid,'AM12345'); assert.equal(result.nextReviewDate,'2028-10-15');
  assert.deepEqual(result.regions,['NAM','EMEA']); assert.equal(result.metadataSource,'page-properties-table');
  const preferred=N.normalizePage(page(html),[{key:'wcs.metadata',value:{sourcePageVersion:3,owner:{name:'Jordan',soeid:'jl67890'},regions:[]}}]);
  assert.equal(preferred.owner.name,'Jordan'); assert.deepEqual(preferred.regions,[]); assert.equal(preferred.documentKey,'WCS-90');
});

domTest('ordinary content tables do not masquerade as metadata; excerpt supplies summary', () => {
  const result=N.normalizePage(page('<table><tr><td>Owner</td><td>Do not assign</td></tr></table><div class="excerpt">Short introduction.</div><p>Body.</p>'));
  assert.equal(result.owner.name,''); assert.equal(result.summary,'Short introduction.'); assert.equal(result.metadataSource,'labels');
});

domTest('reading minutes use actual visible words and ignore navigation, scripts and omitted content', () => {
  assert.equal(N.readingMinutes('<p>'+Array(401).fill('Word').join(' ')+'</p><nav>'+Array(500).fill('Menu').join(' ')+'</nav><script>anything</script>'),3);
  assert.equal(N.readingMinutes('<p>Hello</p>'),1); assert.equal(N.readingMinutes('<p></p>'),0);
  assert.equal(N.readingMinutes('<p>'+Array(200).fill('Word').join(' ')+'</p>',{wordsPerMinute:100}),2);
});

domTest('derived Markdown preserves tables, lists, formatting and links with export provenance', () => {
  const html='<h2>Steps</h2><p>Use <strong>the record</strong> and <a href="/confluence/pages/viewpage.action?pageId=40">source</a>.</p><ol><li>Check owner.</li><li>Record review.</li></ol><table><tr><th>Owner</th><th>Decision</th></tr><tr><td>Alex</td><td>Reviewed</td></tr></table><pre><code>const text = `value`;</code></pre><iframe src="https://tenant.sharepoint.com/sites/recording"></iframe>';
  const result=N.exportMarkdown(page(html));
  assert.match(result,/^# Credit review guide/); assert.match(result,/## Steps/); assert.match(result,/\*\*the record\*\*/);
  assert.match(result,/1\. Check owner\./); assert.match(result,/2\. Record review\./);
  assert.match(result,/\| Owner \| Decision \|\n\| --- \| --- \|/);
  assert.match(result,/https:\/\/intranet.example\/confluence\/pages\/viewpage.action\?pageId=40/);
  assert.match(result,/page 12, version 3/); assert.match(result,/derived copy/); assert.match(result,/Some embedded content/);
});

domTest('malicious attributes, nested malformed markup and metadata do not execute in the output', () => {
  const html=N.sanitizeView('<img src="x" onerror="alert(1)"><a href="java&#x09;script:alert(1)">Link</a><math><mtext><table><mglyph><style><!--</style><img src="x" onerror="bad()"></table></mtext></math><p id="__proto__">End</p>',base);
  const doc=new global.DOMParser().parseFromString(html,'text/html');
  assert.equal(doc.querySelector('script,style,math,svg,iframe'),null);
  for(const el of doc.querySelectorAll('*')) for(const attr of el.attributes) assert.ok(!/^on/i.test(attr.name));
  assert.equal(doc.querySelector('a').hasAttribute('href'),false);
  assert.equal(doc.querySelector('p').id,'wcs-native-__proto__');
});


domTest('stale and unversioned property projections cannot override current native metadata', () => {
  const html='<table><tr><th>Document key</th><td>WCS-90</td></tr><tr><th>Document owner</th><td>Current owner</td></tr><tr><th>Owning team</th><td>Current team</td></tr></table>';
  for (const sourcePageVersion of [undefined,2,4,'3']) {
    const result=N.normalizePage(page(html),[{key:'wcs.metadata',value:{sourcePageVersion,owner:{name:'Stale owner'},team:'Old team'}}]);
    assert.equal(result.owner.name,'Current owner');assert.equal(result.team,'Current team');assert.equal(result.metadataSource,'page-properties-table');
  }
});

domTest('native widget chrome and loading messages are excluded from reading time and Markdown', () => {
  const html='<div id="wcs-native-document-controls" data-wcs-native-document-controls><p>'+Array(500).fill('Loading').join(' ')+'</p></div><p>Actual content.</p><span data-wcs-native-create-widget>Add document</span>';
  const normalized=N.normalizePage(page(html));
  assert.equal(normalized.readingMinutes,1);assert.doesNotMatch(normalized.nativeBodyHtml,/Loading|Add document/);
  assert.equal(N.readingMinutes(html),1);assert.doesNotMatch(N.exportMarkdown(page(html)),/Loading|Add document/);
});
