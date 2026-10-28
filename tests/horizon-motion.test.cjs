'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const cssFiles=['styles.css','ui.css','document-export-ui.css','add-document-widget.css','loading-overlay.css','article-discussion.css'];
const source=cssFiles.map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
const markup='<main id="wcspedia"><div class="wcs-skeleton-card"><i></i></div><button id="save" aria-busy="true" data-wcs-busy-indicator><span class="wcs-button-spinner"></span></button><button id="idle" disabled>Access unavailable</button><span class="wcs-search-spinner"></span><span class="wcs-export-spinner"></span></main><div class="wcs-add-document"><button aria-busy="true" data-wcs-busy-indicator><span class="wcs-button-spinner"></span></button></div><div class="wcs-add-document-popover">Menu</div><div class="wcs-loading-overlay is-indeterminate"><div class="wcs-loading-fill"></div></div><div class="wcs-article-discussion"><button data-vote="yes" aria-pressed="true" class="wcs-discussion-reaction"><svg></svg></button></div>';
for(const reduced of [false,true])test('loading remains animated with reduced motion '+reduced+' while decorative effects respect it',()=>{
 const parser=new JSDOM('<style>'+source+'</style>');
 // Resolve the preference explicitly, since JSDOM does not evaluate media queries.
 function rules(list){return [...list].flatMap(rule=>{
  if(rule.type===4)return /prefers-reduced-motion\s*:\s*reduce/.test(rule.conditionText)&&reduced?rules(rule.cssRules):[];
  return [rule.cssText];
 }).join('\n');}
 const active=rules(parser.window.document.styleSheets[0].cssRules);parser.window.close();
 const dom=new JSDOM('<style>'+active+'</style>'+markup);try{
  const w=dom.window;
  for(const [selector,name] of [['#save .wcs-button-spinner','wcs-button-spin'],['.wcs-add-document .wcs-button-spinner','wcs-button-spin'],['.wcs-search-spinner','wcs-search-spin'],['.wcs-export-spinner','wcs-export-spin'],['.wcs-loading-fill','wcs-loading-sweep'],['.wcs-skeleton-card i','wcs-skeleton-sweep']]){
   assert.match(w.getComputedStyle(w.document.querySelector(selector)).animation,new RegExp(name),'Functional loading: '+selector);
  }
  assert.equal(w.document.querySelector('#idle .wcs-button-spinner'),null);
  if(reduced){assert.equal(w.getComputedStyle(w.document.querySelector('.wcs-add-document-popover')).animation,'none');assert.equal(w.getComputedStyle(w.document.querySelector('.wcs-discussion-reaction svg')).animation,'none');}
 }finally{dom.window.close();}
});
