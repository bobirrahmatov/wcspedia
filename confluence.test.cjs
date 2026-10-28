'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./confluence.js');
const W = require('./workflow.js');
const G = require('./governance.js');
const Search = require('./search.js');
const Entitlements = require('./entitlements.js');
const location = { href: 'https://intranet.example/confluence/pages/viewpage.action?pageId=123' };
const people = [
  { id: 'a', name: 'Author', role: 'Author', confluence: { userKey: 'key-a', username: 'author' } },
  { id: 'b', name: 'Manager', role: 'Manager', confluence: { userKey: 'key-b', username: 'manager' } }
];
const fields = { id: 'aide', reference: 'WCS-1', type: 'Job aid', area: 'loans', ownerId: 'a', authorId: 'a', reviewerId: 'b', approverId: 'b', title: 'A job aid', summary: 'Sample summary', sections: [{ id: 'one', title: 'Start here', paragraphs: ['Read the approved record.'], bullets: [] }] };
function workingFixture() { return { schemaVersion: 1, isDemo: true, people: structuredClone(people), areas: [{ id: 'loans', title: 'Loan Management' }], documents: [{ ...W.createDocument(fields, { people, actorId: 'a', now: '2026-10-15T08:00:00Z' }), confluencePageId: '987' }] }; }
function fixture() {
  const data = workingFixture(); let doc = data.documents[0];
  for (const [action, actorId] of [['submit','a'],['complete-review','b'],['approve','b']]) doc = W.transition(doc, action, { actorId, people, expectedVersion: 1, expectedRevision: 1, expectedAuditLength: doc.audit.length, comment: 'Sample.', now: '2026-10-15T08:00:00Z', effectiveAt: '2026-10-15T08:00:00Z', nextReviewAt: '2027-10-15' });
  doc.audit = []; data.documents = [doc]; return data;
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) }; }
function server(options = {}) {
  const state = { calls: [], version: 3, data: fixture(), user: { type: 'known', userKey: 'key-b', username: 'manager', displayName: 'Manager' }, policy: { schemaVersion: 1, revision: 1, records: [{ id: 'manager-grant', soeid: 'MANAGER', displayName: 'Manager', scope: '*', permissions: [...Entitlements.PERMISSIONS], active: true }], audit: [] }, ...options };
  const fetch = async (url, init) => {
    state.calls.push({ url, init });
    const u = new URL(url);
    if (u.pathname.endsWith('/rest/api/user/current')) return response(state.user);
    if (u.pathname.endsWith('/rest/api/content/123') && u.searchParams.get('expand') === 'space') {
      if (state.rootWait) await state.rootWait;
      return response(state.rootPage || { id: '123', type: 'page', space: { key: 'WCS' } }, state.rootStatus || 200);
    }
    if (/\/rest\/api\/content\/\d+$/.test(u.pathname) && u.searchParams.get('expand') === 'operations,version') {
      const id = u.pathname.split('/').pop();
      const operations = state.pageOperations?.[id] || ['read', 'create', 'update'];
      return response({ id, operations: operations.map(operation => ({ operation, targetType: 'page' })), version: { number: 1 } });
    }
    if (u.pathname.endsWith('/child/attachment') && u.searchParams.get('filename') === 'entitlements.json') return response({ results: [{ id: '457', title: 'entitlements.json', version: { number: 1 } }] });
    if (u.pathname.endsWith('/entitlements.json')) return response(state.policy);
    if (u.pathname.endsWith('/child/attachment')) return response({ results: [{ id: '456', title: 'wcspedia-published.json', version: { number: state.version }, _links: { download: 'https://evil.example/leak' } }] });
    if (u.pathname.includes('/download/attachments/')) return response(state.data);
    if (u.pathname.endsWith('/attachment/456/data')) {
      if (state.uploadStatus) return response({}, state.uploadStatus);
      if (state.uploadNetworkError) throw new Error('lost response');
      state.data = JSON.parse(await init.body.get('file').text()); state.version += state.raceAfterUpload ? 2 : 1;
      return response({ id: '456', version: { number: state.version } });
    }
    if (u.pathname.endsWith('/rest/wcspedia/workspace')) {
      if (u.searchParams.get('capabilitiesOnly') === 'true') return response(state.creationCapability || { rootPageId: '123', identity: Entitlements.identity(state.user), canCreateDocument: false }, state.workspaceStatus || 200);
      return response(state.workspaceData || { data: state.data }, state.workspaceStatus || 200);
    }
    if (u.pathname.endsWith('/rest/wcspedia/workflow')) {
      if (state.workflowNetworkError) throw new Error('lost response');
      if (state.workflowStatus) return response({}, state.workflowStatus);
      state.version++;
      return response({ ok: true });
    }
    if (u.pathname.endsWith('/rest/api/search')) return response(state.searchResponse || { results: [], totalSize: 0 });
    return response(state.data);
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', contextPath: '/confluence', ...options.config, search: options.config?.search === false ? false : { transport: 'search', ...options.config?.search } }, { fetch, location, search: Search });
  return { state, adapter, fetch };
}
function reviewEvidence() { return {baselineVersion:G.BASELINE_VERSION,version:1,revision:1,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'clear',reason:'Reviewed for the applicable document profile.'}; }
function command(overrides = {}) { return { governanceReview: reviewEvidence(), action: 'complete-review', docId: 'aide', expectedVersion: 1, expectedRevision: 1, expectedAuditLength: 2, comment: 'Review complete.', ...overrides }; }

test('local mode loads the JSON file and retains the explicit demo flag', async () => {
  const calls = [];
  const adapter = C.create({ mode: 'local', dataUrl: './wcspedia-data.json', localActorId: 'b' }, { location: { href: 'http://localhost:4173/wcspedia-local.html' }, fetch: async (...args) => { calls.push(args); return response(fixture()); } });
  const session = await adapter.load();
  assert.equal(calls[0][0], 'http://localhost:4173/wcspedia-data.json');
  assert.equal(session.actorId, 'b'); assert.equal(session.mode, 'local'); assert.equal(session.data.isDemo, true);
  assert.equal(session.canSubmit, false); assert.equal(session.attachmentVersion, null);
});

test('live load pins attachment version and maps the signed-in identity', async () => {
  const { adapter, state } = server();
  const session = await adapter.load();
  assert.equal(session.actorId, 'b'); assert.equal(session.attachmentVersion, 3); assert.equal(session.attachmentId, '456');
  assert.equal(session.canSubmit, false); assert.equal(session.canWriteAttachment, false);
  assert.equal(session.data.isDemo, true, 'a sample dataset is never relabeled as production');
  const download = new URL(state.calls.find(c => c.url.includes('/wcspedia-published.json')).url);
  assert.equal(download.origin, 'https://intranet.example'); assert.equal(download.searchParams.get('version'), null);
  assert.equal(download.pathname, '/confluence/download/attachments/123/wcspedia-published.json');
  state.calls.forEach(c => { assert.equal(c.init.credentials, 'same-origin'); assert.equal(c.init.redirect, 'error'); });
  assert.equal(adapter.info().attachmentPageId, '123');
});

test('separate attachment host leaves CQL and workspace workflow roots on the landing page', async () => {
  const { adapter, state } = server({ config: { attachmentPageId: '789', workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  await adapter.load();
  assert.equal(adapter.info().attachmentPageId, '789');
  assert.equal(adapter.info().rootPageId, '123');
  const paths = state.calls.map(call => new URL(call.url).pathname);
  assert.ok(paths.includes('/confluence/rest/api/content/789/child/attachment'));
  assert.ok(paths.includes('/confluence/download/attachments/789/wcspedia-published.json'));
  assert.equal(paths.some(path => /(?:content|attachments)\/123\/(?:child\/attachment|wcspedia-published)/.test(path)), false);
  assert.equal(new URL(state.calls.find(call => call.url.includes('/workspace')).url).searchParams.get('rootPageId'), '123');
  const search = await adapter.searchPages({ scope: 'tree' });
  assert.match(search.cql, /ancestor = 123/);
  assert.match(search.cql, /id NOT IN \(123, 789\)/);
  await adapter.submitAction(command());
  const posted = JSON.parse(state.calls.find(call => call.init.method === 'POST').init.body);
  assert.equal(posted.rootPageId, '123');
  assert.equal('attachmentPageId' in posted, false);
});

test('attachment host requires a numeric page ID and empty configuration retains the root', () => {
  for (const attachmentPageId of ['0', '-1', '1.2', '123/child', '123 OR 1=1', ' 123 ', false, {}]) {
    assert.throws(() => server({ config: { attachmentPageId } }), error => error.code === 'CONFIGURATION');
  }
  for (const attachmentPageId of ['', null, undefined]) assert.equal(server({ config: { attachmentPageId } }).adapter.info().attachmentPageId, '123');
  assert.equal(server({ config: { attachmentPageId: 789 } }).adapter.info().attachmentPageId, '789');
});

test('empty live starter maps the authenticated user without sample people or write grants', async () => {
  const data={schemaVersion:1,isDemo:false,people:[],areas:[{id:'loans',title:'Loan Management'}],documents:[]};
  const {adapter}=server({data});
  const session=await adapter.load();
  assert.equal(session.data.documents.length,0);
  assert.equal(session.data.people.length,1);
  assert.equal(session.actor.name,'Manager');
  assert.equal(session.actor.role,'Reader');
  assert.equal(session.identityMapped,false);
  assert.equal(session.canSubmit,false);
  assert.equal(session.canWriteAttachment,false);
  assert.throws(()=>C.validateData({...data,documents:fixture().documents}),/directory records/);
});

test('unmapped users are read-only and are not matched by display name', async () => {
  const { adapter } = server({ user: { type: 'known', username: 'somebodyelse', displayName: 'Manager' }, config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', allowAttachmentWrites: true } });
  const session = await adapter.load();
  assert.equal(session.actor.role, 'Reader'); assert.equal(session.identityMapped, false); assert.equal(session.canSubmit, false); assert.equal(session.canWriteAttachment, false);
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'READ_ONLY');
});

test('anonymous identity cannot assume a matching workflow account', async () => {
  const { adapter } = server({ user: { type: 'anonymous', userKey: 'key-b' } });
  assert.equal((await adapter.load()).actor.role, 'Reader');
});

test('a reused username does not override a conflicting user key', async () => {
  const { adapter } = server({ user: { type: 'known', userKey: 'different-key', username: 'manager' } });
  assert.equal((await adapter.load()).actor.role, 'Reader');
});

test('reader attachment containing drafts or audit events fails closed', async () => {
  await assert.rejects(server({ data: workingFixture() }).adapter.load(), error => error.code === 'PUBLISHED_PROJECTION_REQUIRED');
  const data = fixture(); data.documents[0].audit = workingFixture().documents[0].audit;
  await assert.rejects(server({ data }).adapter.load(), error => error.code === 'PUBLISHED_PROJECTION_REQUIRED');
});

test('mapped reviewer loads the authorized workspace projection before enabling decisions', async () => {
  const workspace = workingFixture();
  const { adapter, state } = server({ workspaceData: { data: workspace }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  const session = await adapter.load();
  assert.equal(session.data.documents[0].versions[0].status, 'Draft'); assert.equal(session.workspaceLoaded, true); assert.equal(session.canSubmit, true);
  const request = state.calls.find(c => c.url.includes('/rest/wcspedia/workspace'));
  assert.equal(new URL(request.url).searchParams.get('rootPageId'), '123'); assert.equal(request.init.method, 'GET');
});

test('a newly entitled author bootstraps from the trusted workspace without a public directory entry', async () => {
  const data = { schemaVersion: 1, isDemo: false, people: [], areas: fixture().areas, documents: [] };
  const { adapter, state } = server({ data, workspaceData: { data: workingFixture() }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  const session = await adapter.load();
  assert.equal(session.actorId, 'b');
  assert.equal(session.identityMapped, true);
  assert.equal(session.workspaceLoaded, true);
  assert.equal(session.canSubmit, true);
  assert.equal(session.effectivePermissions['content.create'], true);
  assert.equal(state.calls.filter(call => call.url.includes('/rest/wcspedia/workspace')).length, 1);
});

test('an assigned reviewer can bootstrap without a public directory record or create entitlement', async () => {
  const data = { schemaVersion: 1, isDemo: false, people: [], areas: fixture().areas, documents: [] };
  const { adapter } = server({ data, policy: { schemaVersion: 1, revision: 1, records: [], audit: [] }, workspaceData: { data: workingFixture() }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  const session = await adapter.load();
  assert.equal(session.actorId, 'b'); assert.equal(session.workspaceLoaded, true);
  assert.equal(session.effectivePermissions['content.create'], false);
  assert.equal(session.canSubmit, true);
});

test('Data Center creation can use a trusted actor-bound capability when content operations omit Add Page', async () => {
  const options = { pageOperations: { '123': ['read'] }, config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } };
  const { adapter, state } = server(options);
  state.creationCapability = { rootPageId: '123', identity: Entitlements.identity(state.user), canCreateDocument: true };
  assert.equal((await adapter.loadAccess()).effectivePermissions['content.create'], true);
  assert.equal(state.calls.filter(call => call.url.includes('capabilitiesOnly=true')).length, 1);
  state.creationCapability.canCreateDocument = false;
  assert.equal((await adapter.loadAccess()).effectivePermissions['content.create'], false, 'Revoked destination permission is rechecked');
  state.creationCapability.canCreateDocument = true; state.policy.records = [];
  const before = state.calls.filter(call => call.url.includes('capabilitiesOnly=true')).length;
  assert.equal((await adapter.loadAccess()).effectivePermissions['content.create'], false, 'No service capability can replace the JSON grant');
  assert.equal(state.calls.filter(call => call.url.includes('capabilitiesOnly=true')).length, before);
});

test('creation fallback rejects wrong library, identity, missing immutable key and non-boolean proofs', async () => {
  for (const mutate of [proof => { proof.rootPageId = '999'; }, proof => { proof.identity.soeid = 'OTHER'; }, proof => { delete proof.identity.userKey; }, proof => { proof.canCreateDocument = 'true'; }]) {
    const { adapter, state } = server({ pageOperations: { '123': ['read', 'update'] }, config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
    state.creationCapability = { rootPageId: '123', identity: Entitlements.identity(state.user), canCreateDocument: true };
    mutate(state.creationCapability);
    await assert.rejects(adapter.loadAccess(), error => error.code === 'INVALID_PERMISSIONS');
  }
});

test('read-only authorized workspace cannot submit merely because its caller was mapped', async () => {
  const data = { schemaVersion: 1, isDemo: false, people: [], areas: fixture().areas, documents: [] };
  const workspace = { ...data, people: [{ ...people[1], role: 'Reader' }] };
  const { adapter } = server({ data, policy: { schemaVersion: 1, revision: 1, records: [], audit: [] }, workspaceData: { data: workspace }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  const session = await adapter.load();
  assert.equal(session.workspaceLoaded, true); assert.equal(session.identityMapped, true);
  assert.equal(session.canSubmit, false); assert.equal(session.effectivePermissions['content.create'], false);
});

test('trusted workspace bootstrap still rejects conflicting or missing identity mappings', async () => {
  for (const replacement of [{ userKey: 'other-key', username: 'manager' }, { userKey: 'key-b', username: 'otheruser' }]) {
    const data = { schemaVersion: 1, isDemo: false, people: [], areas: fixture().areas, documents: [] };
    const workspace = workingFixture(); workspace.people[1].confluence = replacement;
    const { adapter } = server({ data, workspaceData: { data: workspace }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
    await assert.rejects(adapter.load(), error => error.code === 'IDENTITY_MAPPING');
  }
  const workspace = workingFixture(); workspace.people[1].id = 'changed-person';
  workspace.documents = [];
  const { adapter } = server({ workspaceData: { data: workspace }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await assert.rejects(adapter.load(), error => error.code === 'IDENTITY_MAPPING');
});

test('anonymous sessions cannot use a matching SOEID grant to bootstrap a workspace', async () => {
  const { adapter, state } = server({ user: { type: 'anonymous', username: 'manager' }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  assert.equal((await adapter.load()).canSubmit, false);
  assert.equal(state.calls.some(call => call.url.includes('/rest/wcspedia/workspace')), false);
});

test('review endpoint alone cannot enable actions without authorized workspace data', async () => {
  const { adapter } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  assert.equal((await adapter.load()).canSubmit, false);
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'READ_ONLY');
});

test('workspace access failure is shown rather than replaced with local data', async () => {
  const { adapter } = server({ workspaceStatus: 403, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await assert.rejects(adapter.load(), error => error.status === 403);
});

test('an authenticated workspace request never grants access when its directory cannot map the caller', async () => {
  const { adapter, state } = server({ user: { type: 'known', username: 'reader' }, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await assert.rejects(adapter.load(), error => error.code === 'IDENTITY_MAPPING');
  assert.equal(state.calls.some(c => c.url.includes('/rest/wcspedia/workspace')), true);
});

test('ambiguous identity mappings fail instead of selecting a privileged person', async () => {
  const data = fixture(); data.people[0].confluence = { userKey: 'key-b' };
  const { adapter } = server({ data });
  await assert.rejects(adapter.load(), error => error.code === 'IDENTITY_MAPPING');
});

test('configuration cannot escape the Confluence origin or context', () => {
  for (const config of [
    { baseUrl: 'https://evil.example/confluence' }, { contextPath: '/confluence/../other' },
    { workflowEndpoint: 'https://evil.example/approve' }, { workflowEndpoint: '/outside/approve' },
    { workflowEndpoint: '/confluence/../../approve' }, { workflowEndpoint: '/confluence/%2f../approve' }, { workflowEndpoint: '/confluence/%252f../approve' }, { attachmentFilename: '../secret.json' }, { rootPageId: '123 OR 1=1' }
  ]) assert.throws(() => server({ config }), error => error.code === 'CONFIGURATION');
  assert.throws(() => C.create({ mode: 'local', dataUrl: 'https://evil.example/data.json' }, { location, fetch: async () => {} }), /origin/);
});

test('invalid live JSON and API access errors do not fall back to sample data', async () => {
  const malformed = server({ data: '<html>Sign in</html>' });
  await assert.rejects(malformed.adapter.load(), error => error.code === 'INVALID_JSON');
  const adapter = C.create({ mode: 'confluence', rootPageId: '123' }, { location, fetch: async () => response({}, 403) });
  await assert.rejects(adapter.load(), error => error.status === 403);
});

test('schema rejects wrong references, missing sections and invalid approved pointers', () => {
  const missing = fixture(); missing.documents[0].ownerId = 'absent'; assert.throws(() => C.validateData(missing), /ownerId/);
  const content = fixture(); content.documents[0].versions[0].sections = []; assert.throws(() => C.validateData(content), /sections/);
  const pointer = fixture(); pointer.documents[0].publishedVersion = 99; assert.throws(() => C.validateData(pointer), /published version/);
  assert.throws(() => C.validateData({ ...fixture(), schemaVersion: 2 }), /Unsupported/);
});

test('live actions require a configured server and do not invoke an attachment upload', async () => {
  const { adapter, state } = server(); await adapter.load();
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'READ_ONLY');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('workflow command strips client identity and approval timestamps, then reloads', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await adapter.load();
  const session = await adapter.submitAction(command({ action: 'approve', nextReviewAt: '2027-10-15', actorId: 'forged', role: 'Manager', people, effectiveAt: '1990-01-01', approvedAt: '1990-01-01' }));
  const posted = JSON.parse(state.calls.find(c => c.init.method === 'POST').init.body);
  assert.equal(posted.rootPageId, '123'); assert.equal(posted.expectedAttachmentVersion, 3); assert.equal(posted.nextReviewAt, '2027-10-15');
  ['actorId', 'role', 'people', 'effectiveAt', 'approvedAt'].forEach(key => assert.equal(key in posted, false));
  assert.equal(session.attachmentVersion, 4); assert.equal(state.calls.filter(c => c.url.includes('/wcspedia-published.json')).length, 2);
});

test('workflow edit accepts only document content fields', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } }); await adapter.load();
  await adapter.submitAction(command({ action: 'edit', changes: { title: 'Edited title', status: 'Published', approvedBy: 'b', audit: [] } }));
  assert.deepEqual(JSON.parse(state.calls.find(c => c.init.method === 'POST').init.body).changes, { title: 'Edited title' });
});

test('workflow create preserves assignments but strips supplied audit and approval metadata', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } }); await adapter.load();
  await adapter.submitAction({ action: 'create', comment: 'Create new content.', fields: { ...fields, audit: [], status: 'Published', approvedBy: 'b' } });
  const posted = JSON.parse(state.calls.find(c => c.init.method === 'POST').init.body);
  assert.equal(posted.fields.authorId, 'a'); assert.equal('audit' in posted.fields, false); assert.equal('status' in posted.fields, false);
});

test('server rejects stale workflow action without an automatic retry', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' }, workflowStatus: 409 }); await adapter.load();
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'CONFLICT');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 1);
});

test('lost workflow response reuses an idempotency key on the same command', async () => {
  const { adapter, state } = server({ workflowNetworkError: true, config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } }); await adapter.load();
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'UNKNOWN_COMMIT');
  state.workflowNetworkError = false;
  await adapter.submitAction(command());
  const posts = state.calls.filter(c => c.init.method === 'POST').map(c => JSON.parse(c.init.body));
  assert.equal(posts.length, 2); assert.equal(posts[0].requestId, posts[1].requestId); assert.match(posts[0].requestId, /^[\da-f-]{36}$/);
});

test('direct attachment writes are disabled by default', async () => {
  const { adapter, state } = server(); await adapter.load();
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'READ_ONLY');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('administrative upload refuses to expose drafts on the reader attachment', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true } }); await adapter.load();
  await assert.rejects(adapter.saveAttachment(workingFixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'PUBLISHED_PROJECTION_REQUIRED');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('administrative upload checks current version before multipart upload and verifies readback', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true } }); await adapter.load();
  const data = fixture(); data.documents[0].versions[0].title = 'Updated title';
  const session = await adapter.saveAttachment(data, { expectedAttachmentVersion: 3, comment: 'Controlled administrative import.' });
  const upload = state.calls.find(c => c.init.method === 'POST');
  assert.equal(new URL(upload.url).pathname, '/confluence/rest/api/content/123/child/attachment/456/data');
  assert.equal(upload.init.headers['X-Atlassian-Token'], 'nocheck'); assert.equal(upload.init.headers['Content-Type'], undefined);
  assert.equal(upload.init.body.get('file').name, 'wcspedia-published.json'); assert.equal(upload.init.body.get('minorEdit'), 'false');
  assert.equal(session.attachmentVersion, 4); assert.equal(session.data.documents[0].versions[0].title, 'Updated title');
});

test('administrative uploads and readback use the separate attachment host', async () => {
  const { adapter, state } = server({ config: { attachmentPageId: '789', allowAttachmentWrites: true } });
  assert.equal((await adapter.load()).canWriteAttachment, true);
  const data = fixture(); data.documents[0].versions[0].title = 'Updated reader snapshot';
  const session = await adapter.saveAttachment(data, { expectedAttachmentVersion: 3, comment: 'Controlled import to the assets page.' });
  const upload = state.calls.find(call => call.init.method === 'POST');
  assert.equal(new URL(upload.url).pathname, '/confluence/rest/api/content/789/child/attachment/456/data');
  assert.ok(state.calls.filter(call => call.url.includes('/download/attachments/')).every(call => new URL(call.url).pathname.includes('/attachments/789/')));
  assert.equal(session.attachmentVersion, 4);
  assert.equal(session.data.documents[0].versions[0].title, 'Updated reader snapshot');
});

test('administrative write permission is checked on the actual host and rechecked before upload', async () => {
  const { adapter, state } = server({ pageOperations: { '123': ['read', 'update'], '789': ['read'] }, config: { attachmentPageId: '789', allowAttachmentWrites: true } });
  assert.equal((await adapter.load()).canWriteAttachment, false, 'root edit permission must not grant asset-page writes');
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import.' }), error => error.code === 'READ_ONLY');
  state.pageOperations['789'] = ['read', 'update'];
  assert.equal((await adapter.load()).canWriteAttachment, true);
  state.pageOperations['789'] = ['read'];
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import after revoked rights.' }), error => error.code === 'FORBIDDEN');
  assert.equal(state.calls.some(call => call.init.method === 'POST'), false);
});

test('stale attachment version stops before upload', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true } }); await adapter.load(); state.version = 4;
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'CONFLICT');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('concurrent upload is detected after commit and never retried', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true }, raceAfterUpload: true }); await adapter.load();
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'CONFLICT');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 1);
});

test('lost upload response reports an unknown commit instead of suggesting safe retry', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true }, uploadNetworkError: true }); await adapter.load();
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'UNKNOWN_COMMIT');
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 1);
});

test('administrative attachment rejects UTF-8 JSON above 10 MB before any further network request', async () => {
  const { adapter, state } = server({ config: { allowAttachmentWrites: true } }); await adapter.load();
  const data = fixture(); data.padding = '界'.repeat(3400000);
  assert.ok(JSON.stringify(data).length < 10000000);
  const before = state.calls.length;
  await assert.rejects(adapter.saveAttachment(data, { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'ATTACHMENT_TOO_LARGE' && /10 MB/.test(error.message));
  assert.equal(state.calls.length, before);
});

test('HTTP 413 reports the attachment limit without retrying an upload', async () => {
  const { adapter, state } = server({ uploadStatus: 413, config: { allowAttachmentWrites: true } }); await adapter.load();
  await assert.rejects(adapter.saveAttachment(fixture(), { expectedAttachmentVersion: 3, comment: 'Import' }), error => error.code === 'ATTACHMENT_TOO_LARGE' && error.status === 413 && /10 MB/.test(error.message));
  assert.equal(state.calls.filter(call => call.init.method === 'POST').length, 1);
});

test('JSON download enforces the 10 MB byte boundary for buffered and streamed responses', async () => {
  const content = fixture(); content.padding = '';
  const base = JSON.stringify(content);
  const exact = base.replace('"padding":""', '"padding":"' + 'a'.repeat(10000000 - Buffer.byteLength(base)) + '"');
  const load = responseValue => C.create({ mode: 'local', dataUrl: './data.json' }, { location: { href: 'http://localhost:4173/' }, fetch: async () => responseValue }).load();
  assert.equal((await load(response(exact))).data.padding.length, 10000000 - Buffer.byteLength(base));
  await assert.rejects(load(response(exact + ' ')), error => error.code === 'ATTACHMENT_TOO_LARGE');
  await assert.rejects(load(response('"' + '界'.repeat(3400000) + '"')), error => error.code === 'ATTACHMENT_TOO_LARGE');
  let cancelled = false, chunks = 0;
  const stream = new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(5000001)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(load(new Response(stream)), error => error.code === 'ATTACHMENT_TOO_LARGE');
  assert.equal(cancelled, true); assert.equal(chunks, 2);
  assert.equal((await load(new Response(JSON.stringify(fixture())))).actor.id, 'a');
});

test('CQL discovery scopes child pages, publication and facets while stripping unsafe links', async () => {
  const { adapter, state } = server({ searchResponse: { totalSize: 3, results: [
    { content: { id: '7', type: 'page', title: 'Safe', space: { key: 'WCS' }, ancestors: [{ id: '123' }] }, excerpt: '<b>Loan</b> knowledge', url: '/pages/viewpage.action?pageId=7' },
    { content: { id: '8', type: 'page', title: 'Unsafe', space: { key: 'WCS' }, ancestors: [{ id: '123' }, { id: '7' }] }, url: 'https://evil.example/steal' }
  ] } });
  const result = await adapter.searchPages({ query: 'loan OR title~"secret"', area: 'loans', type: 'Job aid', limit: 2 });
  const url = new URL(state.calls.find(call => new URL(call.url).pathname.endsWith('/rest/api/search')).url), cql = url.searchParams.get('cql');
  assert.ok(cql.includes('ancestor = 123')); assert.ok(cql.includes('space = "WCS"'));
  assert.ok(cql.includes('label = "wcs-document"')); assert.ok(cql.includes('label = "wcs-status-published"'));
  assert.ok(cql.includes('"wcs-area-loans"')); assert.ok(cql.includes('"wcs-type-job-aid"'));
  assert.equal(result.results[0].summary, 'Loan knowledge'); assert.equal(result.results[1].url, null);
  assert.equal(result.results[0].url, 'https://intranet.example/confluence/pages/viewpage.action?pageId=7');
  assert.equal(result.nextStart, 2); assert.equal(result.total, 3);
  assert.equal(url.searchParams.get('expand'), 'content.version,content.space,content.ancestors');
});

test('CQL discovers the real root space once and shares it across concurrent searches', async () => {
  const { adapter, state } = server({ rootPage: { id: '123', type: 'page', space: { key: 'WEALTH_KNOWLEDGE' } } });
  assert.equal(adapter.info().searchSpaceKey, null, 'Configuration alone does not prove the root space');
  const results = await Promise.all([adapter.searchPages({ query: 'credit' }), adapter.searchPages({ query: 'loans', start: 20 })]);
  results.push(await adapter.searchPages({ query: '' }));
  for (const result of results) {
    assert.match(result.cql, /^type = page AND ancestor = 123 AND space = "WEALTH_KNOWLEDGE" AND label = "wcs-document" AND label = "wcs-status-published"/);
  }
  const rootReads = state.calls.filter(call => new URL(call.url).pathname.endsWith('/rest/api/content/123'));
  assert.equal(rootReads.length, 1);
  assert.equal(new URL(rootReads[0].url).searchParams.get('expand'), 'space');
  assert.equal(rootReads[0].init.credentials, 'same-origin');
  assert.equal(rootReads[0].init.redirect, 'error');
  assert.equal(state.calls.filter(call => new URL(call.url).pathname.endsWith('/rest/api/search')).length, 3);
  assert.equal(adapter.info().searchSpaceKey, 'WEALTH_KNOWLEDGE');
});

test('blank space keys resolve the landing-page space and explicit keys ignore surrounding whitespace', async () => {
  for (const spaceKey of ['', '   ', '\t\n', '  WEALTH_KNOWLEDGE  ']) {
    const { adapter, state } = server({
      config: { spaceKey },
      rootPage: { id: '123', type: 'page', space: { key: 'WEALTH_KNOWLEDGE', name: 'WCSpedia' } }
    });
    const result = await adapter.searchPages({ scope: 'tree', year: '2026' });
    assert.match(result.cql, /^type = page AND ancestor = 123 AND space = "WEALTH_KNOWLEDGE"/);
    assert.equal(adapter.info().searchSpaceKey, 'WEALTH_KNOWLEDGE');
    assert.equal(state.calls.length, 2);
  }
});

test('search rejects a different configured landing-page link before any network request', async () => {
  for (const home of [
    '/confluence/pages/viewpage.action?pageId=999',
    'https://intranet.example/confluence/pages/viewpage.action?pageId=999#/',
    '/confluence/pages/viewpage.action'
  ]) {
    const { adapter, state } = server({ config: { pages: { home } } });
    await assert.rejects(adapter.searchPages({ scope: 'tree', year: '2026' }), error => error.code === 'INVALID_SCOPE' && /landing-page link/.test(error.message));
    assert.equal(state.calls.length, 0);
    assert.equal(adapter.info().searchSpaceKey, null);
  }
  const { adapter } = server({ config: { pages: { home: '/confluence/pages/viewpage.action?pageId=123#/' } } });
  assert.match((await adapter.searchPages({ scope: 'tree' })).cql, /ancestor = 123 AND space = "WCS"/);
});

test('the search root requires the landing page ID rather than a space name or invalid number', () => {
  for (const rootPageId of ['wcspedia', 'WCSpedia Knowledge', '', '0', '-1', '123.0', '123456789012345678901', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => server({ config: { rootPageId } }), error => error.code === 'CONFIGURATION' && /numeric pageId/.test(error.message));
  }
  assert.equal(server({ config: { rootPageId: 123 } }).adapter.info().rootPageId, '123');
});

test('CQL configured space must match the verified root and cannot inject a scope', async () => {
  const matched = server({ config: { spaceKey: 'WCS' } });
  assert.ok((await matched.adapter.searchPages()).cql.includes('space = "WCS"'));
  const mismatch = server({ config: { spaceKey: 'OTHER' } });
  await assert.rejects(mismatch.adapter.searchPages(), error => error.code === 'INVALID_SCOPE');
  assert.equal(mismatch.adapter.info().searchSpaceKey, null);
  assert.equal(mismatch.state.calls.length, 1);
  assert.ok(mismatch.state.calls[0].url.includes('/rest/api/content/123?'));
  const invalid = server({ config: { spaceKey: 'WCS" OR space = "PRIVATE' } });
  await assert.rejects(invalid.adapter.searchPages(), /space key/);
  assert.equal(invalid.state.calls.length, 0);
});

test('a cancelled scope wait never issues its search and leaves the shared lookup usable', async () => {
  let releaseRoot;
  const rootWait = new Promise(resolve => { releaseRoot = resolve; });
  const { adapter, state } = server({ rootWait });
  const controller = new AbortController();
  const cancelled = adapter.searchPages({ query: 'cancelled', signal: controller.signal });
  const active = adapter.searchPages({ query: 'active' });
  controller.abort();
  releaseRoot();
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  await active;
  assert.equal(state.calls.filter(call => call.url.includes('/rest/api/content/123?')).length, 1);
  const searches = state.calls.filter(call => call.url.includes('/rest/api/search?'));
  assert.equal(searches.length, 1);
  assert.ok(new URL(searches[0].url).searchParams.get('cql').includes('active'));
});

test('an empty CQL result page terminates pagination even when the reported total is larger', async () => {
  const { adapter } = server({ searchResponse: { results: [], totalSize: 100 } });
  for (const start of [0, 20]) {
    const result = await adapter.searchPages({ start, limit: 10 });
    assert.equal(result.total, 100);
    assert.equal(result.start, start);
    assert.deepEqual(result.results, []);
    assert.equal(result.nextStart, null);
  }
});

test('CQL refuses an unavailable or invalid root scope and permits a fresh lookup after failure', async () => {
  for (const rootPage of [
    { id: '999', type: 'page', space: { key: 'WCS' } },
    { id: '123', type: 'blogpost', space: { key: 'WCS' } },
    { id: '123', type: 'page' },
    { id: '123', type: 'page', space: { key: 'WCS" OR type = page' } }
  ]) {
    const { adapter, state } = server({ rootPage });
    await assert.rejects(adapter.searchPages(), error => error.code === 'INVALID_SCOPE');
    assert.equal(state.calls.length, 1);
    assert.ok(!state.calls.some(call => call.url.includes('/rest/api/search')));
  }
  const { adapter, state } = server({ rootStatus: 403 });
  await assert.rejects(adapter.searchPages(), error => error.status === 403);
  assert.equal(state.calls.length, 1);
  state.rootStatus = 200;
  assert.ok((await adapter.searchPages()).cql.includes('space = "WCS"'));
  assert.equal(state.calls.filter(call => call.url.includes('/rest/api/content/123?')).length, 2);
});

test('CQL rejects search results with a different or unverified space', async () => {
  for (const space of [undefined, { key: 'OTHER' }]) {
    const { adapter } = server({ searchResponse: { results: [{ content: { id: '77', title: 'Wrong scope', space } }], totalSize: 1 } });
    await assert.rejects(adapter.searchPages(), error => error.code === 'INVALID_SCOPE');
  }
});

test('published CQL results require valid page identity and verified root ancestry', async () => {
  for (const hit of [
    treeHit('400', []), treeHit('400', ['999']), treeHit('123'), treeHit('unsafe-id'),
    treeHit('400', ['123'], { type: 'blogpost' }), treeHit('400', ['123'], { type: undefined }),
    treeHit('400', ['123'], { ancestors: undefined }), treeHit('400', ['123'], { ancestors: [null] }),
    { id: '400' }, null
  ]) {
    const { adapter } = server({ searchResponse: { results: [hit] } });
    await assert.rejects(adapter.searchPages({ scope: 'published' }), error => error.code === 'INVALID_SCOPE');
  }
  const { adapter, state } = server({ searchResponse: { results: [treeHit('400'), treeHit('402', ['123', '400', '401'])] } });
  const result = await adapter.searchPages({ scope: 'published' });
  assert.deepEqual(result.results.map(item => item.id), ['400', '402']);
  const request = new URL(state.calls.at(-1).url);
  assert.ok(request.searchParams.get('expand').split(',').includes('content.ancestors'));
});

test('CQL supports every current knowledge-library type without broadening the scope', async () => {
  const { adapter } = server();
  const types = require('./wcspedia-data.json').types;
  for (const type of types) {
    const result = await adapter.searchPages({ type });
    assert.ok(result.cql.includes('space = "WCS"'));
    assert.ok(result.cql.includes('ancestor = 123'));
    assert.ok(result.cql.includes('label = "wcs-document"'));
    assert.ok(result.cql.includes('label = "wcs-status-published"'));
    assert.ok(result.cql.includes('label IN (' + require('./editor-content.js').typeMembers(type).map(member=>'"wcs-type-'+member.toLowerCase().replace(/\s+/g,'-')+'"').join(', ') + ')'));
  }
});

test('CQL year filter uses an inclusive start and exclusive end before sort', async () => {
  const { adapter } = server();
  for (const sort of ['relevance', 'updated', 'title']) {
    const { cql } = await adapter.searchPages({ year: '2026', sort });
    assert.ok(cql.includes(' AND lastmodified >= "2026-01-01" AND lastmodified < "2027-01-01"'));
    if (sort === 'updated') assert.ok(cql.endsWith('"2027-01-01" ORDER BY lastmodified DESC'));
    if (sort === 'title') assert.ok(cql.endsWith('"2027-01-01" ORDER BY title ASC'));
  }
  assert.ok((await adapter.searchPages({ year: 9998 })).cql.endsWith('lastmodified < "9999-01-01"'));
  assert.equal((await adapter.searchPages({ year: '' })).cql.includes('lastmodified >='), false);
});

test('year filters, sorting, pagination and reset retain the verified WCSpedia scope', async () => {
  for (const scope of ['tree', 'published']) for (const sort of ['relevance', 'updated', 'title']) {
    const { adapter, state } = server({ searchResponse: {
      results: [treeHit('400')], totalSize: 12,
      _links: { next: '/rest/api/search?start=6&limit=100&cql=type%20%3D%20page' }
    } });
    const options = { scope, query: '', year: '2026', sort, limit: 6 };
    const first = await adapter.searchPages(options);
    state.searchResponse = { results: [treeHit('402', ['123', '400', '401'])], totalSize: 12, _links: {} };
    const next = await adapter.searchPages({ ...options, continuation: first.nextContinuation });
    const reset = await adapter.searchPages({ ...options, year: '' });
    assert.equal(next.cql, first.cql);
    assert.equal(first.cql.includes('lastmodified >= "2026-01-01" AND lastmodified < "2027-01-01"'), true);
    assert.equal(reset.cql.includes('lastmodified >='), false);
    const requests = state.calls.filter(call => new URL(call.url).pathname.endsWith('/rest/api/search'));
    assert.equal(requests.length, 3, 'Changing the year never scans or fetches a page tree');
    assert.deepEqual(requests.map(call => new URL(call.url).searchParams.get('start')), ['0', '6', '0']);
    for (const call of requests) {
      const url = new URL(call.url), cql = url.searchParams.get('cql');
      assert.equal(url.origin, 'https://intranet.example');
      assert.equal(url.pathname, '/confluence/rest/api/search');
      assert.equal(url.searchParams.get('limit'), '6');
      assert.match(cql, /^type = page AND ancestor = 123 AND space = "WCS"(?: AND |$)/);
      assert.equal(cql.includes(' OR '), false);
    }
    assert.equal(state.calls.length, 4, 'Only one verified-root lookup and three bounded searches are needed');
  }
});

test('invalid and injected year values are rejected before making a request', async () => {
  const { adapter, state } = server();
  for (const year of ['26', '1899', 9999, '2026 OR type=page', '2026.0', {}, 2026.5]) {
    await assert.rejects(adapter.searchPages({ year }), /four-digit year/);
  }
  assert.equal(state.calls.length, 0);
});

test('a manager adds a category with a reconstructable audit event and no mutation of the input', () => {
  const source = workingFixture();
  const saved = structuredClone(source);
  const result = C.addCategory(source, { category: { id: 'team-learning', name: '  Team learning  ', icon: 'forged', privateField: 'strip' }, expectedTaxonomyRevision: 1, comment: 'Add a learning collection.' }, { actorId: 'b', now: '2026-10-15T10:00:00Z' });
  assert.deepEqual(source, saved);
  assert.equal(result.taxonomyRevision, 2);
  assert.deepEqual(result.areas.at(-1), { id: 'team-learning', title: 'Team learning', icon: 'folder' });
  assert.deepEqual(result.taxonomyAudit[0], { id: 'taxonomy-event-2', at: '2026-10-15T10:00:00.000Z', actorId: 'b', action: 'add-category', revision: 2, comment: 'Add a learning collection.', changes: [{ field: 'areas', before: source.areas, after: result.areas }] });
  assert.equal(C.validateData(result), result);
});

test('category writes reject unassigned roles, stale revisions and duplicate or unsafe taxonomy', () => {
  const source = workingFixture();
  const command = { category: { id: 'learning', name: 'Learning' }, expectedTaxonomyRevision: 1, comment: 'New workplace collection.' };
  assert.throws(() => C.addCategory(source, command, { actorId: 'a' }), error => error.code === 'FORBIDDEN');
  assert.throws(() => C.addCategory(source, command, { actorId: 'unknown' }), error => error.code === 'FORBIDDEN');
  assert.throws(() => C.addCategory(source, { ...command, expectedTaxonomyRevision: 2 }, { actorId: 'b' }), error => error.code === 'CONFLICT');
  for (const category of [{ id: 'loans', name: 'Another name' }, { id: 'another', name: 'loan management' }]) assert.throws(() => C.addCategory(source, { ...command, category }, { actorId: 'b' }), error => error.code === 'CONFLICT');
  for (const category of [{ id: '../unsafe', name: 'Unsafe' }, { id: 'safe', name: '' }, { id: 'a'.repeat(81), name: 'Too long' }]) assert.throws(() => C.addCategory(source, { ...command, category }, { actorId: 'b' }), /category/);
  assert.throws(() => C.addCategory(source, { ...command, comment: '' }, { actorId: 'b' }), /comment/);
});

test('category command contains only allowed fields and uses workflow request concurrency protection', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await adapter.load();
  await adapter.submitAction({ action: 'add-category', category: { id: 'team-learning', name: ' Team learning ', icon: 'danger', actorId: 'forged' }, expectedTaxonomyRevision: 1, comment: 'Add the collection.', actorId: 'forged', taxonomyAudit: [] });
  const posted = JSON.parse(state.calls.find(call => call.init.method === 'POST').init.body);
  assert.deepEqual(posted.category, { id: 'team-learning', name: 'Team learning', icon: 'folder' });
  assert.equal(posted.expectedTaxonomyRevision, 1);
  assert.equal(posted.expectedAttachmentVersion, 3);
  assert.match(posted.requestId, /^[\da-f-]{36}$/);
  assert.equal('actorId' in posted, false);
  assert.equal('taxonomyAudit' in posted, false);
  assert.equal('docId' in posted, false);
});

test('author cannot post category changes and reader projections never leak taxonomy audit', async () => {
  const config = { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' };
  const { adapter, state } = server({ config, user: { type: 'known', userKey: 'key-a', username: 'author' } });
  state.policy.records.push({ id: 'author-grant', soeid: 'AUTHOR', displayName: 'Author', scope: '*', permissions: ['content.create', 'content.edit'], active: true });
  await adapter.load();
  await assert.rejects(adapter.submitAction({ action: 'add-category', category: { id: 'learning', name: 'Learning' }, expectedTaxonomyRevision: 1, comment: 'Attempt category addition.' }), error => error.code === 'FORBIDDEN');
  assert.equal(state.calls.filter(call => call.init.method === 'POST').length, 0);
  const data = C.addCategory(fixture(), { category: { id: 'learning', name: 'Learning' }, expectedTaxonomyRevision: 1, comment: 'Add collection.' }, { actorId: 'b' });
  await assert.rejects(server({ data }).adapter.load(), error => error.code === 'PUBLISHED_PROJECTION_REQUIRED');
});

test('authoring commands preserve Markdown and audited editorial fields without permitting approval metadata', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await adapter.load();
  const source = { ...fields, sections: undefined, slug: 'team-learning-report', bodyMarkdown: '## Overview\n\nA **sample** workplace report.', highlights: ['Review the exact revision.'], cover: { src: '/confluence/download/attachments/123/cover.png', alt: 'Learning session materials', caption: 'Sample image', approvedBy: 'forged' }, approvedAt: '1990-01-01' };
  delete source.sections;
  await adapter.submitAction({ action: 'create', comment: 'Create report.', fields: source });
  const posted = JSON.parse(state.calls.find(call => call.init.method === 'POST').init.body);
  assert.equal(posted.fields.bodyMarkdown, source.bodyMarkdown);
  assert.equal(posted.fields.slug, source.slug);
  assert.deepEqual(posted.fields.highlights, source.highlights);
  assert.deepEqual(posted.fields.cover, { src: source.cover.src, alt: source.cover.alt, caption: source.cover.caption });
  assert.equal('approvedAt' in posted.fields, false);
  assert.equal('sections' in posted.fields, false, 'The trusted workflow engine derives search sections from Markdown');
  await adapter.submitAction(command({ action: 'edit', changes: { cover: null, highlights: [], bodyMarkdown: '## Revised\n\nUpdated content.', approvedBy: 'forged' } }));
  const edited = JSON.parse(state.calls.filter(call => call.init.method === 'POST').at(-1).init.body);
  assert.deepEqual(edited.changes, { cover: null, highlights: [], bodyMarkdown: '## Revised\n\nUpdated content.' });
});

test('invalid authoring payloads are rejected before network mutations', async () => {
  const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await adapter.load();
  for (const changes of [
    { slug: 'invalid slug' },
    { highlights: Array(6).fill('Too many') },
    { cover: { src: 'javascript:alert(1)', alt: 'Unsafe' } },
    { cover: { src: 'data:image/svg+xml;base64,PHN2Zz4=', alt: 'SVG image' } },
    { bodyMarkdown: 'a'.repeat(200001) },
    { bodyMarkdown: '## Content\n\nOne source.', sections: fields.sections }
  ]) await assert.rejects(adapter.submitAction(command({ action: 'edit', changes })));
  assert.equal(state.calls.filter(call => call.init.method === 'POST').length, 0);
});

test('stored Markdown snapshots require the matching search projection and validated cover', () => {
  const E = require('./editor-content.js');
  const data = fixture(), version = data.documents[0].versions[0];
  version.bodyMarkdown = '## Overview\n\nOne source of document content.';
  assert.throws(() => C.validateData(data), /must match/);
  version.sections = E.toSections(version.bodyMarkdown);
  version.cover = { src: 'https://images.example/cover.png', alt: 'Report cover', caption: '' };
  assert.equal(C.validateData(data), data);
  version.cover.src = 'data:image/svg+xml;base64,PHN2Zz4=';
  assert.throws(() => C.validateData(data), /cover|image|PNG/i);
});

test('workflow transport preserves full versioned media and taxonomy while excluding nested server fields', async () => {
  const { adapter, state } = server({ config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  await adapter.load();
  const editorial = { bodyMarkdown: '## Workflow\n\n![Diagram](attachment:diagram)\n\n[Checklist](attachment:checklist)', assets: [{ id: 'diagram', src: '/diagram.png?version=2', alt: 'Workflow', approvedBy: 'spoof' }], attachments: [{ id: 'checklist', name: 'checklist.md', url: 'data:text/markdown;base64,IyBUZXN0', mimeType: 'text/markdown', size: 6, approvedAt: 'spoof' }], tags: ['Credit'], processes: ['Approval'], regions: ['EMEA'] };
  await adapter.submitAction(command({ action: 'edit', changes: editorial }));
  const posted = JSON.parse(state.calls.find(c => c.url.endsWith('/rest/wcspedia/workflow')).init.body);
  for (const field of ['bodyMarkdown', 'tags', 'processes', 'regions']) assert.deepEqual(posted.changes[field], editorial[field]);
  assert.deepEqual(posted.changes.assets, [{ id: 'diagram', src: '/diagram.png?version=2', alt: 'Workflow' }]);
  assert.deepEqual(posted.changes.attachments, [{ id: 'checklist', name: 'checklist.md', url: 'data:text/markdown;base64,IyBUZXN0', mimeType: 'text/markdown', size: 6 }]);
});

test('invalid media and taxonomy are rejected before workflow network writes', async () => {
  const { adapter, state } = server({ config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  await adapter.load();
  for (const changes of [
    { regions: [''] }, { tags: Array(31).fill('x') },
    { attachments: [{ id: 'x', name: 'x.svg', url: '/x.svg', mimeType: 'image/svg+xml', size: 10 }] },
    { bodyMarkdown: '![Missing](attachment:missing)', assets: [] }
  ]) await assert.rejects(adapter.submitAction(command({ action: 'edit', changes })));
  assert.equal(state.calls.filter(c => c.init.method === 'POST').length, 0);
});

test('CQL classification facets use deterministic published-page labels and reject unsupported values', async () => {
  const { adapter, state } = server();
  const result = await adapter.searchPages({ tag: 'Credit controls', process: 'Review & Approval', region: 'EMEA' });
  assert.ok(result.cql.includes('label = "wcs-tag-credit-controls"'));
  assert.ok(result.cql.includes('label = "wcs-process-review-approval"'));
  assert.ok(result.cql.includes('label = "wcs-region-emea"'));
  assert.equal(C.facetLabel('tag', '  Crédit controls  '), 'wcs-tag-credit-controls');
  const prior = state.calls.length;
  await assert.rejects(adapter.searchPages({ region: '日本' }), /ASCII label/);
  await assert.rejects(adapter.searchPages({ tag: {} }), /valid topic/);
  assert.equal(state.calls.length, prior);
});

function entitlementServer(options = {}) {
  const state = {
    calls: [], data: fixture(), user: { type: 'known', userKey: 'key-b', username: 'manager', displayName: 'Manager' },
    policy: { schemaVersion: 1, revision: 7, records: [{ id: 'manager-grant', soeid: 'MANAGER', displayName: 'Manager', scope: '*', permissions: [...Entitlements.PERMISSIONS], active: true }], audit: [] },
    native: { root: ['read', 'create', 'update'], policy: ['read', 'update'], document: ['read', 'update', 'delete'] },
    ...options
  };
  if (state.data.documents[0]) state.data.documents[0].confluencePageId = '987';
  const fetch = async (url, init) => {
    state.calls.push({ url, init });
    const parsed = new URL(url), path = parsed.pathname;
    if (state.beforeRead) await state.beforeRead(path, init);
    if (path.endsWith('/rest/api/user/current')) return response(state.user);
    if (path.endsWith('/child/attachment') && parsed.searchParams.get('filename') === 'entitlements.json') return response({ results: [{ id: '457', title: 'entitlements.json', version: { number: state.policy.revision } }] });
    if (path.endsWith('/entitlements.json')) return response(state.badPolicy || state.policy);
    if (path.endsWith('/child/attachment')) return response({ results: [{ id: '456', title: 'wcspedia-published.json', version: { number: 3 } }] });
    if (path.includes('/download/attachments/')) return response(state.data);
    if (path.endsWith('/rest/wcspedia/workspace')) return response(parsed.searchParams.get('capabilitiesOnly') === 'true' ? { rootPageId: '123', identity: Entitlements.identity(state.user), canCreateDocument: false } : { data: state.data });
    if (path.endsWith('/rest/api/content/123') || path.endsWith('/rest/api/content/150') || path.endsWith('/rest/api/content/987')) {
      const id = path.split('/').pop(), kind = id === '123' ? 'root' : id === '150' ? 'policy' : 'document';
      if (kind === 'policy' && state.policyStatus) return response({}, state.policyStatus);
      const page = { id, operations: state.native[kind].map(operation => ({ operation, targetType: 'page' })), version: { number: kind === 'policy' ? state.policy.revision : 4 } };
      return response(page);
    }
    if (path.endsWith('/rest/wcspedia/entitlements') && init.method === 'POST') {
      if (state.entitlementNetworkError) throw new Error('Response lost');
      const body = JSON.parse(init.body);
      state.policy = Entitlements.applyCommand(state.policy, body, { identity: Entitlements.identity(state.user), native: { entitlements: state.native.policy.map(operation=>({operation,targetType:'page'})) }, now: '2026-10-15T12:00:00Z' });
      return response({ revision: state.policy.revision });
    }
    if (path.endsWith('/rest/wcspedia/workflow')) {
      const body = JSON.parse(init.body);
      if (body.action === 'delete') {
        if (state.unconfirmedDelete) return response({ ok: true });
        state.data.documents = [];
        return response({ documentKey: body.documentKey, deleted: true, confluencePageDeleted: true });
      }
      return response({ ok: true });
    }
    throw new Error('Unexpected mock request: ' + path);
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', entitlementsPageId: '150', entitlementsEndpoint: '/confluence/rest/wcspedia/entitlements', workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace', ...options.config }, { fetch, location });
  return { adapter, state };
}

test('live bootstrap starts policy reads while the approved projection is still downloading', { timeout: 1500 }, async () => {
  let releaseDownload, policyStarted;
  const downloadWait = new Promise(resolve => { releaseDownload = resolve; });
  const policyWait = new Promise(resolve => { policyStarted = resolve; });
  const { adapter, state } = entitlementServer({ beforeRead: async path => {
    if (path.includes('/download/attachments/')) await downloadWait;
    if (path.endsWith('/rest/api/content/150')) policyStarted();
  } });
  let settled = false;
  const pending = adapter.load().then(value => { settled = true; return value; });
  try {
    await policyWait;
    assert.equal(settled, false, 'No session is exposed before the projection and permissions complete');
    assert.equal(state.calls.some(call => call.url.includes('/workspace')), false, 'Workspace waits for verified identity and projection');
  } finally { releaseDownload(); }
  const session = await pending;
  assert.equal(session.actorId, 'b');
  assert.equal(session.effectivePermissions['content.create'], true);
  assert.equal(session.documentPermissions.aide.edit, true);
});

test('standalone access cancellation propagates through identity, policy page, document and JSON reads', { timeout: 3000 }, async () => {
  for (const suffix of ['/rest/api/user/current', '/rest/api/content/150', '/rest/api/content/987', '/download/attachments/150/entitlements.json']) {
    let started, release, delayed = false;
    const reached = new Promise(resolve => { started = resolve; });
    const blocked = new Promise(resolve => { release = resolve; });
    const { adapter, state } = entitlementServer({ beforeRead: async path => {
      if (!delayed && path.endsWith(suffix)) { delayed = true; started(); await blocked; }
    } });
    const controller = new AbortController();
    const pending = adapter.loadAccess({ documentPages: { aide: '987' }, signal: controller.signal });
    await reached; controller.abort(); release();
    await assert.rejects(pending, error => error.name === 'AbortError', suffix+' ignores a late permission grant');
    assert.ok(state.calls.every(call => call.init.signal instanceof AbortSignal), 'Every request has a bounded signal');
    assert.ok(state.calls.some(call => new URL(call.url).pathname.endsWith(suffix) && call.init.signal.aborted), suffix+' forwards caller cancellation');
    assert.equal((await adapter.loadAccess()).effectivePermissions['content.create'], true, 'A fresh access check can retry');
  }
});

test('standalone access rejects an already cancelled request before network I/O', async () => {
  const { adapter, state } = entitlementServer();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.loadAccess({ signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(state.calls.length, 0);
});

test('an aborted permission response body retains cancellation instead of becoming invalid JSON', async () => {
  const adapter = C.create({ mode: 'confluence', rootPageId: '123' }, { location, fetch: async () => ({ ok: true, status: 200, text: async () => {
    const error = new Error('Body cancelled'); error.name = 'AbortError'; throw error;
  } }) });
  await assert.rejects(adapter.loadAccess(), error => error.name === 'AbortError');
});

test('standalone access reads session, policy JSON and actual document permissions without a reader projection or native table', async () => {
  const { adapter, state } = entitlementServer();
  const access = await adapter.loadAccess({ documentPages: { aide: '987' } });
  assert.equal(access.identity.soeid, 'MANAGER'); assert.equal(access.entitlementPolicy.revision, 7);
  assert.equal(access.effectivePermissions['content.create'], true); assert.equal(access.effectivePermissions['entitlements.edit'], true);
  assert.deepEqual(access.documentPermissions.aide, { edit: true, delete: true }); assert.equal(access.nativePageVersions.aide, 4);
  assert.ok(state.calls.some(call => call.url.includes('/download/attachments/150/entitlements.json')));
  assert.equal(state.calls.some(call => call.url.includes('wcspedia-published.json') || new URL(call.url).searchParams.get('expand')?.includes('body.storage')), false);
  assert.equal(state.calls.some(call => call.url.includes('workspace')), false);
});

test('native rights deny instead of inferring from roles and blank policy hosts resolve to the attachments page', async () => {
  const absentCreate = entitlementServer({ native: { root: ['read', 'update'], policy: ['read', 'update'], document: ['read'] } });
  const access = await absentCreate.adapter.loadAccess({ documentPages: { aide: '987' } });
  assert.equal(access.effectivePermissions['content.create'], false); assert.deepEqual(access.documentPermissions.aide, { edit: false, delete: false });
  assert.throws(() => entitlementServer({ config: { entitlementsPageId: 'REPLACE_ENTITLEMENTS_PAGE_ID' } }), error => error.code === 'CONFIGURATION');
  const missing = entitlementServer({ config: { entitlementsPageId: '' } });
  assert.equal((await missing.adapter.loadAccess()).effectivePermissions['content.create'], true);
  assert.ok(missing.state.calls.some(call => call.url.includes('/download/attachments/123/entitlements.json')));
});

test('policy access failure and malformed JSON never fall back to a native table or sample policy', async () => {
  await assert.rejects(entitlementServer({ policyStatus: 403 }).adapter.loadAccess(), e => e.status === 403);
  await assert.rejects(entitlementServer({ badPolicy: '<p>Not JSON</p>' }).adapter.loadAccess(), e => e.code === 'INVALID_ENTITLEMENTS');
});

test('SOEID directory mapping supports an explicitly entitled Reader without role-based grants', async () => {
  const data = fixture();
  data.people[0] = { ...data.people[0], role: 'Reader', soeid: 'am12345' }; delete data.people[0].confluence;
  const policy = { schemaVersion: 1, revision: 1, records: [{ id: 'reader-explicit', soeid: 'AM12345', displayName: 'Alex', scope: '*', permissions: ['content.create', 'content.edit'], active: true }], audit: [] };
  const { adapter } = entitlementServer({ data, policy, user: { type: 'known', username: 'AM12345', displayName: 'Alex' } });
  const session = await adapter.load();
  assert.equal(session.actorId, 'a'); assert.equal(session.actor.role, 'Reader'); assert.equal(session.workspaceLoaded, true); assert.equal(session.canSubmit, true);
});

test('SOEID mapping still rejects a conflicting stable key and duplicate directory entries', async () => {
  const conflict = fixture(); conflict.people[0].soeid = 'manager';
  const result = await entitlementServer({ data: conflict }).adapter.load(); assert.equal(result.actorId, 'b');
  const ambiguous = fixture(); ambiguous.people[0].soeid = 'manager'; delete ambiguous.people[0].confluence;
  await assert.rejects(entitlementServer({ data: ambiguous }).adapter.load(), e => e.code === 'IDENTITY_MAPPING');
});

test('entitlement saves go only to trusted service with revision, CSRF header and idempotency ID', async () => {
  const { adapter, state } = entitlementServer(); await adapter.loadAccess();
  const access = await adapter.submitEntitlementCommand({ action: 'add', expectedRevision: 7, comment: 'Approved access request.', actorSOEID: 'FORGED', record: { id: 'new-row', soeid: 'NEW1234', displayName: 'New colleague', scope: '*', permissions: ['content.create'], active: true, role: 'Manager' } });
  const posts = state.calls.filter(call => call.init.method === 'POST'); assert.equal(posts.length, 1);
  const posted = JSON.parse(posts[0].init.body); assert.equal(posted.expectedRevision, 7); assert.equal(posted.entitlementsPageId, '150');
  assert.equal('actorSOEID' in posted, false); assert.equal('role' in posted.record, false);
  assert.equal(posts[0].init.headers['X-Requested-With'], 'XMLHttpRequest'); assert.equal(posts[0].init.headers['Idempotency-Key'], posted.requestId);
  assert.equal(access.entitlementPolicy.revision, 8);
});

test('entitlement lost-response retries preserve one request identity', async () => {
  const { adapter, state } = entitlementServer({ entitlementNetworkError: true }); await adapter.loadAccess();
  const cmd = { action: 'add', expectedRevision: 7, comment: 'Approved access.', record: { id: 'new-row', soeid: 'NEW1234', displayName: 'New colleague', scope: '*', permissions: ['content.create'], active: true } };
  await assert.rejects(adapter.submitEntitlementCommand(cmd), e => e.code === 'UNKNOWN_COMMIT'); state.entitlementNetworkError = false;
  await adapter.submitEntitlementCommand(cmd);
  const posts = state.calls.filter(call => call.init.method === 'POST').map(call => JSON.parse(call.init.body));
  assert.equal(posts[0].requestId, posts[1].requestId);
});

test('native delete requires scoped access, canonical mappings, current revisions and service confirmation', async () => {
  const { adapter, state } = entitlementServer(); await adapter.load();
  const result = await adapter.deleteDocument(command({ confluencePageId: '666', documentKey: 'forged', expectedPageVersion: 1, actorSOEID: 'FORGED' }));
  const post = state.calls.find(call => call.init.method === 'POST'), body = JSON.parse(post.init.body);
  assert.equal(body.documentKey, 'aide'); assert.equal(body.confluencePageId, '987'); assert.equal(body.expectedPageVersion, 4); assert.equal(body.expectedEntitlementRevision, 7);
  assert.equal(post.init.headers['Idempotency-Key'], body.requestId); assert.equal(result.data.documents.length, 0);
  assert.equal(state.calls.some(call => call.init.method === 'DELETE'), false, 'browser never deletes native pages directly');
  const denied = entitlementServer({ native: { root: ['read','create'], policy: ['read','update'], document: ['read','update'] } }); await denied.adapter.load();
  await assert.rejects(denied.adapter.deleteDocument(command()), e => e.code === 'FORBIDDEN');
  assert.equal(denied.state.calls.some(call=>call.init.method === 'POST'), false);
  const uncertain = entitlementServer({ unconfirmedDelete: true }); await uncertain.adapter.load();
  await assert.rejects(uncertain.adapter.deleteDocument(command()), e => e.code === 'UNKNOWN_COMMIT');
});

test('native page mapping aliases must agree and remain unique', () => {
  const conflict = fixture(); conflict.documents[0].confluencePageId = '987'; conflict.documents[0].confluence = { pageId: '999' };
  assert.throws(() => C.validateData(conflict), e => e.code === 'INVALID_MAPPING');
  conflict.documents[0].confluence.pageId = '987'; assert.doesNotThrow(() => C.validateData(conflict));
  const duplicate = structuredClone(conflict.documents[0]); duplicate.id = 'another'; conflict.documents.push(duplicate);
  assert.throws(() => C.validateData(conflict), e => e.code === 'INVALID_MAPPING');
});

test('policy grants and audit come from the same versioned JSON without a native table or service read', async () => {
  const { adapter, state } = entitlementServer();
  state.policy.audit = [{ id: 'event-7', action: 'add', revision: 7, actorSOEID: 'MANAGER', at: '2026-10-15T12:00:00Z', comment: 'Initial governed access.', changes: [{ field: 'records', before: null, after: state.policy.records[0] }] }];
  const access = await adapter.loadAccess(); assert.deepEqual(access.entitlementPolicy.audit, state.policy.audit);
  assert.equal(state.calls.some(call => call.url.includes('/rest/wcspedia/entitlements')), false);
  assert.equal(state.calls.some(call => new URL(call.url).searchParams.get('expand')?.includes('body.storage')), false);
  state.policy.records[0].permissions = ['entitlements.view']; state.policy.revision++;
  const refreshed = await adapter.loadAccess();
  assert.equal(refreshed.effectivePermissions['content.create'], false);
  assert.deepEqual(refreshed.entitlementPolicy.audit, state.policy.audit);
});

test('content-only users and standalone widgets without a service do not request the restricted audit journal', async () => {
  const content = entitlementServer(); content.state.policy.records[0].permissions = ['content.create'];
  assert.equal((await content.adapter.loadAccess()).effectivePermissions['content.create'], true);
  assert.equal(content.state.calls.some(call => call.url.includes('/rest/wcspedia/entitlements')), false);
  const standalone = entitlementServer({ config: { entitlementsEndpoint: '' } });
  assert.deepEqual((await standalone.adapter.loadAccess()).entitlementPolicy.audit, []);
  assert.equal(standalone.state.calls.some(call => call.url.includes('/rest/wcspedia/entitlements')), false);
});

function metricsServer(options={}) {
  const state={calls:[],counts:[{documentKey:'aide',views:0}],...options};
  const fetch=async (url,init)=>{
    state.calls.push({url,init});
    if(state.networkError)throw Error('Lost response');
    if(init.method==='GET')return response(state.listResponse||{schemaVersion:1,counts:state.counts},state.status||200);
    const body=JSON.parse(init.body);
    return response(state.acknowledgment?state.acknowledgment(body):{accepted:true,requestId:body.requestId,documentKey:body.documentKey,views:1,counted:true},state.status||200);
  };
  return {state,adapter:C.create({mode:'confluence',rootPageId:'123',metricsEndpoint:'/confluence/rest/wcspedia/metrics',...options.config},{fetch,location})};
}
const viewCommand={documentKey:'aide',version:1,revision:1,requestId:'view-request-0001'};

test('document view metrics are explicitly unavailable without a trusted endpoint',async()=>{
  const {adapter,state}=metricsServer({config:{metricsEndpoint:''}});
  assert.equal(adapter.info().metricsConfigured,false);
  await assert.rejects(adapter.loadMetrics(),e=>e.code==='METRICS_UNAVAILABLE');
  await assert.rejects(adapter.recordView(viewCommand),e=>e.code==='METRICS_UNAVAILABLE');
  assert.equal(state.calls.length,0);
  assert.throws(()=>metricsServer({config:{metricsEndpoint:'https://foreign.example/metrics'}}),e=>e.code==='CONFIGURATION');
  assert.throws(()=>metricsServer({config:{metricsEndpoint:'/outside/metrics'}}),e=>e.code==='CONFIGURATION');
});
test('metrics reads preserve real zero counts and validate the complete authorized count list',async()=>{
  const {adapter,state}=metricsServer({counts:[{documentKey:'aide',views:0},{documentKey:'another',views:Number.MAX_SAFE_INTEGER},{documentKey:'constructor',views:2}]});
  const counts=await adapter.loadMetrics();
  assert.equal(Object.getPrototypeOf(counts),null);assert.equal(counts.aide,0);assert.equal(counts.another,Number.MAX_SAFE_INTEGER);assert.equal(counts.constructor,2);assert.equal(counts.absent,undefined);
  counts.aide=1;assert.equal(counts.aide,1,'the application may merge a confirmed increment');
  const {url,init}=state.calls[0];assert.equal(new URL(url).searchParams.get('rootPageId'),'123');assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');
  for(const listResponse of [{schemaVersion:2,counts:[]},{schemaVersion:1,counts:{}},{schemaVersion:1,counts:[{documentKey:'aide',views:-1}]},{schemaVersion:1,counts:[{documentKey:'aide',views:1.5}]},{schemaVersion:1,counts:[{documentKey:'aide',views:Number.MAX_SAFE_INTEGER+1}]},{schemaVersion:1,counts:[{documentKey:'aide',views:'2'}]},{schemaVersion:1,counts:[{documentKey:'aide',views:0},{documentKey:'aide',views:1}]},{schemaVersion:1,counts:[{documentKey:'../escape',views:1}]}])await assert.rejects(metricsServer({listResponse}).adapter.loadMetrics(),e=>e.code==='INVALID_METRICS');
  await assert.rejects(metricsServer({status:403}).adapter.loadMetrics(),e=>e.status===403);
});
test('view commands send only the document snapshot and idempotency key, never identity or counts',async()=>{
  const {adapter,state}=metricsServer();
  assert.deepEqual(await adapter.recordView({...viewCommand,actorSOEID:'FORGED',actorId:'b',views:9000,viewedAt:'1990-01-01',nativePermissions:{read:true}}),{documentKey:'aide',views:1,counted:true});
  const {url,init}=state.calls[0];assert.equal(new URL(url).pathname,'/confluence/rest/wcspedia/metrics');
  assert.deepEqual(JSON.parse(init.body),{rootPageId:'123',...viewCommand});
  assert.equal(init.headers['Idempotency-Key'],viewCommand.requestId);assert.equal(init.headers['X-Requested-With'],'XMLHttpRequest');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');
  const before=state.calls.length;
  for(const change of [{documentKey:'../aide'},{version:0},{revision:1.1},{requestId:'\nunsafe'}])await assert.rejects(adapter.recordView({...viewCommand,...change}),e=>e.code==='INVALID_METRICS');
  assert.equal(state.calls.length,before);
});
test('view responses must acknowledge the exact request, snapshot key, and integer count',async()=>{
  for(const patch of [{accepted:false},{requestId:'wrong-request'},{documentKey:'another'},{views:-1},{views:'1'},{views:Number.MAX_SAFE_INTEGER+1},{counted:'true'}]){
    const {adapter}=metricsServer({acknowledgment:body=>({accepted:true,...body,views:1,counted:true,...patch})});
    await assert.rejects(adapter.recordView(viewCommand),e=>e.code==='UNKNOWN_COMMIT');
  }
  assert.deepEqual(await metricsServer({acknowledgment:body=>({accepted:true,...body,views:5,counted:false})}).adapter.recordView(viewCommand),{documentKey:'aide',views:5,counted:false});
});
test('view failures never invent counts and retries retain the same request identifier',async()=>{
  const {adapter,state}=metricsServer({networkError:true});
  const automatic={documentKey:'aide',version:1,revision:1};
  await assert.rejects(adapter.recordView(automatic),e=>e.code==='UNKNOWN_COMMIT');
  state.networkError=false;await adapter.recordView(automatic);
  assert.equal(JSON.parse(state.calls[0].init.body).requestId,JSON.parse(state.calls[1].init.body).requestId);
  state.networkError=true;await assert.rejects(adapter.recordView(viewCommand),e=>e.code==='UNKNOWN_COMMIT');
  state.networkError=false;await adapter.recordView(viewCommand);
  assert.equal(JSON.parse(state.calls[2].init.body).requestId,JSON.parse(state.calls[3].init.body).requestId);
  await assert.rejects(metricsServer({status:409}).adapter.recordView(viewCommand),e=>e.code==='CONFLICT');
});


test('published editor saves send validated revise content as one idempotent workflow command', async () => {
  const {adapter,state}=server({config:{workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace'}});await adapter.load();
  await adapter.submitAction(command({action:'revise',changes:{title:'Updated instructions',bodyMarkdown:'## Prepare\n\nRecord the receiving owner.',approvedBy:'spoofed'}}));
  const posted=state.calls.filter(call=>call.init.method==='POST');assert.equal(posted.length,1);const body=JSON.parse(posted[0].init.body);assert.equal(body.action,'revise');assert.equal(body.documentKey,'aide');assert.equal(body.changes.title,'Updated instructions');assert.equal(body.changes.bodyMarkdown,'## Prepare\n\nRecord the receiving owner.');assert.equal('approvedBy' in body.changes,false);assert.ok(body.requestId);
  await assert.rejects(adapter.submitAction(command({action:'revise',changes:{slug:'invalid slug'}})));assert.equal(state.calls.filter(call=>call.init.method==='POST').length,1);
});

test('create, edit and revise preserve validated governance without accepting review evidence as content', async () => {
  const governance=G.normalize({classification:'other-nhd',owningTeam:'WCS Operations',scope:'Internal job aids',audience:'Credit operations',classificationRationale:'Descriptive guidance.'});
  for(const action of ['create','edit','revise']) {
    const {adapter,state}=server({config:{workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace'}});
    await adapter.load();
    const data={governance,governanceReview:reviewEvidence(),approvedBy:'forged'};
    await adapter.submitAction(action==='create'?{action,comment:'Create governed draft.',fields:{...fields,...data}}:command({action,changes:data}));
    const posted=JSON.parse(state.calls.find(call=>call.init.method==='POST').init.body),payload=posted.fields||posted.changes;
    assert.deepEqual(payload.governance,governance);
    assert.equal(Object.hasOwn(payload,'governanceReview'),false);
    assert.equal(Object.hasOwn(payload,'approvedBy'),false);
  }
});

test('invalid governance metadata is rejected before transmission while incomplete draft metadata is allowed', async () => {
  const {adapter,state}=server({config:{workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace'}});await adapter.load();
  for(const governance of [null,{...G.normalize(),reviewMonths:36},{...G.normalize(),approvedBy:'forged'},{...G.normalize(),sources:[{id:'source',url:'javascript:alert(1)'}]}]) {
    await assert.rejects(adapter.submitAction(command({action:'edit',changes:{governance}})));
  }
  assert.equal(state.calls.some(call=>call.init.method==='POST'),false);
  await adapter.submitAction(command({action:'edit',changes:{governance:G.normalize()}}));
  assert.equal(JSON.parse(state.calls.find(call=>call.init.method==='POST').init.body).changes.governance.classification,'unclassified');
});

test('governance review transport is strict, snapshot-bound, and excludes forged caller identity', async () => {
  const {adapter,state}=server({config:{workflowEndpoint:'/confluence/rest/wcspedia/workflow',workspaceEndpoint:'/confluence/rest/wcspedia/workspace'}});await adapter.load();
  const valid=reviewEvidence();
  for(const governanceReview of [undefined,{...valid,reviewedBy:'a'},{...valid,actorSOEID:'FORGED'},{...valid,revision:2},{...valid,baselineVersion:'future'},{...valid,checks:{...valid.checks,sources:false}},{...valid,checks:{...valid.checks,override:true}},{...valid,reason:' '},{...valid,reason:'x'.repeat(4001)},{...valid,findingDisposition:'approved-exception'}]) {
    await assert.rejects(adapter.submitAction(command({governanceReview})));
  }
  assert.equal(state.calls.some(call=>call.init.method==='POST'),false);
  await adapter.submitAction(command({governanceReview:valid,actorId:'a',actorSOEID:'FORGED',requireGovernance:false}));
  const posted=JSON.parse(state.calls.find(call=>call.init.method==='POST').init.body);
  assert.deepEqual(posted.governanceReview,valid);
  for(const field of ['actorId','actorSOEID','requireGovernance'])assert.equal(Object.hasOwn(posted,field),false);
});

test('reader snapshots reject private governance review evidence even when null', async () => {
  for(const evidence of [null,{...reviewEvidence(),reviewedBy:'b',reason:'Private reviewer rationale.'}]) {
    const data=fixture();data.documents[0].versions[0].governanceReview=evidence;
    await assert.rejects(server({data}).adapter.load(),error=>error.code==='PUBLISHED_PROJECTION_REQUIRED');
  }
  const data=fixture();data.documents[0].versions[0].governance=G.normalize();
  assert.equal((await server({data}).adapter.load()).data.documents[0].versions[0].governance.classification,'unclassified');
});

const nativeAreaIds = ['credit-approval-control', 'credit-information-management', 'credit-management-reporting', 'deal-closing', 'documentation-pledging', 'emea-credit-admin', 'loan-management', 'regional-operating-manuals'];
function publicationConfig() {
  return { enabled: true, workingRootPageId: '100', publishedRootPageId: '123', areaPageIds: Object.fromEntries(nativeAreaIds.map((area, index) => [area, String(201 + index)])) };
}
function publicationServer(options = {}) {
  const config = { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace', nativePublication: publicationConfig(), ...options.config };
  const base = server({ config: { ...config, nativePublication: { enabled: false } } });
  base.state.data.areas = nativeAreaIds.map(id => ({ id, title: id }));
  base.state.data.documents[0].area = 'loan-management';
  const workspace = workingFixture();
  workspace.areas = structuredClone(base.state.data.areas);
  workspace.documents[0].area = 'loan-management';
  workspace.documents[0].confluencePageId = '900';
  workspace.documents[0].confluencePageVersion = 4;
  if (options.published) {
    workspace.documents[0].publishedConfluencePageId = '901';
    workspace.documents[0].publishedConfluencePageVersion = 7;
  }
  base.state.workspaceData = { data: workspace };
  const fetch = async (url, init) => {
    if (!new URL(url).pathname.endsWith('/rest/wcspedia/workflow') || init.method !== 'POST') return base.fetch(url, init);
    base.state.calls.push({url, init});
    const body = JSON.parse(init.body), creating = body.action === 'create', published = body.action === 'approve';
    let doc = creating ? W.createDocument(body.fields, {people, actorId:'a', now:'2026-10-15T08:00:00Z'}) : structuredClone(workspace.documents.find(item => item.id === body.documentKey));
    const before = doc.versions.at(-1);
    if (body.action === 'edit') Object.assign(before, body.changes, { revision: before.revision + 1, status: 'Draft' });
    if (body.action === 'revise') {
      before.status = 'Published'; doc.publishedVersion = before.version;
      doc.versions.push({...structuredClone(before), ...body.changes, version:before.version+1, revision:1, status:'Draft'});
    }
    if (published) { before.status = 'Published'; doc.publishedVersion = before.version; }
    const pageField = published ? 'publishedConfluencePageId' : 'confluencePageId';
    const pageVersionField = published ? 'publishedConfluencePageVersion' : 'confluencePageVersion';
    doc[pageField] = doc[pageField] || (published ? '901' : '902');
    doc[pageVersionField] = (doc[pageVersionField] || 0) + 1;
    const current = doc.versions.at(-1);
    const receipt = { accepted:true, requestId:body.requestId, publication:{operation:published?'published':'working', documentKey:doc.id, areaId:doc.area, pageId:doc[pageField], parentPageId:published?publicationConfig().areaPageIds[doc.area]:'100', pageVersion:doc[pageVersionField], version:current.version, revision:current.revision} };
    if (!options.staleReload) {
      if (creating) workspace.documents.push(doc);
      else workspace.documents[workspace.documents.findIndex(item => item.id === doc.id)] = doc;
    }
    base.state.version++;
    if (options.receipt) return response(options.receipt(receipt, body));
    return response(receipt);
  };
  const adapter = C.create({mode:'confluence', rootPageId:'123', ...config}, {fetch, location, search:Search});
  return {adapter, state:base.state, workspace};
}
const nativeCreate = () => ({action:'create', comment:'Create child document.', fields:{...structuredClone(fields), id:'new-aide', area:'loan-management'}});

test('native publication creates a working child with a stable key and verifies the refreshed native page mapping', async () => {
  const {adapter,state} = publicationServer(); await adapter.load();
  const saved = await adapter.submitAction(nativeCreate());
  const doc = saved.data.documents.find(item => item.id === 'new-aide');
  assert.equal(doc.confluencePageId, '902'); assert.equal(doc.confluencePageVersion, 1);
  const body = JSON.parse(state.calls.find(item => item.init.method === 'POST').init.body);
  assert.deepEqual(body.nativePublication, {required:true});
  assert.equal(body.fields.area, 'loan-management');
  assert.equal('areaPageIds' in body, false); assert.equal('parentPageId' in body, false); assert.equal('workingRootPageId' in body, false);
  assert.equal(adapter.info().nativePublicationEnabled, true);
});

test('native publication preserves working page identity through edits and new revisions', async () => {
  for (const action of ['edit','revise']) {
    const {adapter} = publicationServer(); await adapter.load();
    const saved = await adapter.submitAction(command({action, changes:{title:'A changed title'}}));
    const doc = saved.data.documents[0];
    assert.equal(doc.confluencePageId, '900'); assert.equal(doc.confluencePageVersion, 5);
    assert.equal(doc.versions.at(-1).version, action === 'revise' ? 2 : 1);
    assert.equal(doc.versions.at(-1).revision, action === 'edit' ? 2 : 1);
  }
});

test('approval confirms the published child under its selected area and reuses an existing reader page', async () => {
  for (const published of [false,true]) {
    const {adapter} = publicationServer({published}); await adapter.load();
    const saved = await adapter.submitAction(command({action:'approve',nextReviewAt:'2027-10-15'}));
    assert.equal(saved.data.documents[0].publishedConfluencePageId, '901');
    assert.equal(saved.data.documents[0].publishedConfluencePageVersion, published ? 8 : 1);
    assert.equal(saved.data.documents[0].publishedVersion, 1);
  }
});

test('native publication configuration blocks writes for missing, placeholder, duplicate or overlapping parents without blocking library reads', async () => {
  const variants = [
    {...publicationConfig(),workingRootPageId:'WORKING_ROOT_PAGE_ID'},
    {...publicationConfig(),publishedRootPageId:'100'},
    {...publicationConfig(),publishedRootPageId:'999'},
    {...publicationConfig(),areaPageIds:{}},
    {...publicationConfig(),areaPageIds:{...publicationConfig().areaPageIds,'loan-management':'LOAN_PAGE_ID'}},
    {...publicationConfig(),areaPageIds:{...publicationConfig().areaPageIds,'loan-management':'100'}},
    {...publicationConfig(),areaPageIds:{...publicationConfig().areaPageIds,'loan-management':'201'}}
  ];
  for (const nativePublication of variants) {
    const {adapter,state} = publicationServer({config:{nativePublication}}); await adapter.load();
    await assert.rejects(adapter.submitAction(nativeCreate()),error=>error.code==='CONFIGURATION');
    assert.equal(state.calls.some(item=>item.init.method==='POST'),false);
  }
});

test('native publication cannot fall back to the library root for an unknown or unmapped business area', async () => {
  const {adapter,state,workspace} = publicationServer(); workspace.areas.push({id:'new-area',title:'New area'}); await adapter.load();
  for (const area of ['new-area','unknown-area']) {
    const cmd = nativeCreate();cmd.fields.area=area;
    await assert.rejects(adapter.submitAction(cmd),error=>error.code==='INVALID_MAPPING');
  }
  assert.equal(state.calls.some(item=>item.init.method==='POST'),false);
});

test('native publication requires an exact server commit receipt, not HTTP success alone', async () => {
  const corruptions = [
    () => ({ok:true}), () => '<html>Signed out</html>', r=>({...r,accepted:false}), r=>({...r,requestId:'another-request'}),
    r=>({...r,publication:{...r.publication,operation:'published'}}),
    r=>({...r,publication:{...r.publication,documentKey:'another-document'}}),
    r=>({...r,publication:{...r.publication,areaId:'deal-closing'}}),
    r=>({...r,publication:{...r.publication,parentPageId:'123'}}),
    r=>({...r,publication:{...r.publication,pageId:'201'}}),
    r=>({...r,publication:{...r.publication,pageId:'javascript:alert(1)'}}),
    r=>({...r,publication:{...r.publication,pageVersion:0}}),
    r=>({...r,publication:{...r.publication,version:2}}),
    r=>({...r,publication:{...r.publication,revision:2}})
  ];
  for (const receipt of corruptions) {
    const {adapter,state} = publicationServer({receipt}); await adapter.load();
    await assert.rejects(adapter.submitAction(nativeCreate()),error=>error.code==='UNKNOWN_COMMIT');
    assert.equal(state.calls.filter(item=>item.init.method==='POST').length,1);
  }
});

test('native updates reject replacement page IDs and non-increasing native versions', async () => {
  for (const action of ['edit','revise','approve']) {
    for (const patch of [{pageId:'999'},{pageVersion:action==='approve'?7:4}]) {
      const {adapter} = publicationServer({published:true,receipt:r=>({...r,publication:{...r.publication,...patch}})}); await adapter.load();
      await assert.rejects(adapter.submitAction(command({action, changes:{title:'Changed'},nextReviewAt:'2027-10-15'})),error=>error.code==='UNKNOWN_COMMIT');
    }
  }
});

test('native publication cannot report success until refreshed workspace confirms the committed mapping and revision', async () => {
  for (const action of ['create','edit','revise','approve']) {
    const {adapter} = publicationServer({staleReload:true});await adapter.load();
    await assert.rejects(adapter.submitAction(action==='create'?nativeCreate():command({action,changes:{title:'Changed'},nextReviewAt:'2027-10-15'})),error=>error.code==='REFRESH_REQUIRED');
  }
});

test('native page mappings reject reused reader IDs and malformed persisted page versions', () => {
  const same = workingFixture();same.documents[0].confluencePageId='900';same.documents[0].publishedConfluencePageId='900';
  assert.throws(()=>C.validateData(same),error=>error.code==='INVALID_MAPPING');
  const bad = workingFixture();bad.documents[0].publishedConfluencePageId='not-a-page';
  assert.throws(()=>C.validateData(bad),error=>error.code==='INVALID_MAPPING');
  bad.documents[0].publishedConfluencePageId='901';bad.documents[0].publishedConfluencePageVersion=0;
  assert.throws(()=>C.validateData(bad),error=>error.code==='INVALID_MAPPING');
});

function treeHit(id, ancestors = ['123'], overrides = {}) {
  return { content: { id, type: 'page', title: 'Native page ' + id, space: { key: 'WCS' }, ancestors: ancestors.map(id => ({ id })), ...overrides } };
}

test('Insights multi-type search stays root-and-space scoped, preserves tag predicates and excludes its launcher', async () => {
  const { adapter, state } = server({ config: { attachmentPageId: '789', nativePublication: { insightsPageId: '600', workingRootPageId: '700', areaPageIds: { loans: '400' } } }, searchResponse: { results: [treeHit('601', ['123', '600'], { metadata: { labels: { results: [{ name: 'wcs-type-blog' }, { name: 'wcs-tag-team-news' }] } } })] } });
  const result = await adapter.searchPages({ scope: 'tree', types: ['Blog', 'Knowledge sharing'], tag: 'Team news' });
  assert.match(result.cql, /^type = page AND ancestor = 123 AND space = "WCS"/);
  assert.match(result.cql, /label = "wcs-tag-team-news"/);
  assert.match(result.cql, /label IN \("wcs-type-blog", "wcs-type-knowledge-sharing"\)/);
  const excluded = result.cql.match(/id NOT IN \(([^)]+)\)/)[1].split(', ');
  for (const id of ['123', '789', '600', '700', '400']) assert.ok(excluded.includes(id));
  assert.match(result.cql, /ancestor NOT IN \(700\)/);
  assert.deepEqual(result.results.map(item => item.id), ['601']);
  assert.equal(result.results[0].type, 'Blog');
  assert.deepEqual(result.results[0].tags, ['team-news']);
  assert.ok(state.calls.every(call => new URL(call.url).origin === 'https://intranet.example'));
  const before = state.calls.length;
  for (const options of [{ types: 'Blog' }, { types: ['Blog'], type: 'Guide' }, { types: ['NOT_A_TYPE'] }, { types: [null] }, { types: ['Blog" OR space = OTHER'] }]) await assert.rejects(adapter.searchPages({ scope: 'tree', ...options }));
  assert.equal(state.calls.length, before, 'Invalid type filters fail before network I/O');
});

test('comment policy remains an explicit boolean through create, edit and revise transport', async () => {
  for (const action of ['create', 'edit', 'revise']) {
    const { adapter, state } = server({ config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
    await adapter.load();
    for (const commentsEnabled of [false, true]) {
      const input = action === 'create' ? { action, comment: 'Set discussion policy.', fields: { ...fields, commentsEnabled } } : command({ action, changes: { commentsEnabled } });
      await adapter.submitAction(input);
      const posted = JSON.parse(state.calls.filter(call => call.init.method === 'POST').at(-1).init.body);
      assert.equal((posted.fields || posted.changes).commentsEnabled, commentsEnabled);
    }
    const writes = state.calls.filter(call => call.init.method === 'POST').length;
    for (const commentsEnabled of [null, 'false', 'true', 0, 1, {}, []]) {
      const input = action === 'create' ? { action, comment: 'Invalid discussion policy.', fields: { ...fields, commentsEnabled } } : command({ action, changes: { commentsEnabled } });
      await assert.rejects(adapter.submitAction(input), /commentsEnabled must be true or false/);
    }
    assert.equal(state.calls.filter(call => call.init.method === 'POST').length, writes);
  }
});

test('workspace validation preserves explicit comment enable/disable and rejects ambiguous persisted policy values', () => {
  for (const commentsEnabled of [false, true]) {
    const data = workingFixture(); data.documents[0].versions[0].commentsEnabled = commentsEnabled;
    assert.equal(C.validateData(data).documents[0].versions[0].commentsEnabled, commentsEnabled);
  }
  assert.doesNotThrow(() => C.validateData(workingFixture()), 'Legacy snapshots without a policy remain compatible');
  for (const commentsEnabled of [null, 'false', 0, {}, []]) {
    const data = workingFixture(); data.documents[0].versions[0].commentsEnabled = commentsEnabled;
    assert.throws(() => C.validateData(data), /commentsEnabled must be true or false/);
  }
});

test('Insights publication requires the exact parent for configured content types and keeps drafts on the working root', async () => {
  const config = { ...publicationConfig(), insightsPageId: '600', insightsTypes: ['Blog', 'Knowledge sharing'] };
  for (const type of ['Blog', 'Knowledge sharing']) {
    const f = publicationServer({ config: { nativePublication: config }, receipt: receipt => ({ ...receipt, publication: { ...receipt.publication, parentPageId: '600' } }) });
    f.workspace.types = ['Blog', 'Knowledge sharing', 'Job aid']; f.workspace.documents[0].type = type;
    await f.adapter.load();
    const saved = await f.adapter.submitAction(command({ action: 'approve', nextReviewAt: '2027-10-15' }));
    assert.equal(saved.data.documents[0].publishedConfluencePageId, '901'); assert.equal(saved.data.documents[0].type, type);
    const body = JSON.parse(f.state.calls.find(call => call.init.method === 'POST').init.body);
    assert.deepEqual(body.nativePublication, { required: true }); assert.equal(Object.hasOwn(body, 'parentPageId'), false);
  }
  const draft = publicationServer({ config: { nativePublication: config } }); draft.workspace.types = ['Blog', 'Knowledge sharing', 'Job aid']; await draft.adapter.load();
  const create = nativeCreate(); create.fields.type = 'Blog'; create.fields.commentsEnabled = false;
  assert.equal((await draft.adapter.submitAction(create)).data.documents.find(doc => doc.id === create.fields.id).confluencePageId, '902');
  const standard = publicationServer({ config: { nativePublication: config } }); standard.workspace.types = ['Blog', 'Knowledge sharing', 'Job aid']; await standard.adapter.load();
  assert.equal((await standard.adapter.submitAction(command({ action: 'approve', nextReviewAt: '2027-10-15' }))).data.documents[0].publishedConfluencePageId, '901');
});

test('Insights approval rejects wrong-parent receipts, protected parent IDs and unavailable or ambiguous configuration', async () => {
  const base = { ...publicationConfig(), insightsPageId: '600', insightsTypes: ['Blog'] };
  for (const patch of [{ parentPageId: publicationConfig().areaPageIds['loan-management'] }, { parentPageId: '123' }, { parentPageId: '600', pageId: '600' }, { parentPageId: '600', operation: 'working' }]) {
    const f = publicationServer({ config: { nativePublication: base }, receipt: receipt => ({ ...receipt, publication: { ...receipt.publication, ...patch } }) }); f.workspace.types = ['Blog']; f.workspace.documents[0].type = 'Blog'; await f.adapter.load();
    await assert.rejects(f.adapter.submitAction(command({ action: 'approve', nextReviewAt: '2027-10-15' })), { code: 'UNKNOWN_COMMIT' });
  }
  for (const change of [{ insightsPageId: '' }, { insightsPageId: '123' }, { insightsPageId: '201' }, { insightsPageId: 'bad' }, { insightsTypes: 'Blog' }, { insightsTypes: ['Unknown'] }]) {
    const f = publicationServer({ config: { nativePublication: { ...base, ...change } } }); f.workspace.types = ['Blog']; f.workspace.documents[0].type = 'Blog'; await f.adapter.load();
    await assert.rejects(f.adapter.submitAction(command({ action: 'approve', nextReviewAt: '2027-10-15' })), { code: 'CONFIGURATION' });
    assert.equal(f.state.calls.some(call => call.init.method === 'POST'), false);
  }
});

test('main CQL tree search includes children and deeply nested unlabelled pages without the launcher', async () => {
  const hits = [treeHit('400'), treeHit('401', ['123', '400']), treeHit('402', ['123', '400', '401'])];
  const { adapter, state } = server({ searchResponse: { results: hits } });
  const result = await adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6 });
  assert.match(result.cql, /^type = page AND ancestor = 123 AND space = "WCS" AND id NOT IN \(123\) AND \(text ~ /);
  assert.equal(result.cql.includes('label'), false);
  assert.deepEqual(result.results.map(item => item.id), ['400', '401', '402']);
  assert.equal(result.total, null, 'missing totals are not invented');
  for (const item of result.results) {
    assert.equal(item.type, null); assert.equal(item.category, null); assert.equal(item.version, null);
    assert.equal(item.url, 'https://intranet.example/confluence/pages/viewpage.action?pageId=' + item.id);
  }
  const request = state.calls.find(call => call.url.includes('/rest/api/search?'));
  assert.equal(new URL(request.url).searchParams.get('expand'), 'content.version,content.space,content.ancestors,content.metadata.labels,content.body.storage');
  assert.equal(request.init.credentials, 'same-origin'); assert.equal(request.init.redirect, 'error');
});

test('tree results must verify the root ancestry, content type and current space', async () => {
  for (const hit of [treeHit('400', []), treeHit('400', ['999']), treeHit('400', ['123'], { type: 'blogpost' }), treeHit('400', ['123'], { space: { key: 'OTHER' } }), treeHit('unsafe-id')]) {
    const { adapter } = server({ searchResponse: { results: [hit] } });
    await assert.rejects(adapter.searchPages({ scope: 'tree' }), error => error.code === 'INVALID_SCOPE');
  }
  const { adapter, state } = server();
  await assert.rejects(adapter.searchPages({ scope: 'all-spaces' }), /scope/);
  assert.equal(state.calls.length, 0);
});

test('mapped business area searches native subtrees, including unlabelled nested documents', async () => {
  const { adapter, state } = server({ config: { nativePublication: { enabled: false, areaPageIds: { loans: '400' } } }, searchResponse: { results: [treeHit('402', ['123', '400', '401'])] } });
  const result = await adapter.searchPages({ scope: 'tree', area: 'loans' });
  assert.equal(result.cql, 'type = page AND ancestor = 123 AND space = "WCS" AND (id = 400 OR ancestor = 400) AND id NOT IN (123, 400)');
  assert.ok(result.results.every(item => item.category === 'loans'));
  state.searchResponse = { results: [treeHit('403', ['123', '405'])] };
  await adapter.loadAccess();
  await assert.rejects(adapter.searchPages({ scope: 'tree', area: 'loans' }), error => error.code === 'INVALID_SCOPE');
  const fallback = server({ config: { nativePublication: { areaPageIds: { loans: 'REPLACE_WITH_ID' } } } });
  assert.match((await fallback.adapter.searchPages({ scope: 'tree', area: 'loans' })).cql, /AND label IN \("wcs-area-loans"\)$/);
});

test('business-area and topic search includes matching Insights documents while retaining unlabelled physical descendants', async () => {
  const config = { nativePublication: { insightsPageId: '600', areaPageIds: { loans: '400', controls: '500' } } };
  const insight = treeHit('601', ['123', '600', '602'], { metadata: { labels: { results: [{ name: 'wcs-area-controls' }, { name: 'wcs-area-loans' }, { name: 'wcs-type-blog' }, { name: 'wcs-tag-handover' }] } } });
  const { adapter, state } = server({ config, searchResponse: { results: [treeHit('402', ['123', '400', '401']), insight] } });
  const result = await adapter.searchPages({ scope: 'tree', area: 'loans', tag: 'Handover', excerpt: false });
  assert.equal(result.cql, 'type = page AND ancestor = 123 AND space = "WCS" AND (id = 400 OR ancestor = 400 OR (ancestor = 600 AND label = "wcs-area-loans")) AND id NOT IN (123, 600, 400, 500) AND label = "wcs-tag-handover"');
  assert.deepEqual(result.results.map(item => [item.id, item.category]), [['402', 'loans'], ['601', 'loans']]);
  assert.equal(result.results[1].type, 'Blog');
  assert.deepEqual(result.results[1].tags, ['handover']);
  assert.equal(state.calls.length, 2, 'Only root validation and one bounded search are needed.');
  const request = new URL(state.calls.at(-1).url);
  assert.equal(request.searchParams.get('expand'), 'content.space,content.ancestors,content.metadata.labels');
  assert.equal(request.searchParams.get('excerpt'), 'none');
  assert.equal(request.searchParams.get('expand').includes('body.storage'), false, 'Autocomplete excludes article bodies');
});

test('business-area Insights branch rejects wrong labels, parents, spaces and malformed labels without broad fallback', async () => {
  const metadata = { labels: { results: [{ name: 'wcs-area-loans' }] } };
  for (const hit of [
    treeHit('601', ['123', '600'], { metadata: { labels: { results: [{ name: 'wcs-area-controls' }] } } }),
    treeHit('601', ['123', '600'], { metadata: { labels: { results: [] } } }),
    treeHit('601', ['123', '600'], { metadata: { labels: { results: [null] } } }),
    treeHit('601', ['123', '500'], { metadata }),
    treeHit('601', ['600'], { metadata }),
    treeHit('601', ['123', '600'], { metadata, space: { key: 'OTHER' } }),
    treeHit('600', ['123'], { metadata })
  ]) {
    const { adapter, state } = server({ config: { nativePublication: { insightsPageId: '600', areaPageIds: { loans: '400', controls: '500' } } }, searchResponse: { results: [hit] } });
    await assert.rejects(adapter.searchPages({ scope: 'tree', area: 'loans' }), { code: 'INVALID_SCOPE' });
    assert.equal(state.calls.length, 2, 'Conflicting metadata never triggers an alternate query.');
  }
});

test('ambiguous Insights search parents fail before any network request', async () => {
  for (const insightsPageId of ['123', '400', '700', '600 OR space=OTHER']) {
    const { adapter, state } = server({ config: { nativePublication: { insightsPageId, workingRootPageId: '700', areaPageIds: { loans: '400' } } } });
    await assert.rejects(adapter.searchPages({ scope: 'tree', area: 'loans' }), { code: 'CONFIGURATION' });
    assert.equal(state.calls.length, 0);
  }
});

test('tree filters use indexed labels and dates while returned metadata and excerpts remain plain text', async () => {
  const hit = treeHit('401', ['123', '400'], { title: 'Native &amp; guide', version: { number: 8, when: '2026-10-15T10:00:00Z' }, metadata: { labels: { results: [{ name: 'wcs-area-loans' }, { name: 'wcs-type-job-aid' }] } } });
  hit.excerpt = '<script>remove()</script>@@@hl@@@Safe@@@endhl@@@ &amp; <b>helpful</b>.';
  hit.url = 'javascript:alert(1)';
  const { adapter } = server({ searchResponse: { results: [hit], totalSize: 1 } });
  const result = await adapter.searchPages({ scope: 'tree', type: 'Job aid', tag: 'Credit controls', process: 'Review & Approval', region: 'EMEA', year: '2026', updated: 'month', sort: 'updated' });
  assert.ok(result.cql.includes('label = "wcs-tag-credit-controls"'));
  assert.ok(result.cql.includes('label = "wcs-process-review-approval"'));
  assert.ok(result.cql.includes('label = "wcs-region-emea"'));
  assert.ok(result.cql.includes('label IN ("wcs-type-job-aid")'));
  assert.ok(result.cql.includes('lastmodified >= startOfDay("-30d")'));
  assert.ok(result.cql.endsWith('lastmodified < "2027-01-01" ORDER BY lastmodified DESC'));
  assert.deepEqual(result.results[0], { id: '401', title: 'Native & guide', summary: '', updated: '2026-10-15T10:00:00Z', url: 'https://intranet.example/confluence/pages/viewpage.action?pageId=401', category: 'loans', type: 'Job aid', tags: [], version: 8 });
});

test('server offset continuations preserve the generated tree query and requested page size', async () => {
  const { adapter, state } = server({ searchResponse: { results: [treeHit('400')], _links: { next: '/rest/api/search?start=17&limit=999&cql=space=OTHER' } } });
  const first = await adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6 });
  assert.deepEqual(first.nextContinuation, { cql: first.cql, limit: 6, start: 17 });
  assert.equal(first.nextStart, 17);
  state.searchResponse = { results: [treeHit('401')], _links: {} };
  const second = await adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6, continuation: JSON.parse(JSON.stringify(first.nextContinuation)) });
  const request = new URL(state.calls.at(-1).url);
  assert.equal(request.searchParams.get('start'), '17'); assert.equal(request.searchParams.get('limit'), '6');
  assert.equal(request.searchParams.get('cql'), first.cql);
  assert.equal(second.nextContinuation, null);
});

test('cursor continuations use only a validated same-context search endpoint and cannot replay another query', async () => {
  const { adapter, state } = server({ searchResponse: { results: [treeHit('400')], _links: { next: '/confluence/rest/api/search?cursor=next%2Bcursor&cql=type=attachment' } } });
  const first = await adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6 });
  assert.deepEqual(first.nextContinuation, { cql: first.cql, limit: 6, cursor: 'next+cursor' });
  await adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6, continuation: first.nextContinuation });
  const request = new URL(state.calls.at(-1).url);
  assert.equal(request.searchParams.get('cursor'), 'next+cursor'); assert.equal(request.searchParams.has('start'), false);
  assert.equal(request.searchParams.get('cql'), first.cql);
  const count = state.calls.length;
  for (const options of [
    { query: 'credit' }, { limit: 20 }, { continuation: { ...first.nextContinuation, start: 10 } },
    { continuation: { ...first.nextContinuation, cursor: '' } }, { continuation: { ...first.nextContinuation, cursor: 'bad\nvalue' } },
    { continuation: { ...first.nextContinuation, url: 'https://evil.example' } }
  ]) await assert.rejects(adapter.searchPages({ scope: 'tree', query: 'handover', limit: 6, continuation: first.nextContinuation, ...options }), error => error.code === 'INVALID_CONTINUATION');
  assert.equal(state.calls.length, count);
});

test('invalid, non-advancing and empty server continuations terminate instead of looping', async () => {
  for (const next of ['https://evil.example/rest/api/search?start=6', '/confluence/rest/api/content?start=6', '/other/rest/api/search?start=6', '/rest/api/search?start=0', '/rest/api/search?start=-1', '/rest/api/search?start=9007199254740992', '/rest/api/search?cursor=bad%0Avalue']) {
    const { adapter } = server({ searchResponse: { results: [treeHit('400')], totalSize: 100, _links: { next } } });
    assert.equal((await adapter.searchPages({ scope: 'tree', limit: 6 })).nextContinuation, null, next);
  }
  const empty = server({ searchResponse: { results: [], totalSize: 100, _links: { next: '/rest/api/search?start=6' } } });
  assert.equal((await empty.adapter.searchPages({ scope: 'tree' })).nextContinuation, null);
  const repeating = server({ searchResponse: { results: [treeHit('400')], _links: { next: '/rest/api/search?cursor=repeated' } } });
  const first = await repeating.adapter.searchPages({ scope: 'tree' });
  const second = await repeating.adapter.searchPages({ scope: 'tree', continuation: first.nextContinuation });
  assert.equal(second.nextContinuation, null);
});

test('tree search never turns permission failures into empty successful results', async () => {
  const adapter = C.create({ mode: 'confluence', rootPageId: '123' }, { search: Search, location, fetch: async url => new URL(url).pathname.endsWith('/content/123') ? response({ id: '123', type: 'page', space: { key: 'WCS' } }) : response({}, 403) });
  await assert.rejects(adapter.searchPages({ scope: 'tree' }), error => error.status === 403);
});

function landingServer(options = {}) {
  const areaPageIds = options.areaPageIds || Object.fromEntries(Array.from({ length: 8 }, (_, index) => ['area-' + index, String(400 + index)]));
  const state = { calls: [], active: 0, maxActive: 0 };
  const fetch = async (input, init) => {
    const url = new URL(input);
    state.calls.push({ url, init });
    state.active++; state.maxActive = Math.max(state.maxActive, state.active);
    try {
      if (options.wait) await options.wait(url, init);
      const override = options.reply && await options.reply(url, init);
      if (override) return override;
      if (url.pathname.endsWith('/content/123')) return response({ id: '123', type: 'page', space: { key: 'WCS' } });
      if (url.pathname.endsWith('/rest/api/content/search')) {
        const ids = url.searchParams.get('cql').match(/AND id IN \(([^)]+)\)$/)[1].split(', ');
        return response({ results: ids.map(id => options.areaReply?.(id) || { id, type: 'page', space: { key: 'WCS' }, ancestors: [{ id: '123' }] }) });
      }
      if (/\/content\/\d+$/.test(url.pathname)) {
        const id = url.pathname.split('/').pop();
        return response({ id, type: 'page', space: { key: 'WCS' }, ancestors: [{ id: '123' }] });
      }
      if (url.pathname.endsWith('/rest/api/search')) {
        const cql = url.searchParams.get('cql'), area = [...cql.matchAll(/AND \(id = (\d+) OR ancestor = \1\)/g)].find(match => match[1] !== '123');
        if (area) return response({ results: [treeHit('800' + area[1], ['123', area[1]])], totalSize: Number(area[1]) - 390 });
        return response({ results: [treeHit('800', ['123', '400', '777']), treeHit('801', ['123', '404']), treeHit('802', ['123', '407'])], totalSize: 80 });
      }
      throw new Error('Unexpected landing request ' + url);
    } finally { state.active--; }
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', attachmentPageId: '789', contextPath: '/confluence', entitlementsPageId: '503', pages: { home: '/confluence/pages/viewpage.action?pageId=123', mine: '/confluence/pages/viewpage.action?pageId=501', review: '/confluence/pages/viewpage.action?pageId=502', saved: '/confluence/pages/viewpage.action?pageId=504', entitlements: '/confluence/pages/viewpage.action?pageId=505', external: 'https://other.example/confluence/pages/viewpage.action?pageId=999' }, nativePublication: { enabled: false, workingRootPageId: '600', areaPageIds }, ...options.config, search: { transport: 'search', ...options.config?.search } }, { search: Search, location, fetch });
  return { adapter, state, areaPageIds };
}

test('latest native documents use modification order without a publication-year cutoff',async()=>{
 const f=landingServer({reply:url=>{
   if(!url.pathname.endsWith('/rest/api/search'))return;
   const hit=treeHit('800',['123','400']);hit.lastModified='2026-10-23T11:45:00Z';hit.content.history={createdDate:'2025-01-02T09:00:00Z'};
   return response({results:[hit],totalSize:1});
 }});
 const result=await f.adapter.loadLanding({areaIds:[]});
 assert.equal(result.recent[0].updated,'2026-10-23T11:45:00Z');
 const query=f.state.calls.find(call=>call.url.pathname.endsWith('/rest/api/search')).url.searchParams.get('cql');
 assert.match(query,/ORDER BY lastmodified DESC$/);assert.doesNotMatch(query,/created\s*[<=>]|lastmodified\s*[<=>]/i);
});

test('landing uses bounded native descendants and exact CQL area totals without a JSON document inventory', async () => {
  const { adapter, state } = landingServer({ wait: () => new Promise(resolve => setImmediate(resolve)) });
  const landing = await adapter.loadLanding();
  assert.deepEqual(landing.recent.map(item => item.id), ['800', '801', '802']);
  assert.deepEqual(landing.recent.map(item => item.category), ['area-0', 'area-4', 'area-7']);
  assert.deepEqual(Object.values(landing.areas).map(area => area.total), [10, 11, 12, 13, 14, 15, 16, 17]);
  assert.ok(state.maxActive <= 3); assert.ok(state.maxActive > 1);
  assert.equal(state.calls.length, 11, 'one shared root read, one bounded parent check and nine reusable indexed queries');
  assert.equal(state.calls.filter(call => call.url.pathname.endsWith('/content/123')).length, 1);
  const queries = state.calls.filter(call => call.url.pathname.endsWith('/rest/api/search'));
  assert.equal(queries.length, 9);
  assert.equal(queries.filter(call => call.url.searchParams.get('limit') === '3').length, 1);
  assert.equal(queries.filter(call => call.url.searchParams.get('limit') === '6').length, 8);
  for (const [key, area] of Object.entries(landing.areas)) {
    assert.equal(area.searchResult.limit, 6);
    assert.equal(area.searchResult.start, 0);
    assert.equal(area.searchResult.results[0].category, key);
  }
  const mapping = state.calls.find(call => call.url.pathname.endsWith('/rest/api/content/search'));
  assert.equal(mapping.url.searchParams.get('limit'), '8');
  assert.match(mapping.url.searchParams.get('cql'), /AND id IN \(400, 401, 402, 403, 404, 405, 406, 407\)$/);
  for (const call of queries) {
    const cql = call.url.searchParams.get('cql');
    assert.match(cql, /^type = page AND ancestor = 123 AND space = "WCS"/);
    assert.deepEqual(new Set(cql.match(/id NOT IN \(([^)]+)\)/)[1].split(', ')), new Set(['123', '789', '503', '600', '400', '401', '402', '403', '404', '405', '406', '407', '501', '502', '504', '505']));
    assert.match(cql, /ancestor NOT IN \(600\)/);
    assert.equal(cql.includes('label'), false); assert.equal(cql.includes('999'), false);
    assert.equal(call.url.searchParams.get('expand').includes('body.storage'), true, 'Card queries include published cover/author/excerpt metadata');
  }
  assert.equal(state.calls.some(call => /attachment|download/.test(call.url.pathname)), false);
});

test('landing keeps unknown totals unknown and isolates unavailable area or recent queries', async () => {
  const { adapter } = landingServer({ reply: url => {
    if (url.pathname.endsWith('/rest/api/search')) {
      const cql = url.searchParams.get('cql');
      if (cql.includes('(id = 400 OR ancestor = 400)')) return response({ results: [treeHit('800400', ['123', '400'])] });
      if (cql.includes('(id = 401 OR ancestor = 401)')) return response({}, 403);
      if (url.searchParams.get('limit') === '3') return response({}, 503);
    }
  } });
  const result = await adapter.loadLanding();
  assert.equal(result.areas['area-0'].total, null);
  assert.equal(result.areas['area-0'].error, undefined);
  assert.equal(result.areas['area-1'].total, null);
  assert.equal(result.areas['area-1'].error.code, 'HTTP_ERROR');
  assert.equal(result.areas['area-7'].total, 17);
  assert.deepEqual(result.recent, []); assert.equal(result.recentError.code, 'HTTP_ERROR');
});

test('landing exposes missing and invalid area mappings instead of falling back to labels or inventing zeros', async () => {
  const { adapter, state } = landingServer({ areaPageIds: { loans: 'REPLACE_WITH_ID', duplicate: '400', another: '400', root: '123', valid: '407' } });
  const result = await adapter.loadLanding({ areaIds: ['loans', 'missing', 'duplicate', 'another', 'root', 'valid'] });
  for (const key of ['loans', 'missing', 'duplicate', 'another', 'root']) {
    assert.equal(result.areas[key].total, null); assert.equal(result.areas[key].error.code, 'CONFIGURATION');
    assert.match(result.areas[key].error.message, new RegExp('areaPageIds\\.' + key));
  }
  assert.equal(result.areas.valid.total, 17);
  assert.equal(state.calls.filter(call => call.url.pathname.endsWith('/rest/api/search')).length, 2);
  assert.equal(state.calls.some(call => /REPLACE_WITH|missing|wcs-area/.test(call.url.href)), false);
});

test('landing isolates invalid mapped areas and never displays returned documents outside its root and space', async () => {
  for (const bad of [{ id: '400', type: 'page', space: { key: 'OTHER' }, ancestors: [{ id: '123' }] }, { id: '400', type: 'page', space: { key: 'WCS' }, ancestors: [{ id: '999' }] }]) {
    const { adapter } = landingServer({ areaReply: id => id === '400' ? bad : null });
    const result = await adapter.loadLanding();
    assert.equal(result.areas['area-0'].error.code, 'INVALID_SCOPE');
    assert.equal(result.areas['area-1'].total, 11);
    assert.equal(result.recent.length, 3);
  }
  for (const hit of [treeHit('999', []), treeHit('400'), treeHit('501'), treeHit('789')]) {
    const { adapter } = landingServer({ reply: url => url.pathname.endsWith('/rest/api/search') && url.searchParams.get('limit') === '3' ? response({ results: [hit] }) : undefined });
    const result = await adapter.loadLanding();
    assert.equal(result.recentError.code, 'INVALID_SCOPE');
    assert.deepEqual(result.recent, []);
    assert.equal(result.areas['area-0'].total, 10);
  }
});

test('landing returns plain text and safe native URLs and does not require metadata labels', async () => {
  const hit = treeHit('801', ['123', '400', '777'], { title: 'Guide &amp; checklist', version: { when: '2026-10-16T12:00:00Z', number: 3 } });
  hit.excerpt = '<script>bad()</script><b>Read</b> &amp; apply'; hit.url = 'https://other.example/private';
  const { adapter } = landingServer({ reply: url => url.pathname.endsWith('/rest/api/search') && url.searchParams.get('limit') === '3' ? response({ results: [hit] }) : undefined });
  assert.deepEqual((await adapter.loadLanding()).recent[0], { id: '801', title: 'Guide & checklist', summary: '', updated: '2026-10-16T12:00:00Z', url: 'https://intranet.example/confluence/pages/viewpage.action?pageId=801', category: 'area-0', type: null, tags: [], version: 3 });
});

test('landing excludes only the working branch without removing descendants of interface or asset pages', async () => {
  for (const container of ['600']) {
    for (const limit of ['6', '3']) {
      const { adapter } = landingServer({ reply: url => {
        if (url.pathname.endsWith('/rest/api/search') && url.searchParams.get('limit') === limit) {
          return response({ results: [treeHit('900', ['123', '400', container])], totalSize: 1 });
        }
      } });
      const result = await adapter.loadLanding();
      assert.equal(limit === '3' ? result.recentError.code : result.areas['area-0'].error.code, 'INVALID_SCOPE');
    }
  }
  const { adapter, state } = landingServer({ config: { attachmentPageId: '123' } });
  const result = await adapter.loadLanding();
  assert.equal(result.recent.length, 3);
  assert.equal(result.areas['area-0'].total, 10);
  for (const call of state.calls.filter(call => call.url.pathname.endsWith('/rest/api/search'))) {
    const cql = call.url.searchParams.get('cql');
    const excludedAncestors = cql.match(/ancestor NOT IN \(([^)]+)\)/)[1].split(', ');
    assert.equal(excludedAncestors.includes('123'), false, 'the library root may also host assets');
    assert.equal(excludedAncestors.some(id => /^40[0-7]$/.test(id)), false, 'business-area descendants remain discoverable');
  }
});

test('business-area mappings cannot reuse or sit below reserved administrative containers', async () => {
  const { adapter, state } = landingServer({ areaPageIds: { assets: '789', policy: '503', workspace: '501', valid: '407' } });
  const result = await adapter.loadLanding();
  for (const key of ['assets', 'policy', 'workspace']) {
    assert.equal(result.areas[key].total, null);
    assert.equal(result.areas[key].error.code, 'CONFIGURATION');
  }
  assert.equal(result.areas.valid.total, 17);
  assert.equal(state.calls.filter(call => call.url.searchParams.get('expand') === 'space,ancestors').length, 1);
  const misplaced = landingServer({ areaReply: id => id === '400' ? { id: '400', type: 'page', space: { key: 'WCS' }, ancestors: [{ id: '123' }, { id: '600' }] } : null });
  assert.equal((await misplaced.adapter.loadLanding()).areas['area-0'].error.code, 'INVALID_SCOPE');
});

test('landing cancellation propagates to requests and does not launch remaining queued area work', async () => {
  const controller = new AbortController();
  const { adapter, state } = landingServer({ wait: async (url, init) => {
    if (url.pathname.endsWith('/content/123')) return;
    assert.ok(init.signal && !init.signal.aborted);
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true });
    });
  } });
  const pending = adapter.loadLanding({ signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(state.calls.length, 2, 'only root and recent start before the lower-priority area requests');
  const alreadyCancelled = landingServer();
  await assert.rejects(alreadyCancelled.adapter.loadLanding({ signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(alreadyCancelled.state.calls.length, 0);
});

test('landing cancellation releases its wait immediately while another search shares the root lookup', async () => {
  let release;
  const rootWait = new Promise(resolve => { release = resolve; });
  const { adapter, state } = server({ rootWait });
  const controller = new AbortController();
  const pending = adapter.loadLanding({ signal: controller.signal });
  const active = adapter.searchPages({ scope: 'tree' });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  release(); await active;
  assert.equal(state.calls.filter(call => call.url.includes('/content/123?')).length, 1);
  assert.equal(state.calls.filter(call => call.url.includes('/rest/api/search?')).length, 1);
});

test('tree searches consistently exclude interface code pages while retaining every nested document branch', async () => {
  const { adapter, state } = landingServer();
  const result = await adapter.searchPages({ scope: 'tree', query: 'guidance' });
  const ids = result.cql.match(/id NOT IN \(([^)]+)\)/)[1].split(', ');
  for (const id of ['123', '789', '503', '501', '502', '504', '505', '600', '400', '407']) assert.ok(ids.includes(id));
  assert.match(result.cql, /ancestor NOT IN \(600\)/);
  assert.equal(result.cql.includes('macro'), false, 'legitimate documents may contain HTML macros');
  assert.equal(result.cql.includes('label'), false, 'unlabelled documents remain eligible');
  assert.equal(state.calls.length, 2, 'one verified scope and one indexed query, no document body reads');
  for (const ancestor of ['789', '503', '501', '502', '504', '505']) {
    const configured = landingServer({ reply: url => url.pathname.endsWith('/search') && url.searchParams.get('limit') !== '1' ? response({ results: [treeHit('900', ['123', '400', ancestor])], totalSize: 1 }) : undefined });
    assert.deepEqual((await configured.adapter.searchPages({ scope: 'tree' })).results.map(hit => hit.id), ['900']);
    assert.deepEqual((await configured.adapter.loadLanding()).recent.map(hit => hit.id), ['900']);
  }
});

test('configured custom code pages exclude IDs and only explicitly selected branches', async () => {
  const { adapter, state } = server({ config: {
    pages: { header: '/confluence/pages/viewpage.action?pageId=501#/header', external: 'https://other.example/confluence/pages/viewpage.action?pageId=999' },
    search: { excludePageIds: ['700', 701, '700'], excludeAncestorIds: ['800'] }
  } });
  const result = await adapter.searchPages({ scope: 'tree' });
  assert.match(result.cql, /id NOT IN \(123, 501, 700, 701, 800\)/);
  assert.match(result.cql, /ancestor NOT IN \(800\)/);
  assert.equal(result.cql.includes('999'), false);
  for (const hit of [treeHit('123', []), treeHit('501'), treeHit('700'), treeHit('800'), treeHit('900', ['123', '800'])]) {
    state.searchResponse = { results: [hit] };
    await adapter.loadAccess();
    await assert.rejects(adapter.searchPages({ scope: 'tree' }), error => error.code === 'INVALID_SCOPE');
  }
  const hundred = server({ config: { search: { excludePageIds: Array.from({ length: 100 }, (_, i) => String(1000 + i)) } } });
  assert.match((await hundred.adapter.searchPages({ scope: 'tree' })).cql, /1099/);
});

test('invalid exclusion IDs and unsafe branch scope fail before any network I/O', async () => {
  for (const search of [false, { timeoutMs: 0 }, { timeoutMs: 999 }, { timeoutMs: 30001 }, { timeoutMs: '12000' }, { excludePageIds: '700' }, { excludePageIds: ['0'] }, { excludePageIds: ['1 OR 1=1'] }, { excludeAncestorIds: [{}] }, { excludePageIds: Array(101).fill('700') }]) {
    assert.throws(() => server({ config: { search } }), error => error.code === 'CONFIGURATION');
  }
  for (const config of [
    { search: { excludeAncestorIds: ['123'] } },
    { nativePublication: { areaPageIds: { loans: '400' } }, search: { excludeAncestorIds: ['400'] } },
    { nativePublication: { workingRootPageId: '123' } },
    { nativePublication: { areaPageIds: { loans: '400' }, workingRootPageId: '400' } },
    { nativePublication: { workingRootPageId: 'bad-id' } }
  ]) {
    const { adapter, state } = server({ config });
    await assert.rejects(adapter.searchPages({ scope: 'tree' }), error => error.code === 'CONFIGURATION');
    await assert.rejects(adapter.loadLanding(), error => error.code === 'CONFIGURATION');
    assert.equal(state.calls.length, 0);
  }
});

test('autocomplete and counts avoid excerpts and unrelated metadata expansions', async () => {
  const { adapter, state } = server({ searchResponse: { results: [treeHit('401')] } });
  state.searchResponse.results[0].excerpt = 'This excerpt should not be requested or shown';
  const small = await adapter.searchPages({ scope: 'tree', query: 'loan', limit: 5, excerpt: false });
  let request = new URL(state.calls.at(-1).url);
  assert.equal(request.searchParams.get('expand'), 'content.space,content.ancestors');
  assert.equal(request.searchParams.get('excerpt'), 'none');
  assert.equal(small.results[0].summary, '');
  await adapter.searchPages({ scope: 'tree', query: 'loan' });
  request = new URL(state.calls.at(-1).url);
  assert.equal(request.searchParams.get('excerpt'), 'indexed');
  assert.equal(request.searchParams.get('expand').includes('body.storage'), true, 'Full result cards include published metadata; autocomplete above remains lean');
  const landing = landingServer(); await landing.adapter.loadLanding();
  for (const call of landing.state.calls.filter(call => call.url.searchParams.get('limit') === '6')) {
    assert.equal(call.url.searchParams.get('excerpt'), 'indexed');
    assert.equal(call.url.searchParams.get('expand'), 'content.version,content.space,content.ancestors,content.metadata.labels,content.body.storage');
  }
});

test('a stalled root lookup times out, aborts its read, and can be retried without late cache corruption', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseOld, oldSignal, reads = 0;
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', search: { timeoutMs: 1000 } }, { location, search: Search, fetch: async (input, init) => {
    if (new URL(input).pathname.endsWith('/content/123')) {
      reads++;
      if (reads === 1) { oldSignal = init.signal; await new Promise(resolve => { releaseOld = resolve; }); return response({ id: '123', type: 'page', space: { key: 'OLD_SPACE' } }); }
      return response({ id: '123', type: 'page', space: { key: 'WCS' } });
    }
    return response({ results: [] });
  } });
  const pending = adapter.searchPages({ scope: 'tree' });
  const rejected = assert.rejects(pending, error => error.code === 'SEARCH_TIMEOUT' && error.name !== 'AbortError');
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(1000); await rejected;
  assert.equal(oldSignal.aborted, true);
  const retried = await adapter.searchPages({ scope: 'tree' });
  assert.match(retried.cql, /space = "WCS"/); assert.equal(reads, 2);
  releaseOld(); await new Promise(resolve => setImmediate(resolve));
  assert.match((await adapter.searchPages({ scope: 'tree' })).cql, /space = "WCS"/);
  assert.equal(reads, 2, 'late failed lookup does not clear the fresh verified scope');
});

test('search deadline covers fetch and response body even if either ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stage of ['fetch', 'body']) {
    let release, signal;
    const adapter = C.create({ mode: 'confluence', rootPageId: '123', search: { timeoutMs: 1000 } }, { location, search: Search, fetch: async (input, init) => {
      if (new URL(input).pathname.endsWith('/content/123')) return response({ id: '123', type: 'page', space: { key: 'WCS' } });
      signal = init.signal;
      if (stage === 'fetch') { await new Promise(resolve => { release = resolve; }); return response({ results: [] }); }
      return { ok: true, status: 200, text: () => new Promise(resolve => { release = () => resolve(JSON.stringify({ results: [treeHit('400')] })); }) };
    } });
    const pending = adapter.searchPages({ scope: 'tree' });
    const rejected = assert.rejects(pending, error => error.code === 'SEARCH_TIMEOUT');
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(1000); await rejected;
    assert.equal(signal.aborted, true);
    release(); await new Promise(resolve => setImmediate(resolve));
  }
});

test('one search deadline bounds the combined root-space and result reads', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', search: { timeoutMs: 1000 } }, { location, search: Search, fetch: async input => {
    await new Promise(resolve => setTimeout(resolve, 600));
    return response(new URL(input).pathname.endsWith('/content/123') ? { id: '123', type: 'page', space: { key: 'WCS' } } : { results: [] });
  } });
  const pending = adapter.searchPages({ scope: 'tree' });
  const rejected = assert.rejects(pending, error => error.code === 'SEARCH_TIMEOUT');
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(600); await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(400); await rejected;
  t.mock.timers.tick(200); await new Promise(resolve => setImmediate(resolve));
});

test('caller cancellation settles immediately when search fetch ignores abort and remains distinct from timeout', async () => {
  const controller = new AbortController(); let signal;
  const adapter = C.create({ mode: 'confluence', rootPageId: '123' }, { location, search: Search, fetch: async (input, init) => {
    if (new URL(input).pathname.endsWith('/content/123')) return response({ id: '123', type: 'page', space: { key: 'WCS' } });
    signal = init.signal;
    return new Promise(() => {});
  } });
  const pending = adapter.searchPages({ scope: 'tree', signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === 'AbortError' && error.code !== 'SEARCH_TIMEOUT');
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); await rejected;
  assert.equal(signal.aborted, false, 'route handoff has a bounded grace period');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(signal.aborted, true);
});

test('landing supports maximum custom exclusions alongside automatically excluded interface and area pages', async () => {
  const excludePageIds = Array.from({ length: 100 }, (_, index) => String(2000 + index));
  const excludeAncestorIds = Array.from({ length: 100 }, (_, index) => String(3000 + index));
  const { adapter, state } = landingServer({ config: { search: { excludePageIds, excludeAncestorIds } } });
  const result = await adapter.loadLanding();
  assert.equal(result.recentError, undefined);
  assert.deepEqual(result.recent.map(item => item.id), ['800', '801', '802']);
  assert.deepEqual(Object.values(result.areas).map(area => area.total), [10, 11, 12, 13, 14, 15, 16, 17]);
  assert.ok(Object.values(result.areas).every(area => !area.error));
  const calls = state.calls.filter(call => call.url.pathname.endsWith('/rest/api/search'));
  assert.equal(calls.length, 9);
  for (const { url } of calls) {
    const cql = url.searchParams.get('cql');
    const excluded = cql.match(/id NOT IN \(([^)]+)\)/)[1].split(', ');
    for (const id of ['123', '789', '400', '407', '2000', '2099', '3000', '3099']) assert.ok(excluded.includes(id));
    const trees = cql.match(/ancestor NOT IN \(([^)]+)\)/)[1].split(', ');
    assert.equal(trees.length, 101);
    assert.ok(trees.includes('600'));
  }
});

test('known unconfigured working-root placeholders permit native reading without weakening native publication validation', async () => {
  for (const workingRootPageId of ['', 'REPLACE_WITH_WORKING_ROOT_PAGE_ID', 'REPLACE_WITH_RESTRICTED_WORKING_ROOT_PAGE_ID']) {
    const { adapter, state } = landingServer({ config: { nativePublication: { enabled: true, publishedRootPageId: '123', workingRootPageId, areaPageIds: { loans: '400' } } } });
    const search = await adapter.searchPages({ scope: 'tree', query: 'loan' });
    assert.equal(search.results.length, 3);
    assert.equal(search.cql.includes('REPLACE'), false);
    assert.equal(search.cql.includes('ancestor NOT IN'), false);
    const landing = await adapter.loadLanding();
    assert.equal(landing.recent.length, 3);
    assert.equal(landing.areas.loans.total, 10);
    assert.equal(state.calls.some(call => call.url.href.includes('REPLACE')), false);
    const publication = publicationServer({ config: { nativePublication: { ...publicationConfig(), workingRootPageId } } });
    await publication.adapter.load();
    await assert.rejects(publication.adapter.submitAction(nativeCreate()), error => error.code === 'CONFIGURATION');
    assert.equal(publication.state.calls.some(call => call.init.method === 'POST'), false);
  }
});

test('Data Center entity results and totalCount preserve unlabelled nested child documents', async () => {
  const hit = treeHit('402', ['123', '400', '401']);
  const { adapter, state } = server({ config: { nativePublication: { areaPageIds: { loans: '400' } } }, searchResponse: { results: [{ entity: hit.content, entityType: 'page', title: hit.title, excerpt: 'Helpful guidance.' }], totalCount: 17 } });
  const result = await adapter.searchPages({ scope: 'tree', area: 'loans', limit: 6 });
  assert.equal(result.total, 17);
  assert.equal(result.results[0].id, '402');
  assert.equal(result.results[0].category, 'loans');
  assert.equal(result.results[0].summary, 'Helpful guidance.');
  assert.equal(state.calls.length, 2);
});

function compatibilityServer(options = {}) {
  const calls = [];
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', spaceKey: 'WCS', search: { transport: 'search' }, nativePublication: { areaPageIds: { loans: '400' }, ...options.nativePublication } }, {
    location, search: Search, fetch: async input => {
      const url = new URL(input); calls.push(url);
      if (url.pathname.endsWith('/content/123')) return response({ id: '123', type: 'page', space: { key: 'WCS' } });
      if (url.pathname.endsWith('/rest/api/search')) return response(options.indexed || { results: [{ entity: { id: '402', type: 'page', title: 'A nested document' }, entityType: 'page' }], totalCount: 10 });
      if (url.pathname.endsWith('/rest/api/content/search')) return response(options.content || { results: [treeHit('402', ['123', '400', '401']).content], size: 1, _links: { next: '/rest/api/content/search?start=6&cql=space=OTHER' } });
      throw new Error('Unexpected request ' + url);
    }
  });
  return { adapter, calls };
}

test('missing search expansions retry one bounded identical CQL Content query and remember the compatible transport', async () => {
  const { adapter, calls } = compatibilityServer();
  const options = { scope: 'tree', area: 'loans', query: 'nested', limit: 6 };
  const first = await adapter.searchPages(options);
  assert.equal(first.results[0].id, '402');
  assert.equal(first.total, 10, 'retain the equivalent indexed total rather than the size of the current page');
  assert.equal(calls.length, 3);
  const indexed = calls[1], expanded = calls[2];
  assert.equal(expanded.pathname, '/confluence/rest/api/content/search');
  assert.equal(expanded.searchParams.get('cql'), indexed.searchParams.get('cql'));
  assert.equal(expanded.searchParams.get('limit'), '6');
  assert.equal(expanded.searchParams.get('expand'), 'version,space,ancestors,metadata.labels,body.storage');
  assert.equal(expanded.searchParams.has('excerpt'), false);
  assert.equal(first.nextContinuation.transport, 'content');
  const following = await adapter.searchPages({ ...options, continuation: first.nextContinuation });
  assert.equal(calls.at(-1).pathname, '/confluence/rest/api/content/search');
  assert.equal(calls.at(-1).searchParams.get('start'), '6');
  assert.equal(calls.at(-1).searchParams.get('cql'), first.cql);
  assert.equal(following.total, null, 'Content page size is not the total');
  await adapter.searchPages({ scope: 'tree', area: 'loans', query: 'different', limit: 6 });
  assert.equal(calls.length, 5, 'later first-page searches need only one compatible request');
  assert.equal(calls.at(-1).pathname, '/confluence/rest/api/content/search');
});

test('missing Insights area labels use one identical bounded metadata retry and remain a visible error if unavailable', async () => {
  const indexed = { results: [treeHit('601', ['123', '600'])] };
  const content = { results: [treeHit('601', ['123', '600'], { metadata: { labels: { results: [{ name: 'wcs-area-loans' }] } } }).content], _links: {} };
  const { adapter, calls } = compatibilityServer({ nativePublication: { insightsPageId: '600' }, indexed, content });
  const result = await adapter.searchPages({ scope: 'tree', area: 'loans', excerpt: false, limit: 6 });
  assert.equal(result.results[0].id, '601');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].searchParams.get('cql'), calls[1].searchParams.get('cql'));
  assert.equal(calls[2].searchParams.get('expand'), 'space,ancestors,metadata.labels');
  assert.equal(calls[2].searchParams.get('limit'), '6');
  assert.ok(calls.every(url => !url.pathname.endsWith('/content/601')));
  const unavailable = compatibilityServer({ nativePublication: { insightsPageId: '600' }, indexed, content: { results: [treeHit('601', ['123', '600']).content] } });
  await assert.rejects(unavailable.adapter.searchPages({ scope: 'tree', area: 'loans' }), error => error.code === 'INVALID_SCOPE' && /labels/.test(error.message));
  assert.equal(unavailable.calls.length, 3);
});

test('incomplete metadata never overrides an explicit conflicting result or permits broad fallback', async () => {
  for (const content of [
    { id: '402', type: 'page', space: { key: 'OTHER' } },
    { id: '402', type: 'page', ancestors: [{ id: '999' }] },
    { id: '402', type: 'page', ancestors: [{ id: '123' }, { id: '405' }] },
    { id: '402', type: 'attachment' }
  ]) {
    const { adapter, calls } = compatibilityServer({ indexed: { results: [{ entity: { id: '403', type: 'page' } }, { entity: content }] } });
    await assert.rejects(adapter.searchPages({ scope: 'tree', area: 'loans', limit: 6 }), error => error.code === 'INVALID_SCOPE');
    assert.equal(calls.length, 2, 'contradictory results do not trigger a compatibility retry');
  }
  const invalid = compatibilityServer({ content: { results: [treeHit('402', ['999', '400']).content] } });
  await assert.rejects(invalid.adapter.searchPages({ scope: 'tree', area: 'loans' }), error => error.code === 'INVALID_SCOPE');
  assert.equal(invalid.calls.length, 3);
});

test('missing metadata and absent totals remain unknown without a per-hit crawl', async () => {
  const { adapter, calls } = compatibilityServer({ indexed: { results: [{ entity: {} }] }, content: { results: [treeHit('402').content], size: 1, _links: {} } });
  const result = await adapter.searchPages({ scope: 'tree', limit: 6 });
  assert.equal(result.total, null);
  assert.equal(result.nextContinuation, null);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(url => !url.pathname.endsWith('/content/402')));
});

test('landing publishes recent documents while area verification is pending and sends immutable progress snapshots', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const updates = [];
  const { adapter } = landingServer({ wait: url => url.pathname.endsWith('/rest/api/content/search') ? pending : undefined });
  const loading = adapter.loadLanding({ onUpdate: update => updates.push(update) });
  await new Promise(resolve => setImmediate(resolve));
  const partial = updates.find(update => update.recentReady);
  assert.ok(partial);
  assert.equal(partial.complete, false);
  assert.equal(partial.recent.length, 3);
  assert.deepEqual(partial.areas, {});
  release();
  const result = await loading;
  assert.equal(result.complete, true);
  assert.equal(Object.keys(result.areas).length, 8);
  assert.deepEqual(partial.areas, {}, 'later area writes do not mutate earlier snapshots');
  assert.equal(updates.at(-1).complete, true);
});

test('one missing mapped area does not discard recent documents or other areas', async () => {
  const { adapter, state } = landingServer({ reply: url => url.pathname.endsWith('/rest/api/content/search') ? response({ results: Array.from({ length: 7 }, (_, index) => ({ id: String(401 + index), type: 'page', space: { key: 'WCS' }, ancestors: [{ id: '123' }] })) }) : undefined });
  const result = await adapter.loadLanding();
  assert.equal(result.recent.length, 3);
  assert.equal(result.areas['area-0'].error.code, 'MAPPING_UNAVAILABLE');
  assert.equal(result.areas['area-1'].total, 11);
  assert.equal(state.calls.some(call => (call.url.searchParams.get('cql') || '').includes('(id = 400 OR ancestor = 400)')), false);
});

test('discovery bootstrap skips workspace, policy and per-document write checks, then full load restores authorized capabilities', async () => {
  const { adapter, state } = server({ config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow', allowAttachmentWrites: true } });
  const browsing = await adapter.load({ discoveryOnly: true });
  assert.equal(browsing.discoveryOnly, true);
  assert.equal(browsing.actorId, 'b');
  assert.equal(browsing.workspaceLoaded, false);
  assert.equal(browsing.canSubmit, false);
  assert.equal(browsing.canWriteAttachment, false);
  assert.equal(browsing.entitlementPolicy, null);
  assert.deepEqual(browsing.documentPermissions, {});
  assert.ok(Object.values(browsing.effectivePermissions).every(value => value === false));
  assert.equal(state.calls.length, 5);
  assert.equal(state.calls.some(call => /\/workspace|entitlements\.json|operations%2Cversion/.test(call.url)), false);
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'READ_ONLY');
  assert.equal(state.calls.length, 5, 'read-only browsing is never promoted into workflow authorization');
  const hydrated = await adapter.load();
  assert.equal(hydrated.discoveryOnly, false);
  assert.equal(hydrated.workspaceLoaded, true);
  assert.equal(hydrated.canSubmit, true);
  assert.ok(hydrated.entitlementPolicy);
  assert.ok(hydrated.documentPermissions.aide);
});

test('load cancellation reaches bootstrap reads and an abandoned full load cannot replace the current read-only session', async () => {
  const base = server({ config: { workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' } });
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const workspaceStarted = new Promise(resolve => { started = resolve; });
  let holdWorkspace = true;
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', workspaceEndpoint: '/confluence/rest/wcspedia/workspace', workflowEndpoint: '/confluence/rest/wcspedia/workflow' }, {
    location, search: Search, fetch: async (url, init) => {
      if (holdWorkspace && url.includes('/rest/wcspedia/workspace')) { started(init.signal); await waiting; }
      return base.fetch(url, init);
    }
  });
  const controller = new AbortController();
  const oldLoad = adapter.load({ signal: controller.signal });
  const signal = await workspaceStarted;
  assert.equal(signal.aborted, false);
  const cancelled = assert.rejects(oldLoad, error => error.name === 'AbortError');
  controller.abort();
  assert.equal(signal.aborted, true);
  const current = await adapter.load({ discoveryOnly: true });
  assert.equal(current.discoveryOnly, true);
  release();
  await cancelled;
  await assert.rejects(adapter.submitAction(command()), error => error.code === 'READ_ONLY');
  holdWorkspace = false;
  const hydrated = await adapter.load();
  assert.equal(hydrated.canSubmit, true);
  const count = base.state.calls.length;
  await assert.rejects(adapter.load({ discoveryOnly: true, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(base.state.calls.length, count);
});

// These tests exercise the production default; older fixtures above explicitly
// select the legacy Search transport to retain compatibility coverage.
function fastSearchServer(options = {}) {
  const base = server(options);
  let contentReads = 0;
  const fetch = async (input, init) => {
    if (new URL(input).pathname.endsWith('/rest/api/content/search')) {
      base.state.calls.push({ url: input, init });
      contentReads++;
      if (options.contentRead) return options.contentRead(input, init, contentReads);
      return response({ results: [treeHit('402', ['123', '400']).content], _links: {} });
    }
    return base.fetch(input, init);
  };
  const adapter = C.create({ mode: 'confluence', rootPageId: '123', spaceKey: 'WCS', nativePublication: { areaPageIds: { loans: '400' } }, ...options.config }, { fetch, location, search: Search });
  return { adapter, state: base.state, reads: () => contentReads };
}

test('default discovery uses one Content Search request after one shared root verification', async () => {
  const f = fastSearchServer();
  const result = await f.adapter.searchPages({ scope: 'tree', area: 'loans', query: 'handover', limit: 6 });
  assert.equal(f.state.calls.length, 2);
  assert.equal(f.reads(), 1);
  const request = new URL(f.state.calls[1].url);
  assert.equal(request.pathname, '/confluence/rest/api/content/search');
  assert.match(request.searchParams.get('cql'), /ancestor = 123 AND space = "WCS" AND \(id = 400 OR ancestor = 400\)/);
  assert.equal(request.searchParams.get('expand'), 'version,space,ancestors,metadata.labels,body.storage');
  assert.equal(request.searchParams.has('excerpt'), false);
  assert.equal(request.searchParams.get('expand').includes('body.storage'), true, 'Full result cards include published metadata; autocomplete above remains lean');
  assert.equal(result.total, null);
  assert.deepEqual(result.results.map(item => item.id), ['402']);
  for (const transport of ['unknown', false, {}, 1]) assert.throws(() => fastSearchServer({ config: { search: { transport } } }), { code: 'CONFIGURATION' });
});

test('identical native reads coalesce and one consumer cancellation does not abort another', async () => {
  let release, signal;
  const f = fastSearchServer({ contentRead: async (_url, init) => { signal = init.signal; await new Promise(resolve => { release = resolve; }); return response({ results: [treeHit('402').content], _links: {} }); } });
  const firstController = new AbortController(), secondController = new AbortController();
  const options = { scope: 'tree', query: 'loan', limit: 6 };
  const first = f.adapter.searchPages({ ...options, signal: firstController.signal });
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = f.adapter.searchPages({ ...options, signal: secondController.signal });
  await new Promise(resolve => setImmediate(resolve));
  firstController.abort(); await rejected;
  assert.equal(signal.aborted, false);
  release();
  assert.equal((await second).results[0].id, '402');
  assert.equal(f.reads(), 1);
  const cached = await f.adapter.searchPages(options);
  cached.results[0].title = 'Caller mutation';
  assert.notEqual((await f.adapter.searchPages(options)).results[0].title, 'Caller mutation');
  assert.equal(f.reads(), 1);
});

test('a new route adopts an identical abandoned request during the short handoff grace', async () => {
  let release, signal;
  const f = fastSearchServer({ contentRead: async (_url, init) => { signal = init.signal; await new Promise(resolve => { release = resolve; }); return response({ results: [treeHit('402', ['123', '400']).content], _links: {} }); } });
  const controller = new AbortController(), options = { scope: 'tree', area: 'loans', limit: 6 };
  const old = f.adapter.searchPages({ ...options, signal: controller.signal });
  const rejected = assert.rejects(old, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); await rejected;
  const adopted = f.adapter.searchPages(options);
  assert.equal(signal.aborted, false);
  release(); await adopted;
  assert.equal(f.reads(), 1);
});

test('orphaned and cancelled responses never populate the native result cache', async () => {
  for (const delay of [0, 65]) {
    let release, signal;
    const f = fastSearchServer({ contentRead: async (_url, init, count) => {
      if (count === 1) { signal = init.signal; await new Promise(resolve => { release = resolve; }); }
      return response({ results: [treeHit('402').content], _links: {} });
    } });
    const controller = new AbortController(), options = { scope: 'tree', limit: 6 };
    const pending = f.adapter.searchPages({ ...options, signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await new Promise(resolve => setImmediate(resolve)); controller.abort(); await rejected;
    if (delay) { await new Promise(resolve => setTimeout(resolve, delay)); assert.equal(signal.aborted, true); }
    release(); await new Promise(resolve => setImmediate(resolve));
    await f.adapter.searchPages(options);
    assert.equal(f.reads(), 2, 'an unobserved response must be fetched again');
  }
});

test('native result cache expires at two minutes, retains at most 24 queries, and separates render/filter keys', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const f = fastSearchServer(), options = { scope: 'tree', query: 'loan', limit: 6 };
  await f.adapter.searchPages(options); await f.adapter.searchPages({ limit: 6, query: 'loan', scope: 'tree', start: 0, excerpt: true });
  assert.equal(f.reads(), 1, 'normalized defaults share a cache key');
  now += 119999; await f.adapter.searchPages(options); assert.equal(f.reads(), 1);
  now += 1; await f.adapter.searchPages(options); assert.equal(f.reads(), 2);
  for (const change of [{ excerpt: false }, { limit: 4 }, { area: 'loans' }, { tag: 'credit' }, { year: '2026' }, { sort: 'title' }, { start: 6 }]) await f.adapter.searchPages({ ...options, ...change });
  assert.equal(f.reads(), 9);
  await assert.rejects(f.adapter.searchPages({ ...options, year: NaN }), /four-digit/);
  assert.equal(f.reads(), 9, 'invalid filters cannot hit a valid cache entry');
  for (let i = 0; i < 25; i++) await f.adapter.searchPages({ scope: 'tree', query: 'query' + i });
  const before = f.reads();
  await f.adapter.searchPages({ scope: 'tree', query: 'query24' }); assert.equal(f.reads(), before);
  await f.adapter.searchPages({ scope: 'tree', query: 'query0' }); assert.equal(f.reads(), before + 1);
});

test('session and permission refreshes invalidate native results and abandon earlier subscribers', async () => {
  const f = fastSearchServer(), options = { scope: 'tree', query: 'loan' };
  await f.adapter.searchPages(options); await f.adapter.loadAccess(); await f.adapter.searchPages(options);
  assert.equal(f.reads(), 2);
  await f.adapter.load(); await f.adapter.searchPages(options); assert.equal(f.reads(), 3);
  let release;
  const held = fastSearchServer({ contentRead: async () => { await new Promise(resolve => { release = resolve; }); return response({ results: [], _links: {} }); } });
  const pending = held.adapter.searchPages(options), rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  await held.adapter.load(); await rejected;
  release(); await new Promise(resolve => setImmediate(resolve));
});

test('unknown workflow outcomes invalidate native cached pages before the write', async () => {
  const { adapter, state } = server({ workflowNetworkError: true, config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
  await adapter.load(); await adapter.searchPages({ scope: 'tree' });
  await assert.rejects(adapter.submitAction(command()), { code: 'UNKNOWN_COMMIT' });
  await adapter.searchPages({ scope: 'tree' });
  assert.equal(state.calls.filter(call => new URL(call.url).pathname.endsWith('/rest/api/search')).length, 2);
});

test('generated discovery catalog loads identity and verified root together without attachments or write authority', async () => {
  const prior = global.WCSDiscoveryCatalog;
  global.WCSDiscoveryCatalog = { schemaVersion: 1, isDemo: false, people: [], areas: [{ id: 'loans', title: 'Loan Management' }], types: ['Job aid', 'Blog'], documents: [], taxonomyRevision: 1, taxonomyAudit: [] };
  try {
    let release;
    const rootWait = new Promise(resolve => { release = resolve; });
    const f = fastSearchServer({ rootWait, config: { workflowEndpoint: '/confluence/rest/wcspedia/workflow', workspaceEndpoint: '/confluence/rest/wcspedia/workspace' } });
    const pending = f.adapter.load({ discoveryOnly: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.state.calls.length, 2);
    assert.ok(f.state.calls.some(call => call.url.includes('/user/current')));
    assert.ok(f.state.calls.some(call => call.url.includes('/content/123?expand=space')));
    release(); const session = await pending;
    assert.equal(session.discoveryOnly, true); assert.equal(session.attachmentVersion, null); assert.equal(session.attachmentId, null);
    assert.equal(session.actor.role, 'Reader'); assert.equal(session.identityMapped, false);
    assert.equal(session.workspaceLoaded, false); assert.equal(session.canSubmit, false); assert.equal(session.canWriteAttachment, false);
    assert.equal(session.entitlementPolicy, null);
    assert.ok(Object.values(session.effectivePermissions).every(value => value === false));
    assert.equal(global.WCSDiscoveryCatalog.people.length, 0, 'bootstrap never mutates bundled catalog');
    await f.adapter.searchPages({ scope: 'tree' });
    assert.equal(f.state.calls.length, 3, 'first search reuses the already verified root');
    await assert.rejects(f.adapter.submitAction(command()), { code: 'READ_ONLY' });
    const managed = await f.adapter.load();
    assert.equal(managed.canSubmit, true);
    assert.ok(f.state.calls.some(call => call.url.includes('/wcspedia-published.json')));
  } finally { if (prior === undefined) delete global.WCSDiscoveryCatalog; else global.WCSDiscoveryCatalog = prior; }
});

test('catalog bootstrap fails closed on bad scope or bundled documents and never falls back to sample content', async () => {
  const prior = global.WCSDiscoveryCatalog;
  const catalog = { schemaVersion: 1, isDemo: false, people: [], areas: [{ id: 'loans', title: 'Loan Management' }], documents: [] };
  try {
    global.WCSDiscoveryCatalog = catalog;
    for (const change of [{ rootStatus: 403 }, { rootPage: { id: '123', type: 'page', space: { key: 'OTHER' } } }]) {
      const f = fastSearchServer(change);
      await assert.rejects(f.adapter.load({ discoveryOnly: true }));
      assert.equal(f.state.calls.some(call => /attachment|download/.test(call.url)), false);
    }
    global.WCSDiscoveryCatalog = { ...fixture(), isDemo: false };
    const f = fastSearchServer();
    await assert.rejects(f.adapter.load({ discoveryOnly: true }), /navigation metadata/);
    assert.equal(f.state.calls.length, 0);
  } finally { if (prior === undefined) delete global.WCSDiscoveryCatalog; else global.WCSDiscoveryCatalog = prior; }
});

test('independent permission refresh leaves same-user Insights discovery running', async () => {
  let release, signal;
  const f = fastSearchServer({ contentRead: async (_url, init) => { signal = init.signal; await new Promise(resolve => { release = resolve; }); return response({ results: [treeHit('402').content], _links: {} }); } });
  await f.adapter.loadAccess();
  const pending = f.adapter.searchPages({ scope: 'tree', types: ['Blog', 'Knowledge sharing'] });
  await new Promise(resolve => setImmediate(resolve));
  await f.adapter.loadAccess();
  assert.equal(signal.aborted, false);
  release();
  assert.equal((await pending).results[0].id, '402');
  assert.equal(f.reads(), 1);
});

test('a changed authenticated identity aborts previous native search subscribers', async () => {
  let release, signal;
  const f = fastSearchServer({ contentRead: async (_url, init) => { signal = init.signal; await new Promise(resolve => { release = resolve; }); return response({ results: [], _links: {} }); } });
  await f.adapter.loadAccess();
  const pending = f.adapter.searchPages({ scope: 'tree' }), rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  f.state.user = { type: 'known', username: 'other', userKey: 'other-user', displayName: 'Other' };
  await f.adapter.loadAccess(); await rejected;
  assert.equal(signal.aborted, true);
  release(); await new Promise(resolve => setImmediate(resolve));
});

test('caller changes after submission cannot alter an in-flight query or poison its cache key', async () => {
  let release;
  const rootWait = new Promise(resolve => { release = resolve; });
  const f = fastSearchServer({ rootWait }), options = { scope: 'tree', query: 'loan', types: ['Blog'] };
  const pending = f.adapter.searchPages(options);
  options.query = 'different'; options.types.push('Training');
  release(); const result = await pending;
  assert.equal(result.cql, Search.buildCQL({ query: 'loan', prefixLastToken: true, types: ['Blog'] }, { rootPageId: '123', spaceKey: 'WCS', excludeIds: ['123', '400'] }));
  assert.match(result.cql, /label IN \("wcs-type-blog"\)/);
  assert.equal(result.cql.includes('different'), false);
  await f.adapter.searchPages({ scope: 'tree', query: 'loan', types: ['Blog'] });
  assert.equal(f.reads(), 1);
});

test('page lifecycle invalidation discards cached results and verified root without another API side effect', async () => {
  const f = fastSearchServer(), options = { scope: 'tree', query: 'loan' };
  await f.adapter.searchPages(options);
  assert.equal(f.state.calls.length, 2);
  f.adapter.invalidateSearch();
  assert.equal(f.state.calls.length, 2, 'pagehide invalidation itself performs no network work');
  assert.equal(f.adapter.info().searchSpaceKey, null);
  await f.adapter.searchPages(options);
  assert.equal(f.state.calls.length, 4);
  assert.equal(f.reads(), 2);
});

test('adapter bounds a stalled fetch and lets a later load recover',async()=>{
 let stalled=true,signal;const adapter=C.create({mode:'local',dataUrl:'./data.json',requestTimeoutMs:15},{location,fetch:async(_url,init)=>{signal=init.signal;return stalled?new Promise(()=>{}):response(fixture());}});
 await assert.rejects(adapter.load(),{code:'TIMEOUT'});assert.equal(signal.aborted,true);
 stalled=false;assert.ok((await adapter.load()).data.documents.length);
});
test('adapter bounds stalled JSON bodies and does not turn an expired session into an indefinite wait',async()=>{
 let stalled=true,signal;const adapter=C.create({mode:'local',dataUrl:'./data.json',requestTimeoutMs:15},{location,fetch:async(_url,init)=>{signal=init.signal;return stalled?{ok:true,status:200,text:()=>new Promise(()=>{})}:response({},401);}});
 await assert.rejects(adapter.load(),{code:'TIMEOUT'});assert.equal(signal.aborted,true);
 stalled=false;await assert.rejects(adapter.load(),error=>error.status===401);
});
test('caller cancellation settles even when fetch ignores AbortSignal',async()=>{
 const controller=new AbortController();const adapter=C.create({mode:'local',dataUrl:'./data.json'},{location,fetch:()=>new Promise(()=>{})});
 const pending=adapter.load({signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
});


test('shortlisted search groups include legacy labels within the same native scope',async()=>{
 for(const type of ['Guide','Training','Report']){
  const {adapter,state}=server({searchResponse:{results:[],totalSize:0}});
  await adapter.searchPages({scope:'tree',type});
  const call=state.calls.find(call=>new URL(call.url).pathname.endsWith('/rest/api/search'));
  const cql=new URL(call.url).searchParams.get('cql');
  assert.ok(cql.includes('ancestor = 123'));assert.ok(cql.includes('space = "WCS"'));
  for(const member of require('./editor-content.js').typeMembers(type))assert.ok(cql.includes('wcs-type-'+member.toLowerCase().replaceAll(' ','-')),member);
 }
});

test('landing idle revalidation rejects anonymous or changed accounts before querying documents',async()=>{
  let user={type:'known',userKey:'first-user',username:'BR47149'};
  const f=landingServer({reply:url=>url.pathname.endsWith('/user/current')?response(user):undefined});
  await f.adapter.loadLanding({revalidateSession:true});
  const queries=()=>f.state.calls.filter(c=>c.url.pathname.endsWith('/search')).length;
  const before=queries();user={type:'anonymous'};
  await assert.rejects(f.adapter.loadLanding({revalidateSession:true}),{code:'AUTH_REQUIRED'});assert.equal(queries(),before);
  user={type:'known',userKey:'second-user',username:'XY12345'};
  await assert.rejects(f.adapter.loadLanding({revalidateSession:true}),{code:'SESSION_CHANGED'});
  await assert.rejects(f.adapter.loadLanding({revalidateSession:true}),{code:'SESSION_CHANGED'},'Retry cannot adopt another account into the old app session');
  assert.equal(queries(),before);
});

test('landing idle revalidation allows the original account to recover after login expires',async()=>{
  let status=200;
  const f=landingServer({reply:url=>url.pathname.endsWith('/user/current')?response({type:'known',userKey:'first-user',username:'BR47149'},status):undefined});
  await f.adapter.loadLanding({revalidateSession:true});status=401;
  await assert.rejects(f.adapter.loadLanding({revalidateSession:true}),e=>e.status===401);
  status=200;assert.equal((await f.adapter.loadLanding({revalidateSession:true})).recent.length,3);
});

test('idle typeahead shares one session check and never presents anonymous empty search as success',async()=>{
  const originalNow=Date.now;let user={type:'known',userKey:'first-user',username:'BR47149'};
  const f=landingServer({reply:url=>url.pathname.endsWith('/user/current')?response(user):undefined});
  await f.adapter.loadLanding({revalidateSession:true});
  const before=f.state.calls.filter(c=>c.url.pathname.endsWith('/user/current')).length;
  try{
    const later=Date.now()+61000;Date.now=()=>later;user={type:'anonymous'};
    const responses=await Promise.allSettled([f.adapter.searchPages({scope:'tree',query:'credit'}),f.adapter.searchPages({scope:'tree',query:'credit approval'})]);
    assert.ok(responses.every(r=>r.status==='rejected'&&r.reason.code==='AUTH_REQUIRED'));
    assert.equal(f.state.calls.filter(c=>c.url.pathname.endsWith('/user/current')).length-before,1);
  }finally{Date.now=originalNow;}
});

function insightBrowseFixture(reply, dependencies={}){
 const calls=[];const fetch=async(input,init)=>{const u=new URL(input);calls.push(u);if(u.pathname.endsWith('/user/current'))return response({type:'known',username:'BR47149',userKey:'one'});if(u.pathname.endsWith('/content/123'))return response({id:'123',type:'page',space:{key:'WCS'}});return reply(u,init);};
 const adapter=C.create({mode:'confluence',rootPageId:'123',spaceKey:'WCS',attachmentPageId:'789',nativePublication:{enabled:true,workingRootPageId:'600',insightsPageId:'700',areaPageIds:{loans:'400'}}},{fetch,location,search:Search,...dependencies});
 return {adapter,calls};
}
function insightPage(id,type='Blog',parent='700'){return {id,type:'page',status:'current',title:'Published '+id,space:{key:'WCS'},ancestors:[{id:'123'},{id:parent}],version:{number:2,when:'2026-10-22T10:00:00Z'},metadata:{labels:{results:[{name:'wcs-type-'+type.toLowerCase()},{name:'wcs-published'}]}}};}
const insightBrowse={scope:'tree',insights:true,nativeChildren:true,types:['Blog','Guide','Training','Report'],limit:9};
test('Insights reads newly published native children without waiting for a CQL index',async()=>{
 const f=insightBrowseFixture(u=>{assert.match(u.pathname,/\/700\/child\/page$/);return response({results:[insightPage('701')],_links:{}});});
 const result=await f.adapter.searchPages(insightBrowse);assert.equal(result.results[0].id,'701');assert.equal(result.results[0].type,'Blog');assert.equal(result.nextContinuation,null);assert.equal(f.calls.some(u=>u.pathname.endsWith('/search')),false);
});
test('Insights child pagination advances past untyped rows and remains scoped',async()=>{
 const f=insightBrowseFixture(u=>{const next=u.searchParams.get('start')==='1';return response({results:[insightPage(next?'702':'701',next?'Blog':'Unknown')],_links:next?{}:{next:'/ignored-by-client'}});});
 const first=await f.adapter.searchPages(insightBrowse);assert.equal(first.results.length,0);assert.equal(first.nextContinuation.start,1);
 const second=await f.adapter.searchPages({...insightBrowse,continuation:first.nextContinuation});assert.equal(second.results[0].id,'702');
 await assert.rejects(f.adapter.searchPages({...insightBrowse,continuation:{...first.nextContinuation,parent:'800'}}),e=>e.code==='INVALID_CONTINUATION');
});
test('Insights rejects a child returned outside its configured parent',async()=>{
 const f=insightBrowseFixture(()=>response({results:[insightPage('701','Blog','400')],_links:{}}));await assert.rejects(f.adapter.searchPages(insightBrowse),e=>e.code==='INVALID_SCOPE');
});
test('Insights filters use only the Insights subtree and child failures have a scoped read fallback',async()=>{
 const f=insightBrowseFixture(u=>{if(u.pathname.endsWith('/child/page'))return response({},500);assert.match(u.searchParams.get('cql'),/ancestor = 700/);assert.match(u.searchParams.get('cql'),/space = "WCS"/);return response({results:[],_links:{}});});
 await f.adapter.searchPages(insightBrowse);await assert.rejects(f.adapter.searchPages({...insightBrowse,nativeChildren:false,query:'new'}),e=>e.status===500);
 assert.equal(f.calls.filter(u=>u.pathname.endsWith('/child/page')).length,2);
});

test('main tree search returns Insights Blogs and business documents together without an area or approval filter',async()=>{
 const config={nativePublication:{insightsPageId:'600',workingRootPageId:'700',areaPageIds:{loans:'400'}}};
 const blog=treeHit('601',['123','600'],{metadata:{labels:{results:[{name:'wcs-type-blog'}]}}});
 const {adapter,state}=server({config,searchResponse:{results:[treeHit('401',['123','400']),blog]}});
 const result=await adapter.searchPages({scope:'tree',query:'article'});
 assert.deepEqual(result.results.map(row=>row.id),['401','601']);assert.equal(result.results[1].type,'Blog');
 assert.match(result.cql,/ancestor = 123 AND space = "WCS"/);
 assert.doesNotMatch(result.cql,/ancestor != 600|ancestor NOT IN \([^)]*600|wcs-area-|wcs-status-published/);
 assert.equal(state.calls.length,2,'One bounded index search after root validation; no per-document reads');
});

test('Insights reader labels produce direct reader links without per-card requests',async()=>{
 const p=insightPage('701');p.metadata.labels.results.push({name:'wcs-reader'});
 const f=insightBrowseFixture(()=>response({results:[p],_links:{}}));
 const r=await f.adapter.searchPages(insightBrowse);
 assert.match(r.results[0].url,/pageId=123#\/published\/701$/);
 assert.equal(f.calls.some(u=>u.pathname.endsWith('/content/701')),false);
});

test('global and Insights collection search include unlabelled nested native articles and keep working trees excluded', async()=>{
 const nested=treeHit('602',['123','600','601'],{title:'Native nested report',metadata:{labels:{results:[]}}});
 const {adapter}=server({config:{attachmentPageId:'789',nativePublication:{insightsPageId:'600',workingRootPageId:'700',areaPageIds:{loans:'400'}}},searchResponse:{results:[nested]}});
 const global=await adapter.searchPages({scope:'tree',query:'report'});
 assert.equal(global.results[0].id,'602');assert.equal(global.results[0].category,'insights');
 assert.doesNotMatch(global.cql,/label (?:=|IN)/);assert.match(global.cql,/ancestor = 123/);assert.match(global.cql,/ancestor NOT IN \(700\)/);
 const insights=await adapter.searchPages({scope:'tree',area:'insights',query:'report'});
 assert.match(insights.cql,/id = 600 OR ancestor = 600/);assert.doesNotMatch(insights.cql,/wcs-area-insights/);assert.equal(insights.results[0].id,'602');
});

test('search hides managed title suffix only when it matches the native page identity', async()=>{
 const {adapter}=server({config:{nativePublication:{insightsPageId:'600'}},searchResponse:{results:[treeHit('602',['123','600'],{title:'Report · WCS 602',metadata:{labels:{results:[{name:'wcs-published'}]}}})]}});
 const result=await adapter.searchPages({scope:'tree'});assert.equal(result.results[0].title,'Report');
});

test('empty indexed Blog search recovers the published native child for main search and suggestions',async()=>{
 const f=insightBrowseFixture(u=>u.pathname.endsWith('/search')?response({results:[],_links:{}}):response({results:[insightPage('701')],_links:{}}));
 const r=await f.adapter.searchPages({scope:'tree',type:'Blog',query:'Published',limit:6});
 assert.equal(r.results[0].id,'701');assert.equal(r.results[0].category,'insights');
 assert.equal(f.calls.filter(u=>u.pathname.endsWith('/child/page')).length,1);
 assert.equal(f.calls.some(u=>u.pathname.includes('attachment')),false);
});
test('native Insights discovery extracts public cover/excerpt and body matches without per-card requests',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('');
 try{
 const p=insightPage('701');p.body={storage:{value:'<div class="wcs-native-article-body"><p>A useful treasury explanation.</p></div><ac:structured-macro ac:name="html"><ac:plain-text-body><![CDATA[<script type="application/json" id="wcs-published-reader" data-wcs-reader-root="123">'+JSON.stringify({format:1,pageId:'701',nativeVersion:2,document:{publishedVersion:1,versions:[{version:1,status:'Published',summary:'An authored summary.',cover:{src:'/confluence/download/attachments/701/cover.jpg'},bodyMarkdown:'Treasury explanation'}]}})+'</script>]]></ac:plain-text-body></ac:structured-macro>'}};
 const f=insightBrowseFixture(u=>u.pathname.endsWith('/search')?response({results:[],_links:{}}):response({results:[p],_links:{}}),{DOMParser:dom.window.DOMParser});
 const r=await f.adapter.searchPages({scope:'tree',query:'treasury',type:'Blog',limit:6});
 assert.equal(r.results[0].summary,'An authored summary.');assert.match(r.results[0].cover.src,/701\/cover.jpg$/);assert.equal(r.results[0].searchText,undefined);
 assert.equal(f.calls.some(u=>u.pathname.endsWith('/content/701')),false);
 }finally{dom.window.close();}
});
test('index recovery preserves filters and refuses pages outside Insights',async()=>{
 const f=insightBrowseFixture(u=>u.pathname.endsWith('/search')?response({results:[],_links:{}}):response({results:[insightPage('701')],_links:{}}));
 assert.equal((await f.adapter.searchPages({scope:'tree',type:'Blog',tag:'missing',limit:6})).results.length,0);
 assert.equal((await f.adapter.searchPages({scope:'tree',type:'Blog',year:'2025',limit:6})).results.length,0);
 const invalid=insightBrowseFixture(u=>u.pathname.endsWith('/search')?response({results:[],_links:{}}):response({results:[insightPage('701','Blog','400')],_links:{}}));
 await assert.rejects(invalid.adapter.searchPages({scope:'tree',query:'Published',limit:6}),e=>e.code==='INVALID_SCOPE');
});
test('recovery pagination advances through nonmatching batches and rejects changed filters',async()=>{
 const f=insightBrowseFixture(u=>u.pathname.endsWith('/search')?response({results:[],_links:{}}):response({results:[insightPage(String(701+Number(u.searchParams.get('start'))))],_links:{next:'/ignored'}}));
 const r=await f.adapter.searchPages({scope:'tree',query:'not present',limit:1});
 assert.equal(r.results.length,0);assert.equal(r.nextContinuation.next.start,4);
 await assert.rejects(f.adapter.searchPages({scope:'tree',query:'different',limit:1,continuation:r.nextContinuation}),e=>e.code==='INVALID_CONTINUATION');
 const next=await f.adapter.searchPages({scope:'tree',query:'not present',limit:1,continuation:r.nextContinuation});assert.equal(next.nextContinuation.next.start,5);
});

test('landing gives recent articles and optional counts separate deadlines',async()=>{
  const f=landingServer({areaPageIds:{loans:'400'},config:{search:{timeoutMs:1000}},wait:async url=>{
    const cql=url.searchParams.get('cql')||'';
    if(url.pathname.endsWith('/content/search') || url.pathname.endsWith('/api/search')&&!cql.includes('(id = 400 OR ancestor = 400)'))await new Promise(resolve=>setTimeout(resolve,600));
  }});
  const updates=[],result=await f.adapter.loadLanding({onUpdate:value=>updates.push(value)});
  assert.equal(result.recent.length,3);assert.equal(result.recentError,undefined);
  assert.equal(result.areas.loans.error,undefined);assert.equal(result.complete,true);
  assert.ok(updates.some(value=>value.recentReady&&!value.complete&&!value.areas.loans),'Visible cards arrive before counts');
  const before=f.state.calls.length;
  const refreshed=await f.adapter.loadLanding({areaIds:[]});
  assert.equal(refreshed.recent.length,3);
  assert.equal(f.state.calls.length,before,'A recent-only refresh reuses the valid search response and does not repeat area queries');
});
