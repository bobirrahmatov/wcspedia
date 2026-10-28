/* Run with jsdom available, e.g. NODE_PATH=/tmp/wcspedia-ui-tests/node_modules
 * node --test library-workflows.test.cjs. Uses the production orchestrator with
 * controlled service promises to exercise browser lifecycle races. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let jsdomPath;
try{jsdomPath=require.resolve('jsdom');}catch(error){if(error.code!=='MODULE_NOT_FOUND'||!error.message.startsWith("Cannot find module 'jsdom'"))throw error;}
// Only an absent optional dependency is skipped. An installed package that
// fails to load (including one of its dependencies) must fail the test suite.
const JSDOM=jsdomPath?require(jsdomPath).JSDOM:undefined;
const domTest=(name,run)=>test(name,{skip:!jsdomPath&&'Optional DOM test: install jsdom or set NODE_PATH.'},run);
const source=fs.readFileSync(__dirname+'/library-workflows.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const state=(revision,saved)=>({available:true,revision,bookmarks:saved?[{documentId:'doc-a',savedAt:'2026-10-15T12:00:00.000Z'}]:[]});
function setup(t,initial=state(0,false)){
  const dom=new JSDOM('<!doctype html><main id="wcspedia"></main>',{url:'https://example.test/confluence/page#/document/doc-a',runScripts:'outside-only'}),w=dom.window,container=w.document.querySelector('main');
  const doc={id:'doc-a',reference:'WCS-JA-001',type:'Job aid',ownerId:'alex',publishedVersion:1,versions:[{version:1,revision:1,status:'Published',title:'Current approved document',summary:'Current instructions.'}]};
  let identity={soeid:'AM12345'},configError=false,library,refreshes=0,mountedHealth;
  const calls=[],notices=[],created=[],loads=[],sets=[],healthLoads=[],healthSets=[];
  w.WCSDataTable=require('./data-table.js');
  w.WCSContentHealth={evaluate:(d,record)=>({tag:record?.tag||'Healthy',assigneeId:'alex'}),initial:()=>({tag:'Healthy'}),permissions:()=>({canManage:true,canAct:true})};
  w.WCSContentHealthUI={tag:report=>'<span>'+report.tag+'</span>',mount:(host,options)=>{mountedHealth=options;return {destroy(){}};}};
  w.WCSPagination={render:()=>''};
  w.WCSBookmarks={create(options){
    if(!options.identity)throw Error('Sign in with a valid SOEID.');
    if(configError)throw Error('The bookmarks service URL is invalid.');
    const who=options.identity.soeid;created.push(who);let current=who==='AM12345'?initial:state(0,false);
    return {load:()=>loads.length?loads.shift().promise:Promise.resolve(current),resolve:s=>s.available?s.bookmarks.map(item=>({...item,doc,version:doc.versions[0]})):[],set(id,saved,command){calls.push({who,id,saved,command});if(sets.length)return sets.shift().promise;current=state(command.expectedRevision+1,saved);return Promise.resolve(current);}};
  }};
  w.WCSHealthService={create(options){if(!options.identity)throw Error('Health identity unavailable.');return {load:()=>healthLoads.length?healthLoads.shift().promise:Promise.resolve({'doc-a':{tag:'Healthy'}}),submit:()=>healthSets.length?healthSets.shift().promise:Promise.resolve({tag:'Review due'})};}};
  w.eval(source);
  function render(){refreshes++;container.innerHTML=library.bookmarkButton(doc);}
  library=w.WCSLibraryWorkflows.create({container,config:{mode:'confluence'},storage:{},publishedVersion:d=>d?.versions[0],url:path=>'#'+path,documentHref:()=> '#/document/doc-a',date:value=>value,go:()=>{},notify:value=>notices.push(value),refresh:render,context:()=>({identity,documents:[doc],people:[{id:'alex',name:'Alex'}],actor:{id:'alex',role:'Author'},canRead:()=>true,canEdit:()=>true})});
  t.after(()=>{library.destroy();dom.window.close();});
  return {library,w,container,doc,calls,notices,created,loads,sets,healthLoads,healthSets,render,refreshes:()=>refreshes,button:()=>container.querySelector('[data-library-action=bookmark]'),identity:value=>{identity=value;},configError:value=>{configError=value;},mountedHealth:()=>mountedHealth};
}
domTest('identity reset immediately clears and disables previous saved state while the new identity loads',async t=>{
  const f=setup(t,state(4,true));await f.library.load(true);f.render();assert.equal(f.button().getAttribute('aria-pressed'),'true');
  const pending=deferred();f.loads.push(pending);f.identity({soeid:'JL12345'});const loading=f.library.load(true);
  assert.equal(f.button().disabled,true);assert.equal(f.button().getAttribute('aria-pressed'),'false');
  f.button().dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));assert.equal(f.calls.length,0);
  pending.resolve(state(0,false));await loading;f.render();assert.equal(f.button().disabled,false);assert.equal(f.button().getAttribute('aria-pressed'),'false');assert.deepEqual(f.created,['AM12345','JL12345']);
});
domTest('missing identity and invalid configuration leave a usable unavailable view without rejecting app load',async t=>{
  const f=setup(t);f.identity(null);await assert.doesNotReject(f.library.load(true));f.render();assert.equal(f.button().disabled,true);
  assert.match(f.library.workspace('saved',new URLSearchParams()),/Saved items are unavailable/);
  f.identity({soeid:'AM12345'});f.configError(true);await assert.doesNotReject(f.library.load(true));f.render();assert.equal(f.button().disabled,true);assert.match(f.library.workspace('saved',new URLSearchParams()),/service URL is invalid/);
  assert.equal(f.library.report(f.doc).tag,'Healthy','one failed service does not discard the other service');
});
domTest('bookmark completion after navigation updates known state without refreshing an active editor or announcing success',async t=>{
  const f=setup(t);await f.library.load(true);f.render();const pending=deferred();f.sets.push(pending);f.button().click();assert.equal(f.calls.length,1);
  const refreshes=f.refreshes();f.w.location.hash='#/edit/doc-a';f.container.innerHTML='<textarea>Unsaved document work</textarea>';pending.resolve(state(1,true));await tick();
  assert.equal(f.refreshes(),refreshes);assert.deepEqual(f.notices,[]);assert.equal(f.container.querySelector('textarea').value,'Unsaved document work');
  f.w.location.hash='#/document/doc-a';f.render();assert.equal(f.button().getAttribute('aria-pressed'),'true');
});
domTest('a delayed load cannot overwrite a higher revision confirmed by a newer save',async t=>{
  const f=setup(t);await f.library.load(true);f.render();const pending=deferred();f.loads.push(pending);const loading=f.library.load();
  f.button().click();await tick();assert.equal(f.button().getAttribute('aria-pressed'),'true');assert.equal(f.calls[0].command.expectedRevision,0);
  pending.resolve(state(0,false));await loading;f.render();assert.equal(f.button().getAttribute('aria-pressed'),'true');
  f.button().click();await tick();assert.equal(f.calls[1].saved,false);assert.equal(f.calls[1].command.expectedRevision,1);assert.equal(f.button().getAttribute('aria-pressed'),'false');
});
domTest('teardown suppresses late mutation success and failure notifications',async t=>{
  const f=setup(t);await f.library.load(true);f.render();const pending=deferred();f.sets.push(pending);f.button().click();const refreshes=f.refreshes();f.library.destroy();pending.reject(Error('Late failure'));await tick();
  assert.equal(f.refreshes(),refreshes);assert.deepEqual(f.notices,[]);
});
domTest('a delayed health list cannot overwrite a confirmed health decision',async t=>{
  const f=setup(t);await f.library.load(true);f.container.innerHTML='<div data-content-health="doc-a"></div>';f.library.mount(f.container);
  const pending=deferred();f.healthLoads.push(pending);const loading=f.library.load();
  await f.mountedHealth().save({action:'assign'});assert.equal(f.library.report(f.doc).tag,'Review due');
  pending.resolve({'doc-a':{tag:'Healthy'}});await loading;assert.equal(f.library.report(f.doc).tag,'Review due');
});
domTest('Saved retry succeeds independently when the optional health service is unavailable',async t=>{
  const f=setup(t);await f.library.load(true);
  f.w.location.hash='#/saved';
  f.container.innerHTML='<button data-library-action="retry" data-library-retry="saved">Try again</button>';
  const health=deferred();f.healthLoads.push(health);
  f.container.querySelector('button').click();health.reject(Error('Health is not configured'));
  await tick();
  assert.deepEqual(f.notices,['Saved items refreshed.']);
  assert.doesNotMatch(f.library.workspace('saved',new URLSearchParams()),/Saved items are unavailable/);
});
