/* LOCAL VERIFICATION ONLY. This in-memory simulation is not a production
 * workflow service, authentication implementation or durable audit store.
 * It listens only on 127.0.0.1 (port 4174 by default) and never connects to a real Confluence host.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const workflow = require('./workflow.js');
const confluence = require('./confluence.js');
const suggestions = require('./suggestions.js');
const entitlements = require('./entitlements.js');
const viewCounts = require('./view-count-store.cjs').createStore();
const PORT = Number(process.env.WCS_MOCK_PORT || 4174);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('WCS_MOCK_PORT must be a local port from 1024 to 65535.');
const ORIGIN = 'http://127.0.0.1:' + PORT;
const MOCK_ACTOR = ['alex','jordan','reader'].includes(process.env.WCS_MOCK_ACTOR) ? process.env.WCS_MOCK_ACTOR : 'jordan';
const clone = value => JSON.parse(JSON.stringify(value));
// A server-owned fixture supports isolated HTTP regression sessions; requests cannot choose a dataset.
const DATA_FILE = process.env.WCS_MOCK_DATA_FILE ? path.resolve(process.env.WCS_MOCK_DATA_FILE) : path.join(__dirname, 'wcspedia-data.json');
let data = confluence.validateData(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
data.entitlementPolicy = entitlements.validatePolicy(data.entitlementPolicy);
let entitlementAttachmentVersion = 1;
data.people.forEach(person => {
  const soeid = entitlements.normalizeSOEID(person.soeid);
  if (!soeid) throw new Error('Every fictional mock person needs a seeded SOEID.');
  person.confluence = { userKey:'mock-'+person.id+'-key', username:soeid };
});
const mockActor = () => data.people.find(person => person.id === MOCK_ACTOR);
const MOCK_NAME = mockActor().name;
const mockIdentity = () => ({type:'known',userKey:'mock-'+MOCK_ACTOR+'-key',username:mockActor().soeid,displayName:MOCK_NAME+' · Local simulation'});
const signedIdentity = () => entitlements.identity(mockIdentity());
const nativePages = new Map();
let nextNativePage = 500;
data.documents.forEach(doc => {doc.confluencePageId=String(nextNativePage++);nativePages.set(doc.confluencePageId,{documentKey:doc.id,version:1,status:'current'});});
// A deliberately separate native ACL fixture. Application grants alone cannot
// create these native rights. This fixed local session is not authentication.
const nativeACL = {
  alex:{root:['read','create','update'],entitlements:['read'],document:['read','update']},
  jordan:{root:['read','create','update'],entitlements:['read','update'],document:['read','update','delete']},
  reader:{root:['read'],entitlements:['read'],document:['read']}
};
const operations = names => names.map(operation=>({operation,targetType:'page'}));
// Optional, server-owned negative-test fixture; a request cannot change it.
const deniedReadDocuments = new Set(String(process.env.WCS_MOCK_DENY_READ_DOCUMENTS||'').split(',').filter(Boolean));
function nativeRights() {
  const acl=nativeACL[MOCK_ACTOR], documents={};
  data.documents.forEach(doc=>{const page=nativePages.get(doc.confluencePageId);documents[doc.id]=page&&page.status==='current'?operations(acl.document.filter(operation=>operation!=='read'||!deniedReadDocuments.has(doc.id))):[];});
  return {root:operations(acl.root),entitlements:operations(acl.entitlements),documents};
}
function granted(permission,doc) {return entitlements.effective(data.entitlementPolicy,signedIdentity(),permission,{native:nativeRights(),documentKey:doc&&doc.id});}
function permissionContext(doc) {return {actorId:MOCK_ACTOR,documentId:doc.id,edit:granted('content.edit',doc),delete:granted('content.delete',doc)};}
const bookmarkRoute = require('./mock-bookmarks-route.cjs').createRoute({rootPageId:'100',origins:[ORIGIN,'http://localhost:'+PORT],getActor:mockActor,getDocuments:()=>data.documents,canRead:doc=>entitlements.nativeHas(nativeRights().documents[doc.id],'read'),publishedVersion:workflow.publishedVersion});
const healthRoute = require('./mock-health-route.cjs').create({rootPageId:'100',getIdentity:mockActor,getContext(id){const doc=data.documents.find(d=>d.id===id&&!d.deletedAt);if(!doc||!entitlements.nativeHas(nativeRights().documents[id],'read'))return null;return {document:doc,people:data.people,actor:mockActor(),canEdit:granted('content.edit',doc),signedSOEID:signedIdentity().soeid};}});
const retainedDeletionAudits = new Map();
let attachmentVersion = 1;
const snapshots = new Map();
const completedRequests = new Map();
const suggestionMemory = new Map();
const suggestionService = suggestions.createService({config:{mode:'embedded'},getActor:()=>data.people.find(person=>person.id===MOCK_ACTOR),storage:{getItem:key=>suggestionMemory.get(key)||null,setItem:(key,value)=>suggestionMemory.set(key,value)}});
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
function readerVersion(version) {
  if (!version) return null;
  const snapshot = clone(version);
  delete snapshot.governanceReview;
  return snapshot;
}
function published() {
  const result = clone(data);
  result.taxonomyAudit = [];
  delete result.entitlementPolicy;
  result.documents = result.documents.flatMap(doc => {
    const version = readerVersion(workflow.publishedVersion(doc));
    return version ? [Object.assign({}, doc, { versions: [version], audit: [] })] : [];
  });
  return result;
}
function workspaceProjection() {
  const result=clone(data);
  delete result.entitlementPolicy;
  result.documents=result.documents.flatMap(doc=>{
    const assigned=[doc.authorId,doc.ownerId,doc.reviewerId,doc.approverId].includes(MOCK_ACTOR);
    if(assigned||granted('content.edit',doc)||granted('content.delete',doc))return [doc];
    const version=readerVersion(workflow.publishedVersion(doc));
    return version?[Object.assign({},doc,{versions:[version],audit:[]})]:[];
  });
  return result;
}
snapshots.set(attachmentVersion, published());
const nativeAreaPageIds=Object.fromEntries(data.areas.map((area,index)=>[area.id,String(210+index)]));
const pageHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WCSpedia · Local Confluence simulation</title><link rel="stylesheet" href="/confluence/download/attachments/100/wcspedia-style.css?api=v2"></head><body style="margin:0"><aside style="font:12px Arial,sans-serif;padding:8px 20px;color:#17355f;background:#fff4d6;text-align:center">Local Confluence simulation · Fictional ${MOCK_NAME} session · Sample data only · Changes reset when this server stops</aside><main id="wcspedia" aria-label="WCSpedia knowledge base"></main><script>window.WCS_CONFIG={mode:'confluence',rootPageId:'100',contextPath:'/confluence',attachmentFilename:'wcspedia-published.json',workspaceEndpoint:'/confluence/mock/workspace',workflowEndpoint:'/confluence/mock/actions',suggestionEndpoint:'/confluence/mock/suggestions',entitlementsPageId:'150',entitlementsSource:'attachment',entitlementsFilename:'entitlements.json',entitlementsEndpoint:'/confluence/mock/entitlements',metricsEndpoint:'/confluence/mock/metrics',bookmarksEndpoint:'/confluence/mock/bookmarks',healthEndpoint:'/confluence/mock/health',nativePublication:{enabled:false,areaPageIds:${JSON.stringify(nativeAreaPageIds)}}};</script><script src="/confluence/download/attachments/100/wcspedia.js?api=v2"></script></body></html>`;
const childPages = [
  { id:'100', slug:'wcspedia', title:'WCSpedia · Mock knowledge home', summary:'The searchable WCSpedia landing page and business-area directory.', ancestors:[],unlabelled:true },
  ...data.areas.map(area=>({id:nativeAreaPageIds[area.id],slug:area.id,title:area.title+' · Mock business area',summary:area.description,area:area.id,ancestors:['100'],unlabelled:true})),
  { id:'301', slug:'credit-approval', title:'Credit approval · Mock Confluence child page', summary:'Illustrative child-page search result for the credit approval collection.', area:'credit-approval-control', type:'job-aid', tags:['Control evidence'],processes:['Credit approval'],regions:['Global'] },
  { id:'302', slug:'loan-training', title:'Loan management training · Mock Confluence child page', summary:'Illustrative training page returned by the local CQL simulation.', area:'loan-management', type:'training',tags:['Team learning'],processes:['Loan servicing'],regions:['Global'] },
  { id:'303', slug:'closing-knowledge', title:'Deal closing knowledge sharing · Mock Confluence child page', summary:'Illustrative knowledge-sharing page for the closing team.', area:'deal-closing', type:'knowledge-sharing',tags:['Knowledge quality'],processes:['Handover'],regions:['EMEA'] },
  { id:'304', slug:'closing-native-notes', title:'Handover notes · Native Confluence page', summary:'A page created in the native editor, without WCSpedia classification labels or a JSON document record.', area:'deal-closing',unlabelled:true },
  { id:'305', slug:'closing-nested-notes', title:'Handover reference · Deep descendant page', summary:'Native page nested under handover notes, proving the complete descendant tree is searchable.',area:'deal-closing',ancestors:['100',nativeAreaPageIds['deal-closing'],'304'],unlabelled:true },
  { id:'901', slug:'unrelated', title:'Unrelated handover notes',summary:'Outside the WCSpedia tree in the same space.',ancestors:['900'],unlabelled:true },
  { id:'902', slug:'foreign-space',title:'Foreign-space handover notes',summary:'Outside the configured Confluence space.',space:'OTHER',ancestors:['100'],unlabelled:true }
].map(page=>({...page,space:page.space||'MOCK',ancestors:page.ancestors||['100',nativeAreaPageIds[page.area]].filter(Boolean),tags:page.tags||[],processes:page.processes||[],regions:page.regions||[],updated:'2026-10-15T09:00:00Z'}));
function pageLabels(page){
  return page.unlabelled?[]:['wcs-document','wcs-status-published',...(page.area?['wcs-area-'+page.area]:[]),...(page.type?['wcs-type-'+page.type]:[]),...page.tags.map(value=>confluence.facetLabel('tag',value)),...page.processes.map(value=>confluence.facetLabel('process',value)),...page.regions.map(value=>confluence.facetLabel('region',value))];
}
function nativeSearchContent(page){
  return {id:page.id,title:page.title,type:'page',status:'current',space:{key:page.space},ancestors:page.ancestors.map(id=>({id})),version:{number:1,when:page.updated},metadata:{labels:{results:pageLabels(page).map(name=>({name}))}},_links:{webui:'/display/'+page.space+'/'+page.slug}};
}
const staticFiles = new Map([
  ['/wcspedia-style.css', ['wcspedia-style.css','text/css; charset=utf-8']],
  ['/wcspedia.js', ['wcspedia.js','text/javascript; charset=utf-8']],
  ['/confluence/download/attachments/100/wcspedia-style.css', ['wcspedia-style.css','text/css; charset=utf-8']],
  ['/confluence/download/attachments/100/wcspedia.js', ['wcspedia.js','text/javascript; charset=utf-8']]
]);
function send(res, status, value, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Mock request exceeds 2 MB.');
  }
  return JSON.parse(text);
}
function search(url) {
  const cql = url.searchParams.get('cql') || '';
  if (!/ancestor\s*=\s*100\b/.test(cql) || !cql.includes('space = "MOCK"')) return { results:[], totalSize:0, start:0, limit:20 };
  // Decode the generated CQL string and its quoted literal Lucene term.
  const tokens = [...cql.matchAll(/text\s*~\s*"((?:\\.|[^"\\])*)"/g)].map(match=>{
    const term=JSON.parse('"'+match[1]+'"');
    return term.slice(1,-1).replace(/\\(.)/g,'$1').toLowerCase();
  });
  const scopes=[...cql.matchAll(/ancestor\s*=\s*(\d+)\b/g)].map(match=>match[1]);
  const inclusive=new Set([...cql.matchAll(/\(id\s*=\s*(\d+)\s+OR\s+ancestor/g)].map(match=>match[1]));
  const excludedIds=new Set([...cql.matchAll(/\bid\s+NOT\s+IN\s*\(([^)]+)\)/g)].flatMap(match=>match[1].split(',').map(id=>id.trim())));
  const includedIdGroups=[...cql.matchAll(/\bid\s+IN\s*\(([^)]+)\)/g)].map(match=>new Set(match[1].split(',').map(id=>id.trim())));
  const excludedAncestors=new Set([...cql.matchAll(/\bancestor\s+NOT\s+IN\s*\(([^)]+)\)/g)].flatMap(match=>match[1].split(',').map(id=>id.trim())));
  const labels=[...cql.matchAll(/label\s*=\s*"([^"]+)"/g)].map(match=>match[1]);
  const labelGroups=[...cql.matchAll(/label IN \(([^)]+)\)/g)].map(match=>[...match[1].matchAll(/"([^"]+)"/g)].map(label=>label[1]));
  const since=(cql.match(/lastmodified >= "([^"]+)"/)||[])[1],until=(cql.match(/lastmodified < "([^"]+)"/)||[])[1];
  const matches = childPages.filter(page => page.space==='MOCK'&&!excludedIds.has(page.id)&&includedIdGroups.every(group=>group.has(page.id))&&!page.ancestors.some(id=>excludedAncestors.has(id))&&scopes.every(id=>page.ancestors.includes(id)||(inclusive.has(id)&&page.id===id))&&tokens.every(term => (page.title+' '+page.summary).toLowerCase().includes(term))&&labels.every(label=>pageLabels(page).includes(label))&&labelGroups.every(group=>group.some(label=>pageLabels(page).includes(label)))&&(!since||page.updated>=since)&&(!until||page.updated<until));
  if(/ORDER BY title ASC$/.test(cql))matches.sort((a,b)=>a.title.localeCompare(b.title));
  else if(/ORDER BY lastmodified DESC$/.test(cql))matches.sort((a,b)=>b.updated.localeCompare(a.updated));
  const start = Math.max(0, Number(url.searchParams.get('start')) || 0), limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const next=new URL(url);next.searchParams.set('start',String(start+limit));
  return { results:matches.slice(start,start+limit).map(page => ({ title:page.title, excerpt:url.searchParams.get('excerpt')==='none'?'':page.summary, lastModified:page.updated, url:'/confluence/display/'+page.space+'/'+page.slug,content:nativeSearchContent(page) })), totalSize:matches.length, start, limit,_links:start+limit<matches.length?{next:next.pathname+next.search}:{} };
}
function mutationGuard(req) {
  if(req.headers.origin&&![ORIGIN,'http://localhost:'+PORT].includes(req.headers.origin))mockSuggestionError('Local verification origin only.','FORBIDDEN');
  if(!String(req.headers['content-type']||'').startsWith('application/json')||req.headers['x-requested-with']!=='XMLHttpRequest')mockSuggestionError('A JSON XMLHttpRequest command is required.','FORBIDDEN');
}
function requestKey(req,command) {
  if(!command||typeof command.requestId!=='string'||!command.requestId.trim()||command.requestId.length>160||req.headers['idempotency-key']!==command.requestId)mockSuggestionError('A matching idempotency key is required.','VALIDATION');
}
function fingerprint(command,route) {return JSON.stringify({route,actor:MOCK_ACTOR,command:Object.assign({},command,{requestId:undefined})});}
function mockSuggestionError(message,code){const error=new Error(message);error.code=code;throw error;}
function verifySuggestionContext(value) {
  const payload=suggestions.normalizePayload(value),context=payload.context;
  if(![ORIGIN,'http://localhost:'+PORT].includes(new URL(context.url).origin))mockSuggestionError('The suggestion source must be this local simulation.','FORBIDDEN');
  if(!context.documentId){
    if(context.ownerId||context.reviewerId||context.approverId||context.version||context.revision)mockSuggestionError('General-page requests cannot choose document assignments.','VALIDATION');
    return payload;
  }
  const doc=data.documents.find(item=>item.id===context.documentId);
  if(!doc)mockSuggestionError('The referenced mock document does not exist.','NOT_FOUND');
  const version=doc.versions.find(item=>item.version===context.version);
  if(!version||version.revision!==context.revision)mockSuggestionError('The referenced document revision has changed.','CONFLICT');
  if(version.status!=='Published'&&![doc.ownerId,doc.authorId,doc.reviewerId,doc.approverId].includes(MOCK_ACTOR))mockSuggestionError('The simulated user cannot read this working revision.','FORBIDDEN');
  for(const key of ['ownerId','reviewerId','approverId'])if(context[key]!==doc[key])mockSuggestionError('Document assignments must match the server record.','FORBIDDEN');
  if(context.title!==version.title)mockSuggestionError('The referenced document title has changed.','CONFLICT');
  // Assignments are copied from the server model after agreement checks, never trusted from the browser.
  Object.assign(context,{ownerId:doc.ownerId,reviewerId:doc.reviewerId,approverId:doc.approverId,title:version.title});
  return payload;
}
const server = http.createServer(async (req,res) => {
  try {
    if (!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(req.headers.host)) return send(res,403,{message:'Local verification host only.'});
    const url = new URL(req.url,ORIGIN);
    if(await bookmarkRoute(req,res,url))return;
    if(url.pathname==='/confluence/mock/health'){
      try{
        if(url.searchParams.get('rootPageId')!=='100')return send(res,400,{message:'Use the configured health library root.'});
        if(req.method==='GET')return send(res,200,await healthRoute.load(url.searchParams.getAll('documentId')));
        if(req.method==='POST'){mutationGuard(req);return send(res,200,await healthRoute.submit(await body(req)));}
        return send(res,405,{message:'Use GET or POST for content health.'});
      }catch(error){return send(res,['HEALTH_FORBIDDEN','FORBIDDEN'].includes(error.code)?403:error.code==='HEALTH_CONFLICT'?409:400,{message:error.message});}
    }
    if (req.method==='GET' && (url.pathname==='/' || url.pathname==='/mock-live.html')) return send(res,200,pageHTML,'text/html; charset=utf-8');
    if (req.method==='GET' && staticFiles.has(url.pathname)) {
      const [filename,type] = staticFiles.get(url.pathname);
      return send(res,200,fs.readFileSync(path.join(__dirname,filename)),type);
    }
    if (req.method==='GET' && url.pathname==='/confluence/rest/api/user/current') return send(res,200,mockIdentity());
    const nativeMatch=url.pathname.match(/^\/confluence\/rest\/api\/content\/([1-9]\d*)$/);
    if(req.method==='GET'&&nativeMatch){
      const id=nativeMatch[1],rights=nativeRights();
      if(id==='100')return send(res,200,{...nativeSearchContent(childPages.find(page=>page.id===id)),operations:rights.root});
      if(id==='150')return send(res,200,{id,type:'page',status:'current',version:{number:1},operations:rights.entitlements});
      const searchable=childPages.find(page=>page.id===id);
      if(searchable)return send(res,200,{...nativeSearchContent(searchable),operations:operations(['read'])});
      const page=nativePages.get(id);
      if(!page||page.status!=='current')return send(res,404,{message:'Native mock page is not current.'});
      return send(res,200,{id,type:'page',status:page.status,version:{number:page.version},operations:rights.documents[page.documentKey]||[]});
    }
    if (req.method==='GET' && url.pathname==='/confluence/rest/api/content/150/child/attachment') return send(res,200,{results:url.searchParams.get('filename')==='entitlements.json'?[{id:'250',title:'entitlements.json',version:{number:entitlementAttachmentVersion}}]:[]});
    if (req.method==='GET' && url.pathname==='/confluence/download/attachments/150/entitlements.json') {
      const version=Number(url.searchParams.get('version'))||entitlementAttachmentVersion;
      return version===entitlementAttachmentVersion?send(res,200,clone(data.entitlementPolicy)):send(res,404,{message:'Mock entitlement attachment version is unavailable.'});
    }
    if (req.method==='GET' && url.pathname==='/confluence/rest/api/content/100/child/attachment') return send(res,200,{results:url.searchParams.get('filename')==='wcspedia-published.json'?[{id:'200',title:'wcspedia-published.json',version:{number:attachmentVersion}}]:[]});
    if (req.method==='GET' && url.pathname==='/confluence/download/attachments/100/wcspedia-published.json') {
      const version = Number(url.searchParams.get('version')) || attachmentVersion;
      return snapshots.has(version)?send(res,200,snapshots.get(version)):send(res,404,{message:'Mock attachment version not found.'});
    }
    if (req.method==='GET' && url.pathname==='/confluence/mock/workspace') {
      if (url.searchParams.get('rootPageId')!=='100') return send(res,400,{message:'Unknown mock root.'});
      return send(res,200,{data:workspaceProjection()});
    }
    if (req.method==='GET' && url.pathname==='/confluence/rest/api/search') return send(res,200,search(url));
    if (req.method==='GET' && url.pathname==='/confluence/rest/api/content/search') {
      const result=search(url);
      return send(res,200,{results:result.results.map(item=>item.content),start:result.start,limit:result.limit,size:result.results.length,_links:result._links});
    }
    if(url.pathname==='/confluence/mock/metrics'&&['GET','POST'].includes(req.method)){
      const identity=signedIdentity();
      if(!identity)return send(res,401,{message:'An authenticated Confluence session is required.'});
      if(req.headers.origin&&![ORIGIN,'http://localhost:'+PORT].includes(req.headers.origin))return send(res,403,{message:'Local verification origin only.'});
      const rights=nativeRights();
      if(!entitlements.nativeHas(rights.root,'read'))return send(res,403,{message:'Native root read permission is required.'});
      const readable=doc=>!doc.deletedAt&&!!workflow.publishedVersion(doc)&&entitlements.nativeHas(rights.documents[doc.id],'read');
      if(req.method==='GET'){
        if(url.searchParams.get('rootPageId')!=='100')return send(res,400,{message:'Unknown mock root.'});
        return send(res,200,{schemaVersion:1,counts:data.documents.filter(readable).map(doc=>({documentKey:doc.id,views:viewCounts.count(doc.id,'100')}))});
      }
      mutationGuard(req);
      const command=await body(req);requestKey(req,command);
      const allowed=['rootPageId','documentKey','version','revision','requestId'];
      if(Object.keys(command).some(key=>!allowed.includes(key)))return send(res,400,{message:'A view request cannot choose identity, time, or count.'});
      if(command.rootPageId!=='100')return send(res,400,{message:'Unknown mock root.'});
      const doc=data.documents.find(item=>item.id===command.documentKey);
      // Read authorization is repeated before an idempotency replay as well.
      if(!doc||!readable(doc))return send(res,403,{message:'The current published document is unavailable to this session.'});
      const version=readerVersion(workflow.publishedVersion(doc));
      if(version.version!==command.version||version.revision!==command.revision)return send(res,409,{message:'The published document changed. Reload before recording a view.'});
      return send(res,200,viewCounts.record({...command,actorSOEID:identity.soeid}));
    }
    if (url.pathname==='/confluence/mock/suggestions' && ['GET','POST'].includes(req.method)) {
      if(url.searchParams.get('rootPageId')!=='100')return send(res,400,{message:'Unknown mock root.'});
      if(req.headers.origin&&![ORIGIN,'http://localhost:'+PORT].includes(req.headers.origin))return send(res,403,{message:'Local verification origin only.'});
      if(req.method==='GET'){
        const scope=url.searchParams.get('scope')||'mine';if(!['mine','review'].includes(scope))return send(res,400,{message:'Unknown suggestion scope.'});
        const rows=await suggestionService.list({scope,documentId:url.searchParams.get('documentId')||'',status:url.searchParams.get('status')||''});
        return send(res,200,{suggestions:rows});
      }
      if(!String(req.headers['content-type']||'').startsWith('application/json')||req.headers['x-requested-with']!=='XMLHttpRequest')return send(res,400,{message:'A JSON suggestion command is required.'});
      const command=await body(req);
      if(!command||typeof command.requestId!=='string'||!command.requestId.trim()||req.headers['idempotency-key']!==command.requestId)return send(res,400,{message:'A matching idempotency key is required.'});
      let record;
      if(command.action==='create')record=await suggestionService.submit(verifySuggestionContext(command.payload),command.requestId);
      else if(command.action==='decide'){
        const existing=(await suggestionService.list({scope:'review'})).find(row=>row.id===command.suggestionId);
        if(!existing)return send(res,403,{message:'The simulated user cannot decide this request.'});
        if(existing.context.documentId){
          const doc=data.documents.find(item=>item.id===existing.context.documentId);
          if(!doc||![doc.ownerId,doc.reviewerId,doc.approverId].includes(MOCK_ACTOR))return send(res,403,{message:'The current document assignments do not permit this decision.'});
        }
        record=await suggestionService.decide(command.suggestionId,{status:command.status,comment:command.comment,expectedRevision:command.expectedRevision},command.requestId);
      }else return send(res,400,{message:'Unknown suggestion action.'});
      return send(res,200,{suggestion:record});
    }
    if (req.method==='GET' && url.pathname.startsWith('/confluence/display/MOCK/')) {
      const page = childPages.find(item=>'/confluence/display/MOCK/'+item.slug===url.pathname);
      return page?send(res,200,`<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHTML(page.title)}</title><body style="font:18px Arial,sans-serif;max-width:700px;margin:80px auto;color:#17355f"><p>Local simulation only</p><h1>${escapeHTML(page.title)}</h1><p>${escapeHTML(page.summary)}</p><a href="/mock-live.html#/results">Return to WCSpedia</a></body></html>`,'text/html; charset=utf-8'):send(res,404,{message:'Mock page not found.'});
    }
    if(req.method==='GET'&&url.pathname==='/confluence/mock/entitlements'){
      if(url.searchParams.get('rootPageId')!=='100')return send(res,400,{message:'Unknown mock root.'});
      if(!granted('entitlements.view'))return send(res,403,{message:'Entitlement view permission is required.'});
      return send(res,200,{policy:clone(data.entitlementPolicy)});
    }
    if(req.method==='POST'&&url.pathname==='/confluence/mock/entitlements'){
      mutationGuard(req);
      const command=await body(req);requestKey(req,command);
      if(command.rootPageId!=='100'||command.entitlementsPageId!=='150')return send(res,400,{message:'Unknown entitlement root or page.'});
      const key=fingerprint(command,url.pathname),previous=completedRequests.get(command.requestId);
      if(previous)return previous.fingerprint===key?send(res,200,previous.response):send(res,409,{message:'Request ID was reused with different content.'});
      // Both the identity and fresh native ACL come from the fixed server-side
      // simulation. Browser-supplied actor/native/permissions are never read.
      if(command.entitlementsSource!=='attachment'||command.entitlementsFilename!=='entitlements.json')return send(res,400,{message:'Use the configured entitlements.json attachment.'});
      if(command.expectedAttachmentId!=='250'||command.expectedAttachmentVersion!==entitlementAttachmentVersion)return send(res,409,{message:'Mock entitlement attachment changed. Reload before saving.'});
      const next=entitlements.applyCommand(data.entitlementPolicy,command,{identity:signedIdentity(),native:nativeRights(),now:new Date().toISOString()});
      data.entitlementPolicy=next;entitlementAttachmentVersion++;
      const response={accepted:true,revision:next.revision,requestId:command.requestId};
      completedRequests.set(command.requestId,{fingerprint:key,response});
      return send(res,200,response);
    }
    if (req.method==='POST' && url.pathname==='/confluence/mock/actions') {
      mutationGuard(req);
      const command=await body(req);requestKey(req,command);
      if(command.rootPageId!=='100')return send(res,400,{message:'Unknown mock root.'});
      const key=fingerprint(command,url.pathname),previous=completedRequests.get(command.requestId);
      if(previous)return previous.fingerprint===key?send(res,200,previous.response):send(res,409,{message:'Mock request ID was reused with different content.'});
      if(command.expectedAttachmentVersion!==attachmentVersion)return send(res,409,{message:'Mock attachment changed. Reload before deciding.'});
      if(command.expectedEntitlementRevision!==data.entitlementPolicy.revision)return send(res,409,{message:'Mock entitlements changed. Reload before deciding.'});
      const now=new Date().toISOString();
      const options={actorId:MOCK_ACTOR,actorSOEID:signedIdentity().soeid,people:data.people,comment:command.comment,expectedVersion:command.expectedVersion,expectedRevision:command.expectedRevision,expectedAuditLength:command.expectedAuditLength,now,changes:command.changes,nextReviewAt:command.nextReviewAt,effectiveAt:now,requireGovernance:true,governanceReview:command.governanceReview};
      let deletion=null;
      if(command.action==='add-category'){
        if(!granted('content.create'))return send(res,403,{message:'Content creation entitlement and native create permission are required.'});
        data=confluence.addCategory(data,command,{actorId:MOCK_ACTOR,now});
      }else if(command.action==='create'){
        if(!granted('content.create'))return send(res,403,{message:'Content creation entitlement and native create permission are required.'});
        if(!command.fields||typeof command.fields.id!=='string')return send(res,400,{message:'A permanent document key is required.'});
        if(data.documents.some(item=>item.id===command.fields.id))return send(res,409,{message:'Mock document key already exists, including retained tombstones.'});
        options.permissionContext={actorId:MOCK_ACTOR,documentId:command.fields.id,create:true};
        const doc=workflow.createDocument(command.fields,options);
        doc.confluencePageId=String(nextNativePage++);
        nativePages.set(doc.confluencePageId,{documentKey:doc.id,version:1,status:'current'});
        data.documents.push(doc);
      }else{
        const index=data.documents.findIndex(doc=>doc.id===command.docId);
        if(index<0)return send(res,404,{message:'Mock document not found.'});
        const existing=data.documents[index],page=nativePages.get(existing.confluencePageId),current=workflow.currentVersion(existing);
        if(existing.deletedAt)return send(res,409,{message:'This document was already deleted.'});
        if(command.documentKey!==existing.id||command.confluencePageId!==existing.confluencePageId)return send(res,409,{message:'The permanent document key and native page mapping must match.'});
        if(!page||page.status!=='current'||page.version!==command.expectedPageVersion)return send(res,409,{message:'Native Confluence page changed. Reload before continuing.'});
        if(current.version!==command.expectedVersion||current.revision!==command.expectedRevision||existing.audit.length!==command.expectedAuditLength)return send(res,409,{message:'Mock content or audit changed. Reload before deciding.'});
        options.permissionContext=permissionContext(existing);
        if(['edit','revise','submit','delete'].includes(command.action)){
          const capability=command.action==='delete'?'content.delete':'content.edit';
          if(!granted(capability,existing))return send(res,403,{message:'The central entitlement and current native page permission are both required.'});
        }else if(!entitlements.nativeHas(nativeRights().documents[existing.id],'update'))return send(res,403,{message:'Native update permission is required for a workflow decision.'});
        const changed=workflow.transition(existing,command.action,options);
        if(command.action==='delete'){
          // Preserve the independent audit/snapshot before native page trash.
          // In production this must be a durable, transactional service journal.
          retainedDeletionAudits.set(existing.id,clone({document:changed,nativePageId:existing.confluencePageId,nativePageVersion:page.version,retainedAt:now}));
          page.status='trashed';page.version+=1;
          deletion={documentKey:existing.id,deleted:true,confluencePageDeleted:true};
        }else page.version+=1;
        data.documents[index]=changed;
      }
      attachmentVersion+=1;
      snapshots.set(attachmentVersion,published());
      const response=Object.assign({accepted:true,attachmentVersion,requestId:command.requestId},deletion||{});
      completedRequests.set(command.requestId,{fingerprint:key,response});
      return send(res,200,response);
    }
    if(req.method==='GET'&&url.pathname==='/confluence/mock/deletion-audit'){
      if(!granted('entitlements.view'))return send(res,403,{message:'Entitlement administrator access is required for the mock retention journal.'});
      const record=retainedDeletionAudits.get(url.searchParams.get('documentKey'));
      return record?send(res,200,clone(record)):send(res,404,{message:'No retained deletion journal record.'});
    }
    return send(res,404,{message:'Local simulation route not found.'});
  } catch(error) {
    send(res,error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 400,{message:error.message || 'Invalid local simulation request.'});
  }
});
server.listen(PORT,'127.0.0.1',()=>console.log('Local Confluence simulation: '+ORIGIN+'/mock-live.html (sample data, memory only; Ctrl+C to stop)'));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
