/* Shared entitlement directory UI. All decisions delegate to WCSEntitlements. */
(function(global){
  'use strict';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={'content.create':'Add documents','content.edit':'Edit documents','content.delete':'Delete documents','entitlements.view':'View entitlements','entitlements.add':'Add entitlements','entitlements.edit':'Edit entitlements','entitlements.revoke':'Revoke entitlements'};
  const serviceReady=options=>options.access?.serviceConnected!==false;
  const unavailableMessage='Saving is not connected. Ask your Confluence administrator to connect the entitlement service to this JSON attachment.';
  const actionAttributes=options=>serviceReady(options)?'':' disabled aria-describedby="entitlement-save-status"';
  const lock='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
  function denied(who,message,setup=false){return '<section class="access-denied discovery-container"><div class="access-denied-icon">'+lock+'</div><p class="eyebrow">'+(setup?'Setup required':'Access restricted')+'</p><h1>'+(setup?'Entitlements unavailable':'Not permitted')+'</h1><p>'+esc(message||'Your account does not have permission to view or manage entitlements.')+'</p>'+(who?.soeid?'<div class="access-identity">Signed in as <strong>'+esc(who.displayName||who.soeid)+'</strong><span>SOEID '+esc(who.soeid)+'</span></div>':'')+'<a class="button" href="#/">Back to knowledge</a><p class="quiet-note">'+(setup?'Check the policy settings in this page’s HTML macro.':'Contact your access administrator if you need this permission.')+'</p></section>';}
  function accessDenied(options){
    const access=options.access;
    if(!access)return denied(options.identity);
    if(!options.identity?.soeid)return denied(options.identity,'WCSpedia could not identify your signed-in SOEID. Sign in to Confluence, then reload this page. If you are already signed in, ask your administrator to check the account mapping.');
    const source=access.filename||'entitlements.json';
    const location=access.pageId?' on Confluence page '+access.pageId:'';
    if(!access.configured||!options.policy)return denied(options.identity,'The entitlement policy is not loaded. Upload '+source+' to the configured attachments page and check attachmentPageId in this page’s HTML macro.',true);
    const grant=global.WCSEntitlements.hasGrant(options.policy,options.identity,'entitlements.view','*');
    return denied(options.identity,grant?'Your entitlement grant is present, but Confluence has not confirmed view access to the policy page. Check that page’s restrictions.':'No active View entitlements grant was found for '+(options.identity?.soeid||'your signed-in account')+' in '+source+location+'.');
  }
  function auditCSV(policy){
    // Neutralise spreadsheet formula prefixes while preserving full change details.
    const cell=value=>'"'+String(value==null?'':value).replace(/^(?:\s*[=+@-]|[\t\r\n])/ ,"'$&").replace(/"/g,'""')+'"';
    const rows=[['Policy revision','Event revision','Action','Actor SOEID','Date and time','Reason','Changes','Event ID','Complete event'],...policy.audit.map(e=>[policy.revision,e.revision,e.action,e.actorSOEID,e.at,e.comment,JSON.stringify(e.changes),e.id,JSON.stringify(e)])];
    return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  function mountHistory(host,policy,signal){
    const Table=global.WCSDataTable;
    const actionName=action=>({add:'Entitlement added',edit:'Entitlement updated',revoke:'Entitlement revoked'}[action]||action);
    const events=policy.audit.slice().reverse();
    const searchable=events.map(event=>[event.revision,actionName(event.action),event.actorSOEID,event.at,event.comment,JSON.stringify(event.changes)].join(' ').toLowerCase());
    let page=1,size=10,query='';
    host.innerHTML='<div class="entitlement-history-controls"><form class="wcs-data-table-search entitlement-search" data-history-search><label class="sr-only" for="entitlement-history-query">Search access change history</label><input id="entitlement-history-query" type="search" maxlength="150" placeholder="Search by SOEID, action, or reason"><button type="submit" class="button">Search</button><button type="button" class="button secondary" data-history-clear hidden>Clear</button></form></div><div data-history-results></div><div class="discovery-pagination entitlement-pagination"><label class="entitlement-history-size" for="entitlement-history-size">Show per page <select id="entitlement-history-size" aria-label="History changes per page"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><div data-history-pagination></div></div>';
    const pager=host.querySelector('[data-history-pagination]'),results=host.querySelector('[data-history-results]'),input=host.querySelector('input'),select=host.querySelector('select'),clear=host.querySelector('[data-history-clear]');
    function render(){
      const rows=events.filter((event,index)=>searchable[index].includes(query.toLowerCase()));
      const pages=Math.ceil(rows.length/size);
      page=Math.max(1,Math.min(page,pages||1));
      clear.hidden=!query&&!input.value;
      results.innerHTML='<p class="wcs-data-table-results-label" role="status">'+(rows.length?'Showing '+((page-1)*size+1)+'–'+Math.min(page*size,rows.length)+' of '+rows.length:'0')+' '+(rows.length===1?'change':'changes')+(query?' matching “'+esc(query)+'”':'')+'</p>'+Table.render({
        label:'Access change history',className:'entitlement-history-table',
        columns:[{label:'Revision'},{label:'Action'},{label:'Changed by / SOEID'},{label:'Date and time'},{label:'Reason'},{label:'Changes'}],
        rows:rows.slice((page-1)*size,page*size).map(event=>({id:event.id,cells:[
          event.revision,actionName(event.action),Table.html('<code class="entitlement-soeid">'+esc(event.actorSOEID)+'</code>'),
          Table.html('<time datetime="'+esc(event.at)+'">'+esc(new Date(event.at).toLocaleString('en-GB'))+'</time>'),
          event.comment,Table.html('<details><summary>View changes<span class="sr-only"> for revision '+esc(event.revision)+'</span></summary><pre><code>'+esc(JSON.stringify(event.changes,null,2))+'</code></pre></details>')
        ]})),
        empty:{title:query?'No matching changes':'No changes recorded yet',description:query?'Try another SOEID, action, or reason.':'Your first saved change will appear here.'}
      });
      pager.innerHTML=rows.length?global.WCSPagination.render({totalPages:pages,currentPage:page,href:n=>'#history-page-'+n,ariaLabel:'Access change history pages'}):'';
    }
    host.addEventListener('submit',event=>{if(!event.target.matches('[data-history-search]'))return;event.preventDefault();event.stopPropagation();query=input.value.trim().slice(0,150);page=1;render();},{signal});
    host.addEventListener('change',event=>{if(event.target!==select)return;size=[10,25,50].includes(Number(select.value))?Number(select.value):10;page=1;render();},{signal});
    host.addEventListener('click',event=>{
      const control=event.target.closest('a[data-page],[data-history-clear]');
      if(!control||!host.contains(control))return;
      event.preventDefault();event.stopPropagation();
      if(control===clear){query='';input.value='';page=1;render();input.focus();return;}
      page=Number(control.dataset.page);render();
      pager.querySelector('[aria-current="page"]')?.setAttribute('tabindex','-1');
      pager.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
    },{signal});
    render();
  }
  function syncButton(options){
    return options.syncAccess&&['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(options.can)?'<button type="button" class="button secondary" data-entitlement-sync aria-describedby="wcs-native-sync-status">Sync access</button>':'';
  }
  function syncMarkup(options){
    if(!options.syncAccess)return '';
    const s=options.nativeSync||{status:'not-configured'},complete=s.status==='complete';
    return '<section class="panel" aria-label="Native access setup"><h2>'+ (complete?'Native access synchronized':'Native access needs attention')+'</h2><p id="wcs-native-sync-status" role="status" data-sync-status>'+esc(s.message||'Synchronize existing entitlements once. Future saves synchronize automatically.')+'</p><p class="quiet-note">An entitlement administrator with native Space Admin access runs this synchronization. It manages the required space grants and Working viewing access. Working editing stays unchanged. Existing grants and groups remain under native administration.</p>'+(s.warnings?.length?'<ul>'+s.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'')+'</section>';
  }
  function markup(options){
    if(!options.can('entitlements.view'))return accessDenied(options);
    return '<section class="press-heading page-panel"><div class="discovery-container"><nav class="breadcrumbs"><a href="#/">WCSpedia</a><span aria-hidden="true">›</span><span>Entitlements</span></nav><div class="eyebrow">Shared access management</div><div class="results-title-row"><div><h1>The right access. One place.</h1><p>Manage who can create, maintain, and administer our knowledge.</p></div><div class="entitlement-header-actions">'+syncButton(options)+(options.can('entitlements.add')?'<button class="button" data-entitlement="add"'+actionAttributes(options)+'>Add entitlement <span aria-hidden="true">＋</span></button>':'')+'</div></div></div></section><div class="discovery-container entitlement-directory"><div class="entitlement-scope-note">'+lock+'<p>Access requires a matching SOEID entitlement and permission on the Confluence page. Document permissions do not grant access to administer entitlements.</p></div>'+(options.access&&options.access.serviceConnected===false?'<p id="entitlement-save-status" class="quiet-note" role="status">Entitlements loaded. This screen is read-only until the entitlement service is connected. Add, Edit and Revoke are available to authorized administrators once saving is connected. An authorized administrator can maintain '+esc(options.access.filename||'entitlements.json')+' on its Confluence page.</p>':'')+syncMarkup(options)+'<div data-entitlement-list></div><section class="entitlement-history"><div class="panel-heading"><div><h2>Access change history</h2><p>Changes saved through WCSpedia record the person, time, reason, and previous values.</p></div><button class="button secondary compact" data-entitlement="export">Export audit CSV</button></div><div data-entitlement-history></div></section></div>';
  }
  function mount(root,options){
    if(!options.can('entitlements.view'))return {destroy(){}};
    const abort=new AbortController();let modal=null,busy=false,destroyed=false;
    const policy=options.policy,params=new URLSearchParams(location.hash.split('?')[1]||''),query=(params.get('q')||'').slice(0,150).trim(),pageSize=[10,25,50].includes(Number(params.get('size')))?Number(params.get('size')):10;
    const rows=policy.records.filter(r=>(r.soeid+' '+r.displayName+' '+r.scope+' '+(options.documents.find(d=>d.id===r.scope)?.versions?.at(-1)?.title||'')+' '+r.permissions.join(' ')+' '+r.permissions.map(p=>names[p]).join(' ')).toLowerCase().includes(query.toLowerCase()));
    const page=Math.max(1,Math.min(Math.ceil(rows.length/pageSize)||1,parseInt(params.get('page'),10)||1));
    const href=n=>'#/entitlements?'+new URLSearchParams({q:query,page:n,size:pageSize});
    const scopeLabel=r=>r.scope==='*'?'All documents':options.documents.find(d=>d.id===r.scope)?.versions?.at(-1)?.title||r.scope;
    const host=root.querySelector('[data-entitlement-list]');
    const Table=global.WCSDataTable;
    mountHistory(root.querySelector('[data-entitlement-history]'),policy,abort.signal);
    const table=Table.render({label:'Entitlement records',className:'entitlement-table',scrollClassName:'entitlement-table-scroll',columns:[{label:'Person / SOEID'},{label:'Scope'},{label:'Permissions'},{label:'Status'},{label:'Actions',visuallyHidden:true,actions:true}],rows:rows.slice((page-1)*pageSize,page*pageSize).map(r=>({id:r.id,cells:[
      Table.html('<strong>'+esc(r.displayName)+'</strong><code class="entitlement-soeid">'+esc(r.soeid)+'</code>'),
      Table.html('<span>'+esc(scopeLabel(r))+'</span>'+(r.scope!=='*'?'<code class="entitlement-key">'+esc(r.scope)+'</code>':'')),
      Table.html('<div class="entitlement-tags">'+r.permissions.map(p=>'<span>'+esc(names[p])+'</span>').join('')+'</div>'),
      Table.html('<span class="badge '+(r.active?'published':'superseded')+'">'+(r.active?'Active':'Inactive')+'</span>'),
      Table.html('<div class="wcs-data-table-actions entitlement-row-actions">'+(options.can('entitlements.edit')?'<button class="button secondary compact" data-entitlement="edit"'+actionAttributes(options)+' data-id="'+esc(r.id)+'" aria-label="Edit access for '+esc(r.soeid)+'">Edit</button>':'')+(options.can('entitlements.revoke')?'<button class="button danger compact" data-entitlement="revoke"'+actionAttributes(options)+' data-id="'+esc(r.id)+'" aria-label="Revoke access for '+esc(r.soeid)+'">Revoke</button>':'')+'</div>')
    ]})),empty:{title:'No matching access records',description:'Try another SOEID, name, or permission.',action:Table.html('<a class="button secondary" href="#/entitlements">Clear search</a>')}});
    host.innerHTML='<form class="wcs-data-table-search entitlement-search" data-entitlement-search><label class="sr-only" for="entitlement-query">Search entitlements</label><input id="entitlement-query" type="search" name="q" maxlength="150" placeholder="Search by SOEID, name, document, or permission" value="'+esc(query)+'"><button class="button" type="submit">Search</button>'+(query?'<a class="link" href="#/entitlements">Clear</a>':'')+'</form><div class="wcs-data-table-results-label entitlement-results-label" role="status">'+rows.length+' '+(rows.length===1?'access record':'access records')+(query?' matching “'+esc(query)+'”':'')+'</div>'+table+(rows.length?'<div class="discovery-pagination entitlement-pagination"><label class="entitlement-history-size" for="entitlement-page-size">Show per page <select id="entitlement-page-size" aria-label="Entitlements per page">'+[10,25,50].map(n=>'<option value="'+n+'"'+(n===pageSize?' selected':'')+'>'+n+'</option>').join('')+'</select></label><span>Showing '+((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,rows.length)+' of '+rows.length+'</span>'+global.WCSPagination.render({totalPages:Math.ceil(rows.length/pageSize),currentPage:page,href,ariaLabel:'Entitlement pages'})+'</div>':'');
    root.querySelector('[data-entitlement-sync]')?.addEventListener('click',async event=>{
      if(busy||!options.syncAccess)return;busy=true;const button=event.currentTarget;button.disabled=true;button.setAttribute('aria-busy','true');
      const status=root.querySelector('[data-sync-status]');status.textContent='Synchronizing native access…';
      try{const result=await options.syncAccess();if(!destroyed){options.notify(result?.status==='complete'?'Native access synchronized.':'Managed access synchronized; review retained native access.',{type:result?.status==='complete'?'success':'warning'});options.refresh();}}
      catch(error){if(!destroyed){status.textContent=error.message;options.notify(error.message,{type:'error'});}}
      finally{busy=false;if(!destroyed){button.disabled=false;button.removeAttribute('aria-busy');}}
    },{signal:abort.signal});
    function open(action,id){
      if(busy||modal)return;
      if(!options.can('entitlements.'+action)){options.notify('You no longer have permission for this entitlement action.',{type:'warning'});return;}
      if(!serviceReady(options)){options.notify(unavailableMessage,{type:'warning'});return;}
      const row=policy.records.find(r=>r.id===id),edit=action==='edit',revoke=action==='revoke';if(action!=='add'&&!row)return;
      const checks=global.WCSEntitlements.PERMISSIONS.map(p=>'<label class="entitlement-permission"><input type="checkbox" name="permission" value="'+p+'" '+(row?.permissions.includes(p)?'checked':'')+'><span>'+esc(names[p])+'</span></label>').join('');
      const body='<form novalidate data-entitlement-form><p class="workflow-dialog-description">'+(revoke?'Remove this access record for '+esc(row.soeid)+'. The change remains in the audit history.':'Grant only the access this colleague needs. Their Confluence permissions must also allow the action.')+'</p><div class="form-error" role="alert" hidden></div>'+(!revoke?'<div class="form-row"><div class="form-group"><label for="access-soeid">SOEID</label><input id="access-soeid" name="soeid" required maxlength="32" pattern="[A-Za-z0-9]{2,32}" value="'+esc(row?.soeid||'')+'" '+(edit?'readonly':'')+' placeholder="For example, AB12345"></div><div class="form-group"><label for="access-name">Display name</label><input id="access-name" name="displayName" required maxlength="150" value="'+esc(row?.displayName||'')+'"></div></div><div class="form-group"><label for="access-scope">Scope</label><select id="access-scope" name="scope" '+(edit?'disabled':'')+'><option value="*">All documents</option>'+options.documents.filter(d=>!d.deletedAt).concat(row?.scope!=='*'&&row?.scope&&!options.documents.some(d=>!d.deletedAt&&d.id===row.scope)?[{id:row.scope,versions:[{title:'Document not in the loaded directory'}]}]:[]).map(d=>'<option value="'+esc(d.id)+'" '+(row?.scope===d.id?'selected':'')+'>'+esc(d.versions.at(-1).title)+' · '+esc(d.id)+'</option>').join('')+'</select><small class="quiet-note">Use a specific document for edit/delete access. Creation and entitlement administration apply globally.</small></div><fieldset class="entitlement-permissions"><legend>Permissions</legend><div class="entitlement-permission-grid">'+checks+'</div></fieldset><label class="entitlement-permission"><input type="checkbox" name="active" '+(row?.active!==false?'checked':'')+'>Active access</label>':'')+'<div class="form-group"><label for="access-reason">Reason for this change</label><textarea id="access-reason" name="comment" required maxlength="2000" rows="3" placeholder="Explain why this access is needed or being changed."></textarea></div><div class="modal-actions"><button type="button" class="button secondary" data-entitlement-cancel>Cancel</button><button type="submit" class="button '+(revoke?'danger':'')+'">'+(revoke?'Revoke access':edit?'Save changes':'Add entitlement')+'</button></div></form>';
      modal=global.WCSUI.dialog({title:revoke?'Revoke access':edit?'Edit entitlement':'Add entitlement',body,onClose(){if(busy)return false;modal=null;},onMount(handle){
        const form=handle.element.querySelector('form');let reloadRequired=false;handle.element.querySelector('[data-entitlement-cancel]').onclick=()=>handle.close();
        form.addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();if(busy||reloadRequired)return;const error=form.querySelector('.form-error');
          function showError(message,field){error.hidden=false;error.textContent=message;field?.focus();options.notify(message,{type:'warning'});}
          if(!serviceReady(options)){showError(unavailableMessage);return;}
          if(!options.can('entitlements.'+action)){showError('You no longer have permission for this entitlement action.');return;}
          if(!revoke)form.elements.soeid.value=form.elements.soeid.value.trim().toUpperCase();
          const invalid=form.querySelector(':invalid');if(invalid){showError('Complete the required fields with a valid SOEID and change reason.',invalid);return;}
          const fields=new FormData(form),command={action,expectedRevision:policy.revision,comment:String(fields.get('comment')||'').trim()};
          if(row)command.recordId=row.id;
          if(!revoke)command.record={id:row?.id||'grant-'+crypto.randomUUID(),soeid:String(fields.get('soeid')||''),displayName:String(fields.get('displayName')||''),scope:row?.scope||String(fields.get('scope')||'*'),permissions:fields.getAll('permission'),active:fields.has('active')};
          if(!command.comment){showError('Enter a reason for this change.',form.elements.comment);return;}
          if(!revoke){
            if(!command.record.permissions.length){showError('Select at least one permission.',form.querySelector('[name="permission"]'));return;}
            try{command.record=global.WCSEntitlements.validatePolicy({schemaVersion:1,revision:1,records:[command.record],audit:[]}).records[0];}
            catch(ex){showError(ex.message);return;}
            if(action==='add'&&policy.records.some(r=>r.soeid===command.record.soeid&&r.scope===command.record.scope)){showError('This SOEID already has an entitlement for this scope. Cancel and edit the existing record, or choose a different scope.',form.elements.soeid);return;}
          }
          busy=true;handle.setBusy(true);error.hidden=true;
          try{const sync=await options.save(command);busy=false;handle.setBusy(false);handle.close();if(destroyed)return;options.notify(sync&&sync.status!=='complete'?'Entitlement saved. Native access needs attention; use Sync access.':'Entitlements updated · change recorded.',{type:sync&&sync.status!=='complete'?'warning':'success'});try{options.refresh();}catch(_){options.notify('The entitlement change was saved. Reload the page to see the updated access.',{type:'warning'});}}
          catch(ex){busy=false;handle.setBusy(false);if(destroyed){handle.close();return;}error.hidden=false;error.textContent=ex.message;options.notify(ex.message||'The entitlement change could not be saved.',{type:'error'});if(['CONFLICT','UNKNOWN_COMMIT','REFRESH_REQUIRED','ENTITLEMENTS_PENDING'].includes(ex.code)){reloadRequired=true;form.querySelector('[type="submit"]').disabled=true;error.append(document.createTextNode(' Reload the page before trying again.'));}}
        });
      }});
    }
    root.addEventListener('click',event=>{const button=event.target.closest('[data-entitlement]');if(!button)return;event.preventDefault();const action=button.dataset.entitlement;if(action==='export'){try{options.download(auditCSV(policy),'wcspedia-entitlement-audit.csv','text/csv;charset=utf-8');options.notify('Entitlement audit download started.',{type:'success'});}catch(error){options.notify(error.message||'The entitlement audit could not be downloaded.',{type:'error'});}return;}open(action,button.dataset.id);},{signal:abort.signal});
    root.addEventListener('submit',event=>{if(!event.target.hasAttribute('data-entitlement-search'))return;event.preventDefault();event.stopPropagation();options.go('#/entitlements?'+new URLSearchParams({q:new FormData(event.target).get('q'),page:1,size:pageSize}));},{signal:abort.signal});
    root.addEventListener('change',event=>{if(event.target.id!=='entitlement-page-size')return;const size=Number(event.target.value);if([10,25,50].includes(size))options.go('#/entitlements?'+new URLSearchParams({q:query,page:1,size}));},{signal:abort.signal});
    return {destroy(){destroyed=true;abort.abort();if(modal){modal.setBusy(false);modal.close();}}};
  }
  global.WCSEntitlementsPage={markup,mount,denied};
})(window);
