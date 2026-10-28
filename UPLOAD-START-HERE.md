# Start here — complete WCSpedia package

This archive includes the current Confluence upload kit, all JSON starters, the MDX document/metadata templates, header widget, child-page style flags, maintained source, server integration references and tests.

Browser asset revision: **d4b332e7505a**. Use files from `confluence-upload/` for the current Covenants-style installation. The root-level prototype/data files are local demonstrations and source material, not live reader data.

## Update the existing installation

1. Upload the ten page JavaScript attachments from `confluence-upload/attachments/`, keeping their filenames. Each of Landing, My workspace, Reviewer workspace, Saved items and Entitlements has a logic `.js` and matching `HTMLPage.js`.
2. Upload `confluence-upload/attachments/wcspedia-document.mdx` to the same shared attachments page. This is the hosted **Download MDX template** file. The reusable metadata-only block is `confluence-upload/templates/wcspedia-metadata.yaml`; it is authoring reference and does not need a runtime attachment.
3. Use the matching fragments in `confluence-upload/html/` as HTML macro content on the five native pages. Preserve your real inline page IDs, business-area mappings, context path and service endpoints. Update both script URLs to revision `d4b332e7505a`. HTML files must be pasted into macros; uploading them alone does not execute them.
4. The supplied `wcspedia-style.css` and logos are included for completeness. This MDX update does not change them. Keep the existing global CSS inclusion, header and inherited fonts.
5. If you use the Add document widget, update its matching JS pair and configured header macro. Child-page flags have their own script and header fragment. Both are included in the upload kit and in their separate `confluence-header-widget/` and `confluence-page-style-flags/` folders. These fragments integrate into your existing header.
6. Open a document and test **Download → MDX file** and **Download MDX template**. The template URL derives from `attachmentPageId`. The templates and examples are described in `confluence-upload/docs/MDX-IMPORT.md`.

**Keep existing live JSON and audit history.** The JSON files supplied here are initialization seeds, not replacements for your current library or policy. In particular, skip the empty `confluence-upload/attachments/wcspedia-published.json` during a normal asset update.

## JSON files for first installation

Use the coordinated files in `confluence-data-starters/` when initializing a new library:

| File | Destination / purpose |
| --- | --- |
| `entitlements.json` | Upload once to the shared attachments page configured as `attachmentPageId`. The filename is read automatically. Contains the initial BR47149 administrator grants. |
| `wcspedia-published.json` | Upload once to the shared `attachmentPageId` for a new library. Includes the BR47149 directory mapping, eight areas and no documents. |
| `wcspedia-workflow-initial.json` | Protected server initialization input for the shared author/reviewer workflow store. Keep off the shared attachments page. |
| `initial-users.json` | Offline bootstrap input; not read by the browser. |
| `reference/content-health-defaults.json` | Reference copy of built-in rules; not a live rules attachment. |

The matching starter policy is also included at `confluence-upload/initial-data/entitlements.json`. Use one policy attachment. Native entitlement tables are no longer read or included. Keep the Entitlements interface page; it displays the JSON policy.

Read `confluence-data-starters/README.md` for initialization, the separate permission-page ID and the reviewer/approver directory requirements. Saved items and workspaces use their services; separate shared saved-items/my-workspace/reviewer-workspace JSON attachments are not required. Audit records are stored with the corresponding domain data.

## Service integration

The full maintained source and trusted-service reference modules are included at the archive root. Uploading browser attachments does not install those services. Configure deployed workflow, entitlement, bookmarks and suggestion endpoints using the current guides. Existing working services should retain their data and configuration.

Start with `confluence-upload/README.md`, `DATA-STARTERS.md`, `NATIVE-PUBLICATION.md` and `CONFLUENCE-WORKFLOW.md`. The current scripts and MDX downloads have been verified locally; this package has not been uploaded to your internal Confluence server.
