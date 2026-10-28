/* Explicit, read-only analytics export. No request starts until collect() is
 * called. Native comments and recorded engagement JSON remain on their pages;
 * bodies and account records are never copied into the report. No JSON
 * attachment is written, and no background article/property scan is started. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSArticleAnalyticsDownload = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PAGE_SIZE = 50, MAX_RESPONSE = 4 * 1024 * 1024;
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function id(value) { return (typeof value === 'string' || Number.isSafeInteger(value)) && /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : ''; }
  function fail(code, message) { var error = new Error(message); error.code = code; throw error; }
  function abort(signal) { if (signal && signal.aborted) { var error = new Error('Analytics download cancelled. No partial report was downloaded.'); error.name = 'AbortError'; throw error; } }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
  function quote(value) { return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var fetcher = dependencies.fetch || (root.fetch && root.fetch.bind(root)), location = dependencies.location || root.location, address;
    try { address = new URL(location && (location.href || location.origin)); } catch (_) { fail('CONFIGURATION', 'Open analytics from the signed-in Confluence site.'); }
    if (!/^https?:$/.test(address.protocol) || address.username || address.password || typeof fetcher !== 'function') fail('CONFIGURATION', 'Use the signed-in Confluence origin.');
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || context && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context)) fail('CONFIGURATION', 'Use a plain Confluence context path.');
    context = context.replace(/\/+$/, '');
    var rootId = id(config.rootPageId), spaceKey = config.spaceKey;
    if (!rootId || typeof spaceKey !== 'string' || !spaceKey.trim() || spaceKey !== spaceKey.trim() || spaceKey.length > 255 || /[\u0000-\u001f\u007f]/.test(spaceKey)) fail('CONFIGURATION', 'Configure the exact WCSpedia root page and space key.');
    var publication = object(config.nativePublication) ? config.nativePublication : config;
    var areaMap = object(publication.areaPageIds) ? publication.areaPageIds : {}, parents = [];
    Object.keys(areaMap).forEach(function (key) { parents.push({ id: id(areaMap[key]), areaId: key, collection: 'business-area' }); });
    var insights = config.insightsPageId || publication.insightsPageId;
    if (insights) parents.push({ id: id(insights), areaId: null, collection: 'insights' });
    if (!parents.length || parents.length > 50 || parents.some(function (parent) { return !parent.id || parent.id === rootId; }) || new Set(parents.map(function (parent) { return parent.id; })).size !== parents.length) fail('CONFIGURATION', 'Configure distinct business-area or Insights parent page IDs beneath WCSpedia.');
    var excludedPages = new Set([rootId].concat(parents.map(function (parent) { return parent.id; }))), excludedTrees = new Set();
    function exclude(value, subtree) {
      if (value == null || value === '') return;
      var parsed = id(value); if (!parsed) fail('CONFIGURATION', 'Exclusions require numeric Confluence page IDs.');
      excludedPages.add(parsed); if (subtree) excludedTrees.add(parsed);
    }
    exclude(config.attachmentPageId);
    Object.keys(object(config.pageIds) ? config.pageIds : {}).forEach(function (key) { exclude(config.pageIds[key]); });
    exclude(publication.workingRootPageId || config.workingRootPageId, true);
    var search = object(config.search) ? config.search : {};
    ['excludePageIds', 'excludeAncestorIds'].forEach(function (key) {
      if (search[key] != null && (!Array.isArray(search[key]) || search[key].length > 100)) fail('CONFIGURATION', 'Use at most 100 excluded pages.');
      (search[key] || []).forEach(function (value) { exclude(value, key === 'excludeAncestorIds'); });
    });
    if (excludedTrees.has(rootId) || parents.some(function (parent) { return excludedTrees.has(parent.id); })) fail('CONFIGURATION', 'The working subtree must be separate from published articles.');
    function bound(name, fallback, min, max) { var value = config[name] == null ? fallback : config[name]; if (!Number.isSafeInteger(value) || value < min || value > max) fail('CONFIGURATION', 'Invalid analytics limit: ' + name + '.'); return value; }
    var concurrency = bound('concurrency', 2, 1, 4), maxDocuments = bound('maxDocuments', 10000, 1, 100000), maxBatches = bound('maxBatches', 2000, 1, 10000), maxComments = bound('maxCommentsPerDocument', 100000, 1, 1000000), timeoutMs = bound('timeoutMs', 15000, 1000, 30000), maxRequests = bound('maxRequests', 50000, 1, 100000);
    var nativeEngagement = config.authoringMode === 'confluence-session';
    var feedbackUrl = null;
    if (!nativeEngagement && config.feedbackEndpoint) {
      try { feedbackUrl = new URL(config.feedbackEndpoint, address.origin); } catch (_) { fail('CONFIGURATION', 'Invalid helpfulness analytics endpoint.'); }
      if (feedbackUrl.origin !== address.origin || feedbackUrl.username || feedbackUrl.password || feedbackUrl.search || feedbackUrl.hash || context && !feedbackUrl.pathname.startsWith(context + '/')) fail('CONFIGURATION', 'Use a same-origin helpfulness endpoint inside Confluence.');
    }
    var now = dependencies.now || Date.now, running = false;
    function clock() { var value = now(); if (!integer(value)) fail('INVALID_DATA', 'The browser clock is invalid.'); return new Date(value).toISOString(); }
    function endpoint(path, query) { var url = new URL(context + '/rest/api' + path, address.origin); if (query) url.search = new URLSearchParams(query).toString(); return url; }
    function ancestry(page) {
      if (!Array.isArray(page.ancestors) || page.ancestors.some(function (ancestor) { return !object(ancestor) || !id(ancestor.id); })) fail('INVALID_DATA', 'Confluence did not return complete page ancestry.');
      return page.ancestors.map(function (ancestor) { return id(ancestor.id); });
    }
    function nativePage(page, expectedId) {
      if (!object(page) || !id(page.id) || expectedId && id(page.id) !== expectedId || page.type !== 'page' || page.status !== 'current' || !object(page.space) || page.space.key !== spaceKey) fail('OUT_OF_SCOPE', 'Confluence returned a page outside the configured WCSpedia space.');
    }
    function engagementSummary(value, pageId, pageVersion) {
      var votes = value && value.helpfulness, views = value && value.views, coverage = value && value.coverage;
      if (!object(value) || value.schemaVersion !== 1 || value.pageId !== pageId || value.pageVersion !== pageVersion || !object(votes) || votes.source !== 'confluence-content-properties' || votes.status !== 'available' || !object(views) || views.source !== 'confluence-content-properties' || views.status !== 'available' || !object(coverage)) fail('INVALID_DATA', 'Native engagement analytics returned an inconsistent document snapshot.');
      function totals(value) {
        if (!object(value) || !integer(value.yes) || !integer(value.no) || !integer(value.total) || !Number.isSafeInteger(value.yes + value.no) || value.yes + value.no !== value.total) fail('INVALID_DATA', 'Native helpfulness totals are inconsistent.');
        return { yes: value.yes, no: value.no, total: value.total };
      }
      var all = totals(votes), current = totals(votes.currentVersionTotals), versions = new Set(), sums = { yes: 0, no: 0, total: 0 };
      if (!Array.isArray(votes.byPageVersion) || votes.byPageVersion.length > maxComments) fail('INVALID_DATA', 'Native helpfulness version totals are missing or oversized.');
      var byVersion = votes.byPageVersion.map(function (entry) {
        if (!object(entry) || !Number.isSafeInteger(entry.pageVersion) || entry.pageVersion < 1 || entry.pageVersion > pageVersion || versions.has(entry.pageVersion)) fail('INVALID_DATA', 'Native helpfulness versions are inconsistent.');
        versions.add(entry.pageVersion); var count = totals(entry);
        Object.keys(sums).forEach(function (key) { sums[key] += count[key]; if (!Number.isSafeInteger(sums[key])) fail('INVALID_DATA', 'Native helpfulness totals are too large.'); });
        return { pageVersion: entry.pageVersion, yes: count.yes, no: count.no, total: count.total };
      }).sort(function (a, b) { return a.pageVersion - b.pageVersion; });
      var currentVersion = byVersion.find(function (entry) { return entry.pageVersion === pageVersion; }) || { yes: 0, no: 0, total: 0 };
      if (Object.keys(sums).some(function (key) { return sums[key] !== all[key] || currentVersion[key] !== current[key]; })) fail('INVALID_DATA', 'Native helpfulness aggregate and version totals disagree.');
      var lastRecorded = views.lastRecordedAt == null ? null : timestamp(views.lastRecordedAt), observedAt = timestamp(value.observedAt);
      if (!integer(views.recordedViews) || views.windowMinutes !== 30 || views.lastRecordedAt != null && !lastRecorded || views.recordedViews > 0 && !lastRecorded || views.recordedViews === 0 && lastRecorded || !observedAt) fail('INVALID_DATA', 'Native recorded view metadata is inconsistent.');
      var expectedCoverage = { scope: 'wcspedia-published-articles', actors: 'signed-in-users-with-native-page-update', viewDefinition: 'one-successfully-recorded-visit-per-account-per-30-minutes', completeConfluenceTraffic: false, ballotOwnership: 'cooperative-native-editors-can-edit-properties', consistency: 'non-atomic-export', activeViewCapacity: 180 };
      if (Object.keys(expectedCoverage).some(function (key) { return coverage[key] !== expectedCoverage[key]; })) fail('INVALID_DATA', 'Native engagement coverage was not identified accurately.');
      // Select aggregate fields explicitly: raw properties, account hashes,
      // names, request IDs and unexpected adapter fields never enter the JSON.
      return {
        helpfulness: { source: 'confluence-content-properties', status: 'available', yes: all.yes, no: all.no, total: all.total, currentVersionTotals: current, byPageVersion: byVersion },
        views: { source: 'confluence-content-properties', status: 'available', recordedViews: views.recordedViews, windowMinutes: views.windowMinutes, lastRecordedAt: lastRecorded },
        engagementCoverage: expectedCoverage,
        engagementObservedAt: observedAt
      };
    }
    function nextOffset(batch, path, start) {
      if (!object(batch) || !Array.isArray(batch.results) || !object(batch._links) || batch.results.length > PAGE_SIZE || batch.start != null && batch.start !== start || batch.size != null && batch.size !== batch.results.length) fail('INVALID_DATA', 'Confluence returned invalid analytics pagination.');
      var count = batch.results.length, next = batch._links && batch._links.next;
      var total = batch.totalSize == null ? batch.totalCount : batch.totalSize;
      if (total != null && (!integer(total) || total < start + count)) fail('INVALID_DATA', 'Confluence returned inconsistent analytics totals.');
      if (!next) {
        if (total != null && total > start + count) fail('INCOMPLETE', 'Confluence did not return all analytics results. Try the download again.');
        return null;
      }
      if (!count || typeof next !== 'string' || /[\\\u0000-\u0020]/.test(next) || /%(?:2e|2f|5c|25)/i.test(next)) fail('INVALID_DATA', 'Invalid analytics continuation link.');
      var url;
      try { url = new URL(next, address.origin + context + '/'); } catch (_) { fail('INVALID_DATA', 'Invalid analytics continuation link.'); }
      var expected = '/rest/api' + path, raw = url.searchParams.get('start'), offset = Number(raw);
      if (url.origin !== address.origin || url.username || url.password || url.hash || url.pathname !== context + expected && url.pathname !== expected || url.searchParams.getAll('start').length !== 1 || !/^\d+$/.test(raw || '') || !Number.isSafeInteger(offset) || offset !== start + count) fail('INVALID_DATA', 'Invalid analytics continuation offset.');
      // Reuse only the offset. The caller always reconstructs the exact scoped
      // CQL/metadata request; a server-supplied URL can never broaden the scan.
      return offset;
    }
    async function collect(options) {
      options = options || {}; abort(options.signal);
      if (running) fail('BUSY', 'An analytics download is already running.');
      running = true;
      var controller = new AbortController(), signal = controller.signal, requests = 0;
      var onAbort = function () { controller.abort(); };
      if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true });
      function progress(phase, completed, total) { if (typeof options.onProgress === 'function') options.onProgress({ phase: phase, completed: completed, total: total, requests: requests }); }
      async function request(url) {
        abort(signal);
        if (++requests > maxRequests) fail('LIMIT', 'Analytics exceeded the request limit. No partial report was downloaded.');
        var child = new AbortController(), timedOut = false, cancel = function () { child.abort(); };
        signal.addEventListener('abort', cancel, { once: true });
        var timer = setTimeout(function () { timedOut = true; child.abort(); }, timeoutMs);
        try {
          var response;
          try { response = await fetcher(url.href, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: child.signal, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }); }
          catch (_) { abort(signal); fail(timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'Confluence took too long to return analytics. Try the download again.' : 'Confluence could not be reached. No partial report was downloaded.'); }
          abort(signal);
          if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR', 'Analytics could not read Confluence metadata (HTTP ' + response.status + '). No partial report was downloaded.');
          var bytes, value;
          try { bytes = await response.text(); if (bytes.length > MAX_RESPONSE) fail('LIMIT', 'An analytics response was too large.'); value = JSON.parse(bytes); }
          catch (error) { abort(signal); if (error.code) throw error; fail('INVALID_DATA', 'Confluence returned invalid analytics data. No partial report was downloaded.'); }
          abort(signal); return value;
        } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
      }
      async function each(items, task) {
        var index = 0, firstError = null;
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async function () {
          try { while (index < items.length) { abort(signal); var item = items[index++]; await task(item); } }
          catch (error) { if (!firstError) firstError = error; controller.abort(); }
        }));
        if (firstError) throw firstError;
      }
      async function comments(pageId) {
        var start = 0, batches = 0, seen = new Set(), total = 0, replies = 0, latest = null, datesComplete = true;
        do {
          if (++batches > maxBatches) fail('LIMIT', 'Comment pagination exceeded its limit. No partial report was downloaded.');
          var path = '/content/' + pageId + '/child/comment';
          var batch = await request(endpoint(path, { expand: 'history,ancestors,container', location: 'footer', depth: 'all', start: String(start), limit: String(PAGE_SIZE) }));
          var next = nextOffset(batch, path, start);
          batch.results.forEach(function (comment) {
            if (!object(comment) || !id(comment.id) || comment.type !== 'comment' || comment.status && comment.status !== 'current' || !object(comment.container) || id(comment.container.id) !== pageId || comment.container.type !== 'page' || comment.extensions && comment.extensions.location && comment.extensions.location !== 'footer') fail('OUT_OF_SCOPE', 'Confluence returned an unrelated comment. No partial report was downloaded.');
            if (seen.has(id(comment.id))) fail('INCOMPLETE', 'Comments changed during collection. Try the download again.');
            seen.add(id(comment.id)); if (++total > maxComments) fail('LIMIT', 'A document exceeded the comment limit. No partial report was downloaded.');
            if (!Array.isArray(comment.ancestors) || comment.ancestors.some(function (ancestor) { return !object(ancestor) || !id(ancestor.id); })) fail('INVALID_DATA', 'Confluence did not return complete comment ancestry.');
            if (comment.ancestors.some(function (ancestor) { return ancestor.type === 'comment'; })) replies++;
            var date = timestamp(comment.history && comment.history.createdDate);
            if (!date) datesComplete = false;
            else if (!latest || date > latest) latest = date;
          });
          start = next;
        } while (start !== null);
        return { source: 'confluence-footer-comments', status: 'available', total: total, topLevelTotal: total - replies, repliesTotal: replies, lastCommentAt: datesComplete ? latest : null, creationDatesComplete: datesComplete };
      }
      async function helpfulness(pageId, pageVersion) {
        if (!feedbackUrl) return { source: 'wcspedia-feedback-service', status: 'unavailable', yes: null, no: null, total: null };
        var url = new URL(feedbackUrl.href); url.search = new URLSearchParams({ rootPageId: rootId, pageId: pageId, format: 'analytics' }).toString();
        var value = await request(url), totals = value && value.totals;
        if (!object(value) || value.schemaVersion !== 1 || value.rootPageId !== rootId || value.pageId !== pageId || value.pageVersion !== pageVersion || !object(totals) || !integer(totals.yes) || !integer(totals.no) || !integer(totals.total) || totals.yes + totals.no !== totals.total) fail('INVALID_DATA', 'Helpfulness analytics returned an inconsistent document snapshot.');
        return { source: 'wcspedia-feedback-service', status: 'available', yes: totals.yes, no: totals.no, total: totals.total };
      }
      try {
        var engagement = nativeEngagement && (dependencies.engagement || root.WCSSpaceEngagement);
        if (nativeEngagement && (!engagement || typeof engagement.create !== 'function')) fail('CONFIGURATION', 'The native engagement helper is missing. Update the WCSpedia page scripts before exporting analytics.');
        var started = clock(); progress('verify', 0, null);
        var actor = await request(endpoint('/user/current'));
        if (!object(actor) || actor.type === 'anonymous' || actor.type === 'unknown' || !(typeof actor.userKey === 'string' && actor.userKey || typeof actor.username === 'string' && actor.username)) fail('FORBIDDEN', 'Sign in to Confluence before downloading analytics.');
        var verifiedPages = new Map();
        var rootPage = await request(endpoint('/content/' + rootId, { expand: 'space' })); nativePage(rootPage, rootId);
        verifiedPages.set(rootId, rootPage);
        await each(parents, async function (parent) {
          var page = await request(endpoint('/content/' + parent.id, { expand: 'space,ancestors' })); nativePage(page, parent.id);
          verifiedPages.set(parent.id, page);
          var ancestors = ancestry(page);
          if (!ancestors.includes(rootId) || ancestors.some(function (ancestor) { return excludedTrees.has(ancestor); })) fail('OUT_OF_SCOPE', 'An article parent is outside the configured WCSpedia tree.');
        });
        var cql = 'type = page AND space = ' + quote(spaceKey) + ' AND ancestor = ' + rootId + ' AND (' + parents.map(function (parent) { return 'ancestor = ' + parent.id; }).join(' OR ') + ') AND id NOT IN (' + Array.from(excludedPages).join(',') + ')';
        if (excludedTrees.size) cql += ' AND ancestor NOT IN (' + Array.from(excludedTrees).join(',') + ')';
        cql += ' ORDER BY created ASC, title ASC';
        var pages = [], seen = new Set(), start = 0, batches = 0;
        do {
          if (++batches > maxBatches) fail('LIMIT', 'Article pagination exceeded its limit. No partial report was downloaded.');
          var batch = await request(endpoint('/content/search', { cql: cql, expand: 'space,ancestors,history,version', start: String(start), limit: String(PAGE_SIZE) }));
          var next = nextOffset(batch, '/content/search', start);
          batch.results.forEach(function (page) {
            nativePage(page); var pageId = id(page.id), ancestors = ancestry(page), rootPosition = ancestors.indexOf(rootId);
            if (excludedPages.has(pageId) || ancestors.some(function (ancestor) { return excludedTrees.has(ancestor); })) return;
            var eligible = parents.filter(function (parent) { return ancestors.indexOf(parent.id) > rootPosition && ancestors.indexOf(parent.id) >= 0; }).sort(function (a, b) { return ancestors.indexOf(b.id) - ancestors.indexOf(a.id); });
            if (rootPosition < 0 || !eligible.length) fail('OUT_OF_SCOPE', 'Confluence returned a document outside the configured article tree.');
            if (seen.has(pageId)) fail('INCOMPLETE', 'Documents changed during collection. Try the download again.');
            if (!object(page.version) || !Number.isSafeInteger(page.version.number) || page.version.number < 1 || typeof page.title !== 'string' || page.title.length > 1000) fail('INVALID_DATA', 'Confluence returned incomplete document metadata.');
            verifiedPages.set(pageId, page);
            seen.add(pageId); if (seen.size > maxDocuments) fail('LIMIT', 'Analytics exceeded the document limit. No partial report was downloaded.');
            pages.push({ pageId: pageId, title: page.title, parent: eligible[0], pageVersion: page.version.number, createdAt: timestamp(page.history && page.history.createdDate), updatedAt: timestamp(page.version.when) });
          });
          progress('documents', pages.length, null); start = next;
        } while (start !== null);
        var nativeCollector = null;
        if (nativeEngagement) {
          nativeCollector = engagement.create(Object.assign({}, config, { rootPageId: rootId, spaceKey: spaceKey, contextPath: context }), {
            crypto: dependencies.crypto || root.crypto,
            origin: address.origin,
            now: now,
            storage: {
              page: async function (pageId, expand, readOptions) {
                abort(signal); abort(readOptions && readOptions.signal);
                if (!verifiedPages.has(pageId)) fail('OUT_OF_SCOPE', 'Engagement requested an unverified WCSpedia page.');
                return verifiedPages.get(pageId);
              },
              request: async function (path, init) {
                abort(signal); abort(init && init.signal);
                if (init && init.method && init.method.toUpperCase() !== 'GET') fail('OUT_OF_SCOPE', 'Analytics cannot modify engagement data.');
                var match = typeof path === 'string' && path.match(/^\/rest\/api\/content\/([1-9]\d{0,19})\/property\?([^#]*)$/);
                if (!match || !seen.has(match[1])) fail('OUT_OF_SCOPE', 'Engagement requested data outside the verified article collection.');
                var parameters = new URLSearchParams(match[2]);
                if (Array.from(parameters.keys()).some(function (key) { return !['expand', 'limit', 'start'].includes(key) || parameters.getAll(key).length !== 1; }) || parameters.get('expand') !== 'version' || parameters.get('limit') !== String(PAGE_SIZE) || !/^\d+$/.test(parameters.get('start') || '') || !Number.isSafeInteger(Number(parameters.get('start')))) fail('OUT_OF_SCOPE', 'Engagement requested invalid analytics pagination.');
                return request(endpoint('/content/' + match[1] + '/property', { expand: 'version', limit: String(PAGE_SIZE), start: parameters.get('start') }));
              }
            }
          });
          if (!nativeCollector || typeof nativeCollector.exportDocument !== 'function') fail('CONFIGURATION', 'The native engagement exporter is unavailable. Update the WCSpedia page scripts.');
        }
        var documents = {}, completed = 0; progress('comments', 0, pages.length);
        await each(pages, async function (page) {
          var observedAt = clock(), commentData = await comments(page.pageId);
          var engagementData = nativeCollector ? engagementSummary(await nativeCollector.exportDocument(page.pageId, { signal: signal, pageVersion: page.pageVersion }), page.pageId, page.pageVersion) : { helpfulness: await helpfulness(page.pageId, page.pageVersion), views: { source: 'confluence-content-properties', status: 'unavailable', recordedViews: null, windowMinutes: null, lastRecordedAt: null } };
          documents[page.pageId] = Object.assign({ pageId: page.pageId, title: page.title, url: address.origin + context + '/pages/viewpage.action?pageId=' + page.pageId, areaId: page.parent.areaId, areaPageId: page.parent.id, collection: page.parent.collection, pageVersion: page.pageVersion, createdAt: page.createdAt, updatedAt: page.updatedAt, observedAt: observedAt, comments: commentData }, engagementData);
          progress('comments', ++completed, pages.length);
        });
        abort(signal);
        var generatedAt = clock(); if (generatedAt < started) fail('INVALID_DATA', 'The browser clock changed during collection. Try the download again.');
        var report = { schemaVersion: 1, rootPageId: rootId, spaceKey: spaceKey, coverage: 'authenticated-current-user', discoverySource: 'confluence-cql-index', paginationComplete: true, pointInTimeSnapshot: false, scanStartedAt: started, generatedAt: generatedAt, documentCount: pages.length, documents: documents };
        progress('complete', pages.length, pages.length); return report;
      } finally {
        controller.abort(); if (options.signal) options.signal.removeEventListener('abort', onAbort); running = false;
      }
    }
    return Object.freeze({ collect: collect });
  }
  return Object.freeze({ create: create, pageSize: PAGE_SIZE });
}));
