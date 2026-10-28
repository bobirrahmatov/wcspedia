'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createArticleAnalyticsPublisher, createFooterCommentCounter, createArticleAnalyticsFileStore } = require('./article-analytics.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const at = '2026-10-17T12:00:00.000Z';
function fixture(extra = {}) {
  let output = { previous: true }, writes = 0, listCalls = 0, accesses = 0, authorizations = 0;
  let queue = Promise.resolve();
  const page = { id: '1002', type: 'page', status: 'current', spaceKey: 'wcspedia', ancestorIds: ['100', '1001'], version: 3, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: at };
  const access = { authenticated: true, canRead: true, rootReadable: true, page };
  const feedback = { schemaVersion: 1, rootPageId: '100', pageId: '1002', pageVersion: 3, revision: 4, updatedAt: at, totals: { yes: 2, no: 1, total: 3 }, byPageVersion: [{ pageVersion: 2, yes: 1, no: 0, total: 1 }, { pageVersion: 3, yes: 1, no: 1, total: 2 }], voteChanges: 4 };
  const store = {
    withLock: async task => { const next = queue.catch(() => {}).then(task); queue = next; return next; },
    set: async value => { output = clone(value); writes++; }
  };
  const options = {
    rootPageId: '100', spaceKey: 'wcspedia', areaPageIds: ['1001', '1003'], excludePageIds: ['1004'], excludeAncestorIds: ['1005'], store, now: () => Date.parse(at),
    authorizeReport: async ({ context }) => { authorizations++; return context?.trustedAdmin === true; },
    listArticles: async ({ cursor }) => { listCalls++; return cursor === null ? { results: [{ id: '1002' }, { id: '1001' }, { id: '1004' }], nextCursor: 'page-2' } : { results: [{ id: '1002' }, { id: '1006' }], nextCursor: null }; },
    resolveAccess: async ({ pageId }) => { accesses++; return { ...clone(access), page: { ...clone(page), id: pageId } }; },
    readCommentSummary: async () => ({ status: 'available', total: 2, lastCommentAt: at }),
    feedbackService: { analytics: async ({ pageId }) => ({ ...clone(feedback), pageId }) },
    ...extra
  };
  return { publisher: createArticleAnalyticsPublisher(options), options, page, access, feedback, output: () => output, writes: () => writes, listCalls: () => listCalls, accesses: () => accesses, authorizations: () => authorizations };
}
const context = { trustedAdmin: true };
test('one report contains every paginated verified document, no comment text or identities, and skips navigation pages', async () => {
  const f = fixture();
  f.page.title = 'Private page title'; f.page.createdBy = 'user-secret'; f.feedback.actors = ['voter-secret'];
  const report = await f.publisher.publish(context);
  assert.deepEqual(Object.keys(report.documents), ['1002', '1006']);
  assert.equal(report.documentCount, 2); assert.equal(report.generatedAt, at); assert.equal(report.scanStartedAt, at);
  assert.equal(f.listCalls(), 2); assert.equal(f.accesses(), 2); assert.equal(f.writes(), 1); assert.equal(f.authorizations(), 3);
  assert.deepEqual(report.documents['1002'].comments, { source: 'confluence-footer-comments', status: 'available', total: 2, lastCommentAt: at });
  assert.equal(report.documents['1002'].areaPageId, '1001'); assert.equal(report.documents['1002'].pageVersion, 3);
  assert.equal(report.documents['1002'].createdAt, f.page.createdAt);
  assert.deepEqual(report.documents['1002'].helpfulness.byPageVersion, f.feedback.byPageVersion);
  for (const secret of ['Private page title', 'user-secret', 'voter-secret']) assert.equal(JSON.stringify(report).includes(secret), false);
});
test('the publisher requires report authorization before scans and rechecks it immediately before replacing the previous file', async () => {
  const f = fixture(); await assert.rejects(f.publisher.publish({ trustedAdmin: false }), { code: 'ANALYTICS_FORBIDDEN' });
  assert.equal(f.listCalls(), 0); assert.equal(f.writes(), 0);
  let calls = 0; const revoked = fixture({ authorizeReport: async () => ++calls < 3 });
  await assert.rejects(revoked.publisher.publish(context), { code: 'ANALYTICS_FORBIDDEN' });
  assert.deepEqual(revoked.output(), { previous: true }); assert.equal(revoked.writes(), 0);
});
test('wrong space, wrong ancestry, working descendants, unreadable and non-current pages cannot enter the report', async () => {
  for (const mutate of [
    f => f.page.spaceKey = 'another', f => f.page.ancestorIds = ['1001'], f => f.page.ancestorIds = ['1001', '100'],
    f => f.page.ancestorIds = ['100'], f => f.page.ancestorIds = ['100', '1001', '1005'],
    f => f.page.status = 'trashed', f => f.page.type = 'blogpost', f => f.page.version = 0,
    f => f.access.canRead = false, f => f.access.authenticated = false, f => f.access.rootReadable = false
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_SCOPE' }); assert.equal(f.writes(), 0);
  }
});
test('configured Insights descendants join the report while their parent is skipped and native scope remains verified', async () => {
  let listingScope;
  const f = fixture({ insightsPageId: '2001', listArticles: async scope => { listingScope = scope; return { results: [{ id: '2001' }, { id: '1002' }], nextCursor: null }; } });
  f.page.ancestorIds = ['100', '2001', '2002'];
  const result = await f.publisher.publish(context);
  assert.deepEqual(Object.keys(result.documents), ['1002']); assert.equal(result.documents['1002'].areaPageId, '2001'); assert.equal(result.documents['1002'].collection, 'insights'); assert.equal(f.accesses(), 1);
  assert.deepEqual(listingScope.areaPageIds, ['1001', '1003']); assert.equal(listingScope.insightsPageId, '2001'); assert.deepEqual(listingScope.publishedParentPageIds, ['1001', '1003', '2001']);
  assert.equal((await fixture().publisher.publish(context)).documents['1002'].collection, 'business-area');
});
test('Insights analytics reject wrong-root, wrong-space, excluded or unreadable descendants without replacing the report', async () => {
  for (const mutate of [f => f.page.ancestorIds = ['2001', '100'], f => f.page.ancestorIds = ['999', '2001'], f => f.page.ancestorIds = ['100', '2001', '1005'], f => f.page.spaceKey = 'other', f => f.access.canRead = false]) {
    const f = fixture({ insightsPageId: '2001' }); f.page.ancestorIds = ['100', '2001']; mutate(f);
    await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_SCOPE' }); assert.equal(f.writes(), 0); assert.deepEqual(f.output(), { previous: true });
  }
  const unconfigured = fixture(); unconfigured.page.ancestorIds = ['100', '2001']; await assert.rejects(unconfigured.publisher.publish(context), { code: 'ANALYTICS_SCOPE' });
});
test('optional Insights analytics parent rejects invalid IDs or overlap with root and business areas', async () => {
  for (const insightsPageId of [undefined, null, '']) assert.equal((await fixture({ insightsPageId }).publisher.publish(context)).documentCount, 2);
  for (const insightsPageId of ['bad', '0', '100', '1001', 2001]) assert.throws(() => fixture({ insightsPageId }), { code: 'ANALYTICS_INPUT' });
});
test('an explicit unavailable comment count remains null; empty comments are a known zero', async () => {
  const f = fixture({ readCommentSummary: async ({ pageId }) => pageId === '1002' ? { status: 'unavailable', total: null, lastCommentAt: null } : { status: 'available', total: 0, lastCommentAt: null } });
  const result = await f.publisher.publish(context);
  assert.equal(result.documents['1002'].comments.total, null);
  assert.equal(result.documents['1002'].comments.status, 'unavailable');
  assert.equal(result.documents['1006'].comments.total, 0);
});
test('native-comment analytics work before feedback is deployed, with unavailable helpfulness rather than invented zero votes', async () => {
  for (const feedbackService of [undefined, null]) {
    const f = fixture({ feedbackService }), report = await f.publisher.publish(context);
    assert.equal(report.documents['1002'].comments.total, 2);
    assert.deepEqual(report.documents['1002'].helpfulness, { source: 'wcspedia-feedback-service', status: 'unavailable', revision: null, updatedAt: null, yes: null, no: null, total: null, byPageVersion: null, voteChanges: null });
    assert.equal(f.writes(), 1);
  }
  const configured = fixture();
  assert.equal((await configured.publisher.publish(context)).documents['1002'].helpfulness.status, 'available');
});
test('a configured feedback failure aborts publication and cannot silently become unavailable', async () => {
  const f = fixture({ feedbackService: { analytics: async () => { throw Error('Feedback export forbidden'); } } });
  await assert.rejects(f.publisher.publish(context), /Feedback export forbidden/);
  assert.equal(f.writes(), 0); assert.deepEqual(f.output(), { previous: true });
});
test('partial network failure preserves the complete old report rather than writing partial documents', async () => {
  const f = fixture({ readCommentSummary: async ({ pageId }) => { if (pageId === '1006') throw Error('Confluence timeout'); return { status: 'available', total: 8, lastCommentAt: at }; } });
  await assert.rejects(f.publisher.publish(context), /Confluence timeout/);
  assert.deepEqual(f.output(), { previous: true }); assert.equal(f.writes(), 0);
});
test('missing continuation markers and repeating cursors cannot silently truncate or loop', async () => {
  for (const response of [{ results: [] }, { results: [], nextCursor: '' }, { results: [], nextCursor: 'loop' }]) {
    const f = fixture({ listArticles: async () => response });
    await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_SOURCE' }); assert.equal(f.writes(), 0);
  }
});
test('configured document and batch limits preserve the previous report on overflow', async () => {
  for (const extra of [{ maxDocuments: 1 }, { maxBatches: 1 }]) {
    const f = fixture(extra); await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_LIMIT' }); assert.equal(f.writes(), 0);
  }
});
test('invalid count/status/timestamp and mismatched feedback totals are not accepted as analytics', async () => {
  for (const comments of [{ status: 'available', total: -1, lastCommentAt: null }, { status: 'available', total: 0, lastCommentAt: at }, { status: 'unavailable', total: 0, lastCommentAt: null }, { status: 'available', total: 3, lastCommentAt: 'today' }]) {
    const f = fixture({ readCommentSummary: async () => comments }); await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_SOURCE' }); assert.equal(f.writes(), 0);
  }
  for (const mutate of [f => f.page.createdAt = 'today', f => f.feedback.pageVersion = 4, f => f.feedback.totals.total = 99, f => f.feedback.byPageVersion = [], f => f.feedback.byPageVersion.push(f.feedback.byPageVersion[0])]) {
    const f = fixture(); mutate(f); await assert.rejects(f.publisher.publish(context), { code: 'ANALYTICS_SOURCE' }); assert.equal(f.writes(), 0);
  }
});
test('cancellation and clock rollback do not replace the last complete report', async () => {
  const c = new AbortController(); const f = fixture({ readCommentSummary: async () => { c.abort(); return { status: 'available', total: 2, lastCommentAt: at }; } });
  await assert.rejects(f.publisher.publish(context, { signal: c.signal }), { code: 'ANALYTICS_ABORTED' }); assert.equal(f.writes(), 0);
  let calls = 0; const rollback = fixture({ now: () => Date.parse(at) - (++calls > 3 ? 1000 : 0) });
  await assert.rejects(rollback.publisher.publish(context), { code: 'ANALYTICS_CLOCK' }); assert.equal(rollback.writes(), 0);
});
test('an empty completed source produces a real empty report', async () => {
  const f = fixture({ listArticles: async () => ({ results: [], nextCursor: null }) });
  const value = await f.publisher.publish(context); assert.equal(value.documentCount, 0); assert.deepEqual(value.documents, {}); assert.equal(f.writes(), 1);
});
test('native footer comments are paginated and deduplicated, inline comments excluded, dates remain honest', async () => {
  const calls = [];
  const counter = createFooterCommentCounter({ listComments: async ({ cursor }) => {
    calls.push(cursor); return cursor === null ? { results: [{ id: '800', location: 'footer', createdAt: '2026-01-01T00:00:00.000Z' }, { id: '801', location: 'inline', createdAt: at }], nextCursor: 'next' } : { results: [{ id: '800', location: 'footer', createdAt: '2026-01-01T00:00:00.000Z' }, { id: '802', location: 'footer', createdAt: at }], nextCursor: null };
  } });
  assert.deepEqual(await counter({ rootPageId: '100', pageId: '1002', context }), { status: 'available', total: 2, lastCommentAt: at });
  assert.deepEqual(calls, [null, 'next']);
  const unknown = createFooterCommentCounter({ listComments: async () => ({ results: [{ id: '800', location: 'footer', createdAt: null }], nextCursor: null }) });
  assert.deepEqual(await unknown({ rootPageId: '100', pageId: '1002', context }), { status: 'available', total: 1, lastCommentAt: null });
});
test('native footer counting never turns truncated, malformed or failed comment responses into zero', async () => {
  for (const page of [{ results: [] }, { results: [], nextCursor: 'same' }, { results: [{ id: '1', location: 'unknown', createdAt: null }], nextCursor: null }]) {
    const counter = createFooterCommentCounter({ listComments: async () => page });
    await assert.rejects(counter({ rootPageId: '100', pageId: '1002', context }), { code: 'ANALYTICS_SOURCE' });
  }
  const counter = createFooterCommentCounter({ listComments: async () => { throw Error('403 forbidden'); } });
  await assert.rejects(counter({ rootPageId: '100', pageId: '1002', context }), /403 forbidden/);
});
test('file publication is private and atomic, survives instances and serializes overlapping runs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wcs-analytics-'));
  try {
    const a = createArticleAnalyticsFileStore(directory), b = createArticleAnalyticsFileStore(directory);
    let active = 0, maximum = 0;
    const collect = async ({ cursor }) => { active++; maximum = Math.max(active, maximum); await new Promise(resolve => setTimeout(resolve, 30)); active--; return { results: [{ id: '1002' }], nextCursor: null }; };
    const first = fixture({ store: a, listArticles: collect }), second = fixture({ store: b, listArticles: collect });
    await Promise.all([first.publisher.publish(context), second.publisher.publish(context)]);
    assert.equal(maximum, 1);
    assert.deepEqual(await fs.readdir(directory), ['wcspedia-analytics.json']);
    const file = path.join(directory, 'wcspedia-analytics.json');
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).documentCount, 1);
    await fs.mkdir(file + '.lock');
    await assert.rejects(createArticleAnalyticsFileStore(directory, { lockTimeoutMs: 5 }).withLock(() => assert.fail('must never steal an existing writer lock')), { code: 'ANALYTICS_BUSY' });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
