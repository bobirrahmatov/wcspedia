# WCSpedia feature roadmap

Bookmarks and the rule-based content-health worklist are now implemented in the local prototype, with service adapters for production. Other items below remain proposed additions. They build on the existing document workflow, entitlements, audit trail, suggestions, tagging, search, workspaces, and export features. Keep one document identity and one entitlement model across the library and training features.

Start with review reminders, version-specific acknowledgements, and structured recorded training. These address stale procedures, evidence of required reading, and practical learning needs without adding another content silo.

## Document governance

| Priority | Addition | Practical dependency |
| --- | --- | --- |
| 1 | **Review reminders and escalation.** Turn the existing review date into due/overdue queues, owner reminders, and manager escalation. | An authorised scheduler and notification service; recorded delivery, retry, and escalation rules. |
| 1 | **Required-reading acknowledgements.** Record who acknowledged which approved document version and when; distinguish pending, completed, and superseded acknowledgements. | A trusted, durable ledger keyed by document ID, approved revision, SOEID, and timestamp. Page views are not acknowledgements. |
| 2 | **Delegation and ownership handover.** Assign a time-limited review backup and transfer ownership with a reason when staff move roles. | Central entitlements, effective dates, conflict checks, and an audit record; preserve author/reviewer separation. |
| 2 | **Supersession and impact tracking.** Link a replacement document and identify job aids or training that depend on a changed procedure. | Explicit document relationships, retirement rules, and human confirmation of affected content; preserve historical versions. |

## Training and recordings

| Priority | Addition | Practical dependency |
| --- | --- | --- |
| 1 | **Structured training records.** Add learning objectives, trainer, delivery date, language, prerequisites, and recording duration beside the SharePoint recording. | A versioned training schema. Keep watch duration separate from automated reading time. |
| 2 | **Captions, transcripts, and chapters.** Help people find a specific step and learn without audio. | Maintain source captions/transcripts with the recording. Any WCSpedia transcript indexing must use an approved, permission-aware integration. |
| 2 | **Role-based learning paths.** Group approved material into onboarding or process pathways for a role, business area, or region. | Versioned paths and assignment rules that reuse the existing taxonomy and SOEID identity. |
| 3 | **Knowledge checks and completion evidence.** Add short checks, attestations, due dates, and renewal periods where training requires evidence. | An authoritative learning record service or LMS, assessment rules, and retention ownership. An iframe load or page view must not count as completion. |

## Findability and maintenance

| Priority | Addition | Practical dependency |
| --- | --- | --- |
| 2 | **Controlled glossary and search synonyms.** Connect business acronyms, legacy terms, and preferred process names to the existing tags and search. | Named taxonomy owners, reviewable synonym changes, and relevance tests using real staff queries. |
| 2 | **Saved searches and approved-update subscriptions.** Let staff return to useful material and follow changes relevant to their work. | Identity-backed preferences and authorised notifications; link only to content the recipient can access. |
| 2 | **Extend the content-health worklist.** The implemented checks cover owner, review date, approval evidence and accountable resource verification; future additions could detect possible duplicates and use authorised server-side resource probes. | Permission-aware checks and reliable error classification. A cross-origin browser failure alone must not mark a resource as broken. |
| 2 | **Templates and quality checks by content type.** Offer job-aid sections for purpose, steps, exceptions, and controls; training sections for objectives and exercises. | Agreed editorial standards, accessibility checks, and human review. Reuse the existing editor and approval workflow. |

Production prerequisites remain the same for all options: verified Confluence permissions, trusted server-side enforcement of workflow and entitlement changes, an agreed retention model, and tested behaviour under concurrent edits. These are implementation dependencies, not assurances supplied by a browser prototype.
