'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Table=require('./data-table.js'),Workspace=require('./workspace-table.js');
test('shared tables escape untrusted content, keys, labels and discard invalid CSS tokens',()=>{
  const markup=Table.render({label:'<img onerror="bad">',className:'valid bad" onclick="bad',columns:[{label:'<script>name</script>'},{label:'Actions',actions:true,visuallyHidden:true}],rows:[{id:'" onclick="bad',cells:['<img src=x onerror=bad>',{html:'<script>bad</script>'}]}]});
  assert.doesNotMatch(markup,/<img|<script|onclick="/);assert.match(markup,/&lt;img src=x onerror=bad&gt;/);assert.match(markup,/\[object Object\]/);assert.match(markup,/class="wcs-data-table valid"/);assert.match(markup,/scope="col"/);assert.match(markup,/tabindex="0" role="region"/);
});
test('renderer-owned trusted markup retains event attributes and action alignment',()=>{
  const markup=Table.render({columns:[{label:'Name'},{label:'Actions',actions:true}],rows:[{cells:['Name',Table.html('<button data-action="edit">Edit</button>')]}]});
  assert.match(markup,/<button data-action="edit">Edit<\/button>/);assert.equal((markup.match(/wcs-data-table-action-cell/g)||[]).length,2);
});
test('empty and loading tables retain headers, caption and accessible state across all columns',()=>{
  const options={label:'Requests',columns:[{label:'Document'},{label:'Status'},{label:'Actions'}],empty:{title:'No matching requests',description:'Try another keyword.'}};
  const empty=Table.render(options),loading=Table.render({...options,loading:true,loadingLabel:'Loading requests…',rows:[{cells:['Stale row']}]});
  for(const markup of [empty,loading]){assert.match(markup,/<caption class="sr-only">Requests<\/caption>/);assert.match(markup,/<tbody><\/tbody>/);assert.match(markup,/<\/table><\/div><div class="wcs-data-table-state"/);assert.match(markup,/role="status"/);assert.match(markup,/<thead>/);}
  assert.match(empty,/No matching requests/);assert.match(loading,/aria-busy="true"/);assert.match(loading,/Loading requests…/);assert.doesNotMatch(loading,/Stale row/);
});
const row={d:{id:'doc-one',type:'Job aid',reference:'WCS-1',ownerId:'owner',authorId:'author',area:'credit',audit:[{action:'create',version:2,actorId:'author',at:'2026-01-01'},{action:'edit',version:2,actorId:'editor',at:'2026-02-01'},{action:'submit',version:2,actorId:'submitter',at:'2026-03-01'},{action:'edit',version:3,actorId:'other',at:'2026-04-01'}]},v:{title:'<img src=x>',summary:'A document',changeSummary:'Changed steps',status:'In review',version:2,revision:4,createdAt:'2026-01-01',approvedAt:'2026-01-02'}};
const options={rows:[row],documentHref:()=> '#/document/doc-one',personName:id=>'Name '+id,areaName:()=> 'Credit',dateLabel:value=>value,readingMarkup:()=>'<span>2 min read</span>',viewsMarkup:()=>'<span>4 views</span>'};
test('My workspace dates reflect last edit of the displayed version and identify its editor',()=>{
  const markup=Workspace.render({...options,mode:'mine'});assert.match(markup,/2026-02-01/);assert.match(markup,/Updated by Name editor/);assert.doesNotMatch(markup,/2026-04-01/);assert.match(markup,/Name owner/);assert.match(markup,/2 min read/);assert.match(markup,/4 views/);assert.doesNotMatch(markup,/<img/);assert.match(markup,/&lt;img src=x&gt;/);
});
test('Reviewer workspace uses the submitted revision actor and preserves delegated actions',()=>{
  const markup=Workspace.render({...options,mode:'review',actionsMarkup:()=>'<button data-action="delete" data-document-id="doc-one">Delete</button>'});assert.match(markup,/Name submitter/);assert.match(markup,/2026-03-01/);assert.doesNotMatch(markup,/Updated by/);assert.match(markup,/data-document-id="doc-one"/);assert.match(markup,/Changed steps/);
});
test('Workspace rows never create unsafe links or infer editing or deletion permissions',()=>{
  const markup=Workspace.render({...options,mode:'mine',documentHref:()=> 'javascript:alert(1)'});assert.doesNotMatch(markup,/href=|data-action="(?:edit|delete)"/);const empty=Workspace.render({...options,rows:[],empty:{title:'Nothing pending'}});assert.match(empty,/Nothing pending/);assert.match(empty,/wcs-data-table-state/);
});
