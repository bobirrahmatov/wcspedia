/* Native-session storage for the configured WCSpedia space. Normal JSON reads
 * select the latest attachment by filename. A CAS content-property pending
 * reservation serializes cooperating writers; native page bodies, attachments
 * and properties are NOT one transaction. Unknown uploads are reconciled, never
 * blindly repeated. Native Confluence permissions remain authoritative.
 * REST: /content/{id}/property (version CAS), /content/{id}/child/attachment. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSSpaceStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var MAX_BYTES = 10000000, MAX_PROPERTY_BYTES = 32000;
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function integer(v, min) { return Number.isSafeInteger(v) && v >= (min == null ? 0 : min); }
  function id(v) { return typeof v === 'string' && /^[1-9]\d*$/.test(v); }
  function fail(message, code, status) { var e = new Error(message); e.code = code || 'INVALID_DATA'; if (status) e.status = status; throw e; }
  function checkAbort(signal) { if (signal && signal.aborted) { var e = new Error('The request was cancelled.'); e.name = 'AbortError'; throw e; } }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) { return Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(function (key) { return [key, canonical(value[key])]; })) : value; }
  function same(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function jsonBytes(value, limit) {
    var text;
    try { text = JSON.stringify(value); } catch (_) { fail('Use serializable JSON data.', 'INVALID_DATA'); }
    if (text === undefined) fail('Use serializable JSON data.', 'INVALID_DATA');
    var bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > limit) fail('The JSON exceeds the ' + (limit === MAX_BYTES ? '10 MB (10,000,000 byte) attachment' : '32 KB content-property') + ' limit.', 'ATTACHMENT_TOO_LARGE');
    return { text: text, bytes: bytes };
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var fetcher = dependencies.fetch || root.fetch, crypto = dependencies.crypto || root.crypto, timeoutMs = config.requestTimeoutMs == null ? 12000 : config.requestTimeoutMs;
    if (!integer(timeoutMs, 1) || timeoutMs > 60000) fail('Configure a request timeout between 1 and 60000 milliseconds.', 'CONFIGURATION');
    var writeTimeoutMs=config.writeTimeoutMs==null?60000:config.writeTimeoutMs;
    if(!integer(writeTimeoutMs,1)||writeTimeoutMs>120000)fail('Configure a write timeout between 1 and 120000 milliseconds.','CONFIGURATION');
    var origin = dependencies.origin || root.location && root.location.origin;
    var base;
    try { base = new URL(config.baseUrl || (config.contextPath || '/confluence'), origin); } catch (_) { fail('Configure a same-origin Confluence URL.', 'CONFIGURATION'); }
    var context = base.pathname.replace(/\/$/, '');
    if (!origin || base.origin !== origin || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(context || '/') || typeof fetcher !== 'function' || !crypto || !crypto.subtle || typeof crypto.getRandomValues !== 'function') fail('Use the signed-in HTTPS Confluence origin with Web Crypto and fetch.', 'CONFIGURATION');
    var spaceKey = config.spaceKey, roots = [config.rootPageId].concat(config.extraRootPageIds || []), allowed = config.allowedPageIds || [], protectedIds = config.protectedPageIds || [], storageIds = config.storagePageIds || [];
    if (typeof spaceKey !== 'string' || !spaceKey.trim() || !Array.isArray(roots) || !roots.length || roots.some(function (v) { return !id(v); }) || !Array.isArray(allowed) || !Array.isArray(protectedIds) || !Array.isArray(storageIds) || allowed.concat(protectedIds, storageIds).some(function (v) { return !id(v); }) || config.authorize != null && typeof config.authorize !== 'function') fail('Configure the exact space key, roots and permitted page IDs.', 'CONFIGURATION');
    var rootSet = new Set(roots), allowedSet = new Set(allowed), protectedSet = new Set(protectedIds), storageSet = new Set(storageIds);
    async function digest(bytes) { var hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash), function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    function token() { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, function (v) { return v.toString(16).padStart(2, '0'); }).join(''); }
    function route(path) {
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n#]/.test(path)) fail('Use a native Confluence path on this origin.', 'SCOPE');
      var full = context && path.startsWith(context + '/') ? path : context + path;
      var url = new URL(full, origin), rawPath = full.split('?')[0];
      if (url.origin !== origin || url.pathname !== rawPath || /%(?:2e|2f|5c)/i.test(rawPath) || !(url.pathname.startsWith(context + '/rest/api/') || url.pathname.startsWith(context + '/download/attachments/'))) fail('The request escaped the configured Confluence context.', 'SCOPE');
      return url;
    }
    async function bounded(response, signal, maxBytes) {
      maxBytes = maxBytes || MAX_BYTES;
      var length = response.headers && response.headers.get('content-length');
      if (length != null && /^\d+$/.test(length) && Number(length) > maxBytes) { try { await response.body.cancel(); } catch (_) {} fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE'); }
      if (response.body && typeof response.body.getReader === 'function') {
        var reader = response.body.getReader(), parts = [], size = 0;
        var cancel = function () { reader.cancel().catch(function () {}); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
          while (true) { checkAbort(signal); var part = await reader.read(); checkAbort(signal); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { try { await reader.cancel(); } catch (_) {} fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE'); } parts.push(part.value); }
        } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
        var bytes = new Uint8Array(size), offset = 0; parts.forEach(function (part) { bytes.set(part, offset); offset += part.byteLength; }); return bytes;
      }
      var fallback = new Uint8Array(await response.arrayBuffer());
      if (fallback.byteLength > maxBytes) fail('The Confluence response exceeds its size limit.', 'ATTACHMENT_TOO_LARGE');
      return fallback;
    }
    async function transport(path, init) {
      init = init || {}; var url = route(path), method = (init.method || 'GET').toUpperCase(), mutation = !['GET', 'HEAD'].includes(method);
      checkAbort(init.signal);
      var headers = new Headers(init.headers || {});
      if (['authorization', 'cookie', 'proxy-authorization'].some(function (key) { return headers.has(key); })) fail('Use the current Confluence session; do not supply credentials.', 'CONFIGURATION');
      headers.set('Accept', 'application/json'); if (mutation) headers.set('X-Requested-With', 'XMLHttpRequest');
      var response, rejection, controller = new AbortController(), timer, onAbort;
      var stopped = new Promise(function (_, reject) {
        function stop(external) {
          if (rejection) { reject(rejection); controller.abort(); return; }
          var error = new Error(mutation ? 'Confluence has not confirmed '+method+' '+url.pathname+'. Use Check save to recover this same request; do not start another document.' : external ? 'The request was cancelled.' : 'Confluence took too long to respond. Try again.');
          if (mutation) error.code = 'UNKNOWN_COMMIT'; else if (external) error.name = 'AbortError'; else error.code = 'TIMEOUT';
          reject(error); controller.abort();
        }
        timer = setTimeout(function () { stop(false); }, mutation ? writeTimeoutMs : timeoutMs);
        onAbort = function () { stop(true); };
        if (init.signal) init.signal.addEventListener('abort', onAbort, { once: true });
      });
      async function perform() {
      try { response = await fetcher(url.href, Object.assign({}, init, { headers: headers, method: method, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal })); }
      catch (error) { if (!mutation && error.name === 'AbortError') throw error; fail(mutation ? 'The native write outcome is unknown. Preserve the request ID and reload to reconcile it.' : 'Confluence could not be reached.', mutation ? 'UNKNOWN_COMMIT' : 'NETWORK'); }
      if (!response.ok) {
        var codes = { 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'ATTACHMENT_TOO_LARGE' };
        var code = codes[response.status] || (mutation && response.status >= 500 ? 'UNKNOWN_COMMIT' : 'CONFLUENCE_HTTP');
        rejection = new Error(response.status === 413 ? 'Confluence rejected this upload. Each attachment must be at most 10 MB; the host may impose a smaller limit.' : 'Confluence returned HTTP ' + response.status + ' for ' + method + ' ' + url.pathname + '.');
        rejection.code = code; rejection.status = response.status;
        // A short structured validation reason is useful; HTML proxy/login
        // pages, stack traces and full responses must not become UI content.
        if (response.status === 400 && /\bapplication\/(?:[a-z0-9.-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) {
          try {
            var problem = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await bounded(response, controller.signal, 8192)));
            var messages = [problem && problem.message].concat(problem && Array.isArray(problem.errorMessages) ? problem.errorMessages.slice(0,3) : []);
            var detail = messages.filter(function(v){return typeof v === 'string' && !/[<>]/.test(v);}).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
            if (detail) rejection.message += ' Server: ' + detail;
          } catch (_) { /* Keep the original HTTP status if diagnostics are unavailable. */ }
        } else { try { await response.body.cancel(); } catch (_) {} }
        throw rejection;
      }
      if (response.status === 204 || method === 'HEAD') return null;
      try {
        var bytes = await bounded(response, controller.signal);
        if (init.responseType === 'bytes') return bytes;
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch (error) {
        if (!mutation && (error.code || error.name === 'AbortError')) throw error;
        fail(mutation ? 'Confluence did not return a readable write confirmation. Reconcile the original request.' : 'Confluence did not return valid UTF-8 JSON.', mutation ? 'UNKNOWN_COMMIT' : 'INVALID_RESPONSE');
      }
      }
      try { return await Promise.race([perform(), stopped]); }
      finally { clearTimeout(timer); if (init.signal) init.signal.removeEventListener('abort', onAbort); }
    }
    async function page(pageId, expand, options) {
      if (object(expand)) { options = expand; expand = ''; } options = options || {};
      if (!id(pageId) || expand != null && (typeof expand !== 'string' || !/^[A-Za-z0-9.,]*$/.test(expand))) fail('Use a numeric page ID and native expansion names.', 'CONFIGURATION');
      var expansions = Array.from(new Set(['space', 'ancestors', 'operations', 'version'].concat((expand || '').split(',')).filter(Boolean))).join(',');
      var result = await transport('/rest/api/content/' + pageId + '?expand=' + encodeURIComponent(expansions), { signal: options.signal });
      checkAbort(options.signal);
      if (!object(result) || String(result.id) !== pageId || result.type !== 'page' || result.status != null && result.status !== 'current' || !result.space || result.space.key !== spaceKey || !Array.isArray(result.ancestors) || result.ancestors.some(function (ancestor) { return !object(ancestor) || !id(String(ancestor.id)); })) fail('The page is not a current page in the configured WCSpedia space.', 'SCOPE');
      if (!rootSet.has(pageId) && !allowedSet.has(pageId) && !result.ancestors.some(function (ancestor) { return rootSet.has(String(ancestor.id)); })) fail('The page is outside the configured WCSpedia roots.', 'SCOPE');
      return result;
    }
    async function writable(pageId, action, options, requireUpdate) {
      // A dedicated JSON host can remain protected from page body/deletion
      // operations while explicitly accepting its managed property/file pair.
      if (protectedSet.has(pageId) && !(storageSet.has(pageId) && ['json.write', 'property.write'].includes(action))) fail('This page is protected from WCSpedia storage writes.', 'FORBIDDEN');
      var nativePage = await page(pageId, '', options);
      if (requireUpdate && (!Array.isArray(nativePage.operations) || !nativePage.operations.some(function (op) { return op.operation === 'update' && op.targetType === 'page'; }))) fail('Native Confluence edit permission is required for this storage page.', 'FORBIDDEN');
      if (config.authorize && await config.authorize({ action: action, pageId: pageId, page: clone(nativePage) }) !== true) fail('The configured WCSpedia policy does not permit this write.', 'FORBIDDEN');
      return nativePage;
    }
    async function request(path, init) {
      init = init || {}; var method = (init.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) {
        if (init.body && typeof init.body.entries === 'function') {
          for (var entry of init.body.entries()) { var part = entry[1]; if (part && typeof part.arrayBuffer === 'function' && (!integer(part.size) || part.size > MAX_BYTES)) fail('Each native attachment must be at most 10 MB (10,000,000 bytes).', 'ATTACHMENT_TOO_LARGE'); }
        }
        var url = route(path), relative = url.pathname.slice(context.length), match = /^\/rest\/api\/content\/([1-9]\d*)(?:\/|$)/.exec(relative);
        if (match) {
          await writable(match[1], 'native.' + method.toLowerCase(), { signal: init.signal }, false);
          // Validate the destination too: an in-scope source page must not be
          // used to move content into another space or an unrelated subtree.
          if (method === 'PUT' && relative === '/rest/api/content/' + match[1]) {
            var update; try { update = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
            if (!object(update) || update.id != null && String(update.id) !== match[1] || update.type != null && update.type !== 'page' || update.space && update.space.key !== spaceKey) fail('Native page updates must stay in the configured WCSpedia space.', 'SCOPE');
            if (update.ancestors != null) {
              if (!Array.isArray(update.ancestors) || !update.ancestors.length || update.ancestors.some(function (ancestor) { return !object(ancestor) || !id(String(ancestor.id)); })) fail('Page moves need a verified WCSpedia parent.', 'SCOPE');
              await page(String(update.ancestors[update.ancestors.length - 1].id), '', { signal: init.signal });
            }
          }
          if (/\/move(?:\/|$)/.test(relative)) fail('Use a versioned native page update with a verified destination.', 'SCOPE');
        }
        else if (relative === '/rest/api/content' && method === 'POST') {
          var body; try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
          var parent = body && body.type === 'comment' ? body.container && String(body.container.id) : body && body.type === 'page' && body.ancestors && body.ancestors.length ? String(body.ancestors[body.ancestors.length - 1].id) : null;
          if (!id(parent) || body.type === 'page' && (!body.space || body.space.key !== spaceKey)) fail('Native content must target a verified WCSpedia parent and space.', 'SCOPE');
          await writable(parent, 'native.create-' + body.type, { signal: init.signal }, false);
        } else if (config.allowSpacePermissionSync === true && method === 'PUT' && relative.startsWith('/rest/api/space/'+encodeURIComponent(spaceKey)+'/permissions/user/') && /^\/rest\/api\/space\/[^/]+\/permissions\/user\/[^/]+\/(grant|revoke)$/.test(relative)) {
          var grants;try {grants=JSON.parse(init.body);}catch(_){}
          if(!Array.isArray(grants)||!grants.length||grants.length>5||grants.some(function(g){return !g||Object.keys(g).sort().join(',')!=='operationKey,targetType'||!['space:read','space:restrict','page:create','page:delete','attachment:create'].includes(g.targetType+':'+g.operationKey);}))fail('Only supported WCSpedia native access grants can be synchronized.','SCOPE');
        } else fail('This storage helper does not mutate unrelated Confluence resources.', 'SCOPE');
      }
      return transport(path, init);
    }
    async function user(options) { return transport('/rest/api/user/current', options || {}); }
    function keyCheck(key) { if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) fail('Use a safe content-property key.', 'CONFIGURATION'); }
    function validateProperty(value, pageId, key) {
      if (!object(value) || value.key !== key || !id(String(value.id)) || !object(value.version) || !integer(value.version.number, 1) || !Object.prototype.hasOwnProperty.call(value, 'value') || value.content && String(value.content.id) !== pageId) fail('Confluence returned an invalid content property.', 'INVALID_RESPONSE');
      return value;
    }
    async function getProperty(pageId, key, options) {
      try { return validateProperty(await transport('/rest/api/content/' + pageId + '/property/' + encodeURIComponent(key) + '?expand=version', options || {}), pageId, key); }
      catch (error) { if (error.status === 404) return null; throw error; }
    }
    async function findProperty(pageId, key, options) {
      // A missing JSON pointer is normal on first installation. The collection
      // returns an empty result without the misleading /property/{key} 404.
      // Do not treat an unavailable collection/API as an absent property.
      var start = 0, seen = new Set();
      while (start < 1000) {
        var result = await transport('/rest/api/content/' + pageId + '/property?expand=version&limit=100&start=' + start, options || {});
        if (!object(result) || !Array.isArray(result.results) || result.results.length > 100) fail('Confluence did not return a valid metadata collection.', 'INVALID_RESPONSE');
        var found = null;
        result.results.forEach(function (item) {
          if (!object(item) || typeof item.key !== 'string' || seen.has(item.key)) fail('Confluence metadata pagination repeated or returned an invalid key.', 'INVALID_RESPONSE');
          seen.add(item.key);
          if (item.key === key) found = validateProperty(item, pageId, key);
        });
        if (found) return found;
        if (!(result._links && result._links.next)) return null;
        if (!result.results.length) fail('Confluence metadata pagination did not advance.', 'INVALID_RESPONSE');
        start += result.results.length;
      }
      fail('The metadata lookup exceeded its safe page limit.', 'PROPERTY_LIMIT');
    }
    async function property(pageId, key, options) { keyCheck(key); await page(pageId, '', options); return options && options.optional === true ? findProperty(pageId, key, { signal: options.signal }) : getProperty(pageId, key, options); }
    async function putProperty(pageId, key, value, expectedVersion, options) {
      options = options || {}; keyCheck(key); var encoded = jsonBytes(value, MAX_PROPERTY_BYTES);
      if (expectedVersion !== null && !integer(expectedVersion, 1)) fail('Use null to create a property or its current CAS version to update it.', 'CONFIGURATION');
      await writable(pageId, 'property.write', options, true);
      var previous = await getProperty(pageId, key, options), nextVersion = expectedVersion === null ? 1 : expectedVersion + 1;
      if ((previous ? previous.version.number : null) !== expectedVersion) fail('The content property changed. Reload before writing.', 'CONFLICT');
      var payload = { key: key, value: JSON.parse(encoded.text), version: { number: nextVersion } };
      if (previous) payload.id = previous.id;
      try {
        var result = validateProperty(await transport('/rest/api/content/' + pageId + '/property' + (previous ? '/' + encodeURIComponent(key) : ''), { method: previous ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: options.signal }), pageId, key);
        if (result.version.number !== nextVersion || !same(result.value, payload.value) || previous && result.id !== previous.id) fail('The property write was not confirmed.', 'UNKNOWN_COMMIT');
        return result;
      } catch (error) {
        if (error.code !== 'UNKNOWN_COMMIT' && error.code !== 'CONFLICT') throw error;
        // A lost CAS reply may be confirmed, but no PUT/POST is repeated.
        var found; try { found = await getProperty(pageId, key, {}); } catch (_) { throw error; }
        if (found && found.version.number === nextVersion && same(found.value, payload.value) && (!previous || found.id === previous.id)) return found;
        throw error;
      }
    }
    function fileCheck(filename) { if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,155}\.json$/.test(filename)) fail('Use a safe JSON attachment filename.', 'CONFIGURATION'); }
    async function metadata(pageId, filename, options) {
      var result = await transport('/rest/api/content/' + pageId + '/child/attachment?filename=' + encodeURIComponent(filename) + '&expand=version,container&limit=2', options || {});
      if (!object(result) || !Array.isArray(result.results) || result.results.length > 1 || result._links && result._links.next) fail('The JSON attachment name is missing or ambiguous.', 'INVALID_ATTACHMENT');
      if (!result.results.length) return null;
      var item = result.results[0];
      if (!object(item) || !id(String(item.id)) || item.type !== 'attachment' || item.title !== filename || !item.version || !integer(item.version.number, 1) || !item.container || String(item.container.id) !== pageId || item.container.type !== 'page') fail('The attachment identity, filename or parent did not match.', 'INVALID_ATTACHMENT');
      return { id: String(item.id), version: item.version.number };
    }
    async function bytesAt(pageId, filename, version, options) { return transport('/download/attachments/' + pageId + '/' + encodeURIComponent(filename) + '?api=v2' + (version == null ? '' : '&version=' + version), Object.assign({}, options, { responseType: 'bytes' })); }
    function attachmentCheck(value) { return object(value) && id(value.id) && integer(value.version, 1) && /^[a-f0-9]{64}$/.test(value.sha256) && integer(value.bytes) && value.bytes <= MAX_BYTES; }
    function validatePointer(value, pageId, filename) {
      if (!object(value) || Object.keys(value).some(function (name) { return !['schemaVersion', 'pageId', 'filename', 'attachment', 'lastWrite', 'pending'].includes(name); }) || value.schemaVersion !== 1 || value.pageId !== pageId || value.filename !== filename || value.attachment !== null && !attachmentCheck(value.attachment) || value.lastWrite !== null && !object(value.lastWrite) || value.pending !== null && !object(value.pending)) fail('The JSON pointer does not match this page and attachment.', 'INVALID_POINTER');
      if (value.pending) {
        var p = value.pending;
        if (typeof p.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(p.requestId) || !/^[a-f0-9]{64}$/.test(p.sha256) || !integer(p.bytes) || p.bytes > MAX_BYTES || !integer(p.expectedRevision) || !integer(p.expectedAttachmentVersion) || !integer(p.nativeVersion) || p.attachmentId !== null && !id(p.attachmentId) || typeof p.actor !== 'string' || !p.actor || !/^[a-f0-9]{32}$/.test(p.token)) fail('The pending JSON write is invalid.', 'INVALID_POINTER');
        if (p.expectedAttachmentVersion !== (value.attachment ? value.attachment.version : 0) || p.nativeVersion !== p.expectedAttachmentVersion || p.attachmentId !== (value.attachment ? value.attachment.id : null)) fail('The pending JSON baseline is inconsistent.', 'INVALID_POINTER');
      }
      if (value.lastWrite && (typeof value.lastWrite.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(value.lastWrite.sha256) || !integer(value.lastWrite.expectedRevision) || !integer(value.lastWrite.expectedAttachmentVersion) || typeof value.lastWrite.actor !== 'string')) fail('The JSON commit receipt is invalid.', 'INVALID_POINTER');
      return value;
    }
    async function snapshot(pageId, filename, key, options) {
      var reads = await Promise.all([findProperty(pageId, key, options), metadata(pageId, filename, options)]);
      var prop = reads[0], pointer = prop ? validatePointer(prop.value, pageId, filename) : null, native = reads[1];
      // A pending managed upload is not yet authoritative. Retain its known
      // baseline for the original-request reconciliation protocol only.
      var pending = pointer && pointer.pending, selected = pending ? pointer.attachment : native;
      if (pointer && pointer.attachment && !native) fail('The JSON attachment ' + filename + ' is missing on page ' + pageId + '. Restore or upload it before continuing.', 'ATTACHMENT_NOT_FOUND');
      if (pending && selected && (native.id !== selected.id || native.version < selected.version)) fail('The attachment changed during an unfinished save. Reconcile the original request before continuing.', 'CONFLICT');
      var bytes = selected ? await bytesAt(pageId, filename, pending ? selected.version : null, options) : null, hash = bytes ? await digest(bytes) : null, data = null;
      var committed = pointer && pointer.attachment;
      if (bytes) { try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (_) { fail('The attachment must contain valid UTF-8 JSON.', 'INVALID_JSON'); } }
      var verified = await Promise.all([prop ? getProperty(pageId, key, options) : findProperty(pageId, key, options), metadata(pageId, filename, options)]);
      var fresh = verified[0];
      if ((fresh ? fresh.version.number : 0) !== (prop ? prop.version.number : 0) || fresh && (fresh.id !== prop.id || !same(fresh.value, prop.value))) fail('The JSON pointer changed while loading. Reload it.', 'CONFLICT');
      if (!same(verified[1], native)) fail('The live JSON attachment changed while loading.', 'CONFLICT');
      if (committed && selected && committed.id === selected.id && committed.version === selected.version && (hash !== committed.sha256 || bytes.byteLength !== committed.bytes)) fail('The JSON failed its SHA-256 check for the same native attachment revision.', 'INTEGRITY');
      return { data: data, revision: prop ? prop.version.number : 0, attachmentId: selected ? selected.id : null, attachmentVersion: selected ? selected.version : 0, pointer: pointer, propertyId: prop ? prop.id : null, native: native, baseline: selected ? { id: selected.id, version: selected.version, sha256: hash, bytes: bytes.byteLength } : null };
    }
    function fingerprint(result) { return result.baseline ? result.baseline.id + ':' + result.baseline.version + ':' + result.baseline.sha256 : null; }
    function exposed(result) { return { data: result.data, revision: result.revision, attachmentId: result.attachmentId, attachmentVersion: result.attachmentVersion, fingerprint:fingerprint(result), pointer: result.pointer }; }
    async function readJSON(pageId, filename, pointerKey, options) { fileCheck(filename); keyCheck(pointerKey); await page(pageId, '', options); return exposed(await snapshot(pageId, filename, pointerKey, options || {})); }
    // Optional administrative inspection. Ordinary manual replacements no
    // longer need pointer repair before they can be read.
    async function inspectJSON(pageId, filename, pointerKey, options) {
      options = options || {}; fileCheck(filename); keyCheck(pointerKey);
      var nativePage = await page(pageId, '', options);
      var pair = await Promise.all([findProperty(pageId, pointerKey, options), metadata(pageId, filename, options)]);
      var prop = pair[0], candidate = pair[1], pointer = prop ? validatePointer(prop.value, pageId, filename) : null;
      if (pointer && pointer.pending) fail('A JSON save is pending. Recover its original request before adopting another attachment.', 'WRITE_PENDING');
      if (!candidate) fail('Upload or restore ' + filename + ' on page ' + pageId + ' before reviewing recovery.', 'ATTACHMENT_NOT_FOUND');
      var bytes = await bytesAt(pageId, filename, candidate.version, options), hash = await digest(bytes), data;
      try { data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
      catch (_) { fail(filename + ' must contain valid UTF-8 JSON.', 'INVALID_JSON'); }
      var after = await Promise.all([findProperty(pageId, pointerKey, options), metadata(pageId, filename, options)]);
      if (!same(after[0], prop) || !same(after[1], candidate)) fail('The JSON changed during recovery preview. Inspect it again.', 'CONFLICT');
      return {pageId:pageId, filename:filename, key:pointerKey, property:prop, candidate:{id:candidate.id,version:candidate.version,sha256:hash,bytes:bytes.byteLength}, data:data,
        canRepair:Array.isArray(nativePage.operations) && nativePage.operations.some(function(op){return op.operation==='update'&&op.targetType==='page';})};
    }
    async function reconcileJSON(preview, options) {
      options = options || {};
      if (!object(preview) || !object(preview.candidate)) fail('Inspect the attachment before recovery.', 'CONFIGURATION');
      var pageId = preview.pageId, filename = preview.filename, pointerKey = preview.key;
      fileCheck(filename); keyCheck(pointerKey);
      await writable(pageId, 'json.write', options, true);
      var current = await inspectJSON(pageId, filename, pointerKey, options);
      if (!same(current.property, preview.property) || !same(current.candidate, preview.candidate)) fail('The attachment or its saved reference changed. Inspect it again before recovery.', 'CONFLICT');
      var who = await user(options), actor = who && who.type === 'known' && (who.userKey ? 'key:' + who.userKey : who.accountId ? 'account:' + who.accountId : who.username ? 'user:' + who.username.toUpperCase() : null);
      if (!actor) fail('A signed-in native Confluence account is required.', 'AUTH_REQUIRED');
      var requestId = options.requestId;
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId)) fail('Provide a recovery request ID.', 'CONFIGURATION');
      var next = {schemaVersion:1,pageId:pageId,filename:filename,attachment:current.candidate,pending:null,
        lastWrite:{requestId:requestId,sha256:current.candidate.sha256,actor:actor,
          expectedRevision:current.property ? current.property.version.number : 0,expectedAttachmentVersion:current.candidate.version}};
      // CAS protects cooperating writers. The caller's recovery backup includes
      // the old reference. No attachment upload or policy/history edit occurs.
      await putProperty(pageId, pointerKey, next, current.property ? current.property.version.number : null, options);
      var result = await snapshot(pageId, filename, pointerKey, options);
      if (!result.pointer || !same(result.pointer, next)) fail('Recovery changed before confirmation. Inspect again; do not repeat the write automatically.', 'CONFLICT');
      return exposed(result);
    }
    async function writeJSON(pageId, filename, pointerKey, data, options) {
      options = options || {}; fileCheck(filename); keyCheck(pointerKey);
      var encoded = jsonBytes(data, MAX_BYTES), hash = await digest(encoded.bytes), requestId = options.requestId;
      if (!integer(options.expectedRevision) || !integer(options.expectedAttachmentVersion) || typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId)) fail('Provide the original request ID and expected JSON/native revisions.', 'CONFIGURATION');
      await writable(pageId, 'json.write', options, true);
      var currentUser = await user({ signal: options.signal }), actor = currentUser && currentUser.type === 'known' && (currentUser.userKey ? 'key:' + currentUser.userKey : currentUser.accountId ? 'account:' + currentUser.accountId : currentUser.username ? 'user:' + currentUser.username.toUpperCase() : null);
      if (!actor) fail('A signed-in native Confluence account is required.', 'AUTH_REQUIRED');
      var before = await snapshot(pageId, filename, pointerKey, options), pointer = before.pointer;
      function matches(receipt) { return receipt && receipt.requestId === requestId && receipt.sha256 === hash && receipt.actor === actor && receipt.expectedRevision === options.expectedRevision && receipt.expectedAttachmentVersion === options.expectedAttachmentVersion; }
      if (pointer && pointer.lastWrite && pointer.lastWrite.requestId === requestId) {
        if (!matches(pointer.lastWrite) || !same(before.baseline, pointer.attachment)) fail('This request ID was already used or its attachment has since changed. Reload the latest JSON.', 'CONFLICT');
        return exposed(before);
      }
      var pending = pointer && pointer.pending, reservation, ownsUpload = false;
      if (pending) { if (!matches(pending)) fail('An earlier JSON write requires reconciliation using its original request ID.', 'WRITE_PENDING'); reservation = { id: before.propertyId, version: { number: before.revision }, value: pointer }; }
      else {
        if (before.revision !== options.expectedRevision || before.attachmentVersion !== options.expectedAttachmentVersion) fail('The JSON changed. Reload before saving.', 'CONFLICT');
        if (options.expectedFingerprint !== undefined) {
          if (options.expectedFingerprint !== fingerprint(before)) fail('The JSON file was replaced or changed. Reload before saving.', 'CONFLICT');
        } else if (pointer && !same(pointer.attachment, before.baseline)) {
          fail('Reload the latest attachment with its fingerprint before saving a manual replacement.', 'CONFLICT');
        }
        pending = { requestId: requestId, sha256: hash, bytes: encoded.bytes.byteLength, actor: actor, expectedRevision: options.expectedRevision, expectedAttachmentVersion: options.expectedAttachmentVersion, nativeVersion: before.native ? before.native.version : 0, attachmentId: before.native ? before.native.id : null, token: token() };
        pointer = { schemaVersion: 1, pageId: pageId, filename: filename, attachment: before.baseline, lastWrite: pointer ? pointer.lastWrite : null, pending: pending };
        reservation = await putProperty(pageId, pointerKey, pointer, before.revision || null, options); ownsUpload = true;
      }
      if (ownsUpload) {
        // Recheck the existing native file after winning the property CAS. A
        // native/manual upload is not allowed to become an unnoticed baseline.
        var preUpload = await metadata(pageId, filename, options);
        if ((preUpload ? preUpload.id : null) !== pending.attachmentId || (preUpload ? preUpload.version : 0) !== pending.nativeVersion) fail('The native attachment changed before upload. Reconcile the reserved write.', 'CONFLICT');
        var Form = dependencies.FormData || root.FormData, BlobType = dependencies.Blob || root.Blob;
        if (!Form || !BlobType) fail('This browser cannot upload native attachments.', 'CONFIGURATION');
        var form = new Form(); form.append('file', new BlobType([encoded.bytes], { type: 'application/json' }), filename); form.append('comment', 'WCSpedia JSON ' + requestId + '; SHA-256 ' + hash); form.append('minorEdit', 'false');
        try {
          await transport('/rest/api/content/' + pageId + '/child/attachment' + (pending.attachmentId ? '/' + pending.attachmentId + '/data' : ''), { method: 'POST', headers: { 'X-Atlassian-Token': 'nocheck' }, body: form, signal: options.signal });
        } catch (error) {
          if (error.code !== 'UNKNOWN_COMMIT') {
            // Definite rejections may release this reservation, but never erase
            // another writer's property version or a committed native upload.
            if ([400, 401, 403, 404, 413].includes(error.status)) { try { await putProperty(pageId, pointerKey, Object.assign({}, pointer, { pending: null }), reservation.version.number, {}); } catch (_) {} }
            throw error;
          }
          // Continue with read-only reconciliation of the exact expected bytes.
        }
      }
      var uploaded = await metadata(pageId, filename, {});
      if (!uploaded || uploaded.version === pending.nativeVersion && uploaded.id === pending.attachmentId) fail('The attachment upload is not confirmed yet. Retry only this original request ID to reconcile it; no duplicate upload was sent.', 'UNKNOWN_COMMIT');
      if (uploaded.version !== pending.nativeVersion + 1 || pending.attachmentId && uploaded.id !== pending.attachmentId) fail('The native attachment diverged from this reserved write. Inspect its version history.', 'CONFLICT');
      var confirmedBytes = await bytesAt(pageId, filename, uploaded.version, {});
      if (confirmedBytes.byteLength !== pending.bytes || await digest(confirmedBytes) !== hash) fail('The uploaded attachment does not match this request. No JSON pointer was committed.', 'INTEGRITY');
      var committed = { schemaVersion: 1, pageId: pageId, filename: filename, attachment: { id: uploaded.id, version: uploaded.version, sha256: hash, bytes: confirmedBytes.byteLength }, lastWrite: { requestId: requestId, sha256: hash, actor: actor, expectedRevision: options.expectedRevision, expectedAttachmentVersion: options.expectedAttachmentVersion }, pending: null };
      try { await putProperty(pageId, pointerKey, committed, reservation.version.number, {}); }
      catch (error) {
        if (error.code !== 'CONFLICT' && error.code !== 'UNKNOWN_COMMIT') throw error;
        var found = await getProperty(pageId, pointerKey, {});
        if (!found || !same(found.value, committed)) throw error;
      }
      var finalState = await snapshot(pageId, filename, pointerKey, {});
      if (!finalState.pointer || !matches(finalState.pointer.lastWrite) || !same(finalState.baseline, committed.attachment)) fail('Another JSON change committed before this confirmation was read. Reload the current state.', 'CONFLICT');
      return exposed(finalState);
    }
    return Object.freeze({ request: request, page: page, user: user, property: property, putProperty: putProperty, readJSON: readJSON, writeJSON: writeJSON, inspectJSON:inspectJSON, reconcileJSON:reconcileJSON, maxBytes: MAX_BYTES });
  }
  return Object.freeze({ create: create, MAX_BYTES: MAX_BYTES, MAX_PROPERTY_BYTES: MAX_PROPERTY_BYTES });
});
