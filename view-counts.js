/* Local prototype analytics only. Production counts belong in the trusted metrics
 * service, independently of document revisions and the approval audit trail. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSViewCounts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var WINDOW_MS = 30 * 60 * 1000;
  var queues = new WeakMap();
  function error(code, message, cause) {
    var failure = new Error(message);
    failure.name = 'ViewCountsError'; failure.code = code;
    if (cause) failure.cause = cause;
    return failure;
  }
  function validKey(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
  }
  function key(value, label) {
    if (!validKey(value)) throw error('VIEW_COUNTS_INPUT', label + ' must be a nonempty, unpadded key of at most 256 characters.');
    return value;
  }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function shape(value, fields) {
    return object(value) && Object.keys(value).length === fields.length && fields.every(function (field) { return Object.prototype.hasOwnProperty.call(value, field); });
  }
  function corrupt() { throw error('VIEW_COUNTS_CORRUPT', 'Stored view counts are invalid. Restore the local metrics record or reset the sample data.'); }
  function validate(state) {
    if (!shape(state, ['schemaVersion', 'lastObservedAt', 'documents']) || state.schemaVersion !== 1 || (state.lastObservedAt !== null && !integer(state.lastObservedAt)) || !Array.isArray(state.documents)) corrupt();
    var documentKeys = new Set();
    state.documents.forEach(function (doc) {
      if (!shape(doc, ['documentKey', 'views', 'viewers', 'requests']) || !validKey(doc.documentKey) || documentKeys.has(doc.documentKey) || !integer(doc.views) || !Array.isArray(doc.viewers) || !Array.isArray(doc.requests)) corrupt();
      documentKeys.add(doc.documentKey);
      var viewerKeys = new Set(), requestIds = new Set();
      doc.viewers.forEach(function (viewer) {
        if (!shape(viewer, ['viewerKey', 'lastCountedAt']) || !validKey(viewer.viewerKey) || viewerKeys.has(viewer.viewerKey) || !integer(viewer.lastCountedAt) || state.lastObservedAt === null || viewer.lastCountedAt > state.lastObservedAt) corrupt();
        viewerKeys.add(viewer.viewerKey);
      });
      if (doc.views < doc.viewers.length || (doc.views > 0 && doc.viewers.length === 0)) corrupt();
      doc.requests.forEach(function (request) {
        if (!shape(request, ['requestId', 'viewerKey', 'at']) || !validKey(request.requestId) || requestIds.has(request.requestId) || !validKey(request.viewerKey) || !viewerKeys.has(request.viewerKey) || !integer(request.at) || state.lastObservedAt === null || request.at > state.lastObservedAt) corrupt();
        requestIds.add(request.requestId);
      });
    });
    return state;
  }
  function createLocal(options) {
    options = options || {};
    var storage = options.storage, storageKey = key(options.key === undefined ? 'wcspedia.views.v1' : options.key, 'Storage key');
    var now = options.now === undefined ? Date.now : options.now, withLock = options.withLock;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw error('VIEW_COUNTS_INPUT', 'A readable and writable storage adapter is required.');
    if (typeof now !== 'function' || (withLock !== undefined && typeof withLock !== 'function')) throw error('VIEW_COUNTS_INPUT', 'Clock and lock adapters must be functions.');
    var storageQueues = queues.get(storage);
    if (!storageQueues) { storageQueues = new Map(); queues.set(storage, storageQueues); }
    async function locked(task) {
      if (!withLock) return task();
      var invoked = false, pending;
      await withLock('wcspedia-view-counts:' + storageKey, function () {
        if (invoked) throw error('VIEW_COUNTS_LOCK', 'The lock adapter invoked the operation more than once.');
        invoked = true; pending = Promise.resolve().then(task); return pending;
      });
      if (!invoked) throw error('VIEW_COUNTS_LOCK', 'The lock adapter did not run the operation.');
      return pending;
    }
    function serial(task) {
      // Instances sharing a storage adapter also share this queue. Browser tabs
      // must additionally pass navigator.locks.request through withLock.
      var previous = storageQueues.get(storageKey) || Promise.resolve();
      var running = previous.catch(function () {}).then(function () { return locked(task); });
      storageQueues.set(storageKey, running);
      function clear() { if (storageQueues.get(storageKey) === running) storageQueues.delete(storageKey); }
      running.then(clear, clear);
      return running;
    }
    async function read() {
      var raw;
      try { raw = await storage.getItem(storageKey); }
      catch (cause) { throw error('VIEW_COUNTS_STORAGE', 'Local view counts could not be read.', cause); }
      if (raw === null) return {schemaVersion:1, lastObservedAt:null, documents:[]};
      if (typeof raw !== 'string') corrupt();
      var parsed;
      try { parsed = JSON.parse(raw); } catch (_) { corrupt(); }
      return validate(parsed);
    }
    async function write(state) {
      try { await storage.setItem(storageKey, JSON.stringify(state)); }
      catch (cause) { throw error('VIEW_COUNTS_STORAGE', 'Local view counts could not be saved.', cause); }
    }
    function load(documentKeys) {
      return serial(async function () {
        if (!Array.isArray(documentKeys)) throw error('VIEW_COUNTS_INPUT', 'Document keys must be an array.');
        documentKeys.forEach(function (value) { key(value, 'Document key'); });
        var state = await read(), indexed = new Map(state.documents.map(function (doc) { return [doc.documentKey, doc.views]; }));
        var counts = Object.create(null);
        // Only requested, already-authorized document keys leave this adapter.
        documentKeys.forEach(function (value) { counts[value] = indexed.has(value) ? indexed.get(value) : 0; });
        return counts;
      });
    }
    function record(input) {
      return serial(async function () {
        if (!object(input)) throw error('VIEW_COUNTS_INPUT', 'A view record is required.');
        var documentKey = key(input.documentKey, 'Document key'), viewerKey = key(input.viewerKey, 'Viewer key');
        var requestId = input.requestId === undefined ? null : key(input.requestId, 'Request ID');
        var timestamp = now();
        if (!integer(timestamp)) throw error('VIEW_COUNTS_INPUT', 'The clock must return a nonnegative safe integer timestamp.');
        var state = await read(), doc = state.documents.find(function (value) { return value.documentKey === documentKey; });
        var result = function (counted) { return {documentKey:documentKey, views:doc ? doc.views : 0, counted:counted}; };
        var retry = doc && requestId !== null && doc.requests.find(function (value) { return value.requestId === requestId; });
        if (retry && retry.viewerKey !== viewerKey) throw error('VIEW_COUNTS_INPUT', 'This request ID was already used by a different viewer.');
        if (retry) return result(false);
        // Clock rollback never invents a second visit, even for a new viewer or
        // document. The last saved observation supplies a monotonic floor.
        if (state.lastObservedAt !== null && timestamp < state.lastObservedAt) return result(false);
        if (!doc) { doc = {documentKey:documentKey, views:0, viewers:[], requests:[]}; state.documents.push(doc); }
        var viewer = doc.viewers.find(function (value) { return value.viewerKey === viewerKey; });
        var counted = !viewer || timestamp - viewer.lastCountedAt >= WINDOW_MS;
        if (counted) {
          if (doc.views === Number.MAX_SAFE_INTEGER) throw error('VIEW_COUNTS_OVERFLOW', 'The local view count has reached the safe integer limit.');
          doc.views += 1;
          if (viewer) viewer.lastCountedAt = timestamp;
          else doc.viewers.push({viewerKey:viewerKey, lastCountedAt:timestamp});
        }
        if (requestId !== null) doc.requests.push({requestId:requestId, viewerKey:viewerKey, at:timestamp});
        // Repeat visits do not move lastCountedAt: the window starts with the
        // counted view, not with the latest render. Retry IDs are retained so a
        // delayed retry remains idempotent even after the window expires.
        state.lastObservedAt = timestamp;
        await write(state);
        return result(counted);
      });
    }
    function reset() {
      return serial(async function () {
        try { await storage.removeItem(storageKey); }
        catch (cause) { throw error('VIEW_COUNTS_STORAGE', 'Local view counts could not be reset.', cause); }
      });
    }
    return Object.freeze({load:load, record:record, reset:reset});
  }
  return Object.freeze({createLocal:createLocal, WINDOW_MS:WINDOW_MS});
});
