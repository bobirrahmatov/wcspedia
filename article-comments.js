/* Native Confluence Server/Data Center footer comments. The native REST service
 * owns comment permissions and storage; no document JSON or page body is changed.
 * https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/
 * https://docs.atlassian.com/ConfluenceServer/rest/7.18.3/
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSArticleComments = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var PAGE_SIZE = 20, MAX_TEXT = 10000, MAX_RESPONSE = 1024 * 1024;
  function problem(message, code, outcome) {
    var error = new Error(message); error.code = code || 'INVALID_DATA';
    if (outcome) { error.outcome = outcome; error.retryable = false; }
    return error;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function id(value) { return (typeof value === 'string' || Number.isSafeInteger(value)) && /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : ''; }
  function escape(value) { return value.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(value, max) { return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max || 500) : ''; }
  function abort(signal) { if (signal && signal.aborted) { var error = new Error('Request cancelled.'); error.name = 'AbortError'; throw error; } }
  function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
  function storage(text) {
    if (typeof text !== 'string') throw problem('Enter a comment.', 'VALIDATION');
    text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    if (!text || text.length > MAX_TEXT) throw problem('Enter a comment of 1 to 10,000 characters.', 'VALIDATION');
    return { text: text, html: '<p>' + escape(text).replace(/\n/g, '<br />') + '</p>' };
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var fetcher = dependencies.fetch || (root.fetch && root.fetch.bind(root));
    var location = dependencies.location || root.location, address;
    try { address = new URL(location && (location.href || location.origin)); } catch (_) { throw problem('A Confluence page URL is required.', 'CONFIGURATION'); }
    if (!/^https?:$/.test(address.protocol) || address.username || address.password || typeof fetcher !== 'function') throw problem('Use the signed-in Confluence origin.', 'CONFIGURATION');
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || context && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context)) throw problem('Use a plain Confluence context path.', 'CONFIGURATION');
    context = context.replace(/\/+$/, '');
    if (config.baseUrl != null) {
      var base; try { base = new URL(config.baseUrl, address.origin); } catch (_) { throw problem('Invalid Confluence base URL.', 'CONFIGURATION'); }
      if (base.origin !== address.origin || base.pathname.replace(/\/+$/, '') !== context || base.username || base.password || base.hash || base.search) throw problem('Use this Confluence origin and context.', 'CONFIGURATION');
    }
    var rootId = id(config.rootPageId), spaceKey = clean(config.spaceKey, 255);
    var publication = object(config.nativePublication) ? config.nativePublication : config;
    var insightsId = publication.insightsPageId == null || publication.insightsPageId === '' ? '' : id(publication.insightsPageId);
    if (publication.insightsPageId && !insightsId) throw problem('Configure a numeric Insights parent page ID.', 'CONFIGURATION');
    var areas = object(publication.areaPageIds) ? publication.areaPageIds : {}, areaIds = Object.keys(areas).map(function (key) { return id(areas[key]); });
    if (!rootId || !spaceKey || !areaIds.length || areaIds.some(function (value) { return !value || value === rootId; }) || new Set(areaIds).size !== areaIds.length) throw problem('Configure the WCSpedia root, exact space key and distinct business-area page IDs.', 'CONFIGURATION');
    if (insightsId && [rootId].concat(areaIds).includes(insightsId)) throw problem('Insights must have a distinct parent page ID.', 'CONFIGURATION');
    var excludedPages = new Set([rootId].concat(areaIds, insightsId ? [insightsId] : [])), excludedTrees = new Set();
    function exclude(value, subtree) {
      if (value == null || value === '') return;
      var parsed = id(value); if (!parsed) throw problem('Exclusions require numeric Confluence page IDs.', 'CONFIGURATION');
      excludedPages.add(parsed); if (subtree) excludedTrees.add(parsed);
    }
    exclude(config.attachmentPageId);
    Object.keys(object(config.pageIds) ? config.pageIds : {}).forEach(function (key) { exclude(config.pageIds[key]); });
    exclude(publication.workingRootPageId, true);
    var search = object(config.search) ? config.search : {};
    ['excludePageIds', 'excludeAncestorIds'].forEach(function (key) {
      if (search[key] != null && (!Array.isArray(search[key]) || search[key].length > 100)) throw problem('Use at most 100 excluded pages.', 'CONFIGURATION');
      (search[key] || []).forEach(function (value) { exclude(value, key === 'excludeAncestorIds'); });
    });
    // Existing generated page configuration stores navigation URLs rather than IDs.
    Object.keys(object(config.pages) ? config.pages : {}).forEach(function (key) {
      var url; try { url = new URL(config.pages[key], address); } catch (_) { return; }
      if (url.origin !== address.origin || context && !url.pathname.startsWith(context + '/')) return;
      var match = url.pathname.match(/\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/);
      var page = id(url.searchParams.get('pageId')) || match && id(match[1]); if (page) excludedPages.add(page);
    });
    if (insightsId && excludedTrees.has(insightsId) || excludedTrees.has(rootId) || areaIds.some(function (area) { return excludedTrees.has(area); })) throw problem('The working or excluded subtree must be separate from the WCSpedia root and business areas.', 'CONFIGURATION');
    var timeoutMs = config.timeoutMs == null ? 12000 : config.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw problem('Use a timeout between 1,000 and 30,000 milliseconds.', 'CONFIGURATION');
    var clock = dependencies.now || Date.now, Parser = dependencies.DOMParser || root.DOMParser;
    var scopes = new Map(), denied = new Set(), activeWrites = new Set();
    function endpoint(path, query) { var url = new URL(context + '/rest/api' + path, address.origin); if (query) url.search = new URLSearchParams(query).toString(); return url; }
    function pageUrl(pageId, commentId) { return address.origin + context + '/pages/viewpage.action?pageId=' + pageId + (commentId ? '&focusedCommentId=' + commentId + '#comment-' + commentId : ''); }
    function unknown() { return problem('Confluence may have saved your comment. Check the discussion before posting it again.', 'OUTCOME_UNKNOWN', 'unknown'); }
    async function request(url, options) {
      options = options || {}; var writing = options.body !== undefined, signal = options.signal;
      abort(signal);
      var controller = new AbortController(), timedOut = false;
      var onAbort = function () { controller.abort(); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      var timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        var response;
        try { response = await fetcher(url.href, { method: writing ? 'POST' : 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal, headers: Object.assign({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, writing ? { 'Content-Type': 'application/json' } : {}), body: writing ? JSON.stringify(options.body) : undefined }); }
        catch (error) {
          if (writing) throw unknown();
          abort(signal);
          throw problem(timedOut ? 'Loading comments took too long. Try again.' : 'Confluence could not be reached.', timedOut ? 'TIMEOUT' : 'NETWORK');
        }
        if (!response.ok) {
          if (writing && (response.status >= 500 || response.status === 408)) throw unknown();
          var error = problem(response.status === 401 ? 'Sign in to Confluence to comment.' : response.status === 403 ? 'Confluence does not permit this comment action.' : response.status === 404 ? 'This page or comment is unavailable.' : 'Confluence could not complete this request (' + response.status + ').', response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR', writing ? 'rejected' : undefined);
          error.status = response.status; throw error;
        }
        var body, value;
        try { body = await response.text(); if (body.length > MAX_RESPONSE) throw new Error('Too large'); value = JSON.parse(body); }
        catch (_) { if (writing) throw unknown(); abort(signal); throw problem('Confluence did not return valid comment data.', 'INVALID_DATA'); }
        if (!writing) abort(signal);
        return value;
      } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
    }
    function user(value) {
      value = object(value) ? value : {};
      var userId = clean(value.userKey || value.username, 255);
      return { id: userId, displayName: clean(value.displayName, 255) || (userId ? 'Confluence user' : 'Anonymous'), authenticated: value.type !== 'anonymous' && value.type !== 'unknown' && !!userId };
    }
    function commentsSetting(page) {
      var body = page.body && page.body.storage && page.body.storage.value;
      if (typeof body !== 'string' || body.length > 800000 || typeof Parser !== 'function') throw problem('The article comment setting could not be verified. Comments are unavailable until the setting can be read.', 'COMMENTS_SETTINGS_UNAVAILABLE');
      // Read only real native Anchor macros, not escaped examples/code/macros.
      // This marker shares the same CAS revision as the approved article content.
      // Native storage can contain HTML named entities and Atlassian template
      // namespaces. Normalize known entities without interpreting article markup.
      var entities = Object.create(null);
      body = body.replace(/&([A-Za-z][A-Za-z0-9]+);/g, function (whole, name) {
        if (/^(amp|lt|gt|quot|apos)$/.test(name)) return whole;
        if (!Object.prototype.hasOwnProperty.call(entities, name)) {
          var decoded = new Parser().parseFromString('<textarea>' + whole + '</textarea>', 'text/html').body.textContent;
          entities[name] = decoded === whole ? whole : Array.from(decoded).map(function (point) { return '&#' + point.codePointAt(0) + ';'; }).join('');
        }
        return entities[name];
      });
      var parsed = new Parser().parseFromString('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri" xmlns:at="urn:at">' + body + '</root>', 'text/xml');
      if (parsed.querySelector('parsererror')) throw problem('The article comment setting is malformed. Comments are unavailable until it is corrected.', 'COMMENTS_SETTINGS_INVALID');
      var markers = [];
      Array.from(parsed.getElementsByTagNameNS('urn:ac', 'structured-macro')).forEach(function (macro) {
        if (macro.getAttributeNS('urn:ac', 'name') !== 'anchor') return;
        Array.from(macro.children).forEach(function (parameter) {
          if (parameter.namespaceURI !== 'urn:ac' || parameter.localName !== 'parameter' || parameter.getAttributeNS('urn:ac', 'name') !== '') return;
          var value = parameter.textContent.trim();
          if (value.indexOf('wcs-comments-') === 0) markers.push(value);
        });
      });
      if (!markers.length) return true; // Pre-setting native pages retain existing discussion behavior.
      if (markers.length !== 1 || !/^wcs-comments-v1-(enabled|disabled)$/.test(markers[0])) throw problem('The article comment setting is malformed or duplicated. Comments are unavailable until it is corrected.', 'COMMENTS_SETTINGS_INVALID');
      return markers[0] === 'wcs-comments-v1-enabled';
    }
    async function resolve(pageId, options) {
      options = options || {}; pageId = id(pageId);
      if (!pageId || excludedPages.has(pageId)) throw problem('Discussion is available on child articles only.', 'OUT_OF_SCOPE');
      abort(options.signal);
      var cached = scopes.get(pageId);
      if (!options.force && cached && clock() - cached.at < 30000) return Object.assign({}, cached.value, { user: Object.assign({}, cached.value.user), canComment: cached.value.canComment && !denied.has(pageId) });
      var results = await Promise.all([
        request(endpoint('/content/' + rootId, { expand: 'space' }), { signal: options.signal }),
        request(endpoint('/content/' + pageId, { expand: 'space,ancestors,operations,body.storage' }), { signal: options.signal }),
        request(endpoint('/user/current'), { signal: options.signal })
      ]);
      abort(options.signal);
      var rootPage = results[0], page = results[1];
      if (!object(rootPage) || id(rootPage.id) !== rootId || rootPage.type !== 'page' || !rootPage.space || rootPage.space.key !== spaceKey || rootPage.status && rootPage.status !== 'current') throw problem('The WCSpedia root does not match the configured space.', 'OUT_OF_SCOPE');
      var ancestors = object(page) && Array.isArray(page.ancestors) ? page.ancestors.map(function (entry) { return id(entry.id); }) : [];
      var rootPosition = ancestors.indexOf(rootId), areaId = '';
      Object.keys(areas).forEach(function (key) { if (ancestors.indexOf(id(areas[key])) > rootPosition && ancestors.indexOf(id(areas[key])) >= 0) areaId = key; });
      if (insightsId && ancestors.indexOf(insightsId) > rootPosition && ancestors.indexOf(insightsId) >= 0) areaId = 'insights';
      if (!object(page) || id(page.id) !== pageId || page.type !== 'page' || page.status !== 'current' || !page.space || page.space.key !== spaceKey || rootPosition < 0 || !areaId || ancestors.some(function (ancestor) { return excludedTrees.has(ancestor); })) throw problem('This page is outside the WCSpedia article tree.', 'OUT_OF_SCOPE');
      var actor = user(results[2]), commentsEnabled = commentsSetting(page);
      // Older Server releases omit comment operations. A signed-in reader may
      // submit a request; the native endpoint always decides whether to accept it.
      // A local UI entitlement is never used to grant native comment permission.
      var explicit = Array.isArray(page.operations) && page.operations.some(function (operation) { return operation.operation === 'create' && operation.targetType === 'comment'; });
      var result = { pageId: pageId, title: clean(page.title), url: pageUrl(pageId), areaId: areaId, spaceKey: spaceKey, commentsEnabled: commentsEnabled, user: actor, canComment: commentsEnabled && actor.authenticated && !denied.has(pageId), permissionKnown: !!explicit };
      if (scopes.size >= 10) scopes.delete(scopes.keys().next().value);
      scopes.set(pageId, { at: clock(), value: result }); return Object.assign({}, result, { user: Object.assign({}, actor) });
    }
    function plain(html) {
      if (typeof html !== 'string' || html.length > 250000 || typeof Parser !== 'function') throw problem('A browser parser is required to read comments.', 'INVALID_DATA');
      var doc = new Parser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,iframe,object,embed,template,noscript,svg,math,form,input,button,textarea,select,[hidden],[aria-hidden="true"]').forEach(function (node) { node.remove(); });
      doc.querySelectorAll('br').forEach(function (node) { node.replaceWith(doc.createTextNode('\n')); });
      doc.querySelectorAll('p,div,li,pre,blockquote,tr,h1,h2,h3,h4,h5,h6').forEach(function (node) { node.appendChild(doc.createTextNode('\n')); });
      return (doc.body.textContent || '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    function normalize(value, pageId, fallback) {
      if (!object(value) || !id(value.id) || value.type !== 'comment' || value.status && value.status !== 'current') throw problem('Confluence returned invalid comment data.', 'INVALID_DATA');
      if (object(value.container) && (id(value.container.id) !== pageId || value.container.type && value.container.type !== 'page')) throw problem('Confluence returned a comment for another page.', 'OUT_OF_SCOPE');
      if (value.extensions && value.extensions.location && value.extensions.location !== 'footer') throw problem('Inline comments are displayed in native Confluence.', 'INVALID_DATA');
      var body = value.body || {}, html = body.view && body.view.value || body.storage && body.storage.value;
      var history = value.history || {}, version = value.version || {}, author = user(history.createdBy || version.by);
      var parent = null;
      (Array.isArray(value.ancestors) ? value.ancestors : []).forEach(function (ancestor) { if (ancestor.type === 'comment' && id(ancestor.id)) parent = id(ancestor.id); });
      return { id: id(value.id), pageId: pageId, text: typeof html === 'string' ? plain(html) : fallback || '', author: { id: author.id, displayName: author.id || author.displayName !== 'Anonymous' ? author.displayName : 'Confluence user' }, createdAt: timestamp(history.createdDate || version.when), updatedAt: timestamp(version.when), url: pageUrl(pageId, id(value.id)), parentId: parent };
    }
    function nextStart(value, pageId, start, count) {
      var link = value._links && value._links.next;
      if (!link) return null;
      if (typeof link !== 'string' || /[\\\u0000-\u0020]/.test(link) || /%(?:2e|2f|5c|25)/i.test(link)) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      var url = new URL(link, address.origin + context + '/');
      var expected = '/rest/api/content/' + pageId + '/child/comment';
      if (url.origin !== address.origin || url.username || url.password || url.hash || (url.pathname !== context + expected && url.pathname !== expected)) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      var raw = url.searchParams.get('start'), next = Number(raw);
      if (!/^\d+$/.test(raw || '') || !Number.isSafeInteger(next) || next <= start || next > start + count || next > 1000000) throw problem('Invalid comment pagination.', 'INVALID_DATA');
      // Only the validated offset is reused. Returned URLs/filters are never fetched.
      return next;
    }
    async function list(pageId, options) {
      options = options || {}; var scope = await resolve(pageId, options); pageId = scope.pageId;
      if (!scope.commentsEnabled) throw problem('Comments are disabled for this article. Existing comments remain in Confluence.', 'COMMENTS_DISABLED');
      var start = options.start == null ? 0 : options.start;
      if (!Number.isSafeInteger(start) || start < 0 || start > 1000000) throw problem('Invalid comment offset.', 'VALIDATION');
      var result = await request(endpoint('/content/' + pageId + '/child/comment', { expand: 'body.view,history,version,ancestors,container', location: 'footer', depth: 'all', start: String(start), limit: String(PAGE_SIZE) }), { signal: options.signal });
      if (!object(result) || !Array.isArray(result.results) || result.results.length > PAGE_SIZE || result.start != null && result.start !== start) throw problem('Confluence returned invalid comments.', 'INVALID_DATA');
      var seen = new Set(), comments = result.results.map(function (value) { var comment = normalize(value, pageId); if (seen.has(comment.id)) throw problem('Duplicate comment data.', 'INVALID_DATA'); seen.add(comment.id); return comment; });
      var total = result.totalSize == null ? result.totalCount : result.totalSize;
      return { comments: comments, start: start, limit: PAGE_SIZE, nextStart: nextStart(result, pageId, start, result.results.length), total: Number.isSafeInteger(total) && total >= start + result.results.length ? total : null, canComment: scope.canComment, user: scope.user };
    }
    async function createComment(pageId, input) {
      input = input || {}; var content;
      try { content = storage(input.text); } catch (error) { error.outcome = 'rejected'; throw error; }
      pageId = id(pageId);
      if (input.parentId != null) throw problem('Reply in native Confluence to keep the existing thread.', 'VALIDATION', 'rejected');
      if (!pageId) throw problem('An article page ID is required.', 'VALIDATION', 'rejected');
      if (activeWrites.has(pageId)) throw problem('A comment is already being sent for this article.', 'BUSY', 'rejected');
      activeWrites.add(pageId);
      var postAttempted = false;
      try {
        var scope = await resolve(pageId, { force: true, signal: input.signal });
        if (!scope.commentsEnabled) throw problem('Comments are disabled for this article. Your text has not been submitted.', 'COMMENTS_DISABLED', 'rejected');
        if (!scope.canComment) throw problem('Sign in with a Confluence account allowed to comment.', 'FORBIDDEN', 'rejected');
        abort(input.signal);
        var result;
        postAttempted = true;
        // Navigation may cancel preflight reads, but cannot safely undo a POST
        // once sent. Keep observing its bounded result rather than claiming an
        // aborted browser request means Confluence did not save the comment.
        try { result = await request(endpoint('/content', { expand: 'body.view,history,version,ancestors,container' }), { body: { type: 'comment', container: { id: pageId, type: 'page' }, body: { storage: { value: content.html, representation: 'storage' } } } }); }
        catch (error) { if (error.code === 'FORBIDDEN') { denied.add(pageId); scopes.delete(pageId); } throw error; }
        // No post retry and no invented author/time. The response confirms the ID.
        try { return normalize(result, pageId, content.text); } catch (_) { throw unknown(); }
      } catch (error) {
        if (!postAttempted && !error.outcome) error.outcome = 'rejected';
        throw error;
      } finally { activeWrites.delete(pageId); }
    }
    function clear() { scopes.clear(); denied.clear(); }
    return Object.freeze({ resolve: resolve, list: list, createComment: createComment, clear: clear });
  }
  return Object.freeze({ create: create, pageSize: PAGE_SIZE, maxTextLength: MAX_TEXT });
}));
