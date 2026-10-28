'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const discovery = require('./discovery.js');
const { searchDocuments } = discovery;
const workflow = require('./workflow.js');

const people = [
  {id:'author', name:'Alex Morgan', role:'Author'},
  {id:'manager', name:'Jordan Lee', role:'Manager'},
  {id:'reviewer', name:'Casey West', role:'Author'},
  {id:'other', name:'Taylor Green', role:'Manager'},
  {id:'reader', name:'Reader', role:'Reader'}
];
function version(title, overrides={}) {
  return {version:1, revision:1, status:'Published', title, summary:'An approved procedure.',
    sections:[{title:'Checks', paragraphs:['Keep the evidence record.'], bullets:['Confirm handover.']}],
    createdAt:'2026-10-01T08:00:00Z', approvedAt:'2026-10-03T08:00:00Z', ...overrides};
}
function doc(id, title, overrides={}) {
  return {id, reference:'WCS-JA-'+id, area:'credit', type:'Job aid', ownerId:'author', authorId:'author',
    reviewerId:'manager', approverId:'manager', publishedVersion:1, versions:[version(title)], audit:[], ...overrides};
}
const revised = doc('1','Credit approval checklist', {
  versions:[version('Credit approval checklist'), version('Unpublished cobalt instructions', {version:2,status:'In review',approvedAt:null})],
  audit:[{version:2,at:'2026-10-15T08:00:00Z'}]
});
const docs = [
  revised,
  doc('2','Prepare a record',{area:'loans',type:'Procedure',versions:[version('Prepare a record', {
    approvedAt:'2026-10-10T08:00:00Z',summary:'Check credit approval evidence.'
  })]}),
  doc('3','Ready for decision',{publishedVersion:null,versions:[version('Ready for decision',{status:'Awaiting approval',approvedAt:null})],reviewerId:'reviewer'}),
  doc('4','Draft document',{publishedVersion:null,versions:[version('Draft document',{status:'Draft',approvedAt:null})]}),
  doc('5','Owner knowledge',{ownerId:'other',authorId:'reviewer',reviewerId:'manager',versions:[version('Owner knowledge', {approvedAt:'2026-10-05T08:00:00Z'})],type:'Knowledge sharing'})
];
const search = options => searchDocuments(docs,{people,...options},workflow);
const ids = rows => rows.map(row=>row.d.id);

test('latest includes a 2025 Insight republished today but ignores private draft activity',()=>{
  const older=doc('older','Updated older Insight',{type:'Blog',versions:[version('Updated older Insight',{createdAt:'2025-02-01T08:00:00Z',approvedAt:null,publishedAt:'2026-10-23T11:45:00Z'})]});
  const recent=doc('recent','Recent publication',{versions:[version('Recent publication',{approvedAt:'2026-10-22T08:00:00Z'})]});
  const draft=doc('draft','Old public snapshot',{versions:[version('Old public snapshot',{approvedAt:'2025-05-01T08:00:00Z'}),version('Private revision',{version:2,status:'Draft',approvedAt:null,createdAt:'2026-10-23T12:00:00Z'})],audit:[{version:2,at:'2026-10-23T12:00:00Z'}]});
  assert.deepEqual(ids(searchDocuments([draft,recent,older],{sort:'updated'},workflow)),['older','recent','draft']);
  assert.equal(discovery.modifiedAt(older,older.versions[0]),Date.parse('2026-10-23T11:45:00Z'));
  older.versions[0].publishedAt='invalid';
  assert.equal(discovery.modifiedAt(older,older.versions[0]),Date.parse('2025-02-01T08:00:00Z'));
});

test('published search uses only the exact current published snapshot',()=>{
  assert.deepEqual(ids(search({query:'credit'})),['1','2']);
  assert.equal(search({query:'credit'})[0].v.version,1);
  assert.deepEqual(search({query:'cobalt'}),[]);
  assert.deepEqual(search({query:'draft'}),[]);
  assert.deepEqual(search({query:'decision'}),[]);
});
test('publishing a replacement removes obsolete snapshot content from discovery',()=>{
  const changed=structuredClone(revised);
  changed.versions[1].status='Published'; changed.publishedVersion=2;
  assert.deepEqual(searchDocuments([changed],{query:'checklist'},workflow),[]);
  assert.equal(searchDocuments([changed],{query:'cobalt'},workflow)[0].v.version,2);
});
test('every token must match, including reference, type, body and owner',()=>{
  assert.deepEqual(ids(search({query:'WCS-JA-2 procedure evidence Morgan'})),['2']);
  assert.deepEqual(ids(search({query:'handover knowledge Taylor'})),['5']);
  assert.deepEqual(search({query:'credit nonexistent'}),[]);
});
test('area and type filters combine with the query',()=>{
  assert.deepEqual(ids(search({area:'credit',type:'Job aid',query:'approval'})),['1']);
  assert.deepEqual(search({area:'credit',type:'Procedure'}),[]);
  assert.deepEqual(search({area:'unknown'}),[]);
  const areas=[{id:'loans',title:'Loan Management'},{id:'credit',title:'Credit Approval Control'}];
  assert.deepEqual(ids(search({query:'Loan Management',areas})),['2']);
  assert.deepEqual(ids(search({query:'Credit Approval Control',areas})).sort(),['1','5']);
  assert.deepEqual(search({query:'Loan Management',areas,type:'Job aid'}),[]);
});
test('literal punctuation has no regular-expression behavior',()=>{
  const special=[doc('literal','Resolve C++ [review] (.*) \\ issues')];
  assert.equal(searchDocuments(special,{query:'C++ [review] (.*) \\'},workflow).length,1);
  assert.equal(searchDocuments(special,{query:'[missing]'},workflow).length,0);
  assert.doesNotThrow(()=>searchDocuments(special,{query:'[('},workflow));
  assert.equal(searchDocuments(special,{query:'.*'},workflow).length,1);
  assert.deepEqual(search({query:'.*'}),[]);
});
test('case, whitespace and Unicode compatibility forms normalize without losing token requirements',()=>{
  assert.deepEqual(ids(search({query:'  ＣＲＥＤＩＴ\n\tapproval  '})),['1','2']);
});
test('title phrase matches rank above body or summary matches regardless of recency',()=>{
  assert.deepEqual(ids(search({query:'credit approval',sort:'relevance'})),['1','2']);
  assert.deepEqual(ids(search({query:'credit approval'})),['1','2']);
  assert.deepEqual(ids(search({query:'credit approval',sort:'updated'})),['2','1']);
  assert.deepEqual(ids(search({query:'credit approval',sort:'recent'})),['2','1']);
});
test('blank default search sorts by published date unaffected by pending activity',()=>{
  assert.deepEqual(ids(search({query:'  '})),['2','5','1']);
  assert.deepEqual(ids(search({sort:'updated'})),['2','5','1']);
  assert.deepEqual(ids(search({sort:'title'})),['1','5','2']);
});
test('blank browsing preserves filters without reading full-text fields',()=>{
  const snapshot=version('Browse approved knowledge',{tags:['Quality'],processes:['Checks'],regions:['EMEA']});
  for(const field of ['sections','summary','attachments'])Object.defineProperty(snapshot,field,{get(){throw new Error('Unnecessary full-text read: '+field);}});
  const visible=doc('visible','Unused',{versions:[snapshot]});
  const draft=doc('draft','Private draft',{publishedVersion:null,versions:[version('Private draft',{status:'Draft'})]});
  const rows=[draft,visible];
  for(const query of ['', ' \n\t ', undefined])for(const sort of ['relevance','updated','title','most-viewed','least-viewed']) {
    assert.deepEqual(ids(searchDocuments(rows,{query,sort,tag:'quality',process:'checks',region:'emea',area:'credit',type:'Job aid'},workflow)),['visible']);
  }
  assert.deepEqual(searchDocuments(rows,{query:' ',region:'APAC'},workflow),[]);
});
test('date and measured-view ordering avoid title comparisons when the primary order differs',()=>{
  const rows=[doc('old','Old'),doc('new','New',{versions:[version('New',{approvedAt:'2026-10-10'})]})];
  for(const row of rows)Object.defineProperty(row.versions[0],'title',{get(){throw new Error('Unnecessary title comparison');}});
  for(const sort of ['relevance','updated','most-viewed'])assert.deepEqual(ids(searchDocuments(rows,{sort,viewCounts:{old:1,new:2}},workflow)),['new','old']);
  assert.deepEqual(ids(searchDocuments(rows,{sort:'least-viewed',viewCounts:{old:1,new:2}},workflow)),['old','new']);
});
test('title ties retain English base sensitivity and immutable-ID ordering',()=>{
  const rows=[doc('z','Évidence'),doc('a','evidence'),doc('new','Zebra',{versions:[version('Zebra',{approvedAt:'2026-10-10'})]})];
  for(const input of [rows,rows.slice().reverse()]) {
    assert.deepEqual(ids(searchDocuments(input,{sort:'title'},workflow)),['a','z','new']);
    assert.deepEqual(ids(searchDocuments(input,{sort:'updated'},workflow)),['new','a','z']);
  }
  const ranked=[doc('z','Credit approval'),doc('a','CREDIT APPROVAL'),doc('recent','A record',{versions:[version('A record',{summary:'Credit approval',approvedAt:'2026-10-10'})]})];
  assert.deepEqual(ids(searchDocuments(ranked,{query:'credit approval',sort:'relevance'},workflow)),['a','z','recent']);
});
test('my work selects current snapshots only for the actor’s authored or owned documents',()=>{
  assert.deepEqual(ids(search({view:'mine',actorId:'author',query:'cobalt'})),['1']);
  assert.equal(search({view:'mine',actorId:'author',query:'cobalt'})[0].v.version,2);
  assert.deepEqual(ids(search({view:'mine',actorId:'other'})),['5']);
  assert.deepEqual(ids(search({view:'mine',actorId:'reviewer'})),['5']);
  assert.deepEqual(search({view:'mine',actorId:'manager'}),[]);
});
test('review queue requires the pending-stage assignment',()=>{
  assert.deepEqual(ids(search({view:'review',actorId:'manager'})),['1','3']);
  assert.deepEqual(search({view:'review',actorId:'reviewer'}),[]);
  assert.deepEqual(search({view:'review',actorId:'other'}),[]);
  const split=doc('split','Split assignment',{publishedVersion:null,reviewerId:'reviewer',approverId:'manager',versions:[version('Split assignment',{status:'In review'})]});
  assert.equal(searchDocuments([split],{view:'review',actorId:'reviewer',people},workflow).length,1);
  assert.equal(searchDocuments([split],{view:'review',actorId:'manager',people},workflow).length,0);
});
test('reader, unknown and missing actors cannot retrieve working snapshots',()=>{
  for(const actorId of ['reader','unknown',undefined])for(const view of ['mine','review']) {
    assert.deepEqual(search({view,actorId}),[]);
  }
  assert.deepEqual(searchDocuments(docs,{view:'review',actorId:'manager'},workflow),[]);
});
test('author cannot appear as their own reviewer and approval requires a manager role',()=>{
  const self=doc('self','Self assigned',{publishedVersion:null,reviewerId:'author',versions:[version('Self assigned',{status:'In review'})]});
  assert.deepEqual(searchDocuments([self],{view:'review',actorId:'author',people},workflow),[]);
  const wrongRole=doc('role','Wrong role',{publishedVersion:null,approverId:'reviewer',versions:[version('Wrong role',{status:'Awaiting approval'})]});
  assert.deepEqual(searchDocuments([wrongRole],{view:'review',actorId:'reviewer',people},workflow),[]);
});
test('searching and sorting do not mutate the source documents or snapshots',()=>{
  const before=JSON.stringify(docs);
  search({view:'mine',actorId:'author',sort:'updated'});
  search({sort:'title'});
  assert.equal(JSON.stringify(docs),before);
  assert.deepEqual(Object.keys(search({query:'credit'})[0]),['d','v']);
});

test('versioned topics, processes, regions, and attachment names participate in discovery', () => {
  const wf = {publishedVersion:d=>d.versions[0],currentVersion:d=>d.versions.at(-1)};
  const docs = [{id:'a',type:'Training',area:'ops',versions:[{title:'Control learning',summary:'Learn the process',status:'Published',tags:['Quality'],processes:['Deal closing'],regions:['EMEA'],attachments:[{name:'Checklist.pdf'}],sections:[]}]}];
  for (const query of ['quality','deal closing','emea','checklist.pdf']) assert.equal(discovery.searchDocuments(docs,{query},wf).length,1);
  assert.equal(discovery.searchDocuments(docs,{tag:'quality',process:'Deal closing',region:'EMEA'},wf).length,1);
  assert.equal(discovery.searchDocuments(docs,{region:'APAC'},wf).length,0);
});

test('related content ranks shared processes, excludes drafts, and ignores a region-only match', () => {
  const wf={publishedVersion:d=>d.versions.find(v=>v.status==='Published')};
  const version=(title,fields={})=>({title,status:'Published',approvedAt:'2026-10-01',...fields});
  const current={id:'current',area:'a'},v=version('Current',{tags:['Quality'],processes:['Handover'],regions:['Global']});
  const docs=[current,{id:'area',area:'a',versions:[version('Same area')]},{id:'training',type:'Training',area:'b',versions:[version('Training',{processes:['Handover']})]},{id:'draft',area:'a',versions:[version('Draft',{status:'Draft',processes:['Handover']})]},{id:'global',area:'b',versions:[version('Unrelated',{regions:['Global']})]}];
  assert.deepEqual(discovery.relatedDocuments(docs,current,v,wf).map(r=>r.d.id),['training','area']);
});


test('deleted records are excluded from every discovery view and related content even with a permissive adapter', () => {
  const deleted = doc('gone','Withdrawn procedure',{deletedAt:'2026-10-15T08:00:00Z'});
  const pending = doc('pending','Withdrawn draft',{deletedAt:'2026-10-15T08:00:00Z',publishedVersion:null,versions:[version('Withdrawn draft',{status:'In review'})]});
  const permissive = {publishedVersion:d=>d.versions[0],currentVersion:d=>d.versions.at(-1)};
  for (const view of ['published','mine','review']) {
    assert.deepEqual(searchDocuments([deleted,pending],{view,people,actorId:view==='review'?'manager':'author'},permissive),[]);
  }
  assert.deepEqual(discovery.relatedDocuments([deleted],{id:'current',area:'credit'},version('Current'),permissive),[]);
});

test('a reviewer who contributed to the working version is excluded from their own review queue', () => {
  const contributed = doc('contributed','Contributed procedure',{publishedVersion:null,versions:[version('Contributed procedure',{status:'In review',contributorIds:['author','manager']})]});
  assert.deepEqual(searchDocuments([contributed],{view:'review',people,actorId:'manager'},workflow),[]);
});


test('a known entitled author retains their own workspace regardless of presentation role', () => {
  const own = doc('reader-authored','My entitled draft',{authorId:'reader',ownerId:'reader',publishedVersion:null,versions:[version('My entitled draft',{status:'Draft'})]});
  assert.deepEqual(ids(searchDocuments([own],{view:'mine',people,actorId:'reader'},workflow)),['reader-authored']);
  assert.deepEqual(searchDocuments([own],{view:'mine',people,actorId:'other'},workflow),[]);
});

test('reading-time sorting uses precise seconds instead of rounded display minutes', () => {
  const longer=doc('longer','Longer',{versions:[version('Same',{bodyMarkdown:'One two',summary:'',approvedAt:'2026-10-15'})]});
  const shorter=doc('shorter','Shorter',{versions:[version('Same',{bodyMarkdown:'One',summary:'',approvedAt:'2026-10-01'})]});
  const rows=[longer,shorter];
  assert.deepEqual(ids(searchDocuments(rows,{sort:'shortest'},workflow)),['shorter','longer']);
  assert.deepEqual(ids(searchDocuments(rows,{sort:'longest'},workflow)),['longer','shorter']);
  const metrics=require('./document-metrics.js');
  assert.equal(metrics.estimate(longer.versions[0]).minutes,metrics.estimate(shorter.versions[0]).minutes);
});

test('reading-time sorting uses the selected published or working snapshot and includes image time', () => {
  const first=doc('first','First',{versions:[version('Same',{bodyMarkdown:'Short',summary:''}),version('Same',{version:2,status:'Draft',bodyMarkdown:Array(200).fill('Word').join(' '),summary:'',approvedAt:null})]});
  const second=doc('second','Second',{versions:[version('Same',{bodyMarkdown:'![Cover](https://example.com/image.png)',summary:''})]});
  assert.deepEqual(ids(searchDocuments([first,second],{sort:'shortest'},workflow)),['first','second']);
  assert.deepEqual(ids(searchDocuments([first,second],{sort:'shortest',view:'mine',people,actorId:'author'},workflow)),['second','first']);
  assert.equal(searchDocuments([first,second],{sort:'shortest'},workflow)[0].v.version,1);
});

test('view-count sorting respects measured zeroes and leaves missing counts last in either direction', () => {
  const rows=['many','few','zero','unknown'].map(id=>doc(id,id));
  const viewCounts={many:240,few:3,zero:0,unknown:null};
  assert.deepEqual(ids(searchDocuments(rows,{sort:'most-viewed',viewCounts},workflow)),['many','few','zero','unknown']);
  assert.deepEqual(ids(searchDocuments(rows,{sort:'least-viewed',viewCounts},workflow)),['zero','few','many','unknown']);
  assert.deepEqual(ids(searchDocuments(rows,{sort:'most-viewed',viewCounts:{many:240}},workflow)),['many','few','unknown','zero']);
});

test('unsafe, inherited, string or non-integer view counts are unknown, never coerced', () => {
  const rows=['known','negative','fraction','string','infinity','unsafe','missing'].map(id=>doc(id,id));
  const viewCounts={known:0,negative:-1,fraction:1.2,string:'200',infinity:Infinity,unsafe:Number.MAX_SAFE_INTEGER+1};
  for(const sort of ['most-viewed','least-viewed']) {
    assert.equal(searchDocuments(rows,{sort,viewCounts},workflow)[0].d.id,'known');
    assert.deepEqual(ids(searchDocuments(rows,{sort,viewCounts},workflow)).slice(1),['fraction','infinity','missing','negative','string','unsafe']);
  }
  const nullPrototype=Object.assign(Object.create(null),{known:2,negative:1});
  assert.deepEqual(ids(searchDocuments(rows.slice(0,2),{sort:'most-viewed',viewCounts:nullPrototype},workflow)),['known','negative']);
  const inherited=Object.create({negative:100});
  assert.deepEqual(ids(searchDocuments(rows.slice(0,2),{sort:'most-viewed',viewCounts:inherited},workflow)),['known','negative']);
  assert.deepEqual(ids(searchDocuments(rows.slice(0,2),{sort:'most-viewed',viewCounts:new Map([['negative',100]])},workflow)),['known','negative']);
});

test('metric-sort ties use updated date then title then immutable ID independent of source order', () => {
  const rows=[doc('z','Same'),doc('a','Same'),doc('new','Title',{versions:[version('Title',{approvedAt:'2026-10-10'})]})];
  const viewCounts={z:1,a:1,new:1};
  for(const sort of ['shortest','longest','most-viewed','least-viewed']) {
    assert.deepEqual(ids(searchDocuments(rows,{sort,viewCounts},workflow)),['new','a','z']);
    assert.deepEqual(ids(searchDocuments(rows.slice().reverse(),{sort,viewCounts},workflow)),['new','a','z']);
  }
});

test('metric sorts preserve filters and row shape without mutating snapshots or counters', () => {
  const viewCounts={'1':3,'2':4,'3':50,'5':10};
  const before=JSON.stringify({docs,viewCounts});
  for(const sort of ['shortest','longest','most-viewed','least-viewed']) {
    const rows=searchDocuments(docs,{query:'credit',type:'Job aid',sort,viewCounts},workflow);
    assert.deepEqual(ids(rows),['1']);
    assert.deepEqual(Object.keys(rows[0]),['d','v']);
    assert.equal(rows[0].d,docs[0]);
  }
  assert.equal(JSON.stringify({docs,viewCounts}),before);
});
