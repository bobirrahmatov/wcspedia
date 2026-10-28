/* Personal saves and governed health views. One host context supplies the
 * currently readable documents and existing Confluence entitlement decisions. */
(function (root) {
  'use strict';
  function create(options) {
    const H=root.WCSContentHealth, UI=root.WCSContentHealthUI, Table=root.WCSDataTable, esc=Table.escape;
    let bookmarkService, healthService, bookmarkState={available:false,bookmarks:[],revision:null}, records={}, healthReady=false, healthError='', healthRecoveryId=null, generation=0, healthLoadGeneration=0, healthEditEpoch=0, disposed=false, mountedHealth=null;
    const context=options.context, url=options.url, documentHref=options.documentHref;
    function createServices(){
      const c=context();
      try{bookmarkService=root.WCSBookmarks.create({config:options.config,mode:options.config.mode,storage:options.storage,key:'wcspedia.bookmarks.v1',identity:c.identity,endpoint:options.config.bookmarksEndpoint,rootPageId:options.config.rootPageId,baseUrl:root.location.href,fetch:root.fetch?.bind(root),withLock:options.withLock,getDocuments:()=>context().documents,canRead:d=>context().canRead(d),publishedVersion:options.publishedVersion});}catch(error){bookmarkService={load:()=>Promise.reject(error),resolve:()=>[]};}
      try{healthService=root.WCSHealthService.create({config:options.config,identity:c.identity,storage:options.storage,withLock:options.withLock,fetch:root.fetch?.bind(root),location:root.location,getContext(id){const latest=context();return {document:latest.documents.find(d=>d.id===id&&latest.canRead(d)),people:latest.people,actor:latest.actor,canEdit:latest.canEdit(latest.documents.find(d=>d.id===id)),signedSOEID:latest.identity?.soeid};}});}catch(error){healthService={load:()=>Promise.reject(error)};}
    }
    function transientReadFailure(error){return ['NETWORK','TIMEOUT','SEARCH_TIMEOUT'].includes(error?.code)||[408,429,500,502,503,504].includes(error?.status);}
    let bookmarksLoading=false,healthLoading=false;
    async function load(reset=false,settings={}){
      bookmarksLoading=true;if(!settings.bookmarksOnly)healthLoading=true;
      const current=++generation,currentHealth=settings.bookmarksOnly?healthLoadGeneration:++healthLoadGeneration,wasActive=!!bookmarkService;
      if(reset||!bookmarkService){bookmarkState={available:false,bookmarks:[],revision:null,reason:'Loading saved items…'};records={};healthReady=false;healthError='Loading content health…';createServices();if(wasActive)options.refresh();}
      const services={bookmarks:bookmarkService,health:healthService},startingBookmarkRevision=bookmarkState.revision,startingHealthEpoch=healthEditEpoch;
      const active=()=>!disposed&&current===generation;
      const bookmarks=Promise.resolve().then(()=>services.bookmarks.load()).then(next=>{
        if(!active())return;
        if(bookmarkState.revision===startingBookmarkRevision||next.revision>=bookmarkState.revision)bookmarkState=next;
      },error=>{
        if(!active()||bookmarkState.revision!==startingBookmarkRevision)return;
        // Keep this tab's last successful list only for transport failures.
        // Authentication, permissions, identity and invalid data fail closed.
        bookmarkState=bookmarkState.available&&transientReadFailure(error)
          ? {...bookmarkState,stale:true,reason:error.message}
          : {available:false,bookmarks:[],revision:null,reason:error.message||'Saved items are unavailable.'};
      }).then(()=>{if(active()){bookmarksLoading=false;settings.onBookmarks?.();}});
      const health=settings.bookmarksOnly?Promise.resolve():Promise.resolve().then(()=>services.health.load(context().documents.filter(d=>context().canRead(d)))).then(next=>{
        if(!disposed&&currentHealth===healthLoadGeneration&&startingHealthEpoch===healthEditEpoch){healthReady=true;records=next;healthError='';healthRecoveryId=null;}
      },error=>{
        if(!disposed&&currentHealth===healthLoadGeneration&&startingHealthEpoch===healthEditEpoch){healthReady=false;records={};healthError=error.message||'Content health is unavailable.';healthRecoveryId=error.recoveryDocumentId||null;}
      });
      await Promise.all([bookmarks,health]);
      if(!settings.bookmarksOnly&&currentHealth===healthLoadGeneration)healthLoading=false;
    }
    function supportsHealth(doc){return !!doc&&(!healthService?.supports||healthService.supports(doc));}
    function report(doc){return healthReady&&supportsHealth(doc)?H.evaluate(doc,records[doc.id]||null,{people:context().people,now:new Date().toISOString()}):null;}
    function saved(doc){return !!doc&&bookmarkState.bookmarks.some(b=>b.documentId===doc.id);}
    function bookmarkButton(doc){
      if(!options.publishedVersion(doc))return '';
      return '<button type="button" class="button secondary compact wcs-bookmark-button" data-library-action="bookmark" data-library-document="'+esc(doc.id)+'" aria-pressed="'+saved(doc)+'"'+(!bookmarkState.available||bookmarkState.stale?' disabled title="Saved items are unavailable"':'')+'><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="'+(saved(doc)?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.6"><path d="M6 3h12v18l-6-4-6 4z"/></svg>'+(!bookmarkState.available?'Save unavailable':saved(doc)?'Saved':'Save')+'</button>';
    }
    function tag(doc){
      if(!options.publishedVersion(doc)||doc.singlePageInsight)return '';
      if(!supportsHealth(doc))return '<span class="wcs-health-tag is-unavailable" title="Content-health rules apply to documents published through the WCSpedia approval workflow.">Not managed</span>';
      const value=report(doc);
      return value?UI.tag(value,{href:documentHref(doc,'health')}):healthLoading?'<span class="wcs-health-tag" role="status">Checking…</span>':'<a class="wcs-health-tag is-unavailable" href="'+esc(documentHref(doc,'health'))+'">Health unavailable</a>';
    }
    function tabs(active,reviewer=false){return '<nav class="tabs library-workspace-tabs" aria-label="Workspace sections">'+[[reviewer?'review':'documents',reviewer?'Review queue':'My documents',reviewer?url('/review'):url('/results',{view:'mine'})],...(!reviewer?[['saved','Saved items',url('/saved')]]:[]),['health','Content health',url('/health')]].map(([key,label,href])=>'<a href="'+esc(href)+'"'+(active===key?' class="active" aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';}
    function policy(doc){const r=records[doc.id];return r?.rulesRevision?'Document rules · r'+r.rulesRevision:'Default rules';}
    function workspace(kind,params){
      const c=context(),isHealth=kind==='health',q=(params.get('q')||'').slice(0,500),filter=params.get('health')||'',mode=options.config.pageRole==='review';
      let rows=isHealth?c.documents.filter(d=>!d.deletedAt&&options.publishedVersion(d)&&c.canRead(d)&&supportsHealth(d)).map(doc=>({doc,version:options.publishedVersion(doc),report:report(doc)})).filter(row=>c.canEdit(row.doc)||[row.doc.ownerId,row.report?.assigneeId].includes(c.actor.id)):bookmarkService?bookmarkService.resolve(bookmarkState):[];
      rows=rows.filter(row=>(!q||(row.version.title+' '+row.doc.reference+' '+row.version.summary).toLowerCase().includes(q.toLowerCase()))&&(!isHealth||!filter||row.report?.tag===filter));
      if(isHealth)rows.sort((a,b)=>['Action required','Review due','Check needed','Healthy'].indexOf(a.report?.tag)-['Action required','Review due','Check needed','Healthy'].indexOf(b.report?.tag)||a.version.title.localeCompare(b.version.title));
      const total=rows.length,pages=Math.max(1,Math.ceil(total/8)),page=Math.max(1,Math.min(pages,Math.floor(Number(params.get('page')))||1)),visible=rows.slice((page-1)*8,page*8),available=isHealth?healthReady:bookmarkState.available;
      const columns=isHealth?[{label:'Document',className:'wcs-table-document'},{label:'Health'},{label:'Workflow'},{label:'Assigned to'},{label:'Due date'},{label:'Actions',actions:true}]:[{label:'Document',className:'wcs-table-document'},{label:'Health'},{label:'Saved on'},{label:'Actions',actions:true}];
      const tableRows=available?visible.map(row=>{
        const d=row.doc,v=row.version,r=row.report,href=d.nativePage&&d.nativeUrl?d.nativeUrl:documentHref(d,isHealth?'health':'content');
        const title=Table.html('<span class="wcs-data-table-kicker">'+esc(d.type)+' · '+esc(d.reference)+'</span><a class="wcs-data-table-title" href="'+esc(href)+'">'+esc(v.title)+'</a><p class="wcs-data-table-description">'+esc(v.summary)+'</p>'+(isHealth?'<span class="wcs-rule-label">'+esc(policy(d))+'</span>':'<span class="wcs-data-table-secondary">'+(d.nativePage?'Confluence page version '+esc(v.version):'Current approved version '+esc(v.version)+' · revision '+esc(v.revision))+'</span>'));
        const action='<a class="button secondary compact" href="'+esc(href)+'">'+(isHealth?'View checks':'Read document')+'<span class="sr-only"> '+esc(v.title)+'</span></a>';
        return {id:d.id,cells:isHealth?[title,Table.html(tag(d)),r?.workflowStatus||'Unavailable',c.people.find(p=>p.id===r?.assigneeId)?.name||'Unassigned',r?.dueAt?options.date(r.dueAt):'—',Table.html('<div class="wcs-data-table-actions">'+action+'</div>')]:[title,Table.html(d.nativePage?'<span class="wcs-data-table-secondary">—</span>':tag(d)),row.savedAt?options.date(row.savedAt):'—',Table.html('<div class="wcs-data-table-actions">'+action+bookmarkButton(d)+'</div>')]};
      }):[];
      if(!available&&(isHealth?healthLoading:bookmarksLoading))return '<div class="discovery-container"><h1>'+(isHealth?'Content health':'Saved items')+'</h1>'+root.WCSLoadingOverlay.skeleton(isHealth?'Loading content checks…':'Loading saved items…')+'</div>';
      const stale=!isHealth&&bookmarkState.stale;
      const error=available&&!stale?'':'<div class="library-unavailable" role="status"><strong>'+ (isHealth?'Content health is unavailable':stale?'Showing previously loaded saved items. Refresh unavailable.':'Saved items are unavailable')+'</strong><p>'+esc(isHealth?healthError:bookmarkState.reason||'The personal preferences service is not configured.')+'</p><button type="button" class="button secondary" data-library-action="retry" data-library-retry="'+kind+'">Try again</button></div>';
      return '<div class="discovery workspace-page"><section class="press-heading page-panel"><div class="discovery-container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#/">WCSpedia</a><span class="wcs-breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">'+ (isHealth?'Content health':'Saved items')+'</span></nav><div class="eyebrow">'+(isHealth?'Maintain trusted knowledge':'Your personal library')+'</div><h1>'+ (isHealth?'Keep knowledge current.':'Saved items')+'</h1><p>'+ (isHealth?'Rule-based checks, clear ownership, and a recorded path to resolution.':options.config.authoringMode==='confluence-session'?'Your saved documents, using Confluence’s Save for later.':'Your saved documents always open the current approved version.')+'</p></div></section><div class="discovery-container">'+(options.config.pageRole==='saved'?'':tabs(kind,mode))+error+'<form class="library-workspace-search" data-library-search="'+kind+'" role="search"><label><span>Search '+(isHealth?'content health':'saved items')+'</span><input name="q" type="search" maxlength="500" value="'+esc(q)+'" placeholder="Document title or reference"></label>'+(isHealth?'<label><span>Health status</span><select name="health"><option value="">All statuses</option>'+['Action required','Review due','Check needed','Healthy'].map(label=>'<option'+(filter===label?' selected':'')+'>'+label+'</option>').join('')+'</select></label>':'')+'<button class="button" type="submit">Search</button><a class="link" href="'+url('/'+kind)+'">Reset</a></form><div class="library-count" role="status">'+(available?total+' '+(total===1?'document':'documents'):'Results unavailable')+'</div>'+Table.render({label:isHealth?'Content health worklist':'Saved documents',columns,rows:tableRows,empty:{title:available?(isHealth?'No documents to maintain':'No saved documents yet'):'Unable to load this list',description:available?(q||filter?'Try another search or remove a filter.':isHealth?'Published documents you own, are assigned, or may edit appear here.':options.config.authoringMode==='confluence-session'?'Choose Save on a document, or use Confluence’s Save for later, to add it to your personal library.':'Choose Save on an approved document to add it to your personal library.'):'Try again when the service is available.'}})+(available&&pages>1?'<div class="discovery-pagination"><span>Showing '+((page-1)*8+1)+'–'+Math.min(page*8,total)+' of '+total+'</span>'+root.WCSPagination.render({totalPages:pages,currentPage:page,href:n=>url('/'+kind,{q,health:filter,page:n}),ariaLabel:isHealth?'Content health pages':'Saved item pages'})+'</div>':'')+'<p class="quiet-note library-scope-note">'+(isHealth?'Checks run when this view loads and after a document or rule changes. External resource access is verified by an accountable manager; a failed browser request is never labelled a broken resource.':'Saved items are personal to your signed-in account. Deleted documents and documents you can no longer read are excluded.')+'</p></div></div>';
    }
    function mount(container){
      mountedHealth?.destroy();mountedHealth=null;
      const host=container.querySelector('[data-content-health]');
      if(host){
        const c=context(),doc=c.documents.find(d=>d.id===host.dataset.contentHealth);
        if(!healthReady&&healthLoading){host.innerHTML=root.WCSLoadingOverlay.skeleton('Loading content checks…');}
        else if(!healthReady){host.innerHTML='<div class="library-unavailable" role="status"><h2>Content health unavailable</h2><p>'+esc(healthError)+'</p><button type="button" class="button secondary" data-library-action="retry" data-library-retry="health">Try again</button></div>';}
        else if(doc?.singlePageInsight){host.innerHTML='<div class="library-unavailable"><h2>Published article history</h2><p>Use Version history and the publication audit for this Insights article. Private review cases apply to Job aids.</p></div>';}
        else if(doc&&!supportsHealth(doc)){host.innerHTML='<div class="library-unavailable" role="status"><h2>Content health is not managed for this page</h2><p>Rule changes and review evidence are available for documents published through the WCSpedia approval workflow.</p></div>';}
        else if(doc){
          const r=records[doc.id]||H.initial(doc),evaluation=report(doc),identity=c.identity?.soeid;
          mountedHealth=UI.mount(host,{doc,version:options.publishedVersion(doc),people:c.people,actor:c.actor,record:r,report:evaluation,auditPage:new URLSearchParams(root.location.hash.split('?')[1]||'').get('healthPage'),auditHref:n=>{const p=new URLSearchParams(root.location.hash.split('?')[1]||'');p.set('healthPage',String(n));return root.location.hash.split('?')[0]+'?'+p.toString();},canManage:()=>H.permissions(doc,records[doc.id],{people:context().people,actor:context().actor,context:{canEdit:context().canEdit(doc),signedSOEID:context().identity?.soeid}}).canManage,canAct:()=>H.permissions(doc,records[doc.id],{people:context().people,actor:context().actor,context:{canEdit:context().canEdit(doc),signedSOEID:context().identity?.soeid}}).canAct,canAudit:c.canEdit(doc)||[doc.ownerId,evaluation.assigneeId].includes(c.actor.id),async save(command){if(identity!==context().identity?.soeid)throw Error('Your identity changed. Reload before making a health decision.');records[doc.id]=await healthService.submit(doc.id,command);healthEditEpoch++;return records[doc.id];},refresh:options.refresh,notify:options.notify});
        }
      }
    }
    async function click(event){
      const button=event.target.closest('[data-library-action]');if(!button)return;
      const action=button.dataset.libraryAction;if(button.disabled||disposed||action==='bookmark'&&(!bookmarkState.available||bookmarkState.stale))return;
      const routeKey=root.location.href,requestGeneration=generation;
      button.disabled=true;button.setAttribute('aria-busy','true');
      try{
        if(action==='retry'){const isHealth=button.dataset.libraryRetry==='health';if(isHealth&&healthRecoveryId&&healthService.recover)await healthService.recover(healthRecoveryId);await load(false,{bookmarksOnly:!isHealth});if(disposed||routeKey!==root.location.href)return;options.refresh();const ready=isHealth?healthReady:bookmarkState.available&&!bookmarkState.stale;options.notify(ready?(isHealth?'Content health refreshed.':'Saved items refreshed.'):(isHealth?'Content health is still unavailable.':'Saved items are still unavailable.'),{type:ready?'success':'warning'});return;}
        if(action==='bookmark'){
          const id=button.dataset.libraryDocument,doc=context().documents.find(d=>d.id===id)||bookmarkService.resolve(bookmarkState).find(row=>row.documentId===id)?.doc,identity=context().identity?.soeid,service=bookmarkService;
          const next=await service.set(id,!saved(doc),{expectedRevision:bookmarkState.revision});
          if(disposed||identity!==context().identity?.soeid||service!==bookmarkService||requestGeneration!==generation)return;
          bookmarkState=next;if(routeKey!==root.location.href)return;options.refresh();options.notify(saved(doc)?'Saved to your personal library.':'Removed from your saved items.',{type:'success'});
          [...options.container.querySelectorAll('[data-library-document]')].find(el=>el.dataset.libraryDocument===id)?.focus();
        }
      }catch(error){if(!disposed&&requestGeneration===generation&&routeKey===root.location.href)options.notify(error.message,{type:'error'});button.disabled=false;}finally{button.removeAttribute('aria-busy');button.disabled=false;}
    }
    function submit(event){const form=event.target.closest('[data-library-search]');if(!form)return;event.preventDefault();const fields=new FormData(form);options.go(url('/'+form.dataset.librarySearch,{q:fields.get('q')||'',health:fields.get('health')||''}));}
    options.container.addEventListener('click',click);options.container.addEventListener('submit',submit);
    function destroy(){disposed=true;generation++;mountedHealth?.destroy();options.container.removeEventListener('click',click);options.container.removeEventListener('submit',submit);}
    return {load,report,tag,bookmarkButton,tabs,workspace,mount,destroy,unmount(){mountedHealth?.destroy();mountedHealth=null;}};
  }
  root.WCSLibraryWorkflows=Object.freeze({create});
})(typeof globalThis!=='undefined'?globalThis:this);
