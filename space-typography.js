/* PAL-compatible host typography. Uses only fonts already registered by the
 * Confluence theme; no font URLs, header replacement or sidebar activation. */
(function(w,d){
 'use strict';
 if(w.WCSSpaceTypography){w.WCSSpaceTypography.refresh();return;}
 var queued=false,observer,owned=new Map(),requested=new Set(),destroyed=false;
 function active(){
  if(d.querySelector('#editpageform,#content-editor,body.contenteditor'))return false;
  var space=d.querySelector('meta[name="ajs-space-key"],meta[name="confluence-space-key"]')?.content;
  var c=w.WCS_CONFIG||w.WCS_ARTICLE_DISCUSSION_CONFIG||w.WCS_ADD_DOCUMENT_CONFIG||{};
  if(space&&space!==(c.spaceKey||'wcspedia'))return false;
  return space===(c.spaceKey||'wcspedia')||!!d.querySelector('#wcspedia,.wcs-native-article');
 }
 function set(name,value){
  if(!value||d.documentElement.style.getPropertyValue(name)===value)return;
  if(!owned.has(name))owned.set(name,[d.documentElement.style.getPropertyValue(name),d.documentElement.style.getPropertyPriority(name)]);
  d.documentElement.style.setProperty(name,value);
 }
 function reset(){owned.forEach(function(value,name){if(value[0])d.documentElement.style.setProperty(name,value[0],value[1]);else d.documentElement.style.removeProperty(name);});owned.clear();}
 function registered(role){var found='';d.fonts?.forEach?.(function(face){var name=face.family.replace(/["']/g,'');if(new RegExp('^citi[ -]sans[ -]'+role+'$','i').test(name))found=name;});return found;}
 function requestFont(name){
  if(!name||!d.fonts?.load)return;
  ['400','700'].forEach(function(weight){var descriptor=weight+' 16px '+JSON.stringify(name);if(requested.has(descriptor))return;requested.add(descriptor);d.fonts.load(descriptor).then(schedule,function(){});});
 }
 function refresh(){
  if(destroyed||!d.body)return;if(!active()){reset();return;}
  var text=registered('text'),display=registered('display');
  // These exact families are registered in the space Look and Feel stylesheet.
  // Keep them first even before a late stylesheet registers its FontFace entries.
  // Do not copy a temporary body/theme fallback (for example Inter) into the app.
  set('--wcs-resolved-space-font',JSON.stringify(text||'Citi-Sans-Text'));
  set('--wcs-resolved-space-display-font',JSON.stringify(display||'Citi-Sans-Display')+', '+JSON.stringify(text||'Citi-Sans-Text'));
  requestFont(text);requestFont(display);
 }
 function schedule(){if(!queued&&!destroyed){queued=true;Promise.resolve().then(function(){queued=false;refresh();});}}
 function start(){refresh();if(observer||!d.body)return;observer=new MutationObserver(function(changes){if(changes.some(function(c){return c.type==='childList'?Array.from(c.addedNodes).concat(Array.from(c.removedNodes)).some(function(n){return n.nodeType===1;}):c.target===d.body||c.target===d.documentElement||c.target.matches?.('meta[name="ajs-space-key"],meta[name="confluence-space-key"]');}))schedule();});observer.observe(d.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-color-mode','data-theme','content']});}
 function stylesheetLoaded(e){if(e.target.matches?.('link[rel="stylesheet"]'))schedule();}
 function destroy(){destroyed=true;observer?.disconnect();reset();d.fonts?.removeEventListener?.('loadingdone',schedule);d.removeEventListener('load',stylesheetLoaded,true);d.removeEventListener('DOMContentLoaded',start);}
 w.WCSSpaceTypography={refresh:refresh,destroy:destroy};
 d.fonts?.addEventListener?.('loadingdone',schedule);d.addEventListener('load',stylesheetLoaded,true);d.addEventListener('DOMContentLoaded',start);if(d.body)start();
})(window,document);
