/* Personal references to stable document IDs. Content is resolved from the
 * current authorised catalog, never copied into the preference store.
 * Browser storage is prototype-only; native sessions use personal favourites. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSBookmarks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var queues = new WeakMap();
  var MAX_ITEMS = 10000, MAX_REQUESTS = 50000;
  function error(code, message, cause) { var e = new Error(message); e.name = 'BookmarksError'; e.code = code; if (cause) e.cause = cause; return e; }
  function fail(code, message, cause) { throw error(code, message, cause); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function shape(value, fields) { return object(value) && Object.keys(value).length === fields.length && fields.every(function (field) { return Object.prototype.hasOwnProperty.call(value, field); }); }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function validKey(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
  function requestKey(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value); }
  function normalizeSOEID(value) { return typeof value === 'string' && /^[a-z0-9]{2,32}$/i.test(value.trim()) ? value.trim().toUpperCase() : ''; }
  function iso(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
  function invalid(message) { fail('BOOKMARKS_INVALID', message || 'Saved items returned invalid data. Reload and try again.'); }
  function rows(value) {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) invalid();
    var seen = new Set();
    return value.map(function (item) {
      if (!shape(item, ['documentId', 'savedAt']) || !validKey(item.documentId) || !iso(item.savedAt) || seen.has(item.documentId)) invalid();
      seen.add(item.documentId); return { documentId: item.documentId, savedAt: item.savedAt };
    }).sort(function (a, b) { return b.savedAt.localeCompare(a.savedAt) || a.documentId.localeCompare(b.documentId); });
  }
  function stored(value) {
    if (!shape(value, ['schemaVersion', 'profiles']) || value.schemaVersion !== 1 || !Array.isArray(value.profiles) || value.profiles.length > 1000) invalid();
    var seen = new Set();
    value.profiles.forEach(function (profile) {
      if (!shape(profile, ['scope', 'soeid', 'revision', 'bookmarks', 'requests']) || !validKey(profile.scope) || !normalizeSOEID(profile.soeid) || normalizeSOEID(profile.soeid) !== profile.soeid || !integer(profile.revision) || !Array.isArray(profile.requests) || profile.requests.length > MAX_REQUESTS) invalid();
      var key = profile.scope + ':' + profile.soeid;
      if (seen.has(key)) invalid(); seen.add(key); rows(profile.bookmarks);
      var requests = new Set();
      profile.requests.forEach(function (request) {
        if (!shape(request, ['requestId', 'documentId', 'saved', 'expectedRevision']) || !requestKey(request.requestId) || requests.has(request.requestId) || !validKey(request.documentId) || typeof request.saved !== 'boolean' || !integer(request.expectedRevision) || request.expectedRevision > profile.revision) invalid();
        requests.add(request.requestId);
      });
    });
    return value;
  }
  function defaultPublished(doc) {
    return doc && !doc.deletedAt && Array.isArray(doc.versions) ? doc.versions.find(function (version) { return version.version === doc.publishedVersion && version.status === 'Published'; }) || null : null;
  }
  function create(options) {
    options = options || {};
    if (options.mode === 'confluence' && (options.config || options).authoringMode === 'confluence-session') {
      var personal = options.personalAPI || root.WCSSpacePersonal || (typeof require === 'function' ? require('./space-personal.js') : null);
      if (!personal || typeof personal.create !== 'function') fail('BOOKMARKS_INPUT', 'The native Confluence personal-actions helper is unavailable.');
      return personal.create(options.config || options, {fetch: options.fetch, location: options.location || {href: options.baseUrl || (root.location && root.location.href)}, storage: options.nativeStorage}).bookmarks(options);
    }
    if (!['embedded', 'local', 'confluence'].includes(options.mode)) fail('BOOKMARKS_INPUT', 'Choose local or Confluence saved-item storage.');
    var live = options.mode === 'confluence';
    // Copy the normalised identity now. Changing the caller's object must not
    // redirect an in-flight operation to a different user's preferences.
    var soeid = normalizeSOEID(typeof options.identity === 'string' ? options.identity : options.identity && options.identity.soeid);
    if (!soeid) fail('BOOKMARKS_IDENTITY', 'Sign in with a valid SOEID to use saved items.');
    var getDocuments = options.getDocuments, canRead = options.canRead, published = options.publishedVersion || defaultPublished;
    if (typeof getDocuments !== 'function' || typeof canRead !== 'function' || typeof published !== 'function') fail('BOOKMARKS_INPUT', 'Saved items need the current document catalog and read-permission check.');
    var scope = options.rootPageId == null || options.rootPageId === '' ? 'local' : String(options.rootPageId);
    if (!validKey(scope)) fail('BOOKMARKS_INPUT', 'The saved-item root key is invalid.');
    var storageKey = options.key === undefined ? 'wcspedia.bookmarks.v1' : options.key;
    if (typeof storageKey !== 'string' || !storageKey.trim() || storageKey.length > 256 || /[\u0000-\u001f\u007f]/.test(storageKey)) fail('BOOKMARKS_INPUT', 'The saved-item storage key is invalid.');
    var now = options.now || Date.now;
    if (typeof now !== 'function') fail('BOOKMARKS_INPUT', 'The saved-item clock is invalid.');
    var requestTimeoutMs = options.requestTimeoutMs === undefined ? 10000 : options.requestTimeoutMs;
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) fail('BOOKMARKS_INPUT', 'The saved-item request timeout must be from 1 to 60,000 milliseconds.');
    var endpoint = null, unavailableReason = '';
    if (live) {
      if (!options.endpoint) unavailableReason = 'Saved items are unavailable until the Confluence bookmarks service is configured.';
      else {
        try {
          var base = new URL(options.baseUrl || (root.location && root.location.href));
          endpoint = new URL(options.endpoint, base);
          if (!/^https?:$/.test(base.protocol) || endpoint.origin !== base.origin || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw Error('Invalid endpoint');
          if (!/^[1-9]\d*$/.test(scope)) throw Error('Invalid root');
        } catch (_) { fail('BOOKMARKS_INPUT', 'The bookmarks service must use a same-origin URL and a valid Confluence root page.'); }
      }
    }
    var storage = options.storage, withLock = options.withLock;
    if (!live) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('BOOKMARKS_STORAGE', 'Local saved-item storage is unavailable.');
      if (withLock !== undefined && typeof withLock !== 'function') fail('BOOKMARKS_INPUT', 'The saved-item lock adapter is invalid.');
      if (!withLock && root.navigator && root.navigator.locks) withLock = function (name, task) { return root.navigator.locks.request(name, task); };
    }
    var fetcher = options.fetch || (root.fetch && root.fetch.bind(root));
    if (live && endpoint && typeof fetcher !== 'function') fail('BOOKMARKS_INPUT', 'A request adapter is required for saved items.');
    function catalog() {
      var docs = getDocuments();
      if (!Array.isArray(docs)) fail('BOOKMARKS_CATALOG', 'The document catalog is unavailable. Reload saved items.');
      var indexed = new Map();
      docs.forEach(function (doc) { if (doc && validKey(doc.id)) indexed.set(doc.id, indexed.has(doc.id) ? null : doc); });
      return indexed;
    }
    function availableDocument(id, indexed) {
      var doc = (indexed || catalog()).get(id);
      if (!doc) return null;
      if (doc.deletedAt || canRead(doc) !== true) return null;
      var version = published(doc);
      if (!version || version.status !== 'Published' || version.version !== doc.publishedVersion) return null;
      return {doc: doc, version: version};
    }
    function project(revision, bookmarks) {
      var indexed = catalog();
      return {revision: revision, bookmarks: rows(bookmarks).filter(function (item) { return !!availableDocument(item.documentId, indexed); }), available: true};
    }
    function resolve(state) {
      if (!state || state.available !== true || !integer(state.revision)) return [];
      var indexed = catalog();
      return rows(state.bookmarks).flatMap(function (item) {
        var current = availableDocument(item.documentId, indexed);
        return current ? [{documentId: item.documentId, savedAt: item.savedAt, doc: current.doc, version: current.version}] : [];
      });
    }
    function unavailable() { return {revision: null, bookmarks: [], available: false, reason: unavailableReason}; }
    async function read() {
      var raw;
      try { raw = await storage.getItem(storageKey); } catch (e) { fail('BOOKMARKS_STORAGE', 'Saved items could not be read from this browser.', e); }
      if (raw === null) return {schemaVersion: 1, profiles: []};
      try { if (typeof raw !== 'string' || raw.length > 16000000) throw Error('Invalid stored data'); return stored(JSON.parse(raw)); }
      catch (e) { fail('BOOKMARKS_CORRUPT', 'Saved items are damaged. They have not been overwritten. Restore the local preference record before saving.', e); }
    }
    function profile(state) { return state.profiles.find(function (item) { return item.scope === scope && item.soeid === soeid; }) || {scope: scope, soeid: soeid, revision: 0, bookmarks: [], requests: []}; }
    async function write(state) {
      var value = JSON.stringify(state);
      try {
        await storage.setItem(storageKey, value);
        if (await storage.getItem(storageKey) !== value) throw Error('The storage adapter did not retain the saved data.');
      } catch (e) { fail('BOOKMARKS_STORAGE', 'Saved items could not be saved. Your change is not confirmed; reload before trying again.', e); }
    }
    function serial(task) {
      var group = queues.get(storage); if (!group) { group = new Map(); queues.set(storage, group); }
      var previous = group.get(storageKey) || Promise.resolve();
      var running = previous.catch(function () {}).then(async function () {
        if (!withLock) return task(); // Inject Web Locks for independent browser tabs.
        var invoked = false, pending;
        await withLock('wcspedia-bookmarks:' + storageKey, function () {
          if (invoked) fail('BOOKMARKS_LOCK', 'The saved-item lock ran an operation more than once.');
          invoked = true; pending = Promise.resolve().then(task); return pending;
        });
        if (!invoked) fail('BOOKMARKS_LOCK', 'The saved-item lock could not be acquired.');
        return pending;
      });
      group.set(storageKey, running);
      function cleanup() { if (group.get(storageKey) === running) group.delete(storageKey); }
      running.then(cleanup, cleanup); return running;
    }
    function validateResponse(value) {
      if (!shape(value, ['schemaVersion', 'rootPageId', 'subjectSOEID', 'revision', 'bookmarks']) || value.schemaVersion !== 1 || value.rootPageId !== scope || value.subjectSOEID !== soeid || !integer(value.revision)) invalid('The saved-item response did not match this session and library. Reload and try again.');
      return {revision: value.revision, bookmarks: rows(value.bookmarks)};
    }
    async function request(url, init) {
      var controller = new AbortController(), timer;
      var deadline = new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(error('BOOKMARKS_TIMEOUT', init && init.method === 'POST' ? 'Saving timed out and the result is not confirmed. Reload saved items before retrying this change.' : 'Saved items took too long to load. Try again.'));
          controller.abort();
        }, requestTimeoutMs);
      });
      var operation = (async function () {
        var response;
        try { response = await fetcher(url, Object.assign({credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: {Accept: 'application/json'}}, init, {signal: controller.signal})); }
        catch (e) { fail('BOOKMARKS_NETWORK', 'The saved-item service could not be reached. Reload to confirm whether your last change was saved.', e); }
        if (!response || response.ok !== true) {
          var status = response && response.status;
          if (status === 409 || status === 412) fail('BOOKMARKS_CONFLICT', 'Saved items changed in another session. Reload before trying again.');
          if (status === 401 || status === 403) fail('BOOKMARKS_FORBIDDEN', 'Your session cannot access these saved items. Sign in again or reload permissions.');
          fail('BOOKMARKS_SERVICE', 'The saved-item service is unavailable' + (Number.isInteger(status) ? ' (' + status + ')' : '') + '. Try again later.');
        }
        if (!response.headers || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) invalid('The saved-item service did not return JSON. Reload and sign in again.');
        var value;
        try { value = await response.json(); } catch (e) { invalid(); }
        return validateResponse(value);
      })();
      try { return await Promise.race([operation, deadline]); }
      finally { clearTimeout(timer); }
    }
    function load() {
      if (live) {
        if (!endpoint) return Promise.resolve(unavailable());
        var url = new URL(endpoint); url.searchParams.set('rootPageId', scope);
        return request(url.href).then(function (state) { return project(state.revision, state.bookmarks); });
      }
      return serial(async function () { var p = profile(await read()); return project(p.revision, p.bookmarks); });
    }
    async function set(documentId, saved, commandOptions) {
      commandOptions = commandOptions || {};
      if (!validKey(documentId) || typeof saved !== 'boolean' || !integer(commandOptions.expectedRevision)) fail('BOOKMARKS_INPUT', 'A document key, save/remove choice, and current saved-item revision are required.');
      if (live && !endpoint) fail('BOOKMARKS_UNAVAILABLE', unavailableReason);
      if (saved && !availableDocument(documentId)) fail('BOOKMARKS_FORBIDDEN', 'Only a current published document you can read can be saved.');
      var requestId = commandOptions.requestId;
      if (requestId === undefined) {
        if (!root.crypto || typeof root.crypto.randomUUID !== 'function') fail('BOOKMARKS_INPUT', 'Secure saved-item request IDs are unavailable. Use a secure browser context.');
        requestId = 'bookmark-' + root.crypto.randomUUID();
      }
      if (!requestKey(requestId)) fail('BOOKMARKS_INPUT', 'The saved-item request ID is invalid.');
      var command = {schemaVersion: 1, rootPageId: scope, documentId: documentId, saved: saved, expectedRevision: commandOptions.expectedRevision, requestId: requestId};
      if (live) {
        var remote;
        try { remote = await request(endpoint.href, {method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': requestId}, body: JSON.stringify(command)}); }
        catch (e) {
          // A timeout is not proof that the server rejected the mutation.
          // Preserve the generated ID for an exact, idempotent retry.
          e.requestId = requestId;
          e.retryCommand = Object.freeze({documentId: documentId, saved: saved, expectedRevision: command.expectedRevision, requestId: requestId});
          throw e;
        }
        if (remote.revision < command.expectedRevision || remote.bookmarks.some(function (item) { return item.documentId === documentId; }) !== saved) fail('BOOKMARKS_CONFLICT', 'The saved-item change could not be confirmed. Reload before trying again.');
        return project(remote.revision, remote.bookmarks);
      }
      return serial(async function () {
        var state = await read(), p = profile(state);
        if (saved && !availableDocument(documentId)) fail('BOOKMARKS_FORBIDDEN', 'This document is no longer available to save.');
        var replay = p.requests.find(function (item) { return item.requestId === requestId; });
        var exists = p.bookmarks.some(function (item) { return item.documentId === documentId; });
        if (replay) {
          if (replay.documentId !== documentId || replay.saved !== saved || replay.expectedRevision !== command.expectedRevision) fail('BOOKMARKS_CONFLICT', 'This saved-item request ID was already used for a different change.');
          if (exists !== saved) fail('BOOKMARKS_CONFLICT', 'Saved items changed after that request. Reload before trying again.');
          return project(p.revision, p.bookmarks);
        }
        if (p.revision !== command.expectedRevision) fail('BOOKMARKS_CONFLICT', 'Saved items changed in another tab. Reload before trying again.');
        if (p.requests.length >= MAX_REQUESTS || (saved && !exists && p.bookmarks.length >= MAX_ITEMS)) fail('BOOKMARKS_LIMIT', 'The local saved-item record has reached its supported limit.');
        if (exists !== saved) {
          if (p.revision === Number.MAX_SAFE_INTEGER) fail('BOOKMARKS_LIMIT', 'The saved-item revision limit has been reached.');
          if (saved) {
            var timestamp = now();
            if (!integer(timestamp)) fail('BOOKMARKS_INPUT', 'The saved-item clock is invalid.');
            p.bookmarks.push({documentId: documentId, savedAt: new Date(timestamp).toISOString()});
          } else p.bookmarks = p.bookmarks.filter(function (item) { return item.documentId !== documentId; });
          p.revision += 1;
        }
        p.requests.push({requestId: requestId, documentId: documentId, saved: saved, expectedRevision: command.expectedRevision});
        if (!state.profiles.includes(p)) state.profiles.push(p);
        await write(state); return project(p.revision, p.bookmarks);
      });
    }
    return Object.freeze({load: load, set: set, resolve: resolve, storageKey: storageKey});
  }
  return Object.freeze({create: create});
});
