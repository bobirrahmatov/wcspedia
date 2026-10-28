> Current space-only deployment: use the six configured `confluence-ready/html/` macros and JavaScript pairs described in [UPLOAD-READY.md](./UPLOAD-READY.md). They start one overlay inline before attachment downloads; the app adopts it. There is no startup skeleton or delayed splash. The older shared-bundle examples below are retained for reference and should not replace the configured deployment. Native header painting before macro execution is outside the page loader's control.

# Loading overlay in a shared Confluence header

The overlay now has **one Citi logo inside the central panel**, above the progress bar. There is no logo in the top-left background. The existing WCSpedia page design is unchanged.

## What belongs where

| Location | Contents | Responsibility |
| --- | --- | --- |
| WCSpedia attachment host page | Shared CSS, loader JavaScript, application bundle and existing configuration/data attachments | Hosts the versioned files referenced by the macros. This can remain your current WCSpedia parent page. |
| Shared header page | `wcspedia-global-header-confluence-macro.html` inside an HTML macro | Loads the shared stylesheet and defines the loader component. It does not start the application or display an overlay on its own. |
| Each WCSpedia application page | Its matching macro from `confluence-global-header/` | Supplies its own application container, page role, configuration and application script. This script controls the actual loading lifecycle. |
| Native document child pages | Their normal Confluence document content | Continue to use Confluence normally. Merely including the shared header does not show the WCSpedia loader on these pages. |

## Install using your shared header page

1. Upload the rebuilt `wcspedia-style.css`, `loading-overlay.js`, `wcspedia.js` and `publication-config.js` to the existing WCSpedia attachment host. Retain the existing `wcspedia-published.json` and other configured attachments there. The loader's Citi SVG and fonts are embedded in the shared CSS; no additional loader logo attachment or CDN is needed.
2. Create or edit your **WCSpedia shared header** page. Add an HTML macro and paste the contents of [wcspedia-global-header-confluence-macro.html](./wcspedia-global-header-confluence-macro.html). Replace `REPLACE_WITH_WCSPEDIA_PAGE_ID` with the actual attachment-host page ID. Keep the generated `v=` values in the URLs. Add this to the existing header content; do not replace your navigation or Citi style controls.
3. Include that header through your current site/theme header mechanism. With the standard space header, use **Space tools → Look and Feel → Sidebar, Header and Footer → Header** and add the following wiki markup, substituting your space key and actual header page title:

   ```text
   {include:YOURSPACE:WCSpedia shared header}
   ```

   Standard space-header configuration affects that space. If your existing theme includes a header site-wide, retain that mechanism and scope. All intended users need view access to the included header and its attachment-host page. Atlassian documents both the [header fields](https://confluence.atlassian.com/doc/configure-the-sidebar-317194694.html) and [Include Page wiki markup and permissions](https://confluence.atlassian.com/doc/include-page-macro-139514.html).
4. Paste the matching **shared-header variant** into one HTML macro on each application page:

   | Page | Fragment |
   | --- | --- |
   | Landing / Explore / document details | [WCSpedia-confluence-macro.html](./confluence-global-header/WCSpedia-confluence-macro.html) |
   | My workspace | [wcspedia-my-workspace-confluence-macro.html](./confluence-global-header/wcspedia-my-workspace-confluence-macro.html) |
   | Reviewer workspace | [wcspedia-reviewer-workspace-confluence-macro.html](./confluence-global-header/wcspedia-reviewer-workspace-confluence-macro.html) |
   | Saved items | [wcspedia-saved-items-confluence-macro.html](./confluence-global-header/wcspedia-saved-items-confluence-macro.html) |
   | Entitlements | [wcspedia-entitlements-confluence-macro.html](./confluence-global-header/wcspedia-entitlements-confluence-macro.html) |

   Configure their existing page IDs and endpoints as before. Use one fragment per application page. These variants omit the stylesheet link because the header loads it. Do not also paste the root-level variant onto the same page.
5. Keep `#wcspedia`, `window.WCS_CONFIG` and `wcspedia.js` out of the shared header. They are page-specific. Loading the full application from a header could start it before its container exists or initialize it twice. Loading the small `loading-overlay.js` definition again from the application bundle is safe: it retains the existing component instead of replacing it.

If the setup uses **General Configuration → Custom HTML** instead of an included header page, that field accepts the fragment's raw `<link>` and `<script>` tags, not `{include:...}` wiki markup. Use one shared installation method. See [Atlassian's JavaScript guidance](https://support.atlassian.com/confluence/kb/how-to-use-javascript-in-confluence/). The supplied screenshots demonstrate your HTML-macro/Citi style controls; they do not identify which header integration is configured on the live server.

## When it opens and closes

1. The page's application script starts and opens the overlay.
2. It loads the signed-in session, entitlements and documents. The initial wait is indeterminate because a download percentage is not known.
3. It advances the bar after completed initialization steps and waits for saved items/content-health loading to settle. Unavailable optional services retain their existing unavailable states.
4. It renders the page and removes the overlay. The explicit workspace-refresh action uses the same component.

The bar measures completed initialization steps, not network bytes. Startup errors or a read wait exceeding 60 seconds remove the overlay and expose the existing retry screen. Workspace-refresh failures remove the overlay and retain the existing error feedback. Background metrics/charts and document saves retain their existing feedback. No arbitrary delay keeps the overlay visible after the page is ready.

The shared header makes the loader **available** everywhere it is included. It does not automatically display it for unrelated native pages, wait for all other macros, or measure the initial Confluence HTML response/script download. Those happen before WCSpedia's application starts or belong to other components.

For another custom widget in the same header-enabled space, explicitly connect the shared component to that widget's real promise and always clean it up:

```js
async function loadWidget() {
  const target = document.getElementById('your-widget');
  if (!target) return;
  const loading = window.WCSLoadingOverlay.create({target});
  loading.show('Loading your workspace…');
  try {
    const data = await loading.wait(loadYourWidgetData());
    renderYourWidget(data);
  } catch (error) {
    renderYourWidgetError(error); // Provide a visible error and retry control.
  } finally {
    loading.destroy();
  }
}
```

The `loadYourWidgetData`, `renderYourWidget` and `renderYourWidgetError` names above are placeholders for that widget's functions; WCSpedia already implements its own lifecycle. Use one owner for a full-screen overlay on a page rather than opening separate layers for concurrent widgets. The bounded wait is intended for reads; do not use a timeout to report a write as cancelled when the server may still commit it.

## Installation check

Open one WCSpedia page: confirm one central Citi logo, one overlay, and a usable page after loading. Check My workspace, Reviewer workspace, Saved items and Entitlements. Open an ordinary native document: the shared assets may load, but no WCSpedia overlay or duplicate application should appear. For a future update, deploy the rebuilt assets and matching versioned header/page fragments together; update the single global CSS URL as part of that release.

These files are prepared and locally verified. No live Confluence header, page, permission or server configuration has been changed by this update.
