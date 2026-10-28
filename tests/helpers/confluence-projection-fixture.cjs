'use strict';
// Test-only native attachment REST simulation. Never deploy.
function projectionFixture(options={}){
 const root=options.rootPageId||'101',filename=options.filename||'wcspedia-published.json',state={id:'900',version:1,versions:new Map([[1,Buffer.from('{}\n')]]),posts:0,calls:[],...options};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 function matches(url){const u=new URL(url);return u.pathname==='/confluence/rest/api/content/'+root+'/child/attachment'&&u.searchParams.get('filename')===filename||u.pathname==='/confluence/rest/api/content/'+root+'/child/attachment/'+state.id+'/data'||u.pathname==='/confluence/download/attachments/'+root+'/'+filename;}
 async function fetcher(url,init={}){
  const u=new URL(url),method=init.method||'GET';state.calls.push({url,method,headers:init.headers,body:init.body});
  if(u.pathname.endsWith('/child/attachment')&&method==='GET'){if(state.missing)return json({results:[]});return json({results:[{id:state.id,title:filename,version:{number:state.version}}]});}
  if(u.pathname.endsWith('/data')&&method==='POST'){
    state.posts++;if(state.failBeforePost){state.failBeforePost=false;throw Error('Connection lost before receiving request');}
    const bytes=Buffer.from(await init.body.get('file').arrayBuffer());state.version++;state.versions.set(state.version,state.corruptUpload?Buffer.from('different bytes'):bytes);
    if(state.losePost){state.losePost=false;throw Error('Upload committed but response lost');}
    return json({id:state.id,title:filename,version:{number:state.version}});
  }
  if(u.pathname.endsWith('/'+filename)){const v=Number(u.searchParams.get('version'));return new Response(state.versions.get(v)||'not found',{status:state.versions.has(v)?200:404});}
  throw Error('Unmocked projection route '+method+' '+url);
 }
 return {state,fetch:fetcher,matches};
}
module.exports={projectionFixture};
