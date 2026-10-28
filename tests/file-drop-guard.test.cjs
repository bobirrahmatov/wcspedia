'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../file-drop-guard.js'),'utf8');

function setup(url='/confluence/spaces/wcspedia/pages/123/Article',meta='') {
  const dom=new JSDOM(meta+'<div id="target" contenteditable="true"></div><input type="file">',{
    runScripts:'outside-only',url:'https://example.test'+url
  });
  const w=dom.window, calls=[];
  w.WCS_FILE_DROP_CONFIG={enabled:true,spaceKey:'wcspedia'};
  w.WCSNotifications={show:(...args)=>calls.push(args)};
  // Simulate Confluence listeners already registered on the document.
  let uploads=0;
  w.document.addEventListener('drop',()=>uploads++,true);
  w.document.addEventListener('drop',()=>uploads++);
  w.eval(source);
  function drag(type='drop',transfer={types:['Files'],items:[],files:[]}) {
    const event=new w.Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:transfer});
    w.document.getElementById('target').dispatchEvent(event);
    return event;
  }
  return {dom,w,calls,drag,uploads:()=>uploads};
}

test('file gestures are cancelled before native upload handlers, including protected pre-drop data',()=>{
  const f=setup();
  try {
    for(const type of ['dragenter','dragover','drop']) {
      const event=f.drag(type);
      assert.equal(event.defaultPrevented,true);
      assert.equal(event.dataTransfer.dropEffect,'none');
    }
    assert.equal(f.uploads(),0);
    assert.equal(f.calls.length,1);
    assert.match(f.calls[0][0],/upload button/);
  } finally {f.dom.window.close();}
});

test('recognizes file items and file lists without mistaking text/link drags for files',()=>{
  const f=setup();
  try {
    for(const transfer of [{items:[{kind:'file'}]},{files:[{name:'report.pdf'}]}]) {
      assert.equal(f.drag('drop',transfer).defaultPrevented,true);
    }
    for(const transfer of [null,{}, {types:['text/plain'],items:[{kind:'string'}]}, {types:['text/uri-list','text/html']}]) {
      assert.equal(f.drag('drop',transfer).defaultPrevented,false);
    }
    assert.equal(f.uploads(),8);
  } finally {f.dom.window.close();}
});

test('deduplicates header inclusion and notices; file picker and clipboard are unaffected',()=>{
  const f=setup();
  try {
    const instance=f.w.WCSFileDropGuard;
    f.w.eval(source);
    assert.equal(f.w.WCSFileDropGuard,instance);
    f.drag();f.drag();
    assert.equal(f.calls.length,1);
    let changes=0,pastes=0;
    const input=f.w.document.querySelector('input');
    input.addEventListener('change',()=>changes++);
    input.dispatchEvent(new f.w.Event('change',{bubbles:true}));
    f.w.document.addEventListener('paste',()=>pastes++);
    const paste=new f.w.Event('paste',{bubbles:true,cancelable:true});
    f.w.document.getElementById('target').dispatchEvent(paste);
    assert.equal(changes,1);assert.equal(pastes,1);assert.equal(paste.defaultPrevented,false);
  } finally {f.dom.window.close();}
});

test('space scope follows native metadata, pretty URLs and native editor query strings',()=>{
  for(const [url,meta,expected] of [
    ['/confluence/pages/viewpage.action?pageId=123','<meta name="ajs-space-key" content="wcspedia">',true],
    ['/confluence/pages/viewpage.action?pageId=123','',false],
    ['/confluence/display/wcspedia/Article','',true],
    ['/confluence/pages/createpage.action?spaceKey=wcspedia&fromPageId=123','',true],
    ['/confluence/spaces/other/pages/1/Article','',false],
    ['/confluence/spaces/wcspedia/pages/1/Article','<meta name="ajs-space-key" content="other">',false]
  ]) {
    const f=setup(url,meta);
    try {assert.equal(f.drag().defaultPrevented,expected,url);} finally {f.dom.window.close();}
  }
});

test('supports AJS metadata and stops applying after navigation or explicit disable',()=>{
  const f=setup('/confluence/pages/viewpage.action?pageId=123');
  try {
    let key='wcspedia';f.w.AJS={Meta:{get:()=>key}};
    assert.equal(f.drag().defaultPrevented,true);
    key='other';assert.equal(f.drag().defaultPrevented,false);
    key='wcspedia';f.w.WCS_FILE_DROP_CONFIG.enabled=false;
    assert.equal(f.drag().defaultPrevented,false);
  } finally {f.dom.window.close();}
});

test('blocking does not depend on notification delivery, REST or timers',()=>{
  const f=setup();
  try {
    f.w.WCSNotifications.show=()=>{throw Error('toast unavailable');};
    f.w.fetch=()=>{throw Error('unexpected request');};
    f.w.setTimeout=()=>{throw Error('unexpected timer');};
    assert.equal(f.drag().defaultPrevented,true);
    assert.equal(f.uploads(),0);
  } finally {f.dom.window.close();}
});
