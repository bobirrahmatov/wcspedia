# Governed content health

Content health is a maintenance workflow alongside document review and approval. It does not edit approved content, approve a document, grant access, or delete a page. Checks always use the current approved snapshot, even while a new draft is being written.

The WCS guidance baseline adds classification, metadata, source-change cases and manager-verified no-change reviews. See [GOVERNANCE.md](./GOVERNANCE.md) for the versioned contract, exact-revision evidence and trusted-service upgrade. Other NHD/BOD review dates are business maintenance targets, not formal-policy compliance verdicts.

## Where it appears

- The document's health tag opens its **Content health** tab.
- **My workspace → Content health** lists published documents the person owns, is assigned to maintain, or is entitled to edit. The reviewer workspace links to the same worklist.
- Search results and workspace rows use the same status tags. A missing live service displays **Health unavailable**, not a fabricated healthy result.

The tags are **Healthy**, **Review due**, **Action required**, and **Check needed**. “Healthy” means the applicable baseline and enabled checks currently pass, not that an automated compliance assessment has occurred. Disabled optional checks remain visible; disabling one is a recorded manager decision, not evidence that it passed. Missing legacy governance metadata produces **Check needed** without rewriting its approved snapshot.

Health change history starts collapsed and shows its total event count. Expanding it shows five events per page, newest first, with the shared compact pager. Paging preserves the selected document, version and health tab; it does not remove old records. The Document control sidebar also keeps secondary metadata behind an expand/collapse control, while version and document-audit histories have their own bounded pagination.

## Rules and authority

Every document starts with the same defaults:

| Rule | Default behaviour |
| --- | --- |
| Document owner | Check that the owner exists in the current people directory and is not marked inactive. |
| Review date | Warn 30 calendar days before the next review date; flag missing or overdue dates. |
| Approval evidence | Check review/approval metadata against the exact current approved revision. |
| Resource verification | Require recorded verification of external resources for that approved revision; verification expires after 90 days. |
| Work deadline | Set a deadline 14 days after the maintenance workflow opens. |

An entitled manager can edit permitted optional checks, review warning period, resource-verification interval, work deadline and assignee for a specific document. For Other NHD/BOD snapshots, ownership, approval and business-review checks cannot be disabled and the 24-calendar-month baseline cannot be extended through this dialog. The manager must also hold the existing central `content.edit` entitlement and the document's native Confluence update permission. This reuses the central entitlement model; there is no separate list of health administrators.

A reason is mandatory. Changes retain the document key, health/rule revisions, actor SOEID, timestamp, and before/after values. Rule revisions are separate from content revisions: changing a maintenance threshold never silently rewrites an approved document. An author, reader, or manager without the required document edit entitlement cannot change rules.

## Workflow

**Open → In progress → Ready for verification → Resolved**

The owner, assigned person, or entitled manager starts the work and submits it for verification. Corrections to content follow the existing editor, review and approval workflow. Only an entitled manager can record resource verification or resolve the health work. Resolution requires all enabled checks to pass. A finding that recurs after resolution reopens the effective workflow; the next saved action records that reopening in its history.

The deadline starts when health work is opened and persisted; merely looking at an unresolved finding does not continually move a deadline forward. A document with no findings and no maintenance case shows **No action needed**. Snapshot and record revision checks reject stale decisions, including a publication changed while a manager's dialog was open.

## Resources and evidence

The checks inventory linked resources, images, attachments and governance source references; embedded local data is self-contained. The application does not run unauthenticated background probes against SharePoint and does not equate a browser access error with a broken resource.

The manager opens the resources using an authorised account and records what was verified. That evidence is tied to the exact approved version/revision and resource list. A different publication, changed resource list or expired verification requires another check. This confirms an accountable person's check; it cannot guarantee that a mutable external file will remain unchanged afterward.

## Storage and Confluence integration

The local prototype stores shared health records separately from document content. The browser reloads the record and current authority before each save, uses optimistic revisions and Web Locks where available, and leaves the prior record intact if storage fails. Local browser storage is demonstration persistence, not a shared production audit service.

Production config uses `healthEndpoint` on the same origin as Confluence. The endpoint must resolve the session SOEID, readable documents, current manager role, central entitlements and native page permissions on the server. It must apply the same rule and workflow checks and commit each change with its audit events atomically. Client-supplied roles or permission claims must never grant authority. The supplied loopback mock demonstrates the contract; it is not the production service.

The reader-facing response must omit private reasons and evidence. Authorised owners, assignees and editors can inspect maintenance history. Preferences, private health history and verification evidence are not added to the public approved-content JSON attachment.

Checks run when the page is loaded or refreshed and after relevant changes. There is no scheduled job or notification delivery in this implementation. A future server scheduler can evaluate the same rules and create reminders without introducing another rule model.

### Adapter contract

`GET <healthEndpoint>?rootPageId=12345&documentId=<stable-key>` accepts repeated `documentId` parameters. It returns `{schemaVersion:1, rootPageId:"12345", subjectSOEID:"AM12345", records:[...]}`. Only persisted records need to appear; an absent record uses the versioned default rules. All requested IDs must be readable by the authenticated subject.

`POST <healthEndpoint>?rootPageId=12345` accepts `{documentId, command}`. Each command carries `action`, `expectedRevision`, `expectedPublishedVersion`, `expectedPublishedRevision`, and a nonempty `reason`. Actions are `update-rules`, `start`, `submit`, `verify-resources`, and `resolve`. A rules update adds `rules` and `assigneeId`; resource verification adds `evidence`. The successful response is `{rootPageId:"12345", subjectSOEID:"AM12345", record:{...}}` with the committed new revision and audit event. Identity and entitlement claims are never accepted from the command.

Use the exported `WCSContentHealth` domain model for schema validation, authority, evaluation and transitions. Resolve the authoritative document and grants again inside the server transaction, compare both record and approved-content revisions, and commit the record plus its audit atomically. Return `403` for denied access and `409` for a conflicting revision. Same-origin credentials and the `X-Requested-With: XMLHttpRequest` header are used; the server must also enforce its own origin/CSRF policy. The local contract example is `mock-health-route.cjs`, mounted by `mock-confluence.cjs`.

The client bounds requests and response parsing to ten seconds. A failed or timed-out write has an uncertain outcome and cannot be automatically repeated as another decision. The UI retains the explanation and requires a reload before a new attempt. Server persistence and response validation remain necessary before reporting success.
