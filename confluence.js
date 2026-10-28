/* WCSpedia Confluence Data Center adapter. No credentials or tokens are embedded.
 * Reads and administrative uploads use the signed-in Confluence session.
 * Native-session authoring uses scoped pages and versioned attachment pointers.
 * Browser workflow is cooperative; native Confluence permissions remain authoritative.
 * REST references: https://docs.atlassian.com/ConfluenceServer/rest/7.18.3/
 * https://developer.atlassian.com/server/confluence/rest/v9225/api-group-user/
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSConfluence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  function directPublication(doc) { var content = root.WCSEditorContent || (typeof require === 'function' ? require('./editor-content.js') : null); return !!content && content.isDirectPublication(doc); }
  var STATUSES = ['Draft', 'In review', 'Changes requested', 'Awaiting approval', 'Published'];
  var ACTIONS = ['create', 'edit', 'delete', 'submit', 'request-changes', 'complete-review', 'approve', 'revise', 'add-category'];
  var PUBLICATION_ACTIONS = ['create', 'edit', 'revise', 'approve'];
  var BUSINESS_AREAS = ['credit-approval-control', 'credit-information-management', 'credit-management-reporting', 'deal-closing', 'documentation-pledging', 'emea-credit-admin', 'loan-management', 'regional-operating-manuals'];
  var MAX_JSON = 10000000; // This installation limits each attachment to 10 MB.
  function utf8Size(value) { return new TextEncoder().encode(value).byteLength; }
  function fail(message, code) { var error = new Error(message); error.code = code || 'INVALID_DATA'; throw error; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function text(value) { return typeof value === 'string' && value.trim().length > 0; }
  function integer(value, min) { return Number.isSafeInteger(value) && value >= (min == null ? 1 : min); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function unique(items, label) {
    var ids = new Set();
    items.forEach(function (item) { if (!object(item) || !text(item.id) || ids.has(item.id)) fail('Invalid or duplicate ' + label + ' ID.'); ids.add(item.id); });
    return ids;
  }
  function authoringHelper() {
    var helper = root.WCSEditorContent;
    if (!helper && typeof module === 'object' && module.exports) helper = require('./editor-content.js');
    if (!helper) fail('Load the WCSpedia authoring content helper before loading rich content.', 'CONFIGURATION');
    return helper;
  }
  function governanceHelper() {
    var helper = root.WCSGovernance;
    if (!helper && typeof module === 'object' && module.exports) helper = require('./governance.js');
    if (!helper) fail('Load the shared WCSpedia governance module first.', 'CONFIGURATION');
    return helper;
  }
  function governanceReview(value, expectedVersion, expectedRevision) {
    var helper = governanceHelper(), fields = ['baselineVersion', 'version', 'revision', 'checks', 'findingDisposition', 'reason'];
    if (!object(value) || Object.keys(value).some(function (key) { return fields.indexOf(key) < 0; })) fail('Provide only the revision-specific governance review fields.');
    if (value.baselineVersion !== helper.BASELINE_VERSION || value.version !== expectedVersion || value.revision !== expectedRevision) fail('The governance review must match the exact version, revision and baseline.', 'CONFLICT');
    var keys = helper.reviewChecklist.map(function (item) { return item.key; });
    if (!object(value.checks) || Object.keys(value.checks).length !== keys.length || keys.some(function (key) { return value.checks[key] !== true; })) fail('Confirm every governance review checklist item.');
    if (['clear', 'addressed', 'changes-required', 'needs-authority'].indexOf(value.findingDisposition) < 0 || !text(value.reason) || value.reason.length > 4000) fail('Provide a governance finding disposition and a rationale of up to 4,000 characters.');
    return { baselineVersion: value.baselineVersion, version: value.version, revision: value.revision, checks: clone(value.checks), findingDisposition: value.findingDisposition, reason: value.reason.trim() };
  }
  function entitlementHelper() {
    var helper = root.WCSEntitlements;
    if (!helper && typeof module === 'object' && module.exports) helper = require('./entitlements.js');
    if (!helper) fail('Load the shared WCSpedia entitlements module first.', 'CONFIGURATION');
    return helper;
  }
  function documentPageId(doc) {
    var direct = doc.confluencePageId, nested = object(doc.confluence) ? doc.confluence.pageId : null;
    if (direct != null && nested != null && String(direct) !== String(nested)) fail('Conflicting native page mappings for document ' + doc.id + '.', 'INVALID_MAPPING');
    var value = direct == null ? nested : direct;
    if (value != null && !/^[1-9]\d*$/.test(String(value))) fail('Invalid native page mapping for document ' + doc.id + '.', 'INVALID_MAPPING');
    return value == null ? null : String(value);
  }
  function publishedPageId(doc) {
    var value = doc.publishedConfluencePageId;
    if (value != null && !/^[1-9]\d*$/.test(String(value))) fail('Invalid published native page mapping for document ' + doc.id + '.', 'INVALID_MAPPING');
    return value == null ? null : String(value);
  }
  function authoringContent(value) {
    var has = function (key) { return Object.prototype.hasOwnProperty.call(value, key); };
    if (has('commentsEnabled') && typeof value.commentsEnabled !== 'boolean') fail('commentsEnabled must be true or false.');
    if (has('slug') && (typeof value.slug !== 'string' || value.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug))) fail('The slug must use lowercase letters, numbers and single hyphens (up to 120 characters).');
    if (has('highlights') && (!Array.isArray(value.highlights) || value.highlights.length > 5 || value.highlights.some(function (item) { return typeof item !== 'string' || !item.trim() || item.length > 500; }))) fail('Use up to five key highlights, each no more than 500 characters.');
    if (has('cover')) authoringHelper().validateCover(value.cover);
    if (has('sourceMetadata')) authoringHelper().validateSourceMetadata(value.sourceMetadata);
    if (has('sourceImportedAt') && (!value.sourceMetadata || typeof value.sourceImportedAt !== 'string' || !Number.isFinite(Date.parse(value.sourceImportedAt)))) fail('A source import needs a valid recorded timestamp and source metadata.');
    if (has('governance')) {
      if (!object(value.governance)) fail('Governance metadata must be an object.');
      governanceHelper().validate(value.governance, { complete: false });
    }
    ['tags', 'processes', 'regions'].forEach(function (field) { if (has(field)) authoringHelper().validateTags(value[field], field); });
    if (has('assets')) authoringHelper().validateAssets(value.assets);
    if (has('attachments')) authoringHelper().validateAttachments(value.attachments);
    if (has('bodyMarkdown')) {
      var sections = authoringHelper().toSections(value.bodyMarkdown);
      authoringHelper().validateReferences(value.bodyMarkdown, value);
      if (has('sections') && JSON.stringify(value.sections) !== JSON.stringify(sections)) fail('Document sections must match the Markdown content.');
      return sections;
    }
    return value.sections;
  }
  function pickContent(source, keys) {
    var result = {};
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      if (key === 'cover' && object(source.cover)) {
        result.cover = {};
        ['src', 'alt', 'caption'].forEach(function (field) { if (Object.prototype.hasOwnProperty.call(source.cover, field)) result.cover[field] = clone(source.cover[field]); });
      } else if ((key === 'assets' || key === 'attachments') && Array.isArray(source[key])) {
        var nestedFields = key === 'assets' ? ['id', 'src', 'alt'] : ['id', 'name', 'url', 'mimeType', 'size'];
        result[key] = source[key].map(function (item) {
          if (!object(item)) return clone(item);
          var nested = {}; nestedFields.forEach(function (field) { if (Object.prototype.hasOwnProperty.call(item, field)) nested[field] = clone(item[field]); });
          return nested;
        });
      } else result[key] = clone(source[key]);
    });
    return result;
  }
  function content(value, allowMarkdownOnly) {
    var derived = authoringContent(value);
    var sections = allowMarkdownOnly && value.sections === undefined ? derived : value.sections;
    if (!text(value.title) || !text(value.summary) || !Array.isArray(sections) || !sections.length) fail('Every content version requires a title, summary and sections.');
    unique(sections, 'section');
    sections.forEach(function (section) {
      if (!text(section.title) || !Array.isArray(section.paragraphs) || !Array.isArray(section.bullets) ||
          !section.paragraphs.concat(section.bullets).every(text) || !section.paragraphs.concat(section.bullets).length) fail('Invalid document section.');
    });
  }
  function category(value) {
    if (!object(value) || !text(value.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) || value.id.length > 80 || !text(value.name) || value.name.trim().length > 80) fail('Use a category name and a unique lowercase ID of up to 80 characters.');
    return { id: value.id, title: value.name.trim(), icon: 'folder' };
  }
  function addCategory(input, command, options) {
    options = options || {};
    validateData(input);
    var actor = input.people.find(function (person) { return person.id === options.actorId; });
    if (!actor || actor.role !== 'Manager') fail('Only a manager can add a category.', 'FORBIDDEN');
    var revision = input.taxonomyRevision || 1;
    if (!object(command) || !integer(command.expectedTaxonomyRevision) || command.expectedTaxonomyRevision !== revision) fail('Categories changed. Reload before adding a category.', 'CONFLICT');
    if (!text(command.comment)) fail('A category change comment is required.');
    var entry = category(command.category);
    if (input.areas.some(function (area) { return area.id === entry.id || area.title.trim().toLowerCase() === entry.title.toLowerCase(); })) fail('This category already exists.', 'CONFLICT');
    var at = options.now || new Date().toISOString();
    if (!text(at) || !Number.isFinite(Date.parse(at))) fail('A valid category action time is required.');
    var events = input.taxonomyAudit || [];
    if (events.length && Date.parse(at) < Date.parse(events[events.length - 1].at)) fail('Category action time cannot precede the latest audit event.');
    var data = clone(input), before = clone(data.areas);
    data.areas.push(entry); data.taxonomyRevision = revision + 1;
    data.taxonomyAudit = clone(events);
    data.taxonomyAudit.push({ id: 'taxonomy-event-' + data.taxonomyRevision, at: new Date(at).toISOString(), actorId: actor.id, action: 'add-category', revision: data.taxonomyRevision, comment: command.comment.trim(), changes: [{ field: 'areas', before: before, after: clone(data.areas) }] });
    return data;
  }
  function validateData(input) {
    if (!object(input) || (input.schemaVersion != null && input.schemaVersion !== 1)) fail('Unsupported WCSpedia JSON schema.');
    if (!Array.isArray(input.people) || !Array.isArray(input.areas) || !Array.isArray(input.documents)) fail('WCSpedia JSON requires people, areas and documents arrays.');
    // A fresh native-search installation has no document snapshots or directory
    // records yet. Live loading adds the authenticated user as a read-only actor.
    if (input.documents.length && !input.people.length) fail('Document snapshots require their referenced directory records.');
    var people = unique(input.people, 'person'), areas = unique(input.areas, 'area');
    unique(input.documents, 'document');
    if (input.taxonomyRevision != null && !integer(input.taxonomyRevision)) fail('Invalid category revision.');
    if (input.taxonomyAudit != null) {
      if (!Array.isArray(input.taxonomyAudit)) fail('Category audit history must be an array.');
      unique(input.taxonomyAudit, 'category audit event');
      input.taxonomyAudit.forEach(function (event) {
        var actor = input.people.find(function (person) { return person.id === event.actorId; });
        if (!actor || actor.role !== 'Manager' || !text(event.at) || !Number.isFinite(Date.parse(event.at)) || event.action !== 'add-category' || !integer(event.revision, 2) || !text(event.comment) || !Array.isArray(event.changes)) fail('Invalid category audit event.');
      });
    }
    input.people.forEach(function (person) {
      if (!text(person.name) || ['Author', 'Manager', 'Reader'].indexOf(person.role) < 0) fail('Invalid person in the directory.');
      if (person.confluence != null && !object(person.confluence)) fail('Invalid Confluence identity mapping.');
    });
    input.areas.forEach(function (area) { if (!text(area.title)) fail('Every business area needs a title.'); });
    var mappedPages = new Set();
    input.documents.forEach(function (doc) {
      var nativePageId = documentPageId(doc);
      if (nativePageId && mappedPages.has(nativePageId)) fail('Each document must map to a distinct Confluence page.', 'INVALID_MAPPING');
      if (nativePageId) mappedPages.add(nativePageId);
      var readerPageId = publishedPageId(doc);
      if (doc.singlePageInsight != null && (doc.singlePageInsight !== true || !doc.nativeSessionWorkflow || !directPublication(doc) || !nativePageId || readerPageId !== nativePageId || !Array.isArray(doc.versions) || doc.versions.some(function(v){return v.status!=='Published';}))) fail('Invalid single-page Insights mapping.', 'INVALID_MAPPING');
      if (readerPageId && mappedPages.has(readerPageId) && !(doc.singlePageInsight===true && readerPageId===nativePageId)) fail('Working and published documents require distinct native page mappings.', 'INVALID_MAPPING');
      if (readerPageId) mappedPages.add(readerPageId);
      ['confluencePageVersion', 'publishedConfluencePageVersion'].forEach(function (field) { if (doc[field] != null && !integer(doc[field])) fail('Invalid native page version for document ' + doc.id + '.', 'INVALID_MAPPING'); });
      if (!text(doc.reference) || !text(doc.type) || (!areas.has(doc.area)&&!(directPublication(doc)))) fail('Invalid document reference, type or business area.');
      (directPublication(doc)?['ownerId','authorId']:['ownerId', 'authorId', 'reviewerId', 'approverId']).forEach(function (field) { if (!people.has(doc[field])) fail('Invalid document ' + field + '.'); });
      if (!Array.isArray(doc.versions) || !doc.versions.length || !Array.isArray(doc.audit)) fail('Document versions and audit history are required.');
      var numbers = new Set();
      doc.versions.forEach(function (version) {
        if (!object(version) || !integer(version.version) || !integer(version.revision) || numbers.has(version.version) || STATUSES.indexOf(version.status) < 0) fail('Invalid or duplicate content version.');
        numbers.add(version.version); content(version);
        if (version.sourceMetadata != null) {
          if (typeof version.sourceImportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version.sourceImportedAt) || !Number.isFinite(Date.parse(version.sourceImportedAt)) || new Date(version.sourceImportedAt).toISOString() !== version.sourceImportedAt) fail('Source metadata needs a valid recorded import timestamp.');
        } else if (version.sourceImportedAt != null) fail('Source import timestamp requires source metadata.');
      });
      var sourceIdentity=null,sourceImportTime=null;
      doc.versions.slice().sort(function(a,b){return a.version-b.version;}).forEach(function(version){
        if(version.sourceMetadata!=null){
          if(sourceIdentity&&(sourceIdentity!==version.sourceMetadata.sourceId||sourceImportTime!==version.sourceImportedAt))fail('The document source identity and first import time must remain consistent across versions.');
          sourceIdentity=version.sourceMetadata.sourceId;sourceImportTime=version.sourceImportedAt;
        }else if(sourceIdentity)fail('Recorded source metadata cannot be removed from later versions.');
      });
      var latest = doc.versions.reduce(function (a, b) { return a.version > b.version ? a : b; });
      if (doc.versions.some(function (version) { return version !== latest && version.status !== 'Published'; })) fail('Only the current content version may be a draft.');
      if (doc.publishedVersion != null && !doc.versions.some(function (version) { return version.version === doc.publishedVersion && version.status === 'Published'; })) fail('Invalid published version pointer.');
      if (latest.status === 'Published' && latest.version !== doc.publishedVersion) fail('The current approved version must be the reader version.');
      unique(doc.audit, 'audit event');
      doc.audit.forEach(function (event) {
        if (!people.has(event.actorId) || !text(event.action) || !text(event.at) || !Number.isFinite(Date.parse(event.at)) || !Array.isArray(event.changes)) fail('Invalid audit event.');
      });
    });
    return input;
  }
  function publishedProjection(data) {
    if ((data.taxonomyAudit && data.taxonomyAudit.length) || data.documents.some(function (doc) { return doc.audit.length || doc.versions.length !== 1 || doc.versions[0].status !== 'Published' || doc.publishedVersion !== doc.versions[0].version || Object.prototype.hasOwnProperty.call(doc.versions[0], 'governanceReview'); })) {
      fail('The reader attachment must contain only the current approved snapshots and no audit events or private governance review evidence. Put working content in the restricted workspace.', 'PUBLISHED_PROJECTION_REQUIRED');
    }
    return data;
  }
  function facetLabel(kind, value) {
    if (['tag', 'process', 'region'].indexOf(kind) < 0 || typeof value !== 'string' || !value.trim() || value.length > 80) fail('Use a valid topic, process or region filter.');
    var normalized = value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/[^\x20-\x7e]/.test(normalized)) fail('Confluence page filters currently require a topic, process or region with an ASCII label. Use the WCSpedia library search for this value.');
    var slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) fail('Use a topic, process or region containing letters or numbers.');
    return 'wcs-' + kind + '-' + slug;
  }
  function create(config, dependencies) {
    config = config || {}; dependencies = dependencies || {};
    var mode = config.mode || 'local';
    var nativeSession = mode === 'confluence' && config.authoringMode === 'confluence-session';
    if (['local', 'confluence'].indexOf(mode) < 0) fail('Choose local or confluence mode.', 'CONFIGURATION');
    var fetcher = dependencies.fetch || (root.fetch && root.fetch.bind(root));
    if (typeof fetcher !== 'function') fail('Fetch is unavailable.', 'CONFIGURATION');
    var location = dependencies.location || root.location;
    var href = location && (location.href || location.origin);
    if (!href || !/^https?:$/.test(new URL(href).protocol)) fail('Serve WCSpedia over HTTP or HTTPS.', 'CONFIGURATION');
    var pageURL = new URL(href), origin = pageURL.origin;
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || (context && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context))) fail('Use a plain Confluence context path.', 'CONFIGURATION');
    context = context.replace(/\/+$/, '');
    if (config.baseUrl != null) {
      var configuredBase = new URL(config.baseUrl, origin);
      if (configuredBase.origin !== origin || configuredBase.username || configuredBase.password || configuredBase.search || configuredBase.hash || configuredBase.pathname.replace(/\/+$/, '') !== context) fail('Confluence baseUrl must match this origin and contextPath.', 'CONFIGURATION');
    }
    var pageId = config.rootPageId == null ? '' : String(config.rootPageId);
    if (mode === 'confluence' && (!/^[1-9]\d{0,19}$/.test(pageId) || (typeof config.rootPageId === 'number' && !Number.isSafeInteger(config.rootPageId)))) fail('Set rootPageId to the numeric pageId from the WCSpedia landing-page URL, not a space ID, key or name.', 'CONFIGURATION');
    // Static resources and the reader projection may live on a separate assets
    // page. This must never change the library's search or workflow root.
    var attachmentPageId = config.attachmentPageId == null || config.attachmentPageId === '' ? pageId : String(config.attachmentPageId);
    if (mode === 'confluence' && !/^[1-9]\d*$/.test(attachmentPageId)) fail('Set attachmentPageId to the numeric Confluence page ID hosting the WCSpedia attachments.', 'CONFIGURATION');
    var filename = config.attachmentFilename || 'wcspedia-published.json';
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*\.json$/.test(filename) || filename.indexOf('..') >= 0) fail('Use a simple JSON attachment filename.', 'CONFIGURATION');
    function safeURL(value, base, withinContext) {
      if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value)) fail('Invalid URL.', 'CONFIGURATION');
      var url = new URL(value, base || pageURL.href);
      if (/%(?:2e|2f|5c|25)/i.test(url.pathname)) fail('Encoded path traversal is not allowed.', 'CONFIGURATION');
      if (url.origin !== origin || !/^https?:$/.test(url.protocol) || url.username || url.password || url.hash ||
          (withinContext && context && url.pathname !== context && !url.pathname.startsWith(context + '/'))) fail('Only URLs on this Confluence origin and context are allowed.', 'CONFIGURATION');
      return url;
    }
    var localURL = mode === 'local' ? safeURL(config.dataUrl || './wcspedia-data.json') : null;
    var workflowURL = config.workflowEndpoint ? safeURL(config.workflowEndpoint, origin + context + '/', true) : null;
    var workspaceURL = config.workspaceEndpoint ? safeURL(config.workspaceEndpoint, origin + context + '/', true) : null;
    var entitlementURL = config.entitlementsEndpoint ? safeURL(config.entitlementsEndpoint, origin + context + '/', true) : null;
    var metricsURL = config.metricsEndpoint ? safeURL(config.metricsEndpoint, origin + context + '/', true) : null;
    if (config.nativePublication != null && !object(config.nativePublication)) fail('Native publication configuration must be an object.', 'CONFIGURATION');
    var nativePublication = config.nativePublication || {}, publicationEnabled = mode === 'confluence' && nativePublication.enabled === true;
    var entitlementSource = config.entitlementsSource == null ? 'attachment' : config.entitlementsSource;
    if (entitlementSource !== 'attachment') fail('WCSpedia entitlements use entitlements.json only. Upload entitlements.json to the attachments page and remove entitlementsSource or set it to "attachment"; native entitlement tables are no longer supported.', 'CONFIGURATION');
    // JSON policies use the shared attachments page unless an administrator
    // explicitly chooses a different policy host. The interface page is never
    // used as an implicit policy source.
    var entitlementHost = config.entitlementsPageId;
    if (entitlementHost == null || entitlementHost === '') {
      entitlementHost = config.attachmentPageId == null || config.attachmentPageId === '' ? config.rootPageId : config.attachmentPageId;
    }
    var entitlementPageId = entitlementHost == null ? '' : String(entitlementHost);
    if (entitlementHost != null && entitlementHost !== '' && (!/^[1-9]\d{0,19}$/.test(entitlementPageId) ||
        typeof entitlementHost !== 'string' && !(typeof entitlementHost === 'number' && Number.isSafeInteger(entitlementHost)))) {
      fail('Set entitlementsPageId to the numeric Confluence page ID hosting entitlements.json. Leave it blank to use the configured attachments page for an attachment policy.', 'CONFIGURATION');
    }
    var entitlementFilename = config.entitlementsFilename == null ? 'entitlements.json' : config.entitlementsFilename;
    if (typeof entitlementFilename !== 'string' || entitlementFilename.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._ -]*\.json$/.test(entitlementFilename) || entitlementFilename.indexOf('..') >= 0) fail('Use a simple JSON entitlementsFilename.', 'CONFIGURATION');
    var policyConfigured = /^[1-9]\d*$/.test(entitlementPageId);
    var last = null;
    var discoveryMetrics = new Map();
    var pendingCommand = null;
    var accessLast = null, pendingEntitlementCommand = null;
    var spaceStore = null, spaceWorkflow = null, spaceEngagement = null;
    function nativeModule(name, file) {
      var helper = root[name];
      if (!helper && typeof module === 'object' && module.exports) helper = require('./' + file);
      if (!helper) fail('Load the native WCSpedia storage and workflow modules from the same package.', 'CONFIGURATION');
      return helper;
    }
    function nativeStorage() {
      if (!spaceStore) spaceStore = nativeModule('WCSSpaceStorage', 'space-storage.js').create({
        contextPath: context, baseUrl: origin + context, spaceKey: config.spaceKey,
        rootPageId: pageId, extraRootPageIds: [nativePublication.workingRootPageId].filter(Boolean),
        allowedPageIds: [attachmentPageId, entitlementPageId],
        storagePageIds: [attachmentPageId, entitlementPageId],
        protectedPageIds: [pageId, attachmentPageId, entitlementPageId],
        allowSpacePermissionSync: config.nativeAccessSync === true
      }, { fetch: fetcher, crypto: dependencies.crypto || root.crypto, origin: origin });
      return spaceStore;
    }
    var spaceAccessSync;
    function nativeAccessSynchronizer() {
      if (!nativeSession || config.nativeAccessSync !== true) fail('Install the current Entitlements macro to enable native access synchronization.','CONFIGURATION');
      if (!spaceAccessSync) spaceAccessSync = nativeModule('WCSSpaceAccessSync','space-access-sync.js').create(Object.assign({},config,{spaceKey:config.spaceKey||verifiedSearchSpace,entitlementsPageId:entitlementPageId}), {
        storage:nativeStorage(),entitlements:entitlementHelper(),crypto:dependencies.crypto||root.crypto,
        uuid:function(){return (dependencies.crypto||root.crypto).randomUUID();},
        loadPolicy:async function(){return (await readEntitlementAttachment()).policy;}
      });
      return spaceAccessSync;
    }
    async function syncEntitlementAccess() {
      await nativeAccessSynchronizer().sync();
      return last ? load() : loadAccess();
    }
    function nativeWorkflow() {
      if (!spaceWorkflow) spaceWorkflow = nativeModule('WCSSpaceWorkflow', 'space-workflow.js').create(config, {
        storage: nativeStorage(), fetch: fetcher, crypto: dependencies.crypto || root.crypto,
        origin: origin, loadPolicy: async function (options) { return (await readEntitlementAttachment(options && options.signal)).policy; }
      });
      return spaceWorkflow;
    }
    async function loadNativeSession(options) {
      // Identity and scope are independent reads; retain both checks without
      // adding a serial network round trip to every workspace navigation.
      var startup = await Promise.all([waitForSearchSpace(options.signal), request(endpoint('/rest/api/user/current'), { signal: options.signal }).then(json)]);
      config.spaceKey = startup[0];
      var user = startup[1];
      observeSearchIdentity(user);
      var skipDocuments = ['entitlements', 'saved'].indexOf(config.pageRole) >= 0;
      var access = await resolveAccess(user, {}, null, options.signal, !skipDocuments);
      var catalog = root.WCSDiscoveryCatalog || dependencies.catalog;
      if (!catalog) fail('Load the matching page bundle with its navigation catalogue.', 'CONFIGURATION');
      last = await nativeWorkflow().load({ user: user, policy: access.entitlementPolicy, access: access, catalog: clone(catalog), signal: options.signal,
        workspaceScope: options.workspaceScope || 'all', skipDocuments: skipDocuments });
      validateData(last.data);
      accessLast = clone(last);
      return clone(last);
    }
    var pendingViews = new Map();
    var configuredSearchSpace = typeof config.spaceKey === 'string' ? config.spaceKey.trim() || undefined : config.spaceKey;
    var searchScopePromise = null, verifiedSearchSpace = null;
    if (config.search != null && !object(config.search)) fail('Search configuration must be an object.', 'CONFIGURATION');
    var searchConfig = config.search || {}, searchTimeout = searchConfig.timeoutMs == null ? 12000 : searchConfig.timeoutMs;
    if (!integer(searchTimeout) || searchTimeout < 1000 || searchTimeout > 30000) fail('Use a search timeout between 1,000 and 30,000 milliseconds.', 'CONFIGURATION');
    if (searchConfig.transport != null && ['content', 'search'].indexOf(searchConfig.transport) < 0) fail('Choose content or search as the Confluence search transport.', 'CONFIGURATION');
    var preferContentSearch = searchConfig.transport !== 'search';
    // This tab and adapter own the cache. Identity/access refreshes and writes
    // invalidate it; native Confluence permissions still apply to every read.
    var searchCache = new Map(), searchInflight = new Map(), searchGeneration = 0, searchIdentity = null, discoverySessionChanged = false, searchIdentityAt = 0, identityCheck = null;
    function searchAbort() { var error = new Error('The search was cancelled.'); error.name = 'AbortError'; return error; }
    function clearSearchReads() {
      searchGeneration++; searchCache.clear();
      searchInflight.forEach(function (entry) { entry.controller.abort(); settleSearchRead(entry, searchAbort()); });
      searchInflight.clear(); searchScopePromise = null; verifiedSearchSpace = null;
      preferContentSearch = searchConfig.transport !== 'search';
    }
    function observeSearchIdentity(user) {
      var identity = entitlementHelper().identity(user);
      var fingerprint = JSON.stringify([user.type || '', user.userKey || '', user.accountId || '', identity && identity.soeid || '']);
      if (searchIdentity !== null && searchIdentity !== fingerprint) clearSearchReads();
      searchIdentity = fingerprint; searchIdentityAt = Date.now();
    }
    async function verifyDiscoverySession(signal) {
      var user = await json(await request(endpoint('/rest/api/user/current'), { signal: signal }));
      if (!user || user.type !== 'known' || !(user.userKey || user.username || user.accountId)) {
        clearSearchReads(); fail('Your Confluence session has expired. Sign in to Confluence, then try again.', 'AUTH_REQUIRED');
      }
      var previous = searchIdentity;
      observeSearchIdentity(user);
      discoverySessionChanged = discoverySessionChanged || previous !== null && previous !== searchIdentity;
      if (discoverySessionChanged) {
        fail('Your Confluence account changed. Reload this page to use the current account.', 'SESSION_CHANGED');
      }
    }
    function waitForDiscoverySession(signal, force) {
      throwIfAborted(signal);
      if(discoverySessionChanged)fail('Your Confluence account changed. Reload this page to use the current account.', 'SESSION_CHANGED');
      if(!force&&(searchIdentity===null||Date.now()-searchIdentityAt<60000))return Promise.resolve();
      // Share one bounded session check across typeahead, recent cards and area
      // queries. Cancelling one subscriber must not cancel the others.
      if(!identityCheck)identityCheck=verifyDiscoverySession().finally(function(){identityCheck=null;});
      var pending=identityCheck;
      return new Promise(function(resolve,reject){
        function cancel(){reject(searchAbort());}
        if(signal)signal.addEventListener('abort',cancel,{once:true});
        pending.then(function(){if(signal)signal.removeEventListener('abort',cancel);resolve();},function(error){if(signal)signal.removeEventListener('abort',cancel);reject(error);});
      });
    }
    function settleSearchRead(entry, error, result) {
      if (entry.settled) return;
      entry.settled = true; clearTimeout(entry.cancelTimer);
      if (searchInflight.get(entry.key) === entry) searchInflight.delete(entry.key);
      if (!error && result.results?.length && entry.subscribers.size && !entry.controller.signal.aborted && entry.generation === searchGeneration) {
        searchCache.delete(entry.key); searchCache.set(entry.key, { at: Date.now(), result: clone(result) });
        while (searchCache.size > 24) searchCache.delete(searchCache.keys().next().value);
      }
      Array.from(entry.subscribers).forEach(function (subscriber) { subscriber.finish(error, result); });
    }
    function searchReadKey(options) {
      // Preserve invalid types in the key too: malformed input must never hit a
      // valid cached response instead of reaching normal scope validation.
      function canonical(value) {
        if (Array.isArray(value)) return ['array', value.map(canonical)];
        if (object(value)) return ['object', Object.keys(value).sort().map(function (key) { return [key, canonical(value[key])]; })];
        return [typeof value, String(value)];
      }
      var defaults = { insights: false, nativeChildren: false, scope: 'published', query: '', area: '', type: '', types: undefined, tag: '', process: '', region: '', year: '', updated: 'any', sort: 'relevance', limit: 20, start: 0, continuation: undefined, excerpt: true, excludeIds: undefined, excludeAncestorIds: undefined };
      return JSON.stringify(Object.keys(defaults).map(function (key) {
        return [key, canonical(options[key] === undefined ? defaults[key] : options[key])];
      }));
    }
    function subscribeSearch(entry, signal) {
      clearTimeout(entry.cancelTimer);
      return new Promise(function (resolve, reject) {
        var done = false;
        var subscriber = { finish: function (error, result) {
          if (done) return; done = true;
          entry.subscribers.delete(subscriber);
          if (signal) signal.removeEventListener('abort', cancel);
          if (error) reject(error); else resolve(clone(result));
        } };
        function cancel() {
          subscriber.finish(searchAbort());
          if (!entry.settled && !entry.subscribers.size) {
            // A route can hand the same work from landing to results without
            // restarting the HTTP request. Cancelled consumers reject now.
            entry.cancelTimer = setTimeout(function () {
              if (!entry.settled && !entry.subscribers.size) {
                entry.controller.abort(); settleSearchRead(entry, searchAbort());
              }
            }, 50);
          }
        }
        entry.subscribers.add(subscriber);
        if (entry.resume) entry.resume();
        if (signal) { signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel(); }
      });
    }
    function searchPageIDs(values, label) {
      if (values == null) return [];
      if (!Array.isArray(values) || values.length > 100 || values.some(function (id) { return !((typeof id === 'string' || Number.isSafeInteger(id)) && /^[1-9]\d{0,19}$/.test(String(id))); })) fail('Use at most 100 numeric ' + label + '.', 'CONFIGURATION');
      return Array.from(new Set(values.map(String)));
    }
    var configuredExcludedPages = searchPageIDs(searchConfig.excludePageIds, 'excluded page IDs');
    var configuredExcludedTrees = searchPageIDs(searchConfig.excludeAncestorIds, 'excluded ancestor IDs');
    function searchExclusions(options, includeAreaPages) {
      options = options || {};
      var mappings = object(nativePublication.areaPageIds) ? nativePublication.areaPageIds : {};
      var areas = Object.keys(mappings).map(function (key) { return String(mappings[key]); });
      var pages = [pageId, attachmentPageId, entitlementPageId], trees = configuredExcludedTrees.slice();
      var insights = nativePublication.insightsPageId ? searchPageIDs([nativePublication.insightsPageId], 'Insights parent page IDs')[0] : null;
      if (insights) {
        if (insights === pageId || areas.indexOf(insights) >= 0) fail('The Insights parent must be separate from the WCSpedia root and business-area pages.', 'CONFIGURATION');
        pages.push(insights);
      }
      var working = nativePublication.workingRootPageId;
      // Generated installations can enable native reading before the optional
      // working-document backend is configured. Its known setup placeholder is
      // not a real subtree; publication writes still require numeric parents.
      var workingPlaceholder = typeof working === 'string' && /^REPLACE_WITH_(?:RESTRICTED_)?WORKING_ROOT_PAGE_ID$/.test(working);
      if (working != null && working !== '' && !workingPlaceholder) {
        var workingID = searchPageIDs([working], 'working root page IDs')[0];
        if (workingID === pageId || areas.indexOf(workingID) >= 0 || workingID === insights) fail('The working root must be separate from the WCSpedia root, Insights and business-area pages.', 'CONFIGURATION');
        pages.push(workingID); trees.push(workingID);
      }
      Object.keys(object(config.pages) ? config.pages : {}).forEach(function (key) {
        try {
          // Navigation fragments select an app view, not a different Confluence page.
          var value = config.pages[key];
          if (typeof value !== 'string') return;
          var url = safeURL(value.split('#')[0], origin + context + '/', true);
          if (url.pathname === context + '/pages/viewpage.action') pages.push(url.searchParams.get('pageId'));
        } catch (_) { /* External links are not search-scope configuration. */ }
      });
      pages = pages.filter(function (id) { return /^[1-9]\d{0,19}$/.test(String(id || '')); }).map(String)
        .concat(configuredExcludedPages, searchPageIDs(options.excludeIds, 'excluded page IDs'));
      trees = trees.concat(searchPageIDs(options.excludeAncestorIds, 'excluded ancestor IDs'));
      if (trees.some(function (id) { return id === pageId || areas.indexOf(id) >= 0; })) fail('Do not exclude the WCSpedia root or a business-area subtree.', 'CONFIGURATION');
      if (includeAreaPages !== false) pages = pages.concat(areas.filter(function (id) { return /^[1-9]\d{0,19}$/.test(id); }));
      return { pages: Array.from(new Set(pages.concat(trees))), trees: Array.from(new Set(trees)) };
    }
    function endpoint(path) { return new URL(context + path, origin); }
    var responseReads = new WeakMap();
    var requestTimeoutMs = config.requestTimeoutMs == null ? 12000 : config.requestTimeoutMs;
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) fail('Use a requestTimeoutMs between 1 and 60000.', 'CONFIGURATION');
    async function boundedRequest(task, signal, mutation, cancel) {
      if (signal && signal.aborted && cancel) cancel();
      throwIfAborted(signal);
      var controller = new AbortController(), timer, onAbort;
      var stopped = new Promise(function (_, reject) {
        function stop(external) {
          var error = new Error(mutation ? 'The write outcome is unknown. Check the original save before retrying.' : external ? 'The request was cancelled.' : 'Confluence took too long to respond. Your unsaved content is kept; try again.');
          if (mutation) error.code = 'UNKNOWN_COMMIT'; else if (external) error.name = 'AbortError'; else error.code = 'TIMEOUT';
          reject(error); controller.abort(); if (cancel) cancel();
        }
        timer = setTimeout(function () { stop(false); }, mutation ? 60000 : requestTimeoutMs);
        onAbort = function () { stop(true); };
        if (signal) signal.addEventListener('abort', onAbort, {once:true});
      });
      try { return await Promise.race([Promise.resolve().then(function () { throwIfAborted(controller.signal); return task(controller); }), stopped]); }
      finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
    }
    async function request(url, options) {
      var settings = Object.assign({ method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } }, options || {});
      var response, controller, parentSignal = settings.signal, mutation = !['GET','HEAD'].includes(settings.method.toUpperCase());
      try { response = await boundedRequest(function (pending) { controller = pending; settings.signal = pending.signal; return fetcher(url.href || String(url), settings); }, parentSignal, mutation); }
      catch (error) { if (error && (error.code || error.name === 'AbortError')) throw error; fail(mutation ? 'The write outcome is unknown. Check the original save before retrying.' : 'Confluence could not be reached. Check your connection and session.', mutation ? 'UNKNOWN_COMMIT' : 'NETWORK'); }
      if (!response.ok) {
        var error = new Error(response.status === 401 || response.status === 403 ? 'Your Confluence session does not have access to this resource.' : response.status === 409 ? 'This content changed. Reload before continuing.' : response.status === 413 ? 'Confluence rejected the upload as too large. Each attachment must be at most 10 MB; this operation may have a smaller limit.' : 'Confluence request failed (' + response.status + ').');
        error.code = response.status === 409 ? 'CONFLICT' : response.status === 413 ? 'ATTACHMENT_TOO_LARGE' : 'HTTP_ERROR'; error.status = response.status; throw error;
      }
      responseReads.set(response, {signal:parentSignal, mutation:mutation, controller:controller});
      return response;
    }
    async function json(response, options) {
      var pending = responseReads.get(response);
      responseReads.delete(response);
      if (!pending) return parseJSON(response, options);
      return boundedRequest(function () { return parseJSON(response, options); }, pending.signal, pending.mutation, function () { pending.controller.abort(); });
    }
    async function parseJSON(response, options) {
      options = options || {};
      var limit = options.limit || MAX_JSON;
      var value;
      try {
        var sizeError = function () { fail(options.sizeMessage || 'The WCSpedia JSON exceeds the 10 MB limit. Reduce or partition the stored data before uploading.', options.code || 'ATTACHMENT_TOO_LARGE'); };
        var declared = response.headers && response.headers.get('content-length');
        if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
          if (response.body && response.body.cancel) await response.body.cancel().catch(function () {});
          sizeError();
        }
        var body;
        if (response.body && typeof response.body.getReader === 'function') {
          var reader = response.body.getReader(), chunks = [], total = 0, decoder = new TextDecoder();
          try {
            while (true) {
              var chunk = await reader.read();
              if (chunk.done) break;
              total += chunk.value.byteLength;
              if (total > limit) { await reader.cancel().catch(function () {}); sizeError(); }
              chunks.push(decoder.decode(chunk.value, { stream: true }));
            }
            body = chunks.join('') + decoder.decode();
          } finally { reader.releaseLock(); }
        } else {
          body = await response.text();
          if (utf8Size(body) > limit) sizeError();
        }
        value = JSON.parse(body);
      } catch (error) { if (error.code || error.name === 'AbortError') throw error; fail(options.parseMessage || 'Expected JSON from Confluence. Sign in again if your session expired.', options.code || 'INVALID_JSON'); }
      return value;
    }
    async function pageAccess(id, signal) {
      throwIfAborted(signal);
      if (!/^[1-9]\d*$/.test(String(id))) fail('A mapped Confluence page ID is required.', 'CONFIGURATION');
      var url = endpoint('/rest/api/content/' + id);
      url.search = new URLSearchParams({ expand: 'operations,version' }).toString();
      var result = nativeSession ? await nativeStorage().page(String(id), 'operations,version', { signal: signal }) : await json(await request(url, { signal: signal }));
      throwIfAborted(signal);
      if (!object(result) || String(result.id) !== String(id) || !Array.isArray(result.operations) ||
          Object.prototype.hasOwnProperty.call(result, 'type') && result.type !== 'page') fail('Confluence did not return native page operations.', 'INVALID_PERMISSIONS');
      if (result.operations.some(function (op) { return !object(op) || !text(op.operation) || !text(op.targetType); })) fail('Invalid native Confluence operations.', 'INVALID_PERMISSIONS');
      // Confluence REST applies the authenticated user's read permissions. A
      // successful matching-page GET proves read access even where the server's
      // available-operations expansion lists only mutations. It never proves
      // create, update or delete authority; those remain explicit operations.
      if (!entitlementHelper().nativeHas(result.operations, 'read')) result.operations.push({ operation: 'read', targetType: 'page' });
      return result;
    }
    async function entitlementMetadata(signal) {
      throwIfAborted(signal);
      var url = endpoint('/rest/api/content/' + entitlementPageId + '/child/attachment');
      url.search = new URLSearchParams({ filename: entitlementFilename, expand: 'version', limit: '2' }).toString();
      var body = await json(await request(url, { signal: signal }));
      throwIfAborted(signal);
      if (!object(body) || !Array.isArray(body.results)) fail('Unexpected entitlement attachment metadata.', 'INVALID_ENTITLEMENTS');
      var matches = body.results.filter(function (item) { return object(item) && item.title === entitlementFilename; });
      if (matches.length !== 1 || body.results.length !== 1 || body._links && body._links.next) fail('Provide exactly one ' + entitlementFilename + ' attachment on the entitlements page (' + entitlementPageId + ').', 'INVALID_ENTITLEMENTS');
      var item = matches[0];
      if (!/^[1-9]\d*$/.test(String(item.id)) || !item.version || !integer(item.version.number)) fail('The entitlement attachment ID and version are required.', 'INVALID_ENTITLEMENTS');
      return { id: String(item.id), version: item.version.number };
    }
    async function readEntitlementAttachment(signal) {
      if (nativeSession) {
        var current = await nativeStorage().readJSON(entitlementPageId, entitlementFilename, 'wcspedia.entitlements.v1', { signal: signal });
        if (!current.data) fail('Upload your live entitlements.json to attachments page ' + entitlementPageId + '.', 'INVALID_ENTITLEMENTS');
        if (utf8Size(JSON.stringify(current.data)) > 2 * 1024 * 1024) fail('The entitlement JSON exceeds the 2 MB limit.', 'INVALID_ENTITLEMENTS');
        return { policy: entitlementHelper().validatePolicy(current.data), id: current.attachmentId, version: current.attachmentVersion, pointerRevision: current.revision, fingerprint:current.fingerprint };
      }
      var meta = await entitlementMetadata(signal);
      // Read the latest filename on the configured control page. Verify the
      // metadata again before using it; never follow server-supplied URLs.
      var download = endpoint('/download/attachments/' + entitlementPageId + '/' + encodeURIComponent(entitlementFilename));
      download.search = new URLSearchParams({ api: 'v2' }).toString();
      var value = await json(await request(download, { signal: signal }), {
        limit: 2 * 1024 * 1024, code: 'INVALID_ENTITLEMENTS',
        sizeMessage: 'The entitlement JSON exceeds the 2 MB limit.',
        parseMessage: 'The entitlement attachment must contain valid JSON.'
      });
      throwIfAborted(signal);
      var policy = entitlementHelper().validatePolicy(value);
      var fresh = await entitlementMetadata(signal);
      if (fresh.id !== meta.id || fresh.version !== meta.version) fail('The entitlement attachment changed while it was loading. Reload before continuing.', 'CONFLICT');
      return { policy: policy, id: meta.id, version: meta.version };
    }
    var entitlementRecoveryPreview = null;
    async function inspectEntitlementRecovery() {
      entitlementRecoveryPreview = null;
      if (!nativeSession || config.pageRole !== 'entitlements') fail('Open the Entitlements page to review attachment recovery.', 'CONFIGURATION');
      config.spaceKey = await waitForSearchSpace();
      var preview = await nativeStorage().inspectJSON(entitlementPageId, entitlementFilename, 'wcspedia.entitlements.v1');
      if (!preview.canRepair) fail('Native Edit permission on attachments page ' + entitlementPageId + ' is required to recover the policy reference.', 'FORBIDDEN');
      if (preview.candidate.bytes > 2 * 1024 * 1024) fail('The entitlement JSON exceeds the 2 MB limit.', 'INVALID_ENTITLEMENTS');
      // Recovery is the equivalent of a native policy-file administrator
      // adopting a manual upload. Never silently import it as active authority.
      entitlementHelper().validatePolicy(preview.data);
      entitlementRecoveryPreview = preview;
      return clone(preview);
    }
    async function reconcileEntitlementAttachment() {
      if (!nativeSession || config.pageRole !== 'entitlements' || !entitlementRecoveryPreview) fail('Review the current entitlement attachment before recovery.', 'NOT_LOADED');
      var preview = entitlementRecoveryPreview;
      entitlementRecoveryPreview = null;
      entitlementHelper().validatePolicy(preview.data);
      var crypto = dependencies.crypto || root.crypto;
      if (!crypto || !crypto.randomUUID) fail('Web Crypto is required for recovery.', 'CONFIGURATION');
      await nativeStorage().reconcileJSON(preview, {requestId:'entitlement-recovery-' + crypto.randomUUID()});
      accessLast = null; last = null; discoveryMetrics.clear();
      return true;
    }
    async function resolveAccess(user, documentPages, existing, signal, deferNativeCapability) {
      throwIfAborted(signal);
      var E = entitlementHelper(), identity = E.identity(user);
      var access = existing ? clone(existing) : { identity: identity, entitlementPolicy: null, entitlementSource: entitlementSource, entitlementsSource: entitlementSource, entitlementsPageId: entitlementPageId, entitlementsFilename: entitlementFilename, nativePermissions: { root: [], entitlements: [], documents: {} }, nativePageVersions: {}, effectivePermissions: {}, documentPermissions: {}, policyConfigured: policyConfigured };
      E.PERMISSIONS.forEach(function (permission) { access.effectivePermissions[permission] = false; });
      if (mode !== 'confluence' || !policyConfigured || !identity) { accessLast = access; return clone(access); }
      if (!existing) {
        var pair = await Promise.all([pageAccess(pageId, signal), pageAccess(entitlementPageId, signal), readEntitlementAttachment(signal)]);
        throwIfAborted(signal);
        var rootPage = pair[0], policyPage = pair[1];
        if (!policyPage.version || !integer(policyPage.version.number)) fail('The entitlement page version is required.', 'INVALID_ENTITLEMENTS');
        var attachment = pair[2];
        access.entitlementPolicy = attachment.policy;
        access.entitlementAttachmentId = attachment.id;
        access.entitlementAttachmentVersion = attachment.version;
        if (nativeSession) { access.entitlementPointerRevision = attachment.pointerRevision; access.entitlementFingerprint = attachment.fingerprint; }
        access.nativePermissions.root = rootPage.operations;
        access.nativePermissions.entitlements = policyPage.operations;
        if(nativeSession && config.nativeAccessSync===true && config.pageRole==='entitlements' && E.hasGrant(access.entitlementPolicy,identity,'entitlements.view','*')) {
          try {access.entitlementSync=await nativeAccessSynchronizer().status(access.entitlementPolicy);}
          catch(error){access.entitlementSync={status:'incomplete',message:'Native access status could not be read. '+error.message};}
        }
        // A full workspace load checks the same boundaries in contextFor().
        // Defer this UI-only capability probe there; mutations always recheck.
        if (nativeSession && !deferNativeCapability && E.hasGrant(access.entitlementPolicy, identity, 'content.create', '*')) {
          var nativeCapability;
          try { nativeCapability = await nativeWorkflow().capabilities({ user: user, policy: access.entitlementPolicy, access: access, signal: signal }); }
          catch (error) { if (error.name === 'AbortError') throw error; nativeCapability = { canCreateDocument: false, message: error.message, code: error.code }; }
          access.nativePermissions.root = rootPage.operations.filter(function (op) { return op.operation !== 'create'; });
          if (nativeCapability.canCreateDocument === true) access.nativePermissions.root.push({ operation: 'create', targetType: 'page' });
          access.creationMessage = nativeCapability.message || nativeCapability.reason || '';
          access.creationCode = nativeCapability.code || '';
        }
        // Legacy service mode obtains its own actor-bound capability proof.
        // Native-session mode has already checked built-in Confluence rights.
        if (!nativeSession && !E.nativeHas(rootPage.operations, 'create') && workflowURL && workspaceURL && E.hasGrant(access.entitlementPolicy, identity, 'content.create', '*')) {
          var capabilityURL = new URL(workspaceURL.href);
          capabilityURL.searchParams.set('rootPageId', pageId);
          capabilityURL.searchParams.set('capabilitiesOnly', 'true');
          var proof = await json(await request(capabilityURL, { signal: signal }));
          throwIfAborted(signal);
          if (!object(proof) || proof.rootPageId !== pageId || !object(proof.identity) || proof.identity.soeid !== identity.soeid ||
              ['userKey', 'accountId'].some(function (key) { return (proof.identity[key] || '') !== (identity[key] || ''); }) ||
              typeof proof.canCreateDocument !== 'boolean') fail('The document service did not confirm creation access for this Confluence account and library.', 'INVALID_PERMISSIONS');
          if (proof.canCreateDocument && E.nativeHas(rootPage.operations, 'read')) access.nativePermissions.root.push({ operation: 'create', targetType: 'page' });
        }
      }
      documentPages = documentPages || {};
      if (!object(documentPages)) fail('Document page mappings must be an object.', 'CONFIGURATION');
      var keys = Object.keys(documentPages), usedPages = new Set();
      keys.forEach(function (key) { if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(key) || !/^[1-9]\d*$/.test(String(documentPages[key])) || usedPages.has(String(documentPages[key]))) fail('Document keys require distinct native page mappings.', 'CONFIGURATION'); usedPages.add(String(documentPages[key])); });
      // Resolve rights from actual mapped pages, never from the library parent.
      // Keep requests bounded for a large library.
      for (var start = 0; start < keys.length; start += 8) {
        await Promise.all(keys.slice(start, start + 8).map(async function (key) {
          var result = await pageAccess(documentPages[key], signal);
          access.nativePermissions.documents[key] = result.operations;
          if (result.version && integer(result.version.number)) access.nativePageVersions[key] = result.version.number;
        }));
      }
      E.PERMISSIONS.forEach(function (permission) { access.effectivePermissions[permission] = E.effective(access.entitlementPolicy, identity, permission, { native: access.nativePermissions }); });
      keys.forEach(function (key) { access.documentPermissions[key] = { edit: E.effective(access.entitlementPolicy, identity, 'content.edit', { native: access.nativePermissions, documentKey: key }), delete: E.effective(access.entitlementPolicy, identity, 'content.delete', { native: access.nativePermissions, documentKey: key }) }; });
      throwIfAborted(signal);
      accessLast = access;
      return clone(access);
    }
    async function loadAccess(options) {
      options = options || {};
      throwIfAborted(options.signal);
      // Permission UI runs alongside native reading (for example Insights).
      // Refresh completed responses without cancelling independently authorized
      // in-flight searches unless the authenticated account actually changed.
      searchCache.clear();
      accessLast = null;
      if (mode !== 'confluence') return resolveAccess(null, {}, null, options.signal);
      if (nativeSession) config.spaceKey = await waitForSearchSpace(options.signal);
      var user = await json(await request(endpoint('/rest/api/user/current'), { signal: options.signal }));
      throwIfAborted(options.signal);
      if (!object(user)) fail('Unexpected Confluence current-user response.');
      observeSearchIdentity(user);
      var access = await resolveAccess(user, options.documentPages || {}, null, options.signal);
      searchCache.clear();
      return access;
    }
    async function metadata(signal) {
      var url = endpoint('/rest/api/content/' + attachmentPageId + '/child/attachment');
      url.search = new URLSearchParams({ filename: filename, expand: 'version', limit: '2' }).toString();
      var body = await json(await request(url, { signal: signal }));
      throwIfAborted(signal);
      if (!body || !Array.isArray(body.results)) fail('Unexpected Confluence attachment response.');
      var matches = body.results.filter(function (item) { return item.title === filename; });
      if (matches.length !== 1) fail(matches.length ? 'More than one attachment matches the configured filename.' : 'Upload ' + filename + ' to the configured attachments page (' + attachmentPageId + ').', 'ATTACHMENT_NOT_FOUND');
      var item = matches[0];
      if (!/^[1-9]\d*$/.test(String(item.id)) || !item.version || !integer(item.version.number)) fail('The attachment ID or version is missing.');
      return { id: String(item.id), version: item.version.number };
    }
    function mapActor(data, user) {
      var keys = ['userKey', 'accountId'], E = entitlementHelper();
      var matches = user.type === 'anonymous' ? [] : data.people.filter(function (person) {
        var mapping = object(person.confluence) ? person.confluence : {};
        var commonKeys = keys.filter(function (key) { return text(user[key]) && text(mapping[key]); });
        // A matching display name or reused username must not override a
        // conflicting immutable user key / account ID.
        if (commonKeys.some(function (key) { return user[key] !== mapping[key]; })) return false;
        var soe = E.normalizeSOEID(user.username), mappedUsername = E.normalizeSOEID(mapping.username), personSOEID = E.normalizeSOEID(person.soeid);
        if (soe && mappedUsername && soe !== mappedUsername) return false;
        if (soe && personSOEID && soe !== personSOEID) return false;
        return commonKeys.length > 0 || !!soe && (soe === mappedUsername || soe === personSOEID);
      });
      if (matches.length > 1) fail('This Confluence account is mapped to multiple people.', 'IDENTITY_MAPPING');
      if (matches.length === 1) return { person: matches[0], mapped: true };
      var id = 'confluence-reader';
      while (data.people.some(function (person) { return person.id === id; })) id += '-unmapped';
      var reader = { id: id, name: text(user.displayName) ? user.displayName : 'Confluence reader', role: 'Reader', initials: 'CR' };
      data.people.push(reader);
      return { person: reader, mapped: false };
    }
    async function readAttachment(meta, signal) {
      // Construct a latest-file download ourselves; never follow URLs supplied
      // in attachment metadata to another origin or content container.
      var download = endpoint('/download/attachments/' + attachmentPageId + '/' + encodeURIComponent(filename));
      download.search = new URLSearchParams({ api: 'v2' }).toString();
      var data = await json(await request(download, { signal: signal }));
      throwIfAborted(signal);
      var fresh = await metadata(signal);
      if (fresh.id !== meta.id || fresh.version !== meta.version) fail('The JSON attachment changed while loading. Reload before continuing.', 'CONFLICT');
      return validateData(data);
    }
    async function load(options) {
      options = options || {};
      if (options.discoveryOnly != null && typeof options.discoveryOnly !== 'boolean') fail('discoveryOnly must be a boolean.', 'CONFIGURATION');
      throwIfAborted(options.signal);
      clearSearchReads();
      accessLast = null;
      if (mode === 'local') {
        var localData = validateData(await json(await request(localURL, { signal: options.signal })));
        throwIfAborted(options.signal);
        if (!localData.people.length) fail('A local preview requires at least one directory record. Use Confluence mode for the empty live starter.');
        var localActor = localData.people.find(function (person) { return person.id === config.localActorId; }) || localData.people.find(function (person) { return person.role === 'Author'; }) || localData.people[0];
        var localAccess = await resolveAccess(null, {}, null, options.signal);
        throwIfAborted(options.signal);
        last = Object.assign({ data: localData, actorId: localActor.id, actor: localActor, attachmentVersion: null, attachmentId: null, mode: mode, canSubmit: false, canWriteAttachment: false, identityMapped: false, workspaceLoaded: false }, localAccess);
        return clone(last);
      }
      if (nativeSession && !options.discoveryOnly) return loadNativeSession(options);
      var catalog = options.discoveryOnly && (root.WCSDiscoveryCatalog || dependencies.catalog);
      var catalogData = catalog ? validateData(clone(catalog)) : null;
      if (catalogData && (catalogData.isDemo !== false || catalogData.people.length || catalogData.documents.length)) fail('The discovery catalog must contain only navigation metadata, with no people or documents.', 'CONFIGURATION');
      var pair = await Promise.all([
        catalogData ? Promise.resolve(null) : metadata(options.signal),
        request(endpoint('/rest/api/user/current'), { signal: options.signal }).then(json),
        options.discoveryOnly ? waitForSearchSpace(options.signal) : Promise.resolve(null)
      ]);
      throwIfAborted(options.signal);
      var meta = pair[0], user = pair[1];
      if (nativeSession && options.discoveryOnly) config.spaceKey = pair[2];
      if (!object(user)) fail('Unexpected Confluence current-user response.');
      observeSearchIdentity(user);
      // These independent, authenticated reads need not wait for one another.
      // Do not expose a session until the projection and all access checks pass.
      var initial = await Promise.all([catalogData ? Promise.resolve(catalogData) : readAttachment(meta, options.signal).then(publishedProjection), policyConfigured && !options.discoveryOnly ? resolveAccess(user, {}, null, options.signal) : Promise.resolve(null)]);
      throwIfAborted(options.signal);
      var data = initial[0], preliminaryAccess = initial[1];
      var identity = mapActor(data, user);
      if (options.discoveryOnly) {
        // Native search enforces Confluence read permissions. Do not load the
        // private workspace, policy, or per-document write rights just to browse.
        // This read-only session must be fully reloaded before any authoring UI.
        var readAccess = await resolveAccess(null, {}, null, options.signal);
        throwIfAborted(options.signal);
        readAccess.identity = entitlementHelper().identity(user);
        last = Object.assign({ data: data, actorId: identity.person.id, actor: identity.person, attachmentVersion: meta ? meta.version : null, attachmentId: meta ? meta.id : null,
          mode: mode, identityMapped: identity.mapped, discoveryOnly: true, workspaceLoaded: false, canSubmit: false, canWriteAttachment: false }, readAccess);
        return clone(last);
      }
      var workspaceLoaded = false;
      // A new author or assigned reviewer need not appear in the approved
      // reader attachment yet. The trusted endpoint filters its own response;
      // requesting it does not grant any authority. Match its directory to the
      // authenticated user before enabling any command below.
      if (workspaceURL && preliminaryAccess && preliminaryAccess.identity) {
        var workspaceRequest = new URL(workspaceURL.href);
        workspaceRequest.searchParams.set('rootPageId', pageId);
        var workspace = await json(await request(workspaceRequest, { signal: options.signal }));
        throwIfAborted(options.signal);
        var authorizedData = validateData(object(workspace) && workspace.data ? workspace.data : workspace);
        var authorizedIdentity = mapActor(authorizedData, user);
        if (!authorizedIdentity.mapped || identity.mapped && authorizedIdentity.person.id !== identity.person.id) fail('The authorized workspace identity does not match this Confluence session.', 'IDENTITY_MAPPING');
        data = authorizedData; identity = authorizedIdentity; workspaceLoaded = true;
      }
      var documentPages = {};
      data.documents.forEach(function (doc) { var id = documentPageId(doc); if (id && !doc.deletedAt) documentPages[doc.id] = id; });
      var access = await resolveAccess(user, documentPages, preliminaryAccess, options.signal);
      var assignedReviewer = data.documents.some(function (doc) { return !doc.deletedAt && (doc.reviewerId === identity.person.id || doc.approverId === identity.person.id); });
      var effectiveContributor = access.effectivePermissions['content.create'] || Object.keys(access.documentPermissions).some(function (key) { return access.documentPermissions[key].edit || access.documentPermissions[key].delete; });
      var canWriteAttachment = config.allowAttachmentWrites === true && identity.mapped && (policyConfigured ? access.effectivePermissions['entitlements.edit'] : identity.person.role !== 'Reader');
      if (canWriteAttachment) {
        var attachmentOperations = attachmentPageId === pageId && policyConfigured ? access.nativePermissions.root : (await pageAccess(attachmentPageId, options.signal)).operations;
        canWriteAttachment = entitlementHelper().nativeHas(attachmentOperations, 'update');
      }
      throwIfAborted(options.signal);
      last = Object.assign({ data: data, actorId: identity.person.id, actor: identity.person, attachmentVersion: meta.version, attachmentId: meta.id,
        mode: mode, identityMapped: identity.mapped, discoveryOnly: false, workspaceLoaded: workspaceLoaded,
        canSubmit: !!workflowURL && workspaceLoaded && identity.mapped && (policyConfigured ? effectiveContributor || assignedReviewer : identity.person.role !== 'Reader'),
        canWriteAttachment: canWriteAttachment }, access);
      return clone(last);
    }
    function commandPayload(input) {
      if (!object(input) || ACTIONS.indexOf(input.action) < 0 || !text(input.comment)) fail('A valid workflow action and comment are required.');
      var body = { rootPageId: pageId, action: input.action, comment: input.comment.trim(), expectedAttachmentVersion: input.expectedAttachmentVersion == null ? last.attachmentVersion : input.expectedAttachmentVersion };
      if (!integer(body.expectedAttachmentVersion)) fail('An expected attachment version is required.');
      if (policyConfigured) body.expectedEntitlementRevision = last.entitlementPolicy && last.entitlementPolicy.revision;
      if (input.action === 'add-category') {
        if (last.actor.role !== 'Manager') fail('Only a manager can add a category.', 'FORBIDDEN');
        if (policyConfigured && !last.effectivePermissions['content.create']) fail('You do not have effective permission to add a library category.', 'FORBIDDEN');
        if (!integer(input.expectedTaxonomyRevision)) fail('The expected category revision is required.');
        var entry = category(input.category);
        body.category = { id: entry.id, name: entry.title, icon: 'folder' };
        body.expectedTaxonomyRevision = input.expectedTaxonomyRevision;
      } else if (input.action === 'create') {
        if (policyConfigured && !last.effectivePermissions['content.create']) fail('You do not have effective permission to create a Confluence child page.', 'FORBIDDEN');
        if (!object(input.fields)) fail('New document fields are required.');
        body.fields = pickContent(input.fields, ['id', 'reference', 'area', 'type', 'ownerId', 'authorId', 'reviewerId', 'approverId', 'title', 'summary', 'sections', 'slug', 'bodyMarkdown', 'highlights', 'cover', 'tags', 'processes', 'regions', 'assets', 'attachments', 'governance', 'sourceMetadata', 'commentsEnabled', 'changeSummary']);
        content(body.fields, true);
      } else {
        if (!text(input.docId) || !integer(input.expectedVersion) || !integer(input.expectedRevision) || !integer(input.expectedAuditLength, 0)) fail('The document ID and expected content / audit revisions are required.');
        ['docId', 'expectedVersion', 'expectedRevision', 'expectedAuditLength'].forEach(function (key) { body[key] = input[key]; });
        var document = last.data.documents.find(function (doc) { return doc.id === input.docId; });
        if (!document) fail('The document key does not exist in this authorized workspace.', 'NOT_FOUND');
        body.documentKey = document.id;
        if (policyConfigured && ['edit', 'revise', 'submit'].includes(input.action) && !(last.documentPermissions[document.id] || {}).edit) fail('You do not have effective edit permission on this Confluence page.', 'FORBIDDEN');
        if (policyConfigured && ['request-changes', 'complete-review', 'approve'].includes(input.action) && !entitlementHelper().nativeHas(last.nativePermissions.documents[document.id], 'update')) fail('Your Confluence account cannot update the assigned review page.', 'FORBIDDEN');
        if (policyConfigured && documentPageId(document)) {
          if (!integer(last.nativePageVersions[document.id])) fail('The latest native page version is required before changing a document.', 'CONFIGURATION');
          body.confluencePageId = documentPageId(document);
          body.expectedPageVersion = last.nativePageVersions[document.id];
        }
        if (input.action === 'delete') {
          if (!policyConfigured || !(last.documentPermissions[document.id] || {}).delete) fail('You do not have effective delete permission on this Confluence page.', 'FORBIDDEN');
          if (!documentPageId(document) || !integer(last.nativePageVersions[document.id])) fail('A mapped native page and its latest version are required for deletion.', 'CONFIGURATION');
          body.confluencePageId = documentPageId(document);
          body.expectedPageVersion = last.nativePageVersions[document.id];
        }
        if (input.action === 'edit' || (input.action === 'revise' && input.changes != null)) {
          if (!object(input.changes)) fail('Content changes are required.');
          body.changes = pickContent(input.changes, ['title', 'summary', 'sections', 'slug', 'bodyMarkdown', 'highlights', 'cover', 'tags', 'processes', 'regions', 'assets', 'attachments', 'governance', 'sourceMetadata', 'commentsEnabled']);
          authoringContent(body.changes);
        }
        if (input.action === 'complete-review') body.governanceReview = governanceReview(input.governanceReview, input.expectedVersion, input.expectedRevision);
        if (input.action === 'approve') {
          if (!text(input.nextReviewAt) || !Number.isFinite(Date.parse(input.nextReviewAt))) fail('A valid next review date is required.');
          body.nextReviewAt = input.nextReviewAt;
          // The server must choose its own approval/effective timestamp. A client
          // clock must never backdate an approval or become an audit timestamp.
        }
      }
      return body;
    }
    function publicationExpectation(body) {
      if (!publicationEnabled || PUBLICATION_ACTIONS.indexOf(body.action) < 0) return null;
      // These mappings are only a browser-side consistency check. The trusted
      // workflow service independently resolves and authorizes every parent;
      // none of these IDs are accepted from the mutation request.
      var workingRoot = String(nativePublication.workingRootPageId || ''), publishedRoot = String(nativePublication.publishedRootPageId || ''), mappings = nativePublication.areaPageIds;
      if (!/^[1-9]\d*$/.test(workingRoot) || !/^[1-9]\d*$/.test(publishedRoot) || workingRoot === publishedRoot || !object(mappings)) fail('Configure separate working and published roots and all eight business-area parent pages before saving native documents.', 'CONFIGURATION');
      if (publishedRoot !== pageId) fail('The native published root must match this WCSpedia library root so published documents remain discoverable.', 'CONFIGURATION');
      var parents = new Set([workingRoot, publishedRoot]);
      if (BUSINESS_AREAS.some(function (area) { return !Object.prototype.hasOwnProperty.call(mappings, area); })) fail('Configure a native parent page for each of the eight business areas before saving documents.', 'CONFIGURATION');
      Object.keys(mappings).forEach(function (area) {
        var id = String(mappings[area]);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(area) || !/^[1-9]\d*$/.test(id) || parents.has(id)) fail('Each business area needs its own valid Confluence parent page ID; placeholders and root-page fallbacks cannot be used.', 'CONFIGURATION');
        parents.add(id);
      });
      var creating = body.action === 'create', doc = creating ? null : last.data.documents.find(function (item) { return item.id === body.documentKey; });
      var key = creating ? body.fields.id : body.documentKey, area = creating ? body.fields.area : doc.area;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(key)) fail('A permanent document key is required for native publication.');
      if (creating && last.data.documents.some(function (item) { return item.id === key; })) fail('This document key already exists. Reload before creating the document.', 'CONFLICT');
      if (!last.data.areas.some(function (item) { return item.id === area; }) || !Object.prototype.hasOwnProperty.call(mappings, area)) fail('Select a configured business area before saving this document.', 'INVALID_MAPPING');
      var published = body.action === 'approve';
      var insightTypes = nativePublication.insightsTypes == null ? [] : nativePublication.insightsTypes;
      if (!Array.isArray(insightTypes) || insightTypes.some(function (type) { return typeof type !== 'string' || !last.data.types.includes(type); })) fail('Configure valid Insights content types.', 'CONFIGURATION');
      var insightParent = String(nativePublication.insightsPageId || '');
      if (insightParent && (!/^[1-9]\d*$/.test(insightParent) || parents.has(insightParent))) fail('Insights needs its own valid parent page beneath WCSpedia.', 'CONFIGURATION');
      if (insightParent) parents.add(insightParent);
      var publishesInsight = published && insightTypes.indexOf(creating ? body.fields.type : doc.type) >= 0;
      if (publishesInsight && !insightParent) fail('Configure the Insights parent page before publishing this article.', 'CONFIGURATION');
      body.nativePublication = { required: true };
      return {
        operation: published ? 'published' : 'working', documentKey: key, areaId: area,
        parentPageId: published ? (publishesInsight ? insightParent : String(mappings[area])) : workingRoot,
        pageId: doc ? published ? publishedPageId(doc) : documentPageId(doc) : null,
        previousPageVersion: doc ? published ? doc.publishedConfluencePageVersion : Math.max(doc.confluencePageVersion || 0, last.nativePageVersions[doc.id] || 0) : null,
        version: creating ? 1 : body.expectedVersion + (body.action === 'revise' ? 1 : 0),
        revision: creating || body.action === 'revise' ? 1 : body.expectedRevision + (body.action === 'edit' ? 1 : 0),
        protectedPageIds: Array.from(parents)
      };
    }
    function publicationReceipt(value, body, expected) {
      var receipt = object(value) && value.publication;
      if (!object(value) || value.accepted !== true || value.requestId !== body.requestId || !object(receipt) ||
          receipt.operation !== expected.operation || receipt.documentKey !== expected.documentKey || receipt.areaId !== expected.areaId ||
          String(receipt.parentPageId) !== expected.parentPageId || !/^[1-9]\d*$/.test(String(receipt.pageId)) ||
          expected.protectedPageIds.indexOf(String(receipt.pageId)) >= 0 || expected.pageId && String(receipt.pageId) !== expected.pageId ||
          !integer(receipt.pageVersion) || expected.previousPageVersion && receipt.pageVersion <= expected.previousPageVersion ||
          receipt.version !== expected.version || receipt.revision !== expected.revision) {
        fail('The service did not confirm this exact native page and revision under the expected business-area parent. Reload and inspect the document before continuing.', 'UNKNOWN_COMMIT');
      }
      return receipt;
    }
    function verifyPublicationReload(session, receipt) {
      var doc = session.data.documents.find(function (item) { return item.id === receipt.documentKey; }), published = receipt.operation === 'published';
      var version = doc && doc.versions.find(function (item) { return item.version === receipt.version; });
      if (!doc || doc.area !== receipt.areaId || String(published ? publishedPageId(doc) : documentPageId(doc)) !== String(receipt.pageId) ||
          doc[published ? 'publishedConfluencePageVersion' : 'confluencePageVersion'] !== receipt.pageVersion ||
          !version || version.revision !== receipt.revision || version.status !== (published ? 'Published' : 'Draft') ||
          published && doc.publishedVersion !== receipt.version) {
        fail('The native page was accepted, but the refreshed workspace does not confirm its saved mapping and revision. Reload before taking another action.', 'REFRESH_REQUIRED');
      }
      return session;
    }
    async function submitAction(command) {
      if (nativeSession) {
        if (!last || !last.workspaceLoaded) fail('Load the workspace before saving.', 'NOT_LOADED');
        var fingerprint = JSON.stringify(command), crypto = dependencies.crypto || root.crypto;
        if (!pendingCommand || pendingCommand.fingerprint !== fingerprint) {
          if (!crypto || typeof crypto.randomUUID !== 'function') fail('A secure request identifier requires HTTPS.', 'CONFIGURATION');
          var documentKey = command.docId || command.documentKey;
          pendingCommand = { fingerprint: fingerprint, payload: clone(Object.assign({}, command, {
            requestId: crypto.randomUUID(), expectedEntitlementRevision: last.entitlementPolicy.revision,
            expectedPageVersion: documentKey ? last.nativePageVersions[documentKey] : undefined
          })) };
        }
        // A reload may advance native versions after a lost response. Recovery
        // must use the exact original payload recorded by the durable journal.
        var nextSession = await nativeWorkflow().submit(clone(pendingCommand.payload), last);
        validateData(nextSession.data);
        try {
          var refreshedUser = await nativeStorage().user(), refreshedIdentity = entitlementHelper().identity(refreshedUser);
          if (!refreshedIdentity || refreshedIdentity.soeid !== nextSession.identity.soeid || ['userKey', 'accountId'].some(function (key) { return (refreshedIdentity[key] || null) !== (nextSession.identity[key] || null); })) fail('Your account changed after saving. Reload the workspace.', 'IDENTITY_MAPPING');
          var freshAccess = await resolveAccess(refreshedUser, {}, null);
          // Preserve document-specific rights from the workflow's native reads,
          // and restore freshly read policy-host access for navigation/actions.
          freshAccess.nativePermissions.documents = nextSession.nativePermissions.documents;
          freshAccess.nativePageVersions = nextSession.nativePageVersions;
          freshAccess.documentPermissions = nextSession.documentPermissions;
          nextSession = Object.assign(nextSession, freshAccess);
        } catch (_) { fail('The action was saved, but current access could not be refreshed. Reload before continuing.', 'REFRESH_REQUIRED'); }
        last = nextSession; accessLast = clone(nextSession); clearSearchReads();
        pendingCommand = null;
        return clone(nextSession);
      }
      if (mode !== 'confluence' || !workflowURL || !workspaceURL) fail('Trusted workspace and workflow endpoints are required for live review and approval.', 'READ_ONLY');
      if (!last) fail('Load the latest content before submitting an action.', 'NOT_LOADED');
      if (!last.canSubmit) fail('Your Confluence account is not assigned to a workflow role.', 'READ_ONLY');
      var body = commandPayload(command);
      var expectedPublication = publicationExpectation(body), confirmedPublication = null;
      var fingerprint = JSON.stringify(body);
      var crypto = dependencies.crypto || root.crypto;
      if (!pendingCommand || pendingCommand.fingerprint !== fingerprint) {
        if (!crypto || typeof crypto.randomUUID !== 'function') fail('A secure request identifier could not be created. Use HTTPS.', 'CONFIGURATION');
        pendingCommand = { fingerprint: fingerprint, requestId: crypto.randomUUID() };
      }
      // Reuse the ID when the caller retries the same command after a lost
      // response. The trusted endpoint must persistently deduplicate this ID.
      body.requestId = pendingCommand.requestId;
      clearSearchReads();
      try {
        var actionResponse = await request(workflowURL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': body.requestId }, body: JSON.stringify(body) });
        if (body.action === 'delete') {
          var confirmation = await json(actionResponse);
          if (!object(confirmation) || confirmation.documentKey !== body.documentKey || confirmation.deleted !== true || confirmation.confluencePageDeleted !== true) fail('The service did not confirm the native page deletion. Reload and inspect the audit record before continuing.', 'UNKNOWN_COMMIT');
        } else if (expectedPublication) {
          var publicationConfirmation;
          try { publicationConfirmation = await json(actionResponse); }
          catch (_) { fail('The service returned no readable native publication confirmation. The outcome is unknown; reload before continuing.', 'UNKNOWN_COMMIT'); }
          confirmedPublication = publicationReceipt(publicationConfirmation, body, expectedPublication);
        }
      }
      catch (error) {
        if (error.code === 'NETWORK') fail('The action outcome is unknown. Reload before continuing; the same command retains its request ID for safe server deduplication.', 'UNKNOWN_COMMIT');
        throw error;
      }
      if (!expectedPublication) pendingCommand = null;
      try {
        var refreshed = await load();
        if (confirmedPublication) verifyPublicationReload(refreshed, confirmedPublication);
        pendingCommand = null;
        return refreshed;
      }
      catch (error) { fail('The action was accepted, but the refreshed data could not be loaded. Reload before taking another action.', 'REFRESH_REQUIRED'); }
    }
    async function saveNativeEntitlements(command) {
      if (!accessLast || !accessLast.identity) fail('Load entitlements before saving.', 'NOT_LOADED');
      var priorAccess = clone(accessLast), priorIdentity = priorAccess.identity, priorFingerprint = priorAccess.entitlementFingerprint, E = entitlementHelper();
      var user = await nativeStorage().user(), who = E.identity(user);
      if (!who || JSON.stringify(who) !== JSON.stringify(priorIdentity)) fail('Your Confluence account changed. Reload before saving.', 'IDENTITY_MAPPING');
      // Refresh the policy and actual policy-host permissions for every save.
      var fresh = await resolveAccess(user, {}, null);
      var commandFingerprint = JSON.stringify(command), crypto = dependencies.crypto || root.crypto;
      var pending = pendingEntitlementCommand;
      if (!pending && priorFingerprint !== undefined && priorFingerprint !== fresh.entitlementFingerprint) {
        accessLast = priorAccess;
        fail('The entitlement file changed while this form was open. Reload and review the latest grants before saving.', 'CONFLICT');
      }
      if (pending && pending.commandFingerprint === commandFingerprint && pending.expectedPolicy) {
        var confirmedEvent = fresh.entitlementPolicy.audit.find(function (event) { return event.revision === pending.expectedPolicy.revision; });
        var expectedEvent = pending.expectedPolicy.audit[pending.expectedPolicy.audit.length - 1];
        if (confirmedEvent && JSON.stringify(confirmedEvent) === JSON.stringify(expectedEvent)) {
          pendingEntitlementCommand = null;
          return finishEntitlementSync(last ? await load() : clone(fresh));
        }
      }
      if (!pending || pending.commandFingerprint !== commandFingerprint || !pending.expectedPolicy) {
        if (!crypto || typeof crypto.randomUUID !== 'function') fail('A secure request identifier requires HTTPS.', 'CONFIGURATION');
        var at = Date.now(), audit = fresh.entitlementPolicy.audit;
        if (audit.length) at = Math.max(at, Date.parse(audit[audit.length - 1].at));
        var expected = E.applyCommand(fresh.entitlementPolicy, command, { identity: who, native: fresh.nativePermissions, now: new Date(at).toISOString() });
        if (utf8Size(JSON.stringify(expected)) > 2 * 1024 * 1024) fail('The policy would exceed its 2 MB limit. Export and archive its history before continuing.', 'INVALID_ENTITLEMENTS');
        pending = pendingEntitlementCommand = { commandFingerprint: commandFingerprint, requestId: crypto.randomUUID(), expectedPolicy: expected,
          revision: fresh.entitlementPointerRevision, attachmentVersion: fresh.entitlementAttachmentVersion, fingerprint:fresh.entitlementFingerprint };
      } else {
        E.applyCommand(fresh.entitlementPolicy, command, { identity: who, native: fresh.nativePermissions, now: pending.expectedPolicy.audit[pending.expectedPolicy.audit.length - 1].at });
      }
      try {
        await nativeStorage().writeJSON(entitlementPageId, entitlementFilename, 'wcspedia.entitlements.v1', pending.expectedPolicy, {
          expectedRevision: pending.revision, expectedAttachmentVersion: pending.attachmentVersion, expectedFingerprint:pending.fingerprint, requestId: pending.requestId
        });
      } catch (error) {
        // Preserve the original status/code so uncertain writes cannot be
        // mistaken for a safe new attempt. Include the real filename and host,
        // while the transport reports the exact failed native request.
        error.message = 'Could not save ' + entitlementFilename + ' on attachments page ' + entitlementPageId + '. ' + error.message;
        throw error;
      }
      clearSearchReads();
      var refreshed;
      try { refreshed = last ? await load() : await loadAccess(); }
      catch (_) { fail('The JSON was saved, but access could not be refreshed. Reload before making another change.', 'REFRESH_REQUIRED'); }
      var event = refreshed.entitlementPolicy.audit.find(function (item) { return item.revision === pending.expectedPolicy.revision; });
      if (!event || JSON.stringify(event) !== JSON.stringify(pending.expectedPolicy.audit[pending.expectedPolicy.audit.length - 1])) fail('The saved entitlement change could not be verified. Reload before continuing.', 'REFRESH_REQUIRED');
      pendingEntitlementCommand = null;
      return finishEntitlementSync(refreshed);
    }
    async function finishEntitlementSync(refreshed) {
      if(config.nativeAccessSync!==true)return refreshed;
      try {
        var synchronized=await nativeAccessSynchronizer().sync();
        // The sync can change native creation access and Working privacy.
        // Re-read capabilities instead of returning the pre-sync disabled state.
        try {refreshed=last?await load():await loadAccess();}
        catch(error){synchronized={status:'attention',message:'Native access was synchronized, but the page could not refresh its permissions. Reload this page. '+error.message};}
        refreshed.entitlementSync=synchronized;
      }
      catch(error){refreshed.entitlementSync={status:'incomplete',message:error.message};}
      accessLast=clone(refreshed);if(last)last=clone(refreshed);
      return refreshed;
    }
    async function submitEntitlementCommand(command) {
      if (nativeSession) return saveNativeEntitlements(command);
      if (mode !== 'confluence' || !policyConfigured || !entitlementURL) fail('A trusted entitlement service and policy page are required.', 'READ_ONLY');
      if (!accessLast || !accessLast.entitlementPolicy || !accessLast.identity) fail('Load current entitlement access before saving.', 'NOT_LOADED');
      var E = entitlementHelper();
      // This preflight improves feedback. The endpoint must repeat it using its
      // authenticated session, fresh page rights and authoritative policy.
      // Its expected change is used only to verify the subsequent authoritative
      // JSON read. A browser clock behind the latest server event must not block
      // a valid command. The service supplies the actual commit time.
      var checkedPolicy = E.validatePolicy(accessLast.entitlementPolicy), preflightTime = Date.now();
      if (checkedPolicy.audit.length) preflightTime = Math.max(preflightTime, Date.parse(checkedPolicy.audit[checkedPolicy.audit.length - 1].at));
      var expectedPolicy = E.applyCommand(checkedPolicy, command, { identity: accessLast.identity, native: accessLast.nativePermissions, now: new Date(preflightTime).toISOString() });
      var expectedEvent = expectedPolicy.audit[expectedPolicy.audit.length - 1];
      var body = { action: command.action, rootPageId: pageId, entitlementsPageId: entitlementPageId, expectedRevision: command.expectedRevision, comment: command.comment.trim() };
      if (!integer(accessLast.entitlementAttachmentVersion) || !/^[1-9]\d*$/.test(accessLast.entitlementAttachmentId)) fail('Reload the current entitlement attachment before saving.', 'NOT_LOADED');
      body.entitlementsSource = entitlementSource;
      body.entitlementsFilename = entitlementFilename;
      body.expectedAttachmentId = accessLast.entitlementAttachmentId;
      body.expectedAttachmentVersion = accessLast.entitlementAttachmentVersion;
      if (command.action !== 'add') body.recordId = command.recordId;
      if (command.action !== 'revoke') body.record = E.validatePolicy({ schemaVersion: 1, revision: 1, records: [command.record], audit: [] }).records[0];
      var fingerprint = JSON.stringify(body), crypto = dependencies.crypto || root.crypto;
      if (!pendingEntitlementCommand || pendingEntitlementCommand.fingerprint !== fingerprint) {
        if (!crypto || typeof crypto.randomUUID !== 'function') fail('A secure request identifier could not be created. Use HTTPS.', 'CONFIGURATION');
        pendingEntitlementCommand = { fingerprint: fingerprint, requestId: crypto.randomUUID() };
      }
      body.requestId = pendingEntitlementCommand.requestId;
      clearSearchReads();
      try { await request(entitlementURL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': body.requestId }, body: JSON.stringify(body) }); }
      catch (error) { if (error.code === 'NETWORK') fail('The entitlement change outcome is unknown. Reload; retrying the same command keeps its request ID for server deduplication.', 'UNKNOWN_COMMIT'); throw error; }
      var refreshed;
      try { refreshed = last ? await load() : await loadAccess(); }
      catch (_) { fail('The entitlement request returned, but current access could not be reloaded. Reload before making another change.', 'REFRESH_REQUIRED'); }
      // HTTP 200 may be an expired-session HTML page or a misconfigured endpoint.
      // Confirm the exact audited mutation in the one authoritative attachment
      // before the UI reports success. A later concurrent change is valid when
      // the accepted event remains in the history at its expected revision.
      function canonical(value) {
        if (Array.isArray(value)) return value.map(canonical);
        if (!object(value)) return value;
        var result = Object.create(null);
        Object.keys(value).sort().forEach(function (key) { result[key] = canonical(value[key]); });
        return result;
      }
      function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
      var confirmed = false;
      try {
        var savedPolicy = E.validatePolicy(refreshed.entitlementPolicy);
        var savedEvent = savedPolicy.audit.find(function (event) { return event.revision === expectedEvent.revision; });
        confirmed = refreshed.entitlementAttachmentId === body.expectedAttachmentId &&
          integer(refreshed.entitlementAttachmentVersion) && refreshed.entitlementAttachmentVersion > body.expectedAttachmentVersion &&
          savedPolicy.revision >= expectedPolicy.revision && !!savedEvent &&
          savedEvent.action === expectedEvent.action && E.normalizeSOEID(savedEvent.actorSOEID) === expectedEvent.actorSOEID &&
          savedEvent.comment === expectedEvent.comment && same(savedEvent.changes, expectedEvent.changes);
        if (confirmed && savedPolicy.revision === expectedPolicy.revision) {
          var byId = function (a, b) { return a.id.localeCompare(b.id); };
          confirmed = same(savedPolicy.records.slice().sort(byId), expectedPolicy.records.slice().sort(byId));
        }
      } catch (_) { confirmed = false; }
      if (!confirmed) fail('The saved entitlement change could not be confirmed in entitlements.json. Reload before trying again.', 'UNKNOWN_COMMIT');
      pendingEntitlementCommand = null;
      return refreshed;
    }
    async function deleteDocument(command) { return submitAction(Object.assign({}, command, { action: 'delete' })); }
    function metricsAvailable() {
      if (mode !== 'confluence' || !nativeSession && !metricsURL) fail('Document views are unavailable until a trusted metrics endpoint is configured.', 'METRICS_UNAVAILABLE');
    }
    function nativeMetrics() {
      if (!spaceEngagement) spaceEngagement = nativeModule('WCSSpaceEngagement', 'space-engagement.js').create(config, {
        fetch: fetcher, crypto: dependencies.crypto || root.crypto, origin: origin
      });
      return spaceEngagement;
    }
    function metricDocument(key) {
      var doc = last && last.data.documents.find(function (d) { return d.id === key && !d.deletedAt; });
      var published = doc && doc.versions.find(function (v) { return v.version === doc.publishedVersion && v.status === 'Published'; });
      if((!doc||!published)&&discoveryMetrics.has(key))return discoveryMetrics.get(key);
      if (!doc || !published || !publishedPageId(doc)) fail('Recorded views require a loaded, published WCSpedia document.', 'METRICS_UNAVAILABLE');
      return { pageId: publishedPageId(doc), version: published.version, revision: published.revision };
    }
    function metricKey(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value); }
    async function loadMetrics(keys) {
      metricsAvailable();
      if (nativeSession) {
        // Read only the visible managed documents. Discovery never scans vote
        // properties or the whole library to populate a view-count label.
        if (!Array.isArray(keys) || keys.length > 50 || keys.some(function (key) { return !metricKey(key); })) fail('Request recorded views for up to 50 visible documents.', 'INVALID_METRICS');
        var nativeCounts = Object.create(null), queue = Array.from(new Set(keys));
        var jobs = queue.map(function (key) { return { key: key, doc: metricDocument(key) }; });
        await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async function () {
          while (jobs.length) {
            var job = jobs.shift(), metrics = nativeMetrics(), result = await (metrics.loadViews || metrics.load)(job.doc.pageId);
            if (!result || String(result.pageId) !== job.doc.pageId || !result.views || !integer(result.views.recordedViews, 0)) fail('Recorded views could not be confirmed.', 'INVALID_METRICS');
            nativeCounts[job.key] = result.views.recordedViews;
          }
        }));
        return nativeCounts;
      }
      var url = new URL(metricsURL.href); url.searchParams.set('rootPageId', pageId);
      var result = await json(await request(url));
      if (!object(result) || result.schemaVersion !== 1 || !Array.isArray(result.counts)) fail('The metrics service returned an invalid count list.', 'INVALID_METRICS');
      var counts = Object.create(null);
      result.counts.forEach(function (item) {
        if (!object(item) || !metricKey(item.documentKey) || !integer(item.views, 0) || Object.prototype.hasOwnProperty.call(counts, item.documentKey)) fail('The metrics service returned an invalid or duplicate document count.', 'INVALID_METRICS');
        counts[item.documentKey] = item.views;
      });
      return counts;
    }
    async function recordView(input) {
      metricsAvailable();
      if (!object(input) || !metricKey(input.documentKey) || !integer(input.version) || !integer(input.revision)) fail('A permanent document key and exact published version and revision are required.', 'INVALID_METRICS');
      if (nativeSession) {
        var doc = metricDocument(input.documentKey);
        if (doc.version !== input.version || doc.revision !== input.revision) fail('The published document changed. Reload before recording this visit.', 'CONFLICT');
        // The native module owns its timestamped retry receipt. A legacy UUID
        // cannot safely deduplicate delayed retries after the rolling window.
        var recorded = await nativeMetrics().recordView(doc.pageId);
        if (!recorded || !integer(recorded.recordedViews, 0) || typeof recorded.counted !== 'boolean') fail('The recorded view could not be confirmed.', 'UNKNOWN_COMMIT');
        return { documentKey: input.documentKey, views: recorded.recordedViews, counted: recorded.counted };
      }
      // Actor, SOEID, timestamp, and count are deliberately absent. The trusted
      // service derives identity and native read access from its own session.
      var payload = { rootPageId: pageId, documentKey: input.documentKey, version: input.version, revision: input.revision };
      var fingerprint = JSON.stringify(payload), requestId = input.requestId;
      if (requestId == null) {
        requestId = pendingViews.get(fingerprint);
        if (!requestId) {
          var crypto = dependencies.crypto || root.crypto;
          if (!crypto || typeof crypto.randomUUID !== 'function') fail('A secure request identifier could not be created. Use HTTPS.', 'CONFIGURATION');
          requestId = crypto.randomUUID(); pendingViews.set(fingerprint, requestId);
        }
      }
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(requestId)) fail('A valid view request identifier is required.', 'INVALID_METRICS');
      payload.requestId = requestId;
      var result;
      try {
        result = await json(await request(metricsURL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Idempotency-Key': requestId }, body: JSON.stringify(payload) }));
      } catch (error) {
        if (error.code === 'NETWORK') fail('The view count could not be confirmed. Retry with the same request identifier.', 'UNKNOWN_COMMIT');
        throw error;
      }
      if (!object(result) || result.accepted !== true || result.requestId !== requestId || result.documentKey !== payload.documentKey || !integer(result.views, 0) || typeof result.counted !== 'boolean') fail('The metrics service did not confirm this view request.', 'UNKNOWN_COMMIT');
      pendingViews.delete(fingerprint);
      return { documentKey: result.documentKey, views: result.views, counted: result.counted };
    }
    async function saveAttachment(input, options) {
      options = options || {};
      if (mode !== 'confluence' || config.allowAttachmentWrites !== true) fail('Direct attachment writes are disabled.', 'READ_ONLY');
      if (!last || !last.canWriteAttachment) fail('Load a mapped Confluence account before uploading.', 'READ_ONLY');
      if (!integer(options.expectedAttachmentVersion) || !text(options.comment)) fail('An expected attachment version and change comment are required.');
      publishedProjection(validateData(input));
      var serialized = JSON.stringify(input, null, 2);
      if (utf8Size(serialized) > MAX_JSON) fail('The WCSpedia JSON exceeds the 10 MB attachment limit. Reduce or partition the stored data before uploading.', 'ATTACHMENT_TOO_LARGE');
      if (!entitlementHelper().nativeHas((await pageAccess(attachmentPageId)).operations, 'update')) fail('Your Confluence session cannot update the configured attachments page.', 'FORBIDDEN');
      var meta = await metadata();
      if (meta.id !== last.attachmentId || meta.version !== options.expectedAttachmentVersion) fail('The JSON attachment changed. Reload before uploading.', 'CONFLICT');
      var Form = dependencies.FormData || root.FormData, BlobType = dependencies.Blob || root.Blob;
      if (!Form || !BlobType) fail('This browser cannot upload attachments.');
      var form = new Form();
      form.append('file', new BlobType([serialized], { type: 'application/json' }), filename);
      form.append('comment', options.comment.trim()); form.append('minorEdit', 'false');
      // The REST multipart endpoint does not offer atomic compare-and-set. This
      // opt-in API is for controlled administrative imports, never approval UI.
      // Do not automatically retry a POST: a lost response may hide a commit.
      clearSearchReads();
      try {
        await request(endpoint('/rest/api/content/' + attachmentPageId + '/child/attachment/' + meta.id + '/data'), { method: 'POST', headers: { Accept: 'application/json', 'X-Atlassian-Token': 'nocheck' }, body: form });
      } catch (error) {
        if (error.code === 'NETWORK') fail('The upload outcome is unknown. Reload the attachment before retrying.', 'UNKNOWN_COMMIT');
        throw error;
      }
      try {
        var stored = await metadata();
        if (stored.id !== meta.id || stored.version !== meta.version + 1 || JSON.stringify(await readAttachment(stored)) !== JSON.stringify(input)) fail('A concurrent attachment update was detected. Inspect Confluence attachment history before continuing.', 'CONFLICT');
        var fresh = await load();
        if (fresh.attachmentVersion !== stored.version) fail('A concurrent attachment update was detected. Inspect Confluence attachment history before continuing.', 'CONFLICT');
        return fresh;
      } catch (error) {
        if (error.code === 'CONFLICT') throw error;
        fail('The upload completed, but verification failed. Inspect the latest attachment version before retrying.', 'UNKNOWN_COMMIT');
      }
    }
    function plain(value) {
      return typeof value === 'string' ? value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, '').replace(/@@@(?:end)?hl@@@/g, '')
        .replace(/&(amp|lt|gt|quot|apos|nbsp);|&#(\d+);|&#x([\da-f]+);/gi, function (_, named, decimal, hex) {
          if (named) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()];
          var code = parseInt(decimal || hex, decimal ? 10 : 16);
          return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
        }).replace(/\s+/g, ' ').trim() : '';
    }
    function searchSpace() {
      if (!searchScopePromise) {
        var pending = withSearchDeadline(async function (signal) {
          // The navigation destination and the search root must describe the
          // same landing page. A space's numeric ID is not a content/page ID.
          var home = object(config.pages) && config.pages.home;
          if (typeof home === 'string' && home) {
            var homeURL = safeURL(home.split('#')[0], origin + context + '/', true);
            if (homeURL.pathname === context + '/pages/viewpage.action' && homeURL.searchParams.get('pageId') !== pageId) {
              fail('The WCSpedia landing-page link and rootPageId do not match. Set pageIds.home/rootPageId to the pageId from the landing-page URL, not the space ID or name.', 'INVALID_SCOPE');
            }
          }
          var url = endpoint('/rest/api/content/' + pageId);
          url.searchParams.set('expand', 'space');
          var page = await json(await request(url, { signal: signal }));
          throwIfAborted(signal);
          if (!object(page) || page.type !== 'page' || String(page.id) !== pageId || !object(page.space) ||
              typeof page.space.key !== 'string' || !/^[A-Za-z0-9~][A-Za-z0-9_.~\-]{0,254}$/.test(page.space.key)) {
            fail('Confluence did not identify the WCSpedia root page and its space. Search is unavailable.', 'INVALID_SCOPE');
          }
          if (configuredSearchSpace != null && configuredSearchSpace !== page.space.key) {
            fail('The configured spaceKey does not match the WCSpedia landing page. Use its exact space key, not the space display name or numeric space ID.', 'INVALID_SCOPE');
          }
          if (searchScopePromise === pending) verifiedSearchSpace = page.space.key;
          return page.space.key;
        }).catch(function (error) { if (searchScopePromise === pending) { searchScopePromise = null; verifiedSearchSpace = null; } throw error; });
        searchScopePromise = pending;
      }
      return searchScopePromise;
    }
    function throwIfAborted(signal) {
      if (signal && signal.aborted) { var error = new Error('The request was cancelled.'); error.name = 'AbortError'; throw error; }
    }
    function withSearchDeadline(work, callerSignal) {
      throwIfAborted(callerSignal);
      // Race the whole read (including response.text), so even a proxy or fetch
      // implementation that ignores AbortSignal cannot leave the UI pending.
      return new Promise(function (resolve, reject) {
        var controller = new AbortController(), settled = false, timer;
        function finish(error, value) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (callerSignal) callerSignal.removeEventListener('abort', cancel);
          if (error) { controller.abort(); reject(error); } else resolve(value);
        }
        function cancel() {
          var error = new Error('The search was cancelled.'); error.name = 'AbortError'; finish(error);
        }
        if (callerSignal) callerSignal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(function () {
          var error = new Error('Confluence search took too long. Try again or use a more specific search.'); error.code = 'SEARCH_TIMEOUT'; finish(error);
        }, searchTimeout);
        Promise.resolve().then(function () { throwIfAborted(controller.signal); return work(controller.signal); }).then(function (value) { finish(null, value); }, finish);
      });
    }
    function waitForSearchSpace(signal) {
      throwIfAborted(signal);
      var pending = searchSpace();
      if (!signal) return pending;
      // One caller cancelling must not cancel the shared root-space lookup.
      return new Promise(function (resolve, reject) {
        function cancel() { try { throwIfAborted(signal); } catch (error) { reject(error); } }
        signal.addEventListener('abort', cancel, { once: true });
        pending.then(function (space) { signal.removeEventListener('abort', cancel); resolve(space); }, function (error) { signal.removeEventListener('abort', cancel); reject(error); });
      });
    }
    function continuationPosition(value, cql, limit) {
      if (!object(value) || value.cql !== cql || value.limit !== limit ||
          Object.keys(value).some(function (key) { return ['cql', 'limit', 'start', 'cursor', 'transport'].indexOf(key) < 0; }) ||
          (value.transport != null && value.transport !== 'content') ||
          (Object.prototype.hasOwnProperty.call(value, 'start') === Object.prototype.hasOwnProperty.call(value, 'cursor'))) {
        fail('This search continuation does not match the current query. Start the search again.', 'INVALID_CONTINUATION');
      }
      if (value.cursor != null) {
        if (typeof value.cursor !== 'string' || !value.cursor || value.cursor.length > 4096 || /[\u0000-\u001f\u007f]/.test(value.cursor)) fail('Invalid search cursor.', 'INVALID_CONTINUATION');
        return { cursor: value.cursor };
      }
      if (!integer(value.start, 0)) fail('Invalid search continuation offset.', 'INVALID_CONTINUATION');
      return { start: value.start };
    }
    function searchContinuation(response, results, cql, limit, position, total, contentTransport) {
      if (!results.length) return null;
      var links = object(response._links) ? response._links : null, next = links && links.next || response.next;
      if (typeof next === 'string' && next) {
        try {
          if (next.startsWith('/') && !next.startsWith('//') && context && !next.startsWith(context + '/')) next = context + next;
          var url = safeURL(next, origin + context + '/', true);
          if (url.pathname !== context + (contentTransport ? '/rest/api/content/search' : '/rest/api/search')) return null;
          var cursor = url.searchParams.get('cursor'), offset = url.searchParams.get('start');
          if (cursor && cursor !== position.cursor && cursor.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(cursor)) return { cql: cql, limit: limit, cursor: cursor };
          if (!cursor && /^\d+$/.test(offset || '') && integer(Number(offset), 0) && Number(offset) > (position.start || 0)) return { cql: cql, limit: limit, start: Number(offset) };
        } catch (_) { /* A server continuation may change only a safe cursor or advancing offset. */ }
        return null;
      }
      // An explicit links object is authoritative: absence of next means the end.
      // Offset-only responses from older Server versions can omit links entirely.
      if (links || position.cursor) return null;
      var start = position.start || 0, following = start + results.length;
      if (total != null ? following < total : results.length === limit) return { cql: cql, limit: limit, start: following };
      return null;
    }
    async function searchPages(options) {
      options = Object.assign({}, options || {});
      ['types', 'excludeIds', 'excludeAncestorIds'].forEach(function (field) { if (Array.isArray(options[field])) options[field] = options[field].slice(); });
      if (object(options.continuation)) options.continuation = Object.assign({}, options.continuation);
      throwIfAborted(options.signal);
      await waitForDiscoverySession(options.signal);
      throwIfAborted(options.signal);
      var key = searchReadKey(options), cached = searchCache.get(key);
      if (cached && Date.now() - cached.at < 120000) return clone(cached.result);
      if (cached) searchCache.delete(key);
      var entry = searchInflight.get(key);
      if (!entry) {
        entry = { key: key, generation: searchGeneration, controller: new AbortController(), subscribers: new Set(), settled: false, cancelTimer: null };
        searchInflight.set(key, entry);
        withSearchDeadline(function (signal) { return searchPagesWithin(Object.assign({}, options, { signal: signal, sharedRead: entry })); }, entry.controller.signal).then(function (result) {
          settleSearchRead(entry, null, result);
        }, function (error) {
          if (error.code === 'SEARCH_TIMEOUT' && entry.generation === searchGeneration) searchScopePromise = null;
          settleSearchRead(entry, error);
        });
      }
      return subscribeSearch(entry, options.signal);
    }
    function readerURL(id, names) {
      return names.includes('wcs-reader') ? endpoint('/pages/viewpage.action').href + '?pageId=' + pageId + '#/published/' + id : endpoint('/pages/viewpage.action').href + '?pageId=' + id;
    }
    async function loadPublishedArticle(id, options) {
      options = options || {};
      if (!/^[1-9]\d{0,19}$/.test(String(id))) fail('Invalid article page.', 'INVALID_SCOPE');
      var space = await waitForSearchSpace(options.signal);
      var page = await json(await request(endpoint('/rest/api/content/' + id + '?expand=space,ancestors,version,body.storage'), {signal:options.signal}));
      var excluded = searchExclusions({}), ancestors = page.ancestors;
      if (String(page.id) !== String(id) || page.type !== 'page' || page.status !== 'current' || page.space?.key !== space || !Array.isArray(ancestors) || !ancestors.some(a => String(a.id) === pageId) || excluded.pages.includes(String(id)) || ancestors.some(a => excluded.trees.includes(String(a.id)))) fail('This published article is outside the configured library.', 'INVALID_SCOPE');
      var Parser = dependencies.DOMParser || root.DOMParser;
      if (!Parser) fail('The article reader is unavailable.', 'CONFIGURATION');
      var xml = new Parser().parseFromString('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">' + (page.body?.storage?.value || '') + '</root>', 'application/xml');
      if (xml.querySelector('parsererror')) fail('The article body could not be read.', 'INVALID_DATA');
      var snapshots = [];
      Array.from(xml.getElementsByTagNameNS('urn:ac','structured-macro')).forEach(function (macro) {
        for (var parent = macro.parentElement; parent && parent !== xml.documentElement; parent = parent.parentElement) if (parent.namespaceURI === 'urn:ac' || ['pre','code'].includes(parent.localName)) return;
        if (macro.localName !== 'structured-macro' || macro.getAttributeNS('urn:ac','name') !== 'html') return;
        var plain = Array.from(macro.children).find(el => el.localName === 'plain-text-body');
        if (!plain) return;
        var html = new Parser().parseFromString(plain.textContent, 'text/html');
        Array.from(html.querySelectorAll('script#wcs-published-reader[type="application/json"]')).forEach(el => snapshots.push(el));
      });
      if (snapshots.length !== 1) fail('This article needs to be republished once with the current template to use the WCSpedia reader.', 'READER_NOT_INSTALLED');
      var node = snapshots[0], payload = JSON.parse(node.textContent);
      if (payload.format !== 1 || payload.pageId !== String(id) || node.getAttribute('data-wcs-reader-root') !== pageId) fail('The article reader mapping is invalid.', 'INVALID_SCOPE');
      if (!integer(payload.nativeVersion) || payload.nativeVersion !== page.version?.number) fail('This page was changed outside the WCSpedia editor. View the native page or reconcile and republish it from My Workspace.', 'READER_STALE');
      var doc = payload.document;
      if (!object(doc) || doc.confluencePageId || doc.publishedConfluencePageId || doc.deletedAt) fail('Invalid public article.', 'INVALID_DATA');
      var destination = directPublication(doc) ? String(nativePublication.insightsPageId || '') : String((nativePublication.areaPageIds || {})[doc.area] || '');
      if (String(ancestors.at(-1)?.id) !== destination) fail('The article is not in its publishing destination.', 'INVALID_SCOPE');
      var data = {people:payload.people,documents:[doc],areas:[{id:doc.area,title:doc.area}]};
      publishedProjection(validateData(data));
      doc.publishedConfluencePageId = String(id); doc.publishedConfluencePageVersion = page.version.number; doc.publicReader = true;
      return {document:doc,people:payload.people};
    }
    function discoveryBody(item) {
      var Parser = dependencies.DOMParser || root.DOMParser, storage = item.body?.storage?.value;
      if (!Parser || !storage) return {};
      var xml = new Parser().parseFromString('<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">' + storage + '</root>', 'application/xml');
      if (xml.querySelector('parsererror')) return {};
      var fields = {}, textBody = '';
      // Parse inert storage; never execute HTML macros or include their scripts
      // in the excerpt. Use only the snapshot matching this native revision.
      Array.from(xml.getElementsByTagNameNS('urn:ac','plain-text-body')).forEach(function (node) {
        if (node.parentElement?.getAttributeNS('urn:ac','name') !== 'html') return;
        var html = new Parser().parseFromString(node.textContent,'text/html');
        var snapshot = html.querySelector('script#wcs-published-reader[type="application/json"]');
        if (snapshot) try {
          var data = JSON.parse(snapshot.textContent), v = data.document?.versions?.find(function (v) { return v.version === data.document.publishedVersion && v.status === 'Published'; });
          if (data.format === 1 && data.pageId === String(item.id) && data.nativeVersion === item.version?.number && snapshot.getAttribute('data-wcs-reader-root') === pageId && v) {
            fields.summary = plain(v.summary || ''); fields.cover = v.cover || null;
            fields.documentKey=data.document.id;
            var author=(data.people||[]).find(function(person){return person.id===(data.document.authorId||v.createdBy);});
            fields.author=author?plain(author.name||author.displayName||''):null;
            if(metricKey(fields.documentKey)&&integer(v.version)&&integer(v.revision)){
              discoveryMetrics.set(fields.documentKey,{pageId:String(item.id),version:v.version,revision:v.revision});
              if(discoveryMetrics.size>256)discoveryMetrics.delete(discoveryMetrics.keys().next().value);
            }
            textBody += ' ' + String(v.bodyMarkdown || '') + ' ' + JSON.stringify(v.sections || []);
          }
        } catch (_) { /* Legacy pages can still provide a native text excerpt. */ }
        html.querySelectorAll('script,style,nav,button').forEach(function (node) { node.remove(); });
        textBody += ' ' + (html.querySelector('.wcs-native-article-body') || html.body).textContent;
        node.remove();
      });
      textBody += ' ' + (xml.querySelector('.wcs-native-article-body') || xml.documentElement).textContent;
      textBody = textBody.replace(/\s+/g,' ').trim();
      fields.searchText = textBody;
      if (!fields.summary) fields.summary = textBody.slice(0,220) + (textBody.length > 220 ? '…' : '');
      return fields;
    }
    async function insightChildren(options, search) {
      var parent = String(nativePublication.insightsPageId || ''), limit = options.limit || 9, start = options.start || 0;
      if (!/^[1-9]\d{0,19}$/.test(parent) || parent === pageId) fail('Configure the Insights parent page.', 'CONFIGURATION');
      if (!integer(limit) || limit > 100 || !integer(start, 0)) fail('Invalid Insights page size.');
      if (options.continuation) {
        var next = options.continuation;
        if (next.transport !== 'children' || next.parent !== parent || next.limit !== limit || !integer(next.start, 0) || Object.keys(next).some(function (key) { return !['transport','parent','limit','start'].includes(key); })) fail('Restart the Insights listing.', 'INVALID_CONTINUATION');
        start = next.start;
      }
      search.buildCQL({types:options.types}, {rootPageId:pageId,spaceKey:configuredSearchSpace});
      var space = await waitForSearchSpace(options.signal);
      var url = endpoint('/rest/api/content/' + parent + '/child/page');
      url.search = new URLSearchParams({limit:String(limit),start:String(start),expand:'space,ancestors,version,metadata.labels,body.storage'}).toString();
      var payload = await json(await request(url, {signal:options.signal}));
      if (!object(payload) || !Array.isArray(payload.results) || payload.results.length > limit) fail('Confluence returned an invalid Insights page list.', 'INVALID_SCOPE');
      var excluded = searchExclusions(options), seen = new Set();
      var results = payload.results.map(function (item) {
        var id = String(item && item.id || ''), ancestors = item && item.ancestors;
        if (!/^[1-9]\d{0,19}$/.test(id) || seen.has(id) || item.type !== 'page' || item.status !== 'current' || item.space?.key !== space || !Array.isArray(ancestors) || !ancestors.some(function (a) {return String(a.id) === pageId;}) || String(ancestors[ancestors.length - 1]?.id) !== parent || excluded.pages.includes(id) || ancestors.some(function (a) { return excluded.trees.includes(String(a.id)); })) fail('Confluence returned a page outside the Insights parent.', 'INVALID_SCOPE');
        seen.add(id);
        var labels = item.metadata?.labels?.results;
        if (!Array.isArray(labels)) fail('Confluence did not return Insights article labels.', 'INVALID_SCOPE');
        var names = labels.map(function (label) { return label.name; }), type = names.map(search.typeFromLabel).find(Boolean);
        if (options.types?.length && !options.types.includes(type)) return null;
        var row = Object.assign({id:id,title:(names.includes('wcs-published') || names.includes('wcs-reader'))?plain(item.title).replace(new RegExp(' · WCS ' + id + '$'),''):plain(item.title),summary:'',type:type,category:'insights',status:'Published',tags:names.filter(function (name) {return typeof name === 'string' && name.startsWith('wcs-tag-');}).map(function (name) {return name.slice(8);}),updated:item.version?.when || null,version:item.version?.number || null,url:readerURL(id,names)}, discoveryBody(item));
        var terms = String(options.query || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
        var haystack = [row.title,row.summary,row.searchText,row.tags.join(' ')].join(' ').normalize('NFKC').toLowerCase();
        if (!terms.every(function (term) { return haystack.includes(term); })) return null;
        if (['tag','process','region'].some(function (key) { return options[key] && !names.includes(facetLabel(key,options[key])); })) return null;
        if (options.year && String(row.updated || '').slice(0,4) !== String(options.year)) return null;
        var days = {week:7,month:30,quarter:90}[options.updated];
        if (days && !(Date.parse(row.updated) >= Date.now() - days * 86400000)) return null;
        delete row.searchText;
        return row;
      }).filter(Boolean);
      // Advance by native rows, including untyped pages. Never infer completion
      // from the filtered card count or follow an arbitrary server URL.
      var hasMore = !!payload._links?.next || !payload._links && payload.results.length === limit;
      if (hasMore && !payload.results.length) fail('Insights pagination did not advance.', 'INVALID_CONTINUATION');
      var continuation = hasMore ? {transport:'children',parent:parent,limit:limit,start:start + payload.results.length} : null;
      return {results:results,total:null,start:start,limit:limit,nextContinuation:continuation,nextStart:continuation?.start || null};
    }
    async function searchPagesWithin(options) {
      options = options || {};
      if (mode !== 'confluence') fail('Page search requires Confluence mode.', 'CONFIGURATION');
      var search = dependencies.search || root.WCSSearch;
      if (!search || typeof search.buildCQL !== 'function') fail('Load the WCSpedia search module before using CQL.', 'CONFIGURATION');
      if (options.continuation?.transport === 'insights-recovery') {
        var recovery = options.continuation;
        if (options.scope !== 'tree' || options.area && options.area !== 'insights') fail('Restart the search in its original collection.', 'INVALID_CONTINUATION');
        var key = JSON.stringify([options.query||'',options.type||'',options.types||[],options.area||'',options.tag||'',options.process||'',options.region||'',options.year||'',options.updated||'any',options.sort||'relevance']);
        if (recovery.key !== key || Object.keys(recovery).some(function (k) { return !['transport','key','next'].includes(k); })) fail('Restart the search after changing filters.', 'INVALID_CONTINUATION');
        var types = options.types || (options.type ? ((root.WCSEditorContent || (typeof require === 'function' ? require('./editor-content.js') : null))?.typeMembers(options.type) || [options.type]) : []);
        search.buildCQL({query:options.query,types:types,updated:options.updated,sort:options.sort},{rootPageId:pageId,spaceKey:configuredSearchSpace});
        var recovered = await insightChildren(Object.assign({},options,{types:types,continuation:recovery.next}),search);
        if (recovered.nextContinuation) recovered.nextContinuation = {transport:'insights-recovery',key:key,next:recovered.nextContinuation};
        recovered.start = null; recovered.nextStart = null;
        return recovered;
      }
      if (options.insights != null && typeof options.insights !== 'boolean' || options.nativeChildren != null && typeof options.nativeChildren !== 'boolean') fail('Invalid Insights search mode.');
      if (options.nativeChildren && (!options.insights || options.scope !== 'tree' || !Array.isArray(options.types) || options.query || options.tag || options.area || options.type)) fail('Native Insights browsing requires an unfiltered article list.');
      if (options.nativeChildren && (!options.continuation || options.continuation.transport === 'children')) {
        try { return await insightChildren(options, search); }
        catch (error) {
          if (options.continuation || ![404,405,500,502,503,504].includes(error.status)) throw error;
          // Older servers may reject child expansion. One scoped indexed read
          // remains available, without fetching every article body.
        }
      }
      if (options.scope != null && ['tree', 'published'].indexOf(options.scope) < 0) fail('Choose a valid Confluence search scope.');
      var tree = options.scope === 'tree', limit = options.limit == null ? 20 : options.limit, start = options.start == null ? 0 : options.start;
      if (!integer(limit) || limit > 100 || !integer(start, 0)) fail('Invalid search page size or offset.');
      var requiredLabels = tree ? [] : ['wcs-document', 'wcs-status-published'];
      ['tag', 'process', 'region'].forEach(function (kind) { if (options[kind] != null && options[kind] !== '') requiredLabels.push(facetLabel(kind, options[kind])); });
      if (options.types != null && (!Array.isArray(options.types) || options.type)) fail('Choose one type or a list of types.');
      var queryOptions = { query: options.query || '', prefixLastToken: tree, categories: options.area ? [options.area] : [], types: options.types || (options.type ? ((root.WCSEditorContent || (typeof require === 'function' ? require('./editor-content.js') : null))?.typeMembers(options.type) || [options.type]) : []), updated: options.updated || 'any', sort: options.sort || 'relevance' };
      var exclusions = tree ? searchExclusions(options) : { pages: options.excludeIds, trees: options.excludeAncestorIds };
      var scope = { rootPageId: pageId, includeRoot: false, spaceKey: configuredSearchSpace, categoryLabelPrefix: 'wcs-area-', requiredLabels: requiredLabels, excludeIds: exclusions.pages, excludeAncestorIds: exclusions.trees };
      // Validate all user filters before network I/O. Never accept raw CQL.
      search.buildCQL(queryOptions, scope);
      var mappings = object(nativePublication.areaPageIds) ? nativePublication.areaPageIds : {}, areaPageId = options.area && mappings[options.area];
      if (tree && /^[1-9]\d{0,19}$/.test(String(areaPageId || ''))) {
        scope.subtreePageId = String(areaPageId);
        queryOptions.categories = [];
        if (nativePublication.insightsPageId) {
          scope.additionalSubtreePageId = String(nativePublication.insightsPageId);
          scope.additionalSubtreeCategory = options.area;
        }
      }
      if (tree && options.area === 'insights') {
        if (!/^[1-9]\d{0,19}$/.test(String(nativePublication.insightsPageId || ''))) fail('Configure the Insights subtree.', 'CONFIGURATION');
        scope.subtreePageId = String(nativePublication.insightsPageId);
        queryOptions.categories = []; // Native descendants do not need a synthetic business-area label.
      }
      if (options.insights) {
        if (!tree || !/^[1-9]\d{0,19}$/.test(String(nativePublication.insightsPageId || '')) || options.area) fail('Configure the Insights subtree.', 'CONFIGURATION');
        scope.subtreePageId = String(nativePublication.insightsPageId);
      }
      search.buildCQL(queryOptions, scope);
      if (options.year != null && options.year !== '' && (!['string', 'number'].includes(typeof options.year) || !/^\d{4}$/.test(String(options.year)) || Number(options.year) < 1900 || Number(options.year) > 9998)) fail('Choose a four-digit year between 1900 and 9998.');
      scope.spaceKey = await waitForSearchSpace(options.signal);
      throwIfAborted(options.signal);
      var cql = search.buildCQL(queryOptions, scope);
      if (options.year != null && options.year !== '') {
        // Dates are interpreted in the Confluence timezone; keep predicates
        // before the generated ordering and use an exclusive year end.
        var order = cql.match(/ ORDER BY (?:lastmodified DESC|title ASC)$/);
        if (order) cql = cql.slice(0, -order[0].length);
        cql += ' AND lastmodified >= "' + options.year + '-01-01" AND lastmodified < "' + (Number(options.year) + 1) + '-01-01"' + (order ? order[0] : '');
      }
      var position = options.continuation == null ? { start: start } : continuationPosition(options.continuation, cql, limit);
      var expanded = tree ? (options.excerpt === false ? 'space,ancestors' : 'version,space,ancestors,metadata.labels') : 'version,space,ancestors';
      if (tree && options.excerpt !== false) expanded += ',body.storage';
      if (scope.additionalSubtreePageId && expanded.indexOf('metadata.labels') < 0) expanded += ',metadata.labels';
      var contentTransport = options.continuation ? options.continuation.transport === 'content' : preferContentSearch;
      async function fetchResults(useContent) {
        if (options.sharedRead && !options.sharedRead.subscribers.size) {
          // Root verification may finish after the last consumer navigates
          // away. Do not launch another HTTP read unless a route adopts it.
          await new Promise(function (resolve, reject) {
            function finish(error) {
              options.signal.removeEventListener('abort', abort);
              options.sharedRead.resume = null;
              if (error) reject(error); else resolve();
            }
            function abort() { finish(searchAbort()); }
            options.sharedRead.resume = function () { finish(); };
            options.signal.addEventListener('abort', abort, { once: true });
            if (options.signal.aborted) abort();
          });
        }
        throwIfAborted(options.signal);
        var url = endpoint(useContent ? '/rest/api/content/search' : '/rest/api/search');
        var params = new URLSearchParams({ cql: cql, limit: String(limit), expand: useContent ? expanded : expanded.split(',').map(function (field) { return 'content.' + field; }).join(',') });
        if (!useContent) params.set('excerpt', options.excerpt === false ? 'none' : 'indexed');
        Object.keys(position).forEach(function (key) { params.set(key, String(position[key])); });
        url.search = params.toString();
        var payload = await json(await request(url, { signal: options.signal }));
        throwIfAborted(options.signal);
        if (!object(payload) || !Array.isArray(payload.results) || payload.results.length > limit) fail('Unexpected Confluence search response.', useContent ? 'INVALID_SCOPE' : 'INVALID_DATA');
        return payload;
      }
      function itemFrom(result) {
        return typeof search.contentFromResult === 'function' ? search.contentFromResult(result) : result && (result.content || result.entity || (result.id && result.type ? result : null));
      }
      function labelNames(item) {
        var metadata = object(item.metadata) ? item.metadata : {}, labels = metadata.labels;
        var records = Array.isArray(labels) ? labels : object(labels) && Array.isArray(labels.results) ? labels.results : null;
        if (!records) return null;
        if (records.some(function (label) { return !object(label) || typeof (label.name || label.label) !== 'string'; })) fail('Confluence returned invalid WCSpedia page label metadata.', 'INVALID_SCOPE');
        return records.map(function (label) { return label.name || label.label; });
      }
      function checkScope(result, allowMissing) {
        if (!object(result)) fail('Confluence did not identify a page in the WCSpedia search scope.', 'INVALID_SCOPE');
        if (result.entityType && ['page', 'content'].indexOf(result.entityType) < 0) fail('Confluence returned a non-page search result.', 'INVALID_SCOPE');
        var item = itemFrom(result);
        if (!object(item)) { if (allowMissing) return false; fail('Confluence did not expand WCSpedia page metadata.', 'INVALID_SCOPE'); }
        var id = String(item.id || result.id || ''), kind = item.type || (result.entityType === 'page' ? 'page' : null);
        // Missing expansions are a transport compatibility issue. Explicit
        // conflicting metadata must never be repaired by retrying another API.
        if (id && (!/^[1-9]\d{0,19}$/.test(id) || id === pageId) || kind && kind !== 'page') fail('Confluence returned a page outside the selected WCSpedia page tree.', 'INVALID_SCOPE');
        if (scope.excludeIds && scope.excludeIds.some(function (excluded) { return String(excluded) === id; })) fail('Confluence returned an excluded WCSpedia navigation page.', 'INVALID_SCOPE');
        if (object(item.space) && item.space.key != null && item.space.key !== scope.spaceKey) fail('Confluence returned a search result outside the WCSpedia space.', 'INVALID_SCOPE');
        var ancestorItems = Array.isArray(item.ancestors) ? item.ancestors : object(item.ancestors) && Array.isArray(item.ancestors.results) ? item.ancestors.results : null;
        var ancestors = ancestorItems && ancestorItems.map(function (ancestor) { return object(ancestor) ? String(ancestor.id) : ''; });
        if (ancestors && ancestors.indexOf(pageId) < 0) {
          fail('Confluence returned a page outside the selected WCSpedia page tree.', 'INVALID_SCOPE');
        }
        if (ancestors && scope.excludeAncestorIds && scope.excludeAncestorIds.some(function (excluded) { return ancestors.indexOf(String(excluded)) >= 0; })) fail('Confluence returned a page from an excluded WCSpedia administrative subtree.', 'INVALID_SCOPE');
        var insightArea = false;
        if (ancestors && scope.subtreePageId && id !== scope.subtreePageId && ancestors.indexOf(scope.subtreePageId) < 0) {
          if (!scope.additionalSubtreePageId || ancestors.indexOf(scope.additionalSubtreePageId) < 0) fail('Confluence returned a page outside the selected WCSpedia business area.', 'INVALID_SCOPE');
          var names = labelNames(item);
          if (!names) {
            if (allowMissing) return false;
            fail('Confluence did not expand the labels needed to verify the Insights business area.', 'INVALID_SCOPE');
          }
          if (names.indexOf('wcs-area-' + scope.additionalSubtreeCategory) < 0) fail('Confluence returned an Insights page outside the selected WCSpedia business area.', 'INVALID_SCOPE');
          insightArea = true;
        }
        if (!id || kind !== 'page' || !object(item.space) || !item.space.key || !ancestors) {
          if (allowMissing) return false;
          fail('Confluence did not expand the WCSpedia page identity, space and ancestors.', 'INVALID_SCOPE');
        }
        return { item: item, id: id, ancestors: ancestors, insightArea: insightArea };
      }
      var response = await fetchResults(contentTransport);
      var indexedTotal = typeof search.resultTotal === 'function' ? search.resultTotal(response) : null;
      var incomplete = false;
      response.results.forEach(function (result) { if (!checkScope(result, !contentTransport)) incomplete = true; });
      if (incomplete) {
        // A single bounded Content query repeats the exact root/space/area CQL.
        // Visible-card metadata stays in this batch; no per-page fetch or whole-space fallback.
        if (position.cursor) fail('Confluence omitted metadata on a cursor page. Restart this search.', 'INVALID_SCOPE');
        response = await fetchResults(true);
        response.results.forEach(function (result) { checkScope(result, false); });
        contentTransport = true; preferContentSearch = true;
      }
      var results = response.results.map(function (result) {
        var checked = checkScope(result, false), item = checked.item, id = checked.id, ancestors = checked.ancestors;
        var link = result.url || (item._links || {}).webui, href = null;
        if (link) {
          try {
            if (link.startsWith('/') && !link.startsWith('//') && context && !link.startsWith(context + '/')) link = context + link;
            href = safeURL(link, origin + context + '/', true).href;
          } catch (_) { /* Unsafe links never enter the UI. */ }
        }
        if (tree && !href) href = endpoint('/pages/viewpage.action').href + '?pageId=' + id;
        var normalized = { id: id, title: plain(result.title || item.title), summary: options.excerpt === false ? '' : typeof search.cleanExcerpt === 'function' ? search.cleanExcerpt(result.excerpt) : plain(result.excerpt), updated: result.lastModified || (item.version || {}).when || null, url: href };
        if (tree) {
          var names = labelNames(item) || [];
          if (names.includes('wcs-published') || names.includes('wcs-reader')) normalized.title = normalized.title.replace(new RegExp(' · WCS ' + id + '$'), '');
          if (names.includes('wcs-reader')) normalized.url = readerURL(id,names);
          var area = names.find(function (name) { return /^wcs-area-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name); });
          normalized.category = checked.insightArea ? scope.additionalSubtreeCategory : Object.keys(mappings).find(function (key) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && (id === String(mappings[key]) || ancestors.indexOf(String(mappings[key])) >= 0); }) || (ancestors.includes(String(nativePublication.insightsPageId || '')) ? 'insights' : area ? area.slice('wcs-area-'.length) : null);
          normalized.type = typeof search.typeFromLabel === 'function' ? names.map(search.typeFromLabel).find(Boolean) || null : null;
          normalized.tags = names.filter(function (name) { return /^wcs-tag-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name); }).map(function (name) { return name.slice(8); });
          normalized.version = integer((item.version || {}).number) ? item.version.number : null;
          if (options.excerpt !== false) {
            var card = discoveryBody(item);
            if (card.summary) normalized.summary = card.summary;
            if (card.cover) normalized.cover = card.cover;
            if(card.documentKey)normalized.documentKey=card.documentKey;
            if(card.author)normalized.author=card.author;
          }
        }
        return normalized;
      });
      var total = typeof search.resultTotal === 'function' ? search.resultTotal(response) : integer(response.totalSize, 0) ? response.totalSize : integer(response.totalCount, 0) ? response.totalCount : integer(response.total, 0) ? response.total : null;
      // A compatibility retry uses the identical CQL and authenticated session.
      // Preserve its indexed total if the Content endpoint omits count metadata.
      if (total == null && incomplete) total = indexedTotal;
      var nextContinuation = searchContinuation(response, results, cql, limit, position, total, contentTransport);
      if (nextContinuation && contentTransport) nextContinuation.transport = 'content';
      // A new article is readable before the CQL index catches up. Recover an
      // empty first page from the exact Insights parent, in bounded batches.
      // Never consult private workspace JSON or broaden a business-area query.
      if (tree && (!queryOptions.types.length || queryOptions.types.some(function (type) { return type !== 'Job aid'; })) && !results.length && !nextContinuation && !options.continuation && !start && !options.nativeChildren && nativePublication.insightsPageId && (!options.area || options.area === 'insights')) {
        var recoveryOptions = Object.assign({},options,{types:queryOptions.types,continuation:null});
        var recovered = await insightChildren(recoveryOptions,search);
        var batches = 1;
        while (!recovered.results.length && recovered.nextContinuation && batches++ < 4) recovered = await insightChildren(Object.assign({},recoveryOptions,{continuation:recovered.nextContinuation}),search);
        if (recovered.nextContinuation) recovered.nextContinuation = {transport:'insights-recovery',key:JSON.stringify([options.query||'',options.type||'',options.types||[],options.area||'',options.tag||'',options.process||'',options.region||'',options.year||'',options.updated||'any',options.sort||'relevance']),next:recovered.nextContinuation};
        recovered.cql = cql; recovered.start = null; recovered.nextStart = null;
        return recovered;
      }
      return { results: results, total: total, start: position.start == null ? null : position.start, limit: limit, nextStart: nextContinuation && nextContinuation.start != null ? nextContinuation.start : null, nextContinuation: nextContinuation, cql: cql };
    }
    async function loadLanding(options) {
      options = options || {};
      try { return await loadLandingWithin(options); }
      catch (error) { if (error.code === 'SEARCH_TIMEOUT') searchScopePromise = null; throw error; }
    }
    async function loadLandingWithin(options) {
      options = options || {};
      if (mode !== 'confluence') fail('Native landing pages require Confluence mode.', 'CONFIGURATION');
      var search = dependencies.search || root.WCSSearch;
      if (!search || typeof search.buildCQL !== 'function') fail('Load the WCSpedia search module before using CQL.', 'CONFIGURATION');
      var mappings = object(nativePublication.areaPageIds) ? nativePublication.areaPageIds : {};
      var keys = options.areaIds == null ? Object.keys(mappings) : options.areaIds;
      if (!Array.isArray(keys) || keys.length > 100 || keys.some(function (key) { return typeof key !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key); })) fail('Use the configured business-area keys for the landing page.', 'CONFIGURATION');
      if (options.onUpdate != null && typeof options.onUpdate !== 'function') fail('onUpdate must be a function.', 'CONFIGURATION');
      keys = Array.from(new Set(keys));
      var exclusions = searchExclusions({}, true), containers = exclusions.trees, excluded = exclusions.pages;
      function validPageID(id) { return (typeof id === 'string' || Number.isSafeInteger(id)) && /^[1-9]\d{0,19}$/.test(String(id)); }
      search.buildCQL({}, { rootPageId: pageId, spaceKey: configuredSearchSpace, excludeIds: excluded, excludeAncestorIds: containers });
      // Each read has its own deadline. Optional counts must not consume the
      // latest-articles budget or cancel already successful results.
      var space = await withSearchDeadline(async function(signal) {
        await waitForDiscoverySession(signal,options.revalidateSession);
        return waitForSearchSpace(signal);
      }, options.signal);
      throwIfAborted(options.signal);
      var output = { recent: [], areas: {}, recentReady: false, complete: false }, validKeys = [];
      function errorValue(error) { return { code: error.code || 'LOAD_ERROR', status: error.status, message: error.message || 'Confluence could not load this content.' }; }
      function emit() { throwIfAborted(options.signal); if (options.onUpdate) options.onUpdate(clone(output)); }
      function cancelled(error) { if (error && error.name === 'AbortError') throw error; }
      var reserved = searchExclusions({}, false).pages;
      keys.forEach(function (key) {
        var id = mappings[key];
        if (!validPageID(id) || String(id) === pageId || reserved.indexOf(String(id)) >= 0 || Object.keys(mappings).some(function (other) { return other !== key && String(mappings[other]) === String(id); })) {
          output.areas[key] = { total: null, error: { code: 'CONFIGURATION', message: 'Set a distinct numeric areaPageIds.' + key + ' below the WCSpedia landing page, separate from workspace, assets and working-document pages.' } };
        } else validKeys.push(key);
      });
      emit();
      async function recent() {
        try {
          var result = await searchPages({ scope: 'tree', sort: 'updated', limit: 3, signal: options.signal });
          output.recent = result.results.slice(0, 3);
        } catch (error) { cancelled(error); output.recentError = errorValue(error); }
        output.recentReady = true; emit();
      }
      async function areas() {
        if (!validKeys.length) return;
        var ready = [], ids = validKeys.map(function (key) { return String(mappings[key]); });
        try {
          // Verify only the configured area containers in one small indexed
          // request. Root, exact space and excluded working trees still apply.
          var cql = search.buildCQL({}, { rootPageId: pageId, spaceKey: space, excludeAncestorIds: containers }) + ' AND id IN (' + ids.join(', ') + ')';
          var url = endpoint('/rest/api/content/search');
          url.search = new URLSearchParams({ cql: cql, limit: String(ids.length), start: '0', expand: 'space,ancestors' }).toString();
          var payload = await withSearchDeadline(async function(signal) { return json(await request(url, {signal:signal})); }, options.signal);
          throwIfAborted(options.signal);
          if (!object(payload) || !Array.isArray(payload.results) || payload.results.length > ids.length) fail('Unexpected Confluence business-area response.', 'INVALID_SCOPE');
          var pages = new Map();
          payload.results.forEach(function (result) {
            var page = typeof search.contentFromResult === 'function' ? search.contentFromResult(result) : result;
            if (!object(page) || ids.indexOf(String(page.id)) < 0 || pages.has(String(page.id))) fail('Confluence returned an unexpected business-area page.', 'INVALID_SCOPE');
            pages.set(String(page.id), page);
          });
          validKeys.forEach(function (key) {
            var page = pages.get(String(mappings[key]));
            var ancestors = page && (Array.isArray(page.ancestors) ? page.ancestors : object(page.ancestors) && page.ancestors.results);
            if (!page || page.type !== 'page' || !object(page.space) || page.space.key !== space || !Array.isArray(ancestors) ||
                !ancestors.some(function (ancestor) { return String(ancestor.id) === pageId; }) ||
                ancestors.some(function (ancestor) { return containers.indexOf(String(ancestor.id)) >= 0; })) {
              output.areas[key] = { total: null, error: { code: page ? 'INVALID_SCOPE' : 'MAPPING_UNAVAILABLE', message: 'The mapped ' + key + ' page is unavailable in the WCSpedia page tree and space.' } };
            } else ready.push(key);
          });
        } catch (error) {
          cancelled(error);
          validKeys.forEach(function (key) { output.areas[key] = { total: null, error: errorValue(error) }; });
        }
        emit();
        var next = 0;
        async function worker() {
          while (next < ready.length) {
            throwIfAborted(options.signal);
            var key = ready[next++];
            try {
              // The same first six rows shown after an area click are reusable;
              // avoid paying for a count-only query followed by another search.
              var result = await searchPages({ scope: 'tree', area: key, sort: 'relevance', start: 0, limit: 6, signal: options.signal });
              output.areas[key] = { total: result.total, searchResult: result };
            } catch (error) { cancelled(error); output.areas[key] = { total: null, error: errorValue(error) }; }
            emit();
          }
        }
        await Promise.all(Array.from({ length: Math.min(2, ready.length) }, worker));
      }
      // Prioritize visible articles over speculative area prefetches.
      await recent();
      await areas();
      throwIfAborted(options.signal);
      output.complete = true; emit();
      return output;
    }
    return Object.freeze({ load: load, loadAccess: loadAccess, inspectEntitlementRecovery: inspectEntitlementRecovery, reconcileEntitlementAttachment: reconcileEntitlementAttachment, loadMetrics: loadMetrics, recordView: recordView, submitAction: submitAction, deleteDocument: deleteDocument, submitEntitlementCommand: submitEntitlementCommand, syncEntitlementAccess: syncEntitlementAccess, saveAttachment: saveAttachment, searchPages: searchPages, loadLanding: loadLanding, loadPublishedArticle: loadPublishedArticle, invalidateSearch: clearSearchReads, info: function () { return { mode: mode, authoringMode: nativeSession ? 'confluence-session' : 'service', rootPageId: pageId, searchSpaceKey: verifiedSearchSpace, attachmentPageId: attachmentPageId, attachmentFilename: filename, workflowConfigured: nativeSession || !!workflowURL, workspaceConfigured: nativeSession || !!workspaceURL, entitlementsConfigured: policyConfigured, entitlementsPageId: entitlementPageId, entitlementsSource: entitlementSource, entitlementsFilename: entitlementFilename, entitlementServiceConfigured: nativeSession || !!entitlementURL, metricsConfigured: mode === 'confluence' && (nativeSession || !!metricsURL), directAttachmentWrites: config.allowAttachmentWrites === true, nativePublicationEnabled: publicationEnabled }; } });
  }
  return Object.freeze({ create: create, validateData: validateData, addCategory: addCategory, facetLabel: facetLabel });
});
