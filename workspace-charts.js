/* Reviewer analytics. Charts consume only the assigned records already loaded
 * by WCSpedia; no document data is sent to Highcharts or an export service.
 * Production authorization belongs to the workflow API, not these UI filters.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSWorkspaceCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000, WEEK = DAY * 7;
  var VERSION = '13.1.0';
  var SOURCES = Object.freeze({
    highchartsSrc: './vendor/highcharts-' + VERSION + '.js',
    accessibilitySrc: './vendor/highcharts-' + VERSION + '-accessibility.js'
  });
  var COLORS = Object.freeze({ navy: '#002d72', blue: '#255be3', cyan: '#007a9e', pale: '#edf3fb', muted: '#5b6c7e', line: '#dce4ec' });
  var scriptLoads = typeof WeakMap === 'function' ? new WeakMap() : null;
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function latest(doc) {
    return (Array.isArray(doc.versions) ? doc.versions : []).reduce(function (found, version) {
      return version && Number.isSafeInteger(version.version) && (!found || version.version > found.version) ? version : found;
    }, null);
  }
  function isoDay(at) { return new Date(at).toISOString().slice(0, 10); }
  function dayLabel(at) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(at)); }
  function summarize(documents, actorId, now, people) {
    var instant = now == null ? Date.now() : new Date(now).getTime();
    if (!Number.isFinite(instant)) throw new TypeError('A valid analytics date is required.');
    var date = new Date(instant), monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - ((date.getUTCDay() + 6) % 7) * DAY;
    var start = monday - 5 * WEEK;
    var actor = (Array.isArray(people) ? people : []).find(function (person) { return person && person.id === actorId; });
    var authorized = !!actor && (actor.role === 'Author' || actor.role === 'Manager');
    var result = {
      authorized: authorized, asOf: new Date(instant).toISOString(), startDate: isoDay(start), endDate: isoDay(instant),
      pending: { review: 0, approval: 0, total: 0 }, completed: { review: 0, approval: 0, total: 0 },
      weeks: Array.from({ length: 6 }, function (_, i) {
        return { start: isoDay(start + i * WEEK), label: dayLabel(start + i * WEEK), review: 0, approval: 0 };
      })
    };
    if (!authorized) return result;
    var seenDocuments = new Set();
    (Array.isArray(documents) ? documents : []).forEach(function (doc) {
      if (!doc || !doc.id || seenDocuments.has(doc.id) || doc.authorId === actorId) return;
      if (doc.reviewerId !== actorId && !(doc.approverId === actorId && actor.role === 'Manager')) return;
      seenDocuments.add(doc.id);
      var current = latest(doc);
      if (!current) return;
      if (current.status === 'In review' && doc.reviewerId === actorId) result.pending.review++;
      if (current.status === 'Awaiting approval' && doc.approverId === actorId && actor.role === 'Manager') result.pending.approval++;
      var seenRevisions = new Set();
      (Array.isArray(doc.audit) ? doc.audit : []).slice().sort(function (a, b) { return Date.parse(a && a.at) - Date.parse(b && b.at); }).forEach(function (event) {
        if (!event || event.actorId !== actorId || !Number.isSafeInteger(event.version) || event.version < 1 || !Number.isSafeInteger(event.revision) || event.revision < 1) return;
        var kind = event.action === 'complete-review' && event.fromStatus === 'In review' && event.toStatus === 'Awaiting approval' && doc.reviewerId === actorId ? 'review' :
          event.action === 'approve' && event.fromStatus === 'Awaiting approval' && event.toStatus === 'Published' && doc.approverId === actorId && actor.role === 'Manager' ? 'approval' : null;
        var at = Date.parse(event.at);
        if (!kind || !Number.isFinite(at) || at > instant) return;
        var key = [kind, event.version, event.revision].join(':');
        if (seenRevisions.has(key)) return;
        // One revision/decision is counted once, even if an API page repeats an
        // event. The first valid decision fixes its week, including older weeks.
        seenRevisions.add(key);
        if (at < start) return;
        var bucket = Math.floor((at - start) / WEEK);
        if (bucket >= 0 && bucket < 6) { result.weeks[bucket][kind]++; result.completed[kind]++; }
      });
    });
    result.pending.total = result.pending.review + result.pending.approval;
    result.completed.total = result.completed.review + result.completed.approval;
    return result;
  }
  function markup(summary) {
    if (!summary || !summary.authorized) return '';
    var pendingRows = [['Content review', summary.pending.review], ['Manager approval', summary.pending.approval]];
    return '<section class="workspace-analytics" aria-labelledby="workspace-analytics-title" data-workspace-analytics>' +
      '<div class="workspace-analytics-heading"><div><div class="eyebrow">Your review activity</div><h2 id="workspace-analytics-title">A clear view of what needs you.</h2><p>Your assigned work and recorded decisions, through ' + escape(dayLabel(Date.parse(summary.asOf))) + '.</p></div><span class="workspace-analytics-period">Last six weeks · UTC</span></div>' +
      '<div class="workspace-analytics-metrics"><div><strong>' + summary.pending.total + '</strong><span>Waiting for your decision</span></div><div><strong>' + summary.completed.review + '</strong><span>Revisions reviewed</span></div><div><strong>' + summary.completed.approval + '</strong><span>Revisions approved</span></div></div>' +
      '<div class="workspace-chart-grid"><article class="workspace-chart-card"><h3>Waiting for you</h3><p class="workspace-chart-description">' + summary.pending.review + ' content reviews and ' + summary.pending.approval + ' manager approvals.</p>' +
      '<div class="workspace-chart-visual" data-chart="pending" hidden></div>' +
      '<details class="workspace-chart-table" data-chart-table="pending" open><summary>View pending-work data</summary><table><caption class="sr-only">Documents currently awaiting your decision</caption><thead><tr><th scope="col">Stage</th><th scope="col">Documents</th></tr></thead><tbody>' + pendingRows.map(function (row) { return '<tr><th scope="row">' + row[0] + '</th><td>' + row[1] + '</td></tr>'; }).join('') + '</tbody></table></details></article>' +
      '<article class="workspace-chart-card"><h3>Your completed decisions</h3><p class="workspace-chart-description">Distinct document revisions reviewed or approved each week.</p>' +
      '<div class="workspace-chart-visual" data-chart="activity" hidden></div>' +
      '<details class="workspace-chart-table" data-chart-table="activity" open><summary>View weekly activity data</summary><table><caption class="sr-only">Your decisions by week beginning, in UTC</caption><thead><tr><th scope="col">Week beginning</th><th scope="col">Reviewed</th><th scope="col">Approved</th></tr></thead><tbody>' + summary.weeks.map(function (week) { return '<tr><th scope="row"><time datetime="' + week.start + '">' + escape(week.label) + '</time></th><td>' + week.review + '</td><td>' + week.approval + '</td></tr>'; }).join('') + '</tbody></table></details></article></div>' +
      '<p class="workspace-chart-note" role="status" data-chart-message>Chart data is ready. Loading the visual view…</p>' +
      '<p class="workspace-analytics-method">Pending work uses the latest document version. Activity counts each review or approval once per revision; the current week is in progress.</p></section>';
  }
  function sourceUrl(source, doc) {
    if (typeof source !== 'string' || !source.trim()) return null;
    try {
      var value = new URL(source, doc.baseURI);
      if (value.username || value.password) return null;
      var base = new URL(doc.baseURI);
      if (value.protocol === 'https:' && base.origin === value.origin) return value.href;
      if (value.protocol === 'http:' && base.origin === value.origin) return value.href;
      if (value.protocol === 'file:' && base.protocol === 'file:') return value.href;
    } catch (_) { /* Keep the data tables when a host URL is not configured. */ }
    return null;
  }
  function loadScript(doc, src, integrity) {
    var url = sourceUrl(src, doc);
    if (!url) return Promise.reject(new Error('Chart source unavailable.'));
    if (doc.defaultView && doc.defaultView.WCSLibraryLoader) return doc.defaultView.WCSLibraryLoader.load(url, 10000);
    var cache = scriptLoads && scriptLoads.get(doc);
    if (!cache) { cache = new Map(); if (scriptLoads) scriptLoads.set(doc, cache); }
    if (cache.has(url)) return cache.get(url);
    var promise = new Promise(function (resolve, reject) {
      var script = doc.createElement('script'), timer;
      function finish(error) {
        clearTimeout(timer); script.onload = script.onerror = null;
        if (error) { script.remove(); cache.delete(url); reject(error); } else resolve();
      }
      script.async = true; script.src = url; script.referrerPolicy = 'no-referrer';
      if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
      script.onload = function () { finish(); };
      script.onerror = function () { finish(new Error('Chart source unavailable.')); };
      timer = setTimeout(function () { finish(new Error('Chart loading timed out.')); }, 10000);
      doc.head.appendChild(script);
    });
    cache.set(url, promise);
    return promise;
  }
  function commonOptions(accessibility) {
    return {
      chart: { backgroundColor: 'transparent', animation: false, reflow: false, height: 286, style: { fontFamily: 'inherit' }, spacing: [12, 6, 16, 6] },
      title: { text: null }, credits: { enabled: false }, exporting: { enabled: false },
      accessibility: { enabled: accessibility },
      colors: [COLORS.blue, COLORS.navy, COLORS.cyan],
      legend: { itemStyle: { color: COLORS.navy, fontWeight: 'normal', fontSize: '12px' }, symbolRadius: 3, itemDistance: 20 },
      tooltip: { backgroundColor: '#fff', borderColor: COLORS.line, borderRadius: 9, shadow: false, style: { color: COLORS.navy, fontSize: '13px' }, valueDecimals: 0 },
      plotOptions: { series: { animation: false, borderWidth: 0, states: { inactive: { opacity: 1 } } } }
    };
  }
  function chartOptions(summary, accessibility) {
    var pending = commonOptions(accessibility), activity = commonOptions(accessibility);
    pending.chart.type = 'pie';
    pending.accessibility.description = 'Documents currently waiting for your decision: ' + summary.pending.review + ' content reviews and ' + summary.pending.approval + ' manager approvals.';
    pending.plotOptions.pie = { innerSize: '74%', size: '84%', showInLegend: true, dataLabels: { enabled: false }, borderRadius: 0, slicedOffset: 0 };
    pending.tooltip.pointFormat = '<b>{point.y}</b> documents';
    pending.series = [{ name: 'Waiting for your decision', data: [{ name: 'Content review', y: summary.pending.review, color: COLORS.blue }, { name: 'Manager approval', y: summary.pending.approval, color: COLORS.navy }] }];
    pending.title = { text: String(summary.pending.total), verticalAlign: 'middle', y: -4, style: { color: COLORS.navy, fontSize: '40px', fontWeight: 'normal' } };
    pending.subtitle = { text: 'pending', verticalAlign: 'middle', y: 20, style: { color: COLORS.muted, fontSize: '13px' } };
    activity.chart.type = 'column';
    activity.accessibility.description = 'Your completed review and approval decisions over the last six weeks. Each document revision and action is counted once.';
    activity.xAxis = { categories: summary.weeks.map(function (week) { return week.label; }), tickLength: 0, lineColor: COLORS.line, labels: { style: { color: COLORS.muted, fontSize: '11px' } }, title: { text: 'Week beginning (UTC)', style: { color: COLORS.muted, fontSize: '11px' } } };
    activity.yAxis = { min: 0, allowDecimals: false, title: { text: null }, gridLineColor: COLORS.line, labels: { style: { color: COLORS.muted, fontSize: '11px' } }, softMax: 3 };
    activity.plotOptions.column = { borderRadius: 3, groupPadding: 0.18, pointPadding: 0.08, maxPointWidth: 28 };
    activity.tooltip.shared = true;
    activity.series = [{ name: 'Reviewed', color: COLORS.blue, data: summary.weeks.map(function (week) { return week.review; }) }, { name: 'Approved', color: COLORS.navy, data: summary.weeks.map(function (week) { return week.approval; }) }];
    return { pending: pending, activity: activity };
  }
  function mount(container, summary, config) {
    config = config || {};
    var alive = true, charts = [], observer = null, resize = null, view = container && container.ownerDocument && container.ownerDocument.defaultView;
    var section = container && (container.matches('[data-workspace-analytics]') ? container : container.querySelector('[data-workspace-analytics]'));
    function status(message) { if (alive && section) { var target = section.querySelector('[data-chart-message]'); if (target) target.textContent = message; } }
    function fallback(message) {
      if (!alive || !section) return;
      section.querySelectorAll('[data-chart]').forEach(function (element) { element.hidden = true; });
      section.querySelectorAll('[data-chart-table]').forEach(function (element) { element.open = true; });
      status(message);
    }
    function destroyCharts() { charts.splice(0).forEach(function (chart) { try { chart.destroy(); } catch (_) {} }); }
    function destroy() {
      alive = false;
      if (observer) observer.disconnect();
      if (resize && view) view.removeEventListener('resize', resize);
      destroyCharts();
    }
    var ready = Promise.resolve().then(async function () {
      if (!section || !view || !summary || !summary.authorized) return false;
      if (config.enabled === false) { fallback('Data view. Interactive charts are turned off.'); return false; }
      var doc = container.ownerDocument;
      if (!view.Highcharts || typeof view.Highcharts.chart !== 'function') {
        if (config.offline || (config.allowCDN === false && !config.highchartsSrc)) { fallback('Data view. Interactive charts are unavailable offline.'); return false; }
        await loadScript(doc, config.highchartsSrc || SOURCES.highchartsSrc, config.highchartsIntegrity);
      }
      if (!alive) return false;
      var highcharts = view.Highcharts;
      if (!highcharts || typeof highcharts.chart !== 'function') throw new Error('Highcharts is not exposed on this page.');
      var accessible = !!(highcharts.Accessibility||highcharts.AccessibilityComponent);
      if (!accessible && !config.offline && config.accessibilitySrc !== false && (config.allowCDN !== false || config.accessibilitySrc)) {
        try { await loadScript(doc, config.accessibilitySrc || SOURCES.accessibilitySrc, config.accessibilityIntegrity); accessible = !!(highcharts.Accessibility||highcharts.AccessibilityComponent); } catch (_) { /* Semantic tables remain available. */ }
      }
      if (!alive) return false;
      var options = chartOptions(summary, accessible);
      ['pending', 'activity'].forEach(function (name) {
        var element = section.querySelector('[data-chart="' + name + '"]');
        if (!element) return;
        element.hidden = false;
        charts.push(highcharts.chart(element, options[name]));
        section.querySelector('[data-chart-table="' + name + '"]').open = false;
      });
      resize = function () { if (alive) charts.forEach(function (chart) { chart.reflow(); }); };
      if (view.ResizeObserver) { observer = new view.ResizeObserver(resize); section.querySelectorAll('[data-chart]').forEach(function (element) { observer.observe(element); }); }
      else view.addEventListener('resize', resize);
      status('Based on your assigned documents and recorded workflow decisions.');
      return true;
    }).catch(function () { destroyCharts(); fallback('Interactive charts are unavailable. The complete data is shown in the tables.'); return false; });
    return { ready: ready, destroy: destroy };
  }
  return Object.freeze({ summarize: summarize, markup: markup, mount: mount, chartOptions: chartOptions, version: VERSION, sources: SOURCES, colors: COLORS });
});
