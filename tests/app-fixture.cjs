/* Shared DOM fixture for local entry-point integration checks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {serializeURL}=require('whatwg-url');
const directory=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(directory,file),'utf8');
const dataset=JSON.parse(read('wcspedia-data.json'));
const files={home:'wcspedia-local.html',mine:'wcspedia-my-workspace.html',review:'wcspedia-reviewer-workspace.html',saved:'wcspedia-saved-items.html',entitlements:'wcspedia-entitlements.html',faq:'wcspedia-faq.html'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const STORE='wcspedia.governed.v4';
async function fixture({role='home',hash='',actor='alex',stored,policy,dataOverride,sourceMode=false,configureWindow}={}){
  const errors=[],navigation=[],charts=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(read(files[role]),{url:'http://localhost:4173/'+files[role]+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window,d=w.document;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};w.matchMedia=()=>({matches:false});
  for(const method of ['alert','confirm','prompt'])w[method]=()=>{throw Error('Native '+method+' dialog is not permitted.');};
  const impl=Object.getOwnPropertySymbols(w.location).find(symbol=>String(symbol)==='Symbol(impl)'),nativeNavigate=w.location[impl]._locationObjectNavigate.bind(w.location[impl]);w.location[impl]._locationObjectNavigate=(url,options)=>{const next=serializeURL(url);if(next.split('#')[0]===w.location.href.split('#')[0])nativeNavigate(url,options);else navigation.push(next);};
  for(const script of d.querySelectorAll('script:not([src])'))w.eval(script.textContent);
  assert.equal(w.WCS_CONFIG.pageRole,role,'Entry HTML must select its own page');
  const styleURL=new URL(d.querySelector('link[rel=stylesheet]').getAttribute('href'),w.location.href);
  assert.equal(styleURL.origin,w.location.origin,'Entry page loads its local shared stylesheet');
  assert.equal(styleURL.pathname,'/wcspedia-style.css');
  assert.match(styleURL.searchParams.get('v')||'',/^[a-f0-9]{12}$/,'Shared stylesheet URL carries the build revision');
  const bundle=[...d.querySelectorAll('script[src]')].find(script=>new URL(script.getAttribute('src'),w.location.href).pathname==='/wcspedia.js');
  assert.ok(bundle,'Entry page loads the shared deployment bundle');
  const bundleURL=new URL(bundle.getAttribute('src'),w.location.href);
  assert.equal(bundleURL.origin,w.location.origin,'Entry page loads its local shared deployment bundle');
  assert.equal(bundleURL.searchParams.get('v'),styleURL.searchParams.get('v'),'CSS and JavaScript share one build revision');
  w.WCSData=JSON.parse(JSON.stringify(dataOverride||dataset));w.WCS_CONFIG.mode='embedded';w.WCS_CONFIG.charts={...w.WCS_CONFIG.charts,offline:true};
  w.Highcharts={Accessibility:function(){},chart(element,options){const record={element,options,destroyed:false,reflows:0};charts.push(record);return {destroy(){record.destroyed=true;},reflow(){record.reflows++;}};}};
  if(stored)w.localStorage.setItem(STORE,typeof stored==='string'?stored:JSON.stringify(stored));
  if(policy)w.localStorage.setItem(STORE+'.entitlements',JSON.stringify(policy));w.localStorage.setItem(STORE+'.actor',actor);
  if(configureWindow)await configureWindow(w,d);
  const modules=['notifications.js','scroll-tools.js','vendor/markdown-it-15.0.2.min.js','search.js','data-table.js','workspace-table.js','ui.js','editor-content.js','document-metrics.js','view-counts.js','document-export.js','document-export-ui.js','entitlements.js','pagination.js','governance.js','governance-ui.js','workflow.js','discovery.js','confluence.js','editor.js','navigation.js','workspace-charts.js','suggestions.js','add-document-widget.js','entitlements-page.js','bookmarks.js','content-health.js','health-service.js','content-health-ui.js','library-workflows.js','loading-overlay.js','insights.js','faq.js','app.js'];
  try{if(sourceMode){for(const file of modules)await w.eval(read(file));}else await w.eval(read('wcspedia.js'));}catch(error){dom.window.close();throw error;}
  await tick();await tick();
  const root=d.getElementById('wcspedia'),find=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
  const input=(selector,value)=>{const el=find(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));return el;};
  const navigate=async hash=>{w.location.hash=hash;await tick();await tick();};
  const submit=async selector=>{const form=find(selector);assert.ok(form,selector);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();};
  const policyChange=async next=>{const value=JSON.stringify(next);w.localStorage.setItem(STORE+'.entitlements',value);w.dispatchEvent(new w.StorageEvent('storage',{key:STORE+'.entitlements',newValue:value,storageArea:w.localStorage}));await tick();await tick();};
  const close=()=>dom.window.close();
  return {w,d,root,find,all,input,navigate,submit,policyChange,close,errors,navigation,charts};
}
module.exports={fixture,read,dataset,files,tick,STORE};
