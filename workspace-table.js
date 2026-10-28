/* Workspace rows use the same table renderer as access records and suggestions.
 * Callers provide already-authorized rows and actions; this module grants none.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./data-table.js'));
  else root.WCSWorkspaceTable=factory(root.WCSDataTable);
})(typeof globalThis!=='undefined'?globalThis:this,function(Table){
  'use strict';
  const esc=Table.escape;
  function safeHref(value){const href=String(value||'').trim();return href&&!/[\u0000-\u0020]/.test(href)&&(/^(?:#|\/(?!\/)|\.\.?\/)/.test(href)||/^https?:\/\//i.test(href))?href:'';}
  function render(options){
    const review=options.mode==='review',date=options.dateLabel||function(value){return value?new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';};
    const rows=(options.rows||[]).map(row=>{
      const {d,v}=row,href=safeHref(options.documentHref(row));
      const title=href?'<a class="wcs-data-table-title" href="'+esc(href)+'">'+esc(v.title)+'</a>':'<strong class="wcs-data-table-title">'+esc(v.title)+'</strong>';
      const event=(d.audit||[]).filter(e=>e.version===v.version&&(review?e.action==='submit':['edit','revise','create'].includes(e.action))).at(-1);
      const timestamp=event?.at||v.updatedAt||v.createdAt||v.approvedAt;
      const personId=review?(event?.actorId||d.authorId):d.ownerId,updatedBy=event?.actorId&&(options.personName?options.personName(event.actorId):event.actorId);
      const actions=options.actionsMarkup?options.actionsMarkup(row):(href?'<a class="button secondary compact" href="'+esc(href)+'">'+(review?'Review':'Open')+'<span class="sr-only"> '+esc(v.title)+'</span></a>':'');
      return {id:d.id,className:review?'workspace-review-row':'workspace-document-row',cells:[
        Table.html('<span class="wcs-data-table-kicker">'+esc(options.typeLabel?options.typeLabel(d.type):d.type)+' · '+esc(d.reference)+'</span>'+title+'<p class="wcs-data-table-description">'+esc(review?v.changeSummary:v.summary)+'</p><span class="wcs-data-table-secondary">'+esc(options.areaName?options.areaName(d.area):d.area)+'</span>'),
        Table.html('<div class="wcs-status-group">'+(options.statusMarkup?options.statusMarkup(v.status):esc(v.status))+(options.healthMarkup?options.healthMarkup(d):'')+'</div><span class="wcs-data-table-secondary">Version '+esc(v.version)+' · revision '+esc(v.revision)+'</span>'),
        options.personName?options.personName(personId):personId,
        Table.html(esc(date(timestamp))+(!review&&updatedBy?'<span class="wcs-data-table-secondary">Updated by '+esc(updatedBy)+'</span>':'')),
        Table.html((options.readingMarkup?options.readingMarkup(v):'')+(options.viewsMarkup?options.viewsMarkup(d):'')),
        Table.html('<div class="wcs-data-table-actions">'+actions+'</div>')
      ]};
    });
    return Table.render({label:review?'Documents awaiting your review':'My documents',className:'wcs-workspace-table',loading:options.loading,empty:options.empty,columns:[{label:'Document',className:'wcs-table-document'},{label:'Status'},{label:review?'Submitted by':'Owner',className:'wcs-table-person'},{label:review?'Submitted':'Updated',className:'wcs-table-date'},{label:'Reading & views',className:'wcs-table-metrics'},{label:'Actions',visuallyHidden:true,actions:true}],rows});
  }
  return Object.freeze({render});
});
