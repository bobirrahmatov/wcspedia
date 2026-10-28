'use strict';
// Integration tests over an ephemeral loopback HTTP transport. The simulator
// implements Confluence REST shapes; no live Confluence host is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { fixture } = require('./helpers/confluence-publication-fixture.cjs');
const { createPublisher, AREAS } = require('../confluence-publisher.cjs');
const { createWorkflowService, readerProjection } = require('../publication-workflow.cjs');
const G = require('../governance.js');
const W = require('../workflow.js');
const copy = value => JSON.parse(JSON.stringify(value));
const people = [{ id: 'author', name: 'Author', role: 'Author', soeid: 'AM12345' }, { id: 'manager', name: 'Manager', role: 'Manager', soeid: 'JL12345' }];
const policy = { schemaVersion: 1, revision: 1, records: people.map(person => ({ id: person.id, soeid: person.soeid, displayName: person.name, scope: '*', permissions: ['content.create', 'content.edit', 'content.delete'], active: true })), audit: [] };
const permissions = ['read', 'create', 'update', 'delete'].map(operation => ({ operation, targetType: 'page' }));
async function setup(t) {
  const f = fixture(), nativeTransport = f.config.fetch, trashed = new Set();
  const control = { policy: copy(policy), failProjection: false, spaceDelete: true, deniedPages: new Set(), missingProof: false, recoveryCalls: [] };
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), url = 'https://confluence.test' + req.url;
      let body;
      if (bytes.length) body = /^multipart\/form-data/.test(req.headers['content-type'] || '') ? await new Request(url, { method: req.method, headers: req.headers, body: bytes }).formData() : bytes.toString('utf8');
      const result = await nativeTransport(url, { method: req.method, headers: req.headers, body });
      const removed = /^\/confluence\/rest\/api\/content\/(\d+)$/.exec(req.url);
      if (req.method === 'DELETE' && removed && result.ok) trashed.add(removed[1]);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  delete f.config.renderStorage; delete f.config.collectMedia;
  f.config.fetch = (url, init) => { const parsed = new URL(url); return fetch('http://127.0.0.1:' + server.address().port + parsed.pathname + parsed.search, init); };
  const publisher = createPublisher(f.config), projections = [], projectionReceipts = new Map();
  let attachmentVersion = 1, requestNumber = 0;
  const initial = { schemaVersion: 1, people, areas: AREAS.map(id => ({ id, title: id })), documents: [], isDemo: false };
  const service = createWorkflowService({
    journal: f.journal, publisher, rootPageId: '101',
    loadInitialState: async () => ({ data: initial, attachmentVersion: 1 }),
    authenticate: async session => ({ type: 'known', username: session === 'manager' ? 'JL12345' : 'AM12345' }),
    loadPolicy: async () => copy(control.policy),
    nativeAccess: async ({ document, recovery }) => {
      const workingExists = document && f.pages.has(document.confluencePageId), publishedExists = document && f.pages.has(document.publishedConfluencePageId);
      const result = { root: permissions, documents: workingExists ? { [document.id]: permissions } : {}, workingRoot: permissions, area: permissions, published: publishedExists ? permissions : [], pageVersion: workingExists ? f.pages.get(document.confluencePageId).version.number : undefined };
      if (recovery) {
        control.recoveryCalls.push(copy(recovery));
        result.deletionRecovery = { space: [{ operation: 'read', targetType: 'space' }, ...(control.spaceDelete ? [{ operation: 'delete', targetType: 'page' }] : [])], pages: Object.fromEntries(recovery.pageIds.map(id => [id, { status: f.pages.has(id) ? 'current' : trashed.has(id) && !control.missingProof ? 'trashed' : 'unknown', operations: control.deniedPages.has(id) ? [] : permissions }])) };
      }
      return result;
    },
    writeProjection: async ({ data, expectedAttachmentVersion, requestId }) => {
      if (projectionReceipts.has(requestId)) return projectionReceipts.get(requestId);
      if (control.failProjection) { control.failProjection = false; throw Error('Temporary projection failure'); }
      assert.equal(expectedAttachmentVersion, attachmentVersion); projections.push(copy(data)); attachmentVersion++;
      const receipt = { attachmentVersion }; projectionReceipts.set(requestId, receipt); return receipt;
    },
    now: () => '2026-10-15T12:00:00.000Z'
  });
  async function command(action, extra = {}) {
    const state = await service.snapshot(), doc = state.data.documents[0], version = doc && W.currentVersion(doc);
    return { action, rootPageId: '101', requestId: 'flow-' + (++requestNumber), comment: 'Reviewed business record.', expectedEntitlementRevision: 1, expectedAttachmentVersion: state.attachmentVersion, ...(doc ? { docId: doc.id, documentKey: doc.id, confluencePageId: doc.confluencePageId, expectedPageVersion: doc.confluencePageVersion, expectedVersion: version.version, expectedRevision: version.revision, expectedAuditLength: doc.audit.length } : {}), ...extra };
  }
  async function act(action, session, extra = {}) { const cmd = await command(action, extra); return { cmd, receipt: await service.execute(cmd, session) }; }
  async function reviewAndApprove() {
    await act('submit', 'author');
    const state = await service.snapshot(), version = W.currentVersion(state.data.documents[0]);
    await act('complete-review', 'manager', { governanceReview: { baselineVersion: G.BASELINE_VERSION, version: version.version, revision: version.revision, checks: Object.fromEntries(G.reviewChecklist.map(item => [item.key, true])), findingDisposition: 'clear', reason: 'Ownership, sources and applicability were checked.' } });
    return act('approve', 'manager', { nextReviewAt: '2028-10-15' });
  }
  return { ...f, service, projections, command, act, reviewAndApprove, control, trashed };
}
function fields(area = 'deal-closing') {
  return { id: 'wcs-doc-flow', reference: 'WCS-JA-001', area, type: 'Job aid', ownerId: 'author', authorId: 'author', reviewerId: 'manager', approverId: 'manager', title: 'Deal closing checklist', summary: 'A checklist for the closing team.', bodyMarkdown: '## Before closing\n\nConfirm the source record.\n\n1. Check the owner.\n2. Attach the evidence.', tags: ['Credit'], regions: ['EMEA'], processes: ['Deal closing'], governance: { classification: 'other-nhd', owningTeam: 'WCS Deal Closing', scope: 'Guidance for closing preparation.', audience: 'Deal closing colleagues.', classificationRationale: 'Task support and reference material.', reviewBasis: 'business-best-practice', reviewMonths: 24, sources: [] } };
}

test('imported dates remain source metadata across native publication and are never sent as Confluence history',async t=>{
  const f=await setup(t),input=fields();
  input.sourceMetadata={schemaVersion:1,sourceId:'legacy-closing-01',originalCreatedAt:'2021-03-04',originalUpdatedAt:'2024-05-06T14:30:00+02:00',sourceAuthor:'Original author',sourcePath:'closing/checklist.mdx'};
  await f.act('create','author',{fields:input});
  let doc=(await f.service.snapshot()).data.documents[0],originalImport=W.currentVersion(doc).sourceImportedAt;
  assert.equal(originalImport,'2026-10-15T12:00:00.000Z');
  assert.match(f.pages.get(doc.confluencePageId).body.storage.value,/Original created.*2021-03-04/);
  await f.reviewAndApprove();doc=(await f.service.snapshot()).data.documents[0];
  const reader=copy(f.pages.get(doc.publishedConfluencePageId)),projected=f.projections.at(-1).documents[0].versions[0];
  assert.deepEqual(projected.sourceMetadata,input.sourceMetadata);assert.equal(projected.sourceImportedAt,originalImport);
  assert.match(reader.body.storage.value,/Original updated.*2024-05-06T14:30:00\+02:00/);
  assert.match(reader.body.storage.value,/Imported into WCSpedia.*2026-10-15T12:00:00.000Z/);
  await f.act('revise','author',{changes:{summary:'A revised checklist summary.'}});
  doc=(await f.service.snapshot()).data.documents[0];
  assert.deepEqual(W.currentVersion(doc).sourceMetadata,input.sourceMetadata);assert.equal(W.currentVersion(doc).sourceImportedAt,originalImport);
  assert.equal(f.pages.get(doc.publishedConfluencePageId).body.storage.value,reader.body.storage.value);
  for(const call of f.calls.filter(item=>['POST','PUT'].includes(item.method)&&/^\/rest\/api\/content(?:\/\d+)?$/.test(item.route))){
    assert.equal(Object.hasOwn(call.body,'history'),false);assert.equal(Object.hasOwn(call.body,'createdAt'),false);
    assert.equal(Object.hasOwn(call.body.version||{},'when'),false);assert.equal(Object.hasOwn(call.body.version||{},'createdDate'),false);
  }
});

test('real coordinator and renderer create restricted drafts, publish beneath selected area, and reuse reader page on revision', async t => {
  const f = await setup(t), created = await f.act('create', 'author', { fields: fields() });
  let state = await f.service.snapshot(), doc = state.data.documents[0], workingId = doc.confluencePageId;
  assert.equal(f.pages.get(workingId).ancestors.at(-1).id, '100');
  assert.equal(created.receipt.publication.operation, 'working');
  assert.equal(f.projections.at(-1).documents.length, 0, 'a working draft is absent from reader projection');
  assert.match(f.pages.get(workingId).body.storage.value, /Before closing/);
  assert.match(f.pages.get(workingId).body.storage.value, /Not approved for publication/);
  const approved = await f.reviewAndApprove();
  state = await f.service.snapshot(); doc = state.data.documents[0];
  const publishedId = doc.publishedConfluencePageId, readerBefore = copy(f.pages.get(publishedId));
  assert.notEqual(publishedId, workingId); assert.equal(readerBefore.ancestors.at(-1).id, '203');
  assert.match(readerBefore.body.storage.value, /Approved by/); assert.match(readerBefore.body.storage.value, /Manager \(JL12345\)/); assert.match(readerBefore.body.storage.value, /<ol>/);
  assert.equal(f.projections.at(-1).documents[0].confluencePageId, publishedId);
  assert.ok(!JSON.stringify(f.projections.at(-1)).includes('governanceReview'));
  assert.equal(f.projections.at(-1).documents[0].versions.length, 1);
  const writesBeforeRetry = f.calls.filter(call => call.method !== 'GET').length;
  assert.deepEqual(await f.service.execute(approved.cmd, 'manager'), approved.receipt);
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, writesBeforeRetry);
  await f.act('revise', 'author', { changes: { bodyMarkdown: '## Revised guidance\n\nConfirm the receiving team as well.' } });
  state = await f.service.snapshot(); doc = state.data.documents[0];
  assert.equal(doc.confluencePageId, workingId); assert.equal(W.currentVersion(doc).version, 2);
  assert.equal(f.pages.get(publishedId).body.storage.value, readerBefore.body.storage.value, 'draft revision does not overwrite the approved reader page');
  assert.equal(f.projections.at(-1).documents[0].versions[0].version, 1);
  await f.reviewAndApprove();
  state = await f.service.snapshot(); doc = state.data.documents[0];
  assert.equal(doc.publishedConfluencePageId, publishedId); assert.equal(doc.publishedConfluencePageVersion, readerBefore.version.number + 1);
  assert.equal(f.pages.get(publishedId).ancestors.at(-1).id, '203'); assert.match(f.pages.get(publishedId).body.storage.value, /Revised guidance/);
  assert.equal(f.projections.at(-1).documents[0].versions[0].version, 2);
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.route === '/rest/api/content').length, 2, 'exactly one working and one reader native page');
  assert.equal(doc.audit.filter(event => event.action === 'approve').length, 2);
  assert.equal(readerProjection(state.data).documents[0].confluencePageId, publishedId);
});

test('uploaded images and attachments reach each native page before its readable body is committed', async t => {
  const f = await setup(t), input = fields('loan-management'), image = Buffer.from('synthetic-png-fixture'), file = Buffer.from('evidence');
  input.assets = [{ id: 'screenshot', src: 'data:image/png;base64,' + image.toString('base64'), alt: 'Source record view' }];
  input.attachments = [{ id: 'evidence', name: 'evidence.txt', url: 'data:text/plain;base64,' + file.toString('base64'), mimeType: 'text/plain', size: file.length }];
  input.bodyMarkdown += '\n\n![Source record](attachment:screenshot)\n\n[Evidence](attachment:evidence)';
  await f.act('create', 'author', { fields: input }); await f.reviewAndApprove();
  const state = await f.service.snapshot(), doc = state.data.documents[0];
  for (const id of [doc.confluencePageId, doc.publishedConfluencePageId]) {
    const page = f.pages.get(id); assert.equal(page.attachments.length, 2); assert.match(page.body.storage.value, /<ac:image.*<ri:attachment/); assert.match(page.body.storage.value, /Supporting attachments/); assert.ok(!page.body.storage.value.includes('base64'));
    const firstUpload = f.calls.findIndex(call => call.method === 'POST' && call.route === '/rest/api/content/' + id + '/child/attachment');
    const firstBody = f.calls.findIndex(call => call.method === 'PUT' && call.route === '/rest/api/content/' + id);
    assert.ok(firstUpload >= 0 && firstUpload < firstBody);
  }
  assert.equal(f.pages.get(doc.publishedConfluencePageId).ancestors.at(-1).id, '206');
});

test('concurrent retries of one create command produce one native working page and one audit event', async t => {
  const f = await setup(t), command = await f.command('create', { fields: fields() });
  const [one, two] = await Promise.all([f.service.execute(command, 'author'), f.service.execute(command, 'author')]);
  assert.deepEqual(one, two); const state = await f.service.snapshot();
  assert.equal(state.data.documents.length, 1); assert.equal(state.data.documents[0].audit.length, 1);
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.route === '/rest/api/content').length, 1);
  assert.equal(f.projections.length, 1);
});

test('a partially trashed deletion retries using journal-bound recovery and current permissions', async t => {
  const f = await setup(t); await f.act('create', 'author', { fields: fields() }); await f.reviewAndApprove();
  const before = await f.service.snapshot(), doc = before.data.documents[0], deletion = await f.command('delete');
  f.options.intercept = ({ method, route }) => method === 'DELETE' && route === '/rest/api/content/' + doc.publishedConfluencePageId ? new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }) : null;
  await assert.rejects(f.service.execute(deletion, 'manager'), { code: 'CONFLUENCE_HTTP' });
  assert.ok(!f.pages.has(doc.confluencePageId)); assert.ok(f.pages.has(doc.publishedConfluencePageId));
  assert.equal((await f.service.snapshot()).pendingRequestId, deletion.requestId);
  f.options.intercept = null; f.control.policy.revision = 2;
  const result = await f.service.execute(deletion, 'manager');
  assert.equal(result.deleted, true); assert.equal(result.publication.operation, 'deleted'); assert.equal((await f.service.snapshot()).pendingRequestId, null);
  assert.ok(!f.pages.has(doc.publishedConfluencePageId)); assert.equal(f.projections.at(-1).documents.length, 0);
  const recovery = f.control.recoveryCalls.at(-1);
  assert.equal(recovery.stage, 'prepared'); assert.equal(recovery.requestId, deletion.requestId); assert.equal(recovery.documentKey, doc.id);
  assert.deepEqual(recovery.pageIds, [doc.confluencePageId, doc.publishedConfluencePageId]);
  const deletes = f.calls.filter(call => call.method === 'DELETE' && call.route === '/rest/api/content/' + doc.confluencePageId); assert.equal(deletes.length, 1);
  const writes = f.calls.filter(call => call.method !== 'GET').length;
  assert.deepEqual(await f.service.execute(deletion, 'manager'), result, 'completed delete can replay after page operations disappear');
  assert.equal(f.control.recoveryCalls.at(-1).stage, 'completed'); assert.equal(f.calls.filter(call => call.method !== 'GET').length, writes);
});

test('recovery after both pages are trashed finishes a failed reader projection without new native writes', async t => {
  const f = await setup(t); await f.act('create', 'author', { fields: fields() }); await f.reviewAndApprove();
  const deletion = await f.command('delete'); f.control.failProjection = true;
  await assert.rejects(f.service.execute(deletion, 'manager'), /Temporary projection failure/);
  const state = await f.service.snapshot(); assert.equal(state.pendingRequestId, deletion.requestId);
  const writes = f.calls.filter(call => call.method !== 'GET').length;
  const result = await f.service.execute(deletion, 'manager'); assert.equal(result.deleted, true);
  assert.equal(f.control.recoveryCalls.at(-1).stage, 'native'); assert.equal(f.calls.filter(call => call.method !== 'GET').length, writes); assert.equal(f.projections.at(-1).documents.length, 0);
});

test('delete recovery rechecks central grants, native space rights, surviving page rights and authoritative trash status', async t => {
  const f = await setup(t); await f.act('create', 'author', { fields: fields() }); await f.reviewAndApprove();
  const state = await f.service.snapshot(), doc = state.data.documents[0], deletion = await f.command('delete');
  f.options.intercept = ({ method, route }) => method === 'DELETE' && route === '/rest/api/content/' + doc.publishedConfluencePageId ? new Response('{}', { status: 503 }) : null;
  await assert.rejects(f.service.execute(deletion, 'manager')); f.options.intercept = null;
  const writes = f.calls.filter(call => call.method !== 'GET').length;
  f.control.policy.records.find(person => person.id === 'manager').active = false;
  await assert.rejects(f.service.execute(deletion, 'manager'), { code: 'FORBIDDEN' });
  f.control.policy.records.find(person => person.id === 'manager').active = true;
  f.control.spaceDelete = false; await assert.rejects(f.service.execute(deletion, 'manager'), { code: 'FORBIDDEN' }); f.control.spaceDelete = true;
  f.control.deniedPages.add(doc.publishedConfluencePageId); await assert.rejects(f.service.execute(deletion, 'manager'), /remaining page/); f.control.deniedPages.clear();
  f.control.missingProof = true; await assert.rejects(f.service.execute(deletion, 'manager'), /authoritatively trashed/); f.control.missingProof = false;
  await assert.rejects(f.service.execute({ ...deletion, recovery: { pageIds: [], stage: 'completed' } }, 'manager'), { code: 'PUBLICATION_PENDING' });
  await assert.rejects(f.service.execute(deletion, 'author'), { code: 'PUBLICATION_PENDING' });
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, writes, 'failed recovery authorization performs no mutation');
  assert.ok(f.pages.has(doc.publishedConfluencePageId)); await f.service.execute(deletion, 'manager');
  f.control.policy.records.find(person => person.id === 'manager').active = false;
  await assert.rejects(f.service.execute(deletion, 'manager'), { code: 'FORBIDDEN' }, 'even completed receipt replay requires current rights');
});
