**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

# WCSpedia initial access and data

The separate **confluence-data-starters/** folder contains the first-install files prepared for **BR47149**. The display name is also `BR47149` until the real name is supplied. This person is an entitlement administrator and a workflow Manager. No sample colleagues, documents or approval events are included.

The entitlement policy lives in **one `entitlements.json` attachment** on the shared page configured as `attachmentPageId`. JSON is the only supported entitlement source. The client reads it through Confluence REST. Authorized administrators manage its grants through the existing Entitlements interface; the trusted management endpoint validates and persists their changes. Uploading the JSON enables configured policy reads, but does **not** deploy that write service. No page design change is required.

## Which file goes where

| File | Purpose and destination |
| --- | --- |
| `initial-users.json` | Editable input for the bootstrap generator. It records the requested identities, workflow roles and explicit permissions. Keep with your deployment configuration; the browser does not load it. |
| `entitlements.json` | Canonical permission policy for BR47149, including `schemaVersion`, independent policy `revision`, `records[]` and `audit[]`. Upload this initial file once to `attachmentPageId`. The runtime supplies the fixed JSON filename and source. |
| `wcspedia-workflow-initial.json` | Protected host input for `loadInitialState()`: one shared initial dataset for My workspace and Reviewer workspace, plus the approved attachment version. Never upload this private workflow seed to the shared attachments page. |
| `wcspedia-published.json` | Initial reader attachment with the same BR47149 directory mapping, eight business areas and no documents. Upload this to the configured general assets attachment page for a **new** library. |
| `reference/content-health-defaults.json` | Export of the current built-in rules for inspection. The app does not fetch a rules JSON file. Editing this reference does not change live rules. |

**Existing installations:** do not overwrite document data, policies or journals with first-install seeds. A service operator must add BR47149 to the current protected directory and policy, preserve document IDs/history, and regenerate the approved reader projection. Changing an initialization file after the workflow journal has been created does not update that journal.

## First administrator setup

1. Use the configured shared attachments page as the policy host. Restrict direct uploads/updates to the trusted service and designated operators. The file host is distinct in purpose from the Entitlements interface page containing the application HTML macro.
2. Upload **entitlements.json** from this starter folder to that chosen page. It contains BR47149's initial grants, policy revision **1**, and an empty audit array. Do not upload a first-install seed over an existing policy.
3. Give the intended users native Confluence access to read the policy attachment. Restrict direct attachment creation/replacement and policy-page edits to designated administrators/service operators. Everyone who can directly replace this file can change the policy outside the application's checks; ordinary users must not receive that ability. JSON grants do not override native Confluence permissions.
4. Use the same settings in **all five application page HTML macros and the standalone header widget**:

   ```js
   attachmentPageId: 'YOUR_ATTACHMENTS_PAGE_ID'
   ```

   The generated installer automatically loads `entitlements.json` from this host. Remove obsolete `entitlementsSource`, `entitlementsFilename` and `entitlementsPageId` browser fields for this setup. Keep `pageIds.entitlements` pointing to the Entitlements interface page. If an existing separate JSON host is in use, migrate the current policy and its trusted service together before removing that host override.
5. Deploy the authenticated trusted entitlement service and set **entitlementsEndpoint** to its real URL. Configure it to read and write this same attachment, authorize against the current policy and native rights, enforce expected revisions/concurrent updates, and store the audit event with the accepted change. A blank endpoint is not replaced by the JSON file. Merely uploading the seed does not make the Save action operational.
6. For a new library, upload the supplied `wcspedia-published.json` to `attachmentPageId`. Configure the trusted workflow host's `loadInitialState()` to return `wcspedia-workflow-initial.json`, using the **actual uploaded reader attachment version**. The supplied workflow `attachmentVersion: 1` is a first-upload default. This reader attachment version is separate from the entitlement policy revision.
7. Connect `workspaceEndpoint` and `workflowEndpoint` to deployed authenticated services. With a separate attachment host, the projection writer must target that host; the workflow root stays the landing page.
8. Sign in as BR47149. Verify the JSON grants and Manager directory mapping. After the management endpoint is deployed, add a colleague through the Entitlements interface, save, reload and verify the recorded change and audit entry. Confirm an ordinary reader cannot make the same request. The starter files have not been tested against your internal Confluence instance.

The JSON policy's `revision` is its own concurrency counter. A new policy starts at **1** and accepted policy changes advance it. It must **not** be replaced with the Confluence page version or attachment version. The service tracks native attachment versions separately to detect conflicting uploads.

## Existing policy migration

Do not replace a live policy with this BR47149-only seed. Before upgrading an older native-table installation, export and validate the **current grants and complete application audit history** into the JSON schema. Preserve stable grant IDs, existing identities and the policy revision used by that installation's authoritative service. Obtain audit history from the existing trusted journal; do not replace it with a blank array or fabricate events from Confluence page history. Do not advance or replace the policy revision with the new attachment's version.

Complete and verify this offline migration before installing the new assets. Upload the migrated JSON, configure the trusted service to use that attachment, then update all page/header settings to use the same `attachmentPageId` and remove obsolete entitlement source/filename/policy-page fields. Coordinate the switch so all pages and services read the same policy. This version does not read native entitlement tables and has no runtime table fallback. Keep the prior exports and journal backups for recovery; the migration must not delete them.

The offline generator can prepare fresh-install files consistently:

```sh
node bootstrap-data.cjs --users confluence-data-starters/initial-users.json --out confluence-initialized-data --policy-revision 1
```

Use a new output directory: the command refuses to overwrite existing files. It generates exactly three first-install JSON files: `entitlements.json`, `wcspedia-workflow-initial.json` and `wcspedia-published.json`. It performs no network requests and never applies grants to Confluence. Run it from the full WCSpedia source folder, where its shared validators are available. The local files use private permissions. This generator is **not** a migration tool and must not be used to reset an existing policy or audit trail.

## Administrator, manager and reviewer are different concepts

BR47149 has all seven bootstrap permissions: `content.create`, `content.edit`, `content.delete`, and `entitlements.view/add/edit/revoke`, with scope `*`. This allows the first administrator to delegate those permissions through the configured service, subject to native Confluence rights. Colleagues with the appropriate `entitlements.*` grants can then administer access; other users cannot grant permissions to themselves. There is no `Admin` directory role.

The directory role is separately set to `Manager`. The supported roles are `Reader`, `Author` and `Manager`. A reviewer is assigned per document and must be an Author or Manager. An approver must be the assigned Manager. **Before BR47149 can save a first draft, add another real Manager to the directory.** The current editor requires reviewer/approver assignments when saving a new document, and neither can be its author. One additional Manager may hold both assignments under the current rules. This one-person bootstrap is sufficient to initialize access administration, not to run an entire document workflow alone.

**Adding colleagues:** the Entitlements interface manages permission rows through its service. It does not currently onboard people into the protected directory or change their Manager/Author role. The service administrator must update that directory and the reader projection under the workflow store's concurrency controls. Merely adding a grant does not make an unmapped colleague an author or manager. Do not replace an existing store with a fresh seed to add a person.

## Saved items, workspaces, rules and audit

| Feature | What is stored | Do you upload a starter? |
| --- | --- | --- |
| My workspace | The caller's authorized documents and assignments from the shared workflow store. | No separate `my-workspace.json`. The protected initial workflow file above seeds the common store once. |
| Reviewer workspace | A filtered view of that same store for the assigned reviewer/approver. | No separate `reviewer-workspace.json`. |
| Saved items | Private document-ID references per authenticated user and WCSpedia root; current readable content is resolved when shown. | No shared `saved-items.json`. A deployed bookmarks service must return an empty collection for a new user and persist saves privately. The provided implementation has a client contract and local/mock examples, not an installed production service. |
| Content-health rules | Per-document rule revision, assignee, workflow status, verification evidence and audit. | No rules attachment is required. A missing record uses built-in defaults. The configured health service must persist the first authorized action and subsequent revisions. Its production host/persistence still needs deployment. |
| Suggestions | Suggestion records, document references, sender identity and decision history. | No attachment is read automatically. A deployed suggestion service is still required; the sample browser/mock storage is not durable production storage. |
| Audit trails | Entitlement `audit[]` lives with the policy in `entitlements.json`. Document and health `audit[]`, plus suggestion `history[]`, remain in their own protected stores. | No separate audit file. Domain commands generate events; the trusted host supplies actor/time and persists the event with the accepted change. Anyone allowed to read the policy JSON can also read its included entitlement audit. |

The native publication reference service **does** implement automatic private journal creation. On first use it reads `loadInitialState()`, validates the data, then writes the library state and later request/publication records through `createFileJournal()`. Those JSON files are stored in the service's private directory, not Confluence attachments. This file journal is for one Node process on one host; a clustered deployment needs a transactional shared store. A service host with authentication, native permission checks and configured adapters must be deployed before that happens.

The default health rules enable review, owner, approval and linked-resource checks, with 30-day review warning, 90-day resource-verification interval and 14-day work deadline. Managers with content-edit entitlement and native document permission can change document rules through the service. The governance checks still enforce the applicable business-review baseline. There is no background scheduled checker/reminder job installed by these files.

Starter audit arrays are empty because no application actions have occurred. Confluence attachment history records uploads; it does not replace the application's entitlement audit entries. Existing audit history must never be cleared when refreshing assets or migrating storage. JSON format alone does not make records immutable, so protect the policy attachment's write permissions and the trusted service's persistence. Private drafts, bookmark profiles and document review evidence must not go into the public reader attachment.

## Implementation references

The formats are validated against `entitlements.js`, `confluence.js`, `workflow.js` and `publication-workflow.cjs`. Automatic private journal writes are in `confluence-publisher.cjs`. Health defaults and transitions are in `content-health.js`; bookmark and health endpoint contracts are in [BOOKMARKS.md](BOOKMARKS.md) and [CONTENT-HEALTH.md](CONTENT-HEALTH.md). Deployment boundaries are documented in [ENTITLEMENTS.md](ENTITLEMENTS.md) and [NATIVE-PUBLICATION.md](NATIVE-PUBLICATION.md).
