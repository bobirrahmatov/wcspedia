'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'article-engagement-bootstrap.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
function loaded(extra = {}) { return { schemaVersion: 1, rootPageId: '10', pageId: '40', pageVersion: 3, canVote: true, canRecord: true, myVote: { value: null, revision: 0, pageVersion: null }, views: { recordedViews: 7 }, ...extra }; }
function fixture(options = {}) {
  const dom = new JSDOM('<div id="main-content">Article</div><div id="comments-section">Native comments</div>', { url: options.url || 'https://example.test/confluence/pages/viewpage.action?pageId=40', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, calls = { create: [], load: [], save: [], feedbackLoad: [], prime: [], record: [], notices: [], intervals: 0 }, timers = new Map(); let clock = 0, nextTimer = 1, visibility = options.visibility || 'visible';
  Object.defineProperty(d, 'readyState', { value: 'complete', configurable: true }); Object.defineProperty(d, 'visibilityState', { get: () => visibility, configurable: true });
  if (options.markup) d.body.insertAdjacentHTML('afterbegin', options.markup);
  for (const [name, value] of [['ajs-space-key', options.space], ['ajs-action', options.action]]) if (value) { const meta = d.createElement('meta'); meta.name = name; meta.content = value; d.head.append(meta); }
  w.setTimeout = (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, at: clock + delay }); return id; }; w.clearTimeout = id => timers.delete(id); w.setInterval = () => { calls.intervals++; throw Error('No polling allowed'); };
  w.WCS_ARTICLE_DISCUSSION_CONFIG = { authoringMode: 'confluence-session', contextPath: '/confluence', rootPageId: '10', spaceKey: 'wcspedia', attachmentPageId: '11', workingRootPageId: '12', insightsPageId: '50', pageIds: { home: '10', mine: '13', review: '14', saved: '15', entitlements: '16' }, areaPageIds: { credit: '20' }, excludePageIds: ['17'], excludeAncestorIds: ['18'], ...options.config };
  const native = { load: async (id, args) => { calls.load.push([id, args]); return options.load ? options.load(id, args) : loaded(options.data); }, recordView: async (id, args) => { calls.record.push([id, args]); return options.record ? options.record(id, args) : { recorded: true, recordedViews: 8 }; } };
  w.WCSSpaceEngagement = { create: config => { calls.create.push(config); return native; } };
  w.WCSArticleFeedback = { create: () => ({ prime: value => { calls.prime.push(value); return { canVote: value.canVote, vote: value.myVote.value, reason: value.reason || '' }; }, load: async args => { calls.feedbackLoad.push(args); return options.feedbackLoad ? options.feedbackLoad(args) : { canVote: true, vote: 'yes' }; }, save: async (value, args) => { calls.save.push([value, args]); return options.save ? options.save(value, args) : { canVote: true, vote: value }; } }) };
  w.WCSNotifications = Object.fromEntries(['success', 'error', 'warning'].map(type => [type, text => calls.notices.push([type, text])]));
  w.eval(source);
  return { w, d, calls, timers, async advance(ms) { clock += ms; const due = [...timers].filter(([, v]) => v.at <= clock); for (const [id, timer] of due) { if (timers.delete(id)) timer.fn(); } await tick(); }, async visibility(value) { visibility = value; d.dispatchEvent(new w.Event('visibilitychange')); await tick(); }, hide() { w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true })); }, show() { w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true })); }, host() { return d.querySelector('[data-wcs-article-engagement]'); }, button(value) { return d.querySelector('[data-vote="' + value + '"]'); }, close() { w.WCSArticleEngagementBootstrap.destroy(); dom.window.close(); } };
}
test('control pages, editors, history, previews, native bypass and other spaces never call engagement APIs', async () => {
  const urls = ['10', '11', '12', '13', '14', '15', '16', '17', '20', '50'].map(id => ({ url: 'https://example.test/confluence/pages/viewpage.action?pageId=' + id }));
  for (const options of [...urls, { action: 'pagehistory' }, { space: 'other' }, { markup: '<div id="wcspedia"></div>' }, { markup: '<form id="editpageform"></form>' }, { url: 'https://example.test/confluence/pages/editpage.action?pageId=40' }, { url: 'https://example.test/confluence/pages/viewpage.action?pageId=40&wcsNativeUi=1' }, { url: 'https://example.test/confluence/pages/viewpage.action?pageId=40&pageVersion=2' }, { url: 'https://example.test/confluence/pages/viewpage.action?pageId=40&preview=true' }, { config: { authoringMode: 'legacy' } }]) {
    const f = fixture(options); try { await f.advance(20000); assert.equal(f.calls.create.length, 0, JSON.stringify(options)); assert.equal(f.host(), null); assert.equal(f.timers.size, 0); } finally { f.close(); }
  }
});
test('visible articles defer requests for two seconds, never poll, and record once per activation', async () => {
  const f = fixture(); try {
    assert.equal(f.calls.load.length, 0); await f.advance(1999); assert.equal(f.calls.load.length, 0); await f.advance(1);
    assert.equal(f.calls.load.length, 1); assert.equal(f.calls.load[0][0], '40'); assert.equal(f.calls.record.length, 1); assert.equal(f.calls.prime.length, 1); assert.equal(f.calls.feedbackLoad.length, 0);
    assert.equal(f.calls.create[0].nativePublication.areaPageIds.credit, '20'); assert.equal(f.calls.create[0].nativePublication.insightsPageId, '50');
    assert.match(f.d.querySelector('.wcs-article-recorded-views').textContent, /^8 recorded views$/);
    await f.visibility('hidden'); await f.visibility('visible'); await f.advance(600000); assert.equal(f.calls.load.length, 1); assert.equal(f.calls.record.length, 1); assert.equal(f.calls.intervals, 0); assert.equal(f.timers.size, 0);
  } finally { f.close(); }
});
test('hidden tabs wait until visible and cancel the pending delay when hidden again', async () => {
  const f = fixture({ visibility: 'hidden' }); try {
    await f.advance(5000); assert.equal(f.calls.load.length, 0); await f.visibility('visible'); await f.advance(1000); await f.visibility('hidden'); await f.advance(3000); assert.equal(f.calls.load.length, 0);
    await f.visibility('visible'); await f.advance(1999); assert.equal(f.calls.load.length, 0); await f.advance(1); assert.equal(f.calls.record.length, 1);
  } finally { f.close(); }
});
test('helpfulness uses accessible inline SVG buttons and optimistic pressed state followed by confirmation', async () => {
  const saved = deferred(), f = fixture({ save: () => saved.promise }); try {
    await f.advance(2000); assert.equal(f.host().querySelectorAll('svg').length, 2); assert.equal(f.host().querySelectorAll('img').length, 0); assert.equal(f.button('yes').getAttribute('aria-label'), 'Helpful');
    f.button('yes').click(); assert.equal(f.button('yes').getAttribute('aria-pressed'), 'true'); assert.equal(f.button('yes').disabled, true); assert.match(f.host().textContent, /Saving/); assert.equal(f.calls.save.length, 1);
    f.button('no').click(); assert.equal(f.calls.save.length, 1);
    saved.resolve({ canVote: true, vote: 'yes' }); await tick(); assert.equal(f.button('yes').disabled, false); assert.equal(f.button('yes').getAttribute('aria-pressed'), 'true'); assert.match(f.host().textContent, /feedback is saved/); assert.equal(f.calls.notices.at(-1)[0], 'success');
    f.button('yes').click(); assert.equal(f.calls.save.length, 1, 'same selected value is not resubmitted');
  } finally { f.close(); }
});
test('definite rejection rolls back selection and permits retry without claiming success', async () => {
  const f = fixture({ save: async () => { throw Object.assign(Error('Native permission denied'), { outcome: 'rejected' }); } }); try {
    await f.advance(2000); f.button('yes').click(); await tick(); assert.equal(f.button('yes').getAttribute('aria-pressed'), 'false'); assert.equal(f.button('yes').disabled, false); assert.match(f.host().textContent, /permission denied/); assert.equal(f.calls.notices.at(-1)[0], 'error'); assert.equal(f.calls.save.length, 1);
  } finally { f.close(); }
});
test('unknown save blocks resubmission until explicit read-only check resolves saved feedback', async () => {
  const f = fixture({ save: async () => { throw Object.assign(Error('Lost reply'), { outcome: 'unknown' }); } }); try {
    await f.advance(2000); f.button('no').click(); await tick(); assert.equal(f.button('no').disabled, true); assert.equal(f.button('no').getAttribute('aria-pressed'), 'false');
    const check = [...f.host().querySelectorAll('button')].find(button => button.textContent === 'Check saved feedback'); assert.equal(check.hidden, false); assert.equal(f.calls.notices.at(-1)[0], 'warning');
    f.button('yes').click(); assert.equal(f.calls.save.length, 1); check.click(); await tick(); assert.equal(f.calls.feedbackLoad.length, 1); assert.equal(f.calls.save.length, 1); assert.equal(check.hidden, true); assert.equal(f.button('yes').disabled, false); assert.equal(f.button('yes').getAttribute('aria-pressed'), 'true');
  } finally { f.close(); }
});
test('unresolved read-only Check keeps both choices disabled and only an explicit original retry writes', async () => {
  let writes=0;const f=fixture({save:async value=>{if(++writes===1)throw Object.assign(Error('Lost reply'),{outcome:'unknown'});return{canVote:true,vote:value,pendingVote:null};},feedbackLoad:async()=>({canVote:true,vote:null,pendingVote:{value:'no'}})});try{
    await f.advance(2000);f.button('no').click();await tick();
    const check=[...f.host().querySelectorAll('button')].find(b=>b.textContent==='Check saved feedback'),retry=[...f.host().querySelectorAll('button')].find(b=>b.textContent==='Retry original vote');
    check.click();await tick();assert.equal(f.calls.save.length,1);assert.equal(check.hidden,false);assert.equal(retry.hidden,false);assert.equal(f.button('yes').disabled,true);assert.equal(f.button('no').disabled,true);assert.match(f.host().textContent,/original vote is still unconfirmed/);assert.doesNotMatch(f.host().textContent,/Saved feedback checked/);
    f.button('yes').click();assert.equal(f.calls.save.length,1);retry.click();await tick();assert.equal(f.calls.save.length,2);assert.equal(f.calls.save[1][0],'no');assert.equal(retry.hidden,true);assert.equal(check.hidden,true);assert.equal(f.button('no').getAttribute('aria-pressed'),'true');assert.match(f.host().textContent,/feedback is saved/);
  }finally{f.close();}
});
test('an old Check finishing after bfcache restore cannot clear the new vote busy state', async () => {
  const oldCheck=deferred(),newSave=deferred();let saves=0;const f=fixture({save:()=>++saves===1?Promise.reject(Object.assign(Error('Lost reply'),{outcome:'unknown'})):newSave.promise,feedbackLoad:()=>oldCheck.promise});try{
    await f.advance(2000);f.button('yes').click();await tick();[...f.host().querySelectorAll('button')].find(b=>b.textContent==='Check saved feedback').click();
    f.hide();f.show();await f.advance(2000);f.button('no').click();assert.equal(f.button('no').disabled,true);
    oldCheck.resolve({canVote:true,vote:'yes',pendingVote:null});await tick();assert.equal(f.button('no').disabled,true);assert.match(f.host().textContent,/Saving/);f.button('yes').click();assert.equal(f.calls.save.length,2);
    newSave.resolve({canVote:true,vote:'no',pendingVote:null});await tick();assert.equal(f.button('no').disabled,false);
  }finally{f.close();}
});
test('read-only native accounts see recorded count and honest reason without vote or view writes', async () => {
  const f = fixture({ data: { canVote: false, canRecord: false, reason: 'Native edit permission is required.' } }); try {
    await f.advance(2000); assert.equal(f.button('yes').disabled, true); assert.equal(f.button('no').disabled, true); assert.match(f.host().textContent, /Native edit permission/); assert.match(f.host().textContent, /7 recorded views/); f.button('yes').click(); assert.equal(f.calls.save.length, 0); assert.equal(f.calls.record.length, 0);
  } finally { f.close(); }
});
test('comments-disabled articles still render independent feedback and recorded views before discussion', async () => {
  const f = fixture({ data: { commentsEnabled: false } }); try {
    const discussion = f.d.createElement('div'); discussion.dataset.wcsArticleDiscussionHost = ''; discussion.textContent = 'Comments are disabled'; f.d.querySelector('#main-content').append(discussion);
    await f.advance(2000); assert.ok(f.host()); assert.equal(f.host().nextElementSibling, discussion); assert.equal(f.calls.record.length, 1); assert.equal(f.d.querySelector('#comments-section').textContent, 'Native comments');
  } finally { f.close(); }
});
test('native scope failures stay inert while transient failures show an unavailable notice without recordings', async () => {
  for (const code of ['OUT_OF_SCOPE', 'SCOPE', 'FORBIDDEN', 'CONFIGURATION', 'NOT_FOUND', 'NETWORK']) {
    const f = fixture({ load: async () => { throw Object.assign(Error('unavailable'), { code }); } }); try { await f.advance(2000); assert.equal(f.host(), null); assert.equal(f.calls.record.length, 0); assert.equal(!!f.d.querySelector('.wcs-engagement-unavailable'), code === 'NETWORK'); } finally { f.close(); }
  }
});
test('failed view recording retains the last known count and reports unavailable recording without fake increment', async () => {
  const f = fixture({ record: async () => { throw Object.assign(Error('Not confirmed'), { code: 'UNKNOWN_COMMIT' }); } }); try {
    await f.advance(2000); const count = f.d.querySelector('.wcs-article-recorded-views'); assert.match(count.textContent, /7 recorded views/); assert.match(count.textContent, /recording unavailable/); assert.match(count.title, /Not confirmed/); assert.equal(f.calls.record.length, 1);
  } finally { f.close(); }
});
test('bfcache hides abort pending work and reactivates once after the visibility delay', async () => {
  const f = fixture(); try {
    await f.advance(2000); assert.ok(f.host()); const signal = f.calls.load[0][1].signal; f.hide(); assert.equal(signal.aborted, true); assert.equal(f.host(), null); assert.equal(f.timers.size, 0);
    f.show(); await f.advance(1999); assert.equal(f.calls.load.length, 1); await f.advance(1); assert.equal(f.calls.load.length, 2); assert.equal(f.calls.record.length, 2); assert.equal(f.d.querySelectorAll('[data-wcs-article-engagement]').length, 1);
  } finally { f.close(); }
});
test('stale loads cannot mount or record after restored-page activation', async () => {
  const stale = deferred(); let loads = 0; const f = fixture({ load: async () => ++loads === 1 ? stale.promise : loaded() }); try {
    await f.advance(2000); f.hide(); f.show(); await f.advance(2000); assert.equal(f.calls.load.length, 2); assert.ok(f.host()); assert.equal(f.calls.record.length, 1);
    stale.resolve(loaded()); await tick(); assert.equal(f.d.querySelectorAll('[data-wcs-article-engagement]').length, 1); assert.equal(f.calls.record.length, 1);
  } finally { f.close(); }
});
test('an article hidden during metadata load can record after returning to a visible visit', async () => {
  const pending = deferred(); let loads = 0; const f = fixture({ load: async () => ++loads === 1 ? pending.promise : loaded() }); try {
    await f.advance(2000); await f.visibility('hidden'); pending.resolve(loaded()); await tick(); assert.equal(f.calls.record.length, 0);
    await f.visibility('visible'); await f.advance(2000); assert.equal(f.calls.record.length, 1, 'returning to the article must not permanently skip view recording');
  } finally { f.close(); }
});

test('helpfulness and view controls stay below the article when header includes contain wiki-content',async()=>{
 for(const fail of [false,true]){
  const f=fixture({markup:'<div id="navHeader"><div class="wiki-content"><div id="main-content">Header</div></div></div>',...(fail?{load:async()=>{throw Object.assign(Error('Unavailable'),{code:'NETWORK'});}}:{})});
  try {await f.advance(2000);assert.equal(f.d.querySelector('#navHeader [data-wcs-article-engagement],#navHeader .wcs-engagement-unavailable'),null);const host=f.host()||f.d.querySelector('.wcs-engagement-unavailable');assert.ok(host);assert.equal(host.parentElement.textContent.startsWith('Article'),true);}finally{f.close();}
 }
});
