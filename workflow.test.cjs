'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('./workflow.js');
const E = require('./editor-content.js');
const G = require('./governance.js');

const people = [
  { id: 'author-a', name: 'Person A', role: 'Author', initials: 'AA' },
  { id: 'manager-b', name: 'Person B', role: 'Manager', initials: 'BB' },
  { id: 'manager-c', name: 'Person C', role: 'Manager', initials: 'CC' },
  { id: 'reader-d', name: 'Person D', role: 'Reader', initials: 'DD' }
];
const now = '2026-10-15T08:00:00.000Z';
const fields = {
  id: 'job-aid-01', reference: 'WCS-JA-001', area: 'Credit Approval Control', type: 'Job aid',
  ownerId: 'manager-b', authorId: 'author-a', reviewerId: 'manager-b', approverId: 'manager-b',
  title: 'Prepare a credit approval record', summary: 'Check the approval record before handoff.',
  sections: [{ id: 'checks', title: 'Record checks', paragraphs: ['Review the source record.'], bullets: ['Confirm the owner.'] }]
};
function create(overrides = {}) { return W.createDocument({ ...fields, ...overrides }, { actorId: 'author-a', people, now }); }
function act(doc, action, actorId, overrides = {}) {
  const v = W.currentVersion(doc);
  return W.transition(doc, action, { actorId, people, now, expectedVersion: v.version, expectedRevision: v.revision, expectedAuditLength: doc.audit.length, comment: 'The required checks are complete.', ...overrides });
}
function reviewed(doc = create()) { return act(act(doc, 'submit', 'author-a'), 'complete-review', 'manager-b'); }
function approved(doc = reviewed()) { return act(doc, 'approve', 'manager-b', { effectiveAt: now, nextReviewAt: '2027-10-15' }); }
const importedSource = () => ({schemaVersion:1,sourceId:'legacy-credit-001',originalCreatedAt:'2021-03-14',originalUpdatedAt:'2024-07-01T09:15:00+02:00',sourceAuthor:'Legacy author',sourcePath:'credit/checklist.mdx'});

test('MDX source dates are distinct from trusted creation, import and approval timestamps', () => {
  const sourceMetadata=importedSource();
  const doc=create({sourceMetadata,createdAt:'2000-01-01',approvedAt:'2001-01-01'}),version=W.currentVersion(doc);
  assert.deepEqual(version.sourceMetadata,sourceMetadata);
  assert.equal(version.createdAt,now);assert.equal(version.sourceImportedAt,now);
  assert.equal(version.status,'Draft');assert.equal(version.approvedAt,null);
  assert.deepEqual(doc.audit[0].changes.find(item=>item.field==='versionSnapshot').after.sourceMetadata,sourceMetadata);
  assert.equal(doc.audit[0].changes.find(item=>item.field==='versionSnapshot').after.sourceImportedAt,now);
  assert.throws(()=>create({sourceMetadata,sourceImportedAt:'2001-01-01T00:00:00.000Z'}),/recorded by the service/);
});
test('existing draft captures source import time once and audits corrections without changing identity', () => {
  let doc=create(),sourceMetadata=importedSource();
  const importedAt='2026-10-16T08:00:00.000Z';
  doc=act(doc,'edit','author-a',{now:importedAt,changes:{sourceMetadata}});
  assert.equal(W.currentVersion(doc).createdAt,now);assert.equal(W.currentVersion(doc).sourceImportedAt,importedAt);
  const event=doc.audit.at(-1);
  assert.deepEqual(event.changes.find(item=>item.field==='sourceMetadata').after,sourceMetadata);
  assert.deepEqual(event.changes.find(item=>item.field==='sourceImportedAt'),{field:'sourceImportedAt',before:null,after:importedAt});
  sourceMetadata={...sourceMetadata,originalCreatedAt:'2021-03-15'};
  doc=act(doc,'edit','author-a',{now:'2026-10-17T08:00:00.000Z',changes:{sourceMetadata}});
  assert.equal(W.currentVersion(doc).sourceImportedAt,importedAt);
  assert.equal(doc.audit.at(-1).changes.find(item=>item.field==='sourceMetadata').before.originalCreatedAt,'2021-03-14');
  doc=act(doc,'edit','author-a',{now:'2026-10-18T08:00:00.000Z',changes:{summary:'Revised guidance summary.'}});
  assert.deepEqual(W.currentVersion(doc).sourceMetadata,sourceMetadata);assert.equal(W.currentVersion(doc).sourceImportedAt,importedAt);
  for(const changes of [{sourceMetadata:null},{sourceMetadata:{...sourceMetadata,sourceId:'different-source'}},{sourceImportedAt:now}])assert.throws(()=>act(doc,'edit','author-a',{now:'2026-10-18T08:00:00.000Z',changes}),/source identity|Only document content/);
});
test('source provenance survives review, approval and later versions while historic snapshots stay immutable', () => {
  let doc=approved(reviewed(create({sourceMetadata:importedSource()}))),first=JSON.parse(JSON.stringify(W.publishedVersion(doc)));
  doc=act(doc,'revise','author-a',{now:'2026-10-16T10:00:00.000Z',changes:{summary:'A later revision of the instructions.'}});
  const draft=W.currentVersion(doc);
  assert.deepEqual(W.publishedVersion(doc),first);assert.deepEqual(draft.sourceMetadata,first.sourceMetadata);
  assert.equal(draft.sourceImportedAt,now);assert.equal(draft.createdAt,'2026-10-16T10:00:00.000Z');assert.equal(draft.approvedAt,null);
  doc=act(doc,'submit','author-a',{now:'2026-10-16T11:00:00.000Z'});
  doc=act(doc,'complete-review','manager-b',{now:'2026-10-16T12:00:00.000Z'});
  doc=act(doc,'approve','manager-b',{now:'2026-10-16T13:00:00.000Z',effectiveAt:'2026-10-16T13:00:00.000Z',nextReviewAt:'2027-10-16'});
  assert.equal(W.publishedVersion(doc).sourceImportedAt,now);assert.deepEqual(doc.versions[0],first);
  assert.equal(W.publishedVersion(doc).approvedAt,'2026-10-16T13:00:00.000Z');
});
test('invalid imported source data and tampered cross-version provenance fail closed', () => {
  for(const sourceMetadata of [{...importedSource(),originalCreatedAt:'2025-02-30'},{...importedSource(),originalUpdatedAt:'2020-01-01'},{...importedSource(),approvedAt:now}])assert.throws(()=>create({sourceMetadata}));
  const doc=act(approved(reviewed(create({sourceMetadata:importedSource()}))),'revise','author-a');
  for(const alter of [v=>v.sourceImportedAt='2025-01-01T00:00:00.000Z',v=>v.sourceMetadata.sourceId='another',v=>delete v.sourceMetadata,v=>delete v.sourceImportedAt]){
    const changed=JSON.parse(JSON.stringify(doc));alter(W.currentVersion(changed));
    assert.deepEqual(W.allowedActions(changed,'author-a',people),[]);
    assert.throws(()=>act(changed,'submit','author-a'),/source|Source/);
  }
});

test('legacy training publishes edits directly while preserving its original reviewed video history', () => {
  const original=E.videoMarkdown(E.videoEmbed('https://contoso.sharepoint.com/sites/Learning/_layouts/15/embed.aspx?UniqueId=00000000-0000-0000-0000-000000000001','Review essentials'));
  const replacement=E.videoMarkdown(E.videoEmbed('https://contoso.sharepoint.com/sites/Learning/_layouts/15/embed.aspx?UniqueId=00000000-0000-0000-0000-000000000002','Updated review essentials'));
  let doc=approved(reviewed(create({sections:undefined,bodyMarkdown:original,type:'Training'})));
  assert.equal(W.publishedVersion(doc).bodyMarkdown,original);
  doc=act(doc,'revise','author-a',{changes:{bodyMarkdown:replacement}});
  assert.equal(W.publishedVersion(doc).bodyMarkdown,replacement);
  assert.equal(doc.area,'insights');
  assert.equal(doc.publicationMode,'direct-insight');
  assert.equal(W.currentVersion(doc).bodyMarkdown,replacement);
  const event=doc.audit.at(-1),change=event.changes.find(c=>c.field==='bodyMarkdown');
  assert.equal(event.actorId,'author-a');assert.equal(change.before,original);assert.equal(change.after,replacement);
  assert.equal(W.publishedVersion(doc).bodyMarkdown,replacement);
  assert.equal(doc.versions[0].bodyMarkdown,original);
});
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

test('authoring creates a versioned Markdown source and derives its matching search sections', () => {
  const bodyMarkdown = '## Prepare the record\n\nCheck the **source**.\n\n1. Record the owner.';
  const doc = create({ sections: undefined, bodyMarkdown, slug: 'prepare-the-record', highlights: ['Keep the source evidence.'], cover: { src: '/cover.png', alt: 'Blue abstract lines', caption: 'Illustration' } });
  assert.deepEqual(doc.versions[0].sections, E.toSections(bodyMarkdown));
  assert.equal(doc.versions[0].bodyMarkdown, bodyMarkdown);
  assert.equal(doc.versions[0].slug, 'prepare-the-record');
  assert.deepEqual(doc.audit[0].changes.find(c => c.field === 'versionSnapshot').after, doc.versions[0]);
  assert.throws(() => create({ bodyMarkdown }), /must match/);
});

test('editing canonical Markdown regenerates search content and audits all editorial fields', () => {
  let doc = create({ sections: undefined, bodyMarkdown: '## Overview\n\nOriginal content.', slug: 'original-content', highlights: ['Original highlight.'], cover: null });
  const original = JSON.parse(JSON.stringify(doc.versions[0]));
  doc = act(doc, 'edit', 'author-a', { changes: { bodyMarkdown: '## Overview\n\nRevised content.', slug: 'revised-content', highlights: ['Revised highlight.'], cover: { src: 'https://example.com/cover.jpg', alt: 'An office' } } });
  const changed = W.currentVersion(doc), event = doc.audit.at(-1);
  assert.equal(changed.revision, 2);
  assert.equal(changed.sections[0].paragraphs[0], 'Revised content.');
  for (const field of ['bodyMarkdown', 'slug', 'highlights', 'cover']) {
    assert.deepEqual(event.changes.find(c => c.field === field).before, original[field]);
    assert.deepEqual(event.changes.find(c => c.field === field).after, changed[field]);
  }
  assert.throws(() => act(doc, 'edit', 'author-a', { changes: { sections: fields.sections } }), /must match/);
});

test('authoring metadata cannot bypass review or alter an approved version', () => {
  const published = approved(reviewed(create({ sections: undefined, bodyMarkdown: '## Overview\n\nApproved content.', slug: 'approved-content', highlights: ['Approved.'], cover: null })));
  const snapshot = JSON.parse(JSON.stringify(W.publishedVersion(published)));
  assert.throws(() => act(published, 'edit', 'author-a', { changes: { cover: { src: '/new.jpg', alt: 'New cover' } } }), /not allowed/);
  const revised = act(published, 'revise', 'author-a');
  const edited = act(revised, 'edit', 'author-a', { changes: { bodyMarkdown: '## Overview\n\nChanged content.' } });
  assert.deepEqual(W.publishedVersion(edited), snapshot);
  assert.equal(W.currentVersion(edited).reviewedAt, null);
  assert.equal(W.currentVersion(edited).approvedBy, null);
  assert.deepEqual(W.allowedActions(edited, 'author-a', people), ['edit', 'submit']);
});

test('authoring validation rejects malformed slugs, highlights and active cover sources', () => {
  for (const slug of ['', 'Upper-Case', 'two--hyphens', 'has space', 'a'.repeat(121)]) assert.throws(() => create({ slug }), /slug/);
  assert.throws(() => create({ highlights: [''] }), /highlights/);
  assert.throws(() => create({ highlights: Array(6).fill('Too many.') }), /highlights/);
  assert.throws(() => create({ cover: { src: 'javascript:alert(1)', alt: 'Bad source' } }), /HTTPS/);
  assert.throws(() => create({ sections: undefined, bodyMarkdown: '## Heading only' }), /At least one/);
});

test('creation records assignments, complete initial content, owner and draft metadata', () => {
  const doc = create();
  assert.equal(W.currentVersion(doc).status, 'Draft');
  assert.equal(W.publishedVersion(doc), null);
  assert.equal(doc.audit.length, 1);
  assert.equal(doc.audit[0].action, 'create');
  assert.equal(doc.audit[0].actorId, 'author-a');
  assert.equal(doc.audit[0].at, now);
  assert.deepEqual(doc.audit[0].changes.find(c => c.field === 'versionSnapshot').after, doc.versions[0]);
  assert.equal(doc.audit[0].changes.find(c => c.field === 'ownerId').after, 'manager-b');
});

test('author, reviewer and approving manager must be valid separate assignments', () => {
  assert.throws(() => create({ reviewerId: 'author-a' }), /cannot review or approve/);
  assert.throws(() => create({ approverId: 'author-a' }), /manager|cannot review or approve/);
  assert.throws(() => create({ reviewerId: 'reader-d' }), /reviewer/);
  assert.throws(() => create({ approverId: 'reader-d' }), /manager/);
  assert.throws(() => create({ reviewerId: 'missing' }), /valid reviewer/);
  assert.throws(() => create({ ownerId: '' }), /required/);
  assert.throws(() => W.createDocument(fields, { actorId: 'manager-b', people, now }), /assigned author/);
});

test('authors cannot self-review or self-approve even if they have a manager role', () => {
  const changedPeople = people.map(p => p.id === 'author-a' ? { ...p, role: 'Manager' } : p);
  assert.throws(() => W.createDocument({ ...fields, approverId: 'author-a' }, { actorId: 'author-a', people: changedPeople, now }), /cannot review or approve/);
  assert.throws(() => act(reviewed(), 'approve', 'author-a', { effectiveAt: now, nextReviewAt: '2027-10-15' }), /not allowed/);
});

test('allowed actions are specific to the assigned actor and current state', () => {
  const doc = create();
  assert.deepEqual(W.allowedActions(doc, 'author-a', people), ['edit', 'submit']);
  assert.deepEqual(W.allowedActions(doc, 'manager-b', people), []);
  assert.deepEqual(W.allowedActions(doc, 'reader-d', people), []);
  const submitted = act(doc, 'submit', 'author-a');
  assert.deepEqual(W.allowedActions(submitted, 'author-a', people), []);
  assert.deepEqual(W.allowedActions(submitted, 'manager-b', people), ['request-changes', 'complete-review']);
  assert.deepEqual(W.allowedActions(reviewed(), 'manager-b', people), ['request-changes', 'approve']);
  assert.deepEqual(W.allowedActions(approved(), 'author-a', people), ['revise']);
  assert.deepEqual(W.allowedActions(doc, 'unknown', people), []);
});

test('review and approval are explicit, separate actions, including when B performs both', () => {
  const doc = reviewed();
  const version = W.currentVersion(doc);
  assert.equal(version.status, 'Awaiting approval');
  assert.equal(version.reviewedBy, 'manager-b');
  assert.equal(version.reviewedRevision, 1);
  assert.equal(version.approvedBy, null);
  assert.equal(W.publishedVersion(doc), null);
  const published = approved(doc);
  assert.equal(W.publishedVersion(published).approvedBy, 'manager-b');
  assert.equal(W.publishedVersion(published).approvedAt, now);
  assert.equal(W.publishedVersion(published).effectiveAt, now);
  assert.equal(W.publishedVersion(published).nextReviewAt, '2027-10-15T00:00:00.000Z');
  assert.deepEqual(published.audit.map(e => e.action), ['create', 'submit', 'complete-review', 'approve']);
});

test('the wrong manager and out-of-order actions are rejected', () => {
  assert.throws(() => act(create(), 'approve', 'manager-b'), /not allowed/);
  assert.throws(() => act(create(), 'complete-review', 'manager-b'), /not allowed/);
  assert.throws(() => act(act(create(), 'submit', 'author-a'), 'approve', 'manager-b'), /not allowed/);
  assert.throws(() => act(reviewed(), 'approve', 'manager-c'), /not allowed/);
  assert.throws(() => act(create(), 'submit', 'manager-b'), /not allowed/);
  assert.throws(() => act(create(), 'delete', 'author-a'), /not allowed/);
});

test('every workflow action requires a meaningful comment or change summary', () => {
  const cases = [
    [create(), 'edit', 'author-a', { changes: { title: 'New title' } }],
    [create(), 'submit', 'author-a', {}],
    [act(create(), 'submit', 'author-a'), 'request-changes', 'manager-b', {}],
    [act(create(), 'submit', 'author-a'), 'complete-review', 'manager-b', {}],
    [reviewed(), 'approve', 'manager-b', { effectiveAt: now, nextReviewAt: '2027-10-15' }],
    [approved(), 'revise', 'author-a', {}]
  ];
  for (const [doc, action, actor, options] of cases) {
    assert.throws(() => act(doc, action, actor, { ...options, comment: '  ' }), /comment.*required/);
  }
});

test('content stays locked during review, awaiting approval and after publication', () => {
  const changes = { title: 'Cannot change this version' };
  for (const doc of [act(create(), 'submit', 'author-a'), reviewed(), approved()]) {
    assert.throws(() => act(doc, 'edit', 'author-a', { changes }), /not allowed/);
  }
  assert.throws(() => act(create(), 'submit', 'author-a', { changes }), /only accepted by the edit/);
});

test('content edits cannot change owner, assignments, status or approval metadata', () => {
  for (const key of ['ownerId', 'reviewerId', 'approverId', 'authorId', 'status', 'approvedBy', 'approvedAt', 'reviewedRevision', 'nextReviewAt']) {
    assert.throws(() => act(create(), 'edit', 'author-a', { changes: { [key]: 'forged' } }), /metadata and assignments are locked/);
  }
});

test('edits preserve input objects and record complete before and after content', () => {
  const doc = deepFreeze(create());
  const before = JSON.stringify(doc);
  const sections = [{ id: 'checks', title: 'Updated checks', paragraphs: ['Reconcile the source.'], bullets: ['Confirm the owner.', 'Record the handoff.'] }];
  const edited = act(doc, 'edit', 'author-a', { changes: { title: 'Updated credit approval procedure', sections }, comment: 'Add handoff evidence.' });
  assert.equal(JSON.stringify(doc), before);
  assert.equal(W.currentVersion(edited).revision, 2);
  assert.equal(W.currentVersion(edited).changeSummary, 'Add handoff evidence.');
  assert.deepEqual(edited.audit.slice(0, -1), doc.audit);
  const changes = edited.audit.at(-1).changes;
  for (const field of ['title', 'summary', 'sections']) {
    const change = changes.find(c => c.field === field);
    assert.deepEqual(change.before, doc.versions[0][field]);
    assert.deepEqual(change.after, edited.versions[0][field]);
  }
  sections[0].title = 'External mutation';
  assert.equal(edited.versions[0].sections[0].title, 'Updated checks');
});

test('changes requested clear the review and require a new review of edited revision', () => {
  let doc = act(reviewed(), 'request-changes', 'manager-b', { comment: 'Add the reconciliation step.' });
  assert.equal(W.currentVersion(doc).status, 'Changes requested');
  assert.equal(W.currentVersion(doc).reviewedBy, null);
  assert.equal(W.currentVersion(doc).reviewedRevision, null);
  doc = act(doc, 'edit', 'author-a', { changes: { summary: 'Reconcile the approval record before handoff.' } });
  assert.equal(W.currentVersion(doc).status, 'Draft');
  assert.equal(W.currentVersion(doc).revision, 2);
  doc = act(doc, 'submit', 'author-a');
  assert.throws(() => act(doc, 'approve', 'manager-b'), /not allowed/);
  doc = act(doc, 'complete-review', 'manager-b');
  assert.equal(W.currentVersion(doc).reviewedRevision, 2);
  assert.equal(W.currentVersion(approved(doc)).status, 'Published');
});

test('approval rejects a stale or different reviewer binding', () => {
  for (const patch of [{ reviewedRevision: 99 }, { reviewedBy: 'manager-c' }, { reviewedAt: null }]) {
    const doc = reviewed();
    Object.assign(doc.versions[0], patch);
    assert.throws(() => act(doc, 'approve', 'manager-b'), /not allowed|exact content revision/);
    assert.ok(!W.allowedActions(doc, 'manager-b', people).includes('approve'));
  }
});

test('expected version, revision and audit length reject stale operations', () => {
  const draft = create();
  const edited = act(draft, 'edit', 'author-a', { changes: { title: 'New title' } });
  assert.throws(() => act(edited, 'submit', 'author-a', { expectedRevision: 1 }), /changed/);
  assert.throws(() => act(draft, 'submit', 'author-a', { expectedRevision: undefined }), /required/);
  assert.throws(() => act(draft, 'submit', 'author-a', { expectedVersion: undefined }), /required/);
  const revised = act(approved(), 'revise', 'author-a');
  assert.equal(W.currentVersion(revised).revision, 1);
  assert.throws(() => act(revised, 'edit', 'author-a', { expectedVersion: 1, changes: { title: 'Old tab title' } }), /changed/);
  assert.throws(() => act(reviewed(), 'approve', 'manager-b', { expectedAuditLength: 1 }), /workflow changed/);
});

test('a new draft leaves the approved reader version and its audit intact', () => {
  const first = deepFreeze(approved());
  const snapshot = JSON.stringify(first.versions[0]);
  let revised = act(first, 'revise', 'author-a', { comment: 'Update the evidence checklist.' });
  assert.equal(W.currentVersion(revised).version, 2);
  assert.equal(W.currentVersion(revised).status, 'Draft');
  assert.equal(W.currentVersion(revised).approvedAt, null);
  assert.equal(W.currentVersion(revised).reviewedAt, null);
  assert.equal(W.publishedVersion(revised).version, 1);
  revised = act(revised, 'edit', 'author-a', { changes: { title: 'Revised evidence checklist' } });
  assert.equal(JSON.stringify(revised.versions[0]), snapshot);
  assert.equal(W.publishedVersion(revised).title, fields.title);
  revised = approved(reviewed(revised));
  assert.equal(W.publishedVersion(revised).version, 2);
  assert.equal(W.publishedVersion(revised).title, 'Revised evidence checklist');
  assert.equal(JSON.stringify(revised.versions[0]), snapshot);
  assert.deepEqual(revised.audit.slice(0, first.audit.length), first.audit);
  assert.equal(new Set(revised.audit.map(e => e.id)).size, revised.audit.length);
});

test('separate reviewer and approver assignments are respected', () => {
  const doc = create({ reviewerId: 'manager-c' });
  const submitted = act(doc, 'submit', 'author-a');
  assert.throws(() => act(submitted, 'complete-review', 'manager-b'), /not allowed/);
  const ready = act(submitted, 'complete-review', 'manager-c');
  assert.throws(() => act(ready, 'approve', 'manager-c'), /not allowed/);
  assert.equal(W.publishedVersion(approved(ready)).reviewedBy, 'manager-c');
  assert.equal(W.publishedVersion(approved(ready)).approvedBy, 'manager-b');
});

test('approval requires an immediate effective time and a valid future review date', () => {
  const doc = reviewed();
  assert.throws(() => act(doc, 'approve', 'manager-b'), /Effective date/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: now }), /Next review date/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: '2026-10-16', nextReviewAt: '2027-10-15' }), /Future effective/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: '2026-10-14', nextReviewAt: '2027-10-15' }), /backdated/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: now, nextReviewAt: '2026-10-14' }), /after approval/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: now, nextReviewAt: '2027-02-30' }), /valid date/);
  assert.throws(() => act(doc, 'approve', 'manager-b', { effectiveAt: now, nextReviewAt: 'next year' }), /ISO/);
});

test('audit events include exact actor, time, decision, comment and workflow metadata changes', () => {
  const doc = approved();
  const last = doc.audit.at(-1);
  assert.deepEqual({ actor: last.actorId, at: last.at, from: last.fromStatus, to: last.toStatus, version: last.version, revision: last.revision },
    { actor: 'manager-b', at: now, from: 'Awaiting approval', to: 'Published', version: 1, revision: 1 });
  assert.equal(last.comment, 'The required checks are complete.');
  assert.deepEqual(last.changes.find(c => c.field === 'approvedBy'), { field: 'approvedBy', before: null, after: 'manager-b' });
  assert.deepEqual(last.changes.find(c => c.field === 'publishedVersion'), { field: 'publishedVersion', before: null, after: 1 });
  assert.throws(() => act(create(), 'submit', 'author-a', { now: '2026-10-14T08:00:00.000Z' }), /cannot precede/);
});

test('invalid or empty content and no-op edits are rejected', () => {
  assert.throws(() => create({ title: ' ' }), /title.*required/);
  assert.throws(() => create({ sections: [] }), /section.*required/);
  assert.throws(() => create({ sections: [{ id: 'empty', title: 'Empty', paragraphs: [], bullets: [] }] }), /contain text/);
  assert.throws(() => create({ sections: [fields.sections[0], fields.sections[0]] }), /IDs must be unique/);
  assert.throws(() => act(create(), 'edit', 'author-a', { changes: { title: fields.title } }), /Make a content change/);
  assert.throws(() => act(create(), 'edit', 'author-a', { changes: { sections: null } }), /section.*required/);
});

test('media and taxonomy belong to the exact reviewed revision and its reconstructable audit', () => {
  const media = {
    assets: [{ id: 'diagram', src: '/diagram-v1.png', alt: 'The approval workflow' }],
    attachments: [{ id: 'checklist', name: 'checklist.md', mimeType: 'text/markdown', size: 6, url: 'data:text/markdown;base64,IyBUZXN0' }],
    tags: [' Credit ', 'credit', 'Evidence'], processes: ['Approval'], regions: ['EMEA']
  };
  const bodyMarkdown = '## Evidence\n\n![Workflow](attachment:diagram)\n\n[Checklist](attachment:checklist)';
  const doc = approved(reviewed(create({ ...media, sections: undefined, bodyMarkdown })));
  const snapshot = structuredClone(W.publishedVersion(doc));
  assert.deepEqual(snapshot.tags, ['Credit', 'Evidence']);
  const revised = act(doc, 'revise', 'author-a');
  const edited = act(revised, 'edit', 'author-a', { changes: { assets: [{ id: 'diagram', src: '/diagram-v2.png', alt: 'Updated workflow' }], tags: ['Credit', 'Controls'], regions: ['Global'] } });
  assert.deepEqual(W.publishedVersion(edited), snapshot, 'approved image and classification remain pinned to the prior version');
  assert.equal(W.currentVersion(edited).revision, 2);
  assert.equal(W.currentVersion(edited).reviewedRevision, null);
  const event = edited.audit.at(-1);
  for (const field of ['assets', 'attachments', 'tags', 'processes', 'regions']) {
    assert.deepEqual(event.changes.find(c => c.field === field).before, W.currentVersion(revised)[field]);
    assert.deepEqual(event.changes.find(c => c.field === field).after, W.currentVersion(edited)[field]);
  }
  assert.throws(() => act(edited, 'edit', 'author-a', { changes: { assets: [] } }), /missing: attachment:diagram/);
  assert.throws(() => act(doc, 'edit', 'author-a', { changes: { tags: ['Bypass'] } }), /not allowed/);
});

test('malformed media and classification fail before creating workflow or audit records', () => {
  assert.throws(() => create({ regions: [''] }), /non-empty/);
  assert.throws(() => create({ tags: Array(31).fill('Topic') }), /30/);
  assert.throws(() => create({ assets: [{ id: 'x', src: 'javascript:alert(1)', alt: 'Unsafe' }] }), /HTTPS/);
  assert.throws(() => create({ attachments: [{ id: 'x', name: 'script.html', mimeType: 'text/html', size: 5, url: '/script.html' }] }), /extension/);
  assert.throws(() => create({ sections: undefined, bodyMarkdown: '![Missing](attachment:missing)', assets: [] }), /missing/);
});


test('document keys are permanent, title-independent identities and retain imported keys', () => {
  const first = create({ id: undefined }), second = create({ id: undefined });
  assert.match(W.documentKey(first), /^wcs-doc-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.id, second.id);
  const renamed = act(first, 'edit', 'author-a', { changes: { title: 'Completely different document title', slug: 'new-url-name' } });
  assert.equal(W.documentKey(renamed), first.id);
  assert.equal(W.documentKey(create()), fields.id, 'existing IDs are retained');
  assert.ok(renamed.audit.every(entry => entry.documentKey === first.id));
  for (const key of ['id','documentKey','confluence','deletedAt','contributorIds']) {
    assert.throws(() => act(first, 'edit', 'author-a', { changes: { [key]: 'forged' } }), /metadata and assignments are locked/);
  }
});

test('Confluence location metadata preserves identity and grants no editing or deletion capability', () => {
  const location = { pageId: '123456', attachmentId: '987654' };
  const doc = create({ confluence: location });
  location.pageId = '100';
  assert.deepEqual(doc.confluence, { pageId: '123456', attachmentId: '987654' });
  assert.equal(doc.id, fields.id);
  assert.deepEqual(W.allowedActions(doc, 'manager-c', people), []);
  assert.throws(() => act(doc, 'delete', 'manager-c'), /not allowed/);
  assert.throws(() => create({ confluence: { pageId: '123', edit: true } }), /only Confluence/);
  assert.throws(() => create({ confluence: { pageId: '../other' } }), /numeric/);
});

function permissionContext(doc, actorId, grants = {}) { return { actorId, documentId: doc.id, ...grants }; }

test('explicit grants bind to actor and document, allow nonauthor editing, and override legacy role access', () => {
  const doc = create(), grant = permissionContext(doc, 'manager-c', { edit: true });
  assert.deepEqual(W.allowedActions(doc, 'manager-c', people, grant), ['edit','submit','reassign-owner']);
  const edited = act(doc, 'edit', 'manager-c', { permissionContext: grant, actorSOEID: 'AB12345', changes: { title: 'A colleague updates the procedure' } });
  assert.equal(edited.authorId, 'author-a');
  assert.equal(edited.audit.at(-1).actorId, 'manager-c');
  assert.equal(edited.audit.at(-1).actorSOEID, 'ab12345');
  assert.deepEqual(W.currentVersion(edited).contributorIds, ['author-a','manager-c']);
  assert.equal(W.currentVersion(act(edited, 'submit', 'manager-c', { permissionContext: grant })).status, 'In review');
  assert.deepEqual(W.allowedActions(doc, 'author-a', people, permissionContext(doc, 'author-a', { edit: false })), []);
  for (const bad of [{ ...grant, actorId:'author-a' }, { ...grant, documentId:'another-document' }, { ...grant, edit:'true' }, {}]) {
    assert.deepEqual(W.allowedActions(doc, 'manager-c', people, bad), []);
    assert.throws(() => act(doc, 'edit', 'manager-c', { permissionContext: bad, changes: { title:'Bypass' } }), /not allowed/);
  }
  const readerGrant = permissionContext(doc, 'reader-d', { edit:true });
  assert.equal(W.currentVersion(act(doc, 'edit', 'reader-d', { permissionContext: readerGrant, changes: { title:'Entitled contributor' } })).revision, 2);
});

test('explicit creation grants permit a known person without relying on their presentation role', () => {
  const draftFields = { ...fields, id: W.newDocumentId(), authorId: 'reader-d' };
  const context = { actorId:'reader-d', documentId:draftFields.id, create:true };
  const doc = W.createDocument(draftFields, {actorId:'reader-d', people, now, permissionContext:context});
  assert.equal(doc.authorId, 'reader-d');
  assert.throws(() => W.createDocument(draftFields, {actorId:'reader-d', people, now}), /reader cannot/);
  assert.throws(() => W.createDocument(draftFields, {actorId:'reader-d', people, now, permissionContext:{...context,create:false}}), /not permitted/);
  assert.throws(() => W.createDocument(draftFields, {actorId:'reader-d', people, now, permissionContext:{...context,documentId:'wrong'}}), /not permitted/);
});

test('an entitled contributor cannot review or approve their own revision and submitted content stays locked', () => {
  const doc = create(), grant = permissionContext(doc, 'manager-b', { edit:true });
  let edited = act(doc, 'edit', 'manager-b', {permissionContext:grant, changes:{title:'A manager contribution'}});
  edited = act(edited, 'submit', 'manager-b', {permissionContext:grant});
  assert.deepEqual(W.allowedActions(edited,'manager-b',people,grant),['reassign-owner']);
  assert.throws(() => act(edited,'complete-review','manager-b',{permissionContext:grant}), /not allowed/);
  assert.throws(() => act(edited,'edit','manager-b',{permissionContext:grant,changes:{title:'Mid-review edit'}}), /not allowed/);
  const split = create({reviewerId:'manager-c'});
  let awaiting = act(split,'edit','manager-b',{permissionContext:grant,changes:{title:'Approver contribution'}});
  awaiting = act(awaiting,'submit','author-a');
  awaiting = act(awaiting,'complete-review','manager-c');
  assert.throws(() => act(awaiting,'approve','manager-b',{permissionContext:grant,effectiveAt:now,nextReviewAt:'2027-10-15'}), /not allowed/);
  const published = approved();
  const revised = act(published,'revise','manager-c',{permissionContext:permissionContext(published,'manager-c',{edit:true})});
  assert.equal(revised.id,published.id);
  assert.equal(W.currentVersion(revised).createdBy,'manager-c');
  assert.deepEqual(W.publishedVersion(revised),W.publishedVersion(published));
});

test('deletion requires an explicit grant for the exact actor, document and current audit state', () => {
  const doc = approved(), grant = permissionContext(doc,'manager-c',{delete:true});
  const opts = {actorId:'manager-c', people, now, comment:'Duplicate replaced by the consolidated procedure.', expectedVersion:1, expectedRevision:1, expectedAuditLength:doc.audit.length, permissionContext:grant};
  for (const patch of [{permissionContext:undefined}, {permissionContext:{...grant,delete:false}}, {permissionContext:{...grant,actorId:'manager-b'}}, {permissionContext:{...grant,documentId:'another'}}]) {
    assert.throws(()=>W.deleteDocument(doc,{...opts,...patch}), /not allowed/);
  }
  assert.throws(()=>W.deleteDocument(doc,{...opts,expectedAuditLength:undefined}), /audit length is required/);
  assert.throws(()=>W.deleteDocument(doc,{...opts,expectedAuditLength:1}), /workflow changed/);
  assert.throws(()=>W.deleteDocument(doc,{...opts,expectedVersion:2}), /document changed/);
  assert.throws(()=>W.deleteDocument(doc,{...opts,expectedRevision:2}), /document changed/);
  assert.throws(()=>W.deleteDocument(doc,{...opts,comment:'  '}), /comment.*required/);
  assert.throws(()=>W.deleteDocument(doc,{...opts,now:'2026-10-14T08:00:00Z'}), /cannot precede/);
  assert.deepEqual(W.allowedActions(doc,'manager-c',people,grant),['delete']);
});

test('deletion retains immutable snapshots and audit evidence while withdrawing all public and workflow access', () => {
  const original = deepFreeze(approved()), grant = permissionContext(original,'manager-c',{delete:true});
  const deleted = act(original,'delete','manager-c',{permissionContext:grant,actorSOEID:'CD12345',comment:'Document withdrawn following consolidation.'});
  assert.equal(deleted.id,original.id);
  assert.equal(deleted.deletedAt,now);
  assert.equal(deleted.deletedBy,'manager-c');
  assert.equal(deleted.deletedVersion,1);
  assert.equal(deleted.deletedRevision,1);
  assert.equal(deleted.deletedReason,'Document withdrawn following consolidation.');
  assert.deepEqual(deleted.versions,original.versions);
  assert.deepEqual(deleted.audit.slice(0,-1),original.audit);
  const event = deleted.audit.at(-1);
  assert.equal(event.id,deleted.deletedAuditEventId);
  assert.equal(event.actorSOEID,'cd12345');
  assert.equal(event.toStatus,'Deleted');
  assert.deepEqual(event.changes.find(c=>c.field==='versionSnapshot').before,W.currentVersion(original));
  assert.equal(W.publishedVersion(deleted),null);
  assert.equal(W.currentVersion(deleted).status,'Published','historical version status is preserved');
  assert.deepEqual(W.allowedActions(deleted,'manager-c',people,grant),[]);
  assert.throws(()=>act(deleted,'delete','manager-c',{permissionContext:grant}), /already been deleted/);
  assert.throws(()=>act(deleted,'revise','author-a'), /already been deleted/);
  assert.equal(original.deletedAt,undefined);
});


test('saving a published edit creates a single audited draft without mutating approval or identity', () => {
  const original = deepFreeze(approved(reviewed(create({sections:undefined,bodyMarkdown:'## Overview\n\nApproved instructions.',slug:'approved-instructions'}))));
  const next = act(original, 'revise', 'author-a', {changes:{title:'Revised instructions',bodyMarkdown:'## Overview\n\nAdd the receiving owner.'},actorSOEID:'AA12345'});
  assert.equal(next.id,original.id);assert.equal(next.publishedVersion,original.publishedVersion);assert.deepEqual(next.versions[0],original.versions[0]);assert.equal(next.audit.length,original.audit.length+1);
  const v=W.currentVersion(next),event=next.audit.at(-1);assert.equal(v.version,2);assert.equal(v.revision,1);assert.equal(v.status,'Draft');assert.equal(v.approvedAt,null);assert.equal(v.reviewedAt,null);assert.equal(v.createdBy,'author-a');assert.deepEqual(v.sections,E.toSections(v.bodyMarkdown));
  assert.equal(event.action,'revise');assert.equal(event.actorSOEID,'aa12345');assert.deepEqual(event.changes.find(c=>c.field==='versionSnapshot').after,v);assert.equal(event.changes.find(c=>c.field==='title').before,'Prepare a credit approval record');assert.equal(event.changes.find(c=>c.field==='title').after,'Revised instructions');
  assert.throws(()=>act(original,'revise','author-a',{changes:{status:'Published'}}),/metadata|locked/);
  assert.throws(()=>act(original,'revise','author-a',{changes:{title:original.versions[0].title}}),/Make a content change/);
  assert.throws(()=>act(original,'revise','author-a',{changes:{title:'Updated'},permissionContext:{actorId:'author-a',documentId:original.id,edit:false}}),/not allowed/);
});

const governanceFields=()=>G.normalize({classification:'other-bod',owningTeam:'Credit Operations',scope:'Preparing an existing process record.',audience:'Credit operations colleagues',classificationRationale:'Supporting business guidance.'});
function governanceEvidence(doc,patch={}){const v=W.currentVersion(doc);return {baselineVersion:G.BASELINE_VERSION,version:v.version,revision:v.revision,checks:Object.fromEntries(G.reviewChecklist.map(item=>[item.key,true])),findingDisposition:'clear',reason:'The scope, classification, sources and wording have been reviewed.',...patch};}
function governedReview(doc=create({governance:governanceFields()})){doc=act(doc,'submit','author-a',{requireGovernance:true});return act(doc,'complete-review','manager-b',{requireGovernance:true,governanceReview:governanceEvidence(doc),actorSOEID:'MB12345'});}

test('governance draft metadata is versioned but completion is required when new submissions opt in',()=>{const doc=create({governance:G.normalize()});assert.equal(W.currentVersion(doc).governance.classification,'unclassified');assert.throws(()=>act(doc,'submit','author-a',{requireGovernance:true}),/classification/);assert.throws(()=>act(create(),'submit','author-a',{requireGovernance:true}),/governance metadata/);const complete=create({governance:governanceFields()});assert.equal(W.currentVersion(act(complete,'submit','author-a',{requireGovernance:true})).status,'In review');});
test('governance review evidence requires every checklist answer and the exact current baseline/revision',()=>{let doc=act(create({governance:governanceFields()}),'submit','author-a',{requireGovernance:true});for(const patch of [{revision:99},{version:99},{baselineVersion:'old-baseline'},{checks:{classification:true}},{reason:''}])assert.throws(()=>act(doc,'complete-review','manager-b',{requireGovernance:true,governanceReview:governanceEvidence(doc,patch)}));assert.throws(()=>act(doc,'complete-review','manager-b',{requireGovernance:true}),/checklist/);});
test('flags require documented human disposition and unresolved authority findings cannot complete review',()=>{let doc=act(create({title:'Procedure for record preparation',governance:governanceFields()}),'submit','author-a',{requireGovernance:true});for(const disposition of ['clear','changes-required','needs-authority'])assert.throws(()=>act(doc,'complete-review','manager-b',{requireGovernance:true,governanceReview:governanceEvidence(doc,{findingDisposition:disposition})}),/flagged|Unresolved/);const reviewed=act(doc,'complete-review','manager-b',{requireGovernance:true,governanceReview:governanceEvidence(doc,{findingDisposition:'addressed',reason:'The flagged term refers to the linked governing source; no new formal authority or exception is asserted.'})});assert.equal(W.currentVersion(reviewed).governanceReview.findingDisposition,'addressed');assert.ok(W.currentVersion(reviewed).governanceReview.flagIds.length);});
test('recorded governance evidence is private revision-bound reviewer data with reconstructable audit',()=>{const doc=governedReview(),v=W.currentVersion(doc),event=doc.audit.at(-1);assert.equal(v.governanceReview.reviewedBy,'manager-b');assert.equal(v.governanceReview.reviewedAt,now);assert.equal(v.governanceReview.actorSOEID,'MB12345');assert.equal(v.governanceReview.revision,v.revision);assert.deepEqual(event.changes.find(c=>c.field==='governanceReview').after,v.governanceReview);assert.throws(()=>act(doc,'approve','manager-c',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-15'}),/not allowed/);});
test('governance evidence cannot be injected through content edits or by the wrong reviewer',()=>{let doc=create({governance:governanceFields()});assert.throws(()=>act(doc,'edit','author-a',{changes:{governanceReview:{checks:{}}}}),/Only document content/);doc=act(doc,'submit','author-a',{requireGovernance:true});assert.throws(()=>act(doc,'complete-review','author-a',{requireGovernance:true,governanceReview:governanceEvidence(doc)}),/not allowed/);assert.throws(()=>act(doc,'complete-review','manager-c',{requireGovernance:true,governanceReview:governanceEvidence(doc)}),/not allowed/);});
test('content changes clear governance evidence and stale evidence cannot review a revised draft',()=>{let doc=governedReview(),previous=JSON.parse(JSON.stringify(W.currentVersion(doc).governanceReview));doc=act(doc,'request-changes','manager-b');assert.equal(W.currentVersion(doc).governanceReview,null);doc=act(doc,'edit','author-a',{changes:{summary:'A revised description.'}});assert.equal(W.currentVersion(doc).governanceReview,null);doc=act(doc,'submit','author-a',{requireGovernance:true});assert.throws(()=>act(doc,'complete-review','manager-b',{requireGovernance:true,governanceReview:{...previous,reviewedBy:undefined}}),/unsupported|exact/);});
test('approval refuses missing or mismatched stored governance evidence',()=>{const doc=governedReview();for(const alter of [v=>delete v.governanceReview,v=>v.governanceReview.revision++,v=>v.governanceReview.reviewedBy='manager-c',v=>v.governanceReview.flagIds=['unreviewed']]){const changed=JSON.parse(JSON.stringify(doc));alter(W.currentVersion(changed));assert.throws(()=>act(changed,'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-15'}),/governance|recorded/i);}});
test('governed approval accepts a future target through 24 calendar months but no later',()=>{const doc=governedReview();assert.throws(()=>act(doc,'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-16'}),/24 calendar months/);assert.throws(()=>act(doc,'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2026-10-15'}),/after approval/);const approvedDoc=act(doc,'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-15'});assert.equal(W.publishedVersion(approvedDoc).nextReviewAt,'2028-10-15T00:00:00.000Z');});
test('formal references cannot be published by the ordinary workflow even without enforcement flag',()=>{const metadata=governanceFields();metadata.classification='formal-reference';metadata.reviewBasis='formal-governance';const doc=reviewed(create({governance:metadata}));for(const requireGovernance of [false,true])assert.throws(()=>act(doc,'approve','manager-b',{requireGovernance,effectiveAt:now,nextReviewAt:'2027-10-15'}),/authoritative repository/);});
test('legacy approved content stays unchanged when a governed revision is introduced',()=>{const doc=approved(),snapshot=JSON.parse(JSON.stringify(W.publishedVersion(doc)));let revised=act(doc,'revise','author-a',{changes:{governance:governanceFields()}});assert.deepEqual(W.publishedVersion(revised),snapshot);assert.equal(Object.hasOwn(W.publishedVersion(revised),'governance'),false);assert.deepEqual(W.currentVersion(revised).governance,governanceFields());revised=governedReview(revised);revised=act(revised,'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-15'});assert.deepEqual(revised.versions[0],snapshot);assert.equal(W.publishedVersion(revised).version,2);});
test('revising a governed approval preserves historical evidence and resets the working evidence',()=>{const doc=act(governedReview(),'approve','manager-b',{requireGovernance:true,effectiveAt:now,nextReviewAt:'2028-10-15'}),snapshot=JSON.parse(JSON.stringify(W.publishedVersion(doc)));const revised=act(doc,'revise','author-a',{changes:{summary:'A new draft summary.'}});assert.deepEqual(W.publishedVersion(revised),snapshot);assert.equal(W.currentVersion(revised).governanceReview,null);assert.equal(W.currentVersion(revised).governance.baselineVersion,G.BASELINE_VERSION);});


test('blog comment setting defaults enabled, survives edits/revision and has audit evidence', () => {
  let doc=create({type:'Blog',commentsEnabled:false});
  assert.equal(W.currentVersion(doc).commentsEnabled,false);
  assert.equal(doc.audit[0].changes.find(c=>c.field==='versionSnapshot').after.commentsEnabled,false);
  doc=act(doc,'edit','author-a',{changes:{summary:'Updated excerpt.'}});
  assert.equal(W.currentVersion(doc).commentsEnabled,false);
  doc=act(doc,'revise','author-a',{changes:{commentsEnabled:true}});
  assert.deepEqual(doc.audit.at(-1).changes.find(c=>c.field==='commentsEnabled'),{field:'commentsEnabled',before:false,after:true});
  const revised=act(doc,'revise','author-a',{changes:{commentsEnabled:false}});
  assert.equal(W.currentVersion(revised).commentsEnabled,false);
  assert.equal(W.publishedVersion(revised).commentsEnabled,false);
  assert.equal(W.currentVersion(create({type:'Blog'})).commentsEnabled,true);
  for(const value of ['false',0,null,{},[]])assert.throws(()=>create({type:'Blog',commentsEnabled:value}),/commentsEnabled/);
  assert.throws(()=>act(revised,'revise','author-a',{changes:{commentsEnabled:'true'}}),/commentsEnabled/);
});

test('ownership transfer requires owner, manager or admin plus edit permission; preserves content and approval',()=>{
 const doc=approved(),context=id=>({actorId:id,documentId:doc.id,edit:true});
 for(const id of ['manager-b','manager-c']){
  const next=act(doc,'reassign-owner',id,{ownerId:'author-a',permissionContext:context(id)});
  assert.equal(next.ownerId,'author-a');assert.equal(next.authorId,doc.authorId);assert.deepEqual(next.versions,doc.versions);
  assert.deepEqual(next.audit.at(-1).changes,[{field:'ownerId',before:'manager-b',after:'author-a'}]);
 }
 assert.throws(()=>act(doc,'reassign-owner','author-a',{ownerId:'manager-c',permissionContext:context('author-a')}),/not allowed/);
 assert.equal(act(doc,'reassign-owner','author-a',{ownerId:'manager-c',permissionContext:{...context('author-a'),admin:true}}).ownerId,'manager-c');
 for(const extra of [{ownerId:'missing'},{ownerId:'reader-d'},{ownerId:'manager-b'},{ownerId:'author-a',expectedAuditLength:0},{ownerId:'author-a',expectedAuditLength:undefined},{ownerId:'author-a',permissionContext:{...context('manager-b'),edit:false}}])assert.throws(()=>act(doc,'reassign-owner','manager-b',{permissionContext:context('manager-b'),...extra}));
 const owned=create({ownerId:'author-a'});assert.equal(act(owned,'reassign-owner','author-a',{ownerId:'manager-c',permissionContext:{actorId:'author-a',documentId:owned.id,edit:true}}).ownerId,'manager-c');
});
