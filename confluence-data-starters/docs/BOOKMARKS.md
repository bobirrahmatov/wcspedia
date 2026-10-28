# Personal saved items

Choose **Save** on a document to add its stable document ID to your personal library. The action becomes **Saved** and can be selected again to remove it. **Saved items** is its own Confluence page, accessible from native navigation and workspace links. It shows the same shared table used across WCSpedia, with search, compact pagination, saved date, and the current approved version. Saved items are ordered by saved date, newest first, with a stable document-ID tie break.

A bookmark refers to the document, not the version currently on screen. Opening a saved document uses its current approved version. A newer draft does not replace that approved version. Publishing a new version automatically changes what the saved link opens without creating a second bookmark. The preference store contains no copied title, body, attachment, approval record, or document version.

Only known, readable, nondeleted documents with a current published version appear. Availability and native read access are checked again whenever the list is resolved. Unknown, unpublished, inaccessible, and deleted documents are excluded without exposing their content. Their references may remain in the personal preference record, so restored access can make an item visible again. Removing an existing reference does not require access to its former content.

## Standalone page and shared assets

The build generates three entry points for this page:

- `wcspedia-saved-items.html` is the local preview, loading the existing shared `wcspedia.js` and `wcspedia-style.css` files.
- `WCSpedia-saved-items-prototype.html` is the portable preview with embedded sample data and shared assets.
- `wcspedia-saved-items-confluence-macro.html` is the content-only fragment for a separate Confluence page. It loads the shared `wcspedia.js` attachment and intentionally includes no stylesheet link or inline styles.

Load the shared stylesheet once in the global Confluence layout, using the common asset page:

```html
<link rel="stylesheet" href="/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/wcspedia-style.css?api=v2">
```

Create the Saved items Confluence page and paste its macro there. Replace `REPLACE_WITH_SAVED_ITEMS_PAGE_ID` in **every** page's shared `WCS_CONFIG.pages.saved` mapping. Keep `rootPageId` pointed to the knowledge library's existing asset/data parent, not the new Saved items page: personal preferences belong to the same library scope across entry points. Set the same authenticated `bookmarksEndpoint` in each macro. Add the new page to the native Confluence sidebar or global navigation.

The Saved page uses `pageRole: 'saved'`, which defaults to `#/saved` without requiring a hash in the sidebar URL. Its standalone layout contains the WCSpedia breadcrumb, Saved items heading, search, and table; workspace tabs are omitted because page navigation belongs to the native Confluence sidebar. Search and pagination stay on that page; document links and the WCSpedia breadcrumb return to the main library. Existing workspace `#/saved` links are routed to `pages.saved` once configured. Older direct hashes and configurations without `pages.saved` still render Saved items locally for compatibility. All entries use one JavaScript runtime and shared components, so the page does not create a second preference store or a separate copy of the bookmark behavior.

## Shared module

Load `bookmarks.js` before `library-workflows.js` and `app.js`. `build.cjs` includes this order. The browser global is `WCSBookmarks`; Node tests use `require('./bookmarks.js')`.

```js
const savedItems = WCSBookmarks.create({
  mode: config.mode, // embedded/local prototype or confluence
  identity: signedIdentity(), // {soeid: 'AM12345'} from the existing identity module
  storage: window.localStorage,
  key: 'wcspedia.bookmarks.v1',
  rootPageId: config.rootPageId,
  endpoint: config.bookmarksEndpoint,
  baseUrl: location.href,
  fetch: window.fetch.bind(window),
  requestTimeoutMs: 10000,
  withLock: (name, task) => navigator.locks.request(name, task),
  getDocuments: () => documents,
  canRead: doc => WCSEntitlements.nativeHas(nativeRights().documents[doc.id], 'read'),
  publishedVersion: WCSWorkflow.publishedVersion
});

let state = await savedItems.load();
// {available:true, revision:0, bookmarks:[]}
state = await savedItems.set(document.id, true, {
  expectedRevision: state.revision,
  requestId: 'bookmark-' + crypto.randomUUID()
});
const rows = savedItems.resolve(state);
// [{documentId, savedAt, doc, version}] using the current authorised catalog
```

`set(id, false, …)` removes a saved item. `requestId` is optional; the module generates a secure UUID if omitted. Use the same request ID and the same command when retrying an uncertain network result. Reusing an ID for different content is rejected. An old successful save replayed after a later removal cannot silently recreate the item; it returns a conflict. A repeated save of an already-saved item does not change its saved date or increment the revision.

Live requests have a 10-second deadline covering the request and JSON response body; `requestTimeoutMs` can be configured between 1 and 60,000 milliseconds. The request is aborted on timeout, and the operation rejects even if a request adapter ignores the abort signal. An unknown POST outcome is never called saved or unsaved. Failed POST errors retain `requestId` and `retryCommand: {documentId, saved, expectedRevision, requestId}` for an exact retry after checking current state. A timeout does not prove that the server failed to commit.

The SOEID is normalized and copied when the instance is created. Recreate services when the signed-in identity changes. The host must clear or disable the previous identity's state during that transition and suppress stale asynchronous results after navigation or teardown. Current read permissions come from the host and are checked on every projection; the production service independently enforces them.

## Prototype storage

Local preferences use the exact configured storage key, normally `wcspedia.bookmarks.v1`. The record contains schema version 1 and separate profiles keyed by library root and uppercase SOEID. Each profile holds a revision, `{documentId, savedAt}` pairs, and idempotency command records. Changing one profile preserves all other users and library roots.

Every mutation rereads the record inside a serialized critical section. Instances sharing a storage adapter share an in-process queue. Browser tabs additionally use the injected Web Locks adapter; the module automatically uses `navigator.locks` if available. A host without Web Locks must provide an equivalent cross-context lock before enabling concurrent local writes. An in-process queue alone cannot coordinate independent tabs.

Writes are confirmed by reading back the stored value. Storage exceptions, quota exhaustion, silent storage failures, invalid records, and stale revisions are errors, never a successful in-memory fallback. Corrupt data is not reset or overwritten automatically. The local record is prototype storage on the current browser, not authenticated production storage or a secure boundary between people sharing that browser.

Listen for `storage` events on `savedItems.storageKey` to reload another tab's changes. Do not overwrite a user's active editor or modal while refreshing the table. No content revision or approval audit event is created by saving a personal bookmark.

## Confluence service contract

Configure `window.WCS_CONFIG.bookmarksEndpoint` to a same-origin service path. A live deployment with an empty endpoint returns:

```js
{available: false, revision: null, bookmarks: [], reason: '…'}
```

Mutations then fail with `BOOKMARKS_UNAVAILABLE`. The live client never falls back to local storage or writes personal bookmarks into a shared Confluence JSON attachment. External endpoints, credentials in URLs, query-bearing endpoint configuration, and URL fragments are rejected.

Load request:

```http
GET /confluence/your-service/bookmarks?rootPageId=12345
Accept: application/json
```

Save/remove request:

```http
POST /confluence/your-service/bookmarks
Content-Type: application/json
Accept: application/json
X-Requested-With: XMLHttpRequest
Idempotency-Key: bookmark-9b682d5d-71f7-4c6d-b13e-75dfe2e4af26

{
  "schemaVersion": 1,
  "rootPageId": "12345",
  "documentId": "wcs-doc-1c656e03-eabc-4997-9d13-9dcd901d79a2",
  "saved": true,
  "expectedRevision": 7,
  "requestId": "bookmark-9b682d5d-71f7-4c6d-b13e-75dfe2e4af26"
}
```

Both requests use `credentials: 'same-origin'`, `cache: 'no-store'`, and reject redirects. The browser sends no SOEID, actor, role, or permission decision. The service resolves identity from the authenticated Confluence session, validates origin/CSRF and the library root, and rechecks native document read access plus current publication/deletion status before a save.

Both successful responses have exactly this shape and an `application/json` content type:

```json
{
  "schemaVersion": 1,
  "rootPageId": "12345",
  "subjectSOEID": "AM12345",
  "revision": 8,
  "bookmarks": [
    {
      "documentId": "wcs-doc-1c656e03-eabc-4997-9d13-9dcd901d79a2",
      "savedAt": "2026-10-15T12:00:00.000Z"
    }
  ]
}
```

The response subject is server-derived and must match the client's pinned normalized identity. The client also validates the root, schema, revision, exact fields, unique IDs, and canonical UTC timestamps. It never trusts titles or bodies from a bookmark response. A successful mutation must confirm the requested membership before the UI reports success.

Use a durable server store keyed by `(rootPageId, authenticatedSOEID)`. Check the expected revision, apply membership changes, increment revisions, and record idempotency keys within one transaction. Idempotency keys are scoped to the authenticated identity and library. Return `409` or `412` for conflicts, `401`/`403` for session or permission failures, and a failure status for storage errors. Do not acknowledge a save before durable commit. Personal preference permissions must prevent one user from reading or modifying another user's bookmarks, independently of the shared document catalog.

## Local verification service

`mock-bookmarks-route.cjs` exports `createRoute({rootPageId, origins, getActor, getDocuments, canRead, publishedVersion})`. Mount the returned async handler as `if (await route(req, res, url)) return;`. Its default route is `/confluence/mock/bookmarks`.

The mock takes its actor and native read permission from the server's configured fictional session. It rejects caller-supplied identity fields, invalid origin/header combinations, and mismatched idempotency keys. Preferences are held only in process memory and reset when the local server stops. This helper is not a production identity implementation or database.

Run `node --test bookmarks.test.cjs`. The checks cover personal isolation, root isolation, pinned identity, current approved version resolution, removed access, deletion, concurrent writes, conflicts, idempotency, storage corruption/quota failures, strict live responses, unavailable endpoints, and a real loopback HTTP route with identity/CSRF rejection.
