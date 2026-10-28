const test = require('node:test');
const assert = require('node:assert/strict');
const exportsModule = require('./document-export.js');
const fixture = () => ({
  doc: { id: 'doc-permanent-key', reference: 'WCS-JA-001', type: 'Job aid', area: 'credit-approval-control', ownerId: 'author', authorId: 'author', publishedVersion: 1, audit: [{ comment: 'PRIVATE REVIEW COMMENT' }], versions: [{ title: 'PRIVATE DRAFT' }] },
  version: { version: 1, revision: 2, title: 'Credit approval checklist', summary: 'Prepare a complete operational record.', status: 'Published', bodyMarkdown: '## Prepare the record\n\nA **bold** and *italic* instruction with <u>underlining</u> and ~~correction~~.\n\n1. First step\n2. Second step\n   - Nested check\n\n| Control | Evidence |\n| --- | --- |\n| Identity | Confirmed |', createdAt: '2026-10-01T09:00:00Z', reviewedBy: 'reviewer', reviewedAt: '2026-10-02T10:00:00Z', approvedBy: 'reviewer', approvedAt: '2026-10-03T10:00:00Z', effectiveAt: '2026-10-04T10:00:00Z', nextReviewAt: '2027-04-04T10:00:00Z', tags: ['Credit'], processes: ['Approval'], regions: ['Global'], attachments: [], assets: [], changeSummary: 'PRIVATE CHANGE REASON' },
  people: [{ id: 'author', name: 'Alex Morgan', soeid: 'am12345' }, { id: 'reviewer', name: 'Jordan Lee', soeid: 'jl12345' }],
  sourceUrl: 'https://confluence.example/confluence/display/WCS/Document#/document/doc-permanent-key', areaLabel: 'Credit Approval Control', exportedAt: '2026-10-15T10:00:00Z', isCurrentPublished: true
});
test('export model contains exact selected snapshot and truthful controls without private history', () => {
  const model = exportsModule.buildModel(fixture());
  assert.equal(model.version, 1); assert.equal(model.revision, 2); assert.equal(model.business, 'Credit Approval Control');
  assert.equal(model.owner.soeid, 'AM12345'); assert.equal(model.approval.name, 'Jordan Lee'); assert.equal(model.approval.date, '2026-10-03 (UTC)');
  assert.equal(model.versionDateLabel, 'Version created'); assert.equal(model.isCurrentPublished, true);
  assert.doesNotMatch(JSON.stringify(model), /PRIVATE/);
});
test('explicit revision date is used without pretending created date is edit date', () => {
  const input = fixture(); input.revisionAt = '2026-10-02T09:30:00Z';
  assert.equal(exportsModule.buildModel(input).versionDate, '2026-10-02 (UTC)');
  assert.equal(exportsModule.buildModel(input).versionDateLabel, 'Revision date');
});
test('draft and superseded exports retain own approval state and cannot look current', () => {
  const input = fixture(); input.version.status = 'Draft'; input.version.approvedBy = null; input.version.approvedAt = null; input.isCurrentPublished = false;
  const model = exportsModule.buildModel(input); assert.equal(model.approval.name, 'Not recorded'); assert.equal(model.isCurrentPublished, false);
});
test('structured tree retains headings, emphasis, lists, nested lists, and Markdown tables', () => {
  const model = exportsModule.buildModel(fixture());
  assert.equal(model.blocks[0].type, 'heading');
  const runs = model.blocks[1].runs;
  assert(runs.some(x => x.bold && x.text === 'bold')); assert(runs.some(x => x.italic && x.text === 'italic'));
  assert(runs.some(x => x.underline && x.text === 'underlining')); assert(runs.some(x => x.strike && x.text === 'correction'));
  assert.equal(model.blocks[2].type, 'list'); assert.equal(model.blocks[2].ordered, true); assert.equal(model.blocks[2].items[1][1].type, 'list');
  assert.equal(model.blocks[3].type, 'table'); assert.equal(model.blocks[3].rows[0].header, true); assert.equal(model.blocks[3].rows[1].cells[1].runs[0].text, 'Confirmed');
});
test('canonical Markdown does not duplicate legacy sections or revive empty Markdown', () => {
  const input = fixture(); input.version.bodyMarkdown = ''; input.version.sections = [{ title: 'STALE', paragraphs: ['STALE'], bullets: [] }];
  assert.deepEqual(exportsModule.buildModel(input).blocks, []);
});
test('legacy sections become structured content when canonical Markdown is absent', () => {
  const input = fixture(); delete input.version.bodyMarkdown; input.version.sections = [{ title: 'Overview', paragraphs: ['Hello'], bullets: ['Check'] }];
  const model = exportsModule.buildModel(input); assert.equal(model.blocks[0].type, 'heading'); assert.equal(model.blocks[2].type, 'list');
});
test('images and attached files resolve against source URL, preserving labels', () => {
  const input = fixture(); input.version.bodyMarkdown = '![Evidence](attachment:evidence)\n\n[Checklist](attachment:checklist)';
  input.version.assets = [{ id: 'evidence', src: '/confluence/download/attachments/1/evidence.png', alt: 'Evidence' }];
  input.version.attachments = [{ id: 'checklist', name: 'checklist.pdf', url: '/confluence/download/attachments/1/checklist.pdf', mimeType: 'application/pdf', size: 100 }];
  const m = exportsModule.buildModel(input); assert.equal(m.blocks[0].runs[0].image, 'https://confluence.example/confluence/download/attachments/1/evidence.png');
  assert.equal(m.blocks[1].runs[0].href, m.attachments[0].href);
});
test('embedded local attachment bytes are never dumped into Office links', () => {
  const input = fixture(); input.version.bodyMarkdown = '[Attachment](attachment:file)';
  input.version.attachments = [{ id: 'file', name: 'example.txt', url: 'data:text/plain;base64,aGVsbG8=', mimeType: 'text/plain', size: 5 }];
  const model = exportsModule.buildModel(input); assert.equal(model.attachments[0].local, true); assert.equal(model.attachments[0].href, null); assert.doesNotMatch(JSON.stringify(model), /aGVsbG8/);
});
test('missing media references fail explicitly before generation', () => {
  const input = fixture(); input.version.bodyMarkdown = '![Missing](attachment:missing)'; assert.throws(() => exportsModule.buildModel(input), /missing/);
});
test('unsafe raw HTML stays literal and cannot become active export markup', () => {
  const input = fixture(); input.version.bodyMarkdown = '<script>alert(1)</script>\n\n[Bad](javascript:alert(1))';
  const tree = exportsModule.buildModel(input).blocks; assert(tree[0].runs.some(x => x.text.includes('<script>'))); assert(!tree.flatMap(x => x.runs || []).some(x => x.href));
});
test('embedded resources become readable links and fenced examples stay text', () => {
  const input = fixture(); input.version.bodyMarkdown = '@[embed](https://example.com/video)\n\n```js\nconst value = 1;\n```';
  const m = exportsModule.buildModel(input); assert.equal(m.blocks[0].runs[0].href, 'https://example.com/video'); assert.equal(m.blocks[1].type, 'code');
});
test('recorded trainings export as readable links preserving quoted Unicode titles', () => {
  const input = fixture(), content = require('./editor-content.js');
  const title = 'Review “résumé” — "Q&A" \\ notes';
  const url = 'https://citi.sharepoint.com/sites/WCS/_layouts/15/embed.aspx?UniqueId=01234567-89ab-cdef-0123-456789abcdef';
  const token = content.videoMarkdown({url, title});
  input.version.bodyMarkdown = token + '\n\n`' + token + '`\n\n```md\n' + token + '\n```';
  const model = exportsModule.buildModel(input), run = model.blocks[0].runs[0];
  assert.equal(run.text, 'Watch recording: ' + title); assert.equal(run.href, url);
  assert.deepEqual(Object.keys(run).sort(), ['href', 'text']);
  assert.equal(model.blocks[1].runs[0].code, true); assert.equal(model.blocks[1].runs[0].text, token);
  assert.equal(model.blocks[2].type, 'code'); assert.equal(model.blocks[2].text, token);
  assert.doesNotMatch(JSON.stringify(model), /<iframe|<video|embedUrl/);
  const definition = exportsModule.pdfDefinition(model, {logo: {dataUrl: 'data:image/png;base64,test', width: 20, height: 20}});
  assert.match(JSON.stringify(definition), /Watch recording/); assert.match(JSON.stringify(definition), /sharepoint\.com/);
});
test('invalid recording syntax cannot create an active export resource', () => {
  const input = fixture(); input.version.bodyMarkdown = '@[video](javascript:alert(1) "Unsafe")\n\n<iframe src="https://citi.sharepoint.com/recording"></iframe>';
  const runs = exportsModule.buildModel(input).blocks.flatMap(block => block.runs || []);
  assert(!runs.some(run => run.href || run.image)); assert(runs.some(run => run.text.includes('<iframe')));
});
test('PDF definition requires every referenced image and retains selectable content', () => {
  const m = exportsModule.buildModel(fixture()); assert.throws(() => exportsModule.pdfDefinition(m, {}), /logo/);
  const def = exportsModule.pdfDefinition(m, { logo: { dataUrl: 'data:image/png;base64,test', width: 20, height: 20 } });
  assert.equal(def.pageSize, 'A4'); assert(def.content.some(x => x.text === m.title)); assert(def.content.some(x => x.table && x.table.headerRows === 1));
  assert.doesNotMatch(JSON.stringify(def), /PRIVATE/);
});
test('export filename is safe, stable, version-specific and never JSON', async () => {
  const m = exportsModule.buildModel(fixture()); assert.equal(exportsModule.filename(m, 'docx'), 'WCS-JA-001-Credit-approval-checklist-v1-r2.docx');
  await assert.rejects(exportsModule.create(fixture()).prepare('json'), /PDF or Word/);
});
test('valid local prototype source is allowed but unsafe source is rejected', () => {
  const input = fixture(); input.sourceUrl = 'file:///tmp/WCSpedia-prototype.html#/document/test'; assert.match(exportsModule.buildModel(input).sourceUrl, /^file:/);
  input.sourceUrl = 'javascript:alert(1)'; assert.throws(() => exportsModule.buildModel(input), /source document URL/);
});
function browserModule(extra = {}) {
  const vm = require('node:vm'), fs = require('node:fs');
  const browser = Object.assign({ WCSMarkdownIt: require('./vendor/markdown-it-15.0.2.min.js'), WCSEditorContent: require('./editor-content.js'), URL, Map, Set, Blob, AbortController, setTimeout, clearTimeout, location: { href: 'https://confluence.example/confluence/test', origin: 'https://confluence.example' } }, extra);
  vm.createContext(browser); vm.runInContext(fs.readFileSync(require.resolve('./document-export.js'), 'utf8'), browser);
  return browser.WCSDocumentExport;
}
test('library loader rejects arbitrary third-party scripts and disabled CDN', async () => {
  const api = browserModule(); const input = fixture(); input.config = { docxUrl: 'https://untrusted.example/unsafe.js' };
  await assert.rejects(api.create(input).prepare('docx'), /same-origin attachment/);
  input.config = { allowCDN: true, pdfMakeUrl: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js' }; await assert.rejects(api.create(input).prepare('pdf'), /same-origin attachment/);
});
test('Attachment failures are reported, failed script is removed and a retry is possible', async () => {
  let requests = 0, removed = 0;
  const api = browserModule({ document: { createElement() { return { setAttribute() {}, remove() { removed++; } }; }, head: { appendChild(node) { requests++; setTimeout(() => node.onerror(), 0); } } } });
  await assert.rejects(api.create(fixture()).prepare('docx'), /could not be loaded/);
  await assert.rejects(api.create(fixture()).prepare('docx'), /could not be loaded/);
  assert.equal(requests, 2); assert.equal(removed, 2);
});
test('unavailable logo fails explicitly without generating a document', async () => {
  let generated = false;
  const api = browserModule({ docx: { Packer: { toBlob() { generated = true; } } }, fetch: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(api.create(fixture()).prepare('docx'), /image could not be loaded \(404\)/); assert.equal(generated, false);
});
test('oversized image content-length is rejected before consuming response body', async () => {
  let read = false;
  const api = browserModule({ docx: { Packer: {} }, fetch: async () => ({ ok: true, headers: { get: () => String(6 * 1024 * 1024) }, blob() { read = true; } }) });
  await assert.rejects(api.create(fixture()).prepare('docx'), /5 MB/); assert.equal(read, false);
});
module.exports = { fixture };

test('PDF note and footer omit uncontrolled wording while retaining reference and page numbering',()=>{
 const model=exportsModule.buildModel(fixture()),pdf=exportsModule.pdfDefinition(model,{logo:{dataUrl:'data:image/png;base64,test',width:10,height:10}});
 const output=JSON.stringify([model,pdf.content,pdf.footer(2,4)]);
 assert.doesNotMatch(output,/uncontrolled/i);assert.match(output,/WCS-JA-001/);assert.match(JSON.stringify(pdf.footer(2,4)),/2.*4/);
});
