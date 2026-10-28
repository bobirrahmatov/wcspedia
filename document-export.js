/* Structured, browser-side PDF and editable Word exports. No document HTML is executed. */
(function (root, factory) {
  'use strict';
  var commonJS = typeof module === 'object' && module.exports;
  var api = factory(root, commonJS ? require('./vendor/markdown-it-15.0.2.min.js') : root.WCSMarkdownIt,
    commonJS ? require('./editor-content.js') : root.WCSEditorContent);
  if (commonJS) module.exports = api; else root.WCSDocumentExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, MarkdownIt, content) {
  'use strict';
  var DEFAULTS = Object.freeze({
    pdfMakeUrl: './vendor/pdfmake-0.2.20.min.js',
    pdfFontsUrl: './vendor/pdfmake-0.2.20-vfs-fonts.js',
    docxUrl: './vendor/docx-9.5.1.iife.js',
    logoUrl: './assets/citi-logo.png', logoDataUrl: '', loadTimeout: 20000, allowCDN: false
  });
  var NAVY = '002D72', BLUE = '056DAE', GRAY = 'D9D9D9', PALE = 'EFF5F9';
  var NOTE = 'Always refer to the online document for the current approved version. Verify its version and approval status against the source before use.';
  var loads = new Map();
  function fail(message) { var error = new Error(message); error.code = 'DOCUMENT_EXPORT_FAILED'; throw error; }
  function text(value) { return value == null ? '' : String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function date(value) { if (!value) return 'Not recorded'; var d = new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) + ' (UTC)' : 'Not recorded'; }
  function person(id, people) { if (!id) return { name: 'Not recorded', soeid: 'Not recorded' }; var p = (people || []).find(function (item) { return item.id === id; }); return { name: text(p ? p.name : id), soeid: text(p && p.soeid ? p.soeid.toUpperCase() : 'Not recorded') }; }
  function absoluteUrl(value, base, image) {
    if (!content.safeUrl(value, image)) return null;
    if (/^#/.test(value)) return null;
    try { var url = new URL(value, base); return /^(https?:|file:)$/.test(url.protocol) ? url.href : null; } catch (_) { return null; }
  }
  function resource(value, version, base, image) {
    var match = /^attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(value || '');
    if (match) {
      var item = (image ? version.assets : version.attachments).find(function (asset) { return asset.id === match[1]; });
      if (!item) fail('The document refers to a missing ' + (image ? 'image' : 'attachment') + ': ' + match[1] + '.');
      value = image ? item.src : item.url;
    }
    if (image && /^data:image\/(png|jpeg|gif|webp);base64,/.test(value || '')) return value;
    if (!image && /^data:/.test(value || '')) return null;
    return absoluteUrl(value, base, image);
  }
  var parser = new MarkdownIt({ html: false, linkify: false, typographer: false, maxNesting: 30 });
  parser.validateLink = function (value) { return /^attachment:[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value) || content.safeUrl(value, false) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(value); };
  parser.inline.ruler.before('html_inline', 'wcs_export_underline', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== '<u>') return false;
    var end = state.src.indexOf('</u>', state.pos + 3);
    if (end < 0 || (state.env.underlineDepth || 0) > 15) return false;
    if (!silent) { var token = state.push('wcs_export_underline', '', 0); token.children = []; state.env.underlineDepth = (state.env.underlineDepth || 0) + 1; state.md.inline.parse(state.src.slice(state.pos + 3, end), state.md, state.env, token.children); state.env.underlineDepth--; }
    state.pos = end + 4; return true;
  });
  parser.inline.ruler.before('image', 'wcs_export_embed', function (state, silent) {
    var match = /^@\[embed\]\(([^\s<>]+)\)/.exec(state.src.slice(state.pos));
    if (!match || !content.safeUrl(match[1], true)) return false;
    if (!silent) { var token = state.push('wcs_export_embed', '', 0); token.content = match[1]; }
    state.pos += match[0].length; return true;
  });
  parser.inline.ruler.before('image', 'wcs_export_video', function (state, silent) {
    var match = content.videoToken(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) { var token = state.push('wcs_export_video', '', 0); token.meta = match.video; }
    state.pos += match.length; return true;
  });
  function bodyTree(markdown, version, base) {
    var tokens = parser.parse(markdown || '', {}), index = 0;
    function inline(items, inherited) {
      var state = Object.assign({}, inherited), stack = [], out = [];
      (items || []).forEach(function (token) {
        var props = { strong_open: 'bold', em_open: 'italic', s_open: 'strike' };
        if (props[token.type]) { stack.push(Object.assign({}, state)); state[props[token.type]] = true; }
        else if (/_close$/.test(token.type)) state = stack.pop() || {};
        else if (token.type === 'link_open') { stack.push(Object.assign({}, state)); state.href = resource(token.attrGet('href'), version, base, false); }
        else if (token.type === 'image') {
          var src = resource(token.attrGet('src'), version, base, true);
          if (!src) fail('An inline image has an unsupported URL.');
          out.push({ image: src, alt: text(token.content) || 'Document image' });
        } else if (token.type === 'wcs_export_underline') out = out.concat(inline(token.children, Object.assign({}, state, { underline: true })));
        else if (token.type === 'wcs_export_embed') out.push({ text: 'Open embedded resource', href: absoluteUrl(token.content, base, false) });
        else if (token.type === 'wcs_export_video') out.push(Object.assign({}, state, { text: 'Watch recording: ' + text(token.meta.title), href: absoluteUrl(token.meta.url, base, false) }));
        else if (token.type === 'code_inline') out.push(Object.assign({}, state, { text: token.content, code: true }));
        else if (token.type === 'softbreak' || token.type === 'hardbreak') out.push(Object.assign({}, state, { text: token.type === 'hardbreak' ? '\n' : ' ' }));
        else if (token.type === 'text') out.push(Object.assign({}, state, { text: text(token.content) }));
      }); return out;
    }
    function blocks(end) {
      var out = [];
      while (index < tokens.length) {
        var token = tokens[index++];
        if (token.type === end) break;
        if (token.type === 'heading_open' || token.type === 'paragraph_open') {
          var inToken = tokens[index++]; out.push({ type: token.type === 'heading_open' ? 'heading' : 'paragraph', level: Number(token.tag.slice(1)) || 0, runs: inline(inToken.children) }); index++;
        } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
          var items = [], closing = token.type.replace('_open', '_close');
          while (index < tokens.length && tokens[index].type !== closing) { if (tokens[index++].type === 'list_item_open') items.push(blocks('list_item_close')); }
          index++; out.push({ type: 'list', ordered: token.type === 'ordered_list_open', start: Number(token.attrGet('start')) || 1, items: items });
        } else if (token.type === 'blockquote_open') out.push({ type: 'quote', children: blocks('blockquote_close') });
        else if (token.type === 'table_open') {
          var rows = [], row, cell, isHeader = false;
          while (index < tokens.length && tokens[index].type !== 'table_close') {
            var t = tokens[index++];
            if (t.type === 'thead_open') isHeader = true;
            else if (t.type === 'thead_close') isHeader = false;
            else if (t.type === 'tr_open') row = { header: isHeader, cells: [] };
            else if (t.type === 'tr_close') rows.push(row);
            else if (t.type === 'th_open' || t.type === 'td_open') { cell = { runs: [], align: (t.attrGet('style') || '').replace('text-align:', '') || 'left' }; row.cells.push(cell); }
            else if (t.type === 'inline') cell.runs = inline(t.children);
          }
          index++; if (rows.length) out.push({ type: 'table', rows: rows });
        } else if (token.type === 'fence' || token.type === 'code_block') out.push({ type: 'code', text: text(token.content).replace(/\n$/, '') });
        else if (token.type === 'hr') out.push({ type: 'paragraph', runs: [{ text: '* * *' }] });
      } return out;
    }
    return blocks();
  }
  function buildModel(options) {
    options = options || {}; var doc = options.doc, version = options.version;
    if (!doc || !version || !text(doc.id).trim() || !text(version.title).trim()) fail('Select a document version to export.');
    if (!Number.isSafeInteger(version.version) || version.version < 1 || !Number.isSafeInteger(version.revision) || version.revision < 1) fail('The document version and revision must be valid before export.');
    var base = options.sourceUrl || (root.location && root.location.href);
    var sourceUrl;
    try { var source = new URL(base); if (/^(https?:|file:)$/.test(source.protocol) && !source.username && !source.password) sourceUrl = source.href; } catch (_) {}
    if (!sourceUrl) fail('A valid source document URL is required for export.');
    var v = Object.assign({}, version, { assets: content.validateAssets(version.assets || []), attachments: content.validateAttachments(version.attachments || []) });
    if (v.cover) v.cover = content.validateCover(v.cover);
    var body = typeof v.bodyMarkdown === 'string' ? v.bodyMarkdown : content.fromSections(v.sections || []);
    if (body.length > 200000) fail('The document exceeds the supported export size.');
    if (body.trim()) content.validateReferences(body, v);
    var owner = person(doc.ownerId, options.people), author = person(doc.authorId || version.createdBy, options.people);
    var reviewed = person(version.reviewedBy, options.people), approved = person(version.approvedBy, options.people);
    var current = doc.publishedVersion === version.version && version.status === 'Published' && options.isCurrentPublished !== false;
    var model = {
      title: text(version.title), summary: text(version.summary), type: text(doc.type), reference: text(doc.reference || doc.id), key: text(doc.id), version: version.version, revision: version.revision,
      status: text(version.status), isCurrentPublished: current, sourceUrl: sourceUrl, exportedAt: date(options.exportedAt || new Date().toISOString()),
      business: text(options.areaLabel || doc.area || 'Not recorded'), owner: owner, author: author,
      versionDate: date(options.revisionAt || version.updatedAt || version.createdAt), versionDateLabel: options.revisionAt || version.updatedAt ? 'Revision date' : 'Version created',
      effectiveAt: date(version.effectiveAt), nextReviewAt: date(version.nextReviewAt),
      review: { name: reviewed.name, soeid: reviewed.soeid, date: date(version.reviewedAt) },
      approval: { name: approved.name, soeid: approved.soeid, date: date(version.approvedAt) },
      blocks: bodyTree(body, v, sourceUrl), highlights: (version.highlights || []).map(text),
      cover: v.cover ? { image: resource(v.cover.src, v, sourceUrl, true), alt: v.cover.alt, caption: v.cover.caption } : null,
      attachments: v.attachments.map(function (file) { return { name: file.name, href: resource(file.url, v, sourceUrl, false), local: /^data:/.test(file.url) }; }),
      tags: ['tags', 'processes', 'regions'].map(function (kind) { return { label: kind.charAt(0).toUpperCase() + kind.slice(1), values: content.validateTags(version[kind] || [], kind) }; }).filter(function (group) { return group.values.length; }),
      governance: content.governanceDetails(version),
      note: NOTE
    };
    return model;
  }
  function controlRows(m) {
    var rows = [
      [['Document reference', m.reference], ['Version / revision', m.version + ' / ' + m.revision]],
      [['Business area', m.business], ['Status', m.status + (m.isCurrentPublished ? ' - current approved version' : ' - not the current approved version')]],
      [['Document owner', m.owner.name + ' (' + m.owner.soeid + ')'], ['Author', m.author.name + ' (' + m.author.soeid + ')']],
      [[m.versionDateLabel, m.versionDate], ['Effective date', m.effectiveAt]],
      [['Next scheduled review', m.nextReviewAt], ['Export date', m.exportedAt]]
    ];
    if (m.governance) rows.push([['Document classification', m.governance.classification], ['Owning team', m.governance.owningTeam]]);
    return rows;
  }
  function pdfRuns(runs) { return (runs || []).filter(function (run) { return !run.image; }).map(function (run) { return { text: run.text || '', bold: run.bold || undefined, italics: run.italic || undefined, decoration: [run.underline ? 'underline' : '', run.strike ? 'lineThrough' : ''].filter(Boolean), color: run.href ? '#' + BLUE : undefined, link: run.href || undefined, background: run.code ? '#F0F3F6' : undefined }; }); }
  function requireMedia(media, src) { if (!media || !media[src]) fail('A document image could not be included. Please retry after it is available.'); return media[src]; }
  function pdfParagraph(runs, media, settings, maxWidth) {
    var parts = [], buffer = [];
    function flush() { if (buffer.length) { parts.push(Object.assign({ text: pdfRuns(buffer), margin: [0, 0, 0, 8] }, settings)); buffer = []; } }
    (runs || []).forEach(function (run) { if (run.image) { flush(); parts.push({ image: requireMedia(media, run.image).dataUrl, fit: [maxWidth || 480, 350], margin: [0, 6, 0, 8] }); if (run.alt) parts.push({ text: run.alt, style: 'caption' }); } else buffer.push(run); }); flush();
    return parts.length ? parts : [{ text: '' }];
  }
  function pdfBlocks(blocks, media) {
    return blocks.reduce(function (out, block) {
      if (block.type === 'paragraph' || block.type === 'heading') out = out.concat(pdfParagraph(block.runs, media, block.type === 'heading' ? { style: 'heading' + Math.min(block.level, 3), headlineLevel: block.level, margin: [0, 14, 0, 7] } : {}));
      else if (block.type === 'code') out.push({ text: block.text, fontSize: 9, preserveLeadingSpaces: true, margin: [8, 4, 8, 12], background: '#F0F3F6' });
      else if (block.type === 'quote') out.push({ stack: pdfBlocks(block.children, media), italics: true, margin: [14, 4, 0, 8] });
      else if (block.type === 'list') { var list = {}; list[block.ordered ? 'ol' : 'ul'] = block.items.map(function (item) { return { stack: pdfBlocks(item, media) }; }); if (block.ordered) list.start = block.start; list.margin = [0, 0, 0, 8]; out.push(list); }
      else if (block.type === 'table') {
        var count = block.rows[0].cells.length;
        var keepRows = block.rows.every(function (row) { return row.cells.every(function (cell) { return cell.runs.reduce(function (n, r) { return n + (r.text || '').length; }, 0) < Math.max(120, 1200 / count); }); });
        out.push({ table: { headerRows: block.rows[0].header ? 1 : 0, dontBreakRows: keepRows, widths: Array(count).fill('*'), body: block.rows.map(function (row, i) { return row.cells.map(function (cell) { return { stack: pdfParagraph(cell.runs, media, { margin: [0, 0, 0, 0] }, Math.max(10, 499 / count - 17)), bold: row.header, color: '#222222', fillColor: row.header ? '#' + PALE : (i % 2 ? '#FFFFFF' : '#F8FAFC'), alignment: cell.align }; }); }) }, layout: tableLayout(), fontSize: count > 5 ? 8 : 9.5, margin: [0, 7, 0, 14] });
      }
      return out;
    }, []);
  }
  function tableLayout() { return { hLineWidth: function () { return .5; }, vLineWidth: function () { return .5; }, hLineColor: function () { return '#' + GRAY; }, vLineColor: function () { return '#' + GRAY; }, paddingLeft: function () { return 8; }, paddingRight: function () { return 8; }, paddingTop: function () { return 7; }, paddingBottom: function () { return 7; } }; }
  function pdfDefinition(m, media) {
    if (!media || !media.logo) fail('The Citi logo is required for document export.');
    var nodes = [
      { image: media.logo.dataUrl, fit: [114, 72], alignment: 'center', margin: [0, 24, 0, 36] },
      { text: m.title, style: 'title', alignment: 'center', margin: [0, 0, 0, 10] },
      { text: m.type + ' | Wealth Credit Services', alignment: 'center', fontSize: 11, color: '#4D6072', margin: [0, 0, 0, 28] },
      { table: { widths: ['*', '*'], body: controlRows(m).map(function (row) { return row.map(function (cell) { return { stack: [{ text: cell[0], bold: true, fontSize: 9, margin: [0, 0, 0, 4] }, { text: cell[1], fontSize: 10 }] }; }); }) }, layout: tableLayout(), margin: [0, 0, 0, 18] },
      { table: { headerRows: 1, widths: [66, '*', 76, 90], body: [[{ text: 'Role', bold: true, fillColor: '#' + PALE }, { text: 'Name', bold: true, fillColor: '#' + PALE }, { text: 'SOEID', bold: true, fillColor: '#' + PALE }, { text: 'Date', bold: true, fillColor: '#' + PALE }], ['Reviewed by', m.review.name, m.review.soeid, m.review.date], ['Approved by', m.approval.name, m.approval.soeid, m.approval.date]] }, layout: tableLayout(), fontSize: 9, margin: [0, 0, 0, 16] },
      { text: [{ text: 'Document control note: ', bold: true }, { text: m.note }], fontSize: 9, margin: [0, 0, 0, 9] },
      { text: 'Open source document', link: m.sourceUrl, color: '#' + BLUE, decoration: 'underline', fontSize: 9 },
      { text: m.title, style: 'heading1', pageBreak: 'before', margin: [0, 0, 0, 12] }
    ];
    if (m.summary) nodes.push({ text: m.summary, fontSize: 11, margin: [0, 0, 0, 16] });
    if (m.cover) { nodes.push({ image: requireMedia(media, m.cover.image).dataUrl, fit: [480, 260], margin: [0, 0, 0, 8] }); if (m.cover.caption) nodes.push({ text: m.cover.caption, style: 'caption' }); }
    if (m.highlights.length) nodes.push({ text: 'Key highlights', style: 'heading2' }, { ul: m.highlights, margin: [0, 4, 0, 12] });
    nodes = nodes.concat(pdfBlocks(m.blocks, media));
    if (m.attachments.length) { nodes.push({ text: 'Attachments', style: 'heading2', margin: [0, 14, 0, 8] }); m.attachments.forEach(function (a) { nodes.push({ text: a.name + (a.local ? ' - available in the source document' : ''), link: a.href || m.sourceUrl, color: '#' + BLUE, margin: [0, 0, 0, 6] }); }); }
    m.tags.forEach(function (group) { nodes.push({ text: [{ text: group.label + ': ', bold: true }, { text: group.values.join(', ') }], fontSize: 9, margin: [0, 8, 0, 0] }); });
    if (m.governance) {
      nodes.push({ text: 'Governance', style: 'heading2', headlineLevel: 2, pageBreak: 'before', margin: [0, 20, 0, 10] });
      m.governance.rows.forEach(function (row) { nodes.push({ text: [{ text: row[0] + ': ', bold: true }, { text: row[1] }], margin: [0, 0, 0, 8] }); });
      nodes.push({ text: m.governance.notice, style: 'caption' });
      m.governance.sources.forEach(function (source, index) {
        var reference = [];
        if (index === 0) reference.push({ text: 'Authoritative sources', style: 'heading3', margin: [0, 12, 0, 8] });
        reference.push({ text: (index + 1) + '. ' + source.title, link: source.url || undefined, color: source.url ? '#' + BLUE : '#222222', bold: true, margin: [0, 6, 0, 4] });
        reference.push({ text: 'Source ID: ' + source.id + '\nVersion: ' + source.version + '\nLast verified: ' + source.lastVerifiedAt + (source.url ? '\n' + source.url : '\nSource URL: Not recorded'), fontSize: 9, margin: [12, 0, 0, 10] });
        nodes.push({ stack: reference, unbreakable: true });
      });
    }
    return { pageSize: 'A4', pageMargins: [48, 42, 48, 52], info: { title: m.title, author: m.author.name, subject: m.reference + ' version ' + m.version + ' revision ' + m.revision, creator: 'WCSpedia' }, defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.2, color: '#222222' }, styles: { title: { fontSize: 21, bold: true, color: '#000000' }, heading1: { fontSize: 18, bold: true, color: '#000000' }, heading2: { fontSize: 14, bold: true, color: '#000000' }, heading3: { fontSize: 12, bold: true, color: '#000000' }, caption: { fontSize: 8.5, italics: true, color: '#4D6072', margin: [0, 0, 0, 12] } }, content: nodes,
      footer: function (page, pages) { return { columns: [{ text: m.reference + ' | v' + m.version + ' r' + m.revision, width: '*' }, { text: page + ' / ' + pages, alignment: 'right', width: '*' }], fontSize: 8, color: '#52667B', margin: [48, 15, 48, 0] }; },
      pageBreakBefore: function (node, following) { return !!node.headlineLevel && following.length === 0; }
    };
  }
  function bytes(dataUrl) { var encoded = dataUrl.split(',')[1], binary = root.atob ? root.atob(encoded) : Buffer.from(encoded, 'base64').toString('binary'); return Uint8Array.from(binary, function (c) { return c.charCodeAt(0); }); }
  function wordDocument(m, media, d) {
    if (!d || !d.Document || !d.Packer) fail('The Word export library is unavailable.');
    if (!media || !media.logo) fail('The Citi logo is required for document export.');
    var pageWidth = 9980, listCounter = 0, numbering = [];
    function imageRun(src, maxWidth, maxHeight, alt) {
      var item = requireMedia(media, src), scale = Math.min(maxWidth / item.width, maxHeight / item.height, 1);
      return new d.ImageRun({ type: /^data:image\/jpeg/.test(item.dataUrl) ? 'jpg' : 'png', data: bytes(item.dataUrl), transformation: { width: Math.max(1, Math.round(item.width * scale)), height: Math.max(1, Math.round(item.height * scale)) }, altText: { title: alt || 'Document image', description: alt || 'Document image', name: alt || 'Document image' } });
    }
    function runs(values, settings) {
      return (values || []).reduce(function (out, r) {
        if (r.image) { out.push(imageRun(r.image, settings && settings.imageWidth || 610, 420, r.alt)); return out; }
        var parts = (r.text || '').split('\n').map(function (part, index) { return new d.TextRun(Object.assign({}, settings, { text: part, break: index ? 1 : undefined, bold: r.bold || (settings && settings.bold) || undefined, italics: r.italic || undefined, strike: r.strike || undefined, underline: r.underline || r.href ? { type: d.UnderlineType.SINGLE } : undefined, font: r.code ? 'Courier New' : 'Arial', color: r.href ? BLUE : ((settings && settings.color) || undefined) })); });
        if (r.href) out.push(new d.ExternalHyperlink({ link: r.href, children: parts })); else out = out.concat(parts); return out;
      }, []);
    }
    function para(values, options) { return new d.Paragraph(Object.assign({ children: runs(values), spacing: { after: 140, line: 280 } }, options)); }
    function plain(value, options) { return para([{ text: text(value) }], options); }
    var border = { style: d.BorderStyle.SINGLE, size: 4, color: GRAY };
    function table(rows, widths, header) {
      return new d.Table({ width: { size: pageWidth, type: d.WidthType.DXA }, columnWidths: widths, layout: d.TableLayoutType.FIXED,
        rows: rows.map(function (row, index) { return new d.TableRow({ tableHeader: header && index === 0, cantSplit: true, children: row.map(function (cell, col) { return new d.TableCell({ width: { size: widths[col], type: d.WidthType.DXA }, margins: { top: 110, bottom: 110, left: 120, right: 120 }, verticalAlign: d.VerticalAlign.CENTER, borders: { top: border, bottom: border, left: border, right: border }, shading: { fill: header && index === 0 ? PALE : (index % 2 ? 'FFFFFF' : 'F8FAFC') }, children: Array.isArray(cell) ? cell : [para([{ text: cell, bold: header && index === 0 }], { spacing: { after: 0, line: 250 } })] }); }) }); }) });
    }
    function blocks(list, level) {
      return list.reduce(function (out, block) {
        if (block.type === 'heading') out.push(para(block.runs, { heading: [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][Math.min(block.level, 3) - 1], keepNext: true, spacing: { before: 220, after: 100 } }));
        else if (block.type === 'paragraph') out.push(para(block.runs));
        else if (block.type === 'quote') out = out.concat(blocks(block.children.map(function (child) { return child.runs ? Object.assign({}, child, { runs: child.runs.map(function (r) { return Object.assign({ italic: true }, r); }) }) : child; }), level));
        else if (block.type === 'code') out.push(new d.Paragraph({ children: runs([{ text: block.text, code: true }], { size: 18 }), spacing: { after: 180 }, indent: { left: 120 } }));
        else if (block.type === 'table') {
          var count = block.rows[0].cells.length, width = Math.floor(pageWidth / count);
          out.push(table(block.rows.map(function (row) { return row.cells.map(function (cell) { return [new d.Paragraph({ children: runs(cell.runs, { bold: row.header, size: count > 5 ? 16 : 19, imageWidth: Math.max(10, width / 15 - 16) }), alignment: cell.align, spacing: { after: 0, line: 240 } })]; }); }), Array(count).fill(width), block.rows[0].header), plain('', { spacing: { after: 120 } }));
        } else if (block.type === 'list') {
          var reference = 'wcs-list-' + (++listCounter), depth = Math.min(level || 0, 8);
          numbering.push({ reference: reference, levels: [{ level: depth, format: block.ordered ? d.LevelFormat.DECIMAL : d.LevelFormat.BULLET, text: block.ordered ? '%' + (depth + 1) + '.' : '\u2022', start: block.start, alignment: d.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + depth * 360, hanging: 240 } } } }] });
          block.items.forEach(function (item) { var numbered = false; item.forEach(function (child) { if (!numbered && child.type === 'paragraph') { out.push(para(child.runs, { numbering: { reference: reference, level: depth }, spacing: { after: 100, line: 280 } })); numbered = true; } else out = out.concat(blocks([child], depth + 1)); }); });
        } return out;
      }, []);
    }
    var coverRows = controlRows(m).map(function (row) { return row.map(function (cell) { return [new d.Paragraph({ children: [new d.TextRun({ text: cell[0], bold: true, size: 18, color: '222222' })], spacing: { after: 60 } }), plain(cell[1], { spacing: { after: 0, line: 250 } })]; }); });
    var nodes = [new d.Paragraph({ children: [imageRun('logo', 152, 96, 'Citi')], alignment: d.AlignmentType.CENTER, spacing: { before: 380, after: 540 } }),
      plain(m.title, { style: 'Title', alignment: d.AlignmentType.CENTER, spacing: { after: 160 } }),
      plain(m.type + ' | Wealth Credit Services', { alignment: d.AlignmentType.CENTER, spacing: { after: 420 } }),
      table(coverRows, [4990, 4990], false), plain('', { spacing: { after: 100 } }),
      table([['Role', 'Name', 'SOEID', 'Date'], ['Reviewed by', m.review.name, m.review.soeid, m.review.date], ['Approved by', m.approval.name, m.approval.soeid, m.approval.date]], [1600, 3800, 1900, 2680], true),
      plain('', { spacing: { after: 60 } }), para([{ text: 'Document control note: ', bold: true }, { text: m.note }], { spacing: { after: 120, line: 250 } }),
      para([{ text: 'Open source document', href: m.sourceUrl }]),
      plain(m.title, { heading: d.HeadingLevel.HEADING_1, pageBreakBefore: true, keepNext: true, spacing: { after: 180 } })];
    if (m.summary) nodes.push(plain(m.summary));
    if (m.cover) { nodes.push(para([{ image: m.cover.image, alt: m.cover.alt }])); if (m.cover.caption) nodes.push(para([{ text: m.cover.caption, italic: true }])); }
    if (m.highlights.length) nodes.push(plain('Key highlights', { heading: d.HeadingLevel.HEADING_2 }), ...blocks([{ type: 'list', ordered: false, start: 1, items: m.highlights.map(function (h) { return [{ type: 'paragraph', runs: [{ text: h }] }]; }) }]));
    nodes = nodes.concat(blocks(m.blocks));
    if (m.attachments.length) { nodes.push(plain('Attachments', { heading: d.HeadingLevel.HEADING_2, keepNext: true })); m.attachments.forEach(function (a) { nodes.push(para([{ text: a.name + (a.local ? ' - available in the source document' : ''), href: a.href || m.sourceUrl }])); }); }
    m.tags.forEach(function (g) { nodes.push(para([{ text: g.label + ': ', bold: true }, { text: g.values.join(', ') }])); });
    if (m.governance) {
      nodes.push(plain('Governance', { heading: d.HeadingLevel.HEADING_2, pageBreakBefore: true, keepNext: true }));
      m.governance.rows.forEach(function (row) { nodes.push(para([{ text: row[0] + ': ', bold: true }, { text: row[1] }])); });
      nodes.push(para([{ text: m.governance.notice, italic: true }]));
      if (m.governance.sources.length) nodes.push(plain('Authoritative sources', { heading: d.HeadingLevel.HEADING_3, keepNext: true }));
      m.governance.sources.forEach(function (source, index) {
        nodes.push(para([{ text: (index + 1) + '. ' + source.title, href: source.url || undefined, bold: true }], { keepNext: true }));
        nodes.push(plain('Source ID: ' + source.id + '\nVersion: ' + source.version + '\nLast verified: ' + source.lastVerifiedAt));
        nodes.push(para([{ text: source.url || 'Source URL: Not recorded', href: source.url || undefined }]));
      });
    }
    return new d.Document({ title: m.title, creator: m.author.name, subject: m.reference + ' version ' + m.version + ' revision ' + m.revision, description: 'Exported from WCSpedia. ' + NOTE, numbering: { config: numbering }, styles: { default: { document: { run: { font: 'Arial', size: 21, color: '222222' }, paragraph: { spacing: { after: 140, line: 280 } } }, title: { run: { font: 'Arial', size: 42, bold: true, color: '000000' } }, heading1: { run: { font: 'Arial', size: 36, bold: true, color: '000000' } }, heading2: { run: { font: 'Arial', size: 28, bold: true, color: '000000' } }, heading3: { run: { font: 'Arial', size: 24, bold: true, color: '000000' } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 840, bottom: 1040, left: 963, right: 963, footer: 480 } } }, footers: { default: new d.Footer({ children: [new d.Paragraph({ children: [new d.TextRun({ text: m.reference + ' | v' + m.version + ' r' + m.revision + '   ', size: 16, color: '52667B' }), new d.TextRun({ children: [d.PageNumber.CURRENT, ' / ', d.PageNumber.TOTAL_PAGES], size: 16, color: '52667B' })], alignment: d.AlignmentType.CENTER })] }) }, children: nodes }] });
  }
  function script(url, timeout) {
    if (!root.document) return Promise.reject(new Error('Export libraries must be loaded in a browser.'));
    if (!content.safeUrl(url, false) || /^#/.test(url)) return Promise.reject(new Error('An export library URL is invalid.'));
    if (root.WCSLibraryLoader) return root.WCSLibraryLoader.load(url, timeout);
    if (loads.has(url)) return loads.get(url);
    var promise = new Promise(function (resolve, reject) {
      var node = root.document.createElement('script'), timer;
      function finish(error) { clearTimeout(timer); node.onload = node.onerror = null; if (error) { node.remove(); reject(new Error(error)); } else resolve(); }
      node.src = url; node.async = true; node.setAttribute('data-wcs-export-library', '');
      node.onload = function () { finish(); }; node.onerror = function () { finish('The export library could not be loaded. Check the configured Confluence attachment URL.'); };
      timer = setTimeout(function () { finish('The export library timed out. Please retry.'); }, timeout);
      root.document.head.appendChild(node);
    }); loads.set(url, promise); promise.catch(function () { loads.delete(url); }); return promise;
  }
  function libraryUrl(value, config) {
    var url;
    try { url = new URL(value, root.location && root.location.href); } catch (_) { fail('An export library URL is invalid.'); }
    var same = root.location && url.origin === root.location.origin;
    if (!same) fail('Export libraries must use a same-origin attachment.');
    return value;
  }
  async function libraries(format, config) {
    if (format === 'docx') { if (!root.docx) await script(libraryUrl(config.docxUrl, config), config.loadTimeout); if (!root.docx || !root.docx.Packer) fail('The Word export library did not initialize.'); return root.docx; }
    if (!root.pdfMake) await script(libraryUrl(config.pdfMakeUrl, config), config.loadTimeout);
    if (config.pdfFontsUrl) await script(libraryUrl(config.pdfFontsUrl, config), config.loadTimeout);
    if (!root.pdfMake || !root.pdfMake.createPdf) fail('The PDF export library did not initialize.'); return root.pdfMake;
  }
  async function raster(src, logo, timeout) {
    if (!src) fail('Configure the Citi logo attachment before exporting.');
    if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(src)) {
      if (!content.safeUrl(src, true) || /^#/.test(src)) fail('An export image URL is invalid.');
      if (logo && root.location && new URL(src, root.location.href).origin !== root.location.origin) fail('Host the approved Citi logo on the same origin as WCSpedia.');
      var abort = new AbortController(), timer = setTimeout(function () { abort.abort(); }, timeout), response;
      try { response = await root.fetch(src, { credentials: 'same-origin', signal: abort.signal }); if (!response.ok) fail('An export image could not be loaded (' + response.status + ').');
        var max = 5 * 1024 * 1024, blob;
        if (response.headers && Number(response.headers.get('content-length')) > max) fail('Export images must be 5 MB or smaller.');
        if (response.body && response.body.getReader) { var reader = response.body.getReader(), chunks = [], length = 0; while (true) { var part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > max) { await reader.cancel(); fail('Export images must be 5 MB or smaller.'); } chunks.push(part.value); } blob = new Blob(chunks, { type: (response.headers.get('content-type') || '').split(';')[0] }); }
        else blob = await response.blob();
        if (blob.size > max) fail('Export images must be 5 MB or smaller.');
        if (logo && /image\/svg\+xml/.test(blob.type)) { var svg = await blob.text(); if (/<(?:script|foreignObject|iframe|style)|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\s*\(|<!DOCTYPE|<!ENTITY/i.test(svg)) fail('Use a self-contained, approved Citi SVG or PNG logo.'); }
        else if (!/^image\/(png|jpeg|gif|webp)$/.test(blob.type)) fail('Use PNG, JPEG, GIF or WebP images in the exported document.');
        src = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('An export image could not be read.')); }; reader.readAsDataURL(blob); });
      } catch (error) { if (error.name === 'AbortError') fail('An export image timed out. Please retry.'); throw error; } finally { clearTimeout(timer); }
    }
    return new Promise(function (resolve, reject) {
      var img = new root.Image(), timer = setTimeout(function () { reject(new Error('An export image timed out.')); }, timeout);
      img.onload = function () { clearTimeout(timer); try { if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 25000000) fail('An export image has unsupported dimensions.'); var scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight)); var canvas = root.document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale)); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }); } catch (error) { reject(error); } };
      img.onerror = function () { clearTimeout(timer); reject(new Error('A document image could not be decoded. The export was not created.')); }; img.src = src;
    });
  }
  async function prepareMedia(model, config) {
    var srcs = new Set(), media = Object.create(null);
    function walk(blocks) { blocks.forEach(function (b) { (b.runs || []).forEach(function (r) { if (r.image) srcs.add(r.image); }); if (b.children) walk(b.children); if (b.items) b.items.forEach(walk); if (b.rows) b.rows.forEach(function (row) { row.cells.forEach(function (cell) { cell.runs.forEach(function (r) { if (r.image) srcs.add(r.image); }); }); }); }); }
    walk(model.blocks); if (model.cover) srcs.add(model.cover.image);
    media.logo = await raster(config.logoDataUrl || config.logoUrl, true, config.loadTimeout);
    for (var src of srcs) media[src] = await raster(src, false, config.loadTimeout);
    return media;
  }
  function filename(m, format) { return (m.reference + '-' + m.title).normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) + '-v' + m.version + '-r' + m.revision + '.' + format; }
  async function loadMDXTemplate(config, options) {
    config = config || {}; options = options || {};
    var base = new URL(options.baseUrl || root.location.href), hosted = config.mode === 'confluence';
    var target = config.exports && config.exports.mdxTemplateUrl;
    if (!target && hosted) {
      var pageId = String(config.attachmentPageId || config.rootPageId || '');
      if (!/^[1-9]\d*$/.test(pageId)) fail('Set attachmentPageId to the page hosting wcspedia-document.mdx.');
      target = (config.contextPath || '').replace(/\/+$/, '') + '/download/attachments/' + pageId + '/wcspedia-document.mdx?api=v2';
    }
    var url = new URL(target || './templates/wcspedia-document.mdx', base);
    if (url.origin !== base.origin || url.username || url.password || !/^https?:$/.test(url.protocol) || !/\.mdx$/i.test(url.pathname)) fail('The MDX template must be a .mdx file on the same Confluence site or local preview server.');
    // Older macros may still contain cache/revision suffixes. Hosted templates
    // always mean the latest attachment, while local URLs remain untouched.
    if (hosted && url.pathname.startsWith((config.contextPath || '').replace(/\/+$/, '') + '/download/attachments/')) {
      url.searchParams.delete('version');
      url.searchParams.delete('v');
    }
    var controller = new AbortController(), timer, cancel;
    var aborted = function () { var error = new Error('MDX template download cancelled.'); error.name = 'AbortError'; return error; };
    if (options.signal && options.signal.aborted) throw aborted();
    var stop = new Promise(function (_, reject) {
      cancel = function () { controller.abort(); reject(aborted()); };
      if (options.signal) options.signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(function () { controller.abort(); reject(new Error('MDX template download timed out. Check the attachment and retry.')); }, 12000);
    });
    try {
      return await Promise.race([stop, (async function () {
        var response = await root.fetch(url.href, { credentials: 'same-origin', cache: 'no-cache', signal: controller.signal });
        if (!response.ok) fail('Could not download the MDX template (HTTP ' + response.status + '). Upload wcspedia-document.mdx to the configured attachments page and check access.');
        if (response.url && new URL(response.url, base).origin !== base.origin) fail('The MDX template redirected outside this site. Check the attachment URL.');
        if (Number(response.headers.get('content-length')) > 128000) fail('The MDX template is too large. Use the supplied document template.');
        var value = await response.text();
        if (!value.trim() || value.length > 128000 || /text\/html/i.test(response.headers.get('content-type') || '')) fail('The attachment did not return an MDX template. Check your Confluence sign-in and upload wcspedia-document.mdx.');
        var parsed;
        try { parsed = content.normalizeImport(value, { assets: [], attachments: [] }); }
        catch (_) { fail('The hosted MDX template does not match the WCSpedia import format. Replace it with the supplied wcspedia-document.mdx.'); }
        if (!parsed.metadata) fail('The hosted MDX template needs the wcspedia-mdx-v1 metadata block.');
        if (controller.signal.aborted) throw aborted();
        return value;
      })()]);
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', cancel);
    }
  }
  function create(options) {
    var config = Object.assign({}, DEFAULTS, options && options.config), model = buildModel(options), busy = false;
    async function generate(format) {
      if (!['pdf', 'docx'].includes(format)) fail('Choose PDF or Word export.');
      var library = await libraries(format, config), media = await prepareMedia(model, config);
      if (format === 'docx') return library.Packer.toBlob(wordDocument(model, media, library));
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(new Error('PDF generation timed out. The export was not created.')); }, 60000);
        // All fonts are preloaded in the VFS and every image is already a data
        // URL. The pinned synchronous stream path catches layout/font errors;
        // pdfmake 0.2's callback getBlob otherwise loses asynchronous rejections.
        try { var chunks = [], stream = library.createPdf(pdfDefinition(model, media)).getStream();
          stream.on('data', function (chunk) { chunks.push(chunk); });
          stream.on('error', function (error) { clearTimeout(timer); reject(error); });
          stream.on('end', function () { clearTimeout(timer); resolve(new Blob(chunks, { type: 'application/pdf' })); }); stream.end();
        } catch (error) { clearTimeout(timer); reject(error); }
      });
    }
    return Object.freeze({ model: model, generate: generate, prepare: async function (format) { var blob = await generate(format); if (!blob || !blob.size) fail('The generated document is empty.'); return { blob: blob, filename: filename(model, format), mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }; }, download: async function (format) {
      if (busy) fail('An export is already being prepared.'); busy = true;
      try { var blob = await generate(format); if (!blob || !blob.size) fail('The generated document is empty.'); var url = root.URL.createObjectURL(blob), a = root.document.createElement('a'); a.href = url; a.download = filename(model, format); root.document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { root.URL.revokeObjectURL(url); }, 60000); return { filename: filename(model, format), size: blob.size }; } finally { busy = false; }
    } });
  }
  return Object.freeze({ DEFAULTS: DEFAULTS, create: create, buildModel: buildModel, pdfDefinition: pdfDefinition, wordDocument: wordDocument, filename: filename, loadMDXTemplate: loadMDXTemplate });
});
