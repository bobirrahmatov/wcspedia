/* Native JSON feedback, with the earlier service adapter retained for legacy mode. */
(function (global) {
  'use strict';
  if (global.WCSArticleFeedback) return;
  function nativeClient(options) {
    function error(message, outcome) { var e = new Error(message); e.outcome = outcome || 'unknown'; return e; }
    function integer(value, minimum) { return Number.isSafeInteger(value) && value >= minimum; }
    var expectedRoot = options.rootPageId || options.config && options.config.rootPageId;
    if (!/^[1-9]\d{0,19}$/.test(options.pageId || '') || expectedRoot != null && !/^[1-9]\d{0,19}$/.test(expectedRoot)) throw error('Native feedback requires numeric document and root page IDs.', 'rejected');
    if (!options.engagement && !global.WCSSpaceEngagement) throw error('Load the matching native engagement module.', 'rejected');
    var adapter = options.engagement || global.WCSSpaceEngagement.create(options.config || options), state, writing = false, pending;
    if (!adapter || typeof adapter.load !== 'function' || typeof adapter.vote !== 'function') throw error('The native engagement adapter is unavailable.', 'rejected');
    function validate(value, receipt) {
      if (!value || (!receipt && value.schemaVersion !== 1) || (value.schemaVersion != null && value.schemaVersion !== 1) || value.pageId !== options.pageId || expectedRoot && value.rootPageId != null && value.rootPageId !== expectedRoot || !integer(value.pageVersion, 1) || typeof value.canVote !== 'boolean' || !value.myVote || ![null, 'yes', 'no'].includes(value.myVote.value) || !integer(value.myVote.revision, 0)) throw error('Feedback could not be confirmed.');
      var vote = value.myVote;
      if (vote.value === null ? vote.revision !== 0 || vote.pageVersion !== null : !integer(vote.revision, 1) || !integer(vote.pageVersion, 1) || vote.pageVersion > value.pageVersion) throw error('Feedback could not be confirmed.');
      var unresolved = value.pendingVote;
      if (unresolved != null && (!['yes', 'no'].includes(unresolved.value) || typeof unresolved.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(unresolved.requestId) || !integer(unresolved.expectedVoteRevision, 0) || !integer(unresolved.pageVersion, 1) || unresolved.pageVersion > value.pageVersion)) throw error('The pending feedback command could not be confirmed.');
      if (receipt && (value.accepted !== true || value.requestId !== receipt.requestId || vote.value !== receipt.value || vote.pageVersion !== receipt.pageVersion || vote.revision <= receipt.expectedVoteRevision)) throw error('The feedback save receipt could not be confirmed.');
      return value;
    }
    function project(value, receipt) {
      validate(value, receipt);
      // Retain only validated state; an external prime caller cannot mutate the
      // revision or permission used by the next command after this call returns.
      state = {pageVersion: value.pageVersion, canVote: value.canVote, reason: typeof value.reason === 'string' ? value.reason : '', myVote: {value: value.myVote.value, revision: value.myVote.revision, pageVersion: value.myVote.pageVersion}};
      if (receipt) pending = null;
      else if (Object.prototype.hasOwnProperty.call(value, 'pendingVote')) pending = value.pendingVote ? {value: value.pendingVote.value, requestId: value.pendingVote.requestId, expectedVoteRevision: value.pendingVote.expectedVoteRevision, pageVersion: value.pendingVote.pageVersion} : null;
      return {canVote: state.canVote, vote: state.myVote.value, reason: state.reason, source: 'confluence-json', pendingVote: pending ? {value: pending.value} : null};
    }
    function secureId() {
      try { return typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Array.from(global.crypto.getRandomValues(new Uint8Array(24))).map(function (value) { return value.toString(16).padStart(2, '0'); }).join(''); }
      catch (_) { throw error('Secure request identifiers are unavailable.', 'rejected'); }
    }
    return Object.freeze({
      prime: function (value) { return project(value); },
      load: async function (args) { return project(await adapter.load(options.pageId, args || {})); },
      save: async function (value, args) {
        if (!state || !state.canVote || writing || !['yes', 'no'].includes(value)) throw error('Load feedback and verify native permission before voting.', 'rejected');
        if (args && args.signal && args.signal.aborted) throw error('Feedback cancelled before saving.', 'rejected');
        if (pending && pending.value !== value) throw error('Resolve the previous feedback save before changing your choice.');
        var retrying = !!pending;
        if (!pending) pending = {value: value, requestId: secureId(), expectedVoteRevision: state.myVote.revision, pageVersion: state.pageVersion};
        var command = pending; writing = true;
        try {
          var result = await adapter.vote(options.pageId, value, Object.assign({}, command, {signal: args && args.signal}));
          var projected = project(result, command); pending = null; return projected;
        } catch (failure) {
          // An invalid/lost confirmation remains unknown; only definite native
          // rejections permit the UI to present an ordinary retry immediately.
          if (!failure.outcome && failure.code && !['UNKNOWN_COMMIT', 'NETWORK', 'TIMEOUT'].includes(failure.code) && failure.name !== 'AbortError') failure.outcome = 'rejected';
          // A rejected retry does not establish the outcome of the earlier
          // request. Only a subsequent native read can release that uncertainty.
          if (retrying) failure.outcome = 'unknown';
          else if (failure.outcome === 'rejected') pending = null;
          throw failure;
        } finally { writing = false; }
      }
    });
  }
  function create(options) {
    options = options || {};
    if (options.authoringMode === 'confluence-session' || options.config && options.config.authoringMode === 'confluence-session') return nativeClient(options);
    var endpoint = new URL(options.endpoint, global.location.href);
    var context = options.contextPath || '/confluence';
    if (endpoint.origin !== global.location.origin || endpoint.username || endpoint.password || !endpoint.pathname.startsWith(context + '/') || endpoint.search || endpoint.hash || !/^[1-9]\d{0,19}$/.test(options.rootPageId) || !/^[1-9]\d{0,19}$/.test(options.pageId)) throw new Error('Feedback requires a same-origin Confluence endpoint and numeric page IDs.');
    var state = null, writing = false;
    function error(message, definite) { var value = new Error(message); value.outcome = definite ? 'rejected' : 'unknown'; return value; }
    function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
    function totals(value) { return value && ['yes', 'no', 'total'].every(function (key) { return integer(value[key]); }) && value.yes + value.no === value.total; }
    function normalize(data, command) {
      if (!data || data.schemaVersion !== 1 || String(data.rootPageId) !== String(options.rootPageId) || String(data.pageId) !== String(options.pageId) || !integer(data.revision) || !data.myVote || !integer(data.myVote.revision) || !integer(data.pageVersion) || data.pageVersion < 1 || ![null, 'yes', 'no'].includes(data.myVote.value) || !totals(data.totals) || !totals(data.currentVersionTotals) || data.currentVersionTotals.total > data.totals.total || (data.myVote.value === null ? data.myVote.pageVersion !== null || data.myVote.revision !== 0 : !integer(data.myVote.pageVersion) || data.myVote.pageVersion < 1 || data.myVote.revision < 1)) throw error('Invalid feedback confirmation.', false);
      if (command && (data.accepted !== true || data.requestId !== command.requestId || data.myVote.value !== command.value || typeof data.changed !== 'boolean')) throw error('Invalid feedback save receipt.', false);
      if (!state || data.revision >= state.revision) state = data;
      return {canVote: true, vote: state.myVote.value, helpful: state.totals.yes, total: state.totals.total};
    }
    async function request(url, init, signal, command) {
      var controller = new global.AbortController(), timeout = setTimeout(function () { controller.abort(); }, 12000);
      function abort() { controller.abort(); }
      if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true}); }
      try {
        var response = await global.fetch(url, Object.assign({credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal}, init));
        if (!response.ok) throw error('Feedback request failed (' + response.status + ').', [400, 401, 403, 404, 409, 413, 422, 429].includes(response.status));
        return normalize(await response.json(), command);
      } finally { clearTimeout(timeout); if (signal) signal.removeEventListener('abort', abort); }
    }
    return Object.freeze({
      load: function (args) {
        var url = new URL(endpoint.href); url.searchParams.set('rootPageId', options.rootPageId); url.searchParams.set('pageId', options.pageId);
        return request(url.href, {}, args && args.signal);
      },
      save: async function (value, args) {
        if (!state || writing || !['yes', 'no'].includes(value)) throw error('Load feedback before voting; only one vote can be saved at a time.', true);
        if (args && args.signal && args.signal.aborted) throw error('Feedback cancelled before saving.', true);
        var requestId;
        try { requestId = typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Array.from(global.crypto.getRandomValues(new Uint8Array(24))).map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); } catch (_) { throw error('Secure request identifiers are unavailable.', true); }
        var command = {rootPageId: options.rootPageId, pageId: options.pageId, pageVersion: state.pageVersion, value: value, expectedVoteRevision: state.myVote.revision, requestId: requestId};
        writing = true;
        try { return await request(endpoint.href, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': requestId}, body: JSON.stringify(command)}, args && args.signal, command); }
        finally { writing = false; }
      }
    });
  }
  global.WCSArticleFeedback = Object.freeze({create: create});
})(window);
