'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('./confluence-storage.cjs');
const { spawnSync } = require('node:child_process');
const people = [ { id: 'author', name: 'Alex & Co', soeid: 'AM12345', role: 'Author' }, { id: 'manager', name: 'Jordan Lee', soeid: 'JL12345', role: 'Manager' } ];
function fixture(bodyMarkdown = '## Guidance\n\nRead **carefully** and <u>check</u>.') {
  const version = { version: 1, revision: 2, title: 'Credit <approval>', summary: 'Summary & context', status: 'Draft', createdAt: '2026-10-15T10:00:00Z', createdBy: 'author', bodyMarkdown, assets: [], attachments: [] };
  return { doc: { id: 'wcs-doc-stable', reference: 'WCS-JA-001', area: 'credit-approval-control', type: 'Job aid', ownerId: 'author', authorId: 'author', reviewerId: 'manager', approverId: 'manager', publishedVersion: null, versions: [version] }, version };
}
function published(body) { const f = fixture(body); Object.assign(f.version, { status: 'Published', reviewedBy: 'manager', reviewedAt: '2026-10-15T11:00:00Z', reviewedRevision: 2, approvedBy: 'manager', approvedAt: '2026-10-15T12:00:00Z', effectiveAt: '2026-10-15', nextReviewAt: '2028-10-15' }); f.doc.publishedVersion = 1; return f; }
function data(mime, value) { return 'data:' + mime + ';base64,' + Buffer.from(value).toString('base64'); }
function planMap(plan) { return Object.fromEntries(plan.flatMap(item => [[item.key, { fileName: item.fileName }], [item.sourceUrl, { fileName: item.fileName }]])); }
function validXML(value) { const result = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'], { input: '<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">' + value + '</root>', encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }

test('source dates retain original precision and timezone in native metadata, independently of workflow history', () => {
  const {doc,version}=published();
  version.sourceMetadata={schemaVersion:1,sourceId:'legacy-001',originalCreatedAt:'2020-07-03',originalUpdatedAt:'2024-10-15T00:30:00+02:00',sourceAuthor:'Original & author',sourcePath:'legacy/<guide>.mdx'};
  version.sourceImportedAt='2026-10-15T09:30:00.000Z';
  for(const operation of ['working','published']){
    const html=storage.renderStorage(doc,version,people,{operation});validXML(html);
    for(const fragment of ['Original created','2020-07-03','Original updated','2024-10-15T00:30:00+02:00','Source ID','legacy-001','Original &amp; author','legacy/&lt;guide&gt;.mdx','Imported into WCSpedia','2026-10-15T09:30:00.000Z'])assert.ok(html.includes(fragment),fragment);
    assert.match(html,/Last updated.*2026-10-15/);assert.match(html,/Review date.*2026-10-15/);
  }
  version.sourceMetadata.originalCreatedAt=null;version.sourceMetadata.originalUpdatedAt=null;
  assert.match(storage.renderStorage(doc,version,people),/Original created<\/p><\/th><td><p>Not recorded/);
});
test('native rendering rejects malformed or orphaned source provenance', () => {
  const {doc,version}=fixture();
  version.sourceImportedAt='2026-10-15T09:30:00.000Z';assert.throws(()=>storage.renderStorage(doc,version,people),/requires source metadata/);
  version.sourceMetadata={schemaVersion:1,sourceId:'legacy-001',originalCreatedAt:null,originalUpdatedAt:null,sourceAuthor:'',sourcePath:''};
  for(const value of [null,'2020-01-01','2026-02-30T09:30:00.000Z','2026-10-15T25:30:00.000Z']){version.sourceImportedAt=value;assert.throws(()=>storage.renderStorage(doc,version,people),/Source import time/);}
  version.sourceImportedAt='2026-10-15T09:30:00.000Z';version.sourceMetadata.originalCreatedAt='2020-02-30';assert.throws(()=>storage.renderStorage(doc,version,people));
});

test('native readable storage preserves Markdown structure without duplicating the page title', () => {
  const { doc, version } = fixture('# Main section\n\n**Bold** *italic* ~~old~~ <u>underlined</u> `code` & text\n\n1. First\n2. Second\n\n> Quote\n\n| Name | Value |\n| :--- | ---: |\n| A | B |\n\n---\n\nA line  \nbreak');
  const result = storage.renderStorage(doc, version, people, { operation: 'working' });
  for (const fragment of ['<h2>Main section</h2>', '<strong>Bold</strong>', '<em>italic</em>', '<span style="text-decoration:line-through;">old</span>', '<span style="text-decoration:underline;">underlined</span>', '<code>code</code>', '<ol>', '<blockquote>', '<th style="text-align:left">', '<td style="text-align:right">', '<hr />', '<br />']) assert.ok(result.includes(fragment), fragment);
  assert.ok(!result.includes('<h1>')); assert.ok(!result.includes(version.title)); validXML(result);
});
test('host-style opt-in adds an invisible native marker and one escaped content title without scripts', () => {
  for (const operation of ['working','published']) {
    const f = operation === 'published' ? published() : fixture();
    const result = storage.renderStorage(f.doc, f.version, people, {operation,hostStyleFlags:true});
    assert.match(result, /ac:name="anchor"[^>]*><ac:parameter ac:name="">wcs-page-style-v1<\/ac:parameter>/);
    assert.match(result, /<h1>Credit &lt;approval&gt;<\/h1>/);
    assert.equal((result.match(/<h1>/g)||[]).length,1);
    assert.doesNotMatch(result, /<script|citiStyleAdd|data-wcs-style-flags/);
    validXML(result);
    const legacy = storage.renderStorage(f.doc, f.version, people, {operation,hostStyleFlags:false});
    assert.doesNotMatch(legacy, /wcs-page-style-v1|<h1>/);
  }
});
test('working metadata identifies stable key and selected revision without claiming approval', () => {
  const { doc, version } = published();
  const result = storage.renderStorage(doc, version, people, { operation: 'working' });
  assert.match(result, /Document key.*wcs-doc-stable/); assert.match(result, /Source version.*<p>1<\/p>/); assert.match(result, /Source revision.*<p>2<\/p>/);
  assert.match(result, /Alex &amp; Co \(AM12345\)/); assert.match(result, /Working copy/); assert.match(result, /Not approved for publication/); assert.ok(!result.includes('Approved by')); validXML(result);
});
test('approved selected snapshot includes exact reviewer, approver and review date', () => {
  const { doc, version } = published();
  const result = storage.renderStorage(doc, version, people, { operation: 'published', areaLabel: 'Credit Approval Control' });
  assert.match(result, /Credit Approval Control/); assert.match(result, /Reviewed by/); assert.match(result, /Approved by/); assert.match(result, /Jordan Lee \(JL12345\)/); assert.match(result, /2028-10-15/); assert.ok(!result.includes('Not approved for publication')); validXML(result);
});
test('publication refuses stale approval, current pointer mismatch and unrelated key', () => {
  const f = published(); f.version.reviewedRevision = 1;
  assert.throws(() => storage.renderStorage(f.doc, f.version, people, { operation: 'published' }), /exact revision/);
  f.version.reviewedRevision = 2; f.doc.publishedVersion = 2;
  assert.throws(() => storage.renderStorage(f.doc, f.version, people, { operation: 'published' }), /current approved/);
  assert.throws(() => storage.renderStorage(f.doc, f.version, people, { documentKey: 'other' }), /does not match/);
});
test('draft cannot inherit stale approval display from an older revision', () => {
  const f = published(); f.version.status = 'Draft';
  const result = storage.renderStorage(f.doc, f.version, people);
  assert.ok(!result.includes('Approved by')); assert.ok(!result.includes('Reviewed by'));
  assert.throws(() => storage.renderStorage(f.doc, f.version, people, { operation: 'published' }), /approved snapshot/);
});
test('inline files, cover and supporting attachments receive revision-specific upload names', () => {
  const { doc, version } = fixture('![An image](attachment:image-1)\n\n[Evidence **file**](attachment:evidence)');
  version.assets = [{ id: 'image-1', src: data('image/png', 'imagebytes'), alt: 'Description' }];
  version.cover = { src: data('image/jpeg', 'coverbytes'), alt: 'Cover description', caption: 'Cover & caption' };
  version.attachments = [{ id: 'evidence', name: 'Evidence report.txt', mimeType: 'text/plain', size: 4, url: data('text/plain', 'test') }];
  const plan = storage.collectMedia(doc, version);
  assert.equal(plan.length, 3);
  plan.forEach(item => { assert.ok(Buffer.isBuffer(item.bytes)); assert.match(item.fileName, /^wcs-v1-r2-[a-f0-9]{16}-/); assert.equal(item.size, item.bytes.length); assert.match(item.sha256, /^[a-f0-9]{64}$/); });
  assert.equal(plan.find(item => item.key === '$cover').kind, 'cover');
  const result = storage.renderStorage(doc, version, people, { media: planMap(plan) });
  assert.match(result, /<ac:image ac:alt="An image"><ri:attachment/); assert.match(result, /<ac:link-body>Evidence <strong>file<\/strong>/); assert.match(result, /Supporting attachments/); assert.match(result, /Cover &amp; caption/); assert.ok(!result.includes('base64')); validXML(result);
  const revised = { ...version, revision: 3 };
  assert.notEqual(storage.collectMedia(doc, revised)[0].fileName, plan[0].fileName);
});
test('direct Markdown image data is discovered but examples inside code are not', () => {
  const src = data('image/png', 'direct-image');
  const { doc, version } = fixture('![Direct](' + src + ')\n\n`![example](https://unsafe.invalid/example.png)`\n\n```md\n![code](https://unsafe.invalid/code.png)\n```');
  const plan = storage.collectMedia(doc, version); assert.equal(plan.length, 1); assert.equal(plan[0].key, src); assert.match(plan[0].id, /^inline-/);
  const result = storage.renderStorage(doc, version, people, { media: planMap(plan) }); assert.match(result, /<ac:image/); assert.match(result, /code.png/); validXML(result);
});
test('remote images and files fail until explicitly staged by the trusted publisher', () => {
  const { doc, version } = fixture('![Remote](https://example.com/image.png)');
  assert.throws(() => storage.collectMedia(doc, version), /external image\/file URLs are not fetched/);
  assert.throws(() => storage.renderStorage(doc, version, people), /Stage the document image/);
  const media = { 'https://example.com/image.png': { fileName: 'approved-image.png' } };
  assert.deepEqual(storage.collectMedia(doc, version, { media }), []);
  const result = storage.renderStorage(doc, version, people, { media }); assert.ok(!result.includes('https://example.com/image.png')); assert.match(result, /approved-image.png/);
  version.attachments = [{ id: 'file', name: 'File.pdf', url: 'https://example.com/file.pdf', mimeType: 'application/pdf', size: 10 }];
  assert.throws(() => storage.collectMedia(doc, version, { media }), /external image\/file/);
});
test('rendering cannot silently omit unused resources or missing attachment references', () => {
  const f = fixture(); f.version.assets = [{ id: 'unused', src: data('image/png', 'image'), alt: 'Unused image' }];
  assert.throws(() => storage.renderStorage(f.doc, f.version, people), /Stage the document image/);
  const missing = fixture('[File](attachment:absent)'); assert.throws(() => storage.renderStorage(missing.doc, missing.version, people), /missing/);
});
test('SharePoint recording is a validated native link and pasted iframe HTML is literal text', () => {
  const url = 'https://company.sharepoint.com/sites/training/recording.mp4';
  const { doc, version } = fixture('@[video](' + url + ' "Recorded training")\n\n<iframe src="javascript:alert(1)"></iframe>');
  const result = storage.renderStorage(doc, version, people); assert.match(result, /Watch recording: Recorded training \(SharePoint\)/); assert.match(result, /href="https:\/\/company.sharepoint.com/); assert.ok(!result.includes('<iframe')); assert.match(result, /&lt;iframe/); validXML(result);
});
test('raw HTML, unsafe links, XML metacharacters and CDATA termination cannot execute', () => {
  const f = fixture('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[good](https://example.com/?a=1&b=2)\n\n```xml\n</ac:plain-text-body> ]]> <script>\n```');
  f.doc.id = 'stable<&"key'; f.version.summary = 'Summary <script> & "quotes"';
  const result = storage.renderStorage(f.doc, f.version, people);
  assert.ok(!result.includes('href="javascript:')); assert.match(result, /&lt;script&gt;alert/); assert.match(result, /href="https:\/\/example.com\/\?a=1&amp;b=2"/); assert.match(result, /\]\]\]\]><!\[CDATA\[>/); assert.match(result, /stable&lt;&amp;&quot;key/); validXML(result);
});
test('unsupported URL schemes and invalid staged filenames are refused', () => {
  const f = fixture('![Image](attachment:img)'); f.version.assets = [{ id: 'img', src: 'https://example.com/image.png', alt: 'Image' }];
  assert.throws(() => storage.renderStorage(f.doc, f.version, people, { media: { img: { fileName: '../image.png' } } }), /plain Confluence/);
  f.version.assets[0].src = 'javascript:alert(1)'; assert.throws(() => storage.collectMedia(f.doc, f.version), /HTTPS URL/);
});
test('malformed file data, duplicate IDs and invalid XML characters fail before publishing', () => {
  const f = fixture(); f.version.attachments = [{ id: 'file', name: 'File.txt', url: 'data:text/plain;base64,dGVzdA==', mimeType: 'text/plain', size: 3 }];
  assert.throws(() => storage.collectMedia(f.doc, f.version), /MIME type and size must match/);
  f.version.attachments[0].size = 4; f.version.assets = [{ id: 'file', src: data('image/png', 'image'), alt: 'Image' }];
  assert.throws(() => storage.collectMedia(f.doc, f.version), /unique/);
  const invalid = fixture('Text\u0001control'); assert.throws(() => storage.renderStorage(invalid.doc, invalid.version, people), /unsupported by XML/);
});
test('section-only legacy documents remain readable and selected version is used', () => {
  const f = fixture(); delete f.version.bodyMarkdown; f.version.sections = [{ id: 'one', title: 'Before you begin', paragraphs: ['Use the source.'], bullets: ['First check', 'Second check'] }];
  f.doc.versions.push({ ...f.version, version: 2, revision: 1, bodyMarkdown: 'Other content that must not appear.' });
  const result = storage.renderStorage(f.doc, f.version, people); assert.match(result, /Before you begin/); assert.match(result, /First check/); assert.ok(!result.includes('Other content'));
});
test('governance fields, safe source links and tags are rendered from the selected snapshot', () => {
  const f = fixture(); f.version.governance = { classification: 'other-nhd', owningTeam: 'WCS & Controls', scope: 'Approval assistance', audience: 'Analysts', reviewBasis: 'business-best-practice', reviewMonths: 24, sources: [{ id: 'source-a', title: 'Authoritative source', url: 'https://example.com/source', version: '2', lastVerifiedAt: '2026-10-15' }] }; f.version.tags = ['Credit', 'Controls']; f.version.regions = ['EMEA'];
  const result = storage.renderStorage(f.doc, f.version, people); assert.match(result, /WCS &amp; Controls/); assert.match(result, /Credit, Controls/); assert.match(result, /EMEA/); assert.match(result, /Authoritative sources/); assert.match(result, /business review target is best practice/); validXML(result);
});


test('approved comment setting is stored atomically with the native content as a single anchor and metadata row', () => {
  for(const enabled of [true,false]){
    const {doc,version}=published();doc.type='Blog';version.commentsEnabled=enabled;
    const html=storage.renderStorage(doc,version,people,{operation:'published'});validXML(html);
    assert.equal((html.match(/wcs-comments-v1-/g)||[]).length,1);
    assert.ok(html.includes('>wcs-comments-v1-'+(enabled?'enabled':'disabled')+'</ac:parameter>'));
    assert.ok(html.includes('Article comments</p></th><td><p>'+(enabled?'Enabled':'Disabled')));
  }
  const {doc,version}=published();version.commentsEnabled='false';assert.throws(()=>storage.renderStorage(doc,version,people,{operation:'published'}),/commentsEnabled/);
});
