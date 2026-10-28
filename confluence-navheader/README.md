# Install into your existing navHeader

These fragments are already configured for WCSpedia and attachments page **3962195316**.
Keep your current shared-header page and Look and Feel include. Do not create another
header or replace its navigation. The HTML is content-only; no body, meta or font tags.

1. Extract the ZIP and upload the seven files in `attachments/` to page **3962195316**,
   replacing existing attachments with the same names. Do not upload the ZIP itself.
2. Update the existing global CSS inclusion with `html/wcspedia-global-styles.html`.
   Keep one CSS inclusion. It supplies the rounded Citi-blue Add document button.
3. Paste the whole `html/wcspedia-header-widget.html` into an HTML macro in your existing
   navHeader's right-hand action area. Replace any older Add document fragment.
   Keep its div, inline settings and BOTH script tags together, in the supplied order.
   This works on pages without a WCSpedia app root. When native Create exists,
   the widget moves immediately before it; otherwise it stays in your chosen slot.
4. Paste `html/wcspedia-article-discussion-header.html` into a separate HTML macro
   in that same shared header, replacing any older discussion-loader fragment.
   It adds no header button. It loads comments at the bottom of eligible articles,
   automatically near the viewport or when “Load article comments” is clicked.
5. Keep ONE notifications inclusion, using `html/wcspedia-notifications-header.html`.
6. Publish the existing header and refresh a WCSpedia page.

## What Add document opens

It opens the existing My workspace page **3961735744** and its custom editor.
That page must already have the matching WCSpedia workspace macro installed.
This small package installs only shared-header widgets, not workspace/editor pages.

An active `content.create` grant in your LIVE `entitlements.json`, native creation
permission and access to Working page **3961735834** are required. Working must have
view restrictions for the author/reviewer/manager team. Keep that team able to edit
Working as required by the native permission check. JSON does not grant native rights.
On failure the button remains visible but disabled and logs “[WCSpedia Add document]” with the reason.
Its tooltip explains why it is disabled. Do not bypass permission checks to enable it.

## What article comments do

The loader mounts below eligible child articles, not in the header or on Landing,
workspaces, Entitlements, Saved or business-area parent pages. It uses native comments.
Successful submissions update in place without a page reload. Disabled article
comments stay disabled; users need Confluence permission to post.
If a script cannot load, Retry reloads comments in place; the native-comments link
is a recovery option.

All supplied URLs use the current hostname and `/confluence`; no config attachment,
custom backend or server installation is required. URLs keep `?api=v2` without cache-version suffixes. Hard-refresh after updating the attachments.
Preserve the live entitlements.json: no starter JSON is included here.
Local tests do not verify your internal server's permissions or successful installation.
