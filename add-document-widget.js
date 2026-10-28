/* Standalone Confluence navigation widget. Authorization is supplied by the
 * shared entitlement resolver; this component never infers a user or a role. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSAddDocument = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var instances = new WeakMap(), sequence = 0;
  var plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  // Inline vectors keep the menu independent of image requests and attachment URLs.
  var typeIcons = {
    "job-aid": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"16\" rx=\"2\"/><rect x=\"9\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\"/><path d=\"m8 13 2 2 5-5M8 18h8\"/>",
    "procedure": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"5\" rx=\"1\"/><rect x=\"14\" y=\"16\" width=\"7\" height=\"5\" rx=\"1\"/><path d=\"M6.5 8v10.5H14m-3-3 3 3-3 3M14 5h7m-7 4h5\"/>",
    "knowledge-sharing": "<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><path d=\"M2 15v-2a4 4 0 0 1 8 0v2m4 0v-2a4 4 0 0 1 8 0v2M5 19h14m-3-3 3 3-3 3m-8-6-3 3 3 3\"/>",
    "blog": "<path d=\"M12 4H5a2 2 0 0 0-2 2v14a1 1 0 0 0 1 1h14a2 2 0 0 0 2-2v-7M8 16l1-4L18 3a2.1 2.1 0 0 1 3 3l-9 9-4 1Zm8-11 3 3M7 18h7\"/>",
    "training": "<path d=\"m2 8 10-5 10 5-10 5L2 8Zm4 2v7c4 3 8 3 12 0v-7m4-2v9\"/>",
    "reference": "<path d=\"M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14M5 9h4m-4 4h4m6-4h4m-4 4h4\"/>",
    "report": "<path d=\"M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 17v-3m4 3v-6m4 6v-4\"/>",
    "guide": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z\"/>",
    "playbook": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M8 3v18m3-13 6 4-6 4V8Z\"/>",
    "checklist": "<path d=\"m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M11 6h10m-10 6h10m-10 6h10\"/>",
    "template": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 9v12m4-8h4m-4 4h4\"/>",
    "faq": "<path d=\"M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z\"/><path d=\"M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 3\"/><circle cx=\"12\" cy=\"14\" r=\".5\" fill=\"currentColor\" stroke=\"none\"/>",
    "document": "<path d=\"M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6\"/>"
};
  function typeIcon(type) {
    function key(value) { return String(value || '').trim().toLowerCase().replace(/[ _]+/g, '-'); }
    var name = key(type.value);
    if (!Object.prototype.hasOwnProperty.call(typeIcons, name)) name = key(type.label);
    var paths = Object.prototype.hasOwnProperty.call(typeIcons, name) ? typeIcons[name] : typeIcons.document;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';
  }
  function contentTypes(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(function (item) {
      var value = typeof item === 'string' ? item : item && (item.value || item.id || item.label);
      var label = typeof item === 'string' ? item : item && (item.label || item.name || value);
      if (typeof value !== 'string' || !value.trim() || typeof label !== 'string' || !label.trim() || seen.has(value)) return null;
      seen.add(value);
      return {value:value, label:label, description:typeof item.description === 'string' ? item.description : ''};
    }).filter(Boolean);
  }
  function destination(createUrl, type, base) {
    var configured = typeof createUrl === 'function' ? createUrl(type.value) : createUrl;
    if (typeof configured !== 'string' || !configured.trim()) throw new Error('Configure the document authoring page.');
    var current = new URL(base), target = new URL(configured, current);
    var local = current.protocol === 'file:' && target.protocol === 'file:';
    if ((!local && !/^https?:$/.test(target.protocol)) || target.origin !== current.origin || target.username || target.password) throw new Error('The authoring page must be on the same origin.');
    // A callback can supply a complete destination. A page URL gets the standard
    // author route, preserving the Confluence pageId query outside the hash.
    if (typeof createUrl !== 'function') {
      var route = target.hash.replace(/^#/, ''), query = route.indexOf('?');
      var parameters = new URLSearchParams(query < 0 ? '' : route.slice(query + 1));
      parameters.set('type', type.value);
      target.hash = (query < 0 ? route : route.slice(0, query)) || '/create';
      target.hash += '?' + parameters.toString();
    }
    return target.href;
  }
  function mount(host, initialOptions) {
    if (!host || host.nodeType !== 1 || !host.ownerDocument) throw new TypeError('A widget host element is required.');
    if (instances.has(host)) { var existing = instances.get(host); existing.update(initialOptions || {}); return existing; }
    var doc = host.ownerDocument, win = doc.defaultView, options = Object.assign({}, initialOptions), destroyed = false;
    var generation = 0, allowed = false, panel = null, types = [], id = 'wcs-add-document-' + (++sequence), handle, pendingVerification = null, pendingIntent = null, accessCheckedAt = 0, accessRefresh = null;
    var shell = doc.createElement('div'), trigger = doc.createElement('button');
    host.setAttribute('data-wcs-add-document-host', '');
    shell.className = 'wcs-add-document'; trigger.type = 'button'; trigger.className = 'wcs-add-document-trigger';
    trigger.innerHTML = plus + '<span class="wcs-add-document-label">Add document</span>';
    trigger.setAttribute('aria-label', 'Add document');
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', id);
    shell.append(trigger);
    function state(name, message, code) {
      shell.dataset.state = name; host.dataset.wcsAddState = name;
      host.dataset.wcsAddMessage = message || '';
      host.dataset.wcsAddCode = code || '';
      trigger.disabled = name !== 'ready';
      trigger.setAttribute('aria-disabled', String(trigger.disabled));
      trigger.setAttribute('aria-busy', String(name === 'checking' || name === 'loading'));
      trigger.title = message || 'Add a document';
      host.hidden = false;
      host.style.removeProperty('display');
      if (name !== 'ready' && name !== 'checking') close(false);
      if (shell.parentNode !== host) host.replaceChildren(shell);
      if (message && (name === 'error' || name === 'unavailable' || name === 'denied')) {
        win.console?.warn('[WCSpedia Add document] ' + message);
      }
    }
    // A successful permission result does not mean the user still wants a menu
    // or navigation after moving elsewhere while that request was pending.
    function finishIntent(intent) {
      if (!intent) return;
      doc.removeEventListener('keydown', intent.key, true);
      doc.removeEventListener('pointerdown', intent.pointer, true);
      doc.removeEventListener('focusin', intent.focus, true);
      if (pendingIntent === intent) pendingIntent = null;
    }
    function cancelIntent(intent) { if (intent) { intent.active = false; finishIntent(intent); } }
    function beginIntent() {
      cancelIntent(pendingIntent);
      var intent = {active: true};
      intent.key = function (event) { if (event.key === 'Escape') cancelIntent(intent); };
      intent.pointer = function (event) { if (!shell.contains(event.target) && !(panel && panel.contains(event.target))) cancelIntent(intent); };
      intent.focus = function (event) { if (!shell.contains(event.target) && !(panel && panel.contains(event.target))) cancelIntent(intent); };
      pendingIntent = intent;
      doc.addEventListener('keydown', intent.key, true);
      doc.addEventListener('pointerdown', intent.pointer, true);
      doc.addEventListener('focusin', intent.focus, true);
      return intent;
    }
    function focusTrigger() { if (!destroyed && trigger.isConnected && !trigger.disabled) trigger.focus({preventScroll:true}); }
    function close(restore) {
      if (!panel) return;
      panel.remove(); panel = null; trigger.setAttribute('aria-expanded', 'false');
      doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('focusin', outsideFocus, true);
      doc.removeEventListener('keydown', menuKeys, true); win.removeEventListener('resize', position); win.removeEventListener('scroll', position, true); win.removeEventListener('wcspedia:add-position', position);
      if (restore) focusTrigger();
    }
    function outside(event) { if (panel && !panel.contains(event.target) && !shell.contains(event.target)) close(false); }
    function outsideFocus(event) { if (panel && !panel.contains(event.target) && !shell.contains(event.target)) close(false); }
    function position() {
      if (!panel || !trigger.isConnected) { close(false); return; }
      var rect = trigger.getBoundingClientRect(), view = win.visualViewport;
      var width = view ? view.width : win.innerWidth, height = view ? view.height : win.innerHeight, pad = 12, gap = 8;
      panel.style.maxWidth = Math.max(0, width - pad * 2) + 'px';
      var above=Math.max(0,rect.top-gap-pad),below=Math.max(0,height-rect.bottom-gap-pad);
      panel.style.maxHeight = Math.max(48, Math.max(above,below)) + 'px';
      var size = panel.getBoundingClientRect(), left = Math.max(pad, Math.min(rect.right - size.width, width - size.width - pad));
      var top = rect.bottom + gap;
      if (top + size.height > height - pad && rect.top - size.height - gap >= pad) top = rect.top - size.height - gap;
      else top = Math.max(pad, Math.min(top, height - size.height - pad));
      panel.style.left = left + 'px'; panel.style.top = top + 'px';
    }
    function menuItems() { return panel ? Array.from(panel.querySelectorAll('[role="menuitem"]')) : []; }
    function menuKeys(event) {
      if (!panel) return;
      var items = menuItems(), index = items.indexOf(doc.activeElement), next = -1;
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (event.key === 'Tab') {
        event.preventDefault();
        var focusable = Array.from(doc.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(function (el) {
          return !panel.contains(el) && !el.hidden && !el.closest('[hidden],[inert]') && (el.getClientRects().length || el === trigger);
        });
        var target = focusable[focusable.indexOf(trigger) + (event.shiftKey ? -1 : 1)];
        close(false); if (target) target.focus(); else focusTrigger(); return;
      }
      if (event.key === 'ArrowDown') next = (index + 1) % items.length;
      if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        for (var n = 1; n <= items.length; n++) { var candidate = (index + n) % items.length; if (items[candidate].dataset.label.startsWith(event.key.toLowerCase())) { next = candidate; break; } }
      }
      if (next >= 0 && items[next]) { event.preventDefault(); items[next].focus(); }
    }
    function open(last) {
      if (!allowed || destroyed || panel || !types.length) return;
      panel = doc.createElement('div'); panel.className = 'wcs-add-document-popover'; panel.id = id;
      panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', 'Create a document');
      var title = doc.createElement('p'); title.className = 'wcs-add-document-heading'; title.textContent = 'What would you like to share?'; title.setAttribute('role','presentation'); panel.append(title);
      types.forEach(function (type) {
        var item = doc.createElement('button'); item.type = 'button'; item.className = 'wcs-add-document-option'; item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
        item.dataset.label = type.label.toLowerCase();
        var label = doc.createElement('span'); label.className = 'wcs-add-document-option-label'; label.textContent = type.label;
        var icon = doc.createElement('span'); icon.className = 'wcs-add-document-option-icon'; icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = typeIcon(type);
        item.append(icon, label);
        if (type.description) { var description = doc.createElement('span'); description.className = 'wcs-add-document-option-description'; description.textContent = type.description; item.append(description); }
        item.addEventListener('click', async function (event) {
          event.preventDefault(); event.stopPropagation();
          close(false);
          var intent = beginIntent();
          try {
            if (!await navigationAccess() || !allowed || !intent.active) return;
            var target = destination(options.createUrl, type, win.location.href);
            if (typeof options.navigate === 'function') {
              if (await options.navigate(target, type.value) === false) {
                // A leave guard may open a dialog or move focus. Only return to
                // the trigger when the user has not begun another interaction.
                if (intent.active) focusTrigger();
                return;
              }
            } else win.location.assign(target);
            if (!destroyed) win.WCSNotifications?.show('Opening the ' + type.value.toLowerCase() + ' editor.', {type: 'info'});
          } catch (_) { state('error', 'The authoring page is unavailable.'); win.WCSNotifications?.show('The authoring page is unavailable.', {type: 'error'}); }
          finally { finishIntent(intent); }

        });
        panel.append(item);
      });
      doc.body.append(panel); trigger.setAttribute('aria-expanded', 'true'); position();
      doc.addEventListener('pointerdown', outside, true); doc.addEventListener('focusin', outsideFocus, true); doc.addEventListener('keydown', menuKeys, true);
      win.addEventListener('resize', position); win.addEventListener('scroll', position, true); win.addEventListener('wcspedia:add-position', position);
      var items = menuItems(); if (items.length) items[last ? items.length - 1 : 0].focus({preventScroll:true});
    }
    function checkPermission() {
      var provider = options.canCreate, timeout = Number(options.accessTimeoutMs);
      if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30000) timeout = 12000;
      return new Promise(function (resolve, reject) {
        var settled = false, controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
        function finish(error, value) {
          if (settled) return;
          settled = true; win.clearTimeout(timer);
          if (pendingVerification === cancel) pendingVerification = null;
          if (error) reject(error); else resolve(value);
        }
        function cancel() {
          var error = new Error('Access check cancelled.'); error.name = 'AbortError';
          finish(error); if (controller) controller.abort();
        }
        var timer = win.setTimeout(function () {
          var error = new Error('Access check timed out. Try again.'); error.code = 'ACCESS_TIMEOUT';
          finish(error); if (controller) controller.abort();
        }, timeout);
        pendingVerification = cancel;
        try {
          Promise.resolve(typeof provider === 'function' && provider({signal: controller ? controller.signal : undefined})).then(function (result) {
            finish(null, result);
          }, function (error) { finish(error); });
        } catch (error) { finish(error); }
      });
    }
    async function verify(interactive, background) {
      function feedback(message, type) { if (interactive && !destroyed) win.WCSNotifications?.show(message, {type: type}); }
      var request = ++generation;
      if (pendingVerification) pendingVerification();
      var visibleCheck = interactive && allowed && !host.hidden;
      if (!background) { allowed = false; state(visibleCheck ? 'checking' : 'loading', 'Checking access…'); }
      try {
        if (typeof options.unavailableMessage === 'string' && options.unavailableMessage.trim()) {
          close(false); state('unavailable', options.unavailableMessage.trim()); feedback(options.unavailableMessage.trim(), 'warning'); return false;
        }
        var result = await checkPermission();
        if (destroyed || request !== generation) return false;
        if (result !== true) { allowed = false; close(false); state('denied', 'Not permitted'); feedback('You do not have permission to add documents.', 'warning'); return false; }
        if (!types.length) { close(false); state('error', 'Content types are unavailable.'); feedback('Content types are unavailable.', 'error'); return false; }
        // Validate every configured route before exposing an enabled menu.
        types.forEach(function (type) { destination(options.createUrl, type, win.location.href); });
        allowed = true; accessCheckedAt = Date.now(); state('ready'); return true;
      } catch (error) {
        if (!destroyed && request === generation) {
          allowed = false;
          var message = error && error.message || 'Access could not be verified. Try again.';
          close(false); state('error', message, error && error.code); feedback(message, 'error');
        }
        return false;
      }
    }
    // This hint opens navigation only; the destination and every mutation still
    // perform their own native permission checks. Never persist it across pages.
    function refreshNavigationAccess() {
      if (destroyed || accessRefresh) return accessRefresh;
      if (pendingVerification) return handle && handle.pending;
      var pending = verify(false, allowed);
      accessRefresh = pending;
      pending.finally(function () { if (accessRefresh === pending) accessRefresh = null; });
      return pending;
    }
    function navigationAccess() {
      if (options.reuseNavigationAccess !== true) return verify(true);
      if (allowed) {
        if (Date.now() - accessCheckedAt >= 60000) refreshNavigationAccess();
        return Promise.resolve(true);
      }
      return refreshNavigationAccess();
    }
    function resume() {
      if (options.reuseNavigationAccess !== true || doc.visibilityState === 'hidden' || destroyed) return;
      if (!allowed || Date.now() - accessCheckedAt >= 60000) refreshNavigationAccess();
    }
    doc.addEventListener('visibilitychange', resume);
    win.addEventListener('focus', resume);
    async function toggle(last) {
      if (trigger.disabled) return;
      if (panel) { close(true); return; }
      var intent = beginIntent();
      try { if (await navigationAccess() && allowed && intent.active) { finishIntent(intent); open(last); } }
      finally { finishIntent(intent); }
    }
    function onClick(event) { event.preventDefault(); event.stopPropagation(); toggle(false); }
    function onKey(event) { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); toggle(event.key === 'ArrowUp'); } }
    trigger.addEventListener('click', onClick); trigger.addEventListener('keydown', onKey);
    handle = {
      get ready() { return handle.pending; },
      update:function (next) {
        if (destroyed) return Promise.resolve(false);
        accessCheckedAt = 0; accessRefresh = null; cancelIntent(pendingIntent); close(false); options = Object.assign({}, options, next || {}); types = contentTypes(options.types);
        handle.pending = verify(); return handle.pending;
      },
      destroy:function () {
        if (destroyed) return;
        destroyed = true; doc.removeEventListener('visibilitychange', resume); win.removeEventListener('focus', resume); generation++; cancelIntent(pendingIntent); if (pendingVerification) pendingVerification(); close(false); trigger.removeEventListener('click', onClick); trigger.removeEventListener('keydown', onKey);
        shell.remove(); host.replaceChildren(); host.hidden = true; host.style.setProperty('display', 'none', 'important'); instances.delete(host);
      }
    };
    instances.set(host, handle); handle.update(); return handle;
  }
  return Object.freeze({mount:mount});
});
