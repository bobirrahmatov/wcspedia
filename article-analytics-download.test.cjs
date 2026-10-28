'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const analytics = require('./article-analytics-download.js');
const config = { contextPath: '/confluence', rootPageId: '100', spaceKey: 'wcspedia', attachmentPageId: '150', pageIds: { home: '100', mine: '110' }, nativePublication: { areaPageIds: { credit: '200' }, workingRootPageId: '300', insightsPageId: '400' } };
const actor = { type: 'known', username: 'PRIVATE_READER', userKey: 'PRIVATE_KEY', displayName: 'PRIVATE_NAME' };
const at = '2026-10-17T11:00:00.000Z';
function page(id = '210', parent = '200', extra = {}) { return Object.assign({ id, type: 'page', status: 'current', title: 'Credit guidance', space: { key: 'wcspedia' }, ancestors: [{ id: '100' }, { id: parent }], history: { createdDate: at, createdBy: actor }, version: { number: 3, when: at, by: actor } }, extra); }
function comment(id = '901', pageId = '210', extra = {}) { return Object.assign({ id, type: 'comment', status: 'current', container: { id: pageId, type: 'page' }, ancestors: [{ id: pageId, type: 'page' }], extensions: { location: 'footer' }, history: { createdDate: at, createdBy: actor }, body: { view: { value: 'PRIVATE_COMMENT_BODY' } } }, extra); }
function response(value, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value) }; }
function batch(results, start = 0, next = null, extra = {}) { return Object.assign({ results, start, size: results.length, _links: next ? { next } : {} }, extra); }
function setup(options = {}) {
  const calls = [], progress = [];
  const fetch = async (url, settings) => {
    const parsed = new URL(url); calls.push({ url: parsed, settings });
    if (options.handle) { const handled = await options.handle(parsed, settings); if (handled !== undefined) return handled; }
    if (parsed.pathname.endsWith('/user/current')) return response(options.user || actor);
    if (parsed.pathname.endsWith('/content/100')) return response(options.root || page('100', '1', { ancestors: [] }));
    if (['200', '400'].some(id => parsed.pathname.endsWith('/content/' + id))) return response(page(parsed.pathname.split('/').at(-1), '1', { ancestors: [{ id: '100' }] }));
    if (parsed.pathname.endsWith('/content/search')) return response(options.list || batch([page()]));
    if (parsed.pathname.endsWith('/child/comment')) return response(options.comments || batch([comment('901', parsed.pathname.split('/').at(-3))]));
    throw Error('Unexpected request: ' + url);
  };
  const api = analytics.create(Object.assign({}, config, options.config), Object.assign({ fetch, location: { href: 'https://example.test/confluence/pages/viewpage.action?pageId=110' }, now: options.now || (() => Date.parse(at)) }, options.dependencies));
  return { api, calls, progress, run: extra => api.collect(Object.assign({ onProgress: value => progress.push(value) }, extra)) };
}
test('manual collection performs no background requests and exports one metadata-only JSON for all documents', async () => {
  const f = setup({ list: batch([page(), page('410', '400', { title: 'Knowledge sharing' })]) });
  assert.equal(f.calls.length, 0);
  const result = await f.run();
  assert.equal(result.schemaVersion, 1); assert.equal(result.rootPageId, '100'); assert.equal(result.spaceKey, 'wcspedia'); assert.equal(result.coverage, 'authenticated-current-user'); assert.equal(result.discoverySource, 'confluence-cql-index'); assert.equal(result.paginationComplete, true); assert.equal(result.pointInTimeSnapshot, false); assert.equal(result.documentCount, 2);
  assert.equal(result.documents['210'].collection, 'business-area'); assert.equal(result.documents['210'].areaId, 'credit'); assert.equal(result.documents['410'].collection, 'insights'); assert.equal(result.documents['410'].areaId, null);
  assert.equal(result.documents['210'].comments.total, 1); assert.equal(result.documents['210'].comments.lastCommentAt, at); assert.deepEqual(result.documents['210'].helpfulness, { source: 'wcspedia-feedback-service', status: 'unavailable', yes: null, no: null, total: null });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|createdBy|username|userKey|body/); assert.equal(f.progress.at(-1).phase, 'complete');
  for (const call of f.calls) { assert.equal(call.settings.method, 'GET'); assert.equal(call.settings.credentials, 'same-origin'); assert.equal(call.settings.mode, 'same-origin'); assert.equal(call.settings.redirect, 'error'); assert.equal(call.settings.cache, 'no-store'); assert.equal(call.url.origin, 'https://example.test'); assert.doesNotMatch(call.url.searchParams.get('expand') || '', /body/); }
});
test('CQL contains exact type, space, WCSpedia ancestry, both publication parents and exclusions', async () => {
  const f = setup(); await f.run(); const search = f.calls.find(call => call.url.pathname.endsWith('/content/search')).url;
  assert.equal(search.searchParams.get('cql'), 'type = page AND space = "wcspedia" AND ancestor = 100 AND (ancestor = 200 OR ancestor = 400) AND id NOT IN (100,200,400,150,110,300) AND ancestor NOT IN (300) ORDER BY created ASC, title ASC');
  assert.equal(search.searchParams.get('limit'), '50');
  const comments = f.calls.find(call => call.url.pathname.endsWith('/child/comment')).url;
  assert.equal(comments.searchParams.get('location'), 'footer'); assert.equal(comments.searchParams.get('depth'), 'all');
});
test('space key is safely escaped in CQL rather than interpolated as a clause', async () => {
  const key = 'WCS" or space = "OTHER\\';
  const f = setup({ config: { spaceKey: key }, root: page('100', '1', { space: { key } }), handle: url => {
    if (/\/content\/(200|400)$/.test(url.pathname)) return response(page(url.pathname.split('/').at(-1), '1', { ancestors: [{ id: '100' }], space: { key } }));
    if (url.pathname.endsWith('/content/search')) return response(batch([]));
  } });
  await f.run(); const query = f.calls.find(call => call.url.pathname.endsWith('/content/search')).url.searchParams.get('cql');
  assert.ok(query.startsWith('type = page AND space = "WCS\\" or space = \\"OTHER\\\\" AND ancestor = 100'));
});
test('root, parent and returned document must prove exact native space and ancestry', async () => {
  for (const options of [
    { root: page('100', '1', { space: { key: 'OTHER' } }) },
    { handle: url => url.pathname.endsWith('/content/200') ? response(page('200', '999', { ancestors: [{ id: '999' }] })) : undefined },
    { list: batch([page('210', '200', { space: { key: 'OTHER' } })]) },
    { list: batch([page('210', '200', { ancestors: [{ id: '200' }, { id: '100' }] })]) },
    { list: batch([page('210', '999')]) }
  ]) { const f = setup(options); await assert.rejects(f.run(), { code: 'OUT_OF_SCOPE' }); assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/child/comment')).length, 0); assert.notEqual(f.progress.at(-1).phase, 'complete'); }
});
test('known interface and working-tree results are skipped and never have comments read', async () => {
  const f = setup({ list: batch([page(), page('150'), page('110'), page('310', '200', { ancestors: [{ id: '100' }, { id: '200' }, { id: '300' }] })]) });
  const result = await f.run(); assert.deepEqual(Object.keys(result.documents), ['210']); assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/child/comment')).length, 1);
});
test('all article and comment pages are read; continuation filters cannot broaden the query', async () => {
  const f = setup({ handle: url => {
    const start = Number(url.searchParams.get('start'));
    if (url.pathname.endsWith('/content/search')) return response(start ? batch([page('410', '400')], 1) : batch([page()], 0, '/rest/api/content/search?start=1&cql=space=OTHER'));
    if (url.pathname.endsWith('/content/210/child/comment')) return response(start ? batch([comment('902', '210', { ancestors: [{ id: '210', type: 'page' }, { id: '901', type: 'comment' }], history: { createdDate: '2026-10-18T11:00:00Z' } })], 1) : batch([comment()], 0, '/rest/api/content/210/child/comment?start=1&location=inline'));
  } });
  const result = await f.run(); assert.equal(result.documentCount, 2); assert.deepEqual(result.documents['210'].comments, { source: 'confluence-footer-comments', status: 'available', total: 2, topLevelTotal: 1, repliesTotal: 1, lastCommentAt: '2026-10-18T11:00:00.000Z', creationDatesComplete: true });
  const searches = f.calls.filter(call => call.url.pathname.endsWith('/content/search')); assert.equal(searches[0].url.searchParams.get('cql'), searches[1].url.searchParams.get('cql'));
  const reads = f.calls.filter(call => call.url.pathname.endsWith('/content/210/child/comment')); assert.ok(reads.every(call => call.url.searchParams.get('location') === 'footer'));
});
test('missing native comment date remains unknown, never invented from update timestamps', async () => {
  const f = setup({ comments: batch([comment(), comment('902', '210', { history: {}, version: { when: '2027-01-01T00:00:00Z' } })]) });
  const result = await f.run(); assert.equal(result.documents['210'].comments.total, 2); assert.equal(result.documents['210'].comments.lastCommentAt, null); assert.equal(result.documents['210'].comments.creationDatesComplete, false);
});
test('duplicate IDs, lost pagination and foreign continuations abort rather than export a subset', async () => {
  for (const options of [
    { list: batch([page(), page()]) },
    { comments: batch([comment(), comment()]) },
    { list: batch([page()], 0, null, { totalSize: 2 }) },
    { list: { results: [page()], start: 0 } },
    { comments: batch([comment()], 0, null, { totalCount: 2 }) },
    { list: batch([page()], 0, 'https://evil.test/rest/api/content/search?start=1') },
    { comments: batch([comment()], 0, '/rest/api/content/999/child/comment?start=1') },
    { list: batch([page()], 0, '/rest/api/content/search?start=0') },
    { list: batch([page()], 0, '/rest/api/content/search?start=2') }
  ]) { const f = setup(options); await assert.rejects(f.run()); assert.notEqual(f.progress.at(-1).phase, 'complete'); assert.ok(f.calls.every(call => call.url.origin === 'https://example.test')); }
});
test('comment container and location mismatches abort the complete report', async () => {
  for (const patch of [{ container: { id: '999', type: 'page' } }, { extensions: { location: 'inline' } }, { ancestors: undefined }]) {
    const f = setup({ comments: batch([comment('901', '210', patch)]) }); await assert.rejects(f.run()); assert.notEqual(f.progress.at(-1).phase, 'complete');
  }
});
test('permission, network and malformed response failures never return a successful partial report', async () => {
  for (const broken of [() => response({}, 403), () => { throw Error('Network'); }, () => ({ ok: true, status: 200, text: async () => '<html>Sign in</html>' })]) {
    const f = setup({ handle: url => url.pathname.endsWith('/child/comment') ? broken() : undefined }); await assert.rejects(f.run()); assert.notEqual(f.progress.at(-1).phase, 'complete');
  }
});
test('anonymous session cannot enumerate source documents', async () => {
  const f = setup({ user: { type: 'anonymous' } }); await assert.rejects(f.run(), { code: 'FORBIDDEN' }); assert.equal(f.calls.length, 1);
});
test('concurrent metadata reads stay within the configured bound', async () => {
  let current = 0, maximum = 0;
  const f = setup({ list: batch(Array.from({ length: 7 }, (_, index) => page(String(210 + index)))), handle: async url => {
    if (url.pathname.endsWith('/child/comment')) { current++; maximum = Math.max(maximum, current); await new Promise(resolve => setTimeout(resolve, 8)); current--; return response(batch([])); }
  } });
  const result = await f.run(); assert.equal(result.documentCount, 7); assert.equal(maximum, 2); assert.equal(current, 0);
});
test('cancellation aborts pending reads, releases busy state, and returns no report', async () => {
  const controller = new AbortController(); let waiting, release; const started = new Promise(resolve => { waiting = resolve; });
  const f = setup({ handle: async (url, settings) => {
    if (url.pathname.endsWith('/child/comment') && !release) {
      waiting(); await new Promise((resolve, reject) => { release = resolve; settings.signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true }); });
    }
  } });
  const pending = f.run({ signal: controller.signal }); await started; await assert.rejects(f.run(), { code: 'BUSY' }); controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.notEqual(f.progress.at(-1).phase, 'complete');
  release(); assert.equal((await f.run()).documentCount, 1);
  const fresh = setup(); const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(fresh.run({ signal: cancelled.signal }), { name: 'AbortError' }); assert.equal(fresh.calls.length, 0);
});
test('bounded document/comment/request limits fail explicitly', async () => {
  for (const options of [
    { config: { maxDocuments: 1 }, list: batch([page(), page('410', '400')]) },
    { config: { maxCommentsPerDocument: 1 }, comments: batch([comment(), comment('902')]) },
    { config: { maxRequests: 1 } },
    { config: { maxBatches: 1 }, list: batch([page()], 0, '/rest/api/content/search?start=1') }
  ]) { const f = setup(options); await assert.rejects(f.run(), { code: 'LIMIT' }); assert.notEqual(f.progress.at(-1).phase, 'complete'); }
});
test('optional helpfulness analytics uses the configured same-origin aggregate export only', async () => {
  const f = setup({ config: { feedbackEndpoint: '/confluence/rest/wcspedia/feedback' }, handle: url => {
    if (url.pathname.endsWith('/wcspedia/feedback')) {
      assert.equal(url.searchParams.get('format'), 'analytics'); assert.equal(url.searchParams.get('rootPageId'), '100'); assert.equal(url.searchParams.get('pageId'), '210');
      return response({ schemaVersion: 1, rootPageId: '100', pageId: '210', pageVersion: 3, totals: { yes: 4, no: 1, total: 5 }, privateUnexpectedField: actor });
    }
  } });
  const result = await f.run(); assert.deepEqual(result.documents['210'].helpfulness, { source: 'wcspedia-feedback-service', status: 'available', yes: 4, no: 1, total: 5 }); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|privateUnexpectedField/);
  const bad = setup({ config: { feedbackEndpoint: '/confluence/rest/wcspedia/feedback' }, handle: url => url.pathname.endsWith('/wcspedia/feedback') ? response({ schemaVersion: 1, rootPageId: '100', pageId: '999', pageVersion: 3, totals: { yes: 0, no: 0, total: 0 } }) : undefined }); await assert.rejects(bad.run(), { code: 'INVALID_DATA' });
});
test('unsafe configuration is rejected before any read', () => {
  for (const patch of [{ contextPath: '//evil' }, { rootPageId: '100 OR id=1' }, { spaceKey: '\nOTHER' }, { concurrency: 20 }, { feedbackEndpoint: 'https://evil.test/api' }, { feedbackEndpoint: '/outside/api' }, { nativePublication: { areaPageIds: { x: '100' } } }, { nativePublication: { areaPageIds: { x: '200' }, workingRootPageId: '100' } }]) assert.throws(() => setup({ config: patch }), { code: 'CONFIGURATION' });
});

const engagementCoverage = { scope: 'wcspedia-published-articles', actors: 'signed-in-users-with-native-page-update', viewDefinition: 'one-successfully-recorded-visit-per-account-per-30-minutes', completeConfluenceTraffic: false, ballotOwnership: 'cooperative-native-editors-can-edit-properties', consistency: 'non-atomic-export', activeViewCapacity: 180 };
function engagementSnapshot(pageId = '210', extra = {}) {
  return Object.assign({ schemaVersion: 1, pageId, pageVersion: 3, observedAt: at,
    helpfulness: { source: 'confluence-content-properties', status: 'available', yes: 2, no: 1, total: 3, currentVersionTotals: { yes: 1, no: 1, total: 2 }, byPageVersion: [{ pageVersion: 2, yes: 1, no: 0, total: 1 }, { pageVersion: 3, yes: 1, no: 1, total: 2 }] },
    views: { source: 'confluence-content-properties', status: 'available', recordedViews: 9, windowMinutes: 30, lastRecordedAt: at }, coverage: engagementCoverage
  }, extra);
}
function nativeSetup(options = {}) {
  return setup(Object.assign({}, options, { config: Object.assign({ authoringMode: 'confluence-session' }, options.config),
    handle: async (url, settings) => { if (options.handle) { const handled = await options.handle(url, settings); if (handled !== undefined) return handled; } if (/\/content\/\d+\/property$/.test(url.pathname)) return response(batch([])); },
    dependencies: { engagement: options.engagement || { create(settings, dependencies) {
      assert.equal(settings.authoringMode, 'confluence-session');
      return { exportDocument: async (pageId, settings) => {
        const p = await dependencies.storage.page(pageId, '', settings);
        assert.equal(p.id, pageId); assert.equal(p.version.number, settings.pageVersion);
        await dependencies.storage.request('/rest/api/content/' + pageId + '/property?expand=version&limit=50&start=0', settings);
        return options.snapshot ? options.snapshot(pageId) : engagementSnapshot(pageId);
      } };
    } } }
  }));
}
test('native export includes aggregate votes by version and recorded views while excluding all account data', async () => {
  let started = false;
  const f = nativeSetup({ config: { feedbackEndpoint: 'https://unused.invalid/old-service' }, snapshot: pageId => {
    started = true; const value = engagementSnapshot(pageId);
    value.rawProperties = { PRIVATE_HASH: actor }; value.coverage = { ...value.coverage, actorsRaw: actor };
    value.helpfulness.voters = [actor]; value.views.accounts = ['PRIVATE_KEY'];
    value.helpfulness.byPageVersion[0].actor = actor;
    return value;
  } });
  assert.equal(started, false); assert.equal(f.calls.length, 0);
  const result = await f.run(), row = result.documents['210'];
  assert.equal(started, true); assert.equal(row.helpfulness.total, 3); assert.equal(row.helpfulness.currentVersionTotals.total, 2);
  assert.deepEqual(row.helpfulness.byPageVersion, [{ pageVersion: 2, yes: 1, no: 0, total: 1 }, { pageVersion: 3, yes: 1, no: 1, total: 2 }]);
  assert.equal(row.views.recordedViews, 9); assert.equal(row.views.lastRecordedAt, at); assert.deepEqual(row.engagementCoverage, engagementCoverage); assert.equal(row.engagementObservedAt, at);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|rawProperties|actorsRaw|voters|accounts|"actor"/);
  assert.ok(f.calls.every(call => call.url.origin === 'https://example.test' && call.settings.method === 'GET'));
  assert.equal(f.progress.at(-1).requests, 7);
});
test('complete native property enumeration can report zero recordings; unconfigured legacy views remain unknown', async () => {
  const f = nativeSetup({ snapshot: pageId => engagementSnapshot(pageId, {
    helpfulness: { source: 'confluence-content-properties', status: 'available', yes: 0, no: 0, total: 0, currentVersionTotals: { yes: 0, no: 0, total: 0 }, byPageVersion: [] },
    views: { source: 'confluence-content-properties', status: 'available', recordedViews: 0, windowMinutes: 30, lastRecordedAt: null }
  }) });
  const native = (await f.run()).documents['210'], legacy = (await setup().run()).documents['210'];
  assert.equal(native.helpfulness.total, 0); assert.equal(native.views.recordedViews, 0); assert.equal(native.engagementCoverage.completeConfluenceTraffic, false);
  assert.equal(legacy.views.recordedViews, null); assert.equal(legacy.views.status, 'unavailable');
});
test('native helper and permissions failures do not produce unavailable or successful partial reports', async () => {
  const missing = setup({ config: { authoringMode: 'confluence-session' } });
  await assert.rejects(missing.run(), { code: 'CONFIGURATION' });
  for (const failure of [() => response({}, 403), () => { throw Error('offline'); }]) {
    const f = nativeSetup({ handle: url => url.pathname.endsWith('/property') ? failure() : undefined });
    await assert.rejects(f.run()); assert.notEqual(f.progress.at(-1).phase, 'complete');
  }
});
test('native aggregate schema, versions, coverage and count consistency are validated', async () => {
  const patches = [
    value => { value.pageId = '999'; }, value => { value.pageVersion = 4; },
    value => { value.helpfulness.byPageVersion[0].yes = 2; },
    value => { value.helpfulness.currentVersionTotals = { yes: 2, no: 1, total: 3 }; },
    value => { value.helpfulness.byPageVersion[0].pageVersion = 4; },
    value => { value.helpfulness.byPageVersion[0].pageVersion = 3; },
    value => { value.views.recordedViews = -1; }, value => { value.views.lastRecordedAt = 'invalid'; },
    value => { value.views.lastRecordedAt = null; }, value => { value.views.windowMinutes = 1; },
    value => { value.coverage = { ...value.coverage, completeConfluenceTraffic: true }; },
    value => { value.helpfulness.status = 'unavailable'; }
  ];
  for (const patch of patches) { const f = nativeSetup({ snapshot: pageId => { const value = engagementSnapshot(pageId); patch(value); return value; } }); await assert.rejects(f.run(), { code: 'INVALID_DATA' }); assert.notEqual(f.progress.at(-1).phase, 'complete'); }
});
test('native export shares request budget and rejects broadening, duplicate parameters or mutations', async () => {
  await assert.rejects(nativeSetup({ config: { maxRequests: 6 } }).run(), { code: 'LIMIT' });
  for (const [path, init] of [
    ['/rest/api/content/999/property?expand=version&limit=50&start=0', {}],
    ['/rest/api/content/210/property?expand=version&limit=50&start=0', { method: 'POST' }],
    ['/rest/api/content/210/property?expand=version&limit=50&start=0&start=1', {}],
    ['/rest/api/content/210/property?expand=version&limit=50&start=0&secret=1', {}],
    ['/rest/api/content/210/property?expand=version&limit=500&start=0', {}],
    ['/rest/api/content/search?cql=type=page', {}]
  ]) {
    const f = nativeSetup({ engagement: { create(_config, dependencies) { return { exportDocument: async () => { await dependencies.storage.request(path, init); return engagementSnapshot(); } }; } } });
    await assert.rejects(f.run(), { code: 'OUT_OF_SCOPE' }); assert.ok(f.calls.every(call => call.settings.method === 'GET'));
  }
});
test('native engagement enumeration retains concurrency limits and aborts active work on cancel', async () => {
  let current = 0, maximum = 0;
  const f = nativeSetup({ list: batch(Array.from({ length: 5 }, (_, index) => page(String(210 + index)))), handle: async url => {
    if (url.pathname.endsWith('/property')) { current++; maximum = Math.max(maximum, current); await new Promise(resolve => setTimeout(resolve, 8)); current--; return response(batch([])); }
  } });
  assert.equal((await f.run()).documentCount, 5); assert.equal(maximum, 2);
  const controller = new AbortController(); let waiting; const started = new Promise(resolve => { waiting = resolve; });
  const cancelled = nativeSetup({ handle: async (url, settings) => {
    if (url.pathname.endsWith('/property')) { waiting(); await new Promise((resolve, reject) => settings.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })); }
  } });
  const pending = cancelled.run({ signal: controller.signal }); await started; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); assert.notEqual(cancelled.progress.at(-1).phase, 'complete');
});

test('real native engagement module composes with verified export reads and paginated JSON records', async () => {
  const E = require('./space-engagement.js');
  const entries = Array.from({ length: 51 }, (_, index) => ({ id: String(1000 + index), key: E.votePrefix + index.toString(16).padStart(64, '0'), version: { number: 1 }, value: { schemaVersion: 1, pageId: '210', value: index % 2 ? 'no' : 'yes', pageVersion: index % 2 ? 2 : 3, updatedAt: at, requestId: 'PRIVATE_REQUEST_' + index } }));
  entries.push({ id: '2000', key: E.viewKey, version: { number: 1 }, value: { schemaVersion: 1, pageId: '210', count: 8, lastRecordedAt: at, active: { ['f'.repeat(64)]: { at: Date.parse(at), requestId: 'wcsview-' + Date.parse(at) + '-' + 'a'.repeat(32) } } } });
  const f = setup({ config: { authoringMode: 'confluence-session' }, dependencies: { engagement: E }, handle: url => {
    if (!url.pathname.endsWith('/content/210/property')) return;
    const start = Number(url.searchParams.get('start')), limit = Number(url.searchParams.get('limit'));
    return response(batch(entries.slice(start, start + limit), start, start + limit < entries.length ? '/confluence/rest/api/content/210/property?start=' + (start + limit) : null));
  } });
  assert.equal(f.calls.length, 0);
  const report = await f.run(), row = report.documents['210'];
  assert.deepEqual([row.helpfulness.yes, row.helpfulness.no, row.helpfulness.total], [26, 25, 51]);
  assert.equal(row.helpfulness.currentVersionTotals.total, 26); assert.equal(row.helpfulness.byPageVersion.length, 2);
  assert.equal(row.views.recordedViews, 8); assert.equal(row.engagementCoverage.activeViewCapacity, 180);
  assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/property')).length, 2);
  assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/content/210')).length, 0);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|requestId|wcspedia-helpfulness-v1|wcspedia-recorded-views-v1|"active"/);
});
