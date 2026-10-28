/* Native article comments: bounded reads and optimistic writes, with no page reload. */
(function (global) {
  'use strict';
  if (global.WCSArticleDiscussion) return;
  var sequence = 0;
  var mounts = new WeakMap();

  function mount(host, options) {
    options = options || {};
    if (!host || !host.ownerDocument || !options.adapter) throw new Error('An article host and comments adapter are required.');
    if (mounts.has(host)) return mounts.get(host);
    var doc = host.ownerDocument, adapter = options.adapter, feedback = options.feedback;
    var discussionPageId = /^[1-9]\d{0,19}$/.test(String(options.pageId || '')) ? String(options.pageId) : '';
    var id = 'wcs-discussion-' + (++sequence), disposed = false, loading = null, observer = null;
    var comments = [], cursor = null, canComment = false, user = {}, pending = null, reply = null, mutationEpoch = 0;
    var voteState = null, voteBusy = false, voteUnknown = false, controllers = new Set();
    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = String(text);
      return node;
    }
    function button(text, className, action) {
      var node = el('button', 'wcs-discussion-button' + (className ? ' ' + className : ''), text);
      node.type = 'button';
      if (action) node.addEventListener('click', action);
      return node;
    }
    function reaction(value, text) {
      var node = button('', 'wcs-discussion-reaction', function () { saveVote(value); });
      node.dataset.vote = value; node.setAttribute('aria-label', text); node.setAttribute('aria-pressed', 'false');
      var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      [['circle', {cx:'12', cy:'12', r:'9'}], ['circle', {cx:'8.5', cy:'9.5', r:'.8', fill:'currentColor', stroke:'none'}], ['circle', {cx:'15.5', cy:'9.5', r:'.8', fill:'currentColor', stroke:'none'}], ['path', {d:value === 'yes' ? 'M7.8 13.5c1.2 3.7 7.2 3.7 8.4 0' : 'M7.8 16.2c1.2-3.7 7.2-3.7 8.4 0'}]].forEach(function (part) {
        var shape = doc.createElementNS('http://www.w3.org/2000/svg', part[0]);
        Object.keys(part[1]).forEach(function (name) { shape.setAttribute(name, part[1][name]); }); svg.append(shape);
      });
      node.append(svg, el('span', '', text)); return node;
    }
    function notify(kind, text) {
      if (global.WCSNotifications && typeof global.WCSNotifications[kind] === 'function') global.WCSNotifications[kind](text);
    }
    function controller() { var item = new global.AbortController(); controllers.add(item); return item; }
    function finish(item) { controllers.delete(item); }
    function unknown(error) { return !error || !(error.outcome === 'rejected' || error.definite === true || error.unknownCommit === false); }
    function authorName(value) { return String(value && (value.displayName || value.name) || 'Confluence user'); }
    function initials(value) { return authorName(value).split(/[\s,]+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0); }).join('').toUpperCase(); }
    function setMessage(text, isError) {
      message.textContent = text || '';
      message.classList.toggle('wcs-discussion-error', !!isError);
      message.setAttribute('role', isError ? 'alert' : 'status');
    }
    function safeURL(value) {
      if (!value) return '';
      try { var url = new URL(value, global.location.href); return url.origin === global.location.origin && /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
    }
    var root = el('div', 'wcs-article-discussion');
    root.setAttribute('role', 'region'); root.setAttribute('aria-labelledby', id + '-heading');
    var helpful = el('div', 'wcs-discussion-helpful'); helpful.hidden = true;
    var helpfulLabel = el('span', 'wcs-discussion-helpful-label', 'Was this article helpful?');
    var votes = el('div', 'wcs-discussion-votes'); votes.setAttribute('role', 'group'); votes.setAttribute('aria-label', 'Was this article helpful?');
    var yes = reaction('yes', 'Helpful');
    var no = reaction('no', 'Not helpful');
    var voteMessage = el('span', 'wcs-discussion-vote-status'); voteMessage.setAttribute('role', 'status');
    votes.append(yes, no); helpful.append(helpfulLabel, votes, voteMessage);
    var headingRow = el('div', 'wcs-discussion-heading');
    var heading = el('h2', '', 'Comments'); heading.id = id + '-heading';
    var count = el('span', 'wcs-discussion-count');
    headingRow.append(heading, count, helpful);
    var introduction = el('p', 'wcs-discussion-intro', 'Ask a question or share something useful with your colleagues.');
    var list = el('ol', 'wcs-discussion-list'); list.setAttribute('aria-label', 'Article comments');
    var message = el('p', 'wcs-discussion-message', 'Comments load when you reach this section.'); message.setAttribute('role', 'status');
    var loadButton = button('Load comments', '', function () { load(); });
    var more = button('Load more comments', '', function () { load(true); }); more.hidden = true;
    var form = el('form', 'wcs-discussion-form'); form.hidden = true;
    var label = el('label', 'wcs-discussion-label', 'Add a comment'); label.htmlFor = id + '-text';
    var textarea = el('textarea', 'wcs-discussion-textarea'); textarea.id = id + '-text'; textarea.rows = 4; textarea.maxLength = 10000; textarea.required = true;
    textarea.placeholder = 'Write your comment…'; textarea.setAttribute('aria-describedby', id + '-hint');
    var hint = el('p', 'wcs-discussion-hint', 'Your comment is saved on this Confluence article.'); hint.id = id + '-hint';
    var actions = el('div', 'wcs-discussion-compose-actions');
    var cancel = button('Cancel reply', 'wcs-discussion-quiet', function () { reply = null; syncComposer(); textarea.focus(); }); cancel.hidden = true;
    var submit = button('Post comment', 'wcs-discussion-primary'); submit.type = 'submit';
    actions.append(cancel, submit); form.append(label, textarea, hint, actions);
    root.append(headingRow, introduction, form, list, message, loadButton, more); host.append(root);

    function syncComposer() {
      form.hidden = !canComment && !textarea.value.trim();
      label.textContent = !canComment ? 'Your draft' : reply ? 'Reply to ' + authorName(reply.author) : 'Add a comment';
      cancel.hidden = !reply; cancel.disabled = !!pending || !canComment;
      textarea.readOnly = !!pending || !canComment; submit.hidden = !canComment; submit.disabled = !canComment || !!pending || !textarea.value.trim();
      hint.textContent = canComment ? 'Your comment is saved on this Confluence article.' : 'Posting is unavailable. You can copy this draft and open Confluence comments.';
      submit.setAttribute('aria-busy', String(!!pending && !pending.unknown));
      submit.textContent = pending ? (pending.unknown ? 'Confirmation unavailable' : 'Posting…') : (reply ? 'Post reply' : 'Post comment');
    }
    function commentNode(comment) {
      var item = el('li', 'wcs-discussion-item'); item.dataset.commentId = String(comment.id);
      if (comment.pending) item.classList.add('wcs-discussion-pending');
      if (comment.parentId) item.classList.add('wcs-discussion-reply');
      var avatar = el('span', 'wcs-discussion-avatar', initials(comment.author)); avatar.setAttribute('aria-hidden', 'true');
      var card = el('div', 'wcs-discussion-card');
      var meta = el('div', 'wcs-discussion-meta'); meta.append(el('strong', 'wcs-discussion-author', authorName(comment.author)));
      if (comment.parentId) meta.append(el('span', 'wcs-discussion-reply-label', 'replied'));
      if (comment.pending) meta.append(el('span', 'wcs-discussion-pending-label', comment.unknown ? 'Awaiting confirmation' : 'Posting…'));
      else if (comment.createdAt && Number.isFinite(Date.parse(comment.createdAt))) {
        var date = new Date(comment.createdAt), time = el('time', '', date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}));
        time.dateTime = date.toISOString(); meta.append(time);
      }
      var body = el('div', 'wcs-discussion-body', comment.text || ''); card.append(meta, body);
      if (!comment.pending && canComment && !pending && options.replies === true) {
        var respond = button('Reply', 'wcs-discussion-quiet', function () { reply = comment; syncComposer(); textarea.focus(); });
        card.append(respond);
      }
      item.append(avatar, card); return item;
    }
    function renderList() {
      list.replaceChildren(); comments.forEach(function (comment) { list.append(commentNode(comment)); });
      if (pending) list.append(commentNode(pending));
      count.textContent = comments.length ? String(comments.length) + (cursor !== null ? '+' : '') : '';
      more.hidden = cursor === null; more.disabled = !!loading || !!pending;
    }
    function merge(items, reset) {
      var all = reset ? [] : comments.slice(), seen = new Set(all.map(function (item) { return String(item.id); }));
      (Array.isArray(items) ? items : []).forEach(function (item) {
        if (!item || !item.id || seen.has(String(item.id))) return;
        seen.add(String(item.id)); all.push(item);
      });
      comments = all;
    }
    function externalComment(event) {
      // This event carries a confirmed native write, not an instruction to fetch
      // or change permissions. Keep the composer, pending write and cursor intact.
      var detail=event && event.detail, comment=detail && detail.comment;
      if(disposed || !discussionPageId || !detail || String(detail.pageId)!==discussionPageId || !comment || String(comment.pageId)!==discussionPageId || !/^[1-9]\d{0,19}$/.test(String(comment.id||'')) || typeof comment.text!=='string' || comment.text.length>10000 || comment.pending || comment.parentId || !comment.author || typeof comment.author.id!=='string' || !comment.author.id || comment.author.id.length>255) return;
      if(comments.some(function(item){return String(item.id)===String(comment.id);}))return;
      var received={id:String(comment.id),pageId:discussionPageId,text:comment.text,author:{id:comment.author.id,displayName:String(comment.author.displayName||'Confluence user').slice(0,255)},createdAt:typeof comment.createdAt==='string'&&Number.isFinite(Date.parse(comment.createdAt))?comment.createdAt:null,parentId:null};
      mutationEpoch++;merge([received]);renderList();
    }
    global.addEventListener('wcs:article-comment-created',externalComment);
    async function load(append) {
      if (disposed || loading || (append && pending)) return loading;
      if (observer) { observer.disconnect(); observer = null; }
      var request = controller(), requestEpoch = mutationEpoch;
      loadButton.hidden = !!append; loadButton.disabled = true; loadButton.setAttribute('aria-busy', String(!append)); more.disabled = true; more.setAttribute('aria-busy', String(!!append)); list.setAttribute('aria-busy', 'true'); setMessage('Loading comments…');
      loading = (async function () {
        try {
          var result = await Promise.resolve().then(function () { if (disposed || request.signal.aborted) throw new Error('Read cancelled'); return adapter.load({cursor: append ? cursor : null, signal: request.signal}); });
          if (disposed) return;
          merge(result.comments, !!(!append && !pending && requestEpoch === mutationEpoch)); cursor = result.nextCursor == null ? null : result.nextCursor;
          loadButton.hidden = true; canComment = result.canComment === true; user = result.user || user;
          if (pending && pending.unknown && typeof adapter.reconcile === 'function') {
            var reconciled = await adapter.reconcile(pending, {signal: request.signal});
            if (disposed) return;
            if (reconciled && reconciled.id) { merge([reconciled]); pending = null; textarea.value = ''; reply = null; notify('success', 'Comment posted.'); }
          }
          setMessage(comments.length || pending ? '' : 'No comments yet. Start the conversation.');
          if (!canComment && !pending) setMessage('Commenting is unavailable for this account on this article.');
          if (typeof options.onLoaded === 'function') { try { options.onLoaded(result); } catch (_) { /* Host decoration cannot turn a successful read into an error. */ } }
        } catch (error) {
          if (disposed || request.signal.aborted) return;
          setMessage('Comments could not be loaded. Please try again.', true); nativeLink(); loadButton.textContent = 'Retry loading comments'; loadButton.hidden = false;
        } finally {
          finish(request); loading = null; more.removeAttribute('aria-busy'); loadButton.removeAttribute('aria-busy'); loadButton.disabled = false;
          if (!disposed) { list.removeAttribute('aria-busy'); renderList(); syncComposer(); if (pending && pending.unknown) unknownMessage(); }
        }
      })();
      if (!append && feedback && !voteState) loadFeedback();
      return loading;
    }
    function nativeLink() {
      var url = safeURL(options.nativeCommentsUrl);
      if (url) { var link = el('a', 'wcs-discussion-native-link', 'Open Confluence comments'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; message.append(doc.createTextNode(' '), link); }
    }
    function unknownMessage() {
      setMessage('Confluence may have saved your comment, but confirmation was interrupted. Check the comments before posting it again.', true);
      nativeLink();
      loadButton.textContent = 'Check comments'; loadButton.hidden = false;
    }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var text = textarea.value.trim();
      if (disposed || pending || !canComment || !text) return;
      mutationEpoch++;
      pending = {id: 'pending-' + Date.now(), text: text, author: user, createdAt: new Date().toISOString(), parentId: reply && reply.id || null, pending: true};
      var request = controller(), sending = pending;
      renderList(); syncComposer(); setMessage('Posting your comment…');
      try {
        var result = await adapter.create({text: text, parentId: sending.parentId, signal: request.signal});
        if (disposed) return;
        if (!result || !result.id) throw new Error('Missing save confirmation');
        merge([result]); pending = null; textarea.value = ''; reply = null; setMessage('Comment posted.'); notify('success', 'Comment posted.');
      } catch (error) {
        if (disposed) return;
        if (unknown(error)) { pending.unknown = true; unknownMessage(); notify('warning', 'Comment confirmation was interrupted. Check before posting again.'); }
        else {
          pending = null;
          if (error.code === 'COMMENTS_DISABLED' || error.code === 'SETTINGS_INVALID' || error.code === 'SETTINGS_UNAVAILABLE') { canComment = false; setMessage(error.code === 'COMMENTS_DISABLED' ? 'Comments are disabled for this article. Your draft is still available to copy.' : 'Comment settings could not be verified. Your draft is still available to copy.', true); }
          else if (error.code === 'FORBIDDEN' || error.status === 401 || error.status === 403) { canComment = false; setMessage('Confluence did not allow this comment. Your draft is still available to copy.', true); nativeLink(); }
          else setMessage('Your comment was not posted. Your draft is still here; you can try again.', true);
          notify('error', 'Comment was not posted. Your draft has been kept.');
        }
      } finally { finish(request); if (!disposed) { renderList(); syncComposer(); } }
    });
    textarea.addEventListener('input', syncComposer);
    function renderVote() {
      helpful.hidden = !voteState || voteState.canVote !== true;
      yes.setAttribute('aria-pressed', String(!!voteState && voteState.vote === 'yes'));
      no.setAttribute('aria-pressed', String(!!voteState && voteState.vote === 'no'));
      yes.disabled = no.disabled = voteBusy || voteUnknown;
      yes.setAttribute('aria-busy', String(voteBusy && voteState?.vote === 'yes'));
      no.setAttribute('aria-busy', String(voteBusy && voteState?.vote === 'no'));
    }
    async function loadFeedback() {
      if (!feedback || typeof feedback.load !== 'function' || disposed) return;
      var request = controller();
      try { var result = await feedback.load({signal: request.signal}); if (!disposed) { voteState = result; renderVote(); } } catch (_) { /* Feedback availability never blocks comments or reading. */ }
      finally { finish(request); }
    }
    async function saveVote(value) {
      if (disposed || voteBusy || voteUnknown || !feedback || !voteState || voteState.canVote !== true || voteState.vote === value) return;
      var before = voteState, request = controller(); voteBusy = true; voteState = Object.assign({}, before, {vote: value}); renderVote(); voteMessage.textContent = 'Saving…';
      try {
        var result = await feedback.save(value, {signal: request.signal});
        if (disposed) return;
        if (!result || result.vote !== value) throw new Error('Missing feedback confirmation');
        voteState = result; voteMessage.textContent = 'Thank you for your feedback.'; notify('success', 'Feedback saved.');
      } catch (error) {
        if (disposed) return;
        voteState = before;
        if (unknown(error)) { voteUnknown = true; voteMessage.textContent = 'Confirmation was interrupted. Check back before voting again.'; notify('warning', 'Feedback could not be confirmed.'); }
        else { voteMessage.textContent = 'Feedback was not saved. Please try again.'; notify('error', 'Feedback was not saved.'); loadFeedback(); }
      } finally { finish(request); voteBusy = false; if (!disposed) renderVote(); }
    }
    function destroy() {
      if (disposed) return;
      disposed = true; global.removeEventListener('wcs:article-comment-created',externalComment); if (observer) observer.disconnect(); controllers.forEach(function (request) { request.abort(); }); controllers.clear(); root.remove(); mounts.delete(host);
    }
    var api = Object.freeze({load: function () { return load(); }, destroy: destroy}); mounts.set(host, api);
    if (options.lazy !== false && typeof global.IntersectionObserver === 'function') {
      observer = new global.IntersectionObserver(function (entries) { if (entries.some(function (entry) { return entry.isIntersecting; })) load(); }, {rootMargin: '300px 0px'});
      observer.observe(root);
    } else if (options.lazy === false) load();
    return api;
  }
  global.WCSArticleDiscussion = Object.freeze({mount: mount});
})(window);
