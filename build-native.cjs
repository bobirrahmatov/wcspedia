/* Optional native-page experiment. Never overwrites the established UI. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const out = path.join(__dirname, 'experimental-native');
fs.mkdirSync(out, {recursive:true});
const write = (name, value) => fs.writeFileSync(path.join(out, name), value);
const css = read('wcspedia-style.css') + '\n' + read('native-app.css');
const files = ['ui.js','data-table.js','pagination.js','native-confluence.js','native-content.js','native-app.js'];
const bundle = '/* OPTIONAL EXPERIMENT: not the default WCSpedia interface. */\n' +
  '(function(){if(window.WCSNativeApp)return;\n' + files.map(file =>
    '\n/* Source: '+file+' */\n'+(file==='ui.js'?'if(!window.WCSUI){\n'+read(file)+'\n}':read(file))+'\n;'
  ).join('\n')+'\n})();\n';
const revision = crypto.createHash('sha256').update(css).update(bundle).digest('hex').slice(0,12);
write('wcspedia-native-style.css', css);
write('wcspedia-native.js', bundle);
write('native-confluence-config.js', read('native-confluence/shared-config.js'));
const macros = {
  'library-macro.html':'library-macro.html',
  'my-workspace-macro.html':'my-workspace-macro.html',
  'reviewer-workspace-macro.html':'reviewer-workspace-macro.html',
  'saved-items-macro.html':'saved-items-macro.html',
  'add-document-widget-macro.html':'add-document-widget-macro.html',
  'document-controls-macro.html':'document-controls-macro.html'
};
for(const [name,source] of Object.entries(macros)) write(name,read('native-confluence/'+source)
  .replace(/wcspedia-style\.css/g,'wcspedia-native-style.css')
  .replace(/\?api=v2/g,'?api=v2&amp;v='+revision));
write('native-build-manifest.json',JSON.stringify({
  mode:'experimental-native-page', revision,
  assets:['wcspedia-native-style.css','wcspedia-native.js','native-confluence-config.js'],
  macros:Object.keys(macros),
  status:'Optional adapter experiment. Does not replace the established design or default deployment.',
  workflow:'Requires configured trusted server integration'
},null,2)+'\n');
write('README.md','# Optional native-page experiment\n\nThis is not the WCSpedia interface selected by the user. Do not replace the root Confluence macros or shared stylesheet with these files. The established design uses `wcspedia.js` and `wcspedia-style.css`.\n\nNative REST/CQL client work is retained for integration behind that design. The simplified experimental screens are not the deployment target. See `../native-confluence/NATIVE-CONFLUENCE-SETUP.md` for its separate development contract.\n');
console.log('Built optional native experiment in experimental-native/; default files unchanged.');
