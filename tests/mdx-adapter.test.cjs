'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const C = require('../confluence.js');
const W = require('../workflow.js');
const E = require('../editor-content.js');
const { fixture, tick, STORE } = require('./app-fixture.cjs');

const people = [
  { id: 'a', name: 'Author', role: 'Author', confluence: { userKey: 'key-a', username: 'author' } },
  { id: 'b', name: 'Manager', role: 'Manager', confluence: { userKey: 'key-b', username: 'manager' } }
];
const sourceMetadata = {
  schemaVersion: 1, sourceId: 'legacy/loan-guide-001',
  originalCreatedAt: '2021-04-08', originalUpdatedAt: '2024-06-12T14:30:00+02:00',
  sourceAuthor: 'Original author', sourcePath: 'legacy/loan-guide.mdx'
};
const fields = {
  id: 'loan-guide', reference: 'WCS-G-001', type: 'Guide', area: 'loan-management',
  ownerId: 'a', authorId: 'a', reviewerId: 'b', approverId: 'b',
  title: 'Loan guidance', summary: 'Locate the loan record and its supporting evidence.',
  bodyMarkdown: '## Find the record\n\nRead the supporting evidence.', sourceMetadata
};
const importedAt = '2026-10-15T08:00:00.000Z';

function data(documents = []) {
  return { schemaVersion: 1, isDemo: true, people: structuredClone(people),
    areas: [{ id: 'loan-management', title: 'Loan Management' }], documents };
}
function document() {
  return { ...W.createDocument(structuredClone(fields), { people, actorId: 'a', now: importedAt }), confluencePageId: '210', confluencePageVersion: 1 };
}
function response(body) { return { ok: true, status: 200, text: async () => JSON.stringify(body) }; }
function server(workspace = data([document()])) {
  const calls = [], state = { version: 3, workspace };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    if (u.pathname.endsWith('/rest/api/user/current')) return response({ type: 'known', userKey: 'key-a', username: 'author', displayName: 'Author' });
    if (/\/rest\/api\/content\/(123|210)$/.test(u.pathname) && u.searchParams.get('expand') === 'operations,version') return response({ id: u.pathname.split('/').at(-1), operations: ['read', 'create', 'update'].map(operation => ({ operation, targetType: 'page' })), version: { number: 1 } });
    if (u.pathname.endsWith('/child/attachment') && u.searchParams.get('filename') === 'entitlements.json') return response({ results: [{ id: '457', title: 'entitlements.json', version: { number: 1 } }] });
    if (u.pathname.endsWith('/entitlements.json')) return response({ schemaVersion: 1, revision: 1, records: [{ id: 'author-grant', soeid: 'AUTHOR', displayName: 'Author', scope: '*', permissions: ['content.create', 'content.edit'], active: true }], audit: [] });
    if (u.pathname.endsWith('/child/attachment')) return response({ results: [{ id: '456', title: 'wcspedia-published.json', version: { number: state.version } }] });
    if (u.pathname.includes('/download/attachments/')) return response(data());
    if (u.pathname.endsWith('/rest/wcspedia/workspace')) return response({ data: state.workspace });
    if (u.pathname.endsWith('/rest/wcspedia/workflow')) { state.version++; return response({ ok: true }); }
    throw Error('Unexpected adapter request: ' + url);
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', contextPath: '/confluence',
    workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' },
  { fetch, location: { href: 'https://intranet.example/confluence/pages/viewpage.action?pageId=123' }, crypto: { randomUUID } });
  return { adapter, calls, state, posts: () => calls.filter(call => call.init.method === 'POST').map(call => JSON.parse(call.init.body)) };
}
function command(action, content) {
  return action === 'create'
    ? { action, comment: 'Import source document.', fields: { ...fields, ...content } }
    : { action, docId: fields.id, expectedVersion: 1, expectedRevision: 1, expectedAuditLength: 1, comment: 'Correct source metadata.', changes: content };
}

for (const action of ['create', 'edit', 'revise']) {
  test('Confluence ' + action + ' transports source provenance unchanged and never accepts a client import time', async () => {
    const f = server(); await f.adapter.load();
    const supplied = command(action, { sourceMetadata: structuredClone(sourceMetadata), sourceImportedAt: '1990-01-01T00:00:00.000Z' });
    supplied.sourceImportedAt = '1980-01-01T00:00:00.000Z';
    const saved = await f.adapter.submitAction(supplied);
    assert.equal(f.posts().length, 1);
    const posted = f.posts()[0], content = action === 'create' ? posted.fields : posted.changes;
    assert.deepEqual(content.sourceMetadata, sourceMetadata);
    assert.equal(Object.hasOwn(content, 'sourceImportedAt'), false);
    assert.equal(Object.hasOwn(posted, 'sourceImportedAt'), false);
    assert.equal(posted.rootPageId, '123');
    assert.equal(saved.data.documents[0].versions[0].sourceImportedAt, importedAt);
    assert.deepEqual(saved.data.documents[0].versions[0].sourceMetadata, sourceMetadata);
    assert.deepEqual(supplied[action === 'create' ? 'fields' : 'changes'].sourceMetadata, sourceMetadata, 'Transport does not mutate the caller metadata');
  });
}

test('Confluence rejects invalid provenance and nested trusted timestamps before any write', async () => {
  const f = server(); await f.adapter.load();
  for (const invalid of [
    { ...sourceMetadata, sourceImportedAt: importedAt },
    { ...sourceMetadata, originalCreatedAt: '2021-02-29' },
    { ...sourceMetadata, originalUpdatedAt: '2024-06-12T14:30:00' },
    { ...sourceMetadata, sourceId: '' },
    { ...sourceMetadata, approvedAt: '2020-01-01' }
  ]) {
    await assert.rejects(f.adapter.submitAction(command('edit', { sourceMetadata: invalid })));
  }
  assert.equal(f.posts().length, 0);
});

test('Confluence workspace read requires valid source metadata and a canonical recorded import timestamp', async () => {
  const valid = data([document()]);
  const saved = await server(valid).adapter.load();
  assert.deepEqual(saved.data.documents[0].versions[0].sourceMetadata, sourceMetadata);
  assert.equal(saved.data.documents[0].versions[0].sourceImportedAt, importedAt);
  const invalidVersions = [
    version => { delete version.sourceImportedAt; },
    version => { version.sourceImportedAt = '2026-10-15'; },
    version => { version.sourceImportedAt = '2026-02-30T08:00:00.000Z'; },
    version => { version.sourceImportedAt = '2026-10-15T10:00:00+02:00'; },
    version => { version.sourceMetadata.originalCreatedAt = 'not recorded'; },
    version => { delete version.sourceMetadata; }
  ];
  for (const mutate of invalidVersions) {
    const copy = structuredClone(valid); mutate(copy.documents[0].versions[0]);
    await assert.rejects(server(copy).adapter.load());
  }
});

test('Confluence read rejects source identity, import-time changes and provenance removal across versions', () => {
  const first=document();first.versions[0].status='Published';first.publishedVersion=1;
  const next=structuredClone(first.versions[0]);next.version=2;next.status='Draft';first.versions.push(next);
  const valid=data([first]);assert.equal(C.validateData(valid),valid);
  for(const mutate of [v=>{v.sourceMetadata.sourceId='another-source';},v=>{v.sourceImportedAt='2026-10-16T08:00:00.000Z';},v=>{delete v.sourceMetadata;delete v.sourceImportedAt;}]){
    const invalid=structuredClone(valid);mutate(invalid.documents[0].versions[1]);assert.throws(()=>C.validateData(invalid),/source|import/i);
  }
});

function mdx(overrides = {}) {
  return E.toMarkdown({ ...fields, ...overrides, sourceMetadata: { ...sourceMetadata, ...overrides.sourceMetadata } });
}
async function paste(f, input) {
  f.find('[data-editor-action="paste-markdown"]').click();
  const dialog = f.find('.wcs-ui-dialog'); assert.ok(dialog);
  f.input('#paste-markdown-content', input);
  await f.submit('.wcs-ui-dialog form');
  assert.equal(f.find('[data-import-preview]').hidden, false, 'The first action shows the extracted metadata');
  assert.match(f.find('[data-import-preview]').textContent, /legacy\/loan-guide-001/);
  await f.submit('.wcs-ui-dialog form');
  assert.equal(f.find('.wcs-ui-dialog'), null);
}
function storedDocument(f) {
  const stored = JSON.parse(f.w.localStorage.getItem(STORE));
  return stored?.documents.find(doc => doc.versions.some(version => version.sourceMetadata?.sourceId === sourceMetadata.sourceId));
}

test('whole app saves pasted MDX metadata on create and edit while preserving first import time', async t => {
  const f = await fixture({ role: 'mine', hash: '#/create', sourceMode: true }); t.after(f.close);
  await paste(f, mdx());
  assert.equal(f.find('#editor-title').value, fields.title);
  assert.equal(f.find('#editor-type').value, fields.type);
  assert.equal(f.find('#editor-area').closest('.editor-field').hidden,true);
  f.input('#editor-comment', 'Import the original source document.');
  await f.submit('#editor-form');
  let saved = storedDocument(f); assert.ok(saved, f.find('#editor-error')?.textContent);
  const original = W.currentVersion(saved), firstImport = original.sourceImportedAt;
  assert.deepEqual(original.sourceMetadata, sourceMetadata);
  assert.match(firstImport, /^\d{4}-\d{2}-\d{2}T/);
  assert.notEqual(firstImport, sourceMetadata.originalUpdatedAt);
  assert.equal(original.status, 'Published');
  assert.equal(saved.area,'insights');
  assert.equal(saved.publicationMode,'direct-insight');
  assert.equal(original.approvedAt, null);

  await f.navigate('#/edit/' + saved.id);
  const revisedSource = { ...sourceMetadata, originalUpdatedAt: '2025-05-20T11:45:00Z' };
  await paste(f, mdx({ title: 'Updated loan guidance', sourceMetadata: revisedSource, bodyMarkdown: '## Find the record\n\nCheck the current evidence and record its location.' }));
  f.input('#editor-comment', 'Capture the corrected source modification date.');
  await f.submit('#editor-form');
  saved = storedDocument(f);
  const updated = W.currentVersion(saved);
  assert.deepEqual(updated.sourceMetadata, revisedSource, 'app.save forwards the metadata through the explicit edit fields');
  assert.equal(updated.sourceImportedAt, firstImport);
  assert.equal(updated.title, 'Updated loan guidance');
  assert.equal(updated.version, original.version + 1);
  assert.equal(updated.revision,1);
  assert.deepEqual(saved.versions[0],original);
  assert.ok(saved.audit.some(event => event.changes.some(change => change.field === 'sourceMetadata')));
  assert.equal(f.errors.length, 0);
  await tick();
});
