'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const B = require('../bootstrap-data.cjs');
const E = require('../entitlements.js');
const C = require('../confluence.js');
const { validateProjection } = require('../confluence-projection.cjs');

function users() {
  return { schemaVersion: 1, users: [
    { id: 'admin-one', soeid: 'AB47149', displayName: 'Admin & Colleague', workflowRole: 'Manager', entitlementAdmin: true, permissions: [...E.PERMISSIONS], confluenceUserKey: 'verified-user-key-1' },
    { id: 'reader-one', soeid: 'CD47149', displayName: 'Reader', workflowRole: 'Reader', entitlementAdmin: false, permissions: [], confluenceUserKey: '' }
  ] };
}
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wcspedia-bootstrap-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }

test('empty seeds have no people, grants, document content or invented audit events', () => {
  const seeds = B.emptySeeds();
  assert.deepEqual(seeds.policy, { schemaVersion: 1, revision: 1, records: [], audit: [] });
  assert.deepEqual(seeds.published.people, []);
  assert.deepEqual(seeds.published.documents, []);
  assert.deepEqual(seeds.published.taxonomyAudit, []);
  assert.equal(seeds.published.isDemo, false);
  assert.equal(seeds.workflow.attachmentVersion, 1);
  assert.deepEqual(seeds.workflow.data, seeds.published);
  assert.doesNotThrow(() => E.validatePolicy(seeds.policy));
  assert.doesNotThrow(() => C.validateData(seeds.workflow.data));
  assert.doesNotThrow(() => validateProjection(seeds.published));
});
test('unfilled user template cannot produce active grants or write a directory', t => {
  const parent = temporary(t), output = path.join(parent, 'live');
  assert.throws(() => B.writeKit(B.createTemplate(), output), /real SOEID|placeholder/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(B.createTemplate().users[0].entitlementAdmin, true);
});
test('a real configured admin can also be the manager, preserving explicit authority and stable identity', () => {
  const input = users(), before = structuredClone(input);
  input.users[0].soeid = ' ab47149 ';
  const kit = B.generate(input, { policyRevision: 7 });
  assert.equal(kit.policy.revision, 7);
  assert.equal(kit.policy.records.length, 1);
  assert.equal(kit.policy.records[0].soeid, 'AB47149');
  assert.equal(kit.policy.records[0].active, true);
  assert.deepEqual(kit.policy.records[0].permissions, [...E.PERMISSIONS].sort());
  assert.equal(kit.published.people[0].role, 'Manager');
  assert.deepEqual(kit.published.people[0].confluence, { username: 'AB47149', userKey: 'verified-user-key-1' });
  assert.deepEqual(kit.published.people[1].confluence, { username: 'CD47149' });
  assert.deepEqual(kit.workflow.data.people, kit.published.people);
  assert.deepEqual(kit.policy.audit, []);
  assert.deepEqual(kit.workflow.data.documents, []);
  input.users[0].soeid = before.users[0].soeid;
  assert.deepEqual(input, before);
});
test('JSON-only artifacts preserve text names and the independent policy revision', () => {
  const input = users(); input.users[0].displayName = '<script>alert(1)</script> & Admin';
  const kit = B.generate(input,{policyRevision:9});
  const files = B.artifacts(kit);
  assert.deepEqual(Object.keys(files).sort(),['entitlements.json','wcspedia-published.json','wcspedia-workflow-initial.json']);
  assert.equal(Object.hasOwn(kit,'table'),false);
  const parsed = E.validatePolicy(JSON.parse(files['entitlements.json']));
  assert.deepEqual(parsed.records, kit.policy.records);
  assert.equal(parsed.records[0].displayName,input.users[0].displayName);
  assert.equal(parsed.revision, 9);
  assert.equal(kit.policy.revision, 9);
  assert.deepEqual(parsed.audit, []);
});
test('only taxonomy is reused and every generated model validates with the production modules', () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../confluence-upload/attachments/wcspedia-published.json'), 'utf8'));
  const kit = B.generate(users());
  assert.deepEqual(kit.published.areas, source.areas);
  assert.deepEqual(kit.published.types, source.types);
  assert.equal(kit.published.areas.length, 8);
  assert.equal(kit.published.isDemo, false);
  assert.equal(kit.published.sampleNotice, undefined);
  assert.equal(kit.published.people.some(person => ['alex', 'jordan', 'sam'].includes(person.id)), false);
  assert.doesNotThrow(() => E.validatePolicy(kit.policy));
  assert.doesNotThrow(() => C.validateData(kit.workflow.data));
  assert.doesNotThrow(() => validateProjection(kit.published));
  kit.workflow.data.people[0].name = 'Changed';
  assert.notEqual(kit.published.people[0].name, 'Changed');
});
test('duplicate normalized identities, IDs and immutable keys are rejected', () => {
  for (const mutation of [
    input => { input.users[1].soeid = 'ab47149'; },
    input => { input.users[1].id = input.users[0].id; },
    input => { input.users[1].confluenceUserKey = input.users[0].confluenceUserKey; }
  ]) {
    const input = users(); mutation(input);
    assert.throws(() => B.generate(input), /must be unique/);
  }
});
test('workflow roles, explicit permission sets and admin flags cannot silently grant authority', () => {
  for (const mutation of [
    input => { input.users[0].workflowRole = 'Admin'; },
    input => { delete input.users[0].permissions; },
    input => { input.users[0].permissions = ['admin']; },
    input => { input.users[0].permissions.push(input.users[0].permissions[0]); },
    input => { input.users[0].permissions = ['content.edit']; },
    input => { input.users[0].entitlementAdmin = false; },
    input => { input.users[0].role = 'Manager'; },
    input => { input.users[0].active = true; },
    input => { input.users[0].entitlementAdmin = false; input.users[0].permissions = []; }
  ]) {
    const input = users(); mutation(input);
    assert.throws(() => B.generate(input));
  }
});
test('placeholder identity values, invalid schema and unsafe revisions fail before generation', () => {
  for (const [field, value] of [['soeid', 'REPLACE_WITH_SOEID'], ['id', 'change-me'], ['displayName', 'REPLACE_WITH_NAME'], ['confluenceUserKey', 'REPLACE_WITH_USER_KEY'], ['soeid', 'DOMAIN\\AB47149']]) {
    const input = users(); input.users[0][field] = value; assert.throws(() => B.generate(input));
  }
  assert.throws(() => B.generate({ ...users(), schemaVersion: 2 }));
  for (const policyRevision of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => B.generate(users(), { policyRevision }), /Policy revision/);
});
test('seed output is private, complete, and never overwrites an existing directory', t => {
  const parent = temporary(t), output = path.join(parent, 'live');
  const result = B.writeKit(users(), output);
  assert.deepEqual(fs.readdirSync(output).sort(), ['entitlements.json', 'wcspedia-published.json', 'wcspedia-workflow-initial.json']);
  assert.equal(result.outputDirectory, output);
  assert.equal(fs.statSync(output).mode & 0o777, 0o700);
  for (const name of result.files) assert.equal(fs.statSync(path.join(output, name)).mode & 0o777, 0o600);
  const prior = fs.readFileSync(path.join(output, 'entitlements.json'), 'utf8');
  assert.throws(() => B.writeKit(users(), output), error => error.code === 'EEXIST');
  assert.equal(fs.readFileSync(path.join(output, 'entitlements.json'), 'utf8'), prior);
});
test('CLI generates seeds with an explicit policy revision and rejects duplicate or invalid flags', t => {
  const parent = temporary(t), input = path.join(parent, 'users.json'), output = path.join(parent, 'live');
  fs.writeFileSync(input, JSON.stringify(users()));
  const script = path.join(__dirname, '../bootstrap-data.cjs');
  const run = spawnSync(process.execPath, [script, '--users', input, '--out', output, '--policy-revision', '4'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Created three first-install JSON seed files/);
  assert.match(run.stdout, /No Confluence changes or backend deployment/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'entitlements.json'), 'utf8')).revision, 4);
  for (const flags of [['--users', input, '--users', input, '--out', path.join(parent, 'bad')], ['--users', input, '--out', path.join(parent, 'bad'), '--policy-revision', '1.5']]) {
    const failure = spawnSync(process.execPath, [script, ...flags], { encoding: 'utf8' });
    assert.equal(failure.status, 1);
    assert.equal(fs.existsSync(path.join(parent, 'bad')), false);
  }
});
