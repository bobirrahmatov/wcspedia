'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterArticles, buildCQL, searchConfluence, cleanExcerpt } = require('./search.js');

const articles = [
  { id: '1', title: 'Credit approval', summary: 'Prepare a lending request.', category: 'credit-lifecycle', type: 'Guide', updated: '2026-10-13', tags: ['application'], sections: [], views: 20 },
  { id: '2', title: 'Lending checklist', summary: 'Credit approval workflow.', category: 'credit-lifecycle', type: 'Procedure', updated: '2026-10-01', tags: ['approval'], sections: [{ title: 'Review', paragraphs: ['Check collateral eligibility.'], bullets: ['Confirm an exception owner.'] }], views: 80 },
  { id: '3', title: 'Collateral reference', summary: 'Eligible assets.', category: 'collateral', type: 'Reference', updated: '2026-09-01', tags: ['credit'], sections: [{ title: 'Approval', paragraphs: ['Valuation rules.'], bullets: [] }], views: 40 },
  { id: '4', title: 'Documentation', summary: 'Obtain signatures.', category: 'credit-lifecycle', type: 'Policy', updated: '2026-07-01', tags: [], sections: [], views: 5 }
];
const scope = { rootPageId: '123456', spaceKey: 'WCS' };
const now = '2026-10-15T12:00:00Z';
const ids = (results) => results.map((article) => article.id);

test('search excerpts suppress escaped HTML-macro and application source without rendering code', () => {
  for (const source of [
    '{html}<div id="wcspedia"></div>{html}',
    '&lt;script&gt;window.WCS_CONFIG = {};&lt;/script&gt;',
    '&amp;lt;div class=&amp;quot;wcs-card&amp;quot;&amp;gt;HTML macro&amp;lt;/div&amp;gt;',
    '&#60;ac:structured-macro ac:name="html"&#62;code',
    '<b>window</b>.WCS_CONFIG = { contextPath: "/confluence" };',
    'var settings = { attachmentPageId: "123" };',
    'document.querySelector("#wcspedia")',
    'function start() { return something; }',
    '#wcspedia .card { border-radius: 24px; }',
    '"contextPath": "/confluence", attachmentPageId: "123"'
  ]) assert.equal(cleanExcerpt(source), '', source);
});

test('search excerpts retain ordinary document text and bound displayed summaries', () => {
  assert.equal(cleanExcerpt('<p>@@@hl@@@Credit@@@endhl@@@ &amp; <b>approval</b> guidance.</p>'), 'Credit & approval guidance.');
  assert.equal(cleanExcerpt('Use HTML and JSON reference documents. 2 &lt; 5.'), 'Use HTML and JSON reference documents. 2 < 5.');
  assert.equal(cleanExcerpt('<span class="search-highlight">Loan</span> management'), 'Loan management');
  assert.equal(cleanExcerpt('x'.repeat(30000)).length, 600);
  assert.equal(cleanExcerpt(null), '');
});

test('all query tokens must match across title, summary, tags and section content', () => {
  assert.deepEqual(ids(filterArticles(articles, { query: 'CREDIT Approval' })), ['1', '2', '3']);
  assert.deepEqual(ids(filterArticles(articles, { query: 'collateral exception' })), ['2']);
  assert.deepEqual(ids(filterArticles(articles, { query: 'credit nonexistent' })), []);
});

test('title and exact phrase matches outrank body-only matches', () => {
  assert.equal(filterArticles([...articles].reverse(), { query: 'credit approval' })[0].id, '1');
});

test('filters are OR within each facet and AND between facets', () => {
  assert.deepEqual(ids(filterArticles(articles, { categories: ['credit-lifecycle', 'collateral'], types: ['Guide', 'Policy'] })), ['1', '4']);
  assert.deepEqual(ids(filterArticles(articles, { categories: ['collateral'], types: ['Guide'] })), []);
});

test('date windows use a supplied clock and include the cutoff day', () => {
  assert.deepEqual(ids(filterArticles(articles, { updated: 'week', now })), ['1']);
  assert.deepEqual(ids(filterArticles(articles, { updated: 'month', now })), ['1', '2']);
  assert.deepEqual(ids(filterArticles(articles, { updated: 'quarter', now })), ['1', '2', '3']);
  assert.equal(filterArticles([{ ...articles[0], updated: '2026-10-08' }], { updated: 'week', now }).length, 1);
  assert.equal(filterArticles([{ ...articles[0], updated: 'unknown' }], { updated: 'week', now }).length, 0);
});

test('saved filters work across numeric and string IDs, including empty saved lists', () => {
  assert.deepEqual(ids(filterArticles(articles, { savedOnly: true, savedIds: [1, '3'] })), ['1', '3']);
  assert.deepEqual(filterArticles(articles, { savedOnly: true }), []);
});

test('sorting does not mutate the input array or articles', () => {
  const before = JSON.stringify(articles);
  assert.deepEqual(ids(filterArticles(articles, { sort: 'popular' })), ['2', '3', '1', '4']);
  assert.deepEqual(ids(filterArticles([...articles].reverse(), { sort: 'updated' })), ['1', '2', '3', '4']);
  assert.deepEqual(ids(filterArticles(articles, { sort: 'title' })), ['3', '1', '4', '2']);
  assert.equal(JSON.stringify(articles), before);
});

test('an empty local query returns every article in original order', () => {
  assert.deepEqual(ids(filterArticles(articles, { query: '  \t\n ' })), ['1', '2', '3', '4']);
});

test('every CQL request requires a root page, including empty searches', () => {
  for (const rootPageId of [undefined, '', '0', -1, 1.5, '123 OR type=blogpost', '1\nOR 1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildCQL({}, { rootPageId, spaceKey: 'WCS' }), /root page/i);
  }
  assert.equal(buildCQL({}, scope), 'type = page AND ancestor = 123456 AND space = "WCS"');
  assert.equal(buildCQL({}, { rootPageId: '999' }), 'type = page AND ancestor = 999');
});

test('direct children and nested descendants use different scope operators', () => {
  assert.match(buildCQL({}, { ...scope, directChildren: true }), /AND parent = 123456/);
  assert.match(buildCQL({}, { ...scope, directChildren: false }), /AND ancestor = 123456/);
  assert.throws(() => buildCQL({}, { ...scope, directChildren: 'false' }), /boolean/);
});

test('navigation exclusions accept only numeric IDs and stay inside the generated root scope', () => {
  assert.equal(buildCQL({ sort: 'updated' }, { ...scope, excludeIds: ['123456', 400, '400', '500'] }), 'type = page AND ancestor = 123456 AND space = "WCS" AND id NOT IN (123456, 400, 500) ORDER BY lastmodified DESC');
  assert.equal(buildCQL({}, { ...scope, excludeIds: [] }), buildCQL({}, scope));
  for (const excludeIds of ['123', ['123 OR 1=1'], ['0'], ['1\n'], [null], [Number.MAX_SAFE_INTEGER + 1], Array(301).fill('123')]) {
    assert.throws(() => buildCQL({}, { ...scope, excludeIds }));
  }
});

test('administrative subtree exclusions are numeric, deduplicated and preserve the positive root scope', () => {
  assert.equal(buildCQL({ sort: 'updated' }, { ...scope, excludeIds: ['123456', '400'], excludeAncestorIds: ['500', '600', '500'] }), 'type = page AND ancestor = 123456 AND space = "WCS" AND id NOT IN (123456, 400) AND ancestor NOT IN (500, 600) ORDER BY lastmodified DESC');
  assert.equal(buildCQL({}, { ...scope, excludeAncestorIds: [] }), buildCQL({}, scope));
  for (const excludeAncestorIds of ['123', ['123 OR 1=1'], ['0'], ['1\n'], [null], [Number.MAX_SAFE_INTEGER + 1], Array(301).fill('123')]) {
    assert.throws(() => buildCQL({}, { ...scope, excludeAncestorIds }));
  }
});

test('category and article type labels are grouped without weakening the root scope', () => {
  const cql = buildCQL({ categories: ['credit-lifecycle', 'collateral'], types: ['Guide', 'FAQ'], updated: 'month', sort: 'updated' }, scope);
  assert.equal(cql, 'type = page AND ancestor = 123456 AND space = "WCS" AND label IN ("wcs-topic-credit-lifecycle", "wcs-topic-collateral") AND label IN ("wcs-type-guide", "wcs-type-faq") AND lastmodified >= startOfDay("-30d") ORDER BY lastmodified DESC');
});

test('untrusted values cannot inject fields, scopes, labels or sort expressions', () => {
  assert.throws(() => buildCQL({}, { ...scope, spaceKey: 'WCS" OR type=blogpost' }), /space key/);
  assert.throws(() => buildCQL({ categories: ['credit") OR type=blogpost'] }, scope), /category/);
  assert.throws(() => buildCQL({ types: ['Guide") OR type=blogpost'] }, scope), /article type/);
  assert.throws(() => buildCQL({ sort: 'title DESC OR type=blogpost' }, scope), /sort/);
  assert.throws(() => buildCQL({ updated: 'week") OR type=blogpost' }, scope), /update/);
});

test('CQL and Lucene quoting keep malicious text inside literal search terms', () => {
  const query = '\\") OR ancestor=999 +credit* [a:b] AND /x?';
  const cql = buildCQL({ query }, scope);
  const literals = cql.match(/"(?:\\.|[^"\\])*"/g);
  assert.equal(literals[0], '"WCS"');
  assert.equal(cql.replace(/"(?:\\.|[^"\\])*"/g, 'LITERAL'),
    'type = page AND ancestor = 123456 AND space = LITERAL AND (' + Array(7).fill('text ~ LITERAL').join(' AND ') + ')');
  const terms = literals.slice(1).map((literal) => JSON.parse(literal));
  assert.ok(terms.every((term) => term.startsWith('"') && term.endsWith('"')));
  assert.ok(terms.includes('"or"'));
  assert.ok(terms.includes('"\\+credit\\*"'));
  assert.ok(terms.includes('"\\[a\\:b\\]"'));
  assert.ok(terms.includes('"\\/x\\?"'));
});

test('oversized, invalid and control-character search input is rejected', () => {
  assert.throws(() => buildCQL({ query: 'x'.repeat(501) }, scope), /500/);
  assert.throws(() => buildCQL({ query: Array(31).fill('x').join(' ') }, scope), /30/);
  assert.throws(() => buildCQL({ query: 'credit\0approval' }, scope), /control/);
  assert.throws(() => filterArticles(articles, { query: {} }), /text/);
  assert.throws(() => filterArticles(articles, { categories: 'collateral' }), /array/);
});

test('unsupported live popularity sorting fails instead of applying an invented CQL field', () => {
  assert.throws(() => buildCQL({ sort: 'popular' }, scope), /local prototype/);
});

const governedScope = { ...scope, categoryLabelPrefix: 'wcs-area-', requiredLabels: ['wcs-status-published'] };

test('governed document queries keep root scope and published requirement across area and type facets', () => {
  assert.equal(buildCQL({ categories: ['credit-approval-control', 'loan-management'], types: ['Job aid', 'Procedure', 'Knowledge sharing'], sort: 'title' }, governedScope),
    'type = page AND ancestor = 123456 AND space = "WCS" AND label = "wcs-status-published" AND label IN ("wcs-area-credit-approval-control", "wcs-area-loan-management") AND label IN ("wcs-type-job-aid", "wcs-type-procedure", "wcs-type-knowledge-sharing") ORDER BY title ASC');
  assert.equal(buildCQL({}, governedScope), 'type = page AND ancestor = 123456 AND space = "WCS" AND label = "wcs-status-published"');
  assert.equal(buildCQL({}, { ...governedScope, directChildren: true }), 'type = page AND parent = 123456 AND space = "WCS" AND label = "wcs-status-published"');
  assert.throws(() => buildCQL({}, { ...governedScope, rootPageId: '' }), /root page/i);
});

test('required labels are combined with AND and deduplicated, never broadened with IN or OR', () => {
  const cql = buildCQL({}, { ...scope, requiredLabels: ['wcs-status-published', 'wcs-controlled', 'wcs-status-published'] });
  assert.equal(cql, 'type = page AND ancestor = 123456 AND space = "WCS" AND label = "wcs-status-published" AND label = "wcs-controlled"');
  assert.equal(buildCQL({}, { ...scope, categoryLabelPrefix: 'wcs-topic-', requiredLabels: [] }), buildCQL({}, scope));
});

test('prefix and required-label configuration rejects malformed or injected CQL before use', () => {
  for (const categoryLabelPrefix of ['', 'wcs-area-" OR ancestor = 999', ['wcs-area-'], 'other-']) {
    assert.throws(() => buildCQL({}, { ...governedScope, categoryLabelPrefix }), /prefix/);
  }
  for (const requiredLabels of ['wcs-status-published', [''], ['wcs-status-published" OR type = blogpost'], ['label IN ("x")'], ['bad\nlabel'], [5], ['x'.repeat(256)]]) {
    assert.throws(() => buildCQL({}, { ...governedScope, requiredLabels }), /required label/);
  }
  assert.throws(() => buildCQL({}, { ...governedScope, requiredLabels: Array.from({ length: 21 }, (_, i) => 'label-' + i) }), /20/);
});

test('malicious search text remains literal inside the governed scope and cannot add raw CQL', () => {
  const cql = buildCQL({ query: '") OR label = "wcs-status-draft', cql: 'type = blogpost' }, governedScope);
  assert.ok(cql.startsWith('type = page AND ancestor = 123456 AND space = "WCS" AND label = "wcs-status-published" AND ('));
  const withoutLiterals = cql.replace(/"(?:\\.|[^"\\])*"/g, 'LITERAL');
  assert.equal(withoutLiterals, 'type = page AND ancestor = 123456 AND space = LITERAL AND label = LITERAL AND (' + Array(5).fill('text ~ LITERAL').join(' AND ') + ')');
  assert.equal(buildCQL({}, { ...governedScope, cql: 'type = blogpost' }), buildCQL({}, governedScope));
});

test('local filtering accepts job aids and knowledge sharing alongside procedures', () => {
  const docs = [{ ...articles[0], type: 'Job aid' }, { ...articles[1], type: 'Procedure' }, { ...articles[2], type: 'Knowledge sharing' }];
  assert.deepEqual(ids(filterArticles(docs, { types: ['Job aid', 'Knowledge sharing'] })), ['1', '3']);
});

function installBrowser(t, responder) {
  const oldLocation = global.location;
  const oldFetch = global.fetch;
  global.location = { protocol: 'https:', origin: 'https://confluence.example.test' };
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return responder ? responder(url, init) : { ok: true, json: async () => ({ results: [], totalSize: 0 }) };
  };
  t.after(() => { global.location = oldLocation; global.fetch = oldFetch; });
  return calls;
}

test('live search uses same-origin GET, encoded CQL, pagination and abort signal', async (t) => {
  const calls = installBrowser(t);
  const controller = new AbortController();
  await searchConfluence({ query: 'credit & approval', start: 20, limit: 10 }, { ...scope, baseUrl: '/wiki' }, { signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/wiki/rest/api/search');
  assert.equal(calls[0].url.searchParams.get('cql'), buildCQL({ query: 'credit & approval' }, scope));
  assert.equal(calls[0].url.searchParams.get('limit'), '10');
  assert.equal(calls[0].url.searchParams.get('start'), '20');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.mode, 'same-origin');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.signal, controller.signal);
  assert.deepEqual(calls[0].init.headers, { Accept: 'application/json' });
});

test('bad scope, foreign origin, embedded credentials and invalid pagination never make a request', async (t) => {
  const calls = installBrowser(t);
  await assert.rejects(searchConfluence({}, { baseUrl: '/wiki' }), /root page/i);
  for (const baseUrl of ['https://foreign.example/wiki', '//foreign.example/wiki', 'https://user:secret@confluence.example.test/wiki', '/wiki?token=secret']) {
    await assert.rejects(searchConfluence({}, { ...scope, baseUrl }), /same-origin/);
  }
  await assert.rejects(searchConfluence({ limit: 101 }, scope), /limit/);
  await assert.rejects(searchConfluence({ start: -1 }, scope), /offset/);
  assert.equal(calls.length, 0);
});

test('API results normalize into plain text articles and safe same-origin links', async (t) => {
  installBrowser(t, () => ({ ok: true, json: async () => ({
    totalSize: 12,
    results: [{ title: '<b>Credit &amp; approval</b>', excerpt: '<script>bad()</script>Read <span>guidance</span>.', url: '/spaces/WCS/pages/123/Test', content: { id: '123', metadata: { labels: { results: [{ name: 'wcs-topic-credit-lifecycle' }, { name: 'wcs-type-guide' }, { name: 'credit' }] } }, version: { when: '2026-10-13T12:00:00Z' } } }],
    _links: { next: '/rest/api/search?cql=type=page&cursor=next%2Bcursor&limit=20' }
  }) }));
  const result = await searchConfluence({}, { ...scope, baseUrl: '/wiki' });
  assert.equal(result.total, 12);
  assert.deepEqual(result.next, { cursor: 'next+cursor' });
  assert.deepEqual(result.results[0], { id: '123', title: 'Credit & approval', summary: '', category: 'credit-lifecycle', type: 'Guide', updated: '2026-10-13T12:00:00Z', tags: ['credit'], sections: [], views: null, readTime: null, url: 'https://confluence.example.test/wiki/spaces/WCS/pages/123/Test' });
});

test('untrusted next URLs cannot supply a replacement CQL query', async (t) => {
  const calls = installBrowser(t, () => ({ ok: true, json: async () => ({ results: [], _links: { next: '/rest/api/search?cql=type=page&cursor=next' } }) }));
  const first = await searchConfluence({ query: 'approval' }, scope);
  await searchConfluence({ query: 'approval', ...first.next }, scope);
  assert.equal(calls[1].url.searchParams.get('cql'), buildCQL({ query: 'approval' }, scope));
  assert.equal(calls[1].url.searchParams.get('cursor'), 'next');
  assert.equal(calls[1].url.searchParams.has('start'), false);
});

test('live governed search normalizes area labels and multi-word document types', async (t) => {
  const calls = installBrowser(t, () => ({ ok: true, json: async () => ({ results: [
    { title: 'Approval checklist', content: { id: '501', metadata: { labels: { results: [{ name: 'wcs-area-credit-approval-control' }, { name: 'wcs-topic-legacy-topic' }, { name: 'wcs-type-job-aid' }, { name: 'wcs-status-published' }, { name: 'checklist' }] } } } },
    { title: 'Handoff notes', content: { id: '502', metadata: { labels: { results: [{ name: 'wcs-area-deal-closing' }, { name: 'wcs-type-knowledge-sharing' }, { name: 'wcs-status-published' }] } } } }
  ] }) }));
  const result = await searchConfluence({}, governedScope);
  assert.equal(calls[0].url.searchParams.get('cql'), buildCQL({}, governedScope));
  assert.equal(result.results[0].category, 'credit-approval-control');
  assert.equal(result.results[0].type, 'Job aid');
  assert.deepEqual(result.results[0].tags, ['checklist']);
  assert.equal(result.results[1].category, 'deal-closing');
  assert.equal(result.results[1].type, 'Knowledge sharing');
});

test('live pagination retains required published labels and root scope against untrusted next links', async (t) => {
  const calls = installBrowser(t, () => ({ ok: true, json: async () => ({ results: [], _links: { next: '/rest/api/search?cql=label%3Dwcs-status-draft&start=20' } }) }));
  const first = await searchConfluence({ types: ['Job aid'] }, governedScope);
  await searchConfluence({ types: ['Job aid'], ...first.next }, governedScope);
  assert.equal(calls[1].url.searchParams.get('start'), '20');
  assert.equal(calls[1].url.searchParams.get('cql'), buildCQL({ types: ['Job aid'] }, governedScope));
  assert.ok(!calls[1].url.searchParams.get('cql').includes('wcs-status-draft'));
});

test('foreign or executable result links and pagination links are removed', async (t) => {
  installBrowser(t, () => ({ ok: true, json: async () => ({ results: [{ title: 'Bad link', url: 'javascript:alert(1)' }, { title: 'Foreign link', url: 'https://foreign.example/page' }], _links: { next: 'https://foreign.example/rest/api/search?cursor=evil' } }) }));
  const result = await searchConfluence({}, scope);
  assert.equal(result.next, null);
  assert.ok(result.results.every((article) => article.url === null));
  assert.equal(result.total, null);
});

test('HTTP failures remain errors rather than being presented as empty results', async (t) => {
  installBrowser(t, () => ({ ok: false, status: 403 }));
  await assert.rejects(searchConfluence({}, scope), (error) => error.status === 403);
});

test('Data Center entity results and totalCount normalize without assuming Cloud response fields', async (t) => {
  installBrowser(t, () => ({ ok: true, json: async () => ({ results: [{ entity: { id: '22', title: 'Nested guide', version: { when: '2026-10-17' }, metadata: { labels: { results: [{ name: 'wcs-topic-credit' }] } }, _links: { webui: '/pages/viewpage.action?pageId=22' } }, excerpt: 'Useful guidance.' }], totalCount: 58 }) }));
  const result = await searchConfluence({}, { ...scope, baseUrl: '/confluence' });
  assert.equal(result.total, 58);
  assert.equal(result.results[0].title, 'Nested guide');
  assert.equal(result.results[0].id, '22');
  assert.equal(result.results[0].category, 'credit');
  assert.equal(result.results[0].url, 'https://confluence.example.test/confluence/pages/viewpage.action?pageId=22');
});

test('blog and training filters remain child-page labels within the published knowledge-base scope', () => {
  assert.equal(buildCQL({ types: ['Blog', 'Training'], categories: ['regional-operating-manuals'] }, governedScope),
    'type = page AND ancestor = 123456 AND space = "WCS" AND label = "wcs-status-published" AND label IN ("wcs-area-regional-operating-manuals") AND label IN ("wcs-type-blog", "wcs-type-training")');
  assert.deepEqual(ids(filterArticles([
    { ...articles[0], type: 'Blog' },
    { ...articles[1], type: 'Training' },
    { ...articles[2], type: 'Reference' }
  ], { types: ['Blog', 'Training'] })), ['1', '2']);
});

test('live labels preserve Blog and Training types without falling back to Reference', async (t) => {
  installBrowser(t, () => ({ ok: true, json: async () => ({ results: [
    { title: 'Knowledge story', content: { id: '601', metadata: { labels: { results: [{ name: 'wcs-type-blog' }, { name: 'wcs-status-published' }] } } } },
    { title: 'Review essentials', content: { id: '602', metadata: { labels: { results: [{ name: 'wcs-type-training' }, { name: 'wcs-status-published' }] } } } }
  ] }) }));
  const result = await searchConfluence({ types: ['Blog', 'Training'] }, governedScope);
  assert.deepEqual(result.results.map(article => article.type), ['Blog', 'Training']);
  assert.ok(result.results.every(article => article.tags.length === 0));
});

test('every library type is filterable and retains its type when normalized from live labels', async (t) => {
  const types = require('./wcspedia-data.json').types;
  const docs = types.map((type, index) => ({ ...articles[0], id: String(index + 1), type }));
  assert.equal(filterArticles(docs, { types }).length, types.length);
  const label = type => 'wcs-type-' + type.toLowerCase().replace(/\s+/g, '-');
  for (const type of types) assert.ok(buildCQL({ types: [type] }, governedScope).includes('label IN ("' + label(type) + '")'));
  installBrowser(t, () => ({ ok: true, json: async () => ({ results: docs.map(doc => ({
    content: { id: doc.id, title: doc.title, metadata: { labels: { results: [{ name: label(doc.type) }] } } }
  })) }) }));
  const result = await searchConfluence({ types }, governedScope);
  assert.deepEqual(result.results.map(article => article.type), types);
});

test('root-inclusive CQL searches the landing page and every recursive descendant without required labels', () => {
  const cql = buildCQL({ query: 'handover' }, { ...scope, includeRoot: true });
  assert.ok(cql.startsWith('type = page AND (id = 123456 OR ancestor = 123456) AND space = "WCS" AND (text ~ '));
  assert.equal(cql.includes('label'), false);
  assert.equal(cql.includes('parent ='), false);
  assert.equal(buildCQL({}, { ...scope, includeRoot: true }), 'type = page AND (id = 123456 OR ancestor = 123456) AND space = "WCS"');
});

test('an optional area subtree remains conjunctive with the root and space scopes', () => {
  assert.equal(buildCQL({ types: ['Training'], sort: 'title' }, { ...scope, includeRoot: true, subtreePageId: '987' }),
    'type = page AND (id = 123456 OR ancestor = 123456) AND space = "WCS" AND (id = 987 OR ancestor = 987) AND label IN ("wcs-type-training") ORDER BY title ASC');
  assert.throws(() => buildCQL({}, { ...scope, includeRoot: true, subtreePageId: '987 OR space=OTHER' }), /root page/i);
  assert.throws(() => buildCQL({}, { ...scope, includeRoot: 'true' }), /boolean/);
  assert.throws(() => buildCQL({}, { ...scope, includeRoot: true, directChildren: true }), /recursive/);
});

test('a labelled Insights branch joins only the selected area subtree within the global root and space', () => {
  const config = { ...scope, subtreePageId: '987', additionalSubtreePageId: '988', additionalSubtreeCategory: 'loans', categoryLabelPrefix: 'wcs-area-', requiredLabels: ['wcs-tag-controls'] };
  assert.equal(buildCQL({ types: ['Blog'], sort: 'title' }, config),
    'type = page AND ancestor = 123456 AND space = "WCS" AND (id = 987 OR ancestor = 987 OR (ancestor = 988 AND label = "wcs-area-loans")) AND label = "wcs-tag-controls" AND label IN ("wcs-type-blog") ORDER BY title ASC');
  for (const patch of [
    { subtreePageId: null }, { additionalSubtreePageId: null }, { additionalSubtreeCategory: null },
    { additionalSubtreePageId: '988 OR space=OTHER' }, { additionalSubtreePageId: '123456' },
    { additionalSubtreePageId: '987' }, { subtreePageId: '123456' },
    { additionalSubtreeCategory: 'loans" OR space=OTHER' }, { additionalSubtreeCategory: '' },
    { additionalSubtreeCategory: ['loans'] }, { additionalSubtreeCategory: 'a'.repeat(247) },
    { categoryLabelPrefix: 'wcs-topic-' }, { directChildren: true }
  ]) assert.throws(() => buildCQL({}, { ...config, ...patch }));
});

test('unknown native page types remain unclassified instead of being presented as Reference', () => {
  const { typeFromLabel } = require('./search.js');
  assert.equal(typeFromLabel('wcs-type-job-aid'), 'Job aid');
  assert.equal(typeFromLabel('wcs-type-faq'), 'FAQ');
  assert.equal(typeFromLabel('unlabelled'), null);
});

test('typeahead prefixes only the final plain word while keeping every scope predicate',()=>{
 const cql=buildCQL({query:'credit app',prefixLastToken:true},scope);
 assert.ok(cql.includes('text ~ "app*"'));assert.ok(cql.includes('ancestor = 123456'));assert.ok(cql.includes('space = "WCS"'));
 assert.equal(buildCQL({query:'credit app'},scope).includes('app*'),false);
 for(const query of ['*','app*','OR','a:b','a" OR space=OTHER','a?','c++']){
  const queryCql=buildCQL({query,prefixLastToken:true},scope);
  assert.ok(queryCql.startsWith('type = page AND ancestor = 123456 AND space = "WCS"'));
  if(/[^a-z0-9]/i.test(query.split(' ').at(-1)))assert.equal(queryCql,buildCQL({query},scope));
 }
 assert.throws(()=>buildCQL({query:'app',prefixLastToken:'yes'},scope),/boolean/);
});
