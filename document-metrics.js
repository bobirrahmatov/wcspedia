/* Deterministic estimates over the exact document snapshot shown to a reader.
 * Uses the bundled Markdown parser and media validators, never a network request.
 * This is reading time, not completion time for an embedded video or attachment.
 */
(function (root, factory) {
  'use strict';
  var commonJS = typeof module === 'object' && module.exports;
  var api = factory(commonJS ? require('./vendor/markdown-it-15.0.2.min.js') : root.WCSMarkdownIt,
    commonJS ? require('./editor-content.js') : root.WCSEditorContent);
  if (commonJS) module.exports = api;
  else root.WCSDocumentMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (MarkdownIt, content) {
  'use strict';
  if (!MarkdownIt || !content) throw new Error('Load the bundled Markdown parser and content helper before document metrics.');
  var DEFAULTS = Object.freeze({ wordsPerMinute: 200, imageSeconds: 10 });
  var parser = new MarkdownIt({ html: true, linkify: false, typographer: false, maxNesting: 30 });
  var segmenter = typeof Intl === 'object' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('en', { granularity: 'word' }) : null;

  function text(value) { return typeof value === 'string' ? value : ''; }
  function stripUnsafeHTML(value) {
    // An unsafe raw HTML payload is neither readable article text nor media.
    // No HTML is inserted into the DOM by this module.
    return value.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
      .replace(/<(script|style|template|iframe|object|svg|math|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
  }
  function readable(value) {
    return stripUnsafeHTML(text(value)).replace(/<[^>]*>/g, ' ')
      .replace(/\bdata:[^\s<>]+/gi, ' ')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>]+/gi, ' ')
      .replace(/\b(?:attachment|mailto|javascript|vbscript):[^\s<>]+/gi, ' ')
      .replace(/\bwww\.[^\s<>]+/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function imageAllowed(src, version) {
    var reference = /^attachment:([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(text(src));
    try {
      if (reference) {
        var asset = (Array.isArray(version.assets) ? version.assets : []).find(function (item) { return item && item.id === reference[1]; });
        return !!asset && content.validateAssets([asset]).length === 1;
      }
      // Reuse the renderer's URL/data-image eligibility, without storing bytes.
      return !!content.validateCover({ src: src, alt: 'Reading estimate' });
    } catch (_) { return false; }
  }
  parser.validateLink = function (url) {
    return /^attachment:[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(url)
      || content.safeUrl(url, false) || /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(url);
  };
  parser.inline.ruler.before('image', 'wcs_metrics_embed', function (state, silent) {
    var match = /^@\[embed\]\(([^\s<>]+)\)/.exec(state.src.slice(state.pos));
    if (!match || !content.safeUrl(match[1], true)) return false;
    if (!silent) state.push('wcs_metrics_embed', '', 0);
    state.pos += match[0].length;
    return true;
  });
  parser.inline.ruler.before('image', 'wcs_metrics_video', function (state, silent) {
    var match = content.videoToken(state.src.slice(state.pos)); if (!match) return false;
    if (!silent) { var token = state.push('wcs_metrics_video', '', 0); token.content = match.video.title; }
    state.pos += match.length; return true;
  });

  function snapshot(version) {
    version = version && typeof version === 'object' ? version : {};
    var parts = [readable(version.title), readable(version.summary)], images = 0;
    if (Array.isArray(version.highlights)) version.highlights.forEach(function (value) { parts.push(readable(value)); });
    // The cover is displayed independently, even if also used inside the body.
    if (version.cover) {
      try {
        var cover = content.validateCover(version.cover);
        images++;
        parts.push(readable(cover.caption));
      } catch (_) { /* The article uses decorative fallback art for an invalid cover. */ }
    }
    function inlineText(items) {
      return (items || []).map(function (token) {
        if (token.type === 'image') {
          if (imageAllowed(token.attrGet('src'), version)) images++;
          else return ' ' + token.content + ' '; // The renderer shows the unavailable image's alternative text.
          return ' ';
        }
        if (token.type === 'wcs_metrics_embed') return ' Open embedded resource ';
        if (token.type === 'wcs_metrics_video') return ' ' + token.content + ' ';
        if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
        if (token.children) return inlineText(token.children);
        if (token.type === 'text' || token.type === 'code_inline') return token.content;
        if (token.type === 'html_inline' && /^<br\b/i.test(token.content)) return ' ';
        return '';
      }).join('');
    }
    function tokens(items) {
      (items || []).forEach(function (token) {
        if (token.children) parts.push(readable(inlineText(token.children)));
        else if (['code_block', 'fence', 'html_block'].indexOf(token.type) !== -1) parts.push(readable(token.content));
      });
    }
    // Empty canonical Markdown is still authoritative; do not revive stale sections.
    if (typeof version.bodyMarkdown === 'string') tokens(parser.parse(stripUnsafeHTML(version.bodyMarkdown), {}));
    else (Array.isArray(version.sections) ? version.sections : []).forEach(function (section) {
      if (!section || typeof section !== 'object') return;
      parts.push(readable(section.title));
      ['paragraphs', 'bullets'].forEach(function (key) {
        if (Array.isArray(section[key])) section[key].forEach(function (value) { parts.push(readable(value)); });
      });
    });
    return { text: parts.filter(Boolean).join(' '), images: images };
  }
  function wordCount(value) {
    if (segmenter) {
      var count = 0;
      for (var item of segmenter.segment(value)) if (item.isWordLike) count++;
      return count;
    }
    // Unicode fallback is deterministic and keeps contractions together. It does
    // not attempt dictionary segmentation for languages without word spacing.
    return (value.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/gu) || []).length;
  }
  function estimate(version, options) {
    options = options || {};
    var wordsPerMinute = options.wordsPerMinute === undefined ? DEFAULTS.wordsPerMinute : options.wordsPerMinute;
    var imageSeconds = options.imageSeconds === undefined ? DEFAULTS.imageSeconds : options.imageSeconds;
    if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) throw new RangeError('Reading speed must be a positive number.');
    if (!Number.isFinite(imageSeconds) || imageSeconds < 0) throw new RangeError('Image allowance must be a non-negative number.');
    var data = snapshot(version), words = wordCount(data.text);
    var seconds = words * 60 / wordsPerMinute + data.images * imageSeconds;
    if (!Number.isFinite(seconds)) throw new RangeError('Reading estimate exceeds the supported range.');
    return { words: words, images: data.images, seconds: seconds, minutes: words || data.images ? Math.max(1, Math.ceil(seconds / 60)) : 0 };
  }
  return Object.freeze({ DEFAULTS: DEFAULTS, estimate: estimate, readableText: function (version) { return snapshot(version).text; } });
});
