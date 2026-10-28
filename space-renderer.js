/* Browser-safe native Confluence storage renderer. Adapted from confluence-storage.cjs.
 * This only validates/renders; native permissions remain enforced by Confluence.
 * User content cannot inject raw HTML or executable scripts. Styling uses
 * native labels/markers and the shared stylesheet, without host JS calls. */
(function(root,factory){
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./vendor/markdown-it-15.0.2.min.js') : root.WCSMarkdownIt,
    node ? require('./editor-content.js') : root.WCSEditorContent,
    node ? require('node:crypto').webcrypto : root.crypto,
    value => node ? Buffer.from(value,'base64').toString('binary') : root.atob(value),
    value => node ? Buffer.from(value,'binary').toString('base64') : root.btoa(value));
  if(node) module.exports=api; else root.WCSSpaceRenderer=api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(MarkdownIt,content,crypto,decodeBase64,encodeBase64){
'use strict';
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const STATUSES = new Set(['Draft', 'In review', 'Changes requested', 'Awaiting approval', 'Published']);
function fail(message) { const error = new Error(message); error.code = 'CONFLUENCE_STORAGE_INVALID'; throw error; }
function plain(value) {
  const result = value == null ? '' : String(value);
  for (const point of result) { const code = point.codePointAt(0); if (code !== 9 && code !== 10 && code !== 13 && (code < 32 || (code >= 0xD800 && code <= 0xDFFF) || code === 0xFFFE || code === 0xFFFF)) fail('Document text contains a character unsupported by XML.'); }
  return result;
}
function xml(value) { return plain(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]); }
function cdata(value) { return '<![CDATA[' + plain(value).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>'; }
function has(object, key) { return object && Object.prototype.hasOwnProperty.call(object, key); }
function mapping(options, key, source) { const media = options.media || {}; return has(media, key) ? media[key] : has(media, source) ? media[source] : null; }
function filename(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 180 || /[\/\\<>:\u0000-\u001f\u007f]/.test(value) || value === '.' || value === '..') fail('A staged resource needs a plain Confluence attachment filename of at most 180 characters.');
  return value;
}
function staged(options, key, source) { const item = mapping(options, key, source); if (!item || typeof item !== 'object') fail('Stage the document image or file as a Confluence attachment before publication: ' + key + '.'); return filename(item.fileName); }
function bodyOf(version) {
  const body = typeof version.bodyMarkdown === 'string' ? version.bodyMarkdown : content.fromSections(version.sections || []);
  if (!body.trim() || body.length > 200000) fail('A document body of 1–200,000 characters is required.');
  plain(body); content.validateReferences(body, version); return body;
}
function snapshot(document, version) {
  if (!document || !version || typeof document.id !== 'string' || !document.id.trim()) fail('A stable document key is required.');
  if (!Number.isSafeInteger(version.version) || version.version < 1 || !Number.isSafeInteger(version.revision) || version.revision < 1) fail('Select a valid document version and revision.');
  if (!STATUSES.has(version.status) || typeof version.title !== 'string' || !version.title.trim()) fail('Select a titled document snapshot with a valid workflow status.');
  const assets = content.validateAssets(version.assets || []), attachments = content.validateAttachments(version.attachments || []);
  const sourceMetadata = has(version, 'sourceMetadata') ? content.validateSourceMetadata(version.sourceMetadata) : null;
  if (sourceMetadata) {
    if (typeof version.sourceImportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version.sourceImportedAt) || !Number.isFinite(Date.parse(version.sourceImportedAt)) || new Date(version.sourceImportedAt).toISOString() !== version.sourceImportedAt) fail('Source import time must be a recorded UTC action timestamp.');
  } else if (version.sourceImportedAt != null) fail('Source import time requires source metadata.');
  const ids = new Set(); assets.concat(attachments).forEach(item => { if (ids.has(item.id)) fail('Image and attachment IDs must be unique.'); ids.add(item.id); });
  return { ...version, commentsEnabled: content.validateCommentsEnabled(version.commentsEnabled), sourceMetadata, assets, attachments, cover: content.validateCover(version.cover || null) };
}
// Public reader snapshot shares the native body revision. Never copy a working
// document, audit trail, governance review or another version into this payload.
function readerPayload(document, version, people, options) {
  const doc = {}, v = {};
  ['id','reference','type','area','publicationMode','ownerId','authorId','reviewerId','approverId'].forEach(k => { if (document[k] != null) doc[k] = document[k]; });
  ['version','revision','title','summary','status','bodyMarkdown','sections','highlights','tags','processes','regions','commentsEnabled','createdAt','createdBy','publishedAt','approvedAt','approvedBy','reviewedAt','reviewedBy','effectiveAt','nextReviewAt','governance','sourceMetadata','sourceImportedAt'].forEach(k => { if (version[k] != null) v[k] = version[k]; });
  const mapped = (key, source) => { const item = mapping(options, key, source); if (!item || !item.url) fail('The published reader resource must be staged.'); return item.url; };
  v.assets = (version.assets || []).map(a => ({id:a.id,alt:a.alt,src:mapped(a.id,a.src)}));
  v.attachments = (version.attachments || []).map(a => ({id:a.id,name:a.name,mimeType:a.mimeType,size:a.size,url:mapped(a.id,a.url)}));
  v.cover = version.cover ? {...version.cover,src:mapped('$cover',version.cover.src)} : null;
  // Inline images also need the public copy, never the restricted working URL.
  Object.values(options.media || {}).forEach(m => { if (m.sourceUrl && m.url && v.bodyMarkdown) v.bodyMarkdown = v.bodyMarkdown.split(m.sourceUrl).join(m.url); });
  if (v.bodyMarkdown) v.sections = content.toSections(v.bodyMarkdown);
  doc.publishedVersion = v.version; doc.versions = [v]; doc.audit = [];
  const ids = new Set([doc.ownerId,doc.authorId,doc.reviewerId,doc.approverId,v.createdBy,v.approvedBy,v.reviewedBy]);
  const directory = people.filter(p => ids.has(p.id)).map(p => ({id:p.id,name:p.name,initials:p.initials || '',role:'Reader'}));
  return {format:1,pageId:String(options.readerPageId),nativeVersion:options.readerNativeVersion,document:doc,people:directory};
}
function createParser() {
  const parser = new MarkdownIt({ html: false, linkify: false, typographer: false, maxNesting: 30 });
  parser.validateLink = value => /^attachment:[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value) || content.safeUrl(value, false) || /^data:image\/(png|jpeg|gif|webp);base64,/.test(value);
  parser.inline.ruler.before('html_inline', 'wcs_storage_underline', (state, silent) => {
    if (state.src.slice(state.pos, state.pos + 3) !== '<u>') return false;
    const end = state.src.indexOf('</u>', state.pos + 3); if (end < 0 || (state.env.underlineDepth || 0) > 15) return false;
    if (!silent) { const token = state.push('wcs_storage_underline', '', 0); token.children = []; state.env.underlineDepth = (state.env.underlineDepth || 0) + 1; state.md.inline.parse(state.src.slice(state.pos + 3, end), state.md, state.env, token.children); state.env.underlineDepth--; }
    state.pos = end + 4; return true;
  });
  parser.inline.ruler.before('image', 'wcs_storage_video', (state, silent) => {
    const match = content.videoToken(state.src.slice(state.pos)); if (!match) return false;
    if (!silent) { const token = state.push('wcs_storage_video', '', 0); token.meta = match.video; }
    state.pos += match.length; return true;
  });
  parser.inline.ruler.before('image', 'wcs_storage_embed', (state, silent) => {
    const match = /^@\[embed\]\(([^\s<>]+)\)/.exec(state.src.slice(state.pos)); if (!match || !content.safeUrl(match[1], true)) return false;
    if (!silent) { const token = state.push('wcs_storage_embed', '', 0); token.content = match[1]; }
    state.pos += match[0].length; return true;
  });
  return parser;
}
const parser = createParser();
function walk(tokens, visit) { tokens.forEach(token => { visit(token); if (token.children) walk(token.children, visit); }); }
function imageReference(source, version) {
  const match = /^attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(source || '');
  if (match) { const asset = version.assets.find(item => item.id === match[1]); if (!asset) fail('Missing inline image: ' + match[1]); return { key: asset.id, source: asset.src, alt: asset.alt }; }
  // Validate raster data URLs and HTTPS/relative URLs using the editor's rules.
  content.validateAssets([{ id: 'direct-image', src: source, alt: 'Document image' }]);
  return { key: source, source, alt: '' };
}
function mediaResources(document, selected) {
  const version = snapshot(document, selected), body = bodyOf(version), items = [];
  version.assets.forEach(asset => items.push({ id: asset.id, key: asset.id, sourceUrl: asset.src, kind: 'image' }));
  version.attachments.forEach(file => items.push({ id: file.id, key: file.id, sourceUrl: file.url, kind: 'attachment', originalName: file.name, mediaType: file.mimeType, size: file.size }));
  if (version.cover) items.push({ id: '$cover', key: '$cover', sourceUrl: version.cover.src, kind: 'cover' });
  const known = new Set(version.assets.map(asset => asset.src));
  walk(parser.parse(body, {}), token => { if (token.type !== 'image') return; const ref = imageReference(token.attrGet('src'), version); if (known.has(ref.source)) return; known.add(ref.source); items.push({ id: 'inline-' + items.length, key: ref.source, sourceUrl: ref.source, kind: 'image' }); });
  return { version, body, items };
}
/**
 * Build a deterministic upload plan. Caller uploads bytes to the restricted
 * working page and supplies its trusted {fileName} results to renderStorage.
 * There is deliberately no fetching of user-supplied URLs (SSRF/mutable media).
 */
async function collectMedia(document, selected, options = {}) {
  const { version, items } = mediaResources(document, selected);
  return (await Promise.all(items.map(async item => {
    if (mapping(options, item.key, item.sourceUrl)) { staged(options, item.key, item.sourceUrl); return []; }
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.sourceUrl);
    if (!match) fail('Media must be uploaded or staged before publication; external image/file URLs are not fetched: ' + item.id + '.');
    const decoded = decodeBase64(match[2]);
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    if (!bytes.length || encodeBase64(decoded) !== match[2]) fail('An uploaded resource has invalid base64 data.');
    const mediaType = match[1], isImage = item.kind !== 'attachment';
    if (isImage && !EXTENSIONS[mediaType]) fail('Use a PNG, JPEG, GIF or WebP image.');
    if (bytes.length > 10000000) fail('An uploaded resource exceeds its allowed size.');
    if (!isImage && (mediaType !== item.mediaType || bytes.length !== item.size)) fail('Attachment data does not match its MIME type and size.');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const original = item.originalName || (item.id === '$cover' ? 'cover' : item.id) + '.' + EXTENSIONS[mediaType];
    const safeName = original.normalize('NFKD').replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '').slice(-100) || ('file.' + (EXTENSIONS[mediaType] || 'bin'));
    const fileName = filename('wcs-v' + version.version + '-r' + version.revision + '-' + digest.slice(0, 16) + '-' + safeName);
    return [{ ...item, fileName, bytes, mediaType, size: bytes.length, sha256: digest }];
  }))).flat();
}
function imageTag(fileName, alt) { return '<ac:image ac:alt="' + xml(alt) + '"><ri:attachment ri:filename="' + xml(fileName) + '" /></ac:image>'; }
function attachmentLink(fileName, body) { return '<ac:link><ri:attachment ri:filename="' + xml(fileName) + '" /><ac:link-body>' + body + '</ac:link-body></ac:link>'; }
function renderTokens(tokens, version, options) {
  const linkClosings = [], allowed = new Set(['paragraph_open', 'paragraph_close', 'heading_open', 'heading_close', 'bullet_list_open', 'bullet_list_close', 'ordered_list_open', 'ordered_list_close', 'list_item_open', 'list_item_close', 'blockquote_open', 'blockquote_close', 'table_open', 'table_close', 'thead_open', 'thead_close', 'tbody_open', 'tbody_close', 'tr_open', 'tr_close', 'th_open', 'th_close', 'td_open', 'td_close', 'strong_open', 'strong_close', 'em_open', 'em_close', 's_open', 's_close']);
  return tokens.map(token => {
    if (token.hidden) return '';
    if (token.type === 'inline') return renderTokens(token.children || [], version, options);
    if (token.type === 'text') return xml(token.content);
    if (token.type === 'softbreak') return '\n';
    if (token.type === 'hardbreak') return '<br />';
    if (token.type === 'hr') return '<hr />';
    if (token.type === 'code_inline') return '<code>' + xml(token.content) + '</code>';
    if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info.trim().split(/\s/)[0];
      return '<ac:structured-macro ac:name="code" ac:schema-version="1">' + (/^[A-Za-z0-9_+-]{1,32}$/.test(language) ? '<ac:parameter ac:name="language">' + xml(language) + '</ac:parameter>' : '') + '<ac:plain-text-body>' + cdata(token.content) + '</ac:plain-text-body></ac:structured-macro>';
    }
    if (token.type === 'wcs_storage_underline') return '<span style="text-decoration:underline;">' + renderTokens(token.children || [], version, options) + '</span>';
    if (token.type === 'wcs_storage_video') return '<a href="' + xml(token.meta.url) + '">Watch recording: ' + xml(token.meta.title) + ' (SharePoint)</a>';
    if (token.type === 'wcs_storage_embed') return '<a href="' + xml(token.content) + '">Open linked resource</a>';
    if (token.type === 'image') { const ref = imageReference(token.attrGet('src'), version); return imageTag(staged(options, ref.key, ref.source), token.content || ref.alt || 'Document image'); }
    if (token.type === 'link_open') {
      const target = token.attrGet('href'), match = /^attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(target || '');
      if (match) { const file = version.attachments.find(item => item.id === match[1]); if (!file) fail('Missing attachment: ' + match[1]); linkClosings.push('</ac:link-body></ac:link>'); return '<ac:link><ri:attachment ri:filename="' + xml(staged(options, file.id, file.url)) + '" /><ac:link-body>'; }
      if (!content.safeUrl(target, false)) fail('A document link has an unsupported URL.');
      linkClosings.push('</a>'); return '<a href="' + xml(target) + '">';
    }
    if (token.type === 'link_close') { const end = linkClosings.pop(); if (!end) fail('Unbalanced document link.'); return end; }
    if (allowed.has(token.type)) {
      const tag = token.tag === 'h1' ? 'h2' : token.tag === 's' ? 'span' : token.tag;
      if (token.nesting === -1) return '</' + tag + '>';
      let attrs = token.tag === 's' ? ' style="text-decoration:line-through;"' : '';
      if (token.type === 'ordered_list_open' && /^\d+$/.test(token.attrGet('start') || '')) attrs += ' start="' + xml(token.attrGet('start')) + '"';
      if ((tag === 'th' || tag === 'td') && /^text-align:(left|center|right)$/.test(token.attrGet('style') || '')) attrs += ' style="' + xml(token.attrGet('style')) + '"';
      return '<' + tag + attrs + '>';
    }
    fail('Unsupported document token: ' + token.type + '.');
  }).join('');
}
function personLabel(id, people) { const person = (people || []).find(item => item.id === id); return person ? plain(person.name) + (person.soeid ? ' (' + plain(person.soeid).toUpperCase() + ')' : '') : 'Not recorded'; }
function date(value) {
  if (!value) return 'Not recorded';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) fail('Document metadata contains an invalid date.');
  const parsed = new Date(value), parts = value.slice(0, 10).split('-').map(Number), calendar = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (!Number.isFinite(parsed.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) fail('Document metadata contains an invalid date.');
  return parsed.toISOString().slice(0, 10);
}
function table(rows) { return '<table><tbody>' + rows.map(row => '<tr><th><p>' + xml(row[0]) + '</p></th><td><p>' + xml(row[1]) + '</p></td></tr>').join('') + '</tbody></table>'; }
function renderStorage(document, selected, people = [], options = {}) {
  const { version, body, items } = mediaResources(document, selected);
  if (options.documentKey && options.documentKey !== document.id) fail('The requested document key does not match the selected snapshot.');
  if (options.operation && !['working', 'published'].includes(options.operation)) fail('Unknown native publication operation.');
  const published = options.operation === 'published';
  const reviewed = version.reviewedBy && version.reviewedBy === document.reviewerId && version.reviewedRevision === version.revision && !!version.reviewedAt;
  const directInsight = content.isDirectPublication(document) && version.status === 'Published' && !!version.publishedAt;
  const approved = reviewed && version.status === 'Published' && version.approvedBy === document.approverId && !!version.approvedAt;
  if (published && (!(approved || directInsight) || document.publishedVersion !== version.version)) fail('Native publication requires the current approved snapshot and review of its exact revision.');
  // Validate every declared resource, including resources not used inline.
  items.forEach(item => staged(options, item.key, item.sourceUrl));
  const governance = content.governanceDetails(version);
  const rows = [
    ['Document key', document.id], ['Document reference', document.reference || document.id], ['Content type', document.type || 'Not recorded'],
    [directInsight?'Collection':'Business area', directInsight?'Insights':options.areaLabel || document.area || 'Not recorded'], ['Document owner', personLabel(document.ownerId, people)], ['Author', personLabel(document.authorId || version.createdBy, people)],
    ['Owning team', governance ? governance.owningTeam : 'Not recorded'], ['Source version', String(version.version)], ['Source revision', String(version.revision)],
    ['Article comments', version.commentsEnabled ? 'Enabled' : 'Disabled'],
    ['Workflow status', published ? 'Published' : version.status === 'Published' ? 'Working copy' : version.status],
    ['Last updated', date(version.updatedAt || version.createdAt)], [directInsight?'Publication':'Next review due date',directInsight?'Author published · no approval required':published ? date(version.nextReviewAt) : 'Not approved for publication']
  ];
  if (version.sourceMetadata) {
    const source = version.sourceMetadata;
    // Preserve the supplied date precision and timezone. These are provenance,
    // not Confluence history or approval timestamps, and must stay distinct.
    rows.push(['Original created', source.originalCreatedAt || 'Not recorded'], ['Original updated', source.originalUpdatedAt || 'Not recorded'], ['Source ID', source.sourceId]);
    if (source.sourceAuthor) rows.push(['Source author', source.sourceAuthor]);
    if (source.sourcePath) rows.push(['Source path', source.sourcePath]);
    rows.push(['Imported into WCSpedia', version.sourceImportedAt]);
  }
  if (reviewed && ['Awaiting approval', 'Published'].includes(version.status)) rows.push(['Reviewed by', personLabel(version.reviewedBy, people)], ['Review date', date(version.reviewedAt)]);
  if (published && directInsight) rows.push(['Published by',personLabel(version.createdBy,people)],['Publication date',date(version.publishedAt)]);
  else if (published) rows.push(['Approved by', personLabel(version.approvedBy, people)], ['Approval date', date(version.approvedAt)], ['Effective date', date(version.effectiveAt)]);
  else if (!directInsight) rows.push(['Approval', 'Not approved for publication']);
  ['tags', 'processes', 'regions'].forEach(kind => { const values = content.validateTags(version[kind] || [], kind); if (values.length) rows.push([kind === 'tags' ? 'Topics' : kind === 'regions' ? 'Regions covered' : 'Processes', values.join(', ')]); });
  const article = options.hostStyleFlags === true && published;
  let out = '';
  if (article && options.readerSidebarUrl) {
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*download\/attachments\/[1-9]\d{0,19}\/wcspedia-reader-sidebar\.js\?api=v2$/.test(options.readerSidebarUrl)) fail('Use the configured same-origin reader sidebar attachment.');
    const loader = '<script defer src="' + options.readerSidebarUrl + '"></script>';
    out += '<ac:structured-macro ac:name="html" ac:schema-version="1"><ac:plain-text-body>' + cdata(loader) + '</ac:plain-text-body></ac:structured-macro>';
  }
  if (options.hostStyleFlags === true) {
    out += '<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">wcs-page-style-v1</ac:parameter></ac:structured-macro>';
    if (article) {
      if (options.insightsUrl != null && !/^\/(?:[A-Za-z0-9_-]+\/)*pages\/viewpage\.action\?pageId=[1-9]\d{0,19}$/.test(options.insightsUrl)) fail('Use a same-origin native Insights page link.');
      out += '<div class="wcs-native-article"><div class="wcs-native-article-heading"><p class="wcs-native-article-kicker">' + (directInsight ? (options.insightsUrl ? '<a href="' + xml(options.insightsUrl) + '">Insights</a>' : 'Insights') : xml(options.areaLabel || document.area)) + ' · ' + xml(document.type) + '</p>';
    }
    out += '<h1>' + xml(version.title) + '</h1>';
    if (article) out += '<p class="wcs-native-article-byline">' + xml(personLabel(document.authorId || version.createdBy, people)) + ' · ' + xml(date(version.publishedAt || version.approvedAt)) + '</p></div>';
  }
  if (published && options.readerPageId && options.readerRootId) {
    if (!/^[1-9]\d{0,19}$/.test(String(options.readerPageId)) || !/^[1-9]\d{0,19}$/.test(String(options.readerRootId))) fail('Invalid reader page mapping.');
    const payload = JSON.stringify(readerPayload(document,version,people,options)).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
    const marker = '<script type="application/json" id="wcs-published-reader" data-wcs-reader-root="' + options.readerRootId + '">' + payload + '</script>';
    out += '<ac:structured-macro ac:name="html" ac:schema-version="1"><ac:plain-text-body>' + cdata(marker) + '</ac:plain-text-body></ac:structured-macro>';
  }
  // Same native body revision as the approved content: no separate-property write race.
  out += '<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">wcs-comments-v1-' + (version.commentsEnabled ? 'enabled' : 'disabled') + '</ac:parameter></ac:structured-macro>';
  out += '<ac:structured-macro ac:name="details" ac:schema-version="1"><ac:parameter ac:name="id">wcspedia-document</ac:parameter>' + (article ? '<ac:parameter ac:name="hidden">true</ac:parameter>' : '') + '<ac:rich-text-body>' + table(rows) + '</ac:rich-text-body></ac:structured-macro>';
  if (article) {
    out += version.cover ? '<div class="wcs-native-article-cover">' + imageTag(staged(options, '$cover', version.cover.src), version.cover.alt) + (version.cover.caption ? '<p>' + xml(version.cover.caption) + '</p>' : '') + '</div>' : '<div class="wcs-native-article-cover">'+'<ac:structured-macro ac:name="html" ac:schema-version="1"><ac:plain-text-body>'+cdata('<img src="'+xml(content.insightCoverUrl(document.id,{attachmentPageId:options.attachmentPageId,contextPath:options.contextPath}))+'" alt="" decoding="async" />')+'</ac:plain-text-body></ac:structured-macro>'+'</div>';
    out += '<div class="wcs-native-article-layout"><div class="wcs-native-article-body">';
  }
  if (version.summary) out += '<ac:structured-macro ac:name="excerpt" ac:schema-version="1"><ac:rich-text-body><p>' + xml(version.summary) + '</p></ac:rich-text-body></ac:structured-macro>';
  if (version.cover && !article) out += '<p>' + imageTag(staged(options, '$cover', version.cover.src), version.cover.alt) + '</p>' + (version.cover.caption ? '<p><em>' + xml(version.cover.caption) + '</em></p>' : '');
  if (Array.isArray(version.highlights) && version.highlights.length) out += '<h2>Key points</h2><ul>' + version.highlights.map(item => '<li>' + xml(item) + '</li>').join('') + '</ul>';
  out += renderTokens(parser.parse(body, {}), version, options);
  if (governance) {
    out += '<h2>Document governance</h2>' + table(governance.rows.filter(row => row[0] !== 'Owning team')) + '<p>' + xml(governance.notice) + '</p>';
    if (governance.sources.length) out += '<h3>Authoritative sources</h3><ul>' + governance.sources.map(source => '<li>' + (source.url ? '<a href="' + xml(source.url) + '">' + xml(source.title) + '</a>' : xml(source.title)) + ' — ' + xml(source.id) + '; version ' + xml(source.version) + '; verified ' + xml(source.lastVerifiedAt) + '</li>').join('') + '</ul>';
  }
  if (version.attachments.length) out += '<h2>Supporting attachments</h2><ul>' + version.attachments.map(file => '<li>' + attachmentLink(staged(options, file.id, file.url), xml(file.name)) + '</li>').join('') + '</ul>';
  if (article) {
    out += '</div><div class="wcs-native-article-control"><h2>' + (directInsight ? 'Article details' : 'Document control') + '</h2><p class="wcs-native-article-status">Published</p><dl><dt>Author</dt><dd>' + xml(personLabel(document.authorId || version.createdBy, people)) + '</dd><dt>' + (directInsight ? 'Collection' : 'Business area') + '</dt><dd>' + xml(directInsight ? 'Insights' : options.areaLabel || document.area) + '</dd><dt>Published</dt><dd>' + xml(date(version.publishedAt || version.approvedAt)) + '</dd>';
    if (!directInsight) out += '<dt>Approved by</dt><dd>' + xml(personLabel(version.approvedBy, people)) + '</dd><dt>Next review</dt><dd>' + xml(date(version.nextReviewAt)) + '</dd>';
    out += '</dl></div></div></div>';
  }
  return out;
}
return Object.freeze({ renderStorage, collectMedia, mediaResources });
});
