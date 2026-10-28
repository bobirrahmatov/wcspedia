/* Space-only WCSpedia workflow. Native pages, attachments and content-property
 * versions persist the existing custom editor workflow under the signed-in user.
 * This is cooperative workflow guidance, NOT tamper-proof approval enforcement.
 * Confluence permissions and native history remain the authorization/evidence.
 */
(function(root,factory){
  'use strict';var node=typeof module==='object'&&module.exports;
  var api=factory(root,node?require('./workflow.js'):root.WCSWorkflow,node?require('./entitlements.js'):root.WCSEntitlements,node?require('./editor-content.js'):root.WCSEditorContent,node?require('./space-renderer.js'):root.WCSSpaceRenderer);
  if(node)module.exports=api;else root.WCSSpaceWorkflow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,W,E,Content,Renderer){
  'use strict';
  var STATE='wcspedia.workflow.state',FILE='wcspedia-document.json',JOURNAL='wcspedia.workflow.operation',SUMMARY='wcspedia-workflow-summary';
  var ACTIONS=['create','edit','revise','submit','request-changes','complete-review','approve','delete','reassign-owner'];
  var TYPES=['Job aid','Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ'];
  var EXPAND='space,ancestors,version,operations,body.storage,history';
  function fail(message,code){var e=new Error(message);e.code=code||'VALIDATION';throw e;}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
  function numeric(v){if(!/^[1-9]\d{0,19}$/.test(String(v||'')))fail('Configure numeric Confluence page IDs.','CONFIGURATION');return String(v);}
  function key(v){if(typeof v!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v))fail('A stable document key is required.');return v;}
  function parent(p){return (p.ancestors||[]).length?String(p.ancestors[p.ancestors.length-1].id):null;}
  function op(p,name,target){return Array.isArray(p&&p.operations)&&p.operations.some(function(o){return o.operation===name&&o.targetType===(target||'page');});}
  function anchor(value){return '<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">'+value+'</ac:parameter></ac:structured-macro>';}
  // Confluence adds macro IDs and can reorder attributes when storing XHTML.
  // Read anchor semantics, never an exact serialization or a text substring.
  function markers(page){
    var source=page.body&&page.body.storage&&page.body.storage.value;
    if(typeof source!=='string')return [];
    var found=[],stack=[],candidate=null,parameter=null;
    function attribute(tag,name){var match=tag.match(new RegExp('\\s'+name+'\\s*=\\s*(["\x27])([\\s\\S]*?)\\1'));return match?match[2]:null;}
    var tokens=source.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g)||[];
    tokens.forEach(function(token){
      if(token.startsWith('<!--')||token.startsWith('<![CDATA[')){if(candidate)candidate.invalid=true;return;}
      if(token[0]!=='<'){if(parameter)parameter.text+=token;return;}
      var close=token.match(/^<\/([\w:.-]+)\s*>$/);
      if(close){
        if(stack.at(-1)!==close[1]){candidate=null;parameter=null;stack=[];return;}
        if(parameter&&parameter.depth===stack.length){
          if(close[1]==='ac:parameter'&&!candidate.invalid&&parameter.name==='')candidate.values.push(parameter.text.trim());
          parameter=null;
        }
        if(candidate&&candidate.depth===stack.length){
          if(!candidate.invalid&&candidate.values.length===1&&/^wcs-[a-zA-Z0-9._:-]+$/.test(candidate.values[0]))found.push(candidate.values[0]);
          candidate=null;
        }
        stack.pop();return;
      }
      var open=token.match(/^<([\w:.-]+)(?:\s|\/?>)/);if(!open)return;
      if(parameter)candidate.invalid=true;
      if(open[1]==='ac:structured-macro'&&!stack.some(function(t){return t==='ac:structured-macro'||t==='ac:plain-text-body';})&&attribute(token,'ac:name')==='anchor')candidate={depth:stack.length+1,values:[],invalid:false};
      if(candidate&&open[1]==='ac:parameter'&&stack.length===candidate.depth)parameter={depth:stack.length+1,name:attribute(token,'ac:name'),text:''};
      if(!/\/\s*>$/.test(token))stack.push(open[1]);
      else if(parameter&&parameter.depth===stack.length+1)parameter=null;
    });
    return found;
  }
  function marked(page,value){return markers(page).includes(value);}
  function aborted(signal){if(signal&&signal.aborted){var e=new Error('The operation was cancelled.');e.name='AbortError';throw e;}}
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(object(v))return Object.keys(v).sort().reduce(function(r,k){if(v[k]!==undefined)r[k]=canonical(v[k]);return r;},{});return v;}
  function create(config,deps){
    config=config||{};deps=deps||{};
    var governanceEnabled=config.governanceEnabled===true;
    var native=config.nativePublication||{},rootId=numeric(config.rootPageId||config.pageId||native.publishedRootPageId),workingId=numeric(config.workingRootPageId||native.workingRootPageId);
    var areas=Object.assign({},native.areaPageIds||config.areaPageIds||{}),insightsId=numeric(config.insightsPageId||native.insightsPageId),space=config.spaceKey;
    if(typeof space!=='string'||!/^[A-Za-z0-9_~.-]+$/.test(space)||rootId===workingId)fail('Configure the WCSpedia space and distinct working/root pages.','CONFIGURATION');
    Object.keys(areas).forEach(function(a){areas[a]=numeric(areas[a]);if([rootId,workingId,insightsId].includes(areas[a]))fail('Business areas need distinct destination pages.','CONFIGURATION');});
    if(new Set(Object.values(areas)).size!==Object.keys(areas).length)fail('Business-area destinations must be unique.','CONFIGURATION');
    var storage=deps.storage||(root.WCSSpaceStorage&&root.WCSSpaceStorage.create(config,deps));
    if(!storage||!W||!E||!Renderer||!Content)fail('Load the native storage, workflow and renderer helpers.','CONFIGURATION');
    if(typeof deps.loadPolicy!=='function')fail('Connect the current entitlements attachment reader.','CONFIGURATION');
    var crypto=deps.crypto||root.crypto,fetcher=deps.fetch||(root.fetch&&root.fetch.bind(root));
    var origin=deps.origin||(root.location&&root.location.origin),context=(config.contextPath||'/confluence').replace(/\/$/,'');
    if(config.baseUrl){var base=new URL(config.baseUrl,origin);origin=base.origin;context=base.pathname.replace(/\/$/,'');}
    var Form=deps.FormData||root.FormData,BlobType=deps.Blob||root.Blob,lastContext=null;
    var singlePages=new Map();
    var maxPages=Number.isSafeInteger(config.workspaceMaxPages)?Math.min(1000,Math.max(1,config.workspaceMaxPages)):200;
    async function hashBytes(bytes){if(!crypto||!crypto.subtle)fail('Web Crypto is required for safe request recovery.','CONFIGURATION');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),function(n){return n.toString(16).padStart(2,'0');}).join('');}
    async function digest(v){return hashBytes(new TextEncoder().encode(v));}
    function options(signal,extra){return Object.assign({signal:signal},extra||{});}
    async function request(path,method,body,signal){aborted(signal);return storage.request(path,options(signal,{method:method||'GET',headers:body===undefined?undefined:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:body===undefined?undefined:JSON.stringify(body)}));}
    function assertPage(p,expectedParent){if(!p||p.type!=='page'||p.status&&p.status!=='current'||String(p.space&&p.space.key)!==space||!Number.isSafeInteger(p.version&&p.version.number))fail('A configured page is unavailable or outside WCSpedia.','PAGE_SCOPE');if(expectedParent&&parent(p)!==expectedParent)fail('A document or destination was moved outside its configured parent.','PAGE_SCOPE');return p;}
    async function page(id,signal,expectedParent){return assertPage(await storage.page(numeric(id),EXPAND,options(signal)),expectedParent);}
    async function restrictions(id,operation,signal){return request('/rest/api/content/'+id+'/restriction/byOperation/'+operation+'?expand=restrictions.user,restrictions.group&limit=200',null,undefined,signal);}
    function restrictionRows(r,operation){if(!r||r.operation!==operation||!object(r.restrictions))fail('Confluence did not return verifiable native restrictions.','INVALID_PERMISSIONS');var users=r.restrictions.user,groups=r.restrictions.group;if(!users||!groups||!Array.isArray(users.results)||!Array.isArray(groups.results))fail('Confluence did not expand native restriction subjects.','INVALID_PERMISSIONS');if((users._links&&users._links.next)||(groups._links&&groups._links.next))fail('The restriction list is too large to verify safely.','PERMISSIONS_LIMIT');return {users:users.results,groups:groups.results};}
    async function boundaries(signal,reading){
      var results=await Promise.all([storage.page(rootId,'space,ancestors,version,operations',options(signal)).then(function(p){return assertPage(p);}),storage.page(workingId,'space,ancestors,version,operations',options(signal)).then(function(p){return assertPage(p);}),request('/rest/api/space/'+encodeURIComponent(space)+'?expand=operations',null,undefined,signal)]);
      if(results[2].key!==space||results[2].operations!=null&&!Array.isArray(results[2].operations))fail('Confluence space permissions could not be verified.','INVALID_PERMISSIONS');
      var privacyError=null,protectedBy=null;
      try{
        // The read restriction endpoint describes this page only. Native viewing
        // restrictions also inherit from ancestors returned by the verified page.
        var ancestors=results[1].ancestors;
        if(!Array.isArray(ancestors)||ancestors.length>100)fail('The Working page ancestry could not be verified.','INVALID_PERMISSIONS');
        var ids=Array.from(new Set([workingId].concat(ancestors.slice().reverse().map(function(p){return numeric(p.id);}))));
        for(var id of ids){
          var read=restrictionRows(await restrictions(id,'read',signal),'read');
          if(read.users.length||read.groups.length){protectedBy=id;break;}
        }
        if(!protectedBy)fail('Working page ('+workingId+') has no viewing protection, so creating private drafts is disabled. An administrator should run Sync access in Entitlements to apply viewing access from JSON. In Confluence this uses Viewing and editing restricted; authors and reviewers need View only on Working, not Edit. Keep that viewing protection enabled and the workspace interface pages accessible.','WORKING_ROOT_UNRESTRICTED');
      }catch(error){aborted(signal);if(!reading)throw error;privacyError=error;}
      // Parent editing is not a creation/review capability. Where DC omits
      // space.operations, query the signed-in user's native space permissions.
      var canCreate=false,permissionError=null;
      if(Array.isArray(results[2].operations))canCreate=op(results[2],'create','page');
      else try {
        var currentUser=await storage.user(options(signal));
        if(!currentUser.userKey)fail('Confluence did not return a user key for the native Add page check.','INVALID_PERMISSIONS');
        var grants=await request('/rest/api/space/'+encodeURIComponent(space)+'/permissions/user/'+encodeURIComponent(currentUser.userKey),null,undefined,signal);
        if(!Array.isArray(grants))fail('Confluence did not return native space permissions.','INVALID_PERMISSIONS');
        canCreate=grants.some(function(g){return (!g.spaceKey||g.spaceKey===space)&&g.operation&&g.operation.targetType==='page'&&g.operation.operationKey==='create';});
      }catch(error){aborted(signal);permissionError=error;}
      if(!privacyError&&permissionError)privacyError={code:'CREATE_PERMISSION_UNVERIFIED',message:'Confluence could not verify native Add page permission. An administrator should run Sync access in Entitlements. Working-root Edit is not required. '+permissionError.message};
      return {root:results[0],working:results[1],space:results[2],canCreate:canCreate,draftsProtected:!!protectedBy,protectedBy:protectedBy,creationCode:privacyError?(privacyError.code||'INVALID_PERMISSIONS'):'',creationMessage:privacyError?(['WORKING_ROOT_UNRESTRICTED','CREATE_PERMISSION_UNVERIFIED'].includes(privacyError.code)?privacyError.message:'Confluence could not verify Working-page viewing restrictions. '+privacyError.message):''};
    }
    function directory(catalog,policy,user,previousPeople){
      var bySOEID=new Map(),byId=new Map();
      (catalog.people||[]).concat(previousPeople||[]).forEach(function(p){var s=E.normalizeSOEID(p.soeid||(p.confluence||{}).username);if(s&&!bySOEID.has(s)){var saved=clone(p);saved.role='Reader';bySOEID.set(s,saved);byId.set(p.id,p);}});
      var grouped=new Map();policy.records.filter(function(r){return r.active;}).forEach(function(r){if(!grouped.has(r.soeid))grouped.set(r.soeid,[]);grouped.get(r.soeid).push(r);});
      grouped.forEach(function(rows,s){var p=bySOEID.get(s)||{id:'wcs-user-'+s.toLowerCase(),soeid:s,name:rows[0].displayName,role:'Reader',confluence:{username:s}};
        var admin=['entitlements.view','entitlements.add','entitlements.edit','entitlements.revoke'].every(function(cap){return rows.some(function(r){return r.scope==='*'&&r.permissions.includes(cap);});});
        p.role=admin?'Manager':rows.some(function(r){return r.permissions.includes('content.create')||r.permissions.includes('content.edit');})?'Author':'Reader';p.name=rows[0].displayName;p.soeid=s;bySOEID.set(s,p);
      });
      var who=E.identity(user);if(!who)fail('A signed-in Confluence SOEID is required.','UNAUTHENTICATED');
      var actor=bySOEID.get(who.soeid)||{id:'wcs-user-'+who.soeid.toLowerCase(),soeid:who.soeid,name:who.displayName,role:'Reader'};
      actor.confluence={username:user.username};['userKey','accountId'].forEach(function(k){if(user[k])actor.confluence[k]=user[k];});actor.name=who.displayName;bySOEID.set(who.soeid,actor);
      var people=Array.from(bySOEID.values());if(new Set(people.map(function(p){return p.id;})).size!==people.length)fail('Directory person IDs conflict.','IDENTITY_MAPPING');
      return {people:people,actor:actor,who:who};
    }
    async function contextFor(input,signal,reading){
      input=input||{};var responses=await Promise.all([input.user?Promise.resolve(input.user):storage.user(options(signal)),input.policy?Promise.resolve(input.policy):deps.loadPolicy(options(signal)),input.skipDocuments?Promise.resolve(null):boundaries(signal,reading)]);
      var policy=E.validatePolicy(responses[1].data||responses[1]),catalog=clone(input.catalog||(lastContext&&lastContext.catalog)||config.catalog||{schemaVersion:1,isDemo:false,people:[],areas:[],documents:[]});
      var dir=directory(catalog,policy,responses[0]);var ctx={user:responses[0],policy:policy,bounds:responses[2],catalog:catalog,dir:dir,access:input.access||{}};lastContext=ctx;return ctx;
    }
    async function readState(p,signal){
      var result=await storage.readJSON(p.id,FILE,STATE,options(signal));if(!result.data)return {state:result,document:null};
      var value=result.data;if(!object(value)||value.schemaVersion!==1||!object(value.document)||!Array.isArray(value.people))fail('A working document has invalid metadata.','INVALID_DATA');
      var d=value.document;key(d.id);if(!marked(p,'wcs-document-'+d.id)||(d.singlePageInsight===true?(!Content.isDirectPublication(d)||parent(p)!==insightsId||!marked(p,'wcs-single-insight')):parent(p)!==workingId))fail('The working page identity or location changed.','PAGE_SCOPE');
      d.confluencePageId=String(p.id);d.confluencePageVersion=p.version.number;
      return {state:result,document:d,people:value.people,media:value.media||{}};
    }
    async function children(signal,parentId){
      parentId=parentId||workingId;
      var out=[],start=0,search=false,seen=new Set();
      // Avoid body and nested content-property expansion on the child collection.
      // Some DC installations reject these expansions with HTTP 500. Fetch the
      // exact working document only after its summary matches the current user.
      var expand='space,ancestors,version,operations';
      var cql='type = page AND space = "'+space+'" AND parent = '+parentId+' ORDER BY id ASC';
      while(out.length<maxPages){
        var response,limit=Math.min(50,maxPages-out.length);
        try{
          var path=search?'/rest/api/content/search?cql='+encodeURIComponent(cql):'/rest/api/content/'+parentId+'/child/page?';
          response=await request(path+(search?'&':'')+'limit='+limit+'&start='+start+'&expand='+encodeURIComponent(expand),null,undefined,signal);
        }catch(error){
          aborted(signal);
          // Never turn denied access, missing parents or an aborted request into
          // a search. Restart once on unsupported/failed collection endpoints.
          if(!search&&([400,405,501].includes(error.status)||(error.status>=500&&error.status<=599))){search=true;out=[];seen.clear();start=0;continue;}
          throw error;
        }
        if(!response||!Array.isArray(response.results)||response.results.length>limit)fail('Confluence returned an invalid workspace listing.','INVALID_RESPONSE');
        for(var p of response.results){
          assertPage(p,parentId);var id=numeric(p.id);
          if(seen.has(id))fail('Workspace pagination repeated a page. Retry after the listing has settled.','INVALID_RESPONSE');
          seen.add(id);out.push(p);
        }
        var more=response._links&&response._links.next;if(!more)return out;
        if(!response.results.length)fail('Workspace pagination did not advance.','INVALID_RESPONSE');start+=response.results.length;
      }
      fail('This workspace exceeds the configured safe listing limit. Narrow the workspace before loading more documents.','WORKSPACE_LIMIT');
    }
    async function parallel(items,fn){var output=new Array(items.length),next=0;await Promise.all(Array.from({length:Math.min(4,items.length)},async function(){while(next<items.length){var i=next++;output[i]=await fn(items[i]);}}));return output;}
    async function capabilities(input){
      input=input||{};var ctx=await contextFor(input,input.signal,true);return {rootPageId:rootId,workingRootPageId:workingId,identity:ctx.dir.who,code:ctx.bounds.creationCode,canCreateDocument:ctx.bounds.draftsProtected&&ctx.bounds.canCreate&&E.hasGrant(ctx.policy,ctx.dir.who,'content.create','*'),reason:ctx.bounds.creationMessage||(!ctx.bounds.canCreate?'Confluence space Add page permission is required.':!E.hasGrant(ctx.policy,ctx.dir.who,'content.create','*')?'The WCSpedia document creation grant is required.':'')};
    }
    async function load(input){return loadWithContext(input,null);}
    async function loadWithContext(input,verifiedContext){
      input=input||{};var signal=input.signal,scope=input.workspaceScope||'all';
      if(!['all','create','mine','review'].includes(scope)&&!/^document:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(scope))fail('Choose a supported workspace view.','CONFIGURATION');
      var ctx=verifiedContext||await contextFor(input,signal,true);
      if(input.skipDocuments)return Object.assign({},ctx.access,{data:Object.assign({},ctx.catalog,{people:ctx.dir.people,documents:[],isDemo:false}),actorId:ctx.dir.actor.id,actor:ctx.dir.actor,identity:ctx.dir.who,entitlementPolicy:ctx.policy,mode:'confluence',authoringMode:'confluence-session',identityMapped:true,workspaceLoaded:false,discoveryOnly:false,attachmentVersion:1,attachmentId:null,canWriteAttachment:false,canSubmit:false});
      // A new editor needs permissions/directory only. Detail views resolve one
      // stable native title; never enumerate or download unrelated documents.
      var rows=[],pending=[];
      if(scope.startsWith('document:')){var documentKey=key(scope.slice(9)),target=await findSeed('WCSpedia working '+documentKey,'wcs-document-'+documentKey,signal)||await findSingle(documentKey,signal);if(target)rows=[target];}
      else if(scope!=='create'){var lists=await Promise.all(scope==='review'?[children(signal)]:[children(signal),children(signal,insightsId)]);rows=lists.flat();}
      var entries=await parallel(rows,async function(p){
        var props=p.metadata&&p.metadata.properties,summary=props&&props[SUMMARY];if(!summary)summary=await storage.property(p.id,SUMMARY,options(signal));
        if(!summary||!summary.value||summary.value.schemaVersion!==1)return null;
        if(parent(p)===insightsId&&summary.value.singlePageInsight!==true)return null;
        if(ctx.dir.actor.role!=='Manager'&&!(summary.value.people||[]).includes(ctx.dir.actor.id))return null;
        var people=summary.value.people,actorId=ctx.dir.actor.id;
        if(Array.isArray(people)&&people.length===4){
          if(scope==='mine'&&!people.slice(0,2).includes(actorId))return null;
          if(scope==='review'&&!((summary.value.status==='In review'&&people[2]===actorId)||(summary.value.status==='Awaiting approval'&&people[3]===actorId)))return null;
        }
        // Journal and page/state reads are independent. All mutation checks still
        // use freshly read native state in submit(), never a listing summary.
        var journalRead=storage.property(p.id,JOURNAL,options(signal));
        var itemRead=(async function(){
        if(!p.body||!p.body.storage||typeof p.body.storage.value!=='string')p=await page(p.id,signal,parent(p));
        return readState(p,signal);})();
        var pair=await Promise.all([itemRead,journalRead]),item=pair[0],journal=pair[1];
        if(journal&&journal.value&&!journal.value.done)pending.push({documentKey:summary.value.documentKey,requestId:journal.value.requestId,action:journal.value.action});
        return item.document?Object.assign(item,{page:p,pending:!!(journal&&journal.value&&!journal.value.done)}):null;
      });
      entries=entries.filter(Boolean);ctx.dir=directory(ctx.catalog,ctx.policy,ctx.user,entries.flatMap(function(e){return e.people;}));
      var documents=clone((ctx.catalog.documents||[]).filter(function(d){return !d.nativeSessionWorkflow;})),pages={},versions={},permissions={};
      entries.forEach(function(e){var d=e.document,index=documents.findIndex(function(v){return v.id===d.id;});if(index>=0)documents[index]=d;else documents.push(d);pages[d.id]=e.page.operations||[];versions[d.id]=e.page.version.number;permissions[d.id]={edit:(d.singlePageInsight||ctx.bounds.draftsProtected)&&!e.pending&&op(e.page,'update')&&E.hasGrant(ctx.policy,ctx.dir.who,'content.edit',d.id),delete:(d.singlePageInsight||ctx.bounds.draftsProtected)&&!e.pending&&op(e.page,'delete')&&E.hasGrant(ctx.policy,ctx.dir.who,'content.delete',d.id)};});
      var effective=Object.assign({},ctx.access.effectivePermissions||{});effective['content.create']=ctx.bounds.draftsProtected&&ctx.bounds.canCreate&&E.hasGrant(ctx.policy,ctx.dir.who,'content.create','*');
      var nativePermissions=Object.assign({},ctx.access.nativePermissions||{},{root:ctx.bounds.root.operations||[],workingRoot:ctx.bounds.working.operations||[],documents:pages});
      if(effective['content.create']&&!nativePermissions.root.some(function(o){return o.operation==='create'&&o.targetType==='page';}))nativePermissions.root=nativePermissions.root.concat([{operation:'create',targetType:'page'}]);
      var data=Object.assign({},ctx.catalog,{people:ctx.dir.people,documents:documents,isDemo:false});
      var actorId=ctx.dir.actor.id,assigned=entries.some(function(e){return [e.document.authorId,e.document.reviewerId,e.document.approverId].includes(actorId)&&(e.document.singlePageInsight||ctx.bounds.draftsProtected)&&op(e.page,'update');});
      return Object.assign({},ctx.access,{data:data,actorId:actorId,actor:ctx.dir.actor,identity:ctx.dir.who,entitlementPolicy:ctx.policy,mode:'confluence',authoringMode:'confluence-session',identityMapped:true,workspaceLoaded:true,workspaceScope:scope,discoveryOnly:false,attachmentVersion:1,attachmentId:null,canWriteAttachment:false,creationMessage:ctx.bounds.creationMessage,creationCode:ctx.bounds.creationCode,canSubmit:effective['content.create']||assigned,nativePermissions:nativePermissions,effectivePermissions:effective,documentPermissions:permissions,nativePageVersions:versions,pendingOperations:pending,workflowMode:'cooperative-native'});
    }
    async function assignments(doc,people,signal){
      var ids=Array.from(new Set([doc.authorId,doc.reviewerId,doc.approverId].filter(Boolean)));
      var actors=await Promise.all(ids.map(async function(id){var p=people.find(function(x){return x.id===id;});if(!p)fail('Choose an available author, reviewer and manager.');var soeid=E.normalizeSOEID(p.soeid||(p.confluence||{}).username);if(!soeid)fail('Workflow assignments need valid SOEIDs.');var u=await request('/rest/api/user?username='+encodeURIComponent((p.confluence||{}).username||soeid),null,undefined,signal);if(!E.identity(u)||E.identity(u).soeid!==soeid)fail('An assigned person cannot be verified in Confluence.','IDENTITY_MAPPING');return {type:'known',username:u.username,userKey:u.userKey};}));
      return actors;
    }
    async function restrictUpdate(p,users,signal,publication){
      // Restricted pages need matching viewing subjects. For a space-readable
      // publication omit the unchanged read operation: an explicit empty read
      // paired with update triggers the DC read/update removal validator.
      // A new publication intentionally becomes viewable through space/destination
      // access. Never clear viewing restrictions on an existing published page.
      var subjectsForWrite=users.map(function(user){
        if(!user||typeof user.username!=='string'||!user.username.trim())fail('Confluence did not return an assigned username for page restrictions.','IDENTITY_MAPPING');
        return {type:'known',username:user.username};
      });
      if(!subjectsForWrite.length)fail('At least one verified editor is required for page restrictions.','IDENTITY_MAPPING');
      var expected=subjectsForWrite.map(function(u){return E.normalizeSOEID(u.username);}).sort();
      function matches(r){return !r.groups.length&&JSON.stringify(expected)===JSON.stringify(r.users.map(function(u){return E.normalizeSOEID(u.username);}).sort());}
      var stage='read existing restrictions';
      try{
        var initial=await Promise.all([restrictions(p.id,'read',signal),restrictions(p.id,'update',signal)]);
        var readBefore=restrictionRows(initial[0],'read'),before=restrictionRows(initial[1],'update');
        function readSubjects(value){
          var mapped=value.users.map(function(u){if(!u||typeof u.username!=='string'||!u.username.trim())fail('A native viewer cannot be identified safely.','INVALID_PERMISSIONS');return {type:'known',username:u.username};});
          var groups=value.groups.map(function(g){if(!g||typeof g.name!=='string'||!g.name.trim())fail('A native viewing group cannot be identified safely.','INVALID_PERMISSIONS');return {name:g.name};});
          return {users:mapped,groups:groups};
        }
        function subjects(value){return {users:value.users.map(function(u){return E.normalizeSOEID(u.username);}).sort(),groups:value.groups.map(function(g){return g.name;}).sort()};}
        var desiredRead=readSubjects(readBefore);
        var firstPublication=publication&&publication.first&&parent(p)===workingId&&marked(p,'wcs-kind-published');
        if(firstPublication)desiredRead={users:[],groups:[]};
        // Private Working drafts explicitly include each assigned person. For
        // existing restricted publications preserve the audience and include the
        // verified approving editor. Unrestricted publications stay unrestricted.
        if(!publication||desiredRead.users.length||desiredRead.groups.length){
          subjectsForWrite.forEach(function(u){if(!desiredRead.users.some(function(v){return E.normalizeSOEID(v.username)===E.normalizeSOEID(u.username);}))desiredRead.users.push(u);});
        }
        var sameRead=JSON.stringify(subjects(readBefore))===JSON.stringify(subjects(desiredRead));
        // An exact native policy already satisfies this step. This also allows
        // an authorized space owner to provision it through the native dialog.
        // Never accept a superset, groups, an unexpanded list or a failed read.
        if(!matches(before)||!sameRead){
          var policy=[{operation:'update',restrictions:{user:subjectsForWrite,group:[]}}];
          if(publication&&!desiredRead.users.length&&!desiredRead.groups.length){
            if(!sameRead){
              // Only a first-publication placeholder under protected Working may
              // shed direct viewing restrictions. It contains no private history.
              // Clear viewing separately, verify, then set editing; never weaken
              // editing or move the page as a fallback for a rejected request.
              if(!firstPublication)fail('Existing published viewing restrictions must be preserved.','RESTRICTIONS_CONFLICT');
              stage='prepare published viewing access';
              await request('/rest/api/content/'+p.id+'/restriction','PUT',[{operation:'read',restrictions:{user:[],group:[]}}],signal);
              var cleared=restrictionRows(await restrictions(p.id,'read',signal),'read');
              if(cleared.users.length||cleared.groups.length)fail('Published viewing access was not confirmed. Publication has not continued.','RESTRICTIONS_CONFLICT');
            }
          }else policy.unshift({operation:'read',restrictions:{user:desiredRead.users,group:desiredRead.groups}});
          stage='set editing restrictions';
          await request('/rest/api/content/'+p.id+'/restriction','PUT',policy,signal);
        }
        stage='verify restrictions';
        var verified=await Promise.all([restrictions(p.id,'update',signal),restrictions(p.id,'read',signal)]);
        var r=restrictionRows(verified[0],'update'),readAfter=restrictionRows(verified[1],'read');
        if(JSON.stringify(subjects(desiredRead))!==JSON.stringify(subjects(readAfter)))fail('The requested native viewing restrictions were not confirmed. Publication has not continued.','RESTRICTIONS_CONFLICT');
        if(!matches(r))fail('Native edit restrictions were not confirmed. Publication has not continued.','RESTRICTIONS_UNCONFIRMED');
      }catch(error){
        aborted(signal);
        if(error.name==='AbortError')throw error;
        // Preserve status/code and UNKNOWN_COMMIT semantics for exact-request
        // recovery. A denial must not become a retry against a looser endpoint.
        var guidance=error.status===404?'The restriction endpoint or page is unavailable to this account; a successful page GET does not verify this endpoint.':error.status===401?'Sign in again before checking this same save.':error.status===403||error.code==='FORBIDDEN'?'The signed-in account cannot change native page restrictions. A space administrator should run Sync access in Entitlements to apply the required native space grants, then verify native Edit access on this document. Working-root Edit is not required. Blogs skip restriction writes, so a successful Blog save does not test this permission. Keep the Working parent’s viewing restrictions. After access is corrected, use Check save / retry the same action; do not create another document. Saving JSON alone does not grant native permission; synchronization must succeed.':error.status===400&&/requires.*read.*restrictions/i.test(error.message)?'Confluence rejected the native View/Edit combination. This is a restriction-validation error, not an approval failure. The page has not been published. Keep the original save for Check save / retry; do not recreate the document.':error.status===400?'Confluence rejected the restriction request; use the server detail below to check the assigned native usernames and permissions.':'The restriction step was not confirmed.';
        error.message='Job aid page '+p.id+': could not '+stage+'. '+guidance+' Required individual editors: '+subjectsForWrite.map(function(u){return u.username;}).join(', ')+'. Working drafts need matching View and Edit access; a first publication must retain space-reader visibility. '+error.message;
        if([400,403,404,405].includes(error.status)||['FORBIDDEN','UNKNOWN_COMMIT'].includes(error.code))error.recoverable=true;
        throw error;
      }
    }
    async function findSeed(title,marker,signal,expectedParent){
      expectedParent=expectedParent||workingId;
      var r=await request('/rest/api/content?type=page&spaceKey='+encodeURIComponent(space)+'&title='+encodeURIComponent(title)+'&limit=2&expand='+encodeURIComponent(EXPAND),null,undefined,signal);
      if(!r||!Array.isArray(r.results)||r.results.length>1)fail('A duplicate working-page identity needs administrator review.','CONFLICT');
      if(!r.results.length)return null;
      var p=assertPage(r.results[0],expectedParent);
      if(!p.body||!p.body.storage||typeof p.body.storage.value!=='string'||!Array.isArray(p.operations))p=await page(p.id,signal,expectedParent);
      if(p.title!==title||!marked(p,marker))fail('The working-page title is already used by other content.','CONFLICT');return p;
    }
    async function createPage(title,documentKey,kind,requestId,signal,expectedParent){
      expectedParent=expectedParent||workingId;
      var marker='wcs-document-'+documentKey,existing=await findSeed(title,marker,signal,expectedParent);
      if(existing){if(!marked(existing,'wcs-created-'+requestId)&&!marked(existing,'wcs-operation-'+requestId))fail('This document key already exists. Reload the workspace.','CONFLICT');return existing;}
      var created=await request('/rest/api/content','POST',{type:'page',title:title,space:{key:space},ancestors:[{id:expectedParent}],body:{storage:{representation:'storage',value:anchor(marker)+anchor('wcs-created-'+requestId)+anchor('wcs-kind-'+kind)+(expectedParent===insightsId?anchor('wcs-single-insight'):'')+'<p>WCSpedia content is being prepared.</p>'}}},signal);
      if(!created||!/^[1-9]\d{0,19}$/.test(String(created.id||'')))fail('Confluence did not confirm the created page ID. Check this same save before retrying.','UNKNOWN_COMMIT');
      // POST does not promise expanded operations/body/ancestors. Read the
      // actual saved page; absence in the POST is not a permission denial.
      var confirmed=await page(String(created.id),signal,expectedParent);
      if(confirmed.title!==title||!marked(confirmed,marker)||!marked(confirmed,'wcs-created-'+requestId)||!marked(confirmed,'wcs-kind-'+kind))fail('The created page identity could not be confirmed. Check this same save before retrying.','UNKNOWN_COMMIT');
      return confirmed;
    }
    async function findSingle(documentKey,signal){
      var cached=singlePages.get(documentKey);
      if(cached){try{var known=await page(cached,signal,insightsId);if(!marked(known,'wcs-single-insight')||!marked(known,'wcs-document-'+documentKey))fail('The Insights page identity changed.','PAGE_SCOPE');return known;}catch(error){if(error.status!==404)throw error;fail('The previously identified Insights page is no longer readable. Restore access or reconcile its native history before retrying; no replacement page was created.','UNKNOWN_COMMIT');}}
      var seed=await findSeed('WCSpedia insight '+documentKey,'wcs-document-'+documentKey,signal,insightsId);
      if(seed){if(!marked(seed,'wcs-single-insight'))fail('The Insights seed identity changed.','PAGE_SCOPE');singlePages.set(documentKey,seed.id);return seed;}
      var candidates=await children(signal,insightsId),found=await parallel(candidates,async function(p){var summary=await storage.property(p.id,SUMMARY,options(signal));return summary&&summary.value&&summary.value.singlePageInsight===true&&summary.value.documentKey===documentKey?p:null;});
      found=found.filter(Boolean);if(found.length>1)fail('Duplicate Insights metadata needs administrator review.','CONFLICT');if(!found.length)return null;
      var result=await page(found[0].id,signal,insightsId);if(!marked(result,'wcs-single-insight')||!marked(result,'wcs-document-'+documentKey))fail('The Insights page identity changed.','PAGE_SCOPE');singlePages.set(documentKey,result.id);return result;
    }
    // New direct publications contain published versions and publication events,
    // never private draft diffs or review notes. Legacy private records are untouched.
    function publicState(document){
      var d=clone(document);d.singlePageInsight=true;
      d.versions.forEach(function(v){if(v.status!=='Published')fail('Private drafts cannot be stored on an Insights page.','PAGE_SCOPE');delete v.governanceReview;v.changeSummary='Published revision.';});
      d.audit.forEach(function(e){e.changes=(e.changes||[]).filter(function(c){return c.field==='ownerId';});if(e.action!=='reassign-owner')e.comment='Published article '+e.action+'.';});
      if(d.deletedReason)d.deletedReason='Article deleted.';
      return d;
    }
    async function finishSingleDelete(p,doc,journal,requestId,fingerprint,ctx,signal){
      if(!E.hasGrant(ctx.policy,ctx.dir.who,'content.delete',doc.id)||!op(p,'delete')||!op(p,'update'))fail('Your account cannot delete this article.','FORBIDDEN');
      var marker='wcs-deleted-'+requestId+'-'+fingerprint,expected=journal.value.expectedNativeVersion;
      if(marked(p,marker)){if(p.version.number!==expected+1)fail('The article changed during deletion.','CONFLICT');}
      else{
        if(p.version.number!==expected)fail('The article changed during deletion.','CONFLICT');
        p=assertPage(await request('/rest/api/content/'+p.id,'PUT',{id:p.id,type:'page',title:p.title,space:{key:space},ancestors:[{id:insightsId}],version:{number:p.version.number+1,message:'WCSpedia article deletion · '+requestId},body:{storage:{representation:'storage',value:p.body.storage.value+anchor(marker)}}},signal),insightsId);
      }
      if(p.version.number!==expected+1||!marked(p,marker))fail('The deletion marker was not confirmed. Retry this same delete.','UNKNOWN_COMMIT');
      await trashPublished(Object.assign({},doc,{publishedConfluencePageId:p.id,publishedConfluencePageVersion:p.version.number}),signal);
      singlePages.delete(doc.id);
      return loadWithContext({catalog:ctx.catalog,signal:signal,workspaceScope:'document:'+doc.id},ctx);
    }
    async function upload(pageId,item,signal){
      if(!item.bytes||!item.bytes.length||item.bytes.length>10000000)fail('Every attachment must be no more than 10,000,000 bytes.','ATTACHMENT_LIMIT');
      var list=await request('/rest/api/content/'+pageId+'/child/attachment?filename='+encodeURIComponent(item.fileName)+'&expand=version,container,metadata&limit=2',null,undefined,signal);
      if(!list||!Array.isArray(list.results)||list.results.length>1||list._links&&list._links.next)fail('Could not verify document attachments.','INVALID_RESPONSE');
      var a=list.results[0];
      if(!a){var form=new Form();form.append('file',new BlobType([item.bytes],{type:item.mediaType}),item.fileName);form.append('minorEdit','true');var response=await storage.request('/rest/api/content/'+pageId+'/child/attachment',options(signal,{method:'POST',headers:{'X-Atlassian-Token':'nocheck'},body:form}));a=response&&response.results&&response.results[0];if(a&&(!a.container||!a.type||!a.version)){var refreshed=await request('/rest/api/content/'+pageId+'/child/attachment?filename='+encodeURIComponent(item.fileName)+'&expand=version,container,metadata&limit=2',null,undefined,signal);if(!refreshed||!Array.isArray(refreshed.results)||refreshed.results.length!==1||refreshed._links&&refreshed._links.next||String(refreshed.results[0].id)!==String(a.id))fail('The uploaded attachment identity could not be verified.','UNKNOWN_COMMIT');a=refreshed.results[0];}}
      if(!a||a.type!=='attachment'||a.title!==item.fileName||!Number.isSafeInteger(a.version&&a.version.number)||a.version.number<1||!a.container||a.container.type!=='page'||String(a.container.id)!==String(pageId))fail('Confluence did not confirm the document attachment.','UNKNOWN_COMMIT');
      var confirmed=await storage.request('/download/attachments/'+pageId+'/'+encodeURIComponent(item.fileName)+'?api=v2&version='+a.version.number,options(signal,{responseType:'bytes'}));
      if(!(confirmed instanceof Uint8Array)||confirmed.byteLength!==item.bytes.byteLength||await hashBytes(confirmed)!==await hashBytes(item.bytes))fail('The native attachment bytes did not match the approved resource.','INTEGRITY');
      return {fileName:item.fileName,attachmentId:numeric(a.id),attachmentVersion:a.version.number,mediaType:item.mediaType,size:item.bytes.length,sha256:await hashBytes(item.bytes),sourceUrl:item.sourceUrl,url:context+'/download/attachments/'+pageId+'/'+encodeURIComponent(item.fileName)+'?version='+a.version.number};
    }
    async function download(resource,workingPageId,signal){
      aborted(signal);
      var u;try{u=new URL(resource.sourceUrl,origin);}catch(_){fail('Upload images/files into this document before saving.','MEDIA_NOT_STAGED');}
      if(u.origin!==origin||u.username||u.password||u.hash||!u.pathname.startsWith(context+'/download/attachments/'+workingPageId+'/')||!/^\d+$/.test(u.searchParams.get('version')||''))fail('Only this working document’s version-pinned attachments can be copied. Upload external files in the editor.','MEDIA_NOT_STAGED');
      if(!fetcher)fail('Attachment download is unavailable.','CONFIGURATION');
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000),abort=function(){controller.abort();};if(signal)signal.addEventListener('abort',abort,{once:true});
      try{var r=await fetcher(u.href,{credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});if(!r.ok||r.redirected||r.url&&r.url!==u.href)fail('A staged attachment could not be read.','MEDIA_NOT_STAGED');var declared=Number(r.headers&&r.headers.get('content-length'));if(declared>10000000)fail('Attachment exceeds 10,000,000 bytes.','ATTACHMENT_LIMIT');var bytes;if(r.body&&typeof r.body.getReader==='function'){var reader=r.body.getReader(),chunks=[],size=0;while(true){var part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>10000000){await reader.cancel();fail('Attachment exceeds 10,000,000 bytes.','ATTACHMENT_LIMIT');}chunks.push(part.value);}bytes=new Uint8Array(size);var offset=0;chunks.forEach(function(c){bytes.set(c,offset);offset+=c.length;});}else{bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>10000000)fail('Attachment exceeds 10,000,000 bytes.','ATTACHMENT_LIMIT');}return {bytes:bytes,mediaType:(r.headers&&r.headers.get('content-type')||'application/octet-stream').split(';')[0],fileName:decodeURIComponent(u.pathname.split('/').pop()),sourceUrl:resource.sourceUrl};}finally{clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);}
    }
    // Independent attachment transfers may overlap. Stop scheduling on failure
    // and drain started writes before exposing recovery to the user.
    async function mediaBatch(items,task){
      var next=0,failure=null;
      await Promise.all(Array.from({length:Math.min(3,items.length)},async function(){
        while(!failure&&next<items.length){
          var item=items[next++];
          try{await task(item);}catch(error){if(!failure)failure=error;}
        }
      }));
      if(failure)throw failure;
    }
    async function stageMedia(document,p,previousMedia,sourcePageId,signal){
      var v=W.currentVersion(document),resources=Renderer.mediaResources(document,v).items,mapping={},old=previousMedia||{};
      await mediaBatch(resources,async function(resource){
        var entry=old[resource.key];
        if(entry&&entry.sourceUrl===resource.sourceUrl&&String(p.id)===String(sourcePageId)){
          if(!Number.isSafeInteger(entry.attachmentVersion)||entry.attachmentVersion<1||!/^[a-f0-9]{64}$/.test(entry.sha256||''))fail('The staged resource has unverifiable version metadata. Upload it again.','INTEGRITY');
          var pinned=await download(resource,sourcePageId,signal);
          if(pinned.bytes.byteLength!==entry.size||await hashBytes(pinned.bytes)!==entry.sha256)fail('The staged resource changed after it was saved. Upload it again.','INTEGRITY');
          mapping[resource.key]=entry;
        }
      });
      var remote=resources.filter(function(r){return !mapping[r.key]&&!r.sourceUrl.startsWith('data:');});
      await mediaBatch(remote,async function(r){var item=await download(r,sourcePageId,signal);mapping[r.key]=await upload(p.id,item,signal);});
      var uploads=await Renderer.collectMedia(document,v,{media:mapping});
      await mediaBatch(uploads,async function(item){mapping[item.key]=await upload(p.id,item,signal);});
      return mapping;
    }
    function externalize(doc,media){
      var replacements=Object.keys(media).map(function(k){return [media[k].sourceUrl,media[k].url];}).filter(function(pair){return pair[0]&&pair[0].startsWith('data:');});
      function walk(v){if(typeof v==='string'){replacements.forEach(function(pair){v=v.split(pair[0]).join(pair[1]);});return v;}if(Array.isArray(v))return v.map(walk);if(object(v)){var n={};Object.keys(v).forEach(function(k){n[k]=walk(v[k]);});return n;}return v;}
      var result=walk(doc);result.versions.forEach(function(v){if(v.bodyMarkdown)v.sections=Content.toSections(v.bodyMarkdown);});return result;
    }
    function publicationParent(doc){return Content.isDirectPublication(doc)||['Blog','Knowledge sharing','Reference'].includes(doc.type)?insightsId:areas[doc.area];}
    async function destination(doc,signal){var id=publicationParent(doc);if(!id)fail('Select a configured business-area destination.','INVALID_MAPPING');return page(id,signal,rootId);}
    async function bodyWrite(p,document,media,kind,requestId,expectedParent,signal){
      if(marked(p,'wcs-operation-'+requestId)){p.readerReady=marked(p,'wcs-reader-v1');return p;}
      var initial=markers(p).find(function(value){return /^wcs-created-[a-zA-Z0-9-]{16,100}$/.test(value);});
      var v=kind==='published'?W.publishedVersion(document):W.currentVersion(document),body=(initial?anchor(initial):'')+anchor('wcs-document-'+document.id)+(document.singlePageInsight?anchor('wcs-single-insight'):'')+anchor('wcs-kind-'+kind)+anchor('wcs-operation-'+requestId)+(kind==='published'?anchor('wcs-reader-v1'):'')+Renderer.renderStorage(document,v,document._people||[],{media:media,operation:kind==='published'?'published':'working',hostStyleFlags:true,attachmentPageId:numeric(config.attachmentPageId||rootId),contextPath:context,readerSidebarUrl:context+'/download/attachments/'+numeric(config.attachmentPageId||rootId)+'/wcspedia-reader-sidebar.js?api=v2',readerPageId:kind==='published'?p.id:null,readerRootId:rootId,readerNativeVersion:p.version.number+1,insightsUrl:context+'/pages/viewpage.action?pageId='+insightsId});
      var suffix=' · WCS '+p.id;
      var title=kind==='published'?v.title.slice(0,250-suffix.length)+suffix:'WCSpedia working '+document.id;
      var response=await request('/rest/api/content/'+p.id,'PUT',{id:p.id,type:'page',title:title.slice(0,250),space:{key:space},ancestors:[{id:expectedParent}],version:{number:p.version.number+1,message:'WCSpedia '+kind+' '+v.status+' v'+v.version+' r'+v.revision+' · '+requestId},body:{storage:{representation:'storage',value:body}}},signal);
      var result=assertPage(response,expectedParent);if(result.version.number!==p.version.number+1)fail('The native page update was not confirmed.','UNKNOWN_COMMIT');result.readerReady=kind==='published';return result;
    }
    async function ensureSummary(p,doc,signal){
      var value={schemaVersion:1,documentKey:doc.id,singlePageInsight:doc.singlePageInsight===true,people:[doc.ownerId,doc.authorId,doc.reviewerId,doc.approverId],status:doc.deletedAt?'Deleted':W.currentVersion(doc).status},old=await storage.property(p.id,SUMMARY,options(signal));
      if(!old||JSON.stringify(old.value)!==JSON.stringify(value))await storage.putProperty(p.id,SUMMARY,value,old?old.version.number:null,options(signal));
    }
    async function syncLabels(p,doc,signal){
      function label(kind,value){var slug=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);return slug?'wcs-'+kind+'-'+slug:null;}
      var v=W.currentVersion(doc),labels=['wcs-published',p.readerReady?'wcs-reader':null,'hide-title','hide-comments','hide-actions','hide-footer',label('area',doc.area),label('type',doc.type)];
      [['tag','tags'],['process','processes'],['region','regions']].forEach(function(pair){(v[pair[1]]||[]).forEach(function(value){labels.push(label(pair[0],value));});});labels=Array.from(new Set(labels.filter(Boolean)));
      var previous=await request('/rest/api/content/'+p.id+'/label?limit=200',null,undefined,signal);if(!previous||!Array.isArray(previous.results)||previous._links&&previous._links.next)fail('The page label list could not be safely reconciled.','LABEL_LIMIT');
      var obsolete=previous.results.map(function(l){return l.name;}).filter(function(name){return /^wcs-(?:area|type|tag|topic|process|region)-/.test(name)&&!labels.includes(name);});
      for(var name of obsolete)await request('/rest/api/content/'+p.id+'/label?name='+encodeURIComponent(name),'DELETE',undefined,signal);
      var existing=new Set(previous.results.filter(function(l){return l.prefix!=='my';}).map(function(l){return l.name;}));
      var missing=labels.filter(function(name){return !existing.has(name);});
      if(missing.length)await request('/rest/api/content/'+p.id+'/label','POST',missing.map(function(name){return {prefix:'global',name:name};}),signal);
    }
    async function trashPublished(doc,signal){
      var pub;
      try{pub=await page(doc.publishedConfluencePageId,signal);}catch(error){
        if(error.status!==404)throw error;
        var trashed=await request('/rest/api/content/'+numeric(doc.publishedConfluencePageId)+'?status=trashed&expand='+encodeURIComponent(EXPAND),null,undefined,signal);
        if(!trashed||String(trashed.id)!==String(doc.publishedConfluencePageId)||trashed.status!=='trashed'||trashed.space&&trashed.space.key!==space||!marked(trashed,'wcs-document-'+doc.id))fail('Deletion has not been authoritatively confirmed; a missing page is not proof of deletion.','UNKNOWN_COMMIT');
        return;
      }
      await destination(doc,signal);
      if(!marked(pub,'wcs-document-'+doc.id)||parent(pub)!==publicationParent(doc))fail('The published page cannot be safely identified for deletion.','PAGE_SCOPE');
      if(pub.version.number!==doc.publishedConfluencePageVersion)fail('The published page changed. Reconcile its native history before deletion.','CONFLICT');
      if(!op(pub,'delete'))fail('Confluence does not permit deleting the published page.','FORBIDDEN');
      await request('/rest/api/content/'+pub.id,'DELETE',undefined,signal);
    }
    function statePreflight(doc,people){
      // Resource data is persisted as pinned native attachment URLs. Estimate
      // the same replacements before creating/altering any native page.
      function compact(v){if(typeof v==='string')return v.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}/g,'/confluence/download/attachments/00000000000000000000/'+'x'.repeat(180)+'?version=999999');if(Array.isArray(v))return v.map(compact);if(object(v)){var out={};Object.keys(v).forEach(function(k){out[k]=compact(v[k]);});return out;}return v;}
      if(new TextEncoder().encode(JSON.stringify({document:compact(doc),people:people})).byteLength>9500000)fail('This document history is too large for a 10 MB attachment. Export/archive earlier versions before saving another revision.','ATTACHMENT_LIMIT');
    }
    async function submit(command,session,opts){
      opts=opts||{};var signal=opts.signal;
      if(!object(command)||!ACTIONS.includes(command.action)||typeof command.comment!=='string'||!command.comment.trim())fail('A supported workflow action and reason are required.');
      var requestId=command.requestId;if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))fail('Preserve a secure request ID while retrying this action.','CONFIGURATION');
      var ctx=await contextFor({catalog:session&&session.data},signal,true),actor=ctx.dir.actor,who=ctx.dir.who;
      if(!session||session.actorId!==actor.id||!session.identity||session.identity.soeid!==who.soeid||['userKey','accountId'].some(function(k){return (session.identity[k]||null)!==(who[k]||null);}))fail('Your signed-in account changed. Reload before saving.','IDENTITY_MAPPING');
      if(command.expectedEntitlementRevision!=null&&command.expectedEntitlementRevision!==ctx.policy.revision)fail('Entitlements changed. Reload before saving.','CONFLICT');
      var creating=command.action==='create',documentKey=key(creating?command.fields&&command.fields.id:command.documentKey||command.docId),doc,p,state;
      var fingerprint=await digest(JSON.stringify(canonical(command)));
      if(creating){
        if(!ctx.bounds.canCreate||!E.hasGrant(ctx.policy,who,'content.create','*'))fail('Your account needs Add page permission and the WCSpedia creation grant.','FORBIDDEN');
        if(Content.isInsightType(command.fields.type)&&!Content.isDirectPublication(command.fields))fail('Publish non-Job-aid content directly to Insights.','INVALID_MAPPING');
        if((!areas[command.fields.area]&&!(Content.isDirectPublication(command.fields)))||!TYPES.includes(command.fields.type))fail('Choose a configured business area and content type.','INVALID_MAPPING');
        doc=W.createDocument(command.fields,{people:ctx.dir.people,actorId:actor.id,actorSOEID:who.soeid,now:new Date().toISOString(),requireGovernance:governanceEnabled,reviewScheduleRequired:governanceEnabled,permissionContext:{actorId:actor.id,documentId:documentKey,create:true}});
        statePreflight(doc,ctx.dir.people);await Renderer.collectMedia(doc,W.currentVersion(doc),{media:{}});
        if(!Content.isDirectPublication(doc))await assignments(doc,ctx.dir.people,signal);
        // Resume old two-page saves in place. Never move their private history.
        p=Content.isDirectPublication(doc)?await findSeed('WCSpedia working '+documentKey,'wcs-document-'+documentKey,signal):null;
        if(Content.isDirectPublication(doc)&&!p){
          await destination(doc,signal);p=await findSingle(documentKey,signal);
          if(p&&!marked(p,'wcs-created-'+requestId))fail('This document key already exists. Reload the workspace.','CONFLICT');
          if(!p)p=await createPage('WCSpedia insight '+documentKey,documentKey,'published',requestId,signal,insightsId);
          singlePages.set(documentKey,p.id);doc.singlePageInsight=true;
        }else{if(!ctx.bounds.draftsProtected)fail(ctx.bounds.creationMessage,ctx.bounds.creationCode);if(!p)p=await createPage('WCSpedia working '+documentKey,documentKey,'working',requestId,signal);}
        state=await readState(p,signal);
      }else{
        var entry=(session.data.documents||[]).find(function(d){return d.id===documentKey;});if(!entry||!entry.confluencePageId)fail('Reload the document workspace before saving.','NOT_FOUND');try{p=await page(entry.confluencePageId,signal,entry.singlePageInsight?insightsId:workingId);}catch(error){
          if(error.status!==404||!entry.singlePageInsight||command.action!=='delete')throw error;
          var deleted=await request('/rest/api/content/'+numeric(entry.confluencePageId)+'?status=trashed&expand='+encodeURIComponent(EXPAND),null,undefined,signal);
          if(!E.hasGrant(ctx.policy,who,'content.delete',documentKey)||!deleted||deleted.status!=='trashed'||String(deleted.id)!==String(entry.confluencePageId)||deleted.space&&deleted.space.key!==space||!marked(deleted,'wcs-single-insight')||!marked(deleted,'wcs-document-'+documentKey)||!marked(deleted,'wcs-deleted-'+requestId+'-'+fingerprint))fail('Article deletion could not be confirmed.','UNKNOWN_COMMIT');
          singlePages.delete(documentKey);return loadWithContext({catalog:ctx.catalog,signal:signal,workspaceScope:'document:'+documentKey},ctx);
        }
        state=await readState(p,signal);doc=state.document;if(!doc)fail('The working document metadata is unavailable.','INVALID_DATA');ctx.dir=directory(ctx.catalog,ctx.policy,ctx.user,state.people);actor=ctx.dir.actor;
      }
      if(!doc.singlePageInsight&&!ctx.bounds.draftsProtected)fail(ctx.bounds.creationMessage,ctx.bounds.creationCode);
      if(Content.isInsightType(doc.type)&&!['create','edit','revise','delete','reassign-owner'].includes(command.action))fail('This content publishes directly to Insights; open it in the editor to publish.','INVALID_ACTION');
      if(command.action==='reassign-owner'){
        var nextOwner=ctx.dir.people.find(function(person){return person.id===command.ownerId&&['Author','Manager'].includes(person.role);});
        if(!nextOwner)fail('Choose an active author or manager.','INVALID_MAPPING');
        var nextUser=await request('/rest/api/user?username='+encodeURIComponent((nextOwner.confluence||{}).username||nextOwner.soeid),null,undefined,signal);
        if(!E.identity(nextUser)||E.identity(nextUser).soeid!==E.normalizeSOEID(nextOwner.soeid))fail('The new owner cannot be verified in Confluence.','IDENTITY_MAPPING');
      }
      var journal=await storage.property(p.id,JOURNAL,options(signal));
      if(journal&&journal.value&&journal.value.requestId===requestId){if(journal.value.fingerprint!==fingerprint||journal.value.actorSOEID!==who.soeid)fail('This request ID was already used for another action.','CONFLICT');if(journal.value.done)return loadWithContext({catalog:ctx.catalog,signal:signal,workspaceScope:'document:'+documentKey},ctx);}
      else if(journal&&journal.value&&!journal.value.done)fail('Another operation is unfinished. Retry that original action before making a new change.','WRITE_PENDING');
      else{
        if(!Array.isArray(p.operations))fail('Confluence did not return editing permissions for working page '+p.id+'. Check native page access, then retry this same save.','INVALID_PERMISSIONS');
        if(!op(p,'update'))fail('Confluence does not permit editing working page '+p.id+'. Check that page’s native Editing restrictions and your space Add page permission. A WCSpedia entitlement alone cannot grant native access.','FORBIDDEN');
        if(!creating&&doc.singlePageInsight&&doc.publishedConfluencePageVersion!==p.version.number)fail('The article changed outside WCSpedia. Reconcile its native history before saving.','CONFLICT');
        if(!creating&&command.expectedPageVersion!=null&&p.version.number!==command.expectedPageVersion)fail('The native page changed. Reload before saving.','CONFLICT');
        if(!creating&&['edit','revise','submit','reassign-owner'].includes(command.action)&&!E.hasGrant(ctx.policy,who,'content.edit',documentKey))fail('Your WCSpedia document edit grant is missing.','FORBIDDEN');
        if(command.action==='delete'&&(!E.hasGrant(ctx.policy,who,'content.delete',documentKey)||!op(p,'delete')))fail('Your account cannot delete this document.','FORBIDDEN');
        if(['request-changes','complete-review','approve'].includes(command.action)&&actor.role==='Reader')fail('Your active review role is no longer available.','FORBIDDEN');
        var at=new Date().toISOString();
        var relevantIds=new Set([doc.ownerId,doc.authorId,doc.reviewerId,doc.approverId,actor.id,command.ownerId].concat((doc.audit||[]).map(function(e){return e.actorId;})));
        var snapshotPeople=ctx.dir.people.filter(function(person){return relevantIds.has(person.id);});
        if(!creating)statePreflight(W.transition(doc,command.action,{people:ctx.dir.people,actorId:actor.id,actorSOEID:who.soeid,now:at,effectiveAt:at,nextReviewAt:command.nextReviewAt,governanceReview:command.governanceReview,expectedVersion:command.expectedVersion,expectedRevision:command.expectedRevision,expectedAuditLength:command.expectedAuditLength,changes:command.changes,ownerId:command.ownerId,comment:command.comment,requireGovernance:governanceEnabled,reviewScheduleRequired:governanceEnabled,permissionContext:{actorId:actor.id,documentId:documentKey,edit:E.hasGrant(ctx.policy,who,'content.edit',documentKey)&&op(p,'update'),delete:E.hasGrant(ctx.policy,who,'content.delete',documentKey)&&op(p,'delete')}}),snapshotPeople);
        journal=await storage.putProperty(p.id,JOURNAL,{schemaVersion:1,requestId:requestId,fingerprint:fingerprint,actorSOEID:who.soeid,documentKey:documentKey,action:command.action,at:at,people:snapshotPeople,expectedNativeVersion:p.version.number,priorPublishedParentId:publicationParent(doc),priorStateRevision:state.state.revision,priorAttachmentVersion:state.state.attachmentVersion||0,priorFingerprint:state.state.fingerprint,stage:'reserved',done:false},journal?journal.version.number:null,options(signal));
      }
      async function checkpoint(changes){journal=await storage.putProperty(p.id,JOURNAL,Object.assign({},journal.value,changes),journal.version.number,options(signal));}
      var j=journal.value;
      if(state.document&&state.document.lastRequestId===requestId){if(state.document.singlePageInsight&&command.action==='delete')return finishSingleDelete(p,state.document,journal,requestId,fingerprint,ctx,signal);await ensureSummary(p,state.document,signal);await checkpoint({done:true,stage:'complete'});return loadWithContext({catalog:ctx.catalog,signal:signal,workspaceScope:'document:'+documentKey},ctx);}
      if(state.state.revision!==j.priorStateRevision&&!(state.state.pointer&&state.state.pointer.pending&&state.state.pointer.pending.requestId===requestId&&state.state.pointer.pending.expectedRevision===j.priorStateRevision))fail('The document state changed while this action was pending.','CONFLICT');
      if(['request-changes','complete-review','approve'].includes(command.action)&&actor.role==='Reader')fail('Your active review role is no longer available.','FORBIDDEN');
      var permissionContext={actorId:actor.id,documentId:documentKey,create:creating,edit:E.hasGrant(ctx.policy,who,'content.edit',documentKey)&&op(p,'update'),delete:E.hasGrant(ctx.policy,who,'content.delete',documentKey)&&op(p,'delete')};
      doc=creating?W.createDocument(command.fields,{people:ctx.dir.people,actorId:actor.id,actorSOEID:who.soeid,now:j.at,permissionContext:permissionContext}):W.transition(doc,command.action,{people:ctx.dir.people,actorId:actor.id,actorSOEID:who.soeid,now:j.at,effectiveAt:j.at,nextReviewAt:command.nextReviewAt,governanceReview:command.governanceReview,expectedVersion:command.expectedVersion,expectedRevision:command.expectedRevision,expectedAuditLength:command.expectedAuditLength,changes:command.changes,ownerId:command.ownerId,comment:command.comment,permissionContext:permissionContext,requireGovernance:governanceEnabled,reviewScheduleRequired:governanceEnabled});
      if(!op(p,'update'))fail('Confluence no longer permits this working-page action.','FORBIDDEN');
      // Insights uses ordinary native create/edit access, like the earlier blog
      // publisher. Only the approval workflow provisions assigned editors.
      // Keep existing restrictions untouched; never retry a denial by removing them.
      if(marked(p,'wcs-single-insight'))doc=publicState(doc);
      var single=doc.singlePageInsight===true,direct=Content.isDirectPublication(doc),users=direct?[]:await assignments(doc,ctx.dir.people,signal);
      // Existing drafts may predate automatic assignment or have had native
      // access changed. Reconcile before handing work to the reviewer and when
      // opening a new revision, as well as on initial creation. Restriction
      // failures must stop before the transitioned body/state is persisted.
      if(!direct&&['create','submit','revise'].includes(command.action))await restrictUpdate(p,users,signal);
      var media=await stageMedia(doc,p,state.media||{},p.id,signal);doc._people=j.people||ctx.dir.people;
      if(marked(p,'wcs-operation-'+requestId)?p.version.number!==j.expectedNativeVersion+1:p.version.number!==j.expectedNativeVersion)fail('The native working page changed during this operation.','CONFLICT');
      if(single){
        await destination(doc,signal);await ensureSummary(p,doc,signal);
        if(command.action!=='delete'){
          p=await bodyWrite(p,doc,media,'published',requestId,insightsId,signal);
          doc.publishedConfluencePageId=String(p.id);doc.publishedConfluencePageVersion=p.version.number;doc.publishedReader=p.readerReady===true;
          await syncLabels(p,doc,signal);
        }
      }else if(command.action!=='delete')p=await bodyWrite(p,doc,media,'working',requestId,workingId,signal);
      if(!single&&(command.action==='approve'||(command.action==='reassign-owner'&&doc.publishedConfluencePageId)||(Content.isDirectPublication(doc)&&['create','edit','revise'].includes(command.action)))){
        var dest=await destination(doc,signal),publishedId=doc.publishedConfluencePageId||j.publishedPageId,published;
        if(publishedId){published=await page(publishedId,signal);if(parent(published)!==dest.id&&parent(published)!==workingId&&!(Content.isDirectPublication(doc)&&parent(published)===journal.value.priorPublishedParentId))fail('The published page was moved.','PAGE_SCOPE');if(!marked(published,'wcs-document-'+documentKey))fail('The published document identity changed.','PAGE_SCOPE');if(!op(published,'update'))fail('Confluence does not permit updating the published page.','FORBIDDEN');if(doc.publishedConfluencePageId&&!j.expectedPublishedVersion&&!journal.value.expectedPublishedVersion&&published.version.number!==doc.publishedConfluencePageVersion)fail('The published page changed outside this workflow. Reconcile its native history before approving.','CONFLICT');}
        else{if(!ctx.bounds.canCreate)fail('Publishing needs your Confluence space Add page permission.','FORBIDDEN');published=await createPage('WCSpedia publication '+documentKey,documentKey,'published',requestId,signal);await checkpoint({publishedPageId:published.id,expectedPublishedVersion:published.version.number,stage:'publication-created'});}
        if(!j.expectedPublishedVersion&&!journal.value.expectedPublishedVersion)await checkpoint({publishedPageId:published.id,expectedPublishedVersion:published.version.number,stage:'publication-prepared'});
        if(!op(published,'update'))fail('Confluence does not permit updating the published page.','FORBIDDEN');
        if(!direct&&command.action!=='reassign-owner'){
          var approver=users.find(function(u){return E.normalizeSOEID(u.username)===who.soeid;});if(!approver)fail('Only an assigned publisher can publish.','FORBIDDEN');
          await restrictUpdate(published,[approver],signal,{first:!doc.publishedConfluencePageId});
        }
        var publishedMedia=await stageMedia(doc,published,{},p.id,signal);
        if(marked(published,'wcs-operation-'+requestId)?published.version.number!==journal.value.expectedPublishedVersion+1:published.version.number!==journal.value.expectedPublishedVersion)fail('The published page changed during approval.','CONFLICT');
        published=await bodyWrite(published,doc,publishedMedia,'published',requestId,String(dest.id),signal);
        doc.publishedConfluencePageId=String(published.id);doc.publishedConfluencePageVersion=published.version.number;
        await syncLabels(published,doc,signal);
        doc.publishedReader=published.readerReady===true;
      }
      if(!single&&command.action==='delete'&&doc.publishedConfluencePageId)await trashPublished(doc,signal);
      doc=externalize(doc,media);delete doc._people;doc.nativeSessionWorkflow=true;doc.confluencePageId=String(p.id);doc.confluencePageVersion=p.version.number;doc.lastRequestId=requestId;
      Object.keys(media).forEach(function(k){if(media[k].url){media[k].sourceUrl=media[k].url;if(k.startsWith('data:')){media[media[k].url]=media[k];delete media[k];}}});
      await checkpoint({stage:'native-written'});
      await storage.writeJSON(p.id,FILE,STATE,{schemaVersion:1,document:doc,people:j.people||ctx.dir.people,media:media},{expectedRevision:j.priorStateRevision,expectedAttachmentVersion:j.priorAttachmentVersion,expectedFingerprint:j.priorFingerprint,requestId:requestId,signal:signal});
      await ensureSummary(p,doc,signal);
      if(single&&command.action==='delete')return finishSingleDelete(p,doc,journal,requestId,fingerprint,ctx,signal);
      await checkpoint({done:true,stage:'complete'});
      return loadWithContext({catalog:ctx.catalog,signal:signal,workspaceScope:'document:'+documentKey},ctx);
    }
    return Object.freeze({load:load,submit:submit,capabilities:capabilities});
  }
  return Object.freeze({create:create,STATE_KEY:STATE,STATE_FILENAME:FILE,JOURNAL_KEY:JOURNAL});
});
