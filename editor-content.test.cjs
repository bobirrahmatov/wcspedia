'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./editor-content.js');

test('Markdown renders editorial structure and derives a plain-text search projection', () => {
  const source = '## Before you start\n\nRead the **source record** and [the guide](https://example.com/guide).\n\n1. Confirm the owner.\n2. Record the decision.\n\n### Evidence\n\n> Keep the _approved_ record.';
  const html = E.render(source);
  assert.match(html, /<h2 id="before-you-start">/);
  assert.match(html, /<strong>source record<\/strong>/);
  assert.match(html, /<ol><li>Confirm the owner\.<\/li>/);
  assert.match(html, /<blockquote><p>Keep the <em>approved<\/em> record\.<\/p><\/blockquote>/);
  assert.deepEqual(E.toSections(source), [
    { id: 'before-you-start', title: 'Before you start', paragraphs: ['Read the source record and the guide.'], bullets: ['Confirm the owner.', 'Record the decision.'] },
    { id: 'evidence', title: 'Evidence', paragraphs: ['Keep the approved record.'], bullets: [] }
  ]);
});

test('raw HTML, script tags and unsafe link targets never become active markup', () => {
  const html = E.render('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n[Run](javascript:alert) [Data](data:text/html,boom) [Network](//evil.example) [Safe](https://example.com?q=one&two=2)');
  assert.doesNotMatch(html, /<(?:img|script)|href="(?:javascript:|data:|\/\/)/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="https:\/\/example.com\?q=one&amp;two=2"/);
});

test('inline formatting escapes attribute injection, supports code, and preserves untrusted quotes as text', () => {
  const html = E.render('**<svg onload=alert(1)>**\n\n[quote](https://example.com/"onclick="bad)\n\n`<script>unsafe</script>`');
  assert.doesNotMatch(html, /<svg|<script|onclick="bad/);
  assert.match(html, /<code>&lt;script&gt;unsafe&lt;\/script&gt;<\/code>/);
});

test('legacy sections export and import literal Markdown punctuation without changing text', () => {
  const sections = [{ id: 'checks', title: 'Checks', paragraphs: ['Use **literal** [data] and <b> text.'], bullets: ['One _literal_ field.'] }];
  assert.deepEqual(E.toSections(E.fromSections(sections)), sections);
  assert.doesNotMatch(E.render(E.fromSections(sections)), /<strong>|<em>|<b>/);
});

test('heading IDs stay unique and match the search projection when an introduction precedes headings', () => {
  const source = 'Introduction.\n\n## Overview\n\nFirst.\n\n## Overview\n\nSecond.';
  const sections = E.toSections(source), html = E.render(source);
  assert.deepEqual(sections.map(s => s.id), ['overview', 'overview-2', 'overview-3']);
  sections.forEach(s => assert.ok(html.includes('id="' + s.id + '"')));
});

test('body validation rejects empty and oversized content before rendering', () => {
  assert.throws(() => E.toSections(' '), /required/);
  assert.throws(() => E.render('a'.repeat(200001)), /200,000/);
  assert.throws(() => E.render('Invalid\u0000body'), /invalid character/);
  assert.deepEqual(E.toSections('## Empty heading'), []);
});

test('cover validation accepts raster files and scoped paths with descriptive alt text', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(E.validateCover({ src: png, alt: '  Blue abstract lines  ' }), { src: png, alt: 'Blue abstract lines', caption: '' });
  for (const src of ['/confluence/download/attachments/123/cover.jpg', './assets/cover.jpg', 'https://example.com/cover.jpg']) {
    assert.equal(E.validateCover({ src, alt: 'An office', caption: 'Author photo' }).src, src);
  }
  assert.equal(E.validateCover(null), null);
});

test('cover validation rejects executable images, malformed data, credentials and missing alt text', () => {
  const invalid = ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zy8+', '//example.com/image.png', 'http://example.com/cover.png', 'https://user:pass@example.com/photo.png', 'data:image/png;base64,xx', '/\\evil.example/photo.png'];
  for (const src of invalid) assert.throws(() => E.validateCover({ src, alt: 'Image' }), /image|URL|PNG/);
  assert.throws(() => E.validateCover({ src: '/cover.png', alt: ' ' }), /accessibility/);
  assert.throws(() => E.validateCover({ src: '/cover.png', alt: 'Cover', onerror: 'bad' }), /only src/);
  assert.throws(() => E.validateCover({ src: 'data:image/png;base64,' + Buffer.alloc(1024 * 1024 + 1).toString('base64'), alt: 'Cover' }), /1 MB/);
});

test('Markdown export includes title, excerpt, highlights, cover and canonical body', () => {
  const version = { title: 'A procedure', summary: 'A concise excerpt.', bodyMarkdown: '## Steps\n\n1. Check the source.', highlights: ['Keep evidence.'], cover: { src: '/cover.png', alt: 'Blue lines', caption: 'Cover illustration' } };
  const text = E.toMarkdown(version);
  assert.ok(text.startsWith('# A procedure\n\nA concise excerpt.'));
  assert.match(text, /## Key highlights\n\n- Keep evidence\./);
  assert.match(text, /!\[Blue lines\]\(\/cover.png\)/);
  assert.ok(text.endsWith('## Steps\n\n1. Check the source.\n'));
});

test('complete Markdown supports nested lists, tables, fenced code, dividers and underline safely', () => {
  const md = '## Rich content\n\n<u>Underline **and bold**</u> with ~~removed~~ text.\n\n1. Parent\n   - Nested child\n     - Deep child\n\n| Owner | Decision |\n| :--- | ---: |\n| Alex | **Review** |\n\n```javascript\nconst value = "<script>";\n```\n\n---';
  const html = E.render(md);
  assert.match(html, /<u>Underline <strong>and bold<\/strong><\/u>/);
  assert.match(html, /<s>removed<\/s>/);
  assert.match(html, /<ol>[\s\S]*<ul>[\s\S]*<ul>/);
  assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(html, /<pre><code class="language-javascript">const value = &quot;&lt;script&gt;&quot;;/);
  assert.match(html, /<hr>/);
  const sections = E.toSections(md);
  assert.deepEqual(sections[0].bullets, ['Parent', 'Nested child', 'Deep child']);
  assert.ok(sections[0].paragraphs.includes('Alex | Review'));
  assert.ok(sections[0].paragraphs.includes('const value = "<script>";'));
});

test('version-owned images and file links resolve only against validated resource IDs', () => {
  const version = { assets: [{ id: 'diagram', src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'A workflow diagram' }], attachments: [{ id: 'checklist', name: 'checklist.md', mimeType: 'text/markdown', size: 6, url: 'data:text/markdown;base64,IyBUZXN0' }] };
  const md = '![Workflow](attachment:diagram)\n\n[Download checklist](attachment:checklist)';
  assert.equal(E.validateReferences(md, version), true);
  const html = E.render(md, version);
  assert.match(html, /<img src="data:image\/png;base64,iVBORw0KGgo=" alt="Workflow" data-asset-id="diagram"/);
  assert.match(html, /href="data:text\/markdown;base64,IyBUZXN0"[^>]*download="checklist.md" data-attachment-id="checklist"/);
  assert.doesNotMatch(E.render(md), /<img|href="attachment:/);
  assert.throws(() => E.validateReferences(md, {}), /missing: attachment:diagram/);
  assert.throws(() => E.validateReferences('![Wrong type](attachment:checklist)', version), /missing/);
});

test('external images and embeds accept safe URLs without injecting iframe or raw attributes', () => {
  const html = E.render('![An office](https://example.com/image.png)\n\n@[embed](https://example.com/video)\n\n<u onmouseover="bad">unsafe</u>\n\n<iframe src="https://example.com"></iframe>\n\n![Bad](javascript:alert(1))\n\n@[embed](javascript:alert)');
  assert.match(html, /<img src="https:\/\/example.com\/image.png" alt="An office"/);
  assert.match(html, /data-embed-url="https:\/\/example.com\/video"/);
  assert.doesNotMatch(html, /<iframe|<u onmouseover|src="javascript:|href="javascript:/);
  assert.match(html, /&lt;iframe/);
});

test('asset and attachment validation bounds sizes and blocks active or malformed upload formats', () => {
  assert.throws(() => E.validateAssets([{ id: 'x', src: 'data:image/svg+xml;base64,PHN2Zy8+', alt: 'Unsafe vector' }]), /PNG/);
  assert.throws(() => E.validateAssets([{ id: 'x', src: '/x.png', alt: 'X', onclick: 'bad' }]), /only/);
  assert.throws(() => E.validateAssets([{ id: 'x', src: '/x.png', alt: 'X' }, { id: 'x', src: '/y.png', alt: 'Y' }]), /unique/);
  const file = { id: 'file', name: 'notes.txt', mimeType: 'text/plain', size: 4, url: 'data:text/plain;base64,VGVzdA==' };
  assert.deepEqual(E.validateAttachments([file]), [file]);
  assert.throws(() => E.validateAttachments([{ ...file, mimeType: 'text/html', name: 'notes.html', url: 'data:text/html;base64,VGVzdA==' }]), /correct file extension/);
  assert.throws(() => E.validateAttachments([{ ...file, name: '../notes.txt' }]), /filename/);
  assert.throws(() => E.validateAttachments([{ ...file, size: 5 }]), /must match/);
  assert.throws(() => E.validateAttachments([{ ...file, url: 'https://user:pass@example.com/file.txt' }]), /HTTPS/);
  assert.throws(() => E.validateAttachments([{ ...file, name: 'notes.txt.exe' }]), /extension/);
  assert.throws(() => E.validateAttachments([{ ...file, size: 5 * 1024 * 1024 + 1 }]), /5 MB/);
  assert.throws(() => E.render('Hello', { assets: [{ id: 'file', src: '/x.png', alt: 'X' }], attachments: [file] }), /unique across/);
});

test('taxonomy is bounded, normalized and deduplicated without allowing non-text values', () => {
  assert.deepEqual(E.validateTags(['  Credit  ', 'credit', 'EMEA']), ['Credit', 'EMEA']);
  assert.throws(() => E.validateTags([' ']), /non-empty/);
  assert.throws(() => E.validateTags([{}]), /non-empty/);
  assert.throws(() => E.validateTags(Array(31).fill('x')), /30/);
  assert.throws(() => E.validateTags(Array(21).fill('x'), 'regions'), /20/);
});

test('Markdown export resolves versioned image and attachment references and includes classification', () => {
  const md = E.toMarkdown({ title: 'Guide', summary: 'Summary.', bodyMarkdown: '![Flow](attachment:diagram)\n\n@[embed](https://example.com/course)', assets: [{ id: 'diagram', src: '/confluence/download/attachments/123/flow.png?version=2', alt: 'Flow' }], attachments: [{ id: 'manual', name: 'manual.pdf', mimeType: 'application/pdf', size: 20, url: 'https://example.com/manual.pdf?version=3' }], tags: ['Credit'], processes: ['Origination'], regions: ['EMEA'] });
  assert.match(md, /!\[Flow\]\(\/confluence\/download\/attachments\/123\/flow.png\?version=2\)/);
  assert.match(md, /\[Open embedded resource\]\(https:\/\/example.com\/course\)/);
  assert.match(md, /\*\*Processes:\*\* Origination/);
  assert.match(md, /\*\*Regions:\*\* EMEA/);
  assert.match(md, /## Attachments[\s\S]*\[manual.pdf\]/);
  assert.doesNotMatch(md, /attachment:diagram/);
});

test('portable export preserves media-reference examples inside inline and fenced code', () => {
  const bodyMarkdown = '## Example\n\nUse `[Guide](attachment:guide)` as syntax.\n\n```md\n[Guide](attachment:guide)\n```\n\n[Download](attachment:guide)';
  const exported = E.toMarkdown({ title: 'Examples', summary: 'Reference syntax.', bodyMarkdown, attachments: [{ id: 'guide', name: 'guide.md', mimeType: 'text/markdown', size: 6, url: 'data:text/markdown;base64,IyBUZXN0' }] });
  assert.ok(exported.includes('`[Guide](attachment:guide)`'));
  assert.ok(exported.includes('```md\n[Guide](attachment:guide)\n```'));
  assert.ok(exported.includes('[Download](data:text/markdown;base64,IyBUZXN0)'));
});

test('local Markdown bundle remains isolated from a Confluence AMD loader', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const browser = { URL, atob, define() { throw new Error('Must not register in host AMD loader.'); } };
  browser.define.amd = {};
  vm.createContext(browser);
  vm.runInContext(fs.readFileSync(require.resolve('./vendor/markdown-it-15.0.2.min.js'), 'utf8'), browser);
  vm.runInContext(fs.readFileSync(require.resolve('./editor-content.js'), 'utf8'), browser);
  assert.equal(typeof browser.WCSMarkdownIt, 'function');
  assert.match(browser.WCSEditorContent.render('**Works**'), /<strong>Works<\/strong>/);
  assert.equal(browser.markdownit, undefined, 'no generic global is leaked');
});

test('large portable Markdown imports media before applying the canonical body bound', () => {
  const image = 'data:image/png;base64,' + Buffer.alloc(210000, 3).toString('base64');
  const portable = '# Imported article\n\n![Cover](' + image + ')\n\n## Steps\n\n![Diagram](' + image + ')\n\n[checklist.md](data:text/markdown;base64,IyBUZXN0)';
  assert.ok(portable.length > 200000);
  const imported = E.normalizeImport(portable, { assets: [], attachments: [] });
  assert.ok(imported.bodyMarkdown.length < 1000);
  assert.equal(imported.assets.length, 1, 'identical image resources are reused');
  assert.equal(imported.attachments.length, 1);
  assert.equal(imported.attachments[0].name, 'checklist.md');
  assert.equal(imported.attachments[0].size, 6);
  assert.equal((E.render(imported.bodyMarkdown, imported).match(/<img /g) || []).length, 2);
  assert.match(E.render(imported.bodyMarkdown, imported), /download="checklist.md"/);
  assert.deepEqual(E.normalizeImport(imported.bodyMarkdown, imported), imported, 'normalizing the same editor state is idempotent');
});

test('Markdown import preserves file examples in fenced, indented, and multiline inline code', () => {
  const image = '![Example](data:image/png;base64,iVBORw0KGgo=)';
  const file = '[guide.md](data:text/markdown;base64,IyBUZXN0)';
  const source = '## Examples\n\n```md\n' + image + '\n```\n\n    ' + file + '\n\n`Inline\n' + image + '`\n\n' + image + '\n\n' + file;
  const result = E.normalizeImport(source);
  assert.ok(result.bodyMarkdown.includes('```md\n' + image + '\n```'));
  assert.ok(result.bodyMarkdown.includes('    ' + file));
  assert.ok(result.bodyMarkdown.includes('`Inline\n' + image + '`'));
  assert.equal(result.assets.length, 1);
  assert.equal(result.attachments.length, 1);
  assert.match(result.bodyMarkdown, /!\[Example\]\(attachment:import-image-1\)/);
});

test('Markdown import preserves reference syntax and infers a safe filename for resource labels', () => {
  const source = '![Flow][diagram]\n\n[Download notes][notes]\n\n[diagram]: <data:image/png;base64,iVBORw0KGgo=>\n[notes]: data:text/plain;base64,VGVzdA==';
  const result = E.normalizeImport(source);
  assert.equal(result.assets.length, 1); assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].name, 'notes.txt');
  const html = E.render(result.bodyMarkdown, result);
  assert.match(html, /data-asset-id="import-image-1"/);
  assert.match(html, /download="notes.txt"/);
});

test('Markdown import reuses existing resources and leaves external links unchanged', () => {
  const original = { assets: [{ id: 'existing', src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Existing' }], attachments: [{ id: 'guide', name: 'guide.md', url: 'data:text/markdown;base64,IyBUZXN0', mimeType: 'text/markdown', size: 6 }] };
  const copy = structuredClone(original);
  const result = E.normalizeImport('![Another](data:image/png;base64,iVBORw0KGgo=)\n\n[guide.md](data:text/markdown;base64,IyBUZXN0)\n\n[External](https://example.com)\n\n![Remote](https://example.com/image.jpg)', original);
  assert.deepEqual(original, copy, 'import must not mutate the active revision');
  assert.equal(result.assets.length, 1); assert.equal(result.attachments.length, 1);
  assert.match(result.bodyMarkdown, /attachment:existing/); assert.match(result.bodyMarkdown, /attachment:guide/);
  assert.match(result.bodyMarkdown, /\[External\]\(https:\/\/example.com\)/);
  assert.match(result.bodyMarkdown, /!\[Remote\]\(https:\/\/example.com\/image.jpg\)/);
});

test('Markdown import rejects active formats and bounded-size violations atomically', () => {
  const context = { assets: [], attachments: [] };
  assert.throws(() => E.normalizeImport('![Vector](data:image/svg+xml;base64,PHN2Zy8+)', context), /PNG/);
  assert.throws(() => E.normalizeImport('[page.html](data:text/html;base64,PHN2Zy8+)', context), /Pasted attachments/);
  assert.throws(() => E.normalizeImport('[script.exe](data:application/pdf;base64,VGVzdA==)', context), /extension/);
  assert.throws(() => E.normalizeImport('x'.repeat(8 * 1024 * 1024 + 1), context), /8 MB/);
  assert.throws(() => E.normalizeImport('x'.repeat(200001), context), /200,000/);
  const image = 'data:image/png;base64,' + Buffer.alloc(1024 * 1024 + 1).toString('base64');
  assert.throws(() => E.normalizeImport('![Too large](' + image + ')', context), /1 MB/);
  assert.deepEqual(context, { assets: [], attachments: [] });
});

const mdxFields = {
  format: 'wcspedia-mdx-v1', title: 'Credit review guide', summary: 'Check and retain the source record.',
  type: 'Guide', area: 'credit-approval-control', sourceId: 'legacy-credit-review-001',
  originalCreatedAt: '2020-04-02', originalUpdatedAt: '2024-03-03T10:00:00+01:00',
  sourceAuthor: 'Source author', sourcePath: 'credit/review.mdx',
  tags: ['Credit', 'Review'], processes: ['Origination'], regions: ['EMEA']
};
function mdx(fields = {}, body = '## Steps\n\n1. Check the source record.') {
  return '---\n' + Object.entries({ ...mdxFields, ...fields }).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n') + '\n---\n\n' + body;
}

test('Paste MDX extracts frontmatter without changing source date precision or its time zone', () => {
  const result = E.normalizeImport(mdx());
  assert.equal(result.bodyMarkdown, '## Steps\n\n1. Check the source record.');
  assert.deepEqual(result.metadata, {
    commentsEnabled: true, title: mdxFields.title, summary: mdxFields.summary, type: 'Guide', area: 'insights',
    tags: ['Credit', 'Review'], processes: ['Origination'], regions: ['EMEA'],
    sourceMetadata: {
      schemaVersion: 1, sourceId: mdxFields.sourceId, originalCreatedAt: '2020-04-02',
      originalUpdatedAt: '2024-03-03T10:00:00+01:00', sourceAuthor: 'Source author', sourcePath: 'credit/review.mdx'
    }
  });
  assert.doesNotMatch(result.bodyMarkdown, /sourceId|originalCreatedAt|format:/);
});

test('MDX unknown source dates stay unknown and do not become import timestamps', () => {
  const source = '---\nformat: wcspedia-mdx-v1\ntitle: A guide\nsummary: A summary\ntype: Guide\narea: credit-approval-control\nsourceId: source-123\n---\n\nContent.';
  const result = E.normalizeImport(source);
  assert.deepEqual(result.metadata.sourceMetadata, { schemaVersion: 1, sourceId: 'source-123', originalCreatedAt: null, originalUpdatedAt: null, sourceAuthor: '', sourcePath: '' });
  assert.deepEqual(result.metadata.tags, []);
  assert.equal(E.validateSourceMetadata(null), null);
  assert.equal(E.normalizeImport(mdx({ originalCreatedAt: null, originalUpdatedAt: null })).metadata.sourceMetadata.originalCreatedAt, null);
});

test('MDX source date validation rejects invalid calendars, timestamps, offsets and ordering', () => {
  for (const value of ['2023-02-29', '2024-02-30', '0000-01-01', '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-01T24:00:00Z', '2024-01-01T12:60:00Z', '2024-01-01T12:00:60Z', '2024-01-01T12:00:00', '2024-01-01T12:00:00+14:01', '2024-01-01T12:00:00+01:60', '2024-01-01T12:00:00+15:00', '2024-01-01T12:00:00.1234Z', 'today', '']) {
    assert.throws(() => E.normalizeImport(mdx({ originalCreatedAt: value, originalUpdatedAt: null })), /Original creation date/, value);
  }
  for (const value of ['2024-02-29', '2024-02-29T23:59:59.123-05:00', '2024-02-29T23:59Z', '2024-02-29T00:00:00+14:00']) {
    assert.equal(E.normalizeImport(mdx({ originalCreatedAt: value, originalUpdatedAt: null })).metadata.sourceMetadata.originalCreatedAt, value);
  }
  assert.throws(() => E.normalizeImport(mdx({ originalCreatedAt: '2024-03-02', originalUpdatedAt: '2024-03-01' })), /cannot be earlier/);
  assert.throws(() => E.normalizeImport(mdx({ originalCreatedAt: '2024-03-02T10:00:00+01:00', originalUpdatedAt: '2024-03-02T09:30:00+02:00' })), /cannot be earlier/);
  assert.throws(() => E.normalizeImport(mdx({ originalCreatedAt: '2024-03-02', originalUpdatedAt: '2024-02-28T23:00:00-05:00' })), /cannot be earlier/);
  assert.equal(E.normalizeImport(mdx({ originalCreatedAt: '2024-03-02', originalUpdatedAt: '2024-03-02T00:00:00+14:00' })).metadata.sourceMetadata.originalCreatedAt, '2024-03-02', 'date-only source has no inferred timezone');
});

test('MDX metadata rejects duplicates, unknown authority fields and unsupported YAML atomically', () => {
  const context = { assets: [], attachments: [] };
  for (const key of ['status', 'createdAt', 'history', 'approvedBy', 'permissions', 'confluencePageId']) {
    assert.throws(() => E.normalizeImport(mdx({ [key]: 'spoofed' }), context), /Unsupported metadata field/);
  }
  assert.throws(() => E.normalizeImport(mdx().replace('format:', 'title: "duplicate"\nformat:')), /appears more than once/);
  assert.throws(() => E.normalizeImport(mdx({ format: 'mdx-v2' })), /format/);
  assert.throws(() => E.normalizeImport(mdx().replace(/^sourceId:.*\n/m, '')), /Source ID/);
  assert.throws(() => E.normalizeImport(mdx().replace(/\n---\n\n/, '\n\n')), /Close the MDX metadata/);
  for (const raw of ['!js/function alert', '&anchor value', '*anchor', '|', "'single quoted'", 'A title # comment', '{"nested": true}', 'A title: details']) {
    assert.throws(() => E.normalizeImport(mdx().replace(/^title:.*$/m, 'title: ' + raw)), /quoted|JSON|YAML/, raw);
  }
  assert.throws(() => E.normalizeImport(mdx().replace(/^tags:.*$/m, 'tags:\n  - credit')), /needs a value/);
  assert.throws(() => E.normalizeImport(mdx().replace(/^tags:.*$/m, 'tags: [credit]')), /valid JSON/);
  assert.throws(() => E.normalizeImport(mdx({ tags: [5] })), /non-empty text/);
  assert.throws(() => E.normalizeImport(mdx({ type:'Job aid', area: 'Credit Area' })), /business-area ID/);
  assert.throws(() => E.normalizeImport(mdx({ title: 'x'.repeat(161) })), /160/);
  assert.throws(() => E.normalizeImport(mdx({ summary: 'x'.repeat(1001) })), /1000/);
  assert.deepEqual(context, { assets: [], attachments: [] });
});

test('source provenance validator disallows imported native/audit authority and enforces field bounds', () => {
  const valid = E.normalizeImport(mdx()).metadata.sourceMetadata;
  for (const change of [{ schemaVersion: 2 }, { sourceId: '' }, { sourceId: 'x'.repeat(161) }, { sourceAuthor: 'x'.repeat(201) }, { sourcePath: 'x'.repeat(501) }, { sourceAuthor: 'A\nB' }, { createdDate: '2001-01-01' }, { sourceImportedAt: '2001-01-01' }]) {
    assert.throws(() => E.validateSourceMetadata({ ...valid, ...change }));
  }
  assert.throws(() => E.validateSourceMetadata([]), /only/);
  assert.deepEqual(E.validateSourceMetadata(valid), valid);
});

test('MDX never executes or silently strips components, expressions, or import/export statements', () => {
  for (const body of ['import Alert from "./Alert";\n\nText.', 'import "./side-effect.js";', 'import { Alert } from "./Alert";', 'import * as content from "./content";', 'import Alert, { Notice } from "./Alert";', 'import /* module */ Alert from "./Alert";', 'import Alert // module\nfrom "./Alert";', 'export const metadata = {};\n\nText.', 'export default helper;', 'export function helper() {}', 'export { helper };', 'export * from "./helpers";', '<Alert severity="warning">Check.</Alert>', '<Components.Card />', '<>Text</>', 'Value {calculate()}.', 'Value }.', '<script>alert(1)</script>', '<u onclick="bad">Text</u>', '<!-- comment -->']) {
    assert.throws(() => E.normalizeImport(mdx({}, body)), /MDX/, body);
  }
  const example = '## Examples\n\n```mdx\nimport Alert from "./Alert";\n<Alert>{value}</Alert>\n```\n\n    export const value = {};\n\nUse `<Component>{value}</Component>` or ``{`value`}`` as examples.\n\n<u>Supported underline</u> and \\{literal braces\\}.\n\n<https://example.com>.';
  assert.equal(E.normalizeImport(mdx({}, example)).bodyMarkdown, example);
  assert.equal(E.normalizeImport('Raw <Alert>{value}</Alert> is inert Markdown.').bodyMarkdown, 'Raw <Alert>{value}</Alert> is inert Markdown.', 'legacy plain Markdown import remains inert and compatible');
});

test('MDX permits ordinary import/export instructions while rejecting module declarations', () => {
  const body = '## Steps\n\nimport the source file into the shared folder.\n\nexport the report after checking the totals.\n\nimport data from the approved source.\n\nexport results to the reporting team.';
  assert.equal(E.normalizeImport(mdx({}, body)).bodyMarkdown, body);
});

test('MDX import extracts media and preserves metadata while leaving legacy dividers alone', () => {
  const result = E.normalizeImport(mdx({}, '![Diagram](data:image/png;base64,iVBORw0KGgo=)\n\n[notes.txt](data:text/plain;base64,VGVzdA==)'));
  assert.equal(result.assets.length, 1); assert.equal(result.attachments.length, 1);
  assert.match(result.bodyMarkdown, /attachment:import-image-1/);
  assert.equal(result.metadata.sourceMetadata.sourceId, mdxFields.sourceId);
  const ordinary = '---\n\nAn introduction.\n\n---\n\n## Steps\n\nRead carefully.';
  assert.deepEqual(E.normalizeImport(ordinary), { bodyMarkdown: ordinary, assets: [], attachments: [] });
});

test('legacy Markdown dividers can precede colon-containing prose without being imported as metadata', () => {
  for (const body of ['---\n\nNote: Read the source record first.\n\n---\n\nContent.', '---\n\nNote: Read the source record first.', '---\nTitle: Legacy example\nSummary: Read carefully\n---\n\nContent.']) {
    assert.deepEqual(E.normalizeImport(body), { bodyMarkdown: body, assets: [], attachments: [] });
  }
  assert.throws(() => E.normalizeImport(mdx().replace(/^format:.*\n/m, '')), /format: "wcspedia-mdx-v1"/, 'a provenance block still requires the declared format');
});

test('readable Markdown export retains existing content and additionally roundtrips source metadata', () => {
  const imported = E.normalizeImport(mdx()), version = {
    ...imported.metadata, ...imported, highlights: ['Keep evidence.'], cover: { src: '/cover.png', alt: 'Cover' },
    attachments: [{ id: 'manual', name: 'manual.pdf', mimeType: 'application/pdf', size: 20, url: 'https://example.com/manual.pdf' }]
  };
  const exported = E.toMarkdown(version), reparsed = E.normalizeImport(exported);
  assert.deepEqual(reparsed.metadata, imported.metadata);
  assert.match(exported, /# Credit review guide/);
  assert.match(exported, /## Key highlights\n\n- Keep evidence\./);
  assert.match(exported, /!\[Cover\]\(\/cover.png\)/);
  assert.match(exported, /## Attachments[\s\S]*\[manual.pdf\]/);
  assert.throws(() => E.toMarkdown({ ...version, type: undefined }), /Metadata type/);
});

function exportVersion(extra = {}) {
  const imported = E.normalizeImport(mdx());
  return { ...imported.metadata, ...imported, documentId: 'doc-credit-review-001', ...extra };
}
const mdxExportBase = { baseUrl: 'https://confluence.example.com/confluence/pages/viewpage.action?pageId=123' };

test('MDX download preserves tables, fenced/inline code and canonical video/resource tokens on import', () => {
  const recording = E.videoMarkdown({ url: 'https://example.sharepoint.com/sites/training/_layouts/15/embed.aspx?UniqueId=12345678-1234-1234-1234-123456789abc', title: 'Review {source} <literal> `check`' });
  const body = '## Working notes\n\n| Owner | Evidence |\n| :--- | ---: |\n| Alex | **Checked** |\n\n```mdx\nimport Component from "./Component";\n<Component>{value}</Component>\n![Example](attachment:diagram)\n```\n\nUse `export const x = { value: 1 };` as code.\n\n' + recording + '\n\n@[embed](https://example.com/training)';
  const file = E.toMDX(exportVersion({ bodyMarkdown: body }), mdxExportBase), imported = E.normalizeImport(file);
  assert.equal(imported.bodyMarkdown, body);
  assert.ok(file.includes(recording));
  assert.ok(file.includes('@[embed](https://example.com/training)'));
  assert.match(E.render(imported.bodyMarkdown, imported), /<table>[\s\S]*<strong>Checked<\/strong>/);
  assert.match(E.render(imported.bodyMarkdown, imported), /<iframe[^>]+sharepoint/);
  assert.match(E.render(imported.bodyMarkdown, imported), /data-embed-url="https:\/\/example.com\/training"/);
  assert.equal(E.toMDX({ ...imported.metadata, ...imported }), file, 'repeat export/import preserves canonical content and metadata');
});

test('MDX download resolves inline image/file references and relative resources to portable URLs', () => {
  const body = '## Resources\n\n![Flow](attachment:diagram)\n\n![External](../download/external.png)\n\n[Read](attachment:guide)\n\n![Reference][cover]\n\n[cover]: </confluence/download/attachments/123/cover.png>\n\n@[embed](/confluence/pages/viewpage.action?pageId=456)';
  const version = exportVersion({ bodyMarkdown: body, assets: [{ id: 'diagram', src: '/confluence/download/attachments/123/flow(1).png?version=2', alt: 'Flow' }], attachments: [{ id: 'guide', name: 'guide.pdf', url: '/confluence/download/attachments/123/guide.pdf?version=3', mimeType: 'application/pdf', size: 20 }] });
  const file = E.toMDX(version, mdxExportBase), imported = E.normalizeImport(file), html = E.render(imported.bodyMarkdown, imported);
  assert.match(file, /https:\/\/confluence.example.com\/confluence\/download\/attachments\/123\/flow%281%29.png\?version=2/);
  assert.match(file, /https:\/\/confluence.example.com\/confluence\/download\/external.png/);
  assert.match(file, /https:\/\/confluence.example.com\/confluence\/download\/attachments\/123\/guide.pdf\?version=3/);
  assert.match(file, /@\[embed\]\(https:\/\/confluence.example.com\/confluence\/pages\/viewpage.action\?pageId=456\)/);
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.doesNotMatch(file, /attachment:|## Attachments/);
  assert.throws(() => E.toMDX(version), /HTTPS Confluence page URL/);
  assert.throws(() => E.toMDX(version, { baseUrl: 'http://confluence.example.com' }), /HTTPS Confluence page URL/);
});

test('MDX download keeps embedded image bytes, cover/caption, highlights and unlinked files', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=', fileUrl = 'data:text/plain;base64,VGVzdA==';
  const version = exportVersion({
    bodyMarkdown: '## Steps\n\n![Flow](attachment:diagram)\n\nRead the guidance.',
    assets: [{ id: 'diagram', src: png, alt: 'Flow' }],
    cover: { src: 'https://example.com/cover.png', alt: 'Blue cover', caption: 'Source illustration' },
    highlights: ['Keep the source record.', 'Check {values} before use.'],
    attachments: [{ id: 'notes', name: 'notes.txt', url: fileUrl, mimeType: 'text/plain', size: 4 }]
  });
  const file = E.toMDX(version), imported = E.normalizeImport(file), html = E.render(imported.bodyMarkdown, imported);
  assert.equal(imported.assets[0].src, png); assert.equal(imported.attachments[0].url, fileUrl);
  assert.match(html, /Keep the source record\./); assert.match(html, /Check \{values\} before use\./);
  assert.match(html, /alt="Blue cover"/); assert.match(html, /Source illustration/);
  assert.match(html, /<h2[^>]*>Attachments<\/h2>/); assert.match(html, /download="notes.txt"/);
  assert.equal((file.match(/title: "Credit review guide"/g) || []).length, 1);
  assert.doesNotMatch(file, /^# Credit review guide$/m, 'title/summary are metadata, not duplicate body sections');
  assert.equal(E.toMDX({ ...imported.metadata, ...imported }), file, 'projected content and data files survive a second roundtrip');
});

test('MDX source provenance is preserved while native and approval history are excluded', () => {
  const version = exportVersion({ createdAt: '2026-10-16T10:00:00.000Z', approvedAt: '2026-10-17T10:00:00.000Z', approvedBy: 'manager', status: 'Published', sourceImportedAt: '2026-10-16T10:00:00.000Z', governance: { classification: 'other-nhd' } });
  const file = E.toMDX(version), imported = E.normalizeImport(file);
  assert.deepEqual(imported.metadata.sourceMetadata, version.sourceMetadata);
  assert.match(file, /originalCreatedAt: "2020-04-02"/);
  assert.match(file, /originalUpdatedAt: "2024-03-03T10:00:00\+01:00"/);
  assert.doesNotMatch(file, /approvedAt:|approvedBy:|sourceImportedAt:|status:|governance:|2026-10-16|2026-10-17/);
});

test('MDX export derives a stable source ID for native documents without inventing historical dates', () => {
  const native = exportVersion({ sourceMetadata: null, documentId: 'document-123', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', createdBy: 'person-1' });
  const result = E.normalizeImport(E.toMDX(native));
  assert.deepEqual(result.metadata.sourceMetadata, { schemaVersion: 1, sourceId: 'wcspedia:document-123', originalCreatedAt: null, originalUpdatedAt: null, sourceAuthor: '', sourcePath: '' });
  assert.equal(E.normalizeImport(E.toMDX(native)).metadata.sourceMetadata.sourceId, 'wcspedia:document-123');
  assert.equal(E.normalizeImport(E.toMDX({ ...native, documentId: '', reference: 'WCS-001' })).metadata.sourceMetadata.sourceId, 'wcspedia:WCS-001');
  assert.throws(() => E.toMDX({ ...native, documentId: '' }), /Save this document/);
  assert.throws(() => E.toMDX({ ...native, documentId: 'x'.repeat(152) }), /151/);
});

test('MDX export escapes literal expression/HTML/module prose without changing rendered meaning', () => {
  const body = '## Literal examples\n\nA value {amount} and <Alert role="note">literal markup</Alert>.\n\n\\<Escaped> remains text.\n\nimport Helper from "./helper";\n\nexport const value = 1;\n\n<u>Supported underline</u> and <https://example.com>.\n\n```javascript\nexport const value = { code: true };\n```';
  const file = E.toMDX(exportVersion({ bodyMarkdown: body })), imported = E.normalizeImport(file);
  assert.match(file, /&#105;mport Helper/); assert.match(file, /&#101;xport const/);
  assert.match(file, /&lt;Alert/); assert.match(file, /\\\{amount\\\}/);
  assert.ok(file.includes('```javascript\nexport const value = { code: true };\n```'));
  assert.equal(E.render(imported.bodyMarkdown, imported), E.render(body));
  assert.doesNotMatch(E.render(imported.bodyMarkdown, imported), /<Alert|<Escaped/);
});

test('MDX export rejects missing resources and oversized non-reimportable projections', () => {
  assert.throws(() => E.toMDX(exportVersion({ bodyMarkdown: '![Missing](attachment:missing)' })), /missing/);
  assert.throws(() => E.toMDX(exportVersion({ bodyMarkdown: '', sections: [{ title: 'Old body', paragraphs: ['Must not revive this body.'], bullets: [] }] })), /Document content is required/);
  const huge = 'data:application/pdf;base64,' + Buffer.alloc(5 * 1024 * 1024, 1).toString('base64');
  const attachments = [1, 2].map(n => ({ id: 'file-' + n, name: 'file-' + n + '.pdf', url: huge, mimeType: 'application/pdf', size: 5 * 1024 * 1024 }));
  assert.throws(() => E.toMDX(exportVersion({ attachments })), /8 MB paste limit/);
});

test('MDX export imports large allowed cover/file data after extracting them from the body', () => {
  const png = 'data:image/png;base64,' + Buffer.alloc(210000, 2).toString('base64');
  const fileUrl = 'data:application/pdf;base64,' + Buffer.alloc(210000, 1).toString('base64');
  const version = exportVersion({ cover: { src: png, alt: 'Large cover' }, attachments: [{ id: 'large-file', name: 'large.pdf', url: fileUrl, mimeType: 'application/pdf', size: 210000 }] });
  const imported = E.normalizeImport(E.toMDX(version));
  assert.ok(imported.bodyMarkdown.length < 1000);
  assert.equal(imported.assets[0].src, png);
  assert.equal(imported.attachments[0].url, fileUrl);
});

test('MDX export preserves destinations containing brackets, parentheses, encoded quotes and braces', () => {
  const body = '[Resource](https://example.com/a_(b)?q=[one])\n\n[Quoted](https://example.com/a%22b?x=%22text%22)\n\n<https://example.com/{item}>\n\n![Image](https://example.com/a_(b).png "Title")';
  const imported = E.normalizeImport(E.toMDX(exportVersion({ bodyMarkdown: body }))), html = E.render(imported.bodyMarkdown, imported);
  assert.match(html, /href="https:\/\/example.com\/a_%28b%29\?q=%5Bone%5D"/);
  assert.match(html, /href="https:\/\/example.com\/a%22b\?x=%22text%22"/);
  assert.match(html, /href="https:\/\/example.com\/%7Bitem%7D"[^>]*>https:\/\/example.com\/\{item\}<\/a>/);
  assert.match(html, /src="https:\/\/example.com\/a_%28b%29.png"/);
  assert.doesNotMatch(html, /%5C|\\\{/);
});

test('portable Markdown import counts UTF-8 bytes instead of allowing oversized non-ASCII input',()=>{
  for(const [value,description] of [['漢'.repeat(Math.floor(8388608/3)+1),'three-byte characters'],['😀'.repeat(2097153),'surrogate pairs'],['\uD800'.repeat(Math.floor(8388608/3)+1),'replacement characters']]){
    assert.ok(value.length<8388608,description);
    assert.ok(Buffer.byteLength(value,'utf8')>8388608,description);
    assert.throws(()=>E.normalizeImport(value),/8,388,608 UTF-8 bytes/,description);
  }
});
test('portable MDX export also counts UTF-8 prose alongside embedded resources',()=>{
  const size=5*1024*1024,fileUrl='data:application/pdf;base64,'+Buffer.alloc(size,1).toString('base64');
  const cover={src:'data:image/png;base64,'+Buffer.alloc(890000,2).toString('base64'),alt:'Diagram'};
  const version=exportVersion({bodyMarkdown:'漢'.repeat(150000),cover,attachments:[{id:'large-file',name:'large.pdf',url:fileUrl,mimeType:'application/pdf',size}]});
  assert.throws(()=>E.toMDX(version),/8 MB paste limit.*UTF-8 bytes/);
});
