/* NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/notifications.test.cjs */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'notifications.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'notifications.css'), 'utf8');
const flashKey = 'wcspedia.notification.nextPage.v1';

function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button id="trigger">Save</button><div id="wcspedia" style="overflow:auto;transform:translateZ(0)"></div></body></html>', {url: options.url || 'https://example.test/confluence/pages/viewpage.action?pageId=1', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, d = w.document, timers = new Map();
  let now = options.now || 0, timerId = 0, hidden = false;
  w.Date.now = () => now;
  w.setTimeout = (fn, delay = 0) => { const id = ++timerId; timers.set(id, {at: now + delay, fn}); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.matchMedia = () => ({matches: !!options.reducedMotion});
  Object.defineProperty(d, 'hidden', {get: () => hidden, configurable: true});
  let readyState = options.beforeBody || options.loadingDocument ? 'loading' : 'complete';
  Object.defineProperty(d, 'readyState', {get: () => readyState, configurable: true});
  if (options.bootState) d.getElementById('wcspedia').innerHTML = '<div class="boot-state" role="status">Loading…</div>';
  if (options.noRoot) d.getElementById('wcspedia').remove();
  if (options.queue) w.WCSNotificationQueue = options.queue;
  if (options.flash) w.sessionStorage.setItem(flashKey, options.flash);
  if (options.beforeBody) d.body.remove();
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = Array.from(timers.entries()).filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  w.eval(source);
  return {w, d, api: w.WCSNotifications, timers, advance,
    ready() { readyState = 'complete'; d.dispatchEvent(new w.Event('DOMContentLoaded')); },
    hidden(value) { hidden = value; d.dispatchEvent(new w.Event('visibilitychange')); },
    toast(id) { return d.getElementById(id); },
    close() { w.WCSNotifications.dismissAll(); dom.window.close(); }
  };
}

test('body portal survives root replacement and displays four explicit safe variants', () => {
  const f = fixture();
  try {
    const ids = ['success', 'error', 'warning', 'info'].map(type => f.api[type]('<img src=x onerror="alert(1)"> ' + type, {duration: 0}));
    const host = f.d.getElementById('wcs-notifications');
    assert.equal(host.parentElement, f.d.body);
    assert.equal(host.getAttribute('role'), 'region');
    assert.equal(host.hidden, false);
    f.d.getElementById('wcspedia').replaceChildren();
    for (const [index, type] of ['success', 'error', 'warning', 'info'].entries()) {
      const toast = f.toast(ids[index]);
      assert.equal(toast.dataset.notificationType, type);
      assert.equal(toast.querySelector('img'), null);
      assert.match(toast.querySelector('p').textContent, /<img src=x/);
      assert.equal(toast.querySelector('button').type, 'button');
      assert.match(toast.querySelector('button').getAttribute('aria-label'), /Dismiss/);
    }
    assert.equal(f.d.querySelectorAll('#wcs-notifications body, #wcs-notifications meta, #wcs-notifications header').length, 0);
  } finally { f.close(); }
});

test('polite and assertive live regions announce plain text without stealing focus', () => {
  const f = fixture();
  try {
    const trigger = f.d.getElementById('trigger'); trigger.focus();
    f.api.success('Saved.'); f.api.error('Could not save.');
    assert.equal(f.d.activeElement, trigger);
    assert.equal(f.d.querySelector('[aria-live=polite]').textContent, '');
    f.advance(20);
    assert.equal(f.d.querySelector('[aria-live=polite]').textContent, 'Success: Saved.');
    assert.equal(f.d.querySelector('[aria-live=assertive]').textContent, 'Error: Could not save.');
    f.advance(1000);
    assert.equal(f.d.querySelector('[aria-live=polite]').textContent, '');
    assert.equal(f.d.querySelector('[aria-live=assertive]').textContent, '');
  } finally { f.close(); }
});

test('duplicate script evaluation preserves singleton, active notices and drained queue', () => {
  const queue = [{message: 'Saved before header loaded.', options: {type: 'success', duration: 0}}];
  const f = fixture({queue});
  try {
    assert.equal(queue.length, 0);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 1);
    const timers = f.timers.size;
    f.w.eval(source);
    assert.equal(f.w.WCSNotifications, f.api);
    assert.equal(f.d.querySelectorAll('#wcs-notifications').length, 1);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 1);
    assert.equal(f.timers.size, timers);
  } finally { f.close(); }
});

test('head-loaded script queues notices until the document body becomes available', () => {
  const f = fixture({beforeBody: true});
  try {
    const id = f.api.info('Page is ready.', {duration: 0});
    assert.equal(f.toast(id), null);
    const body = f.d.createElement('body'); f.d.documentElement.append(body);
    f.d.dispatchEvent(new f.w.Event('DOMContentLoaded'));
    assert.equal(f.toast(id).parentElement.parentElement.parentElement, body);
    assert.equal(f.d.querySelectorAll('#wcs-notifications').length, 1);
  } finally { f.close(); }
});

test('repeated active messages dedupe and renew expiry rather than filling the stack', () => {
  const f = fixture();
  try {
    const id = f.api.success('Saved.', {duration: 1000});
    f.advance(800);
    assert.equal(f.api.success('Saved.', {duration: 1000}), id);
    f.advance(300);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 1);
    assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), false);
    f.advance(700);
    assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), true);
    f.advance(180);
    assert.equal(f.toast(id), null);
    assert.equal(f.timers.size, 0);
  } finally { f.close(); }
});

test('hover and keyboard focus pause expiry independently and preserve remaining time', () => {
  const f = fixture();
  try {
    const id = f.api.info('Read this.', {duration: 1000}), toast = f.toast(id), button = toast.querySelector('button');
    f.advance(400);
    toast.dispatchEvent(new f.w.MouseEvent('mouseenter'));
    button.focus();
    f.advance(2000);
    toast.dispatchEvent(new f.w.MouseEvent('mouseleave'));
    f.advance(2000);
    assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), false);
    f.d.getElementById('trigger').focus();
    f.advance(599);
    assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), false);
    f.advance(181);
    assert.equal(f.toast(id), null);
  } finally { f.close(); }
});

test('background tabs pause notices and resume the remaining display duration', () => {
  const f = fixture();
  try {
    const id = f.api.warning('Review the changes.', {duration: 1000});
    f.advance(200); f.hidden(true); f.advance(30000);
    assert.ok(f.toast(id));
    f.hidden(false); f.advance(799);
    assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), false);
    f.advance(181); assert.equal(f.toast(id), null);
  } finally { f.close(); }
});

test('close control restores prior focus and reduced motion removes immediately', () => {
  const f = fixture({reducedMotion: true});
  try {
    const trigger = f.d.getElementById('trigger'); trigger.focus();
    const id = f.api.error('Something failed.', {duration: 0}), button = f.toast(id).querySelector('button');
    button.focus(); button.click();
    assert.equal(f.toast(id), null);
    assert.equal(f.d.activeElement, trigger);
    assert.equal(f.d.getElementById('wcs-notifications').hidden, true);
    assert.equal(f.timers.size, 0);
    assert.equal(f.api.dismiss(id), false);
  } finally { f.close(); }
});

test('bursts keep four notices, protect keyboard focus and clean retired timers', () => {
  const f = fixture();
  try {
    const protectedId = f.api.info('First.', {duration: 0});
    f.toast(protectedId).querySelector('button').focus();
    for (let index = 0; index < 20; index++) f.api.success('Saved ' + index, {duration: 0});
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 4);
    assert.ok(f.toast(protectedId));
    assert.equal(f.timers.size, 4);
    f.advance(1020);
    assert.equal(f.timers.size, 0);
    f.api.dismissAll();
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    assert.equal(f.timers.size, 0);
  } finally { f.close(); }
});

test('zero duration is persistent and pagehide clears all timers and notices', () => {
  const f = fixture();
  try {
    const id = f.api.error('Needs attention.', {duration: 0});
    f.advance(120000); assert.ok(f.toast(id));
    f.api.success('Saved.'); f.api.warning('Check it.');
    f.w.dispatchEvent(new f.w.Event('pagehide'));
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    assert.equal(f.timers.size, 0);
  } finally { f.close(); }
});

test('invalid options have safe defaults and empty messages create no notices', () => {
  const f = fixture();
  try {
    assert.equal(f.api.show(null), null); assert.equal(f.api.show('   '), null);
    const id = f.api.show('Hello.', {type: '__proto__', duration: -10});
    assert.equal(f.toast(id).dataset.notificationType, 'info');
    f.advance(1180); assert.equal(f.toast(id), null);
    const error = f.api.error('Failed.', {type: 'success', duration: 0});
    assert.equal(f.toast(error).dataset.notificationType, 'error');
  } finally { f.close(); }
});

test('notification styles remain scoped, fixed above the app and reduced-motion aware', () => {
  assert.match(css, /#wcs-notifications\s*\{[\s\S]*?position:\s*fixed !important/);
  assert.match(css, /\.wcs-notification-success\s*\{[^}]*--wcs-notice-bg:\s*#187343/);
  assert.match(css, /\.wcs-notification-error\s*\{[^}]*--wcs-notice-bg:\s*#b52c2c/);
  assert.match(css, /\.wcs-notification-warning\s*\{[^}]*--wcs-notice-bg:\s*#ffdc85/);
  assert.match(css, /--wcs-notice-bg:\s*#ffffff/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /button\.wcs-notification-close:focus-visible/);
  assert.match(css, /overflow-y:\s*auto !important/);
  assert.match(css, /overscroll-behavior:\s*contain !important/);
  assert.match(css, /animation:\s*wcs-notification-enter 220ms ease-out both !important/);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:body|html|\.button)\s*\{/);
});

test('native navigation feedback appears once on the exact destination page', () => {
  const first = fixture(), destination = 'https://example.test/confluence/pages/viewpage.action?pageId=2';
  let next;
  try {
    assert.equal(first.api.forNextPage('Draft saved.', {type: 'success', destination}), true);
    assert.equal(first.d.querySelectorAll('.wcs-notification').length, 0);
    next = fixture({url: destination, flash: first.w.sessionStorage.getItem(flashKey), now: 1000});
    assert.equal(next.d.querySelector('.wcs-notification').dataset.notificationType, 'success');
    assert.equal(next.d.querySelector('.wcs-notification-message').textContent, 'Draft saved.');
    assert.equal(next.w.sessionStorage.getItem(flashKey), null);
    next.w.eval(source);
    assert.equal(next.d.querySelectorAll('.wcs-notification').length, 1);
  } finally { next?.close(); first.close(); }
});

test('navigation feedback rejects external, script and credential URLs and unavailable storage', () => {
  const f = fixture();
  try {
    for (const destination of ['https://outside.test/page', 'javascript:alert(1)', 'data:text/html,test', 'https://name:password@example.test/page', '']) {
      assert.equal(f.api.forNextPage('Saved.', {type: 'success', destination}), false);
    }
    assert.equal(f.w.sessionStorage.getItem(flashKey), null);
    Object.defineProperty(f.w, 'sessionStorage', {get() { throw Error('Storage unavailable'); }});
    assert.equal(f.api.forNextPage('Saved.', {destination: '/confluence/page/2'}), false);
    assert.ok(f.api.success('Saved on this page.'));
  } finally { f.close(); }
});

test('stale and invalid navigation notices are removed, unrelated destinations do not announce', () => {
  const target = 'https://example.test/confluence/pages/viewpage.action?pageId=2';
  const valid = {destination: target, message: 'Draft saved.', type: 'success', createdAt: 0};
  for (const [flash, now] of [[JSON.stringify(valid), 60001], [JSON.stringify({...valid, destination: 'https://outside.test/page'}), 0], ['{broken-json', 0], [JSON.stringify({...valid, createdAt: 2000}), 1000]]) {
    const f = fixture({flash, now, url: target});
    try { assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0); assert.equal(f.w.sessionStorage.getItem(flashKey), null); }
    finally { f.close(); }
  }
  const unrelated = fixture({flash: JSON.stringify(valid), now: 1000});
  try {
    assert.equal(unrelated.d.querySelectorAll('.wcs-notification').length, 0);
    assert.equal(unrelated.w.sessionStorage.getItem(flashKey), JSON.stringify(valid));
  } finally { unrelated.close(); }
});

test('navigation feedback waits for DOM and application boot, then receives its full duration', async () => {
  const url = 'https://example.test/confluence/pages/viewpage.action?pageId=2';
  const flash = JSON.stringify({destination: url, message: 'Draft saved.', type: 'success', createdAt: 0});
  const f = fixture({url, flash, now: 1000, loadingDocument: true, bootState: true});
  try {
    assert.equal(f.w.sessionStorage.getItem(flashKey), null);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    f.ready();
    f.advance(10000);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    const root = f.d.getElementById('wcspedia'), overlay = f.d.createElement('div');
    overlay.className = 'wcs-loading-overlay';
    root.setAttribute('aria-busy', 'true'); root.setAttribute('inert', '');
    root.replaceChildren(); f.d.body.append(overlay);
    await Promise.resolve();
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    f.advance(70000);
    overlay.remove(); root.removeAttribute('aria-busy'); root.removeAttribute('inert');
    await Promise.resolve();
    const toast = f.d.querySelector('.wcs-notification');
    assert.ok(toast);
    assert.equal(f.d.getElementById('wcs-notifications').hidden, false);
    f.advance(4499); assert.equal(toast.classList.contains('wcs-notification-leaving'), false);
    f.advance(181); assert.equal(f.d.querySelector('.wcs-notification'), null);
  } finally { f.close(); }
});

test('active loading overlay hides notices, pauses expiry and defers new live announcements', async () => {
  const f = fixture();
  try {
    const id = f.api.info('Workspace refreshed.', {duration: 1000});
    f.advance(250);
    const overlay = f.d.createElement('div'); overlay.className = 'wcs-loading-overlay'; f.d.body.append(overlay);
    await Promise.resolve();
    const during = f.api.warning('Some items were unavailable.', {duration: 1000});
    f.advance(10000);
    assert.equal(f.d.getElementById('wcs-notifications').hidden, true);
    assert.ok(f.toast(id)); assert.ok(f.toast(during));
    assert.equal(f.d.querySelector('[aria-live=polite]').textContent, '');
    overlay.remove(); await Promise.resolve();
    assert.equal(f.d.getElementById('wcs-notifications').hidden, false);
    f.advance(20);
    assert.match(f.d.querySelector('[aria-live=polite]').textContent, /Some items were unavailable/);
    f.advance(729); assert.equal(f.toast(id).classList.contains('wcs-notification-leaving'), false);
    f.advance(181); assert.equal(f.toast(id), null); assert.ok(f.toast(during));
    f.advance(250); assert.equal(f.toast(during), null);
  } finally { f.close(); }
});

test('header flash waits when the initial page root appears later during parsing', async () => {
  const url = 'https://example.test/confluence/pages/viewpage.action?pageId=2';
  const flash = JSON.stringify({destination: url, message: 'Draft saved.', type: 'success', createdAt: 0});
  const f = fixture({url, flash, loadingDocument: true, noRoot: true});
  try {
    f.advance(5000);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    const wrapper = f.d.createElement('div');
    wrapper.innerHTML = '<div id="wcspedia"><div class="boot-state" role="status">Loading…</div></div>';
    f.d.body.append(wrapper); await Promise.resolve(); f.ready();
    f.advance(5000);
    assert.equal(f.d.querySelectorAll('.wcs-notification').length, 0);
    f.d.getElementById('wcspedia').innerHTML = '<h1>My workspace</h1>';
    await Promise.resolve();
    assert.equal(f.d.querySelector('.wcs-notification-message').textContent, 'Draft saved.');
    assert.equal(f.d.getElementById('wcs-notifications').hidden, false);
  } finally { f.close(); }
});
