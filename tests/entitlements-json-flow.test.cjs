'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const C = require('../confluence.js');
const E = require('../entitlements.js');
const { createEntitlementsService } = require('../confluence-entitlements.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const ops = (...values) => values.map(operation => ({ operation, targetType: 'page' }));

function environment(options = {}) {
  const seed = fs.readFileSync(path.join(__dirname, '../confluence-data-starters/entitlements.json'));
  const state = { actor: 'BR47149', serverTime: options.serverTime || new Date(Date.now() - 60000).toISOString(), attachmentId: '850', attachmentVersion: 5, versions: new Map([[5, seed]]), browserCalls: [], serverCalls: [], uploads: [], hostCommands: [] };
  const native = () => ({ root: ops('read', 'create'), entitlements: ops('read', 'update'), documents: {} });
  const journalData = new Map(), locks = new Map();
  const journal = {
    get: async key => journalData.has(key) ? clone(journalData.get(key)) : undefined,
    set: async (key, value) => journalData.set(key, clone(value)),
    withLock: async (key, operation) => {
      const prior = locks.get(key) || Promise.resolve(); let release;
      const gate = new Promise(resolve => { release = resolve; }), tail = prior.then(() => gate);
      locks.set(key, tail); await prior;
      try { return await operation(); } finally { release(); if (locks.get(key) === tail) locks.delete(key); }
    }
  };
  async function confluenceTransport(url, init = {}, caller) {
    const u = new URL(url), method = init.method || 'GET';
    state[caller === 'browser' ? 'browserCalls' : 'serverCalls'].push({ url: u, method, headers: init.headers });
    assert.equal(u.origin, 'https://confluence.test');
    if (method === 'GET' && u.pathname === '/confluence/rest/api/content/900/child/attachment') {
      assert.equal(u.searchParams.get('filename'), 'entitlements.json');
      return jsonResponse({ results: [{ id: state.attachmentId, title: 'entitlements.json', version: { number: state.attachmentVersion } }] });
    }
    if (method === 'GET' && u.pathname === '/confluence/download/attachments/900/entitlements.json') {
      const bytes = state.versions.get(Number(u.searchParams.get('version') || state.attachmentVersion));
      assert.ok(bytes, 'the latest or explicitly selected attachment exists');
      return new Response(bytes, { headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'POST' && u.pathname === '/confluence/rest/api/content/900/child/attachment/850/data') {
      assert.equal(caller, 'server', 'only the trusted service uploads the policy');
      assert.equal(init.headers['X-Atlassian-Token'], 'nocheck');
      const file = init.body.get('file'); assert.equal(file.name, 'entitlements.json');
      const bytes = Buffer.from(await file.arrayBuffer());
      state.uploads.push({ path: u.pathname, bytes });
      state.versions.set(++state.attachmentVersion, bytes);
      return jsonResponse({ id: state.attachmentId, version: { number: state.attachmentVersion } });
    }
    if (caller === 'browser' && method === 'GET') {
      if (u.pathname === '/confluence/rest/api/user/current') return jsonResponse({ type: 'known', username: state.actor.toLowerCase(), userKey: 'key-' + state.actor });
      if (u.pathname === '/confluence/rest/api/content/100') return jsonResponse({ id: '100', version: { number: 9 }, operations: native().root });
      if (u.pathname === '/confluence/rest/api/content/900') return jsonResponse({ id: '900', version: { number: 17 }, operations: native().entitlements });
    }
    throw new Error('Unexpected ' + caller + ' Confluence call: ' + method + ' ' + u);
  }
  const service = createEntitlementsService({ baseUrl: 'https://confluence.test/confluence', rootPageId: '100', entitlementsPageId: '900', journal, fetch: (url, init) => confluenceTransport(url, init, 'server'), now: () => state.serverTime });
  // This in-memory host models authenticated routing and native-right lookup;
  // the policy authorizer, concurrency checks and uploads are the real service.
  async function browserFetch(url, init = {}) {
    const u = new URL(url);
    if (u.pathname === '/confluence/rest/wcspedia/entitlements') {
      assert.equal(init.method, 'POST', 'the client never loads a second policy/audit source');
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
      const command = JSON.parse(init.body);
      assert.equal(init.headers['Idempotency-Key'], command.requestId);
      state.hostCommands.push(clone(command));
      try {
        const result = await service.execute(command, { identity: { soeid: state.actor }, native: native() });
        return jsonResponse(result);
      } catch (error) {
        return jsonResponse({ code: error.code, message: error.message }, error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 400);
      }
    }
    return confluenceTransport(url, init, 'browser');
  }
  const client = C.create({ mode: 'confluence', contextPath: '/confluence', rootPageId: '100', entitlementsPageId: '900', entitlementsSource: 'attachment', entitlementsFilename: 'entitlements.json', entitlementsEndpoint: '/confluence/rest/wcspedia/entitlements' }, { fetch: browserFetch, location: { href: 'https://confluence.test/confluence/pages/viewpage.action?pageId=100' }, crypto: { randomUUID } });
  return { client, service, state };
}

test('browser and trusted service share the real BR47149 attachment through add, edit, denial and revoke', async () => {
  const { client, service, state } = environment();
  let access = await client.loadAccess();
  assert.equal(access.entitlementPolicy.revision, 1);
  assert.equal(access.entitlementAttachmentVersion, 5, 'native attachment version is independent of policy revision');
  assert.deepEqual(access.entitlementPolicy.records.map(row => row.soeid), ['BR47149']);
  assert.equal(access.effectivePermissions['entitlements.add'], true);
  const row = { id: 'grant-test-author', soeid: 'XY12345', displayName: 'Integration colleague', scope: '*', permissions: ['content.create'], active: true };
  access = await client.submitEntitlementCommand({ action: 'add', record: row, expectedRevision: access.entitlementPolicy.revision, comment: 'Authorize the assigned contributor.', actorSOEID: 'FORGED', native: { entitlements: [] } });
  assert.equal(access.entitlementPolicy.revision, 2);
  assert.equal(access.entitlementAttachmentVersion, 6);
  assert.equal(access.entitlementAttachmentId, '850');
  assert.equal(access.entitlementPolicy.records.find(item => item.id === row.id).displayName, row.displayName);
  assert.equal(access.entitlementPolicy.audit[0].actorSOEID, 'BR47149');
  assert.equal(access.entitlementPolicy.audit[0].at, state.serverTime);
  assert.equal(state.hostCommands[0].expectedAttachmentId, '850');
  assert.equal(state.hostCommands[0].expectedAttachmentVersion, 5);
  assert.equal('actorSOEID' in state.hostCommands[0], false);
  assert.equal('native' in state.hostCommands[0], false);
  assert.equal(state.uploads.length, 1);

  access = await client.submitEntitlementCommand({ action: 'edit', recordId: row.id, record: { ...row, displayName: 'Updated colleague', permissions: ['content.create', 'content.edit'] }, expectedRevision: access.entitlementPolicy.revision, comment: 'Allow maintenance of assigned documents.' });
  assert.equal(access.entitlementPolicy.revision, 3);
  assert.equal(access.entitlementAttachmentVersion, 7);
  assert.deepEqual(access.entitlementPolicy.records.find(item => item.id === row.id).permissions, ['content.create', 'content.edit']);
  const revoke = { action: 'revoke', recordId: row.id, expectedRevision: access.entitlementPolicy.revision, comment: 'The assignment has ended.' };
  // Browser still has the prior administrator preflight. The HTTP host resolves
  // its current session afresh, so server authorization must reject the change.
  state.actor = 'XY12345';
  await assert.rejects(client.submitEntitlementCommand(revoke), error => error.status === 403);
  assert.equal(state.uploads.length, 2);
  assert.equal((await service.loadPolicy()).records.some(item => item.id === row.id), true);
  state.actor = 'BR47149';
  access = await client.loadAccess();
  access = await client.submitEntitlementCommand(revoke);
  assert.equal(access.entitlementPolicy.revision, 4);
  assert.equal(access.entitlementAttachmentVersion, 8);
  assert.equal(access.entitlementPolicy.records.some(item => item.id === row.id), false);
  assert.deepEqual(access.entitlementPolicy.audit.map(event => event.action), ['add', 'edit', 'revoke']);
  assert.ok(access.entitlementPolicy.audit.every(event => event.actorSOEID === 'BR47149'));
  assert.deepEqual((await client.loadAccess()).entitlementPolicy, await service.loadPolicy());
  assert.deepEqual(JSON.parse(state.versions.get(8)), access.entitlementPolicy);
  assert.equal(state.uploads.length, 3);
  assert.ok(state.uploads.every(upload => upload.path === '/confluence/rest/api/content/900/child/attachment/850/data'));
  assert.equal(state.versions.size, 4, 'one existing attachment retains its original and three updated versions');
  for (const call of [...state.browserCalls, ...state.serverCalls]) assert.equal(call.url.searchParams.get('expand')?.includes('body.storage') || false, false, 'no native table is fetched');
  assert.equal(state.browserCalls.some(call => call.method === 'POST'), false, 'browser never uploads the attachment');
  E.validatePolicy(JSON.parse(state.versions.get(5)));
});

test('a fixed server clock ahead of the browser does not block the next command or accept client audit fields', async () => {
  const serverTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { client, state } = environment({ serverTime });
  let access = await client.loadAccess();
  const row = { id: 'clock-test-author', soeid: 'XY12345', displayName: 'Clock verification colleague', scope: '*', permissions: ['content.create'], active: true };
  access = await client.submitEntitlementCommand({ action: 'add', record: row, expectedRevision: access.entitlementPolicy.revision, comment: 'Grant author access.', actorSOEID: 'FORGED', at: '1900-01-01T00:00:00Z' });
  assert.equal(access.entitlementPolicy.audit[0].at, serverTime);
  assert.ok(Date.parse(serverTime) > Date.now());
  access = await client.submitEntitlementCommand({ action: 'edit', recordId: row.id, record: { ...row, displayName: 'Updated with clock skew' }, expectedRevision: access.entitlementPolicy.revision, comment: 'Correct the directory name.', actorId: 'FORGED', now: '1900-01-01T00:00:00Z' });
  assert.equal(state.uploads.length, 2);
  assert.equal(access.entitlementPolicy.revision, 3);
  assert.ok(access.entitlementPolicy.audit.every(event => event.at === serverTime && event.actorSOEID === 'BR47149'));
  for (const command of state.hostCommands) {
    for (const field of ['actorSOEID', 'actorId', 'identity', 'native', 'now', 'at', 'timestamp', 'preflightTime']) assert.equal(field in command, false, 'client identity and validation time never reach the commit request');
  }
});
