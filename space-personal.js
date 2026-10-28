/* Personal actions use the signed-in Confluence session. Favourites are native
 * personal labels; suggestions are native article comments, never approval or
 * document edits. No shared JSON stores another person's personal state.
 * https://developer.atlassian.com/server/confluence/cql-field-reference/
 * https://docs.atlassian.com/ConfluenceServer/rest/8.9.1/
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSSpacePersonal = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const pageId = value => /^[1-9]\d{0,19}$/.test(String(value || '')) ? String(value) : '';
  const problem = (code, message) => Object.assign(new Error(message), {code});
  const clone = value => JSON.parse(JSON.stringify(value));
  function abort(signal) { if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), {name:'AbortError'}); }
  function create(config, deps) {
    config = config || {}; deps = deps || {};
    const location = deps.location || root.location;
    const address = new URL(deps.origin || location?.href || config.baseUrl);
    const context = String(config.contextPath == null ? '/confluence' : config.contextPath).replace(/\/+$/, '');
    const rootId = pageId(config.rootPageId), spaceKey = String(config.spaceKey || '');
    if (!rootId || !spaceKey || !/^https?:$/.test(address.protocol)) throw problem('CONFIGURATION', 'Configure the WCSpedia root and exact Confluence space key.');
    const publication = config.nativePublication || config;
    const areaIds = Object.values(publication.areaPageIds || {}).map(pageId).filter(Boolean);
    const insightsId = pageId(publication.insightsPageId);
    const excluded = new Set([rootId, pageId(config.attachmentPageId), insightsId, ...areaIds, ...Object.values(config.pageIds || {}).map(pageId), ...(config.search?.excludePageIds || []).map(pageId)].filter(Boolean));
    const excludedTrees = new Set([pageId(publication.workingRootPageId), ...(config.search?.excludeAncestorIds || []).map(pageId)].filter(Boolean));
    Object.values(config.pages || {}).forEach(value => {
      let url; try { url=new URL(value,address); } catch (_) { return; }
      if(url.origin!==address.origin)return;
      const id=pageId(url.searchParams.get('pageId'))||pageId(url.pathname.match(/\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/)?.[1]);
      if(id)excluded.add(id);
    });
    function article(page) {
      const id = pageId(page?.id), ancestors = Array.isArray(page?.ancestors) ? page.ancestors.map(p => pageId(p.id)) : [];
      if (!id || page.type !== 'page' || page.status !== 'current' || page.space?.key !== spaceKey || excluded.has(id) || !ancestors.includes(rootId) || ancestors.some(p => excludedTrees.has(p))) throw problem('OUT_OF_SCOPE', 'This action is available on WCSpedia child documents only.');
      return id;
    }
    const nativeHref = id => address.origin + context + '/pages/viewpage.action?pageId=' + id;
    let store;
    function storage() {
      if (!store) {
        const api = deps.storageAPI || root.WCSSpaceStorage || (typeof require === 'function' ? require('./space-storage.js') : null);
        if (!api?.create) throw problem('CONFIGURATION', 'The native Confluence storage helper is unavailable.');
        store = deps.storage || api.create(config, Object.assign({}, deps, {origin:address.origin}));
      }
      return store;
    }
    function bookmarks(options) {
      options = options || {};
      const db = deps.storage || storage();
      const docs = options.getDocuments || (() => []), published = options.publishedVersion || (d => d.versions?.find(v => v.version === d.publishedVersion && v.status === 'Published'));
      const mayRead = options.canRead || (() => false);
      let identity = '', revision = 0, entries = [], nativeDocs = new Map(), queue = Promise.resolve();
      function serial(fn) { const pending = queue.catch(() => {}).then(fn); queue = pending; return pending; }
      async function session(signal) {
        abort(signal); const user = await db.user({signal}); abort(signal);
        const id = user?.userKey || user?.username;
        if (!id || ['anonymous','unknown'].includes(user.type)) throw problem('BOOKMARKS_IDENTITY', 'Sign in to Confluence to use Saved items.');
        if (identity && identity !== id) throw problem('BOOKMARKS_IDENTITY', 'Your Confluence session changed. Reload Saved items.');
        identity = id;
      }
      function catalog() {
        const list = docs(); if (!Array.isArray(list)) throw problem('BOOKMARKS_CATALOG', 'The document catalog is unavailable.');
        const result = new Map();
        list.forEach(d => { if (d?.id) result.set(d.id, result.has(d.id) ? null : d); });
        return result;
      }
      function target(doc) { return pageId(doc?.publishedConfluencePageId || doc?.confluencePageId); }
      function current(id) {
        const cat = catalog();
        if (cat.has(id)) { const doc = cat.get(id), version = doc && published(doc); return doc && !doc.deletedAt && mayRead(doc) === true && version?.status === 'Published' ? {doc,version} : null; }
        const doc = nativeDocs.get(id); return doc ? {doc,version:doc.versions[0]} : null;
      }
      function snapshot() { return {revision, available:true, bookmarks:entries.filter(e => current(e.documentId)).map(e => ({documentId:e.documentId,savedAt:null}))}; }
      function synthetic(page) {
        const id = article(page), v = Number.isSafeInteger(page.version?.number) ? page.version.number : 1;
        const version = {version:v,revision:v,status:'Published',title:String(page.title || 'Confluence document'),summary:'',bodyMarkdown:''};
        return {id:'native-'+id,nativePage:true,confluencePageId:id,publishedConfluencePageId:id,nativeUrl:nativeHref(id),type:'Reference',reference:'Confluence page '+id,publishedVersion:v,versions:[version]};
      }
      function offset(result, path, start) {
        const next = result?._links?.next; if (!next) return null;
        let url; try { url = new URL(next,address.origin + context + '/'); } catch (_) { throw problem('BOOKMARKS_RESPONSE','Confluence returned invalid saved-item pagination.'); }
        const raw=url.searchParams.get('start'), n=Number(raw);
        if (url.origin!==address.origin || url.username || url.password || url.hash || ![context+'/rest/api'+path,'/rest/api'+path].includes(url.pathname) || !/^\d+$/.test(raw||'') || !Number.isSafeInteger(n) || n<=start || n>start+result.results.length) throw problem('BOOKMARKS_RESPONSE','Confluence returned invalid saved-item pagination.');
        return n;
      }
      async function listLabels(id) {
        const labels=[]; let start=0;
        do {
          const path='/content/'+id+'/label', result=await db.request('/rest/api'+path+'?prefix=my&start='+start+'&limit=200');
          if (!Array.isArray(result?.results) || result.results.length>200) throw problem('BOOKMARKS_RESPONSE','Confluence returned invalid personal labels.');
          labels.push(...result.results); if(labels.length>1000)throw problem('BOOKMARKS_LIMIT','This page has too many personal labels to confirm this action.');
          start=offset(result,path,start);
        } while(start!==null);
        return labels.some(l=>l.prefix==='my'&&l.name==='favourite');
      }
      function load(input) { return serial(async()=>{
        const signal=input?.signal; await session(signal); await db.page(rootId,'space',{signal}); abort(signal);
        // Confluence restricts favourite=currentUser() to the authenticated user.
        const cql='type = page AND space = '+JSON.stringify(spaceKey)+' AND ancestor = '+rootId+' AND favourite = currentUser() ORDER BY title ASC';
        const found=[], fresh=new Map(), catalogByPage=new Map();
        catalog().forEach(d=>{const id=target(d); if(id)catalogByPage.set(id,catalogByPage.has(id)?null:d);});
        let start=0;
        do {
          const params=new URLSearchParams({cql,expand:'space,ancestors,version',start:String(start),limit:'50'});
          const result=await db.request('/rest/api/content/search?'+params.toString(),{signal}); abort(signal);
          if (!Array.isArray(result?.results)||result.results.length>50||result.start!=null&&result.start!==start)throw problem('BOOKMARKS_RESPONSE','Confluence returned invalid Saved items.');
          for(const page of result.results){
            // Excluded navigation and working pages are never personal-library documents.
            let native;try{native=synthetic(page);}catch(error){if(error.code==='OUT_OF_SCOPE')continue;throw error;}
            const mapped=catalogByPage.get(native.confluencePageId), id=mapped?.id||native.id;
            if(catalogByPage.has(native.confluencePageId)&&!mapped)continue;
            if(!mapped)fresh.set(id,native);
            if(!found.some(e=>e.documentId===id))found.push({documentId:id,savedAt:null});
          }
          const next=offset(result,'/content/search',start);
          if(next!==null&&next>=1000)throw problem('BOOKMARKS_LIMIT','More than 1,000 saved pages need Confluence’s native Saved for later view. No saved items were changed.');
          start=next;
        }while(start!==null);
        // Re-check an empty result: an expired login must not erase the library.
        if(!found.length)await session(signal);
        abort(signal);nativeDocs=fresh;entries=found;revision++;return snapshot();
      }); }
      function set(id,saved,input) { return serial(async()=>{
        input=input||{};abort(input.signal);
        if(typeof id!=='string'||typeof saved!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==revision)throw problem('BOOKMARKS_CONFLICT','Saved items changed. Refresh before trying again.');
        const value=current(id), nativeId=value&&target(value.doc);
        if(!nativeId)throw problem('BOOKMARKS_FORBIDDEN','Only a readable published Confluence document can be saved.');
        await session(input.signal);article(await db.page(nativeId,'space,ancestors,version'));abort(input.signal);
        const before=await listLabels(nativeId);abort(input.signal);
        let writeError;
        if(before!==saved){
          try { await db.request('/rest/api/content/'+nativeId+'/label'+(saved?'':'?name=my%3Afavourite'),saved?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{prefix:'my',name:'favourite'}])}:{method:'DELETE'}); }
          catch(error){writeError=error;}
          // A label is a set membership; verify directly instead of waiting for CQL indexing.
          let after;try{after=await listLabels(nativeId);}catch(error){throw problem('BOOKMARKS_UNCONFIRMED','Confluence may have changed your saved item. Refresh Saved items to confirm before trying again.');}
          if(after!==saved){if(writeError)throw writeError;throw problem('BOOKMARKS_UNCONFIRMED','Confluence did not confirm this saved-item change. Refresh before retrying.');}
        }
        entries=entries.filter(e=>e.documentId!==id);if(saved)entries.push({documentId:id,savedAt:null});revision++;return snapshot();
      }); }
      function resolve(state) { return state?.available===true&&Array.isArray(state.bookmarks)?state.bookmarks.flatMap(e=>{const value=current(e.documentId);return value?[{documentId:e.documentId,savedAt:null,...value}]:[];}):[]; }
      return Object.freeze({load,set,resolve,storageKey:null,native:true});
    }
    function suggestions(options) {
      options=options||{};
      const api=deps.commentsAPI||root.WCSArticleComments||(typeof require==='function'?require('./article-comments.js'):null);
      const comments=deps.comments||api?.create(config,deps);
      if(!comments)throw problem('CONFIGURATION','The native article comments helper is unavailable.');
      const requests=new Map(), denied=new Set();
      function confirmed(state,result){
        if(!state.announced){
          state.announced=true;
          if(typeof root.dispatchEvent==='function'&&typeof root.CustomEvent==='function')root.dispatchEvent(new root.CustomEvent('wcs:article-comment-created',{detail:{pageId:state.pageId,comment:clone(result)}}));
          if(options.onChange){try{options.onChange();}catch(_){/* Host decoration cannot invalidate a confirmed native comment. */}}
        }
        return clone(result);
      }
      function target(value) {
        if(value?.nativePageId)return pageId(value.nativePageId);
        // Do not accidentally post a selected article's suggestion on its shell page.
        if(value?.documentId)return '';
        let url;try{url=new URL(value?.url);}catch(_){return '';}
        if(url.origin!==address.origin||url.username||url.password||url.hash.startsWith('#/'))return '';
        return pageId(url.searchParams.get('pageId'))||pageId(url.pathname.match(/\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/)?.[1]);
      }
      async function prepare(value,input) {
        const id=target(value);if(!id)throw problem('OUT_OF_SCOPE','Open the published document to send a suggestion. You can still copy this request.');
        const scope=await comments.resolve(id,{force:true,signal:input?.signal});
        if(!scope.commentsEnabled)throw problem('COMMENTS_DISABLED','Comments are disabled on this document. Copy your request to share it with the owner.');
        if(!scope.canComment||denied.has(id))throw problem('FORBIDDEN','Confluence does not permit sending a comment on this document. You can still copy your request.');
        return scope;
      }
      function unknown(){return Object.assign(problem('OUTCOME_UNKNOWN','Confluence may have saved this suggestion. Check the document comments before sending a new request. Retrying here only checks for the existing comment.'),{outcome:'unknown',retryable:false});}
      function content(payload,requestId) {
        const a=payload.context.anchor||{};
        const revision=payload.context.version?'\nDocument version '+payload.context.version+(payload.context.revision?' · revision '+payload.context.revision:''):'';
        const value=('WCSpedia '+payload.type+' suggestion'+revision+'\n\nSuggested change\n'+payload.correction+'\n\nReason or supporting context\n'+payload.reason+(a.exact?'\n\nSelected passage'+(a.heading?' — '+a.heading:'')+'\n'+a.exact:'')+'\n\nThis is a suggestion, not an edit or approval.\nWCSpedia request: '+requestId).replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        if(value.length>10000)throw problem('VALIDATION','The suggestion and selected passage together must be at most 10,000 characters. Shorten the text or select a smaller passage.');
        return value;
      }
      async function recover(state,signal){
        let start=0,seen=0;
        do{const result=await comments.list(state.pageId,{start,signal});seen+=result.comments.length;
          const found=result.comments.filter(c=>c.author.id===state.userId&&c.text===state.text);
          if(found.length===1){state.result=found[0];return confirmed(state,state.result);}if(found.length>1)throw unknown();
          start=result.nextStart;if(seen>=1000&&start!==null)throw unknown();
        }while(start!==null);
        throw unknown();
      }
      function submit(payload,requestId,input){
        if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(requestId||''))return Promise.reject(problem('VALIDATION','Use a valid suggestion request ID.'));
        let text;try{text=content(payload,requestId);}catch(error){return Promise.reject(error);}
        const key=JSON.stringify(payload),existing=requests.get(requestId);
        if(existing){if(existing.key!==key)return Promise.reject(problem('CONFLICT','This request ID belongs to different suggestion details.'));if(existing.pending)return existing.pending;if(existing.result)return Promise.resolve(clone(existing.result));}
        if(!existing&&requests.size>=200)return Promise.reject(problem('LIMIT','Reload this page before sending more suggestions.'));
        const state=existing||{key,text};requests.set(requestId,state);
        state.pending=(async()=>{
          const scope=await prepare(payload.context,input);abort(input?.signal);
          if(state.userId&&state.userId!==scope.user.id)throw problem('IDENTITY','Your Confluence session changed. Check the document comments.');
          state.userId=scope.user.id;state.pageId=scope.pageId;
          if(state.uncertain)return recover(state,input?.signal);
          try{state.result=await comments.createComment(scope.pageId,{text,signal:input?.signal});return confirmed(state,state.result);}
          catch(error){if(error.code==='FORBIDDEN')denied.add(scope.pageId);if(error.outcome==='unknown'||error.code==='OUTCOME_UNKNOWN'){state.uncertain=true;throw unknown();}throw error;}
        })();
        const pending=state.pending;pending.then(()=>{state.pending=null;},()=>{state.pending=null;});return pending;
      }
      return Object.freeze({prepare,submit,canTriage:()=>false,canList:false,native:true,live:true,available:true,storeKey:null,
        list:async()=>{throw problem('NATIVE_COMMENTS','Suggestions are stored as comments on their published document. Open the document’s discussion to follow up; content changes still use review and approval.');},
        decide:async()=>{throw problem('NATIVE_COMMENTS','Reply on the document discussion. A suggestion does not change or approve its content.');},
        deliveryDescription:'Your suggestion is posted as a comment on this document using your Confluence account. It does not edit or approve the content. Confluence controls comment permissions and any watcher notifications.'});
    }
    return Object.freeze({bookmarks,suggestions});
  }
  return Object.freeze({create});
}));
