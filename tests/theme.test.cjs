const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('theme uses native tokens and never overrides the host choice or inverts artwork',()=>{
 const css=read('theme.css');assert.match(css,/data-color-mode="dark"/);assert.doesNotMatch(css,/prefers-color-scheme|filter\s*:|invert\(/);
 const files=[...read('build.cjs').match(/const css = \[(.*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 for(const file of files)assert.match(read(file),/var\(--(?:ds-|muted|navy|ink|pale|line)/,file+' adopts native tokens');
 assert.equal(files.filter(f=>f==='theme.css').length,1);
});
function rgb(hex){return hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255);}
function luminance(hex){return rgb(hex).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const vals=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (vals[0]+.05)/(vals[1]+.05);}
test('dark fallback text, links and statuses meet normal text contrast',()=>{
 const values=Object.fromEntries([...read('theme.css').matchAll(/--wcs-theme-([\w]+):\s*(#[a-f\d]{6})/g)].map(m=>[m[1],m[2]]));
 for(const foreground of ['text','muted','link'])for(const background of ['surface','subtle'])assert.ok(contrast(values[foreground],values[background])>=4.5,foreground+' on '+background);
 for(const status of ['success','warning','danger'])assert.ok(contrast(values[status],values[status+'Bg'])>=4.5,status);
});
test('native reader/sidebar, overlays and editor all use themed surfaces and text',()=>{
 for(const file of ['page-style-flags.css','reader-sidebar.css','loading-overlay.css','editor-upgrade.css','article-discussion.css','notifications.css','add-document-widget.css']){
  const css=read(file);assert.match(css,/--ds-(?:surface|background-neutral)/);assert.match(css,/--ds-text/);
 }
 assert.match(read('reader-sidebar.css'),/a\[data-wcs-native-page-link\]/);
 assert.match(read('theme.css'),/highcharts-tooltip-box/);
});
