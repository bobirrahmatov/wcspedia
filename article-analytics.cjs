/* Trusted server/reporting source. Never load this module in a page macro.
 * Native comments and the feedback service remain the writable source. */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function requireInput(ok, message) { if (!ok) fail('ANALYTICS_INPUT', message); }
function aborted(signal) { if (signal && signal.aborted) fail('ANALYTICS_ABORTED', 'Analytics refresh was cancelled; the previous report is unchanged.'); }
function timestamp(now) { const value = now(); if (!integer(value)) fail('ANALYTICS_CLOCK', 'The analytics server clock is invalid.'); return new Date(value).toISOString(); }
function checkCursor(value) { return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 4096); }
function count(value) {
  if (!object(value) || !integer(value.yes) || !integer(value.no) || !integer(value.total) || value.yes + value.no !== value.total) fail('ANALYTICS_SOURCE', 'Feedback totals are incomplete or invalid.');
  return { yes: value.yes, no: value.no, total: value.total };
}

function createArticleAnalyticsPublisher(options = {}) {
  const { rootPageId, spaceKey, listArticles, resolveAccess, readCommentSummary, feedbackService, authorizeReport, store } = options;
  requireInput(id(rootPageId) && typeof spaceKey === 'string' && spaceKey.length > 0 && spaceKey.length <= 255 && spaceKey.trim() === spaceKey, 'Configure the exact WCSpedia root and space key.');
  const areaPageIds = options.areaPageIds, excludePageIds = options.excludePageIds || [], excludeAncestorIds = options.excludeAncestorIds || [];
  for (const list of [areaPageIds, excludePageIds, excludeAncestorIds]) requireInput(Array.isArray(list) && list.every(id) && new Set(list).size === list.length, 'Configure valid, distinct page IDs.');
  requireInput(areaPageIds.length > 0 && !areaPageIds.includes(rootPageId), 'Configure the business-area page IDs.');
  const insightsPageId = options.insightsPageId == null || options.insightsPageId === '' ? null : options.insightsPageId;
  requireInput(insightsPageId === null || id(insightsPageId) && insightsPageId !== rootPageId && !areaPageIds.includes(insightsPageId), 'Configure a distinct Insights parent page ID.');
  requireInput([listArticles, resolveAccess, readCommentSummary, authorizeReport].every(value => typeof value === 'function') && (feedbackService === undefined || feedbackService === null || typeof feedbackService.analytics === 'function') && store && typeof store.withLock === 'function' && typeof store.set === 'function', 'Provide trusted Confluence readers, report authorization, atomic storage and an optional feedback analytics service.');
  const publishedParents = new Set([...areaPageIds, ...(insightsPageId ? [insightsPageId] : [])]), excludedPages = new Set([rootPageId, ...publishedParents, ...excludePageIds, ...excludeAncestorIds]), excludedAncestors = new Set(excludeAncestorIds);
  const maxDocuments = options.maxDocuments === undefined ? 10000 : options.maxDocuments;
  const maxBatches = options.maxBatches === undefined ? 1000 : options.maxBatches;
  requireInput(integer(maxDocuments) && maxDocuments > 0 && maxDocuments <= 100000 && integer(maxBatches) && maxBatches > 0 && maxBatches <= 10000, 'Configure bounded analytics scan limits.');
  const now = options.now || Date.now;
  requireInput(typeof now === 'function', 'Use a trusted server clock.');
  const scope = { rootPageId, spaceKey, areaPageIds: [...areaPageIds], insightsPageId, publishedParentPageIds: [...publishedParents] };

  async function authorized(context) {
    // Host authorization must cover BOTH all source articles and the private
    // report destination. It must never trust a browser-supplied admin flag.
    if (await authorizeReport({ ...scope, context }) !== true) fail('ANALYTICS_FORBIDDEN', 'This context cannot publish the private WCSpedia analytics report.');
  }
  async function collectDocument(pageId, context, signal) {
    aborted(signal);
    const verified = await resolveAccess({ rootPageId, pageId, context, signal });
    const p = verified && verified.page;
    if (!verified || verified.authenticated !== true || verified.rootReadable !== true || verified.canRead !== true || !p || p.id !== pageId || p.type !== 'page' || p.status !== 'current' || p.spaceKey !== spaceKey || !Array.isArray(p.ancestorIds) || !p.ancestorIds.every(id) || !p.ancestorIds.includes(rootPageId) || !p.ancestorIds.some((a, i) => publishedParents.has(a) && i > p.ancestorIds.indexOf(rootPageId)) || p.ancestorIds.some(a => excludedAncestors.has(a)) || !integer(p.version) || p.version < 1) fail('ANALYTICS_SCOPE', 'An article is unreadable or outside the configured WCSpedia document tree.');
    for (const field of ['createdAt', 'updatedAt']) if (p[field] !== undefined && p[field] !== null && !iso(p[field])) fail('ANALYTICS_SOURCE', 'A native page timestamp is invalid.');
    const observedAt = timestamp(now); // Start of this document's collection.
    const [comments, feedback] = await Promise.all([
      readCommentSummary({ rootPageId, pageId, context, signal }),
      feedbackService ? feedbackService.analytics({ rootPageId, pageId }, context) : Promise.resolve(null)
    ]);
    aborted(signal);
    if (!object(comments) || !['available', 'unavailable'].includes(comments.status) || !(comments.lastCommentAt === null || iso(comments.lastCommentAt)) || (comments.status === 'available' ? !integer(comments.total) : comments.total !== null || comments.lastCommentAt !== null) || (comments.total === 0 && comments.lastCommentAt !== null)) fail('ANALYTICS_SOURCE', 'Native footer-comment counts are incomplete or invalid.');
    let helpfulness = { source: 'wcspedia-feedback-service', status: 'unavailable', revision: null, updatedAt: null, yes: null, no: null, total: null, byPageVersion: null, voteChanges: null };
    if (feedbackService) {
      if (!object(feedback) || feedback.rootPageId !== rootPageId || feedback.pageId !== pageId || feedback.pageVersion !== p.version || !integer(feedback.revision) || !integer(feedback.voteChanges) || !(feedback.updatedAt === null || iso(feedback.updatedAt)) || !Array.isArray(feedback.byPageVersion)) fail('ANALYTICS_SOURCE', 'Feedback analytics changed or returned an invalid article snapshot.');
      const totals = count(feedback.totals), versions = new Set();
      const byPageVersion = feedback.byPageVersion.map(value => {
        if (!object(value) || !integer(value.pageVersion) || value.pageVersion < 1 || versions.has(value.pageVersion)) fail('ANALYTICS_SOURCE', 'Feedback version totals are invalid.');
        versions.add(value.pageVersion);
        return { pageVersion: value.pageVersion, ...count(value) };
      });
      if (['yes', 'no', 'total'].some(key => byPageVersion.reduce((sum, value) => sum + value[key], 0) !== totals[key])) fail('ANALYTICS_SOURCE', 'Feedback version totals do not match the article total.');
      helpfulness = { source: 'wcspedia-feedback-service', status: 'available', revision: feedback.revision, updatedAt: feedback.updatedAt, ...totals, byPageVersion, voteChanges: feedback.voteChanges };
    }
    const parentPageId = [...p.ancestorIds].reverse().find(a => publishedParents.has(a));
    return {
      pageId, areaPageId: parentPageId, collection: parentPageId === insightsPageId ? 'insights' : 'business-area', pageVersion: p.version,
      createdAt: p.createdAt || null, updatedAt: p.updatedAt || null, observedAt,
      comments: { source: 'confluence-footer-comments', status: comments.status, total: comments.total, lastCommentAt: comments.lastCommentAt },
      helpfulness
    };
  }
  async function publish(context, { signal } = {}) {
    await authorized(context);
    aborted(signal);
    // The lock covers collection AND publication, preventing a slower older
    // run from replacing a newer report. A failed scan never writes a subset.
    return store.withLock(async () => {
      await authorized(context);
      aborted(signal);
      const scanStartedAt = timestamp(now), documents = {}, seenIds = new Set(), cursors = new Set();
      let cursor = null, batches = 0;
      do {
        aborted(signal);
        if (++batches > maxBatches) fail('ANALYTICS_LIMIT', 'Analytics pagination exceeded its configured limit.');
        const page = await listArticles({ ...scope, cursor, limit: 100, context, signal });
        if (!object(page) || !Array.isArray(page.results) || page.results.length > 100 || !Object.hasOwn(page, 'nextCursor') || !checkCursor(page.nextCursor)) fail('ANALYTICS_SOURCE', 'The article listing did not confirm complete pagination.');
        for (const result of page.results) {
          if (!object(result) || !id(result.id)) fail('ANALYTICS_SOURCE', 'The article listing contains an invalid native page ID.');
          if (excludedPages.has(result.id) || seenIds.has(result.id)) continue;
          seenIds.add(result.id);
          if (seenIds.size > maxDocuments) fail('ANALYTICS_LIMIT', 'Analytics exceeded its configured document limit.');
          documents[result.id] = await collectDocument(result.id, context, signal);
        }
        cursor = page.nextCursor;
        if (cursor !== null) { if (cursors.has(cursor)) fail('ANALYTICS_SOURCE', 'The article listing repeated a pagination cursor.'); cursors.add(cursor); }
      } while (cursor !== null);
      await authorized(context);
      aborted(signal);
      const generatedAt = timestamp(now);
      if (generatedAt < scanStartedAt) fail('ANALYTICS_CLOCK', 'The server clock moved backwards while collecting analytics.');
      const snapshot = { schemaVersion: 1, rootPageId, spaceKey, scanStartedAt, generatedAt, documentCount: Object.keys(documents).length, documents };
      await store.set(snapshot);
      return snapshot;
    });
  }
  return Object.freeze({ publish });
}

/* Optional normalized native-comment paginator. The host must request only
 * footer comments (including replies), never inline comments or comment bodies.
 * Unknown native creation dates remain null rather than inventing a timestamp. */
function createFooterCommentCounter({ listComments, maxBatches = 1000 } = {}) {
  requireInput(typeof listComments === 'function' && integer(maxBatches) && maxBatches > 0 && maxBatches <= 10000, 'Provide a bounded native footer-comment reader.');
  return async function readCommentSummary({ rootPageId, pageId, context, signal }) {
    requireInput(id(rootPageId) && id(pageId), 'Use valid native page IDs.');
    const ids = new Set(), cursors = new Set();
    let cursor = null, batches = 0, latest = null, unknownDate = false;
    do {
      aborted(signal);
      if (++batches > maxBatches) fail('ANALYTICS_LIMIT', 'Comment pagination exceeded its configured limit.');
      const page = await listComments({ rootPageId, pageId, cursor, limit: 100, context, signal });
      if (!object(page) || !Array.isArray(page.results) || page.results.length > 100 || !Object.hasOwn(page, 'nextCursor') || !checkCursor(page.nextCursor)) fail('ANALYTICS_SOURCE', 'Native footer-comment pagination is incomplete.');
      for (const comment of page.results) {
        if (!object(comment) || !id(comment.id) || !['footer', 'inline'].includes(comment.location) || !(comment.createdAt === null || iso(comment.createdAt))) fail('ANALYTICS_SOURCE', 'A native comment summary is invalid.');
        if (comment.location === 'inline' || ids.has(comment.id)) continue;
        ids.add(comment.id);
        if (comment.createdAt === null) unknownDate = true;
        else if (latest === null || comment.createdAt > latest) latest = comment.createdAt;
      }
      cursor = page.nextCursor;
      if (cursor !== null) { if (cursors.has(cursor)) fail('ANALYTICS_SOURCE', 'Native comments repeated a pagination cursor.'); cursors.add(cursor); }
    } while (cursor !== null);
    aborted(signal);
    return { status: 'available', total: ids.size, lastCommentAt: unknownDate ? null : latest };
  };
}

/* Local, single-host durable publisher. For clustered servers inject a store
 * backed by a distributed lock and an atomic object/database transaction. */
function createArticleAnalyticsFileStore(directory, { lockTimeoutMs = 10000 } = {}) {
  requireInput(typeof directory === 'string' && directory.trim().length > 0 && integer(lockTimeoutMs) && lockTimeoutMs > 0 && lockTimeoutMs <= 60000, 'Configure a private analytics directory and lock timeout.');
  const root = path.resolve(directory), file = path.join(root, 'wcspedia-analytics.json'), lock = file + '.lock';
  async function withLock(task) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const started = Date.now();
    for (;;) {
      try { await fs.mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() - started >= lockTimeoutMs) fail('ANALYTICS_BUSY', 'An analytics refresh is already running.');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    try { return await task(); } finally { await fs.rmdir(lock); }
  }
  async function set(snapshot) {
    const bytes = JSON.stringify(snapshot, null, 2) + '\n';
    if (Buffer.byteLength(bytes) > 128 * 1024 * 1024) fail('ANALYTICS_LIMIT', 'The analytics snapshot exceeds its supported size.');
    const temporary = file + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
      await fs.rename(temporary, file);
      const parent = await fs.open(root, 'r'); try { await parent.sync(); } finally { await parent.close(); }
    } finally { if (handle) await handle.close(); await fs.rm(temporary, { force: true }); }
  }
  return Object.freeze({ withLock, set });
}
module.exports = Object.freeze({ createArticleAnalyticsPublisher, createFooterCommentCounter, createArticleAnalyticsFileStore });
