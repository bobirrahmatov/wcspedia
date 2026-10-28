/* Run with jsdom available, for example:
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test loading-overlay.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let JSDOM;
try { ({JSDOM} = require('jsdom')); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' || !error.message.startsWith("Cannot find module 'jsdom'")) throw error;
}
const source = fs.readFileSync(require.resolve('./loading-overlay.js'), 'utf8');
const domTest = (name, fn) => test(name, {skip:!JSDOM && 'Install jsdom or set NODE_PATH for DOM tests'}, async () => {
  const dom = new JSDOM('<!doctype html><body><button id="outside">Navigation</button><main id="wcspedia"><button id="before">Open document</button></main></body>', {runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window, doc = w.document, target = doc.querySelector('main');
  const timers = new Map(), cleared = [];
  let nextTimer = 1;
  w.setTimeout = (callback, delay) => { const id = nextTimer++; timers.set(id, {callback, delay}); return id; };
  w.clearTimeout = id => { cleared.push(id); timers.delete(id); };
  w.eval(source);
  const loader = w.WCSLoadingOverlay.create({target});
  const overlay = () => doc.querySelector('.wcs-loading-overlay');
  try { await fn({w, doc, target, loader, overlay, timers, cleared}); }
  finally { loader.destroy(); dom.window.close(); }
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

domTest('loading layer announces its message and indeterminate progress without exposing fake percentages', ({doc, loader, overlay}) => {
  loader.show();
  const layer = overlay(), status = layer.querySelector('[role="status"]'), bar = layer.querySelector('[role="progressbar"]');
  assert.equal(layer.getAttribute('role'), 'dialog');
  assert.equal(layer.getAttribute('aria-modal'), 'true');
  assert.equal(layer.getAttribute('aria-labelledby'), status.id);
  assert.equal(status.textContent, 'Loading WCSpedia…');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('aria-atomic'), 'true');
  assert.equal(bar.getAttribute('aria-valuenow'), null);
  assert.equal(bar.getAttribute('aria-valuetext'), status.textContent);
  assert.ok(layer.classList.contains('is-indeterminate'));
  assert.equal(layer.querySelector('[role="img"]').getAttribute('aria-label'), 'Citi');
  assert.equal(doc.activeElement, layer);
});

domTest('loading messages remain plain text for both initial and progress updates', ({loader, overlay}) => {
  const text = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
  loader.show(text);
  assert.equal(overlay().querySelector('[role="status"]').textContent, text);
  assert.equal(overlay().querySelector('img,script'), null);
  loader.progress(1, 3, text);
  assert.equal(overlay().querySelector('[role="status"]').textContent, text);
  assert.equal(overlay().querySelector('img,script'), null);
});

domTest('real progress updates its accessible bounds and clamps completed steps', ({loader, overlay}) => {
  loader.show('Connecting');
  loader.progress(1, 4, 'Loading documents');
  const layer = overlay(), bar = layer.querySelector('[role="progressbar"]');
  assert.ok(!layer.classList.contains('is-indeterminate'));
  assert.equal(layer.style.getPropertyValue('--wcs-loading-progress'), '25%');
  assert.equal(bar.getAttribute('aria-valuemin'), '0');
  assert.equal(bar.getAttribute('aria-valuemax'), '4');
  assert.equal(bar.getAttribute('aria-valuenow'), '1');
  assert.equal(bar.getAttribute('aria-valuetext'), '1 of 4 loading steps complete. Loading documents');
  loader.progress(-10, 4);
  assert.equal(bar.getAttribute('aria-valuenow'), '0');
  assert.equal(layer.style.getPropertyValue('--wcs-loading-progress'), '0%');
  loader.progress(20, 4);
  assert.equal(bar.getAttribute('aria-valuenow'), '4');
  assert.equal(layer.style.getPropertyValue('--wcs-loading-progress'), '100%');
  assert.equal(layer.querySelector('[role="status"]').textContent, 'Loading documents');
});

domTest('invalid progress leaves the current message and progress intact, including after hide', ({loader, overlay}) => {
  loader.progress(1, 2, 'Not displayed');
  assert.equal(overlay(), null);
  loader.show('Loading');
  loader.progress(1, 4, 'Documents');
  const expected = overlay().outerHTML;
  for (const [completed, total] of [[NaN,4], [Infinity,4], ['1',4], [1,0], [1,-1], [1,NaN], [1,Infinity], [1,'4']]) {
    loader.progress(completed, total, 'Invalid');
    assert.equal(overlay().outerHTML, expected);
  }
  loader.hide();
  assert.doesNotThrow(() => loader.progress(1, 2));
  assert.equal(overlay(), null);
});

domTest('repeated show updates one layer and hide restores scrolling, focus and original absent attributes', ({doc, target, loader, overlay}) => {
  const before = doc.querySelector('#before');
  before.focus();
  doc.body.style.overflow = 'auto';
  loader.show('First');
  const layer = overlay();
  assert.equal(target.getAttribute('aria-busy'), 'true');
  assert.ok(target.hasAttribute('inert'));
  assert.equal(doc.body.style.overflow, 'hidden');
  loader.progress(1, 2);
  loader.show('Second');
  assert.equal(doc.querySelectorAll('.wcs-loading-overlay').length, 1);
  assert.equal(overlay(), layer);
  assert.equal(layer.querySelector('[role="status"]').textContent, 'Second');
  assert.ok(layer.classList.contains('is-indeterminate'));
  assert.equal(layer.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), null);
  loader.hide();
  assert.equal(overlay(), null);
  assert.equal(target.getAttribute('aria-busy'), null);
  assert.equal(target.getAttribute('inert'), null);
  assert.equal(doc.body.style.overflow, 'auto');
  assert.equal(doc.activeElement, before);
  loader.hide();
  assert.equal(doc.activeElement, before);
  assert.equal(doc.body.style.overflow, 'auto');
});

domTest('preexisting busy and inert states survive loading without stealing externally moved focus', ({doc, target, loader}) => {
  target.setAttribute('aria-busy', 'false');
  target.setAttribute('inert', 'existing');
  doc.body.style.overflow = 'scroll';
  const outside = doc.querySelector('#outside');
  outside.focus();
  loader.show();
  outside.focus();
  loader.hide();
  assert.equal(target.getAttribute('aria-busy'), 'false');
  assert.equal(target.getAttribute('inert'), 'existing');
  assert.equal(doc.body.style.overflow, 'scroll');
  assert.equal(doc.activeElement, outside);
});

domTest('hide preserves an overflow change made by another component during loading', ({doc, loader}) => {
  doc.body.style.overflow = 'auto';
  loader.show();
  doc.body.style.overflow = 'clip';
  loader.hide();
  assert.equal(doc.body.style.overflow, 'clip');
});

domTest('Tab stays in the loading layer and its keyboard listener is removed after hiding', ({w, doc, loader, overlay}) => {
  loader.show();
  for (const shiftKey of [false, true]) {
    const event = new w.KeyboardEvent('keydown', {key:'Tab', shiftKey, bubbles:true, cancelable:true});
    doc.dispatchEvent(event);
    assert.ok(event.defaultPrevented);
    assert.equal(doc.activeElement, overlay());
  }
  loader.hide();
  const event = new w.KeyboardEvent('keydown', {key:'Tab', bubbles:true, cancelable:true});
  doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});

domTest('successful and failed waits preserve the result and clear their timeout', async ({loader, timers, cleared}) => {
  const value = {documents:['one']};
  const success = loader.wait(Promise.resolve(value));
  assert.equal([...timers.values()][0].delay, 60000);
  assert.equal(await success, value);
  assert.equal(timers.size, 0);
  const error = new Error('Confluence denied access');
  await assert.rejects(loader.wait(Promise.reject(error), {timeoutMs:2500}), received => received === error);
  assert.equal(timers.size, 0);
  assert.equal(cleared.length, 2);
});

domTest('a timed out wait rejects once and a late response cannot change it into success', async ({loader, timers}) => {
  const request = deferred(), outcomes = [];
  const result = loader.wait(request.promise, {timeoutMs:25});
  const observed = result.then(value => outcomes.push(['success',value]), error => outcomes.push(['failure',error.message]));
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 25);
  timer.callback();
  await assert.rejects(result, /Loading took too long/);
  await observed;
  assert.equal(timers.size, 0);
  request.resolve('too late');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0][0], 'failure');
});

for (const action of ['destroy', 'pagehide']) {
  domTest(action + ' interrupts all pending waits, removes the overlay and restores page state', async ({w, doc, target, loader, overlay, timers}) => {
    const before = doc.querySelector('#before');
    before.focus();
    loader.show();
    const requests = [deferred(), deferred()];
    const results = requests.map(request => loader.wait(request.promise));
    const failures = results.map(result => assert.rejects(result, /Page loading was interrupted/));
    assert.equal(timers.size, 2);
    if (action === 'destroy') loader.destroy();
    else w.dispatchEvent(new w.Event('pagehide'));
    await Promise.all(failures);
    assert.equal(timers.size, 0);
    assert.equal(overlay(), null);
    assert.equal(target.getAttribute('aria-busy'), null);
    assert.equal(target.getAttribute('inert'), null);
    assert.equal(doc.body.style.overflow, '');
    assert.equal(doc.activeElement, before);
    assert.doesNotThrow(() => loader.destroy());
    requests.forEach(request => request.resolve('late response'));
    await Promise.resolve();
    assert.equal(overlay(), null);
  });
}

domTest('skeleton announces a plain-text status and excludes decorative cards from accessibility',({w,target})=>{
  target.innerHTML=w.WCSLoadingOverlay.skeleton('<img src=x onerror=alert(1)>');
  assert.equal(target.querySelector('img'),null);
  assert.equal(target.querySelector('[role=status] > span').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(target.querySelectorAll('[aria-hidden=true] .wcs-skeleton-card').length,3);
});
