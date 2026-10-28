'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'library-loader.js'),'utf8');
function fixture(){const nodes=[],context=vm.createContext({URL,Map,Promise,setTimeout,clearTimeout,location:{href:'https://example.test/confluence/pages/viewpage.action?pageId=1',origin:'https://example.test'},document:{createElement(){return {setAttribute(){},remove(){this.removed=true;}};},head:{appendChild(node){nodes.push(node);}}}});vm.runInContext(source,context);return {context,nodes,loader:context.WCSLibraryLoader};}
test('navBar and repeated page pairs share one lazy in-flight library load',async()=>{
 const f=fixture();assert.equal(f.nodes.length,0);const a=f.loader.load('/confluence/download/attachments/1/core.js');vm.runInContext(source,f.context);const b=f.context.WCSLibraryLoader.load('https://example.test/confluence/download/attachments/1/core.js');
 assert.equal(a,b);assert.equal(f.nodes.length,1);f.nodes[0].onload();await Promise.all([a,b]);await f.loader.load('/confluence/download/attachments/1/core.js');assert.equal(f.nodes.length,1);
});
test('shared loader rejects foreign scripts and supports retry after attachment failure',async()=>{
 const f=fixture();await assert.rejects(f.loader.load('https://cdn.jsdelivr.net/a.js'));assert.equal(f.nodes.length,0);
 let attempt=f.loader.load('/confluence/download/attachments/1/core.js');f.nodes[0].onerror();await assert.rejects(attempt,/could not be loaded/);assert.equal(f.nodes[0].removed,true);
 attempt=f.loader.load('/confluence/download/attachments/1/core.js');assert.equal(f.nodes.length,2);f.nodes[1].onload();await attempt;
});
test('a library timeout releases its pending registry entry',async()=>{
 const f=fixture();await assert.rejects(f.loader.load('/slow.js',5),/timed out/);assert.equal(f.nodes[0].removed,true);
 const retry=f.loader.load('/slow.js',100);f.nodes[1].onload();await retry;
});
test('all pinned vendor attachments match recorded checksums and attachment limits',()=>{
 const entries=JSON.parse(fs.readFileSync(path.join(root,'vendor/library-sources.json')));assert.equal(entries.filter(e=>e.file.endsWith('.js')).length,5);
 for(const item of entries){const bytes=fs.readFileSync(path.join(root,'vendor',item.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);assert.equal(bytes.length,item.bytes);assert.ok(bytes.length<10000000);assert.match(item.integrity,/^sha512-/);assert.match(item.source,/^https:\/\/registry\.npmjs\.org\//);}
});
test('real vendored browser libraries initialize in dependency order without a CDN',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'outside-only',url:'https://example.test/confluence/'});
 try{const w=dom.window;for(const file of ['highcharts-13.1.0.js','highcharts-13.1.0-accessibility.js','pdfmake-0.2.20.min.js','pdfmake-0.2.20-vfs-fonts.js','docx-9.5.1.iife.js'])w.eval(fs.readFileSync(path.join(root,'vendor',file),'utf8'));
 assert.equal(w.Highcharts.version,'13.1.0');assert.equal(typeof w.Highcharts.chart,'function');assert.ok(w.Highcharts.AccessibilityComponent);assert.equal(typeof w.pdfMake.createPdf,'function');assert.equal(typeof w.docx.Packer.toBlob,'function');
 }finally{dom.window.close();}
});
