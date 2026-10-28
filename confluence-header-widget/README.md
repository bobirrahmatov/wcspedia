# WCSpedia Add document — existing header widget

Build: **0e9cb9fc66a7**. This folder contains only the separate header widget. Prefer the matching `html/wcspedia-header-widget.html` in **WCSpedia-configured-upload.zip**: it already has your supplied page IDs. This standalone kit retains installation placeholders.

| File | Where it goes |
| --- | --- |
| [wcspedia-header-widget.html](wcspedia-header-widget.html) | Configure its placeholders, then paste the whole fragment into one HTML macro on your existing shared header page. |
| [wcspedia-add-document.js](wcspedia-add-document.js) | Upload to your Confluence attachments page. Contains widget logic and its access dependencies. |
| [wcspedia-add-documentHTMLPage.js](wcspedia-add-documentHTMLPage.js) | Upload beside the first JS file. Renders and starts the widget. |

The existing global **wcspedia-style.css** from this WCSpedia release supplies the styles. This kit deliberately adds no second stylesheet, header, font, full application or document JSON. Keep the existing **navBar** page and Look and Feel inclusion **`{include:wcspedia:navBar}`**. Load the shared wcspedia-notifications.js using wcspedia-notifications-header.html from the complete upload kit once in that header for action notices.

## Configure once in the HTML

Edit these values in **WCS_ADD_DOCUMENT_CONFIG**. They belong to the widget; leave the page's **WCS_CONFIG** alone.

| Setting | Value |
| --- | --- |
| authoringMode | Keep `confluence-session`. The widget checks access through built-in Confluence REST using the current account. |
| contextPath | `/confluence`, already correct for your current URL structure. The current hostname is used automatically. |
| spaceKey | Exact Confluence space key: `wcspedia` for this installation. |
| attachmentPageId | Numeric ID of the page hosting these JS attachments and the live entitlements.json. Also replace **REPLACE_WITH_ATTACHMENTS_PAGE_ID** in both script URLs. |
| rootPageId | Numeric ID of the WCSpedia landing page. |
| workspacePageId | Numeric ID of the My workspace page containing its WCSpedia HTML macro. |
| nativePublication.workingRootPageId | Numeric ID of the restricted Working parent, matching the My workspace macro. |
| nativePublication.insightsPageId | Numeric ID of the Insights parent, matching the page macros. |
| workflowEndpoint / workspaceEndpoint | Leave both empty in native-session mode. No custom service or server deployment is required. |
| accessTimeoutMs | 12000 by default, accepting 1000–30000. A deadline for stalled checks, not a minimum delay. |
| types | Supplied document-type menu. Keep it aligned with your WCSpedia taxonomy. |

Keep the live `entitlements.json` attachment. The current account needs the WCSpedia Add documents grant and native access to the configured pages. Restrict viewing of Working to the author/reviewer/manager team and keep it editable by that team; on Data Center versions without space operations, verified Working-page edit permission supplies positive evidence of Add page permission. Actual writes still require native Add/Edit page, Add attachments and Restrict permissions where used. A JSON grant cannot provide native permissions. Missing policy, invalid setup or denied access keeps the button visible but disabled, with the reason in its tooltip and no extra header error text.

## Install

1. Upload the **two JS files** together, preserving their exact names. Each attachment must be at most **10 MB (10,000,000 bytes)**; extract the ZIP and upload the individual files.
2. Paste the **whole HTML fragment**, including its settings and script tags, into the existing header page's HTML macro. Configure the IDs above and leave the service URLs empty. Keep the widget host in the existing header action row. Startup places it before native Create and preserves the Create/ellipsis group. For a custom Create button/group add `data-wcs-create-anchor` to that element. If no target exists it stays where you place it. Native controls keep their order and styles.
3. Keep the order **settings → wcspedia-add-document.js → wcspedia-add-documentHTMLPage.js**. Do not add async/defer or a separate config file.
4. Replace both JS attachments together. URLs keep `?api=v2` only; no cache-version suffix is needed. After an update, hard-refresh to clear previously cached scripts.
5. Publish the configured header page and refresh a WCSpedia page. Check with a permitted author and a reader account.

An authorized user selects **Add document → content type**. The widget opens the configured My workspace page at `#/create?type=...`, where the existing editor verifies access again. The existing editor saves working pages through native Confluence APIs and retains the separate review and approval actions before publishing beneath the chosen business area or Insights. The widget itself creates no page. The matching My workspace bundle is required; this header-only kit does not install that page. An open WCSpedia editor retains its unsaved-change navigation guard.

Access is freshly checked at startup, menu opening and selection. The button stays visible and greyed out during initial checks, on errors, and for users without creation permission. Late permission results cannot grant access after cancellation. Diagnostics are written to the console without occupying header space. Native Confluence authorizes every actual write. This is a cooperative browser workflow: native Add/Edit rights also permit actions outside WCSpedia. It is not a new server-enforced approval policy. Read `templates/NATIVE-SPACE-SETUP.md` in the full configured package for setup, conflict recovery and the two-account acceptance check.

## Verification and updates

This package is locally verified, not installed on the internal Confluence server. Use **SHA256SUMS.txt** to verify its files. Save your configured HTML separately before rebuilding: `package-header-widget.py` regenerates this folder from the canonical upload kit and restores placeholders. Both JS files must come from the same build. Replace the existing global wcspedia-style.css with the matching file from the complete upload kit and hard-refresh after uploading. It supplies the Citi-blue rounded button, white label/icons, interaction states and spacing before Create; keep one stylesheet inclusion.
