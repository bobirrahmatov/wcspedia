> October 28 update: new direct Insights use one native page under Insights, with published-only WCSpedia metadata on that page. Existing private records and Job aid draft/review records remain in Working-root. Approved Job aids publish under the selected business-area parent. See the October 28 section in UPLOAD-READY.md for lifecycle, history and library attachment installation.

# Confirmed WCSpedia space deployment

The department has its own **wcspedia** space and can create pages, upload attachments, use enabled HTML macros and configure space Look and Feel. It cannot access the Confluence server or deploy a custom backend. This clarification on 2026-10-17 supersedes earlier instructions to deploy the publication server package.

Navigation comes from **`{include:wcspedia:navBar}`**. Preserve that header. Fonts and the theme come from Look and Feel CSS. Each WCSpedia page contributes only its content fragment and matching JS pair; shared behavior loads once through navBar and the existing global stylesheet.

## Native-session direction

Use the current user's same-origin session and built-in `/confluence/rest/api/...` endpoints. Native REST page creation does not require hosting a new server; native permissions apply. Keep the existing editor/review UI and replace its service-dependent persistence with an explicit native-session implementation, not a redirect to another editor.

The document approval flow is:

1. Save rendered content to a native working page beneath a verified, appropriately view-restricted working parent in wcspedia. A REST-created page can be `status: current` while WCSpedia calls it Draft; do not claim it is Confluence's unpublished editor draft.
2. Keep compact per-document assignments, workflow state, source dates and page/version mappings with that document. Bind review to the exact content/media revision. Load editable source on demand, not every document on search/landing startup.
3. The eligible reviewer/manager uses the existing screens. Their signed-in session creates/updates the approved native child beneath the configured business-area or Insights parent. Keep the published page ID for subsequent approvals.
4. Verify each write and version. Page, property, attachment and restriction writes are separate operations, not a transaction. Partial/unknown outcomes need recovery before reporting completion or attempting another publication.
5. Native history/comments provide actual account and timestamp evidence. Client JSON is metadata, not an immutable approval ledger. Keep comments native and analytics as an explicit download.

New blogs explicitly publish directly, without reviewer/approver assignments; their editor fixes the destination to Insights. Existing approval-managed records retain their workflow. Working stores the recoverable source/media staging, not a blog approval queue.

Keep Blog-classified articles as ordinary `type: page` children under Insights when a parent hierarchy is required; native `blogpost` entities have no parent hierarchy.

Do not replace native content with an ever-growing full-library JSON file. Preserve the existing `wcspedia-published.json` until its custom-view consumers are migrated. Keep `entitlements.json` as the requested single grant file with native protection of its host. Binary attachment updates have no expected-version compare-and-swap contract: concurrent direct writes can lose grants. The native-session implementation reads the latest attachment by filename, verifies its identity/size/JSON, and uses observed fingerprints plus a CAS content-property reservation for cooperating writers. Manual replacements no longer need reference recovery. Unfinished managed saves retain the prior verified snapshot until the original request is reconciled; direct manual uploads are not atomic with these reservations. A JSON role never elevates native permissions.

## Approval boundary

The application can guide and record review. Confluence enforces native space/page permissions. Browser scripts cannot add the server-side condition “this user may publish only after this reviewer approves.” A user with native Add page rights may create content outside WCSpedia's UI. Do not describe this cooperative workflow as equivalent to the earlier trusted service's conditional authorization.

View restrictions inherit; edit restrictions do not. Restricting a parent's edits neither protects every child edit nor creates a manager-only child-creation boundary. Setting restrictions requires native Edit plus Restrict/Admin rights, which are not established merely by access to the space. Never write a private draft to a publicly readable location and restrict it afterward.

## Current status

The native-session replacement is now implemented in `space-storage.js`, `space-workflow.js`, `space-renderer.js`, `space-personal.js`, `space-engagement.js` and `space-health.js`, integrated with the existing adapter and screens. Configured upload macros explicitly use `authoringMode: "confluence-session"`. Add document, draft saving, review/publishing, entitlement editing, favourites, native-comment suggestions, helpfulness voting, recorded-view counters and content-health rules no longer require custom services in this mode.

The updated article header fragment loads `wcspedia-article-engagement.js` and `wcspedia-article-discussion-bootstrap.js`; comments load lazily and independently of the feedback/counter row. No extra header or font is added.

Helpfulness votes live in compact per-account/document native JSON properties; one shared per-document JSON ledger holds recorded-view totals and rolling 30-minute account deduplication. The ledger explicitly rejects overflow beyond 180 active accounts per document to remain below the 32 KB native property limit. Native article update permission is required to record either feature. Counts describe successful eligible WCSpedia recordings, not all Confluence traffic; native editors can modify properties outside the app. Do not represent these as tamper-proof ballots or grant extra edit rights solely for counting.

Content health persists per managed, approved document in `wcspedia-health.json` on its restricted Working page, using the existing CAS pointer/recovery approach. Current application grants and native Working-page Edit/Add attachments rights are required; rule management retains its Manager requirement. Existing unmanaged pages do not automatically gain workflow-bound health persistence. No scheduler or background verification service is installed.

No starter file is required for these records. Successful writes create them; never replace existing metadata with blank files. Insights downloads one combined analytics JSON explicitly for manual reporting, without maintaining a shared analytics attachment. See [MANUAL-ANALYTICS.md](MANUAL-ANALYTICS.md) for coverage and aggregation details.

Read [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md) for native permissions, setup, data locations, conflict recovery, known boundaries and the required two-account live check. Local test evidence does not establish internal instance availability. Legacy server files remain reference only.

## Official references

- [Confluence native page creation and updates](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)
- [Page restrictions, inheritance and blog hierarchy](https://confluence.atlassian.com/doc/page-restrictions-139414.html)
- [Content properties](https://developer.atlassian.com/server/confluence/content-properties-in-the-rest-api/)

Confirm endpoint behavior against the internal installed version. No internal deployment or live permission check has been performed here.

## October 26 access synchronization

`space-access-sync.js` reconciles the JSON roster into native per-user space grants and Working viewing restrictions after verified Entitlements saves. It runs as a native Space Admin with full JSON administration rights, preserves Working editing, and records only app-owned grants for revocation. No groups, elevated credentials or backend are installed. Creation no longer substitutes Working Edit for Add page permission. See [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md#automatic-entitlements-to-confluence-synchronization) for endpoint compatibility, partial-write recovery and the required live checks.
