# Ready to install

These files are the configured WCSpedia deployment, copied byte-for-byte from the verified package. Use this folder for installation; source code stays at the repository root.

## 1. Upload attachments

Upload **all files inside [attachments/](attachments/)** to Confluence attachment page **3962195316**, replacing matching filenames. Keep their filenames unchanged and upload them together. This includes the shared CSS, JavaScript, export/chart libraries, and 50 cover images. Do not upload this README, page HTML files or a ZIP as runtime attachments.

## 2. Replace page HTML macros

Open each existing Confluence page below, edit its application **HTML macro**, and replace the macro contents with the complete matching file. Publish the page. Uploading an HTML file as an attachment does not replace the macro. Each macro already contains its settings and matching script URLs; do not paste multiple page macros into one page.

| Page | Existing page ID | Macro contents |
| --- | --- | --- |
| Landing | `3954553300` | [pages/landing.html](pages/landing.html) |
| My Workspace | `3961735744` | [pages/my-workspace.html](pages/my-workspace.html) |
| Reviewer Workspace | `3961735749` | [pages/reviewer-workspace.html](pages/reviewer-workspace.html) |
| Saved | `3961735759` | [pages/saved-items.html](pages/saved-items.html) |
| Entitlements | `3961735763` | [pages/entitlements.html](pages/entitlements.html) |
| FAQ | `3973992401` | [pages/faq.html](pages/faq.html) |
| Insights / Blogs | `3961735728` | [pages/insights.html](pages/insights.html) |
| Credit Approval Control | `3961735771` | [pages/business-areas/credit-approval-control.html](pages/business-areas/credit-approval-control.html) |
| Credit Information Management | `3961735776` | [pages/business-areas/credit-information-management.html](pages/business-areas/credit-information-management.html) |
| Credit Management Reporting | `3961735781` | [pages/business-areas/credit-management-reporting.html](pages/business-areas/credit-management-reporting.html) |
| Deal Closing | `3961735791` | [pages/business-areas/deal-closing.html](pages/business-areas/deal-closing.html) |
| Documentation Pledging | `3961735795` | [pages/business-areas/documentation-pledging.html](pages/business-areas/documentation-pledging.html) |
| Emea Credit Admin | `3961735800` | [pages/business-areas/emea-credit-admin.html](pages/business-areas/emea-credit-admin.html) |
| Loan Management | `3961735803` | [pages/business-areas/loan-management.html](pages/business-areas/loan-management.html) |
| Regional Operating Manuals | `3961735808` | [pages/business-areas/regional-operating-manuals.html](pages/business-areas/regional-operating-manuals.html) |

## 3. Update the shared header helper

Use **[shared/navbar.html](shared/navbar.html)** in the existing **navBar** HTML macro, replacing only the previous WCSpedia helper fragment. Preserve the branded navigation and the existing `{include:wcspedia:navBar}` include. Do not add a second header or put a page application macro here. The supplied helper loads the shared WCSpedia stylesheet; retain the existing Citi Look and Feel theme.

## 4. Keep live data and refresh

**Keep the live entitlements.json and existing document data unchanged.** [first-install-only/](first-install-only/) contains starter files for a new installation, not an update. Working-root **3961735834** remains a protected workflow storage page; it does not receive an application macro.

Close old WCSpedia tabs and hard-refresh. For the failed Job aid publication, use **Check save / retry** on the existing document in Reviewer Workspace. Do not recreate it.

## Folder guide

- **attachments/** — all runtime files to upload to the one attachment page.
- **pages/** — seven application macros; **pages/business-areas/** contains eight filtered Explore macros.
- **shared/** — helper fragment for the existing navBar.
- **optional/** — existing-article compatibility helpers and an optional Insights header link. New publications already include the article sidebar; do not paste these into all pages or duplicate an existing header link.
- **first-install-only/** — starter JSON; skip for this existing installation.
- **templates/** — document examples and reference setup guides; not bulk-upload runtime files.
- **licenses/** — bundled library licenses and image/library source records.
- **docs/original-package-notes.md** — full release history using the original ZIP folder names (`html/`, `initial-json/`). Use the table above for this organized folder.
- **file-map.json** and **SHA256SUMS.txt** — original package mapping and integrity hashes.

## Rebuild after source changes

Run from the repository root:

```sh
node build-confluence-upload.cjs
python3 package-upload-ready.py
python3 package-configured-upload.py
python3 prepare-ready.py
```

Commit the refreshed ready folder alongside the source change. The preparation script verifies the configured package checksums before copying any files. Packaging validation does not confirm live Confluence permissions or server behavior.
