/* Buildless WCSpedia authoring. All inserted HTML passes through the shared
 * Markdown renderer; versioned media is referenced by stable attachment IDs. */
(function (root) {
  'use strict';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,'');
  const markdownText = value => String(value).replace(/\u00a0/g,' ').replace(/([\\`*_{}\[\]()#+!>~|])/g,'\\$1').replace(/^(\s*\d+)\.(?=\s)/gm,'$1\\.').replace(/^(\s*)-(?=\s)/gm,'$1\\-');
  const safeTarget=value=>/^(?:attachment:[A-Za-z0-9_-]+|https?:\/\/[^\s<>"'\\]+|\/[^/][^\s<>"'\\]*|\.\.?\/[^\s<>"'\\]+|#[A-Za-z][\w-]*)$/i.test(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function domToMarkdown(element) {
    let inTableCell=false;
    const videoMarkdown=node=>root.WCSEditorContent.videoMarkdown(root.WCSEditorContent.videoEmbed(node.getAttribute('data-video-url'),node.getAttribute('data-video-title')));
    const isBlock=node=>node.nodeType===1&&/^(DIV|P|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR|FIGURE|SECTION|ARTICLE)$/.test(node.nodeName);
    function inline(node){
      if(node.nodeType===3)return markdownText(node.textContent);
      if(node.nodeType!==1)return '';
      const tag=node.nodeName.toLowerCase();
      if(/^(script|style|iframe|object|embed|button|svg|noscript)$/.test(tag))return '';
      if(tag==='input')return node.type==='checkbox'?(node.checked?'[x] ':'[ ] '):'';
      if(tag==='br')return '  \n';
      if(tag==='img'){
        const target=node.getAttribute('data-asset-id')?'attachment:'+node.getAttribute('data-asset-id'):node.getAttribute('src')||'';
        return (safeTarget(target)||/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(target))?'!['+markdownText(node.getAttribute('alt')||'Image')+']('+target.replace(/[()]/g,c=>c==='('?'%28':'%29')+')':'';
      }
      if(node.hasAttribute('data-video-url'))return '\n\n'+videoMarkdown(node)+'\n\n';
      if(node.hasAttribute('data-embed-url')){const url=node.getAttribute('data-embed-url');return safeTarget(url)?'\n\n@[embed]('+url+')\n\n':'';}
      if(tag==='code'){
        const text=node.textContent.replace(/\u00a0/g,' ').replace(/\|/g,value=>inTableCell?'\\|':value),runs=text.match(/`+/g)||[],marker='`'.repeat(Math.max(1,...runs.map(s=>s.length+1))),pad=/^`|`$|^ | $/.test(text)?' ':'';
        return marker+pad+text+pad+marker;
      }
      let text=[...node.childNodes].map(inline).join('');
      const wrap=marker=>{const trimmed=text.trim();return trimmed?text.slice(0,text.indexOf(trimmed))+marker+trimmed+marker+text.slice(text.indexOf(trimmed)+trimmed.length):text;};
      if(tag==='strong'||tag==='b'||node.style?.fontWeight==='bold'||Number(node.style?.fontWeight)>=600)text=wrap('**');
      else if(tag==='em'||tag==='i'||node.style?.fontStyle==='italic')text=wrap('_');
      if(tag==='u'||node.style?.textDecoration.includes('underline'))text='<u>'+text+'</u>';
      if(tag==='s'||tag==='del'||node.style?.textDecoration.includes('line-through'))text='~~'+text+'~~';
      if(tag==='a'){
        const target=node.getAttribute('data-attachment-id')?'attachment:'+node.getAttribute('data-attachment-id'):node.getAttribute('href')||'';
        if(safeTarget(target))return '['+text+']('+target.replace(/[()]/g,c=>c==='('?'%28':'%29')+')';
      }
      return text+(isBlock(node)?'\n':'');
    }
    function children(parent){
      let out='',pending='';
      const flush=()=>{if(pending.trim())out+=pending.trim()+'\n\n';pending='';};
      for(const child of parent.childNodes){if(isBlock(child)){flush();out+=block(child);}else pending+=inline(child);}
      flush();return out;
    }
    function list(node){
      const ordered=node.nodeName==='OL',start=Number(node.getAttribute('start'))||1;
      return [...node.children].filter(n=>n.nodeName==='LI').map((li,i)=>{
        let raw='',pending='';
        const flush=separator=>{if(pending.trim())raw+=pending.trim()+separator;pending='';};
        for(const child of li.childNodes){
          if(isBlock(child)){flush(/^(UL|OL)$/.test(child.nodeName)?'\n':'\n\n');raw+=block(child);}
          else pending+=inline(child);
        }
        flush('\n');
        const lines=raw.trim().split('\n'),prefix=ordered?(start+i)+'. ':'- ',indent=' '.repeat(prefix.length);
        return prefix+(lines.shift()||'')+'\n'+lines.map(line=>indent+line+'\n').join('');
      }).join('');
    }
    function block(node){
      const tag=node.nodeName.toLowerCase();
      if(node.hasAttribute('data-video-url'))return videoMarkdown(node)+'\n\n';
      if(tag==='ul'||tag==='ol')return list(node)+'\n';
      if(tag==='blockquote')return children(node).trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
      if(/^h[1-6]$/.test(tag))return '#'.repeat(Math.max(2,Number(tag[1])))+' '+[...node.childNodes].map(inline).join('').trim()+'\n\n';
      if(tag==='pre'){
        const code=node.querySelector('code')||node,text=code.textContent.replace(/\u00a0/g,' ').replace(/\n$/,''),runs=text.match(/`+/g)||[],fence='`'.repeat(Math.max(3,...runs.map(s=>s.length+1))),language=(code.className.match(/language-([a-z0-9_-]+)/i)||[])[1]||'';
        return fence+language+'\n'+text+'\n'+fence+'\n\n';
      }
      if(tag==='table'){
        inTableCell=true;
        const rows=[...node.querySelectorAll('tr')].map(row=>[...row.children].filter(cell=>/^(TD|TH)$/.test(cell.nodeName)).map(cell=>[...cell.childNodes].map(inline).join('').trim().replace(/\n/g,' ')));
        inTableCell=false;
        if(!rows.length)return '';
        const width=Math.max(...rows.map(row=>row.length)),rowText=row=>'| '+Array.from({length:width},(_,i)=>row[i]||'').join(' | ')+' |';
        return rowText(rows[0])+'\n'+rowText(Array.from({length:width},(_,i)=>{const cell=node.querySelector('tr')?.children[i],alignment=cell?.style?.textAlign;return alignment==='center'?':---:':alignment==='right'?'---:':alignment==='left'?':---':'---';}))+'\n'+rows.slice(1).map(rowText).join('\n')+'\n\n';
      }
      if(tag==='hr')return '---\n\n';
      return children(node);
    }
    return children(element).trim();
  }
  const symbols={
    down:'<path d="m6 9 6 6 6-6"/>',
    link:'<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
    video:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>',
    embed:'<path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    divider:'<path d="M3 12h18"/>',
    clear:'<path d="m4 16 8-12 8 12M7 12h10M3 21h18M3 3l18 18"/>',
    codeblock:'<path d="M8 3H4v18h16V3h-4M9 8l-3 4 3 4m6-8 3 4-3 4"/>',
    undo:'<path d="m3 5 0 6h6M3 11a8 8 0 1 1 1 7"/>',
    redo:'<path d="m21 5 0 6h-6m6 0a8 8 0 1 0-1 7"/>',
    attachment:'<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2"/>'
  };
  const svg=name=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbols[name]+'</svg>';
  function create(options) {
    const content=root.WCSEditorContent,v=options.version||{},doc=options.document,governanceEnabled=options.governanceEnabled!==false;
    let slugFallback=slugify(doc?.id||'')||id('document').slice(0,25),slugMode=doc||v.slug?'saved':'auto';
    const reservedSlugs=new Set((options.existingSlugs||[]).filter(value=>typeof value==='string'));
    function automaticSlug(title){
      const text=String(title||'').trim();if(!text)return '';
      const base=slugify(text)||slugFallback;let value=base,suffix=2;
      while(reservedSlugs.has(value)){const ending='-'+suffix++;value=base.slice(0,120-ending.length).replace(/-$/,'')+ending;}
      return value;
    }
    const initial={commentsEnabled:content.validateCommentsEnabled(v.commentsEnabled),title:v.title||'',summary:v.summary||'',slug:v.slug||automaticSlug(v.title||''),bodyMarkdown:v.bodyMarkdown||content.fromSections(v.sections||[]),highlights:v.highlights||[],cover:v.cover||null,tags:v.tags||[],processes:v.processes||[],regions:v.regions||[],assets:v.assets||[],attachments:v.attachments||[]};
    let sourceMetadata=content.validateSourceMetadata(v.sourceMetadata||null);
    let cover=clone(initial.cover),assets=clone(initial.assets),attachments=clone(initial.attachments),host,abort,savedRange,dirty=false,source=false,preview=false,busy=false,reloadRequired=false,retryFields=null,loading=0,activeDialog=null,fullScreen=false,focusState=null,focusAbort=null,focusObserver=null,focusFrame=0,recoveryTimer;
    let governanceTouched=!doc||v.governance!=null,governanceSequence=0,governanceTimer;
    const governanceInitial={baselineVersion:root.WCSGovernance?.BASELINE_VERSION||'wcs-other-documents-2026-10-09-v1',classification:'unclassified',owningTeam:'',scope:'',audience:'',supportingTeam:'',classificationRationale:'',reviewBasis:v.governance?.classification==='formal-reference'?'formal-governance':'business-best-practice',reviewMonths:24,...clone(v.governance||{}),sources:clone(v.governance?.sources||[])};
    const recoveryKey='wcspedia.editor.recovery.v1:'+options.actor.id+':'+(doc?doc.id+':'+v.version+':'+v.revision:'new');
    const context=()=>({assets,attachments});
    function renderBody(value){
      if(!value.trim())return '';
      const template=document.createElement('template');template.innerHTML=content.render(value,context());
      template.content.querySelectorAll('[data-video-url]').forEach(video=>{
        video.setAttribute('contenteditable','false');
        const controls=document.createElement('span');controls.className='editor-video-controls';
        const button=document.createElement('button');button.type='button';button.dataset.editorVideo='edit';button.textContent='Edit video';button.setAttribute('aria-label','Edit video: '+(video.getAttribute('data-video-title')||'Training video'));controls.append(button);video.append(controls);
      });
      template.content.querySelectorAll('table').forEach(table=>{
        // Keep an editable landing place on both sides, including imported tables.
        for(const before of [true,false]){
          const sibling=before?table.previousElementSibling:table.nextElementSibling;
          if(!sibling||sibling.tagName!=='P'){
            const paragraph=document.createElement('p');paragraph.append(document.createElement('br'));
            table.parentNode.insertBefore(paragraph,before?table:table.nextSibling);
          }
        }
      });
      return template.innerHTML;
    }
    const input=(id,label,value='',attrs='')=>'<label class="editor-field" for="'+id+'"><span>'+label+'</span><input id="'+id+'" name="'+id+'" value="'+escape(value)+'" '+attrs+'></label>';
    const textarea=(id,label,value='',attrs='')=>'<label class="editor-field" for="'+id+'"><span>'+label+'</span><textarea id="'+id+'" name="'+id+'" '+attrs+'>'+escape(value)+'</textarea></label>';
    const select=(id,label,items,value,disabled=false)=>'<label class="editor-field" for="'+id+'"><span>'+label+'</span><select id="'+id+'" name="'+id+'" aria-label="'+escape(label)+'" '+(disabled?'disabled':'')+'>'+items.map(x=>'<option value="'+escape(x.id)+'" '+(x.id===value?'selected':'')+'>'+escape(x.name)+'</option>').join('')+'</select></label>';
    const reviewers=options.people.filter(p=>p.id!==options.actor.id&&p.role!=='Reader'),managers=reviewers.filter(p=>p.role==='Manager');
    const tool=(command,label,text)=>'<button type="button" data-format="'+command+'" aria-label="'+label+'" data-tooltip="'+label+'">'+(symbols[text]?svg(text):text)+'</button>';
    function editorTypes(){
      const types=[...new Set([...content.CREATE_TYPES.filter(type=>(options.types||[]).includes(type)),...(doc?.type?[doc.type]:[])])];
      return types.map(type=>({id:type,name:content.typeLabel(type)+(content.CREATE_TYPES.includes(type)?'':' · existing '+type)}));
    }
    function initialType(){const types=editorTypes().map(type=>type.id),requested=doc?.type||content.groupType(options.type)||'Job aid';return types.includes(requested)?requested:types.includes('Job aid')?'Job aid':types[0]||'';}
    function commentsSetting(){return '<section id="editor-comments-settings"'+(content.isInsightType(initialType())?'':' hidden')+'>'+select('editor-comments-enabled','Article comments',[{id:'true',name:'Enabled'},{id:'false',name:'Disabled'}],String(initial.commentsEnabled))+'<p class="editor-field-hint">Published changes control the WCSpedia discussion. Disabling keeps existing comments in Confluence; its native permissions remain unchanged.</p></section>';}
    function directInsight(){return content.isInsightType(doc?.type||(host?find('#editor-type').value:initialType()));}
    function updateCommentsSetting(){
      updateTemplateLabel();
      find('#editor-comments-settings').hidden=!directInsight();
      const blog=directInsight();
      find('#editor-area').closest('.editor-field').hidden=blog;
      find('.editor-ownership').hidden=blog;
      if(find('.editor-governance'))find('.editor-governance').hidden=blog;
      find('#editor-insights-destination').hidden=!blog;
      find('.editor-help p').textContent=blog?'Publish this article directly to Insights. No reviewer or manager approval is required.':'Save your draft, then submit it for review. Your assigned manager approves the reviewed revision before it is published.';
      if(!busy&&!retryFields)find('#editor-save-button').textContent=blog?'Publish to Insights':'Save draft';
      if(!dirty&&!busy&&!retryFields)find('#editor-save-status').textContent=blog?(doc?'Changes publish directly to Insights':'Publishes directly to Insights'):(doc?(options.editingPublished?'Editing published version '+v.version+' · saved changes create a new draft':'Version '+v.version+' · revision '+v.revision):'New draft');
    }
    function governanceSource(value){
      const number=++governanceSequence,prefix='editor-source-reference-'+number;
      const field=(key,label,attrs)=>'<label class="editor-field" for="'+prefix+'-'+key+'"><span>'+label+'</span><input id="'+prefix+'-'+key+'" data-source-field="'+key+'" value="'+escape(key==='lastVerifiedAt'?(value[key]||'').slice(0,10):value[key]||'')+'" '+(key==='lastVerifiedAt'?'data-original-date="'+escape(value[key]||'')+'" ':'')+attrs+'></label>';
      return '<fieldset class="editor-governance-source" data-governance-source><legend>Source '+number+'</legend><div class="editor-governance-source-heading">'+field('title','Source title','maxlength="300"')+'<button type="button" class="link" data-governance-remove-source aria-label="Remove source '+number+'">Remove</button></div>'+field('url','Source URL','type="url" maxlength="2000" placeholder="https://…"')+'<input type="hidden" data-source-field="id" value="'+escape(value.id||id('source'))+'"><div class="editor-governance-source-meta">'+field('version','Source version','maxlength="120" placeholder="Version or Not versioned"')+field('lastVerifiedAt','Last verified','type="date"')+'</div></fieldset>';
    }
    function governanceSection(){
      if(!governanceEnabled)return '';
      const g=governanceInitial;
      return '<details class="editor-governance"'+(directInsight()?' hidden':'')+'><summary><span><strong>Governance</strong><small>Classification, ownership, scope, and authoritative sources</small></span>'+svg('down')+'</summary><div class="editor-governance-body"><p class="editor-field-hint">Complete this information before submission. Drafts can remain incomplete. Classification and wording checks support the reviewer’s judgment; they do not certify compliance.</p>'+(!governanceTouched?'<p class="editor-governance-legacy" data-governance-legacy>This existing document has no recorded governance classification. Opening this section does not assign one.</p>':'')+'<div class="editor-governance-grid">'+select('editor-governance-classification','Document classification',[{id:'unclassified',name:'Unclassified · review required'},{id:'other-nhd',name:'Other NHD'},{id:'other-bod',name:'Other BOD'},{id:'formal-reference',name:'Formal governance reference'}],g.classification)+input('editor-governance-owningTeam','Owning team',g.owningTeam,'maxlength="200" placeholder="Team accountable for this document"')+'</div>'+textarea('editor-governance-scope','Scope',g.scope,'maxlength="2000" rows="3" placeholder="What this document covers and its limits"')+textarea('editor-governance-audience','Intended audience',g.audience,'maxlength="1000" rows="2" placeholder="Who uses this guidance"')+input('editor-governance-supportingTeam','Supporting team (optional)',g.supportingTeam,'maxlength="300"')+textarea('editor-governance-classificationRationale','Classification rationale',g.classificationRationale,'maxlength="2000" rows="3" placeholder="Explain why this classification fits the document"')+'<section class="editor-governance-sources" aria-label="Authoritative sources"><div class="editor-section-title"><div><h3>Authoritative sources</h3><p>Keep references traceable to their source, version, and verification date.</p></div><button type="button" class="button secondary" data-governance-add-source>Add source</button></div><div data-governance-sources>'+g.sources.map(governanceSource).join('')+'</div></section><div class="editor-governance-grid">'+select('editor-governance-reviewBasis','Review basis',[{id:'business-best-practice',name:'Business best practice'},{id:'formal-governance',name:'Formal governance'}],g.reviewBasis)+'<div class="editor-governance-target"><span>Review target</span><strong data-governance-review-caption>24 calendar months after approval</strong><small data-governance-review-target>The target is set when this revision is approved.</small></div></div><div class="editor-governance-assessment" data-governance-assessment role="status" aria-live="polite"></div></div></details>';
    }
    function governanceSources(){return [...host.querySelectorAll('[data-governance-source]')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-source-field]')].map(field=>[field.dataset.sourceField,field.dataset.sourceField==='lastVerifiedAt'&&field.dataset.originalDate&&field.value.trim()===field.dataset.originalDate.slice(0,10)?field.dataset.originalDate:field.value.trim()])));}
    function governanceFields(){
      const result={baselineVersion:governanceInitial.baselineVersion,reviewMonths:24};
      for(const key of ['classification','owningTeam','scope','audience','supportingTeam','classificationRationale','reviewBasis'])result[key]=find('#editor-governance-'+key).value.trim();
      result.sources=governanceSources();return result;
    }
    function restoreGovernance(value){
      if(!governanceEnabled||!value||typeof value!=='object')return;
      governanceTouched=true;for(const key of ['classification','owningTeam','scope','audience','supportingTeam','classificationRationale','reviewBasis']){const field=find('#editor-governance-'+key);field.value=value[key]||'';if(field.tagName==='SELECT')field.dispatchEvent(new Event('input',{bubbles:true}));}
      find('[data-governance-sources]').innerHTML=(value.sources||[]).map(governanceSource).join('');find('.editor-governance').open=true;
    }
    function governancePreview(){
      if(!host?.isConnected||directInsight())return;const target=find('[data-governance-assessment]');if(!target)return;
      const formal=find('#editor-governance-classification').value==='formal-reference';
      find('[data-governance-review-caption]').textContent=formal?'Follow the authoritative source':'24 calendar months after approval';
      find('[data-governance-review-target]').textContent=formal?'The formal document’s governance process determines its review schedule.':'A business best-practice target, not a mandatory governance cycle. The date is set when this revision is approved.';
      const legacy=find('[data-governance-legacy]');if(legacy)legacy.hidden=governanceTouched;
      if(!root.WCSGovernance?.assess){target.innerHTML='<p>Governance checks are unavailable. Save the draft and complete the review when checks are loaded.</p>';return;}
      try{
        const f=fields(),candidate={...v,...f,status:'Draft',approvedAt:null,governance:f.governance},report=root.WCSGovernance.assess(doc||{type:f.type,ownerId:options.actor.id},candidate,{now:new Date().toISOString()}),issues=report.metadataIssues||[],flags=report.flags||[];
        target.innerHTML='<h3>Review preparation</h3><p>'+(!governanceTouched?'Governance metadata has not been assigned.':issues.length+' metadata item'+(issues.length===1?'':'s')+' to review · '+flags.length+' wording flag'+(flags.length===1?'':'s'))+'</p>'+(issues.length?'<ul>'+issues.map(issue=>'<li>'+escape(issue.message)+'</li>').join('')+'</ul>':'')+(flags.length?'<details class="editor-governance-flags"><summary>Review '+flags.length+' wording flag'+(flags.length===1?'':'s')+'</summary><ul>'+flags.slice(0,20).map(flag=>'<li><strong>'+escape(flag.term||flag.kind)+'</strong>'+(flag.location?' · '+escape(flag.location):'')+'<p>'+escape(flag.snippet)+'</p></li>').join('')+'</ul>'+(flags.length>20?'<p>Showing the first 20 flags. Review the complete document for all '+flags.length+' matches.</p>':'')+'</details>':'')+'<p class="editor-field-hint">Automated checks are advisory. The assigned reviewer must confirm classification, source authority, and permitted use.</p>';
      }catch(ex){target.innerHTML='<p>Review the governance fields: '+escape(ex.message)+'</p>';}
    }
    function slugField(){
      return '<div class="editor-slug-field">'+input('editor-slug','Document slug',initial.slug,'required readonly pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" placeholder="Generated from your title" aria-describedby="editor-slug-help"')+'<div class="editor-slug-actions"><button type="button" class="link" data-editor-action="slug-customize">Customize</button><button type="button" class="link" data-editor-action="slug-auto" hidden>Use title</button></div><p id="editor-slug-help" class="editor-field-hint"></p></div>';
    }
    function updateSlugControl(){
      const field=find('#editor-slug');field.readOnly=slugMode!=='custom';
      find('[data-editor-action="slug-customize"]').hidden=slugMode==='custom';
      find('[data-editor-action="slug-auto"]').hidden=slugMode!=='custom';
      find('#editor-slug-help').textContent=slugMode==='auto'?'Generated from the title as you type. You can customize it if needed.':slugMode==='saved'?'The saved slug stays unchanged when you update the title.':'Use lowercase letters, numbers, and hyphens. Use title restores automatic generation.';
    }
    function html(){
      return '<section class="authoring-page discovery-container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#/">WCSpedia</a><span>/</span><a href="#/results?view=mine">My documents</a><span>/</span><span>'+(doc?'Edit document':'Create content')+'</span></nav><form id="editor-form" class="authoring-surface" novalidate><div class="editor-topbar"><div><h1 class="editor-heading">'+(doc?'Edit document':'Create something worth sharing.')+'</h1><span id="editor-save-status" class="editor-save-status" role="status">'+(doc?(options.editingPublished?'Editing published version '+v.version+' · saved changes create a new draft':'Version '+v.version+' · revision '+v.revision):'New draft')+'</span></div><div class="editor-actions"><button type="button" class="editor-cancel editor-focus-exit" data-editor-action="focus-exit" hidden>Exit expanded view</button><button type="button" class="editor-cancel" data-editor-action="cancel">Cancel</button><button type="button" class="button secondary" data-editor-action="preview">Preview</button><button type="submit" class="button" id="editor-save-button">Save draft <span aria-hidden="true">→</span></button></div></div><div id="editor-error" class="form-error" role="alert" hidden></div><div class="editor-writing"><div class="editor-body"><div class="editor-main">'+input('editor-title','Title',initial.title,'required maxlength="160" placeholder="Give your content a clear, useful title"')+'<div class="editor-content-label"><label id="body-label" for="editor-source">Content</label><div class="editor-mode-actions"><button type="button" data-editor-action="template" class="source-toggle">Markdown template</button><button type="button" data-editor-action="paste-markdown" class="source-toggle">Paste MDX / Markdown</button><button type="button" data-editor-action="copy-markdown" class="source-toggle">Copy Markdown</button><button type="button" data-editor-action="source" class="source-toggle" aria-pressed="false">Markdown</button></div></div><div class="rich-editor"><div class="editor-toolbar" role="toolbar" aria-label="Text formatting"><select aria-label="Paragraph style" id="paragraph-style"><option value="p">Normal text</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="h4">Heading 4</option></select>'+tool('bold','Bold · Ctrl / ⌘ B','<b>B</b>')+tool('italic','Italic · Ctrl / ⌘ I','<i>I</i>')+tool('underline','Underline · Ctrl / ⌘ U','<u>U</u>')+tool('strikeThrough','Strikethrough','<s>S</s>')+'<span class="toolbar-divider"></span>'+tool('link','Insert link','link')+tool('quote','Block quote','❝')+tool('code','Inline code','&lt;/&gt;')+tool('image','Insert image','image')+tool('video','Insert training video','video')+'<span class="toolbar-break" aria-hidden="true"></span>'+tool('insertUnorderedList','Bullet list','☷')+tool('insertOrderedList','Numbered list','1.')+tool('codeblock','Code block','codeblock')+tool('table','Insert table','table')+tool('divider','Horizontal divider','divider')+tool('clear','Clear formatting','clear')+tool('embed','Embed a resource','embed')+'<span class="toolbar-divider"></span>'+tool('undo','Undo','undo')+tool('redo','Redo','redo')+tool('fullscreen','Expand editor','fullscreen')+'</div><div class="editor-table-tools" hidden><span>Table</span><button type="button" data-table="row">Add row</button><button type="button" data-table="column">Add column</button><button type="button" data-table="before">Text before table</button><button type="button" data-table="after">Text after table</button><button type="button" data-table="remove">Remove table</button></div><div id="editor-rich" class="rich-body document-body" contenteditable="true" role="textbox" aria-label="Document content" aria-multiline="true" spellcheck="true" data-placeholder="Write here, paste Markdown, or insert an image into your content…">'+renderBody(initial.bodyMarkdown)+'</div><textarea id="editor-source" aria-label="Markdown content" class="markdown-source" hidden>'+escape(initial.bodyMarkdown)+'</textarea><div class="editor-body-bottom"><span>Paste Markdown, images, or formatted text. In a table, Ctrl / ⌘ Enter moves below it.</span><span id="editor-word-count"></span></div></div>'+textarea('editor-highlights','Key highlights <small>Optional · one per line, up to 5</small>',initial.highlights.join('\n'),'rows="3" placeholder="What should a reader take away?"')+'<section class="editor-attachments" aria-label="Supporting attachments"><div class="editor-section-title"><div><h2>Attachments</h2><p>Add supporting documents, templates, or training materials.</p></div><label class="button secondary attachment-upload" for="editor-attachment-file">'+svg('attachment')+'Add files<input id="editor-attachment-file" type="file" multiple accept=".pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif" class="sr-only"></label></div><div id="editor-attachment-list"></div><p class="editor-field-hint">PDF, Office, text, Markdown, CSV, and images · up to 5 MB per file.</p></section>'+governanceSection() +textarea('editor-comment','Change summary',doc?'':'Initial draft.','required maxlength="2000" rows="2" placeholder="Explain what you created or changed for the audit trail."')+'<div class="editor-help">'+options.icon('shield')+'<p>Save your draft, then submit it for review. Your assigned manager approves the reviewed revision before it is published.</p></div></div><aside class="editor-sidebar" aria-label="Document settings"><h2>Document settings</h2>'+select('editor-type','Content type',editorTypes(),initialType(),!!doc)+commentsSetting()+'<p id="editor-insights-destination" hidden><strong>Destination: Insights</strong><br>Published inside WCSpedia.</p>'+select('editor-area','Business area',options.areas.map(a=>({id:a.id,name:a.title})),doc?.area||options.area||options.areas[0]?.id,!!doc)+slugField()+textarea('editor-summary','Excerpt',initial.summary,'required maxlength="1000" rows="4" placeholder="A short summary for search results and the article introduction."')+'<div id="editor-source-metadata">'+sourceMetadataSummary()+'</div><section class="editor-tag-settings"><h2>Make it discoverable</h2>'+tagField('tags','Topics',initial.tags,'For example: collateral, controls')+'<details class="editor-extra-tags"><summary>More organisation options</summary>'+tagField('processes','Processes',initial.processes,'For example: onboarding, annual review')+tagField('regions','Regions / markets',initial.regions,'For example: Global, EMEA, United Kingdom')+'</details><p class="editor-field-hint">Press Enter or comma to add a tag. Matching topics, processes, and markets connect related content.</p></section><div class="editor-cover-settings"><span class="editor-settings-label">Cover image <small>Optional</small></span><div id="editor-cover-preview"></div><label class="cover-upload" for="editor-cover-file">'+options.icon('plus')+'<strong>Upload cover image</strong><span>PNG, JPG, WebP, or GIF · up to 1 MB</span><input type="file" id="editor-cover-file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only"></label><details class="cover-url"><summary>Use an image link</summary>'+input('editor-cover-url','Image URL',cover&&!cover.src.startsWith('data:')?cover.src:'','placeholder="https://… or /confluence/download/…"')+'<button type="button" class="link" data-editor-action="cover-url">Apply image</button></details>'+input('editor-cover-alt','Image description',cover?.alt||'','maxlength="300" placeholder="Describe the image for readers"')+input('editor-cover-caption','Caption',cover?.caption||'','maxlength="500" placeholder="Optional caption or source"')+'</div><div class="editor-ownership"><h2>Ownership & review</h2><div class="editor-owner"><span class="avatar">'+escape((options.people.find(p=>p.id===doc?.ownerId)||options.actor).initials)+'</span><div><strong>'+escape((options.people.find(p=>p.id===doc?.ownerId)||options.actor).name)+'</strong><span>Document owner</span></div></div>'+select('editor-reviewer','Reviewer',reviewers,doc?.reviewerId||managers[0]?.id||reviewers[0]?.id,!!doc)+select('editor-approver','Manager approver',managers,doc?.approverId||managers[0]?.id,!!doc)+'<div class="editor-approval-note">Approval date is recorded automatically when the manager approves this revision.</div></div></aside></div></div><div id="editor-reader" hidden></div></form></section>';
    }
    const tagValues={tags:clone(initial.tags),processes:clone(initial.processes),regions:clone(initial.regions)};
    function tagField(kind,label,values,placeholder){return '<div class="editor-field editor-tag-field"><label for="editor-'+kind+'">'+label+'</label><div class="editor-tag-list" data-tag-list="'+kind+'">'+tagChips(kind,values)+'</div><input id="editor-'+kind+'" data-tag-input="'+kind+'" aria-label="Add '+label.toLowerCase()+'" placeholder="'+placeholder+'" maxlength="80"></div>';}
    function tagChips(kind,values){return values.map((tag,index)=>'<span class="editor-tag-chip">'+escape(tag)+'<button type="button" data-remove-tag="'+kind+'" data-tag-index="'+index+'" aria-label="Remove '+escape(tag)+'">×</button></span>').join('');}
    const find=selector=>host.querySelector(selector);
    function bodyMarkdown(){return source?find('#editor-source').value:domToMarkdown(find('#editor-rich'));}
    function fields(){
      const text=id=>find('#'+id).value.trim();
      const tags=Object.fromEntries(Object.keys(tagValues).map(kind=>[kind,content.validateTags([...tagValues[kind],...text('editor-'+kind).split(',').map(s=>s.trim()).filter(Boolean)],kind)]));
      return {commentsEnabled:content.validateCommentsEnabled(find('#editor-comments-enabled').value==='true'?true:find('#editor-comments-enabled').value==='false'?false:null),title:text('editor-title'),summary:text('editor-summary'),slug:text('editor-slug'),type:doc?.type||text('editor-type'),area:directInsight()?'insights':doc?.area||text('editor-area'),...(directInsight()?{publicationMode:content.publicationModeFor(doc?.type||text('editor-type'))}:{}),reviewerId:directInsight()?null:doc?.reviewerId||text('editor-reviewer'),approverId:directInsight()?null:doc?.approverId||text('editor-approver'),bodyMarkdown:bodyMarkdown(),highlights:text('editor-highlights').split('\n').map(s=>s.trim()).filter(Boolean),cover:cover?{src:cover.src,alt:text('editor-cover-alt'),caption:text('editor-cover-caption')}:null,...tags,assets:clone(assets),attachments:clone(attachments),...(sourceMetadata?{sourceMetadata:clone(sourceMetadata)}:{}),...(governanceEnabled&&!directInsight()&&governanceTouched?{governance:governanceFields()}:{}),comment:text('editor-comment')};
    }
    function saveRecovery(){
      if(!host?.isConnected||!dirty||busy)return;
      try{sessionStorage.setItem(recoveryKey,JSON.stringify({savedAt:new Date().toISOString(),fields:fields(),editorState:{slugMode,slugFallback}}));find('#editor-save-status').textContent='Unsaved changes · recovery saved in this tab';}catch(_){find('#editor-save-status').textContent='Unsaved changes · save draft to keep your work';}
    }
    function clearRecovery(){clearTimeout(recoveryTimer);try{sessionStorage.removeItem(recoveryKey);}catch(_){}}
    function changed(){dirty=true;find('#editor-save-status').textContent='Unsaved changes';count();clearTimeout(governanceTimer);governanceTimer=setTimeout(governancePreview,140);clearTimeout(recoveryTimer);recoveryTimer=setTimeout(saveRecovery,400);}
    function count(){find('#editor-word-count').textContent=(bodyMarkdown().trim().match(/\S+/g)||[]).length+' words';}
    function error(message){const el=find('#editor-error');el.hidden=!message;el.textContent=message||'';if(message)el.scrollIntoView({block:'center'});}
    function coverPreview(){find('#editor-cover-preview').innerHTML=cover?'<img src="'+escape(cover.src)+'" alt="Cover preview"><button type="button" class="link" data-editor-action="remove-cover">Remove image</button>':'';}
    function attachmentList(){find('#editor-attachment-list').innerHTML=attachments.length?attachments.map(file=>'<div class="editor-attachment-row">'+svg('attachment')+'<div><strong>'+escape(file.name)+'</strong><span>'+formatSize(file.size)+'</span></div><button type="button" class="link" data-attachment-link="'+escape(file.id)+'">Insert link</button><button type="button" class="editor-file-remove" data-remove-attachment="'+escape(file.id)+'" aria-label="Remove '+escape(file.name)+'">×</button></div>').join(''):'<div class="editor-empty-attachments">No attachments yet.</div>';}
    function formatSize(size){return size>=1048576?(size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(size/1024))+' KB';}
    // A viewport-sized form alone does not expand its constrained article body.
    // Keep the editor DOM in place (and its selection intact), size the complete
    // writing surface, and restore the Confluence host's scrolling on exit.
    function updateFocusLayout(){
      if(!fullScreen||!focusState?.form.isConnected)return;
      const viewport=root.visualViewport,width=viewport?.width||root.innerWidth,height=viewport?.height||root.innerHeight,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
      const form=focusState.form,writing=find('.editor-writing'),frame=find('.rich-editor');
      for(const [key,value] of Object.entries({width,height,left,top}))form.style.setProperty('--wcs-focus-'+key,Math.max(0,value)+'px');
      if(!preview){
        const bottomPadding=parseFloat(root.getComputedStyle(find('.editor-main')).paddingBottom)||24;
        const frameTop=frame.getBoundingClientRect().top+writing.scrollTop;
        form.style.setProperty('--wcs-focus-panel-height',Math.max(240,top+height-frameTop-bottomPadding)+'px');
      }
    }
    function scheduleFocusLayout(){if(!fullScreen||focusFrame)return;focusFrame=root.requestAnimationFrame(()=>{focusFrame=0;updateFocusLayout();});}
    function setFocusMode(expanded,restoreFocus=true){
      if(expanded===fullScreen||!host)return;
      const form=find('.authoring-surface'),toggle=find('[data-format="fullscreen"]'),exit=find('[data-editor-action="focus-exit"]');
      if(expanded){
        rememberSelection();
        const ancestors=[];for(let el=form.parentElement;el;el=el.parentElement)ancestors.push({el,left:el.scrollLeft,top:el.scrollTop});
        const properties=['width','height','left','top','panel-height'].map(key=>'--wcs-focus-'+key);
        focusState={form,active:document.activeElement,x:root.scrollX,y:root.scrollY,ancestors,
          styles:properties.map(key=>({key,value:form.style.getPropertyValue(key),priority:form.style.getPropertyPriority(key)})),
          locks:[document.documentElement,document.body].map(el=>({el,value:el.style.getPropertyValue('overflow'),priority:el.style.getPropertyPriority('overflow')}))};
        focusState.locks.forEach(({el})=>el.style.setProperty('overflow','hidden'));
        fullScreen=true;form.classList.add('editor-focus-mode');exit.hidden=false;
        toggle.setAttribute('aria-pressed','true');toggle.setAttribute('aria-label','Exit expanded editor');toggle.setAttribute('data-tooltip','Exit expanded editor');
        focusAbort=new AbortController();const listener={signal:focusAbort.signal};root.addEventListener('resize',scheduleFocusLayout,listener);
        root.visualViewport?.addEventListener('resize',scheduleFocusLayout,listener);root.visualViewport?.addEventListener('scroll',scheduleFocusLayout,listener);
        if(root.ResizeObserver){focusObserver=new root.ResizeObserver(scheduleFocusLayout);for(const selector of ['.editor-topbar','.editor-content-label','label[for="editor-title"]','#editor-error'])focusObserver.observe(find(selector));}
        updateFocusLayout();scheduleFocusLayout();
      }else{
        const state=focusState,focused=document.activeElement;
        // Preserve the current range, including edits made while expanded.
        rememberSelection();fullScreen=false;focusAbort?.abort();focusAbort=null;focusObserver?.disconnect();focusObserver=null;
        if(focusFrame)root.cancelAnimationFrame(focusFrame);focusFrame=0;
        state.form.classList.remove('editor-focus-mode');exit.hidden=true;
        toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Expand editor');toggle.setAttribute('data-tooltip','Expand editor');
        state.styles.forEach(({key,value,priority})=>value?state.form.style.setProperty(key,value,priority):state.form.style.removeProperty(key));
        state.locks.forEach(({el,value,priority})=>value?el.style.setProperty('overflow',value,priority):el.style.removeProperty('overflow'));
        if(restoreFocus){
          let target=focused?.matches?.('#editor-rich,#editor-source')?focused:state.active;
          if(target?.matches?.('#editor-rich,#editor-source'))target=source?find('#editor-source'):find('#editor-rich');
          if(!target?.isConnected||target===exit)target=toggle;
          target?.focus?.({preventScroll:true});
          if(target===find('#editor-rich')&&savedRange&&target.contains(savedRange.startContainer)){const selection=root.getSelection();selection.removeAllRanges();selection.addRange(savedRange);}
          state.ancestors.forEach(({el,left,top})=>{el.scrollLeft=left;el.scrollTop=top;});root.scrollTo({left:state.x,top:state.y,behavior:'instant'});
        }
        focusState=null;
      }
    }
    function showEditing(){preview=false;find('.editor-writing').hidden=false;find('#editor-reader').hidden=true;find('#editor-reader').innerHTML='';find('[data-editor-action="preview"]').textContent='Preview';scheduleFocusLayout();}
    function rememberSelection(){const s=window.getSelection();if(s.rangeCount&&find('#editor-rich').contains(s.anchorNode)){savedRange=s.getRangeAt(0).cloneRange();updateTableTools();}}
    function restoreSelection(){const rich=find('#editor-rich');rich.focus();const s=window.getSelection();s.removeAllRanges();if(savedRange&&rich.contains(savedRange.startContainer))s.addRange(savedRange);else{const range=document.createRange();range.selectNodeContents(rich);range.collapse(false);s.addRange(range);}}
    function selectedText(){if(source){const el=find('#editor-source');return el.value.slice(el.selectionStart,el.selectionEnd);}return savedRange?.toString()||'';}
    function prepareImport(value){return content.normalizeImport(value,context());}
    function adoptImport(prepared){assets=prepared.assets;attachments=prepared.attachments;attachmentList();}
    function normalizeCurrent(){
      const original=bodyMarkdown();if(!original.trim())return original;
      const prepared=prepareImport(original);if(prepared.metadata)throw Error('Use Paste MDX / Markdown to preview and apply the metadata block.');adoptImport(prepared);
      if(prepared.bodyMarkdown!==original){find('#editor-source').value=prepared.bodyMarkdown;find('#editor-rich').innerHTML=renderBody(prepared.bodyMarkdown);savedRange=null;changed();}
      return prepared.bodyMarkdown;
    }
    function insertMarkdown(md){
      if(!md.trim())return;
      const prepared=prepareImport(md);if(prepared.metadata)throw Error('Use Paste MDX / Markdown to preview and apply the metadata block.');adoptImport(prepared);md=prepared.bodyMarkdown;
      if(source){const field=find('#editor-source');field.setRangeText(md,field.selectionStart,field.selectionEnd,'end');field.focus();}
      else{restoreSelection();document.execCommand('insertHTML',false,renderBody(md));rememberSelection();}
      changed();
    }
    function format(command,value){if(busy||source)return;restoreSelection();document.execCommand(command,false,value);rememberSelection();changed();}
    function dialog(title,body,onMount,size){
      if(activeDialog&&!activeDialog.element.isConnected)activeDialog=null;
      if(activeDialog)return;
      rememberSelection();
      activeDialog=root.WCSUI.dialog({title,body,size,onMount:handle=>onMount(handle),onClose:()=>{activeDialog=null;}});
      return activeDialog;
    }
    const dialogError=(element,message)=>{const el=element.querySelector('.editor-dialog-error');el.textContent=message;el.hidden=false;};
    const dialogActions=(primary='Insert')=>'<div class="editor-dialog-error form-error" role="alert" hidden></div><div class="editor-dialog-actions"><button type="button" class="button secondary" data-dialog-cancel>Cancel</button><button type="submit" class="button">'+primary+'</button></div>';
    function bindDialog(handle,submit){
      const element=handle.element;
      element.querySelector('[data-dialog-cancel]')?.addEventListener('click',()=>handle.close('cancel'));
      element.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();if(handle.busy)return;try{await submit(element,handle);}catch(ex){dialogError(element,ex.message);options.notify?.(ex.message,{type:'error'});}});
    }
    function requestLeave(destination){
      if(busy||retryFields||loading)return false;
      if(!dirty){options.cancel(destination);return true;}
      dialog('Keep your changes?','<p>Your changes have not been saved to the document.</p><div class="editor-dialog-actions"><button type="button" class="button" data-keep>Keep editing</button><button type="button" class="button secondary" data-discard>Discard changes</button></div>',handle=>{handle.element.querySelector('[data-keep]').onclick=()=>handle.close('keep');handle.element.querySelector('[data-discard]').onclick=()=>{dirty=false;clearRecovery();handle.close('discard');options.cancel(destination);};});return false;
    }
    function linkDialog(){
      const text=selectedText();
      dialog('Insert link','<form novalidate>'+input('insert-link-label','Link text',text,'maxlength="500"')+input('insert-link-url','Resource URL','','placeholder="https://… or /confluence/…"')+dialogActions()+'</form>',handle=>bindDialog(handle,(element,h)=>{const label=element.querySelector('#insert-link-label').value.trim(),url=element.querySelector('#insert-link-url').value.trim();if(!content.safeUrl(url,false)||/^http:\/\//i.test(url))throw Error('Use a full HTTPS URL or a relative Confluence path.');if(!label)throw Error('Add text for the link.');h.close('insert');insertMarkdown('['+markdownText(label)+']('+url.replace(/[()]/g,c=>c==='('?'%28':'%29')+')');options.notify?.('Link added to this draft.',{type:'success'});}));
    }
    function id(prefix){return prefix+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
    const readData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The file could not be read. Try again.'));reader.readAsDataURL(file);});
    async function imageDialog(file,existing){
      const existingId=existing?.getAttribute('data-asset-id'),existingAsset=assets.find(asset=>asset.id===existingId),existingSrc=existingAsset?.src||existing?.getAttribute('src')||'';
      dialog(existing?'Edit image':'Insert image','<form novalidate><p class="editor-dialog-intro">Add an image where your cursor is. Its description is included for readers using assistive technology.</p><label class="editor-dialog-upload" for="inline-image-file">'+svg('image')+'<span data-image-choice>'+escape(file?.name||'Choose PNG, JPG, WebP, or GIF')+'</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="inline-image-file" class="sr-only"></label>'+input('inline-image-url','Or use an image URL',existingSrc&&!existingSrc.startsWith('data:')?existingSrc:'','placeholder="https://… or /confluence/download/…"')+input('inline-image-alt','Image description',existing?.getAttribute('alt')||file?.name.replace(/\.[^.]+$/,'')||'','maxlength="500" placeholder="Describe what this image shows"')+'<p class="editor-field-hint">Up to 1 MB per image. Images stay with this document version.</p>'+dialogActions(existing?'Update image':'Insert image')+(existing?'<button type="button" class="link editor-remove-image" data-delete-image>Remove image</button>':'')+'</form>',handle=>{
        let selectedFile=file;
        handle.element.querySelector('#inline-image-file').onchange=e=>{selectedFile=e.target.files[0];handle.element.querySelector('[data-image-choice]').textContent=selectedFile?.name||'Choose an image';if(selectedFile&&!handle.element.querySelector('#inline-image-alt').value)handle.element.querySelector('#inline-image-alt').value=selectedFile.name.replace(/\.[^.]+$/,'');};
        handle.element.querySelector('[data-delete-image]')?.addEventListener('click',()=>{existing.remove();if(existingId&&!find('#editor-rich').querySelector('[data-asset-id="'+CSS.escape(existingId)+'"]'))assets=assets.filter(a=>a.id!==existingId);handle.close('remove');changed();options.notify?.('Resource removed from this draft.',{type:'info'});});
        bindDialog(handle,async(element,h)=>{
          const alt=element.querySelector('#inline-image-alt').value.trim();if(!alt)throw Error('Add an image description.');
          let src=element.querySelector('#inline-image-url').value.trim()||existingSrc;
          if(selectedFile){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(selectedFile.type)||selectedFile.size>1048576)throw Error('Choose a PNG, JPG, WebP, or GIF no larger than 1 MB.');h.setBusy(true);loading++;try{src=await readData(selectedFile);}finally{loading--;h.setBusy(false);}if(abort.signal.aborted)return;}
          const asset={id:existingId||id('image'),src,alt};const next=[...assets.filter(a=>a.id!==asset.id),asset];content.validateAssets(next);assets=next;
          if(existing){existing.src=src;existing.alt=alt;existing.setAttribute('data-asset-id',asset.id);existing.setAttribute('data-wcs-source','attachment:'+asset.id);h.close('updated');changed();}
          else{h.close('insert');insertMarkdown('!['+markdownText(alt)+'](attachment:'+asset.id+')');}
          error('');options.notify?.(existing?'Image updated in this draft.':'Image added to this draft.',{type:'success'});
        });
      });
    }
    function tableDialog(){dialog('Insert table','<form novalidate><p class="editor-dialog-intro">The first row contains column headings. Edit any cell directly in the document.</p><div class="editor-dialog-grid">'+input('table-rows','Rows','3','type="number" min="2" max="12"')+input('table-cols','Columns','3','type="number" min="1" max="8"')+'</div>'+dialogActions('Insert table')+'</form>',handle=>bindDialog(handle,(element,h)=>{const rows=Number(element.querySelector('#table-rows').value),cols=Number(element.querySelector('#table-cols').value);if(!Number.isInteger(rows)||rows<2||rows>12||!Number.isInteger(cols)||cols<1||cols>8)throw Error('Use 2–12 rows and 1–8 columns.');const row=cells=>'| '+cells.join(' | ')+' |',md=[row(Array.from({length:cols},(_,i)=>'Heading '+(i+1))),row(Array(cols).fill('---')),...Array.from({length:rows-1},()=>row(Array(cols).fill('Text')))].join('\n');h.close('insert');insertMarkdown('\n\n'+md+'\n\n');options.notify?.('Table added to this draft.',{type:'success'});}));}
    function codeDialog(){dialog('Insert code block','<form novalidate>'+input('code-language','Language (optional)','','placeholder="javascript, sql, text…" maxlength="30"')+textarea('code-content','Code',selectedText(),'rows="8" spellcheck="false" class="editor-code-input"')+dialogActions('Insert code')+'</form>',handle=>bindDialog(handle,(element,h)=>{const language=element.querySelector('#code-language').value.trim(),text=element.querySelector('#code-content').value;if(language&&!/^[a-z0-9_-]{1,30}$/i.test(language))throw Error('Use a short language name with letters, numbers, or hyphens.');if(!text.trim())throw Error('Add the code to insert.');const runs=text.match(/`+/g)||[],fence='`'.repeat(Math.max(3,...runs.map(s=>s.length+1)));h.close('insert');insertMarkdown('\n\n'+fence+language+'\n'+text+'\n'+fence+'\n\n');options.notify?.('Code block added to this draft.',{type:'success'});}),'wide');}
    function videoDialog(existing){
      const currentUrl=existing?.getAttribute('data-video-url')||'',currentTitle=existing?.getAttribute('data-video-title')||'';
      dialog(existing?'Edit training video':'Insert training video','<form novalidate data-video-form><p class="editor-dialog-intro">Add a recorded training from SharePoint or Microsoft Stream. Paste its sharing link or the embed code provided by the video player. Use Share → Embed in SharePoint for an inline player; a sharing link creates a video link card.</p>'+textarea('video-input','SharePoint URL or embed code',currentUrl,'required rows="4" maxlength="12000" spellcheck="false" placeholder="https://your-tenant.sharepoint.com/… or &lt;iframe…&gt;"')+input('video-title','Video title',currentTitle||selectedText(),'required maxlength="200" placeholder="For example, Completing the credit approval checklist"')+'<p class="editor-field-hint">Use a clear title for readers and assistive technology. SharePoint still controls who can watch the recording.</p>'+dialogActions(existing?'Update video':'Insert video')+(existing?'<button type="button" class="link editor-remove-video" data-delete-video>Remove video</button>':'')+'</form>',handle=>{
        handle.element.querySelector('[data-delete-video]')?.addEventListener('click',()=>{existing.remove();savedRange=null;handle.close('remove');changed();options.notify?.('Resource removed from this draft.',{type:'info'});});
        bindDialog(handle,(element,h)=>{
          const title=element.querySelector('#video-title').value.trim();if(!title)throw Error('Add a clear title for this training video.');
          const video=content.videoEmbed(element.querySelector('#video-input').value,title),markdown=content.videoMarkdown(video);
          if(existing){
            const template=document.createElement('template');template.innerHTML=renderBody(markdown);const replacement=template.content.querySelector('[data-video-url]');
            if(!replacement)throw Error('The video could not be prepared. Check its SharePoint link.');
            existing.replaceWith(replacement);savedRange=null;h.close('updated');changed();
          }else{h.close('insert');insertMarkdown('\n\n'+markdown+'\n\n');}
          error('');options.notify?.(existing?'Video updated in this draft.':'Video added to this draft.',{type:'success'});
        });
      });
    }
    function embedDialog(){dialog('Embed a resource','<form novalidate><p class="editor-dialog-intro">Add a resource card for a training, video, or shared document. Readers open it in its source application.</p>'+input('embed-url','Resource URL','','placeholder="https://…"')+dialogActions('Insert resource')+'</form>',handle=>bindDialog(handle,(element,h)=>{const url=element.querySelector('#embed-url').value.trim();let parsed;try{parsed=new URL(url);}catch(_){}if(!parsed||parsed.protocol!=='https:'||parsed.username||parsed.password||!safeTarget(url))throw Error('Use a complete HTTPS resource URL.');h.close('insert');insertMarkdown('\n\n@[embed]('+url+')\n\n');options.notify?.('Resource added to this draft.',{type:'success'});}));}
    function sourceMetadataRows(value){
      return [['Source ID',value.sourceId],['Original created',value.originalCreatedAt||'Not recorded'],['Original updated',value.originalUpdatedAt||'Not recorded'],['Source author',value.sourceAuthor||'Not recorded'],['Source path',value.sourcePath||'Not recorded']];
    }
    function metadataList(rows,grid=false){return '<dl class="wcs-governance-metadata'+(grid?' editor-dialog-grid':'')+'">'+rows.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl>';}
    function sourceMetadataSummary(){
      if(!sourceMetadata)return '';
      return '<details class="cover-url"><summary>Original document metadata</summary>'+metadataList(sourceMetadataRows(sourceMetadata))+'<p class="editor-field-hint">These are source document dates. Confluence history and approval dates are recorded separately. Paste an updated metadata block with the same Source ID to correct them.</p></details>';
    }
    function validateImportedMetadata(metadata){
      if(!metadata)return;
      if(!doc)metadata.type=content.groupType(metadata.type);
      if(!(content.isInsightType(metadata.type)&&metadata.area==='insights')&&!options.areas.some(area=>area.id===metadata.area))throw Error('The metadata business area is not available here. Use an area ID from Document settings.');
      if(!editorTypes().some(type=>type.id===metadata.type))throw Error('The metadata content type is not available for this document. Use a type from Document settings.');
      if(doc&&(metadata.type!==doc.type||(!directInsight()&&metadata.area!==doc.area)))throw Error('An existing document must keep its business area and content type. Match those fields in the metadata block.');
      if(sourceMetadata&&sourceMetadata.sourceId!==metadata.sourceMetadata.sourceId)throw Error('This document already has a different Source ID. Keep its original Source ID or create a separate document.');
      content.validateSourceMetadata(metadata.sourceMetadata);
    }
    function applyImportedMetadata(metadata){
      if(!metadata)return;
      for(const key of ['title','summary','type','area'])find('#editor-'+key).value=metadata[key];
      find('#editor-comments-enabled').value=String(content.validateCommentsEnabled(metadata.commentsEnabled));updateCommentsSetting();
      for(const kind of Object.keys(tagValues)){tagValues[kind]=content.validateTags(metadata[kind]||[],kind);find('#editor-'+kind).value='';find('[data-tag-list="'+kind+'"]').innerHTML=tagChips(kind,tagValues[kind]);}
      sourceMetadata=clone(metadata.sourceMetadata);find('#editor-source-metadata').innerHTML=sourceMetadataSummary();
      if(slugMode==='auto')find('#editor-slug').value=automaticSlug(metadata.title);
      updateSlugControl();root.WCSUI.enhance(host);
    }
    function markdownDialog(){
      let reviewed='';
      dialog('Paste MDX / Markdown','<form novalidate><p class="editor-dialog-intro">Paste a WCSpedia MDX file with its metadata block, or plain Markdown. Preview the extracted values before importing. JSX and JavaScript components must be converted to Markdown first.</p>'+textarea('paste-markdown-content','MDX or Markdown','','rows="11" spellcheck="false" placeholder="Paste the metadata block and document content…"')+select('paste-markdown-mode','Placement',[{id:'insert',name:'Insert at cursor'},{id:'replace',name:'Replace document content'}],'replace')+'<div data-import-preview hidden aria-live="polite"></div>'+dialogActions('Preview import')+'</form>',handle=>{
        const element=handle.element,previewBox=element.querySelector('[data-import-preview]'),button=element.querySelector('button[type="submit"]');
        function reset(){reviewed='';previewBox.hidden=true;previewBox.replaceChildren();button.textContent='Preview import';}
        element.querySelector('#paste-markdown-content').addEventListener('input',reset);element.querySelector('#paste-markdown-mode').addEventListener('change',reset);
        bindDialog(handle,(element,h)=>{
          const md=element.querySelector('#paste-markdown-content').value,mode=element.querySelector('#paste-markdown-mode').value;
          element.querySelector('.editor-dialog-error').hidden=true;
          const prepared=prepareImport(md),rendered=content.render(prepared.bodyMarkdown,prepared);validateImportedMetadata(prepared.metadata);
          if(prepared.metadata&&mode!=='replace')throw Error('A metadata block describes a complete document. Choose Replace document content, or paste body-only Markdown to insert a section.');
          const signature=mode+'\n'+md;
          if(reviewed!==signature){
            const metadata=prepared.metadata;
            previewBox.innerHTML='<h3>Import preview</h3>'+(metadata?metadataList([['Title',metadata.title],['Excerpt',metadata.summary],['Content type',metadata.type],['Business area',content.isInsightType(metadata.type)?'Insights':options.areas.find(area=>area.id===metadata.area).title],['Article comments',metadata.commentsEnabled?'Enabled':'Disabled'],...sourceMetadataRows(metadata.sourceMetadata),...['tags','processes','regions'].map(kind=>[({tags:'Topics',processes:'Processes',regions:'Regions / markets'})[kind],(metadata[kind]||[]).join(', ')||'None'])],true):'<p>No metadata block. Existing document settings and original dates will be kept.</p>')+'<p>'+ (mode==='replace'?'This replaces the document body.':'This inserts content at the cursor.')+' Imported metadata replaces the matching settings only when a metadata block is present. Review assignments and approval history stay separate.</p><details><summary>Preview document content</summary><div class="document-body">'+rendered+'</div></details>';
            previewBox.hidden=false;previewBox.tabIndex=-1;previewBox.focus({preventScroll:true});previewBox.scrollIntoView({block:'start'});button.textContent='Apply import';reviewed=signature;return;
          }
          applyImportedMetadata(prepared.metadata);adoptImport(prepared);h.close('apply');
          if(mode==='replace'){find('#editor-source').value=prepared.bodyMarkdown;find('#editor-rich').innerHTML=renderBody(prepared.bodyMarkdown);savedRange=null;changed();}else insertMarkdown(prepared.bodyMarkdown);
          governancePreview();options.notify?.('Import applied. Save the draft to keep these changes.',{type:'success'});
        });
      },'wide');
    }
    function updateTemplateLabel(){
      const button=find('[data-editor-action="template"]');
      if(button)button.textContent=(find('#editor-type').value||initialType())+' template';
    }
    function templateDialog(){
      const type=find('#editor-type').value||initialType(),md=content.starterTemplate(type);
      dialog(type+' Markdown template','<form novalidate><p class="editor-dialog-intro">A starting structure for this content type. Add it at the end of your draft, or copy it to use elsewhere. Your existing content and settings are kept.</p>'+textarea('editor-template-markdown','Markdown template',md,'rows="14" readonly')+'<button type="button" class="button secondary" data-copy-template>Copy template</button><p data-template-status role="status"></p>'+dialogActions('Add to draft')+'</form>',handle=>{
        handle.element.querySelector('[data-copy-template]').onclick=async()=>{
          const field=handle.element.querySelector('textarea'),status=handle.element.querySelector('[data-template-status]');
          try{await navigator.clipboard.writeText(md);status.textContent='Template copied.';}
          catch(_){field.focus();field.select();status.textContent='Template selected. Use Copy to copy it.';}
        };
        bindDialog(handle,(_,h)=>{
          const current=normalizeCurrent(),combined=current.trimEnd()+(current.trim()?'\n\n':'')+md;
          const normalized=prepareImport(combined),rendered=renderBody(normalized.bodyMarkdown);
          h.close('insert');
          find('#editor-source').value=normalized.bodyMarkdown;find('#editor-rich').innerHTML=rendered;savedRange=null;
          if(source){const field=find('#editor-source');field.focus();field.setSelectionRange(field.value.length,field.value.length);}
          else{const rich=find('#editor-rich');rich.focus();const range=document.createRange();range.selectNodeContents(rich);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);rememberSelection();}
          changed();options.notify?.('Template added to this draft.',{type:'success'});
        });
      },'wide');
    }
    async function copyMarkdown(){
      let md;try{normalizeCurrent();md=content.toMarkdown(fields());}catch(ex){error(ex.message);return;}
      try{await navigator.clipboard.writeText(md);find('#editor-save-status').textContent='Markdown copied to clipboard';options.notify?.('Markdown copied to clipboard.',{type:'success'});}
      catch(_){dialog('Copy Markdown','<p>Select and copy the Markdown below.</p>'+textarea('copy-markdown-value','Markdown',md,'rows="12" readonly')+'<div class="editor-dialog-actions"><button type="button" class="button" data-dialog-cancel>Done</button></div>',handle=>{handle.element.querySelector('[data-dialog-cancel]').onclick=()=>handle.close('done');const field=handle.element.querySelector('textarea');field.focus();field.select();},'wide');}
    }
    async function uploadCover(file){
      if(!file||busy)return;
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>1048576){error('Choose a PNG, JPG, WebP, or GIF image no larger than 1 MB.');return;}
      loading++;try{const src=await readData(file);if(abort.signal.aborted)return;cover=content.validateCover({src,alt:'Cover image',caption:''});coverPreview();changed();error('');find('#editor-cover-alt').focus();options.notify?.('Cover image added to this draft.',{type:'success'});}catch(ex){if(!abort.signal.aborted){error(ex.message);options.notify?.(ex.message,{type:'error'});}}finally{loading--;}
    }
    const mimeByExt={pdf:'application/pdf',txt:'text/plain',md:'text/markdown',csv:'text/csv',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
    async function uploadAttachments(files){
      if(busy)return;
      loading++;
      try{const pending=[];for(const file of files){const ext=file.name.split('.').pop().toLowerCase(),mimeType=mimeByExt[ext];if(!mimeType)throw Error('This file type is not supported. Choose a PDF, Office document, text file, Markdown, CSV, or image.');if(file.size>5242880)throw Error(file.name+' is larger than 5 MB.');if(attachments.length+pending.length>=20)throw Error('Use up to 20 attachments per document.');const data=await readData(file);pending.push({id:id('file'),name:file.name,url:data.replace(/^data:[^;,]*/, 'data:'+mimeType),mimeType,size:file.size});}if(abort.signal.aborted)return;const next=[...attachments,...pending];content.validateAttachments(next);attachments=next;attachmentList();changed();error('');options.notify?.(pending.length+' '+(pending.length===1?'attachment added':'attachments added')+' to this draft.',{type:'success'});}catch(ex){if(!abort.signal.aborted){error(ex.message);options.notify?.(ex.message,{type:'error'});}}finally{loading--;if(host?.isConnected)find('#editor-attachment-file').value='';}
    }
    function removeAttachment(fileId){
      const file=attachments.find(item=>item.id===fileId);if(!file)return;
      const remove=()=>{const md=bodyMarkdown().replace(new RegExp('\\[([^\\]]*)\\]\\(attachment:'+fileId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\)','g'),'$1');const next=attachments.filter(item=>item.id!==fileId);try{content.validateReferences(md,{assets,attachments:next});}catch(_){error('This attachment still has a Markdown link or reference. Remove its links in the content before removing the file.');return;}attachments=next;find('#editor-source').value=md;find('#editor-rich').innerHTML=renderBody(md);savedRange=null;attachmentList();changed();};
      if(bodyMarkdown().includes('attachment:'+fileId))dialog('Remove attachment?','<p>'+escape(file.name)+' is linked in this content. Removing it will keep the link text and remove its link.</p><div class="editor-dialog-actions"><button type="button" class="button secondary" data-keep>Keep attachment</button><button type="button" class="button" data-remove>Remove attachment</button></div>',handle=>{handle.element.querySelector('[data-keep]').onclick=()=>handle.close('keep');handle.element.querySelector('[data-remove]').onclick=()=>{remove();handle.close('remove');};});else remove();
    }
    function addTags(kind){
      const field=find('#editor-'+kind),value=field.value.trim();if(!value)return;
      try{tagValues[kind]=content.validateTags([...tagValues[kind],...value.split(',').map(s=>s.trim()).filter(Boolean)],kind);field.value='';find('[data-tag-list="'+kind+'"]').innerHTML=tagChips(kind,tagValues[kind]);changed();error('');}catch(ex){error(ex.message);}
    }
    function currentTable(){let node=savedRange?.startContainer;if(node?.nodeType===3)node=node.parentElement;const table=node?.closest?.('table');return table&&find('#editor-rich').contains(table)?table:null;}
    function updateTableTools(){find('.editor-table-tools').hidden=!currentTable()||source;}
    function leaveTable(table,before=false){
      // Move the selection into a sibling paragraph, never into another cell.
      let paragraph=before?table.previousElementSibling:table.nextElementSibling;
      if(!paragraph||paragraph.tagName!=='P'){
        paragraph=document.createElement('p');paragraph.append(document.createElement('br'));
        table.parentNode.insertBefore(paragraph,before?table:table.nextSibling);
      }
      find('#editor-rich').focus();const range=document.createRange();range.selectNodeContents(paragraph);range.collapse(!before);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);rememberSelection();changed();
    }
    function tableAction(action){
      const table=currentTable();if(!table)return;
      if(action==='before'||action==='after'){leaveTable(table,action==='before');return;}
      if(action==='remove'){leaveTable(table);table.remove();}
      if(action==='row'){const row=table.querySelector('tr');if(row){const target=table.tBodies[0]||table.createTBody(),added=target.insertRow();for(let i=0;i<row.cells.length;i++)added.insertCell().textContent='Text';}}
      if(action==='column'){if(table.rows[0]?.cells.length>=8){error('Tables support up to 8 columns.');return;}[...table.rows].forEach((row,i)=>{const cell=document.createElement(i===0?'th':'td');cell.textContent=i===0?'Heading':'Text';row.appendChild(cell);});}
      updateTableTools();changed();
    }
    function restoreRecovery(saved){
      const f=saved.fields;if(!f||typeof f.bodyMarkdown!=='string')return;
      try{
        const recovered=f.bodyMarkdown.trim()?content.normalizeImport(f.bodyMarkdown,{assets:f.assets||[],attachments:f.attachments||[]}):{bodyMarkdown:'',assets:f.assets||[],attachments:f.attachments||[]};
        const rawMetadata=!!recovered.metadata;
        const recoveredMetadata=content.validateSourceMetadata(f.sourceMetadata||null);if(v.sourceMetadata&&(!recoveredMetadata||v.sourceMetadata.sourceId!==recoveredMetadata.sourceId))throw Error('The recovery Source ID does not match the saved document.');sourceMetadata=recoveredMetadata;find('#editor-source-metadata').innerHTML=sourceMetadataSummary();
        assets=content.validateAssets(f.assets||[]);attachments=content.validateAttachments(f.attachments||[]);cover=f.cover?content.validateCover(f.cover):null;
        ['title','summary','slug','comment','type','area','reviewer','approver'].forEach(key=>{const el=find('#editor-'+key),value=f[key==='reviewer'?'reviewerId':key==='approver'?'approverId':key];if(el&&!el.disabled&&value!=null)el.value=value;});
        find('#editor-comments-enabled').value=String(content.validateCommentsEnabled(f.commentsEnabled));updateCommentsSetting();
        find('#editor-highlights').value=(f.highlights||[]).join('\n');find('#editor-cover-alt').value=cover?.alt||'';find('#editor-cover-caption').value=cover?.caption||'';
        for(const kind of Object.keys(tagValues)){tagValues[kind]=content.validateTags(f[kind]||[],kind);find('[data-tag-list="'+kind+'"]').innerHTML=tagChips(kind,tagValues[kind]);}
        if(Object.hasOwn(f,'governance'))restoreGovernance(f.governance);
        if(!rawMetadata)adoptImport(recovered);find('#editor-source').value=rawMetadata?f.bodyMarkdown:recovered.bodyMarkdown;find('#editor-rich').innerHTML=rawMetadata?'':renderBody(recovered.bodyMarkdown);if(rawMetadata){source=true;find('#editor-rich').hidden=true;find('#editor-source').hidden=false;find('.editor-toolbar').hidden=true;find('[data-editor-action="source"]').textContent='Visual editor';find('[data-editor-action="source"]').setAttribute('aria-pressed','true');}if(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(saved.editorState?.slugFallback||'')&&saved.editorState.slugFallback.length<=120)slugFallback=saved.editorState.slugFallback;slugMode=['auto','saved','custom'].includes(saved.editorState?.slugMode)?saved.editorState.slugMode:doc?'saved':f.slug===automaticSlug(f.title)?'auto':'custom';if(slugMode==='auto')find('#editor-slug').value=automaticSlug(f.title);updateSlugControl();savedRange=null;coverPreview();attachmentList();root.WCSUI.enhance(host);changed();error(rawMetadata?'Your complete MDX was restored in Markdown mode. Copy it into Paste MDX / Markdown to preview and apply its metadata.':'');
      }catch(ex){error('The saved recovery copy could not be restored: '+ex.message);}
    }
    function recoveryPrompt(){let saved;try{saved=JSON.parse(sessionStorage.getItem(recoveryKey)||'null');}catch(_){}if(!saved?.fields)return;dialog('Restore your unsaved draft?','<p>A recovery copy from this browser tab is available for this document. It has not been submitted or saved to Confluence.</p><div class="editor-dialog-actions"><button type="button" class="button secondary" data-fresh>Start fresh</button><button type="button" class="button" data-restore>Restore draft</button></div>',handle=>{handle.element.querySelector('[data-fresh]').onclick=()=>{clearRecovery();handle.close('fresh');};handle.element.querySelector('[data-restore]').onclick=()=>{handle.close('restore');restoreRecovery(saved);};});}
    function validateForm(){
      const labels={'editor-title':'Add a document title.','editor-slug':'Add a lowercase slug using words separated by hyphens.','editor-summary':'Add an excerpt for search results.','editor-comment':'Add a change summary for the audit trail.'};
      for(const [selector,message] of Object.entries(labels)){const el=find('#'+selector);el.removeAttribute('aria-invalid');if(!el.value.trim()||(selector==='editor-slug'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(el.value.trim()))){el.setAttribute('aria-invalid','true');el.focus();throw Error(message);}}
    }
    function bind(element){
      host=element;abort=new AbortController();const on=(type,fn)=>host.addEventListener(type,fn,{signal:abort.signal});
      coverPreview();attachmentList();count();root.WCSUI.enhance(host);updateSlugControl();updateCommentsSetting();governancePreview();
      root.addEventListener('pagehide',saveRecovery,{signal:abort.signal});
      on('input',e=>{if(busy||!e.target.closest('#editor-form'))return;if(e.target.id==='editor-slug'){slugMode='custom';updateSlugControl();}if(e.target.id==='editor-title'&&slugMode==='auto')find('#editor-slug').value=automaticSlug(e.target.value);e.target.removeAttribute('aria-invalid');if(e.target.closest('.editor-governance'))governanceTouched=true;changed();});
      on('change',e=>{if(e.target.id==='editor-cover-file')uploadCover(e.target.files[0]);else if(e.target.id==='editor-attachment-file')uploadAttachments(e.target.files);else if(e.target.id==='paragraph-style')format('formatBlock',e.target.value);else if(e.target.closest('#editor-form')){if(e.target.id==='editor-type'){updateCommentsSetting();}if(e.target.closest('.editor-governance'))governanceTouched=true;if(e.target.id==='editor-governance-classification'){find('#editor-governance-reviewBasis').value=e.target.value==='formal-reference'?'formal-governance':'business-best-practice';find('#editor-governance-reviewBasis').dispatchEvent(new Event('input',{bubbles:true}));}changed();}});
      on('focusout',e=>{if(e.target.dataset.tagInput)addTags(e.target.dataset.tagInput);});
      on('keyup',rememberSelection);on('mouseup',rememberSelection);
      on('keydown',e=>{
        if(e.key==='Enter'&&e.target.dataset.tagInput){e.preventDefault();addTags(e.target.dataset.tagInput);return;}
        if(e.key===','&&e.target.dataset.tagInput){e.preventDefault();addTags(e.target.dataset.tagInput);return;}
        if(e.key==='Escape'&&fullScreen&&!activeDialog&&!root.WCSUI.hasPopup()){e.preventDefault();setFocusMode(false);}
        if(e.target.closest('#editor-rich')&&(e.key==='Tab'||((e.metaKey||e.ctrlKey)&&e.key==='Enter'))){
          rememberSelection();const table=currentTable();
          if(table){
            e.preventDefault();
            if(e.key==='Enter'){leaveTable(table,e.shiftKey);return;}
            const node=savedRange?.startContainer,cell=(node?.nodeType===3?node.parentElement:node)?.closest?.('td,th');
            const cells=[...table.querySelectorAll('th,td')],next=cells[cells.indexOf(cell)+(e.shiftKey?-1:1)];
            if(next){const range=document.createRange();range.selectNodeContents(next);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);rememberSelection();}
            else leaveTable(table,e.shiftKey);
            return;
          }
        }
        if(!(e.metaKey||e.ctrlKey)||!['b','i','u'].includes(e.key.toLowerCase()))return;
        if(e.target.closest('#editor-rich')){e.preventDefault();format({b:'bold',i:'italic',u:'underline'}[e.key.toLowerCase()]);}
        else if(e.target.id==='editor-source'){e.preventDefault();if(busy)return;const field=e.target,start=field.selectionStart,end=field.selectionEnd,key=e.key.toLowerCase(),marker={b:'**',i:'_',u:'<u>'}[key],closing=key==='u'?'</u>':marker,text=field.value.slice(start,end)||'formatted text';field.setRangeText(marker+text+closing,start,end,'end');field.setSelectionRange(start+marker.length,start+marker.length+text.length);changed();}
      });
      on('paste',async e=>{
        if(!e.target.closest('#editor-rich')||busy)return;e.preventDefault();rememberSelection();
        const file=[...e.clipboardData.files].find(file=>file.type.startsWith('image/'));if(file){imageDialog(file);return;}
        try{const raw=e.clipboardData.getData('text/plain'),html=e.clipboardData.getData('text/html');
          // Explicit Markdown takes priority over rich clipboard fragments from AI UIs.
          const looksMarkdown=/(^|\n)\s*(#{1,6} |```|~~~|\|.+\||[-*] |\d+\. |>)|\*\*[^*]+\*\*|!?\[[^\]]+\]\(/m.test(raw);
          if(looksMarkdown||!html){insertMarkdown(raw);return;}
          const template=document.createElement('template');template.innerHTML=html;
          const nextAssets=[...assets];for(const img of template.content.querySelectorAll('img')){const src=img.getAttribute('src')||'';if(/^data:image\//i.test(src)){const asset={id:id('image'),src,alt:img.getAttribute('alt')||'Pasted image'};content.validateAssets([...nextAssets,asset]);nextAssets.push(asset);img.setAttribute('data-asset-id',asset.id);}}
          const md=domToMarkdown(template.content);content.validateAssets(nextAssets);assets=nextAssets;insertMarkdown(md||raw);
        }catch(ex){error(ex.message);}
      });
      on('dragover',e=>{if(e.target.closest('.cover-upload,.editor-attachments,#editor-rich'))e.preventDefault();});
      on('drop',e=>{if(busy)return;if(e.target.closest('.cover-upload')){e.preventDefault();uploadCover(e.dataTransfer.files[0]);}else if(e.target.closest('.editor-attachments')){e.preventDefault();uploadAttachments(e.dataTransfer.files);}else if(e.target.closest('#editor-rich')){e.preventDefault();rememberSelection();const file=[...e.dataTransfer.files].find(file=>file.type.startsWith('image/'));if(file)imageDialog(file);else if(e.dataTransfer.files.length)uploadAttachments(e.dataTransfer.files);}});
      on('mousedown',e=>{if(e.target.closest('[data-format],[data-table]'))e.preventDefault();});
      on('click',e=>{
        if(busy)return;
        const sourceAdd=e.target.closest('[data-governance-add-source]');if(sourceAdd){governanceTouched=true;const rows=governanceSources();if(rows.length>=30){error('Use up to 30 authoritative sources.');return;}find('[data-governance-sources]').insertAdjacentHTML('beforeend',governanceSource({id:id('source')}));root.WCSUI.enhance(find('[data-governance-sources]'));find('[data-governance-sources]').lastElementChild.querySelector('[data-source-field=title]').focus();changed();return;}
        const sourceRemove=e.target.closest('[data-governance-remove-source]');if(sourceRemove){governanceTouched=true;sourceRemove.closest('[data-governance-source]').remove();find('[data-governance-add-source]').focus();changed();return;}
        const videoButton=e.target.closest('[data-editor-video]');if(videoButton){e.preventDefault();videoDialog(videoButton.closest('[data-video-url]'));return;}
        const image=e.target.closest('#editor-rich img');if(image){e.preventDefault();imageDialog(null,image);return;}
        const tool=e.target.closest('[data-format]');if(tool){const cmd=tool.dataset.format;
          if(cmd==='link')linkDialog();else if(cmd==='image')imageDialog();else if(cmd==='video')videoDialog();else if(cmd==='table')tableDialog();else if(cmd==='codeblock')codeDialog();else if(cmd==='embed')embedDialog();else if(cmd==='code'){const text=selectedText()||'code';const fence='`'.repeat(Math.max(1,...(text.match(/`+/g)||[]).map(s=>s.length+1)));insertMarkdown(fence+' '+text+' '+fence);}else if(cmd==='divider')insertMarkdown('\n\n---\n\n');else if(cmd==='clear'){format('removeFormat');format('unlink');format('formatBlock','p');}else if(cmd==='fullscreen')setFocusMode(!fullScreen);else format(cmd==='quote'?'formatBlock':cmd,cmd==='quote'?'blockquote':null);return;
        }
        const table=e.target.closest('[data-table]');if(table){tableAction(table.dataset.table);return;}
        const removeTag=e.target.closest('[data-remove-tag]');if(removeTag){const kind=removeTag.dataset.removeTag;tagValues[kind].splice(Number(removeTag.dataset.tagIndex),1);find('[data-tag-list="'+kind+'"]').innerHTML=tagChips(kind,tagValues[kind]);changed();return;}
        const removeFile=e.target.closest('[data-remove-attachment]');if(removeFile){removeAttachment(removeFile.dataset.removeAttachment);return;}
        const fileLink=e.target.closest('[data-attachment-link]');if(fileLink){const file=attachments.find(item=>item.id===fileLink.dataset.attachmentLink);if(file)insertMarkdown('['+markdownText(file.name)+'](attachment:'+file.id+')');return;}
        const action=e.target.closest('[data-editor-action]')?.dataset.editorAction;if(!action)return;
        if(action==='slug-customize'){slugMode='custom';updateSlugControl();find('#editor-slug').focus();find('#editor-slug').select();changed();}
        if(action==='slug-auto'){slugMode='auto';find('#editor-slug').value=automaticSlug(find('#editor-title').value);find('#editor-slug').removeAttribute('aria-invalid');updateSlugControl();find('[data-editor-action="slug-customize"]').focus();changed();}
        if(action==='cancel')requestLeave();
        if(action==='focus-exit')setFocusMode(false);
        if(action==='template')templateDialog();
        if(action==='paste-markdown')markdownDialog();
        if(action==='copy-markdown')root.WCSUI.runButton(e.target.closest('button'),copyMarkdown);
        if(action==='source'){try{const md=normalizeCurrent(),rendered=renderBody(md);source=!source;find('#editor-source').value=md;find('#editor-rich').innerHTML=rendered;savedRange=null;find('#editor-rich').hidden=source;find('#editor-source').hidden=!source;find('.editor-toolbar').hidden=source;find('.editor-table-tools').hidden=true;find('[data-editor-action="source"]').textContent=source?'Visual editor':'Markdown';find('[data-editor-action="source"]').setAttribute('aria-pressed',String(source));(source?find('#editor-source'):find('#editor-rich')).focus();scheduleFocusLayout();error('');}catch(ex){error(ex.message);}}
        if(action==='preview'){try{if(preview){showEditing();return;}normalizeCurrent();const f=fields();if(!f.bodyMarkdown.trim())throw Error('Add some content before previewing.');if(f.cover)content.validateCover(f.cover);const rendered=options.preview(f);preview=true;find('.editor-writing').hidden=true;find('#editor-reader').hidden=false;find('#editor-reader').innerHTML=rendered;find('[data-editor-action="preview"]').textContent='Back to editing';error('');}catch(ex){error(ex.message);}}
        if(action==='remove-cover'){cover=null;coverPreview();changed();options.notify?.('Cover image removed from this draft.',{type:'info'});}
        if(action==='cover-url'){try{cover=content.validateCover({src:find('#editor-cover-url').value.trim(),alt:find('#editor-cover-alt').value.trim()||'Cover image',caption:find('#editor-cover-caption').value.trim()});coverPreview();changed();error('');find('#editor-cover-alt').focus();options.notify?.('Cover image added to this draft.',{type:'success'});}catch(ex){error(ex.message);}}
      });
      on('submit',async e=>{
        if(e.target.id!=='editor-form')return;e.preventDefault();if(busy)return;showEditing();
        try{if(!retryFields){validateForm();normalizeCurrent();}if(loading)throw Error('Wait for files to finish loading before saving.');const f=retryFields||fields();if(!f.bodyMarkdown.trim())throw Error('Add content before saving your draft.');if(f.cover)content.validateCover(f.cover);content.validateAssets(f.assets);content.validateAttachments(f.attachments);content.validateReferences(f.bodyMarkdown,f);if(f.highlights.length>5)throw Error('Use up to 5 key highlights.');if(f.governance&&root.WCSGovernance?.validate)f.governance=root.WCSGovernance.validate(f.governance,{complete:false});busy=true;find('#editor-form').setAttribute('aria-busy','true');find('#editor-save-button').setAttribute('aria-busy','true');find('#editor-save-button').textContent=retryFields?'Checking save…':directInsight()?'Publishing…':'Saving draft…';find('#editor-form').querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);find('#editor-rich').contentEditable='false';retryFields=clone(f);await options.save(f);retryFields=null;dirty=false;clearRecovery();}
        catch(ex){error(ex.message);options.notify?.(ex.message,{type:busy?'error':'warning'});if(!ex.recoverable)retryFields=null;if(ex.recoverable){find('#editor-error').insertAdjacentHTML('beforeend','<p>Your content is kept here. Check save verifies the original request before continuing; it does not start a new document.</p>');}if(ex.reloadRequired){reloadRequired=true;busy=true;find('#editor-error').insertAdjacentHTML('beforeend','<p>Reload the latest document before making another change.</p><button type="button" class="button secondary" data-action="editor-reload">Reload workspace</button>');}}
        finally{busy=reloadRequired;if(host.isConnected){find('#editor-form').removeAttribute('aria-busy');find('#editor-save-button').removeAttribute('aria-busy');if(reloadRequired)find('#editor-save-button').textContent='Reload required';else if(retryFields){find('#editor-save-button').textContent='Check save';find('#editor-save-button').disabled=false;}else{find('#editor-save-button').innerHTML='Save draft <span aria-hidden="true">→</span>';find('#editor-form').querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);if(doc)['editor-type','editor-area','editor-reviewer','editor-approver'].forEach(id=>find('#'+id).disabled=true);find('#editor-rich').contentEditable='true';root.WCSUI.enhance(host);updateCommentsSetting();}}}
      });
      recoveryPrompt();
    }
    return {html,bind,fields,isDirty:()=>dirty,isBusy:()=>busy||!!retryFields||loading>0,requestLeave,destroy:()=>{saveRecovery();clearTimeout(recoveryTimer);clearTimeout(governanceTimer);activeDialog?.close('destroy');setFocusMode(false,false);abort?.abort();}};
  }
  root.WCSEditor={create,slugify,domToMarkdown};
})(window);
