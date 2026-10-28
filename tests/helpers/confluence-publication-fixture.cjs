'use strict';
// Local REST simulation only; never deploy this fixture.
const {createPublisher,AREAS}=require('../../confluence-publisher.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const people=[{id:'author',name:'Author',role:'Author'},{id:'manager',name:'Manager',role:'Manager'}];
function document(){return {id:'wcs-doc-test',reference:'WCS-JA-001',area:AREAS[0],type:'Job aid',ownerId:'author',authorId:'author',reviewerId:'manager',approverId:'manager',audit:[],publishedVersion:null,versions:[{version:1,revision:1,title:'Credit approval checklist',summary:'A clear checklist.',status:'Draft',createdBy:'author',bodyMarkdown:'## Checklist\n\nCheck the record.',sections:[{id:'checklist',title:'Checklist',paragraphs:['Check the record.'],bullets:[]}],tags:['Credit'],processes:['Approval'],regions:['EMEA']}]};}
function approved(doc){doc=copy(doc);const v=doc.versions.at(-1);Object.assign(v,{status:'Published',reviewedBy:'manager',reviewedAt:'2026-10-15T10:00:00.000Z',reviewedRevision:v.revision,approvedBy:'manager',approvedAt:'2026-10-15T11:00:00.000Z'});doc.publishedVersion=v.version;doc.audit.push({id:'approval-'+v.version,documentKey:doc.id,action:'approve',version:v.version,revision:v.revision,actorId:'manager',at:v.approvedAt});return doc;}
function fixture(options={}){
 const pages=new Map(),calls=[],entries=new Map(),queues=new Map();let nextId=1000;const areaPageIds=Object.fromEntries(AREAS.map((a,i)=>[a,String(200+i)]));
 function add(id,parent,body=''){const p={id,type:'page',status:'current',title:'Page '+id,space:{key:'WCS'},ancestors:parent?[{id:parent}]:[],version:{number:1},body:{storage:{value:body}},labels:[],attachments:[]};pages.set(id,p);return p;}
 add('100');add('101');Object.values(areaPageIds).forEach(a=>add(a,'101'));
 const journal={async get(k){return copy(entries.get(k)||null);},async set(k,v){entries.set(k,copy(v));},async withLock(k,fn){const previous=queues.get(k)||Promise.resolve();let done;const own=new Promise(r=>done=r);queues.set(k,own);await previous;try{return await fn();}finally{done();}}};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 async function fetcher(url,init={}){
  const u=new URL(url),method=init.method||'GET',route=u.pathname.replace('/confluence',''),body=typeof init.body==='string'?JSON.parse(init.body):init.body;calls.push({method,route,body,url,headers:init.headers});
  if(options.intercept){const r=await options.intercept({url:u,route,method,body,pages,calls});if(r)return r;}
  let match;
  if((match=route.match(/^\/rest\/api\/content\/(\d+)\/restriction\/byOperation\/read$/)))return json({operation:'read',restrictions:{user:{results:[]},group:{results:options.unrestricted?[]:[{name:'authors'}]}}});
  if(route==='/rest/api/content'&&method==='GET')return json({results:[...pages.values()].filter(p=>p.title===u.searchParams.get('title')).map(copy)});
  if(route==='/rest/api/content'&&method==='POST'){const p=add(String(nextId++),body.ancestors[0].id,body.body.storage.value);p.title=body.title;if(options.loseCreate){options.loseCreate=false;throw Error('lost response');}return json(copy(p));}
  if((match=route.match(/^\/rest\/api\/content\/(\d+)$/))){const p=pages.get(match[1]);if(!p)return json({},404);if(method==='GET')return json(copy(p));if(method==='DELETE'){pages.delete(p.id);return new Response(null,{status:204});}if(method==='PUT'){if(body.version.number!==p.version.number+1)return json({},409);Object.assign(p,{title:body.title,version:{number:body.version.number},ancestors:body.ancestors,body:body.body});if(options.loseUpdate){options.loseUpdate=false;throw Error('lost response');}return json(copy(p));}}
  if((match=route.match(/^\/rest\/api\/content\/(\d+)\/label$/))){const p=pages.get(match[1]);if(method==='GET')return json({results:p.labels.map(name=>({name}))});if(method==='DELETE'){p.labels=p.labels.filter(n=>n!==u.searchParams.get('name'));return new Response(null,{status:204});}for(const l of body)if(!p.labels.includes(l.name))p.labels.push(l.name);return json(body);}
  if((match=route.match(/^\/rest\/api\/content\/(\d+)\/child\/attachment$/))){const p=pages.get(match[1]);if(method==='GET')return json({results:p.attachments.filter(a=>a.title===u.searchParams.get('filename')).map(a=>({id:a.id,title:a.title,version:a.version}))});const file=body.get('file'),attachment={id:String(nextId++),title:file.name,version:{number:1},bytes:Buffer.from(await file.arrayBuffer())};p.attachments.push(attachment);return json({results:[{id:attachment.id,title:attachment.title,version:attachment.version}]});}
  if((match=route.match(/^\/download\/attachments\/(\d+)\/([^/]+)$/))){const a=pages.get(match[1]).attachments.find(a=>a.title===decodeURIComponent(match[2]));return new Response(a.bytes);}
  throw Error('Unmocked '+method+' '+route);
 }
 const config={baseUrl:'https://confluence.test/confluence',spaceKey:'WCS',workingRootPageId:'100',publishedRootPageId:'101',areaPageIds,journal,fetch:fetcher,renderStorage:(d,v)=>'<h2>'+v.title+'</h2><p>'+v.bodyMarkdown+'</p>',collectMedia:()=>[]};
 return {config,pages,calls,entries,journal,options,publisher:createPublisher(config)};
}
const args=doc=>({document:doc,people,requestId:'request-1'});

module.exports={fixture,document,approved,people,args};
