'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const comments = require('./article-comments.js');
const Parser = new JSDOM('').window.DOMParser;
const config = { contextPath: '/confluence', rootPageId: '100', spaceKey: 'wcspedia', attachmentPageId: '150', pageIds: { home: '100', mine: '110' }, nativePublication: { areaPageIds: { credit: '200' }, workingRootPageId: '300' } };
const actor = { type: 'known', username: 'BR47149', userKey: 'key1', displayName: 'Test Reader' };
function comment(id = '901', extra = {}) { return Object.assign({ id, type: 'comment', status: 'current', container: { id: '210', type: 'page' }, body: { view: { value: '<p>Useful guidance.</p>' } }, history: { createdDate: '2026-10-17T11:00:00Z', createdBy: actor }, version: { when: '2026-10-17T11:00:00Z', by: actor }, extensions: { location: 'footer' } }, extra); }
function response(value, status = 200) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value) }; }
function setup(options = {}) {
  const calls = []; let now = 1;
  const fetch = async (url, settings) => {
    const parsed = new URL(url); calls.push({ url: parsed, settings });
    if (options.handle) { const handled = await options.handle(parsed, settings); if (handled !== undefined) return handled; }
    if (parsed.pathname.endsWith('/user/current')) return response(options.user || actor);
    if (parsed.pathname.endsWith('/content/100')) return response(options.root || { id: '100', type: 'page', status: 'current', space: { key: 'wcspedia' } });
    if (parsed.pathname.endsWith('/content/210')) return response(options.page || { id: '210', type: 'page', status: 'current', title: 'Article', body: {storage: {value: '<p>Article content.</p>'}}, space: { key: 'wcspedia' }, ancestors: [{ id: '100' }, { id: '200' }, { id: '205' }], operations: [{ operation: 'read', targetType: 'page' }] });
    if (parsed.pathname.endsWith('/content/210/child/comment')) return response(options.list || { results: [comment()], start: Number(parsed.searchParams.get('start')), _links: {} });
    if (settings.method === 'POST' && parsed.pathname.endsWith('/content')) return response(options.created || comment('902'), 200);
    throw Error('Unexpected request: ' + url);
  };
  const api = comments.create(Object.assign({}, config, options.config), { fetch, location: { href: 'https://example.test/confluence/pages/viewpage.action?pageId=210' }, DOMParser: Parser, now: () => now });
  return { api, calls, advance: ms => { now += ms; } };
}
test('resolve verifies root + space + nested business-area ancestry; caches only this instance', async () => {
  const f = setup(); const result = await f.api.resolve('210');
  assert.equal(result.areaId, 'credit'); assert.equal(result.canComment, true); assert.equal(result.permissionKnown, false); assert.equal(result.user.displayName, 'Test Reader');
  assert.equal(f.calls.length, 3); await f.api.resolve('210'); assert.equal(f.calls.length, 3);
  f.advance(30001); await f.api.resolve('210'); assert.equal(f.calls.length, 6);
  f.api.clear(); await f.api.resolve('210'); assert.equal(f.calls.length, 9);
  const g = setup({ user: { type: 'anonymous' } }); assert.equal((await g.api.resolve('210')).canComment, false);
});
test('all native requests use current origin context and credentials, never tokens', async () => {
  const f = setup(); await f.api.list('210');
  for (const call of f.calls) { assert.equal(call.url.origin, 'https://example.test'); assert.ok(call.url.pathname.startsWith('/confluence/rest/api/')); assert.equal(call.settings.credentials, 'same-origin'); assert.equal(call.settings.redirect, 'error'); assert.equal(call.settings.cache, 'no-store'); assert.equal(call.settings.headers.Authorization, undefined); }
});
test('exact root and space proof cannot be replaced by a readable unrelated page', async () => {
  for (const patch of [{ space: { key: 'OTHER' } }, { ancestors: [{ id: '999' }, { id: '200' }] }, { ancestors: [{ id: '200' }, { id: '100' }] }, { ancestors: [{ id: '100' }, { id: '300' }, { id: '200' }] }, { status: 'draft' }, { type: 'blogpost' }, { id: '999' }]) {
    const page = Object.assign({ id: '210', type: 'page', status: 'current', space: { key: 'wcspedia' }, ancestors: [{ id: '100' }, { id: '200' }] }, patch);
    const f = setup({ page }); await assert.rejects(f.api.list('210'), { code: 'OUT_OF_SCOPE' }); assert.equal(f.calls.filter(x => x.url.pathname.endsWith('/child/comment')).length, 0);
  }
  const f = setup({ root: { id: '100', type: 'page', space: { key: 'OTHER' } } }); await assert.rejects(f.api.resolve('210'), { code: 'OUT_OF_SCOPE' });
});
test('root, mapped area, interface, attachment, and working pages are excluded without requests', async () => {
  const f = setup(); for (const value of ['100', '110', '150', '200', '300']) await assert.rejects(f.api.resolve(value), { code: 'OUT_OF_SCOPE' }); assert.equal(f.calls.length, 0);
});
test('configuration rejects unsafe context, foreign origin, invalid IDs and overlapping roots', () => {
  for (const patch of [{ contextPath: '/confluence/../admin' }, { contextPath: '//external' }, { baseUrl: 'https://external.test/confluence' }, { baseUrl: 'https://example.test/other' }, { rootPageId: '100?x=1' }, { spaceKey: '' }, { nativePublication: { areaPageIds: { a: '100' } } }, { nativePublication: { areaPageIds: { a: '200' }, workingRootPageId: '100' } }]) assert.throws(() => setup({ config: patch }), { code: 'CONFIGURATION' });
});
test('list reads only twenty footer comments per click, preserving parent reply context and dates', async () => {
  const f = setup({ list: { results: [comment('901', { ancestors: [{ id: '210', type: 'page' }, { id: '900', type: 'comment' }] })], start: 0, totalCount: 3, _links: { next: '/rest/api/content/210/child/comment?start=1&limit=20' } } });
  const result = await f.api.list('210'); assert.equal(result.comments[0].parentId, '900'); assert.equal(result.comments[0].text, 'Useful guidance.'); assert.equal(result.comments[0].createdAt, '2026-10-17T11:00:00.000Z'); assert.equal(result.nextStart, 1); assert.equal(result.total, 3);
  const query = f.calls.at(-1).url.searchParams; assert.equal(query.get('limit'), '20'); assert.equal(query.get('depth'), 'all'); assert.equal(query.get('location'), 'footer');
  assert.equal(f.calls.length, 4);
});
test('comment HTML becomes inert plain text, including escaped text and block separation', async () => {
  const f = setup({ list: { start: 0, results: [comment('901', { body: { view: { value: '<script>bad()</script><p>Hello &amp; thanks.<br>Next</p><p>&lt;img onerror=bad()&gt;</p><iframe>bad</iframe><style>bad</style>' } } })], _links: {} } });
  const result = await f.api.list('210'); assert.equal(result.comments[0].text, 'Hello & thanks.\nNext\n<img onerror=bad()>'); assert.equal(result.nextStart, null);
});
test('pagination rejects foreign endpoints, page mismatches and loops, never follows returned URLs', async () => {
  for (const next of ['https://evil.test/confluence/rest/api/content/210/child/comment?start=1', '/rest/api/content/999/child/comment?start=1', '/rest/api/content/210/child/comment?start=0', '/rest/api/content/210/child/comment?start=200', '/rest/api/content/210/child/comment?start=1#x', '/rest/api/content/%32%31%30/child/comment?start=1']) {
    const f = setup({ list: { results: [comment()], start: 0, _links: { next } } }); await assert.rejects(f.api.list('210'), { code: 'INVALID_DATA' }); assert.equal(f.calls.length, 4);
  }
});
test('mismatched containers, inline comments, duplicated IDs and oversized pages fail safely', async () => {
  for (const results of [[comment('901', { container: { id: '999' } })], [comment('901', { extensions: { location: 'inline' } })], [comment(), comment()], Array.from({ length: 21 }, (_, i) => comment(String(900+i)))]) {
    const f = setup({ list: { results, start: 0, _links: {} } }); await assert.rejects(f.api.list('210'));
  }
});
test('creating a native comment rechecks scope, escapes storage and returns server identity and time', async () => {
  const f = setup(); await f.api.resolve('210');
  const result = await f.api.createComment('210', { text: ' <script>x</script>\nA & B ' });
  assert.equal(f.calls.length, 7); const post = f.calls.at(-1); assert.equal(post.settings.method, 'POST');
  const payload = JSON.parse(post.settings.body); assert.deepEqual(payload.container, { id: '210', type: 'page' }); assert.equal(payload.type, 'comment'); assert.equal(payload.body.storage.value, '<p>&lt;script&gt;x&lt;/script&gt;<br />A &amp; B</p>'); assert.equal(payload.body.storage.representation, 'storage');
  assert.equal(result.id, '902'); assert.equal(result.author.displayName, 'Test Reader'); assert.equal(result.text, 'Useful guidance.'); assert.equal(result.url, 'https://example.test/confluence/pages/viewpage.action?pageId=210&focusedCommentId=902#comment-902');
});
test('successful minimal response keeps confirmed comment ID without fabricating author or timestamp', async () => {
  const f = setup({ created: { id: '902', type: 'comment', status: 'current' } }); const result = await f.api.createComment('210', { text: 'Thanks' }); assert.equal(result.text, 'Thanks'); assert.equal(result.createdAt, null); assert.equal(result.author.id, ''); assert.equal(result.author.displayName, 'Confluence user');
});
test('preflight failure and invalid input are definite failures with no POST', async () => {
  const f = setup(); for (const text of ['', ' '.repeat(5), 'x'.repeat(10001), {}]) await assert.rejects(f.api.createComment('210', { text }), { code: 'VALIDATION', outcome: 'rejected' });
  await assert.rejects(f.api.createComment('100', { text: 'Hi' }), { code: 'OUT_OF_SCOPE', outcome: 'rejected' });
  await assert.rejects(f.api.createComment('210', { text: 'Hi', parentId: '900' }), { code: 'VALIDATION', outcome: 'rejected' });
  assert.equal(f.calls.length, 0);
});
test('failed scope reads and cancellation before POST are definite no-save outcomes', async () => {
  for (const failure of ['network', 'forbidden']) {
    const f = setup({ handle: async url => { if (!url.pathname.endsWith('/content/210')) return; if (failure === 'network') throw Error('offline'); return response({}, 403); } });
    await assert.rejects(f.api.createComment('210', { text: 'Hi' }), { code: failure === 'network' ? 'NETWORK' : 'FORBIDDEN', outcome: 'rejected' });
    assert.equal(f.calls.filter(call => call.settings.method === 'POST').length, 0);
  }
  const f = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.api.createComment('210', { text: 'Hi', signal: controller.signal }), { name: 'AbortError', outcome: 'rejected' }); assert.equal(f.calls.length, 0);
});
test('native 403 is definite, disables further composer attempts and never retries', async () => {
  const f = setup({ handle: async (url, options) => options.method === 'POST' ? response({}, 403) : undefined });
  await assert.rejects(f.api.createComment('210', { text: 'Hi' }), { code: 'FORBIDDEN', status: 403, outcome: 'rejected' });
  assert.equal((await f.api.resolve('210')).canComment, false);
  await assert.rejects(f.api.createComment('210', { text: 'Hi' }), { code: 'FORBIDDEN', outcome: 'rejected' });
  assert.equal(f.calls.filter(x => x.settings.method === 'POST').length, 1);
});
test('network loss, server failure and malformed success preserve unknown outcome and never retry', async () => {
  for (const behavior of ['network', 'server', 'invalid', 'wrong-page']) {
    const f = setup({ handle: async (url, options) => { if (options.method !== 'POST') return; if (behavior === 'network') throw Error('lost'); if (behavior === 'server') return response({}, 503); if (behavior === 'wrong-page') return response(comment('902', { container: { id: '999' } })); return { ok: true, status: 201, text: async () => '<html>login</html>' }; } });
    await assert.rejects(f.api.createComment('210', { text: 'Hi' }), { code: 'OUTCOME_UNKNOWN', outcome: 'unknown', retryable: false }); assert.equal(f.calls.filter(x => x.settings.method === 'POST').length, 1);
  }
});
test('read abort is forwarded and an already-aborted read performs no network requests', async () => {
  const controller = new AbortController(), f = setup(); controller.abort(); await assert.rejects(f.api.list('210', { signal: controller.signal }), { name: 'AbortError' }); assert.equal(f.calls.length, 0);
  const g = setup({ handle: async (url, options) => { if (!url.pathname.endsWith('/child/comment')) return; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); })); } });
  const read = new AbortController(); await g.api.resolve('210'); const pending = g.api.list('210', { signal: read.signal }); await new Promise(resolve => setTimeout(resolve, 0)); read.abort(); await assert.rejects(pending, { name: 'AbortError' });
});
test('concurrent double submits are prevented but a rejected preflight releases the lock', async () => {
  let complete; const f = setup({ handle: async (url, options) => options.method === 'POST' ? new Promise(resolve => { complete = () => resolve(response(comment('902'))); }) : undefined });
  const pending = f.api.createComment('210', { text: 'Hi' }); await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(f.api.createComment('210', { text: 'Hi' }), { code: 'BUSY', outcome: 'rejected' }); complete(); await pending; assert.equal(f.calls.filter(x => x.settings.method === 'POST').length, 1);
});


function discussionPage(body, ancestors=[{id:'100'},{id:'200'}]) { return {id:'210',type:'page',status:'current',title:'Article',space:{key:'wcspedia'},ancestors,body:{storage:{value:body}}}; }
function setting(value){return '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">wcs-comments-'+value+'</ac:parameter></ac:structured-macro>';}
test('disabled native setting prevents reading comment text or posting; existing comments are untouched',async()=>{
 const f=setup({page:discussionPage(setting('v1-disabled'))});const scope=await f.api.resolve('210');assert.equal(scope.commentsEnabled,false);assert.equal(scope.canComment,false);
 await assert.rejects(f.api.list('210'),{code:'COMMENTS_DISABLED'});await assert.rejects(f.api.createComment('210',{text:'Keep this draft'}),{code:'COMMENTS_DISABLED',outcome:'rejected'});
 assert.equal(f.calls.filter(c=>c.settings.method==='POST'||c.url.pathname.endsWith('/child/comment')).length,0);
 assert.match(f.calls.find(c=>c.url.pathname.endsWith('/content/210')).url.searchParams.get('expand'),/body.storage/);
});
test('POST rereads the published setting even when an enabled scope was recently cached',async()=>{
 const page=discussionPage(setting('v1-enabled')),f=setup({page});await f.api.resolve('210');page.body.storage.value=setting('v1-disabled');
 await assert.rejects(f.api.createComment('210',{text:'Do not submit'}),{code:'COMMENTS_DISABLED',outcome:'rejected'});assert.equal(f.calls.filter(c=>c.settings.method==='POST').length,0);
});
test('missing body, malformed or conflicting native setting fail closed while legacy pages remain enabled',async()=>{
 for(const body of [setting('v2-disabled'),setting('v1-disabled')+setting('v1-enabled'),'<ac:broken>',setting('v1-no')]){
  const f=setup({page:discussionPage(body)});await assert.rejects(f.api.list('210'),{code:'COMMENTS_SETTINGS_INVALID'});assert.equal(f.calls.filter(c=>c.url.pathname.endsWith('/child/comment')).length,0);
 }
 const page=discussionPage('');delete page.body;const f=setup({page});await assert.rejects(f.api.createComment('210',{text:'No'}),{code:'COMMENTS_SETTINGS_UNAVAILABLE',outcome:'rejected'});assert.equal(f.calls.filter(c=>c.settings.method==='POST').length,0);
 const legacy=setup({page:discussionPage('<p>Legacy article</p>')});assert.equal((await legacy.api.resolve('210')).commentsEnabled,true);
 const named=setup({page:discussionPage(setting('v1-disabled')+'<p>Native&nbsp;page &copy; Citi</p><at:declarations />')});assert.equal((await named.api.resolve('210')).commentsEnabled,false);
 const escaped=setup({page:discussionPage('<pre>&lt;ac:structured-macro ac:name="anchor"&gt;wcs-comments-v1-disabled&lt;/ac:structured-macro&gt;</pre>')});assert.equal((await escaped.api.resolve('210')).commentsEnabled,true);
});
test('configured Insights descendants are scoped inside the exact root and space while parent stays excluded',async()=>{
 const nativePublication={...config.nativePublication,insightsPageId:'400'};
 const f=setup({config:{nativePublication},page:discussionPage(setting('v1-enabled'),[{id:'100'},{id:'400'},{id:'405'}])});assert.equal((await f.api.resolve('210')).areaId,'insights');await assert.rejects(f.api.resolve('400'),{code:'OUT_OF_SCOPE'});
 const outside=setup({config:{nativePublication},page:discussionPage('',[{id:'400'},{id:'100'}])});await assert.rejects(outside.api.resolve('210'),{code:'OUT_OF_SCOPE'});
 const unconfigured=setup({page:discussionPage('',[{id:'100'},{id:'400'}])});await assert.rejects(unconfigured.api.resolve('210'),{code:'OUT_OF_SCOPE'});
});
