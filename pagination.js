/* Bounded pagination shared by the library and entitlement directory. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSPagination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function total(value) { var number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number))) : 0; }
  function current(value, count) { var number = Number(value); return Math.min(Math.max(1, Math.floor(Number.isFinite(number) ? number : 1)), Math.max(1, count)); }
  function items(totalPages, currentPage) {
    var count = total(totalPages), selected = current(currentPage, count), pages = new Set();
    // The amount of work stays constant even for a very large result set.
    for (var offset = 0; offset < 3; offset++) {
      if (offset + 1 <= count) pages.add(offset + 1);
      if (count - offset >= 1) pages.add(count - offset);
    }
    for (var neighbor = -1; neighbor <= 1; neighbor++) { var page = selected + neighbor; if (page >= 1 && page <= count) pages.add(page); }
    var ordered = Array.from(pages).sort(function (a, b) { return a - b; }), tokens = [];
    ordered.forEach(function (number, index) {
      var previous = ordered[index - 1], gap = number - previous;
      if (index && gap === 2) tokens.push({type:'page', page:previous + 1, current:previous + 1 === selected});
      if (index && gap > 2) tokens.push({type:'ellipsis', from:previous + 1, to:number - 1});
      tokens.push({type:'page', page:number, current:number === selected});
    });
    return tokens;
  }
  function safeHref(value) {
    var href = String(value == null ? '' : value).trim();
    if (!href || /[\u0000-\u0020]/.test(href) || /^(?:javascript|data|vbscript):/i.test(href)) return '';
    if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^https?:/i.test(href)) return '';
    return href;
  }
  function render(options) {
    options = options || {};
    var count = total(options.totalPages), selected = current(options.currentPage, count);
    if (!count) return '';
    function control(page, label, className, disabled, visible) {
      var href = disabled ? '' : safeHref(typeof options.href === 'function' ? options.href(page) : '#?page=' + page);
      var attributes = ' class="wcs-page-control ' + className + '" aria-label="' + escape(label) + '"';
      return href ? '<a' + attributes + ' href="' + escape(href) + '" data-page="' + page + '">' + visible + '</a>'
        : '<span' + attributes + ' aria-disabled="true">' + visible + '</span>';
    }
    var previous = options.previousLabel || 'Previous', next = options.nextLabel || 'Next';
    return '<nav class="wcs-pagination" aria-label="' + escape(options.ariaLabel || 'Pagination') + '">' +
      control(selected - 1, previous + ' page', 'wcs-page-previous', selected === 1, '<span aria-hidden="true">←</span><span class="wcs-page-direction">' + escape(previous) + '</span>') +
      '<ol class="wcs-page-numbers">' + items(count, selected).map(function (token) {
        if (token.type === 'ellipsis') return '<li class="wcs-page-gap"><span aria-hidden="true">…</span><span class="wcs-pagination-sr">Pages ' + token.from + ' to ' + token.to + ' omitted</span></li>';
        if (token.current) return '<li><span class="wcs-page-control is-current" aria-current="page" aria-label="Page ' + token.page + ', current page">' + token.page + '</span></li>';
        return '<li>' + control(token.page, 'Page ' + token.page, '', false, String(token.page)) + '</li>';
      }).join('') + '</ol>' +
      control(selected + 1, next + ' page', 'wcs-page-next', selected === count, '<span class="wcs-page-direction">' + escape(next) + '</span><span aria-hidden="true">→</span>') + '</nav>';
  }
  return Object.freeze({items:items, render:render});
});
