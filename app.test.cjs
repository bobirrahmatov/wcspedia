'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Execute the production review comparison helpers without booting the DOM-only
// application. These tests target disclosure of replaced reviewed evidence.
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const start = source.indexOf('  function coverDescription('), end = source.indexOf('  function reviewPage(', start);
assert.ok(start >= 0 && end > start, 'review helper boundaries must remain explicit');
const render = vm.runInNewContext(source.slice(start, end) + '\nrevisionChanges;', {
  esc: value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
});
const firstImage = 'data:image/png;base64,iVBORw0KGgo=', secondImage = 'data:image/png;base64,iVBORw0KGgs=';
function compare(before, after) {
  const baseline = { version: 1, title: 'Credit guidance', summary: 'Review the evidence.', sections: [{ id: 'overview', title: 'Overview', paragraphs: ['Approved instructions.'], bullets: [] }] };
  const previous = { ...baseline, ...before }, current = { ...structuredClone(previous), ...after, version: 2 };
  return render({ versions: [previous, current] }, current);
}

test('review comparison discloses a replaced cover even when description and displayed size are unchanged', () => {
  assert.equal(firstImage.length, secondImage.length);
  const html = compare({ cover: { src: firstImage, alt: 'The workflow', caption: 'Diagram' } }, { cover: { src: secondImage, alt: 'The workflow', caption: 'Diagram' } });
  assert.match(html, /1 content change since version 1/);
  assert.match(html, /<h3>Cover image<\/h3>/);
  assert.match(html, /File content replaced; metadata unchanged\./);
  assert.doesNotMatch(html, /base64,/);
});

test('review comparison detects inline image and attachment byte changes with identical metadata', () => {
  const html = compare({
    assets: [{ id: 'image-1', src: firstImage, alt: 'Workflow' }],
    attachments: [{ id: 'file-1', name: 'notes.txt', url: 'data:text/plain;base64,VGVzdA==', mimeType: 'text/plain', size: 4 }]
  }, {
    assets: [{ id: 'image-1', src: secondImage, alt: 'Workflow' }],
    attachments: [{ id: 'file-1', name: 'notes.txt', url: 'data:text/plain;base64,Tm90ZQ==', mimeType: 'text/plain', size: 4 }]
  });
  assert.match(html, /2 content changes since version 1/);
  assert.match(html, /<h3>assets<\/h3>/);
  assert.match(html, /<h3>attachments<\/h3>/);
  assert.equal((html.match(/File content replaced; metadata unchanged\./g) || []).length, 2);
});

test('unchanged media does not create a false review change and removals stay visible', () => {
  const media = { assets: [{ id: 'image-1', src: firstImage, alt: 'Workflow' }], cover: { src: firstImage, alt: 'Cover' } };
  assert.match(compare(media, structuredClone(media)), /0 content changes/);
  const removed = compare(media, { assets: [], cover: null });
  assert.match(removed, /2 content changes/);
  assert.match(removed, /<h3>Cover image<\/h3>/);
  assert.match(removed, /<h3>assets<\/h3>/);
});

test('review metadata descriptions remain inert text when names contain HTML characters', () => {
  const html = compare({ tags: ['Credit'] }, { tags: ['<img src=x onerror=bad()>'] });
  assert.match(html, /1 content change/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});
