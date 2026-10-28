'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'page-style-flags.js'), 'utf8');
const all = ['hide-title', 'hide-actions', 'hide-comments', 'hide-footer'];
const child = '<article id="child-document" data-wcs-document-page data-wcs-style-flags><h1>Child document</h1></article>';
const nativeAnchor = '<span class="confluence-anchor-link" id="Page-wcs-page-style-v1"></span><h1>Child document</h1>';
const app = '<div id="wcspedia" data-wcs-page-role="home" data-wcs-style-flags><h1>WCSpedia</h1></div>';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(t, { html = child, url = 'https://example.test/confluence/pages/viewpage.action?pageId=100', classes = '', meta = '' } = {}) {
  const dom = new JSDOM('<!doctype html><head>' + meta + '</head><body class="' + classes + '"><main id="main-content">' + html + '</main></body>', { url, runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  let requests = 0;
  w.fetch = () => { requests++; throw Error('Presentation must not fetch'); };
  w.styleCalls = [];
  w.citiStyleAdd = (...flags) => { w.styleCalls.push(['add', ...flags]); flags.forEach(flag => d.body.classList.add('citi-' + flag)); };
  w.citiStyleRemove = (...flags) => { w.styleCalls.push(['remove', ...flags]); flags.forEach(flag => d.body.classList.remove('citi-' + flag)); };
  w.eval(source);
  t.after(() => { w.WCSPageStyleFlags.destroy(); w.close(); });
  return { dom, w, d, api: w.WCSPageStyleFlags, classes: () => all.filter(flag => (d.body.getAttribute('data-wcs-active-style-flags')||'').split(' ').includes(flag)), get requests() { return requests; } };
}
test('explicit child document applies exactly four CSS flags without the host API without requests or duplicate initialization', t => {
  const f = fixture(t, { classes: 'citi-hide-sidebar other-theme-class' });
  assert.deepEqual(f.classes(), all);
  assert.equal(f.requests, 0);
  assert.deepEqual(f.w.styleCalls, []);assert.equal(f.d.body.classList.contains('citi-hide-title'),false);
  f.w.eval(source);
  assert.equal(f.w.WCSPageStyleFlags, f.api);
  assert.ok(f.d.querySelector('#child-document h1'));
  assert.ok(f.d.body.classList.contains('citi-hide-sidebar'));
  assert.ok(f.d.body.classList.contains('other-theme-class'));
});
test('application pages ignore both legacy and explicit document flags', t => {
  for (const role of ['home', 'workspace', 'reviewer', 'saved', 'entitlements']) {
    const html = '<div id="wcspedia" data-wcs-page-role="' + role + '" data-wcs-document-page data-wcs-style-flags="hide-title hide-actions hide-comments hide-footer"><h1>App page</h1></div>' + nativeAnchor + child;
    const f = fixture(t, { html });
    assert.deepEqual(f.classes(), []);
    assert.equal(f.requests, 0);
  }
  const legacy = fixture(t, { html: app }); assert.deepEqual(legacy.classes(), []);
});
test('generic style markers do not opt in unmarked pages', t => {
  const f = fixture(t, { html: '<div data-wcs-style-flags>Unmarked content</div>' });
  assert.deepEqual(f.classes(), []);
});
test('a dynamically mounted application restores the host chrome', async t => {
  const f = fixture(t, { html: nativeAnchor }); await tick();
  assert.deepEqual(f.classes(), all);
  f.d.getElementById('main-content').insertAdjacentHTML('beforeend', app); await tick();
  assert.deepEqual(f.classes(), []);
});
test('removing the document designation removes its flags', async t => {
  const f = fixture(t); await tick();
  f.d.getElementById('child-document').removeAttribute('data-wcs-document-page'); await tick();
  assert.deepEqual(f.classes(), []);
});
test('only an explicit subset is applied; unknown flags cannot change the sidebar', t => {
  const f = fixture(t, { html: '<div data-wcs-document-page data-wcs-style-flags="hide-title, hide-footer hide-sidebar arbitrary-class">Document</div>' });
  assert.deepEqual(f.classes(), ['hide-title', 'hide-footer']);
  assert.equal(f.d.body.classList.contains('citi-hide-sidebar'), false);
});
test('a native rendered Anchor activates the flags on supported page-view URLs', t => {
  for (const [tag, attr] of [['span', 'id'], ['a', 'id'], ['a', 'name']]) {
    const f = fixture(t, { html: '<' + tag + ' class="confluence-anchor-link" ' + attr + '="PageTitle-wcs-page-style-v1"></' + tag + '><h1>Document title</h1>', url: 'https://example.test/confluence/display/WCS/Document' });
    assert.deepEqual(f.classes(), all);
  }
  const f = fixture(t, { url: 'https://example.test/confluence/spaces/WCS/pages/123/Document' });
  assert.deepEqual(f.classes(), all);
});
test('unmarked pages, markers outside content, and markers in code/editor previews do nothing', t => {
  for (const html of ['<h1>Ordinary page</h1>', '<pre><span data-wcs-document-page data-wcs-style-flags></span></pre>', '<code><span class="confluence-anchor-link" id="Page-wcs-page-style-v1"></span></code>', '<div contenteditable="true">' + child + '</div>', '<div class="macro-preview">' + child + '</div>']) {
    const f = fixture(t, { html }); assert.deepEqual(f.classes(), []);
  }
  const f = fixture(t, { html: '' });
  f.d.body.insertAdjacentHTML('beforeend', '<aside data-wcs-document-page data-wcs-style-flags></aside>');
  assert.deepEqual(Array.from(f.api.refresh()), []);
});
test('native editor, preview, history, admin and recovery query never activate flags', t => {
  const paths = ['/confluence/pages/editpage.action?pageId=100', '/confluence/pages/createpage.action', '/confluence/pages/viewpreviousversions.action?pageId=100', '/confluence/admin/pages/viewpage.action?pageId=100', '/confluence/pages/viewpage.action?pageId=100&preview=true', '/confluence/pages/viewpage.action?pageId=100&mode=edit', '/confluence/pages/viewpage.action?pageId=100&pageVersion=3', '/confluence/pages/viewpage.action?pageId=100&wcsNativeUi=1'];
  for (const url of paths) { const f = fixture(t, { url: 'https://example.test' + url }); assert.deepEqual(f.classes(), []); }
  const f = fixture(t, { meta: '<meta name="ajs-action" content="editpage">' }); assert.deepEqual(f.classes(), []);
});
test('iframes never activate host presentation flags', t => {
  const f = fixture(t, { html: '<iframe></iframe>' });
  const frame = f.d.querySelector('iframe').contentWindow;
  frame.document.body.innerHTML = child;
  frame.eval(source);
  assert.equal(frame.document.body.classList.contains('citi-hide-title'), false);
  frame.WCSPageStyleFlags.destroy();
});
test('late markup activates, removal restores the host, and none overrides other markers', async t => {
  const f = fixture(t, { html: '' }); await tick();
  const content = f.d.getElementById('main-content');
  content.innerHTML = child; await tick(); assert.deepEqual(f.classes(), all);
  content.insertAdjacentHTML('beforeend', '<div data-wcs-document-page data-wcs-style-flags="none"></div>');
  await tick(); assert.deepEqual(f.classes(), []);
  content.lastElementChild.remove(); await tick(); assert.deepEqual(f.classes(), all);
  content.innerHTML = ''; await tick(); assert.deepEqual(f.classes(), []);
});
test('preexisting classes survive opt-out, navigation and destroy; only owned flags are removed', t => {
  const f = fixture(t, { classes: 'citi-hide-comments citi-hide-sidebar' });
  f.d.getElementById('child-document').setAttribute('data-wcs-style-flags', 'none');
  f.api.refresh(); assert.deepEqual(f.classes(), []);assert.ok(f.d.body.classList.contains('citi-hide-comments'));
  f.d.getElementById('child-document').setAttribute('data-wcs-style-flags', ''); f.api.refresh();
  f.w.history.pushState({}, '', '/confluence/pages/editpage.action?pageId=100'); f.api.refresh();
  assert.deepEqual(f.classes(), []);assert.ok(f.d.body.classList.contains('citi-hide-comments'));
  f.api.destroy(); assert.deepEqual(f.classes(), []);assert.ok(f.d.body.classList.contains('citi-hide-comments'));
  assert.ok(f.d.body.classList.contains('citi-hide-sidebar'));
});
test('pagehide releases flags and pageshow reapplies, but destroy stays destroyed', t => {
  const f = fixture(t);
  f.w.dispatchEvent(new f.w.Event('pagehide')); assert.deepEqual(f.classes(), []);
  f.w.dispatchEvent(new f.w.Event('pageshow')); assert.deepEqual(f.classes(), all);
  f.api.destroy(); f.w.dispatchEvent(new f.w.Event('pageshow'));
  assert.deepEqual(f.classes(), []); assert.deepEqual(Array.from(f.api.refresh()), []);
});
test('editor action metadata changes remove flags and edited marker attributes are respected', async t => {
  const f = fixture(t, { meta: '<meta name="ajs-action" content="viewpage">' }); await tick();
  f.d.getElementById('child-document').setAttribute('data-wcs-style-flags', 'hide-footer');
  await tick(); assert.deepEqual(f.classes(), ['hide-footer']);
  f.d.querySelector('meta').setAttribute('content', 'editpage');
  await tick(); assert.deepEqual(f.classes(), []);
});
test('entering an in-place native content editor restores host controls', async t => {
  const f = fixture(t); await tick();
  f.d.body.classList.add('contenteditor'); await tick();
  assert.deepEqual(f.classes(), []);
  assert.ok(f.d.body.classList.contains('contenteditor'));
});
test('unmarked startup observation ends after the bounded readiness window', async t => {
  const f = fixture(t, { html: '' }); await tick();
  // A controlled clock verifies the helper has one deadline, no polling, and
  // does not keep observing unrelated Confluence pages after readiness.
  f.api.destroy(); delete f.w.WCSPageStyleFlags;
  const timers = new Map(); let next = 1;
  f.w.setTimeout = (callback, ms) => { assert.equal(ms, 5000); const id = next++; timers.set(id, callback); return id; };
  f.w.clearTimeout = id => timers.delete(id);
  f.w.eval(source); assert.equal(timers.size, 1);
  const callback = timers.values().next().value; timers.clear(); callback();
  f.d.getElementById('main-content').innerHTML = child; await tick();
  assert.deepEqual(f.classes(), []); assert.equal(timers.size, 0);
  assert.deepEqual(Array.from(f.w.WCSPageStyleFlags.refresh()), all);
});

test('native anchors without theme classes enable the scoped CSS hook', t => {
 const f=fixture(t,{html:'<a id="Document-wcs-page-style-v1"></a><h1>Article heading</h1>'});
 assert.deepEqual(f.classes(),all);assert.equal(f.d.body.getAttribute('data-wcs-active-style-flags'),all.join(' '));
 f.api.destroy();assert.equal(f.d.body.hasAttribute('data-wcs-active-style-flags'),false);
});
test('theme class replacement restores active article flags without replacing other classes', async t => {
 const f=fixture(t);await tick();f.d.body.className='theme-loaded';await tick();
 assert.deepEqual(f.classes(),all);assert.ok(f.d.body.classList.contains('theme-loaded'));
});
test('shared CSS hides native chrome but preserves article and navigation content', t => {
 const f=fixture(t),style=f.d.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'..','page-style-flags.css'),'utf8');f.d.head.append(style);
 f.d.body.insertAdjacentHTML('beforeend','<nav id="navBar">Navigation</nav><div id="title-heading">Native title</div><div id="comments-section">Native comments</div><div id="footer">Footer</div><div id="wcs-discussion">Article comments</div>');
 for(const id of ['title-heading','comments-section','footer'])assert.equal(f.w.getComputedStyle(f.d.getElementById(id)).display,'none');
 for(const selector of ['#navBar','#child-document h1','#wcs-discussion'])assert.notEqual(f.w.getComputedStyle(f.d.querySelector(selector)).display,'none');
 f.api.destroy();assert.notEqual(f.w.getComputedStyle(f.d.getElementById('title-heading')).display,'none');
});

test('late-loaded host functions are never called', async t => {
 const f=fixture(t);f.api.destroy();delete f.w.WCSPageStyleFlags;delete f.w.citiStyleAdd;delete f.w.citiStyleRemove;
 f.w.eval(source);assert.deepEqual(f.classes(),all);
 const calls=[];f.w.citiStyleAdd=(...flags)=>calls.push(flags);
 const script=f.d.createElement('script');f.d.body.appendChild(script);script.dispatchEvent(new f.w.Event('load'));
 assert.equal(calls.length,0);f.w.WCSPageStyleFlags.refresh();assert.equal(calls.length,0);
 f.w.WCSPageStyleFlags.destroy();
});

test('native page labels activate only the requested flags, without markup markers or a request', t => {
 const f=fixture(t,{html:'<h1>Article</h1><div id="labels-section"><span class="aui-label"><a>hide-title</a></span><span class="aui-label"><a>hide-footer</a></span><a>unrelated</a></div>'});
 assert.deepEqual(f.classes(),['hide-title','hide-footer']);assert.equal(f.requests,0);
});
test('label-like article text is not a native page label; application pages remain unchanged',t=>{
 const f=fixture(t,{html:'<p><a>hide-title</a></p>'});assert.deepEqual(f.classes(),[]);
 const g=fixture(t,{html:app+'<div id="labels-section"><a>hide-title</a></div>'});assert.deepEqual(g.classes(),[]);
});
test('a native publication provides the same reader link without a redirect or request',t=>{
 const f=fixture(t,{html:'<script type="application/json" id="wcs-published-reader" data-wcs-reader-root="50">{"format":1,"pageId":"100"}</script>'});
 assert.equal(f.d.querySelector('#wcs-open-published-reader').getAttribute('href'),'/confluence/pages/viewpage.action?pageId=50#/published/100');
 f.api.refresh();assert.equal(f.d.querySelectorAll('#wcs-open-published-reader').length,1);assert.equal(f.requests,0);
});

test('native tree removes only the generated suffix matching the linked page, including late tree rows', async t=>{
 const f=fixture(t,{html:child+'<aside id="sidebar"><a href="/confluence/spaces/wcspedia/pages/900/Blog"><span>Blog · WCS 900</span></a><a href="/confluence/pages/viewpage.action?pageId=901">Keep · WCS 900</a></aside>'});
 const tree=f.d.querySelector('#sidebar');assert.equal(tree.children[0].textContent,'Blog');assert.equal(tree.children[1].textContent,'Keep · WCS 900');
 assert.equal(tree.children[0].getAttribute('href'),'/confluence/spaces/wcspedia/pages/900/Blog');
 tree.insertAdjacentHTML('beforeend','<a href="/confluence/pages/viewpage.action?pageId=902">Report · WCS 902</a>');await tick();
 assert.equal(tree.lastChild.textContent,'Report');assert.equal(f.requests,0);
 tree.insertAdjacentHTML('beforeend','<a href="/confluence/pages/viewpage.action?pageId=123#/published/903">Guide · WCS 903</a>');await tick();assert.equal(tree.lastChild.textContent,'Guide');
 f.api.destroy();assert.equal(tree.children[0].textContent,'Blog · WCS 900');
});
