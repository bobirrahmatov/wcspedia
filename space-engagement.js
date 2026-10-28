/* Space-only helpfulness and recorded views. Native Confluence update permission
 * is required for JSON property writes. These cooperative measurements are not
 * full server analytics or tamper-proof ballots. Article loading reads two known
 * properties; only an explicit analytics export enumerates votes. */
(function (root, factory) {
  'use strict';
  var api = factory(root, typeof module === 'object' && module.exports ? require('./space-storage.js') : root.WCSSpaceStorage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSSpaceEngagement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Storage) {
  'use strict';
  var VOTE_PREFIX = 'wcspedia-helpfulness-v1-', VIEW_KEY = 'wcspedia-recorded-views-v1';
  var WINDOW_MS = 30 * 60 * 1000, MAX_ACTIVE = 180, MAX_BYTES = 32000, PAGE_SIZE = 50;
  var COVERAGE = Object.freeze({ scope: 'wcspedia-published-articles', actors: 'signed-in-users-with-native-page-update', viewDefinition: 'one-successfully-recorded-visit-per-account-per-30-minutes', completeConfluenceTraffic: false, ballotOwnership: 'cooperative-native-editors-can-edit-properties', consistency: 'non-atomic-export', activeViewCapacity: MAX_ACTIVE });
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function integer(v, min) { return Number.isSafeInteger(v) && v >= (min == null ? 0 : min); }
  function id(v) { return typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v); }
  function fail(code, message) { var e = new Error(message); e.code = code; e.outcome = code === 'UNKNOWN_COMMIT' ? 'unknown' : 'rejected'; throw e; }
  function abort(signal) { if (signal && signal.aborted) { var e = new Error('Engagement request cancelled.'); e.name = 'AbortError'; throw e; } }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function size(v) { if (new TextEncoder().encode(JSON.stringify(v)).byteLength > MAX_BYTES) fail('CAPACITY', 'The document engagement JSON exceeds its 32 KB property limit.'); }
  function requestId(v) { return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v); }
  function timestamp(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
  function validateProperty(prop, pageId, key) {
    if (!object(prop) || prop.key !== key || !id(String(prop.id)) || !object(prop.version) || !integer(prop.version.number, 1) || !object(prop.value) || prop.content && String(prop.content.id) !== pageId) fail('INVALID_DATA', 'Confluence returned malformed engagement metadata.');
    size(prop.value); return prop;
  }
  function voteData(prop, pageId, key) {
    if (!prop) return null;
    var v = validateProperty(prop, pageId, key).value;
    if (v.schemaVersion !== 1 || v.pageId !== pageId || !['yes', 'no'].includes(v.value) || !integer(v.pageVersion, 1) || !timestamp(v.updatedAt) || !requestId(v.requestId)) fail('INVALID_DATA', 'The saved helpfulness JSON is invalid.');
    return v;
  }
  function viewData(prop, pageId) {
    if (!prop) return { schemaVersion: 1, pageId: pageId, count: 0, lastRecordedAt: null, active: {} };
    var v = validateProperty(prop, pageId, VIEW_KEY).value;
    if (v.schemaVersion !== 1 || v.pageId !== pageId || !integer(v.count) || !object(v.active) || Object.keys(v.active).length > MAX_ACTIVE || v.count < Object.keys(v.active).length || (v.count === 0 ? v.lastRecordedAt !== null : !timestamp(v.lastRecordedAt))) fail('INVALID_DATA', 'The saved recorded-view JSON is invalid.');
    Object.keys(v.active).forEach(function (key) { var e = v.active[key]; if (!/^[a-f0-9]{64}$/.test(key) || !object(e) || !integer(e.at) || !/^wcsview-\d{1,16}-[a-f0-9]{32}$/.test(e.requestId || '') || Number(e.requestId.split('-')[1]) !== e.at) fail('INVALID_DATA', 'The saved recorded-view deduplication JSON is invalid.'); });
    return v;
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var publication = object(config.nativePublication) ? config.nativePublication : config;
    var rootId = config.rootPageId || config.pageIds && config.pageIds.home, space = config.spaceKey;
    var parents = Object.values(publication.areaPageIds || config.areaPageIds || {});
    var insights = config.insightsPageId || publication.insightsPageId; if (insights) parents.push(insights);
    if (!id(rootId) || typeof space !== 'string' || !space.trim() || space !== space.trim() || !parents.length || parents.length > 50 || parents.some(function (v) { return !id(v) || v === rootId; }) || new Set(parents).size !== parents.length) fail('CONFIGURATION', 'Configure the exact WCSpedia root, space and article parent page IDs.');
    var excluded = new Set([rootId].concat(parents)), excludedTrees = new Set();
    function exclude(v, tree) { if (v == null || v === '') return; if (!id(v)) fail('CONFIGURATION', 'Use numeric excluded page IDs.'); excluded.add(v); if (tree) excludedTrees.add(v); }
    exclude(config.attachmentPageId); Object.values(config.pageIds || {}).forEach(function (v) { exclude(v); });
    exclude(publication.workingRootPageId || config.workingRootPageId, true);
    var search = config.search || {};
    ['excludePageIds', 'excludeAncestorIds'].forEach(function (key) { if (search[key] != null && (!Array.isArray(search[key]) || search[key].length > 100)) fail('CONFIGURATION', 'Invalid engagement page exclusions.'); (search[key] || []).forEach(function (v) { exclude(v, key === 'excludeAncestorIds'); }); });
    if (excludedTrees.has(rootId) || parents.some(function (v) { return excludedTrees.has(v); })) fail('CONFIGURATION', 'Working pages must be separate from published article parents.');
    var store = dependencies.storage || Storage && Storage.create(Object.assign({}, config, { rootPageId: rootId, spaceKey: space, extraRootPageIds: [], allowedPageIds: [], protectedPageIds: Array.from(excluded), authorize: function (write) { verifyPage(write.page, write.pageId); return true; } }), dependencies);
    if (!store || typeof store.page !== 'function' || typeof store.request !== 'function') fail('CONFIGURATION', 'Native Confluence storage is required.');
    var crypto = dependencies.crypto || root.crypto, now = dependencies.now || Date.now, pendingViews = new Map(), pendingVotes = new Map();
    var maxProperties = config.maxEngagementProperties == null ? 100000 : config.maxEngagementProperties;
    if (!integer(maxProperties, 1) || maxProperties > 100000) fail('CONFIGURATION', 'Invalid engagement property export limit.');
    function clock() { var n = now(); if (!integer(n)) fail('INVALID_DATA', 'The browser clock is invalid.'); return n; }
    function verifyPage(p, pageId) {
      var ancestors = p && p.ancestors;
      if (!object(p) || String(p.id) !== pageId || p.type !== 'page' || p.status !== 'current' || !p.space || p.space.key !== space || !Array.isArray(ancestors) || ancestors.some(function (a) { return !object(a) || !id(String(a.id)); }) || !p.version || !integer(p.version.number, 1)) fail('OUT_OF_SCOPE', 'Engagement requires a current WCSpedia article.');
      var ids = ancestors.map(function (a) { return String(a.id); }), rootIndex = ids.indexOf(rootId);
      if (excluded.has(pageId) || rootIndex < 0 || ids.some(function (v) { return excludedTrees.has(v); }) || !parents.some(function (v) { return ids.indexOf(v) > rootIndex; })) fail('OUT_OF_SCOPE', 'Engagement is limited to published business-area and Insights child articles.');
      return p;
    }
    async function page(pageId, options) {
      if (!id(pageId)) fail('CONFIGURATION', 'Use a numeric document page ID.');
      abort(options && options.signal);
      return verifyPage(await store.page(pageId, '', options || {}), pageId);
    }
    async function identity(pageId, options) {
      if (!crypto || !crypto.subtle || !crypto.getRandomValues || typeof store.user !== 'function') fail('CONFIGURATION', 'Signed-in native identity and Web Crypto are required.');
      var u = await store.user(options || {}), actor = u && u.type === 'known' && (u.userKey ? 'key:' + u.userKey : u.accountId ? 'account:' + u.accountId : u.username ? 'user:' + u.username.toUpperCase() : null);
      if (!actor) return null;
      var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(space + ':' + rootId + ':' + pageId + ':' + actor));
      return Array.from(new Uint8Array(digest), function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    }
    function canUpdate(p) { return Array.isArray(p.operations) && p.operations.some(function (v) { return v.operation === 'update' && v.targetType === 'page'; }); }
    async function property(pageId, key, options) {
      try { return validateProperty(await store.request('/rest/api/content/' + pageId + '/property/' + key + '?expand=version', options || {}), pageId, key); }
      catch (error) { if (error.status === 404 || error.code === 'NOT_FOUND') return null; throw error; }
    }
    function result(p, actor, prop, views) {
      var v = actor ? voteData(prop, String(p.id), VOTE_PREFIX + actor) : null, allowed = !!actor && canUpdate(p);
      return { schemaVersion: 1, rootPageId: rootId, pageId: String(p.id), pageVersion: p.version.number, canVote: allowed, canRecord: allowed, reason: !actor ? 'Sign in to record helpfulness and views.' : allowed ? '' : 'Native Confluence page edit permission is required to record helpfulness and views.', myVote: { value: v ? v.value : null, revision: prop ? prop.version.number : 0, pageVersion: v ? v.pageVersion : null }, totals: null, views: { source: 'confluence-content-properties', status: 'available', recordedViews: views.count, windowMinutes: 30, lastRecordedAt: views.lastRecordedAt }, coverage: clone(COVERAGE) };
    }
    async function loadViews(pageId, options) {
      options = options || {};
      await page(pageId, options); // Same scope and access verification as the reader.
      var views = viewData(await property(pageId, VIEW_KEY, options), pageId);
      return {pageId:String(pageId),views:{recordedViews:views.count}};
    }
    async function load(pageId, options) {
      options = options || {};
      var pair = await Promise.all([page(pageId, options), identity(pageId, options)]), p = pair[0], actor = pair[1];
      var props = await Promise.all([actor ? property(pageId, VOTE_PREFIX + actor, options) : null, property(pageId, VIEW_KEY, options)]);
      var snapshot = result(p, actor, props[0], viewData(props[1], pageId)), pendingKey = pageId + ':' + actor, pending = actor && pendingVotes.get(pendingKey);
      if (pending && props[0] && ((props[0].value.requestId === pending.requestId && props[0].value.value === pending.value) || integer(pending.expected) && props[0].version.number > pending.expected)) pendingVotes.delete(pendingKey);
      pending = actor && pendingVotes.get(pendingKey);
      // An absent or unchanged property does not prove an in-flight write failed.
      // Keep its immutable command available for an explicit, idempotent retry.
      snapshot.pendingVote = pending ? { value: pending.value, requestId: pending.requestId, expectedVoteRevision: pending.expected, pageVersion: pending.pageVersion } : null;
      return snapshot;
    }
    function random() { if (!crypto || typeof crypto.getRandomValues !== 'function') fail('CONFIGURATION', 'Secure request identifiers are unavailable.'); return Array.from(crypto.getRandomValues(new Uint8Array(16)), function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    async function writable(pageId, options) {
      var pair = await Promise.all([page(pageId, options), identity(pageId, options)]);
      if (!pair[1]) fail('AUTH_REQUIRED', 'Sign in to record helpfulness and views.');
      if (!canUpdate(pair[0])) fail('FORBIDDEN', 'Native Confluence page edit permission is required to record helpfulness and views.');
      if (typeof store.putProperty !== 'function') fail('CONFIGURATION', 'Native engagement writes are unavailable.');
      return pair;
    }
    async function vote(pageId, value, options) {
      options = options || {}; if (!['yes', 'no'].includes(value)) fail('INVALID_DATA', 'Choose a helpful or unhelpful vote.');
      var pair = await writable(pageId, options), p = pair[0], actor = pair[1], key = VOTE_PREFIX + actor;
      var pendingKey = pageId + ':' + actor, command = pendingVotes.get(pendingKey), wasPending = !!command;
      if (command && command.value !== value) fail('UNKNOWN_COMMIT', 'Reconcile the previous helpfulness vote before changing your choice.');
      if (!command && options.pageVersion != null && options.pageVersion !== p.version.number) fail('CONFLICT', 'The article changed since helpfulness was loaded. Reload before voting.');
      if (!command) { command = { requestId: options.requestId || 'wcsvote-' + random(), value: value, pageVersion: p.version.number, expected: options.expectedVoteRevision }; if (!requestId(command.requestId)) fail('CONFIGURATION', 'Use a valid helpfulness request ID.'); pendingVotes.set(pendingKey, command); }
      var before, data, saved;
      try { before = await property(pageId, key, options); data = voteData(before, pageId, key); }
      catch (error) { if (!wasPending) pendingVotes.delete(pendingKey); throw error; }
      if (data && data.requestId === command.requestId) {
        if (data.value !== command.value) { pendingVotes.delete(pendingKey); fail('CONFLICT', 'This request ID was used for another vote.'); } saved = before;
      } else {
        if (command.expected == null) command.expected = before ? before.version.number : 0;
        if (!integer(command.expected) || command.expected !== (before ? before.version.number : 0)) { pendingVotes.delete(pendingKey); fail('CONFLICT', 'Your helpfulness vote changed in another tab. Reload before voting.'); }
        var next = { schemaVersion: 1, pageId: pageId, value: value, pageVersion: command.pageVersion, updatedAt: new Date(clock()).toISOString(), requestId: command.requestId };
        try { saved = await store.putProperty(pageId, key, next, before ? before.version.number : null, options); voteData(saved, pageId, key); }
        catch (error) {
          if (error.code !== 'UNKNOWN_COMMIT') { pendingVotes.delete(pendingKey); throw error; }
          try { saved = await property(pageId, key, {}); var receipt = voteData(saved, pageId, key); if (!receipt || receipt.requestId !== command.requestId || receipt.value !== value) throw error; }
          catch (_) { throw error; }
        }
      }
      pendingVotes.delete(pendingKey);
      return { accepted: true, requestId: command.requestId, pageId: pageId, pageVersion: p.version.number, canVote: true, myVote: { value: value, revision: saved.version.number, pageVersion: saved.value.pageVersion }, totals: null, coverage: clone(COVERAGE) };
    }
    async function recordView(pageId, options) {
      options = options || {}; var pair = await writable(pageId, options), actor = pair[1], pendingKey = pageId + ':' + actor;
      var command = pendingViews.get(pendingKey), nowMs = clock();
      if (!command) {
        var rid = options.requestId || 'wcsview-' + nowMs + '-' + random(), match = /^wcsview-(\d{1,16})-([a-f0-9]{32})$/.exec(rid);
        if (!match) fail('CONFIGURATION', 'Use the original timestamped WCSpedia view request ID.');
        command = { requestId: rid, at: Number(match[1]) }; pendingViews.set(pendingKey, command);
      }
      if (command.at > nowMs + 60000 || nowMs - command.at >= WINDOW_MS) { pendingViews.delete(pendingKey); fail('EXPIRED', 'This view request expired; it was not counted again. Reload to record a new visit.'); }
      for (var attempt = 0; attempt < 5; attempt++) {
        nowMs = clock();
        if (nowMs - command.at >= WINDOW_MS) { pendingViews.delete(pendingKey); fail('EXPIRED', 'This view request expired; it was not counted again.'); }
        abort(options.signal); var before = await property(pageId, VIEW_KEY, options), data = viewData(before, pageId), mine = data.active[actor];
        if (mine && mine.at > command.at - WINDOW_MS) { pendingViews.delete(pendingKey); return { recorded: mine.requestId === command.requestId, deduplicated: mine.requestId !== command.requestId, requestId: command.requestId, views: data.count, counted: mine.requestId === command.requestId, recordedViews: data.count, lastRecordedAt: data.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) }; }
        var next = clone(data); Object.keys(next.active).forEach(function (key) { if (next.active[key].at <= nowMs - WINDOW_MS) delete next.active[key]; });
        if (Object.keys(next.active).length >= MAX_ACTIVE && !next.active[actor]) { pendingViews.delete(pendingKey); fail('CAPACITY', 'This document reached its active recorded-view limit. This visit was not counted; try again after 30 minutes.'); }
        if (!integer(data.count + 1)) fail('CAPACITY', 'The recorded-view counter reached its safe limit.');
        next.count++; next.active[actor] = { at: command.at, requestId: command.requestId }; next.lastRecordedAt = new Date(Math.max(command.at, Date.parse(data.lastRecordedAt) || 0)).toISOString(); size(next);
        try {
          var written = await store.putProperty(pageId, VIEW_KEY, next, before ? before.version.number : null, options), confirmed = viewData(written, pageId);
          if (!confirmed.active[actor] || confirmed.active[actor].requestId !== command.requestId) fail('UNKNOWN_COMMIT', 'The view write was not confirmed. Retry the original request.');
          pendingViews.delete(pendingKey); return { recorded: true, deduplicated: false, requestId: command.requestId, views: confirmed.count, counted: true, recordedViews: confirmed.count, lastRecordedAt: confirmed.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) };
        } catch (error) {
          if (error.code === 'CONFLICT') continue;
          if (error.code === 'UNKNOWN_COMMIT') {
            try { var checked = viewData(await property(pageId, VIEW_KEY, {}), pageId), entry = checked.active[actor]; if (entry && entry.requestId === command.requestId) { pendingViews.delete(pendingKey); return { recorded: true, deduplicated: false, requestId: command.requestId, views: checked.count, counted: true, recordedViews: checked.count, lastRecordedAt: checked.lastRecordedAt, windowMinutes: 30, coverage: clone(COVERAGE) }; } } catch (_) {}
          } else pendingViews.delete(pendingKey);
          throw error;
        }
      }
      pendingViews.delete(pendingKey); fail('CONFLICT', 'Recorded views changed repeatedly. This visit was not confirmed; retry.');
    }
    async function exportDocument(pageId, options) {
      options = options || {}; var p = await page(pageId, options), start = 0, seen = new Set(), votes = { yes: 0, no: 0, total: 0 }, versions = {}, view = null;
      if (options.pageVersion != null && options.pageVersion !== p.version.number) fail('CONFLICT', 'The article changed during analytics collection.');
      do {
        abort(options.signal);
        var path = '/rest/api/content/' + pageId + '/property', batch = await store.request(path + '?expand=version&limit=' + PAGE_SIZE + '&start=' + start, { signal: options.signal });
        if (!object(batch) || !Array.isArray(batch.results) || batch.results.length > PAGE_SIZE || !object(batch._links) || batch.start != null && batch.start !== start || batch.size != null && batch.size !== batch.results.length) fail('INVALID_DATA', 'Invalid engagement analytics pagination.');
        batch.results.forEach(function (prop) {
          if (!object(prop) || typeof prop.key !== 'string' || seen.has(prop.key)) fail('INCOMPLETE', 'Engagement properties changed during analytics collection.');
          seen.add(prop.key); if (seen.size > maxProperties) fail('LIMIT', 'This document exceeded the engagement analytics property limit.');
          if (prop.key === VIEW_KEY) view = viewData(prop, pageId);
          else if (prop.key.startsWith(VOTE_PREFIX)) {
            if (!/^[a-f0-9]{64}$/.test(prop.key.slice(VOTE_PREFIX.length))) fail('INVALID_DATA', 'Malformed helpfulness property key.');
            var value = voteData(prop, pageId, prop.key); if (value.pageVersion > p.version.number) fail('INVALID_DATA', 'Helpfulness refers to a future article version.');
            votes[value.value]++; votes.total++;
            var tally = versions[value.pageVersion] || (versions[value.pageVersion] = { pageVersion: value.pageVersion, yes: 0, no: 0, total: 0 }); tally[value.value]++; tally.total++;
          }
        });
        var count = batch.results.length, next = batch._links.next, total = batch.totalSize == null ? batch.totalCount : batch.totalSize;
        if (total != null && (!integer(total) || total < start + count)) fail('INVALID_DATA', 'Invalid engagement analytics totals.');
        if (!next) { if (total != null && total > start + count) fail('INCOMPLETE', 'Not all engagement properties were returned.'); start = null; }
        else {
          if (!count || typeof next !== 'string' || /[\\\u0000-\u0020]/.test(next) || /%(?:2e|2f|5c|25)/i.test(next)) fail('INVALID_DATA', 'Invalid engagement continuation link.');
          var url; try { url = new URL(next, dependencies.origin || root.location && root.location.origin || 'https://confluence.invalid'); } catch (_) { fail('INVALID_DATA', 'Invalid engagement continuation URL.'); }
          var raw = url.searchParams.get('start'), expectedOrigin = dependencies.origin || root.location && root.location.origin;
          if (expectedOrigin && url.origin !== expectedOrigin) fail('INVALID_DATA', 'Engagement pagination escaped the Confluence origin.');
          if (!/^\d+$/.test(raw || '') || url.searchParams.getAll('start').length !== 1 || Number(raw) !== start + count || url.hash || url.username || url.password || ![path, (config.contextPath == null ? '/confluence' : config.contextPath).replace(/\/$/, '') + path].includes(url.pathname)) fail('INVALID_DATA', 'Invalid engagement continuation offset.');
          // Only the validated offset is reused. Never follow supplied URLs.
          start = Number(raw);
        }
      } while (start !== null);
      view = view || viewData(null, pageId);
      var current = versions[p.version.number] || { yes: 0, no: 0, total: 0 };
      return { schemaVersion: 1, pageId: pageId, pageVersion: p.version.number, observedAt: new Date(clock()).toISOString(), helpfulness: Object.assign({ source: 'confluence-content-properties', status: 'available' }, votes, { currentVersionTotals: { yes: current.yes, no: current.no, total: current.total }, byPageVersion: Object.keys(versions).map(Number).sort(function (a, b) { return a - b; }).map(function (v) { return versions[v]; }) }), views: { source: 'confluence-content-properties', status: 'available', recordedViews: view.count, windowMinutes: 30, lastRecordedAt: view.lastRecordedAt }, coverage: clone(COVERAGE) };
    }
    return Object.freeze({ load: load, loadViews: loadViews, vote: vote, recordView: recordView, exportDocument: exportDocument });
  }
  return Object.freeze({ create: create, votePrefix: VOTE_PREFIX, viewKey: VIEW_KEY, coverage: COVERAGE });
});
