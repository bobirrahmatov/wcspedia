## Combined analytics and simplified discussion — 17 October 2026

The normal discussion layout has no permanent Open in Confluence action, connecting timeline or left accent. Recovery links remain for failed/denied/uncertain submissions. The composer is above the comments, with right-aligned inline SVG happy/unhappy reactions, green/red selection, a press animation and reduced-motion support. Existing yes/no semantics and native optimistic comment posting remain intact.

Added a trusted server publisher for one `wcspedia-analytics.json` across verified child documents. Native comments remain canonical. The report stores metadata, native footer-comment counts/dates and optional feedback aggregates, with no comment bodies or reader identities. Unknown values remain null. Complete scoped pagination, authorization, cancellation, a whole-run lock and atomic replacement protect the last complete report. A reporting adapter/job must still be integrated; no endpoint or scheduler was deployed. Native-comment reporting works before helpfulness is configured. The runtime package contains one combined analytics JSON template; per-document response examples are confined to the separate server-source ZIP.

106 focused tests passed: 63 native adapter/feedback service/UI/bootstrap/client, 15 analytics and 28 generated/configured package checks. An independent code review found no actionable bugs. All 16 runtime JS attachments pass node --check. The local HTTP browser fixture confirmed immediate pending and then saved comment state without navigation, the selected green SVG reaction, visible input and removal of side accents. Screenshot: previews/article-discussion-reactions-verified.png. This fixture does not verify the internal Confluence server or its live theme/API behavior.

Configured upload build: 9cdb093c920a. Runtime ZIP: 42 files, 2,500,507 bytes, SHA-256 5593302a1ead41aca8e2669662cd59c259fcad640231417c28606befbc3af623. Separate server source ZIP: 10 files, SHA-256 985af41d34099835ea1e835d5b2e2d0d15dae44060259370749d30c42b6c272f. Final archives pass integrity checks; runtime ZIP has no .cjs source and exactly one combined analytics template. Live entitlement/library JSON and supplied installation IDs are preserved. The empty analytics template means not collected; it must not overwrite a live report.

## Native article discussion and helpfulness — 17 October 2026

Added a separate shared-header bootstrap and lazy article bundle. Native child articles are verified against the exact WCSpedia space, landing root and business-area ancestry; interface pages, area parents, attachment page, working tree, editors, historical views and native recovery URLs are excluded. Comments use native Server/DC footer APIs, 20 per request. Posting is optimistic with a confirmed native ID, no reload or automatic POST retry, definite-failure draft preservation, and explicit unknown-outcome recovery. Native Confluence remains authoritative for posting permissions. Existing rich comments display as plain text; native formatting/reply/edit controls remain accessible through the bypass link.

Optional helpfulness uses a separately supplied trusted service and one private JSON record per document. The first accepted vote creates the file. Per-actor revisions, authenticated authorization on every operation, atomic writes, per-document locks, idempotency receipts and aggregate-only protected exports are covered. The ready header leaves feedbackEndpoint empty, so no unsaved vote controls are presented. No live feedback endpoint or Confluence deployment was created.

343 distinct focused tests passed across native adapter, service, UI/bootstrap/client, style flags, generated packaging, existing search/discovery, HTTP page loading and notifications. After the final early space guard and cache-state correction, the 24 affected bootstrap/client/configured-package tests were rerun successfully. All 16 generated JS attachments pass node --check. A local native-page HTTP fixture using the delivered attachments verified pending-to-confirmed posting without navigation, successful helpfulness, and native 403 denial with a copyable draft. Screenshot: previews/article-discussion-verified.png. The fixture is not the internal Confluence instance, so live theme/API compatibility and server latency still need installation verification.

Configured upload build: 2a9dab55c48f. Runtime ZIP: 41 files, 2,494,868 bytes, SHA-256 0c2457928d8b2986074988719b997bf8223895582cc2f74cdae402e03168d6a9. Optional feedback server source ZIP: 6 files, SHA-256 fc1aea2911c152a50a090b03f298c990451001c689b5b967db6473bea61fb2d9. Runtime upload ZIP contains no .cjs/server files. Live entitlements and library JSON are preserved; first-install seeds are unchanged. Setup and research references are in ARTICLE-DISCUSSION.md.

## Add entitlement controls, confirmed JSON saves and simplified setup — 16 October 2026

The five page macros and Add document header macro now require only `attachmentPageId` for the entitlement JSON location. Redundant user-facing source, filename and policy-host settings have been removed; the fixed default is `entitlements.json`. The Entitlements interface navigation destination and trusted service endpoint remain. Explicit legacy JSON host overrides are retained internally for compatibility, not required by the new kit.

Authorized users see Add/Edit/Revoke controls; without a configured save service they are visibly disabled with an associated setup message. View-only readers do not receive mutation controls. The form normalizes SOEIDs and validates permission selection, records, duplicate SOEID/scope pairs and nonblank reasons without losing inputs. Editing an unloaded document scope retains its exact key in the select. Uncertain saves disable subsequent submission until reload.

A success response alone no longer implies persistence. The client confirms the same JSON attachment with a newer native version and exact audited action, actor, reason and before/after change. An unrelated newer policy, login HTML, no-op response or mismatched audit cannot produce a success toast. The pending command identity remains until confirmed.

All **224 Node runner tests passed**, including five new live UI-to-service integration tests using the actual client, validator and attachment service with a simulated authenticated host. Add/Edit/Revoke and reload persisted one attachment with server audit; failures preserve the form and no false success; native revocation is rechecked. The local HTTP entitlement smoke check also passed. All **14 runtime JS files** pass syntax checks. The Add form was inspected in the local Confluence simulation; screenshot: [Add entitlement preview](./previews/entitlements-add-json-form.png). No production browser mutations occurred.

Upload revision: **23c3e2748f02**. The clean ZIP contains 36 verified runtime/macro/starter/template/license files and no development `.cjs` files. The global CSS is byte-identical (SHA-256 **981b914cd181ff14467f997e7e2ae79f9445184c86e3ebbe16a95cbfddaa448f**); no redesign was performed. Existing live JSON must be preserved. The package does not deploy the trusted service or update internal Confluence pages; actual endpoint configuration remains an installation prerequisite for live interface saves.

## JSON-only entitlement policy — 16 October 2026

The maintained client, header widget and local simulator now support only the `entitlements.json` attachment. Omitted/null source defaults to attachment; an explicit legacy table source fails configuration without loading a different policy. The native-table reader, parser, serializer and generated template have been removed. The Entitlements interface remains, and its page ID is separate from the JSON host. Blank policy host uses the shared attachments page. Keep existing JSON grants, policy revision and audit when installing.

The targeted Node run passed all 204 runner tests, including the widget suite's 28 checks and application suite's 17 checks (247 substantive checks). A separate local HTTP smoke check passed add/edit/revoke, audit, version conflict, identity, CSRF and native permission scenarios. All 14 generated runtime JavaScript files pass syntax checks. Runtime bundles contain no legacy table parser or serializer; clean upload, canonical upload, header and starter ZIPs pass integrity checks and omit the retired table template.

Build revision: **a62ae6907f5f**. The clean runtime upload ZIP contains 36 files without development sources or tests. Global CSS is unchanged, SHA-256 **981b914cd181ff14467f997e7e2ae79f9445184c86e3ebbe16a95cbfddaa448f**. No new visual changes were made. JSON reads work without an entitlement service; governed UI writes still require the trusted service and native permissions. No internal Confluence deployment or live verification was performed. This entry supersedes older verification entries describing retained table support.

## Entitlement attachment loading and dedicated page URLs — 16 October 2026

Fixed the attachment-policy configuration default: blank/null/undefined `entitlementsPageId` uses the shared attachments page in attachment mode. A valid explicit policy host still wins; the interface page ID is never an implicit policy host. Nonempty malformed IDs fail configuration; legacy table mode still requires its explicit host. After a successful authenticated GET with the exact requested page ID and a valid operations array, the client recognizes read access even if that array omits a separate read entry. No mutation rights are inferred. Missing/malformed/forbidden page responses remain rejected.

Entitlement startup distinguishes unresolved identity, unloaded policy and an absent active grant. A loaded directory remains readable without an entitlement endpoint; mutation controls require that endpoint as well as existing permissions. Manual JSON uploads retain native attachment history but do not fabricate application audit events. The independent Add document widget uses the same resolved policy host while retaining both authoring-service requirements.

Hosted page-role defaults no longer repeat their route in the URL. Existing default hashes are canonicalized; search/filter/editor hashes and native query parameters are preserved. Local demos retain their routing and unsaved-editor guards remain intact.

**249 focused checks passed:** 161 adapter/policy/service/JSON-flow checks, 13 navigation checks, seven hosted-app route checks, five action/diagnostic checks, 20 generated upload/HTTP checks, 26 header-widget checks and 17 entitlement application checks. An initial test run exposed missing TextEncoder in older jsdom fixtures now that they load JSON policies; the fixtures supply the browser API and all affected upload/HTTP checks pass. All 14 runtime JS files pass syntax checks. The final generated upload checks were rerun after the last explanatory copy change.

Browser verification uses the actual delivered Entitlements pair against a local read-only Confluence fixture: BR47149, blank policy ID, JSON on attachment page 900, and an empty native operations array. The directory loads with one active record, no mutation controls without a service, no console errors and a clean default URL. See [verified attachment policy directory](./previews/entitlements-attachment-fixed.png). The existing design and styles are retained.

Build revision: **c54e5818c83d**. The clean **WCSpedia-upload-ready.zip** contains 36 verified runtime/macro/starter/template/license files (2.5 MB), without development sources or tests. Keep live JSON, audit and installation settings; replace matching JS pairs and update their cache revisions. No internal Confluence deployment or live permission verification was performed.

## Paste MDX metadata and original document dates — 16 October 2026

Added the constrained `wcspedia-mdx-v1` frontmatter contract and reusable metadata/document templates. The existing editor previews and applies title, summary, content type, business area, discovery tags and source provenance before saving. It retains exact date-only/offset precision, uses null for unknown source dates, rejects unknown/duplicate fields and executable MDX components, and preserves ordinary Markdown. Recovery retains an unprocessed metadata block intact until explicitly imported. Copy/Download Markdown retain readable content and the source block.

Original dates persist through create/edit/recovery/review/approval/revision, the strict reader projection and native storage metadata table. First import time is assigned by the trusted workflow clock, kept stable and audited separately; source identity cannot be switched/removed and duplicate source IDs in the authoritative library registry are rejected. Native Confluence created/modified timestamps and scoped CQL Updated year behavior are unchanged. This is a single-document import, not a bulk/upsert migration or a new custom-date search index.

**333 core/flow tests and 42 generated-delivery/search tests passed.** A final focused regression run repeats the changed import/editor/adapter/upload paths after the visual polish. Tests cover parsing, dates, unknown metadata, plain Markdown compatibility, preview/apply atomicity, recovery, client timestamp spoof filtering, full app create/edit, server duplicate protection, original dates through native publication, schema/projection validation and existing search boundaries. A real local browser check confirmed the metadata preview and resulting editor values; screenshot: `previews/mdx-import-preview.jpg`. No source date or native timestamp was fabricated.

Canonical upload revision: **628ae4acd51e**. The shared upload CSS remains byte-identical: SHA-256 **2f478e207a14405973013a66e4164eb38d12539f67a811cf560fdca7b67118bf**. Templates and deployment guidance are included in the canonical upload ZIP and full source package. Generated JavaScript syntax, manifests, and ZIP bytes are verified. Existing extracted upload folders were not changed.

No internal Confluence deployment was performed. Deploy updated browser pairs and trusted workflow/publisher modules together while preserving configured IDs/endpoints. See `MDX-IMPORT.md` for the complete contract, authoring-agent prompt and native/source-date distinction.

# WCSpedia verification

## Updated year scope and configuration checks — 16 October 2026

Audit confirmed the active year filter already combines the verified landing-page space and recursive ancestor constraint; it does not query a global year facet or crawl Confluence. Hardened configuration now checks a canonical `pages.home` page ID against `rootPageId` before scope network reads, rejects unsafe numeric IDs, and treats blank/whitespace `spaceKey` as automatic resolution. `info().searchSpaceKey` reports the successfully verified key. Published-result validation now checks page type, ID and root ancestry as the tree path already did. Invalid scope stops search without a wider fallback.

Corrected misleading older documentation that called the search root an asset/data page. Inline installation comments and the upload guide distinguish landing page IDs, attachment-host IDs and exact space keys, and explain matching JS pairs/cache revisions. No actual site IDs were guessed.

**210 tests passed**: 172 adapter/search/generated upload/HTTP tests and 38 application landing/search/JSON entitlement regressions. The real generated HTML macro's year select was exercised over HTTP: selecting 2026 makes one bounded request with both scope restrictions and the date range, clearing the year preserves the scope, and all landing/search requests omit full page bodies. Additional tests cover year + sort + continuation/reset, wrong-space/non-descendant results and invalid configuration. Shared CSS remains byte-identical, SHA-256 **2f478e207a14405973013a66e4164eb38d12539f67a811cf560fdca7b67118bf**.

Canonical packages are rebuilt; existing extracted copies are untouched. No live internal-server access, production latency measurement or deployment was performed. The live reported cause remains unconfirmed until the published HTML IDs and uploaded asset revision are checked.

## Child document flags and one entitlement JSON — 16 October 2026

The four requested Citi flags now apply only to explicitly marked native child documents. All five WCSpedia application pages are excluded, even if older markup retains a generic flag attribute. Generated application roots no longer contain that attribute. The native publisher still inserts its document Anchor and escaped title; normal native edit/preview/history screens remain excluded. This supersedes the broader page opt-in described in the previous entry.

New installation macros and the header widget explicitly select `entitlementsSource: 'attachment'` with `entitlementsFilename: 'entitlements.json'`. Their existing `entitlementsPageId` now points to the JSON attachment host. JSON and audit are loaded from one version-pinned attachment, without native-table reads or the table/service audit reconciliation. Legacy configurations retain table mode until explicitly migrated. Policy revision, attachment identity/version and host-page version are tracked independently. Missing, malformed, raced or cancelled policy loads fail closed.

The BR47149 starter is now **confluence-data-starters/entitlements.json**, also included separately under **confluence-upload/initial-data/**. The grants and empty initial audit are unchanged. Root demo grants are not used. The new server-only `confluence-entitlements.cjs` writes the same attachment under a shared durable lock, applies the existing rights/last-admin rules, records trusted audit data and reconciles unknown uploads without duplicate writes. Its `loadPolicy` can supply the workflow coordinator's central authorization. Actual session authentication, native rights, CSRF/HTTP hosting, exclusive attachment-write controls and deployment remain host responsibilities.

The main regression run passed **265 Node tests**, including 112 existing adapter tests, 12 new JSON client tests, 16 attachment service tests, shared entitlement/storage/publication/workflow coverage, 15 bootstrap/data checks, 16 child-flag checks and generated upload/HTTP checks. The runner also counted the **21 widget checks** and **17 Entitlements application checks** as one test each. An additional delivered-seed check and a real adapter-to-service add/edit/revoke integration verify the shipped BR47149 file, persisted attachment bytes, audit attribution, server denial after identity change and reload consistency. No browser write goes directly to the attachment API.

All 13 generated JS files pass syntax checks. The global CSS remains byte-identical, SHA-256 **2f478e207a14405973013a66e4164eb38d12539f67a811cf560fdca7b67118bf**. The canonical upload, separate flags/header kits, starter kit and full source package are rebuilt with verified checksums/ZIP content. See their generated README for the current cache revision. Existing extracted upload folders were not modified.

No internal Confluence deployment was performed. Uploading JSON enables the configured reader; Entitlements UI saves still require the deployed trusted service endpoint. Existing policy/audit must be migrated rather than overwritten by the first-install seed. Native flag appearance still depends on the installed Citi theme.

## Automatic native page style flags — 16 October 2026

Prepared **WCSpedia-page-style-flags.zip** with the shared-header helper, header HTML, manual page marker and setup guide. The five generated application roots opt in to `hide-title`, `hide-actions`, `hide-comments` and `hide-footer`. The helper uses existing Citi body classes, performs no network or persistent writes, preserves preexisting theme classes, and excludes native editor/create/preview/history/admin and iframe contexts. Explicit opt-out and `wcsNativeUi=1` recovery are supplied. Late markers and lifecycle cleanup use bounded/coalesced observation instead of polling.

The trusted native publisher defaults to passing `hostStyleFlags: true` to preflight and actual rendering. Generated working/published bodies carry a native Anchor marker and an XML-escaped title heading; there is no executable script in document bodies. Direct renderer callers preserve their prior behavior unless they opt in. Existing bodies are not bulk rewritten; replaying a completed publication remains idempotent. Backend deployment is required for automatic native marking; browser attachment installation does not deploy it.

**95 targeted tests passed:** 12 helper DOM tests, 16 storage-renderer tests, 29 publisher tests, 12 workflow tests, nine native publication/projection HTTP tests, 16 generated upload checks and one real HTTP macro-loading check. All 13 generated JS files pass syntax checks. Build revision: **15c6803958e7**. The shared CSS hash remains **2f478e207a14405973013a66e4164eb38d12539f67a811cf560fdca7b67118bf**, byte-identical to the preceding release. Upload, header-widget and separate flags manifests/ZIP bytes are verified.

The screenshots establish the host's `citi-*` class convention; its actual stylesheet and `citiStyleAdd`/`citiStyleRemove` implementations are unavailable. No internal Confluence or actual Citi styling was accessed or visually verified. Check a marked application page and native document after installation. The small package can be installed without replacing configured application JS pairs, IDs, data, fonts or CSS. See [PAGE-STYLE-FLAGS.md](PAGE-STYLE-FLAGS.md).

## BR47149 access and initial-data package — 16 October 2026

Prepared **confluence-data-starters/** and **WCSpedia-data-starters.zip** for the user-supplied BR47149 identity: one active entitlement administrator, a separate Manager directory role, matching native policy table, empty shared workflow initialization and approved reader seed, and a reference export of built-in health defaults. No sample grants, documents, audit events or unknown user names are inserted. Private data stays separate from browser assets. The HTML/JS/CSS deployment build remains unchanged at **4581de5b4cec**.

**24 targeted tests passed**: ten offline generator checks, five checks of the delivered data and real private journal initialization/restart, and nine existing entitlement tests. The native table roundtrips to the same grants; permissions still require native Confluence rights. Unknown placeholders and duplicate identities fail validation, output directories are not overwritten, and generated files use private filesystem permissions. Initial state is loaded once, not reapplied over an existing journal. Audit starts empty and default health evaluation creates no fabricated saved evidence.

The guide distinguishes the native permissions table from an entitlement JSON attachment, and permission administration from directory-role onboarding. My workspace and Reviewer workspace share a store. Saved items, health and suggestions still need deployed authenticated services; no JSON upload creates those services. Another real Manager must be added before BR47149 can save the first draft because reviewer/approver assignments cannot be the author. No live deployment or live access grant has been made. See [initial-data instructions](DATA-STARTERS.md).

## Responsive discovery startup and separate header widget — 16 October 2026

Live landing and native results release the blocking overlay as soon as authorized page initialization is ready. Bookmarks and content-health loading continue independently: deliberately stalled services no longer make the search field inert, and completion preserves typed input, focus, native results and the current request. Background failure keeps CQL available with a feature-specific retry message. Workspace startup retains its existing required loader and error behavior. The approved projection download and preliminary native access checks now run concurrently; no session is exposed before identity, projection and document permission checks finish. CQL still depends on the internal server and its index/network; no instant-results guarantee or production timing is claimed.

The separate **WCSpedia-header-widget.zip** contains the exact canonical HTML fragment and matching two JS files, with a focused README and checksums. It uses the existing global CSS and widget-specific configuration; no extra header, font, CSS or document JSON is loaded. Creation checks have a 12-second deadline (not a minimum wait), abort propagation, an accessible Retry button, focus recovery, and stale-result protection after timeout/update/destruction. Permission checks remain fresh at mount, opening and selection. Missing policy/services remain unavailable. The widget navigates to the existing My workspace creation screen; actual native-page creation still requires the configured authorized workflow/publication backend.

**236 targeted checks passed:** 112 adapter checks, 37 CQL/excerpt checks, 16 search checks, eight native landing checks, five delayed-startup checks, 12 overlay checks, 15 upload checks, one real loopback HTTP check, 21 widget checks and nine workspace checks. The Node runner reports 208 top-level tests because it counts the custom widget/workspace suites as one each. All 12 generated JavaScript files pass syntax checks. Upload and standalone-widget ZIP contents/checksums are verified. Shared CSS is byte-identical to the preceding release.

Build revision: **4581de5b4cec**. Replace matching page JS pairs and their cache revisions for the startup improvement. Use the new separate header pair and configured HTML for the widget. Keep real IDs/service endpoints, logos, approved document data and global CSS. The generated widget folders contain placeholders; save configured HTML outside those folders before rebuilding.

A browser check loaded only the supplied standalone widget HTML/JS and existing CSS against a read-only permission fixture, then opened the document-type menu. See [standalone header widget](./previews/header-widget-standalone.jpg). This verifies local integration, not deployment on the internal server. See [standalone installation instructions](./confluence-header-widget/README.md).

## CQL search scope, loading recovery and excerpt repair — 16 October 2026

Main search and autocomplete now query `ancestor = root` inside the root's verified space, excluding the root/interface shell, mapped business-area parents, configured page roles, assets and permission-page IDs. Document descendants beneath those containers remain eligible. Only the configured restricted working branch and explicit custom administrative branches are excluded recursively. No global `macro != html` filter is used, so legitimate documents containing video/HTML embeds are retained. Additional header/style pages can be excluded by ID through inline `search` settings.

Autocomplete/counts request `excerpt=none` and only space/ancestor expansions; result cards use indexed excerpts and preserve version/label metadata. HTML/JS/CSS-bearing excerpts are suppressed without dropping the matched document link. There is no full-body download or per-result request. The entire read, including root lookup and response-body consumption, has a 12-second default deadline with a retryable timeout distinct from cancellation. Hung/failed root lookups can be retried. No completed-result cache is introduced. Identical pending submissions are deduplicated; browser Back/Forward restoration resumes cancelled searches; the loading message is shown once. Exact unused generated working-root placeholders do not prevent read search, while publication still requires real parent IDs.

**202 targeted checks passed:** 108 adapter tests, 37 CQL/excerpt tests, 16 search integration tests, eight native landing tests, 15 generated upload-kit tests, one real loopback HTTP macro-loading test, and 17 header-widget checks. One initial integration failure exposed a local mock that did not implement CQL exclusions; the mock was corrected and all 24 search/landing checks passed on rerun. Coverage includes all eight mapped areas, unlabelled/deep documents, 100 custom page plus 100 branch exclusions, hanging reads, cancellation, scope verification, exclusions, pagination, and delivered HTML/JS loading. All 12 generated JavaScript files pass syntax checks; upload manifest and ZIP bytes are verified.

Browser verification against the read-only local Confluence simulation returned native unlabelled and deeply nested handover pages with safe links and no interface page in the results. See [verified native results](./previews/search-descendant-repair.jpg). This is fixture evidence, not a measurement of the internal site. Covenants source confirms it filters already-loaded spreadsheet rows locally; WCSpedia native search waits for Confluence's index/API. Adding an Excel library would not accelerate that API.

Build revision: **e593fd628beb**. Replace the five matching logic/HTMLPage JS pairs and update script cache revisions; update the optional header pair if installed. Keep real inline IDs/services, global CSS, logos and approved reader JSON. Shared CSS and logos are byte-identical to the preceding package. Custom exclusions and a timeout override are optional inline settings. See [current search update instructions](./confluence-upload/README.md#search-repair-and-exclusions).

No live deployment or internal-server latency/index check was performed. Native page bodies must contain the actual searchable document text; client-rendered JSON/JS content cannot be made searchable by this browser repair. The remaining aggregate reader bootstrap and authoring service dependencies remain as documented.

## Viewport frame, header widget and suggestion controls — 16 October 2026

All five page roles use the same rounded, maximum-width frame and aligned introduction/content edges. The application measures the viewport space beneath the existing header and resizes with it. Long content scrolls inside one keyboard-focusable pane; horizontal table access and independently scrolling dialogs remain available. Back to top and route changes scroll the application pane, not the Confluence host. Layout overrides are scoped to WCSpedia; no global body overflow or new header is introduced. The current upload instructions supersede the older “landing pair only” update below: this release replaces all five JS pairs and the shared CSS.

The optional header Add document widget has its own generated HTML, logic JS and HTMLPage JS. Its isolated dependency registry preserves the page's WCS_CONFIG and Confluence/entitlement globals, validates the matching build, resolves the current authenticated user and shared native permission table, and rechecks permission before navigation. It routes through the application's existing unsaved-edit guard when present. Missing policy or authoring services keep the control disabled with an explanation. It performs no document writes itself.

The suggestion button stays inside the WCSpedia content edge. Handled clicks, selection context menus, scoped shortcuts and shared dialog events stop bubbling into the host's delegated page actions while preserving the application's own handlers. Host capture-phase interception has not been tested on a real Confluence instance. With no suggestion endpoint, the dialog explains that sending is unavailable, disables Send, and allows a partial request to be copied. Failed delivery keeps entered text. A shared JSON queue remains a possible server-side store; the documented deployment requires trusted authentication, filtered reads, serialized writes and durable acknowledgments. No production suggestion service has been deployed.

**171 targeted checks passed:** 16 suggestion-service checks, 29 suggestion DOM checks, 17 header-widget checks (including the actual generated pair), nine frame/layout checks, 15 upload-kit checks, one loopback HTTP macro-loading check, 22 shared-UI checks, 17 entitlement application checks, nine workspace checks, 16 export-dialog checks, 12 search checks and eight native landing checks. The workspace shortcut regression now verifies that a key event outside WCSpedia is ignored, while a focused application shortcut opens one dialog after repeated renders. All 12 generated JavaScript files pass syntax checks; the upload manifest and ZIP bytes are verified.

Browser inspection at 1280×720 confirmed that the landing panel and content both measure 1184px wide with matching 48px insets. The frame ends at 704px, leaving a 16px bottom gap. Entitlement rows and history remain reachable with host scrollY = 0. At 390×844, document width remains 390px and the frame ends at 828px; the wide table scrolls horizontally inside its wrapper. The mobile suggestion dialog fits within 12px viewport insets and retains internal access to all controls. See [desktop frame](./previews/viewport-entitlements-top.png), [scrolled entitlement content](./previews/viewport-entitlements.png) and [mobile suggestion dialog](./previews/viewport-suggestion-mobile.png). These previews use local sample data, not a live Confluence account.

No live Confluence deployment was performed. Keep your configured page IDs, service URLs, logos and approved reader data. Follow [the current upload instructions](./confluence-upload/README.md), [header setup](./ADD-DOCUMENT-WIDGET.md) and [suggestions JSON deployment](./CONFLUENCE-WORKFLOW.md#using-one-json-file-for-suggestions).

## Native landing documents and area counts — 16 October 2026

The live landing page now obtains its three latest updated document cards and all eight business-area descendant counts from Confluence CQL, independently of document records in the reader JSON. Native and unlabelled descendants at every depth are included. Queries verify the root space and mapped area ancestry, exclude navigation/area parent pages and configured working/assets/policy/interface containers, and reject out-of-scope responses. Cards open native page IDs and show update dates without inventing approval, view or reading-time data. The approved JSON is still required at bootstrap for taxonomy and existing editor/reader consumers; this does not complete the native authoring migration.

The loader uses at most three concurrent workers, one shared root-space lookup, eight small area-parent metadata requests and nine bounded CQL queries for a correctly configured eight-area tree. It does not crawl or download page bodies. Counts depend on the totals exposed by the target Confluence response; missing totals and failed requests are shown as unavailable, never zero. No production timing is claimed. Errors can be retried without demo fallback. Targeted DOM updates preserve the landing search input and focus. Navigation cancels discovery, stale responses cannot overwrite newer visits, and browser back-cache restoration resumes loading.

**188 checks passed:** 133 adapter/CQL tests, eight native landing DOM checks, 31 search/branding/loading checks, 15 upload-kit checks and one actual local HTTP macro-loading check. The HTTP test loads the generated HTML and its JS pair from attachment host 900, starts with an empty document JSON, then renders native child 123 and business-area counts beneath root 100 before exercising search. The generated ten JS files pass syntax checks. The upload ZIP and SHA-256 manifest are verified. Shared global CSS and both logo files are byte-identical to the preceding upload kit; no design or header changes were made.

For the existing installation, replace only `confluence-upload/attachments/wcspedia-landing.js` and `wcspedia-landingHTMLPage.js`, keeping the user's configured HTML and IDs. Update both script cache revisions to `0eb54379b9d2`. Preserve existing reader JSON and global CSS. The generated canonical folder is new; existing extracted `confluence-upload 2/` and `confluence-upload 13.35.45/` copies were not modified.

No live Confluence instance was accessed or verified. Staging must confirm actual root/area IDs, permissions and search indexing. Local demo documents are examples and are not automatically created on the server. The current installation instructions are in [confluence-upload/README.md](./confluence-upload/README.md).

## Covenants loading pattern for every page — 16 October 2026

The current upload kit follows the existing Covenants files: each HTML macro contains its settings, then loads its own logic JS and matching `HTMLPage.js`. There is no external `wcspedia-config.js` dependency. All five pages retain the maintained `app.js` renderer and existing global CSS; no header or fonts were added. Logic alone makes no requests or page changes, and the HTMLPage file validates the role and matching build before startup. Repeated loading does not bind another application.

`attachmentPageId` now selects the reader JSON's attachment host independently of `rootPageId`. The macros use the attachment host for script and logo URLs. Search, root permissions, navigation and publication remain scoped to the real landing root. Administrative attachment writes check actual attachment-host update permission; omitted or blank attachment IDs preserve previous same-page behavior. Existing production projection writers must be configured separately to write to the chosen attachment host.

**117 checks passed:** 89 adapter tests, 15 upload-kit checks, 12 search integration tests and one real local HTTP macro-loading test. The HTTP check loads the delivered HTML, global CSS and both external JS files through actual loopback URLs, then submits a search. Reader metadata/JSON load from attachment page 900, while CQL verifies landing root 100 and renders a deeper native child. Requests cannot leave the fixture server. The ten generated JS files pass syntax checks; all five inline settings scripts execute in the upload tests. The builder verifies the SHA-256 manifest and ZIP bytes.

Use the HTML fragments and README in `confluence-upload/`. Replace the old config-script include and previous standalone bundle with the matching new pair. The existing approved reader JSON must be preserved. Live Confluence installation was not performed; real IDs, current-user permissions and backend integrations still require staging verification. All earlier upload layouts below are historical.

## Historical: separate HTML and JavaScript for every page — 16 October 2026

The current upload kit contains five matching HTML/JavaScript pairs: landing, My workspace, Reviewer workspace, Saved items and Entitlements. Each page script contains the existing dependencies and unchanged `app.js` renderer, guarded for that specific page role. Each HTML macro loads shared configuration then its own script; the previous `wcspedia.js` and `wcspediaHTMLPage.js` are removed from this kit. The standard local/portable combined bundle remains unchanged.

One shared stylesheet is loaded once using `html/wcspedia-global-styles.html`; the five page macros contain no CSS links. That fragment contains no application root, JavaScript, header or fonts. Component rules and established design are unchanged.

**13 upload-kit checks passed.** Coverage includes all five default routes and expected page/read-only headings, matching attachment references, cross-page links by configured native page ID, unchanged header/sidebar/font styles, duplicate-script protection, and wrong-page-script rejection before requests. All six JavaScript files (five page bundles and configuration) pass syntax checks. `package-confluence-upload.py` verifies the complete SHA-256 manifest and ZIP content; the upload builder runs it automatically.

Live Confluence deployment was not performed. Configure real IDs and preserve existing approved reader data. The service dependencies described in the installation guide remain required for governed writes. The earlier shared-renderer instructions below are historical and superseded for this upload kit.

## Historical: shared HTML page renderer — 16 October 2026

The upload kit now mirrors Covenants with three ordered JS files: `wcspedia-config.js`, logic-only `wcspedia.js`, and `wcspediaHTMLPage.js`. All five HTML macro fragments load that exact sequence. The renderer contains the unchanged application source from `app.js`; the logic file excludes it. The standard local/portable combined bundle remains unchanged.

**10 upload-kit tests passed.** They verify the core file alone makes no requests, renders no page and starts no overlay; loading the renderer then boots each role with the existing header, sidebar and font styles preserved. Script ordering, supplied asset paths and exactly one copy of the application renderer are checked. The three generated JS files also pass syntax checks. The ZIP and checksum manifest were regenerated and verified against the delivered files.

Use the three JS files from this same upload kit together; do not add the new renderer after an older combined bundle. See [the updated HTML macro snippets and installation guide](./confluence-upload/README.md). No live Confluence deployment was performed.

## Existing-header Confluence upload kit — 16 October 2026

Created `confluence-upload/` and `WCSpedia-confluence-upload.zip`: five content-only macro fragments, shared app JS, shared configuration JS, component CSS, the existing logos and empty starter metadata. This follows the Covenants attachment-loading pattern. The kit creates no site header, does not modify existing WCSpedia header hooks, and suppresses the extra connection strip. Font faces and forced UI font families are removed only from the upload CSS; typography inherits the existing Confluence theme, including the loading overlay and charts. Deliberate code fonts remain monospace. Local/portable preview CSS remains unchanged.

**170 selected automated tests passed:** 161 existing adapter/search/chart/branding/loader/workspace checks and nine upload-kit checks. Each of the five generated pages was bootstrapped with the actual upload bundle, empty metadata, a native current-user fixture and an existing header. The checks verified unchanged header markup/hooks/styles, one application root/bundle, role routing, font inheritance declarations, same-origin attachment paths, loader cleanup and read-only behavior. The validator now accepts an empty directory only with no document snapshots; live loading maps the authenticated user as a Reader without granting writes. Charts inherit their containing page font.

```sh
node build-confluence-upload.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test confluence.test.cjs search.test.cjs workspace-charts.test.cjs tests/search-app.cjs tests/branding-app.cjs tests/loading-overlay-app.cjs tests/workspace-app.cjs tests/confluence-upload.test.cjs
```

No live deployment was performed. Replace the root/area/page IDs before uploading. Existing deployments must preserve their approved reader JSON rather than overwrite it with the fresh-install starter. Workflow writes, bookmarks, health and metrics remain dependent on their trusted endpoints; the upload kit does not install those services or complete native authoring migration. See [installation instructions](./confluence-upload/README.md).

## Primary CQL search — 16 October 2026

The main live search, business-area browsing and autocomplete now use Confluence CQL. Every query includes the verified root space and `(id = ROOT OR ancestor = ROOT)`. This searches WCSpedia itself and every depth of child pages across all eight business areas, including native pages with no WCSpedia labels or JSON record. The established layout and stylesheet are retained. Results open their native Confluence page IDs.

**176 selected automated tests passed**, zero failures/skips. This includes 12 search integration tests, seven branding checks and the workspace harness (nine internal checks). The actual loopback HTTP adapter test paginates through all 14 mock pages: root, eight areas and five descendants. Other-space and unrelated same-space pages are excluded. It verifies that discovery issues no attachment or full-body fetch. Browser inspection confirmed root-inclusive results, all three result pages, autocomplete and unlabelled/deep descendants. The search UI also passes with an empty document snapshot.

Coverage includes configured-space mismatch, returned ancestry validation, literal query escaping, optional filters, query/page-size-bound offset and cursor continuations, partial cursor pages, cancellation, stale responses, no JSON fallback on error, and preserved workspace search. The cursor-page display omits numeric result ordinals when the server does not provide an offset.

```sh
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test confluence.test.cjs search.test.cjs discovery.test.cjs document-metrics.test.cjs tests/search-app.cjs tests/branding-app.cjs tests/workspace-app.cjs
python3 package-confluence.py
```

Browser proof: [main CQL results in the local Confluence simulation](./previews/native-primary-search.png). No production latency is claimed. Search requests fetch six result summaries or four suggestions, debounce typing for 150 ms and cancel obsolete work. The application still loads its existing JSON reader at boot for other consumers; taxonomy dropdown choices still come from that metadata projection. Those remaining native-reader/authoring migration limits are documented in [NATIVE-PUBLICATION.md](./NATIVE-PUBLICATION.md).

No live Confluence instance was changed or tested. Deployment still requires actual root/area IDs and a staging check using the target server's index and permissions. The historical supplementary-search verification below describes the earlier implementation and is superseded by this section.

## Search scope and performance — 16 October 2026

The established interface is unchanged. The primary search still runs over loaded snapshots; the supplementary native-page search uses CQL. Its adapter now verifies the root's space, caches the successful scope lookup, rejects a configured mismatch or foreign-space result, and requires both document/publication labels inside the WCSpedia tree. No live Confluence instance was changed or tested.

**158 selected automated tests passed**, zero failures/skips, including five new deployment-bundle interaction tests and the existing workspace harness (nine internal checks). Coverage includes scope caching/retry, invalid scopes, all current type filters, empty-page termination, cancellation while resolving scope, stale responses after returning to the same route, typing debounce, composition, Escape, blur, submit and navigation. Browser checks confirmed normal suggestions/results and a matching native-page result through the loopback Confluence simulation. The mock now decodes the generated literal Lucene terms rather than treating their quote delimiters as search text.

```sh
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test confluence.test.cjs search.test.cjs discovery.test.cjs document-metrics.test.cjs tests/search-app.cjs tests/branding-app.cjs tests/workspace-app.cjs
```

A synthetic Node v26.7.0 CPU benchmark compared the saved pre-change discovery module with the optimized module: five searches over 5,000 documents per batch, five warmups per implementation/query, median of nine alternating batches, with identical result arrays asserted. Each body repeats `credit approval and policy evidence ` 100 times; equal dates exercise title sorting. Blank browsing fell from 402.2 ms to 13.3 ms per batch; the `credit approval` query fell from 405.6 ms to 240.4 ms. These are local processing measurements, not production latency. The UI also removes three redundant facet scans and waits for a 150 ms typing pause before autocomplete. Live server/index/network response time remains unmeasured.

Browser proof: [unchanged search results](./previews/search-performance-check.png). Deploying native CQL as the primary search without the full-library JSON download remains part of [the native-page migration](./NATIVE-PUBLICATION.md).

## Single-logo overlay and shared header installation — 16 October 2026

Removed the top-left background logo and kept one accessible Citi logo inside the centered loading panel. Desktop and 390px mobile browser inspection confirmed one logo and no horizontal overflow.

Added a generated shared-header HTML fragment plus five matching page fragments in `confluence-global-header/`. The header loads CSS and defines the loader; each page retains its own configuration, root and application bootstrap. The component definition is idempotent when the header and bundle both include it. Plain native Confluence pages do not automatically open a WCSpedia overlay.

**24 loader/header checks passed, zero failures or skips**, including all five application entry points, timeout/error cleanup, repeated header loading, header plus bundle loading, and one stylesheet/application root/bootstrap per assembled installation. The existing **24 workspace, library-workflow and document-control application checks also passed**. The main page design CSS remains unchanged; only `loading-overlay.css` and the corresponding generated assets changed. Current shared stylesheet SHA-256: `6c172ac2c9677c2dd58cd92ff10cc9845bdcf6728c34da5851606b72a81c4f52`.

The package includes [installation instructions](./LOADING-OVERLAY-CONFLUENCE.md), `wcspedia-global-header-confluence-macro.html`, the five header-compatible fragments, and updated desktop/mobile previews. No live Confluence configuration was changed.

## Citi loading overlay — 16 October 2026

The shared loading layer is active in all five local/portable/Confluence entry pages and the explicit live workspace refresh. It follows the Covenants overlay/panel dimensions, the existing wealth progress-track pattern, and WCSpedia's existing Citi logo/colors. The current Covenants sources use a spinner; the requested branded filling bar is an adaptation of those existing components.

**597 tests passed, zero failures or skips**, including **21 loader lifecycle/application checks**. The rebuilt bundle also passed the existing **24 workspace, library-workflow and document-control application checks**. Loader checks cover all five pages, delayed data/library reads, initialization failures, bounded timeouts and late responses, safe message text, real step progress, focus/scroll/attribute restoration and page-exit cleanup.

Browser inspection confirmed the top-left logo, centered logo/panel and blue fill. At 390px, the panel is 350px wide and the document has no horizontal overflow. After loading, the original landing page and its controls render normally. The screenshots are `previews/loading-overlay-desktop.png` and `previews/loading-overlay-mobile.png`; the preview HTML deliberately holds the loader for inspection.

All **17 existing source CSS files** remain byte-for-byte equal to the pre-redesign baseline; the prior generated stylesheet is an unchanged prefix of the new stylesheet. Only the loader's scoped CSS is appended. Shared stylesheet SHA-256: `5f3100487cf01f7187f1d2e2776bbaa85948b008943ba6ab20cc12c276b7f2b6`.

```sh
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs tests/governance-export.test.cjs tests/native-publication-flow.cjs tests/native-projection-flow.cjs tests/loading-overlay-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/library-workflows-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/document-control-app.cjs
python3 package-confluence.py
```

Local tests and browser verification do not constitute a live Confluence deployment. The shared assets and versioned macro URLs have been rebuilt for installation.

## Business-area native publication — 16 October 2026

Implemented behind the established interface: eight server-owned area mappings, restricted working children, approved native reader children, stable working/reader IDs across revisions, staged media, CQL labels, strict browser publication receipts, durable transaction recovery and deletion of both mapped pages. The supplied projection writer verifies the approved reader attachment and reconciles uncertain uploads without blindly creating another version.

**576 tests passed, with zero failures or skips**, including 9 actual loopback HTTP integration tests using the real workflow coordinator, native publisher, storage renderer and projection writer. Coverage includes all eight destination parents, draft isolation, exact-revision review/approval, working and published page version conflicts, media byte verification, duplicate/concurrent retries, uncertain page/attachment writes, partial deletion recovery, current permission revocation, private evidence exclusion, mismatched search/publication roots, journal lock isolation and deterministic preflight failures before writes.

The rebuilt established UI passed **24 application checks**: workspaces (9), library/health workflows (10), and document controls (5). All **18 baseline CSS files** remain byte-for-byte equal to `archive/WCSpedia-before-native-redesign.zip`, including the generated stylesheet. `editor.js`, `editor-content.js`, `ui.js`, `data-table.js`, `workspace-table.js` and `pagination.js` are unchanged. The only `app.js` change is the CQL lookup accepting the published native page ID; its markup is unchanged. Global stylesheet SHA-256: `8f840f59d50f04adb6bb3a2bfb656903583b31efea9f9db644b419a07a8d428b`.

```sh
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs tests/governance-export.test.cjs tests/native-publication-flow.cjs tests/native-projection-flow.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/library-workflows-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/document-control-app.cjs
python3 package-confluence.py
```

No live Confluence deployment or production requests occurred. The real page IDs, service authentication/native permission adapters and trusted hosting still need configuration. Existing production documents require verified migration before use with the new publisher. Follow [NATIVE-PUBLICATION.md](./NATIVE-PUBLICATION.md); the separate `experimental-native/` UI remains excluded from the normal package.

## Previous design restored — 15 October 2026

The established interface is again the default for the library, search, document details, authoring, workspaces, saved items and entitlements. Fifteen main generated assets, entry pages and macro fragments were compared byte-for-byte with the package saved before the native-page redesign; all matched. This includes the original shared CSS/JavaScript and standalone navigation Add document widget. Earlier spacing, calendar, rounded-card and shared-control fixes remain in that baseline.

`node build.cjs` now rebuilds only the established interface. The separate `node build-native.cjs` writes exclusively into `experimental-native/`, using a different stylesheet filename. Running the optional build was also verified not to change the default assets. The normal Confluence package excludes the optional native UI and its fixtures.

The complete source suite passed **486 tests, with zero failures or skips**. The rebuilt default bundle also passed **24 integration checks**: workspaces (9), personal library/health navigation (10), and compact document controls/version history/audit (5). The restored landing and document pages were inspected in the local browser. Landing screenshot: `previews/restored-landing.jpg`.

This restores the design and existing behavior; it does not complete native-page storage migration. The current interface still uses its established reader projection and service contracts. Native REST/CQL/editor work remains isolated until it can be integrated behind these same components. No private Confluence site was accessed, changed or verified during restoration. Production page IDs and service endpoints remain placeholders.

The following sections retain earlier verification history.

Verified on 15 October 2026 against the local application and loopback Confluence simulation. No production Confluence or SharePoint content was read or changed for these checks. The production page ID remains `REPLACE_WITH_WCSPEDIA_PAGE_ID`.

## Shared cards, tags, actions and search spacing

The rebuilt bundle passed **41 application checks** (workspaces 9, entitlements 17, saved/health workflows 10, compact controls 5). The export controls passed **16 checks**, shared tables/suggestions/health UI passed **54 direct DOM checks**, and generated content passed **6 tests**. Versioned-asset fixture checks now validate matching CSS/JS revision hashes rather than assuming unversioned URLs. Existing edit/delete entitlement checks, draft persistence, search, pagination and export menu checks remain passing.

Browser measurements at 1280 px confirmed 24 px between reviewer search and table, 8 px between status tags, 30 px tag heights and matching 40 px action buttons. The first-version notice has a uniform 1 px outline and 12 px radius. Detail-page Download still opens PDF, Word and Markdown through the shared menu. Landing search leaves 24 px before popular shortcuts. At 390 px, document controls wrap with spacing; reviewer tables scroll within their container and the document width stays 390 px. My workspace and Saved items retain 24 px search spacing and no page overflow. Desktop and mobile screenshots are saved under `previews/shared-*`; the notice screenshot is `previews/rounded-review-notice.png`.

All five local pages, portable previews and Confluence fragments were rebuilt using the shared stylesheet and script. Existing production placeholders are retained. Upload the rebuilt CSS and JS together and use the matching versioned attachment URLs from the generated fragments.

## Shared date controls and generated slugs

The source suite passed **434 tests** with no failures or skips. The focused editor/governance suite passed **12 scenarios**, including generated/custom slug recovery, saved-link stability, non-Latin titles, known collisions and hidden source-ID preservation. The shared control suite passed **22 checks**, including implicit date labels, keyboard controls, calendar selection and teardown. Rebuilt-bundle governance, video-editor and document-control flows passed **16 scenarios**. Generated content checks passed **6 tests** after adding asset-version URLs.

Desktop measurements confirmed the calendar button is fully inside the date input and Source version / Last verified have equal top positions and heights. At 390 px, the source fields stack, the calendar remains inside the input, and document width stays 390 px. The date selection updated correctly through the shared calendar. The source key is absent from the visible form but retained in metadata. Browser preview showed automatic title-to-slug generation; temporary changes were discarded. Screenshots: `previews/source-fields-inline-calendar.png`, `previews/source-fields-mobile.png`, and `previews/automatic-document-slug.png`.

The shared date component now has explicit button centering and independent accessible names. Field-label styles no longer override enhanced date/select wrappers. All five local pages and Confluence fragments use versioned shared asset URLs; portable previews contain the matching assets. Update any globally hosted Confluence CSS link to the matching version during rollout.

## WCS document-governance baseline

The final source suite passed **434 tests, with no failures or skips**, including the governance export tests. The rebuilt deployment bundle passed **51 application checks**: governance (5), library workflows (10), health workflows (5), compact document controls (5), workspaces (9) and entitlements (17). The shared health UI passed **22 DOM checks**. Both self-contained governance and library/health HTTP workflows passed against the loopback adapter with server-owned identities and isolated fixtures.

Coverage includes incomplete draft saves, submission metadata, exact-revision reviewer evidence, blocked unresolved wording findings, invalidation after editing, independent manager approval, the 24-calendar-month target and leap-day clamping, preservation of legacy approved snapshots, manager-only baseline rules, change-triggered cases, no-change reviews, stale decisions and reopening deadlines. Source fingerprints are opaque SHA-256 digests; digest tests include Unicode, long input and known test vectors. Reader responses omit private reviewer assessments, historical content and maintenance rationale. Reset demo correctly returns unclassified legacy samples to **Check needed**.

PDF, Word and Markdown include the selected version's governance fields and source references. Real PDF/Word generation with the pinned browser libraries was checked; rendered pages were inspected for control tables, source links and appendix pagination. Governance editor checks also verified save/recovery, safe source rows, legacy handling and Markdown output.

Browser review confirmed the expandable Governance editor, structured source fields and the shared Report a change / Record document review dialogs. At 390 px, page width remained 390 px and the change dialog fitted within 12 px gutters. Editor fields stack on mobile without horizontal overflow. Browser warnings/errors were empty. Temporary editor entries were discarded and no maintenance record was saved during visual QA. Screenshots: `previews/governance-editor-desktop.png`, `previews/governance-editor-mobile.png`, `previews/governance-change-workflow.png`, and `previews/governance-change-mobile.png`.

The five local/portable pages, five Confluence page fragments and shared assets were rebuilt. Production page IDs and authenticated workflow/health endpoints remain placeholders. The delivered mock is not a production backend; durable audit storage, native child-page publication and server-side baseline enforcement must be connected as described in [GOVERNANCE.md](./GOVERNANCE.md). Source monitoring, scheduled reminders and notification delivery are not implemented.

```sh
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs tests/governance-export.test.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/governance-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/content-health-ui.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-governance-smoke.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-library-workflows-smoke.cjs
```

The sections below retain verification history from earlier updates.

## Compact controls, aligned rules and standalone Saved items

The source suite passed **380 tests, with no failures or skips**. The rebuilt bundle passed **5 document-control checks**, **10 bookmark/library checks**, **5 health workflow checks**, **9 workspace checks** and **17 entitlement checks**. The health UI passed **16 DOM checks**. Long-history tests traversed all 67 versions and 135 audit events exactly once; a 127-event health history stayed collapsed initially and paginated five events at a time. Page/filter changes retain the selected document version and never expose restricted drafts or audit to readers.

Browser review confirmed More/Fewer control details, collapsed health history, a retained bookmark on the separate Saved items page, and working links back to the approved article. All three rule inputs had the same measured top position and height on desktop despite a wrapped middle label. At 390 px, the three fields stack with identical widths, the dialog fits inside 12 px gutters, and both the article and Saved page have no page-level horizontal overflow. The Saved table scrolls within its container. Browser warnings/errors were empty.

The new `wcspedia-saved-items-confluence-macro.html` has `pageRole: 'saved'`, uses `REPLACE_WITH_SAVED_ITEMS_PAGE_ID`, and loads the shared `wcspedia.js` attachment. It includes no stylesheet link or inline CSS because the shared CSS is provided globally. Native Confluence page creation and production services remain unconfigured. The five portable and local entry points and shared assets were rebuilt together.

Screenshots: `previews/health-rules-aligned.png`, `previews/document-control-compact.png`, `previews/saved-items-standalone.png`, and `previews/saved-items-mobile.png`.

## Bookmarks and governed content health

The full source suite passed **378 Node tests with no failures or skips**, including **20 bookmark tests**, **39 health domain/service tests**, and **6 feature lifecycle race tests**. The optional jsdom dependency was supplied. Without jsdom, the twelve editor/library DOM cases explicitly skip; the delivered browser application does not require that test dependency.

The rebuilt deployment bundle passed **7 bookmark/library application checks** and **5 health workflow application checks**. The shared health UI passed **15 DOM checks**. Existing entitlement, workspace, metrics and training-video checks passed against the bundle (17, 9, 11 and 6 respectively); the export UI passed 16 checks. The final reset-demo refinement was then rebuilt and the 7 library and 5 health application checks rerun.

Checks cover per-SOEID personal saves, current approved snapshots, removed access/deletion, storage failure, request timeouts, concurrent revisions, identity changes while loading or queued for a save, and stale asynchronous responses after navigation. Reset demo clears both new stores and restores default rules while preserving unrelated browser data.

Health verification covers manager-only rule edits using existing grants, exact approved-version and health-revision decisions, assigned-owner work, accountable resource verification, resolution blocked by remaining findings, reopening after publication or recurring findings, mandatory reasons and before/after audit. Revoking permission or publishing a new revision while a dialog is open rejects the save and preserves the explanation. Reader projections omit private health history and evidence.

The **assembled loopback HTTP smoke passed**, including real bookmark calls, rule update → start → submit → blocked resolution → corrected rule → resolution, stale decisions, native read denial, CSRF and forged-identity rejection. Document content snapshots and their approval audit remained unchanged by health actions. The mock is in-memory development infrastructure, not production authentication or durable storage.

Desktop browser review confirmed saving an article, retaining it across navigation, manager rule editing, the updated health tag, and the persisted In progress workflow. At 390 px, the document width stayed 390 px and the rules dialog fitted inside 12 px outer gutters; tables scroll inside their containers. Browser warnings/errors were empty. Screenshots are `previews/bookmarks-workspace.png`, `previews/content-health-workflow.png`, `previews/content-health-rules.png`, and `previews/content-health-mobile.png`. The browser demonstration retains one saved sample and its recorded health case; Reset demo removes them.

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs
node build.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/library-workflows-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/health-workflow-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/content-health-ui.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-library-workflows-smoke.cjs
```

Live deployments require configured, authenticated `bookmarksEndpoint` and `healthEndpoint` services. Missing services display unavailable and never fall back to local demo records. Rules run on load/refresh and relevant changes; no background schedule, message delivery, or automatic authenticated SharePoint probe is claimed. See [BOOKMARKS.md](./BOOKMARKS.md) and [CONTENT-HEALTH.md](./CONTENT-HEALTH.md).

## SharePoint training videos and download menu

The current source suite passed **313 Node tests, with no failures or skips**. The rebuilt deployment bundle passed **6 video editor scenarios**, **17 entitlement application checks**, **9 workspace checks**, and **11 metrics application checks**. The shared download component passed **16 UI lifecycle checks**. Earlier counts below are retained as verification history.

Video sits immediately after Image in both create and edit toolbars. Checks cover cursor placement, safe SharePoint iframe parsing, titled sharing-link cards, preview and Markdown round trips, reopening and removing a recording, and audit changes on save. Separate workflow coverage confirms that replacing a recording leaves the approved snapshot intact until the revised version completes review and approval. Invalid hosts, duplicate attributes and malformed recording IDs are rejected; code examples and escaped video markers stay literal during portable Markdown export. Reading time counts the visible recording title, not its URL or video duration.

Desktop browser review confirmed the article has no Review workspace link and its Download menu contains PDF, Word and Markdown file. A real `.md` download completed. Inserting a sample SharePoint embed produced the expected titled iframe and Open in SharePoint link. The editor and video dialog fit a 390 px viewport without page-level horizontal overflow. Test editor changes were discarded. Screenshots: `previews/download-menu-markdown.png`, `previews/sharepoint-video-dialog.png`, and `previews/sharepoint-video-mobile.png`.

PDF, Word and portable Markdown represent recordings as clickable links. A real tenant recording was not supplied, so authenticated playback was **not** verified. SharePoint permissions, sign-in and the host site's frame/CSP policy still govern playback; embedding grants no additional access. See [VIDEOS.md](./VIDEOS.md) for supported inputs and production checks.

## Editing, shared tables and document exports

The updated suite passed **292 Node tests, with no failures or skips** using the optional developer-only jsdom dependency. The deployed bundle also passed **17 entitlement application checks**, **9 workspace checks**, and **11 metrics application checks**. Eight new export UI lifecycle checks cover exact snapshot selection, PDF/Word-only menu entries, keyboard navigation, escaped failure messages, retry, cancellation and late completion after navigation. Shared-table and suggestion DOM checks passed (11 and 21 respectively).

Published Edit opens the full editor directly. Saving creates one working version with the supplied changes, stable document/page keys, actor SOEID and before/after audit values. The approved snapshot remains available to readers. Cancel creates no revision. A loopback HTTP check exercised the atomic `revise.changes` command and idempotent replay. Permission revocation is checked again at save/delete, and a local storage failure preserves the editor and original revision for a safe retry.

The browser review confirmed direct editor entry, shared My workspace tables, PDF and Word downloads, and a 390px mobile page without page-level horizontal overflow. Wide tables scroll inside their own containers; empty/loading/error messages fit the visible frame. Screenshot evidence is saved under `previews/`.

Real export-generation checks use the exact pinned PDF and Word browser libraries. PDF text is selectable; Word paragraphs and tables are native editable OOXML. Cover fields, reviewer/approver SOEIDs, exact version and revision, source links, lists, tables, embedded images, repeated table headers and footer page numbers were inspected. Baseline exports are two pages; longer stress samples exercise pagination in both formats. All pages were rendered using bundled Poppler and LibreOffice and visually checked. Example files are in `exports/`, with cover previews in `previews/export-pdf-cover.png` and `previews/export-word-cover.png`.

Browser testing caught and fixed the Word CDN MIME issue: the final pinned URL uses `docx@9.5.1/dist/index.iife.js`, served as JavaScript, rather than the CJS distribution. Both formats downloaded through the actual application. Production still requires the configured Confluence assets, authenticated permissions and workflow endpoints; no production integration is claimed by these tests.

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/document-export-ui.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/shared-tables-dom.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/suggestions-dom.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/entitlements-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs
```

The sections below retain the earlier verification history for the other modules.

## Reading-time and view-count verification

The updated source suite passed **266 Node tests, with no failures or skips**. The new **11 metrics application scenarios passed against both source modules and the deployment bundle** (22 executions). Existing workspace checks and the **13 entitlement application checks** also passed against the updated bundle.

Coverage includes canonical Markdown precedence, Unicode words, images and safe media, exact-time sorting before rounding, published snapshots, all four new sort controls, filter preservation, unknown counts last, two-second visible dwell, hidden/rapid-exit cancellation, draft/history/review exclusions, same-person deduplication, separate people, stale-load/late-record races, new publication zero counts, storage failure, bounded idempotent retries, and unchanged document revisions. The independent local and server counter tests cover the exact 30-minute boundary and concurrent calls.

The self-contained **metrics HTTP smoke passed** against its own loopback mock. It checks authenticated/readable published documents, real zero counts, strict acknowledgment validation, CSRF and payload spoof rejection, stale snapshots, idempotent replay, and preservation of document/audit/attachment revisions. This does not verify a production metrics service; its endpoint remains intentionally empty in deployment macros.

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs --source
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-metrics-smoke.cjs
```

Desktop browser review confirmed the article counter advancing from 0 to 1 demo view after visible reading, the same total on its result card, and its placement first under Most viewed. At 390 px, all seven sort options remain accessible, the reading/view metadata wraps inside the cards, and document width equals viewport width. No browser warnings or errors were recorded. Screenshots: `previews/article-reading-views.png`, `previews/reading-views-sorting.png`, and `previews/reading-views-mobile.png`. See [METRICS.md](./METRICS.md) for the algorithm and service boundary.

## Current entitlement and lifecycle verification

The preceding entitlement/lifecycle update passed **225 Node tests with no skips**, **20 shared-control DOM checks**, **21 suggestion DOM checks**, and **7 standalone Add document widget checks**. The **13 entitlement/application scenarios plus 6 workspace scenarios** passed against both source modules and the deployment bundle (38 executions).

Coverage includes 223-document and 225-entitlement-record pagination, fractional page normalization, preserved filters, global widget routing across all four pages, view-only/denied/admin access, scoped add/edit/revoke, last-administrator protection, before/after access history, stable document keys, exact-key deletion, revocation during an open editor/confirmation, and dirty navigation. Reader output is verified to exclude entitlement policy and private workflow history.

All **three loopback HTTP smoke tests passed** after the final adapter changes: rich media authoring, suggestions, and entitlement/native-deletion lifecycle. The latter exercises session SOEID, central grants plus native permissions, independent page/policy/content revisions, CSRF headers, idempotency, forbidden target/identity spoofing, policy journal/table agreement, and page trash with separately retained deletion evidence. These are mock integration tests, not production verification.

Additional commands (developer-only jsdom is required):

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/add-document-widget.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/entitlements-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
# Start a fresh Jordan mock on 4175, then:
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-entitlements-smoke.cjs
```

Desktop browser review confirmed the standalone widget, typed editor route, themed denied state, entitlement form, saved access row, and actor/reason/before-after journal. At 390 px, the entitlement table scrolls inside its own container; the document width remains 390 px. A mobile overflow caused by the screen-reader-only table heading was corrected by positioning that scroll container. Screenshots: `previews/entitlements-desktop.png`, `entitlements-form.png`, `entitlements-audit.png`, `entitlements-mobile.png`, `entitlements-not-permitted.png`, and `add-document-widget.png`. The sample browser grant was removed by Reset demo after checking it.

The following sections retain prior checks for unchanged authoring and discovery features; current totals above supersede historical baseline counts.

## Reproduce the automated checks

From the `wcspedia` directory:

```sh
node build.cjs
node --test *.test.cjs
```

The full workflow baseline run passed **189 Node tests**, including six editor DOM lifecycle tests when the optional jsdom dependency is available. Run with `NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs` for the complete suite; otherwise those six DOM tests are explicitly skipped. Coverage includes:

- Separate-page routing, same-origin destination validation, default workspace routes and native Confluence page-query preservation.
- Suggestion request validation, storage failures, per-user queues, assigned-manager triage, exact-revision decisions, idempotency, transport errors and strict server confirmations.
- Assignment-scoped chart aggregation, six-week UTC buckets, duplicate-event handling, accessible fallback tables and configurable pinned Highcharts sources.
- Review/approval assignments, prevention of self-approval, exact-revision decisions, stale writes, locked submitted content and preservation of the earlier approved version.
- Audit reconstruction from before/after events and agreement between embedded, full JSON and published reader datasets.
- Canonical Markdown and section projections; safe rendering of links, underline, images, tables, code, nested lists and resource cards; media validation and portable Markdown export/import.
- Versioned topics, processes, regions, inline assets and attachments across create, edit, review, published snapshots and audit events.
- Published-only discovery, taxonomy filters, related-content ranking, literal search and escaped/scoped CQL.
- Same-origin Confluence requests, attachment-version pinning, stable user identity mapping, workspace projections, command allowlists, idempotency and uncertain-write errors.
- Manager-only category creation, duplicate/stale category rejection, taxonomy audit events and removal of private audit data from reader projections.

The optional shared-control DOM harness passed **20 checks** for dropdown keyboard navigation, disabled and dynamic options, form serialization, custom calendars and date validation, popup dismissal, dialog focus/busy handling and safe teardown. It uses a developer-only dependency; the delivered application does not install or load jsdom.

```sh
npm install --prefix /tmp/wcspedia-ui-tests jsdom@26.1.0 --no-audit --no-fund
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/ui-dom.cjs
```

The suggestion DOM harness passed **21 checks** for selection/right-click handling, editable/outside exclusions, exact quote anchors, themed dialogs, required comments, XSS-safe queues, dispositions, unconfigured live delivery, busy teardown and late-response cleanup. The deployment-bundle harness passed **6 checks** against the three generated HTML files: dependency loading, current-version status filters, stage filters, chart/widget cleanup, dirty cross-page navigation including the search shortcut, and draft save → reviewer-page reload.

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/suggestions-dom.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/workspace-app.cjs
```

For the API media smoke check, start the local mock in a separate terminal:

```sh
WCS_MOCK_ACTOR=alex node mock-confluence.cjs
```

Then run:

```sh
node tests/api-media-smoke.cjs
```

This passed **create → reload → edit → submit** with inline image data, a Markdown attachment, a table, underline and topic/process/region metadata preserved. The submitted draft remained unpublished and author editing became unavailable. The check adds a temporary sample document to the mock's in-memory data; stopping the server removes it.

The separate suggestion HTTP smoke passed **create → idempotent retry → list → resolve → decision retry**. It rejected stale decisions, conflicting retry payloads, forged document assignments and foreign source URLs. The actor came from the mock server session; the document and its audit were unchanged byte for byte. Run the default Jordan mock on a separate port:

```sh
WCS_MOCK_PORT=4175 node mock-confluence.cjs
# In another terminal:
node tests/api-suggestions-smoke.cjs
```

This is an actual loopback HTTP test of the adapter contract, not verification of production authentication, notifications or durable storage.

The supplied fixtures contain 24 documents, seven content types and 19 approved reader snapshots. These are sample records, not production inventory counts. Use fresh command output for test totals after subsequent changes.

## Latest layout refinement

The shared assets and all three local pages, portable previews and Confluence macros were rebuilt after the landing/explore changes. JavaScript syntax validation and the **6 existing deployment-bundle integration checks** passed again. The broader workflow baseline below was not rerun for this visual refinement.

The landing page omits the demo/identity strip and both workspace buttons. The hero contains the main search field; business-area browsing follows it, with content-type navigation retained on the search page. One shared `page-panel` rule now controls the colored introductions on home, search, Explore/results, topics, author/reviewer workspaces, individual review and category pages. Desktop panels have 24 px white gutters and 24 px corners; at 390 px they use 10 px gutters and 18 px corners. Existing white article reading headers remain within their content container.

Browser checks at 1280 px and 390 px confirmed no horizontal overflow on the changed landing/results views. Training opened a filtered result, a popular search preserved its query, and Explore search opened the dedicated search page. Autocomplete extended beyond the rounded hero without clipping. The topic page and separate author workspace retained the same panel treatment. Console warnings/errors were empty. An independent source review found no conflicting panel rules or changes to editor focus-mode selectors.

Current screenshots: `previews/landing-clean-citi.png`, `previews/explore-rounded-citi.png`, `previews/landing-clean-mobile.png` and `previews/explore-rounded-mobile.png`.

## Browser checks completed

| Scenario | Observed result |
| --- | --- |
| Separate workspace pages | The author and reviewer HTML files use their own initial views and the same shared assets. Their destinations are configured for native Confluence navigation; landing and bottom workspace buttons are absent. |
| Contained page headings | A shared rounded panel preserves outer white gutters across discovery and workspace introductions. The latest landing/results checks and earlier workspace checks fitted 390 px without horizontal overflow. |
| Real Highcharts rendering | Two actual Highcharts SVGs loaded from pinned jsDelivr 13.1.0. Jordan’s sample data showed 3 pending items (1 review, 2 approvals), 21 reviewed revisions and 19 approved revisions over six weeks. Mobile charts fitted 316 px containers. |
| Chart fallback | The original Highcharts CDN returned 403; semantic tables remained visible. The configured CDN was changed to the same pinned official npm package through jsDelivr, then actual charts rendered. No alternate network retry is made automatically. |
| Selected-text correction | A paragraph selected by drag and right-click opened the Citi action and a form with the full quote, section title, version 2 and revision 2. Local save appeared in the reviewer queue. |
| Suggestion disposition | A manager dismissed the sample request with a reason; it left the open queue and retained its own history. No document revision was edited or approved. |
| Rich Blog authoring | Alex created a Blog with an inline image, cover, supporting Markdown attachment and topic/process/region tags. The saved draft retained its content and opened in the separate review workspace. |
| Portable Markdown round trip | A 549,722-character exported Markdown copy was pasted back into the editor. Two images, a table, underline and the Markdown file attachment were restored. Saving succeeded with canonical `attachment:` references rather than embedded data URLs in the body. |
| Unsaved draft recovery | Reloading the page offered the shared Citi recovery dialog, and restoring it recovered the unsaved draft in the same browser tab. |
| Focus mode | At 1280 × 800, the editor main column spans 1280 px and the rich body spans 1222 px with equal margins. At 390 × 844, expanded Markdown spans 360 px, has 522 px usable height, retains the exit control and has no horizontal overflow. Unsaved-change cancellation uses the Citi dialog above focus mode. |
| Submit, review and approve | Alex submitted the draft. Jordan completed review and then approved it as separate recorded actions, using the Citi-styled next-review calendar. |
| Reader access and prior versions | Approved content was readable without private audit controls. An earlier approved version remained available while a replacement draft was pending. These are local presentation checks; production authorization remains a server requirement. |
| Copy Markdown | The selected document's portable Markdown copied successfully, including its media/resource links. |
| Related content | Approved related articles/trainings displayed cover-image cards and matching taxonomy context. |
| Taxonomy discovery | Topic, process and region filters narrowed the search results. |
| Back to top | The sticky bottom control appeared after scrolling and returned the reader to the top. |
| Mobile search | Search and taxonomy controls fitted a 390 px viewport without horizontal overflow. |
| Mobile editor | The full toolbar wrapped cleanly at 390 px; document and editor content widths showed no horizontal overflow. |
| Categories and Reports | A manager added a business area; its taxonomy revision and category persisted after reload, and a Report could use it. |
| Confluence authoring path | The loopback API accepted creation and edits, reloaded saved data and locked the submitted revision. The media smoke check also verified all new content fields across this boundary. |

The mock runs at `http://127.0.0.1:4174/mock-live.html`. Its default identity is Jordan; `WCS_MOCK_ACTOR=alex` fixes it as Alex. It retains data only for the lifetime of the process and does not provide production authentication or durable storage.

New screenshots in `previews/` include `my-workspace-updated.png`, `reviewer-workspace-updated.png`, `reviewer-charts.png`, `selected-text-suggestion.png`, `editor-expanded-fixed.png`, `editor-expanded-mobile.png`, `my-workspace-mobile.png` and `reviewer-workspace-mobile.png`. Earlier rich-content screenshots include `rich-editor-desktop.jpg`, `rich-editor-mobile.jpg`, `rich-article.jpg`, `citi-approval-calendar.jpg`, `related-cover-cards.jpg` and `mobile-taxonomy-search.jpg`. Existing reviewer, audit and category screenshots document the connected workflow. Browser console checks reported no warnings or errors. Earlier temporary browser test documents were removed by restoring the sample dataset. The current expansion check discarded its unsaved draft; the suggestion test remains as a dismissed local demonstration request with its history.

## Production boundaries

- The four application page IDs, the distinct native policy-table page ID, native links, and trusted service endpoints remain placeholders. Live suggestion delivery and notification routing require the trusted service; local queues are not shared production records.
- Highcharts loads only on reviewer overview pages, via pinned CDN URLs in the preview. Replace both Core and accessibility URLs with approved same-origin minified assets in Citi; chart data is processed in the page and no export service is used.
- Configure the WCSpedia parent page, stable identity mappings and trusted workspace/workflow endpoints before enabling live authoring and decisions. The shipped macro retains the requested page-ID placeholder.
- The trusted service must authenticate every action, enforce assignments and revision checks, commit decisions with durable audit events, and deduplicate retries. Browser role controls and JSON attachment history are not an immutable approval service.
- Draft JSON belongs in the restricted workflow store. The reader attachment contains approved snapshots only, with document and taxonomy audit arrays removed.
- Native Confluence editor round trips, controlled publication to native child pages and production media uploads remain integration requirements; the prototype and loopback mock do not deploy these services.
- Local images and files use bounded data URLs in the version snapshot. Production must validate media and replace these with permitted, version-pinned attachments before review. Mutable external resources must not change the reviewed evidence after a decision.
- Markdown import accepts up to 8,388,608 input characters, then extracts embedded media into asset/file records. The resulting canonical body remains limited to 200,000 characters. Individual image/file limits and the JSON response limit also apply.
- Unsaved recovery uses this browser tab's session storage. It is neither a saved workflow revision nor a Confluence backup; storage quota or browser clearing can remove it.
- Browser/operating-system file selection and clipboard permissions remain browser-owned. Application dialogs, dropdowns, calendars, tooltips and validation use the shared Citi component.
- Existing SharePoint files can be linked by their reviewed version. The package does not create, update or approve SharePoint files.

See [CONFLUENCE-WORKFLOW.md](./CONFLUENCE-WORKFLOW.md) for the storage decision, native page mapping and service contract.

## WCSpedia branding refinement — 16 October 2026

- Supplied PNG copied byte-for-byte to `assets/wcspedia-logo.png`. Landing and search share the same brand/hero component and the existing search implementation. The original image is displayed uncropped.
- 72 focused tests passed across `search.test.cjs`, `discovery.test.cjs`, `tests/branding-app.cjs` and `tests/loading-overlay-app.cjs`; 24 existing workspace, library and document-control application checks also passed. The seven branding checks were rerun after final responsive/copy refinements and passed.
- Branding tests cover home navigation, missing-logo fallback, attribute escaping, query submission, type navigation, keyboard focus, recent searches, all local/portable assets and both Confluence installation variants.
- Browser inspection at 1280px, 390px and 320px confirmed logo rendering and no horizontal page overflow. Search document-type labels fit/wrap within their links, and suggestions still appear for a typed query. No console warnings/errors were reported.
- Final desktop and phone screenshots are `previews/brand-landing-desktop.png`, `previews/brand-landing-mobile.png`, `previews/brand-search-desktop.png` and `previews/brand-search-mobile.png`. `previews/brand-landing.png` is the desktop viewport preview.
- Rebuilt shared assets, portable previews and Confluence fragments. Live Confluence installation still requires the configured page IDs and attachment upload described in `BRANDING.md`; this change was verified locally.

## Landing simplification — 16 October 2026

Removed the redundant homepage “Browse by content type” section and its unused desktop/mobile CSS. The hero now leads directly into the eight business-area cards. Search-page document types and results filters remain available. Rebuilt all shared assets, macros and portable previews. All seven existing branding/search integration checks passed. Desktop and 390px mobile inspection confirmed the updated section order and no horizontal overflow. The refreshed Confluence package includes the current landing previews.

## Search shortcut cleanup — 16 October 2026

Removed the complete popular-search row and Explore search link from the shared landing/search hero, including the unused renderer, parameter and styles. Search submission, autocomplete, business-area navigation and result filters remain available. Rebuilt shared attachments, macros and portable previews; the existing branding/search integration checks passed.


## Single landing page — 16 October 2026

Removed the redundant search introduction, its recent-search storage/actions, and its dedicated styles. Old `#/search` links now resolve to the main landing page. Ctrl/Cmd+K returns to the same landing search, including from separately hosted workspaces, while keeping the unsaved-editor leave dialog. Search results retain query, business-area and content-type filters. Regenerated shared attachments, macros and portable previews.

Validation: navigation and branding suites passed, along with all nine existing workspace integration checks. Browser verification confirmed that the old search URL resolves to the main landing page. Search focus is applied after the loading overlay releases the page.


## MDX document and hosted-template downloads — 16 October 2026

Added MDX file and Download MDX template directly after Markdown in the existing Download menu. MDX export selects the displayed revision, preserves source provenance and media tokens, resolves resource references, and excludes approval/audit authority. Cover/highlights/unlinked files are retained as body content; this is authoring interchange, not a complete editor-state backup. The hosted template is supplied in confluence-upload/attachments and derives its URL from the existing assets-page setting.

Validation: 124 focused content/import/export/native-rendering/application/delivery tests and 31 export-menu lifecycle checks passed. Real browser downloads of both the document MDX and template succeeded; the downloaded document parsed through normalizeImport and the template matched the source byte for byte. The screenshot is previews/mdx-download-menu.jpg. Local verification only; the internal Confluence instance has not been deployed or accessed.

Native tables, code macros and staged attachment images were verified in the storage renderer. SharePoint recordings and generic embedded resources publish as links on native pages; arbitrary iframe/JSX imports remain unsupported. Template retrieval is same-origin, cancellable and bounded to 12 seconds, validates the frontmatter format, and reports access/404/login-page errors without saving invalid files. No CQL request or PDF/Word library load is needed for these downloads. The global stylesheet and existing header are unchanged.

## Confluence page scrolling and shared notifications — 16 October 2026

Removed the fixed-height, scrolling application frame across home, My workspace, Reviewer workspace, Saved items and Entitlements. The application now grows in normal Confluence document flow, uses the available host width without an application max-width cap, and aligns page sections with consistent gutters. Back to top uses a viewport portal, follows the host's actual scroll container, and hides while a dialog is open. Delivered macro fragments contain no document wrappers or meta tags.

Added the single header-loaded `wcspedia-notifications.js` runtime, with styles merged into the existing global CSS. Page modules report action outcomes using dismissible animated green/red/amber/white notifications. Feedback is plain text, duplicate script loading is harmless, and saved-draft feedback can survive navigation. The custom search clear control remains neutral under conflicting host button styles, using scoped important overrides.

Validation includes focused notification, action feedback, layout, search, saved-items and hosted-package tests. A local HTTP fixture loads the actual generated landing JS pair and global stylesheet under intentionally conflicting host styles. Browser checks at 1600px and 390px confirmed uncapped available width, no horizontal page overflow, no inner application vertical scroller, working neutral Clear search, a fixed Back to top outside the macro, and four notification colors with working dismiss controls. No browser console errors were reported. This verifies local generated files; the internal Confluence server has not been accessed or deployed.

## Header, landing-only loading and configured upload — 16 October 2026

Build `1a7583f0d149` removes the visible disabled/error header widget in pending, denied, missing-configuration and failed-access states. The Add document button uses a 36px height and 8px radius with scoped important rules. Its host belongs last in the existing header flex action row for right alignment; the runtime does not rearrange native header controls. Access remains rechecked before opening and selection, with deadlines/cancellation. Delayed checks respect Escape and outside focus/pointer interaction; canceled navigation restores focus only when a dialog or newer interaction has not taken it.

The branded loading overlay is limited to the resolved home landing route. Other pages retain inline loading, failure and timeout behavior without locking focus or scrolling. Reviewer tabs retain Review queue and Content health and omit Saved; standalone Saved and document bookmarking remain available.

Validation: 70 Node runner tests passed (including the custom widget, hosted-navigation and library-workflow suites); all 14 delivered JS attachments passed syntax checks. Configured packaging tests execute all five inline configurations, check every supplied page/area ID, preserve runtime and JSON bytes/cache revisions, verify manifests/ZIP checksums, and reject unsafe output changes. No page-ID placeholders remain in the configured HTML. The upload ZIP contains 36 runtime/instruction/template files and no development `.cjs` or server files.

Browser inspection used the actual generated header pair and shared stylesheet with synthetic read-only local Confluence responses. At 1280px, the button measured 36px high with an 8px radius, retained its neutral colors against conflicting host important rules, aligned 24px from the header edge, and caused no horizontal overflow. Menu opening/Escape worked with focus restoration. Denied access and missing services produced an empty hidden slot with no header error text. The final browser console had no errors. Screenshot: `previews/header-cleanup-verified.png`; reproducible local fixture: `previews/header-cleanup-check-server.cjs`.

`WCSpedia-configured-upload.zip` and `confluence-ready/` contain space `wcspedia`, attachment page `3962195316`, all five interface page IDs, working root `3961735834`, and the eight business-area IDs supplied in the screenshot. Service URLs were not supplied and remain empty; preserve real deployed URLs before replacing installed macros. A widget with missing workflow/workspace services intentionally remains hidden. Keep live entitlement/library JSON instead of overwriting it with first-install seeds. The internal Confluence instance was not accessed or deployed.

Shared CSS SHA-256: `83c3e2ed50791a2b6222e2195781b88c67afca89a1df9a7b67b2fee9293ab7ab`.

## Native child discovery and faster area navigation — 17 October 2026

Build `61c312d57fe1` supports the Confluence Search response shapes `content` and `entity`, including `totalCount`. If expanded page space/ancestors are missing, one bounded Content query repeats the identical root/space/filter CQL and validates its results; explicit conflicting scope metadata still fails. The compatible transport is remembered for subsequent queries. No native document body expansion, per-hit fetch or whole-space/server fallback was added.

Landing discovery verifies the root once, validates the eight area mappings in one bounded query, and loads latest documents independently of each area's first six rows. The normal eight-area discovery path uses 11 API requests instead of 18, excluding bootstrap. Each settled area result is reused when navigating into that area. One failed area does not erase other areas or latest documents. Progressive updates preserve focus in unchanged latest-document cards.

Read-only discovery startup skips private workspace, entitlement policy and per-document write-right requests. Managed routes perform full hydration before rendering their controls. Abort signals propagate through session loading; a canceled older workspace load cannot overwrite a newer read-only session. Exact completed search/filter results are kept only in page memory for 30 seconds, capped at 24 entries, with identity-sensitive keys and invalidation on session refresh, mutations and page exit. Selected area/topic hover/focus may prefetch; foreground navigation takes ownership and cancels obsolete work.

Validation: 163 adapter/search tests, 78 generated UI/authorization/package tests, and 22 generated-upload tests passed, plus all 16 search application checks. Tests include documented entity/totalCount responses, classic content responses, missing expansion fallback, nested unlabelled children, exact root/space exclusions, continuation transport, progressive failure isolation, TTL/invalidation, cancellation and authorization gating. All 14 delivered JS files passed syntax checks. The global CSS hash above is unchanged.

Browser verification loaded the actual configured JS pair through a loopback HTTP fixture with synthetic native nested documents and 250 ms per API response. All eight areas displayed seven documents, latest cards displayed native children, and a warmed area click rendered six results in 12 ms without another search request. This is a local warm-cache measurement, not an internal-server latency claim. No browser warnings/errors were reported. Fixture: `previews/native-discovery-check-server.cjs`; screenshot: `previews/native-discovery-verified.png`.

The configured ZIP contains 36 runtime/instruction/template files, the supplied WCSpedia page IDs, and no development or server files. Keep live JSON and deployed service endpoints when uploading. ZIP SHA-256: `8766f94408be506d6466e1ad291ac046f4797e6c31c23e01734b8461794bfba7`. The internal Confluence instance was not accessed or changed; uncached search remains dependent on native permissions, indexing and server response time.


## Citi-blue Add document before native Create — 17 October 2026

Build `cc5c8334a371` places the shared Add document host immediately before the native Create group. The native quick-create and template controls remain together. Explicit custom anchors are supported; hidden, editable, dialog and application content are excluded. Late header controls use a header-only MutationObserver with an eight-second deadline and cleanup on success/page exit. Missing targets retain the supplied slot. No polling or additional network calls were added.

The widget uses Citi blue #255be3, white text/icons, 36px height, 8px corners, and scoped important rules for hover, pressed and keyboard-focus states. Permission denial, unavailable integration and load errors still leave an empty hidden host.

Validation: all 42 source/generated-widget checks and 33 configured-package, hosted-page and HTTP-discovery tests passed. Browser verification loaded the generated configured pair and global CSS under conflicting host styles, confirmed Add document immediately before Create, working menu opening, Tab advancing to native Create, and complete widget hiding for denied access. Screenshot: `previews/header-blue-verified.png`. Rebuilt upload ZIPs and configured HTML/cache revisions. The internal Confluence instance was not accessed or deployed. Preserve existing deployed service URLs and live JSON when upgrading.
