/*
 * WCSpedia document-control prototype. These immutable, local transitions model
 * the workflow; they are not authentication, permission enforcement or a durable
 * audit store. Production must repeat every check on a trusted server and commit
 * the document, approved snapshot and append-only audit event atomically.
 */
(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./editor-content.js') : root.WCSEditorContent, typeof module === 'object' && module.exports ? require('node:crypto') : root.crypto, typeof module === 'object' && module.exports ? require('./governance.js') : root.WCSGovernance);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (editorContent, crypto, governance) {
  'use strict';

  var STATUSES = ['Draft', 'In review', 'Changes requested', 'Awaiting approval', 'Published'];
  var ACTIONS = ['edit', 'submit', 'request-changes', 'complete-review', 'approve', 'revise', 'delete', 'reassign-owner'];
  var CONTENT_FIELDS = ['title', 'summary', 'sections', 'bodyMarkdown', 'slug', 'highlights', 'cover', 'tags', 'processes', 'regions', 'assets', 'attachments', 'governance', 'sourceMetadata', 'commentsEnabled'];
  var REQUIRED_FIELDS = ['id', 'reference', 'area', 'type', 'ownerId', 'authorId', 'reviewerId', 'approverId'];
  var REVIEW_FIELDS = ['reviewedBy', 'reviewedAt', 'reviewedRevision', 'approvedBy', 'approvedAt', 'effectiveAt', 'nextReviewAt', 'governanceReview'];

  function fail(message) { throw new Error(message); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function requiredText(value, name) {
    if (typeof value !== 'string' || !value.trim()) fail(name + ' is required.');
    return value.trim();
  }
  function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
  function timestamp(value, name) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      fail(name + ' must be an ISO date or timestamp.');
    }
    var parts = value.slice(0, 10).split('-').map(Number);
    var calendarDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var parsed = new Date(value);
    if (calendarDate.getUTCFullYear() !== parts[0] || calendarDate.getUTCMonth() !== parts[1] - 1 || calendarDate.getUTCDate() !== parts[2] || !Number.isFinite(parsed.getTime())) {
      fail(name + ' is not a valid date.');
    }
    return parsed.toISOString();
  }
  function clock(options) { return timestamp(options.now || new Date().toISOString(), 'Action time'); }
  function peopleMap(people) {
    if (!Array.isArray(people) || !people.length) fail('A people directory is required.');
    var peopleById = Object.create(null);
    people.forEach(function (person) {
      if (!person || typeof person !== 'object') fail('Invalid person in the directory.');
      var id = requiredText(person.id, 'Person ID');
      requiredText(person.name, 'Person name');
      if (['Author', 'Manager', 'Reader'].indexOf(person.role) === -1) fail('Invalid person role.');
      if (has(peopleById, id)) fail('Person IDs must be unique.');
      peopleById[id] = person;
    });
    return peopleById;
  }
  function directPublication(doc) { return editorContent.isDirectPublication(doc); }
  function requiredFields(doc) { return directPublication(doc) ? REQUIRED_FIELDS.filter(function(k){return k !== 'reviewerId' && k !== 'approverId';}) : REQUIRED_FIELDS; }
  function assignments(doc, peopleById, allowEntitledAuthor) {
    if (doc.publicationMode != null && !directPublication(doc)) fail('Direct publication requires a supported non-Job-aid type in Insights.');
    if (directPublication(doc)) {
      if (!has(peopleById,doc.authorId) || !has(peopleById,doc.ownerId) || doc.reviewerId != null || doc.approverId != null) fail('Insights articles require an author and owner, without review assignments.');
      return;
    }
    ['ownerId', 'authorId', 'reviewerId', 'approverId'].forEach(function (field) {
      if (!has(peopleById, doc[field])) fail('Assign a valid ' + field.replace('Id', '') + '.');
    });
    if (!allowEntitledAuthor && peopleById[doc.authorId].role === 'Reader') fail('A reader cannot be assigned as author.');
    if (peopleById[doc.reviewerId].role === 'Reader') fail('The assigned reviewer must be an author or manager.');
    if (peopleById[doc.approverId].role !== 'Manager') fail('The assigned approver must be a manager.');
    if (doc.authorId === doc.reviewerId || doc.authorId === doc.approverId) {
      fail('The author cannot review or approve their own document.');
    }
  }
  function content(value) {
    var title = requiredText(value.title, 'Document title');
    var summary = requiredText(value.summary, 'Document summary');
    var sectionSource = value.sections;
    var optional = {};
    if (has(value, 'commentsEnabled')) optional.commentsEnabled = editorContent.validateCommentsEnabled(value.commentsEnabled);
    if (has(value, 'bodyMarkdown')) {
      if (!editorContent) fail('The authoring content helper must load before workflow.');
      optional.bodyMarkdown = requiredText(value.bodyMarkdown, 'Document content').replace(/\r\n?/g, '\n');
      var derivedSections = editorContent.toSections(optional.bodyMarkdown);
      if (sectionSource !== undefined && JSON.stringify(sectionSource) !== JSON.stringify(derivedSections)) fail('Document sections must match the Markdown content.');
      sectionSource = derivedSections;
    }
    if (has(value, 'slug')) {
      if (typeof value.slug !== 'string' || value.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) fail('The slug must use lowercase letters, numbers and single hyphens (up to 120 characters).');
      optional.slug = value.slug;
    }
    if (has(value, 'highlights')) {
      if (!Array.isArray(value.highlights) || value.highlights.length > 5 || value.highlights.some(function (item) { return typeof item !== 'string' || !item.trim() || item.length > 500; })) fail('Use up to five key highlights, each no more than 500 characters.');
      optional.highlights = value.highlights.map(function (item) { return item.trim(); });
    }
    if (has(value, 'cover')) {
      if (!editorContent) fail('The authoring content helper must load before workflow.');
      optional.cover = editorContent.validateCover(value.cover);
    }
    ['tags', 'processes', 'regions'].forEach(function (field) {
      if (has(value, field)) optional[field] = editorContent.validateTags(value[field], field);
    });
    if (has(value, 'assets')) optional.assets = editorContent.validateAssets(value.assets);
    if (has(value, 'attachments')) optional.attachments = editorContent.validateAttachments(value.attachments);
    if (has(value, 'sourceMetadata')) optional.sourceMetadata = editorContent.validateSourceMetadata(value.sourceMetadata);
    if (has(value, 'governance')) {
      if (!governance) fail('The governance helper must load before workflow.');
      if (value.governance == null) fail('Governance metadata cannot be removed. Save an unclassified draft for reassessment.');
      optional.governance = governance.validate(value.governance, { complete: false });
    }
    if (has(value, 'bodyMarkdown')) editorContent.validateReferences(optional.bodyMarkdown, optional);
    if (!Array.isArray(sectionSource) || !sectionSource.length) fail('At least one document section is required.');
    var sectionIds = Object.create(null);
    var sections = sectionSource.map(function (section) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) fail('Invalid document section.');
      var id = requiredText(section.id, 'Section ID');
      if (has(sectionIds, id)) fail('Section IDs must be unique.');
      sectionIds[id] = true;
      var title = requiredText(section.title, 'Section title');
      ['paragraphs', 'bullets'].forEach(function (field) {
        if (!Array.isArray(section[field]) || section[field].some(function (item) { return typeof item !== 'string' || !item.trim(); })) {
          fail('Section ' + field + ' must be an array of non-empty text.');
        }
      });
      if (!section.paragraphs.length && !section.bullets.length) fail('Every section must contain text or steps.');
      return { id: id, title: title, paragraphs: section.paragraphs.map(function (item) { return item.trim(); }), bullets: section.bullets.map(function (item) { return item.trim(); }) };
    });
    return Object.assign({ title: title, summary: summary, sections: sections }, optional);
  }
  // Canonical identity is independent of the title, slug and Confluence location.
  // Retain IDs on imported documents; only newly authored records get a new key.
  function documentKey(doc) { return requiredText(doc && doc.id, 'Document key'); }
  function newDocumentId() {
    if (!crypto || typeof crypto.randomUUID !== 'function') fail('Secure document key generation is unavailable. Use a secure browser context.');
    return 'wcs-doc-' + crypto.randomUUID();
  }
  function isDeleted(doc) { return !!(doc && doc.deletedAt); }
  function confluenceLocation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(function (key) { return ['pageId', 'attachmentId'].indexOf(key) === -1; })) fail('Use only Confluence page and attachment IDs for the document location.');
    var location = {};
    Object.keys(value).forEach(function (key) {
      if (typeof value[key] !== 'string' || !/^[1-9]\d*$/.test(value[key])) fail('Confluence location IDs must be positive numeric strings.');
      location[key] = value[key];
    });
    return location;
  }
  function currentVersion(doc) {
    if (!doc || !Array.isArray(doc.versions) || !doc.versions.length) return null;
    return doc.versions.reduce(function (latest, version) { return version.version > latest.version ? version : latest; });
  }
  function recordedPublishedVersion(doc) {
    if (!doc || doc.publishedVersion == null || !Array.isArray(doc.versions)) return null;
    return doc.versions.find(function (version) { return version.version === doc.publishedVersion && version.status === 'Published'; }) || null;
  }
  function publishedVersion(doc) { return isDeleted(doc) ? null : recordedPublishedVersion(doc); }
  function validateDocument(doc, peopleById) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('A document is required.');
    requiredFields(doc).forEach(function (field) { requiredText(doc[field], field); });
    assignments(doc, peopleById, true);
    if (has(doc, 'confluence')) confluenceLocation(doc.confluence);
    if (!Array.isArray(doc.versions) || !doc.versions.length || !Array.isArray(doc.audit)) fail('Document versions and audit history are required.');
    var numbers = Object.create(null);
    var sourceId = null, importedAt = null;
    doc.versions.slice().sort(function (a, b) { return a.version - b.version; }).forEach(function (version) {
      if (!positiveInteger(version.version) || has(numbers, version.version) || !positiveInteger(version.revision) || STATUSES.indexOf(version.status) === -1) fail('Invalid document version.');
      numbers[version.version] = true;
      if (has(version, 'contributorIds') && (!Array.isArray(version.contributorIds) || version.contributorIds.some(function (id) { return typeof id !== 'string' || !has(peopleById, id); }) || new Set(version.contributorIds).size !== version.contributorIds.length)) fail('Document contributors must be unique, known people.');
      content(version);
      if (version.sourceMetadata != null) {
        if (typeof version.sourceImportedAt !== 'string' || version.sourceImportedAt.indexOf('T') < 0 || timestamp(version.sourceImportedAt, 'Source import time') !== version.sourceImportedAt) fail('Source import time must be a recorded UTC action timestamp.');
        if (sourceId && (version.sourceMetadata.sourceId !== sourceId || version.sourceImportedAt !== importedAt)) fail('The document source identity and first import time must remain consistent across versions.');
        sourceId = version.sourceMetadata.sourceId; importedAt = version.sourceImportedAt;
      } else if (sourceId || version.sourceImportedAt != null) fail('Recorded source metadata cannot be removed from later versions.');
    });
    var current = currentVersion(doc);
    if (doc.versions.some(function (version) { return version.version !== current.version && version.status !== 'Published'; })) fail('Only the latest version may be a working draft.');
    if (doc.publishedVersion != null && !recordedPublishedVersion(doc)) fail('The published version pointer is invalid.');
    if (current.status === 'Published' && doc.publishedVersion !== current.version) fail('The current published version must be the reader version.');
    return current;
  }
  function permissionGranted(context, doc, actorId, capability) {
    // This is a shared transition contract, not a browser security boundary.
    // The trusted service must derive this context from its own entitlements and
    // current Confluence permissions; never accept it from a request payload.
    return !!(context && context.actorId === actorId && context.documentId === documentKey(doc) && context[capability] === true);
  }
  function contributed(doc, current, actorId) {
    return actorId === doc.authorId || actorId === current.createdBy || (current.contributorIds || []).indexOf(actorId) !== -1;
  }
  function actionsFor(doc, current, actorId, permissionContext, peopleById) {
    if (isDeleted(doc)) return [];
    var actions = [];
    var mayEdit = permissionContext == null ? actorId === doc.authorId : permissionGranted(permissionContext, doc, actorId, 'edit');
    if (mayEdit) {
      if (current.status === 'Draft' || current.status === 'Changes requested') actions.push('edit', 'submit');
      if (current.status === 'Published') actions.push('revise');
      if (editorContent.isInsightType(doc.type) && ['In review','Awaiting approval'].includes(current.status)) actions.push('edit');
    }
    if (!contributed(doc, current, actorId)) {
      if (actorId === doc.reviewerId && current.status === 'In review') actions.push('request-changes', 'complete-review');
      if (actorId === doc.approverId && current.status === 'Awaiting approval') {
        actions.push('request-changes');
        if (current.reviewedBy === doc.reviewerId && current.reviewedAt && current.reviewedRevision === current.revision) actions.push('approve');
      }
    }
    if (permissionGranted(permissionContext, doc, actorId, 'edit') && (actorId === doc.ownerId || peopleById[actorId].role === 'Manager' || permissionGranted(permissionContext, doc, actorId, 'admin'))) actions.push('reassign-owner');
    if (permissionGranted(permissionContext, doc, actorId, 'delete')) actions.push('delete');
    return actions;
  }
  function allowedActions(doc, actorId, people, permissionContext) {
    try {
      var peopleById = peopleMap(people);
      if (!has(peopleById, actorId)) return [];
      return actionsFor(doc, validateDocument(doc, peopleById), actorId, permissionContext, peopleById);
    } catch (_) { return []; }
  }
  function change(field, before, after) {
    return { field: field, before: before === undefined ? null : copy(before), after: after === undefined ? null : copy(after) };
  }
  function diff(before, after, fields) {
    return fields.filter(function (field) { return JSON.stringify(before[field]) !== JSON.stringify(after[field]); }).map(function (field) { return change(field, before[field], after[field]); });
  }
  function event(doc, options) {
    var sequence = doc.audit.length + 1;
    var eventId = doc.id + '-event-' + sequence;
    if (doc.audit.some(function (entry) { return entry.id === eventId; })) fail('The audit event ID already exists.');
    var entry = { id: eventId, documentKey: documentKey(doc), at: options.at, actorId: options.actorId, action: options.action, version: options.version, revision: options.revision, fromStatus: options.fromStatus, toStatus: options.toStatus, comment: options.comment, changes: options.changes };
    if (options.actorSOEID != null) {
      if (typeof options.actorSOEID !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(options.actorSOEID)) fail('Actor SOEID is invalid.');
      entry.actorSOEID = options.actorSOEID.toLowerCase();
    }
    doc.audit.push(entry);
  }
  function emptyReview() {
    return { reviewedBy: null, reviewedAt: null, reviewedRevision: null, approvedBy: null, approvedAt: null, effectiveAt: null, nextReviewAt: null };
  }
  function clearGovernanceReview(version) { if (has(version, 'governanceReview')) version.governanceReview = null; }
  function governedMetadata(version, at) {
    if (!governance) fail('The governance helper must load before workflow.');
    if (!version.governance) fail('Complete the document governance metadata before submitting this revision.');
    return governance.validate(version.governance, { complete: true, now: at });
  }
  function reviewEvidence(doc, version, value, options, stored) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Complete the revision-specific governance review checklist.');
    var fields = ['baselineVersion', 'version', 'revision', 'checks', 'findingDisposition', 'reason'];
    if (stored) fields = fields.concat(['flagIds', 'reviewedBy', 'reviewedAt', 'actorSOEID']);
    if (Object.keys(value).some(function (field) { return fields.indexOf(field) < 0; })) fail('Governance review contains an unsupported field.');
    if (value.baselineVersion !== governance.BASELINE_VERSION || value.version !== version.version || value.revision !== version.revision) fail('The governance review must match this exact version, revision, and baseline.');
    var keys = governance.reviewChecklist.map(function (item) { return item.key; });
    if (!value.checks || typeof value.checks !== 'object' || Array.isArray(value.checks) || Object.keys(value.checks).length !== keys.length || keys.some(function (key) { return value.checks[key] !== true; })) fail('Confirm every governance review checklist item.');
    if (['clear', 'addressed', 'changes-required', 'needs-authority'].indexOf(value.findingDisposition) < 0) fail('Record the governance finding disposition.');
    if (['changes-required', 'needs-authority'].indexOf(value.findingDisposition) >= 0) fail('Unresolved findings must be returned for changes or referred to the appropriate authority; this workflow cannot grant exceptions.');
    var reason = requiredText(value.reason, 'Governance review rationale');
    if (reason.length > 4000) fail('Governance review rationale must be no more than 4,000 characters.');
    var flags = governance.assess(doc, version, { now: options.now }).flags.map(function (flag) { return flag.id; }).sort();
    if (flags.length && value.findingDisposition === 'clear') fail('Address every flagged passage with a documented rationale, or return the document for changes.');
    if (stored && (JSON.stringify(value.flagIds) !== JSON.stringify(flags) || value.reviewedBy !== version.reviewedBy || value.reviewedAt !== version.reviewedAt)) fail('The recorded governance review no longer matches the reviewed content and reviewer.');
    var evidence = { baselineVersion: governance.BASELINE_VERSION, version: version.version, revision: version.revision, checks: copy(value.checks), findingDisposition: value.findingDisposition, reason: reason, flagIds: flags, reviewedBy: stored ? value.reviewedBy : options.actorId, reviewedAt: stored ? value.reviewedAt : options.now };
    if (stored ? value.actorSOEID != null : options.actorSOEID != null) evidence.actorSOEID = stored ? value.actorSOEID : options.actorSOEID;
    return evidence;
  }
  function createDocument(fields, options) {
    options = options || {};
    if (!fields || typeof fields !== 'object') fail('Document fields are required.');
    if (has(fields, 'sourceImportedAt')) fail('The source import time is recorded by the service and cannot be supplied.');
    var peopleById = peopleMap(options.people);
    var at = clock(options);
    var doc = fields.publicationMode != null ? {publicationMode:fields.publicationMode,type:fields.type,area:fields.area,reviewerId:null,approverId:null} : {};
    if (fields.publicationMode != null && !directPublication(doc)) fail('Only supported non-Job-aid types in Insights can publish directly.');
    requiredFields(doc).forEach(function (field) { doc[field] = field === 'id' && fields[field] == null ? newDocumentId() : requiredText(fields[field], field); });
    if (has(fields, 'confluence')) doc.confluence = confluenceLocation(fields.confluence);
    var entitledCreator = permissionGranted(options.permissionContext, doc, options.actorId, 'create');
    if (options.permissionContext != null && !entitledCreator) fail('Document creation is not permitted for this actor.');
    assignments(doc, peopleById, entitledCreator);
    if (options.actorId !== doc.authorId) fail('Only the assigned author can create this document.');
    var initialContent = content(fields);
    initialContent.commentsEnabled = editorContent.validateCommentsEnabled(fields.commentsEnabled);
    var changeSummary = fields.changeSummary == null ? 'Initial draft created.' : requiredText(fields.changeSummary, 'Change summary');
    var version = Object.assign({ version: 1, revision: 1, status: 'Draft', createdAt: at, createdBy: options.actorId, contributorIds: [options.actorId], changeSummary: changeSummary }, initialContent, emptyReview());
    if (version.sourceMetadata) version.sourceImportedAt = at;
    doc.publishedVersion = null;
    doc.versions = [version];
    doc.audit = [];
    if(directPublication(doc)){version.status='Published';version.publishedAt=at;doc.publishedVersion=1;}
    event(doc, { at: at, actorId: options.actorId, actorSOEID: options.actorSOEID, action: 'create', version: 1, revision: 1, fromStatus: null, toStatus: version.status, comment: changeSummary,
      changes: REQUIRED_FIELDS.map(function (field) { return change(field, null, doc[field]); }).concat(has(doc, 'confluence') ? [change('confluence', null, doc.confluence)] : []).concat([change('publishedVersion', null, doc.publishedVersion), change('versionSnapshot', null, version)]) });
    return doc;
  }
  function transition(input, action, options) {
    options = options || {};
    var peopleById = peopleMap(options.people);
    var current = validateDocument(input, peopleById);
    if (ACTIONS.indexOf(action) === -1) fail('Unknown workflow action.');
    if (isDeleted(input)) fail('This document has already been deleted.');
    if (!has(peopleById, options.actorId)) fail('Choose a valid actor.');
    if (!positiveInteger(options.expectedVersion) || !positiveInteger(options.expectedRevision)) fail('Expected version and revision are required. Refresh the document and try again.');
    if (options.expectedVersion !== current.version || options.expectedRevision !== current.revision) fail('This document changed. Refresh before continuing.');
    if (['delete','reassign-owner'].includes(action) && !Number.isSafeInteger(options.expectedAuditLength)) fail('Expected audit length is required for this action. Refresh the document and try again.');
    if (options.expectedAuditLength != null && (!Number.isSafeInteger(options.expectedAuditLength) || options.expectedAuditLength !== input.audit.length)) fail('The workflow changed. Refresh before continuing.');
    if (actionsFor(input, current, options.actorId, options.permissionContext, peopleById).indexOf(action) === -1) fail('This action is not allowed for the assigned person and current status.');
    var comment = requiredText(options.comment, 'A comment / change summary');
    var at = clock(options);
    if (input.audit.length && new Date(at).getTime() < new Date(input.audit[input.audit.length - 1].at).getTime()) fail('Action time cannot precede the latest audit event.');
    if (!['edit', 'revise'].includes(action) && options.changes != null && Object.keys(options.changes).length) fail('Content changes are only accepted by the edit or revise action.');
    var doc = copy(input);
    var version = currentVersion(doc);
    var before = copy(version);
    var changes = [], routingChanges = [];
    var adoptingInsights = editorContent.isInsightType(doc.type) && !directPublication(doc) && ['edit','revise'].includes(action);
    if (adoptingInsights) {
      var priorRouting = copy(doc);
      doc.publicationMode = editorContent.publicationModeFor(doc.type); doc.area = 'insights'; doc.reviewerId = null; doc.approverId = null;
      routingChanges = diff(priorRouting, doc, ['publicationMode','area','reviewerId','approverId']);
    }

    // The active installation chooses the optional governance profile.
    // Role, exact-revision and native authorization checks remain independent.
    if (options.requireGovernance === true && ['submit', 'complete-review', 'approve'].indexOf(action) >= 0) governedMetadata(version, at);
    if (action === 'approve' && version.governance && version.governance.classification === 'formal-reference') fail('Formal documents must follow their authoritative repository and governance process; ordinary WCSpedia approval cannot publish them.');

    var newContent;
    if (action === 'edit' || (action === 'revise' && options.changes != null)) {
      if (!options.changes || typeof options.changes !== 'object' || Array.isArray(options.changes)) fail('Provide the document content to change.');
      if (Object.keys(options.changes).some(function (key) { return CONTENT_FIELDS.indexOf(key) === -1; })) fail('Only document content can be edited; workflow metadata and assignments are locked.');
      var pendingContent = Object.assign({}, version, options.changes);
      // Markdown owns its search projection. Do not accidentally compare a new
      // body with the prior revision's sections when callers omit the projection.
      if (has(options.changes, 'bodyMarkdown') && !has(options.changes, 'sections')) delete pendingContent.sections;
      newContent = content(pendingContent);
      if (version.sourceMetadata && (!newContent.sourceMetadata || newContent.sourceMetadata.sourceId !== version.sourceMetadata.sourceId)) fail('The imported source identity cannot be changed or removed. Create a separate document for a different source.');
      if (newContent.sourceMetadata) newContent.sourceImportedAt = version.sourceImportedAt || at;
      var contentChanges = diff(version, newContent, CONTENT_FIELDS);
      if (!contentChanges.length && !adoptingInsights) fail('Make a content change before saving.');
    }

    if (action === 'edit') {
      Object.assign(version, newContent, emptyReview());
      clearGovernanceReview(version);
      version.contributorIds = Array.from(new Set([doc.authorId, version.createdBy].concat(version.contributorIds || [], [options.actorId]).filter(Boolean)));
      version.revision += 1;
      version.status = directPublication(doc) ? 'Published' : 'Draft';
      version.changeSummary = comment;
      // Include all content, even unchanged fields, so every edit is independently
      // reconstructable without relying on an overwritten working document.
      changes = CONTENT_FIELDS.filter(function (field) { return has(before, field) || has(version, field); }).map(function (field) { return change(field, before[field], version[field]); });
      changes = changes.concat(diff(before, version, ['sourceImportedAt', 'revision', 'status', 'changeSummary', 'contributorIds'].concat(REVIEW_FIELDS)));
    } else if (action === 'submit') {
      Object.assign(version, emptyReview());
      clearGovernanceReview(version);
      version.status = 'In review';
    } else if (action === 'request-changes') {
      Object.assign(version, emptyReview());
      clearGovernanceReview(version);
      version.status = 'Changes requested';
    } else if (action === 'complete-review') {
      if (options.requireGovernance === true) version.governanceReview = reviewEvidence(doc, version, options.governanceReview, { actorId: options.actorId, actorSOEID: options.actorSOEID, now: at }, false);
      version.reviewedBy = options.actorId;
      version.reviewedAt = at;
      version.reviewedRevision = version.revision;
      version.status = 'Awaiting approval';
    } else if (action === 'approve') {
      // Separate review and approval actions are deliberate even when one manager
      // holds both assignments. The reviewed content revision must still match.
      if (version.reviewedBy !== doc.reviewerId || version.reviewedRevision !== version.revision || !version.reviewedAt) fail('Approval requires review of this exact content revision.');
      if (options.requireGovernance === true) reviewEvidence(doc, version, version.governanceReview, { now: at }, true);
      var effectiveAt = timestamp(options.effectiveAt, 'Effective date');
      // The simplified workflow still records exact-revision review/approval,
      // but does not invent a governance review target when none was requested.
      var nextReviewAt = options.reviewScheduleRequired === false && !options.nextReviewAt ? null : timestamp(options.nextReviewAt, 'Next review date');
      if (new Date(effectiveAt).getTime() > new Date(at).getTime()) fail('Future effective dates are not supported. Publish when the document becomes effective.');
      if (new Date(effectiveAt).getTime() < new Date(at).getTime()) fail('A new approval cannot be backdated. Use the approval time as the effective date.');
      if (nextReviewAt && new Date(nextReviewAt).getTime() <= new Date(at).getTime()) fail('The next review date must be after approval.');
      if (nextReviewAt && version.governance && ['other-nhd', 'other-bod'].indexOf(version.governance.classification) >= 0 && nextReviewAt.slice(0, 10) > governance.nextReviewDate(at, 24)) fail('Choose a business review target within 24 calendar months of approval. This is the configured business best-practice target, not a formal-policy certification.');
      version.approvedBy = options.actorId;
      version.approvedAt = at;
      version.effectiveAt = effectiveAt;
      version.nextReviewAt = nextReviewAt;
      version.status = 'Published';
      changes.push(change('publishedVersion', doc.publishedVersion, version.version));
      doc.publishedVersion = version.version;
    } else if (action === 'revise') {
      version = Object.assign({}, copy(before), newContent || {}, emptyReview(), { version: before.version + 1, revision: 1, status: 'Draft', createdAt: at, createdBy: options.actorId, contributorIds: [options.actorId], changeSummary: comment });
      clearGovernanceReview(version);
      doc.versions.push(version);
      if(directPublication(doc)){version.status='Published';version.publishedAt=at;doc.publishedVersion=version.version;}
      changes.push(change('sourcePublishedVersion', null, before.version), change('versionSnapshot', null, version));
      // Saving an edit of published content creates one draft atomically. The
      // approved snapshot is untouched; the event captures exact field changes.
      if (newContent) changes = changes.concat(diff(before, version, CONTENT_FIELDS.concat(['sourceImportedAt'])));
    } else if (action === 'reassign-owner') {
      var nextOwner = peopleById[options.ownerId];
      if (!nextOwner || nextOwner.active === false || !['Author','Manager'].includes(nextOwner.role)) fail('Choose an active document owner with author or manager access.');
      if (options.ownerId === doc.ownerId) fail('Choose a different document owner.');
      changes.push(change('ownerId', doc.ownerId, options.ownerId));
      doc.ownerId = options.ownerId;
    } else if (action === 'delete') {
      // Keep immutable snapshots and audit history. The trusted service separately
      // trashes a mapped native page only after durable audit retention succeeds.
      doc.deletedAt = at;
      doc.deletedBy = options.actorId;
      doc.deletedReason = comment;
      doc.deletedVersion = before.version;
      doc.deletedRevision = before.revision;
      doc.deletedAuditEventId = doc.id + '-event-' + (doc.audit.length + 1);
      changes = ['deletedAt', 'deletedBy', 'deletedReason', 'deletedVersion', 'deletedRevision', 'deletedAuditEventId'].map(function (field) { return change(field, input[field], doc[field]); });
      changes.push(change('versionSnapshot', before, before));
    }

    if (directPublication(doc) && action === 'edit') {version.status='Published';version.publishedAt=at;doc.publishedVersion=version.version;changes.push(change('publishedVersion',input.publishedVersion,doc.publishedVersion));}
    if (action !== 'edit' && action !== 'revise') changes = changes.concat(diff(before, version, ['status'].concat(REVIEW_FIELDS)));
    changes = routingChanges.concat(changes);
    event(doc, { at: at, actorId: options.actorId, actorSOEID: options.actorSOEID, action: action, version: version.version, revision: version.revision, fromStatus: before.status, toStatus: action === 'delete' ? 'Deleted' : version.status, comment: comment, changes: changes });
    return doc;
  }

  function deleteDocument(doc, options) { return transition(doc, 'delete', options); }

  return Object.freeze({ documentKey: documentKey, newDocumentId: newDocumentId, isDeleted: isDeleted, deleteDocument: deleteDocument, currentVersion: currentVersion, publishedVersion: publishedVersion, allowedActions: allowedActions, transition: transition, createDocument: createDocument });
});
