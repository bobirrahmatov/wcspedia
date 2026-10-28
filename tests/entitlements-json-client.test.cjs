'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const C = require('../confluence.js');
const E = require('../entitlements.js');
const location = { href: 'https://intranet.example/confluence/pages/viewpage.action?pageId=100' };
const policy = () => ({ schemaVersion: 1, revision: 7, records: [{ id: 'br-admin', soeid: 'BR47149', displayName: 'BR47149', scope: '*', permissions: [...E.PERMISSIONS], active: true }], audit: [{ id: 'event-7', revision: 7, actorSOEID: 'BR47149', action: 'add', at: '2026-10-16T12:00:00Z', comment: 'Initial entitlement import.', changes: [] }] });
const operations = list => list.map(operation => ({ operation, targetType: 'page' }));
const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: key => headers[key] || null }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const add = () => ({ action: 'add', expectedRevision: 7, comment: 'Grant document author access.', record: { id: 'new-author', soeid: 'XY12345', displayName: 'Another colleague', scope: '*', permissions: ['content.create'], active: true } });
function fixture(options = {}) {
  const state = { calls: [], policy: policy(), attachmentId: '850', attachmentVersion: 3, metadataReads: 0, policyPageId: '900', user: { type: 'known', username: 'br47149', userKey: 'key-br' }, rootOperations: operations(['read', 'create']), policyOperations: operations(['read', 'update']), ...options };
  const fetch = async (value, init) => {
    const url = new URL(value), call = { url, init }; state.calls.push(call);
    if (state.onRequest) await state.onRequest(call, state);
    if (url.pathname.endsWith('/user/current')) return response(state.user);
    if (url.pathname === '/confluence/rest/api/content/100') return response({ id: '100', operations: state.rootOperations, version: { number: 1 } });
    if (url.pathname === '/confluence/rest/api/content/' + state.policyPageId) return response({ id: state.policyPageId, type: 'page', operations: state.policyOperations, version: { number: 99 }, ...state.policyPageOverrides }, state.policyStatus || 200);
    if (url.pathname === '/confluence/rest/api/content/201') return response({ id: '201', operations: operations(['read', 'update']), version: { number: 4 } });
    if (url.pathname === '/confluence/rest/api/content/' + state.policyPageId + '/child/attachment') {
      state.metadataReads++;
      const item = { id: state.attachmentId, title: 'entitlements.json', version: { number: state.attachmentVersion }, _links: { download: 'https://evil.example/ignore' } };
      if (state.metadataReads % 2 === 0 && state.race === 'version') item.version.number++;
      if (state.metadataReads % 2 === 0 && state.race === 'id') item.id = '851';
      return response(state.metadata || { results: [item] });
    }
    if (url.pathname === '/confluence/download/attachments/' + state.policyPageId + '/entitlements.json') return response(state.policy, state.downloadStatus || 200, state.downloadHeaders);
    if (url.pathname === '/confluence/rest/wcspedia/entitlements' && init.method === 'POST') {
      if (state.postError) throw new Error('Network response lost');
      const command = JSON.parse(init.body);
      assert.equal(command.expectedAttachmentId, state.attachmentId);
      assert.equal(command.expectedAttachmentVersion, state.attachmentVersion);
      if (state.postHandler) return state.postHandler(command, state);
      state.policy = E.applyCommand(state.policy, command, { identity: E.identity(state.user), native: { root: state.rootOperations, entitlements: state.policyOperations }, now: '2026-10-16T12:01:00Z' });
      state.attachmentVersion++;
      if (state.afterCommit) state.afterCommit(command, state);
      return response({ ok: true });
    }
    throw new Error('Unexpected request: ' + init.method + ' ' + url);
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '100', attachmentPageId: '800', entitlementsPageId: '900', entitlementsSource: 'attachment', entitlementsEndpoint: '/confluence/rest/wcspedia/entitlements', ...options.config }, { fetch, location, crypto: { randomUUID } });
  return { adapter, state };
}

test('one exact attachment supplies grants and audit independently of native page and attachment versions', async () => {
  const { adapter, state } = fixture();
  const access = await adapter.loadAccess({ documentPages: { guide: '201' } });
  assert.equal(access.entitlementSource, 'attachment');
  assert.equal(access.entitlementPolicy.revision, 7);
  assert.equal(access.entitlementAttachmentId, '850');
  assert.equal(access.entitlementAttachmentVersion, 3);
  assert.deepEqual(access.entitlementPolicy.audit, state.policy.audit);
  assert.equal(access.effectivePermissions['content.create'], true);
  assert.equal(access.effectivePermissions['entitlements.add'], true);
  assert.deepEqual(access.documentPermissions.guide, { edit: true, delete: false });
  assert.equal(state.metadataReads, 2);
  const download = state.calls.find(call => call.url.pathname.includes('/download/'));
  assert.equal(download.url.searchParams.get('version'), null);
  assert.equal(download.url.origin, 'https://intranet.example');
  assert.equal(state.calls.some(call => call.url.searchParams.get('expand')?.includes('body.storage')), false);
  assert.equal(state.calls.some(call => call.url.pathname.includes('/rest/wcspedia/entitlements')), false, 'JSON audit does not trigger a table-service reconciliation');
  for (const call of state.calls) { assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.credentials, 'same-origin'); assert.equal(call.init.redirect, 'error'); }
  assert.equal(adapter.info().entitlementsSource, 'attachment');
  assert.equal(adapter.info().entitlementsFilename, 'entitlements.json');
});

test('entitlement grants remain intersected with native rights and an unmapped principal gets no powers', async () => {
  for (const options of [{ policyOperations: operations(['read']) }, { user: { type: 'known', username: 'ZZ99999' } }]) {
    const { adapter } = fixture(options), access = await adapter.loadAccess();
    assert.equal(access.effectivePermissions['entitlements.add'], false);
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'FORBIDDEN');
  }
  const noCreate = await fixture({ rootOperations: operations(['read']) }).adapter.loadAccess();
  assert.equal(noCreate.effectivePermissions['content.create'], false);
});

test('unknown sources and filenames with traversal, alternate URLs or invalid extension fail at configuration', () => {
  for (const entitlementsSource of ['', 'json', false, {}]) assert.throws(() => fixture({ config: { entitlementsSource } }), error => error.code === 'CONFIGURATION');
  for (const entitlementsFilename of ['', '../entitlements.json', 'a..json', '/entitlements.json', 'https://example.org/policy.json', 'x\\policy.json', 'x%2fpolicy.json', 'entitlements.json?version=1', 'entitlements.txt', {}, 'x'.repeat(256) + '.json']) {
    assert.throws(() => fixture({ config: { entitlementsFilename } }), error => error.code === 'CONFIGURATION');
  }
  assert.equal(fixture({ config: { entitlementsSource: undefined } }).adapter.info().entitlementsSource, 'attachment');
});

test('missing, duplicate, partial and malformed attachment metadata fail closed', async () => {
  const item = { id: '850', title: 'entitlements.json', version: { number: 3 } };
  for (const metadata of [{ results: [] }, { results: [item, item] }, { results: [item], _links: { next: '/next' } }, { results: [{ ...item, id: 'invalid' }] }, { results: [{ ...item, title: 'other.json' }] }, { results: [{ ...item, version: { number: 0 } }] }]) {
    const { adapter, state } = fixture({ metadata });
    await assert.rejects(adapter.loadAccess(), error => error.code === 'INVALID_ENTITLEMENTS');
    assert.equal(state.calls.some(call => call.url.pathname.includes('/download/')), false);
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
  }
});

test('invalid JSON, schema and permissions never fall back to a native table or demo policy', async () => {
  const invalidPolicy = policy(); invalidPolicy.records[0].permissions.push('system.admin');
  for (const value of ['<html>Sign in</html>', '{', { ...policy(), schemaVersion: 2 }, invalidPolicy]) {
    const { adapter, state } = fixture({ policy: value });
    await assert.rejects(adapter.loadAccess(), error => error.code === 'INVALID_ENTITLEMENTS');
    assert.equal(state.calls.some(call => call.url.searchParams.get('expand')?.includes('body.storage')), false);
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
  }
  for (const options of [{ policyStatus: 403 }, { downloadStatus: 403 }]) await assert.rejects(fixture(options).adapter.loadAccess(), error => error.status === 403);
});

test('entitlement JSON is limited to 2 MB of UTF-8 bytes including a misleading or absent content length', async () => {
  for (const options of [{ downloadHeaders: { 'content-length': String(2 * 1024 * 1024 + 1) } }, { policy: ' '.repeat(2 * 1024 * 1024 + 1) }, { policy: '"' + 'é'.repeat(1024 * 1024) + '"', downloadHeaders: { 'content-length': '1' } }]) {
    await assert.rejects(fixture(options).adapter.loadAccess(), error => error.code === 'INVALID_ENTITLEMENTS' && /2 MB/.test(error.message));
  }
});

test('replacement and concurrent attachment versions are rejected before any grants become active', async () => {
  for (const race of ['id', 'version']) {
    const { adapter } = fixture({ race });
    await assert.rejects(adapter.loadAccess(), error => error.code === 'CONFLICT');
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
  }
});

test('every access refresh reads current JSON and a failed refresh clears earlier browser authority', async () => {
  const { adapter, state } = fixture();
  await adapter.loadAccess(); state.policy.records[0].permissions = ['entitlements.view']; state.attachmentVersion++;
  assert.equal((await adapter.loadAccess()).effectivePermissions['content.create'], false);
  assert.equal(state.metadataReads, 4);
  state.policy = '{'; await assert.rejects(adapter.loadAccess(), error => error.code === 'INVALID_ENTITLEMENTS');
  await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
});

test('entitlement changes call only the trusted service with observed attachment identity and then reload JSON', async () => {
  const { adapter, state } = fixture(); await adapter.loadAccess();
  const access = await adapter.submitEntitlementCommand({ ...add(), actorSOEID: 'FORGED', expectedAttachmentVersion: 999, expectedAttachmentId: '999', entitlementsPageId: '1' });
  const posts = state.calls.filter(call => call.init.method === 'POST');
  assert.equal(posts.length, 1); assert.equal(posts[0].url.pathname, '/confluence/rest/wcspedia/entitlements');
  const body = JSON.parse(posts[0].init.body);
  assert.equal(body.entitlementsSource, 'attachment'); assert.equal(body.entitlementsFilename, 'entitlements.json');
  assert.equal(body.entitlementsPageId, '900'); assert.equal(body.rootPageId, '100');
  assert.equal(body.expectedRevision, 7); assert.equal(body.expectedAttachmentVersion, 3); assert.equal(body.expectedAttachmentId, '850');
  assert.equal('actorSOEID' in body, false);
  assert.equal(posts[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(posts[0].init.headers['Idempotency-Key'], body.requestId);
  assert.equal(access.entitlementPolicy.revision, 8); assert.equal(access.entitlementAttachmentVersion, 4);
  assert.equal(access.entitlementPolicy.audit.at(-1).actorSOEID, 'BR47149');
  assert.equal(access.entitlementPolicy.records.length, 2);
});

test('HTTP 200 without an authoritative saved event never reports entitlement success', async () => {
  for (const payload of ['<html>Session expired</html>', { ok: true }]) {
    const { adapter, state } = fixture({ postHandler: () => response(payload) });
    await adapter.loadAccess();
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'UNKNOWN_COMMIT' && /could not be confirmed/.test(error.message));
    assert.equal(state.policy.revision, 7);
    assert.equal(state.policy.records.length, 1);
    // A response alone did not retire the idempotency key. A safe retry through
    // the trusted service retains the command identity until JSON confirms it.
    state.postHandler = null;
    const access = await adapter.submitEntitlementCommand(add());
    assert.equal(access.entitlementPolicy.revision, 8);
    const commands = state.calls.filter(call => call.init.method === 'POST').map(call => JSON.parse(call.init.body));
    assert.equal(commands[0].requestId, commands[1].requestId);
  }
});

test('a newer attachment or policy revision alone does not confirm the requested entitlement', async () => {
  const { adapter, state } = fixture({ postHandler: (command, current) => {
    const other = { ...command, record: { ...command.record, id: 'unrelated-author', soeid: 'ZZ12345' } };
    current.policy = E.applyCommand(current.policy, other, { identity: E.identity(current.user), native: { root: current.rootOperations, entitlements: current.policyOperations }, now: '2026-10-16T12:01:00Z' });
    current.attachmentVersion++;
    return response({ ok: true });
  } });
  await adapter.loadAccess();
  await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'UNKNOWN_COMMIT');
  assert.equal(state.policy.revision, 8);
  assert.equal(state.policy.records.some(record => record.id === 'new-author'), false);
});

test('confirmation requires the same attachment, an advanced version, exact audit and saved records', async () => {
  const mutations = [
    state => { state.attachmentId = '851'; },
    state => { state.attachmentVersion--; },
    state => { state.policy.audit.at(-1).actorSOEID = 'ZZ12345'; },
    state => { state.policy.audit.at(-1).action = 'edit'; },
    state => { state.policy.audit.at(-1).comment = 'Different change reason.'; },
    state => { state.policy.audit.at(-1).changes[0].after.permissions = ['content.delete']; },
    state => { state.policy.records = state.policy.records.filter(record => record.id !== 'new-author'); }
  ];
  for (const mutate of mutations) {
    const { adapter } = fixture({ afterCommit: (_command, state) => mutate(state) });
    await adapter.loadAccess();
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'UNKNOWN_COMMIT');
  }
});

test('an exact accepted event confirms success even after a subsequent concurrent policy change', async () => {
  const { adapter } = fixture({ afterCommit: (command, state) => {
    const next = { action: 'edit', recordId: command.record.id, record: { ...command.record, displayName: 'Name corrected concurrently' }, expectedRevision: state.policy.revision, comment: 'Correct the displayed colleague name.' };
    state.policy = E.applyCommand(state.policy, next, { identity: E.identity(state.user), native: { root: state.rootOperations, entitlements: state.policyOperations }, now: '2026-10-16T12:02:00Z' });
    state.attachmentVersion++;
  } });
  await adapter.loadAccess();
  const access = await adapter.submitEntitlementCommand(add());
  assert.equal(access.entitlementPolicy.revision, 9);
  assert.equal(access.entitlementAttachmentVersion, 5);
  assert.equal(access.entitlementPolicy.records.find(record => record.id === 'new-author').displayName, 'Name corrected concurrently');
  assert.equal(access.entitlementPolicy.audit.find(event => event.revision === 8).action, 'add');
});

test('attachment alone is read-only and uncertain service retries retain their idempotency key', async () => {
  const disabled = fixture({ config: { entitlementsEndpoint: '' } }); await disabled.adapter.loadAccess();
  await assert.rejects(disabled.adapter.submitEntitlementCommand(add()), error => error.code === 'READ_ONLY');
  assert.equal(disabled.state.calls.some(call => call.init.method === 'POST'), false);
  const { adapter, state } = fixture({ postError: true }); await adapter.loadAccess();
  await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'UNKNOWN_COMMIT');
  state.postError = false; await adapter.submitEntitlementCommand(add());
  const commands = state.calls.filter(call => call.init.method === 'POST').map(call => JSON.parse(call.init.body));
  assert.equal(commands[0].requestId, commands[1].requestId);
});

test('abort propagates through metadata, download and recheck without retaining previous grants', async () => {
  for (const stage of ['metadata', 'download', 'recheck']) {
    const { adapter, state } = fixture(); await adapter.loadAccess();
    const controller = new AbortController(); state.metadataReads = 0;
    state.onRequest = (call, value) => {
      assert.ok(call.init.signal instanceof AbortSignal);
      if (stage === 'metadata' && call.url.pathname.endsWith('/child/attachment') || stage === 'download' && call.url.pathname.includes('/download/') || stage === 'recheck' && call.url.pathname.endsWith('/child/attachment') && value.metadataReads === 1) {controller.abort();assert.equal(call.init.signal.aborted,true);}
    };
    await assert.rejects(adapter.loadAccess({ signal: controller.signal }), error => error.name === 'AbortError');
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
  }
});

test('attachment policies default to the configured attachments page and report their resolved source', async () => {
  for (const entitlementsPageId of ['', null, undefined]) {
    const { adapter, state } = fixture({ policyPageId: '800', config: { entitlementsPageId } });
    const access = await adapter.loadAccess();
    assert.equal(access.identity.soeid, 'BR47149'); assert.equal(access.policyConfigured, true);
    assert.equal(access.effectivePermissions['entitlements.view'], true);
    assert.equal(access.entitlementsPageId, '800'); assert.equal(access.entitlementsSource, 'attachment'); assert.equal(access.entitlementsFilename, 'entitlements.json');
    assert.equal(adapter.info().entitlementsPageId, '800');
    assert.ok(state.calls.some(call => call.url.pathname === '/confluence/download/attachments/800/entitlements.json'));
    assert.ok(state.calls.every(call => !call.url.pathname.includes('/900')));
  }
});

test('an explicit policy page overrides the attachments page and never uses the interface page', async () => {
  const { adapter, state } = fixture({ config: { pages: { entitlements: '/confluence/pages/viewpage.action?pageId=123' } } });
  const access = await adapter.loadAccess();
  assert.equal(access.entitlementsPageId, '900'); assert.equal(adapter.info().entitlementsPageId, '900');
  assert.ok(state.calls.some(call => call.url.pathname === '/confluence/download/attachments/900/entitlements.json'));
  assert.ok(state.calls.every(call => !call.url.pathname.includes('/800') && !call.url.pathname.includes('/123')));
});

test('native table configuration requires migration to the JSON attachment before any access', () => {
  for (const entitlementsPageId of ['', '900']) {
    assert.throws(() => fixture({ config: { entitlementsPageId, entitlementsSource: 'table' } }), error => error.code === 'CONFIGURATION' && /Upload entitlements\.json/.test(error.message) && /native entitlement tables are no longer supported/.test(error.message));
  }
});

test('omitted and null source settings always read the JSON attachment without requesting a native table or policy service', async () => {
  for (const entitlementsSource of [undefined, null]) {
    const { adapter, state } = fixture({ policyPageId: '800', config: { entitlementsPageId: '', entitlementsSource } });
    const access = await adapter.loadAccess();
    assert.equal(access.effectivePermissions['entitlements.view'], true);
    assert.equal(access.entitlementsSource, 'attachment'); assert.equal(access.entitlementsPageId, '800');
    assert.ok(state.calls.some(call => call.url.pathname === '/confluence/download/attachments/800/entitlements.json'));
    assert.equal(state.calls.some(call => call.url.searchParams.get('expand')?.includes('body.storage')), false);
    assert.equal(state.calls.some(call => call.url.pathname === '/confluence/rest/wcspedia/entitlements'), false);
  }
});

test('nonempty invalid policy IDs and unsafe numeric fallback hosts fail configuration', () => {
  for (const entitlementsPageId of [' ', 'PLACEHOLDER', 'https://example.test/900', '1.5', '0', '-1', '01', '9'.repeat(21), 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, {}, [], ['900'], true]) {
    assert.throws(() => fixture({ config: { entitlementsPageId } }), error => error.code === 'CONFIGURATION');
  }
  assert.throws(() => fixture({ config: { entitlementsPageId: '', attachmentPageId: Number.MAX_SAFE_INTEGER + 1 } }), error => error.code === 'CONFIGURATION');
  assert.equal(fixture({ config: { entitlementsPageId: '9007199254740993' } }).adapter.info().entitlementsPageId, '9007199254740993', 'exact numeric strings retain precision');
});

test('verified page retrieval proves read access without inventing native mutation rights', async () => {
  for (const operationsWithoutRead of [[], operations(['update'])]) {
    const { adapter } = fixture({ rootOperations: [], policyOperations: operationsWithoutRead });
    const access = await adapter.loadAccess();
    assert.equal(access.effectivePermissions['entitlements.view'], true);
    assert.equal(access.effectivePermissions['content.create'], false);
    assert.equal(access.effectivePermissions['entitlements.edit'], operationsWithoutRead.length > 0);
    assert.deepEqual(access.nativePermissions.entitlements, [...operationsWithoutRead, { operation: 'read', targetType: 'page' }]);
    assert.equal(access.nativePermissions.entitlements.some(op => op.operation === 'delete'), false);
  }
});

test('failed or malformed policy page retrieval never proves read access or enables commands', async () => {
  for (const options of [
    { policyStatus: 403 }, { policyStatus: 404 },
    { policyPageOverrides: { id: '999' } }, { policyPageOverrides: { type: 'attachment' } }, { policyPageOverrides: { type: null } },
    { policyPageOverrides: { operations: undefined } }, { policyPageOverrides: { operations: {} } },
    { policyPageOverrides: { operations: [{ operation: 'update' }] } }
  ]) {
    const { adapter, state } = fixture(options);
    await assert.rejects(adapter.loadAccess(), error => options.policyStatus ? error.status === options.policyStatus : error.code === 'INVALID_PERMISSIONS');
    assert.equal(state.calls.some(call => call.url.pathname.includes('/download/')), false);
    await assert.rejects(adapter.submitEntitlementCommand(add()), error => error.code === 'NOT_LOADED');
  }
});
