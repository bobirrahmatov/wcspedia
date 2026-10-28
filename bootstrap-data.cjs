'use strict';
/* Offline first-install seed generator. This does not deploy HTTP services,
 * authenticate users, modify Confluence, or migrate an existing library. */
const fs = require('node:fs');
const path = require('node:path');
const E = require('./entitlements.js');
const C = require('./confluence.js');
const { validateProjection } = require('./confluence-projection.cjs');

const ADMIN_PERMISSIONS = Object.freeze(['entitlements.view', 'entitlements.add', 'entitlements.edit', 'entitlements.revoke']);
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message) { throw new Error(message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(label + ' has unsupported fields.');
}
function placeholder(value) { return /replace[\s_-]*with|change[\s_-]*me|your[\s_-]*(?:soeid|name|user|id)|example|placeholder|<|>/i.test(value); }
function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail(label + ' must be nonempty text of at most ' + maximum + ' characters.');
  return value.trim();
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('Policy revision must be a positive safe integer; it is independent of Confluence page and attachment versions.');
  return value;
}
function createTemplate() {
  return {
    schemaVersion: 1,
    users: [
      { id: 'initial-admin', soeid: 'REPLACE_WITH_ADMIN_SOEID', displayName: 'REPLACE_WITH_ADMIN_NAME', workflowRole: 'Reader', entitlementAdmin: true, permissions: [...E.PERMISSIONS], confluenceUserKey: '' },
      { id: 'initial-manager', soeid: 'REPLACE_WITH_MANAGER_SOEID', displayName: 'REPLACE_WITH_MANAGER_NAME', workflowRole: 'Manager', entitlementAdmin: false, permissions: ['content.create', 'content.edit'], confluenceUserKey: '' }
    ]
  };
}
function emptyData() {
  // Copy only taxonomy from the production upload starter, never demo users,
  // documents, approvals, or history from the local prototype.
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'confluence-upload/attachments/wcspedia-published.json'), 'utf8'));
  C.validateData(source);
  const data = { schemaVersion: 1, isDemo: false, people: [], areas: clone(source.areas), types: clone(source.types), documents: [], taxonomyRevision: 1, taxonomyAudit: [] };
  validateProjection(data);
  return data;
}
function emptySeeds(options = {}) {
  const policy = E.validatePolicy({ schemaVersion: 1, revision: revision(options.policyRevision ?? 1), records: [], audit: [] });
  const data = emptyData();
  return { policy, workflow: { data: clone(data), attachmentVersion: 1 }, published: data };
}
function validateUsers(input) {
  fields(input, ['schemaVersion', 'users'], 'Initial users configuration');
  if (input.schemaVersion !== 1 || !Array.isArray(input.users) || input.users.length < 1 || input.users.length > 1000) fail('Use schemaVersion 1 and between 1 and 1,000 real directory users.');
  const ids = new Set(), soeids = new Set(), userKeys = new Set();
  const users = input.users.map((entry, index) => {
    const label = 'User ' + (index + 1);
    fields(entry, ['id', 'soeid', 'displayName', 'workflowRole', 'entitlementAdmin', 'permissions', 'confluenceUserKey'], label);
    const id = requiredText(entry.id, label + ' ID', 100);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id) || placeholder(id)) fail(label + ' needs a stable non-placeholder ID using letters, numbers, periods, underscores, colons or hyphens.');
    const soeidText = requiredText(entry.soeid, label + ' SOEID', 32);
    const soeid = E.normalizeSOEID(soeidText);
    if (!soeid || placeholder(soeidText)) fail(label + ' needs a real SOEID, not a placeholder.');
    const displayName = requiredText(entry.displayName, label + ' display name', 150);
    // Names remain plain text in JSON; presentation code escapes rendered text.
    if (/replace[\s_-]*with|change[\s_-]*me|placeholder/i.test(displayName)) fail(label + ' needs a real display name, not a placeholder.');
    if (!['Reader', 'Author', 'Manager'].includes(entry.workflowRole)) fail(label + ' workflowRole must be Reader, Author or Manager; Admin is an entitlement permission set.');
    if (typeof entry.entitlementAdmin !== 'boolean') fail(label + ' entitlementAdmin must explicitly be true or false.');
    if (!Array.isArray(entry.permissions) || new Set(entry.permissions).size !== entry.permissions.length || entry.permissions.some(permission => !E.PERMISSIONS.includes(permission))) fail(label + ' permissions must explicitly list distinct supported permission names.');
    const fullAdmin = ADMIN_PERMISSIONS.every(permission => entry.permissions.includes(permission));
    if (entry.entitlementAdmin !== fullAdmin) fail(label + ' entitlementAdmin must agree with the complete set of four entitlements.* administration permissions.');
    if (entry.confluenceUserKey != null && typeof entry.confluenceUserKey !== 'string') fail(label + ' Confluence user key must be text.');
    const userKey = (entry.confluenceUserKey || '').trim();
    if (userKey && (userKey.length > 255 || /[\u0000-\u001f\u007f]/.test(userKey) || placeholder(userKey))) fail(label + ' Confluence user key must be a real value from Confluence or an empty string.');
    if (ids.has(id) || soeids.has(soeid) || userKey && userKeys.has(userKey)) fail('Directory IDs, normalized SOEIDs and nonempty Confluence user keys must be unique. Consolidate multiple roles for the same person into one entry.');
    ids.add(id); soeids.add(soeid); if (userKey) userKeys.add(userKey);
    return { id, soeid, displayName, workflowRole: entry.workflowRole, entitlementAdmin: entry.entitlementAdmin, permissions: entry.permissions.slice(), userKey };
  });
  if (!users.some(user => user.entitlementAdmin)) fail('At least one real initial entitlement administrator is required.');
  return users;
}
function generate(input, options = {}) {
  const users = validateUsers(input);
  const result = emptySeeds(options);
  result.policy.records = users.filter(user => user.permissions.length).map(user => ({ id: 'grant-' + user.id, soeid: user.soeid, displayName: user.displayName, scope: '*', permissions: user.permissions, active: true }));
  result.policy = E.validatePolicy(result.policy);
  result.published.people = users.map(user => ({ id: user.id, name: user.displayName, soeid: user.soeid, role: user.workflowRole, confluence: { username: user.soeid, ...(user.userKey ? { userKey: user.userKey } : {}) } }));
  C.validateData(result.published);
  validateProjection(result.published);
  result.workflow.data = clone(result.published);
  return result;
}
function artifacts(result) {
  const json = value => JSON.stringify(value, null, 2) + '\n';
  return {
    'entitlements.json': json(result.policy),
    'wcspedia-workflow-initial.json': json(result.workflow),
    'wcspedia-published.json': json(result.published)
  };
}
function writeKit(input, outputDirectory, options = {}) {
  const result = generate(input, options);
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) fail('A new output directory is required.');
  const output = path.resolve(outputDirectory);
  // mkdir without recursive creation refuses existing directories and symlinks.
  // Validation precedes all writes, including directory creation.
  fs.mkdirSync(output, { mode: 0o700 });
  fs.chmodSync(output, 0o700);
  for (const [filename, bytes] of Object.entries(artifacts(result))) {
    const destination = path.join(output, filename);
    fs.writeFileSync(destination, bytes, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.chmodSync(destination, 0o600);
  }
  return { outputDirectory: output, files: Object.keys(artifacts(result)) };
}
function main(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!['--users', '--out', '--policy-revision'].includes(key) || values[key] !== undefined || !value || value.startsWith('--')) fail('Usage: node bootstrap-data.cjs --users FILE --out NEW_DIRECTORY [--policy-revision INTEGER]');
    values[key] = value;
  }
  if (!values['--users'] || !values['--out']) fail('Usage: node bootstrap-data.cjs --users FILE --out NEW_DIRECTORY [--policy-revision INTEGER]');
  if (values['--policy-revision'] && !/^[1-9]\d*$/.test(values['--policy-revision'])) fail('Policy revision must be a positive integer.');
  const policyRevision = values['--policy-revision'] ? Number(values['--policy-revision']) : 1;
  const input = JSON.parse(fs.readFileSync(values['--users'], 'utf8'));
  const output = writeKit(input, values['--out'], { policyRevision });
  process.stdout.write('Created three first-install JSON seed files in ' + output.outputDirectory + '\n');
  process.stdout.write('No Confluence changes or backend deployment were performed. Upload entitlements.json to the configured policy attachment page and deploy the trusted management service. Its policy revision is independent of Confluence page and attachment versions.\n');
}
module.exports = { ADMIN_PERMISSIONS, createTemplate, emptySeeds, validateUsers, generate, artifacts, writeKit, main };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write('Bootstrap failed: ' + error.message + '\n'); process.exitCode = 1; }
}
