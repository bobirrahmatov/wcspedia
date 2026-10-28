**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

# Native business-area pages, with the existing WCSpedia design

**This is the earlier backend integration, not the department's installation path.** The confirmed environment has space access only, no backend deployment, and an existing `{include:wcspedia:navBar}` header. See [the native-session direction and current migration status](./CONFLUENCE-SPACE-ONLY.md). Do not request server access or treat uploaded source files as a deployed workflow.

The current Add document dialog, editor, cards, workspaces and shared CSS stay in place. This integration changes where the trusted workflow service stores and publishes a document. It does not enable the separate `experimental-native/` interface or switch the editor.

## Native title, actions, comments and footer

The publisher now defaults `hostStyleFlags` to `true`. Its storage renderer inserts a native Anchor named `wcs-page-style-v1` and an escaped document-title heading in new working/published bodies. Install the separate **WCSpedia-page-style-flags.zip** helper in the existing shared header before deploying this publisher. The helper recognizes the marker on native child document views, excludes all six interface pages, and uses the existing Citi theme classes; it skips native editing, preview and history. No script is stored inside native document bodies.

Deploy the updated `confluence-publisher.cjs` and `confluence-storage.cjs` on the trusted service host, alongside its existing dependencies. Uploading browser attachments alone does not change service output. Existing documents receive the marker on a subsequent actual content write, not an idempotent replay of a completed request. A server configuration of `hostStyleFlags: false` disables this output for future writes; custom renderers must honor the option themselves. Permissions, native page IDs and publication/review checks are unchanged. See [PAGE-STYLE-FLAGS.md](PAGE-STYLE-FLAGS.md) for manual pages, templates and native-UI recovery.

## Storage status: current implementation versus native authoring

**The managed authoring workflow is a hybrid implementation.** The established custom Add/Edit screens use `editor.js`. Its trusted workflow journal holds complete document snapshots and audit records, and the publisher generates native working/published pages from those snapshots. Native landing, CQL search and Insights discovery no longer require `wcspedia-published.json`; custom reader/editor and managed workspace views still use it. That compatibility projection contains complete approved bodies and media records, not only page IDs. It is limited to 10,000,000 UTF-8 bytes to stay within this installation's 10 MB attachment limit. Keep the live projection until its remaining consumers have been migrated; do not truncate content or audit history to fit.

The configured upload package includes the supplied home, attachments, working-root, eight business-area and Insights page IDs. Managed workflow/workspace endpoints remain empty until real authenticated services are deployed and configured. The local preview uses browser storage and does not create real Confluence pages. Fixture tests verify implementation behavior, not connectivity to the internal server. Direct native edits to a managed page cause version conflicts rather than being imported automatically into the custom editor.

The production direction keeps the **existing WCSpedia editor, design and custom approval workflow**. Scaling storage and per-document loading is a backend change; it does not require opening Confluence's native editor or replacing the current authoring screen:

| Information | Target storage and access |
| --- | --- |
| Working document content | Edited in the existing WCSpedia editor; the trusted service maintains the protected working revision and its mapped native working page. Future per-document APIs load only the authorized document needed by that same UI. |
| Approved reader content | Native page beneath the selected business area, updated at the same published page ID after exact-version approval. |
| Document key, business area, owner and review dates | Small per-page metadata; visible Page Properties where appropriate. REST content properties are a separate metadata API, not document-body storage or an authorization boundary. |
| Approval decisions, entitlements and audit | Protected server-side workflow records linked to the document key and exact native page version. Author-editable metadata and labels cannot grant approval or permissions. |
| Search and browsing | Permission-aware, paginated CQL/REST discovery of native pages; fetch the selected document on demand. Any metrics/search index is derived and access-filtered, not a second editable document store. |
| Application JS/CSS, logos, images and supporting files | Confluence attachments, with media attached to the appropriate working/reader page and audience. Existing controlled SharePoint documents stay at their source. |

Confluence supports creating a child with `POST /rest/api/content` and its parent in `ancestors`, and updating the existing ID with `PUT /rest/api/content/{id}` and the next `version.number`. See [Server/Data Center REST examples](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/), [content properties](https://developer.atlassian.com/server/confluence/content-properties-in-the-rest-api/) and [CQL](https://developer.atlassian.com/server/confluence/advanced-searching-using-cql/). JSON remains useful as API transport and small metadata; the requirement is to stop using aggregate document attachments as the content database.

Live search, business-area browsing and autocomplete use permission-aware CQL inside the verified space/root tree, including unlabelled descendants. Result links open native page IDs. They bootstrap from the small navigation catalogue embedded in the scripts without downloading document JSON. Managed views still use their JSON projection; native-editor saves are not round-tripped into the managed workflow. Completing the remaining transition requires coordinated changes:

1. Replace the remaining custom detail/workspace projection dependencies with native metadata and per-document loading, preserving document controls and exports. Landing, Insights and search already use paginated CQL without document JSON startup. Do not ship restricted page bodies inside a library-wide attachment: downloading that attachment is controlled by its own access, and client-side filtering cannot restore per-document privacy.
2. Keep Add/Edit in the existing WCSpedia editor. Extend its authenticated backend to load/save one authorized document revision at a time, preserving the permanent document key, working page ID, content conversion, assignments and conflict checks. A draft remains protected before its first body write. Save must not itself approve the document.
3. Bind submissions, changes, health assessments and approval to the exact managed revision and mapped native version. Preserve the existing publisher as the controlled native writer, detect out-of-band changes and reject stale decisions. Publish only the reviewed revision; do not introduce an independently editable second source.
4. Migrate and verify existing document/page mappings, content, media and approval evidence before switching readers. Keep the existing approved reader available until the replacement passes staging; retire the full-body JSON dependency only after all consumers are converted.

This section records the storage-scaling direction; the per-document backend transition is **not implemented by these documentation changes**. The current editor, working/published mapping and approval separation remain. The separate native-interface reference is not a replacement for the established design.

## Page structure and behavior

```text
WCSpedia                                  ← publishedRootPageId / rootPageId
├── Credit Approval Control               ← one configured area page ID
│   └── Approved document                 ← permanent published page ID
├── Credit Information Management
├── Credit Management Reporting
├── Deal Closing
├── Documentation & Pledging Team
├── EMEA Credit Admin
├── Loan Management
└── Regional Operating Manuals

WCSpedia Working Documents                ← separate, read-restricted root
└── Working document                      ← permanent working page ID
```

| Existing action | Native result |
| --- | --- |
| Save new draft | Creates a working child beneath the restricted working root. The selected business-area key is recorded. No reader child is published. |
| Save changes / submit / review | Updates the same working child and records the domain transition. |
| Manager approves | Publishes the exact reviewed revision beneath the selected business-area page. The first publication creates a reader child; later approvals update that same child ID. |
| Revise published content | Keeps the prior approved reader page visible while the working revision changes. |
| Delete | Requires the existing application entitlement and native permissions, retains the deletion audit, and trashes both mapped pages. It does not permanently purge Confluence trash. |

Native title suffixes identify the permanent document key and avoid collisions between same-title documents in a Confluence space. WCSpedia continues showing the original document title. Slugs and title changes do not replace page IDs. The eight area pages are configured once; the service does not create an area page for every document or guess a parent when a mapping is missing.

## Confluence setup

1. Create the eight area pages directly below the WCSpedia library page in the same space. Create a separate Working Documents root outside that subtree. Apply native **view restrictions** to the working root for the author/reviewer/service groups. The publisher checks actual restrictions and parent relationships before writing. View restrictions inherit; edit restrictions do not automatically inherit. [Atlassian page restrictions](https://confluence.atlassian.com/doc/page-restrictions-139414.html)
2. Use the supplied IDs in the configured six-page package. The published/search root is `3954553300`, the separate attachments host is `3962195316`, the restricted working root is `3961735834`, and Insights is `3961735728`. Keep all eight business-area mappings. Independently deploy the matching publication map on the trusted server; browser-supplied parent IDs are not authoritative. The publisher's published root must equal the macros' `rootPageId`. The projection writer must target the separate attachments host.
3. Upload the six matching logic/HTMLPage JS pairs and the one shared stylesheet from the configured package. Paste each complete HTML macro, which carries its settings inline. There is no separate configuration JS attachment to upload for this installation. Update existing header inclusions with their matching versions; keep the current header, fonts and navigation.
4. Configure the macros' `workspaceEndpoint` and `workflowEndpoint` to the authenticated trusted service described below. Keep the other feature endpoints already configured for entitlements, suggestions, bookmarks, health and metrics. Empty URLs and placeholder IDs are deliberately not treated as successful live saves.
5. For a new deployment only, initialize the production directory and `entitlements.json` policy with real users and stable Confluence identity mappings. Preserve existing live grants and audit records when upgrading. Initialize an empty approved-only reader attachment if this is a new library. Do not deploy the illustrative sample people, grants or documents as production records.
6. Run the staging acceptance sequence below with a real author and manager before enabling the navigation widget for users.

Server source is supplied in the separate publication-service source package for review and deployment; it is not part of the browser upload kit. **Only browser assets belong in Confluence attachments.** Keep `.cjs` server modules, credentials, workflow records and journals on the trusted host. The existing HTML macro loads the UI; it does not execute Node server modules or enforce approvals.

## Server integration

The implementation consists of:

- `confluence-storage.cjs`: converts the selected snapshot into native storage XHTML, Page Properties, approved metadata, tables, lists, code blocks and native attachment references. It escapes untrusted text and does not execute arbitrary HTML or iframe code.
- `confluence-publisher.cjs`: creates and updates real native pages using the Confluence Server REST API, stages media, checks identity/version/parents, manages labels and trashes mapped pages. It exports `createPublisher`, `createFileJournal` and the eight `AREAS` keys.
- `publication-workflow.cjs`: runs the existing domain workflow on the trusted host, repeats entitlement checks, prepares a durable transaction, invokes the publisher, writes the approved reader projection and returns a commit receipt.
- `publication-http.cjs`: exposes `createPublicationHandler` for authenticated workspace reads and governed workflow commands, with origin/request checks and bounded request bodies. The host must resolve the trusted session and filter every workspace response; it never publishes the service's complete private snapshot automatically.
- `confluence-projection.cjs`: writes and verifies the approved-only reader attachment using an idempotent server journal.
- `publication-config.js`: non-secret browser routing expectations. The server must load its independently managed configuration.

These modules use CommonJS and Node's built-in fetch/FormData/Blob support. Deploy on a supported Node runtime providing those APIs. An approved internal service can call them directly. A ScriptRunner or other Java-based host needs a compatible service bridge or port; an HTML macro alone cannot host them.

Use `PUBLICATION-SERVER-SOURCE.md` in the separate server source package for host composition. Connect the workflow service to the HTTP handler with trusted `authenticate(request)`, permission-filtered `loadWorkspace(session, { rootPageId })`, and `loadCapabilities(session, { rootPageId })` adapters, then host distinct workspace GET and workflow POST paths under the same Confluence origin. The capability adapter must prove the caller's current entitlement, native read access and Add page permission in the space; the workflow repeats authorization for mutations. For example, `/confluence/rest/wcspedia/1/workspace` and `/confluence/rest/wcspedia/1/workflow` are **proposed custom routes**, not built-in Atlassian endpoints. After they are actually deployed and staging-tested, copy their real URLs into every macro and the header widget. The existing editor and approval screens continue calling those services; no native-editor switch is required.

The host supplies these adapters to `createWorkflowService`:

| Adapter | Required behavior |
| --- | --- |
| `authenticate(session)` | Resolve the authenticated Confluence user from a trusted session. Do not accept actor, role, SOEID or approval timestamps from request JSON. |
| `loadPolicy()` | Read the current central `entitlements.json` attachment and validate it with `entitlements.js`. Use the same policy as the interface. |
| `nativeAccess(context)` | Resolve the caller's fresh library, working-page, area-parent and published-page operations. Return the current working-page version. The exact contract is documented in the module. |
| `loadInitialState()` | Return the initial authorized directory, taxonomy, documents and actual reader-attachment version. Used only for first initialization. |
| `writeProjection` | Use the supplied projection writer or an equivalent durable, idempotent implementation. Never report an unconfirmed attachment upload as committed. |
| `journal` | Persist both workflow state and publisher transactions. Every writer must use the same locks. |

`service.execute(command, trustedSession)` handles create/edit/revise/submit/review/approve/delete. Preserve the existing endpoint handling for taxonomy and other modules. Newly added areas need an explicit publisher/browser mapping extension before documents can be created there; the supplied release supports the agreed eight areas.

Wire the modules on the trusted host as follows. `serverConfig`, credentials and the `platform` adapters below belong to that host, not to an HTML macro:

```js
const {createPublisher, createFileJournal} = require('./confluence-publisher.cjs');
const {createProjectionWriter} = require('./confluence-projection.cjs');
const {createWorkflowService} = require('./publication-workflow.cjs');
const journal = createFileJournal(serverConfig.privateJournalDirectory);
const publisher = createPublisher({
  ...serverConfig.publication, // baseUrl, spaceKey, roots, eight areaPageIds
  headers: platform.confluenceServiceHeaders,
  journal
});
const writeProjection = createProjectionWriter({
  baseUrl: serverConfig.publication.baseUrl,
  // This is the JSON attachment host, not the published/search root.
  rootPageId: serverConfig.attachmentPageId, // 3962195316 in this installation
  headers: platform.confluenceServiceHeaders,
  journal
});
const service = createWorkflowService({
  rootPageId: serverConfig.publication.publishedRootPageId,
  publisher, journal, writeProjection,
  authenticate: platform.authenticateConfluenceSession,
  loadPolicy: platform.loadCurrentEntitlementPolicy,
  nativeAccess: platform.resolveCurrentNativePermissions,
  loadInitialState: platform.loadInitialWorkflowState
});
// Inside an authenticated, CSRF-protected route:
// response = await service.execute(request.body, request.trustedSession);
```

The projection writer requires one pre-uploaded approved-only JSON attachment on `serverConfig.attachmentPageId`, matching the browser `attachmentPageId`. Its constructor field is named `rootPageId`, but for this writer that value means the attachment host; it must not be copied from `publication.publishedRootPageId` when the hosts differ. The writer checks serialized UTF-8 bytes before native publication and rejects a projection over 10,000,000 bytes. The per-file media uploader enforces the same ceiling. These controls do not increase the server's configured maximum. It validates the proposed reader data before native writes, verifies uploaded bytes at the exact attachment version, and recovers confirmed uploads without uploading another copy. A request whose upload outcome remains unknown stops for reconciliation; it does not blindly resend a multipart upload. Native attachment updates have no atomic CAS, so every writer of this attachment must share the protected service lock and native upload permissions must be restricted accordingly.

The HTTP host must authenticate and enforce CSRF/origin rules, JSON body limits, and matching `Idempotency-Key`/`requestId` before calling `execute`. The server must not expose unrestricted `snapshot()` results: that method is for trusted integration. The workspace response must filter drafts and audit details by current permissions. The public reader response must use `readerProjection()`.

`createFileJournal(directory)` is a durable reference implementation for **one Node process on one host**. Its directory must be private and backed up. For a clustered service, inject a transactional database journal with distributed locking; do not share this file journal between processes. Preserve completed request records and publication mappings according to the approved retention process. All entitlement/directory/health writers affecting the authoritative store must participate in its concurrency contract.

### Approval, recovery and native permissions

The coordinator stores the exact staged document, server timestamp, audit event and directory snapshot before native writes. A timeout retries the same request ID and content. The publisher reconciles its existing page and marker before another write. A different request cannot pass an unfinished transaction. Approval never regenerates a different revision or approval timestamp during recovery.

Native pages and the reader attachment cannot be committed as one Confluence transaction. A native page may already be updated while a failed reader-projection write is awaiting recovery. The workflow endpoint withholds success until both are confirmed and the durable workflow state is committed. Retry the same command or have the service operator reconcile its journal; do not remove pending records to force another publication.

Configure native write access and the installed workflow integration together. This module rejects out-of-band page version changes; it cannot intercept direct native editor writes, attachment replacement or another REST client. If native editors retain write access to published pages, the platform must enforce the same approval controls there. Confluence REST page deletion has no version-CAS parameter, so the host must prevent competing writers during deletion. HTML button visibility and CQL labels are not security controls.

Deletion recovery requires trusted confirmation of native trash state; a missing/forbidden page alone is not evidence of successful deletion. The host's `nativeAccess` adapter receives a server-created recovery descriptor and must verify current space rights, remaining page rights and already-trashed page identities. Current central entitlement is checked again during retries.

### Reader and workspace mappings

The protected workspace document stores:

```js
{
  id: 'permanent-document-key',
  area: 'deal-closing',
  confluencePageId: 'working-page-id',
  confluencePageVersion: 4,
  publishedConfluencePageId: 'reader-page-id',
  publishedConfluencePageVersion: 2
}
```

The approved reader projection promotes the reader ID/version into its `confluencePageId`/`confluencePageVersion` fields and removes the working mapping, private governance assessment and audit history. The browser verifies the publication receipt against the selected business area, expected version/revision, parent and persisted page mapping before reporting success.

Existing production documents need a controlled migration that verifies their native page identity, mappings and approved evidence. The publisher deliberately refuses to adopt arbitrary supplied page IDs. This release does not automatically migrate the demonstration JSON or import unverified legacy approvals.

## Media and search

Uploaded raster images and supporting files are staged as content-addressed, revision-specific attachments before the native page body is exposed to readers. Each uploaded file must fit within 10,000,000 bytes; editor inputs may impose smaller limits. Byte checks confirm the upload. Large recordings remain at their approved source rather than being embedded into a shared JSON file. Direct remote image/file URLs require a trusted staging adapter; the publisher does not fetch arbitrary URLs. SharePoint recordings remain validated SharePoint links in the native storage output, while the existing WCSpedia viewer keeps its recording player. Generic remote embeds are represented as links.

Every published page receives its own `wcs-document`, `wcs-status-published`, `wcs-area-*`, `wcs-type-*` and supported facet labels. Removed managed facets are reconciled. Working pages never receive the published label. Main CQL search retains the existing WCSpedia layout and opens the native page ID. It includes the root and every readable descendant without requiring publication labels; managed labels support optional facets. Area filters use configured page ancestry, with label fallback only when no numeric area mapping is configured. Indexing can lag after publication. [Atlassian CQL](https://developer.atlassian.com/server/confluence/advanced-searching-using-cql/)

The publisher uses `POST /rest/api/content` with the configured ancestor, and `PUT /rest/api/content/{id}` with the next native version for updates. These are Server/Data Center APIs. [Atlassian REST examples](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)

## Staging acceptance

1. As an entitled author, save a document in each area. Confirm a restricted working child exists and no new published child or public CQL result appears.
2. Submit, complete the assigned review, then approve as the assigned manager. Confirm the reader child appears under the correct area with the reviewed body, attachments and labels.
3. Revise it and save. Confirm the reader page ID and approved content stay unchanged until the new revision is approved. Approve and confirm that the same reader ID now has a higher native page version.
4. Retry the same request after a simulated lost response; confirm no duplicate page, attachment version or audit event. Exercise native conflicts and a failed projection write followed by recovery.
5. Confirm readers cannot access working pages or private audit/review evidence, and users without effective edit/delete rights cannot perform those actions through either the endpoint or native Confluence controls.
6. Delete a test document; confirm both mapped pages move to trash, the approved projection no longer contains it, and the protected deletion audit remains.

Local source and integration tests exercise these flows against isolated Confluence REST fixtures. The actual Citi Confluence version, installed workflow capability, live IDs, authentication and deployment have not been accessed or verified.
