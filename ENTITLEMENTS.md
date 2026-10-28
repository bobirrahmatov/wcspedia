**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

**Current space-only installation:** see [Automatic native access synchronization](NATIVE-SPACE-SETUP.md#automatic-entitlements-to-confluence-synchronization). Entitlements saves now reconcile native space grants and Working viewing as the signed-in native Space Admin. Working Edit is not required for authors/reviewers. The service-backed details below describe the older hosting model, not a server you need to deploy. Preserve the existing JSON and history.


# WCSpedia entitlements JSON attachment

Use **one `entitlements.json` attachment** as the authoritative policy. The existing Entitlements screen reads the JSON and sends Add, Edit and Revoke commands to the trusted service. Its design is unchanged. BR47149 is the first administrator in **confluence-data-starters/entitlements.json**. Do not deploy the root demo `wcspedia-entitlements.json`.

## Installation

1. For a new installation, upload `confluence-data-starters/entitlements.json` to your shared **attachments page**. No native permission table or separate policy page is required. Existing policies must retain their current grants and audit; never reset them with this seed.
2. In all five page HTML macros and the shared Add document widget, set only the shared file host:

   ```js
   attachmentPageId: 'YOUR_ATTACHMENTS_PAGE_ID'
   ```

   The runtime automatically reads **entitlements.json** from that page. Remove `entitlementsSource`, `entitlementsFilename` and the old `entitlementsPageId` from browser settings when using this shared host. Keep `pageIds.entitlements` pointing to the Entitlements interface page; it remains the navigation destination. Do not remove configured service endpoints. Older explicit JSON-host overrides remain compatible, so migrate an existing separate JSON host deliberately and point all services to the same file before removing its override.
3. Upload the five matching logic/HTMLPage JS pairs from the current kit and the header pair if installed. Preserve real IDs and service URLs, and update both script cache revisions. The global CSS does not change.
4. Deploy the trusted attachment service below and configure `services.entitlementsEndpoint` in the page HTML. Until connected, JSON can be read but saving is unavailable. An HTML macro or JSON upload does not create an HTTP service.
5. Check that BR47149 can see the policy and an authorized change survives reload, while a reader cannot submit that change. Application grants cannot override native Confluence rights.

## One JSON, separate revisions

The JSON contains `schemaVersion`, `revision`, `records` and `audit`. Each row has a stable `id`, normalized `soeid`, `displayName`, exact document `scope` or `*`, supported `permissions`, and boolean `active`. The seed starts at revision 1 with no invented audit events.

Policy revision increments on an authorized policy change. Attachment ID/version identify the Confluence file revision. The host page version is independent; these values need not be equal. The browser reads a version-pinned attachment and checks metadata again before using it. Missing, invalid or changed JSON fails closed without table/demo fallback.

Confluence read permissions determine who can download the full attachment, including audit comments. Choose the policy-page audience accordingly; browser code cannot make readable attachment fields private. Raw attachment writers could replace the policy outside the app. Restrict those writes to the controlled service/deployment path, which must be the sole writer for conflict protection. Manual replacement is an operator migration/recovery action, not ordinary administration.

## Managing permissions

1. Open the Entitlements interface as BR47149, or another administrator with active `entitlements.view` and `entitlements.add` grants plus native Confluence read/update rights on the JSON host.
2. Select **Add entitlement**. Enter the colleague’s **SOEID**, **Display name**, **Scope**, required **Permissions**, **Active access** setting and **Reason for this change**. Creation and entitlement-administration permissions use **All documents**; document edit/delete access can use a specific document.
3. Submit **Add entitlement**. The connected trusted service rechecks authority and revisions, writes the same `entitlements.json`, increments its policy revision and appends the audit event. Reload to confirm the saved grant and history.

If the entitlement service is not connected, eligible administrators still see Add/Edit/Revoke, disabled with a nearby read-only explanation. People without the corresponding grant/native rights do not see those controls. A JSON upload alone does not connect saving; configure the deployed `entitlementsEndpoint` before expecting live changes.

BR47149 can delegate supported permissions through the existing Entitlements screen. Other people can manage access only after an administrator grants the relevant `entitlements.*` permissions. Users cannot grant themselves authority by changing browser state. The service re-reads policy and applies `entitlements.js` rules, including last-administrator protection and preventing a grantor from delegating permissions or scopes they do not hold.

Native rights are still required: create on the parent for `content.create`; update/delete on the mapped document for document changes; read on the policy page for `entitlements.view`; read/update plus the explicit matching grant for administration. The service must obtain these rights from Confluence as the authenticated caller, never from browser-supplied booleans.

The permission directory and workflow roles remain distinct. This screen manages permission rows; making a colleague an Author/Manager still requires protected workflow-directory onboarding. Keep BR47149's existing Manager seed and follow [DATA-STARTERS.md](DATA-STARTERS.md).

## Trusted service

`confluence-entitlements.cjs` exports `createEntitlementsService(config)`. This is server code, not a browser attachment. Configure HTTPS `baseUrl`, library `rootPageId`, policy `entitlementsPageId` matching the browser's `attachmentPageId`, `filename: 'entitlements.json'`, authenticated server transport, and a shared durable `journal` with `get`, `set`, `withLock`. These service-only settings are not additional browser configuration fields. Never place service credentials in HTML/JS attachments.

Wire the authenticated endpoint to `service.execute(command, { identity, native })`. The host must authenticate the session, validate origin/CSRF and `Idempotency-Key`, enforce the allowed root/target, resolve fresh native rights for that same user, limit request sizes/rate, and map exceptions to HTTP responses. Never pass body-supplied identity or native rights. Commands include action, record/recordId, reason, requestId, expected policy revision, expected attachment ID and expected attachment version. The browser requires the endpoint to share its Confluence origin and context.

Use `service.loadPolicy()` for the workflow coordinator's `loadPolicy` hook too, so document creation/edit/delete and entitlement administration use the same policy. Do not leave workflow authorization reading a stale table or separately seeded copy. The browser reads grants and audit directly from this JSON; no native table is queried or reconciled.

The writer serializes changes, re-reads JSON, applies the shared validator, records server actor/time/reason and before/after values, and uploads a new version of the same attachment. A private durable journal holds request receipts and uncertain-upload recovery state; this is not a second policy or another uploaded entitlement JSON. Lost responses are reconciled using attachment identity/version and exact byte digest. Unresolved writes block instead of being blindly repeated. The existing file journal is for one process on one host; multiple workers require a shared transactional lock/journal.

See [Atlassian's REST documentation](https://developer.atlassian.com/server/confluence/confluence-server-rest-api/) for content and attachment operations. The reference module is locally tested; authenticated HTTP hosting and internal Confluence deployment remain to be configured.

## Migrating a native table

This release supports only the JSON attachment. If a previous installation still holds current grants in a native table, preserve/export those grants and existing audit to a validated `entitlements.json` before installing the new runtime. Upload the migrated JSON to the configured `attachmentPageId`, remove obsolete entitlement source/filename/policy-page fields from browser settings, and make trusted workflow/service reads use that same attachment. An explicit `table` setting now reports a configuration error; it never silently authorizes from a different policy.

After confirming the JSON directory, remove the old native entitlement table or archive its dedicated page if nothing else uses it. Do not remove the Entitlements interface page, the shared attachment host, or any existing native permission restrictions. The generated table template and table parser/serializer are no longer included. Preserve the live JSON and history rather than replacing them with the BR47149 starter.

JSON history and native attachment versions provide audit evidence but are not immutable against privileged raw-file administrators. Preserve protected service logs/backups under the existing operational requirements.
