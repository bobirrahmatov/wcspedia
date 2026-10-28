/* Native-page WCSpedia. Confluence owns article bodies and editing.
 * HTML macros mount this presentation layer; workflow writes stay server-side.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSNativeApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const TYPES = ['Job aid', 'Guide', 'Checklist', 'Training', 'Blog', 'Knowledge sharing', 'Reference', 'Report', 'FAQ', 'Template', 'Playbook'];
  const LABELS = {'submit':'Submit for review','complete-review':'Complete review','request-changes':'Request changes','approve':'Approve publication','delete':'Delete document'};
  const mounted = new WeakMap();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
  function client(config) { return root.WCSNativeConfluence.create(config); }
  function uiHost() {
    let host = root.document.getElementById('wcspedia');
    if (!host) { host = root.document.createElement('div'); host.id = 'wcspedia'; host.className = 'wcs-native-tools'; root.document.body.append(host); }
    return host;
  }
  function errorBox(error) { return '<div class="wcs-native-notice" role="alert"><strong>'+esc(error.code === 'FORBIDDEN' ? 'Not permitted' : 'Unable to complete this request')+'</strong><p>'+esc(error.message || 'Please try again.')+'</p></div>'; }
  function pageId(element, config) {
    const value = element.dataset.pageId || config.currentPageId || root.AJS?.Meta?.get('page-id') || root.document.querySelector('meta[name="ajs-page-id"]')?.content;
    if (!/^[1-9]\d*$/.test(String(value || ''))) throw Error('The current Confluence page ID is unavailable. Set data-page-id on the document controls macro.');
    return String(value);
  }
  function enhance(element) { root.WCSUI?.enhance(element); }
  function status(element, message, error) { element.innerHTML = error ? errorBox(error) : '<p class="wcs-native-notice" role="status">'+esc(message)+'</p>'; }
  function navigate(url) { root.location.assign(url); }
  function options(items, selected, all) { return '<option value="">'+esc(all)+'</option>'+items.map(item=>'<option value="'+esc(slug(item))+'"'+(slug(item)===selected?' selected':'')+'>'+esc(item)+'</option>').join(''); }
  function searchMarkup(params) {
    return '<form class="wcs-native-search" novalidate><div class="wcs-native-search-row"><label class="sr-only" for="wcs-native-query">Search documents</label><input id="wcs-native-query" name="q" type="search" maxlength="200" placeholder="Search job aids, training, and shared knowledge" value="'+esc(params.get('q'))+'"><button class="button" type="submit">Search <span aria-hidden="true">→</span></button></div><div class="wcs-native-filters"><label>Content type<select name="type">'+options(TYPES,params.get('type'),'All content types')+'</select></label><label>Region<select name="region">'+options(['Global','NAM','EMEA','APAC','LATAM'],params.get('region'),'All regions')+'</select></label><label>Sort by<select name="sort"><option value="updated"'+(params.get('sort')==='updated'?' selected':'')+'>Recently updated</option><option value="title"'+(params.get('sort')==='title'?' selected':'')+'>Title A–Z</option><option value="relevance"'+(params.get('sort')==='relevance'?' selected':'')+'>Relevance</option></select></label><button class="button secondary compact" type="button" data-native-reset>Reset</button></div></form>';
  }
  function href(params, start) { const next = new URLSearchParams(params); next.set('start',String(start)); return '#/results?'+next.toString(); }
  function pager(result, params) {
    const start = result.start || 0, limit = result.limit || 12, count = result.totalSize;
    if (Number.isSafeInteger(count) && count >= 0 && root.WCSPagination) return root.WCSPagination.render({totalPages:Math.ceil(count/limit),currentPage:Math.floor(start/limit)+1,href:page=>href(params,(page-1)*limit)});
    if (!start && !result.hasNext) return '';
    return '<nav class="wcs-native-pager" aria-label="Pagination">'+(start?'<a class="button secondary" href="'+esc(href(params,Math.max(0,start-limit)))+'">← Previous</a>':'<span></span>')+'<span>Page '+(Math.floor(start/limit)+1)+'</span>'+(result.hasNext?'<a class="button secondary" href="'+esc(href(params,result.nextStart ?? start+limit))+'">Next →</a>':'<span></span>')+'</nav>';
  }
  function cards(result, api) {
    if (!result.results.length) return '<div class="empty"><h2>No documents found</h2><p>Try another phrase or remove a filter.</p></div>';
    return '<div class="wcs-native-grid">'+result.results.map(raw=>{
      const page = raw.content || raw, item = root.WCSNativeContent.normalizePage(page);
      return '<article class="wcs-native-card"><div class="wcs-native-tags"><span class="eyebrow">'+esc(item.type || 'Document')+'</span>'+(item.regions || []).map(region=>'<span class="wcs-native-tag">'+esc(region)+'</span>').join('')+'</div><h2><a href="'+esc(api.pageUrl(page.id))+'">'+esc(item.title)+' <span aria-hidden="true">↗</span></a></h2>'+(item.summary?'<p>'+esc(item.summary)+'</p>':'')+'<div class="wcs-native-card-meta"><span>Updated '+esc(date(item.updated))+'</span><span>Version '+esc(item.version || '—')+'</span></div></article>';
    }).join('')+'</div>';
  }
  function workspaceTable(result, api) {
    const table = root.WCSDataTable;
    return table.render({label:'Native document workspace',columns:[{label:'Document'},{label:'Confluence version'},{label:'Last updated'},{label:'Action',actions:true}],rows:result.results.map(raw=>{
      const page = raw.content || raw;
      return {id:page.id,cells:[page.title,page.version?.number || '—',date(page.version?.when),table.html('<a class="button secondary compact" href="'+esc(api.pageUrl(page.id))+'">Open document ↗</a>')]};
    }),empty:{title:'Your queue is clear',description:'No documents match this workspace and search.'}});
  }
  function mount(element, config) {
    if (mounted.has(element)) return mounted.get(element);
    config = config || root.WCS_NATIVE_CONFIG || {};
    element.id = element.id || 'wcspedia'; element.classList.add('wcs-native');
    let generation=0, disposed=false;
    const role=config.pageRole || 'home';
    let api;
    try { api=client(config); } catch(error) { status(element,'',error); return {destroy(){}}; }
    async function render() {
      const request=++generation, params=new URLSearchParams(root.location.hash.split('?')[1] || ''), start=Number(params.get('start') || 0);
      const isWorkspace=role==='mine'||role==='review', isHome=role==='home'&&!root.location.hash.startsWith('#/results');
      const title=role==='mine'?'My workspace':role==='review'?'Reviewer workspace':role==='saved'?'Saved items':isHome?'A world of knowledge.<br>One place to find it.':'Explore our knowledge';
      const description=role==='saved'?'Your Confluence Save for later pages, together in one place.':isWorkspace?'Your assigned documents, with version-specific review and approval.':'Practical guidance. Shared experience. Knowledge that moves us forward.';
      root.WCSUI?.destroy(element);
      element.innerHTML='<div class="shell"><section class="wcs-native-hero"><p class="eyebrow">Wealth Credit Services · WCSpedia</p><h1>'+title+'</h1><p>'+description+'</p></section><div class="wcs-native-container">'+searchMarkup(params)+(isHome?'<nav class="wcs-native-types" aria-label="Browse by content type">'+TYPES.slice(0,7).map(type=>'<a href="#/results?type='+slug(type)+'">'+esc(type)+' <span aria-hidden="true">→</span></a>').join('')+'</nav>':'')+'<div class="wcs-native-results" aria-live="polite"><p role="status">Loading Confluence pages…</p></div></div></div>';
      enhance(element);
      element.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const values=new URLSearchParams(new root.FormData(event.currentTarget));values.delete('start');const hash='#/results?'+values.toString();if(root.location.hash===hash)render();else root.location.hash=hash;});
      element.querySelector('[data-native-reset]').onclick=()=>{if(root.location.hash==='#/results')render();else root.location.hash='/results';};
      try {
        const args={query:params.get('q')||'',type:params.get('type')||'',region:params.get('region')||'',sort:params.get('sort')||'updated',start:Number.isSafeInteger(start)&&start>=0?start:0,limit:12};
        const result=isWorkspace?await api.workspace({...args,role}):await api.search({...args,saved:role==='saved'});
        if(disposed||request!==generation)return;
        const target=element.querySelector('.wcs-native-results');
        target.innerHTML=(isWorkspace?workspaceTable(result,api):cards(result,api))+pager(result,params);
      } catch(error) { if(!disposed&&request===generation)status(element.querySelector('.wcs-native-results'),'',error); }
    }
    const listener=()=>render();root.addEventListener('hashchange',listener);
    const handle={ready:render(),refresh:render,destroy(){disposed=true;generation++;root.removeEventListener('hashchange',listener);root.WCSUI?.destroy(element);mounted.delete(element);}};
    mounted.set(element,handle);return handle;
  }
  function mountCreateWidget(element, config) {
    if(mounted.has(element))return mounted.get(element);
    config=config||root.WCS_NATIVE_CONFIG||{};uiHost();
    element.classList.add('wcs-native-create');
    element.innerHTML='<button type="button" class="wcs-native-create-button">Add document <span aria-hidden="true">+</span></button>';
    let api;try{api=client(config);}catch(error){status(element,'',error);return {destroy(){}};}
    const button=element.querySelector('button');
    // Creation authority is checked by prepare-create on the server. A visible
    // launcher is not a permission grant and does not write anything on mount.
    button.onclick=async()=>{
      if(config.authoringMode==='native-template'){
        button.disabled=true;
        try{const result=await api.prepareNativeCreate();navigate(result.editorUrl);}
        catch(error){root.WCSUI.dialog({title:'Create in Confluence',body:errorBox(error)});button.disabled=false;}
        return;
      }
      const dialog=root.WCSUI.dialog({title:'Create a document',description:'Choose a starting point. Your document opens in the Confluence editor.',body:'<form class="wcs-native-form" novalidate><div data-native-error role="alert"></div><label>Title<input name="title" maxlength="255" autofocus></label><label>Content type<select name="type">'+TYPES.map(type=>'<option value="'+slug(type)+'">'+esc(type)+'</option>').join('')+'</select></label><label>Summary<textarea name="summary" rows="3" maxlength="2000"></textarea></label><p class="quiet-note">Confluence owns the page and its version history. The page link is generated automatically.</p><div class="wcs-native-actions"><button class="button secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Continue to Confluence →</button></div></form>'});
      const form=dialog.body.querySelector('form');form.querySelector('[data-cancel]').onclick=()=>dialog.close();
      form.onsubmit=async event=>{event.preventDefault();if(dialog.busy)return;const values=new root.FormData(form),title=String(values.get('title')||'').trim();const message=form.querySelector('[data-native-error]');if(!title){message.textContent='Enter a document title.';form.elements.title.focus();return;}
        dialog.setBusy(true);form.querySelector('[type=submit]').disabled=true;form.querySelector('[data-cancel]').disabled=true;
        try{const result=await api.createWorkingPage({title,type:String(values.get('type')),summary:String(values.get('summary')||'').trim()});navigate(result.editorUrl);}
        catch(error){message.innerHTML=errorBox(error);dialog.setBusy(false);form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-cancel]').disabled=false;}
      };
    };
    const handle={destroy(){button.onclick=null;mounted.delete(element);}};mounted.set(element,handle);return handle;
  }
  function downloadText(name,text){const blob=new root.Blob([text],{type:'text/markdown;charset=utf-8'}),url=root.URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.append(a);a.click();a.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);}
  function mountDocumentControls(element,config){
    if(mounted.has(element))return mounted.get(element);
    config=config||root.WCS_NATIVE_CONFIG||{};uiHost();element.classList.add('wcs-native-document-controls');
    let disposed=false,api,id,page,properties=[],workflow=null;
    try{api=client(config);id=pageId(element,config);}catch(error){status(element,'',error);return {destroy(){}};}
    async function refresh(){
      status(element,'Loading document controls…');
      try{
        const results=await Promise.allSettled([api.getPage(id),api.getProperties(id),api.getWorkflowState(id)]);
        if(disposed)return;
        if(results[0].status==='rejected')throw results[0].reason;
        page=results[0].value;properties=results[1].status==='fulfilled'?results[1].value:[];workflow=results[2].status==='fulfilled'?results[2].value:null;
        if(workflow&&workflow.expectedVersion!==page.version.number)workflow=null;
        const item=root.WCSNativeContent.normalizePage(page,properties),caps=workflow?.capabilities||{};
        const inWorking=(page.ancestors||[]).some(ancestor=>String(ancestor.id)===String(config.workingRootPageId));
        const canEdit=(page.operations||[]).some(op=>op.operation==='update'&&op.targetType==='page')&&inWorking;
        const ctx=(config.contextPath ?? '/confluence').replace(/\/$/,'');
        element.innerHTML='<section class="wcs-native-control-card"><div class="wcs-native-control-heading"><div><p class="eyebrow">Document control</p><h2>'+esc(item.title)+'</h2></div><span class="wcs-native-tag">'+esc(workflow?.status || (inWorking?'Working page':'Confluence page'))+'</span></div><dl class="wcs-native-facts"><div><dt>Owner</dt><dd>'+esc(typeof item.owner==='object'?item.owner.name||item.owner.soeid:item.owner||'Not recorded')+'</dd></div><div><dt>Team</dt><dd>'+esc(item.team||'Not recorded')+'</dd></div><div><dt>Updated</dt><dd>'+esc(date(item.updated))+'</dd></div><div><dt>Native version</dt><dd>'+esc(item.version)+'</dd></div><div><dt>Next review</dt><dd>'+esc(date(item.nextReviewDate))+'</dd></div></dl><div class="wcs-native-actions">'+(canEdit||caps.edit===true?'<button class="button" data-native-action="edit">Edit in Confluence ↗</button>':'')+Object.keys(LABELS).filter(action=>caps[action]===true).map(action=>'<button class="button '+(action==='delete'?'danger':'secondary')+'" data-native-action="'+action+'">'+LABELS[action]+'</button>').join('')+'<button class="button secondary" data-native-action="download">Download ↓</button><button class="button secondary" data-native-action="copy">Copy Markdown</button><a class="button secondary" href="'+esc(ctx+'/pages/viewpreviousversions.action?pageId='+id)+'">Version history ↗</a></div><div data-native-feedback aria-live="polite"></div>'+(results[1].status==='rejected'?'<p class="quiet-note">Structured metadata could not be loaded. Values shown come from the page body where available.</p>':'')+(!workflow?'<p class="quiet-note">Review and approval controls become available when the workflow connection is configured. Native page history remains available.</p>':'')+'</section>';
        element.querySelectorAll('[data-native-action]').forEach(button=>button.onclick=()=>action(button));
      }catch(error){if(!disposed)status(element,'',error);}
    }
    async function action(button){
      const name=button.dataset.nativeAction,feedback=element.querySelector('[data-native-feedback]');
      try{
        if(name==='edit'){button.disabled=true;const result=await api.prepareEdit(id);navigate(result.editorUrl);return;}
        if(name==='copy'){if(!root.navigator.clipboard?.writeText)throw Error('Clipboard access is unavailable. Download Markdown instead.');await root.navigator.clipboard.writeText(root.WCSNativeContent.exportMarkdown(page,properties));feedback.textContent='Markdown copied.';return;}
        if(name==='download'){
          const ctx=(config.contextPath ?? '/confluence').replace(/\/$/,'');
          const popup=root.WCSUI.popover({anchor:button,label:'Download document',body:'<div class="wcs-native-download"><a href="'+esc(ctx+'/spaces/flyingpdf/pdfpageexport.action?pageId='+id)+'">PDF document ↗</a><a href="'+esc(ctx+'/exportword?pageId='+id)+'">Word document ↗</a><button type="button" data-markdown>Markdown file</button></div>'});
          popup.element.querySelector('[data-markdown]').onclick=()=>{downloadText((slug(page.title)||'document')+'.md',root.WCSNativeContent.exportMarkdown(page,properties));popup.close();};return;
        }
        const expectedVersion=page.version.number;
        const dialog=root.WCSUI.dialog({title:LABELS[name],description:'This decision applies to Confluence version '+expectedVersion+'. The server verifies your entitlement and the submitted evidence.',body:'<form class="wcs-native-form" novalidate><div data-native-error role="alert"></div><label>Reason or review notes<textarea name="comment" rows="4" maxlength="4000" autofocus></textarea></label>'+(name==='delete'?'<p>Deletion follows the configured server workflow and Confluence permissions. Confirm the document title before continuing.</p><label>Document title<input name="confirmation" autocomplete="off"></label>':'')+'<div class="wcs-native-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="submit" class="button '+(name==='delete'?'danger':'')+'">'+LABELS[name]+'</button></div></form>'});
        const form=dialog.body.querySelector('form');form.querySelector('[data-cancel]').onclick=()=>dialog.close();
        form.onsubmit=async event=>{
          event.preventDefault();if(dialog.busy)return;const values=new root.FormData(form),comment=String(values.get('comment')||'').trim(),message=form.querySelector('[data-native-error]');
          if(!comment){message.textContent='Enter a reason for the audit record.';return;}
          if(name==='delete'&&values.get('confirmation')!==page.title){message.textContent='Enter the exact document title.';return;}
          dialog.setBusy(true);form.querySelector('[type=submit]').disabled=true;form.querySelector('[data-cancel]').disabled=true;
          try{
            await api.submit(name,{pageId:id,expectedVersion,comment});dialog.setBusy(false);dialog.close();
            if(name==='delete'){status(element,'The workflow service confirmed deletion.');return;}
            await refresh();
          }catch(error){message.innerHTML=errorBox(error);dialog.setBusy(false);form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-cancel]').disabled=false;}
        };
      }catch(error){feedback.innerHTML=errorBox(error);}finally{if(button.isConnected)button.disabled=false;}
    }
    const handle={ready:refresh(),refresh,destroy(){disposed=true;mounted.delete(element);}};mounted.set(element,handle);return handle;
  }
  return Object.freeze({mount,mountCreateWidget,mountDocumentControls,types:TYPES,slug,pageId,pager});
});
