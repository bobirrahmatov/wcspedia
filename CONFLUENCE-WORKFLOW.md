**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

# WCSpedia: attachment integration and document control

**Scope correction — 2026-10-17:** the department can deploy pages/macros/attachments in wcspedia only. It cannot deploy the custom services described in this legacy integration guide. Preserve `{include:wcspedia:navBar}` and Look and Feel fonts. See [the confirmed space-only constraints and migration status](./CONFLUENCE-SPACE-ONLY.md). Native REST page creation can use the signed-in session; the custom workflow below still needs adaptation to work without services.

**Current deployment boundary:** WCSpedia is a Confluence-hosted knowledge-base interface. Landing, business-area browsing, Insights and search read native Confluence pages through scoped CQL/REST. Native page IDs, parent relationships, permissions, version history and comments remain in Confluence. The configured upload package contains the supplied WCSpedia IDs and content-only HTML/JS pairs; it preserves the existing header, fonts and design. No internal server deployment has been performed or verified from this workspace.

The custom editor and governed workspaces are a separate managed workflow. Their server modules create restricted working pages and publish approved native child pages, but require deployed authenticated `workspaceEndpoint` and `workflowEndpoint` services. Uploading browser scripts, page IDs or JSON does not install those services. Do not make the Add document control report success or bypass review when that connection is absent.

## Existing Add document and approval flow

Keep the current Add document button, WCSpedia editor, design and custom approval workflow. A native-editor link is not a replacement for that flow, and changing to direct native creation must not silently bypass review.

1. The author uses the existing editor and selects **Save draft**. The browser sends the authenticated command to `workflowEndpoint`; the service checks the current JSON entitlement, native permissions, input and expected revisions.
2. The service saves the draft in its protected workflow record and creates or updates a restricted working child beneath Working Documents (`3961735834`). That draft is not an approved business-area article and is excluded from published discovery.
3. Submission and review are tied to the exact content revision. After the assigned manager approves it, `confluence-publisher.cjs` creates the reader child beneath the selected business-area page, or beneath Insights (`3961735728`) for configured insight types. Later approvals update the same reader page ID; the previous approved version remains available while a new draft is reviewed.
4. The service confirms the native page/version, updates the approved projection on attachments page `3962195316`, and records the audit/commit receipt before the browser reports success. Failed or uncertain writes are reconciled with the same request ID, not silently retried as a new document.

**What is still needed to enable it on the internal server:** deploy the supplied server modules on an authenticated internal service; implement the session/native-permission adapters and durable private journal; expose the authorized workspace GET and governed command POST routes; then put those real same-origin URLs in `workspaceEndpoint` and `workflowEndpoint` in every macro and the header widget. These URLs are custom integration routes, not built-in Confluence endpoints. They cannot be derived from a page ID. The configured upload kit deliberately leaves them empty when no deployed endpoint has been supplied. Use the matching [server integration contract](./NATIVE-PUBLICATION.md#server-integration), preserving existing live data and grants.

The supplied `publication-http.cjs` handler connects those routes to the existing workflow service. Its host still supplies trusted session authentication and a workspace loader that filters records for that user. `PUBLICATION-SERVER-SOURCE.md` in the separate source package documents that wiring. The presence of this source file does not mean a route has been deployed on your Confluence server.

Native page creation is already implemented using Confluence's content REST API. Uploading `.cjs` files as attachments cannot execute the Node service or supply authentication/approval enforcement. The server modules, credentials and private journal belong on the trusted service host; browser HTML/JS/CSS remains in Confluence attachments. [Atlassian native page creation and updates](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)

## What the JSON files do

| Data | Current location and purpose | Required for native search? |
| --- | --- | --- |
| `entitlements.json` | The central application grant policy on `attachmentPageId`. The Entitlements screen reads it; a trusted entitlement service is needed for in-app writes. Confluence permissions still apply. | No |
| `wcspedia-published.json` | Approved snapshots and directory/taxonomy data used by the custom reader, editor initialization and managed workspaces. It is still a full-body compatibility projection, not just an index. Preserve the live file while these consumers remain. | No |
| Workflow snapshots and decision audit | Protected service storage with exact revisions, identities, publication receipts and recovery records. My workspace and Reviewer workspace receive authorized views of the same store. They do not need independent public JSON copies. | No |
| Saved items, suggestions, health/rules and metrics | Separate authenticated service contracts. Their backend may store JSON or database records; uploading empty JSON attachments does not enable them. Private user data must not be put on the public assets page. | No |
| Article comments | Native Confluence comment entities attached to each document page. There is no shared comment-body JSON attachment. | No |
| Helpfulness votes | Optional trusted feedback service, with per-document records and atomic/idempotent writes. No vote starter attachment is required. | No |
| Downloaded analytics JSON | An on-demand report of readable page metadata, native comment counts and optional helpfulness aggregates. It is downloaded for manual analysis, not uploaded or rewritten on every page view. | No |
| Page/API responses | JSON is also the ordinary REST response format. A JSON response is not necessarily a stored JSON attachment. | Yes, as API transport only |

The current native discovery startup uses a small area/type catalogue embedded in the page scripts, then checks the root and signed-in user in parallel. It does not download document JSON before searching. Native search results open the real Confluence document page. Do not add every existing page to a giant JSON file to make it searchable. [Atlassian CQL](https://developer.atlassian.com/server/confluence/advanced-searching-using-cql/)

Keep the existing live JSON and audit history when upgrading. `initial-json/` files are first-install starters only. Native permissions remain authoritative for native operations; application grants cannot elevate them. A broadly readable attachment must contain only data permitted to every reader of that attachment, including any copied article bodies.

## The 10 MB attachment limit

This installation has a **10 MB (10,000,000 bytes) maximum per attachment**. Upload the individual files from `attachments/`; the ZIP is a transport package to unzip locally. The builder and packagers validate each runtime attachment and initial JSON file against that limit. Keep application upload limits at or below the server limit, measure UTF-8 JSON bytes rather than JavaScript character count, and reject oversized payloads before sending an upload. Confluence administrators configure the maximum permitted attachment size; the value can differ between installations. [Atlassian attachment-size settings](https://confluence.atlassian.com/doc/configuring-attachment-size-150040.html)

The ready package's runtime files are individually below the limit. New article media belongs on the relevant document page; large recordings and governed Office files can remain at their approved existing source and be linked. Do not embed a growing library of full documents, base64 images, comments or audit history into one shared attachment. The current managed reader projection is bounded; reaching its limit requires migration to native per-document reads or a service-backed projection, not truncating documents or dropping audit events.

## Storage decision: Confluence, JSON and Markdown

**Managed-workflow adapter contract:** the custom editor uses structured JSON for workflow records and an approved reader projection. Document export formats are PDF, Word, Markdown and MDX; the separate analytics action downloads a metadata report as JSON. Keep an existing SharePoint document in SharePoint and link to its controlled version. The table below describes the managed workflow; native CQL browsing and native comments do not require its document projection. Uploading JSON alone does not supply document governance. The [native-source transition assessment](./NATIVE-PUBLICATION.md#storage-status-current-implementation-versus-native-authoring) supersedes this table as the target production architecture: native page bodies, per-page metadata, permission-aware discovery, and a protected workflow record, without aggregate full-document JSON attachments.

| Information | Current hybrid storage | Editing and publication rule |
| --- | --- | --- |
| Authoring content, metadata, assignments and revision snapshots | One restricted workflow store, accessed through the trusted service. It may persist versioned JSON on a dedicated restricted Confluence control page, provided that service is the only writer. | The service validates and serializes changes. A reader never downloads this full store. |
| Decision events and publication receipts | The workflow service's durable audit store, linked to the exact content revision. | Append decisions with server identity and time; retain snapshots and record publication failures separately. |
| Reader application data | `wcspedia-published.json` on the configured shared attachments page. | Generated from approved snapshots; never edited independently of the workflow record. |
| Searchable approved article body | A normal Confluence child page under its business collection. | A controlled publisher generates it from the approved revision and records its page ID and Confluence version. |
| Cover images, downloadable reports and supporting files | Confluence attachments on appropriately restricted working or published pages. | Record attachment identity/version with the reviewed revision. Publish only files permitted for the reader audience. |
| Existing Office files with an established SharePoint owner | Their existing SharePoint library. | Link to the source and record the reviewed file/version. Do not maintain a second editable copy in Confluence. |
| Controlled-format copy | A generated PDF or editable `.docx` document with the selected version, control cover and online-source link. | A copy is uncontrolled; its export does not change approval or publish content. |
| Portable text copy | A generated `.md` download. | Export for reuse or comparison. Importing a changed export creates a new draft and requires fresh review. |

JSON preserves the editor's content, types, categories, ownership and exact version metadata together. Markdown is useful for readable text, but it does not by itself represent assignments, workflow transitions, attachment versions or approval evidence. Neither file extension provides permission checks or concurrency control. For a larger installation, the same service contract can use a transactional application store and write restricted JSON snapshots to Confluence for backup; select one authoritative store at deployment, rather than synchronizing two independently editable masters.

Native Confluence Data Center page bodies use an XHTML-based storage format with Confluence-specific elements. A `.md` attachment is not a native editable page body. The publisher must explicitly convert the supported WCSpedia content model to `body.storage`; preserve or reject unsupported rich features instead of silently dropping them. [Atlassian storage format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)

SharePoint supports versioning, draft visibility and content approval, so it remains suitable for documents already governed there. Moving this application’s JSON there would add a second identity/API and publication boundary without improving its Confluence integration. If an existing SharePoint report is part of a review, its link must identify the reviewed version; approval of the article does not automatically approve later changes to that report. Microsoft’s approval integration uses the document/page ETag to identify the version being decided. [SharePoint versioning](https://support.microsoft.com/en-gb/sharepoint/lists/documents-and-library/enable-and-configure-versioning-for-a-list-or-library?tabs=modern), [version-bound approval](https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/guidance/require-doc-approval)

## Custom editor and native Confluence editing

The WCSpedia authoring screen is the primary editor for this prototype. Create content at `#/create?type=Blog`, or open entitled content in full-page editor mode at `#/edit/{id}`. Edit/Delete controls come from the same SOEID entitlement model intersected with native page operations. The optional `returnTo` route preserves the source page for Cancel; saves from a document page return to the newly saved working version. Opening or canceling an edit of published content performs no write. **Save draft** enters the same document workflow as the separate reviewer workspace, where the author submits the revision for review. An author cannot use a generic Publish button to bypass the assigned reviewer and manager. The selected content type describes the document—Blog, Training, Report, Job aid and the other types all retain the same revision and approval controls.

A published edit is saved through one `revise` command containing validated `changes`. The service creates the next draft version and its audit event atomically, with the permanent document/native page keys unchanged. Existing draft edits use `edit` and increment the content revision. Both paths reject stale document/audit state and recheck current entitlements and native rights at commit. The approved snapshot stays published until a separate review and approval succeed. A blocked save retains the entered content; the local demo also retains its editor when browser storage is full and can retry without duplicating a version.

The editor offers rich text controls, Markdown source and preview. Its canonical body is `bodyMarkdown`, stored **inside the versioned JSON snapshot**; generated `sections` support discovery and compatibility with existing content. The `.md` download is an export of that snapshot, not a second live master. Slug, excerpt, key highlights and cover details are reviewed with the body. The owner and author are explicit, and reviewer/manager assignments are selected on creation and locked during content editing.

`editor.js` exposes the visual-body converter as `WCSEditor.domToMarkdown`. `editor-content.js` exposes `WCSEditorContent` for rendering the supported Markdown subset, deriving sections, validating covers and generating exports. Raw HTML is treated as text, apart from the explicitly constrained underline extension; executable HTML is not accepted. A production service must perform its own validation and conversion; the browser renderer is not the authority for stored native page markup.

The current authoring choice is the existing WCSpedia editor. The trusted service converts its approved content to native page storage programmatically; authors do not need to switch editors. Future per-document loading must preserve this UI, exact revisions, assignments and approval checks. Keep the approved reader page unchanged while a new managed draft is reviewed. Native changes made outside this workflow must be detected as conflicts, not silently imported or treated as approved.

Confluence’s normal Save/Publish action records a page change; it is not WCSpedia’s manager approval. The retained custom workflow performs its own submission, review and approval before the trusted publisher updates the reader page. The browser upload package does not deploy that server-side integration.

Use normal child pages for all WCSpedia content types, including **Blog**, to retain the existing `type = page AND ancestor = …` search scope. A native Confluence `blogpost` is a separate content entity and is not automatically included by that child-page query. The REST API supplies page edit links and examples of updating `body.storage` with a page version. [Atlassian REST examples](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)

## Upload package and configuration

For the configured six-page installation use `WCSpedia-configured-upload.zip` and its README. Rebuild with `node build-confluence-upload.cjs`, then the upload/configured packaging scripts. The older combined-bundle installation below remains for existing deployments:

- `wcspedia-style.css` — the one shared plain stylesheet, with its fonts embedded.
- `wcspedia.js` — the complete browser runtime.
- `assets/citi-logo.png`, uploaded as `citi-logo.png` — the shared export logo. The SVG master may also be hosted.
- `wcspedia-published.json` — the permitted reader projection, replacing the sample content. The build removes unpublished documents, pending revisions and audit events from the full dataset.

Use five native Confluence pages, each with its own content-only fragment:

| Confluence page | Fragment | `pageRole` |
| --- | --- | --- |
| WCSpedia library | `WCSpedia-confluence-macro.html` | `home` |
| My workspace | `wcspedia-my-workspace-confluence-macro.html` | `mine` |
| Reviewer workspace | `wcspedia-reviewer-workspace-confluence-macro.html` | `review` |
| Saved items | `wcspedia-saved-items-confluence-macro.html` | `saved` |
| Entitlements | `wcspedia-entitlements-confluence-macro.html` | `entitlements` |

Paste each fragment into the approved HTML macro environment. Set `rootPageId` and the `pages.home` destination to the actual WCSpedia landing page's numeric `pageId`. Do not use a space ID, space name, space key or unrelated asset page as the search root. These legacy fragments assume attachments live on the landing page; if they live elsewhere, set `attachmentPageId` and all asset URLs to that separate host while keeping `rootPageId` on the landing page. The current `confluence-upload/html/` fragments provide both settings separately. Replace the workspace-page placeholders in `pages` with their native Confluence URLs. The fragments require the approved environment that permits their scripts and styles. They do not add a global header, footer or bottom workspace strip. Add the workspace pages to the native Confluence sidebar; the library landing page has no duplicate workspace buttons. The `pages` configuration remains necessary for authoring and review actions that cross between the dedicated pages.

Saved items has its own `REPLACE_WITH_SAVED_ITEMS_PAGE_ID` destination and opens directly at `#/saved`. Its macro uses the shared `wcspedia.js` attachment and assumes `wcspedia-style.css` is loaded globally by Confluence, so it contains no duplicate stylesheet link. Keep `pages.saved` configured on every page so Saved items links target this page. Personal preferences still come from the same authenticated bookmark service and library root; the separate page does not create a second bookmark store.

```js
window.WCS_CONFIG = {
  mode: 'confluence',
  pageRole: 'home', // mine, review, saved or entitlements on its dedicated page
  contextPath: '/confluence',
  rootPageId: 'REPLACE_WITH_WCSPEDIA_PAGE_ID',
  attachmentPageId: 'REPLACE_WITH_ATTACHMENTS_PAGE_ID', // Hosts entitlements.json and reader data.
  attachmentFilename: 'wcspedia-published.json',
  pages: {
    home: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_WCSPEDIA_PAGE_ID',
    mine: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_MY_WORKSPACE_PAGE_ID',
    review: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID',
    saved: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_SAVED_ITEMS_PAGE_ID',
    entitlements: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_ENTITLEMENTS_PAGE_ID'
  },
  workspaceEndpoint: '',
  workflowEndpoint: '',
  entitlementsEndpoint: '',
  suggestionEndpoint: '',
  metricsEndpoint: '',
  bookmarksEndpoint: '',
  healthEndpoint: '',
  exports: {
    logoUrl: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/citi-logo.png?api=v2'
  }
};
```

`/confluence` follows the existing Covenant application's context. Document/API requests use the current page's origin and signed-in Confluence session. `rootPageId` must be the numeric WCSpedia landing page ID. Do not substitute the unrelated Covenant page ID. The `pages` URLs must be same-origin native Confluence destinations. Keep the same `rootPageId` and data attachment across all five pages; each workspace is a view of the same authoritative store, not an independent JSON copy. `workspaceEndpoint` and `workflowEndpoint` must be same-origin endpoints within this context. The workspace endpoint supplies authorized working copies; the command endpoint accepts governed actions. Empty values keep the live site in reader mode.

Optional configuration includes `spaceKey` as an expected-space check for CQL and `allowAttachmentWrites: true` for a controlled administrative import tool. Search always resolves the configured root's actual space and includes it in CQL; a supplied `spaceKey` must match. Direct attachment writes default to disabled and are never used by the review/approval interface.

Local HTML uses `mode: 'local'`, `dataUrl: './wcspedia-data.json'`, the appropriate `pageRole`, and a `pages` map linking `wcspedia-local.html`, `wcspedia-my-workspace.html`, `wcspedia-reviewer-workspace.html` and `wcspedia-entitlements.html`. The portable copies use `mode: 'embedded'` and link `WCSpedia-prototype.html`, `WCSpedia-my-workspace-prototype.html`, `WCSpedia-reviewer-workspace-prototype.html` and `WCSpedia-entitlements-prototype.html`. Keep the four files together. Only those demonstration modes permit persona switching and local browser storage; a local server is recommended for shared state across the pages. The landing route omits both demo/persona and live connection strips. Demo controls remain on other local routes, and each workspace can be opened directly using its HTML entry file.

Explore, search, topic, workspace, review and category introductions use one shared inset rounded heading-panel treatment from `wcspedia-style.css`. The single main landing page opens search results directly; article reading headers and the expanded editor retain their own content layout.

## Shared tables and document exports

`data-table.js` exposes `WCSDataTable.render`, shared by the Entitlements directory, suggestion inboxes and both workspace lists. `workspace-table.js` adapts document snapshots to this table. Rows and action markup are supplied only after the caller has filtered its authorized records; the renderer does not infer privileges from a person label or grant access. The shared plain `data-table.css` is merged into `wcspedia-style.css`. Empty/loading states, column semantics, mobile scrolling, row actions and pagination now use the same component treatment. Reader search results retain their Citi-style article cards.

Document detail pages offer PDF, Word and Markdown through one Citi-themed Download menu and progress/error dialog. Markdown uses the existing portable serializer without loading export libraries. The article action row does not duplicate the Review workspace navigation; host that link in the native Confluence sidebar. `document-export.js` builds both from the selected authorized version, not from a screenshot or a second editable master. It includes a Citi control cover, owner/author and review/approval metadata, stable key, version/revision, content, images, resource references and the source URL. Unapproved or historical copies are identified; missing values are not invented. PDF text is selectable and Word is a real editable `.docx`. The browser generates the file locally; no article payload goes to a document-conversion service. Documents are not downloaded as internal workflow JSON. The permitted entitlement journal has a CSV audit export; the separate Insights analytics action downloads a JSON metadata report for manual analysis.

Initially, the loader uses pinned jsDelivr libraries: pdfmake **0.2.20** (`pdfmake.min.js` and its matching `vfs_fonts.js`) and docx **9.5.1** (`index.iife.js`). They are loaded only when requested. To follow the existing Covenant attachment pattern, upload the same approved distributions to the asset page and configure:

```js
window.WCS_CONFIG.exports = {
  allowCDN: false,
  pdfMakeUrl: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/pdfmake.min.js?api=v2',
  pdfFontsUrl: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/vfs_fonts.js?api=v2',
  docxUrl: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/docx.iife.js?api=v2',
  logoUrl: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/citi-logo.png?api=v2'
};
```

The docx IIFE distribution may be renamed `docx.iife.js` when uploaded; use its exact pinned contents and preserve vendor licenses. [exports-confluence-scripts.html](./exports-confluence-scripts.html) provides optional `<script>` tags to preload the same files before `wcspedia.js`. Load pdfmake before its font VFS. `allowCDN: false` prevents a fallback to an external library source. The supplied SVG master is `assets/citi-logo.svg`; the exported Word/PDF logo uses the PNG fallback by default. Both can be hosted as Confluence attachments. A configured self-contained SVG logo is validated and rasterized for export; PNG avoids SVG support differences in consumers. Keep the approved logo on the same origin. Portable HTML includes PNG logo data so it remains available without a logo fetch.

See [EXPORTS.md](./EXPORTS.md) for format details, limitations, library loading and image behavior. An unavailable image or library leaves an explicit export error instead of a partial or empty downloaded document. Supporting files remain referenced resources rather than embedded Office/PDF file attachments.

## Reviewer charts and hosted JavaScript

The reviewer overview uses `workspace-charts.js`, bundled into the shared `wcspedia.js`, and plain styles merged into `wcspedia-style.css`. It lazily requests the official Highcharts npm package pinned to `13.1.0`, served by jsDelivr at `https://cdn.jsdelivr.net/npm/highcharts@13.1.0/highcharts.js` and `https://cdn.jsdelivr.net/npm/highcharts@13.1.0/modules/accessibility.js`. These optional scripts are the only chart CDN dependency; the Markdown editor, fonts and application styles remain local. The tables contain the complete values even if network loading is blocked. Loading uses the configured source directly and does not retry through another CDN.

Inside Citi, host the approved minified Core and accessibility files as attachments or on the approved internal asset host and set both paths:

```js
window.WCS_CONFIG.charts = {
  allowCDN: false,
  highchartsSrc: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/highcharts-13.1.0.js?api=v2',
  accessibilitySrc: '/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/highcharts-accessibility-13.1.0.js?api=v2'
};
```

The paths must serve the matching library versions. An existing `window.Highcharts` is reused. If the host's AMD loader owns the library, expose its supported instance on `window.Highcharts` before WCSpedia mounts rather than loading a second copy. `enabled: false` uses data tables without requesting scripts. `offline: true` uses only an already loaded instance. Optional `highchartsIntegrity` and `accessibilityIntegrity` fields support deployment-pinned integrity values. Do not provide a hash for a different vendor build. Commercial deployment requires a valid Highcharts license and Citi's approved distribution. [Official versioned hosting](https://code.highcharts.com/), [accessibility module](https://www.highcharts.com/docs/accessibility/accessibility-module)

The charts use the authenticated workspace projection already loaded by WCSpedia. They never send document records to the CDN or a remote export service; export controls are disabled. The pending chart counts latest versions assigned to the current reviewer or approving manager. Activity uses that person's valid `complete-review` and `approve` audit events over the current and preceding five UTC Monday-based weeks, counting each document/version/revision/action once. Other actors' events, self-review, invalid transitions and future dates are excluded. The service must still authorize the underlying projection; client-side aggregation is presentation logic, not access control.

The chart lifecycle is `WCSWorkspaceCharts.summarize(documents, actorId, now, people)`, `markup(summary)`, then `mount(container, summary, chartConfig)`. The returned `destroy()` removes chart instances and resize observers before the app replaces a view. [Chart lifecycle API](https://api.highcharts.com/class-reference/Highcharts.Chart#destroy)

## Implemented Confluence calls

| Operation | Request |
| --- | --- |
| Resolve the JSON attachment and its version | `GET /confluence/rest/api/content/{attachmentPageId}/child/attachment?filename=wcspedia-published.json&expand=version&limit=2` |
| Load the selected attachment version | `GET /confluence/download/attachments/{attachmentPageId}/wcspedia-published.json?api=v2&version={number}` |
| Resolve the signed-in user | `GET /confluence/rest/api/user/current` |
| Verify the WCSpedia search space | `GET /confluence/rest/api/content/{rootPageId}?expand=space`; one shared successful lookup per adapter. |
| Search WCSpedia root and all descendant pages | `GET /confluence/rest/api/content/search?cql={encodedCQL}&limit={limit}&start={start}`; legacy indexed search is an explicit transport option. |
| Load permitted working content | `GET {workspaceEndpoint}?rootPageId={rootPageId}`; authenticated service projection, not a native Confluence endpoint. |
| Submit a governed decision | `POST {workflowEndpoint}` with JSON; this is the integration's service contract, not a native Confluence endpoint. |
| Optional administrative JSON import | `POST /confluence/rest/api/content/{attachmentPageId}/child/attachment/{attachmentId}/data` with multipart file data and a change comment. |

The native endpoints follow Atlassian's [Confluence REST API documentation](https://docs.atlassian.com/ConfluenceServer/rest/7.18.3/) and [Data Center user API](https://developer.atlassian.com/server/confluence/rest/v9225/api-group-user/). Validate compatibility with the target installation during deployment.

The client validates JSON structure and rejects duplicate IDs, missing assignments, invalid version pointers and unexpected responses. The live reader attachment additionally rejects drafts, multiple snapshots per document and nonempty document or taxonomy audit arrays. The build strips both audit collections from the reader projection. Attachment downloads are pinned to the resolved version. No API token is embedded. The live client rejects cross-origin configuration and does not silently fall back to sample data. An expired session, missing attachment or malformed JSON results in a visible load error.

## Identity and content projections

Map each eligible person to stable Confluence identity values:

```json
{
  "id": "alex",
  "name": "Alex Morgan",
  "role": "Author",
  "confluence": {
    "userKey": "REPLACE_WITH_CONFLUENCE_USER_KEY"
  }
}
```

The client matches `userKey`, `username` or `accountId` from `/rest/api/user/current`; it does not match display names. An unmapped user receives a reader view. A reused username is not accepted when its stable `userKey` conflicts. Duplicate identity mappings fail rather than choosing an arbitrary person. This mapping controls presentation; the workflow service must independently authenticate and authorize every action using its trusted directory and assignments.

A downloadable attachment is readable by everyone allowed to access it. A public reader projection must therefore omit drafts, unpublished titles and restricted audit comments. Include only approved snapshots and the decision metadata that readers are allowed to see. JSON schema fields alone are not access control.

The full `wcspedia-data.json` workflow store belongs on a restricted control page or behind the authenticated service. The generated `wcspedia-published.json` is the separate reader projection. When `workspaceEndpoint` is configured, the client requests the authenticated workspace projection for a mapped workflow user. It accepts the WCSData envelope directly or `{ "data": WCSData }`. Workflow actions are enabled only after this projection loads and the command endpoint is configured. The service must return only the working documents and audit information permitted for that person. It must independently verify access; a mapped browser role is insufficient. Do not store public and private revisions together on a reader-accessible page and rely on the browser to hide them.

## Content and page structure

The JSON envelope contains `people`, `types`, `areas` and `documents`, with taxonomy revision/audit metadata when categories have been changed. Each document has stable identity, type and collection fields; assigned owner, author, reviewer and approver; a `publishedVersion` pointer; versioned content; and audit events. Type-specific detail metadata belongs to the content version so it stays attached to the reviewed material.

| Custom editor field | Stored on the content version | Production mapping |
| --- | --- | --- |
| Title and excerpt | `title`, `summary` | Native page title and reader/search summary. |
| Rich body / Markdown source | `bodyMarkdown` | Canonical editor text; server converts supported markup into native `body.storage`. |
| Searchable sections | `sections` | Derived from the body for discovery and compatibility; regenerate after edits instead of treating it as an independent body. |
| Slug | `slug` | Reader/export identifier. Keep the stable document ID and native page ID when titles or slugs change. |
| Key highlights | `highlights[]` | Reader article highlights, included in the reviewed snapshot. |
| Cover image | `cover: { src, alt, caption }` | Raster preview or HTTPS source in the prototype. Production stages and validates the file, then stores a permitted version-pinned attachment reference. |
| Topics, processes, regions | `tags[]`, `processes[]`, `regions[]` | Versioned taxonomy; changes require a fresh review and approval. |
| Inline image assets | `assets: [{ id, src, alt }]` | Markdown references `attachment:id`; production `src` identifies the exact permitted asset version. |
| Supporting attachments | `attachments: [{ id, name, url, mimeType, size }]` | Saved with the reviewed version and shown in its resources panel. `size` is bytes. |

Existing section-based fixtures remain valid. The prototype's raster upload is a local preview/snapshot; it is not evidence that a production attachment upload has occurred. An arbitrary remote image URL can change after review. A production service must freeze imported media or require a controlled, version-pinned source before submitting a revision, and validate image size/type, URL policy and access independently of the browser. Likewise, attachment display names alone do not identify the evidence that was reviewed.

Managers can add a business area at `#/categories`. The command is `add-category` with `category: { id, name, icon: "folder" }`, `expectedTaxonomyRevision` and a comment. The service must authorize the manager role, reject duplicate IDs/names, compare the expected taxonomy revision and append a taxonomy event. Adding a category must not alter the type, collection or decisions of an existing approved document. A new category’s Confluence parent page and labels are a publisher configuration task; adding the JSON category does not itself create a native page.

Keep WCSpedia as the parent page, with the eight business collections beneath it. Published document pages sit beneath their collection. Labels must be placed on each document; they are not inherited from the parent.

| Collection | Area label |
| --- | --- |
| Credit Approval Control | `wcs-area-credit-approval-control` |
| Credit Information Management | `wcs-area-credit-information-management` |
| Credit Management Reporting | `wcs-area-credit-management-reporting` |
| Deal Closing | `wcs-area-deal-closing` |
| Documentation & Pledging Team | `wcs-area-documentation-pledging` |
| EMEA Credit Admin | `wcs-area-emea-credit-admin` |
| Loan Management | `wcs-area-loan-management` |
| Regional Operating Manuals | `wcs-area-regional-operating-manuals` |

Assign one content-type label, such as `wcs-type-job-aid`, `wcs-type-procedure`, `wcs-type-blog`, `wcs-type-training`, `wcs-type-report`, `wcs-type-reference` or `wcs-type-knowledge-sharing`. Only a confirmed published projection receives `wcs-status-published`. Pending revisions must not replace the approved reader page or its search metadata.

The supplied `confluence-publisher.cjs` implements native child-page creation, stable-ID updates, attachment staging, labels, conflict checks and recoverable publication receipts. `publication-workflow.cjs` connects it to the existing editor's commands on a trusted host. The six current page macros carry their settings inline; their business-area and Insights IDs must match the server-owned mapping. No separate runtime config attachment is required. The browser checks the exact receipt and refreshed workspace before reporting success. See [NATIVE-PUBLICATION.md](./NATIVE-PUBLICATION.md) for installation, host adapters, working/reader separation and verification. Native writes use Server REST content creation/update APIs; they are not browser-side attachment saves. [Atlassian content API examples](https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/)

## Review and approval contract

The separate reviewer Confluence page uses `pageRole: 'review'`; its `#/review` overview and `#/review/{id}` decisions present the submitted revision and assigned actions. My workspace uses `pageRole: 'mine'` for author-owned documents and drafts. Document details show owner, author, reviewer, approver, review/approval dates, effective date, next review date and version. These values are tied to the selected version: “last updated” is not an approval date, and a pending revision must not inherit a previous version's approval.

Person A writes the procedure. Person B, the assigned manager, can review and then approve it as two distinct decisions. A third person is not mandatory. The author cannot review or approve their own revision. The workflow service must account for contributors and validate organizational assignments. The shared workflow engine tracks `createdBy` and `contributorIds` as well as the assigned author, so an entitled editor cannot review or approve a revision they helped write.

The browser's adapter is exposed as `WCSConfluence.create(config)`. `load()` returns the data, resolved actor, attachment ID/version and capabilities. `submitAction(command)` sends a command and reloads the current data after acceptance. For an existing document, the command includes:

```json
{
  "action": "complete-review",
  "docId": "credit-approval-checklist",
  "expectedVersion": 2,
  "expectedRevision": 2,
  "expectedAuditLength": 8,
  "comment": "Reviewed the submitted procedure and supporting evidence."
}
```

The adapter adds `rootPageId`, the stable `documentKey`, expected attachment/policy revisions, mapped native page ID/version when available, and a `requestId`. It preserves the request ID for an identical retry after a lost response; the service must persistently deduplicate those IDs and reject reuse for different commands. Document actions are `create`, `edit`, `submit`, `request-changes`, `complete-review`, `approve`, `revise` and `delete`; `add-category` uses the separate taxonomy revision contract above. Creation sends a `fields` object; editing sends allowed content changes, including versioned editor fields. A `revise` command may carry the same content-field allowlist as `edit`. With `changes`, the service validates the content, requires a real content change, and commits one next-version Draft snapshot at revision 1 plus one `revise` event with source published version, full new snapshot and before/after field changes. It must not save an empty intermediate draft or modify the approved version. Legacy `revise` without `changes` still starts a copied draft. Approval sends `nextReviewAt`. Client-supplied actor identities, roles and approval/effective timestamps are not forwarded as authority.

The service must implement these guarantees:

1. Authenticate the Confluence session, resolve SOEID and trusted assignments, intersect fresh central entitlements with actual native page operations, and reject author/contributor self-review or self-approval.
2. Compare the expected attachment, native page, entitlement policy, content version, content revision and audit state. Reject stale requests with HTTP 409; never silently approve a newer revision.
3. Freeze the submitted content. Review binds to that exact revision; approval requires a completed review of the same revision. Changes require fresh decisions.
4. Use server timestamps and derive the actor from the session. Commit the transition and audit event together in the authoritative store. Deduplicate retried commands.
5. Publish the approved reader snapshot, metadata and labels through a controlled publisher. A failed publication must remain distinguishable from successful publication.
6. Return success only under the agreed commit/publication contract. After acceptance the client reloads; if refresh fails, it asks for a reload instead of assuming the visible state is current.

The local sequence is **Draft → In review → Awaiting approval → Published**, with **Changes requested** returning content to the author. A new version starts from the published snapshot, and the previous approved version stays visible while the replacement is pending.

The workflow service is an integration requirement, not a server deployed by this prototype. Attachment upload APIs alone do not implement the above guarantees.

## Audit trail and administrative attachment updates

Authoritative audit events should preserve an immutable event ID, document ID, exact revision or digest, actor ID/name snapshot, server UTC timestamp, action, old and new state, change values or a diff reference, comment and request correlation ID. Preserve content snapshots so reviewed and approved versions can be reconstructed. Corrections append a new event instead of rewriting earlier decisions. Apply permissions to exported audit records as well as the on-screen trail.

The sample JSON and browser engine record creation, edits, submission, requested changes, review, approval and revision creation with before/after changes. These demonstrate the expected UI and event structure. Local browser storage is editable and is not an immutable production audit store.

For a controlled administrative import, the adapter exposes:

```js
await client.saveAttachment(data, {
  expectedAttachmentVersion: loaded.attachmentVersion,
  comment: 'Controlled content import'
});
```

This requires `allowAttachmentWrites: true` and a mapped non-reader account. It accepts only the published reader projection and rejects private working content before uploading; it is not an API for saving the restricted workflow store. The client checks the latest attachment version before upload and verifies the new version afterward. Confluence's multipart attachment update does not provide atomic compare-and-set for the whole workflow: another upload can race between those steps. Consequently this API is not used for approval actions. An uncertain upload response is not automatically retried; inspect the latest version before retrying.

## Child-page search with CQL

The main live search, business-area browsing and autocomplete use Confluence Server/Data Center CQL through `/rest/api/content/search`. The normal path uses the Content API directly; an explicit `search.transport: "search"` retains the indexed-excerpt compatibility path when needed. The landing page opens results directly; there is no separate native-search button or search-introduction screen. Existing layout and shared styles are retained. Local demonstrations and personal workspaces keep their permitted snapshot searches.

During catalogue-based native discovery startup, current-user loading and root verification run in parallel. Before the first search, the adapter resolves `rootPageId`'s actual space with `expand=space`. Concurrent and later searches share the successful lookup; a failed lookup may be retried. A configured `spaceKey` is an expected value: mismatches stop search. Every primary query requires `type = page`, the verified space, and `ancestor = ROOT`. `ancestor` covers every depth of descendants. The WCSpedia landing shell is excluded, along with configured UI, asset, permission and business-area parent IDs; document descendants beneath those containers remain eligible. Only the restricted working branch and explicit administrative subtree exclusions remove descendants. This excludes unrelated pages in the same space and all other spaces. Returned page type, space and ancestry are checked before display. Confluence applies the signed-in user's native permissions.

The advanced query uses structured fields, `AND`/`OR`, optional labels/date ranges and supported sorting. Text is escaped as literal Lucene terms and the CQL is URL-encoded; users cannot inject raw CQL to widen the scope. See [Atlassian's advanced CQL guide](https://developer.atlassian.com/server/confluence/advanced-searching-using-cql/).

```cql
type = page
AND space = "WCS"
AND ancestor = 123456789
AND id NOT IN (123456789, 123456790)
AND text ~ "repayment"
ORDER BY lastmodified DESC
```

`WCS` and both numeric IDs are examples only; the second ID represents an interface page. Set `rootPageId` to the WCSpedia main page, keep all eight business-area pages below it, and configure each actual area page ID in `nativePublication.areaPageIds`. An area filter adds another `(id = AREA OR ancestor = AREA)` condition while retaining the root/space conditions. If an area has no configured numeric ID, the adapter falls back to its `wcs-area-*` label; set the ID to include unlabelled pages in that branch. The primary document search itself never requires `wcs-document` or `wcs-status-published`, so it discovers native pages absent from the JSON library. Attachments and blog-post objects are excluded by `type = page`; WCSpedia documents stored as pages remain included.

Optional content type, topic, process and region filters narrow by managed labels. The **Updated year** filter uses native last-modified dates. **Most relevant**, **Last updated** and **Title A–Z** are evaluated by Confluence before pagination. The uploaded scripts bundle the small business-area/content-type catalogue; native discovery no longer downloads the document projection for navigation. Workspace-specific taxonomy metadata still comes from its authorized projection. Labels are discovery metadata, not proof of approval or access. Keep private working documents under the restricted working root outside the reader tree and enforce native permissions.

Search fetches six cards per request; autocomplete displays the first four after a 150 ms typing pause and reuses the same first-page response on submission. The normal Content query expands version, space, ancestors and labels; it never expands a full body or fetches a body per result. Content Search can omit exact total counts and excerpts; pagination follows its server continuation and the UI does not invent totals. The optional indexed transport cleans any supplied excerpt and retries missing metadata through the same scoped Content query.

Exact requests share in-flight work and a bounded 30-second in-memory result cache. Consumer cancellation is independent: a cancelled suggestion cannot abort a matching foreground search. The underlying read is cancelled after a brief handoff window when no consumer remains. Session reload/access checks and mutations invalidate the adapter cache. Changed queries ignore late responses; errors are never cached as empty results. Typing pauses optional landing warmup and keeps settled cards visible. Each underlying search has the existing 12-second default deadline (`search.timeoutMs`, 1000–30000); failures offer retry. A deadline is an error, distinct from caller cancellation.

Use `search.excludePageIds` for additional header/style page IDs and `search.excludeAncestorIds` only for entire administrative branches (up to 100 numeric IDs per list). Never exclude the WCSpedia root or a business-area subtree. Code-bearing excerpts are suppressed without dropping otherwise valid document links. There is no documented CQL field for excluding only an HTML macro fragment within a page; excluding every HTML-macro page would also exclude legitimate embeds. Keep application code on interface pages and actual document text in native page bodies. JavaScript-rendered text from an attachment is not automatically native indexed document content. See [CQL fields](https://developer.atlassian.com/server/confluence/cql-field-reference/) and [search REST excerpt modes](https://docs.atlassian.com/atlassian-confluence/REST/6.6.0/#search).

Next/previous navigation preserves filters. Server offset or cursor continuations are accepted only from the same Confluence search endpoint and bound to the generated CQL and page size. Empty pages terminate pagination. Successful scope metadata, navigation links and bounded short-lived query results are kept in page memory only; result content is not persisted across reloads or sessions.

Automated tests cover interface/root exclusion, all eight branches, unlabelled pages, deep descendants, scope rejection, pagination, filters, cancellation, autocomplete, errors and discovery with an empty document snapshot. They do not establish production latency. Indexing can lag after native edits; target-instance search/index/network performance still needs staging measurement.

The configured landing, search and Insights pages bootstrap from the bundled navigation catalogue and native identity/root reads. Managed workspaces and older bundles without that catalogue still load `wcspedia-published.json` for existing features. Removing that remaining managed-view reader attachment is separate migration work described in [NATIVE-PUBLICATION.md](./NATIVE-PUBLICATION.md).

## Rich authoring and portability

The bundled `markdown-it` parser is pinned locally (see `vendor/markdown-it-LICENSE.txt`); no editor CDN is loaded. Raw HTML is not executed. The only HTML formatting extension is constrained underline markup. Inline images, tables, code fences, nested lists and safe resource embeds pass through the same renderer in authoring, preview, article, reviewer and history views. `@[embed](https://...)` creates a linked resource card. The dedicated Video control converts supported SharePoint embed code into the validated `@[video](URL "Title")` marker. Only a supported SharePoint video endpoint produces a rebuilt iframe; generic share links remain source cards. Titles and URLs are versioned and audited with `bodyMarkdown`. PDF, Word and portable Markdown contain recording links. Raw HTML remains disabled. See [VIDEOS.md](./VIDEOS.md) for hosting and access requirements.

`bodyMarkdown` plus the `assets` and `attachments` arrays form one versioned content snapshot. The API allowlist accepts these fields on create/edit and an atomic published `revise` save; the service must repeat validation and enforce submitted-revision locking. Store blobs once in controlled Confluence attachments and audit immutable references/digests in production, rather than repeatedly copying base64 payloads into event history. The prototype permits bounded embedded files to demonstrate persistence without a live page ID. The installation permits at most 10 MB per attachment, and browser storage has its own quota. Production must use staged, version-pinned attachments for real document libraries; the bounded aggregate projection cannot grow without limit.

MD is a portable export, not a second editable master. **Copy Markdown** and **Download → Markdown file** include the title, summary, optional cover/highlights, body, taxonomy and supporting resources. For uploaded prototype assets the exported link is a data URL; controlled production URLs yield smaller portable Markdown.

`WCSEditorContent.normalizeImport` handles Markdown pasted into the visual editor, Paste Markdown dialog or source workflow. It accepts up to 8,388,608 UTF-8 bytes, extracts supported embedded raster images/files into the version's `assets`/`attachments` arrays and replaces their URLs in the canonical body with `attachment:id` references. The canonical body is then checked against the 200,000-character limit. Images remain limited to 1 MB each and supporting files to 5 MB each, with up to 20 of each per version. A portable export does not restore trusted assignments or approval history; importing or editing it follows the ordinary draft/review workflow.

The sample editor keeps unsaved recovery data in session storage for the current actor and document revision, and uses the shared Citi dialog to offer restoration. Recovery is local to that browser tab, can fail if storage is full and is not an API save. There is no native browser-close confirmation. Production servers must validate all imported media and content again, regardless of client normalization.

Local snapshot filters, workspace discovery and related-content ranking operate on their permitted JSON snapshots. Native search uses the page labels maintained by the publisher. A working revision must not change the reader page or its published labels before approval; labels remain discovery metadata, not authorization.

The main native search supports topic/process/region facets in CQL. The publisher must use `WCSConfluence.facetLabel(kind, value)`: `tag`, `process` and `region` yield `wcs-tag-*`, `wcs-process-*`, and `wcs-region-*` labels. Names are NFKD-normalized, diacritics removed, lowercased and punctuation collapsed into hyphens. Labels with remaining non-ASCII characters are rejected before a native search request; JSON search still supports those names. Treat names that normalize to the same label as one taxonomy key in the publisher.

## Suggestions, corrections and learning requests

`suggestions.js` provides one feedback widget on each WCSpedia page, using the shared Citi dialog and popover component. Readers can choose **Suggest an edit**, select readable text and right-click **Suggest a correction**, or press **Alt+Shift+S**. The context menu is intercepted only for a valid selection inside WCSpedia; inputs, rich editors, controls and text outside the application retain their usual behavior. Selections are limited to 4,000 characters. The selected quote is captured with preceding/following text, section heading, container ID and offsets, plus the source page title/URL and exact document version/revision supplied by the page. These anchors are reference information, not an instruction to apply a replacement automatically.

Requests support Correction, Improvement and Training request, and require a suggested change plus the reason or supporting context. A suggestion is a separate record. It never edits a document, completes a content review or grants approval. The owner/assigned manager should make any accepted content changes through the existing draft/review/approval workflow. Requests move from `Open` to `Resolved` or `Dismissed` with a required decision comment, retained actor/time history and a suggestion revision distinct from the document revision.

In embedded/local demos the queue is stored under `wcspedia.suggestions.v1` in local storage, shared by the dedicated HTML pages on the same origin. Submission is labeled as a local save; no email or other external notification is sent. A reader sees their own requests. The reviewer inbox shows document requests only to a Manager named as that document's owner, reviewer or approver; general-page requests can be triaged by a Manager. Local storage is mutable demonstration state, not a production audit store, and quota/storage failures are shown without claiming a successful save.

For Confluence configure a **same-origin** `WCS_CONFIG.suggestionEndpoint`. An empty endpoint leaves the dialog in copy-only mode; it does not silently fall back to a local queue or show a sent confirmation. Use the configured WCSpedia root page ID. The suggestion endpoint contract is:

```http
GET /confluence/rest/wcspedia/suggestions?rootPageId=123&scope=mine
GET /confluence/rest/wcspedia/suggestions?rootPageId=123&scope=review
```

The optional `documentId` and `status` query parameters narrow the authorized queue. Return `{ "suggestions": [record] }`. The client accepts at most 1,000 records and a 2,000,000-character JSON response.

```json
{
  "action": "create",
  "requestId": "client-generated-unique-request-id",
  "payload": {
    "type": "Correction",
    "correction": "Proposed replacement text or description",
    "reason": "Reason and supporting references",
    "context": {
      "title": "Credit approval checklist",
      "url": "https://confluence.example/pages/viewpage.action?pageId=123#/document/checklist",
      "documentId": "checklist",
      "version": 2,
      "revision": 3,
      "ownerId": "author-id",
      "reviewerId": "manager-id",
      "approverId": "manager-id",
      "anchor": {
        "exact": "Selected text",
        "prefix": "Preceding context ",
        "suffix": " following context",
        "heading": "Handover",
        "containerId": "handover",
        "startOffset": 18,
        "endOffset": 31
      }
    }
  }
}
```

POST the command to the configured endpoint with the same `requestId` in `Idempotency-Key`. The client uses same-origin credentials, `X-Requested-With: XMLHttpRequest`, JSON content type and rejects redirects. Return `{ "suggestion": record }` only after the server has durably accepted the request. A record contains the normalized payload fields plus `id`, `requestId`, `status`, `revision`, `createdAt`, `createdBy: {id,name,role}` and `history: [{id,action,at,actor:{id,name,role},comment,requestId}]`. Initial state is `Open`, suggestion revision `1`, and history action `Submitted`. Dates are server UTC timestamps in production. The client matches the acknowledgment to the request ID, submitted payload and signed-in user.

```json
{
  "action": "decide",
  "requestId": "new-unique-decision-request-id",
  "suggestionId": "suggestion-id",
  "expectedRevision": 1,
  "status": "Resolved",
  "comment": "Addressed in approved document revision 4."
}
```

Decision responses use the same `{ "suggestion": record }` envelope, increment the suggestion revision and append a history event whose action is `Resolved` or `Dismissed`. Enforce expected revision and idempotency atomically; use HTTP 409 for stale or conflicting commands. A retry of the identical accepted request must return the same result, while reuse of the same key with different content must fail. Network errors and malformed or mismatched acknowledgments remain unconfirmed in the dialog; the client does not claim delivery.

The server must derive the actor from the authenticated Confluence session, verify access to the source document/revision, resolve current owner/reviewer/approver assignments itself, enforce queue visibility and manager decision permissions, and apply the site's CSRF protection. Client context/roles are reference data and are not authorization. Preserve immutable server-side request and disposition history, enforce length limits, and treat all free text as untrusted. The browser implementation and API contract do not deploy this service or a notification channel.

Source URLs retain the actual dedicated-page URL and route at the time of the request. Inbox titles and captured URLs are not automatically followed or converted into cross-page navigation; exported request Markdown includes the source URL for reference. The quoted version/revision remains fixed even if that URL later renders newer content. `WCSSuggestions.mount` and `mountInbox` return `destroy()` methods to remove handlers/dialogs before page replacement; late saves and queue responses cannot repaint a subsequent view.

### Using one JSON file for suggestions

A shared JSON queue can store suggestions separately from document content. It does **not** make the current Send button work merely by uploading a file: the deployed macros currently leave `services.suggestionEndpoint` empty, and the repository supplies a client/API contract plus a local mock, not an installed Confluence service.

For a small queue, the recommended attachment arrangement is a dedicated **restricted Suggestions storage page**, with `wcspedia-suggestions.json` writable only by the service identity and authorized administrators. Do not place private suggestion data on the broadly readable JavaScript/assets page. The endpoint returns only the current user's requests or those the current manager is permitted to handle. A separate JSON per document is not necessary: records already contain `context.documentId`, version/revision, selected passage, request ID, author, status and decision history. If the source is a native page, the server must resolve its stable numeric page ID and document-version mapping; arbitrary browser-supplied IDs and manager assignments are not trusted. Native pages opened outside the WCSpedia macro do not automatically gain the application suggestion widget.

An empty queue uses the existing local-record shape as a starting example, not a ready production store:

```json
{"schema":1,"suggestions":[]}
```

Deployment steps for the Confluence administrator:

1. Confirm the installed Confluence version and an approved server-side extension/runtime. Implement the GET/POST contract above as an authenticated same-origin endpoint, for example `/confluence/rest/wcspedia/suggestions`. This example path is not a built-in Confluence route. A plugin, an approved server-side extension, or an authenticated internal service behind the same origin must provide it.
2. Create the restricted storage page and service-owned queue, or use a transactional database. All creates/decisions pass through the endpoint, which derives identity, checks source-page access/current assignments, and enforces manager-only dispositions. Browser users must not receive raw read/write access to the aggregate queue.
3. Serialize the entire read/validate/write operation with a lock shared across every service instance; retain request IDs and durable decision history. Read/check the latest attachment version under that lock, upload the new version, verify the committed data, and reconcile uncertain writes by request ID before retrying. A browser read-then-upload or a localStorage lock does not provide this guarantee. Archive or paginate older records rather than allowing the queue to exceed the client limits above; use a database for larger or high-concurrency queues.
4. Test simultaneous submissions, duplicate retries, manager/reader visibility, revoked permissions, stale decisions and failed acknowledgments. Do not report a request as sent until durable storage is confirmed. No email or Teams notification is implied by queue acceptance.
5. Put the real deployed URL in `services.suggestionEndpoint` in all five configured page HTML macros. Publish/reload and verify create → own queue → manager review → resolve/dismiss on staging with separate accounts.

Confluence distinguishes attachment metadata updates from binary-file updates: replacing JSON content uses the binary update endpoint, which creates another attachment version. Metadata-version conflict checks are not a substitute for serializing queue file updates. See the [Confluence Server REST attachment documentation](https://docs.atlassian.com/ConfluenceServer/rest/8.2.2/#api/content/{id}/child/attachment/{attachmentId}/data-updateData). Until this service is installed, the dialog explicitly offers **Copy request** and keeps **Sending unavailable** disabled; copied text has not been delivered.

## Central access and native document lifecycle

The shared access contract is documented in [ENTITLEMENTS.md](./ENTITLEMENTS.md). Keep the rendered Entitlements interface URL as the navigation destination. The policy automatically loads `entitlements.json` from the shared `attachmentPageId`; supplied browser settings need no separate entitlement source, filename or policy-page ID. Native Confluence permissions and SOEID grants must both allow every content or policy write; enforce this on the trusted service, not only in the browser. The [standalone navigation widget](./ADD-DOCUMENT-WIDGET.md) calls the same access adapter.

Keep `doc.id` stable through all title, slug, file and version changes. New keys use secure UUIDs; existing record keys remain valid. The trusted service binds each key to exactly one native `confluencePageId` (or `confluence.pageId`); conflicting/duplicate mappings fail. Native page version and policy revision are additional concurrency guards. Deletion must retain historical snapshots and actor/reason evidence before removing reader content and moving the mapped Confluence page to trash. Return explicit native deletion confirmation; never treat a successful JSON attachment update alone as page deletion.

New installations use one entitlements.json attachment on attachmentPageId for grants and audit. The trusted entitlement service updates the same file under its durable write lock; the workflow loadPolicy hook must read that same JSON. Attachment identity/version and policy revision are checked independently of the host page version. Native table policy sources are no longer supported. Export existing grants and audit into JSON before upgrading an older table installation. See ENTITLEMENTS.md for migration, host requirements and attachment permissions.

## Governance service upgrade

The current bundle requires the versioned governance metadata and private reviewer-evidence contract described in [GOVERNANCE.md](./GOVERNANCE.md). Add `governance` to create/edit/revise snapshots and `governanceReview` to complete-review commands. The trusted handler always passes `requireGovernance: true`; derive identity/time server-side. Strip private review evidence from every reader projection. The existing health endpoint also accepts exact-snapshot review triggers and manager-verified no-change reviews. Uploading the new JavaScript alone does not upgrade those server handlers.
