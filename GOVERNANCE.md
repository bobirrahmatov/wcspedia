# WCSpedia governance deployment

## Scope and source

The implemented baseline is `wcs-other-documents-2026-10-09-v1`, based on the user-supplied screenshots of **Best Practices for Maintenance of Other Non-Hierarchy Documents and Other Business Owned Documents**, version 1.0, approved 9 October 2026, for WCS. The screenshots list Mohammad Zaber as document owner and approver and a next review date of 9 October 2028. The underlying referenced policies and their exact exception/citation rules were not provided or independently verified.

This baseline supports Other NHDs and Other BODs. It distinguishes a **business expectation to review at least every two years** from a mandatory formal-policy periodic review cycle. A late business target does not automatically mark the document noncompliant, revoke an approval, unpublish content, or create a legal conclusion.

Before production rollout, the guidance owner should validate the baseline interpretation, permitted source quotations/references, formal exception authority, and the applicable retention arrangement. This implementation offers no ordinary-manager exception-grant action. `needs-authority` blocks review completion; formal references cannot be published through ordinary WCSpedia approval. Source documents remain authoritative in their approved repositories. WCSpedia does not publish Other NHD/BOD content into the Citi Policy Directory.

## Files and shared UI

- `governance.js`: pure shared metadata validation, calendar arithmetic, deterministic wording prompts and immutable baseline. Exposes `WCSGovernance` in the browser and CommonJS exports for the trusted service.
- `workflow.js`: exact-version governance checklist, publication gate, stale-state checks, audited evidence and invalidation after content changes.
- `governance-ui.js` / `governance.css`: classification badges, compact details and reviewer checklist. These are bundled into the existing **one** `wcspedia.js` and **one** `wcspedia-style.css`.
- `editor.js`: expandable Governance section, structured source-reference rows and advisory checks. There is no new disconnected governance editor or store.
- `content-health.js`, `content-health-ui.js`, `health-service.js`: change-triggered maintenance cases, owner assessments, manager verification and business review targets through the existing health endpoint.
- PDF, Word and Markdown use human-readable governance fields from the selected version. Private reviewer rationale stays in the restricted workflow store.

Existing Confluence HTML fragments, native sidebar destinations, personal Saved items page, Add document widget and root page placeholders remain supported. No Tailwind/CDN CSS is introduced.

## Versioned document contract

Each new or revised content snapshot can contain:

```js
version.governance = {
  baselineVersion: 'wcs-other-documents-2026-10-09-v1',
  classification: 'other-nhd', // other-bod | unclassified | formal-reference
  owningTeam: 'Name of accountable WCS team',
  scope: 'One or two sentences describing applicability.',
  audience: 'Intended readers and users.',
  supportingTeam: '', // optional
  classificationRationale: 'Why this document belongs in this classification.',
  reviewBasis: 'business-best-practice', // formal-governance for formal references
  reviewMonths: 24,
  sources: [{
    id: 'source-001',
    title: 'Authoritative source title',
    url: 'https://YOUR-APPROVED-REPOSITORY/path',
    version: 'Reviewed source version',
    lastVerifiedAt: '2026-10-15'
  }]
};
```

Classification is independent of content format. New documents start unclassified. Drafts may be saved incomplete; submission requires classification, owning team, scope, audience and classification rationale. Every source row requires an identifier, title, complete HTTPS URL, source version and valid nonfuture verification date. Zero references is permitted where none apply, with source applicability assessed by the reviewer. The existing region/market tags remain versioned alongside this metadata.

Owner/author/reviewer/approver IDs continue to resolve through the authenticated SOEID directory. The server validates those assignments and native Confluence permissions; client-supplied roles or names never establish entitlement.

The baseline and review-month limit are not per-document editable rules. Managers may configure permitted warning windows, resource checks and assignment using the existing rules dialog. Ownership, approval and business review checks cannot be disabled for Other NHD/BOD snapshots. Changing a baseline requires a separately reviewed application/schema rollout; it is not a browser setting.

## Submission, review and approval

The browser and trusted workflow handler call `WCSWorkflow.transition(document, action, options)` with **`requireGovernance: true`** on all live workflow transitions. Never accept a caller-supplied value to turn this off. The optional legacy core mode exists for historical test/replay compatibility only.

For `complete-review`, the command adds:

```js
governanceReview: {
  version: 2,
  revision: 3,
  baselineVersion: 'wcs-other-documents-2026-10-09-v1',
  checks: {
    classification: true, ownership: true, scope: true,
    sources: true, guardrails: true, reviewPlan: true
  },
  findingDisposition: 'clear', // addressed | changes-required | needs-authority
  reason: 'Assessment and evidence for this exact revision.'
}
```

All checks must be true. `clear` is accepted only if no configured wording flags exist. `addressed` requires recorded rationale about the flagged wording; it is a human content assessment, not formal exception authority. `changes-required` and `needs-authority` cannot complete review; return the document to its author with the required follow-up. The application flags Policy/Policies, Standard(s), Procedure(s), Framework(s), Operating Manual(s), and wording that may introduce requirements. It scans titles and content without silently exempting quotations. Keyword matches cannot determine whether a passage actually conflicts with an authoritative source or certify compliance.

The server derives reviewer identity, SOEID, time and matched flag IDs. It stores `version.governanceReview`, tied to the baseline, version and revision. Edit, new revision, resubmission and requested changes clear previous evidence. Approval validates the stored checklist against the current content and still requires the assigned independent reviewer and manager approver. No browser Publish bypass exists.

Approval chooses a future business review target no later than 24 calendar months after approval. Month arithmetic clamps a leap-day anniversary to the last valid calendar day. Earlier targets are supported. Keep approval time, content revision time and later business review time distinct.

## Maintenance cases and no-change review

The existing authenticated `healthEndpoint` accepts these additional actions, with its existing request ID, expected health revision, expected published version/revision, and `expectedFingerprint` of the approved source snapshot:

- `record-review-trigger`: `triggerType`, `reason`, `evidence`, and `sourceId` for source changes. Types are `source-change`, `control-change`, `process-change`, `responsibility-change`, `error`, and `feedback`.
- `document-reviewed`: `outcome` (`no-change` or `changes-needed`), `reason`, `evidence`, and the current unresolved `caseIds` being assessed.

Owners/assignees may report and assess changes; only an entitled manager can verify a no-change review. Every case and assessment retains the source version, revision, fingerprint, SOEID, timestamp and rationale in the existing health audit. Reader projections redact private comments and identity evidence.

A manager's verified no-change review sets a new 24-calendar-month business target for the exact approved snapshot without changing its title, body, version, publication or original approval date. An owner assessment alone does not reset the target. Saving content, checking resources, viewing a page or changing warning rules also does not reset it.

Changes-needed cases remain open until a new version is approved and an accountable verification completes. A new publication does not silently discard outstanding change reasons. Rule resolution remains blocked while actionable metadata, resource, approval or maintenance issues remain. The health worklist and document details reuse the existing shared tables and styles.

Source changes and feedback can be recorded through **Report a change**. This package does not inspect restricted source repositories or send notifications automatically. A production source monitor or scheduled reminder service must authenticate against its approved source API, identify the affected document/source version, and call the same server-validated command path. Use durable event IDs for deduplication, and never treat a failed browser link request as proof that a restricted resource is broken.

## Safe migration

Do not rewrite old approved snapshots to add inferred governance values. Missing metadata appears as classification/metadata review work. Open a new draft, assign the correct classification and complete its metadata, then submit it through the ordinary review flow.

The historical `Procedure` type and `Regional Operating Manuals` business area do not establish a formal classification. New creation omits Procedure from the picker and supports Guide, Playbook, Checklist, Template and FAQ alongside the existing job-aid, training and knowledge formats. Existing categories and history remain intact for assessment; titles and content are not silently renamed. If material belongs under a formal process, retain its authoritative repository and follow that process.

The full restricted workspace retains checklist evidence. **Strip `governanceReview` from every reader snapshot**, including the approved JSON attachment, unauthorized-workspace fallback, search payloads and public exports. The build and loopback adapter demonstrate that projection. Source references and the selected version's governance metadata are reader-visible only where their underlying content is already authorized.

## Confluence rollout

1. Rebuild with `node build.cjs`. Upload `wcspedia.js`, `wcspedia-style.css`, the permitted `wcspedia-published.json`, and the existing approved export/logo assets to the chosen asset page.
2. Replace page placeholders in the five supplied HTML macro fragments; continue to load the shared global stylesheet once. Use the native Confluence sidebar for workspace navigation.
3. Upgrade the existing trusted workflow handler to persist the governance field and private review evidence, and enforce `requireGovernance: true`. The adapter forwards only the supported command fields. Upgrade the health handler using the new command model and field validation.
4. Derive user identity from the signed-in Confluence session. Recheck SOEID entitlements, native page permissions, attachment/page/content versions and the current baseline at commit. Persist state, audit and request deduplication atomically. Never promote an unapproved draft to the public attachment.
5. Keep approved native child-page publication and search labels synchronized through the trusted publisher. Retain old versions/audit in restricted durable storage; agree retention with the relevant owner rather than assuming a period from the screenshot.
6. Exercise author draft → submission → reviewer checklist → manager approval, then a source-change case and no-change verification using the target installation's permissions. Verify PDF/Word/Markdown output and reader redaction.

`mock-confluence.cjs` and `mock-health-route.cjs` are **loopback demonstrations**, not a deployable authenticated production backend. Real page IDs, `workspaceEndpoint`, `workflowEndpoint`, `healthEndpoint`, native page publication and durable audit storage remain deployment configuration/integration responsibilities. Empty endpoints fail closed and never report a production change as saved locally.
