'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateData, create } = require('./confluence.js');
const workflow = require('./workflow.js');
const readJSON = filename => JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
const full = readJSON('wcspedia-data.json');
const published = readJSON('wcspedia-published.json');
const contentTypes = ['Job aid', 'Procedure', 'Knowledge sharing', 'Blog', 'Training', 'Reference', 'Report'];
const newGuidanceTypes = ['Guide', 'Playbook', 'Checklist', 'Template', 'FAQ'];

test('embedded and attachment entry points have identical content and schema', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.WCSData)), full);
  assert.equal(full.schemaVersion, 1);
  assert.equal(full.isDemo, true);
  assert.match(full.sampleNotice, /illustrative/);
});

test('the library offers guidance formats while preserving the seven historical sample types and their readable content', () => {
  assert.deepEqual(full.types, [...contentTypes, ...newGuidanceTypes]);
  assert.deepEqual(new Set(full.documents.map(doc => doc.type)), new Set(contentTypes));
  for (const type of contentTypes) {
    const documents = full.documents.filter(doc => doc.type === type);
    assert.ok(documents.length >= 2, type + ' needs more than one example for useful filtering');
    assert.ok(documents.some(doc => workflow.publishedVersion(doc)), type + ' needs an approved reader example');
    for (const doc of documents) {
      const version = workflow.currentVersion(doc);
      assert.ok(version.title.trim() && version.summary.trim());
      assert.ok(version.sections.length >= 2, doc.id + ' needs complete detail content');
      assert.ok(version.sections.every(section => section.paragraphs.length || section.bullets.length));
    }
  }
  const training = full.documents.find(doc => doc.id === 'writing-clear-job-aids');
  assert.equal(workflow.currentVersion(training).status, 'Awaiting approval');
  assert.equal(workflow.publishedVersion(training), null);
  const course = workflow.publishedVersion(full.documents.find(doc => doc.id === 'document-review-essentials'));
  assert.ok(course.sections.some(section => section.id === 'learning-check'));
  assert.match(course.sections.find(section => section.id === 'overview').paragraphs.join(' '), /Duration:.*Level:.*Audience:/);
});

test('the reader attachment contains exactly the latest approved snapshots and no draft or audit payload', () => {
  const expected = structuredClone(full);
  delete expected.entitlementPolicy;
  expected.taxonomyAudit = [];
  expected.documents = expected.documents.flatMap(doc => {
    const version = workflow.publishedVersion(doc);
    return version ? [{ ...doc, versions: [version], audit: [] }] : [];
  });
  assert.deepEqual(published, expected, 'Rebuild the reader attachment when source content changes');
  assert.equal(Object.hasOwn(published, 'entitlementPolicy'), false, 'Reader attachments must not distribute access policy');
  assert.ok(published.documents.length < full.documents.length, 'Unpublished documents must be excluded');
  for (const doc of published.documents) {
    assert.deepEqual(doc.audit, []);
    assert.equal(doc.versions.length, 1);
    assert.equal(doc.versions[0].status, 'Published');
    assert.equal(doc.versions[0].version, doc.publishedVersion);
  }
  const source = full.documents.find(doc => doc.id === 'credit-approval-checklist');
  const reader = published.documents.find(doc => doc.id === source.id);
  assert.notEqual(workflow.currentVersion(source).version, reader.versions[0].version, 'Pending replacement must not replace the approved snapshot');
});

test('every stored document version reconstructs from its audit changes with consistent before values', () => {
  const docFields = new Set(['id', 'reference', 'area', 'type', 'ownerId', 'authorId', 'reviewerId', 'approverId', 'publishedVersion']);
  for (const doc of full.documents) {
    const recovered = {};
    const versions = new Map();
    let priorTime = -Infinity;
    const eventIds = new Set();
    for (const event of doc.audit) {
      assert.ok(!eventIds.has(event.id), 'Duplicate event ' + event.id);
      eventIds.add(event.id);
      assert.ok(full.people.some(person => person.id === event.actorId), 'Unknown actor on ' + event.id);
      assert.ok(Date.parse(event.at) >= priorTime, 'Audit time moved backwards on ' + event.id);
      priorTime = Date.parse(event.at);
      const initial = event.changes.find(change => change.field === 'versionSnapshot');
      const source = event.changes.find(change => change.field === 'sourcePublishedVersion');
      const sourceSnapshot = source ? versions.get(source.after) : null;
      for (const change of event.changes) {
        if (change.field === 'versionSnapshot') {
          assert.equal(change.before, null);
          assert.ok(!versions.has(event.version), 'Duplicate initial version snapshot');
          versions.set(event.version, structuredClone(change.after));
        } else if (change.field === 'sourcePublishedVersion') {
          assert.equal(change.after, recovered.publishedVersion);
        } else if (docFields.has(change.field)) {
          assert.deepEqual(recovered[change.field] ?? null, change.before, event.id + ' before ' + change.field);
          recovered[change.field] = structuredClone(change.after);
        } else if (initial) {
          // The original fixtures also record source-to-draft changes next to
          // their initial snapshot; those before values belong to the source.
          assert.deepEqual(sourceSnapshot ? sourceSnapshot[change.field] : null, change.before, event.id + ' source ' + change.field);
          assert.deepEqual(initial.after[change.field], change.after, event.id + ' initial ' + change.field);
        } else {
          const snapshot = versions.get(event.version);
          assert.ok(snapshot, 'Audit change precedes initial content snapshot');
          assert.ok(Object.hasOwn(snapshot, change.field), 'Unknown audit field ' + change.field);
          assert.deepEqual(snapshot[change.field], change.before, event.id + ' before ' + change.field);
          snapshot[change.field] = structuredClone(change.after);
        }
      }
      const snapshot = versions.get(event.version);
      assert.equal(snapshot.status, event.toStatus, event.id + ' status');
      assert.equal(snapshot.revision, event.revision, event.id + ' revision');
    }
    recovered.versions = [...versions.values()];
    recovered.audit = doc.audit;
    assert.deepEqual(recovered, doc, 'Reconstructed document differs: ' + doc.id);
  }
});

test('full and published attachments satisfy Confluence data validation and separate author from decisions', () => {
  assert.equal(validateData(full), full);
  assert.equal(validateData(published), published);
  for (const doc of full.documents) {
    assert.notEqual(doc.authorId, doc.reviewerId, doc.id + ' self-review');
    assert.notEqual(doc.authorId, doc.approverId, doc.id + ' self-approval');
    assert.equal(full.people.find(person => person.id === doc.approverId).role, 'Manager');
    for (const version of doc.versions.filter(version => version.status === 'Published')) {
      assert.equal(version.reviewedBy, doc.reviewerId);
      assert.equal(version.approvedBy, doc.approverId);
      assert.equal(version.reviewedRevision, version.revision);
      assert.ok(Date.parse(version.reviewedAt) <= Date.parse(version.approvedAt));
    }
  }
});

test('the generated reader attachment loads through the real Confluence adapter contract', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const parsed = new URL(url);
    let body;
    if (parsed.pathname.endsWith('/child/attachment')) body = parsed.searchParams.get('filename') === 'entitlements.json'
      ? { results: [{ id: '457', title: 'entitlements.json', version: { number: 1 } }] }
      : { results: [{ id: '456', title: 'wcspedia-published.json', version: { number: 3 } }] };
    else if (parsed.pathname.endsWith('/content/123')) body = { id:'123',version:{number:1},operations:[{operation:'read',targetType:'page'}] };
    else if (parsed.pathname.endsWith('/user/current')) body = { type: 'known', userKey: 'real-reader-001', username: 'reader', displayName: 'Reader session' };
    else if (parsed.pathname === '/confluence/download/attachments/123/wcspedia-published.json') body = published;
    else if (parsed.pathname === '/confluence/download/attachments/123/entitlements.json') body = readJSON('confluence-data-starters/entitlements.json');
    else throw new Error('Unexpected request: ' + parsed.href);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const adapter = create({ mode: 'confluence', rootPageId: '123', contextPath: '/confluence' }, { fetch, location: { href: 'https://intranet.example/confluence/pages/viewpage.action?pageId=123' } });
  const session = await adapter.load();
  assert.equal(session.mode, 'confluence');
  assert.equal(session.actor.role, 'Reader');
  assert.equal(session.identityMapped, false);
  assert.equal(session.canSubmit, false);
  assert.deepEqual(session.data.documents, published.documents);
  const download = calls.find(call => call.url.pathname.endsWith('/wcspedia-published.json'));
  assert.equal(download.url.searchParams.get('version'), null);
  assert.equal(download.init.credentials, 'same-origin');
});
