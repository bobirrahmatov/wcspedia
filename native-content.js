/* WCSpedia native-page view adapter. Native Confluence bodies remain authoritative. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSNativeContent = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var ALLOWED = new Set('a p br hr h1 h2 h3 h4 h5 h6 strong b em i u s del ins sub sup code pre blockquote ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td div span section article figure figcaption img details summary video audio source time kbd samp'.split(' '));
  var DROP = new Set('script style noscript template form input button select textarea option optgroup nav header footer svg math object embed base link meta canvas'.split(' '));
  var WIDGETS = '[data-wcs-native-document-controls], [data-wcs-native-create-widget], #wcs-native-document-controls, #wcs-native-create-widget, .wcs-native-document-controls, .wcs-native-create, .wcs-ui-layer';
  var TYPES = { 'job-aid': 'Job aid', 'job-aids': 'Job aid', 'knowledge-sharing': 'Knowledge sharing', 'reference': 'Reference', 'training': 'Training', 'blog': 'Blog', 'report': 'Report', 'guide': 'Guide', 'checklist': 'Checklist', 'playbook': 'Playbook', 'faq': 'FAQ', 'template': 'Template' };
  function clean(value) { return value == null ? '' : String(value).replace(/\s+/g, ' ').trim(); }
  function list(value) { return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : []).map(clean).filter(Boolean).filter(function (item, index, values) { return values.indexOf(item) === index; }); }
  function parse(html) {
    if (typeof root.DOMParser !== 'function') throw new Error('A browser DOMParser is required to process native Confluence content.');
    return new root.DOMParser().parseFromString(String(html || ''), 'text/html');
  }
  function baseAddress(baseUrl) {
    var result;
    try { result = new URL(baseUrl || (root.location && root.location.href) || 'https://confluence.invalid/'); } catch (_) { throw new Error('A valid Confluence page URL is required.'); }
    if (!/^https?:$/.test(result.protocol) || result.username || result.password) throw new Error('A valid Confluence page URL is required.');
    return result;
  }
  function safeUrl(value, base, kind, options) {
    value = String(value || '').trim();
    if (!value || /[\u0000-\u0020\u007f\\]/.test(value) || value.slice(0, 2) === '//') return '';
    if (kind === 'link' && value.charAt(0) === '#') return '#wcs-native-' + value.slice(1).replace(/[^A-Za-z0-9_.:-]/g, '-');
    var url; try { url = new URL(value, base); } catch (_) { return ''; }
    if (url.username || url.password) return '';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === base.origin)) return '';
    if (kind === 'image' || kind === 'media') {
      var configured = options[kind === 'image' ? 'imageOrigins' : 'mediaOrigins'] || [];
      if (url.origin !== base.origin && configured.indexOf(url.origin) < 0) return '';
    }
    return url.href;
  }
  function sourceHtml(page) {
    return page && page.body && (page.body.view && page.body.view.value || page.body.export_view && page.body.export_view.value) || '';
  }
  function note(doc, message) { var p = doc.createElement('p'); p.setAttribute('data-wcs-omitted', 'true'); p.textContent = message; return p; }
  function sanitizeView(html, baseUrl, options) {
    options = options || {}; var base = baseAddress(baseUrl), input = parse(html), output = parse('');
    function copy(node, parent) {
      if (node.nodeType === 3) { parent.appendChild(output.createTextNode(node.nodeValue)); return; }
      if (node.nodeType !== 1) return;
      var tag = node.localName.toLowerCase(), macro = node.getAttribute('data-macro-name') || '';
      if (node.matches(WIDGETS) || DROP.has(tag) || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden') || /^(toc|children|pagetree|contentbylabel|recently-updated)$/.test(macro)) return;
      if (tag === 'iframe') {
        var src = safeUrl(node.getAttribute('src'), base, 'link', options), address;
        try { address = new URL(src); } catch (_) { address = null; }
        var hostAllowed = address && (/(^|\.)sharepoint\.com$/i.test(address.hostname) || (options.sharePointOrigins || []).indexOf(address.origin) >= 0);
        if (hostAllowed) { var p = output.createElement('p'), a = output.createElement('a'); a.href = src; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = clean(node.getAttribute('title')) || 'Open recording in SharePoint'; p.setAttribute('data-wcs-omitted', 'true'); p.appendChild(a); parent.appendChild(p); }
        else parent.appendChild(note(output, 'Embedded content is available on the native Confluence page.'));
        return;
      }
      if (tag.indexOf(':') >= 0) { parent.appendChild(note(output, 'This Confluence macro is available on the native page.')); return; }
      if (!ALLOWED.has(tag)) { Array.from(node.childNodes).forEach(function (child) { copy(child, parent); }); return; }
      if (tag === 'img') {
        var imageSrc = safeUrl(node.getAttribute('src'), base, 'image', options);
        if (!imageSrc) { parent.appendChild(note(output, 'Image omitted' + (clean(node.getAttribute('alt')) ? ': ' + clean(node.getAttribute('alt')) : '.') )); return; }
      }
      var el = output.createElement(tag);
      ['title', 'lang', 'dir'].forEach(function (name) { var val = node.getAttribute(name); if (val && (name !== 'dir' || /^(ltr|rtl|auto)$/.test(val))) el.setAttribute(name, val); });
      if (node.id) el.id = 'wcs-native-' + node.id.replace(/[^A-Za-z0-9_.:-]/g, '-');
      if (tag === 'a') {
        var href = safeUrl(node.getAttribute('href'), base, 'link', options);
        if (href) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); if (href.charAt(0) !== '#' && new URL(href).origin !== base.origin) el.setAttribute('target', '_blank'); }
      }
      if (tag === 'img') { el.setAttribute('src', imageSrc); el.setAttribute('alt', node.getAttribute('alt') || ''); el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); }
      if (tag === 'video' || tag === 'audio' || tag === 'source') {
        var mediaSrc = safeUrl(node.getAttribute('src'), base, 'media', options);
        if (mediaSrc) el.setAttribute('src', mediaSrc);
        if (tag !== 'source') { el.setAttribute('controls', ''); el.setAttribute('preload', 'none'); }
        else if (/^(video|audio)\/[a-z0-9.+-]+$/i.test(node.getAttribute('type') || '')) el.setAttribute('type', node.getAttribute('type'));
      }
      if (tag === 'th' && /^(row|col|rowgroup|colgroup)$/.test(node.getAttribute('scope') || '')) el.setAttribute('scope', node.getAttribute('scope'));
      ['colspan', 'rowspan', 'width', 'height', 'start'].forEach(function (name) {
        if ((/^(td|th)$/.test(tag) && /span$/.test(name)) || (/^(img|col)$/.test(tag) && /^(width|height)$/.test(name)) || (tag === 'ol' && name === 'start')) {
          var val = node.getAttribute(name); if (/^\d{1,4}$/.test(val || '') && Number(val) > 0) el.setAttribute(name, val);
        }
      });
      if (tag === 'time' && /^\d{4}-\d{2}-\d{2}(T[0-9:.+-]+Z?)?$/.test(node.getAttribute('datetime') || '')) el.setAttribute('datetime', node.getAttribute('datetime'));
      Array.from(node.childNodes).forEach(function (child) { copy(child, el); }); parent.appendChild(el);
    }
    Array.from(input.body.childNodes).forEach(function (node) { copy(node, output.body); });
    return output.body.innerHTML;
  }
  function tableMetadata(html) {
    if (!html) return {};
    var doc = parse(html), found = {};
    Array.from(doc.querySelectorAll('table')).some(function (table) {
      var values = {};
      Array.from(table.rows).forEach(function (row) {
        var cells = Array.from(row.cells); if (cells.length !== 2) return;
        var key = clean(cells[0].textContent).toLowerCase().replace(/[:\s]+$/g, '');
        values[key] = clean(cells[1].textContent);
      });
      if (!('document key' in values) && !('content type' in values && 'document owner' in values)) return false;
      found = {
        docKey: values['document key'], type: values['content type'], owner: { name: values['document owner'], soeid: values['owner soeid'] },
        team: values['owning team'], summary: values['scope and audience'], regions: values['regions covered'], processes: values.processes,
        topics: values.topics, nextReviewDate: values['next review due date'] || values['next review due'], reviewBasis: values['review basis'], supportingTeam: values['supporting team']
      }; return true;
    });
    return found;
  }
  function metadataProperty(page, properties) {
    if (properties && Array.isArray(properties.results)) properties = properties.results;
    var match = Array.isArray(properties) ? properties.find(function (p) { return p.key === 'wcs.metadata'; }) : properties && properties['wcs.metadata'];
    if (!match && page.metadata && page.metadata.properties) match = page.metadata.properties['wcs.metadata'];
    var value = match && (Object.prototype.hasOwnProperty.call(match, 'value') ? match.value : match);
    // A property is only a projection of its exact native page version.
    // A stale/unversioned property must not override the current page table.
    return value && typeof value === 'object' && !Array.isArray(value) && page.version && Number.isInteger(value.sourcePageVersion) && value.sourcePageVersion === page.version.number ? value : {};
  }
  function plainText(html) {
    var doc = parse(html);
    doc.querySelectorAll('script,style,nav,header,footer,[aria-hidden="true"],[hidden],[data-wcs-omitted], ' + WIDGETS).forEach(function (node) { node.remove(); });
    doc.querySelectorAll('p,div,section,article,li,td,th,h1,h2,h3,h4,h5,h6,br').forEach(function (node) { node.appendChild(doc.createTextNode(' ')); });
    return clean(doc.body.textContent);
  }
  function readingMinutes(html, options) {
    options = options || {}; var words = plainText(html).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    var wpm = Number(options.wordsPerMinute); if (!Number.isFinite(wpm) || wpm < 100 || wpm > 1000) wpm = 200;
    return words.length ? Math.max(1, Math.ceil(words.length / wpm)) : 0;
  }
  function normalizePage(page, properties, options) {
    page = page || {}; options = options || {}; var html = sourceHtml(page), table = tableMetadata(html), metadata = metadataProperty(page, properties);
    var rawLabels = page.metadata && page.metadata.labels && page.metadata.labels.results || page.labels || [];
    if (!Array.isArray(rawLabels)) rawLabels = Array.isArray(rawLabels.results) ? rawLabels.results : [];
    var labels = list(rawLabels.map(function (label) { return typeof label === 'string' ? label : label && label.name; }));
    function choose(key, fallback) { return Object.prototype.hasOwnProperty.call(metadata, key) ? metadata[key] : Object.prototype.hasOwnProperty.call(table, key) && table[key] != null ? table[key] : fallback; }
    function labelValue(prefix) { return labels.filter(function (label) { return label.indexOf(prefix) === 0; }).map(function (label) { return label.slice(prefix.length); }); }
    var typeLabel = labelValue('wcs-type-')[0], owner = choose('owner', {}), version = page.version || {};
    var base = options.baseUrl || page._links && page._links.base || (root.location && root.location.href) || 'https://confluence.invalid/';
    if (page._links && page._links.webui) {
      var address = baseAddress(base), webui = String(page._links.webui), context = address.pathname.replace(/\/$/, '');
      if (page._links.base && webui.charAt(0) === '/' && context && webui.indexOf(context + '/') !== 0) webui = context + webui;
      base = safeUrl(webui, address, 'link', options) || address.href;
    }
    var excerpt = html && parse(html).querySelector('.excerpt, .excerpt-macro, [data-macro-name="excerpt"]');
    var sanitized = html ? sanitizeView(html, base, options) : '', updatedBy = version.by || {};
    return {
      id: clean(page.id), pageId: clean(page.id), documentKey: clean(choose('docKey', choose('documentKey', ''))), title: clean(page.title),
      summary: clean(choose('summary', excerpt ? excerpt.textContent : '')), version: Number.isInteger(version.number) ? version.number : null,
      updated: clean(version.when), updatedBy: { name: clean(updatedBy.displayName), username: clean(updatedBy.username), userKey: clean(updatedBy.userKey) },
      type: clean(choose('type', TYPES[typeLabel] || typeLabel || 'Document')), area: clean(choose('area', labelValue('wcs-area-')[0] || '')),
      labels: labels, owner: { name: clean(owner && owner.name), soeid: clean(owner && owner.soeid).toUpperCase() }, team: clean(choose('team', '')),
      regions: list(choose('regions', labelValue('wcs-region-'))), processes: list(choose('processes', [])), topics: list(choose('topics', [])),
      nextReviewDate: clean(choose('nextReviewDate', '')), reviewBasis: clean(choose('reviewBasis', '')), supportingTeam: clean(choose('supportingTeam', '')),
      nativeBodyHtml: sanitized, readingMinutes: sanitized ? readingMinutes(sanitized, options) : null,
      metadataSource: Object.keys(metadata).length ? 'content-property' : Object.keys(table).length ? 'page-properties-table' : 'labels',
      metadataNotice: 'Page Properties tables and REST content properties are separate metadata sources. A REST projection is used only when its sourcePageVersion matches the native revision. Neither establishes approval.'
    };
  }
  function exportMarkdown(page, properties, options) {
    options = options || {}; var normalized = normalizePage(page, properties, options), doc = parse(normalized.nativeBodyHtml), omitted = false;
    function escapeText(text) { return String(text || '').replace(/\\/g, '\\\\').replace(/([`*_\[\]<>])/g, '\\$1'); }
    function children(node) { return Array.from(node.childNodes).map(render).join(''); }
    function render(node) {
      if (node.nodeType === 3) return escapeText(node.nodeValue);
      if (node.nodeType !== 1) return '';
      var tag = node.localName, value;
      if (node.hasAttribute('data-wcs-omitted')) omitted = true;
      if (tag === 'table') {
        var rows = Array.from(node.rows).map(function (row) { return Array.from(row.cells).map(function (cell) { if (cell.colSpan > 1 || cell.rowSpan > 1) omitted = true; return children(cell).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); }); });
        if (!rows.length) return '';
        var width = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
        var lines = rows.map(function (row) { while (row.length < width) row.push(''); return '| ' + row.join(' | ') + ' |'; });
        lines.splice(1, 0, '| ' + Array(width).fill('---').join(' | ') + ' |'); return '\n\n' + lines.join('\n') + '\n\n';
      }
      if (tag === 'pre') { var raw = node.textContent, fence = '`'.repeat(Math.max(3, (raw.match(/`+/g) || []).reduce(function (longest, run) { return Math.max(longest, run.length + 1); }, 3))); return '\n\n' + fence + '\n' + raw + '\n' + fence + '\n\n'; }
      if (tag === 'code') { var code = node.textContent, marker = '`'.repeat(Math.max(1, (code.match(/`+/g) || []).reduce(function (longest, run) { return Math.max(longest, run.length + 1); }, 1))); return marker + ' ' + code + ' ' + marker; }
      value = children(node);
      if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag.slice(1))) + ' ' + value.trim() + '\n\n';
      if (tag === 'strong' || tag === 'b') return '**' + value + '**';
      if (tag === 'em' || tag === 'i') return '*' + value + '*';
      if (tag === 's' || tag === 'del') return '~~' + value + '~~';
      if (tag === 'a' && node.getAttribute('href')) return '[' + value + '](' + node.getAttribute('href').replace(/[()]/g, function (c) { return encodeURIComponent(c).replace('(', '%28').replace(')', '%29'); }) + ')';
      if (tag === 'img') return '![' + escapeText(node.getAttribute('alt')) + '](' + node.getAttribute('src').replace(/\(/g, '%28').replace(/\)/g, '%29') + ')';
      if (tag === 'br') return '  \n'; if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'blockquote') return '\n\n' + value.trim().split('\n').map(function (line) { return '> ' + line; }).join('\n') + '\n\n';
      if (tag === 'li') { var prefix = node.parentNode.localName === 'ol' ? (Array.from(node.parentNode.children).indexOf(node) + Number(node.parentNode.getAttribute('start') || 1)) + '. ' : '- '; return '\n' + prefix + value.trim().replace(/\n/g, '\n  '); }
      if (tag === 'video' || tag === 'audio') { omitted = true; return '\n\n' + (node.getAttribute('src') ? '[Open media](' + node.getAttribute('src') + ')' : value) + '\n\n'; }
      if (tag === 'source') return node.getAttribute('src') ? '[Open media](' + node.getAttribute('src') + ')' : '';
      if (/^(p|div|section|article|figure|figcaption|details|summary|ul|ol|dl)$/.test(tag)) return '\n\n' + value.trim() + '\n\n';
      return value;
    }
    var body = children(doc.body).replace(/\n{3,}/g, '\n\n').trim();
    var result = '# ' + escapeText(normalized.title || 'Untitled document') + '\n\n' + body;
    result += '\n\n---\n\nExported from native Confluence page ' + normalized.id + (normalized.version == null ? '' : ', version ' + normalized.version) + '. This Markdown file is a derived copy; the native page is the source of truth.';
    result += '\n\nConfluence macros and interactive content may not be represented in Markdown. Open the native page for the complete document.';
    if (omitted) result += ' Some embedded content or table layout was simplified in this export.';
    return result.trim() + '\n';
  }
  return { normalizePage: normalizePage, sanitizeView: sanitizeView, exportMarkdown: exportMarkdown, readingMinutes: readingMinutes };
}));
