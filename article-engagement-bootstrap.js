/* Native article engagement. Deferred, scoped and independent of comment loading. */
(function (global, doc) {
  'use strict';
  if (global.WCSArticleEngagementBootstrap) return;
  var settings = global.WCS_ARTICLE_DISCUSSION_CONFIG, timer, request, host, stopped = false, generation = 0, started = false;
  var voteAction = '', voteBusy = false, voteUnknown = false, pendingVoteValue = null, feedback, state, engagement, voteNotice, counter, yes, no, check, retry;
  function candidate() {
    if (!settings || settings.authoringMode !== 'confluence-session' || global.top !== global.self || doc.querySelector('#wcspedia, #editpageform, #wysiwygTextarea, #content-editor, body.contenteditor')) return '';
    var url = new URL(global.location.href), action = doc.querySelector('meta[name="ajs-action"]'), space = doc.querySelector('meta[name="ajs-space-key"]');
    if (url.searchParams.get('wcsNativeUi') === '1' || action && action.content !== 'viewpage' || space && space.content !== settings.spaceKey) return '';
    if (!(/\/pages\/viewpage\.action$/.test(url.pathname) || /\/display\/[^/]+\/.+/.test(url.pathname) || /\/spaces\/[^/]+\/pages\/\d+(?:\/.*)?$/.test(url.pathname))) return '';
    var blocked = false;
    url.searchParams.forEach(function (value, key) { if (/preview/i.test(key) || /^pageVersion$/i.test(key) || /^(action|mode)$/i.test(key) && /^(edit|create|preview|history)$/i.test(value)) blocked = true; });
    if (blocked) return '';
    var meta = doc.querySelector('meta[name="ajs-page-id"]'), id = meta && meta.content || url.searchParams.get('pageId') || (url.pathname.match(/\/pages\/(\d+)(?:\/|$)/) || [])[1] || '';
    var excluded = [settings.rootPageId, settings.attachmentPageId, settings.workingRootPageId, settings.insightsPageId].concat(Object.values(settings.pageIds || {}), Object.values(settings.areaPageIds || {}), settings.excludePageIds || []);
    return /^[1-9]\d*$/.test(id) && !excluded.map(String).includes(String(id)) ? String(id) : '';
  }
  function config() {
    return Object.assign({}, settings, {mode: 'confluence', nativePublication: {areaPageIds: settings.areaPageIds, workingRootPageId: settings.workingRootPageId, insightsPageId: settings.insightsPageId}, search: {excludePageIds: settings.excludePageIds || [], excludeAncestorIds: settings.excludeAncestorIds || []}});
  }
  function el(tag, cls, text) { var node = doc.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; }
  function notify(type, text) { if (global.WCSNotifications && global.WCSNotifications[type]) global.WCSNotifications[type](text); }
  function button(value, label) {
    var b = el('button', 'wcs-discussion-button wcs-discussion-reaction'); b.type = 'button'; b.dataset.vote = value; b.setAttribute('aria-label', label);
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [['viewBox','0 0 24 24'],['width','24'],['height','24'],['aria-hidden','true'],['fill','none'],['stroke','currentColor'],['stroke-width','1.7'],['stroke-linecap','round']].forEach(function (attr) { svg.setAttribute(attr[0], attr[1]); });
    [['circle',{cx:'12',cy:'12',r:'9'}],['circle',{cx:'8.5',cy:'9.5',r:'.8',fill:'currentColor',stroke:'none'}],['circle',{cx:'15.5',cy:'9.5',r:'.8',fill:'currentColor',stroke:'none'}],['path',{d:value==='yes'?'M7.8 13.5c1.2 3.7 7.2 3.7 8.4 0':'M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0'}]].forEach(function (part) {
      var shape = doc.createElementNS('http://www.w3.org/2000/svg', part[0]); Object.keys(part[1]).forEach(function (key) { shape.setAttribute(key, part[1][key]); }); svg.append(shape);
    });
    b.append(svg, el('span', '', label)); b.addEventListener('click', function () { saveVote(value); }); return b;
  }
  function renderVote() {
    yes.disabled = no.disabled = voteBusy || voteUnknown || !state || !state.canVote;
    yes.setAttribute('aria-pressed', String(!!state && state.vote === 'yes')); no.setAttribute('aria-pressed', String(!!state && state.vote === 'no'));
    check.hidden = !voteUnknown;
    check.disabled = voteBusy;
    yes.setAttribute('aria-busy', String(voteBusy && voteAction === 'save' && state?.vote === 'yes'));
    no.setAttribute('aria-busy', String(voteBusy && voteAction === 'save' && state?.vote === 'no'));
    check.setAttribute('aria-busy', String(voteBusy && voteAction === 'check'));
    retry.setAttribute('aria-busy', String(voteBusy && voteAction === 'retry'));
    retry.hidden = !voteUnknown || !pendingVoteValue;
    retry.disabled = voteBusy || !state || !state.canVote;
  }
  function renderCount(value) {
    if (Number.isSafeInteger(value) && value >= 0) counter.textContent = new Intl.NumberFormat('en-GB').format(value) + (value === 1 ? ' recorded view' : ' recorded views');
    else counter.textContent = 'Recorded views unavailable';
  }
  async function saveVote(value, retrying) {
    if (stopped || voteBusy || !state || !state.canVote || (voteUnknown ? !retrying || value !== pendingVoteValue : retrying || state.vote === value)) return;
    var before = state, current = generation; voteBusy = true; voteAction = retrying ? 'retry' : 'save'; state = Object.assign({}, state, {vote:value}); renderVote(); voteNotice.textContent = 'Saving…';
    try {
      var result = await feedback.save(value, {signal:request.signal}); if (stopped || current !== generation) return;
      state = result; voteUnknown = false; pendingVoteValue = null; voteNotice.textContent = 'Thank you. Your feedback is saved.'; notify('success','Feedback saved.');
    } catch (error) {
      if (stopped || current !== generation) return; state = before;
      voteUnknown = retrying || error.outcome !== 'rejected'; pendingVoteValue = voteUnknown ? value : null;
      voteNotice.textContent = voteUnknown ? 'The save could not be confirmed. Check saved feedback or retry the original vote.' : (error.message || 'Feedback was not saved. Please try again.');
      notify(voteUnknown ? 'warning' : 'error', voteNotice.textContent);
    } finally { if (current === generation) { voteBusy = false; if (!stopped) renderVote(); } }
  }
  async function checkVote() {
    if (voteBusy || stopped) return;
    var current = generation; voteBusy = true; voteAction = 'check'; renderVote();
    try {
      var result = await feedback.load({signal:request.signal}); if (stopped || current !== generation) return; state = result;
      voteUnknown = !!state.pendingVote; pendingVoteValue = voteUnknown ? state.pendingVote.value : null;
      voteNotice.textContent = voteUnknown ? 'The original vote is still unconfirmed. Check again or retry that same vote.' : state.canVote ? 'Saved feedback checked.' : state.reason;
    }
    catch (_) { if (!stopped && current === generation) voteNotice.textContent = 'Saved feedback could not be checked. Try again when connected.'; }
    finally { if (current === generation) { voteBusy = false; if (!stopped) renderVote(); } }
  }
  function mount(data) {
    var content = Array.from(doc.querySelectorAll('#main-content,.wiki-content')).find(function (node) { return !node.closest('#navHeader,#navBar,#header,header,.aui-header,[role="banner"],[data-wcs-header-actions]'); }); if (!content) return false;
    host = el('div','wcs-article-discussion wcs-article-engagement'); host.dataset.wcsArticleEngagement = ''; host.setAttribute('role','region'); host.setAttribute('aria-label','Article feedback and recorded views');
    var row = el('div','wcs-article-engagement-row'); counter = el('span','wcs-article-recorded-views');
    counter.title = 'Successful WCSpedia recordings by signed-in users with native metadata-write permission; one per account per 30 minutes. This is not Confluence’s total page traffic.';
    renderCount(data.views && data.views.recordedViews); row.append(counter);
    var helpful = el('div','wcs-discussion-helpful'); helpful.append(el('span','wcs-discussion-helpful-label','Was this article helpful?'));
    var votes = el('div','wcs-discussion-votes'); votes.setAttribute('role','group'); votes.setAttribute('aria-label','Was this article helpful?');
    yes = button('yes','Helpful'); no = button('no','Not helpful'); votes.append(yes,no); helpful.append(votes);
    voteNotice = el('span','wcs-discussion-vote-status'); voteNotice.setAttribute('role','status');
    if (!data.canVote) voteNotice.textContent = data.reason || 'Native Confluence edit permission is required to save feedback.';
    helpful.append(voteNotice); check = el('button','wcs-discussion-button','Check saved feedback'); check.type = 'button'; check.hidden = true; check.addEventListener('click',checkVote); helpful.append(check);
    retry = el('button','wcs-discussion-button','Retry original vote'); retry.type = 'button'; retry.hidden = true; retry.addEventListener('click',function () { saveVote(pendingVoteValue,true); }); helpful.append(retry);
    row.append(helpful); host.append(row);
    var discussion = content.querySelector('[data-wcs-article-discussion-host]'); if (discussion) content.insertBefore(host,discussion); else content.append(host);
    return true;
  }
  async function start() {
    var id = candidate(); if (started || stopped || !id || doc.visibilityState === 'hidden') return;
    started = true; var current = generation; request = new global.AbortController();
    function active() { return !stopped && generation === current && candidate() === id; }
    try {
      engagement = global.WCSSpaceEngagement.create(config());
      var data = await engagement.load(id,{signal:request.signal}); if (!active()) return;
      // A tab hidden during the read must still qualify for a fresh visible
      // visit later. Do not mount or record while it is hidden.
      if (doc.visibilityState === 'hidden') { started = false; return; }
      feedback = global.WCSArticleFeedback.create({authoringMode:'confluence-session',config:config(),pageId:id,engagement:engagement});
      // Validate and prime the adapter without a second metadata fetch.
      state = feedback.prime ? feedback.prime(data) : await feedback.load({signal:request.signal});
      voteUnknown = !!state.pendingVote; pendingVoteValue = voteUnknown ? state.pendingVote.value : null;
      if (!active() || !mount(data)) return; renderVote();
      if (voteUnknown) voteNotice.textContent = 'The original vote is still unconfirmed. Check again or retry that same vote.';
      if (data.canRecord && doc.visibilityState !== 'hidden') {
        try { var result = await engagement.recordView(id,{signal:request.signal}); if (active()) renderCount(result.recordedViews); }
        catch (error) { if (active()) { counter.title = 'This visit was not confirmed: ' + error.message; counter.textContent += ' · recording unavailable'; } }
      }
    } catch (error) {
      if (!active() || error.name === 'AbortError' || ['SCOPE','OUT_OF_SCOPE','FORBIDDEN','CONFIGURATION','NOT_FOUND'].includes(error.code)) return;
      var content = Array.from(doc.querySelectorAll('#main-content,.wiki-content')).find(function (node) { return !node.closest('#navHeader,#navBar,#header,header,.aui-header,[role="banner"],[data-wcs-header-actions]'); });
      if (content) { host = el('div','wcs-engagement-unavailable','Article feedback and recorded views are temporarily unavailable.'); host.setAttribute('role','status'); content.append(host); }
    }
  }
  function schedule() { clearTimeout(timer); if (!stopped && !started && candidate() && doc.visibilityState !== 'hidden') timer = setTimeout(start,2000); }
  function destroy() { stopped = true; generation++; clearTimeout(timer); if (request) request.abort(); if (host) host.remove(); host = null; }
  global.WCSArticleEngagementBootstrap = Object.freeze({destroy:destroy});
  doc.addEventListener('visibilitychange',schedule);
  global.addEventListener('pagehide',destroy);
  global.addEventListener('pageshow',function (event) { if (event.persisted) { stopped = started = voteBusy = voteUnknown = false; state = null; pendingVoteValue = null; schedule(); } });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})(window,document);
