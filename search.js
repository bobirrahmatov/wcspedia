(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // CQL references:
  // https://developer.atlassian.com/server/confluence/advanced-searching-using-cql/
  // https://developer.atlassian.com/server/confluence/cql-field-reference/
  var TYPES = ['Guide', 'Procedure', 'Policy', 'Reference', 'FAQ', 'Job aid', 'Knowledge sharing', 'Blog', 'Training', 'Report', 'Playbook', 'Checklist', 'Template'];
  var WINDOWS = { any: 0, week: 7, month: 30, quarter: 90 };
  var SORTS = ['relevance', 'updated', 'newest', 'title', 'popular'];
  var DAY = 86400000;

  function text(value) { return typeof value === 'string' ? value : ''; }
  function fold(value) { return text(value).normalize('NFKC').toLowerCase(); }
  function queryTokens(query) {
    if (query == null) query = '';
    if (typeof query !== 'string') throw new TypeError('Search query must be text.');
    if (query.length > 500) throw new RangeError('Use a search query of 500 characters or fewer.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(query)) {
      throw new TypeError('Search query contains unsupported control characters.');
    }
    var tokens = fold(query).trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 30) throw new RangeError('Use 30 search terms or fewer.');
    return Array.from(new Set(tokens));
  }

  function list(value, name, validate) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new TypeError(name + ' must be an array.');
    return Array.from(new Set(value.map(function (item) {
      if (typeof item !== 'string' || !validate(item)) throw new TypeError('Invalid ' + name + ' value.');
      return item;
    })));
  }

  function optionsFor(options) {
    options = options || {};
    var updated = options.updated || 'any';
    var sort = options.sort || 'relevance';
    if (!Object.prototype.hasOwnProperty.call(WINDOWS, updated)) throw new TypeError('Invalid update filter.');
    if (SORTS.indexOf(sort) === -1) throw new TypeError('Invalid sort order.');
    return {
      tokens: queryTokens(options.query),
      categories: list(options.categories, 'category', function (value) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }),
      types: list(options.types, 'article type', function (value) { return TYPES.indexOf(value) !== -1; }),
      updated: updated,
      sort: sort
    };
  }

  function timestamp(value) {
    var parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }

  function filterArticles(articles, options) {
    if (!Array.isArray(articles)) throw new TypeError('Articles must be an array.');
    options = options || {};
    var filters = optionsFor(options);
    var saved = new Set((options.savedIds || []).map(String));
    var days = WINDOWS[filters.updated];
    var now = new Date(options.now == null ? Date.now() : options.now);
    if (!Number.isFinite(now.getTime())) throw new TypeError('Invalid search date.');
    var cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * DAY;
    var phrase = filters.tokens.join(' ');
    var ranked = articles.map(function (article, index) {
      if (filters.categories.length && filters.categories.indexOf(article.category) === -1) return null;
      if (filters.types.length && filters.types.indexOf(article.type) === -1) return null;
      if (days && timestamp(article.updated) < cutoff) return null;
      if (options.savedOnly && !saved.has(String(article.id))) return null;
      var title = fold(article.title);
      var summary = fold(article.summary);
      var tags = (article.tags || []).map(fold).join(' ');
      var sections = (article.sections || []).map(function (section) {
        return [section.title].concat(section.paragraphs || [], section.bullets || []).map(fold).join(' ');
      }).join(' ');
      var searchable = [title, summary, tags, sections].join(' ');
      if (!filters.tokens.every(function (token) { return searchable.indexOf(token) !== -1; })) return null;
      var score = filters.tokens.reduce(function (total, token) {
        return total + (title.includes(token) ? 12 : 0) + (tags.includes(token) ? 7 : 0) +
          (summary.includes(token) ? 4 : 0) + (sections.includes(token) ? 1 : 0);
      }, 0);
      if (phrase && title.includes(phrase)) score += 20;
      if (phrase && title === phrase) score += 30;
      return { article: article, score: score, index: index };
    }).filter(Boolean);

    ranked.sort(function (a, b) {
      var difference = 0;
      if (filters.sort === 'title') difference = text(a.article.title).localeCompare(text(b.article.title));
      else if (filters.sort === 'popular') difference = (Number(b.article.views) || 0) - (Number(a.article.views) || 0);
      else if (filters.sort === 'updated' || filters.sort === 'newest') {
        difference = timestamp(b.article.updated) - timestamp(a.article.updated);
      } else difference = b.score - a.score;
      return difference || a.index - b.index;
    });
    return ranked.map(function (entry) { return entry.article; });
  }

  function quoteCQL(value) {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function literalLuceneTerm(value) {
    // Each token is a Lucene phrase. Escape Lucene first, then the enclosing
    // CQL string, so operators, wildcards and quotes remain search text.
    return '"' + value.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&') + '"';
  }

  function pageID(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new TypeError('Invalid root page ID.');
    if (!/^[1-9]\d{0,19}$/.test(String(value == null ? '' : value))) {
      throw new TypeError('Set a valid wcspedia root page ID before connecting Confluence search.');
    }
    return String(value);
  }

  function typeLabel(type) { return 'wcs-type-' + type.toLowerCase().replace(/\s+/g, '-'); }
  function typeFromLabel(label) { return TYPES.find(function (type) { return typeLabel(type) === label; }) || null; }

  function labelConfig(config) {
    var prefix = config.categoryLabelPrefix == null ? 'wcs-topic-' : config.categoryLabelPrefix;
    if (['wcs-topic-', 'wcs-area-'].indexOf(prefix) === -1) {
      throw new TypeError('Invalid category label prefix. Use wcs-topic- or wcs-area-.');
    }
    var required = list(config.requiredLabels, 'required label', function (value) {
      return value.length <= 255 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
    });
    if (required.length > 20) throw new RangeError('Use at most 20 required labels.');
    return { prefix: prefix, required: required };
  }

  function buildCQL(options, config) {
    config = config || {};
    var id = pageID(config.rootPageId); // Fail closed: never fall back to a whole-space search.
    var filters = optionsFor(options);
    var prefixLastToken = options && options.prefixLastToken;
    if (prefixLastToken != null && typeof prefixLastToken !== 'boolean') throw new TypeError('prefixLastToken must be a boolean.');
    var labels = labelConfig(config);
    if (config.directChildren != null && typeof config.directChildren !== 'boolean') {
      throw new TypeError('directChildren must be a boolean.');
    }
    if (config.includeRoot != null && typeof config.includeRoot !== 'boolean') throw new TypeError('includeRoot must be a boolean.');
    if (config.includeRoot && config.directChildren) throw new TypeError('Root-inclusive search requires recursive descendants.');
    var clauses = ['type = page', config.includeRoot ? '(id = ' + id + ' OR ancestor = ' + id + ')' : (config.directChildren ? 'parent' : 'ancestor') + ' = ' + id];
    if (config.spaceKey != null) {
      if (typeof config.spaceKey !== 'string' || !/^[A-Za-z0-9~][A-Za-z0-9_.~\-]{0,254}$/.test(config.spaceKey)) {
        throw new TypeError('Invalid Confluence space key.');
      }
      clauses.push('space = ' + quoteCQL(config.spaceKey));
    }
    var additionalSubtree = config.additionalSubtreePageId != null || config.additionalSubtreeCategory != null;
    if (additionalSubtree && (config.subtreePageId == null || config.additionalSubtreePageId == null ||
        typeof config.additionalSubtreeCategory !== 'string' || config.additionalSubtreeCategory.length > 246 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.additionalSubtreeCategory) || labels.prefix !== 'wcs-area-' || config.directChildren)) {
      throw new TypeError('An additional business-area subtree requires a numeric parent, area subtree and valid area category.');
    }
    if (config.subtreePageId != null) {
      var subtree = pageID(config.subtreePageId), branch = '';
      if (additionalSubtree) {
        var additional = pageID(config.additionalSubtreePageId);
        if (additional === id || additional === subtree || subtree === id) throw new TypeError('Business-area and additional subtree parents must be separate from the root and each other.');
        branch = ' OR (ancestor = ' + additional + ' AND label = ' + quoteCQL(labels.prefix + config.additionalSubtreeCategory) + ')';
      }
      clauses.push('(id = ' + subtree + ' OR ancestor = ' + subtree + branch + ')');
    }
    if (config.excludeIds != null) {
      if (!Array.isArray(config.excludeIds) || config.excludeIds.length > 300) throw new TypeError('Use at most 300 excluded page IDs.');
      var excluded = Array.from(new Set(config.excludeIds.map(pageID)));
      if (excluded.length) clauses.push('id NOT IN (' + excluded.join(', ') + ')');
    }
    if (config.excludeAncestorIds != null) {
      if (!Array.isArray(config.excludeAncestorIds) || config.excludeAncestorIds.length > 300) throw new TypeError('Use at most 300 excluded ancestor IDs.');
      var excludedAncestors = Array.from(new Set(config.excludeAncestorIds.map(pageID)));
      if (excludedAncestors.length) clauses.push('ancestor NOT IN (' + excludedAncestors.join(', ') + ')');
    }
    // These are conjunctive discovery filters, not access controls. A production
    // integration must expose only approved reader snapshots under the root and
    // enforce permissions and document workflow on a trusted server.
    labels.required.forEach(function (label) { clauses.push('label = ' + quoteCQL(label)); });
    if (filters.tokens.length) {
      clauses.push('(' + filters.tokens.map(function (token, index) {
        // Only plain final words get our own trailing wildcard. User-supplied
        // operators and wildcard characters remain escaped literal text.
        var prefix = prefixLastToken === true && index === filters.tokens.length - 1 && /^[\p{L}\p{N}]+$/u.test(token);
        return 'text ~ ' + quoteCQL(prefix ? token + '*' : literalLuceneTerm(token));
      }).join(' AND ') + ')');
    }
    if (filters.categories.length) clauses.push('label IN (' + filters.categories.map(function (category) {
      return quoteCQL(labels.prefix + category);
    }).join(', ') + ')');
    if (filters.types.length) clauses.push('label IN (' + filters.types.map(function (type) {
      return quoteCQL(typeLabel(type));
    }).join(', ') + ')');
    if (WINDOWS[filters.updated]) clauses.push('lastmodified >= startOfDay("-' + WINDOWS[filters.updated] + 'd")');
    var cql = clauses.join(' AND ');
    if (filters.sort === 'updated' || filters.sort === 'newest') cql += ' ORDER BY lastmodified DESC';
    if (filters.sort === 'title') cql += ' ORDER BY title ASC';
    if (filters.sort === 'popular') throw new TypeError('Popularity sorting is available in the local prototype only.');
    return cql;
  }

  function integerOption(value, fallback, min, max, name) {
    if (value == null) return fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError('Invalid ' + name + '.');
    return value;
  }

  function contextURL(config) {
    if (!root.location || !/^https?:$/.test(root.location.protocol)) {
      throw new Error('Live search must run inside Confluence over HTTP or HTTPS.');
    }
    var origin = root.location.origin;
    var base = new URL(config.baseUrl || '/', origin);
    if (base.origin !== origin || base.username || base.password || base.search || base.hash) {
      throw new TypeError('Confluence baseUrl must be a same-origin context path, without credentials, query or fragment.');
    }
    return new URL(base.pathname.replace(/\/+$/, '') + '/rest/api/search', origin);
  }

  function plainText(value) {
    // Confluence excerpts can contain highlight markup. Return text, never HTML.
    // Consumers should still use textContent / escapeHTML when displaying strings.
    return text(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '').replace(/@@@(?:end)?hl@@@/g, '')
      .replace(/&(amp|lt|gt|quot|apos|nbsp);|&#(\d+);|&#x([\da-f]+);/gi, function (match, named, decimal, hex) {
        if (named) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()];
        var code = parseInt(decimal || hex, decimal ? 10 : 16);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
      }).replace(/\s+/g, ' ').trim();
  }

  function cleanExcerpt(value) {
    // Indexed HTML-macro bodies can arrive as escaped source, not rendered text.
    // Suppress a code-bearing excerpt without hiding the document itself. Known
    // interface pages are excluded by CQL; this is a presentation safeguard for
    // mixed-content documents and unconfigured custom interface pages.
    var source = text(value).slice(0, 20000).replace(/@@@(?:end)?hl@@@/g, '');
    for (var pass = 0; pass < 3; pass++) {
      var decoded = source.replace(/&(amp|lt|gt|quot|apos|nbsp);|&#(\d+);|&#x([\da-f]+);/gi, function (_, named, decimal, hex) {
        if (named) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()];
        var code = parseInt(decimal || hex, decimal ? 10 : 16);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
      });
      if (decoded === source) break;
      source = decoded;
    }
    // Strip server highlights before detection so highlights cannot split a
    // source token. Retain ordinary prose containing words such as HTML or JSON.
    source = source.replace(/<\/?(?:b|strong|em|span|mark)\b[^>]*>/gi, '');
    var code = /<\/?(?:script|style|iframe|link|ac:[\w-]+|ri:[\w-]+)\b|\{\/?html(?::[^}]*)?\}|\b(?:window|document)\s*\.\s*(?:WCS\w*|querySelector\w*|getElementById|addEventListener)|\bWCS_\w+\s*=|\b(?:const|var|let)\s+\w+\s*=|\bfunction\s*(?:[\w$]+\s*)?\([^)]*\)\s*\{|(?:data-wcs-[\w-]+|class|style|src)\s*=\s*["'][^"']*["']/i;
    if (code.test(source) || /(?:[#.][\w-]+|\b(?:html|body))[^{}]{0,120}\{\s*[-\w]+\s*:|\b(?:rootPageId|attachmentPageId|contextPath)\s*:\s*["']/i.test(source)) return '';
    return plainText(source).slice(0, 600);
  }

  function safeResultURL(value, endpoint, basePath) {
    if (!value) return null;
    try {
      // Search URLs are often relative to the Confluence context, e.g. /spaces/...
      var path = value;
      if (basePath && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(basePath + '/')) path = basePath + value;
      var url = new URL(path, endpoint.origin + basePath + '/');
      if (url.origin !== endpoint.origin || url.username || url.password || !/^https?:$/.test(url.protocol)) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function contentFromResult(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.content && typeof result.content === 'object') return result.content;
    // Data Center SearchResult uses entity; Content search returns Content directly.
    if (result.entity && typeof result.entity === 'object') return result.entity;
    return result.id != null && result.type != null ? result : null;
  }

  function resultTotal(payload) {
    for (var key of ['totalSize', 'totalCount', 'total']) {
      if (Number.isSafeInteger(payload[key]) && payload[key] >= 0) return payload[key];
    }
    // size is the current page size, never the total matching count.
    return null;
  }

  function normalizeResult(result, endpoint, basePath, config) {
    var content = contentFromResult(result) || {};
    var labels = ((content.metadata || {}).labels || {}).results || [];
    var names = labels.map(function (label) { return text(label.name || label.label); });
    var labels = labelConfig(config);
    var category = names.find(function (name) { return name.startsWith(labels.prefix) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.slice(labels.prefix.length)); });
    var kind = names.find(function (name) { return /^wcs-type-[a-z]+(?:-[a-z]+)*$/.test(name); });
    var type = TYPES.find(function (candidate) { return typeLabel(candidate) === kind; }) || 'Reference';
    return {
      id: String(content.id || result.id || ''),
      title: plainText(result.title || content.title),
      summary: cleanExcerpt(result.excerpt),
      category: category ? category.slice(labels.prefix.length) : '',
      type: type,
      updated: text(result.lastModified || (content.version || {}).when),
      tags: names.filter(function (name) { return !name.startsWith('wcs-topic-') && !name.startsWith('wcs-area-') && !name.startsWith('wcs-type-') && !name.startsWith('wcs-status-') && labels.required.indexOf(name) === -1; }),
      sections: [],
      views: null,
      readTime: null,
      url: safeResultURL(result.url || (content._links || {}).webui, endpoint, basePath)
    };
  }

  async function searchConfluence(options, config, request) {
    options = options || {};
    config = config || {};
    request = request || {};
    var cql = buildCQL(options, config);
    if (options.savedOnly) throw new TypeError('Saved article filtering is available in the local prototype only.');
    var endpoint = contextURL(config);
    var basePath = endpoint.pathname.slice(0, -'/rest/api/search'.length);
    var params = new URLSearchParams({
      cql: cql,
      limit: String(integerOption(options.limit, 20, 1, 100, 'result limit')),
      expand: 'content.metadata.labels,content.version',
      excerpt: 'highlight'
    });
    if (options.cursor != null) {
      if (typeof options.cursor !== 'string' || !options.cursor || options.cursor.length > 4096) throw new TypeError('Invalid search cursor.');
      params.set('cursor', options.cursor);
    } else params.set('start', String(integerOption(options.start, 0, 0, Number.MAX_SAFE_INTEGER, 'result offset')));
    endpoint.search = params.toString();
    var response = await root.fetch(endpoint.href, {
      method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
      headers: { Accept: 'application/json' }, signal: request.signal
    });
    if (!response.ok) {
      var error = new Error('Confluence search failed (' + response.status + ').');
      error.status = response.status;
      throw error;
    }
    var payload = await response.json();
    if (!payload || !Array.isArray(payload.results)) throw new Error('Confluence returned an unexpected search response.');
    var next = null;
    var nextLink = (payload._links || {}).next || payload.next;
    if (typeof nextLink === 'string') {
      var nextURL = safeResultURL(nextLink, endpoint, basePath);
      if (nextURL) {
        var continuation = new URL(nextURL);
        if (continuation.pathname === endpoint.pathname) {
          var cursor = continuation.searchParams.get('cursor');
          var start = continuation.searchParams.get('start');
          if (cursor && cursor.length <= 4096) next = { cursor: cursor };
          else if (/^\d+$/.test(start || '') && Number.isSafeInteger(Number(start))) next = { start: Number(start) };
        }
      }
    }
    var total = resultTotal(payload);
    return { results: payload.results.map(function (result) { return normalizeResult(result, endpoint, basePath, config); }), total: total, next: next, cql: cql };
  }

  return Object.freeze({ filterArticles: filterArticles, buildCQL: buildCQL, searchConfluence: searchConfluence, typeFromLabel: typeFromLabel, cleanExcerpt: cleanExcerpt, contentFromResult: contentFromResult, resultTotal: resultTotal });
});
