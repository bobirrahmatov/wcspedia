# WCSpedia native page styling flags

The four requested flags are **hide-title**, **hide-actions**, **hide-comments** and **hide-footer**. WCSpedia has a small shared-header script that calls the documented `citiStyleAdd` function (with separate string arguments) on explicitly marked **native child document page views only**. Landing, My workspace, Reviewer workspace, Saved items and Entitlements pages are excluded, including older application macros that still have a style-flags attribute. It uses the Citi theme CSS already shown in your screenshots. The demo switch panel is not needed on production pages.

The script makes no REST/CQL requests and does not wait for search, data or entitlement services. It does not add a header, stylesheet or font. Its behavior is presentation only: no permissions, native page title data, comments or audit records are removed. Breadcrumbs, sidebar, labels, likes and metadata retain their existing theme settings.

## Install once in your current shared header

1. Upload **wcspedia-page-style-flags.js** from **confluence-ready/attachments/** to the same attachment page as the other WCSpedia assets.
2. Open **wcspedia-page-style-flags-header.html** from the generated upload kit, or use the combined configured `html/wcspedia-navbar.html`. The configured kit already uses attachment host `3962195316`. Keep `/confluence` for your current deployment URL.
3. Add this script tag to the HTML macro in your **existing shared header page**, already included through Look and Feel. Retain the existing Citi theme CSS, navigation and other widgets. Load this helper once. Do not place an opt-in marker or `#wcspedia` app root in the shared header itself.
4. Deploy the updated publisher for automatic child-document marking, or mark an existing child document as below. Check a normal child-document view, its native edit screen, and the landing page.

This follows the existing HTML-macro/custom-header mechanism. Atlassian documents [JavaScript in HTML macros and Custom HTML](https://support.atlassian.com/confluence/kb/how-to-use-javascript-in-confluence/); the screenshot-specific Citi CSS and helper functions are your host customization, not a standard Confluence API.

## Application pages keep their existing presentation

Do not add the style flags to landing, My workspace, Reviewer workspace, Saved items or Entitlements. The generated application HTML files do not include them. The helper refuses to apply document flags whenever a `#wcspedia` application root is present, even if an older installed root still has `data-wcs-style-flags` or a document marker was accidentally included alongside it.

For previously installed application HTML, remove its `data-wcs-style-flags` attribute when convenient. Keep each page's existing role, content, IDs, service settings and two JavaScript tags. Replacing the shared helper is sufficient to make those legacy attributes inactive; the application bundles and global CSS do not need replacement solely for this correction.

This helper does not remove classes already owned by your separate Citi theme. If that theme independently hides a landing-page element, adjust its own setting.

## Automatically created native child document pages

The updated trusted publisher passes `hostStyleFlags: true` to the storage renderer by default. When it creates or updates a working/published child document body, the renderer adds:

- A normal native **Anchor macro** named `wcs-page-style-v1` as the opt-in marker.
- One escaped document-title heading inside the page content, so hiding Confluence's title does not leave the document untitled.

There is no executable JavaScript or HTML macro inserted into the document body. The shared header provides the script once; the body provides the marker. Standard Confluence anchors use a title-prefixed ID, which the helper recognizes by the exact anchor-name suffix. See [Atlassian's Anchor documentation](https://confluence.atlassian.com/conf710/anchors-1031839879.html).

Deploy the updated **confluence-publisher.cjs** and **confluence-storage.cjs** on the existing trusted service host to enable automatic marking of newly written documents. These server modules are included in the full source package; they do not run as browser attachments. Install the shared-header helper before enabling the new publisher output. A custom `renderStorage` adapter must implement the equivalent marker/heading behavior itself.

Existing document bodies are not silently rewritten. They acquire the marker on their next normal service-managed content write, or can be marked through an authorized native edit. Page IDs, business-area placement, exact-version review and approval checks are unchanged. Set `hostStyleFlags: false` in the **server's** publisher configuration if its native pages should keep normal host chrome; this is not an HTML macro setting. That change affects future rendered bodies, not existing saved pages.

## Existing native child documents and manually created children

Choose one of these opt-in methods:

- Add a normal **Anchor macro** with the exact name `wcs-page-style-v1`, and keep a visible document heading in the content.
- Add the supplied **wcspedia-page-style-flags-marker.html** fragment inside one HTML macro on that page. This fragment includes both `data-wcs-document-page` and `data-wcs-style-flags` to explicitly designate a native document, and requires a visible document heading.

Do not mark application pages, unrelated pages or the included global header. Being a child of WCSpedia alone does not activate the flags: the explicit marker avoids an extra ancestor/CQL request and prevents styling unrelated content. To make manually created children consistent, include the Anchor macro and a heading in the page template used to create them. Template preview is excluded by the helper; the resulting normal page view opts in.

## Per-page control and native editing

The document HTML marker requires `data-wcs-document-page` as well as `data-wcs-style-flags`. It accepts the four flag names separated by spaces or commas. For example, `<span hidden data-wcs-document-page data-wcs-style-flags="hide-comments hide-footer"></span>` preserves the host title/actions. Unknown flag names are ignored. `data-wcs-document-page data-wcs-style-flags="none"` opts that document out of this helper even if it also contains the native Anchor marker. Removing the marker opts out on subsequent loads. For a native page without an HTML marker, remove its style Anchor macro to opt out.

Add `wcsNativeUi=1` to a normal view URL to temporarily skip flags applied by this helper:

```text
/confluence/pages/viewpage.action?pageId=YOUR_PAGE_ID&wcsNativeUi=1
```

The native editor URL remains `/confluence/pages/editpage.action?pageId=YOUR_PAGE_ID`, subject to your real Confluence permissions. The helper skips native edit/create screens, preview, history, administration and iframe contexts. Editor Save/Publish/Cancel controls are not its targets. It also cleans up classes it owns when marked content is removed or the view becomes an editor.

Classes already applied by your existing theme or another script are preserved. Consequently, `none` or `wcsNativeUi=1` cannot undo flags that a different theme component already owns. Adjust that component's own settings if necessary.

## Timing and verification

The helper runs immediately when its script loads and on DOM readiness. A bounded initial observer handles late page content; once active, a coalesced DOM observer handles marker removal and editor transitions. There is no network call or recurring polling timer. A custom renderer that inserts its marker after the initial observation window can call `window.WCSPageStyleFlags.refresh()` after rendering. Repeated inclusion is idempotent.

Your supplied documentation confirms the host API:

```js
citiStyleAdd("hide-title", "hide-actions", "hide-comments", "hide-footer");
```

The helper passes flags as separate arguments, calls `citiStyleRemove` only for flags it added when leaving the marked view, and preserves flags already set by the theme. It rechecks when theme scripts load; while the function is unavailable it uses presentation-only body classes and the scoped rules in the shared CSS. It does not create another scrollbar or change access permissions. A native Anchor is the page marker, so article bodies need no embedded script and existing marked articles work after replacing the header helper.

Locally verified behavior includes automatic native-anchor activation, explicit child-document markers, exclusion of all five application pages (including legacy attributes and accidentally added document markers), late markers, duplicate scripts, cleanup, editor/preview exclusions, opt-out and preservation of other theme classes. Native storage output is validated as XML with a visible escaped title. The actual internal Citi theme CSS and live Confluence anchor rendering are not available here, so check that one application page keeps its host chrome and that one native child hides only the requested host elements after installation.

## Reader sidebar and Insights discovery (22 October update)

The sidebar is loaded by document/article readers, not by `navBar`. Keep the
existing navBar for shared styles, article flags and global widgets; its flag
helper no longer contains sidebar code. The WCSpedia app reader includes the
sidebar in its page bundle, and newly published native articles include a small
HTML macro loading `wcspedia-reader-sidebar.js` automatically.

For an existing WCSpedia-published native article, paste the configured
`html/wcspedia-reader-sidebar.html` once into an HTML macro in that article.
Do not add it to navBar or parent/interface pages. Alternatively, the next normal
publication through WCSpedia adds it. No bulk rewriting of existing articles is
performed. The sidebar CSS stays in the one shared `wcspedia-style.css`.
Replace the updated attachments and refresh open tabs to unload older scripts.

The sidebar activates only on a marked native published article or a WCSpedia
`.detail-page` reader. Landing, Insights listing, business-area parent views,
workspaces and editors do not activate it. It only decorates the existing native
sidebar: Confluence owns widths, positioning, scrolling, child-page loading and
collapse controls. No replacement rail, title, icons, buttons or navigation tree
is created. If no native sidebar exists, nothing is added. An inherited
`citi-hide-sidebar` class is temporarily removed during reader display and restored
when leaving it; Confluence's collapsed preference remains untouched.

Insights cards read public excerpts and cover metadata in the existing paginated
native content request. A missing or failed image uses a local inline SVG. An
empty first indexed search now checks the configured Insights children, honoring
query/type/topic/date filters. Recovery scans at most four batches initially and
provides Next when more children remain; it never substitutes private workspace
JSON. Nested native content remains covered by normal scoped CQL. This fallback
helps newly published direct children while indexing catches up; it does not
repair Confluence's index or prove the internal server is healthy. Failed recovery
reads remain visible errors rather than false empty results.

Design references reviewed: [21st sidebar](https://preview.21st.dev/@arunjdass/components/dashboard-sidebar),
[Dribbble side navigation](https://dribbble.com/search/side-navigation-collapse),
and [ReUI sidebar examples](https://reui.io/docs/changelog#v260---17-september-2026).
The implementation uses the existing plain JavaScript/CSS delivery, with no React
runtime or external icon/image dependency.

The October 23 correction replaces the earlier custom rail with a small native
skin. The native page tree keeps its indentation, arrows, Space tools and collapse
control. Styles only adjust Citi colours, hover/focus states and current-page
highlighting, so native content offsets are not overridden.
