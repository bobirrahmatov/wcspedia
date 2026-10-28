/* WCSpedia native-page adapter for self-hosted Confluence REST v1.
 * Content remains in native page bodies. This client never writes article JSON
 * attachments or treats labels/UI permissions as an approval authority.
 * https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/
 * https://developer.atlassian.com/server/confluence/cql-field-reference/
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSNativeConfluence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var EXPAND = 'body.view,body.storage,version,space,ancestors,operations,metadata.labels';
  var ACTIONS = ['submit', 'complete-review', 'request-changes', 'approve', 'delete'];
  var MAX_RESPONSE = 8 * 1024 * 1024;
  var MAX_COLLECTION_PAGES = 20;
  function fail(message, code, status) { var e = new Error(message); e.code = code || 'INVALID_DATA'; if (status) e.status = status; throw e; }
  function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
  function id(value, name) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('Invalid ' + (name || 'page ID') + '.');
    if (!/^[1-9]\d{0,19}$/.test(String(value == null ? '' : value))) fail('Set a valid ' + (name || 'page ID') + '.');
    return String(value);
  }
  function number(value, min, max, name) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid ' + name + '.');
    return value;
  }
  function text(value, max, name, allowEmpty) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!allowEmpty && !value.trim())) fail('Invalid ' + name + '.');
    return value.trim();
  }
  function only(value, keys, name) {
    if (!object(value) || Object.keys(value).some(function (key) { return keys.indexOf(key) < 0; })) fail('Unsupported ' + name + ' field.');
  }
  function quote(value) { return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function label(kind, value) {
    var normalized = text(value, 80, kind).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9 &/-]*$/.test(normalized)) fail('Use a recognised ' + kind + ' name or label slug.');
    return 'wcs-' + kind + '-' + normalized.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  }
  function nativePage(value, expectedId) {
    if (!object(value) || value.type !== 'page' || typeof value.title !== 'string' || !object(value.version)) fail('Confluence did not return a native page.', 'INVALID_RESPONSE');
    id(value.id); number(value.version.number, 1, Number.MAX_SAFE_INTEGER, 'native page version');
    if (expectedId && String(value.id) !== expectedId) fail('Confluence returned a different page.', 'INVALID_RESPONSE');
    return value;
  }
  function withinTree(page, rootId) {
    return !!rootId && (String(page.id) === rootId || (Array.isArray(page.ancestors) &&
      page.ancestors.some(function (ancestor) { return object(ancestor) && String(ancestor.id) === rootId; })));
  }
  function scopeMatch(page, rootId, space) {
    return String(page.id) !== rootId && object(page.space) && page.space.key === space && withinTree(page, rootId);
  }
  function operation(page, name) {
    return Array.isArray(page.operations) && page.operations.some(function (item) {
      return object(item) && item.operation === name && (item.targetType == null || item.targetType === 'page');
    });
  }
  function create(config, fetchImpl) {
    config = config || {};
    var fetcher = fetchImpl || (root.fetch && root.fetch.bind(root));
    if (typeof fetcher !== 'function') fail('Fetch is unavailable.', 'CONFIGURATION');
    // config.location exists solely for non-browser test harnesses. A real
    // browser's origin cannot be replaced by page configuration.
    var location = root.location || config.location;
    var href = location && (location.href || location.origin);
    var pageURL;
    try { pageURL = new URL(href); } catch (_) { fail('Serve the native adapter on the Confluence origin.', 'CONFIGURATION'); }
    if (!/^https?:$/.test(pageURL.protocol)) fail('Serve the native adapter over HTTP or HTTPS.', 'CONFIGURATION');
    var origin = pageURL.origin;
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || (context !== '' && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context))) fail('Use a plain Confluence context path.', 'CONFIGURATION');
    context = context.replace(/\/+$/, '');
    var publishedRoot = id(config.publishedRootPageId, 'published root page ID');
    var workingRoot = config.workingRootPageId ? id(config.workingRootPageId, 'working root page ID') : null;
    if (workingRoot === publishedRoot) fail('Use separate published and restricted working roots.', 'CONFIGURATION');
    function spaceKey(value, name) { var key = text(value, 255, name); if (!/^[A-Za-z0-9_~.-]+$/.test(key)) fail('Invalid ' + name + '.', 'CONFIGURATION'); return key; }
    var publishedSpace = spaceKey(config.publishedSpaceKey || config.spaceKey, 'published space key');
    var workingSpace = config.workingSpaceKey ? spaceKey(config.workingSpaceKey, 'working space key') : publishedSpace;
    var authoringMode = config.authoringMode || 'workflow';
    if (['workflow', 'native-template'].indexOf(authoringMode) < 0) fail('Choose workflow or native-template authoring.', 'CONFIGURATION');
    function safeURL(value) {
      if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value) || /%(?:2e|2f|5c|25)/i.test(value.split(/[?#]/)[0])) fail('Invalid Confluence URL.', 'CONFIGURATION');
      var result;
      try { result = new URL(value, origin + context + '/'); } catch (_) { fail('Invalid Confluence URL.', 'CONFIGURATION'); }
      if (result.origin !== origin || result.username || result.password || result.hash || (context && result.pathname !== context && !result.pathname.startsWith(context + '/'))) fail('Only the signed-in Confluence origin and context are allowed.', 'CONFIGURATION');
      return result;
    }
    var workflowURL = config.nativeWorkflowEndpoint ? safeURL(config.nativeWorkflowEndpoint) : null;
    var workflowSnapshots = new Map();
    if (workflowURL && workflowURL.search) fail('The workflow endpoint must not contain query parameters.', 'CONFIGURATION');
    function endpoint(path) { return safeURL(origin + context + path); }
    function requireWorking() { if (!workingRoot) fail('Configure a restricted working root before authoring.', 'CONFIGURATION'); }
    function requireWorkflow() { if (!workflowURL) fail('A trusted native workflow endpoint is required for this action.', 'WORKFLOW_UNAVAILABLE'); }
    async function request(url, data) {
      url = safeURL(url.href || String(url));
      var settings = { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } };
      if (data !== undefined) { settings.headers['Content-Type'] = 'application/json'; settings.headers['X-Requested-With'] = 'XMLHttpRequest'; settings.body = JSON.stringify(data); }
      var response;
      try { response = await fetcher(url.href, settings); }
      catch (error) { if (error && error.name === 'AbortError') throw error; fail(data === undefined ? 'Confluence could not be reached. Check your session and connection.' : 'The request outcome is unknown. Check the document before retrying.', 'NETWORK'); }
      if (response.redirected) fail('A redirected Confluence response was refused. Sign in and try again.', 'REDIRECT');
      if (response.url) { var actual = safeURL(response.url); if (actual.href !== url.href) fail('An unexpected response URL was refused.', 'REDIRECT'); }
      if (!response.ok) {
        var status = response.status;
        fail(status === 401 ? 'Your Confluence session has expired. Sign in again.' : status === 403 ? 'Confluence does not permit this action.' : status === 409 ? 'This page or workflow changed. Reload before continuing.' : 'Confluence request failed (' + status + ').', status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : 'HTTP_ERROR', status);
      }
      var result;
      try {
        if (typeof response.text === 'function') { var raw = await response.text(); if (raw.length > MAX_RESPONSE) fail('The Confluence response is too large.', 'RESPONSE_LIMIT'); result = JSON.parse(raw); }
        else result = await response.json();
      } catch (error) { if (error.code === 'RESPONSE_LIMIT') throw error; fail('Confluence returned an invalid JSON response.', 'INVALID_RESPONSE'); }
      if (!object(result)) fail('Confluence returned an invalid response.', 'INVALID_RESPONSE');
      return result;
    }
    async function currentUser() { return request(endpoint('/rest/api/user/current')); }
    async function getPage(pageId) {
      pageId = id(pageId); var url = endpoint('/rest/api/content/' + pageId); url.searchParams.set('expand', EXPAND);
      return nativePage(await request(url), pageId);
    }
    function editorUrl(pageId) { var url = endpoint('/pages/editpage.action'); url.searchParams.set('pageId', id(pageId)); return url.href; }
    function pageUrl(pageId) { var url = endpoint('/pages/viewpage.action'); url.searchParams.set('pageId', id(pageId)); return url.href; }
    function nativeCreateUrl() {
      requireWorking();
      if (authoringMode !== 'native-template') fail('Native template authoring has not been enabled.', 'CONFIGURATION');
      var url = endpoint('/pages/createpage-choosetemplate.action');
      url.searchParams.set('spaceKey', workingSpace); url.searchParams.set('newspaceKey', workingSpace); url.searchParams.set('fromPageId', workingRoot);
      return url.href;
    }
    async function prepareNativeCreate() {
      var editor = nativeCreateUrl();
      var observed = await Promise.all([currentUser(), getPage(workingRoot)]), user = observed[0], parent = observed[1];
      if (user.type !== 'known' || typeof user.username !== 'string' || !user.username.trim()) fail('Sign in to Confluence before creating a page.', 'UNAUTHENTICATED');
      if (!object(parent.space) || parent.space.key !== workingSpace || withinTree(parent, publishedRoot)) fail('The authoring parent must be outside the published library and in the configured working space.', 'INVALID_SCOPE');
      // Navigation only. Confluence checks native create permission and offers
      // installed templates; no custom workflow or approval is implied.
      return { editorUrl: editor };
    }
    function pagination(result, start, limit) {
      if (!Array.isArray(result.results) || result.results.length > limit) fail('Confluence returned an invalid result list.', 'INVALID_RESPONSE');
      if (result.start != null && result.start !== start) fail('Confluence returned an unexpected pagination position.', 'INVALID_RESPONSE');
      var total = Number.isSafeInteger(result.totalSize) && result.totalSize >= 0 ? result.totalSize : null;
      var hasNext = result.hasNext === true || !!(result._links && result._links.next) || (total != null && start + result.results.length < total);
      if (hasNext && !result.results.length) fail('Confluence returned a non-advancing result page.', 'INVALID_RESPONSE');
      // Never follow response URLs: a server-controlled next link must not
      // redirect authenticated requests. Advance this same endpoint ourselves.
      return { results: result.results, start: start, limit: limit, size: result.results.length, totalSize: total, hasNext: hasNext, nextStart: hasNext ? start + result.results.length : null };
    }
    async function search(options) {
      options = options || {}; only(options, ['query', 'type', 'area', 'region', 'start', 'limit', 'sort', 'scope', 'saved'], 'search');
      var scope = options.scope || 'published'; if (scope !== 'published' && scope !== 'working') fail('Choose published or working search scope.');
      if (scope === 'working') requireWorking();
      var rootId = scope === 'working' ? workingRoot : publishedRoot, space = scope === 'working' ? workingSpace : publishedSpace;
      var start = number(options.start == null ? 0 : options.start, 0, 1000000, 'search start');
      var limit = number(options.limit == null ? 12 : options.limit, 1, 100, 'search limit');
      var sort = options.sort || 'relevance'; if (['relevance', 'updated', 'title'].indexOf(sort) < 0) fail('This native search supports relevance, updated and title sorting.');
      var clauses = ['type = page', 'space = ' + quote(space), 'ancestor = ' + rootId, 'label = "wcspedia"'];
      var excludedRoot = scope === 'published' ? workingRoot : publishedRoot;
      if (excludedRoot) { clauses.push('id != ' + excludedRoot); clauses.push('ancestor != ' + excludedRoot); }
      // The restricted/public roots and native permissions define visibility.
      // Published labels are not treated as authority or required for reads.
      ['type', 'area', 'region'].forEach(function (key) { if (options[key]) clauses.push('label = ' + quote(label(key, options[key]))); });
      var query = text(options.query == null ? '' : options.query, 500, 'search text', true);
      var tokens = query.split(/\s+/).filter(Boolean); if (tokens.length > 30) fail('Use at most 30 search terms.');
      tokens.forEach(function (token) { var literal = '"' + token.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&') + '"'; clauses.push('text ~ ' + quote(literal)); });
      if (options.saved != null && typeof options.saved !== 'boolean') fail('The saved filter must be true or false.');
      if (options.saved) clauses.push('favourite = currentUser()');
      var cql = clauses.join(' AND ') + (sort === 'updated' ? ' ORDER BY lastmodified DESC' : sort === 'title' ? ' ORDER BY title ASC' : '');
      var url = endpoint('/rest/api/content/search'); url.searchParams.set('cql', cql); url.searchParams.set('start', String(start)); url.searchParams.set('limit', String(limit)); url.searchParams.set('expand', EXPAND);
      var result = pagination(await request(url), start, limit);
      result.results.forEach(function (page) { nativePage(page); if (!scopeMatch(page, rootId, space) || withinTree(page, excludedRoot)) fail('A search result was outside the configured library or overlaps the other library. Check the root configuration.', 'INVALID_SCOPE'); });
      result.cql = cql; return result;
    }
    async function collection(pageId, path, validate) {
      pageId = id(pageId); var start = 0, all = [], seen = new Set();
      for (var count = 0; count < MAX_COLLECTION_PAGES; count++) {
        var url = endpoint('/rest/api/content/' + pageId + path); url.searchParams.set('start', String(start)); url.searchParams.set('limit', '100'); url.searchParams.set('expand', 'version');
        var result = pagination(await request(url), start, 100);
        result.results.forEach(function (item) { var key = validate(item); if (seen.has(key)) fail('Confluence repeated a collection item. Reload before continuing.', 'INVALID_RESPONSE'); seen.add(key); all.push(item); });
        if (!result.hasNext) return all;
        start = result.nextStart;
      }
      fail('The document collection exceeds the supported page limit. No partial snapshot was returned.', 'COLLECTION_LIMIT');
    }
    async function getProperties(pageId) { return collection(pageId, '/property', function (item) { if (!object(item) || typeof item.key !== 'string' || !item.key || !Object.prototype.hasOwnProperty.call(item, 'value')) fail('Invalid page property.', 'INVALID_RESPONSE'); return item.key; }); }
    async function attachments(pageId) { return collection(pageId, '/child/attachment', function (item) { if (!object(item) || item.type !== 'attachment' || !object(item.version)) fail('Invalid native attachment.', 'INVALID_RESPONSE'); number(item.version.number, 1, Number.MAX_SAFE_INTEGER, 'attachment version'); return id(item.id, 'attachment ID'); }); }
    function editResult(page) {
      requireWorking();
      if (!scopeMatch(page, workingRoot, workingSpace) || withinTree(page, publishedRoot)) fail('The editor target must be in the restricted working library only.', 'INVALID_SCOPE');
      if (!operation(page, 'update')) fail('Confluence does not permit editing this working page.', 'FORBIDDEN');
      return { page: page, workingPageId: String(page.id), editorUrl: editorUrl(page.id), snapshot: { pageId: String(page.id), version: page.version.number } };
    }
    async function prepareEdit(pageId) {
      requireWorking(); var page = await getPage(pageId);
      if (scopeMatch(page, workingRoot, workingSpace)) return editResult(page);
      if (!scopeMatch(page, publishedRoot, publishedSpace)) fail('This page is outside the configured WCSpedia library.', 'INVALID_SCOPE');
      requireWorkflow();
      var prepared = await request(workflowURL, { action: 'prepare-edit', pageId: String(page.id), expectedVersion: page.version.number, snapshot: { pageId: String(page.id), version: page.version.number } });
      return editResult(await getPage(id(prepared.workingPageId, 'returned working page ID')));
    }
    async function createWorkingPage(fields) {
      requireWorking(); requireWorkflow(); only(fields, ['title', 'type', 'summary'], 'new document');
      var payload = { title: text(fields.title, 255, 'title'), type: text(fields.type, 80, 'content type'), summary: text(fields.summary == null ? '' : fields.summary, 2000, 'summary', true) };
      label('type', payload.type);
      var result = await request(workflowURL, Object.assign({ action: 'prepare-create' }, payload));
      return editResult(await getPage(id(result.workingPageId, 'returned working page ID')));
    }
    function attachmentSnapshot(items) {
      if (!Array.isArray(items) || items.length > 2000) fail('Invalid attachment snapshot.');
      var seen = new Set(); return items.map(function (item) { only(item, ['id', 'version'], 'attachment snapshot'); var key = id(item.id, 'attachment ID'); if (seen.has(key)) fail('Duplicate attachment snapshot.'); seen.add(key); return { id: key, version: number(item.version, 1, Number.MAX_SAFE_INTEGER, 'attachment version') }; });
    }
    async function submit(action, payload) {
      requireWorkflow(); if (ACTIONS.indexOf(action) < 0) fail('Unsupported native workflow action.');
      only(payload, ['pageId', 'expectedVersion', 'comment', 'expectedMetadataVersion', 'attachmentVersions', 'submissionId', 'governanceReview'], 'workflow');
      var pageId = id(payload.pageId), expectedVersion = number(payload.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'expected page version');
      var command = { action: action, pageId: pageId, expectedVersion: expectedVersion, comment: text(payload.comment, 4000, 'decision comment'), snapshot: { pageId: pageId, version: expectedVersion } };
      var observed = workflowSnapshots.get(pageId);
      if (!observed || observed.version !== expectedVersion || !observed.token) fail('Reload this document to obtain a current workflow snapshot before deciding.', 'WORKFLOW_SNAPSHOT_REQUIRED');
      command.submissionToken = observed.token;
      if (payload.expectedMetadataVersion != null) command.snapshot.metadataVersion = number(payload.expectedMetadataVersion, 1, Number.MAX_SAFE_INTEGER, 'metadata version');
      if (payload.attachmentVersions != null) command.snapshot.attachments = attachmentSnapshot(payload.attachmentVersions);
      if (payload.submissionId != null) command.submissionId = text(payload.submissionId, 120, 'submission ID');
      if (payload.governanceReview != null) {
        if (!object(payload.governanceReview) || JSON.stringify(payload.governanceReview).length > 20000) fail('Invalid governance review.');
        command.governanceReview = JSON.parse(JSON.stringify(payload.governanceReview));
      }
      var page = await getPage(pageId);
      if (!scopeMatch(page, workingRoot, workingSpace) && !scopeMatch(page, publishedRoot, publishedSpace)) fail('This document is outside WCSpedia.', 'INVALID_SCOPE');
      if (page.version.number !== expectedVersion) fail('The native page changed. Reload before submitting this decision.', 'CONFLICT');
      // The server must independently re-read this version, validate metadata /
      // attachments, assignment and entitlements, and bind the authenticated
      // actor. Browser values are preconditions, never proof of authority.
      try {
        var committed = await request(workflowURL, command);
        if (committed.committed !== true || committed.action !== action || String(committed.pageId) !== pageId || typeof committed.eventId !== 'string' || !committed.eventId.trim() || committed.eventId.length > 200) fail('The workflow service did not confirm this exact committed action. Reload the document before retrying.', 'UNCONFIRMED_WRITE');
        if (committed.publishedPageId != null) id(committed.publishedPageId, 'published page ID');
        return committed;
      }
      finally { workflowSnapshots.delete(pageId); }
    }
    async function getWorkflowState(pageId) {
      requireWorkflow(); pageId = id(pageId); workflowSnapshots.delete(pageId); var url = new URL(workflowURL.href); url.searchParams.set('view', 'document'); url.searchParams.set('pageId', pageId);
      var result = await request(url);
      if (result.pageId != null && id(result.pageId) !== pageId) fail('Workflow returned a different document.', 'INVALID_RESPONSE');
      if (!object(result.capabilities)) fail('Workflow capabilities are missing.', 'INVALID_RESPONSE');
      var flags = ['edit', 'submit', 'review', 'complete-review', 'request-changes', 'approve', 'delete'];
      if (Object.keys(result.capabilities).some(function (key) { return flags.indexOf(key) < 0 || typeof result.capabilities[key] !== 'boolean'; })) fail('Invalid workflow capabilities.', 'INVALID_RESPONSE');
      result.capabilities = Object.assign({ edit: false, submit: false, review: false, 'complete-review': false, 'request-changes': false, approve: false, delete: false }, result.capabilities);
      number(result.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'workflow page version');
      if (result.submissionToken != null) text(result.submissionToken, 4096, 'server submission token');
      if (ACTIONS.some(function (action) { return result.capabilities[action]; }) && !result.submissionToken) fail('The workflow service did not supply a decision snapshot.', 'INVALID_RESPONSE');
      workflowSnapshots.set(pageId, { version: result.expectedVersion, token: result.submissionToken || null });
      return result;
    }
    async function workspace(options) {
      requireWorkflow(); requireWorking(); options = options || {}; only(options, ['role', 'start', 'limit', 'query', 'type', 'region', 'sort'], 'workspace');
      if (['mine', 'review'].indexOf(options.role) < 0) fail('Choose your workspace or review workspace.');
      var start = number(options.start == null ? 0 : options.start, 0, 1000000, 'workspace start'), limit = number(options.limit == null ? 12 : options.limit, 1, 100, 'workspace limit');
      var url = new URL(workflowURL.href); url.searchParams.set('view', options.role); url.searchParams.set('start', String(start)); url.searchParams.set('limit', String(limit)); url.searchParams.set('query', text(options.query || '', 500, 'workspace query', true));
      ['type', 'region'].forEach(function (key) { if (options[key]) { label(key, options[key]); url.searchParams.set(key, options[key]); } });
      var sort = options.sort || 'updated'; if (['relevance', 'updated', 'title'].indexOf(sort) < 0) fail('Choose a supported workspace sort.'); url.searchParams.set('sort', sort);
      var result = pagination(await request(url), start, limit), ids = new Set();
      // Actual native REST reads verify that each service result is still
      // accessible to this signed-in user and refresh native operations.
      result.results = await Promise.all(result.results.map(async function (item) {
        if (!object(item)) fail('Invalid workspace document.', 'INVALID_RESPONSE');
        var pageId = id(item.id); if (ids.has(pageId)) fail('Duplicate workspace document.', 'INVALID_RESPONSE'); ids.add(pageId);
        var page = await getPage(pageId);
        if (!scopeMatch(page, workingRoot, workingSpace) || withinTree(page, publishedRoot)) fail('Workspace returned a document outside the working library or inside the published library.', 'INVALID_SCOPE');
        if (item.workflow != null) { if (!object(item.workflow)) fail('Invalid workflow projection.', 'INVALID_RESPONSE'); page.workflow = item.workflow; }
        return page;
      }));
      return result;
    }
    return { currentUser: currentUser, getPage: getPage, search: search, getProperties: getProperties, attachments: attachments, editorUrl: editorUrl, pageUrl: pageUrl, nativeCreateUrl: nativeCreateUrl, prepareNativeCreate: prepareNativeCreate, prepareEdit: prepareEdit, createWorkingPage: createWorkingPage, submit: submit, getWorkflowState: getWorkflowState, workspace: workspace };
  }
  return { create: create };
});
