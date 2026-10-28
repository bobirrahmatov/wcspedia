'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const health = require('../content-health.js');
const seed = require('../wcspedia-data.json');
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(overrides = {}) {
  const dom = new JSDOM('<div id="wcspedia"><div class="shell"></div></div>', {
    url: 'https://example.test/confluence/pages/viewpage.action?pageId=100',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, host = w.document.querySelector('#wcspedia');
  w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  for (const file of ['ui.js', 'data-table.js', 'pagination.js', 'content-health-ui.js', 'library-workflows.js']) {
    w.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  }
  const managed = copy(seed.documents.find(doc => doc.publishedVersion));
  managed.nativeSessionWorkflow = true;
  const unmanaged = copy(managed);
  unmanaged.id = 'native-unmanaged-page';
  unmanaged.nativeSessionWorkflow = false;
  unmanaged.nativePage = true;
  unmanaged.reference = 'Native article';
  unmanaged.versions.find(v => v.version === unmanaged.publishedVersion).title = 'Unmanaged native article';
  const people = copy(seed.people), actor = people.find(person => person.role === 'Manager');
  const events = [], notices = [], evaluated = [], context = {
    documents: [managed, unmanaged], people, actor,
    identity: { soeid: actor.soeid }, canRead: () => true, canEdit: () => true
  };
  w.WCSContentHealth = Object.assign({}, health, {
    evaluate(doc, record, options) { evaluated.push(doc.id); return health.evaluate(doc, record, options); }
  });
  const service = Object.assign({
    supports: doc => doc.nativeSessionWorkflow === true,
    async load() { events.push('load'); return {}; },
    async recover(id) { events.push('recover:' + id); },
    async submit() { throw Error('Unexpected health mutation'); }
  }, overrides);
  w.WCSHealthService = { create: () => service };
  w.WCSBookmarks = { create: () => ({
    load: async () => ({ available: true, bookmarks: [], revision: 0 }), resolve: () => []
  }) };
  let handle;
  const options = {
    container: host, config: { mode: 'confluence', authoringMode: 'confluence-session' },
    context: () => context, url: route => '#' + route,
    documentHref: (doc, tab) => '#/document/' + doc.id + '/' + tab,
    publishedVersion: doc => doc.versions.find(v => v.version === doc.publishedVersion && v.status === 'Published'),
    date: value => value, go() {},
    refresh() { events.push('refresh'); handle.mount(host); },
    notify(message, options) { notices.push({ message, type: options.type }); }
  };
  handle = w.WCSLibraryWorkflows.create(options);
  function mount(doc = managed) {
    host.querySelector('.shell').innerHTML = '<div data-content-health="' + doc.id + '"></div>';
    handle.mount(host);
    return host.querySelector('[data-content-health]');
  }
  return { w, host, managed, unmanaged, context, service, handle, events, notices, evaluated, mount,
    close() { handle.destroy(); w.WCSUI.destroy(host); dom.window.close(); } };
}

test('native health never invents a default health report for an unmanaged published page', async () => {
  const f = fixture();
  try {
    await f.handle.load();
    assert.equal(f.handle.report(f.unmanaged), null);
    assert.match(f.handle.tag(f.unmanaged), /Not managed/);
    assert.doesNotMatch(f.handle.tag(f.unmanaged), /Healthy|Default rules/);
    assert.deepEqual(f.evaluated, []);
    assert.ok(f.handle.report(f.managed));
    assert.deepEqual(f.evaluated, [f.managed.id]);
  } finally { f.close(); }
});

test('the native health worklist excludes unmanaged pages even for an account allowed to edit them', async () => {
  const f = fixture();
  try {
    await f.handle.load();
    f.host.querySelector('.shell').innerHTML = f.handle.workspace('health', new URLSearchParams());
    const rows = Array.from(f.host.querySelectorAll('[data-record-key]'), row => row.dataset.recordKey);
    assert.deepEqual(rows, [f.managed.id]);
    assert.doesNotMatch(f.host.textContent, /Unmanaged native article/);
    assert.match(f.host.querySelector('.library-count').textContent, /^1 document$/);
  } finally { f.close(); }
});

test('unmanaged native content shows an explanation with no editable health controls', async () => {
  const f = fixture();
  try {
    await f.handle.load();
    const managedHost = f.mount(f.managed);
    assert.ok(managedHost.querySelector('[data-health-action="update-rules"]'), 'The fixture has real manager controls for a managed document');
    const unmanagedHost = f.mount(f.unmanaged);
    assert.match(unmanagedHost.textContent, /Content health is not managed for this page/);
    assert.equal(unmanagedHost.querySelector('[data-health-action], form, input, button'), null);
    assert.equal(f.w.document.querySelector('[role="dialog"]'), null);
  } finally { f.close(); }
});

test('Try again reconciles the original native pending save before loading and presenting saved rules', async () => {
  let calls = 0, finishRecovery;
  const f = fixture({
    async load() {
      f.events.push('load');
      if (++calls === 1) throw Object.assign(Error('The previous save needs confirmation.'), { recoveryDocumentId: f.managed.id });
      return {};
    },
    recover(id) { f.events.push('recover:' + id); return new Promise(resolve => { finishRecovery = resolve; }); }
  });
  try {
    await f.handle.load();
    const content = f.mount(), retry = content.querySelector('[data-library-action="retry"]');
    assert.match(content.textContent, /previous save needs confirmation/);
    assert.equal(content.querySelector('[data-health-action]'), null);
    retry.click();
    await tick();
    assert.deepEqual(f.events, ['load', 'recover:' + f.managed.id]);
    assert.equal(retry.disabled, true);
    assert.deepEqual(f.notices, []);
    finishRecovery();
    await tick();
    assert.deepEqual(f.events, ['load', 'recover:' + f.managed.id, 'load', 'refresh']);
    assert.ok(content.querySelector('[data-health-action="update-rules"]'));
    assert.deepEqual(f.notices, [{ message: 'Content health refreshed.', type: 'success' }]);
  } finally { f.close(); }
});

test('an unresolved pending save remains retryable without a false load or success notification', async () => {
  const f = fixture({
    async load() { f.events.push('load'); throw Object.assign(Error('Unconfirmed original save.'), { recoveryDocumentId: f.managed.id }); },
    async recover(id) { f.events.push('recover:' + id); throw Error('The original save is still unconfirmed.'); }
  });
  try {
    await f.handle.load();
    const content = f.mount(), retry = content.querySelector('[data-library-action="retry"]');
    retry.click();
    await tick();
    assert.deepEqual(f.events, ['load', 'recover:' + f.managed.id]);
    assert.equal(retry.disabled, false);
    assert.equal(content.querySelector('[data-health-action]'), null);
    assert.deepEqual(f.notices, [{ message: 'The original save is still unconfirmed.', type: 'error' }]);
    retry.click();
    await tick();
    assert.equal(f.events.filter(event => event.startsWith('recover:')).length, 2);
    assert.equal(f.notices.some(notice => notice.type === 'success'), false);
  } finally { f.close(); }
});

test('read failures without an owned pending operation only reload; they never invoke recovery', async () => {
  let attempts = 0;
  const f = fixture({ async load() { f.events.push('load'); if (++attempts === 1) throw Error('Read temporarily unavailable.'); return {}; } });
  try {
    await f.handle.load();
    f.mount().querySelector('[data-library-action="retry"]').click();
    await tick();
    assert.deepEqual(f.events, ['load', 'load', 'refresh']);
    assert.equal(f.notices.at(-1).type, 'success');
  } finally { f.close(); }
});

test('legacy health services without supports retain their existing document health behavior', async () => {
  const f = fixture({ supports: undefined });
  try {
    await f.handle.load();
    assert.ok(f.handle.report(f.unmanaged));
    assert.ok(f.mount(f.unmanaged).querySelector('[data-health-action="update-rules"]'));
  } finally { f.close(); }
});

test('Saved-only idle refresh does not discard an independent health read already in flight',async()=>{
  let finish;
  const f=fixture({load:()=>new Promise(resolve=>finish=resolve)});
  try{
    const initial=f.handle.load();await tick();
    await f.handle.load(false,{bookmarksOnly:true});finish({});await initial;
    assert.ok(f.handle.report(f.managed),'The original health response is still accepted');
  }finally{f.close();}
});
