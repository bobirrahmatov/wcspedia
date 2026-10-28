const test = require('node:test');
const assert = require('node:assert/strict');
const charts = require('./workspace-charts.js');
const people = [{ id: 'author', role: 'Author' }, { id: 'reviewer', role: 'Manager' }, { id: 'reader', role: 'Reader' }];
const now = '2026-10-15T12:00:00Z';
function event(action, at, revision = 1, overrides = {}) {
  return { id: action + revision, actorId: 'reviewer', action, at, version: 1, revision,
    fromStatus: action === 'approve' ? 'Awaiting approval' : 'In review',
    toStatus: action === 'approve' ? 'Published' : 'Awaiting approval', ...overrides };
}
function document(overrides = {}) {
  return { id: 'doc1', authorId: 'author', reviewerId: 'reviewer', approverId: 'reviewer', versions: [{ version: 1, revision: 1, status: 'In review' }], audit: [], ...overrides };
}
test('pending work uses the latest version and current actor assignment only', () => {
  const docs = [document({ versions: [{ version: 2, status: 'Awaiting approval' }, { version: 1, status: 'In review' }] }),
    document({ id: 'review', approverId: 'other' }), document({ id: 'other', reviewerId: 'other', approverId: 'other' }),
    document({ id: 'self', authorId: 'reviewer' }), document({ id: 'done', versions: [{ version: 1, status: 'Published' }] })];
  assert.deepEqual(charts.summarize(docs, 'reviewer', now, people).pending, { review: 1, approval: 1, total: 2 });
});
test('unknown and reader personas cannot obtain analytics', () => {
  for (const actor of ['unknown', 'reader']) {
    const result = charts.summarize([document({ reviewerId: actor, approverId: actor })], actor, now, people);
    assert.equal(result.authorized, false); assert.equal(result.pending.total, 0); assert.equal(charts.markup(result), '');
  }
  assert.equal(charts.summarize([document()], 'reviewer', now).authorized, false);
});
test('an author may review another author but cannot accumulate manager approvals', () => {
  const docs = [document({ authorId: 'someone-else', reviewerId: 'author', approverId: 'author', audit: [event('approve', now, 1, { actorId: 'author' })] })];
  const summary = charts.summarize(docs, 'author', now, people);
  assert.equal(summary.pending.review, 1); assert.equal(summary.completed.approval, 0);
});
test('six weekly UTC buckets include Monday boundaries and the current partial week', () => {
  const doc = document({ audit: [event('complete-review', '2026-09-07T00:00:00Z'), event('approve', '2026-10-11T23:59:59Z'),
    event('complete-review', '2026-10-12T00:00:00Z', 2), event('approve', '2026-10-15T12:00:00Z', 2),
    event('approve', '2026-10-15T12:00:01Z', 3), event('complete-review', '2026-09-06T23:59:59Z', 4)] });
  const summary = charts.summarize([doc], 'reviewer', now, people);
  assert.equal(summary.startDate, '2026-09-07'); assert.equal(summary.weeks.length, 6);
  assert.equal(summary.weeks[0].review, 1); assert.equal(summary.weeks[4].approval, 1);
  assert.equal(summary.weeks[5].review, 1); assert.equal(summary.weeks[5].approval, 1);
  assert.deepEqual(summary.completed, { review: 2, approval: 2, total: 4 });
});
test('repeated API documents and repeated revision decisions do not inflate counts', () => {
  const doc = document({ audit: [event('complete-review', '2026-10-10T09:00:00Z'), event('complete-review', '2026-10-13T09:00:00Z', 1, { id: 'duplicate' }),
    event('complete-review', '2026-10-13T09:00:00Z', 2), event('approve', '2026-10-14T09:00:00Z', 2)] });
  const summary = charts.summarize([doc, doc], 'reviewer', now, people);
  assert.equal(summary.pending.total, 1); assert.equal(summary.completed.review, 2); assert.equal(summary.completed.approval, 1);
  assert.equal(summary.weeks[4].review, 1); assert.equal(summary.weeks[5].review, 1);
});
test('a duplicate of an older decision cannot become a new decision this week', () => {
  const doc = document({ audit: [event('complete-review', '2026-10-13T09:00:00Z'), event('complete-review', '2026-08-13T09:00:00Z')] });
  assert.equal(charts.summarize([doc], 'reviewer', now, people).completed.total, 0);
});
test('events require the correct actor, assignment, status transition and revision', () => {
  const doc = document({ audit: [event('complete-review', now, 1, { actorId: 'other' }), event('complete-review', now, 2, { toStatus: 'Published' }),
    event('complete-review', 'invalid', 3), event('complete-review', now, 0), event('edit', now, 4)] });
  assert.equal(charts.summarize([doc], 'reviewer', now, people).completed.total, 0);
  assert.throws(() => charts.summarize([doc], 'reviewer', 'bad date', people), /valid analytics date/);
});
test('aggregation does not mutate records, sort audit in place or expose document content', () => {
  const doc = document({ secret: 'not-for-chart', audit: [event('approve', now), event('complete-review', '2026-10-12T12:00:00Z')] });
  const original = JSON.stringify(doc), summary = charts.summarize([doc], 'reviewer', now, people);
  assert.equal(JSON.stringify(doc), original); assert.equal(JSON.stringify(summary).includes('not-for-chart'), false);
  assert.equal(JSON.stringify(summary).includes('doc1'), false);
});
test('accessible fallback includes all six weeks and does not embed remote scripts', () => {
  const html = charts.markup(charts.summarize([document()], 'reviewer', now, people));
  assert.equal((html.match(/<time datetime=/g) || []).length, 6);
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.match(html, /data-chart-table="pending" open/); assert.doesNotMatch(html, /<script|https:/);
});
test('Citi options contain actual values, safe fallback accessibility and no exporter', () => {
  const summary = charts.summarize([document({ audit: [event('complete-review', now)] })], 'reviewer', now, people);
  const options = charts.chartOptions(summary, false);
  assert.equal(options.pending.series[0].data[0].y, 1);
  assert.equal(options.activity.series[0].data.at(-1), 1);
  assert.equal(options.activity.series[0].color, '#255be3');
  assert.equal(options.activity.exporting.enabled, false); assert.equal(options.activity.accessibility.enabled, false);
  assert.equal(charts.sources.highchartsSrc, './vendor/highcharts-13.1.0.js');
  assert.equal(charts.sources.accessibilitySrc, './vendor/highcharts-13.1.0-accessibility.js');
});
test('real fixture totals stay aligned with actionable reviewer assignments', () => {
  const fixture = require('./wcspedia-data.json'), workflow = require('./workflow.js');
  const summary = charts.summarize(fixture.documents, 'jordan', now, fixture.people);
  const expected = fixture.documents.filter(doc => workflow.allowedActions(doc, 'jordan', fixture.people).length > 0).length;
  assert.equal(summary.pending.total, expected);
  assert.ok(summary.completed.total > 0);
});
