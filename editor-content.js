/* Portable, versioned Markdown. markdown-it is bundled locally; raw HTML stays disabled. */
(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./vendor/markdown-it-15.0.2.min.js') : root.WCSMarkdownIt);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSEditorContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (MarkdownIt) {
  'use strict';
  // One content-type rule for editor, native writes, imports and discovery.
  var INSIGHT_TYPES = Object.freeze(['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']);
  // Stored types remain valid; the UI offers four groups without rewriting history.
  var INSIGHT_CHOICES = Object.freeze(['Guide', 'Blog', 'Training', 'Report']);
  var CREATE_TYPES = Object.freeze(['Job aid'].concat(INSIGHT_CHOICES));
  var TYPE_GROUPS = Object.freeze({Procedure:'Guide',Playbook:'Guide',Checklist:'Guide','Knowledge sharing':'Training',Reference:'Report',Template:'Report',FAQ:'Report'});
  function groupType(type) { return TYPE_GROUPS[type] || type; }
  function typeLabel(type) { return ({Guide:'Guides',Blog:'Blogs',Training:'Training',Report:'Reports','Job aid':'Job aids'})[groupType(type)] || type; }
  function insightCoverUrl(key,options) {
    options=options||{};var id=String(key||''),hash=2166136261;
    for(var i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619)>>>0;
    var file='wcs-insight-cover-'+String(hash%50+1).padStart(2,'0')+'.jpg';
    var host=String(options.attachmentPageId||''),context=String(options.contextPath||'/confluence').replace(/\/$/,'');
    return /^[1-9]\d{0,19}$/.test(host)&&/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(context)?context+'/download/attachments/'+host+'/'+file+'?api=v2':'assets/insights-covers/'+file;
  }
  function topicLabel(value) {
    return String(value == null ? '' : value).trim().replace(/[-_]+/g,' ').replace(/\b[a-zA-Z]+\b/g,function(word){
      if (/^(?:emea|apac|latam|uk|us|usa|eu|faq|api|wcs|kyc|aml|esg|mdx)$/i.test(word)) return word.toUpperCase();
      return /^[a-z]+$/.test(word) ? word.charAt(0).toUpperCase()+word.slice(1) : word;
    });
  }
  function starterTemplate(type) {
    var sections={
      Guide:[['Overview','Describe what this guide helps the reader accomplish.'],['Before you begin','List the information, tools, or access the reader needs.'],['Steps','1. Describe the first step.\n2. Describe the next step.\n3. Explain how to check the result.'],['Troubleshooting','Explain common issues and how to resolve them.'],['Related resources','Add links to useful reference material.']],
      Blog:[['Introduction','Introduce the topic and why it matters.'],['The main idea','Share your perspective, examples, and supporting evidence.'],['Key takeaways','- First takeaway.\n- Second takeaway.'],['What comes next','Suggest a practical next step for the reader.']],
      Training:[['Learning objectives','- Explain what learners will be able to do.'],['Before you start','Describe any prerequisites.'],['Lesson','Explain the concept with a worked example.'],['Practice','Add an exercise for learners to try.'],['Check your understanding','Add questions and explain the answers.'],['Further learning','Link to additional learning resources.']],
      Report:[['Executive summary','Summarise the purpose and principal findings.'],['Scope and method','Describe the period covered, data sources, and approach.'],['Findings','| Finding | Evidence | Implication |\n| --- | --- | --- |\n| Describe the finding | Cite the evidence | Explain the impact |'],['Recommendations','List recommended actions, owners, and next steps.'],['Sources and limitations','Cite your sources and explain any limitations.']],
      'Job aid':[['Purpose','Describe the task and when to use this job aid.'],['Prerequisites','List required access, inputs, and checks.'],['Procedure','| Step | Action | Expected result |\n| --- | --- | --- |\n| 1 | Describe the action | Describe the result |'],['Checks and exceptions','Explain the checks to complete and where to escalate exceptions.'],['References','Link to the authoritative procedures and supporting resources.']]
    };
    return (sections[groupType(type)]||sections.Guide).map(function(section){return '## '+section[0]+'\n\n'+section[1];}).join('\n\n')+'\n';
  }
  function typeMembers(type) { var members = ['Job aid'].concat(INSIGHT_TYPES).filter(function (item) { return groupType(item) === groupType(type); }); return members.length ? members : [type]; }
  function isInsightType(type) { return INSIGHT_TYPES.indexOf(type) !== -1; }
  function publicationModeFor(type) { return type === 'Blog' ? 'direct-blog' : isInsightType(type) ? 'direct-insight' : null; }
  function isDirectPublication(doc) { return !!doc && isInsightType(doc.type) && doc.area === 'insights' && doc.publicationMode === publicationModeFor(doc.type); }
  var MAX_PORTABLE_BYTES = 8 * 1024 * 1024;
  // Count UTF-8 bytes, including non-ASCII prose, without allocating a second
  // copy of a potentially large embedded-resource import.
  function portableBytes(value) {
    var bytes = 0;
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code < 128) bytes++;
      else if (code < 2048) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xDC00 && value.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i++; }
      else bytes += 3;
      if (bytes > MAX_PORTABLE_BYTES) return bytes;
    }
    return bytes;
  }
  var MAX_MARKDOWN = 200000, MAX_IMAGE_BYTES = 1024 * 1024, MAX_FILE_BYTES = 5 * 1024 * 1024;
  var ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  var FILE_TYPES = {
    'application/pdf': ['pdf'], 'text/plain': ['txt'], 'text/markdown': ['md', 'markdown'], 'text/csv': ['csv'],
    'application/msword': ['doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-excel': ['xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'application/vnd.ms-powerpoint': ['ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif']
  };
  function fail(message) { throw new Error(message); }
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function markdown(value) {
    if (typeof value !== 'string' || !value.trim()) fail('Document content is required.');
    if (value.length > MAX_MARKDOWN) fail('Document content must be no more than 200,000 characters.');
    if (/\u0000/.test(value)) fail('Document content contains an invalid character.');
    return value.replace(/\r\n?/g, '\n').trim();
  }
  function safeUrl(value, image) {
    if (typeof value !== 'string' || !value || /[\s<>"'\\\u0000-\u001f\u007f]/.test(value)) return false;
    if (/^(?:\/[^/]|\/[?$]|\/$|\.\.?\/)/.test(value) && !/^\/\//.test(value)) return true;
    if (!image && /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
    try { var parsed = new URL(value); return (parsed.protocol === 'https:' || (!image && parsed.protocol === 'http:')) && !parsed.username && !parsed.password; } catch (_) { return false; }
  }
  // Embed snippets are parsed as inert text. Only a validated Microsoft source
  // and a plain title survive; supplied HTML/attributes are never inserted.
  function videoEmbed(input, title) {
    if (typeof input !== 'string' || !input.trim() || input.length > 12000) fail('Paste a SharePoint recording link or video embed code (up to 12,000 characters).');
    var source = input.trim(), suppliedTitle = '', snippet = source.charAt(0) === '<';
    if (snippet) {
      var stripped = source.replace(/<\/?div\b[^<>]*>/gi, '').trim();
      var frame = /^<iframe\b([^<>]*)>\s*<\/iframe\s*>$/i.exec(stripped);
      if (!frame) fail('Paste the single iframe embed code from SharePoint: Share → Embed code.');
      var attrs = frame[1], at = 0, seen = Object.create(null), attr;
      var attribute = /\s+([a-zA-Z][a-zA-Z0-9:_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
      source = '';
      while (at < attrs.length && attrs.slice(at).trim()) {
        attribute.lastIndex = at; attr = attribute.exec(attrs);
        if (!attr) fail('The embed code has an invalid attribute. Copy it again from SharePoint.');
        at = attribute.lastIndex;
        var name = attr[1].toLowerCase(), value = md.utils.unescapeAll(attr[2] === undefined ? (attr[3] === undefined ? (attr[4] || '') : attr[3]) : attr[2]);
        if (seen[name] || /^on/.test(name) || name === 'srcdoc') fail('Use unmodified SharePoint embed code without scripts or duplicate attributes.');
        seen[name] = true;
        if (name === 'src') source = value;
        if (name === 'title') suppliedTitle = value;
      }
    }
    if (!safeUrl(source, true)) fail('Use a complete HTTPS SharePoint recording URL.');
    var url; try { url = new URL(source); } catch (_) { fail('Use a complete HTTPS SharePoint recording URL.'); }
    if (url.protocol !== 'https:' || url.port || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.sharepoint\.(?:com|us|de|cn)$/i.test(url.hostname) || url.pathname === '/') fail('Use a recording hosted on your organisation’s SharePoint Online site.');
    var label = title == null || title === '' ? suppliedTitle : title;
    if (typeof label !== 'string' || !label.trim() || label.length > 300 || /[\u0000-\u001f\u007f]/.test(label)) fail('Add a video title of 1–300 characters for readers and screen readers.');
    var embed = /\/_layouts\/15\/embed\.aspx$/i.test(url.pathname);
    if (embed) {
      var ids = []; url.searchParams.forEach(function (value, key) { if (key.toLowerCase() === 'uniqueid') ids.push(value); });
      var guid = ids[0] || '';
      if (guid.charAt(0) === '{' && guid.charAt(guid.length - 1) === '}') guid = guid.slice(1, -1);
      if (ids.length !== 1 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guid)) fail('The SharePoint embed URL needs one valid UniqueId. Copy Share → Embed code from the recording.');
    } else if (snippet) fail('This is not a SharePoint video embed URL. Copy Share → Embed code from the recording.');
    // Parentheses would terminate the Markdown destination. Encode them once.
    var normalized = url.href.replace(/[()]/g, function (c) { return c === '(' ? '%28' : '%29'; });
    return { url: normalized, embedUrl: embed ? normalized : '', provider: 'SharePoint', title: label.trim() };
  }
  function videoMarkdown(video) { var value = videoEmbed(video.url, video.title); return '@[video](' + value.url + ' ' + JSON.stringify(value.title) + ')'; }
  function videoToken(source) {
    var match = /^@\[video\]\(([^\s<>"()]+)\s+("(?:[^"\\\r\n]|\\.)*")\)/.exec(source);
    if (!match) return null;
    try { return { length: match[0].length, video: videoEmbed(match[1], JSON.parse(match[2])) }; } catch (_) { return null; }
  }
  function dataInfo(value) {
    var match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) return null;
    return { mimeType: match[1], bytes: match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0) };
  }
  function imageSource(value, label) {
    label = label || 'Image';
    if (typeof value !== 'string' || !value.trim()) fail(label + ' source is required.');
    var src = value.trim();
    if (/^data:/i.test(src)) {
      var info = dataInfo(src);
      if (!info || !/^image\/(png|jpeg|webp|gif)$/.test(info.mimeType) || !info.bytes) fail('Use a PNG, JPEG, WebP or GIF image.');
      if (info.bytes > MAX_IMAGE_BYTES) fail(label + ' must be 1 MB or smaller.');
    } else if (!safeUrl(src, true)) fail(label + ' must use an HTTPS URL or a local relative path.');
    return src;
  }
  function description(value, label) {
    if (typeof value !== 'string' || !value.trim()) fail('Describe the ' + label + ' for accessibility.');
    if (value.length > 500) fail('Image description must be no more than 500 characters.');
    return value.trim();
  }
  function objectKeys(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(function (key) { return allowed.indexOf(key) < 0; })) fail(label + ' must contain only ' + allowed.join(', ') + '.');
  }
  function validateCover(value) {
    if (value == null) return null;
    objectKeys(value, ['src', 'alt', 'caption'], 'Cover image');
    if (value.caption != null && (typeof value.caption !== 'string' || value.caption.length > 1000)) fail('Cover caption must be no more than 1,000 characters.');
    return { src: imageSource(value.src, 'Cover image'), alt: description(value.alt, 'cover image'), caption: (value.caption || '').trim() };
  }
  function collection(value, label, limit) { if (!Array.isArray(value) || value.length > limit) fail('Use no more than ' + limit + ' ' + label + '.'); }
  function validateAssets(value) {
    collection(value, 'inline images', 20); var ids = Object.create(null);
    return value.map(function (asset) {
      objectKeys(asset, ['id', 'src', 'alt'], 'An inline image');
      if (!ID.test(asset.id) || typeof asset.id !== 'string' || ids[asset.id]) fail('Inline image IDs must be valid and unique.');
      ids[asset.id] = true;
      return { id: asset.id, src: imageSource(asset.src, 'Inline image'), alt: description(asset.alt, 'inline image') };
    });
  }
  function validateAttachments(value) {
    collection(value, 'attachments', 20); var ids = Object.create(null);
    return value.map(function (file) {
      objectKeys(file, ['id', 'name', 'url', 'mimeType', 'size'], 'An attachment');
      if (typeof file.id !== 'string' || !ID.test(file.id) || ids[file.id]) fail('Attachment IDs must be valid and unique.');
      ids[file.id] = true;
      if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 180 || /[\/\\\u0000-\u001f\u007f]/.test(file.name)) fail('Use a plain attachment filename of up to 180 characters.');
      var name = file.name.trim(), extensions = FILE_TYPES[file.mimeType], extension = name.toLowerCase().split('.').pop();
      if (!extensions || extensions.indexOf(extension) < 0) fail('Use a PDF, text, Markdown, CSV, Office document or raster image with the correct file extension.');
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) fail('Each attachment must be 5 MB or smaller.');
      if (typeof file.url !== 'string') fail('An attachment URL is required.');
      var info = dataInfo(file.url);
      if (/^data:/i.test(file.url)) {
        if (!info || info.mimeType !== file.mimeType || info.bytes !== file.size) fail('The attachment data, MIME type and size must match.');
      } else if (!safeUrl(file.url, true)) fail('Attachments must use an HTTPS URL or a local relative path.');
      return { id: file.id, name: name, url: file.url, mimeType: file.mimeType, size: file.size };
    });
  }
  function validateTags(value, kind) {
    kind = kind || 'tags'; var limit = kind === 'tags' ? 30 : 20;
    collection(value, kind, limit); var seen = Object.create(null), out = [];
    value.forEach(function (item) {
      if (typeof item !== 'string' || !item.trim() || item.length > 80 || /[\u0000-\u001f\u007f]/.test(item)) fail('Each ' + kind + ' value must be non-empty text of up to 80 characters.');
      var normalized = item.trim(), key = normalized.toLowerCase();
      if (!seen[key]) { seen[key] = true; out.push(normalized); }
    }); return out;
  }
  // Source provenance is deliberately separate from workflow/audit timestamps.
  // Keep date-only precision and the supplied offset; never invent a time zone.
  function sourceDate(value, label) {
    if (value == null) return null;
    if (typeof value !== 'string') fail(label + ' must be a quoted ISO date/timestamp or null.');
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2})))?$/.exec(value);
    if (!match) fail(label + ' must use YYYY-MM-DD or an ISO timestamp with a time zone, such as 2024-03-03T10:00:00+01:00.');
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), date = new Date(0);
    date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
    if (!year || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || (match[4] !== undefined && (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] || 0) > 59 || Number(match[10] || 0) > 14 || Number(match[11] || 0) > 59 || (Number(match[10]) === 14 && Number(match[11]) !== 0))) || !Number.isFinite(Date.parse(value))) fail(label + ' is not a valid calendar date/time.');
    return value;
  }
  function metadataText(value, label, limit, optional) {
    if (optional && value == null) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) fail(label + ' must be ' + (optional ? '' : 'non-empty ') + 'text of up to ' + limit + ' characters.');
    return value.trim();
  }
  function validateSourceMetadata(value) {
    if (value == null) return null;
    objectKeys(value, ['schemaVersion', 'sourceId', 'originalCreatedAt', 'originalUpdatedAt', 'sourceAuthor', 'sourcePath'], 'Source metadata');
    if (value.schemaVersion !== 1) fail('Source metadata schemaVersion must be 1.');
    var result = {
      schemaVersion: 1, sourceId: metadataText(value.sourceId, 'Source ID', 160),
      originalCreatedAt: sourceDate(value.originalCreatedAt, 'Original creation date'),
      originalUpdatedAt: sourceDate(value.originalUpdatedAt, 'Original modification date'),
      sourceAuthor: metadataText(value.sourceAuthor, 'Source author', 200, true),
      sourcePath: metadataText(value.sourcePath, 'Source path', 500, true)
    };
    var created = result.originalCreatedAt, updated = result.originalUpdatedAt;
    // Date-only values do not identify an instant. Compare equal precision;
    // for mixed precision allow the full day across real-world UTC offsets.
    if (created && updated) {
      var createdDateOnly = created.length === 10, updatedDateOnly = updated.length === 10;
      var earliestCreated = Date.parse(created) - (createdDateOnly ? 14 * 3600000 : 0);
      var latestUpdated = Date.parse(updated) + (updatedDateOnly ? 38 * 3600000 - 1 : 0);
      var earlier = createdDateOnly === updatedDateOnly ? Date.parse(updated) < Date.parse(created) : latestUpdated < earliestCreated;
      if (earlier) fail('Original modification date cannot be earlier than original creation date.');
    }
    return result;
  }
  function validateCommentsEnabled(value) {
    if (value === undefined) return true;
    if (typeof value !== 'boolean') fail('commentsEnabled must be true or false.');
    return value;
  }
  var IMPORT_KEYS = ['format', 'title', 'summary', 'type', 'area', 'commentsEnabled', 'sourceId', 'originalCreatedAt', 'originalUpdatedAt', 'sourceAuthor', 'sourcePath', 'tags', 'processes', 'regions'];
  function importMetadata(values) {
    if (values.format !== 'wcspedia-mdx-v1') fail('MDX metadata needs format: "wcspedia-mdx-v1".');
    var result = {
      commentsEnabled: validateCommentsEnabled(values.commentsEnabled),
      title: metadataText(values.title, 'Metadata title', 160), summary: metadataText(values.summary, 'Metadata summary', 1000),
      type: metadataText(values.type, 'Metadata type', 80), area: isInsightType(values.type) ? 'insights' : metadataText(values.area, 'Metadata area', 120),
      tags: validateTags(values.tags == null ? [] : values.tags), processes: validateTags(values.processes == null ? [] : values.processes, 'processes'), regions: validateTags(values.regions == null ? [] : values.regions, 'regions'),
      sourceMetadata: validateSourceMetadata({ schemaVersion: 1, sourceId: values.sourceId, originalCreatedAt: values.originalCreatedAt, originalUpdatedAt: values.originalUpdatedAt, sourceAuthor: values.sourceAuthor, sourcePath: values.sourcePath })
    };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.area)) fail('Metadata area must be the business-area ID, using lowercase letters, numbers and single hyphens.');
    return result;
  }
  function frontmatter(source) {
    if (!/^---(?:\n|$)/.test(source)) return { body: source, metadata: null };
    var lines = source.split('\n'), end = -1;
    for (var i = 1; i < lines.length; i++) { if (lines[i] === '---') { end = i; break; } }
    // A leading Markdown horizontal rule may precede prose such as "Note:".
    // Only explicit format/provenance keys identify a metadata block.
    if (!lines.slice(1, end < 0 ? lines.length : end).some(function (line) { return /^(?:format|sourceId|originalCreatedAt|originalUpdatedAt):/.test(line); })) return { body: source, metadata: null };
    if (end < 0) fail('Close the MDX metadata block with a line containing ---.');
    if (lines.slice(0, end + 1).join('\n').length > 16000) fail('MDX metadata must be no more than 16,000 characters.');
    var values = Object.create(null);
    for (var i = 1; i < end; i++) {
      var line = lines[i]; if (!line.trim() || /^#/.test(line)) continue;
      var match = /^([A-Za-z][A-Za-z0-9]*):[ \t]*(.*?)\s*$/.exec(line);
      if (!match) fail('Metadata line ' + (i + 1) + ' must use key: value on one line. Use JSON-quoted strings and arrays; nested YAML is not supported.');
      var key = match[1], raw = match[2];
      if (IMPORT_KEYS.indexOf(key) < 0) fail('Unsupported metadata field "' + key + '". Use only the fields in the WCSpedia MDX template; permissions, approval and Confluence history fields cannot be imported.');
      if (Object.prototype.hasOwnProperty.call(values, key)) fail('Metadata field "' + key + '" appears more than once.');
      if (!raw) fail('Metadata field "' + key + '" needs a value. Use null for an unknown source date.');
      var value;
      if (raw.charAt(0) === '"' || raw.charAt(0) === '[') {
        try { value = JSON.parse(raw); } catch (_) { fail('Metadata field "' + key + '" needs a valid JSON-quoted string or array on one line.'); }
      } else if (key === 'commentsEnabled' && /^(true|false)$/.test(raw)) value = raw === 'true';
      else if (raw === 'null') value = null;
      else {
        if (/^[!&*'{}>|%@`?\-\[\],]/.test(raw) || /:\s|\s#|[\u0000-\u001f\u007f]/.test(raw) || /^(?:true|false|~)$/i.test(raw)) fail('Metadata field "' + key + '" must use a JSON-quoted string or array; YAML aliases, tags and multiline values are not supported.');
        value = raw;
      }
      values[key] = value;
    }
    return { body: lines.slice(end + 1).join('\n').trim(), metadata: importMetadata(values) };
  }
  function escapedCharacter(text, index) { var slashes = 0; while (index > 0 && text[--index] === '\\') slashes++; return slashes % 2 === 1; }
  // WCSpedia recording/resource directives are inert, validated Markdown
  // extensions. Their quoted titles are plain text, never MDX expressions.
  function mapDirectiveText(text, transform, preserve) {
    var pattern = /@\[(?:video|embed)\]/g, match, cursor = 0, out = '';
    while ((match = pattern.exec(text))) {
      if (escapedCharacter(text, match.index)) continue;
      var tail = text.slice(match.index), video = videoToken(tail), embed = /^@\[embed\]\(([^\s<>]+)\)/.exec(tail);
      var length = video ? video.length : embed && safeUrl(embed[1], true) ? embed[0].length : 0;
      if (!length) continue;
      var directive = tail.slice(0, length);
      out += transform(text.slice(cursor, match.index)) + (preserve === false ? ' ' : typeof preserve === 'function' ? preserve(directive) : directive);
      cursor = match.index + length; pattern.lastIndex = cursor;
    }
    return out + transform(text.slice(cursor));
  }
  function validateMdxText(text) {
    text = mapDirectiveText(text, function (part) { return part; }, false);
    // Module declarations are unsupported; ordinary instructions such as
    // "import the source file" and "export the report" remain plain Markdown.
    // Ignore JS comments only for detection, never alter the imported body.
    var declarations = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^\s*(?:import|export)\b[^\n]*?)\/\/[^\n]*/gm, '$1');
    if (/^\s*import\b\s*(?:["'{*]|[A-Za-z_$][\w$]*\s*(?:,|\s+from\s*["']))/m.test(declarations) || /^\s*export\b\s*(?:[\{*]|(?:default|const|let|var|function|class|async|type|interface|enum)\b)/m.test(declarations)) fail('MDX imports and exports are not supported. Convert components to Markdown or put code examples inside fenced code blocks.');
    // The editor's exact underline extension has a dedicated safe renderer.
    var withoutUnderline = text.replace(/<\/?u>/g, '');
    var htmlPattern = /<\/?[A-Za-z][A-Za-z0-9_.:-]*(?:\s|\/?>)|<>|<\/>|<!--/g, html;
    while ((html = htmlPattern.exec(withoutUnderline))) if (!escapedCharacter(withoutUnderline, html.index)) fail('MDX components and raw HTML are not supported. Convert them to Markdown before importing; code examples can stay in fenced code blocks.');
    for (var i = 0; i < text.length; i++) if (text[i] === '{' || text[i] === '}') {
      var slashes = 0, at = i; while (at > 0 && text[--at] === '\\') slashes++;
      if (slashes % 2 === 0) fail('MDX expressions are not supported. Use plain Markdown, escape literal braces, or put code examples inside code blocks.');
    }
  }
  function context(value) {
    value = value || {}; var assets = validateAssets(value.assets || []), attachments = validateAttachments(value.attachments || []), used = Object.create(null);
    assets.concat(attachments).forEach(function (item) { if (used[item.id]) fail('Inline image and attachment IDs must be unique across a document.'); used[item.id] = true; });
    return { assets: assets, attachments: attachments };
  }
  function attachmentId(value) { return typeof value === 'string' && /^attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(value); }
  function resolve(value, env, image) {
    var match = attachmentId(value);
    if (match) {
      var items = image ? env.assets : env.attachments;
      var item = items.find(function (candidate) { return candidate.id === match[1]; });
      return item ? { url: image ? item.src : item.url, id: item.id, name: item.name, alt: item.alt } : null;
    }
    if (image) { try { return { url: imageSource(value) }; } catch (_) { return null; } }
    return safeUrl(value, false) ? { url: value } : null;
  }
  if (!MarkdownIt) fail('Load the bundled Markdown parser before the authoring content helper.');
  var md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false, maxNesting: 30 });
  md.validateLink = function (url) { return !!attachmentId(url) || safeUrl(url, false) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(url); };
  md.inline.ruler.before('html_inline', 'wcs_underline', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== '<u>') return false;
    var end = state.src.indexOf('</u>', state.pos + 3);
    if (end < 0 || (state.env.underlineDepth || 0) > 15) return false;
    if (!silent) {
      var token = state.push('wcs_underline', 'u', 0); token.content = state.src.slice(state.pos + 3, end); token.children = [];
      state.env.underlineDepth = (state.env.underlineDepth || 0) + 1;
      state.md.inline.parse(token.content, state.md, state.env, token.children); state.env.underlineDepth--;
    }
    state.pos = end + 4; return true;
  });
  md.inline.ruler.before('image', 'wcs_embed', function (state, silent) {
    var match = /^@\[embed\]\(([^\s<>]+)\)/.exec(state.src.slice(state.pos));
    if (!match || !safeUrl(match[1], true)) return false;
    if (!silent) { var token = state.push('wcs_embed', 'a', 0); token.content = match[1]; }
    state.pos += match[0].length; return true;
  });
  md.inline.ruler.before('image', 'wcs_video', function (state, silent) {
    var match = videoToken(state.src.slice(state.pos)); if (!match) return false;
    if (!silent) { var token = state.push('wcs_video', 'span', 0); token.meta = match.video; }
    state.pos += match.length; return true;
  });
  function plainTokens(tokens) {
    return (tokens || []).map(function (token) {
      if (token.type === 'image') return token.content;
      if (token.type === 'wcs_embed') return 'Embedded resource: ' + token.content;
      if (token.type === 'wcs_video') return 'Recording: ' + token.meta.title;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
      if (token.children) return plainTokens(token.children);
      return token.type === 'text' || token.type === 'code_inline' ? token.content : '';
    }).join('').trim();
  }
  function uniqueId(text, used) {
    var base = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    var id = base, count = 1; while (used[id]) { count += 1; id = base + '-' + count; } used[id] = true; return id;
  }
  function parsed(value, env) {
    var tokens = md.parse(markdown(value), env || {}), used = Object.create(null), started = false;
    tokens.forEach(function (token, index) {
      if (token.type === 'heading_open') {
        token.attrSet('id', uniqueId(plainTokens(tokens[index + 1].children), used));
        if (token.tag === 'h1') { token.tag = 'h2'; tokens[index + 2].tag = 'h2'; }
        started = true;
      } else if (!started && token.block && token.nesting >= 0 && !token.hidden) { token.attrSet('id', uniqueId('Overview', used)); started = true; }
    }); return tokens;
  }
  md.renderer.rules.wcs_underline = function (tokens, i, options, env, renderer) { return '<u>' + renderer.renderInline(tokens[i].children, options, env) + '</u>'; };
  md.renderer.rules.wcs_embed = function (tokens, i) {
    var url = tokens[i].content;
    return '<a class="wcs-embed" data-embed-url="' + escape(url) + '" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer"><strong>Open embedded resource</strong><span>' + escape(url) + '</span></a>';
  };
  md.renderer.rules.wcs_video = function (tokens, i) {
    var video = tokens[i].meta;
    return '<span class="wcs-video" contenteditable="false" data-video-url="' + escape(video.url) + '" data-video-title="' + escape(video.title) + '"><span class="wcs-video-heading"><span class="wcs-video-eyebrow">Recorded training · SharePoint</span><strong>' + escape(video.title) + '</strong></span>' + (video.embedUrl ? '<span class="wcs-video-player"><iframe src="' + escape(video.embedUrl) + '" title="' + escape(video.title) + '" loading="lazy" allow="fullscreen" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads" referrerpolicy="strict-origin-when-cross-origin"></iframe></span>' : '') + '<span class="wcs-video-caption"><span>' + (video.embedUrl ? 'Sign in with your work account. Access is managed in SharePoint.' : 'This recording opens in SharePoint.') + '</span><a href="' + escape(video.url) + '" target="_blank" rel="noopener noreferrer">Open in SharePoint <span aria-hidden="true">↗</span></a></span></span>';
  };
  md.renderer.rules.image = function (tokens, i, options, env) {
    var token = tokens[i], src = token.attrGet('src'), media = resolve(src, env, true), alt = plainTokens(token.children) || (media && media.alt) || token.content;
    if (!media) return '<span class="media-unavailable">' + escape(alt || 'Image unavailable') + '</span>';
    return '<img src="' + escape(media.url) + '" alt="' + escape(alt) + '"' + (media.id ? ' data-asset-id="' + escape(media.id) + '" data-wcs-source="' + escape(src) + '"' : '') + ' loading="lazy" decoding="async">';
  };
  md.renderer.rules.link_open = function (tokens, i, options, env) {
    var source = tokens[i].attrGet('href'), media = resolve(source, env, false);
    if (!media) return '<a aria-disabled="true">';
    return '<a href="' + escape(media.url) + '" rel="noopener noreferrer"' + (media.id ? ' download="' + escape(media.name) + '" data-attachment-id="' + escape(media.id) + '" data-wcs-source="' + escape(source) + '"' : '') + '>';
  };
  function render(value, version) { var env = context(version); return md.renderer.render(parsed(value, env), md.options, env).replace(/>\n(?=<)/g, '>').trim(); }
  function toSections(value) {
    var tokens = parsed(value), result = [], current = null, used = Object.create(null), listDepth = 0, row = null;
    function section(title, id) { current = { id: id || uniqueId(title, used), title: title, paragraphs: [], bullets: [] }; result.push(current); }
    function add(text, bullet) { if (!text.trim()) return; if (!current) section('Overview'); current[bullet ? 'bullets' : 'paragraphs'].push(text.trim()); }
    tokens.forEach(function (token, index) {
      if (token.type === 'heading_open') { section(plainTokens(tokens[index + 1].children), token.attrGet('id')); return; }
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') listDepth++;
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') listDepth--;
      if (token.type === 'tr_open') row = [];
      if (token.type === 'tr_close') { add(row.join(' | '), false); row = null; }
      if (token.type === 'inline' && (!tokens[index - 1] || tokens[index - 1].type !== 'heading_open')) {
        var text = plainTokens(token.children);
        if (row) row.push(text); else add(text, listDepth > 0);
      }
      if (token.type === 'fence' || token.type === 'code_block') add(token.content, listDepth > 0);
    });
    return result.filter(function (item) { return item.paragraphs.length || item.bullets.length; });
  }
  function validateReferences(value, version) {
    var env = context(version);
    function visit(tokens) { tokens.forEach(function (token) {
      if (token.type === 'image' || token.type === 'link_open') {
        var target = token.attrGet(token.type === 'image' ? 'src' : 'href');
        if (attachmentId(target) && !resolve(target, env, token.type === 'image')) fail('The content refers to an inline image or attachment that is missing: ' + target + '.');
      }
      if (token.children) visit(token.children);
    }); }
    visit(parsed(value, env)); return true;
  }
  function escapeMarkdown(value) { return String(value).replace(/([\\`*_{}\[\]()#+!>])/g, '\\$1'); }
  function fromSections(sections) {
    if (!Array.isArray(sections)) fail('Document sections are required.');
    return sections.map(function (section) { return '## ' + escapeMarkdown(section.title || 'Overview') + '\n\n' + (section.paragraphs || []).map(escapeMarkdown).join('\n\n') + ((section.paragraphs || []).length && (section.bullets || []).length ? '\n\n' : '') + (section.bullets || []).map(function (item) { return '- ' + escapeMarkdown(item); }).join('\n'); }).join('\n\n').trim();
  }
  function portableUrl(value, baseUrl) {
    var url = value;
    if (/^(?:\/[^/]|\/[?$]|\/$|\.\.?\/)/.test(url)) {
      var base; try { base = new URL(baseUrl); } catch (_) { fail('MDX export needs the HTTPS Confluence page URL to preserve relative image and attachment links.'); }
      if (base.protocol !== 'https:' || base.username || base.password) fail('MDX export needs an HTTPS Confluence page URL without credentials.');
      url = new URL(url, base).href;
    }
    return url.replace(/[(){}<>]/g, function (char) { return '%' + char.charCodeAt(0).toString(16).toUpperCase(); });
  }
  function portableLinks(text, baseUrl) {
    function destinations(part) {
      part = part.replace(/<https?:\/\/[^<>\s]+>/g, function (autolink, at, original) {
        if (escapedCharacter(original, at)) return autolink;
        var source = autolink.slice(1, -1); if (!safeUrl(source, false)) return autolink;
        var target = portableUrl(source, baseUrl);
        return target === source ? autolink : '[' + escapeMarkdown(source) + '](' + target + ')';
      });
      var changes = [], match, pattern = /\]\([ \t\n]*|^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*/gm;
      while ((match = pattern.exec(part))) {
        if (escapedCharacter(part, match.index)) continue;
        var start = pattern.lastIndex, destination = md.helpers.parseLinkDestination(part, start, part.length);
        if (!destination.ok || !destination.str || (!safeUrl(destination.str, false) && !/^data:/.test(destination.str))) continue;
        var target = portableUrl(destination.str, baseUrl);
        if (target !== destination.str || part[start] === '<') changes.push({ start: start, end: destination.pos, value: target });
        pattern.lastIndex = destination.pos;
      }
      for (var i = changes.length - 1; i >= 0; i--) part = part.slice(0, changes[i].start) + changes[i].value + part.slice(changes[i].end);
      return part;
    }
    // Recording titles must not be interpreted as Markdown destinations.
    return mapDirectiveText(text, destinations, function (directive) {
      var embed = /^@\[embed\]\(([^\s<>]+)\)$/.exec(directive);
      return embed ? '@[embed](' + portableUrl(embed[1], baseUrl) + ')' : directive;
    });
  }
  function safeMdxProse(text) {
    return mapDirectiveText(text, function (part) {
      part = part.replace(/<\/?u>|<(?:https?:\/\/[^<>\s]+|[^<>\s@]+@[^<>\s@]+)>|</g, function (value, at, original) {
        return value === '<' && !escapedCharacter(original, at) ? '&lt;' : value;
      });
      part = part.replace(/[{}]/g, function (value, at, original) { return escapedCharacter(original, at) ? value : '\\' + value; });
      return part.replace(/^(\s*)(import|export)\b/gm, function (_, prefix, keyword) { return prefix + (keyword === 'import' ? '&#105;mport' : '&#101;xport'); });
    });
  }
  function portableBody(body, version, options) {
    options = options || {};
    var env = context(version), offsets = [0];
    function escapedAt(text, index) { var slashes = 0; while (index > 0 && text[--index] === '\\') slashes++; return slashes % 2 === 1; }
    // A code example is content, never a live media reference. Preserve both
    // fenced/indented blocks and inline code exactly during portable export.
    body.split('\n').forEach(function (line) { offsets.push(offsets[offsets.length - 1] + line.length + 1); });
    var blocks = parsed(body, env).filter(function (token) { return (token.type === 'fence' || token.type === 'code_block' || token.type === 'inline') && token.map; }).map(function (token) {
      return { start: offsets[token.map[0]], end: Math.min(body.length, offsets[token.map[1]]), code: token.type !== 'inline', scan: (token.children || []).some(function (child) { return child.type === 'code_inline'; }) };
    });
    var segments = [], cursor = 0;
    blocks.forEach(function (range) { if (range.start < cursor) return; if (range.start > cursor) segments.push({ text: body.slice(cursor, range.start), code: false }); segments.push({ text: body.slice(range.start, range.end), code: range.code, scan: range.scan }); cursor = range.end; });
    if (cursor < body.length) segments.push({ text: body.slice(cursor), code: false });
    var fragments = [];
    segments.forEach(function (segment) {
      if (segment.code || segment.scan === false) { fragments.push(segment); return; }
      // Backtick runs of equal length may delimit code across multiple lines.
      // Index matching runs once so long inputs do not require repeated scans.
      var text = segment.text, runs = [], pattern = /`+/g, match, next = Object.create(null), videos = [], videoPattern = /@\[video\]/g;
      while ((match = videoPattern.exec(text))) {
        var video = !escapedAt(text, match.index) && videoToken(text.slice(match.index));
        if (video) { videos.push([match.index, match.index + video.length]); videoPattern.lastIndex = match.index + video.length; }
      }
      while ((match = pattern.exec(text))) runs.push({ start: match.index, end: pattern.lastIndex, length: match[0].length });
      for (var index = runs.length - 1; index >= 0; index--) { runs[index].next = next[runs[index].length]; next[runs[index].length] = index; }
      var position = 0, videoIndex = 0;
      for (var index = 0; index < runs.length; index++) {
        var run = runs[index];
        while (videoIndex < videos.length && videos[videoIndex][1] <= run.start) videoIndex++;
        // A recording title is a plain string; its backticks do not open code.
        if ((videos[videoIndex] && videos[videoIndex][0] <= run.start) || escapedAt(text, run.start) || run.next === undefined) continue;
        var close = runs[run.next];
        if (run.start > position) fragments.push({ text: text.slice(position, run.start), code: false });
        fragments.push({ text: text.slice(run.start, close.end), code: true }); position = close.end; index = run.next;
      }
      if (position < text.length) fragments.push({ text: text.slice(position), code: false });
    });
    function replace(part) {
      function resource(id) { return env.assets.concat(env.attachments).find(function (item) { return item.id === id; }); }
      var replaced = part.replace(/\]\(\s*<?attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})>?(?=\s|\))/g, function (match, id) {
        var media = resource(id); return media ? '](' + (options.mdx ? portableUrl(media.src || media.url, options.baseUrl) : media.src || media.url) : match;
      }).replace(/^(\s*\[[^\]]+\]:\s*)<?attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})>?(?=\s|$)/gm, function (match, prefix, id) {
        var media = resource(id); return media ? prefix + (options.mdx ? portableUrl(media.src || media.url, options.baseUrl) : media.src || media.url) : match;
      });
      if (options.mdx) return safeMdxProse(portableLinks(replaced, options.baseUrl));
      return replaced.replace(/@\[embed\]\(([^\s<>]+)\)/g, function (all, url, at, original) { return !escapedAt(original, at) && safeUrl(url, true) ? '[Open embedded resource](' + url + ')' : all; }).replace(/@\[video\]\(([^\s<>"()]+)\s+("(?:[^"\\\r\n]|\\.)*")\)/g, function (all, url, title, at, original) { if (escapedAt(original, at)) return all; var match = videoToken(all); return match ? '[Watch recording: ' + escapeMarkdown(match.video.title) + '](' + match.video.url + ')' : all; });
    }
    return fragments.map(function (fragment) { return fragment.code ? fragment.text : replace(fragment.text); }).join('');
  }
  function normalizeImport(value, version) {
    if (typeof value !== 'string' || !value.trim()) fail('Paste some Markdown first.');
    if (value.length > MAX_PORTABLE_BYTES || portableBytes(value) > MAX_PORTABLE_BYTES) fail('Pasted Markdown must be 8 MB or smaller (8,388,608 UTF-8 bytes).');
    if (/\u0000/.test(value)) fail('Document content contains an invalid character.');
    var document = frontmatter(value.replace(/\r\n?/g, '\n').trim()), source = document.body, env = context(version), assets = env.assets.slice(), attachments = env.attachments.slice(), used = Object.create(null);
    assets.concat(attachments).forEach(function (item) { used[item.id] = true; });
    function nextId(prefix) { var index = 1; while (used[prefix + index]) index++; var id = prefix + index; used[id] = true; return id; }
    function escapedAt(text, index) { var slashes = 0; while (index > 0 && text[--index] === '\\') slashes++; return slashes % 2 === 1; }
    function labelBefore(text, end) {
      var depth = 0;
      for (var at = end - 1; at >= 0 && text[at] !== '\n'; at--) {
        if (escapedAt(text, at)) continue;
        if (text[at] === ']') depth++;
        if (text[at] === '[') {
          if (depth) { depth--; continue; }
          return { label: text.slice(at + 1, end), image: at > 0 && text[at - 1] === '!' && !escapedAt(text, at - 1) };
        }
      }
      return null;
    }
    function labelText(value) { return plainTokens(md.parseInline(value, {})[0].children).replace(/\\([\[\]\\])/g, '$1').trim(); }
    function ingest(url, label, image) {
      var info = dataInfo(url);
      if (!info) fail('A pasted file has an invalid base64 data URL.');
      var id;
      if (image) {
        imageSource(url, 'Inline image');
        var asset = assets.find(function (item) { return item.src === url; });
        if (!asset) { asset = { id: nextId('import-image-'), src: url, alt: (labelText(label) || 'Imported image').slice(0, 500) }; assets.push(asset); }
        id = asset.id;
      } else {
        var extensions = FILE_TYPES[info.mimeType];
        if (!extensions) fail('Pasted attachments must be PDF, text, Markdown, CSV, Office documents or raster images.');
        var name = (labelText(label) || 'Imported attachment').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-');
        if (name.indexOf('.') < 0) name += '.' + extensions[0];
        if (name.length > 180) name = name.slice(0, 170) + '.' + extensions[0];
        var file = attachments.find(function (item) { return item.url === url; });
        if (!file) { file = { id: nextId('import-file-'), name: name, url: url, mimeType: info.mimeType, size: info.bytes }; validateAttachments([file]); attachments.push(file); }
        id = file.id;
      }
      return 'attachment:' + id;
    }
    // Obtain line ranges before applying the canonical body-size limit: file
    // payloads are extracted into versioned resources first. Raw HTML is off.
    var lines = source.split('\n'), offsets = [0];
    lines.forEach(function (line) { offsets.push(offsets[offsets.length - 1] + line.length + 1); });
    var blocks = md.parse(source, {}).filter(function (token) { return (token.type === 'fence' || token.type === 'code_block') && token.map; }).map(function (token) { return [offsets[token.map[0]], Math.min(source.length, offsets[token.map[1]])]; });
    var segments = [], cursor = 0;
    blocks.forEach(function (range) { if (range[0] < cursor) return; if (range[0] > cursor) segments.push({ text: source.slice(cursor, range[0]), code: false }); segments.push({ text: source.slice(range[0], range[1]), code: true }); cursor = range[1]; });
    if (cursor < source.length) segments.push({ text: source.slice(cursor), code: false });
    // Inline code can span lines and use arbitrary-length backtick delimiters.
    // Pair runs by length without repeatedly rescanning long unmatched inputs.
    var fragments = [];
    segments.forEach(function (segment) {
      if (segment.code) { fragments.push(segment); return; }
      var text = segment.text, runs = [], pattern = /`+/g, match, next = Object.create(null), videos = [], videoPattern = /@\[video\]/g;
      while ((match = videoPattern.exec(text))) {
        var video = !escapedAt(text, match.index) && videoToken(text.slice(match.index));
        if (video) { videos.push([match.index, match.index + video.length]); videoPattern.lastIndex = match.index + video.length; }
      }
      while ((match = pattern.exec(text))) runs.push({ start: match.index, end: pattern.lastIndex, length: match[0].length });
      for (var index = runs.length - 1; index >= 0; index--) { runs[index].next = next[runs[index].length]; next[runs[index].length] = index; }
      var position = 0, videoIndex = 0;
      for (var index = 0; index < runs.length; index++) {
        var run = runs[index];
        while (videoIndex < videos.length && videos[videoIndex][1] <= run.start) videoIndex++;
        if ((videos[videoIndex] && videos[videoIndex][0] <= run.start) || escapedAt(text, run.start) || run.next === undefined) continue;
        var close = runs[run.next]; if (run.start > position) fragments.push({ text: text.slice(position, run.start), code: false }); fragments.push({ text: text.slice(run.start, close.end), code: true }); position = close.end; index = run.next;
      }
      if (position < text.length) fragments.push({ text: text.slice(position), code: false });
    });
    var eligible = fragments.filter(function (fragment) { return !fragment.code; }).map(function (fragment) { return fragment.text; }).join('\n');
    if (document.metadata) validateMdxText(eligible);
    function referenceUse(label) {
      var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var image = new RegExp('!\\[[^\\]\\n]*\\]\\[' + escaped + '\\]|!\\[' + escaped + '\\](?:\\[\\])?(?!\\()', 'i').test(eligible);
      // Definitions shared by both a download and an image cannot point to a
      // single typed resource. Keep the import atomic and ask for inline links.
      var file = new RegExp('(^|[^!])\\[[^\\]\\n]*\\]\\[' + escaped + '\\]', 'im').test(eligible);
      if (image && file) fail('Use separate inline links for an image and download that share the same Markdown reference.');
      return image;
    }
    var imported = fragments.map(function (fragment) {
      if (fragment.code) return fragment.text;
      var text = fragment.text;
      text = text.replace(/(\]\(\s*<?)(data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2})(>?)(?=\s|\))/g, function (match, prefix, url, suffix, at, original) {
        var usage = labelBefore(original, at); if (!usage) return match;
        return '](' + ingest(url, usage.label, usage.image);
      });
      return text.replace(/^(\s{0,3}\[([^\]\n]+)\]:\s*)<?(data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2})>?(?=\s|$)/gm, function (match, prefix, label, url) {
        return prefix + ingest(url, label, referenceUse(label));
      });
    }).join('');
    var result = { bodyMarkdown: markdown(imported), assets: validateAssets(assets), attachments: validateAttachments(attachments) };
    if (document.metadata) result.metadata = document.metadata;
    validateReferences(result.bodyMarkdown, result);
    return result;
  }
  // A readable projection of the selected revision only. This does not assign
  // governance to legacy documents or include private reviewer decisions.
  function governanceDetails(version) {
    var value = version && version.governance;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    function display(item) { return typeof item === 'string' && item.trim() ? item.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : 'Not recorded'; }
    var labels = { 'other-nhd': 'Other NHD', 'other-bod': 'Other BOD', 'formal-reference': 'Formal document reference', 'unclassified': 'Unclassified · review required' };
    var classification = Object.prototype.hasOwnProperty.call(labels, value.classification) ? labels[value.classification] : 'Unclassified · review required';
    var reviewBasis = value.reviewBasis === 'formal-governance' ? 'Formal governance' : value.reviewBasis === 'business-best-practice' ? 'Business best practice' : 'Not recorded';
    var cadence = value.classification === 'formal-reference' ? 'Follow the authoritative document’s governance process' : value.reviewMonths === 24 ? 'At least every 24 calendar months from approval; earlier when needed' : 'Not recorded';
    return {
      classification: classification, owningTeam: display(value.owningTeam), reviewBasis: reviewBasis,
      rows: [ ['Document classification', classification], ['Owning team', display(value.owningTeam)], ['Scope', display(value.scope)], ['Intended audience', display(value.audience)], ['Supporting team', display(value.supportingTeam)], ['Classification rationale', display(value.classificationRationale)], ['Review basis', reviewBasis], ['Review target', cadence], ['Governance baseline', display(value.baselineVersion)] ],
      sources: (Array.isArray(value.sources) ? value.sources : []).map(function (source) { source = source || {}; return { id: display(source.id), title: display(source.title), url: typeof source.url === 'string' && /^https:\/\//i.test(source.url) && safeUrl(source.url, false) ? source.url : '', version: display(source.version), lastVerifiedAt: display(source.lastVerifiedAt) }; }),
      notice: value.classification === 'formal-reference' ? 'The source document’s formal governance requirements remain authoritative. A WCSpedia reference does not replace or amend them.' : 'The business review target is best practice, not a mandatory periodic governance cycle. Classification and automated checks do not grant formal exceptions or certify compliance.'
    };
  }
  function governanceMarkdown(version) {
    var governance = governanceDetails(version); if (!governance) return '';
    var out = '\n## Governance\n\n' + governance.rows.map(function (row) { return '**' + row[0] + ':** ' + escapeMarkdown(row[1]); }).join('\n\n') + '\n\n' + escapeMarkdown(governance.notice) + '\n';
    if (governance.sources.length) out += '\n### Authoritative sources\n\n' + governance.sources.map(function (source, index) {
      var title = escapeMarkdown(source.title), url = source.url.replace(/\(/g, '%28').replace(/\)/g, '%29');
      return (index + 1) + '. ' + (url ? '[' + title + '](' + url + ')' : title + ' · URL not recorded') + '\n   - Source ID: ' + escapeMarkdown(source.id) + '\n   - Version: ' + escapeMarkdown(source.version) + '\n   - Last verified: ' + escapeMarkdown(source.lastVerifiedAt);
    }).join('\n\n') + '\n';
    return out;
  }
  function toMarkdown(version) {
    if (!version || typeof version.title !== 'string') fail('A document version is required.');
    var body = version.bodyMarkdown ? markdown(version.bodyMarkdown) : fromSections(version.sections);
    var out = '# ' + escapeMarkdown(version.title) + '\n\n' + escapeMarkdown(version.summary || '') + '\n\n';
    if (Array.isArray(version.highlights) && version.highlights.length) out += '## Key highlights\n\n' + version.highlights.map(function (item) { return '- ' + escapeMarkdown(item); }).join('\n') + '\n\n';
    if (version.cover) { var cover = validateCover(version.cover); out += '![' + escapeMarkdown(cover.alt) + '](' + cover.src + ')\n\n' + (cover.caption ? escapeMarkdown(cover.caption) + '\n\n' : ''); }
    out += portableBody(body, version) + '\n';
    ['tags', 'processes', 'regions'].forEach(function (kind) { if (version[kind] && version[kind].length) out += '\n**' + kind.charAt(0).toUpperCase() + kind.slice(1) + ':** ' + validateTags(version[kind], kind).map(escapeMarkdown).join(', ') + '\n'; });
    if (version.attachments && version.attachments.length) out += '\n## Attachments\n\n' + validateAttachments(version.attachments).map(function (file) { return '- [' + escapeMarkdown(file.name) + '](' + file.url + ')'; }).join('\n') + '\n';
    return (version.sourceMetadata != null ? metadataBlock(version) + '\n\n' : '') + out + governanceMarkdown(version);
  }
  function metadataBlock(version) {
    if (!version || typeof version.title !== 'string') fail('A document version is required.');
    var provenance = validateSourceMetadata(version.sourceMetadata);
    if (!provenance) fail('Source metadata is required to export the WCSpedia MDX format.');
    var values = { commentsEnabled: validateCommentsEnabled(version.commentsEnabled), format: 'wcspedia-mdx-v1', title: version.title, summary: version.summary, type: version.type, area: version.area, sourceId: provenance.sourceId, originalCreatedAt: provenance.originalCreatedAt, originalUpdatedAt: provenance.originalUpdatedAt, sourceAuthor: provenance.sourceAuthor, sourcePath: provenance.sourcePath, tags: version.tags || [], processes: version.processes || [], regions: version.regions || [] };
    var validated = importMetadata(values);
    ['title', 'summary', 'type', 'area', 'tags', 'processes', 'regions'].forEach(function (key) { values[key] = validated[key]; });
    return '---\n' + IMPORT_KEYS.map(function (key) { return key + ': ' + JSON.stringify(values[key]); }).join('\n') + '\n---';
  }
  function toMDX(version, options) {
    if (!version || typeof version.title !== 'string') fail('A document version is required.');
    options = options || {};
    var provenance = validateSourceMetadata(version.sourceMetadata);
    if (!provenance) {
      var identity = version.documentId || version.reference;
      if (!identity) fail('Save this document before exporting MDX so it has a stable document ID.');
      identity = metadataText(identity, 'Export document ID', 151);
      provenance = validateSourceMetadata({ schemaVersion: 1, sourceId: 'wcspedia:' + identity, originalCreatedAt: null, originalUpdatedAt: null, sourceAuthor: '', sourcePath: '' });
    }
    var metadataVersion = Object.assign({}, version, { sourceMetadata: provenance }), header = metadataBlock(metadataVersion);
    var body = typeof version.bodyMarkdown === 'string' ? markdown(version.bodyMarkdown) : markdown(fromSections(version.sections));
    var env = context(version); validateReferences(body, version);
    var exportOptions = { mdx: true, baseUrl: options.baseUrl }, output = portableBody(body, version, exportOptions), before = [];
    // Cover/highlights are projected as normal Markdown so an import keeps
    // their content without treating the file as a backup of editor state.
    if (version.highlights != null) {
      collection(version.highlights, 'key highlights', 5);
      if (version.highlights.length) {
        var highlights = version.highlights.map(function (item) { return '- ' + escapeMarkdown(metadataText(item, 'Key highlight', 500)); }).join('\n');
        var highlightBody = portableBody('## Key highlights\n\n' + highlights, version, exportOptions);
        if (output.indexOf(highlightBody) < 0) before.push(highlightBody);
      }
    }
    if (version.cover != null) {
      var cover = validateCover(version.cover);
      var coverBody = safeMdxProse(portableLinks('![' + escapeMarkdown(cover.alt) + '](' + portableUrl(cover.src, options.baseUrl) + ')' + (cover.caption ? '\n\n' + escapeMarkdown(cover.caption) : ''), options.baseUrl));
      if (output.indexOf(coverBody) < 0) before.push(coverBody);
    }
    if (before.length) output = before.join('\n\n') + '\n\n' + output;
    var linkedFiles = Object.create(null);
    function visit(tokens) { tokens.forEach(function (token) {
      if (token.type === 'link_open') {
        var target = token.attrGet('href'), reference = attachmentId(target);
        env.attachments.forEach(function (file) { if ((reference && reference[1] === file.id) || target === file.url) linkedFiles[file.id] = true; });
      }
      if (token.children) visit(token.children);
    }); }
    visit(parsed(body, env));
    var unlinked = env.attachments.filter(function (file) { return !linkedFiles[file.id]; });
    if (unlinked.length) {
      var filesBody = '## Attachments\n\n' + unlinked.map(function (file) { return '- [' + escapeMarkdown(file.name) + '](' + portableUrl(file.url, options.baseUrl) + ')'; }).join('\n');
      output += '\n\n' + safeMdxProse(portableLinks(filesBody, options.baseUrl));
    }
    var result = header + '\n\n' + output + '\n';
    // Fail clearly before download if the portable file cannot be pasted back
    // under the same import limits (including extracted data-URL resources).
    if (result.length > MAX_PORTABLE_BYTES || portableBytes(result) > MAX_PORTABLE_BYTES) fail('The MDX export exceeds the 8 MB paste limit (8,388,608 UTF-8 bytes). Use hosted image and attachment URLs before exporting.');
    normalizeImport(result);
    return result;
  }
  return Object.freeze({ INSIGHT_TYPES: INSIGHT_TYPES, INSIGHT_CHOICES: INSIGHT_CHOICES, CREATE_TYPES: CREATE_TYPES, insightCoverUrl: insightCoverUrl, topicLabel: topicLabel, starterTemplate: starterTemplate, groupType: groupType, typeLabel: typeLabel, typeMembers: typeMembers, isInsightType: isInsightType, publicationModeFor: publicationModeFor, isDirectPublication: isDirectPublication, fromSections: fromSections, toSections: toSections, render: render, validateCover: validateCover, validateAssets: validateAssets, validateAttachments: validateAttachments, validateTags: validateTags, validateReferences: validateReferences, validateSourceMetadata: validateSourceMetadata, validateCommentsEnabled: validateCommentsEnabled, safeUrl: safeUrl, normalizeImport: normalizeImport, toMarkdown: toMarkdown, toMDX: toMDX, governanceDetails: governanceDetails, videoEmbed: videoEmbed, videoMarkdown: videoMarkdown, videoToken: videoToken });
});
