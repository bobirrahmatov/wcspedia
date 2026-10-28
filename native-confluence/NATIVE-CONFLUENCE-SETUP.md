# Optional native-page integration experiment — Confluence Server / Data Center

**This guide is not the default WCSpedia deployment.** The established landing page, search, details, editor and workspaces remain in the root application with their existing Citi design. Use [the main README](../README.md) and [current macro/service setup](../CONFLUENCE-WORKFLOW.md) for that interface. The root `WCSpedia-confluence-package.zip` must not be replaced with this experiment.

This folder documents native Confluence REST/CQL, page templates and editor-navigation work that can inform a future data adapter. Its separate demonstration UI is not the requested design and must not replace the established components. The native page storage/editor flow is **not yet wired into the established WCSpedia interface**. Retain this work for isolated development and verification, then integrate the underlying capabilities without redesigning the application.

Build the optional assets with `node build-native.cjs`. Output is isolated in `experimental-native/`, including `wcspedia-native.js`, `wcspedia-native-style.css`, configuration and experimental macro fragments. These files are outside the default package and use a separate stylesheet filename. Do not load both applications on the same page or overwrite the root macros/global stylesheet with this output.

The experiment uses native Confluence pages for content and native editor navigation; shared CSS/JavaScript remain attachments. A live approval workflow is not delivered by an HTML macro. `authoringMode: 'workflow'` requires a trusted same-origin service or approved workflow-app integration. The explicit `native-template` option opens the native template chooser for restricted working content and does not provide manager approval or controlled publication. Page IDs, space keys and the workflow endpoint remain placeholders. No live Confluence installation was changed or verified.

The remaining sections describe an isolated integration pilot, not completed production setup. Do not migrate existing documents or switch the default application based only on these local browser modules. Select one authoritative content source when the native adapter and workflow are ready; never keep independently editable native and JSON masters.

## 1. Prepare the Confluence areas

Create or identify these native pages, preferably with a dedicated restricted authoring space:

| Area | Native permissions and purpose |
| --- | --- |
| Published library root | Intended readers may view. The controlled publisher is the writer. Authors must not be able to update approved reader pages directly. |
| Working root | Restricted authoring area; only the approved author/reviewer groups and service may view. All new content must be protected at creation. |
| Shared asset page | Readers can fetch approved shared JavaScript, CSS and logo files. Limit editing to application maintainers. |
| Library landing page | Hosts `library-macro.html`; this can be the published root. |
| My workspace | Hosts `my-workspace-macro.html`. |
| Reviewer workspace | Hosts `reviewer-workspace-macro.html`; the service still checks each request. |
| Saved items | Hosts `saved-items-macro.html`. |
| Entitlements | Retains the central SOEID-based access management module and its trusted service. |

Do not substitute the Covenant example page ID for a WCSpedia root. The roots are actual numeric page IDs; shared assets and authoring content need not have the same parent.

Confluence view restrictions inherit; edit restrictions do not. Native space/page permissions must also prevent direct editor and REST updates that would bypass the workflow. The SOEID table adds business authorization, but browser visibility is not enforcement. Page labels, a hidden button, and a CSS class do not grant or remove access. Confirm these rules against your installed Confluence version. [Page restrictions](https://confluence.atlassian.com/doc/page-restrictions-139414.html)

If an approved workflow app already guarantees approved-version visibility and prevents unapproved publication through every access path, adapt the service to that app instead of creating a second workflow. The supplied client contract otherwise assumes protected working pages and controlled publication to reader pages.

### Check the installed capabilities first

Ask a Confluence administrator to perform this read-only check; access to an HTML macro does not imply administrator access:

1. Open the administration gear menu → **Manage apps** (called **Manage add-ons** in some versions). Some versions expose this under **Apps → Manage apps**.
2. Select **User-installed** and search for **Comala** and **ScriptRunner**, then record the exact product name, version, enabled state and available configuration. Do not install or enable an app just because it appears in this guide.
3. Check the relevant space's workflow configuration. An installed app is not proof that a workflow applies to these pages. Confirm reader visibility, page updates, attachments, API access and exports with that app's documented capabilities.
4. If ScriptRunner or an internal plugin is available, ask its administrator whether an approved authenticated endpoint can implement this contract. Neither an app's presence nor the HTML macro automatically implements it.
5. Record the Confluence version from the administrator's system information and verify the native REST, Page Properties and export behaviour on that version.

If these menus are absent, the administrator should perform the check rather than granting general administrative access to WCSpedia users. [Atlassian: viewing installed Server and Data Center apps](https://confluence.atlassian.com/upm/viewing-installed-apps-273875714.html)

## 2. Build and configure an isolated pilot

For an explicitly selected isolated pilot, run `node build-native.cjs` from the `wcspedia` folder. Use only the generated files under `experimental-native/`. Upload its `wcspedia-native.js`, `wcspedia-native-style.css` and configured `native-confluence-config.js` to a separate test asset page. Keep the root application assets and production global stylesheet unchanged.

| Configuration | Meaning |
| --- | --- |
| `mode` | Keep `native-page` only in the isolated native experiment. |
| `authoringMode` | Default `workflow` requires the trusted service for new-page preparation. Explicit `native-template` opens the native template chooser for the protected working area without making a direct create REST call. |
| `contextPath` | `/confluence` for the supplied environment. Change only if the actual installation uses another context. |
| `assetPageId` | Page hosting the shared browser assets. |
| `publishedRootPageId` / `publishedSpaceKey` | Reader tree and its Confluence space. |
| `workingRootPageId` / `workingSpaceKey` | Protected authoring tree and space. |
| `nativeWorkflowEndpoint` | Same-origin endpoint supplied by the approved workflow integration. Empty means governed actions are unavailable. |
| `pages` | Separate native Confluence destinations for library, author workspace, reviewer workspace, saved items and entitlements. |

The browser uses the current Confluence origin and signed-in session. Do not put credentials, API tokens, service-account passwords or trusted SOEIDs in JavaScript. An asserted manager role in client configuration is not a permission source.

On isolated test pages, load `wcspedia-native-style.css`, configuration and the native bundle once, in that order. Do not add these experimental assets to the existing global production navigation. The example page fragments include these asset tags for self-contained installation; remove repeated tags if assets are already loaded globally. The snippets use attachment paths beginning `/confluence/download/attachments/REPLACE_WITH_ASSET_PAGE_ID/`. Replace that placeholder in every snippet used.

Use an explicit deployment revision in the attachment query strings when updating cached assets. Keep script and stylesheet revisions together. No Tailwind or stylesheet CDN is required.

If only HTML macros are available initially, set `authoringMode: 'native-template'` after creating and verifying the protected working area. Add document then opens Confluence's native template chooser, where the user selects a template and supplies the native page title. The client verifies the signed-in user and the configured working root/space; native permissions remain responsible for creation rights. The working root must not fall under the published tree. Native Save/Publish in that area saves working content only. Existing permitted working pages can also open directly in the native editor without a workflow endpoint. Reader search, native Save for later, native exports and native page history do not require the custom workflow service. Assigned review queues, approvals, controlled publication, service-driven deletion and published-to-working preparation still require it.

## 3. Add the native templates

`template-manifest.json` explicitly maps every type offered by the Add document picker:

| Content type | Native storage template |
| --- | --- |
| Job aid | `templates/job-aid.storage.xhtml` |
| Training | `templates/training.storage.xhtml` |
| Blog | `templates/blog.storage.xhtml` |
| Guide, Checklist, Knowledge sharing, Reference, Report, FAQ, Template, Playbook | `templates/generic.storage.xhtml`, with its allowlisted content-type substitution |

The browser sends the manifest entry's `id`, such as `job-aid` or `knowledge-sharing`, as `type`. The service must select that exact manifest entry, use its template, substitute its `contentType` for `{{CONTENT_TYPE}}` in the generic template, and XML-escape all text. Reject unknown types. This is a template registry, not an independently editable content database.

These files are **Confluence storage-format fragments**, not browser HTML pages. Install them through an approved template/import capability or the trusted creation service using `body.storage`. Do not paste the XML into the HTML macro or the normal rich-text editor: it would not create the intended native structure. If you do not have a storage-format import tool, create the same headings and table in the native template editor and insert the Page Properties and Excerpt macros using Insert → Other Macros.

Each template has a visible, two-column Page Properties table. The left column uses heading cells. Its Page Properties ID is `wcspedia-document`. This is ordinary, versioned native page content and can be edited in Confluence. It includes the owner name, SOEID, accountable team, scope, regions, process/topic tags, source references and next review date. The service assigns `{{DOCUMENT_KEY}}`; the owner fills remaining bracketed placeholders before submission. The title is supplied separately when the page is created. The templates do not insert an approval date or claim that the page is approved. [Page Properties macro](https://confluence.atlassian.com/doc/page-properties-macro-184550024.html)

For `native-template` mode, prepare actual named templates in Confluence rather than leaving service substitution tokens in them. Set each generic template's visible Content type to its intended type, and replace the Document key token with an instruction to use the assigned native page ID after the first save. The native page ID is the stable identity in this mode; it does not change when the title changes. If a permanent legacy WCSpedia key already exists, preserve it and its page-ID mapping. The standard Confluence template chooser does not automatically run `template-manifest.json`, substitute `{{DOCUMENT_KEY}}`, apply this manifest's labels or invoke a custom workflow. Configure labels on the actual native templates (or apply them on creation through an approved blueprint/service). Do not leave `{{…}}` tokens in a completed document.

The approved service must escape all interpolated text for storage XML, validate classifications and required metadata, and reject unresolved placeholders at submission. Insert uploaded images and files through native controls so they are real page attachments. Link to existing controlled SharePoint recordings or use only an approved video macro; a recording link does not grant SharePoint permission.

Page Properties is a visible macro table, distinct from the REST JSON content-property API. Use the visible table as the editable metadata source for these templates. A generated JSON metadata property may accelerate discovery, but must identify its source page version and be refreshed by the service. It must not become a second independently editable source. Approval and entitlement data belong to the protected workflow record, not a free-text author field.

## 4. Mount the shared controls and navigation

Paste the contents of `document-controls-macro.html` into a small approved HTML macro on each document template. Place the article's native content below or beside it, outside the HTML macro. Its mount element is `data-wcs-native-document-controls`. `WCSNativeApp.mountDocumentControls(element, config)` resolves the current page ID from the native Confluence page context (`AJS.Meta` or `ajs-page-id` metadata). A missing or invalid page ID must leave actions unavailable; do not invent an ID from a document title.

Paste `add-document-widget-macro.html` into your existing global Confluence navigation. It calls `WCSNativeApp.mountCreateWidget(element, config)`. In `workflow` mode, its form prepares a working page through the trusted service. In `native-template` mode, creation is delegated to Confluence's native template chooser. Neither path is manager approval. The widget does not create another header or footer. Add the separate workspace, reviewer and saved-item links to the native sidebar/navigation using the configured `pages` URLs.

Use the four page-specific fragments for the library and workspaces. Each calls the same `WCSNativeApp.mount` entry point with its own `pageRole`: `home`, `mine`, `review` or `saved`. Native-page document links stay within Confluence. The native edit destination is `/confluence/pages/editpage.action?pageId=<workingPageId>`.

The screenshots' `citiStyleAdd` / `citiStyleRemove` functions are optional host presentation helpers. They are not built-in Confluence authorization APIs and are not required by this package. If the host already uses them, an administrator may apply approved cosmetic flags such as `centered` or `sectioncards`. Do not copy a general body-class toggle to hide native edit actions, restrictions, labels or audit controls as a substitute for permissions. WCSpedia's shared stylesheet styles its own components; authoring remains in the native editor.

## 5. Connect the trusted workflow integration

The browser intentionally does not create an unprotected page and then attempt to restrict it. `prepare-create` must create the page in an already protected area, using a server-managed template and a new permanent document key. `prepare-edit` resolves an approved document to its authorized working copy. Both return `workingPageId`; the client checks that the page is readable, belongs to the configured working tree/space, and has a native update operation before opening the editor. The service must enforce those rules even if a caller bypasses the browser.

Use one same-origin endpoint for the following contract. The names describe application commands, not built-in Confluence REST routes.

| Request | Required behaviour |
| --- | --- |
| `GET ?view=document&pageId=…` | Return the caller's permitted workflow status, native `expectedVersion`, opaque `submissionToken` and explicit capabilities; do not reveal restricted review evidence to readers. |
| `GET ?view=mine&start=…&limit=…&query=…&type=…&region=…&sort=…` | Return only authorized working pages and pagination information, filtered and sorted before pagination. |
| `GET ?view=review&start=…&limit=…&query=…&type=…&region=…&sort=…` | Return only documents assigned or permitted for this reviewer/manager, applying the same requested filters and sort. |
| `POST prepare-create` | Validate title/type/summary, derive author identity, assign a permanent key, and create the restricted native working page. Provide an operational recovery path if the response is lost. |
| `POST prepare-edit` | Check the expected reader-page version and resolve/create its restricted working page. Do not modify the approved reader page. |
| `POST submit` | Capture and validate the exact saved native page revision, metadata and attachment manifest; create a review submission. |
| `POST complete-review` | Record independent review of that submission, with the reviewer's authenticated identity and time. |
| `POST request-changes` | Record the decision and required comment, return the submission to its author, and preserve the history. |
| `POST approve` | Check the manager's authority, required review and unchanged submitted evidence; publish or schedule publication of that exact approved snapshot. |
| `POST delete` | Check native delete permission and central entitlement, preserve the deletion decision, and apply the approved trash/archive and retention policy. |

The UI treats capabilities as instructions for presentation. The service must recalculate authorization at every write. Use Confluence's authenticated identity; map that verified user to SOEID server-side. Do not accept an `actorSOEID`, `isManager` or browser-provided role as authority. Verify author/reviewer/manager separation required for the content type. Keep manager-only health-rule editing protected by the same service.

Apply the platform's server-side CSRF/origin controls to these authenticated POST routes; accepting JSON or seeing `X-Requested-With` is not a replacement for the configured protection. Do not enable permissive cross-origin credentials on the workflow endpoint. The browser deliberately refuses redirects and requests outside its Confluence origin/context.

Example document-state response shape:

```json
{
  "pageId": "123456789",
  "status": "in-review",
  "expectedVersion": 7,
  "submissionToken": "OPAQUE_SERVER_ISSUED_SNAPSHOT_TOKEN",
  "capabilities": {
    "edit": false,
    "submit": false,
    "complete-review": true,
    "request-changes": true,
    "approve": false,
    "delete": false
  }
}
```

Those values are examples of a server decision, not defaults to copy into production. Missing capabilities mean unavailable. Use the action-named `complete-review` and `request-changes` capabilities; a generic `review` flag alone does not produce either button. `expectedVersion` is a positive native page version. An opaque `submissionToken` is required whenever any decision capability is true. It must be server-issued and bound to the authenticated caller, native page body/version, metadata revision, attachment-version manifest and current workflow state. It is not a client-generated approval proof.

The client caches the returned token with `expectedVersion`. `submit`, `complete-review`, `request-changes`, `approve` and `delete` echo it in their POST body:

```json
{
  "action": "complete-review",
  "pageId": "123456789",
  "expectedVersion": 7,
  "comment": "Review notes entered by the reviewer",
  "snapshot": { "pageId": "123456789", "version": 7 },
  "submissionToken": "OPAQUE_SERVER_ISSUED_SNAPSHOT_TOKEN"
}
```

The client rechecks the native version and consumes its cached token after the write attempt; it does not automatically retry a decision. The server must verify the token, current evidence, workflow transition and current authenticated session at commit. Reject a stale, replayed, mismatched or unauthorized token. Optional explicit metadata/attachment evidence can enrich `snapshot`; it cannot replace authoritative server checks.

A successfully committed decision must return a durable receipt: `{ "committed": true, "action": "complete-review", "pageId": "123456789", "eventId": "SERVER_AUDIT_EVENT_ID" }`. `action` and `pageId` must match the request exactly; `eventId` identifies the saved audit event. The service may also return a valid `publishedPageId`. A generic HTTP 200, empty JSON object or uncommitted acknowledgement is not confirmation of success. Do not return `committed: true` until the decision is durably recorded. Track approval and completion of publication separately when publication is asynchronous.

Create preparation sends `{ "action": "prepare-create", "title": "…", "type": "job-aid", "summary": "…" }`. Edit preparation sends `{ "action": "prepare-edit", "pageId": "123456789", "expectedVersion": 7, "snapshot": { "pageId": "123456789", "version": 7 } }`. Both return `{ "workingPageId": "123456790" }`. The browser does not send a trusted user identity or perform direct native create/update/delete REST calls.

A workspace response supplies `{ "results": [{ "id": "123456790", "workflow": {} }], "start": 0, "limit": 12, "hasNext": false }`, with optional integer `totalSize`. Each item needs its native page `id`; optional `workflow` contains only information the caller may view. The client re-fetches native content to confirm current read rights, operations and membership in the working root. The `type` and `region` filters use slugs; `sort` accepts `updated`, `title` or `relevance`. Do not return a public cache of restricted drafts, and do not apply sort/filter only after selecting a page of results.

### Revision evidence and failure handling

At submission, the authoritative server record must pin:

- Permanent document key, working page ID and native page version.
- Page-body hash and the metadata snapshot, including its source revision/hash.
- Attachment IDs, versions and hashes used by the submitted body, including images and linked supporting files.
- Source-reference identifiers, versions, verification evidence and the applicable rule-set revision.
- Assigned reviewer and manager, submitter identity and server time.

The browser can provide an expected version and observed evidence for conflict detection. The service must re-read and construct the authoritative snapshot itself. A subsequent change to the body, metadata or referenced attachment invalidates the pending decision. Either lock the submitted working page through the approved workflow capability, or retain the exact snapshot and revalidate all evidence before deciding and publishing. A page-version check alone does not detect an attachment replaced without a body edit.

The service needs optimistic version checks, a durable audit event for each decision and replay protection. The opaque token can identify a decision attempt; its consumption and stored outcome must be atomic. The supplied browser does not send an explicit idempotency key for `prepare-create`, and reports an unknown outcome on network failure. Do not automatically repeat that POST: inspect/recover the attempted creation first. The service should provide a durable creation receipt/recovery mechanism before unattended retries are enabled. Return a conflict instead of overwriting another edit. Log the approving person separately from the service account that performs publication. If publication fails after approval, retain the approved snapshot and failure status and retry publication idempotently; never show an unpublished revision as already released.

The publisher copies approved native storage into the mapped reader page, preserves its permanent key, and supplies the next native page version. It copies only approved attachment versions, rewrites attachment/page references for the destination, and removes or validates executable HTML and unsafe macro content. Do not blindly execute arbitrary HTML-macro bodies copied from a working document. Built-in Confluence Save/Update only saves native content; it is not manager approval. [Native page REST examples](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)

## 6. CQL and search

The reader library queries native pages under the published root. Treat every WCSpedia type, including Blog, as a normal child page when using ancestor-scoped discovery. Native Confluence blog posts are a different content type.

Example query after replacing the placeholders:

```sql
type = page
AND space = "REPLACE_WITH_PUBLISHED_SPACE_KEY"
AND ancestor = 123456789
AND label = "wcspedia"
AND label = "wcs-type-job-aid"
AND text ~ "credit approval"
ORDER BY lastmodified DESC
```

`123456789` is an illustrative root ID, not a configured production page. `ancestor` includes descendants. Text and label values must be escaped as CQL literals; pagination follows the native search response. CQL retrieves indexed pages, not workflow transitions. It can briefly lag publication. Labels help discovery but cannot establish approval. The published tree's enforced write controls establish which content reaches readers. [CQL field reference](https://developer.atlassian.com/server/confluence/cql-field-reference/)

Query under the signed-in user's access. A privileged aggregation service must independently filter every response by the user's native read permission. Never allow a reader request to choose the working root as a search scope. Validate that every workspace/document ID returned by a custom service belongs to the configured tree.

CQL is not a general database. A Page Properties table does not automatically create custom CQL fields. JSON content-property indexing requires an installed index schema extension, and the documented Data Center API does not support sorting by those custom fields. Reading-time and view-count sorting therefore needs a complete permission-filtered index/service before pagination; sorting only one downloaded page would be misleading. [Content properties and indexing](https://developer.atlassian.com/server/confluence/content-properties-in-the-rest-api/)

The native Saved items screen queries the same permission-filtered published library with `favourite = currentUser()`. Users add or remove these bookmarks using Confluence's native **Save for later** control. This package does not implement a separate bookmark-write API in native mode and does not copy the established application's bookmark list. If the installed server rejects the CQL field, the screen reports the error; do not fabricate a list. Optional metrics, health rules and suggestions need their own trusted native-version adapters and are not made production-ready simply by enabling the core native-page bundle.

## Native downloads and reading controls

The native document Download menu links to the installed Confluence exporters:

| Format | Native route relative to `contextPath` |
| --- | --- |
| PDF | `/spaces/flyingpdf/pdfpageexport.action?pageId=<pageId>` |
| Word | `/exportword?pageId=<pageId>` |
| Markdown | Derived locally from the readable native body; no separate canonical Markdown document is saved |

These routes use the signed-in Confluence session and the page ID. They are separate from the established browser PDF/Word CDN exporter and do not promise a particular Word file extension or pixel-identical cover on every server version. Native Page Properties tables provide document-control information in the body. JavaScript-only controls are not reliable export content: any required logo, owner details and approval evidence must be part of the approved native body or a supported native export template. Configure and verify the Citi export styling through the installed Confluence export capabilities; the shared web stylesheet alone does not style native PDF/Word output. [Atlassian: native document exports](https://confluence.atlassian.com/doc/export-content-to-word-pdf-html-and-xml-139475.html)

Native export links export the page version the native exporter serves when opened; the links do not pin a historic version. On a working page the exported material is working content. Obtain approved copies from the controlled reader page, and use the workflow service for a separately pinned historical export if that is required. Do not describe a working-page download as approved.

Markdown and Copy Markdown are derived, portable views. Unsupported macros and complex layouts may be simplified or replaced by a note/link. The page remains authoritative. Clipboard availability depends on the browser's secure-context and clipboard permissions; Download Markdown remains available when copying is unavailable. No JSON download is offered.

## 7. Future migration criteria

Only plan this migration after the native adapter is connected to the established interface and the live workflow is verified. The current task does not perform these operations.

1. Export and retain the existing application data for migration evidence. Do not expose working snapshots or audit records on the reader asset page.
2. Assign each existing document's permanent key to a native working/reader page mapping. Do not generate a new key every time its title or slug changes.
3. Convert supported text, tables, links and images into native storage. Flag unsupported rich elements for review rather than dropping them silently.
4. Move supporting media to the correct protected or reader page, retaining the reviewed attachment versions and access scope. Keep authoritative SharePoint files at their existing source.
5. Import historical audit evidence as a clearly identified migration record. Do not pretend imported dates or names are native Confluence authorship/history.
6. Review the migrated native content and publish through the configured workflow. Generate redirects or mapping links for old WCSpedia document URLs.
7. At the agreed cutover, stop writing the former editable JSON. Any JSON used for discovery becomes a generated, replaceable projection of native approved pages.

## 8. Readiness and live acceptance

| Capability | Supplied state | Deployment dependency / acceptance evidence |
| --- | --- | --- |
| Experimental macro assets and native page mounts | Isolated development source and fragments supplied; not the default interface | Connect native data to the established UI and verify the selected loading approach before deployment. |
| Native reader library, search and pagination | Native REST/CQL client supplied | Verify actual space/root, labels, indexing and user permissions. |
| Native document metadata, history link and editor navigation | Browser controls supplied | Verify current-page metadata, native operations and working-root restrictions. |
| Saved items | Native Save for later CQL reader supplied | Verify native bookmark control and CQL support on the installed version. |
| PDF/Word and derived Markdown | Native exporter links and Markdown converter supplied | Verify native routes, output layout, approved-source selection and macro rendering. |
| Native template creation and working-page editing | Explicit `native-template` mode and native editor navigation supplied | Configure protected working root/space and templates; verify native creation/update rights. No manager approval is implied. |
| Governed create / published-to-working edit preparation | `workflow` client commands supplied; disabled without a valid workflow connection | Install an approved authenticated backend/app adapter and confirm protected creation/recovery. |
| Review / approval / deletion and workspace queues | Client contract supplied; no server implementation in this package | Implement token binding, authorization, audit retention and controlled publication; test actual roles. |
| Existing health rules, suggestions, shared view metrics and entitlement administration | Established UI and service contracts remain the default; no native port is complete | Adapt these services to permanent native document keys and version evidence while retaining the existing screens. |

An HTML macro executes presentation JavaScript in a browser; it cannot provide a trustworthy server-side workflow, privileged publisher or durable protected audit service. This folder does not include a Confluence plugin, ScriptRunner endpoint or configured third-party workflow. A configured endpoint must be an actual deployed implementation, not merely a URL entered into the config file.

Pilot a job aid, training page and blog with three actual roles: author, reviewer/manager and reader. Verify all of the following in the installed Confluence version:

- Native editor opening, saving and returning to the correct document/workspace.
- A newly created working page and its attachments are never reader-accessible, including during failed or retried creation.
- Readers cannot edit approved pages through native links or direct REST requests.
- A changed page, metadata table, image or attachment cannot reuse an earlier submission's approval.
- The last approved reader page stays available while a revision is in progress.
- Native search, WCSpedia CQL search, attachment URLs and exports respect the same visibility boundary.
- Service retries do not create duplicate pages, decisions or releases; stale writes return conflicts.
- Owner, SOEID, sources and review dates survive native edits; missing data is not represented as approval.
- Citi component styles do not hide native permission controls or alter unrelated Confluence pages.
- Library, workspaces and document controls show useful unavailable/error states when the service or assets fail to load.

Local mocked REST tests demonstrate the browser integration contract. They cannot certify the private server's permissions, macros, workflow implementation or publication behaviour. Record that live acceptance separately before calling the installation production-ready.
