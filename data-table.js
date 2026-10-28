/* One presentation component for WCSpedia directories and work queues.
 * Values are escaped. Only renderer-owned markup may use html(); never pass
 * unescaped attachment/API data to it. Permissions remain the caller's job.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WCSDataTable=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const trusted=Symbol('WCSpedia table markup');
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const classes=value=>String(value||'').split(/\s+/).filter(v=>/^[a-zA-Z][\w-]*$/.test(v)).join(' ');
  const html=value=>Object.freeze({[trusted]:true,value:String(value==null?'':value)});
  const content=value=>value&&value[trusted]===true?value.value:escape(value);
  function render(options){
    options=options||{};const columns=options.columns||[],rows=options.rows||[];
    if(!columns.length)throw Error('A shared table needs at least one column.');
    const label=options.label||'Records',loading=options.loading===true,hasState=loading||!rows.length;
    const columnClass=column=>classes(column.className)+(column.actions?' wcs-data-table-action-cell':'');
    const empty=options.empty||{};
    // A status is outside the wide table so it always fits the visible scrollport.
    const state='<div class="wcs-data-table-state" role="status">'+(loading?'<p>'+escape(options.loadingLabel||'Loading records…')+'</p>':'<strong>'+escape(empty.title||'No records to show')+'</strong>'+(empty.description?'<p>'+escape(empty.description)+'</p>':'')+(empty.action?'<div class="wcs-data-table-state-action">'+content(empty.action)+'</div>':''))+'</div>';
    return '<div class="wcs-data-table-frame'+(hasState?' has-state':'')+'"><div class="wcs-data-table-scroll '+classes(options.scrollClassName)+'" tabindex="0" role="region" aria-label="'+escape(label)+'"'+(loading?' aria-busy="true"':'')+'><table class="wcs-data-table '+classes(options.className)+'"><caption class="sr-only">'+escape(label)+'</caption><thead><tr>'+columns.map(column=>'<th scope="col" class="'+columnClass(column)+'">'+(column.visuallyHidden?'<span class="sr-only">'+escape(column.label)+'</span>':escape(column.label))+'</th>').join('')+'</tr></thead><tbody>'+(hasState?'':rows.map(row=>'<tr class="wcs-data-table-row '+classes(row.className)+'"'+(row.id!=null?' data-record-key="'+escape(row.id)+'"':'')+'>'+columns.map((column,index)=>'<td class="'+columnClass(column)+'">'+content(row.cells?.[index])+'</td>').join('')+'</tr>').join(''))+'</tbody></table></div>'+(hasState?state:'')+'</div>';
  }
  return Object.freeze({render,html,escape});
});
