**Current space-only deployment:** use [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md). The configured package uses native-session persistence for authoring, approval, entitlements, favourites and suggestions. Custom service instructions below are legacy reference and are not required for this installation.

# Shared Add document widget

The widget fits inside the existing Confluence header. It opens the established WCSpedia creation screen in My workspace with the selected document type. It does not render another header or another knowledge-base application.

## Install one package

Use **WCSpedia-configured-upload.zip**, expanded to **confluence-ready/**. Upload all `attachments/` files to page **3962195316**. In the existing navBar, replace old WCSpedia widget, CSS and helper fragments with **one** `html/wcspedia-navbar.html` macro in the right-hand action row. Keep your navigation, native Create and fonts. No separate header ZIP, config attachment or widget stylesheet is needed.

The single `wcspedia-style.css` includes both page and navbar styles. The supplied macro uses the current hostname and `/confluence`, with your page IDs already filled in. It loads matching `wcspedia-add-document.js` and `wcspedia-add-documentHTMLPage.js` files. URL cache suffixes are removed; hard-refresh after replacing both attachments.

The widget keeps its own settings and isolated modules. It does not change the page's `WCS_CONFIG` or start its app/splash. Live page bundles do not mount another widget. Repeated includes reuse one header instance and remove duplicate known mount slots, without touching native Create. Old manually written buttons/styles must be removed during installation.

## Access and creation

The configured package uses `authoringMode: 'confluence-session'`. Keep legacy service URLs empty. Access is checked on mount, menu opening and type selection using the current user, their active `content.create` grant in **entitlements.json**, and native Confluence permissions. Working page **3961735834** must have verified view restrictions for the author/reviewer/manager team. See [NATIVE-SPACE-SETUP.md](NATIVE-SPACE-SETUP.md).

Keep the live policy's `schemaVersion`, `revision`, `records` and `audit`. These internal fields are maintained by Entitlements; they are not filename suffixes. Do not replace production grants/history with a starter. The native metadata key is not an additional JSON filename.

During initial checks, denial or setup/network errors, Add document remains visible and disabled. Its tooltip explains the reason, and the console records `[WCSpedia Add document]`. No errors appear beside the button. JSON grants never elevate native Confluence permissions. The native-session workflow rechecks access on mutations; it is a cooperative workflow, not a new server-enforced approval boundary.

Each access check is bounded to 12 seconds by default (optional `accessTimeoutMs`, 1000–30000). This is a deadline, not a minimum wait. Timeout, update and destruction cancel the request; late results cannot enable creation or navigate. After correcting configuration or access, reload the page; custom integrations can call `control.update(...)` to perform a fresh check. A failure during an explicit user action may show the shared notification toast, while the button remains disabled.

The button uses Citi blue `#255be3`, white text/icons, an 8px radius and a 36px height, with darker hover/pressed states and a visible keyboard focus ring. Scoped `!important` rules protect it from Confluence theme overrides. It inherits the header font.

Startup targets `#quick-create-page-button`, then `#create-page-button`, inside the header. It moves only the WCSpedia slot before the complete Create button group. In a native navigation list it inserts the inline slot inside the existing list item; disabled states retain this same slot. For a custom header, mark the Create button or its complete group with `data-wcs-create-anchor`. When no target exists, the slot stays at its supplied location. A coalesced header-only observer allows late action rendering, then disconnects after placement or eight seconds; there is no polling or extra network call. The native controls retain their own order, handlers and styles.

The native selectors are documented in [Atlassian's Create button guidance](https://support.atlassian.com/confluence/kb/how-to-override-the-quick-create-page-button-in-confluence-data-center/) and [selector reference](https://support.atlassian.com/confluence/kb/how-to-hide-elements-in-confluence-using-css-or-javascript/).

When allowed, choosing a type navigates to the configured workspace page's `#/create?type=...` route. The workspace verifies its authorized data, identity and permissions again. The native-session workflow creates a restricted working page and publishes approved content beneath its configured parent. The header itself performs no writes. Validate this with separate author and reviewer accounts on the internal instance before rollout.

Before navigating, the header emits a cancelable `wcspedia:navigate` document event with `detail.href`. An already-mounted WCSpedia application can handle it through its normal navigation and unsaved-edit guard. On ordinary Confluence pages, the widget navigates directly to the same-origin workspace URL.

The type list should match the shared taxonomy. `Procedure` is omitted from the supplied menu consistently with the existing authoring controls and supplied document naming guidance. A string or `{value, label, description}` object is supported.

## Component API for existing integrations

The maintained `add-document-widget.js` component remains available to the application and custom integrations. The upload builder packages it with the entitlement resolver and Confluence access adapter as `wcspedia-add-document.js`.

```js
const control = WCSAddDocument.mount(document.getElementById('nav-add-document'), {
  canCreate: async ({signal}) => {
    const access = await confluenceAdapter.loadAccess({signal});
    return access.effectivePermissions['content.create'] === true;
  },
  types: ['Job aid', 'Blog', 'Training', 'Report'],
  createUrl: '/confluence/pages/viewpage.action?pageId=AUTHOR_PAGE_ID#/create'
});
await control.ready;
await control.update({types: updatedContentTypes});
control.destroy();
```

`canCreate` must resolve to boolean `true`. The optional `unavailableMessage` disables the component while an integration is unavailable and logs the supplied diagnostic to the console. Supply only a static, non-sensitive diagnostic. Labels are rendered as text. These browser checks are presentation controls; native Confluence permissions remain authoritative for every write.

`createUrl` must be same-origin. A string receives the selected `type` in its hash route. A function `(type) => url` may supply the full destination. An optional `navigate(url, type)` callback lets an already-mounted application preserve its unsaved-change confirmation flow.

The menu supports Enter/Space, arrow keys, Home/End, letter navigation, Escape, Tab and outside dismissal. It is portaled outside header containers so clipping does not hide it. Its button events do not bubble to Confluence's delegated page-action handlers.
