/* Integration smoke against the exact pinned browser builds. No browser automation.
 * WCS_EXPORT_DEPS=/tmp/wcs-export-deps <bundled node> tests/export-generation.cjs [output directory]
 * See EXPORTS.md for downloading the three official npm browser artifacts. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const x = require('../document-export.js');
const dir = process.env.WCS_EXPORT_DEPS || path.resolve(__dirname,'../vendor');
const local = !process.env.WCS_EXPORT_DEPS;
if (!dir) throw new Error('Set WCS_EXPORT_DEPS to the directory containing pinned pdfmake.cjs, vfs_fonts.cjs, and docx.iife.js.');
// Execute the actual IIFE browser artifact (the UMD .cjs has a blocked script
// MIME type on jsDelivr). This is library evaluation, not browser automation.
const vm = require('node:vm');
const context = { TextEncoder, TextDecoder, Blob, Buffer, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setImmediate, clearImmediate, atob, btoa };
vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(dir, local ? 'docx-9.5.1.iife.js' : 'docx.iife.js'), 'utf8'), context);
const d = context.docx;
const pdf = require(path.join(dir, local ? 'pdfmake-0.2.20.min.js' : 'pdfmake.cjs'));
pdf.addVirtualFileSystem(require(path.join(dir, local ? 'pdfmake-0.2.20-vfs-fonts.js' : 'vfs_fonts.cjs')));
const output = path.resolve(process.argv[2] || '/tmp/wcspedia-export-qa');
fs.mkdirSync(output, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../assets/citi-logo.png')).toString('base64');
const pixel = { dataUrl: logo, width: 816, height: 472 };
const input = {
  doc: { id: 'export-test-permanent-key', reference: 'WCS-JA-001', type: 'Job aid', area: 'credit-approval-control', ownerId: 'alex', authorId: 'alex', publishedVersion: 1, audit: [{ comment: 'PRIVATE AUDIT VALUE MUST NEVER LEAK' }] },
  version: { version: 1, revision: 3, title: 'Credit approval checklist', summary: 'A practical checklist for preparing a complete approval record and a clear operational handover.', status: 'Published', bodyMarkdown: '## Prepare the approval record\n\nBring the request, supporting information and current document references into one record before handing it to the reviewer.\n\n1. Confirm the borrower and facility identifiers against the source record.\n2. Record the purpose of the request and the owner of each outstanding item.\n   - Check the supporting evidence.\n   - Confirm the receiving team.\n\n## Confirm the review evidence\n\n| Control | Required evidence | Owner |\n| --- | --- | --- |\n| Identity | Borrower and facility references | Author |\n| Approval | Recorded decision and approval date | Manager |\n| Handover | Receiving-team acknowledgement | Operations |\n\nUse **clear descriptions**, *current evidence*, and <u>traceable references</u>. [Open the source checklist](https://example.com/checklist).\n\n> Review the complete record before proceeding.\n\n## Record the handover\n\nKeep a clear record of what has been checked, what is outstanding and which team receives the next action.', assets: [], attachments: [{ id: 'checklist', name: 'supporting-checklist.pdf', url: 'https://example.com/checklist.pdf', mimeType: 'application/pdf', size: 100 }], createdAt: '2026-10-01T09:00:00Z', reviewedBy: 'jordan', reviewedAt: '2026-10-03T09:00:00Z', approvedBy: 'jordan', approvedAt: '2026-10-04T09:00:00Z', effectiveAt: '2026-10-04T09:00:00Z', nextReviewAt: '2027-04-01T09:00:00Z', tags: ['Operational guidance', 'Job aid'], processes: ['Credit approval', 'Control evidence'], regions: ['Global'] },
  people: [{ id: 'alex', name: 'Alex Morgan', soeid: 'AM12345' }, { id: 'jordan', name: 'Jordan Lee', soeid: 'JL12345' }], areaLabel: 'Credit Approval Control', sourceUrl: 'https://confluence.example/confluence/pages/viewpage.action?pageId=12345', exportedAt: '2026-10-15T12:00:00Z', revisionAt: '2026-10-02T10:00:00Z', isCurrentPublished: true
};
input.version.governance = require('../governance.js').normalize({
  classification: 'other-nhd', owningTeam: 'Credit Operations', scope: 'Practical guidance on preparing an existing approval record.', audience: 'Credit Operations colleagues', supportingTeam: 'Learning and Development', classificationRationale: 'This job aid explains the existing task and refers to its authoritative source.',
  sources: [{ id: 'credit-reference', title: 'Credit operations reference', url: 'https://example.com/credit-reference', version: '3.2', lastVerifiedAt: '2026-10-01T09:00:00Z' }]
});
function zipEntry(buffer, wanted) {
  const zlib = require('node:zlib');
  for (let at = 0; at < buffer.length - 46; at++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(at + 28), name = buffer.subarray(at + 46, at + 46 + length).toString();
    if (name !== wanted) continue;
    const offset = buffer.readUInt32LE(at + 42), size = buffer.readUInt32LE(at + 20), start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28), compressed = buffer.subarray(start, start + size);
    return (buffer.readUInt16LE(at + 10) === 8 ? zlib.inflateRawSync(compressed) : compressed).toString();
  }
  throw Error('Missing DOCX entry: ' + wanted);
}
async function generate(name, options, media) {
  const model = x.buildModel(options);
  const word = await d.Packer.toBuffer(x.wordDocument(model, media, d));
  const pdfBytes = await new Promise((resolve, reject) => { try { pdf.createPdf(x.pdfDefinition(model, media)).getBuffer(resolve); } catch (error) { reject(error); } });
  const documentXML = zipEntry(word, 'word/document.xml'), relationships = zipEntry(word, 'word/_rels/document.xml.rels');
  for (const term of ['Governance', 'Other NHD', 'Owning team', 'Intended audience', 'Classification rationale', 'Business best practice', 'Authoritative sources', '2026-10-01T09:00:00Z']) assert(documentXML.includes(term), 'Word export retains ' + term);
  for (const source of model.governance.sources) { assert(documentXML.includes(source.id)); assert(relationships.includes(source.url)); }
  assert.doesNotMatch(documentXML, /PRIVATE AUDIT/);
  assert.equal(word.subarray(0, 2).toString(), 'PK'); assert.equal(Buffer.from(pdfBytes).subarray(0, 5).toString(), '%PDF-');
  fs.writeFileSync(path.join(output, name + '.docx'), word); fs.writeFileSync(path.join(output, name + '.pdf'), pdfBytes);
  console.log(name + ': editable DOCX ' + word.length + ' bytes; PDF ' + pdfBytes.length + ' bytes');
}
(async () => {
  await generate('document-export', input, { logo: pixel });
  const stress = structuredClone(input);
  stress.version.title = 'Document export layout verification';
  stress.version.governance.scope = 'Long scope text remains readable across pages. '.repeat(40);
  stress.version.governance.sources = Array.from({length:30}, (_,index)=>({id:'source-'+(index+1),title:'Authoritative source '+(index+1),url:'https://example.com/source-'+(index+1),version:'3.2',lastVerifiedAt:'2026-10-01T09:00:00Z'}));
  stress.version.bodyMarkdown = '## Image and formatting\n\n![Citi logo for image layout verification](attachment:figure)\n\n### Operating checks\n\n' + Array.from({ length: 5 }, (_, i) => (i + 1) + '. Check and record the evidence for this step.\n   - Supporting detail retained for the reviewer.').join('\n') + '\n\n## Repeated table headers\n\n| Item | Check | Owner | Evidence |\n| --- | --- | --- | --- |\n' + Array.from({ length: 44 }, (_, i) => '| ' + (i + 1) + ' | Review the current record and confirm that the handover is complete. | Operations | Supporting evidence and references for control ' + (i + 1) + ' |').join('\n') + '\n\n## Final notes\n\n' + Array.from({ length: 5 }, () => 'This paragraph confirms that content continues after the table without clipping or missing text.').join('\n\n');
  stress.version.assets = [{ id: 'figure', src: logo, alt: 'Citi logo for image layout verification' }];
  await generate('document-export-stress', stress, { logo: pixel, [logo]: pixel });
  console.log('Export generation smoke passed. Render all four files for visual QA.');
})().catch(error => { console.error(error); process.exitCode = 1; });
