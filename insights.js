/* WCSpedia Insights: local filtering and a small editorial listing; no network requests. */
(function (global, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./editor-content.js') : global.WCSEditorContent);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.WCSInsights = api;
})(typeof window !== 'undefined' ? window : null, function (content) {
  'use strict';
  var DEFAULT_TYPES = content.INSIGHT_CHOICES;
  var mounts = new WeakMap();
  function text(value) { return String(value == null ? '' : value); }
  function esc(value) { return text(value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fold(value) { return text(value).trim().toLowerCase(); }
  function unique(values) { var seen = new Set(); return values.filter(function (v) { var key = fold(v); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
  function typesFor(options) { var list = Array.isArray(options.types) ? options.types : DEFAULT_TYPES; return unique(list.filter(function (t) { return typeof t === 'string'; }).map(function (t) { return content.groupType(t.trim()); })); }
  function dateValue(value) { var n = Date.parse(value); return Number.isFinite(n) ? n : 0; }
  function tagsFor(item) { return unique((Array.isArray(item.tags) ? item.tags : []).filter(function (t) { return typeof t === 'string'; }).map(function (t) { return t.trim(); })); }
  function select(options) {
    options = options || {};
    var types = typesFor(options), allowed = new Map(types.map(function (type) { return [fold(type), type]; }));
    var source = Array.isArray(options.documents) ? options.documents : [], ids = new Set();
    var eligible = source.filter(function (item) {
      if (!item || typeof item !== 'object' || !text(item.id) || ids.has(text(item.id)) || !allowed.has(fold(content.groupType(item.type)))) return false;
      if (item.deletedAt || item.status && item.status !== 'Published') return false;
      ids.add(text(item.id)); return true;
    });
    var input = options.filter || {}, filter = {type:text(input.type || 'all'), topic:text(input.topic || '').trim(), q:text(input.q || '').trim()};
    var topics = unique(eligible.reduce(function (all, item) { return all.concat(tagsFor(item)); }, [])).sort(function (a,b) { return a.localeCompare(b); });
    var terms = fold(filter.q).split(/\s+/).filter(Boolean);
    var items = eligible.filter(function (item) {
      if (fold(filter.type) !== 'all' && fold(content.groupType(item.type)) !== fold(content.groupType(filter.type))) return false;
      if (!options.prefiltered && filter.topic && !tagsFor(item).some(function (tag) { return fold(tag) === fold(filter.topic); })) return false;
      var haystack = fold([item.title, item.summary, item.type, text(item.author && (item.author.name || item.author.displayName) || item.author), tagsFor(item).join(' ')].join(' '));
      return options.prefiltered === true || terms.every(function (term) { return haystack.indexOf(term) !== -1; });
    }).sort(function (a,b) { return dateValue(b.updatedAt || b.updated) - dateValue(a.updatedAt || a.updated) || text(a.title).localeCompare(text(b.title)) || text(a.id).localeCompare(text(b.id)); });
    var rawLimit = Number(options.limit), limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.max(1, Math.min(Math.floor(rawLimit), Number.MAX_SAFE_INTEGER)) : 9;
    return {items:items.slice(0,limit), total:items.length, topics:topics, types:types, filter:filter, hasMore:items.length > limit};
  }
  function safeUrl(value, baseUrl) {
    if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return '';
    try {
      var base = new URL(baseUrl || 'https://wcspedia.invalid/'), parsed = new URL(value, base);
      if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== base.origin || parsed.username || parsed.password) return '';
      return value;
    } catch (_) { return ''; }
  }
  function icon(name) {
    var paths = {search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths[name]+'</svg>';
  }
  function displayDate(value) {
    if (!dateValue(value)) return '';
    return new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
  }
  function placeholder() {
    return '<svg class="wcs-insights-placeholder" viewBox="0 0 480 300" aria-hidden="true" focusable="false"><rect width="480" height="300" fill="#eaf1fc"/><circle cx="408" cy="36" r="138" fill="#dbe7fa"/><circle cx="60" cy="290" r="125" fill="#d5e3fa"/><path d="M64 211C170 88 310 82 420 172" fill="none" stroke="#b9cff3" stroke-width="2"/><rect x="148" y="63" width="184" height="178" rx="16" fill="#fff"/><path d="M182 107h116M182 125h82M182 189h116M182 207h64" stroke="#bdcde1" stroke-width="8" stroke-linecap="round"/><path d="M190 160h18l15-22 20 35 18-22h29" fill="none" stroke="#255be3" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="333" cy="216" r="28" fill="#255be3"/><path d="M322 216h22m-9-9 9 9-9 9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  // Stable pseudo-random selection from the 50-image library. A new document ID
  // gets its own choice; rerenders, sorting and reloads never reshuffle it.
  function fallbackImage(item, options) {
    return safeUrl(content.insightCoverUrl(item.documentKey||item.id||item.url||item.title,options),options.baseUrl);
  }
  function card(item, options) {
    var url = safeUrl(item.url, options.baseUrl), cover = item.cover && (typeof item.cover === 'string' ? item.cover : item.cover.src || item.cover.url);
    cover = safeUrl(cover, options.baseUrl);
    var fallback=fallbackImage(item,options), image=cover||fallback;
    var area = (options.areas || []).find(function (a) { return a.id === item.area || a.id === item.category; });
    var tags = tagsFor(item), topic = tags[0] || area && (area.title || area.name) || item.type;
    var author = typeof item.author === 'string' ? item.author : item.author && (item.author.name || item.author.displayName);
    var updated = displayDate(item.updatedAt || item.updated), label = item.title || 'Untitled insight';
    return '<article class="wcs-insights-card'+(!cover?' wcs-insights-card--text':'')+'" data-wcs-insights-document="'+esc(item.id)+'">'+
      (url?'<a class="wcs-insights-card-link" href="'+esc(url)+'">':'<div class="wcs-insights-card-link">')+
      '<div class="wcs-insights-cover">'+(image?'<img src="'+esc(image)+'" data-wcs-cover-fallback="'+esc(fallback)+'"'+(!cover?' data-wcs-cover-default="true"':'')+' alt="" loading="lazy" decoding="async" width="800" height="500">':placeholder())+'</div>'+
      '<div class="wcs-insights-card-body"><p class="wcs-insights-topic">'+esc(topic)+'</p><h2>'+esc(label)+'</h2>'+
      (item.summary?'<p class="wcs-insights-summary">'+esc(item.summary)+'</p>':'')+
      '<div class="wcs-insights-card-footer"><span>'+esc(content.typeLabel(item.type))+(updated?' · '+esc(updated):'')+'<span class="wcs-insights-author">'+esc(author||'Author unavailable')+'</span>'+((item.documentKey||!options.prefiltered)?'<span class="document-view-count" data-document-views="'+esc(item.documentKey||item.id)+'">'+esc(options.viewLabel?options.viewLabel(item.documentKey||item.id):'Views unavailable')+'</span>':'')+'</span>'+(url?icon('arrow'):'')+'</div></div>'+(url?'</a>':'</div>')+'</article>';
  }
  function render(options) {
    options = options || {}; var model = select(options), filter = model.filter, active = fold(filter.type), id = 'wcs-insights-results';
    var tabs = ['all'].concat(model.types).map(function (type,index) { var selected = fold(type) === active; return '<button type="button" role="tab" aria-selected="'+selected+'" aria-controls="'+id+'" id="wcs-insights-tab-'+index+'" tabindex="'+(selected?'0':'-1')+'" data-wcs-insights-type="'+esc(type)+'">'+esc(type === 'all'?'All':content.typeLabel(type))+'</button>'; }).join('');
    var selectedIndex = ['all'].concat(model.types).findIndex(function (type) { return fold(type) === active; });
    var topicOptions = model.topics.slice(); if (filter.topic && !topicOptions.some(function (topic) { return fold(topic) === fold(filter.topic); })) topicOptions.unshift(filter.topic);
    var count = options.loading ? (model.total ? 'Updating insights…' : 'Loading insights…') : model.total+' '+(model.total===1?'insight':'insights')+(options.complete===false?' loaded':'');
    var cards = model.items.map(function (item) { return card(item, options); }).join('');
    var message = options.error ? '<div class="wcs-insights-message wcs-insights-error" role="alert"><p>'+esc(options.error)+'</p><button type="button" data-wcs-insights-retry>Try again</button></div>' : '';
    if (!cards && !options.loading && !options.error) cards = '<div class="wcs-insights-empty"><h2>'+(options.hasMore?'Continue exploring Insights':'No insights found')+'</h2><p>'+(filter.q || filter.topic || active!=='all' ? 'Try another topic or clear your filters.' : options.hasMore ? 'No matching articles in this batch. Load more to continue through Insights.' : 'Published guides, blogs, training and reports will appear here.')+'</p>'+((filter.q || filter.topic || active!=='all')?'<button type="button" data-wcs-insights-reset>Clear filters</button>':'')+'</div>';
    return '<section class="wcs-insights" aria-labelledby="wcs-insights-heading" data-wcs-insights-filter="'+esc(JSON.stringify(filter))+'">'+
      '<div class="wcs-insights-heading"><h1 id="wcs-insights-heading">All Insights</h1>'+
      '</div>'+
      '<div class="wcs-insights-controls"><div class="wcs-insights-tabs" role="tablist" aria-label="Insight type">'+tabs+'</div>'+
      '<form class="wcs-insights-search wcs-data-table-search" data-wcs-insights-search role="search"><label class="wcs-insights-sr" for="wcs-insights-query">Search insights</label><input id="wcs-insights-query" name="q" type="search" maxlength="200" value="'+esc(filter.q)+'" placeholder="Search insights" autocomplete="off"><button class="button" type="submit" aria-label="Search insights" aria-busy="'+Boolean(options.loading&&!options.appending)+'">Search</button></form>'+
      '<label class="wcs-insights-topic-filter"><span>Filter by</span><select aria-label="Filter by topic" data-wcs-insights-topic><option value="">Topics</option>'+topicOptions.map(function (topic) { return '<option value="'+esc(topic)+'"'+(fold(filter.topic)===fold(topic)?' selected':'')+'>'+esc(content.topicLabel(topic))+'</option>'; }).join('')+'</select></label></div>'+
      '<div class="wcs-insights-status" role="status" aria-live="polite">'+esc(count)+(options.complete===false&&!options.loading?' · More articles are available through search.':'')+'</div>'+message+
      '<div id="'+id+'" role="tabpanel"'+(selectedIndex>=0?' aria-labelledby="wcs-insights-tab-'+selectedIndex+'"':' aria-label="Insights results"')+' aria-busy="'+Boolean(options.loading)+'"><div class="wcs-insights-grid">'+cards+'</div></div>'+
      (model.hasMore || options.hasMore?'<div class="wcs-insights-more"><button type="button" data-wcs-insights-more'+(options.loading?' disabled'+(options.appending?' aria-busy="true"':''):'')+'>Load more</button></div>':'')+'</section>';
  }
  function bind(host, handlers) {
    if (!host || !host.querySelector) throw new Error('An Insights host is required.');
    if (mounts.has(host)) mounts.get(host).destroy();
    handlers = handlers || {}; var section = host.matches && host.matches('.wcs-insights') ? host : host.querySelector('.wcs-insights');
    if (!section) return {destroy:function () {}};
    function filter() { try { return JSON.parse(section.dataset.wcsInsightsFilter); } catch (_) { return {type:'all',topic:'',q:''}; } }
    function change(values) { if (typeof handlers.onFilter === 'function') handlers.onFilter(Object.assign({},filter(),values)); }
    function click(event) {
      var target = event.target.closest('button,a'); if (!target || !section.contains(target)) return;
      if (target.hasAttribute('data-wcs-insights-type')) { event.preventDefault(); change({type:target.dataset.wcsInsightsType}); }
      else if (target.hasAttribute('data-wcs-insights-reset')) { event.preventDefault(); change({type:'all',topic:'',q:''}); }
      else [['more','onMore'],['retry','onRetry']].some(function (pair) {
        if (!target.hasAttribute('data-wcs-insights-'+pair[0])) return false;
        if (typeof handlers[pair[1]] === 'function') { event.preventDefault(); handlers[pair[1]](); } return true;
      });
    }
    function submit(event) { if (!event.target.matches('[data-wcs-insights-search]')) return; event.preventDefault(); change({q:event.target.querySelector('[name=q]').value.trim()}); }
    function selection(event) { if (event.target.matches('[data-wcs-insights-topic]')) change({topic:event.target.value}); }
    function mediaError(event) {
      var img = event.target; if (!img.matches || !img.matches('.wcs-insights-cover img')) return;
      var cover = img.closest('.wcs-insights-cover'), card = img.closest('.wcs-insights-card');
      if (img.dataset.wcsCoverDefault!=='true' && img.dataset.wcsCoverFallback) {img.dataset.wcsCoverDefault='true';img.src=img.dataset.wcsCoverFallback;return;}
      if (cover) cover.innerHTML = placeholder(); if (card) card.classList.add('wcs-insights-card--text');
    }
    function key(event) {
      var tab = event.target.closest('[data-wcs-insights-type]'); if (!tab || !section.contains(tab)) return;
      var tabs = Array.from(section.querySelectorAll('[data-wcs-insights-type]')), index = tabs.indexOf(tab), next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length-1;
      if (next !== undefined) { event.preventDefault(); tabs.forEach(function (item,i) { item.tabIndex = i===next?0:-1; }); tabs[next].focus(); }
    }
    section.addEventListener('error',mediaError,true);
    section.querySelectorAll('.wcs-insights-cover img').forEach(function (img) { if (img.complete && !img.naturalWidth) mediaError({target:img}); });
    section.addEventListener('click',click); section.addEventListener('submit',submit); section.addEventListener('change',selection); section.addEventListener('keydown',key);
    var api = {destroy:function () { section.removeEventListener('error',mediaError,true); section.removeEventListener('click',click); section.removeEventListener('submit',submit); section.removeEventListener('change',selection); section.removeEventListener('keydown',key); if (mounts.get(host)===api) mounts.delete(host); }};
    mounts.set(host,api); return api;
  }
  return {render:render,select:select,bind:bind,defaultTypes:DEFAULT_TYPES.slice()};
});
