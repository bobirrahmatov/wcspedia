/* Discovery over version snapshots. UI visibility is a demo model, not server authorization. */
(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./document-metrics.js') : root.WCSDocumentMetrics, typeof module === 'object' && module.exports ? require('./editor-content.js') : root.WCSEditorContent);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (metrics, content) {
  'use strict';

  var titleCollator = new Intl.Collator('en', { sensitivity: 'base' });
  var idCollator = new Intl.Collator('en');
  function text(value) { return typeof value === 'string' ? value : ''; }
  function fold(value) { return text(value).normalize('NFKC').toLowerCase(); }
  function timestamp(value) { var at = Date.parse(value); return Number.isFinite(at) ? at : 0; }
  function viewCount(counts, id) {
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
    var proto = Object.getPrototypeOf(counts);
    if (proto !== Object.prototype && proto !== null || !Object.prototype.hasOwnProperty.call(counts, id)) return null;
    var value = counts[id];
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  function body(version) {
    return (Array.isArray(version.sections) ? version.sections : []).map(function (section) {
      return [text(section.title)].concat(section.paragraphs || [], section.bullets || []).filter(function (value) {
        return typeof value === 'string';
      }).join(' ');
    }).join(' ');
  }
  function modifiedAt(doc, version) {
    // A pending edit must not move an older approved snapshot up the published list.
    if (version.status === 'Published') return timestamp(version.publishedAt) || timestamp(version.approvedAt) || timestamp(version.createdAt);
    return (doc.audit || []).filter(function (event) { return event.version === version.version; }).reduce(function (latest, event) {
      return Math.max(latest, timestamp(event.at));
    }, timestamp(version.createdAt));
  }

  function searchDocuments(documents, options, workflow) {
    options = options || {};
    if (!workflow || typeof workflow.publishedVersion !== 'function' || typeof workflow.currentVersion !== 'function') {
      throw new TypeError('The document workflow is required for discovery.');
    }
    var people = Array.isArray(options.people) ? options.people : [];
    var areas = Array.isArray(options.areas) ? options.areas : [];
    var actor = people.find(function (person) { return person.id === options.actorId; });
    var view = ['mine', 'review'].indexOf(options.view) !== -1 ? options.view : 'published';
    // Working snapshots require a known actor and an assignment. Authorship
    // does not disappear when a presentation role changes; the trusted service
    // remains responsible for returning only records that actor may read.
    if (view !== 'published' && !actor) return [];
    if (view === 'review' && ['Author', 'Manager'].indexOf(actor.role) === -1) return [];
    var query = fold(options.query).trim().replace(/\s+/g, ' ');
    var tokens = Array.from(new Set(query.split(' ').filter(Boolean)));
    var sort = options.sort === 'recent' ? 'updated' : ['updated', 'title', 'shortest', 'longest', 'most-viewed', 'least-viewed'].indexOf(options.sort) !== -1 ? options.sort : 'relevance';
    var readingSort = sort === 'shortest' || sort === 'longest';
    if (readingSort && (!metrics || typeof metrics.estimate !== 'function')) throw new TypeError('Document metrics are required to sort by reading time.');
    var rows = (Array.isArray(documents) ? documents : []).map(function (doc, index) {
      if (!doc || doc.deletedAt || (options.area && doc.area !== options.area) || (options.type && content.groupType(doc.type) !== content.groupType(options.type))) return null;
      if (view === 'mine' && doc.authorId !== options.actorId && doc.ownerId !== options.actorId) return null;
      var version = view === 'published' ? workflow.publishedVersion(doc) : workflow.currentVersion(doc);
      if (!version) return null;
      if ([['tag','tags'],['process','processes'],['region','regions']].some(function (pair) {
        return options[pair[0]] && !(version[pair[1]] || []).some(function (value) { return fold(value) === fold(options[pair[0]]); });
      })) return null;
      if (view === 'review') {
        if (doc.authorId === options.actorId || version.createdBy === options.actorId || (version.contributorIds || []).indexOf(options.actorId) !== -1) return null;
        var assignedReview = version.status === 'In review' && doc.reviewerId === options.actorId;
        var assignedApproval = version.status === 'Awaiting approval' && doc.approverId === options.actorId && actor.role === 'Manager';
        if (!assignedReview && !assignedApproval) return null;
      }
      var score = 0;
      // Browsing and facet lists do not need to normalize the document body.
      if (tokens.length) {
        var owner = people.find(function (person) { return person.id === doc.ownerId; });
        var area = areas.find(function (candidate) { return candidate.id === doc.area; });
        var fields = {
          title: fold(version.title), summary: fold(version.summary), body: fold(body(version)),
          reference: fold(doc.reference), type: fold(doc.type), owner: fold(owner && owner.name), area: fold(area && area.title),
          taxonomy: fold([].concat(version.tags || [], version.processes || [], version.regions || []).join(' ')),
          attachments: fold((version.attachments || []).map(function (file) { return file.name; }).join(' '))
        };
        var searchable = Object.keys(fields).map(function (key) { return fields[key]; }).join(' ');
        // User input remains literal text; punctuation is never evaluated as a regular expression.
        if (!tokens.every(function (token) { return searchable.includes(token); })) return null;
        score = tokens.reduce(function (value, token) {
          return value + (fields.title.includes(token) ? 12 : 0) + (fields.reference.includes(token) ? 8 : 0)
            + (fields.summary.includes(token) ? 4 : 0) + (fields.owner.includes(token) ? 2 : 0)
            + (fields.type.includes(token) ? 2 : 0) + (fields.area.includes(token) ? 2 : 0) + (fields.body.includes(token) ? 1 : 0)
            + (fields.taxonomy.includes(token) ? 7 : 0) + (fields.attachments.includes(token) ? 2 : 0);
        }, 0);
        if (fields.title.includes(query)) score += 25;
        if (fields.title === query) score += 25;
      }
      return { d: doc, v: version, score: score, at: modifiedAt(doc, version), index: index,
        seconds: readingSort ? metrics.estimate(version).seconds : 0, views: viewCount(options.viewCounts, doc.id) };
    }).filter(Boolean);
    rows.sort(function (a, b) {
      if (sort === 'title') return titleCollator.compare(text(a.v.title), text(b.v.title)) || idCollator.compare(text(a.d.id), text(b.d.id)) || a.index - b.index;
      if (sort === 'relevance' && query && a.score !== b.score) return b.score - a.score;
      if (readingSort && a.seconds !== b.seconds) return sort === 'shortest' ? a.seconds - b.seconds : b.seconds - a.seconds;
      if (sort === 'most-viewed' || sort === 'least-viewed') {
        // Missing or invalid measurements are unknown, never fabricated zeroes.
        // Unknowns remain last even when sorting ascending.
        if (a.views === null && b.views !== null) return 1;
        if (a.views !== null && b.views === null) return -1;
        if (a.views !== b.views) return sort === 'most-viewed' ? b.views - a.views : a.views - b.views;
      }
      return b.at - a.at || titleCollator.compare(text(a.v.title), text(b.v.title)) || idCollator.compare(text(a.d.id), text(b.d.id)) || a.index - b.index;
    });
    return rows.map(function (row) { return { d: row.d, v: row.v }; });
  }

  function relatedDocuments(documents, current, version, workflow, limit) {
    var normalize = function (values) { return new Set((values || []).map(fold)); };
    var overlap = function (a, b) { var set = normalize(a); return Array.from(normalize(b)).filter(function (value) { return set.has(value); }).length; };
    return (documents || []).filter(function (doc) { return doc && !doc.deletedAt && doc.id !== current.id; }).map(function (doc) {
      var candidate = workflow.publishedVersion(doc);
      if (!candidate) return null;
      var process = overlap(version.processes, candidate.processes), tags = overlap(version.tags, candidate.tags);
      var region = overlap(version.regions, candidate.regions), sameArea = current.area === doc.area;
      // A broad region alone is insufficient to recommend unrelated procedures.
      if (!process && !tags && !sameArea) return null;
      return {d:doc, v:candidate, score:process*10+tags*5+region*2+(sameArea?3:0), at:timestamp(candidate.approvedAt)};
    }).filter(Boolean).sort(function(a,b) { return b.score-a.score || b.at-a.at || a.v.title.localeCompare(b.v.title); })
      .slice(0, limit == null ? 3 : limit).map(function (row) { return {d:row.d,v:row.v}; });
  }
  return Object.freeze({ searchDocuments: searchDocuments, relatedDocuments: relatedDocuments, modifiedAt: modifiedAt });
});
