# WCSpedia logo

`assets/wcspedia-logo.png` is the original PNG supplied for WCSpedia, copied without alteration. The main landing page loads the logo through `window.WCS_CONFIG.brandLogoUrl`.

## Confluence installation

1. Upload `assets/wcspedia-logo.png` to the page hosting the shared WCSpedia attachments, keeping the attachment filename `wcspedia-logo.png`.
2. Use the generated page macro and replace `REPLACE_WITH_WCSPEDIA_PAGE_ID` with that attachment page's ID. Its `brandLogoUrl` points to `/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/wcspedia-logo.png?api=v2&v=BUILD_REVISION`.
3. If your logo lives on another attachment page, change only `brandLogoUrl` to that same-origin attachment URL in each WCSpedia page's configuration. Keep the configured `/confluence` context path consistent with your installation.

The shared-header installation uses the same setting in the page fragments under `confluence-global-header/`. Keep application configuration on each application page; the shared header loads the common assets.

## Local previews and updates

Local previews use `assets/wcspedia-logo.png`. Portable prototype files embed the PNG, so they can display it without a separate asset folder or network request.

To replace the logo, replace `assets/wcspedia-logo.png`, update its provenance record, run `node build.cjs`, and then run `python3 package-confluence.py`. Upload the new attachment version and the regenerated shared assets and page macros. The build revision includes the logo bytes, and generated Confluence logo URLs include that revision to refresh the browser cache.

The Citi logo used by the loading overlay and document exports is configured separately and is unchanged by this setting.

## Design references

The existing WCSpedia palette, typography, rounded surfaces, business-area cards and document workflows are retained. The single landing page uses the brand/hero component. The supplied PNG is displayed whole beside a readable text wordmark, with a text fallback if its attachment cannot load. Search opens results directly from the landing page, with document-type filters available in those results.

References reviewed for spacing, search emphasis and content navigation:

- [Citi All Insights](https://www.citigroup.com/global/insights/all): restrained typography, white space and content navigation.
- [Knowledge Base — landing page draft by Christos on Dribbble](https://dribbble.com/shots/4601629-Knowledge-Base-landing-page-draft): prominent search and clear entry points to a knowledge collection.
- [Search Field by jolbol1 on 21st.dev](https://21st.dev/@jolbol1/components/searchfield): accessible search-field patterns. The existing plain JavaScript search remains in use; no React dependency or third-party component code was added.
