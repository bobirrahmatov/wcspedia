/* WCSpedia suggestions: feedback is a separate record, never a document edit or approval. */
(function (global, factory) {
  'use strict';
  const api = factory(global);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.WCSSuggestions = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';
  const STORE = 'wcspedia.suggestions.v1';
  const TYPES = ['Correction', 'Improvement', 'Training request'];
  const STATUSES = ['Open', 'Resolved', 'Dismissed'];
  const FORBIDDEN = 'input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.wcs-ui-layer,.wcs-suggestion-widget,[inert]';
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fail(message, code) { const error = new Error(message); error.code = code || 'VALIDATION'; throw error; }
  function text(value, label, max, required) {
    if (value != null && typeof value !== 'string') fail(label + ' must be text.');
    const result = String(value || '').replace(/\u0000/g, '').trim();
    if (required && !result) fail('Enter ' + label.toLowerCase() + '.');
    if (result.length > max) fail(label + ' must be ' + max + ' characters or fewer.');
    return result;
  }
  function anchorText(value,label,max){if(value!=null&&typeof value!=='string')fail(label+' must be text.');const result=String(value||'').replace(/\u0000/g,'');if(result.length>max)fail(label+' must be '+max+' characters or fewer.');return result;}
  function number(value, label) {
    if (value == null || value === '') return null;
    const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) fail(label + ' is invalid.'); return n;
  }
  function actorValue(value) {
    if (!value || !value.id) fail('Sign in before sending a suggestion.', 'IDENTITY');
    return {id:text(value.id,'User ID',200,true),name:text(value.name || value.id,'User name',200,true),role:text(value.role || 'Reader','User role',50,true)};
  }
  function contextValue(value) {
    value = value || {};
    const url = text(value.url,'Page URL',3000,true);
    let parsed; try { parsed = new URL(url); } catch (_) { fail('The page URL is invalid.'); }
    if (!['http:','https:','file:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('The page URL is invalid.');
    const context = {title:text(value.title || 'WCSpedia','Page title',300,true),url,documentId:text(value.documentId,'Document ID',200),version:number(value.version,'Document version'),revision:number(value.revision,'Document revision'),ownerId:text(value.ownerId,'Owner ID',200),reviewerId:text(value.reviewerId,'Reviewer ID',200),approverId:text(value.approverId,'Approver ID',200)};
    if(value.nativePageId!=null&&value.nativePageId!==''){
      if(!/^[1-9]\d{0,19}$/.test(String(value.nativePageId)))fail('The native document page ID is invalid.');
      context.nativePageId=String(value.nativePageId);
    }
    const anchor = value.anchor || {};
    context.anchor = {exact:anchorText(anchor.exact,'Selected text',4000),prefix:anchorText(anchor.prefix,'Preceding text',200),suffix:anchorText(anchor.suffix,'Following text',200),heading:text(anchor.heading,'Section heading',300),containerId:text(anchor.containerId,'Section ID',200),startOffset:Math.max(0,Math.min(1000000,Number(anchor.startOffset)||0)),endOffset:Math.max(0,Math.min(1000000,Number(anchor.endOffset)||0))};
    return context;
  }
  function normalizePayload(value) {
    value = value || {};
    if (!TYPES.includes(value.type)) fail('Choose a suggestion type.');
    return {type:value.type,correction:text(value.correction,'Suggested change',6000,true),reason:text(value.reason,'Reason or supporting context',3000,true),context:contextValue(value.context)};
  }
  function canTriage(record, actor) {
    if (!record || !actor || actor.role !== 'Manager') return false;
    const c = record.context || {};
    return !c.documentId || [c.ownerId,c.reviewerId,c.approverId].includes(actor.id);
  }
  function id() { return 'suggestion-' + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)); }
  function validateRecord(value) {
    if (!value || !STATUSES.includes(value.status)) fail('The suggestion service returned an invalid record.', 'RESPONSE');
    const result = Object.assign(normalizePayload(value), {id:text(value.id,'Suggestion ID',200,true),requestId:text(value.requestId,'Request ID',200,true),status:value.status,revision:number(value.revision,'Suggestion revision'),createdAt:text(value.createdAt,'Created time',60,true),createdBy:actorValue(value.createdBy),history:[]});
    if (!result.revision || !Number.isFinite(Date.parse(result.createdAt))) fail('The suggestion service returned an invalid record.', 'RESPONSE');
    if (!Array.isArray(value.history) || value.history.length > 1000) fail('The suggestion history is invalid.', 'RESPONSE');
    result.history=value.history.map(event=>({id:text(event.id,'Event ID',200,true),action:text(event.action,'Event action',80,true),at:text(event.at,'Event time',60,true),actor:actorValue(event.actor),comment:text(event.comment,'Decision comment',3000),requestId:text(event.requestId,'Request ID',200,true)}));
    return result;
  }
  function createService(options) {
    options = options || {};
    const config = options.config || {}, live = config.mode === 'confluence';
    if(live&&config.authoringMode==='confluence-session'){
      const api=options.personalAPI||global.WCSSpacePersonal||(typeof require==='function'?require('./space-personal.js'):null);
      if(!api?.create)fail('The native Confluence personal-actions helper is unavailable.','CONFIGURATION');
      const service=api.create(config,{fetch:options.fetch,location:options.location||global.location,comments:options.comments,DOMParser:options.DOMParser}).suggestions(options);
      return Object.freeze(Object.assign({},service,{submit:(value,requestId,input)=>service.submit(normalizePayload(value),requestId||id(),input)}));
    }
    const actor = () => actorValue(typeof options.getActor === 'function' ? options.getActor() : options.actor);
    const location = options.location || global.location || {href:'http://localhost/'};
    const origin = new URL(location.href).origin;
    const fetcher = options.fetch || (global.fetch && global.fetch.bind(global));
    let endpoint = null;
    if (live && config.suggestionEndpoint) {
      try { endpoint = new URL(config.suggestionEndpoint,location.href); } catch (_) { fail('The suggestion service URL is invalid.', 'CONFIGURATION'); }
      if (!['https:','http:'].includes(endpoint.protocol) || endpoint.origin !== origin || endpoint.username || endpoint.password || endpoint.hash) fail('The suggestion service must use the same origin as Confluence.', 'CONFIGURATION');
    }
    function storage() { try { return options.storage || global.localStorage; } catch (_) { fail('Local storage is unavailable. Your suggestion has not been saved.', 'STORAGE'); } }
    function read() {
      let raw;try { raw=storage().getItem(STORE); }catch(_){fail('Local storage is unavailable. Your suggestion has not been saved.','STORAGE');}
      if (!raw) return [];
      try { const data=JSON.parse(raw); if(data.schema!==1||!Array.isArray(data.suggestions)||data.suggestions.length>1000)throw Error();return data.suggestions.map(validateRecord); }
      catch(_){fail('The local suggestion queue could not be read. It has not been replaced.','STORAGE');}
    }
    function write(rows) {
      try { storage().setItem(STORE,JSON.stringify({schema:1,suggestions:rows})); }
      catch(_){fail('Local storage is full or unavailable. Your suggestion has not been saved.','STORAGE');}
      if(options.onChange)options.onChange();
    }
    async function request(method,body,query) {
      if(!endpoint) fail('Sending suggestions is not available on this site yet. Copy your request and share it with the document owner. The WCSpedia administrator needs to connect the suggestion service.', 'UNCONFIGURED');
      if(!fetcher)fail('The suggestion service is unavailable. Your request has not been confirmed.','NETWORK');
      const target=new URL(endpoint.href); if(config.rootPageId)target.searchParams.set('rootPageId',config.rootPageId);
      if(query)Object.keys(query).forEach(key=>{if(query[key])target.searchParams.set(key,String(query[key]));});
      const abort=typeof AbortController!=='undefined'?new AbortController():null, timer=abort?setTimeout(()=>abort.abort(),20000):null;
      try {
        const response=await fetcher(target.href,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:Object.assign({'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},body?{'Content-Type':'application/json','Idempotency-Key':body.requestId}:{}),body:body?JSON.stringify(body):undefined,signal:abort?abort.signal:undefined});
        if(!response.ok)fail(response.status===409?'This request changed or the retry key was reused. Refresh the queue before trying again.':response.status===401||response.status===403?'You do not have permission to access this suggestion request.':'The suggestion service could not confirm this request. Retry with the same details.',response.status===409?'CONFLICT':'SERVICE');
        const raw=await response.text(); if(raw.length>2000000)fail('The suggestion response is too large.','RESPONSE');
        try{return JSON.parse(raw);}catch(_){fail('The suggestion service did not return a valid confirmation.','RESPONSE');}
      } catch(error) { if(error.code)throw error;fail('The suggestion service could not confirm this request. Keep these details and retry; the same request will not be sent twice.','NETWORK'); }
      finally {if(timer)clearTimeout(timer);}
    }
    async function list(filters) {
      filters=filters||{};const user=actor();
      let rows;
      if(live){const result=await request('GET',null,{scope:filters.scope||'mine',documentId:filters.documentId,status:filters.status});if(!result||!Array.isArray(result.suggestions)||result.suggestions.length>1000)fail('The suggestion queue response is invalid.','RESPONSE');rows=result.suggestions.map(validateRecord);}
      else rows=read();
      // The service also enforces permissions. Local demo filtering is not a production authorization boundary.
      return rows.filter(row=>(filters.scope==='review'?canTriage(row,user):row.createdBy.id===user.id)).filter(row=>!filters.documentId||row.context.documentId===filters.documentId).filter(row=>!filters.status||row.status===filters.status).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(clone);
    }
    async function submit(value,requestId) {
      const user=actor(),payload=normalizePayload(value);requestId=text(requestId||id(),'Request ID',200,true);
      if(live){const result=await request('POST',{action:'create',requestId,payload});const record=validateRecord(result&&result.suggestion);if(record.requestId!==requestId||record.createdBy.id!==user.id||JSON.stringify(normalizePayload(record))!==JSON.stringify(payload))fail('The suggestion confirmation did not match this request.','RESPONSE');if(options.onChange)options.onChange();return record;}
      const rows=read(),existing=rows.find(row=>row.requestId===requestId);
      if(existing){if(existing.createdBy.id!==user.id||JSON.stringify(normalizePayload(existing))!==JSON.stringify(payload))fail('This retry key belongs to different request details.','CONFLICT');return clone(existing);}
      if(rows.some(row=>row.history.some(event=>event.requestId===requestId)))fail('This retry key belongs to a different request.','CONFLICT');
      if(rows.length>=1000)fail('The local demo suggestion queue is full.','STORAGE');
      const now=new Date().toISOString(),record=Object.assign(payload,{id:id(),requestId,status:'Open',revision:1,createdAt:now,createdBy:user,history:[{id:id(),action:'Submitted',at:now,actor:user,comment:'',requestId}]});
      rows.push(record);write(rows);return clone(record);
    }
    async function decide(recordId,value,requestId) {
      const user=actor();recordId=text(recordId,'Suggestion ID',200,true);value=value||{};requestId=text(requestId||id(),'Request ID',200,true);
      if(!['Resolved','Dismissed'].includes(value.status))fail('Choose a decision.');
      const comment=text(value.comment,'Decision comment',3000,true),expectedRevision=number(value.expectedRevision,'Expected revision');
      if(!expectedRevision)fail('Refresh this suggestion before making a decision.');
      if(live){const result=await request('POST',{action:'decide',requestId,suggestionId:recordId,status:value.status,comment,expectedRevision});const record=validateRecord(result&&result.suggestion),event=record.history.find(e=>e.requestId===requestId);if(record.id!==recordId||record.status!==value.status||record.revision!==expectedRevision+1||!event||event.action!==value.status||event.actor.id!==user.id||event.comment!==comment)fail('The decision confirmation did not match this request.','RESPONSE');if(options.onChange)options.onChange();return record;}
      const rows=read(),record=rows.find(row=>row.id===recordId);
      if(!record)fail('This suggestion no longer exists.','NOT_FOUND');
      if(!canTriage(record,user))fail('Only the assigned manager can decide this suggestion.','FORBIDDEN');
      if(rows.some(row=>row.id!==recordId&&row.history.some(event=>event.requestId===requestId)))fail('This retry key belongs to a different decision.','CONFLICT');
      const duplicate=record.history.find(event=>event.requestId===requestId);
      if(duplicate){if(duplicate.actor.id!==user.id||duplicate.comment!==comment||duplicate.action!==value.status)fail('This retry key belongs to a different decision.','CONFLICT');return clone(record);}
      if(record.revision!==expectedRevision||record.status!=='Open')fail('This suggestion has already changed. Refresh the queue.','CONFLICT');
      record.status=value.status;record.revision++;record.history.push({id:id(),action:value.status,at:new Date().toISOString(),actor:user,comment,requestId});write(rows);return clone(record);
    }
    return {list,submit,decide,canTriage:record=>canTriage(record,actor()),get available(){return !live||!!endpoint;},get live(){return live;},storeKey:STORE};
  }
  function captureSelection(root,selection) {
    if(!root||!selection||selection.isCollapsed||!selection.rangeCount)return null;
    const range=selection.getRangeAt(0),element=node=>node&&node.nodeType===1?node:node&&node.parentElement;
    const start=element(range.startContainer),end=element(range.endContainer);
    if(!start||!end||!root.contains(start)||!root.contains(end)||start.closest(FORBIDDEN)||end.closest(FORBIDDEN))return null;
    if(range.cloneContents().querySelector(FORBIDDEN))return null;
    const quote=selection.toString();if(!quote.trim()||quote.length>4000)return null;
    const common=element(range.commonAncestorContainer),block=common.closest('p,li,blockquote,h1,h2,h3,h4,td,th,section,article')||root;
    const before=range.cloneRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);
    const after=range.cloneRange();after.selectNodeContents(block);after.setStart(range.endContainer,range.endOffset);
    let heading=block.matches('h1,h2,h3,h4')?block.textContent:'';
    if(!heading){const headings=Array.from(root.querySelectorAll('h1,h2,h3,h4'));heading=headings.filter(h=>h.compareDocumentPosition(start)&4).pop()?.textContent||'';}
    return {exact:quote,prefix:before.toString().slice(-200),suffix:after.toString().slice(0,200),heading:heading.trim().slice(0,300),containerId:(block.id||'').slice(0,200),startOffset:before.toString().length,endOffset:before.toString().length+range.toString().length};
  }
  function requestMarkdown(payload) {
    const c=payload.context,anchor=c.anchor||{};
    return '# '+payload.type+' request\n\nPage: '+c.title+'\nURL: '+c.url+'\n'+(c.documentId?'Document: '+c.documentId+' · version '+(c.version||'—')+' · revision '+(c.revision||'—')+'\n':'')+(anchor.exact?'\n## Selected text\n\n'+anchor.exact.split('\n').map(line=>'> '+line).join('\n')+'\n':'')+'\n## Suggested change\n\n'+payload.correction+'\n\n## Reason or supporting context\n\n'+payload.reason+'\n';
  }
  function icon() {return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/></svg>';}
  function niceDate(value) {const date=new Date(value);return Number.isFinite(+date)?date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';}
  function quoteView(context) {const a=context.anchor||{};return a.exact?'<div class="suggestion-selection"><span>Selected passage'+(a.heading?' · '+escape(a.heading):'')+'</span><blockquote>'+escape(a.exact)+'</blockquote></div>':'<p class="suggestion-page-context">This request applies to the whole page.</p>';}
  function contextView(context) {return '<div class="suggestion-context"><span>For this page</span><strong>'+escape(context.title)+'</strong>'+(context.documentId?'<small>Version '+escape(context.version||'—')+' · revision '+escape(context.revision||'—')+'</small>':'')+'</div>'+quoteView(context);}
  async function copyText(value,UI) {
    try {await global.navigator.clipboard.writeText(value);return true;}catch(_){UI.dialog({title:'Copy suggestion request',description:'Select the request below and copy it to your clipboard.',body:'<textarea class="suggestion-copy" readonly aria-label="Suggestion request">'+escape(value)+'</textarea>',onMount(handle){handle.body.querySelector('textarea').select();}});return false;}
  }
  function mount(options) {
    options=options||{};const root=options.root,UI=global.WCSUI;if(!root||!UI)throw Error('WCSpedia controls must be mounted before suggestions.');
    const notify=options.notify||function(){},onChange=options.onChange||function(){};
    const service=options.service||createService({config:options.config,getActor:options.getActor});
    const doc=root.ownerDocument,widget=doc.createElement('div');widget.className='wcs-suggestion-widget';
    widget.innerHTML='<button type="button" class="suggestion-launch" aria-label="Suggest an edit or correction" aria-keyshortcuts="Alt+Shift+S">'+icon()+'<span>Suggest an edit</span></button><button type="button" class="suggestion-pending" aria-label="View my suggestions" hidden><span>0</span> open</button>';
    root.append(widget);let destroyed=false,dialog=null,popup=null,point=null,selection=null,historyDialog=null,historyInbox=null;
    const abort=new global.AbortController(),signal=abort.signal;
    function positionWidget(){
      if(destroyed||!widget.isConnected)return;
      const viewport=global.visualViewport,offset=viewport?viewport.offsetLeft:0,width=viewport?viewport.width:global.innerWidth;
      const inset=width<=760?16:24,preferred=root.getBoundingClientRect().left+inset;
      const left=Math.max(offset+16,Math.min(preferred,offset+width-widget.getBoundingClientRect().width-16));
      widget.style.setProperty('--wcs-suggestion-left',left+'px');
    }
    const resizeObserver=typeof global.ResizeObserver==='function'?new global.ResizeObserver(positionWidget):null;
    resizeObserver?.observe(root);resizeObserver?.observe(widget);
    global.addEventListener('resize',positionWidget,{signal});global.addEventListener('scroll',positionWidget,{signal,passive:true});
    global.visualViewport?.addEventListener('resize',positionWidget,{signal});global.visualViewport?.addEventListener('scroll',positionWidget,{signal,passive:true});
    positionWidget();
    async function refresh(){if(!service.available||service.canList===false)return;try{const rows=await service.list({scope:'mine'});if(destroyed)return;const count=widget.querySelector('.suggestion-pending');count.hidden=!rows.length;count.querySelector('span').textContent=String(rows.filter(row=>row.status==='Open').length);positionWidget();}catch(_){/* Opening the queue shows service/storage errors; never fake a pending count. */}}
    function changed(){if(destroyed)return;refresh();onChange();}
    function open(anchor) {
      if(destroyed||dialog&&dialog.element.isConnected)return;
      let context;try {context=contextValue(Object.assign({title:doc.title||'WCSpedia',url:global.location.href},options.getContext?options.getContext():{},anchor?{anchor}:{}));}catch(error){notify(error.message,{type:'error'});return;}
      let requestId=id(),lastPayload=null;
      dialog=UI.dialog({title:'Suggest an edit',description:'Help keep our knowledge clear, current, and useful.',body:contextView(context)+'<form class="suggestion-form" novalidate><div class="form-group"><label for="suggestion-type">What would you like to suggest?</label><select id="suggestion-type" name="type">'+TYPES.map(type=>'<option>'+type+'</option>').join('')+'</select></div><div class="form-group"><label for="suggestion-change">Suggested change</label><textarea id="suggestion-change" name="correction" maxlength="6000" placeholder="Describe the correction, propose replacement text, or explain the training you need." required></textarea></div><div class="form-group"><label for="suggestion-reason">Reason or supporting context</label><textarea id="suggestion-reason" name="reason" maxlength="3000" placeholder="Explain why this would help. Include supporting references when useful." required></textarea></div><p class="suggestion-delivery" id="suggestion-delivery-status" role="status">'+(service.deliveryDescription?escape(service.deliveryDescription):service.live?(service.available?'The document owner or assigned manager can review your request. Content changes follow the normal review and approval workflow.':'Sending suggestions is not available on this site yet. Copy your request and share it with the document owner. Nothing will be sent from this form.'):'Prototype: requests are saved in this browser’s local queue. No email or external notification is sent.')+'</p><div class="form-error" role="alert" hidden></div><div class="modal-actions"><button type="button" class="button secondary compact" data-suggestion-copy>Copy request</button><button type="button" class="button secondary" data-suggestion-cancel>Cancel</button><button type="submit" class="button" aria-describedby="suggestion-delivery-status"'+(!service.available||service.prepare?' disabled':'')+'>'+(service.prepare?'Checking access…':service.available?(service.live?'Send suggestion':'Save suggestion'):'Sending unavailable')+'</button></div></form>',onClose(){dialog=null;},onMount(handle){
        const form=handle.body.querySelector('form'),errorBox=form.querySelector('.form-error'),submit=form.querySelector('[type=submit]');
        let deliveryReady=service.available&&!service.prepare;
        if(service.prepare)submit.setAttribute('aria-busy','true');
        if(service.prepare)service.prepare(context,{signal}).then(()=>{if(destroyed||!handle.element.isConnected)return;deliveryReady=true;submit.removeAttribute('aria-busy');submit.disabled=false;submit.textContent='Send suggestion';},error=>{if(destroyed||!handle.element.isConnected)return;deliveryReady=false;submit.removeAttribute('aria-busy');submit.disabled=true;submit.textContent='Sending unavailable';form.querySelector('.suggestion-delivery').textContent=error.message;});
        const draft=()=>({type:form.elements.type.value,correction:text(form.elements.correction.value,'Suggested change',6000),reason:text(form.elements.reason.value,'Reason or supporting context',3000),context});
        const payload=()=>normalizePayload(draft());
        const showError=(error,type='error')=>{errorBox.textContent=error.message;errorBox.hidden=false;if(!destroyed)notify(error.message,{type});};
        form.querySelector('[data-suggestion-cancel]').onclick=()=>handle.close('cancel');
        form.querySelector('[data-suggestion-copy]').onclick=async event=>{event.preventDefault();event.stopPropagation();return UI.runButton(event.currentTarget,async()=>{try {const copied=await copyText(requestMarkdown(draft()),UI);if(copied)notify('Suggestion request copied.',{type:'success'});}catch(error){showError(error);}});};
        form.addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();if(handle.busy)return;if(!deliveryReady){showError(new Error('Sending is unavailable. Copy your request to share it with the document owner.'),'warning');return;}let value;try{value=payload();}catch(error){showError(error,'warning');return;}
          const serialized=JSON.stringify(value);if(lastPayload&&lastPayload!==serialized)requestId=id();lastPayload=serialized;handle.setBusy(true);form.querySelectorAll('button,input,textarea,select').forEach(field=>field.disabled=true);submit.textContent='Saving…';errorBox.hidden=true;
          try {await service.submit(value,requestId);handle.setBusy(false);handle.close('submitted');if(!destroyed){notify(service.native?'Suggestion posted to the document comments.':service.live?'Suggestion received for review.':'Suggestion saved to the local demo queue.',{type:'success'});changed();}}
          catch(error){handle.setBusy(false);form.querySelectorAll('button,input,textarea,select').forEach(field=>field.disabled=false);if(service.native&&['FORBIDDEN','COMMENTS_DISABLED','OUT_OF_SCOPE'].includes(error.code))deliveryReady=false;submit.disabled=!deliveryReady;submit.textContent=deliveryReady?(error.code==='OUTCOME_UNKNOWN'?'Check submission':service.live?'Send suggestion':'Save suggestion'):'Sending unavailable';showError(error);}
        });
      }});
    }
    function remember(){const current=captureSelection(root,global.getSelection());selection=current;}
    widget.querySelector('.suggestion-launch').addEventListener('pointerdown',event=>{event.stopPropagation();remember();},{signal});
    widget.querySelector('.suggestion-launch').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const current=captureSelection(root,global.getSelection());open(current||selection);selection=null;},{signal});
    widget.querySelector('.suggestion-pending').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();
      historyDialog=UI.dialog({title:'Your suggestions',description:'Follow the requests you have raised.',size:'wide',body:'<div class="suggestion-dialog-inbox"></div>',onClose(){historyInbox?.destroy();historyInbox=null;historyDialog=null;}});
      historyInbox=mountInbox(historyDialog.body.firstElementChild,{service,getActor:options.getActor,scope:'mine',notify,onChange:changed});
    },{signal});
    root.addEventListener('contextmenu',event=>{const selected=captureSelection(root,global.getSelection());if(!selected||event.target.closest(FORBIDDEN))return;event.preventDefault();event.stopPropagation();popup?.close('replace');point?.remove();point=doc.createElement('span');point.className='suggestion-menu-anchor';point.setAttribute('aria-hidden','true');point.style.left=Math.max(0,event.clientX)+'px';point.style.top=Math.max(0,event.clientY)+'px';root.append(point);
      popup=UI.popover({anchor:point,role:'menu',label:'Selected text actions',className:'suggestion-context-menu',restoreFocus:false,body:'<button type="button" role="menuitem">'+icon()+'Suggest a correction</button>',onClose(){point?.remove();point=null;popup=null;}});
      popup?.element.querySelector('button').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();popup?.close('choose');open(selected);});
    },{signal,capture:true});
    root.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&event.key.toLowerCase()==='s'&&!event.target.closest(FORBIDDEN)){event.preventDefault();event.stopPropagation();open(captureSelection(root,global.getSelection()));}},{signal,capture:true});
    global.addEventListener('storage',event=>{if(event.key===STORE)refresh();},{signal});refresh();
    return {service,open:()=>open(captureSelection(root,global.getSelection())),list:filters=>service.list(filters),refresh,destroy(){destroyed=true;abort.abort();resizeObserver?.disconnect();popup?.close('destroy');point?.remove();if(dialog){dialog.setBusy(false);dialog.close('destroy');}historyInbox?.destroy();if(historyDialog){historyDialog.setBusy(false);historyDialog.close('destroy');}widget.remove();}};
  }
  function mountInbox(container,options) {
    options=options||{};const service=options.service,UI=global.WCSUI,Table=global.WCSDataTable;if(!container||!service||!UI||!Table||!global.WCSPagination)throw Error('A suggestion service, shared table, pagination and controls are required.');
    const scope=options.scope==='review'?'review':'mine',notify=options.notify||function(){};let destroyed=false,generation=0,rows=[],filter='Open',query='',page=1,active=null,requestId=null;
    const pageSize=10,searchId='suggestion-search-'+id(),columns=[{label:'Request / document',className:'suggestion-request-cell'},{label:'Submitted by'},{label:'Submitted'},{label:'Status'},{label:'Actions',visuallyHidden:true,actions:true}];
    container.classList.add('suggestion-inbox');
    function changed(){if(destroyed)return;refresh();if(options.onChange)options.onChange();}
    function heading(){return '<div class="suggestion-inbox-heading"><div><h2>'+(scope==='review'?'Suggestions to review':'Your suggestions')+'</h2><p>'+(scope==='review'?'Corrections and learning requests for your knowledge areas.':'Track the corrections, ideas, and learning requests you have raised.')+'</p></div><div class="suggestion-filters" role="group" aria-label="Suggestion status">'+['Open','Resolved','Dismissed','All'].map(status=>'<button type="button" data-suggestion-filter="'+status+'" aria-pressed="'+(filter===status)+'">'+status+'</button>').join('')+'</div></div>';}
    function render() {
      const needle=query.toLocaleLowerCase(),shown=rows.filter(row=>(filter==='All'||row.status===filter)&&(!needle||[row.context.title,row.context.documentId,row.correction,row.type,row.createdBy.name,row.createdBy.id].some(value=>String(value||'').toLocaleLowerCase().includes(needle))));
      const pages=Math.max(1,Math.ceil(shown.length/pageSize));page=Math.max(1,Math.min(page,pages));
      const table=Table.render({label:scope==='review'?'Suggestions awaiting review':'My suggestions',className:'suggestion-table',columns,rows:shown.slice((page-1)*pageSize,page*pageSize).map(row=>({id:row.id,className:'suggestion-row',cells:[
        Table.html('<span class="wcs-data-table-kicker">'+escape(row.type)+'</span><strong class="wcs-data-table-title">'+escape(row.context.title)+'</strong><p class="wcs-data-table-description">'+escape(row.correction)+'</p>'+(row.context.documentId?'<span class="wcs-data-table-secondary">Version '+escape(row.context.version||'—')+' · revision '+escape(row.context.revision||'—')+'</span>':'')),
        row.createdBy.name,
        niceDate(row.createdAt),
        Table.html('<span class="suggestion-status '+escape(row.status.toLowerCase())+'">'+escape(row.status)+'</span>'),
        Table.html('<div class="wcs-data-table-actions"><button type="button" class="button secondary compact" data-suggestion-open="'+escape(row.id)+'" aria-label="'+(scope==='review'&&row.status==='Open'?'Review':'View')+' request: '+escape(row.context.title)+'">'+(scope==='review'&&row.status==='Open'?'Review request':'View request')+'</button></div>')
      ]})),empty:{title:query?'No matching suggestions':filter==='Open'?'No open suggestions':'No '+filter.toLowerCase()+' suggestions to show',description:query?'Try another document, person, or keyword.':'New requests will appear here when they are submitted.'}});
      container.innerHTML=heading()+'<form class="wcs-data-table-search suggestion-search" data-suggestion-search><label class="sr-only" for="'+searchId+'">Search suggestions</label><input id="'+searchId+'" type="search" name="q" maxlength="150" placeholder="Search by document, person, or keyword" value="'+escape(query)+'"><button class="button" type="submit">Search</button>'+(query?'<button type="button" class="link" data-suggestion-clear>Clear</button>':'')+'</form><div class="wcs-data-table-results-label" role="status">'+shown.length+' '+(shown.length===1?'suggestion':'suggestions')+(query?' matching “'+escape(query)+'”':'')+'</div>'+table+(shown.length?'<div class="discovery-pagination"><span>Showing '+((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,shown.length)+' of '+shown.length+'</span>'+global.WCSPagination.render({totalPages:pages,currentPage:page,href:n=>'#suggestion-page-'+n,ariaLabel:'Suggestion pages'})+'</div>':'');
    }
    async function refresh() {
      const turn=++generation;
      if(service.canList===false){container.removeAttribute('aria-busy');container.innerHTML='<div class="suggestion-inbox-heading"><div><h2>Suggestions</h2><p>Follow up in the document discussion.</p></div></div>'+Table.render({label:'Document suggestions',columns,empty:{title:'Suggestions stay with their document',description:'Suggestions are Confluence comments on the published document. Open its discussion to read and reply. Edits still follow the review and approval workflow.'}});return;}
      container.setAttribute('aria-busy','true');
      if(!rows.length)container.innerHTML=heading()+Table.render({label:'Suggestions',columns,loading:true,loadingLabel:'Loading suggestions…'});
      try{const next=await service.list({scope});if(destroyed||turn!==generation)return;rows=next;render();}
      catch(error){if(destroyed||turn!==generation)return;rows=[];container.innerHTML=heading()+Table.render({label:'Suggestions',columns,empty:{title:error.code==='UNCONFIGURED'?'Suggestions are not connected yet':'Suggestions unavailable',description:error.message,action:error.code==='UNCONFIGURED'?undefined:Table.html('<button type="button" class="button secondary" data-suggestion-retry>Try again</button>')}});}
      finally {if(!destroyed&&turn===generation)container.removeAttribute('aria-busy');}
    }
    function openRecord(record) {
      const allowed=scope==='review'&&record.status==='Open'&&service.canTriage(record);requestId=id();
      active=UI.dialog({title:record.type+' request',size:'wide',description:'A suggestion does not change or approve the document.',body:contextView(record.context)+'<div class="suggestion-request-copy"><h3>Suggested change</h3><p>'+escape(record.correction)+'</p><h3>Reason or supporting context</h3><p>'+escape(record.reason)+'</p></div><div class="suggestion-history"><h3>Request history</h3><ol>'+record.history.map(event=>'<li><strong>'+escape(event.action)+'</strong><span>'+escape(event.actor.name)+' · '+escape(niceDate(event.at))+'</span>'+(event.comment?'<p>'+escape(event.comment)+'</p>':'')+'</li>').join('')+'</ol></div>'+(allowed?'<form class="suggestion-decision" novalidate><div class="form-group"><label for="suggestion-decision-comment">Decision and follow-up</label><textarea id="suggestion-decision-comment" name="comment" required maxlength="3000" placeholder="Explain the decision. For a correction, reference the approved revision or follow-up action."></textarea></div><p class="suggestion-delivery">Resolve only after the request is addressed. Any content change must use the document’s review and approval workflow.</p><div class="form-error" role="alert" hidden></div><div class="modal-actions"><button class="button secondary" type="submit" name="decision" value="Dismissed">Dismiss with reason</button><button class="button" type="submit" name="decision" value="Resolved">Mark resolved</button></div></form>':'')+'<div class="suggestion-request-close"><button type="button" class="button secondary compact" data-suggestion-close>Close request</button></div>',onClose(){active=null;},onMount(handle){handle.body.querySelector('[data-suggestion-close]').onclick=()=>handle.close('close');const form=handle.body.querySelector('form');if(!form)return;let lastDecision=null;form.addEventListener('submit',async event=>{event.preventDefault();if(handle.busy)return;const errorBox=form.querySelector('.form-error'),decision={status:event.submitter?.value||'',comment:form.elements.comment.value,expectedRevision:record.revision},serialized=JSON.stringify(decision);if(lastDecision&&lastDecision!==serialized)requestId=id();lastDecision=serialized;handle.setBusy(true);form.querySelectorAll('button').forEach(button=>button.disabled=true);errorBox.hidden=true;
          try{await service.decide(record.id,decision,requestId);handle.setBusy(false);handle.close('decided');if(!destroyed){notify('Suggestion '+decision.status.toLowerCase()+'.',{type:'success'});changed();}}
          catch(error){handle.setBusy(false);form.querySelectorAll('button').forEach(button=>button.disabled=false);errorBox.textContent=error.message;errorBox.hidden=false;if(!destroyed)notify(error.message,{type:'error'});}
        });}});
    }
    function click(event){
      const control=event.target.closest('button,[data-page]');if(!control||!container.contains(control))return;
      if(control.hasAttribute('data-page')){event.preventDefault();event.stopPropagation();page=Number(control.dataset.page)||1;render();container.querySelector('.wcs-data-table-scroll')?.focus({preventScroll:true});}
      else if(control.dataset.suggestionFilter){filter=control.dataset.suggestionFilter;page=1;render();}
      else if(control.hasAttribute('data-suggestion-clear')){query='';page=1;render();container.querySelector('[name=q]')?.focus();}
      else if(control.hasAttribute('data-suggestion-retry'))UI.runButton(control,refresh);
      else if(control.dataset.suggestionOpen){const record=rows.find(row=>row.id===control.dataset.suggestionOpen);if(record)openRecord(record);}
    }
    function search(event){if(!event.target.hasAttribute('data-suggestion-search'))return;event.preventDefault();event.stopPropagation();query=String(new FormData(event.target).get('q')||'').trim().slice(0,150);page=1;render();container.querySelector('.wcs-data-table-scroll')?.focus({preventScroll:true});}
    const storageChanged=event=>{if(event.key===STORE)refresh();};container.addEventListener('click',click);container.addEventListener('submit',search);global.addEventListener('storage',storageChanged);refresh();
    return {refresh,destroy(){destroyed=true;generation++;container.removeEventListener('click',click);container.removeEventListener('submit',search);global.removeEventListener('storage',storageChanged);if(active){active.setBusy(false);active.close('destroy');}}};
  }
  return {createService,mount,mountInbox,captureSelection,normalizePayload,canTriage,requestMarkdown,storeKey:STORE};
}));
