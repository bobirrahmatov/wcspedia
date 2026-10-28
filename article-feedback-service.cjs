/* Trusted service source, never a browser attachment. All authentication and
 * native read checks run through resolveAccess on every operation, including
 * retries. One transaction contains the vote, analytics event and receipt. */
'use strict';
const {createHash,createHmac,randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const MAX_BYTES=16*1024*1024, MAX_RECORDS=100000;
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const int=v=>Number.isSafeInteger(v)&&v>=0;
const hash=v=>createHash('sha256').update(v).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function requireInput(ok,message){if(!ok)fail('FEEDBACK_INPUT',message);}
function safeISO(v){return typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function totals(votes,pageVersion){const result={yes:0,no:0,total:0};for(const vote of votes)if(pageVersion===undefined||vote.pageVersion===pageVersion){result[vote.value]++;result.total++;}return result;}

function createArticleFeedbackService(options={}){
  const {rootPageId,spaceKey,store,resolveAccess}=options;
  requireInput(id(rootPageId)&&typeof spaceKey==='string'&&spaceKey.trim()===spaceKey&&spaceKey.length>0&&spaceKey.length<=255,'Configure the exact WCSpedia root and space key.');
  requireInput(Array.isArray(options.areaPageIds)&&options.areaPageIds.length>0&&options.areaPageIds.every(id)&&new Set(options.areaPageIds).size===options.areaPageIds.length,'Configure the exact business-area page IDs.');
  const areas=new Set(options.areaPageIds);
  requireInput(!areas.has(rootPageId),'The root cannot be a business-area page.');
  const insightsPageId=options.insightsPageId==null||options.insightsPageId===''?null:options.insightsPageId;
  requireInput(insightsPageId===null||(id(insightsPageId)&&insightsPageId!==rootPageId&&!areas.has(insightsPageId)),'Configure a distinct Insights parent page ID.');
  const publishedParents=new Set(areas);if(insightsPageId)publishedParents.add(insightsPageId);
  const excludePageIds=options.excludePageIds||[],excludeAncestorIds=options.excludeAncestorIds||[];
  requireInput(Array.isArray(excludePageIds)&&excludePageIds.every(id)&&new Set(excludePageIds).size===excludePageIds.length&&Array.isArray(excludeAncestorIds)&&excludeAncestorIds.every(id)&&new Set(excludeAncestorIds).size===excludeAncestorIds.length,'Configure valid excluded page and ancestor IDs.');
  const excludedPages=new Set(excludePageIds),excludedAncestors=new Set(excludeAncestorIds);
  requireInput(store&&['get','set','withLock'].every(k=>typeof store[k]==='function')&&typeof resolveAccess==='function','Provide durable transactional storage and a trusted Confluence access resolver.');
  const secret=Buffer.isBuffer(options.actorSecret)?Buffer.from(options.actorSecret):typeof options.actorSecret==='string'?Buffer.from(options.actorSecret,'utf8'):null;
  requireInput(secret&&secret.length>=32,'Configure a stable server-only actor HMAC secret of at least 32 bytes.');
  const now=options.now||Date.now;
  requireInput(typeof now==='function','Use a trusted server clock.');
  const storageKey=pageId=>rootPageId+':'+pageId;
  function actorHash(actor){return createHmac('sha256',secret).update(rootPageId+'\n'+actor).digest('hex');}
  function target(input,fields){
    requireInput(exact(input,fields),'The feedback request has missing or unsupported fields.');
    requireInput(input.rootPageId===rootPageId&&id(input.pageId),'The feedback request targets an invalid library or page.');
    requireInput(input.pageId!==rootPageId&&!publishedParents.has(input.pageId)&&!excludedPages.has(input.pageId)&&!excludedAncestors.has(input.pageId),'Feedback belongs to child articles, not navigation or private workflow pages.');
  }
  async function access(pageId,context){
    // context is created by authenticated middleware, never taken from JSON.
    const verified=await resolveAccess({rootPageId,pageId,context});
    const p=verified&&verified.page;
    if(!verified||verified.authenticated!==true||verified.rootReadable!==true||verified.canRead!==true||typeof verified.actorId!=='string'||!verified.actorId.trim()||verified.actorId.length>256||/[\u0000-\u001f\u007f]/.test(verified.actorId)||!p||p.id!==pageId||p.type!=='page'||p.status!=='current'||p.spaceKey!==spaceKey||!Array.isArray(p.ancestorIds)||!p.ancestorIds.every(id)||!p.ancestorIds.includes(rootPageId)||!p.ancestorIds.some((a,i)=>publishedParents.has(a)&&i>p.ancestorIds.indexOf(rootPageId))||p.ancestorIds.some(a=>excludedAncestors.has(a))||!int(p.version)||p.version<1)fail('FEEDBACK_FORBIDDEN','This article is not available for feedback in the current session.');
    return {actor:actorHash(verified.actorId),pageVersion:p.version};
  }
  function fresh(pageId){return {schemaVersion:1,rootPageId,pageId,revision:0,updatedAt:null,votes:[],events:[],requests:[]};}
  function validate(value,pageId){
    const bad=()=>fail('FEEDBACK_CORRUPT','The feedback record is invalid and has not been overwritten.');
    if(!exact(value,['schemaVersion','rootPageId','pageId','revision','updatedAt','votes','events','requests'])||value.schemaVersion!==1||value.rootPageId!==rootPageId||value.pageId!==pageId||!int(value.revision)||!(value.updatedAt===null||safeISO(value.updatedAt))||!['votes','events','requests'].every(k=>Array.isArray(value[k])&&value[k].length<=MAX_RECORDS))bad();
    const actors=new Set(),requests=new Set();
    for(const vote of value.votes){
      if(!exact(vote,['actor','value','revision','pageVersion','updatedAt'])||!/^([a-f0-9]{64})$/.test(vote.actor)||actors.has(vote.actor)||!['yes','no'].includes(vote.value)||!int(vote.revision)||vote.revision<1||!int(vote.pageVersion)||vote.pageVersion<1||!safeISO(vote.updatedAt)||vote.updatedAt>value.updatedAt)bad();
      actors.add(vote.actor);
    }
    let lastAt=null;
    const latest=new Map();
    for(const [i,event] of value.events.entries()){
      if(!exact(event,['revision','actor','from','to','pageVersion','at'])||event.revision!==i+1||!actors.has(event.actor)||![null,'yes','no'].includes(event.from)||!['yes','no'].includes(event.to)||!int(event.pageVersion)||event.pageVersion<1||!safeISO(event.at)||(lastAt&&event.at<lastAt)||event.at>value.updatedAt)bad();
      const prior=latest.get(event.actor);
      if(event.from!==(prior?prior.to:null))bad();
      latest.set(event.actor,{...event,voteRevision:(prior?prior.voteRevision:0)+1});lastAt=event.at;
    }
    if(value.revision!==value.events.length||value.updatedAt!==(value.events.length?lastAt:null)||latest.size!==value.votes.length)bad();
    for(const vote of value.votes){const event=latest.get(vote.actor);if(!event||event.to!==vote.value||event.voteRevision!==vote.revision||event.pageVersion!==vote.pageVersion||event.at!==vote.updatedAt)bad();}
    for(const request of value.requests){
      if(!exact(request,['key','fingerprint','actor','response'])||!/^([a-f0-9]{64})$/.test(request.key)||requests.has(request.key)||!/^([a-f0-9]{64})$/.test(request.fingerprint)||!actors.has(request.actor)||!object(request.response)||request.response.accepted!==true||request.response.rootPageId!==rootPageId||request.response.pageId!==pageId||!int(request.response.revision)||request.response.revision>value.revision)bad();
      requests.add(request.key);
    }
    return value;
  }
  async function load(pageId){const value=await store.get(storageKey(pageId));return value===null||value===undefined?fresh(pageId):validate(value,pageId);}
  function response(record,verified){
    const vote=record.votes.find(v=>v.actor===verified.actor);
    return {schemaVersion:1,rootPageId,pageId:record.pageId,pageVersion:verified.pageVersion,revision:record.revision,totals:totals(record.votes),currentVersionTotals:totals(record.votes,verified.pageVersion),myVote:vote?{value:vote.value,revision:vote.revision,pageVersion:vote.pageVersion}:{value:null,revision:0,pageVersion:null}};
  }
  async function locked(pageId,task){
    let called=false,pending;
    await store.withLock(storageKey(pageId),()=>{
      if(called)fail('FEEDBACK_STORAGE','The transaction ran more than once.');
      called=true;pending=Promise.resolve().then(task);return pending;
    });
    if(!called)fail('FEEDBACK_STORAGE','The transaction did not run.');
    return pending;
  }
  async function read(input,context){
    target(input,['rootPageId','pageId']);
    return locked(input.pageId,async()=>{const verified=await access(input.pageId,context);return response(await load(input.pageId),verified);});
  }
  async function vote(input,context){
    target(input,['rootPageId','pageId','pageVersion','value','expectedVoteRevision','requestId']);
    requireInput(int(input.pageVersion)&&input.pageVersion>0&&['yes','no'].includes(input.value)&&int(input.expectedVoteRevision)&&typeof input.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(input.requestId),'A current article version, Yes/No value, vote revision and request ID are required.');
    // Snapshot input before entering the asynchronous authorization transaction.
    const command=clone(input);
    return locked(command.pageId,async()=>{
      const verified=await access(command.pageId,context),record=await load(command.pageId);
      const key=hash(verified.actor+'\n'+command.requestId),fingerprint=hash(JSON.stringify(command));
      const receipt=record.requests.find(r=>r.key===key);
      if(receipt){if(receipt.fingerprint!==fingerprint)fail('FEEDBACK_CONFLICT','This request ID was already used for a different vote.');return clone(receipt.response);}
      if(verified.pageVersion!==command.pageVersion)fail('FEEDBACK_CONFLICT','The article changed. Reload its feedback before voting.');
      let current=record.votes.find(v=>v.actor===verified.actor);
      if((current?current.revision:0)!==command.expectedVoteRevision)fail('FEEDBACK_CONFLICT','Your vote changed in another session. Refresh feedback before trying again.');
      if(record.requests.length>=MAX_RECORDS||record.events.length>=MAX_RECORDS||(!current&&record.votes.length>=MAX_RECORDS))fail('FEEDBACK_CAPACITY','This feedback record needs service maintenance before accepting more votes.');
      const millis=now();
      if(!int(millis))fail('FEEDBACK_CLOCK','The server clock is invalid.');
      const at=new Date(millis).toISOString();
      if(record.updatedAt&&at<record.updatedAt)fail('FEEDBACK_CLOCK','The server clock moved backwards.');
      const changed=!current||current.value!==command.value||current.pageVersion!==command.pageVersion;
      if(changed){
        if(record.revision===Number.MAX_SAFE_INTEGER||(current&&current.revision===Number.MAX_SAFE_INTEGER))fail('FEEDBACK_CAPACITY','Feedback revisions reached their supported limit.');
        record.revision++;
        record.events.push({revision:record.revision,actor:verified.actor,from:current?current.value:null,to:command.value,pageVersion:command.pageVersion,at});
        const next={actor:verified.actor,value:command.value,revision:(current?current.revision:0)+1,pageVersion:command.pageVersion,updatedAt:at};
        if(current)Object.assign(current,next);else record.votes.push(next);
        record.updatedAt=at;
      }
      const result={...response(record,verified),accepted:true,requestId:command.requestId,changed};
      record.requests.push({key,fingerprint,actor:verified.actor,response:clone(result)});
      // The storage adapter must commit the entire JSON atomically. A lost
      // response is retried with the SAME request ID, never a new increment.
      await store.set(storageKey(command.pageId),record);
      return result;
    });
  }
  async function analytics(input,context){
    target(input,['rootPageId','pageId']);
    return locked(input.pageId,async()=>{
      const verified=await access(input.pageId,context);
      if(typeof options.canExportAnalytics!=='function'||await options.canExportAnalytics({rootPageId,pageId:input.pageId,context})!==true)fail('FEEDBACK_FORBIDDEN','Analytics export is not permitted for this session.');
      const record=await load(input.pageId),versions=[...new Set(record.votes.map(v=>v.pageVersion))].sort((a,b)=>a-b);
      return {schemaVersion:1,rootPageId,pageId:input.pageId,pageVersion:verified.pageVersion,revision:record.revision,updatedAt:record.updatedAt,totals:totals(record.votes),byPageVersion:versions.map(pageVersion=>({pageVersion,...totals(record.votes,pageVersion)})),voteChanges:record.events.length};
    });
  }
  return Object.freeze({read,vote,analytics});
}

/* Durable JSON adapter for one host / a local filesystem. Exclusive mkdir locks
 * serialize separate processes; atomic rename + fsync commit complete records.
 * Crashed locks are never stolen automatically. An operator must confirm the
 * old writer is gone before removing its .lock directory. For a cluster use a
 * database transaction/distributed lock adapter, not NFS/shared drive locks. */
function createArticleFeedbackFileStore(directory,options={}){
  requireInput(typeof directory==='string'&&directory.trim().length>0,'Choose a private service data directory.');
  const root=path.resolve(directory),lockTimeoutMs=options.lockTimeoutMs===undefined?10000:options.lockTimeoutMs;
  requireInput(int(lockTimeoutMs)&&lockTimeoutMs>=1&&lockTimeoutMs<=60000,'Invalid feedback lock timeout.');
  function filename(key){requireInput(typeof key==='string'&&/^[1-9]\d{0,19}:[1-9]\d{0,19}$/.test(key),'Invalid storage key.');const [rootId,pageId]=key.split(':');return path.join(root,'wcspedia-feedback-'+rootId+'-'+pageId+'.json');}
  async function get(key){try{const file=filename(key),info=await fs.stat(file);if(info.size>MAX_BYTES)fail('FEEDBACK_CAPACITY','Feedback file exceeds its supported size.');const raw=await fs.readFile(file,'utf8');if(Buffer.byteLength(raw)>MAX_BYTES)fail('FEEDBACK_CAPACITY','Feedback file exceeds its supported size.');return JSON.parse(raw);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function set(key,value){
    const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>MAX_BYTES)fail('FEEDBACK_CAPACITY','Feedback file exceeds its supported size.');
    await fs.mkdir(root,{recursive:true,mode:0o700});const file=filename(key),temp=file+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await fs.rename(temp,file);const dir=await fs.open(root,'r');try{await dir.sync();}finally{await dir.close();}}
    finally{if(handle)await handle.close();await fs.rm(temp,{force:true});}
  }
  async function withLock(key,task){
    const file=filename(key),lock=file+'.lock',started=Date.now();
    await fs.mkdir(root,{recursive:true,mode:0o700});
    for(;;){try{await fs.mkdir(lock,{mode:0o700});break;}catch(e){if(e.code!=='EEXIST')throw e;if(Date.now()-started>=lockTimeoutMs)fail('FEEDBACK_BUSY','Feedback is busy. Retry the same request shortly.');await new Promise(resolve=>setTimeout(resolve,20));}}
    try{return await task();}finally{await fs.rmdir(lock);}
  }
  return Object.freeze({get,set,withLock});
}

module.exports=Object.freeze({createArticleFeedbackService,createArticleFeedbackFileStore});
