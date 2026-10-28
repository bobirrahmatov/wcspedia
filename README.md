**Installation files:** open [ready/](ready/README.md) for upload attachments, page HTML macros, the shared navBar helper and exact destination page IDs. Regenerate with `python3 prepare-ready.py` after rebuilding the configured package.

**PAL styling update (2026-10-28):** the native reader sidebar now reuses Lending Analytics SVGs, navigation spacing and font resolution. Space tools and Configure sidebar are hidden in reader mode. Update the attachments and existing navBar helper from `ready/`; preserve the host Citi theme and live JSON. Expanded/collapsed and light/dark states were checked using the local native-tree fixture; the internal Confluence instance still needs a deployment check.


**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

# WCSpedia · Wealth Credit Services knowledge base

**Confirmed deployment constraint (2026-10-17): the department has WCSpedia space access only and cannot deploy a custom backend.** The existing header uses `{include:wcspedia:navBar}`; fonts and theme come from Look and Feel CSS. Preserve that setup and the current editor/design. Read [the space-only boundary and migration status](./CONFLUENCE-SPACE-ONLY.md) first. The service-dependent workflow described below is existing implementation/reference, **not an installable solution for this department**. The native-session replacement is implemented in the current configured package; read the native setup guide and leave legacy service URLs empty.

**The established WCSpedia design is the default.** The landing page, search, document details, editor, workspaces, bookmarks, health checks and entitlement screens retain their shared Citi styling and existing components. Host the plain CSS and JavaScript as Confluence attachments and load them in HTML macros, using the same pattern as the supplied Covenants example. The native Confluence sidebar remains the navigation host.

Live landing, search and Insights use native Confluence CQL/REST inside the verified WCSpedia root and space. They do not wait for the published-document JSON. Results open real native page IDs; Confluence owns their content, history, permissions and comments. The configured upload package already includes the supplied page IDs. Internal server access and live deployment remain unverified.

The custom editor and review workspaces use a separate managed workflow: approved JSON snapshots and a protected service journal are still used for those views, while the publisher creates restricted working pages and approved child pages beneath the business areas or Insights. This backend requires real authenticated service endpoints; uploading HTML/JS and JSON does not deploy it. See [the current data map](./CONFLUENCE-WORKFLOW.md#what-the-json-files-do) and [publication integration](./NATIVE-PUBLICATION.md).

**Add document:** retain the existing editor and custom approvals. The server publisher already implements restricted draft pages and approved native reader pages, but the configured package needs deployed `workspaceEndpoint` and `workflowEndpoint` URLs to enable that managed flow. Page IDs and uploaded grants alone cannot enable server execution. See [the complete Add document flow](./CONFLUENCE-WORKFLOW.md#existing-add-document-and-approval-flow).

**JSON and size:** `entitlements.json` is application access policy; `wcspedia-published.json` is a compatibility projection for managed views; private workflow/audit and personal services are separate. Native comments are not stored in a public aggregate JSON. Analytics JSON is an explicit download. The Confluence server permits **10 MB per attachment**: upload the extracted files individually, preserve live JSON, and keep document bodies/media in native pages and document-specific attachments as the library grows. JSON API responses are transport, not proof that an attachment is used.

**Initial access/data:** [DATA-STARTERS.md](./DATA-STARTERS.md) and **WCSpedia-data-starters.zip** contain the requested BR47149 administrator/Manager bootstrap, entitlements.json attachment, shared workspace seed and reader JSON. These are first-install files, not replacements for existing data. New installations read entitlements.json; bookmarks, rules and audit persistence require the configured trusted services. Do not deploy the root demo grants. No interface files or styles change for this data kit.

**Native page appearance:** [PAGE-STYLE-FLAGS.md](./PAGE-STYLE-FLAGS.md) and **WCSpedia-page-style-flags.zip** supply a small script for the existing shared header. Only explicitly marked child document pages use the existing Citi theme to hide the native title, actions, comments and footer on page views. The six interface pages are excluded; the updated native publisher adds an Anchor marker and an in-content title to newly written document bodies. Native editor controls are excluded. Installing the header helper does not deploy the server publisher or rewrite existing documents.

The separate `native-confluence/` interface remains an optional development reference, with output isolated under `experimental-native/`. Do not substitute it for the root macros or shared assets. This release does not switch users to that editor or automatically migrate legacy native pages.

Governance metadata, exact-revision reviewer checks and change-triggered maintenance now use the shared workflow and health services. Other NHD/BOD documents use a 24-calendar-month business review target, distinct from a formal-policy mandatory cycle. See [GOVERNANCE.md](./GOVERNANCE.md) for the schema, migration, permissions and Confluence service upgrade.

**MDX authoring and migration:** [MDX-IMPORT.md](./MDX-IMPORT.md) defines the flat `wcspedia-mdx-v1` metadata block, original-date handling, supported content/media, and an agent generation prompt. Use [the complete MDX template](./templates/wcspedia-document.mdx) or [the metadata block](./templates/wcspedia-metadata.yaml). Upload `confluence-upload/attachments/wcspedia-document.mdx` to the shared `attachmentPageId` to serve the document Download menu's template option. Document downloads also include an **MDX file** option. Source dates remain distinct from Confluence history; Updated year still uses native CQL `lastmodified`.
A content-only workflow application for job aids, guides, blogs, training, reports, references and knowledge sharing. Historical Procedure records remain available for classification review. Authoring, landing, search cards, content details, workspaces, versions and audit trail use one shared Citi-aligned stylesheet. There is no application header or footer, Tailwind CDN or runtime package installation. The pinned Markdown parser and its MIT license are bundled locally. Reviewer charts optionally load pinned Highcharts scripts through jsDelivr. PDF and Word exports load pinned pdfmake and docx libraries on demand. All three can use approved attachment-hosted JavaScript in production; application CSS, fonts and the editor stay local.

The design follows [Citi Wealth](https://www.citigroup.com/global/businesses/wealth), the [Citi press-release listing](https://www.citigroup.com/global/news/press-release) and the [Citi Insights article layout](https://www.citigroup.com/global/insights/ongoing-developments-in-financial-services-regulation-in-the-eu-and-uk-part-ii). Content and people in the included JSON are illustrative. The application has a working Confluence client; it is not connected to a live WCSpedia page until its configuration is completed.

The supplied library contains 24 sample documents across seven content types, with 19 approved reader versions and eight initial business areas. Managers with central creation entitlement and native create permission can add business areas through the application.

In Confluence, landing document counts and latest cards now come from CQL over the real WCSpedia page tree, independently of JSON document snapshots. Nested unlabelled pages are included; interface and working containers are excluded. Each native card opens its page ID and shows when it was updated. Configure the eight business-area parent IDs in the page macro; demo examples are not created automatically on the server. See the current [upload instructions](./confluence-upload/README.md).

Search excludes the configured landing/interface, assets, permissions and business-area parent page IDs, while retaining their document descendants. Only the restricted working branch and explicitly excluded administrative branches remove descendants. Custom header/style pages can be added to `search.excludePageIds` in the inline HTML settings. Autocomplete shares the first six-result Content Search request with submitted search and displays four suggestions; matching requests and short-lived page-memory results are reused. Default search requests do not expand page bodies. Snippets, when supplied by the selected transport, suppress HTML/JS/CSS source, and a bounded deadline offers Retry instead of an indefinite loading state. Actual document text must exist in native child-page bodies for CQL to index it; runtime text loaded from JavaScript attachments is not made searchable by this change. Existing design and CSS are unchanged. Follow [the search update instructions](./confluence-upload/README.md#search-repair-and-exclusions).

The single landing page displays the supplied WCSpedia logo and a readable wordmark. Upload `assets/wcspedia-logo.png` with the shared attachments and use the generated `brandLogoUrl` setting. [BRANDING.md](./BRANDING.md) covers the asset path, offline previews, cache updates and design references.

## Files to use

For the current Confluence installation, use **[confluence-ready/README.md](./confluence-ready/README.md)** and **[WCSpedia-configured-upload.zip](./WCSpedia-configured-upload.zip)**. Each of the six pages has its own configured HTML macro and matching logic/HTMLPage JS pair; one global CSS inherits the existing header's fonts. The optional [header Add document macro](./confluence-upload/html/wcspedia-header-widget.html) has a separate isolated JS pair and its own inline settings. The root-level files below also include local previews and earlier installation options.

For just the existing header, use **[WCSpedia-header-widget.zip](./WCSpedia-header-widget.zip)** or the three individual files in **[confluence-header-widget/README.md](./confluence-header-widget/README.md)**. They use the already-global CSS and their own widget configuration, with fresh permission checks and timeout/retry recovery.

Live landing and native search now become interactive as soon as the authorized page initializes; independent bookmarks/health requests continue in the background. Their completion preserves search input, focus and results. Approved projection and preliminary access reads also run concurrently. These remove avoidable waits, but Confluence indexing, network and server response time still determine native result latency. There is no artificial 12-second wait; the deadline only stops stalled requests.

All six interfaces use a rounded frame with aligned introduction/content widths. Content grows with the Confluence page, which owns vertical scrolling; there is no second vertical scroll pane inside WCSpedia. Wide tables may scroll horizontally on small screens. Scoped layout rules use `!important` where the host theme otherwise overrides them. Shared dialogs and suggestion controls isolate handled actions from Confluence's delegated shortcuts.

**Suggestions need a deployed endpoint.** A shared JSON file can hold requests by document ID, version and request ID, but a trusted service must serialize updates, resolve the signed-in user and enforce visibility/manager decisions. Uploading a JSON attachment alone does not enable Send. The current unconnected state offers Copy request and preserves entered text. Follow [the shared JSON deployment steps](./CONFLUENCE-WORKFLOW.md#using-one-json-file-for-suggestions).

| File | Purpose |
| --- | --- |
| [wcspedia-local.html](./wcspedia-local.html) | Main library entry point; loads the shared CSS, JavaScript and JSON files. |
| [wcspedia-my-workspace.html](./wcspedia-my-workspace.html) | Separate author workspace for drafts, submissions and owned documents. |
| [wcspedia-reviewer-workspace.html](./wcspedia-reviewer-workspace.html) | Separate reviewer workspace with assigned decisions and activity charts. |
| [wcspedia-saved-items.html](./wcspedia-saved-items.html) | Standalone personal Saved items page; opens the current approved document from the shared library. |
| [wcspedia-entitlements.html](./wcspedia-entitlements.html) | Separate SOEID entitlement directory with permission-controlled administration and audit history. |
| [add-document-widget-confluence-macro.html](./add-document-widget-confluence-macro.html) | Standalone global-navigation widget; uses its own JS/CSS and the shared access model. |
| [ENTITLEMENTS.md](./ENTITLEMENTS.md) | Central access model, native permissions, identity, service contracts and bootstrap instructions. |
| [ADD-DOCUMENT-WIDGET.md](./ADD-DOCUMENT-WIDGET.md) | Widget mount API and Confluence attachment setup. |
| [wcspedia-style.css](./wcspedia-style.css) | The single shared, plain CSS file for every view. Citi font data is embedded. |
| [wcspedia.js](./wcspedia.js) | Shared browser runtime, including the Confluence client. |
| [publication-config.js](./publication-config.js) | Shared non-secret working-root and eight-area parent-page configuration. |
| [NATIVE-PUBLICATION.md](./NATIVE-PUBLICATION.md) | Native child-page publication, server integration and Confluence deployment steps. |
| [wcspedia-data.json](./wcspedia-data.json) | Full sample/control dataset for local use or a restricted control page. |
| [wcspedia-published.json](./wcspedia-published.json) | Generated reader attachment containing approved snapshots only, without drafts or audit comments. |
| [WCSpedia-confluence-macro.html](./WCSpedia-confluence-macro.html) | Main library macro loading the shared CSS/JavaScript from Confluence attachments. |
| [wcspedia-my-workspace-confluence-macro.html](./wcspedia-my-workspace-confluence-macro.html) | Author workspace fragment for its own Confluence page. |
| [wcspedia-reviewer-workspace-confluence-macro.html](./wcspedia-reviewer-workspace-confluence-macro.html) | Reviewer workspace fragment for its own Confluence page. |
| [wcspedia-saved-items-confluence-macro.html](./wcspedia-saved-items-confluence-macro.html) | Saved items fragment for its own Confluence page; loads shared JavaScript and uses the already-global stylesheet. |
| [WCSpedia-entitlements-prototype.html](./WCSpedia-entitlements-prototype.html) | Portable entitlement administration preview with fictional SOEIDs. |
| [WCSpedia-prototype.html](./WCSpedia-prototype.html) | Portable main-library review copy with embedded sample content and application assets. |
| [WCSpedia-my-workspace-prototype.html](./WCSpedia-my-workspace-prototype.html) | Portable author workspace, connected to the other four prototype files. |
| [WCSpedia-reviewer-workspace-prototype.html](./WCSpedia-reviewer-workspace-prototype.html) | Portable reviewer workspace; interactive charts may request the optional CDN libraries. |
| [WCSpedia-saved-items-prototype.html](./WCSpedia-saved-items-prototype.html) | Portable personal library preview with the same saved-item logic and embedded shared assets. |
| [CONFLUENCE-WORKFLOW.md](./CONFLUENCE-WORKFLOW.md) | API configuration, publication model and workflow-service contract. |
| [EXPORTS.md](./EXPORTS.md) | PDF/Word output, document-control cover, media handling, library versions and attachment configuration. |
| [exports-confluence-scripts.html](./exports-confluence-scripts.html) | Optional attachment-hosted export-library script tags, matching the Covenant loading pattern. |
| [METRICS.md](./METRICS.md) | Automatic reading estimates, view-count rules, metrics service contract and sorting behaviour. |
| [VERIFICATION.md](./VERIFICATION.md) | Behaviour and browser checks, with the boundary between the prototype and production integration. |

`WCSpedia-confluence-macro.html` is the main-library macro. `index.html` loads the same assets as `wcspedia-local.html`.

## Local preview and rebuild

From this directory, start a static server:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open [WCSpedia locally](http://127.0.0.1:4173/wcspedia-local.html), [My workspace](http://127.0.0.1:4173/wcspedia-my-workspace.html), [Reviewer workspace](http://127.0.0.1:4173/wcspedia-reviewer-workspace.html), [Saved items](http://127.0.0.1:4173/wcspedia-saved-items.html), or [Entitlements](http://127.0.0.1:4173/wcspedia-entitlements.html). The local entry points deliberately fetch `wcspedia-data.json`, matching the JSON-loading path used for Confluence. Keep the five portable prototype files together when opening them without a server so their page links resolve. A local server is the recommended way to exercise shared browser state across all five pages.

After editing source files, rebuild all distribution files:

```sh
node build.cjs
```

The generated local and Confluence fragments include a content-derived version in the shared CSS/JavaScript URLs. Deploy the updated fragments with their matching assets so a previous browser cache cannot keep old controls. If CSS is loaded from the global Confluence layout, update that global stylesheet URL to match the new fragment; keep it loaded only once.

### Shared Citi loading overlay

Only the landing view shows the branded `loading-overlay.js` and `loading-overlay.css` component, bundled into the application assets. Other pages use inline loading and error states. It adapts the existing Covenants full-screen overlay/panel and the filling track from the wealth sample overlay, using one Citi SVG inside the centered panel above the bar. The background has no logo. The SVG is embedded in the built stylesheet, so the loader needs no extra logo request, CDN, or script tag. Existing page styles and navigation stay unchanged.

The landing overlay opens during initial session setup and closes when the landing shell renders; document discovery and independent services continue without holding the full-page overlay. Progress represents completed initialization steps; the initial unknown wait is indeterminate. A read-only startup or workspace-refresh request that exceeds 60 seconds shows a failure/retry state rather than success. Errors clear the layer, restore scrolling and focus, and leave the existing error controls usable. Reduced-motion preferences disable animation. Background metrics/charts and existing write-operation feedback keep their own lifecycle.

For your shared-header installation, paste [wcspedia-global-header-confluence-macro.html](./wcspedia-global-header-confluence-macro.html) into the included header page and use the matching page fragments from `confluence-global-header/`. The header loads shared CSS and the loader definition; each page keeps its own application container/configuration, and only the landing view starts the branded overlay. See [the Confluence header installation steps](./LOADING-OVERLAY-CONFLUENCE.md). The existing root-level macros remain available for the earlier installation option. Deploy matching versioned assets and fragments together. A visual-only held-loader preview is available at `previews/loading-overlay-preview.html`; it is not an application entry page.

Run the behaviour checks:

```sh
node --test *.test.cjs
```

The editor and library lifecycle DOM tests require the optional developer-only jsdom dependency; without it those checks are explicitly skipped. For the complete suite use `NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test *.test.cjs`. The standalone DOM harnesses under `tests/` also use jsdom, never a browser/runtime dependency. The local API media round trip is `tests/api-media-smoke.cjs`, run while the mock server uses Alex. The suggestion HTTP round trip is `tests/api-suggestions-smoke.cjs`, run against the default Jordan mock on port 4175 (`WCS_MOCK_PORT=4175 node mock-confluence.cjs`). Exact commands and the latest results are in [VERIFICATION.md](./VERIFICATION.md).

For an optional local integration simulation, first rebuild, then run:

```sh
node mock-confluence.cjs
```

Open [the local Confluence simulation](http://127.0.0.1:4174/mock-live.html). By default its server resolves the fictional session as **Jordan Lee · Manager**. To exercise authoring, stop that server and start it with:

```sh
WCS_MOCK_ACTOR=alex node mock-confluence.cjs
```

That option fixes the server-side sample identity as **Alex Morgan · Author** for the run; it is not a client-side role switch or production authentication. The simulation exercises the attachment, current-user, workspace, action and CQL request paths. It binds only to `127.0.0.1:4174`, never contacts a real Confluence host and resets its in-memory documents and audit when stopped. It is a development fixture, not a production workflow backend.

The checks cover published-snapshot discovery, filters, literal search, CQL escaping and scoping, assignment-based workflow decisions, stale revisions, Markdown safety, cover validation, taxonomy changes and the Confluence client. See [verification notes](./VERIFICATION.md) for the exercised author–manager flow and presentation checks. Repeat browser review after presentation or navigation changes.

## Confluence attachment setup

For your existing Confluence header and global CSS, use the [Confluence upload kit](./confluence-upload/README.md) and `WCSpedia-confluence-upload.zip`. Each of the six pages follows Covenants: an HTML macro with inline settings, its page logic JS, then its matching HTMLPage JS. There is no separate configuration JS attachment. The attachment page can differ from the landing/search root. Keep the existing global WCSpedia CSS and fonts; the kit contains empty starter metadata rather than demonstration documents. Run `node build-confluence-upload.cjs` to generate the kit and verified ZIP. Use that kit's installation guide; the older combined-bundle installation below is retained for existing deployments and standalone previews.

The loading pattern matches the existing `covenants-local.html` and `covenants-confluence-macro.html`: one root element, attachment CSS, configuration, then attachment JavaScript. WCSpedia reads JSON instead of the Covenant application's Excel files.

1. Select the WCSpedia parent page and replace **`REPLACE_WITH_WCSPEDIA_PAGE_ID`** everywhere in `WCSpedia-confluence-macro.html`. This placeholder is intentional; the Covenant page ID is not reused.
2. Upload `wcspedia-style.css`, `wcspedia.js` and the permitted `wcspedia-published.json` to that page using those filenames.
3. Create separate **My workspace**, **Reviewer workspace**, **Saved items**, and **Entitlements** Confluence pages and paste their corresponding macro fragments into the approved HTML-macro environment. Use the main fragment on the library page. All five use assets from the same parent page. The Saved items fragment expects the shared CSS to be loaded globally. The supplied `/confluence` context matches the existing Covenant deployment; change it if the target installation uses another context path.
4. Replace the native page URLs in `WCS_CONFIG.pages` on all five fragments. `pageRole` is `home`, `mine`, `review`, `saved` or `entitlements`; each fragment selects its own entry view. Add these pages to the native Confluence sidebar for navigation. The landing page has no workspace link buttons, and the application has no bottom workspace navigation strip or global header/footer. The `pages` map routes actions to the appropriate page.
5. Upload the authoritative `entitlements.json` to the shared page configured as `attachmentPageId`. The fixed JSON defaults require no separate entitlement source, filename or policy-page setting. Keep `pageIds.entitlements` / the Entitlements interface URL as the navigation destination. Configure `workspaceEndpoint`, `workflowEndpoint`, and `entitlementsEndpoint`; the latter performs governed access changes against the same JSON policy and journal. Preserve existing grants and audit when migrating. Unconfigured permissions deny writes. See [ENTITLEMENTS.md](./ENTITLEMENTS.md) for the exact contract.
6. Upload `add-document-widget.js`, `add-document-widget.css`, `entitlements.js`, and `confluence.js` to the asset page. Place the standalone widget macro in your existing global navigation. Its policy page must match the application. The top tool row in local previews only demonstrates that native placement; application macros do not create a header or footer.
7. Upload `assets/citi-logo.png` as `citi-logo.png` to the asset page. The generated macros point their `exports.logoUrl` to it. The SVG master may also be hosted; PNG is the default export fallback for Word/PDF compatibility. PDF/Word libraries use pinned CDN URLs initially. To host them internally, upload the matching vendor files and set `WCS_CONFIG.exports.allowCDN: false` with attachment URLs; see [EXPORTS.md](./EXPORTS.md) and [optional script tags](./exports-confluence-scripts.html).
8. Configure `metricsEndpoint` on every application macro when the trusted metrics service is available. Until then, live counts show “Views unavailable.” Reading estimates work independently. Keep counters in the service store, separate from document attachments and approval history; see [METRICS.md](./METRICS.md).

The main macro can also be reused on a child document page with `documentId: 'YOUR_DOCUMENT_ID'` in `WCS_CONFIG`. Keep `rootPageId` pointing to the actual WCSpedia landing page on every page; use its numeric `pageId`, never a space ID, space name or space key. If attachments live elsewhere, set `attachmentPageId` and their asset URLs to that separate host. The dedicated workspace fragments supply their own `pageRole` and cross-page link configuration. Live search results open the native Confluence page by its page ID. Search does not depend on a document being present in the JSON snapshot or having a WCSpedia label.

The **Updated year** dropdown generates its choices locally. Selecting a year adds dates to the same verified `space` and landing `ancestor` CQL conditions; clearing it does not broaden that scope. A supplied `spaceKey` must be the actual key, which can differ from the display name WCSpedia. Blank resolves the key from the configured landing page. The client rejects mismatched landing links and results outside that page tree. See the [scope setup and deployed-file checks](./confluence-upload/README.md#search-scope-and-updated-year).

The macro uses same-origin requests and the existing Confluence session. It has no API token in source and does not use the local demonstration persona as a live identity. The live client does not silently substitute sample content after a failed request. Load and authentication errors are surfaced for correction.

The public JSON attachment must contain only information its audience may access. Hidden UI controls do not protect draft content in a downloadable attachment. A trusted workflow service supplies restricted working revisions and performs review/approval decisions. The build generates `wcspedia-published.json` with approved versions only and no audit events. Keep the full `wcspedia-data.json` on a restricted control page or in the service store; it must not be a production reader attachment.

## Reading and reviewing content

Articles and library cards automatically show an estimated reading time calculated from the displayed version: 200 readable words per minute plus 10 seconds per image, rounded up. Markdown formatting, URLs and attachment data are excluded. Local snapshot search offers **Shortest read**, **Longest read**, **Most viewed**, and **Least viewed**, applied before pagination; unknown counts remain last. Live Confluence search offers **Most relevant**, **Last updated**, and **Title A–Z**, applied by CQL before server pagination.

A published article visit counts after two seconds of visible reading, at most once per authenticated person and document within 30 minutes. Refreshes, cards, previews, drafts and audit screens do not inflate the total. Stable document keys retain counts across publication changes. Local previews label their browser-only totals as **demo views**; shared production totals require the configured service. These totals measure WCSpedia visits, not every native Confluence page visit or training completion.

The landing page puts search first, followed directly by business-area browsing. Content-type filtering remains available in search results. There is one landing page: its search opens results directly in the same Confluence page. Legacy `#/search` links return to the main landing page; no separate search-introduction page is needed. It omits the demo/persona strip, live connection strip and workspace navigation buttons; demo controls remain available on other local pages. Readers can browse business collections and content types, then narrow search cards with filters and sorting. In Confluence, the main search and autocomplete query native pages throughout the WCSpedia root and all descendants. Local demonstration and personal workspace search continue to use their permitted snapshots. Native results show the indexed page title, excerpt and update date; they do not infer approval from a label or an older JSON snapshot.

Content details show the owner, author, reviewer, approver, approval date, effective date and next review date for the selected version. Blog and training metadata sit with the content rather than being mixed into document-control fields. **My workspace** and **Reviewer workspace** are separate HTML entry points and separate Confluence pages, reached through native Confluence navigation. Explore, search, topic, workspace, review and category introductions share the same inset rounded panel treatment in the global stylesheet. The reviewer page's `#/review` route and individual `#/review/{id}` decisions provide the submitted content, change context and available review/approval actions. Versions and the audit trail remain linked to the same document.

Document control keeps status/version, owner, approval and next review visible; **More control details** expands the remaining metadata. History links remain visible. Version history shows six snapshots per page, document audit ten events, and the initially collapsed health history five events. Shared compact pagination keeps all retained records reachable without rendering years of history down the page.

Reviewer analytics show pending content reviews versus manager approvals and six weeks of the current person's recorded decisions. The weekly series counts a document/version/revision once for each review or approval action, uses UTC weeks beginning Monday and excludes future events, self-review and other people's assignments. It is an activity view over the permitted workspace projection, not a claim about organization-wide performance. The current week is partial.

Highcharts Core and its accessibility module are pinned to `13.1.0` and load only when the reviewer analytics section is mounted. The default scripts are the official Highcharts npm package served by jsDelivr: [Core](https://cdn.jsdelivr.net/npm/highcharts@13.1.0/highcharts.js) and [accessibility](https://cdn.jsdelivr.net/npm/highcharts@13.1.0/modules/accessibility.js). No document data is sent to a chart export service. `WCS_CONFIG.charts` supports `enabled: false`, `offline: true`, preloaded `window.Highcharts`, and `highchartsSrc`/`accessibilitySrc` for local minified files. Use `allowCDN: false` with those hosted paths inside Citi. The chart cards retain semantic data tables and a readable fallback if loading fails; they do not try another CDN. Citi navy, blue and cyan tokens are scoped to this module. Commercial deployment requires the appropriate Highcharts license; use Citi's licensed distribution. See the [official file service](https://code.highcharts.com/) and [accessibility guidance](https://www.highcharts.com/docs/accessibility/accessibility-module).

The eight business collections match the supplied Job Aids structure: Credit Approval Control; Credit Information Management; Credit Management Reporting; Deal Closing; Documentation & Pledging Team; EMEA Credit Admin; Loan Management; and Regional Operating Manuals.

## Authoring in the same tool

New documents generate their slug from the title while typing. **Customize** enables a manual value and **Use title** returns to automatic generation. Existing saved slugs do not change when the title is edited. Known slug collisions receive a numeric suffix, and non-Latin titles have a stable generated fallback. The permanent document key remains the identity; a slug is not a global uniqueness or access-control mechanism. Recovery restores automatic/custom mode separately from saved document content.

Authoritative source IDs are generated and retained internally. Authors enter the source title, URL, version and verification date. The date picker is the shared Citi control, with its calendar button inside the input and the same keyboard, validation and mobile behavior throughout the application.

Shared actions use `button`, `button secondary`, or `button danger`, with `compact` for document utilities and table actions. The common CSS defines height, padding, borders, hover, disabled and keyboard-focus states. Use `wcs-data-table-actions` for a row's action group and `wcs-status-group` for adjacent status, governance and health tags. Keep navigation and in-text references as links. These classes are included in the single generated `wcspedia-style.css` attachment.

Search forms leave 24 px before results; tag groups wrap with an 8 px gap. Notice cards and quoted excerpts use rounded, full outlines without decorative side stripes. The treatment follows the existing [Citi Wealth](https://www.citigroup.com/global/businesses/wealth) and [Citi press-release](https://www.citigroup.com/global/news/press-release) references. The [21st.dev Alert Badge](https://21st.dev/@serafimcloud/components/alert-badge) was consulted for grouped label spacing; implementation remains scoped plain CSS with no React or Tailwind dependency.

**Add content** opens the full-page editor at `#/create`. Choose an available type such as Blog, Training, Report, Job aid, Guide, Knowledge sharing or Reference, select a business area and assign the reviewer and approving manager. Procedure remains an existing-document classification rather than a new-authoring choice. The content owner and author remain visible beside those assignments. **Edit document** or **Edit draft** opens the same full-page editor at `#/edit/{id}` when central entitlement and native Confluence update permission allow it. Existing assignments and the permanent document key are preserved. Editing a published article does not create a working version just by opening the editor: **Save draft** submits the changed content as one atomic `revise` command. It creates the next draft version with a single audit event and leaves the approved reader snapshot unchanged. Saving an existing draft increments its content revision. Cancel returns to the source page; unsaved changes use the shared Citi discard dialog. A stale revision or revoked permission leaves the entered content in the editor, and a local storage failure does not navigate away or claim a saved revision.

The editor provides title, slug, excerpt, formatted content, Markdown source, preview, key highlights and a cover image with alternative text/caption. The toolbar supports paragraph styles, bold, italic, underline, links, quotes, inline code, code blocks, inline images, nested lists, tables, dividers, clearing formatting, SharePoint training videos, resource embeds and fullscreen writing. Visual and Markdown modes share one saved body. Pasting AI Markdown into the visual editor renders supported formatting; the Markdown tab provides direct source editing. The Video control immediately after Image accepts SharePoint links or provider embed code. Valid video embed sources render in a responsive player; ordinary share links remain recording cards. Raw supplied HTML is never executed. Generic resource embeds remain linked cards. See [VIDEOS.md](./VIDEOS.md). **Save draft** records a new document or an audited content revision. The author then submits it through the connected review workspace. Saving content never grants approval, and the author cannot review or approve their own work. Submitted content stays fixed while review and approval are pending.

Managers can add a business area from `#/categories`. The new category persists with the local demo data, is available in authoring/discovery and has a taxonomy audit event. In live mode this command must be accepted by the configured trusted workflow endpoint; it does not create a Confluence collection page by itself.

The editor offers **Paste MDX / Markdown** with an extracted-metadata preview. Plain Markdown supports insert-at-cursor or replace-content placement; a complete metadata-bearing document uses replacement. The `wcspedia-mdx-v1` block captures title, excerpt, type, business area, source identity, original dates, attribution, and discovery tags. Portable content with embedded raster images and supported files is normalized into versioned asset records with `attachment:` references. Import accepts up to 8,388,608 UTF-8 bytes; the canonical body after extraction is limited to 200,000 characters. The template download is an attachment named `wcspedia-document.mdx` on the configured shared asset page. Importing content does not import approval decisions or grant publication.

The custom editor stores its canonical Markdown body inside the versioned JSON document, together with its metadata. Section data is a derived search projection. **Copy Markdown** copies the selected version to the clipboard, and **Download → Markdown file** exports the same readable content. **Download → MDX file** exports the WCSpedia metadata block and body while preserving supported video/resource tokens and resolving recorded media references. Cover, highlights, and unlinked supporting files are included as body content, so reimport is not a byte-for-byte editor-state restore. MDX export excludes approval decisions and permissions. Internal document workflow JSON is not an export format; the separate analytics action downloads a metadata JSON report. **Download** also offers PDF and editable Word; the Entitlements page exports its permitted access journal as CSV. Internal JSON remains the storage and API format.

Cover uploads accept PNG, JPG and WebP files up to 1 MB and require an image description. Inline images also support GIF; each image has a 1 MB limit. Supporting attachments accept PDF, Office documents, text, Markdown, CSV and raster images, up to 5 MB each. Each version permits up to 20 inline images and 20 supporting files. The prototype stores a raster data URL with the revision; it does not upload that file to a production attachment endpoint. Before live submission/approval, the trusted service must validate imported media and replace mutable image URLs with permitted version-pinned assets. A changed remote image must not silently change an already reviewed document.

Native publication renders Markdown tables as storage tables and code fences as Confluence Code macros. Supported SharePoint videos become recording links on native pages; generic resource tokens become links. The WCSpedia reader can show a player for a validated SharePoint embed URL and a resource card for `@[embed](https://...)`. Arbitrary iframe/JSX content is unsupported. An external image URL may display in the reader, but the publisher will not fetch arbitrary external media: upload or stage its validated bytes first. Confluence attachments belong to a page ID; shared scripts/templates live on `attachmentPageId`, while document-specific media is staged on its managed document page. Pasting MDX never uploads relative files from the author's local folder. See the [MDX capability matrix](./MDX-IMPORT.md#supported-rendering).

## PDF and Word document copies

Use **Export document → PDF document** or **Word document** on a document detail page. Both formats use the selected version and a shared structured export model. The first page follows the supplied control-document reference: centered Citi logo and title, document key/reference, business area, version/revision, owner/author, review and approval evidence with SOEIDs and dates, plus a note directing readers to the online approved source. Missing control data is marked as not recorded. Draft and historical copies are identified as not the current approved version.

The output contains selectable PDF text or editable `.docx` text, headings, lists, tables, links, images, taxonomy and supporting-resource references. Exports are generated in the browser without a remote document-conversion service. Embedded supporting files are listed rather than attached inside Word/PDF. An image that cannot be loaded or decoded stops the export with a Citi-styled error instead of silently producing an incomplete copy. The logo source and the full export contract are documented in [EXPORTS.md](./EXPORTS.md).

`document-export.js` and `document-export-ui.js` are bundled into `wcspedia.js`; their plain CSS joins the global stylesheet. The optional libraries are pdfmake **0.2.20** with its matching font VFS and docx **9.5.1**. Defaults use pinned jsDelivr URLs; `WCS_CONFIG.exports` can instead reference same-origin attachment scripts or reuse preloaded globals. The [attachment script fragment](./exports-confluence-scripts.html) shows the required PDF-library/font ordering. Keep the versions and upstream licenses together when copying the files internally. The supplied `assets/citi-logo.svg` is the vector master; `assets/citi-logo.png` provides the export fallback, and portable prototype HTML embeds the PNG so its logo does not require a separate request.

## Where the content should live

**Current managed-workflow code:** the custom editor saves complete JSON document snapshots through a trusted workflow service. Server modules create/update native working and published child pages. The custom reader and managed views still load approved bodies from `wcspedia-published.json`; native landing/search/Insights do not. The protected journal remains the managed authoring store. Supplied page IDs are configured, but service endpoints are not deployed by this package. Native Confluence editor saves are not imported into the managed snapshot workflow.

**Production architecture:** keep the current Add/Edit editor, design and custom approval workflow. The trusted service creates and updates native working/published pages; future storage scaling should load authorized documents individually behind the same UI, retaining exact-revision approvals and audit records. It does not require opening Confluence's native editor. JS/CSS, logos, images and supporting files can remain attachments; one aggregate JSON attachment should not be the permanent document database. JSON API responses and small content metadata are still appropriate.

**Search today:** the main live search, business-area browsing and autocomplete use Confluence CQL. Every request requires the root’s verified space and `ancestor = ROOT`, covering nested document pages across the eight business areas while excluding the interface/root and configured administrative page IDs. No document/publication label is required for discovery; unlabelled native pages are included when the signed-in user can access them. Configured area page IDs narrow by ancestry; type/topic/process/region filters use labels. Results are paginated on the server (six cards, four suggestions), no full page body is requested for search, and obsolete requests are cancelled. See [search configuration and deployment limits](./CONFLUENCE-WORKFLOW.md#child-page-search-with-cql). Managed views still load reader JSON when needed; replacing that aggregate dependency requires coordinated per-document backend loading while preserving the current editor and approvals.

The native child-page publisher is implemented and fixture-tested, but it is not a live deployment or a completed migration to per-document managed loading. See [the current-versus-target storage assessment and transition requirements](./NATIVE-PUBLICATION.md#storage-status-current-implementation-versus-native-authoring). Keep the current reader attachment until its consumers have been migrated and verified. Direct native editing is not the chosen authoring flow.

Existing files governed in SharePoint should stay there and be linked with their reviewed version. Do not save a second editable WCSpedia JSON master in SharePoint. This keeps ownership and approval evidence attached to the right source while the user works through one WCSpedia interface.

## Try the local author–manager workflow

Use the sample persona control to switch between **Alex Morgan · Author**, **Jordan Lee · Manager** and **Reader**. These fictional identities demonstrate responsibilities; the control is not authentication.

1. As Alex, use **Add content**, save a draft and submit it from the review workspace with a comment.
2. As Jordan, open the separate reviewer workspace and examine the submitted revision. Request changes with a reason or complete the review.
3. Perform the separate approval action after review. The same assigned manager may review and approve, while the author cannot approve their own work.
4. As Reader, open the approved version and its decision details.
5. As Alex, revise the published document. Its earlier approved version stays available to readers while the replacement is pending.

The sequence is **Draft → In review → Awaiting approval → Published**. Every decision requires a comment or change summary. Approval requires review of the exact content revision. Editing invalidates decisions for the working revision while retaining earlier version history.

Local changes persist in the browser. **Reset demo** restores the fixtures. Local storage and its example audit history can be edited or deleted; they are not shared or authoritative. Production decisions must be authenticated, serialized and audited by the workflow service described in the integration handoff.

## Editable source files

| File | Responsibility |
| --- | --- |
| `styles.css`, `ui.css`, `editor-upgrade.css`, `workspace.css`, `workspace-charts.css`, `suggestions.css`, `data-table.css`, `document-export.css`, `document-export-ui.css` | Plain CSS sources combined into one generated `wcspedia-style.css`. All application selectors are scoped to `#wcspedia`. |
| `ui.js` | Shared Citi dialogs, popovers, dropdowns, calendars, tooltips and their accessible interaction lifecycle. |
| `navigation.js` | Same-origin routing between the separate knowledge, author, reviewer, saved-item and entitlement pages. |
| `data-table.js`, `workspace-table.js` | Shared semantic table renderer and workspace row adapter; common states, actions, styling and responsive scrolling. |
| `document-export.js`, `document-export-ui.js` | Structured PDF/Word generation, lazy library loading and the shared Citi export menu/progress dialog. |
| `suggestions.js` | Page-wide feedback, exact selected-text context, personal/reviewer queues and suggestion API client. |
| `bookmarks.js` | Personal saved document IDs, SOEID isolation, revision checks and the trusted preferences API adapter. |
| `content-health.js`, `health-service.js` | Rule evaluation, manager authority, maintenance transitions, audit history and the trusted health API adapter. |
| `content-health-ui.js`, `library-workflows.js`, `content-health.css`, `library-workflows.css` | Shared health tags, themed rule editor, health worklist and saved-items presentation. Their CSS joins the global stylesheet. |
| `app.js` | View rendering, navigation, local demonstration and live-session integration. |
| `editor.js` | Full-page authoring, save/preview interactions and `WCSEditor.domToMarkdown` conversion from the visual editor. |
| `editor-content.js` | Markdown rendering/import/export, section projection and validation of media, references and taxonomy. |
| `vendor/markdown-it-15.0.2.min.js` | Pinned local Markdown parser; its license is included beside it. |
| `data.js` | Embedded copy of sample content for the portable review file. |
| `workflow.js` | Pure transitions, assignment checks and exact-revision validation. |
| `discovery.js` | Filter and rank the published or permitted working snapshots. |
| `workspace-charts.js` | Assignment-scoped analytics, accessible data tables, optional Highcharts loading and chart cleanup. |
| `search.js` | Search helpers and scoped Confluence CQL utilities. |
| `confluence.js` | JSON attachment loading, authenticated current-user lookup and workflow/API requests. |
| `mock-confluence.cjs` | Optional loopback-only Confluence API simulation for browser verification; not a deployable backend. |
| `build.cjs` | Generates the shared CSS/JS and the library, author, reviewer, saved-item and entitlement HTML entry points, macros and portable prototypes. |
| `assets/citi-text-regular.ttf`, `assets/citi-text-bold.ttf` | Local font inputs embedded by the build. |

Edit source files, then rebuild; direct changes to generated CSS, JavaScript or HTML are overwritten by the next build. Mount one WCSpedia root per Confluence page. Its hash navigation should not share a page with another hash router. The supplied macro targets the approved script-enabled HTML environment used by the existing applications, not a standard Confluence Cloud macro installation.

The font inputs come from Citi's official [font stylesheet](https://www.citigroup.com/global/citigroup-ui/akpublic/libs/font/font.css?t=20231122). The build embeds them to keep the delivered files independent of font CDNs.

## Additional references

The earlier workflow exploration used the [21st.dev Process Timeline](https://21st.dev/@shadcnui-blocks/components/timeline-05) and [Data Table](https://21st.dev/@wensity/components/data-table), accessed through the 21st.dev MCP, alongside Dribbble's [Document Approval Flow](https://dribbble.com/shots/24355993-Document-Approval-Flow) and [Document Management Dashboard](https://dribbble.com/shots/26531063-Dashboard-for-Document-Management). The current visual hierarchy follows the Citi references above.

## Rich media, tagging, and consistent controls

Inline images and document attachments belong to each document version. Uploaded images are referenced from Markdown as `![Description](attachment:asset-id)` and files as `[File name](attachment:file-id)`. JSON stores the matching image/file records; Markdown export resolves those references to their saved URLs. Readers and reviewers see the resources from the selected revision. Production media must be validated and pinned by the trusted workflow service before review.

The author can add topic tags, processes and regions. These fields are searchable and available under **Topics, processes & regions** in the search filters. Related cards favour shared processes and topics, then business area, and only recommend approved snapshots. A broad region by itself does not make unrelated documents recommendations. Cards use a document's cover image; a neutral illustration appears until a cover is supplied.

All application menus, tooltips, date selection, insert dialogs and review decisions use `WCSUI` from `ui.js`. Its styles and the editor styles are built into the same `wcspedia-style.css`. There are no application calls to `alert`, `confirm`, `prompt`, native validation bubbles or browser-close prompts. The browser/operating system still owns the file chooser and clipboard permission boundary; website CSS cannot replace those interfaces. In-page navigation protects unsaved changes through the Citi dialog. A recovery copy is saved in this browser tab's session storage and can be restored through the same themed dialog after reload. It is not a saved document revision or a Confluence backup; saving the draft remains the durable workflow action.

The sticky **Back to top** action appears after scrolling and respects reduced-motion preferences. Document details, reviews and version snapshots render the same content format.

Three illustrative cover photographs reuse unmodified local `tailadmin/src/images/grid-image/` assets (02, 05 and 06). They demonstrate cover rendering; replace them with the approved covers for your content. Their data is embedded in the sample snapshots, so no external image request is needed.

## Corrections and workspace navigation

The floating **Suggest an edit** control is available across the application. Select a readable passage and right-click **Suggest a correction**, or use **Alt+Shift+S**, to include its exact quote and document revision. Requests also support improvements and training needs. My workspace shows the requests you raised; the assigned manager sees the review queue and can record a resolution or dismissal with a reason. A suggestion never edits approved content.

The five HTML pages share local demo state when served on the same origin. In Confluence, configure their actual page URLs in `WCS_CONFIG.pages` and add them to the native sidebar. Set `pages.saved` to the page replacing `REPLACE_WITH_SAVED_ITEMS_PAGE_ID`; its `pageRole: 'saved'` opens `#/saved` automatically. Workspace Saved items links route to that page, and old `#/saved` links still work in place. Workspace entry navigation belongs to the native Confluence sidebar; the main page has no duplicate workspace buttons or bottom navigation strip. Draft navigation uses the shared Citi confirmation dialog across page boundaries, including the search shortcut.

The Saved items Confluence macro loads `wcspedia.js` from the shared attachment page and intentionally has **no stylesheet link or inline CSS**. Load `wcspedia-style.css` once from the global Confluence layout; this provides the same tables, controls, typography and spacing as the rest of WCSpedia. The local Saved items HTML links that stylesheet for standalone preview; the portable preview embeds it. Deployment details are in [BOOKMARKS.md](./BOOKMARKS.md).

Set `suggestionEndpoint` to the trusted same-origin service described in [CONFLUENCE-WORKFLOW.md](./CONFLUENCE-WORKFLOW.md). Until configured, live requests can be copied but are not reported as sent. Local prototype requests stay in the browser and send no notifications.

## Access and document changes

All creation/edit/delete controls use one shared entitlement model, keyed by authenticated SOEID and intersected with the actual Confluence page operations. Manager/Author labels do not independently grant those operations. Review and approval retain their separate assignment and contributor restrictions. The Entitlements page independently gates viewing, adding, editing and revoking access, with a Citi-styled denied state. The denied-screen composition was informed by [21st.dev Access Denied](https://21st.dev/@olewandowski1/components/error-4); the delivered implementation is original plain HTML/CSS/JavaScript.

New documents receive a permanent UUID-based `id`; existing keys stay unchanged. Editing a title or slug never renames the identity or mapped Confluence page. Audit events record the document key, acting SOEID, time and changed values. Delete requires the exact document key plus a reason, rechecks authorization at commit, and sends a guarded service command to trash the mapped native page while retaining a restricted journal. It removes the record from discovery; the production service owns access to retained deletion evidence.

Entitlements, My workspace, the reviewer queue and suggestion inboxes use one shared semantic table component (`WCSDataTable`) and the same scoped table stylesheet. Each feature supplies its authorized rows and available actions; the table component itself grants no access. Workspace rows show owner/submitting person, status, exact version/revision, latest change information and reading/view metrics. Suggestion details and decisions stay in the shared Citi dialog. Empty/loading states, keyboard-focusable horizontal scrolling and row actions follow the same design.

Results and record tables share compact pagination: first three, last three and neighbors of the current page, with ellipses and Previous/Next. Pagination preserves active queries and filters and does not allocate every page number.

## Suggested next features

See [FEATURE-ROADMAP.md](./FEATURE-ROADMAP.md) for a prioritized extension plan. These recommendations are not implemented features.

## Bookmarks and governed content health

Approved documents have a personal Save action. Saved items is a separate Confluence page, linked from the workspaces and native navigation. It uses the same tables, search, compact pagination and globally loaded CSS. Content health remains available in My workspace. Health tags link to per-document findings, manager-owned rules, maintenance actions and history. Rules reuse existing content.edit and native page permissions; health actions do not approve or edit document content. See [BOOKMARKS.md](./BOOKMARKS.md) and [CONTENT-HEALTH.md](./CONTENT-HEALTH.md). Configure same-origin bookmarksEndpoint and healthEndpoint in the deployment macros; blank endpoints display unavailable and never use local demo storage in production.


## Import original MDX metadata

Use **Paste MDX / Markdown** in the existing editor to preview and import the original document dates, source identity, title and discovery fields. See [MDX-IMPORT.md](MDX-IMPORT.md) for the format, migration steps and reusable agent prompt, and [the MDX template](templates/wcspedia-document.mdx). Native Confluence dates and the Updated year filter keep their existing semantics. Browser and trusted server changes must be deployed together; the existing global CSS/header are unchanged.
