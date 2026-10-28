'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../entitlements.js');
const H = require('../content-health.js');
const C = require('../confluence.js');
const B = require('../bootstrap-data.cjs');
const {createWorkflowService, readerProjection} = require('../publication-workflow.cjs');
const {createFileJournal} = require('../confluence-publisher.cjs');
const folder = path.join(__dirname, '../confluence-data-starters');
const read = name => fs.readFileSync(path.join(folder,name),'utf8');
const json = name => JSON.parse(read(name));

test('delivered files contain only the requested BR47149 bootstrap identity and agree with the generator', () => {
  const input=json('initial-users.json'), policy=json('entitlements.json');
  assert.deepEqual(input.users.map(user=>user.soeid),['BR47149']);
  const generated=B.artifacts(B.generate(input,{policyRevision:policy.revision}));
  for (const [name,bytes] of Object.entries(generated)) assert.equal(read(name),bytes,name);
  const seed=json('wcspedia-workflow-initial.json'), published=json('wcspedia-published.json');
  C.validateData(seed.data);
  assert.deepEqual(readerProjection(seed.data),published);
  assert.deepEqual(seed.data.documents,[]);
  assert.deepEqual(policy.audit,[]);
  assert.equal(published.people[0].role,'Manager');
  assert.equal(published.people[0].name,'BR47149');
  assert.equal(published.people[0].permissions,undefined);
  assert.equal(published.entitlementPolicy,undefined);
});

test('JSON is the sole generated entitlement source and retains the initial grant', () => {
  const policy=json('entitlements.json');
  const files=B.artifacts(B.generate(json('initial-users.json'),{policyRevision:policy.revision}));
  assert.deepEqual(Object.keys(files).sort(),['entitlements.json','wcspedia-published.json','wcspedia-workflow-initial.json']);
  assert.deepEqual(E.validatePolicy(JSON.parse(files['entitlements.json'])),policy);
  assert.equal(policy.revision,1);
  assert.equal(fs.existsSync(path.join(folder,'wcspedia-entitlements.json')),false);
  assert.equal(policy.records[0].soeid,'BR47149');
  assert.deepEqual(policy.records[0].permissions,E.PERMISSIONS.slice().sort());
});

test('bootstrap grants still require native rights, and entitlement changes do not silently assign workflow roles', () => {
  const policy=json('entitlements.json'), identity={soeid:'BR47149'};
  const native={entitlements:[{operation:'read',targetType:'page'},{operation:'update',targetType:'page'}]};
  assert.equal(E.effective(policy,identity,'entitlements.add',{native}),true);
  assert.equal(E.effective(policy,identity,'entitlements.add',{native:{}}),false);
  assert.equal(E.effective(policy,{soeid:'ZZ00000'},'entitlements.add',{native}),false);
  const next=E.applyCommand(policy,{action:'add',expectedRevision:policy.revision,comment:'Test colleague onboarding.',record:{id:'test-colleague',soeid:'ZZ00000',displayName:'Test colleague',scope:'*',permissions:['content.edit'],active:true}},{identity,native,now:'2026-10-16T12:00:00Z'});
  assert.equal(next.records.length,2);
  assert.equal(next.audit[0].actorSOEID,'BR47149');
  assert.deepEqual(json('wcspedia-workflow-initial.json').data.people.map(person=>person.soeid),['BR47149']);
  assert.equal(next.records[1].role,undefined);
});

test('real private journal initializes the supplied shared workspace once and preserves it on restart', async t => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wcspedia-seed-check-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const directory=path.join(base,'journal');
  let loads=0;
  const forbidden=()=>{throw Error('No network or publication should occur during initialization.');};
  const options={rootPageId:'100',publisher:{validate:forbidden,configurationCheck:forbidden,syncWorking:forbidden,publishApproved:forbidden,trashDocument:forbidden},loadInitialState:async()=>{loads++;return json('wcspedia-workflow-initial.json');},authenticate:forbidden,loadPolicy:forbidden,nativeAccess:forbidden,writeProjection:forbidden};
  const first=createWorkflowService({...options,journal:createFileJournal(directory)});
  const snapshot=await first.snapshot();
  assert.equal(loads,1);
  assert.deepEqual(snapshot.data,json('wcspedia-workflow-initial.json').data);
  const restarted=createWorkflowService({...options,journal:createFileJournal(directory),loadInitialState:forbidden});
  assert.deepEqual(await restarted.snapshot(),snapshot);
  assert.equal(fs.statSync(directory).mode&0o777,0o700);
  const files=fs.readdirSync(directory);
  assert.equal(files.length,1);
  assert.match(files[0],/^[a-f0-9]{64}\.json$/);
  assert.equal(fs.statSync(path.join(directory,files[0])).mode&0o777,0o600);
  const persisted=JSON.parse(fs.readFileSync(path.join(directory,files[0]),'utf8'));
  assert.equal(persisted.pending,null);
  assert.deepEqual(persisted.completed,{});
});

test('rule reference matches built-in defaults without inventing a saved record or audit event', () => {
  assert.deepEqual(json('reference/content-health-defaults.json'),H.defaults());
  const initial=H.initial({id:'test-document',ownerId:'person-br47149'});
  H.validate(initial,'test-document');
  assert.deepEqual(initial.rules,json('reference/content-health-defaults.json'));
  assert.equal(initial.revision,0);
  assert.equal(initial.rulesRevision,0);
  assert.deepEqual(initial.audit,[]);
});
