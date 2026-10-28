'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Native = require('./native-confluence.js');

const location = { href: 'https://confluence.example/confluence/pages/viewpage.action?pageId=100' };
function page(id = '201', working = false, extra = {}) {
  return { id, type: 'page', title: 'Native job aid', version: { number: 4 }, space: { key: working ? 'WCSWORK' : 'WCS' }, ancestors: [{ id: working ? '200' : '100' }], operations: working ? [{ operation: 'update', targetType: 'page' }] : [], body: { view: { value: '<p>Native body.</p>' }, storage: { value: '<p>Native body.</p>' } }, ...extra };
}
function response(body, status = 200, extra = {}) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), ...extra }; }
function fixture(options = {}) {
  const calls = [];
  const pages = { '101': page('101'), '200': page('200', true, { ancestors: [] }), '201': page('201', true), ...options.pages };
  const fetch = async (url, init) => {
    calls.push({ url, init }); const u = new URL(url);
    if (options.respond) { const custom = await options.respond(u, init, calls); if (custom !== undefined) return custom; }
    if (u.pathname.endsWith('/rest/api/user/current')) return response({ type: 'known', username: 'ab12345', userKey: 'native-key', displayName: 'Example User' });
    if (u.pathname.endsWith('/rest/wcspedia/native')) {
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        return response(body.action.startsWith('prepare-') ? { workingPageId: '201' } : { committed: true, action: body.action, pageId: body.pageId, eventId: 'event-123' });
      }
      if (u.searchParams.get('view') === 'document') return response({ pageId: u.searchParams.get('pageId'), status: 'In review', expectedVersion: 4, submissionToken: 'server-bound-snapshot', capabilities: { edit: true, submit: true, 'complete-review': true, 'request-changes': true, approve: true, delete: true } });
      return response({ results: [{ id: '201', workflow: { status: 'In review', ownerName: 'Example Owner' } }], start: Number(u.searchParams.get('start')), limit: Number(u.searchParams.get('limit')), hasNext: false });
    }
    if (u.pathname.endsWith('/rest/api/content/search')) return response({ results: [u.searchParams.get('cql').includes('ancestor = 200') ? pages['201'] : pages['101']], start: Number(u.searchParams.get('start')), limit: Number(u.searchParams.get('limit')), _links: {} });
    if (u.pathname.endsWith('/property') || u.pathname.endsWith('/child/attachment')) return response({ results: [], start: Number(u.searchParams.get('start')) });
    const match = u.pathname.match(/\/rest\/api\/content\/(\d+)$/);
    if (match) return pages[match[1]] ? response(pages[match[1]]) : response({}, 404);
    throw new Error('Unexpected request: ' + url);
  };
  const config = { location, publishedRootPageId: '100', workingRootPageId: '200', publishedSpaceKey: 'WCS', workingSpaceKey: 'WCSWORK', nativeWorkflowEndpoint: '/confluence/rest/wcspedia/native', ...options.config };
  return { client: Native.create(config, fetch), calls, pages, config, fetch };
}

test('uses self-hosted endpoints with signed-in same-origin credentials and redirect protection', async () => {
  const { client, calls } = fixture();
  assert.equal((await client.currentUser()).username, 'ab12345');
  const doc = await client.getPage('101'); assert.equal(doc.body.storage.value, '<p>Native body.</p>');
  const request = new URL(calls[1].url); assert.equal(request.pathname, '/confluence/rest/api/content/101');
  for (const field of ['body.view', 'body.storage', 'version', 'space', 'ancestors', 'operations', 'metadata.labels']) assert.ok(request.searchParams.get('expand').includes(field));
  for (const { init } of calls) { assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.mode, 'same-origin'); assert.equal(init.headers.Authorization, undefined); }
  assert.equal(doc.owner, undefined); assert.equal(doc.approval, undefined, 'missing metadata is never fabricated');
});

test('builds native editor and reader URLs with a configurable context', () => {
  const { client } = fixture({ config: { contextPath: '/wiki', nativeWorkflowEndpoint: '' } });
  assert.equal(client.editorUrl('201'), 'https://confluence.example/wiki/pages/editpage.action?pageId=201');
  assert.equal(client.pageUrl(101), 'https://confluence.example/wiki/pages/viewpage.action?pageId=101');
  assert.throws(() => client.pageUrl('101&role=admin'));
});

test('explicit native-template mode opens the native chooser after authenticated read-only checks', async () => {
  const { client, calls } = fixture({ config: { authoringMode: 'native-template', nativeWorkflowEndpoint: '' } });
  const result = await client.prepareNativeCreate(); const url = new URL(result.editorUrl);
  assert.equal(url.pathname, '/confluence/pages/createpage-choosetemplate.action'); assert.equal(url.searchParams.get('spaceKey'), 'WCSWORK'); assert.equal(url.searchParams.get('newspaceKey'), 'WCSWORK'); assert.equal(url.searchParams.get('fromPageId'), '200');
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.init.method === 'GET')); assert.ok(calls.every(call => !call.url.includes('/rest/wcspedia/')));
});

test('native template fallback refuses anonymous users, public parents and wrong spaces', async () => {
  await assert.rejects(fixture().client.prepareNativeCreate(), e => e.code === 'CONFIGURATION');
  await assert.rejects(fixture({ config: { authoringMode: 'native-template' }, respond: u => u.pathname.endsWith('/user/current') ? response({ type: 'anonymous', username: 'guest' }) : undefined }).client.prepareNativeCreate(), e => e.code === 'UNAUTHENTICATED');
  for (const badParent of [page('200', false), page('200', true, { space: { key: 'OTHER' }, ancestors: [] })]) await assert.rejects(fixture({ config: { authoringMode: 'native-template' }, pages: { '200': badParent } }).client.prepareNativeCreate(), e => e.code === 'INVALID_SCOPE');
});

test('configuration refuses external, credentialed, escaped or out-of-context workflow endpoints', () => {
  for (const value of ['https://evil.example/confluence/workflow', '//evil.example/workflow', 'https://user:secret@confluence.example/confluence/workflow', '/other/workflow', '/confluence/%2e%2e/workflow', '/confluence/%252e/workflow', '/confluence/workflow?admin=true', '/confluence/workflow#frag', '/confluence/../other/workflow']) {
    assert.throws(() => fixture({ config: { nativeWorkflowEndpoint: value } }), undefined, value);
  }
  for (const config of [{ publishedRootPageId: '' }, { publishedRootPageId: 'ROOT_PLACEHOLDER' }, { publishedRootPageId: '100 OR 1=1' }, { workingRootPageId: '100' }, { contextPath: '//evil' }, { publishedSpaceKey: 'WCS" OR space != "' }]) assert.throws(() => fixture({ config }));
});

test('the real browser origin cannot be overridden by configuration', () => {
  const old = global.location;
  try { global.location = { href: 'https://actual.example/confluence/page' }; assert.throws(() => fixture({ config: { nativeWorkflowEndpoint: 'https://confluence.example/confluence/workflow' } }), /origin/); }
  finally { if (old === undefined) delete global.location; else global.location = old; }
});

test('CQL is scoped to the published tree with escaped literal full-text input and labels', async () => {
  const { client, calls } = fixture();
  const result = await client.search({ query: 'credit " OR ancestor=999 *', type: 'Job aid', area: 'Loan Management', region: 'EMEA', saved: true, sort: 'updated' });
  assert.match(result.cql, /^type = page AND space = "WCS" AND ancestor = 100 AND label = "wcspedia"/);
  assert.ok(result.cql.includes('label = "wcs-type-job-aid"')); assert.ok(result.cql.includes('label = "wcs-area-loan-management"')); assert.ok(result.cql.includes('label = "wcs-region-emea"'));
  assert.ok(result.cql.includes('favourite = currentUser()')); assert.ok(result.cql.endsWith('ORDER BY lastmodified DESC'));
  assert.ok(result.cql.includes('\\\\*'), 'wildcard has a literal Lucene escape wrapped in CQL escaping');
  assert.equal(new URL(calls[0].url).pathname, '/confluence/rest/api/content/search');
  assert.equal(result.totalSize, null); assert.equal(result.hasNext, false); assert.equal(result.nextStart, null);
});

test('working search uses the separately configured root and space', async () => {
  const { client } = fixture(); const result = await client.search({ scope: 'working', sort: 'title' });
  assert.match(result.cql, /space = "WCSWORK" AND ancestor = 200/); assert.ok(result.cql.endsWith('ORDER BY title ASC'));
  await assert.rejects(fixture({ config: { workingRootPageId: null } }).client.search({ scope: 'working' }), /working root/);
});

test('search rejects raw CQL, arbitrary ordering, invalid pagination and facet injection', async () => {
  const { client, calls } = fixture();
  for (const options of [{ cql: 'space = PRIVATE' }, { sort: 'popular' }, { sort: 'updated DESC' }, { scope: 'all' }, { type: 'Job aid" OR label="admin' }, { start: -1 }, { start: 0.5 }, { limit: 101 }, { query: 'a'.repeat(501) }, { saved: 'yes' }]) await assert.rejects(client.search(options));
  assert.equal(calls.length, 0);
});

test('search refuses page results outside its scoped library', async () => {
  const { client } = fixture({ respond: u => u.pathname.endsWith('/search') ? response({ results: [page('700', false, { ancestors: [{ id: '999' }] })] }) : undefined });
  await assert.rejects(client.search(), e => e.code === 'INVALID_SCOPE');
});

test('published search excludes the working root and descendants even when roots were nested incorrectly', async () => {
  for (const badPage of [page('200', false), page('201', false, { ancestors: [{ id: '100' }, { id: '200' }] })]) {
    const { client, calls } = fixture({ respond: u => u.pathname.endsWith('/search') ? response({ results: [badPage] }) : undefined });
    await assert.rejects(client.search(), e => e.code === 'INVALID_SCOPE');
    const cql = new URL(calls[0].url).searchParams.get('cql'); assert.ok(cql.includes('id != 200')); assert.ok(cql.includes('ancestor != 200'));
    assert.equal(calls.length, 1, 'readers need not read the private authoring root for the exclusion to apply');
  }
});

test('working search and workspace reject published ancestry regardless of the returned space', async () => {
  const nested = page('201', true, { ancestors: [{ id: '100' }, { id: '200' }] });
  const { client, calls } = fixture({ respond: u => u.pathname.endsWith('/search') ? response({ results: [nested] }) : undefined });
  await assert.rejects(client.search({ scope: 'working' }), e => e.code === 'INVALID_SCOPE');
  const cql = new URL(calls[0].url).searchParams.get('cql'); assert.ok(cql.includes('id != 100')); assert.ok(cql.includes('ancestor != 100'));
  const workspace = fixture({ pages: { '201': nested } }).client;
  await assert.rejects(workspace.workspace({ role: 'mine' }), e => e.code === 'INVALID_SCOPE');
  await assert.rejects(workspace.prepareEdit('201'), e => e.code === 'INVALID_SCOPE');
});

test('search exposes accurate pagination without inventing total counts', async () => {
  const { client } = fixture({ respond: u => u.pathname.endsWith('/search') ? response({ results: [page('101')], start: 5, _links: { next: 'https://evil.example/?session=leak' } }) : undefined });
  const result = await client.search({ start: 5, limit: 1 }); assert.equal(result.nextStart, 6); assert.equal(result.hasNext, true); assert.equal(result.totalSize, null);
});

test('properties and attachments paginate using the original endpoint, never next-link URLs', async () => {
  const { client, calls } = fixture({ respond: u => {
    const start = Number(u.searchParams.get('start'));
    if (u.pathname.endsWith('/property')) return response({ results: [{ key: 'wcs.' + start, value: { owner: null } }], start, _links: start ? {} : { next: 'https://evil.example/?leak=1' } });
    if (u.pathname.endsWith('/child/attachment')) return response({ results: [{ id: String(500 + start), type: 'attachment', title: 'Evidence.pdf', version: { number: 2 } }], start, hasNext: start === 0 });
  } });
  assert.equal((await client.getProperties('101')).length, 2); assert.equal((await client.attachments('101')).length, 2);
  assert.equal(calls.length, 4); assert.ok(calls.every(c => c.url.startsWith('https://confluence.example/confluence/rest/api/content/101/')));
  assert.equal(new URL(calls[1].url).searchParams.get('start'), '1');
});

test('collection pagination rejects non-advancing, duplicate and unbounded responses', async () => {
  await assert.rejects(fixture({ respond: () => response({ results: [], hasNext: true }) }).client.getProperties('101'), /non-advancing/);
  await assert.rejects(fixture({ respond: u => response({ results: [{ key: 'duplicate', value: {} }], start: Number(u.searchParams.get('start')), hasNext: true }) }).client.getProperties('101'), /repeated/);
  const { client, calls } = fixture({ respond: u => response({ results: [{ key: 'unique-' + u.searchParams.get('start'), value: {} }], start: Number(u.searchParams.get('start')), hasNext: true }) });
  await assert.rejects(client.getProperties('101'), e => e.code === 'COLLECTION_LIMIT'); assert.equal(calls.length, 20);
});

test('native edit requires working ancestry, working space and a native update operation', async () => {
  const good = fixture(); const prepared = await good.client.prepareEdit('201'); assert.equal(prepared.workingPageId, '201'); assert.equal(prepared.snapshot.version, 4); assert.equal(good.calls.length, 1);
  for (const extra of [{ operations: [] }, { operations: [{ operation: 'delete', targetType: 'page' }] }, { operations: [{ operation: 'update', targetType: 'attachment' }] }, { space: { key: 'OTHER' } }, { ancestors: [{ id: '999' }] }, { ancestors: [{ id: '100' }, { id: '200' }], space: { key: 'WCS' } }]) await assert.rejects(fixture({ pages: { '201': page('201', true, extra) } }).client.prepareEdit('201'));
});

test('public Edit goes through prepare-edit and verifies the returned working page', async () => {
  const { client, calls } = fixture(); const result = await client.prepareEdit('101'); assert.equal(result.workingPageId, '201');
  const command = JSON.parse(calls[1].init.body); assert.equal(command.action, 'prepare-edit'); assert.equal(command.pageId, '101'); assert.equal(command.expectedVersion, 4); assert.deepEqual(command.snapshot, { pageId: '101', version: 4 });
  await assert.rejects(fixture({ config: { nativeWorkflowEndpoint: '' } }).client.prepareEdit('101'), e => e.code === 'WORKFLOW_UNAVAILABLE');
});

test('create uses only prepare-create, then verifies a working page before returning an editor URL', async () => {
  const { client, calls } = fixture(); const result = await client.createWorkingPage({ title: ' New training ', type: 'Training', summary: 'A recorded workshop.' });
  assert.equal(result.workingPageId, '201'); const command = JSON.parse(calls[0].init.body); assert.equal(command.action, 'prepare-create'); assert.equal(command.title, 'New training');
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 1); assert.ok(calls.every(c => !c.url.includes('/child/attachment')));
  await assert.rejects(client.createWorkingPage({ title: 'Unsafe owner', type: 'Blog', role: 'Manager' }), /Unsupported/);
});

test('prepare actions reject arbitrary editor redirects, invalid IDs and public page targets', async () => {
  for (const body of [{ editorUrl: 'https://evil.example/' }, { workingPageId: '201&next=evil' }, { workingPageId: '101' }]) {
    const { client } = fixture({ respond: (u, init) => init.method === 'POST' ? response(body) : undefined });
    await assert.rejects(client.createWorkingPage({ title: 'Training', type: 'Training' }));
  }
});

test('workflow decisions bind the version and server snapshot without browser identity authority', async () => {
  const { client, calls } = fixture(); const state = await client.getWorkflowState('201'); assert.equal(state.capabilities['complete-review'], true);
  await client.submit('approve', { pageId: '201', expectedVersion: 4, comment: 'Reviewed the complete saved revision.' });
  const command = JSON.parse(calls.at(-1).init.body); assert.equal(command.submissionToken, 'server-bound-snapshot'); assert.deepEqual(command.snapshot, { pageId: '201', version: 4 });
  assert.equal(command.actorId, undefined); assert.equal(command.role, undefined); assert.equal(command.userId, undefined);
  assert.equal(calls.at(-1).init.headers['X-Requested-With'], 'XMLHttpRequest');
  await assert.rejects(client.submit('approve', { pageId: '201', expectedVersion: 4, comment: 'Repeat' }), e => e.code === 'WORKFLOW_SNAPSHOT_REQUIRED');
});

test('decisions fail for missing snapshot, stale native revision, unknown fields and unsupported action', async () => {
  const { client, pages, calls } = fixture();
  await assert.rejects(client.submit('approve', { pageId: '201', expectedVersion: 4, comment: 'Decision' }), e => e.code === 'WORKFLOW_SNAPSHOT_REQUIRED');
  await client.getWorkflowState('201'); pages['201'].version.number = 5;
  await assert.rejects(client.submit('approve', { pageId: '201', expectedVersion: 4, comment: 'Decision' }), e => e.code === 'CONFLICT');
  await assert.rejects(client.submit('approve', { pageId: '201', expectedVersion: 4, comment: 'Decision', actorId: 'admin' }), /Unsupported/);
  await assert.rejects(client.submit('publish-without-review', {}), /Unsupported/);
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 0);
});

test('workflow writes require an exact committed action receipt including an audit event', async () => {
  for (const body of [{}, { ok: true }, { error: 'Denied' }, { committed: false, action: 'delete', pageId: '201', eventId: 'event' }, { committed: true, action: 'approve', pageId: '201', eventId: 'event' }, { committed: true, action: 'delete', pageId: '999', eventId: 'event' }, { committed: true, action: 'delete', pageId: '201', eventId: '' }]) {
    const { client } = fixture({ respond: (u, init) => init.method === 'POST' ? response(body) : undefined });
    await client.getWorkflowState('201'); await assert.rejects(client.submit('delete', { pageId: '201', expectedVersion: 4, comment: 'Retire obsolete duplicate.' }), e => e.code === 'UNCONFIRMED_WRITE');
  }
});

test('mutable workflow state requires a server snapshot token and exact boolean capabilities', async () => {
  for (const payload of [{ expectedVersion: 4, capabilities: { approve: true } }, { expectedVersion: 4, capabilities: { approve: 'yes' }, submissionToken: 'token' }, { expectedVersion: 4, capabilities: { admin: true }, submissionToken: 'token' }, { pageId: '999', expectedVersion: 4, capabilities: {} }]) await assert.rejects(fixture({ respond: u => u.searchParams.get('view') === 'document' ? response(payload) : undefined }).client.getWorkflowState('201'));
  const readonly = await fixture({ respond: u => u.searchParams.get('view') === 'document' ? response({ expectedVersion: 4, capabilities: {} }) : undefined }).client.getWorkflowState('201');
  assert.equal(readonly.capabilities.approve, false); assert.equal(readonly.status, undefined);
});

test('workspaces pass bounded filters and re-read each native page for current access and operations', async () => {
  const { client, calls } = fixture(); const result = await client.workspace({ role: 'review', query: 'credit', type: 'Job aid', region: 'EMEA', sort: 'updated', start: 0, limit: 12 });
  assert.equal(result.results[0].workflow.ownerName, 'Example Owner'); assert.equal(result.results[0].operations[0].operation, 'update');
  const url = new URL(calls[0].url); assert.equal(url.searchParams.get('view'), 'review'); assert.equal(url.searchParams.get('type'), 'Job aid'); assert.equal(calls.length, 2);
  await assert.rejects(client.workspace({ role: 'administrator' }));
});

test('workspaces fail closed for stale access or public/outside working pages', async () => {
  await assert.rejects(fixture({ respond: u => u.searchParams.get('view') === 'mine' ? response({ results: [{ id: '101' }] }) : undefined }).client.workspace({ role: 'mine' }), e => e.code === 'INVALID_SCOPE');
  await assert.rejects(fixture({ respond: u => u.pathname.endsWith('/content/201') ? response({}, 403) : undefined }).client.workspace({ role: 'review' }), e => e.code === 'FORBIDDEN');
});

test('HTTP errors are explicit and writes are never automatically retried', async () => {
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [500, 'HTTP_ERROR']]) {
    const { client, calls } = fixture({ respond: () => response({}, status) }); await assert.rejects(client.getPage('201'), e => e.code === code && e.status === status); assert.equal(calls.length, 1);
  }
  const { client, calls } = fixture({ respond: (u, init) => { if (init.method === 'POST') throw new Error('connection lost after write'); } });
  await assert.rejects(client.createWorkingPage({ title: 'New document', type: 'Job aid' }), /outcome is unknown/); assert.equal(calls.length, 1);
});

test('redirects and non-JSON login pages are refused', async () => {
  await assert.rejects(fixture({ respond: () => response({}, 200, { redirected: true }) }).client.currentUser(), e => e.code === 'REDIRECT');
  await assert.rejects(fixture({ respond: () => response({}, 200, { url: 'https://evil.example/result' }) }).client.currentUser());
  await assert.rejects(fixture({ respond: () => ({ ok: true, status: 200, text: async () => '<html>Sign in</html>' }) }).client.currentUser(), e => e.code === 'INVALID_RESPONSE');
});

test('wrong page IDs and unsupported non-page content fail without metadata inference', async () => {
  for (const value of [page('999'), { ...page('201'), type: 'blogpost' }, { ...page('201'), version: {} }]) await assert.rejects(fixture({ respond: () => response(value) }).client.getPage('201'));
});
