/* Live-mode page -> JSON client -> trusted service -> one versioned attachment.
 * Run: NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/entitlements-live-ui.test.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../entitlements.js');
const { createEntitlementsService } = require('../confluence-entitlements.cjs');
const { JSDOM, VirtualConsole } = require('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const modules = ['notifications.js', 'vendor/markdown-it-15.0.2.min.js', 'search.js', 'data-table.js', 'workspace-table.js', 'pagination.js', 'entitlements.js', 'ui.js', 'editor-content.js', 'document-metrics.js', 'view-counts.js', 'document-export.js', 'document-export-ui.js', 'governance.js', 'governance-ui.js', 'workflow.js', 'discovery.js', 'confluence.js', 'editor.js', 'navigation.js', 'workspace-charts.js', 'suggestions.js', 'add-document-widget.js', 'entitlements-page.js', 'bookmarks.js', 'content-health.js', 'health-service.js', 'content-health-ui.js', 'library-workflows.js', 'loading-overlay.js', 'app.js'];

const clone = value => JSON.parse(JSON.stringify(value));
const readStarter = name => fs.readFileSync(path.join(__dirname, '../confluence-data-starters', name));
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const ops = (...values) => values.map(operation => ({ operation, targetType: 'page' }));

function environment(options = {}) {
  const seed = options.policy ? Buffer.from(JSON.stringify(options.policy)) : readStarter('entitlements.json');
  const state = {
    actor: options.actor || 'BR47149', nativeUpdate: true,
    attachmentId: '850', attachmentVersion: 5, versions: new Map([[5, seed]]),
    commands: [], uploads: [], calls: [], failService: false,
    now: new Date(Date.now() - 60000).toISOString()
  };
  const native = () => ({ root: ops('read', 'create'), entitlements: state.nativeUpdate ? ops('read', 'update') : ops('read'), documents: {} });
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
  async function transport(value, init = {}, caller = 'browser') {
    const url = new URL(value), method = init.method || 'GET';
    state.calls.push({ caller, method, url });
    assert.equal(url.origin, 'https://confluence.test');
    assert.equal((url.searchParams.get('expand') || '').includes('body.storage'), false, 'no native policy table is fetched');
    if (method === 'GET' && url.pathname === '/confluence/rest/api/content/900/child/attachment') {
      const filename = url.searchParams.get('filename');
      assert.ok(['entitlements.json', 'wcspedia-published.json'].includes(filename));
      return jsonResponse({ results: [{ id: filename === 'entitlements.json' ? state.attachmentId : '851', title: filename, version: { number: filename === 'entitlements.json' ? state.attachmentVersion : 1 } }] });
    }
    if (method === 'GET' && url.pathname === '/confluence/download/attachments/900/entitlements.json') {
      const bytes = state.versions.get(Number(url.searchParams.get('version') || state.attachmentVersion));
      assert.ok(bytes, 'the latest or explicitly selected JSON attachment exists');
      return new Response(bytes, { headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'GET' && url.pathname === '/confluence/download/attachments/900/wcspedia-published.json') {
      return new Response(readStarter('wcspedia-published.json'), { headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'POST' && url.pathname === '/confluence/rest/api/content/900/child/attachment/850/data') {
      assert.equal(caller, 'server', 'browser never writes the policy directly');
      assert.equal(init.headers['X-Atlassian-Token'], 'nocheck');
      const file = init.body.get('file'); assert.equal(file.name, 'entitlements.json');
      const bytes = Buffer.from(await file.arrayBuffer()); E.validatePolicy(JSON.parse(bytes));
      state.uploads.push({ path: url.pathname, bytes }); state.versions.set(++state.attachmentVersion, bytes);
      return jsonResponse({ id: state.attachmentId, version: { number: state.attachmentVersion } });
    }
    if (method === 'GET' && caller === 'browser') {
      if (url.pathname === '/confluence/rest/api/user/current') return jsonResponse({ type: 'known', username: state.actor.toLowerCase(), displayName: state.actor, userKey: 'key-' + state.actor });
      if (url.pathname === '/confluence/rest/api/content/100') return jsonResponse({ id: '100', version: { number: 9 }, operations: native().root });
      if (url.pathname === '/confluence/rest/api/content/900') return jsonResponse({ id: '900', version: { number: 17 }, operations: native().entitlements });
    }
    throw Error('Unexpected ' + caller + ' request: ' + method + ' ' + url);
  }
  const service = createEntitlementsService({ baseUrl: 'https://confluence.test/confluence', rootPageId: '100', entitlementsPageId: '900', journal, fetch: (url, init) => transport(url, init, 'server'), now: () => state.now });
  async function browserFetch(value, init = {}) {
    const url = new URL(value);
    if (url.pathname !== '/confluence/rest/wcspedia/entitlements') return transport(value, init, 'browser');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
    const command = JSON.parse(init.body); assert.equal(init.headers['Idempotency-Key'], command.requestId);
    state.commands.push(clone(command));
    if (state.failService) return jsonResponse({ code: 'UNAVAILABLE', message: 'Entitlement service temporarily unavailable.' }, 503);
    // The HTTP host derives identity/native rights for every request; the real
    // service validates policy, scope, audit, revision and exact attachment ID.
    try { return jsonResponse(await service.execute(command, { identity: { soeid: state.actor }, native: native() })); }
    catch (error) { return jsonResponse({ code: error.code, message: error.message }, error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 400); }
  }
  async function open() {
    const errors = [], console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error));
    const dom = new JSDOM('<div id="wcspedia" data-wcs-page-role="entitlements"></div>', { url: 'https://confluence.test/confluence/spaces/wcspedia/pages/3961735763/entitlements', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
    const w = dom.window, d = w.document, root = d.getElementById('wcspedia');
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
    w.matchMedia = () => ({ matches: false }); w.fetch = browserFetch; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    for (const method of ['alert', 'confirm', 'prompt']) w[method] = () => { throw Error('Native dialogs must not be used.'); };
    // Only the shared attachment host is necessary for the JSON location.
    w.WCS_CONFIG = { mode: 'confluence', contextPath: '/confluence', rootPageId: '100', attachmentPageId: '900', pageRole: 'entitlements', entitlementsEndpoint: options.connected === false ? '' : '/confluence/rest/wcspedia/entitlements', showConnectionStatus: false, mountGlobalTools: false, charts: { offline: true } };
    try {
      for (const file of modules) await w.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      await tick(); await tick();
      assert.ok(root.querySelector('.entitlement-table'), root.textContent); assert.deepEqual(errors.map(error => error.message), []);
    } catch (error) { w.close(); throw error; }
    const find = selector => root.querySelector(selector), all = selector => [...root.querySelectorAll(selector)];
    const input = (selector, value) => { const field = find(selector); assert.ok(field, selector); field.value = value; field.dispatchEvent(new w.Event('input', { bubbles: true })); return field; };
    const submit = async selector => { const form = find(selector); assert.ok(form, selector); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick(); };
    return { w, d, root, find, all, input, submit, errors, close: () => w.close() };
  }
  return { state, service, open, current: () => JSON.parse(state.versions.get(state.attachmentVersion)) };
}

async function settle(predicate, label) {
  for (let i = 0; i < 80; i++) { if (predicate()) return; await tick(); }
  assert.fail(label || 'The UI did not settle');
}
function beginAdd(page, soeid = 'XY12345') {
  const add = page.find('[data-entitlement="add"]'); assert.ok(add); assert.equal(add.disabled, false); add.click();
  page.input('#access-soeid', soeid); page.input('#access-name', 'Integration colleague');
  page.find('[name="permission"][value="content.create"]').checked = true;
  page.input('#access-reason', 'Authorize the assigned contributor.');
}
async function save(page) {
  await page.submit('[data-entitlement-form]');
  await settle(() => !page.find('[data-entitlement-form]') || page.find('.wcs-ui-dialog .form-error:not([hidden])'), 'Save did not finish');
}
function notices(page, type) { return [...page.d.querySelectorAll('.wcs-notification-' + type + ' .wcs-notification-message')].map(node => node.textContent); }

test('live Entitlements page adds, edits, revokes and reloads one JSON attachment with server audit', async () => {
  const env = environment(); let page = await env.open();
  try {
    assert.equal(page.all('.entitlement-table tbody tr').length, 1);
    assert.equal(page.find('.entitlement-summary'),null);
    assert.match(page.find('.entitlement-table').textContent,/BR47149/);
    beginAdd(page); await save(page);
    assert.equal(page.find('[data-entitlement-form]'), null);
    let policy = env.current(), added = policy.records.find(row => row.soeid === 'XY12345');
    assert.ok(added); assert.equal(policy.revision, 2); assert.equal(env.state.attachmentVersion, 6);
    assert.deepEqual(added.permissions, ['content.create']); assert.equal(added.displayName, 'Integration colleague');
    assert.equal(page.all('.entitlement-table tbody tr').length, 2);
    assert.equal(notices(page, 'success').length, 1);
    assert.equal(policy.audit[0].actorSOEID, 'BR47149'); assert.equal(policy.audit[0].at, env.state.now);
    assert.equal(policy.audit[0].changes[0].before, null);

    page.close(); page = await env.open();
    assert.match(page.find('.entitlement-table').textContent, /Integration colleague/);
    page.find('[data-entitlement="edit"][data-id="' + added.id + '"]').click();
    assert.equal(page.find('#access-soeid').readOnly, true);
    page.input('#access-name', 'Updated colleague'); page.find('[name="permission"][value="content.edit"]').checked = true;
    page.input('#access-reason', 'Allow maintenance of assigned content.'); await save(page);
    policy = env.current(); assert.equal(policy.revision, 3);
    assert.deepEqual(policy.records.find(row => row.id === added.id).permissions, ['content.create', 'content.edit']);
    assert.match(page.find('.entitlement-table').textContent, /Updated colleague/);
    assert.equal(policy.audit.at(-1).changes[0].before.displayName, 'Integration colleague');
    assert.equal(policy.audit.at(-1).changes[0].after.displayName, 'Updated colleague');

    page.find('[data-entitlement="revoke"][data-id="' + added.id + '"]').click();
    page.input('#access-reason', 'Contributor assignment ended.'); await save(page);
    policy = env.current(); assert.equal(policy.revision, 4); assert.equal(env.state.attachmentVersion, 8);
    assert.equal(policy.records.some(row => row.id === added.id), false);
    assert.deepEqual(policy.audit.map(event => event.action), ['add', 'edit', 'revoke']);
    assert.equal(policy.audit.at(-1).changes[0].after, null);
    assert.equal(page.all('.entitlement-history-table tbody tr').length, 3);
    assert.equal(env.state.uploads.length, 3);
    assert.ok(env.state.uploads.every(upload => upload.path === '/confluence/rest/api/content/900/child/attachment/850/data'));
    assert.deepEqual(env.state.commands.map(command => command.expectedAttachmentVersion), [5, 6, 7]);
    assert.ok(env.state.commands.every(command => command.expectedAttachmentId === '850' && !('actorSOEID' in command) && !('native' in command)));
    assert.deepEqual(await env.service.loadPolicy(), policy);
    assert.deepEqual(page.errors.map(error => error.message), []);
    page.close(); page = await env.open();
    assert.equal(page.all('.entitlement-table tbody tr').length, 1); assert.equal(page.all('.entitlement-history-table tbody tr').length, 3);
    assert.equal(env.state.versions.size, 4, 'the original and all updated versions are retained under one attachment');
  } finally { page.close(); }
});

test('a rejected live Add preserves the form and JSON and never reports success', async () => {
  const env = environment(), page = await env.open();
  try {
    const before = env.state.versions.get(5); beginAdd(page); env.state.failService = true; await save(page);
    assert.equal(page.find('#access-name').value, 'Integration colleague');
    assert.equal(page.find('#access-reason').value, 'Authorize the assigned contributor.');
    assert.equal(page.find('.wcs-ui-dialog .form-error').hidden, false);
    assert.match(page.find('.wcs-ui-dialog .form-error').textContent, /unavailable|503/i);
    assert.equal(notices(page, 'success').length, 0); assert.equal(notices(page, 'error').length, 1);
    assert.equal(env.state.uploads.length, 0); assert.equal(env.state.attachmentVersion, 5); assert.equal(env.state.versions.get(5), before);
    assert.deepEqual(page.errors.map(error => error.message), []);
  } finally { page.close(); }
});

test('server rechecks native rights after the entitlement editor opened', async () => {
  const env = environment(), page = await env.open();
  try {
    beginAdd(page); env.state.nativeUpdate = false; await save(page);
    assert.equal(notices(page, 'success').length, 0); assert.equal(notices(page, 'error').length, 1);
    assert.equal(env.state.uploads.length, 0); assert.equal(env.current().revision, 1);
    assert.equal(page.find('#access-soeid').value, 'XY12345');
    assert.match(page.find('.wcs-ui-dialog .form-error').textContent, /permission|not allowed|native|access|authorized/i);
  } finally { page.close(); }
});

test('an entitled administrator sees disabled Add/Edit/Revoke with service setup guidance when disconnected', async () => {
  const env = environment({ connected: false }), page = await env.open();
  try {
    for (const action of ['add', 'edit', 'revoke']) {
      const button = page.find('[data-entitlement="' + action + '"]'); assert.ok(button, action + ' is discoverable');
      assert.equal(button.disabled, true); button.click(); assert.equal(page.find('[data-entitlement-form]'), null);
    }
    assert.match(page.root.textContent, /read-only|not connected|connect.*service/i);
    assert.ok(page.find('[data-entitlement="export"]'));
    assert.equal(env.state.commands.length, 0); assert.equal(env.state.uploads.length, 0);
  } finally { page.close(); }
});

test('a JSON directory viewer never receives Add/Edit/Revoke controls', async () => {
  const policy = JSON.parse(readStarter('entitlements.json'));
  policy.records.push({ id: 'directory-reader', soeid: 'RD12345', displayName: 'Directory reader', scope: '*', permissions: ['entitlements.view'], active: true });
  const env = environment({ policy, actor: 'RD12345' }), page = await env.open();
  try {
    assert.equal(page.find('[data-entitlement="add"],[data-entitlement="edit"],[data-entitlement="revoke"]'), null);
    assert.ok(page.find('[data-entitlement="export"]')); assert.equal(env.state.commands.length, 0);
    assert.deepEqual(page.errors.map(error => error.message), []);
  } finally { page.close(); }
});
