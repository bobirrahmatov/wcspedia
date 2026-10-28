/* LOCAL VERIFICATION ONLY. This preference store is process memory, not a
 * production authentication boundary or durable database. Resolve getActor and
 * canRead from the mock server's trusted session and native ACL, never the body. */
'use strict';
const bookmarks = require('./bookmarks.js');
const fields = ['schemaVersion', 'rootPageId', 'documentId', 'saved', 'expectedRevision', 'requestId'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function createRoute(options) {
  const rootPageId = String(options.rootPageId), pathname = options.path || '/confluence/mock/bookmarks';
  if (!/^[1-9]\d*$/.test(rootPageId) || typeof options.getActor !== 'function' || typeof options.getDocuments !== 'function' || typeof options.canRead !== 'function') throw Error('A mock bookmark route needs a root, trusted session, catalog, and read check.');
  const memory = new Map(), storage = {getItem:key => memory.has(key) ? memory.get(key) : null, setItem:(key,value) => memory.set(key,value)};
  const origins = new Set(options.origins || (options.origin ? [options.origin] : []));
  if (!origins.size) throw Error('The mock bookmark route needs its allowed local origin.');
  function send(res, status, value) {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(value));
  }
  async function body(req) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw Error('The bookmark command exceeds 8 KB.'); }
    return JSON.parse(raw);
  }
  return async function route(req, res, url) {
    if (url.pathname !== pathname) return false;
    try {
      const actor = await options.getActor(req);
      if (!plain(actor) || typeof actor.soeid !== 'string' || !/^[a-z0-9]{2,32}$/i.test(actor.soeid.trim())) return send(res,401,{message:'A signed-in SOEID is required.'}), true;
      const subjectSOEID = actor.soeid.trim().toUpperCase();
      const service = bookmarks.create({mode:'embedded', storage, key:'mock.bookmarks.v1', identity:actor, rootPageId,
        getDocuments:options.getDocuments, canRead:doc => options.canRead(doc, actor) === true, publishedVersion:options.publishedVersion, now:options.now});
      let state;
      if (req.method === 'GET') {
        if (url.searchParams.get('rootPageId') !== rootPageId || [...url.searchParams.keys()].length !== 1) return send(res,400,{message:'Use one valid library root.'}), true;
        state = await service.load();
      } else if (req.method === 'POST') {
        if ((req.headers.origin && !origins.has(req.headers.origin)) || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') || req.headers['x-requested-with'] !== 'XMLHttpRequest') return send(res,403,{message:'A same-origin JSON XMLHttpRequest command is required.'}), true;
        const command = await body(req);
        if (!plain(command) || Object.keys(command).length !== fields.length || !fields.every(field => Object.hasOwn(command,field)) || command.schemaVersion !== 1 || command.rootPageId !== rootPageId || command.requestId !== req.headers['idempotency-key'] || typeof command.requestId !== 'string') return send(res,400,{message:'Use a valid bookmark command with matching idempotency key; identity is resolved from the session.'}), true;
        state = await service.set(command.documentId, command.saved, {expectedRevision:command.expectedRevision, requestId:command.requestId});
      } else return send(res,405,{message:'Use GET or POST for saved items.'}), true;
      send(res,200,{schemaVersion:1,rootPageId,subjectSOEID,revision:state.revision,bookmarks:state.bookmarks});
    } catch (error) {
      send(res,error.code === 'BOOKMARKS_CONFLICT' ? 409 : error.code === 'BOOKMARKS_FORBIDDEN' ? 403 : 400,{message:error.message || 'The mock bookmark request failed.'});
    }
    return true;
  };
}
module.exports = Object.freeze({createRoute});
