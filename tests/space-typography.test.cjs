const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../space-typography.js'),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,20));
function setup(t,space='wcspedia'){
 const dom=new JSDOM('<meta name="ajs-space-key" content="'+space+'"><body style="font-family:Arial,sans-serif"><div id="wcspedia"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,faces=[],calls=[],listeners=new Map();
 Object.defineProperty(w.document,'fonts',{value:{forEach:fn=>faces.forEach(fn),load:descriptor=>{calls.push(descriptor);return Promise.resolve([])},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}});
 t.after(()=>{w.WCSSpaceTypography?.destroy();w.close()});return {w,faces,calls,listeners,style:w.document.documentElement.style};
}
test('resolves registered Citi font names, deduplicates loads and excludes temporary host fallback fonts',async t=>{
 const {w,faces,calls,style}=setup(t);faces.push({family:'"Citi-Sans-Text"'},{family:'Citi Sans Display'});w.eval(source);await settle();
 assert.equal(style.getPropertyValue('--wcs-resolved-space-font'),'"Citi-Sans-Text"');assert.match(style.getPropertyValue('--wcs-resolved-space-display-font'),/^"Citi Sans Display"/);assert.equal(calls.length,4);
 w.WCSSpaceTypography.refresh();w.eval(source);await settle();assert.equal(calls.length,4);assert.equal(w.document.querySelectorAll('script,link,style').length,0);
});
test('late theme fonts resolve without an external font dependency; editor and other spaces stay native',async t=>{
 const {w,faces,calls,listeners,style}=setup(t);w.eval(source);await settle();assert.equal(style.getPropertyValue('--wcs-resolved-space-font'),'"Citi-Sans-Text"');assert.equal(calls.length,0);
 faces.push({family:'Citi-Sans-Text'});listeners.get('loadingdone')();await settle();assert.match(style.getPropertyValue('--wcs-resolved-space-font'),/Citi-Sans-Text/);
 w.document.body.classList.add('contenteditor');await settle();assert.equal(style.getPropertyValue('--wcs-resolved-space-font'),'');
 w.document.body.classList.remove('contenteditor');await settle();assert.match(style.getPropertyValue('--wcs-resolved-space-font'),/Citi-Sans-Text/);
 w.document.querySelector('meta').content='another-space';await settle();assert.equal(style.getPropertyValue('--wcs-resolved-space-font'),'');
});
test('destroy restores preexisting font variables and removes late-font hooks',async t=>{
 const {w,style,listeners}=setup(t);style.setProperty('--wcs-resolved-space-font','ExistingFont','important');const priority=style.getPropertyPriority('--wcs-resolved-space-font');w.eval(source);await settle();w.WCSSpaceTypography.destroy();assert.equal(style.getPropertyValue('--wcs-resolved-space-font'),'ExistingFont');assert.equal(style.getPropertyPriority('--wcs-resolved-space-font'),priority);assert.equal(listeners.size,0);
});
